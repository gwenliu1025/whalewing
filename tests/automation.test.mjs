import Cards from '../features/cards/host.js';
import { LockedDomain } from '../src/host/locked-domain.js';
import { newsContract } from '../features/cards/contract.js';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { Automation, legacySchedulePrefix, knowledgeTaskPrompt, automationPresentation } from '../features/automation/automation.js';
import { automationProjection } from '../src/identity.js';
import { automationContract } from '../features/automation/contract.js';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Schedule from '@deepseek-ai/dsh-schedule';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function fixture() {
  const records = [], purposes = new Map([['auto', 'custom'], ['knowledge', 'knowledge'], ['news', 'news']]);
  const calls = [];
  const schedule = {
    async catalog() { calls.push('catalog'); return structuredClone(records); },
    async list({ sessionId }) { calls.push('list'); return records.filter(task => task.sessionId === sessionId && task.status === 'active').map(({ sessionId: _, status: __, purpose: ___, ...record }) => structuredClone(record)); },
    async create(sessionId, spec) { calls.push('create'); const record = { id: 'schedule-' + records.length, kind: 'daily', scheduledAt: '2026-10-13T00:00:00.000Z', title: spec.title, prompt: spec.prompt, time: spec.daily?.time ?? '08:00', timeZone: spec.daily?.time_zone ?? 'Asia/Shanghai' }; records.push({ ...record, sessionId, status: 'active' }); return structuredClone(record); },
    async update(input) { calls.push(input); const record = (await this.list(input)).find(task => task.id === input.id); if (!isDeepStrictEqual(record, input.expected)) return { id: input.id, updated: false, code: 'schedule_conflict' }; Object.assign(records.find(task => task.id === input.id), { title: input.title ?? record.title, prompt: input.prompt ?? record.prompt }); return { id: input.id, updated: true, record: (await this.list(input))[0] }; },
    async history(input) { calls.push(input); return { id: input.id, records: [{ messageId: 'message-1', deliveredAt: '2026-10-12T00:00:00Z' }], nextBefore: 'message-1', earlierRecordsUnavailable: false, earlierRecordsPruned: false, retention: { days: 30, records: 100 } }; },
    async delete({ id, sessionId }) { calls.push('delete'); const index = records.findIndex(task => task.id === id && task.sessionId === sessionId); if (index >= 0) records.splice(index, 1); return { id, deleted: index >= 0 }; },
  };
  const dependencies = {
    schedule: () => schedule,
    projections: async id => ({ asOfSeq: 0, values: { whalewingAutomation: purposes.get(id) ?? null, whalewingWorkbench: id === 'legacy' } }),
    confirmClaim: async () => calls.push('flush'),
    prepareModel: async () => calls.push('model'),
  };
  const owner = new Automation(dependencies);
  const news = { initialize: async () => {}, withScheduleSpec: async () => { throw Object.assign(new Error('资讯未就绪'), { code: 'NEWS_UNAVAILABLE' }); } };
  const cards = Object.assign(Object.create(Cards.prototype), { resource: new LockedDomain({}), ctx: { get: () => dependencies.schedule(), whalewingAutomation: { automation: owner } }, newsOwner: async () => news });
  const create = (sessionId = 'auto', purpose = purposes.get(sessionId)) => purpose === 'news'
    ? cards.manageSchedules({ action: 'create', sessionId, purpose })
    : owner.manage({ action: 'create', sessionId, purpose, spec: { title: '任务', prompt: '员工指令', daily: { time: '08:00:00', time_zone: 'Asia/Shanghai' } } });
  return { owner, cards, news, dependencies, schedule, records, purposes, calls, create };
}

test('自动任务用途只接受成功人工回执，fork不继承父自动身份', () => {
  const run = { seq: 0, type: 'command/run', data: { commandId: 'claim', name: 'whalewing' } };
  const done = { seq: 1, type: 'command/done', data: { commandId: 'claim', kind: 'success', text: JSON.stringify({ action: 'automation_claim', purpose: 'knowledge' }) } };
  const fold = (events, inherited = 0) => events.reduce(automationProjection.apply, automationProjection.init({}, inherited));
  assert.equal(fold([run, done]).purpose, 'knowledge');
  for (const events of [[done], [{ ...run, data: { ...run.data, name: 'wrong' } }, done], [run, { ...done, data: { ...done.data, kind: 'error' } }]]) assert.equal(fold(events).purpose, null);
  assert.equal(fold([run, done], 2).purpose, null);
  assert.equal(fold([{ ...run, data: { ...run.data, name: 'youjin' } }, done]).purpose, 'knowledge', '改名前的旧会话仍按原用途识别');
  assert.equal(fold([run, done, { ...done, seq: 3, data: { ...done.data, text: '{}' } }]).purpose, 'knowledge');
});

