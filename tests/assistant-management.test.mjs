import test from 'node:test';
import assert from 'node:assert/strict';
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy';
import * as NativeManagerTools from '@deepseek-ai/dsh-plugin-manager/tools';
import { managementHarness } from './assistant-management-fixture.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
async function setup(t, { mode = 'danger-full-access', manager = true } = {}) {
  const h = await managementHarness(t);
  const calls = [];
  let action = async () => ({ application: 'applied' });
  const service = {
    async listPlugins() { calls.push(['list_plugins']); return []; },
    async listBundles() { calls.push(['list_bundles']); return []; },
    async setPluginEnabled(...args) { calls.push(['set_plugin', ...args]); return action(); },
    async setBundleEnabled(...args) { calls.push(['set_bundle', ...args]); return action(); },
    async installBundle(...args) { calls.push(['install_bundle', ...args]); return action(); },
    async removeBundle(...args) { calls.push(['remove_bundle', ...args]); return action(); },
  };
  const dependencies = () => h.ctx.plugin({ apply(ctx) { ctx.provide('pluginManager', service); } });
  if (manager) h.managerScope = await dependencies();
  await h.ctx.plugin(SandboxPolicy, { mode });
  await tick();
  const select = async (id = 'manager', agent = h.agent) => {
    assert.equal((await h.run({ expertId: id }, agent)).result.kind, 'success');
    await tick();
  };
  const execute = (args = { action: 'list_plugins' }, agent = h.agent, signal = new AbortController().signal) => h.ctx.tools.execute({ name: 'plugin_manager', arguments: args, agent, callId: 'management-test', signal });
  const visible = (agent = h.agent) => h.ctx.tools.get('plugin_manager', agent);
  return { ...h, calls, select, execute, visible, dependencies, action: value => { action = value; }, assistant: h.mounted.service.registry.bases.get('assistant').fiber };
}

test('实际选择才挂载原生工具，仅当前manager主会话可见，切换与退出撤回', { timeout: 15000 }, async t => {
  const h = await setup(t);
  assert.equal(h.visible(), undefined);
  await h.select('development'); assert.equal(h.visible(), undefined);
  await h.select(); assert.ok(h.visible());
  const other = await h.create('other');
  assert.equal(h.visible(other), undefined);
  const child = await h.create('child', { parentAgent: h.agent, meta: { origin: 'subagent', parentSession: h.agent.id } });
  assert.equal(h.ctx.whalewingExperts.selectedFor(child), null);
  // 原生父子链可能继承工具定义；执行守卫仍按实际Agent拒绝管理动作。
  await h.execute({ action: 'set_plugin', target: 'fixture', enabled: false }, child);
  assert.equal(h.calls.length, 0);
  assert.equal(h.ctx.tools.get('plugin_manager'), undefined);
  await h.execute(); assert.deepEqual(h.calls, [['list_plugins']]);
  await h.select(null); assert.equal(h.visible(), undefined);
  await h.select(); assert.ok(h.visible());
  await h.assistant.dispose(); await tick(); assert.equal(h.visible(), undefined);
});

test('原生已有定义和原限制隐藏均不补入，不接管Creator能力', { timeout: 15000 }, async t => {
  const h = await setup(t);
  const native = await h.ctx.plugin(NativeManagerTools);
  const definition = h.visible();
  await h.select(); assert.equal(h.visible(), definition);
  await h.select(null); assert.equal(h.visible(), definition);
  const restrict = h.agent.ctx.tools.restrict({ deny: ['plugin_manager'] });
  await h.select(); assert.equal(h.visible(), undefined);
  await h.assistant.dispose(); assert.equal(h.visible(), undefined);
  restrict(); assert.equal(h.visible(), definition);
  await native.dispose();
});

test('补入后出现原生祖先定义，撤自有覆盖并保留原生定义', { timeout: 15000 }, async t => {
  const h = await setup(t);
  await h.select(); const owned = h.visible();
  const native = await h.ctx.plugin(NativeManagerTools);
  await tick();
  assert.notEqual(h.visible(), owned);
  const inherited = h.ctx.tools.get('plugin_manager');
  assert.equal(h.visible(), inherited);
  await h.assistant.dispose(); assert.equal(h.visible(), inherited);
  await native.dispose();
});

