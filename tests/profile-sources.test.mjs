import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WhalewingCore } from '../src/service.js';
import { automationIdentity } from '../src/identity.js';
import { Automation } from '../features/automation/automation.js';

const note = title => `---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-12\nupdated: 2026-10-12\naliases: []\n---\n\n# ${title}\n\n测试来源有依据的工作结论。\n`;
async function fixture(t, count = 45) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-profile-'));
  const headers = new Map(), snapshots = new Map(), purposes = new Map([['knowledge', 'knowledge']]);
  for (let i = 0; i < count; i++) {
    const id = 's-' + String(i).padStart(3, '0');
    const header = { id, cwd: root, createdAt: Date.parse('2026-10-12T00:00:00Z') + i * 1000 };
    headers.set(id, header);
    snapshots.set(id, { session: header, inheritedEventCount: 0, events: [{ type: 'user/message', seq: 0, time: '2026-10-12T00:00:00Z', data: { content: [{ type: 'text', text: '工作事实' }] } }] });
  }
  let enabled = true;
  const dependencies = {
    skillsRoot: path.join(root, 'skills'),
    schedule: () => ({ catalog: async () => enabled ? [{ sessionId: 'knowledge', status: 'active' }] : [] }),
    readSourceScope: (accept, signal) => { signal?.throwIfAborted(); return accept({ tasks: enabled ? [{ sessionId: 'knowledge', status: 'active' }] : [], workspaces: [] }); },
    listSessions: async () => [...headers.values()].reverse().map(header => ({ header })),
    automationIdentity: async id => purposes.get(id) ?? null,
    readSession: async id => structuredClone(snapshots.get(id)),
  };
  const core = new WhalewingCore(path.join(root, 'vault'), dependencies);
  const actor = { kind: 'model', agent: { session: { id: 'knowledge' } } }, human = { kind: 'human', agent: { session: { id: 'manual' } } };
  t.after(async () => { await core.dispose(); await fs.rm(root, { recursive: true, force: true }); });
  return { core, actor, human, headers, snapshots, purposes, dependencies, disable() { enabled = false; }, enable() { enabled = true; } };
}

test('超过32普通来源公平分批，新会话下一圈纳入且扫描位置不等于成功覆盖', async t => {
  const h = await fixture(t), visited = [];
  for (let i = 0; i < 5; i++) {
    const result = await h.core.execute({ action: 'sources' }, h.actor);
    visited.push(...result.sources.map(row => row.sessionId));
    assert.equal(result.hasMore, i < 4);
    assert.equal(result.savedCoverageCount, 0);
  }
  assert.equal(new Set(visited).size, 45);
  const settings = await h.core.vault.settings();
  assert.deepEqual(settings.sources, []); assert.deepEqual(settings.profileCoverage, { through: [], scanAfter: null });
  h.headers.set('new', { id: 'new', cwd: 'fixture', createdAt: Date.parse('2026-10-11T00:00:00Z') });
  assert.equal((await h.core.execute({ action: 'sources' }, h.actor)).sources[0].sessionId, 'new');
});

test('排除子代理和取消后的自动化会话，普通fork仅读取自有事件', async t => {
  const h = await fixture(t, 4);
  h.headers.get('s-000').origin = 'subagent';
  h.purposes.set('s-001', 'custom');
  const fork = h.snapshots.get('s-002');
  fork.session.parentSession = 'parent'; fork.inheritedEventCount = 1;
  fork.events.push({ ...fork.events[0], seq: 1, data: { content: [{ type: 'text', text: 'fork 自有事实' }] } });
  const listing = await h.core.execute({ action: 'sources' }, h.actor);
  assert.deepEqual(listing.sources.map(row => row.sessionId), ['s-002', 's-003']);
  const page = await h.core.execute({ action: 'source_read', sessionId: 's-002' }, h.actor);
  assert.equal(page.afterSeq, 0); assert.equal(page.events.length, 1); assert.equal(page.events[0].text, 'fork 自有事实');
  await assert.rejects(h.core.execute({ action: 'source_read', sessionId: 's-001' }, h.actor), { code: 'SOURCE_SCOPE' });
  await assert.rejects(h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.actor), { code: 'SOURCE_SCOPE' });
});

