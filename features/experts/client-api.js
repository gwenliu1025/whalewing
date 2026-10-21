
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createExpertsClient(bridge, t) {
    const { featureRemote, unwrap, failure } = bridge;
    const { request, createBoundSession, readProjection, assertActiveSession, notifySessionIssue } = bridge;
    let experts = { experts: [], deleted: [] };
    const expertListeners = new Set();
    const expertRequest = async (input, signal) => { signal?.throwIfAborted(); const reply = await featureRemote('whalewingExperts').manage(input, signal); signal?.throwIfAborted(); return unwrap(reply, input.sessionId); };
    const loadExperts = async (signal) => {
      const value = await expertRequest({ action: 'list' }, signal);
      signal?.throwIfAborted();
      experts = value;
      expertListeners.forEach(listener => listener());
      return value;
    };
    async function createExpert(roleId, { cwd = '', workspaceId = '', mode = '' } = {}) {
      const role = (await loadExperts()).experts.find((item) => item.id === roleId);
      if (!role) throw failure(t('noRoles'), 'role_missing');
      const value = await createBoundSession(mode ? { agentPreset: mode } : {}, { cwd, workspaceId });
      if (!value?.sessionId) throw failure(t('badReply'), 'bad_reply');
      try {
        await selectExpert(value.sessionId, roleId);
      }
      catch (error) { error.sessionId = value.sessionId; throw error; }
      return value.sessionId;
    }
    async function applyExpertModel(sessionId, role, signal) {
      signal?.throwIfAborted();
      const receipt = await expertRequest({ action: 'prepare_model', sessionId, expertId: role.id, expectedRevision: role.revision }, signal);
      signal?.throwIfAborted();
      // 宿主不能只给本会话换模型时，专家跟随会话当前模型，不做切换后的核对。
      if (receipt?.applied === false) return;
      const actual = await readProjection(sessionId, ['modelSelection'], signal);
      signal?.throwIfAborted();
      const selected = actual?.values?.modelSelection?.next;
      if (!receipt?.selected || !selected || selected.provider !== receipt.selected.provider || selected.model !== receipt.selected.model || selected.reasoningEffort !== receipt.selected.reasoningEffort) throw failure(t('modelMissing'), 'model_readback');
    }
    let choiceState = { staged: null, sessions: {} };
    const choiceListeners = new Set();
    const preparations = new Map();
    const publishChoice = value => { choiceState = value; choiceListeners.forEach(listener => listener()); };
    const captureStagedExpert = () => {
      if (!choiceState.staged) return;
      const targets = Object.values(bridge.sessionSnapshot().byId).filter(item => item.blank === true && (item.retainedBy?.mainView || 0) > 0 && item.origin !== 'subagent');
      if (targets.length !== 1) return;
      const id = targets[0].id;
      publishChoice({ staged: null, sessions: { ...choiceState.sessions, [id]: choiceState.staged } });
      // 唯一主会话身份已确认就立即准备；不以浏览器能力推断发送前事件是否存在。
      prepareExpert(id).catch(reason => notifySessionIssue(reason, () => prepareExpert(id)));
    };
    async function prepareNow(sessionId, signal) {
      signal.throwIfAborted();
      if (bridge.subagentAddress(sessionId)) return;
      captureStagedExpert();
      const choice = choiceState.sessions[sessionId];
      let expertId;
      let actual;
      if (choice) {
        await readProjection(sessionId, ['whalewingExpert'], signal);
        assertActiveSession(sessionId);
        expertId = choice.expertId;
        if (expertId && !(await loadExperts(signal)).experts.some(item => item.id === expertId)) throw failure(t('noRoles'), 'role_missing');
        signal.throwIfAborted();
        await request(sessionId, { expertId }, 'whalewing-expert');
        signal.throwIfAborted();
        actual = await readProjection(sessionId, ['whalewingExpert'], signal);
        signal.throwIfAborted();
      } else {
        actual = await readProjection(sessionId, ['whalewingExpert'], signal);
        signal.throwIfAborted();
        expertId = actual?.values?.whalewingExpert?.expertId;
        if (!expertId) return;
      }
      if ((actual?.values?.whalewingExpert?.expertId ?? null) !== expertId) throw failure(t('requestFailed'), 'expert_readback');
      if (expertId) {
        const role = (await loadExperts(signal)).experts.find(item => item.id === expertId);
        signal.throwIfAborted();
        if (!role) throw failure(t('noRoles'), 'role_missing');
        await applyExpertModel(sessionId, role, signal);
        signal.throwIfAborted();
      }
      if (choice && choiceState.sessions[sessionId] === choice) {
        const sessions = { ...choiceState.sessions }; delete sessions[sessionId];
        publishChoice({ ...choiceState, sessions });
      }
    }
    /** 同一会话共用准备；各调用只取消自己的等待，最后一个等待者退出才中止后续准备。 */
    async function prepareExpert(sessionId, signal) {
      signal ||= AbortSignal.timeout(15000);
      signal.throwIfAborted();
      if (bridge.subagentAddress(sessionId)) return;
      let job = preparations.get(sessionId);
      if (!job) {
        job = { controller: new AbortController(), waiters: 0, done: false };
        preparations.set(sessionId, job);
        job.promise = prepareNow(sessionId, job.controller.signal).finally(() => { job.done = true; if (preparations.get(sessionId) === job) preparations.delete(sessionId); });
        job.promise.catch(() => {});
      }
      await new Promise((resolve, reject) => {
        job.waiters++;
        let settled = false;
        const finish = (error) => {
          if (settled) return; settled = true;
          signal?.removeEventListener('abort', abort);
          job.waiters--;
          if (!job.done && job.waiters === 0) job.controller.abort();
          if (error) reject(error); else resolve();
        };
        const abort = () => finish(failure(t('expertPreparationStopped'), 'expert_prepare_cancelled'));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        job.promise.then(() => finish(), error => finish(error));
      });
      signal?.throwIfAborted();
      if (choiceState.sessions[sessionId]) await prepareExpert(sessionId, signal);
      signal?.throwIfAborted();
    }
    const selectExpert = async (sessionId, expertId, signal) => {
      signal?.throwIfAborted();
      if (sessionId && bridge.subagentAddress(sessionId)) throw failure(t('expertSubagent'), 'expert_subagent');
      if (!sessionId) {
        publishChoice({ ...choiceState, staged: { expertId, preview: true } });
        captureStagedExpert();
        return;
      }
      publishChoice({ ...choiceState, sessions: { ...choiceState.sessions, [sessionId]: { expertId } } });
      await prepareExpert(sessionId, signal);
      signal?.throwIfAborted();
    };

  return {
    createExpert, expertRequest, loadExperts, experts: () => experts, subscribeExperts: listener => { expertListeners.add(listener); return () => expertListeners.delete(listener); },
    applyExpertModel, selectExpert, prepareExpert, choices: () => choiceState, subscribeChoices: listener => { choiceListeners.add(listener); return () => choiceListeners.delete(listener); },
    bindExpertLifecycle(scope) {
      scope.effect(() => scope.sessions.list.subscribe(captureStagedExpert), '新会话专家暂存接线');
      // 仅在宿主实际发出此可选事件时追加检查；当前原版不会发出，首次准备不依赖它。
      scope.effect(() => scope.on('session/before-prompt', async ({ sessionId, signal }) => { await prepareExpert(sessionId, signal); signal.throwIfAborted(); }), '专家可选提交检查');
      scope.effect(() => () => { for (const job of preparations.values()) job.controller.abort(); preparations.clear(); choiceListeners.clear(); }, '专家准备释放');
    },
    modes: bridge.modes, open: bridge.open, request: bridge.request, workspaces: bridge.workspaces, subscribeWorkspaces: bridge.subscribeWorkspaces, notifySessionIssue: bridge.notifySessionIssue,
  };
}
