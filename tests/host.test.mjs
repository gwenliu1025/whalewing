import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Schedule from '@deepseek-ai/dsh-schedule';
import { newsDomain, newsLimits } from '../src/news.js';
import { apply as applyTools } from '../tools.js';
import Whalewing, { workbenchProjection } from '../index.js';

test('真实Host旧定时命令已退出写入，不初始化知识或发送原生消息', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-host-'));
  const ctx = new Context();
  new TypertRegistry(ctx);
  let command;
  let flushed = false;
  const messages = [];
  ctx.provide('commands', { register(value) { command = value; } });
  ctx.provide('sessions', { async flush() { flushed = true; return true; } });
  ctx.provide('sessionQuery', {});
  ctx.provide('sessionProjections', { register() {} });
  ctx.provide('skills', {});
  const service = isolatedService(ctx, directory, { vaultRoot: path.join(directory, 'vault') });
  t.after(async () => {
    await ctx.fiber.dispose();
    // 只回收当前测试独占创建的随机目录。
    await fs.rm(directory, { recursive: true, force: true });
  });
  const agent = { session: { id: 'test-host-session' }, followup: message => messages.push(message) };
  const run = action => command.handler({ agent, rawInput: JSON.stringify({ action, timeZone: 'Asia/Shanghai' }) });
  for (const action of ['schedule_list', 'schedule_create', 'schedule_delete', 'schedule_run']) {
    const result = await run(action);
    assert.equal(result.kind, 'error');
    assert.equal(JSON.parse(result.text).code, 'SCHEDULE_RETIRED');
    assert.match(JSON.parse(result.text).message, /定时任务.*面板/);
  }
  assert.equal(await service.vault.initialized(), false);
  assert.equal(messages.length, 0);
  assert.equal(flushed, false);
  assert.equal(command.recordInput, false);
});

