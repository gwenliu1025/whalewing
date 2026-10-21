import { Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { abort, fail } from '../../src/vault.js';
import { registerBuiltin } from '../../src/features.js';
import path from 'node:path';
import { mkdir, realpath } from 'node:fs/promises';
import { Automation } from './automation.js';
import { automationContract } from './contract.js';
const taskWorkspaceTitle = '鲸翼定时任务';

const contract = automationContract(z);
export default class AutomationHost extends Service {
  static inject = ["whalewing", "typert", "sessions"];
  constructor(ctx) {
    super(ctx, 'whalewingAutomation');
    registerBuiltin(ctx, 'automation');
    this.host = ctx.whalewing;
    this.closing = new AbortController();
    this.pending = new Set();
    this.typertRemote = bindTypertRemote(this, 'whalewingAutomation', { namespace: 'whalewingAutomation' });
    ctx.typert.register(contract.host);
    this.automation = new Automation({
      listWorkspaces: signal => this.host.listWorkspaces(signal),
      taskDirectory: signal => this.taskDirectory(signal),
      schedule: () => ctx.get('schedule'),
      projections: (sessionId, signal) => {
        const controller = ctx.get('sessionController');
        if (!controller) fail('AUTOMATION_UNAVAILABLE', '宿主会话服务尚未加载');
        return controller.projections({ sessionId }, signal);
      },
      confirmClaim: async (sessionId, signal) => {
        abort(signal);
        const session = ctx.sessions.get(sessionId);
        if (!session || !await ctx.sessions.flush(session)) fail('PERSISTENCE', '自动任务用途尚未确认持久化，请保留原会话并回读');
      },
      prepareModel: (sessionId, signal) => {
        const experts = ctx.get('whalewingExperts');
        if (!experts) fail('MODEL_UNAVAILABLE', '专家模型准备服务尚未加载');
        return experts.prepareModel({ sessionId, automation: true }, signal);
      },
    });
    ctx.inject(['workspaceRegistry'], async () => { try { await this.taskWorkspace(this.closing.signal); } catch { /* 创建任务时保留原入口重试。 */ } });

    ctx.effect(() => async () => {
      this.closing.abort(new Error('功能已卸载，当前操作停止'));
      await Promise.allSettled([...this.pending]);

    });
  }
  async manageAutomation(raw, signal) {
    try {
      const input = contract.input.parse(raw);
      if (Buffer.byteLength(JSON.stringify(input)) > 131072) fail('SIZE', '计划请求超过 128 KiB');
      signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(this.host.vault.limits.operationMs), ...(signal ? [signal] : [])]);
      const operation = this.automation.manage(input, signal);
      this.pending.add(operation);
      try { return contract.result.parse(await operation); }
      finally { this.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, error.recovery ? { sessionId: error.sessionId, recovery: error.recovery } : {}); }
  }

  async taskDirectory(signal) {
    abort(signal);
    const directory = path.join(this.host.dshHome, 'whalewing-tasks');
    await mkdir(directory, { recursive: true });
    abort(signal);
    return realpath(directory);
  }

  async taskWorkspace(signal) {
    const registry = this.ctx.get('workspaceRegistry');
    if (!registry) return undefined;
    const directory = await this.taskDirectory(signal);
    const workspace = await registry.create(directory, taskWorkspaceTitle);
    abort(signal);
    return workspace;
  }

}
