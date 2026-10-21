import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runInNewContext } from 'node:vm';
import { Context, Service } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import SavedText from '../host.js';
import { namespace, input } from '../contract.js';
import { packageName, featureId } from '../identity.js';
import { renderClient, renderPatch } from '../scripts/build.mjs';

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'saved-text-test-'));
  const ctx = new Context(); new TypertRegistry(ctx);
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  const profile = options.profile ?? path.join(directory, 'profile'); await mkdir(profile, { recursive: true });
  ctx.provide('profileContext', { dir: profile });
  let manifest;
  ctx.provide('whalewing', { features: { register(scope, value) { manifest = value; scope.effect(() => () => { manifest = undefined; }); } } });
  await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root: options.storage ?? path.join(directory, 'storage') });
  await ctx.plugin(StorageDomain, { backend: 'json' });
  const result = { ctx, directory, profile, get manifest() { return manifest; } };
  result.mount = async () => { result.fiber = ctx.plugin(SavedText); await result.fiber; result.service = ctx.get(namespace); };
  await result.mount(); return result;
}
const save = (revision, text = '独立保存文本') => ({ action: 'save', expectedRevision: revision, text });
const purge = revision => ({ action: 'purge', expectedRevision: revision, confirmation: 'DELETE_SAVED_TEXT' });

test('原生域提交、关闭保留、重开读回及明确清除；旧版本不覆盖新数据', async t => {
  const f = await fixture(t);
  assert.equal(f.manifest.id, featureId); assert.equal(f.manifest.package, packageName);
  assert.ok(f.ctx.typert.local.get(`${namespace}/manage`));
  assert.deepEqual(await f.service.manage({ action: 'read' }), { revision: 0, text: '', present: false });
  assert.deepEqual(await f.service.manage(save(0)), { revision: 1, text: '独立保存文本', present: true });
  await assert.rejects(f.service.manage(save(0, '旧窗口')), error => error.code === 'CONFLICT');
  const old = f.service;
  await f.fiber.dispose(); assert.equal(f.manifest, undefined); assert.equal(f.ctx.typert.getPackage(packageName), undefined);
  await assert.rejects(old.manage({ action: 'read' }), error => error.code === 'CLOSED');
  await f.mount(); assert.equal((await f.service.manage({ action: 'read' })).text, '独立保存文本');
  const cleared = await f.service.manage(purge(1));
  assert.deepEqual(cleared, { revision: 2, text: '', present: false });
  assert.deepEqual(await f.service.manage(purge(1)), cleared);
  await assert.rejects(f.service.manage(save(0)), error => error.code === 'CONFLICT');
  await f.fiber.dispose(); await f.mount(); assert.deepEqual(await f.service.manage({ action: 'read' }), cleared);
  assert.deepEqual((await readdir(f.profile)).filter(name => name.endsWith('.lock')), []);
});

test('严格入参和预取消不打开数据域，打开失败后原入口可重试', async t => {
  const f = await fixture(t); let opens = 0;
  const open = f.ctx.storageDomain.open.bind(f.ctx.storageDomain);
  f.ctx.storageDomain.open = async spec => { opens++; if (opens === 1) throw new Error('测试打开失败'); return open(spec); };
  await assert.rejects(f.service.manage({ action: 'purge', expectedRevision: 0 }));
  await assert.rejects(f.service.manage({ action: 'read', extra: true }));
  const cancel = new AbortController(); cancel.abort(new Error('预取消'));
  await assert.rejects(f.service.manage(save(0), cancel.signal), /预取消/); assert.equal(opens, 0);
  await assert.rejects(f.service.manage({ action: 'read' }), /测试打开失败/);
  assert.equal((await f.service.manage({ action: 'read' })).revision, 0); assert.equal(opens, 2);
  assert.deepEqual((await readdir(f.profile)).filter(name => name.endsWith('.lock')), []);
});

