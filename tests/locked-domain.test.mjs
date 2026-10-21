import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LockedDomain } from '../src/host/locked-domain.js';

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whalewing-locked-domain-'));
  const events = [], lock = path.join(root, 'fixture.lock');
  const domain = { async close() { await stat(lock); events.push('domain-close'); } };
  const owner = { async dispose() { await stat(lock); events.push('owner-dispose'); } };
  const resource = new LockedDomain({
    directory: async () => root, lockName: 'fixture', definition: directory => ({ directory }),
    facility: () => ({ async open(spec) { assert.equal(spec.directory, root); events.push('open'); return domain; } }),
    create: () => owner, ...overrides,
  });
  t.after(async () => { await resource.close().catch(() => {}); await rm(root, { recursive: true, force: true }); });
  return { root, lock, domain, owner, events, resource };
}

test('内部持锁域并发开一次，取消单个等待者不取消另一调用的初始化', async t => {
  const f = await fixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  const open = f.resource.options.facility().open;
  f.resource.options.facility = () => ({ async open(spec) { entered.resolve(); await release.promise; return open(spec); } });
  const caller = new AbortController();
  const first = f.resource.get(caller.signal), second = f.resource.get();
  const rejected = assert.rejects(first, /本次等待取消/);
  try {
    await entered.promise; caller.abort(new Error('本次等待取消')); await rejected;
    assert.equal(f.resource.signal.aborted, false);
    release.resolve(); assert.equal(await second, f.owner);
    assert.deepEqual(f.events, ['open']);
  } finally { release.resolve(); await Promise.allSettled([first, second]); }
});

test('内部持锁域构造失败完成关域和放锁后才回报，下次明确调用重新打开', async t => {
  let calls = 0;
  const f = await fixture(t);
  f.resource.options.create = () => { if (++calls === 1) throw new Error('构造失败'); return f.owner; };
  await assert.rejects(f.resource.get(), /构造失败/);
  assert.equal(f.resource.owner, undefined); assert.equal(f.resource.pending.size, 0);
  await assert.rejects(stat(f.lock), { code: 'ENOENT' });
  assert.deepEqual(f.events, ['open', 'domain-close']);
  assert.equal(await f.resource.get(), f.owner); assert.equal(calls, 2);
});

test('内部持锁域卸载排空未知写入后按业务、域、锁顺序关闭，重复关闭共用结果', async t => {
  const f = await fixture(t); await f.resource.get();
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const writing = f.resource.run(async () => { entered.resolve(); await release.promise; f.events.push('readback'); return '已持久化'; });
  try {
    await entered.promise;
    const closing = f.resource.close(); assert.equal(f.resource.close(), closing);
    await assert.rejects(f.resource.run(() => assert.fail('卸载后不再接收新业务')), /卸载/);
    await assert.rejects(f.resource.get(), /卸载/);
    assert.deepEqual(f.events, ['open']); await stat(f.lock);
    release.resolve(); assert.equal(await writing, '已持久化'); await closing;
    assert.deepEqual(f.events, ['open', 'readback', 'owner-dispose', 'domain-close']);
    assert.equal(f.resource.pending.size, 0); await assert.rejects(stat(f.lock), { code: 'ENOENT' });
  } finally { release.resolve(); await writing; }
});

for (const stage of ['dispose', 'close']) test(`内部持锁域已发布后的${stage}失败由卸载返回，仍退出原生文件锁`, async t => {
  const f = await fixture(t); await f.resource.get();
  if (stage === 'dispose') f.owner.dispose = async () => { f.events.push('dispose-failed'); throw new Error('业务清理失败'); };
  else f.domain.close = async () => { f.events.push('close-failed'); throw new Error('域关闭失败'); };
  await assert.rejects(f.resource.close(), /失败/);
  if (stage === 'dispose') assert.deepEqual(f.events, ['open', 'dispose-failed', 'domain-close']);
  else assert.deepEqual(f.events, ['open', 'owner-dispose', 'close-failed']);
  await assert.rejects(stat(f.lock), { code: 'ENOENT' });
});
