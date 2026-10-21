import * as experts from '../../features/experts/client.js';
import * as assistant from '../../features/assistant/client.js';
import * as knowledge from '../../features/knowledge/client.js';
import * as skills from '../../features/skills/client.js';
import * as automation from '../../features/automation/client.js';
import * as ai_web from '../../features/ai-web/client.js';
import * as toolbox from '../../features/toolbox/client.js';
import * as cards from '../../features/cards/client.js';
import * as model_world from '../../features/model-world/client.js';

import { parts } from '../../features/index.js';
import { watchFeatures } from './feature-sync.js';

export const clients = { experts, assistant, knowledge, skills, automation, 'ai-web': ai_web, toolbox, cards, 'model-world': model_world };

/** 核心只消费权威完整帧；外部客户端仍由它自己的 DSH 行加载。 */
export function startFeatures(ctx, workbench) {
  const active = new Map(), core = workbench.internal;
  let stopped = false, reconciliation = Promise.resolve();
  const start = (id, instance, epoch) => { const fork = ctx.plugin(clients[id]); active.set(id, { fork, instance, epoch }); };
  for (const part of parts) if (part.kind === 'base') start(part.id);
  ctx.effect(() => () => { stopped = true; for (const { fork } of active.values()) fork.dispose(); active.clear(); });
  ctx.inject(['pluginNavigation'], scope => {
    core.setManageFeatures(() => scope.pluginNavigation.openBundle('dsh-whalewing'));
    scope.effect(() => () => core.setManageFeatures(null));
  });
  ctx.inject(['remote.whalewingWorkbench'], scope => {
    const sync = watchFeatures(scope, {
      accept(frame, epoch) {
        core.setFeatures(frame, epoch);
        reconciliation = reconciliation.then(async () => {
          if (stopped || core.featureSnapshot() !== frame) return;
          for (const part of parts) if (part.kind === 'optional') {
            if (stopped || core.featureSnapshot() !== frame) return;
            const host = frame.features.find(feature => feature.id === part.id);
            const enabled = core.featureEnabled(part.id), current = active.get(part.id);
            if (current && (!enabled || current.instance !== host.instance || current.epoch !== epoch)) {
              core.releaseFeature(part.id);
              await current.fork.dispose(); active.delete(part.id);
            }
            if (stopped || core.featureSnapshot() !== frame) return;
            if (enabled && !active.has(part.id)) start(part.id, host.instance, epoch);
          }
        }).catch(error => { if (!stopped) workbench.notify('功能开关暂未应用，请重试连接', { kind: 'error', action: { label: '重试连接', run: () => sync.retry() } }); });
      },
      reset(epoch) { core.resetFeatures(epoch); },
      failure(error, retry) { workbench.notify('功能开关暂未同步，请重试连接', { kind: 'error', action: { label: '重试连接', run: retry } }); },
    });
    core.setRetryFeature(id => sync.retryBase(id));
    scope.effect(() => () => { sync.dispose(); core.setRetryFeature(null); });
  });
}
