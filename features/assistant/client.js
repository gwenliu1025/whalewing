import { registerEntries } from './entries.js';
import { registerFeature, useFeature } from '../../src/shell/feature.js';

/** 助手独立持有会话、引用范围和窗口形态；只向外壳申请呈现租约。 */
export function createView(kit) {
  const { React, Avatar } = kit;
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } = React;
  function useDraggableBubble() {
    const key = 'whalewing.assistantBubble.v1';
    const [offset, setOffset] = useState(() => {
      try { const value = JSON.parse(window.localStorage.getItem(key)); if (Number.isFinite(value?.right) && Number.isFinite(value?.bottom)) return value; } catch { /* 读不到位置时用默认右下角。 */ }
      return null;
    });
    const drag = useRef(null), dragged = useRef(false);
    const edge = 8;
    const clamp = (element, right, bottom) => {
      // 按整个窗口定位：AI 网页全屏时主栏会变窄，按主栏算会把按钮挤到屏幕中间。
      const box = { width: window.innerWidth, height: window.innerHeight };
      return { right: Math.round(Math.max(edge, Math.min(right, box.width - element.offsetWidth - edge))), bottom: Math.round(Math.max(edge, Math.min(bottom, box.height - element.offsetHeight - edge))) };
    };
    const save = value => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* 位置只是个人偏好，存不下不影响使用。 */ } };
    const end = (event, keep) => {
      const active = drag.current;
      if (!active || active.id !== event.pointerId) return;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (keep && dragged.current) setOffset(value => { if (value) save(value); return value; });
    };
    const handlers = {
      onPointerDown: event => {
        if (event.button !== 0) return;
        const style = window.getComputedStyle(event.currentTarget);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, right: parseFloat(style.right) || 0, bottom: parseFloat(style.bottom) || 0 };
        dragged.current = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: event => {
        const active = drag.current;
        if (!active || active.id !== event.pointerId) return;
        const dx = event.clientX - active.x, dy = event.clientY - active.y;
        if (!dragged.current && Math.hypot(dx, dy) < 5) return;
        dragged.current = true;
        setOffset(clamp(event.currentTarget, active.right - dx, active.bottom - dy));
      },
      onPointerUp: event => end(event, true),
      onPointerCancel: event => end(event, true),
    };
    // 拖动之后的那次 click 只结束拖动，不打开助手。
    const consumeDrag = () => { const value = dragged.current; dragged.current = false; return value; };
    // 窗口缩小时位置仍留在可见范围内。
    const style = offset ? { right: `max(${edge}px, min(${offset.right}px, calc(100vw - 180px)))`, bottom: `max(${edge}px, min(${offset.bottom}px, calc(100vh - 60px)))` } : undefined;
    return { style, handlers, consumeDrag };
  }

  function useFloatingAssistant(form) {
    const frame = useRef(null);
    const gesture = useRef(null);
    const [rect, setRect] = useState(null);
    const viewport = () => ({ width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) });
    const fit = value => {
      const view = viewport();
      const edge = Math.min(16, view.width / 4, view.height / 4);
      const width = Math.min(Math.max(value.width, Math.min(320, view.width - edge * 2)), view.width - edge * 2);
      const height = Math.min(Math.max(value.height, Math.min(360, view.height - edge * 2)), view.height - edge * 2);
      return { left: Math.max(edge, Math.min(value.left, view.width - width - edge)), top: Math.max(edge, Math.min(value.top, view.height - height - edge)), width, height };
    };
    const initial = () => { const view = viewport(); return fit({ left: view.width - 464, top: view.height - 784, width: 440, height: 760 }); };
    const finish = event => {
      const active = gesture.current;
      if (!active || (event && event.pointerId !== active.id)) return;
      gesture.current = null;
      if (active.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
    };
    useEffect(() => {
      if (form !== 'float') { finish(); return; }
      setRect(value => fit(value || initial()));
      const resized = () => { finish(); setRect(value => fit(value || initial())); };
      window.addEventListener('resize', resized);
      return () => { finish(); window.removeEventListener('resize', resized); };
    }, [form === 'float']);
    const begin = (event, direction) => {
      if (form !== 'float' || event.button !== 0 || gesture.current) return;
      if (direction === 'move' && event.target.closest('button,input,textarea,select,a')) return;
      event.preventDefault();
      const bounds = frame.current.getBoundingClientRect();
      gesture.current = { id: event.pointerId, target: event.currentTarget, direction, x: event.clientX, y: event.clientY, rect: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height } };
      event.currentTarget.setPointerCapture(event.pointerId);
    };
    const applyMotion = (direction, start, dx, dy) => {
      if (direction === 'move') { setRect(fit({ width: start.width, height: start.height, left: start.left + dx, top: start.top + dy })); return; }
      const view = viewport(), edge = Math.min(16, view.width / 4, view.height / 4);
      const minWidth = Math.min(320, view.width - edge * 2), minHeight = Math.min(360, view.height - edge * 2);
      let left = start.left, top = start.top, right = left + start.width, bottom = top + start.height;
      if (direction.includes('w')) left = Math.max(edge, Math.min(left + dx, right - minWidth));
      if (direction.includes('e')) right = Math.min(view.width - edge, Math.max(right + dx, left + minWidth));
      if (direction.includes('n')) top = Math.max(edge, Math.min(top + dy, bottom - minHeight));
      if (direction.includes('s')) bottom = Math.min(view.height - edge, Math.max(bottom + dy, top + minHeight));
      setRect({ left, top, width: right - left, height: bottom - top });
    };
    const moved = event => {
      const active = gesture.current;
      if (!active || active.id !== event.pointerId) return;
      event.preventDefault();
      applyMotion(active.direction, active.rect, event.clientX - active.x, event.clientY - active.y);
    };
    const handle = direction => ({ onPointerDown: event => begin(event, direction), onPointerMove: moved, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish, onKeyDown: event => {
      if (form !== 'float' || event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 24 : 8;
      applyMotion(direction, frame.current.getBoundingClientRect(), event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
    } });
    return { frame, style: form === 'float' && rect ? { ...rect, right: 'auto', bottom: 'auto' } : undefined, handle };
  }

  /** 分隔宽度仅属于当前工作台；容器变窄时同时给目录与正文保留空间。 */
  return function AssistantDock({ workbench, SessionProvider, renderSlot }) {
    const { api, t, notify, busy, run, operation, setError, button, row, help } = useFeature(React, workbench, 'assistant');
    const [selectedPaths, setSelectedPaths] = useState([]);
    const [contextExplicit, setContextExplicit] = useState(false);
    const [noteState, setNoteState] = useState({ path: '', dirty: false });
    const note = noteState.path ? noteState : null, dirty = noteState.dirty;
    const registry = useSyncExternalStore(api.subscribeExperts, api.experts, api.experts);
    const roleCards = registry.experts;
    // 工作区先留给内容；仅在员工主动唤起后展开，不触发会话准备。
    const [assistantForm, setAssistantForm] = useState('bubble');
    const floating = useFloatingAssistant(assistantForm);
    const bubble = useDraggableBubble();
    const [assistantId, setAssistantId] = useState('');
    const [assistantReference, setAssistantReference] = useState(null);
    const [assistantPresentedReady, setAssistantPresentedReady] = useState(null);
    const [previewError, setPreviewError] = useState('');
    const [previewRetry, setPreviewRetry] = useState(0);
    useEffect(() => {
      const media = window.matchMedia?.('(max-width: 850px)');
      if (!media) return;
      // 窄屏先让出知识画布；显式打开的悬浮窗与同一个原生会话不重建。
      const adapt = event => { if (event.matches) setAssistantForm(value => value === 'dock' ? 'bubble' : value); };
      adapt(media);
      media.addEventListener('change', adapt);
      return () => media.removeEventListener('change', adapt);
    }, []);
    useEffect(() => () => { assistantReference?.release(); }, [assistantReference]);
    useEffect(() => {
      let live = true;
      setAssistantPresentedReady(null);
      if (assistantReference && assistantReference.sessionId === assistantId && assistantForm !== 'bubble') {
        assistantReference.ready.then(() => { if (live) setAssistantPresentedReady(assistantReference); }, reason => { if (live) setPreviewError(reason.message || t('requestFailed')); });
      }
      return () => { live = false; };
    }, [assistantReference, assistantId, assistantForm === 'bubble', previewRetry]);
    const visibleAssistant = assistantForm !== 'bubble' && assistantPresentedReady === assistantReference && assistantReference?.sessionId === assistantId ? assistantReference : null;
    const presentation = workbench.internal.presentation;
    const presented = useSyncExternalStore(presentation.subscribe, presentation.snapshot, presentation.snapshot);
    useEffect(() => visibleAssistant ? presentation.claim('dock', visibleAssistant, 100) : undefined, [visibleAssistant, previewRetry]);
    useEffect(() => { setPreviewError(presented.error); }, [presented.error]);
    useLayoutEffect(() => workbench.internal.layout(assistantForm), [assistantForm]);
    const activePaths = contextExplicit ? selectedPaths : note ? [note.path] : [];
    const openAssistant = async proposal => {
      let acquired;
      try {
        await run(async () => {
          const id = await api.ensureAssistant();
          operation.current.controller.signal.throwIfAborted();
          const reference = assistantReference?.sessionId === id ? assistantReference : (acquired = api.retain(id));
          setAssistantId(id); setAssistantReference(reference); setAssistantForm('float'); acquired = undefined;
          if (typeof proposal === 'string') await api.proposeDiscussion(reference, proposal, operation.current.controller.signal);
        }, typeof proposal === 'string' ? 'draftPrepared' : undefined);
      } finally { acquired?.release(); }
    };
    useEffect(() => {
      api.setAssistantContext(assistantId, activePaths);
      return () => api.setAssistantContext('', []);
    }, [assistantId, JSON.stringify(activePaths)]);
    const current = useRef(null);
    current.current = { selectedPaths, open: async (prompt, options) => { if (options?.paths) { setContextExplicit(true); setSelectedPaths(options.paths); } return openAssistant(prompt); }, setContext: paths => { setContextExplicit(true); setSelectedPaths(paths); }, currentNote: (path, dirty) => setNoteState(value => value.path === path && value.dirty === dirty ? value : { path, dirty }) };
    useLayoutEffect(() => workbench.internal.bindAssistant({ get selectedPaths() { return current.current.selectedPaths; }, open: (...args) => current.current.open(...args), setContext: paths => current.current.setContext(paths), currentNote: (...args) => current.current.currentNote(...args) }), []);
    useLayoutEffect(() => { workbench.internal.assistantChanged(); }, [selectedPaths, contextExplicit]);
    const assistant = h('aside', { ref: floating.frame, style: floating.style, className: `yj-assistant yj-assistant-${assistantForm}`, 'aria-label': t('question'), hidden: assistantForm === 'bubble' },
      h('header', { className: 'yj-assistant-header', ...floating.handle('move'), tabIndex: assistantForm === 'float' ? 0 : undefined, title: assistantForm === 'float' ? t('assistantMove') : undefined }, h(Avatar, { expert: roleCards.find(role => role.id === 'manager'), size: 32 }), h('div', null, h('h2', null, t('question')), h('small', null, t('assistantTagline'))), button('assistantMinimize', () => setAssistantForm('bubble'), false, { className: 'yj-assistant-minimize', 'aria-label': t('assistantMinimize'), title: t('assistantMinimize') })),
      assistantForm === 'float' && ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map(direction => h('div', { key: direction, className: `yj-resize yj-resize-${direction}`, role: 'button', tabIndex: 0, 'aria-label': `${t('assistantResize')} · ${t(`resize_${direction}`)}`, ...floating.handle(direction) })),
      h('div', { className: 'yj-row yj-assistant-tools' }, button(assistantForm === 'float' ? 'assistantDock' : 'assistantFloat', () => setAssistantForm(assistantForm === 'float' ? 'dock' : 'float')), assistantId && button('assistantHistory', () => api.open(assistantId))),
      previewError && h('div', { className: 'yj-notice yj-error', role: 'alert' }, previewError, button('assistantPreviewRetry', () => setPreviewRetry(value => value + 1))),
      !roleCards.some(role => role.id === 'manager') ? h('p', { className: 'yj-notice' }, t('assistantMissing')) : h(React.Fragment, null,
        h('details', { className: 'yj-assistant-context', open: Boolean(activePaths.length) }, h('summary', null, activePaths.length ? `${t('noteScope')} · ${activePaths.length}` : t('generalScope')),
          h('ul', null, ...activePaths.map(name => h('li', { key: name }, name.split('/').at(-1)))),
          row(button('askCurrent', () => { setContextExplicit(true); setSelectedPaths([note.path]); }, !note || dirty), button('clearSelection', () => { setContextExplicit(true); setSelectedPaths([]); })),
          help('citeHelp')),
        assistantReference ? h('div', { className: 'yj-assistant-conversation' }, h(SessionProvider, { session: assistantReference }, renderSlot('whalewing.assistant.conversation', {}))) : h('div', { className: 'yj-assistant-welcome' }, h(Avatar, { expert: roleCards.find(role => role.id === 'manager'), size: 72 }), h('h3', null, t('question')), help('questionHelp'), button('assistantStart', openAssistant, false, { className: 'yj-primary' }))));
    return h(React.Fragment, null, assistant,
      assistantForm === 'bubble' && button('assistantOpen', () => { if (!bubble.consumeDrag()) setAssistantForm('float'); }, false, { className: 'yj-assistant-bubble', style: bubble.style, title: t('assistantDrag'), disabled: false, ...bubble.handlers }));
  };
}

export const name = 'whalewing-assistant';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'assistant', createView, { entries: registerEntries, dependencies: ['remote.whalewingExperts'], requires: ['experts'] }); }