test('已接受写入不因取消报未保存；卸载排空写入并释放锁', async t => {
  const f = await fixture(t), open = f.ctx.storageDomain.open.bind(f.ctx.storageDomain);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(); let closed = false;
  f.ctx.storageDomain.open = async spec => {
    const domain = await open(spec), table = domain.table('settings'), put = table.put.bind(table), close = domain.close.bind(domain);
    table.put = async (...args) => { entered.resolve(); await release.promise; return put(...args); };
    domain.close = async () => { await close(); closed = true; }; return domain;
  };
  const cancel = new AbortController(), pending = f.service.manage(save(0), cancel.signal);
  await entered.promise;
  await assert.rejects(f.service.manage({ action: 'read' }), error => error.code === 'BUSY');
  cancel.abort(new Error('停止等待'));
  let disposed = false; const disposal = f.fiber.dispose().then(() => { disposed = true; });
  await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(disposed, false); assert.equal(closed, false);
  release.resolve(); assert.equal((await pending).text, '独立保存文本'); await disposal;
  assert.equal(closed, true); assert.deepEqual((await readdir(f.profile)).filter(name => name.endsWith('.lock')), []);
  f.ctx.storageDomain.open = open; await f.mount(); assert.equal((await f.service.manage({ action: 'read' })).revision, 1);
});

test('同profile不同上下文争用原生锁，不同profile数据隔离', async t => {
  const a = await fixture(t), b = await fixture(t, { profile: a.profile, storage: path.join(a.directory, 'storage') });
  const c = await fixture(t, { storage: path.join(a.directory, 'storage') });
  const original = a.ctx.storageDomain.open.bind(a.ctx.storageDomain), entered = Promise.withResolvers(), release = Promise.withResolvers();
  a.ctx.storageDomain.open = async spec => { entered.resolve(); await release.promise; return original(spec); };
  const pending = a.service.manage(save(0)); await entered.promise;
  await assert.rejects(b.service.manage({ action: 'read' }), /lock/i);
  release.resolve(); await pending;
  assert.equal((await b.service.manage({ action: 'read' })).text, '独立保存文本');
  assert.equal((await c.service.manage({ action: 'read' })).present, false);
});

test('浏览器契约使用自己的Remote，失效及取消结果不作为成功', async () => {
  let entry;
  runInNewContext(renderClient(), { window: { __ModuleLoader__: { load(value) { entry = value; } } } });
  const api = entry.factory(name => { assert.equal(name, 'react'); return {}; });
  assert.equal(entry.id, packageName);
  const signal = new AbortController().signal;
  assert.equal((await api.request({ manage: async () => ({ ok: true, value: { revision: 1, text: '结果', present: true } }) }, save(0), signal)).text, '结果');
  await assert.rejects(api.request({ manage: async () => ({ ok: false, error: { message: '版本冲突', code: 'CONFLICT' } }) }, save(0), signal), /版本冲突/);
  const cancel = new AbortController();
  await assert.rejects(api.request({ manage: async () => { cancel.abort(new Error('迟到')); return { ok: true, value: { revision: 1, text: '结果', present: true } }; } }, save(0), cancel.signal), /迟到/);
  assert.throws(() => input.parse({ action: 'purge', expectedRevision: 0, confirmation: 'yes' }));
});

test('完整源码可重建，产物同源且React external', async () => {
  assert.equal(await readFile(new URL('../client.js', import.meta.url), 'utf8'), renderClient());
  assert.equal(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), renderPatch());
  assert.match(renderClient(), /require\("react"\)/);
  assert.doesNotMatch(renderClient(), /react\.production|react\.development|node_modules\/react/);
});

