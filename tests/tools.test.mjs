import { apply as knowledgeTool } from '../features/knowledge/tool.js';
import { apply as skillTool } from '../features/skills/tool.js';
import { apply as expertTool } from '../features/experts/tool.js';
import { apply as newsTool } from '../features/cards/tool.js';
import { allSkills } from './feature-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WhalewingSkillProvider } from '../src/skill-provider.js';
import { Vault } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-tools-'));
  t.after(() => fs.rm(directory, { force: true, recursive: true }));
  const vault = new Vault(path.join(directory, 'vault'));
  await vault.initialize();
  const library = new SkillLibrary(vault, path.join(directory, 'skills'));
  const lifecycle = new AbortController();
  const ctx = { logger: { warn() {} }, get: () => undefined, on() { return () => {}; } };
  const provider = new WhalewingSkillProvider(ctx, { signal: lifecycle.signal, invalidate() {} }, library, allSkills);
  t.after(() => provider.dispose());
  return { vault, library, provider, ctx, lifecycle };
}

test('真实宿主defineTool接受全部schema，原生审批拒绝不会执行数据动作', async t => {
  const { vault, library, ctx, lifecycle } = await setup(t);
  const tools = new Map();
  const cleanups = [];
  const calls = [];
  let approvalCount = 0;
  Object.assign(ctx, {
    whalewing: { vault, skills: library, executeNews: async (args, caller) => ({ action: args.action, sessionId: caller.agent?.session.id }), execute: async (...args) => { calls.push(args); return { ok: true }; } },
    whalewingExperts: { list: () => ({ experts: [{ id: 'manager', name: '小鲸助手', description: '统一助手', avatar: '不应送入工具结果' }], deleted: [] }), get: id => ({ id, name: '小鲸助手', prompt: '配置正文', avatar: '不应送入工具结果', model: null, skills: [], mcpServers: [] }), manage() { throw new Error('模型不得写配置'); } },
    skills: { registerProvider: factory => factory({ signal: lifecycle.signal, invalidate() {} }) },
    tools: { register: definition => tools.set(definition.name, definition) },
    on() {}, effect(fn) { cleanups.push(fn()); },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
    get: key => key === 'approval' ? { request: async () => { approvalCount++; return 'rejected'; } } : undefined,
  });
  ctx.whalewingCards = { executeNews: ctx.whalewing.executeNews };
  expertTool(ctx); newsTool(ctx); knowledgeTool(ctx); skillTool(ctx);
  t.after(async () => { for (const cleanup of cleanups) await cleanup(); });
  assert.deepEqual([...tools.keys()], ['whalewing_experts', 'whalewing_news', 'whalewing_knowledge', 'whalewing_skill']);
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'fixture' } }, callId: 'fixture-call' };
  await tools.get('whalewing_knowledge').execute({ action: 'status' }, exec);
  assert.equal(approvalCount, 0);
  await assert.rejects(tools.get('whalewing_knowledge').execute({ action: 'write', path: '40-知识/a.md' }, exec), /rejected/);
  assert.equal(approvalCount, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(await tools.get('whalewing_news').execute({ action: 'fields' }, exec)), { action: 'fields', sessionId: 'fixture' });
  assert.equal(calls.length, 1, '资讯不得经过知识执行入口');
  const list = JSON.parse(await tools.get('whalewing_experts').execute({ action: 'list' }, exec));
  assert.deepEqual(list.experts, [{ id: 'manager', name: '小鲸助手', description: '统一助手' }]);
  const detail = JSON.parse(await tools.get('whalewing_experts').execute({ action: 'get', id: 'manager' }, exec));
  assert.equal(detail.prompt, '配置正文');
  assert.equal(Object.hasOwn(detail, 'avatar'), false);
  await assert.rejects(tools.get('whalewing_experts').execute({ action: 'save' }, exec), { code: 'INVALID_ARGS' });
  await assert.rejects(tools.get('whalewing_experts').execute({ action: 'get' }, exec), { code: 'INPUT' });
  await assert.rejects(tools.get('whalewing_experts').execute({ action: 'list', prompt: '写入企图' }, exec), { code: 'INPUT' });
  assert.equal(approvalCount, 1);
});

test('官方filesystem发现器隔离坏个人Skill，基础Skills持续可用；卸载关闭watcher', async t => {
  const { vault, library, provider } = await setup(t);
  const name = 'whalewing-user-malformed';
  await library.files.atomic(library.location(name, 'active'), `---\nname: ${name}\ndescription: 测试损坏来源不会冲掉基础技能目录\nmetadata:\n  whalewingSources: [null]\n---\n损坏测试。\n`);
  const observed = await provider.list({ cwd: vault.root, signal: new AbortController().signal });
  const candidates = Array.isArray(observed) ? observed : observed.candidates;
  assert.deepEqual(candidates.map(s => s.name).sort(), ['whalewing-check', 'whalewing-clarify', 'whalewing-coding', 'whalewing-debugging', 'whalewing-frontend-design', 'whalewing-knowledge', 'whalewing-news', 'whalewing-plugin-management', 'whalewing-skill-evolution', 'whalewing-web-testing', 'whalewing-writing']);
  const knowledge = await provider.get(candidates.find(s => s.name === 'whalewing-knowledge'), { signal: new AbortController().signal });
  assert.match(knowledge.content, /知识使用与沉淀/);
  await provider.dispose();
});

test('已缓存发现后来源外改，get仍拒绝失效正文', async t => {
  const { vault, library, provider } = await setup(t);
  const notePath = '40-知识/依据.md';
  const content = '---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-08\nupdated: 2026-10-08\naliases: []\n---\n# 依据\n来源。\n';
  const note = await vault.write(notePath, content, '');
  const name = 'whalewing-user-valid';
  const candidate = await library.stage({ name, content: `---\nname: ${name}\ndescription: 有依据时执行有效方法并检查任务成果\n---\n读取来源并完成任务。\n`, sourcePaths: [notePath], sourceHashes: { [notePath]: note.hash }, expectedHash: '' });
  await library.publish({ name, expectedHash: candidate.hash, activeHash: '', review: { reviewer: '测试夹具独立检查角色', positive: '适用输入与结果已经核对', negative: '无来源输入已阻断检查' } }, async () => {});
  const observed = await provider.list({ cwd: vault.root, signal: new AbortController().signal });
  const found = (Array.isArray(observed) ? observed : observed.candidates).find(s => s.name === name);
  assert.ok(found);
  await fs.writeFile(await vault.resolve(notePath), content.replace('来源。', '已纠偏。'));
  await assert.rejects(provider.get(found, { signal: new AbortController().signal }), { code: 'SKILL_STALE' });
});
