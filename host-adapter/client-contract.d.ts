import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';

/** 客户端准备阶段，不允许改写问题、创建会话或再次发送。 */
export interface SessionPromptPreparation {
  readonly sessionId: SessionId;
  readonly signal: AbortSignal;
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** 原模式 owner 唯一使用 prepend；其它消费者默认追加，只返回 void。 */
    'session/before-prompt'(this: Context, preparation: SessionPromptPreparation): void | Promise<void>;
  }
}
