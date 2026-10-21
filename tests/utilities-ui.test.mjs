import test from 'node:test';
import assert from 'node:assert/strict';
import { createUtilityRunner, createUtilityViews } from '../src/utilities/views.js';

function platformFixture() {
  const workers = [], urls = new Map(), revoked = [], timers = new Map(), changes = [];
  let next = 0, now = 0, failUrlAt = -1, creations = 0;
  class Worker {
    constructor(source) { this.source = source; this.stopped = false; workers.push(this); }
    postMessage(message) { this.message = message; }
    terminate() { this.stopped = true; }
    success(result) { this.onmessage({ data: { id: this.message.id, ok: true, result } }); }
    failure(error) { this.onmessage({ data: { id: this.message.id, ok: false, error } }); }
  }
  const platform = {
    Worker, Blob,
    URL: { createObjectURL(blob) { creations++; if (creations === failUrlAt) throw new Error('URL 生成失败'); const url = `blob:${++next}`; urls.set(url, blob); return url; }, revokeObjectURL(url) { revoked.push(url); urls.delete(url); } },
    setTimeout(callback, delay) { const id = ++next; timers.set(id, { callback, delay }); return id; }, clearTimeout(id) { timers.delete(id); }, now: () => now,
  };
  return { platform, workers, urls, revoked, timers, changes, onChange: state => changes.push(state), setNow: value => { now = value; }, failNextUrl: (offset = 1) => { failUrlAt = creations + offset; } };
}
const result = (name = '结果.txt') => ({ files: [{ name, mime: 'text/plain;charset=utf-8', bytes: new Uint8Array([65]) }], summary: '已完成', listing: [] });

test('独占 Worker 成功后才提供下载，并释放脚本 URL、定时器与旧结果', () => {
  const f = platformFixture(), runner = createUtilityRunner('worker source', f.platform, f.onChange);
  runner.run({ tool: 'text' });
  assert.equal(runner.snapshot().busy, true);
  assert.equal(f.timers.values().next().value.delay, 60000);
  assert.equal(f.urls.size, 0);
  f.workers[0].success(result());
  assert.equal(f.workers[0].stopped, true); assert.equal(f.timers.size, 0); assert.equal(f.urls.size, 1);
  const first = runner.snapshot().result.files[0].url;
  runner.run({ tool: 'text' }); f.workers[1].success(result('新结果.txt'));
  assert.ok(f.revoked.includes(first)); assert.equal(f.urls.size, 1);
  runner.dispose(); runner.dispose(); assert.equal(f.urls.size, 0);
});

test('取消、超时与迟到回调不替换上次结果', () => {
  const f = platformFixture(), runner = createUtilityRunner('source', f.platform, f.onChange);
  runner.run({ tool: 'text' }); f.workers[0].success(result());
  const previous = runner.snapshot().result;
  runner.run({ tool: 'text' }); const cancelled = f.workers[1]; runner.cancel();
  assert.equal(cancelled.stopped, true); assert.equal(f.timers.size, 0);
  cancelled.success(result('迟到.txt')); assert.equal(runner.snapshot().result, previous);
  runner.run({ tool: 'text' }); const timed = f.workers[2];
  f.timers.values().next().value.callback();
  assert.equal(timed.stopped, true); assert.match(runner.snapshot().error, /60 秒/);
  timed.success(result('超时.txt')); assert.equal(runner.snapshot().result, previous);
  runner.dispose(); assert.equal(f.urls.size, 0);
});

test('deadline 已过但定时器尚未被调度时也拒收结果', () => {
  const f = platformFixture(), runner = createUtilityRunner('source', f.platform, f.onChange);
  runner.run({ tool: 'text' }); f.setNow(60000); f.workers[0].success(result());
  assert.equal(runner.snapshot().result, null); assert.match(runner.snapshot().error, /60 秒/); assert.equal(f.urls.size, 0);
  runner.dispose();
});

