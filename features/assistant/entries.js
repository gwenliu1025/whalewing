/** 工作台外入口与所属功能共用上下文，停用时一起释放。 */
export function registerEntries(ctx, kit, api) {
  const { React, Avatar, css, formatFileMention } = kit;
  const { createElement: h, useState, useRef, useEffect, useSyncExternalStore } = React;
  const NS = 'whalewing', t = ctx.locale.bind(NS);
  /** 会话正文、输入、审批和取消均由同一个原生 factory 负责。 */
  function AssistantConversation({ useSession, renderFactorySlot, views }) {
    const session = useSession(value => value);
    return renderFactorySlot('conversation.content', { variant: 'embedded', phase: session.openState === 'loading' ? 'settling' : 'active', hero: false }, { slots: { views } });
  }
  function AssistantChat({ renderSlot, sessionId, api }) {
    // 子会话先恢复宿主保存的草稿，再允许讨论入口合入文字；不读取或重建宿主草稿。
    useEffect(() => api.mountAssistantInput(sessionId), [api, sessionId]);
    // 空白原生会话还没有 viewArea；常驻占位保证首条消息前输入框也停靠底部。
    return h('div', { className: 'yj-assistant-chat' }, renderSlot('conversation.session', { view: 'chat' }));
  }

      function AssistantViews(props) { return h(AssistantChat, { ...props, api }); }
      ctx.slots.inject('whalewing.assistant.conversation', () => ctx.slots.register({ name: 'whalewing.assistant.conversation', inject: () => ({ views: AssistantViews }) }, AssistantConversation));
}
