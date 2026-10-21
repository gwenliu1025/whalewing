import { Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { registerBuiltin } from '../../src/features.js';
import { skillLibraryContract } from './contract.js';
import { apply as registerTool } from './tool.js';

const contract = skillLibraryContract(z);
export default class Skills extends Service {
  static inject = ["whalewing", "typert"];
  constructor(ctx) {
    super(ctx, 'whalewingSkills');
    registerBuiltin(ctx, 'skills');
    this.host = ctx.whalewing;
    this.closing = new AbortController();
    this.pending = new Set();
    this.typertRemote = bindTypertRemote(this, 'whalewingSkills', { namespace: 'whalewingSkills' });
    ctx.typert.register(contract.host);
    ctx.inject(['tools', 'sandboxPolicy'], scope => registerTool(scope));
    this.host.commands.handle('skill', (input, caller) => this.host.execute(input, caller));
    ctx.effect(() => async () => {
      this.closing.abort(new Error('功能已卸载，当前操作停止'));
      await Promise.allSettled([...this.pending]);

    });
  }
  async manageSkills(raw, signal) {
    try {
      const input = contract.input.parse(raw);
      signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(this.host.vault.limits.operationMs), ...(signal ? [signal] : [])]);
      const operation = ['list', 'read', 'create', 'update', 'remove', 'reset'].includes(input.action)
        ? this.host.skills.manage(input, signal)
        : this.host.execute({ ...input, domain: 'skill' }, { kind: 'human', signal });
      this.pending.add(operation);
      try {
        const result = await operation;
        if (!['list', 'read'].includes(input.action)) this.ctx.emit('whalewing/changed');
        return contract.result.parse(result);
      } finally { this.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

}
