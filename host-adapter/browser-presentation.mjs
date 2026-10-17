function once(text, from, to) {
  if (text.split(from).length !== 2) throw new Error('浏览器呈现适配锚点次数不符：' + from.slice(0, 60));
  return text.replace(from, to);
}

// 只改变原右栏的几何状态；标签、guest 与身份仍由既有 owner 持有。
export const focusPresentationMethod = `focusPresentation(sessionId) {
  const mounted = this.require();
  if (mounted.sessionId !== sessionId) throw new Error('浏览器呈现会话已切换');
  const adoption = this.adopted.get(sessionId);
  const layout = adoption?.store.getSnapshot().bySession[sessionId]?.layout;
  if (adoption === undefined || layout === undefined) throw new Error('浏览器呈现尚未就绪');
  const existing = this.focusPresentations.get(sessionId);
  if (existing?.adoption === adoption) {
    mounted.actions.setMode(sessionId, 'fullscreen');
    mounted.actions.setExpanded(sessionId, true);
    return existing.release;
  }
  existing?.release();
  const original = { mode: layout.mode, expanded: layout.expanded };
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    this.focusPresentations.delete(sessionId);
    if (this.adopted.get(sessionId) !== adoption) return;
    mounted.actions.setMode(sessionId, original.mode);
    mounted.actions.setExpanded(sessionId, original.expanded);
  };
  this.focusPresentations.set(sessionId, { adoption, release });
  try {
    mounted.actions.setMode(sessionId, 'fullscreen');
    mounted.actions.setExpanded(sessionId, true);
  } catch (error) { release(); throw error; }
  return release;
}`;

/** 消费 convertSidebar 的输出；不改变既有会话呈现租约。 */
export function convertBrowserFocus(text) {
  if (text.includes('focusPresentations')) throw new Error('浏览器呈现适配锚点已存在');
  text = once(text, 'closeHandlers = /* @__PURE__ */ new Map();', 'closeHandlers = /* @__PURE__ */ new Map();\n\t\t\tfocusPresentations = new Map();');
  return once(text, '\t\t\tpresentSession(panelId, sessionId) {', '\t\t\t/** 临时聚焦原浏览器；幂等释放恢复捕获的布局而不关闭标签。 */\n\t\t\t' + focusPresentationMethod + '\n\t\t\tpresentSession(panelId, sessionId) {');
}

/** 工具栏只公开通用列表槽，厂商目录不进入宿主。 */
export function convertBrowserToolbar(text) {
  text = once(text,
    'useBrowserState, useStore, useTabInfo, t } = props;',
    'useBrowserState, useStore, useTabInfo, renderSlot, t } = props;');
  text = once(text,
    'children: (0, react_jsx_runtime.jsx)(SandboxPolicyIcon, { sandboxed })\n\t\t\t\t\t\t\t})',
    'children: (0, react_jsx_runtime.jsx)(SandboxPolicyIcon, { sandboxed })\n\t\t\t\t\t\t\t}),\n\t\t\t\t\t\t\trenderSlot("browser.toolbar.actions", { tabId: tab.id, active: tab.visible })');
  return once(text,
    'key: BROWSER_ID,\n\t\t\t\t\tlocale: namespace,',
    'key: BROWSER_ID,\n\t\t\t\t\tchildren: { "browser.toolbar.actions": { kind: "list", scope: "session" } },\n\t\t\t\t\tlocale: namespace,');
}
