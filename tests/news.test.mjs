import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Schedule from '@deepseek-ai/dsh-schedule';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools, { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { z } from 'zod';
import { dailyLearning } from '../features/cards/learning-cards.js';
import { newsContract, newsItemLimit, newsSubmitLimit } from '../features/cards/contract.js';
import { newsExcerpt, headlineBrief } from '../features/cards/news-evidence.js';
import * as NewsTool from '../features/cards/tool.js';
import { News, newsDomain, defaultNewsField, newsWindow, parseNewsFeed, newsUrl } from '../features/cards/news.js';

const source = { name: '测试源', url: 'https://example.com/feed', kind: 'primary', region: 'domestic' };
const signal = () => new AbortController().signal;
const item = (title = '新模型', time = 'Sun, 11 Oct 2026 12:00:00 +0000', url = 'https://example.com/one') => `<item><title>${title}</title><link>${url}</link><pubDate>${time}</pubDate><description>短摘要。</description></item>`;
const feed = entries => `<?xml version="1.0"?><rss version="2.0"><channel>${entries}</channel></rss>`;
const response = (xml, url = source.url) => ({ statusCode: 200, url, body: { kind: 'text', content: xml }, truncated: false });
const field = { name: '测试领域', focus: 'AI 模型与企业工作', enabled: true, sources: [source] };
const selection = (candidates, extra = {}) => ({ sourceIds: [candidates[0].id], category: 'model', label: 'official', title: '厂商发布新模型「Model-1」', link: candidates[0].url, brief: '发布了新模型。', relevance: '', eventKey: '主体发布新模型版本', ...extra });

async function harness(t, overrides = {}) {
  const ctx = new Context(), directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-news-'));
  new TypertRegistry(ctx);
  await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root: directory }); await ctx.plugin(StorageDomain, { backend: 'json' });
  const domain = await ctx.storageDomain.open(newsDomain);
  let now = Date.parse('2026-10-12T05:00:00Z'), tasks = [], cancelError;
  const dependencies = {
    now: () => now, identity: async id => id === 'news-session' || id === 'other-news' ? 'news' : 'knowledge',
    catalog: async () => ({ available: true, tasks, issues: [] }),
    pause: async input => { if (cancelError) throw cancelError; tasks = tasks.map(t => t.id === input.id ? { ...t, status: 'paused' } : t); },
    fetch: async url => response(feed(item()), url), ...overrides,
  };
  const news = new News(domain, dependencies);
  t.after(async () => { await news.dispose(); await ctx.fiber.dispose(); await rm(directory, { force: true, recursive: true }); });
  const manage = input => news.manage(input, signal());
  const run = (input, sessionId = 'news-session') => news.execute(input, { sessionId, signal: signal() });
  const enable = () => manage({ action: 'save', id: 'custom-one', expectedRevision: 0, field });
  return { ctx, news, domain, manage, run, enable, dependencies, setNow: value => { now = Date.parse(value); }, setTasks: value => { tasks = value; }, failCancel: error => { cancelError = error; } };
}

test('实际原生工具注册与模型schema只声明最多8条，不凑数且允许空结果', async t => {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
  await ctx.plugin(Tools);
  const fiber = await ctx.plugin({ inject: ['tools'], apply: NewsTool.apply });
  // 核对实际注册及发给模型的schema，不用自行拼出的工具描述代替消费者。
  const tool = ctx.tools.get('whalewing_news');
  const schema = ctx.tools.wireSchemas().schemas.find(value => value.name === 'whalewing_news');
  assert.equal(newsSubmitLimit, 8);
  assert.equal(schema.description, tool.description);
  assert.match(schema.description, new RegExp(`最多${newsSubmitLimit}个去重事件`));
  assert.match(schema.description, /不足按实际数量、不凑数/);
  assert.match(schema.description, /没有相关内容可提交空数组/);
  assert.doesNotMatch(schema.description, /8到15|已核来源/);
  const ordinary = selection([{ id: 'a'.repeat(64), url: 'https://example.com/item' }]);
  const headline = { sourceIds: ['b'.repeat(64)], category: 'research', label: 'headline' };
  const submit = value => ({ action: 'submit', receipt: 'receipt', items: [value] });
  assert.equal(schema.parameters.properties.items.items.oneOf.length, 2);
  for (const value of [ordinary, headline]) assert.deepEqual(validateJsonSchemaValue(schema.parameters, submit(value)), []);
  for (const key of ['title', 'brief', 'link', 'relevance', 'eventKey']) {
    assert.ok(validateJsonSchemaValue(schema.parameters, submit({ ...headline, [key]: ordinary[key] })).length, `原生 wire 拒收 headline 混入 ${key}`);
  }
  assert.ok(validateJsonSchemaValue(schema.parameters, submit({ ...ordinary, label: 'headline' })).length);
  assert.ok(validateJsonSchemaValue(schema.parameters, submit({ ...headline, label: 'official' })).length);
  await fiber.dispose();
  assert.equal(ctx.tools.get('whalewing_news'), undefined);
});

test('北京时间 08:00 半开窗口、晚启动和严格发布时间', () => {
  assert.equal(newsWindow(Date.parse('2026-10-12T07:59:59+08:00')).cutoff, '2026-10-11T00:00:00.000Z');
  const window = newsWindow(Date.parse('2026-10-12T08:00:00+08:00'));
  assert.equal(window.cutoff, '2026-10-12T00:00:00.000Z');
  assert.deepEqual(window, newsWindow(Date.parse('2026-10-12T23:00:00+08:00')));
  const entries = [
    item('前界', '2026-10-11T00:00:00Z', 'https://example.com/start'),
    item('后界', '2026-10-12T00:00:00Z', 'https://example.com/end'),
    item('无时区', '2026-10-11T12:00:00', 'https://example.com/unknown'),
    item('仅日期', '2026-10-11', 'https://example.com/date'),
    item('未来', '2026-10-13T00:00:00Z', 'https://example.com/future'),
  ].join('');
  assert.deepEqual(parseNewsFeed(feed(entries), source, window, '2026-10-12T00:00:00.000Z').map(c => c.title), ['前界']);
});

test('频道日期和榜单刷新不替代条目发布时间，缺日期及仅更新时间均跳过', () => {
  const window = newsWindow(Date.parse('2026-10-12T05:00:00Z'));
  const undated = '<item><title>无日期榜单项目</title><link>https://github.com/owner/repo</link></item>';
  for (const channelTag of ['pubDate', 'lastBuildDate', 'updated']) {
    const xml = feed(`<${channelTag}>2026-10-11T12:00:00Z</${channelTag}>${undated}${item('空日期', '', 'https://example.com/empty')}${item('过期', '2020-01-01T00:00:00Z', 'https://example.com/old')}${item('前界', window.start, 'https://example.com/start')}${item('后界', window.cutoff, 'https://example.com/end')}`);
    assert.deepEqual(parseNewsFeed(xml, source, window, window.cutoff).map(c => [c.title, c.publishedAt]), [['前界', window.start]], channelTag);
  }
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><updated>2026-10-11T12:00:00Z</updated><entry><title>仅更新</title><link href="https://example.com/updated"/><updated>2026-10-11T12:00:00Z</updated></entry><entry><title>明确发布</title><link href="https://example.com/published"/><published>2026-10-11T10:00:00Z</published></entry></feed>';
  assert.deepEqual(parseNewsFeed(atom, source, window, window.cutoff).map(c => [c.title, c.publishedAt]), [['明确发布', '2026-10-11T10:00:00.000Z']]);
});

