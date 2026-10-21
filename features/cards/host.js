import { requireExactProjection, assertCreatedSession, sessionIssue } from '../../src/session-projection.js';
import { Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { abort, fail } from '../../src/vault.js';
import { registerBuiltin } from '../../src/features.js';
import { createHash, randomUUID } from 'node:crypto';
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { LockedDomain } from '../../src/host/locked-domain.js';
import { News, newsDomain, newsLimits } from './news.js';
import { newsContract } from './contract.js';
import { selectLearningContext } from './learning-cards.js';
import { apply as registerTool } from './tool.js';
const profileNewsDomain = directory => defineDomain({ ...newsDomain, name: `${newsDomain.name}_${createHash('sha256').update(directory).digest('hex')}` });

const contract = newsContract(z);
export default class Cards extends Service {
  static inject = ["whalewing", "typert", "whalewingAutomation", "commands"];
  constructor(ctx) {
    super(ctx, 'whalewingCards');
    registerBuiltin(ctx, 'cards');
    this.host = ctx.whalewing;
    this.resource = new LockedDomain({
      directory: signal => this.host.profileDirectory(signal),
      facility: () => {
        const facility = this.ctx.get('storageDomain');
        if (!facility) fail('NEWS_UNAVAILABLE', '宿主本地存储服务尚未加载，未修改资讯或知识库');
        return facility;
      },
      lockName: 'whalewing-news', definition: profileNewsDomain,
      create: domain => new News(domain, {
        learningContext: nextSignal => this.learningContext(nextSignal),
        identity: (sessionId, nextSignal) => this.host.automationIdentity(sessionId, nextSignal),
        catalog: nextSignal => this.ctx.whalewingAutomation.automation.catalog(nextSignal),
        pause: (task, nextSignal) => {
          const { sessionId, status, purpose: _purpose, lastDelivery: _delivery, displayPrompt: _display, workspaceScope: _scope, ...expected } = task;
          return this.ctx.whalewingAutomation.automation.manage({ action: 'pause', sessionId, id: task.id, expected, expectedStatus: status }, nextSignal);
        },
      }),
    });
    this.typertRemote = bindTypertRemote(this, 'whalewingCards', { namespace: 'whalewingCards' });
    ctx.typert.register(contract.host);
    ctx.inject(['tools', 'whalewingCards'], scope => registerTool(scope));
    ctx.inject(['schedule', 'sessionController', 'storageDomain', 'profileContext', 'agents'], async scope => {
        const lifecycle = new AbortController();
        scope.effect(() => () => lifecycle.abort(new Error('资讯默认任务依赖已卸载')));
        const operation = this.resource.run(() => this.initializeNews(AbortSignal.any([this.resource.signal, lifecycle.signal, AbortSignal.timeout(newsLimits.deadlineMs)])));
        try { await operation; this.defaultNewsError = undefined; }
        catch (error) { this.defaultNewsError = { sessionId: error.sessionId || 'default-news', message: `每日资讯默认任务未完成初始化：${error.message}`.slice(0, 400) }; }
    });

    ctx.effect(() => () => this.resource.close());
  }
  async learningContext(signal) {
    abort(signal); abort(this.resource.signal);
    if (!await this.host.vault.initialized()) return { notes: [], total: 0 };
    abort(signal);
    const records = await this.host.vault.index(signal);
    abort(signal);
    return selectLearningContext(records);
  }

  newsOwner(signal) { return this.resource.get(signal); }

  async manageNews(raw, signal) {
    try {
      const input = contract.manage.parse(raw);
      signal = AbortSignal.any([this.resource.signal, AbortSignal.timeout(newsLimits.deadlineMs), ...(signal ? [signal] : [])]);
      const operation = this.resource.run(async () => {
        const owner = await this.newsOwner(signal); abort(signal);
        const result = await owner.manage(input, signal);
        // 默认计划属于卡片域，诊断随卡片读取返回，不反向污染底座任务目录。
        if (input.action === 'list' && this.defaultNewsError) result.dependencies.issues = [...result.dependencies.issues, this.defaultNewsError].slice(0, 500);
        return contract.result.parse(result);
      });
      return await operation;
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, error.recovery ? { sessionId: error.sessionId, recovery: error.recovery } : {}); }
  }

  async executeNews(raw, caller) {
    const input = contract.execute.parse(raw);
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException('资讯操作超时', 'TimeoutError')), newsLimits.deadlineMs);
    const signal = AbortSignal.any([this.resource.signal, deadline.signal, ...(caller.signal ? [caller.signal] : [])]);
    const operation = this.resource.run(async () => {
      const owner = await this.newsOwner(signal); abort(signal);
      return contract.executionResult.parse(await owner.execute(input, { sessionId: caller.agent?.session.id, signal }));
    });
    // 候选返回后的 receipt 继续受真实调用取消约束，但已结束请求的超时不得提前作废它。
    try { return await operation; } finally { clearTimeout(timer); }
  }

  async initializeNews(signal) {
    if (this.initializing) return this.initializing;
    const operation = (async () => {
      if (!this.ctx.get('schedule')) return this.ctx.whalewingAutomation.automation.catalog(signal);
      const state = await this.newsOwner(signal).then(async owner => { await owner.initialize(); return owner.lifecycleTable; });
      if (state.get('default-news')?.accepted) return this.ctx.whalewingAutomation.automation.catalog(signal);
      const catalog = await this.ctx.whalewingAutomation.automation.catalog(signal);
      if (catalog.issues.length) fail('AUTOMATION_IDENTITY', '资讯默认计划等待原任务身份恢复；请在设置中重试');
      const existing = catalog.tasks.filter(task => task.purpose === 'news');
      if (existing.length > 1) fail('AUTOMATION_CONFLICT', '发现多条资讯计划，请先核对原任务');
      if (existing.length) {
        await state.put('default-news', { accepted: true });
        return catalog;
      }
      let pending = state.get('default-news');
      const fresh = !pending;
      if (!pending) {
        pending = { sessionId: `whalewing-news-${randomUUID()}` };
        // 先保存身份再调用宿主；未知接纳只恢复同一身份，绝不另建会话。
        await state.put('default-news', pending);
      }
      await this.createNewsSession(pending.sessionId, signal, fresh);
      await this.manageSchedules({ action: 'create', sessionId: pending.sessionId, purpose: 'news' }, signal);
      await state.put('default-news', { accepted: true });
      return this.ctx.whalewingAutomation.automation.catalog(signal);
    })();
    this.initializing = operation;
    try { return await operation; } finally { this.initializing = undefined; }
  }

  async createNewsSession(sessionId, signal, fresh = false) {
        const controller = this.ctx.get('sessionController');
        // 资讯会话直接建在“鲸翼定时任务”工作区里；宿主没有工作区服务时退回只给目录。
        const workspace = await this.ctx.whalewingAutomation.taskWorkspace(signal);
        const location = workspace ? { workspaceId: workspace.id } : { cwd: await this.ctx.whalewingAutomation.taskDirectory(signal) };
        abort(signal);
        let agent;
        if (fresh) {
          const created = await controller.create({ sessionId, ...location, agentPreset: 'standard' });
          assertCreatedSession(created, sessionId);
          if (created.agentPreset !== 'standard') fail('AUTOMATION_IDENTITY', '资讯会话身份尚未确认');
        } else {
          requireExactProjection(await controller.projections({ sessionId }, signal), sessionId, ['whalewingAutomation']);
          const registry = this.ctx.get('workspaceRegistry');
          if (!registry || !Array.isArray(registry.archivedSessionIds)) throw sessionIssue('SESSION_UNCONFIRMED', '会话归档状态还没确认，请等待工作区加载后重新检查', sessionId);
          if (registry.archivedSessionIds.includes(sessionId)) throw sessionIssue('SESSION_ARCHIVED', '这个会话已归档，请在 DSH 里取消归档后重试', sessionId, 'open');
          const resolved = await controller.resolveAgent(sessionId);
          if (resolved.error) {
            // 原生归属错误可能不带身份；只使用本次恢复请求的原ID。
            const reasons = { 'session/writer-held': '原会话写入权正被其它窗口或进程占用，请关闭占用后重试', 'session/agent-busy': '原会话属于子代理，请打开原会话处理', 'session/conflict': '原会话工作目录不同，请打开原会话核对' };
            if (reasons[resolved.error.code]) throw sessionIssue(resolved.error.code, reasons[resolved.error.code], sessionId, 'open');
            throw resolved.error;
          }
          agent = resolved.agent;
          const expectedCwd = workspace?.path || await this.ctx.whalewingAutomation.taskDirectory(signal);
          if (agent.session.header.cwd !== expectedCwd) throw sessionIssue('session/conflict', '原会话工作目录与定时任务目录不同，请打开原会话核对', sessionId, 'open');
          if (workspace) {
            await workspace.attachSession(sessionId);
            if (!workspace.sessionIds.includes(sessionId)) throw sessionIssue('SESSION_UNCONFIRMED', '原会话工作区关联还没确认，请重新检查', sessionId);
          }
        }
        abort(signal);
        if (await this.host.automationIdentity(sessionId, signal) !== 'news') {
          agent ||= this.ctx.get('agents')?.get(sessionId);
          if (!agent) fail('AUTOMATION_UNAVAILABLE', '资讯会话尚未就绪，请按原身份重试');
          const execution = await this.ctx.commands.execute(agent, '/whalewing {"action":"automation_claim","purpose":"news"}', [], signal);
          if (execution?.result?.kind !== 'success') fail('AUTOMATION_IDENTITY', '资讯会话用途认领失败，请按原身份重试');
        }
        await this.ctx.whalewingAutomation.automation.dependencies.confirmClaim(sessionId, signal);
        if (await this.host.automationIdentity(sessionId, signal) !== 'news') fail('AUTOMATION_IDENTITY', '资讯会话用途尚未回读确认');
      }
  async manageSchedules(raw, signal) {
    const input = contract.scheduleInput.parse(raw);
    signal = AbortSignal.any([this.resource.signal, AbortSignal.timeout(newsLimits.deadlineMs), ...(signal ? [signal] : [])]);
    const operation = this.resource.run(async () => {
      if (input.action === 'initializeNews') return this.initializeNews(signal);
      const owner = await this.newsOwner(signal);
      return owner.withScheduleSpec(input.sessionId, spec => this.ctx.whalewingAutomation.automation.manage({ ...input, spec }, signal), signal);
    });
    try { const result = contract.scheduleResult.parse(await operation); this.defaultNewsError = undefined; return result; } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, error.recovery ? { sessionId: error.sessionId, recovery: error.recovery } : {}); }
  }
}
