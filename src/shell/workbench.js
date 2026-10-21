import { parts } from '../../features/index.js';
import { createPresentation } from './presentation.js';

const TAB_SLOT = 'whalewing.workbench.tab';
const DOCK_SLOT = 'whalewing.workbench.dock';

/** 外壳只持导航、等待和呈现租约；领域草稿及恢复判断由对应页签持有。 */
export function createWorkbenchService(ctx, { bridge, clients, workbenchSession, t, notify, ui, explainError }) {
  let state = { tab: 'experts', busy: false, revision: 0, recoverySession: '', layout: 'bubble' };
  const listeners = new Set(), refreshers = new Map(), guards = new Map(), blockers = new Map();
  const visited = new Set(['experts']);
  const operation = { current: null };
  const presentation = createPresentation(bridge);
  let alive = true, errorShown = false;
  let assistant = null, mounted = false;
  const scopes = new Map(), entering = new Map(), readiness = new Map(), clientErrors = new Map(), clientRetries = new Map(), retrying = new Set();
  let features = null, retryFeature, manageFeatures, epoch = 0, nextMount = 0, noticeOwner;
  const builtinViews = new Map(), admissions = new Map(), retiringViews = new Set();
  let tabs = [], diagnostics = new Set();
  const tabListeners = new Set();
  // 新订阅建立后，旧订阅的迟到 dispose/reset 也属于旧消息，不能再清除当前资格。
  const olderEpoch = next => next?.subscription < epoch?.subscription || next?.subscription === epoch?.subscription && next?.generation < epoch?.generation;
  const emit = patch => { state = { ...state, ...patch, revision: state.revision + 1 }; for (const listener of listeners) listener(); };
  const register = (map, id, fn) => { map.set(id, fn); return () => { if (map.get(id) === fn) map.delete(id); }; };
  const entries = () => tabs;
  const metadata = id => parts.find(part => part.id === id)?.tab || features?.features.find(feature => feature.id === id)?.tab || {};
  const refresh = (id = state.tab, options) => refreshers.get(id)?.(options);
  const setError = (message, action) => {
    if (!message) return;
    errorShown = true;
    notify(message, { kind: 'error', action });
  };
  async function run(task, success, onError, owner) {
    if (operation.current || !alive || owner?.revoked) return;
    const ticket = { owner, cancelled: false, controller: new AbortController() };
    operation.current = ticket; if (owner) owner.operation.current = ticket; errorShown = false; notify(null); emit({ busy: true, recoverySession: '' });
    try {
      const result = await task(ticket.controller.signal);
      if (!ticket.cancelled && alive && !owner?.revoked) {
        if (typeof result === 'function') result();
        if (success && !errorShown) notify(t(success));
      }
    } catch (reason) {
      if (!ticket.cancelled && alive && !owner?.revoked) {
        if (reason.code === 'workbench_identity') emit({ recoverySession: reason.workbenchId || '' });
        const report = owner ? scopes.get(owner.id)?.setError : setError;
        if (reason.recovery) report?.(reason.message, reason.recovery === 'open' ? { label: reason.code === 'SESSION_CREATED_DIFFERENT' ? '打开额外会话' : '打开原会话', run: () => bridge.open(reason.sessionId) } : { label: '重新检查', run: () => run(task, success, onError, owner) });
        else if (!onError?.(reason)) report?.(reason.sessionId ? `${t('expertSelectionFailed')} (${reason.sessionId}): ${reason.message}` : reason.message || t('requestFailed'), reason.sessionId ? { label: t('openCreated'), run: () => bridge.open(reason.sessionId) } : undefined);
      }
    } finally {
      if (owner?.operation.current === ticket) owner.operation.current = null;
      if (operation.current === ticket) { operation.current = null; if (alive) { emit({ busy: false }); if (ticket.cancelled) setError(t('stopped')); } }
    }
  }
  const openTab = id => {
    if (!alive || operation.current || !entries().some(entry => entry.options.id === id)) return;
    const warning = guards.get(state.tab)?.();
    for (const { resolve } of entering.values()) resolve(); entering.clear();
    const ready = refreshers.has(id);
    let pending;
    if (mounted && !visited.has(id)) pending = new Promise(resolve => entering.set(id, { resolve, warning }));
    visited.add(id); emit({ tab: id });
    const result = ready ? refresh(id, { entering: true }) : pending;
    if (warning) notify(warning, { kind: 'info' });
    return result;
  };
  const service = {
    notify, ui, explainError, run: task => run(task), openTab,

    manageFeatures: () => manageFeatures?.(),
    assistant: {
      open: (prompt, options) => assistant?.open(prompt, options),
      setContext: paths => assistant?.setContext(paths),
    },
    internal: {
      bridge, clients, workbenchSession, t, operation, run, setError, entries, metadata, visited, refresh, presentation,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      snapshot: () => state,
      // 每个内容实例拿到绑定自己 id 的公共服务；隐藏页的 effect 不会写到当前页。
      scope(id) {
        if (!scopes.has(id) || scopes.get(id).owner.revoked && admissions.has(id)) {
          const owner = { id, revoked: !alive || !admissions.has(id), operation: { current: null } };
          const scopedNotify = (text, options = {}) => {
            if (owner.revoked) return;
            const action = options.action && { ...options.action, run: (...args) => { if (!owner.revoked) return options.action.run(...args); } };
            noticeOwner = owner; notify(text, { ...options, action });
          };
          scopes.set(id, Object.assign(Object.create(service), {
            owner, operation: owner.operation, notify: scopedNotify,
            openTab: target => { if (!owner.revoked) return openTab(target); },
            manageFeatures: () => { if (!owner.revoked) return manageFeatures?.(); },
            assistant: {
              open: (prompt, options) => { if (!owner.revoked) return assistant?.open(prompt, options); },
              setContext: paths => { if (!owner.revoked) return assistant?.setContext(paths); },
            },
            setError(message, action) { if (message && !owner.revoked) { errorShown = true; scopedNotify(message, { kind: 'error', action }); } },
            run: (task, success, onError) => run(task, success, onError, owner),
            guardLeave: fn => owner.revoked ? () => {} : register(guards, id, fn),
            onRefresh(fn) { if (owner.revoked) return () => {}; const off = register(refreshers, id, fn); emit({}); return () => { off(); if (!owner.revoked) emit({}); }; },
          }));
        }
        return scopes.get(id);
      },
      releaseFeature(id, { client = true } = {}) {
        const scope = scopes.get(id);
        if (scope) scope.owner.revoked = true;
        scopes.delete(id);
        if (client) { readiness.delete(id); clientErrors.delete(id); }
        if (scope && noticeOwner === scope.owner) { noticeOwner = null; notify(null); }
        if (operation.current?.owner?.id === id) {
          operation.current.cancelled = true; operation.current.controller.abort(); operation.current = null;
          emit({ busy: false, recoverySession: '' });
        }
        entering.get(id)?.resolve(); entering.delete(id);
        visited.delete(id); refreshers.delete(id); guards.delete(id); blockers.delete(id);
        // 默认页首次收到 Host 实例也会换代；仍在当前页时保留访问事实，下一次切页才有正确的保活依据。
        if (alive && state.tab === id && id === 'experts') visited.add('experts');
        if (alive && state.tab === id && id !== 'experts') {
          const entry = tabs.find(value => value.options.id === id);
          const label = typeof entry?.options.label === 'function' ? entry.options.label() : entry?.options.label || id;
          visited.add('experts'); emit({ tab: 'experts' });
          notify(`「${label}」已关闭`, { kind: 'info' });
        } else emit({});
      },
      featureSnapshot: () => features,
      setFeatures(frame, connectionEpoch = epoch) { if (olderEpoch(connectionEpoch)) return; epoch = connectionEpoch; features = frame; updateTabs(); emit({}); },
      resetFeatures(connectionEpoch) { if (olderEpoch(connectionEpoch)) return; epoch = connectionEpoch; features = null; retiringViews.clear(); updateTabs(); emit({}); },
      featureEnabled: id => Boolean(features?.features.some(feature => feature.id === id && !feature.error && Number.isSafeInteger(feature.instance) && feature.instance > 0)),
      bindBuiltinView(id, component) {
        if (!parts.some(part => part.id === id)) throw new Error('内置视图不在组成清单中');
        const binding = { component }; builtinViews.set(id, binding); updateTabs();
        return () => { if (builtinViews.get(id) === binding) { builtinViews.delete(id); updateTabs(); } };
      },
      mountKey: id => admissions.get(id)?.key,
      dockEnabled: () => admissions.has('assistant'),
      setClientRetry(id, retry) { clientRetries.set(id, retry); return () => { if (clientRetries.get(id) === retry) clientRetries.delete(id); }; },
      featureReady(id, ready) { readiness.set(id, ready); emit({}); },
      featureClientError(id, error) { clientErrors.set(id, error.message); emit({}); },
      featureProblem(id) {
        const error = features?.features.find(feature => feature.id === id)?.error || clientErrors.get(id);
        return error || !readiness.get(id) ? { error, retrying: retrying.has(id) } : null;
      },
      setRetryFeature(fn) { retryFeature = fn; },
      async retryFeature(id) {
        if (!retryFeature || retrying.has(id)) return;
        retrying.add(id); emit({});
        try {
          if (clientErrors.has(id) && clientRetries.has(id)) { clientErrors.delete(id); await clientRetries.get(id)(); }
          else await retryFeature(id);
        }
        catch (error) { setError(error.message, { label: '重试', run: () => service.internal.retryFeature(id) }); }
        finally { retrying.delete(id); emit({}); }
      },
      setManageFeatures(fn) { manageFeatures = fn; emit({}); },
      canManageFeatures: () => Boolean(manageFeatures),
      pageMounted(id) { const entry = entering.get(id); if (entry) { entering.delete(id); entry.resolve(refresh(id, { entering: true })); if (entry.warning) notify(entry.warning, { kind: 'info' }); } },
      mount() { mounted = true; },
      reset() {
        mounted = false;
        if (operation.current) { operation.current.cancelled = true; operation.current.controller.abort(); operation.current = null; }
        for (const { resolve } of entering.values()) resolve(); entering.clear();
        visited.clear(); visited.add('experts');
        presentation.clear(); assistant = null;
        retiringViews.clear();
        for (const scope of scopes.values()) scope.owner.revoked = true; scopes.clear();
        refreshers.clear(); guards.clear(); blockers.clear();
        if (noticeOwner) { noticeOwner = null; notify(null); }
        emit({ tab: 'experts', busy: false, recoverySession: '', layout: 'bubble' });
      },
      hasRefresh: id => refreshers.has(id),
      registerBlock: (id, fn) => register(blockers, id, fn),
      guarded: () => [...blockers.values()].some(fn => Boolean(fn())),
      bindAssistant(value) { assistant = value; return () => { if (assistant === value) assistant = null; }; },
      assistant: () => assistant,
      assistantChanged: () => emit({}),
      layout(value) { if (state.layout !== value) emit({ layout: value }); },
      ensureWorkbench: (...args) => workbenchSession.ensureWorkbench(...args),
      async restartWorkbench() {
        const tab = state.tab;
        let recovered = false;
        await run(async signal => { await workbenchSession.restartWorkbench(signal); signal.throwIfAborted(); return () => { recovered = true; emit({ recoverySession: '' }); }; });
        if (recovered) return refresh(tab);
      },
      closeRecovery: () => emit({ recoverySession: '' }),
      stop() { if (operation.current) { operation.current.cancelled = true; operation.current.controller.abort(); setError(t('stopHelp')); } },
      dispose() { alive = false; service.internal.reset(); presentation.dispose(); refreshers.clear(); guards.clear(); blockers.clear(); listeners.clear(); assistant = null; },
    },
  };
  function updateTabs() {
    const next = new Map(), problems = new Set();
    const raw = new Map([TAB_SLOT, DOCK_SLOT].map(name => [name, ctx.slots.entries(name)]));
    const liveEntries = new Set([...raw.values()].flat());
    for (const entry of retiringViews) if (!liveEntries.has(entry)) retiringViews.delete(entry);
    for (const name of [TAB_SLOT, DOCK_SLOT]) {
      const groups = new Map();
      // 原生 single 以整个插槽选 winner，id 不隔离位置；先核对整槽再把助手 scope 交给 renderer。
      if (name === DOCK_SLOT) { if (raw.get(name).length) groups.set('assistant', raw.get(name)); }
      else {
        for (const entry of raw.get(name)) {
          const id = entry.options.id;
          if (!groups.has(id)) groups.set(id, []);
          groups.get(id).push(entry);
        }
      }
      for (const [id, group] of groups) {
        const part = parts.find(part => part.id === id), host = features?.features.find(feature => feature.id === id);
        const enabled = host && !host.error && host.api === 1 && host.kind === (part?.kind ?? 'extension') && Number.isSafeInteger(host.instance) && host.instance > 0;
        // 原始登记而非 shadow winner 决定唯一性；registrant 只是原生诊断文案。
        if (group.length !== 1) { problems.add(id); continue; }
        // 可选 Host 先撤销、原生 Client 随后清理是正常关闭，不用短暂残留覆盖“已关闭”回执。
        if (part?.kind === 'optional' && !enabled) continue;
        if (part && (group[0].options.id !== id || name !== (id === 'assistant' ? DOCK_SLOT : TAB_SLOT) || group[0].component !== builtinViews.get(id)?.component)) { problems.add(id); continue; }
        if (!part && name !== TAB_SLOT) { problems.add(id); continue; }
        if (part?.kind !== 'base' && !enabled) {
          // 只记住已接纳后被完整帧撤销、仍待原生清理的同一个视图；新视图不继承这个退场状态。
          const entry = group[0];
          if (features && !host && admissions.get(id)?.entry === entry) retiringViews.add(entry);
          if (features && !retiringViews.has(entry)) problems.add(id);
          continue;
        }
        const entry = group[0], previous = admissions.get(id), instance = host?.instance;
        retiringViews.delete(entry);
        const same = previous?.entry === entry && previous.epoch === epoch && previous.instance === instance;
        next.set(id, same ? previous : { entry, epoch, instance, key: `${id}:${++nextMount}`, name });
      }
    }
    for (const [id, previous] of admissions) if (next.get(id) !== previous) service.internal.releaseFeature(id, { client: false });
    admissions.clear(); for (const [id, admission] of next) admissions.set(id, admission);
    tabs = [...admissions.values()].filter(value => value.name === TAB_SLOT).map(value => value.entry).sort((a, b) => Number(metadata(a.options.id).placement === 'end') - Number(metadata(b.options.id).placement === 'end') || (a.options.order ?? 0) - (b.options.order ?? 0));
    if ([...problems].some(id => !diagnostics.has(id))) notify('部分功能视图尚未匹配有效登记或存在同名冲突，请检查插件', { kind: 'error', action: { label: '管理功能', run: () => { if (alive) return manageFeatures?.(); } } });
    diagnostics = problems;
    for (const listener of tabListeners) listener();
  }
  service.internal.tabSnapshot = () => tabs;
  service.internal.subscribeTabs = listener => { tabListeners.add(listener); return () => tabListeners.delete(listener); };
  ctx.effect(() => {
    const offSlots = ctx.slots.subscribe(TAB_SLOT, updateTabs), offDock = ctx.slots.subscribe(DOCK_SLOT, updateTabs), offLocale = ctx.locale.subscribe(updateTabs);
    updateTabs();
    return () => { offSlots(); offDock(); offLocale(); tabListeners.clear(); service.internal.dispose(); };
  });
  return service;
}