for (const mode of ['cancel', 'timeout', 'dispose', 'late-error']) test(`统一自动任务Host目录读取：${mode}退出等待且迟到结果不发布`, { timeout: 5000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-auto-cancel-')), ctx = new Context();
  new TypertRegistry(ctx);
  t.after(async () => { await ctx.fiber.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  ctx.provide('commands', { register() {} }); ctx.provide('sessions', {}); ctx.provide('sessionQuery', {});
  ctx.provide('sessionProjections', { register() {} }); ctx.provide('skills', {});
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), drained = Promise.withResolvers();
  ctx.provide('schedule', { catalog: async () => { entered.resolve(); try { await release.promise; return []; } finally { drained.resolve(); } } });
  const service = isolatedService(ctx, directory, { vaultRoot: path.join(directory, 'vault') }), controller = new AbortController();
  let returned = 0, disposal, timer;
  const reading = service.manageAutomation({ action: 'catalog' }, controller.signal);
  reading.then(() => returned++, () => {});
  const rejected = assert.rejects(reading, mode === 'timeout' ? /截止/ : /取消|卸载/);
  try {
    await entered.promise;
    if (mode === 'dispose') disposal = service.core.dispose();
    else if (mode === 'timeout') timer = setTimeout(() => controller.abort(new Error('截止时间已到')), 30);
    else controller.abort(new Error('员工取消'));
    await rejected; await disposal;
    assert.equal(service.core.pending.size, 0); assert.equal(service.automation.writing, false); assert.equal(returned, 0);
  } finally {
    clearTimeout(timer);
    if (mode === 'late-error') release.reject(new Error('宿主迟到失败')); else release.resolve();
    await drained.promise; await Promise.allSettled([reading, disposal]);
  }
  assert.equal(returned, 0); assert.equal(await service.vault.initialized(), false);
});

test('工作台投影只接受本命令成功回执，fork不认领父工作台', () => {
  const run = { seq: 0, type: 'command/run', data: { commandId: 'claim-1', name: 'whalewing' } };
  const done = { seq: 1, type: 'command/done', data: { commandId: 'claim-1', kind: 'success', text: JSON.stringify({ action: 'workbench_claim', claimed: true }) } };
  const fold = (events, inherited = 0) => events.reduce(workbenchProjection.apply, workbenchProjection.init({}, inherited));
  assert.equal(workbenchProjection.wire.view(fold([run, done])), true);
  assert.equal(workbenchProjection.wire.view(fold([{ ...run, data: { ...run.data, name: 'youjin' } }, done])), true, '改名前的旧工作台会话仍被识别');
  assert.equal(workbenchProjection.wire.view(fold([done])), false);
  assert.equal(workbenchProjection.wire.view(fold([{ ...run, data: { ...run.data, name: 'other' } }, done])), false);
  assert.equal(workbenchProjection.wire.view(fold([run, { ...done, data: { ...done.data, kind: 'error' } }])), false);
  assert.equal(workbenchProjection.wire.view(fold([run, done], 2)), false);
  assert.equal(workbenchProjection.wire.view(fold([run, { ...done, data: { ...done.data, text: '{' } }])), false);
  workbenchProjection.stateSchema.parse(fold([run, done]));
});


test('轻量工作台确认严格仅action，只flush当前会话，false异常和取消均拒收且不初始化知识', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-confirm-')), ctx = new Context(); new TypertRegistry(ctx);
  let command, mode = 'ok', controller, flushed = [];
  ctx.provide('commands', { register(value) { command = value; } });
  ctx.provide('sessions', { async flush(session) { flushed.push(session.id); if (mode === 'throw') throw new Error('磁盘故障'); if (mode === 'cancel') controller.abort(); return mode !== 'false'; } });
  ctx.provide('sessionQuery', {}); ctx.provide('sessionProjections', { register() {} }); ctx.provide('skills', {});
  const service = isolatedService(ctx, directory, { vaultRoot: path.join(directory, 'vault') });
  t.after(async () => { await ctx.fiber.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  service.core.execute = () => assert.fail('轻量确认不得进入知识core');
  const agent = { status: 'idle', session: { id: 'neutral' } };
  const run = (input = { action: 'workbench_confirm' }) => command.handler({ agent, rawInput: JSON.stringify(input), signal: controller.signal });
  controller = new AbortController(); assert.deepEqual(JSON.parse((await run()).text), { action: 'workbench_confirm', persisted: true }); assert.deepEqual(flushed, ['neutral']);
  assert.equal((await run({ action: 'workbench_confirm', sessionId: 'other' })).kind, 'error'); assert.equal(flushed.length, 1);
  for (mode of ['false', 'throw', 'cancel']) { controller = new AbortController(); assert.equal((await run()).kind, 'error'); }
  controller = new AbortController(); controller.abort(); const count = flushed.length; assert.equal((await run()).kind, 'error'); assert.equal(flushed.length, count);
  assert.equal(await service.vault.initialized(), false);
});

test('工作台标记不初始化或采集来源，status自动就绪且持久化失败明确返回', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-workbench-'));
  const ctx = new Context();
  new TypertRegistry(ctx);
  let command;
  let persisted = true;
  ctx.provide('commands', { register(value) { command = value; } });
  ctx.provide('sessions', { async flush() { return persisted; } });
  ctx.provide('sessionQuery', {});
  const registered = [];
  ctx.provide('sessionProjections', { register(value) { registered.push(value.key); } });
  ctx.provide('skills', {});
  const service = isolatedService(ctx, directory, { vaultRoot: path.join(directory, 'vault') });
  assert.deepEqual(registered, ['whalewingWorkbench', 'whalewingAutomation']);
  t.after(async () => { await ctx.fiber.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  const agent = { status: 'idle', session: { id: 'workbench-session' } };
  const run = action => command.handler({ agent, rawInput: JSON.stringify({ action }) });
  assert.equal((await run('workbench_claim')).kind, 'success');
  assert.equal(await service.vault.initialized(), false);
  const status = await run('status');
  assert.equal(status.kind, 'success');
  assert.equal(JSON.parse(status.text).initialized, true);
  assert.deepEqual((await service.vault.settings()).sources, []);
  persisted = false;
  assert.equal(JSON.parse((await run('status')).text).code, 'PERSISTENCE');
  agent.status = 'running';
  assert.equal(JSON.parse((await run('workbench_claim')).text).code, 'BUSY');
});

test('工作区关联只消费当前会话并先落盘，缺服务与非法输入不写入', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-attach-'));
  const ctx = new Context();
  new TypertRegistry(ctx);
  let command;
  const calls = [];
  let persisted = true;
  let attachFailure = false;
  let readback = true;
  ctx.provide('commands', { register(value) { command = value; } });
  ctx.provide('sessions', { async flush() { calls.push('flush'); return persisted; } });
  ctx.provide('sessionQuery', {});
  ctx.provide('sessionProjections', { register() {} });
  ctx.provide('skills', {});
  const service = isolatedService(ctx, directory, { vaultRoot: path.join(directory, 'vault') });
  t.after(async () => { await ctx.fiber.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  const cwd = 'c:\\Users\\qianqian_liu\\.dsh\\profiles\\desktop';
  const agent = { status: 'idle', session: { id: 'current-session', header: { cwd } } };
  const run = (extra = {}, signal) => command.handler({ agent, rawInput: JSON.stringify({ action: 'workspace_attach', ...extra }), signal });
  const code = result => JSON.parse(result.text).code;
  assert.equal(code(await run()), 'WORKSPACE_UNAVAILABLE');
  assert.deepEqual(calls, []);
  const workspace = {
    id: 'host-workspace', sessionIds: [],
    async attachSession(id) {
      calls.push(['attach', id]);
      if (attachFailure) throw new Error('写入未确认');
      if (readback && !this.sessionIds.includes(id)) this.sessionIds.push(id);
    },
  };
  ctx.provide('workspaceRegistry', { async create(value) { calls.push(['create', value]); return workspace; } });
  for (const extra of [{ sessionId: 'other' }, { cwd: 'E:\\其它目录' }, { domain: 'knowledge' }]) assert.equal(code(await run(extra)), 'INPUT');
  agent.status = 'running';
  assert.equal(code(await run()), 'BUSY');
  agent.status = 'idle';
  delete agent.session.header.cwd;
  assert.equal(code(await run()), 'WORKSPACE_CWD');
  agent.session.header.cwd = cwd;
  assert.deepEqual(calls, []);
  persisted = false;
  assert.equal(code(await run()), 'PERSISTENCE');
  assert.deepEqual(calls, ['flush']);
  persisted = true; calls.length = 0;
  const result = await run();
  assert.equal(result.kind, 'success');
  assert.deepEqual(JSON.parse(result.text), { action: 'workspace_attach', sessionId: 'current-session', workspaceId: 'host-workspace' });
  assert.deepEqual(calls, ['flush', ['create', cwd], ['attach', 'current-session']]);
  assert.equal((await run()).kind, 'success');
  assert.deepEqual(workspace.sessionIds, ['current-session']);
  assert.equal(agent.session.header.cwd, cwd);
  assert.equal(await service.vault.initialized(), false);

  // 关联未知接受时保留同一身份，重试不创建替代会话或更改会话头。
  attachFailure = true;
  const partial = await run();
  assert.equal(code(partial), 'WORKSPACE_ATTACH');
  assert.match(JSON.parse(partial.text).message, /工作区已登记.*保留当前任务并重试/);
  attachFailure = false; readback = false; workspace.sessionIds = [];
  assert.equal(code(await run()), 'WORKSPACE_ATTACH');
  readback = true;
  assert.equal((await run()).kind, 'success');
  assert.deepEqual(workspace.sessionIds, ['current-session']);
  const controller = new AbortController(); controller.abort(new Error('已取消'));
  calls.length = 0;
  assert.equal((await run({}, controller.signal)).kind, 'error');
  assert.deepEqual(calls, []);
});

test('人工自动任务认领只接受独立standard空会话，关闭目录零知识初始化', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-auto-host-'));
  const ctx = new Context(); new TypertRegistry(ctx);
  t.after(async () => { await ctx.fiber.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  let command, purpose = null, events = [], flushed = 0;
  ctx.provide('commands', { register(value) { command = value; } });
  ctx.provide('sessions', { async flush() { flushed++; return true; } });
  ctx.provide('sessionQuery', {}); ctx.provide('skills', {});
  ctx.provide('sessionProjections', { register() {}, stateOf() { return { purpose }; } });
  const service = isolatedService(ctx, directory, { vaultRoot: path.join(directory, 'vault') });
  assert.equal((await service.manageAutomation({ action: 'catalog' })).available, false);
  assert.equal(await service.vault.initialized(), false); assert.equal(flushed, 0);
  const agent = { status: 'idle', session: { id: 'automation', header: { agentPreset: 'standard' }, snapshotEvents: () => events } };
  const run = input => command.handler({ agent, rawInput: JSON.stringify(input), signal: new AbortController().signal });
  const claim = { action: 'automation_claim', purpose: 'knowledge' };
  assert.deepEqual(JSON.parse((await run(claim)).text), claim);
  assert.equal(await service.vault.initialized(), false);
  assert.equal((await run({ ...claim, extra: true })).kind, 'error');
  events = [{ type: 'user/message' }]; assert.equal((await run(claim)).kind, 'error');
  events = []; agent.session.header.origin = 'subagent'; assert.equal((await run(claim)).kind, 'error');
  delete agent.session.header.origin; agent.session.header.agentPreset = 'minimal'; assert.equal((await run(claim)).kind, 'error');
  agent.session.header.agentPreset = 'standard'; purpose = 'custom'; assert.equal((await run(claim)).kind, 'error');
  purpose = 'knowledge'; assert.equal((await run(claim)).kind, 'success');
});

// Host、领域与持久域使用真实实现；只替换原生会话身份和网络响应边界。
async function featureHost(t, sharedStorage, sharedProfile) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-feature-host-')), profileDir = sharedProfile ?? path.join(directory, 'profile');
  await fs.mkdir(profileDir, { recursive: true });
  const ctx = new Context(); new TypertRegistry(ctx);
  t.after(async () => { await ctx.fiber.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root: sharedStorage ?? path.join(directory, 'storage') }); await ctx.plugin(StorageDomain, { backend: 'json' });
  ctx.provide('profileContext', { dir: profileDir });
  ctx.provide('commands', { register() {} });
  ctx.provide('sessions', { get: id => ({ id }), flush: async () => true });
  ctx.provide('sessionQuery', {}); ctx.provide('sessionProjections', { register() {} });
  ctx.provide('skills', { registerProvider: factory => factory({ signal: new AbortController().signal, invalidate() {} }) });
  ctx.provide('sessionController', { projections: async ({ sessionId }) => ({ values: { whalewingAutomation: sessionId === 'news-session' ? 'news' : null, whalewingWorkbench: false } }) });
  ctx.provide('whalewingExperts', { prepareModel: async () => ({ selected: { provider: 'fixture', model: 'system-default' } }) });
  let service;
  const fiber = ctx.plugin(child => { service = isolatedService(child, directory, { vaultRoot: path.join(directory, 'vault') }); });
  await fiber;
  return { ctx, directory, profileDir, service, fiber };
}

const hostNewsField = { name: '工作科技', focus: '与工作相关的技术信息', enabled: true, sources: [{ name: '测试订阅', url: 'https://example.com/feed', kind: 'primary', region: 'domestic' }] };

test('真实Typert与StorageDomain懒接线：资讯保存读回、重载保留且不初始化知识', async t => {
  const h = await featureHost(t);
  assert.ok(h.ctx.typert.getPackage('dsh-whalewing/news'));
  assert.ok(h.ctx.typert.getPackage('dsh-whalewing/model-world'));
  assert.equal(h.service.news, undefined); assert.equal(h.service.modelWorld, undefined);
  await assert.rejects(h.service.manageNews({ action: 'save', field: {} }));
  assert.equal(h.service.news, undefined);
  const list = await h.service.manageNews({ action: 'list' });
  assert.equal(list.fields[0].enabled, true); assert.equal(list.dependencies.scheduleAvailable, false);
  const saved = await h.service.manageNews({ action: 'save', id: 'work', expectedRevision: 0, field: hostNewsField });
  assert.equal(saved.field.revision, 1);
  assert.equal(h.service.newsDomain.table('fields').get('work').name, hostNewsField.name);
  assert.equal(await h.service.vault.initialized(), false);
  const first = h.service;
  await h.fiber.dispose();
  assert.equal(h.ctx.typert.getPackage('dsh-whalewing/news'), undefined);
  assert.equal(h.ctx.typert.getPackage('dsh-whalewing/model-world'), undefined);
  await assert.rejects(first.manageNews({ action: 'list' }), /卸载/);
  const remount = h.ctx.plugin(child => { h.service = isolatedService(child, h.directory, { vaultRoot: path.join(h.directory, 'vault') }); });
  await remount;
  assert.equal((await h.service.manageNews({ action: 'list' })).fields.find(field => field.id === 'work').revision, 1);
});

test('初始化失败可原入口恢复，并发资讯读取只打开一个真实域', async t => {
  const h = await featureHost(t), original = h.ctx.storageDomain.open.bind(h.ctx.storageDomain);
  let calls = 0;
  h.ctx.storageDomain.open = async spec => { calls++; if (calls === 1) throw new Error('独占夹具打开失败'); return original(spec); };
  await assert.rejects(h.service.manageNews({ action: 'list' }), /打开失败/);
  assert.equal(h.service.news, undefined); assert.equal(h.service.core.pending.size, 0);
  const values = await Promise.all([h.service.manageNews({ action: 'list' }), h.service.manageNews({ action: 'list' })]);
  assert.equal(calls, 2); assert.deepEqual(values[0], values[1]); assert.equal(h.service.core.pending.size, 0);
});

test('初始化迟到取消不进入业务，卸载等真实open返回并关闭域', async t => {
  const h = await featureHost(t), original = h.ctx.storageDomain.open.bind(h.ctx.storageDomain);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(); let closed = false;
  h.ctx.storageDomain.open = async spec => {
    const domain = await original(spec), close = domain.close.bind(domain);
    domain.close = async () => { await close(); closed = true; };
    entered.resolve(); await release.promise; return domain;
  };
  const controller = new AbortController();
  const reading = h.service.manageNews({ action: 'save', id: 'work', expectedRevision: 0, field: hostNewsField }, controller.signal);
  const rejected = assert.rejects(reading, /取消/);
  await entered.promise; controller.abort(new Error('取消初始化')); await rejected;
  assert.equal(h.service.news, undefined); assert.equal(h.service.core.pending.size, 1);
  const disposing = h.fiber.dispose();
  assert.equal(closed, false);
  release.resolve(); await disposing;
  assert.equal(closed, true); assert.equal(h.service.news, undefined); assert.equal(h.service.core.pending.size, 0);
});

test('资讯构造失败关闭已打开真实域并释放profile锁，原入口允许重试', async t => {
  const h = await featureHost(t), original = h.ctx.storageDomain.open.bind(h.ctx.storageDomain);
  let first = true, closed = false;
  h.ctx.storageDomain.open = async spec => {
    const domain = await original(spec);
    if (first) {
      first = false;
      const close = domain.close.bind(domain);
      domain.close = async () => { await close(); closed = true; };
      domain.table = () => { throw new Error('独占夹具构造失败'); };
    }
    return domain;
  };
  await assert.rejects(h.service.manageNews({ action: 'list' }), /构造失败/);
  assert.equal(closed, true); assert.equal(h.service.news, undefined);
  await assert.rejects(fs.stat(path.join(h.profileDir, 'whalewing-news.lock')), { code: 'ENOENT' });
  assert.equal((await h.service.manageNews({ action: 'list' })).fields[0].enabled, true);
});

test('资讯工具经Host统一生命周期到真实领域，采集预算不被知识operationMs截断', async t => {
  const h = await featureHost(t);
  const tools = new Map(); h.ctx.provide('tools', { register: tool => tools.set(tool.name, tool) });
  h.ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'danger-full-access' }) });
  applyTools(h.ctx);
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'news-session' } }, callId: 'news-fields' };
  await h.service.manageNews({ action: 'save', id: 'work', expectedRevision: 0, field: hostNewsField });
  const fields = JSON.parse(await tools.get('whalewing_news').execute({ action: 'fields' }, exec));
  assert.deepEqual(fields.fields.map(field => field.id), ['ai-technology', 'work']);
  await assert.rejects(tools.get('whalewing_news').execute({ action: 'fields' }, { ...exec, agent: { session: { id: 'ordinary' } } }), { code: 'NEWS_IDENTITY' });
  await assert.rejects(tools.get('whalewing_news').execute({ action: 'save' }, exec), { code: 'INVALID_ARGS' });
  h.service.vault.limits.operationMs = 1;
  h.service.news.now = () => Date.parse('2026-10-12T01:00:00Z');
  h.service.news.fetch = async (url, signal) => {
    // 此计时专门跨越被排除的知识预算，不用它判断初始化或资源就绪。
    await new Promise(resolve => setTimeout(resolve, 20)); signal.throwIfAborted();
    return { url, statusCode: 200, truncated: false, body: { kind: 'text', content: '<rss><channel><item><title>模型更新</title><link>https://example.com/update</link><pubDate>2026-10-11T12:00:00Z</pubDate><description>正式公告摘要。</description></item></channel></rss>' } };
  };
  const candidates = JSON.parse(await tools.get('whalewing_news').execute({ action: 'candidates', fieldId: 'work' }, exec));
  assert.equal(candidates.candidates.length, 1);
  const result = JSON.parse(await tools.get('whalewing_news').execute({ action: 'submit', receipt: candidates.receipt, items: [{ sourceIds: [candidates.candidates[0].id], category: 'model', label: 'official', title: '厂商发布「模型更新」', link: candidates.candidates[0].url, brief: '正式发布更新。', relevance: '与工作有关。', eventKey: '模型更新事件' }] }, exec));
  assert.equal(result.completed, true);
  assert.equal((await h.service.manageNews({ action: 'report', fieldId: 'work', cutoff: candidates.cutoff })).report.items.length, 1);
  assert.equal(await h.service.vault.initialized(), false); assert.equal(h.service.core.pending.size, 0);
});

