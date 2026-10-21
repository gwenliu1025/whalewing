import * as fs from 'node:fs/promises';
import yaml from 'js-yaml';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillFiles, skillArea, stat } from './skill-files.js';
import { abort, digest, fail, frontmatter } from './vault.js';

const folders = { candidate: 'candidates', active: 'active', disabled: 'disabled' };
const bundledRoot = fileURLToPath(new URL('../content/skills', import.meta.url));

function skillName(value) {
  if (typeof value !== 'string' || !/^whalewing-user-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 80) fail('SKILL_NAME', '个人技能使用 whalewing-user- 开头的小写连字符名称');
  return value;
}

/** 员工技能文件的唯一管理入口；原件、用户编辑和演进来源分别守住自己的边界。 */
export class SkillLibrary {
  constructor(vault, root, dependencies = {}) {
    this.vault = vault; this.files = new SkillFiles(root, vault.limits); this.root = this.files.root; this.dependencies = dependencies;
    this.builtinDir = path.join(this.root, skillArea, 'builtin'); this.activeDir = path.join(this.root, skillArea, 'active');
  }

  async ensureReady(signal) {
    abort(signal);
    if (this.initialized) return;
    this.initializing ??= this.files.locked(async () => {
      await fs.mkdir(await this.files.resolve(`${skillArea}/builtin`), { recursive: true });
      const source = new SkillFiles(this.dependencies.bundledRoot ?? bundledRoot, this.vault.limits), shipped = new Set();
      for (const name of (await fs.readdir(await source.resolve())).sort()) {
        const info = await stat(await source.resolve(name));
        if (!info?.isDirectory()) continue;
        shipped.add(name);
        const bundle = await source.snapshot(name, signal);
        const instruction = bundle.files.find(file => file.path === 'SKILL.md');
        if (!instruction) continue;
        if (this.parseText(new TextDecoder('utf-8', { fatal: true }).decode(instruction.bytes)).data.name !== name) fail('SKILL_NAME', '系统技能名称须与分发 bundle 一致');
        const target = `${skillArea}/builtin/${name}`;
        // 版本不变时只安装缺失原件，现有员工安装内容不由新包静默替换。
        if (!await stat(await this.files.resolve(target))) await this.files.install(target, bundle, signal);
      }
      // 新版不再随包的系统技能（例如移到企业技能包的专业技能）从系统区撤下；员工改过的同名覆盖版还在时保留原件，免得覆盖失去基准。
      for (const name of await fs.readdir(await this.files.resolve(`${skillArea}/builtin`))) {
        if (shipped.has(name) || await stat(await this.files.resolve(name))) continue;
        await fs.rm(await this.files.resolve(`${skillArea}/builtin/${name}`), { recursive: true, force: true });
      }
      for (const folder of Object.values(folders)) await fs.mkdir(await this.files.resolve(`${skillArea}/${folder}`), { recursive: true });
      await this.migrate(signal);
      this.initialized = true;
    }, signal).finally(() => { this.initializing = undefined; });
    await this.initializing;
  }