test('Client卸载时取消读取，迟到Remote挂载只释放不更新页面', async () => {
  let entry, View, effect, updates = 0, requests = 0, released = 0, cleaned = 0;
  const mounting = Promise.withResolvers();
  const React = {
    createElement() {}, useState: value => [value, () => { updates++; }], useRef: value => ({ current: value }),
    useEffect: run => { effect = run; },
  };
  runInNewContext(renderClient(), { window: { __ModuleLoader__: { load(value) { entry = value; } } }, AbortController, AbortSignal, setTimeout, clearTimeout, console });
  const api = entry.factory(() => React);
  const scope = {
    remote: { $mount: () => mounting.promise, [namespace]: { manage: async () => { requests++; return { ok: true, value: { revision: 0, text: '', present: false } }; } } },
    locale: { resolveText: value => value.zh }, slots: { inject(name, run) { run(); }, register(options, component) { View = component; } },
  };
  api.apply({ inject(dependencies, run) { run(scope); } });
  View({ active: true, workbench: { ui: {}, onRefresh: () => () => { cleaned++; }, guardLeave: () => () => { cleaned++; }, notify: () => { updates++; }, run: task => task(new AbortController().signal) } });
  const dispose = effect(); dispose();
  const before = updates;
  mounting.resolve(async () => { released++; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(updates, before); assert.equal(requests, 0); assert.equal(released, 1); assert.equal(cleaned, 2);
});

test('挂载永不返回时十秒后可重试，新连接成功且旧挂载迟到仅清理', async () => {
  let entry, View, cursor = 0, pendingEffect, cleanup, lastDependencies;
  const cells = [], timers = new Map(), attempts = [], releases = [], notices = [];
  let timerId = 0, reads = 0, updates = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(value) {
      const index = cursor++; if (!(index in cells)) cells[index] = value;
      return [cells[index], next => { updates++; cells[index] = typeof next === 'function' ? next(cells[index]) : next; }];
    },
    useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
    useEffect(run, dependencies) {
      if (!lastDependencies || dependencies.some((value, index) => value !== lastDependencies[index])) {
        pendingEffect = run; lastDependencies = dependencies;
      }
    },
  };
  runInNewContext(renderClient(), {
    window: { __ModuleLoader__: { load(value) { entry = value; } } }, AbortController, AbortSignal, console,
    setTimeout(run, delay) { assert.equal(delay, 10000); const id = ++timerId; timers.set(id, run); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const api = entry.factory(() => React), scope = {
    remote: {
      $mount() { const pending = Promise.withResolvers(); attempts.push(pending); return pending.promise; },
      [namespace]: { manage: async () => { reads++; return { ok: true, value: { revision: 1, text: '已保存文本', present: true } }; } },
    },
    locale: { resolveText: value => value.zh }, slots: { inject(name, run) { run(); }, register(options, component) { View = component; } },
    inject(dependencies, run) {
      assert.deepEqual(Array.from(dependencies), ['remote.' + namespace]);
      let cleanup;
      run({ remote: this.remote, effect: start => { cleanup = start(); } });
      return { dispose: async () => cleanup?.() };
    },
  };
  const workbench = { ui: {}, onRefresh: () => () => {}, guardLeave: () => () => {}, notify: (...args) => notices.push(args), run: task => task(new AbortController().signal) };
  api.apply({ inject(dependencies, run) { run(scope); } });
  const render = () => {
    cursor = 0; const tree = View({ active: true, workbench });
    if (pendingEffect) { cleanup?.(); const run = pendingEffect; pendingEffect = undefined; cleanup = run(); }
    return tree;
  };
  const buttons = tree => !tree || typeof tree !== 'object' ? [] : [...(tree.type === 'button' ? [tree] : []), ...(tree.children ?? []).flatMap(buttons)];
  const tick = () => new Promise(resolve => setImmediate(resolve));
  let tree = render(); await tick(); assert.equal(attempts.length, 1);
  assert.equal(buttons(tree).find(button => button.children[0] === '正在连接…').props.disabled, true);
  const timeout = timers.values().next().value; timeout();
  tree = render();
  const retry = buttons(tree).find(button => button.children[0] === '重新连接');
  assert.ok(retry); assert.equal(retry.props.disabled, false); assert.match(notices.at(-1)[0], /超时/);
  // 第一次挂载此时仍然未settle；用户可以实际发起第二次连接。
  retry.props.onClick(); render(); await tick(); assert.equal(attempts.length, 2);
  attempts[1].resolve(async () => { releases.push('new'); }); await tick();
  tree = render(); assert.equal(reads, 1); assert.ok(buttons(tree).some(button => button.children[0] === '编辑文本'));
  const before = updates, count = notices.length;
  attempts[0].resolve(async () => { releases.push('old'); }); await tick();
  assert.deepEqual(releases, ['old']); assert.equal(reads, 1); assert.equal(updates, before); assert.equal(notices.length, count);
  buttons(tree).find(button => button.children[0] === '刷新').props.onClick(); await tick(); assert.equal(reads, 2);
  cleanup(); await tick(); assert.deepEqual(releases, ['old', 'new']); assert.equal(timers.size, 0);
});

test('真实Cordis兄弟插件要求显式namespace依赖，模板初读、断开及重连均成立', async t => {
  const f = await fixture(t);
  let entry, View, effect, refresh, remoteFiber, reads = 0, releases = 0;
  const values = [], notices = [];
  const React = {
    createElement() {}, useState: value => [value, next => values.push(next)], useRef: value => ({ current: value }),
    useEffect: run => { effect = run; },
  };
  runInNewContext(renderClient(), { window: { __ModuleLoader__: { load(value) { entry = value; } } }, AbortController, AbortSignal, setTimeout, clearTimeout, console });
  const api = entry.factory(() => React);
  // 每个依赖由真实兄弟插件提供；直接挂在root会绕过依赖检查，掩盖原失败。
  await f.ctx.plugin({ apply(ctx) {
    ctx.provide('slots', { inject(name, run) { run(); }, register(options, component) { View = component; } });
    ctx.provide('locale', { resolveText: value => value.zh });
    ctx.provide('whalewingWorkbench', {});
  } });
  await f.ctx.plugin({ apply(ctx) {
    const remote = new Service(ctx, 'remote');
    remote.$mount = async contribution => {
      assert.equal(contribution.package, packageName);
      const fiber = f.ctx.plugin({ apply(remoteCtx) {
        const service = new Service(remoteCtx, 'remote.' + namespace);
        service.manage = async (raw, signal) => { reads++; return { ok: true, value: await f.service.manage(raw, signal) }; };
      } });
      remoteFiber = fiber; await fiber;
      return async () => { releases++; await fiber.dispose(); };
    };
  } });
  const client = f.ctx.plugin(api); await client;
  await new Promise(resolve => setImmediate(resolve)); assert.equal(typeof View, 'function');
  const workbench = { ui: {}, notify: (...args) => notices.push(args),
    onRefresh: run => { refresh = run; return () => { refresh = null; }; }, guardLeave: () => () => {},
    run: task => task(new AbortController().signal) };
  View({ active: true, workbench });
  let dispose = effect();
  const until = async accept => {
    const deadline = Date.now() + 2000;
    while (!accept() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(accept(), '预期原生作用域操作在有界时间内完成');
  };
  await until(() => values.some(value => value?.revision === 0));
  assert.equal(reads, 1); assert.ok(notices.some(([text]) => text === '已读取保存状态'));
  await f.ctx.plugin({ inject: ['remote', 'whalewingWorkbench'], apply(ctx) {
    assert.throws(() => ctx.remote[namespace], /without inject/);
  } });
  await remoteFiber.dispose();
  await until(() => notices.some(([text]) => text.includes('连接已断开')));
  await refresh(); assert.equal(reads, 1);
  await until(() => releases === 1);
  dispose(); dispose = effect();
  await until(() => notices.filter(([text]) => text === '已读取保存状态').length === 2);
  assert.equal(reads, 2);
  await refresh(); assert.equal(reads, 3);
  dispose(); await until(() => releases === 2);
  const before = values.length, count = notices.length;
  await client.dispose();
  assert.equal(values.length, before); assert.equal(notices.length, count);
});
