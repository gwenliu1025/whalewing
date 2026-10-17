import test from 'node:test';
import assert from 'node:assert/strict';
import { Vault } from '../src/vault.js';
import { knowledgeContract } from '../src/knowledge-contract.js';
import { createGraphCanvas, createGraphLayout } from '../src/graph-canvas.js';
import { z } from 'zod';

test('连接度由完整索引去重邻居计算，双向、自环、分页和过滤不改变同一笔记大小', async () => {
  const vault = new Vault(process.cwd(), { maxGraphNodes: 1 });
  // 只替换本实例的已解析索引，覆盖图数据算法而不读写任何知识目录。
  vault.index = async () => [
    { path: '40-知识/一.md', title: '一', aliases: [], links: ['一', '二', '二', '三'].map(name => ({ status: 'resolved', path: `40-知识/${name}.md` })) },
    { path: '40-知识/二.md', title: '二', aliases: [], links: [{ status: 'resolved', path: '40-知识/一.md' }] },
    { path: '40-知识/三.md', title: '三', aliases: [], links: [] },
    { path: '40-知识/孤立.md', title: '孤立', aliases: [], links: [{ status: 'missing' }] },
  ].map(record => ({ ...record, readOnly: false }));
  const first = await vault.graph({});
  assert.equal(first.nodes[0].degree, 2);
  assert.equal((await vault.graph({ query: '一' })).nodes[0].degree, 2);
  assert.equal((await vault.graph({ path: '40-知识/二.md', query: '一' })).nodes[0].degree, 2);
  assert.equal((await vault.graph({ offset: 1 })).nodes[0].degree, 1);
  assert.equal((await vault.graph({ offset: 3 })).nodes[0].degree, 0);
  assert.ok(first.omittedEdges > 0);
  knowledgeContract(z).result.parse(first);
  assert.equal(knowledgeContract(z).result.safeParse({ ...first, nodes: [{ path: 'x', title: 'x' }] }).success, false);
  await assert.rejects(vault.graph({}, AbortSignal.abort()), { name: 'AbortError' });
});

function eventTarget() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(name, fn) { const listeners = handlers.get(name) || new Set(); listeners.add(fn); handlers.set(name, listeners); },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
    fire(name, event = {}) { for (const fn of handlers.get(name) || []) fn({ preventDefault() {}, ...event }); },
    count() { return [...handlers.values()].reduce((sum, listeners) => sum + listeners.size, 0); },
  };
}

