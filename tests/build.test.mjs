import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import yaml from 'js-yaml';
import { z } from 'zod';
import { createPatch, renderArtifacts, patchSchema } from '../scripts/build.mjs';
import { roles } from '../content/roles.js';
import { dailyLearning } from '../features/cards/learning-cards.js';
import { aiWebEntries } from '../features/ai-web/catalog.js';
import { parts } from '../features/index.js';
import { fixture, emptyGraph } from './client-fixture.mjs';

// 产物只有不可变文本；业务断言共享本次真实生成值，确定性仍另做一次独立完整生成。
const artifacts = Object.freeze(renderArtifacts());

test('构建确定且磁盘生成物与当前客户端及共享契约一致', async () => {
  assert.deepEqual(artifacts, renderArtifacts());
  for (const [name, text] of Object.entries(artifacts)) {
    const disk = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
    assert.equal(disk, text, `${name} 需要重新生成`);
    assert.ok(!text.includes('\r') && !text.includes('\uFFFD') && !text.startsWith('\uFEFF'));
    assert.ok(!/[ \t]+$/m.test(text), `${name} 含行尾空白`);
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
  }
});

test('内联校验器转义模板后仍保留原生对象校验语义', () => {
  // 执行实际生成闭包，覆盖 Zod 动态生成的可选字段、缺失字段与嵌套错误路径。
  const source = artifacts['client.js'].replace(/\nreturn shell\.createShell\(/, '\nreturn validator;\nvoid shell.createShell(');
  let entry;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => { entry = value; } } } });
  const bundled = entry.factory(() => { throw new Error('校验器不应读取宿主模块表'); }).z;
  const schema = api => api.object({ required: api.string(), optional: api.string().optional(), nested: api.object({ count: api.number() }).optional() });
  const native = schema(z), inline = schema(bundled);
  for (const input of [{ required: '鲸翼' }, { required: '鲸翼', optional: undefined }, {}, { required: 1, nested: { count: '2' } }]) {
    const result = inline.safeParse(input), expected = native.safeParse(input);
    assert.equal(result.success, expected.success);
    assert.equal(JSON.stringify(result.success ? result.data : result.error.issues), JSON.stringify(expected.success ? expected.data : expected.error.issues));
    if (result.success) assert.equal(Object.hasOwn(result.data, 'optional'), Object.hasOwn(expected.data, 'optional'));
  }
});

test('专家与原生模式正交，原生行只由组成清单生成', () => {
  const rows = createPatch()[0].insert;
  assert.deepEqual(rows, [{ id: 'whalewing', name: 'dsh-whalewing' }, ...parts.filter(part => part.kind === 'optional').map(part => ({ id: part.rowId, name: `dsh-whalewing/${part.id}` }))]);
  assert.equal(roles.length, 7);
  const text = JSON.stringify(createPatch());
  for (const forbidden of ['preset-whalewing', 'dsh-agent-preset', 'persona', 'dsh-tool-fs', 'dsh-tool-pwsh', 'dsh-tool-subagent']) assert.ok(!text.includes(forbidden));
});

test('不覆盖宿主mode、模型路由或重复插入schedule与子代理服务', () => {
  const text = JSON.stringify(createPatch());
  for (const forbidden of ['agent-preset-registry', 'preset-standard', 'dsh-schedule', 'dsh-time-context', 'dsh-client-ui-schedule', 'dsh-subagent-spawn-in-process', 'dsh-subagent-fork-in-process', 'apiKey', 'baseURL', 'agentOptions']) assert.ok(!text.includes(forbidden));
});

test('Loader补丁可往返，不携带旧preset平台表达式', () => {
  const artifact = artifacts['cordis.patch.yml'];
  assert.ok(!artifact.includes('!!js'));
  assert.deepEqual(yaml.load(artifact, { schema: patchSchema }), createPatch());
});

