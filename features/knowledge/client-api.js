import { knowledgeContract } from './contract.js';
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createKnowledgeClient(bridge, t, z, assistant) {
    const { featureRemote, unwrap, failure } = bridge;
    const knowledge = async (input, signal) => {
      const value = unwrap(await featureRemote('whalewingKnowledge').manage(input, signal));
      if (input.action === 'graph') {
        const parsed = knowledgeContract(z).graphResult.safeParse(value);
        if (!parsed.success) throw failure(t('graphVersionMismatch'), 'graph_contract_mismatch');
        return parsed.data;
      }
      return value;
    };

  return {
    knowledge, request: bridge.request, open: bridge.open, subscribeTheme: bridge.subscribeTheme,
    assistantContext: assistant.assistantContext, subscribeContext: assistant.subscribeContext, insertReference: assistant.insertReference,
  };
}
