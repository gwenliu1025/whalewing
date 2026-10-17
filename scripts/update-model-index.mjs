import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { modelWorldVendorIds } from '../src/model-world-roster.js';

/**
 * 从 Artificial Analysis 免费接口拉取智能指数，生成 src/model-world-index-data.js。
 * 用法：设置用户环境变量 WHALEWING_AA_API_KEY 后运行 node scripts/update-model-index.mjs。免费版每天 100 次请求，一次更新约 4 次。
 * Key 只在本脚本内使用，不写入生成文件、仓库或插件安装包。
 */
const endpoint = 'https://artificialanalysis.ai/api/v2/language/models/free';
const target = fileURLToPath(new URL('../src/model-world-index-data.js', import.meta.url));

/** AA 的厂商名 → 模型世界的厂商 id；名单外的厂商不收录。 */
export const aaCreators = Object.freeze({
  Anthropic: 'anthropic', OpenAI: 'openai', Google: 'google', DeepSeek: 'deepseek', Alibaba: 'alibaba', Kimi: 'moonshotai', 'Z AI': 'zhipuai',
  'ByteDance Seed': 'bytedance-seed', MiniMax: 'minimax', Tencent: 'tencent', Baidu: 'baidu', Xiaomi: 'xiaomi', LongCat: 'meituan', StepFun: 'stepfun',
  SpaceXAI: 'xai', xAI: 'xai', Meta: 'meta', Mistral: 'mistral', Perplexity: 'perplexity',
});
const efforts = { max: 'max', xhigh: 'xhigh', high: 'high', medium: 'medium', low: 'low', minimal: 'minimal', reasoning: null, 'non-reasoning': 'none' };

/** 拆出名称末尾括号里的思考强度：“Claude Opus 5.5 (Max, Default Fallback)” → 名称 + max；括号里不是强度（如 0902、Preview）则保留在名称里。 */
export function parseAaName(name) {
  const match = name.match(/^(.*\S)\s*\(([^)]*)\)\s*$/);
  if (!match) return { name, effort: null };
  const first = match[2].split(',')[0].trim().toLowerCase();
  return Object.hasOwn(efforts, first) ? { name: match[1], effort: efforts[first] } : { name, effort: null };
}

const order = ['max', 'xhigh', 'high', 'medium', 'low', 'minimal', null, 'none'];
const roster = new Set(modelWorldVendorIds);

/** 把 AA 的模型行按“厂商 + 名称”合并成一个模型的多档成绩；没有智能指数的行不收。 */
export function groupAaModels(rows) {
  const groups = new Map();
  for (const row of rows) {
    const vendorId = aaCreators[row.model_creator?.name];
    const index = row.evaluations?.artificial_analysis_intelligence_index;
    if (!vendorId || !roster.has(vendorId) || typeof index !== 'number') continue;
    const { name, effort } = parseAaName(row.name);
    const key = `${vendorId}|${name}`;
    if (!groups.has(key)) groups.set(key, { vendorId, name, released: row.release_date ?? null, levels: new Map() });
    const group = groups.get(key);
    const cost = row.artificial_analysis_intelligence_index_cost?.cost_per_task?.total_cost;
    // 同一档出现多次时保留分数更高的一条。
    if (!group.levels.has(effort) || group.levels.get(effort)[1] < index) group.levels.set(effort, [effort, Math.round(index * 10) / 10, typeof cost === 'number' ? Math.round(cost * 10000) / 10000 : null]);
    if (row.release_date && (!group.released || row.release_date > group.released)) group.released = row.release_date;
  }
  return [...groups.values()].map(group => ({ ...group, levels: [...group.levels.values()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])) }))
    .sort((a, b) => Math.max(...b.levels.map(level => level[1])) - Math.max(...a.levels.map(level => level[1])) || a.name.localeCompare(b.name));
}

async function fetchAll(key) {
  const rows = [];
  let version = null;
  for (let page = 1; page <= 20; page++) {
    const response = await fetch(`${endpoint}?page=${page}`, { headers: { 'x-api-key': key } });
    if (!response.ok) throw new Error(`Artificial Analysis 返回 ${response.status}：${response.status === 401 ? 'API Key 无效' : response.status === 429 ? '今天的免费额度已用完，明天再试' : '请稍后重试'}`);
    const body = await response.json();
    version = body.intelligence_index_version;
    rows.push(...body.data);
    if (!body.pagination?.has_more) break;
  }
  return { rows, version };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const key = process.env.WHALEWING_AA_API_KEY;
  if (!key) throw new Error('缺少环境变量 WHALEWING_AA_API_KEY');
  const { rows, version } = await fetchAll(key);
  const groups = groupAaModels(rows);
  const asOf = new Date().toISOString().slice(0, 10);
  const lines = groups.map(group => `  [${JSON.stringify(group.vendorId)}, ${JSON.stringify(group.name)}, ${JSON.stringify(group.released)}, ${JSON.stringify(group.levels)}],`);
  await writeFile(target, `// 生成来源：scripts/update-model-index.mjs（Artificial Analysis 免费接口）；请重新运行脚本更新，不要手改。\n`
    + `export const worldIndexAsOf = ${JSON.stringify(asOf)};\nexport const worldIndexVersion = ${JSON.stringify(String(version))};\n`
    + `// [厂商 id, 名称, 发布日期, [[思考强度, 智能指数, 单次任务美元成本], ...]]\nexport const worldIndexRows = [\n${lines.join('\n')}\n];\n`, 'utf8');
  process.stdout.write(`已从 ${rows.length} 条记录生成 ${groups.length} 个模型（指数 v${version}，${asOf}）\n`);
}
