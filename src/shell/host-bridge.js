import { requireExactProjection, assertCreatedSession, sessionIssue } from '../session-projection.js';
/** 原生运输、会话身份与只读订阅共用此桥，不保存领域缓存。 */
export function createHostBridge(ctx, t, explainError) {
    const featureRemotes = new Map();
    const featureRemote = name => { const value = featureRemotes.get(name); if (!value) throw new Error('功能正在连接，请稍后重试'); return value; };
    const presetText = ctx.locale.bind('settings.agentPreset');
    // 官方未命名模式复用宿主词典，自定义名称始终按原文展示。
    const presetNameKeys = { standard: 'presetStandardName', ptc: 'presetPtcName', minimal: 'presetMinimalName', cordis: 'presetCordisName' };
    const failure = (message, code) => Object.assign(new Error(message), { code });
    // 只报告实际呈现能力，不据此推断专家或其它宿主功能。
    const canFocusPresentation = () => typeof ctx.get('sidebarRight')?.focusPresentation === 'function';
    // Host 返回的失败经报错指南翻译成员工能处理的提示；原始信息只进开发者控制台。
    const hostFailure = (message, code) => {
      globalThis.console?.warn?.('[鲸翼]', code ?? '', message);
      return Object.assign(new Error(explainError(code, message).text), { code, detail: message });
    };
    const unwrap = (reply, requestedSessionId) => {
      if (!reply || typeof reply.ok !== 'boolean') throw failure(t('badReply'), 'bad_reply');
      if (!reply.ok && reply.error?.details?.recovery) throw Object.assign(new Error(reply.error.message), { code: reply.error.code, ...reply.error.details });
      if (!reply.ok && (requestedSessionId || reply.error?.details?.sessionId) && ['session/writer-held', 'session/agent-busy', 'session/conflict'].includes(reply.error?.code)) throw Object.assign(sessionIssue(reply.error.code, ({ 'session/writer-held': '原会话写入权正在被其它窗口或进程占用，请先关闭那里的会话后重试', 'session/agent-busy': '原会话属于子代理，请打开原会话处理，不接管写入权', 'session/conflict': '原会话工作目录不同，请打开原会话核对，不改用其它会话' })[reply.error.code], requestedSessionId || reply.error.details?.sessionId, 'open'), { detail: reply.error.message, details: reply.error.details });
      if (!reply.ok) throw Object.assign(hostFailure(reply.error?.message || t('requestFailed'), reply.error?.code), reply.error?.details?.sessionId ? { sessionId: reply.error.details.sessionId } : {});
      return reply.value;
    };
    async function request(sessionId, payload, name = 'whalewing') {
      if (!sessionId) throw failure(t('noSession'), 'session_required');
      // 原生归属错误只有reason，恢复动作的身份必须来自本次请求。
      const execution = unwrap(await ctx.remote.commands.execute(sessionId, `/${name} ${JSON.stringify(payload)}`, []), sessionId);
      if (!execution) throw failure(t('unknownCommand'), 'command_missing');
      if (execution.result?.kind !== 'success') {
        const text = execution.result?.text || t('requestFailed');
        let detail;
        try { detail = JSON.parse(text); } catch { /* 非 JSON 错误保留宿主原文。 */ }
        throw hostFailure(detail?.message || text, detail?.code);
      }
      let value;
      try { value = JSON.parse(execution.result.text); } catch { throw failure(t('badReply'), 'bad_reply'); }
      if (value && value.ok === false) throw hostFailure(value.message || value.error?.message || t('requestFailed'), value.code || value.error?.code);
      return value;
    }
    async function prepareWorkspace({ cwd = '', workspaceId = '' } = {}) {
      const path = cwd.trim();
      if (path && !/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/)/.test(path)) throw failure(t('invalidPath'), 'invalid_path');
      if (!path && workspaceId) return workspaceId;
      // 工作区注册与路径去重由宿主负责，客户端不自建目录或维护第二份映射。
      const workspace = path ? await ctx.workspaces.create({ path }) : await ctx.workspaces.initializeDefault(AbortSignal.timeout(15000));
      if (workspace === undefined && !path) return undefined;
      if (!workspace?.workspaceId) throw failure(t('badReply'), 'bad_reply');
      return workspace.workspaceId;
    }
    const readProjection = async (sessionId, keys = [], signal) => {
      const value = unwrap(await ctx.remote.session.projections({ sessionId }, signal), sessionId);
      signal?.throwIfAborted();
      return requireExactProjection(value, sessionId, keys);
    };
    const assertActiveSession = sessionId => {
      const snapshot = ctx.workspaces.list.getSnapshot();
      if (!Array.isArray(snapshot.archivedSessionIds)) throw sessionIssue('SESSION_UNCONFIRMED', '会话归档状态还没确认，请等待工作区加载后重新检查', sessionId);
      if (snapshot.archivedSessionIds.includes(sessionId)) throw sessionIssue('SESSION_ARCHIVED', '这个会话已归档，请在 DSH 里取消归档后重试', sessionId, 'open');
      if (ctx.sessions.subagentAddress(sessionId)) throw sessionIssue('session/subagent-owned', '这个会话属于子代理，请打开原会话处理，不接管写入权', sessionId, 'open');
    };
    // 纯恢复等待原生只读查找，不以成员关系或页面打开替代恢复结果。
    async function restoreSession(sessionId, signal) {
      assertActiveSession(sessionId);
      signal?.throwIfAborted();
      try {
        // list没有远程取消参数；本地取消只阻止查找返回后的业务动作，不取消原生恢复。
        const commands = unwrap(await ctx.remote.commands.list(sessionId), sessionId);
        signal?.throwIfAborted();
        if (!Array.isArray(commands)) throw failure(t('badReply'), 'bad_reply');
      } catch (error) {
        error.sessionId ??= sessionId;
        error.recovery ??= 'check';
        throw error;
      }
    }
    // create 只接收本轮首次分配且没有未知请求的身份。
    async function prepareSession(sessionId, fresh, input, scope, signal) {
      const value = unwrap(await ctx.remote.session.projections({ sessionId }, signal), sessionId);
      signal?.throwIfAborted();
      if (value === null && fresh) return createBoundSession({ ...input, sessionId }, scope, signal);
      requireExactProjection(value, sessionId);
      assertActiveSession(sessionId);
      await attachExistingSession(sessionId, undefined, signal);
      return { sessionId };
    }
    async function attachExistingSession(sessionId, expectedCwd, signal) {
      await restoreSession(sessionId, signal);
      const checkDirectory = workspace => {
        if (expectedCwd === undefined) return;
        if (!workspace || typeof workspace.path !== 'string') throw sessionIssue('SESSION_UNCONFIRMED', '原会话工作目录还没确认，请等待工作区加载后重新检查', sessionId);
        if (workspace.path !== expectedCwd) throw sessionIssue('session/conflict', '原会话工作目录与当前定时任务目录不同，请打开原会话核对，不改用其它会话', sessionId, 'open');
      };
      const member = ctx.workspaces.list.getSnapshot().items.find(item => item.sessionIds.includes(sessionId));
      if (member) { checkDirectory(member); return; }
      // Host 从当前会话取目录并经工作区 owner 挂接；客户端不重建身份或归一化路径。
      const attached = await request(sessionId, { action: 'workspace_attach' });
      if (attached?.sessionId !== sessionId || typeof attached.workspaceId !== 'string' || !attached.workspaceId) throw failure(t('badReply'), 'bad_reply');
      checkDirectory(ctx.workspaces.list.getSnapshot().items.find(item => item.workspaceId === attached.workspaceId));
    }
    async function createBoundSession(input, scope, signal) {
      signal?.throwIfAborted();
      const workspaceId = await prepareWorkspace(scope);
      signal?.throwIfAborted();
      const created = unwrap(await ctx.remote.session.create({ ...input, ...(workspaceId ? { workspaceId } : {}) }), input.sessionId);
      signal?.throwIfAborted();
      if (input.sessionId) assertCreatedSession(created, input.sessionId);
      if (!created?.sessionId) throw failure(t('badReply'), 'bad_reply');
      try {
        if (!workspaceId) await attachExistingSession(created.sessionId, undefined, signal);
      } catch (error) { error.sessionId = created.sessionId; throw error; }
      return created;
    }
    function requireBrowser() {
      const sidebar = ctx.get('sidebarRight'), types = ctx.get('sidebarRightTabs');
      if (typeof sidebar?.openTab !== 'function' || typeof types?.get !== 'function' || !types.get('browser')) throw new Error(t('browserMissing'));
      return sidebar;
    }
    // 工作台页面卸载后仍要让员工看到结果，由 registerUi 接上右上角提示。
    let notifyGlobal = () => {};
    function notifySessionIssue(reason, retry) {
      if (!reason.recovery) return;
      notifyGlobal(reason.message, { kind: 'error', action: reason.recovery === 'open' ? { label: reason.code === 'SESSION_CREATED_DIFFERENT' ? '打开额外会话' : '打开原会话', run: () => ctx.uiWorkspace.openSession(reason.sessionId) } : { label: '重新检查', run: retry } });
    }

  return {
    featureRemote, failure, hostFailure, unwrap, request, prepareWorkspace, readProjection, assertActiveSession, restoreSession, prepareSession, attachExistingSession, createBoundSession,
    bindFeatureRemote(name, value) { featureRemotes.set(name, value); return () => { if (featureRemotes.get(name) === value) featureRemotes.delete(name); }; },
    session: { create: input => ctx.remote.session.create(input), rename: input => ctx.remote.session.rename(input), projections: (input, signal) => ctx.remote.session.projections(input, signal) },
    sessionSnapshot: () => ctx.sessions.list.getSnapshot(), subagentAddress: id => ctx.sessions.subagentAddress(id),
    inputBinding: reference => ctx.get('uiSession')?.bindingSource(reference).getSnapshot(),
    insertInputReference: (id, value) => { const binding = ctx.sessions.binding(id); return binding ? { bound: true, accepted: binding.ctx.bail(binding.ctx, 'slash/input-insert-reference', value) === true } : { bound: false };  },
    browserMounted: () => ctx.get('sidebarRight')?.mounted?.getSnapshot(), browserAvailable: requireBrowser,
    focusBrowser: sessionId => { const sidebar = requireBrowser(); if (typeof sidebar.focusPresentation !== 'function' || sidebar.mounted?.getSnapshot() !== sessionId) throw new Error(t('browserMissing')); return sidebar.focusPresentation(sessionId); },
    canFocusPresentation, notifySessionIssue, bindNotify: fn => { notifyGlobal = fn; }, notify: (...args) => notifyGlobal(...args),
    subscribeTheme: callback => ctx.on('theme/change', callback), retain: id => ctx.sessions.retain(id, { source: 'whalewingAssistant' }),
    presentAssistant: id => { const sidebar = ctx.get('sidebarRight'); if (typeof sidebar?.presentSession !== 'function') return null; return sidebar.presentSession('whalewing', id); },
    modes: async () => unwrap(await ctx.remote.agentPresets.list()).presets.map(preset => ({ ...preset, name: preset.name === undefined && Object.hasOwn(presetNameKeys, preset.id) ? presetText(presetNameKeys[preset.id]) : preset.name ?? preset.id })),
    openPlugins: () => ctx.layout.selectPanel('plugins'), open: id => ctx.uiWorkspace.openSession(id),
    workspaces: () => ctx.workspaces.list.getSnapshot(), subscribeWorkspaces: fn => ctx.workspaces.list.subscribe(fn),
  };
}
