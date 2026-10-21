import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { zh, en, css, explainError } from '../src/shell/presentation-content.js';
import { createSharedUi } from '../src/shell/ui.js';

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sorted = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')));
// 职责迁移前的行为快照：保留完整中英文词条和CSS级联；后续产品改动需明确审查快照变化。
test('新增来源标题词条并完整保留原434项双语词条与经审查的样式快照', () => {
  assert.equal(Object.keys(zh).length, 435); assert.equal(Object.keys(en).length, 435);
  assert.equal(hash(sorted(zh)), 'aa4f94cf6836c43c566fb1ed28a9182377269754991e73cc44e6830c76d1219e');
  assert.equal(hash(sorted(en)), '1a53a7b8af2123abe0386114e9be85adaed44ba3c172812da750e021e2efa172');
  // 来源标题分支仅新增一个标签，原有434项仍按完整基线逐值保护。
  const { newsHeadline: headlineZh, ...baselineZh } = zh;
  const { newsHeadline: headlineEn, ...baselineEn } = en;
  assert.equal(headlineZh, '来源标题'); assert.equal(headlineEn, 'Source headline');
  assert.equal(zh.learningText, '课程正文'); assert.equal(zh.newsViewSource, '查看来源');
  assert.equal(hash(sorted(baselineZh)), 'bf125563a1863ffeba69c69d5e7e5f864da50908da3d196de1820f7d3f10ccfc');
  assert.equal(hash(sorted(baselineEn)), 'dcd21adeadc5b976a31fa2664b4ac01a7b9f716fb39126114ab11aeb71c68caf');
  assert.equal(hash(css), '192e5485d02f7f51f29350216ec4a052a22bab5f3eb0ea95ffdb48825472a78b');
  // 本次只改变打开态Modal的水平inset；逆置这一属性后必须与迁移基线逐字一致。
  assert.equal(hash(css.replace('.yj-modal.yj-page[open]{position:fixed;inset:24px 16px;margin:auto;', '.yj-modal.yj-page[open]{position:fixed;inset:24px;margin:auto;')), '628a604f143bfdf330f1f2842eb02017023c0068b87e321910e6c53bf68c14f8');
});

const codes = [
  "FEATURE_API",
  "FEATURE_CONFLICT",
  "FEATURE_CLOSED",
  "FEATURE_DISABLED",
  "FEATURE_CALLER",
  "FEATURE_RETRY",
  "WORLD_FETCH",
  "NEWS_FETCH_FAILED",
  "NEWS_FEED",
  "NEWS_URL",
  "SCHEDULE_DISABLED",
  "AUTOMATION_UNAVAILABLE",
  "NEWS_SCHEDULE",
  "LEGACY_SCHEDULE",
  "NEWS_UNAVAILABLE",
  "DSH",
  "MODEL_UNAVAILABLE",
  "API",
  "AI_WEB_UNAVAILABLE",
  "BROWSER_MISSING",
  "PROFILE_UNAVAILABLE",
  "CONFIG",
  "SOURCE_CONFIG",
  "NOT_INITIALIZED",
  "ROOT",
  "WORKSPACE_",
  "PATH",
  "SYMLINK",
  "ROOT_NOT_EMPTY",
  "SOURCE_DIRECTORY",
  "DIRECTORY_LIMIT",
  "WORLD_PATH",
  "SKILL_ROOT",
  "SKILL_SOURCE_ROOT",
  "SOURCE_MODE",
  "ENCODING",
  "INVALID_TEXT",
  "UTF",
  "SIZE",
  "SKILL_SIZE",
  "QUESTION_LIMIT",
  "LIMIT",
  "CONFLICT",
  "EXPECTED_HASH",
  "SKILL_STALE",
  "NEWS_DUPLICATE",
  "CHANGED",
  "EXISTS",
  "READBACK",
  "UNKNOWN",
  "PERSISTENCE",
  "RECOVERY",
  "RECOVERY_MOVE",
  "NOT_FOUND",
  "MISSING",
  "SCHEDULE_ENDED",
  "SCHEDULE_RETIRED",
  "NO_RECOVERY",
  "AUTOMATION_SESSION",
  "SESSION",
  "BUSY",
  "PROTECTED",
  "SKILL_ORIGIN",
  "USER_ONLY",
  "AI_WEB_BUILTIN",
  "FIXED_RULE",
  "SKILL_STATE",
  "SKILL_SHADOWED",
  "CLOSED",
  "ABORTERROR",
  "NEWS_CANCELLED",
  "SESSION_REQUIRED",
  "COMMAND_MISSING",
  "BAD_REPLY",
  "GRAPH_CONTRACT_MISMATCH",
  "EXPERT_READBACK",
  "WORLD_SCHEMA",
  "WORLD_SCALE",
  "WORLD_LINK",
  "WORLD_STORAGE",
  "METADATA",
  "RECEIPT",
  "NEWS_RECEIPT",
  "COVERAGE_OUTPUT",
  "INPUT",
  "VALIDATION",
  "QUERY",
  "OFFSET",
  "ACTION",
  "DOMAIN",
  "QUESTION",
  "SKILL_NAME",
  "SKILL_FORMAT",
  "SKILL_SOURCE",
  "SKILL_REVIEW",
  "SKILL_EVOLUTION",
  "SKILL_DISCOVERY",
  "AUTOMATION_PROMPT",
  "AUTOMATION_IDENTITY",
  "NEWS_IDENTITY",
  "NEWS_SOURCE",
  "NEWS_DISABLED",
  "COVERAGE_CONFLICT",
  "EVENT_LIMIT",
  "INDEX_LIMIT",
  "SOURCE_SCOPE",
  "SOURCE_UNAVAILABLE",
  "WORLD_INPUT",
  "ZODERROR",
  "NOTE_",
  "ECONN",
  "ETIMEDOUT",
  "ENOTFOUND",
  "SESSION_",
  "MIGRATION",
  "UNCONFIRMED",
  "CREATED_DIFFERENT",
  "ARCHIVED",
  "NOTE_SAMPLE",
  "WHATEVER",
  "example_CONFLICT",
  "session/writer-held"
];
test('领域错误归位保留原122项错误及未知码的显示与优先级', () => {
  assert.equal(hash(codes.map(code => [code, explainError(code, '测试原文')])), '86e149cd613ee9e53f50fc221b9b44ca2593ab977198b6a191ee2261c5310157');
});


