import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { Context, Service } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { FeatureRegistry } from '../src/features.js';
import { WhalewingSkillProvider } from '../src/skill-provider.js';
import { parts } from '../features/index.js';
import { mountFeatures } from './feature-fixture.mjs';
import { Vault } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';

const manifest = id => ({ id, api: 1, package: 'dsh-feature-fixture' });

test('清单含五底座四可选，子路径元数据与导出完整且旧行退出', async () => {
  assert.deepEqual(parts.filter(part => part.kind === 'base').map(part => part.id), ['experts', 'assistant', 'knowledge', 'skills', 'automation']);
  assert.deepEqual(parts.filter(part => part.kind === 'optional').map(part => part.id), ['ai-web', 'toolbox', 'cards', 'model-world']);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.exports['./tools'], undefined); assert.equal(pkg.exports['./experts'], undefined);
  for (const part of parts) {
    assert.ok((await readFile(new URL(`../features/${part.id}/host.js`, import.meta.url))).length);
    if (part.kind === 'base') { assert.equal(pkg.exports[`./${part.id}`], undefined); continue; }
    assert.equal(pkg.exports[`./${part.id}`], `./features/${part.id}/host.js`);
    const metadata = JSON.parse(await readFile(new URL(`../features/${part.id}/package.json`, import.meta.url)));
    assert.equal(metadata.type, 'module');
    assert.ok((await readFile(new URL(`../features/${part.id}/${metadata.icon}`, import.meta.url))).length < 262144);
    for (const language of ['zh', 'en']) {
      const locale = JSON.parse(await readFile(new URL(`../features/${part.id}/locale/${language}.json`, import.meta.url)));
      assert.ok(locale.meta.title && locale.meta.description);
    }
  }
});

test('目标版原生元信息解析保留四个子路径图标及根包和模板图标', async () => {
  // 两版宿主读取图标的契约不同；在独立进程使用其真实 Node resolver，避免文件存在检查掩盖导出遗漏。
  const root = new URL('../', import.meta.url);
  const optional = parts.filter(part => part.kind === 'optional');
  const requests = [
    ...optional.map(part => ({ specifier: `dsh-whalewing/${part.id}`, parent: new URL('index.js', root).href, icon: `features/${part.id}/icon.svg`, mime: 'image/svg+xml' })),
    { specifier: 'dsh-whalewing', parent: new URL('index.js', root).href, icon: 'art/brand/whalewing-app-256.png', mime: 'image/png' },
    { specifier: 'dsh-whalewing-hello', parent: new URL('examples/feature-starter/host.js', root).href, icon: 'examples/feature-starter/icon.svg', mime: 'image/svg+xml' },
  ];
  const child = spawnSync(process.execPath, ['--expose-internals', '--input-type=module', '-e', `
    import { readPluginMeta } from '@deepseek-ai/dsh-app-boot';
    console.log(JSON.stringify(${JSON.stringify(requests)}.map(({ specifier, parent }) => readPluginMeta(specifier, parent))));
  `], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(child.status, 0, child.error?.message ?? child.stderr);
  const metadata = JSON.parse(child.stdout);
  assert.equal(metadata.length, requests.length);
  for (const [index, request] of requests.entries()) {
    assert.ok(metadata[index], request.specifier);
    assert.equal(metadata[index].error, undefined, request.specifier);
    assert.ok(metadata[index].title && metadata[index].description, request.specifier);
    const bytes = await readFile(new URL(request.icon, root));
    assert.equal(metadata[index].icon, `data:${request.mime};base64,${bytes.toString('base64')}`, request.specifier);
  }
  assert.equal(new Set(metadata.slice(0, optional.length).map(meta => meta.icon)).size, optional.length);
});

test('真实Cordis登记首帧、变化、撤销、取消；关闭的内置id仍保留且输入边界严格', async t => {
  const ctx = new Context(), registry = new FeatureRegistry(ctx);
  t.after(() => ctx.fiber.dispose());
  const controller = new AbortController(), stream = registry.watch(controller.signal);
  assert.deepEqual((await stream.next()).value, { revision: 0, features: [] });
  let unregister;
  const feature = await ctx.plugin(scope => { unregister = registry.register(scope, manifest('external')); });
  const frame = (await stream.next()).value;
  assert.equal(frame.features[0].kind, 'extension'); assert.ok(frame.revision > 0);
  assert.throws(() => registry.register(ctx, manifest('external')), { code: 'FEATURE_CONFLICT' });
  for (const part of parts) assert.throws(() => registry.register(ctx, { ...manifest(part.id), package: 'dsh-whalewing' }), { code: 'FEATURE_CONFLICT' });
  assert.throws(() => registry.register(ctx, { ...manifest('v2'), api: 2 }), { code: 'FEATURE_API' });
  for (const invalid of [{ package: '../bad' }, { skills: ['relative/path'] }, { tab: { placement: 'left' } }, { tab: { extra: true } }, { extra: true }]) assert.throws(() => registry.register(ctx, { ...manifest('invalid'), ...invalid }));
  unregister(); await feature.dispose();
  assert.equal((await stream.next()).value.features.length, 0);
  const waiting = stream.next(); controller.abort(); assert.equal((await waiting).done, true);
  assert.equal(registry.listeners.size, 0);
});

test('底座同步/异步失败不拖垮兄弟，失败登记保留，原生restart重试与依赖waiting可恢复', async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  const definitions = ['sync', 'async', 'waiting', 'healthy', 'invalid'].map(id => ({ id, kind: 'base' }));
  const registry = new FeatureRegistry(ctx, definitions); let broken = true;
  const plugin = id => ({ ...(id === 'waiting' ? { inject: ['fixtureReady'] } : {}), apply(scope) {
    registry.register(scope, { ...manifest(id), package: 'dsh-whalewing' }, id);
    if (broken && id === 'sync') throw new Error('同步启动失败');
    if (broken && id === 'async') return Promise.reject(new Error('异步启动失败'));
  } });
  for (const part of definitions) registry.loadBase(part, () => ctx.plugin(part.id === 'invalid' ? {} : plugin(part.id)));
  await Promise.all([...registry.bases.values()].filter(base => base.fiber).map(base => registry.observe(base)));
  const snapshot = registry.snapshot();
  assert.match(snapshot.features.find(feature => feature.id === 'sync').error, /同步启动失败/);
  assert.match(snapshot.features.find(feature => feature.id === 'async').error, /异步启动失败/);
  assert.match(snapshot.features.find(feature => feature.id === 'waiting').error, /依赖/);
  assert.match(snapshot.features.find(feature => feature.id === 'invalid').error, /invalid plugin/);
  assert.equal(snapshot.features.find(feature => feature.id === 'healthy').error, undefined);
  assert.equal(ctx.fiber.state, 2);
  broken = false;
  await registry.retry('sync'); await registry.retry('async');
  assert.equal(registry.snapshot().features.filter(feature => ['sync', 'async'].includes(feature.id)).every(feature => !feature.error), true);
  ctx.provide('fixtureReady', {}); await registry.bases.get('waiting').fiber.await();
  assert.equal(registry.snapshot().features.find(feature => feature.id === 'waiting').error, undefined);
  await assert.rejects(registry.retry('external'), { code: 'FEATURE_RETRY' });
});