test('坏来源保留失败且不阻塞后续页，未知投影不视为普通会话', async t => {
  const h = await fixture(t, 12);
  h.dependencies.automationIdentity = async id => { if (id === 's-001') throw new Error('日志损坏'); return h.purposes.get(id) ?? null; };
  const first = await h.core.execute({ action: 'sources' }, h.actor);
  assert.equal(first.issues[0].sessionId, 's-001'); assert.equal(first.sources.length, 9);
  const second = await h.core.execute({ action: 'sources' }, h.actor);
  assert.deepEqual(second.sources.map(row => row.sessionId), ['s-010', 's-011']);
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, []);
});

test('旧登记覆盖只迁移一次且原件保持；人工旧凭据及第二账本失效', async t => {
  const h = await fixture(t, 2);
  await h.core.execute({ action: 'source_add', sessionId: 's-000' }, h.human);
  const old = await h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.human);
  const previous = structuredClone((await h.core.vault.settings()).sources);
  await h.core.execute({ action: 'sources' }, h.actor);
  assert.deepEqual((await h.core.vault.settings()).sources, previous);
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, [{ sessionId: 's-000', throughSeq: -1 }]);
  await assert.rejects(h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.human), { code: 'SOURCE_MODE' });
  await assert.rejects(h.core.execute({ action: 'complete', receipt: old.receipt, outputs: [], summary: '旧凭据应当已经作废' }, h.human), { code: 'RECEIPT' });
  await assert.rejects(h.core.execute({ action: 'source_remove', sessionId: 's-000' }, h.human), { code: 'SOURCE_MODE' });
});

test('全profile覆盖只在成果回读校验后提交，失败及取消原游标保持', async t => {
  const h = await fixture(t, 2);
  await h.core.execute({ action: 'sources' }, h.actor);
  const page = await h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.actor);
  const output = await h.core.execute({ action: 'write', path: '40-知识/结果.md', content: note('结果'), expectedHash: '' }, h.actor);
  await assert.rejects(h.core.execute({ action: 'complete', receipt: page.receipt, outputs: [{ ...output, hash: 'wrong' }], summary: '实际回读产物失败测试' }, h.actor), { code: 'CONFLICT' });
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, []);
  const result = await h.core.execute({ action: 'complete', receipt: page.receipt, outputs: [output], summary: '实际回读产物且完成校验' }, h.actor);
  assert.equal(result.source.throughSeq, 0);
  assert.equal((await h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.actor)).events.length, 0);
  const pending = await h.core.execute({ action: 'source_read', sessionId: 's-001' }, h.actor);
  h.disable();
  await assert.rejects(h.core.execute({ action: 'complete', receipt: pending.receipt, outputs: [output], summary: '计划已取消应拒绝提交' }, h.actor), { code: 'SOURCE_MODE' });
  assert.equal((await h.core.vault.settings()).profileCoverage.through.length, 1);
});

test('未启用任务不读取目录；取消在途目录读取不发布或推进扫描', async t => {
  const h = await fixture(t, 1);
  let reads = 0; const original = h.dependencies.listSessions;
  h.dependencies.listSessions = async (...args) => { reads++; return original(...args); };
  h.disable();
  await assert.rejects(h.core.execute({ action: 'sources' }, h.actor), { code: 'SOURCE_MODE' });
  assert.equal(reads, 0);
  h.enable();
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), controller = new AbortController();
  h.dependencies.listSessions = async () => { entered.resolve(); await release.promise; return original(); };
  const pending = h.core.execute({ action: 'sources' }, { ...h.actor, signal: controller.signal });
  const rejected = assert.rejects(pending, /取消/);
  await entered.promise; controller.abort(new Error('取消目录读取')); await rejected; release.resolve();
  assert.equal((await h.core.vault.settings()).profileCoverage.scanAfter, null);
  assert.equal(h.core.profileSources.scanning, false);
});

for (const action of ['source_add', 'source_remove']) test(`全profile迁移先于${action}取得锁时拒收旧登记写入`, async t => {
  const h = await fixture(t, 2);
  await h.core.execute({ action: 'source_add', sessionId: 's-000' }, h.human);
  const preserved = structuredClone((await h.core.vault.settings()).sources);
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const update = h.core.vault.updateSettings.bind(h.core.vault);
  let held = false;
  h.core.vault.updateSettings = async (...args) => { if (!held) { held = true; entered.resolve(); await release.promise; } return update(...args); };
  const writing = h.core.execute({ action, sessionId: action === 'source_add' ? 's-001' : 's-000' }, h.human);
  const rejected = assert.rejects(writing, { code: 'SOURCE_MODE' });
  try { await entered.promise; await h.core.execute({ action: 'sources' }, h.actor); }
  finally { release.resolve(); }
  await rejected;
  assert.deepEqual((await h.core.vault.settings()).sources, preserved);
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, preserved.map(({ sessionId, throughSeq }) => ({ sessionId, throughSeq })));
});

