
/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "aiWebSessionTitle": "AI 网页",
  "aiWeb": "AI 网页",
  "browserMissing": "DSH 内置浏览器还没就绪，请在「插件」页启用浏览器后重试"
};
export const styles = [
`
    .yj-ai-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:2px 0 16px}.yj-page .yj-ai-head h2{margin:0 auto 0 0;font-size:19px;line-height:28px}.yj-page .yj-ai-head select{width:auto;min-width:160px}
    .yj-page label.yj-ai-search{flex-direction:row;align-items:center;gap:10px;flex:0 1 420px;min-width:240px;white-space:nowrap}.yj-ai-search>span{color:var(--dsw-alias-label-secondary)}.yj-page .yj-ai-search input{flex:1;min-width:0;width:auto}
    .yj-ai-status{display:inline-flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px}.yj-page .yj-ai-status button{border:0;background:transparent;padding:2px 6px;text-decoration:underline}
    .yj-ai-card .yj-card-top .yj-avatar{width:44px;height:44px;border-radius:12px;flex:none}.yj-ai-card .yj-card-identity h3{margin:0;font-size:15px;font-weight:600}.yj-ai-card .yj-help{margin:0}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
export const errors = {
  "AI_WEB_UNAVAILABLE": [
    "DSH 内置浏览器还没就绪（DSH 设置问题）",
    "请在 DSH「插件」页启用浏览器后重试"
  ],
  "BROWSER_MISSING": [
    "DSH 内置浏览器还没就绪（DSH 设置问题）",
    "请在 DSH「插件」页启用浏览器后重试"
  ],
  "AI_WEB_BUILTIN": [
    "系统内置的内容不能直接这样修改",
    "可以先复制或新建一份属于你的，再修改"
  ]
};