test('Worker 错误、异常结构与下载创建失败都保留原结果且清理半成品', () => {
  const f = platformFixture(), runner = createUtilityRunner('source', f.platform, f.onChange);
  runner.run({ tool: 'text' }); f.workers[0].success(result()); const previous = runner.snapshot().result;
  runner.run({ tool: 'text' }); f.workers.at(-1).failure('输入格式不正确');
  assert.equal(runner.snapshot().result, previous); assert.match(runner.snapshot().error, /输入/);
  runner.run({ tool: 'text' }); f.workers.at(-1).success({ ...result(), files: [{ ...result().files[0], name: '../越界.txt' }] });
  assert.equal(runner.snapshot().result, previous); assert.match(runner.snapshot().error, /文件格式/);
  runner.run({ tool: 'text' }); f.failNextUrl(2); f.workers.at(-1).success({ ...result(), files: [...result().files, ...result('另一个.txt').files] });
  assert.equal(runner.snapshot().result, previous); assert.equal(f.urls.size, 1); assert.match(runner.snapshot().error, /URL/);
  runner.run({ tool: 'text' }); f.workers.at(-1).onerror({ preventDefault() {} });
  assert.equal(runner.snapshot().result, previous); assert.equal(f.timers.size, 0);
  runner.dispose();
});

test('缺 Worker、构造失败、错误身份与消息反序列化失败均有有界清理', () => {
  const f = platformFixture();
  const missing = createUtilityRunner('source', { ...f.platform, Worker: undefined }, f.onChange);
  missing.run({ tool: 'text' }); assert.match(missing.snapshot().error, /Worker/); assert.equal(f.timers.size, 0);
  const failure = createUtilityRunner('source', { ...f.platform, Worker: class { constructor() { throw new Error('构造失败'); } } }, f.onChange);
  failure.run({ tool: 'text' }); assert.match(failure.snapshot().error, /构造失败/); assert.equal(f.urls.size, 0); assert.equal(f.timers.size, 0);
  const runner = createUtilityRunner('source', f.platform, f.onChange); runner.run({ tool: 'text' });
  const worker = f.workers.at(-1); worker.onmessage({ data: { id: worker.message.id + 99, ok: true, result: result() } });
  assert.equal(runner.snapshot().busy, true); worker.onmessageerror(); assert.equal(worker.stopped, true); assert.equal(runner.snapshot().busy, false);
  runner.dispose(); missing.dispose(); failure.dispose();
});

test('读取工作表只更新目录，不移除已完成下载', () => {
  const f = platformFixture(), runner = createUtilityRunner('source', f.platform, f.onChange);
  runner.run({ tool: 'text' }); f.workers[0].success(result()); const previous = runner.snapshot().result;
  runner.run({ tool: 'excel-sheets' }); f.workers[1].success({ sheets: ['一', '二'] });
  assert.deepEqual(runner.snapshot().sheets, ['一', '二']); assert.equal(runner.snapshot().result, previous);
  runner.clearSheets(); assert.deepEqual(runner.snapshot().sheets, []); runner.dispose();
});

test('销毁后到达消息与再次调用不产生下载或状态回调', () => {
  const f = platformFixture(), runner = createUtilityRunner('source', f.platform, f.onChange);
  runner.run({ tool: 'text' }); const worker = f.workers[0]; runner.dispose(); const count = f.changes.length;
  worker.success(result()); runner.run({ tool: 'text' });
  assert.equal(f.changes.length, count); assert.equal(f.workers.length, 1); assert.equal(f.urls.size, 0); assert.equal(f.timers.size, 0);
});