test('RSS先过滤时间再限制，Atom链接/正文解析，拒绝DTD/坏XML', () => {
  const window = newsWindow(Date.parse('2026-10-12T05:00:00Z'));
  assert.equal(parseNewsFeed(feed(item('旧闻', '2020-01-01T00:00:00Z') + item('新闻', undefined, 'https://example.com/new')), source, window, window.cutoff, 1)[0].title, '新闻');
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>模型研究</title><link href="https://example.com/atom"/><published>2026-10-11T10:00:00+08:00</published><summary><![CDATA[<p>研究摘要</p>]]></summary></entry></feed>';
  const result = parseNewsFeed(atom, source, window, window.cutoff);
  assert.equal(result[0].excerpt, '研究摘要'); assert.equal(result[0].eventTime, null);
  assert.throws(() => parseNewsFeed('<!DOCTYPE rss><rss/>', source, window, window.cutoff), { code: 'NEWS_FEED' });
  assert.throws(() => parseNewsFeed('<rss><item></rss>', source, window, window.cutoff));
  assert.throws(() => parseNewsFeed('<html/>', source, window, window.cutoff), { code: 'NEWS_FEED' });
});

test('来源URL规范化并拒绝本机、凭据和协议越界', () => {
  assert.equal(newsUrl('https://example.com/a?utm_source=x&b=2&a=1#x'), 'https://example.com/a?a=1&b=2');
  for (const url of ['http://example.com/a', 'https://127.0.0.1/a', 'https://[::1]/', 'https://localhost/x', 'https://host.local/x', 'https://user:pass@example.com']) assert.throws(() => newsUrl(url), { code: 'NEWS_URL' });
});

test('默认启用、读取不访问网络，启用领域生成唯一可信08:00计划', async t => {
  const h = await harness(t, { fetch: async () => { throw new Error('禁止读取配置时访问网络'); } });
  const result = await h.manage({ action: 'list' });
  assert.equal(result.fields.length, 1); assert.equal(result.fields[0].enabled, true);
  assert.ok(result.defaults.sources.some(s => s.region === 'domestic')); assert.ok(result.defaults.sources.some(s => s.region === 'overseas'));
  assert.equal(result.dependencies.scheduleAvailable, true);
  await h.enable();
  const spec = await h.news.scheduleSpec('news-session', signal());
  assert.deepEqual(spec.daily, { time: '08:00:00', time_zone: 'Asia/Shanghai' }); assert.match(spec.prompt, /whalewing_news fields/);
  await assert.rejects(h.news.scheduleSpec('ordinary', signal()), { code: 'NEWS_IDENTITY' });
});

test('原生storageDomain修订/CAS、完成日报及历史读回', async t => {
  const h = await harness(t); await h.enable();
  await assert.rejects(h.enable(), { code: 'CONFLICT' });
  const candidates = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  assert.equal(candidates.candidates.length, 1);
  const result = await h.run({ action: 'submit', receipt: candidates.receipt, items: [selection(candidates.candidates)] });
  assert.equal(result.completed, true); assert.equal(result.report.items[0].sources[0].url, 'https://example.com/one');
  assert.equal((await h.run({ action: 'submit', receipt: candidates.receipt, items: [] })).recovered, true);
  assert.deepEqual((await h.manage({ action: 'report', fieldId: 'custom-one', cutoff: candidates.cutoff })).report, result.report);
  assert.equal((await h.manage({ action: 'reports', fieldId: 'custom-one' })).reports.length, 1);
  const reopened = new News(h.domain, h.dependencies); t.after(() => reopened.dispose());
  assert.equal((await reopened.manage({ action: 'list' }, signal())).fields.find(f => f.id === 'custom-one').revision, 1);
  assert.equal((await reopened.execute({ action: 'candidates', fieldId: 'custom-one' }, { sessionId: 'news-session', signal: signal() })).completed, true);
});

test('跨会话、伪造来源、重复事件、过量提交及模型配置写全部拒收', async t => {
  const h = await harness(t); await h.enable();
  await assert.rejects(h.run({ action: 'candidates', fieldId: 'custom-one' }, 'ordinary'), { code: 'NEWS_IDENTITY' });
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [] }, 'other-news'), { code: 'NEWS_RECEIPT' });
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [selection(c.candidates, { sourceIds: ['invented'] })] }), { code: 'NEWS_SOURCE' });
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: Array.from({ length: 9 }, (_, i) => selection(c.candidates, { title: `厂商发布新模型「Model-${i}」`, eventKey: `主体发布新模型版本${i}` })) }), { code: 'NEWS_TOO_MANY' }, '每期最多 8 条');
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [selection(c.candidates), selection(c.candidates)] }), { code: 'NEWS_DUPLICATE' });
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: Array(16).fill(selection(c.candidates)) }));
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [selection(c.candidates, { link: 'https://invented.example.org/post' })] }), { code: 'NEWS_SOURCE' }, '链接须取自候选');
  await assert.rejects(h.run({ action: 'save', id: 'custom-one', field }));
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [], fieldId: 'another' }));
});

test('跨过08:00仍保存原期次；凭据到期拒收', async t => {
  const h = await harness(t); await h.enable(); h.setNow('2026-10-12T23:59:00Z');
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  h.setNow('2026-10-13T00:01:00Z');
  assert.equal((await h.run({ action: 'submit', receipt: c.receipt, items: [] })).report.cutoff, '2026-10-12T00:00:00.000Z');
  const next = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  h.setNow('2026-10-13T01:00:00Z');
  await assert.rejects(h.run({ action: 'submit', receipt: next.receipt, items: [] }), { code: 'NEWS_RECEIPT' });
});

test('领域修订/删除使旧凭据失效，删除保留历史', async t => {
  const h = await harness(t); await h.enable();
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  await h.manage({ action: 'save', id: 'custom-one', expectedRevision: 1, field: { ...field, focus: '新关注描述' } });
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [] }), { code: 'NEWS_RECEIPT' });
  const latest = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  await h.run({ action: 'submit', receipt: latest.receipt, items: [] });
  await h.manage({ action: 'remove', id: 'custom-one', expectedRevision: 2 });
  assert.equal((await h.manage({ action: 'reports', fieldId: 'custom-one' })).reports.length, 1);
  await assert.rejects(h.run({ action: 'candidates', fieldId: 'custom-one' }), { code: 'NEWS_DISABLED' });
});

test('最后领域先确认和原生暂停readback；暂停失败保留配置，迟到结果拒收', async t => {
  const h = await harness(t); await h.enable();
  await h.manage({ action: 'save', id: defaultNewsField.id, expectedRevision: 1, field: { ...field, enabled: false } });
  h.setTasks([{ id: 'schedule-one', sessionId: 'news-session', purpose: 'news', status: 'active' }]);
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  await assert.rejects(h.manage({ action: 'remove', id: 'custom-one', expectedRevision: 1 }), { code: 'NEWS_CANCEL_CONFIRM' });
  h.failCancel(new Error('取消接受未知'));
  await assert.rejects(h.manage({ action: 'remove', id: 'custom-one', expectedRevision: 1, confirmCancel: true }), /取消接受未知/);
  assert.equal(h.news.record('custom-one').enabled, true);
  h.failCancel(null); h.setTasks([]);
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [] }), { code: 'NEWS_CANCELLED' });
  await h.manage({ action: 'remove', id: 'custom-one', expectedRevision: 1, confirmCancel: true });
  assert.equal(h.news.record('custom-one').deleted, true);
});

