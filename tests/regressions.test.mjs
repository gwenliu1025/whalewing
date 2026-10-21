import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Vault } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';
import { WhalewingCore, conversationText, schedulePrefix } from '../src/service.js';

const note = body => `---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-08\nupdated: 2026-10-08\naliases: []\n---\n# 来源\n${body}\n`;
const name = 'whalewing-user-regression';
const content = `---\nname: ${name}\ndescription: 已有适用知识时按来源执行并检查结果\n---\n回读来源后执行并验收。\n`;

test('链接检查接受带扩展名的双链和相对Markdown，忽略代码示例', async t => {
  const { vault } = await setup(t);
  const body = note('[[来源.md]] [来源](./来源.md)\n`[[不存在]]`\n```md\n[[代码里的例子]]\n```').replace('# 来源\n', '# 引用\n');
  const saved = await vault.write('40-知识/引用.md', body, '');
  assert.equal((await vault.validate()).valid, true);
  await vault.write(saved.path, body + '\n[坏链接](./缺失.md)\n', saved.hash);
  const invalid = await vault.validate();
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some(item => item.includes('失效 Markdown 链接 ./缺失.md')));
});
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-regression-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = new Vault(path.join(root, 'vault'));
  await vault.initialize();
  const source = await vault.write('40-知识/来源.md', note('旧内容'), '');
  return { root, vault, source, library: new SkillLibrary(vault, path.join(root, 'skills')) };
}

test('发布及停用恢复留下的空目录不显示为损坏候选或重复技能', async t => {
  const { library, source } = await setup(t);
  const staged = await library.stage({ name, content, sourcePaths: [source.path], sourceHashes: { [source.path]: source.hash }, expectedHash: '' });
  await library.publish({ name, expectedHash: staged.hash, activeHash: '', review: { reviewer: '独立的生命周期检查夹具', positive: '适用方法已核对并发现', negative: '缺来源保持拒收与无副作用' } }, async () => {});
  assert.deepEqual((await library.list()).skills.map(item => item.state), ['active']);
  const disabled = await library.disable({ name, expectedHash: staged.hash });
  assert.deepEqual((await library.list()).skills.map(item => item.state), ['disabled']);
  await library.restore({ name, expectedHash: disabled.hash }, async () => {});
  assert.deepEqual((await library.list()).skills.map(item => item.state), ['active']);
});

test('提炼期间来源变更不允许把旧候选盖成新来源依据', async t => {
  const { vault, source, library } = await setup(t);
  await vault.write(source.path, note('已纠偏的新内容'), source.hash);
  await assert.rejects(library.stage({ name, content, sourcePaths: [source.path], sourceHashes: { [source.path]: source.hash }, expectedHash: '' }), { code: 'SKILL_STALE' });
  await assert.rejects(library.read(name, 'candidate'), { code: 'SKILL_NOT_FOUND' });
});

test('损坏sources元素归一为稳定错误，不抛TypeError', async t => {
  const { vault, library } = await setup(t);
  const malformed = content.replace('---\n回读', 'metadata:\n  whalewingSources: [null]\n---\n回读');
  await library.files.atomic(library.location(name, 'active'), malformed);
  await assert.rejects(library.read(name), { code: 'SKILL_SOURCE' });
  const listed = await library.list();
  assert.match(listed.skills[0].issue, /SKILL_SOURCE/);
});

test('旧活动文件损坏且新发布发现失败时，新活动入口必须撤下', async t => {
  const { vault, source, library } = await setup(t);
  const active = library.location(name, 'active');
  await library.files.atomic(active, content);
  const old = await library.files.read(active);
  const candidate = await library.stage({ name, content, sourcePaths: [source.path], sourceHashes: { [source.path]: source.hash }, expectedHash: '' });
  await assert.rejects(library.publish({ name, expectedHash: candidate.hash, activeHash: old.hash, review: { reviewer: '独立检查者回归测试', positive: '适用测试已执行并通过', negative: '失败输入保持零副作用' } }, async () => { throw new Error('fixture发现失败'); }), /fixture发现失败/);
  assert.equal(await library.files.read(active), null);
  assert.equal((await library.files.read(library.location(name, 'disabled'))).hash, old.hash);
});

