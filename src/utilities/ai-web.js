import { readAvatarFile } from '../avatar-image.js';
import { aiWebIcons } from './ai-web-icons.js';

/** 只持有经核验的官方地址；登录、额度与网页内容均由厂商和宿主浏览器持有。 */
export const aiWebEntries = Object.freeze([
  { id: 'deepseek', name: 'DeepSeek', provider: '深度求索', url: 'https://chat.deepseek.com/', description: '问答、写作与代码交流', keywords: '深度求索 代码' },
  { id: 'doubao', name: '豆包', provider: '字节跳动', url: 'https://www.doubao.com/chat/', description: '日常问答与内容创作', keywords: 'doubao 字节' },
  { id: 'kimi', name: 'Kimi', provider: '月之暗面', url: 'https://www.kimi.com/', description: '阅读资料与整理思路', keywords: '月之暗面 kimi' },
  { id: 'qianwen', name: '千问', provider: '阿里巴巴', url: 'https://www.qianwen.com/', description: '通用问答与办公辅助', keywords: '通义 qwen 千问 阿里' },
  { id: 'yuanbao', name: '腾讯元宝', provider: '腾讯', url: 'https://yuanbao.tencent.com/', description: '提问、搜索与资料阅读', keywords: '腾讯 yuanbao' },
  { id: 'qingyan', name: '智谱清言', provider: '智谱', url: 'https://www.chatglm.cn/', description: '通用问答与内容整理', keywords: '清华 智谱 glm zhipu' },
  { id: 'wenxin', name: '文心助手', provider: '百度', url: 'https://wenxin.baidu.com/', description: '工作与学习问答', keywords: '百度 文心一言' },
  { id: 'chatgpt', name: 'ChatGPT', provider: 'OpenAI', url: 'https://chatgpt.com/', description: '问答、写作与资料分析', keywords: 'openai gpt' },
  { id: 'gemini', name: 'Gemini', provider: 'Google', url: 'https://gemini.google.com/', description: '通用问答与创意交流', keywords: 'google 谷歌' },
  { id: 'claude', name: 'Claude', provider: 'Anthropic', url: 'https://claude.ai/', description: '写作、分析与代码交流', keywords: 'anthropic claude' },
].map(entry => Object.freeze({ ...entry, avatar: aiWebIcons[entry.id].data, builtin: true, revision: 0 })));

/** 输入、存储与客户端读回共享入口字段和 URL 校验。 */
export function aiWebContract(z) {
  const text = z.string(), id = text.regex(/^(?:[a-z][a-z0-9-]{0,79})$/);
  const url = text.trim().min(1).max(2048).refine(value => {
    try { const parsed = new URL(value); return ['https:', 'http:'].includes(parsed.protocol) && !!parsed.hostname && !parsed.username && !parsed.password && !/[\u0000-\u0020\u007f]/u.test(value); }
    catch { return false; }
  }, '网址须为不含账号密码的完整 HTTP 或 HTTPS 地址').transform(value => new URL(value).href);
  const fields = z.strictObject({ name: text.trim().min(1).max(80), url, description: text.trim().max(400).default(''), avatar: text.max(700000).nullable().default(null) });
  const revision = z.number().int().nonnegative();
  const entry = fields.extend({ id, revision, builtin: z.boolean(), provider: text.max(100), keywords: text.max(400) });
  const input = z.discriminatedUnion('action', [z.strictObject({ action: z.literal('list') }),
    z.strictObject({ action: z.literal('save'), id: text.regex(/^custom-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/), expectedRevision: revision, entry: fields }),
    z.strictObject({ action: z.literal('remove'), id, expectedRevision: revision })]);
  const result = z.strictObject({ entries: z.array(entry).max(210) });
  const packageName = 'dsh-whalewing/ai-web';
  const descriptor = { id: `${packageName}#whalewingKnowledge/manageAiWeb`, service: 'whalewing', namespace: 'whalewingKnowledge', method: 'manageAiWeb', invocation: { kind: 'direct' }, parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#AiWebInput`, create: () => input } }], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#AiWebResult`, create: () => result } };
  return { input, result, stored: entry.extend({ builtin: z.literal(false) }), host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor] } };
}

export function findAiWebEntries(query = '', entries = aiWebEntries) {
  const words = String(query).trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return entries.filter(entry => words.every(word => `${entry.name} ${entry.provider} ${entry.description} ${entry.keywords}`.toLocaleLowerCase().includes(word)));
}

