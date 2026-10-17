import test from 'node:test';
import assert from 'node:assert/strict';
import { aiWebEntries, findAiWebEntries, openAiWebsite, createAiWebView } from '../src/utilities/ai-web.js';

test('官方目录名称唯一，仅包含不带凭据的 HTTPS 入口', () => {
  assert.equal(new Set(aiWebEntries.map(entry => entry.id)).size, aiWebEntries.length);
  assert.equal(aiWebEntries.length, 10);
  for (const entry of aiWebEntries) {
    const url = new URL(entry.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username + url.password + url.search + url.hash, '');
    assert.ok(Object.isFrozen(entry));
  }
  assert.ok(Object.isFrozen(aiWebEntries));
  for (const id of ['chatgpt', 'deepseek', 'doubao', 'qingyan', 'kimi']) assert.ok(aiWebEntries.some(entry => entry.id === id));
});

test('搜索按全部关键词匹配名称、厂商或用途，空结果不补造入口', () => {
  assert.deepEqual(findAiWebEntries(' OPENAI gPt ').map(entry => entry.id), ['chatgpt']);
  assert.deepEqual(findAiWebEntries('清华').map(entry => entry.id), ['qingyan']);
  assert.deepEqual(findAiWebEntries('不存在的站点'), []);
  assert.equal(findAiWebEntries('').length, 10);
});

test('唯一打开动作使用目录地址，拒收任意 URL，原样传播宿主错误', async () => {
  const calls = [];
  assert.equal((await openAiWebsite('chatgpt', url => calls.push(url))).id, 'chatgpt');
  assert.deepEqual(calls, ['https://chatgpt.com/']);
  await assert.rejects(() => openAiWebsite('https://example.com/', url => calls.push(url)), /不存在/u);
  await assert.rejects(() => openAiWebsite('chatgpt'), /尚未就绪/u);
  const error = new Error('browser tab 未注册');
  await assert.rejects(() => openAiWebsite('kimi', () => { throw error; }), value => value === error);
  assert.equal(calls.length, 1);
});

// 该夹具只检查组件交互契约；真实宿主打开及登录由隔离浏览器验收证明。
function fixture(openBrowser, options = {}) {
  const viewHooks = { states: [], refs: [], effects: [] }, editorHooks = { states: [], refs: [], effects: [] };
  let { states, refs, effects } = viewHooks;
  let cursor = 0, ri = 0, ei = 0;
  const selectHooks = hooks => { ({ states, refs, effects } = hooks); cursor = ri = ei = 0; };
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children: children.flat().filter(child => child !== false && child != null) } }; },
    useRef(initial) { return refs[ri++] ||= { current: initial }; },
    useEffect(fn, deps) { const i = ei++, old = effects[i]; if (!old || !deps || deps.some((d, j) => d !== old.deps[j])) { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; } },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useState(initial) { const target = states, index = cursor++; if (!(index in target)) target[index] = typeof initial === 'function' ? initial() : initial; return [target[index], value => { target[index] = typeof value === 'function' ? value(target[index]) : value; }]; },
  };
  const View = createAiWebView(React);
  // 报错与“重试”改在右上角提示里：把当前提示接在渲染结果末尾，断言员工实际能看到的内容。
  let toast = null;
  const notify = (message, extra = {}) => { toast = message ? { message, ...extra } : null; };
  const withToast = tree => !toast ? tree : { ...tree, props: { ...tree.props, children: [...tree.props.children, { type: 'div', props: { role: toast.kind === 'error' ? 'alert' : 'status', children: [toast.message, ...(toast.action ? [{ type: 'button', props: { onClick: () => { const action = toast.action; toast = null; return action.run(); }, children: [toast.action.label] } }] : [])] } }] } };
  return { render(active = true, sessionId = 'ai-session') { selectHooks(viewHooks); return withToast(View({ active, sessionId, openBrowser, notify, ...options })); }, editor(element) { selectHooks(editorHooks); return withToast(element.type(element.props)); }, toast: () => toast, toolbar(sessionId = 'ai-session', active = true) { return View.Toolbar({ sessionId, active }); }, unmount() { for (const hooks of [viewHooks, editorHooks]) for (const effect of hooks.effects) effect.cleanup?.(); } };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...(tree.props?.children || []).flatMap(nodes)];
}

