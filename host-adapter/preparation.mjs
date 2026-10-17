// 同一方法正文用于固定源码补丁对照与发布产物转换；不在运行时导入此模块。
export const preparePromptMethod = `async preparePrompt(signal) {
  const actx = this.actx;
  if (actx === undefined) return;
  const controller = new AbortController();
  const sources = [signal, this.preparationLifetime.signal].filter(Boolean);
  const abort = () => controller.abort(new Error('会话准备已取消'));
  const timer = setTimeout(() => controller.abort(new Error('会话准备超过 15 秒')), 15000);
  let removeAbort = () => {};
  try {
    for (const source of sources) {
      if (source.aborted) abort();
      else source.addEventListener('abort', abort, { once: true });
    }
    controller.signal.throwIfAborted();
    const cancelled = new Promise((_, reject) => {
      const onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
      removeAbort = () => controller.signal.removeEventListener('abort', onAbort);
    });
    const payload = { sessionId: this.sessionId, signal: controller.signal };
    const callbacks = actx.events.dispatch('serial', [actx, 'session/before-prompt', payload]);
    const prepared = (async () => {
      // serial 会吞掉 false/null；使用同一公开路由逐个检查，非 void 一律拒收。
      for (const callback of callbacks) {
        controller.signal.throwIfAborted();
        const result = await callback(payload);
        controller.signal.throwIfAborted();
        if (result !== undefined) throw new Error('会话准备处理器必须返回 void');
      }
    })();
    await Promise.race([prepared, cancelled]);
    controller.signal.throwIfAborted();
    if (this.actx !== actx) throw new Error('会话准备期间绑定已释放');
  } finally {
    clearTimeout(timer);
    removeAbort();
    for (const source of sources) source.removeEventListener('abort', abort);
  }
}`;

export const promptPreparation = `try {
  if (this.actx !== undefined) await this.preparePrompt(signal);
  signal?.throwIfAborted();
} catch (error) {
  if (requestId !== undefined) this.retireFailedSubmission(requestId);
  const failure = new RemoteError('gateway/internal', '会话准备未完成：' + (error instanceof Error ? error.message : String(error)), {});
  this.promptError = { op: 'send', error: failure };
  this.notifier.markDirty();
  return { ok: false, error: failure };
}`;

export const prepareModeMethod = `async prepare(signal) {
  signal.throwIfAborted();
  const session = this.currentSession();
  if (session === undefined || !session.blank) return;
  const required = this.staged.id ?? (this.pendingSelection === undefined ? undefined : this.store.getSnapshot().current);
  if (required === undefined) return;
  while (this.pendingSelection !== undefined) {
    await this.pendingSelection;
    signal.throwIfAborted();
  }
  if (this.currentSession()?.id !== session.id) throw new Error('模式选择的会话已改变');
  if (this.store.getSnapshot().error !== null) throw new Error(this.store.getSnapshot().error);
  const refusal = await this.apply();
  signal.throwIfAborted();
  if (refusal !== undefined) throw new Error(refusal);
  if (this.staged.id !== undefined && this.staged.id !== required) throw new Error('模式选择已改变，请重新发送');
  if (this.lastSelection?.sessionId === session.id && this.lastSelection.id !== required) throw new Error('模式提交读回不匹配');
  await new Promise((resolve, reject) => {
    let stop = () => {};
    const cleanup = () => { stop(); signal.removeEventListener('abort', aborted); };
    const aborted = () => { cleanup(); reject(signal.reason); };
    const check = () => {
      if (signal.aborted) { aborted(); return; }
      const current = this.currentSession();
      if (current?.id !== session.id) { cleanup(); reject(new Error('模式读回期间会话已改变')); return; }
      if (presetOf(current) === required) { cleanup(); resolve(); }
    };
    stop = this.ctx.sessions.list.subscribe(check);
    signal.addEventListener('abort', aborted, { once: true });
    check();
  });
}`;

export const registerModePreparation = `// 模式 owner 唯一前置；业务准备监听器使用默认追加顺序。
scope.on('session/before-prompt', async ({ sessionId, signal }) => {
  signal.throwIfAborted();
  const binding = ctx.sessions.binding(sessionId);
  const summary = ctx.sessions.list.getSnapshot().byId[sessionId];
  if (binding === undefined || binding.session.getSnapshot().subagent !== null || !summary?.blank
    || (ctx.sessions.retainInfo(sessionId).getSnapshot().retainedBy.mainView ?? 0) === 0) return;
  await seatFor(binding).prepare(signal);
  signal.throwIfAborted();
  if (ctx.sessions.binding(sessionId) !== binding) throw new Error('模式准备的会话绑定已改变');
}, { prepend: true });
`;

function once(text, from, to) {
  if (text.split(from).length !== 2) throw new Error('准备事件适配锚点次数不符：' + from.slice(0, 65));
  return text.replace(from, to);
}

export function convertSessionPreparation(text, bundled) {
  const indent = bundled ? '\t\t\t' : '    ';
  const scoped = bundled ? 'this.actx = actx;' : 'this.actx = actx;';
  text = once(text, scoped, scoped + '\n' + indent + "this.preparationLifetime = new AbortController();");
  text = once(text, 'unbindScope() {', "unbindScope() {\n" + indent + "this.preparationLifetime?.abort(new Error('会话绑定已释放'));" );
  text = once(text, 'this.stopObservingInbox();', "this.preparationLifetime?.abort(new Error('会话已释放'));\n" + indent + 'this.stopObservingInbox();');
  text = once(text, 'async prompt(content, mode, signal, requestId) {', preparePromptMethod + '\n' + indent + 'async prompt(content, mode, signal, requestId) {\n' + promptPreparation);
  return text;
}

export function convertModePreparation(text) {
  text = once(text, 'async apply() {', prepareModeMethod + '\n\t\t\tasync apply() {');
  text = once(text, 'this.pendingSelection = completion.promise;\n\t\t\t\tthis.clearStage();', 'this.pendingSelection = completion.promise;');
  text = once(text, 'this.set({ current: this.staged.id ?? result.value });', `if (result.value !== staged) {
    const refusal = '模式提交读回不匹配';
    this.set({ error: refusal });
    return refusal;
  }
  this.lastSelection = { sessionId: session.id, id: result.value };
  if (this.staged.id === staged) this.clearStage();
  this.set({ current: this.staged.id ?? result.value });`);
  text = once(text, '\t\t\t\t} finally {\n\t\t\t\t\tthis.pendingSelection = void 0;', `} catch (error) {
    const refusal = error instanceof Error ? error.message : String(error);
    this.set({ error: refusal });
    return refusal;
  } finally {
    this.pendingSelection = void 0;`);
  return once(text, 'const seatInjected = (sessionId) => {', registerModePreparation + '\nconst seatInjected = (sessionId) => {');
}