/** 用真实组件计算、镜头和生命周期，仅替换浏览器光栅与事件调度。 */
function harness(t, graph, options = {}) {
  const saved = new Map();
  let dispose = () => {};
  t.after(() => { dispose(); for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const install = (key, value) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  if (options.clock) install('performance', { now: options.clock });
  const media = Object.assign(eventTarget(), { matches: Boolean(options.reduced) });
  const document = Object.assign(eventTarget(), { hidden: false });
  const frames = new Map();
  const timers = new Map();
  const observers = new Set();
  const callbacks = new Set();
  const opened = [];
  let nextFrame = 1, cancelled = 0, widestFrame = 0, strokes = 0, lines = 0;
  let arcs = [], labels = [], edgePaints = [], compositeAlpha = [], fills = [], segments = [], layersDrawn = [], strokePaints = [], pen = null;
  const context = {
    setTransform() {}, clearRect() { arcs = []; labels = []; fills = []; segments = []; layersDrawn = []; }, beginPath() {},
    moveTo(x, y) { pen = { x, y }; }, lineTo(x, y) { lines++; segments.push({ from: pen, to: { x, y } }); }, stroke() { strokes++; strokePaints.push({ width: this.lineWidth, alpha: this.globalAlpha }); }, drawImage(layer) { layersDrawn.push(layer); compositeAlpha.push(this.globalAlpha); },
    arc(x, y, r) { assert.ok([x, y, r].every(Number.isFinite)); arcs.push({ x, y, r }); }, fill() { fills.push({ color: this.fillStyle, alpha: this.globalAlpha ?? 1 }); },
    measureText(text) { return { width: text.length * 7 }; }, strokeText() {}, fillText(text, x, y) { labels.push({ text, x, y }); },
  };
  const edgeLayers = [];
  document.createElement = tag => {
    assert.equal(tag, 'canvas');
    const edgeContext = { setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() { lines++; layer.lines++; }, stroke() { edgePaints.push({ width: this.lineWidth }); }, getImageData() { return { data: new Uint8Array(4) }; } };
    const layer = { width: 0, height: 0, lines: 0, getContext: () => edgeContext }; edgeLayers.push(layer); return layer;
  };
  const element = Object.assign(eventTarget(), {
    style: {}, title: '', width: 0, height: 0,
    getContext() { return context; },
    getBoundingClientRect() { return { left: 0, top: 0, width: options.width || 900, height: options.height || 560 }; },
    focus() {}, captured: null,
    setPointerCapture(id) { this.captured = id; }, hasPointerCapture(id) { return this.captured === id; }, releasePointerCapture(id) { if (this.captured === id) this.captured = null; },
  });
  install('window', { devicePixelRatio: options.pixelRatio || 1, matchMedia: () => media }); install('document', document);
  install('getComputedStyle', () => ({ getPropertyValue: name => name.includes('bg') ? '#fff' : name.includes('business') ? '#d80' : '#333' }));
  install('requestAnimationFrame', fn => { const id = nextFrame++; frames.set(id, fn); return id; });
  install('cancelAnimationFrame', id => { cancelled++; frames.delete(id); });
  const nativeTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout;
  // 只控制图谱120ms精绘，不接管D3已停止模拟的库级一次性清理回调。
  install('setTimeout', (fn, delay, ...args) => { if (delay !== 120) return nativeTimeout(fn, delay, ...args); const id = nextFrame++; timers.set(id, fn); return id; });
  install('clearTimeout', id => { if (!timers.delete(id)) nativeClearTimeout(id); });
  install('ResizeObserver', class { constructor(fn) { this.fn = fn; } observe() { observers.add(this); } disconnect() { observers.delete(this); } });
  const states = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useEffect(fn, deps) { const i = effectIndex++; if (!effects[i] || deps.some((value, j) => effects[i].deps[j] !== value)) { effects[i]?.cleanup?.(); effects[i] = { fn, deps, pending: true }; } },
  };
  const Component = createGraphCanvas(React);
  let props = { graph, label: '知识图谱', resetLabel: '适应全部', loadingLabel: (done, total) => `${done}/${total}`, canvasErrorLabel: 'Canvas不可用', dataErrorLabel: '无效节点', onOpenNote: node => opened.push(node), subscribeTheme: fn => { callbacks.add(fn); return () => callbacks.delete(fn); }, ...options.props };
  const render = update => {
    props = { ...props, ...update }; stateIndex = refIndex = effectIndex = 0;
    const tree = Component(props);
    tree.props.children[0].props.ref.current = element;
    for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup = effect.fn(); }
    return tree;
  };
  const flush = (count = 500) => {
    let runs = 0;
    while (frames.size && runs++ < count) {
      const [id, fn] = frames.entries().next().value; frames.delete(id);
      const start = performance.now(); fn(); widestFrame = Math.max(widestFrame, performance.now() - start);
    }
    return runs;
  };
  const unmount = () => { for (const effect of effects) { effect.cleanup?.(); effect.cleanup = undefined; } };
  dispose = unmount;
  render();
  return { render, flush, unmount, element, edgeLayers, frames, timers, document, media, observers, callbacks, opened, geometry: () => ({ arcs, labels, lines, strokes, edgePaints, compositeAlpha, fills, segments, layersDrawn, strokePaints, widestFrame, cancelled }), refine: () => { for (const [id, fn] of timers) { timers.delete(id); fn(); } flush(); }, wheel: (deltaY, x, y) => { element.fire('wheel', { deltaY, deltaMode: 0, clientX: x, clientY: y }); flush(); } };
}

const small = {
  nodes: [{ path: 'a', title: '中心文章的完整中文长标题', degree: 12 }, { path: 'b', title: '普通笔记', degree: 2 }, { path: 'c', title: '孤立笔记', degree: 0 }],
  edges: [{ source: 'a', target: 'b' }],
};