test('仅点击才打开，隐藏页陈旧按钮无效，成功文案不冒称登录通过', async () => {
  const calls = [];
  const f = fixture(url => calls.push(url));
  const first = f.render();
  assert.equal(calls.length, 0);
  await nodes(first).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  assert.deepEqual(calls, ['https://www.kimi.com/']);
  // 打开后直接切到浏览器里的网页，不再额外弹“已请求打开”的提示。
  f.render(); assert.equal(nodes(f.toolbar()).find(node => node.type === 'select').props.value, 'kimi');
  const hidden = f.render(false);
  assert.equal(hidden.props.hidden, true);
  nodes(hidden).find(node => node.type === 'button').props.onClick();
  assert.equal(calls.length, 1);
});

test('宿主失败保留完整目录和网址，原位重试成功，搜索空态仍可恢复', async () => {
  let fail = true;
  const f = fixture(() => { if (fail) throw new Error('浏览器未注册'); });
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 DeepSeek').props.onClick();
  const failed = f.render();
  assert.equal(nodes(failed).filter(node => node.type === 'article').length, 10);
  assert.ok(nodes(failed).some(node => node.props.role === 'alert'));
  assert.ok(nodes(failed).some(node => node.props.role === 'alert' && node.props.children[0].includes('DeepSeek')));
  nodes(f.render()).find(node => node.type === 'input').props.onChange({ target: { value: '无此服务' } });
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 0);
  nodes(f.render()).find(node => node.type === 'input').props.onChange({ target: { value: '' } });
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 10);
  fail = false;
  await nodes(failed).find(node => node.type === 'button' && node.props.children[0] === '重试打开').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.props.role === 'alert'), false);
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 0);
  assert.equal(nodes(f.render()).filter(node => node.type === 'select').length, 1);
});

test('打开后只保留紧凑选择，工具栏按租约会话投射，返回和继续不重新导航', async () => {
  const calls = []; let restores = 0, focuses = 0;
  const f = fixture(url => calls.push(url), { restoreBrowser: () => restores++, focusBrowser: () => focuses++ });
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  const opened = f.render();
  assert.equal(nodes(opened).filter(node => node.type === 'article').length, 0);
  assert.equal(nodes(f.toolbar()).find(node => node.type === 'select').props.value, 'kimi');
  assert.equal(f.toolbar('other-session'), null);
  assert.equal(f.toolbar('ai-session', false), null);
  nodes(f.toolbar()).find(node => node.props.children.includes('返回工作台')).props.onClick();
  await nodes(opened).find(node => node.props.children.includes('继续使用')).props.onClick();
  assert.equal(restores, 1); assert.equal(focuses, 1); assert.equal(calls.length, 1);
  f.render(false); assert.equal(f.toolbar(), null);
  f.render(); f.unmount(); assert.equal(f.toolbar(), null);
});

test('厂商切换仍走同一受控打开入口，失败保留原选择和完整重试网址', async () => {
  let fail = false; const calls = [];
  const f = fixture(url => { calls.push(url); if (fail) throw new Error('标签打开失败'); });
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  f.render(); fail = true;
  await nodes(f.toolbar()).find(node => node.type === 'select').props.onChange({ target: { value: 'deepseek' } });
  const failed = f.render();
  assert.equal(nodes(f.toolbar()).find(node => node.type === 'select').props.value, 'kimi');
  assert.ok(nodes(failed).some(node => node.props.role === 'alert' && node.props.children[0].includes('DeepSeek')));
  fail = false;
  await nodes(failed).find(node => node.props.children.includes('重试打开')).props.onClick();
  f.render(); assert.equal(nodes(f.toolbar()).find(node => node.type === 'select').props.value, 'deepseek');
  assert.equal(calls.length, 3);
});


test('异步准备完成才显示成功，重复点击不并发，拒绝后保留重试', async () => {
  const wait = Promise.withResolvers(); let calls = 0;
  const f = fixture(async () => { calls++; await wait.promise; });
  const click = () => nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  const pending = click(); await click(); assert.equal(calls, 1);
  assert.equal(JSON.stringify(f.render()).includes('已请求在 DSH 浏览器中打开 Kimi'), false);
  wait.reject(new Error('挂载失败')); await pending;
  assert.ok(JSON.stringify(f.render()).includes('挂载失败')); assert.ok(JSON.stringify(f.render()).includes('重试打开'));
});

