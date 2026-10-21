import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Vault, digest } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';

const note = body => `---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-11\nupdated: 2026-10-11\naliases: []\n---\n# 来源\n${body}\n`;
const skill = body => `---\nname: whalewing-user-preserved\ndescription: 使用已经回读的来源执行任务并检查结果\n---\n${body}\n`;
const name = 'whalewing-user-preserved';
const sourcePath = '40-知识/来源.md';
const review = { reviewer: '独立检查者文件保持夹具', positive: '适用输入已经执行并检查产物', negative: '缺少输入已拒收且没有副作用' };

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-preservation-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('whalewing-preservation-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const vault = new Vault(path.join(root, 'vault'));
  await vault.initialize();
  const library = new SkillLibrary(vault, path.join(root, 'skills'));
  return { root, vault, library };
}

test('知识写入拒绝孤立代理码元且保留原件，合法补充平面字符可以回读', async t => {
  const { vault } = await setup(t);
  const first = await vault.write(sourcePath, note('原始正文'), '');
  for (const invalid of ['\ud800', '\udfff']) {
    await assert.rejects(vault.write(sourcePath, note(`错误${invalid}`), first.hash), { code: 'INVALID_TEXT' });
    assert.equal((await vault.read(sourcePath)).content, note('原始正文'));
  }
  const valid = await vault.write(sourcePath, note('有效中文与😀'), first.hash);
  assert.equal((await vault.read(sourcePath)).hash, valid.hash);
  assert.equal((await vault.read(sourcePath)).content, note('有效中文与😀'));
});

test('技能候选消费同一文本边界，非法代理码元不覆盖已有候选', async t => {
  const { vault, library } = await setup(t);
  const source = await vault.write(sourcePath, note('来源'), '');
  const input = { name, sourcePaths: [sourcePath], sourceHashes: { [sourcePath]: source.hash } };
  const candidate = await library.stage({ ...input, content: skill('原候选😀'), expectedHash: '' });
  await assert.rejects(library.stage({ ...input, content: skill('错误\ud800'), expectedHash: candidate.hash }), { code: 'INVALID_TEXT' });
  assert.equal((await library.read(name, 'candidate')).hash, candidate.hash);
});

test('笔记恢复后外部插入第三版须报READBACK，外改与恢复材料均保持', async t => {
  const { vault } = await setup(t);
  const first = await vault.write(sourcePath, note('待恢复版本'), '');
  await vault.remove(sourcePath, first.hash);
  const recoveryPath = `.whalewing/recovery/${digest(sourcePath)}.json`;
  const backup = await vault.readInternal(recoveryPath);
  const atomic = vault.atomic.bind(vault);
  // 精确卡在恢复提交与其回读之间，不用睡眠制造偶发并发。
  vault.atomic = async (file, ...args) => {
    await atomic(file, ...args);
    if (file === sourcePath) await fs.writeFile(await vault.resolve(file), note('外部编辑第三版'), 'utf8');
  };
  await assert.rejects(vault.restore(sourcePath, ''), { code: 'READBACK' });
  assert.equal((await vault.read(sourcePath)).content, note('外部编辑第三版'));
  assert.equal((await vault.readInternal(recoveryPath)).hash, backup.hash);
  vault.atomic = atomic;
  const restored = await vault.restore(sourcePath, (await vault.read(sourcePath)).hash);
  assert.equal(restored.hash, first.hash);
  assert.equal((await vault.read(sourcePath)).content, note('待恢复版本'));
});

test('发布失败且旧来源失效时不覆盖更早停用版，正文资源及既有回退入口全部保持', async t => {
  const { vault, library } = await setup(t);
  let source = await vault.write(sourcePath, note('初始来源'), '');
  const stage = async body => library.stage({ name, content: skill(body), sourcePaths: [sourcePath], sourceHashes: { [sourcePath]: source.hash }, expectedHash: (await library.files.read(library.location(name, 'candidate')))?.hash || '' });
  const publish = async (candidate, activeHash, discover = async () => {}) => library.publish({ name, expectedHash: candidate.hash, activeHash, review }, discover);
  const v1 = await stage('第一版');
  const active = library.location(name, 'active'), disabled = library.location(name, 'disabled');
  await library.files.atomic(`${path.posix.dirname(library.location(name, 'candidate'))}/v1.txt`, '第一版资源');
  await publish(v1, '');
  await library.disable({ name, expectedHash: v1.hash });
  const disabledBefore = await library.files.snapshot(path.posix.dirname(disabled));
  const v2 = await stage('第二版');
  await library.files.atomic(`${path.posix.dirname(library.location(name, 'candidate'))}/v2.txt`, '第二版资源');
  await publish(v2, '');
  const old = await library.read(name);
  source = await vault.write(sourcePath, note('来源已纠偏'), source.hash);
  const v3 = await stage('第三版');
  await library.files.atomic(`${path.posix.dirname(library.location(name, 'candidate'))}/v3.txt`, '第三版资源');
  await assert.rejects(publish(v3, old.hash, async () => { throw new Error('发现失败夹具'); }), /发现失败夹具/);
  assert.equal((await library.files.snapshot(path.posix.dirname(disabled))).hash, disabledBefore.hash);
  assert.equal(await library.files.read(active), null);
  assert.equal((await library.read(name, 'candidate')).hash, v3.hash);
  const previous = JSON.parse((await library.files.read(`.system/whalewing/recovery/${digest(active)}.json`)).content);
  assert.equal(previous.content, old.content); assert.equal(previous.hash, old.hash);
  for (const [file, text] of [['v1.txt', '第一版资源'], ['v2.txt', '第二版资源'], ['v3.txt', '第三版资源']]) {
    assert.equal((await library.files.read(`${path.posix.dirname(active)}/${file}`)).content, text);
    assert.equal((await library.files.read(`${path.posix.dirname(library.location(name, 'candidate'))}/${file}`)).content, text);
  }
  // 已有回退入口仍可在来源恢复后使用，不需要新增历史目录或备份格式。
  await vault.write(sourcePath, note('初始来源'), source.hash);
  const restored = await library.rollback({ name, expectedHash: '' }, async () => {});
  assert.equal(restored.hash, old.hash);
  assert.equal((await library.files.snapshot(path.posix.dirname(disabled))).hash, disabledBefore.hash);
});

for (const changed of [false, true]) test(`发现失败恢复主路径：旧来源${changed ? '失效转停用' : '有效回退活动'}`, async t => {
  const { vault, library } = await setup(t);
  let source = await vault.write(sourcePath, note('原来源'), '');
  const stage = async body => library.stage({ name, content: skill(body), sourcePaths: [sourcePath], sourceHashes: { [sourcePath]: source.hash }, expectedHash: '' });
  const first = await stage('原方法');
  await library.publish({ name, expectedHash: first.hash, activeHash: '', review }, async () => {});
  await library.files.atomic(`${path.posix.dirname(library.location(name, 'active'))}/resource.txt`, '原资源');
  if (changed) source = await vault.write(sourcePath, note('新来源'), source.hash);
  const next = await stage('新方法');
  await assert.rejects(library.publish({ name, expectedHash: next.hash, activeHash: first.hash, review }, async () => { throw new Error('发现失败'); }), /发现失败/);
  assert.equal((await library.read(name, changed ? 'disabled' : 'active')).hash, first.hash);
  assert.equal((await library.read(name, 'candidate')).hash, next.hash);
  assert.equal((await library.files.read(`${path.posix.dirname(library.location(name, changed ? 'disabled' : 'active'))}/resource.txt`)).content, '原资源');
  if (changed) assert.equal(await library.files.read(library.location(name, 'active')), null);
});
