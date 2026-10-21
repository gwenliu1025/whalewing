import { worldBenchmarks, worldBoards, worldDimensions } from '../features/model-world/contract.js';
import { portraitIdFor } from './model-world-roster.js';
import { worldEfforts, worldIndexAsOf } from './model-world-index.js';
import { isDomesticVendor, worldCnyPriceAsOf, worldPriceText } from './model-world-cny-prices.js';

/** 角色只表达厂商身份；评测、日期与价格始终消费模型数据服务的已接纳事实。 */
export const worldViewCopy = Object.freeze({
  title: '模型世界', gallery: '角色图鉴', timeline: '发布时间线', ranking: '实力榜',
  refresh: '更新数据', refreshOk: '模型数据已更新', refreshFail: '更新未完成', search: '搜索模型或厂商', searchGo: '查找', all: '全部厂商', capability: '全部能力',
  reasoning: '推理', toolCall: '工具调用', structuredOutput: '结构化输出', promptCaching: '提示词缓存', back: '返回角色图鉴', empty: '没有符合条件的模型',
  noSnapshot: '还没有模型数据，点击“更新数据”获取', retry: '重试', retryRefresh: '重试更新', readback: '重新读取', refreshReadback: '数据已更新，列表读取失败', storageUnknown: '本地数据写入结果未确认，请重启 DSH 后重新读取', stopped: '已停止等待，更新可能已完成，可重新读取核对', cancel: '取消', close: '关闭', detail: '详情', duel: '对决',
  pick: '加入对决', picked: '已选', selectTwo: '两位模型已就位', clear: '清空', start: '开始对决', replay: '再来一次', cancelBattle: '停止', cancelled: '已停止',
  battling: '交锋中', tie: '平局', unknown: '—', noScore: '—', round: '回合', damage: '伤害', hp: '体力', ko: '倒下',
  incomparable: '双方缺少可比的评测成绩，无法判定胜负', reduced: '已按系统设置减少动画', missingStat: '缺少成绩，未能出手',
  about: '数据来源与算法', method: `综合实力：Artificial Analysis 智能指数（${worldIndexAsOf} 更新），取每个模型最强思考档的成绩。T0 ≥ 52，T1 ≥ 44，T2 ≥ 34。推理与知识、编程、智能体三个分项按第三方评测在全部模型中的百分位计算（0–100）。`,
  valueMethod: '性价比：每个“模型 + 思考强度”算一个方案。先看消耗：相对消耗是跑一次评测任务的花费，以 GPT-5.6 Luna 轻度 = 1；同一消耗档位里推荐能力分最高的方案。“同价最强”表示没有其他方案比它更省又不比它弱。',
  artCredit: '立绘 © 鲸翼 WhaleWing，依 CC BY-NC-SA 4.0 授权，商用需先取得作者授权；身上的模型标识归各厂商所有，角色为非官方拟人形象，与厂商无关。', overall: '综合实力', tier: '梯队', benchmarks: '评测成绩',
  effort: '思考强度', efforts: '各档成绩', index: '能力分', cost: '相对消耗', band: '消耗档位', recommend: '推荐方案', alternatives: '同档其他选择', frontier: '同价最强', plans: '方案', showAll: '显示全部方案', showFrontier: '只看同价最强', strongestTier: '最强档', noCost: '未公布',
  dealt: '造成', duelRule: '对决只看综合实力：双方互相出手，分高的一方每回合都打得更重，最后把对方击倒；分差越大，胜方剩余体力越多。下方的推理、编程、智能体来自另一组第三方评测，个别单项由低分方领先属于正常。', duelBasis: '综合实力', duelFallback: '双方缺少综合实力分，按分项百分位判定',
  release: '发布日期', context: '上下文', output: '最大输出', cutoff: '知识截止', weights: '开放权重', license: '许可证', input: '输入模态', outputModal: '输出模态',
  priceInput: '输入价格', priceCached: '缓存输入价格', priceOutput: '输出价格', priceUnit: '海外模型价格：美元 / 百万 tokens，取自公开目录', priceUnitCny: `国产模型价格：人民币 / 百万 tokens，按厂商官网标价（${worldCnyPriceAsOf} 核对），官网未单列或尚未核对的不显示`, yes: '是', no: '否',
  generated: '数据生成于', accepted: '本机更新于', previous: '上一页', next: '下一页', descending: '从高到低', ascending: '从低到高', sortToggle: '切换排序方向', unrated: '评测不足',
  ...Object.fromEntries(Object.entries(worldEfforts).map(([key, value]) => [`effort_${key}`, value])),
  modalFailed: '窗口打开失败，请重试', loadFailed: '读取失败，请重试', updating: '正在更新数据', missingDates: '个模型缺少发布日期', rank: '排名', model: '模型', left: '左方', right: '右方', wins: '获胜', remove: '移出对决', browse: '浏览', family: '的模型', models: '个模型', strongest: '最强', sort: '排序', actions: '操作', board: '榜单',
});

const scale = (value, unit, binary) => value % unit === 0 ? value / unit : value % binary === 0 ? value / binary : value / unit;
/** 上下文等 token 数按常见写法缩写（128K、1M），不改变原值的数量级。 */
export function worldTokens(value) {
  if (typeof value !== 'number') return null;
  if (value >= 1e6) return `${Number(scale(value, 1e6, 1048576).toFixed(1))}M`;
  if (value >= 1000) return `${Math.round(scale(value, 1000, 1024))}K`;
  return String(value);
}
/** 相对消耗：10 以上取整，以下保留一位小数。 */
export const worldCostText = value => typeof value !== 'number' ? null : value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
export const worldPrice = value => typeof value === 'number' ? `$${value}` : null;
/** 价格说明按币种给出：国产模型人民币官网价，海外模型美元目录价。 */
export const worldPriceNotes = (models, c = worldViewCopy) => [...new Set(models.map(model => isDomesticVendor(model.vendorId) ? c.priceUnitCny : c.priceUnit))];
export const worldTime = value => { const time = value ? new Date(value) : null; return time && Number.isFinite(time.getTime()) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(time) : null; };
/** 评测成绩按单位显示：百分比、Elo、分钟、美元或指数。 */
export function worldScoreText(score) {
  const value = Number(score.score.toFixed(score.unit === 'elo' || score.unit === 'usd' ? 0 : 1));
  return score.unit === 'pct' ? `${value}%` : score.unit === 'minutes' ? `${value} 分钟` : score.unit === 'usd' ? `$${value.toLocaleString('en-US')}` : String(value);
}

/** 对决回合：四个回合逐步加重，最后一回合决出胜负。 */
export const worldDuelRounds = Object.freeze([
  { id: 'probe', name: '试探' }, { id: 'clash', name: '交锋' }, { id: 'assault', name: '强攻' }, { id: 'finale', name: '决胜' },
]);
// 每回合占全场伤害的比例，越往后打得越重。
const duelWeights = [0.2, 0.22, 0.24, 0.34];

/** 思考强度的中文名；只有一档的模型不显示。 */
export const worldEffortText = (effort, c = worldViewCopy) => effort ? c[`effort_${effort}`] ?? effort : '';

/**
 * 确定性的对决剧本：胜负和每一击的轻重都只看综合实力（双方都缺时按分项加权百分位）。
 * 双方每回合各出手一次，先后手轮换；高分方每回合都比低分方打得重，最后一回合补上终结一击。
 * 胜方剩余体力 = 12 + 综合分差 × 6（上限 70），即低分方全场合计造成 100 − 剩余体力的伤害。综合实力相同则平局，双方各剩 35。
 */