test('模型世界采用实际profile缓存且不依赖模型，缺profile不写全局目录', async t => {
  const h = await featureHost(t);
  assert.equal(h.service.modelWorld, undefined);
  const empty = await h.service.manageModelWorld({ action: 'list' });
  assert.equal(empty.available, false); assert.equal(empty.total, 0);
  assert.equal(h.service.modelWorld.root, path.join(await fs.realpath(h.profileDir), 'cache', 'whalewing-model-world'));
  assert.equal(typeof h.service.modelWorld.fetcher.fetch, 'function');
  assert.equal(await h.service.vault.initialized(), false);
  await h.fiber.dispose();
  await assert.rejects(h.service.manageModelWorld({ action: 'status' }), /卸载/);
  const rootless = new Context(); new TypertRegistry(rootless);
  for (const name of ['commands', 'sessionProjections']) rootless.provide(name, { register() {} });
  for (const name of ['sessions', 'sessionQuery', 'skills']) rootless.provide(name, {});
  const service = isolatedService(rootless, h.directory, { vaultRoot: path.join(h.directory, 'missing-vault') });
  t.after(() => rootless.fiber.dispose());
  await assert.rejects(service.manageModelWorld({ action: 'status' }), { code: 'PROFILE_UNAVAILABLE' });
  await assert.rejects(service.manageNews({ action: 'list' }), { code: 'PROFILE_UNAVAILABLE' });
  assert.equal(service.modelWorld, undefined); assert.equal(await service.vault.initialized(), false);
});