test('settings容量恰好边界仍可读，超过一字节写前拒收并保持旧文件', async t => {
  const h = await fixture(t, 1);
  await h.core.execute({ action: 'initialize' }, h.human);
  h.core.vault.limits.maxNoteBytes = 4096;
  const limit = h.core.vault.fileByteLimit('.whalewing/settings.json');
  const next = { schema: 1, sources: [{ sessionId: 'source', title: '', cwd: '', throughSeq: -1 }] };
  next.sources[0].title = 'a'.repeat(limit - Buffer.byteLength(JSON.stringify(next, null, 2) + '\n'));
  await h.core.vault.updateSettings(() => next);
  const file = path.join(h.core.vault.root, '.whalewing', 'settings.json'), before = await fs.readFile(file);
  assert.equal(before.length, limit);
  assert.deepEqual(await h.core.vault.settings(), next);
  await assert.rejects(h.core.vault.updateSettings(current => ({ ...current, sources: [{ ...current.sources[0], title: current.sources[0].title + 'b' }] })), { code: 'SIZE' });
  assert.deepEqual(await fs.readFile(file), before);
  assert.deepEqual(await h.core.vault.settings(), next);
});


async function scopedFixture(t) {
  const h = await fixture(t, 4);
  const workspaces = [{ workspaceId: 'a', path: '/same', sessionIds: ['s-000', 's-002'] }, { workspaceId: 'b', path: '/same', sessionIds: ['s-001'] }];
  h.dependencies.listWorkspaces = async () => workspaces;
  let task;
  const schedule = { catalog: async () => task ? [{ ...task, sessionId: 'knowledge', status: 'active' }] : [], create: async (_id, spec) => (task = { ...spec, id: 'scope-task' }) };
  h.dependencies.schedule = () => schedule;
  h.dependencies.readSourceScope = (accept, signal) => { signal?.throwIfAborted(); return accept({ tasks: task ? [{ ...task, sessionId: 'knowledge', status: 'active' }] : [], workspaces }); };
  const owner = new Automation({ schedule: () => schedule, listWorkspaces: h.dependencies.listWorkspaces, projections: async () => ({ asOfSeq: 0, values: { whalewingAutomation: 'knowledge' } }), prepareModel: async () => {}, confirmClaim: async () => {} });
  async function scope(workspaceScope) {
    task = undefined;
    await owner.manage({ action: 'create', sessionId: 'knowledge', purpose: 'knowledge', spec: { daily: { time: '00:15', time_zone: 'Asia/Shanghai' } }, workspaceScope });
  }
  return { ...h, scope, workspaces };
}

test('工作区多选按宿主成员过滤目录、直接读取与complete，cwd相同不混入未选来源', async t => {
  const h = await scopedFixture(t);
  await h.scope({ mode: 'selected', workspaceIds: ['a'] });
  assert.deepEqual((await h.core.execute({ action: 'sources' }, h.actor)).sources.map(row => row.sessionId), ['s-000', 's-002']);
  await assert.rejects(h.core.execute({ action: 'source_read', sessionId: 's-001' }, h.actor), { code: 'SOURCE_SCOPE' });
  await assert.rejects(h.core.execute({ action: 'source_read', sessionId: 's-003' }, h.actor), { code: 'SOURCE_SCOPE' });
  const pending = await h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.actor);
  const output = await h.core.execute({ action: 'write', path: '40-知识/范围.md', content: note('范围'), expectedHash: '' }, h.actor);
  await h.scope({ mode: 'selected', workspaceIds: ['b'] });
  await assert.rejects(h.core.execute({ action: 'complete', receipt: pending.receipt, outputs: [output], summary: '范围已经撤回的来源不推进覆盖' }, h.actor), { code: 'SOURCE_SCOPE' });
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, []);
});

