import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModelWorldPortraits } from '../src/model-world-portraits.js';
import { createModelWorldView, worldDuelScript, worldDuelLog, worldTimelineGroups, worldMetricRows, worldViewCss, worldTokens, worldTime } from '../src/model-world-view.js';
import { modelWorldPortraitIds } from '../src/model-world-roster.js';

const model = (id, score = 100, extra = {}) => ({ id, name: id, vendorId: 'openai', releaseDate: '2026-10', releaseDatePrecision: 'month', contextWindow: 100000, maxOutput: null, knowledgeCutoff: null, openWeights: null, license: null, modalities: null, capabilities: { reasoning: true, toolCall: null, structuredOutput: null, promptCaching: null }, pricing: { inputPerMTok: 0, cachedInputPerMTok: null, outputPerMTok: null, unit: 'USD / 1M tokens', note: '目录价格' }, scores: score === null ? [] : [{ league: 'eci', source: 'epoch.ai', sourceUrl: 'https://epoch.ai/benchmarks', unit: 'index', attribution: 'third-party', score }], efforts: [], rating: { overall: score, tier: score === null ? null : 'T2', effort: null, composite: score, eci: score, reasoning: score, coding: score, agent: score, coverage: score === null ? 0 : 4 }, provenance: {}, ...extra });
const data = (input, models = [model('甲'), model('乙', 90)]) => ({ action: input.action, available: true, models, model: models[0], vendors: [{ id: 'openai', name: 'OpenAI', nameZh: 'OpenAI' }], leagues: [{ id: 'overall', name: '综合实力' }], total: models.length, modelCount: models.length, offset: input.offset || 0, limit: input.limit || 12, unknownDates: 0, generatedAt: '2026-10-12T00:00:00Z', acceptedAt: '2026-10-12T00:00:00Z', attributions: [], lastRefresh: null });
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children || [])];
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : '';
const findButton = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node) === label);
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

/** 宿主请求和 hooks 用可控调度验证；原生顶层窗口的视觉仍由浏览器验收。 */
function harness(factory, props) {
  const states = [], refs = [], effects = [];
  let cursor = 0, pending = [], tree, toast = null;
  const React = {
    Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return refs[index] ||= { current: initial }; },
    useEffect(callback, dependencies) { const index = cursor++; if (!effects[index] || dependencies.some((value, offset) => value !== effects[index].dependencies[offset])) pending.push(() => { effects[index]?.cleanup?.(); effects[index] = { dependencies, cleanup: callback() }; }); },
  };
  let Component = factory(React);
  return {
    // 报错与恢复入口改在右上角提示里：渲染结果带上当前提示，断言员工实际能看到的内容；测试自带的 notify 只收成功类提示。
    render(next = props, setup = () => {}) {
      props = next; cursor = 0; pending = [];
      const notify = (message, options = {}) => { toast = message ? { message, ...options } : null; if (message && options.kind !== 'error') props.notify?.(message, options); };
      const page = Component({ ...props, notify });
      const shown = toast && { type: 'div', props: { role: toast.kind === 'error' ? 'alert' : 'status', children: [toast.message, toast.action && { type: 'button', props: { onClick: () => { const action = toast.action; toast = null; return action.run(); }, children: [toast.action.label] } }] } };
      tree = { type: 'fragment', props: { children: [page, shown] } };
      setup(tree); const queue = pending; pending = []; queue.forEach(run => run()); return tree;
    },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); effects.length = 0; },
    replace(component, next) { this.unmount(); states.length = 0; refs.length = 0; Component = component; props = next; },
    get tree() { return tree; }, React,
  };
}