test('双Host同实际profile争锁，关闭domain后才释放；大小写别名重载读同域', async t => {
  const first = await featureHost(t), storage = path.join(first.directory, 'storage');
  const alias = process.platform === 'win32' ? first.profileDir.toUpperCase() : first.profileDir;
  const second = await featureHost(t, storage, alias);
  const names = [];
  for (const host of [first, second]) {
    const original = host.ctx.storageDomain.open.bind(host.ctx.storageDomain);
    host.ctx.storageDomain.open = spec => { assert.equal(spec.tables, newsDomain.tables); assert.equal(spec.version, newsDomain.version); names.push(spec.name); return original(spec); };
  }
  await first.service.manageNews({ action: 'save', id: 'work', expectedRevision: 0, field: hostNewsField });
  const lock = path.join(await fs.realpath(first.profileDir), 'whalewing-news.lock');
  assert.ok(await fs.stat(lock));
  await assert.rejects(second.service.manageNews({ action: 'list' }), /writer lock/);
  assert.equal(second.service.news, undefined); assert.equal(names.length, 1);
  assert.equal((await second.service.manageModelWorld({ action: 'status' })).available, false, '锁竞争只阻断资讯');
  const close = first.service.newsDomain.close.bind(first.service.newsDomain);
  first.service.newsDomain.close = async () => { assert.ok(await fs.stat(lock), 'domain关闭时仍持有原生锁'); await close(); };
  await first.fiber.dispose();
  await assert.rejects(fs.stat(lock), { code: 'ENOENT' });
  const reloaded = await second.service.manageNews({ action: 'list' });
  assert.equal(reloaded.fields.find(field => field.id === 'work').revision, 1);
  assert.equal(names[0], names[1]); assert.match(names[0], /^whalewing_news_[a-f0-9]{64}$/);
  await second.fiber.dispose();
});

