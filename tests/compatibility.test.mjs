import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { evaluatePluginCompatibility, getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot';
import PluginMarket from '@deepseek-ai/dsh-plugin-market';
import { parseMarketIndex, marketInstallTarget } from '@deepseek-ai/dsh-plugin-market-index';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const starter = JSON.parse(await readFile(new URL('../examples/feature-starter/package.json', import.meta.url), 'utf8'));
const target = manifest.engines.dsh;
const otherRuntimes = ['0.2.0-rc.2', '0.2.1-rc.1', '0.2.1-rc.3', '0.2.1', '0.3.0'];

test('当前包、DSH peers、独立模板与实际宿主共用准确支持目标', () => {
  assert.equal(target, getDshRuntimeVersion());
  assert.match(target, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  const peers = Object.entries(manifest.peerDependencies).filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'));
  assert.ok(peers.length > 0);
  for (const [name, range] of peers) assert.equal(range, target, name);
  assert.equal(starter.engines.dsh, target);
  assert.equal(starter.peerDependencies?.['dsh-whalewing'], undefined);
  for (const pkg of [manifest, starter]) assert.equal(evaluatePluginCompatibility(pkg), undefined);
});

test('真实原生兼容门拒收旧版和未验收未来版本，不以peer或豁免放行', () => {
  for (const pkg of [manifest, starter]) {
    for (const runtime of otherRuntimes) {
      const issue = evaluatePluginCompatibility(pkg, {}, runtime);
      assert.equal(issue?.runtimeVersion, runtime);
      assert.deepEqual(issue.requirements, { 'engines.dsh': target });
      assert.equal(issue.exempted, false);
    }
  }
  // 原生 engines.dsh 优先于 peer；一致性由上一项消费根声明约束，不能指望 peer 兜底。
  const differentPeer = { ...manifest, peerDependencies: { '@deepseek-ai/dsh': '0.2.0-rc.2' } };
  assert.equal(evaluatePluginCompatibility(differentPeer, {}, target), undefined);
  const { engines: _engines, ...peerOnly } = manifest;
  assert.equal(evaluatePluginCompatibility(peerOnly, {}, target), undefined);
  assert.ok(evaluatePluginCompatibility(peerOnly, {}, otherRuntimes[0]));
});

const indexUrl = 'http://127.0.0.1/compatibility-fixture.json';
const fixtureName = 'dsh-compatibility-fixture';
const sourceUrl = 'https://example.invalid/compatibility/fixture.git';
// 全部条目是未发布的内存 fixture；只验证原生推荐和固定来源，不代表真实发行渠道。
const fixturePackages = [
  { name: fixtureName, version: '0.1.0', engines: { dsh: '0.2.0-rc.2' }, commit: '1'.repeat(40) },
  { name: fixtureName, version: '0.2.0', engines: { dsh: target }, commit: '2'.repeat(40) },
  { name: fixtureName, version: '0.3.0', engines: { dsh: '0.3.0' }, commit: '3'.repeat(40) },
];
const fixtureIndex = {
  format: 1,
  title: '未发布兼容选版测试',
  plugins: [{
    name: fixtureName,
    versions: fixturePackages.map(pkg => ({
      version: pkg.version, engines: pkg.engines, publishTimestamp: 0,
      source: { type: 'git', url: sourceUrl, commit: pkg.commit },
    })),
  }],
};

test('真实索引解析保留冻结版本与包声明，安装目标必须固定commit', () => {
  const parsed = parseMarketIndex(fixtureIndex, indexUrl);
  assert.deepEqual(parsed.plugins[0].versions.map(row => row.version), ['0.3.0', '0.2.0', '0.1.0']);
  for (const row of parsed.plugins[0].versions) {
    const pkg = fixturePackages.find(item => item.version === row.version);
    assert.deepEqual(row.engines, pkg.engines);
    assert.equal(marketInstallTarget(fixtureName, row).spec, `git+${sourceUrl}#${pkg.commit}`);
  }
  const invalid = structuredClone(fixtureIndex);
  invalid.plugins[0].versions[0].source.commit = 'main';
  assert.throws(() => parseMarketIndex(invalid, indexUrl), /40-hex-digit commit SHA/);
});

test('真实市场search和entry只推荐当前宿主兼容固定版本，不自动安装', { timeout: 15000 }, async t => {
  let fetched = 0;
  // 仅替换传输输入；解析Worker、兼容检查、推荐和公开readback均使用当前分发实现。
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), indexUrl);
    assert.equal(options.redirect, 'error');
    fetched++;
    return new Response(JSON.stringify(fixtureIndex), { headers: { 'content-type': 'application/json' } });
  });
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  new TypertRegistry(ctx);
  ctx.provide('pluginManager', {
    listBundles: async () => [],
    listVersionExemptions: () => ({ exemptions: {} }),
    installBundle: () => assert.fail('市场读取不得触发安装'),
  });
  await ctx.plugin(PluginMarket, { indexes: [indexUrl] });
  const result = await ctx.pluginMarket.search(indexUrl, { offset: 0, limit: 10, sort: { kind: 'index' } });
  assert.equal(result.total, 1);
  const entry = await ctx.pluginMarket.entry(indexUrl, fixtureName);
  assert.deepEqual(result.entries, [entry]);
  assert.equal(entry.defaultVersion, '0.2.0');
  assert.equal(entry.installation.status, 'not-installed');
  for (const row of entry.versions) {
    const pkg = fixturePackages.find(item => item.version === row.version);
    assert.equal(row.compatibility.compatible, pkg.engines.dsh === target);
    assert.equal(row.install.spec, `git+${sourceUrl}#${pkg.commit}`);
  }
  assert.equal(fetched, 1, '重复读取复用同一份已解析索引');
  assert.equal(await ctx.pluginMarket.entry(indexUrl, 'dsh-missing-fixture'), undefined);
});
