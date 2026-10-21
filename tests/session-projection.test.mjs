import test from 'node:test';
import assert from 'node:assert/strict';
import { isExactProjection, requireExactProjection } from '../src/session-projection.js';
import { fixture, roles } from './client-fixture.mjs';

// 日志空白水位是-1；迁移缓存即使带values也没有身份解释权。
test('共享精确边界兼容两版，拒收未知kind、无效水位和缺键', () => {
  for (const value of [{ asOfSeq: -1, values: { identity: null } }, { kind: 'sequenced', asOfSeq: 3, values: { identity: null } }]) {
    assert.equal(isExactProjection(value), true); assert.equal(requireExactProjection(value, 'original', ['identity']), value);
  }
  for (const value of [null, {}, { asOfSeq: -2, values: {} }, { asOfSeq: 0.5, values: {} }, { asOfSeq: NaN, values: {} }, { asOfSeq: 0, values: [] }, { kind: 'future', asOfSeq: 0, values: {} }, { kind: 'migration-required', asOfSeq: 0, values: {} }]) assert.equal(isExactProjection(value), false);
  assert.throws(() => requireExactProjection({ kind: 'sequenced', asOfSeq: 0, values: {} }, 'original', ['identity']), { code: 'SESSION_UNCONFIRMED', sessionId: 'original', recovery: 'check' });
  assert.throws(() => requireExactProjection({ kind: 'migration-required', asOfSeq: 0, values: { identity: true } }, 'original', ['identity']), { code: 'SESSION_MIGRATION', sessionId: 'original', recovery: 'open' });
});

for (const code of ['session/writer-held', 'session/agent-busy', 'session/conflict']) test(`原生${code}无details身份时恢复动作仍打开请求原ID`, async () => {
  const f = await fixture({ nativeCommands: async () => ({ ok: false, error: { code, message: '原生错误', details: { reason: 'subagent' } } }) });
  let notice; f.bridge.bindNotify((message, options) => { notice = { message, ...options }; });
  let failure;
  try { await f.bridge.request('original', { action: 'workspace_attach' }); } catch (error) { failure = error; }
  assert.equal(failure.sessionId, 'original'); assert.equal(failure.recovery, 'open');
  f.bridge.notifySessionIssue(failure); assert.equal(notice.action.label, '打开原会话');
  await notice.action.run(); assert.deepEqual(f.calls.at(-1), ['open', 'original']);
});

test('小鲸拒收其它create ID，打开额外会话而下一次仍检查原pending ID', async () => {
  let requested, reads = [], creates = 0;
  const f = await fixture({ create: async input => { creates++; requested = input.sessionId; return { ok: true, value: { sessionId: 'extra', agentPreset: 'standard' } }; }, projections: async ({ sessionId }) => { reads.push(sessionId); return { ok: true, value: null }; } });
  let notice; f.bridge.bindNotify((message, options) => { notice = { message, ...options }; });
  let failure;
  try { await f.clients.assistant.ensureAssistant(); } catch (error) { failure = error; }
  assert.equal(failure.code, 'SESSION_CREATED_DIFFERENT'); assert.equal(failure.sessionId, 'extra');
  f.bridge.notifySessionIssue(failure); assert.equal(notice.action.label, '打开额外会话'); await notice.action.run();
  assert.deepEqual(f.calls.at(-1), ['open', 'extra']);
  await assert.rejects(f.clients.assistant.ensureAssistant(), { code: 'SESSION_UNCONFIRMED', sessionId: requested });
  assert.equal(reads.at(-1), requested); assert.equal(creates, 1);
});

test('迁移与缺失投影恢复动作分别打开原会话和重新检查', async () => {
  const f = await fixture(); let notice, checks = 0;
  f.bridge.bindNotify((message, options) => { notice = { message, ...options }; });
  for (const value of [{ kind: 'migration-required', values: {} }, null]) {
    let failure; try { requireExactProjection(value, 'original'); } catch (error) { failure = error; }
    f.bridge.notifySessionIssue(failure, () => { checks++; });
    assert.equal(notice.action.label, value ? '打开原会话' : '重新检查'); await notice.action.run();
  }
  assert.equal(checks, 1); assert.ok(f.calls.some(row => row[0] === 'open' && row[1] === 'original'));
});


for (const kind of ['migration-required', 'future']) for (const consumer of ['workbench', 'assistant', 'aiweb', 'expert', 'automation']) test(`${consumer}不消费${kind}缓存身份或发送写命令`, async () => {
  const storage = new Map([['whalewing:workbench:http://fixture.local', 'original'], ['whalewing:aiweb:http://fixture.local', 'original']]);
  const f = await fixture({ storage, projections: async () => ({ ok: true, value: { kind, asOfSeq: 0, values: { whalewingWorkbench: true, whalewingExpert: { expertId: 'manager' }, whalewingAutomation: null, modelSelection: { next: { provider: 'fixture', model: 'fixture' } } } } }), create: async () => { throw new Error('回执中断'); }, sidebarRight: { openTab() {} } });
  const spec = { purpose: 'custom', spec: { title: '检查', prompt: '检查', after_seconds: 60 } };
  if (consumer === 'automation') await assert.rejects(f.clients.automation.createAutomation(spec, false), /回执中断/);
  const before = f.calls.length;
  const operation = { workbench: () => f.workbenchSession.ensureWorkbench(), assistant: () => f.clients.assistant.ensureAssistant(), aiweb: () => f.clients['ai-web'].openAiInConversation('https://example.test/'), expert: () => f.clients.experts.selectExpert('original', 'manager'), automation: () => f.clients.automation.createAutomation(spec, true) }[consumer];
  await assert.rejects(operation(), { code: kind === 'migration-required' ? 'SESSION_MIGRATION' : 'SESSION_UNCONFIRMED' });
  assert.equal(f.calls.slice(before).some(([action]) => ['create', 'expert', 'automationClaim', 'rename', 'model', 'prompt'].includes(action)), false);
  if (consumer === 'automation') assert.ok(f.clients.automation.pendingAutomation().sessionId);
  assert.equal(storage.get('whalewing:workbench:http://fixture.local'), 'original');
  assert.equal(storage.get('whalewing:aiweb:http://fixture.local'), 'original');
});


test('专家选模型后的迁移缓存不能确认模型成功', async () => {
  const f = await fixture(); const selected = { provider: 'fixture', model: 'default' };
  f.ctx.remote.whalewingExperts.manage = async () => ({ ok: true, value: { selected } });
  f.ctx.remote.session.projections = async () => ({ ok: true, value: { kind: 'migration-required', asOfSeq: 2, values: { modelSelection: { next: selected } } } });
  await assert.rejects(f.clients.experts.applyExpertModel('original', roles[0]), { code: 'SESSION_MIGRATION', sessionId: 'original' });
});
