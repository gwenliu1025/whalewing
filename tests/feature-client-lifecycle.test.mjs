import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { connectRemote } from '../src/shell/remote.js';
import { watchFeatures } from '../src/shell/feature-sync.js';

const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const frame = (revision, ids = []) => ({ revision, features: ids.map((id, index) => ({ instance: index + 1, id, kind: 'optional', api: 1, package: 'fixture', skills: [] })) });
function fixture(options = {}) {
  const events = new Map(), streams = [], accepted = [], errors = [], snapshots = [];
  const on = (name, fn) => { events.set(name, fn); return () => events.delete(name); };
  const ctx = { on, remote: { $on: on, whalewingWorkbench: {
    features: () => { const request = deferred(); snapshots.push(request); return request.promise; },
    retryBase: async id => ({ ok: true, value: frame(12, [id]) }),
    watchFeatures(signal) {
      const requests = [], stream = { signal, requests, returned: 0 };
      streams.push(stream);
      return { [Symbol.asyncIterator]() { return this; }, next() { const request = deferred(); requests.push(request); return request.promise; }, return() { stream.returned++; return Promise.resolve({ done: true }); } };
    },
  } } };
  const sync = watchFeatures(ctx, { accept: value => accepted.push(value), failure: (error, retry) => errors.push({ error, retry }) }, { deadline: 100, ...options });
  return { ctx, sync, events, streams, accepted, errors, snapshots };
}

test('真实Cordis挂起Remote不阻挡dispose，迟到挂载释放且不登记入口', async t => {
  const ctx = new Context(), pending = deferred(), trace = [];
  ctx.provide('remote', { $mount: () => pending.promise });
  t.after(() => ctx.fiber.dispose());
  const fork = await ctx.plugin({ inject: ['remote'], apply(scope) { connectRemote(scope, {}, () => trace.push('ready'), error => trace.push(error.message)); } });
  await fork.dispose();
  assert.equal(fork.uid, null); assert.deepEqual(trace, []);
  pending.resolve(() => trace.push('unmount')); await tick();
  assert.deepEqual(trace, ['unmount']);
});

test('真实Cordis已挂载Remote只释放一次，新实例不受旧实例迟到收尾影响', async t => {
  const ctx = new Context(), old = deferred(), trace = []; let mounts = 0;
  ctx.provide('remote', { $mount: () => ++mounts === 1 ? old.promise : Promise.resolve(() => trace.push('new-unmount')) });
  t.after(() => ctx.fiber.dispose());
  const plugin = { inject: ['remote'], apply(scope) { connectRemote(scope, {}, () => trace.push('ready'), error => trace.push(error.message)); } };
  const first = await ctx.plugin(plugin); await first.dispose();
  const second = await ctx.plugin(plugin); await tick();
  old.resolve(() => trace.push('old-unmount')); await tick();
  assert.deepEqual(trace, ['ready', 'old-unmount']);
  await second.dispose(); assert.deepEqual(trace, ['ready', 'old-unmount', 'new-unmount']);
});

test('stream和事件快照共用revision水位，旧快照和重复帧不回退权威状态', async t => {
  const f = fixture(); t.after(() => f.sync.dispose());
  f.streams[0].requests[0].resolve({ value: frame(3, ['cards']), done: false }); await tick();
  f.events.get('plugin-manager/changed')();
  f.streams[0].requests[1].resolve({ value: frame(5), done: false }); await tick();
  f.snapshots[0].resolve({ ok: true, value: frame(4, ['cards']) }); await tick();
  f.streams[0].requests[2].resolve({ value: frame(5, ['cards']), done: false }); await tick();
  assert.deepEqual(f.accepted.map(value => value.revision), [3, 5]); assert.deepEqual(f.accepted.at(-1).features, []);
});