test('部分来源失败可保存带缺口日报，全失败不能伪造空日报', async t => {
  const h = await harness(t, { fetch: async url => { if (url.includes('fail')) throw new Error('网络失败'); return response(feed(item()), url); } });
  await h.manage({ action: 'save', id: 'custom-one', expectedRevision: 0, field: { ...field, sources: [source, { ...source, url: 'https://example.com/fail' }] } });
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  assert.equal(c.sources[1].status, 'failed');
  assert.equal((await h.run({ action: 'submit', receipt: c.receipt, items: [] })).report.status, 'partial');
  await h.manage({ action: 'save', id: 'custom-two', expectedRevision: 0, field: { ...field, sources: [{ ...source, url: 'https://example.com/fail' }] } });
  await assert.rejects(h.run({ action: 'candidates', fieldId: 'custom-two' }), { code: 'NEWS_FETCH_FAILED' });
});

test('截断/跨源响应拒收，配置变化及时取消在途下载并释放运行锁', async t => {
  const h = await harness(t); await h.enable();
  h.news.fetch = async () => ({ ...response(feed(item())), truncated: true });
  await assert.rejects(h.run({ action: 'candidates', fieldId: 'custom-one' }), { code: 'NEWS_FETCH_FAILED' });
  h.news.fetch = async () => response(feed(item()), 'https://different.example.com/feed');
  await assert.rejects(h.run({ action: 'candidates', fieldId: 'custom-one' }), { code: 'NEWS_FETCH_FAILED' });
  let started; const ready = new Promise(resolve => { started = resolve; });
  h.news.fetch = (_url, signal) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }); started(); });
  const pending = h.run({ action: 'candidates', fieldId: 'custom-one' }); await ready;
  await h.manage({ action: 'save', id: 'custom-one', expectedRevision: 1, field: { ...field, focus: '采集中修改' } });
  await assert.rejects(pending, /配置已变化/); assert.equal(h.news.running.size, 0);
});

test('单写并发保护与保存未知按期次恢复不覆盖', async t => {
  const h = await harness(t); await h.enable();
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  const original = h.news.reports;
  h.news.reports = { get: key => original.get(key), put: async (key, value) => { await original.put(key, value); throw new Error('回执丢失'); } };
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [] }), /回执丢失/);
  const recovered = await h.run({ action: 'submit', receipt: c.receipt, items: [] });
  assert.equal(recovered.recovered, true);
  h.news.reports = original;
  const outcomes = await Promise.allSettled([h.manage({ action: 'save', id: 'custom-two', expectedRevision: 0, field }), h.manage({ action: 'save', id: 'custom-three', expectedRevision: 0, field })]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
});

test('候选所属原生轮次取消后，后续新signal也不能复用旧凭据', async t => {
  const h = await harness(t); await h.enable(); const controller = new AbortController();
  const c = await h.news.execute({ action: 'candidates', fieldId: 'custom-one' }, { sessionId: 'news-session', signal: controller.signal });
  controller.abort(new Error('员工取消生成'));
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [] }), { code: 'NEWS_RECEIPT' });
});

test('资讯owner生成的08:00:00被目标版原生Schedule真实接纳并取消读回', { timeout: 15000 }, async t => {
  const h = await harness(t); await h.enable();
  // 夹具没有已挂载 Agent；新版 Schedule 会查询 get 来排除子代理。
  h.ctx.provide('agents', { roots: () => [], get: () => undefined, withoutInitiator: fn => fn() });
  h.ctx.provide('sessions', { flush: async () => true });
  h.ctx.provide('tools', {}); h.ctx.provide('sessionPersistence', {});
  h.ctx.provide('sessionController', { resolveAgent: async sessionId => ({ agent: { session: { id: sessionId }, followup() { throw new Error('本测试不触发模型'); } } }) });
  const native = new Schedule(h.ctx, {});
  const spec = await h.news.scheduleSpec('news-session', signal());
  const accepted = await native.create('news-session', spec, signal());
  assert.equal(accepted.kind, 'daily'); assert.equal(accepted.time, '08:00:00.000'); assert.equal(accepted.timeZone, 'Asia/Shanghai');
  assert.equal((await native.catalog()).length, 1);
  assert.equal((await native.delete({ sessionId: 'news-session', id: accepted.id }, signal())).deleted, true);
  assert.equal((await native.catalog()).length, 0);
});

test('创建提交及原生回读期间领域写锁保留；模型伪造/不完整结果拒收', async t => {
  const h = await harness(t); await h.enable();
  await h.manage({ action: 'save', id: defaultNewsField.id, expectedRevision: 1, field: { ...field, enabled: false } });
  const started = Promise.withResolvers(), finish = Promise.withResolvers();
  const creating = h.news.withScheduleSpec('news-session', async spec => { started.resolve(spec); await finish.promise; return { task: '已持久化并回读' }; }, signal());
  assert.equal((await started.promise).daily.time, '08:00:00');
  await assert.rejects(h.manage({ action: 'remove', id: 'custom-one', expectedRevision: 1 }), { code: 'BUSY' });
  finish.resolve(); assert.deepEqual(await creating, { task: '已持久化并回读' });
  await h.manage({ action: 'remove', id: 'custom-one', expectedRevision: 1 });
  await assert.rejects(h.news.withScheduleSpec('news-session', () => { throw new Error('不应提交'); }, signal()), { code: 'NEWS_DISABLED' });
  const contract = newsContract(z);
  for (const response of [{}, { fields: [] }, { report: {} }, { reports: [] }, { field: {} }]) assert.equal(contract.result.safeParse(response).success, false);
  for (const response of [{}, { completed: true }, { completed: true, report: { items: [] } }, { receipt: 'forged', candidates: [] }]) assert.equal(contract.executionResult.safeParse(response).success, false);
});

test('原生暂停成立而领域存储失败，保持真实可恢复的启用配置', async t => {
  const h = await harness(t); await h.enable();
  await h.manage({ action: 'save', id: defaultNewsField.id, expectedRevision: 1, field: { ...field, enabled: false } });
  h.setTasks([{ id: 'schedule-one', sessionId: 'news-session', purpose: 'news', status: 'active' }]);
  const original = h.news.fields;
  h.news.fields = { get: id => original.get(id), keys: () => original.keys(), update: async () => { throw new Error('保存失败'); } };
  await assert.rejects(h.manage({ action: 'remove', id: 'custom-one', expectedRevision: 1, confirmCancel: true }), /保存失败/);
  assert.equal(h.news.record('custom-one').enabled, true); assert.equal((await h.dependencies.catalog()).tasks[0].status, 'paused');
  h.news.fields = original;
  await h.manage({ action: 'remove', id: 'custom-one', expectedRevision: 1, confirmCancel: true });
});

