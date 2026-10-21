import test from 'node:test';
import assert from 'node:assert/strict';
import Cards from '../features/cards/host.js';
import { controllerFixture } from './session-controller-fixture.mjs';
import { fixture } from './client-fixture.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { isExactProjection, requireExactProjection, assertCreatedSession } from '../src/session-projection.js';
import * as Cordis from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { TYPERT_REMOTE as commandRemote } from '@deepseek-ai/dsh-commands/remote';

// 恢复调用使用当前真实浏览器分发物，不用Node入口或宽松远程桩替代参数绑定。
const browserModules = new Map();
for (const name of ['@deepseek-ai/dsh-api-gateway', '@deepseek-ai/dsh-client-connection']) {
  const packageUrl = new URL(import.meta.resolve(name + '/package.json'));
  const face = JSON.parse(await readFile(packageUrl, 'utf8')).exports['./client'];
  const source = await readFile(new URL(face.browser ?? face.default, packageUrl), 'utf8');
  let registration;
  new Function('window', source)({ __ModuleLoader__: { load(entry) {
    assert.equal(registration, undefined); assert.equal(entry.id, name);
    registration = entry;
  } } });
  browserModules.set(name, registration.factory(dependency => {
    assert.equal(dependency, '@deepseek-ai/cordis');
    return Cordis;
  }));
}
const ClientGateway = browserModules.get('@deepseek-ai/dsh-api-gateway');
const { installConnection } = browserModules.get('@deepseek-ai/dsh-client-connection');
const { Context } = Cordis;

test('完整原生Controller创建、精确投影与原ID恢复', async t => {
  const h = await controllerFixture(t);
  const result = await h.create('ordinary');
  assert.equal(result.sessionId, 'ordinary');
  const projection = await h.projection('ordinary');
  assert.equal(isExactProjection(projection), true);
  assert.equal(projection.asOfSeq, -1);
  assert.equal(projection.values.sessionListMetadata.blank, true);
  assert.equal((await h.ctx.sessionController.resolveAgent('ordinary')).agent.id, 'ordinary');
});

const specification = { purpose: 'custom', spec: { title: '隔离计划', prompt: '输出隔离结果', after_seconds: 3600 } };

