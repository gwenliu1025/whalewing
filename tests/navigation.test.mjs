import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Dir } from 'node:fs';
import { Vault, zones } from '../src/vault.js';

async function fixture(t, limits) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-navigation-'));
  // 只清理本测试独占分配的目录，不读取用户库或共享宿主配置。
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('whalewing-navigation-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const vault = new Vault(root, limits);
  await vault.initialize();
  return { root, vault };
}

test('根目录展示正式十区与非隐藏根级只读笔记，归档目录仍可导航', async t => {
  const { root, vault } = await fixture(t);
  await fs.writeFile(path.join(root, '导航.md'), '正文');
  await fs.writeFile(path.join(root, '.隐藏.md'), '隐藏正文');
  await fs.mkdir(path.join(root, 'outside'));
  await fs.writeFile(path.join(root, 'outside', '私有.md'), '范围外正文');
  const result = await vault.browse();
  assert.deepEqual(result.folders.map(item => item.name), zones);
  assert.equal(result.total, 12);
  assert.deepEqual(result.notes, [{ path: '导航.md', title: '导航', readOnly: true }, { path: 'AGENTS.md', title: 'AGENTS', readOnly: true }]);
  assert.equal(result.truncated, false);
  assert.deepEqual((await vault.browse('90-归档')).notes, []);
});

test('左栏不读正文，目录优先，坏编码和空目录均可发现', async t => {
  const { root, vault } = await fixture(t);
  // 40-知识 已预建二级目录，这里用无子目录的收件箱观察空目录与排序。
  const dir = path.join(root, '10-收件箱');
  await fs.mkdir(path.join(dir, '空目录'));
  await fs.writeFile(path.join(dir, '笔记2.md'), Buffer.from([0xff, 0xfe, 0xff]));
  await fs.writeFile(path.join(dir, '笔记10.md'), '不应出现在目录的正文');
  await fs.writeFile(path.join(dir, '附件.txt'), '普通附件');
  vault.read = () => { throw new Error('目录不应调用正文读取'); };
  const result = await vault.browse('10-收件箱');
  assert.deepEqual(result.folders, [{ path: '10-收件箱/空目录', name: '空目录' }]);
  assert.deepEqual(result.notes.map(item => item.title), ['笔记2', '笔记10']);
  assert.deepEqual(result.notes, [
    { path: '10-收件箱/笔记2.md', title: '笔记2', readOnly: false },
    { path: '10-收件箱/笔记10.md', title: '笔记10', readOnly: false },
  ]);
  assert.equal((await vault.browse('10-收件箱/空目录')).total, 0);
});

test('按当前目录分页，目录与文件共享同一游标且没有丢失条目', async t => {
  const { root, vault } = await fixture(t, { maxResults: 2 });
  const dir = path.join(root, '10-收件箱');
  for (const folder of ['文件夹10', '文件夹2']) await fs.mkdir(path.join(dir, folder));
  for (let i = 1; i <= 4; i++) await fs.writeFile(path.join(dir, `笔记${i}.md`), '');
  const observed = [];
  for (const offset of [0, 2, 4]) {
    const result = await vault.browse('10-收件箱', offset);
    assert.equal(result.total, 6);
    assert.equal(result.truncated, offset < 4);
    observed.push(...result.folders.map(item => item.path), ...result.notes.map(item => item.path));
  }
  assert.deepEqual(observed, ['文件夹2', '文件夹10', '笔记1.md', '笔记2.md', '笔记3.md', '笔记4.md'].map(name => `10-收件箱/${name}`));
  assert.equal((await vault.browse('10-收件箱', 99)).truncated, false);
});

test('拒绝越界、内部目录、非法游标与链接，取消保持文件不变', async t => {
  const { root, vault } = await fixture(t);
  for (const directory of ['../', '.whalewing', '40-知识/../00-系统', '/40-知识', '40-知识/.hidden', '40-知识:stream', 1]) {
    await assert.rejects(vault.browse(directory), { code: 'PATH' });
  }
  for (const offset of [-1, 0.5, NaN, Infinity]) await assert.rejects(vault.browse('40-知识', offset), { code: 'OFFSET' });
  const before = await fs.readFile(path.join(root, '.whalewing', 'settings.json'));
  await assert.rejects(vault.browse('', 0, AbortSignal.abort(new Error('取消目录读取'))), /取消目录读取/);
  assert.deepEqual(await fs.readFile(path.join(root, '.whalewing', 'settings.json')), before);
  await fs.symlink(path.join(root, '30-领域'), path.join(root, '40-知识', '链接目录'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(vault.browse('40-知识'), { code: 'SYMLINK' });
  await assert.rejects(vault.browse('40-知识/链接目录'), { code: 'SYMLINK' });
});

test('目录扫描有界，不将超限当成空列表或已完整读取', async t => {
  const { root, vault } = await fixture(t, { maxFiles: 2 });
  for (let i = 0; i < 3; i++) await fs.writeFile(path.join(root, '10-收件箱', `${i}.txt`), '');
  await assert.rejects(vault.browse('10-收件箱'), { code: 'DIRECTORY_LIMIT' });
});

test('扫描途中取消关闭目录句柄，随后可恢复读取', async t => {
  const { root, vault } = await fixture(t);
  await fs.writeFile(path.join(root, '40-知识', '资料.md'), '');
  const original = Dir.prototype.close;
  let closed = 0, probes = 0;
  // 只观察当前测试进程中的真实目录句柄，不替换扫描实现。
  t.mock.method(Dir.prototype, 'close', function (...args) { closed++; return original.apply(this, args); });
  const signal = { throwIfAborted() { if (++probes === 2) throw new Error('扫描中取消'); } };
  await assert.rejects(vault.browse('40-知识', 0, signal), /扫描中取消/);
  assert.equal(probes, 2);
  assert.ok(closed > 0);
  assert.equal((await vault.browse('40-知识')).notes[0].title, '资料');
});

test('不存在和普通文件目录明确失败，区级与祖先链接不被跟随', async t => {
  const { root, vault } = await fixture(t);
  await assert.rejects(vault.browse('40-知识/不存在'), { code: 'ENOENT' });
  await fs.writeFile(path.join(root, '40-知识', '普通文件.md'), '');
  await assert.rejects(vault.browse('40-知识/普通文件.md'), { code: 'ENOTDIR' });
  await fs.mkdir(path.join(root, '30-领域', '子目录'));
  await fs.rm(path.join(root, '90-归档'), { recursive: true });
  await fs.symlink(path.join(root, '30-领域'), path.join(root, '90-归档'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(vault.browse(), { code: 'SYMLINK' });
  await assert.rejects(vault.browse('90-归档/子目录'), { code: 'SYMLINK' });
});