test('删除后重载仍从日报发现历史领域，多期去重且无历史删除不制造入口', async t => {
  const h = await harness(t); await h.enable();
  assert.deepEqual((await h.manage({ action: 'list' })).historyFields, []);
  const first = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  await h.run({ action: 'submit', receipt: first.receipt, items: [] });
  h.setNow('2026-10-13T05:00:00Z');
  const second = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  await h.run({ action: 'submit', receipt: second.receipt, items: [] });
  assert.deepEqual((await h.manage({ action: 'list' })).historyFields, [{ id: 'custom-one', name: field.name, deleted: false }]);
  await h.manage({ action: 'remove', id: 'custom-one', expectedRevision: 1 });
  await h.manage({ action: 'save', id: 'no-history', expectedRevision: 0, field: { ...field, enabled: false } });
  await h.manage({ action: 'remove', id: 'no-history', expectedRevision: 1 });
  const reloaded = new News(h.domain, h.dependencies); t.after(() => reloaded.dispose());
  const list = await reloaded.manage({ action: 'list' }, signal());
  assert.equal(list.fields.some(f => f.id === 'custom-one'), false);
  assert.deepEqual(list.historyFields, [{ id: 'custom-one', name: field.name, deleted: true }]);
  const history = await reloaded.manage({ action: 'reports', fieldId: list.historyFields[0].id }, signal());
  assert.equal(history.reports.length, 2);
  const read = await reloaded.manage({ action: 'report', fieldId: list.historyFields[0].id, cutoff: first.cutoff }, signal());
  assert.equal(read.report.cutoff, first.cutoff);
  const { historyFields: _historyFields, ...incomplete } = list;
  assert.equal(newsContract(z).result.safeParse(incomplete).success, false);
});

test('删除领域恢复按新增活动身份检查容量；拒收保留历史且释放容量后正常恢复', async t => {
  const h = await harness(t); await h.enable();
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  await h.run({ action: 'submit', receipt: c.receipt, items: [] });
  await h.manage({ action: 'remove', id: 'custom-one', expectedRevision: 1 });
  // 20个自定义领域另加受保护的系统AI；删除记录保留身份，不占活动名额。
  for (let i = 0; i < 20; i++) await h.manage({ action: 'save', id: `capacity-${i}`, expectedRevision: 0, field: { ...field, enabled: false } });
  assert.equal((await h.manage({ action: 'list' })).fields.length, 21);
  await assert.rejects(h.manage({ action: 'save', id: 'custom-one', expectedRevision: 2, field }), { code: 'NEWS_LIMIT' });
  assert.equal(h.news.record('custom-one').deleted, true);
  assert.equal(h.news.record('custom-one').revision, 2);
  const full = await h.manage({ action: 'list' });
  assert.equal(full.fields.length, 21);
  assert.deepEqual(full.historyFields, [{ id: 'custom-one', name: field.name, deleted: true }]);
  assert.equal((await h.manage({ action: 'report', fieldId: 'custom-one', cutoff: c.cutoff })).report.cutoff, c.cutoff);
  await h.manage({ action: 'save', id: 'capacity-1', expectedRevision: 1, field: { ...field, name: '在容量内编辑', enabled: false } });
  await h.manage({ action: 'remove', id: 'capacity-0', expectedRevision: 1 });
  const restored = await h.manage({ action: 'save', id: 'custom-one', expectedRevision: 2, field });
  assert.equal(restored.field.deleted, false); assert.equal(restored.field.revision, 3);
  const after = await h.manage({ action: 'list' });
  assert.equal(after.fields.length, 21);
  assert.deepEqual(after.historyFields, [{ id: 'custom-one', name: field.name, deleted: false }]);
});

test('提交等待原生目录期间候选取消或凭据过期，落盘前再次拒收', async t => {
  for (const kind of ['cancel', 'expire']) await t.test(kind, async t => {
    const h = await harness(t); await h.enable(); const controller = new AbortController();
    const c = await h.news.execute({ action: 'candidates', fieldId: 'custom-one' }, { sessionId: 'news-session', signal: controller.signal });
    const entered = Promise.withResolvers(), release = Promise.withResolvers();
    h.dependencies.catalog = async () => { entered.resolve(); await release.promise; return { available: true, tasks: [], issues: [] }; };
    const pending = h.run({ action: 'submit', receipt: c.receipt, items: [] });
    await entered.promise;
    if (kind === 'cancel') controller.abort(new Error('员工取消原生成轮次'));
    else h.setNow('2026-10-12T05:31:00Z');
    release.resolve();
    await assert.rejects(pending, { code: 'NEWS_RECEIPT' });
    assert.equal([...h.news.reports.keys()].length, 0);
    assert.equal(h.news.writing, false);
  });
});

test('发布时间拒绝无效日历、时钟、时区值，禁止Date.parse跨月修正', () => {
  const window = { start: '2026-10-01T00:00:00.000Z', cutoff: '2026-10-02T00:00:00.000Z' };
  for (const time of ['2026-09-31T12:00:00Z', 'Thu, 31 Sep 2026 12:00:00 +0000', '2026-09-30T24:00:00Z', '2026-10-01T12:60:00Z', '2026-10-01T12:00:60Z', '2026-10-01T12:00:00+0060', '2026-10-01T12:00:00+2400', 'Thu, 01 Oct 2026 12:00:00 +0060', '2026-10-01T12:00:00-00:00', 'Thu, 01 Oct 2026 12:00:00 -0000', 'Fri, 01 Oct 2026 12:00:00 GMT']) {
    assert.equal(parseNewsFeed(feed(item('无效日期', time)), source, window, window.cutoff).length, 0, time);
  }
});

test('严格日期保留真实RSS格式、闰年/月末和时区跨窗边界', () => {
  const parse = (time, start, cutoff) => parseNewsFeed(feed(item('有效日期', time)), source, { start, cutoff }, cutoff);
  for (const time of ['Thu, 01 Oct 2026 12:00:00 +0000', '01 Oct 2026 12:00 GMT', 'Thu, 01 Oct 2026 20:00:00 +0800', 'Thu, 01 Oct 2026 12:00:00 UTC', '2026-10-01T12:00:00Z', '2026-10-01T20:00+08:00', '2026-10-01T20:00:00+0800']) {
    assert.equal(parse(time, '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z')[0].publishedAt, '2026-10-01T12:00:00.000Z', time);
  }
  assert.equal(parse('2024-02-29T23:59:59.123456Z', '2024-02-29T00:00:00.000Z', '2024-03-01T00:00:00.000Z')[0].publishedAt, '2024-02-29T23:59:59.123Z');
  assert.equal(parse('2026-02-29T12:00:00Z', '2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z').length, 0);
  assert.equal(parse('1900-02-29T12:00:00Z', '1900-03-01T00:00:00.000Z', '1900-03-02T00:00:00.000Z').length, 0);
  assert.equal(parse('2000-02-29T12:00:00Z', '2000-02-29T00:00:00.000Z', '2000-03-01T00:00:00.000Z').length, 1);
  assert.equal(parse('2026-09-30T23:59:59Z', '2026-09-30T00:00:00.000Z', '2026-10-01T00:00:00.000Z').length, 1);
  for (const time of ['2026-10-01T08:00:00+08:00', 'Thu, 01 Oct 2026 08:00:00 +0800', '2026-09-30T19:00:00-05:00']) {
    assert.equal(parse(time, '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z')[0].publishedAt, '2026-10-01T00:00:00.000Z', time);
    assert.equal(parse(time, '2026-09-30T00:00:00.000Z', '2026-10-01T00:00:00.000Z').length, 0, time);
  }
});


