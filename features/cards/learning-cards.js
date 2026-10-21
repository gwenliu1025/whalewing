import { readFileSync } from 'node:fs';
import { SaxesParser } from 'saxes';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { parseLinks } from '../../src/links.js';
import { frontmatter } from '../../src/vault.js';

const managementRevision = 'a995241fbc161854a1fab15bdd3bec3f98dfd64b';
const economicsRevision = '020e54dbecb376f27b37c3498f9347a45961c11a';
const aiRevision = 'd45da91247ecb91e5346caacdd5a5fb9c5b9d85e';
const contentRoot = new URL('../../content/learning/', import.meta.url);

/** 教材的排版HTML不成为可执行HTML；代码与转义示例仍按原Markdown语义显示。 */
export function learningReadingView(body) {
  const source = fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const text = (value, line) => ({ type: 'text', value, line });
  const html = node => {
    const line = node.position.start.line, value = node.value;
    if (value.trimStart().startsWith('<!--')) {
      // 块注释结束后的同一行可有可见正文，不能连正文一起丢弃。
      const visible = value.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
      return visible.trim() ? [text(visible, line)] : [];
    }
    if (/^<br\s*\/?>$/i.test(value)) return [{ type: 'break', line }];
    if (/^<strong\s*>$/i.test(value)) return [{ type: 'strongStart', value, line }];
    if (/^<\/strong\s*>$/i.test(value)) return [{ type: 'strongEnd', value, line }];
    return [text(value, line)];
  };
  const inline = nodes => {
    const stack = [{ children: [] }];
    for (const node of nodes) {
      if (node.type === 'strongStart') stack.push({ opening: node, children: [] });
      else if (node.type === 'strongEnd' && stack.length > 1) {
        const group = stack.pop();
        stack.at(-1).children.push({ type: 'strong', line: group.opening.line, children: group.children });
      } else stack.at(-1).children.push(node.type === 'strongEnd' ? text(node.value, node.line) : node);
    }
    // 不完整的排版标记保留为文字，不吞掉其后正文。
    while (stack.length > 1) { const group = stack.pop(); stack.at(-1).children.push(text(group.opening.value, group.opening.line), ...group.children); }
    return stack[0].children;
  };
  const withoutKnowledge = node => node.type === 'knowledgeLink' ? text(node.value, node.line) : { ...node, ...(node.children ? { children: node.children.map(withoutKnowledge) } : {}) };
  const reading = (original, node) => {
    if (original.type === 'html') return html(original);
    if (original.children && node.children) {
      // parseLinks只移除definition；按节点位置配对，避免把同一行的转义HTML误当标签。
      const originals = original.children.filter(child => child.type !== 'definition');
      return [{ ...node, children: inline(node.children.flatMap((child, index) => reading(originals[index], child))) }];
    }
    return [withoutKnowledge(node)];
  };
  return reading(source, parseLinks(body).view)[0];
}

