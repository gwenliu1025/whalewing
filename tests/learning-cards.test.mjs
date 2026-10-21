import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SaxesParser } from 'saxes';
import { z } from 'zod';
import { dailyLearning, learningCards, learningArticle, learningReadingView, selectLearningContext } from '../features/cards/learning-cards.js';
import { parseLinks } from '../src/links.js';
import { News } from '../features/cards/news.js';
import { newsContract } from '../features/cards/contract.js';

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
    // 中文字数不等于英文字符数；原件完整性与实际呈现正文分别核对。
    assert.ok(learningArticle(file).body.length > 4500, card.id);
    assert.ok(card.article.view.children.length > 20, card.id);
    assert.ok(card.source.url.includes(card.source.revision));
    assert.equal(card.source.license, i < 4 ? 'CC BY 4.0' : 'MIT');
    assert.ok(card.source.attribution.includes(i < 4 ? 'OpenStax' : 'Microsoft'));
    const original = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (i === 4) assert.equal(card.article.body, original.replace('零样本提示(one-shot)', '零样本提示(zero-shot；原文误写为one-shot，此处由鲸翼校订)'));
    if (i === 5) assert.equal(card.article.body, original);
    if (i < 4) {
      assert.equal(card.article.body, await readFile(new URL(`../content/learning/${file.replace('.cnxml', '.zh-CN.md')}`, import.meta.url), 'utf8'));
      assert.match(card.source.usage, /鲸翼中文翻译，非OpenStax官方译本/);
    }
    assert.equal(card.article.language, 'zh-CN');
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
    const body = normalize(learningArticle(assets[i][0]).body);
    for (const fragment of fragments) assert.ok(body.includes(normalize(fragment)), `${assets[i][0]}缺少：${fragment.slice(0, 80)}`);
  }
  const visit = node => { assert.ok(!['image', 'html', 'knowledgeLink'].includes(node.type)); node.children?.forEach(visit); };
  for (const card of learningCards) visit(card.article.view);
});