test('生成Client只注册延迟工厂，模块加载阶段不访问DOM或创建会话', () => {
  const registrations = [];
  vm.runInNewContext(artifacts['client.js'], { window: { __ModuleLoader__: { load: (entry) => registrations.push(entry) } } });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].id, 'dsh-whalewing');
  const requests = [];
  const plugin = registrations[0].factory((name) => { requests.push(name); return {}; });
  assert.deepEqual(requests, ['react']);
  assert.equal(typeof plugin.apply, 'function');
  assert.ok(plugin.inject.includes('remote.commands') && plugin.inject.includes('remote.session'));
});

test('真实生成知识视图自带唯一D3闭包及全部许可，推进画布不修改有向响应', async t => {
  const source = artifacts['client.js'];
  for (const name of ['d3-force', 'd3-quadtree', 'd3-dispatch', 'd3-timer']) assert.ok(source.includes(`内联 ${name} 许可`));
  assert.ok(!source.includes('createGraphCanvas.toString') && !source.includes('graphRenderer'));
  const graph = { ...emptyGraph(), total: 2, nodes: ['a', 'b'].map(path => ({ kind: 'note', path, title: path, degree: 1, readOnly: false })), edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }] };
  const before = structuredClone(graph), frames = new Map(), listeners = new Set(), globals = new Map(), intervals = new Set();
  const nativeSetInterval = globalThis.setInterval, nativeClearInterval = globalThis.clearInterval;
  let nextFrame = 0, segments = 0, arcs = [], stopped = 0;
  const install = (key, value) => { globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  install('requestAnimationFrame', callback => { const id = ++nextFrame; frames.set(id, callback); return id; });
  install('cancelAnimationFrame', id => frames.delete(id));
  install('getComputedStyle', () => ({ getPropertyValue: name => name.includes('bg') ? '#fff' : '#333' }));
  install('ResizeObserver', class { observe() {} disconnect() { stopped++; } });
  install('setInterval', (...args) => { const id = nativeSetInterval(...args); intervals.add(id); return id; });
  install('clearInterval', id => { intervals.delete(id); return nativeClearInterval(id); });
  let f;
  const flushLibraryFrames = () => {
    // fixture 的 timeout 与全局 rAF 分属两条队列；D3 的已停止 timer 要经过 wake/nap 才释放校时 interval。
    let runs = 0;
    for (;;) {
      const next = [...(f?.timers ?? [])].find(([, timer]) => timer.delay === 17);
      if (!next) return runs;
      assert.ok(runs++ < 20, 'D3库级帧应在有限次调度内排空');
      const [id, timer] = next; f.timers.delete(id); timer.fn();
    }
  };
  t.after(async () => {
    try { f?.unmount(); for (const dispose of f?.disposed ?? []) await dispose(); flushLibraryFrames(); assert.equal(intervals.size, 0, '库级定时器必须由真实清理路径释放'); }
    finally {
      // 断言失败也仅收拾本测试创建的句柄，保留失败结果且不影响其它测试资源。
      for (const id of intervals) nativeClearInterval(id);
      for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    }
  });
  f = await fixture({ clientSource: source, knowledge: async input => ({ ok: true, value: input.action === 'graph' ? graph : { initialized: true, root: 'fixture-vault' } }) });
  Object.assign(f.document, { hidden: false, addEventListener(_name, fn) { listeners.add(fn); }, removeEventListener(_name, fn) { listeners.delete(fn); } });
  const context = {
    setTransform() {}, clearRect() { segments = 0; arcs = []; }, beginPath() {}, moveTo() {}, lineTo() { segments++; }, stroke() {}, fill() {},
    arc(x, y, radius) { assert.ok([x, y, radius].every(Number.isFinite)); arcs.push({ x, y, radius }); },
    measureText(text) { return { width: text.length * 7 }; }, strokeText() {}, fillText() {},
  };
  const element = { style: {}, width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ width: 900, height: 560, left: 0, top: 0 }),
    addEventListener(_name, fn) { listeners.add(fn); }, removeEventListener(_name, fn) { listeners.delete(fn); }, hasPointerCapture: () => false };
  // 从生产生成工作台进入知识页，只有光栅和帧调度被替换；不再构建第二份测试图谱闭包。
  await tabButton(f, 'knowledge').props.onClick();
  const canvas = treeNodes(f.render()).find(node => node.type === 'canvas'); assert.ok(canvas, '知识页真实挂载图谱');
  canvas.props.ref.current = element; f.flushEffects();
  assert.equal(intervals.size, 1, '真实D3创建一条校时interval');
  assert.ok(flushLibraryFrames() >= 2, '执行实际D3的时钟帧和wake清理帧');
  assert.equal(intervals.size, 0, 'stop后的wake/nap实际释放interval');
  let ticks = 0;
  while (frames.size && ticks++ < 500) { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(); }
  assert.equal(frames.size, 0, '真实D3在有界帧数内收敛');
  assert.equal(segments, 1, '有向互引只绘制一条物理边');
  assert.equal(arcs.length, 2);
  assert.equal(treeNodes(f.render()).find(node => node.type === 'canvas').props['aria-busy'], false);
  assert.deepEqual(graph, before);
  f.unmount(); assert.equal(listeners.size, 0); assert.equal(stopped, 1);
});

