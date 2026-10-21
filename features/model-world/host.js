import { Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { abort, fail } from '../../src/vault.js';
import { registerBuiltin } from '../../src/features.js';
import path from 'node:path';
import { ModelWorld } from './model-world.js';
import { modelWorldVendorIds } from '../../src/model-world-roster.js';
import { modelWorldContract, worldLimits } from './contract.js';
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http';

const contract = modelWorldContract(z);
export default class ModelWorldHost extends Service {
  static inject = ["whalewing", "typert"];
  constructor(ctx) {
    super(ctx, 'whalewingModelWorld');
    registerBuiltin(ctx, 'model-world');
    this.host = ctx.whalewing;
    this.closing = new AbortController();
    this.pending = new Set();
    this.typertRemote = bindTypertRemote(this, 'whalewingModelWorld', { namespace: 'whalewingModelWorld' });
    ctx.typert.register(contract.host);

    ctx.effect(() => async () => {
      this.closing.abort(new Error('功能已卸载，当前操作停止'));
      await Promise.allSettled([...this.pending]);
      await this.modelWorld?.dispose();
    });
  }
  async manageModelWorld(raw, signal) {
    try {
      const input = contract.input.parse(raw);
      signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(worldLimits.operationMs), ...(signal ? [signal] : [])]);
      abort(signal);
      const operation = (async () => {
        if (!this.modelWorld) {
          const directory = await this.host.profileDirectory(signal);
          abort(this.closing.signal);
          this.modelWorld ??= new ModelWorld({ root: path.join(directory, 'cache', 'whalewing-model-world'), vendorIds: modelWorldVendorIds,fetcher: new HttpFetchProvider({ maxResponseBytes: worldLimits.responseBytes, maxBodyChars: worldLimits.responseBytes, timeoutMs: 30000, maxRedirects: 0, userAgent: 'whalewing/0.1.0 ModelWorld' }) });
        }
        return this.modelWorld.execute(input, signal);
      })();
      this.pending.add(operation);
      try { return contract.result.parse(await operation); } finally { this.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

}
