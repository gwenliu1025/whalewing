import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRuntime, transformFiles } from '../host-adapter/adapter.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const runtime = process.env.WHALEWING_HOST_ADAPTER_BASELINE ?? path.join(repository, '.artifacts/youjin-first-version/runtime');
const original = await readRuntime(runtime);
const file = 'node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/client.js';
const before = original.get(file).toString('utf8');
const after = transformFiles(original).files.get(file).toString('utf8');

function store(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    set(next) { value = next; for (const listener of [...listeners]) listener(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    listeners,
  };
}

function region(text, start, end) {
  const first = text.indexOf(start);
  const last = text.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `缺少编译源码片段：${start}`);
  return text.slice(first, last);
}

function fixture(t, text = after) {
  const current = store({ key: 'native' });
  const panelInfo = store({ activePanelId: 'whalewing' });
  const mounted = store(undefined);
  const references = [];
  const bindings = new Map(['native', 'assistant', 'next'].map(id => [id, {}]));
  const cleanups = [];
  const sessions = {
    binding: id => bindings.get(id),
    retain(id, options) {
      assert.equal(options.source, 'sidebarView');
      const reference = { id, releases: 0, ready: Promise.resolve(), release() { this.releases++; } };
      references.push(reference);
      return reference;
    },
  };
  const ctx = { sessions, layout: { panelInfo }, uiSession: { adapter: { current } }, effect(fn) { cleanups.push(fn()); } };
  // 执行真实编译 owner；仅注入 store/会话分配边界，不复制呈现选择或生命周期算法。
  const source = [
    region(text, 'var SidebarSessionView = class', '//#region ../../util/crypto'),
    region(text, 'var SidebarRightController = class', '//#region ../../../node_modules/.pnpm/picomatch'),
    region(text, 'function RightbarRoot(', '//#endregion'),
    region(text, 'const views = new SidebarSessionViews(ctx.sessions);', 'let autoFullscreen = false;'),
    region(text, 'ctx.effect(() => {\n\t\t\t\tconst sync = () => {\n\t\t\t\t\tconst selected = views.source', 'const disposeRegistry ='),
    '({ views, presentSession: typeof presentSession === "undefined" ? undefined : presentSession, SidebarRightController, RightbarRoot })',
  ].join('\n');
  const actual = vm.runInNewContext(source, {
    ctx, show: id => mounted.set(id), console,
    _deepseek_ai_dsh_client_store: { createSnapshotStore: store },
    TabDomain: class {},
    SessionView: 'SessionView',
    react_jsx_runtime: { Fragment: 'Fragment', jsx: (type, props, key) => ({ type, props, key }) },
  });
  const adopted = new Map([...bindings.keys()].map(id => [id, { store: { actions: { id } } }]));
  const controller = new actual.SidebarRightController({}, () => {}, { presentSession: actual.presentSession }, {
    adopted, rooms: new Map(), onScreen: mounted, openTabs: store([]),
  });
  const opened = [];
  // 资源提供者边界只记录转交，地址和行参数仍由真实 openResource/require 路径传递。
  controller.placeResource = (...args) => opened.push(args);
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; for (const cleanup of cleanups.reverse()) cleanup?.(); };
  t.after(dispose);
  return {
    ...actual, controller, current, panelInfo, mounted, references, bindings, opened, dispose,
    rendered: () => actual.RightbarRoot({ useViews: select => select(actual.views.source.getSnapshot()), usePanelInfo: select => select(panelInfo.getSnapshot()) }).props.children,
  };
}

test('原失败复现，租约使来源链接进入助手原生右栏，行参数原样保留', t => {
  const baseline = fixture(t, before);
  assert.throws(() => baseline.controller.openResource('dsh-resource://file/source.md'), /no session surface is mounted/);
  const f = fixture(t);
  assert.throws(() => f.controller.openResource('dsh-resource://file/source.md'), /no session surface is mounted/);
  const release = f.controller.presentSession('whalewing', 'assistant');
  assert.equal(f.mounted.getSnapshot(), 'assistant');
  assert.equal(f.current.getSnapshot().key, 'native');
  assert.equal(f.rendered().find(element => element.props.view.selected).props.visible, true);
  const options = { params: { line: 17, endLine: 20 } };
  f.controller.openResource('dsh-resource://file/source.md', options);
  assert.equal(f.opened[0][0], 'assistant');
  assert.equal(f.opened[0][1].id, 'assistant');
  assert.equal(f.opened[0][2], 'dsh-resource://file/source.md');
  assert.equal(f.opened[0][3], options);
  release();
  assert.equal(f.mounted.getSnapshot(), undefined);
  assert.throws(() => f.controller.openResource('dsh-resource://file/source.md'), /no session surface is mounted/);
});