export function worldDuelScript(models) {
  if (models.length !== 2 || models[0].id === models[1].id) return { kind: 'invalid', events: [] };
  let basis = 'overall', totals = models.map(model => model.rating?.overall ?? null);
  if (totals.includes(null)) { basis = 'composite'; totals = models.map(model => model.rating?.composite ?? null); }
  if (totals.includes(null)) return { kind: 'unknown', events: [] };
  const winner = totals[0] === totals[1] ? null : totals[0] > totals[1] ? 0 : 1;
  const keep = winner === null ? 35 : Math.min(70, Math.round(12 + Math.abs(totals[0] - totals[1]) * (basis === 'overall' ? 6 : 1.5)));
  const split = total => { const parts = duelWeights.map(weight => Math.round(total * weight)); parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0); return parts; };
  // dealt[i] = 第 i 方每回合造成的伤害。
  const dealt = winner === null ? [split(65), split(65)] : [0, 1].map(index => split(index === winner ? 100 : 100 - keep));
  const strong = winner ?? 0, weak = 1 - strong;
  const hp = [100, 100], events = [];
  worldDuelRounds.forEach((round, index) => {
    // 先后手轮换；最后一回合由低分方先出手，高分方终结。
    const order = index % 2 === 0 && index !== worldDuelRounds.length - 1 ? [strong, weak] : [weak, strong];
    for (const attacker of order) {
      hp[1 - attacker] = Math.max(0, hp[1 - attacker] - dealt[attacker][index]);
      events.push({ round: round.id, name: round.name, attacker, damage: dealt[attacker][index], hp: [...hp] });
    }
  });
  return winner === null ? { kind: 'tie', basis, totals, events, hp: [...hp] } : { kind: 'winner', winner, basis, totals, events, hp: [...hp] };
}

/** 对决记录按回合合并：每行列出双方各自造成的伤害和回合结束时的体力。 */
export function worldDuelLog(events) {
  const rows = [];
  for (const event of events) {
    if (rows.at(-1)?.round !== event.round) rows.push({ round: event.round, name: event.name, damage: [null, null], hp: event.hp });
    rows.at(-1).damage[event.attacker] = event.damage; rows.at(-1).hp = event.hp;
  }
  return rows;
}

export function worldTimelineGroups(models) {
  const groups = [];
  for (const model of models) {
    if (!model.releaseDate) continue;
    const year = model.releaseDate.slice(0, 4);
    if (groups.at(-1)?.year !== year) groups.push({ year, models: [] });
    groups.at(-1).models.push(model);
  }
  return groups;
}

/** 详情只列已知字段；对决两侧需逐行对齐，未知值保留为占位。 */
export function worldMetricRows(model, c = worldViewCopy, { known = false } = {}) {
  const value = input => input === null || input === undefined || input === '' ? null : typeof input === 'boolean' ? c[input ? 'yes' : 'no'] : String(input);
  const rows = [
    [c.release, model.releaseDate],
    [c.context, worldTokens(model.contextWindow)], [c.output, worldTokens(model.maxOutput)], [c.cutoff, model.knowledgeCutoff],
    [c.weights, model.openWeights], [c.license, model.license],
    [c.input, model.modalities?.input.join('、')], [c.outputModal, model.modalities?.output.join('、')],
    ...['reasoning', 'toolCall', 'structuredOutput', 'promptCaching'].map(key => [c[key], model.capabilities[key]]),
    [c.priceInput, worldPriceText(model, 'inputPerMTok')], [c.priceCached, worldPriceText(model, 'cachedInputPerMTok')], [c.priceOutput, worldPriceText(model, 'outputPerMTok')],
  ].map(([label, input]) => [label, value(input)]);
  return known ? rows.filter(([, input]) => input !== null) : rows.map(([label, input]) => [label, input ?? c.unknown]);
}