test('来源投影排除工具返回、流原文与自动整理，不递归采集source_read结果', () => {
  const user = (seq, text, source) => ({ seq, time: seq, type: 'user/message', data: { content: [{ type: 'text', text }], source } });
  const assistant = (seq, text) => ({ seq, time: seq, type: 'assistant/message', data: { sourceStream: '不应入库', message: { content: [{ type: 'text', text }, { type: 'tool-call', toolName: 'whalewing_knowledge', args: { action: 'source_read' } }] } } });
  const events = [user(0, '业务原文'), assistant(1, '业务回答'), { seq: 2, type: 'tool/result', data: { message: { content: [{ type: 'text', text: JSON.stringify([user(0, '递归副本')]) }] } } }, user(3, schedulePrefix + '开始整理'), assistant(4, '整理结果'), user(5, '后续真实纠偏'), assistant(6, '新任务结论')];
  const projected = [...conversationText(events).values()];
  assert.deepEqual(projected.map(e => e.seq), [0, 1, 5, 6]);
  assert.ok(!JSON.stringify(projected).includes('递归副本'));
  assert.ok(!JSON.stringify(projected).includes('source_read'));
});

test('专家及宿主上下文不伪装员工原话，也不重新启用定时轮次采集', () => {
  const user = (seq, text, kind) => ({ seq, type: 'user/message', data: { source: { kind }, content: [{ type: 'text', text }] } });
  const assistant = seq => ({ seq, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '整理结果' }] } } });
  const events = [user(0, '原始任务', 'user'), user(1, '专家上下文', 'whalewing-expert'), user(2, '每日整理', 'schedule'), user(3, '专家上下文', 'whalewing-expert'), user(4, '宿主上下文', 'runtime-context'), user(5, '切换模型', 'model-selection'), assistant(6), user(7, '员工后续补充', 'user')];
  assert.deepEqual([...conversationText(events).keys()], [0, 7]);
});

test('分页冻结截止点，追加的自身工具日志不进入在途批次', async t => {
  const { root } = await setup(t);
  const events = [{ seq: 0, type: 'user/message', time: '2026-10-08T00:00:00Z', data: { content: [{ type: 'text', text: '真实依据' }] } }, { seq: 1, type: 'tool/result', time: '2026-10-08T00:00:00Z', data: {} }];
  const core = new WhalewingCore(path.join(root, 'pages'), { skillsRoot: path.join(root, 'skills'), readSession: async () => ({ session: {}, inheritedEventCount: 0, events }), schedule: () => undefined }, { maxEvents: 1 });
  t.after(() => core.dispose());
  const caller = { kind: 'human', agent: { session: { id: 'source' } } };
  await core.execute({ action: 'initialize' }, caller);
  await core.execute({ action: 'source_add', sessionId: 'source' }, caller);
  const first = await core.execute({ action: 'source_read', sessionId: 'source' }, caller);
  const output = await core.execute({ action: 'write', path: '40-知识/来源.md', content: note('真实依据'), expectedHash: '' }, caller);
  await core.execute({ action: 'complete', receipt: first.receipt, outputs: [output], summary: '已检查本页来源文本和真实产物' }, caller);
  events.push({ seq: 2, type: 'tool/result', time: '2026-10-08T00:01:00Z', data: { recursive: JSON.stringify(first) } });
  const second = await core.execute({ action: 'source_read', sessionId: 'source' }, caller);
  assert.equal(second.cutoff, 1);
  assert.equal(second.throughSeq, 1);
  assert.deepEqual(second.events, []);
  await core.execute({ action: 'complete', receipt: second.receipt, outputs: [], summary: '本页只含被省略的工具事件' }, caller);
});
