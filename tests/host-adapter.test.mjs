import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readRuntime, transformFiles, applyRuntime, rollbackRuntime, PROGRAM_FILES, SOURCE_COMMIT } from '../host-adapter/adapter.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const runtime = process.env.WHALEWING_HOST_ADAPTER_BASELINE ?? path.join(repository, '.artifacts/youjin-first-version/runtime');
const original = await readRuntime(runtime);
const transformed = transformFiles(original);
const exec = promisify(execFile);
const runtimeRequire = createRequire(path.join(runtime, 'package.json'));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-host-adapter-'));
  t.after(async () => {
    // 只清理本测试由系统分配的目录，不沿配置路径递归删除。
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('whalewing-host-adapter-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  for (const [file, bytes] of original) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), bytes);
  }
  return root;
}

test('全部产物转换、编码与纯函数幂等', () => {
  assert.equal(transformed.state, 'original');
  assert.equal(transformed.files.size, PROGRAM_FILES.length);
  assert.equal(transformFiles(new Map([...original, ...transformed.files])).state, 'adapted');
  for (const [file, bytes] of transformed.files) {
    assert.notDeepEqual(bytes, original.get(file));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.ok(!text.includes('\uFFFD') && !text.includes('\r'));
  }
});

test('版本、哈希、缺失和混合状态拒收', () => {
  for (const alter of [
    input => input.set('package.json', Buffer.from('{"version":"0.1.7"}')),
    input => input.set(PROGRAM_FILES[0], Buffer.from('未知文件')),
    input => input.delete(PROGRAM_FILES.at(-1)),
    input => input.set(PROGRAM_FILES[0], transformed.files.get(PROGRAM_FILES[0])),
  ]) {
    const input = new Map(original);
    alter(input);
    assert.throws(() => transformFiles(input));
  }
});

test('停用副本应用、重复应用和完整回滚', async t => {
  const root = await fixture(t);
  const result = await applyRuntime(root);
  assert.equal(result.state, 'original');
  assert.equal((await applyRuntime(root)).state, 'adapted');
  assert.equal((await rollbackRuntime(root, result.original)).state, 'restored');
  for (const [file, bytes] of original) assert.deepEqual(await fs.readFile(path.join(root, file)), bytes);
  assert.equal((await rollbackRuntime(root, result.original)).state, 'original');
});

test('全部预检在首写前，局部写失败恢复原字节', async t => {
  const root = await fixture(t);
  await fs.appendFile(path.join(root, PROGRAM_FILES.at(-1)), ' ');
  let writes = 0;
  const writer = async (file, bytes) => { writes++; await fs.writeFile(file, bytes); };
  await assert.rejects(applyRuntime(root, { writeFile: writer }), /哈希/);
  assert.equal(writes, 0);
  await fs.writeFile(path.join(root, PROGRAM_FILES.at(-1)), original.get(PROGRAM_FILES.at(-1)));
  await assert.rejects(applyRuntime(root, { writeFile: async (file, bytes) => {
    writes++;
    await fs.writeFile(file, writes === 2 ? bytes.subarray(0, 16) : bytes);
    if (writes === 2) throw new Error('注入磁盘失败');
  } }), /注入磁盘失败/);
  for (const [file, bytes] of original) assert.deepEqual(await fs.readFile(path.join(root, file)), bytes);
});

test('回滚不覆盖未知后续改动，不接纳伪造恢复材料', async t => {
  const root = await fixture(t);
  const result = await applyRuntime(root);
  const changed = PROGRAM_FILES[0];
  await fs.appendFile(path.join(root, changed), '// 用户后来修改');
  await assert.rejects(rollbackRuntime(root, result.original), /哈希/);
  assert.ok((await fs.readFile(path.join(root, changed), 'utf8')).endsWith('// 用户后来修改'));
  await assert.rejects(rollbackRuntime(root, new Map([...original, ...transformed.files])), /不是原始/);
});

test('模式后新增列表插槽，原模式保持 single', () => {
  const text = transformed.files.get(PROGRAM_FILES[0]).toString();
  assert.match(text, /renderSlot\("conversation.hero.agentPreset", \{\}\),\s*renderSlot\("conversation.hero.actions", \{\}\)/);
  assert.match(text, /"conversation.hero.agentPreset": \{\s*kind: "single",\s*scope: "session-maybe"/);
  assert.match(text, /"conversation.hero.actions": \{\s*kind: "list",\s*scope: "session-maybe"/);
});

test('Host、remote 与浏览器实际 schema 保留 false 且拒绝非布尔', () => {
  const z = runtimeRequire('zod').z;
  const schemaName = '_deepseek_ai_dsh_api_session_controller_session_selectModel_parameter_0$schema';
  for (const file of PROGRAM_FILES.filter(file => /dsh-api-session-controller\/lib\/typert\.(host|remote-client)\.js$|dsh-api-remotes\/lib\/client\.js$/.test(file))) {
    const source = transformed.files.get(file).toString();
    const start = source.indexOf('const ' + schemaName + ' =');
    const next = source.indexOf('let _deepseek_ai_dsh_api_session_controller_session_selectModel_result', start);
    const schema = vm.runInNewContext(`let ${schemaName}$value; ${source.slice(start, next)}; ${schemaName}()`, { z, object: z.object, intersection: z.intersection, string: z.string, unknown: z.unknown, boolean: z.boolean });
    for (const saveAsDefault of [false, true, undefined]) {
      const request = { sessionId: 'session', provider: 'provider', model: 'model', ...(saveAsDefault === undefined ? {} : { saveAsDefault }) };
      assert.equal(schema.parse(request).saveAsDefault, saveAsDefault, file);
    }
    assert.equal(schema.safeParse({ sessionId: 's', provider: 'p', model: 'm', saveAsDefault: 'false' }).success, false);
  }
});

test('真实命令体保持校验串行和选择，仅 false 关闭默认保存', async () => {
  const text = transformed.files.get(PROGRAM_FILES[1]).toString();
  const start = text.indexOf('\tasync selectModel(request) {');
  const end = text.indexOf('\n\t/**', start);
  const Command = vm.runInNewContext('(' + 'class { ' + text.slice(start, end) + ' }' + ')', { ReasoningEffortId: value => value });
  for (const value of [false, true, undefined]) {
    const calls = [];
    const command = new Command();
    command.resolveAgent = async () => ({ id: 'session' });
    command.requireModel = async () => calls.push('validate');
    command.agents = {
      serializeImageAdmission: async (_agent, operation) => { calls.push('serialize'); return operation(); },
      selectForNextRequest: (_agent, selected) => calls.push(['selected', selected.model]),
    };
    command.ctx = {
      llm: { resolveCallConfig: async selection => { calls.push('resolve'); return selection; } },
      agentDefaultModel: { saveSelection: async () => calls.push('save') },
    };
    const response = await command.selectModel({ sessionId: 'session', provider: 'p', model: 'm', ...(value === undefined ? {} : { saveAsDefault: value }) });
    assert.equal(response.selected.model, 'm');
    assert.deepEqual(calls.slice(0, 4), ['serialize', 'validate', 'resolve', ['selected', 'm']]);
    assert.equal(calls.includes('save'), value !== false);
  }
});

test('源补丁准确适用于固定提交，全部生成文件可解析', async t => {
  const root = await fixture(t);
  for (const [file, bytes] of transformed.files) {
    const target = path.join(root, file);
    await fs.writeFile(target, bytes);
    await exec(process.execPath, ['--check', target], { timeout: 15_000 });
  }
  const patch = path.join(repository, 'plugins/whalewing/host-adapter/source.patch');
  const text = await fs.readFile(patch, 'utf8');
  assert.ok(!text.includes('\r'), '新源补丁必须保留固定提交的 LF');
  const files = [...text.matchAll(/^--- a\/(.+)$/gm)].map(match => match[1].trim());
  // 清单独立于补丁本身；遗漏整个 owner 不能靠“剩余补丁可应用”通过。
  const owners = {
    'packages/client/ui-conversation/src/client/contract/slots.ts': 'conversation.hero.actions',
    'packages/client/ui-conversation/src/client/apply.ts': 'conversation.hero.actions',
    'packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx': 'conversation.hero.actions',
    'packages/api/session-controller/src/types.ts': 'saveAsDefault',
    'packages/api/session-controller/src/commands.ts': 'saveAsDefault',
    'packages/mcp/mcp-client/src/connection.ts': 'describe()',
    'packages/mcp/mcp-resources/src/index.ts': 'catalog(',
    'packages/extensions/tool-cordis/src/api-catalog.ts': 'describe?',
    'packages/api/session-controller/src/client/index.ts': 'session/before-prompt',
    'packages/api/session-controller/src/client/sessions/session.ts': 'session/before-prompt',
    'packages/client/ui-agent-preset/src/client/seat-store.ts': 'async prepare(signal: AbortSignal)',
    'packages/client/ui-agent-preset/src/client/index.ts': 'session/before-prompt',
    'packages/client/ui-sidebar-right/src/client/service.ts': 'focusPresentation(sessionId',
    'packages/client/ui-sidebar-right/src/client/shell/RightbarRoot.tsx': 'view.selected',
    'packages/client/ui-sidebar-right/src/client/index.ts': 'presentSession',
    'packages/client/ui-sidebar-browser/src/client/index.ts': 'browser.toolbar.actions',
    'packages/client/ui-sidebar-browser/src/client/view/BrowserBody.tsx': 'browser.toolbar.actions',
    'packages/schedule/schedule/src/types.ts': 'ScheduleStateRequest',
    'packages/schedule/schedule/src/storage.ts': "'paused'",
    'packages/schedule/schedule/src/index.ts': 'async setPaused(',
    'packages/schedule/schedule/src/tools.ts': 'const entry =',
    'packages/schedule/schedule/src/domain.ts': "status === 'paused'",
    'packages/client/ui-schedule/src/client/index.ts': 'uiScheduleNavigation',
    'packages/client/ui-schedule/src/client/TaskDetail.tsx': 'expectedStatus',
    'packages/client/ui-schedule/src/client/TaskManagerPage.tsx': 'status.${record.status}',
    'packages/client/ui-schedule/src/client/task-manager-locales.ts': 'status.paused',
  };
  assert.deepEqual([...files].sort(), Object.keys(owners).sort(), '全部原 owner 必须同时存在且不重复');
  for (const file of files) {
    const { stdout } = await exec('git', ['show', `${SOURCE_COMMIT}:${file}`], { cwd: repository, encoding: 'buffer', maxBuffer: 2_000_000, timeout: 15_000 });
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), stdout);
  }
  // 即使测试临时根将来移入工作树，也阻止 git 向上发现仓库并静默跳过路径。
  const patchOptions = { cwd: root, env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(root) }, timeout: 15_000 };
  await exec('git', ['-c', 'core.autocrlf=false', 'apply', '--check', patch], patchOptions);
  await exec('git', ['-c', 'core.autocrlf=false', 'apply', patch], patchOptions);
  const applied = new Map();
  for (const file of files) {
    const bytes = await fs.readFile(path.join(root, file));
    const { stdout: before } = await exec('git', ['show', `${SOURCE_COMMIT}:${file}`], { cwd: repository, encoding: 'buffer', maxBuffer: 2_000_000, timeout: 15_000 });
    assert.notDeepEqual(bytes, before, `补丁必须实际改变文件：${file}`);
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.ok(source.includes(owners[file]), `缺少必要语义：${file} / ${owners[file]}`);
    applied.set(file, source);
    assert.equal(bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])), before.subarray(0, 3).equals(Buffer.from([239, 187, 191])), file);
    assert.equal(bytes.includes(13), before.includes(13), `原换行必须保持：${file}`);
    assert.equal(bytes.at(-1), before.at(-1), `末尾换行必须保持：${file}`);
    assert.ok(!new TextDecoder('utf-8', { fatal: true }).decode(bytes).includes('\uFFFD'));
  }
  const service = applied.get('packages/schedule/schedule/src/index.ts');
  for (const required of ['async pause(', 'async resume(', 'request.expectedStatus !== current.status', 'resolveRecurringOccurrence(record, now)', 'await tasks.put(request.id, { ...current, record, status })']) assert.ok(service.includes(required), required);
  const tool = applied.get('packages/schedule/schedule/src/tools.ts');
  for (const required of ['const entry =', 'const expected = entry', 'expectedStatus:', 'scheduleView(result.record, Date.now(), entry', "'scheduled', 'overdue', 'paused'"]) assert.ok(tool.includes(required), required);
  const sidebar = applied.get('packages/client/ui-sidebar-right/src/client/service.ts');
  assert.ok(sidebar.includes('presentSession(panelId: string') && sidebar.includes('focusPresentation(sessionId: SessionId)'), '两个会话呈现入口都必须保留');
  const ts = createRequire(path.join(repository, 'package.json'))('typescript');
  const reflectionPath = 'packages/extensions/tool-cordis/src/api-catalog.ts';
  const reflected = {};
  const reflectionJs = ts.transpileModule(applied.get(reflectionPath), { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(reflectionJs, { exports: reflected });
  const artifactReflection = vm.runInNewContext(transformed.files.get('node_modules/@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js').toString('utf8').replaceAll('export const ', 'const ').replaceAll('export function ', 'function ') + '\n; ({ SERVICE_API, TYPE_API })');
  const sourceMethods = reflected.SERVICE_API.find(entry => entry.key === 'schedule').methods;
  const artifactMethods = artifactReflection.SERVICE_API.find(entry => entry.key === 'schedule').methods;
  for (const name of ['pause', 'resume']) {
    const sourceMethod = sourceMethods.find(method => method.signature.includes(`async ${name}(`));
    const artifactMethod = artifactMethods.find(method => method.signature.includes(`async ${name}(`));
    assert.ok(sourceMethod && artifactMethod, `源与产物都必须反射 ${name}`);
    assert.deepEqual(JSON.parse(JSON.stringify(sourceMethod)), JSON.parse(JSON.stringify(artifactMethod)));
  }
  const sourceReader = sourceMethods.find(method => method.signature.includes('async readCatalog<'));
  const artifactReader = artifactMethods.find(method => method.signature.includes('async readCatalog<'));
  assert.ok(sourceReader && artifactReader, '本地同步读方法也必须保持公开反射');
  assert.deepEqual(JSON.parse(JSON.stringify(sourceReader)), JSON.parse(JSON.stringify(artifactReader)));
  for (const [name, required] of [['ScheduleStateRequest', 'expectedStatus'], ['ScheduleUpdateRequest', "readonly expectedStatus: 'active' | 'paused'"], ['ScheduleCatalogEntry', "readonly status: 'active' | 'paused' | 'inactive'"]]) {
    const declared = reflected.TYPE_API.find(entry => entry.name === name)?.declaration;
    assert.ok(declared?.includes(required), `源反射缺少 ${name} / ${required}`);
    assert.equal(declared, artifactReflection.TYPE_API.find(entry => entry.name === name)?.declaration, `源与产物反射一致：${name}`);
  }
  const compilerOptions = { noEmit: true, noResolve: true, skipLibCheck: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, types: [] };
  const program = ts.createProgram(files.map(file => path.join(root, file)), compilerOptions);
  assert.deepEqual(program.getSyntacticDiagnostics(), [], '适配源必须可解析');
  // 未提供整个上游依赖图，不把缺模块诊断当作完整类型检查；仍拒绝局部未声明标识符。
  const undefinedNames = program.getSemanticDiagnostics().filter(diagnostic => diagnostic.code === 2304 && diagnostic.file && files.some(file => path.resolve(root, file) === path.resolve(diagnostic.file.fileName)));
  assert.deepEqual(undefinedNames.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), [], '局部源不得引用未声明名字');
  assert.ok(text.split('\n').filter(line => /^[+-](?![+-])/.test(line)).length < 500, '局部补丁不得整文件换行重写');
});