function reactFixture() {
  const instances = new Map(); let current;
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children: children.flat(Infinity).filter(x => x !== false && x != null) } }; },
    useState(initial) { const instance = current, i = instance.si++; if (!(i in instance.states)) instance.states[i] = initial; return [instance.states[i], next => { instance.states[i] = typeof next === 'function' ? next(instance.states[i]) : next; }]; },
    useRef(initial) { const i = current.ri++; return current.refs[i] ||= { current: initial }; },
    useEffect(callback, dependencies) { const i = current.ei++, old = current.effects[i]; if (!old || dependencies.some((value, j) => !Object.is(value, old.dependencies[j]))) current.effects[i] = { callback, dependencies, cleanup: old?.cleanup, pending: true }; },
  };
  const { ToolboxView } = createUtilityViews(React, 'source');
  const cleanup = instance => { for (const effect of instance.effects) effect.cleanup?.(); };
  function expand(node, path, seen) {
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const key = path + '/' + node.type.name + ':' + (node.props.key || ''); seen.add(key);
      if (!instances.has(key)) instances.set(key, { states: [], refs: [], effects: [] });
      current = instances.get(key); current.si = 0; current.ri = 0; current.ei = 0;
      return expand(node.type(node.props), key, seen);
    }
    if (node.props.ref && !node.props.ref.current) node.props.ref.current = { open: false, showModal() { this.open = true; }, close() { this.open = false; }, focus() {}, getBoundingClientRect() { return { left: 10, top: 10, right: 500, bottom: 500 }; } };
    return { ...node, props: { ...node.props, children: (node.props.children || []).map((child, i) => expand(child, path + '/' + i, seen)) } };
  }
  return { render(active = true) {
    const seen = new Set(), tree = expand(h(ToolboxView, { active, Glyph: ({ name }) => h('svg', { 'data-icon': name }) }), '', seen);
    for (const [key, instance] of instances) if (!seen.has(key)) { cleanup(instance); instances.delete(key); }
    for (const instance of instances.values()) for (const effect of instance.effects) if (effect.pending) { effect.cleanup?.(); effect.cleanup = effect.callback(); effect.pending = false; }
    return tree;
  }, unmount() { for (const instance of instances.values()) cleanup(instance); instances.clear(); } };
  function h(...args) { return React.createElement(...args); }
}
function nodes(tree) { return tree && typeof tree === 'object' ? [tree, ...(tree.props?.children || []).flatMap(nodes)] : []; }
const button = (tree, text) => nodes(tree).find(node => node.type === 'button' && (node.props.children.includes(text) || node.props['aria-label'] === text));
const openTool = (tree, name, target = { focus() {}, isConnected: true }) => button(tree, name).props.onClick({ currentTarget: target });

test('工具台搜索、键盘按钮语义、active 隐藏与选件保留', () => {
  const fixture = reactFixture();
  try {
    let tree = fixture.render();
    assert.equal(tree.props.hidden, false);
    assert.equal(nodes(tree).filter(node => node.props.className === 'yj-tool-card').length, 7);
    assert.equal(nodes(tree).filter(node => node.type === 'dialog').length, 0);
    assert.equal(nodes(tree).filter(node => node.type === 'svg').length, 7);
    assert.ok(nodes(tree).filter(node => node.type === 'button').every(node => node.props.type === 'button'));
    openTool(tree, 'Word 转 PDF'); tree = fixture.render();
    const fileInput = nodes(tree).find(node => node.type === 'input' && node.props.type === 'file');
    fileInput.props.onChange({ target: { files: [new File(['字节'], '选中文件.docx')] } });
    tree = fixture.render(false); assert.equal(tree.props.hidden, true);
    tree = fixture.render(true); assert.ok(nodes(tree).some(node => node.props.children.some(child => typeof child === 'string' && child.includes('选中文件.docx'))));
    nodes(tree).find(node => node.props.type === 'search').props.onChange({ target: { value: '找不到的工具' } });
    tree = fixture.render(); assert.equal(nodes(tree).filter(node => node.props.className === 'yj-tool-card').length, 0); assert.ok(nodes(tree).some(node => node.props.children.includes('没有匹配工具')));
    assert.ok(button(tree, '开始处理'));
  } finally { fixture.unmount(); }
});