test('旧v1领域升级只恢复固定AI身份一次，保留关注来源与已完成历史', async t => {
  const h = await harness(t);
  await h.domain.table('fields').put(defaultNewsField.id, { ...defaultNewsField, deleted: true, enabled: false, revision: 4, focus: '保留的关注内容', sources: [source] });
  const result = await h.manage({ action: 'list' });
  const ai = result.fields.find(f => f.id === defaultNewsField.id);
  assert.equal(ai.enabled, true); assert.equal(ai.revision, 5); assert.equal(ai.focus, '保留的关注内容'); assert.deepEqual(ai.sources, [source]);
  await assert.rejects(h.manage({ action: 'remove', id: ai.id, expectedRevision: 5 }), { code: 'NEWS_PROTECTED' });
  await h.manage({ action: 'save', id: ai.id, expectedRevision: 5, field: { name: ai.name, focus: ai.focus, sources: ai.sources, enabled: false } });
  const reopened = new News(h.domain, h.dependencies); t.after(() => reopened.dispose());
  assert.equal((await reopened.manage({ action: 'list' }, signal())).fields[0].enabled, false);
  await h.manage({ action: 'save', id: 'same-name', expectedRevision: 0, field: { ...field, name: ai.name } });
  await h.manage({ action: 'remove', id: 'same-name', expectedRevision: 1 });
});

test('知识卡片首页直接返回最近已完成期次及北京时间每天三类学习内容', async t => {
  const h = await harness(t); await h.enable();
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  await h.run({ action: 'submit', receipt: c.receipt, items: [selection(c.candidates)] });
  h.setNow('2026-10-14T05:00:00Z');
  const home = await h.manage({ action: 'home' });
  assert.equal(home.reports[0].cutoff, c.cutoff); assert.equal(home.learning.date, '2026-10-14');
  assert.deepEqual(home.learning.cards.map(c => c.category), ['管理', '经济', 'AI 工具技巧']);
  assert.ok(home.learning.cards.every(c => c.review && c.source.url.startsWith('https://')));
  assert.equal(Object.hasOwn(home, 'errors'), false); assert.equal(Object.hasOwn(home, 'fields'), false);
});

test('新增lifecycle表直接重开旧v1域，原字段与日报保持可读', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-news-v1-')), ctx = new Context();
  new TypertRegistry(ctx); await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root: directory }); await ctx.plugin(StorageDomain, { backend: 'json' });
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  const { lifecycle: _, ...tables } = newsDomain.tables;
  const old = await ctx.storageDomain.open({ ...newsDomain, tables });
  await old.table('fields').put(defaultNewsField.id, { ...defaultNewsField, enabled: false, revision: 2 });
  await old.close();
  const domain = await ctx.storageDomain.open(newsDomain), owner = new News(domain, { identity: async () => 'news', catalog: async () => ({ tasks: [], available: true, issues: [] }) });
  t.after(() => owner.dispose());
  await owner.initialize();
  assert.equal(owner.record(defaultNewsField.id).revision, 3); assert.equal(domain.table('lifecycle').get('ai-protected').aiProtected, true);
});


test('学习轮换按北京时间零点切换，同一天稳定且第二轮标复习', () => {
  const before = dailyLearning(Date.parse('2026-10-12T15:59:59Z'));
  const after = dailyLearning(Date.parse('2026-10-12T16:00:00Z'));
  assert.equal(before.date, '2026-10-12'); assert.equal(after.date, '2026-10-13');
  assert.notDeepEqual(before.cards.map(c => c.id), after.cards.map(c => c.id));
  assert.deepEqual(before, dailyLearning(Date.parse('2026-10-12T03:00:00Z')));
  const review = dailyLearning(Date.parse('2026-10-14T00:00:00Z'));
  assert.deepEqual(review.cards.map(c => c.id), before.cards.map(c => c.id)); assert.ok(review.cards.every(c => c.review));
});


test('AI迁移标记落盘失败可重试同身份，已保存自定义来源不丢失', async t => {
  const h = await harness(t), original = h.news.lifecycleTable;
  await h.domain.table('fields').put(defaultNewsField.id, { ...defaultNewsField, revision: 2, enabled: false, deleted: true, focus: '保留关注', sources: [source] });
  h.news.lifecycleTable = { get: key => original.get(key), put: async () => { throw new Error('迁移标记落盘失败'); } };
  await assert.rejects(h.manage({ action: 'list' }), /迁移标记落盘失败/);
  assert.equal(original.get('ai-protected'), undefined);
  h.news.lifecycleTable = original;
  const list = await h.manage({ action: 'list' });
  assert.equal(list.fields.length, 1); assert.equal(list.fields[0].focus, '保留关注'); assert.deepEqual(list.fields[0].sources, [source]);
  assert.equal(original.get('ai-protected').aiProtected, true);
});


test('旧v1满20个自定义领域并已删除AI时，升级完整保留21领域及全部日报，所有消费者可读', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-news-full-v1-')), ctx = new Context();
  new TypertRegistry(ctx); await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root: directory }); await ctx.plugin(StorageDomain, { backend: 'json' });
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  const { lifecycle: _, ...tables } = newsDomain.tables;
  const old = await ctx.storageDomain.open({ ...newsDomain, tables });
  const originalFields = Array.from({ length: 20 }, (_, index) => ({ ...field, id: `full-${index}`, revision: 2, deleted: false }));
  originalFields.push({ ...defaultNewsField, deleted: true, enabled: false, revision: 3, focus: '原AI关注描述', sources: [source] });
  const originalReports = originalFields.map(record => ({ fieldId: record.id, fieldName: record.name, fieldRevision: 2, start: '2026-10-11T00:00:00.000Z', cutoff: '2026-10-12T00:00:00.000Z', sessionId: 'news-session', completedAt: '2026-10-12T01:00:00.000Z', items: [], sourceStatus: [{ ...source, status: 'ok', candidates: 0 }], status: 'empty', coverage: '此期订阅没有窗口内文章' }));
  for (const record of originalFields) await old.table('fields').put(record.id, record);
  for (const report of originalReports) await old.table('reports').put(`${report.fieldId}/${report.cutoff}`, report);
  await old.close();
  const domain = await ctx.storageDomain.open(newsDomain);
  const owner = new News(domain, { identity: async () => 'news', catalog: async () => ({ tasks: [], available: true, issues: [] }) });
  t.after(() => owner.dispose());
  const list = await owner.manage({ action: 'list' }, signal());
  assert.equal(list.fields.length, 21); assert.equal(list.limits.maxFields, 21); assert.equal(list.historyFields.length, 21);
  assert.deepEqual(domain.table('lifecycle').get('ai-protected'), { aiProtected: true });
  for (const original of originalFields.filter(f => f.id !== defaultNewsField.id)) assert.deepEqual(owner.record(original.id), original);
  const ai = owner.record(defaultNewsField.id);
  assert.equal(ai.enabled, true); assert.equal(ai.deleted, false); assert.equal(ai.focus, '原AI关注描述'); assert.deepEqual(ai.sources, [source]);
  for (const report of originalReports) assert.deepEqual((await owner.manage({ action: 'report', fieldId: report.fieldId, cutoff: report.cutoff }, signal())).report, report);
  assert.equal((await owner.manage({ action: 'home' }, signal())).reports.length, 21);
  assert.equal((await owner.execute({ action: 'fields' }, { sessionId: 'news-session', signal: signal() })).fields.length, 21);
  for (const record of list.fields) owner.errors.set(record.id, { code: 'NEWS_FETCH_FAILED', message: '此领域采集失败' });
  assert.equal(Object.keys((await owner.manage({ action: 'list' }, signal())).errors).length, 21);
  await assert.rejects(owner.manage({ action: 'save', id: 'overflow', expectedRevision: 0, field }, signal()), { code: 'NEWS_LIMIT' });
  assert.equal(owner.record('overflow'), undefined);
  await owner.manage({ action: 'save', id: 'full-0', expectedRevision: 2, field: { ...field, focus: '容量满时仍可编辑' } }, signal());
  assert.equal(owner.record('full-0').focus, '容量满时仍可编辑');
  assert.equal((await owner.manage({ action: 'list' }, signal())).fields.length, 21);
  assert.equal([...domain.table('reports').keys()].length, 21);
});

