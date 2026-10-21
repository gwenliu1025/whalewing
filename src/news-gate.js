import { abort, fail } from './vault.js';

export const newsSkippedNotice = '「知识卡片」已关闭，本次资讯未生成';

/** 关闭判断归核心；这里只消费活动登记与宿主身份、inbox和命令日志，不写资讯或任务域。 */
export function installNewsGate(ctx, registry) {
  const closing = new AbortController(), pending = new Set(), receipts = new WeakMap();
  const active = () => registry.snapshot().features.some(feature => feature.id === 'cards' && feature.kind === 'optional' && !feature.error);
  const stop = ctx.on('agent/pre-step', (payload, next) => {
    const operation = (async () => {
      const decision = await next();
      const { agent, messages, signal } = payload;
      if (decision.kind === 'reject' || active() || ctx.sessionProjections.stateOf(agent.session, 'whalewingAutomation')?.purpose !== 'news') return decision;
      const blocked = new Set(messages.filter(message => message.source?.kind === 'schedule').map(message => message.id));
      if (!blocked.size) return decision;
      try {
        abort(signal); abort(closing.signal);
        const events = agent.session.snapshotEvents();
        const origins = new Map(), recorded = new Set(), commands = new Set();
        // 一次扫描原生日志，不为每条同批消息重扫历史，也不保存第二份持久状态。
        for (const event of events) {
          if (event.type === 'agent/inbox/spliced') {
            for (const message of event.data.inserted) if (blocked.has(message.id) && message.source?.kind === 'schedule' && !origins.has(message.id)) origins.set(message.id, event.seq);
          } else if (event.type === 'command/run' && event.data.name === 'whalewing') commands.add(event.data.commandId);
          else if (event.type === 'command/done' && commands.delete(event.data.commandId) && event.data.kind === 'success' && event.data.text === newsSkippedNotice) recorded.add(event.data.sourceEventSeq);
        }
        if (origins.size !== blocked.size) fail('NEWS_SKIP_SOURCE', '资讯输入的原始记录尚未确认，未跳过本次请求');
        for (const sourceEventSeq of new Set(origins.values())) {
          // 未知持久化结果后重试，复用已有命令回执而不是重复追加说明。
          if (recorded.has(sourceEventSeq)) continue;
          receipts.set(agent, sourceEventSeq);
          try {
            const result = await ctx.commands.execute(agent, '/whalewing {"action":"automation_skip"}', [], signal);
            if (result?.result.kind !== 'success' || result.result.text !== newsSkippedNotice || result.result.sourceEventSeq !== sourceEventSeq) fail('NEWS_SKIP_NOTICE', '资讯跳过说明尚未写入，请保留原会话并重试');
          } finally { receipts.delete(agent); }
          abort(signal); abort(closing.signal);
        }
        // 命令回执与此前的claim一同经过原生持久化检查点，确认后才把输入判为已跳过。
        if (!await ctx.sessions.flush(agent.session)) fail('PERSISTENCE', '资讯跳过说明尚未确认保存，请保留原会话并重试');
        abort(signal); abort(closing.signal);
        if (messages.every(message => blocked.has(message.id))) return { kind: 'reject' };
        return { ...decision, messages: decision.messages.filter(message => !blocked.has(message.id)) };
      } catch (error) {
        // 原生cancel拥有清空决定；门自身失败只退还已claim输入，不自行唤醒或重试。
        if (!signal.aborted) {
          try { for (const message of messages) agent.inject(message); }
          catch (recoveryError) { throw new AggregateError([error, recoveryError], '资讯跳过未完成，原输入恢复也失败；请保留会话日志核对'); }
        }
        throw error;
      }
    })();
    pending.add(operation);
    return operation.finally(() => pending.delete(operation));
  }, { prepend: true });
  ctx.effect(() => async () => {
    stop(); closing.abort(new Error('鲸翼已卸载，资讯跳过操作停止'));
    await Promise.allSettled([...pending]);
  });
  return {
    notice(input, agent, signal) {
      abort(signal); abort(closing.signal);
      if (Object.keys(input).length !== 1 || !receipts.has(agent)) fail('NEWS_SKIP_NOTICE', '资讯跳过说明仅由当前定时执行生成');
      return { kind: 'success', text: newsSkippedNotice, sourceEventSeq: receipts.get(agent) };
    },
  };
}
