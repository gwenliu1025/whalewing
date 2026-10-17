import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY, forceCollide } from 'd3-force';

const radius = degree => 3 + Math.min(10, Math.sqrt(degree) * 1.3);

/** 有向引用仍属于知识服务；几何投影不重复计算双向弹簧，也不修改响应。 */
export function createGraphLayout(graph) {
  // 物理节点保持固定字段与数值槽位；笔记/缺失节点元数据仍由原响应供画布消费。
  // 不把可选业务字段带入 D3 热循环，避免多种对象形状使每次力计算退化。
  const nodes = graph.nodes.map(node => ({ path: node.path, degree: node.degree, index: 0, x: node.x ?? NaN, y: node.y ?? NaN, vx: node.vx ?? NaN, vy: node.vy ?? NaN, fx: node.fx, fy: node.fy }));
  const index = new Map(nodes.map((node, i) => [node.path, i]));
  const unique = new Map();
  for (const edge of graph.edges) {
    const a = index.get(edge.source), b = index.get(edge.target);
    if (a === undefined || b === undefined) throw new Error('图谱边缺少端点');
    if (a !== b) unique.set(a < b ? `${a}:${b}` : `${b}:${a}`, [Math.min(a, b), Math.max(a, b)]);
  }
  const edges = [...unique.values()];
  const neighbors = Array.from({ length: nodes.length }, () => new Set());
  for (const [a, b] of edges) { neighbors[a].add(b); neighbors[b].add(a); }
  // 小型局部图的中心力随规模减弱，避免孤点比真实邻居更贴近中心。
  const gravity = Math.min(0.06, nodes.length * 0.002);
  // 唯一帧调度器手动推进；D3 不持有另一条持续更新坐标的定时循环。
  const simulation = forceSimulation(nodes).stop()
    .force('link', forceLink(edges.map(([source, target]) => ({ source, target }))).distance(60))
    .force('charge', forceManyBody().strength(-60).theta(1.1))
    .force('center', forceCenter())
    .force('x', forceX().strength(gravity))
    .force('y', forceY().strength(gravity))
    .force('collision', forceCollide(node => radius(node.degree) + 2));
  return { nodes, edges, neighbors, simulation };
}