export function createWorkbenchView({ React, css, Logo, Modal }) {
  const { createElement: h, useLayoutEffect, useSyncExternalStore } = React;
  function TabContent({ core, id, children }) {
    useLayoutEffect(() => { core.pageMounted(id); }, [core, id]);
    return children;
  }
  return function Workbench({ workbench, t, SessionProvider, renderSlot }) {
    const core = workbench.internal;
    const state = useSyncExternalStore(core.subscribe, core.snapshot, core.snapshot);
    const entries = useSyncExternalStore(core.subscribeTabs, core.tabSnapshot, core.tabSnapshot);
    useLayoutEffect(() => { core.mount(); return () => core.reset(); }, [core]);
    const button = (key, onClick, disabled = false, props = {}) => h('button', { type: 'button', onClick, disabled: state.busy || disabled, ...props }, t(key));
    return h('div', { className: 'yj-page' }, h('style', null, css),
      h('header', { className: 'yj-header yj-workbench-header' }, h('h1', null, h(Logo, { size: 24, tone: 'brand' }), t('panel')), h('div', { className: 'yj-row' }, core.canManageFeatures() && h('button', { type: 'button', onClick: workbench.manageFeatures }, '管理功能'), core.hasRefresh(state.tab) && button('refresh', () => core.refresh()))),
      h('nav', { className: 'yj-tabs', 'aria-label': t('panel') }, ...entries.map((entry, index) => {
        const id = entry.options.id, meta = core.metadata(id);
        return h('button', { type: 'button', key: id, 'data-tab': parts.find(part => part.id === id)?.label || id, disabled: state.busy, 'aria-pressed': state.tab === id, className: [state.tab === id ? 'yj-selected' : '', meta.placement === 'end' && (index === 0 || core.metadata(entries[index - 1].options.id).placement !== 'end') ? 'yj-world-tab' : ''].filter(Boolean).join(' '), onClick: () => workbench.openTab(id) }, typeof entry.options.label === 'function' ? entry.options.label() : entry.options.label, ...(meta.icon ? [h('span', { className: 'yj-tab-icon', 'aria-hidden': true, style: { display: 'inline-block', width: 16, height: 16, flexShrink: 0, backgroundColor: 'currentColor', mask: `url("data:image/svg+xml,${encodeURIComponent(meta.icon)}") center / contain no-repeat`, WebkitMask: `url("data:image/svg+xml,${encodeURIComponent(meta.icon)}") center / contain no-repeat` } })] : []));
      })),
      state.busy && h('div', { className: 'yj-busy', role: 'status' }, h('span', { className: 'yj-spinner', 'aria-label': t('loading') }), h('button', { type: 'button', onClick: core.stop }, t('stopWait'))),
      state.recoverySession && h(Modal, { title: t('workbenchRecoverTitle'), busy: state.busy, onClose: core.closeRecovery, className: 'yj-confirm' }, h('div', { className: 'yj-confirm-body' }, h('p', null, t('prepareHelp')), h('p', null, h('code', null, state.recoverySession))), h('footer', { className: 'yj-dialog-actions' }, button('inspectWorkbench', () => core.bridge.open(state.recoverySession), core.guarded()), button('prepareWorkbench', core.restartWorkbench, core.guarded(), { className: 'yj-primary' }))),
      h('div', { className: `yj-workspace yj-workspace-${state.layout}` }, h('main', { className: 'yj-view' }, ...entries.filter(entry => state.tab === entry.options.id || (core.visited.has(entry.options.id) && core.metadata(entry.options.id).keepAlive)).map(entry => h('div', { key: core.mountKey(entry.options.id), hidden: state.tab !== entry.options.id, style: { display: state.tab === entry.options.id ? 'contents' : undefined } }, h(TabContent, { core, id: entry.options.id }, renderSlot(TAB_SLOT, { active: state.tab === entry.options.id, workbench: core.scope(entry.options.id), SessionProvider, renderSlot }, { only: entry.options.id }))))), core.dockEnabled() && h(React.Fragment, { key: core.mountKey('assistant') }, renderSlot(DOCK_SLOT, { workbench: core.scope('assistant'), SessionProvider, renderSlot }))));
  };
}