export const worldViewCss = `
.yj-mw-header-actions{display:flex;align-items:center;gap:10px}.yj-mw-status{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}.yj-mw-status-late{animation:yj-mw-late .2s ease-out .8s both}@keyframes yj-mw-late{from{opacity:0;visibility:hidden}to{opacity:1;visibility:visible}}@media(prefers-reduced-motion:reduce){.yj-mw-status-late{animation-duration:.01s}}.yj-mw-status-warn{color:#b45309}
.yj-mw-boards .yj-mw-sort{margin-left:auto;border-radius:8px!important}
.yj-page .yj-mw-toolbar{flex-wrap:nowrap}.yj-page .yj-mw-toolbar input{flex:1 1 auto;width:auto;min-width:160px}.yj-page .yj-mw-toolbar select{flex:0 0 auto;width:auto;min-width:140px;max-width:220px}.yj-page .yj-mw-toolbar button{flex:none}
@media(max-width:720px){.yj-page .yj-mw-toolbar{flex-wrap:wrap}}
.yj-mw{color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:18px;min-width:0;font-size:13px}.yj-mw h2,.yj-mw h3,.yj-mw-dialog h2,.yj-mw-dialog h3{font-weight:500;margin:0}.yj-mw p,.yj-mw-dialog p{margin:0}.yj-mw small,.yj-mw-dialog small{color:var(--dsw-alias-label-secondary);font-size:12px}
.yj-mw-header,.yj-mw-toolbar,.yj-mw-tabs,.yj-mw-page,.yj-mw-selected,.yj-mw-actions,.yj-mw-boards{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.yj-mw-header{justify-content:space-between}.yj-mw-header h2{font-size:24px}.yj-mw-toolbar input{flex:1;min-width:160px}.yj-mw-toolbar select{max-width:200px}.yj-mw button,.yj-mw-dialog button,.yj-mw input,.yj-mw select{font:inherit}
.yj-mw-tabs{border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:10px}.yj-mw-tabs button[aria-pressed=true],.yj-mw-boards button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-brand-primary)}.yj-mw-boards{gap:6px}.yj-mw-boards button{border-radius:999px;padding:5px 14px}
.yj-mw-deck{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:14px}.yj-mw .yj-mw-role{padding:0!important;display:flex;flex-direction:column;overflow:hidden;min-height:276px;border-radius:16px;text-align:left;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);transition:transform .18s,border-color .18s,box-shadow .18s}.yj-mw .yj-mw-role:hover{transform:translateY(-3px);border-color:var(--dsw-alias-brand-primary);box-shadow:var(--dsw-elevation-prominent)}
.yj-mw-role-art{width:100%;height:212px;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse 80% 45% at 50% 100%,color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent),transparent 75%),linear-gradient(180deg,var(--dsw-alias-bg-layer-2),var(--dsw-alias-bg-layer-3));position:relative;overflow:hidden}.yj-mw-monogram{display:flex!important;align-items:center;justify-content:center;font-size:52px;font-weight:500;color:var(--dsw-alias-label-secondary)}.yj-mw-persona{width:104px;height:140px;object-fit:contain;display:block;position:relative;z-index:1}.yj-mw-role-art img.yj-mw-persona{width:100%;height:100%;object-fit:cover;object-position:50% 10%}
.yj-mw-role-text{padding:10px 14px 12px;width:100%;box-sizing:border-box;display:grid;gap:3px;background:var(--dsw-alias-bg-layer-1)}.yj-mw-role-text strong{font-size:15px;font-weight:500}.yj-mw-role-top{display:flex;gap:6px;align-items:center;min-width:0}.yj-mw-role-top span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary)}
.yj-mw-tier{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:20px;padding:0 6px;border-radius:6px;font-size:11px;font-weight:500;letter-spacing:.3px;color:#fff;background:#8a8f98;flex:none}.yj-mw-tier[data-tier=T0]{background:linear-gradient(135deg,#f59e0b,#ef4444)}.yj-mw-tier[data-tier=T1]{background:linear-gradient(135deg,#8b5cf6,#6366f1)}.yj-mw-tier[data-tier=T2]{background:linear-gradient(135deg,#0ea5e9,#14b8a6)}
.yj-mw-row-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden}.yj-mw-model-row{display:flex;align-items:center;gap:14px;padding:10px 16px;background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l1)}.yj-mw-model-row:last-child{border-bottom:0}.yj-mw-model-name{flex:1;min-width:0;display:grid;gap:4px;overflow-wrap:anywhere}.yj-mw-model-name strong{font-weight:500;font-size:14px}
.yj-mw-mini{width:44px;height:56px;flex:none;border-radius:10px;overflow:hidden;background:radial-gradient(ellipse 80% 45% at 50% 100%,color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent),transparent 75%),linear-gradient(180deg,var(--dsw-alias-bg-layer-2),var(--dsw-alias-bg-layer-3));display:flex;justify-content:center}.yj-mw-mini .yj-mw-persona{width:44px;height:78px;object-fit:cover;object-position:50% 0}
.yj-mw-page{justify-content:flex-end}.yj-mw-page span{margin-right:auto;color:var(--dsw-alias-label-secondary)}.yj-mw-timeline{padding-left:18px;border-left:2px solid var(--dsw-alias-border-l2);display:grid;gap:18px;margin-left:10px}.yj-mw-year{display:flex;gap:10px;align-items:center;position:relative;font-size:20px}.yj-mw-year:before{content:'';width:10px;height:10px;border-radius:50%;border:2px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);position:absolute;left:-26px}.yj-mw-timeline .yj-mw-row-list{margin-top:12px}
.yj-mw-table-wrap{overflow-x:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:14px}.yj-mw-table{width:100%;border-collapse:collapse;text-align:left}.yj-mw-table th{font-weight:500;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}.yj-mw-table th,.yj-mw-table td{padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}.yj-mw-table td.yj-mw-cell-model{white-space:normal;min-width:220px}.yj-mw-table tr:last-child td{border-bottom:0}.yj-mw-table tbody tr:hover{background:var(--dsw-alias-bg-layer-2)}.yj-mw-cell-model>div{display:flex;gap:12px;align-items:center}
.yj-mw-effort{display:block;font-size:11px!important;font-weight:400;color:var(--dsw-alias-label-secondary)}.yj-mw-alt{white-space:normal!important;min-width:220px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}.yj-mw-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;color:var(--dsw-alias-brand-primary);border:1px solid var(--dsw-alias-brand-primary)}.yj-mw-efforts{display:grid;gap:8px}.yj-mw-efforts h3,.yj-mw .yj-mw-actions h3{font-size:14px}
.yj-mw-table td .yj-mw-actions{flex-wrap:nowrap}.yj-mw-rank{font-variant-numeric:tabular-nums;font-size:16px;font-weight:500;color:var(--dsw-alias-label-secondary);text-align:center}.yj-mw-rank[data-top=true]{color:var(--dsw-alias-brand-primary)}.yj-mw-score{font-variant-numeric:tabular-nums;font-size:16px;font-weight:500}
.yj-mw-bar{display:grid;grid-template-columns:42px 72px;gap:8px;align-items:center;font-variant-numeric:tabular-nums}.yj-mw-bar i{display:block;height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}.yj-mw-bar i b{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#6366f1,#22d3ee)}
.yj-mw-selected{position:sticky;bottom:0;z-index:2;padding:12px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent)}.yj-mw-selected>span{flex:1}.yj-mw-chip{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.yj-mw-empty{padding:44px 20px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:16px;color:var(--dsw-alias-label-secondary)}.yj-mw-notice{padding:10px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px}.yj-mw-skeleton{height:240px;border-radius:14px;background:var(--dsw-alias-bg-layer-2)}.yj-mw-about{color:var(--dsw-alias-label-secondary);font-size:12px}.yj-mw-about summary{cursor:pointer}.yj-mw-about p{margin-top:10px;line-height:1.7}
.yj-mw-dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(1240px,calc(100vw - 40px));height:fit-content;max-height:calc(100dvh - 48px);padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:20px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent);overflow:auto;font:inherit}.yj-mw-dialog:not([open]){display:none}.yj-mw-dialog::backdrop{background:color-mix(in srgb,var(--dsw-alias-label-primary) 28%,transparent);backdrop-filter:blur(4px)}.yj-mw-dialog>header{display:flex;gap:16px;align-items:center;padding:16px 22px;border-bottom:1px solid var(--dsw-alias-border-l2);position:sticky;top:0;background:var(--dsw-alias-bg-layer-1);z-index:5}.yj-mw-dialog>header h2{flex:1;font-size:18px}.yj-mw-dialog-body{padding:22px}
.yj-mw-dialog button{padding:8px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer}.yj-mw-dialog button:disabled{opacity:.5;cursor:default}.yj-mw-dialog button:focus-visible,.yj-mw button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}.yj-mw-dialog a,.yj-mw-about a{color:var(--dsw-alias-brand-primary)}
.yj-mw-detail{display:grid;grid-template-columns:220px 1fr;gap:26px}.yj-mw-detail-art{display:grid;justify-items:center;align-content:start;gap:10px;padding:14px;background:radial-gradient(ellipse 80% 45% at 50% 100%,color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent),transparent 75%),linear-gradient(180deg,var(--dsw-alias-bg-layer-2),var(--dsw-alias-bg-layer-3));border-radius:16px;border:1px solid var(--dsw-alias-border-l1)}.yj-mw-detail-art .yj-mw-persona{width:180px;height:320px}.yj-mw-detail-main{display:grid;gap:22px;align-content:start}
.yj-mw-rating{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center;padding:16px 18px;border-radius:14px;background:var(--dsw-alias-bg-layer-2)}.yj-mw-rating-score{display:grid;justify-items:center;gap:6px}.yj-mw-rating-score strong{font-size:40px;line-height:1;font-weight:500;font-variant-numeric:tabular-nums}.yj-mw-dims{display:grid;gap:8px}.yj-mw-dim{display:grid;grid-template-columns:96px 1fr 44px;gap:10px;align-items:center;font-size:12px}.yj-mw-dim i{display:block;height:8px;border-radius:4px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}.yj-mw-dim i b{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#6366f1,#22d3ee)}.yj-mw-dim span:last-child{text-align:right;font-variant-numeric:tabular-nums}
.yj-mw-benches{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}.yj-mw-bench{display:flex;justify-content:space-between;gap:10px;padding:8px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);font-size:12px}.yj-mw-bench b{font-weight:500;font-variant-numeric:tabular-nums}
.yj-mw-metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px 16px;font-size:13px;margin:0}.yj-mw-metrics>div{display:grid;gap:2px}.yj-mw-metrics dt{color:var(--dsw-alias-label-secondary);font-size:12px}.yj-mw-metrics dd{margin:0;overflow-wrap:anywhere}.yj-mw-duel-help{color:var(--dsw-alias-label-secondary);font-size:12px}
.yj-mw-stage{position:relative;height:460px;overflow:hidden;border-radius:18px;background:radial-gradient(ellipse 70% 40% at 50% 92%,rgba(99,102,241,.35),transparent 70%),linear-gradient(180deg,#0f172a 0%,#1e1b4b 55%,#312e81 100%);color:#fff;isolation:isolate}.yj-mw-stage:before{content:'';position:absolute;left:6%;right:6%;bottom:34px;height:70px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(255,255,255,.18),transparent 70%)}.yj-mw-stage:after{content:'';position:absolute;inset:0;background-image:radial-gradient(1px 1px at 20% 30%,#fff8,transparent),radial-gradient(1px 1px at 70% 20%,#fff6,transparent),radial-gradient(1.5px 1.5px at 40% 12%,#fff7,transparent),radial-gradient(1px 1px at 85% 45%,#fff5,transparent);z-index:-1}
.yj-mw-hud{position:absolute;top:16px;left:18px;right:18px;display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:start;z-index:4}.yj-mw-hud-side{display:grid;gap:6px;min-width:0}.yj-mw-hud-side.right{text-align:right}.yj-mw-hud-name{font-size:15px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-mw-hud-name small{color:#c7d2fe!important;font-weight:400;margin:0 6px}.yj-mw-hp{height:12px;border-radius:6px;background:rgba(255,255,255,.15);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}.yj-mw-hp b{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#a3e635);transition:width .5s cubic-bezier(.2,.8,.2,1) .6s}.yj-mw-hp[data-low=true] b{background:linear-gradient(90deg,#ef4444,#f97316)}.yj-mw-hud-side.right .yj-mw-hp{transform:scaleX(-1)}.yj-mw-hp-num{font-size:12px;color:#c7d2fe;font-variant-numeric:tabular-nums}
.yj-mw-vs{font-size:30px;font-weight:500;letter-spacing:2px;background:linear-gradient(180deg,#fde68a,#f59e0b);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 24px rgba(245,158,11,.4)}
.yj-mw-banner{position:absolute;top:84px;left:50%;transform:translateX(-50%);padding:6px 18px;border-radius:999px;background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.2);font-size:13px;white-space:nowrap;z-index:4;animation:yj-mw-banner .5s ease-out}
.yj-mw-fighter{position:absolute;bottom:30px;width:210px;height:374px;z-index:2;transition:transform .3s,filter .3s,opacity .5s}.yj-mw-fighter.left{left:10%}.yj-mw-fighter.right{right:10%}.yj-mw-fighter .yj-mw-body{width:100%;height:100%;display:flex;align-items:flex-end;justify-content:center}.yj-mw-fighter.right .yj-mw-body{transform:scaleX(-1)}.yj-mw-fighter .yj-mw-persona{width:210px;height:374px;object-fit:contain;filter:drop-shadow(0 10px 18px rgba(0,0,0,.45))}.yj-mw-fighter .yj-mw-monogram{background:rgba(255,255,255,.1);border-radius:20px;color:#fff;font-size:72px}
.yj-mw-fighter[data-act=attack].left{animation:yj-mw-lunge-left 1.1s cubic-bezier(.3,.7,.3,1)}.yj-mw-fighter[data-act=attack].right{animation:yj-mw-lunge-right 1.1s cubic-bezier(.3,.7,.3,1)}.yj-mw-fighter[data-act=hit]{animation:yj-mw-hit 1.1s ease-out}.yj-mw-fighter[data-act=idle]{animation:yj-mw-idle 2.4s ease-in-out infinite}
.yj-mw-fighter[data-result=lost]{transform:translateY(40px) rotate(var(--fall,-12deg));filter:grayscale(.8) brightness(.6);opacity:.75}.yj-mw-fighter.right[data-result=lost]{--fall:12deg}.yj-mw-fighter[data-result=won]{filter:drop-shadow(0 0 22px rgba(250,204,21,.7))}
.yj-mw-slash{position:absolute;bottom:150px;width:240px;height:240px;z-index:3;pointer-events:none;opacity:0;animation:yj-mw-slash 1.1s ease-out}.yj-mw-slash.on-left{left:calc(10% - 10px)}.yj-mw-slash.on-right{right:calc(10% - 10px);transform:scaleX(-1)}
.yj-mw-dmg{position:absolute;bottom:330px;font-size:34px;font-weight:500;color:#fca5a5;text-shadow:0 2px 0 #7f1d1d,0 0 16px rgba(239,68,68,.6);z-index:4;animation:yj-mw-dmg 1.1s ease-out forwards}.yj-mw-dmg.on-left{left:calc(10% + 70px)}.yj-mw-dmg.on-right{right:calc(10% + 70px)}
.yj-mw-final{position:absolute;inset:auto 0 18px;text-align:center;z-index:4;font-size:22px;font-weight:500;text-shadow:0 2px 10px rgba(0,0,0,.6);animation:yj-mw-banner .6s ease-out}
.yj-mw-duel-bar{display:flex;gap:10px;justify-content:center;align-items:center;margin:14px 0}.yj-mw-duel-log{display:grid;gap:6px;margin:0 0 18px;padding:0;list-style:none}.yj-mw-duel-log li{display:grid;grid-template-columns:150px 1fr 140px 1fr;gap:12px;align-items:center;padding:8px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);font-size:12px;font-variant-numeric:tabular-nums}.yj-mw-duel-log li>span:nth-child(2){text-align:right}.yj-mw-duel-log li>span:nth-child(3){text-align:center;color:var(--dsw-alias-label-secondary)}.yj-mw-duel-log li[data-win=left]>span:nth-child(2),.yj-mw-duel-log li[data-win=right]>span:nth-child(4){color:var(--dsw-alias-brand-primary);font-weight:500}.yj-mw-duel-log em{font-style:normal;color:var(--dsw-alias-label-secondary)}
.yj-mw-compare{display:grid;grid-template-columns:1fr 1fr;gap:18px}.yj-mw-compare section{padding:14px 16px;border-radius:14px;background:var(--dsw-alias-bg-layer-2);display:grid;gap:12px;min-width:0}.yj-mw-compare h3{font-size:15px;overflow-wrap:anywhere}
@keyframes yj-mw-idle{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}@keyframes yj-mw-lunge-left{0%{transform:translateX(0)}30%{transform:translateX(-18px) rotate(-3deg)}55%{transform:translateX(min(26vw,300px)) rotate(4deg)}70%{transform:translateX(min(24vw,280px))}100%{transform:translateX(0)}}@keyframes yj-mw-lunge-right{0%{transform:translateX(0)}30%{transform:translateX(18px) rotate(3deg)}55%{transform:translateX(max(-26vw,-300px)) rotate(-4deg)}70%{transform:translateX(max(-24vw,-280px))}100%{transform:translateX(0)}}
@keyframes yj-mw-hit{0%,45%{transform:translateX(0);filter:none}52%{transform:translateX(10px);filter:brightness(2) saturate(.2)}60%{transform:translateX(-10px);filter:brightness(1.4) hue-rotate(-30deg)}70%{transform:translateX(6px)}80%,100%{transform:translateX(0);filter:none}}
@keyframes yj-mw-slash{0%,40%{opacity:0;transform:scale(.6) rotate(-30deg)}52%{opacity:1;transform:scale(1.05) rotate(0)}75%{opacity:.8}100%{opacity:0;transform:scale(1.2) rotate(18deg)}}.yj-mw-slash.on-right{animation-name:yj-mw-slash-r}@keyframes yj-mw-slash-r{0%,40%{opacity:0;transform:scaleX(-1) scale(.6) rotate(-30deg)}52%{opacity:1;transform:scaleX(-1) scale(1.05)}75%{opacity:.8}100%{opacity:0;transform:scaleX(-1) scale(1.2) rotate(18deg)}}
@keyframes yj-mw-dmg{0%,45%{opacity:0;transform:translateY(10px) scale(.6)}55%{opacity:1;transform:translateY(0) scale(1.25)}100%{opacity:0;transform:translateY(-50px) scale(1)}}@keyframes yj-mw-banner{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1}}.yj-mw-final{animation-name:yj-mw-final}@keyframes yj-mw-final{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}
@media(max-width:950px){.yj-mw-stage{height:400px}.yj-mw-fighter{width:160px;height:285px}.yj-mw-fighter .yj-mw-persona{width:160px;height:285px}.yj-mw-fighter.left{left:4%}.yj-mw-fighter.right{right:4%}.yj-mw-dmg{bottom:250px}.yj-mw-slash{bottom:110px;width:180px;height:180px}}
@media(max-width:550px){.yj-mw-detail,.yj-mw-compare{grid-template-columns:1fr}.yj-mw-detail-art{display:none}.yj-mw-dialog{width:calc(100vw - 20px)}.yj-mw-dialog-body{padding:14px}.yj-mw-model-row{flex-wrap:wrap}.yj-mw-role-art{height:160px}.yj-mw-role{min-height:220px!important}.yj-mw-toolbar select{max-width:100%}.yj-mw-stage{height:330px}.yj-mw-fighter{width:120px;height:214px}.yj-mw-fighter .yj-mw-persona{width:120px;height:214px}.yj-mw-duel-log li{grid-template-columns:70px 1fr auto 1fr}}
html[data-platform=darwin] .yj-mw-dialog{max-height:calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px)}@media(prefers-reduced-motion:reduce){.yj-mw-stage *,.yj-mw-role{animation:none!important;transition:none!important}}`;