test('首个可见图已收敛，不展示中途放大缩小，也不命中尚未显示的节点', t => {
  // 确定性时钟使每个调度帧只推进有限 tick，不依赖测试机器的 CPU 速度。
  let now = 0;
  const h = harness(t, small, { clock: () => ++now });
  h.flush(1);
  assert.equal(h.geometry().arcs.length, 0);
  h.element.fire('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: 0, clientY: 0 });
  assert.equal(h.element.captured, null);
  let first;
  for (let i = 0; h.frames.size && i < 301; i++) {
    h.flush(1);
    if (!first && h.geometry().arcs.length) first = structuredClone(h.geometry().arcs);
  }
  assert.equal(first.length, small.nodes.length);
  assert.deepEqual(first, h.geometry().arcs);
});

test('相同尺寸通知不清空画布、不重置悬停和镜头、不取消正在拖动的节点', t => {
  const h = harness(t, small); h.flush();
  h.wheel(-100, 450, 280); h.refine();
  const geometry = structuredClone(h.geometry().arcs), at = geometry[0];
  h.element.fire('pointermove', { clientX: at.x, clientY: at.y }); h.flush();
  h.element.fire('pointerdown', { button: 0, isPrimary: true, pointerId: 4, clientX: at.x, clientY: at.y }); h.flush();
  for (const observer of h.observers) observer.fn();
  assert.equal(h.frames.size, 0);
  assert.equal(h.element.captured, 4);
  assert.equal(h.element.title, small.nodes[0].title);
  assert.deepEqual(h.geometry().arcs, geometry);
});

test('高密屏按像素预算分批精绘，完整关系与原生分辨率保持', t => {
  const count = 200;
  const nodes = Array.from({ length: count }, (_, i) => ({ kind: 'note', readOnly: false, path: String(i), title: `笔记 ${i}`, degree: 60 }));
  const edges = Array.from({ length: 6000 }, (_, i) => ({ source: String(i % count), target: String((i % count + 1 + Math.floor(i / count)) % count) }));
  const h = harness(t, { nodes, edges }, { reduced: true, pixelRatio: 2 });
  // 等待实际创建背景层，不以固定帧数猜测不同机器的布局完成时间。
  for (let i = 0; !h.edgeLayers.length && i < 500; i++) h.flush(1);
  assert.equal(h.element.width, 1800);
  assert.equal(h.element.height, 1120);
  assert.equal(h.edgeLayers.length, 1);
  assert.equal(h.edgeLayers[0].lines, 768);
  h.flush();
  assert.equal(h.edgeLayers[0].lines, edges.length);
  assert.equal(h.render().props.children[0].props['aria-busy'], false);
  h.unmount(); assert.equal(h.frames.size, 0);
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const centroid = nodes => ({ x: nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length, y: nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length });
function topology(count, pairs) {
  const neighbors = Array.from({ length: count }, () => new Set());
  for (const [a, b] of pairs) if (a !== b) { neighbors[a].add(b); neighbors[b].add(a); }
  return { nodes: neighbors.map((set, i) => ({ kind: 'note', readOnly: false, path: String(i), title: `笔记${i}`, degree: set.size })), edges: pairs.map(([a, b]) => ({ source: String(a), target: String(b) })) };
}
function settled(graph) {
  const layout = createGraphLayout(graph);
  layout.simulation.tick(300);
  layout.simulation.stop();
  return layout;
}

test('几何投影合并反向与重复引用、排除自环，完整响应保持不变', () => {
  const graph = topology(4, [[0, 1], [1, 0], [0, 1], [0, 0], [1, 2]]);
  const before = structuredClone(graph);
  for (const row of [...graph.nodes, ...graph.edges]) Object.freeze(row);
  Object.freeze(graph.nodes); Object.freeze(graph.edges); Object.freeze(graph);
  const result = settled(graph);
  assert.deepEqual(result.edges, [[0, 1], [1, 2]]);
  assert.deepEqual([...result.neighbors[0]], [1]);
  assert.deepEqual(graph, before);
  assert.equal(result.nodes[3].degree, 0);
  assert.ok(result.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.throws(() => createGraphLayout({ ...graph, edges: [{ source: '0', target: 'outside' }] }), /缺少端点/);
});

test('不同笔记元数据共用固定物理字段，初始坐标速度与固定点保持原值', () => {
  const graph = topology(3, [[0, 1], [1, 2]]);
  Object.assign(graph.nodes[0], { x: 12.5, y: -7.5, vx: 0.25, vy: -0.5 });
  Object.assign(graph.nodes[1], { kind: 'missing', sources: [{ path: '来源.md', title: '来源', line: 1 }], fx: 40, fy: 60 });
  const before = structuredClone(graph);
  const layout = createGraphLayout(graph);
  const fields = ['path', 'degree', 'index', 'x', 'y', 'vx', 'vy', 'fx', 'fy'];
  for (const node of layout.nodes) assert.deepEqual(Object.keys(node), fields);
  assert.deepEqual([layout.nodes[0].x, layout.nodes[0].y, layout.nodes[0].vx, layout.nodes[0].vy], [12.5, -7.5, 0.25, -0.5]);
  layout.simulation.tick(300).stop();
  assert.equal(layout.nodes[1].x, 40); assert.equal(layout.nodes[1].y, 60);
  assert.deepEqual(graph, before);
});

test('星形中心自然聚集，双簇桥接不混成一团，孤点与链保留真实拓扑', () => {
  const star = settled(topology(31, Array.from({ length: 30 }, (_, i) => [0, i + 1]))).nodes;
  const leaves = star.slice(1), meanRadius = leaves.reduce((sum, node) => sum + distance(star[0], node), 0) / leaves.length;
  assert.ok(distance(star[0], centroid(leaves)) / meanRadius < 0.1);
  const radii = leaves.map(node => distance(star[0], node));
  assert.ok(Math.max(...radii) / Math.min(...radii) < 1.3);
  const pairs = [];
  for (let side = 0; side < 2; side++) for (let a = 0; a < 15; a++) for (let b = a + 1; b < 15; b++) pairs.push([a + side * 15, b + side * 15]);
  pairs.push([0, 15]);
  const dual = settled(topology(30, pairs)).nodes, groups = [dual.slice(0, 15), dual.slice(15)];
  const centers = groups.map(centroid);
  const rms = groups.map((group, i) => Math.sqrt(group.reduce((sum, node) => sum + distance(node, centers[i]) ** 2, 0) / group.length));
  assert.ok(distance(...centers) > 1.4 * (rms[0] + rms[1]));
  const orphans = settled(topology(100, [])).nodes;
  for (let a = 0; a < orphans.length; a++) for (let b = a + 1; b < orphans.length; b++) assert.ok(distance(orphans[a], orphans[b]) > 10);
  const chain = settled(topology(30, Array.from({ length: 29 }, (_, i) => [i, i + 1]))).nodes;
  const adjacent = chain.slice(1).reduce((sum, node, i) => sum + distance(node, chain[i]), 0) / 29;
  assert.ok(distance(chain[0], chain.at(-1)) > adjacent * 3);
});

test('对称拓扑旋转后保持各向同性，不恢复逐轴限速方形边界', () => {
  const envelope = nodes => {
    const center = centroid(nodes), sectors = Array.from({ length: 8 }, () => []);
    for (const node of nodes) {
      const angle = Math.atan2(node.y - center.y, node.x - center.x);
      sectors[Math.round((angle + Math.PI) * 4 / Math.PI) % 8].push(distance(node, center));
    }
    // 量测各方向外沿而不是所有节点半径：自由孤点应填满区域，不应被强制成圆环。
    return sectors.map(values => values.sort((a, b) => a - b)[Math.floor((values.length - 1) * 0.9)]);
  };
  const result = [];
  for (const angle of [0, Math.PI / 4]) {
    const graph = topology(96, []);
    graph.nodes.forEach((node, i) => { node.x = Math.cos(i * Math.PI * 2 / 96 + angle) * 300; node.y = Math.sin(i * Math.PI * 2 / 96 + angle) * 300; });
    const radii = envelope(settled(graph).nodes);
    assert.ok(Math.max(...radii) / Math.min(...radii) < 1.08);
    result.push(radii.reduce((sum, value) => sum + value, 0) / radii.length);
  }
  assert.ok(Math.abs(result[0] - result[1]) / result[0] < 0.02);
  const square = envelope(Array.from({ length: 96 }, (_, i) => {
    const angle = i * Math.PI * 2 / 96, scale = 300 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
    return { x: Math.cos(angle) * scale, y: Math.sin(angle) * scale };
  }));
  assert.ok(Math.max(...square) / Math.min(...square) > 1.15, '反例确实拒收方形外沿');
});

test('隐藏中的未完成布局不提前验收，恢复后与连续完整布局相同', t => {
  const graph = topology(160, Array.from({ length: 159 }, (_, i) => [i, i + 1]));
  const h = harness(t, graph, { reduced: true });
  // 在首个tick之前隐藏，确定性证明隐藏并不把种子坐标当成终态。
  h.document.hidden = true; h.document.fire('visibilitychange');
  assert.equal(h.frames.size, 0); assert.equal(h.render().props.children[0].props['aria-busy'], true);
  h.document.hidden = false; h.document.fire('visibilitychange'); h.flush();
  assert.equal(h.render().props.children[0].props['aria-busy'], false);
  const expected = settled(graph).nodes;
  const arcs = h.geometry().arcs;
  const actualRatio = distance(arcs[0], arcs[1]) / distance(arcs[0], arcs[159]);
  const expectedRatio = distance(expected[0], expected[1]) / distance(expected[0], expected[159]);
  assert.ok(Math.abs(actualRatio - expectedRatio) < 1e-8);
  h.unmount(); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
});

test('缺失节点空心显示，聚焦与点击交还完整投影节点，不推断真实文件路径', t => {
  const graph = topology(2, [[0, 1]]);
  graph.nodes[0].kind = 'note';
  graph.nodes[1] = { ...graph.nodes[1], kind: 'missing', sources: [{ path: '40-知识/来源.md', title: '来源', line: 3 }] };
  const h = harness(t, graph, { reduced: true }); h.flush();
  assert.equal(h.geometry().fills[0].color, '#333');
  assert.equal(h.geometry().fills[1].color, '#fff');
  assert.ok(h.geometry().strokePaints.some(paint => paint.width === 1.3));
  h.element.fire('keydown', { key: 'End' }); h.flush();
  assert.equal(h.element.title, graph.nodes[1].title);
  h.element.fire('keydown', { key: 'Enter' });
  assert.equal(h.opened[0], graph.nodes[1]);
});

test('高DPR屏幕不把当前画布降成二倍像素，直接绘制保持屏幕线宽', t => {
  const h = harness(t, small, { reduced: true, pixelRatio: 3 }); h.flush();
  assert.equal(h.element.width, 2700); assert.equal(h.element.height, 1680);
  assert.equal(h.geometry().strokePaints.at(-1).width, 0.7);
  assert.equal(h.edgeLayers.length, 0);
});

test('连续纯平移中仍在视口内的标题身份稳定，不因网格相位或出屏候选重排', t => {
  const graph = { nodes: Array.from({ length: 65 }, (_, i) => ({ path: `${i}`, title: `文章${String(i).padStart(2, '0')}的长标题`, degree: 0 })), edges: [] };
  const h = harness(t, graph, { reduced: true }); h.flush();
  const before = h.geometry().arcs.map(node => ({ ...node }));
  const stable = h.geometry().labels.filter(item => item.x > 170 && item.x < 700 && item.y > 80 && item.y < 400).map(item => item.text);
  const initial = new Set(h.geometry().labels.map(item => item.text));
  const interior = h.geometry().arcs.flatMap((node, i) => node.x > 170 && node.x < 700 && node.y > 80 && node.y < 400 ? [graph.nodes[i].title] : []);
  assert.ok(stable.length > 3);
  h.element.fire('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: 2, clientY: 2 });
  for (let shift = 5; shift <= 80; shift++) {
    h.element.fire('pointermove', { pointerId: 1, clientX: 2 + shift, clientY: 2 }); h.flush();
    const shown = new Set(h.geometry().labels.map(item => item.text));
    assert.ok(stable.every(text => shown.has(text)), `平移 ${shift}px 改变仍在视口内的标题`);
    assert.ok(interior.every(text => shown.has(text) === initial.has(text)), '裁剪不能让原本隐藏的内部标签挤入');
  }
  assert.ok(h.geometry().arcs.every((node, i) => Math.abs(node.x - before[i].x - 80) < 1e-8 && node.y === before[i].y));
  h.element.fire('keydown', { key: 'Escape' }); h.flush(); assert.deepEqual(h.geometry().arcs, before);
  h.element.fire('pointerup', { pointerId: 1 }); assert.equal(h.opened.length, 0);
});

test('悬停与键盘突出一跳邻域，节点拖动只改本节点且连线同步，Esc恢复不打开', t => {
  const h = harness(t, small, { reduced: true }); h.flush();
  const before = h.geometry().arcs.map(node => ({ ...node }));
  const at = before[0];
  assert.equal(h.edgeLayers.length, 0, '常见规模不建立低分辨率整图位图');
  h.element.fire('pointermove', { clientX: at.x, clientY: at.y }); h.flush();
  assert.ok(h.geometry().fills[2].alpha < h.geometry().fills[1].alpha);
  assert.ok(h.geometry().segments.length > 0);
  assert.equal(h.geometry().fills[0].color, '#d80');
  h.element.fire('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: at.x, clientY: at.y });
  h.element.fire('pointermove', { pointerId: 1, clientX: at.x + 50, clientY: at.y + 20 }); h.flush();
  assert.equal(h.geometry().layersDrawn.length, 0);
  assert.equal(h.geometry().arcs[0].x, at.x + 50);
  assert.deepEqual(h.geometry().arcs[1], before[1]);
  assert.ok(h.geometry().segments.some(line => Math.abs(line.from.x - at.x - 50) < 1e-8 && Math.abs(line.from.y - at.y - 20) < 1e-8));
  h.element.fire('keydown', { key: 'Escape' }); h.flush();
  assert.deepEqual(h.geometry().arcs, before); assert.equal(h.element.captured, null);
  h.element.fire('pointerup', { pointerId: 1, clientX: at.x, clientY: at.y }); assert.equal(h.opened.length, 0);
  assert.equal(h.element.title, '');
  h.element.fire('keydown', { key: 'Home' }); h.flush();
  assert.equal(h.element.title, small.nodes[0].title);
  assert.ok(h.geometry().fills[2].alpha < h.geometry().fills[1].alpha);
});

test('节点松开保留位置，普通点击不拆缓存，指针取消恢复且根容器填满父布局', t => {
  const h = harness(t, small, { reduced: true }); h.flush();
  assert.equal(h.render().props.style.height, '100%'); assert.equal(h.render().props.style.flex, 1); assert.equal(h.render().props.style.minHeight, 0);
  const at = h.geometry().arcs[0]; const layers = h.edgeLayers.length;
  for (const name of ['pointerdown', 'pointerup']) h.element.fire(name, { button: 0, isPrimary: true, pointerId: 1, clientX: at.x, clientY: at.y });
  h.flush(); assert.equal(h.edgeLayers.length, layers); assert.equal(h.opened.length, 1);
  h.element.fire('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: at.x, clientY: at.y });
  h.element.fire('pointermove', { pointerId: 1, clientX: at.x + 40, clientY: at.y + 15 }); h.flush();
  const moved = h.geometry().arcs.map(node => ({ ...node }));
  h.element.fire('pointerup', { pointerId: 1 }); h.flush();
  assert.deepEqual(h.geometry().arcs, moved); h.render(); assert.deepEqual(h.geometry().arcs, moved);
  assert.ok(h.geometry().segments.some(line => line.from.x === moved[0].x && line.to.x === moved[1].x));
  h.element.fire('pointerdown', { button: 0, isPrimary: true, pointerId: 2, clientX: moved[0].x, clientY: moved[0].y });
  h.element.fire('pointermove', { pointerId: 2, clientX: moved[0].x + 70, clientY: moved[0].y + 25 }); h.flush();
  h.element.fire('pointercancel', { pointerId: 99 }); assert.equal(h.element.captured, 2);
  h.element.fire('pointercancel', { pointerId: 2 }); h.flush();
  assert.deepEqual(h.geometry().arcs, moved); assert.equal(h.element.captured, null); assert.equal(h.opened.length, 1);
});

test('高密度拖节点只重建一次排除层，逐帧有界且松开恢复全部20万边', t => {
  const count = 1000;
  const nodes = Array.from({ length: count }, (_, i) => ({ path: `${i}`, title: `笔记${i}`, degree: count - 1 }));
  const edges = Array.from({ length: 200000 }, (_, i) => ({ source: `${i % count}`, target: `${(i % count + 1 + Math.floor(i / count)) % count}` }));
  const h = harness(t, { nodes, edges }, { reduced: true }); h.flush();
  const at = h.geometry().arcs[0], oldLayer = h.edgeLayers.at(-1), layerCount = h.edgeLayers.length;
  h.element.fire('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: at.x, clientY: at.y });
  for (let i = 1; i <= 60; i++) {
    const before = h.geometry().lines;
    h.element.fire('pointermove', { pointerId: 1, clientX: at.x + 10 + i, clientY: at.y + i / 3 });
    assert.equal(h.geometry().lines, before, 'pointermove本身不扫描绘制全部边');
    h.flush(1);
    assert.ok(h.geometry().lines - before <= 4096 + count, '单帧只处理一个背景批次和一跳邻居');
    assert.equal(h.edgeLayers.length, layerCount + 1);
    assert.equal(h.geometry().layersDrawn.includes(oldLayer), false);
  }
  assert.equal(oldLayer.width, 0);
  h.element.fire('pointerup', { pointerId: 1 });
  assert.equal(h.render().props.children[0].props['aria-busy'], true);
  h.flush(); assert.equal(h.edgeLayers.at(-1).lines, edges.length); assert.equal(h.render().props.children[0].props['aria-busy'], false);
  assert.ok(h.geometry().widestFrame < 100, `最长计算帧 ${h.geometry().widestFrame}ms`);
  t.diagnostic(JSON.stringify({ interaction: '1000节点/200000边持续拖动60帧', longestComputeFrameMs: Math.round(h.geometry().widestFrame), raster: '真实Canvas由浏览器验收' }));
});

test('拖动背景的主题替换、失捕获、隐藏和卸载废弃旧构建，迟到帧不覆盖恢复位置', t => {
  const count = 100;
  const nodes = Array.from({ length: count }, (_, i) => ({ path: `${i}`, title: `笔记${i}`, degree: count - 1 }));
  const edges = Array.from({ length: 9000 }, (_, i) => ({ source: `${i % count}`, target: `${(i % count + 1 + Math.floor(i / count)) % count}` }));
  const h = harness(t, { nodes, edges }, { reduced: true }); h.flush();
  const before = h.geometry().arcs.map(node => ({ ...node }));
  const start = () => {
    h.element.fire('pointerdown', { button: 0, isPrimary: true, pointerId: 5, clientX: before[0].x, clientY: before[0].y });
    h.element.fire('pointermove', { pointerId: 5, clientX: before[0].x + 50, clientY: before[0].y + 30 }); h.flush(1);
    assert.equal(h.render().props.children[0].props['aria-busy'], true);
    return h.edgeLayers.at(-1);
  };
  const pending = start();
  h.callbacks.forEach(callback => callback()); assert.equal(pending.width, 0); h.flush(1);
  const recolored = h.edgeLayers.at(-1);
  h.element.fire('lostpointercapture', { pointerId: 5 }); assert.equal(recolored.width, 0); h.flush();
  assert.deepEqual(h.geometry().arcs, before); assert.equal(h.edgeLayers.at(-1).lines, 4950);
  const hidden = start(), late = [...h.frames.values()][0];
  h.document.hidden = true; h.document.fire('visibilitychange');
  assert.equal(hidden.width, 0); assert.equal(h.element.captured, null);
  const lineCount = h.geometry().lines; late(); assert.equal(h.geometry().lines, lineCount);
  h.document.hidden = false; h.document.fire('visibilitychange'); h.flush();
  assert.deepEqual(h.geometry().arcs, before); assert.equal(h.edgeLayers.at(-1).lines, 4950);
  start(); const afterUnmount = [...h.frames.values()][0]; h.unmount(); const finalCount = h.geometry().lines; afterUnmount();
  assert.equal(h.geometry().lines, finalCount); assert.equal(h.frames.size, 0); assert.equal(h.element.captured, null);
  assert.ok(h.edgeLayers.every(layer => layer.width === 0 && layer.height === 0));
  assert.equal(h.observers.size, 0); assert.equal(h.callbacks.size, 0); assert.equal(h.opened.length, 0);
});

test('新图有界关联展开，度数控制半径；重渲染不重启布局或镜头', t => {
  const h = harness(t, small);
  const initial = createGraphLayout(small); const first = initial.nodes.map(node => [node.x, node.y]); initial.simulation.stop();
  const runs = h.flush(); const geometry = h.geometry();
  assert.ok(runs <= 301 && h.frames.size === 0);
  assert.notDeepEqual(geometry.arcs.map(node => [node.x, node.y]), first);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(distance(geometry.arcs[0], geometry.arcs[1]) < distance(geometry.arcs[0], geometry.arcs[2]));
  assert.ok(geometry.arcs[0].r > geometry.arcs[1].r && geometry.arcs[1].r > geometry.arcs[2].r);
  h.wheel(-100, 250, 150); const zoomed = h.geometry().arcs;
  h.render(); assert.equal(h.frames.size, 0); assert.deepEqual(h.geometry().arcs, zoomed);
});

test('滚轮保留鼠标锚点，边保持细淡，倍率有界且适应全部复位', t => {
  const h = harness(t, small); h.flush();
  const before = h.geometry().arcs.map(node => ({ ...node }));
  h.wheel(100, 250, 150);
  const after = h.geometry().arcs;
  const ratio = (after[0].x - 250) / (before[0].x - 250);
  assert.ok(ratio > 0 && ratio < 1);
  assert.ok(Math.abs((after[1].y - 150) / (before[1].y - 150) - ratio) < 1e-8);
  assert.ok(h.geometry().edgePaints.every(paint => paint.width === 0.6));
  assert.ok(h.geometry().compositeAlpha.every(alpha => alpha <= 0.2));
  for (let i = 0; i < 30; i++) h.wheel(-1000, 450, 280);
  const extreme = h.geometry().arcs.map(node => ({ ...node })); h.wheel(-1000, 450, 280);
  assert.deepEqual(h.geometry().arcs, extreme);
  h.render().props.children[1].props.onClick(); h.flush(); assert.deepEqual(h.geometry().arcs, before);
});

test('主按钮拖动后不误开笔记，单击与键盘调用节点对象，禁用时不打开', t => {
  const h = harness(t, small); h.flush();
  const at = h.geometry().arcs[0];
  h.element.fire('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: at.x, clientY: at.y });
  h.element.fire('pointermove', { pointerId: 1, clientX: at.x + 60, clientY: at.y + 30 }); h.flush();
  h.element.fire('pointerup', { pointerId: 1, clientX: at.x + 60, clientY: at.y + 30 });
  assert.equal(h.opened.length, 0); assert.equal(h.element.captured, null);
  const target = h.geometry().arcs[0];
  for (const name of ['pointerdown', 'pointerup']) h.element.fire(name, { button: 0, isPrimary: true, pointerId: 1, clientX: target.x, clientY: target.y });
  assert.equal(h.opened[0], small.nodes[0]);
  h.element.fire('keydown', { key: 'Home' }); h.flush();
  assert.equal(h.element.title, small.nodes[0].title);
  h.element.fire('keydown', { key: 'Enter' }); assert.equal(h.opened.length, 2);
  h.render({ disabled: true }); h.element.fire('keydown', { key: 'Enter' }); assert.equal(h.opened.length, 2);
  h.element.fire('pointerdown', { button: 0, isPrimary: true, pointerId: 3, clientX: 20, clientY: 20 });
  h.element.fire('pointercancel'); assert.equal(h.element.captured, null);
});

test('换图卸载、隐藏、媒体与主题变化均有资源清理，减弱动态只绘制稳定结果', t => {
  const h = harness(t, small, { reduced: true });
  h.flush(); assert.equal(h.geometry().arcs.length, 3); assert.equal(h.frames.size, 0);
  h.callbacks.forEach(fn => fn()); assert.equal(h.frames.size, 1); h.flush();
  h.render({ graph: { ...small, nodes: [...small.nodes] } }); assert.equal(h.observers.size, 1);
  h.document.hidden = true; h.document.fire('visibilitychange'); assert.equal(h.frames.size, 0);
  h.document.hidden = false; h.document.fire('visibilitychange'); h.flush();
  h.unmount(); assert.equal(h.element.count(), 0); assert.equal(h.document.count(), 0); assert.equal(h.media.count(), 0);
  assert.equal(h.observers.size, 0); assert.equal(h.callbacks.size, 0); assert.equal(h.frames.size, 0);
  assert.ok(h.edgeLayers.every(layer => layer.width === 0 && layer.height === 0)); assert.equal(h.timers.size, 0);
});

test('密集图不裁节点或边，长标题按空间显现而焦点标题完整', t => {
  const graph = { nodes: Array.from({ length: 100 }, (_, i) => ({ path: `${i}`, title: `第${i}篇很长很长的中文文章标题需要保持可读`, degree: 2 })), edges: [] };
  const h = harness(t, graph, { width: 360, reduced: true }); h.flush();
  assert.equal(h.geometry().arcs.length, 100);
  assert.ok(h.geometry().labels.length < 100);
  h.element.fire('keydown', { key: 'End' }); h.flush(); assert.equal(h.element.title, graph.nodes[99].title);
});

test('常见规模缩放与重置按实时几何精绘，不建立位图且取消待执行精绘', t => {
  const h = harness(t, small); h.flush();
  const before = h.geometry().arcs.map(node => ({ ...node }));
  for (const reset of [() => h.element.fire('keydown', { key: '0' }), () => h.render().props.children[1].props.onClick()]) {
    h.wheel(-160, 450, 280); h.wheel(-160, 450, 280); h.refine();
    assert.equal(h.edgeLayers.length, 0);
    assert.equal(h.geometry().segments.length, 1, '两端离屏仍提交穿越视口的真实几何线');
    assert.equal(h.geometry().strokePaints.at(-1).width, 0.7);
    assert.equal(h.timers.size, 0);
    const lines = h.geometry().lines;
    reset();
    assert.equal(h.render().props.children[0].props['aria-busy'], false);
    h.flush();
    assert.deepEqual(h.geometry().arcs, before);
    assert.equal(h.geometry().lines, lines + small.edges.length);
    assert.equal(h.edgeLayers.length, 0);
    assert.equal(h.render().props.children[0].props['aria-busy'], false);
    h.wheel(-160, 450, 280); assert.equal(h.timers.size, 1);
    reset(); h.flush(); assert.equal(h.timers.size, 0);
    const completed = h.geometry().lines;
    h.refine(); assert.equal(h.geometry().lines, completed);
  }
});

test('边分批绘制到全部完成才解除busy，镜头只重投影缓存，精绘仍保留所有边', t => {
  const nodes = Array.from({ length: 100 }, (_, i) => ({ path: `${i}`, title: `文章${i}`, degree: 99 }));
  const graph = { nodes, edges: Array.from({ length: 9000 }, (_, i) => ({ source: `${i % 100}`, target: `${(i % 100 + 1 + Math.floor(i / 100)) % 100}` })) };
  const h = harness(t, graph, { reduced: true });
  while (h.geometry().lines === 0) h.flush(1);
  assert.equal(h.geometry().lines, 4096);
  assert.equal(h.render().props.children[0].props['aria-busy'], true);
  h.flush(); assert.equal(h.geometry().lines, 4950, '9000个有向引用投影为4950个无向笔记对');
  assert.equal(h.render().props.children[0].props['aria-busy'], false);
  h.wheel(-160, 450, 280); h.wheel(-160, 450, 280);
  assert.equal(h.geometry().lines, 4950, '压力规模镜头反馈不重新构造边路径');
  h.refine(); assert.equal(h.geometry().lines, 9900, '精绘必须保留全部不同端点对');
  assert.equal(h.edgeLayers.at(-1).width, 900, '稳定缩放按当前视口DPR重绘，不放大全图位图');
  assert.equal(h.render().props.children[0].props['aria-busy'], false);
  h.render({ graph: { ...graph } });
  while (h.geometry().lines === 9900) h.flush(1);
  const oldFrame = [...h.frames.values()][0];
  h.document.hidden = true; h.document.fire('visibilitychange');
  assert.equal(h.frames.size, 0);
  const before = h.geometry().lines; oldFrame(); assert.equal(h.geometry().lines, before);
  h.document.hidden = false; h.document.fire('visibilitychange'); h.flush();
  assert.equal(h.geometry().lines, before + 4950);
  h.wheel(-160, 450, 280); const late = [...h.timers.values()][0];
  h.unmount(); late(); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
  assert.ok(h.edgeLayers.every(layer => layer.width === 0 && layer.height === 0));
});

for (const [nodeCount, edgeCount] of [[300, 50000], [1000, 200000]]) test(`图谱规模基准 ${nodeCount} 节点/${edgeCount} 连线：有界计算、全部绘制与取消`, t => {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({ path: `${i}`, title: `知识 ${i}`, degree: nodeCount - 1 }));
  const edges = Array.from({ length: edgeCount }, (_, i) => ({ source: `${i % nodeCount}`, target: `${(i % nodeCount + 1 + Math.floor(i / nodeCount)) % nodeCount}` }));
  const start = performance.now();
  const h = harness(t, { nodes, edges }, { reduced: true }); h.flush();
  const elapsed = performance.now() - start, measured = h.geometry();
  const pairCount = new Set(edges.map(({ source, target }) => [Number(source), Number(target)].sort((a, b) => a - b).join(':'))).size;
  assert.equal(h.frames.size, 0); assert.equal(measured.lines, pairCount); assert.equal(measured.arcs.length, nodeCount);
  const xs = measured.arcs.map(node => node.x), ys = measured.arcs.map(node => node.y);
  const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  const cover = measured.arcs.reduce((sum, node) => sum + Math.PI * node.r ** 2, 0) / area;
  assert.ok(cover <= 0.201, `密集压力图仍为关系留白，节点面积占比 ${cover}`);
  assert.ok(measured.arcs.every(node => node.r >= 1.7), '全景节点保持可识别尺寸');
  assert.ok(measured.labels.length > 4, '空间允许时不固定压制为四个标题');
  const initialRadius = Math.max(...measured.arcs.map(node => node.r));
  h.wheel(-160, 450, 280);
  assert.ok(Math.max(...h.geometry().arcs.map(node => node.r)) > initialRadius);
  assert.ok(elapsed < 2500, `布局处理超时 ${elapsed} ms`);
  assert.ok(measured.widestFrame < 100, `最长计算帧 ${measured.widestFrame} ms`);
  t.diagnostic(JSON.stringify({ nodeCount, edgeCount, elapsedMs: Math.round(elapsed), longestComputeFrameMs: Math.round(measured.widestFrame), raster: '未在Node测量；真实Canvas由浏览器验收' }));
  h.unmount(); assert.equal(h.frames.size, 0);
});
