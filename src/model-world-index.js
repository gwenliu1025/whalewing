import { worldIndexAsOf, worldIndexVersion, worldIndexRows } from './model-world-index-data.js';

/**
 * Artificial Analysis 智能指数：各模型分思考强度的成绩与单次任务成本，数据由 scripts/update-model-index.mjs 从 AA 免费接口生成。
 * 综合实力榜取每个模型最强档的成绩；性价比榜比较每一档的“能力 × 相对消耗”。
 * 成本为跑一次评测任务的美元花费，按 GPT-5.6 Luna 轻度（约 $0.01）= 1 折算成相对消耗。
 */
export { worldIndexAsOf };
export const worldIndexSource = Object.freeze({ name: `Artificial Analysis Intelligence Index v${worldIndexVersion}`, url: 'https://artificialanalysis.ai/leaderboards/models' });
/** 相对消耗的基准：GPT-5.6 Luna 轻度一次任务约 $0.01。 */
export const worldCostBase = 0.01;

/** 思考强度：顺序即从强到弱；`null` 表示该模型只有一档（或只标“推理”）。 */
export const worldEfforts = Object.freeze({ max: '最高', xhigh: '极高', high: '高', medium: '中', low: '轻度', minimal: '最低', none: '不思考' });

const relative = cost => cost === null ? null : Math.round(cost / worldCostBase * 100) / 100;
/** 名称归一：小写，点、空格、括号、下划线都换成短横线，用于和模型目录的 id 对上（“GPT-6.1 Sol” ↔ “gpt-6.1-sol”）。 */
export const worldNameKey = value => value.toLowerCase().replace(/^[^/]*\//, '').replace(/[\s._()'/]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
/** 名称归一后仍对不上的个别型号。 */
const aliases = Object.freeze({ 'deepseek|deepseek-v4-flash-vision': 'deepseek-v4-flash-vision-exp', 'mistral|mistral-large-4-preview': 'mistral-large-4' });

/** 每个模型的各档成绩，按思考强度从高到低排列。 */
export const worldIndex = Object.freeze(worldIndexRows.map(([vendorId, name, released, levels]) => Object.freeze({
  vendorId, name, released, key: worldNameKey(name),
  efforts: Object.freeze(levels.map(([effort, index, cost]) => Object.freeze({ effort, index, cost: relative(cost) }))),
})));

/**
 * 把 AA 的模型对到模型目录：同厂商、名称归一后相同即为同一模型。
 * 返回目录模型 id → 指数条目，以及目录里没有、但一年内发布的模型（由调用方补一条基础记录，id 为“厂商/归一名称”）。
 */
export function matchWorldIndex(models, entries = worldIndex) {
  const byKey = new Map();
  for (const model of models) { const key = `${model.vendorId}|${worldNameKey(model.id)}`; if (!byKey.has(key)) byKey.set(key, model.id); }
  const matched = new Map(), missing = [];
  const cutoff = new Date(Date.parse(`${worldIndexAsOf}T00:00:00Z`) - 365 * 864e5).toISOString().slice(0, 10);
  for (const entry of entries) {
    const key = `${entry.vendorId}|${entry.key}`;
    const id = byKey.get(key) ?? byKey.get(`${entry.vendorId}|${aliases[key]}`);
    if (id) { if (!matched.has(id)) matched.set(id, entry); }
    else if (entry.released && entry.released >= cutoff) missing.push({ ...entry, id: `${entry.vendorId}/${entry.key}` });
  }
  for (const entry of missing) matched.set(entry.id, entry);
  return { matched, missing };
}

/** 最强档：指数最高者；同分取思考强度更高的一档（列表按强度从高到低排列）。 */
export function strongestEffort(efforts) {
  return efforts.reduce((best, item) => !best || item.index > best.index ? item : best, null);
}

/** 梯队按 AA 指数划分（按 AA 榜单显示的整数）：T0 ≥ 52，T1 ≥ 44，T2 ≥ 34，其余 T3。 */
export const worldTierFloors = Object.freeze([['T0', 51.5], ['T1', 43.5], ['T2', 33.5]]);
export const worldTierFor = index => index === null ? null : worldTierFloors.find(([, floor]) => index >= floor)?.[0] ?? 'T3';

/** 性价比按相对消耗分档；每档推荐能力最强的“模型 + 思考强度”，同分取更省者。 */
export const worldCostBands = Object.freeze([
  { id: 'c5', max: 5, name: '极省（≤ 5）' }, { id: 'c20', max: 20, name: '省（≤ 20）' }, { id: 'c50', max: 50, name: '经济（≤ 50）' },
  { id: 'c100', max: 100, name: '均衡（≤ 100）' }, { id: 'c200', max: 200, name: '偏贵（≤ 200）' }, { id: 'c400', max: 400, name: '贵（≤ 400）' }, { id: 'c-max', max: null, name: '不计成本（> 400）' },
]);

/**
 * 性价比榜：每一档“模型 + 思考强度”都是一个方案。
 * 先看消耗：按相对消耗落入档位，档内选能力最强者；`frontier` 标记没有任何方案比它更省且不弱的“同价最强”方案。
 */
export function worldValuePlans(entries) {
  const plans = entries.flatMap(entry => entry.efforts.filter(item => item.cost !== null).map(item => ({ key: `${entry.id}#${item.effort ?? 'default'}`, modelId: entry.id, name: entry.name, vendorId: entry.vendorId, effort: item.effort, index: item.index, cost: item.cost })));
  for (const plan of plans) plan.frontier = !plans.some(other => other !== plan && other.cost <= plan.cost && other.index >= plan.index && (other.cost < plan.cost || other.index > plan.index));
  plans.sort((a, b) => b.index - a.index || a.cost - b.cost || a.key.localeCompare(b.key));
  let floor = 0;
  const bands = worldCostBands.map(band => {
    const inside = plans.filter(plan => plan.cost > floor && (band.max === null || plan.cost <= band.max) || floor === 0 && plan.cost === 0);
    floor = band.max ?? Infinity;
    return { id: band.id, name: band.name, best: inside[0] ?? null, alternatives: inside.slice(1, 4) };
  });
  return { bands, plans };
}