test('生成物不包含机器安装路径或任何用户知识正文', () => {
  const output = Object.values(artifacts).join('\n');
  for (const fragment of ['E:\\gwenliu', 'C:\\Users\\', 'D:\\Programs\\', 'second-brain', '.artifacts\\whalewing']) assert.ok(!output.includes(fragment));
  assert.ok(!output.includes('LICENSE_BLOB') && !output.includes('ENCRYPT_KEY'));
  assert.match(output, /Copyright \(c\) 2025 Colin McDonnell/);
});

const remoteNames = ['whalewingWorkbench', 'whalewingExperts', 'whalewingKnowledge', 'whalewingSkills', 'whalewingAutomation', 'whalewingAiWeb', 'whalewingCards', 'whalewingModelWorld'];
const treeNodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(treeNodes) : [tree, ...treeNodes(tree.props?.children)];
const tabButton = (f, id) => {
  const button = treeNodes(f.render()).find(node => node.type === 'button' && node.props['data-tab'] === (parts.find(part => part.id === id)?.label || id));
  assert.ok(button, `页签 ${id} 保持可达`); return button;
};
async function releaseFixture(f, order) {
  f.unmount();
  for (const dispose of f.disposed) await dispose();
  for (const dispose of f.disposed) await dispose();
  const mounted = order.filter(value => value.startsWith('mount:')).map(value => value.slice(6)).sort();
  const unmounted = order.filter(value => value.startsWith('unmount:')).map(value => value.slice(8)).sort();
  assert.deepEqual(unmounted, mounted, '每次成功挂载恰好释放一次，重复清理不重复释放');
  for (const entries of f.registrations.values()) assert.equal(entries.length, 0);
  assert.equal(f.triggerSources.size, 0);
  assert.equal(f.timers.size, 0);
}

