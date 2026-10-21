import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { FeatureRegistry } from '../src/features.js';
import { workbenchContract } from '../src/workbench-contract.js';
import { createWorkbenchService, createWorkbenchView } from '../src/shell/workbench.js';
import { watchFeatures } from '../src/shell/feature-sync.js';
import { nativeSlots } from './native-slot-fixture.mjs';
import * as templateHost from '../examples/feature-starter/host.js';

const TAB = 'whalewing.workbench.tab', DOCK = 'whalewing.workbench.dock';
const tick = () => new Promise(setImmediate);
const feature = (id, instance = 1, extra = {}) => ({ id, kind: 'extension', api: 1, package: 'dsh-fixture', skills: [], instance, ...extra });
const frame = (...features) => workbenchContract(z).snapshot.parse({ revision: 0, features });

// 此夹具只验证工作台接纳与撤销，不替代原生 slot 包装和 React 卸载的隔离验收。
function fixture() {
  const rows = new Map([[TAB, []], [DOCK, []]]), subscriptions = new Map(), cleanup = [], notices = [], actions = [];
  const ctx = {
    effect(fn) { const dispose = fn(); cleanup.push(dispose); return dispose; },
    slots: { entries: name => rows.get(name) || [], subscribe(name, fn) { subscriptions.set(name, fn); return () => subscriptions.delete(name); } },
    locale: { subscribe: () => () => {} },
  };
  const workbench = createWorkbenchService(ctx, { bridge: { open: id => actions.push(['open', id]) }, clients: {}, workbenchSession: {}, t: key => key, notify: (...args) => notices.push(args), ui: {}, explainError: error => error.message });
  const core = workbench.internal;
  function slot(id, { component = () => null, priority = 0, name = TAB, registrant = '任意声明' } = {}) {
    const entry = { component, options: { id, label: id, priority }, registrant };
    rows.get(name).push(entry); subscriptions.get(name)?.();
    return { entry, remove() { rows.set(name, rows.get(name).filter(value => value !== entry)); subscriptions.get(name)?.(); } };
  }
  function builtin(id) { const component = () => null; core.bindBuiltinView(id, component); return slot(id, { component, name: id === 'assistant' ? DOCK : TAB }); }
  builtin('experts');
  return { core, workbench, slot, builtin, notices, actions, dispose() { for (const fn of cleanup.reverse()) fn?.(); } };
}

test('内部严格帧要求活动实例，公开register不接受调用方伪造实例', async t => {
  const schema = workbenchContract(z).snapshot;
  assert.throws(() => schema.parse({ revision: 0, features: [{ ...feature('one'), instance: undefined }] }));
  for (const instance of [0, -1, 1.5]) assert.throws(() => frame(feature('one', instance)));
  assert.doesNotThrow(() => frame({ id: 'experts', kind: 'base', api: 1, package: 'dsh-whalewing', skills: [], error: '正在恢复' }));
  const ctx = new Context(), registry = new FeatureRegistry(ctx);
  t.after(() => ctx.fiber.dispose());
  const raw = { id: 'one', api: 1, package: 'dsh-fixture' };
  assert.throws(() => registry.register(ctx, { ...raw, instance: 999 }));
  const first = await ctx.plugin(scope => registry.register(scope, raw));
  const old = schema.parse(registry.snapshot()).features[0].instance;
  await first.dispose();
  await ctx.plugin(scope => registry.register(scope, raw));
  assert.ok(schema.parse(registry.snapshot()).features[0].instance > old);
});