for (const exit of ['cancel', 'hide', 'unmount']) test('AI网页准备期间' + exit + '取消向宿主传播且迟到结果不显示成功', async () => {
  const wait = Promise.withResolvers(); let signal;
  const f = fixture(async (_url, received) => { signal = received; await wait.promise; });
  const pending = nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  if (exit === 'cancel') nodes(f.render()).find(node => node.type === 'button' && node.props.children.includes('取消打开')).props.onClick();
  else if (exit === 'hide') f.render(false); else f.unmount();
  assert.equal(signal.aborted, true); wait.resolve(); await pending;
  assert.equal(JSON.stringify(f.render(false)).includes('已请求在 DSH 浏览器中打开 Kimi'), false);
});

for (const exit of ['cancel', 'back', 'hide', 'unmount']) test(`点击继续使用后${exit}取消同一准备，迟到结果不聚焦也不新增标签`, async t => {
  const ready = Promise.withResolvers(); let signal, focuses = 0, preparations = 0, opens = 0, restores = 0;
  const f = fixture(() => opens++, {
    focusBrowser: async received => { preparations++; signal = received; await ready.promise; received.throwIfAborted(); focuses++; },
    restoreBrowser: () => restores++,
  });
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  const resume = nodes(f.render()).find(node => node.props.children.includes('继续使用'));
  const pending = resume.props.onClick();
  t.after(async () => { f.unmount(); ready.resolve(); await pending; });
  const busy = f.render();
  assert.equal(nodes(busy).find(node => node.props.children.includes('继续使用')).props.disabled, true);
  await resume.props.onClick(); assert.equal(preparations, 1);
  if (exit === 'cancel') nodes(busy).find(node => node.type === 'button' && node.props.children.includes('取消打开')).props.onClick();
  else if (exit === 'back') nodes(f.toolbar()).find(node => node.props.children.includes('返回工作台')).props.onClick();
  else if (exit === 'hide') f.render(false); else f.unmount();
  assert.equal(signal.aborted, true);
  ready.resolve(); await pending;
  assert.equal(focuses, 0); assert.equal(opens, 1); assert.equal(restores, exit === 'back' ? 1 : 0);
  assert.equal(nodes(f.render(false)).some(node => node.props.role === 'alert'), false);
});

test('继续使用失败保留选择，重试仍只恢复呈现且最终释放忙碌状态', async () => {
  let fail = true, focuses = 0, opens = 0; const signals = [];
  const f = fixture(() => opens++, { focusBrowser: async signal => {
    signals.push(signal); signal.throwIfAborted();
    if (fail) throw new Error('原浏览器尚未挂载');
    focuses++;
  } });
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  await nodes(f.render()).find(node => node.props.children.includes('继续使用')).props.onClick();
  const failed = f.render();
  assert.ok(JSON.stringify(failed).includes('原浏览器尚未挂载'));
  assert.equal(nodes(failed).find(node => node.type === 'select').props.value, 'kimi');
  fail = false;
  await nodes(failed).find(node => node.props.children.includes('重试打开')).props.onClick();
  const restored = f.render();
  assert.equal(focuses, 1); assert.equal(opens, 1);
  assert.equal(signals.length, 2); assert.notEqual(signals[0], signals[1]);
  assert.equal(nodes(restored).find(node => node.props.children.includes('继续使用')).props.disabled, false);
  assert.equal(nodes(restored).some(node => node.props.role === 'alert'), false);
});