test('真实生成Client自带严格校验器，各功能独立挂接且资源随所属功能释放', async () => {
  const order = [];
  const f = await fixture({ clientSource: artifacts['client.js'], mount(contribution) {
      const descriptor = contribution.descriptors[0];
      const services = { manageSkills: 'whalewingSkills', manageAutomation: 'whalewingAutomation', manageNews: 'whalewingCards', manageModelWorld: 'whalewingModelWorld', manageAiWeb: 'whalewingAiWeb' };
      const service = services[descriptor.method] ?? descriptor.namespace;
      if (Object.values(services).includes(service)) assert.equal(descriptor.namespace, service);
      if (service === 'whalewingWorkbench') {
        assert.deepEqual(contribution.descriptors.map(item => item.method), ['features', 'watchFeatures', 'retryBase']);
        const snapshot = { revision: 0, features: parts.map((part, index) => ({ instance: index + 1, id: part.id, kind: part.kind, api: 1, package: 'dsh-whalewing', skills: [] })) };
        for (const item of contribution.descriptors) {
          assert.equal(item.result.create().safeParse(snapshot).success, true);
          assert.equal(item.result.create().safeParse({ ...snapshot, caller: 'human' }).success, false);
        }
        order.push(`mount:${service}`);
        return () => order.push(`unmount:${service}`);
      }
      const codec = contribution.descriptors[0].parameters[0].codec.create();
      const action = { whalewingKnowledge: 'status', whalewingAutomation: 'catalog', whalewingModelWorld: 'status' }[service] ?? 'list';
      assert.ok(['whalewingKnowledge', 'whalewingExperts', ...Object.values(services)].includes(service));
      assert.equal(codec.safeParse({ action }).success, true);
      assert.equal(codec.safeParse({ action, caller: 'human' }).success, false);
      const result = descriptor.result.create();
      if (service === 'whalewingAiWeb') {
        const save = { action: 'save', id: 'custom-01234567-89ab-4cde-8123-456789abcdef', expectedRevision: 0, entry: { name: '测试入口', url: 'https://example.org/', description: '', avatar: null } };
        assert.equal(codec.safeParse(save).success, true);
        assert.equal(codec.safeParse({ ...save, entry: { ...save.entry, url: 'javascript:alert(1)' } }).success, false);
        assert.equal(codec.safeParse({ action: 'status' }).success, false);
        assert.equal(result.safeParse({ entries: aiWebEntries }).success, true);
        assert.equal(result.safeParse({ entries: aiWebEntries.map(item => ({ ...item, caller: 'human' })) }).success, false);
      }
      if (service === 'whalewingAutomation') {
        const create = { action: 'create', sessionId: 'fixture-task', purpose: 'knowledge', spec: { daily: { time: '09:00:00', time_zone: 'Asia/Shanghai' } }, workspaceScope: { mode: 'all', excludedWorkspaceIds: ['excluded-workspace'] } };
        assert.equal(codec.safeParse(create).success, true);
        assert.equal(codec.safeParse({ ...create, workspaceScope: { mode: 'selected', workspaceIds: ['chosen-workspace'] } }).success, true);
        assert.equal(codec.safeParse({ ...create, workspaceScope: { mode: 'selected', workspaceIds: [] } }).success, false);
        assert.equal(codec.safeParse({ ...create, workspaceScope: { mode: 'all', excludedWorkspaceIds: ['duplicate', 'duplicate'] } }).success, false);
      }
      if (service === 'whalewingCards') {
        // 真实正文 owner 生成完整卡片，确保浏览器内联校验器与服务端字段保持一致。
        const home = { reports: [], learning: dailyLearning(Date.parse('2026-10-12T00:00:00Z')) };
        assert.equal(result.safeParse(home).success, true);
        for (const field of ['article', 'sections', 'recommendation', 'source']) {
          const incomplete = structuredClone(home); delete incomplete.learning.cards[0][field];
          assert.equal(result.safeParse(incomplete).success, false, `缺少 ${field} 的卡片必须拒收`);
        }
        const incomplete = structuredClone(home); delete incomplete.learning.context;
        assert.equal(result.safeParse(incomplete).success, false);
      }
      order.push(`mount:${service}`);
      return () => order.push(`unmount:${service}`);
  } });
  try {
    assert.ok(f.entries.has('main'));
    assert.deepEqual(order.map(value => value.slice(6)).sort(), [...remoteNames].sort());
    for (const part of parts) assert.equal(f.ctx.whalewingWorkbench.internal.featureProblem(part.id), null, part.id);
    await tabButton(f, 'knowledge').props.onClick();
    assert.ok(f.calls.some(([kind, input]) => kind === 'knowledge' && input.action === 'graph'));
    assert.equal(order.some(value => value.startsWith('unmount:')), false);
  } finally { await releaseFixture(f, order); }
});