test('目录按工具分组，每个工具列出全部功能入口；搜索跨工具列出命中的功能', () => {
  const fixture = reactFixture();
  const cards = tree => nodes(tree).filter(node => node.props.className === 'yj-tool-card');
  try {
    let tree = fixture.render();
    assert.deepEqual(cards(tree).map(card => nodes(card).find(node => node.props['data-tool-id']).props['data-tool-id']), ['convert', 'pdf', 'excel', 'image', 'text', 'media', 'qr']);
    assert.equal(nodes(tree).filter(node => node.props.className === 'yj-tool-chip').length, 40);
    nodes(tree).find(node => node.props.type === 'search').props.onChange({ target: { value: 'Word' } }); tree = fixture.render();
    const hits = nodes(tree).filter(node => node.props.className === 'yj-tool-hit');
    assert.deepEqual(hits.map(node => node.props.children[1].props.children[0]), ['Word 转 PDF', 'PDF 转 Word', 'Word 转 TXT', '提取文档图片', 'Word 版本对照']);
    assert.equal(cards(tree).length, 0);
    hits[4].props.onClick({ currentTarget: { focus() {} } }); tree = fixture.render();
    assert.equal(nodes(tree).find(node => node.type === 'dialog').props['aria-label'], '文字处理');
    assert.equal(nodes(tree).find(node => node.props['aria-current'] === true).props.children[0], 'Word 版本对照');
  } finally { fixture.unmount(); }
});

test('切换到 inactive 立即终止运行，重新显示保留已有下载', () => {
  const f = platformFixture(), originals = new Map();
  // 组件只注入浏览器平台；替换均局限本测试并恢复原属性描述符。
  for (const key of ['Worker', 'URL', 'Blob', 'setTimeout', 'clearTimeout']) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value: f.platform[key], configurable: true, writable: true }); }
  const fixture = reactFixture();
  try {
    let tree = fixture.render(); openTool(tree, '整理与统计');
    tree = fixture.render(); button(tree, '开始处理').props.onClick();
    f.workers[0].success(result()); tree = fixture.render(); const url = nodes(tree).find(node => node.type === 'a').props.href;
    button(tree, '开始处理').props.onClick(); const worker = f.workers[1];
    fixture.render(false); assert.equal(worker.stopped, true); worker.success(result('迟到.txt'));
    tree = fixture.render(true); assert.equal(nodes(tree).find(node => node.type === 'a').props.href, url);
  } finally {
    fixture.unmount();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
  assert.equal(f.urls.size, 0); assert.equal(f.timers.size, 0);
});

