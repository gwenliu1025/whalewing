/** 流和事件快照共用接纳入口；连接重置换代，旧连接的迟到帧永不回写。 */
let nextSubscription = 0;

export function watchFeatures(ctx, { accept, failure, reset = () => {} }, { delays = [250, 1000, 3000], deadline = 10000 } = {}) {
  const subscription = ++nextSubscription;
  let connectionEpoch = { subscription, generation: 0 };
  let disposed = false, generation = 0, revision = -1, controller, retryTimer, attempts = 0, snapshotPending, snapshotTransport;
  const retryTransports = new Map();
  const remote = ctx.remote.whalewingWorkbench;
  const unwrap = reply => { if (!reply?.ok) throw new Error(reply?.error?.message || '功能列表读取失败'); return reply.value; };
  const receive = (frame, epoch) => {
    if (disposed || epoch !== generation || frame.revision <= revision) return;
    revision = frame.revision; accept(frame, connectionEpoch);
  };
  const bounded = (promise, signal, timeout = deadline) => new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => finish(reject, signal.reason || new Error('已取消'));
    const timer = timeout === null ? undefined : setTimeout(() => finish(reject, new Error('功能列表读取超时')), timeout);
    function finish(fn, value) { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); fn(value); }
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
  });
  const snapshot = () => {
    if (disposed || snapshotTransport) return snapshotPending;
    // 无cancellation描述的普通RPC只限本地等待；未完成运输期间不再叠加请求。
    const epoch = generation, signal = controller.signal;
    const transport = Promise.resolve().then(() => { signal.throwIfAborted(); return remote.features(); });
    snapshotTransport = transport;
    transport.then(() => { if (snapshotTransport === transport) snapshotTransport = null; }, () => { if (snapshotTransport === transport) snapshotTransport = null; });
    const pending = bounded(transport, signal).then(reply => { if (!signal.aborted) receive(unwrap(reply), epoch); }).catch(error => {
      if (!signal.aborted && epoch === generation) failure(error, restart);
    }).finally(() => { if (snapshotPending === pending) snapshotPending = null; });
    snapshotPending = pending; return pending;
  };
  async function stream(epoch, signal) {
    let iterator;
    try {
      iterator = remote.watchFeatures(signal)[Symbol.asyncIterator]();
      // 首帧有截止时间；空闲的后续订阅持续到取消，不轮询制造工作。
      let next = await bounded(iterator.next(), signal);
      while (!next.done) {
        if (signal.aborted || disposed) return;
        receive(next.value, epoch);
        next = await bounded(iterator.next(), signal, null);
      }
      if (!signal.aborted) throw new Error('功能订阅已断开');
    } catch (error) {
      if (disposed || signal.aborted || epoch !== generation) return;
      controller.abort();
      if (attempts < delays.length) retryTimer = setTimeout(() => { retryTimer = undefined; connect(); }, delays[attempts++]);
      else failure(error, restart);
    } finally {
      // 卸载不等待一个不响应取消的迭代器；原生Remote收到signal后结束运输，return收回消费端。
      if (iterator?.return) Promise.resolve(iterator.return()).catch(() => {});
    }
  }
  function connect() { if (disposed) return; controller = new AbortController(); void stream(generation, controller.signal); }
  function restart() {
    if (disposed) return;
    controller?.abort(); clearTimeout(retryTimer); retryTimer = undefined;
    // 手动重试不降低同连接水位；只有连接reset表示Host可能已经重启。
    attempts = 0; snapshotPending = null; connect(); return snapshot();
  }
  const offChanged = ctx.remote.$on('plugin-manager/changed', () => { if (controller?.signal.aborted) restart(); else snapshot(); });
  const offReset = ctx.on('connection/reset', () => { generation++; revision = -1; connectionEpoch = { subscription, generation }; reset(connectionEpoch); restart(); });
  reset(connectionEpoch);
  connect();
  return {
    retry: restart,
    async retryBase(id) {
      if (disposed) return;
      if (retryTransports.has(id)) throw new Error('上次重试仍在等待结果，请稍后再试');
      const epoch = generation, signal = controller.signal;
      const transport = Promise.resolve().then(() => { signal.throwIfAborted(); return remote.retryBase(id); });
      retryTransports.set(id, transport);
      transport.then(() => retryTransports.delete(id), () => retryTransports.delete(id));
      const reply = await bounded(transport, signal);
      if (!signal.aborted) receive(unwrap(reply), epoch);
    },
    dispose() { if (disposed) return; disposed = true; generation++; controller?.abort(); clearTimeout(retryTimer); offChanged(); offReset(); reset({ subscription, generation }); },
  };
}