test('连接描述分离真实连接状态与尚存工具归属', () => {
  const source = transformed.files.get('node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js').toString();
  const start = source.indexOf('\t\t\tdescribe() {');
  const end = source.indexOf('\n\t\t\tasync request', start);
  const method = source.slice(start, end).trim().replace(/,$/, '');
  const context = vm.createContext({ disposed: false, client: {}, connectedAt: 42, disposers: new Map([['mcp__hash_tool', () => {}]]) });
  vm.runInContext(`globalThis.provider = ({ ${method} });`, context);
  const read = () => JSON.parse(JSON.stringify(vm.runInContext('provider.describe()', context)));
  assert.deepEqual(read(), { connected: true, tools: ['mcp__hash_tool'] });
  // 关闭重连后 connectedAt 可能保留；只看时间会把已断开的连接误报为可用。
  context.client = undefined;
  assert.deepEqual(read(), { connected: false, tools: ['mcp__hash_tool'] });
  context.client = {};
  context.connectedAt = undefined;
  assert.equal(read().connected, false);
  context.connectedAt = 43;
  context.disposers = new Map([['mcp__new_tool', () => {}]]);
  assert.deepEqual(read(), { connected: true, tools: ['mcp__new_tool'] });
  context.disposed = true;
  assert.equal(read().connected, false);
  context.disposers.clear();
  assert.deepEqual(read(), { connected: false, tools: [] });
});