test('不同profile共享宿主storage后端仍隔离资讯配置与域身份', async t => {
  const first = await featureHost(t), second = await featureHost(t, path.join(first.directory, 'storage'));
  await first.service.manageNews({ action: 'save', id: 'work', expectedRevision: 0, field: hostNewsField });
  const other = await second.service.manageNews({ action: 'list' });
  assert.equal(other.fields.some(field => field.id === 'work'), false);
  await second.service.manageNews({ action: 'save', id: 'work', expectedRevision: 0, field: { ...hostNewsField, name: '另一profile领域' } });
  assert.equal((await first.service.manageNews({ action: 'list' })).fields.find(field => field.id === 'work').name, hostNewsField.name);
  assert.equal((await second.service.manageNews({ action: 'list' })).fields.find(field => field.id === 'work').name, '另一profile领域');
  await second.fiber.dispose(); await first.fiber.dispose();
});

test('资讯可信计划经过统一Host与原生Schedule，关闭末领域先暂停再保存', async t => {
  const h = await featureHost(t);
  h.ctx.provide('agents', { roots: () => [], withoutInitiator: fn => fn() });
  h.ctx.provide('tools', {}); h.ctx.provide('sessionPersistence', {});
  const schedule = new Schedule(h.ctx, {}), create = schedule.create.bind(schedule);
  // 基线原生服务尚无pause；此边界夹具仅验证插件参数与权威读回，新适配运行时另验真实暂停。
  const catalog = schedule.catalog.bind(schedule), list = schedule.list.bind(schedule), paused = new Set();
  schedule.catalog = async () => (await catalog()).map(row => paused.has(row.id) ? { ...row, status: 'paused' } : row);
  schedule.list = async request => (await list(request)).filter(row => !paused.has(row.id));
  schedule.pause = async request => {
    const row = (await schedule.catalog()).find(row => row.id === request.id && row.sessionId === request.sessionId);
    const { sessionId: _, status, lastDelivery: __, ...record } = row;
    assert.equal(request.expectedStatus, status); assert.deepEqual(request.expected, record);
    paused.add(row.id); return { id: row.id, updated: true, record };
  };
  let lockedDuringCreate = false;
  schedule.create = async (...args) => { lockedDuringCreate = h.service.news.writing; return create(...args); };
  await h.service.manageNews({ action: 'save', id: 'work', expectedRevision: 0, field: hostNewsField });
  await h.service.manageNews({ action: 'save', id: 'ai-technology', expectedRevision: 1, field: { ...hostNewsField, enabled: false } });
  const { task } = await h.service.manageAutomation({ action: 'create', sessionId: 'news-session', purpose: 'news' });
  assert.equal(lockedDuringCreate, true); assert.equal(task.time, '08:00:00.000'); assert.equal(task.timeZone, 'Asia/Shanghai');
  assert.match(task.prompt, /whalewing_news fields/);
  const close = { action: 'save', id: 'work', expectedRevision: 1, field: { ...hostNewsField, enabled: false } };
  await assert.rejects(h.service.manageNews(close), { code: 'NEWS_CANCEL_CONFIRM' });
  assert.equal((await schedule.list({ sessionId: 'news-session' })).length, 1);
  const disabled = await h.service.manageNews({ ...close, confirmCancel: true });
  assert.equal(disabled.field.enabled, false); assert.equal((await schedule.catalog())[0].status, 'paused'); assert.equal((await schedule.catalog())[0].id, task.id);
  assert.equal(h.service.news.writing, false); assert.equal(h.service.automation.writing, false);
});

