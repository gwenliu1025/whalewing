import { worldBenchmarks, worldDimensions } from './model-world-contract.js';
import { matchWorldIndex, strongestEffort, worldTierFor } from './model-world-index.js';

const round = value => Math.round(value * 10) / 10;
const minimumPopulation = 5;

/**
 * 综合实力取 Artificial Analysis Intelligence Index 的最强档成绩（见 model-world-index.js），梯队按该指数划分。
 * 推理与知识、编程、智能体三个分项：每项第三方评测先换算为在全体已测模型中的百分位，再按维度取平均；
 * `composite` 是四个维度的加权百分位，只在双方都没有 AA 指数时用于对决比较。
 */
export function rateWorldModels(models, index = matchWorldIndex(models).matched) {
  const populations = new Map();
  for (const model of models) for (const score of model.scores) {
    if (!populations.has(score.league)) populations.set(score.league, []);
    populations.get(score.league).push(score.score);
  }
  for (const values of populations.values()) values.sort((a, b) => a - b);
  const percentile = (league, value) => {
    const values = populations.get(league);
    if (values.length < minimumPopulation) return null;
    let below = 0, equal = 0;
    for (const item of values) { if (item < value) below++; else if (item === value) equal++; }
    return (below + equal / 2) / values.length * 100;
  };
  return models.map(model => {
    const groups = Object.fromEntries(Object.keys(worldDimensions).map(key => [key, []]));
    for (const score of model.scores) {
      const value = percentile(score.league, score.score);
      if (value !== null) groups[worldBenchmarks[score.league].dimension].push(value);
    }
    const dimensions = Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null]));
    const coverage = Object.values(groups).reduce((sum, values) => sum + values.length, 0);
    let weight = 0, total = 0;
    for (const [key, value] of Object.entries(dimensions)) if (value !== null) { weight += worldDimensions[key].weight; total += worldDimensions[key].weight * value; }
    const composite = coverage >= 2 && weight >= 0.4 ? round(total / weight) : null;
    const efforts = index.get(model.id)?.efforts.map(item => ({ ...item })) ?? [];
    const best = strongestEffort(efforts);
    const overall = best?.index ?? null;
    return { ...model, efforts, rating: { overall, tier: worldTierFor(overall), effort: best?.effort ?? null, composite, ...dimensions, coverage } };
  });
}
