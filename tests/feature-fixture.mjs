import path from 'node:path';
import Whalewing from '../index.js';
import AiWeb from '../features/ai-web/host.js';
import Cards from '../features/cards/host.js';
import ModelWorld from '../features/model-world/host.js';
import * as Toolbox from '../features/toolbox/host.js';
import { parts } from '../features/index.js';

/** 单元夹具显式启用全部来源；正式运行时只读活动登记，二者不共用规则。 */
export const allSkills = () => ({ features: parts.map(part => ({ ...part, package: 'dsh-whalewing', skills: (part.skills ?? []).map(name => path.resolve('content/skills', name)) })) });

/** 当前测试独占目录内同步构造核心，随后等待真实Cordis子插件；不保留旧方法转发壳。 */
export async function mountFeatures(ctx, directory, config = {}, optional = true) {
  let core;
  const plugin = { inject: Whalewing.inject, apply(scope) {
    const previous = process.env.DSH_HOME;
    process.env.DSH_HOME = path.join(directory, 'dsh');
    try { core = new Whalewing(scope, { vaultRoot: path.join(directory, 'vault'), ...config }); }
    finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; }
  } };
  const fiber = await ctx.plugin(plugin);
  await Promise.all([...core.registry.bases.values()].map(base => base.fiber.await().catch(() => {})));
  const optionalFibers = [];
  if (optional) for (const host of [AiWeb, Toolbox, Cards, ModelWorld]) optionalFibers.push(await fiber.ctx.plugin(host));
  return { service: core, fiber, optionalFibers, knowledge: ctx.get('whalewingKnowledge'), skillsHost: ctx.get('whalewingSkills'), automationHost: ctx.get('whalewingAutomation'), cards: ctx.get('whalewingCards'), aiWebHost: ctx.get('whalewingAiWeb'), world: ctx.get('whalewingModelWorld') };
}