test('关闭模板与缺Schedule只读零模型零写入，身份冷读失败可诊断', async () => {
  const h = fixture();
  assert.deepEqual(await h.owner.manage({ action: 'catalog' }), { available: true, controls: false, tasks: [], legacyTasks: [], issues: [] });
  assert.deepEqual(h.calls, ['catalog']);
  h.dependencies.schedule = () => undefined;
  assert.equal((await h.owner.manage({ action: 'catalog' })).available, false);
  await assert.rejects(h.create(), { code: 'SCHEDULE_DISABLED' });
  h.dependencies.schedule = () => h.schedule;
  h.records.push({ id: 'broken', sessionId: 'broken', prompt: '' });
  h.dependencies.projections = async () => { throw new Error('损坏日志'); };
  assert.match((await h.owner.catalog()).issues[0].message, /损坏日志/);
  await assert.rejects(h.create(), /损坏日志/);
});

test('创建回执恢复只用原会话身份；并发提交不生成第二条，claim持久化先于create', async () => {
  const h = fixture(), entered = Promise.withResolvers(), release = Promise.withResolvers();
  h.dependencies.prepareModel = async () => { entered.resolve(); await release.promise; };
  const first = h.create();
  await entered.promise;
  await assert.rejects(h.create(), { code: 'BUSY' });
  release.resolve();
  assert.equal((await first).recovered, false);
  assert.equal((await h.create()).recovered, true);
  assert.equal(h.records.length, 1);
  assert.ok(h.calls.indexOf('flush') < h.calls.indexOf('create'));
  assert.equal(h.calls.filter(call => call === 'create').length, 1);
});

test('创建持久化已开始后取消仍等待原生回执，不自动补偿或释放写占位', async () => {
  const h = fixture(), entered = Promise.withResolvers(), release = Promise.withResolvers(), controller = new AbortController();
  const original = h.schedule.create.bind(h.schedule);
  h.schedule.create = async (...args) => { entered.resolve(); await release.promise; return original(...args); };
  const result = h.owner.manage({ action: 'create', sessionId: 'auto', purpose: 'custom', spec: { title: '任务', prompt: '指令', after_seconds: 60 } }, controller.signal);
  await entered.promise; controller.abort(new Error('用户取消等待'));
  assert.equal(h.owner.writing, true);
  await assert.rejects(h.create(), { code: 'BUSY' });
  release.resolve(); assert.equal((await result).recovered, false);
  assert.equal(h.records.length, 1); assert.equal(h.owner.writing, false);
});

test('跨会话与未认领管理被拒；冷投影缺失不猜为普通会话', async () => {
  const h = fixture(), { task } = await h.create();
  await assert.rejects(h.owner.manage({ action: 'delete', sessionId: 'knowledge', id: task.id }), { code: 'SCHEDULE_NOT_FOUND' });
  await assert.rejects(h.owner.manage({ action: 'history', sessionId: 'foreign', id: task.id, limit: 10 }), { code: 'AUTOMATION_IDENTITY' });
  h.dependencies.projections = async () => ({ asOfSeq: 0, values: {} });
  await assert.rejects(h.owner.identity('auto'), { code: 'AUTOMATION_IDENTITY' });
  assert.equal(h.records.length, 1);
});

test('无关损坏计划只阻断内置单例核验，不读取或阻断独立custom创建', async () => {
  const h = fixture(), original = h.dependencies.projections;
  h.records.push({ id: 'broken', sessionId: 'broken', prompt: '无关' });
  h.dependencies.projections = async id => { if (id === 'broken') throw new Error('无关损坏日志'); return original(id); };
  assert.equal((await h.create()).recovered, false);
  assert.equal((await h.owner.catalog()).issues.length, 1);
  await assert.rejects(h.create('knowledge'), { code: 'AUTOMATION_IDENTITY' });
});

