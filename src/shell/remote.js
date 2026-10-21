/** 不把挂载Promise交给Cordis apply等待：关闭时先收回作用域，迟到挂载只负责释放。 */
export function connectRemote(ctx, contribution, ready, failed) {
  let stopped = false, pending = false, release, timer, expired = false;
  const inactive = () => stopped || ctx.fiber?.uid === null;
  ctx.effect(() => () => { stopped = true; clearTimeout(timer); const dispose = release; release = null; return dispose?.(); });
  const connect = async () => {
    if (inactive()) return;
    if (pending) { failed(new Error('功能连接仍在结束，请稍后重试')); return; }
    pending = true; expired = false;
    timer = setTimeout(() => { expired = true; if (!inactive()) failed(new Error('功能连接超时，请稍后重试')); }, 10000);
    try {
      const unmount = await ctx.remote.$mount(contribution);
      clearTimeout(timer);
      if (inactive() || expired) { await unmount(); return; }
      release = unmount;
      try { ready(); }
      catch (error) { release = null; await unmount(); throw error; }
    } catch (error) { if (!inactive()) failed(error); }
    finally { pending = false; clearTimeout(timer); }
  };
  void connect();
  return connect;
}
