
/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "assistantPreviewMissing": "当前 DSH 版本不支持资料预览，会话和草稿都还在",
  "assistantPreviewRetry": "重试资料预览",
  "assistantMove": "移动小鲸助手",
  "assistantDrag": "点击打开，按住可拖动到其他位置",
  "assistantResize": "调整助手大小",
  "draftPrepared": "讨论提议已放入输入框，可编辑后发送",
  "draftUnavailable": "输入框尚未就绪或正在提交，提议未写入；请稍后重试",
  "questionHelp": "和小鲸一起处理工作、查阅知识；只提问不会自动修改笔记",
  "askCurrent": "选用当前笔记",
  "clearSelection": "清空所选",
  "assistantDock": "停靠",
  "assistantFloat": "悬浮",
  "assistantMinimize": "收起助手",
  "assistantOpen": "打开小鲸助手",
  "assistantStart": "开始与小鲸协作",
  "assistantMissing": "小鲸助手已删除，请在专家管理中恢复",
  "generalScope": "未选笔记 · 小鲸会按需查找知识",
  "noteScope": "当前资料",
  "assistantHistory": "在主会话打开",
  "citeNotes": "引用所选笔记",
  "citeLabel": "{count} 篇笔记",
  "citeHelp": "点击输入框旁的引用按钮，将这些笔记加入当前问题。实际发送范围以输入框中的资料标签为准",
  "citeQuestion": "请结合所附资料回答本条消息中的用户问题",
  "citeFailed": "资料未加入输入框，请保持原问题后重试",
  "assistantTagline": "让知识成为你的工作伙伴",
  "citePathUnsupported": "这篇笔记的路径无法作为附件引用，请修改文件名后重试；你的问题还在"
};
export const en = {
  "draftPrepared": "The discussion proposal is in your draft. Edit it before sending",
  "draftUnavailable": "The input is not ready or is submitting. Nothing was inserted; try again shortly"
};
export const styles = [
`.yj-page h1:where(:not(.yj-assistant-conversation *)),.yj-page h2:where(:not(.yj-assistant-conversation *)),.yj-page h3:where(:not(.yj-assistant-conversation *)){font-weight:500;margin:0}.yj-page h1:where(:not(.yj-assistant-conversation *)){font-size:22px}.yj-page h2:where(:not(.yj-assistant-conversation *)){font-size:16px}.yj-page h3:where(:not(.yj-assistant-conversation *)){font-size:14px}`,
`
    .yj-page button:where(:not(.yj-assistant-conversation *))[aria-selected=true],.yj-page .yj-selected{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}`,
`.yj-page label:where(:not(.yj-assistant-conversation *)){display:flex;gap:6px;flex-direction:column;min-width:0}.yj-page label:where(:not(.yj-assistant-conversation *)).yj-check{flex-direction:row;align-items:center}
    .yj-page input:where(:not(.yj-assistant-conversation *))[type=checkbox]{width:16px;height:16px}.yj-page input:where(:not(.yj-assistant-conversation *)):not([type=checkbox]),.yj-page select:where(:not(.yj-assistant-conversation *)){width:100%}`,
`.yj-page textarea:where(:not(.yj-assistant-conversation *)){width:100%;min-height:320px;resize:vertical;font-family:ui-monospace,monospace;margin:8px 0;white-space:pre-wrap}.yj-page pre:where(:not(.yj-assistant-conversation *)){white-space:pre-wrap;overflow-wrap:anywhere}`,
`
    .yj-assistant{border:1px solid var(--dsw-alias-border-l1);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--dsw-alias-bg-layer-2);box-shadow:0 4px 18px var(--dsw-alias-border-l1);transition:box-shadow .18s ease}.yj-assistant[hidden]{display:none}.yj-assistant-header{display:flex;align-items:center;gap:10px;padding:18px 16px 10px}.yj-assistant-header h2{font-size:15px}.yj-assistant-header small{display:block;font-size:11px;color:var(--dsw-alias-label-secondary)}.yj-assistant-tools{padding:0 12px 10px;gap:4px}.yj-page .yj-assistant-tools button{border:0;background:transparent;font-size:11px;padding:3px 6px}.yj-assistant-context{padding:8px 14px;border-top:1px solid var(--dsw-alias-border-l1);border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;flex:none;max-height:40%;overflow:auto}.yj-assistant-context ul{margin:8px 0;padding-left:16px}.yj-assistant-context li{overflow-wrap:anywhere}.yj-assistant-context textarea{min-height:64px;height:72px;margin:6px 0;font-family:inherit}.yj-assistant-context button{font-size:11px;padding:4px 7px}.yj-assistant-welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:28px;flex:1;text-align:center}.yj-assistant-welcome p{font-size:12px}`,
`.yj-assistant-conversation{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;position:relative}.yj-assistant-float{position:fixed;bottom:24px;right:24px;width:min(460px,calc(100vw - 32px));height:min(760px,calc(100dvh - 80px));z-index:100;resize:both;max-width:calc(100vw - 32px);max-height:calc(100dvh - 80px)}.yj-page .yj-assistant-bubble{position:absolute;right:28px;bottom:28px;z-index:90;touch-action:none;user-select:none;cursor:grab;border-radius:24px;padding:12px 18px;box-shadow:0 6px 20px var(--dsw-alias-border-l3);background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-1)}`,
`
    .yj-page button:where(:not(.yj-assistant-conversation *)){transition:background .12s ease,transform .12s ease}.yj-page button:where(:not(.yj-assistant-conversation *)):active:not(:disabled){transform:scale(.98)}`,
`.yj-page pre:where(:not(.yj-assistant-conversation *)){font-size:12px}`,
`
    .yj-assistant{border-radius:16px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 3px 16px var(--dsw-alias-border-l1)}.yj-assistant-header{padding:14px 14px 8px}.yj-assistant-header small{line-height:18px}.yj-assistant-tools{padding:0 10px 8px}.yj-assistant-context{padding:8px 12px;font-size:11px}.yj-assistant-context .yj-row{gap:3px}.yj-assistant-context button{border:0;background:var(--dsw-alias-interactive-bg-hover);padding:4px 6px}.yj-assistant-context .yj-muted{font-size:11px;line-height:18px;margin:8px 0 0}.yj-assistant-welcome{justify-content:flex-start;padding:64px 28px 24px;gap:12px}.yj-assistant-welcome h3{font-size:17px}.yj-assistant-welcome p{max-width:235px;line-height:22px;margin:0}.yj-assistant-welcome .yj-primary{margin-top:12px;border-radius:9px;padding:8px 16px;font-size:12px}.yj-assistant-welcome .yj-avatar{width:60px;height:60px}.yj-assistant-float{width:min(440px,calc(100vw - 32px))}`,
`
    .yj-assistant-chat{display:flex;flex-direction:column;flex:1 0 auto;min-height:0}.yj-assistant-float{resize:none}.yj-assistant-float .yj-assistant-header{cursor:move;touch-action:none;user-select:none}.yj-page .yj-assistant-minimize{margin-left:auto;flex:none;width:30px;height:30px;padding:0;border:0;background:transparent;font-size:0;border-radius:8px}.yj-assistant-minimize::before{content:'−';font-size:20px;line-height:1}.yj-resize{position:absolute;z-index:110;touch-action:none}.yj-resize-n,.yj-resize-s{height:8px;left:10px;right:10px;cursor:ns-resize}.yj-resize-n{top:0}.yj-resize-s{bottom:0}.yj-resize-e,.yj-resize-w{width:8px;top:10px;bottom:10px;cursor:ew-resize}.yj-resize-e{right:0}.yj-resize-w{left:0}.yj-resize-ne,.yj-resize-se,.yj-resize-sw,.yj-resize-nw{width:14px;height:14px}.yj-resize-ne{top:0;right:0;cursor:nesw-resize}.yj-resize-se{bottom:0;right:0;cursor:nwse-resize}.yj-resize-sw{bottom:0;left:0;cursor:nesw-resize}.yj-resize-nw{top:0;left:0;cursor:nwse-resize}
    .yj-assistant-float{max-width:none;max-height:none}.yj-resize:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}`,
`@media(max-width:850px){.yj-workspace-dock{grid-template-columns:minmax(0,1fr)}.yj-assistant-dock{left:auto;right:16px;width:min(480px,calc(100% - 32px))}}@media(max-width:520px){.yj-assistant-dock{left:12px;right:12px;width:auto}}`,
`
    .yj-page button:where(:not(.yj-assistant-conversation *)):disabled{transition:opacity .15s ease .5s}.yj-assistant-bubble:active{cursor:grabbing}`,
`
    .yj-page .yj-assistant-bubble{position:fixed}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