// 刀光：一道带渐变的弧线，配合攻击时机出现在受击方身前。
const slashSvg = h => h('svg', { viewBox: '0 0 200 200', width: '100%', height: '100%' },
  h('defs', null, h('linearGradient', { id: 'yj-mw-slash-g', x1: '0', y1: '0', x2: '1', y2: '1' }, h('stop', { offset: '0', stopColor: '#fff', stopOpacity: 0 }), h('stop', { offset: '.5', stopColor: '#fde68a' }), h('stop', { offset: '1', stopColor: '#f97316', stopOpacity: 0 }))),
  h('path', { d: 'M20 170 Q 90 20 185 30', stroke: 'url(#yj-mw-slash-g)', strokeWidth: 14, fill: 'none', strokeLinecap: 'round' }),
  h('path', { d: 'M40 180 Q 110 60 190 60', stroke: '#fff', strokeOpacity: .6, strokeWidth: 3, fill: 'none', strokeLinecap: 'round' }));

export function createModelWorldView(React, approvedPortraits = {}) {
  const { createElement: h, useState, useRef, useEffect } = React;
  const link = (url, label) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label);
  const button = (label, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, label);
  // 厂商身份可与原型属性同名；三个消费者只接纳显式批准的自有映射。
  const own = id => Object.hasOwn(approvedPortraits, id) ? approvedPortraits[id] : undefined;
  const portraitSource = (vendorId, modelId) => own(portraitIdFor(vendorId, modelId)) ?? own(vendorId);
  function Portrait({ vendorId, modelId }) {
    const source = portraitSource(vendorId, modelId);
    return source ? h('img', { className: 'yj-mw-persona', src: source, alt: '', 'aria-hidden': true, draggable: false }) : h('span', { className: 'yj-mw-persona yj-mw-monogram', 'aria-hidden': true }, vendorId.slice(0, 1).toUpperCase());
  }
  const tierBadge = tier => tier && h('span', { className: 'yj-mw-tier', 'data-tier': tier }, tier);
  const bar = value => h('span', { className: 'yj-mw-bar' }, h('span', null, value ?? '—'), h('i', null, h('b', { style: { width: `${value ?? 0}%` } })));
  function Metrics({ model, copy, known = false }) {
    return h('dl', { className: 'yj-mw-metrics' }, ...worldMetricRows(model, copy, { known }).map(([label, value]) => h('div', { key: label }, h('dt', null, label), h('dd', null, value))));
  }
  function Rating({ model, copy: c }) {
    const rating = model.rating;
    return h('div', { className: 'yj-mw-rating' },
      h('div', { className: 'yj-mw-rating-score' }, h('small', null, c.overall), h('strong', null, rating.overall ?? '—'), rating.tier ? tierBadge(rating.tier) : h('small', null, c.unrated), rating.effort && h('small', null, `${c.strongestTier} · ${worldEffortText(rating.effort, c)}`)),
      h('div', { className: 'yj-mw-dims' }, ...Object.entries(worldDimensions).filter(([key]) => key !== 'eci').map(([key, dimension]) => h('div', { key, className: 'yj-mw-dim' }, h('span', null, dimension.name), h('i', null, h('b', { style: { width: `${rating[key] ?? 0}%` } })), h('span', null, rating[key] ?? '—')))));
  }
  function Efforts({ model, copy: c }) {
    return model.efforts?.length > 1 && h('div', { className: 'yj-mw-efforts' }, h('h3', null, c.efforts), h('div', { className: 'yj-mw-benches' }, ...model.efforts.map(item => h('div', { key: item.effort ?? 'default', className: 'yj-mw-bench' }, h('span', null, worldEffortText(item.effort, c) || c.overall), h('b', null, `${item.index} · ${c.cost} ${worldCostText(item.cost) ?? c.noCost}`)))));
  }
  function Benchmarks({ model }) {
    return model.scores.length > 0 && h('div', { className: 'yj-mw-benches' }, ...model.scores.map(score => h('div', { key: score.league, className: 'yj-mw-bench' }, score.sourceUrl ? link(score.sourceUrl, worldBenchmarks[score.league].name) : h('span', null, worldBenchmarks[score.league].name), h('b', null, worldScoreText(score)))));
  }

  function ModelWindow({ state, onClose, retry, returnFocus, fallbackFocus, copy: c = worldViewCopy }) {
    const dialog = useRef(null), title = useRef(null), timer = useRef(null);
    const [phase, setPhase] = useState('ready'), [step, setStep] = useState(-1), [reduced, setReduced] = useState(false), [openError, setOpenError] = useState(false);
    const models = state.data?.models || [], script = worldDuelScript(models);
    const playable = ['winner', 'tie'].includes(script.kind);
    const vendorName = model => { const vendor = state.data?.vendors.find(v => v.id === model.vendorId); return vendor?.nameZh || vendor?.name || model.vendorId; };
    const stop = () => { clearTimeout(timer.current); timer.current = null; };
    useEffect(() => {
      const element = dialog.current;
      try { if (element && !element.open) { element.showModal(); title.current?.focus(); } } catch { setOpenError(true); }
      return () => { stop(); if (element?.open) element.close(); const target = returnFocus?.isConnected ? returnFocus : fallbackFocus.current; target?.focus?.(); };
    }, []);
    useEffect(() => {
      const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
      const update = () => { setReduced(!!media?.matches); if (media?.matches && timer.current !== null) { stop(); setStep(script.events.length - 1); setPhase('done'); } };
      update(); media?.addEventListener('change', update);
      return () => media?.removeEventListener('change', update);
    }, []);
    const close = () => { stop(); onClose(); };
    // 每次出手 1.1 秒：出手、刀光、受击与掉血同步；最后一击后进入结算。
    const advance = index => {
      if (index >= script.events.length) { timer.current = null; setPhase('done'); return; }
      setStep(index); timer.current = setTimeout(() => advance(index + 1), 1100);
    };
    const fight = () => {
      if (!playable || timer.current !== null) return;
      if (reduced) { setStep(script.events.length - 1); setPhase('done'); return; }
      setPhase('fighting'); advance(0);
    };
    const event = phase === 'fighting' && step >= 0 ? script.events[step] : null;
    const shownHp = phase === 'ready' || phase === 'cancelled' || step < 0 ? [100, 100] : script.events[step]?.hp ?? [100, 100];
    const act = index => phase === 'done' || !event || event.attacker === null ? 'idle' : event.attacker === index ? 'attack' : 'hit';
    const result = index => phase === 'done' && script.kind === 'winner' ? script.winner === index ? 'won' : 'lost' : '';
    const side = index => ['left', 'right'][index];
    // 舞台只在对决窗口、且两位模型都已读取时构建。
    const stage = () => h('div', { className: 'yj-mw-stage', 'aria-hidden': true },
      h('div', { className: 'yj-mw-hud' },
        ...[0, 1].flatMap(index => [
          index === 1 && h('span', { key: 'vs', className: 'yj-mw-vs' }, 'VS'),
          h('div', { key: `hud-${index}`, className: `yj-mw-hud-side ${side(index)}` },
            h('div', { className: 'yj-mw-hud-name' }, models[index].name, h('small', null, vendorName(models[index]))),
            h('div', { className: 'yj-mw-hp', 'data-low': shownHp[index] <= 30 }, h('b', { style: { width: `${shownHp[index]}%` } })),
            h('span', { className: 'yj-mw-hp-num' }, `${c.hp} ${shownHp[index]} / 100`)),
        ]).filter(Boolean)),
      event && h('div', { key: `banner-${event.round}`, className: 'yj-mw-banner' }, `${c.round} ${worldDuelRounds.findIndex(round => round.id === event.round) + 1} · ${event.name}`),
      ...models.map((model, index) => h('div', { key: `fighter-${model.id}-${step}`, className: `yj-mw-fighter ${side(index)}`, 'data-act': act(index), 'data-result': result(index) }, h('div', { className: 'yj-mw-body' }, h(Portrait, { vendorId: model.vendorId, modelId: model.id })))),
      event && event.attacker !== null && h('div', { key: `slash-${step}`, className: `yj-mw-slash on-${side(1 - event.attacker)}` }, slashSvg(h)),
      event && event.attacker !== null && h('div', { key: `dmg-${step}`, className: `yj-mw-dmg on-${side(1 - event.attacker)}` }, `-${event.damage}`),
      phase === 'done' && h('div', { className: 'yj-mw-final' }, script.kind === 'winner' ? `${models[script.winner].name} ${c.wins}` : c.tie));
    const shown = phase === 'done' ? script.events : phase === 'fighting' ? script.events.slice(0, step + 1) : [];
    const log = shown.length > 0 && h('ol', { className: 'yj-mw-duel-log' }, ...worldDuelLog(shown).map((item, index) => h('li', { key: item.round, 'data-win': item.damage[0] === item.damage[1] || item.damage.includes(null) ? '' : item.damage[0] > item.damage[1] ? 'left' : 'right' },
      h('em', null, `${c.round} ${index + 1} · ${item.name}`), h('span', null, item.damage[0] === null ? '…' : `${c.dealt} ${item.damage[0]}`),
      h('span', null, `${c.hp} ${item.hp[0]} : ${item.hp[1]}`), h('span', null, item.damage[1] === null ? '…' : `${c.dealt} ${item.damage[1]}`))));
    const verdict = script.kind === 'winner' ? `${models[script.winner].name} ${c.wins} · ${script.basis === 'overall' ? c.duelBasis : c.duelFallback} ${script.totals[0]} : ${script.totals[1]}` : `${c.tie} · ${c.duelBasis} ${script.totals?.[0]} : ${script.totals?.[1]}`;
    const duel = h(React.Fragment, null,
      models.length === 2 && stage(),
      h('div', { className: 'yj-mw-duel-bar', role: 'status', 'aria-live': 'polite' },
        h('span', null, phase === 'done' ? verdict : phase === 'fighting' ? c.battling : phase === 'cancelled' ? c.cancelled : playable ? c.selectTwo : c.incomparable),
        phase === 'fighting' ? button(c.cancelBattle, () => { stop(); setStep(-1); setPhase('cancelled'); }) : button(phase === 'done' ? c.replay : c.start, fight, { disabled: !playable }), reduced && h('small', null, c.reduced)),
      log, h('p', { className: 'yj-mw-duel-help' }, c.duelRule),
      h('div', { className: 'yj-mw-compare' }, ...models.map((model, index) => h('section', { key: model.id, 'aria-label': `${index === 0 ? c.left : c.right} ${model.name}` }, h('h3', null, model.name), h('small', null, vendorName(model)), h(Rating, { model, copy: c }), h(Metrics, { model, copy: c })))),
      ...worldPriceNotes(models, c).map(note => h('p', { key: note, className: 'yj-mw-duel-help' }, note)));
    const detail = state.data?.model && h('div', { className: 'yj-mw-detail' },
      h('aside', { className: 'yj-mw-detail-art' }, h(Portrait, { vendorId: state.data.model.vendorId, modelId: state.data.model.id }), h('h3', null, vendorName(state.data.model))),
      h('div', { className: 'yj-mw-detail-main' }, h(Rating, { model: state.data.model, copy: c }), h(Efforts, { model: state.data.model, copy: c }), h(Benchmarks, { model: state.data.model }), h(Metrics, { model: state.data.model, copy: c, known: true }),
        h('p', { className: 'yj-mw-duel-help' }, worldPriceNotes([state.data.model], c)[0])));
    return h(React.Fragment, null, openError && h('p', { role: 'alert' }, c.modalFailed, button(c.close, close)),
      h('dialog', { ref: dialog, className: 'yj-mw-dialog', 'aria-label': state.kind === 'compare' ? c.duel : c.detail, onCancel: event => { event.preventDefault(); close(); }, onClick: event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } } },
        h('header', null, h('h2', { ref: title, tabIndex: -1 }, state.kind === 'compare' ? c.duel : state.data?.model?.name || c.detail), button(c.close, close)),
        h('div', { className: 'yj-mw-dialog-body', 'aria-busy': state.busy }, state.busy ? h('div', { className: 'yj-mw-skeleton', role: 'progressbar', 'aria-label': c.detail }) : state.error ? h('p', { role: 'alert' }, state.error, ' ', button(c.retry, retry)) : state.data?.available ? state.kind === 'compare' ? duel : detail : h('p', null, c.noSnapshot))));
  }

  return function ModelWorldView({ api, t, notify = () => {} }) {
    const c = t ? Object.fromEntries(Object.keys(worldViewCopy).map(key => [key, t(`modelWorld_${key}`)])) : worldViewCopy;
    const lastRequest = useRef({ input: { action: 'list', offset: 0, limit: 12 }, refresh: false });
    const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setErrorValue] = useState(null);
    // 失败只在右上角提示，并带上“重试 / 重新读取”；不在页面里插入整块报错把内容往下挤。
    const setError = value => {
      setErrorValue(value);
      if (!value) return;
      const text = [value.summary, value.message, value.unknown && c.storageUnknown].filter(Boolean).join(' · ');
      const label = value.recovery === 'readback' ? c.readback : lastRequest.current.refresh ? c.retryRefresh : c.retry;
      notify(text, { kind: 'error', action: { label, run: () => load(lastRequest.current.input, value.recovery === 'readback' ? false : lastRequest.current.refresh) } });
    };
    const [mode, setMode] = useState('gallery'), [filters, setFilters] = useState({ query: '', vendorId: '', capability: '' }), [applied, setApplied] = useState({ action: 'list', offset: 0, limit: 12 });
    const [selected, setSelected] = useState([]), [window, setWindow] = useState(null), [allPlans, setAllPlans] = useState(false);
    const pageRequest = useRef(null), modalRequest = useRef(null), mounted = useRef(true), trigger = useRef(null), fallback = useRef(null), windowInput = useRef(null);
    const load = async (input, refresh = false) => {
      lastRequest.current = { input, refresh };
      pageRequest.current?.abort(); const controller = new AbortController(); pageRequest.current = controller; setBusy(true); setError(null);
      let refreshed = false;
      try {
        if (refresh) {
          await api.worldRequest({ action: 'refresh' }, controller.signal);
          if (!mounted.current || pageRequest.current !== controller || controller.signal.aborted) return;
          refreshed = true;
          // 更新已经接受，后续失败只重试本地读取，不再重复外网更新。
          lastRequest.current = { input, refresh: false };
        }
        let request = input, value = await api.worldRequest(request, controller.signal);
        if (!mounted.current || pageRequest.current !== controller || controller.signal.aborted) return;
        // 其他更新可能使当前页越界；最多一次本地纠正读取，不触发网络刷新。
        if (value.total === 0 && value.offset !== 0 || value.total > 0 && value.offset >= value.total) {
          request = { ...request, offset: value.total ? Math.floor((value.total - 1) / value.limit) * value.limit : 0 };
          lastRequest.current = { input: request, refresh: false };
          value = await api.worldRequest(request, controller.signal);
          if (!mounted.current || pageRequest.current !== controller || controller.signal.aborted) return;
        }
        setData(value); setApplied(request); setMode(request.action === 'list' ? 'gallery' : request.action === 'value' ? 'ranking' : request.action);
        if (refreshed) { setSelected([]); notify(c.refreshOk); }
      } catch (failure) {
        if (mounted.current && pageRequest.current === controller && !controller.signal.aborted) {
          const code = failure.code === undefined ? '' : String(failure.code);
          const message = failure.message || c.loadFailed;
          const unknown = code === 'WORLD_STORAGE_UNKNOWN';
          if (unknown) lastRequest.current = { input, refresh: false };
          setError({ message, code, summary: refreshed ? c.refreshReadback : refresh ? c.refreshFail : '', unknown, recovery: unknown ? 'readback' : 'retry' });
        }
      } finally { if (mounted.current && pageRequest.current === controller) { pageRequest.current = null; setBusy(false); } }
    };
    useEffect(() => { mounted.current = true; load({ action: 'list', offset: 0, limit: 12 }); return () => { mounted.current = false; pageRequest.current?.abort(); modalRequest.current?.abort(); }; }, []);
    const valueInput = (nextFilters = filters) => ({ action: 'value', ...(nextFilters.query ? { query: nextFilters.query } : {}), ...(nextFilters.vendorId ? { vendorId: nextFilters.vendorId } : {}) });
    const inputFor = (nextMode, nextFilters = filters, board = 'overall') => nextMode === 'ranking' && board === 'value' ? valueInput(nextFilters) : ({ action: nextMode === 'gallery' ? 'list' : nextMode, ...Object.fromEntries(Object.entries(nextFilters).filter(([, value]) => value)), ...(nextMode === 'ranking' ? { league: board, direction: 'desc' } : {}), offset: 0, limit: nextMode === 'ranking' ? 20 : 12 });
    const navigate = (nextMode, nextFilters = filters) => { setFilters(nextFilters); load(inputFor(nextMode, nextFilters, applied.action === 'value' ? 'value' : applied.league)); };
    const selectBoard = id => load(id === 'value' ? valueInput() : { ...(applied.action === 'ranking' ? applied : inputFor('ranking')), league: id, offset: 0 });
    const stopPage = () => { pageRequest.current?.abort(); pageRequest.current = null; lastRequest.current = { ...lastRequest.current, refresh: false }; setBusy(false); setError({ message: c.stopped, code: '', recovery: 'readback' }); };
    const openWindow = async (input, element) => {
      modalRequest.current?.abort(); const controller = new AbortController(); modalRequest.current = controller;
      if (element) trigger.current = element;
      windowInput.current = input; setWindow({ kind: input.action, busy: true, error: '', data: null });
      try { const value = await api.worldRequest(input, controller.signal); if (mounted.current && modalRequest.current === controller && !controller.signal.aborted) setWindow({ kind: input.action, busy: false, error: '', data: value }); }
      catch (failure) { if (mounted.current && modalRequest.current === controller && !controller.signal.aborted) setWindow({ kind: input.action, busy: false, error: failure.message || c.loadFailed, data: null }); }
      finally { if (modalRequest.current === controller) modalRequest.current = null; }
    };
    const closeWindow = () => { modalRequest.current?.abort(); modalRequest.current = null; setWindow(null); };
    const toggle = model => setSelected(previous => previous.some(item => item.id === model.id) ? previous.filter(item => item.id !== model.id) : previous.length < 2 ? [...previous, model] : previous);
    const vendorName = model => { const vendor = data?.vendors.find(v => v.id === model.vendorId); return vendor?.nameZh || vendor?.name || model.vendorId; };
    const pick = model => { const chosen = selected.some(item => item.id === model.id); return button(chosen ? c.picked : c.pick, () => toggle(model), { 'aria-pressed': chosen, 'aria-label': `${chosen ? c.remove : c.pick} ${model.name}`, disabled: !chosen && selected.length >= 2 }); };
    const modelActions = model => h('div', { className: 'yj-mw-actions' }, button(c.detail, event => openWindow({ action: 'detail', id: model.id }, event.currentTarget), { 'aria-label': `${c.detail} ${model.name}` }), pick(model));
    const mini = model => h('div', { className: 'yj-mw-mini' }, h(Portrait, { vendorId: model.vendorId, modelId: model.id }));
    const modelRow = model => h('article', { key: model.id, className: 'yj-mw-model-row' }, mini(model), h('div', { className: 'yj-mw-model-name' }, h('strong', null, model.name), h('small', null, [vendorName(model), model.releaseDate, model.contextWindow !== null && `${worldTokens(model.contextWindow)} ${c.context}`, model.rating?.overall != null && `${c.overall} ${model.rating.overall}`].filter(Boolean).join(' · '))), tierBadge(model.rating?.tier), modelActions(model));
    const gallery = data?.action === 'list' && !applied.query && !applied.vendorId && !applied.capability;
    const vendorItems = data ? [...data.vendors].sort((a, b) => Number(!!portraitSource(b.id)) - Number(!!portraitSource(a.id))) : [];
    const pagination = { from: data?.total ? data.offset + 1 : 0, to: data?.total ? Math.min(data.total, (data.offset || 0) + (data.models.length || 0)) : 0, total: data?.total || 0 };
    const persistedFailure = data?.lastRefresh?.status === 'error' ? data.lastRefresh : null;
    const board = applied.action === 'value' ? 'value' : applied.league || 'overall';
    const planModel = plan => ({ id: plan.modelId, name: plan.name, vendorId: plan.vendorId });
    const planLabel = plan => [plan.name, worldEffortText(plan.effort, c)].filter(Boolean).join(' · ');
    const planName = plan => h('div', null, mini(planModel(plan)), h('div', { className: 'yj-mw-model-name' }, h('strong', null, planLabel(plan)), h('small', null, vendorName(plan))));
    const planActions = plan => modelActions(planModel(plan));
    const valueBoard = () => h(React.Fragment, null,
      h('div', { className: 'yj-mw-table-wrap' }, h('table', { className: 'yj-mw-table' },
        h('thead', null, h('tr', null, ...[c.band, c.recommend, c.index, c.cost, c.alternatives, c.actions].map(label => h('th', { key: label, scope: 'col' }, label)))),
        h('tbody', null, ...data.bands.filter(band => band.best).map(band => h('tr', { key: band.id },
          h('td', null, band.name),
          h('td', { className: 'yj-mw-cell-model' }, planName(band.best)),
          h('td', { className: 'yj-mw-score' }, band.best.index), h('td', null, worldCostText(band.best.cost)),
          h('td', { className: 'yj-mw-alt' }, band.alternatives.map(plan => `${planLabel(plan)}：${plan.index} / ${worldCostText(plan.cost)}`).join('；') || c.unknown),
          h('td', null, planActions(band.best))))))),
      h('div', { className: 'yj-mw-actions' }, h('h3', null, c.plans), button(allPlans ? c.showFrontier : c.showAll, () => setAllPlans(value => !value))),
      h('div', { className: 'yj-mw-table-wrap' }, h('table', { className: 'yj-mw-table' },
        h('thead', null, h('tr', null, ...[c.rank, c.plans, c.index, c.cost, c.frontier, c.actions].map(label => h('th', { key: label, scope: 'col' }, label)))),
        h('tbody', null, ...data.plans.filter(plan => allPlans || plan.frontier).map((plan, index) => h('tr', { key: plan.key },
          h('td', { className: 'yj-mw-rank', 'data-top': index < 3 }, index + 1),
          h('td', { className: 'yj-mw-cell-model' }, planName(plan)),
          h('td', null, bar(plan.index)), h('td', { className: 'yj-mw-score' }, worldCostText(plan.cost)),
          h('td', null, plan.frontier ? h('span', { className: 'yj-mw-badge' }, c.frontier) : null),
          h('td', null, planActions(plan))))))));
    const rankingTable = () => h('div', { className: 'yj-mw-table-wrap' }, h('table', { className: 'yj-mw-table' },
      h('thead', null, h('tr', null, ...[c.rank, c.model, c.tier, c.overall, ...Object.entries(worldDimensions).filter(([key]) => key !== 'eci').map(([, dimension]) => dimension.name), c.actions].map(label => h('th', { key: label, scope: 'col' }, label)))),
      h('tbody', null, ...data.models.map((model, index) => {
        const rank = data.offset + index + 1;
        return h('tr', { key: model.id },
          h('td', { className: 'yj-mw-rank', 'data-top': applied.direction !== 'asc' && rank <= 3 }, rank),
          h('td', { className: 'yj-mw-cell-model' }, h('div', null, mini(model), h('div', { className: 'yj-mw-model-name' }, h('strong', null, model.name), h('small', null, [vendorName(model), model.releaseDate, model.capabilities.reasoning && c.reasoning].filter(Boolean).join(' · '))))),
          h('td', null, tierBadge(model.rating.tier)), h('td', { className: 'yj-mw-score' }, model.rating.overall ?? c.noScore, model.rating.effort && h('small', { className: 'yj-mw-effort' }, worldEffortText(model.rating.effort, c))),
          ...['reasoning', 'coding', 'agent'].map(key => h('td', { key }, bar(model.rating[key]))),
          h('td', null, modelActions(model)));
      }))));
    return h('section', { className: 'yj-mw', 'aria-label': c.title }, h('style', null, worldViewCss),
      h('header', { className: 'yj-mw-header' }, h('h2', null, c.title), h('div', { className: 'yj-mw-header-actions' },
        busy && data && h('span', { className: 'yj-mw-status yj-mw-status-late', role: 'status' }, c.updating, button(c.cancel, stopPage)),
        // 上次更新没完成：标题行留一个小标记和“重新读取”，原因放在悬停提示里，不在内容上方插整块报错。
        !busy && persistedFailure && !error && h('span', { className: 'yj-mw-status yj-mw-status-warn', title: persistedFailure.message }, c.refreshFail, button(c.readback, () => load(applied, false))),
        button(c.refresh, () => load(applied, true), { disabled: busy }))),
      h('nav', { className: 'yj-mw-tabs', 'aria-label': c.title }, ...['gallery', 'timeline', 'ranking'].map(item => button(c[item], () => navigate(item), { key: item, 'aria-pressed': mode === item, disabled: busy || item === 'ranking' && !!data && !data.leagues.length }))),
      h('form', { className: 'yj-mw-toolbar', onSubmit: event => { event.preventDefault(); navigate(mode); } }, h('input', { ref: fallback, type: 'search', 'aria-label': c.search, placeholder: c.search, maxLength: 160, value: filters.query, onChange: event => setFilters(previous => ({ ...previous, query: event.target.value })) }), h('select', { 'aria-label': c.all, value: filters.vendorId, onChange: event => navigate(mode, { ...filters, vendorId: event.target.value }), disabled: busy }, h('option', { value: '' }, c.all), ...(data?.vendors || []).map(vendor => h('option', { key: vendor.id, value: vendor.id }, vendor.nameZh || vendor.name))), h('select', { 'aria-label': c.capability, value: filters.capability, onChange: event => navigate(mode, { ...filters, capability: event.target.value }), disabled: busy }, h('option', { value: '' }, c.capability), ...['reasoning', 'toolCall', 'structuredOutput', 'promptCaching'].map(key => h('option', { value: key, key }, c[key]))), h('button', { type: 'submit', disabled: busy }, c.searchGo)),
      !data ? busy ? h('div', null, h('div', { className: 'yj-mw-skeleton', role: 'progressbar', 'aria-label': c.title }), button(c.cancel, stopPage)) : null : !data.available ? h('div', { className: 'yj-mw-empty' }, c.noSnapshot) : h(React.Fragment, null,
        mode === 'gallery' && !gallery && button(c.back, () => navigate('gallery', { query: '', vendorId: '', capability: '' }), { disabled: busy }),
        gallery ? vendorItems.length ? h('div', { className: 'yj-mw-deck' }, ...vendorItems.map(vendor => h('button', { type: 'button', key: vendor.id, className: 'yj-mw-role', onClick: () => navigate('gallery', { ...filters, query: '', vendorId: vendor.id }), 'aria-label': `${c.browse} ${vendor.nameZh || vendor.name} ${c.family}`, disabled: busy },
          h('div', { className: 'yj-mw-role-art' }, h(Portrait, { vendorId: vendor.id })),
          h('span', { className: 'yj-mw-role-text' }, h('strong', null, vendor.nameZh || vendor.name),
            vendor.top ? h('span', { className: 'yj-mw-role-top' }, tierBadge(vendor.top.tier), h('span', null, `${c.strongest} ${vendor.top.name}`)) : null,
            Number.isInteger(vendor.modelCount) && h('small', null, `${vendor.modelCount} ${c.models}`))))) : h('div', { className: 'yj-mw-empty' }, c.empty)
          : data.action === 'ranking' || data.action === 'value' ? h(React.Fragment, null,
            h('div', { className: 'yj-mw-boards', role: 'group', 'aria-label': c.board }, ...Object.entries(worldBoards).map(([id, name]) => button(name, () => selectBoard(id), { key: id, 'aria-pressed': board === id, disabled: busy })),
              data.action === 'ranking' && button(`${applied.direction === 'asc' ? '↑' : '↓'} ${applied.direction === 'asc' ? c.ascending : c.descending}`, () => load({ ...applied, direction: applied.direction === 'asc' ? 'desc' : 'asc', offset: 0 }), { className: 'yj-mw-sort', title: c.sortToggle, 'aria-label': `${c.sort}：${applied.direction === 'asc' ? c.ascending : c.descending}，${c.sortToggle}`, disabled: busy })),
            data.action === 'value' ? data.plans.length ? valueBoard() : h('div', { className: 'yj-mw-empty' }, c.empty) : !data.models.length ? h('div', { className: 'yj-mw-empty' }, c.empty) : rankingTable())
          : !data.models.length ? h('div', { className: 'yj-mw-empty' }, c.empty)
            : data.action === 'timeline' ? h(React.Fragment, null, data.unknownDates > 0 && h('small', null, `${data.unknownDates} ${c.missingDates}`), h('div', { className: 'yj-mw-timeline' }, ...worldTimelineGroups(data.models).map(group => h('section', { key: group.year }, h('h3', { className: 'yj-mw-year' }, group.year), h('div', { className: 'yj-mw-row-list' }, ...group.models.map(modelRow))))))
              : h('div', { className: 'yj-mw-row-list' }, ...data.models.map(modelRow)),
        !gallery && data.action !== 'value' && pagination.total > data.limit && h('footer', { className: 'yj-mw-page' }, h('span', null, `${pagination.from}–${pagination.to} / ${pagination.total}`), button(c.previous, () => load({ ...applied, offset: Math.max(0, data.offset - data.limit) }), { disabled: busy || data.offset === 0 }), button(c.next, () => load({ ...applied, offset: data.offset + data.limit }), { disabled: busy || pagination.to >= pagination.total }))),
      selected.length > 0 && h('div', { className: 'yj-mw-selected' }, h('span', null, `${c.duel} · ${selected.length}/2`), ...selected.map(model => button(`${model.name} ×`, () => toggle(model), { key: model.id, className: 'yj-mw-chip', 'aria-label': `${c.remove} ${model.name}` })), button(c.duel, event => openWindow({ action: 'compare', ids: selected.map(model => model.id) }, event.currentTarget), { disabled: selected.length !== 2 }), button(c.clear, () => setSelected([]))),
      data && h('details', { className: 'yj-mw-about' }, h('summary', null, c.about), h('p', null, c.method), h('p', null, c.valueMethod), data.available && h('p', null, `${c.generated} ${worldTime(data.generatedAt) ?? c.unknown} · ${c.accepted} ${worldTime(data.acceptedAt) ?? c.unknown}`), h('p', null, c.artCredit), ...data.attributions.map(item => h('p', { key: item.name }, link(item.url, item.name), ' · ', item.licenseUrl ? link(item.licenseUrl, item.license) : item.license))),
      window && h(ModelWindow, { state: window, onClose: closeWindow, retry: () => openWindow(windowInput.current), returnFocus: trigger.current, fallbackFocus: fallback, copy: c }));
  };
}
