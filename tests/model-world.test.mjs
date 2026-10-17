import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { acceptWorldSnapshot, curateWorldSnapshot, fetchWorldSnapshot, ModelWorld, worldLimits } from '../src/model-world.js';
import { rateWorldModels } from '../src/model-world-rating.js';
import { worldIndex, worldValuePlans, worldTierFor, matchWorldIndex, worldNameKey } from '../src/model-world-index.js';
import { parseAaName, groupAaModels } from '../scripts/update-model-index.mjs';
import { modelWorldContract } from '../src/model-world-contract.js';

const at = '2026-10-11T13:44:58.831Z';
function fixture() {
  const model = {
    id: 'vendor/one', name: '合成模型一', slug: 'vendor-one', vendorId: 'vendor',
    firstSeenAt: at, releaseDate: '2026-09-01', releaseDatePrecision: 'month', retiredAt: null,
    contextWindow: 0, maxOutput: 100, knowledgeCutoff: '2025-06', license: null, openWeights: false,
    params: { activeB: null, totalB: null, confidence: 'estimated', sizeTier: 1, sizeTierBasis: 'price+naming' },
    pricing: { inputPerMTok: 0, outputPerMTok: 3, cachedInputPerMTok: null },
    capabilities: { reasoning: true, toolCall: false, structuredOutput: null, promptCaching: true },
    modalities: { input: ['text'], output: ['text'] }, trainingComputeFlop: null,
    benchmarks: { eci: 129, other: 99 }, coding: [],
    scores: [
      { league: 'eci', score: 129, source: 'epoch.ai', sourceUrl: 'https://epoch.ai/benchmarks', attribution: 'third-party', unit: 'index' },
      { league: 'other', score: 99, source: 'epoch.ai', sourceUrl: 'https://example.org', attribution: 'third-party', unit: 'pct' },
    ],
    provenance: { name: 'derived', vendorId: 'derived', releaseDate: 'models.dev', releaseDatePrecision: 'models.dev', contextWindow: 'models.dev', maxOutput: 'openrouter', knowledgeCutoff: 'models.dev', 'pricing.inputPerMTok': 'models.dev', 'pricing.outputPerMTok': 'openrouter', 'capabilities.reasoning': 'models.dev', 'capabilities.toolCall': 'models.dev', 'capabilities.promptCaching': 'derived', modalities: 'models.dev' },
  };
  return {
    generatedAt: at,
    sources: Object.fromEntries(['derived', 'models.dev', 'openrouter', 'epoch.ai'].map(key => [key, { fetchedAt: at, note: '合成来源', ok: true }])),
    vendors: [{ id: 'vendor', name: 'Vendor', nameZh: '合成厂商', homepage: null, continent: 'west', country: 'ZZ', accentColor: '#000000', motif: 'wanderer' }],
    models: [model, { ...structuredClone(model), id: 'vendor/two', name: '合成模型二', slug: 'vendor-two', releaseDate: '2026-08-21', releaseDatePrecision: 'day', scores: [{ ...model.scores[0], score: 90 }] }],
    benchmarks: [{ id: 'eci', inEci: false, models: 2, randomBaseline: null, releaseDate: null, scoreCeiling: null, scoreColumn: 'eci', sourceFile: 'epoch_capabilities_index/eci_scores.csv', supersededBy: null, unit: 'index' }],
  };
}
function publicFixture(input = fixture(), overrides = {}) {
  const raw = JSON.stringify(input), bytes = Buffer.from(raw), commit = '1'.repeat(40);
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const calls = [];
  const fetcher = { async fetch({ url }, signal) {
    signal.throwIfAborted(); calls.push(url);
    const content = url.endsWith('/commits/main') ? { sha: commit }
      : url.includes('/contents/') ? { type: 'file', path: 'data/models.json', sha: blob, size: bytes.length }
        : { sha: blob, encoding: 'base64', size: bytes.length, content: bytes.toString('base64') };
    return { url, statusCode: 200, body: { kind: 'text', content: JSON.stringify(content) }, truncated: false, ...overrides };
  } };
  return { raw, blob, commit, fetcher, calls };
}
async function instance(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-world-'));
  // 每例独占目录；清理严格限制在 allocator 返回的根内。
  t.after(async () => { if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('whalewing-world-')) throw new Error('测试目录越界'); await fs.rm(root, { recursive: true, force: true }); });
  const remote = publicFixture();
  const world = new ModelWorld({ root, fetcher: remote.fetcher, ...options });
  t.after(() => world.dispose());
  return { world, root, ...remote };
}

