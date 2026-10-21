import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { renderClient, renderPatch } from '../scripts/build.mjs';
import { apply as host, inject } from '../host.js';
import { packageName, featureId } from '../identity.js';

function client() {
  let entry;
  runInNewContext(renderClient(), { window: { __ModuleLoader__: { load(value) { entry = value; } } } });
  const api = entry.factory(name => { assert.equal(name, 'react'); return {}; });
  return { entry, api };
}
test('Host、浏览器、模块和原生行身份从同一包声明生成', () => {
  let registered;
  const ctx = { whalewing: { features: { register(scope, value) { assert.equal(scope, ctx); registered = value; } } } };
  host(ctx); assert.deepEqual(inject, ['whalewing']);
  assert.equal(registered.id, featureId); assert.equal(registered.package, packageName);
  const { entry, api } = client(); assert.equal(entry.id, packageName);
  let deferred, slot;
  api.apply({ inject(dependencies, run) { assert.deepEqual(Array.from(dependencies), ['whalewingWorkbench']); deferred = run; } });
  assert.equal(slot, undefined);
  deferred({ slots: { inject(name, run) { run(); }, register(options) { slot = options; } }, locale: { resolveText: value => value.zh } });
  assert.equal(slot.id, registered.id); assert.equal(slot.label(), '文本预览');
});
test('生成物与源码一致且 React 始终使用宿主实例', async () => {
  assert.equal(await readFile(new URL('../client.js', import.meta.url), 'utf8'), renderClient());
  assert.equal(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), renderPatch());
  assert.match(renderClient(), /require\("react"\)/);
  assert.doesNotMatch(renderClient(), /react\.production|react\.development|node_modules\/react/);
});
test('演示成功、预取消与运行中取消均收尾', async () => {
  let entry;
  runInNewContext(renderClient(), { window: { __ModuleLoader__: { load(value) { entry = value; } } }, setTimeout, clearTimeout });
  const { waitForDemo } = entry.factory(() => ({}));
  await waitForDemo(new AbortController().signal, 1);
  const before = new AbortController(); before.abort(new Error('预取消'));
  assert.throws(() => waitForDemo(before.signal), /预取消/);
  const during = new AbortController(); const pending = waitForDemo(during.signal, 1000); during.abort(new Error('用户停止'));
  await assert.rejects(pending, /用户停止/);
});