test('对决只看综合实力：双方互相出手，高分方每回合都打得更重并获胜；缺分与平局按公开规则处理', () => {
  const rated = (id, overall, dims) => model(id, overall, { rating: { ...model(id).rating, overall, composite: overall, reasoning: dims[0], coding: dims[1], agent: dims[2] } });
  const win = worldDuelScript([rated('opus', 58, [91.8, 99.3, 95.3]), rated('astra', 53, [99, 98.9, 94.3])]);
  assert.equal(win.kind, 'winner'); assert.equal(win.winner, 0); assert.equal(win.basis, 'overall'); assert.deepEqual(win.totals, [58, 53]);
  assert.equal(win.events.length, 8, '四个回合各出手两次');
  const log = worldDuelLog(win.events);
  assert.deepEqual(log.map(row => row.round), ['probe', 'clash', 'assault', 'finale']);
  assert.ok(log.every(row => row.damage[0] > row.damage[1] && row.damage[1] > 0), '单项领先不改变出手轻重：高分方每回合都更重，低分方也有还手');
  assert.ok(log.every((row, index) => index === 0 || row.damage[0] >= log[index - 1].damage[0]), '越往后打得越重');
  assert.deepEqual(win.events.map(event => event.attacker), [0, 1, 1, 0, 0, 1, 1, 0], '先后手轮换，决胜回合由高分方终结');
  assert.deepEqual(win.hp, [42, 0], '胜方剩 12 + 5 × 6 = 42');
  assert.ok(win.events.slice(0, -1).every(event => event.hp.every(value => value > 0)), '终结一击之前双方都未倒下');
  const flip = worldDuelScript([rated('b', 44, [99, 99, 99]), rated('a', 58, [10, 10, 10])]);
  assert.equal(flip.winner, 1); assert.deepEqual(flip.hp, [0, 70], '分差大时胜方剩余体力封顶 70');
  const composite = worldDuelScript([model('a', 50, { rating: { ...model('a').rating, overall: null, composite: 70 } }), model('b', 50, { rating: { ...model('b').rating, overall: 60, composite: 60 } })]);
  assert.equal(composite.basis, 'composite', '一方缺综合实力时双方改比分项加权百分位'); assert.equal(composite.winner, 0);
  assert.equal(worldDuelScript([model('a', 50), model('b', null)]).kind, 'unknown', '双方缺可比分数，不判胜负');
  const tie = worldDuelScript([model('a', 8), model('b', 8)]);
  assert.equal(tie.kind, 'tie'); assert.deepEqual(tie.hp, [35, 35]);
  assert.equal(worldDuelScript([model('a'), model('a')]).kind, 'invalid');
  assert.equal(worldDuelScript([model('a')]).kind, 'invalid');
});

test('年份分组按原精度显示日期，保留空值与价格零值；详情可只列已知字段', () => {
  const a = model('a'), b = model('b', null, { releaseDate: '2025', releaseDatePrecision: 'year' });
  assert.deepEqual(worldTimelineGroups([a, b, model('unknown', 1, { releaseDate: null })]).map(group => [group.year, group.models.length]), [['2026', 1], ['2025', 1]]);
  const rows = new Map(worldMetricRows(a));
  assert.equal(rows.get('发布日期'), '2026-10');
  assert.equal(rows.get('输入价格'), '$0');
  assert.equal(rows.get('缓存输入价格'), '—');
  assert.equal(rows.get('上下文'), '100K');
  const known = new Map(worldMetricRows(a, undefined, { known: true }));
  assert.equal(known.has('缓存输入价格'), false); assert.equal(known.get('输入价格'), '$0'); assert.equal(known.get('推理'), '是');
});

test('token 数按常见写法缩写，时间按北京时间显示', () => {
  assert.deepEqual([131072, 128000, 1048576, 1000000, 2000000, 65536, 400000, 512, 0, null].map(worldTokens), ['128K', '128K', '1M', '1M', '2M', '64K', '400K', '512', '0', null]);
  assert.equal(worldTime('2026-10-13T02:08:15.274Z'), '2026/10/13 10:08');
  assert.equal(worldTime(null), null); assert.equal(worldTime('无效'), null);
});

