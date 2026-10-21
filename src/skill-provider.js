import path from 'node:path';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { fail } from './vault.js';



/** 复用宿主发现器，仅在本插件边界增加员工技能的来源失效检查。 */
export class WhalewingSkillProvider extends FileSystemSkillProvider {
  constructor(ctx, control, library, features) {
    super(ctx, control, { providerName: 'whalewing', includeDefaultRoots: false, bundledSkillDir: library.builtinDir, customSkillDirs: [library.activeDir], watchFollowSymlinks: false });
    this.library = library;
    this.features = features;
    this.control = control;
    this.extensions = new Map();
    this.retiring = new Set();
    this.closed = false;
    this.stop = ctx.on('whalewing/changed', () => { this.prune(); });
  }

  active() { return this.features().features.filter(feature => !feature.error); }

  bundledEnabled(candidate) {
    if (candidate.name === 'whalewing-check') return true;
    return this.active().some(feature => feature.package === 'dsh-whalewing' && feature.skills.some(directory => path.basename(directory) === candidate.name));
  }

  extensionRoots() {
    return new Set(this.active().filter(feature => feature.kind === 'extension').flatMap(feature => feature.skills.map(directory => path.resolve(directory))));
  }

  prune() {
    const roots = this.closed ? new Set() : this.extensionRoots();
    for (const [directory, provider] of this.extensions) {
      if (roots.has(directory)) continue;
      this.extensions.delete(directory);
      const operation = Promise.resolve().then(() => provider.dispose());
      this.retiring.add(operation);
      operation.then(() => this.retiring.delete(operation), error => { this.retiring.delete(operation); this.cleanupError ??= error; });
    }
  }

  async list(options) {
    await this.library.ensureReady(options.signal);
    if (this.closed) fail('FEATURE_CLOSED', '技能来源已卸载');
    const observed = await super.list(options);
    const candidates = Array.isArray(observed) ? observed : observed.candidates;
    const accepted = [];
    for (const candidate of candidates) {
      if (candidate.source === 'bundled') { if (this.bundledEnabled(candidate)) accepted.push(candidate); continue; }
      try {
        const record = await this.library.read(candidate.name);
        await this.library.verifySources(record);
        accepted.push(candidate);
      } catch (error) {
        // 损坏或失效的个人方法退出可用目录视图；面板保留原件和诊断供修订。
        if (!['SKILL_STALE', 'SKILL_SOURCE_ROOT', 'NOT_FOUND', 'SKILL_NOT_FOUND', 'SKILL_NAME', 'SKILL_FORMAT', 'SKILL_SOURCE', 'SYMLINK', 'PATH', 'METADATA', 'INVALID_TEXT', 'SIZE', 'NOT_INITIALIZED'].includes(error.code)) throw error;
      }
    }
    const roots = this.extensionRoots();
    this.prune();
    let complete = Array.isArray(observed) ? true : observed.complete;
    for (const directory of roots) {
      if (this.closed || !this.extensionRoots().has(directory)) continue;
      let provider = this.extensions.get(directory);
      if (!provider) {
        provider = new FileSystemSkillProvider(this.ctx, this.control, { providerName: 'whalewing', includeDefaultRoots: false, bundledSkillDir: directory, watchFollowSymlinks: false });
        this.extensions.set(directory, provider);
      }
      const found = await provider.list(options);
      if (this.closed || !this.extensionRoots().has(directory)) continue;
      accepted.push(...(Array.isArray(found) ? found : found.candidates));
      complete &&= Array.isArray(found) ? true : found.complete;
    }
    if (this.closed) fail('FEATURE_CLOSED', '技能来源已卸载');
    // 发现过程中发生关闭时，迟到结果也不重新暴露已停用的随包内容。
    const current = accepted.filter(candidate => candidate.source !== 'bundled' || this.allowed(candidate));
    return Array.isArray(observed) && complete ? current : { candidates: current, complete };
  }

  allowed(candidate) {
    if (this.closed) return false;
    if (candidate.source === 'bundled') {
      const location = path.resolve(candidate.locator.path);
      const installed = path.relative(this.library.builtinDir, location);
      if (!installed.startsWith('..' + path.sep) && !path.isAbsolute(installed)) {
        return this.bundledEnabled(candidate);
      } else {
        const active = [...this.extensionRoots()].some(directory => { const child = path.relative(directory, location); return child && !child.startsWith('..' + path.sep) && !path.isAbsolute(child); });
        return active;
      }
    }
    return true;
  }

  async get(candidate, options) {
    if (!this.allowed(candidate)) fail('FEATURE_DISABLED', '技能所属功能已关闭');
    if (candidate.source !== 'bundled') {
      const record = await this.library.read(candidate.name);
      await this.library.verifySources(record);
      const expected = await this.library.files.resolve(this.library.location(record.name, 'active'));
      if (path.resolve(candidate.locator.path) !== path.resolve(expected)) fail('SKILL_SHADOWED', '个人技能路径不匹配');
    }
    const result = await super.get(candidate, options);
    if (!this.allowed(candidate)) fail('FEATURE_DISABLED', '技能所属功能已关闭');
    return result;
  }

  async dispose() {
    this.closed = true; this.stop(); this.prune();
    await Promise.allSettled([...this.retiring]);
    await super.dispose();
    if (this.cleanupError) throw this.cleanupError;
  }
}

export function apply(ctx) {
  let provider;
  let invalidate;
  ctx.skills.registerProvider(control => {
    invalidate = control.invalidate;
    provider = new WhalewingSkillProvider(ctx, control, ctx.whalewing.skills, () => ctx.whalewing.features());
    return provider;
  });
  ctx.on('whalewing/changed', () => invalidate?.());
  ctx.effect(() => () => provider?.dispose(), 'whalewing skill watcher');

}
