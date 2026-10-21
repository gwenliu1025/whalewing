import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import { fixture } from './client-fixture.mjs';
import { CORE_ROW_ID, CORE_ROW_STYLE, createBundleTitles } from '../src/shell/plugin-page.js';
import { CONTROL_STYLE } from '../src/shell/control-style.js';
import { parts } from '../features/index.js';
import { renderArtifacts } from '../scripts/build.mjs';

// 图标和运行测试消费同次真实生成的只读文本；每个fixture仍独立执行工厂和清理。
const artifacts = Object.freeze(renderArtifacts());

const slot = 'plugins.detail.section';
const subject = { kind: 'bundle', pkg: { name: 'dsh-whalewing' } };
const extension = (id = 'hello', packageName = 'dsh-whalewing-hello') => ({ id, kind: 'extension', api: 1, package: packageName, skills: [] });
const frame = (revision, extra = []) => ({ revision, features: [...parts.map(part => ({ id: part.id, kind: part.kind, api: 1, package: 'dsh-whalewing', skills: [] })), ...extra] });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => nodes(tree).flatMap(node => node.props.children || []).filter(value => typeof value === 'string');
const view = (f, value = subject) => f.render(slot, { subject: value });
const tick = () => new Promise(setImmediate);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function cleanup(f) { f.unmount(); for (const dispose of f.disposed) await dispose(); }
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props.children.includes(label));

/** 用真实Cordis提供/撤回依赖；名称运输故意不响应，让本地截止承担自己的边界。 */
async function titleLifecycle(t) {
  const ctx = new Context(), notices = [], pending = deferred(); let reads = 0;
  ctx.provide('locale', { subscribe: () => () => {}, bind: () => key => key });
  ctx.provide('remote', { $on: (name, callback) => ctx.on(name, callback), pluginManager: { listBundles(...args) { assert.equal(args.length, 0); reads++; return pending.promise; } } });
  const provide = () => ctx.plugin(scope => { scope.provide('remote.pluginManager', {}); });
  const provider = await provide();
  const titles = createBundleTitles(ctx, { deadline: 20, notify: (...args) => notices.push(args) });
  t.after(async () => { titles.dispose(); await ctx.fiber.dispose(); });
  const release = titles.retain(); await tick();
  return { ctx, titles, provider, provide, release, notices, pending, reads: () => reads };
}

for (const event of ['connection/reset', 'plugin-manager/changed']) test(`永不结算的名称RPC在${event}之后仍受原截止约束`, async t => {
  const f = await titleLifecycle(t);
  f.ctx.emit(event); await wait(60);
  assert.equal(f.titles.snapshot().status, 'error'); assert.equal(f.titles.snapshot().pending, true);
  assert.equal(f.reads(), 1); assert.equal(f.notices.length, 1);
  f.ctx.emit(event); f.titles.retry(); await wait(30);
  assert.equal(f.titles.snapshot().status, 'error'); assert.equal(f.reads(), 1); assert.equal(f.notices.length, 1);
  f.notices[0][1].action.run(); assert.equal(f.notices.at(-1)[0], 'stillWaiting');
});

test('名称RPC离开后保持原绝对截止，过期重入立即说明旧请求未结束而不重发', async t => {
  const f = await titleLifecycle(t); f.release(); await wait(60);
  assert.equal(f.notices.length, 0);
  const release = f.titles.retain();
  assert.equal(f.titles.snapshot().status, 'error'); assert.equal(f.titles.snapshot().pending, true);
  assert.equal(f.reads(), 1); assert.equal(f.notices.length, 1);
  release();
});

test('名称Remote卸载及重挂不丢失旧运输截止，旧结果丢弃后才读取新服务', async t => {
  const f = await titleLifecycle(t); await f.provider.dispose(); await wait(60);
  assert.equal(f.titles.snapshot().status, 'error'); assert.equal(f.notices.length, 1);
  let nextReads = 0;
  f.ctx.remote.pluginManager = { async listBundles() { nextReads++; return { ok: true, value: [{ name: 'example', meta: { title: '新服务名称' } }] }; } };
  await f.provide(); await tick(); assert.equal(nextReads, 0);
  assert.equal(f.titles.snapshot().status, 'error');
  f.pending.resolve({ ok: true, value: [{ name: 'example', meta: { title: '旧服务名称' } }] }); await tick(); await tick();
  assert.equal(nextReads, 1); assert.equal(f.titles.snapshot().titles.get('example'), '新服务名称');
  assert.equal(f.titles.snapshot().pending, false);
});

