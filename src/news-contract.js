import { knowledgeContract } from './knowledge-contract.js';

// 旧版允许删除系统领域后保留20个自定义领域；恢复内置AI须保留这些合法配置。
export const newsFieldLimit = 21;
/** 每期条目上限（旧日报最多 15 条，只读兼容）、每期新提交上限、每个领域的来源上限。 */
export const newsItemLimit = 15, newsSubmitLimit = 8, newsSourceLimit = 16;
/** 条目分类，顺序即日报排序：模型大事在前，其次智能体与产品、开源、多模态，最后研究与其他。 */
export const newsCategories = Object.freeze({ model: '大模型', agent: '智能体与产品', opensource: '开源与工具', media: '图像·视频·语音', research: '研究与其他' });
/** 消息性质：官方发布、媒体报道、内测或传闻。 */
export const newsLabels = Object.freeze({ official: '官方', media: '媒体', leak: '内测 / 传闻' });

/** 资讯配置和模型提交共用唯一边界；模型无配置写权。 */
export function newsContract(z) {
  const text = z.string(), id = text.regex(/^[a-zA-Z0-9_-]{1,100}$/);
  const source = z.strictObject({ name: text.trim().min(1).max(100), url: text.max(2048), kind: z.enum(['primary', 'media']), region: z.enum(['domestic', 'overseas']) });
  const field = z.strictObject({ name: text.trim().min(1).max(80), focus: text.trim().min(1).max(2000), enabled: z.boolean(), sources: z.array(source).min(1).max(newsSourceLimit) });
  const storedField = field.extend({ id, revision: z.number().int().nonnegative(), deleted: z.boolean() });
  const manage = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('list') }),
    z.strictObject({ action: z.literal('home') }),
    z.strictObject({ action: z.literal('save'), id, expectedRevision: z.number().int().nonnegative(), field, confirmCancel: z.boolean().optional() }),
    z.strictObject({ action: z.literal('remove'), id, expectedRevision: z.number().int().nonnegative(), confirmCancel: z.boolean().optional() }),
    z.strictObject({ action: z.literal('reports'), fieldId: id, before: text.max(30).optional() }),
    z.strictObject({ action: z.literal('report'), fieldId: id, cutoff: text.max(30) }),
  ]);
  // 一行标题 + 一条一手链接；brief 是展开后的一句话说明，relevance 只在和员工工作有关时填写。
  const item = z.strictObject({ sourceIds: z.array(text.max(64)).min(1).max(10), category: z.enum(Object.keys(newsCategories)), label: z.enum(Object.keys(newsLabels)), title: text.trim().min(4).max(120), link: text.max(2048), brief: text.trim().min(1).max(240), relevance: text.trim().max(240), eventKey: text.trim().min(1).max(240) });
  // 2026-10-14 之前的日报条目格式，只读保留。
  const legacyItem = z.strictObject({ sourceIds: z.array(text.max(64)).min(1).max(10), title: text.trim().min(1).max(240), summary: text.trim().min(1).max(1200), importance: text.trim().min(1).max(600), relevance: text.trim().min(1).max(600), workImpact: text.trim().min(1).max(600), eventKey: text.trim().min(1).max(240) });
  const execute = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('fields') }),
    z.strictObject({ action: z.literal('candidates'), fieldId: id }),
    z.strictObject({ action: z.literal('submit'), receipt: text.max(100), items: z.array(item).max(newsItemLimit) }),
  ]);
  const timestamp = text.datetime(), window = { start: timestamp, cutoff: timestamp };
  // links 是条目正文里指向其他网站的链接，供挑选一手来源；旧日报的来源没有这一项。
  const candidate = z.strictObject({ id: text.regex(/^[a-f0-9]{64}$/), title: text.min(1).max(240), url: text.max(2048), publishedAt: timestamp, eventTime: timestamp.nullable(), collectedAt: timestamp, excerpt: text.max(500), links: z.array(text.max(2048)).max(6).optional(), source });
  const sourceStatus = z.union([source.extend({ status: z.literal('ok'), candidates: z.number().int().min(0).max(100) }), source.extend({ status: z.literal('failed'), message: text.max(400) })]);
  const reportItem = z.union([item.omit({ sourceIds: true }).extend({ sources: z.array(candidate).min(1).max(10) }), legacyItem.omit({ sourceIds: true }).extend({ sources: z.array(candidate).min(1).max(10) })]);
  const report = z.strictObject({ fieldId: id, fieldName: text.min(1).max(80), fieldRevision: z.number().int().positive(), ...window, sessionId: id, completedAt: timestamp, items: z.array(reportItem).max(newsItemLimit), sourceStatus: z.array(sourceStatus).min(1).max(newsSourceLimit), status: z.enum(['complete', 'partial', 'empty']), coverage: text.min(1).max(1000) });
  // 计划事实仅保留本页直接消费字段，编辑和历史仍回原生自动任务入口。
  const schedule = z.strictObject({ id, sessionId: id, title: text.max(120), status: z.enum(['active', 'paused', 'inactive']), kind: text.max(30), scheduledAt: timestamp });
  const issue = z.strictObject({ sessionId: id, message: text.max(400) });
  const historyField = z.strictObject({ id, name: text.min(1).max(80), deleted: z.boolean() });
  const limits = z.strictObject({ maxFields: z.number().int().min(1).max(100), maxResponseBytes: z.number().int().min(1).max(10485760), maxBodyChars: z.number().int().min(1).max(10485760), maxCandidates: z.number().int().min(1).max(1000), deadlineMs: z.number().int().min(1).max(300000), receiptMs: z.number().int().min(1).max(3600000) });
  const count = z.number().int().nonnegative();
  const learningCard = z.strictObject({
    id, category: z.enum(['管理', '经济', 'AI 工具技巧']), title: text.min(1).max(160), concept: text.min(1).max(1000), example: text.min(1).max(1000),
    highlights: z.array(text.min(1).max(300)).min(1).max(6),
    sections: z.array(z.strictObject({ title: text.min(1).max(100), paragraphs: z.array(text.min(1).max(4000)).min(1).max(12) })).min(1).max(12),
    article: z.strictObject({ language: z.enum(['en', 'zh-CN']), body: text.min(1000).max(200000), view: knowledgeContract(z).view }),
    source: z.strictObject({ title: text.min(1).max(240), url: text.url().max(2048), publisher: text.min(1).max(160), revision: text.regex(/^[a-f0-9]{40}$/), checkedAt: text.regex(/^\d{4}-\d{2}-\d{2}$/), license: z.enum(['CC BY 4.0', 'MIT']), licenseUrl: text.url(), attribution: text.min(1).max(2000), usage: text.min(1).max(1000) }),
    review: z.boolean(), recommendation: z.strictObject({ kind: z.enum(['knowledge', 'general']), reason: text.min(1).max(1000), matchedNotes: z.array(z.strictObject({ path: text.min(1).max(240), title: text.min(1).max(240), terms: z.array(text.min(1).max(40)).min(1).max(16) })).max(3) }),
  }).refine(card => card.recommendation.kind === 'knowledge' ? card.recommendation.matchedNotes.length > 0 : card.recommendation.matchedNotes.length === 0);
  const learningContext = z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('ready'), noteCount: count.min(1).max(100), total: count.min(1) }),
    z.strictObject({ status: z.literal('empty'), noteCount: z.literal(0), total: z.literal(0) }),
    z.strictObject({ status: z.literal('unavailable'), noteCount: z.literal(0), total: z.literal(0), issue: text.min(1).max(400) }),
  ]);
  const result = z.union([
    z.strictObject({ reports: z.array(report).max(newsFieldLimit), learning: z.strictObject({ date: text.regex(/^\d{4}-\d{2}-\d{2}$/), context: learningContext, cards: z.array(learningCard).length(3) }) }),
    z.strictObject({ fields: z.array(storedField).max(newsFieldLimit), historyFields: z.array(historyField), defaults: storedField, window: z.strictObject(window), errors: z.record(id, z.strictObject({ code: text.max(100), message: text.max(400) })).refine(value => Object.keys(value).length <= newsFieldLimit), limits, schedules: z.array(schedule).max(500), dependencies: z.strictObject({ scheduleAvailable: z.boolean(), issues: z.array(issue).max(500), collection: z.literal('rss'), model: text.max(500) }) }),
    z.strictObject({ field: storedField }),
    z.strictObject({ report: report.nullable() }),
    z.strictObject({ reports: z.array(report).max(30), nextBefore: timestamp.nullable() }),
  ]);
  const executionResult = z.union([
    z.strictObject({ fields: z.array(z.strictObject({ id, name: text.min(1).max(80), focus: text.min(1).max(2000) })).max(newsFieldLimit), window: z.strictObject(window) }),
    z.strictObject({ receipt: text.uuid(), field: storedField, ...window, candidates: z.array(candidate).max(200), sources: z.array(sourceStatus).min(1).max(newsSourceLimit), coverage: text.min(1).max(1000) }),
    z.strictObject({ completed: z.literal(true), recovered: z.boolean().optional(), report }),
  ]);
  const packageName = 'dsh-whalewing/news';
  const descriptor = { id: `${packageName}#whalewingKnowledge/manageNews`, service: 'whalewing', namespace: 'whalewingKnowledge', method: 'manageNews', invocation: { kind: 'direct' }, parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#NewsInput`, create: () => manage } }], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#NewsResult`, create: () => result } };
  return { manage, execute, result, executionResult, field: storedField, report, host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor] } };
}