test('浏览器计时器保持全局 receiver，组件成功下载、取消及卸载均完成清理', () => {
  const f = platformFixture(), originals = new Map();
  let fixture, scheduled = 0, cleared = 0;
  try {
    // Node 计时器不校验 receiver；此边界夹具复现 Window 的 Illegal invocation 约束。
    for (const key of ['Worker', 'URL', 'Blob', 'setTimeout', 'clearTimeout']) {
      originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      const value = key === 'setTimeout' || key === 'clearTimeout' ? function (...args) {
        if (this !== globalThis) throw new TypeError('Illegal invocation');
        if (key === 'setTimeout') scheduled++; else cleared++;
        return f.platform[key](...args);
      } : f.platform[key];
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    fixture = reactFixture();
    let tree = fixture.render(); openTool(tree, '整理与统计');
    tree = fixture.render(); nodes(tree).find(node => node.type === 'textarea').props.onChange({ target: { value: '一行文本' } });
    tree = fixture.render(); button(tree, '开始处理').props.onClick();
    f.workers[0].success(result()); tree = fixture.render();
    const url = nodes(tree).find(node => node.type === 'a').props.href;
    assert.equal(button(tree, '开始处理').props.disabled, false);
    button(tree, '开始处理').props.onClick(); tree = fixture.render(); button(tree, '取消').props.onClick();
    tree = fixture.render(); assert.equal(nodes(tree).find(node => node.type === 'a').props.href, url);
    button(tree, '开始处理').props.onClick(); fixture.unmount(); fixture = null;
    assert.equal(scheduled, 3); assert.equal(cleared, 3);
    assert.equal(f.timers.size, 0); assert.equal(f.urls.size, 0); assert.ok(f.workers.every(worker => worker.stopped));
  } finally {
    try { fixture?.unmount(); } finally {
      for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    }
  }
});

test('计时器或平台初始化失败退出 busy、保留下载且允许原入口重试', () => {
  const f = platformFixture(), runner = createUtilityRunner('source', f.platform, f.onChange);
  try {
    runner.run({ tool: 'text' }); f.workers[0].success(result()); const previous = runner.snapshot().result;
    for (const key of ['setTimeout', 'now']) {
      const original = f.platform[key];
      f.platform[key] = () => { throw new Error(`${key} 初始化失败`); };
      try {
        assert.doesNotThrow(() => runner.run({ tool: 'text' }));
        assert.equal(runner.snapshot().busy, false); assert.match(runner.snapshot().error, /初始化失败/);
        assert.equal(runner.snapshot().result, previous); assert.equal(f.timers.size, 0); assert.equal(f.urls.size, 1);
      } finally { f.platform[key] = original; }
    }
    runner.run({ tool: 'text' }); f.workers.at(-1).success(result('重试结果.txt'));
    assert.equal(runner.snapshot().busy, false); assert.equal(runner.snapshot().error, '');
    assert.equal(runner.snapshot().result.files[0].name, '重试结果.txt');
  } finally { runner.dispose(); }
  assert.equal(f.timers.size, 0); assert.equal(f.urls.size, 0);
});

test('最小化保留同一有界任务与草稿，恢复后关闭立即清理并归还焦点', () => {
  const f = platformFixture(), originals = new Map(); let focused = 0;
  for (const key of ['Worker', 'URL', 'Blob', 'setTimeout', 'clearTimeout']) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value: f.platform[key], configurable: true, writable: true }); }
  const fixture = reactFixture();
  try {
    let tree = fixture.render(); openTool(tree, '整理与统计', { isConnected: true, focus() { focused++; } });
    tree = fixture.render(); nodes(tree).find(node => node.type === 'textarea').props.onChange({ target: { value: '保留草稿' } });
    tree = fixture.render(); button(tree, '开始处理').props.onClick(); const worker = f.workers[0];
    tree = fixture.render(); button(tree, '最小化工具').props.onClick(); tree = fixture.render();
    assert.equal(worker.stopped, false); assert.equal(f.timers.size, 1); assert.equal(nodes(tree).find(node => node.type === 'dialog').props.ref.current.open, false);
    worker.success(result()); tree = fixture.render(); assert.ok(button(tree, '恢复'));
    button(tree, '恢复').props.onClick(); tree = fixture.render();
    assert.equal(nodes(tree).find(node => node.type === 'textarea').props.value, '保留草稿'); assert.equal(f.workers.length, 1); assert.equal(f.urls.size, 1);
    button(tree, '开始处理').props.onClick(); const pending = f.workers[1]; tree = fixture.render(); button(tree, '关闭工具').props.onClick();
    assert.equal(pending.stopped, true); assert.equal(f.urls.size, 0); assert.equal(f.timers.size, 0); assert.equal(focused, 1);
    pending.success(result('迟到.txt')); tree = fixture.render(); assert.equal(nodes(tree).some(node => node.type === 'dialog'), false);
  } finally { fixture.unmount(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
});

test('切换工具必须确认，拒绝时保留旧窗口与输入', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'confirm'); let accepted = false, requested = 0;
  Object.defineProperty(globalThis, 'confirm', { configurable: true, value: () => { requested++; return accepted; } });
  const fixture = reactFixture();
  try {
    let tree = fixture.render(); openTool(tree, '整理与统计'); tree = fixture.render();
    nodes(tree).find(node => node.type === 'textarea').props.onChange({ target: { value: '不丢失' } });
    tree = fixture.render(); button(tree, '最小化工具').props.onClick(); tree = fixture.render(); openTool(tree, '合并 PDF'); tree = fixture.render();
    assert.equal(requested, 1); assert.equal(nodes(tree).find(node => node.type === 'dialog').props['aria-label'], '文字处理');
    assert.equal(nodes(tree).find(node => node.type === 'textarea').props.value, '不丢失');
    accepted = true; openTool(tree, '合并 PDF'); tree = fixture.render();
    assert.equal(requested, 2); assert.equal(nodes(tree).find(node => node.type === 'dialog').props['aria-label'], 'PDF 工具');
    // 同一工具内切换功能不需确认，也不重建窗口。
    openTool(tree, '拆分 PDF'); tree = fixture.render();
    assert.equal(requested, 2); assert.equal(nodes(tree).find(node => node.props['aria-current'] === true).props.children[0], '拆分 PDF');
  } finally { fixture.unmount(); if (original) Object.defineProperty(globalThis, 'confirm', original); else delete globalThis.confirm; }
});

