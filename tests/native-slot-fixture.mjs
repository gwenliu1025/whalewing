import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Service } from '@deepseek-ai/cordis';

/** 直接取当前目标浏览器分发物中的纯 SlotCore；不复制 single/list 的选举规则。 */
export async function nativeSlots() {
  const frontend = new URL(import.meta.resolve('@deepseek-ai/dsh-web-frontend/package.json'));
  const html = await readFile(new URL('dist/index.html', frontend), 'utf8');
  const asset = html.match(/<script type="module"[^>]* src="([^"]+)"/);
  assert.ok(asset, '当前原生页面必须声明真实模块入口');
  const source = await readFile(new URL(asset[1], new URL('dist/', frontend)), 'utf8');
  const exported = source.match(/(\w+)=Object\.freeze\(Object\.defineProperty\(\{__proto__:null,SlotCore:[\s\S]*?standardHookPropName:(\w+)\},Symbol\.toStringTag,\{value:"Module"\}\)\)/);
  assert.ok(exported, '当前原生分发物必须保留完整的ui-slots纯模块边界');
  const start = source.lastIndexOf(`function ${exported[2]}(`, exported.index);
  assert.ok(start >= 0 && start < exported.index);
  const slots = new Function(`${source.slice(start, exported.index + exported[0].length)}; return ${exported[1]};`)();

  // 只保留元素描述，测试实际 renderer 的选举与参数投递；真实 React mount/unmount 另由隔离浏览器验收。
  const jsx = (type, props, key) => ({ type, props: { ...props, ...(key === undefined ? {} : { key }) } });
  const React = { Component: class {}, createContext: value => ({ value }), Fragment: 'fragment', createElement: (type, props, ...children) => jsx(type, { ...props, children }), useLayoutEffect() {}, useSyncExternalStore(_subscribe, get) { return get(); } };
  const renderer = new URL(import.meta.resolve('@deepseek-ai/dsh-client-ui-renderer/package.json'));
  const raw = await readFile(new URL('lib/client.js', renderer), 'utf8');
  const seam = 'exports.SlotRegistry = SlotRegistry;';
  assert.equal(raw.split(seam).length, 2);
  // 测试暴露原函数，不改函数体、输入或选举实现。
  const exposed = raw.replace(seam, `exports.renderOutletContent = renderOutletContent; ${seam}`);
  let registration;
  new Function('window', exposed)({ __ModuleLoader__: { load(value) { registration = value; } } });
  const module = registration.factory(name => {
    if (name === '@deepseek-ai/cordis') return { Service };
    if (name === '@deepseek-ai/dsh-client-ui-slots') return slots;
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: React.Fragment };
    if (name === 'react-dom' || name === 'react-dom/client') return {};
    throw new Error(`未声明的原生renderer依赖：${name}`);
  });
  return { ...module, React };
}