test('全部减排除动态纳入新工作区，排除项及成功覆盖保持，移除已选工作区拒收', async t => {
  const h = await scopedFixture(t);
  await h.scope({ mode: 'all', excludedWorkspaceIds: ['b'] });
  assert.deepEqual((await h.core.execute({ action: 'sources' }, h.actor)).sources.map(row => row.sessionId), ['s-000', 's-002']);
  h.workspaces.push({ workspaceId: 'c', path: '/c', sessionIds: ['s-003'] });
  assert.deepEqual((await h.core.execute({ action: 'sources' }, h.actor)).sources.map(row => row.sessionId), ['s-000', 's-002', 's-003']);
  h.workspaces[0].sessionIds = [];
  assert.deepEqual((await h.core.execute({ action: 'sources' }, h.actor)).sources.map(row => row.sessionId), ['s-003']);
  await h.scope({ mode: 'selected', workspaceIds: ['c'] });
  h.workspaces.pop();
  await assert.rejects(h.core.execute({ action: 'sources' }, h.actor), { code: 'WORKSPACE_MISSING' });
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, []);
});


test('读取在途改变工作区范围不交付正文，等待取消不推进覆盖', async t => {
  const h = await scopedFixture(t);
  await h.scope({ mode: 'selected', workspaceIds: ['a'] });
  await h.core.execute({ action: 'sources' }, h.actor);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), read = h.dependencies.readSession;
  h.dependencies.readSession = async id => { entered.resolve(); await release.promise; return read(id); };
  const pending = h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.actor);
  const rejected = assert.rejects(pending, { code: 'SOURCE_SCOPE' });
  await entered.promise;
  await h.scope({ mode: 'selected', workspaceIds: ['b'] });
  release.resolve(); await rejected;
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, []);
});


test('成果校验期间撤回工作区在最终提交点拒收，不推进已排除来源', async t => {
  const h = await scopedFixture(t);
  await h.scope({ mode: 'selected', workspaceIds: ['a'] });
  await h.core.execute({ action: 'sources' }, h.actor);
  const receipt = await h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.actor);
  const output = await h.core.execute({ action: 'write', path: '40-知识/提交范围.md', content: note('提交范围'), expectedHash: '' }, h.actor);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), validate = h.core.vault.validate.bind(h.core.vault);
  h.core.vault.validate = async (...args) => { const result = await validate(...args); entered.resolve(); await release.promise; return result; };
  const pending = h.core.execute({ action: 'complete', receipt: receipt.receipt, outputs: [output], summary: '成果校验完成前撤回处理范围' }, h.actor);
  const rejected = assert.rejects(pending, { code: 'SOURCE_SCOPE' });
  await entered.promise;
  await h.scope({ mode: 'selected', workspaceIds: ['b'] });
  release.resolve(); await rejected;
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, []);
});


for (const operation of ['source', 'read', 'complete', 'list']) for (const boundary of ['directory', 'identity', 'initialization']) test('最终同步范围门拒收撤回：' + operation + '/' + boundary, async t => {
  const h = await scopedFixture(t);
  await h.scope({ mode: 'selected', workspaceIds: ['a'] });
  await h.core.execute({ action: 'sources' }, h.actor);
  let receipt, output;
  if (operation === 'complete') {
    receipt = await h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.actor);
    output = await h.core.execute({ action: 'write', path: '40-知识/最后门.md', content: note('最后门'), expectedHash: '' }, h.actor);
  }
  const entered = Promise.withResolvers(), release = Promise.withResolvers(); let count = 0;
  const target = operation === 'source' || operation === 'list' ? 1 : 2;
  if (boundary === 'directory') {
    const original = h.dependencies.listSessions;
    h.dependencies.listSessions = async (...args) => { if (++count === target) { entered.resolve(); await release.promise; } return original(...args); };
  } else if (boundary === 'identity') {
    const original = h.dependencies.automationIdentity;
    h.dependencies.automationIdentity = async (...args) => { if (args[0] === 's-000' && ++count === target) { entered.resolve(); await release.promise; } return original(...args); };
  } else {
    const original = h.dependencies.readSourceScope;
    // 等待发生在原生初始化之前，真实registry.list/成员投射及accept无异步切点。
    const gate = operation === 'list' ? 3 : target * 2;
    h.dependencies.readSourceScope = async (...args) => { if (++count === gate) { entered.resolve(); await release.promise; } return original(...args); };
  }
  const pending = operation === 'source' ? h.core.profileSources.source('s-000', h.actor)
    : operation === 'read' ? h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.actor)
    : operation === 'list' ? h.core.execute({ action: 'sources' }, h.actor)
    : h.core.execute({ action: 'complete', receipt: receipt.receipt, outputs: [output], summary: '最后异步调查期间范围已撤回' }, h.actor);
  const rejected = assert.rejects(pending, { code: 'SOURCE_SCOPE' });
  await entered.promise;
  await h.scope({ mode: 'selected', workspaceIds: ['b'] });
  release.resolve(); await rejected;
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, []);
});

