import { modelWorldContract } from './contract.js';
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createModelWorldClient(bridge, t, z) {
    const { featureRemote, unwrap, failure } = bridge;
    const worldSchema = modelWorldContract(z);
    const worldRequest = async (input, signal) => {
      const parsed = worldSchema.input.parse(input);
      signal?.throwIfAborted();
      const result = worldSchema.result.safeParse(unwrap(await featureRemote('whalewingModelWorld').manageModelWorld(parsed, signal)));
      if (!result.success || result.data.action !== input.action) throw failure(t('badReply'), 'bad_reply');
      const value = result.data;
      if (value.available && (input.action === 'detail' && value.model.id !== input.id || input.action === 'compare' && (value.models.length !== input.ids.length || new Set(value.models.map(model => model.id)).size !== input.ids.length || value.models.some(model => !input.ids.includes(model.id))))) throw failure(t('badReply'), 'bad_reply');
      if (Object.hasOwn(value, 'offset') && (value.offset !== (input.offset ?? 0) || input.limit !== undefined && value.limit !== input.limit)) throw failure(t('badReply'), 'bad_reply');
      return value;
    };

  return {
    worldRequest,
  };
}
