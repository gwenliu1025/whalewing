import { parts } from '../features/index.js';
import { aiWebContract } from '../features/ai-web/contract.js';
import { aiWebEntries } from '../features/ai-web/catalog.js';
import { createModelWorldView } from '../src/model-world-view.js';
import { createUtilityViews } from '../src/utilities/views.js';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
let clientClosure;
const compiledClients = new Map(), compiledChunks = new Map();

function clientEntry(clientSource) {
  // 生成物测试没有源码闭包消费者；其余测试首次使用时仍实际构建，且只共享纯编译结果。
  if (!clientSource) clientClosure ??= buildSync({ entryPoints: [fileURLToPath(new URL('../src/shell/index.js', import.meta.url))], bundle: true, write: false, format: 'iife', globalName: 'fixtureShell', platform: 'browser', keepNames: true }).outputFiles[0].text;
  const source = clientSource ? `${clientSource}; return window.__ModuleLoader__.entry.factory(require);` : `${clientClosure}; return fixtureShell.createShell(require, validator, {});`;
  if (!compiledClients.has(source)) compiledClients.set(source, new Function('require', 'window', 'document', 'setTimeout', 'clearTimeout', 'validator', 'graph', source));
  return compiledClients.get(source);
}

function chunkEntry(source) {
  if (!compiledChunks.has(source)) compiledChunks.set(source, new Function('window', source));
  return compiledChunks.get(source);
}
import { knowledgeContract } from '../features/knowledge/contract.js';
import { skillLibraryContract } from '../features/skills/contract.js';
import { automationContract } from '../features/automation/contract.js';
import { newsContract } from '../features/cards/contract.js';
import { modelWorldContract } from '../features/model-world/contract.js';
import { createGraphCanvas } from '../src/graph-canvas.js';
import { z } from 'zod';
import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar';

const roles = [{ id: 'manager', name: '小鲸助手', description: '组织任务' }, { id: 'development', name: '研发专家', description: '修改工程' }].map(role => ({ ...role, revision: 0, builtin: true, avatar: null, prompt: '职责提示词', model: null, skills: [], mcpServers: [] }));
const emptyGraph = () => knowledgeContract(z).graphResult.parse({ version: 2, nodes: [], edges: [], total: 0, offset: 0, truncated: false, omittedEdges: 0, unresolved: 0 });
const success = (value) => ({ ok: true, value: { commandId: 'c1', result: { kind: 'success', text: JSON.stringify(value) } } });

/** 严格模拟Cordis的Remote注入边界；异步回调捕获的仍是登记时的scope。 */
function remoteScope(ctx, dependencies, denied = [], cleanups = [], pending = []) {
  const allowed = new Set(dependencies);
  const own = fn => { const cleanup = fn(); if (typeof cleanup !== 'function') return cleanup; let done = false; const release = () => { if (!done) { done = true; return cleanup(); } }; cleanups.push(release); return release; };
  const fork = (keys, fn) => {
    const nested = []; let disposed = false, ready = false;
    const child = remoteScope(ctx, [...allowed, ...keys], denied, nested, pending);
    const result = Promise.resolve(fn(child)).then(cleanup => { ready = true; if (typeof cleanup === 'function') { if (disposed) return cleanup(); nested.push(cleanup); } });
    pending.push(result);
    const dispose = () => { if (disposed) return; disposed = true; const release = () => Promise.all(nested.reverse().map(cleanup => cleanup())); return ready ? release() : result.then(release); };
    cleanups.push(dispose); return { dispose };
  };
  return new Proxy(ctx, { get(target, key) {
    if (key === 'remote') return new Proxy(target.remote, { get(remote, name) {
      if (typeof name === 'string' && !name.startsWith('$') && !allowed.has(`remote.${name}`)) {
        const message = `cannot get property "remote.${name}" without inject`;
        denied.push(message); throw new Error(message);
      }
      return Reflect.get(remote, name);
    } });
    if (key === 'effect') return own;
    if (key === 'slots') return new Proxy(target.slots, { get(slots, name) {
      if (name === 'inject') return (slot, fn) => { if (!ctx.missingSlots?.includes(slot)) own(fn); };
      return Reflect.get(slots, name);
    } });
    if (key === 'inject') return (keys, fn) => {
      if (keys.some(name => name.startsWith('remote.') ? !ctx.remote[name.slice(7)] : !ctx[name])) return { dispose: async () => {} };
      return fork(keys, fn);
    };
    if (key === 'plugin') return plugin => fork(plugin.inject ?? [], child => plugin.apply(child));
    return Reflect.get(target, key);
  } });
}

