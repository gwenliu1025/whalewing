import { allSkills } from './feature-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { SkillRegistry } from '@deepseek-ai/dsh-skill';
import { Vault } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';
import { WhalewingSkillProvider } from '../src/skill-provider.js';
import { roles } from '../content/roles.js';

const bundledRoot = fileURLToPath(new URL('../content/skills/', import.meta.url));
async function isolated(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-adapted-skills-'));
  const ctx = new Context(), registry = new SkillRegistry(ctx), providers = [];
  // 先退出宿主发现器再删除本例目录，避免 watcher 仍消费已清理的资源。
  t.after(async () => {
    for (const provider of providers) await provider.dispose();
    await ctx.fiber.dispose();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('whalewing-adapted-skills-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const vault = new Vault(path.join(root, 'vault'));
  const skillRoot = path.join(root, 'dsh', 'skills');
  const library = new SkillLibrary(vault, skillRoot);
  registry.registerProvider(control => {
    const provider = new WhalewingSkillProvider(ctx, control, library, allSkills);
    providers.push(provider);
    return provider;
  });
  return { root, vault, library, registry, skillRoot };
}

test('七角色默认技能由目标宿主实际发现并加载，外部方法不增加平行技能入口', async t => {
  const { library, registry } = await isolated(t);
  const expected = (await fs.readdir(bundledRoot, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort();
  assert.deepEqual(expected, ['whalewing-check', 'whalewing-clarify', 'whalewing-coding', 'whalewing-debugging', 'whalewing-frontend-design', 'whalewing-knowledge', 'whalewing-news', 'whalewing-plugin-management', 'whalewing-skill-evolution', 'whalewing-web-testing', 'whalewing-writing']);
  for (const name of ['doc-coauthoring', 'internal-comms', 'frontend-design']) assert.ok(!expected.includes(name));
  assert.deepEqual((await registry.list()).map(item => item.name).sort(), expected);
  for (const role of roles) {
    // office 等宿主自带技能由 DSH 提供，这里只核对随包技能。
    for (const name of role.skills.filter(name => name.startsWith('whalewing-'))) {
      const loaded = await registry.get(name);
      const source = await fs.readFile(path.join(bundledRoot, name, 'SKILL.md'), 'utf8');
      assert.ok(loaded, `${role.id}: ${name}`);
      assert.equal(loaded.content, library.parseText(source).body.trim());
      assert.equal(loaded.source, 'bundled');
      assert.equal(loaded.resourceBase.kind, 'directory');
      assert.equal(path.resolve(loaded.resourceBase.path), path.resolve(library.builtinDir, name));
    }
  }
});

test('新版不再随包的系统技能从系统区撤下，员工改过的覆盖版连同原件保留', async t => {
  const { root, vault, skillRoot } = await isolated(t);
  const oldRoot = path.join(root, 'previous-package');
  for (const name of ['whalewing-retired', 'whalewing-retired-edited']) {
    await fs.mkdir(path.join(oldRoot, name), { recursive: true });
    await fs.writeFile(path.join(oldRoot, name, 'SKILL.md'), `---
name: ${name}
description: 合成旧包里的专业技能
---
旧包原件。
`);
  }
  const previous = new SkillLibrary(vault, skillRoot, { bundledRoot: oldRoot });
  await previous.ensureReady();
  const id = '.system/whalewing/builtin/whalewing-retired-edited/SKILL.md';
  const original = (await previous.manage({ action: 'read', id })).entry;
  await previous.manage({ action: 'update', id, expectedHash: original.hash, content: original.content.replace('旧包原件。', '员工改过的方法。') });
  const next = new SkillLibrary(vault, skillRoot);
  await next.ensureReady();
  const builtin = await fs.readdir(next.builtinDir);
  assert.ok(!builtin.includes('whalewing-retired'), '没人改过的旧系统技能撤下');
  assert.ok(builtin.includes('whalewing-retired-edited'), '有覆盖版时原件保留');
  assert.ok(builtin.includes('whalewing-check'));
  assert.match((await fs.readFile(path.join(skillRoot, 'whalewing-retired-edited', 'SKILL.md'), 'utf8')), /员工改过的方法/);
});

test('包中方法更新不覆盖员工已安装原件和个人技能，重置仍以安装原件为准', async t => {
  const { root, vault, skillRoot } = await isolated(t);
  const name = 'whalewing-check', oldRoot = path.join(root, 'previous-package');
  const oldBody = `---\nname: ${name}\ndescription: 合成旧包的文档方法\n---\n员工此前安装的原件。\n`;
  await fs.mkdir(path.join(oldRoot, name), { recursive: true });
  await fs.writeFile(path.join(oldRoot, name, 'SKILL.md'), oldBody);
  const previous = new SkillLibrary(vault, skillRoot, { bundledRoot: oldRoot });
  await previous.ensureReady();
  const id = `.system/whalewing/builtin/${name}/SKILL.md`;
  const original = (await previous.manage({ action: 'read', id })).entry;
  const edited = await previous.manage({ action: 'update', id, expectedHash: original.hash, content: oldBody.replace('员工此前安装的原件。', '员工明确保存的自定义方法。') });
  const installedBefore = await previous.files.snapshot(`.system/whalewing/builtin/${name}`);
  const personalBefore = await previous.files.snapshot(name);
  const next = new SkillLibrary(vault, skillRoot);
  await next.ensureReady();
  assert.deepEqual(await next.files.snapshot(`.system/whalewing/builtin/${name}`), installedBefore);
  assert.deepEqual(await next.files.snapshot(name), personalBefore);
  assert.equal((await next.manage({ action: 'read', id })).entry.content, oldBody);
  const current = (await next.manage({ action: 'read', id: edited.entry.id })).entry;
  assert.equal(current.content, edited.entry.content);
  await next.manage({ action: 'reset', id: current.id, expectedHash: current.hash, expectedBaseHash: current.baseHash });
  assert.equal((await next.manage({ action: 'read', id })).entry.content, oldBody);
  assert.notEqual(oldBody, await fs.readFile(path.join(bundledRoot, name, 'SKILL.md'), 'utf8'));
});
