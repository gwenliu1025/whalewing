import { Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { abort, fail } from '../../src/vault.js';
import { registerBuiltin } from '../../src/features.js';
import { createHash } from 'node:crypto';
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { LockedDomain } from '../../src/host/locked-domain.js';
import { AiWebStore, aiWebDomain } from './store.js';
import { aiWebContract } from './contract.js';
const profileAiWebDomain = directory => defineDomain({ ...aiWebDomain, name: `${aiWebDomain.name}_${createHash('sha256').update(directory).digest('hex')}` });

const contract = aiWebContract(z);
export default class AiWeb extends Service {
  static inject = ["whalewing", "typert"];
  constructor(ctx) {
    super(ctx, 'whalewingAiWeb');
    registerBuiltin(ctx, 'ai-web');
    this.host = ctx.whalewing;
    this.resource = new LockedDomain({
      directory: signal => this.host.profileDirectory(signal),
      facility: () => {
        const facility = this.ctx.get('storageDomain');
        if (!facility) fail('AI_WEB_UNAVAILABLE', '宿主本地存储服务尚未加载，未修改 AI 入口');
        return facility;
      },
      lockName: 'whalewing-ai-web', definition: profileAiWebDomain,
      create: domain => new AiWebStore(domain),
    });
    this.typertRemote = bindTypertRemote(this, 'whalewingAiWeb', { namespace: 'whalewingAiWeb' });
    ctx.typert.register(contract.host);

    ctx.effect(() => () => this.resource.close());
  }
  aiWebOwner(signal) { return this.resource.get(signal); }

  async manageAiWeb(raw, signal) {
    try {
      const input = contract.input.parse(raw);
      signal = AbortSignal.any([this.resource.signal, AbortSignal.timeout(this.host.vault.limits.operationMs), ...(signal ? [signal] : [])]);
      abort(signal);
      return await this.resource.run(async () => { const owner = await this.aiWebOwner(signal); abort(signal); return contract.result.parse(await owner.manage(input, signal)); });
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

}