/** 仅把目录中的官方地址交给宿主异步准备后的 openTab；入口 id 用来让同一个 AI 只占一个网页标签。不代理网络或补建浏览器。 */
export async function openAiWebsite(id, openBrowser, signal, entries = aiWebEntries) {
  const entry = entries.find(item => item.id === id);
  if (!entry) throw new Error('此 AI 入口不存在，请重新选择');
  if (typeof openBrowser !== 'function') throw new Error('DSH 浏览器尚未就绪，请启用宿主浏览器后重试');
  signal?.throwIfAborted();
  await openBrowser(entry.url, signal, entry.id);
  signal?.throwIfAborted();
  return entry;
}

/** 组件可常驻挂载；隐藏时没有网络、登录或会话初始化动作。 */
export function createAiWebView(React) {
  const { createElement: h, useState, useRef, useEffect, useSyncExternalStore } = React;
  const avatar = entry => entry.avatar ? h('img', { src: entry.avatar, alt: '', width: 48, height: 48, className: 'yj-avatar', style: { objectFit: 'contain', background: 'white', padding: 6, boxSizing: 'border-box' } }) : h('span', { className: 'yj-avatar', 'aria-hidden': true, style: { display: 'grid', placeItems: 'center', width: 48, height: 48, fontSize: 22, background: 'var(--dsw-alias-interactive-bg-hover)' } }, Array.from(entry.name.trim())[0] || 'AI');
  function Editor({ entry, removing, manageAiWeb, onSaved, onClose, notify }) {
    const [draft, setDraft] = useState(() => ({ name: entry?.name ?? '', url: entry?.url ?? '', description: entry?.description ?? '', avatar: entry?.avatar ?? null }));
    const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [recovery, setRecovery] = useState(null);
    // 报错走右上角提示，不在表单底部插入一行。
    const setError = message => { if (message) notify?.(message, { kind: 'error' }); };
    const identity = useRef(entry ?? { id: `custom-${globalThis.crypto.randomUUID()}`, revision: 0 });
    const dialog = useRef(null), lock = useRef(false), alive = useRef(true), uploadTask = useRef(null), request = useRef(null);
    useEffect(() => {
      const previous = globalThis.document?.activeElement;
      alive.current = true;
      try { dialog.current?.showModal(); } catch { setError('编辑窗口打开失败，请关闭后重试'); }
      return () => { alive.current = false; uploadTask.current?.abort(); request.current?.abort(); dialog.current?.close(); previous?.focus(); };
    }, []);
    const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
    const upload = async event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      uploadTask.current?.abort();
      const controller = new AbortController(); uploadTask.current = controller; setUploading(true);
      try { const value = await readAvatarFile(file, { signal: controller.signal }); if (alive.current && !controller.signal.aborted) { update('avatar', value); setError(''); } }
      catch (reason) { if (alive.current && !controller.signal.aborted) setError(reason.message); }
      finally { if (alive.current && uploadTask.current === controller) { uploadTask.current = null; setUploading(false); } }
    };
    const save = async event => {
      event?.preventDefault();
      if (lock.current || uploading) return;
      lock.current = true; setBusy(true); setError('');
      const controller = new AbortController(); request.current = controller;
      try {
        const value = await manageAiWeb(removing ? { action: 'remove', id: identity.current.id, expectedRevision: identity.current.revision } : { action: 'save', id: identity.current.id, expectedRevision: identity.current.revision, entry: draft }, controller.signal);
        if (!alive.current) return;
        const actual = value.entries.find(item => item.id === identity.current.id);
        if (removing ? !!actual : !actual || actual.revision <= identity.current.revision) throw new Error('保存读回未确认，请刷新核对；表单已保留');
        onSaved(value.entries); onClose();
        notify?.(removing ? `已删除“${entry.name}”` : entry ? `已保存“${draft.name.trim()}”的修改` : `已添加“${draft.name.trim()}”`);
      } catch (reason) {
        if (!alive.current || controller.signal.aborted) return;
        setError(reason.message);
        try {
          const value = await manageAiWeb({ action: 'list' }, controller.signal);
          if (!alive.current) return;
          onSaved(value.entries);
          const actual = value.entries.find(item => item.id === identity.current.id);
          if (removing && !actual) { onClose(); notify?.(`已删除“${entry.name}”`); return; }
          if (actual && actual.revision !== identity.current.revision) setRecovery(actual);
        } catch { /* 保留草稿与固定身份；读回失败不自动再次写入。 */ }
      } finally { lock.current = false; if (alive.current) setBusy(false); }
    };
    const close = () => { if (!lock.current) onClose(); };
    return h('dialog', { ref: dialog, className: removing ? 'yj-modal yj-confirm yj-page' : 'yj-editor yj-page', 'aria-label': removing ? '删除 AI 入口' : entry ? '编辑 AI 入口' : '添加 AI 入口', onCancel: event => { event.preventDefault(); close(); }, onClick: event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } } },
      h('header', { className: 'yj-header' }, h('h2', null, removing ? '删除 AI 入口' : entry ? '编辑 AI 入口' : '添加 AI 入口'), h('button', { type: 'button', disabled: busy, onClick: close, 'aria-label': '关闭 AI 入口编辑' }, '×')),
      h('form', { onSubmit: save, className: 'yj-editor-body' }, removing ? h('p', null, `确认删除“${entry.name}”？网站账号及浏览器会话保持不变`) : h(React.Fragment, null,
        h('div', { className: 'yj-avatar-picker' }, avatar(draft), h('div', { className: 'yj-avatar-side' },
          h('div', { className: 'yj-avatar-actions' }, h('label', { className: 'yj-avatar-upload' }, '上传头像', h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', disabled: busy || uploading, onChange: upload })), h('button', { type: 'button', disabled: busy || uploading, onClick: () => update('avatar', null) }, '使用名字首字')),
          h('p', { className: 'yj-help' }, 'PNG、JPEG 或 WebP，不超过 512 KiB；宽和高均须小于 300 像素'))),
        ...[['name', '名字', 80], ['url', '网址', 2048], ['description', '描述（选填）', 400]].map(([key, label, maxLength]) => h('label', { key, className: 'yj-field' }, label, h('input', { type: key === 'url' ? 'url' : 'text', required: key !== 'description', autoFocus: key === 'name', maxLength, value: draft[key], disabled: busy, placeholder: key === 'url' ? 'https://…' : '', onChange: event => update(key, event.target.value) })))),
        recovery && h('p', { className: 'yj-notice' }, '发现已保存的版本，当前输入仍保留', h('button', { type: 'button', disabled: busy, onClick: () => { identity.current = recovery; setDraft({ name: recovery.name, url: recovery.url, description: recovery.description, avatar: recovery.avatar }); setRecovery(null); setError(''); } }, '加载已保存版本')),
        h('footer', { className: 'yj-dialog-actions' }, h('button', { type: 'button', disabled: busy, onClick: close }, '取消'), h('button', { type: 'submit', disabled: busy || uploading || !!recovery, className: removing ? 'yj-danger' : 'yj-primary' }, busy ? '正在保存…' : uploading ? '正在检查头像…' : removing ? '确认删除' : entry ? '保存修改' : '添加'))));
  }
  // 工具栏是当前工作台的只读投影，不取得会话、登录或导航的第二 owner。
  let toolbar = null;
  const listeners = new Set();
  const publish = value => { toolbar = value; for (const listener of listeners) listener(); };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const snapshot = () => toolbar;
  const select = (selected, busy, onSelect, catalog = aiWebEntries) => h('select', {
    'aria-label': '切换 AI 厂商', value: selected, disabled: busy,
    onChange: event => { const entry = catalog.find(item => item.id === event.target.value); if (entry) return onSelect(entry); },
    style: { width: 'min(132px, 24vw)', minWidth: 0, height: 28, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)', border: '.5px solid var(--dsw-alias-border-l2)', borderRadius: 'var(--dsw-radius-sm)', font: 'var(--dsw-font-xxs-12)' },
  }, h('option', { value: '', disabled: true }, '选择 AI'), ...catalog.map(entry => h('option', { key: entry.id, value: entry.id }, entry.name)));
  function Toolbar({ sessionId, active: tabActive = true }) {
    const value = useSyncExternalStore(subscribe, snapshot, snapshot);
    if (!value?.active || !tabActive || value.sessionId !== sessionId) return null;
    const style = { height: 28, color: 'var(--dsw-alias-label-secondary)', background: 'transparent', border: 0, borderRadius: 'var(--dsw-radius-sm)', whiteSpace: 'nowrap', font: 'var(--dsw-font-xxs-12)' };
    return h('div', { 'aria-label': 'AI 网页快捷入口', style: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 } },
      select(value.selected, value.busy, value.open, value.catalog),
      value.busy && h('button', { type: 'button', style, onClick: value.cancel, 'aria-label': '取消打开' }, '取消'),
      h('button', { type: 'button', style, onClick: value.back }, '返回工作台'),
      value.failure && h('button', { type: 'button', style, title: value.failure.message, onClick: value.back, 'aria-label': '打开失败，返回工作台重试' }, '打开失败'));
  }
  function AiWebView({ active = true, sessionId, openBrowser, focusBrowser, restoreBrowser, manageAiWeb, notify, ActionMenu }) {
    const [query, setQuery] = useState('');
    const [failure, setFailureValue] = useState(null);
    const setFailure = value => {
      const next = typeof value === 'function' ? value(failure) : value;
      setFailureValue(next);
      if (next && next !== failure) notify?.(`${next.entry?.name ?? 'DSH 浏览器'}：${next.message}`, { kind: 'error', action: { label: '重试打开', run: () => prepare(next.entry, next.resumeOnly) } });
    };
    const [opened, setOpened] = useState('');
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState('');
    const [catalog, setCatalog] = useState(aiWebEntries), [loading, setLoading] = useState(false), [editor, setEditor] = useState(null);
    // 失败只在右上角提示，并给出重试；不在卡片上方插入整行把卡片往下挤。
    const setCatalogError = message => { if (message) notify?.(message, { kind: 'error', action: { label: '刷新入口', run: () => refresh() } }); };
    const loadingRequest = useRef(null), catalogCurrent = useRef(aiWebEntries);
    const pending = useRef(null), live = useRef(active);
    live.current = active;
    const back = () => { if (live.current) { pending.current?.abort(new Error('已返回工作台')); restoreBrowser?.(); } };
    const cancel = () => { pending.current?.abort(new Error('员工取消打开')); setBusy(false); };
    useEffect(() => {
      live.current = active;
      if (!active) { pending.current?.abort(new Error('已离开 AI 网页')); setBusy(false); }
      return () => { live.current = false; pending.current?.abort(new Error('AI 网页已关闭或切换')); };
    }, [active]);
    const acceptCatalog = entries => {
      catalogCurrent.current = entries;
      setCatalog(entries);
      setSelected(current => entries.some(entry => entry.id === current) ? current : '');
      setFailure(current => current?.entry && !entries.some(entry => entry.id === current.entry.id) ? null : current);
      setOpened('');
      setCatalogError('');
    };
    const acceptSaved = entries => {
      // 写后权威读回替代更早发出的列表；即使取消未被传输层执行，旧请求也失去接纳权。
      loadingRequest.current?.abort();
      loadingRequest.current = null;
      setLoading(false);
      acceptCatalog(entries);
    };
    const refresh = async () => {
      if (!live.current || !manageAiWeb) return;
      loadingRequest.current?.abort();
      const controller = new AbortController(); loadingRequest.current = controller; setLoading(true);
      try { const value = await manageAiWeb({ action: 'list' }, controller.signal); if (live.current && loadingRequest.current === controller && !controller.signal.aborted) acceptCatalog(value.entries); }
      catch (reason) { if (live.current && loadingRequest.current === controller && !controller.signal.aborted) setCatalogError(reason.message); }
      finally { if (loadingRequest.current === controller && live.current) setLoading(false); }
    };
    useEffect(() => { if (active) void refresh(); return () => loadingRequest.current?.abort(); }, [active, manageAiWeb]);
    const entries = findAiWebEntries(query, catalog);
    // 打开与继续共用一次准备动作，取消沿同一 signal 进入 Workbench 的有界挂载门。
    const prepare = async (entry, resumeOnly = false) => {
      if (!live.current || pending.current) return;
      // 旧按钮闭包不授予已删除目录项导航权；清理选择而不关闭宿主持有的网页标签。
      entry = catalogCurrent.current.find(current => current.id === entry?.id);
      if (!entry) { setSelected(''); setOpened(''); setFailure(null); setCatalogError('此 AI 入口已不存在，请重新选择'); return; }
      const controller = new AbortController();
      pending.current = controller;
      setBusy(true);
      setFailure(null);
      try {
        if (resumeOnly) {
          if (typeof focusBrowser !== 'function') throw new Error('DSH 浏览器尚未就绪，请稍后重试');
          await focusBrowser(controller.signal);
        } else await openAiWebsite(entry.id, openBrowser, controller.signal, catalog);
        if (!live.current || controller.signal.aborted) return;
        if (!resumeOnly && catalogCurrent.current.some(current => current.id === entry.id)) {
          setSelected(entry.id);
          setOpened(`已请求在 DSH 浏览器中打开 ${entry.name}`);
        }
      } catch (error) {
        if (!live.current || controller.signal.aborted) return;
        setFailure({ entry, resumeOnly, message: error instanceof Error ? error.message : '打开未完成，请检查 DSH 浏览器后重试' });
      } finally {
        if (pending.current === controller) pending.current = null;
        if (live.current) setBusy(false);
      }
    };
    const open = entry => prepare(entry);
    useEffect(() => {
      publish(active && sessionId ? { active, sessionId, selected, busy, failure, open, cancel, back, catalog } : null);
    });
    useEffect(() => () => publish(null), []);
    const resume = () => {
      if (!live.current || !selected) return;
      return prepare(catalog.find(entry => entry.id === selected), true);
    };
    const entryMenu = entry => ActionMenu ? h(ActionMenu, { label: `${entry.name} · 入口操作`, iconOnly: true },
      h('button', { type: 'button', onClick: () => setEditor({ entry }), disabled: !active || !manageAiWeb }, '编辑'),
      h('button', { type: 'button', onClick: () => setEditor({ entry, removing: true }), disabled: !active || !manageAiWeb }, '删除'))
      : h('div', { className: 'yj-row' }, h('button', { type: 'button', onClick: () => setEditor({ entry }), disabled: !active || !manageAiWeb, 'aria-label': `编辑 ${entry.name}` }, '编辑'), h('button', { type: 'button', onClick: () => setEditor({ entry, removing: true }), disabled: !active || !manageAiWeb, 'aria-label': `删除 ${entry.name}` }, '删除'));
    const status = busy && h('span', { className: 'yj-ai-status', role: 'status' }, h('span', { className: 'yj-spinner', 'aria-hidden': true }), '正在打开', h('button', { type: 'button', onClick: cancel }, '取消打开'));
    return h('section', { hidden: !active, 'aria-label': 'AI 网页', className: 'yj-ai-web' },
      selected ? h('div', { className: 'yj-ai-head' }, select(selected, busy, open, catalog),
        h('button', { type: 'button', disabled: busy || !active, onClick: resume }, '继续使用'), h('button', { type: 'button', disabled: busy, onClick: () => { restoreBrowser?.(); setSelected(''); } }, '管理 AI 入口'), status)
        : h('div', { className: 'yj-ai-head' }, h('h2', null, 'AI 网页'), status,
          h('label', { className: 'yj-ai-search' }, h('span', null, '查找 AI'), h('input', { type: 'search', value: query, placeholder: '名称、厂商或用途', onChange: event => setQuery(event.target.value) }))),
      !selected && h('div', { className: 'yj-grid' }, ...entries.map(entry => h('article', { key: entry.id, className: 'yj-card yj-ai-card' },
        h('div', { className: 'yj-card-top' }, avatar(entry), h('div', { className: 'yj-card-identity' }, h('h3', null, entry.name), entry.provider ? h('small', null, entry.provider) : !entry.builtin && h('small', null, '自定义')), !entry.builtin && entryMenu(entry)),
        entry.description && h('p', null, entry.description),
        h('p', { className: 'yj-help', style: { overflowWrap: 'anywhere' } }, new URL(entry.url).hostname),
        h('button', { type: 'button', className: 'yj-card-start', disabled: busy || !active, onClick: () => open(entry), 'aria-label': `打开 ${entry.name}` }, '打开'))),
        // 添加入口与“添加专家”同一种卡片；搜索没有结果时也保留，方便直接补上。
        !query.trim() && h('button', { type: 'button', className: 'yj-card yj-add-card', disabled: !active || !manageAiWeb || loading, onClick: () => setEditor({ entry: null }), 'aria-haspopup': 'dialog' }, h('span', { className: 'yj-add-mark', 'aria-hidden': true }, '+'), h('h2', null, '添加 AI'))),
      !selected && query.trim() && !entries.length && h('p', { className: 'yj-muted', role: 'status' }, '没有匹配的 AI 入口，换个关键词试试'),
      active && editor && h(Editor, { key: editor.entry?.id ?? 'new', ...editor, manageAiWeb, notify, onSaved: acceptSaved, onClose: () => setEditor(null) }));
  }
  AiWebView.Toolbar = Toolbar;
  return AiWebView;
}