test('目录使用真实作用域层遮蔽、刷新及释放，不泄露 provider 配置', async t => {
  const { Context } = runtimeRequire('@deepseek-ai/cordis');
  const { ScopedLayers, NamedEntries, createScope } = runtimeRequire('@deepseek-ai/dsh-scope');
  const ctx = new Context();
  const key = {};
  const scoped = createScope(ctx, key);
  t.after(async () => { await scoped.dispose(); await ctx.fiber.dispose(); });
  const layers = new ScopedLayers(() => ({ servers: new NamedEntries(name => new Error(name)), isEmpty() { return this.servers.isEmpty(); } }), () => {});
  const register = (owner, name, provider) => layers.effect(owner, layer => layer.servers.insert(name, provider), { label: '测试目录' });
  let connected = true;
  let tools = ['mcp__global'];
  register(ctx, 'same', { describe: () => ({ connected, tools }), secret: '不可外泄' });
  register(ctx, 'legacy', { request() {} });
  const removeScoped = register(scoped.ctx, 'same', { describe: () => ({ connected: true, tools: ['mcp__scoped'] }) });
  const text = transformed.files.get('node_modules/@deepseek-ai/dsh-mcp-resources/lib/index.js').toString();
  const start = text.indexOf('\tcatalog(scope) {');
  const end = text.indexOf('\n\t/**', start);
  const owner = vm.runInNewContext(`({ ${text.slice(start, end)} })`);
  owner.layers = layers;
  const read = scope => JSON.parse(JSON.stringify(owner.catalog(scope)));
  assert.deepEqual(read(key), [{ name: 'same', connected: true, tools: ['mcp__scoped'] }, { name: 'legacy', connected: false, tools: [] }]);
  connected = false;
  tools = ['mcp__refreshed'];
  assert.deepEqual(read(undefined)[0], { name: 'same', connected: false, tools: ['mcp__refreshed'] });
  const copy = owner.catalog();
  copy[0].tools.push('污染');
  assert.deepEqual(tools, ['mcp__refreshed']);
  removeScoped();
  assert.deepEqual(read(key)[0], { name: 'same', connected: false, tools: ['mcp__refreshed'] });
});