test('候选返回后清除Host请求超时，receipt仍保留但真实用户取消撤销它', async t => {
  const h = await featureHost(t);
  await h.service.manageNews({ action: 'save', id: 'work', expectedRevision: 0, field: hostNewsField });
  h.service.news.now = () => Date.parse('2026-10-12T01:00:00Z');
  h.service.news.fetch = async url => ({ url, statusCode: 200, truncated: false, body: { kind: 'text', content: '<rss><channel/></rss>' } });
  const previous = newsLimits.deadlineMs, controller = new AbortController();
  try {
    newsLimits.deadlineMs = 200;
    const result = await h.service.executeNews({ action: 'candidates', fieldId: 'work' }, { agent: { session: { id: 'news-session' } }, signal: controller.signal });
    // 此等待跨越被测请求deadline，断言其不会在操作完成后撤销已返回凭据。
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(h.service.news.receipts.has(result.receipt), true);
    controller.abort(new Error('员工取消后续生成'));
    assert.equal(h.service.news.receipts.has(result.receipt), false);
  } finally { newsLimits.deadlineMs = previous; }
});

for (const feature of ['news', 'model']) test(`卸载在途${feature}采集先取消真实读取并排空，再关闭资源`, async t => {
  const h = await featureHost(t), entered = Promise.withResolvers(); let stopped = false;
  const read = async (_request, signal) => {
    entered.resolve();
    await new Promise((_, reject) => signal.addEventListener('abort', () => { stopped = true; reject(signal.reason); }, { once: true }));
  };
  let pending;
  if (feature === 'news') {
    await h.service.manageNews({ action: 'save', id: 'work', expectedRevision: 0, field: hostNewsField });
    h.service.news.fetch = read;
    pending = h.service.executeNews({ action: 'candidates', fieldId: 'work' }, { agent: { session: { id: 'news-session' } } });
  } else {
    await h.service.manageModelWorld({ action: 'status' });
    h.service.modelWorld.fetcher = { fetch: read };
    pending = h.service.manageModelWorld({ action: 'refresh' });
  }
  const rejected = assert.rejects(pending, /卸载|关闭|取消/);
  await entered.promise; await h.fiber.dispose(); await rejected;
  assert.equal(stopped, true); assert.equal(h.service.core.pending.size, 0);
  if (feature === 'news') {
    assert.equal(h.service.news.running.size, 0);
    await assert.rejects(fs.stat(path.join(h.profileDir, 'whalewing-news.lock')), { code: 'ENOENT' });
  }
});