test('编辑取得原生list完整expected，冲突原样返回；历史游标和删除真实回读', async () => {
  const h = fixture(), { task } = await h.create();
  const address = { sessionId: 'auto', id: task.id };
  const read = await h.owner.manage({ action: 'read', ...address });
  assert.equal(Object.hasOwn(read.task, 'sessionId'), false);
  const conflict = await h.owner.manage({ action: 'update', expectedStatus: 'active', ...address, expected: { ...read.task, prompt: 'stale' }, title: '修改' });
  assert.equal(conflict.code, 'schedule_conflict');
  const changed = await h.owner.manage({ action: 'update', expectedStatus: 'active', ...address, expected: read.task, title: '修改' });
  assert.equal(changed.record.title, '修改');
  const history = await h.owner.manage({ action: 'history', ...address, limit: 10, before: 'cursor' });
  assert.equal(history.nextBefore, 'message-1'); assert.equal(h.calls.at(-1).before, 'cursor');
  assert.equal((await h.owner.manage({ action: 'delete', ...address })).deleted, true);
  assert.equal(h.records.length, 0); assert.equal(await h.owner.identity('auto'), 'custom');
});

test('知识模板固定流程，单例与旧工作台计划明确迁移；不靠提示前缀认领', async () => {
  const h = fixture();
  h.records.push({ id: 'old', sessionId: 'legacy', prompt: legacySchedulePrefix, status: 'active' });
  assert.equal((await h.owner.catalog()).legacyTasks.length, 1);
  await assert.rejects(h.create('knowledge'), { code: 'LEGACY_SCHEDULE' });
  const legacy = await h.owner.manage({ action: 'read', sessionId: 'legacy', id: 'old' });
  assert.equal(legacy.legacy, true);
  await assert.rejects(h.owner.manage({ action: 'update', expectedStatus: 'active', sessionId: 'legacy', id: 'old', expected: legacy.task, title: '改写' }), { code: 'LEGACY_SCHEDULE' });
  assert.equal((await h.owner.manage({ action: 'delete', sessionId: 'legacy', id: 'old' })).deleted, true);
  const result = await h.create('knowledge');
  assert.ok(result.task.prompt.startsWith(knowledgeTaskPrompt));
  h.purposes.set('second', 'knowledge');
  await assert.rejects(h.create('second'), { code: 'SCHEDULE_EXISTS' });
  h.records.length = 0; h.records.push({ id: 'fake', sessionId: 'foreign', prompt: legacySchedulePrefix });
  const listing = await h.owner.catalog(); assert.equal(listing.legacyTasks.length, 0); assert.equal(listing.issues.length, 1);
});

test('资讯创建只消费资讯owner指令，客户端不修改内置指令', async () => {
  const h = fixture();
  await assert.rejects(h.create('news'), { code: 'NEWS_UNAVAILABLE' });
  h.news.withScheduleSpec = async (_id, submit) => submit({ title: '每日资讯', prompt: '可信资讯指令', daily: { time: '08:00:00', time_zone: 'Asia/Shanghai' } });
  const { task } = await h.create('news'); assert.equal(task.prompt, '可信资讯指令');
  await assert.rejects(h.owner.manage({ action: 'update', expectedStatus: 'active', sessionId: 'news', id: task.id, expected: task, prompt: '任意新指令' }), { code: 'AUTOMATION_PROMPT' });
});

test('资讯配置锁包住真实提交及回读；回读未知按原会话恢复不重复创建', async () => {
  const h = fixture(); let locked = false;
  const original = h.schedule.catalog.bind(h.schedule);
  h.news.withScheduleSpec = async (_id, submit) => {
    locked = true;
    try { return await submit({ title: '资讯', prompt: '规范资讯', daily: { time: '08:00:00', time_zone: 'Asia/Shanghai' } }); }
    finally { locked = false; }
  };
  h.schedule.catalog = async () => { if (h.records.length) { assert.equal(locked, true); throw new Error('已提交后的回读断开'); } return original(); };
  await assert.rejects(h.create('news'), { code: 'SCHEDULE_READBACK' });
  assert.equal(h.records.length, 1); assert.equal(locked, false); assert.equal(h.owner.writing, false);
  h.schedule.catalog = original;
  assert.equal((await h.create('news')).recovered, true);
  assert.equal(h.records.length, 1);
});

