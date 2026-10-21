import { createClients } from './clients.js';
import { zh, en, css, explainError } from './presentation-content.js';
import { registerPluginPage } from './plugin-page.js';
import { connectRemote } from './remote.js';
import { createWorkbenchService, createWorkbenchView } from './workbench.js';
import { startFeatures } from './features.js';
import { workbenchContract } from '../workbench-contract.js';
import { createSharedUi } from './ui.js';

/** DSH工厂只接实际使用的宿主资源；组合只接线，领域通过实际模块形成依赖闭包。 */
export function createShell(require, validator, avatars) {
  const { z, formatFileMention } = validator;
  const React = require('react');
  const { createElement: h, useRef, useEffect, useSyncExternalStore } = React;
  const NS = 'whalewing';
  const { Glyph, Avatar, ActionMenu, Modal, ConfirmDialog, Drawer, Logo, avatarArt, presetAvatars } = createSharedUi(React, avatars);
  const kit = { React, loadChunk: path => require.async(path), Glyph, Avatar, ActionMenu, Modal, ConfirmDialog, Drawer, Logo, z, avatarArt, presetAvatars, css, formatFileMention };
  const Workbench = createWorkbenchView({ React, css, Logo, Modal });

  function registerUi(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), '鲸翼文案');
      const t = ctx.locale.bind(NS);
      const { bridge, clients, workbenchSession } = createClients(ctx, t, z, explainError);
      let toast = null;
      let toastTimer;
      let toastSeq = 0;
      const listeners = new Set();
      // 提示统一出现在右上角：成功 4 秒、失败 8 秒后自动收起；带操作按钮的提示等员工处理。
      const publish = (message, options = {}) => {
        clearTimeout(toastTimer);
        toast = message ? { id: ++toastSeq, text: String(message), kind: options.kind || 'success', action: options.action || null } : null;
        toastTimer = toast && !toast.action ? setTimeout(() => publish(null), toast.kind === 'error' ? 8000 : 4000) : undefined;
        for (const listener of listeners) listener();
      };
      const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
      const snapshot = () => toast;
      bridge.bindNotify(publish);
      const toastMarks = { success: '✓', error: '!', info: 'i' };
      function Toast() {
        const value = useSyncExternalStore(subscribe, snapshot, snapshot);
        const element = useRef(null);
        useEffect(() => {
          const node = element.current;
          // 放进浏览器顶层：盖在编辑弹窗之上，也不受页面布局影响；每条新提示都排到最上面。
          try { if (node?.matches(':popover-open')) node.hidePopover(); node?.showPopover?.(); } catch { /* 不支持顶层时按普通浮层显示。 */ }
        }, [value?.id]);
        return value && h(React.Fragment, null, h('style', null, css), h('div', { ref: element, key: value.id, popover: 'manual', className: `yj-toast yj-toast-${value.kind}` },
          h('span', { className: 'yj-toast-mark', 'aria-hidden': true }, toastMarks[value.kind] || toastMarks.info),
          h('span', { className: 'yj-toast-text', role: value.kind === 'error' ? 'alert' : 'status' }, value.text),
          value.action && h('button', { type: 'button', className: 'yj-toast-action', onClick: () => { publish(null); return value.action.run(); } }, value.action.label),
          h('button', { type: 'button', className: 'yj-toast-close', onClick: () => publish(null), 'aria-label': t('toastClose') }, '×')));
      }
      // 标准字形作为文字标识，不维护第二套图标库或读取宿主 DOM。
      function Icon({ size }) { return h(Logo, { size }); }
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'whalewing', order: 20, locale: NS, label: () => t('panel') }, Icon));
      const workbench = createWorkbenchService(ctx, { bridge, clients, workbenchSession, t, notify: publish, ui: { ConfirmDialog, Drawer, Modal, ActionMenu, Logo }, explainError: (error, extraGuide) => extraGuide?.[error.code] || explainError(error.code, error.message).text });
      workbench.internal.kit = kit;
      ctx.provide('whalewingWorkbench', workbench);
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'whalewing', locale: NS, children: { 'whalewing.workbench.tab': { kind: 'list', scope: 'root' }, 'whalewing.workbench.dock': { kind: 'single', scope: 'root' }, 'whalewing.assistant.conversation': { kind: 'single', scope: 'session' } }, inject: () => ({ bridge, clients, workbenchSession, notify: publish, workbench }) }, Workbench));
      startFeatures(ctx, workbench);
      registerPluginPage(ctx, workbench, React);
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'whalewing-notice', locale: NS }, Toast));
      ctx.effect(() => () => { clearTimeout(toastTimer); listeners.clear(); toast = null; }, '鲸翼提示释放');
  }
  return {
    inject: ['slots', 'locale', 'remote', 'remote.commands', 'remote.session', 'remote.agentPresets', 'sessions', 'workspaces', 'uiWorkspace', 'inputTriggers'],
    apply(ctx) {
      registerUi(ctx);
      const reconnect = connectRemote(ctx, workbenchContract(z).client, () => {}, error => ctx.whalewingWorkbench.notify(error.message, { kind: 'error', action: { label: '重试连接', run: () => reconnect() } }));
    },
  };
}
