import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withFileLock } from '@deepseek-ai/dsh-atomic-write';
import { modelWorldContract, worldLimits, worldCapabilityKeys as capKeys, worldPriceKeys as priceKeys, worldBenchmarks, worldBoards, worldScoreSources, worldUnits } from './contract.js';
import { rateWorldModels } from '../../src/model-world-rating.js';
import { matchWorldIndex, worldIndexSource, worldValuePlans } from '../../src/model-world-index.js';

export { worldLimits } from './contract.js';
const contract = modelWorldContract(z);

export const worldRepository = 'https://github.com/liyupi/ai-model-world';
export const auditedWorldCommit = '9ee3ad749c8d7405aa090d1023c197b234e4365f';
const api = 'https://api.github.com/repos/liyupi/ai-model-world';
export const worldAttributions = Object.freeze([
  { name: 'AI 模型世界 · liyupi', url: worldRepository, license: 'MIT（代码与编排；聚合数据按字段来源）', changes: '鲸翼重新绘制界面，筛选已核清来源的字段，并按原值排序；不复制像素素材及字体。' },
  { name: 'models.dev', url: 'https://github.com/anomalyco/models.dev', license: 'MIT', changes: '仅展示 provenance 明确标为 models.dev 的字段。' },
  { name: worldIndexSource.name, url: worldIndexSource.url, license: '公开排行榜数据，引用须注明来源', changes: '综合实力取各模型最强思考档的指数；性价比按单次任务成本折算相对消耗。' },
  { name: 'Epoch AI · Benchmarking Hub', url: 'https://epoch.ai/benchmarks', license: 'CC BY 4.0', licenseUrl: 'https://epoch.ai/benchmarks/use-this-data', changes: '采用第三方评测成绩，换算为百分位计算推理、编程、智能体分项。' },
  { name: 'LiveBench', url: 'https://livebench.ai', license: 'Apache-2.0', changes: '采用编程与智能体编程成绩，换算为百分位计算编程分项。' },
]);
const worldLeagues = Object.freeze(Object.entries(worldBoards).map(([id, name]) => ({ id, name })));
const modelKeys = 'benchmarks capabilities coding contextWindow firstSeenAt id knowledgeCutoff license maxOutput modalities name openWeights params pricing provenance releaseDate releaseDatePrecision retiredAt scores slug trainingComputeFlop vendorId'.split(' ');
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
function object(value, keys, required = keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail('WORLD_SCHEMA', '模型快照契约发生变化，保留原数据');
}
function string(value, max = worldLimits.text, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('WORLD_SCHEMA', '模型快照文本格式无效');
}
function number(value, nullable = true) {
  if (nullable && value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e30) fail('WORLD_SCHEMA', '模型快照数值格式无效');
}
function bool(value, nullable = true) {
  if (nullable && value === null) return;
  if (typeof value !== 'boolean') fail('WORLD_SCHEMA', '模型快照布尔格式无效');
}
function array(value, max) { if (!Array.isArray(value) || value.length > max) fail('WORLD_SCALE', '模型快照记录数量超限或结构无效'); }
function url(value, nullable = false) {
  if (nullable && value === null) return;
  string(value, worldLimits.link);
  let parsed;
  try { parsed = new URL(value); } catch { fail('WORLD_LINK', '模型快照来源链接无效'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('WORLD_LINK', '模型快照包含不接受的链接协议或凭据');
}
function timestamp(value, nullable = false) {
  if (nullable && value === null) return;
  string(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail('WORLD_SCHEMA', '快照时间必须是明确的 UTC 时间');
}
function date(value, precision) {
  if (value === null) return;
  string(value, 10);
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) fail('WORLD_SCHEMA', '模型日期无效');
  if (!['day', 'month', 'year'].includes(precision)) fail('WORLD_SCHEMA', '模型日期精度无效');
}
function scores(values) {
  array(values, worldLimits.scores);
  for (const value of values) {
    object(value, ['attribution', 'league', 'score', 'source', 'sourceUrl', 'unit']);
    for (const key of ['attribution', 'league', 'source', 'unit']) string(value[key], worldLimits.sourceId);
    if (typeof value.score !== 'number' || !Number.isFinite(value.score) || Math.abs(value.score) > 1e30) fail('WORLD_SCHEMA', '模型评测数值格式无效');
    url(value.sourceUrl, true);
  }
}

/** 固定审核过的 WorldSnapshot 结构；未知字段拒收，未知来源字段隐藏而不补值。 */
export function acceptWorldSnapshot(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > worldLimits.snapshotBytes) fail('WORLD_SCALE', '模型快照超过字节上限');
  let input;
  try { input = JSON.parse(raw); } catch { fail('WORLD_SCHEMA', '模型快照不是完整 JSON'); }
  object(input, ['generatedAt', 'sources', 'vendors', 'models', 'benchmarks']);
  timestamp(input.generatedAt);
  if (!input.sources || typeof input.sources !== 'object' || Array.isArray(input.sources) || Object.keys(input.sources).length > worldLimits.sources) fail('WORLD_SCHEMA', '模型快照来源目录无效');
  for (const [key, source] of Object.entries(input.sources)) {
    string(key, worldLimits.sourceId); object(source, ['fetchedAt', 'note', 'ok']); timestamp(source.fetchedAt, true); string(source.note, worldLimits.sourceNote, true); bool(source.ok, false);
  }
  array(input.vendors, worldLimits.vendors); array(input.models, worldLimits.models); array(input.benchmarks, worldLimits.scores);
  const vendorIds = new Set();
  const vendors = input.vendors.map(vendor => {
    object(vendor, ['accentColor', 'continent', 'country', 'homepage', 'id', 'motif', 'name', 'nameZh']);
    for (const key of ['id', 'name', 'nameZh', 'accentColor', 'continent', 'country', 'motif']) string(vendor[key], worldLimits.id);
    url(vendor.homepage, true);
    if (vendorIds.has(vendor.id)) fail('WORLD_SCHEMA', '模型快照厂商标识重复');
    vendorIds.add(vendor.id);
    return { id: vendor.id, name: vendor.name, nameZh: vendor.nameZh, homepage: vendor.homepage };
  });
  let eci = false;
  const leagueIds = new Set();
  for (const benchmark of input.benchmarks) {
    object(benchmark, ['id', 'inEci', 'models', 'randomBaseline', 'releaseDate', 'scoreCeiling', 'scoreColumn', 'sourceFile', 'supersededBy', 'unit']);
    for (const key of ['id', 'scoreColumn', 'sourceFile', 'unit']) string(benchmark[key], 500);
    string(benchmark.supersededBy, 100, true); bool(benchmark.inEci, false);
    for (const key of ['models', 'randomBaseline', 'scoreCeiling']) number(benchmark[key]);
    date(benchmark.releaseDate, 'day');
    if (leagueIds.has(benchmark.id)) fail('WORLD_SCHEMA', '模型快照赛制标识重复');
    leagueIds.add(benchmark.id);
    if (benchmark.id === 'eci') {
      if (benchmark.unit !== 'index' || benchmark.sourceFile !== 'epoch_capabilities_index/eci_scores.csv' || benchmark.scoreColumn !== 'eci') fail('WORLD_SCHEMA', 'ECI 赛制定义变化，保留原数据');
      eci = true;
    }
  }
  const ids = new Set();
  const models = input.models.map(model => {
    object(model, modelKeys);
    for (const key of ['id', 'name', 'slug', 'vendorId']) string(model[key], worldLimits.id);
    if (ids.has(model.id) || !vendorIds.has(model.vendorId)) fail('WORLD_SCHEMA', '模型标识重复或厂商引用缺失');
    ids.add(model.id);
    timestamp(model.firstSeenAt); date(model.releaseDate, model.releaseDatePrecision); date(model.retiredAt, 'day');
    if (model.knowledgeCutoff !== null) {
      string(model.knowledgeCutoff, 10);
      const cutoff = model.knowledgeCutoff;
      date(/^\d{4}$/.test(cutoff) ? `${cutoff}-01-01` : /^\d{4}-\d{2}$/.test(cutoff) ? `${cutoff}-01` : cutoff, 'day');
    }
    if (!['day', 'month', 'year', null].includes(model.releaseDatePrecision)) fail('WORLD_SCHEMA', '发布日期精度发生变化');
    for (const key of ['contextWindow', 'maxOutput', 'trainingComputeFlop']) number(model[key]);
    bool(model.openWeights); string(model.license, 500, true);
    object(model.capabilities, capKeys); for (const key of capKeys) bool(model.capabilities[key]);
    object(model.pricing, priceKeys); for (const key of priceKeys) number(model.pricing[key]);
    object(model.modalities, ['input', 'output']); for (const values of Object.values(model.modalities)) { array(values, worldLimits.modalities); for (const value of values) string(value, 80); }
    object(model.params, ['activeB', 'confidence', 'sizeTier', 'sizeTierBasis', 'totalB'], ['activeB', 'confidence', 'totalB']);
    number(model.params.activeB); number(model.params.totalB); string(model.params.confidence, 80);
    if (model.params.sizeTier !== undefined) number(model.params.sizeTier);
    if (model.params.sizeTierBasis !== undefined) string(model.params.sizeTierBasis, 200, true);
    if (!model.benchmarks || typeof model.benchmarks !== 'object' || Array.isArray(model.benchmarks) || Object.keys(model.benchmarks).length > worldLimits.scores) fail('WORLD_SCHEMA', '模型评测字段无效');
    for (const value of Object.values(model.benchmarks)) number(value);
    scores(model.scores); scores(model.coding);
    for (const score of [...model.scores, ...model.coding]) if (!Object.hasOwn(input.sources, score.source)) fail('WORLD_SCHEMA', '评测引用了缺失来源');
    if (!model.provenance || typeof model.provenance !== 'object' || Array.isArray(model.provenance) || Object.keys(model.provenance).length > worldLimits.provenance) fail('WORLD_SCHEMA', '模型字段来源无效');
    for (const [key, value] of Object.entries(model.provenance)) { string(key, worldLimits.sourceId); string(value, worldLimits.sourceId); if (!Object.hasOwn(input.sources, value)) fail('WORLD_SCHEMA', '模型字段引用了缺失来源'); }
    const provenance = {};
    const field = (key, value, derivedIdentity = false) => {
      const source = model.provenance[key];
      if (source === 'models.dev' || (derivedIdentity && source === 'derived')) { provenance[key] = source; return value; }
      return null;
    };
    const releaseDate = field('releaseDate', model.releaseDate);
    const releaseDatePrecision = field('releaseDatePrecision', model.releaseDatePrecision);
    // 月/年精度截短用于显示；不把上游用于排序的首日表示成精确发布日期。
    const released = releaseDate && releaseDatePrecision ? releaseDate.slice(0, releaseDatePrecision === 'year' ? 4 : releaseDatePrecision === 'month' ? 7 : 10) : null;
    // 只接纳名单内评测的第三方成绩；同一评测多次发布（如 LiveBench 各期）取最后一条。
    const accepted = new Map();
    for (const score of [...model.scores, ...model.coding]) {
      if (!Object.hasOwn(worldBenchmarks, score.league) || !worldScoreSources.includes(score.source) || !worldUnits.includes(score.unit) || score.attribution !== 'third-party') continue;
      if (score.league === 'eci' && !eci) continue;
      accepted.set(score.league, { league: score.league, score: score.score, source: score.source, sourceUrl: score.sourceUrl, attribution: 'third-party', unit: score.unit });
    }
    const acceptedScores = [...accepted.values()];
    return {
      id: model.id, name: field('name', model.name, true) ?? model.id, vendorId: model.vendorId,
      releaseDate: released, releaseDatePrecision: released ? releaseDatePrecision : null,
      contextWindow: field('contextWindow', model.contextWindow), maxOutput: field('maxOutput', model.maxOutput),
      knowledgeCutoff: field('knowledgeCutoff', model.knowledgeCutoff), license: field('license', model.license), openWeights: field('openWeights', model.openWeights),
      capabilities: Object.fromEntries(capKeys.map(key => [key, field(`capabilities.${key}`, model.capabilities[key])])),
      pricing: { ...Object.fromEntries(priceKeys.map(key => [key, field(`pricing.${key}`, model.pricing[key])])), unit: 'USD / 1M tokens', note: '上游目录价格，不代表员工转发站实际费用' },
      modalities: field('modalities', model.modalities), scores: acceptedScores, provenance,
    };
  });
  // AA 榜单收录、但目录快照里还没有的模型补一条只有名称和厂商的记录，保证综合实力榜不缺席。
  const { matched, missing } = matchWorldIndex(models);
  for (const entry of missing) if (!ids.has(entry.id) && vendorIds.has(entry.vendorId)) {
    ids.add(entry.id);
    models.push({ id: entry.id, name: entry.name, vendorId: entry.vendorId, releaseDate: null, releaseDatePrecision: null, contextWindow: null, maxOutput: null, knowledgeCutoff: null, license: null, openWeights: null,
      capabilities: Object.fromEntries(capKeys.map(key => [key, null])), pricing: { ...Object.fromEntries(priceKeys.map(key => [key, null])), unit: 'USD / 1M tokens', note: '上游目录价格，不代表员工转发站实际费用' }, modalities: null, scores: [], provenance: {} });
  }
  const rated = rateWorldModels(models, matched);
  return contract.snapshot.parse({ generatedAt: input.generatedAt, sources: input.sources, vendors, models: rated, leagues: rated.some(model => model.rating.overall !== null) ? worldLeagues : [], attributions: worldAttributions });
}

/** 只保留图鉴收录的厂商及其模型并按名单排序；原始快照仍完整校验与保存，调整名单无需重新下载。 */
export function curateWorldSnapshot(snapshot, vendorIds) {
  if (!vendorIds) return snapshot;
  const order = new Map(vendorIds.map((id, index) => [id, index]));
  const models = snapshot.models.filter(model => order.has(model.vendorId));
  const counts = new Map();
  for (const model of models) counts.set(model.vendorId, (counts.get(model.vendorId) ?? 0) + 1);
  // 每家给出综合实力最高的型号，图鉴卡片据此展示“最强型号”。
  const top = new Map();
  for (const model of models) if (model.rating.overall !== null && (top.get(model.vendorId)?.overall ?? -1) < model.rating.overall) top.set(model.vendorId, { id: model.id, name: model.name, overall: model.rating.overall, tier: model.rating.tier });
  const vendors = snapshot.vendors.filter(vendor => order.has(vendor.id)).sort((a, b) => order.get(a.id) - order.get(b.id)).map(vendor => ({ ...vendor, modelCount: counts.get(vendor.id) ?? 0, top: top.get(vendor.id) ?? null }));
  return { ...snapshot, vendors, models };
}

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function gitBlobHash(value) { const bytes = Buffer.from(value, 'utf8'); return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'); }
async function abortableRead(read, signal) {
  signal.throwIfAborted();
  let cancel;
  const cancelled = new Promise((_, reject) => { cancel = () => reject(signal.reason); signal.addEventListener('abort', cancel, { once: true }); });
  try { return await Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return read(); }), cancelled]); }
  finally { signal.removeEventListener('abort', cancel); }
}