test('自动任务严格契约覆盖六选一规则，拒绝多规则与任意额外字段', () => {
  const contract = automationContract(z), base = { action: 'create', sessionId: 'auto', purpose: 'custom', spec: { title: '任务', prompt: '执行指令' } };
  for (const selector of [{ after_seconds: 60 }, { at: '2026-10-13T00:00:00Z' }, { every_seconds: 60 }, { daily: { time: '08:00:00', time_zone: 'Asia/Shanghai' } }, { weekly: { time: '08:00:00', time_zone: 'Asia/Shanghai', weekdays: [1] } }, { cron: { expression: '0 8 * * *', time_zone: 'Asia/Shanghai' } }]) assert.ok(contract.input.parse({ ...base, spec: { ...base.spec, ...selector } }));
  assert.throws(() => contract.input.parse({ ...base, spec: { ...base.spec, at: 'x', every_seconds: 60 } }));
  assert.throws(() => contract.input.parse({ action: 'catalog', body: true }));
  assert.throws(() => contract.input.parse({ ...base, purpose: 'other', spec: { ...base.spec, after_seconds: 60 } }));
  assert.ok(contract.input.parse({ action: 'create', sessionId: 'knowledge', purpose: 'knowledge', spec: { daily: { time: '00:15:00', time_zone: 'Asia/Shanghai' } } }));
  assert.ok(newsContract(z).scheduleInput.parse({ action: 'create', sessionId: 'news', purpose: 'news' }));
  assert.throws(() => contract.input.parse({ action: 'create', sessionId: 'news', purpose: 'news' }));
  assert.throws(() => contract.input.parse({ ...base, purpose: 'news' }));
  assert.throws(() => contract.input.parse({ ...base, purpose: 'knowledge', spec: { ...base.spec, after_seconds: 60 } }));
});

test('目标版原生Schedule真实持久化、CAS、自然到期回执、取消与历史删除', { timeout: 15000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-native-schedule-'));
  const ctx = new Context(), messages = [];
  t.after(async () => { await ctx.fiber.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  new TypertRegistry(ctx);
  await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root: directory }); await ctx.plugin(StorageDomain, { backend: 'json' });
  // 夹具没有已挂载 Agent；新版 Schedule 会查询 get 来排除子代理。
  ctx.provide('agents', { roots: () => [], get: () => undefined, withoutInitiator: fn => fn() });
  ctx.provide('sessions', { flush: async () => true });
  ctx.provide('tools', {}); ctx.provide('sessionPersistence', {});
  ctx.provide('sessionController', { resolveAgent: async sessionId => ({ agent: { session: { id: sessionId }, followup: message => messages.push(message) } }) });
  const native = new Schedule(ctx, {});
  const owner = new Automation({ schedule: () => native, projections: async () => ({ asOfSeq: 0, values: { whalewingAutomation: 'custom' } }), confirmClaim: async () => {}, prepareModel: async () => {} });
  const contract = automationContract(z);
  const call = async input => contract.result.parse(await owner.manage(contract.input.parse(input), AbortSignal.timeout(10000)));
  const { task } = await call({ action: 'create', purpose: 'custom', sessionId: 'native-auto', spec: { title: '真实原生计划', prompt: '隔离测试指令', daily: { time: '08:00:00', time_zone: 'Asia/Shanghai' } } });
  const binding = { sessionId: 'native-auto', id: task.id };
  const read = await call({ action: 'read', ...binding });
  const changed = await call({ action: 'update', expectedStatus: 'active', ...binding, expected: read.task, title: '已修改' });
  assert.equal(changed.record.title, '已修改');
  assert.equal((await call({ action: 'update', expectedStatus: 'active', ...binding, expected: read.task, title: '旧覆盖' })).code, 'schedule_conflict');
  // 自然计时只用于此原生到期集成，状态事件而不是睡眠决定验收完成。
  const delivered = Promise.withResolvers();
  const stop = ctx.on('schedule/changed', () => { void native.catalog().then(tasks => { if (tasks.some(row => row.id === task.id && row.lastDelivery)) delivered.resolve(); }, delivered.reject); });
  t.after(stop);
  await call({ action: 'update', expectedStatus: 'active', ...binding, expected: changed.record, change: { kind: 'at', at: new Date(Date.now() + 1500).toISOString() } });
  await delivered.promise;
  assert.equal(messages.length, 1); assert.equal(messages[0].source.kind, 'schedule');
  const history = await call({ action: 'history', ...binding, limit: 10 });
  assert.equal(history.records.length, 1); assert.equal(history.records[0].messageId, messages[0].id);
  assert.equal((await call({ action: 'catalog' })).tasks[0].status, 'inactive');
  assert.equal((await call({ action: 'delete', ...binding })).deleted, true);
  assert.equal((await call({ action: 'catalog' })).tasks.length, 0);
  assert.equal((await native.history({ ...binding, limit: 10 })).code, 'schedule_not_found');
});


