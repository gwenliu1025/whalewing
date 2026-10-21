/*
图谱布局的连线力、电荷力与碰撞力，改编自 d3-force 3.0.0 的 src/link.js、src/manyBody.js、
src/collide.js，遍历顺序取自 d3-quadtree 3.0.1 的 src/visit.js。
来源：https://github.com/d3/d3-force/tree/v3.0.0/src
来源：https://github.com/d3/d3-quadtree/tree/v3.0.1/src

只改数据的存放方式，不改布局：电荷与碰撞的原生 tree.visit 每访问一个象限都新建一个 Quad
对象，这里每个力实例持有自己的遍历栈并复用槽位；连线力改用定长下标数组（见 forceLink）。
四叉树构建、visitAfter、力的数学表达式、边序、象限访问顺序与随机数消费都保持上游原样，
tests/graph.test.mjs 以安装的 d3-force 原生力逐 tick 严格对照。升级 d3-force 或
d3-quadtree 前先跑该对照；不再相同就删除本文件，改回 d3-force 的原生力。

ISC License（两项目原文相同）：
Copyright 2010-2021 Mike Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
*/

const constant = x => () => x;
const jiggle = random => (random() - 0.5) * 1e-6;

/**
 * 扁平四叉树：与 d3-quadtree 的 quadtree(nodes, x, y) 建出同一棵树（外框取整倍增、逐点插入、
 * 重合点链接与叶子分裂规则相同），只是不再为每个象限和每次访问分配对象。
 * 内部节点 k（从 1 起）的四个子槽在 children[4k - 4 .. 4k - 1]；槽值 0 为空，正数为内部节点，
 * 负数 -(p + 1) 为以第 p 个点为首的叶子；重合点按插入逆序经 next 相连，与上游 leaf.next 相同。
 * 新内部节点只会挂在已有节点之下，编号从大到小即是 visitAfter 的后序。
 */