/** 只跟随同一公开仓库的正式文件；网络安全由宿主 HttpFetchProvider 持有。 */
export async function fetchWorldSnapshot(fetcher, signal) {
  async function get(url) {
    signal.throwIfAborted();
    const result = await abortableRead(() => fetcher.fetch({ url }, signal), signal);
    signal.throwIfAborted();
    if (result.statusCode !== 200 || result.truncated || result.body?.kind !== 'text' || Buffer.byteLength(result.body.content, 'utf8') > worldLimits.responseBytes) fail('WORLD_FETCH', '模型快照下载不完整或网络返回异常，保留原数据');
    if (result.url && result.url !== url) fail('WORLD_FETCH', '模型快照下载路径发生变化');
    try { return JSON.parse(result.body.content); } catch { fail('WORLD_FETCH', '公开仓库返回了无效 JSON'); }
  }
  const commit = await get(`${api}/commits/main`);
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) fail('WORLD_FETCH', '公开仓库提交标识无效');
  const file = await get(`${api}/contents/data/models.json?ref=${commit.sha}`);
  if (file.type !== 'file' || file.path !== 'data/models.json' || !/^[a-f0-9]{40}$/.test(file.sha) || !Number.isInteger(file.size) || file.size < 1 || file.size > worldLimits.snapshotBytes) fail('WORLD_FETCH', '正式模型快照文件的路径或规模无效');
  const blob = await get(`${api}/git/blobs/${file.sha}`);
  if (blob.encoding !== 'base64' || blob.sha !== file.sha || blob.size !== file.size || typeof blob.content !== 'string') fail('WORLD_FETCH', '模型快照 Git blob 契约无效');
  const encoded = blob.content.replace(/\n/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== file.size || bytes.toString('base64') !== encoded) fail('WORLD_FETCH', '模型快照 Base64 长度或编码无效');
  let raw;
  try { raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('WORLD_FETCH', '模型快照 UTF-8 编码无效'); }
  if (gitBlobHash(raw) !== file.sha) fail('WORLD_FETCH', '模型快照内容与 Git 标识不符');
  return { raw, commit: commit.sha, blob: file.sha };
}