test('会话自身已有原生管理插件时不补入，退出助手保留该原生能力', { timeout: 15000 }, async t => {
  const h = await setup(t);
  const native = await h.agent.ctx.plugin(NativeManagerTools);
  const definition = h.visible();
  await h.select(); assert.equal(h.visible(), definition);
  await h.assistant.dispose(); assert.equal(h.visible(), definition);
  await h.execute(); assert.deepEqual(h.calls, [['list_plugins']]);
  await native.dispose();
});

test('Agent真实释放后撤回自有工具，不影响同profile其它会话', { timeout: 15000 }, async t => {
  const h = await setup(t);
  const handle = await h.ctx.agents.create({ sessionId: 'ending', meta: { agentPreset: 'standard' }, agentOptions: { provider: 'fixture', model: 'fixture' } });
  await h.select('manager', handle.agent); assert.ok(h.visible(handle.agent));
  await handle.dispose(); await tick();
  assert.equal(h.ctx.agents.get('ending'), undefined);
  assert.equal(h.visible(handle.agent), undefined);
  assert.equal(h.visible(), undefined);
});

test('依赖缺失只降级管理能力，恢复后挂载，依赖退出后撤回', { timeout: 15000 }, async t => {
  const h = await setup(t, { manager: false });
  await h.select(); assert.equal(h.visible(), undefined);
  const dependencies = await h.dependencies(); await tick(); assert.ok(h.visible());
  await dependencies.dispose(); await tick(); assert.equal(h.visible(), undefined);
  assert.ok(h.ctx.whalewingExperts);
});

for (const outcome of ['rejected', 'cancelled']) test(`原生审批${outcome}不调用管理器`, { timeout: 15000 }, async t => {
  const h = await setup(t, { mode: 'read-only' });
  h.ctx.provide('approval', { async request() { return outcome; } });
  await h.select();
  const result = await h.execute({ action: 'set_plugin', target: 'fixture', enabled: false });
  assert.equal(result.isError, true);
  assert.equal(h.calls.length, 0);
});

for (const exit of ['role', 'assistant', 'dependency', 'caller']) test(`原生审批待决时${exit}退出，迟到批准不开始写入`, { timeout: 15000 }, async t => {
  const h = await setup(t, { mode: 'read-only' });
  const entered = Promise.withResolvers(), answer = Promise.withResolvers();
  let approvalSignal;
  h.ctx.provide('approval', { async request(input) { approvalSignal = input.signal; entered.resolve(); return answer.promise; } });
  await h.select();
  const caller = new AbortController();
  const pending = h.execute({ action: 'set_plugin', target: 'fixture', enabled: false }, h.agent, caller.signal);
  await entered.promise;
  if (exit === 'role') await h.select(null);
  if (exit === 'assistant') await h.assistant.dispose();
  if (exit === 'dependency') await h.managerScope.dispose();
  if (exit === 'caller') caller.abort(new Error('原调用取消'));
  assert.equal(approvalSignal.aborted, true);
  answer.resolve('allowed-once');
  await pending;
  assert.equal(h.calls.length, 0);
});

test('管理器已接收后退出不自等、不谎报零副作用，等待实际返回', { timeout: 15000 }, async t => {
  const h = await setup(t);
  const entered = Promise.withResolvers(), completed = Promise.withResolvers();
  let acceptedResult;
  h.action(async () => { entered.resolve(); await completed.promise; acceptedResult = { application: 'restart-required', restartReason: 'no-hmr' }; return acceptedResult; });
  await h.select();
  let settled = false;
  const pending = h.execute({ action: 'remove_bundle', target: 'fixture' }).then(value => { settled = true; return value; });
  await entered.promise;
  await h.assistant.dispose(); await tick();
  assert.equal(settled, false);
  assert.deepEqual(h.calls, [['remove_bundle', 'fixture']]);
  completed.resolve();
  const result = await pending;
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /ABORTED/);
  // 原生执行器取消后返回 ABORTED，不保留业务正文；最终状态须由独立管理读回确认。
  assert.deepEqual(acceptedResult, { application: 'restart-required', restartReason: 'no-hmr' });
});

