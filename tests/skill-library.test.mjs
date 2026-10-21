import { allSkills, mountFeatures } from './feature-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { Context } from '@deepseek-ai/cordis';
import { SkillRegistry } from '@deepseek-ai/dsh-skill';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import { createScope } from '@deepseek-ai/dsh-scope';
import { getEventListeners } from 'node:events';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { Vault, digest } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';
import { SkillFiles } from '../src/skill-files.js';
import { skillLibraryContract } from '../features/skills/contract.js';
import { WhalewingSkillProvider } from '../src/skill-provider.js';
import Whalewing from '../index.js';

const text = (name, body = '读取输入，执行任务并检查结果。') => `---\nname: ${name}\ndescription: 任务需要时执行本方法并核对输入和结果\n---\n${body}\n`;
const note = '---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-08\nupdated: 2026-10-08\naliases: []\n---\n# 来源\n已经核对的业务依据。\n';
const review = { reviewer: '独立检查者技能测试夹具', positive: '适用输入已经执行并核对结果', negative: '缺失输入被拒收且没有副作用' };

async function setup(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-library-'));
  const vault = new Vault(path.join(root, 'vault'));
  const library = new SkillLibrary(vault, path.join(root, 'dsh', 'skills'), options);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, vault, library };
}

test('员工CRUD兼容平铺与bundle，固定身份重试不覆盖，保留编码与单份完整恢复', async t => {
  const { library } = await setup(t);
  const saved = await library.manage({ action: 'create', id: 'plain.md', content: '\uFEFF' + text('plain').replaceAll('\n', '\r\n'), expectedHash: '' });
  await assert.rejects(library.manage({ action: 'create', id: 'plain.md', content: text('plain'), expectedHash: '' }), { code: 'CONFLICT' });
  const changed = await library.manage({ action: 'update', id: 'plain.md', content: text('plain', '新正文'), expectedHash: saved.entry.hash });
  assert.ok(changed.entry.content.startsWith('\uFEFF')); assert.ok(changed.entry.content.includes('\r\n'));
  await assert.rejects(library.manage({ action: 'update', id: 'plain.md', content: text('plain'), expectedHash: saved.entry.hash }), { code: 'CONFLICT' });
  await library.manage({ action: 'remove', id: 'plain.md', expectedHash: changed.entry.hash });
  assert.equal((await library.manage({ action: 'read', id: 'plain.md' })).entry, null);
  assert.equal((await library.files.read(`.system/whalewing/recovery/removed-${digest('plain.md')}`)).content, changed.entry.content);
  const bundle = await library.manage({ action: 'create', id: 'bundle/SKILL.md', content: text('bundle'), expectedHash: '' });
  await library.files.atomic('bundle/references/rule.txt', '附属资源');
  await assert.rejects(library.manage({ action: 'remove', id: bundle.entry.id, expectedHash: bundle.entry.hash }), { code: 'CONFLICT' });
  const current = (await library.manage({ action: 'read', id: bundle.entry.id })).entry;
  await library.manage({ action: 'remove', id: current.id, expectedHash: current.hash });
  assert.equal((await library.files.read(`.system/whalewing/recovery/removed-${digest(current.id)}/references/rule.txt`)).content, '附属资源');
});

test('系统原件只读，首次覆盖复制资源，重置保留用户附加文件且恢复冲突不丢数据', async t => {
  const { root, vault } = await setup(t);
  const bundledRoot = path.join(root, 'package');
  await fs.mkdir(path.join(bundledRoot, 'fixture', 'references'), { recursive: true });
  await fs.writeFile(path.join(bundledRoot, 'fixture', 'SKILL.md'), text('fixture', '读取 references/rule.md'));
  await fs.writeFile(path.join(bundledRoot, 'fixture', 'references', 'rule.md'), '系统资源');
  const library = new SkillLibrary(vault, path.join(root, 'managed'), { bundledRoot });
  const base = (await library.manage({ action: 'read', id: '.system/whalewing/builtin/fixture/SKILL.md' })).entry;
  await assert.rejects(library.manage({ action: 'remove', id: base.id, expectedHash: base.hash }), { code: 'SKILL_PROTECTED' });
  const changed = (await library.manage({ action: 'update', id: base.id, expectedHash: base.hash, content: text('fixture', '编辑：读取 references/rule.md') })).entry;
  assert.equal(changed.origin, 'override'); assert.equal(changed.baseHash, base.hash);
  assert.equal((await library.files.read('fixture/references/rule.md')).content, '系统资源');
  assert.equal((await library.manage({ action: 'read', id: base.id })).entry.hash, base.hash);
  await library.files.atomic('fixture/employee.txt', '员工附加资源');
  const current = (await library.manage({ action: 'read', id: changed.id })).entry;
  await assert.rejects(library.manage({ action: 'reset', id: current.id, expectedHash: current.hash }), { code: 'CONFLICT' });
  await library.manage({ action: 'reset', id: current.id, expectedHash: current.hash, expectedBaseHash: current.baseHash });
  assert.equal((await library.files.read(`.system/whalewing/recovery/removed-${digest(current.id)}/employee.txt`)).content, '员工附加资源');
  const again = (await library.manage({ action: 'update', id: base.id, expectedHash: base.hash, content: text('fixture', '另一编辑') })).entry;
  await assert.rejects(library.manage({ action: 'reset', id: again.id, expectedHash: again.hash, expectedBaseHash: again.baseHash }), { code: 'CONFLICT' });
  assert.equal((await library.manage({ action: 'read', id: again.id })).entry.content, again.content);
});

