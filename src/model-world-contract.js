import { worldEfforts } from './model-world-index.js';

export const worldLimits = Object.freeze({ plans: 400, efforts: 8, snapshotBytes: 8 * 1024 * 1024, responseBytes: 12 * 1024 * 1024, models: 10000, vendors: 500, operationMs: 60000, sources: 50, scores: 300, provenance: 100, modalities: 20, text: 500, id: 240, sourceId: 100, query: 160, link: 2000, sourceNote: 4000, error: 1000, page: 200, defaultPage: 100, compare: 4 });
export const worldCapabilityKeys = Object.freeze(['promptCaching', 'reasoning', 'structuredOutput', 'toolCall']);
export const worldPriceKeys = Object.freeze(['cachedInputPerMTok', 'inputPerMTok', 'outputPerMTok']);

/** 分项评分采用的第三方评测：按维度归组，只接纳第三方测得的分数，不采信厂商自报。 */
export const worldDimensions = Object.freeze({
  eci: { name: 'Epoch 综合指数', weight: 0.35 },
  reasoning: { name: '推理与知识', weight: 0.25 },
  coding: { name: '编程', weight: 0.25 },
  agent: { name: '智能体', weight: 0.15 },
});
export const worldBenchmarks = Object.freeze({
  eci: { name: 'Epoch 综合指数 (ECI)', dimension: 'eci' },
  gpqa_diamond: { name: 'GPQA Diamond', dimension: 'reasoning' },
  hle: { name: "Humanity's Last Exam", dimension: 'reasoning' },
  arc_agi_2: { name: 'ARC-AGI-2', dimension: 'reasoning' },
  frontiermath: { name: 'FrontierMath', dimension: 'reasoning' },
  aime: { name: 'AIME', dimension: 'reasoning' },
  simplebench: { name: 'SimpleBench', dimension: 'reasoning' },
  swe_bench_verified: { name: 'SWE-bench Verified', dimension: 'coding' },
  swe_bench_pro: { name: 'SWE-bench Pro', dimension: 'coding' },
  terminal_bench_2_0: { name: 'Terminal-Bench 2.0', dimension: 'coding' },
  livebench_coding: { name: 'LiveBench 编程', dimension: 'coding' },
  livebench_agentic_coding: { name: 'LiveBench 智能体编程', dimension: 'coding' },
  webdev_arena_elo: { name: 'WebDev Arena', dimension: 'coding' },
  metr_time_horizons: { name: 'METR 任务时长', dimension: 'agent' },
  gdpval: { name: 'GDPval', dimension: 'agent' },
  vending_bench_2: { name: 'Vending-Bench 2', dimension: 'agent' },
  apex_agents: { name: 'APEX-Agents', dimension: 'agent' },
  the_agent_company: { name: 'TheAgentCompany', dimension: 'agent' },
});
export const worldScoreSources = Object.freeze(['epoch.ai', 'livebench', 'models.dev']);
export const worldUnits = Object.freeze(['pct', 'index', 'elo', 'minutes', 'usd']);
export const worldTiers = Object.freeze(['T0', 'T1', 'T2', 'T3']);
/** 榜单：综合实力、三个分项与性价比。性价比按“模型 + 思考强度”方案比较，由独立的 value 操作返回。 */
export const worldBoards = Object.freeze({ overall: '综合实力', reasoning: '推理与知识', coding: '编程', agent: '智能体', value: '性价比' });
export const worldRankingBoards = Object.freeze(['overall', 'reasoning', 'coding', 'agent']);
export const worldEffortIds = Object.freeze(Object.keys(worldEfforts));

