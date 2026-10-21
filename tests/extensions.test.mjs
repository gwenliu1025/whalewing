import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getEventListeners } from 'node:events';
import { Context, Service } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import yaml from 'js-yaml';
import * as host from '../examples/feature-starter/host.js';
import { renderClient } from '../examples/feature-starter/scripts/build.mjs';
import { FeatureRegistry } from '../src/features.js';
import { parts } from '../features/index.js';
import { fixture, remoteScope } from './client-fixture.mjs';

const root = new URL('../examples/feature-starter/', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const tick = () => new Promise(setImmediate);
function load(source, React, timers = { setTimeout, clearTimeout }) {
  let entry;
  new Function('window', 'setTimeout', 'clearTimeout', source)({ __ModuleLoader__: { load(value) { entry = value; } } }, timers.setTimeout, timers.clearTimeout);
  assert.equal(entry.id, 'dsh-whalewing-hello');
  return entry.factory(name => { assert.equal(name, 'react', '模板只加载 DSH 的 React，不加载鲸翼内部代码'); return React; });
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props.children.includes(label));

test('扩展模板有独立原生行、元数据、预构建入口和许可，不自动加入鲸翼或虚构兼容版本', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'dsh-whalewing-hello'); assert.equal(pkg.type, 'module');
  assert.equal(pkg.peerDependencies?.['dsh-whalewing'], undefined);
  for (const file of ['host.js', 'client.js', 'package.json', 'locale/zh.json', 'locale/en.json', 'icon.svg', 'LICENSE', 'README.md']) assert.ok((await read(file)).length);
  assert.deepEqual(yaml.load(await read('cordis.patch.yml')), [{ insert: [{ id: 'whalewing-hello', name: pkg.name }] }]);
  assert.equal(pkg.exports['.'], './host.js'); assert.equal(pkg.exports['./client'], './client.js');
  assert.deepEqual(pkg.dsh.client.inject, ['dsh-whalewing']);
  const locale = JSON.parse(await read('locale/zh.json'));
  assert.equal(locale.meta.title, '文本预览'); assert.ok(locale.meta.description);
  const main = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(main.files.includes('EXTENDING.md')); assert.ok(main.files.includes('examples/feature-starter'));
  assert.doesNotMatch(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), /whalewing-hello/);
  const docs = await readFile(new URL('../EXTENDING.md', import.meta.url), 'utf8');
  assert.match(docs, /以首个带 v1 扩展接口的封版版本为准/);
  assert.match(docs, /不返回 task 结果/);
});