test('四篇译文保留全部原章节标题、图示说明、术语和练习结构，不以导读代正文', async () => {
  const titles = [
    ['计划重要吗', '管理者为什么应该做计划', '管理者真的会做计划吗', '特雷莎·梅'],
    ['管理沟通的过程', '基本沟通模型', '编码与解码', '反馈', '噪声'],
    ['什么是经济学，为什么它很重要', 'FRED简介', '资源的稀缺', '稀缺问题', '亚当·斯密', '劳动分工与专业化', '劳动分工', '劳动分工为什么能提高产量', '贸易与市场', '为什么学习经济学', '埃丝特·迪弗洛、阿比吉特·班纳吉与迈克尔·克雷默', '关键概念与小结', '自测题', '复习题', '批判性思考题', '参考文献'],
    ['个人如何根据预算约束作出选择', '预算约束：阿方索的消费选择机会边界', '机会成本的概念', '动手算一算：理解预算约束', '识别机会成本', '加强机场安全措施有什么机会成本', '边际决策与边际效用递减', '沉没成本', '从两种商品模型扩展到多种商品', '关键概念与小结', '自测题', '复习题', '批判性思考题', '练习题', '参考文献'],
  ];
  const section = (body, title) => body.split(`## ${title}\n`)[1]?.split('\n## ')[0] || '';
  for (let i = 0; i < 4; i++) {
    const text = await readFile(new URL(`../content/learning/${assets[i][0]}`, import.meta.url), 'utf8');
    const parser = new SaxesParser({ xmlns: true }), stack = [], original = { titles: 0, figures: 0, terms: 0, exercises: 0, solutions: 0, checks: 0 };
    parser.on('opentag', tag => {
      stack.push(tag.local);
      if (tag.local === 'title' && !stack.includes('metadata')) original.titles++;
      if (tag.local === 'media') original.figures++;
      if (tag.local === 'definition' && stack.includes('glossary')) original.terms++;
      if (tag.local === 'exercise') original.exercises++;
      if (tag.local === 'solution') original.solutions++;
      if (tag.local === 'note' && Object.values(tag.attributes).some(attr => attr.value === 'concept-check')) original.checks++;
    });
    parser.on('closetag', () => stack.pop()); parser.write(text).close();
    const body = learningCards[i].article.body;
    assert.equal(titles[i].length, original.titles, assets[i][0]);
    let previous = -1;
    for (const title of titles[i]) {
      const at = body.indexOf(`# ${title}\n`);
      assert.ok(at > previous, `${assets[i][0]}缺少或错序：${title}`); previous = at;
    }
    assert.equal((body.match(/^图示说明：/gm) || []).length, original.figures);
    assert.equal((section(body, '术语表').match(/^- \*\*/gm) || []).length, original.terms);
    assert.equal((body.match(/^答案：/gm) || []).length, original.solutions);
    const exercises = ['自测题', '复习题', '批判性思考题', '练习题'].map(title => section(body, title));
    const questionCount = exercises.reduce((sum, value) => sum + (value.match(/^(?:### )?\d+\./gm) || []).length, 0) + (i === 3 ? 2 : 0);
    assert.equal(questionCount, original.exercises);
    if (original.checks) assert.equal((body.split('### 概念检查\n')[1].split('\n## ')[0].match(/^\d+\./gm) || []).length, 3);
    assert.match(body, /鲸翼中文翻译，非OpenStax官方译本/);
    assert.ok((body.match(/\p{Script=Han}/gu) || []).length > 1000, '正文不是英文原件或短导读');
    assert.ok(!body.includes('以下英文正文'));
  }
});

test('中文预算课保留全部表格数值、七步公式、历史计算差异与未解练习', () => {
  const body = learningCards[3].article.body;
  for (const row of ['A | 5 | 0', 'B | 4 | 4', 'C | 3 | 8', 'D | 2 | 12', 'E | 1 | 16', 'F | 0 | 20']) assert.ok(body.includes(`| ${row} |`));
  for (let step = 1; step <= 7; step++) assert.ok(body.includes(`第${step}步`));
  for (const formula of ['预算 = P₁ × Q₁ + P₂ × Q₂', 'y = b + mx', '10 = 2 × Q汉堡 + 0.50 × Q车票', '2 × 10 = 2 × 2 × Q汉堡 + 2 × 0.5 × Q车票', '20 = 4 × Q汉堡 + 1 × Q车票', '20 − Q车票 = 4 × Q汉堡', '5 − 0.25 × Q车票 = Q汉堡', 'Q汉堡 = 5 − 0.25 × Q车票', '8亿人次 × 0.5小时 × 20美元/小时 = 每年80亿美元', '250 × 5 = 1,250美元', '0.50 ÷ 2 = 0.25', '1 ÷ 2 = 0.50']) assert.ok(body.includes(formula), formula);
  for (const fragment of ['8.955亿人次', '斜率的绝对值', '原文这一步', '每周有24美元预算', '每本杂志4美元', '每个馅饼12美元', '接下来的90分钟']) assert.ok(body.includes(fragment));
  const unanswered = body.split('## 复习题\n')[1].split('## 参考文献')[0];
  assert.ok(!unanswered.includes('答案：'), '不补造原章未给出的答案');
});

test('译文保留历史案例、数据和引用，MS只校订已确认的零样本错字', () => {
  for (const fragment of ['米克·巴克', 'Calico Candy Company', '400亿美元', '20.7%', '77%', '39%', '美国联合航空公司', '明茨伯格', 'Williams, 1993', 'CC BY 2.0']) assert.ok(learningCards[0].article.body.includes(fragment), fragment);
  for (const fragment of ['信息性反馈', '纠正性反馈', '强化性反馈', '月末库存', '学期论文', '1948', '2015']) assert.ok(learningCards[1].article.body.includes(fragment), fragment);
  for (const fragment of ['1.58亿', '3,794,101', '400,000', '18项', '48,000', '50,000', '2019', '2012', '每小时收入200美元', '100人 ÷ 每条火腿10人', 'iPod']) assert.ok(learningCards[2].article.body.includes(fragment), fragment);
  assert.match(learningCards[4].article.body, /零样本提示\(zero-shot；原文误写为one-shot，此处由鲸翼校订\)/);
  assert.match(learningCards[4].source.usage, /不是官方修订版/);
  assert.match(learningCards[5].source.usage, /正文未改写/);
  for (const day of [now, now + 86400000]) contract.result.parse({ reports: [], learning: dailyLearning(day) });
});

test('学习阅读只隐藏真正HTML注释并解释strong/br，代码和转义示例逐字保留', () => {
  const example = '<!-- 教学注释 --> <strong>示例</strong><br>';
  const body = `  <!-- 缩进隐藏块 -->\n\n<!-- 隐藏块 -->可见尾部<!-- 第二条隐藏块 -->\n\n<strong>强调 **原Markdown**</strong><br>下一行\n\n| 说明 | 例子 |\n| --- | --- |\n| <strong>表内强调</strong> | 第一行<br/>第二行 |\n\n\`<strong>行内代码</strong><!--代码注释--><br>\`\n\n\`\`\`html\n${example}\n\`\`\`\n\n\\<strong>转义示例\\</strong>与\\<!--转义注释-->\n\n[正文外链](https://example.org)与[[本机知识]]\n\n<script>alert('保留文字但不执行')</script>\n\n<strong>未闭合内容\n\n[ref]: https://example.org/reference\n\n[引用链接][ref]`;
  const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
  const view = learningReadingView(body), nodes = flatten(view), visible = nodes.filter(node => typeof node.value === 'string').map(node => node.value).join('');
  assert.ok(!visible.includes('隐藏块')); assert.ok(!visible.includes('第二条隐藏块')); assert.ok(visible.includes('可见尾部'));
  assert.equal(nodes.find(node => node.type === 'code').value, example);
  assert.equal(nodes.find(node => node.type === 'inlineCode').value, '<strong>行内代码</strong><!--代码注释--><br>');
  assert.ok(visible.includes('<strong>转义示例</strong>与<!--转义注释-->'));
  assert.equal(nodes.filter(node => node.type === 'break').length, 2);
  assert.ok(nodes.some(node => node.type === 'strong' && node.children.some(child => child.value === '表内强调')));
  assert.ok(nodes.some(node => node.type === 'strong' && node.children.some(child => child.type === 'strong')));
  assert.ok(visible.includes('<strong>未闭合内容'));
  assert.ok(visible.includes("<script>alert('保留文字但不执行')</script>"));
  assert.ok(!nodes.some(node => ['html', 'knowledgeLink', 'strongStart', 'strongEnd', 'image'].includes(node.type)));
  assert.ok(nodes.some(node => node.type === 'link' && node.url === 'https://example.org/reference'));
  assert.ok(JSON.stringify(parseLinks(body).view).includes('隐藏块'), '个人知识原有HTML文字语义不变');
});

test('实际中文课程阅读树隐藏翻译服务标记而保留声明、英文教学样例和代码HTML', () => {
  const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
  const basics = learningCards[4], advanced = learningCards[5];
  assert.ok(basics.article.body.includes('<!-- CO-OP TRANSLATOR DISCLAIMER END -->'), '原始正文不改写');
  assert.ok(!JSON.stringify(basics.article.view).includes('CO-OP TRANSLATOR DISCLAIMER'));
  assert.ok(JSON.stringify(basics.article.view).includes('自动翻译可能包含错误'));
  const basicsNodes = flatten(basics.article.view);
  assert.ok(basicsNodes.some(node => node.type === 'strong' && node.children.some(child => child.value === '简短总结')));
  assert.ok(basicsNodes.some(node => node.type === 'break'));
  assert.ok(JSON.stringify(basics.article.view).includes('The Sun is Shining'));
  assert.ok(flatten(advanced.article.view).some(node => node.type === 'code' && node.value.includes('<h1>Books API</h1>')));
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
  assert.equal(next.cards[0].article.body, learningCards[0].article.body);
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
