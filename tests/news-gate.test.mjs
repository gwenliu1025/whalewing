import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import Sessions from '@deepseek-ai/dsh-session';
import Projections from '@deepseek-ai/dsh-session-projection';
import Commands from '@deepseek-ai/dsh-commands';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import Agents from '@deepseek-ai/dsh-agent';
import Loop from '@deepseek-ai/dsh-agent-loop';
import * as JsonlModule from '@deepseek-ai/dsh-session-persistence-jsonl';
import SessionQuery from '@deepseek-ai/dsh-session-query';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Schedule from '@deepseek-ai/dsh-schedule';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import Cards from '../features/cards/host.js';
import { mountFeatures } from './feature-fixture.mjs';

// 两版 JSONL 的 Cordis 入口分别是默认类和具名 apply；测试仍加载当前真实实现。
const Persistence = JsonlModule.default ?? JsonlModule;

const notice = '「知识卡片」已关闭，本次资讯未生成';
const message = (kind, text) => createUserMessage({ source: { kind }, content: [{ type: 'text', text }] });
const notices = events => events.filter(event => event.type === 'command/done' && event.data.kind === 'success' && event.data.text === notice);

// 模型仅用内存adapter；Schedule、inbox、AgentLoop、命令和JSONL均使用实际运行依赖。
class Adapter extends LlmAdapter {
  requests = [];
  async resolveModel(provider, model) { return { provider, id: model, name: model }; }
  async *stream(options) {
    this.requests.push(options);
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: '隔离模型响应' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: '隔离模型响应' } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

async function waitFor(predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function harness(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-news-gate-'));
  const ctx = new Context(), handles = [], restores = [], adapter = new Adapter();
  let scheduleFiber;
  t.after(async () => {
    for (const restore of restores.reverse()) await restore();
    await scheduleFiber?.dispose();
    for (const handle of handles.reverse()) await handle.dispose();
    await ctx.fiber.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  new TypertRegistry(ctx);
  await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root: path.join(directory, 'storage') }); await ctx.plugin(StorageDomain, { backend: 'json' });
  for (const plugin of [LlmRuntime, Sessions, Projections, Commands]) await ctx.plugin(plugin);
  await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
  for (const plugin of [Tools, Agents]) await ctx.plugin(plugin);
  await ctx.plugin(Persistence, { root: path.join(directory, 'sessions'), compression: 'none' });
  await ctx.plugin(SessionQuery); await ctx.plugin(Loop, { agents: [] });
  ctx.llm.registerAdapter(['fixture'], adapter);
  ctx.provide('skills', { registerProvider() {}, async list() { return []; } });
  // 原生Schedule经此边界取得测试已经建立的真实Agent；不实现第二套投递或冷恢复算法。
  ctx.provide('sessionController', { async resolveAgent(id) { const agent = ctx.agents.get(id); return agent ? { agent } : { error: new Error('测试会话尚未恢复') }; } });
  const mounted = await mountFeatures(ctx, directory, {}, false);
  scheduleFiber = await ctx.plugin(Schedule, {});
  const create = async (id, purpose = 'news') => {
    const handle = await ctx.agents.create({ sessionId: id, meta: { agentPreset: 'standard' }, agentOptions: { provider: 'fixture', model: 'fixture' } });
    handles.push(handle);
    if (purpose) {
      const result = await ctx.commands.execute(handle.agent, `/whalewing ${JSON.stringify({ action: 'automation_claim', purpose })}`, [], new AbortController().signal);
      assert.equal(result.result.kind, 'success');
    }
    assert.equal(await ctx.sessions.flush(handle.agent.session), true);
    return handle;
  };
  const delivered = async id => (await ctx.schedule.catalog()).find(task => task.id === id)?.lastDelivery;
  const due = async (agent, prompt) => {
    const task = await ctx.schedule.create(agent.id, { prompt, title: '隔离到点任务', after_seconds: 1 });
    await waitFor(() => delivered(task.id), '原生投递回执'); await agent.whenIdle();
    return task;
  };
  const disk = async agent => readFile(ctx.sessionPersistence.locate(agent.session.header).path, 'utf8');
  return { ctx, directory, adapter, handles, restore: fn => restores.push(fn), ...mounted, create, due, delivered, disk };
}


test('真实到点、活动登记、JSONL冷读、混合输入、周期推进与核心退出', { timeout: 90000 }, async t => {
  const h = await harness(t), { ctx, adapter } = h;
  const owned = await h.create('news'), news = owned.agent;
  const recurring = await ctx.schedule.create(news.id, { title: '保留的周期资讯', prompt: '周期资讯输入', every_seconds: 60 });
  await t.test('关闭后真实投递完成但模型为零，说明落盘', async () => {
    await h.due(news, '关闭状态不应发给模型');
    assert.equal(adapter.requests.length, 0);
    assert.equal(notices(news.session.snapshotEvents()).length, 1);
    assert.match(await h.disk(news), /「知识卡片」已关闭，本次资讯未生成/);
  });
  await t.test('真实Cards登记开启恢复，撤销后下一次再拦截', async () => {
    const cards = await ctx.plugin(Cards);
    assert.ok(ctx.whalewing.features().features.some(feature => feature.id === 'cards' && feature.kind === 'optional'));
    await h.due(news, '开启后资讯输入'); assert.equal(adapter.requests.length, 1);
    await cards.dispose();
    assert.equal(ctx.whalewing.features().features.some(feature => feature.id === 'cards'), false);
    await h.due(news, '再次关闭的资讯输入'); assert.equal(adapter.requests.length, 1);
    assert.equal(notices(news.session.snapshotEvents()).length, 2);
  });
  await t.test('非news定时任务不受影响', async () => {
    const { agent } = await h.create('ordinary', 'custom');
    await h.due(agent, '普通定时输入'); assert.equal(adapter.requests.length, 2);
    assert.equal(notices(agent.session.snapshotEvents()).length, 0);
  });
  await t.test('资讯会话中的纯人工请求正常执行', async () => {
    news.followup(message('user', '纯人工输入')); await news.whenIdle();
    assert.equal(adapter.requests.length, 3);
  });
  await t.test('同批保留人工消息和后续决策字段，不把定时消息送到模型', async () => {
    const { agent } = await h.create('mixed');
    let observed;
    const stopDecorate = ctx.on('agent/pre-step', async (_payload, next) => ({ ...await next(), startsRequestSeries: true }));
    const stopObserve = ctx.on('agent/pre-step', async (_payload, next) => { observed = await next(); return observed; }, { prepend: true });
    try {
      agent.inject(message('schedule', 'MUST_NOT_REACH_MODEL'));
      agent.followup(message('user', 'USER_MUST_REACH_MODEL')); await agent.whenIdle();
      assert.equal(observed.kind, 'enter'); assert.equal(observed.startsRequestSeries, true);
    } finally { stopObserve(); stopDecorate(); }
    assert.equal(adapter.requests.length, 4);
    const request = JSON.stringify(adapter.requests.at(-1));
    assert.ok(request.includes('USER_MUST_REACH_MODEL')); assert.ok(!request.includes('MUST_NOT_REACH_MODEL'));
    assert.equal(notices(agent.session.snapshotEvents()).length, 1);
    assert.equal(await ctx.sessions.flush(agent.session), true);
  });
  await t.test('同一输入再次执行不重复说明，JSONL冷读与恢复后仍去重', async () => {
    const handle = await h.create('repeat'), input = message('schedule', '同一来源输入');
    handle.agent.followup(input); await handle.agent.whenIdle();
    handle.agent.followup(input); await handle.agent.whenIdle();
    assert.equal(notices(handle.agent.session.snapshotEvents()).length, 1);
    await handle.dispose();
    const cold = await ctx.sessionQuery.readSession('repeat');
    assert.equal(notices(cold.events).length, 1);
    assert.ok(Number.isSafeInteger(notices(cold.events)[0].data.sourceEventSeq));
    const restored = await ctx.agents.resume({ resumeSessionId: 'repeat', agentOptions: { provider: 'fixture', model: 'fixture' } }); h.handles.push(restored);
    restored.agent.followup(input); await restored.agent.whenIdle();
    assert.equal(notices(restored.agent.session.snapshotEvents()).length, 1);
    assert.equal(adapter.requests.length, 4);
  });
  await t.test('原生周期任务保留且推进下次时间，不修改其prompt', async () => {
    await waitFor(() => h.delivered(recurring.id), '真实60秒周期投递', 70000); await news.whenIdle();
    const row = (await ctx.schedule.catalog()).find(task => task.id === recurring.id);
    assert.equal(row.status, 'active'); assert.equal(row.prompt, recurring.prompt);
    assert.ok(Date.parse(row.scheduledAt) > Date.parse(recurring.scheduledAt));
    assert.equal(adapter.requests.length, 4);
    await ctx.schedule.delete({ id: recurring.id, sessionId: news.id });
  });
  await t.test('核心卸载后钩子退出，原生投递仍工作', async () => {
    const before = notices(news.session.snapshotEvents()).length;
    await h.fiber.dispose(); await h.due(news, '核心退出后对照');
    assert.equal(notices(news.session.snapshotEvents()).length, before);
    assert.equal(adapter.requests.length, 5);
  });
});

for (const mode of ['false', 'throw', 'unknown']) test(`跳过说明持久化${mode}：恢复原批次且不自动重试，修复后同源去重`, { timeout: 15000 }, async t => {
  const h = await harness(t), { ctx, adapter } = h, { agent } = await h.create('failed');
  const flush = ctx.sessions.flush.bind(ctx.sessions), errors = [];
  ctx.on('agent/error', payload => errors.push(payload.error));
  h.restore(() => { ctx.sessions.flush = flush; });
  let checkpoints = 0;
  ctx.sessions.flush = async session => {
    checkpoints++;
    if (mode === 'unknown') await flush(session);
    if (mode === 'false') return false;
    throw new Error(mode === 'unknown' ? '写入已接纳但检查点结果未知' : '检查点写入失败');
  };
  agent.inject(message('schedule', '恢复定时输入'));
  agent.followup(message('user', '恢复人工输入')); await agent.whenIdle();
  assert.equal(adapter.requests.length, 0); assert.equal(checkpoints, 1); assert.ok(errors.length);
  const pending = ctx.sessionProjections.stateOf(agent.session, 'inbox')['next-step'];
  assert.deepEqual(pending.map(input => input.source.kind), ['schedule', 'user']);
  ctx.sessions.flush = flush;
  agent.followup(message('user', '员工明确重试')); await agent.whenIdle();
  assert.equal(adapter.requests.length, 1);
  assert.ok(JSON.stringify(adapter.requests[0]).includes('恢复人工输入'));
  assert.ok(!JSON.stringify(adapter.requests[0]).includes('恢复定时输入'));
  assert.equal(notices(agent.session.snapshotEvents()).length, 1);
  await flush(agent.session); assert.match(await h.disk(agent), /「知识卡片」已关闭/);
});

for (const mode of ['unload', 'cancel', 'keepInbox']) test(`跳过检查点在途${mode}尊重原生取消与卸载边界`, { timeout: 15000 }, async t => {
  const h = await harness(t), { ctx, adapter } = h, { agent } = await h.create('interrupted');
  const flush = ctx.sessions.flush.bind(ctx.sessions), entered = Promise.withResolvers(), release = Promise.withResolvers();
  h.restore(() => { release.resolve(); ctx.sessions.flush = flush; });
  ctx.sessions.flush = async session => { entered.resolve(); await release.promise; return flush(session); };
  agent.inject(message('schedule', '在途定时输入'));
  agent.followup(message('user', '在途人工输入')); await entered.promise;
  let disposal;
  if (mode === 'unload') disposal = h.fiber.dispose();
  else {
    agent.inject(message('user', '取消时仍在等待的后续输入'));
    agent.cancel({ kind: 'user' }, { keepInbox: mode === 'keepInbox' });
  }
  release.resolve(); await agent.whenIdle(); await disposal;
  assert.equal(adapter.requests.length, 0);
  const pending = ctx.sessionProjections.stateOf(agent.session, 'inbox')['next-step'];
  if (mode === 'unload') assert.deepEqual(pending.map(input => input.source.kind), ['schedule', 'user']);
  else if (mode === 'cancel') assert.equal(pending.length, 0);
  else { assert.equal(pending.length, 1); assert.ok(JSON.stringify(pending).includes('后续输入')); }
  ctx.sessions.flush = flush;
  await flush(agent.session); assert.match(await h.disk(agent), /「知识卡片」已关闭/);
});

test('恢复输入失败显式报错，不把部分恢复当作无损完成', { timeout: 15000 }, async t => {
  const h = await harness(t), { ctx, adapter } = h, { agent } = await h.create('restore-failed');
  const errors = []; ctx.on('agent/error', payload => errors.push(payload.error));
  const flush = ctx.sessions.flush.bind(ctx.sessions), inject = agent.inject.bind(agent);
  h.restore(() => { ctx.sessions.flush = flush; agent.inject = inject; });
  ctx.sessions.flush = async () => false;
  agent.inject = () => { throw new Error('inbox恢复写入失败'); };
  agent.followup(message('schedule', '失败恢复输入')); await agent.whenIdle();
  assert.equal(adapter.requests.length, 0);
  assert.ok(errors.some(error => error instanceof AggregateError && error.errors.some(cause => /恢复写入失败/.test(cause.message))));
  ctx.sessions.flush = flush; agent.inject = inject;
});


test('说明追加失败退还输入，原生上游拒绝和人工伪造跳过不生成说明', { timeout: 15000 }, async t => {
  const h = await harness(t), { ctx, adapter } = h, { agent } = await h.create('notice-failed');
  const execute = ctx.commands.execute.bind(ctx.commands), errors = [];
  ctx.on('agent/error', payload => errors.push(payload.error));
  h.restore(() => { ctx.commands.execute = execute; });
  const forged = await execute(agent, '/whalewing {"action":"automation_skip"}', [], new AbortController().signal);
  assert.equal(forged.result.kind, 'error');
  ctx.commands.execute = (...args) => { if (args[1].includes('automation_skip')) throw new Error('说明追加失败'); return execute(...args); };
  const input = message('schedule', '待恢复说明的输入'); agent.followup(input); await agent.whenIdle();
  assert.equal(adapter.requests.length, 0); assert.equal(notices(agent.session.snapshotEvents()).length, 0);
  assert.ok(errors.some(error => /说明追加失败/.test(error.message)));
  assert.equal(ctx.sessionProjections.stateOf(agent.session, 'inbox')['next-step'][0].id, input.id);
  ctx.commands.execute = execute;
  const other = await h.create('already-rejected');
  const stop = ctx.on('agent/pre-step', async () => ({ kind: 'reject' }));
  try { other.agent.followup(message('schedule', '由其它门拒绝')); await other.agent.whenIdle(); }
  finally { stop(); }
  assert.equal(notices(other.agent.session.snapshotEvents()).length, 0); assert.equal(adapter.requests.length, 0);
});