test('目标原生Loader确实在Host等待时发布客户端模块，不以模块存在替代活动资格', () => {
  const child = spawnSync(process.execPath, ['--expose-internals', '--input-type=module', '-e', `
    import { Context } from '@deepseek-ai/cordis';
    import Loader from '@deepseek-ai/cordis-plugin-loader';
    import { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules';
    const ctx = new Context();
    try {
      await ctx.plugin(Loader, { baseUrl: new URL('./examples/feature-starter/host.js', import.meta.url).href });
      const id = await ctx.loader.create({ name: 'dsh-whalewing-hello' });
      await ctx.loader.await();
      await ctx.plugin(ClientModuleRegistry);
      console.log(JSON.stringify({ state: ctx.loader.resolve(id).fiber.state, entries: ctx.clientModules.graph().entries }));
    } finally { await ctx.fiber.dispose(); }
  `], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.equal(child.status, 0, child.error?.message ?? child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.state, 0);
  assert.equal(result.entries[0].id, 'dsh-whalewing-hello');
  assert.deepEqual(result.entries[0].inject, ['dsh-whalewing']);
});

test('客户端先到没有外部权限，Host-only合法，活动完整帧才接纳唯一slot', t => {
  const f = fixture(); t.after(() => f.dispose());
  f.slot('hello', { registrant: 'dsh-whalewing-hello' });
  assert.deepEqual(f.core.entries().map(entry => entry.options.id), ['experts']);
  f.workbench.openTab('hello'); assert.equal(f.core.snapshot().tab, 'experts');
  const unavailable = f.core.scope('hello'); assert.equal(unavailable.owner.revoked, true);
  f.core.setFeatures(frame(feature('host-only')), 1);
  assert.equal(f.core.featureEnabled('host-only'), true); assert.equal(f.core.entries().length, 1);
  f.core.setFeatures(frame(feature('hello')), 1);
  assert.equal(f.core.entries().length, 2);
  assert.equal(f.core.scope('hello').owner.revoked, false);
  assert.notEqual(f.core.scope('hello'), unavailable);
  f.workbench.openTab('hello'); assert.equal(f.core.snapshot().tab, 'hello');
});

test('原始同id条目即使priority不同也拒收，移除冲突后才能重新接纳', t => {
  const f = fixture(); t.after(() => f.dispose());
  f.slot('hello'); f.core.setFeatures(frame(feature('hello')), 1);
  const old = f.core.scope('hello'); f.workbench.openTab('hello');
  const duplicate = f.slot('hello', { priority: 100, registrant: '伪造的同一包名' });
  assert.equal(old.owner.revoked, true); assert.equal(f.core.snapshot().tab, 'experts');
  assert.equal(f.core.entries().some(entry => entry.options.id === 'hello'), false);
  duplicate.remove();
  assert.equal(f.core.entries().some(entry => entry.options.id === 'hello'), true);
  assert.notEqual(f.core.scope('hello'), old);
});

test('正常可选关闭时残留Client尚待清理，不以未匹配错误覆盖关闭回执', t => {
  const f = fixture(); t.after(() => f.dispose());
  const client = f.builtin('toolbox');
  f.core.setFeatures(frame(feature('toolbox', 1, { kind: 'optional', package: 'dsh-whalewing' })), 1);
  f.workbench.openTab('toolbox');
  f.core.setFeatures(frame(), 1);
  assert.equal(f.notices.at(-1)[0], '「toolbox」已关闭');
  f.core.releaseFeature('toolbox'); client.remove();
  assert.equal(f.notices.at(-1)[0], '「toolbox」已关闭');
  assert.equal(f.core.visited.has('toolbox'), false);
});

test('社区Host先退场时保留关闭回执，只抑制原始待清理视图，新孤立Client仍诊断', t => {
  const f = fixture(); t.after(() => f.dispose());
  const first = f.slot('hello'); f.core.setFeatures(frame(feature('hello')), 1); f.workbench.openTab('hello');
  const old = f.core.scope('hello');
  f.core.setFeatures(frame(), 1);
  assert.equal(f.notices.at(-1)[0], '「hello」已关闭'); assert.equal(old.owner.revoked, true);
  f.core.setFeatures(frame(), 1); f.builtin('skills');
  assert.equal(f.notices.at(-1)[0], '「hello」已关闭', '其它slot变化也不得把同一退场视图重新诊断为孤立');
  first.remove();
  f.slot('hello');
  assert.match(f.notices.at(-1)[0], /尚未匹配有效登记/);
  assert.equal(f.core.entries().some(entry => entry.options.id === 'hello'), false);
  f.core.setFeatures(frame(feature('hello', 2)), 1);
  assert.equal(f.core.scope('hello').owner.revoked, false); assert.notEqual(f.core.scope('hello'), old);
});

test('连接reset清除社区退场记录，新的完整帧重新判断孤立视图而不恢复旧权限', t => {
  const f = fixture(); t.after(() => f.dispose()); f.slot('hello');
  f.core.setFeatures(frame(feature('hello')), 1); const old = f.core.scope('hello'); f.workbench.openTab('hello');
  f.core.setFeatures(frame(), 1); assert.equal(f.notices.at(-1)[0], '「hello」已关闭');
  f.core.resetFeatures(2); f.core.setFeatures(frame(), 2);
  assert.match(f.notices.at(-1)[0], /尚未匹配有效登记/); assert.equal(old.owner.revoked, true);
  assert.equal(f.core.scope('hello').owner.revoked, true);
});

test('真实原生single dock按整槽选winner：异id或无id的低priority条目均阻止助手scope投递', async t => {
  const native = await nativeSlots();
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  const slots = new native.SlotRegistry(ctx);
  ctx.provide('locale', { subscribe: () => () => {} });
  slots.register({ name: 'root', children: { [TAB]: { kind: 'list', scope: 'root' }, [DOCK]: { kind: 'single', scope: 'root' } } }, () => null);
  const workbench = createWorkbenchService(ctx, { bridge: {}, clients: {}, workbenchSession: {}, t: key => key, notify() {}, ui: {}, explainError: error => error.message });
  const core = workbench.internal, local = () => null;
  core.bindBuiltinView('assistant', local); slots.register({ name: DOCK, id: 'assistant' }, local);
  await tick(); assert.equal(core.dockEnabled(), true);
  const delivered = [];
  const Workbench = createWorkbenchView({ React: native.React, css: '', Logo: () => null, Modal: () => null });
  const renderSlot = (name, owner) => {
    delivered.push({ name, owner });
    const host = slots.hostFace();
    return native.renderOutletContent(host, name, owner, undefined, {}, host.specOf(name));
  };
  Workbench({ workbench, t: key => key, renderSlot }); assert.equal(delivered.at(-1).owner.workbench, core.scope('assistant'));
  for (const id of ['foreign-dock', undefined]) {
    const old = core.scope('assistant'), foreign = () => null;
    const remove = slots.register({ name: DOCK, ...(id === undefined ? {} : { id }), priority: -10 }, foreign);
    await tick();
    const host = slots.hostFace(), nativeTree = native.renderOutletContent(host, DOCK, { workbench: old }, undefined, {}, host.specOf(DOCK));
    assert.equal(nativeTree.props.children.props.entry.component, foreign, '原生single确实选择外来低priority，不按id隔离');
    assert.equal(core.dockEnabled(), false); assert.equal(old.owner.revoked, true);
    delivered.length = 0; Workbench({ workbench, t: key => key, renderSlot });
    assert.equal(delivered.some(value => value.name === DOCK), false, '工作台不得调用原生renderer向冲突dock投递scope');
    remove(); await tick(); assert.equal(core.dockEnabled(), true);
    Workbench({ workbench, t: key => key, renderSlot });
    assert.notEqual(delivered.at(-1).owner.workbench, old);
    assert.equal(delivered.at(-1).owner.workbench.owner.revoked, false);
  }
});

test('未修改v1模板经真实Cordis及原生slot：Host先卸载、Client后清理保留关闭回执', async t => {
  const native = await nativeSlots(), ctx = new Context(); t.after(() => ctx.fiber.dispose());
  const slots = new native.SlotRegistry(ctx), registry = new FeatureRegistry(ctx), notices = [];
  ctx.provide('locale', { subscribe: () => () => {}, resolveText: text => text.zh });
  slots.register({ name: 'root', children: { [TAB]: { kind: 'list', scope: 'root' }, [DOCK]: { kind: 'single', scope: 'root' } } }, () => null);
  const workbench = createWorkbenchService(ctx, { bridge: {}, clients: {}, workbenchSession: {}, t: key => key, notify: text => notices.push(text), ui: {}, explainError: error => error.message });
  ctx.provide('whalewingWorkbench', workbench);
  ctx.provide('whalewing', { apiVersion: 1, features: { register: (caller, manifest) => registry.register(caller, manifest) } });
  const host = await ctx.plugin(templateHost);
  let registration;
  new Function('window', await readFile(new URL('../examples/feature-starter/client.js', import.meta.url), 'utf8'))({ __ModuleLoader__: { load(value) { registration = value; } } });
  const plugin = registration.factory(name => { assert.equal(name, 'react'); return native.React; });
  const client = await ctx.plugin(plugin); await tick();
  workbench.internal.setFeatures(workbenchContract(z).snapshot.parse(registry.snapshot()), 1);
  workbench.openTab('hello'); const previous = workbench.internal.scope('hello');
  assert.equal(workbench.internal.snapshot().tab, 'hello');
  await host.dispose();
  workbench.internal.setFeatures(workbenchContract(z).snapshot.parse(registry.snapshot()), 1);
  assert.equal(slots.entries(TAB).length, 1, '原生Client此刻仍在登记');
  assert.equal(workbench.internal.snapshot().tab, 'experts'); assert.equal(previous.owner.revoked, true);
  assert.equal(notices.at(-1), '「文本预览」已关闭');
  await client.dispose(); await tick();
  assert.equal(slots.entries(TAB).length, 0); assert.equal(notices.at(-1), '「文本预览」已关闭');
});

test('内置仅接纳本地组件，底座失败仍有稳定入口及重试状态', t => {
  const f = fixture(); t.after(() => f.dispose());
  f.core.setFeatures(frame({ id: 'experts', kind: 'base', api: 1, package: 'dsh-whalewing', skills: [], error: '底座启动失败' }), 1);
  assert.equal(f.core.entries()[0].options.id, 'experts');
  assert.match(f.core.featureProblem('experts').error, /启动失败/);
  const conflict = f.slot('experts', { priority: 2 });
  assert.equal(f.core.entries().length, 0); conflict.remove(); assert.equal(f.core.entries().length, 1);
  f.slot('cards'); f.core.setFeatures(frame(feature('cards', 2, { kind: 'optional', package: 'dsh-whalewing' })), 1);
  assert.equal(f.core.entries().some(entry => entry.options.id === 'cards'), false, '保留id不能被陌生组件占位');
});

test('默认专家入口接到首个Host实例后仍保留访问事实，普通切页不撤销后台scope', t => {
  const f = fixture(); t.after(() => f.dispose());
  const initial = f.core.scope('experts');
  f.core.setFeatures(frame(feature('experts', 1, { kind: 'base', package: 'dsh-whalewing' })), 1);
  assert.equal(initial.owner.revoked, true);
  const current = f.core.scope('experts'); f.builtin('skills'); f.workbench.openTab('skills');
  assert.equal(f.core.visited.has('experts'), true);
  assert.equal(current.owner.revoked, false); assert.equal(f.core.scope('experts'), current);
});

test('同id Host实例和slot引用分别换代，未变更的完整帧保持作用域与挂载身份', t => {
  const f = fixture(); t.after(() => f.dispose());
  const first = f.slot('hello'); f.core.setFeatures(frame(feature('hello')), 1);
  let scope = f.core.scope('hello'), key = f.core.mountKey('hello');
  f.core.setFeatures(frame(feature('hello')), 1);
  assert.equal(f.core.scope('hello'), scope); assert.equal(f.core.mountKey('hello'), key);
  f.core.setFeatures(frame(feature('hello', 2)), 1);
  assert.equal(scope.owner.revoked, true); assert.notEqual(f.core.mountKey('hello'), key);
  scope = f.core.scope('hello'); key = f.core.mountKey('hello');
  first.remove(); f.slot('hello', { component: first.entry.component });
  assert.equal(scope.owner.revoked, true); assert.notEqual(f.core.mountKey('hello'), key);
  scope = f.core.scope('hello'); key = f.core.mountKey('hello');
  f.core.resetFeatures(2);
  assert.equal(scope.owner.revoked, true); assert.equal(f.core.entries().length, 1);
  f.core.setFeatures(frame(feature('hello', 1)), 2);
  assert.notEqual(f.core.mountKey('hello'), key, 'Host重启计数归一也不是旧实例');
});

test('撤销取消旧run、清回调和通知，所有公开副作用入口及旧提示动作失效', async t => {
  const f = fixture(); t.after(() => f.dispose());
  f.slot('hello'); f.core.setFeatures(frame(feature('hello')), 1);
  const scope = f.core.scope('hello'), trace = [];
  f.core.setManageFeatures(() => trace.push('manage'));
  f.core.bindAssistant({ open: () => trace.push('assistant'), setContext: () => trace.push('context') });
  scope.onRefresh(() => trace.push('refresh')); scope.guardLeave(() => '草稿');
  scope.notify('旧通知', { action: { label: '旧动作', run: () => trace.push('action') } });
  const action = f.notices.at(-1)[1].action;
  const pending = Promise.withResolvers(); let signal;
  const running = scope.run(async value => { signal = value; await pending.promise; return () => trace.push('late'); });
  f.core.setFeatures(frame(), 1);
  assert.equal(scope.owner.revoked, true); assert.equal(signal.aborted, true); assert.equal(f.core.snapshot().busy, false);
  assert.equal(f.core.hasRefresh('hello'), false);
  scope.openTab('experts'); scope.manageFeatures(); scope.assistant.open('x'); scope.assistant.setContext(['x']);
  scope.notify('迟到'); scope.setError('迟到'); scope.onRefresh(() => trace.push('new')); scope.guardLeave(() => '新草稿');
  await scope.run(() => trace.push('run')); action.run(); pending.resolve(); await running;
  assert.deepEqual(trace, []); assert.equal(f.core.hasRefresh('hello'), false);
  assert.equal(f.notices.some(([text]) => text === '迟到'), false);
});

test('工作台退出后重开同一登记使用新scope，旧作用域不继承管理和助手权限', t => {
  const f = fixture(); t.after(() => f.dispose());
  f.slot('hello'); f.core.setFeatures(frame(feature('hello')), 1);
  const old = f.core.scope('hello'); old.onRefresh(() => {});
  f.core.reset(); assert.equal(old.owner.revoked, true); assert.equal(f.core.hasRefresh('hello'), false);
  const current = f.core.scope('hello'); assert.notEqual(current, old); assert.equal(current.owner.revoked, false);
});

test('订阅创建和真实reset立即撤销旧资格，普通流错误保留上次完整帧，迟到结果不复活', async t => {
  const f = fixture(); t.after(() => f.dispose()); f.slot('hello');
  const events = new Map(), streams = [], epochs = [], errors = [];
  const on = (name, fn) => { events.set(name, fn); return () => events.delete(name); };
  const ctx = { on, remote: { $on: on, whalewingWorkbench: {
    features: async () => ({ ok: true, value: frame(feature('hello')) }),
    watchFeatures() { const requests = []; streams.push(requests); return { [Symbol.asyncIterator]() { return this; }, next() { const request = Promise.withResolvers(); requests.push(request); return request.promise; }, return: async () => ({ done: true }) }; },
  } } };
  const callbacks = { accept: (value, epoch) => f.core.setFeatures(value, epoch), reset: epoch => { epochs.push(epoch); f.core.resetFeatures(epoch); }, failure: error => errors.push(error) };
  const sync = watchFeatures(ctx, callbacks, { delays: [] }); t.after(() => sync.dispose());
  streams[0][0].resolve({ value: frame(feature('hello')), done: false }); await tick();
  const old = f.core.scope('hello'); streams[0][1].reject(new Error('临时中断')); await tick();
  assert.equal(errors.length, 1); assert.equal(old.owner.revoked, false);
  events.get('connection/reset')();
  assert.equal(old.owner.revoked, true); assert.equal(f.core.entries().length, 1); assert.equal(epochs[1].subscription, epochs[0].subscription); assert.ok(epochs[1].generation > epochs[0].generation);
  await tick(); streams[1][0].resolve({ value: frame(feature('hello')), done: false }); await tick();
  assert.equal(f.core.scope('hello').owner.revoked, false);
  sync.dispose(); assert.equal(f.core.entries().length, 1);
  const next = watchFeatures(ctx, callbacks, { delays: [] }); t.after(() => next.dispose());
  assert.ok(epochs.at(-1).subscription > epochs.at(-2).subscription);
});

test('新订阅已生效后拒收旧订阅迟到帧及dispose，即使旧连接代更大', t => {
  const f = fixture(); t.after(() => f.dispose()); f.slot('hello');
  f.core.setFeatures(frame(feature('hello')), { subscription: 2, generation: 0 });
  const current = f.core.scope('hello'), key = f.core.mountKey('hello');
  f.core.resetFeatures({ subscription: 1, generation: 99 });
  f.core.setFeatures(frame(), { subscription: 1, generation: 100 });
  assert.equal(f.core.scope('hello'), current); assert.equal(current.owner.revoked, false);
  assert.equal(f.core.mountKey('hello'), key); assert.equal(f.core.entries().length, 2);
});