/** 一个 profile 只实例化一个 owner；快照文件不放进员工知识库或插件安装包。 */
export class ModelWorld {
  constructor({ root, fetcher, fileSystem = fs, vendorIds = null }) {
    if (!path.isAbsolute(root)) fail('WORLD_PATH', '模型数据目录须为绝对路径');
    this.root = path.resolve(root); this.file = path.join(this.root, 'snapshot.json'); this.fs = fileSystem; this.fetcher = fetcher; this.vendorIds = vendorIds;
    this.closing = new AbortController(); this.current = null; this.refreshing = null; this.lastRefresh = null;
  }
  async safePath(file, directory = false) {
    try { const stat = await this.fs.lstat(file); if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) fail('WORLD_PATH', '模型快照路径类型不安全'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async prepareRoot() {
    // 向上核对已有父目录，避免通过联接或符号链接写入其他 owner。
    for (let cursor = this.root; ; cursor = path.dirname(cursor)) { await this.safePath(cursor, true); if (path.dirname(cursor) === cursor) break; }
    await this.fs.mkdir(this.root, { recursive: true }); await this.safePath(this.root, true); await this.safePath(this.file);
  }
  decode(text) {
    let stored;
    try { stored = JSON.parse(text); } catch { fail('WORLD_STORAGE', '本地模型快照损坏，可手动刷新恢复'); }
    object(stored, ['commit', 'blob', 'acceptedAt', 'raw', 'sha256']);
    if (!/^[a-f0-9]{40}$/.test(stored.commit) || !/^[a-f0-9]{40}$/.test(stored.blob) || typeof stored.raw !== 'string' || hash(stored.raw) !== stored.sha256 || gitBlobHash(stored.raw) !== stored.blob) fail('WORLD_STORAGE', '本地模型快照内容校验失败');
    timestamp(stored.acceptedAt);
    return { ...stored, snapshot: curateWorldSnapshot(acceptWorldSnapshot(stored.raw), this.vendorIds) };
  }
  async readFile() {
    await this.safePath(this.file);
    const stat = await this.fs.stat(this.file);
    if (stat.size > worldLimits.responseBytes) fail('WORLD_SCALE', '本地快照文件超过上限');
    const bytes = await this.fs.readFile(this.file);
    if (bytes.length > worldLimits.responseBytes) fail('WORLD_SCALE', '本地快照文件超过上限');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('WORLD_STORAGE', '本地模型快照编码损坏'); }
  }
  async load() {
    return this.loaded ??= (async () => {
      try { await this.prepareRoot(); this.current = this.decode(await this.readFile()); }
      catch (error) { if (error.code !== 'ENOENT') this.lastRefresh = { status: 'error', code: error.code ?? 'WORLD_STORAGE', message: String(error.message).slice(0, worldLimits.error) }; }
    })();
  }
  status() {
    return structuredClone({
      available: !!this.current, refreshing: !!this.refreshing,
      commit: this.current?.commit ?? null, acceptedAt: this.current?.acceptedAt ?? null, generatedAt: this.current?.snapshot.generatedAt ?? null,
      sources: this.current?.snapshot.sources ?? {}, modelCount: this.current?.snapshot.models.length ?? 0,
      vendors: this.current?.snapshot.vendors ?? [], leagues: this.current?.snapshot.leagues ?? [],
      lastRefresh: this.lastRefresh, attributions: worldAttributions,
    });
  }
  async persist(candidate, signal) {
    await this.prepareRoot(); signal.throwIfAborted();
    // 网络在锁外；同 profile 的整个提交/恢复闭包互斥，争用直接失败而不后台排队。
    return withFileLock(this.file, async () => {
      signal.throwIfAborted();
      const text = JSON.stringify(candidate), temporary = path.join(this.root, `.snapshot-${randomUUID()}.tmp`);
      let previous = null, replaced = false;
      try {
        try { previous = await this.readFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await this.fs.writeFile(temporary, text, { flag: 'wx', encoding: 'utf8', mode: 0o600, flush: true });
        this.decode(await this.fs.readFile(temporary, 'utf8')); signal.throwIfAborted();
        await this.safePath(this.file); await this.fs.rename(temporary, this.file); replaced = true;
        // 原子替换后不再响应取消：必须确定持久 readback 或恢复旧文件，不能把已接受伪装成取消。
        const readback = await this.readFile(); if (readback !== text) fail('WORLD_READBACK', '模型快照写后读回不一致');
        return this.decode(readback);
      } catch (error) {
        if (replaced) {
          try {
            if (previous === null) await this.fs.unlink(this.file);
            else { await this.fs.writeFile(temporary, previous, { flag: 'wx', encoding: 'utf8', mode: 0o600, flush: true }); await this.fs.rename(temporary, this.file); if (await this.readFile() !== previous) throw new Error('恢复读回失败'); }
          } catch { fail('WORLD_STORAGE_UNKNOWN', '快照提交后的恢复结果未确认；保留内存旧数据，请修复本地目录后重新加载核对'); }
        }
        throw error;
      } finally { await this.fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    }, { waitMs: 0 });
  }
  async refresh(signal) {
    if (this.refreshing) fail('WORLD_BUSY', '模型快照正在刷新，请等待结果');
    const operation = (async () => {
      try {
        const downloaded = await fetchWorldSnapshot(this.fetcher, signal);
        acceptWorldSnapshot(downloaded.raw); signal.throwIfAborted();
        const candidate = { ...downloaded, acceptedAt: new Date().toISOString(), sha256: hash(downloaded.raw) };
        this.current = await this.persist(candidate, signal);
        this.lastRefresh = { status: 'ok', at: candidate.acceptedAt };
      } catch (error) {
        // 只有取消自身的拒绝才算取消；同时到达的取消不能覆盖提交/readback/恢复结果。
        const cancelled = signal.aborted && error === signal.reason;
        this.lastRefresh = { status: cancelled ? 'cancelled' : 'error', code: error.code ?? 'WORLD_FETCH', message: cancelled ? '刷新已取消，保留原数据' : String(error.message).slice(0, worldLimits.error) };
        throw error;
      }
    })();
    this.refreshing = operation;
    try { await operation; } finally { this.refreshing = null; }
    return this.status();
  }
  async execute(input, callerSignal) {
    const parsed = contract.input.parse(input);
    return contract.result.parse({ action: parsed.action, ...await this.dispatch(parsed, callerSignal) });
  }
  async dispatch(input, callerSignal) {
    const signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(worldLimits.operationMs), ...(callerSignal ? [callerSignal] : [])]);
    signal.throwIfAborted(); await this.load(); signal.throwIfAborted();
    if (input.action === 'refresh') return this.refresh(signal);
    if (input.action === 'status') return this.status();
    if (!this.current) {
      if (input.action === 'detail') return { ...this.status(), model: null, vendor: null };
      if (input.action === 'compare') return { ...this.status(), models: [] };
      if (input.action === 'value') return { ...this.status(), bands: [], plans: [] };
      return { ...this.status(), models: [], total: 0, offset: input.offset ?? 0, limit: input.limit ?? worldLimits.defaultPage, unknownDates: 0 };
    }
    const snapshot = this.current.snapshot;
    if (input.action === 'detail') {
      const model = snapshot.models.find(item => item.id === input.id);
      if (!model) fail('WORLD_NOT_FOUND', '模型不在当前已接受快照中');
      return structuredClone({ model, vendor: snapshot.vendors.find(vendor => vendor.id === model.vendorId), ...this.status() });
    }
    if (input.action === 'compare') {
      if (new Set(input.ids).size !== input.ids.length) fail('WORLD_INPUT', '请选择 2 至 4 个不同模型');
      const models = input.ids.map(id => snapshot.models.find(model => model.id === id));
      if (models.some(model => !model)) fail('WORLD_NOT_FOUND', '比较模型不在当前快照中');
      return structuredClone({ models, ...this.status() });
    }
    const query = (input.query ?? '').trim().toLocaleLowerCase();
    const vendorMatches = new Set(snapshot.vendors.filter(vendor => `${vendor.name} ${vendor.nameZh} ${vendor.id}`.toLocaleLowerCase().includes(query)).map(vendor => vendor.id));
    const matches = model => (!input.vendorId || model.vendorId === input.vendorId) && (!query || `${model.name} ${model.id}`.toLocaleLowerCase().includes(query) || vendorMatches.has(model.vendorId));
    if (input.action === 'value') {
      const entries = snapshot.models.filter(model => model.efforts.length && matches(model)).map(model => ({ id: model.id, name: model.name, vendorId: model.vendorId, efforts: model.efforts }));
      return structuredClone({ ...this.status(), ...worldValuePlans(entries) });
    }
    if (!['list', 'timeline', 'ranking'].includes(input.action)) fail('WORLD_INPUT', '未知模型浏览操作');
    let models = snapshot.models.filter(model => matches(model) && (!input.capability || model.capabilities[input.capability] === true));
    let unknownDates = 0;
    if (input.action === 'timeline') { unknownDates = models.filter(model => !model.releaseDate).length; models = models.filter(model => model.releaseDate).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.id.localeCompare(b.id)); }
    else if (input.action === 'ranking') {
      const metric = model => model.rating[input.league];
      models = models.filter(model => metric(model) !== null);
      models.sort((a, b) => (input.direction === 'asc' ? 1 : -1) * (metric(a) - metric(b)) || (b.rating.overall ?? 0) - (a.rating.overall ?? 0) || a.id.localeCompare(b.id));
    } else models.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const offset = input.offset ?? 0, limit = input.limit ?? worldLimits.defaultPage;
    return structuredClone({ ...this.status(), models: models.slice(offset, offset + limit), total: models.length, offset, limit, unknownDates });
  }
  async dispose() { this.closing.abort(new Error('模型世界服务已关闭')); if (this.refreshing) await this.refreshing.catch(() => {}); }
}