/** list使用实际生成绑定；仅载体在进程内接原生lookup，不启动网络服务。 */
async function browser(h, overrides = {}) {
  const client = new Context(), remoteCalls = [];
  let eventStarts = 0, eventStops = 0, eventSignal, connection;
  h.restore(async () => {
    await client.fiber.dispose();
    assert.equal(eventStarts, 1); assert.equal(eventStops, 1);
    assert.equal(eventSignal.aborted, true, '原生stop必须取消握手流');
    assert.equal(connection.generation.getSnapshot(), undefined);
    assert.equal(connection.state.getSnapshot(), undefined);
  });
  new TypertRegistry(client);
  installConnection(client, { interactions: 'answer', transport: { ownsHost: true,
    fetch() { assert.fail('会话恢复夹具不应发起HTTP请求'); },
    createWebSocket() { assert.fail('会话恢复夹具不应创建WebSocket'); },
    rpc: {
      open(route, endpoint, payload, signal, uplink) {
        assert.equal(route, '/api'); assert.equal(endpoint, '$events', '只允许Gateway初始化握手流');
        assert.deepEqual(payload, { args: {} }); assert.equal(uplink, undefined);
        assert.equal(eventStarts++, 0, '恢复测试不应触发连接重试'); eventSignal = signal;
        // 只提供连接所需ready，不制造业务事件；握手流由原生stop取消。
        return (async function* () {
          try {
            yield { type: 'ready', clientId: 'fixture-events', host: { home: h.root } };
            await new Promise(resolve => {
              if (signal.aborted) resolve();
              else signal.addEventListener('abort', resolve, { once: true });
            });
          } finally { eventStops++; }
        })();
      },
      async call(route, endpoint, payload, signal) {
        assert.equal(route, '/api'); assert.equal(endpoint, 'commands/list');
        assert.deepEqual(Object.keys(payload.args), ['agentId']);
        remoteCalls.push({ sessionId: payload.args.agentId, signal });
        try {
          const agent = await h.ctx.typert.lookups.get('agent').resolve(payload.args.agentId);
          return { ok: true, value: h.ctx.commands.list(agent) };
        } catch (error) { return { ok: false, error: { code: error.code, message: error.message, details: error.details } }; }
      },
    },
  } });
  connection = client.connection;
  await client.plugin(ClientGateway);
  const deadline = h.signal();
  await new Promise((resolve, reject) => {
    const finish = error => { unsubscribe(); deadline.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
    const inspect = () => { if (connection.generation.getSnapshot() !== undefined) finish(); };
    const aborted = () => finish(deadline.reason);
    const unsubscribe = connection.generation.subscribe(inspect);
    deadline.addEventListener('abort', aborted, { once: true });
    if (deadline.aborted) aborted(); else inspect();
  });
  assert.equal(connection.generation.getSnapshot().host.home, h.root);
  assert.equal(connection.state.getSnapshot(), 'connected');
  await client.remote.$mount(commandRemote);
  const b = await fixture({
    taskDirectory: h.cwd,
    workspaceState: { items: [{ workspaceId: h.workspace.id, path: h.workspace.path, sessionIds: h.workspace.sessionIds }], archivedSessionIds: h.ctx.workspaceRegistry.archivedSessionIds },
    create: async input => ({ ok: true, value: await h.ctx.sessionController.create(input) }),
    projections: async ({ sessionId }) => ({ ok: true, value: await h.projection(sessionId) }),
    nativeCommandList: (...args) => client.remote.commands.list(...args),
    nativeCommands: async (sessionId, line, args) => {
      const found = await h.ctx.sessionController.resolveAgent(sessionId);
      if (found.error) return { ok: false, error: { code: found.error.code, message: found.error.message, details: found.error.details } };
      return { ok: true, value: await h.ctx.commands.execute(found.agent, line, args, h.signal()) };
    },
    automation: async input => ({ ok: true, value: await h.automationHost.manageAutomation(input, h.signal()) }),
    ...overrides,
  });
  return Object.assign(b, { remoteCalls });
}

test('回执丢失后精确空白原ID恢复，真实认领与Schedule读回后清除pending', async t => {
  const h = await controllerFixture(t); let creates = 0;
  const b = await browser(h, { create: async input => { creates++; await h.ctx.sessionController.create(input); throw new Error('回执丢失'); } });
  await assert.rejects(b.clients.automation.createAutomation(specification, false), /回执丢失/);
  const id = b.clients.automation.pendingAutomation().sessionId;
  assert.equal((await h.projection(id)).values.sessionListMetadata.blank, true);
  await b.clients.automation.createAutomation(specification, true);
  assert.equal(creates, 1); assert.equal(b.clients.automation.pendingAutomation(), null);
  const tasks = await h.ctx.schedule.catalog();
  assert.equal(tasks.length, 1); assert.equal(tasks[0].sessionId, id);
  assert.equal((await h.projection(id)).values.whalewingAutomation, 'custom');
});

test('原生创建在途时null和not-found不证明未接纳，重复检查不重发不丢pending', async t => {
  const h = await controllerFixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  const original = h.ctx.agentPresets.resolve.bind(h.ctx.agentPresets);
  h.ctx.agentPresets.resolve = async id => { entered.resolve(); await release.promise; return original(id); };
  h.restore(() => { h.ctx.agentPresets.resolve = original; release.resolve(); });
  let creates = 0, underlying;
  const b = await browser(h, { create: async input => { creates++; underlying = h.ctx.sessionController.create(input); await entered.promise; throw new Error('连接中断'); } });
  await assert.rejects(b.clients.automation.createAutomation(specification, false), /连接中断/);
  const id = b.clients.automation.pendingAutomation().sessionId;
  assert.equal(await h.projection(id), null);
  assert.equal((await h.ctx.sessionController.resolveAgent(id)).error.code, 'session/not-found');
  for (let i = 0; i < 2; i++) await assert.rejects(b.clients.automation.createAutomation(specification, true), { code: 'SESSION_UNCONFIRMED' });
  assert.equal(creates, 1); assert.equal(b.clients.automation.pendingAutomation().sessionId, id);
  release.resolve(); await underlying;
  await b.clients.automation.createAutomation(specification, true);
  assert.equal(b.clients.automation.pendingAutomation(), null); assert.equal(creates, 1);
});

test('两窗口并发原生create：无工作区条件时复用同ID，成员挂接在途会另建并被拒收', async t => {
  const h = await controllerFixture(t);
  const pair = await Promise.all([h.create('same-id'), h.create('same-id')]);
  assert.deepEqual(pair.map(row => row.sessionId), ['same-id', 'same-id']);
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const original = h.workspace.attachSession.bind(h.workspace);
  let attaching = false;
  h.workspace.attachSession = async id => { if (id === 'attach-pending' && !attaching) { attaching = true; entered.resolve(); await release.promise; } return original(id); };
  h.restore(() => { h.workspace.attachSession = original; release.resolve(); });
  const first = h.ctx.sessionController.create({ sessionId: 'attach-pending', workspaceId: h.workspace.id, agentPreset: 'standard' });
  await entered.promise;
  const exact = await h.projection('attach-pending');
  assert.equal(exact.values.sessionListMetadata.blank, true);
  const second = await h.ctx.sessionController.create({ sessionId: 'attach-pending', workspaceId: h.workspace.id, agentPreset: 'standard' });
  // 工作区挂接尚未完成时原生create可能另建身份；调用方必须拒收额外ID并保留原待处理身份。
  assert.equal(exact.kind, 'sequenced');
  assert.notEqual(second.sessionId, 'attach-pending');
  assert.throws(() => assertCreatedSession(second, 'attach-pending'), { code: 'SESSION_CREATED_DIFFERENT', sessionId: second.sessionId, recovery: 'open' });
  assert.equal((await h.projection(second.sessionId)).values.whalewingAutomation, null);
  release.resolve(); assert.equal((await first).sessionId, 'attach-pending');
  assert.ok(h.workspace.sessionIds.includes('attach-pending'));
  assert.ok(h.ctx.sessions.get(second.sessionId), '额外会话保留，不自动删除');
});

test('已归档pending在真实Workspace保持归档，不create、不认领，取消归档后原ID恢复', async t => {
  const h = await controllerFixture(t); let creates = 0;
  const b = await browser(h, { create: async input => { creates++; await h.ctx.sessionController.create(input); throw new Error('丢失'); } });
  await assert.rejects(b.clients.automation.createAutomation(specification, false), /丢失/);
  const id = b.clients.automation.pendingAutomation().sessionId;
  await h.ctx.workspaceRegistry.archiveSession(id);
  b.ctx.workspaces.list.set({ items: [], archivedSessionIds: h.ctx.workspaceRegistry.archivedSessionIds });
  await assert.rejects(b.clients.automation.createAutomation(specification, true), { code: 'SESSION_ARCHIVED' });
  assert.equal(creates, 1); assert.equal(b.clients.automation.pendingAutomation().sessionId, id);
  assert.equal((await h.projection(id)).values.whalewingAutomation, null);
  await h.ctx.workspaceRegistry.unarchiveSession(id);
  b.ctx.workspaces.list.set({ items: [{ workspaceId: h.workspace.id, path: h.cwd, sessionIds: h.workspace.sessionIds }], archivedSessionIds: [] });
  await b.clients.automation.createAutomation(specification, true);
  assert.equal(b.clients.automation.pendingAutomation(), null);
});

test('原生cwd冲突和子代理归属不换ID、不接管；非法预设由真实Registry拒收', async t => {
  const h = await controllerFixture(t);
  await h.create('placed');
  const other = path.join(h.root, 'other'); await mkdir(other);
  await assert.rejects(h.create('placed', { cwd: other }), { code: 'session/conflict' });
  assert.equal(h.ctx.agents.get('placed').session.header.cwd, h.cwd);
  const parent = h.ctx.agents.get('placed');
  const child = await h.ctx.agents.create({ sessionId: 'child', parentAgent: parent, meta: { cwd: h.cwd, origin: 'subagent', parentSession: parent.id, agentPreset: 'standard' }, agentOptions: { provider: 'fixture', model: 'fixture' } });
  t.after(() => child.dispose());
  const found = await h.ctx.sessionController.resolveAgent('child');
  assert.ok(found.error); assert.equal(found.agent, undefined);
  const b = await browser(h); let notice; b.bridge.bindNotify((message, options) => { notice = { message, ...options }; });
  let error; try { await b.bridge.request('child', { action: 'workspace_attach' }); } catch (reason) { error = reason; }
  assert.equal(error.sessionId, 'child'); assert.equal(error.recovery, 'open');
  b.bridge.notifySessionIssue(error); assert.equal(notice.action.label, '打开原会话');
  await notice.action.run(); assert.deepEqual(b.calls.at(-1), ['open', 'child']);
  await assert.rejects(h.create('child'));
  await assert.rejects(h.create('invalid-preset', { agentPreset: 'absent' }), { code: 'agent-preset/not-found' });
  assert.equal(h.ctx.agents.get('invalid-preset'), undefined);
});

test('真实JSONL写入权被占用时按原ID返回writer-held，释放后恢复成功', async t => {
  const h = await controllerFixture(t);
  const handle = await h.ctx.agents.create({ sessionId: 'held', meta: { cwd: h.cwd, agentPreset: 'standard' }, agentOptions: { provider: 'fixture', model: 'fixture' } });
  handle.agent.session.append('command/run', { commandId: 'seed', name: 'whalewing' });
  assert.equal(await h.ctx.sessions.flush(handle.agent.session), true);
  await handle.dispose();
  const writer = await h.ctx.sessionPersistence.open('held', 'write');
  h.restore(() => writer[Symbol.asyncDispose]());
  const found = await h.ctx.sessionController.resolveAgent('held');
  assert.equal(found.error.code, 'session/writer-held');
  assert.equal(h.ctx.agents.get('held'), undefined);
  const b = await browser(h); let notice; b.bridge.bindNotify((message, options) => { notice = { message, ...options }; });
  let error; try { await b.bridge.request('held', { action: 'workspace_attach' }); } catch (reason) { error = reason; }
  assert.equal(error.code, 'session/writer-held'); assert.equal(error.sessionId, 'held');
  b.bridge.notifySessionIssue(error); assert.equal(notice.action.label, '打开原会话'); await notice.action.run();
  assert.deepEqual(b.calls.at(-1), ['open', 'held']);
  await writer[Symbol.asyncDispose]();
  assert.equal((await h.ctx.sessionController.resolveAgent('held')).agent.id, 'held');
});

for (const stage of ['claim', 'schedule']) test(`真实${stage}成功后确认失败保留pending，恢复不重复创建计划`, async t => {
  const h = await controllerFixture(t); let once = true, creates = 0;
  const original = stage === 'claim' ? h.automationHost.automation.dependencies.confirmClaim : h.ctx.schedule.catalog.bind(h.ctx.schedule);
  if (stage === 'claim') {
    h.automationHost.automation.dependencies.confirmClaim = async (...args) => { await original(...args); if (once) { once = false; throw new Error('认领确认中断'); } };
  } else {
    let written = false;
    const create = h.ctx.schedule.create.bind(h.ctx.schedule);
    h.ctx.schedule.create = async (...args) => { const result = await create(...args); written = true; return result; };
    h.ctx.schedule.catalog = async () => { if (written && once) { once = false; throw new Error('计划回读中断'); } return original(); };
  }
  const b = await browser(h, { create: async input => { creates++; return { ok: true, value: await h.ctx.sessionController.create(input) }; } });
  await assert.rejects(b.clients.automation.createAutomation(specification, false));
  const id = b.clients.automation.pendingAutomation().sessionId;
  assert.equal((await h.projection(id)).values.whalewingAutomation, 'custom');
  await b.clients.automation.createAutomation(specification, true);
  assert.equal(creates, 1); assert.equal(b.clients.automation.pendingAutomation(), null);
  const tasks = await h.ctx.schedule.catalog(); assert.equal(tasks.length, 1); assert.equal(tasks[0].sessionId, id);
});


test('恢复自动化原ID时任务目录变化拒绝认领并给原会话动作', async t => {
  const h = await controllerFixture(t);
  const b = await browser(h, { create: async input => { await h.ctx.sessionController.create(input); throw new Error('回执丢失'); } });
  await assert.rejects(b.clients.automation.createAutomation(specification, false), /回执丢失/);
  const id = b.clients.automation.pendingAutomation().sessionId;
  await h.workspace.attachSession(id);
  const moved = path.join(h.root, 'moved'); await mkdir(moved);
  const resumed = await browser(h, { storage: b.storage, taskDirectory: moved, workspaceState: { items: [{ workspaceId: h.workspace.id, path: h.cwd, sessionIds: h.workspace.sessionIds }], archivedSessionIds: [] } });
  let notice; resumed.bridge.bindNotify((message, options) => { notice = { message, ...options }; });
  let error; try { await resumed.clients.automation.createAutomation(specification, true); } catch (reason) { error = reason; }
  assert.equal(error.code, 'session/conflict'); assert.equal(error.sessionId, id);
  resumed.bridge.notifySessionIssue(error); await notice.action.run(); assert.deepEqual(resumed.calls.at(-1), ['open', id]);
  assert.equal(resumed.clients.automation.pendingAutomation().sessionId, id);
  assert.equal((await h.projection(id)).values.whalewingAutomation, null);
  assert.equal((await h.ctx.schedule.catalog()).length, 0);
});


test('真实两窗口mint回执经过产品入口拒收，pending和打开动作各自保留正确ID', async t => {
  const h = await controllerFixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  const attach = h.workspace.attachSession.bind(h.workspace); let held = false, extra, originalId, nativeKind;
  h.workspace.attachSession = async id => { if (!held) { held = true; entered.resolve(); await release.promise; } return attach(id); };
  h.restore(() => { h.workspace.attachSession = attach; release.resolve(); });
  const b = await browser(h, { create: async input => {
    originalId = input.sessionId;
    const { cwd: _, ...identity } = input;
    const requested = { ...identity, workspaceId: h.workspace.id };
    const first = h.ctx.sessionController.create(requested); await entered.promise;
    nativeKind = (await h.projection(originalId)).kind;
    const second = await h.ctx.sessionController.create(requested); extra = second.sessionId;
    release.resolve(); await first;
    b.ctx.workspaces.list.set({ items: [{ workspaceId: h.workspace.id, path: h.cwd, sessionIds: h.workspace.sessionIds }], archivedSessionIds: [] });
    return { ok: true, value: second };
  } });
  let notice, error; b.bridge.bindNotify((message, options) => { notice = { message, ...options }; });
  try { await b.clients.automation.createAutomation(specification, false); } catch (reason) { error = reason; }
  assert.equal(nativeKind, 'sequenced');
  assert.equal(error.code, 'SESSION_CREATED_DIFFERENT'); assert.notEqual(extra, originalId);
  assert.equal(b.clients.automation.pendingAutomation().sessionId, originalId);
  assert.equal((await h.projection(extra)).values.whalewingAutomation, null);
  assert.equal((await h.ctx.schedule.catalog()).length, 0); assert.ok(h.ctx.sessions.get(extra));
  b.bridge.notifySessionIssue(error); assert.equal(notice.action.label, '打开额外会话'); await notice.action.run();
  assert.deepEqual(b.calls.at(-1), ['open', extra]);
});

test('已开始的普通会话通过原生命令恢复，不再create或mint', async t => {
  const h = await controllerFixture(t); await h.create('started');
  const agent = h.ctx.agents.get('started');
  agent.session.append('turn/start', { turn: 1 }); await h.ctx.sessions.flush(agent.session);
  assert.equal((await h.projection('started')).values.sessionListMetadata.blank, false);
  const b = await browser(h, { create: async () => { assert.fail('恢复不得create'); } });
  const attached = await b.bridge.request('started', { action: 'workspace_attach' });
  assert.equal(attached.sessionId, 'started'); assert.ok(h.workspace.sessionIds.includes('started'));
  assert.equal(h.ctx.agents.get('started').id, 'started');
});


test('资讯Host原ID恢复使用真实resolveAgent、目录与认领读回，不再create', async t => {
  const h = await controllerFixture(t); await h.ctx.plugin(Cards);
  const cards = h.ctx.whalewingCards, workspace = await h.automationHost.taskWorkspace(h.signal());
  await h.ctx.sessionController.create({ sessionId: 'news-pending', workspaceId: workspace.id, agentPreset: 'standard' });
  const create = h.ctx.sessionController.create.bind(h.ctx.sessionController);
  h.ctx.sessionController.create = async () => { assert.fail('资讯恢复不得create'); };
  h.restore(() => { h.ctx.sessionController.create = create; });
  await cards.createNewsSession('news-pending', h.signal());
  assert.equal((await h.projection('news-pending')).values.whalewingAutomation, 'news');
  assert.ok(workspace.sessionIds.includes('news-pending'));
  await h.ctx.workspaceRegistry.archiveSession('news-pending');
  await assert.rejects(cards.createNewsSession('news-pending', h.signal()), { code: 'SESSION_ARCHIVED', sessionId: 'news-pending', recovery: 'open' });
  assert.ok(h.ctx.workspaceRegistry.archivedSessionIds.includes('news-pending'));
});

test('资讯Host子代理错误保留请求原ID与可打开动作，不接管写入', async t => {
  const h = await controllerFixture(t); await h.ctx.plugin(Cards);
  await h.create('news-parent');
  const child = await h.ctx.agents.create({ sessionId: 'news-child', parentAgent: h.ctx.agents.get('news-parent'), meta: { cwd: h.cwd, origin: 'subagent', parentSession: 'news-parent', agentPreset: 'standard' }, agentOptions: { provider: 'fixture', model: 'fixture' } });
  t.after(() => child.dispose());
  await assert.rejects(h.ctx.whalewingCards.createNewsSession('news-child', h.signal()), { code: 'session/agent-busy', sessionId: 'news-child', recovery: 'open' });
  assert.equal((await h.projection('news-child')).values.whalewingAutomation, null);
});


// 用真实命令准备已认领状态后释放Agent，恢复阶段只观察原生日志和flush。
async function coldWorkbench(h, id, child = false) {
  let parent;
  if (child) { await h.create(id + '-parent'); parent = h.ctx.agents.get(id + '-parent'); }
  const handle = await h.ctx.agents.create({ sessionId: id, ...(parent ? { parentAgent: parent } : {}), meta: { cwd: h.cwd, agentPreset: 'standard', ...(parent ? { origin: 'subagent', parentSession: parent.id } : {}) }, agentOptions: { provider: 'fixture', model: 'fixture' } });
  const result = await h.ctx.commands.execute(handle.agent, '/whalewing {"action":"workbench_claim"}', [], h.signal());
  assert.equal(result.result.kind, 'success');
  assert.equal(await h.ctx.sessions.flush(handle.agent.session), true);
  await h.workspace.attachSession(id); await handle.dispose();
  assert.equal(h.ctx.agents.get(id), undefined);
  assert.equal((await h.projection(id)).values.whalewingWorkbench, true);
  return new Map([['whalewing:workbench:http://fixture.local', id]]);
}
function assertPureRecoveryEvents(before, after) {
  assert.deepEqual(after.slice(0, before.length), before);
  // 原生resume可以结束seed；它不是插件业务命令，也不允许夹带其它事件。
  assert.ok(after.slice(before.length).every(event => event.type === 'session/end-seed'));
  assert.deepEqual(after.filter(event => event.type.startsWith('command/')), before.filter(event => event.type.startsWith('command/')));
}
function watchRecovery(h) {
  let flushes = 0, attaches = 0;
  const flush = h.ctx.sessions.flush.bind(h.ctx.sessions), attach = h.workspace.attachSession.bind(h.workspace);
  h.ctx.sessions.flush = (...args) => { flushes++; return flush(...args); };
  h.workspace.attachSession = (...args) => { attaches++; return attach(...args); };
  h.restore(() => { h.ctx.sessions.flush = flush; h.workspace.attachSession = attach; });
  return () => { assert.equal(flushes, 0, '纯恢复不flush'); assert.equal(attaches, 0, '已有成员不重新挂接'); };
}

test('实际生成remote绑定拒绝原两参调用，单参恢复到达真实lookup', { timeout: 10000 }, async t => {
  const h = await controllerFixture(t), id = 'remote-arity';
  const storage = await coldWorkbench(h, id), b = await browser(h, { storage });
  const before = await h.ctx.sessionQuery.readSession(id), verify = watchRecovery(h);
  for (const extra of [undefined, new AbortController().signal]) {
    await assert.rejects(b.ctx.remote.commands.list(id, extra), /commands\/list expected 1 argument\(s\), got 2/);
  }
  assert.equal(b.remoteCalls.length, 0, '原错误在客户端绑定层拒收，尚未进入载体或lookup');
  assert.equal(h.ctx.agents.get(id), undefined);
  assert.equal(await b.workbenchSession.ensureWorkbench(), id);
  assert.deepEqual(b.remoteCalls.map(call => call.sessionId), [id]);
  assert.equal(h.ctx.agents.get(id).id, id);
  assert.equal(b.calls.some(([kind]) => ['create', 'rename', 'claim', 'confirm', 'attach', 'command', 'open'].includes(kind)), false);
  assertPureRecoveryEvents(before.events, (await h.ctx.sessionQuery.readSession(id)).events); verify();
});

test('已有AI会话恢复前取消，不调用生成remote或后续命名打开', { timeout: 10000 }, async t => {
  const h = await controllerFixture(t), id = 'cancel-before-lookup';
  await coldWorkbench(h, id);
  const storage = new Map([['whalewing:aiweb:http://fixture.local', id]]);
  const b = await browser(h, { storage, sidebarRight: { mounted: { getSnapshot: () => undefined }, openTab() {} } });
  const before = await h.ctx.sessionQuery.readSession(id), verify = watchRecovery(h), abort = new AbortController();
  abort.abort();
  await assert.rejects(b.clients['ai-web'].openAiInConversation(undefined, undefined, abort.signal), { name: 'AbortError' });
  assert.equal(b.remoteCalls.length, 0);
  assert.equal(h.ctx.agents.get(id), undefined);
  assert.equal(storage.get('whalewing:aiweb:http://fixture.local'), id);
  assert.equal(b.calls.some(([kind]) => ['lookup', 'create', 'rename', 'claim', 'confirm', 'attach', 'command', 'retain', 'open'].includes(kind)), false);
  assert.deepEqual((await h.ctx.sessionQuery.readSession(id)).events, before.events); verify();
});

test('真实lookup等待中本地取消，原生恢复可完成但不继续AI命名或打开', { timeout: 10000 }, async t => {
  const h = await controllerFixture(t), id = 'cancel-during-lookup';
  await coldWorkbench(h, id);
  const storage = new Map([['whalewing:aiweb:http://fixture.local', id]]);
  const before = await h.ctx.sessionQuery.readSession(id), verify = watchRecovery(h);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), open = h.ctx.sessionPersistence.open.bind(h.ctx.sessionPersistence);
  h.ctx.sessionPersistence.open = async (sessionId, mode, ...args) => {
    if (sessionId === id && mode === 'write') { entered.resolve(); await release.promise; }
    return open(sessionId, mode, ...args);
  };
  h.restore(() => { h.ctx.sessionPersistence.open = open; release.resolve(); });
  const b = await browser(h, { storage, sidebarRight: { mounted: { getSnapshot: () => undefined }, openTab() {} } });
  const abort = new AbortController(); let settled = false;
  const operation = b.clients['ai-web'].openAiInConversation(undefined, undefined, abort.signal).finally(() => { settled = true; });
  const rejected = assert.rejects(operation, { name: 'AbortError' });
  await entered.promise; abort.abort();
  assert.equal(settled, false);
  assert.equal(b.remoteCalls.length, 1); assert.equal(b.remoteCalls[0].sessionId, id);
  // list没有取消参数；本地signal不注入原生载体，也不承诺终止已开始的恢复。
  assert.notEqual(b.remoteCalls[0].signal, abort.signal); assert.equal(b.remoteCalls[0].signal.aborted, false);
  assert.equal(h.ctx.agents.get(id), undefined);
  assert.equal(b.calls.some(([kind]) => ['rename', 'open'].includes(kind)), false);
  release.resolve(); await rejected;
  assert.equal(h.ctx.agents.get(id).id, id);
  assert.equal(storage.get('whalewing:aiweb:http://fixture.local'), id);
  assert.equal(b.calls.some(([kind]) => ['create', 'rename', 'claim', 'confirm', 'attach', 'command', 'retain', 'open'].includes(kind)), false);
  assertPureRecoveryEvents(before.events, (await h.ctx.sessionQuery.readSession(id)).events); verify();
});