test('字段许可白名单保留零值、派生身份、日期精度并排除派生能力与未核清价格', () => {
  const accepted = acceptWorldSnapshot(JSON.stringify(fixture()));
  const model = accepted.models[0];
  assert.equal(model.name, '合成模型一'); assert.equal(model.contextWindow, 0); assert.equal(model.maxOutput, null);
  assert.equal(model.releaseDate, '2026-09'); assert.equal(model.releaseDatePrecision, 'month'); assert.equal(model.knowledgeCutoff, '2025-06');
  assert.equal(model.capabilities.promptCaching, null); assert.equal(model.capabilities.reasoning, true); assert.equal(model.capabilities.toolCall, false);
  assert.equal(model.pricing.inputPerMTok, 0); assert.equal(model.pricing.outputPerMTok, null);
  assert.deepEqual(model.scores.map(score => [score.league, score.score, score.unit]), [['eci', 129, 'index']]);
  // 两个模型不足以换算百分位：不评级、不进榜单，也不编造分数。
  assert.equal(model.rating.overall, null); assert.equal(model.rating.tier, null); assert.deepEqual(accepted.leagues, []);
  assert.equal(accepted.attributions.some(item => item.name.startsWith('Epoch AI') && item.license === 'CC BY 4.0'), true);
});

test('收录名单只保留名单厂商及其模型，按名单排序并给出模型数；原始快照仍完整保存', async t => {
  const input = fixture();
  input.vendors.push({ ...input.vendors[0], id: 'other', name: 'Other', nameZh: '其他厂商' }, { ...input.vendors[0], id: 'first', name: 'First', nameZh: '首位厂商' });
  input.models.push({ ...structuredClone(input.models[0]), id: 'other/one', slug: 'other-one', vendorId: 'other' }, { ...structuredClone(input.models[0]), id: 'first/one', slug: 'first-one', vendorId: 'first' });
  const curated = curateWorldSnapshot(acceptWorldSnapshot(JSON.stringify(input)), ['first', 'vendor']);
  assert.deepEqual(curated.vendors.map(vendor => [vendor.id, vendor.modelCount]), [['first', 1], ['vendor', 2]]);
  assert.deepEqual(curated.models.map(model => model.vendorId).sort(), ['first', 'vendor', 'vendor']);
  assert.equal(curateWorldSnapshot(acceptWorldSnapshot(JSON.stringify(input)), null).vendors.length, 3);
  const { world, root } = await instance(t, { vendorIds: ['vendor'] });
  world.fetcher = publicFixture(input).fetcher;
  const status = await world.execute({ action: 'refresh' });
  assert.deepEqual(status.vendors.map(vendor => vendor.id), ['vendor']); assert.equal(status.modelCount, 2);
  assert.equal((await world.execute({ action: 'list', vendorId: 'other' })).total, 0);
  assert.equal(JSON.parse(JSON.parse(await fs.readFile(path.join(root, 'snapshot.json'), 'utf8')).raw).vendors.length, 3);
});