  parseText(content) {
    if (typeof content !== 'string' || content.includes('\ufffd') || Buffer.from(content).toString('utf8') !== content || Buffer.byteLength(content) > this.vault.limits.maxNoteBytes) fail('SKILL_FORMAT', '技能正文须为有界有效 UTF-8 文本');
    const parsed = frontmatter(content), { data, body } = parsed;
    if (typeof data.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name) || data.name.length > 80 || typeof data.description !== 'string' || !data.description.trim() || !body.trim()) fail('SKILL_FORMAT', '技能需要名称、说明和正文');
    for (const key of ['disable-model-invocation', 'user-invocable']) if (data[key] !== undefined && typeof data[key] !== 'boolean') fail('SKILL_FORMAT', '技能调用设置须为布尔值');
    return parsed;
  }

  identified(id) {
    if (typeof id !== 'string' || id.includes('\\')) fail('PATH', '请使用列表返回的技能标识');
    const parts = id.split('/');
    if (parts.length === 1 && parts[0].endsWith('.md')) return { origin: 'user', bundle: id };
    if (parts.length === 2 && parts[0] !== '.system' && parts[1] === 'SKILL.md') return { origin: 'user', bundle: parts[0] };
    const prefix = `${skillArea}/`;
    if (id.startsWith(prefix)) {
      const tail = id.slice(prefix.length).split('/');
      if (tail.length === 3 && tail[2] === 'SKILL.md') {
        if (tail[0] === 'builtin') return { origin: 'builtin', bundle: id.slice(0, -9) };
        const state = Object.keys(folders).find(key => folders[key] === tail[0]);
        if (state) { skillName(tail[1]); return { origin: 'evolution', state, bundle: id.slice(0, -9) }; }
      }
    }
    fail('PATH', '标识不是受管技能指令文件');
  }

  async entry(id, signal) {
    const identity = this.identified(id);
    const raw = await this.files.read(id);
    if (!raw) return null;
    const bundle = await this.files.snapshot(identity.bundle, signal);
    const instruction = bundle?.files.find(file => file.path === (identity.bundle === id ? '' : 'SKILL.md'));
    if (!instruction || !instruction.bytes.equals(raw.bytes)) fail('CONFLICT', '读取期间技能正文变化，请重新读取');
    let data;
    try { ({ data } = this.parseText(raw.content)); }
    catch (error) {
      if (identity.origin !== 'user') throw error;
      return { id, name: path.posix.basename(id === identity.bundle ? id : identity.bundle, '.md'), description: '需要修复的技能', origin: 'user', hash: bundle.hash, actions: ['read', 'update', 'remove'], discovery: 'unavailable', issue: error.message, content: raw.content };
    }
    let origin = identity.origin, baseId, baseHash;
    if (data.metadata?.whalewingBuiltin && origin === 'user') {
      const marker = data.metadata.whalewingBuiltin;
      if (marker.name !== data.name || id !== `${data.name}/SKILL.md` || typeof marker.hash !== 'string') fail('SKILL_ORIGIN', '系统编辑覆盖的来源标记无效');
      baseId = `${skillArea}/builtin/${data.name}/SKILL.md`;
      const base = await this.files.snapshot(`${skillArea}/builtin/${data.name}`, signal);
      if (!base || base.hash !== marker.hash) fail('SKILL_ORIGIN', '系统原件版本变化，覆盖和原件均保留');
      origin = 'override'; baseHash = base.hash;
    }
    const value = {
      id, name: data.name, description: data.description, origin, hash: origin === 'evolution' ? raw.hash : bundle.hash,
      actions: origin === 'builtin' ? ['read', 'update'] : origin === 'override' ? ['read', 'update', 'reset'] : origin === 'evolution' ? ['read', 'evolve'] : ['read', 'update', 'remove'],
      discovery: 'unknown', content: raw.content,
      ...(origin === 'builtin' ? { editId: `${data.name}/SKILL.md` } : {}), ...(baseId ? { baseId, baseHash } : {}),
      ...(identity.state ? { state: identity.state } : {}),
    };
    if (origin === 'evolution') {
      const record = await this.read(data.name, identity.state);
      value.sourcePaths = record.sourcePaths;
      if (identity.state !== 'active') value.discovery = 'inactive';
      try { await this.verifySources(record); } catch (error) { value.issue = error.message; value.discovery = 'unavailable'; }
    }
    return value;
  }

  async describe(entry, observed, local, signal) {
    if (!entry || ['unavailable', 'inactive'].includes(entry.discovery)) return entry;
    const target = await fs.realpath(await this.files.resolve(entry.id));
    const found = observed?.complete && observed.skills.find(skill => skill.name === entry.name);
    if (found && path.resolve(found.path ?? '') === target) entry.discovery = 'available';
    else if (local?.candidates.some(skill => skill.name === entry.name && path.resolve(skill.path ?? '') === target)) entry.discovery = 'catalogued';
    else if (['user', 'override'].includes(entry.origin) && local && !local.complete) { entry.discovery = 'unknown'; if (local.issue) entry.issue = local.issue; }
    else if (observed?.complete) entry.discovery = found ? 'shadowed' : 'unavailable';
    abort(signal); return entry;
  }

  async catalog(offset = 0, signal) {
    await this.ensureReady(signal);
    const ids = [];
    const scan = async (root, flat) => {
      for (const item of (await fs.readdir(await this.files.resolve(root), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        abort(signal);
        if (!root && item.name === '.system') continue;
        const id = root ? `${root}/${item.name}` : item.name;
        if (item.isSymbolicLink()) fail('SYMLINK', '技能目录存在链接，请处理后重试');
        if (item.isDirectory() && await stat(await this.files.resolve(`${id}/SKILL.md`))) ids.push(`${id}/SKILL.md`);
        else if (flat && item.isFile() && item.name.endsWith('.md')) ids.push(id);
        if (ids.length > this.vault.limits.maxFiles) fail('SKILL_SIZE', '技能文件数量超出当前限制');
      }
    };
    await scan('', true); await scan(`${skillArea}/builtin`, false);
    for (const folder of Object.values(folders)) await scan(`${skillArea}/${folder}`, false);
    // 官方临时投影会扫描整个根；先检查每个受管本地文件，而不是只检查当前可见的一页。
    const eligible = new Set(); let projectionIssue, checkedBytes = 0;
    for (const id of ids.filter(id => !id.startsWith(`${skillArea}/`))) {
      abort(signal);
      try {
        const entry = await this.entry(id, signal);
        checkedBytes += Buffer.byteLength(entry?.content ?? '');
        if (checkedBytes > this.vault.limits.maxIndexBytes) fail('SKILL_SIZE', '用户技能目录正文总量超出投影限制');
        if (entry && !entry.issue) eligible.add(await fs.realpath(await this.files.resolve(id)));
      } catch (error) { abort(signal); projectionIssue ??= error.message; }
      if (checkedBytes > this.vault.limits.maxIndexBytes) break;
    }
    let local;
    if (this.dependencies.projectSkills) {
      if (projectionIssue) local = { candidates: [], complete: false, issue: `用户技能候选读取暂停：${projectionIssue}` };
      else try {
        const projected = await this.dependencies.projectSkills(signal);
        abort(signal);
        local = { ...projected, candidates: projected.candidates.filter(skill => typeof skill.path === 'string' && eligible.has(path.resolve(skill.path))) };
      } catch (error) { abort(signal); local = { candidates: [], complete: false, issue: `用户技能候选读取失败：${error.message}` }; }
    }
    let observed;
    try { observed = await this.dependencies.snapshot?.(signal); } catch { /* 发现失败不隐藏员工原件。 */ }
    const entries = [];
    for (const id of ids.slice(offset, offset + this.vault.limits.maxResults)) {
      try {
        const entry = await this.describe(await this.entry(id, signal), observed, local, signal);
        if (entry) { const { content, sourcePaths, ...summary } = entry; entries.push(summary); }
      } catch (error) {
        abort(signal);
        entries.push({ id, name: path.posix.basename(path.posix.dirname(id)) || id, description: '需要修复的技能', origin: this.identified(id).origin, hash: '', actions: [], discovery: 'unavailable', issue: error.message });
      }
    }
    return { entries, offset, total: ids.length, truncated: offset + this.vault.limits.maxResults < ids.length };
  }

  async candidates(signal) {
    const skills = new Map(), issues = new Set(); let offset = 0, page;
    do {
      page = await this.catalog(offset, signal);
      for (const entry of page.entries) {
        if (['catalogued', 'available'].includes(entry.discovery) && !skills.has(entry.name)) skills.set(entry.name, { name: entry.name, description: entry.description });
        if (entry.issue) issues.add(entry.issue);
      }
      offset += this.vault.limits.maxResults;
    } while (page.truncated);
    return { skills: [...skills.values()], issues: [...issues] };
  }

  preserveText(content, original) {
    const bom = original.startsWith('\uFEFF'), crlf = original.includes('\r\n');
    let value = content.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
    if (crlf) value = value.replaceAll('\n', '\r\n');
    return (bom ? '\uFEFF' : '') + value;
  }

  async assertUniqueName(name, exceptId, signal) {
    let offset = 0, known;
    do {
      known = await this.catalog(offset, signal);
      if (known.entries.some(entry => entry.id !== exceptId && entry.name === name)) fail('CONFLICT', '技能名称已存在，请编辑原技能或使用不同名称');
      offset += this.vault.limits.maxResults;
    } while (known.truncated);
  }

  async manage(input, signal) {
    await this.ensureReady(signal);
    if (input.action === 'list') return this.catalog(input.offset, signal);
    if (input.action === 'read') return { entry: await this.entry(input.id, signal) };
    if (!['create', 'update', 'remove', 'reset'].includes(input.action)) fail('ACTION', '未知员工技能管理动作');
    return this.files.locked(async () => {
      const identity = this.identified(input.id), previous = await this.entry(input.id, signal);
      if (input.action === 'create') {
        if (identity.origin !== 'user' || previous || input.expectedHash !== '') fail('CONFLICT', '目标技能已经存在或不是用户位置，请按原标识回读');
        const { data } = this.parseText(input.content);
        if (data.metadata?.whalewingBuiltin || data.metadata?.whalewingSources) fail('SKILL_ORIGIN', '新增普通技能不接受系统覆盖或演进身份');
        await this.assertUniqueName(data.name, undefined, signal);
        if (identity.bundle !== input.id && await stat(await this.files.resolve(identity.bundle))) fail('CONFLICT', '目标 bundle 已存在，未接管已有资源');
        const files = [{ path: identity.bundle === input.id ? '' : 'SKILL.md', bytes: Buffer.from(input.content) }];
        await this.files.install(identity.bundle, this.files.snapshotValue(identity.bundle !== input.id, files), signal);
        return { entry: await this.entry(input.id, signal) };
      }
      if (!previous || previous.hash !== input.expectedHash) fail('CONFLICT', '技能版本已变化，请保留编辑并重新读取');
      if (previous.origin === 'evolution') fail('SKILL_EVOLUTION', '演进技能请通过候选和独立检查流程修改');
      if (previous.origin === 'override' && previous.baseHash !== input.expectedBaseHash) fail('CONFLICT', '系统原件版本未确认，请重新读取覆盖');
      if (input.action === 'update') {
        const { data } = this.parseText(input.content);
        if (!previous.issue && data.name !== previous.name) fail('SKILL_NAME', '编辑保留技能名称；新增技能请使用新增入口');
        if (previous.issue) await this.assertUniqueName(data.name, input.id, signal);
        if (previous.origin === 'user' && (data.metadata?.whalewingBuiltin || data.metadata?.whalewingSources)) fail('SKILL_ORIGIN', '普通编辑不得更换技能来源身份');
        let content = input.content;
        if (previous.origin === 'builtin' || previous.origin === 'override') {
          const parsed = this.parseText(content);
          const marker = { name: previous.name, hash: previous.origin === 'builtin' ? previous.hash : previous.baseHash };
          content = `---\n${yaml.dump({ ...parsed.data, metadata: { ...parsed.data.metadata, whalewingBuiltin: marker } }, { lineWidth: -1, noRefs: true })}---\n${parsed.body}`;
        }
        content = this.preserveText(content, previous.content);
        if (previous.origin === 'builtin') {
          const target = previous.editId, targetBundle = this.identified(target).bundle;
          if (await stat(await this.files.resolve(targetBundle))) fail('CONFLICT', '系统编辑目标已存在，请读取 editId 后编辑已有覆盖，不接管同名文件');
          const snapshot = await this.files.snapshot(identity.bundle, signal);
          if (snapshot.hash !== previous.hash) fail('CONFLICT', '复制前系统原件已变化');
          const files = snapshot.files.map(file => file.path === 'SKILL.md' ? { ...file, bytes: Buffer.from(content) } : file);
          await this.files.install(targetBundle, this.files.snapshotValue(true, files, snapshot.directories), signal);
          return { entry: await this.entry(target, signal) };
        }
        if ((await this.files.snapshot(identity.bundle, signal))?.hash !== previous.hash) fail('CONFLICT', '保存前技能正文或资源变化，原编辑保留');
        await this.files.atomic(input.id, content, signal);
        return { entry: await this.entry(input.id, signal) };
      }
      if (input.action === 'remove' && previous.origin !== 'user' || input.action === 'reset' && previous.origin !== 'override') fail('SKILL_PROTECTED', '系统原件保留；覆盖请重置，普通用户技能才可删除');
      await this.files.retire(identity.bundle, previous.hash, `${skillArea}/recovery/removed-${digest(input.id)}`, signal);
      return input.action === 'reset' ? { id: input.id, reset: true, baseId: previous.baseId } : { id: input.id, removed: true };
    }, signal);
  }

  async migrate(signal) {
    const old = new SkillFiles(this.vault.root, this.vault.limits), plan = [], names = new Set();
    const canonical = content => {
      const { data, body } = this.parseText(content), sources = data.metadata?.whalewingSources;
      if (!Array.isArray(sources) || !sources.length || sources.some(item => !item || typeof item.path !== 'string' || !/^[a-f0-9]{64}$/.test(item.hash))) fail('SKILL_SOURCE', '旧技能缺少可核对来源，保留原件');
      if (data.metadata?.whalewingSourceRoot && path.resolve(data.metadata.whalewingSourceRoot) !== this.vault.root) fail('SKILL_SOURCE_ROOT', '旧技能标注了其它知识库，迁移停止');
      return this.preserveText(`---\n${yaml.dump({ ...data, metadata: { ...data.metadata, whalewingSourceRoot: this.vault.root } }, { lineWidth: -1, noRefs: true })}---\n${body}`, content);
    };
    const migrationPaths = source => ({ pending: `.whalewing/recovery/pending-migration-${digest(source)}`, archived: `.whalewing/recovery/migrated-${digest(source)}` });
    const locateSource = async source => {
      const paths = migrationPaths(source), present = await stat(await old.resolve(source)), pending = await stat(await old.resolve(paths.pending));
      if (present && pending) fail('CONFLICT', '迁移源与未确认的搬移材料同时存在，请保留两侧后核对');
      return pending ? paths.pending : present ? source : null;
    };
    const add = async (originalSource, source, target, snapshot, before) => {
      const current = await this.files.snapshot(target, signal);
      if (current && current.hash !== snapshot.hash) fail('CONFLICT', '旧技能迁移目标内容不同，保留两侧文件');
      plan.push({ originalSource, source, target, snapshot, before });
      if (plan.reduce((sum, item) => sum + item.snapshot.files.reduce((size, file) => size + file.bytes.length, 0), 0) > 32 * 1024 * 1024) fail('SKILL_SIZE', '旧技能迁移总量超限，原件保留');
    };
    for (const [state, folder] of Object.entries(folders)) {
      const sourceRoot = `.whalewing/${state === 'active' ? 'skills' : folder}`;
      const stateNames = new Set(await fs.readdir(await this.files.resolve(`${skillArea}/${folder}`)));
      if (await stat(await old.resolve(sourceRoot))) for (const name of await fs.readdir(await old.resolve(sourceRoot))) stateNames.add(name);
      for (const name of stateNames) {
        skillName(name); names.add(name);
        const originalSource = `${sourceRoot}/${name}`, source = await locateSource(originalSource);
        if (!source) continue;
        const before = await old.snapshot(source, signal);
        if (!before.directory) fail('SKILL_FORMAT', '旧技能不是 bundle');
        const instruction = before.files.find(file => file.path === 'SKILL.md');
        if (!instruction) { if (before.files.length) fail('SKILL_FORMAT', '旧技能缺少 SKILL.md，保留资源'); continue; }
        const text = new TextDecoder('utf-8', { fatal: true }).decode(instruction.bytes);
        if (this.parseText(text).data.name !== name) fail('SKILL_NAME', '旧技能名称与目录不匹配');
        const files = before.files.map(file => file.path === 'SKILL.md' ? { ...file, bytes: Buffer.from(canonical(text)) } : file);
        await add(originalSource, source, `${skillArea}/${folder}/${name}`, this.files.snapshotValue(true, files, before.directories), before);
      }
    }
    // 发生过中断时，已迁移活动项仍提供旧恢复键的唯一推导来源，不另存迁移清单。
    for (const folder of Object.values(folders)) for (const name of await fs.readdir(await this.files.resolve(`${skillArea}/${folder}`))) names.add(skillName(name));
    for (const name of names) {
      const oldActive = `.whalewing/skills/${name}/SKILL.md`, active = this.location(name, 'active');
      const backupId = `.whalewing/recovery/${digest(oldActive)}.json`, backupSource = await locateSource(backupId), backup = backupSource && await old.read(backupSource);
      if (backup) {
        let record; try { record = JSON.parse(backup.content); } catch { fail('RECOVERY', '旧技能回退记录损坏'); }
        if (record.path !== oldActive || typeof record.content !== 'string' || digest(record.content) !== record.hash || this.parseText(record.content).data.name !== name) fail('RECOVERY', '旧技能回退身份或哈希不匹配');
        const content = canonical(record.content), bytes = Buffer.from(JSON.stringify({ path: active, content, hash: digest(content) }) + '\n');
        await add(backupId, backupSource, `${skillArea}/recovery/${digest(active)}.json`, this.files.snapshotValue(false, [{ path: '', bytes }]), await old.snapshot(backupSource, signal));
      }
      const reviewId = `.whalewing/recovery/review-${name}.json`, reviewSource = await locateSource(reviewId), review = reviewSource && await old.read(reviewSource);
      if (review) {
        let record; try { record = JSON.parse(review.content); } catch { fail('RECOVERY', '旧技能审核记录损坏'); }
        const oldBundle = await locateSource(path.posix.dirname(oldActive));
        const oldRecord = oldBundle && await old.read(`${oldBundle}/SKILL.md`);
        const moved = plan.find(item => item.target === `${skillArea}/active/${name}`)?.snapshot.files.find(file => file.path === 'SKILL.md');
        const newRecord = moved ? { hash: digest(moved.bytes) } : await this.files.read(active);
        if (!newRecord || oldRecord && record.hash !== oldRecord.hash || !record.review) fail('RECOVERY', '旧技能审核记录无法对应活动正文');
        const bytes = Buffer.from(JSON.stringify({ ...record, hash: newRecord.hash }) + '\n');
        if (!oldRecord) {
          const established = await this.files.read(`${skillArea}/recovery/review-${name}.json`);
          if (!established || !established.bytes.equals(bytes)) fail('RECOVERY', '旧活动正文已缺失且迁移审核未确认，保留恢复材料');
        }
        await add(reviewId, reviewSource, `${skillArea}/recovery/review-${name}.json`, this.files.snapshotValue(false, [{ path: '', bytes }]), await old.snapshot(reviewSource, signal));
      }
    }
    const recoveryRoot = await old.resolve('.whalewing/recovery');
    if (await stat(recoveryRoot)) for (const name of await fs.readdir(recoveryRoot)) {
      if (name.startsWith('pending-migration-') && !plan.some(item => item.source === `.whalewing/recovery/${name}`)) fail('RECOVERY', '存在未确认归属的迁移原件，请核对恢复材料后重试');
    }
    for (const item of plan) await this.files.install(item.target, item.snapshot, signal);
    for (const item of plan) if ((await this.files.snapshot(item.target, signal))?.hash !== item.snapshot.hash || (await old.snapshot(item.source, signal))?.hash !== item.before.hash) fail('CONFLICT', '迁移回读发生变化，保留新旧文件');
    for (const item of plan) {
      abort(signal);
      const paths = migrationPaths(item.originalSource);
      if (await stat(await old.resolve(paths.archived))) fail('CONFLICT', '迁移恢复位置已存在，原件保留');
      if (item.source !== paths.pending) await old.retire(item.source, item.before.hash, paths.pending, signal);
      if ((await old.snapshot(paths.pending, signal))?.hash !== item.before.hash || (await this.files.snapshot(item.target, signal))?.hash !== item.snapshot.hash) fail('CONFLICT', '搬移材料或新目标变化，完整原件保留在迁移恢复位置');
      abort(signal);
      if (await stat(await old.resolve(paths.archived))) fail('CONFLICT', '迁移恢复目标在归位前出现，未覆盖');
      await fs.rename(await old.resolve(paths.pending), await old.resolve(paths.archived));
      try {
        if ((await old.snapshot(paths.archived, signal))?.hash !== item.before.hash || (await this.files.snapshot(item.target, signal))?.hash !== item.snapshot.hash) fail('RECOVERY_CHANGED', '迁移最终搬移后内容变化');
      } catch (error) {
        // 最终 rename 也须读回；未确认材料回到会被重试检查的 pending，不伪装已完成归档。
        try {
          if (await stat(await old.resolve(paths.pending))) fail('CONFLICT', '未确认迁移位置已出现，两个位置均保留');
          await fs.rename(await old.resolve(paths.archived), await old.resolve(paths.pending));
        } catch (restoreError) {
          fail('RECOVERY_UNKNOWN', `迁移归档未确认，恢复入口回退失败，请停止并核对 ${paths.pending} 与 ${paths.archived}：${restoreError.message}`);
        }
        fail('RECOVERY_CHANGED', `迁移最终读回未通过，完整材料保留在 ${paths.pending}，修复差异后重试：${error.message}`);
      }
    }
  }

  /** 正文演进保留相对资源；不同内容的同路径资源须人工核对，不静默覆盖。 */
  async copyResources(name, fromState, toState, signal) {
    const from = path.posix.dirname(this.location(name, fromState)), to = path.posix.dirname(this.location(name, toState));
    const snapshot = await this.files.snapshot(from, signal);
    if (!snapshot) return;
    const additions = [];
    for (const file of snapshot.files) {
      if (file.path === 'SKILL.md') continue;
      const target = `${to}/${file.path}`, current = await this.files.snapshot(target, signal);
      if (current && (current.directory || current.hash !== digest(file.bytes))) fail('CONFLICT', '技能附属资源同路径内容不同，保留双方后核对');
      if (!current) additions.push({ target, bytes: file.bytes });
    }
    for (const addition of additions) await this.files.install(addition.target, this.files.snapshotValue(false, [{ path: '', bytes: addition.bytes }]), signal);
  }

  location(name, state) {
    if (!Object.hasOwn(folders, state)) fail('SKILL_STATE', '技能位置应为 candidate、active 或 disabled');
    return `${skillArea}/${folders[state]}/${skillName(name)}/SKILL.md`;
  }

  async read(name, state = 'active') {
    await this.ensureReady();
    const record = await this.files.read(this.location(name, state));
    if (!record) fail('SKILL_NOT_FOUND', '此位置没有该技能');
    const { data, body } = frontmatter(record.content);
    if (data.name !== name || typeof data.description !== 'string' || !data.description.trim() || !body.trim()) fail('SKILL_FORMAT', '技能缺少名称、说明或方法正文');
    const sources = data.metadata?.whalewingSources;
    if (!Array.isArray(sources) || !sources.length || sources.some(s => !s || typeof s !== 'object' || typeof s.path !== 'string' || !/^[a-f0-9]{64}$/.test(s.hash))) fail('SKILL_SOURCE', '技能缺少可核对的知识来源');
    return { name, state, description: data.description, content: record.content, hash: record.hash, sourcePaths: sources.map(s => s.path), sources, sourceRoot: data.metadata?.whalewingSourceRoot };
  }

  async verifySources(record) {
    if (typeof record.sourceRoot !== 'string' || path.resolve(record.sourceRoot) !== this.vault.root) fail('SKILL_SOURCE_ROOT', '此技能来源属于另一知识库，请切回来源库后重新核对');
    for (const source of record.sources) {
      const current = await this.vault.read(source.path);
      if (current.hash !== source.hash) fail('SKILL_STALE', `技能来源已变化：${source.path}，请重新提炼与检查`);
    }
  }

  async list(signal) {
    await this.ensureReady();
    const skills = [];
    for (const [state, folder] of Object.entries(folders)) {
      const root = await this.files.resolve(`${skillArea}/${folder}`, true);
      for (const entry of await fs.readdir(root, { withFileTypes: true })) {
        abort(signal);
        if (entry.isSymbolicLink()) fail('SYMLINK', '技能目录含链接');
        if (!entry.isDirectory()) continue;
        if (skills.length >= this.vault.limits.maxResults) return { skills, truncated: true };
        try {
          const record = await this.read(entry.name, state);
          let issue;
          try { await this.verifySources(record); }
          catch (error) { issue = error.message; }
          skills.push({ name: record.name, description: record.description, state, hash: record.hash, ...(issue ? { issue } : {}) });
        } catch (error) {
          // 发布、停用或恢复后可留下空目录；没有正文就不再是该位置的一项技能。
          if (error.code !== 'SKILL_NOT_FOUND') skills.push({ name: entry.name, description: '需要修复的技能', state, hash: '', issue: error.message });
        }
      }
    }
    return { skills, truncated: false };
  }

  async stage({ name, content, sourcePaths, sourceHashes, expectedHash }, signal) {
    await this.ensureReady(signal);
    skillName(name);
    if (!Array.isArray(sourcePaths) || sourcePaths.length < 1 || sourcePaths.length > 20 || new Set(sourcePaths).size !== sourcePaths.length) fail('SKILL_SOURCE', '提供 1–20 个不重复的库内知识来源');
    if (!sourceHashes || typeof sourceHashes !== 'object' || sourcePaths.some(p => typeof sourceHashes[p] !== 'string' || !/^[a-f0-9]{64}$/.test(sourceHashes[p]))) fail('SKILL_SOURCE', 'sourceHashes须包含每个来源最近read得到的SHA256，变化后重新提炼');
    if (typeof content !== 'string' || Buffer.byteLength(content) > this.vault.limits.maxNoteBytes / 2) fail('SIZE', '候选技能超出大小限制');
    const { data, body } = frontmatter(content);
    if (data.name !== name || typeof data.description !== 'string' || data.description.length < 8 || !body.trim()) fail('SKILL_FORMAT', '提供匹配名称、清楚触发描述和执行方法');
    if (data['disable-model-invocation'] === true) fail('SKILL_FORMAT', '可用个人技能需要允许模型加载');
    return this.files.locked(async () => {
      const target = this.location(name, 'candidate');
      await this.files.checkExpected(target, expectedHash);
      const sources = [];
      for (const source of sourcePaths) {
        const record = await this.vault.read(source);
        if (record.hash !== sourceHashes[source]) fail('SKILL_STALE', `提炼期间来源已变化：${source}，请重新核对`);
        sources.push({ path: record.path, hash: record.hash });
      }
      const canonical = `---\n${yaml.dump({ ...data, metadata: { ...data.metadata, whalewingSources: sources, whalewingSourceRoot: this.vault.root } }, { lineWidth: -1, noRefs: true })}---\n${body.trim()}\n`;
      await this.copyResources(name, 'active', 'candidate', signal);
      await this.files.atomic(target, canonical, signal);
      const result = await this.read(name, 'candidate');
      return { name, state: 'candidate', hash: result.hash, sourcePaths: result.sourcePaths };
    }, signal);
  }

  async publish({ name, expectedHash, activeHash, review }, discover, signal) {
    await this.ensureReady(signal);
    if (!review || typeof review !== 'object' || ['reviewer', 'positive', 'negative'].some(key => typeof review[key] !== 'string' || review[key].trim().length < 8)) fail('SKILL_REVIEW', '发布需独立检查者及适用、不适用或失败输入的实际检查记录');
    return this.files.locked(async () => {
      const candidate = await this.read(name, 'candidate');
      if (candidate.hash !== expectedHash) fail('CONFLICT', '候选技能已变化，请重新检查');
      await this.verifySources(candidate);
      const active = this.location(name, 'active');
      const old = await this.files.checkExpected(active, activeHash);
      await this.copyResources(name, 'candidate', 'active', signal);
      if (old) await this.files.backup(active, old, signal);
      await this.files.atomic(active, candidate.content, signal);
      try {
        await discover(candidate);
        await this.verifySources(candidate);
        await this.files.atomic(`${skillArea}/recovery/review-${skillName(name)}.json`, JSON.stringify({ hash: candidate.hash, review }) + '\n', signal);
      } catch (error) {
        // 只回退本次写入；若外部已改文件，保留现场并报告冲突。
        const current = await this.files.read(active);
        if (current?.hash !== candidate.hash) fail('RECOVERY_CONFLICT', '发布验证失败且技能又被修改，请检查实际文件');
        if (old) {
          try {
            const oldSources = frontmatter(old.content).data.metadata?.whalewingSources;
            if (!Array.isArray(oldSources) || !oldSources.length || oldSources.some(s => !s || typeof s.path !== 'string' || typeof s.hash !== 'string')) fail('SKILL_SOURCE', '旧版缺少有效来源');
            await this.verifySources({ sources: oldSources, sourceRoot: frontmatter(old.content).data.metadata?.whalewingSourceRoot });
            await this.files.atomic(active, old.content);
          }
          catch (restoreError) {
            try {
              const disabled = await this.files.read(this.location(name, 'disabled'));
              if (disabled && disabled.hash !== old.hash) fail('CONFLICT', '停用位置已有不同版本，未覆盖');
              await this.copyResources(name, 'active', 'disabled');
              await this.files.atomic(this.location(name, 'disabled'), old.content);
              error.message += `；旧版保持停用：${restoreError.message}`;
            } catch (preserveError) {
              // 发布前的单份恢复记录已经持有旧正文；原资源留在活动目录，不覆盖另一停用版。
              error.message += `；旧版回退未完成：${restoreError.message}；停用保存未完成：${preserveError.message}；旧正文保留在 ${skillArea}/recovery/${digest(active)}.json，资源保留在 ${path.posix.dirname(active)}，候选保留`;
            }
            await this.files.checkExpected(active, candidate.hash);
            await fs.unlink(await this.files.resolve(active, true));
          }
        } else await fs.unlink(await this.files.resolve(active, true));
        throw error;
      }
      await fs.unlink(await this.files.resolve(this.location(name, 'candidate'), true));
      return { name, state: 'active', hash: candidate.hash, discovery: 'verified', behavior: '请由目标专家重新加载后执行并检查成果' };
    }, signal);
  }

  async disable({ name, expectedHash }, signal) {
    await this.ensureReady(signal);
    return this.files.locked(async () => {
      const current = await this.read(name, 'active');
      if (current.hash !== expectedHash) fail('CONFLICT', '技能已变化，请重新读取');
      const disabled = await this.files.read(this.location(name, 'disabled'));
      if (disabled && disabled.hash !== current.hash) fail('CONFLICT', '停用位置已有不同版本，保留两侧技能');
      await this.copyResources(name, 'active', 'disabled', signal);
      await this.files.atomic(this.location(name, 'disabled'), current.content, signal);
      abort(signal);
      await fs.unlink(await this.files.resolve(this.location(name, 'active'), true));
      return { name, state: 'disabled', hash: current.hash };
    }, signal);
  }

  async restore({ name, expectedHash }, discover, signal) {
    await this.ensureReady(signal);
    return this.files.locked(async () => {
      const record = await this.read(name, 'disabled');
      if (record.hash !== expectedHash) fail('CONFLICT', '停用版本已变化');
      await this.verifySources(record);
      const active = this.location(name, 'active');
      await this.files.checkExpected(active, '');
      await this.copyResources(name, 'disabled', 'active', signal);
      await this.files.atomic(active, record.content, signal);
      try { await discover(record); await this.verifySources(record); }
      catch (error) {
        if ((await this.files.read(active))?.hash === record.hash) await fs.unlink(await this.files.resolve(active, true));
        throw error;
      }
      await fs.unlink(await this.files.resolve(this.location(name, 'disabled'), true));
      return { name, state: 'active', hash: record.hash };
    }, signal);
  }

  async rollback({ name, expectedHash }, discover, signal) {
    await this.ensureReady(signal);
    return this.files.locked(async () => {
      const active = this.location(name, 'active');
      const current = await this.files.checkExpected(active, expectedHash);
      const backup = await this.files.read(`${skillArea}/recovery/${digest(active)}.json`);
      if (!backup) fail('NO_RECOVERY', '没有发布前的旧版；请停用问题版本并重新提炼');
      const previous = JSON.parse(backup.content);
      if (previous.path !== active || digest(previous.content) !== previous.hash) fail('RECOVERY', '旧版恢复记录损坏');
      const data = frontmatter(previous.content).data;
      const record = { name, content: previous.content, hash: previous.hash, sources: data.metadata?.whalewingSources, sourceRoot: data.metadata?.whalewingSourceRoot };
      if (data.name !== name || !Array.isArray(record.sources)) fail('RECOVERY', '旧版格式不匹配');
      await this.verifySources(record);
      await this.files.atomic(active, record.content, signal);
      try { await discover(record); await this.verifySources(record); }
      catch (error) {
        if ((await this.files.read(active))?.hash !== record.hash) fail('RECOVERY_CONFLICT', '回退后文件又被修改，请检查现场');
        if (current) await this.files.atomic(active, current.content);
        else await fs.unlink(await this.files.resolve(active, true));
        throw error;
      }
      return { name, state: 'active', hash: record.hash, discovery: 'verified' };
    }, signal);
  }
}
