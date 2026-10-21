// 由 scripts/build.mjs 生成；请修改 src/client.js。
window.__ModuleLoader__.load({ id: "dsh-whalewing-hello", factory: (require) => {
const module = { exports: {} };
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  waitForDemo: () => waitForDemo
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");

// package.json
var package_default = {
  name: "dsh-whalewing-hello",
  version: "0.0.0",
  private: true,
  description: "\u6587\u672C\u9884\u89C8\uFF1A\u5728\u72EC\u7ACB\u9875\u7B7E\u4E2D\u9884\u89C8\u6587\u5B57\u5E76\u4F53\u9A8C\u53EF\u53D6\u6D88\u64CD\u4F5C",
  license: "Apache-2.0",
  type: "module",
  icon: "./icon.svg",
  exports: {
    ".": "./host.js",
    "./client": "./client.js",
    "./package.json": "./package.json",
    "./locale/*": "./locale/*"
  },
  files: ["host.js", "identity.js", "client.js", "src", "scripts", "tests", "cordis.patch.yml", "locale", "icon.svg", "README.md", "LICENSE"],
  scripts: { build: "node scripts/build.mjs", test: "node --test tests/*.test.mjs" },
  whalewingExtension: { id: "hello" },
  devDependencies: { esbuild: "0.25.12" },
  engines: { dsh: "0.2.1-rc.2" },
  dsh: {
    bundle: { patch: "./cordis.patch.yml" },
    client: { platform: "web", immediately: true, inject: ["dsh-whalewing"] }
  }
};

// identity.js
if (!/^(?:@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(package_default.name) || !/^[a-z][a-z0-9-]{0,79}$/.test(package_default.whalewingExtension?.id)) throw new Error("\u8BF7\u5148\u5728 package.json \u586B\u5199\u5408\u6CD5\u5305\u540D\u548C whalewingExtension.id");
var packageName = package_default.name;
var featureId = package_default.whalewingExtension.id;
var rowId = packageName.replace(/^@/, "").replaceAll("/", "-").replace(/^dsh-/, "");

// src/client.js
var inject = ["slots", "locale"];
function waitForDemo(signal, milliseconds = 2e3) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish(signal.reason);
    const timer = setTimeout(() => finish(), milliseconds);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
function apply(ctx) {
  function TextPreview({ active, workbench }) {
    const [text, setText] = (0, import_react.useState)(""), [preview, setPreview] = (0, import_react.useState)(false), [busy, setBusy] = (0, import_react.useState)(false);
    const draft = (0, import_react.useRef)(""), lifetime = (0, import_react.useRef)(null);
    const { Modal } = workbench.ui;
    (0, import_react.useEffect)(() => {
      const controller = new AbortController();
      lifetime.current = controller;
      const unguard = workbench.guardLeave(() => draft.current ? "\u6587\u5B57\u53EA\u5728\u672C\u6B21\u6253\u5F00\u671F\u95F4\u4FDD\u7559\uFF0C\u5173\u95ED\u6269\u5C55\u524D\u8BF7\u81EA\u884C\u4FDD\u5B58\u3002" : "");
      const unrefresh = workbench.onRefresh(() => workbench.notify("\u6587\u672C\u9884\u89C8\u5DF2\u5237\u65B0", { kind: "success" }));
      return () => {
        controller.abort();
        unguard();
        unrefresh();
      };
    }, [workbench]);
    const demonstrate = async () => {
      const local = lifetime.current;
      if (!local || local.signal.aborted || busy) return;
      setBusy(true);
      try {
        await workbench.run(async (signal) => {
          const combined = AbortSignal.any([signal, local.signal]);
          await waitForDemo(combined);
          combined.throwIfAborted();
          workbench.notify("\u672C\u5730\u6F14\u793A\u5DF2\u5B8C\u6210", { kind: "success" });
        });
      } finally {
        if (!local.signal.aborted) setBusy(false);
      }
    };
    return (0, import_react.createElement)(
      "section",
      { className: "yj-section", "aria-label": "\u6587\u672C\u9884\u89C8" },
      (0, import_react.createElement)("h2", null, "\u6587\u672C\u9884\u89C8"),
      (0, import_react.createElement)("p", { className: "yj-muted" }, "\u6587\u5B57\u53EA\u5728\u672C\u6B21\u6253\u5F00\u671F\u95F4\u6682\u5B58\uFF0C\u5173\u95ED\u6269\u5C55\u6216\u5DE5\u4F5C\u53F0\u540E\u6E05\u7A7A\uFF1B\u4E0D\u4F1A\u5199\u5165\u4E2A\u4EBA\u77E5\u8BC6\u3002"),
      (0, import_react.createElement)("label", { className: "yj-field" }, "\u9884\u89C8\u6587\u5B57", (0, import_react.createElement)("textarea", {
        "aria-label": "\u9884\u89C8\u6587\u5B57",
        rows: 6,
        maxLength: 4e3,
        value: text,
        disabled: busy,
        style: { width: "100%", boxSizing: "border-box" },
        onChange: (event) => {
          draft.current = event.target.value;
          setText(event.target.value);
        }
      })),
      (0, import_react.createElement)(
        "div",
        { className: "yj-row" },
        (0, import_react.createElement)("button", { type: "button", className: "yj-primary", disabled: busy || !text.trim(), onClick: () => setPreview(true) }, "\u9884\u89C8\u6587\u672C"),
        (0, import_react.createElement)("button", { type: "button", disabled: busy, onClick: demonstrate }, "\u8FD0\u884C\u672C\u5730\u6F14\u793A")
      ),
      active && preview && (0, import_react.createElement)(
        Modal,
        { title: "\u6587\u672C\u9884\u89C8", onClose: () => setPreview(false) },
        (0, import_react.createElement)("div", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", overflowY: "auto", maxHeight: "60vh" } }, text)
      )
    );
  }
  ctx.inject(["whalewingWorkbench"], (scope) => {
    scope.slots.inject("whalewing.workbench.tab", () => scope.slots.register({
      name: "whalewing.workbench.tab",
      id: featureId,
      order: 100,
      label: () => scope.locale.resolveText({ zh: "\u6587\u672C\u9884\u89C8", en: "Text preview" })
    }, TextPreview));
  });
}

return module.exports;
} });