test('成员归属在原生初始化等待时撤回且不调用异步工作区快照', async t => {
  const h = await scopedFixture(t);
  await h.scope({ mode: 'selected', workspaceIds: ['a'] });
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), original = h.dependencies.readSourceScope;
  let count = 0;
  h.dependencies.listWorkspaces = () => { throw new Error('最终来源门不应调用异步工作区投影'); };
  h.dependencies.readSourceScope = async (...args) => { if (++count === 2) { entered.resolve(); await release.promise; } return original(...args); };
  const rejected = assert.rejects(h.core.profileSources.source('s-000', h.actor), { code: 'SOURCE_SCOPE' });
  await entered.promise; h.workspaces[0].sessionIds = []; release.resolve(); await rejected;
});

test('最终门初始化等待取消后迟到回调不发凭据不推进覆盖', async t => {
  const h = await scopedFixture(t);
  await h.scope({ mode: 'selected', workspaceIds: ['a'] });
  await h.core.execute({ action: 'sources' }, h.actor);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), original = h.dependencies.readSourceScope;
  let count = 0; const controller = new AbortController();
  h.dependencies.readSourceScope = async (...args) => { if (++count === 4) { entered.resolve(); await release.promise; } return original(...args); };
  const rejected = assert.rejects(h.core.execute({ action: 'source_read', sessionId: 's-000' }, { ...h.actor, signal: controller.signal }), /最终门取消/);
  await entered.promise; controller.abort(new Error('最终门取消')); await rejected; release.resolve();
  assert.equal(h.core.receipts.size, 0);
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, []);
});

test('同步门后撤回不伪回滚已接纳覆盖，磁盘写入及readback继续使用原owner', async t => {
  const h = await scopedFixture(t);
  await h.scope({ mode: 'selected', workspaceIds: ['a'] });
  await h.core.execute({ action: 'sources' }, h.actor);
  const receipt = await h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.actor);
  const output = await h.core.execute({ action: 'write', path: '40-知识/已接纳.md', content: note('已接纳'), expectedHash: '' }, h.actor);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), atomic = h.core.vault.atomic.bind(h.core.vault);
  h.core.vault.atomic = async (...args) => { if (args[0] === '.whalewing/settings.json') { entered.resolve(); await release.promise; } return atomic(...args); };
  const pending = h.core.execute({ action: 'complete', receipt: receipt.receipt, outputs: [output], summary: '同步接纳后持久化期间撤回范围' }, h.actor);
  await entered.promise;
  await h.scope({ mode: 'selected', workspaceIds: ['b'] });
  release.resolve();
  assert.equal((await pending).completed, true);
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, [{ sessionId: 's-000', throughSeq: 0 }]);
  await assert.rejects(h.core.execute({ action: 'source_read', sessionId: 's-000' }, h.actor), { code: 'SOURCE_SCOPE' });
});


test('迁移提示只形成来源issues，普通精确来源继续返回且不推进未知覆盖', async t => {
  const h = await fixture(t, 2);
  h.dependencies.automationIdentity = async id => automationIdentity(async () => id === 's-000'
    ? { kind: 'migration-required', asOfSeq: 0, values: { whalewingAutomation: null } }
    : { kind: 'sequenced', asOfSeq: 0, values: { whalewingAutomation: h.purposes.get(id) ?? null } }, id);
  const result = await h.core.execute({ action: 'sources' }, h.actor);
  assert.deepEqual(result.sources.map(row => row.sessionId), ['s-001']);
  assert.equal(result.issues[0].sessionId, 's-000'); assert.match(result.issues[0].message, /升级/);
  assert.deepEqual((await h.core.vault.settings()).profileCoverage.through, []);
});
