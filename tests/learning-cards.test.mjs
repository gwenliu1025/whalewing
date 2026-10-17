import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SaxesParser } from 'saxes';
import { z } from 'zod';
import { dailyLearning, learningCards, selectLearningContext } from '../src/learning-cards.js';
import { News } from '../src/news.js';
import { newsContract } from '../src/news-contract.js';

const now = Date.parse('2026-10-12T05:00:00Z');
const contract = newsContract(z);
const knowledge = (title, excerpt = '') => ({ status: 'ready', total: 1, notes: [{ path: `40-知识/${title}.md`, title, excerpt }] });
const assets = [
  ['management-planning.cnxml', 'ae8ba63a25b9e8ea00c43255bcd38fbf1e9ae698b98302368fbabc2f58d2bbae'],
  ['management-communication.cnxml', '588ee97ff314e0eb552c5b8671dae9554b463d6f537722a4041a3cb5e33f79d9'],
  ['economics-scarcity.cnxml', '5d0b55ff4c1c95e56de922be66e27c18b274e2d12b390495affaf0e747eeb418'],
  ['economics-budget.cnxml', '7eb52330b5833129040d831b8fb34a690b565eae40bf37b55645e2cc6d6c7faa'],
  ['ai-prompt-fundamentals.md', '56fade87580c8c845a5fb3ca198569ee6e9fd77f1df1ec03ada0274a3188cf2b'],
  ['ai-advanced-prompts.md', 'cf349fa256ae9c27f732ae00f6cee9543d0af6ca49f14e8de43db1f05315449a'],
];

