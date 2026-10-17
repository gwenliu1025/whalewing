// 呈现选择留在原右栏 owner；租约只持有引用，不改主会话选择或标签内容。
export const sidebarPresentation = `const views = new SidebarSessionViews(ctx.sessions);
const layout = ctx.layout;
const presentations = new Map();
let presentationStopped = false;
const effectiveSession = () => {
  const panelId = layout.panelInfo.getSnapshot().activePanelId;
  return panelId === null ? ctx.uiSession.adapter.current.getSnapshot().key : presentations.get(panelId)?.sessionId;
};
const syncPresentationSession = () => { views.select(effectiveSession()); };
const presentSession = (panelId, sessionId) => {
  if (presentationStopped) throw new Error('右栏呈现服务已释放');
  if (typeof panelId !== 'string' || panelId.trim() !== panelId || panelId.length === 0
    || typeof sessionId !== 'string' || sessionId.trim() !== sessionId || sessionId.length === 0) throw new Error('右栏呈现需要有效的面板与会话标识');
  if (presentations.has(panelId)) throw new Error('该面板已有右栏呈现租约');
  if (ctx.sessions.binding(sessionId) === undefined) throw new Error('右栏呈现会话尚未保留');
  const reference = ctx.sessions.retain(sessionId, { source: 'sidebarView' });
  void reference.ready.catch((error) => { console.error('右栏呈现会话读取失败：', error); });
  const lease = { sessionId, reference };
  presentations.set(panelId, lease);
  try { syncPresentationSession(); }
  catch (error) { presentations.delete(panelId); reference.release(); throw error; }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (presentations.get(panelId) !== lease) return;
    presentations.delete(panelId);
    try { if (!presentationStopped) syncPresentationSession(); }
    finally { reference.release(); }
  };
};
ctx.effect(() => {
  const current = ctx.uiSession.adapter.current;
  const offCurrent = current.subscribe(syncPresentationSession);
  const offPanel = layout.panelInfo.subscribe(syncPresentationSession);
  syncPresentationSession();
  return () => {
    presentationStopped = true;
    offCurrent(); offPanel();
    for (const lease of presentations.values()) lease.reference.release();
    presentations.clear();
    views.dispose();
  };
}, 'ui-sidebar-right: retained Session views');`;

export const presentSessionMethod = `presentSession(panelId, sessionId) {
  if (this.host.presentSession === undefined) throw new Error('右栏未连接外部会话呈现能力');
  return this.host.presentSession(panelId, sessionId);
}`;

function once(text, from, to) {
  if (text.split(from).length !== 2) throw new Error('右栏适配锚点次数不符：' + from.slice(0, 60));
  return text.replace(from, to);
}

export function convertSidebar(text) {
  const start = text.indexOf('const views = new SidebarSessionViews(ctx.sessions);');
  const end = text.indexOf('const layout = ctx.layout;', start) + 'const layout = ctx.layout;'.length;
  if (start < 0 || end < start) throw new Error('右栏呈现 owner 不存在');
  text = once(text, text.slice(start, end), sidebarPresentation);
  text = once(text, 'autoFullscreen: () => autoFullscreen,', 'autoFullscreen: () => autoFullscreen,\n\t\t\t\tpresentSession,');
  text = once(text, 'show(layout.panelInfo.getSnapshot().activePanelId === null ? selected?.sessionId : void 0);', 'show(selected?.sessionId);');
  text = once(text, 'function RightbarRoot({ usePanelInfo, useViews, ...props }) {\n\t\t\tconst visible = usePanelInfo((info) => info.activePanelId === null);', 'function RightbarRoot({ useViews, ...props }) {\n\t\t\tconst views = useViews((value) => value);\n\t\t\tconst visible = views.some((view) => view.selected);');
  text = once(text, 'children: useViews((value) => value).map((view) =>', 'children: views.map((view) =>');
  const openComment = '\t\t\t/**\n\t\t\t* Open a resource: claim it, place it, reveal the column, record the navigation.';
  return once(text, openComment, '\t\t\t/** 保留外部面板的会话呈现，释放只影响本租约。 */\n\t\t\t' + presentSessionMethod + '\n' + openComment);
}
