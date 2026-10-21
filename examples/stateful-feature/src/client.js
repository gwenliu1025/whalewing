import { createElement as h, useEffect, useRef, useState } from 'react';
import { featureId } from '../identity.js';
import { contract, input, state, namespace } from '../contract.js';

export const inject = ['slots', 'locale', 'remote'];

export async function request(remote, raw, signal) {
  const value = input.parse(raw); signal.throwIfAborted();
  const reply = await remote.manage(value, signal); signal.throwIfAborted();
  if (reply?.ok !== true) throw Object.assign(new Error(reply?.error?.message || '未取得保存结果，请刷新核对'), { code: reply?.error?.code });
  return state.parse(reply.value);
}

export function apply(ctx) {
  // 顶层不等待鲸翼；所有远程挂载、页签及迟到结果都属于可撤销的子作用域。
  ctx.inject(['whalewingWorkbench'], scope => {
    function SavedText({ active, workbench }) {
      const [saved, setSaved] = useState(null), [draft, setDraft] = useState('');
      const [editing, setEditing] = useState(false), [confirming, setConfirming] = useState(false);
      const [busy, setBusy] = useState(false), [connected, setConnected] = useState(false), [attempt, setAttempt] = useState(0);
      const [connecting, setConnecting] = useState(true);
      const lifetime = useRef(null), connection = useRef(null), operation = useRef(null), current = useRef({}), editRevision = useRef(0), purgeRevision = useRef(0);
      current.current = { saved, draft, editing };
      const { Drawer, ConfirmDialog } = workbench.ui;
      const execute = raw => {
        const local = lifetime.current, binding = connection.current;
        if (!local || local.signal.aborted || operation.current || binding?.owner !== local) return;
        return workbench.run(async signal => {
          const ticket = {}; operation.current = ticket; setBusy(true);
          const combined = AbortSignal.any([signal, local.signal, AbortSignal.timeout(10000)]);
          try {
            const value = await request(binding.remote, raw, combined);
            combined.throwIfAborted(); setSaved(value);
            if (raw.action !== 'read') { setEditing(false); setConfirming(false); setDraft(value.text); }
            workbench.notify(raw.action === 'read' ? '已读取保存状态' : raw.action === 'save' ? '文本已保存并核对' : '保存文本已清除并核对', { kind: 'success' });
          } catch (error) {
            if (!local.signal.aborted) workbench.notify(
              combined.aborted ? '已停止等待；保存或清除可能已提交，请刷新核对后再操作。' : error.message,
              { kind: 'error', action: { label: '刷新核对', run: () => execute({ action: 'read' }) } });
          } finally { if (operation.current === ticket) operation.current = null; if (!local.signal.aborted) setBusy(false); }
        });
      };
      useEffect(() => {
        const local = new AbortController(); lifetime.current = local;
        operation.current = null; setBusy(false); setConnected(false); setConnecting(true);
        let release, dependency;
        const cleanup = async () => {
          const child = dependency, unmount = release; dependency = null; release = null;
          try { await child?.dispose(); } finally { await unmount?.(); }
        };
        const disconnect = message => {
          if (local.signal.aborted) return;
          local.abort(new Error(message)); clearTimeout(timer);
          if (connection.current?.owner === local) connection.current = null;
          setConnected(false); setConnecting(false); setBusy(false);
          void cleanup().catch(error => console.warn('保存文本远程连接清理失败', error));
          workbench.notify(message, { kind: 'error' });
        };
        // 挂载或依赖等待均受同一期限约束；超时立即允许重连，迟到结果只清理。
        const timer = setTimeout(() => disconnect('连接保存文本超时，请重新连接'), 10000);
        Promise.resolve().then(() => scope.remote.$mount(contract.client)).then(async unmount => {
          if (local.signal.aborted) { await unmount(); return; }
          release = unmount;
          // $mount只登记Remote；必须在显式依赖它的子作用域中获取可调用实例。
          dependency = scope.inject(['remote.' + namespace], child => {
            if (local.signal.aborted) return;
            const binding = { owner: local, remote: child.remote[namespace] };
            connection.current = binding;
            child.effect(() => () => {
              if (connection.current === binding) connection.current = null;
              disconnect('保存文本连接已断开，请重新连接后刷新核对');
            });
            clearTimeout(timer); setConnected(true); setConnecting(false); execute({ action: 'read' });
          });
          await dependency;
        }).catch(error => {
          if (local.signal.aborted) console.warn('保存文本旧连接收尾失败', error);
          else disconnect(error.message);
        });
        const refresh = workbench.onRefresh(() => execute({ action: 'read' }));
        const guard = workbench.guardLeave(() => current.current.editing && current.current.draft !== (current.current.saved?.text ?? '') ? '编辑中的文本尚未保存。' : '');
        return () => {
          local.abort(); clearTimeout(timer); refresh(); guard();
          if (connection.current?.owner === local) connection.current = null;
          void cleanup().catch(error => console.warn('保存文本远程连接清理失败', error));
        };
      }, [workbench, attempt]);
      return h('section', { className: 'yj-section', 'aria-label': '保存文本' },
        h('h2', null, '保存文本'),
        h('p', { className: 'yj-muted' }, '当前 profile 单独保留一条文本。关闭或卸载保留数据；清除按钮只清本扩展的保存文本。'),
        !connected ? h('button', { type: 'button', disabled: connecting, onClick: () => { setConnected(false); setAttempt(value => value + 1); } }, connecting ? '正在连接…' : '重新连接') :
          h('div', null,
            h('p', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, saved ? saved.present ? saved.text : '尚未保存文本' : '请点击刷新读取保存状态'),
            h('div', { className: 'yj-row' },
              h('button', { type: 'button', disabled: busy, onClick: () => execute({ action: 'read' }) }, '刷新'),
              h('button', { type: 'button', className: 'yj-primary', disabled: busy || !saved, onClick: () => { editRevision.current = saved.revision; setDraft(saved.text); setEditing(true); } }, '编辑文本'),
              h('button', { type: 'button', className: 'yj-danger', disabled: busy || !saved?.present, onClick: () => { purgeRevision.current = saved.revision; setConfirming(true); } }, '清除保存文本'))),
        active && editing && h(Drawer, { title: '编辑保存文本', busy, onClose: () => setEditing(false), footer: [
          h('button', { key: 'save', type: 'button', className: 'yj-primary', disabled: busy || !draft.trim(), onClick: () => execute({ action: 'save', expectedRevision: editRevision.current, text: draft }) }, '保存文本'),
        ] }, h('label', { className: 'yj-field' }, '文本内容', h('textarea', { value: draft, maxLength: 4000, rows: 8, disabled: busy, style: { width: '100%', boxSizing: 'border-box' }, onChange: event => setDraft(event.target.value) }))),
        active && confirming && h(ConfirmDialog, { title: '清除保存文本', message: '将清除当前 profile 中本扩展保存的 1 条文本，不删除个人知识、历史会话、定时任务或其他插件数据。保留空值版本用于防止旧窗口覆盖。', confirmLabel: '确认清除文本', cancelLabel: '保留文本', danger: true, busy,
          onConfirm: () => execute({ action: 'purge', expectedRevision: purgeRevision.current, confirmation: 'DELETE_SAVED_TEXT' }), onCancel: () => setConfirming(false) }));
    }
    scope.slots.inject('whalewing.workbench.tab', () => scope.slots.register({ name: 'whalewing.workbench.tab', id: featureId, order: 110, label: () => scope.locale.resolveText({ zh: '保存文本', en: 'Saved text' }) }, SavedText));
  });
}
