import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { vaultLocation } from '../src/vault-location.js';
import { WhalewingCore } from '../src/service.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-location-'));
  // 测试只使用独占随机目录，不读写本机安装目录或用户知识库。
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, home: path.join(root, 'home'), runtime: { platform: 'win32', versions: { electron: 'fixture' }, env: { ELECTRON_RUN_AS_NODE: '1' }, execPath: path.join(root, 'DSH', 'DeepSeek Harness.exe') } };
}

test('Windows桌面默认安装目录同级，CLI不写Node目录，显式配置优先且只读', async t => {
  const { root, home, runtime } = await fixture(t);
  assert.equal(vaultLocation(undefined, home, runtime).root, path.join(root, 'whalewing-vault'));
  assert.equal(vaultLocation(undefined, home, { ...runtime, versions: {} }).root, path.join(home, 'whalewing-vault'));
  assert.equal(vaultLocation(undefined, home, { ...runtime, platform: 'linux' }).root, path.join(home, 'whalewing-vault'));
  assert.equal(vaultLocation(undefined, home, { ...runtime, env: {} }).root, path.join(home, 'whalewing-vault'));
  const explicit = path.join(root, 'existing');
  assert.deepEqual(vaultLocation(explicit, home, runtime), { root: explicit });
  assert.deepEqual(await fs.readdir(root), []);
});

for (const kind of ['home', 'installed']) test(`${kind}旧库与新兄弟库均有材料时保留旧路径，显式配置才切换`, async t => {
  const { root, home, runtime } = await fixture(t);
  const old = kind === 'home' ? path.join(home, 'whalewing-vault') : path.join(root, 'DSH', 'whalewing-vault');
  const sibling = path.join(root, 'whalewing-vault');
  for (const directory of [old, sibling]) {
    await fs.mkdir(path.join(directory, '.whalewing'), { recursive: true });
    await fs.writeFile(path.join(directory, '.whalewing', 'settings.json'), directory);
  }
  assert.equal(vaultLocation(undefined, home, runtime).root, old);
  assert.match(vaultLocation(undefined, home, runtime).notice, /卸载.*删除.*风险/);
  assert.deepEqual(vaultLocation(sibling, home, runtime), { root: sibling });
  for (const directory of [old, sibling]) assert.equal(await fs.readFile(path.join(directory, '.whalewing', 'settings.json'), 'utf8'), directory);
});

test('两种旧库同时存在时保持原DSH_HOME优先级，不合并或抢占', async t => {
  const { root, home, runtime } = await fixture(t);
  const homeVault = path.join(home, 'whalewing-vault'), installedVault = path.join(root, 'DSH', 'whalewing-vault');
  for (const directory of [homeVault, installedVault]) {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, '笔记.md'), directory);
  }
  assert.equal(vaultLocation(undefined, home, runtime).root, homeVault);
  assert.match(vaultLocation(undefined, home, runtime).notice, /不自动切换或合并/);
  for (const directory of [homeVault, installedVault]) assert.equal(await fs.readFile(path.join(directory, '笔记.md'), 'utf8'), directory);
  assert.equal(await fs.stat(path.join(root, 'whalewing-vault')).then(() => true, () => false), false);
});

test('DSH_HOME与安装父目录重合时，已有home库不被安装内旧库抢占', async t => {
  const { root, runtime } = await fixture(t);
  const homeVault = path.join(root, 'whalewing-vault'), installedVault = path.join(root, 'DSH', 'whalewing-vault');
  for (const directory of [homeVault, installedVault]) {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, '笔记.md'), directory);
  }
  assert.deepEqual(vaultLocation(undefined, root, runtime), { root: homeVault });
  for (const directory of [homeVault, installedVault]) assert.equal(await fs.readFile(path.join(directory, '笔记.md'), 'utf8'), directory);
});

for (const kind of ['home', 'installed']) test(`${kind}不完整旧库仍保留原位置，空旧目录不阻挡新默认`, async t => {
  const { root, home, runtime } = await fixture(t);
  const old = kind === 'home' ? path.join(home, 'whalewing-vault') : path.join(root, 'DSH', 'whalewing-vault');
  await fs.mkdir(old, { recursive: true });
  assert.equal(vaultLocation(undefined, home, runtime).root, path.join(root, 'whalewing-vault'));
  const original = path.join(old, '未完成笔记.md');
  await fs.writeFile(original, '尚无插件元数据的原材料');
  assert.equal(vaultLocation(undefined, home, runtime).root, old);
  assert.equal(await fs.readFile(original, 'utf8'), '尚无插件元数据的原材料');
  await fs.mkdir(path.join(old, '.whalewing'));
  await fs.writeFile(path.join(old, '.whalewing', 'initializing.json'), '待恢复记录');
  assert.equal(vaultLocation(undefined, home, runtime).root, old);
});