test('公开只读知识接口追踪真实功能、子Service与后代，拒收未登记和已卸载调用', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-feature-callers-'));
  const ctx = new Context(); new TypertRegistry(ctx);
  for (const name of ['commands', 'sessionProjections']) ctx.provide(name, { register() {} });
  for (const name of ['sessions', 'sessionQuery', 'skills']) ctx.provide(name, {});
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  const { service } = await mountFeatures(ctx, directory, {}, false);
  const execute = service.execute.bind(service);
  const calls = []; service.execute = async (input, caller) => { calls.push({ input, caller }); return input; };
  class Relay extends Service {
    static inject = ['whalewing'];
    constructor(scope) { super(scope, 'fixtureRelay'); }
    read() { return this.ctx.whalewing.knowledge.read('40-知识/依据.md'); }
  }
  await ctx.plugin(Relay);
  let featureContext, descendant;
  const child = { inject: ['whalewing', 'fixtureRelay'], apply(scope) { descendant = scope; } };
  const feature = await ctx.plugin({ inject: ['whalewing', 'fixtureRelay'], async apply(scope) {
    featureContext = scope;
    scope.whalewing.features.register(scope, manifest('reader'));
    await scope.plugin(child);
  } });
  await featureContext.whalewing.knowledge.search('依据');
  await descendant.fixtureRelay.read();
  assert.deepEqual(calls.map(call => [call.caller.kind, call.caller.package, call.caller.feature]), [['plugin', 'dsh-feature-fixture', 'reader'], ['plugin', 'dsh-feature-fixture', 'reader']]);
  assert.deepEqual(calls.map(call => call.input.action), ['search', 'read']);
  assert.throws(() => ctx.fixtureRelay.read(), { code: 'FEATURE_CALLER' });
  assert.throws(() => featureContext.whalewing.knowledge.search('x', { action: 'write' }));
  service.execute = execute;
  const found = await featureContext.whalewing.knowledge.search('');
  assert.ok(found.notes.length);
  const note = await descendant.whalewing.knowledge.read(found.notes[0].path);
  assert.equal(note.path, found.notes[0].path); assert.ok(note.content);
  const captured = descendant.whalewing.knowledge;
  await feature.dispose();
  assert.throws(() => captured.read('40-知识/依据.md'), { code: 'FEATURE_CLOSED' });
  assert.equal(calls.length, 2);
});