test('已认领且已挂接的冷工作台等待真实commands.list lookup，恢复零命令事件零flush', { timeout: 10000 }, async t => {
  const h = await controllerFixture(t), storage = await coldWorkbench(h, 'cold-workbench');
  const before = await h.ctx.sessionQuery.readSession('cold-workbench'), verify = watchRecovery(h);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), open = h.ctx.sessionPersistence.open.bind(h.ctx.sessionPersistence);
  h.ctx.sessionPersistence.open = async (id, mode, ...args) => { if (id === 'cold-workbench' && mode === 'write') { entered.resolve(); await release.promise; } return open(id, mode, ...args); };
  h.restore(() => { h.ctx.sessionPersistence.open = open; release.resolve(); });
  const b = await browser(h, { storage }); let finished = false;
  const operation = b.workbenchSession.ensureWorkbench().then(id => { finished = true; return id; });
  await entered.promise;
  assert.equal(finished, false); assert.equal(h.ctx.agents.get('cold-workbench'), undefined);
  release.resolve(); assert.equal(await operation, 'cold-workbench');
  assert.equal(h.ctx.agents.get('cold-workbench').id, 'cold-workbench');
  assertPureRecoveryEvents(before.events, (await h.ctx.sessionQuery.readSession('cold-workbench')).events);
  assert.equal(b.calls.some(([kind]) => ['create', 'claim', 'confirm', 'attach', 'command'].includes(kind)), false);
  assert.deepEqual(b.calls.filter(([kind]) => kind === 'lookup'), [['lookup', 'cold-workbench']]); verify();
});