test('活动面板、主会话选择、离开返回与后台租约不互相抢占', t => {
  const f = fixture(t);
  const release = f.controller.presentSession('whalewing', 'assistant');
  f.panelInfo.set({ activePanelId: 'other' });
  assert.equal(f.mounted.getSnapshot(), undefined);
  assert.ok(f.rendered().every(element => !element.props.visible));
  f.current.set({ key: 'next' });
  assert.equal(f.mounted.getSnapshot(), undefined);
  f.panelInfo.set({ activePanelId: 'whalewing' });
  assert.equal(f.mounted.getSnapshot(), 'assistant');
  f.panelInfo.set({ activePanelId: null });
  assert.equal(f.mounted.getSnapshot(), 'next');
  f.controller.openResource('dsh-resource://file/native.md');
  assert.equal(f.opened[0][0], 'next');
  release();
  assert.equal(f.mounted.getSnapshot(), 'next');
  assert.equal(f.current.getSnapshot().key, 'next');
});

test('无效标识、未保留会话与重复租约拒收，不改变已有展示', t => {
  const f = fixture(t);
  for (const [panel, id] of [['', 'assistant'], [' whalewing', 'assistant'], [1, 'assistant'], ['whalewing', ''], ['whalewing', null], ['whalewing', 'unknown']]) {
    assert.throws(() => f.controller.presentSession(panel, id));
    assert.equal(f.mounted.getSnapshot(), undefined);
    assert.equal(f.references.length, 0);
  }
  const release = f.controller.presentSession('whalewing', 'assistant');
  const count = f.references.length;
  assert.throws(() => f.controller.presentSession('whalewing', 'next'), /已有/);
  assert.equal(f.references.length, count);
  assert.equal(f.mounted.getSnapshot(), 'assistant');
  release();
  const nextRelease = f.controller.presentSession('whalewing', 'next');
  release();
  assert.equal(f.mounted.getSnapshot(), 'next');
  nextRelease(); nextRelease();
  f.dispose();
  assert.ok(f.references.every(reference => reference.releases === 1));
  assert.equal(f.current.listeners.size, 0);
  assert.equal(f.panelInfo.listeners.size, 0);
  assert.throws(() => f.controller.presentSession('whalewing', 'assistant'), /释放/);
});

test('已访问标签保留原 view，关闭与 React 卸载按原 owner 释放', t => {
  const f = fixture(t);
  const release = f.controller.presentSession('whalewing', 'assistant');
  const selected = f.views.source.getSnapshot().find(view => view.selected);
  const unmount = f.views.mount(selected.reference);
  const lifetime = new AbortController();
  const releaseTab = selected.retainTab('source-tab', lifetime.signal);
  f.panelInfo.set({ activePanelId: null });
  assert.equal(f.mounted.getSnapshot(), 'native');
  assert.equal(f.views.source.getSnapshot().find(view => view.sessionId === 'assistant').reference, selected.reference);
  f.panelInfo.set({ activePanelId: 'whalewing' });
  assert.equal(f.views.source.getSnapshot().find(view => view.selected).reference, selected.reference);
  release();
  assert.ok(f.rendered().every(element => !element.props.visible));
  assert.equal(selected.reference.releases, 0);
  lifetime.abort(); releaseTab();
  assert.equal(f.views.source.getSnapshot().length, 0);
  assert.equal(selected.reference.releases, 0);
  unmount();
  assert.equal(selected.reference.releases, 1);
  f.dispose();
  assert.ok(f.references.every(reference => reference.releases === 1));
});

test('服务卸载释放所有租约，晚到 cleanup 不重复释放', t => {
  const f = fixture(t);
  const first = f.controller.presentSession('whalewing', 'assistant');
  const second = f.controller.presentSession('other', 'next');
  f.dispose(); first(); second();
  assert.equal(f.mounted.getSnapshot(), undefined);
  assert.equal(f.views.source.getSnapshot().length, 0);
  assert.ok(f.references.every(reference => reference.releases === 1));
  assert.equal(f.current.listeners.size, 0);
  assert.equal(f.panelInfo.listeners.size, 0);
});
