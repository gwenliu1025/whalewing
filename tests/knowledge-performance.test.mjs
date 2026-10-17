import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Vault } from '../src/vault.js';

const note = (title, body = '', aliases = []) => `---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-12\nupdated: 2026-10-12\naliases: ${JSON.stringify(aliases)}\n---\n# ${title}\n\n${body}\n`;
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-index-cache-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const vault = new Vault(path.join(directory, 'vault'));
  await vault.initialize();
  const write = async (title, body = '', aliases = []) => fs.writeFile(path.join(vault.root, '40-知识', `${title}.md`), note(title, body, aliases));
  await write('来源', '[[目标]] [[代号]]');
  await write('目标', '正文甲', ['代号']);
  return { vault, write };
}

test('未改内容复用解析与关系，但每次阅读仍读取磁盘字节且不只相信mtime', async t => {
  const { vault, write } = await fixture(t);
  const first = await vault.index();
  const second = await vault.index();
  assert.equal(second, first);
  const target = path.join(vault.root, '40-知识', '目标.md');
  const oldStat = await fs.stat(target);
  await write('目标', '正文乙', ['代号']);
  await fs.utimes(target, oldStat.atime, oldStat.mtime);
  const changed = await vault.document('40-知识/目标.md');
  assert.match(changed.content, /正文乙/);
  assert.equal(changed.totalBacklinks, 2);
  const third = await vault.index();
  assert.notEqual(third, first);
  assert.equal(third.find(row => row.path.endsWith('/来源.md')).parsed, first.find(row => row.path.endsWith('/来源.md')).parsed);
  assert.notEqual(third.find(row => row.path.endsWith('/目标.md')).parsed, first.find(row => row.path.endsWith('/目标.md')).parsed);
  vault.clearIndex();
  const rebuilt = await vault.index();
  assert.notEqual(rebuilt, third);
  assert.deepEqual(rebuilt, third);
});

test('改别名、改名、新增、删除与损坏后修复均重解关系，不返回旧快照', async t => {
  const { vault, write } = await fixture(t);
  await vault.index();
  await write('目标', '正文', ['新代号']);
  assert.equal((await vault.document('40-知识/来源.md')).links[1].status, 'missing');
  await write('新增', '', ['代号']);
  assert.equal((await vault.document('40-知识/来源.md')).links[1].path, '40-知识/新增.md');
  await fs.rename(path.join(vault.root, '40-知识', '目标.md'), path.join(vault.root, '40-知识', '改名.md'));
  assert.equal((await vault.document('40-知识/来源.md')).links[0].status, 'missing');
  await fs.unlink(path.join(vault.root, '40-知识', '新增.md'));
  assert.equal((await vault.document('40-知识/来源.md')).links[1].status, 'missing');
  await fs.writeFile(path.join(vault.root, '40-知识', '改名.md'), Buffer.from([255]));
  assert.match((await vault.document('40-知识/来源.md')).relationsIssue, /ENCODING/);
  await write('改名', '恢复', ['代号']);
  const recovered = await vault.document('40-知识/来源.md');
  assert.equal(recovered.relationsIssue, undefined);
  assert.equal(recovered.links[1].path, '40-知识/改名.md');
});

test('缓存命中仍核对链接/字节上限，取消等待同批IO收束而不发布半成品', async t => {
  const { vault } = await fixture(t);
  const initial = await vault.index();
  vault.limits.maxLinks = 1;
  await assert.rejects(vault.index(), { code: 'LINK_LIMIT' });
  vault.limits.maxLinks = 50000; vault.limits.maxIndexBytes = 1;
  await assert.rejects(vault.index(), { code: 'INDEX_LIMIT' });
  vault.limits.maxIndexBytes = 33554432;
  const names = await vault.files();
  // 只替换本实例的文件I/O，在批次中精确注入取消，不使用定时等待。
  const original = vault.readInternal.bind(vault);
  const controller = new AbortController();
  let active = 0, peak = 0, reads = 0;
  vault.readInternal = async name => {
    if (!names.includes(name)) return original(name);
    active++; peak = Math.max(peak, active);
    try {
      const result = await original(name);
      if (++reads === 2) controller.abort();
      return result;
    } finally { active--; }
  };
  await assert.rejects(vault.index(controller.signal), { name: 'AbortError' });
  assert.equal(active, 0);
  assert.ok(peak > 1 && peak <= 8);
  vault.readInternal = original;
  assert.equal(await vault.index(), initial);
});
