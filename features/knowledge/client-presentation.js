
/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "noteRemoveTitle": "移出笔记",
  "draftDiscardTitle": "放弃草稿",
  "draftDirty": "有未保存的修改",
  "root": "知识库位置",
  "query": "关键词（留空列出笔记）",
  "emptyNotes": "没有匹配笔记，可新建或交给专家整理",
  "truncated": "当前仅展示部分结果，请缩小关键词范围",
  "newNote": "新建笔记",
  "notePath": "库内 Markdown 路径",
  "confirmRemove": "确认移出这篇笔记",
  "restorePath": "要恢复的笔记路径",
  "export": "导出当前正文",
  "validate": "检查属性与链接",
  "valid": "检查通过，共 {count} 篇笔记",
  "invalid": "发现待处理项，共 {count} 篇笔记",
  "saved": "已保存",
  "deleted": "已移到可恢复区",
  "restored": "已恢复",
  "savedReadback": "文件已保存，但没能读回最新内容；草稿还在，请先重新读取",
  "listRefreshFailed": "文件操作已完成，列表尚未刷新；可重试查找笔记",
  "relationsUnavailable": "正文已打开；链接和反向链接暂时读不到",
  "reloadHelp": "读取后用最新正文替换编辑区；请先导出需要保留的草稿",
  "newNoteTitle": "新笔记",
  "resetGraph": "重置视图",
  "graphVersionMismatch": "图谱数据与当前界面不匹配，请完全退出并重新打开 DSH",
  "graphPreparing": "正在准备图谱 {done}/{total}",
  "graphCanvasError": "当前环境尚未提供 Canvas 图谱支持",
  "graphDataError": "图谱包含未返回的节点，请重新读取图谱",
  "selectNote": "选择笔记阅读，或新建一篇",
  "draftWarning": "切换笔记或会话前，请保存或导出编辑区草稿",
  "confirmDiscard": "确认放弃未保存的修改",
  "preparing": "正在连接知识库",
  "edit": "编辑",
  "backlinks": "反向链接",
  "noBacklinks": "暂无反向链接",
  "outgoing": "链接状态",
  "linkMissing": "链接目标缺失",
  "linkAmbiguous": "链接存在多个目标，请从列表选择",
  "fragmentMissing": "目标笔记存在，但标题或块定位缺失或重名",
  "invalidLink": "此链接不是有效的库内笔记引用",
  "linkAttachment": "这是附件引用，不作为笔记打开，也未检查附件是否存在",
  "noteReadOnly": "此笔记仅供阅读，不在插件编辑、删除或恢复范围内",
  "missingGraphNote": "此笔记尚不存在；这里只展示引用关系，不是实际文件",
  "missingGraphSources": "引用来源",
  "reading": "笔记阅读",
  "locate": "已定位原文第 {line} 行",
  "clearLocate": "显示完整笔记",
  "graph": "关系图谱",
  "directoryResize": "调整目录宽度",
  "localGraph": "当前笔记关系图",
  "graphRange": "图谱显示范围",
  "graphPage": "{from}–{to} / {total}",
  "graphPartial": "部分关系",
  "graphOmitted": "另有 {count} 条连线不在当前画面内",
  "graphEmpty": "该范围没有笔记",
  "selectForQuestion": "选入问答：{name}",
  "allNotes": "全部笔记",
  "folder": "文件夹",
  "more": "更多操作",
  "notes": "笔记",
  "noteDetails": "笔记详情",
  "libraryTools": "知识库工具",
  "directoryLoading": "正在读取目录",
  "directoryRetry": "重试目录",
  "searchPlaceholder": "搜索笔记…"
};
export const en = {
  "graphVersionMismatch": "Graph data does not match this interface. Fully quit and reopen DSH",
  "graphPreparing": "Preparing graph {done}/{total}",
  "graphCanvasError": "Canvas graph is not available in this environment",
  "graphDataError": "The graph references missing nodes; reload the graph",
  "linkAttachment": "This is an attachment reference, not a note; attachment existence has not been checked",
  "noteReadOnly": "This note is read-only; editing, deleting and restoring are not available in the plugin",
  "missingGraphNote": "This note does not exist. The graph shows references, not a file",
  "missingGraphSources": "Referenced by",
  "graph": "Knowledge graph",
  "directoryResize": "Resize note directory"
};
export const styles = [
`.yj-note{text-align:left;overflow-wrap:anywhere}.yj-note small{display:block;color:var(--dsw-alias-label-secondary);font-weight:400}`,
`
    .yj-note-row{display:flex;gap:8px;align-items:center}.yj-note-row .yj-note{flex:1;min-width:0}`,
`.yj-graph{width:100%;height:440px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}.yj-graph line{stroke:var(--dsw-alias-border-l2);stroke-width:1.5}.yj-graph circle{fill:var(--dsw-alias-brand-primary);cursor:pointer}.yj-graph text{fill:var(--dsw-alias-label-primary);font-size:13px;pointer-events:none}.yj-graph [role=button]:focus circle{stroke:var(--dsw-alias-label-primary);stroke-width:3}`,
`.yj-graph-frame{overflow:auto;max-height:440px}.yj-graph{display:block}.yj-graph [role=button]{pointer-events:bounding-box;cursor:pointer}`,
`
    .yj-knowledge{height:100%;min-height:0;display:flex;flex-direction:column;gap:8px}.yj-knowledge>.yj-row{flex:none}.yj-knowledge .yj-field{min-width:120px}.yj-knowledge-split{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:0;flex:1;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;overflow:hidden}.yj-note-tree{padding:12px 8px;min-height:0;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}.yj-directory .yj-directory{padding-left:12px}`,
`.yj-note-row{gap:4px}.yj-page .yj-note-tree .yj-note{border:0;background:transparent;padding:6px 8px;border-radius:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:12px}.yj-page .yj-note-tree .yj-note:hover,.yj-page .yj-note-tree .yj-selected{background:var(--dsw-alias-interactive-bg-hover)}.yj-note-tree input[type=checkbox]{width:12px;height:12px;flex:none}.yj-note-canvas{overflow:auto;min-width:0;min-height:0;padding:20px 24px;background:var(--dsw-alias-bg-layer-1)}.yj-note-canvas .yj-reader{max-width:800px;margin:auto;padding-top:16px}.yj-note-canvas>.yj-section{margin:0;border:0;padding:0}.yj-note-canvas label:first-child input{font-size:12px;color:var(--dsw-alias-label-secondary);border:0;background:var(--dsw-alias-bg-layer-2);padding:5px 8px}.yj-note-actions,.yj-backlinks{margin-top:16px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px}`,
`.yj-graph-frame{max-height:none}.yj-graph{height:100%;min-height:380px;border:0;background:var(--dsw-alias-bg-layer-1)}`,
`
    @media(max-width:1100px){.yj-workspace{grid-template-columns:minmax(0,1fr) 300px;gap:12px}.yj-workspace-float,.yj-workspace-bubble{grid-template-columns:minmax(0,1fr)}.yj-knowledge-split{grid-template-columns:165px minmax(0,1fr)}.yj-note-canvas{padding:16px}.yj-page{padding:18px}.yj-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,195px),1fr))}}`,
`
    .yj-knowledge{gap:10px}.yj-knowledge-toolbar{display:flex;align-items:center;gap:6px;flex:none;min-height:36px}`,
`.yj-knowledge-split{border-radius:14px;grid-template-columns:195px minmax(0,1fr);background:var(--dsw-alias-bg-layer-1)}.yj-note-tree{padding:10px 7px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 97%,var(--dsw-alias-label-primary) 3%)}`,
`.yj-note-row{min-height:29px}.yj-page .yj-note-tree .yj-note{display:flex;align-items:center;gap:7px;padding:4px 6px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}.yj-page .yj-note-tree .yj-selected{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.yj-note-tree input[type=checkbox]{appearance:auto;opacity:0;transition:opacity .12s}.yj-note-row:hover input,.yj-note-row:focus-within input,.yj-note-tree input:checked{opacity:1}.yj-note-tree .yj-row button{font-size:11px;border:0;background:transparent;padding:3px 5px}.yj-note-canvas{padding:16px 22px}.yj-note-toolbar{display:flex;align-items:start;gap:10px;margin-bottom:16px}.yj-note-path{flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary)}.yj-note-path>summary{list-style:none;display:flex;gap:6px;align-items:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:28px}.yj-note-path[open]>label{padding-top:8px}.yj-note-toolbar .yj-row{gap:2px;flex-wrap:nowrap}.yj-note-toolbar .yj-row button{border:0;background:transparent;padding:4px 8px;font-size:11px}`,
`.yj-backlinks,.yj-note-actions{border:0;margin-top:10px;padding-top:0;font-size:12px;color:var(--dsw-alias-label-secondary)}`,
`
    @media(max-width:1100px){.yj-workspace{grid-template-columns:minmax(0,1fr) 290px;gap:12px}.yj-workspace-float,.yj-workspace-bubble{grid-template-columns:minmax(0,1fr)}.yj-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,195px),1fr))}.yj-knowledge-split{grid-template-columns:155px minmax(0,1fr)}.yj-knowledge-toolbar{flex-wrap:wrap}.yj-search{flex-basis:180px}.yj-note-canvas{padding:14px}}`,
`
    @media(max-width:520px){.yj-page{padding:12px}.yj-knowledge-split{grid-template-columns:125px minmax(0,1fr)}.yj-note-tree{padding:8px 3px}.yj-page .yj-folder{font-size:11px;gap:3px}.yj-note-canvas{padding:10px}.yj-grid{grid-template-columns:1fr}.yj-note-toolbar .yj-row button{padding:4px 6px}}`,
`
    .yj-note-canvas.yj-graph-mode{padding:0;overflow:hidden;display:flex}.yj-graph-workspace{position:relative;display:flex;flex:1;min-width:0;min-height:0}.yj-graph-empty{display:flex;flex:1;align-items:center;justify-content:center}.yj-graph-controls{position:absolute;left:10px;bottom:10px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 20px);flex-wrap:wrap;padding:4px 6px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 6px var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}.yj-page .yj-graph-controls button{padding:4px 6px;border:0;background:transparent;font-size:11px}.yj-graph-missing{position:absolute;left:12px;top:12px;max-width:min(420px,calc(100% - 24px));max-height:50%;overflow:auto;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
    .yj-knowledge-split{grid-template-columns:var(--yj-directory-width,195px) 8px minmax(0,1fr)}.yj-note-tree{min-width:0;border-right:0}.yj-directory-separator{cursor:col-resize;touch-action:none;background:var(--dsw-alias-bg-layer-2);position:relative}.yj-directory-separator:before{content:'';position:absolute;left:3px;top:0;bottom:0;width:2px;background:var(--dsw-alias-border-l1)}.yj-directory-separator:hover:before,.yj-directory-separator:focus-visible:before{background:var(--dsw-alias-state-business-primary)}.yj-directory-separator:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}`,
`.yj-folder>svg,.yj-folder-chevron,.yj-note>svg{flex-shrink:0}.yj-note-tree .yj-note{flex:1}.yj-note-row{min-width:0}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
export const errors = {
  "SOURCE_CONFIG": [
    "插件没找到可用的配置目录或知识库位置（DSH 设置问题）",
    "请确认 DSH 正常启动，并检查插件配置里的知识库位置，然后重启 DSH"
  ],
  "SOURCE_DIRECTORY": [
    "目标位置不能使用（本机文件问题）",
    "请换一个普通文件夹（不要用快捷方式、网络盘或系统目录）后重试"
  ],
  "SOURCE_MODE": [
    "目标位置不能使用（本机文件问题）",
    "请换一个普通文件夹（不要用快捷方式、网络盘或系统目录）后重试"
  ],
  "GRAPH_CONTRACT_MISMATCH": [
    "插件收到的结果不完整（插件问题）",
    "请重试；仍不行请完全退出 DSH 后重新打开"
  ],
  "COVERAGE_OUTPUT": [
    "插件收到的结果不完整（插件问题）",
    "请重试；仍不行请完全退出 DSH 后重新打开"
  ]
};
export const inputCodes = [
  "COVERAGE_CONFLICT",
  "SOURCE_SCOPE",
  "SOURCE_UNAVAILABLE",
  "NOTE_"
];