function preparationSession(timers = { setTimeout, clearTimeout }) {
  const text = transformed.files.get('node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/session.js').toString();
  const begin = text.indexOf('async preparePrompt(signal) {');
  const end = text.indexOf('\n    /**', text.indexOf('async prompt(content, mode, signal, requestId) {', begin));
  const Class = vm.runInNewContext(`(class { ${text.slice(begin, end)} })`, {
    AbortController, Error, Promise, ...timers,
    RemoteError: class extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } },
    resolvedClientTimeZone: () => 'Asia/Shanghai', randomUUID: () => 'request',
  });
  const session = new Class();
  const requests = [];
  const retired = [];
  Object.assign(session, {
    sessionId: 'session', preparationLifetime: new AbortController(),
    options: {}, blankBit: true, notifier: { markDirty() {} },
    retireFailedSubmission: id => retired.push(id),
    remote: { session: { prompt: async value => { requests.push(value); return { ok: true, value: { accepted: true } }; } } },
  });
  return { session, requests, retired };
}

test('准备按作用域顺序执行，完成后才发原请求且保留身份', async () => {
  const { Context } = runtimeRequire('@deepseek-ai/cordis');
  const ctx = new Context();
  const { session, requests } = preparationSession();
  const order = [];
  const ready = Promise.withResolvers();
  ctx.on('session/before-prompt', async ({ signal }) => { signal.throwIfAborted(); order.push('expert'); });
  ctx.on('session/before-prompt', async ({ signal }) => { order.push('mode'); await ready.promise; signal.throwIfAborted(); }, { prepend: true });
  session.actx = ctx;
  const pending = session.prompt([{ type: 'text', text: '原问题' }], 'queue', undefined, 'same-request');
  assert.deepEqual(order, ['mode']);
  assert.equal(requests.length, 0);
  ready.resolve();
  assert.equal((await pending).ok, true);
  assert.deepEqual(order, ['mode', 'expert']);
  assert.equal(requests[0].requestId, 'same-request');
  assert.equal(requests[0].content[0].text, '原问题');
  await ctx.fiber.dispose();
});