test('扩展打开和重试共用工作台现有控件规则，原工作台选择器及状态视觉保持', async () => {
  const f = await fixture({ featureFrame: frame(0, [extension()]), pluginNavigation: { openBundle() {} } });
  const tree = view(f);
  assert.equal(nodes(tree).find(node => node.props['data-whalewing-extensions']).props.className, 'yj-plugin-section');
  assert.ok(nodes(tree).some(node => node.type === 'style' && node.props.children.includes(CONTROL_STYLE)));
  assert.ok(nodes(f.render()).some(node => node.type === 'style' && node.props.children.some(value => value.includes(CONTROL_STYLE))));
  for (const selector of ['.yj-page button:where(:not(.yj-assistant-conversation *))', '.yj-plugin-section button:hover:not(:disabled)', '.yj-plugin-section button:disabled']) assert.ok(CONTROL_STYLE.includes(selector));
  for (const token of ['var(--dsw-alias-border-l2)', 'var(--dsw-alias-bg-layer-1)', 'var(--dsw-alias-interactive-bg-hover)']) assert.ok(CONTROL_STYLE.includes(token));
  assert.equal(f.ctx.whalewingWorkbench.ui.CONTROL_STYLE, undefined, '内部样式不晋升扩展API');
  await cleanup(f);
});