test('来源字段不通过汇总值或他源回退；评测只收名单内的第三方成绩，厂商自报与未知评测不收', () => {
  const raw = fixture();
  raw.models[0].provenance.releaseDate = 'epoch.ai'; raw.models[0].provenance.name = 'openrouter';
  raw.models[0].coding = [
    { league: 'swe_bench_pro', score: 60, source: 'models.dev', sourceUrl: 'https://vendor.example/blog', attribution: 'vendor-self-reported', unit: 'pct' },
    { league: 'livebench_coding', score: 50, source: 'livebench', sourceUrl: 'https://livebench.ai/#/?release=2025-01-01', attribution: 'third-party', unit: 'pct' },
    { league: 'livebench_coding', score: 70, source: 'livebench', sourceUrl: 'https://livebench.ai/#/?release=2026-01-01', attribution: 'third-party', unit: 'pct' },
  ];
  raw.models[0].scores.push({ league: 'arena_text_to_image', score: 1200, source: 'lmarena', sourceUrl: null, attribution: 'third-party', unit: 'elo' });
  raw.sources.livebench = raw.sources.lmarena = { fetchedAt: at, note: '合成来源', ok: true };
  const accepted = acceptWorldSnapshot(JSON.stringify(raw)).models[0];
  assert.equal(accepted.name, 'vendor/one'); assert.equal(accepted.releaseDate, null);
  assert.deepEqual(accepted.scores.map(score => [score.league, score.score]), [['eci', 129], ['livebench_coding', 70]]);
});

test('综合实力取 AA 指数最强档，梯队按指数划分；分项按百分位跨单位合成，评测不足不给加权分', () => {
  const mk = (id, value, extra = {}) => ({ id, vendorId: 'v', capabilities: { reasoning: false }, pricing: { inputPerMTok: 1, outputPerMTok: 4 }, scores: [
    { league: 'eci', score: 100 + value, unit: 'index' }, { league: 'gpqa_diamond', score: value, unit: 'pct' }, { league: 'webdev_arena_elo', score: 1000 + value * 10, unit: 'elo' },
  ], ...extra });
  const rated = rateWorldModels([mk('a', 10), mk('b', 20), mk('c', 30), mk('d', 40), mk('anthropic/claude-sonnet-5-5', 60), mk('anthropic/claude-opus-5-5', 50), mk('anthropic/claude-fable-5-1', 55), mk('lone', 0, { scores: [{ league: 'eci', score: 1, unit: 'index' }] })]);
  const by = Object.fromEntries(rated.map(model => [model.id, model]));
  const opus = by['anthropic/claude-opus-5-5'], sonnet = by['anthropic/claude-sonnet-5-5'], fable = by['anthropic/claude-fable-5-1'];
  assert.ok(sonnet.rating.composite > opus.rating.composite, '分项百分位 Sonnet 更高');
  assert.deepEqual([opus.rating.overall, opus.rating.tier, opus.rating.effort], [57.6, 'T0', 'max'], '综合实力仍以 AA 最强档为准，Opus 5.5 第一');
  assert.ok(sonnet.rating.overall < opus.rating.overall);
  assert.deepEqual([fable.rating.tier, fable.rating.effort], ['T0', 'max']);
  assert.equal(opus.efforts.length, 5); assert.deepEqual(opus.efforts[2], { effort: 'high', index: 53.6, cost: 182.25 }, '成本按 GPT-5.6 Luna 轻度 ≈ $0.01 = 1 折算');
  assert.equal(by.a.rating.overall, null, 'AA 未收录的模型不进综合实力榜'); assert.equal(by.a.rating.tier, null);
  assert.ok(by.d.rating.reasoning > by.a.rating.reasoning); assert.equal(by.a.rating.coverage, 3);
  assert.equal(by.lone.rating.composite, null, '只有一项评测不给加权分');
  assert.deepEqual([52, 51, 44, 43, 34, 33].map(worldTierFor), ['T0', 'T1', 'T1', 'T2', 'T2', 'T3']);
});

