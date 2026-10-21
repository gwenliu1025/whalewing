import { createHostBridge } from './host-bridge.js';
import { createWorkbenchSession } from './workbench-session.js';
import { createExpertsClient } from '../../features/experts/client-api.js';
import { createAssistantClient } from '../../features/assistant/client-api.js';
import { createKnowledgeClient } from '../../features/knowledge/client-api.js';
import { createSkillsClient } from '../../features/skills/client-api.js';
import { createAutomationClient } from '../../features/automation/client-api.js';
import { createCardsClient } from '../../features/cards/client-api.js';
import { createAiWebClient } from '../../features/ai-web/client-api.js';
import { createModelWorldClient } from '../../features/model-world/client-api.js';

/** 只组合真实消费者；每个领域实例保留自己的状态。 */
export function createClients(ctx, t, z, explainError) {
  const bridge = createHostBridge(ctx, t, explainError);
  const workbenchSession = createWorkbenchSession(bridge, t, z);
  const experts = createExpertsClient(bridge, t);
  const assistant = createAssistantClient(bridge, t, experts);
  const automation = createAutomationClient(bridge, t, z);
  const clients = {
    experts, assistant, automation,
    knowledge: createKnowledgeClient(bridge, t, z, assistant),
    skills: createSkillsClient(bridge, t),
    cards: createCardsClient(bridge, t, z, automation),
    'ai-web': createAiWebClient(bridge, t, z, workbenchSession),
    'model-world': createModelWorldClient(bridge, t, z),
  };
  // Cards连接消失时只撤销提交适配，不清除定时领域的待确认身份。
  clients.cards.connectSchedule = () => automation.bindNewsAdapter(clients.cards.scheduleAdapter);
  return { bridge, clients, workbenchSession };
}