test('初始读取不联网刷新，图鉴、时间线与榜单使用同一公开请求入口', async () => {
  const requests = [];
  const f = harness(React => createModelWorldView(React, 'data:image/png;base64,fixture'), { api: { worldRequest: async input => { requests.push(input); return data(input); } } });
  f.render(); await tick();
  let tree = f.render();
  assert.equal(requests[0].action, 'list');
  assert.equal(requests[0].limit, 12);
  assert.ok(nodes(tree).some(node => node.props.className === 'yj-mw-deck'));
  findButton(tree, '发布时间线').props.onClick(); await tick(); tree = f.render();
  assert.equal(requests.at(-1).action, 'timeline');
  assert.ok(nodes(tree).some(node => node.props.className === 'yj-mw-timeline'));
  findButton(tree, '实力榜').props.onClick(); await tick(); tree = f.render();
  assert.equal(requests.at(-1).league, 'overall');
  assert.ok(nodes(tree).some(node => node.type === 'table'));
  assert.equal(requests.some(input => input.action === 'refresh'), false);
  f.unmount();
});

test('两项选择跨页保留，第三项被拒收；比较仅打开独立窗口', async () => {
  const requests = [], ms = [model('甲'), model('乙'), model('丙')];
  const f = harness(React => createModelWorldView(React, 'art'), { api: { worldRequest: async input => { requests.push(input); return data(input, input.action === 'compare' ? ms.slice(0, 2) : ms); } } });
  f.render(); await tick();
  findButton(f.render(), '发布时间线').props.onClick(); await tick();
  for (const id of ['甲', '乙', '丙']) {
    const b = nodes(f.render()).find(node => node.props['aria-label'] === `加入对决 ${id}`); b.props.onClick();
  }
  let tree = f.render();
  assert.equal(nodes(tree).find(node => node.props['aria-label'] === '加入对决 丙').props.disabled, true);
  await findButton(tree, '对决').props.onClick({ currentTarget: { isConnected: true } });
  tree = f.render();
  assert.deepEqual(requests.at(-1), { action: 'compare', ids: ['甲', '乙'] });
  assert.ok(nodes(tree).some(node => node.type?.name === 'ModelWindow'));
  assert.equal(nodes(tree).some(node => node.props.className === 'yj-world-result'), false);
  f.unmount();
});

test('切页失败保留旧视图和旧数据，重试使用失败请求而不是旧查询', async () => {
  let fail = true;
  const requests = [];
  const f = harness(React => createModelWorldView(React, 'art'), { api: { worldRequest: async input => { requests.push(input); if (input.action === 'timeline' && fail) throw new Error('读取失败'); return data(input); } } });
  f.render(); await tick();
  findButton(f.render(), '发布时间线').props.onClick(); await tick();
  let tree = f.render(); assert.ok(nodes(tree).some(node => node.props.className === 'yj-mw-deck'));
  fail = false; await findButton(tree, '重试').props.onClick(); tree = f.render();
  assert.equal(requests.at(-1).action, 'timeline');
  assert.ok(nodes(tree).some(node => node.props.className === 'yj-mw-timeline'));
  f.unmount();
});

test('迟到分页请求不能覆盖新查询；卸载取消请求', async () => {
  const waiting = [], signals = [];
  const f = harness(React => createModelWorldView(React, 'art'), { api: { worldRequest: (input, signal) => { signals.push(signal); return new Promise(resolve => waiting.push({ input, resolve })); } } });
  f.render();
  findButton(f.render(), '发布时间线').props.onClick();
  assert.equal(signals[0].aborted, true);
  waiting[1].resolve(data(waiting[1].input)); await tick();
  waiting[0].resolve(data(waiting[0].input)); await tick();
  assert.ok(nodes(f.render()).some(node => node.props.className === 'yj-mw-timeline'));
  findButton(f.render(), '实力榜').props.onClick();
  f.unmount(); assert.equal(signals.at(-1).aborted, true);
});

test('更新失败重试仍为更新，取消更新不继续追加读取', async () => {
  let fail = true, refreshResolve;
  const requests = [];
  const f = harness(React => createModelWorldView(React, 'art'), { api: { worldRequest: async input => { requests.push(input); if (input.action === 'refresh') { if (fail) throw new Error('网络失败'); await new Promise(resolve => { refreshResolve = resolve; }); } return data(input); } } });
  f.render(); await tick();
  await findButton(f.render(), '更新数据').props.onClick();
  fail = false; const pending = findButton(f.render(), '重试更新').props.onClick(); await tick();
  assert.equal(requests.at(-1).action, 'refresh');
  findButton(f.render(), '取消').props.onClick(); refreshResolve(); await pending;
  assert.equal(requests.at(-1).action, 'refresh');
  f.unmount();
});