// 构造时解析一次隔离根，立即恢复进程环境，测试不会触及真实员工技能目录。
function isolatedService(ctx, directory, config) {
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = path.join(directory, "dsh");
  try { return new Whalewing(ctx, config); }
  finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; }
}


test('Host服务就绪自动初始化默认资讯，不打开页面也不初始化知识', { timeout: 10000 }, async t => {
  const h = await featureHost(t), records = [], sessions = new Map(), purposes = new Map();
  let created = 0, claims = 0;
  h.ctx.provide('agents', { get: id => sessions.get(id) });
  Object.assign(h.ctx.get('sessionController'), {
    create: async ({ sessionId, cwd, agentPreset }) => { created++; assert.equal(cwd, await fs.realpath(path.join(h.directory, 'dsh', 'whalewing-tasks'))); assert.equal(agentPreset, 'standard'); sessions.set(sessionId, { session: { id: sessionId } }); return { sessionId, agentPreset }; },
    projections: async ({ sessionId }) => ({ values: { whalewingAutomation: purposes.get(sessionId) ?? null } }),
  });
  Object.assign(h.ctx.get('commands'), { execute: async (agent, line) => { claims++; assert.match(line, /automation_claim/); purposes.set(agent.session.id, 'news'); return { result: { kind: 'success' } }; } });
  const accepted = Promise.withResolvers();
  h.ctx.provide('schedule', {
    catalog: async () => structuredClone(records),
    create: async (sessionId, spec) => {
      assert.equal(spec.daily.time, '08:00:00'); assert.equal(spec.daily.time_zone, 'Asia/Shanghai');
      const task = { id: 'native-default', kind: 'daily', title: spec.title, prompt: spec.prompt, scheduledAt: '2030-01-02T00:00:00Z', time: '08:00:00.000', timeZone: 'Asia/Shanghai' };
      records.push({ ...task, sessionId, status: 'active' }); accepted.resolve(); return task;
    },
  });
  await accepted.promise;
  await h.service.automation.initializing;
  assert.equal(created, 1); assert.equal(claims, 1); assert.equal(await h.service.vault.initialized(), false);
  assert.deepEqual(h.service.news.lifecycleTable.get('default-news'), { accepted: true });
  records.length = 0;
  await h.service.manageAutomation({ action: 'initializeNews' });
  assert.equal(created, 1); assert.equal(records.length, 0);
  // 自定义与知识任务从同一入口取得执行目录，与资讯一致。
  assert.deepEqual(await h.service.manageAutomation({ action: 'directory' }), { directory: await fs.realpath(path.join(h.directory, 'dsh', 'whalewing-tasks')) });
});

test('任务目录在 DSH 数据目录下，加载即登记为“鲸翼定时任务”工作区，资讯会话直接建在其中', { timeout: 10000 }, async t => {
  const h = await featureHost(t);
  const calls = [], workspace = { id: 'tasks-workspace' };
  h.ctx.provide('workspaceRegistry', { async create(directory, title) { calls.push([directory, title]); return workspace; } });
  assert.equal(await h.service.taskWorkspace(), workspace);
  const expected = await fs.realpath(path.join(h.directory, 'dsh', 'whalewing-tasks'));
  assert.deepEqual(calls.at(-1), [expected, '鲸翼定时任务']);
  assert.ok(!expected.startsWith(await fs.realpath(h.profileDir)), '不放在 profile 目录里');
  let request;
  h.ctx.provide('agents', { get: () => undefined });
  Object.assign(h.ctx.get('sessionController'), { create: async input => { request = input; throw new Error('只核对请求'); } });
  await assert.rejects(h.service.automation.dependencies.createNewsSession('whalewing-news-test'), /只核对请求/);
  assert.deepEqual(request, { sessionId: 'whalewing-news-test', workspaceId: 'tasks-workspace', agentPreset: 'standard' });
});