test('新版日报：正文链接作为可选来源，条目按分类排序', async t => {
  const decoder = 'https://media.example.com/feed';
  const body = '<p>Read <a href="https://www.anthropic.com/news/haiku">the post</a>, <a href="https://media.example.com/other">ours</a>, <a href="https://twitter.com/intent/tweet?u=1">share</a>.</p>';
  const xml = feed(`<item><title>Haiku 5.5</title><link>https://media.example.com/haiku</link><pubDate>Sun, 11 Oct 2026 12:00:00 +0000</pubDate><description><![CDATA[${body}]]></description></item>${item('开源项目', 'Sun, 11 Oct 2026 13:00:00 +0000', 'https://example.com/repo')}`);
  const h = await harness(t, { fetch: async url => response(xml, url) });
  await h.manage({ action: 'save', id: 'custom-one', expectedRevision: 0, field: { ...field, sources: [{ ...source, url: decoder, kind: 'media' }] } });
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  const haiku = c.candidates.find(x => x.title === 'Haiku 5.5'), repo = c.candidates.find(x => x.title === '开源项目');
  assert.deepEqual(haiku.links, ['https://www.anthropic.com/news/haiku'], '同站与分享链接不算来源');
  const originalItems = [
    { sourceIds: [repo.id], category: 'opensource', label: 'official', title: '研究员开源项目「Repo」', link: repo.url, brief: '一个开源项目。', relevance: '', eventKey: '开源 Repo' },
    { sourceIds: [haiku.id], category: 'model', label: 'official', title: 'Anthropic 发布小模型「Claude Haiku 5.5」', link: 'https://www.anthropic.com/news/haiku', brief: '新的小模型。', relevance: '', eventKey: 'Haiku 5.5 发布' },
  ];
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: originalItems }), { code: 'NEWS_EVIDENCE' }, '导航链接不证明发布主体、小模型或官方归因');
  assert.equal((await h.manage({ action: 'report', fieldId: 'custom-one', cutoff: c.cutoff })).report, null);
  assert.equal(haiku.excerpt, '');
  // 另建明确标注的合成正文；不改写原导航反例或放宽原外链、排序断言。
  const supported = xml.replace(body, 'Anthropic 发布小模型 Claude Haiku 5.5。' + body).replace('短摘要。', '研究员开源项目 Repo。');
  h.news.fetch = async url => response(supported, url);
  const supportedCandidates = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  const result = await h.run({ action: 'submit', receipt: supportedCandidates.receipt, items: originalItems.map(value => ({ ...value, label: 'media' })) });
  assert.deepEqual(result.report.items.map(x => x.label), ['media', 'media'], '外链不自动将媒体候选升级成官方发布');
  assert.deepEqual(result.report.items.map(x => x.category), ['model', 'opensource'], '模型大事排在前面');
  assert.equal(result.report.items[0].link, 'https://www.anthropic.com/news/haiku', '链接可取正文里的官方地址');
});

test('新提交8条与旧日报15条只读兼容分别守住边界', async t => {
  const xml = feed(Array.from({ length: newsSubmitLimit }, (_, i) => item(`条目${i}`, undefined, `https://example.com/item-${i}`)).join(''));
  const h = await harness(t, { fetch: async url => response(xml, url) }); await h.enable();
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  const result = await h.run({ action: 'submit', receipt: c.receipt, items: c.candidates.map((candidate, i) => selection([candidate], { title: `厂商发布「Model-${i}」`, eventKey: `发布${i}` })) });
  assert.equal(result.report.items.length, newsSubmitLimit);
  // 原生存储中已有的15条日报保持原样；不通过放宽新提交来兼容历史。
  assert.equal(newsItemLimit, 15);
  const legacy = { ...result.report, items: Array.from({ length: newsItemLimit }, (_, i) => ({ title: `历史条目${i}`, summary: '旧格式摘要', importance: '旧格式影响说明', relevance: '旧格式关联', workImpact: '旧格式推断', eventKey: `历史${i}`, sources: result.report.items[i % newsSubmitLimit].sources })) };
  await h.domain.table('reports').put(`custom-one/${c.cutoff}`, legacy);
  const reloaded = new News(h.domain, h.dependencies); t.after(() => reloaded.dispose());
  assert.deepEqual((await reloaded.manage({ action: 'report', fieldId: 'custom-one', cutoff: c.cutoff }, signal())).report, legacy);
});

test('内置 AI 领域：员工没改过的旧默认来源升级为新版，改过的保持原样', async t => {
  const legacy = ['https://www.infoq.cn/feed', 'https://www.oschina.net/news/rss', 'https://blog.google/innovation-and-ai/technology/ai/rss/', 'https://huggingface.co/blog/feed.xml', 'https://openai.com/news/rss.xml'];
  const old = { ...structuredClone(defaultNewsField), revision: 3, sources: legacy.map(url => ({ name: url.slice(8, 20), url, kind: 'media', region: 'overseas' })) };
  for (const [sources, upgraded] of [[old.sources, true], [old.sources.slice(0, 2), false]]) {
    const h = await harness(t);
    await h.domain.table('fields').put(defaultNewsField.id, { ...old, sources });
    await h.domain.table('lifecycle').put('ai-protected', { aiProtected: true });
    const ai = (await h.manage({ action: 'list' })).fields.find(f => f.id === defaultNewsField.id);
    assert.equal(ai.sources.length, upgraded ? defaultNewsField.sources.length : 2);
    if (upgraded) assert.equal(ai.revision, 4);
  }
});


test('正文逐槽选择：跳过导航、链接壳及原标题，不按长度丢弃有效短正文', () => {
  const title = '模型 X';
  for (const shell of ['点击查看原文>', '点击查看原文&gt;', '点击查看原文&#62;', '<p><a href="https://example.com/post">阅读全文</a></p>', '<a href="https://example.com/post">模型 X</a>', '模型 X', '<p>Read <a href="https://example.com/post">the post</a>.</p>', '<a href="https://example.com/post">Arbitrary destination text</a>']) {
    assert.equal(newsExcerpt(title, [shell]), '', shell);
    assert.equal(newsExcerpt(title, [shell, '<p>已开源。</p>']), '已开源。', '后槽有效短正文不被前槽挡住');
  }
  assert.equal(newsExcerpt(title, ['文章讨论了“查看原文”按钮的实现。']), '文章讨论了“查看原文”按钮的实现。', '不使用关键词黑名单');
  assert.equal(newsExcerpt(title, ['<p>模型 X 已开源，见<a href="https://example.com/post">代码</a>。</p>']), '模型 X 已开源，见 代码 。');
  const rss = feed('<item><title>模型 X</title><link>https://example.com/one</link><pubDate>2026-10-11T12:00:00Z</pubDate><description>点击查看原文&gt;</description><content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"><![CDATA[<p>已开源。</p>]]></content:encoded></item>');
  const window = newsWindow(Date.parse('2026-10-12T05:00:00Z'));
  assert.equal(parseNewsFeed(rss, source, window, window.cutoff)[0].excerpt, '已开源。');
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>模型 X</title><link href="https://example.com/one"/><published>2026-10-11T12:00:00Z</published><summary type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><a href="https://example.com/post">任意链接标题</a></div></summary><content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>已开源。</p></div></content></entry></feed>';
  assert.equal(parseNewsFeed(atom, source, window, window.cutoff)[0].excerpt, '已开源。');
});