test('性价比先按相对消耗分档，档内推荐能力最强的模型与思考强度；同价最强标记无被支配方案', () => {
  const { bands, plans } = worldValuePlans(worldIndex.map(entry => ({ ...entry, id: `${entry.vendorId}/${entry.key}` })));
  const best = Object.fromEntries(bands.map(band => [band.id, band.best && `${band.best.name} ${band.best.effort} ${band.best.index}`]));
  assert.equal(best.c200, 'Claude Opus 5.5 high 53.6', '100–200 消耗档推荐 Opus 5.5 高强度思考');
  assert.equal(best.c100, 'GPT-6.1 Sol max 51.8');
  assert.equal(best['c-max'], 'Claude Opus 5.5 max 57.6');
  assert.ok(bands.every(band => band.alternatives.length <= 3 && band.alternatives.every(plan => !band.best || plan.index <= band.best.index)));
  const key = (name, effort) => plans.find(plan => plan.name === name && plan.effort === effort);
  assert.equal(key('Claude Opus 5.5', 'high').frontier, true);
  assert.equal(key('Gemini 4 Argon', 'high').frontier, false, '更贵且更弱的方案不算同价最强');
  assert.equal(plans.some(plan => plan.name === 'Muse Wonder Full'), false, '未公布成本的方案不参与性价比');
  assert.ok(plans.every((plan, index) => index === 0 || plans[index - 1].index >= plan.index));
});

test('AA 数据：括号里的思考强度与版本号分开，同名多档合并；名称归一后对上模型目录，缺失的新模型补记录', () => {
  assert.deepEqual(parseAaName('Claude Opus 5.5 (Max, Default Fallback)'), { name: 'Claude Opus 5.5', effort: 'max' });
  assert.deepEqual(parseAaName('GPT-6 Luna (Non-reasoning)'), { name: 'GPT-6 Luna', effort: 'none' });
  assert.deepEqual(parseAaName('Hy3-preview (Reasoning)'), { name: 'Hy3-preview', effort: null });
  assert.deepEqual(parseAaName('Qwen3.8 Max (0902)'), { name: 'Qwen3.8 Max (0902)', effort: null }, '版本号不是思考强度');
  const row = (name, creator, index, cost, release = '2026-09-01') => ({ name, model_creator: { name: creator }, release_date: release, evaluations: { artificial_analysis_intelligence_index: index }, artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: cost } } });
  const groups = groupAaModels([row('Claude Opus 5.5 (High, Default Fallback)', 'Anthropic', 53.6, 1.8225), row('Claude Opus 5.5 (Max, Default Fallback)', 'Anthropic', 57.6, 5.982), row('Llama X', 'Unknown Lab', 60, 1), row('Grok 4.7 (High)', 'SpaceXAI', 46.3, null), row('No Score', 'OpenAI', null, 1)]);
  assert.deepEqual(groups.map(group => [group.vendorId, group.name, group.levels.map(level => level[0])]), [['anthropic', 'Claude Opus 5.5', ['max', 'high']], ['xai', 'Grok 4.7', ['high']]], '名单外厂商和没有指数的行不收，档位按强度排序');
  assert.equal(worldNameKey('openai/gpt-6.1-sol'), worldNameKey('GPT-6.1 Sol'));
  const entries = [{ vendorId: 'openai', name: 'GPT-6.1 Sol', key: worldNameKey('GPT-6.1 Sol'), released: '2026-09-29', efforts: [] }, { vendorId: 'google', name: 'Gemini 9', key: 'gemini-9', released: '2026-10-01', efforts: [] }, { vendorId: 'google', name: 'Gemini 1', key: 'gemini-1', released: '2024-01-01', efforts: [] }];
  const { matched, missing } = matchWorldIndex([{ id: 'openai/gpt-6.1-sol', vendorId: 'openai' }], entries);
  assert.equal(matched.get('openai/gpt-6.1-sol').name, 'GPT-6.1 Sol');
  assert.deepEqual(missing.map(entry => entry.id), ['google/gemini-9'], '目录里没有的一年内新模型补记录，老模型不补');
});