/** 只模拟已核验的宿主契约，不运行浏览器或创建真实会话。 */
async function fixture(overrides = {}) {
  const deniedRemote = [];
  const entries = new Map();
  const registrations = new Map();
  const triggerSources = new Map();
  const eventHandlers = new Map();
  const calls = [], remoteMounts = [];
  const presentations = [];
  const navigation = [];
  const headNodes = [];
  const document = { activeElement: null, head: { children: headNodes, appendChild(node) { headNodes.push(node); } }, createElement(tag) { assert.equal(tag, 'style', '核心只新增自己的样式元素'); return { textContent: '', remove() { const index = headNodes.indexOf(this); if (index >= 0) headNodes.splice(index, 1); } }; } };
  const sidebarRight = Object.hasOwn(overrides, 'sidebarRight') ? overrides.sidebarRight : { presentSession(panel, id) { presentations.push(['present', panel, id]); let released = false; return () => { if (!released) { released = true; presentations.push(['release', id]); } }; } };
  const disposed = [];
  const dictionaries = new Map();
  if (overrides.presetLocale) dictionaries.set('settings.agentPreset', { zh: overrides.presetLocale });
  const timers = new Map();
  let timerId = 0;
  const schedule = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
  let state = [];
  let refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let effects = [];
  let renderAgain = false, isolated = false;
  const childScopes = new Map();
  const storage = overrides.storage || new Map();
  const existing = overrides.existing || new Map();
  const workspaceCalls = [];
  const inputs = new Map();
  const workspaceState = overrides.workspaceState || { items: [{ workspaceId: 'default-workspace', path: 'E:\\默认工作区', sessionIds: [...existing.keys()] }] };
  const selected = new Map();
  const modelSelections = new Map();
  const automationClaims = overrides.automationClaims || new Map();
  const react = {
    Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = stateIndex++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      const owner = state;
      return [owner[index], (value) => { const next = typeof value === 'function' ? value(owner[index]) : value; if (!Object.is(next, owner[index])) renderAgain = true; owner[index] = next; }];
    },
    useRef(initial) {
      const index = refIndex++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useEffect(fn, deps) {
      const index = effectIndex++;
      if (!effects[index] || !deps || deps.some((value, i) => value !== effects[index].deps[i])) { effects[index]?.cleanup?.(); effects[index] = { fn, deps, pending: true }; }
    },
    useLayoutEffect(fn, deps) { react.useEffect(fn, deps); effects[effectIndex - 1].layout = true; },
    useSyncExternalStore(subscribe, get) { react.useLayoutEffect(() => subscribe(() => { renderAgain = true; }), [subscribe]); return get(); },
  };
  const store = (value) => { const listeners = new Set(); return { getSnapshot: () => value, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, set: next => { value = next; listeners.forEach(listener => listener()); } }; };
  const slotListeners = new Map(), localeListeners = new Set();
  const pendingPlugins = [];
  const ctx = {
    missingSlots: overrides.missingSlots,
    pluginNavigation: overrides.pluginNavigation,
    provide(name, value) { ctx[name] = value; },
    plugin(plugin) { plugin.apply(ctx); },
    get(name) { if (Object.hasOwn(ctx, name)) return ctx[name]; if (name === 'pluginNavigation') return undefined; if (name === 'sidebarRightTabs') return Object.hasOwn(overrides, 'browserTabs') ? overrides.browserTabs : { get: kind => kind === 'browser' ? { kind } : undefined }; if (name === 'uiSession') return { bindingSource(reference) { const input = inputFor(reference.sessionId); return { getSnapshot: () => ({ key: reference.sessionId, hooks: { input: input.state }, props: { inputActions: input.actions } }) }; } }; assert.equal(name, 'sidebarRight'); return sidebarRight; },
    on(name, callback) { const handlers = eventHandlers.get(name) || []; handlers.push(callback); eventHandlers.set(name, handlers); return () => eventHandlers.set(name, (eventHandlers.get(name) || []).filter(item => item !== callback)); },
    inputTriggers: { registerSource(source) { triggerSources.set(source.name, source); return () => triggerSources.delete(source.name); } },
    uiScheduleNavigation: { hide() { navigation.push('hide'); return () => navigation.push('restore'); } },
    effect(fn) { const cleanup = fn(); if (cleanup) disposed.push(cleanup); },
    locale: {
      language: 'zh',
      resolveText(value) { return typeof value === 'string' ? value : value[ctx.locale.language] ?? value.en ?? ''; },
      subscribe(listener) { localeListeners.add(listener); return () => localeListeners.delete(listener); },
      register(ns, values) { dictionaries.set(ns, values); return () => dictionaries.delete(ns); },
      bind: (ns) => (key, args = {}) => Object.entries(args).reduce((s, [name, value]) => s.replace(`{${name}}`, String(value)), dictionaries.get(ns)?.zh[key] || key),
    },
    slots: {
      inject(slot, fn) { if (!(overrides.missingSlots || []).includes(slot)) fn(); },
      entries(name) { return (registrations.get(name) || []).map(entry => entry.raw); },
      subscribe(name, listener) { const set = slotListeners.get(name) || new Set(); slotListeners.set(name, set); set.add(listener); return () => set.delete(listener); },
      register(options, Component) {
        // 列表保留每个 entry 的独立身份，only 选择和卸载不得退化成最后一项覆盖。
        const entry = { options, Component, raw: { component: Component, options: Object.fromEntries(['id', 'key', 'order', 'label', 'priority'].filter(key => Object.hasOwn(options, key)).map(key => [key, options[key]])) } }; entries.set(options.name, entry);
        const list = registrations.get(options.name) || []; registrations.set(options.name, [...list, entry]);
        slotListeners.get(options.name)?.forEach(fn => fn());
        return () => { registrations.set(options.name, registrations.get(options.name).filter(value => value !== entry)); slotListeners.get(options.name)?.forEach(fn => fn()); };
      },
    },
    sessions: { list: store({ byId: {} }), subagentAddress: () => undefined, retain: id => ({ sessionId: id, ready: overrides.retainReady || Promise.resolve(), binding: { session: { prompt: async (content, mode, signal = new AbortController().signal, requestId) => { for (const handler of eventHandlers.get('session/before-prompt') || []) await handler({ sessionId: id, signal }); return ctx.remote.session.prompt({ content, mode, sessionId: id, requestId }, signal); } } }, release: () => calls.push(['release', id]) }) },
    workspaces: {
      list: store({ archivedSessionIds: [], ...workspaceState }),
      initializeDefault: overrides.initializeDefault || (async (signal) => { assert.ok(signal instanceof AbortSignal); workspaceCalls.push(['default']); return workspaceState.items[0]; }),
      create: overrides.createWorkspace || (async ({ path }) => {
        workspaceCalls.push(['create', path]);
        let workspace = workspaceState.items.find((item) => item.path === path);
        if (!workspace) { workspace = { workspaceId: `workspace-${workspaceState.items.length + 1}`, path, sessionIds: [] }; workspaceState.items.push(workspace); }
        return workspace;
      }),
    },
    uiWorkspace: { openSession(id) { calls.push(['open', id]); } },
    remote: {
      pluginManager: overrides.pluginManager,
      $on(name, callback) { return ctx.on(name, callback); },
      $mount(contribution) { assert.equal(contribution.descriptors[0].result.mode, 'strict'); const name = contribution.descriptors[0].namespace; remoteMounts.push(['mount', name]); if (overrides.mount) return overrides.mount(contribution); return () => { remoteMounts.push(['unmount', name]); }; },
      whalewingExperts: { manage: async (input, signal) => { if (input.action === 'prepare_model') { const list = overrides.experts ? await overrides.experts({ action: 'list' }) : { value: { experts: roles } }; const role = list.value.experts.find(item => item.id === input.expertId); const model = role.model ?? { provider: 'fixture', model: 'default' }; const receipt = await ctx.remote.session.selectModel({ ...model, sessionId: input.sessionId, saveAsDefault: false }); if (receipt.ok) modelSelections.set(input.sessionId, receipt.value.selected); return receipt; } return (overrides.experts || (async input => { if (input.action === 'list') return { ok: true, value: { experts: roles, deleted: [] } }; if (input.action === 'catalog') return { ok: true, value: { models: [{ id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-flash', name: 'DeepSeek v4.1 flash' }] }], defaultModel: { provider: 'deepseek-official', model: 'deepseek-flash' }, skills: [], mcpServers: [], issues: [] } }; throw new Error('unexpected expert action'); }))(input, signal); } },
      whalewingKnowledge: { manageAiWeb: async (input, signal) => { aiWebContract(z).input.parse(input); calls.push(['aiWeb', input]); return overrides.aiWeb ? overrides.aiWeb(input, signal) : { ok: true, value: { entries: aiWebEntries } }; }, manageNews: async (input, signal) => { newsContract(z).manage.parse(input); calls.push(['news', input]); if (overrides.news) return overrides.news(input, signal); throw new Error('unexpected news action'); }, manageModelWorld: async (input, signal) => { modelWorldContract(z).input.parse(input); calls.push(['world', input]); if (overrides.world) return overrides.world(input, signal); throw new Error('unexpected world action'); }, manageAutomation: async (input, signal) => { automationContract(z).input.parse(input); if (input.action === 'directory') return { ok: true, value: { directory: overrides.taskDirectory || 'E:\\DSH\\whalewing-tasks' } }; calls.push(['automation', input]); if (overrides.automation) return overrides.automation(input, signal); if (input.action === 'catalog') return { ok: true, value: { available: true, tasks: [], legacyTasks: [], issues: [] } }; throw new Error('unexpected automation action'); }, manageSkills: async (input, signal) => { skillLibraryContract(z).input.parse(input); if (overrides.skillLibrary) return overrides.skillLibrary(input, signal); if (input.action === 'list') return { ok: true, value: { entries: [], offset: input.offset || 0, total: 0, truncated: false } }; throw new Error('unexpected skill library action'); }, manage: async (input, signal) => {
        calls.push(['knowledge', input]);
        if (overrides.knowledge) return overrides.knowledge(input, signal);
        if (overrides.execute) {
          const reply = await overrides.execute(undefined, '/whalewing ' + JSON.stringify(input), []);
          if (!reply.ok) return reply;
          if (reply.value.result.kind !== 'success') return { ok: false, error: JSON.parse(reply.value.result.text) };
          const value = JSON.parse(reply.value.result.text);
          if (input.action === 'document') Object.assign(value, { view: { type: 'text', value: value.content, line: 1 }, links: [], anchors: [], backlinks: [], totalBacklinks: 0 });
          return { ok: true, value };
        }
        if (input.action === 'graph') return { ok: true, value: emptyGraph() };
        if (input.action === 'search') return { ok: true, value: { notes: [], truncated: false, total: 0 } };
        return { ok: true, value: { initialized: true, root: 'fixture-vault' } };
      } },
      commands: { list: async (...args) => {
        calls.push(['lookup', args[0]]);
        // 原生桥接保留实参数量交给生成绑定校验；普通桩也不接纳额外signal。
        if (overrides.nativeCommandList) return overrides.nativeCommandList(...args);
        assert.equal(args.length, 1, 'commands.list只接收sessionId');
        return { ok: true, value: [] };
      }, execute: async (id, line, args) => {
        if (overrides.nativeCommands) return overrides.nativeCommands(id, line, args);
        if (line.startsWith('/whalewing-expert ')) {
          calls.push(['expert', id, JSON.parse(line.slice('/whalewing-expert '.length))]);
          if (overrides.expertExecute) { const reply = await overrides.expertExecute(id, line, args); const input = JSON.parse(line.slice('/whalewing-expert '.length)); if (reply.ok && reply.value?.result?.kind === 'success' && Object.hasOwn(input, 'expertId')) selected.set(id, JSON.parse(reply.value.result.text).expertId); return reply; }
          const input = JSON.parse(line.slice('/whalewing-expert '.length));
          if (Object.hasOwn(input, 'expertId')) selected.set(id, input.expertId);
          return success({ expertId: selected.get(id) ?? null });
        }
        const input = JSON.parse(line.slice('/whalewing '.length));
        if (input.action === 'workspace_attach') {
          calls.push(['attach', id, input]);
          if (overrides.attach) return overrides.attach(id, input);
          const workspaceId = 'host-workspace';
          let workspace = workspaceState.items.find((item) => item.workspaceId === workspaceId);
          if (!workspace) { workspace = { workspaceId, path: id.startsWith('whalewing-auto-') ? overrides.taskDirectory || 'E:\\DSH\\whalewing-tasks' : 'E:\\宿主实际目录', sessionIds: [] }; workspaceState.items.push(workspace); }
          if (!workspace.sessionIds.includes(id)) workspace.sessionIds.push(id);
          return success({ sessionId: id, workspaceId });
        }
        if (input.action === 'workbench_claim') { calls.push(['claim', id]); existing.set(id, true); return success({ claimed: true }); }
        if (input.action === 'workbench_confirm') { calls.push(['confirm', id]); if (overrides.confirmWorkbench) return overrides.confirmWorkbench(id); return success({ action: input.action, persisted: true }); }
        if (input.action === 'automation_claim') { calls.push(['automationClaim', id, input]); if (overrides.automationClaim) return overrides.automationClaim(id, input); automationClaims.set(id, input.purpose); return success({ action: input.action, purpose: input.purpose }); }
        if (overrides.execute) return overrides.execute(id, line, args);
        calls.push(['command', id, line, args]);
        if (input.action === 'search') return success({ notes: [] });
        if (input.action === 'list') return success({ skills: [] });
        if (input.action === 'sources') return success({ sources: [] });
        if (input.action === 'schedule_list') return success({ tasks: [] });
        return success({ initialized: true, root: 'fixture-vault' });
      } },
      agentPresets: { list: overrides.modes || (async () => ({ ok: true, value: { presets: [{ id: 'standard', name: '标准模式' }, { id: 'cordis', name: '创造模式' }] } })) },
      session: {
        selectModel: async input => ({ ok: true, value: { selected: { provider: input.provider, model: input.model, ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}) } } }),
        prompt: overrides.prompt || (async request => { calls.push(['prompt', request]); return { ok: true, value: { accepted: true } }; }),
        create: overrides.create || (async (request) => {
          const id = request.sessionId || 'new-session'; calls.push(['create', request]);
          if (!existing.has(id)) existing.set(id, false);
          const workspace = workspaceState.items.find((item) => item.workspaceId === request.workspaceId);
          if (workspace && !workspace.sessionIds.includes(id)) workspace.sessionIds.push(id);
          return { ok: true, value: { sessionId: id } };
        }),
        rename: overrides.rename || (async (request) => { calls.push(['rename', request]); return { ok: true, value: { title: request.title } }; }),
        projections: overrides.projections || (async ({ sessionId }) => { calls.push(['projections', sessionId]); return { ok: true, value: (existing.has(sessionId) || selected.has(sessionId)) ? { asOfSeq: 0, values: { whalewingAutomation: automationClaims.get(sessionId) ?? null, modelSelection: { next: modelSelections.get(sessionId) }, whalewingWorkbench: existing.get(sessionId) ?? false, whalewingExpert: { expertId: selected.get(sessionId) ?? null }, sessionListMetadata: { blank: true, lastPromptAt: null } } } : null }; }),
      },
    },
  };
  function inputFor(id) {
    if (!inputs.has(id)) {
      const state = store({ draft: '', draftRev: 0, phase: 'plain', attachmentIds: [], occurrences: [] });
      const inserts = [];
      const actions = {
        captureInsertion: () => ({ start: 0, end: state.getSnapshot().draft.length, draftRev: state.getSnapshot().draftRev }),
        insertText(text, span) {
          const current = state.getSnapshot();
          if (['adjudicating', 'submitting'].includes(current.phase) || current.draftRev !== span.draftRev || overrides.rejectInsert) return false;
          inserts.push({ text, span });
          state.set({ ...current, draft: current.draft.slice(0, span.start) + text + current.draft.slice(span.end), draftRev: current.draftRev + 1 });
          return true;
        },
        setDraft() { assert.fail('提议不得整体替换原生富草稿'); },
        submit() { assert.fail('提议不得自动发送'); },
      };
      inputs.set(id, { state, actions, inserts });
    }
    return inputs.get(id);
  }
  const load = name => {
    if (name === 'react') return react;
    if (name === 'zod') return { z };
    assert.fail(`插件不得导入内部客户端模块：${name}`);
  };
  load.async = overrides.loadChunk || (async name => {
    if (overrides.clientSource) {
      const source = overrides.chunkSources?.[name.slice(2)];
      assert.equal(typeof source, 'string', `生成物测试必须提供真实分块：${name}`);
      let registration;
      chunkEntry(source)({ __ModuleLoader__: { load: entry => { registration = entry; } } });
      assert.equal(registration.chunk, name.slice(2));
      return registration.factory(load);
    }
    if (name === './client.toolbox.js') return { createViews: React => createUtilityViews(React, 'fixture-worker') };
    if (name === './client.model-world.js') return { createView: React => createModelWorldView(React, {}) };
    assert.fail(`未登记分块：${name}`);
  });
  // 与生产生成方式一致：闭包外变量不会被偷偷依赖。
  const windowEvents = new Map();
  const browser = { innerWidth: 1440, innerHeight: 900, addEventListener(name, fn) { const listeners = windowEvents.get(name) || new Set(); listeners.add(fn); windowEvents.set(name, listeners); }, removeEventListener(name, fn) { windowEvents.get(name)?.delete(fn); }, matchMedia: overrides.matchMedia, location: { origin: overrides.origin || 'http://fixture.local' }, localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) } };
  // 分发测试执行完整 ModuleLoader 产物；业务测试继续使用同一真实模块闭包。
  if (overrides.clientSource) browser.__ModuleLoader__ = { load(entry) { this.entry = entry; } };
  // 每次重新执行函数体；模块工厂、全局对象、React状态与资源清理仍归本次fixture。
  const plugin = clientEntry(overrides.clientSource)(load, browser, document, schedule, id => timers.delete(id), { z, formatFileMention }, { createGraphCanvas });
  for (const [method, namespace] of Object.entries({ manageSkills: 'whalewingSkills', manageAutomation: 'whalewingAutomation', manageNews: 'whalewingCards', manageModelWorld: 'whalewingModelWorld', manageAiWeb: 'whalewingAiWeb' })) {
    ctx.remote[namespace] = { [method]: ctx.remote.whalewingKnowledge[method] };
    delete ctx.remote.whalewingKnowledge[method];
  }
  ctx.remote.whalewingCards.manageSchedules = async (input, signal) => {
    newsContract(z).scheduleInput.parse(input);
    calls.push(['automation', input]);
    if (overrides.automation) return overrides.automation(input, signal);
    throw new Error('unexpected news schedule action');
  };
  let featureFrame = overrides.featureFrame || { revision: 0, features: parts.map((part, index) => ({ instance: index + 1, id: part.id, kind: part.kind, api: 1, package: 'dsh-whalewing', skills: [] })) };
  const featureStreams = new Set();
  ctx.remote.whalewingWorkbench = {
    features: async () => ({ ok: true, value: featureFrame }),
    retryBase: overrides.retryBase || (async () => ({ ok: true, value: featureFrame })),
    async *watchFeatures(signal) {
      yield featureFrame;
      while (!signal.aborted) {
        const value = await new Promise(resolve => {
          const send = frame => { signal.removeEventListener('abort', abort); featureStreams.delete(send); resolve(frame); };
          const abort = () => send(null);
          featureStreams.add(send); signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
        if (value) yield value;
      }
    },
  };
  Object.assign(ctx.remote.whalewingWorkbench, overrides.workbenchRemote);
  for (const name of overrides.missingRemotes || []) delete ctx.remote[name];
  const cleanup = await plugin.apply(remoteScope(ctx, plugin.inject, deniedRemote, disposed, pendingPlugins));
  if (typeof cleanup === 'function') disposed.push(cleanup);
  const settlePlugins = async () => { for (let i = 0; i < 8; i++) { await Promise.all(pendingPlugins); await new Promise(setImmediate); } };
  await settlePlugins();
  const featureUpdate = async frame => { featureFrame = frame; for (const send of [...featureStreams]) send(frame); await settlePlugins(); };
  const page = entries.get('main');
  const t = ctx.locale.bind('whalewing');
  const props = { ...page.options.inject(), t };
  // 常规业务用例预热专家缓存；挂载失败用例须由真实页面观察故障，不额外强行读取。
  if (overrides.preloadExperts !== false && !overrides.missingRemotes?.includes('whalewingExperts')) await props.clients.experts.loadExperts();
  // 子组件持有独立 hooks；从正式 Workbench 取得组件和 props，不另造接线。
  function expand(tree, path = 'root', inside = false, seen = new Set()) {
    if (!tree || typeof tree !== 'object') return tree;
    if (Array.isArray(tree)) return tree.map((node, index) => expand(node, `${path}/${node?.props?.key === undefined ? index : 'key:' + node.props.key}`, inside, seen));
    const feature = typeof tree.type === 'function' && ['FeatureGate', 'DeferredFeature', 'TabContent', 'ExtensionsSection', 'ExtensionList', 'ExpertsView', 'KnowledgeView', 'SkillsView', 'AutomationView', 'CardsView', 'AssistantDock', 'AiWebFeature', 'ToolboxFeature', 'ModelWorldFeature'].includes(tree.type.name);
    // 分发产物会压缩函数名，递归执行真实组件，不依赖源码中的调试名称。
    if (typeof tree.type === 'function' && (overrides.clientSource || feature || inside || ['ModelWorldView', 'WorkspacePicker', 'Modal', 'ConfirmDialog', 'Drawer', 'Toast', 'ExpertPicker', 'BookReader', ...(overrides.expand || [])].includes(tree.type.name))) {
      const id = `${path}/${tree.type.name}/${tree.props.key ?? ''}`; seen.add(id);
      const local = childScopes.get(id) || { state: [], refs: [], effects: [] }; childScopes.set(id, local);
      const previous = [state, refs, effects, stateIndex, refIndex, effectIndex];
      [state, refs, effects] = [local.state, local.refs, local.effects]; stateIndex = refIndex = effectIndex = 0;
      const output = tree.type(tree.props);
      [state, refs, effects, stateIndex, refIndex, effectIndex] = previous;
      return expand(output, id, !feature, seen);
    }
    const result = { ...tree, props: { ...tree.props, children: expand(tree.props?.children, path + '/children', inside, seen) } };
    // React 在导航事件后提交新页，再执行其 layout effect；异步刷新由这个真实页实例接续。
    if (result.props['data-tab'] && result.props.onClick) { const click = result.props.onClick; result.props.onClick = (...args) => { const value = click(...args); render(); return value; }; }
    return result;
  }
  function render(slot = 'main', extra = {}, attempt = 0) {
    assert.deepEqual(deniedRemote, [], '已执行的Remote消费者必须全部声明依赖，即使页面捕获了错误');
    renderAgain = false;
    stateIndex = 0; refIndex = 0; effectIndex = 0;
    const entry = entries.get(slot);
    const seen = new Set();
    const renderSlot = (name, props = {}, select = {}) => {
      if (!name.startsWith('whalewing.workbench.')) return extra.renderSlot?.(name, props, select) || { type: name, props: { children: [] } };
      const list = (registrations.get(name) || []).filter(item => !select.only || item.options.id === select.only).slice().sort((a, b) => (a.options.order || 0) - (b.options.order || 0));
      return list.map(item => ({ type: item.Component, props: { key: item.options.id, children: [], ...item.options.inject?.(), ...props, t } }));
    };
    const page = entry.Component({ SessionProvider: 'SessionProvider', ...entry.options.inject?.(), t, ...extra, renderSlot });
    // 报错、成功和恢复入口改在右上角提示里显示；主页面渲染时一并带上，断言的是员工实际能看到的内容。
    const overlay = slot === 'main' && entries.get('shell.overlay');
    const tree = expand(overlay ? { type: 'fragment', props: { children: [page, { type: overlay.Component, props: {} }] } } : page, slot, false, seen);
    for (const [id, local] of childScopes) if (id.startsWith(slot + '/') && !seen.has(id)) { local.effects.forEach(effect => effect.cleanup?.()); childScopes.delete(id); }
    for (const list of [...[...childScopes.values()].reverse().map(local => local.effects), effects]) for (const effect of list) if (effect.pending && effect.layout) { effect.pending = false; effect.cleanup = effect.fn(); }
    if (renderAgain) { assert.ok(attempt < 10, 'layout effect 应在有限次提交内收敛'); return render(slot, extra, attempt + 1); }
    return tree;
  }
  function flushEffects() { for (const list of [effects, ...(isolated ? [] : [...childScopes.values()].map(local => local.effects))]) for (const effect of list) if (effect.pending) { effect.pending = false; effect.cleanup = effect.fn(); } }
  function unmount() { for (const list of [effects, ...[...childScopes.values()].map(local => local.effects)]) list.forEach(effect => effect.cleanup?.()); state = []; refs = []; effects = []; childScopes.clear(); isolated = false; }
  function isolate(node) { isolated = true; state.length = 0; refs.length = 0; effects.length = 0; return () => { stateIndex = 0; refIndex = 0; effectIndex = 0; return node.type(node.props); }; }
  return { remoteMounts, featureUpdate, settlePlugins, react, localeListeners, registrations, document, navigation, inputFor, inputs, browser, windowEvents, presentations, eventHandlers, triggerSources, ctx, calls, entries, disposed, dictionaries, timers, plugin, bridge: props.bridge, clients: props.clients, workbenchSession: props.workbenchSession, render, isolate, flushEffects, unmount, storage, existing, automationClaims, workspaceCalls, workspaceState };
}

export { fixture, remoteScope, roles, emptyGraph, success };