test('6篇固定开放许可原件完整随包，来源版本、授权和字节可核对', async () => {
  assert.equal(learningCards.length, 6);
  for (const [i, [file, hash]] of assets.entries()) {
    const bytes = await readFile(new URL(`../content/learning/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
    const card = learningCards[i];
    assert.ok(card.article.body.length > 4500, card.id);
    assert.ok(card.article.view.children.length > 20, card.id);
    assert.ok(card.source.url.includes(card.source.revision));
    assert.equal(card.source.license, i < 4 ? 'CC BY 4.0' : 'MIT');
    assert.ok(card.source.attribution.includes(i < 4 ? 'OpenStax' : 'Microsoft'));
    if (i >= 4) assert.equal(card.article.body, new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
  const cc = await readFile(new URL('../content/learning/CC-BY-4.0.txt', import.meta.url), 'utf8');
  assert.match(cc, /^Attribution 4.0 International/);
  const economics = await readFile(new URL('../content/learning/OpenStax-Economics-CC-BY-4.0.txt', import.meta.url));
  assert.equal(createHash('sha256').update(economics).digest('hex'), '0ff174546cbe3dd1287da231f9796618ac2f6e6595b2d11f567b2c9790f64868');
  assert.equal(economics.toString('utf8').replace(/\r\n/g, '\n').trim(), cc.replace(/\r\n/g, '\n').trim());
  const mit = await readFile(new URL('../content/learning/Microsoft-MIT.txt', import.meta.url), 'utf8');
  assert.match(mit, /Permission is hereby granted/); assert.match(mit, /Microsoft/);
});

test('教材转换保留所有正文文字片段，阅读树不创建图片请求或个人知识跳转', async () => {
  for (let i = 0; i < 4; i++) {
    const text = await readFile(new URL(`../content/learning/${assets[i][0]}`, import.meta.url), 'utf8');
    const parser = new SaxesParser({ xmlns: true }), stack = [], fragments = [];
    parser.on('opentag', tag => stack.push(tag.local));
    parser.on('closetag', () => stack.pop());
    parser.on('text', value => { if ((stack.includes('content') || stack.includes('glossary') || stack.includes('abstract')) && !stack.includes('media') && value.trim().length > 4) fragments.push(value); });
    parser.write(text).close();
    const normalize = value => value.replaceAll('*', '').replace(/\s+/g, ' ').trim();
    const body = normalize(learningCards[i].article.body);
    for (const fragment of fragments) assert.ok(body.includes(normalize(fragment)), `${assets[i][0]}缺少：${fragment.slice(0, 80)}`);
  }
  const visit = node => { assert.ok(!['image', 'html', 'knowledgeLink'].includes(node.type)); node.children?.forEach(visit); };
  for (const card of learningCards) visit(card.article.view);
});

test('同日按本人知识排序，不同工作主题产生不同推荐且保留真实出处', () => {
  const planning = dailyLearning(now, knowledge('项目计划与交付', '实施排期和目标'));
  const communication = dailyLearning(now, knowledge('沟通会议和纪要', '负责人交接及反馈'));
  assert.equal(planning.cards[0].id, 'management-planning');
  assert.equal(communication.cards[0].id, 'management-communication');
  assert.equal(communication.cards[0].recommendation.kind, 'knowledge');
  assert.equal(communication.cards[0].recommendation.matchedNotes[0].path, '40-知识/沟通会议和纪要.md');
  assert.match(communication.cards[0].recommendation.reason, /沟通会议和纪要/);
  assert.equal(dailyLearning(now, knowledge('预算成本采购', '工时与收益')).cards[1].id, 'economics-budget');
  assert.equal(dailyLearning(now, knowledge('工单分类', '样例测试与边界校验')).cards[2].id, 'ai-example');
  assert.deepEqual(planning, dailyLearning(now + 3600000, knowledge('项目计划与交付', '实施排期和目标')));
  contract.result.parse({ reports: [], learning: communication });
});

test('空库、未匹配和读取失败都明确显示通用内容，库外正文不回传', () => {
  const empty = dailyLearning(now);
  assert.equal(empty.context.status, 'empty');
  assert.ok(empty.cards.every(card => card.recommendation.kind === 'general'));
  const unrelated = dailyLearning(now, knowledge('园艺', '仅私人正文片段，不作为卡片正文传播'));
  assert.ok(unrelated.cards.every(card => card.recommendation.kind === 'general'));
  assert.ok(!JSON.stringify(unrelated).includes('仅私人正文片段'));
  const failed = dailyLearning(now, { status: 'unavailable', notes: [], total: 0, issue: '读取失败' });
  assert.ok(failed.cards.every(card => card.recommendation.kind === 'general' && card.recommendation.matchedNotes.length === 0));
  assert.equal(failed.context.issue, '读取失败');
  const malformed = structuredClone(empty);
  malformed.cards[0].recommendation.kind = 'knowledge';
  assert.equal(contract.result.safeParse({ reports: [], learning: malformed }).success, false);
});

test('推荐结果不修改静态正文，日轮换不把调用者改动写回下一次', () => {
  const first = dailyLearning(now); first.cards[0].article.body = '修改'; first.cards[0].highlights.push('修改');
  const next = dailyLearning(now);
  assert.ok(next.cards[0].article.body.length > 4500);
  assert.ok(!next.cards[0].highlights.includes('修改'));
  assert.notDeepEqual(next.cards.map(card => card.id), dailyLearning(now + 86400000).cards.map(card => card.id));
});

test('近期知识采样排除系统/来源/流水/资产/归档，按有效updated选100篇并标明范围', () => {
  const note = (path, updated = '2026-10-12', status = 'seedling') => ({ path, title: path.split('/').at(-1), content: `---\nupdated: ${updated}\nstatus: ${status}\n---\n${'正文'.repeat(900)}` });
  const records = [
    ...['00-系统/规则.md', '50-来源/文章.md', '60-时间线/日记.md', '80-外部索引/资产.md', '90-归档/任务.md', 'AGENTS.md'].map(path => note(path)),
    note('40-知识/已归档.md', undefined, 'archived'), note('40-知识/无效日期.md', '2099-02-30'),
    ...Array.from({ length: 105 }, (_, i) => note(`20-项目/${String(i).padStart(3, '0')}.md`, i === 104 ? '2026-10-13' : '2026-10-12')),
  ];
  const result = selectLearningContext(records);
  assert.equal(result.total, 106); assert.equal(result.notes.length, 100);
  assert.equal(result.notes[0].path, '20-项目/104.md');
  assert.ok(result.notes.every(note => note.excerpt.length <= 1600 && !note.excerpt.includes('updated:')));
  assert.ok(!result.notes.some(note => note.path.includes('无效日期')));
  assert.deepEqual(result, selectLearningContext([...records].reverse()));
});

function service(t, learningContext) {
  const tables = new Map();
  const domain = { table(name) { if (!tables.has(name)) tables.set(name, new Map()); const values = tables.get(name); return { get: key => values.get(key), put: async (key, value) => values.set(key, value), keys: () => values.keys() }; } };
  let fetches = 0;
  const news = new News(domain, { now: () => now, learningContext, fetch: async () => { fetches++; throw new Error('本地阅读不应联网'); } });
  t.after(() => news.dispose());
  return { news, fetches: () => fetches };
}

test('News首页只读取个人上下文一次，正文直接返回且零网络调用', async t => {
  let reads = 0;
  const h = service(t, async signal => { assert.equal(signal.aborted, false); reads++; return { notes: knowledge('工单分类').notes, total: 1 }; });
  const result = await h.news.manage({ action: 'home' }, new AbortController().signal);
  assert.equal(reads, 1); assert.equal(h.fetches(), 0);
  assert.equal(result.learning.context.status, 'ready');
  assert.equal(result.learning.cards[2].id, 'ai-example');
  assert.ok(result.learning.cards[2].article.body.length > 10000);
});

test('News个人读取失败保留完整通用文章与诊断，不把失败报告成空库或个人化', async t => {
  const h = service(t, async () => { throw new Error('目录读取失败'); });
  const result = await h.news.manage({ action: 'home' });
  assert.equal(result.learning.context.status, 'unavailable');
  assert.match(result.learning.context.issue, /目录读取失败/);
  assert.ok(result.learning.cards.every(card => card.recommendation.kind === 'general'));
  assert.equal(h.fetches(), 0);
});

test('News卸载取消并等待在途个人读取，取消不降级为通用成功', async t => {
  const entered = Promise.withResolvers();
  let stopped = false;
  const h = service(t, signal => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { stopped = true; reject(signal.reason); }, { once: true }); entered.resolve();
  }));
  const reading = h.news.manage({ action: 'home' });
  const rejected = assert.rejects(reading, /已卸载/);
  await entered.promise;
  await h.news.dispose(); await rejected;
  assert.equal(stopped, true); assert.equal(h.news.learningReads.size, 0);
});