test('每轮管理上下文只注入一次，使用实际包路径且角色退出不再注入', { timeout: 15000 }, async t => {
  const h = await setup(t);
  await h.select();
  const messages = [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '管理插件' }] }];
  const invoke = (turn = 1) => h.ctx.waterfall('agent/pre-step', { agent: h.agent, turn, step: 1, signal: new AbortController().signal }, () => Promise.resolve({ kind: 'accept', messages }));
  const first = await invoke();
  const context = first.messages.filter(message => message.source.kind === 'whalewing-plugin-management');
  assert.equal(context.length, 1);
  assert.match(context[0].content[0].text, /MAINTAINING.md[\s\S]*examples.stateful-feature/);
  assert.equal((await invoke()).messages.filter(message => message.source.kind === 'whalewing-plugin-management').length, 0);
  await h.select('development');
  assert.equal((await invoke(2)).messages.filter(message => message.source.kind === 'whalewing-plugin-management').length, 0);
});

test('真实原生管理操作参数和结果保持原语义，不改profile或会话权限', { timeout: 15000 }, async t => {
  const h = await setup(t, { mode: 'read-only' });
  const approvals = [];
  h.ctx.provide('approval', { async request(input) { approvals.push(input); return 'allowed-once'; } });
  await h.select();
  for (const args of [
    { action: 'list_bundles' },
    { action: 'set_plugin', target: 'fixture/entry', enabled: false },
    { action: 'set_bundle', target: 'fixture-package', enabled: true },
    { action: 'install_bundle', target: 'fixture-package', enabled: false, approvedBuilds: ['fixture-script'] },
    { action: 'remove_bundle', target: 'fixture-package' },
  ]) assert.equal((await h.execute(args)).isError, false);
  assert.deepEqual(h.calls, [
    ['list_bundles'], ['set_plugin', 'fixture/entry', false], ['set_bundle', 'fixture-package', true],
    ['install_bundle', 'fixture-package', { enabled: false, approvedBuilds: ['fixture-script'] }], ['remove_bundle', 'fixture-package'],
  ]);
  assert.equal(approvals.length, 5);
  assert.equal(h.ctx.sandboxPolicy.resolve({ session: h.agent.session }).mode, 'read-only');
  assert.equal(h.agent.session.header.agentPreset, 'standard');
});

test('没有父会话header的真实owned子Agent仍不取得管理主资格', { timeout: 15000 }, async t => {
  const h = await setup(t);
  await h.select();
  const child = await h.create('owned-without-header', { parentAgent: h.agent });
  assert.equal(child.session.header.parentSession, undefined);
  assert.equal(h.ctx.agents.isOwnedBy(child.id, h.agent), true);
  assert.equal(h.ctx.whalewingExperts.selectedFor(child), null);
  const result = await h.execute({ action: 'set_bundle', target: 'fixture', enabled: false }, child);
  assert.equal(result.isError, true);
  assert.equal(h.calls.length, 0);
});

test('子Agent自有原生管理定义不被父助手guard接管', { timeout: 15000 }, async t => {
  const h = await setup(t);
  await h.select();
  const child = await h.create('native-child', { parentAgent: h.agent, meta: { origin: 'subagent', parentSession: h.agent.id } });
  const native = await child.ctx.plugin(NativeManagerTools);
  const original = h.visible(child);
  assert.notEqual(original, h.visible());
  assert.equal((await h.execute({ action: 'list_plugins' }, child)).isError, false);
  assert.deepEqual(h.calls, [['list_plugins']]);
  await h.assistant.dispose();
  assert.equal(h.visible(child), original);
  await native.dispose();
});