test('Escape 与遮罩关闭同一路径，面板内空白不关闭且关闭后才归还焦点', () => {
  const fixture = reactFixture(); let focused = 0, dialogElement;
  const target = { isConnected: true, focus() { assert.equal(dialogElement.open, false); focused++; } };
  try {
    let tree = fixture.render(); openTool(tree, '整理与统计', target); tree = fixture.render();
    let dialog = nodes(tree).find(node => node.type === 'dialog'); dialogElement = dialog.props.ref.current;
    dialog.props.onClick({ target: dialogElement, currentTarget: dialogElement, clientX: 20, clientY: 20 });
    assert.equal(dialogElement.open, true);
    let prevented = false; dialog.props.onCancel({ preventDefault() { prevented = true; } });
    tree = fixture.render(); assert.equal(prevented, true); assert.equal(focused, 1); assert.equal(nodes(tree).some(node => node.type === 'dialog'), false);
    openTool(tree, '整理与统计', target); tree = fixture.render(); dialog = nodes(tree).find(node => node.type === 'dialog'); dialogElement = dialog.props.ref.current;
    dialog.props.onClick({ target: dialogElement, currentTarget: dialogElement, clientX: 0, clientY: 0 });
    tree = fixture.render(); assert.equal(focused, 2); assert.equal(nodes(tree).some(node => node.type === 'dialog'), false);
  } finally { fixture.unmount(); }
});

test('清除选件同步清空原生输入；原卡片被筛选移除时恢复目录再归还焦点', () => {
  const fixture = reactFixture(); let focused = 0;
  try {
    let tree = fixture.render(); const directory = nodes(tree).find(node => node.props.className === 'yj-grid yj-tool-directory').props.ref;
    openTool(tree, 'Word 转 PDF', { isConnected: false }); tree = fixture.render();
    const file = nodes(tree).find(node => node.props.type === 'file'); file.props.ref.current.value = 'fixture.docx';
    file.props.onChange({ target: { files: [new File(['x'], 'fixture.docx')] } }); tree = fixture.render();
    button(tree, '清除选件').props.onClick(); assert.equal(file.props.ref.current.value, '');
    tree = fixture.render(); assert.equal(button(tree, '开始处理').props.disabled, true);
    button(tree, '最小化工具').props.onClick(); tree = fixture.render();
    nodes(tree).find(node => node.props.type === 'search').props.onChange({ target: { value: '不存在' } }); tree = fixture.render();
    directory.current.querySelector = selector => { assert.equal(selector, '[data-tool-id="convert"]'); return { focus() { focused++; } }; };
    button(tree, '关闭工具').props.onClick(); tree = fixture.render(); tree = fixture.render();
    assert.equal(nodes(tree).filter(node => node.props.className === 'yj-tool-card').length, 7); assert.equal(focused, 1);
  } finally { fixture.unmount(); }
});

test('工具模态独立于整页几何，内容高度居中且视口内滚动', () => {
  const fixture = reactFixture();
  try {
    let tree = fixture.render(); openTool(tree, '整理与统计'); tree = fixture.render();
    const dialog = nodes(tree).find(node => node.type === 'dialog');
    assert.equal(dialog.props.className, 'yj-tool-modal', '不继承 yj-page 的整页高度与 flex 布局');
    const css = nodes(tree).find(node => node.type === 'style').props.children.join('');
    const geometry = /dialog\.yj-tool-modal\{([^}]+)\}/.exec(css)?.[1];
    assert.ok(geometry);
    for (const declaration of ['position:fixed', 'inset:0', 'margin:auto', 'display:block', 'box-sizing:border-box', 'height:fit-content', 'min-height:0', 'width:min(1040px,calc(100vw - 32px))', 'max-height:calc(100dvh - 48px)', 'overflow:auto']) assert.ok(geometry.split(';').includes(declaration), declaration);
    assert.match(css, /dialog\.yj-tool-modal:not\(\[open\]\)\{display:none\}/);
    assert.ok(css.includes('.yj-tool-modal::backdrop'));
    assert.equal(dialog.props.ref.current.open, true);
  } finally { fixture.unmount(); }
});