/** 传输只承载已准入快照；Host 投影与 Client 使用同一行定义，不允许泛 JSON 成功回执。 */
export function modelWorldContract(z) {
  const text = z.string().min(1).max(worldLimits.text), id = text.max(worldLimits.id);
  const time = z.string().datetime(), gitId = z.string().regex(/^[a-f0-9]{40}$/);
  const link = z.string().url().max(worldLimits.link).refine(value => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; });
  const numeric = z.number().finite().min(0).max(1e30).nullable();
  const source = z.strictObject({ fetchedAt: time.nullable(), note: z.string().max(worldLimits.sourceNote).nullable(), ok: z.boolean() });
  const sources = z.record(text.max(100), source).refine(value => Object.keys(value).length <= worldLimits.sources);
  const vendor = z.strictObject({ id, name: id, nameZh: id, homepage: link.nullable(), modelCount: z.number().int().min(0).max(worldLimits.models).optional(), top: z.strictObject({ id, name: id, overall: z.number().finite().min(0).max(100), tier: z.enum(worldTiers) }).nullable().optional() });
  const attribution = z.strictObject({ name: text, url: link, license: text, changes: text, licenseUrl: link.optional() });
  const benchmarkIds = Object.keys(worldBenchmarks), boardIds = Object.keys(worldBoards);
  const score = z.strictObject({ league: z.enum(benchmarkIds), score: z.number().finite().min(-1e30).max(1e30), source: z.enum(worldScoreSources), sourceUrl: link.nullable(), attribution: z.literal('third-party'), unit: z.enum(worldUnits) });
  const league = z.strictObject({ id: z.enum(boardIds), name: text });
  const percent = z.number().finite().min(0).max(100).nullable();
  const effortId = z.enum(worldEffortIds).nullable();
  const rating = z.strictObject({ overall: percent, tier: z.enum(worldTiers).nullable(), effort: effortId, composite: percent, ...Object.fromEntries(Object.keys(worldDimensions).map(key => [key, percent])), coverage: z.number().int().min(0).max(benchmarkIds.length) });
  const effort = z.strictObject({ effort: effortId, index: z.number().finite().min(0).max(100), cost: numeric });
  const plan = z.strictObject({ key: text, modelId: id, name: id, vendorId: id, effort: effortId, index: z.number().finite().min(0).max(100), cost: z.number().finite().min(0).max(1e9), frontier: z.boolean() });
  const band = z.strictObject({ id: text.max(40), name: text, best: plan.nullable(), alternatives: z.array(plan).max(3) });
  const model = z.strictObject({
    id, name: id, vendorId: id,
    releaseDate: z.string().regex(/^\d{4}(-\d{2})?(-\d{2})?$/).nullable(), releaseDatePrecision: z.enum(['year', 'month', 'day']).nullable(),
    contextWindow: numeric, maxOutput: numeric, knowledgeCutoff: z.string().max(10).nullable(), license: text.nullable(), openWeights: z.boolean().nullable(),
    capabilities: z.strictObject(Object.fromEntries(worldCapabilityKeys.map(key => [key, z.boolean().nullable()]))),
    pricing: z.strictObject({ ...Object.fromEntries(worldPriceKeys.map(key => [key, numeric])), unit: z.literal('USD / 1M tokens'), note: z.literal('上游目录价格，不代表员工转发站实际费用') }),
    modalities: z.strictObject({ input: z.array(text.max(80)).max(worldLimits.modalities), output: z.array(text.max(80)).max(worldLimits.modalities) }).nullable(),
    scores: z.array(score).max(benchmarkIds.length), efforts: z.array(effort).max(worldLimits.efforts), rating, provenance: z.record(text.max(100), z.enum(['models.dev', 'derived'])).refine(value => Object.keys(value).length <= worldLimits.provenance),
  }).refine(value => value.releaseDate === null ? value.releaseDatePrecision === null : value.releaseDate.length === ({ year: 4, month: 7, day: 10 })[value.releaseDatePrecision], '发布日期与精度不一致');
  const snapshot = z.strictObject({ generatedAt: time, sources, vendors: z.array(vendor).max(worldLimits.vendors), models: z.array(model).max(worldLimits.models), leagues: z.array(league).max(boardIds.length), attributions: z.array(attribution).min(5).max(5) });
  const refresh = z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('ok'), at: time }),
    ...['error', 'cancelled'].map(status => z.strictObject({ status: z.literal(status), code: z.union([text, z.number().int()]), message: z.string().max(worldLimits.error) })),
  ]).nullable();
  const status = {
    available: z.boolean(), refreshing: z.boolean(), commit: gitId.nullable(), acceptedAt: time.nullable(), generatedAt: time.nullable(), sources,
    modelCount: z.number().int().min(0).max(worldLimits.models), vendors: z.array(vendor).max(worldLimits.vendors), leagues: z.array(league).max(boardIds.length),
    lastRefresh: refresh, attributions: z.array(attribution).min(5).max(5),
  };
  const page = { models: z.array(model).max(worldLimits.page), total: z.number().int().min(0).max(worldLimits.models), offset: z.number().int().min(0).max(worldLimits.models), limit: z.number().int().min(1).max(worldLimits.page), unknownDates: z.number().int().min(0).max(worldLimits.models) };
  const filters = {
    query: z.string().max(worldLimits.query).optional(), vendorId: id.optional(),
    capability: z.enum(['reasoning', 'toolCall', 'structuredOutput', 'promptCaching']).optional(),
    offset: z.number().int().min(0).max(worldLimits.models).optional(), limit: z.number().int().min(1).max(worldLimits.page).optional(),
  };
  const input = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('status') }),
    z.strictObject({ action: z.literal('refresh') }),
    z.strictObject({ action: z.literal('list'), ...filters }),
    z.strictObject({ action: z.literal('timeline'), ...filters }),
    z.strictObject({ action: z.literal('ranking'), league: z.enum(worldRankingBoards), direction: z.enum(['asc', 'desc']).optional(), ...filters }),
    z.strictObject({ action: z.literal('value'), query: filters.query, vendorId: filters.vendorId }),
    z.strictObject({ action: z.literal('detail'), id }),
    z.strictObject({ action: z.literal('compare'), ids: z.array(id).min(2).max(worldLimits.compare) }),
  ]);
  const result = z.discriminatedUnion('action', [
    ...['status', 'refresh'].map(action => z.strictObject({ action: z.literal(action), ...status })),
    ...['list', 'timeline', 'ranking'].map(action => z.strictObject({ action: z.literal(action), ...status, ...page })),
    z.strictObject({ action: z.literal('value'), ...status, bands: z.array(band).max(10), plans: z.array(plan).max(worldLimits.plans) }),
    z.strictObject({ action: z.literal('detail'), ...status, model: model.nullable(), vendor: vendor.nullable() }),
    z.strictObject({ action: z.literal('compare'), ...status, models: z.array(model).max(worldLimits.compare) }),
  ]).refine(value => value.available ? value.commit !== null && value.generatedAt !== null && value.acceptedAt !== null : value.commit === null && value.generatedAt === null && value.acceptedAt === null && value.modelCount === 0, '快照可用状态与元数据不一致')
    .refine(value => value.action !== 'detail' || (value.available ? value.model !== null && value.vendor !== null && value.model.vendorId === value.vendor.id : value.model === null && value.vendor === null), '详情结果与快照不一致')
    .refine(value => value.action !== 'compare' || (value.available ? value.models.length >= 2 : value.models.length === 0), '比较结果缺少模型')
    .refine(value => !['list', 'timeline', 'ranking'].includes(value.action) || (value.models.length <= value.limit && value.models.length <= value.total && (value.available || value.total === 0)), '模型分页结果不一致');
  const packageName = 'dsh-whalewing/model-world';
  const descriptor = {
    id: `${packageName}#whalewingKnowledge/manageModelWorld`, service: 'whalewing', namespace: 'whalewingKnowledge', method: 'manageModelWorld', invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#ModelWorldInput`, create: () => input } }],
    cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ModelWorldResult`, create: () => result },
  };
  return { input, result, snapshot, model, host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor] } };
}