test('存储接受未知保留原错误及恢复入口，回读不联网也不声称磁盘恢复', async () => {
  const requests = [], notices = [];
  const failure = { status: 'error', code: 'WORLD_STORAGE_UNKNOWN', message: '快照提交后的恢复结果未确认；请修复本地目录后重新加载核对' };
  let failed = false;
  const f = harness(React => createModelWorldView(React), { notify: message => notices.push(message), api: { worldRequest: async input => {
    requests.push(input.action);
    if (input.action === 'refresh') { failed = true; throw Object.assign(new Error(failure.message), { code: failure.code }); }
    return { ...data(input), lastRefresh: failed ? failure : null };
  } } });
  f.render(); await tick(); await findButton(f.render(), '更新数据').props.onClick();
  let tree = f.render();
  assert.ok(text(tree).includes(failure.message)); assert.equal(text(tree).includes(failure.code), false, '错误码不展示给员工');
  assert.equal(text(tree).includes('现有数据已保留'), false); assert.equal(notices.some(message => message.includes('已保留')), false);
  assert.ok(text(tree).includes('请重启 DSH 后重新读取'));
  assert.ok(nodes(tree).some(node => node.props.className === 'yj-mw-deck'));
  await findButton(tree, '重新读取').props.onClick(); tree = f.render();
  assert.deepEqual(requests, ['list', 'refresh', 'list']);
  assert.equal(text(tree).includes(failure.code), false);
  assert.ok(findButton(tree, '重新读取'));
  f.unmount();
});

test('更新自身的普通网络失败保留原因，只有显式重试更新才再联网', async () => {
  const requests = [], notices = []; let failing = true;
  const f = harness(React => createModelWorldView(React), { notify: message => notices.push(message), api: { worldRequest: async input => {
    requests.push(input.action);
    if (input.action === 'refresh' && failing) throw Object.assign(new Error('GitHub 连接超时'), { code: 'WORLD_FETCH' });
    return data(input);
  } } });
  f.render(); await tick(); await findButton(f.render(), '更新数据').props.onClick();
  const tree = f.render(); assert.equal(text(tree).includes('WORLD_FETCH'), false); assert.ok(text(tree).includes('GitHub 连接超时'));
  assert.equal(text(tree).includes('现有数据已保留'), false);
  await tick(); f.render(); assert.deepEqual(requests, ['list', 'refresh']);
  failing = false; await findButton(tree, '重试更新').props.onClick();
  assert.deepEqual(requests, ['list', 'refresh', 'refresh', 'list']);
  assert.equal(nodes(f.render()).some(node => node.props.role === 'alert'), false);
  assert.equal(notices.at(-1), '模型数据已更新');
  f.unmount();
});

test('更新成功而列表回读失败，原请求重试只读本地而不再次外网更新', async () => {
  const requests = [], notices = []; let refreshed = false, readFails = true;
  const f = harness(React => createModelWorldView(React), { notify: message => notices.push(message), api: { worldRequest: async input => {
    requests.push(input.action);
    if (input.action === 'refresh') { refreshed = true; return data(input); }
    if (refreshed && readFails) throw Object.assign(new Error('列表响应中断'), { code: 'READ_FAILURE' });
    return data(input);
  } } });
  f.render(); await tick(); await findButton(f.render(), '更新数据').props.onClick();
  let tree = f.render(); assert.ok(text(tree).includes('数据已更新，列表读取失败'));
  assert.equal(text(tree).includes('READ_FAILURE'), false); assert.ok(text(tree).includes('列表响应中断'));
  assert.equal(notices.includes('模型数据已更新'), false);
  readFails = false; await findButton(tree, '重试').props.onClick(); tree = f.render();
  assert.deepEqual(requests, ['list', 'refresh', 'list', 'list']);
  assert.equal(nodes(tree).some(node => node.props.role === 'alert'), false);
  f.unmount();
});

