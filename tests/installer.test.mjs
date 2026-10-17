import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { install, restore, status, locations, sha256, PLUGIN, SCHEDULE } from '../installer/core.mjs';
import { readTgz } from '../installer/tar.mjs';

// 用可控的“程序包”字节代替真实 app.asar：原版 → 适配版的转换与版本读取都由注入的适配器决定。
const adapter = {
  version: '0.2.0-rc.2',
  readVersion: bytes => /^v=([^;]+);/.exec(bytes.toString())?.[1] ?? (() => { throw new Error('bad'); })(),
  adaptArchive: bytes => {
    const text = bytes.toString();
    if (text.endsWith(';adapted')) return bytes;
    if (!text.endsWith(';original')) throw new Error('unknown');
    return Buffer.from(text.replace(/;original$/, ';adapted'));
  },
};
const original = Buffer.from('v=0.2.0-rc.2;original'), adapted = Buffer.from('v=0.2.0-rc.2;adapted');
const idle = () => [];

/** 最小 tar 写入：ustar 头；超过 100 字节的路径用 pax 记录，与 npm pack 的产物同构。 */
function tgz(files) {
  const blocks = [];
  const header = (name, size, type) => {
    const block = Buffer.alloc(512);
    block.write(name.slice(0, 100), 0); block.write('0000644\0', 100); block.write('0000000\0', 108); block.write('0000000\0', 116);
    block.write(size.toString(8).padStart(11, '0') + '\0', 124); block.write('00000000000\0', 136); block.write(type, 156); block.write('ustar\0', 257); block.write('00', 263);
    block.fill(' ', 148, 156);
    block.write([...block].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    return block;
  };
  const pad = data => Buffer.concat([data, Buffer.alloc((512 - data.length % 512) % 512)]);
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    if (name.length > 100) {
      const record = `path=${name}\n`, length = String(record.length + 3).length + 1 + record.length;
      const pax = Buffer.from(`${length} ${record}`);
      blocks.push(header('PaxHeader', pax.length, 'x'), pad(pax));
    }
    blocks.push(header(name, data.length, '0'), pad(data));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
const longPath = `package/node_modules/${'very-long-dependency-name-'.repeat(4)}/lib/index.js`;
const plugin = (index = 'export {}') => tgz({ 'package/package.json': JSON.stringify({ name: PLUGIN, version: '0.1.0' }), 'package/src/index.js': index, [longPath]: 'module.exports = 1' });

async function fixture(t, { asar = original, manifest = { name: 'dsh-profile-desktop', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } }, dependencies: { 'other-plugin': '1.0.0' } } } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-installer-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    await fs.rm(root, { recursive: true, force: true });
  });
  const dsh = path.join(root, 'DeepSeek Harness'), home = path.join(root, 'home'), tarball = path.join(root, 'payload', 'dsh-whalewing-0.1.0.tgz');
  await fs.mkdir(path.join(dsh, 'resources'), { recursive: true });
  await fs.writeFile(path.join(dsh, 'DeepSeek Harness.exe'), 'exe');
  await fs.writeFile(path.join(dsh, 'resources', 'app.asar'), asar);
  await fs.mkdir(path.dirname(tarball), { recursive: true });
  await fs.writeFile(tarball, plugin());
  const profileDir = path.join(home, 'profiles', 'desktop');
  if (manifest) { await fs.mkdir(profileDir, { recursive: true }); await fs.writeFile(path.join(profileDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n'); }
  const options = { dsh, home, tarball, pluginVersion: '0.1.0', adapter, running: idle };
  return { root, dsh, home, tarball, options, where: locations({ dsh, home }), manifest };
}
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

test('插件包读取：pax 长路径还原完整，拒绝越界路径', () => {
  const entries = readTgz(plugin());
  assert.deepEqual(entries.map(entry => entry.path), ['package/package.json', 'package/src/index.js', longPath]);
  assert.throws(() => readTgz(tgz({ '../escape.js': 'x' })), /越界/);
});

test('安装：备份原程序、写入适配版、解压插件到 profile、以 file: 登记插件包', async t => {
  const f = await fixture(t), lines = [];
  await install({ ...f.options, log: line => lines.push(line) });
  assert.deepEqual(await fs.readFile(f.where.asar), adapted);
  assert.deepEqual(await fs.readFile(f.where.hostBackup), original);
  assert.equal((await fs.lstat(f.where.pluginDir)).isDirectory(), true, 'profile 里是真实目录，不是链接');
  assert.equal(await fs.readFile(path.join(f.where.pluginDir, 'src', 'index.js'), 'utf8'), 'export {}');
  assert.equal(await fs.readFile(path.join(f.where.pluginDir, ...longPath.split('/').slice(1)), 'utf8'), 'module.exports = 1');
  const kept = path.join(f.where.root, 'dsh-whalewing-0.1.0.tgz');
  assert.deepEqual(await fs.readFile(kept), await fs.readFile(f.tarball));
  const manifest = await readJson(f.where.manifest);
  assert.equal(manifest.dependencies[PLUGIN], `file:${kept.split(path.sep).join('/')}`);
  assert.equal(manifest.dependencies['other-plugin'], '1.0.0', '其他插件保持');
  assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', PLUGIN, SCHEDULE]);
  const state = await readJson(f.where.state);
  assert.deepEqual([state.host.mode, state.host.originalSha256, state.host.adaptedSha256], ['adapted-by-installer', sha256(original), sha256(adapted)]);
  assert.deepEqual(state.profile.addedBundles, [PLUGIN, SCHEDULE]);
  assert.equal(lines.length, 3);
});

test('插件插在已有的定时任务 bundle 之前，重复安装幂等并能覆盖升级插件文件', async t => {
  const f = await fixture(t, { manifest: { dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', SCHEDULE] } } } });
  await install(f.options);
  await fs.writeFile(f.tarball, plugin('export const v = 2'));
  await install(f.options);
  const manifest = await readJson(f.where.manifest), state = await readJson(f.where.state);
  assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base', PLUGIN, SCHEDULE]);
  assert.deepEqual(state.profile.addedBundles, [PLUGIN], '没有重复记录也没有记下原本就有的 bundle');
  assert.equal(state.profile.movedPrevious, null, '第二次安装替换的是自己的版本');
  assert.equal(await fs.readFile(path.join(f.where.pluginDir, 'src', 'index.js'), 'utf8'), 'export const v = 2');
  assert.deepEqual(await fs.readFile(f.where.hostBackup), original, '备份仍是原版');
});

test('还原：恢复原程序、撤回自己加的登记、删除插件和安装器目录，安装后员工的改动保留', async t => {
  const f = await fixture(t);
  await install(f.options);
  const manifest = await readJson(f.where.manifest);
  manifest.dependencies['new-plugin'] = '2.0.0';
  await fs.writeFile(f.where.manifest, JSON.stringify(manifest, null, 2) + '\n');
  const { report } = await restore(f.options);
  assert.deepEqual(report, { host: 'restored', profile: 'restored', plugin: 'removed' });
  assert.deepEqual(await fs.readFile(f.where.asar), original);
  const after = await readJson(f.where.manifest);
  assert.deepEqual(after.dependencies, { 'other-plugin': '1.0.0', 'new-plugin': '2.0.0' });
  assert.deepEqual(after.dsh.profile.bundles, f.manifest.dsh.profile.bundles);
  assert.equal(await fs.lstat(f.where.pluginDir).catch(() => null), null);
  assert.equal(await fs.lstat(f.where.root).catch(() => null), null);
  await assert.rejects(restore(f.options), { code: 'NO_STATE' });
});

test('还原后 profile 清单与安装前逐字节一致（原本没有 dependencies 也不留空对象）', async t => {
  const f = await fixture(t, { manifest: { name: 'dsh-profile-desktop', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } } });
  const before = await fs.readFile(f.where.manifest);
  await install(f.options);
  await restore(f.options);
  assert.deepEqual(await fs.readFile(f.where.manifest), before);
});

test('DSH 版本不对、程序被改过、没有 profile、仍在运行、插件包损坏时拒绝且不留下改动', async t => {
  const wrong = await fixture(t, { asar: Buffer.from('v=0.3.0;original') });
  await assert.rejects(install(wrong.options), error => error.code === 'VERSION' && /0\.3\.0/.test(error.message) && /0\.2\.0-rc\.2/.test(error.message));
  const tampered = await fixture(t, { asar: Buffer.from('v=0.2.0-rc.2;patched') });
  await assert.rejects(install(tampered.options), { code: 'ADAPT' });
  const fresh = await fixture(t, { manifest: null });
  await assert.rejects(install(fresh.options), { code: 'NO_PROFILE' });
  const busy = await fixture(t);
  await assert.rejects(install({ ...busy.options, running: () => [4321] }), error => error.code === 'RUNNING' && error.message.includes('4321'));
  const broken = await fixture(t);
  await fs.writeFile(broken.tarball, 'not a tarball');
  await assert.rejects(install(broken.options), { code: 'PAYLOAD' });
  for (const f of [wrong, tampered, fresh, busy, broken]) {
    assert.equal(await fs.lstat(f.where.root).catch(() => null), null, '没有创建安装器目录');
    assert.equal(await fs.lstat(f.where.pluginDir).catch(() => null), null);
  }
  assert.deepEqual(await fs.readFile(busy.where.asar), original);
});

test('DSH 被升级后还原不覆盖新程序，只撤回登记并保留备份；安装前已适配则不碰程序', async t => {
  const f = await fixture(t);
  await install(f.options);
  const upgraded = Buffer.from('v=0.3.0;original');
  await fs.writeFile(f.where.asar, upgraded);
  const { report } = await restore(f.options);
  assert.equal(report.host, 'changed');
  assert.deepEqual(await fs.readFile(f.where.asar), upgraded);
  assert.deepEqual(await fs.readFile(f.where.hostBackup), original, '保留原备份');
  assert.equal(await fs.lstat(f.where.pluginDir).catch(() => null), null);

  const pre = await fixture(t, { asar: adapted });
  await install(pre.options);
  assert.equal((await readJson(pre.where.state)).host.mode, 'already-adapted');
  assert.equal(await fs.lstat(pre.where.hostBackup).catch(() => null), null);
  assert.equal((await restore(pre.options)).report.host, 'not-ours');
  assert.deepEqual(await fs.readFile(pre.where.asar), adapted);
});

test('profile 里原有的同名插件（目录或链接）在安装时让位，还原时放回', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.where.pluginDir, { recursive: true });
  await fs.writeFile(path.join(f.where.pluginDir, 'marker.txt'), 'previous');
  await install(f.options);
  assert.equal(await fs.lstat(path.join(f.where.pluginDir, 'marker.txt')).catch(() => null), null);
  await restore(f.options);
  assert.equal(await fs.readFile(path.join(f.where.pluginDir, 'marker.txt'), 'utf8'), 'previous');

  const linked = await fixture(t);
  await fs.mkdir(path.join(linked.root, 'dev-plugin'), { recursive: true });
  await fs.mkdir(path.dirname(linked.where.pluginDir), { recursive: true });
  await fs.symlink(path.join(linked.root, 'dev-plugin'), linked.where.pluginDir, 'junction');
  await install(linked.options);
  assert.equal((await fs.lstat(linked.where.pluginDir)).isSymbolicLink(), false);
  await restore(linked.options);
  assert.equal((await fs.lstat(linked.where.pluginDir)).isSymbolicLink(), true, '还原后开发链接恢复');
  assert.equal(await fs.realpath(linked.where.pluginDir), await fs.realpath(path.join(linked.root, 'dev-plugin')));
});

test('状态查询只读', async t => {
  const f = await fixture(t);
  assert.deepEqual((({ version, host, registered, installed }) => ({ version, host, registered, installed }))(await status({ ...f.options })), { version: '0.2.0-rc.2', host: 'original', registered: false, installed: null });
  await install(f.options);
  const after = await status({ ...f.options });
  assert.deepEqual([after.host, after.registered, after.installed, after.state.pluginVersion], ['adapted', true, '0.1.0', '0.1.0']);
});