test('默认资讯初始化只用原session恢复未知接纳，成功后删除也不复活', async () => {
  const h = fixture(), values = new Map(), sessions = [];
  const state = { get: key => values.get(key), put: async (key, value) => values.set(key, value) };
  h.news.lifecycleTable = state;
  let unknown = true;
  h.cards.createNewsSession = async id => { sessions.push(id); h.purposes.set(id, 'news'); if (unknown) { unknown = false; throw new Error('会话接受未知'); } };
  h.news.withScheduleSpec = async (_, submit) => submit({ title: '每日资讯', prompt: '资讯指令', daily: { time: '08:00:00', time_zone: 'Asia/Shanghai' } });
  await assert.rejects(h.cards.initializeNews(), /会话接受未知/);
  const pending = state.get('default-news'); assert.ok(pending.sessionId); assert.deepEqual(Object.keys(pending), ['sessionId']);
  const catalog = await h.cards.initializeNews(); assert.equal(catalog.tasks.length, 1); assert.equal(catalog.tasks[0].sessionId, pending.sessionId);
  assert.equal(new Set(sessions).size, 1); assert.equal(h.calls.includes('model'), false);
  assert.deepEqual(state.get('default-news'), { accepted: true });
  h.records.length = 0;
  await h.cards.initializeNews(); assert.equal(h.records.length, 0); assert.equal(sessions.length, 2);
});

test('初始化复用已暂停或已结束资讯计划，服务缺失不分配身份', async () => {
  for (const status of ['paused', 'inactive']) {
    const h = fixture(), values = new Map();
    h.news.lifecycleTable = { get: key => values.get(key), put: async (key, value) => values.set(key, value) };
    h.cards.createNewsSession = async () => assert.fail('不新建会话');
    h.records.push({ id: 'original', sessionId: 'news', status, prompt: '已有' });
    await h.cards.initializeNews(); assert.deepEqual(values.get('default-news'), { accepted: true }); assert.equal(h.records[0].status, status);
  }
  const h = fixture(); h.dependencies.schedule = () => undefined;
  h.cards.newsOwner = async () => assert.fail('服务缺失不打开持久域');
  assert.equal((await h.cards.initializeNews()).available, false);
});

test('暂停恢复消费原生CAS并保留同ID与历史，暂停任务可读可编辑', async () => {
  const h = fixture(), { task } = await h.create();
  const binding = { sessionId: 'auto', id: task.id };
  // 原生 DSH 没有暂停接口：明确报错，不假装暂停成功。
  await assert.rejects(h.owner.manage({ action: 'pause', ...binding, expected: task, expectedStatus: 'active' }), { code: 'SCHEDULE_CONTROL_UNAVAILABLE' });
  for (const action of ['pause', 'resume']) h.schedule[action] = async input => {
    const row = h.records[0];
    if (input.expectedStatus !== row.status) return { id: row.id, updated: false, code: 'schedule_conflict' };
    row.status = action === 'pause' ? 'paused' : 'active';
    return { id: row.id, updated: true, record: input.expected };
  };
  assert.equal((await h.owner.manage({ action: 'catalog' })).controls, true);
  assert.equal((await h.owner.manage({ action: 'pause', ...binding, expected: task, expectedStatus: 'active' })).updated, true);
  assert.deepEqual((await h.owner.manage({ action: 'read', ...binding })).task, task);
  assert.equal((await h.owner.manage({ action: 'read', ...binding })).status, 'paused');
  assert.equal((await h.owner.manage({ action: 'history', ...binding, limit: 10 })).records[0].messageId, 'message-1');
  assert.equal((await h.owner.manage({ action: 'resume', ...binding, expected: task, expectedStatus: 'active' })).code, 'schedule_conflict');
  assert.equal((await h.owner.manage({ action: 'resume', ...binding, expected: task, expectedStatus: 'paused' })).updated, true);
  assert.equal(h.records.length, 1); assert.equal(h.records[0].id, task.id);
});