// 原件用于来源核验，译文用于阅读；只在这里把随包正文转换为安全阅读树。
export function learningArticle(filename) {
  const source = readFileSync(new URL(filename, contentRoot));
  const text = new TextDecoder('utf-8', { fatal: true }).decode(source);
  let body = text;
  if (filename.endsWith('.cnxml')) {
    const elements = [], stack = [];
    const parser = new SaxesParser({ xmlns: true });
    parser.on('doctype', () => { throw new Error('学习教材不接受外部实体'); });
    parser.on('error', error => { throw error; });
    parser.on('opentag', tag => {
      const node = { name: tag.local, attrs: Object.fromEntries(Object.values(tag.attributes).map(attribute => [attribute.local, attribute.value])), children: [] };
      stack.at(-1)?.children.push(node); elements.push(node); stack.push(node);
    });
    parser.on('text', value => stack.at(-1)?.children.push(value));
    parser.on('cdata', value => stack.at(-1)?.children.push(value));
    parser.on('closetag', () => stack.pop());
    parser.write(text).close();
    const named = new Map(elements.filter(node => node.attrs.id).map(node => [node.attrs.id, node]));
    const children = node => node.children.map(render).join('');
    const textOf = node => typeof node === 'string' ? node : node.children.map(textOf).join('');
    const render = node => {
      if (typeof node === 'string') return node.replace(/\s+/g, ' ');
      const kind = node.name;
      if (kind === 'media') return `\n\n图示说明：${node.attrs.alt || '参见原文图注'}\n\n`;
      if (kind === 'image') return '';
      if (kind === 'title') return `\n\n### ${children(node).trim()}\n\n`;
      if (kind === 'para' || kind === 'caption' || kind === 'definition') return `\n\n${children(node).trim()}\n\n`;
      if (kind === 'item') return `\n- ${children(node).trim()}\n`;
      if (kind === 'tgroup') {
        const rows = [];
        const collect = current => { if (current.name === 'row') rows.push(current.children.filter(child => child.name === 'entry').map(child => textOf(child).trim().replaceAll('|', '\\|').replace(/\s+/g, ' '))); else if (typeof current !== 'string') current.children.forEach(collect); };
        collect(node);
        if (!rows.length) return children(node);
        const width = Math.max(...rows.map(row => row.length));
        const tableRow = row => `| ${Array.from({ length: width }, (_, i) => row[i] || '').join(' | ')} |`;
        return `\n\n${tableRow(rows[0])}\n${tableRow(Array(width).fill('---'))}\n${rows.slice(1).map(tableRow).join('\n')}\n\n`;
      }
      if (kind === 'row') return `\n${node.children.filter(child => child.name === 'entry').map(child => textOf(child).trim()).join(' | ')}\n`;
      if (kind === 'mtr') return `\n\n${children(node).trim()}\n\n`;
      if (kind === 'emphasis') return `${node.attrs.effect === 'bold' ? '**' : '*'}${children(node)}${node.attrs.effect === 'bold' ? '**' : '*'}`;
      if (kind === 'mfrac') { const values = node.children.filter(child => typeof child !== 'string').map(render); return `(${values[0]})/(${values[1]})`; }
      if (kind === 'msup' || kind === 'msub') { const values = node.children.filter(child => typeof child !== 'string').map(render); return `${values[0]}${kind === 'msup' ? '^' : '_'}(${values[1]})`; }
      if (kind === 'link') {
        const label = children(node).trim();
        if (label) return label;
        const target = named.get(node.attrs['target-id']);
        const title = target?.children.find(child => child.name === 'title');
        return target ? `（${title ? textOf(title) : '参见本节图表'}）` : '（参见原书交叉引用）';
      }
      return children(node);
    };
    const title = textOf(elements.find(node => node.name === 'title'));
    const abstract = elements.find(node => node.name === 'abstract');
    body = `# ${title}\n\n${abstract && textOf(abstract).trim() ? render(abstract) : ''}\n\n${render(elements.find(node => node.name === 'content'))}`;
    for (const glossary of elements.filter(node => node.name === 'glossary')) body += `\n\n## Glossary\n\n${render(glossary)}`;
    body = body.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  if (filename === 'ai-prompt-fundamentals.md') {
    // 不修改固定上游原件；校订在正文原位置公开标明，避免冒充官方原文。
    const typo = '零样本提示(one-shot)';
    if (!body.includes(typo)) throw new Error('提示工程原件已变化，请重新核对校订位置');
    body = body.replace(typo, '零样本提示(zero-shot；原文误写为one-shot，此处由鲸翼校订)');
  }
  // 教材相对链接不取得个人笔记导航权；图片只保留文字说明，不触发网络请求。
  return { language: filename.endsWith('.cnxml') ? 'en' : 'zh-CN', body, view: learningReadingView(body) };
}

function openStax(book, revision, module, title) {
  const management = book === 'principles-of-management';
  return { title, publisher: 'OpenStax · Rice University', url: `https://github.com/openstax/osbooks-${book}-bundle/blob/${revision}/modules/${module}/index.cnxml`, revision, checkedAt: '2026-10-12', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: management ? '© OpenStax, Rice University. David S. Bright, Anastasia H. Cortes and contributing authors. Access for free at https://openstax.org/books/principles-management/pages/1-introduction' : '© OpenStax, Rice University. Steven A. Greenlaw, David Shapiro, Daniel MacDonald. Access for free at https://openstax.org/books/principles-economics-3e/pages/1-introduction', usage: '鲸翼中文翻译，非OpenStax官方译本，按CC BY 4.0提供。依据固定版本完整翻译，保留原件、章节、案例、图注、图像替代说明、表格、公式及练习；未包含图像文件。参考文献可集中列于文末，表述澄清在译注中标明。中文导读为鲸翼编写，历史案例和数据不作为当前新闻。' };
}
function microsoft(lesson, title) {
  return { title, publisher: 'Microsoft · Generative AI for Beginners', url: `https://github.com/microsoft/generative-ai-for-beginners/blob/${aiRevision}/translations/zh-CN/${lesson}/README.md`, revision: aiRevision, checkedAt: '2026-10-12', license: 'MIT', licenseUrl: `https://github.com/microsoft/generative-ai-for-beginners/blob/${aiRevision}/LICENSE`, attribution: 'Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License.', usage: `微软官方仓库中文课程完整Markdown正文，固定原件随包保留。${lesson === '04-prompt-engineering-fundamentals' ? '鲸翼仅将零样本的one-shot误写校订为zero-shot，正文原位置已标明；不是官方修订版。' : '正文未改写。'}代码仅供阅读不执行，图片以原文替代文本呈现，外链由用户主动打开。中文导读为鲸翼编写。` };
}

export const learningCards = [
  {
    id: 'management-planning', category: '管理', title: '计划为何重要：把目标变成行动',
    concept: '一个计划同时回答希望到达什么结果，以及准备怎样到达。只写目标没有行动，或只列动作没有目标，都难以检查。',
    example: '“完成接口交付”是目标；联调输入、执行人和验收记录说明行动路径。两者需要一起明确。',
    keywords: ['计划', '排期', '目标', '交付', '项目', '实施', '进度'],
    highlights: ['区分结果目标和行动安排。', '计划连接当前情况与期望结果。', '环境改变时重新检查计划的假设。'],
    sections: [{ title: '中文导读', paragraphs: ['这篇完整教材章节讨论计划的含义、组织为何需要计划，以及计划如何帮助形成方向、协调工作与检查结果。阅读时可以对照手头项目，分别找出目标描述、行动安排和仍未确认的假设。', '例如，不能仅凭“任务已分配”说明目标已有可行路径。需要核对任务之间的依赖、实际资源和接收方要检查的结果。以下为固定开放许可教材的完整中文译文，历史案例及练习完整保留，不用几段摘要代替正文。'] }],
    source: openStax('principles-of-management', managementRevision, 'm70704', 'Principles of Management · Is Planning Important'), article: learningArticle('management-planning.zh-CN.md'),
  },
  {
    id: 'management-communication', category: '管理', title: '沟通为什么会失真：从发送到反馈',
    concept: '说过不等于对方已理解。信息经过表达、传递与理解，反馈才能帮助发现双方实际含义的差异。',
    example: '会议结束后，请接收方说明将交付什么、依据什么资料和如何验收，比只问“都明白了吗”更容易发现遗漏。',
    keywords: ['沟通', '会议', '纪要', '协作', '负责人', '反馈', '团队', '交接'],
    highlights: ['区分发送者的意图与接收者的理解。', '关注表达、渠道与干扰造成的信息损失。', '通过具体反馈确认理解，而不是仅确认收到。'],
    sections: [{ title: '中文导读', paragraphs: ['本节从管理者日常的人际沟通出发，解释发送、编码、传递、解码和反馈的过程。它适合对照会议纪要、客户需求传递和跨岗位交接来阅读。重点不是背术语，而是识别信息在哪一步失真。', '你可以把最近一次返工拿来对照：原始要求是什么、经过谁的转述、接收者实际采取了什么动作、何时发现差异。以下是完整章节的中文译文，图注与替代说明也保留在正文中。'] }],
    source: openStax('principles-of-management', managementRevision, 'm70698', 'Principles of Management · The Process of Managerial Communication'), article: learningArticle('management-communication.zh-CN.md'),
  },
  {
    id: 'economics-scarcity', category: '经济', title: '资源有限，为什么分工与取舍很重要',
    concept: '经济学关注有限资源下的选择。专业分工能提高生产效率，但协作仍需要把不同环节连成可用结果。',
    example: 'ERP项目有研发、实施和测试分工；每个环节都做了事，并不自动意味着客户得到完整可用的交付。',
    keywords: ['资源', '分工', '团队', '产能', '生产', '需求', '协作', '经济'],
    highlights: ['稀缺不仅是金钱不足，也包括时间与能力约束。', '专业分工与协作共同影响最终产出。', '选择总要面对可用资源和实际用途。'],
    sections: [{ title: '中文导读', paragraphs: ['这篇入门章节从稀缺出发，讨论经济学研究什么、生产与分工有什么关系、为何需要理解经济学。它并不是具体的投资或采购建议，而是一种看待工作资源和社会分工的基础视角。', '在公司工作中，可以用它区分“需求很多”和“可投入资源有限”，也可以检查某项分工是否真正减少了重复工作。以下完整翻译教材正文、例子及提问；其中统计数字属于教材历史背景。'] }],
    source: openStax('principles-economics', economicsRevision, 'm63580', 'Principles of Economics 3e · What Is Economics, and Why Is It Important?'), article: learningArticle('economics-scarcity.zh-CN.md'),
  },
  {
    id: 'economics-budget', category: '经济', title: '机会成本：多做一件事，放弃了什么',
    concept: '机会成本是放弃的最佳可行选择。预算约束、边际比较和沉没成本，帮助你把下一步决定与已经发生的投入区分开。',
    example: '每周报表省下一小时，不等于立刻节省一小时现金支出；要看这段时间实际能够用于哪一项替代工作。',
    keywords: ['预算', '成本', '采购', '工时', '报表', '收益', '投入', '取舍'],
    highlights: ['比较最佳替代选择，而不是把所有可能收益相加。', '边际分析关注再多做一点的新增成本与收益。', '已无法收回的投入，不替你决定下一步是否值得。'],
    sections: [{ title: '中文导读', paragraphs: ['本节完整解释预算约束、机会成本、边际决策、效用递减和沉没成本，并提供图表说明、计算过程和生活案例。阅读时应注意“现金支出”“时间占用”和“放弃的其他选择”不是同一个口径。', '把它用于办公方案比较时，可以先列出继续人工处理、优化模板和采用工具三个真实候选，再比较接下来会发生的支出、复核和维护工作。正文中的消费案例用于解释概念，不应直接当作公司的财务规则。'] }],
    source: openStax('principles-economics', economicsRevision, 'm63594', 'Principles of Economics 3e · How Individuals Make Choices Based on Their Budget Constraint'), article: learningArticle('economics-budget.zh-CN.md'),
  },
  {
    id: 'ai-specific', category: 'AI 工具技巧', title: '提示工程基础：讲清任务、上下文与输出',
    concept: '从任务说明到示例和上下文，逐步理解怎样设计、检查并改进提示词，不把一次看似流畅的回答当作可靠结果。',
    example: '整理会议纪要时，说明采用哪些原文、要输出什么字段，以及负责人或日期未被提及时怎样标记。',
    keywords: ['提示词', 'AI', '会议', '纪要', '文档', '总结', '提取', '上下文'],
    highlights: ['理解提示工程和模型生成的基本关系。', '分别说明任务、上下文、示例和输出要求。', '通过实际结果检查提示，而不是只追求措辞复杂。'],
    sections: [{ title: '中文导读', paragraphs: ['以下是微软 Generative AI for Beginners 的中文提示工程基础完整课程，包含概念、提示类型、教学示例与练习；一处术语误写由鲸翼校订并在原位置标明。你可以直接在本地读完，不需要等待外站验证或先打开课程网站。', '课程中的代码、外部工具和模型名称保留来源版本的语境；阅读不会运行代码、创建账号或调用模型。处理企业资料时，正式输入仍应来自当前任务允许采用的资料。'] }],
    source: microsoft('04-prompt-engineering-fundamentals', 'Microsoft · 提示工程基础'), article: learningArticle('ai-prompt-fundamentals.md'),
  },
  {
    id: 'ai-example', category: 'AI 工具技巧', title: '进阶提示：样例、任务拆分与结果检查',
    concept: '学习用少量样例、任务拆分和不同提示策略说明判断尺度，理解这些方法的适用范围，而不是把技巧当作正确性保证。',
    example: '工单分类同时给明确归类、容易混淆和资料不足的样例；正式输出只采用正式工单，不搬用样例事实。',
    keywords: ['样例', '分类', '工单', '测试', '输出格式', '边界', '批量', '校验'],
    highlights: ['用样例展示要求与判断边界。', '复杂任务可以分解为可检查的步骤。', '策略有效与否，要回到实际输入与结果验证。'],
    sections: [{ title: '中文导读', paragraphs: ['以下是微软官方仓库的中文进阶提示完整课程，延续基础课，介绍不同提示策略、操作示例和练习。它适合已经使用AI处理文档、分类或提取任务，想进一步理解方法差异的读者。', '把课程方法带入工作时，保留真实输入与检查依据。如果同一个错误反复出现，先调整任务定义、样例或资料范围，再用原失败样本和正常样本共同检查。完整课程正文已经随插件保存，打开阅读不联网。'] }],
    source: microsoft('05-advanced-prompts', 'Microsoft · 进阶提示'), article: learningArticle('ai-advanced-prompts.md'),
  },
];

const categories = ['管理', '经济', 'AI 工具技巧'];
const contains = (value, keyword) => /^[a-z]+$/i.test(keyword) ? new RegExp(`(?:^|[^a-z])${keyword}(?:$|[^a-z])`, 'i').test(value) : value.includes(keyword);

/** 个人推荐只采样近期工作知识，不让系统规则、来源原件或归档成为用户兴趣。 */
export function selectLearningContext(records) {
  const candidates = records.flatMap(record => {
    if (!/^(?:10-收件箱|20-项目|30-领域|40-知识|70-作品)\//.test(record.path)) return [];
    let content = record.content, updated = '', status;
    try { const parsed = frontmatter(content); content = parsed.body; updated = parsed.data.updated; status = parsed.data.status; }
    catch (error) { if (error.code !== 'METADATA') throw error; }
    if (status === 'archived') return [];
    if (typeof updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(updated) || !Number.isFinite(Date.parse(updated)) || new Date(updated).toISOString().slice(0, 10) !== updated) updated = '';
    return [{ path: record.path, title: record.title, excerpt: content.slice(0, 1600), updated }];
  }).sort((a, b) => b.updated.localeCompare(a.updated) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { notes: candidates.slice(0, 100).map(({ updated: _updated, ...note }) => note), total: candidates.length };
}

/** 输入只来自本机知识入口；输出保留匹配出处，不把通用轮换称为个人推荐。 */
export function dailyLearning(now = Date.now(), context = { status: 'empty', notes: [], total: 0 }) {
  const date = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  const offset = Math.max(0, Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.UTC(2026, 9, 12)) / 86400000));
  const notes = context.status === 'ready' ? context.notes : [];
  const cards = categories.map(category => {
    const pool = learningCards.filter(card => card.category === category);
    const ranked = pool.map((card, order) => {
      const matches = notes.flatMap(note => {
        const terms = card.keywords.filter(keyword => contains(`${note.title}\n${note.excerpt}`, keyword));
        return terms.length ? [{ path: note.path, title: note.title, terms, score: terms.reduce((sum, term) => sum + (contains(note.title, term) ? 3 : 1), 0) }] : [];
      }).sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return { card, matches, score: matches.reduce((sum, note) => sum + note.score, 0), order: (order - offset % pool.length + pool.length) % pool.length };
    }).sort((a, b) => b.score - a.score || a.order - b.order);
    const { card, matches } = ranked[0];
    const { keywords: _keywords, ...readable } = card;
    const matchedNotes = matches.slice(0, 3).map(({ score: _score, ...note }) => note);
    // 只在有个人笔记命中时给出关联说明；通用推荐不加解释。
    const reason = matchedNotes.length ? `关联笔记《${matchedNotes[0].title}》` : '通用推荐';
    return structuredClone({ ...readable, review: offset >= pool.length, recommendation: { kind: matchedNotes.length ? 'knowledge' : 'general', reason, matchedNotes } });
  });
  return { date, context: { status: context.status, noteCount: notes.length, total: context.total, ...(context.issue ? { issue: context.issue } : {}) }, cards };
}
