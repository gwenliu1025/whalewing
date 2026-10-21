/** 工作台外入口与所属功能共用上下文，停用时一起释放。 */
export function registerEntries(ctx, kit, api) {
  const { React, Avatar, css, formatFileMention } = kit;
  const { createElement: h, useState, useRef, useEffect, useSyncExternalStore } = React;
  const NS = 'whalewing', t = ctx.locale.bind(NS);
  function CiteNotes({ api, sessionId, inputActions, t }) {
    const context = useSyncExternalStore(api.subscribeContext, api.assistantContext, api.assistantContext);
    const [error, setError] = useState('');
    if (context.sessionId !== sessionId || !context.paths.length) return null;
    return h('div', { className: 'yj-cite-control' }, h('button', { type: 'button', className: 'yj-picker-trigger', title: t('citeHelp'), onMouseDown: event => event.preventDefault(), onClick: () => {
      try { api.insertReference(sessionId, inputActions.captureInsertion(), context.paths); setError(''); }
      catch (reason) { setError(reason.message); }
    } }, t('citeNotes')), error && h('span', { role: 'alert', className: 'yj-error' }, error));
  }

      ctx.effect(() => ctx.inputTriggers.registerSource({
        name: 'whalewing-knowledge', trigger: '@',
        candidates: async () => [],
        onPick: () => undefined,
        codec: {
          clipboardText: ref => JSON.parse(ref).join('\n'),
          serialize: async (ref, signal) => {
            const paths = JSON.parse(ref);
            const prepared = await api.knowledge({ action: 'question', question: t('citeQuestion'), paths }, signal);
            signal?.throwIfAborted();
            if (!Array.isArray(prepared.sources) || prepared.sources.length !== paths.length) throw new Error(t('badReply'));
            const mentions = prepared.sources.map(source => typeof source.absolutePath === 'string' ? formatFileMention({ path: source.absolutePath, kind: 'file' }, true) : undefined);
            if (mentions.some(value => !value)) throw new Error(t('citePathUnsupported'));
            // 用户消息只保留公开文件引用；是否真正读取由后续原生工具结果证明。
            return `\n${mentions.join('\n')}\n`;
          },
        },
      }), '鲸翼知识原生输入引用');
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'whalewing-knowledge', order: 20, locale: NS, inject: () => ({ api }) }, CiteNotes));
}