/** 图谱仅持有可重建布局与镜头；知识关系及连接度始终由知识服务提供。 */
export function createGraphCanvas(React) {
  const { createElement: h, useEffect, useRef, useState } = React;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  return function GraphCanvas({ graph, selectedPath, disabled, onOpenNote, label, resetLabel, loadingLabel, canvasErrorLabel, dataErrorLabel, subscribeTheme }) {
    const canvas = useRef(null);
    const controller = useRef(null);
    const latest = useRef(null);
    latest.current = { selectedPath, disabled, onOpenNote };
    const [focused, setFocused] = useState(null);
    const [settling, setSettling] = useState(true);
    const [painted, setPainted] = useState(0);
    const [edgeCount, setEdgeCount] = useState(0);
    const [error, setError] = useState('');
    useEffect(() => {
      const element = canvas.current;
      const context = element.getContext('2d');
      if (!context) { setError(canvasErrorLabel); setSettling(false); return; }
      setError(''); setSettling(true); setPainted(0); setFocused(null);
      const nodes = graph.nodes;
      const n = nodes.length;
      const index = new Map(nodes.map((node, i) => [node.path, i]));
      let layout;
      try { layout = createGraphLayout(graph); } catch {
        setError(dataErrorLabel); setSettling(false); return;
      }
      const { edges, neighbors, simulation } = layout;
      setEdgeCount(edges.length);
      const direct = edges.length <= 4096;
      const x = new Float64Array(n), y = new Float64Array(n);
      const sx = new Float64Array(n), sy = new Float64Array(n), sizes = new Float64Array(n);
      const priorities = nodes.map((_, i) => i).sort((a, b) => nodes[b].degree - nodes[a].degree || a - b);
      for (let i = 0; i < n; i++) {
        x[i] = layout.nodes[i].x; y[i] = layout.nodes[i].y;
      }
      let width = 1, height = 1, pixelRatio = 1, frame = 0, alive = true;
      let hover = -1, keyboard = -1, drag = null, touched = false;
      let steps = 0, running = n > 1, palette, labelCache = [], labelSelection = null;
      let edgeCache = null, building = null, refineTimer = 0;
      const camera = { k: 1, x: 0, y: 0 };
      let fittedScale = 1;
      const colors = () => {
        const style = getComputedStyle(element);
        palette = {
          background: style.getPropertyValue('--dsw-alias-bg-layer-1').trim(),
          foreground: style.getPropertyValue('--dsw-alias-label-primary').trim(),
          edge: style.getPropertyValue('--dsw-alias-label-secondary').trim(),
          accent: style.getPropertyValue('--dsw-alias-state-business-primary').trim(),
        };
      };
      const prepareLabels = () => {
        labelSelection = null;
        context.font = '12px sans-serif';
        const limit = Math.max(12, Math.min(170, width - 24));
        // 字体度量只在图或容器尺寸改变时进行，避免长中文标题在每帧重复测量。
        labelCache = nodes.map(node => {
          const title = node.title;
          if (context.measureText(title).width <= limit) return { text: title, width: context.measureText(title).width + 8 };
          let low = 0, high = title.length;
          while (low < high) { const middle = Math.ceil((low + high) / 2); if (context.measureText(`${title.slice(0, middle)}…`).width <= limit) low = middle; else high = middle - 1; }
          const text = `${title.slice(0, low)}…`;
          return { text, width: context.measureText(text).width + 8 };
        });
      };
      const fittedCamera = () => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < n; i++) { minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]); minY = Math.min(minY, y[i]); maxY = Math.max(maxY, y[i]); }
        if (!n) { minX = minY = maxX = maxY = 0; }
        const scale = Math.min(Math.max(1, width - 70) / Math.max(100, maxX - minX), Math.max(1, height - 70) / Math.max(100, maxY - minY));
        const k = clamp(scale, 0.08, 8);
        return { k, x: width / 2 - (minX + maxX) / 2 * k, y: height / 2 - (minY + maxY) / 2 * k };
      };
      const fit = () => { Object.assign(camera, fittedCamera()); fittedScale = camera.k; labelSelection = null; };
      const releaseLayer = cache => { if (cache) cache.layer.width = cache.layer.height = 0; };
      const beginEdges = () => {
        if (!alive || document.hidden || running) return;
        if (direct) { setSettling(false); setPainted(edges.length); schedule(); return; }
        releaseLayer(building);
        const layer = document.createElement('canvas');
        const ctx = layer.getContext('2d', { willReadFrequently: true });
        if (!ctx) { setError(canvasErrorLabel); setSettling(false); return; }
        // 压力规模按当前视口和DPR精绘；缓存重投影仅用于镜头交互中的暂态反馈。
        const base = { ...camera }, density = pixelRatio;
        layer.width = Math.max(1, Math.round(width * density)); layer.height = Math.max(1, Math.round(height * density));
        ctx.setTransform(density, 0, 0, density, 0, 0);
        ctx.strokeStyle = palette.edge; ctx.lineWidth = 0.7;
        building = { layer, ctx, camera: base, width, height, next: 0, omit: drag?.moved && drag.node >= 0 ? drag.node : -1 };
        setSettling(true); setPainted(0); schedule();
      };
      const paintEdges = () => {
        if (!building) return;
        // 同一条线在高密屏覆盖更多像素；按像素密度收紧批次，保留全部边而不阻塞交互。
        const cache = building, batch = Math.max(1, Math.floor((pixelRatio > 1 ? 3072 : 4096) / (pixelRatio * pixelRatio)));
        const end = Math.min(edges.length, cache.next + batch), base = cache.camera;
        cache.ctx.beginPath();
        for (let i = cache.next; i < end; i++) {
          const [a, b] = edges[i];
          if (a === cache.omit || b === cache.omit) continue;
          cache.ctx.moveTo(x[a] * base.k + base.x, y[a] * base.k + base.y);
          cache.ctx.lineTo(x[b] * base.k + base.x, y[b] * base.k + base.y);
        }
        cache.ctx.stroke();
        // 每批只读一个像素以完成该批光栅，避免最终drawImage一次等待全部200k路径。
        if (end > cache.next) cache.ctx.getImageData(0, 0, 1, 1);
        cache.next = end; setPainted(end);
        if (end === edges.length) { releaseLayer(edgeCache); edgeCache = cache; building = null; setSettling(false); }
      };
      const draw = () => {
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, width, height);
        for (let i = 0; i < n; i++) {
          sx[i] = x[i] * camera.k + camera.x; sy[i] = y[i] * camera.k + camera.y;
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, nodeArea = 0;
        for (let i = 0; i < n; i++) {
          minX = Math.min(minX, sx[i]); maxX = Math.max(maxX, sx[i]);
          minY = Math.min(minY, sy[i]); maxY = Math.max(maxY, sy[i]);
          nodeArea += Math.PI * radius(nodes[i].degree) ** 2;
        }
        // 密集全连接压力图仍留出关系空间；真实稀疏图不再被统一压成细小黑点。
        const packing = n > 80 ? Math.min(Math.sqrt(camera.k), Math.sqrt(Math.max(1, (maxX - minX) * (maxY - minY)) * 0.2 / nodeArea)) : Math.sqrt(camera.k);
        for (let i = 0; i < n; i++) sizes[i] = clamp(radius(nodes[i].degree) * packing, 1.7, 18);
        const emphasized = hover >= 0 ? hover : keyboard;
        const related = i => i === emphasized || (emphasized >= 0 && neighbors[emphasized].has(i));
        const cache = edgeCache || building;
        const edgeAlpha = clamp(0.3 / Math.sqrt(1 + edges.length / Math.max(n, 1) / 4), 0.035, 0.24) * (emphasized >= 0 ? 0.2 : 1);
        if (direct && !running) {
          // 常见知识库直接按当前像素绘制全部几何线，缩放稳定结果不依赖位图插值。
          context.beginPath(); context.lineWidth = 0.7; context.strokeStyle = palette.edge; context.globalAlpha = edgeAlpha;
          for (const [a, b] of edges) { context.moveTo(sx[a], sy[a]); context.lineTo(sx[b], sy[b]); }
          context.stroke(); context.globalAlpha = 1;
        }
        if (cache) {
          const ratio = camera.k / cache.camera.k;
          // 镜头交互暂时投影视口缓存；停止后按新镜头分批重绘当前像素。
          context.globalAlpha = edgeAlpha;
          context.drawImage(cache.layer, camera.x - cache.camera.x * ratio, camera.y - cache.camera.y * ratio, cache.width * ratio, cache.height * ratio);
          context.globalAlpha = 1;
        }
        // 聚焦与拖动复用同一无向邻居投影，不另解释方向或重复引用。
        const moving = cache?.omit ?? -1;
        for (const node of new Set([moving, emphasized])) {
          if (node < 0) continue;
          context.beginPath(); context.lineWidth = node === emphasized ? 1 : 0.6;
          context.strokeStyle = node === emphasized ? palette.accent : palette.edge;
          context.globalAlpha = node === emphasized ? 0.7 : 0.2;
          for (const other of neighbors[node]) {
            context.moveTo(sx[node], sy[node]); context.lineTo(sx[other], sy[other]);
          }
          context.stroke(); context.globalAlpha = 1;
        }
        const chosen = index.get(latest.current.selectedPath);
        for (let i = 0; i < n; i++) {
          if (sx[i] < -24 || sy[i] < -24 || sx[i] > width + 24 || sy[i] > height + 24) continue;
          context.beginPath(); context.arc(sx[i], sy[i], sizes[i], 0, Math.PI * 2);
          context.globalAlpha = emphasized >= 0 && !related(i) ? 0.18 : 1;
          const color = i === chosen || i === hover || i === keyboard ? palette.accent : palette.foreground;
          context.fillStyle = nodes[i].kind === 'missing' ? palette.background : color;
          context.fill();
          // 缺失身份只用于关系投影；空心节点与实际可读笔记区分，点击仍返回完整节点。
          if (nodes[i].kind === 'missing') { context.lineWidth = 1.3; context.strokeStyle = color; context.stroke(); }
          if (i === keyboard) { context.lineWidth = 2; context.strokeStyle = palette.accent; context.stroke(); }
        }
        context.globalAlpha = 1;
        // 在镜头平移之外选定标签，再做视口裁剪；出屏候选仍占位，不挤换可见标题。
        if (!labelSelection) {
          const occupied = [];
          const budget = n > 80 ? Math.max(8, Math.floor(width * height / 30000 * (camera.k / fittedScale) ** 2)) : n;
          labelSelection = [];
          if (camera.k >= 0.15) for (const i of priorities) {
            if (labelSelection.length >= budget) break;
            const rect = { left: x[i] * camera.k - labelCache[i].width / 2, top: y[i] * camera.k + sizes[i] + 5, width: labelCache[i].width };
            if (occupied.some(other => rect.left < other.left + other.width && rect.left + rect.width > other.left && rect.top < other.top + 17 && rect.top + 17 > other.top)) continue;
            occupied.push(rect); labelSelection.push(i);
          }
        }
        const order = [...new Set([...labelSelection, chosen, keyboard, hover])].filter(i => i !== undefined && i >= 0);
        context.font = '12px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'top';
        for (const i of order) {
          const { text, width: textWidth } = labelCache[i];
          const left = sx[i] - textWidth / 2, top = sy[i] + sizes[i] + 5;
          if (left < 2 || left + textWidth > width - 2 || top < 2 || top + 17 > height - 2) continue;
          context.globalAlpha = emphasized >= 0 && !related(i) ? 0.25 : 1;
          context.lineWidth = 4; context.strokeStyle = palette.background; context.strokeText(text, sx[i], top);
          context.fillStyle = palette.foreground; context.fillText(text, sx[i], top);
        }
        context.globalAlpha = 1;
      };
      const step = () => {
        labelSelection = null;
        simulation.tick();
        for (let i = 0; i < n; i++) {
          x[i] = layout.nodes[i].x; y[i] = layout.nodes[i].y;
        }
        steps++;
        return steps < 300;
      };
      const tick = () => {
        frame = 0;
        if (!alive || document.hidden) return;
        if (running) {
          const until = performance.now() + 6;
          do { running = step(); } while (running && performance.now() < until);
          if (!running) { if (!touched) fit(); beginEdges(); }
        }
        if (!direct && !running && !building && !edgeCache) beginEdges();
        paintEdges();
        // 未收敛坐标不呈现为可交互图，首个可见帧只使用最终 fit，避免缩放跳变。
        if (!running) draw();
        if (running || building) schedule();
      };
      const schedule = () => { if (alive && !frame && !document.hidden) frame = requestAnimationFrame(tick); };
      const stopDrag = (cancel = false) => {
        const ended = drag;
        drag = null; element.style.cursor = 'grab';
        if (!ended) return;
        if (element.hasPointerCapture(ended.id)) element.releasePointerCapture(ended.id);
        if (ended.moved && ended.node >= 0) {
          if (cancel) { x[ended.node] = ended.origin.x; y[ended.node] = ended.origin.y; }
          labelSelection = null; beginEdges(); schedule();
        } else if (cancel && ended.moved) { Object.assign(camera, ended.camera); schedule(); }
        if (ended.moved && ended.node < 0) beginEdges();
      };
      const point = event => { const rect = element.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
      const hit = point => {
        if (running) return -1;
        let found = -1, distance = Infinity;
        for (let i = 0; i < n; i++) {
          const d = (sx[i] - point.x) ** 2 + (sy[i] - point.y) ** 2;
          if (d < Math.max(9, sizes[i]) ** 2 && d < distance) { found = i; distance = d; }
        }
        return found;
      };
      const focus = i => {
        setFocused(i < 0 ? null : nodes[i]);
        element.title = i < 0 ? '' : nodes[i].title;
        schedule();
      };
      const zoom = (factor, anchor) => {
        const next = clamp(camera.k * factor, 0.08, 8), ratio = next / camera.k;
        camera.x = anchor.x - (anchor.x - camera.x) * ratio;
        camera.y = anchor.y - (anchor.y - camera.y) * ratio;
        camera.k = next; touched = true; labelSelection = null; schedule();
        clearTimeout(refineTimer);
        refineTimer = setTimeout(() => { refineTimer = 0; beginEdges(); }, 120);
      };
      const wheel = event => {
        event.preventDefault();
        if (drag || running) return;
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
        zoom(Math.exp(-clamp(event.deltaY * unit, -160, 160) * 0.003), point(event));
      };
      const down = event => {
        if (event.button !== 0 || !event.isPrimary || drag || running) return;
        event.preventDefault(); element.focus();
        const p = point(event);
        const node = hit(p);
        drag = { id: event.pointerId, start: p, moved: false, node, origin: node >= 0 ? { x: x[node], y: y[node] } : null, camera: { ...camera } };
        if (node >= 0) { hover = node; focus(node); }
        element.setPointerCapture(event.pointerId); element.style.cursor = 'grabbing';
      };
      const move = event => {
        const p = point(event);
        if (drag && drag.id === event.pointerId) {
          if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4) {
            drag.moved = true; running = false;
            if (drag.node >= 0) {
              // 仅越过拖动阈值才丢弃含旧端点的层；随后每帧只更新一跳连线。
              releaseLayer(edgeCache); edgeCache = null; beginEdges();
            } else if (!edgeCache && !building) beginEdges();
          }
          if (drag.moved) {
            const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
            if (drag.node >= 0) { x[drag.node] = drag.origin.x + dx / camera.k; y[drag.node] = drag.origin.y + dy / camera.k; labelSelection = null; }
            else { camera.x = drag.camera.x + dx; camera.y = drag.camera.y + dy; }
            touched = true; schedule();
          }
        } else if (!drag) {
          const next = hit(p);
          if (next !== hover) { hover = next; focus(hover); element.style.cursor = hover < 0 ? 'grab' : 'pointer'; }
        }
      };
      const up = event => {
        if (!drag || drag.id !== event.pointerId) return;
        const selected = drag.moved ? -1 : drag.node;
        stopDrag();
        if (selected >= 0 && !latest.current.disabled) latest.current.onOpenNote(nodes[selected]);
      };
      const leave = () => { if (!drag) { hover = -1; focus(keyboard); } };
      const reset = () => {
        // 两个重置入口同时恢复镜头与边缓存，避免保留放大后的精绘线宽。
        clearTimeout(refineTimer); refineTimer = 0;
        stopDrag(true); hover = keyboard = -1; focus(-1); touched = false; fit(); beginEdges(); schedule();
      };
      const key = event => {
        if (event.key === 'Escape') { event.preventDefault(); stopDrag(true); hover = keyboard = -1; focus(-1); return; }
        if (drag || running) return;
        if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key) && n) {
          event.preventDefault();
          keyboard = event.key === 'Home' ? 0 : event.key === 'End' ? n - 1 : (keyboard + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + n) % n;
          hover = -1;
          if (sx[keyboard] < 30 || sy[keyboard] < 30 || sx[keyboard] > width - 30 || sy[keyboard] > height - 45) { camera.x = width / 2 - x[keyboard] * camera.k; camera.y = height / 2 - y[keyboard] * camera.k; touched = true; beginEdges(); }
          focus(keyboard);
        } else if (['Enter', ' '].includes(event.key) && keyboard >= 0) {
          event.preventDefault(); if (!latest.current.disabled) latest.current.onOpenNote(nodes[keyboard]);
        } else if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); zoom(event.key === '-' ? 0.8 : 1.25, { x: width / 2, y: height / 2 }); }
        else if (event.key === '0') { event.preventDefault(); reset(); }
      };
      const blur = () => { keyboard = -1; focus(hover); };
      const resize = () => {
        const rect = element.getBoundingClientRect();
        const nextWidth = Math.max(1, rect.width), nextHeight = Math.max(1, rect.height), nextRatio = Math.max(1, window.devicePixelRatio || 1);
        // ResizeObserver 首次通知及相同尺寸重渲染不清空画布或重置焦点镜头。
        if (nextWidth === width && nextHeight === height && nextRatio === pixelRatio && element.width === Math.round(width * pixelRatio) && element.height === Math.round(height * pixelRatio)) return;
        stopDrag(true);
        const oldWidth = width, oldHeight = height;
        width = nextWidth; height = nextHeight;
        pixelRatio = nextRatio;
        element.width = Math.round(width * pixelRatio); element.height = Math.round(height * pixelRatio);
        prepareLabels();
        if (!touched) fit(); else { camera.x += (width - oldWidth) / 2; camera.y += (height - oldHeight) / 2; }
        if (!running) beginEdges();
        schedule();
      };
      const visibility = () => {
        if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; stopDrag(true); clearTimeout(refineTimer); refineTimer = 0; releaseLayer(building); building = null; }
        else { beginEdges(); schedule(); }
      };
      const cancelDrag = event => {
        if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.id)) return;
        stopDrag(true); hover = keyboard = -1; focus(-1);
      };
      const listeners = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancelDrag, lostpointercapture: cancelDrag, pointerleave: leave, keydown: key, blur };
      for (const [name, handler] of Object.entries(listeners)) element.addEventListener(name, handler);
      element.addEventListener('wheel', wheel, { passive: false });
      document.addEventListener('visibilitychange', visibility);
      const observer = new ResizeObserver(resize); observer.observe(element);
      const unsubscribe = subscribeTheme?.(() => { colors(); releaseLayer(edgeCache); edgeCache = null; beginEdges(); schedule(); });
      colors(); resize();
      controller.current = { repaint: schedule, reset };
      return () => {
        alive = false; simulation.stop(); if (frame) cancelAnimationFrame(frame); clearTimeout(refineTimer); stopDrag(true); observer.disconnect(); unsubscribe?.();
        for (const [name, handler] of Object.entries(listeners)) element.removeEventListener(name, handler);
        element.removeEventListener('wheel', wheel); document.removeEventListener('visibilitychange', visibility);
        releaseLayer(building); releaseLayer(edgeCache);
        controller.current = null;
      };
    }, [graph, subscribeTheme]);
    useEffect(() => { controller.current?.repaint(); }, [selectedPath, disabled]);
    return h('div', { className: 'yj-graph-canvas', style: { position: 'relative', height: '100%', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)' } },
      h('canvas', { ref: canvas, tabIndex: 0, role: 'group', 'aria-label': label, 'aria-busy': settling, style: { display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'grab', outlineOffset: -3 } }),
      h('button', { type: 'button', onClick: () => controller.current?.reset(), style: { position: 'absolute', right: 8, top: 8 } }, resetLabel),
      settling && h('span', { role: 'status', style: { position: 'absolute', left: 10, top: 10, pointerEvents: 'none', fontSize: 12 } }, loadingLabel(painted, edgeCount)),
      focused && h('div', { role: 'status', style: { position: 'absolute', left: 10, bottom: 8, maxWidth: 'calc(100% - 20px)', padding: '5px 8px', borderRadius: 6, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', pointerEvents: 'none', overflowWrap: 'anywhere', fontSize: 12 } }, focused.title),
      error && h('div', { role: 'alert' }, error));
  };
}