test('契约漂移、来源缺失、重复标识、恶意链接与异常规模拒收', () => {
  for (const mutate of [
    data => { data.schemaVersion = 1; }, data => { data.models[0].newField = true; },
    data => { data.models[0].provenance.name = 'missing'; }, data => { data.models[1].id = data.models[0].id; },
    data => { data.models[0].vendorId = 'missing'; }, data => { data.models[0].releaseDate = '2026-02-31'; },
    data => { data.models[0].scores[0].sourceUrl = 'javascript:alert(1)'; },
    data => { data.benchmarks[0].unit = 'pct'; },
  ]) { const input = fixture(); mutate(input); assert.throws(() => acceptWorldSnapshot(JSON.stringify(input))); }
  assert.throws(() => acceptWorldSnapshot('x'.repeat(worldLimits.snapshotBytes + 1)), { code: 'WORLD_SCALE' });
  const oversized = fixture(); oversized.models = Array(worldLimits.models + 1).fill(oversized.models[0]);
  assert.throws(() => acceptWorldSnapshot(JSON.stringify(oversized)), { code: 'WORLD_SCALE' });
});

test('下载绑定同仓库实际提交、精确文件和 Git blob 完整性', async () => {
  const remote = publicFixture();
  assert.deepEqual(await fetchWorldSnapshot(remote.fetcher, new AbortController().signal), { raw: remote.raw, commit: remote.commit, blob: remote.blob });
  assert.equal(remote.calls.length, 3); assert.ok(remote.calls[1].endsWith(`data/models.json?ref=${remote.commit}`));
  for (const overrides of [{ truncated: true }, { statusCode: 429 }, { url: 'https://other.example' }, { body: { kind: 'text', content: 'not json' } }]) {
    await assert.rejects(fetchWorldSnapshot(publicFixture(fixture(), overrides).fetcher, new AbortController().signal), { code: 'WORLD_FETCH' });
  }
  const corrupt = publicFixture(); const original = corrupt.fetcher.fetch;
  corrupt.fetcher.fetch = async (...args) => { const response = await original(...args); if (args[0].url.includes('/git/blobs/')) { const body = JSON.parse(response.body.content); body.content = Buffer.from(corrupt.raw.replace('合成模型一', '合成模型三')).toString('base64'); response.body.content = JSON.stringify(body); } return response; };
  await assert.rejects(fetchWorldSnapshot(corrupt.fetcher, new AbortController().signal), { code: 'WORLD_FETCH' });
});

test('无账号离线读取、原子保存重载、搜索/厂商/能力/时间线/排序/详情/比较', async t => {
  const { world, calls, root } = await instance(t);
  assert.equal((await world.execute({ action: 'status' })).available, false); assert.equal(calls.length, 0);
  await world.execute({ action: 'refresh' }); assert.equal(calls.length, 3);
  assert.equal((await world.execute({ action: 'ranking', league: 'overall' })).total, 0, '评测不足的模型不进榜');
  assert.equal((await world.execute({ action: 'list', query: '合成厂商', capability: 'reasoning', limit: 1 })).models.length, 1);
  assert.equal((await world.execute({ action: 'list', capability: 'toolCall' })).total, 0);
  assert.equal((await world.execute({ action: 'list', vendorId: 'missing' })).total, 0);
  assert.equal((await world.execute({ action: 'detail', id: 'vendor/one' })).model.id, 'vendor/one');
  assert.equal((await world.execute({ action: 'compare', ids: ['vendor/one', 'vendor/two'] })).models.length, 2);
  assert.equal((await world.execute({ action: 'timeline' })).models[0].releaseDate, '2026-09');
  await assert.rejects(world.execute({ action: 'compare', ids: ['vendor/one', 'vendor/one'] }), { code: 'WORLD_INPUT' });
  const offline = new ModelWorld({ root, fetcher: { fetch() { throw new Error('读取不应联网'); } } }); t.after(() => offline.dispose());
  assert.equal((await offline.execute({ action: 'status' })).modelCount, 2);
  const status = await offline.execute({ action: 'status' }); status.vendors[0].name = '不得污染';
  assert.equal((await offline.execute({ action: 'status' })).vendors[0].name, 'Vendor');
  assert.equal(calls.length, 3); assert.deepEqual(await fs.readdir(root), ['snapshot.json']);
});