test('预构建产物可从模板源码重建，运行时不复制 React 或引用鲸翼内部接口', async () => {
  assert.equal(await read('client.js'), renderClient());
  const source = await read('src/client.js');
  assert.doesNotMatch(source, /\.internal\b|\.owner\b|\.operation\b|from ['"].*whalewing/);
  const plugin = load(await read('client.js'), {});
  assert.deepEqual(plugin.inject, ['slots', 'locale']);
  assert.equal(typeof plugin.apply, 'function');
});

test('真实 Cordis 模板缺鲸翼时等待，提供后登记，总开关消失后撤销再恢复', async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  const extension = ctx.plugin(host);
  assert.equal(extension.ctx.fiber.state, 0);
  let registry;
  const core = { apply(scope) {
    registry = new FeatureRegistry(scope);
    scope.provide('whalewing', { apiVersion: 1, features: { register: (caller, manifest) => registry.register(caller, manifest) } });
  } };
  const first = ctx.plugin(core); await first; await extension;
  assert.equal(extension.ctx.fiber.state, 2);
  assert.equal(registry.snapshot().features[0].id, 'hello');
  assert.equal(registry.snapshot().features[0].kind, 'extension');
  const old = registry;
  await first.dispose(); await tick();
  assert.equal(extension.ctx.fiber.state, 0); assert.equal(old.entries.size, 0);
  const second = ctx.plugin(core); await second; await extension;
  assert.equal(registry.snapshot().features.length, 1);
  await extension.dispose(); assert.equal(registry.snapshot().features.length, 0);
});

test('真实浏览器Loader入口缺鲸翼仍active，子作用域随总开关恢复/撤销而不阻断冷启动', async t => {
  const ctx = new Context(), entries = new Map(); t.after(() => ctx.fiber.dispose());
  class Slots extends Service {
    constructor(scope) { super(scope, 'slots'); }
    inject(name, callback) { return this.ctx.effect(callback); }
    register(options) {
      assert.equal(entries.has(options.id), false, '重开不重复登记');
      entries.set(options.id, options);
      return () => entries.delete(options.id);
    }
  }
  await ctx.plugin(Slots); ctx.provide('locale', { resolveText: text => text.zh });
  await ctx.plugin(Loader, { baseUrl: import.meta.url });
  const plugin = load(await read('client.js'), {});
  ctx.loader.internal = { import: async name => { assert.equal(name, 'dsh-whalewing-hello'); return plugin; } };
  const id = await ctx.loader.create({ name: 'dsh-whalewing-hello' });
  await ctx.loader.await();
  const entry = ctx.loader.resolve(id);
  assert.equal(entry.fiber.state, 2, 'DSH冷启动审计的loader入口必须active');
  assert.equal(entries.size, 0);
  const provide = scope => scope.provide('whalewingWorkbench', {});
  const first = await ctx.plugin(provide); await tick();
  assert.equal(entries.get('hello').label(), '文本预览');
  await first.dispose(); await tick();
  assert.equal(entries.size, 0); assert.equal(entry.fiber.state, 2);
  const second = await ctx.plugin(provide); await tick();
  assert.equal(entries.size, 1); assert.equal(entry.fiber.state, 2);
  await ctx.loader.remove(id); await tick();
  assert.equal(entries.size, 0);
  await second.dispose(); await ctx.plugin(provide); await tick();
  assert.equal(entries.size, 0, '已卸载入口不得被服务恢复重新激活');
});

test('模板有界等待在成功、取消和预取消时清理定时器与监听', async () => {
  const timers = new Map(); let next = 0;
  const plugin = load(await read('client.js'), {}, { setTimeout(fn, delay) { assert.equal(delay, 2000); timers.set(++next, fn); return next; }, clearTimeout(id) { timers.delete(id); } });
  const success = new AbortController(), pending = plugin.waitForDemo(success.signal);
  assert.equal(timers.size, 1); assert.equal(getEventListeners(success.signal, 'abort').length, 1);
  [...timers.values()][0](); await pending;
  assert.equal(timers.size, 0); assert.equal(getEventListeners(success.signal, 'abort').length, 0);
  const cancel = new AbortController(), stopped = plugin.waitForDemo(cancel.signal);
  cancel.abort(); await assert.rejects(stopped, { name: 'AbortError' });
  assert.equal(timers.size, 0); assert.equal(getEventListeners(cancel.signal, 'abort').length, 0);
  assert.throws(() => plugin.waitForDemo(cancel.signal), { name: 'AbortError' });
  assert.equal(timers.size, 0);
});

test('模板用真实工作台 scoped 接口刷新和保活，取消后无成功提示，撤销时清理页签及回调', async t => {
  const f = await fixture({ expand: ['TextPreview'] });
  const cleanups = [];
  t.after(async () => { await Promise.all(cleanups.reverse().map(fn => fn())); f.unmount(); await Promise.all(f.disposed.reverse().map(fn => fn())); });
  const timers = new Map(); let next = 0;
  const plugin = load(await read('client.js'), f.react, { setTimeout(fn) { timers.set(++next, fn); return next; }, clearTimeout(id) { timers.delete(id); } });
  plugin.apply(remoteScope(f.ctx, plugin.inject, [], cleanups));
  await f.featureUpdate({ revision: 1, features: [...parts.map((part, index) => ({ id: part.id, kind: part.kind, api: 1, package: 'dsh-whalewing', skills: [], instance: index + 1 })), { id: 'hello', kind: 'extension', api: 1, package: 'dsh-whalewing-hello', skills: [], instance: 10, tab: { keepAlive: true } }] });
  await button(f.render(), '文本预览').props.onClick(); f.flushEffects();
  let tree = f.render();
  const input = nodes(tree).find(node => node.props['aria-label'] === '预览文字');
  input.props.onChange({ target: { value: '临时文字' } });
  button(f.render(), '预览文本').props.onClick();
  const dialog = nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === '文本预览');
  assert.ok(dialog); assert.ok(nodes(dialog).some(node => node.props.children.includes('临时文字')));
  nodes(dialog).find(node => node.type === 'button').props.onClick();
  button(f.render(), '刷新').props.onClick();
  assert.ok(nodes(f.render()).some(node => node.props.children.includes('文本预览已刷新')));
  await button(f.render(), '专家团队').props.onClick();
  await button(f.render(), '文本预览').props.onClick(); f.flushEffects();
  assert.equal(nodes(f.render()).find(node => node.props['aria-label'] === '预览文字').props.value, '临时文字');
  const completed = button(f.render(), '运行本地演示').props.onClick();
  assert.equal(timers.size, 1); [...timers.values()][0](); await completed;
  assert.equal(timers.size, 0);
  assert.ok(nodes(f.render()).some(node => node.props.children.includes('本地演示已完成')));
  const running = button(f.render(), '运行本地演示').props.onClick();
  button(f.render(), '停止等待结果').props.onClick(); await running;
  assert.equal(timers.size, 0);
  assert.equal(nodes(f.render()).some(node => node.props.children.includes('本地演示已完成')), false);
  const closing = button(f.render(), '运行本地演示').props.onClick();
  await Promise.all(cleanups.splice(0).reverse().map(fn => fn())); f.render(); await closing;
  tree = f.render();
  assert.equal(timers.size, 0);
  assert.equal(button(tree, '文本预览'), undefined);
  assert.equal(button(tree, '停止等待结果'), undefined);
  assert.equal(f.ctx.whalewingWorkbench.internal.hasRefresh('hello'), false);
  assert.equal(nodes(tree).some(node => node.props.children.includes('本地演示已完成')), false);
});
