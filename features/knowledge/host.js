import { Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { registerBuiltin } from '../../src/features.js';
import { knowledgeContract } from './contract.js';
import { apply as registerTool } from './tool.js';

const contract = knowledgeContract(z);
export default class Knowledge extends Service {
  static inject = ["whalewing", "typert"];
  constructor(ctx) {
    super(ctx, 'whalewingKnowledge');
    registerBuiltin(ctx, 'knowledge');
    this.host = ctx.whalewing;
    this.closing = new AbortController();
    this.pending = new Set();
    this.typertRemote = bindTypertRemote(this, 'whalewingKnowledge', { namespace: 'whalewingKnowledge' });
    ctx.typert.register(contract.host);
    ctx.inject(['tools', 'sandboxPolicy'], scope => registerTool(scope));
    for (const action of ['initialize', 'search', 'browse', 'question', 'read', 'document', 'graph', 'write', 'remove', 'restore', 'validate', 'sources', 'source_read', 'coverage', 'complete', 'source_add', 'source_remove']) this.host.commands.handle(action, (input, caller) => this.host.execute(input, caller));
    ctx.effect(() => async () => {
      this.closing.abort(new Error('功能已卸载，当前操作停止'));
      await Promise.allSettled([...this.pending]);

    });
  }
  async manage(input, signal) {
    try {
      const parsed = contract.input.parse(input);
      signal = AbortSignal.any([this.closing.signal, ...(signal ? [signal] : [])]);
      const operation = this.host.execute(parsed, { kind: 'human', signal });
      this.pending.add(operation);
      try { return await operation; } finally { this.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

}