test('网络失联、契约变化保留当前与磁盘旧数据，恢复仍从显式刷新入口', async t => {
  const { world, root } = await instance(t); await world.execute({ action: 'refresh' });
  const prior = await fs.readFile(path.join(root, 'snapshot.json'), 'utf8');
  world.fetcher = { fetch() { throw new Error('离线'); } };
  await assert.rejects(world.execute({ action: 'refresh' }), /离线/);
  assert.equal((await world.execute({ action: 'status' })).modelCount, 2);
  const input = fixture(); input.models[0].capabilities.newFlag = true; world.fetcher = publicFixture(input).fetcher;
  await assert.rejects(world.execute({ action: 'refresh' }), { code: 'WORLD_SCHEMA' });
  assert.equal(await fs.readFile(path.join(root, 'snapshot.json'), 'utf8'), prior);
  world.fetcher = publicFixture().fetcher; assert.equal((await world.execute({ action: 'refresh' })).lastRefresh.status, 'ok');
});

test('并发刷新拒收；真实取消结束等待，迟到下载不提交且清理 owner', async t => {
  const { world, root } = await instance(t); await world.execute({ action: 'status' });
  const started = Promise.withResolvers(), late = Promise.withResolvers();
  world.fetcher = { fetch() { started.resolve(); return late.promise; } };
  const abort = new AbortController(); const running = world.execute({ action: 'refresh' }, abort.signal);
  await started.promise;
  await assert.rejects(world.execute({ action: 'refresh' }), { code: 'WORLD_BUSY' });
  abort.abort(new Error('员工取消')); await assert.rejects(running, /员工取消/);
  late.resolve({ statusCode: 200, body: { kind: 'text', content: '{}' } });
  assert.equal((await world.execute({ action: 'status' })).lastRefresh.status, 'cancelled');
  assert.equal((await world.execute({ action: 'status' })).refreshing, false);
  assert.deepEqual(await fs.readdir(root), []);
});

test('写后读回失败恢复原快照；临时文件无残留', async t => {
  const { world, root } = await instance(t); await world.execute({ action: 'refresh' });
  const prior = await fs.readFile(path.join(root, 'snapshot.json'), 'utf8');
  let renamed = false, injected = false;
  world.fs = {
    ...fs,
    async rename(...args) { await fs.rename(...args); renamed = true; },
    async readFile(file, ...args) { if (renamed && !injected && file === world.file) { injected = true; return Buffer.from('{}'); } return fs.readFile(file, ...args); },
  };
  const changed = fixture(); changed.models[0].name = '更新模型'; world.fetcher = publicFixture(changed).fetcher;
  await assert.rejects(world.execute({ action: 'refresh' }), { code: 'WORLD_READBACK' });
  assert.equal(await fs.readFile(world.file, 'utf8'), prior);
  assert.equal((await world.execute({ action: 'detail', id: 'vendor/one' })).model.name, '合成模型一');
  assert.deepEqual(await fs.readdir(root), ['snapshot.json']);
});

test('损坏本地快照报告空态，显式刷新修复；路径拒绝符号链接', async t => {
  const { world, root } = await instance(t);
  await fs.writeFile(path.join(root, 'snapshot.json'), '{');
  assert.equal((await world.execute({ action: 'status' })).lastRefresh.code, 'WORLD_STORAGE');
  assert.equal((await world.execute({ action: 'refresh' })).available, true);
  const blocked = new ModelWorld({ root, fetcher: publicFixture().fetcher, fileSystem: { ...fs, async lstat() { return { isSymbolicLink: () => true, isDirectory: () => true }; } } }); t.after(() => blocked.dispose());
  await assert.rejects(blocked.execute({ action: 'refresh' }), { code: 'WORLD_PATH' });
});

test('Remote 输入拒绝任意地址、跨赛制、无限分页与比较滥用', () => {
  const contract = modelWorldContract(z);
  for (const value of [{ action: 'refresh', url: 'https://other.example' }, { action: 'ranking', league: 'other' }, { action: 'list', limit: 201 }, { action: 'compare', ids: ['one'] }]) assert.equal(contract.input.safeParse(value).success, false);
  assert.equal(contract.input.parse({ action: 'refresh' }).action, 'refresh');
  assert.equal(contract.host.invocations[0].cancellation.parameter, 'signal');
});