test('准备失败、非法返回、调用取消与绑定最终释放都不发prompt并回收echo', async () => {
  for (const reason of ['failure', 'return', 'caller', 'release']) {
    const { session, requests, retired } = preparationSession();
    const deferred = Promise.withResolvers();
    let received;
    session.actx = { events: { dispatch: (strategy, [subject, event]) => {
      assert.equal(strategy, 'serial');
      assert.equal(subject, session.actx);
      assert.equal(event, 'session/before-prompt');
      return [async payload => {
      received = payload.signal;
      if (reason === 'failure') throw new Error('专家未就绪');
      if (reason === 'return') return true;
      await deferred.promise;
      payload.signal.throwIfAborted();
      }];
    } } };
    const caller = new AbortController();
    const pending = session.prompt([], 'queue', caller.signal, 'echo');
    if (reason === 'caller') caller.abort();
    if (reason === 'release') { session.preparationLifetime.abort(); session.actx = undefined; }
    const result = await pending;
    assert.equal(result.ok, false, reason);
    assert.equal(requests.length, 0, reason);
    assert.deepEqual(retired, ['echo']);
    assert.equal(session.promptError.op, 'send');
    if (reason === 'caller' || reason === 'release') assert.equal(received.aborted, true);
    deferred.resolve();
  }
});

