
/** 工作台只持自己的持久会话身份，不取得其他领域会话的决定权。 */
export function createWorkbenchSession(bridge, t, z) {
    const { request, readProjection, assertActiveSession, attachExistingSession, prepareSession, unwrap, failure } = bridge;
    const NS = 'whalewing';
    const cacheKey = `${NS}:workbench:${typeof window === 'undefined' ? '' : window.location.origin}`;
    let workbenchId;
    let pendingWorkbenchId;
    let workbenchPromise;
    try { workbenchId = window.localStorage.getItem(cacheKey) || undefined; } catch { /* 禁用浏览器存储时，同一插件实例仍复用内存身份。 */ }
    const cacheWorkbench = (id) => {
      workbenchId = id;
      try { window.localStorage.setItem(cacheKey, id); } catch { /* 缓存非真源，写失败不改变 Host 已接受结果。 */ }
    };
    const workbenchProjection = (id, keys = [], signal) => readProjection(id, keys, signal);
    const confirmWorkbench = async (id, signal) => {
      signal?.throwIfAborted();
      const confirmed = await request(id, { action: 'workbench_confirm' });
      signal?.throwIfAborted();
      if (!z.strictObject({ action: z.literal('workbench_confirm'), persisted: z.literal(true) }).safeParse(confirmed).success) throw failure(t('badReply'), 'bad_reply');
      if ((await workbenchProjection(id, ['whalewingWorkbench'], signal)).values.whalewingWorkbench !== true) throw Object.assign(failure(t('workbenchUnclaimed') + ' (' + id + ')', 'workbench_identity'), { workbenchId: id });
      signal?.throwIfAborted();
      pendingWorkbenchId = undefined;
    };
    function ensureWorkbench(signal) {
      if (workbenchPromise) return workbenchPromise;
      workbenchPromise = (async () => {
        signal?.throwIfAborted();
        const fresh = !workbenchId;
        if (workbenchId) {
          const existing = await workbenchProjection(workbenchId, ['whalewingWorkbench'], signal);
          assertActiveSession(workbenchId);
          signal?.throwIfAborted();
          if (existing?.values?.whalewingWorkbench === true) {
            if (pendingWorkbenchId === workbenchId) await confirmWorkbench(workbenchId, signal);
            signal?.throwIfAborted();
            await attachExistingSession(workbenchId, undefined, signal);
            signal?.throwIfAborted();
            return workbenchId;
          }
          if (pendingWorkbenchId !== workbenchId) throw Object.assign(failure(`${t('workbenchUnclaimed')} (${workbenchId})`, 'workbench_identity'), { workbenchId });
        } else {
          // 先保存待处理身份；回执丢失后只读精确结果，不因一次空读重新创建。
          pendingWorkbenchId = `whalewing-workbench-${globalThis.crypto.randomUUID()}`;
          cacheWorkbench(pendingWorkbenchId);
        }
        const id = workbenchId;
        const created = await prepareSession(id, fresh, { agentPreset: 'standard' }, undefined, signal);
        signal?.throwIfAborted();
        if (created?.sessionId !== id) throw failure(t('badReply'), 'bad_reply');
        unwrap(await bridge.session.rename({ sessionId: id, title: t('workbenchTitle') }), id);
        signal?.throwIfAborted();
        await request(id, { action: 'workbench_claim' });
        signal?.throwIfAborted();
        // 只确认认领事件持久化；知识初始化由真正的知识入口负责。
        await confirmWorkbench(id, signal);
        return id;
      })().finally(() => { workbenchPromise = undefined; });
      return workbenchPromise;
    }

  return {
    ensureWorkbench,
    restartWorkbench: signal => { if (workbenchPromise) return workbenchPromise; workbenchId = undefined; pendingWorkbenchId = undefined; try { window.localStorage.removeItem(cacheKey); } catch { /* 缓存不改变用户明确的新建请求。 */ } return ensureWorkbench(signal); },
  };
}