test('默认十项显示离线官方图标且无删除按钮，自定义首字和选填描述按持久结果展示', async () => {
  const custom = { id: 'custom-fixture', name: '办公助手', url: 'https://example.com/', description: '', avatar: null, provider: '', keywords: '', builtin: false, revision: 1 };
  const f = fixture(() => {}, { manageAiWeb: async () => ({ entries: [...aiWebEntries, custom] }) });
  const initial = f.render();
  assert.equal(nodes(initial).filter(node => node.type === 'img' && node.props.src.startsWith('data:image/png;base64,')).length, 10);
  assert.equal(nodes(initial).filter(node => node.props['aria-label']?.startsWith('删除 ')).length, 0);
  await Promise.resolve();
  const loaded = f.render();
  const card = nodes(loaded).find(node => node.type === 'article' && nodes(node).some(child => child.type === 'h3' && child.props.children.includes('办公助手')));
  assert.ok(nodes(card).some(node => node.type === 'span' && node.props.children.includes('办')));
  assert.equal(nodes(card).filter(node => node.type === 'p').length, 1);
  assert.equal(nodes(loaded).filter(node => node.props['aria-label']?.startsWith('编辑 ')).length, 1);
  assert.equal(nodes(loaded).filter(node => node.props['aria-label']?.startsWith('删除 ')).length, 1);
  nodes(card).find(node => node.props['aria-label'] === '编辑 办公助手').props.onClick();
  const modal = nodes(f.render()).find(node => typeof node.type === 'function');
  assert.equal(modal.props.entry, custom); assert.equal(modal.props.removing, undefined);
});

test('持久目录读取失败保留默认目录，刷新恢复自定义入口；隐藏后取消目录读', async () => {
  let fail = true, signal;
  const f = fixture(() => {}, { manageAiWeb: async (_input, value) => { signal = value; if (fail) throw new Error('目录读取失败'); return { entries: aiWebEntries }; } });
  f.render(); await Promise.resolve();
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 10);
  assert.ok(nodes(f.render()).some(node => node.props.role === 'alert' && node.props.children.includes('目录读取失败')));
  fail = false; await nodes(f.render()).find(node => node.props.children.includes('刷新入口')).props.onClick();
  assert.equal(nodes(f.render()).filter(node => node.props.role === 'alert').length, 0);
  f.render(false); assert.equal(signal.aborted, true); f.unmount();
});

// 通过实际 Editor 保存回调与可控 Promise 建立竞争，不依赖时间延迟或仅检查源码。
const customEntry = { id: 'custom-fixture', name: '旧名字', url: 'https://example.com/', description: '', avatar: null, provider: '', keywords: '', builtin: false, revision: 1 };
const button = (tree, text) => nodes(tree).find(node => node.type === 'button' && node.props.children.includes(text));
const dialogElement = tree => nodes(tree).find(node => typeof node.type === 'function');

test('他客户端删除所选入口后清理目录选择，陈旧继续按钮不操作宿主标签也不崩溃', async t => {
  let entries = [...aiWebEntries, customEntry], opens = 0, focuses = 0, restores = 0;
  const f = fixture(() => opens++, { manageAiWeb: async () => ({ entries }), focusBrowser: () => { focuses++; throw new Error('原浏览器尚未挂载'); }, restoreBrowser: () => restores++ });
  t.after(() => f.unmount());
  f.render(); await Promise.resolve();
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 旧名字').props.onClick();
  const stale = button(f.render(), '继续使用');
  entries = aiWebEntries; f.render(false); f.render(); await Promise.resolve();
  assert.equal(button(f.render(), '继续使用'), undefined);
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 10);
  await stale.props.onClick();
  assert.ok(JSON.stringify(f.render()).includes('此 AI 入口已不存在'));
  assert.equal(opens, 1); assert.equal(focuses, 0); assert.equal(restores, 0);
  assert.equal(nodes(f.toolbar()).find(node => node.type === 'select').props.value, '');
});