test('图鉴一页展示全部收录厂商并显示模型数，刷新缩减后不留空白或分页', async () => {
  let count = 15;
  const f = harness(React => createModelWorldView(React), { api: { worldRequest: async input => {
    if (input.action === 'refresh') count = 1;
    return { ...data(input), vendors: Array.from({ length: count }, (_, index) => ({ id: 'vendor-' + index, name: '厂商' + index, nameZh: '厂商' + index, modelCount: index + 1 })) };
  } } });
  f.render(); await tick(); let tree = f.render();
  assert.equal(nodes(tree).filter(node => node.props.className === 'yj-mw-role').length, 15);
  assert.ok(text(tree).includes('15 个模型')); assert.equal(findButton(tree, '下一页'), undefined);
  await findButton(f.render(), '更新数据').props.onClick(); tree = f.render();
  assert.equal(nodes(tree).filter(node => node.props.className === 'yj-mw-role').length, 1);
  assert.equal(nodes(tree).some(node => node.props.className === 'yj-mw-page'), false);
  f.unmount();
});

test('模型末页快照缩减后进行一次本地offset纠正，不重复刷新', async () => {
  let total = 25; const requests = [];
  const f = harness(React => createModelWorldView(React), { api: { worldRequest: async input => {
    requests.push(input);
    if (input.action === 'refresh') total = 1;
    const ms = Array.from({ length: Math.max(0, Math.min(12, total - (input.offset || 0))) }, (_, index) => model(String((input.offset || 0) + index)));
    return { ...data(input, ms), total };
  } } });
  f.render(); await tick(); findButton(f.render(), '发布时间线').props.onClick(); await tick();
  await findButton(f.render(), '下一页').props.onClick(); await findButton(f.render(), '下一页').props.onClick();
  assert.ok(text(f.render()).includes('25–25 / 25'));
  await findButton(f.render(), '更新数据').props.onClick();
  assert.deepEqual(requests.slice(-3).map(input => [input.action, input.offset]), [['refresh', undefined], ['timeline', 24], ['timeline', 0]]);
  assert.equal(nodes(f.render()).filter(node => node.props.className === 'yj-mw-model-row').length, 1);
  assert.equal(nodes(f.render()).some(node => node.props.className === 'yj-mw-page'), false); f.unmount();
});

test('无快照停止等待保留可回读入口，迟到结果不宣称更新成功', async () => {
  let resolve; const requests = [], notices = [];
  const f = harness(React => createModelWorldView(React), { notify: message => notices.push(message), api: { worldRequest: async input => {
    requests.push(input.action);
    if (input.action === 'refresh') return new Promise(done => { resolve = done; });
    return { ...data(input, []), available: false, total: 0, modelCount: 0, vendors: [] };
  } } });
  f.render(); await tick(); const pending = findButton(f.render(), '更新数据').props.onClick(); await tick();
  findButton(f.render(), '取消').props.onClick(); resolve(data({ action: 'refresh' })); await pending;
  const tree = f.render(); assert.ok(text(tree).includes('更新可能已完成'));
  assert.ok(findButton(tree, '重新读取')); assert.deepEqual(requests, ['list', 'refresh']);
  assert.equal(notices.length, 0); await findButton(tree, '重新读取').props.onClick();
  assert.deepEqual(requests, ['list', 'refresh', 'list']);
  f.unmount();
});

test('无快照网络失败保留原错误，已接纳空目录明确显示空态', async () => {
  let available = false, failing = true;
  const f = harness(React => createModelWorldView(React), { api: { worldRequest: async input => {
    if (input.action === 'refresh' && failing) throw Object.assign(new Error('连接失败'), { code: 'WORLD_FETCH' });
    return { ...data(input, []), available, total: 0, modelCount: 0, vendors: [] };
  } } });
  f.render(); await tick(); await findButton(f.render(), '更新数据').props.onClick();
  assert.equal(text(f.render()).includes('WORLD_FETCH'), false); assert.ok(text(f.render()).includes('连接失败'));
  assert.equal(text(f.render()).includes('现有数据已保留'), false);
  available = true; failing = false; await findButton(f.render(), '重试更新').props.onClick();
  assert.ok(text(f.render()).includes('没有符合条件的模型')); assert.equal(nodes(f.render()).some(node => node.props.className === 'yj-mw-page'), false);
  f.unmount();
});