/** 功能挂载失败只隔离自身；成功的兄弟契约一直存活，重试不重复挂载兄弟。 */
async function assertGeneratedFailureIsolation(id, namespace, message) {
  const order = []; let fail = true;
  const f = await fixture({ clientSource: artifacts['client.js'], preloadExperts: false, mount(contribution) {
    const descriptor = contribution.descriptors[0];
    if (descriptor.namespace === namespace && fail) throw new Error(message);
    order.push(`mount:${descriptor.namespace}`);
    return () => order.push(`unmount:${descriptor.namespace}`);
  } });
  try {
    const core = f.ctx.whalewingWorkbench.internal;
    assert.ok(f.entries.has('main'));
    assert.deepEqual(order.map(value => value.slice(6)).sort(), remoteNames.filter(name => name !== namespace).sort());
    assert.equal(core.featureProblem(id).error, message);
    for (const part of parts.filter(part => part.id !== id)) assert.equal(core.featureProblem(part.id), null, `${part.id} 不受兄弟失败影响`);
    // 失败页没有刷新处理器；切走后由外壳结束本次进入等待。
    const blockedEntry = tabButton(f, id).props.onClick();
    assert.ok(treeNodes(f.render()).some(node => node.props.role === 'alert' && treeNodes(node).some(child => child.props.children?.includes(message))));
    await tabButton(f, 'knowledge').props.onClick();
    assert.ok(f.calls.some(([kind, input]) => kind === 'knowledge' && input.action === 'graph'), '兄弟页面走真实调用链');
    await blockedEntry;
    assert.equal(core.snapshot().tab, 'knowledge');
    assert.equal(order.some(value => value.startsWith('unmount:')), false, '失败不释放兄弟功能');
    fail = false;
    await core.retryFeature(id); await f.settlePlugins();
    assert.equal(core.featureProblem(id), null);
    await tabButton(f, id).props.onClick();
    assert.equal(core.snapshot().tab, id);
    assert.equal(treeNodes(f.render()).some(node => node.props.children?.includes(message)), false, '恢复后真实功能组件取代失败入口');
    assert.deepEqual(order.map(value => value.slice(6)).sort(), [...remoteNames].sort());
  } finally { await releaseFixture(f, order); }
}

test('专家Remote挂载失败只隔离专家依赖，核心与知识等兄弟仍可用且可独立重试', async () => {
  await assertGeneratedFailureIsolation('experts', 'whalewingExperts', '专家契约加载失败');
});

test('AI网页Remote挂载失败只隔离AI网页，核心与兄弟仍可用且可独立重试', async () => {
  await assertGeneratedFailureIsolation('ai-web', 'whalewingAiWeb', 'AI网页契约加载失败');
});

test('分发清单只包含运行内容与公开扩展资料，不将含隐私检测样例的测试封装进去', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.files, ['index.js', 'client.js', 'client.toolbox.js', 'client.model-world.js', 'src', 'content/roles.js', 'content/skills', 'content/learning', 'content/model-world', 'content/avatars', 'content/utilities', 'content/vault', 'cordis.patch.yml', 'README.md', 'COMPATIBILITY.md', 'EXTENDING.md', 'MAINTAINING.md', 'examples/feature-starter', 'examples/stateful-feature', 'LICENSE', 'NOTICE', 'art/brand', 'features', 'locale']);
  assert.ok(!manifest.files.some(item => item === 'content' || item.includes('test')));
  // 示例的独立测试属于可复制开发材料；主项目测试和本地依赖仍不分发。
  const exampleFiles = await readdir(new URL('../examples/feature-starter/', import.meta.url), { recursive: true });
  assert.deepEqual(exampleFiles.map(name => name.replaceAll('\\', '/')).sort(), [
    'LICENSE', 'README.md', 'client.js', 'cordis.patch.yml', 'host.js', 'icon.svg', 'identity.js',
    'locale', 'locale/en.json', 'locale/zh.json', 'package.json', 'scripts', 'scripts/build.mjs', 'src', 'src/client.js', 'tests', 'tests/template.test.mjs',
  ].sort());
  const statefulFiles = await readdir(new URL('../examples/stateful-feature/', import.meta.url), { recursive: true });
  assert.deepEqual(statefulFiles.map(name => name.replaceAll('\\', '/')).sort(), [
    'LICENSE', 'README.md', 'client.js', 'contract.js', 'store.js', 'cordis.patch.yml', 'host.js', 'icon.svg', 'identity.js',
    'locale', 'locale/en.json', 'locale/zh.json', 'package.json', 'scripts', 'scripts/build.mjs', 'src', 'src/client.js', 'tests', 'tests/stateful.test.mjs',
  ].sort());
});

test('技能Remote挂载失败只隔离技能，核心与兄弟仍可用且可独立重试', async () => {
  await assertGeneratedFailureIsolation('skills', 'whalewingSkills', '技能契约加载失败');
});
