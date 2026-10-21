import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

test('旧宿主适配及安装器退出活动树，原生插件包入口保留', async () => {
  // 历史实现由固定 Git 提交和原包冻结；活动回归不再导入或运行它们。
  for (const entry of ['host-adapter', 'installer', 'scripts/package-installer.mjs']) {
    await assert.rejects(access(new URL(`../${entry}`, import.meta.url)), { code: 'ENOENT' });
  }
  for (const name of ['host-adapter', 'host-archive', 'host-sidebar', 'host-schedule', 'host-browser', 'installer']) {
    await assert.rejects(access(new URL(`./${name}.test.mjs`, import.meta.url)), { code: 'ENOENT' });
  }
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const command of Object.values(pkg.scripts ?? {})) assert.doesNotMatch(command, /installer|host-adapter/i);
  assert.deepEqual(pkg.dsh.bundle, { patch: './cordis.patch.yml' });
  assert.ok(pkg.files.includes('cordis.patch.yml') && pkg.files.includes('examples/feature-starter'));
  for (const file of pkg.files) assert.doesNotMatch(file, /^(?:installer|host-adapter|scripts)(?:\/|$)/);
  for (const entry of [...Object.keys(pkg.exports), ...Object.values(pkg.exports)]) assert.doesNotMatch(entry, /installer|host-adapter/);
  for (const entry of ['index.js', 'client.js', 'client.toolbox.js', 'client.model-world.js', 'cordis.patch.yml']) {
    assert.ok(pkg.files.includes(entry));
    assert.ok((await readFile(new URL(`../${entry}`, import.meta.url))).length > 0);
  }
});
