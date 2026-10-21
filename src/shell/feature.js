import { connectRemote } from './remote.js';
import { parts } from '../../features/index.js';

/** 页签首次真正显示才加载资源；离页或卸载只撤销本次接收，不旁路原生下载。 */
export function createDeferredView(React, load, create, label) {
  return function DeferredFeature({ active = true, workbench, ...props }) {
    const [View, setView] = React.useState(null), [attempt, retry] = React.useState(0);
    const [failed, setFailed] = React.useState(false);
    const [cancelled, setCancelled] = React.useState(false);
    const restart = () => { setCancelled(false); retry(value => value + 1); };
    React.useEffect(() => {
      if (!active || View || cancelled) return;
      let live = true;
      setFailed(false);
      Promise.resolve().then(() => live ? load() : undefined).then(module => {
        if (live) { const Component = create(module); setView(() => Component); }
      }).catch(() => {
        if (!live) return;
        setFailed(true);
        workbench.notify(`「${label}」加载未完成，请检查连接后重试`, { kind: 'error', action: { label: '重试加载', run: () => { if (live) restart(); } } });
      });
      return () => { live = false; };
    }, [active, View, attempt, cancelled]);
    if (View) return React.createElement(View, { ...props, active, workbench });
    if (!active) return null;
    return React.createElement('section', { className: 'yj-task-empty', role: failed ? 'alert' : 'status' },
      failed || cancelled ? React.createElement('button', { type: 'button', onClick: restart }, '重新加载') : React.createElement(React.Fragment, null,
        React.createElement('span', null, '正在加载…'), React.createElement('button', { type: 'button', onClick: () => setCancelled(true) }, '停止等待')));
  };
}

/** 先登记稳定入口，再等待本功能的 Remote；一个底座失败不阻塞整个工作台。 */
export function registerFeature(ctx, id, createView, { contract, namespace, dependencies = [], entries, requires = [] } = {}) {
  const part = parts.find(value => value.id === id), workbench = ctx.whalewingWorkbench;
  const core = workbench.internal, kit = core.kit, { React } = kit;
  const name = id === 'assistant' ? 'whalewing.workbench.dock' : 'whalewing.workbench.tab';
  const View = createView(kit);
  function FeatureGate(props) {
    React.useSyncExternalStore(core.subscribe, core.snapshot, core.snapshot);
    const blocked = [id, ...requires].find(dependency => core.featureProblem(dependency));
    const problem = blocked && core.featureProblem(blocked);
    const wasBlocked = React.useRef(false);
    React.useLayoutEffect(() => {
      if (!problem && wasBlocked.current && props.active !== false) core.refresh(id, { entering: true });
      wasBlocked.current = Boolean(problem);
    }, [Boolean(problem)]);
    if (problem) return props.active === false ? null : React.createElement('section', { className: id === 'assistant' ? 'yj-assistant-bubble' : 'yj-task-empty', role: problem.error ? 'alert' : 'status' },
      React.createElement('span', null, problem.error || '正在连接功能…'),
      problem.error && React.createElement('button', { type: 'button', disabled: problem.retrying, onClick: () => core.retryFeature(blocked) }, '重试'));
    return React.createElement(View, props);
  }
  ctx.effect(() => core.bindBuiltinView(id, FeatureGate));
  ctx.effect(() => () => core.releaseFeature(id));
  ctx.slots.inject(name, () => ctx.slots.register({ name, id, order: part.order, locale: 'whalewing', label: part.label ? () => ctx.locale.bind('whalewing')(part.label) : undefined }, FeatureGate));
  const ready = () => ctx.inject([...(namespace ? ['remote.' + namespace] : []), ...dependencies], scope => {
    if (namespace) scope.effect(() => core.bridge.bindFeatureRemote(namespace, scope.remote[namespace]));
    entries?.(scope, kit, core.clients[id]);
    core.featureReady(id, true);
    scope.effect(() => () => core.featureReady(id, false));
  });
  if (contract) {
    const reconnect = connectRemote(ctx, contract(kit.z).client, ready, error => core.featureClientError(id, error));
    ctx.effect(() => core.setClientRetry(id, reconnect));
  } else ready();
}

/** 内置页签共用等待与控件，不共享领域状态或把状态反写到外壳。 */
export function useFeature(React, workbench, id) {
  const { createElement: h, useRef, useLayoutEffect, useSyncExternalStore } = React;
  const core = workbench.internal, { t } = core, api = core.clients[id], operation = workbench.operation;
  const snapshot = useSyncExternalStore(core.subscribe, core.snapshot, core.snapshot);
  const current = useRef({});
  useLayoutEffect(() => {
    const refresh = current.current.refresh ? workbench.onRefresh(options => current.current.refresh(options)) : null;
    const guard = current.current.guard ? workbench.guardLeave(() => current.current.guard()) : null;
    const block = core.registerBlock(id, () => current.current.blocked);
    return () => { refresh?.(); guard?.(); block(); };
  }, [workbench, id]);
  const run = (task, success) => workbench.run(task, success, error => current.current.onError?.(error));
  const button = (key, onClick, disabled = false, props = {}) => h('button', { type: 'button', onClick: (...args) => { workbench.notify(null); return onClick(...args); }, disabled: snapshot.busy || disabled, ...props }, t(key));
  const field = (key, value, onChange, props = {}) => h('label', { className: 'yj-field' }, t(key), h('input', { value, onChange: event => onChange(event.target.value), disabled: snapshot.busy, ...props }));
  return { api, t, notify: workbench.notify, busy: snapshot.busy, operation, run, setError: workbench.setError, button, field,
    row: (...children) => h('div', { className: 'yj-row' }, ...children), help: key => h('p', { className: 'yj-muted' }, t(key)),
    bind: handlers => { current.current = handlers; }, dirty: core.guarded(), openAssistant: prompt => workbench.assistant.open(prompt),
  };
}