test('移除模拟安装目录后兄弟知识库正文和附件仍在，不依赖安装目录存在', async t => {
  const { root, home, runtime } = await fixture(t);
  const installation = path.dirname(runtime.execPath), sibling = path.join(root, 'whalewing-vault');
  await fs.mkdir(installation); await fs.writeFile(runtime.execPath, '模拟程序');
  await fs.mkdir(path.join(sibling, '附件'), { recursive: true });
  await fs.writeFile(path.join(sibling, '笔记.md'), '员工自己的知识');
  const attachment = Buffer.from([0, 1, 254, 255]);
  await fs.writeFile(path.join(sibling, '附件', '原件.bin'), attachment);
  assert.equal(vaultLocation(undefined, home, runtime).root, sibling);
  // 只删除 mkdtemp 下的模拟安装子目录，以证实普通兄弟目录不在其递归删除范围内。
  assert.equal(path.dirname(path.resolve(installation)), root);
  assert.notEqual(installation, sibling);
  await fs.rm(installation, { recursive: true, force: true });
  assert.equal(vaultLocation(undefined, home, runtime).root, sibling);
  assert.equal(await fs.readFile(path.join(sibling, '笔记.md'), 'utf8'), '员工自己的知识');
  assert.deepEqual(await fs.readFile(path.join(sibling, '附件', '原件.bin')), attachment);
});

test('旧库和中断库保留原路径并提示，不因新默认目录覆盖或静默合并', async t => {
  const { home, runtime } = await fixture(t);
  const old = path.join(home, 'whalewing-vault');
  await fs.mkdir(path.join(old, '.whalewing'), { recursive: true });
  const marker = path.join(old, '.whalewing', 'initializing.json');
  await fs.writeFile(marker, '原恢复证据');
  assert.equal(vaultLocation(undefined, home, runtime).root, old);
  assert.match(vaultLocation(undefined, home, runtime).notice, /原有知识库/);
  assert.equal(await fs.readFile(marker, 'utf8'), '原恢复证据');
  await fs.rename(marker, path.join(old, '.whalewing', 'settings.json'));
  assert.equal(vaultLocation(undefined, home, runtime).root, old);
});

test('首个知识请求自动建库，并发只初始化一次，不登记来源', async t => {
  const { root } = await fixture(t);
  const core = new WhalewingCore(path.join(root, 'vault'), { skillsRoot: path.join(root, 'skills'), schedule: () => undefined });
  t.after(() => core.dispose());
  const initialize = core.vault.initialize.bind(core.vault);
  let count = 0;
  core.vault.initialize = async (...args) => { count++; return initialize(...args); };
  const statuses = await Promise.all(Array.from({ length: 5 }, () => core.execute({ action: 'status' }, { kind: 'human' })));
  assert.equal(count, 1);
  assert.ok(statuses.every(value => value.initialized && value.root === core.vault.root));
  assert.deepEqual((await core.vault.settings()).sources, []);
  assert.equal((await core.vault.files()).length, 18);
  await core.execute({ action: 'status' }, { kind: 'model' });
  assert.equal(count, 1);
});

test('自动初始化拒绝陌生非空目录且失败可重试，原件字节保持', async t => {
  const { root } = await fixture(t);
  const core = new WhalewingCore(path.join(root, 'vault'), { skillsRoot: path.join(root, 'skills'), schedule: () => undefined });
  t.after(() => core.dispose());
  await fs.mkdir(core.vault.root);
  const original = path.join(core.vault.root, 'original.txt');
  await fs.writeFile(original, '不可覆盖的原件');
  await assert.rejects(core.execute({ action: 'status' }, { kind: 'human' }), { code: 'ROOT_NOT_EMPTY' });
  assert.equal(await fs.readFile(original, 'utf8'), '不可覆盖的原件');
  // 模拟用户将误选目录里的原件保留到正确位置后，从原入口重试。
  await fs.rename(original, path.join(root, 'original.txt'));
  assert.equal((await core.execute({ action: 'status' }, { kind: 'human' })).initialized, true);
  assert.equal(await fs.readFile(path.join(root, 'original.txt'), 'utf8'), '不可覆盖的原件');
});