test('严格结果拒绝空成功、缺失元数据、缺模型与未知字段，空态保留完整结构', async t => {
  const contract = modelWorldContract(z), { world } = await instance(t);
  assert.equal(contract.result.safeParse({}).success, false);
  for (const action of ['list', 'timeline', 'ranking', 'detail', 'compare']) {
    const input = action === 'ranking' ? { action, league: 'overall' } : action === 'detail' ? { action, id: 'vendor/one' } : action === 'compare' ? { action, ids: ['vendor/one', 'vendor/two'] } : { action };
    const result = await world.execute(input);
    assert.equal(contract.result.safeParse(result).success, true); assert.equal(result.available, false);
    const missing = { ...result }; delete missing.generatedAt; assert.equal(contract.result.safeParse(missing).success, false);
    assert.equal(contract.result.safeParse({ ...result, invented: true }).success, false);
  }
  await world.execute({ action: 'refresh' });
  const detail = await world.execute({ action: 'detail', id: 'vendor/one' });
  assert.equal(contract.result.safeParse({ ...detail, model: null }).success, false);
  const list = await world.execute({ action: 'list' });
  assert.equal(contract.result.safeParse({ ...list, models: undefined }).success, false);
  assert.equal(contract.result.safeParse({ ...list, total: 0 }).success, false);
});

test('取消发生在替换前保留旧数据，提交后的取消仍完成权威 readback', async t => {
  const { world, root } = await instance(t); await world.execute({ action: 'refresh' });
  const before = await fs.readFile(world.file, 'utf8');
  const abort = new AbortController();
  world.fs = { ...fs, async writeFile(...args) { await fs.writeFile(...args); abort.abort(new Error('写临时文件后取消')); } };
  await assert.rejects(world.execute({ action: 'refresh' }, abort.signal), /写临时文件后取消/);
  assert.equal(await fs.readFile(world.file, 'utf8'), before); assert.deepEqual(await fs.readdir(root), ['snapshot.json']);
  const committed = new AbortController();
  world.fs = { ...fs, async rename(...args) { await fs.rename(...args); committed.abort(new Error('提交后取消')); } };
  assert.equal((await world.execute({ action: 'refresh' }, committed.signal)).lastRefresh.status, 'ok');
});

test('替换后的恢复失败明确未知接受，不伪报确定回滚', async t => {
  const { world } = await instance(t); await world.execute({ action: 'refresh' });
  let replaced = false;
  world.fs = {
    ...fs,
    async rename(...args) { if (replaced) throw new Error('恢复失败'); await fs.rename(...args); replaced = true; },
    async readFile(file, ...args) { if (replaced && file === world.file) return Buffer.from('{}'); return fs.readFile(file, ...args); },
  };
  await assert.rejects(world.execute({ action: 'refresh' }), { code: 'WORLD_STORAGE_UNKNOWN' });
  assert.equal((await world.execute({ action: 'status' })).lastRefresh.code, 'WORLD_STORAGE_UNKNOWN');
  assert.equal((await world.execute({ action: 'status' })).available, true);
});

test('原子替换后同时取消不掩盖 readback 失败和未知接受', async t => {
  for (const recoveryFails of [true, false]) {
    const { world } = await instance(t); await world.execute({ action: 'refresh' });
    const before = await fs.readFile(world.file, 'utf8');
    const cancel = new AbortController(); let replaced = false, failedReadback = false;
    world.fs = {
      ...fs,
      async rename(...args) {
        if (replaced && recoveryFails) throw new Error('恢复替换失败');
        await fs.rename(...args); replaced = true; cancel.abort(new Error('替换后员工取消'));
      },
      async readFile(file, ...args) {
        if (replaced && !failedReadback && file === world.file) { failedReadback = true; return Buffer.from('{}'); }
        return fs.readFile(file, ...args);
      },
    };
    const code = recoveryFails ? 'WORLD_STORAGE_UNKNOWN' : 'WORLD_READBACK';
    await assert.rejects(world.execute({ action: 'refresh' }, cancel.signal), { code });
    const status = await world.execute({ action: 'status' });
    assert.equal(status.lastRefresh.code, code); assert.equal(status.lastRefresh.status, 'error');
    assert.doesNotMatch(status.lastRefresh.message, /刷新已取消，保留原数据/);
    if (recoveryFails) assert.match(status.lastRefresh.message, /恢复结果未确认/);
    else assert.equal(await fs.readFile(world.file, 'utf8'), before);
  }
});