test('Modal声明的水平留白与宽度预算一致，保留阅读器和抽屉独立尺寸', () => {
  // 这里只锁定真实样式声明；视口居中、UA默认值和top layer仍由真实浏览器验收。
  const declarations = selector => {
    const matches = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match => match[1].trim() === selector);
    assert.equal(matches.length, 1, selector);
    return Object.fromEntries(matches[0][2].split(';').filter(Boolean).map(value => {
      const colon = value.indexOf(':');
      return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()];
    }));
  };
  const modal = declarations('.yj-modal.yj-page[open]');
  assert.equal(modal.position, 'fixed');
  assert.equal(modal.inset, '24px 16px');
  assert.equal(modal.margin, 'auto');
  assert.equal(modal.width, 'min(820px,calc(100vw - 32px))');
  assert.equal(modal['max-height'], 'calc(100dvh - 48px)');
  const confirm = declarations('.yj-modal.yj-confirm.yj-page[open]');
  assert.equal(confirm.width, 'min(440px,calc(100vw - 32px))');
  const book = declarations('.yj-modal.yj-book[open]');
  assert.equal(book.width, 'min(1240px,calc(100vw - 48px))');
  const drawer = declarations('.yj-editor');
  assert.equal(drawer.inset, '12px 12px 12px auto');
  assert.equal(drawer.margin, '0');
  assert.equal(declarations('html[data-platform=darwin] .yj-modal.yj-page[open]').top, 'calc(var(--dsh-frame-top-clearance,0px) + 24px)');
});

test('共享Modal调用原生showModal并保留忙碌保护、关闭及归焦', () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  try {
    for (const busy of [false, true]) {
      const events = [], effects = [];
      const previous = { isConnected: true, focus: () => events.push('focus') };
      Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: previous } });
      // 直接调用生产组件，记录原生边界；此夹具不模拟浏览器布局或声称进入真实top layer。
      const React = {
        createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
        useRef: current => ({ current }),
        useEffect: effect => effects.push(effect),
      };
      const { Modal } = createSharedUi(React, {});
      let closed = 0, prevented = 0;
      const tree = Modal({ title: '资讯详情', busy, onClose: () => closed++, children: '正文' });
      assert.equal(tree.type, 'dialog');
      assert.equal(tree.props.className, 'yj-modal yj-page');
      assert.equal(tree.props['aria-label'], '资讯详情');
      assert.equal(Object.hasOwn(tree.props, 'open'), false);
      const dom = { showModal: () => events.push('showModal'), close: () => events.push('close') };
      tree.props.ref.current = dom;
      assert.equal(effects.length, 1);
      const cleanup = effects[0]();
      assert.deepEqual(events, ['showModal']);
      tree.props.onCancel({ preventDefault: () => prevented++ });
      tree.props.onClick({ target: dom, currentTarget: dom });
      assert.equal(prevented, 1);
      assert.equal(closed, busy ? 0 : 2);
      cleanup();
      assert.deepEqual(events, ['showModal', 'close', 'focus']);
    }
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  }
});
