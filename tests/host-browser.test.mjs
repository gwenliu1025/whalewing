import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { convertSidebar } from '../host-adapter/sidebar.mjs';
import { convertBrowserFocus, convertBrowserToolbar } from '../host-adapter/browser-presentation.mjs';

const baseline = new URL('../../../.artifacts/youjin-first-version/runtime/node_modules/@deepseek-ai/', import.meta.url);
const sidebar = await readFile(new URL('dsh-client-ui-sidebar-right/lib/client.js', baseline), 'utf8');
const browser = await readFile(new URL('dsh-client-ui-sidebar-browser/lib/client.js', baseline), 'utf8');
const convertedSidebar = convertBrowserFocus(convertSidebar(sidebar));
const convertedBrowser = convertBrowserToolbar(browser);
function region(text, start, end) {
  const first = text.indexOf(start), last = text.indexOf(end, first);
  assert.ok(first >= 0 && last > first);
  return text.slice(first, last);
}

function fixture({ mode = 'push', expanded = false, narrow = false } = {}) {
  let mounted = 'ai'; const calls = [];
  const tabs = { kept: { id: 'kept', kind: 'browser' } };
  const layout = { mode, expanded, tabs };
  const actions = {
    setMode(id, value) { calls.push(['mode', id, value]); layout.mode = value; },
    setExpanded(id, value) { calls.push(['expanded', id, value]); layout.expanded = value; },
  };
  const adoption = { store: { getSnapshot: () => ({ bySession: { ai: { layout } } }), actions } };
  const adopted = new Map([['ai', adoption]]);
  // 执行转换后的原 controller；仅注入原状态与动作边界，不复制聚焦算法。
  const Controller = vm.runInNewContext(region(convertedSidebar, 'var SidebarRightController = class', '//#endregion') + '\nSidebarRightController', { TabDomain: class {} });
  const controller = new Controller({}, () => {}, { autoFullscreen: () => narrow }, { adopted, rooms: new Map(), onScreen: { getSnapshot: () => mounted } });
  return { controller, layout, calls, adopted, adoption, setMounted: value => { mounted = value; } };
}

test('同版基线、转换语法及锚点拒收，不让未知构建取得适配', () => {
  assert.equal(createHash('sha256').update(browser).digest('hex'), 'e1a730a5087b946273280e135f9cd2718d2c2ce98aa30d3ffc53f5da2abf2136');
  new vm.Script(convertedSidebar); new vm.Script(convertedBrowser);
  assert.throws(() => convertBrowserFocus(convertedSidebar), /锚点/);
  assert.throws(() => convertBrowserToolbar(convertedBrowser), /锚点/);
  assert.throws(() => convertBrowserToolbar(browser.replace('useBrowserState, useStore, useTabInfo, t } = props;', 'unknown')), /锚点/);
});

for (const narrow of [false, true]) test(`聚焦重复进入不翻转或收起，释放恢复原状态；窄屏=${narrow}`, () => {
  const f = fixture({ narrow });
  const tabs = f.layout.tabs;
  const release = f.controller.focusPresentation('ai');
  assert.equal(f.layout.mode, 'fullscreen'); assert.equal(f.layout.expanded, true);
  assert.equal(f.controller.focusPresentation('ai'), release);
  assert.equal(f.layout.mode, 'fullscreen'); assert.equal(f.layout.expanded, true);
  release(); assert.equal(f.layout.mode, 'push'); assert.equal(f.layout.expanded, false);
  const count = f.calls.length; release(); assert.equal(f.calls.length, count);
  assert.equal(f.layout.tabs, tabs); assert.equal(f.controller.focusPresentations.size, 0);
});

test('原全屏与展开状态保持，换屏释放只恢复捕获会话，不导航标签', () => {
  const f = fixture({ mode: 'fullscreen', expanded: true });
  const release = f.controller.focusPresentation('ai');
  f.setMounted('other'); release();
  assert.equal(f.layout.mode, 'fullscreen'); assert.equal(f.layout.expanded, true);
  assert.equal(f.calls.some(call => call[1] !== 'ai'), false);
  assert.throws(() => f.controller.focusPresentation('ai'), /no session surface is mounted/);
});

test('错误身份与未挂载明确拒收，释放不触碰重建后的同名 store', () => {
  const f = fixture();
  assert.throws(() => f.controller.focusPresentation('other'), /会话已切换/);
  const release = f.controller.focusPresentation('ai');
  f.adopted.set('ai', { ...f.adoption });
  const count = f.calls.length; release(); assert.equal(f.calls.length, count);
  const next = f.controller.focusPresentation('ai'); assert.notEqual(next, release); next();
  f.adopted.clear(); assert.throws(() => f.controller.focusPresentation('ai'), /no session surface is mounted/);
});

test('工具栏是原 BrowserBody 内的 session 通用槽，转交当前标签可见性', () => {
  const jsx = (type, props) => ({ type, props }); let slot;
  const Body = vm.runInNewContext(region(convertedBrowser, 'function BrowserBody(props)', '//#endregion') + '\nBrowserBody', {
    react: { useEffect() {}, useLayoutEffect() {}, useRef: value => ({ current: value }), useId: () => 'viewport', useState: value => [value, () => {}] },
    react_jsx_runtime: { jsx, jsxs: jsx },
    Browser_module_css_default: {},
    _deepseek_ai_dsh_client_ui_primitives: {},
    useBrowserDraft: () => ['', () => {}],
    currentBrowserTarget: () => undefined,
    EMPTY_FRAME: {},
  });
  const tab = { id: 'kept', visible: true, navigation: {}, actions: {} };
  Body({ useStore: read => read({ byTab: {} }), useTabInfo: () => ({ tab }), useBrowserState: () => undefined, t: key => key, renderSlot: (...args) => { slot = args; } });
  assert.deepEqual(JSON.parse(JSON.stringify(slot)), ['browser.toolbar.actions', { tabId: 'kept', active: true }]);
  assert.ok(convertedBrowser.includes('children: { "browser.toolbar.actions": { kind: "list", scope: "session" } }'));
  assert.ok(!convertedBrowser.includes('ChatGPT'));
  // 插槽适配没有改 guest 生命周期、初次导航或加载观测。
  assert.equal(region(convertedBrowser, 'var ElectronWebViewImpl = class', '//#endregion'), region(browser, 'var ElectronWebViewImpl = class', '//#endregion'));
});