test('计划接受未知先查原身份，标记失败和并发恢复都不重复create', async () => {
  const h = fixture(), values = new Map(), originalCreate = h.schedule.create.bind(h.schedule);
  let markFails = true;
  h.news.lifecycleTable = ({ get: key => values.get(key), put: async (key, value) => { if (value.accepted && markFails) { markFails = false; throw new Error('接纳标记失败'); } values.set(key, value); } });
  h.cards.createNewsSession = async id => { h.purposes.set(id, 'news'); };
  h.news.withScheduleSpec = async (_, submit) => submit({ title: '资讯', prompt: '资讯', daily: { time: '08:00:00', time_zone: 'Asia/Shanghai' } });
  h.schedule.create = async (...args) => { await originalCreate(...args); throw new Error('计划接受未知'); };
  await assert.rejects(h.cards.initializeNews(), /计划接受未知/);
  const id = values.get('default-news').sessionId;
  await assert.rejects(h.cards.initializeNews(), /接纳标记失败/);
  const replies = await Promise.all([h.cards.initializeNews(), h.cards.initializeNews()]);
  assert.equal(h.calls.filter(c => c === 'create').length, 1); assert.equal(h.records[0].sessionId, id);
  assert.equal(replies[0].tasks.length, 1); assert.deepEqual(values.get('default-news'), { accepted: true });
});


test('多工作区范围原生持久化、读回、CAS编辑与自定义固定集合', async () => {
  const h = fixture(), contract = automationContract(z);
  h.dependencies.listWorkspaces = async () => [{ workspaceId: 'a', path: '/a', sessionIds: ['s-a'] }, { workspaceId: 'b', path: '/b', sessionIds: ['s-b'] }];
  const scope = { mode: 'all', excludedWorkspaceIds: ['b'] };
  const { task } = await h.owner.manage({ action: 'create', sessionId: 'knowledge', purpose: 'knowledge', workspaceScope: scope, spec: { daily: { time: '00:15', time_zone: 'UTC' } } });
  assert.equal(task.timeZone, 'Asia/Shanghai');
  assert.deepEqual(automationPresentation(task.prompt).workspaceScope, scope);
  const catalog = contract.result.parse(await h.owner.catalog());
  assert.deepEqual(catalog.tasks[0].workspaceScope, scope);
  const read = contract.result.parse(await h.owner.manage({ action: 'read', sessionId: 'knowledge', id: task.id }));
  assert.equal(read.task.prompt, task.prompt); assert.ok(!read.displayPrompt.includes('<whalewing-workspaces>'));
  const request = { action: 'update', sessionId: 'knowledge', id: task.id, expected: read.task, expectedStatus: 'active', workspaceScope: { mode: 'selected', workspaceIds: ['b'] } };
  assert.equal((await h.owner.manage(request)).updated, true);
  assert.deepEqual(automationPresentation(h.records[0].prompt).workspaceScope, request.workspaceScope);
  assert.equal((await h.owner.manage(request)).code, 'schedule_conflict');
  const custom = await h.owner.manage({ action: 'create', sessionId: 'auto', purpose: 'custom', workspaceScope: { mode: 'all', excludedWorkspaceIds: [] }, spec: { title: '跨工作区检查', prompt: '逐工作区检查构建', daily: { time: '08:00', time_zone: 'UTC' } } });
  assert.deepEqual(automationPresentation(custom.task.prompt).workspaceScope, { mode: 'selected', workspaceIds: ['a', 'b'] });
  assert.ok(custom.task.prompt.includes('"path":"/a"')); assert.ok(custom.task.prompt.includes('"path":"/b"'));
});