test('普通同名文件不接管，损坏正文可修复，链接与越界拒收', async t => {
  const { root, library } = await setup(t);
  await library.ensureReady();
  await library.files.atomic('whalewing-check/SKILL.md', text('whalewing-check', '用户独立原件'));
  const base = (await library.manage({ action: 'read', id: '.system/whalewing/builtin/whalewing-check/SKILL.md' })).entry;
  await assert.rejects(library.manage({ action: 'update', id: base.id, expectedHash: base.hash, content: text('whalewing-check') }), { code: 'CONFLICT' });
  const user = (await library.manage({ action: 'read', id: 'whalewing-check/SKILL.md' })).entry;
  assert.equal(user.origin, 'user');
  await assert.rejects(library.manage({ action: 'reset', id: user.id, expectedHash: user.hash }), { code: 'SKILL_PROTECTED' });
  await library.files.atomic('broken.md', '缺少frontmatter');
  const broken = (await library.manage({ action: 'read', id: 'broken.md' })).entry;
  assert.ok(broken.issue); assert.ok(broken.actions.includes('update'));
  await library.manage({ action: 'update', id: broken.id, expectedHash: broken.hash, content: text('repaired') });
  for (const id of ['../bad.md', 'C:/bad.md', '.system/whalewing/write.lock']) await assert.rejects(library.manage({ action: 'read', id }));
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(library.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(library.manage({ action: 'create', id: 'linked/SKILL.md', content: text('linked'), expectedHash: '' }), { code: 'SYMLINK' });
});

test('正式Host两个Remote独立binding且无会话，技能失败不阻断知识初始化', async t => {
  const { root } = await setup(t), ctx = new Context(); new TypertRegistry(ctx);
  ctx.provide('commands', { register() {} }); ctx.provide('sessionQuery', {}); ctx.provide('sessionProjections', { register() {} });
  ctx.provide('sessions', { create() { assert.fail('不应新建会话'); } }); ctx.provide('skills', { snapshot: async () => ({ complete: true, skills: [] }) });
  const { service, knowledge, skillsHost } = await mountFeatures(ctx, root, { vaultRoot: path.join(root, 'host-vault') }, false);
  t.after(() => ctx.fiber.dispose());
  const contract = skillLibraryContract(z);
  assert.equal(contract.client.descriptors[0].namespace, skillsHost.typertRemote.namespace);
  await fs.mkdir(path.dirname(service.skills.root), { recursive: true }); await fs.writeFile(service.skills.root, '占位阻断');
  await assert.rejects(skillsHost.manageSkills({ action: 'list' }));
  assert.equal((await knowledge.manage({ action: 'status' })).initialized, true);
  await fs.unlink(service.skills.root);
  const saved = await skillsHost.manageSkills({ action: 'create', id: 'host/SKILL.md', content: text('host'), expectedHash: '' });
  contract.result.parse(saved); assert.equal(saved.entry.name, 'host');
  contract.result.parse(await skillsHost.manageSkills({ action: 'list' }));
  await assert.rejects(skillsHost.manageSkills({ action: 'create', id: 'bad.md', content: text('bad'), expectedHash: '', caller: { kind: 'human' } }));
});

test('真实双provider发现普通用户技能，来源失效演进项不会被用户根扫描重新暴露', async t => {
  const { root, vault, library } = await setup(t); await vault.initialize();
  const ctx = new Context(), registry = new SkillRegistry(ctx); const providers = [];
  registry.registerProvider(control => { const value = new FileSystemSkillProvider(ctx, control, { dshHome: path.join(root, 'dsh'), agentsHome: path.join(root, 'agents'), watch: false }); providers.push(value); return value; });
  registry.registerProvider(control => { const value = new WhalewingSkillProvider(ctx, control, library, allSkills); providers.push(value); return value; });
  t.after(async () => { for (const provider of providers) await provider.dispose(); await ctx.fiber.dispose(); });
  await library.manage({ action: 'create', id: 'user.md', content: text('user'), expectedHash: '' });
  const source = await vault.write('40-知识/来源.md', note, '');
  const name = 'whalewing-user-provenance';
  const candidate = await library.stage({ name, content: text(name), sourcePaths: [source.path], sourceHashes: { [source.path]: source.hash }, expectedHash: '' });
  await library.publish({ name, expectedHash: candidate.hash, activeHash: '', review }, async () => {});
  assert.ok((await registry.get(name)).content); assert.ok((await registry.get('user')).content);
  await vault.write(source.path, note.replace('业务依据', '纠偏依据'), source.hash);
  registry.invalidateCache();
  assert.equal(await registry.get(name), undefined);
  assert.ok((await registry.get('user')).content);
});

test('旧bundle和rollback审核一并迁移，来源身份不随知识库切换，冲突保留原件', async t => {
  const { root, vault, library } = await setup(t); await vault.initialize();
  const source = await vault.write('40-知识/来源.md', note, '');
  const name = 'whalewing-user-legacy', active = `.whalewing/skills/${name}/SKILL.md`;
  const old = text(name).replace('---\n读取', `metadata:\n  whalewingSources:\n    - path: ${source.path}\n      hash: ${source.hash}\n---\n读取`);
  const previous = old.replace('读取输入', '先核对输入');
  await vault.atomic(active, old); await vault.atomic(`.whalewing/skills/${name}/references/data.txt`, '保留资源');
  await vault.atomic(`.whalewing/recovery/${digest(active)}.json`, JSON.stringify({ path: active, content: previous, hash: digest(previous) }));
  await vault.atomic(`.whalewing/recovery/review-${name}.json`, JSON.stringify({ hash: digest(old), review }));
  await library.ensureReady();
  assert.equal(await vault.readInternal(active), null);
  assert.equal((await library.files.read(`.system/whalewing/active/${name}/references/data.txt`)).content, '保留资源');
  const current = await library.read(name); assert.equal(current.sourceRoot, vault.root);
  const rollback = await library.rollback({ name, expectedHash: current.hash }, async () => {});
  assert.match((await library.read(name)).content, /先核对输入/); assert.notEqual(rollback.hash, current.hash);
  const other = new Vault(path.join(root, 'other-vault')); await other.initialize();
  const switched = new SkillLibrary(other, library.root); await switched.ensureReady();
  await assert.rejects(switched.verifySources(await switched.read(name)), { code: 'SKILL_SOURCE_ROOT' });
  await vault.atomic(active, old);
  const retry = new SkillLibrary(vault, library.root);
  await assert.rejects(retry.ensureReady(), { code: 'CONFLICT' });
  assert.equal((await vault.readInternal(active)).content, old);
});

test('演进正文编辑、发布和停用恢复保留相对资源，普通管理不能绕过检查门', async t => {
  const { library, vault } = await setup(t); await vault.initialize();
  const source = await vault.write('40-知识/来源.md', note, ''); const name = 'whalewing-user-assets';
  const candidate = await library.stage({ name, content: text(name, '读取 references/example.txt'), sourcePaths: [source.path], sourceHashes: { [source.path]: source.hash }, expectedHash: '' });
  await library.files.atomic(`.system/whalewing/candidates/${name}/references/example.txt`, '伴随技能的资源');
  await library.publish({ name, expectedHash: candidate.hash, activeHash: '', review }, async () => {});
  const activeId = library.location(name, 'active'), active = (await library.manage({ action: 'read', id: activeId })).entry;
  assert.deepEqual(active.sourcePaths, [source.path]); assert.equal(active.hash, candidate.hash);
  await assert.rejects(library.manage({ action: 'update', id: activeId, content: text(name), expectedHash: active.hash }), { code: 'SKILL_EVOLUTION' });
  assert.equal((await library.files.read(`.system/whalewing/active/${name}/references/example.txt`)).content, '伴随技能的资源');
  await library.disable({ name, expectedHash: active.hash });
  assert.equal((await library.files.read(`.system/whalewing/disabled/${name}/references/example.txt`)).content, '伴随技能的资源');
  await library.restore({ name, expectedHash: active.hash }, async () => {});
  assert.equal((await library.files.read(`.system/whalewing/active/${name}/references/example.txt`)).content, '伴随技能的资源');
});

test('损坏正文修复与新增共享名称唯一校验，碰撞不覆盖而不同名称仍可修复', async t => {
  const { library } = await setup(t);
  await library.manage({ action: 'create', id: 'first.md', content: text('collision'), expectedHash: '' });
  await library.files.atomic('broken.md', '损坏正文');
  const broken = (await library.manage({ action: 'read', id: 'broken.md' })).entry;
  await assert.rejects(library.manage({ action: 'update', id: broken.id, expectedHash: broken.hash, content: text('collision') }), { code: 'CONFLICT' });
  assert.equal((await library.files.read(broken.id)).content, '损坏正文');
  const repaired = await library.manage({ action: 'update', id: broken.id, expectedHash: broken.hash, content: text('repaired-distinct') });
  assert.equal(repaired.entry.name, 'repaired-distinct');
  assert.equal((await library.catalog()).entries.filter(entry => entry.name === 'collision').length, 1);
});

for (const action of ['remove', 'reset']) test(`${action}最后快照之后新增资源仍随整bundle搬移，不递归删除`, async t => {
  const { library } = await setup(t);
  let entry;
  if (action === 'remove') entry = (await library.manage({ action: 'create', id: 'late/SKILL.md', content: text('late'), expectedHash: '' })).entry;
  else {
    const base = (await library.manage({ action: 'read', id: '.system/whalewing/builtin/whalewing-check/SKILL.md' })).entry;
    entry = (await library.manage({ action: 'update', id: base.id, expectedHash: base.hash, content: base.content + '\n员工编辑\n' })).entry;
  }
  const bundle = path.posix.dirname(entry.id), original = library.files.snapshot.bind(library.files); let count = 0;
  library.files.snapshot = async (relative, signal) => {
    const result = await original(relative, signal);
    // entry读回、retire预检、rename前最终快照：在最终快照返回旧值后插入真实资源。
    if (relative === bundle && ++count === 3) await fs.writeFile(await library.files.resolve(`${bundle}/late.txt`), '并发新增，必须保留');
    return result;
  };
  await assert.rejects(library.manage({ action, id: entry.id, expectedHash: entry.hash, ...(entry.baseHash ? { expectedBaseHash: entry.baseHash } : {}) }), { code: 'RECOVERY_CHANGED' });
  assert.equal(count, 3);
  assert.equal((await library.files.read(`.system/whalewing/recovery/removed-${digest(entry.id)}/late.txt`)).content, '并发新增，必须保留');
  assert.equal(await library.files.read(entry.id), null);
});

test('迁移清理的最后快照之后新增资源保留在同根搬移材料，重试不会伪称成功', async t => {
  const { vault, library } = await setup(t); await vault.initialize();
  const source = await vault.write('40-知识/来源.md', note, ''), name = 'whalewing-user-migration-late';
  const bundle = `.whalewing/skills/${name}`;
  const content = text(name).replace('---\n读取', `metadata:\n  whalewingSources:\n    - path: ${source.path}\n      hash: ${source.hash}\n---\n读取`);
  await vault.atomic(`${bundle}/SKILL.md`, content);
  const original = SkillFiles.prototype.snapshot; let count = 0;
  SkillFiles.prototype.snapshot = async function(relative, signal) {
    const result = await original.call(this, relative, signal);
    if (this.root === vault.root && relative === bundle && ++count === 4) await fs.writeFile(await this.resolve(`${bundle}/late.txt`), '迁移并发新增');
    return result;
  };
  try { await assert.rejects(library.ensureReady(), { code: 'RECOVERY_CHANGED' }); }
  finally { SkillFiles.prototype.snapshot = original; }
  assert.equal(count, 4);
  const pending = `.whalewing/recovery/pending-migration-${digest(bundle)}`;
  assert.equal((await vault.readInternal(`${pending}/late.txt`)).content, '迁移并发新增');
  assert.equal(await vault.readInternal(`${bundle}/SKILL.md`), null);
  await assert.rejects(library.ensureReady(), { code: 'CONFLICT' });
  assert.equal((await vault.readInternal(`${pending}/late.txt`)).content, '迁移并发新增');
});

test('迁移最终归档rename前新增资源经最终读回回到pending，重启继续拒收差异', async t => {
  const { vault, library } = await setup(t); await vault.initialize();
  const source = await vault.write('40-知识/来源.md', note, ''), name = 'whalewing-user-final-late';
  const bundle = `.whalewing/skills/${name}`, pending = `.whalewing/recovery/pending-migration-${digest(bundle)}`;
  await vault.atomic(`${bundle}/SKILL.md`, text(name).replace('---\n读取', `metadata:\n  whalewingSources:\n    - path: ${source.path}\n      hash: ${source.hash}\n---\n读取`));
  const original = SkillFiles.prototype.snapshot; let count = 0;
  SkillFiles.prototype.snapshot = async function(relative, signal) {
    const result = await original.call(this, relative, signal);
    if (this.root === vault.root && relative === pending && ++count === 2) await fs.writeFile(await this.resolve(`${pending}/late-final.txt`), '最终搬移并发新增');
    return result;
  };
  try { await assert.rejects(library.ensureReady(), { code: 'RECOVERY_CHANGED' }); }
  finally { SkillFiles.prototype.snapshot = original; }
  assert.equal(count, 2);
  assert.equal((await vault.readInternal(`${pending}/late-final.txt`)).content, '最终搬移并发新增');
  assert.equal(await vault.readInternal(`.whalewing/recovery/migrated-${digest(bundle)}/SKILL.md`), null);
  const restarted = new SkillLibrary(vault, library.root);
  await assert.rejects(restarted.ensureReady(), { code: 'CONFLICT' });
  assert.equal((await vault.readInternal(`${pending}/late-final.txt`)).content, '最终搬移并发新增');
});

test('Web形态仅preset扫描用户根，官方管理投影标记已入库而不扩大其它scope', async t => {
  const { root } = await setup(t), ctx = new Context(); new TypertRegistry(ctx);
  const registry = new SkillRegistry(ctx);
  await ctx.plugin(LocalFileSystem, { cwd: root, diffBasisMaxBytes: 1024 * 1024 });
  ctx.provide('commands', { register() {} }); ctx.provide('sessionQuery', {}); ctx.provide('sessionProjections', { register() {} }); ctx.provide('sessions', {});
  const { service, skillsHost } = await mountFeatures(ctx, root, { vaultRoot: path.join(root, 'scoped-vault') }, false);
  const providers = [];
  const standardKey = {}, isolatedKey = {}, standard = createScope(ctx, standardKey), isolated = createScope(ctx, isolatedKey);
  standard.ctx.skills.registerProvider(control => { const p = new FileSystemSkillProvider(standard.ctx, control, { dshHome: path.dirname(service.skills.root), agentsHome: path.join(root, 'agents'), watch: false }); providers.push(p); return p; });
  t.after(async () => { for (const p of providers) await p.dispose(); await standard.dispose(); await isolated.dispose(); await ctx.fiber.dispose(); });
  await skillsHost.manageSkills({ action: 'create', id: 'scoped-only/SKILL.md', content: text('scoped-only'), expectedHash: '' });
  assert.equal(await registry.get('scoped-only'), undefined);
  const listed = await skillsHost.manageSkills({ action: 'list' });
  assert.equal(listed.entries.find(entry => entry.name === 'scoped-only').discovery, 'catalogued', JSON.stringify({ projection: await service.projectSkills(), root: service.skills.root }));
  assert.ok((await service.skillCandidates()).skills.some(skill => skill.name === 'scoped-only'));
  assert.match((await registry.get('scoped-only', { scope: standardKey })).content, /执行任务/);
  assert.equal(await registry.get('scoped-only', { scope: isolatedKey }), undefined);
  assert.equal(await registry.get('scoped-only'), undefined);
  // 临时官方解析器也走真实 ctx.fs；取消后必须释放，且不留下全局注册。
  const controller = new AbortController(), originalList = ctx.fs.listDir.bind(ctx.fs);
  let disposed = 0; const originalDispose = FileSystemSkillProvider.prototype.dispose;
  FileSystemSkillProvider.prototype.dispose = async function() { if (this.name === 'whalewing-library-candidates') disposed++; return originalDispose.call(this); };
  ctx.fs.listDir = async (...args) => { controller.abort(new Error('员工取消候选读取')); return originalList(...args); };
  try { await assert.rejects(service.projectSkills(controller.signal), /员工取消/); }
  finally { ctx.fs.listDir = originalList; FileSystemSkillProvider.prototype.dispose = originalDispose; }
  assert.ok(disposed >= 1); assert.equal(await registry.get('scoped-only'), undefined);
});

test('用户根身份编码或规模预检未通过时，不把官方投影送入未检查的目录', async t => {
  const { library } = await setup(t); await library.ensureReady();
  let projected = 0;
  library.dependencies.projectSkills = async () => { projected++; return { candidates: [], complete: true }; };
  await library.files.atomic('good.md', text('good'));
  await fs.writeFile(await library.files.resolve('invalid.md'), Buffer.from([0xff, 0xfe]));
  const list = await library.catalog();
  assert.equal(projected, 0);
  assert.match(list.entries.find(entry => entry.id === 'good.md').issue, /读取暂停/);
  assert.equal(list.entries.find(entry => entry.id === 'good.md').discovery, 'unknown');
});

for (const scenario of ['cancel-late-result', 'cancel-late-error', 'timeout-late-result']) test(`真实FS暂停屏障：${scenario}先结束等待并释放，迟到结果不续发`, { timeout: 5000 }, async t => {
  const { root } = await setup(t), ctx = new Context(); new TypertRegistry(ctx); new SkillRegistry(ctx);
  await ctx.plugin(LocalFileSystem, { cwd: root, diffBasisMaxBytes: 1024 * 1024 });
  ctx.provide('commands', { register() {} }); ctx.provide('sessionQuery', {}); ctx.provide('sessionProjections', { register() {} }); ctx.provide('sessions', {});
  const previous = process.env.DSH_HOME; process.env.DSH_HOME = path.join(root, 'cancel-home');
  let service;
  try { service = new Whalewing(ctx, { vaultRoot: path.join(root, 'cancel-vault') }); }
  finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; }
  await service.skills.ensureReady();
  await service.skills.files.atomic('late.md', text('late'));
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), drained = Promise.withResolvers();
  const originalList = ctx.fs.listDir.bind(ctx.fs), originalDispose = FileSystemSkillProvider.prototype.dispose, originalProviderList = FileSystemSkillProvider.prototype.list;
  let underlyingFinished = false, disposed = 0, returned = 0, rejected = 0;
  ctx.fs.listDir = async (...args) => {
    entered.resolve(); await release.promise;
    if (scenario === 'cancel-late-error') throw new Error('迟到FS拒绝');
    return originalList(...args);
  };
  FileSystemSkillProvider.prototype.list = async function(...args) {
    try { return await originalProviderList.apply(this, args); }
    finally { if (this.name === 'whalewing-library-candidates') { underlyingFinished = true; drained.resolve(); } }
  };
  FileSystemSkillProvider.prototype.dispose = async function() {
    if (this.name === 'whalewing-library-candidates') disposed++;
    return originalDispose.call(this);
  };
  const controller = new AbortController();
  const signal = controller.signal;
  // 屏障只在拒绝与cleanup断言完成后释放；旧的直接await实现会超时，而不会被夹具提前放行。
  const operation = service.projectSkills(signal);
  operation.then(() => { returned++; }, () => { rejected++; });
  try {
    await entered.promise;
    if (scenario.startsWith('timeout')) {
      // 计时在真实FS已经进入屏障后开始，调度缓慢不会把测试误变成“尚未发起就取消”。
      const deadline = AbortSignal.timeout(35);
      deadline.addEventListener('abort', () => controller.abort(deadline.reason), { once: true });
    } else controller.abort(new Error('员工取消屏障中的读取'));
    await assert.rejects(operation, scenario.startsWith('timeout') ? { name: 'TimeoutError' } : /员工取消/);
    assert.equal(underlyingFinished, false);
    assert.ok(disposed >= 1);
    assert.equal(getEventListeners(signal, 'abort').length, 0);
    assert.equal(returned, 0); assert.equal(rejected, 1);
  } finally {
    release.resolve(); await drained.promise;
    ctx.fs.listDir = originalList;
    FileSystemSkillProvider.prototype.dispose = originalDispose;
    FileSystemSkillProvider.prototype.list = originalProviderList;
    await ctx.fiber.dispose();
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(returned, 0); assert.equal(rejected, 1);
});