async function modalHarness(models, options = {}) {
  let returnFocused = 0, closed = 0;
  const parent = harness(React => createModelWorldView(React, 'art'), { api: { worldRequest: async input => data(input, models) } });
  parent.render(); await tick(); findButton(parent.render(), '发布时间线').props.onClick(); await tick();
  const row = nodes(parent.render()).find(node => node.props['aria-label'] === `详情 ${models[0].name}`);
  await row.props.onClick({ currentTarget: { isConnected: true, focus() { returnFocused++; } } });
  const window = nodes(parent.render()).find(node => node.type?.name === 'ModelWindow');
  const props = { ...window.props, onClose() { closed++; }, state: { ...window.props.state, kind: 'compare', data: data({ action: 'compare' }, models) }, ...options };
  const f = parent;
  f.replace(window.type, props);
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  f.render(props, tree => { for (const node of nodes(tree)) if (node.props.ref) node.props.ref.current = node.type === 'dialog' ? dialog : { focus() {} }; });
  return { f, parent, props, dialog, get closed() { return closed; }, get returnFocused() { return returnFocused; } };
}

test('模态层具备原生top-layer与Escape出口，关闭回到触发按钮', async () => {
  const m = await modalHarness([model('a'), model('b')]);
  assert.equal(m.dialog.open, true);
  const dialog = nodes(m.f.render()).find(node => node.type === 'dialog');
  let prevented = false; dialog.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(m.closed, 1);
  m.f.unmount(); assert.equal(m.dialog.open, false); assert.equal(m.returnFocused, 1);
  m.parent.unmount();
});

test('未知评分仍展示双侧资料但没有可执行胜负，低动态时直接呈现真实结果', async () => {
  const original = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  try {
    const unknown = await modalHarness([model('a'), model('b', null, { contextWindow: null })]);
    assert.equal(findButton(unknown.f.render(), '开始对决').props.disabled, true);
    assert.equal(nodes(unknown.f.render()).filter(node => node.type === 'section' && /^(左方|右方)/.test(node.props['aria-label'] || '')).length, 2);
    assert.ok(text(unknown.f.render()).includes('无法判定胜负'));
    unknown.f.unmount(); unknown.parent.unmount();
    const win = await modalHarness([model('a', 20), model('b', 30)]);
    findButton(win.f.render(), '开始对决').props.onClick();
    assert.ok(text(win.f.render()).includes('b 获胜'));
    assert.ok(text(win.f.render()).includes('综合实力 20 : 30'));
    assert.equal(nodes(win.f.render()).filter(node => node.type === 'li').length, 4, '回合记录逐条列出');
    win.f.unmount(); win.parent.unmount();
  } finally { globalThis.matchMedia = original; }
});

test('战斗动画逐回合推进并有界结束，取消不宣布结果，关闭清理未完成动画', async () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map(); let id = 0;
  globalThis.setTimeout = (callback, delay) => { timers.set(++id, { callback, delay }); return id; };
  globalThis.clearTimeout = timer => timers.delete(timer);
  try {
    const m = await modalHarness([model('a', 8), model('b', 8)]);
    findButton(m.f.render(), '开始对决').props.onClick();
    assert.equal(timers.size, 1); assert.equal([...timers.values()][0].delay, 1100);
    assert.ok(text(m.f.render()).includes('交锋中')); assert.ok(text(m.f.render()).includes('回合 1 · 试探'));
    findButton(m.f.render(), '停止').props.onClick();
    assert.equal(timers.size, 0); assert.ok(text(m.f.render()).includes('已停止'));
    findButton(m.f.render(), '开始对决').props.onClick();
    // 依次触发每回合计时器直到结算；回合数有上限，不会无限推进。
    let steps = 0;
    while (timers.size && steps < 10) { const [key, { callback }] = [...timers.entries()][0]; timers.delete(key); callback(); steps++; }
    assert.equal(steps, 8); assert.equal(timers.size, 0);
    assert.ok(text(m.f.render()).includes('平局'));
    assert.equal(text(m.f.render()).includes('获胜'), false);
    findButton(m.f.render(), '再来一次').props.onClick();
    m.f.unmount(); assert.equal(timers.size, 0);
  } finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
});

