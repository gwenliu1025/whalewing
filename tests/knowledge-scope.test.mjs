import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { Vault, readableName } from '../src/vault.js';
import { parseLinks, resolveLinks } from '../src/links.js';
import { knowledgeContract } from '../features/knowledge/contract.js';

const contract = knowledgeContract(z);
const record = (path, body, aliases = []) => ({ path, title: path.split('/').at(-1).replace(/\.md$/i, ''), aliases, parsed: parseLinks(body) });
const note = (title, body = '') => `---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-12\nupdated: 2026-10-12\naliases: []\n---\n# ${title}\n\n${body}\n`;
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-scope-'));
  const vault = new Vault(path.join(root, 'vault'));
  await vault.initialize();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (name, body) => vault.write(name, note(path.posix.basename(name, '.md'), body), '');
  return { vault, write };
}

test('根级导航可读索引浏览，但不要求属性区也不给写删恢复权限', async t => {
  const { vault, write } = await fixture(t);
  const original = '# AGENTS\n\n[[40-知识/依据#不存在]]\n';
  await fs.writeFile(path.join(vault.root, 'AGENTS.md'), original);
  await fs.writeFile(path.join(vault.root, '.hidden.md'), '# 隐藏');
  await fs.mkdir(path.join(vault.root, 'outside'));
  await fs.writeFile(path.join(vault.root, 'outside', '私有.md'), '# 不入图');
  await write('40-知识/依据.md', '[[AGENTS]]');
  const doc = await vault.document('AGENTS.md');
  contract.result.parse(doc);
  assert.equal(doc.content, original); assert.equal(doc.readOnly, true);
  assert.equal(doc.links[0].status, 'fragment_missing');
  assert.equal(doc.backlinks[0].path, '40-知识/依据.md');
  const browse = await vault.browse();
  contract.result.parse(browse);
  assert.deepEqual(browse.notes, [{ path: 'AGENTS.md', title: 'AGENTS', readOnly: true }]);
  const search = await vault.search('AGENTS');
  contract.result.parse(search);
  assert.equal(search.notes.find(item => item.path === 'AGENTS.md').status, '只读');
  assert.equal(search.notes.find(item => item.path === 'AGENTS.md').issue, undefined);
  const graph = await vault.graph({ path: 'AGENTS.md' });
  contract.graphResult.parse(graph);
  assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 2);
  assert.ok(graph.nodes.every(item => item.degree === 1));
  assert.equal(graph.nodes.find(item => item.path === 'AGENTS.md').readOnly, true);
  assert.equal(graph.nodes.find(item => item.path === '40-知识/依据.md').readOnly, false);
  const issues = (await vault.validate()).issues;
  assert.ok(issues.some(item => item.includes('fragment_missing')));
  assert.ok(!issues.some(item => item.includes('METADATA')));
  for (const operation of [() => vault.write('AGENTS.md', original, doc.hash), () => vault.remove('AGENTS.md', doc.hash), () => vault.restore('AGENTS.md', doc.hash)]) await assert.rejects(operation, { code: 'PATH' });
  for (const name of ['.hidden.md', 'outside/私有.md', '../逃逸.md', 'missing:name:甲']) await assert.rejects(vault.read(name), { code: 'PATH' });
  assert.equal(await fs.readFile(path.join(vault.root, 'AGENTS.md'), 'utf8'), original);
});

test('缺失身份按Wiki名称与规范路径区分，别名锚点大小写及NFC不制造重复', () => {
  const records = resolveLinks([
    record('20-项目/甲源.md', '[[ 未复制 ]] [[未复制.md#标题|别名]] [[40-知识/甲]] [甲](../40-知识/甲.md) [本地](甲.md) [[./甲]] [[É]] [[e\u0301.md]]'),
    record('40-知识/乙源.md', '[[未复制]] [甲](甲.md) [[甲]] [[40-知识/./甲.md#章节]] [本地](./../40-知识/甲.md) [[../20-项目/甲]]'),
  ], readableName);
  const a = records[0].links, b = records[1].links;
  assert.ok([...a, ...b].every(link => link.status === 'missing'));
  assert.equal(a[0].missingId, 'missing:name:未复制');
  assert.equal(a[0].missingId, a[1].missingId); assert.equal(a[0].missingId, b[0].missingId);
  assert.equal(a[2].missingId, 'missing:path:40-知识/甲.md');
  for (const link of [a[3], b[1], b[3], b[4]]) assert.equal(link.missingId, a[2].missingId);
  assert.equal(a[4].missingId, 'missing:path:20-项目/甲.md');
  assert.equal(a[4].missingId, a[5].missingId); assert.equal(a[4].missingId, b[5].missingId);
  assert.notEqual(a[4].missingId, b[1].missingId); assert.notEqual(b[2].missingId, b[1].missingId);
  assert.equal(a[6].missingId, a[7].missingId);
});

test('现有文件优先，附件不宣称存在，歧义和非法路径不生成缺失笔记', () => {
  const links = resolveLinks([
    record('40-知识/源.md', '[[图.png]] [附件](./图.pdf) [[点号.v1]] [[点号.v1.md]] [[存在.png]] [[同名]] [[.././../越界]] [[.隐藏]] [[40-知识/.隐藏/甲]] [[/绝对]] [[C:\\绝对]] [[http://外部]] [[甲?乙]] [编码非法](./%00.md) [[con]]'),
    record('20-项目/同名.md', ''), record('30-领域/同名.md', ''), record('40-知识/存在.png.md', ''),
  ], readableName)[0].links;
  assert.deepEqual(links.map(link => link.status), ['attachment', 'attachment', 'attachment', 'missing', 'resolved', 'ambiguous', ...Array(9).fill('invalid')]);
  assert.equal(links[4].path, '40-知识/存在.png.md');
  assert.ok(links.filter(link => link.status !== 'missing').every(link => link.missingId === undefined));
});