test('headline 严格输入只允许三个字段和一个来源，普通标题仍保持120字上限', () => {
  const contract = newsContract(z), headline = { sourceIds: ['a'.repeat(64)], category: 'model', label: 'headline' };
  const submit = value => ({ action: 'submit', receipt: 'receipt', items: [value] });
  assert.deepEqual(contract.execute.parse(submit(headline)).items[0], headline);
  for (const key of ['title', 'brief', 'link', 'relevance', 'eventKey']) assert.throws(() => contract.execute.parse(submit({ ...headline, [key]: '模型补写' })));
  for (const sourceIds of [[], ['a'.repeat(64), 'b'.repeat(64)]]) assert.throws(() => contract.execute.parse(submit({ ...headline, sourceIds })));
  const ordinary = selection([{ id: 'a'.repeat(64), url: 'https://example.com/one' }]);
  assert.equal(contract.execute.parse(submit({ ...ordinary, title: '字'.repeat(120) })).items[0].title.length, 120);
  assert.throws(() => contract.execute.parse(submit({ ...ordinary, title: '字'.repeat(121) })));
});

test('证据按每条自身来源核对，headline和普通分支反向拒收后可用同receipt重试', async t => {
  const title = 'Source headline ' + 'x'.repeat(224);
  const xml = feed(item(title, undefined, 'https://example.com/title').replace('短摘要。', '点击查看原文&gt;') + item('正文模型', undefined, 'https://example.com/body').replace('短摘要。', '厂商发布了 Model-1。'));
  const h = await harness(t, { fetch: async url => response(xml, url) }); await h.enable();
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  const noBody = c.candidates[0], body = c.candidates[1];
  assert.equal(noBody.title.length, 240); assert.equal(noBody.excerpt, '');
  const headline = { sourceIds: [noBody.id], category: 'research', label: 'headline' };
  const ordinary = selection([body]);
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [ordinary, selection([noBody], { title: '凭空生成标题', eventKey: '无正文事件' })] }), { code: 'NEWS_EVIDENCE' });
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [{ ...headline, sourceIds: [body.id] }] }), { code: 'NEWS_EVIDENCE' });
  assert.equal([...h.domain.table('reports').keys()].length, 0);
  const report = (await h.run({ action: 'submit', receipt: c.receipt, items: [headline, ordinary] })).report;
  assert.deepEqual(report.items.map(item => item.category), ['model', 'research']);
  assert.deepEqual(report.items[1], { category: 'research', label: 'headline', title, link: noBody.url, brief: headlineBrief, relevance: '', eventKey: `headline:${noBody.id}`, sources: [noBody] });
  assert.deepEqual((await h.manage({ action: 'report', fieldId: 'custom-one', cutoff: c.cutoff })).report, report);
  const restored = new News(h.domain, h.dependencies); t.after(() => restored.dispose());
  assert.deepEqual((await restored.manage({ action: 'home' }, signal())).reports[0], report);
});

test('普通条目可以合并同事件的标题来源与有效正文，来源和链接不自动升级标签', async t => {
  const xml = feed(item('模型 X', undefined, 'https://example.com/title').replace('短摘要。', '') + item('模型 X 已开源', undefined, 'https://example.com/body').replace('短摘要。', '报道：模型 X 已开源。'));
  const h = await harness(t, { fetch: async url => response(xml, url) }); await h.enable();
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  const submitted = selection(c.candidates, { sourceIds: c.candidates.map(candidate => candidate.id), label: 'media', title: '模型「X」已开源', brief: '报道指出模型 X 已开源。', eventKey: 'X 开源' });
  const report = (await h.run({ action: 'submit', receipt: c.receipt, items: [submitted] })).report;
  assert.equal(report.items[0].label, 'media'); assert.equal(report.items[0].sources.length, 2); assert.equal(report.items[0].link, c.candidates[0].url);
});

test('headline共用来源身份、来源单次使用、标题/事件去重及八条上限', async t => {
  const xml = feed(Array.from({ length: 9 }, (_, i) => item(i === 1 ? '原标题0' : `原标题${i}`, undefined, `https://example.com/title-${i}`).replace('短摘要。', '')).join('') + item('普通正文', undefined, 'https://example.com/body'));
  const h = await harness(t, { fetch: async url => response(xml, url) }); await h.enable();
  const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  const headline = index => ({ sourceIds: [c.candidates[index].id], category: 'research', label: 'headline' });
  const submit = items => h.run({ action: 'submit', receipt: c.receipt, items });
  await assert.rejects(submit([{ ...headline(0), sourceIds: ['f'.repeat(64)] }]), { code: 'NEWS_SOURCE' });
  await assert.rejects(submit([headline(0), headline(0)]), { code: 'NEWS_DUPLICATE' });
  await assert.rejects(submit([headline(0), headline(1)]), { code: 'NEWS_DUPLICATE' });
  await assert.rejects(submit([headline(0), selection([c.candidates[9]], { title: '原标题0' })]), { code: 'NEWS_DUPLICATE' });
  await assert.rejects(submit([headline(0), selection([c.candidates[9]], { eventKey: `headline:${c.candidates[0].id}` })]), { code: 'NEWS_DUPLICATE' });
  await assert.rejects(submit(Array.from({ length: 9 }, (_, i) => headline(i))), { code: 'NEWS_TOO_MANY' });
  assert.equal([...h.domain.table('reports').keys()].length, 0);
  assert.equal((await submit([0, 2, 3, 4, 5, 6, 7, 8].map(headline))).report.items.length, 8);
});

test('headline凭据取消及提交前过期仍拒收且不写报告', async t => {
  const h = await harness(t, { fetch: async url => response(feed(item().replace('短摘要。', '')), url) }); await h.enable();
  const controller = new AbortController();
  const c = await h.news.execute({ action: 'candidates', fieldId: 'custom-one' }, { sessionId: 'news-session', signal: controller.signal });
  const headline = candidate => ({ sourceIds: [candidate.id], category: 'model', label: 'headline' });
  controller.abort();
  await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [headline(c.candidates[0])] }), { code: 'NEWS_RECEIPT' });
  const retry = await h.run({ action: 'candidates', fieldId: 'custom-one' });
  h.dependencies.catalog = async () => { h.setNow('2026-10-12T06:00:00Z'); return { available: true, tasks: [], issues: [] }; };
  await assert.rejects(h.run({ action: 'submit', receipt: retry.receipt, items: [headline(retry.candidates[0])] }), { code: 'NEWS_RECEIPT' });
  assert.equal([...h.domain.table('reports').keys()].length, 0);
});