test('空选、已移除工作区、损坏范围和重复身份拒收，旧记录保持', async () => {
  const h = fixture(), contract = automationContract(z);
  h.dependencies.listWorkspaces = async () => [{ workspaceId: 'a', path: '/a', sessionIds: [] }];
  const input = { action: 'create', sessionId: 'auto', purpose: 'custom', spec: { title: '任务', prompt: '员工指令', after_seconds: 60 } };
  assert.throws(() => contract.input.parse({ ...input, workspaceScope: { mode: 'selected', workspaceIds: [] } }));
  assert.throws(() => contract.input.parse({ ...input, workspaceScope: { mode: 'selected', workspaceIds: ['a', 'a'] } }));
  await assert.rejects(h.owner.manage({ ...input, workspaceScope: { mode: 'selected', workspaceIds: ['missing'] } }), { code: 'WORKSPACE_MISSING' });
  await assert.rejects(h.owner.manage({ ...input, workspaceScope: { mode: 'all', excludedWorkspaceIds: ['a'] } }), { code: 'WORKSPACE_SCOPE' });
  assert.equal(h.records.length, 0);
  const { task } = await h.owner.manage({ ...input, workspaceScope: { mode: 'selected', workspaceIds: ['a'] } });
  assert.throws(() => automationPresentation(task.prompt.slice(0, -1)), { code: 'WORKSPACE_SCOPE' });
  h.dependencies.listWorkspaces = async () => [];
  await assert.rejects(h.owner.manage({ action: 'update', sessionId: 'auto', id: task.id, expected: task, expectedStatus: 'active', prompt: '修改指令' }), { code: 'WORKSPACE_MISSING' });
  assert.equal(h.records[0].prompt, task.prompt);
});


test('原生Schedule磁盘冷恢复保留范围与CAS原件，无插件任务镜像', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-scope-restart-'));
  const contexts = [];
  t.after(async () => { for (const ctx of contexts) await ctx.fiber.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  async function open() {
    const ctx = new Context(); contexts.push(ctx); new TypertRegistry(ctx);
    await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root: directory }); await ctx.plugin(StorageDomain, { backend: 'json' });
    ctx.provide('agents', { roots: () => [], get: () => undefined, withoutInitiator: fn => fn() }); ctx.provide('sessions', { flush: async () => true });
    ctx.provide('tools', {}); ctx.provide('sessionPersistence', {});
    const native = new Schedule(ctx, {});
    const owner = new Automation({ schedule: () => native, projections: async () => ({ asOfSeq: 0, values: { whalewingAutomation: 'knowledge' } }), confirmClaim: async () => {}, prepareModel: async () => {}, listWorkspaces: async () => [{ workspaceId: 'a', path: '/a', sessionIds: ['source-a'] }] });
    return { ctx, owner, native };
  }
  const first = await open();
  const scope = { mode: 'all', excludedWorkspaceIds: ['excluded'] };
  const created = await first.owner.manage({ action: 'create', purpose: 'knowledge', sessionId: 'scope-cold', workspaceScope: scope, spec: { at: '2090-01-01T00:00:00Z' } });
  await first.ctx.fiber.dispose(); contexts.splice(contexts.indexOf(first.ctx), 1);
  const restored = await open();
  const read = await restored.owner.manage({ action: 'read', sessionId: 'scope-cold', id: created.task.id });
  assert.deepEqual(read.task, created.task); assert.deepEqual(read.workspaceScope, scope);
  assert.deepEqual((await restored.native.catalog())[0].prompt, created.task.prompt);
  const result = await restored.owner.manage({ action: 'update', sessionId: 'scope-cold', id: created.task.id, expected: read.task, expectedStatus: 'active', workspaceScope: { mode: 'selected', workspaceIds: ['a'] } });
  assert.equal(result.updated, true);
  assert.deepEqual(automationPresentation(result.record.prompt).workspaceScope, { mode: 'selected', workspaceIds: ['a'] });
});


test('目录混有迁移中的旧候选时保留逐项诊断与正常任务', async () => {
  const h = fixture();
  h.records.push({ id: 'valid', sessionId: 'auto', prompt: '正常任务', status: 'active' }, { id: 'old', sessionId: 'legacy', prompt: legacySchedulePrefix, status: 'active' });
  let legacyReads = 0;
  h.dependencies.projections = async id => id === 'legacy' && ++legacyReads > 1
    ? { kind: 'migration-required', asOfSeq: 0, values: { whalewingWorkbench: true } }
    : { asOfSeq: 0, values: { whalewingAutomation: id === 'auto' ? 'custom' : null, whalewingWorkbench: true } };
  const listing = await h.owner.catalog();
  assert.equal(listing.tasks.length, 1); assert.equal(listing.tasks[0].id, 'valid');
  assert.equal(listing.legacyTasks.length, 0); assert.equal(listing.issues.length, 1);
  assert.equal(listing.issues[0].sessionId, 'legacy'); assert.match(listing.issues[0].message, /升级/);
});