test('15秒deadline拒绝晚到准备，计时器与abort监听有界清理', async () => {
  let fire;
  let cleared = 0;
  const { session, requests } = preparationSession({
    setTimeout: (callback, ms) => { assert.equal(ms, 15000); fire = callback; return 1; },
    clearTimeout: () => cleared++,
  });
  const late = Promise.withResolvers();
  let captured;
  session.actx = { events: { dispatch: () => [async ({ signal }) => { captured = signal; await late.promise; signal.throwIfAborted(); }] } };
  const pending = session.prompt([], 'queue');
  fire();
  assert.equal((await pending).ok, false);
  assert.equal(captured.aborted, true);
  assert.equal(cleared, 1);
  late.resolve();
  await Promise.resolve();
  assert.equal(requests.length, 0);
});

test('普通无监听器与无绑定调用维持原发送，作用域替换拒收', async () => {
  const { Context } = runtimeRequire('@deepseek-ai/cordis');
  const ctx = new Context();
  for (const actx of [undefined, ctx]) {
    const { session, requests } = preparationSession();
    session.actx = actx;
    assert.equal((await session.prompt([], 'queue')).ok, true);
    assert.equal(requests.length, 1);
  }
  const { session, requests } = preparationSession();
  session.actx = { events: { dispatch: () => [async () => { session.actx = {}; }] } };
  assert.equal((await session.prompt([], 'queue')).ok, false);
  assert.equal(requests.length, 0);
  await ctx.fiber.dispose();
});