test('核心只有一条精确隐藏规则，重复页面不重复插入，整个插件卸载即移除', async () => {
  const f = await fixture();
  assert.equal(CORE_ROW_ID, 'include:whalewing');
  assert.equal(CORE_ROW_STYLE, 'li[data-plugin-row="include:whalewing"], section[data-plugin-rows]:has(li[data-plugin-row="include:whalewing"]) > div:first-child > span { display: none; }');
  assert.equal((CORE_ROW_STYLE.match(/\{/g) || []).length, 1);
  view(f); view(f, { kind: 'bundle', pkg: { name: 'other' } }); f.render();
  assert.equal(f.document.head.children.length, 1);
  assert.equal(f.document.head.children[0].textContent, CORE_ROW_STYLE);
  await cleanup(f); assert.equal(f.document.head.children.length, 0);
  const restored = await fixture(); assert.equal(restored.document.head.children.length, 1); await cleanup(restored);
});

test('扩展区只消费鲸翼包详情与权威外部登记，空列表及其他subject不读取元数据', async () => {
  let reads = 0;
  const f = await fixture({ pluginManager: { async listBundles(...args) { assert.equal(args.length, 0); reads++; return { ok: true, value: [] }; } } });
  assert.equal(view(f), null); f.flushEffects(); await tick(); assert.equal(reads, 0);
  await f.featureUpdate(frame(1, [extension(), extension('hello-two')]));
  for (const other of [undefined, { kind: 'row', pkg: { name: 'dsh-whalewing' } }, { kind: 'item', id: 'dsh-whalewing' }, { kind: 'bundle', pkg: { name: 'other' } }]) {
    assert.equal(f.render(slot, { subject: other }), null); f.flushEffects();
  }
  await tick(); assert.equal(reads, 0);
  assert.equal(nodes(view(f)).filter(node => node.type === 'li').length, 2, '同一包多个登记功能各自列出，包名只用于名字读取与打开');
  f.flushEffects(); await tick(); assert.equal(reads, 1);
  await f.featureUpdate(frame(2)); assert.equal(view(f), null);
  await cleanup(f);
  assert.equal(f.registrations.get(slot).length, 0);
  assert.equal(f.localeListeners.size, 0);
});

test('原生标题按语言解析，插件变化更新名字，打开保持准确包名且不污染功能帧', async () => {
  let title = { zh: '会议助手', en: 'Meeting assistant' }, reads = 0; const opened = [];
  const f = await fixture({ featureFrame: frame(0, [extension()]), pluginNavigation: { openBundle: name => opened.push(name) }, pluginManager: { async listBundles() { reads++; return { ok: true, value: [{ name: 'dsh-whalewing-hello', meta: { title } }] }; } } });
  assert.ok(text(view(f)).includes('dsh-whalewing-hello'));
  f.flushEffects(); await tick(); assert.ok(text(view(f)).includes('会议助手'));
  button(view(f), '打开').props.onClick(); assert.deepEqual(opened, ['dsh-whalewing-hello']);
  f.ctx.locale.language = 'en'; for (const listener of f.localeListeners) listener();
  assert.ok(text(view(f)).includes('Meeting assistant')); assert.equal(reads, 1);
  title = { zh: '会议记录', en: 'Meeting notes' };
  for (const listener of f.eventHandlers.get('plugin-manager/changed')) listener();
  await tick(); assert.ok(text(view(f)).includes('Meeting notes')); assert.equal(reads, 2);
  assert.equal(f.ctx.whalewingWorkbench.internal.featureSnapshot().features.find(item => item.id === 'hello').package, 'dsh-whalewing-hello');
  const oldOpen = button(view(f), '打开').props.onClick;
  await cleanup(f); oldOpen(); assert.equal(opened.length, 1);
});

test('原生名称读取失败保留扩展与包名，有明确重试，导航缺席不画空操作', async () => {
  let fail = true, reads = 0;
  const f = await fixture({ featureFrame: frame(0, [extension()]), pluginManager: { async listBundles() { reads++; return fail ? { ok: false, error: { message: 'offline' } } : { ok: true, value: [{ name: 'dsh-whalewing-hello' }] }; } } });
  view(f); f.flushEffects(); await tick();
  assert.ok(text(view(f)).includes('dsh-whalewing-hello'));
  assert.ok(text(view(f)).includes('名称暂未读取，暂按包名显示'));
  assert.ok(text(f.render('shell.overlay')).includes('扩展名称暂未读取，请检查 DSH 连接后重试'));
  assert.equal(button(view(f), '打开'), undefined);
  fail = false; button(view(f), '重试').props.onClick(); await tick();
  assert.equal(reads, 2); assert.ok(text(view(f)).includes('dsh-whalewing-hello'));
  assert.equal(button(view(f), '重试'), undefined);
  await cleanup(f);
  const waiting = await fixture({ featureFrame: frame(0, [extension()]) });
  view(waiting); waiting.flushEffects(); await tick();
  assert.ok(text(view(waiting)).includes('dsh-whalewing-hello'));
  assert.ok(text(view(waiting)).includes('正在读取名称'));
  await cleanup(waiting);
});

test('名称读取及再次读取失败共用右上角恢复动作，离开详情后旧动作和迟到失败静默', async () => {
  let reads = 0;
  const f = await fixture({ featureFrame: frame(0, [extension()]), pluginManager: { async listBundles() { reads++; throw new Error('offline'); } } });
  view(f); f.flushEffects(); await tick();
  button(f.render('shell.overlay'), '重试').props.onClick(); await tick();
  assert.equal(reads, 2);
  const stale = button(f.render('shell.overlay'), '重试').props.onClick;
  view(f, { kind: 'bundle', pkg: { name: 'other' } }); stale(); await tick();
  assert.equal(reads, 2); await cleanup(f);
  const pending = deferred();
  const late = await fixture({ featureFrame: frame(0, [extension()]), pluginManager: { listBundles: () => pending.promise } });
  view(late); late.flushEffects(); await tick();
  view(late, { kind: 'bundle', pkg: { name: 'other' } });
  pending.resolve({ ok: false, error: { message: 'offline' } }); await tick();
  assert.equal(late.render('shell.overlay'), null); await cleanup(late);
});

test('名称普通RPC超时只结束本地等待，重试不叠加，旧连接迟到不回写且按新代重读', async () => {
  const pending = deferred(); let reads = 0;
  const f = await fixture({ featureFrame: frame(0, [extension()]), pluginManager: { listBundles(...args) { assert.equal(args.length, 0, '真实描述没有取消参数'); return ++reads === 1 ? pending.promise : Promise.resolve({ ok: true, value: [{ name: 'dsh-whalewing-hello', meta: { title: '当前名称' } }] }); } } });
  view(f); f.flushEffects(); await tick();
  const deadline = [...f.timers].find(([, item]) => item.delay === 10_000);
  assert.ok(deadline); f.timers.delete(deadline[0]); deadline[1].fn();
  assert.ok(text(view(f)).includes('名称暂未读取，暂按包名显示'));
  const retry = button(view(f), '重试'); assert.equal(retry.props.disabled, true); retry.props.onClick();
  for (const listener of f.eventHandlers.get('connection/reset')) listener();
  await tick(); assert.equal(reads, 1);
  pending.resolve({ ok: true, value: [{ name: 'dsh-whalewing-hello', meta: { title: '迟到名称' } }] });
  await tick(); assert.equal(reads, 2);
  assert.ok(text(view(f)).includes('当前名称')); assert.equal(text(view(f)).includes('迟到名称'), false);
  await cleanup(f); assert.equal(f.timers.size, 0);
});

test('离开扩展详情和卸载后不接受迟到名称，未完成运输不因重进叠加', async () => {
  const pending = deferred(); let reads = 0;
  const f = await fixture({ featureFrame: frame(0, [extension()]), pluginManager: { listBundles() { reads++; return pending.promise; } } });
  view(f); f.flushEffects(); await tick();
  assert.equal(view(f, { kind: 'bundle', pkg: { name: 'other' } }), null);
  view(f); f.flushEffects(); await tick(); assert.equal(reads, 1);
  await cleanup(f);
  pending.resolve({ ok: true, value: [{ name: 'dsh-whalewing-hello', meta: { title: '迟到名称' } }] });
  await tick(); assert.equal(reads, 1); assert.equal(f.timers.size, 0);
  assert.ok([...f.eventHandlers.values()].every(items => !items.length));
});

test('四项图标从同一图形清单派生，原生img保持独立图形与亮暗可辨色，根应用图标合法', async () => {
  const icons = parts.filter(part => part.kind === 'optional').map(part => {
    const icon = artifacts[`features/${part.id}/icon.svg`];
    assert.equal(icon.replace("stroke='#718096'", "stroke='black'").trim(), part.tab.icon);
    const rgb = icon.match(/stroke='#([0-9a-f]{6})'/)[1].match(/../g).map(value => parseInt(value, 16) / 255);
    const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = linear.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    assert.ok((luminance + 0.05) / 0.05 >= 3 && 1.05 / (luminance + 0.05) >= 3, '独立图像笔画与纯黑纯白均至少3:1；实际主题仍由界面验收');
    assert.ok(Buffer.byteLength(icon) < 262144); return icon;
  });
  assert.equal(new Set(icons).size, 4);
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.icon, './art/brand/whalewing-app-256.png');
  assert.ok((await readFile(new URL(`../${manifest.icon}`, import.meta.url))).length < 262144);
  const zh = JSON.parse(await readFile(new URL('../locale/zh.json', import.meta.url), 'utf8'));
  assert.equal(zh.meta.title, '鲸翼'); assert.ok(zh.meta.description.includes('请使用鲸翼卡片的总开关'));
});

test('完整生成ModuleLoader产物通过严格Remote scope显示扩展标题，卸载归还样式和全部入口', async () => {
  const f = await fixture({ clientSource: artifacts['client.js'], featureFrame: frame(0, [extension()]), pluginManager: { async listBundles() { return { ok: true, value: [{ name: 'dsh-whalewing-hello', meta: { title: { zh: '原生扩展名称', en: 'Native extension name' } } }] }; } } });
  view(f); f.flushEffects(); await tick();
  assert.ok(text(view(f)).includes('原生扩展名称'));
  assert.equal(f.document.head.children[0].textContent, CORE_ROW_STYLE);
  await cleanup(f);
  assert.equal(f.document.head.children.length, 0);
  assert.ok([...f.registrations.values()].every(items => !items.length));
  assert.ok([...f.eventHandlers.values()].every(items => !items.length));
});