test('同 profile 第二实例争用零写入，不同 profile 独立提交，释放后可显式刷新', async t => {
  const { world: first, root } = await instance(t); await first.execute({ action: 'refresh' });
  const next = fixture(); next.models[0].name = '第二实例更新'; let writes = 0;
  const second = new ModelWorld({ root, fetcher: publicFixture(next).fetcher, fileSystem: { ...fs, async writeFile(...args) { writes++; return fs.writeFile(...args); } } });
  t.after(() => second.dispose()); await second.execute({ action: 'status' });
  const { world: separate } = await instance(t);
  const held = Promise.withResolvers(), release = Promise.withResolvers();
  first.fs = { ...fs, async writeFile(...args) { await fs.writeFile(...args); held.resolve(); await release.promise; } };
  const running = first.execute({ action: 'refresh' });
  try {
    await held.promise;
    await assert.rejects(second.execute({ action: 'refresh' }), /timed out waiting for the writer lock/);
    assert.equal(writes, 0);
    assert.equal((await separate.execute({ action: 'refresh' })).available, true);
    assert.equal((await fs.readFile(`${first.file}.lock`, 'utf8')).trim(), String(process.pid));
  } finally { release.resolve(); await running; }
  assert.equal((await second.execute({ action: 'refresh' })).available, true); assert.equal(writes, 1);
  assert.equal((await second.execute({ action: 'detail', id: 'vendor/one' })).model.name, '第二实例更新');
  assert.deepEqual(await fs.readdir(root), ['snapshot.json']);
});

test('持有恢复锁时其他实例零写入，失败恢复以磁盘最新成功快照为准', async t => {
  const { world: first, root } = await instance(t); await first.execute({ action: 'refresh' });
  const initial = await fs.readFile(first.file, 'utf8');
  const changed = fixture(); changed.models[0].name = '另实例已接纳模型'; let secondWrites = 0;
  const second = new ModelWorld({ root, fetcher: publicFixture(changed).fetcher, fileSystem: { ...fs, async writeFile(...args) { secondWrites++; return fs.writeFile(...args); } } });
  t.after(() => second.dispose()); await second.execute({ action: 'status' });
  const held = Promise.withResolvers(), release = Promise.withResolvers(); let renames = 0, injected = false;
  first.fs = {
    ...fs,
    async rename(...args) { await fs.rename(...args); renames++; },
    async readFile(file, ...args) {
      if (renames === 1 && !injected && file === first.file) { injected = true; held.resolve(); await release.promise; return Buffer.from('{}'); }
      return fs.readFile(file, ...args);
    },
  };
  const running = assert.rejects(first.execute({ action: 'refresh' }), { code: 'WORLD_READBACK' });
  try {
    await held.promise;
    await assert.rejects(second.execute({ action: 'refresh' }), /timed out waiting for the writer lock/);
    assert.equal(secondWrites, 0);
  } finally { release.resolve(); await running; }
  assert.equal(await fs.readFile(first.file, 'utf8'), initial);
  await second.execute({ action: 'refresh' }); const latest = await fs.readFile(first.file, 'utf8');
  // 第一实例的内存仍旧；第二次失败必须恢复锁内新读到的文件，而非内存旧快照。
  renames = 0; injected = false;
  await assert.rejects(first.execute({ action: 'refresh' }), { code: 'WORLD_READBACK' });
  assert.equal(await fs.readFile(first.file, 'utf8'), latest); assert.equal(secondWrites, 1);
  assert.deepEqual(await fs.readdir(root), ['snapshot.json']);
});