test('合法网络链接保留外链语义，库外绝对路径才成为非法知识引用', () => {
  const parsed = parseLinks('[网站](https://example.invalid/page) [邮件](mailto:team@example.invalid) [图片](./image.png) [库外](D:/outside/note.md) [绝对](/outside/note.md)');
  const links = resolveLinks([{ path: '40-知识/源.md', title: '源', aliases: [], parsed }], readableName)[0].links;
  assert.deepEqual(links.map(link => link.status), ['attachment', 'invalid', 'invalid']);
  const external = parsed.view.children[0].children.filter(node => node.type === 'link');
  assert.deepEqual(external.map(node => node.url), ['https://example.invalid/page', 'mailto:team@example.invalid']);
});

test('存在的范围外文件不成为缺失节点，仅允许读取范围中的未命中笔记标记缺失', async t => {
  const { vault, write } = await fixture(t);
  await fs.mkdir(path.join(vault.root, 'outside'));
  await fs.writeFile(path.join(vault.root, 'outside', '私有.md'), '# 范围外私有正文\n');
  await fs.writeFile(path.join(vault.root, '.whalewing', '私有.md'), '# 内部私有正文\n');
  await fs.writeFile(path.join(vault.root, '.隐藏.md'), '# 隐藏正文\n');
  await write('40-知识/来源.md', '[[outside/私有]] [私有](../outside/私有.md) [[outside/未建立]] [[.whalewing/私有]] [[.隐藏]] [[40-知识/未建立]] [[根级未建立.md]]');
  const doc = await vault.document('40-知识/来源.md');
  contract.result.parse(doc);
  assert.deepEqual(doc.links.map(link => link.status), [...Array(5).fill('invalid'), 'missing', 'missing']);
  assert.ok(doc.links.slice(0, 5).every(link => link.missingId === undefined));
  assert.equal(doc.links[5].missingId, 'missing:path:40-知识/未建立.md');
  assert.equal(doc.links[6].missingId, 'missing:name:根级未建立');
  const graph = await vault.graph({ path: '40-知识/来源.md' });
  contract.graphResult.parse(graph);
  assert.deepEqual(graph.nodes.filter(node => node.kind === 'missing').map(node => node.path).sort(), ['missing:name:根级未建立', 'missing:path:40-知识/未建立.md'].sort());
  assert.equal(graph.edges.length, 2);
  assert.equal((await vault.search('范围外私有正文')).notes.length, 0);
  for (const name of ['outside/私有.md', '.whalewing/私有.md', '.隐藏.md']) await assert.rejects(vault.read(name), { code: 'PATH' });
});

test('缺失图节点持有来源，真实文件出现后重建归并，不改变方向事实及完整连接度', async t => {
  const { vault, write } = await fixture(t);
  await write('20-项目/甲.md', '[[未建立]] [[未建立.md#失效]] [[40-知识/乙]] [[甲]] [[图.png]]');
  await write('40-知识/乙.md', '[[未建立]] [[20-项目/甲#坏锚点]]');
  let graph = await vault.graph({ path: '20-项目/甲.md' });
  contract.graphResult.parse(graph);
  const missing = graph.nodes.find(node => node.kind === 'missing');
  assert.equal(missing.path, 'missing:name:未建立'); assert.equal(missing.degree, 2);
  assert.deepEqual(missing.sources.map(source => source.path), ['20-项目/甲.md', '40-知识/乙.md']);
  assert.equal(graph.edges.length, 5);
  assert.ok(graph.nodes.every(node => node.degree === 2));
  assert.equal(graph.unresolved, 4);
  const filtered = await vault.graph({ query: '20-项目/甲' });
  assert.equal(filtered.nodes[0].degree, 2); assert.ok(filtered.omittedEdges > 0);
  await assert.rejects(vault.read(missing.path), { code: 'PATH' });
  await write('40-知识/未建立.md', '');
  graph = await vault.graph({ path: '20-项目/甲.md' });
  assert.ok(!graph.nodes.some(node => node.kind === 'missing'));
  assert.ok(graph.edges.some(edge => edge.target === '40-知识/未建立.md'));
  assert.equal((await vault.document('40-知识/未建立.md')).totalBacklinks, 3);
});

test('空图同样要求图级版本，拒绝旧版或未区分文件与缺失身份的节点', async t => {
  const { vault } = await fixture(t);
  const empty = await vault.graph({ query: '无匹配' });
  contract.graphResult.parse(empty); assert.equal(empty.version, 2); assert.equal(empty.nodes.length, 0);
  const { version, ...old } = empty;
  assert.equal(contract.graphResult.safeParse(old).success, false);
  assert.equal(contract.graphResult.safeParse({ ...empty, version: 1 }).success, false);
  assert.equal(contract.graphResult.safeParse({ ...empty, nodes: [{ path: '40-知识/甲.md', title: '甲', degree: 0 }] }).success, false);
});