test('随包技能按活动功能过滤list与缓存get，关闭不删文件，外部技能不走个人演进规则', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-feature-skills-'));
  const vault = new Vault(path.join(directory, 'vault')), library = new SkillLibrary(vault, path.join(directory, 'skills'));
  let features = [{ id: 'knowledge', package: 'dsh-whalewing', skills: [path.join(directory, 'whalewing-knowledge')] }, { id: 'cards', package: 'dsh-whalewing', skills: [path.join(directory, 'whalewing-news')] }];
  const changes = new Set();
  const ctx = { logger: { warn() {} }, get() {}, on(_name, fn) { changes.add(fn); return () => changes.delete(fn); } }, controller = new AbortController();
  const provider = new WhalewingSkillProvider(ctx, { signal: controller.signal, invalidate() {} }, library, () => ({ features }));
  t.after(async () => { await provider.dispose(); await rm(directory, { recursive: true, force: true }); });
  const options = { signal: controller.signal }, rows = value => Array.isArray(value) ? value : value.candidates;
  const before = rows(await provider.list(options)), news = before.find(skill => skill.name === 'whalewing-news'); assert.ok(news);
  features = features.filter(feature => feature.id !== 'cards');
  assert.equal(rows(await provider.list(options)).some(skill => skill.name === 'whalewing-news'), false);
  await assert.rejects(provider.get(news, options), { code: 'FEATURE_DISABLED' });
  assert.ok((await readFile(news.locator.path)).length);
  const external = path.join(directory, 'extension'); await mkdir(external);
  await writeFile(path.join(external, 'SKILL.md'), '---\nname: external-method\ndescription: 扩展提供的独立方法与资源\n---\n扩展正文。\n');
  features.push({ id: 'external', kind: 'extension', package: 'dsh-feature-fixture', skills: [external] });
  const found = rows(await provider.list(options)).find(skill => skill.name === 'external-method'); assert.ok(found);
  assert.match((await provider.get(found, options)).content, /扩展正文/);
  const externalProvider = provider.extensions.get(external), disposeExternal = externalProvider.dispose.bind(externalProvider);
  let closed = false; externalProvider.dispose = async () => { await disposeExternal(); closed = true; };
  features = features.filter(feature => feature.id !== 'external');
  for (const notify of changes) notify();
  await Promise.all([...provider.retiring]);
  assert.equal(closed, true, '无后续list也立即关闭外部watcher');
  assert.equal(provider.extensions.size, 0);
  await assert.rejects(provider.get(found, options), { code: 'FEATURE_DISABLED' });
  features.push({ id: 'cards', package: 'dsh-whalewing', skills: [path.join(directory, 'whalewing-news')] });
  assert.ok(rows(await provider.list(options)).some(skill => skill.name === 'whalewing-news'));
  assert.ok((await provider.get(news, options)).content);
});


test('外部发现迟到返回不恢复已关闭技能，核心dispose后不新开watcher', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-skill-late-'));
  const library = new SkillLibrary(new Vault(path.join(directory, 'vault')), path.join(directory, 'skills'));
  const root = path.join(directory, 'extension'); await mkdir(root);
  await writeFile(path.join(root, 'SKILL.md'), '---\nname: late-method\ndescription: 延迟返回的扩展方法\n---\n扩展正文。\n');
  let features = [{ id: 'late', kind: 'extension', package: 'fixture', skills: [root] }];
  const listeners = new Set(), control = { signal: new AbortController().signal, invalidate() {} };
  const provider = new WhalewingSkillProvider({ logger: { warn() {} }, get() {}, on(_, fn) { listeners.add(fn); return () => listeners.delete(fn); } }, control, library, () => ({ features }));
  t.after(async () => { await provider.dispose(); await rm(directory, { recursive: true, force: true }); });
  await provider.list(control);
  const extension = provider.extensions.get(root), original = extension.list.bind(extension), entered = Promise.withResolvers(), release = Promise.withResolvers();
  extension.list = async options => { const result = await original(options); entered.resolve(); await release.promise; return result; };
  const listing = provider.list(control); await entered.promise;
  features = []; for (const listener of listeners) listener(); await Promise.all([...provider.retiring]); release.resolve();
  const result = await listing;
  assert.equal((Array.isArray(result) ? result : result.candidates).some(candidate => candidate.name === 'late-method'), false);
  assert.equal(provider.extensions.size, 0);
  const ready = library.ensureReady.bind(library), started = Promise.withResolvers(), finish = Promise.withResolvers();
  library.ensureReady = async signal => { started.resolve(); await finish.promise; return ready(signal); };
  const late = provider.list(control), rejected = assert.rejects(late, { code: 'FEATURE_CLOSED' });
  await started.promise; await provider.dispose(); finish.resolve(); await rejected;
  assert.equal(provider.extensions.size, 0); assert.equal(listeners.size, 0);
});