test('reset更换连接代并接受较小revision，旧stream和快照迟到均拒收', async t => {
  const f = fixture(); t.after(() => f.sync.dispose());
  f.streams[0].requests[0].resolve({ value: frame(90), done: false }); await tick();
  f.events.get('plugin-manager/changed')(); await tick();
  f.events.get('connection/reset')(); await tick();
  assert.equal(f.streams[0].signal.aborted, true); assert.equal(f.streams[0].returned, 1);
  f.streams[1].requests[0].resolve({ value: frame(0, ['cards']), done: false });
  f.streams[0].requests[1].resolve({ value: frame(99), done: false });
  f.snapshots[0].resolve({ ok: true, value: frame(100) });
  await tick(); assert.deepEqual(f.accepted.map(value => value.revision), [90, 0]);
});

test('stream失败重订阅预算有界，网络失败不发布空列表，恢复由明确重试进入', async t => {
  const f = fixture({ delays: [0, 0] }); t.after(() => f.sync.dispose());
  f.streams[0].requests[0].resolve({ value: frame(4, ['cards']), done: false }); await tick();
  f.streams[0].requests[1].reject(new Error('offline'));
  for (let i = 1; i < 3; i++) { while (f.streams.length <= i) await new Promise(resolve => setTimeout(resolve, 1)); f.streams[i].requests[0].reject(new Error('offline')); }
  await tick(); await tick();
  assert.equal(f.streams.length, 3); assert.equal(f.errors.length, 1); assert.equal(f.accepted.at(-1).features[0].id, 'cards');
  void f.errors[0].retry(); await tick(); assert.equal(f.streams.length, 4);
});

test('首帧超时取消stream并return，普通快照超时仅终止本地等待且丢弃迟到结果', async t => {
  const f = fixture({ delays: [], deadline: 5 }); t.after(() => f.sync.dispose());
  f.events.get('plugin-manager/changed')();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(f.streams[0].signal.aborted, true); assert.equal(f.streams[0].returned, 1);
  assert.ok(f.errors.length >= 1);
  f.snapshots[0].resolve({ ok: true, value: frame(4) });
  f.streams[0].requests[0].resolve({ value: frame(5), done: false }); await tick();
  assert.deepEqual(f.accepted, []);
});

test('卸载撤销两个事件并取消next等待，晚到快照不写旧页面', async () => {
  const f = fixture();
  f.streams[0].requests[0].resolve({ value: frame(0), done: false }); await tick();
  f.events.get('plugin-manager/changed')(); await tick();
  f.sync.dispose(); await tick();
  assert.equal(f.events.size, 0); assert.equal(f.streams[0].returned, 1); assert.equal(f.streams[0].signal.aborted, true);
  f.snapshots[0].resolve({ ok: true, value: frame(10) }); await tick();
  assert.deepEqual(f.accepted.map(value => value.revision), [0]); assert.equal(f.errors.length, 0);
});


test('普通RPC超时保持单飞，retryBase未知完成不并发重发，结果只由新权威帧接受', async t => {
  const f = fixture({ deadline: 5 }); t.after(() => f.sync.dispose());
  f.streams[0].requests[0].resolve({ value: frame(0), done: false }); await tick();
  f.events.get('plugin-manager/changed')(); await tick();
  await new Promise(resolve => setTimeout(resolve, 15));
  f.events.get('plugin-manager/changed')(); await tick();
  assert.equal(f.snapshots.length, 1);
  const pending = deferred(); let calls = 0;
  f.ctx.remote.whalewingWorkbench.retryBase = () => { calls++; return pending.promise; };
  await assert.rejects(f.sync.retryBase('experts'), /超时/);
  await assert.rejects(f.sync.retryBase('experts'), /仍在等待结果/); assert.equal(calls, 1);
  pending.resolve({ ok: true, value: frame(10) }); await tick();
  assert.deepEqual(f.accepted.map(value => value.revision), [0]);
  f.ctx.remote.whalewingWorkbench.retryBase = async () => ({ ok: true, value: frame(11) });
  await f.sync.retryBase('experts'); assert.equal(f.accepted.at(-1).revision, 11);
});