for (const late of ['resolve', 'reject']) test(`Editor 已保存读回使早发 list 失效，迟到 ${late} 不回滚新名称或产生旧错误`, async t => {
  const pending = Promise.withResolvers(); let lists = 0, listSignal, saved;
  const newer = { ...customEntry, name: '新名字', revision: 2 };
  const f = fixture(() => {}, { manageAiWeb: async (input, signal) => {
    if (input.action === 'list') { if (++lists === 1) return { entries: [...aiWebEntries, customEntry] }; listSignal = signal; return pending.promise; }
    saved = input; return { entries: [...aiWebEntries, newer] };
  } });
  t.after(() => { pending.resolve({ entries: aiWebEntries }); f.unmount(); });
  f.render(); await Promise.resolve(); f.render(false); f.render();
  nodes(f.render()).find(node => node.props['aria-label'] === '编辑 旧名字').props.onClick();
  const modal = dialogElement(f.render());
  nodes(f.editor(modal)).find(node => node.type === 'input' && node.props.value === '旧名字').props.onChange({ target: { value: '新名字' } });
  await nodes(f.editor(modal)).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved.entry.name, '新名字'); assert.equal(saved.expectedRevision, 1); assert.equal(listSignal.aborted, true);
  assert.ok(nodes(f.render()).some(node => node.props['aria-label'] === '编辑 新名字'));
  if (late === 'resolve') pending.resolve({ entries: [...aiWebEntries, customEntry] }); else pending.reject(new Error('已失效读取失败'));
  await pending.promise.catch(() => {}); await Promise.resolve();
  assert.ok(nodes(f.render()).some(node => node.props['aria-label'] === '编辑 新名字'));
  assert.equal(nodes(f.render()).some(node => node.props['aria-label'] === '编辑 旧名字'), false);
  assert.equal(JSON.stringify(f.render()).includes('已失效读取失败'), false);
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 11);
});

test('编辑冲突读回保留草稿，可显式加载已保存版本并按新修订重试', async t => {
  const actual = { ...customEntry, name: '他客户端名字', revision: 2 }; let lists = 0, attempts = 0;
  const f = fixture(() => {}, { manageAiWeb: async input => {
    if (input.action === 'list') return { entries: [...aiWebEntries, ++lists === 1 ? customEntry : actual] };
    if (++attempts === 1) throw new Error('版本冲突');
    assert.equal(input.expectedRevision, 2); assert.equal(input.entry.name, actual.name);
    return { entries: [...aiWebEntries, { ...actual, revision: 3 }] };
  } });
  t.after(() => f.unmount()); f.render(); await Promise.resolve();
  nodes(f.render()).find(node => node.props['aria-label'] === '编辑 旧名字').props.onClick();
  const modal = dialogElement(f.render());
  nodes(f.editor(modal)).find(node => node.type === 'input' && node.props.value === '旧名字').props.onChange({ target: { value: '未保存草稿' } });
  await nodes(f.editor(modal)).find(node => node.type === 'form').props.onSubmit();
  const failed = f.editor(modal);
  assert.ok(JSON.stringify(failed).includes('版本冲突'));
  assert.ok(nodes(failed).some(node => node.type === 'input' && node.props.value === '未保存草稿'));
  assert.equal(button(failed, '保存修改').props.disabled, true);
  button(failed, '加载已保存版本').props.onClick();
  assert.ok(nodes(f.editor(modal)).some(node => node.type === 'input' && node.props.value === actual.name));
  await nodes(f.editor(modal)).find(node => node.type === 'form').props.onSubmit();
  assert.equal(dialogElement(f.render()), undefined); assert.equal(attempts, 2);
});

test('正常切回接纳新目录，旧取消 list 不覆盖新读回，原选择与恢复网页保留', async t => {
  const delayed = Promise.withResolvers(); let calls = 0, focuses = 0, opens = 0;
  const updated = { ...customEntry, name: '更新名称', revision: 2 };
  const f = fixture(() => opens++, { focusBrowser: () => focuses++, manageAiWeb: async () => {
    calls++; return calls === 2 ? delayed.promise : { entries: [...aiWebEntries, calls === 1 ? customEntry : updated] };
  } });
  t.after(() => { delayed.resolve({ entries: [...aiWebEntries, customEntry] }); f.unmount(); });
  f.render(); await Promise.resolve();
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 旧名字').props.onClick();
  f.render(false); f.render(); f.render(false); f.render(); await Promise.resolve();
  delayed.resolve({ entries: [...aiWebEntries, customEntry] }); await delayed.promise; await Promise.resolve();
  const current = f.render();
  assert.equal(nodes(current).find(node => node.type === 'select').props.value, customEntry.id);
  assert.ok(nodes(current).some(node => node.type === 'option' && node.props.children.includes('更新名称')));
  await button(current, '继续使用').props.onClick(); assert.equal(focuses, 1); assert.equal(opens, 1);
});
