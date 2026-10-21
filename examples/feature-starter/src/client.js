import { createElement as h, useEffect, useRef, useState } from 'react';
import { featureId } from '../identity.js';

export const inject = ['slots', 'locale'];

/** 成功和取消都释放计时器及监听，不让关闭的页签留下后台等待。 */
export function waitForDemo(signal, milliseconds = 2000) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer); signal.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve();
    };
    const cancel = () => finish(signal.reason);
    const timer = setTimeout(() => finish(), milliseconds);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

export function apply(ctx) {
  function TextPreview({ active, workbench }) {
    const [text, setText] = useState(''), [preview, setPreview] = useState(false), [busy, setBusy] = useState(false);
    const draft = useRef(''), lifetime = useRef(null);
    const { Modal } = workbench.ui;
    useEffect(() => {
      const controller = new AbortController(); lifetime.current = controller;
      const unguard = workbench.guardLeave(() => draft.current ? '文字只在本次打开期间保留，关闭扩展前请自行保存。' : '');
      const unrefresh = workbench.onRefresh(() => workbench.notify('文本预览已刷新', { kind: 'success' }));
      return () => { controller.abort(); unguard(); unrefresh(); };
    }, [workbench]);
    const demonstrate = async () => {
      const local = lifetime.current;
      if (!local || local.signal.aborted || busy) return;
      setBusy(true);
      try {
        await workbench.run(async signal => {
          const combined = AbortSignal.any([signal, local.signal]);
          await waitForDemo(combined);
          combined.throwIfAborted();
          workbench.notify('本地演示已完成', { kind: 'success' });
        });
      } finally { if (!local.signal.aborted) setBusy(false); }
    };
    return h('section', { className: 'yj-section', 'aria-label': '文本预览' },
      h('h2', null, '文本预览'),
      h('p', { className: 'yj-muted' }, '文字只在本次打开期间暂存，关闭扩展或工作台后清空；不会写入个人知识。'),
      h('label', { className: 'yj-field' }, '预览文字', h('textarea', {
        'aria-label': '预览文字', rows: 6, maxLength: 4000, value: text, disabled: busy,
        style: { width: '100%', boxSizing: 'border-box' },
        onChange: event => { draft.current = event.target.value; setText(event.target.value); },
      })),
      h('div', { className: 'yj-row' },
        h('button', { type: 'button', className: 'yj-primary', disabled: busy || !text.trim(), onClick: () => setPreview(true) }, '预览文本'),
        h('button', { type: 'button', disabled: busy, onClick: demonstrate }, '运行本地演示')),
      active && preview && h(Modal, { title: '文本预览', onClose: () => setPreview(false) },
        h('div', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflowY: 'auto', maxHeight: '60vh' } }, text)));
  }
  // 浏览器入口必须可独立启动；鲸翼缺席只让此子作用域等待，不阻断 DSH 启动检查。
  ctx.inject(['whalewingWorkbench'], scope => {
    scope.slots.inject('whalewing.workbench.tab', () => scope.slots.register({
      name: 'whalewing.workbench.tab', id: featureId, order: 100,
      label: () => scope.locale.resolveText({ zh: '文本预览', en: 'Text preview' }),
    }, TextPreview));
  });
}
