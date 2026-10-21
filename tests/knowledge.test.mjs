import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { z } from 'zod';
import { mountFeatures } from './feature-fixture.mjs';
import { Vault } from '../src/vault.js';
import { knowledgeContract } from '../features/knowledge/contract.js';

const contract = knowledgeContract(z);
const note = (title, body = '', aliases = []) => `---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-09\nupdated: 2026-10-09\naliases: ${JSON.stringify(aliases)}\n---\n# ${title}\n\n${body}\n`;
async function fixture(t, limits = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-knowledge-'));
  const vault = new Vault(path.join(directory, 'vault'), limits);
  await vault.initialize();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const write = async (name, body = '', aliases = []) => vault.write(name, note(path.posix.basename(name, '.md'), body, aliases), (await vault.readInternal(name))?.hash || '');
  return { vault, directory, write };
}

test('Wiki文件名、路径、别名、标题与块引用共享阅读/反链/图谱解释', async t => {
  const { vault, write } = await fixture(t);
  await write('40-知识/源.md', '[[目标|显示名]] [[别名#小节]] [[目标#^proof]] [相对](./目标.md)');
  await write('40-知识/目标.md', '## 小节\n\n原文证据 ^proof', ['别名']);
  const document = await vault.document('40-知识/源.md');
  contract.result.parse(document);
  assert.deepEqual(document.links.map(link => [link.path, link.status]), Array(4).fill(['40-知识/目标.md', 'resolved']));
  assert.equal(document.links[0].label, '显示名');
  assert.equal(document.links[1].targetLine, 10);
  assert.equal(document.links[2].targetLine, 12);
  assert.equal((await vault.document('40-知识/目标.md')).backlinks.length, 4);
  const graph = await vault.graph({ path: '40-知识/目标.md' });
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.edges, [{ source: '40-知识/源.md', target: '40-知识/目标.md' }]);
  assert.equal((await vault.validate()).valid, true);
});

test('歧义不猜测，坏锚点保留文件级边，缺失笔记使用独立投影节点', async t => {
  const { vault, write } = await fixture(t);
  await write('20-项目/同名.md', '## 重复\n\n## 重复', ['共有']);
  await write('30-领域/同名.md', '', ['共有']);
  await write('40-知识/引用.md', '[[同名]] [[共有]] [[未复制]] [[20-项目/同名#重复]] [[20-项目/同名#^no]]');
  const doc = await vault.document('40-知识/引用.md');
  assert.deepEqual(doc.links.map(link => link.status), ['ambiguous', 'ambiguous', 'missing', 'fragment_ambiguous', 'fragment_missing']);
  assert.deepEqual(doc.links[0].candidates, ['20-项目/同名.md', '30-领域/同名.md']);
  const graph = await vault.graph({ path: doc.path });
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.nodes.find(node => node.kind === 'missing').path, 'missing:name:未复制');
  assert.ok(graph.edges.some(edge => edge.target === '20-项目/同名.md'));
  assert.ok(!graph.nodes.some(node => node.path === '30-领域/同名.md'));
  assert.equal((await vault.validate()).valid, false);
});

test('GFM语法节点保留标题、表格、列表和代码，转义/HTML/代码不产生Wiki边', async t => {
  const { vault, write } = await fixture(t);
  await write('40-知识/引用.md', '## 表格\n\n| 名 | 值 |\n|---|---|\n| **关键** | 1 |\n\n- [x] 完成\n\n`[[代码]]`\n\n```md\n[[围栏]]\n```\n\n\\[[转义]]\n\n<div>[[HTML]]</div>\n\n![图片](https://example.invalid/image.png)\n\n[危险](javascript:alert)');
  const doc = await vault.document('40-知识/引用.md');
  assert.equal(doc.links.length, 0);
  contract.result.parse(doc);
  const serialized = JSON.stringify(doc.view);
  for (const type of ['table', 'heading', 'list', 'inlineCode', 'code', 'strong']) assert.ok(serialized.includes(`"type":"${type}"`));
  assert.ok(serialized.includes('[[HTML]]'));
  assert.ok(!serialized.includes('"type":"html"') && !serialized.includes('"type":"image"'));
});

test('参考式Markdown、同篇标题、编码空格及嵌入笔记降为导航', async t => {
  const { vault, write } = await fixture(t);
  await write('40-知识/空 格.md');
  await write('40-知识/100%覆盖.md');
  await write('40-知识/引用.md', '[[#引用]] ![[空 格]] [参考][ref] [[100%覆盖]]\n\n[ref]: ./空%20格.md');
  const doc = await vault.document('40-知识/引用.md');
  assert.equal(doc.links.length, 4);
  assert.ok(doc.links.every(link => link.status === 'resolved'));
});

test('图谱按页限制节点且如实返回省略连线，外部修改立即重建', async t => {
  const { vault, write } = await fixture(t, { maxGraphNodes: 2 });
  await write('40-知识/一.md', '[[二]]');
  await write('40-知识/二.md', '[[三]]');
  await write('40-知识/三.md');
  const first = await vault.graph({ query: '40-知识/' });
  assert.equal(first.total, 3); assert.equal(first.nodes.length, 2); assert.equal(first.truncated, true); assert.ok(first.omittedEdges > 0);
  assert.equal((await vault.graph({ query: '40-知识/', offset: 2 })).nodes.length, 1);
  await fs.writeFile(await vault.resolve('40-知识/一.md'), note('一', '[[三]]'));
  assert.ok((await vault.graph({ path: '40-知识/一.md' })).edges.some(edge => edge.target === '40-知识/三.md'));
  await fs.unlink(await vault.resolve('40-知识/三.md'));
  assert.equal((await vault.document('40-知识/一.md')).links[0].status, 'missing');
});