function modeSeat(select) {
  const text = transformed.files.get('node_modules/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js').toString();
  const start = text.indexOf('var AgentPresetSeatController = class');
  const end = text.indexOf('\n\t\t//#endregion', start);
  const store = value => ({ getSnapshot: () => value, set: next => { value = next; } });
  const Class = vm.runInNewContext(text.slice(start, end) + '; AgentPresetSeatController', {
    _deepseek_ai_dsh_client_store: { createSnapshotStore: store },
    createSnapshotStore: store, INITIAL$1: { options: [], current: '', error: null, busy: false, introduce: false },
    INITIAL: { options: [], current: '', error: null, busy: false, introduce: false }, Error, Promise,
  });
  const listeners = new Set();
  const current = { id: 's', blank: true, projectionValues: { agentPreset: 'standard' } };
  const ctx = {
    configForms: { developerTools: { enabled: { getSnapshot: () => true } } },
    remote: { agentPresets: { select } },
    sessions: { list: { subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } } },
  };
  const staged = { id: 'research', introduce: false };
  return { seat: new Class(ctx, () => current, staged), current, staged, listeners };
}

test('模式准备等待共享选择及投影，不把busy或字符串当成功', async () => {
  const selected = Promise.withResolvers();
  let calls = 0;
  const { seat, current, staged, listeners } = modeSeat(async () => { calls++; return selected.promise; });
  const controller = new AbortController();
  const first = seat.prepare(controller.signal);
  const second = seat.prepare(controller.signal);
  assert.equal(calls, 1);
  selected.resolve({ ok: true, value: 'research' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(listeners.size, 2);
  current.projectionValues.agentPreset = 'research';
  for (const listener of [...listeners]) listener();
  await Promise.all([first, second]);
  assert.equal(listeners.size, 0);
  assert.equal(staged.id, undefined);
  const broken = modeSeat(async () => ({ ok: false, error: { details: {}, message: '宿主拒绝模式' } }));
  await assert.rejects(broken.seat.prepare(controller.signal), /宿主拒绝模式/);
  assert.equal(broken.staged.id, 'research');
});

test('模式投影等待响应取消，不在晚到选择后进入下一准备', async () => {
  const { seat, listeners } = modeSeat(async () => ({ ok: true, value: 'research' }));
  const controller = new AbortController();
  const waiting = seat.prepare(controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(listeners.size, 1);
  controller.abort(new Error('取消'));
  await assert.rejects(waiting, /取消/);
  assert.equal(listeners.size, 0);
});

test('真实Client scope只执行本generation与全局处理器，卸载即释放', async () => {
  const { Context } = runtimeRequire('@deepseek-ai/cordis');
  const { createScope } = await import(pathToFileURL(path.join(runtime, 'node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/client/scope.js')).href);
  const ctx = new Context();
  const first = createScope(ctx, 'first');
  const other = createScope(ctx, 'other');
  const calls = [];
  const off = ctx.on('session/before-prompt', async () => { calls.push('global'); });
  first.ctx.on('session/before-prompt', async () => { calls.push('first'); });
  other.ctx.on('session/before-prompt', async () => { calls.push('other'); });
  const { session, requests } = preparationSession();
  session.actx = first.ctx;
  await session.prompt([], 'queue');
  assert.deepEqual(calls, ['global', 'first']);
  off();
  calls.length = 0;
  await session.prompt([], 'queue');
  assert.deepEqual(calls, ['first']);
  assert.equal(requests.length, 2);
  await first.fiber.dispose();
  await other.fiber.dispose();
  await ctx.fiber.dispose();
});

test('原生模式前置处理器不消费助手、后台或子代理的暂存选择', async () => {
  const text = transformed.files.get('node_modules/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js').toString();
  const start = text.indexOf("scope.on('session/before-prompt'");
  const end = text.indexOf('\nconst seatInjected', start);
  let listener;
  let prepared = 0;
  let subagent = null;
  let main = 1;
  const summary = { blank: true };
  const binding = { session: { getSnapshot: () => ({ subagent }) } };
  const ctx = { sessions: {
    binding: () => binding,
    list: { getSnapshot: () => ({ byId: { s: summary } }) },
    retainInfo: () => ({ getSnapshot: () => ({ retainedBy: { mainView: main } }) }),
  } };
  vm.runInNewContext(text.slice(start, end), {
    ctx, seatFor: () => ({ prepare: async () => { prepared++; } }),
    scope: { on: (name, fn, options) => { assert.equal(name, 'session/before-prompt'); assert.equal(options.prepend, true); listener = fn; } },
  });
  const payload = { sessionId: 's', signal: new AbortController().signal };
  await listener(payload);
  assert.equal(prepared, 1);
  main = 0;
  await listener(payload);
  main = 1;
  subagent = { address: {} };
  await listener(payload);
  subagent = null;
  summary.blank = false;
  await listener(payload);
  assert.equal(prepared, 1);
});

test('真实Cordis处理器的false/null/其它非void值一律拒收且不执行下一项', async () => {
  const { Context } = runtimeRequire('@deepseek-ai/cordis');
  for (const value of [false, null, true, 0, '', '拒绝', {}, []]) {
    const ctx = new Context();
    const { session, requests, retired } = preparationSession();
    let next = 0;
    ctx.on('session/before-prompt', async () => value);
    ctx.on('session/before-prompt', async () => { next++; });
    session.actx = ctx;
    const response = await session.prompt([], 'queue', undefined, 'echo');
    assert.equal(response.ok, false, String(value));
    assert.match(response.error.message, /必须返回 void/);
    assert.equal(next, 0);
    assert.equal(requests.length, 0);
    assert.deepEqual(retired, ['echo']);
    await ctx.fiber.dispose();
  }
});

test('取消后即使上一处理器忽略信号并晚到成功也不启动下一处理器', async () => {
  const { Context } = runtimeRequire('@deepseek-ai/cordis');
  const ctx = new Context();
  const { session, requests } = preparationSession();
  const late = Promise.withResolvers();
  let next = 0;
  ctx.on('session/before-prompt', async () => { await late.promise; });
  ctx.on('session/before-prompt', async () => { next++; });
  session.actx = ctx;
  const caller = new AbortController();
  const pending = session.prompt([], 'queue', caller.signal);
  caller.abort();
  assert.equal((await pending).ok, false);
  late.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(next, 0);
  assert.equal(requests.length, 0);
  await ctx.fiber.dispose();
});