test('关闭尚未加载的详情取消该请求，迟到结果不重新打开窗口', async () => {
  let resolveDetail, signal;
  const f = harness(React => createModelWorldView(React), { api: { worldRequest: async (input, currentSignal) => {
    if (input.action === 'detail') { signal = currentSignal; return new Promise(resolve => { resolveDetail = () => resolve(data(input)); }); }
    return data(input);
  } } });
  f.render(); await tick(); findButton(f.render(), '发布时间线').props.onClick(); await tick();
  const pending = nodes(f.render()).find(node => node.props['aria-label'] === '详情 甲').props.onClick({ currentTarget: {} });
  nodes(f.render()).find(node => node.type?.name === 'ModelWindow').props.onClose();
  assert.equal(signal.aborted, true); resolveDetail(); await pending;
  assert.equal(nodes(f.render()).some(node => node.type?.name === 'ModelWindow'), false);
  f.unmount();
});

test('未确认形象不套用临时职业映射，已批准图片按准确厂商 id 消费', async () => {
  const f = harness(React => createModelWorldView(React, { openai: 'data:image/png;base64,approved' }), { api: { worldRequest: async input => data(input) } });
  f.render(); await tick();
  const portrait = nodes(f.render()).find(node => node.type?.name === 'Portrait');
  const image = portrait.type(portrait.props);
  assert.equal(image.type, 'img'); assert.equal(image.props.src, 'data:image/png;base64,approved');
  const unknown = portrait.type({ vendorId: 'unknown' });
  assert.equal(unknown.type, 'span'); assert.equal(text(unknown), 'U');
  assert.equal(text(f.render()).includes('星环研究员'), false);
  f.unmount();
});

test('收录名单的立绘逐一准确展示，图鉴与图片使用同一自有映射', async () => {
  const portraits = loadModelWorldPortraits();
  assert.equal(Object.keys(portraits).length, modelWorldPortraitIds.length);
  const vendors = Object.keys(portraits).map(id => ({ id, name: id }));
  const f = harness(React => createModelWorldView(React, portraits), { api: { worldRequest: async input => ({ ...data(input), vendors }) } });
  f.render(); await tick();
  const cards = nodes(f.render()).filter(node => node.props.className === 'yj-mw-role');
  assert.equal(cards.length, modelWorldPortraitIds.length);
  for (const card of cards) {
    const portrait = nodes(card).find(node => node.type?.name === 'Portrait');
    const image = portrait.type(portrait.props);
    assert.equal(image.type, 'img');
    assert.equal(image.props.src, portraits[portrait.props.vendorId]);
  }
  f.unmount();
});

