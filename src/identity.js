import { requireExactProjection } from './session-projection.js';
import { z } from 'zod';
import { abort, fail } from './vault.js';

// 改名鲸翼前（0.1.x）的会话用 youjin 命令认领；旧会话照旧识别，知识整理才能继续排除它们。
export const claimCommands = new Set(['whalewing', 'youjin']);

/** 自动任务用途只从本命令成功回执恢复，取消计划不会抹掉排除知识来源所需身份。 */
export const automationProjection = {
  key: 'whalewingAutomation', stateVersion: 1,
  stateSchema: z.object({ purpose: z.enum(['knowledge', 'custom', 'news']).nullable(), inherited: z.number(), pending: z.array(z.string()) }),
  init: (_header, inheritedEventCount) => ({ purpose: null, inherited: inheritedEventCount, pending: [] }),
  apply(state, event) {
    if (state.purpose || event.seq < state.inherited) return state;
    if (event.type === 'command/run' && claimCommands.has(event.data.name)) return { ...state, pending: [...state.pending, event.data.commandId] };
    if (event.type !== 'command/done' || !state.pending.includes(event.data.commandId)) return state;
    let purpose = null;
    if (event.data.kind === 'success') try {
      const result = JSON.parse(event.data.text);
      if (result.action === 'automation_claim' && ['knowledge', 'custom', 'news'].includes(result.purpose)) purpose = result.purpose;
    } catch { /* 损坏或其它命令回执不授予用途。 */ }
    return { ...state, purpose, pending: state.pending.filter(id => id !== event.data.commandId) };
  },
  wire: { viewSchema: z.enum(['knowledge', 'custom', 'news']).nullable(), view: state => state.purpose },
};

/** 没有 signal 的宿主只读调用只取消本地等待，写操作始终等待真实接纳结果。 */
export async function observeAutomation(read, signal) {
  abort(signal);
  let cancel;
  try {
    return await Promise.race([Promise.resolve().then(() => { abort(signal); return read(); }), new Promise((_, reject) => {
      cancel = () => reject(signal.reason); signal?.addEventListener('abort', cancel, { once: true });
    })]);
  } finally { signal?.removeEventListener('abort', cancel); }
}

/** 自动任务身份始终从宿主投影读取，不依赖定时任务页或可选功能。 */
export async function automationIdentity(projections, sessionId, signal) {
  const result = await observeAutomation(() => projections(sessionId, signal), signal);
  abort(signal);
  requireExactProjection(result, sessionId);
  if (!Object.hasOwn(result.values, 'whalewingAutomation')) fail('AUTOMATION_IDENTITY', '自动任务投影未恢复，请保留原会话并检查日志及插件加载');
  const purpose = result.values.whalewingAutomation;
  if (purpose !== null && !['knowledge', 'custom', 'news'].includes(purpose)) fail('AUTOMATION_IDENTITY', '自动任务投影无效');
  return purpose;
}
