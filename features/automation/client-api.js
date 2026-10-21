import { automationContract } from './contract.js';
import { requireExactProjection, assertCreatedSession } from '../../src/session-projection.js';
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createAutomationClient(bridge, t, z) {
    const { featureRemote, unwrap, failure } = bridge;
    const { hostFailure, request, attachExistingSession, readProjection, assertActiveSession } = bridge;
    const NS = 'whalewing', automationSchema = automationContract(z);
    let newsAdapter;
    const requireNewsAdapter = () => { if (!newsAdapter) throw failure('知识卡片功能已关闭，请启用后继续原任务', 'FEATURE_DISABLED'); return newsAdapter; };
    const automationRequest = async (input, signal) => {
      const parsed = automationSchema.input.parse(input);
      signal?.throwIfAborted();
      const result = automationSchema.result.safeParse(unwrap(await featureRemote('whalewingAutomation').manageAutomation(parsed, signal)));
      if (!result.success) throw failure(t('badReply'), 'bad_reply');
      const value = result.data;
      if (value.code) throw hostFailure(value.message || value.code, value.code);
      return value;
    };
    const automationCatalog = async signal => {
      const value = await automationRequest({ action: 'catalog' }, signal);
      if (typeof value.available !== 'boolean' || !['tasks', 'legacyTasks', 'issues'].every(key => Array.isArray(value[key]))) throw failure(t('badReply'), 'bad_reply');
      return value;
    };
    // 只缓存未核实创建的身份，不保存员工指令、目录或原生计划镜像。
    const automationKey = `${NS}:automation-pending:${typeof window === 'undefined' ? '' : window.location.origin}`;
    let pendingAutomation = null, automationCacheIssue = '', automationWriting = false;
    try {
      const saved = window.localStorage.getItem(automationKey);
      if (saved) pendingAutomation = z.strictObject({ sessionId: z.string().regex(/^[\w-]{1,100}$/), purpose: z.enum(['knowledge', 'custom', 'news']) }).parse(JSON.parse(saved));
    } catch { automationCacheIssue = t('taskCacheError'); }
    const cacheAutomation = value => {
      try {
        if (value) window.localStorage.setItem(automationKey, JSON.stringify(value));
        else window.localStorage.removeItem(automationKey);
      } catch { throw failure(t('taskCacheError'), 'automation_cache'); }
      pendingAutomation = value;
    };
    async function recoverAutomation(signal) {
      if (automationCacheIssue) throw failure(automationCacheIssue, 'automation_cache');
      const catalog = await automationCatalog(signal);
      if (!pendingAutomation) return { catalog, pending: null };
      const pending = pendingAutomation;
      const own = catalog.tasks.filter(task => task.sessionId === pending.sessionId);
      if (own.length > 1 || own.some(task => task.purpose !== pending.purpose)) throw failure(t('taskPendingConflict'), 'automation_identity');
      if (own.length === 1) { cacheAutomation(null); return { catalog, pending: null, recovered: own[0] }; }
      const projection = unwrap(await bridge.session.projections({ sessionId: pending.sessionId }, signal), pending.sessionId);
      signal?.throwIfAborted();
      requireExactProjection(projection, pending.sessionId, ['whalewingAutomation']);
      assertActiveSession(pending.sessionId);
      if (projection.values.whalewingAutomation !== null && projection.values.whalewingAutomation !== pending.purpose) throw failure(t('taskPendingConflict'), 'automation_identity');
      return { catalog, pending, exists: projection !== null };
    }
    async function createAutomation({ purpose, spec, workspaceScope }, resume, signal) {
      if (automationWriting) throw failure(t('taskPendingConflict'), 'automation_busy');
      if (automationCacheIssue) throw failure(automationCacheIssue, 'automation_cache');
      // 执行目录由插件统一持有，所有定时任务在同一处运行，员工不选择、不填写。
      const { directory } = await automationRequest({ action: 'directory' }, signal);
      if (typeof directory !== 'string' || !/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/)/.test(directory)) throw failure(t('badReply'), 'bad_reply');
      const specification = purpose === 'news' ? {} : { spec, ...(workspaceScope ? { workspaceScope } : {}) };
      const adapter = purpose === 'news' ? requireNewsAdapter() : null;
      (adapter ? adapter.validate : input => automationSchema.input.parse(input))({ action: 'create', sessionId: 'validation', purpose, ...specification });
      automationWriting = true;
      try {
        if (pendingAutomation && !resume) throw failure(t('taskPendingConflict'), 'automation_pending');
        if (resume && (!pendingAutomation || pendingAutomation.purpose !== purpose)) throw failure(t('taskPendingConflict'), 'automation_pending');
        const recovered = await recoverAutomation(signal);
        if (recovered.recovered) return recovered.catalog;
        if (!recovered.catalog.available) throw failure(t('scheduleUnavailable'), 'SCHEDULE_DISABLED');
        signal?.throwIfAborted();
        const fresh = !pendingAutomation;
        if (fresh) cacheAutomation({ sessionId: `whalewing-auto-${globalThis.crypto.randomUUID()}`, purpose });
        const { sessionId } = pendingAutomation;
        if (fresh) {
          const created = unwrap(await bridge.session.create({ sessionId, cwd: directory, agentPreset: 'standard' }), sessionId);
          assertCreatedSession(created, sessionId);
          if (created.agentPreset && created.agentPreset !== 'standard') throw failure(t('badReply'), 'bad_reply');
        }
        signal?.throwIfAborted();
        await attachExistingSession(sessionId, directory, signal);
        // Cards退出后保留已分配身份，停止尚未提交的领域动作。
        if (adapter && adapter !== requireNewsAdapter()) throw failure('知识卡片连接已更换，请检查原任务后重试', 'FEATURE_DISABLED');
        const claim = await request(sessionId, { action: 'automation_claim', purpose });
        if (claim?.action !== 'automation_claim' || claim.purpose !== purpose) throw failure(t('taskPendingConflict'), 'automation_identity');
        const projection = await readProjection(sessionId, ['whalewingAutomation'], signal);
        if (projection.values.whalewingAutomation !== purpose) throw failure(t('taskPendingConflict'), 'automation_identity');
        signal?.throwIfAborted();
        if (adapter && adapter !== requireNewsAdapter()) throw failure('知识卡片连接已更换，请检查原任务后重试', 'FEATURE_DISABLED');
        const receipt = await (adapter ? adapter.submit : automationRequest)({ action: 'create', sessionId, purpose, ...specification }, signal);
        const catalog = await automationCatalog(signal);
        if (!receipt.task?.id || !catalog.tasks.some(task => task.sessionId === sessionId && task.id === receipt.task.id && task.purpose === purpose)) throw failure(t('taskReadback'), 'automation_readback');
        cacheAutomation(null);
        return catalog;
      } finally { automationWriting = false; }
    }

  return {
    automationRequest, automationCatalog, createAutomation, recoverAutomation,
    pendingAutomation: () => pendingAutomation && { ...pendingAutomation }, automationCacheIssue: () => automationCacheIssue,
    bindNewsAdapter(adapter) { newsAdapter = adapter; return () => { if (newsAdapter === adapter) newsAdapter = undefined; }; },
    openAutomation: async id => { await attachExistingSession(id); bridge.open(id); },
    openPlugins: bridge.openPlugins, workspaces: bridge.workspaces, subscribeWorkspaces: bridge.subscribeWorkspaces,
  };
}