for (const id of ['unknown', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
  test(`未批准身份 ${id} 不从原型继承图片、排序或已确认状态`, async () => {
    const portraits = loadModelWorldPortraits();
    assert.equal(Object.hasOwn(portraits, id), false);
    // 名称顺序刻意相反，以验证继承属性也不会取得已确认角色的排序优先级。
    const vendors = [{ id, name: 'A pending' }, { id: 'openai', name: 'Z approved' }];
    const f = harness(React => createModelWorldView(React, portraits), { api: { worldRequest: async input => ({ ...data(input), vendors }) } });
    f.render(); await tick();
    const cards = nodes(f.render()).filter(node => node.props.className === 'yj-mw-role');
    const portraitsInCards = cards.map(card => nodes(card).find(node => node.type?.name === 'Portrait'));
    assert.deepEqual(portraitsInCards.map(portrait => portrait.props.vendorId), ['openai', id]);
    const placeholder = portraitsInCards[1].type(portraitsInCards[1].props);
    assert.equal(placeholder.type, 'span');
    assert.equal(placeholder.props.src, undefined);
    assert.equal(text(placeholder), id[0].toUpperCase());
    f.unmount();
  });
}

test('CSS遵循宿主主题、窗口尺寸、键盘焦点与减少动画，不固定黑白主题', () => {
  assert.match(worldViewCss, /prefers-reduced-motion:reduce/);
  assert.match(worldViewCss, /\.yj-mw-dialog:not\(\[open\]\)/);
  assert.match(worldViewCss, /data-platform=darwin/);
  assert.match(worldViewCss, /:focus-visible/);
  assert.doesNotMatch(worldViewCss, /font-weight:(600|700|800|900)/);
});

test('实力榜按榜单切换请求，综合实力标出最强档；性价比榜按消耗档位推荐方案并可展开全部方案；图鉴卡片显示最强型号', async () => {
  const requests = [];
  const ranked = [model('甲', 58, { rating: { ...model('甲').rating, overall: 58, tier: 'T0', effort: 'max' } }), model('乙', 50)];
  const plan = (key, index, cost, effort, frontier = true) => ({ key, modelId: '甲', name: '甲', vendorId: 'openai', effort, index, cost, frontier });
  const bands = [{ id: 'c200', name: '偏贵（≤ 200）', best: plan('甲#high', 54, 182, 'high'), alternatives: [plan('乙#max', 53, 199, 'max', false)] }, { id: 'c5', name: '极省（≤ 5）', best: null, alternatives: [] }];
  const plans = [plan('甲#max', 58, 598, 'max'), plan('甲#high', 54, 182, 'high'), plan('乙#max', 53, 199, 'max', false)];
  const vendors = [{ id: 'openai', name: 'OpenAI', nameZh: 'OpenAI', modelCount: 2, top: { id: '甲', name: '甲', overall: 58, tier: 'T0' } }];
  const reply = input => input.action === 'value' ? { action: 'value', available: true, vendors, leagues: [{ id: 'overall', name: '综合实力' }], modelCount: 2, generatedAt: '2026-10-12T00:00:00Z', acceptedAt: '2026-10-12T00:00:00Z', attributions: [], lastRefresh: null, bands, plans } : { ...data(input, ranked), vendors };
  const f = harness(React => createModelWorldView(React), { api: { worldRequest: async input => { requests.push(input); return reply(input); } } });
  f.render(); await tick();
  assert.ok(text(f.render()).includes('最强 甲'));
  findButton(f.render(), '实力榜').props.onClick(); await tick();
  let tree = f.render();
  assert.deepEqual([requests.at(-1).league, requests.at(-1).limit], ['overall', 20]);
  assert.ok(nodes(tree).some(node => node.props?.className === 'yj-mw-tier' && node.props['data-tier'] === 'T0'));
  assert.ok(nodes(tree).some(node => node.props?.className === 'yj-mw-effort' && text(node) === '最高'), '综合实力标出取分的思考档');
  assert.ok(nodes(tree).some(node => node.type === 'th' && text(node) === '编程'));
  findButton(tree, '性价比').props.onClick(); await tick(); tree = f.render();
  assert.deepEqual(requests.at(-1), { action: 'value' });
  assert.ok(nodes(tree).some(node => node.type === 'th' && text(node) === '消耗档位'));
  assert.ok(text(tree).includes('偏贵（≤ 200）')); assert.ok(text(tree).includes('甲 · 高')); assert.ok(text(tree).includes('甲 · 最高：53 / 199'));
  assert.equal(text(tree).includes('极省（≤ 5）'), false, '没有方案的档位不显示');
  const rows = () => nodes(f.render()).filter(node => node.type === 'tr' && node.props.key?.includes('#')).length;
  assert.equal(rows(), 2, '默认只列同价最强方案');
  findButton(f.render(), '显示全部方案').props.onClick(); assert.equal(rows(), 3);
  assert.equal(nodes(f.render()).some(node => node.type === 'select' && node.props['aria-label'] === '排序'), false, '性价比榜不提供升降序');
  findButton(f.render(), '编程').props.onClick(); await tick();
  assert.deepEqual([requests.at(-1).action, requests.at(-1).league], ['ranking', 'coding']);
  f.unmount();
});
