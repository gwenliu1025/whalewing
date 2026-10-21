/** 远程缓存提示没有可验证的日志水位；同步 stateOf 不经过这一边界。 */
export function isExactProjection(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (!Object.hasOwn(value, 'kind') || value.kind === 'sequenced')
    && Number.isSafeInteger(value.asOfSeq) && value.asOfSeq >= -1
    && value.values !== null && typeof value.values === 'object' && !Array.isArray(value.values);
}

export function sessionIssue(code, message, sessionId, recovery = 'check') {
  return Object.assign(new Error(`${message}（${sessionId}）`), { code, sessionId, recovery });
}

/** 只验证协议壳与必需键；用途、模型和专家的业务规则仍由调用方持有。 */
export function requireExactProjection(value, sessionId, keys = []) {
  if (value?.kind === 'migration-required') throw sessionIssue('SESSION_MIGRATION', '这个会话要先在 DSH 里打开一次完成升级，打开后请重新检查', sessionId, 'open');
  if (!isExactProjection(value) || keys.some(key => !Object.hasOwn(value.values, key))) throw sessionIssue('SESSION_UNCONFIRMED', '创建结果还没确认，请保留原会话并重新检查', sessionId);
  return value;
}

export function assertCreatedSession(created, sessionId) {
  if (created?.sessionId !== sessionId) throw sessionIssue('SESSION_CREATED_DIFFERENT', `DSH 返回了另外一个会话，未认领或删除它；原请求 ${sessionId} 仍待处理，额外会话`, created?.sessionId || sessionId, 'open');
}