// 真实验收中两条失败输入与输出的逐值摘录；保持原文，不把改写后的样本当原失败复验。
const originalEvidenceFailures = [
  {
    "candidate": {
      "id": "55667de4f4afc6e7729669612911a02e3a0bb995bbeab794db22b847121b6056",
      "title": "Gemini 4 Argon：为您解决最棘手的问题",
      "url": "https://www.infoq.cn/article/LkxBOvOJWmQGMQemUOrX",
      "publishedAt": "2026-10-19T11:10:27.000Z",
      "eventTime": null,
      "collectedAt": "2026-10-20T07:30:05.622Z",
      "excerpt": "点击查看原文>",
      "links": [],
      "source": {
        "name": "InfoQ 中国",
        "url": "https://www.infoq.cn/feed",
        "kind": "media",
        "region": "domestic"
      }
    },
    "output": {
      "sourceIds": [
        "55667de4f4afc6e7729669612911a02e3a0bb995bbeab794db22b847121b6056"
      ],
      "category": "model",
      "label": "media",
      "eventKey": "Google 发布 Gemini 4 Argon",
      "title": "谷歌发布模型「Gemini 4 Argon」",
      "link": "https://www.infoq.cn/article/LkxBOvOJWmQGMQemUOrX",
      "brief": "名为「Gemini 4 Argon」的谷歌新模型，主打处理最棘手的问题；候选未提供参数与上线时间等细节。",
      "relevance": ""
    }
  },
  {
    "candidate": {
      "id": "df978cfab948a254c72933bbf9aa304e33c9d74f889cf9fb6e4af4f5f4bb1b48",
      "title": "OpenCode 2.0 正式发布：一次“重大改造”，旧插件全部报废",
      "url": "https://www.infoq.cn/article/IK5AWDwovCu5lx3e3mhc",
      "publishedAt": "2026-10-19T09:51:45.000Z",
      "eventTime": null,
      "collectedAt": "2026-10-20T07:30:05.622Z",
      "excerpt": "点击查看原文>",
      "links": [],
      "source": {
        "name": "InfoQ 中国",
        "url": "https://www.infoq.cn/feed",
        "kind": "media",
        "region": "domestic"
      }
    },
    "output": {
      "sourceIds": [
        "df978cfab948a254c72933bbf9aa304e33c9d74f889cf9fb6e4af4f5f4bb1b48"
      ],
      "category": "agent",
      "label": "media",
      "eventKey": "OpenCode 发布 2.0",
      "title": "OpenCode 发布「2.0」，旧插件全部报废",
      "link": "https://www.infoq.cn/article/IK5AWDwovCu5lx3e3mhc",
      "brief": "OpenCode 2.0 正式发布，官方称这是一次重大改造，旧插件全部失效；候选未提供更多迁移细节。",
      "relevance": ""
    }
  }
];

test('原Gemini补发布主体与OpenCode补官方称均写前NEWS_EVIDENCE拒收，历史保留', async t => {
  for (const { candidate, output } of originalEvidenceFailures) await t.test(candidate.title, async t => {
    const xml = feed(`<item><title><![CDATA[${candidate.title}]]></title><link>${candidate.url}</link><pubDate>${candidate.publishedAt}</pubDate><description><![CDATA[${candidate.excerpt}]]></description></item>`);
    const h = await harness(t, { fetch: async url => response(xml, url) }); await h.enable();
    const previous = await h.run({ action: 'candidates', fieldId: 'custom-one' });
    const previousReport = (await h.run({ action: 'submit', receipt: previous.receipt, items: [] })).report;
    h.setNow(candidate.collectedAt);
    const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
    assert.equal(c.candidates[0].id, candidate.id); assert.equal(c.candidates[0].excerpt, '');
    const unchanged = structuredClone(output);
    await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [output] }), { code: 'NEWS_EVIDENCE' });
    assert.deepEqual(output, unchanged);
    assert.equal((await h.manage({ action: 'report', fieldId: 'custom-one', cutoff: c.cutoff })).report, null);
    assert.deepEqual((await h.manage({ action: 'report', fieldId: 'custom-one', cutoff: previous.cutoff })).report, previousReport);
    // 后续合法选择是独立的恢复路径，不声称原模型输出已经变为正确。
    const report = (await h.run({ action: 'submit', receipt: c.receipt, items: [{ sourceIds: [candidate.id], category: output.category, label: 'headline' }] })).report;
    assert.equal(report.items[0].title, candidate.title); assert.equal(report.items[0].brief, headlineBrief);
    assert.equal(report.items[0].link, candidate.url); assert.equal(report.items[0].label, 'headline');
  });
});


// 同一 XHTML URI 的不同 XML 拼写必须在唯一 SAX 边界得到相同证据，不绕过保存准入。
const xhtmlEvidenceFeed = (prefixed, withBody) => {
  const prefix = prefixed ? 'x:' : '', namespace = prefixed ? 'xmlns:x' : 'xmlns';
  const wrap = content => `<${prefix}div ${namespace}="http://www.w3.org/1999/xhtml">${content}</${prefix}div>`;
  const link = `<${prefix}a href="https://upstream.example.org/release">任意链接标题</${prefix}a>`;
  const body = `<${prefix}p>已开源，<${prefix}a href="https://code.example.org/repo">代码</${prefix}a>可下载。</${prefix}p>`;
  return `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>模型 X</title><link href="https://example.com/one"/><published>2026-10-11T12:00:00Z</published><summary type="xhtml">${wrap(link)}</summary>${withBody ? `<content type="xhtml">${wrap(body)}</content>` : ''}</entry></feed>`;
};

test('Atom XHTML默认与前缀命名空间：纯链接不挡后槽正文，来源链接保持相同', () => {
  const window = newsWindow(Date.parse('2026-10-12T05:00:00Z'));
  for (const withBody of [false, true]) {
    const variants = [false, true].map(prefixed => parseNewsFeed(xhtmlEvidenceFeed(prefixed, withBody), source, window, window.cutoff));
    assert.deepEqual(variants[1], variants[0], 'XML前缀不是证据强度差异');
    assert.equal(variants[0][0].excerpt, withBody ? '已开源， 代码 可下载。' : '');
    assert.deepEqual(variants[0][0].links, withBody ? ['https://upstream.example.org/release', 'https://code.example.org/repo'] : ['https://upstream.example.org/release']);
  }
});

test('Atom XHTML前缀链接壳普通提交拒收，headline投影与默认命名空间一致，有正文仍正常概括', async t => {
  for (const withBody of [false, true]) {
    const saved = [];
    for (const prefixed of [false, true]) {
      const h = await harness(t, { fetch: async url => response(xhtmlEvidenceFeed(prefixed, withBody), url) }); await h.enable();
      const c = await h.run({ action: 'candidates', fieldId: 'custom-one' });
      const headline = { sourceIds: [c.candidates[0].id], category: 'model', label: 'headline' };
      const ordinary = selection(c.candidates, { title: '模型「X」已开源', label: 'media', brief: '已开源，代码可下载。', eventKey: '模型X开源', link: 'https://code.example.org/repo' });
      await assert.rejects(h.run({ action: 'submit', receipt: c.receipt, items: [withBody ? headline : ordinary] }), { code: 'NEWS_EVIDENCE' }, `prefixed=${prefixed}, withBody=${withBody}`);
      assert.equal([...h.domain.table('reports').keys()].length, 0);
      const report = (await h.run({ action: 'submit', receipt: c.receipt, items: [withBody ? ordinary : headline] })).report;
      saved.push(report.items[0]);
      if (!withBody) {
        assert.equal(report.items[0].title, c.candidates[0].title);
        assert.equal(report.items[0].link, c.candidates[0].url);
        assert.equal(report.items[0].brief, headlineBrief);
      } else {
        assert.equal(report.items[0].brief, ordinary.brief);
        assert.equal(report.items[0].link, ordinary.link);
      }
    }
    assert.deepEqual(saved[1], saved[0], '保存投影不随XML命名空间前缀变化');
  }
});