for (const boundary of ['writer', 'child']) test(`冷工作台真实list返回${boundary}错误，保留原ID并阻断后续呈现`, async t => {
  const h = await controllerFixture(t), id = 'cold-' + boundary;
  const storage = await coldWorkbench(h, id, boundary === 'child');
  let writer;
  if (boundary === 'writer') { writer = await h.ctx.sessionPersistence.open(id, 'write'); h.restore(() => writer[Symbol.asyncDispose]()); }
  const before = await h.ctx.sessionQuery.readSession(id), verify = watchRecovery(h), b = await browser(h, { storage });
  let error, notice; b.bridge.bindNotify((message, options) => { notice = { message, ...options }; });
  try { await b.workbenchSession.ensureWorkbench(); } catch (reason) { error = reason; }
  assert.equal(error.code, boundary === 'writer' ? 'session/writer-held' : 'session/agent-busy');
  assert.equal(error.sessionId, id); assert.equal(error.recovery, 'open');
  const nativeError = (await h.ctx.sessionController.resolveAgent(id)).error;
  assert.equal(error.detail, nativeError.message); assert.deepEqual(error.details, nativeError.details);
  assert.equal(storage.get('whalewing:workbench:http://fixture.local'), id);
  assert.equal(b.calls.some(([kind]) => ['open', 'create', 'attach', 'claim', 'confirm'].includes(kind)), false);
  b.bridge.notifySessionIssue(error); await notice.action.run(); assert.deepEqual(b.calls.at(-1), ['open', id]);
  assert.deepEqual((await h.ctx.sessionQuery.readSession(id)).events, before.events); verify();
});

function renderedNodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(renderedNodes);
  return tree && typeof tree === 'object' ? [tree, ...renderedNodes(tree.props?.children)] : [];
}
async function commitBrowser(b) {
  for (let i = 0; i < 4; i++) {
    b.render(); b.flushEffects(); await new Promise(setImmediate);
    for (const [id, timer] of [...b.timers]) if (timer.delay === 16) { b.timers.delete(id); timer.fn(); }
  }
}

test('适配版AI网页从已认领冷工作台打开前等待真实只读恢复，不把retain.ready当恢复证据', { timeout: 10000 }, async t => {
  const h = await controllerFixture(t), storage = await coldWorkbench(h, 'cold-ai');
  const before = await h.ctx.sessionQuery.readSession('cold-ai'), verify = watchRecovery(h);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), open = h.ctx.sessionPersistence.open.bind(h.ctx.sessionPersistence);
  h.ctx.sessionPersistence.open = async (id, mode, ...args) => { if (id === 'cold-ai' && mode === 'write') { entered.resolve(); await release.promise; } return open(id, mode, ...args); };
  h.restore(() => { h.ctx.sessionPersistence.open = open; release.resolve(); });
  let presented, mounted, retained = 0; const opened = [], presentationReady = Promise.withResolvers();
  const sidebarRight = { mounted: { getSnapshot: () => mounted }, focusPresentation() { return () => {}; }, presentSession(panel, id) { presented = id; presentationReady.resolve(id); return () => { presented = undefined; }; }, openTab(...args) { opened.push(args); } };
  const b = await browser(h, { storage, sidebarRight, retainReady: Promise.resolve() });
  const retain = b.ctx.sessions.retain.bind(b.ctx.sessions); b.ctx.sessions.retain = (...args) => { retained++; return retain(...args); };
  b.render(); b.flushEffects();
  await renderedNodes(b.render()).find(node => node.type === 'button' && node.props.children?.includes('AI 网页')).props.onClick(); await commitBrowser(b);
  const openBrowser = renderedNodes(b.render()).find(node => node.type?.name === 'AiWebView').props.openBrowser;
  const operation = openBrowser('https://example.test/');
  await entered.promise; assert.equal(retained, 0); assert.equal(opened.length, 0);
  // effect轮数不是文件I/O完成证据：原20轮结束时原生lookup仍被明确阻塞。
  for (let attempt = 0; attempt < 20; attempt++) await commitBrowser(b);
  assert.equal(presented, undefined); assert.equal(retained, 0); assert.equal(opened.length, 0);
  release.resolve();
  let settled = false;
  const presentedResult = Promise.race([presentationReady.promise, operation]).then(value => ({ value }), error => ({ error })).finally(() => { settled = true; });
  // 在原有测试deadline内驱动effects，以真实呈现回调或实际操作失败结束等待。
  while (!settled) { t.signal.throwIfAborted(); await commitBrowser(b); }
  const result = await presentedResult; if (result.error) throw result.error;
  assert.equal(result.value, 'cold-ai');
  assert.equal(presented, 'cold-ai'); assert.equal(h.ctx.agents.get('cold-ai').id, 'cold-ai');
  mounted = presented; await commitBrowser(b); await operation;
  assert.equal(opened.length, 1); assert.equal(retained, 1);
  assertPureRecoveryEvents(before.events, (await h.ctx.sessionQuery.readSession('cold-ai')).events); verify(); b.unmount();
});