test('扫描超限、取消、路径越界保持失败而非截断为完整图谱', async t => {
  const { vault, write } = await fixture(t);
  await write('40-知识/引用.md', '[[缺失]] [[另一篇]]');
  vault.limits.maxLinks = 1;
  await assert.rejects(vault.graph({}), { code: 'LINK_LIMIT' });
  vault.limits.maxLinks = 50000; vault.limits.maxIndexBytes = 1;
  // 全库关系失败不再封死单文件正文及修复入口；图谱仍拒绝冒充完整结果。
  const doc = await vault.document('40-知识/引用.md');
  assert.match(doc.relationsIssue, /INDEX_LIMIT/);
  assert.match(doc.content, /另一篇/);
  assert.ok(!JSON.stringify(doc.view).includes('knowledgeLink'));
  await assert.rejects(vault.graph({}), { code: 'INDEX_LIMIT' });
  await assert.rejects(vault.graph({}, AbortSignal.abort()), { name: 'AbortError' });
  await assert.rejects(vault.document('../外部.md'), { code: 'PATH' });
});

test('无关坏编码或超大笔记不阻断正常笔记阅读保存，恢复关系后重新派生', async t => {
  const { vault, write } = await fixture(t);
  const name = '40-知识/正常.md', broken = '40-知识/坏笔记.md';
  await write(name, '[[坏笔记]]');
  await fs.writeFile(await vault.resolve(broken), Buffer.from([0xff, 0xfe, 0x00]));
  const brokenBytes = await fs.readFile(await vault.resolve(broken));
  const doc = await vault.document(name);
  contract.result.parse(doc);
  assert.match(doc.relationsIssue, /坏笔记.*UTF-8/);
  assert.match((await vault.search('')).notes.find(item => item.path === broken).issue, /UTF-8/);
  await assert.rejects(vault.document(broken), { code: 'ENCODING' });
  const saved = await vault.write(name, note('正常', '[[坏笔记]]\n保存成功'), doc.hash);
  assert.equal((await vault.document(name)).hash, saved.hash);
  await fs.writeFile(await vault.resolve(broken), 'x'.repeat(vault.limits.maxNoteBytes + 1));
  assert.match((await vault.document(name)).relationsIssue, /坏笔记.*大小/);
  await fs.writeFile(await vault.resolve(broken), note('坏笔记', '已修复'));
  const repaired = await vault.document(name);
  assert.equal(repaired.relationsIssue, undefined);
  assert.equal(repaired.links[0].status, 'resolved');
  assert.ok(brokenBytes.equals(Buffer.from([0xff, 0xfe, 0x00])));
});

test('无会话正式Host入口采用严格同源契约，模型/定时动作与身份字段不进入服务', async t => {
  const { directory } = await fixture(t);
  const ctx = new Context();
  new TypertRegistry(ctx);
  let creates = 0;
  ctx.provide('commands', { register() {} }); ctx.provide('sessionProjections', { register() {} });
  ctx.provide('sessions', { create() { creates++; }, flush() { assert.fail('不应落盘会话'); } });
  ctx.provide('sessionQuery', {}); ctx.provide('skills', {});
  const { service, knowledge } = await mountFeatures(ctx, directory, { vaultRoot: path.join(directory, 'direct-vault') }, false);
  t.after(() => ctx.fiber.dispose());
  for (const input of [{ action: 'schedule_run' }, { action: 'source_read' }, { action: 'status', caller: { kind: 'human' } }, { action: 'status', domain: 'skill' }]) await assert.rejects(knowledge.manage(input));
  const status = await knowledge.manage({ action: 'status' });
  contract.result.parse(status); assert.equal(status.initialized, true); assert.equal(creates, 0);
  const name = '40-知识/依据.md';
  await knowledge.manage({ action: 'write', path: name, content: note('依据', '期限为三天。'), expectedHash: '' });
  for (const input of [{ action: 'search', query: '' }, { action: 'document', path: name }, { action: 'graph' }, { action: 'validate' }, { action: 'read', path: name }]) contract.result.parse(await knowledge.manage(input));
  const prepared = await knowledge.manage({ action: 'question', question: '期限是什么？', paths: [name] });
  contract.result.parse(prepared); assert.equal(prepared.sources.length, 1); assert.match(prepared.prompt, /10: 期限为三天/); assert.match(prepared.prompt, /默认只回答/); assert.match(prepared.prompt, /#L行号/);
  assert.equal((await service.vault.settings()).sources.length, 0);
  await assert.rejects(knowledge.manage({ action: 'question', question: '问题', paths: [name, name] }), { code: 'QUESTION' });
  const hash = (await service.vault.read(name)).hash;
  await assert.rejects(knowledge.manage({ action: 'write', path: name, content: note('依据'), expectedHash: '' }), error => {
    assert.equal(error.code, 'CONFLICT');
    assert.deepEqual(error.details, {});
    return true;
  });
  assert.equal((await service.vault.read(name)).hash, hash);
  await service.core.dispose();
  await assert.rejects(knowledge.manage({ action: 'status' }), /已卸载/);
});