function createQuadtree() {
  const tree = { root: 0, x0: NaN, y0: NaN, x1: NaN, y1: NaN, size: 0, children: new Int32Array(64), next: new Int32Array(0), xs: new Float64Array(0), ys: new Float64Array(0) };

  // 调用方写好前 n 个 xs、ys 后再 build；缓冲只增不减，第 n 个之后的旧值不会被读到。
  tree.reserve = n => {
    if (tree.xs.length < n) tree.xs = new Float64Array(n), tree.ys = new Float64Array(n), tree.next = new Int32Array(n);
    return tree;
  };

  tree.build = n => {
    const xs = tree.xs, ys = tree.ys;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    tree.root = 0, tree.size = 0, tree.x0 = tree.y0 = tree.x1 = tree.y1 = NaN;
    for (let i = 0; i < n; ++i) {
      const x = xs[i], y = ys[i];
      if (isNaN(x) || isNaN(y)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x0 > x1 || y0 > y1) return tree;
    // cover(x0, y0) 在空树上取整数外框，cover(x1, y1) 再以同一边长倍增到覆盖全部点。
    let X0 = Math.floor(x0), Y0 = Math.floor(y0), X1 = X0 + 1, Y1 = Y0 + 1, z = X1 - X0 || 1;
    while (X0 > x1 || x1 >= X1 || Y0 > y1 || y1 >= Y1) {
      const i = (y1 < Y0) << 1 | (x1 < X0);
      z *= 2;
      switch (i) {
        case 0: X1 = X0 + z, Y1 = Y0 + z; break;
        case 1: X0 = X1 - z, Y1 = Y0 + z; break;
        case 2: X1 = X0 + z, Y0 = Y1 - z; break;
        case 3: X0 = X1 - z, Y0 = Y1 - z; break;
      }
    }
    tree.x0 = X0, tree.y0 = Y0, tree.x1 = X1, tree.y1 = Y1;
    for (let p = 0; p < n; ++p) add(p);
    return tree;
  };

  function allocate() {
    const k = ++tree.size, base = k * 4 - 4;
    if (base + 4 > tree.children.length) {
      const grown = new Int32Array(tree.children.length * 2);
      grown.set(tree.children), tree.children = grown;
    }
    tree.children.fill(0, base, base + 4);
    return k;
  }

  function add(p) {
    const xs = tree.xs, ys = tree.ys, next = tree.next, x = xs[p], y = ys[p], leaf = -p - 1;
    if (isNaN(x) || isNaN(y)) return;
    next[p] = -1;
    let node = tree.root;
    if (!node) return void (tree.root = leaf);
    let children = tree.children, x0 = tree.x0, y0 = tree.y0, x1 = tree.x1, y1 = tree.y1, parent = 0, i = 0, j, xm, ym, right, bottom;
    // Find the existing leaf for the new point, or add it.
    while (node > 0) {
      if (right = x >= (xm = (x0 + x1) / 2)) x0 = xm; else x1 = xm;
      if (bottom = y >= (ym = (y0 + y1) / 2)) y0 = ym; else y1 = ym;
      parent = node, i = bottom << 1 | right;
      if (!(node = children[parent * 4 - 4 + i])) return void (children[parent * 4 - 4 + i] = leaf);
    }
    // Is the new point exactly coincident with the existing point?
    const q = -node - 1, xp = xs[q], yp = ys[q];
    if (x === xp && y === yp) {
      next[p] = q;
      if (parent) children[parent * 4 - 4 + i] = leaf; else tree.root = leaf;
      return;
    }
    // Otherwise, split the leaf node until the old and new point are separated.
    do {
      const k = allocate();
      children = tree.children;
      if (parent) children[parent * 4 - 4 + i] = k; else tree.root = k;
      parent = k;
      if (right = x >= (xm = (x0 + x1) / 2)) x0 = xm; else x1 = xm;
      if (bottom = y >= (ym = (y0 + y1) / 2)) y0 = ym; else y1 = ym;
    } while ((i = bottom << 1 | right) === (j = (yp >= ym) << 1 | (xp >= xm)));
    children[parent * 4 - 4 + j] = node, children[parent * 4 - 4 + i] = leaf;
  }

  return tree;
}

const grow = (array, length) => array.length < length ? new Float64Array(Math.max(length, array.length * 2)) : array;

// 按 d3-quadtree visit 的前序：子象限按 3、2、1、0 入栈，先访问 0。栈属于调用它的力实例。
function pushChildren(stack, bounds, top, children, k, x0, y0, x1, y1) {
  const base = k * 4 - 4, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  let child, b;
  if (child = children[base + 3]) b = top * 4, stack[top++] = child, bounds[b] = xm, bounds[b + 1] = ym, bounds[b + 2] = x1, bounds[b + 3] = y1;
  if (child = children[base + 2]) b = top * 4, stack[top++] = child, bounds[b] = x0, bounds[b + 1] = ym, bounds[b + 2] = xm, bounds[b + 3] = y1;
  if (child = children[base + 1]) b = top * 4, stack[top++] = child, bounds[b] = xm, bounds[b + 1] = y0, bounds[b + 2] = x1, bounds[b + 3] = ym;
  if (child = children[base]) b = top * 4, stack[top++] = child, bounds[b] = x0, bounds[b + 1] = y0, bounds[b + 2] = xm, bounds[b + 3] = ym;
  return top;
}

/**
 * 连线力：d3 forceLink 的默认强度、偏置与单次迭代，端点直接用 [source, target] 节点下标。
 * 上游每 tick 扫一遍连线对象和三条逐边数组（20 万边约十几 MB），多进程并行时被共享缓存和
 * 内存带宽拖慢数倍；这里逐边只存两个端点下标，强度与偏置按端点连接数现算——
 * 1 / min(a, b) 与 max(1 / a, 1 / b) 在正整数上逐位相同，偏置用上游同一表达式。
 * 节点状态按 tick 读入定长数组，按原边序、原浮点表达式更新后写回，随机数消费顺序不变。
 */
export function forceLink(pairs) {
  const m = pairs.length, sources = new Uint32Array(m), targets = new Uint32Array(m);
  pairs.forEach(([source, target], i) => { sources[i] = source; targets[i] = target; });
  var nodes,
      random,
      distance = 30,
      count,
      inverse,
      px,
      py,
      vx,
      vy;

  function force(alpha) {
    var i, n = nodes.length, node, s, t, x, y, l, b;
    for (i = 0; i < n; ++i) node = nodes[i], px[i] = node.x, py[i] = node.y, vx[i] = node.vx, vy[i] = node.vy;
    for (i = 0; i < m; ++i) {
      s = sources[i], t = targets[i];
      x = px[t] + vx[t] - px[s] - vx[s] || jiggle(random);
      y = py[t] + vy[t] - py[s] - vy[s] || jiggle(random);
      l = Math.sqrt(x * x + y * y);
      l = (l - distance) / l * alpha * Math.max(inverse[s], inverse[t]);
      x *= l, y *= l;
      vx[t] -= x * (b = count[s] / (count[s] + count[t]));
      vy[t] -= y * b;
      vx[s] += x * (b = 1 - b);
      vy[s] += y * b;
    }
    for (i = 0; i < n; ++i) node = nodes[i], node.vx = vx[i], node.vy = vy[i];
  }

  force.initialize = function(_nodes, _random) {
    nodes = _nodes;
    random = _random;
    const n = nodes.length;
    count = new Float64Array(n), inverse = new Float64Array(n);
    px = new Float64Array(n), py = new Float64Array(n), vx = new Float64Array(n), vy = new Float64Array(n);
    for (let i = 0; i < m; ++i) {
      if (sources[i] >= n || targets[i] >= n) throw new Error(`node not found: ${Math.max(sources[i], targets[i])}`);
      count[sources[i]]++, count[targets[i]]++;
    }
    for (let i = 0; i < n; ++i) inverse[i] = 1 / count[i];
  };

  force.distance = function(_) {
    return arguments.length ? (distance = +_, force) : distance;
  };

  return force;
}

export function forceManyBody() {
  const tree = createQuadtree(), stack = [], bounds = [];
  var nodes,
      random,
      alpha,
      strength = constant(-30),
      strengths,
      values = new Float64Array(0),
      centersX = new Float64Array(0),
      centersY = new Float64Array(0),
      leafValues = new Float64Array(0),
      distanceMin2 = 1,
      distanceMax2 = Infinity,
      theta2 = 0.81;

  function force(_) {
    var i, n = nodes.length, xs = tree.reserve(n).xs, ys = tree.ys;
    for (i = 0; i < n; ++i) xs[i] = +nodes[i].x, ys[i] = +nodes[i].y;
    tree.build(n);
    accumulate(n);
    for (alpha = _, i = 0; i < n; ++i) apply(i);
  }

  // For leaf nodes, accumulate forces from coincident quadrants.
  function leaf(p) {
    var strength = 0, q = p, next = tree.next;
    do strength += strengths[q];
    while ((q = next[q]) >= 0);
    return leafValues[p] = strength;
  }

  // visitAfter(accumulate)：叶子取首点坐标，内部节点按子象限 0..3 以强度绝对值加权。
  function accumulate(n) {
    var k, i, c, p, v, w, strength, weight, x, y, children = tree.children, xs = tree.xs, ys = tree.ys;
    values = grow(values, tree.size + 1), centersX = grow(centersX, tree.size + 1), centersY = grow(centersY, tree.size + 1), leafValues = grow(leafValues, n);
    if (tree.root < 0) leaf(-tree.root - 1);
    for (k = tree.size; k > 0; --k) {
      for (strength = weight = x = y = i = 0; i < 4; ++i) {
        if (!(c = children[k * 4 - 4 + i])) continue;
        if (c > 0) v = values[c], p = -1;
        else v = leaf(p = -c - 1);
        if (w = Math.abs(v)) {
          strength += v, weight += w, x += w * (p < 0 ? centersX[c] : xs[p]), y += w * (p < 0 ? centersY[c] : ys[p]);
        }
      }
      centersX[k] = x / weight;
      centersY[k] = y / weight;
      values[k] = strength;
    }
  }

  function apply(i) {
    var node = nodes[i], nx = node.x, ny = node.y, vx = node.vx, vy = node.vy, top = 0,
        children = tree.children, next = tree.next, xs = tree.xs, ys = tree.ys,
        c, b, p, q, v, x, y, w, l;
    if (tree.root) stack[0] = tree.root, bounds[0] = tree.x0, bounds[1] = tree.y0, bounds[2] = tree.x1, bounds[3] = tree.y1, top = 1;
    while (top) {
      c = stack[--top], b = top * 4;
      if (c > 0) v = values[c], x = centersX[c] - nx, y = centersY[c] - ny;
      else p = -c - 1, v = leafValues[p], x = xs[p] - nx, y = ys[p] - ny;
      if (!v) continue;
      w = bounds[b + 2] - bounds[b], l = x * x + y * y;

      // Apply the Barnes-Hut approximation if possible.
      // Limit forces for very close nodes; randomize direction if coincident.
      if (w * w / theta2 < l) {
        if (l < distanceMax2) {
          if (x === 0) x = jiggle(random), l += x * x;
          if (y === 0) y = jiggle(random), l += y * y;
          if (l < distanceMin2) l = Math.sqrt(distanceMin2 * l);
          vx += x * v * alpha / l;
          vy += y * v * alpha / l;
        }
        continue;
      }

      // Otherwise, process points directly.
      if (c > 0) { top = pushChildren(stack, bounds, top, children, c, bounds[b], bounds[b + 1], bounds[b + 2], bounds[b + 3]); continue; }
      if (l >= distanceMax2) continue;

      // Limit forces for very close nodes; randomize direction if coincident.
      if (p !== i || next[p] >= 0) {
        if (x === 0) x = jiggle(random), l += x * x;
        if (y === 0) y = jiggle(random), l += y * y;
        if (l < distanceMin2) l = Math.sqrt(distanceMin2 * l);
      }

      q = p;
      do if (q !== i) {
        w = strengths[q] * alpha / l;
        vx += x * w;
        vy += y * w;
      } while ((q = next[q]) >= 0);
    }
    node.vx = vx, node.vy = vy;
  }

  function initialize() {
    if (!nodes) return;
    var i, n = nodes.length, node;
    strengths = new Array(n);
    for (i = 0; i < n; ++i) node = nodes[i], strengths[node.index] = +strength(node, i, nodes);
  }

  force.initialize = function(_nodes, _random) {
    nodes = _nodes;
    random = _random;
    initialize();
  };

  force.strength = function(_) {
    return arguments.length ? (strength = typeof _ === "function" ? _ : constant(+_), initialize(), force) : strength;
  };

  force.distanceMin = function(_) {
    return arguments.length ? (distanceMin2 = _ * _, force) : Math.sqrt(distanceMin2);
  };

  force.distanceMax = function(_) {
    return arguments.length ? (distanceMax2 = _ * _, force) : Math.sqrt(distanceMax2);
  };

  force.theta = function(_) {
    return arguments.length ? (theta2 = _ * _, force) : Math.sqrt(theta2);
  };

  return force;
}

export function forceCollide(radius) {
  const tree = createQuadtree(), stack = [], bounds = [];
  var nodes,
      radii,
      random,
      reach = new Float64Array(0),
      px = new Float64Array(0),
      py = new Float64Array(0),
      vx = new Float64Array(0),
      vy = new Float64Array(0),
      strength = 1,
      iterations = 1;

  if (typeof radius !== "function") radius = constant(radius == null ? 1 : +radius);

  // 速度在本力内读写定长数组，结束时写回；遍历中读取的始终是当前速度，与上游逐对象更新相同。
  function force() {
    var i, k, n = nodes.length, node, xs, ys;
    px = grow(px, n), py = grow(py, n), vx = grow(vx, n), vy = grow(vy, n);
    for (i = 0; i < n; ++i) node = nodes[i], px[i] = node.x, py[i] = node.y, vx[i] = node.vx, vy[i] = node.vy;
    for (k = 0; k < iterations; ++k) {
      xs = tree.reserve(n).xs, ys = tree.ys;
      for (i = 0; i < n; ++i) xs[i] = +(px[i] + vx[i]), ys[i] = +(py[i] + vy[i]);
      tree.build(n);
      prepare();
      for (i = 0; i < n; ++i) apply(i);
    }
    for (i = 0; i < n; ++i) node = nodes[i], node.vx = vx[i], node.vy = vy[i];
  }

  // visitAfter(prepare)：叶子取链首点半径，内部节点取子象限 0..3 中的最大值。
  function prepare() {
    var k, i, c, r, children = tree.children;
    reach = grow(reach, tree.size + 1);
    for (k = tree.size; k > 0; --k) {
      for (reach[k] = i = 0; i < 4; ++i) {
        if ((c = children[k * 4 - 4 + i]) && (r = c > 0 ? reach[c] : radii[-c - 1]) > reach[k]) reach[k] = r;
      }
    }
  }

  function apply(i) {
    var ri = radii[i], ri2 = ri * ri, xi = px[i] + vx[i], yi = py[i] + vy[i], top = 0,
        children = tree.children, c, b, p, rj, r, x, y, l;
    if (tree.root) stack[0] = tree.root, bounds[0] = tree.x0, bounds[1] = tree.y0, bounds[2] = tree.x1, bounds[3] = tree.y1, top = 1;
    while (top) {
      c = stack[--top], b = top * 4;
      if (c < 0) {
        // 叶子只处理链首点，与上游 quad.data 相同。
        p = -c - 1, rj = radii[p], r = ri + rj;
        if (p > i) {
          x = xi - px[p] - vx[p], y = yi - py[p] - vy[p], l = x * x + y * y;
          if (l < r * r) {
            if (x === 0) x = jiggle(random), l += x * x;
            if (y === 0) y = jiggle(random), l += y * y;
            l = (r - (l = Math.sqrt(l))) / l * strength;
            vx[i] += (x *= l) * (r = (rj *= rj) / (ri2 + rj));
            vy[i] += (y *= l) * r;
            vx[p] -= x * (r = 1 - r);
            vy[p] -= y * r;
          }
        }
        continue;
      }
      r = ri + reach[c];
      if (bounds[b] > xi + r || bounds[b + 2] < xi - r || bounds[b + 1] > yi + r || bounds[b + 3] < yi - r) continue;
      top = pushChildren(stack, bounds, top, children, c, bounds[b], bounds[b + 1], bounds[b + 2], bounds[b + 3]);
    }
  }

  function initialize() {
    if (!nodes) return;
    var i, n = nodes.length, node;
    radii = new Array(n);
    for (i = 0; i < n; ++i) node = nodes[i], radii[node.index] = +radius(node, i, nodes);
  }

  force.initialize = function(_nodes, _random) {
    nodes = _nodes;
    random = _random;
    initialize();
  };

  force.iterations = function(_) {
    return arguments.length ? (iterations = +_, force) : iterations;
  };

  force.strength = function(_) {
    return arguments.length ? (strength = +_, force) : strength;
  };

  force.radius = function(_) {
    return arguments.length ? (radius = typeof _ === "function" ? _ : constant(+_), initialize(), force) : radius;
  };

  return force;
}
