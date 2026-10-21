import { CONTROL_STYLE } from './control-style.js';

/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "panel": "鲸翼",
  "toastClose": "关闭",
  "confirmTitle": "请确认",
  "draftDiscarded": "已放弃未保存的修改",
  "workbenchRecoverTitle": "工作台会话需要处理",
  "createdSessionReady": "任务会话已创建，但没有自动打开",
  "knowledge": "个人知识",
  "models": "模型世界",
  "openPlugins": "打开插件设置",
  "toolbox": "工具台",
  "noSession": "知识工作台尚未连接，请重试",
  "refresh": "刷新",
  "search": "查找笔记",
  "content": "Markdown 正文",
  "read": "阅读",
  "save": "保存",
  "remove": "移到可恢复区",
  "cancel": "取消",
  "stopWait": "停止等待结果",
  "stopHelp": "已停止等待；已提交的操作可能仍在进行，稍后刷新查看结果",
  "stopped": "操作已结束，请刷新查看结果",
  "restore": "恢复",
  "validation": "知识检查",
  "conflict": "这篇笔记刚在别处被修改过，你的草稿还在；请先读取最新内容，再决定如何合并",
  "reload": "读取最新内容",
  "requestFailed": "操作失败，请检查提示后重试",
  "badReply": "插件收到的结果不完整，请重试",
  "unknownCommand": "当前会话尚未启用鲸翼命令",
  "invalidPath": "请输入工程的绝对路径",
  "active": "已启用",
  "disabled": "已停用",
  "resize_n": "上",
  "resize_ne": "右上",
  "resize_e": "右",
  "resize_se": "右下",
  "resize_s": "下",
  "resize_sw": "左下",
  "resize_w": "左",
  "resize_nw": "左上",
  "user": "我的技能",
  "available": "可用",
  "shadowed": "库内存在同名优先项",
  "inactive": "未启用",
  "unknown": "发现状态待确认",
  "rule_after_seconds": "延迟一次",
  "rule_at": "指定时间一次",
  "rule_every_seconds": "固定间隔",
  "rule_daily": "每天",
  "rule_weekly": "每周",
  "rule_cron": "Cron",
  "mutationDone": "操作已完成并刷新",
  "loading": "正在处理",
  "close": "关闭提示",
  "discard": "放弃当前草稿",
  "workbenchTitle": "鲸翼知识工作台",
  "retry": "重试",
  "createdSession": "已创建的任务",
  "openCreated": "打开已创建的任务",
  "workbenchUnclaimed": "工作台会话没有准备好，请打开该会话查看后再处理",
  "inspectWorkbench": "打开该会话",
  "prepareWorkbench": "重新准备知识工作台",
  "prepareHelp": "会新建一个工作台会话，旧会话不受影响",
  "back": "返回上一篇",
  "previous": "上一页",
  "next": "下一页",
  "question": "小鲸助手",
  "avatar": "上传头像",
  "saveExpert": "保存专家",
  "closePanel": "关闭",
  "cancelEdit": "取消编辑"
};
export const en = {
  "panel": "WhaleWing",
  "shadowed": "A same-name item takes precedence in the library"
};
export const styles = [
`
.yj-page .yj-modal{position:fixed;inset:0;margin:auto;width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 48px);height:fit-content;overflow:auto;padding:24px;border:1px solid var(--dsh-border-color);border-radius:16px;background:var(--dsh-bg-base);color:var(--dsh-text-primary)}
.yj-modal::backdrop{background:rgb(0 0 0 / .4)}`,
`
    .yj-page{height:100%;box-sizing:border-box;overflow:auto;padding:24px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);font-size:13px;line-height:1.6}
    .yj-page *{box-sizing:border-box}`,
`
    .yj-header,.yj-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.yj-header{justify-content:space-between;margin-bottom:20px}.yj-muted{color:var(--dsw-alias-label-secondary);margin:6px 0 12px}
    .yj-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:12px}
    ${CONTROL_STYLE}`,
`
    .yj-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}`,
`.yj-field{flex:1;min-width:200px}.yj-section{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;margin:16px 0}
    .yj-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}.yj-card{display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px}.yj-card p{flex:1;margin:0;color:var(--dsw-alias-label-secondary)}
    .yj-split{display:grid;grid-template-columns:minmax(200px,1fr) minmax(280px,2fr);gap:16px}.yj-list{display:flex;flex-direction:column;gap:8px}`,
`
    .yj-notice{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;margin:12px 0;overflow-wrap:anywhere}.yj-error{color:var(--dsw-alias-state-error-primary)}.yj-page a{color:var(--dsw-alias-state-business-primary)}`,
`.yj-reader{overflow-wrap:anywhere;min-height:220px;padding:12px 0}.yj-reader button{padding:0;border:0;background:transparent;color:var(--dsw-alias-state-business-primary)}`,
`.yj-location{border-left:3px solid var(--dsw-alias-brand-primary);padding:12px;background:var(--dsw-alias-bg-layer-2)}
    .yj-reader :is(h1,h2,h3,h4,h5,h6){margin:16px 0 8px;font-weight:500}.yj-reader :is(ul,ol){padding-left:24px}.yj-reader ul{list-style:disc}.yj-reader ol{list-style:decimal}.yj-reader strong,.yj-reader th{font-weight:500}.yj-reader pre,.yj-reader blockquote{padding:12px;background:var(--dsw-alias-bg-layer-2)}.yj-reader blockquote{border-left:3px solid var(--dsw-alias-border-l2);margin:12px 0}.yj-table{overflow:auto;max-width:100%}.yj-reader table{border-collapse:collapse;width:100%}.yj-reader th,.yj-reader td{border:1px solid var(--dsw-alias-border-l2);padding:6px 10px;text-align:left}`,
`

    .yj-busy{display:flex;justify-content:center;align-items:center;gap:12px;min-height:44px}.yj-spinner{height:16px;width:16px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:yj-spin 1s linear infinite}.yj-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);max-width:min(560px,90vw);padding:12px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);z-index:1000;display:flex;gap:12px;align-items:center;font-size:13px}.yj-toast button{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 8px}
    @keyframes yj-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.yj-spinner{animation:none}}@media(max-width:720px){.yj-page{padding:16px}.yj-split{grid-template-columns:1fr}.yj-field{min-width:100%}}html[data-platform=darwin] .yj-page{padding-top:calc(var(--dsh-frame-top-clearance,0px) + 24px)}

    .yj-page{display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:24px 28px;background:var(--dsw-alias-bg-layer-1)}
    /* 页头没有刷新动作时仍保留按钮行高，避免切页挤动内容。 */
    .yj-page>.yj-workbench-header{min-height:36px}.yj-workbench-header>.yj-row>button{border:0;background:transparent}
    .yj-page>.yj-header{flex:none;margin-bottom:8px}.yj-page>.yj-header h1{letter-spacing:-.5px}.yj-page>.yj-header .yj-muted{margin:2px 0 0}
    .yj-tabs{flex:none;margin:12px 0 18px;gap:4px;padding:4px;width:max-content;max-width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
    .yj-tabs button{border:0;background:transparent;padding:7px 16px;color:var(--dsw-alias-label-secondary);border-radius:8px}.yj-tabs button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px var(--dsw-alias-border-l1)}
    .yj-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,350px);gap:20px;min-height:0;flex:1}.yj-workspace-float,.yj-workspace-bubble{grid-template-columns:minmax(0,1fr)}
    .yj-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.yj-view{overflow:auto;min-width:0;min-height:0;padding:2px}`,
`.yj-compact-settings{max-width:100%;flex-shrink:0}.yj-compact-settings>summary{cursor:pointer;color:var(--dsw-alias-label-secondary);padding:6px 10px}.yj-compact-settings[open]{width:min(420px,100%)}
    .yj-tabs button[data-tab]{display:inline-flex;align-items:center;gap:6px}.yj-tab-icon{display:inline-block;order:-1;width:16px;height:16px;flex-shrink:0;background-color:currentColor}`,
`.yj-avatar-side{display:grid;gap:14px;min-width:0}.yj-avatar-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.yj-avatar-actions>button,.yj-avatar-upload{height:34px;box-sizing:border-box;display:inline-flex;align-items:center;padding:0 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);cursor:pointer;font-size:13px;margin:0!important;position:relative;overflow:hidden}.yj-avatar-upload input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;font-size:0}.yj-avatar-presets{display:flex;flex-wrap:wrap;gap:10px}.yj-avatar-preset{padding:0!important;width:42px;height:42px;border-radius:50%;overflow:hidden;border:2px solid transparent!important;background:none!important;cursor:pointer}.yj-avatar-preset[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary)!important}.yj-avatar-preset img{width:100%;height:100%;display:block;object-fit:cover}.yj-avatar-letter{display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:500;flex:none}
    .yj-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,215px),1fr));gap:16px}.yj-card{border:1px solid var(--dsw-alias-border-l1);border-radius:20px;padding:22px;gap:14px;background:var(--dsw-alias-bg-layer-2);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;position:relative;min-height:240px}.yj-card:hover{transform:translateY(-2px);border-color:var(--dsw-alias-border-l3);box-shadow:0 8px 24px var(--dsw-alias-border-l1)}.yj-card h2{font-size:16px}.yj-card p{font-size:13px;line-height:1.65}.yj-card-top{display:flex;align-items:start;justify-content:space-between;gap:12px}.yj-avatar{flex:none;border-radius:30%;object-fit:cover;display:block}.yj-card small{font-size:11px}.yj-page .yj-card-start{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);text-align:center;align-self:stretch;border-radius:10px}.yj-add-card{justify-content:center;align-items:center;border-style:dashed;background:transparent;cursor:pointer;text-align:center}.yj-add-card p{flex:0}.yj-add-mark{font-size:32px;color:var(--dsw-alias-label-secondary);line-height:1;width:56px;height:56px;border:1px dashed var(--dsw-alias-border-l3);border-radius:18px;display:grid;place-items:center}.yj-card-menu{position:relative}.yj-card-menu summary{list-style:none;cursor:pointer;font-size:18px;line-height:24px;color:var(--dsw-alias-label-secondary)}.yj-card-menu[open]{border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:6px}.yj-card-menu button{display:block;width:100%;border:0;white-space:nowrap;padding:5px 8px}`,
`.yj-page .yj-folder{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;padding:7px;text-align:left;font-weight:500;white-space:nowrap}`,
`.yj-page summary{cursor:pointer}.yj-library-tools{flex:none;padding:6px 8px}.yj-library-status{font-size:11px;color:var(--dsw-alias-label-secondary);flex:none;margin-bottom:8px}`,
`.yj-page .yj-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-label-primary)}.yj-page .yj-primary:hover:not(:disabled){opacity:.85;background:var(--dsw-alias-label-primary)}`,
`
    .yj-editor{position:fixed;inset:12px 12px 12px auto;margin:0;width:min(560px,calc(100vw - 24px));height:calc(100dvh - 24px);max-height:none;max-width:none;border:1px solid var(--dsw-alias-border-l2);border-radius:20px;padding:22px;z-index:1100;box-shadow:0 12px 40px var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}.yj-editor:not([open]){display:none}.yj-editor::backdrop{background:color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent);backdrop-filter:blur(3px)}.yj-editor-body{flex:1;overflow:auto;min-height:0;padding:0 4px}.yj-editor-body>label{margin:16px 0}.yj-editor-body textarea{min-height:190px}.yj-editor footer{justify-content:flex-end;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l1)}.yj-choice{padding:8px 0;align-items:start!important}.yj-choice small{display:block;color:var(--dsw-alias-label-secondary);line-height:1.5}.yj-editor input[type=file]{font-size:11px}`,
`.yj-page>.yj-notice{flex:none;max-height:120px;overflow:auto;margin:4px 0}.yj-busy{min-height:30px;flex:none}.yj-split{min-height:0}.yj-split>.yj-list{max-height:65vh;overflow:auto}.yj-split>div:last-child{min-width:0;overflow:auto}`,
`
    @media(max-width:850px){.yj-workspace{grid-template-columns:minmax(0,1fr)}.yj-assistant-dock{position:absolute;right:16px;bottom:16px;top:150px;width:min(350px,calc(100vw - 40px));z-index:50}.yj-team-heading{flex-wrap:wrap}.yj-tabs{width:100%;justify-content:space-between}.yj-tabs button{padding:7px 10px}.yj-page .yj-field{min-width:0}.yj-note-canvas{padding:12px}}
    @media(max-width:520px){.yj-page{padding:12px}.yj-tabs button{font-size:12px;padding:6px}.yj-knowledge-split{grid-template-columns:125px minmax(0,1fr)}.yj-note-tree{padding:8px 4px}.yj-assistant-dock{left:12px;right:12px;width:auto;top:120px}.yj-note-canvas{padding:10px}.yj-grid{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){.yj-page *,.yj-picker-trigger{transition:none!important;animation:none!important}.yj-card:hover,.yj-page button:where(:not(.yj-assistant-conversation *)):active:not(:disabled){transform:none}}html[data-platform=darwin] .yj-editor{top:calc(var(--dsh-frame-top-clearance,0px) + 12px);height:calc(100dvh - var(--dsh-frame-top-clearance,0px) - 24px)}

    .yj-page:not(.yj-editor){position:relative}.yj-page{font:var(--dsw-font-xs-13);font-family:var(--dsw-font-family);padding:24px 28px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 98%,var(--dsw-alias-label-primary) 2%)}
    .yj-page>.yj-header h1{font-size:20px;line-height:28px;display:flex;align-items:center;gap:8px}.yj-logo{flex:none;--yj-logo-deep:#163e86;--yj-logo-sky:#3e9bd6}@supports (color:light-dark(#000,#fff)){.yj-logo{--yj-logo-deep:light-dark(#163e86,#eaf2fb);--yj-logo-sky:light-dark(#3e9bd6,#63bdf0)}}.yj-page>.yj-header .yj-muted{font-size:12px;line-height:20px}.yj-header>button{border:0;background:transparent}.yj-tabs{background:var(--dsw-alias-interactive-bg-hover);border:0;margin:10px 0 16px;padding:3px;border-radius:10px}.yj-tabs button{font-size:13px;line-height:20px;padding:6px 14px}.yj-tabs button[aria-pressed=true]{box-shadow:0 1px 4px var(--dsw-alias-border-l2)}`,
`.yj-compact-settings summary{font-size:12px;padding:4px 8px}.yj-workspace{gap:18px;grid-template-columns:minmax(0,1fr) 320px}.yj-workspace-float,.yj-workspace-bubble{grid-template-columns:minmax(0,1fr)}
    .yj-grid{gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,210px),1fr))}.yj-card{min-height:184px;padding:18px;gap:12px;border-radius:16px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 2px 8px var(--dsw-alias-border-l1)}.yj-card-top{align-items:center;gap:10px}.yj-card-identity{flex:1;min-width:0}.yj-card h2{font-size:15px;line-height:22px}.yj-card small{font-size:11px;line-height:18px}.yj-card p{min-height:40px;line-height:20px;font-size:12px;color:var(--dsw-alias-label-secondary)}.yj-page .yj-card-start{border:0;min-height:30px;padding:5px 10px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-size:12px}.yj-page .yj-add-card{border:1px dashed var(--dsw-alias-border-l3);background:transparent;box-shadow:none;gap:10px;min-height:184px}.yj-add-mark{width:38px;height:38px;border:0;font-size:28px;background:var(--dsw-alias-interactive-bg-hover);border-radius:12px}.yj-add-card p{min-height:0}
    .yj-page .yj-icon-button,.yj-page .yj-menu-trigger{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;background:transparent;padding:6px;border-radius:7px;color:var(--dsw-alias-label-secondary);min-height:28px}.yj-glyph{display:inline-block;vertical-align:middle;flex:none}.yj-action-menu{display:inline-flex;flex:none}.yj-menu-surface{position:fixed;inset:auto;margin:0;width:max-content;min-width:150px;max-width:min(360px,calc(100vw - 24px));max-height:min(440px,calc(100dvh - 32px));overflow:auto;padding:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:var(--dsw-elevation-prominent);font:var(--dsw-font-xs-13)}.yj-page .yj-menu-surface button{width:100%;text-align:left;border:0;background:transparent;padding:7px 10px;border-radius:6px}.yj-page .yj-menu-surface button:hover{background:var(--dsw-alias-interactive-bg-hover)}.yj-menu-surface details{padding:6px 10px}.yj-menu-surface details summary{padding:3px 0}.yj-menu-surface p{max-width:300px;overflow-wrap:anywhere;font-size:12px}.yj-menu-surface .yj-row{max-width:300px}.yj-menu-surface input{margin-top:6px}`,
`.yj-page .yj-search{display:flex;flex-direction:row;align-items:center;gap:8px;flex:1;min-width:80px;padding:0 11px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:9px;height:34px;color:var(--dsw-alias-label-secondary)}.yj-page .yj-search input{width:100%;border:0;outline:none;padding:6px 0;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;min-width:0}.yj-search:focus-within{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}.yj-page .yj-ghost{border:0;background:transparent;padding:6px 9px;font-size:12px;white-space:nowrap;color:var(--dsw-alias-label-secondary)}`,
`.yj-page .yj-folder{border:0;border-radius:6px;background:transparent;font-size:12px;line-height:20px;padding:5px 6px;gap:6px;color:var(--dsw-alias-label-secondary);font-weight:400}.yj-page .yj-folder:hover{background:var(--dsw-alias-interactive-bg-hover)}.yj-folder-chevron{display:flex;transition:transform .15s ease}.yj-folder-chevron.yj-expanded{transform:rotate(90deg)}`,
`.yj-reader{line-height:1.8}.yj-reader h1{font-size:23px}.yj-reader h2{font-size:18px}.yj-reader h3{font-size:15px}.yj-reader button{font:inherit;border:0!important;background:transparent!important;padding:0!important;color:var(--dsw-alias-state-business-primary)!important}`,
`
    @media(max-width:850px){.yj-workspace{grid-template-columns:minmax(0,1fr)}.yj-knowledge-toolbar{gap:3px}.yj-knowledge-toolbar .yj-search{min-width:140px}.yj-note-toolbar{flex-wrap:wrap}.yj-assistant-welcome{padding-top:40px}}`,
`
    .yj-workspace-dock{grid-template-columns:minmax(0,1fr) clamp(440px,34vw,520px)}@media(max-width:1100px){.yj-workspace-dock{grid-template-columns:minmax(0,1fr) min(440px,45vw)}}`,
`.yj-tree-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
`
    .yj-tabs{width:100%;box-sizing:border-box;flex-wrap:nowrap;overflow-x:auto}.yj-tabs>button{flex:none}.yj-tabs>.yj-world-tab{margin-inline-start:auto}.yj-tabs>button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.yj-world{background:var(--dsw-alias-bg-layer-1);border-radius:16px;padding:16px;min-height:100%;box-sizing:border-box}.yj-world .yj-world-card{min-height:0;padding:16px;gap:8px;border-radius:14px;background:var(--dsw-alias-bg-layer-1)}.yj-world .yj-world-card h3{margin:0;line-height:1.4}.yj-world .yj-world-card p{margin:0;min-height:0;flex:none;line-height:1.5}.yj-world .yj-world-card .yj-choice{display:flex;flex-direction:row;align-items:center;gap:8px;line-height:1.5}.yj-world .yj-world-card input[type=checkbox]{flex:none;width:16px;height:16px;margin:0}.yj-world .yj-world-result{scroll-margin-block:16px;outline-offset:4px}.yj-world .yj-world-result:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary)}.yj-world-timeline{display:grid;gap:12px;border-left:2px solid var(--dsw-alias-border-l2);padding-left:16px}.yj-world-metrics{display:grid;grid-template-columns:minmax(140px,1fr) minmax(100px,2fr);gap:8px}.yj-world-metrics dd{margin:0;overflow-wrap:anywhere}.yj-world table{border-collapse:collapse;min-width:520px;width:100%}.yj-world th,.yj-world td{padding:8px;border:1px solid var(--dsw-alias-border-l1);text-align:left;vertical-align:top;font-weight:400}.yj-world th{font-weight:500}`,
`@media(max-width:520px){.yj-world{padding:10px}.yj-world-metrics{grid-template-columns:minmax(100px,1fr) minmax(80px,1fr)}}`,
`
    .yj-modal.yj-page[open]{position:fixed;inset:24px 16px;margin:auto;width:min(820px,calc(100vw - 32px));height:fit-content;max-height:calc(100dvh - 48px);display:flex;overflow:auto;padding:24px;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 12px 40px var(--dsw-alias-border-l3)}
    .yj-modal:not([open]){display:none}.yj-modal>.yj-header{flex:none}`,
`
    .yj-busy{position:fixed;top:calc(var(--dsh-frame-top-clearance,0px) + 76px);left:50%;transform:translateX(-50%);z-index:95;min-height:0;padding:6px 8px 6px 14px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);box-shadow:0 6px 20px var(--dsw-alias-border-l2);animation:yj-busy-in .2s ease-out .8s both}@keyframes yj-busy-in{from{opacity:0;visibility:hidden;transform:translate(-50%,-6px)}to{opacity:1;visibility:visible;transform:translateX(-50%)}}`,
`.yj-tile{--yj-accent:var(--dsw-alias-brand-primary);position:relative;display:flex;flex-direction:column;gap:12px;min-width:0;box-sizing:border-box;padding:18px 20px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;outline:none;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;animation:yj-tile-in .32s ease both}.yj-tile:hover,.yj-tile:focus-visible{transform:translateY(-3px);border-color:color-mix(in srgb,var(--yj-accent) 40%,var(--dsw-alias-border-l1));box-shadow:0 18px 34px -22px color-mix(in srgb,var(--yj-accent) 60%,transparent)}.yj-tile:focus-visible{outline:2px solid color-mix(in srgb,var(--yj-accent) 60%,transparent);outline-offset:3px}.yj-tile-top{display:flex;align-items:center;gap:8px;min-height:26px;min-width:0}.yj-tile-icon{flex:none;display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;color:var(--yj-accent);background:color-mix(in srgb,var(--yj-accent) 12%,transparent)}.yj-tile-kicker{font-size:12px;font-weight:600;color:var(--yj-accent);white-space:nowrap}.yj-tile-badge{font-size:11px;line-height:18px;padding:0 8px;border-radius:999px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);white-space:nowrap}.yj-tile-num{margin-left:auto;font:600 22px/1 var(--dsw-font-family-mono,ui-monospace,monospace);letter-spacing:.02em;color:color-mix(in srgb,var(--yj-accent) 28%,transparent)}.yj-tile-title{margin:0;font-size:15.5px;font-weight:600;line-height:1.65;letter-spacing:.01em;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.yj-tile-text{margin:0;font-size:13px;line-height:1.8;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.yj-tile-note{margin:0;font-size:12px;color:var(--yj-accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.yj-tile-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:12px;border-top:1px dashed var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}.yj-tile-source{display:flex;align-items:center;gap:7px;min-width:0}.yj-tile-source>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-tile-mono{flex:none;display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:700;line-height:1;color:#fff;background:var(--yj-mono,var(--yj-accent))}.yj-tile-go{flex:none;color:var(--yj-accent);opacity:0;transform:translateX(-4px);transition:opacity .2s,transform .2s;white-space:nowrap}.yj-tile:hover .yj-tile-go,.yj-tile:focus-visible .yj-tile-go{opacity:1;transform:none}`,
`@keyframes yj-tile-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.yj-page .yj-brief-more{display:flex;align-items:center;gap:8px;margin:16px auto 0;padding:5px 16px;border-radius:999px;border-color:var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}.yj-brief-chevron{width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform .2s}.yj-brief-more[aria-expanded=true] .yj-brief-chevron{transform:translateY(1px) rotate(225deg)}.yj-brief-flag{font-size:11px;line-height:18px;padding:0 8px;border-radius:999px;color:#b45309;border:1px solid color-mix(in srgb,#f59e0b 55%,transparent);white-space:nowrap}.yj-brief-flag-media{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l2)}.yj-brief-detail{min-height:0;overflow:auto;padding-right:6px;font-size:14px;line-height:1.85}.yj-brief-meta{margin:0 0 16px}.yj-brief-meta .yj-tile-top{flex-wrap:wrap}.yj-brief-lead{margin:0 0 8px;padding:14px 18px;border-radius:12px;font-size:15px;line-height:1.9;background:color-mix(in srgb,var(--yj-accent,#6366f1) 7%,transparent);border-left:3px solid var(--yj-accent,#6366f1)}.yj-brief-detail h3{margin:18px 0 4px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary)}.yj-brief-detail section p{margin:0}.yj-brief-sources{margin-top:22px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l2);font-size:13px;overflow-wrap:anywhere}.yj-brief-sources h3{margin-top:10px}.yj-brief-sources ul{margin:2px 0 0;padding-left:18px}.yj-brief-sources strong{margin-right:10px;font-weight:600}.yj-brief-sources a{color:var(--yj-accent,#6366f1);text-decoration:none}.yj-brief-sources a:hover{text-decoration:underline}`,
`.yj-menu-surface .yj-toc-item{display:flex;justify-content:space-between;align-items:baseline;gap:18px;max-width:340px}.yj-menu-surface .yj-toc-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-menu-surface .yj-toc-item small{flex:none;color:var(--dsw-alias-label-secondary)}.yj-menu-surface .yj-toc-sub{padding-left:22px;color:var(--dsw-alias-label-secondary)}.yj-menu-surface .yj-toc-current{color:var(--yj-accent);font-weight:600}`,
`
    html[data-platform=darwin] .yj-modal.yj-page[open]{top:calc(var(--dsh-frame-top-clearance,0px) + 24px);max-height:calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px)}
    .yj-toast{position:fixed;inset:auto;top:calc(var(--dsh-frame-top-clearance,0px) + 52px);right:20px;left:auto;bottom:auto;transform:none;margin:0;width:max-content;max-width:min(420px,calc(100vw - 40px));padding:11px 10px 11px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 12px 32px rgb(0 0 0 / .16);z-index:2147483000;display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:20px;overflow:visible;animation:yj-toast-in .18s ease-out}
    .yj-toast-success{--yj-toast-accent:#16a34a}.yj-toast-error{--yj-toast-accent:#dc2626}.yj-toast-info{--yj-toast-accent:#d97706}
    .yj-toast-mark{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;color:#fff;background:var(--yj-toast-accent);font-size:12px;font-weight:700;line-height:1}
    .yj-toast-text{flex:1;min-width:0;overflow-wrap:anywhere;padding-top:0}
    .yj-toast button{font:inherit;color:inherit;cursor:pointer;flex:none;border-radius:6px}
    .yj-toast .yj-toast-action{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);padding:0 10px;height:24px;font-size:12px;margin-top:-2px}
    .yj-toast .yj-toast-close{border:0;background:transparent;width:22px;height:22px;margin:-1px 0 0;color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1}
    @keyframes yj-toast-in{from{opacity:0;translate:0 -6px}}@media(prefers-reduced-motion:reduce){.yj-toast{animation:none}}
    .yj-modal.yj-confirm.yj-page[open]{width:min(440px,calc(100vw - 32px));padding:22px 24px 20px;gap:0}
    .yj-confirm>.yj-header{margin-bottom:10px}.yj-confirm>.yj-header h2{font-size:16px;line-height:24px;font-weight:600}.yj-confirm>.yj-header button{border:0;background:transparent;font-size:18px;padding:2px 8px}
    .yj-confirm-body{color:var(--dsw-alias-label-secondary);line-height:22px;margin:0 0 22px;overflow-wrap:anywhere}.yj-confirm-body p{margin:0 0 6px}
    .yj-page .yj-dialog-actions{display:flex;justify-content:flex-end;align-items:center;gap:10px;flex-wrap:wrap;margin:0}.yj-page .yj-dialog-actions .yj-primary,.yj-page .yj-dialog-actions .yj-danger{margin:0}
    .yj-page .yj-danger{background:#dc2626;border-color:#dc2626;color:#fff}.yj-page .yj-danger:hover:not(:disabled){background:#b91c1c;border-color:#b91c1c}
    .yj-page .yj-avatar-upload{flex-direction:row;justify-content:center;gap:0}
    .yj-page .yj-row:has(>.yj-field){align-items:flex-end}
    .yj-page .yj-draft-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#b45309;white-space:nowrap}.yj-page .yj-draft-chip button{border:0;background:transparent;padding:2px 6px;font-size:12px;text-decoration:underline}`,
`
    .yj-page label.yj-choice{flex-direction:row;align-items:flex-start;gap:8px;overflow-wrap:anywhere}.yj-page label.yj-choice input[type=checkbox]{flex:none;margin-top:3px}`,
`
  `
];
