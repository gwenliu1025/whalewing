import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { fail } from './vault.js';
import { parts } from '../features/index.js';

const packageName = z.string().regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/).max(214);
const manifestSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(80),
  api: z.number().int(), package: packageName,
  skills: z.array(z.string().refine(path.isAbsolute, '技能目录必须是绝对路径')).max(100).default([]),
  tab: z.strictObject({ placement: z.literal('end').optional(), keepAlive: z.literal(true).optional(), icon: z.string().max(65536).optional() }).optional(),
});

/** 清单只持有内置身份；登记只持有本轮运行实例，关闭不释放内置id。 */
export class FeatureRegistry {
  constructor(ctx, definitions = parts) {
    this.ctx = ctx; this.definitions = definitions; this.entries = new Map(); this.bases = new Map();
    this.revision = 0; this.instance = 0; this.listeners = new Set(); this.closed = false;
    ctx.on('internal/status', fiber => {
      const base = [...this.bases.values()].find(base => base.fiber === fiber);
      if (base) {
        if (fiber.state === 3) this.observe(base);
        else if (fiber.state === 0) base.error = '依赖服务尚未就绪，请检查 DSH 插件加载状态后重试';
        else if (fiber.state === 2) base.error = undefined;
      }
      if (base || [...this.entries.values()].some(entry => entry.fiber === fiber)) this.changed();
    });
    ctx.effect(() => () => { this.closed = true; for (const wake of this.listeners) wake(); this.listeners.clear(); });
  }

  register(ctx, raw, builtin) {
    const manifest = manifestSchema.parse(raw);
    if (manifest.api !== 1) fail('FEATURE_API', '这个扩展使用的接口版本不匹配，请安装支持 v1 扩展接口的鲸翼或更新扩展');
    const definition = this.definitions.find(part => part.id === manifest.id);
    if (this.entries.has(manifest.id) || definition && builtin !== definition.id) fail('FEATURE_CONFLICT', '这个功能名称已被使用，请修改扩展的功能 id');
    if (builtin && (!definition || manifest.package !== 'dsh-whalewing')) fail('FEATURE_CONFLICT', '内置功能登记与清单不一致');
    if (ctx.fiber.uid === null || this.closed) fail('FEATURE_CLOSED', '功能已卸载，请重新打开后再试');
    const entry = { ...manifest, kind: definition?.kind ?? 'extension', instance: ++this.instance, fiber: ctx.fiber };
    this.entries.set(manifest.id, entry); this.changed();
    return ctx.effect(() => () => {
      if (this.entries.get(manifest.id) !== entry) return;
      this.entries.delete(manifest.id); this.changed();
    });
  }

  changed() {
    if (this.closed) return;
    this.revision++;
    for (const wake of this.listeners) wake();
    this.ctx.emit('whalewing/changed');
  }

  snapshot() {
    const features = [...this.entries.values()].filter(entry => entry.fiber.state === 2).map(({ fiber, ...entry }) => entry);
    for (const base of this.bases.values()) {
      if (features.some(entry => entry.id === base.part.id)) continue;
      features.push({ id: base.part.id, kind: 'base', api: 1, package: 'dsh-whalewing', skills: [], error: base.error ?? '功能正在加载，请稍后重试' });
    }
    return { revision: this.revision, features };
  }

  caller(ctx) {
    if (this.closed || ctx.fiber.uid === null) fail('FEATURE_CLOSED', '调用功能已经卸载');
    for (let fiber = ctx.fiber; ; fiber = fiber.parent.fiber) {
      const entry = [...this.entries.values()].find(entry => entry.fiber === fiber);
      if (entry && fiber.uid !== null && ![3, 4, 5].includes(fiber.state)) return entry;
      if (fiber === fiber.parent.fiber) break;
    }
    fail('FEATURE_CALLER', '请先登记扩展功能，再读取个人知识');
  }

  loadBase(part, create) {
    const base = { part, create }; this.bases.set(part.id, base);
    try { base.fiber = create().ctx.fiber; this.observe(base); }
    catch (error) { base.error = error.message; this.changed(); }
  }

  async observe(base) {
    try {
      await base.fiber.await();
      base.error = base.fiber.state === 0 ? '依赖服务尚未就绪，请检查 DSH 插件加载状态后重试' : undefined;
    } catch (error) { base.error = error.message; }
    this.changed();
  }

  async retry(id) {
    const base = this.bases.get(id);
    if (!base || this.closed) fail('FEATURE_RETRY', '这项功能没有可重试的基础服务');
    if (base.fiber?.state === 2) return;
    if (base.retrying) return base.retrying;
    const operation = (async () => {
      try {
        if (base.fiber) await base.fiber.restart();
        else base.fiber = base.create().ctx.fiber;
        await this.observe(base);
      } catch (error) { base.error = error.message; this.changed(); }
    })();
    base.retrying = operation;
    try { await operation; } finally { base.retrying = undefined; }
  }

  async *watch(signal) {
    let wake = Promise.withResolvers();
    const notify = () => wake.resolve();
    this.listeners.add(notify); signal?.addEventListener('abort', notify);
    try {
      while (!this.closed && !signal?.aborted) {
        const frame = this.snapshot();
        wake = Promise.withResolvers();
        yield frame;
        // 消费者暂停期间发生变化时直接发送当前完整帧，不积压历史队列。
        if (frame.revision === this.revision) await wake.promise;
      }
    } finally { this.listeners.delete(notify); signal?.removeEventListener('abort', notify); }
  }
}

/** 内置登记入口只从清单派生身份和技能；外部公开register不能占用保留id。 */
export function registerBuiltin(ctx, id) {
  const part = parts.find(part => part.id === id);
  if (!part) fail('FEATURE_CONFLICT', '内置功能不在清单中');
  const skills = (part.skills ?? []).map(name => fileURLToPath(new URL(`../content/skills/${name}/`, import.meta.url)));
  return ctx.whalewing.registry.register(ctx, { id, api: 1, package: 'dsh-whalewing', skills }, id);
}
