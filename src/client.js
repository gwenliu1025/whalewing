/** 客户端工厂由构建入口串行化，所有运行依赖必须留在函数内。 */
export function createClient(require, makeContract, makeExpertContract, z, formatFileMention, graphFactory, skillFactory, makeAutomationContract, makeNewsContract, makeModelWorldContract, utilityFactory, featureViews) {
  const React = require('react');
  const { createElement: h, useState, useRef, useEffect, useSyncExternalStore } = React;
  // 鲸翼标志“鲸尾为翼”：两片尾鳍画成一对鹏翼，下面一道水纹是北冥。原图在 art/brand。
  const logoFluke = 'M32 46C32 38 37 31 45 26C50 23 55 19 58 13C59.5 21 57 27 52 31L54.5 32.5C50 35.5 46 37 42 37.6L44 39.4C40 40 36.5 41.5 34 44.5L33.5 46Z';
  /** tone=mono 跟随文字颜色（侧栏）；tone=brand 用品牌深蓝与天青，深色主题换浅色版。 */
  function Logo({ size = 16, tone = 'mono' }) {
    const deep = tone === 'brand' ? 'var(--yj-logo-deep, currentColor)' : 'currentColor', sky = tone === 'brand' ? 'var(--yj-logo-sky, currentColor)' : 'currentColor';
    return h('svg', { className: 'yj-logo', viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': true, focusable: 'false' },
      h('g', { fill: deep }, h('path', { d: logoFluke }), h('path', { d: logoFluke, transform: 'matrix(-1 0 0 1 64 0)' }), h('path', { d: 'M30 44H34L34.8 52.5H29.2Z' })),
      h('path', { d: 'M4 55.5C10 52 16 52 22 55.5C28 59 36 59 42 55.5C48 52 54 52 60 55.5', fill: 'none', stroke: sky, strokeWidth: 3.2, strokeLinecap: 'round' }));
  }
  const GraphCanvas = graphFactory(React);
  const ModelWorldView = featureViews.createModelWorldView(React, featureViews.portraits);
  const { ToolboxView, AiWebView } = utilityFactory(React);
  // 暖金来自原创专家头像的艺术配色，仅作装饰，不借用业务状态色。
  const warmArt = '#e9be65';
  const NS = 'whalewing';
  const zh = {
    assistantPreviewMissing: '当前 DSH 版本不支持资料预览，会话和草稿都还在', assistantPreviewRetry: '重试资料预览',
    panel: '鲸翼',
    toastClose: '关闭', aiWebSessionTitle: 'AI 网页', mcpUnsupported: '当前 DSH 版本列不出 MCP 连接，专家暂时不能单独绑定 MCP，会照常使用 DSH 里启用的全部 MCP。', modelUnsupported: '当前 DSH 版本切换模型会改掉你的默认模型，所以专家暂时跟随会话当前的模型。', confirmTitle: '请确认', expertSaveChanges: '保存修改', expertCreate: '创建专家', expertSavedNamed: '已保存「{name}」的修改', expertCreated: '已添加专家「{name}」', expertResetDone: '「{name}」已恢复初始配置', expertDeleteDone: '已删除专家「{name}」', expertRestoreDone: '已找回专家「{name}」',
    expertDeleteTitle: '删除专家', expertResetTitle: '恢复初始配置', noteRemoveTitle: '移出笔记', skillRemoveTitle: '删除技能', skillResetTitle: '恢复系统原件', skillRollbackTitle: '恢复旧版技能', skillRemoved: '技能已删除', skillResetDone: '已恢复系统原件', skillRolledBack: '已恢复旧版技能', skillToggled: '技能状态已更新',
    newsRemoveTitle: '删除领域', newsDiscardTitle: '放弃领域草稿', draftDiscardTitle: '放弃草稿', draftDirty: '有未保存的修改', draftDiscarded: '已放弃未保存的修改', taskSaved: '定时任务已保存', taskToggled: '任务状态已更新', taskCancelled: '已取消这个定时任务', newsSaved: '资讯领域已保存', newsRemoved: '资讯领域已删除', skillSaved: '技能已保存', workbenchRecoverTitle: '工作台会话需要处理', createdSessionReady: '任务会话已创建，但没有自动打开',
    experts: '专家团队', knowledge: '个人知识', skills: '技能成长', schedule: '定时任务', news: '知识卡片', models: '模型世界',
    newsSettings: '卡片设置', newsSettingsClose: '返回知识卡片', newsDaily: '每日资讯', newsLearning: '今日学习', newsLearningReview: '复习卡片', newsConfigureSchedule: '管理资讯计划', newsInitialize: '重试默认资讯计划', newsDiagnostics: '查看运行详情', taskPaused: '已暂停', taskPause: '暂停', taskResume: '恢复', taskActions: '任务操作', taskSelect: '选择一项任务，查看内容与结果', taskScheduleSettings: '查看调度设置', openPlugins: '打开插件设置', taskUnavailableShort: '定时任务需要先开启 DeepSeek 官方的「定时任务」插件', taskStatusHelp: '暂停后不会再按时执行，已经开始的不受影响；恢复后从下一次时间开始',
    newsHelp: '本地模型根据明确配置的 RSS/Atom 来源精选，每期最多十条，不代表覆盖全球所有网站；阅读和配置不会采集新闻或调用模型',
    aiWeb: 'AI 网页', toolbox: '工具台', browserMissing: 'DSH 内置浏览器还没就绪，请在「插件」页启用浏览器后重试',
    newsWindow: '本期发布时间窗口（北京时间）', newsAdd: '添加领域', newsEdit: '编辑领域', newsName: '领域名称', newsFocus: '关注描述', newsEnabled: '纳入每日采集', newsSave: '保存领域', newsRemove: '删除领域', newsRemoveHelp: '删除后不再采集这个领域，已有日报保留', newsLastHelp: '这是最后一个启用的领域，请先暂停每日资讯，再修改领域', newsConfirm: '确认修改领域', newsConflictReload: '读取最新版本（保留草稿）', newsDiscard: '放弃领域草稿', newsDiscardHelp: '确认放弃未提交的领域和来源修改？', newsSources: '公开订阅来源', newsSourceHelp: '选择已有来源，或添加公开的 HTTPS 订阅地址', newsSourceName: '来源名称', newsSourceUrl: '公开 HTTPS 订阅地址', newsSourceKind: '来源性质', newsSourceRegion: '来源地区', newsPrimary: '一手来源', newsMedia: '媒体来源', newsDomestic: '国内', newsOverseas: '海外', newsSourceAdd: '加入来源表单', newsSourceChoose: '请选择', newsStartHelp: '每天北京时间 08:00 自动整理已启用的领域，使用 DSH 默认模型，会产生模型费用；DSH 需要处于运行状态', newsReports: '查看历史日报', newsCurrent: '读取本期日报', newsReportEmpty: '今日日报尚未生成', newsHistoryEmpty: '尚无已保存日报', newsHistoryOlder: '更早日报', newsHistoryFields: '已保存日报的领域', newsDeletedField: '领域已删除，历史只读', newsPartial: '部分来源失败', newsEmpty: '本期没有符合条件的条目', newsImportance: '重要性', newsRelevance: '跟我们的关系', newsLeak: '内测 / 传闻', newsMediaOnly: '媒体报道', newsCount: '{count} 条', newsCat_model: '大模型', newsCat_agent: '智能体与产品', newsCat_opensource: '开源与工具', newsCat_media: '图像 · 视频 · 语音', newsCat_research: '研究与其他', newsImpact: '可能工作影响（推断）', newsUnverified: '未知', newsOpenSession: '打开生成会话', newsWriteUnknown: '没能确认保存结果，草稿还在；请刷新查看', newsReadback: '保存后的内容和提交的不一致，草稿还在；请刷新查看',
    project: '工程绝对路径（可选）', workspace: '使用已有工作区',
    defaultWorkspace: '使用 DSH 默认位置',
    start: '开始新任务', includeSource: '将本次新任务纳入我的知识沉淀',
    noSession: '知识工作台尚未连接，请重试', refresh: '刷新',
    root: '知识库位置',
    search: '查找笔记', query: '关键词（留空列出笔记）', emptyNotes: '没有匹配笔记，可新建或交给专家整理',
    truncated: '当前仅展示部分结果，请缩小关键词范围', newNote: '新建笔记', notePath: '库内 Markdown 路径',
    content: 'Markdown 正文', read: '阅读', save: '保存', remove: '移到可恢复区',
    confirmRemove: '确认移出这篇笔记', cancel: '取消', stopWait: '停止等待结果',
    stopHelp: '已停止等待；已提交的操作可能仍在进行，稍后刷新查看结果',
    stopped: '操作已结束，请刷新查看结果', restorePath: '要恢复的笔记路径', restore: '恢复',
    export: '导出当前正文', validate: '检查属性与链接', validation: '知识检查',
    valid: '检查通过，共 {count} 篇笔记', invalid: '发现待处理项，共 {count} 篇笔记',
    saved: '已保存', deleted: '已移到可恢复区', restored: '已恢复',
    savedReadback: '文件已保存，但没能读回最新内容；草稿还在，请先重新读取', listRefreshFailed: '文件操作已完成，列表尚未刷新；可重试查找笔记', relationsUnavailable: '正文已打开；链接和反向链接暂时读不到',
    conflict: '这篇笔记刚在别处被修改过，你的草稿还在；请先读取最新内容，再决定如何合并',
    reload: '读取最新内容', reloadHelp: '读取后用最新正文替换编辑区；请先导出需要保留的草稿',
    requestFailed: '操作失败，请检查提示后重试', badReply: '插件收到的结果不完整，请重试',
    unknownCommand: '当前会话尚未启用鲸翼命令', invalidPath: '请输入工程的绝对路径',
    sourceRegisterFailed: '专家会话已创建，但没能加入知识沉淀；可以在来源列表中手动添加',
    emptySkills: '还没有演进技能，可与专家一起从已有知识中提炼',
    candidate: '候选', active: '已启用', disabled: '已停用', disable: '停用技能', restoreSkill: '恢复技能',
    skillIssue: '待处理', rollbackSkill: '回退到发布前旧版', confirmRollback: '确认恢复最近一次发布前的有效旧版？不是恢复停用的当前版本；旧版来源失效时会保留现状',
    confirmRollbackAction: '确认回退', newNoteTitle: '新笔记',
    refine: '与小鲸讨论提炼',
    refinePrompt: '请和我讨论如何从已有知识提炼个人技能。先查找现有技能与知识，和我确认要解决的问题及来源，再按现有技能演进流程准备候选；不要直接发布',
    resetGraph: '重置视图', assistantMove: '移动小鲸助手', assistantDrag: '点击打开，按住可拖动到其他位置', assistantResize: '调整助手大小',
    resize_n: '上', resize_ne: '右上', resize_e: '右', resize_se: '右下', resize_s: '下', resize_sw: '左下', resize_w: '左', resize_nw: '左上',
    draftPrepared: '讨论提议已放入输入框，可编辑后发送', draftUnavailable: '输入框尚未就绪或正在提交，提议未写入；请稍后重试', graphVersionMismatch: '图谱数据与当前界面不匹配，请完全退出并重新打开 DSH',
    graphPreparing: '正在准备图谱 {done}/{total}', graphCanvasError: '当前环境尚未提供 Canvas 图谱支持', graphDataError: '图谱包含未返回的节点，请重新读取图谱',
    skillOverrideConflict: '同名位置不是这项系统技能的有效个人修改，请先在技能库处理冲突；原件与现有文件均保留',
    resetExpert: '重置为初始配置', expertConfirmReset: '恢复这位内置专家的初始配置？', expertResetHelp: '名称、头像、提示词、模型和技能／MCP 绑定将恢复初始值，历史会话保留',
    skillLibrary: '我的技能库', skillHelp: '已入库不代表当前对话已使用', newSkill: '新增技能', editSkill: '编辑技能', saveSkill: '保存技能', removeSkill: '删除用户技能', resetSkill: '恢复系统原件', skillContent: '技能内容（Markdown）', skillIdentifier: '技能标识', skillIdentifierHelp: '使用简短英文、数字或连字符，保存后保持不变', builtin: '系统内置', user: '我的技能', override: '系统技能的个人修改', evolution: '知识提炼', available: '可用', catalogued: '已入库', shadowed: '库内存在同名优先项', unavailable: '不可用', inactive: '未启用', unknown: '发现状态待确认', skillMissing: '此技能已不存在，请刷新技能库', skillReadback: '没能确认保存结果，当前内容还在；请重新读取已保存的版本', skillLoadSaved: '加载已保存版本', skillConfirmRemove: '删除这项用户技能？', skillConfirmReset: '清除个人修改并恢复系统原件？', skillBuiltinHelp: '系统原件保留；编辑会创建个人修改，之后可以重置',
    sources: '允许沉淀的会话',

    scheduleHelp: '定时任务由 DSH 的定时服务执行，DSH 需要处于运行状态；错过的时间点会在下次启动时按规则补上',
    knowledgeTask: 'DSH 工作知识整理', taskDisabled: '未启用', enableTask: '设置并启用', newTask: '新增定时任务',
    taskScopeHelp: '启用后会整理你在 DSH 里的普通对话（不含子任务和自动任务），写入个人知识库，不会扫描电脑上的其他文件',
    taskModelHelp: '采用每次执行时的系统默认模型，不继承小鲸专用模型；请先在 DSH 配置可用模型与凭据，运行可能产生模型费用',
    scheduleUnavailable: '到「插件」页找到「定时任务」并打开开关，回来点「刷新」；草稿会保留',
    taskTitle: '任务名称', taskPrompt: '工作指令', taskRule: '时间规则',
    rule_after_seconds: '延迟一次', rule_at: '指定时间一次', rule_every_seconds: '固定间隔', rule_daily: '每天', rule_weekly: '每周', rule_cron: 'Cron',
    taskSeconds: '秒数', taskAt: '时间（含时区的 ISO 日期）', taskExpression: 'Cron 表达式', taskWeekdays: '星期（1 周一至 7 周日）',
    submitTask: '确认创建计划', editTask: '编辑计划', saveTask: '保存计划', cancelPlan: '取消计划',
    cancelPlanHelp: '取消后不再执行，执行记录会一并删除；已经产生的会话和知识保留',
    openTaskSession: '打开原会话', taskDetails: '计划详情', taskActive: '已启用', taskInactive: '计划已结束', taskHistory: '执行记录', historyHelp: '记录的是任务已按时发出，不代表模型已完成工作',
    noHistory: '还没有执行记录', historyEarlier: '更早的记录已被清理', historyMore: '加载更早记录', historyDetails: '执行记录详情',
    taskLegacy: '旧知识计划', taskLegacyHelp: '这些是旧版工作台创建的计划。请先取消旧计划，再启用新的知识整理，避免重复执行',
    taskPending: '上次创建的结果还没确认', taskPendingHelp: '上次创建可能已经成功。请先查看原会话确认，避免重复创建',
    taskRecover: '查看原会话和计划', taskContinue: '继续原会话创建', taskPendingMissing: '还没找到已创建的计划；确认原会话后可以继续创建',
    taskPendingConflict: '上次创建还没确认，请先查看原会话', taskCacheError: '创建恢复记录尚未可靠保存，请检查浏览器存储后重试；尚未发起新建',
    taskReadback: '没能确认计划是否保存成功，草稿还在；请刷新查看', taskReload: '读取最新版本（保留草稿）', taskDraftClose: '收起任务草稿', taskDraftResume: '继续编辑草稿', taskDiscard: '放弃任务草稿', taskDiscardConfirm: '放弃未提交的修改？',
    time: '每日时间', timeZone: '时区',
    taskTime: '下次时间',
    mutationDone: '操作已完成并刷新', loading: '正在处理', close: '关闭提示',
    selectNote: '选择笔记阅读，或新建一篇', selectSkill: '选择技能查看正文与来源', sourcePaths: '知识来源',
    draftWarning: '切换笔记或会话前，请保存或导出编辑区草稿', noRoles: '角色配置尚未加载',
    discard: '放弃当前草稿', confirmDiscard: '确认放弃未保存的修改',
    mode: 'DSH 模式', defaultMode: '使用 DSH 默认模式',
    expert: '专家', noExpert: '不使用专家', expertSearch: '搜索专家', noExpertMatch: '没有匹配专家',
    historicalExpert: '历史专家：{name}（新建任务接续）',
    advanced: '可选设置', workbenchTitle: '鲸翼知识工作台',
    preparing: '正在连接知识库', retry: '重试', createdSession: '已创建的任务', openCreated: '打开已创建的任务',
    expertSelectionFailed: '任务已创建，但专家还没设置好；请打开任务查看',
    workbenchUnclaimed: '工作台会话没有准备好，请打开该会话查看后再处理',
    inspectWorkbench: '打开该会话', prepareWorkbench: '重新准备知识工作台', prepareHelp: '会新建一个工作台会话，旧会话不受影响',
    edit: '编辑', back: '返回上一篇', backlinks: '反向链接', noBacklinks: '暂无反向链接', outgoing: '链接状态',
    linkMissing: '链接目标缺失', linkAmbiguous: '链接存在多个目标，请从列表选择', fragmentMissing: '目标笔记存在，但标题或块定位缺失或重名', invalidLink: '此链接不是有效的库内笔记引用', linkAttachment: '这是附件引用，不作为笔记打开，也未检查附件是否存在', noteReadOnly: '此笔记仅供阅读，不在插件编辑、删除或恢复范围内', missingGraphNote: '此笔记尚不存在；这里只展示引用关系，不是实际文件', missingGraphSources: '引用来源',
    reading: '笔记阅读', locate: '已定位原文第 {line} 行', clearLocate: '显示完整笔记',
    graph: '关系图谱', directoryResize: '调整目录宽度', localGraph: '当前笔记关系图', graphRange: '图谱显示范围', graphPage: '{from}–{to} / {total}', graphPartial: '部分关系', graphOmitted: '另有 {count} 条连线不在当前画面内',
    graphEmpty: '该范围没有笔记', previous: '上一页', next: '下一页',
    question: '小鲸助手', questionHelp: '和小鲸一起处理工作、查阅知识；只提问不会自动修改笔记',
    askCurrent: '选用当前笔记', clearSelection: '清空所选', selectForQuestion: '选入问答：{name}',
    addExpert: '添加专家', expertCustom: '自定义', editExpert: '编辑专家', expertName: '专家名字', expertDescription: '一句话介绍', expertPrompt: '系统提示词（必填）', expertModel: '对话模型', inheritModel: '跟随系统默认', avatar: '上传头像', clearAvatar: '使用默认头像', avatarPresets: '选择预置头像', saveExpert: '保存专家', deleteExpert: '删除专家', restoreExpert: '恢复专家', deletedExperts: '已删除的专家', expertDeleteHelp: '删除不会影响历史会话，可随时恢复', expertSaved: '专家配置已保存', requiredExpert: '请填写专家名字、介绍和系统提示词', optionalSkills: 'Skills · 可选', optionalMcp: 'MCP · 可选', missingBinding: '当前目录未发现，取消勾选可移除绑定', emptyCatalog: '尚未发现可选项目', catalogHelp: '绑定现有能力；取消绑定不会删除原技能或连接', modelMissing: '没找到所选模型，请在 DSH 设置里检查模型配置', editorClose: '关闭专家编辑', allNotes: '全部笔记', folder: '文件夹', more: '更多操作', assistantDock: '停靠', assistantFloat: '悬浮', assistantMinimize: '收起助手', assistantOpen: '打开小鲸助手', assistantStart: '开始与小鲸协作', assistantMissing: '小鲸助手已删除，请在专家管理中恢复', generalScope: '未选笔记 · 小鲸会按需查找知识', noteScope: '当前资料', expertOptions: '专家操作', closePanel: '关闭', notes: '笔记', noteDetails: '笔记详情', libraryTools: '知识库工具', assistantHistory: '在主会话打开', directoryLoading: '正在读取目录', directoryRetry: '重试目录', expertConfirmDelete: '确认删除这位专家？', cancelEdit: '取消编辑', skillEdit: '与小鲸编辑技能', skillEditPrompt: '请协助编辑我所选的自有技能：{reference}。先通过 whalewing_skill 的 read 动作读取指定 name 和 state，核对返回 hash 与上述已读 hash 一致；不一致时停止修改并请我重新选择。读取来源后和我确认编辑内容，再按现有技能演进流程处理；不要按同名的其他状态替换，也不要修改宿主或其他插件的技能正文', reasoning: '思考强度', reasoningDefault: '模型默认', citeNotes: '引用所选笔记', citeLabel: '{count} 篇笔记', citeHelp: '点击输入框旁的引用按钮，将这些笔记加入当前问题。实际发送范围以输入框中的资料标签为准', citeQuestion: '请结合所附资料回答本条消息中的用户问题', citeFailed: '资料未加入输入框，请保持原问题后重试', expertRecovery: '已发现该专家的已保存版本，当前表单已保留；加载已保存配置将替换当前表单', loadSavedExpert: '加载已保存配置', expertPreparationStopped: '已停止等待专家准备，你的问题还没发送；请稍后重试', expertSubagent: '子代理沿用其所属会话的专家职责，请在主会话管理专家', searchPlaceholder: '搜索笔记…', assistantTagline: '让知识成为你的工作伙伴', citePathUnsupported: '这篇笔记的路径无法作为附件引用，请修改文件名后重试；你的问题还在',
  };
  // 同一字典命名空间提供英文回退，不在组件内复制产品文案。
  const en = { ...zh, noteReadOnly: 'This note is read-only; editing, deleting and restoring are not available in the plugin', linkAttachment: 'This is an attachment reference, not a note; attachment existence has not been checked', missingGraphNote: 'This note does not exist. The graph shows references, not a file', missingGraphSources: 'Referenced by', panel: 'WhaleWing', graph: 'Knowledge graph', directoryResize: 'Resize note directory', catalogued: 'In library', skillHelp: 'In library does not mean this conversation has used it', shadowed: 'A same-name item takes precedence in the library', draftPrepared: 'The discussion proposal is in your draft. Edit it before sending', draftUnavailable: 'The input is not ready or is submitting. Nothing was inserted; try again shortly', graphVersionMismatch: 'Graph data does not match this interface. Fully quit and reopen DSH', graphPreparing: 'Preparing graph {done}/{total}', graphCanvasError: 'Canvas graph is not available in this environment', graphDataError: 'The graph references missing nodes; reload the graph' };
  Object.assign(zh, Object.fromEntries(Object.entries(featureViews.worldViewCopy).map(([key, value]) => [`modelWorld_${key}`, value])));
  Object.assign(en, Object.fromEntries(Object.entries(featureViews.worldViewCopy).map(([key, value]) => [`modelWorld_${key}`, value])));
  Object.assign(zh, { legacyTimeZone: '原任务时区：{zone}', convertBeijingTime: '改为北京时间', beijingTime: '北京时间', workspaceAll: '全部工作区', workspaceSelected: '已选 {count} 个工作区', workspaceScope: '处理范围', workspaceScopeHelp: '全选后可取消个别工作区；知识整理只读取纳入范围的会话', customWorkspaceHelp: '所选工作区作为本任务的处理清单', newsMore: '展开另外 {count} 条', newsKicker: '资讯', newsToday: '今天', newsYesterday: '昨天', newsCutoff: '截至 {time}', learningDate: '{month} 月 {day} 日 · 星期{week}', learningMeta: '{count} 张 · 共约 {minutes} 分钟', learningMinutes: '约 {minutes} 分钟', learningPoints: '{count} 个要点', learningOpen: '翻开', learningHighlights: '本章要点', learningExample: '举个例子', learningGuide: '中文导读', learningOriginalEn: '完整原文 · 英文', learningOriginalZh: '完整原文', bookCover: '扉页', bookToc: '目录', bookPrev: '上一页', bookNext: '下一页', bookSmaller: '缩小字号', bookLarger: '放大字号', bookProgress: '阅读进度', bookEnd: '完', newsLess: '收起', newsMoreLabel: '展开或收起本领域的第二行资讯', newsSourcesTitle: '来源', newsOriginal: '一手链接', learningSource: '资料来源', learningReason: '推荐理由' });
  Object.assign(en, { legacyTimeZone: 'Existing time zone: {zone}', convertBeijingTime: 'Use Beijing time', beijingTime: 'Beijing time', workspaceAll: 'All workspaces', workspaceSelected: '{count} workspaces selected', workspaceScope: 'Workspaces', workspaceScopeHelp: 'Exclude individual workspaces from knowledge collection', customWorkspaceHelp: 'Selected workspaces form this task’s processing list; the working directory is its execution anchor', newsMore: 'Show {count} more', newsKicker: 'News', newsToday: 'Today', newsYesterday: 'Yesterday', newsCutoff: 'As of {time}', learningDate: '{month}/{day}', learningMeta: '{count} cards · about {minutes} min', learningMinutes: '{minutes} min', learningPoints: '{count} key points', learningOpen: 'Open', learningHighlights: 'Key points', learningExample: 'Example', learningGuide: 'Guide', learningOriginalEn: 'Full text · English', learningOriginalZh: 'Full text', bookCover: 'Cover', bookToc: 'Contents', bookPrev: 'Previous page', bookNext: 'Next page', bookSmaller: 'Smaller text', bookLarger: 'Larger text', bookProgress: 'Reading progress', bookEnd: 'End', newsLess: 'Show less', newsMoreLabel: 'Show or hide the second row of this field', newsSourcesTitle: 'Sources', newsOriginal: 'Primary link', learningSource: 'Sources', learningReason: 'Why recommended' });
  const css = `
.yj-page .yj-modal{position:fixed;inset:0;margin:auto;width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 48px);height:fit-content;overflow:auto;padding:24px;border:1px solid var(--dsh-border-color);border-radius:16px;background:var(--dsh-bg-base);color:var(--dsh-text-primary)}
.yj-modal::backdrop{background:rgb(0 0 0 / .4)}
.yj-page .yj-task-time{display:flex;align-items:end;gap:16px;margin-block:16px}.yj-page .yj-task-time .yj-field{flex:none;width:160px}.yj-page .yj-task-time>span{padding-bottom:10px}.yj-page .yj-task-workspaces{display:grid;grid-template-columns:1fr 1fr;gap:16px}.yj-page .yj-workspace-options{max-height:280px;overflow:auto}.yj-page .yj-workspace-options .yj-choice{display:flex;gap:8px;align-items:start;padding:8px}.yj-page .yj-workspace-options small{display:block;overflow-wrap:anywhere}
@media(max-width:700px){.yj-page .yj-task-workspaces{grid-template-columns:1fr}}
    .yj-page{height:100%;box-sizing:border-box;overflow:auto;padding:24px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);font-size:13px;line-height:1.6}
    .yj-page *{box-sizing:border-box}.yj-page h1:where(:not(.yj-assistant-conversation *)),.yj-page h2:where(:not(.yj-assistant-conversation *)),.yj-page h3:where(:not(.yj-assistant-conversation *)){font-weight:500;margin:0}.yj-page h1:where(:not(.yj-assistant-conversation *)){font-size:22px}.yj-page h2:where(:not(.yj-assistant-conversation *)){font-size:16px}.yj-page h3:where(:not(.yj-assistant-conversation *)){font-size:14px}
    .yj-header,.yj-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.yj-header{justify-content:space-between;margin-bottom:20px}.yj-muted{color:var(--dsw-alias-label-secondary);margin:6px 0 12px}
    .yj-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:12px}
    .yj-page button:where(:not(.yj-assistant-conversation *)),.yj-page input:where(:not(.yj-assistant-conversation *)),.yj-page select:where(:not(.yj-assistant-conversation *)),.yj-page textarea:where(:not(.yj-assistant-conversation *)){font:inherit;color:inherit;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:8px 12px;max-width:100%}
    .yj-page button:where(:not(.yj-assistant-conversation *)){cursor:pointer;font-weight:500}.yj-page button:where(:not(.yj-assistant-conversation *)):hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.yj-page button:where(:not(.yj-assistant-conversation *)):disabled{opacity:.55;cursor:not-allowed}
    .yj-page button:where(:not(.yj-assistant-conversation *))[aria-selected=true],.yj-page .yj-selected{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
    .yj-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.yj-page label:where(:not(.yj-assistant-conversation *)){display:flex;gap:6px;flex-direction:column;min-width:0}.yj-page label:where(:not(.yj-assistant-conversation *)).yj-check{flex-direction:row;align-items:center}
    .yj-page input:where(:not(.yj-assistant-conversation *))[type=checkbox]{width:16px;height:16px}.yj-page input:where(:not(.yj-assistant-conversation *)):not([type=checkbox]),.yj-page select:where(:not(.yj-assistant-conversation *)){width:100%}.yj-field{flex:1;min-width:200px}.yj-section{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;margin:16px 0}
    .yj-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}.yj-card{display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px}.yj-card p{flex:1;margin:0;color:var(--dsw-alias-label-secondary)}
    .yj-split{display:grid;grid-template-columns:minmax(200px,1fr) minmax(280px,2fr);gap:16px}.yj-list{display:flex;flex-direction:column;gap:8px}.yj-note{text-align:left;overflow-wrap:anywhere}.yj-note small{display:block;color:var(--dsw-alias-label-secondary);font-weight:400}.yj-page textarea:where(:not(.yj-assistant-conversation *)){width:100%;min-height:320px;resize:vertical;font-family:ui-monospace,monospace;margin:8px 0;white-space:pre-wrap}.yj-page pre:where(:not(.yj-assistant-conversation *)){white-space:pre-wrap;overflow-wrap:anywhere}
    .yj-notice{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;margin:12px 0;overflow-wrap:anywhere}.yj-error{color:var(--dsw-alias-state-error-primary)}.yj-page a{color:var(--dsw-alias-state-business-primary)}
    .yj-note-row{display:flex;gap:8px;align-items:center}.yj-note-row .yj-note{flex:1;min-width:0}.yj-reader{overflow-wrap:anywhere;min-height:220px;padding:12px 0}.yj-reader button{padding:0;border:0;background:transparent;color:var(--dsw-alias-state-business-primary)}.yj-graph{width:100%;height:440px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}.yj-graph line{stroke:var(--dsw-alias-border-l2);stroke-width:1.5}.yj-graph circle{fill:var(--dsw-alias-brand-primary);cursor:pointer}.yj-graph text{fill:var(--dsw-alias-label-primary);font-size:13px;pointer-events:none}.yj-graph [role=button]:focus circle{stroke:var(--dsw-alias-label-primary);stroke-width:3}.yj-location{border-left:3px solid var(--dsw-alias-brand-primary);padding:12px;background:var(--dsw-alias-bg-layer-2)}
    .yj-reader :is(h1,h2,h3,h4,h5,h6){margin:16px 0 8px;font-weight:500}.yj-reader :is(ul,ol){padding-left:24px}.yj-reader ul{list-style:disc}.yj-reader ol{list-style:decimal}.yj-reader strong,.yj-reader th{font-weight:500}.yj-reader pre,.yj-reader blockquote{padding:12px;background:var(--dsw-alias-bg-layer-2)}.yj-reader blockquote{border-left:3px solid var(--dsw-alias-border-l2);margin:12px 0}.yj-table{overflow:auto;max-width:100%}.yj-reader table{border-collapse:collapse;width:100%}.yj-reader th,.yj-reader td{border:1px solid var(--dsw-alias-border-l2);padding:6px 10px;text-align:left}.yj-graph-frame{overflow:auto;max-height:440px}.yj-graph{display:block}.yj-graph [role=button]{pointer-events:bounding-box;cursor:pointer}

    .yj-busy{display:flex;justify-content:center;align-items:center;gap:12px;min-height:44px}.yj-spinner{height:16px;width:16px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:yj-spin 1s linear infinite}.yj-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);max-width:min(560px,90vw);padding:12px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);z-index:1000;display:flex;gap:12px;align-items:center;font-size:13px}.yj-toast button{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 8px}
    @keyframes yj-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.yj-spinner{animation:none}}@media(max-width:720px){.yj-page{padding:16px}.yj-split{grid-template-columns:1fr}.yj-field{min-width:100%}}html[data-platform=darwin] .yj-page{padding-top:calc(var(--dsh-frame-top-clearance,0px) + 24px)}

    .yj-page{display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:24px 28px;background:var(--dsw-alias-bg-layer-1)}
    .yj-page>.yj-header{flex:none;margin-bottom:8px}.yj-page>.yj-header h1{letter-spacing:-.5px}.yj-page>.yj-header .yj-muted{margin:2px 0 0}
    .yj-tabs{flex:none;margin:12px 0 18px;gap:4px;padding:4px;width:max-content;max-width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
    .yj-tabs button{border:0;background:transparent;padding:7px 16px;color:var(--dsw-alias-label-secondary);border-radius:8px}.yj-tabs button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px var(--dsw-alias-border-l1)}
    .yj-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,350px);gap:20px;min-height:0;flex:1}.yj-workspace-float,.yj-workspace-bubble{grid-template-columns:minmax(0,1fr)}
    .yj-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.yj-view{overflow:auto;min-width:0;min-height:0;padding:2px}.yj-team-heading{display:flex;justify-content:space-between;align-items:start;gap:16px;margin:8px 0 24px}.yj-team-heading h2{font-size:22px;line-height:1.4;letter-spacing:-.4px}.yj-team-heading p{margin:6px 0}.yj-compact-settings{max-width:100%;flex-shrink:0}.yj-compact-settings>summary{cursor:pointer;color:var(--dsw-alias-label-secondary);padding:6px 10px}.yj-compact-settings[open]{width:min(420px,100%)}
    .yj-tabs button[data-tab]::before{content:'';display:inline-block;width:15px;height:15px;margin-right:6px;vertical-align:-3px;background:currentColor;-webkit-mask:var(--yj-tab-icon) center/contain no-repeat;mask:var(--yj-tab-icon) center/contain no-repeat}.yj-tabs button[data-tab=experts]{--yj-tab-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'1.8'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M8%2011a3%203%200%201%200%200-6%203%203%200%200%200%200%206zM16%2011a3%203%200%201%200%200-6M2%2020c0-3%203-5%206-5s6%202%206%205M16%2015c3%200%206%202%206%205'%2F%3E%3C%2Fsvg%3E")}.yj-tabs button[data-tab=aiWeb]{--yj-tab-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'1.8'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M12%203a9%209%200%201%200%200%2018%209%209%200%200%200%200-18zM3%2012h18M12%203c2.5%203%202.5%2015%200%2018M12%203c-2.5%203-2.5%2015%200%2018'%2F%3E%3C%2Fsvg%3E")}.yj-tabs button[data-tab=knowledge]{--yj-tab-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'1.8'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M4%205a2%202%200%200%201%202-2h12v16H6a2%202%200%200%200-2%202zM4%2019V5M8%207h6'%2F%3E%3C%2Fsvg%3E")}.yj-tabs button[data-tab=skills]{--yj-tab-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'1.8'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M12%203l2.4%206.6L21%2012l-6.6%202.4L12%2021l-2.4-6.6L3%2012l6.6-2.4z'%2F%3E%3C%2Fsvg%3E")}.yj-tabs button[data-tab=schedule]{--yj-tab-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'1.8'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M12%203a9%209%200%201%200%200%2018%209%209%200%200%200%200-18zM12%207v5l3%202'%2F%3E%3C%2Fsvg%3E")}.yj-tabs button[data-tab=toolbox]{--yj-tab-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'1.8'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M3%208h18v11H3zM8%208V5h8v3M3%2013h18'%2F%3E%3C%2Fsvg%3E")}.yj-tabs button[data-tab=news]{--yj-tab-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'1.8'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M5%204h11l3%203v13H5zM8%209h8M8%2013h8M8%2017h5'%2F%3E%3C%2Fsvg%3E")}.yj-tabs button[data-tab=models]{--yj-tab-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'1.8'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M12%203l8%204.5v9L12%2021l-8-4.5v-9zM12%2012l8-4.5M12%2012v9M12%2012L4%207.5'%2F%3E%3C%2Fsvg%3E")}
    .yj-avatar-picker{display:grid;grid-template-columns:64px 1fr;gap:16px;align-items:start;margin:18px 0 6px;padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-2)}.yj-avatar-side{display:grid;gap:14px;min-width:0}.yj-avatar-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.yj-avatar-actions>button,.yj-avatar-upload{height:34px;box-sizing:border-box;display:inline-flex;align-items:center;padding:0 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);cursor:pointer;font-size:13px;margin:0!important;position:relative;overflow:hidden}.yj-avatar-upload input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;font-size:0}.yj-avatar-presets{display:flex;flex-wrap:wrap;gap:10px}.yj-avatar-preset{padding:0!important;width:42px;height:42px;border-radius:50%;overflow:hidden;border:2px solid transparent!important;background:none!important;cursor:pointer}.yj-avatar-preset[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary)!important}.yj-avatar-preset img{width:100%;height:100%;display:block;object-fit:cover}.yj-avatar-letter{display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:500;flex:none}
    .yj-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,215px),1fr));gap:16px}.yj-card{border:1px solid var(--dsw-alias-border-l1);border-radius:20px;padding:22px;gap:14px;background:var(--dsw-alias-bg-layer-2);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;position:relative;min-height:240px}.yj-card:hover{transform:translateY(-2px);border-color:var(--dsw-alias-border-l3);box-shadow:0 8px 24px var(--dsw-alias-border-l1)}.yj-card h2{font-size:16px}.yj-card p{font-size:13px;line-height:1.65}.yj-card-top{display:flex;align-items:start;justify-content:space-between;gap:12px}.yj-avatar{flex:none;border-radius:30%;object-fit:cover;display:block}.yj-card small{font-size:11px}.yj-page .yj-card-start{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);text-align:center;align-self:stretch;border-radius:10px}.yj-add-card{justify-content:center;align-items:center;border-style:dashed;background:transparent;cursor:pointer;text-align:center}.yj-add-card p{flex:0}.yj-add-mark{font-size:32px;color:var(--dsw-alias-label-secondary);line-height:1;width:56px;height:56px;border:1px dashed var(--dsw-alias-border-l3);border-radius:18px;display:grid;place-items:center}.yj-card-menu{position:relative}.yj-card-menu summary{list-style:none;cursor:pointer;font-size:18px;line-height:24px;color:var(--dsw-alias-label-secondary)}.yj-card-menu[open]{border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:6px}.yj-card-menu button{display:block;width:100%;border:0;white-space:nowrap;padding:5px 8px}
    .yj-knowledge{height:100%;min-height:0;display:flex;flex-direction:column;gap:8px}.yj-knowledge>.yj-row{flex:none}.yj-knowledge .yj-field{min-width:120px}.yj-knowledge-split{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:0;flex:1;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;overflow:hidden}.yj-note-tree{padding:12px 8px;min-height:0;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}.yj-directory .yj-directory{padding-left:12px}.yj-page .yj-folder{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;padding:7px;text-align:left;font-weight:500;white-space:nowrap}.yj-note-row{gap:4px}.yj-page .yj-note-tree .yj-note{border:0;background:transparent;padding:6px 8px;border-radius:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:12px}.yj-page .yj-note-tree .yj-note:hover,.yj-page .yj-note-tree .yj-selected{background:var(--dsw-alias-interactive-bg-hover)}.yj-note-tree input[type=checkbox]{width:12px;height:12px;flex:none}.yj-note-canvas{overflow:auto;min-width:0;min-height:0;padding:20px 24px;background:var(--dsw-alias-bg-layer-1)}.yj-note-canvas .yj-reader{max-width:800px;margin:auto;padding-top:16px}.yj-note-canvas>.yj-section{margin:0;border:0;padding:0}.yj-note-canvas label:first-child input{font-size:12px;color:var(--dsw-alias-label-secondary);border:0;background:var(--dsw-alias-bg-layer-2);padding:5px 8px}.yj-note-actions,.yj-backlinks{margin-top:16px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px}.yj-page summary{cursor:pointer}.yj-library-tools{flex:none;padding:6px 8px}.yj-library-status{font-size:11px;color:var(--dsw-alias-label-secondary);flex:none;margin-bottom:8px}.yj-graph-frame{max-height:none}.yj-graph{height:100%;min-height:380px;border:0;background:var(--dsw-alias-bg-layer-1)}
    .yj-assistant{border:1px solid var(--dsw-alias-border-l1);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--dsw-alias-bg-layer-2);box-shadow:0 4px 18px var(--dsw-alias-border-l1);transition:box-shadow .18s ease}.yj-assistant[hidden]{display:none}.yj-assistant-header{display:flex;align-items:center;gap:10px;padding:18px 16px 10px}.yj-assistant-header h2{font-size:15px}.yj-assistant-header small{display:block;font-size:11px;color:var(--dsw-alias-label-secondary)}.yj-assistant-tools{padding:0 12px 10px;gap:4px}.yj-page .yj-assistant-tools button{border:0;background:transparent;font-size:11px;padding:3px 6px}.yj-assistant-context{padding:8px 14px;border-top:1px solid var(--dsw-alias-border-l1);border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;flex:none;max-height:40%;overflow:auto}.yj-assistant-context ul{margin:8px 0;padding-left:16px}.yj-assistant-context li{overflow-wrap:anywhere}.yj-assistant-context textarea{min-height:64px;height:72px;margin:6px 0;font-family:inherit}.yj-assistant-context button{font-size:11px;padding:4px 7px}.yj-assistant-welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:28px;flex:1;text-align:center}.yj-assistant-welcome p{font-size:12px}.yj-page .yj-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-label-primary)}.yj-page .yj-primary:hover:not(:disabled){opacity:.85;background:var(--dsw-alias-label-primary)}.yj-assistant-conversation{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;position:relative}.yj-assistant-float{position:fixed;bottom:24px;right:24px;width:min(460px,calc(100vw - 32px));height:min(760px,calc(100dvh - 80px));z-index:100;resize:both;max-width:calc(100vw - 32px);max-height:calc(100dvh - 80px)}.yj-page .yj-assistant-bubble{position:absolute;right:28px;bottom:28px;z-index:90;touch-action:none;user-select:none;cursor:grab;border-radius:24px;padding:12px 18px;box-shadow:0 6px 20px var(--dsw-alias-border-l3);background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-1)}
    .yj-editor{position:fixed;inset:12px 12px 12px auto;margin:0;width:min(560px,calc(100vw - 24px));height:calc(100dvh - 24px);max-height:none;max-width:none;border:1px solid var(--dsw-alias-border-l2);border-radius:20px;padding:22px;z-index:1100;box-shadow:0 12px 40px var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}.yj-editor:not([open]){display:none}.yj-editor::backdrop{background:color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent);backdrop-filter:blur(3px)}.yj-editor-body{flex:1;overflow:auto;min-height:0;padding:0 4px}.yj-editor-body>label{margin:16px 0}.yj-editor-body textarea{min-height:190px}.yj-editor footer{justify-content:flex-end;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l1)}.yj-choice{padding:8px 0;align-items:start!important}.yj-choice small{display:block;color:var(--dsw-alias-label-secondary);line-height:1.5}.yj-editor input[type=file]{font-size:11px}
    .yj-picker-trigger{border:0;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-sm,6px);font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;white-space:nowrap;max-width:240px}.yj-picker-trigger:hover,.yj-picker-trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.yj-picker-popover{position:fixed;inset:auto;margin:0;width:min(328px,calc(100vw - 24px));max-height:min(420px,calc(100dvh - 32px));overflow:auto;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:10px;box-shadow:0 8px 24px var(--dsw-alias-border-l3);font:inherit;font-size:13px}.yj-picker-popover input{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:8px 10px;margin-bottom:8px}.yj-picker-options button{display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:9px;background:transparent;color:inherit;text-align:left;padding:8px;cursor:pointer;font:inherit}.yj-picker-options button:hover,.yj-picker-options button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover)}.yj-picker-options strong{font-weight:500;display:block}.yj-picker-options small{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;margin-top:2px}.yj-picker-popover :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
    .yj-page button:where(:not(.yj-assistant-conversation *)){transition:background .12s ease,transform .12s ease}.yj-page button:where(:not(.yj-assistant-conversation *)):active:not(:disabled){transform:scale(.98)}.yj-page>.yj-notice{flex:none;max-height:120px;overflow:auto;margin:4px 0}.yj-busy{min-height:30px;flex:none}.yj-split{min-height:0}.yj-split>.yj-list{max-height:65vh;overflow:auto}.yj-split>div:last-child{min-width:0;overflow:auto}.yj-page pre:where(:not(.yj-assistant-conversation *)){font-size:12px}
    @media(max-width:1100px){.yj-workspace{grid-template-columns:minmax(0,1fr) 300px;gap:12px}.yj-workspace-float,.yj-workspace-bubble{grid-template-columns:minmax(0,1fr)}.yj-knowledge-split{grid-template-columns:165px minmax(0,1fr)}.yj-note-canvas{padding:16px}.yj-page{padding:18px}.yj-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,195px),1fr))}}
    @media(max-width:850px){.yj-workspace{grid-template-columns:minmax(0,1fr)}.yj-assistant-dock{position:absolute;right:16px;bottom:16px;top:150px;width:min(350px,calc(100vw - 40px));z-index:50}.yj-team-heading{flex-wrap:wrap}.yj-tabs{width:100%;justify-content:space-between}.yj-tabs button{padding:7px 10px}.yj-page .yj-field{min-width:0}.yj-note-canvas{padding:12px}}
    @media(max-width:520px){.yj-page{padding:12px}.yj-tabs button{font-size:12px;padding:6px}.yj-knowledge-split{grid-template-columns:125px minmax(0,1fr)}.yj-note-tree{padding:8px 4px}.yj-assistant-dock{left:12px;right:12px;width:auto;top:120px}.yj-note-canvas{padding:10px}.yj-grid{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){.yj-page *,.yj-picker-trigger{transition:none!important;animation:none!important}.yj-card:hover,.yj-page button:where(:not(.yj-assistant-conversation *)):active:not(:disabled){transform:none}}html[data-platform=darwin] .yj-editor{top:calc(var(--dsh-frame-top-clearance,0px) + 12px);height:calc(100dvh - var(--dsh-frame-top-clearance,0px) - 24px)}

    .yj-page:not(.yj-editor){position:relative}.yj-page{font:var(--dsw-font-xs-13);font-family:var(--dsw-font-family);padding:24px 28px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 98%,var(--dsw-alias-label-primary) 2%)}
    .yj-page>.yj-header h1{font-size:20px;line-height:28px;display:flex;align-items:center;gap:8px}.yj-logo{flex:none;--yj-logo-deep:#163e86;--yj-logo-sky:#3e9bd6}@supports (color:light-dark(#000,#fff)){.yj-logo{--yj-logo-deep:light-dark(#163e86,#eaf2fb);--yj-logo-sky:light-dark(#3e9bd6,#63bdf0)}}.yj-page>.yj-header .yj-muted{font-size:12px;line-height:20px}.yj-header>button{border:0;background:transparent}.yj-tabs{background:var(--dsw-alias-interactive-bg-hover);border:0;margin:10px 0 16px;padding:3px;border-radius:10px}.yj-tabs button{font-size:13px;line-height:20px;padding:6px 14px}.yj-tabs button[aria-pressed=true]{box-shadow:0 1px 4px var(--dsw-alias-border-l2)}
    .yj-team-heading{margin:2px 0 16px;align-items:center}.yj-team-heading h2{font-size:19px;line-height:28px}.yj-team-heading p{font-size:12px;line-height:20px;margin:3px 0}.yj-compact-settings summary{font-size:12px;padding:4px 8px}.yj-workspace{gap:18px;grid-template-columns:minmax(0,1fr) 320px}.yj-workspace-float,.yj-workspace-bubble{grid-template-columns:minmax(0,1fr)}
    .yj-grid{gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,210px),1fr))}.yj-card{min-height:184px;padding:18px;gap:12px;border-radius:16px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 2px 8px var(--dsw-alias-border-l1)}.yj-card-top{align-items:center;gap:10px}.yj-card-identity{flex:1;min-width:0}.yj-card h2{font-size:15px;line-height:22px}.yj-card small{font-size:11px;line-height:18px}.yj-card p{min-height:40px;line-height:20px;font-size:12px;color:var(--dsw-alias-label-secondary)}.yj-page .yj-card-start{border:0;min-height:30px;padding:5px 10px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-size:12px}.yj-page .yj-add-card{border:1px dashed var(--dsw-alias-border-l3);background:transparent;box-shadow:none;gap:10px;min-height:184px}.yj-add-mark{width:38px;height:38px;border:0;font-size:28px;background:var(--dsw-alias-interactive-bg-hover);border-radius:12px}.yj-add-card p{min-height:0}
    .yj-page .yj-icon-button,.yj-page .yj-menu-trigger{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;background:transparent;padding:6px;border-radius:7px;color:var(--dsw-alias-label-secondary);min-height:28px}.yj-glyph{display:inline-block;vertical-align:middle;flex:none}.yj-action-menu{display:inline-flex;flex:none}.yj-menu-surface{position:fixed;inset:auto;margin:0;width:max-content;min-width:150px;max-width:min(360px,calc(100vw - 24px));max-height:min(440px,calc(100dvh - 32px));overflow:auto;padding:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:var(--dsw-elevation-prominent);font:var(--dsw-font-xs-13)}.yj-page .yj-menu-surface button{width:100%;text-align:left;border:0;background:transparent;padding:7px 10px;border-radius:6px}.yj-page .yj-menu-surface button:hover{background:var(--dsw-alias-interactive-bg-hover)}.yj-menu-surface details{padding:6px 10px}.yj-menu-surface details summary{padding:3px 0}.yj-menu-surface p{max-width:300px;overflow-wrap:anywhere;font-size:12px}.yj-menu-surface .yj-row{max-width:300px}.yj-menu-surface input{margin-top:6px}
    .yj-knowledge{gap:10px}.yj-knowledge-toolbar{display:flex;align-items:center;gap:6px;flex:none;min-height:36px}.yj-page .yj-search{display:flex;flex-direction:row;align-items:center;gap:8px;flex:1;min-width:80px;padding:0 11px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:9px;height:34px;color:var(--dsw-alias-label-secondary)}.yj-page .yj-search input{width:100%;border:0;outline:none;padding:6px 0;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;min-width:0}.yj-search:focus-within{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}.yj-page .yj-ghost{border:0;background:transparent;padding:6px 9px;font-size:12px;white-space:nowrap;color:var(--dsw-alias-label-secondary)}.yj-knowledge-split{border-radius:14px;grid-template-columns:195px minmax(0,1fr);background:var(--dsw-alias-bg-layer-1)}.yj-note-tree{padding:10px 7px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 97%,var(--dsw-alias-label-primary) 3%)}.yj-page .yj-folder{border:0;border-radius:6px;background:transparent;font-size:12px;line-height:20px;padding:5px 6px;gap:6px;color:var(--dsw-alias-label-secondary);font-weight:400}.yj-page .yj-folder:hover{background:var(--dsw-alias-interactive-bg-hover)}.yj-folder-chevron{display:flex;transition:transform .15s ease}.yj-folder-chevron.yj-expanded{transform:rotate(90deg)}.yj-note-row{min-height:29px}.yj-page .yj-note-tree .yj-note{display:flex;align-items:center;gap:7px;padding:4px 6px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}.yj-page .yj-note-tree .yj-selected{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.yj-note-tree input[type=checkbox]{appearance:auto;opacity:0;transition:opacity .12s}.yj-note-row:hover input,.yj-note-row:focus-within input,.yj-note-tree input:checked{opacity:1}.yj-note-tree .yj-row button{font-size:11px;border:0;background:transparent;padding:3px 5px}.yj-note-canvas{padding:16px 22px}.yj-note-toolbar{display:flex;align-items:start;gap:10px;margin-bottom:16px}.yj-note-path{flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary)}.yj-note-path>summary{list-style:none;display:flex;gap:6px;align-items:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:28px}.yj-note-path[open]>label{padding-top:8px}.yj-note-toolbar .yj-row{gap:2px;flex-wrap:nowrap}.yj-note-toolbar .yj-row button{border:0;background:transparent;padding:4px 8px;font-size:11px}.yj-reader{line-height:1.8}.yj-reader h1{font-size:23px}.yj-reader h2{font-size:18px}.yj-reader h3{font-size:15px}.yj-reader button{font:inherit;border:0!important;background:transparent!important;padding:0!important;color:var(--dsw-alias-state-business-primary)!important}.yj-backlinks,.yj-note-actions{border:0;margin-top:10px;padding-top:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
    .yj-assistant{border-radius:16px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 3px 16px var(--dsw-alias-border-l1)}.yj-assistant-header{padding:14px 14px 8px}.yj-assistant-header small{line-height:18px}.yj-assistant-tools{padding:0 10px 8px}.yj-assistant-context{padding:8px 12px;font-size:11px}.yj-assistant-context .yj-row{gap:3px}.yj-assistant-context button{border:0;background:var(--dsw-alias-interactive-bg-hover);padding:4px 6px}.yj-assistant-context .yj-muted{font-size:11px;line-height:18px;margin:8px 0 0}.yj-assistant-welcome{justify-content:flex-start;padding:64px 28px 24px;gap:12px}.yj-assistant-welcome h3{font-size:17px}.yj-assistant-welcome p{max-width:235px;line-height:22px;margin:0}.yj-assistant-welcome .yj-primary{margin-top:12px;border-radius:9px;padding:8px 16px;font-size:12px}.yj-assistant-welcome .yj-avatar{width:60px;height:60px}.yj-assistant-float{width:min(440px,calc(100vw - 32px))}
    @media(max-width:1100px){.yj-workspace{grid-template-columns:minmax(0,1fr) 290px;gap:12px}.yj-workspace-float,.yj-workspace-bubble{grid-template-columns:minmax(0,1fr)}.yj-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,195px),1fr))}.yj-knowledge-split{grid-template-columns:155px minmax(0,1fr)}.yj-knowledge-toolbar{flex-wrap:wrap}.yj-search{flex-basis:180px}.yj-note-canvas{padding:14px}}
    @media(max-width:850px){.yj-workspace{grid-template-columns:minmax(0,1fr)}.yj-knowledge-toolbar{gap:3px}.yj-knowledge-toolbar .yj-search{min-width:140px}.yj-note-toolbar{flex-wrap:wrap}.yj-assistant-welcome{padding-top:40px}}
    @media(max-width:520px){.yj-page{padding:12px}.yj-knowledge-split{grid-template-columns:125px minmax(0,1fr)}.yj-note-tree{padding:8px 3px}.yj-page .yj-folder{font-size:11px;gap:3px}.yj-note-canvas{padding:10px}.yj-grid{grid-template-columns:1fr}.yj-note-toolbar .yj-row button{padding:4px 6px}}
    .yj-assistant-chat{display:flex;flex-direction:column;flex:1 0 auto;min-height:0}.yj-assistant-float{resize:none}.yj-assistant-float .yj-assistant-header{cursor:move;touch-action:none;user-select:none}.yj-page .yj-assistant-minimize{margin-left:auto;flex:none;width:30px;height:30px;padding:0;border:0;background:transparent;font-size:0;border-radius:8px}.yj-assistant-minimize::before{content:'−';font-size:20px;line-height:1}.yj-resize{position:absolute;z-index:110;touch-action:none}.yj-resize-n,.yj-resize-s{height:8px;left:10px;right:10px;cursor:ns-resize}.yj-resize-n{top:0}.yj-resize-s{bottom:0}.yj-resize-e,.yj-resize-w{width:8px;top:10px;bottom:10px;cursor:ew-resize}.yj-resize-e{right:0}.yj-resize-w{left:0}.yj-resize-ne,.yj-resize-se,.yj-resize-sw,.yj-resize-nw{width:14px;height:14px}.yj-resize-ne{top:0;right:0;cursor:nesw-resize}.yj-resize-se{bottom:0;right:0;cursor:nwse-resize}.yj-resize-sw{bottom:0;left:0;cursor:nesw-resize}.yj-resize-nw{top:0;left:0;cursor:nwse-resize}
    .yj-assistant-float{max-width:none;max-height:none}.yj-resize:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.yj-skill-library>.yj-split{min-height:0}.yj-skill-library .yj-list{max-height:65vh;overflow:auto}.yj-skill-library pre{max-height:58vh;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px;background:var(--dsw-alias-bg-layer-2)}
    .yj-workspace-dock{grid-template-columns:minmax(0,1fr) clamp(440px,34vw,520px)}@media(max-width:1100px){.yj-workspace-dock{grid-template-columns:minmax(0,1fr) min(440px,45vw)}}@media(max-width:850px){.yj-workspace-dock{grid-template-columns:minmax(0,1fr)}.yj-assistant-dock{left:auto;right:16px;width:min(480px,calc(100% - 32px))}}@media(max-width:520px){.yj-assistant-dock{left:12px;right:12px;width:auto}}
    .yj-note-canvas.yj-graph-mode{padding:0;overflow:hidden;display:flex}.yj-graph-workspace{position:relative;display:flex;flex:1;min-width:0;min-height:0}.yj-graph-empty{display:flex;flex:1;align-items:center;justify-content:center}.yj-graph-controls{position:absolute;left:10px;bottom:10px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 20px);flex-wrap:wrap;padding:4px 6px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 6px var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}.yj-page .yj-graph-controls button{padding:4px 6px;border:0;background:transparent;font-size:11px}.yj-graph-missing{position:absolute;left:12px;top:12px;max-width:min(420px,calc(100% - 24px));max-height:50%;overflow:auto;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
    .yj-knowledge-split{grid-template-columns:var(--yj-directory-width,195px) 8px minmax(0,1fr)}.yj-note-tree{min-width:0;border-right:0}.yj-directory-separator{cursor:col-resize;touch-action:none;background:var(--dsw-alias-bg-layer-2);position:relative}.yj-directory-separator:before{content:'';position:absolute;left:3px;top:0;bottom:0;width:2px;background:var(--dsw-alias-border-l1)}.yj-directory-separator:hover:before,.yj-directory-separator:focus-visible:before{background:var(--dsw-alias-state-business-primary)}.yj-directory-separator:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.yj-tree-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-folder>svg,.yj-folder-chevron,.yj-note>svg{flex-shrink:0}.yj-note-tree .yj-note{flex:1}.yj-note-row{min-width:0}
    .yj-tabs{width:100%;box-sizing:border-box;flex-wrap:nowrap;overflow-x:auto}.yj-tabs>button{flex:none}.yj-tabs>.yj-world-tab{margin-inline-start:auto}.yj-tabs>button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.yj-world{background:var(--dsw-alias-bg-layer-1);border-radius:16px;padding:16px;min-height:100%;box-sizing:border-box}.yj-world .yj-world-card{min-height:0;padding:16px;gap:8px;border-radius:14px;background:var(--dsw-alias-bg-layer-1)}.yj-world .yj-world-card h3{margin:0;line-height:1.4}.yj-world .yj-world-card p{margin:0;min-height:0;flex:none;line-height:1.5}.yj-world .yj-world-card .yj-choice{display:flex;flex-direction:row;align-items:center;gap:8px;line-height:1.5}.yj-world .yj-world-card input[type=checkbox]{flex:none;width:16px;height:16px;margin:0}.yj-world .yj-world-result{scroll-margin-block:16px;outline-offset:4px}.yj-world .yj-world-result:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary)}.yj-world-timeline{display:grid;gap:12px;border-left:2px solid var(--dsw-alias-border-l2);padding-left:16px}.yj-world-metrics{display:grid;grid-template-columns:minmax(140px,1fr) minmax(100px,2fr);gap:8px}.yj-world-metrics dd{margin:0;overflow-wrap:anywhere}.yj-world table{border-collapse:collapse;min-width:520px;width:100%}.yj-world th,.yj-world td{padding:8px;border:1px solid var(--dsw-alias-border-l1);text-align:left;vertical-align:top;font-weight:400}.yj-world th{font-weight:500}.yj-news .yj-choice{display:flex;gap:8px;overflow-wrap:anywhere}.yj-news .yj-section{min-width:0}.yj-news fieldset{margin-inline:0}.yj-news .yj-field{margin-block:10px}@media(max-width:520px){.yj-world{padding:10px}.yj-world-metrics{grid-template-columns:minmax(100px,1fr) minmax(80px,1fr)}}

    .yj-schedules{height:100%;min-height:360px;display:flex;flex-direction:column}.yj-task-split{display:grid;grid-template-columns:minmax(210px,270px) minmax(0,1fr);flex:1;min-height:0;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;overflow:hidden}.yj-task-list{padding:12px 8px;background:var(--dsw-alias-bg-layer-2);border-right:1px solid var(--dsw-alias-border-l1);overflow:auto}.yj-task-list>.yj-row{justify-content:space-between;padding:0 6px 12px}.yj-task-list h2{font-size:15px}.yj-task-list h3{font-size:13px;margin:0}.yj-task-template{display:grid;gap:6px;padding:12px 8px}.yj-task-template small,.yj-task-row small{color:var(--dsw-alias-label-secondary);font-size:11px}.yj-task-row{display:flex;align-items:center;border-radius:9px;margin:4px 0;min-width:0}.yj-task-row.yj-selected{background:var(--dsw-alias-interactive-bg-hover)}.yj-page .yj-task-select{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1;text-align:left;border:0;background:transparent;padding:10px 8px}.yj-task-select span,.yj-task-select small{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-task-main{padding:24px;min-width:0;overflow:auto}.yj-task-prompt{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}.yj-task-detail>details{margin-top:24px}.yj-task-editor{max-width:680px;margin:auto}.yj-task-editor>.yj-field{margin:14px 0}.yj-task-editor h2{margin-bottom:20px}.yj-task-empty{min-height:300px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px;color:var(--dsw-alias-label-secondary)}.yj-task-empty h2{font-size:16px}.yj-news-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}.yj-news-settings{max-width:800px;margin:auto}@media(max-width:700px){.yj-task-split{grid-template-columns:1fr}.yj-task-list{max-height:220px;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1)}.yj-task-main{padding:16px}}
    .yj-modal.yj-page[open]{position:fixed;inset:24px;margin:auto;width:min(820px,calc(100vw - 32px));height:fit-content;max-height:calc(100dvh - 48px);display:flex;overflow:auto;padding:24px;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 12px 40px var(--dsw-alias-border-l3)}
    .yj-modal:not([open]){display:none}.yj-modal>.yj-header{flex:none}.yj-task-time>.yj-field{min-width:0}.yj-workspace-options{min-width:250px;max-width:min(480px,calc(100vw - 48px))}
    .yj-busy{position:fixed;top:calc(var(--dsh-frame-top-clearance,0px) + 76px);left:50%;transform:translateX(-50%);z-index:95;min-height:0;padding:6px 8px 6px 14px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);box-shadow:0 6px 20px var(--dsw-alias-border-l2);animation:yj-busy-in .2s ease-out .8s both}@keyframes yj-busy-in{from{opacity:0;visibility:hidden;transform:translate(-50%,-6px)}to{opacity:1;visibility:visible;transform:translateX(-50%)}}
    .yj-page button:where(:not(.yj-assistant-conversation *)):disabled{transition:opacity .15s ease .5s}.yj-assistant-bubble:active{cursor:grabbing}
    .yj-skill-library{display:flex;flex-direction:column;gap:18px}.yj-skill-library>.yj-row:first-child h2{margin-right:6px}.yj-skill-library .yj-split>.yj-list{gap:10px;padding:2px}
    .yj-shelf{margin:0 0 36px}.yj-shelf-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}.yj-shelf-eyebrow{display:flex;align-items:center;gap:6px;margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary)}.yj-shelf-head h3{margin:0 0 3px;font-size:18px;font-weight:600;letter-spacing:.01em}.yj-shelf-head small{font-size:12px}.yj-shelf-head .yj-row{gap:8px}.yj-shelf-grid{display:grid;gap:16px}.yj-shelf-books{grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;padding:0 10px 10px 0}.yj-shelf-news{grid-template-columns:repeat(4,minmax(0,1fr))}.yj-tile{--yj-accent:var(--dsw-alias-brand-primary);position:relative;display:flex;flex-direction:column;gap:12px;min-width:0;box-sizing:border-box;padding:18px 20px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;outline:none;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;animation:yj-tile-in .32s ease both}.yj-tile:hover,.yj-tile:focus-visible{transform:translateY(-3px);border-color:color-mix(in srgb,var(--yj-accent) 40%,var(--dsw-alias-border-l1));box-shadow:0 18px 34px -22px color-mix(in srgb,var(--yj-accent) 60%,transparent)}.yj-tile:focus-visible{outline:2px solid color-mix(in srgb,var(--yj-accent) 60%,transparent);outline-offset:3px}.yj-tile-top{display:flex;align-items:center;gap:8px;min-height:26px;min-width:0}.yj-tile-icon{flex:none;display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;color:var(--yj-accent);background:color-mix(in srgb,var(--yj-accent) 12%,transparent)}.yj-tile-kicker{font-size:12px;font-weight:600;color:var(--yj-accent);white-space:nowrap}.yj-tile-badge{font-size:11px;line-height:18px;padding:0 8px;border-radius:999px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);white-space:nowrap}.yj-tile-num{margin-left:auto;font:600 22px/1 var(--dsw-font-family-mono,ui-monospace,monospace);letter-spacing:.02em;color:color-mix(in srgb,var(--yj-accent) 28%,transparent)}.yj-tile-title{margin:0;font-size:15.5px;font-weight:600;line-height:1.65;letter-spacing:.01em;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.yj-tile-text{margin:0;font-size:13px;line-height:1.8;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.yj-tile-note{margin:0;font-size:12px;color:var(--yj-accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.yj-tile-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:12px;border-top:1px dashed var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}.yj-tile-source{display:flex;align-items:center;gap:7px;min-width:0}.yj-tile-source>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-tile-mono{flex:none;display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:700;line-height:1;color:#fff;background:var(--yj-mono,var(--yj-accent))}.yj-tile-go{flex:none;color:var(--yj-accent);opacity:0;transform:translateX(-4px);transition:opacity .2s,transform .2s;white-space:nowrap}.yj-tile:hover .yj-tile-go,.yj-tile:focus-visible .yj-tile-go{opacity:1;transform:none}.yj-news-tile{min-height:172px}.yj-book-tile{min-height:232px;padding:22px 24px 16px 28px;box-shadow:5px 5px 0 -1px var(--dsw-alias-bg-layer-1),5px 5px 0 0 var(--dsw-alias-border-l1),10px 10px 0 -1px var(--dsw-alias-bg-layer-1),10px 10px 0 0 color-mix(in srgb,var(--dsw-alias-border-l1) 55%,transparent)}.yj-book-tile:hover,.yj-book-tile:focus-visible{box-shadow:5px 5px 0 -1px var(--dsw-alias-bg-layer-1),5px 5px 0 0 var(--dsw-alias-border-l1),10px 10px 0 -1px var(--dsw-alias-bg-layer-1),10px 10px 0 0 color-mix(in srgb,var(--dsw-alias-border-l1) 55%,transparent),0 22px 38px -24px color-mix(in srgb,var(--yj-accent) 65%,transparent)}.yj-book-tile::before{content:'';position:absolute;left:0;top:0;bottom:0;width:6px;border-radius:15px 0 0 15px;background:linear-gradient(180deg,var(--yj-accent),color-mix(in srgb,var(--yj-accent) 45%,transparent))}.yj-book-tile .yj-tile-title{font-size:17px;-webkit-line-clamp:2}@keyframes yj-tile-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.yj-page .yj-brief-more{display:flex;align-items:center;gap:8px;margin:16px auto 0;padding:5px 16px;border-radius:999px;border-color:var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}.yj-brief-chevron{width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform .2s}.yj-brief-more[aria-expanded=true] .yj-brief-chevron{transform:translateY(1px) rotate(225deg)}.yj-brief-flag{font-size:11px;line-height:18px;padding:0 8px;border-radius:999px;color:#b45309;border:1px solid color-mix(in srgb,#f59e0b 55%,transparent);white-space:nowrap}.yj-brief-flag-media{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l2)}.yj-brief-detail{min-height:0;overflow:auto;padding-right:6px;font-size:14px;line-height:1.85}.yj-brief-meta{margin:0 0 16px}.yj-brief-meta .yj-tile-top{flex-wrap:wrap}.yj-brief-lead{margin:0 0 8px;padding:14px 18px;border-radius:12px;font-size:15px;line-height:1.9;background:color-mix(in srgb,var(--yj-accent,#6366f1) 7%,transparent);border-left:3px solid var(--yj-accent,#6366f1)}.yj-brief-detail h3{margin:18px 0 4px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary)}.yj-brief-detail section p{margin:0}.yj-brief-sources{margin-top:22px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l2);font-size:13px;overflow-wrap:anywhere}.yj-brief-sources h3{margin-top:10px}.yj-brief-sources ul{margin:2px 0 0;padding-left:18px}.yj-brief-sources strong{margin-right:10px;font-weight:600}.yj-brief-sources a{color:var(--yj-accent,#6366f1);text-decoration:none}.yj-brief-sources a:hover{text-decoration:underline}.yj-book{--yj-paper:var(--dsw-alias-bg-layer-1);--yj-ink:var(--dsw-alias-label-primary);--yj-ink-2:var(--dsw-alias-label-secondary);--yj-rule:var(--dsw-alias-border-l2);--yj-sheet:var(--dsw-alias-bg-layer-2);--yj-gutter:rgb(0 0 0 / .12)}@supports (color:light-dark(#000,#fff)){.yj-book{--yj-paper:light-dark(#fbf8f1,#1f1d1a);--yj-ink:light-dark(#2f2a23,#e9e4da);--yj-ink-2:light-dark(#857a6a,#a49d90);--yj-rule:light-dark(#e8e0d0,#35322c);--yj-sheet:light-dark(#f2ecdf,#292723);--yj-gutter:light-dark(rgb(110 85 45 / .16),rgb(0 0 0 / .55))}}.yj-modal.yj-book[open]{width:min(1240px,calc(100vw - 48px));height:min(900px,calc(100dvh - 48px));max-height:none;padding:0;overflow:hidden;border-color:var(--yj-rule);background:var(--yj-paper);color:var(--yj-ink);box-shadow:0 30px 80px -30px rgb(0 0 0 / .5)}html[data-platform=darwin] .yj-modal.yj-book[open]{height:min(900px,calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px))}.yj-book-bar{flex:none;display:grid;grid-template-columns:1fr minmax(0,auto) 1fr;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--yj-rule)}.yj-book-bar>:first-child{justify-self:start}.yj-book-title{margin:0;min-width:0;font-size:13px;letter-spacing:.04em;color:var(--yj-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.yj-book-tools{justify-self:end;display:flex;align-items:center;gap:2px}.yj-page .yj-book-tools .yj-icon-button{min-width:32px;font-size:13px;color:var(--yj-ink-2)}.yj-book .yj-menu-trigger{color:var(--yj-ink-2)}.yj-menu-surface .yj-toc-item{display:flex;justify-content:space-between;align-items:baseline;gap:18px;max-width:340px}.yj-menu-surface .yj-toc-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-menu-surface .yj-toc-item small{flex:none;color:var(--dsw-alias-label-secondary)}.yj-menu-surface .yj-toc-sub{padding-left:22px;color:var(--dsw-alias-label-secondary)}.yj-menu-surface .yj-toc-current{color:var(--yj-accent);font-weight:600}.yj-book-stage{position:relative;flex:1;min-height:0;display:flex;padding:40px 76px 10px}.yj-book-viewport{position:relative;flex:1;min-width:0;overflow:hidden}.yj-book-flow{position:absolute;inset:0;column-count:1;column-gap:56px;column-fill:auto;font-family:"Noto Serif SC","Source Han Serif SC","Songti SC",var(--dsw-font-family);font-size:var(--yj-book-size,16.5px);line-height:1.95;letter-spacing:.01em;color:var(--yj-ink);text-align:justify;overflow-wrap:break-word}.yj-book-spread::before{content:'';position:absolute;top:28px;bottom:6px;left:50%;width:84px;transform:translateX(-50%);pointer-events:none;background:linear-gradient(90deg,transparent,var(--yj-gutter) 47%,var(--yj-gutter) 53%,transparent);opacity:.6}.yj-book-spread::after{content:'';position:absolute;top:28px;bottom:6px;left:50%;width:1px;pointer-events:none;background:var(--yj-rule)}.yj-page .yj-book-edge{position:absolute;top:0;bottom:0;z-index:1;width:76px;display:grid;place-items:center;padding:0;border:0;border-radius:0;background:transparent;color:var(--yj-ink-2);opacity:0;transition:opacity .2s,background .2s}.yj-book-prev{left:0}.yj-book-next{right:0}.yj-book-stage:hover .yj-book-edge:not(:disabled),.yj-page .yj-book-edge:focus-visible{opacity:.7}.yj-page .yj-book-prev:hover:not(:disabled){opacity:1;background:linear-gradient(90deg,var(--yj-sheet),transparent)}.yj-page .yj-book-next:hover:not(:disabled){opacity:1;background:linear-gradient(270deg,var(--yj-sheet),transparent)}.yj-page .yj-book-edge:disabled{opacity:0;cursor:default}.yj-book-foot{flex:none;display:grid;grid-template-columns:1fr minmax(0,2fr) 1fr;align-items:center;gap:16px;padding:4px 76px 16px;font-size:12px;color:var(--yj-ink-2)}.yj-book-folio{font-family:var(--dsw-font-family-mono,ui-monospace,monospace);letter-spacing:.06em}.yj-book-folio:last-child{text-align:right}.yj-book-progress{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}.yj-book-progress>span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-book-track{width:min(260px,100%);height:3px;border-radius:3px;background:var(--yj-rule);overflow:hidden}.yj-book-track i{display:block;height:100%;border-radius:3px;background:var(--yj-accent);transition:width .35s ease}.yj-book-flow p{margin:0 0 .95em;orphans:2;widows:2}.yj-book-flow h1,.yj-book-flow h2,.yj-book-flow h3,.yj-book-flow h4{break-after:avoid;text-align:left;line-height:1.45;color:var(--yj-ink)}.yj-book-flow h1{margin:0 0 .7em;font-size:1.6em;font-weight:700}.yj-book-flow h2{margin:1.5em 0 .7em;font-size:1.3em;font-weight:600}.yj-book-flow h3{margin:1.3em 0 .5em;font-size:1.1em;font-weight:600}.yj-book-flow h4{margin:1.1em 0 .4em;font-size:1em}.yj-book-chapter>h2:first-child{break-before:column;margin-top:0;padding-top:.2em}.yj-book-chapter>h2:first-child::before{content:'';display:block;width:28px;height:3px;margin-bottom:.9em;border-radius:3px;background:var(--yj-accent)}.yj-book-flow ul,.yj-book-flow ol{margin:0 0 1em;padding-left:1.4em}.yj-book-flow li{margin:.2em 0}.yj-book-flow pre{break-inside:avoid;margin:0 0 1em;padding:.8em 1em;border-radius:10px;background:var(--yj-sheet);white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8em;line-height:1.7;text-align:left}.yj-book-flow code{font-family:var(--dsw-font-family-mono,ui-monospace,monospace);font-size:.88em}.yj-book-flow :not(pre)>code{padding:.1em .35em;border-radius:5px;background:var(--yj-sheet)}.yj-book-flow blockquote{margin:0 0 1em;padding:.1em 0 .1em 1em;border-left:3px solid color-mix(in srgb,var(--yj-accent) 60%,transparent);color:var(--yj-ink-2)}.yj-book-flow hr{margin:1.4em 0;border:0;text-align:center}.yj-book-flow hr::after{content:'· · ·';letter-spacing:.5em;color:var(--yj-ink-2)}.yj-book-flow img{max-width:100%;max-height:55vh;break-inside:avoid}.yj-book-flow .yj-table{break-inside:avoid;overflow-x:auto;margin:0 0 1em;font-size:.82em}.yj-book-flow table{width:100%;border-collapse:collapse}.yj-book-flow th,.yj-book-flow td{padding:.35em .6em;border:1px solid var(--yj-rule);text-align:left}.yj-book-flow a{color:var(--yj-accent)}.yj-book-flow [lang=en]{text-align:left;hyphens:auto}.yj-book-cover{min-height:calc(100% - 2px);break-after:column;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;padding:0 6%;text-align:left}.yj-book-kicker{display:flex;align-items:center;gap:8px;margin:0 0 1.2em!important;font-size:.8em;font-weight:600;letter-spacing:.14em;color:var(--yj-accent)}.yj-book-cover h1{margin:0 0 .6em;font-size:2em;line-height:1.35;letter-spacing:.02em}.yj-book-lede{margin:0 0 1.4em!important;font-size:1.05em;color:var(--yj-ink-2)}.yj-book-rule{width:44px;height:3px;margin:0 0 1.4em;border-radius:3px;background:var(--yj-accent)}.yj-book-cover h4{margin:0 0 .5em;font-size:.8em;font-weight:600;letter-spacing:.14em;color:var(--yj-ink-2)}.yj-book-points{list-style:none;margin:0 0 1.4em;padding:0;counter-reset:yj-point}.yj-book-points li{counter-increment:yj-point;display:flex;gap:.9em;margin:.45em 0}.yj-book-points li::before{content:counter(yj-point,decimal-leading-zero);flex:none;font:600 .78em/2.5 var(--dsw-font-family-mono,ui-monospace,monospace);color:var(--yj-accent)}.yj-book-example{margin:0 0 1.4em;padding:.9em 1.1em;border-radius:12px;background:var(--yj-sheet)}.yj-book-example strong{display:block;margin-bottom:.3em;font-size:.78em;letter-spacing:.12em;color:var(--yj-accent)}.yj-book-example p{margin:0!important}.yj-book-meta{margin:0!important;font-size:.78em;color:var(--yj-ink-2)}.yj-book-colophon{margin-top:2.4em;padding-top:1.2em;border-top:1px solid var(--yj-rule);font-size:.85em;color:var(--yj-ink-2);overflow-wrap:anywhere}.yj-book-end{margin:0 0 1.2em!important;text-align:center;letter-spacing:.3em}@media(max-width:1100px){.yj-shelf-books,.yj-shelf-news{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.yj-shelf-books,.yj-shelf-news{grid-template-columns:1fr}.yj-book-stage{padding:24px 40px 8px}.yj-page .yj-book-edge{width:40px}.yj-book-foot{padding:4px 40px 12px}}@media(prefers-reduced-motion:reduce){.yj-tile,.yj-brief-chevron,.yj-tile-go,.yj-book-track i,.yj-page .yj-book-edge{animation:none;transition:none}}
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
    .yj-page .yj-draft-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#b45309;white-space:nowrap}.yj-page .yj-draft-chip button{border:0;background:transparent;padding:2px 6px;font-size:12px;text-decoration:underline}
    .yj-page .yj-assistant-bubble{position:fixed}
    .yj-page .yj-news-settings{max-width:none;margin:0;display:flex;flex-direction:column;gap:16px}.yj-news-toolbar{display:flex;gap:10px;flex-wrap:wrap}.yj-news-field h2{font-size:15px;margin:0}.yj-news-field .yj-error{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .yj-page label.yj-choice{flex-direction:row;align-items:flex-start;gap:8px;overflow-wrap:anywhere}.yj-page label.yj-choice input[type=checkbox]{flex:none;margin-top:3px}
    .yj-news-form{border:0;padding:0;margin:0;min-width:0;display:flex;flex-direction:column;gap:10px}.yj-news-history{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px}
    .yj-schedule-off{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:12px 16px;margin:0 0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}.yj-schedule-off p{margin:2px 0 0}.yj-page .yj-schedule-off .yj-primary{margin:0}
    .yj-ai-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:2px 0 16px}.yj-page .yj-ai-head h2{margin:0 auto 0 0;font-size:19px;line-height:28px}.yj-page .yj-ai-head select{width:auto;min-width:160px}
    .yj-page label.yj-ai-search{flex-direction:row;align-items:center;gap:10px;flex:0 1 420px;min-width:240px;white-space:nowrap}.yj-ai-search>span{color:var(--dsw-alias-label-secondary)}.yj-page .yj-ai-search input{flex:1;min-width:0;width:auto}
    .yj-ai-status{display:inline-flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px}.yj-page .yj-ai-status button{border:0;background:transparent;padding:2px 6px;text-decoration:underline}
    .yj-ai-card .yj-card-top .yj-avatar{width:44px;height:44px;border-radius:12px;flex:none}.yj-ai-card .yj-card-identity h3{margin:0;font-size:15px;font-weight:600}.yj-ai-card .yj-help{margin:0}
  `;

  function createApi(ctx, t) {
    const presetText = ctx.locale.bind('settings.agentPreset');
    // 官方未命名模式复用宿主词典，自定义名称始终按原文展示。
    const presetNameKeys = { standard: 'presetStandardName', ptc: 'presetPtcName', minimal: 'presetMinimalName', cordis: 'presetCordisName' };
    const failure = (message, code) => Object.assign(new Error(message), { code });
    /** 宿主是否带鲸翼适配（整套替换，不会只装一部分）；没有时各功能走 DSH 原生能力降级。 */
    const hostAdapted = () => typeof ctx.get('sidebarRight')?.focusPresentation === 'function';
    // Host 返回的失败经报错指南翻译成员工能处理的提示；原始信息只进开发者控制台。
    const hostFailure = (message, code) => {
      globalThis.console?.warn?.('[鲸翼]', code ?? '', message);
      return Object.assign(new Error(featureViews.explainError(code, message).text), { code, detail: message });
    };
    const unwrap = (reply) => {
      if (!reply || typeof reply.ok !== 'boolean') throw failure(t('badReply'), 'bad_reply');
      if (!reply.ok) throw Object.assign(hostFailure(reply.error?.message || t('requestFailed'), reply.error?.code), reply.error?.details?.sessionId ? { sessionId: reply.error.details.sessionId } : {});
      return reply.value;
    };
    async function request(sessionId, payload, name = 'whalewing') {
      if (!sessionId) throw failure(t('noSession'), 'session_required');
      const execution = unwrap(await ctx.remote.commands.execute(sessionId, `/${name} ${JSON.stringify(payload)}`, []));
      if (!execution) throw failure(t('unknownCommand'), 'command_missing');
      if (execution.result?.kind !== 'success') {
        const text = execution.result?.text || t('requestFailed');
        let detail;
        try { detail = JSON.parse(text); } catch { /* 非 JSON 错误保留宿主原文。 */ }
        throw hostFailure(detail?.message || text, detail?.code);
      }
      let value;
      try { value = JSON.parse(execution.result.text); } catch { throw failure(t('badReply'), 'bad_reply'); }
      if (value && value.ok === false) throw hostFailure(value.message || value.error?.message || t('requestFailed'), value.code || value.error?.code);
      return value;
    }
    const knowledge = async (input, signal) => {
      const value = unwrap(await ctx.remote.whalewingKnowledge.manage(input, signal));
      if (input.action === 'graph') {
        const parsed = makeContract(z).graphResult.safeParse(value);
        if (!parsed.success) throw failure(t('graphVersionMismatch'), 'graph_contract_mismatch');
        return parsed.data;
      }
      return value;
    };
    const skillRequest = async (input, signal) => unwrap(await ctx.remote.whalewingKnowledge.manageSkills(input, signal));
    const automationSchema = makeAutomationContract(z);
    const newsSchema = makeNewsContract(z), worldSchema = makeModelWorldContract(z);
    const aiWebSchema = featureViews.aiWebContract(z);
    const aiWebRequest = async (input, signal) => aiWebSchema.result.parse(unwrap(await ctx.remote.whalewingKnowledge.manageAiWeb(aiWebSchema.input.parse(input), signal)));
    const newsRequest = async (input, signal) => {
      const parsed = newsSchema.manage.parse(input);
      signal?.throwIfAborted();
      const result = newsSchema.result.safeParse(unwrap(await ctx.remote.whalewingKnowledge.manageNews(parsed, signal)));
      if (!result.success) throw failure(t('badReply'), 'bad_reply');
      const value = result.data;
      const expected = { home: 'learning', list: 'fields', save: 'field', remove: 'field', reports: 'reports', report: 'report' }[input.action];
      if (!Object.hasOwn(value, expected) || value.field && value.field.id !== input.id || value.report && (value.report.fieldId !== input.fieldId || value.report.cutoff !== input.cutoff) || input.action === 'reports' && value.reports?.some(report => report.fieldId !== input.fieldId)) throw failure(t('badReply'), 'bad_reply');
      return value;
    };
    const worldRequest = async (input, signal) => {
      const parsed = worldSchema.input.parse(input);
      signal?.throwIfAborted();
      const result = worldSchema.result.safeParse(unwrap(await ctx.remote.whalewingKnowledge.manageModelWorld(parsed, signal)));
      if (!result.success || result.data.action !== input.action) throw failure(t('badReply'), 'bad_reply');
      const value = result.data;
      if (value.available && (input.action === 'detail' && value.model.id !== input.id || input.action === 'compare' && (value.models.length !== input.ids.length || new Set(value.models.map(model => model.id)).size !== input.ids.length || value.models.some(model => !input.ids.includes(model.id))))) throw failure(t('badReply'), 'bad_reply');
      if (Object.hasOwn(value, 'offset') && (value.offset !== (input.offset ?? 0) || input.limit !== undefined && value.limit !== input.limit)) throw failure(t('badReply'), 'bad_reply');
      return value;
    };
    const automationRequest = async (input, signal) => {
      const parsed = automationSchema.input.parse(input);
      signal?.throwIfAborted();
      const result = automationSchema.result.safeParse(unwrap(await ctx.remote.whalewingKnowledge.manageAutomation(parsed, signal)));
      if (!result.success) throw failure(t('badReply'), 'bad_reply');
      const value = result.data;
      if (value.code) throw hostFailure(value.message || value.code, value.code);
      return value;
    };
    const automationCatalog = async signal => {
      const value = await automationRequest({ action: 'catalog' }, signal);
      if (typeof value.available !== 'boolean' || !['tasks', 'legacyTasks', 'issues'].every(key => Array.isArray(value[key]))) throw failure(t('badReply'), 'bad_reply');
      return value;
    };
    // 只缓存未核实创建的身份，不保存员工指令、目录或原生计划镜像。
    const automationKey = `${NS}:automation-pending:${typeof window === 'undefined' ? '' : window.location.origin}`;
    let pendingAutomation = null, automationCacheIssue = '', automationWriting = false;
    try {
      const saved = window.localStorage.getItem(automationKey);
      if (saved) pendingAutomation = z.strictObject({ sessionId: z.string().regex(/^[\w-]{1,100}$/), purpose: z.enum(['knowledge', 'custom', 'news']) }).parse(JSON.parse(saved));
    } catch { automationCacheIssue = t('taskCacheError'); }
    const cacheAutomation = value => {
      try {
        if (value) window.localStorage.setItem(automationKey, JSON.stringify(value));
        else window.localStorage.removeItem(automationKey);
      } catch { throw failure(t('taskCacheError'), 'automation_cache'); }
      pendingAutomation = value;
    };
    async function recoverAutomation(signal) {
      if (automationCacheIssue) throw failure(automationCacheIssue, 'automation_cache');
      const catalog = await automationCatalog(signal);
      if (!pendingAutomation) return { catalog, pending: null };
      const pending = pendingAutomation;
      const own = catalog.tasks.filter(task => task.sessionId === pending.sessionId);
      if (own.length > 1 || own.some(task => task.purpose !== pending.purpose)) throw failure(t('taskPendingConflict'), 'automation_identity');
      if (own.length === 1) { cacheAutomation(null); return { catalog, pending: null, recovered: own[0] }; }
      const projection = unwrap(await ctx.remote.session.projections({ sessionId: pending.sessionId }, signal));
      signal?.throwIfAborted();
      if (projection !== null && (!Object.hasOwn(projection?.values ?? {}, 'whalewingAutomation') || projection.values.whalewingAutomation !== null && projection.values.whalewingAutomation !== pending.purpose)) throw failure(t('taskPendingConflict'), 'automation_identity');
      return { catalog, pending, exists: projection !== null };
    }
    async function createAutomation({ purpose, spec, workspaceScope }, resume, signal) {
      if (automationWriting) throw failure(t('taskPendingConflict'), 'automation_busy');
      if (automationCacheIssue) throw failure(automationCacheIssue, 'automation_cache');
      // 执行目录由插件统一持有，所有定时任务在同一处运行，员工不选择、不填写。
      const { directory } = await automationRequest({ action: 'directory' }, signal);
      if (typeof directory !== 'string' || !/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/)/.test(directory)) throw failure(t('badReply'), 'bad_reply');
      const specification = purpose === 'news' ? {} : { spec, ...(workspaceScope ? { workspaceScope } : {}) };
      automationSchema.input.parse({ action: 'create', sessionId: 'validation', purpose, ...specification });
      automationWriting = true;
      try {
        if (pendingAutomation && !resume) throw failure(t('taskPendingConflict'), 'automation_pending');
        if (resume && (!pendingAutomation || pendingAutomation.purpose !== purpose)) throw failure(t('taskPendingConflict'), 'automation_pending');
        const recovered = await recoverAutomation(signal);
        if (recovered.recovered) return recovered.catalog;
        if (!recovered.catalog.available) throw failure(t('scheduleUnavailable'), 'SCHEDULE_DISABLED');
        signal?.throwIfAborted();
        if (!pendingAutomation) cacheAutomation({ sessionId: `whalewing-auto-${globalThis.crypto.randomUUID()}`, purpose });
        const { sessionId } = pendingAutomation;
        // 原生 create 按同一身份和目录校验幂等；显式恢复也不分配第二个会话。
        const created = unwrap(await ctx.remote.session.create({ sessionId, cwd: directory, agentPreset: 'standard' }));
        if (created?.sessionId !== sessionId || created.agentPreset && created.agentPreset !== 'standard') throw failure(t('badReply'), 'bad_reply');
        signal?.throwIfAborted();
        await attachExistingSession(sessionId);
        const claim = await request(sessionId, { action: 'automation_claim', purpose });
        if (claim?.action !== 'automation_claim' || claim.purpose !== purpose) throw failure(t('taskPendingConflict'), 'automation_identity');
        const projection = unwrap(await ctx.remote.session.projections({ sessionId }, signal));
        if (projection?.values?.whalewingAutomation !== purpose) throw failure(t('taskPendingConflict'), 'automation_identity');
        signal?.throwIfAborted();
        const receipt = await automationRequest({ action: 'create', sessionId, purpose, ...specification }, signal);
        const catalog = await automationCatalog(signal);
        if (!receipt.task?.id || !catalog.tasks.some(task => task.sessionId === sessionId && task.id === receipt.task.id && task.purpose === purpose)) throw failure(t('taskReadback'), 'automation_readback');
        cacheAutomation(null);
        return catalog;
      } finally { automationWriting = false; }
    }
    const resolveSkillEdit = async (entry, signal) => {
      if (entry?.origin !== 'builtin' || !entry.editId) return entry;
      const target = (await skillRequest({ action: 'read', id: entry.editId }, signal)).entry;
      if (!target) return entry;
      if (target.origin !== 'override' || target.baseId !== entry.id || target.baseHash !== entry.hash) throw failure(t('skillOverrideConflict'), 'skill_origin_conflict');
      return target;
    };
    let experts = { experts: [], deleted: [] };
    const expertListeners = new Set();
    let assistantContext = { sessionId: '', paths: [] };
    const contextListeners = new Set();
    const setAssistantContext = (sessionId, paths) => {
      if (assistantContext.sessionId === sessionId && JSON.stringify(assistantContext.paths) === JSON.stringify(paths)) return;
      assistantContext = { sessionId, paths: [...paths] };
      contextListeners.forEach(listener => listener());
    };
    const expertRequest = async (input, signal) => { signal?.throwIfAborted(); const reply = await ctx.remote.whalewingExperts.manage(input, signal); signal?.throwIfAborted(); return unwrap(reply); };
    const loadExperts = async (signal) => {
      const value = await expertRequest({ action: 'list' }, signal);
      signal?.throwIfAborted();
      experts = value;
      expertListeners.forEach(listener => listener());
      return value;
    };
    async function prepareWorkspace({ cwd = '', workspaceId = '' } = {}) {
      const path = cwd.trim();
      if (path && !/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/)/.test(path)) throw failure(t('invalidPath'), 'invalid_path');
      if (!path && workspaceId) return workspaceId;
      // 工作区注册与路径去重由宿主负责，客户端不自建目录或维护第二份映射。
      const workspace = path ? await ctx.workspaces.create({ path }) : await ctx.workspaces.initializeDefault(AbortSignal.timeout(15000));
      if (workspace === undefined && !path) return undefined;
      if (!workspace?.workspaceId) throw failure(t('badReply'), 'bad_reply');
      return workspace.workspaceId;
    }
    async function attachExistingSession(sessionId) {
      if (ctx.workspaces.list.getSnapshot().items.some((item) => item.sessionIds.includes(sessionId))) return;
      // Host 从当前会话取目录并经工作区 owner 挂接；客户端不重建身份或归一化路径。
      const attached = await request(sessionId, { action: 'workspace_attach' });
      if (attached?.sessionId !== sessionId || typeof attached.workspaceId !== 'string' || !attached.workspaceId) throw failure(t('badReply'), 'bad_reply');
    }
    async function createBoundSession(input, scope, signal) {
      signal?.throwIfAborted();
      const workspaceId = await prepareWorkspace(scope);
      signal?.throwIfAborted();
      const created = unwrap(await ctx.remote.session.create({ ...input, ...(workspaceId ? { workspaceId } : {}) }));
      signal?.throwIfAborted();
      if (!created?.sessionId) throw failure(t('badReply'), 'bad_reply');
      try {
        if (!workspaceId) await attachExistingSession(created.sessionId);
      } catch (error) { error.sessionId = created.sessionId; throw error; }
      return created;
    }
    async function createExpert(roleId, { cwd = '', workspaceId = '', mode = '' } = {}) {
      const role = (await loadExperts()).experts.find((item) => item.id === roleId);
      if (!role) throw failure(t('noRoles'), 'role_missing');
      const value = await createBoundSession(mode ? { agentPreset: mode } : {}, { cwd, workspaceId });
      if (!value?.sessionId) throw failure(t('badReply'), 'bad_reply');
      try {
        await selectExpert(value.sessionId, roleId);
      }
      catch (error) { error.sessionId = value.sessionId; throw error; }
      return value.sessionId;
    }
    async function applyExpertModel(sessionId, role, signal) {
      signal?.throwIfAborted();
      const receipt = await expertRequest({ action: 'prepare_model', sessionId, expertId: role.id, expectedRevision: role.revision }, signal);
      signal?.throwIfAborted();
      // 宿主不能只给本会话换模型时，专家跟随会话当前模型，不做切换后的核对。
      if (receipt?.applied === false) return;
      const actual = unwrap(await ctx.remote.session.projections({ sessionId }));
      signal?.throwIfAborted();
      const selected = actual?.values?.modelSelection?.next;
      if (!receipt?.selected || !selected || selected.provider !== receipt.selected.provider || selected.model !== receipt.selected.model || selected.reasoningEffort !== receipt.selected.reasoningEffort) throw failure(t('modelMissing'), 'model_readback');
    }
    let choiceState = { staged: null, sessions: {} };
    const choiceListeners = new Set();
    const preparations = new Map();
    const publishChoice = value => { choiceState = value; choiceListeners.forEach(listener => listener()); };
    const captureStagedExpert = () => {
      if (!choiceState.staged) return;
      const targets = Object.values(ctx.sessions.list.getSnapshot().byId).filter(item => item.blank === true && (item.retainedBy?.mainView || 0) > 0 && item.origin !== 'subagent');
      if (targets.length !== 1) return;
      const id = targets[0].id;
      publishChoice({ staged: null, sessions: { ...choiceState.sessions, [id]: choiceState.staged } });
      // 原生 DSH 没有“发送前准备”事件，选好的专家要立即应用，否则第一条消息不会按专家身份发出。
      if (!hostAdapted()) prepareExpert(id).catch(() => {});
    };
    ctx.effect(() => ctx.sessions.list.subscribe(captureStagedExpert), '新会话专家暂存接线');
    async function prepareNow(sessionId, signal) {
      signal.throwIfAborted();
      if (ctx.sessions.subagentAddress(sessionId)) return;
      captureStagedExpert();
      const choice = choiceState.sessions[sessionId];
      let expertId;
      let actual;
      if (choice) {
        expertId = choice.expertId;
        if (expertId && !(await loadExperts(signal)).experts.some(item => item.id === expertId)) throw failure(t('noRoles'), 'role_missing');
        signal.throwIfAborted();
        await request(sessionId, { expertId }, 'whalewing-expert');
        signal.throwIfAborted();
        actual = await workbenchProjection(sessionId);
        signal.throwIfAborted();
      } else {
        actual = await workbenchProjection(sessionId);
        signal.throwIfAborted();
        expertId = actual?.values?.whalewingExpert?.expertId;
        if (!expertId) return;
      }
      if ((actual?.values?.whalewingExpert?.expertId ?? null) !== expertId) throw failure(t('requestFailed'), 'expert_readback');
      if (expertId) {
        const role = (await loadExperts(signal)).experts.find(item => item.id === expertId);
        signal.throwIfAborted();
        if (!role) throw failure(t('noRoles'), 'role_missing');
        await applyExpertModel(sessionId, role, signal);
        signal.throwIfAborted();
      }
      if (choice && choiceState.sessions[sessionId] === choice) {
        const sessions = { ...choiceState.sessions }; delete sessions[sessionId];
        publishChoice({ ...choiceState, sessions });
      }
    }
    /** 同一会话共用准备；各调用只取消自己的等待，最后一个等待者退出才中止后续准备。 */
    async function prepareExpert(sessionId, signal) {
      signal ||= AbortSignal.timeout(15000);
      signal.throwIfAborted();
      if (ctx.sessions.subagentAddress(sessionId)) return;
      let job = preparations.get(sessionId);
      if (!job) {
        job = { controller: new AbortController(), waiters: 0, done: false };
        preparations.set(sessionId, job);
        job.promise = prepareNow(sessionId, job.controller.signal).finally(() => { job.done = true; if (preparations.get(sessionId) === job) preparations.delete(sessionId); });
        job.promise.catch(() => {});
      }
      await new Promise((resolve, reject) => {
        job.waiters++;
        let settled = false;
        const finish = (error) => {
          if (settled) return; settled = true;
          signal?.removeEventListener('abort', abort);
          job.waiters--;
          if (!job.done && job.waiters === 0) job.controller.abort();
          if (error) reject(error); else resolve();
        };
        const abort = () => finish(failure(t('expertPreparationStopped'), 'expert_prepare_cancelled'));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        job.promise.then(() => finish(), error => finish(error));
      });
      signal?.throwIfAborted();
      if (choiceState.sessions[sessionId]) await prepareExpert(sessionId, signal);
      signal?.throwIfAborted();
    }
    const selectExpert = async (sessionId, expertId, signal) => {
      signal?.throwIfAborted();
      if (sessionId && ctx.sessions.subagentAddress(sessionId)) throw failure(t('expertSubagent'), 'expert_subagent');
      if (!sessionId) {
        publishChoice({ ...choiceState, staged: { expertId, preview: true } });
        captureStagedExpert();
        return;
      }
      publishChoice({ ...choiceState, sessions: { ...choiceState.sessions, [sessionId]: { expertId } } });
      await prepareExpert(sessionId, signal);
      signal?.throwIfAborted();
    };
    ctx.effect(() => ctx.on('session/before-prompt', async ({ sessionId, signal }) => { await prepareExpert(sessionId, signal); signal.throwIfAborted(); }), '专家原生提交准备');
    ctx.effect(() => () => { for (const job of preparations.values()) job.controller.abort(); preparations.clear(); choiceListeners.clear(); }, '专家准备释放');
    const cacheKey = `${NS}:workbench:${typeof window === 'undefined' ? '' : window.location.origin}`;
    let workbenchId;
    let pendingWorkbenchId;
    let workbenchPromise;
    try { workbenchId = window.localStorage.getItem(cacheKey) || undefined; } catch { /* 禁用浏览器存储时，同一插件实例仍复用内存身份。 */ }
    const cacheWorkbench = (id) => {
      workbenchId = id;
      try { window.localStorage.setItem(cacheKey, id); } catch { /* 缓存非真源，写失败不改变 Host 已接受结果。 */ }
    };
    const workbenchProjection = async (id) => unwrap(await ctx.remote.session.projections({ sessionId: id }));
    const confirmWorkbench = async (id, signal) => {
      signal?.throwIfAborted();
      const confirmed = await request(id, { action: 'workbench_confirm' });
      signal?.throwIfAborted();
      if (!z.strictObject({ action: z.literal('workbench_confirm'), persisted: z.literal(true) }).safeParse(confirmed).success) throw failure(t('badReply'), 'bad_reply');
      if ((await workbenchProjection(id))?.values?.whalewingWorkbench !== true) throw Object.assign(failure(t('workbenchUnclaimed') + ' (' + id + ')', 'workbench_identity'), { workbenchId: id });
      signal?.throwIfAborted();
      pendingWorkbenchId = undefined;
    };
    function ensureWorkbench(signal) {
      if (workbenchPromise) return workbenchPromise;
      workbenchPromise = (async () => {
        signal?.throwIfAborted();
        if (workbenchId) {
          const existing = await workbenchProjection(workbenchId);
          signal?.throwIfAborted();
          if (existing?.values?.whalewingWorkbench === true) {
            if (pendingWorkbenchId === workbenchId) await confirmWorkbench(workbenchId, signal);
            signal?.throwIfAborted();
            await attachExistingSession(workbenchId);
            signal?.throwIfAborted();
            return workbenchId;
          }
          if (existing !== null && pendingWorkbenchId !== workbenchId) throw Object.assign(failure(`${t('workbenchUnclaimed')} (${workbenchId})`, 'workbench_identity'), { workbenchId });
          if (existing === null) pendingWorkbenchId = workbenchId;
        } else {
          // 先记住请求身份，创建回执丢失后仍能用原生幂等创建核对同一个会话。
          pendingWorkbenchId = `whalewing-workbench-${globalThis.crypto.randomUUID()}`;
          cacheWorkbench(pendingWorkbenchId);
        }
        const id = workbenchId;
        const created = await createBoundSession({ sessionId: id, agentPreset: 'standard' }, undefined, signal);
        signal?.throwIfAborted();
        if (created?.sessionId !== id) throw failure(t('badReply'), 'bad_reply');
        unwrap(await ctx.remote.session.rename({ sessionId: id, title: t('workbenchTitle') }));
        signal?.throwIfAborted();
        await request(id, { action: 'workbench_claim' });
        signal?.throwIfAborted();
        // 只确认认领事件持久化；知识初始化由真正的知识入口负责。
        await confirmWorkbench(id, signal);
        return id;
      })().finally(() => { workbenchPromise = undefined; });
      return workbenchPromise;
    }
    let assistantId;
    let assistantReady = false;
    let assistantPromise;
    function ensureAssistant() {
      if (assistantReady) return Promise.resolve(assistantId);
      if (assistantPromise) return assistantPromise;
      assistantId ||= `whalewing-assistant-${globalThis.crypto.randomUUID()}`;
      assistantPromise = (async () => {
        const role = (await loadExperts()).experts.find(item => item.id === 'manager');
        if (!role) throw failure(t('assistantMissing'), 'role_missing');
        const exists = await workbenchProjection(assistantId);
        if (exists === null) await createBoundSession({ sessionId: assistantId, agentPreset: 'standard' });
        else await attachExistingSession(assistantId);
        await selectExpert(assistantId, 'manager');
        assistantReady = true;
        return assistantId;
      })().catch(error => { error.sessionId = assistantId; throw error; }).finally(() => { assistantPromise = undefined; });
      return assistantPromise;
    }
    const inputViews = new Map();
    const inputViewListeners = new Set();
    function mountAssistantInput(sessionId) {
      const token = {};
      inputViews.set(sessionId, token);
      for (const listener of inputViewListeners) listener();
      return () => { if (inputViews.get(sessionId) === token) inputViews.delete(sessionId); };
    }
    async function proposeDiscussion(reference, proposal, signal) {
      const waiting = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
      waiting.throwIfAborted();
      await new Promise((resolve, reject) => {
        const aborted = () => { cleanup(); reject(waiting.reason); };
        let ready = false;
        const check = () => { if (ready && inputViews.has(reference.sessionId)) { cleanup(); resolve(); } };
        const cleanup = () => { waiting.removeEventListener('abort', aborted); inputViewListeners.delete(check); };
        waiting.addEventListener('abort', aborted, { once: true });
        inputViewListeners.add(check);
        reference.ready.then(() => { ready = true; check(); }, error => { cleanup(); reject(error); });
      });
      waiting.throwIfAborted();
      const owner = ctx.get('uiSession');
      if (!owner) throw failure(t('draftUnavailable'), 'input_unavailable');
      const binding = owner.bindingSource(reference).getSnapshot();
      const input = binding.hooks.input;
      const actions = binding.props.inputActions;
      if (binding.key !== reference.sessionId || !input || !actions) throw failure(t('draftUnavailable'), 'input_unavailable');
      const draft = input.getSnapshot();
      if (draft.draft.includes(proposal)) return;
      const span = actions.captureInsertion();
      waiting.throwIfAborted();
      // 折叠到当前选区末端，只插入提议，不重建正文或破坏已有资料 chip。
      if (!actions.insertText(draft.draft ? `\n\n${proposal}\n\n` : proposal, { ...span, start: span.end }) || !input.getSnapshot().draft.includes(proposal)) throw failure(t('draftUnavailable'), 'draft_insert_rejected');
    }
    // AI 入口 → 浏览器标签的对应关系，按工作台会话分开；只是个人偏好，存不下也不影响打开。
    const aiTabs = {
      key: 'whalewing.aiWebTabs.v1',
      read() { try { const value = JSON.parse(window.localStorage.getItem(this.key)); return value && typeof value === 'object' ? value : {}; } catch { return {}; } },
      remember(sessionId, entryId, tabId, openIds) {
        const all = this.read();
        const live = new Set(openIds);
        const current = Object.fromEntries(Object.entries(all[sessionId] || {}).filter(([, id]) => live.has(id)));
        current[entryId] = tabId;
        try { window.localStorage.setItem(this.key, JSON.stringify({ ...all, [sessionId]: current })); } catch { /* 记不住时下次照常新开。 */ }
      },
    };
    function requireBrowser() {
      const sidebar = ctx.get('sidebarRight'), types = ctx.get('sidebarRightTabs');
      if (typeof sidebar?.openTab !== 'function' || typeof types?.get !== 'function' || !types.get('browser')) throw new Error(t('browserMissing'));
      return sidebar;
    }
    async function openBrowser(url, sessionId, key) {
      const sidebar = requireBrowser();
      if (!sessionId || sidebar.mounted?.getSnapshot() !== sessionId) throw new Error(t('browserMissing'));
      const tabs = () => typeof sidebar.tabsIn === 'function' ? sidebar.tabsIn(sessionId).filter(tab => tab?.kind === 'browser') : [];
      const known = key && aiTabs.read()[sessionId]?.[key];
      // 同一个 AI 只占一个网页标签：已经开着就切回去，员工在里面的对话和登录都还在。
      if (known && typeof sidebar.focus === 'function' && tabs().some(tab => tab.id === known)) { sidebar.focus(known); return; }
      const before = new Set(tabs().map(tab => tab.id));
      sidebar.openTab('browser', { params: { url } });
      if (!key) return;
      // 记下新开的标签；标签被员工关掉后下次再新开。
      for (let attempt = 0; attempt < 30; attempt++) {
        const added = tabs().find(tab => !before.has(tab.id));
        if (added) { aiTabs.remember(sessionId, key, added.id, tabs().map(tab => tab.id)); return; }
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    }
    // 未适配的 DSH 不能把浏览器铺满工作台：改为打开专用的「AI 网页」会话，在它右侧的内置浏览器里打开。
    const aiWebKey = `${NS}:aiweb:${typeof window === 'undefined' ? '' : window.location.origin}`;
    async function ensureAiWebSession(signal) {
      let id;
      try { id = window.localStorage.getItem(aiWebKey) || undefined; } catch { /* 记不住时本次新建。 */ }
      if (id && (await workbenchProjection(id)) !== null) { await attachExistingSession(id); return id; }
      id = `whalewing-aiweb-${globalThis.crypto.randomUUID()}`;
      try { window.localStorage.setItem(aiWebKey, id); } catch { /* 同上。 */ }
      const created = await createBoundSession({ sessionId: id, agentPreset: 'standard' }, undefined, signal);
      if (created?.sessionId !== id) throw failure(t('badReply'), 'bad_reply');
      unwrap(await ctx.remote.session.rename({ sessionId: id, title: t('aiWebSessionTitle') }));
      return id;
    }
    // 工作台页面卸载后仍要让员工看到结果，由 registerUi 接上右上角提示。
    let notifyGlobal = () => {};
    async function openAiInConversation(url, key, signal) {
      requireBrowser();
      const id = await ensureAiWebSession(signal);
      signal?.throwIfAborted();
      // 切到会话后工作台页面会卸载，后续步骤不再跟随页面的取消信号。
      ctx.uiWorkspace.openSession(id);
      try {
        const sidebar = requireBrowser();
        for (const deadline = Date.now() + 10000; sidebar.mounted?.getSnapshot() !== id;) {
          if (Date.now() > deadline) throw new Error(t('browserMissing'));
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        // 会话刚切到前台时右栏面板还没就绪，openTab 会报“没有挂载的会话面板”，稍等重试。
        for (const deadline = Date.now() + 10000; ;) {
          try { if (url !== undefined) await openBrowser(url, id, key); break; }
          catch (error) {
            if (!/no session surface/.test(String(error?.message)) || Date.now() > deadline) throw error;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        if (typeof sidebar.isExpanded === 'function' && !sidebar.isExpanded()) sidebar.toggleExpanded?.();
      } catch (error) { notifyGlobal(error.message, { kind: 'error' }); throw error; }
    }
    return {
      request, knowledge, skillRequest, resolveSkillEdit, proposeDiscussion, mountAssistantInput, ensureAssistant, createExpert, ensureWorkbench,
      automationRequest, automationCatalog, createAutomation, recoverAutomation, pendingAutomation: () => pendingAutomation && { ...pendingAutomation },
      newsRequest, worldRequest, aiWebRequest,
      browserMounted: () => ctx.get('sidebarRight')?.mounted?.getSnapshot(),
      browserAvailable: requireBrowser,
      focusBrowser: sessionId => {
        const sidebar = requireBrowser();
        if (typeof sidebar.focusPresentation !== 'function' || sidebar.mounted?.getSnapshot() !== sessionId) throw new Error(t('browserMissing'));
        return sidebar.focusPresentation(sessionId);
      },
      openBrowser, hostAdapted, openAiInConversation, bindNotify: fn => { notifyGlobal = fn; },
      automationCacheIssue: () => automationCacheIssue,
      openAutomation: async id => { await attachExistingSession(id); ctx.uiWorkspace.openSession(id); },
      subscribeTheme: callback => ctx.on('theme/change', callback),
      experts: () => experts, loadExperts, expertRequest,
      subscribeExperts: (listener) => { expertListeners.add(listener); return () => expertListeners.delete(listener); },
      applyExpertModel,
      assistantContext: () => assistantContext, setAssistantContext,
      subscribeContext: listener => { contextListeners.add(listener); return () => contextListeners.delete(listener); },
      insertReference: (id, span, paths) => {
        const binding = ctx.sessions.binding(id);
        if (!binding) throw failure(t('citeFailed'), 'session_unbound');
        const reference = { source: 'whalewing-knowledge', ref: JSON.stringify(paths), label: t('citeLabel', { count: paths.length }), appearance: 'file', clipboardText: paths.join('\n') };
        if (binding.ctx.bail(binding.ctx, 'slash/input-insert-reference', { reference, span }) !== true) throw failure(t('citeFailed'), 'reference_rejected');
      },
      retain: (id) => ctx.sessions.retain(id, { source: 'whalewingAssistant' }),
      presentAssistant: id => {
        const sidebar = ctx.get('sidebarRight');
        // 原生 DSH 没有嵌入会话呈现：小鲸照常对话，只是资料不在侧栏预览，不报错。
        if (typeof sidebar?.presentSession !== 'function') return null;
        return sidebar.presentSession('whalewing', id);
      },
      restartWorkbench: () => {
        if (workbenchPromise) return workbenchPromise;
        workbenchId = undefined; pendingWorkbenchId = undefined;
        try { window.localStorage.removeItem(cacheKey); } catch { /* 即使缓存不可写，本轮仍按新身份准备，不认领旧会话。 */ }
        return ensureWorkbench();
      },
      selectExpert, prepareExpert,
      choices: () => choiceState, subscribeChoices: listener => { choiceListeners.add(listener); return () => choiceListeners.delete(listener); },
      modes: async () => unwrap(await ctx.remote.agentPresets.list()).presets.map((preset) => ({ ...preset, name: preset.name === undefined && Object.hasOwn(presetNameKeys, preset.id) ? presetText(presetNameKeys[preset.id]) : preset.name ?? preset.id })),
      openPlugins: () => ctx.layout.selectPanel('plugins'),
      open: (id) => ctx.uiWorkspace.openSession(id),
      sessions: () => ctx.sessions.list.getSnapshot(),
      workspaces: () => ctx.workspaces.list.getSnapshot(),
      subscribeSessions: (fn) => ctx.sessions.list.subscribe(fn),
      subscribeWorkspaces: (fn) => ctx.workspaces.list.subscribe(fn),
    };
  }

  function Glyph({ name, size = 16 }) {
    const paths = { folder: 'M3 6h6l2 2h10v12H3zM3 6V4h6l2 2', file: 'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6', search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', more: 'M4 12h.01M12 12h.01M20 12h.01', spark: 'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z', chevron: 'M9 5l7 7-7 7', back: 'M15 5l-7 7 7 7', close: 'M6 6l12 12M18 6L6 18', list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01', clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', book: 'M12 6.5C10.5 5 8.3 4.5 4 4.5v14c4.3 0 6.5.5 8 2 1.5-1.5 3.7-2 8-2v-14c-4.3 0-6.5.5-8 2zM12 6.5v14', news: 'M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM16 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3', chip: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4', bot: 'M5 9h14v10H5zM12 5v4M9 13h.01M15 13h.01M9.5 16h5M12 3.5h.01', code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01', flask: 'M9 3h6M10 3v6l-5.5 9.5A1.6 1.6 0 0 0 5.9 21h12.2a1.6 1.6 0 0 0 1.4-2.5L14 9V3M7.5 15h9' };
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: 'yj-glyph' }, h('path', { d: paths[name] || paths.more }));
  }

  /** 低频动作借助原生 top layer，保持菜单独立于工作区滚动与裁剪。 */
  function ActionMenu({ label, children, iconOnly = false, icon = 'more' }) {
    const anchor = useRef(null);
    const surface = useRef(null);
    const [open, setOpen] = useState(false);
    useEffect(() => {
      if (!open || !surface.current) return;
      const element = surface.current;
      const place = () => { const box = anchor.current.getBoundingClientRect(); element.style.left = `${Math.max(12, Math.min(box.right - element.offsetWidth, window.innerWidth - element.offsetWidth - 12))}px`; element.style.top = `${Math.max(12, Math.min(box.bottom + 6, window.innerHeight - element.offsetHeight - 12))}px`; };
      element.showPopover(); place(); element.querySelector('button,input')?.focus();
      window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
      return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); if (element.matches(':popover-open')) element.hidePopover(); };
    }, [open]);
    return h('div', { className: 'yj-action-menu' }, h('button', { type: 'button', ref: anchor, title: label, 'aria-label': label, 'aria-expanded': open, 'aria-haspopup': 'dialog', className: iconOnly ? 'yj-icon-button' : 'yj-menu-trigger', onClick: () => setOpen(value => !value) }, h(Glyph, { name: icon }), !iconOnly && label),
      h('div', { className: 'yj-menu-surface', ref: surface, popover: 'auto', role: 'dialog', 'aria-label': label, onToggle: event => { if (event.nativeEvent.newState === 'closed') setOpen(false); }, onClick: event => { if (event.target.closest('button:not(:disabled)')) { surface.current?.hidePopover(); setOpen(false); } }, onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); surface.current.hidePopover(); setOpen(false); anchor.current.focus(); } } }, children));
  }

  /** 内置专家用原创插画头像；自定义专家未设置头像时，按名字稳定分配一个预置头像。 */
  const avatarArt = featureViews.avatars || {};
  const presetAvatars = Object.keys(avatarArt).filter(id => id.startsWith('preset-'));
  const ownAvatar = id => typeof id === 'string' && Object.hasOwn(avatarArt, id) ? avatarArt[id] : undefined;
  function Avatar({ expert, size = 44 }) {
    const fallback = presetAvatars.length ? avatarArt[presetAvatars[[...(expert?.name || '小鲸')].reduce((sum, char) => sum + char.codePointAt(0), 0) % presetAvatars.length]] : undefined;
    const source = expert?.avatar || ownAvatar(expert?.id) || fallback;
    if (source) return h('img', { className: 'yj-avatar', src: source, alt: '', width: size, height: size });
    return h('span', { className: 'yj-avatar yj-avatar-letter', style: { width: size, height: size, background: warmArt }, 'aria-hidden': true }, [...(expert?.name || '金')][0]);
  }

  /** 弹层使用浏览器 top layer，避免宿主滚动容器裁剪。 */
  function ExpertPicker({ api, sessionId, useProjection, useSessions, t }) {
    const projection = useProjection('whalewingExpert');
    const choices = useSyncExternalStore(api.subscribeChoices, api.choices, api.choices);
    const choice = sessionId ? choices.sessions[sessionId] : choices.staged;
    const selected = choice && (!sessionId || choice.preview) ? choice.expertId : projection?.expertId ?? null;
    const preset = useSessions((state) => state.byId[sessionId]?.projectionValues?.agentPreset);
    const registry = useSyncExternalStore(api.subscribeExperts, api.experts, api.experts);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const trigger = useRef(null);
    const panel = useRef(null);
    const pending = useRef(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; api.loadExperts().catch(reason => { if (mounted.current) setError(reason.message); }); return () => { mounted.current = false; }; }, []);
    const close = () => { panel.current?.hidePopover(); setOpen(false); trigger.current?.focus(); };
    useEffect(() => {
      if (!open || !panel.current) return;
      const element = panel.current;
      const place = () => {
        const rect = trigger.current.getBoundingClientRect();
        element.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 340))}px`;
        element.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - Math.min(element.offsetHeight, 420) - 12))}px`;
      };
      element.showPopover(); place(); element.querySelector('input')?.focus();
      window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
      return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); if (element.matches(':popover-open')) element.hidePopover(); };
    }, [open]);
    const roles = registry.experts;
    const historical = [...roles, ...registry.deleted].find(role => preset === `whalewing-${role.id}`);
    const current = roles.find(role => role.id === selected);
    if (historical) return h('span', { className: 'yj-expert-picker' }, t('historicalExpert', { name: historical.name }));
    const matches = roles.filter(role => `${role.name} ${role.description}`.toLowerCase().includes(query.trim().toLowerCase()));
    const change = async (id) => {
      if (pending.current) return;
      pending.current = true; setBusy(true); setError('');
      try {
        await api.selectExpert(sessionId, id || null);
        if (mounted.current) { close(); setQuery(''); }
      } catch (reason) { if (mounted.current) setError(reason.message || t('requestFailed')); }
      finally { pending.current = false; if (mounted.current) setBusy(false); }
    };
    return h('div', { className: 'yj-expert-picker' }, h('style', null, css),
      h('button', { type: 'button', ref: trigger, className: 'yj-picker-trigger', 'aria-haspopup': 'dialog', 'aria-expanded': open, onClick: () => setOpen(!open) }, current && h(Avatar, { expert: current, size: 20 }), current?.name || selected || t('expert'), h('span', { 'aria-hidden': true }, '⌄')),
      h('div', { ref: panel, popover: 'auto', className: 'yj-picker-popover', role: 'dialog', 'aria-label': t('expert'), onToggle: event => { if (event.nativeEvent.newState === 'closed') setOpen(false); }, onKeyDown: event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          const items = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
          const index = items.indexOf(document.activeElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          event.preventDefault(); items[next]?.focus();
        }
      } }, h('input', { 'aria-label': t('expertSearch'), placeholder: t('expertSearch'), value: query, onChange: event => setQuery(event.target.value) }),
      h('div', { className: 'yj-picker-options' }, h('button', { type: 'button', disabled: busy, onClick: () => change(null) }, t('noExpert')),
        ...matches.map(role => h('button', { type: 'button', key: role.id, disabled: busy, 'aria-pressed': selected === role.id, onClick: () => change(role.id) }, h(Avatar, { expert: role, size: 36 }), h('span', null, h('strong', null, role.name), h('small', null, role.description)))), !matches.length && h('p', null, t('noExpertMatch'))),
      busy && h('span', { role: 'status' }, t('loading')), error && h('p', { role: 'alert', className: 'yj-error' }, error)));
  }

  function Modal({ title, busy = false, onClose, className = '', children }) {
    const element = useRef(null);
    useEffect(() => {
      const previous = document.activeElement;
      element.current?.showModal();
      return () => { element.current?.close(); if (previous?.isConnected) previous.focus(); };
    }, []);
    return h('dialog', { ref: element, className: ['yj-modal yj-page', className].filter(Boolean).join(' '), 'aria-label': title, onCancel: event => { event.preventDefault(); if (!busy) onClose(); }, onClick: event => { if (event.target === event.currentTarget && !busy) onClose(); } },
      h('header', { className: 'yj-header' }, h('h2', null, title), h('button', { type: 'button', disabled: busy, onClick: onClose, 'aria-label': title }, '×')), children);
  }

  /** 编辑类表单统一用右侧抽屉：与“编辑专家”同一套样式，底部固定操作按钮。 */
  function Drawer({ title, busy = false, onClose, footer, children }) {
    const element = useRef(null);
    useEffect(() => {
      const previous = document.activeElement;
      element.current?.showModal();
      return () => { element.current?.close(); if (previous?.isConnected) previous.focus(); };
    }, []);
    return h('dialog', { ref: element, className: 'yj-editor yj-page', 'aria-label': title, onCancel: event => { event.preventDefault(); if (!busy) onClose(); }, onClick: event => { if (event.target === event.currentTarget && !busy) onClose(); } },
      h('header', { className: 'yj-header' }, h('h2', null, title), h('button', { type: 'button', disabled: busy, onClick: onClose, 'aria-label': title }, '×')),
      h('div', { className: 'yj-editor-body' }, children), footer && h('footer', { className: 'yj-row' }, ...footer));
  }

  /** 确认类操作统一用居中弹窗：标题、说明、右下角“取消 + 确认”，不在页面里展开、不挤动下面的内容。 */
  function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger = false, busy = false, onConfirm, onCancel }) {
    return h(Modal, { title, busy, onClose: onCancel, className: 'yj-confirm' },
      message && h('div', { className: 'yj-confirm-body' }, message),
      h('footer', { className: 'yj-dialog-actions' }, h('button', { type: 'button', disabled: busy, onClick: onCancel }, cancelLabel),
        h('button', { type: 'button', className: danger ? 'yj-danger' : 'yj-primary', disabled: busy, onClick: onConfirm }, confirmLabel)));
  }

  /** 长文按书页排版：宽屏左右对开、窄屏单页；页边、方向键或滚轮翻页，目录按标题跳页，字号三档。 */
  function BookReader({ title, accent, onClose, t, children }) {
    const dialog = useRef(null), viewport = useRef(null), flow = useRef(null);
    const [view, setView] = useState({ page: 0, pages: 1, columns: 1, spread: 1, toc: [] });
    const [size, setSize] = useState(1);
    const state = useRef({ page: 0, pages: 1, step: 1 }), wheel = useRef({ sum: 0, at: 0, last: 0 }), alive = useRef(true);
    const go = (target, smooth = true) => {
      const { pages, step } = state.current, page = Math.max(0, Math.min(pages - 1, target));
      state.current.page = page;
      viewport.current?.scrollTo({ left: page * step, behavior: smooth && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
      setView(value => value.page === page ? value : { ...value, page });
    };
    const measure = () => {
      const box = viewport.current, content = flow.current;
      if (!alive.current || !box || !content || !box.clientWidth) return;
      const width = box.clientWidth, spread = width >= 760 ? 2 : 1, gap = spread === 2 ? 96 : 56;
      content.style.columnCount = String(spread); content.style.columnGap = `${gap}px`;
      const step = width + gap, column = (width - gap * (spread - 1)) / spread;
      const columns = Math.max(1, Math.round((box.scrollWidth + gap) / (column + gap))), pages = Math.max(1, Math.ceil(columns / spread));
      const ratio = state.current.pages > 1 ? state.current.page / (state.current.pages - 1) : 0, page = Math.round(ratio * (pages - 1));
      const rendered = content.querySelectorAll('.yj-rendered h1, .yj-rendered h2').length ? '.yj-rendered h1, .yj-rendered h2' : '.yj-rendered h3';
      const toc = [...content.querySelectorAll(`[data-book-toc], ${rendered}`)].map(element => ({ label: (element.dataset.bookToc || element.textContent).trim(), page: Math.max(0, Math.min(pages - 1, Math.floor(element.offsetLeft / step))), sub: !element.hasAttribute('data-book-toc') })).filter(entry => entry.label).slice(0, 80);
      state.current = { page, pages, step };
      box.scrollTo({ left: page * step, behavior: 'auto' });
      setView({ page, pages, columns, spread, toc });
    };
    useEffect(() => {
      const previous = document.activeElement, content = flow.current;
      dialog.current?.showModal();
      measure();
      const observer = typeof ResizeObserver === 'function' && viewport.current ? new ResizeObserver(() => measure()) : null;
      observer?.observe(viewport.current);
      content?.addEventListener('load', measure, true);
      document.fonts?.ready?.then(measure);
      return () => { alive.current = false; observer?.disconnect(); content?.removeEventListener('load', measure, true); dialog.current?.close(); if (previous?.isConnected) previous.focus(); };
    }, []);
    useEffect(() => { measure(); }, [size]);
    const onKeyDown = event => {
      const key = event.key;
      if (event.target.closest?.('input, textarea, select, [popover]') || key === ' ' && event.target.closest?.('button, a')) return;
      const target = ['ArrowRight', 'PageDown', ' '].includes(key) ? state.current.page + 1 : ['ArrowLeft', 'PageUp'].includes(key) ? state.current.page - 1 : key === 'Home' ? 0 : key === 'End' ? state.current.pages - 1 : null;
      if (target === null) return;
      event.preventDefault(); go(target);
    };
    const onWheel = event => {
      if (event.target.closest?.('pre, .yj-table') && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const now = Date.now(), record = wheel.current, delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (now - record.last > 240) record.sum = 0;
      record.last = now;
      if (now - record.at < 450) return;
      record.sum += delta;
      if (Math.abs(record.sum) >= 50) { record.at = now; go(state.current.page + Math.sign(record.sum)); record.sum = 0; }
    };
    const chapter = view.toc.filter(entry => entry.page <= view.page).at(-1);
    const first = view.page * view.spread + 1, second = view.spread === 2 && first + 1 <= view.columns ? first + 1 : null;
    return h('dialog', { ref: dialog, className: 'yj-modal yj-page yj-book', 'aria-label': title, style: { '--yj-accent': accent, '--yj-book-size': ['15px', '16.5px', '18px'][size] }, onKeyDown,
      onCancel: event => { event.preventDefault(); onClose(); }, onClick: event => { if (event.target === event.currentTarget) onClose(); } },
      h('header', { className: 'yj-book-bar' },
        view.toc.length > 0 ? h(ActionMenu, { label: t('bookToc'), icon: 'list' }, ...view.toc.map((entry, index) => h('button', { type: 'button', key: index, className: `yj-toc-item${entry.sub ? ' yj-toc-sub' : ''}${entry === chapter ? ' yj-toc-current' : ''}`, onClick: () => go(entry.page) }, h('span', null, entry.label), h('small', null, entry.page * view.spread + 1)))) : h('span', null),
        h('p', { className: 'yj-book-title' }, title),
        h('div', { className: 'yj-book-tools' },
          h('button', { type: 'button', className: 'yj-icon-button', title: t('bookSmaller'), 'aria-label': t('bookSmaller'), disabled: size === 0, onClick: () => setSize(value => Math.max(0, value - 1)) }, 'A−'),
          h('button', { type: 'button', className: 'yj-icon-button', title: t('bookLarger'), 'aria-label': t('bookLarger'), disabled: size === 2, onClick: () => setSize(value => Math.min(2, value + 1)) }, 'A+'),
          h('button', { type: 'button', className: 'yj-icon-button', title: t('closePanel'), 'aria-label': t('closePanel'), onClick: onClose }, h(Glyph, { name: 'close' })))),
      h('div', { className: `yj-book-stage${view.spread === 2 ? ' yj-book-spread' : ''}`, onWheel },
        h('button', { type: 'button', className: 'yj-book-edge yj-book-prev', 'aria-label': t('bookPrev'), title: t('bookPrev'), disabled: view.page === 0, onClick: () => go(view.page - 1) }, h(Glyph, { name: 'back', size: 22 })),
        h('div', { ref: viewport, className: 'yj-book-viewport' }, h('div', { ref: flow, className: 'yj-book-flow' }, children)),
        h('button', { type: 'button', className: 'yj-book-edge yj-book-next', 'aria-label': t('bookNext'), title: t('bookNext'), disabled: view.page >= view.pages - 1, onClick: () => go(view.page + 1) }, h(Glyph, { name: 'chevron', size: 22 }))),
      h('footer', { className: 'yj-book-foot' },
        h('span', { className: 'yj-book-folio' }, first),
        h('div', { className: 'yj-book-progress' }, h('span', null, chapter?.label ?? title),
          h('div', { className: 'yj-book-track', role: 'progressbar', 'aria-label': t('bookProgress'), 'aria-valuemin': 1, 'aria-valuemax': view.pages, 'aria-valuenow': view.page + 1 }, h('i', { style: { width: `${(view.page + 1) / view.pages * 100}%` } }))),
        h('span', { className: 'yj-book-folio' }, view.spread === 2 ? second ?? '' : `/ ${view.columns}`)));
  }

  function WorkspacePicker({ items, scope = { mode: 'all', excludedWorkspaceIds: [] }, onChange, disabled, t }) {
    const checked = id => scope.mode === 'all' ? !scope.excludedWorkspaceIds.includes(id) : scope.workspaceIds.includes(id);
    const count = items.filter(item => checked(item.workspaceId)).length;
    const toggle = (id, include) => onChange(scope.mode === 'all'
      ? { mode: 'all', excludedWorkspaceIds: include ? scope.excludedWorkspaceIds.filter(value => value !== id) : [...scope.excludedWorkspaceIds, id] }
      : { mode: 'selected', workspaceIds: include ? [...scope.workspaceIds, id] : scope.workspaceIds.filter(value => value !== id) });
    return h('div', { className: 'yj-field' }, t('workspaceScope'), h(ActionMenu, { label: t('workspaceSelected', { count }) },
      h('label', { className: 'yj-choice' }, h('input', { type: 'checkbox', checked: scope.mode === 'all' && scope.excludedWorkspaceIds.length === 0, disabled, onChange: event => onChange(event.target.checked ? { mode: 'all', excludedWorkspaceIds: [] } : { mode: 'selected', workspaceIds: [] }) }), t('workspaceAll')),
      h('div', { className: 'yj-workspace-options' }, ...items.map(item => h('label', { key: item.workspaceId, className: 'yj-choice' }, h('input', { type: 'checkbox', checked: checked(item.workspaceId), disabled, onChange: event => toggle(item.workspaceId, event.target.checked) }), h('span', null, item.name || item.path, h('small', { className: 'yj-muted' }, item.name ? item.path : '')))))));
  }

  function ExpertEditor({ api, expert, onClose, t, notify }) {
    const avatarRead = useRef(null);
    const [avatarReading, setAvatarReading] = useState(false);
    useEffect(() => () => avatarRead.current?.abort(), []);
    const [draft, setDraft] = useState(() => expert ? { ...expert, skills: [...expert.skills], mcpServers: [...expert.mcpServers] } : { name: '', description: '', avatar: null, prompt: '', model: null, skills: [], mcpServers: [] });
    const [catalog, setCatalog] = useState(null);
    const [busy, setBusy] = useState(false);
    // 报错走右上角提示，不在表单底部插入一行把按钮往下挤。
    const setError = message => { if (message) notify(message, { kind: 'error' }); };
    const [recovery, setRecovery] = useState(null);
    const modal = useRef(null);
    const saving = useRef(false);
    const [initialIdentity] = useState(() => expert || { id: `custom-${globalThis.crypto.randomUUID()}`, revision: 0 });
    const committed = useRef(initialIdentity);
    const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
    useEffect(() => {
      const previous = typeof document === 'undefined' ? null : document.activeElement;
      modal.current?.showModal();
      let live = true;
      api.expertRequest({ action: 'catalog' }).then(value => { if (live) setCatalog(value); }, reason => { if (live) setError(reason.message); });
      return () => { live = false; modal.current?.close(); previous?.focus(); };
    }, []);
    const savedText = value => t(expert ? 'expertSavedNamed' : 'expertCreated', { name: value.name });
    const save = async () => {
      if (saving.current || avatarReading) return;
      if (![draft.name, draft.description, draft.prompt].every(value => value.trim())) { setError(t('requiredExpert')); return; }
      saving.current = true; setBusy(true); setError('');
      const identity = committed.current;
      const { name, description, avatar, prompt, model, skills, mcpServers } = draft;
      const fields = { name, description, avatar, prompt, model, skills, mcpServers };
      try {
        const saved = await api.expertRequest({ action: 'save', id: identity.id, expectedRevision: identity.revision, expert: fields });
        // 成功回执已经确定身份；列表失败后重试仍更新同一专家，不再创建第二位。
        committed.current = saved.expert;
        const readback = await api.loadExperts();
        if (!readback.experts.some(item => item.id === saved.expert.id && item.revision === saved.expert.revision)) throw new Error(t('badReply'));
        notify(savedText(saved.expert)); onClose();
      } catch (reason) {
        // 未知接受只按表单的固定身份读回核对；头像规范化后不一致时仍保留表单，不猜测成功。
        try {
          const actual = (await api.loadExperts()).experts.find(item => item.id === identity.id);
          const expected = makeExpertContract(z).fields.parse(fields);
          if (actual && actual.revision > identity.revision && Object.keys(expected).every(key => JSON.stringify(actual[key]) === JSON.stringify(expected[key]))) {
            committed.current = actual; notify(savedText(actual)); onClose(); return;
          }
          if (actual && actual.revision > identity.revision) setRecovery(actual);
        } catch { /* 读回失败不触发新身份或自动重试写入。 */ }
        setError(reason.message);
      }
      finally { saving.current = false; setBusy(false); }
    };
    const upload = async event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      avatarRead.current?.abort();
      const controller = new AbortController(); avatarRead.current = controller;
      setAvatarReading(true); setError('');
      try {
        const value = await featureViews.readAvatarFile(file, { signal: controller.signal });
        if (!controller.signal.aborted) update('avatar', value);
      } catch (reason) { if (!controller.signal.aborted) setError(reason.message); }
      finally { if (!controller.signal.aborted) setAvatarReading(false); }
    };
    const modelOptions = (catalog?.models || []).flatMap(group => (group.models || []).map(model => ({ ...model, provider: group.id, value: JSON.stringify({ provider: group.id, model: model.id }) })));
    const selectedModel = modelOptions.find(item => item.provider === draft.model?.provider && item.id === draft.model?.model);
    const modelValue = draft.model ? JSON.stringify({ provider: draft.model.provider, model: draft.model.model }) : '';
    const choices = (kind, title) => {
      const available = catalog?.[kind] || [];
      return h('details', { className: 'yj-section' }, h('summary', null, t(title), ` (${draft[kind].length})`), h('p', { className: 'yj-muted' }, t('catalogHelp')),
        ...[...available, ...draft[kind].filter(name => !available.some(item => item.name === name)).map(name => ({ name, missing: true }))].map(item => h('label', { className: 'yj-check yj-choice', key: item.name },
          h('input', { type: 'checkbox', checked: draft[kind].includes(item.name), disabled: busy, onChange: event => update(kind, event.target.checked ? [...draft[kind], item.name] : draft[kind].filter(name => name !== item.name)) }),
          h('span', null, item.name, h('small', null, item.missing ? t('missingBinding') : item.description || item.tools?.join(' · '))))), !available.length && h('p', { className: 'yj-muted' }, t('emptyCatalog')));
    };
    return h('dialog', { ref: modal, className: 'yj-editor yj-page', 'aria-label': t(expert ? 'editExpert' : 'addExpert'), onCancel: event => { event.preventDefault(); if (!busy) onClose(); }, onClick: event => { if (event.target === event.currentTarget && !busy) onClose(); } },
      h('header', { className: 'yj-header' }, h('h2', null, t(expert ? 'editExpert' : 'addExpert')), h('button', { type: 'button', disabled: busy, onClick: onClose, 'aria-label': t('editorClose') }, '×')),
      h('div', { className: 'yj-editor-body' }, h('div', { className: 'yj-avatar-picker' }, h(Avatar, { expert: draft, size: 64 }),
        h('div', { className: 'yj-avatar-side' },
          h('div', { className: 'yj-avatar-actions' }, h('label', { className: 'yj-avatar-upload' }, t('avatar'), h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', disabled: busy, onChange: upload })), h('button', { type: 'button', disabled: busy, onClick: () => update('avatar', null) }, t('clearAvatar'))),
          presetAvatars.length > 0 && h('div', { className: 'yj-avatar-presets', role: 'group', 'aria-label': t('avatarPresets') }, ...presetAvatars.map((id, index) => h('button', { type: 'button', key: id, className: 'yj-avatar-preset', 'aria-pressed': draft.avatar === avatarArt[id], 'aria-label': `${t('avatarPresets')} ${index + 1}`, disabled: busy, onClick: () => update('avatar', avatarArt[id]) }, h('img', { src: avatarArt[id], alt: '' })))))),
      ...[['name', 'expertName'], ['description', 'expertDescription']].map(([key, label]) => h('label', { key }, t(label), h('input', { value: draft[key], required: true, disabled: busy, maxLength: key === 'name' ? 40 : 240, onChange: event => update(key, event.target.value) }))),
      h('label', null, t('expertPrompt'), h('textarea', { required: true, value: draft.prompt, disabled: busy, onChange: event => update('prompt', event.target.value), spellCheck: false })),
      h('label', null, t('expertModel'), catalog?.modelSupported === false && h('small', { className: 'yj-muted' }, t('modelUnsupported')), h('select', { value: modelValue, disabled: busy || !catalog || catalog.modelSupported === false, onChange: event => update('model', event.target.value ? JSON.parse(event.target.value) : null) }, h('option', { value: '' }, t('inheritModel')), draft.model && !modelOptions.some(item => item.value === modelValue) && h('option', { value: modelValue }, `${draft.model.provider} / ${draft.model.model} · ${t('modelMissing')}`), ...modelOptions.map(item => h('option', { value: item.value, key: item.value }, item.name || item.model || item.id)))),
      selectedModel?.reasoning && h('label', null, t('reasoning'), h('select', { value: draft.model?.reasoningEffort || '', disabled: busy, onChange: event => { const { reasoningEffort, ...model } = draft.model; update('model', event.target.value ? { ...model, reasoningEffort: event.target.value } : model); } }, h('option', { value: '' }, t('reasoningDefault')), ...selectedModel.reasoning.efforts.map(item => h('option', { value: item.id, key: item.id }, item.name)))),
      choices('skills', 'optionalSkills'), catalog?.mcpSupported === false ? h('p', { className: 'yj-muted' }, t('mcpUnsupported')) : choices('mcpServers', 'optionalMcp'), ...(catalog?.issues || []).map(issue => h('p', { key: issue, className: 'yj-notice' }, issue))),
      recovery && h('div', { className: 'yj-notice' }, t('expertRecovery'), h('button', { type: 'button', disabled: busy, onClick: () => { committed.current = recovery; setDraft({ ...recovery, skills: [...recovery.skills], mcpServers: [...recovery.mcpServers] }); setRecovery(null); setError(''); } }, t('loadSavedExpert'))),
      h('footer', { className: 'yj-row' }, h('button', { type: 'button', disabled: busy, onClick: onClose }, t('cancelEdit')), h('button', { type: 'button', className: 'yj-primary', disabled: busy || avatarReading || !catalog || Boolean(recovery), onClick: save }, t(busy ? 'loading' : expert ? 'expertSaveChanges' : 'expertCreate'))));
  }

  /** 目录分页只持有可重建列表；打开笔记仍从知识服务读取正文。 */
  function Directory({ api, t, directory = '', selected, disabled, onSelect, selectedPaths, onToggle, version = 0 }) {
    const [listing, setListing] = useState(null);
    const [expanded, setExpanded] = useState([]);
    const [error, setError] = useState('');
    const [offset, setOffset] = useState(0);
    const [retry, setRetry] = useState(0);
    const [loading, setLoading] = useState(true);
    const pages = useRef([]);
    useEffect(() => {
      const controller = new AbortController();
      let live = true;
      setLoading(true);
      api.knowledge({ action: 'browse', directory, offset }, controller.signal).then(value => { if (live) { setListing(value); setError(''); setLoading(false); } }, reason => { if (live) { setError(reason.message); setLoading(false); } });
      return () => { live = false; controller.abort(); };
    }, [directory, offset, version, retry]);
    // Host 在同一目录下统一分页文件夹与笔记，偏移不能仅计数文件。
    const pageSize = (listing?.folders.length || 0) + (listing?.notes.length || 0);
    return h('div', { className: 'yj-directory', role: 'group', 'aria-label': directory || t('allNotes') },
      error && h('div', { role: 'alert' }, error, h('button', { type: 'button', onClick: () => setRetry(value => value + 1) }, t('directoryRetry'))),
      !listing && !error && h('span', { className: 'yj-spinner', role: 'status', 'aria-label': t('directoryLoading') }),
      ...(listing?.folders || []).map(folder => h('div', { key: folder.path }, h('button', { type: 'button', className: 'yj-folder', title: folder.name, 'aria-expanded': expanded.includes(folder.path), onClick: () => setExpanded(value => value.includes(folder.path) ? value.filter(path => path !== folder.path) : [...value, folder.path]) }, h('span', { className: expanded.includes(folder.path) ? 'yj-folder-chevron yj-expanded' : 'yj-folder-chevron' }, h(Glyph, { name: 'chevron', size: 12 })), h(Glyph, { name: 'folder', size: 15 }), h('span', { className: 'yj-tree-title' }, folder.name)),
        expanded.includes(folder.path) && h(Directory, { api, t, directory: folder.path, selected, disabled, onSelect, selectedPaths, onToggle, version }))),
      ...(listing?.notes || []).map(item => h('div', { key: item.path, className: 'yj-note-row' }, h('input', { type: 'checkbox', checked: selectedPaths.includes(item.path), 'aria-label': t('selectForQuestion', { name: item.title }), disabled: disabled || (!selectedPaths.includes(item.path) && selectedPaths.length >= 12), onChange: event => onToggle(item.path, event.target.checked) }), h('button', { type: 'button', className: `yj-note ${selected === item.path ? 'yj-selected' : ''}`, disabled, onClick: () => onSelect(item), title: `${item.title}\n${item.path}` }, h(Glyph, { name: 'file', size: 14 }), h('span', { className: 'yj-tree-title' }, item.title)))),
      listing && (offset > 0 || listing.total > pageSize) && h('div', { className: 'yj-row' }, h('button', { type: 'button', disabled: disabled || loading || Boolean(error) || offset !== listing.offset || offset === 0, onClick: () => setOffset(pages.current.pop() || 0) }, t('previous')), h('button', { type: 'button', disabled: disabled || loading || Boolean(error) || offset !== listing.offset || !listing.truncated || pageSize === 0, onClick: () => { pages.current.push(listing.offset); setOffset(listing.offset + pageSize); } }, t('next'))));
  }

  function CiteNotes({ api, sessionId, inputActions, t }) {
    const context = useSyncExternalStore(api.subscribeContext, api.assistantContext, api.assistantContext);
    const [error, setError] = useState('');
    if (context.sessionId !== sessionId || !context.paths.length) return null;
    return h('div', { className: 'yj-cite-control' }, h('button', { type: 'button', className: 'yj-picker-trigger', title: t('citeHelp'), onMouseDown: event => event.preventDefault(), onClick: () => {
      try { api.insertReference(sessionId, inputActions.captureInsertion(), context.paths); setError(''); }
      catch (reason) { setError(reason.message); }
    } }, t('citeNotes')), error && h('span', { role: 'alert', className: 'yj-error' }, error));
  }

  function SkillEditor({ api, entry, t, onClose, onSaved, notify }) {
    const [name, setName] = useState('');
    const [content, setContent] = useState(entry?.content ?? '---\nname: my-skill\ndescription: 描述适用场景与完成目标\n---\n\n# 操作步骤\n\n');
    const [busy, setBusy] = useState(false);
    const setError = message => { if (message) notify(message, { kind: 'error' }); };
    const [unverified, setUnverified] = useState(false);
    const current = useRef(entry);
    const createdId = useRef(null);
    const saving = useRef(false);
    const modal = useRef(null);
    const lifetime = useRef(null);
    useEffect(() => {
      lifetime.current = new AbortController();
      const previous = typeof document === 'undefined' ? null : document.activeElement;
      modal.current?.showModal();
      return () => { lifetime.current.abort(); modal.current?.close(); previous?.focus(); };
    }, []);
    const readSaved = async () => {
      const signal = lifetime.current?.signal;
      const value = await api.skillRequest({ action: 'read', id: current.current?.id || createdId.current }, signal);
      // 原件编辑首次落为覆盖，未知回执只能消费 owner 返回的覆盖身份，不能拼目录。
      return api.resolveSkillEdit(value.entry, signal);
    };
    const load = async () => {
      setBusy(true); setError('');
      try { const actual = await readSaved(); lifetime.current?.signal.throwIfAborted(); if (actual) { current.current = actual; setContent(actual.content); } setUnverified(false); }
      catch (reason) { setError(reason.message); }
      finally { setBusy(false); }
    };
    const save = async () => {
      if (saving.current || unverified) return;
      if (!current.current && !createdId.current && !name.trim()) { setError(t('skillIdentifierHelp')); return; }
      createdId.current ||= current.current ? null : `${name.trim()}/SKILL.md`;
      const before = current.current;
      let accepted;
      saving.current = true; setBusy(true); setError('');
      try {
        const input = before ? { action: 'update', id: before.id, content, expectedHash: before.hash, ...(before.baseHash === undefined ? {} : { expectedBaseHash: before.baseHash }) } : { action: 'create', id: createdId.current, content, expectedHash: '' };
        const saved = await api.skillRequest(input, lifetime.current?.signal);
        if (!saved.entry) throw new Error(t('skillReadback'));
        accepted = saved.entry;
        current.current = saved.entry;
        const actual = await readSaved();
        if (!actual || actual.hash !== saved.entry.hash || actual.content !== saved.entry.content) throw new Error(t('skillReadback'));
        lifetime.current?.signal.throwIfAborted();
        await onSaved(actual);
      } catch (reason) {
        if (lifetime.current?.signal.aborted) return;
        try {
          const actual = await readSaved();
          if (accepted && actual?.hash === accepted.hash && actual.content === accepted.content) { current.current = actual; await onSaved(actual); return; }
          // 已有不同版本保留草稿，只有员工明确载入后才采用新的写前哈希。
          setUnverified(Boolean(actual && (actual.id !== before?.id || actual.hash !== before?.hash)));
        } catch { setUnverified(true); }
        setError(reason.message);
      } finally { saving.current = false; if (!lifetime.current?.signal.aborted) setBusy(false); }
    };
    return h('dialog', { ref: modal, className: 'yj-editor yj-page', 'aria-label': t(entry ? 'editSkill' : 'newSkill'), onCancel: event => { event.preventDefault(); if (!busy) onClose(); } },
      h('header', { className: 'yj-header' }, h('h2', null, t(entry ? 'editSkill' : 'newSkill')), h('button', { type: 'button', disabled: busy, onClick: onClose, 'aria-label': t('close') }, '×')),
      h('div', { className: 'yj-editor-body' }, !entry && h('label', null, t('skillIdentifier'), h('input', { value: name, disabled: busy || Boolean(createdId.current), onChange: event => setName(event.target.value), placeholder: 'my-skill' }), h('small', null, t('skillIdentifierHelp'))), entry?.origin === 'builtin' && h('p', { className: 'yj-notice' }, t('skillBuiltinHelp')), h('label', null, t('skillContent'), h('textarea', { value: content, disabled: busy, onChange: event => setContent(event.target.value), spellCheck: false })), unverified && h('p', { className: 'yj-notice' }, t('skillReadback'), h('button', { type: 'button', onClick: load, disabled: busy }, t('skillLoadSaved')))),
      h('footer', { className: 'yj-row' }, h('button', { type: 'button', disabled: busy, onClick: onClose }, t('cancelEdit')), h('button', { type: 'button', className: 'yj-primary', disabled: busy || unverified, onClick: save }, t('saveSkill'))));
  }

  /** 会话正文、输入、审批和取消均由同一个原生 factory 负责。 */
  function AssistantConversation({ useSession, renderFactorySlot, views }) {
    const session = useSession(value => value);
    return renderFactorySlot('conversation.content', { variant: 'embedded', phase: session.openState === 'loading' ? 'settling' : 'active', hero: false }, { slots: { views } });
  }
  function AssistantChat({ renderSlot, sessionId, api }) {
    // 子会话先恢复宿主保存的草稿，再允许讨论入口合入文字；不读取或重建宿主草稿。
    useEffect(() => api.mountAssistantInput(sessionId), [api, sessionId]);
    // 空白原生会话还没有 viewArea；常驻占位保证首条消息前输入框也停靠底部。
    return h('div', { className: 'yj-assistant-chat' }, renderSlot('conversation.session', { view: 'chat' }));
  }

  /** 外壳几何与会话生命周期分离，移动或缩放不重挂原生输入。 */
  /** 小鲸助手入口可拖动：默认在右下角，拖动后记住位置；拖动结束不触发打开。 */
  function useDraggableBubble() {
    const key = 'whalewing.assistantBubble.v1';
    const [offset, setOffset] = useState(() => {
      try { const value = JSON.parse(window.localStorage.getItem(key)); if (Number.isFinite(value?.right) && Number.isFinite(value?.bottom)) return value; } catch { /* 读不到位置时用默认右下角。 */ }
      return null;
    });
    const drag = useRef(null), dragged = useRef(false);
    const edge = 8;
    const clamp = (element, right, bottom) => {
      // 按整个窗口定位：AI 网页全屏时主栏会变窄，按主栏算会把按钮挤到屏幕中间。
      const box = { width: window.innerWidth, height: window.innerHeight };
      return { right: Math.round(Math.max(edge, Math.min(right, box.width - element.offsetWidth - edge))), bottom: Math.round(Math.max(edge, Math.min(bottom, box.height - element.offsetHeight - edge))) };
    };
    const save = value => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* 位置只是个人偏好，存不下不影响使用。 */ } };
    const end = (event, keep) => {
      const active = drag.current;
      if (!active || active.id !== event.pointerId) return;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (keep && dragged.current) setOffset(value => { if (value) save(value); return value; });
    };
    const handlers = {
      onPointerDown: event => {
        if (event.button !== 0) return;
        const style = window.getComputedStyle(event.currentTarget);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, right: parseFloat(style.right) || 0, bottom: parseFloat(style.bottom) || 0 };
        dragged.current = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: event => {
        const active = drag.current;
        if (!active || active.id !== event.pointerId) return;
        const dx = event.clientX - active.x, dy = event.clientY - active.y;
        if (!dragged.current && Math.hypot(dx, dy) < 5) return;
        dragged.current = true;
        setOffset(clamp(event.currentTarget, active.right - dx, active.bottom - dy));
      },
      onPointerUp: event => end(event, true),
      onPointerCancel: event => end(event, true),
    };
    // 拖动之后的那次 click 只结束拖动，不打开助手。
    const consumeDrag = () => { const value = dragged.current; dragged.current = false; return value; };
    // 窗口缩小时位置仍留在可见范围内。
    const style = offset ? { right: `max(${edge}px, min(${offset.right}px, calc(100vw - 180px)))`, bottom: `max(${edge}px, min(${offset.bottom}px, calc(100vh - 60px)))` } : undefined;
    return { style, handlers, consumeDrag };
  }

  function useFloatingAssistant(form) {
    const frame = useRef(null);
    const gesture = useRef(null);
    const [rect, setRect] = useState(null);
    const viewport = () => ({ width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) });
    const fit = value => {
      const view = viewport();
      const edge = Math.min(16, view.width / 4, view.height / 4);
      const width = Math.min(Math.max(value.width, Math.min(320, view.width - edge * 2)), view.width - edge * 2);
      const height = Math.min(Math.max(value.height, Math.min(360, view.height - edge * 2)), view.height - edge * 2);
      return { left: Math.max(edge, Math.min(value.left, view.width - width - edge)), top: Math.max(edge, Math.min(value.top, view.height - height - edge)), width, height };
    };
    const initial = () => { const view = viewport(); return fit({ left: view.width - 464, top: view.height - 784, width: 440, height: 760 }); };
    const finish = event => {
      const active = gesture.current;
      if (!active || (event && event.pointerId !== active.id)) return;
      gesture.current = null;
      if (active.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
    };
    useEffect(() => {
      if (form !== 'float') { finish(); return; }
      setRect(value => fit(value || initial()));
      const resized = () => { finish(); setRect(value => fit(value || initial())); };
      window.addEventListener('resize', resized);
      return () => { finish(); window.removeEventListener('resize', resized); };
    }, [form === 'float']);
    const begin = (event, direction) => {
      if (form !== 'float' || event.button !== 0 || gesture.current) return;
      if (direction === 'move' && event.target.closest('button,input,textarea,select,a')) return;
      event.preventDefault();
      const bounds = frame.current.getBoundingClientRect();
      gesture.current = { id: event.pointerId, target: event.currentTarget, direction, x: event.clientX, y: event.clientY, rect: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height } };
      event.currentTarget.setPointerCapture(event.pointerId);
    };
    const applyMotion = (direction, start, dx, dy) => {
      if (direction === 'move') { setRect(fit({ width: start.width, height: start.height, left: start.left + dx, top: start.top + dy })); return; }
      const view = viewport(), edge = Math.min(16, view.width / 4, view.height / 4);
      const minWidth = Math.min(320, view.width - edge * 2), minHeight = Math.min(360, view.height - edge * 2);
      let left = start.left, top = start.top, right = left + start.width, bottom = top + start.height;
      if (direction.includes('w')) left = Math.max(edge, Math.min(left + dx, right - minWidth));
      if (direction.includes('e')) right = Math.min(view.width - edge, Math.max(right + dx, left + minWidth));
      if (direction.includes('n')) top = Math.max(edge, Math.min(top + dy, bottom - minHeight));
      if (direction.includes('s')) bottom = Math.min(view.height - edge, Math.max(bottom + dy, top + minHeight));
      setRect({ left, top, width: right - left, height: bottom - top });
    };
    const moved = event => {
      const active = gesture.current;
      if (!active || active.id !== event.pointerId) return;
      event.preventDefault();
      applyMotion(active.direction, active.rect, event.clientX - active.x, event.clientY - active.y);
    };
    const handle = direction => ({ onPointerDown: event => begin(event, direction), onPointerMove: moved, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish, onKeyDown: event => {
      if (form !== 'float' || event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 24 : 8;
      applyMotion(direction, frame.current.getBoundingClientRect(), event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
    } });
    return { frame, style: form === 'float' && rect ? { ...rect, right: 'auto', bottom: 'auto' } : undefined, handle };
  }

  /** 分隔宽度仅属于当前工作台；容器变窄时同时给目录与正文保留空间。 */
  function useDirectorySplit(active) {
    const frame = useRef(null);
    const gesture = useRef(null);
    const [width, setWidth] = useState(195);
    const [available, setAvailable] = useState(800);
    const limits = size => ({ min: Math.min(120, Math.max(0, (size - 8) / 3)), max: Math.max(0, Math.min(560, size - 8 - Math.min(240, size / 2))) });
    const clamp = (value, size = available) => { const range = limits(size); return Math.max(range.min, Math.min(value, Math.max(range.min, range.max))); };
    const finish = (event, cancel = false) => {
      const drag = gesture.current;
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
      gesture.current = null;
      if (cancel) setWidth(clamp(drag.width));
      if (drag.target.hasPointerCapture(drag.id)) drag.target.releasePointerCapture(drag.id);
    };
    useEffect(() => {
      if (!active || !frame.current) return;
      const resize = () => { finish(); const size = Math.max(0, frame.current.clientWidth); setAvailable(size); setWidth(value => clamp(value, size)); };
      resize();
      const observer = new window.ResizeObserver(resize);
      observer.observe(frame.current);
      return () => { finish(); observer.disconnect(); };
    }, [active]);
    const range = limits(available);
    const value = clamp(width);
    return { frame, width: value, separator: {
      role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical', 'aria-valuemin': Math.round(range.min), 'aria-valuemax': Math.round(Math.max(range.min, range.max)), 'aria-valuenow': Math.round(value),
      onPointerDown: event => { if (event.button !== 0 || gesture.current) return; event.preventDefault(); event.currentTarget.focus(); gesture.current = { id: event.pointerId, target: event.currentTarget, x: event.clientX, width: value }; event.currentTarget.setPointerCapture(event.pointerId); },
      onPointerMove: event => { const drag = gesture.current; if (!drag || event.pointerId !== drag.id) return; event.preventDefault(); setWidth(clamp(drag.width + event.clientX - drag.x)); },
      onPointerUp: event => finish(event), onPointerCancel: event => finish(event, true), onLostPointerCapture: event => finish(event, true),
      onKeyDown: event => {
        if (event.key === 'Escape') { finish(undefined, true); return; }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        setWidth(clamp(event.key === 'Home' ? range.min : event.key === 'End' ? range.max : value + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 24 : 8)));
      },
    } };
  }

  function Workbench({ api, t, notify, SessionProvider, renderSlot }) {
    const [tab, setTab] = useState('experts');
    const directorySplit = useDirectorySplit(tab === 'knowledge');
    const [sessionId, setSessionId] = useState('');
    const [cwd, setCwd] = useState('');
    const [workspaceId, setWorkspaceId] = useState('');
    const [mode, setMode] = useState('');
    const [modes, setModes] = useState([]);
    const [createdSession, setCreatedSession] = useState('');
    const tabRef = useRef('experts'), loadRef = useRef(null), errorShown = useRef(false);
    // 失败统一走右上角提示，不在页面顶部插入一行把内容往下挤；能重试的页面在提示里给出“重试”，已创建会话的失败给出“打开”。
    const setError = (message, action) => {
      setErrorValue(message);
      if (!message) return;
      errorShown.current = true;
      const retry = ['knowledge', 'schedule', 'news', 'models'].includes(tabRef.current) ? { label: t('retry'), run: () => loadRef.current?.(tabRef.current) } : null;
      notify(message, { kind: 'error', action: action || retry });
    };
    const switchTab = key => { tabRef.current = key; setTab(key); };
    const [recoverySession, setRecoverySession] = useState('');
    const [includeSource, setIncludeSource] = useState(false);
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setErrorValue] = useState('');
    const [conflict, setConflict] = useState(false);
    const [readbackPath, setReadbackPath] = useState('');
    const [query, setQuery] = useState('');
    const [notes, setNotes] = useState([]);
    const [truncated, setTruncated] = useState(false);
    const [note, setNote] = useState(null);
    const [path, setPath] = useState('');
    const [content, setContent] = useState('');
    const [restorePath, setRestorePath] = useState('');
    const [validation, setValidation] = useState(null);
    const [skills, setSkills] = useState([]);
    const [skillPage, setSkillPage] = useState({ offset: 0, total: 0, truncated: false });
    const skillPages = useRef([]);
    const [skillEditor, setSkillEditor] = useState(undefined);
    const [skill, setSkill] = useState(null);
    const [automations, setAutomations] = useState({ available: null, tasks: [], legacyTasks: [], issues: [] });
    const [taskDraft, setTaskDraft] = useState(null);
    const [taskDraftHidden, setTaskDraftHidden] = useState(false);
    const [taskRecovery, setTaskRecovery] = useState(null);
    const [taskHistory, setTaskHistory] = useState(null);
    const [selectedTask, setSelectedTask] = useState('');
    const [newsSettings, setNewsSettings] = useState(false);
    const [newsData, setNewsData] = useState(null);
    const [newsHome, setNewsHome] = useState(null);
    const [learningArticle, setLearningArticle] = useState(null);
    const [newsItem, setNewsItem] = useState(null);
    const [newsExpanded, setNewsExpanded] = useState({});
    const [newsRun, setNewsRun] = useState(null);
    const [newsEditor, setNewsEditor] = useState(null);
    const [newsSource, setNewsSource] = useState({ name: '', url: '', kind: '', region: '' });
    const [newsHistory, setNewsHistory] = useState(null);
    const [newsAbout, setNewsAbout] = useState(false);
    const [newsReport, setNewsReport] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [editing, setEditing] = useState(false);
    const [location, setLocation] = useState(0);
    const [linkIssue, setLinkIssue] = useState(null);
    const [graph, setGraph] = useState(null);
    const [missingGraph, setMissingGraph] = useState(null);
    const graphRequest = useRef(null);
    const graphLoadingLabel = useRef((done, total) => t('graphPreparing', { done, total }));
    const [graphCenter, setGraphCenter] = useState('');
    const [selectedPaths, setSelectedPaths] = useState([]);
    const registry = useSyncExternalStore(api.subscribeExperts, api.experts, api.experts);
    const roleCards = registry.experts;
    const [expertEditor, setExpertEditor] = useState(undefined);
    // 工作区先留给内容；仅在员工主动唤起后展开，不触发会话准备。
    const [assistantForm, setAssistantForm] = useState('bubble');
    const floating = useFloatingAssistant(assistantForm);
    const bubble = useDraggableBubble();
    const [assistantId, setAssistantId] = useState('');
    const [assistantReference, setAssistantReference] = useState(null);
    const [assistantPresentedReady, setAssistantPresentedReady] = useState(null);
    const [browserReference, setBrowserReference] = useState(null);
    const browserOpening = useRef(null), presentedIdentity = useRef(null), browserRetained = useRef(null), browserFocus = useRef(null);
    const restoreBrowser = () => { const focus = browserFocus.current; browserFocus.current = null; focus?.release(); };
    const focusMountedBrowser = () => {
      const id = presentedIdentity.current;
      if (tab !== 'aiWeb' || !id) throw new Error(t('browserMissing'));
      if (browserFocus.current?.id === id) return;
      restoreBrowser();
      browserFocus.current = { id, release: api.focusBrowser(id) };
    };
    const [previewError, setPreviewError] = useState('');
    const [previewRetry, setPreviewRetry] = useState(0);
    const [directoryVersion, setDirectoryVersion] = useState(0);
    const [contextExplicit, setContextExplicit] = useState(false);
    const history = useRef([]);
    const operation = useRef(null);
    const mounted = useRef(true);
    const workspaces = useSyncExternalStore(api.subscribeWorkspaces, api.workspaces, api.workspaces);
    useEffect(() => {
      const media = window.matchMedia?.('(max-width: 850px)');
      if (!media) return;
      // 窄屏先让出知识画布；显式打开的悬浮窗与同一个原生会话不重建。
      const adapt = event => { if (event.matches) setAssistantForm(value => value === 'dock' ? 'bubble' : value); };
      adapt(media);
      media.addEventListener('change', adapt);
      return () => media.removeEventListener('change', adapt);
    }, []);
    useEffect(() => {
      mounted.current = true;
      return () => { mounted.current = false; if (operation.current) { operation.current.cancelled = true; operation.current.controller.abort(); } };
    }, []);
    useEffect(() => {
      let live = true;
      api.loadExperts().catch(reason => { if (live) setError(reason.message); });
      api.modes().then((value) => { if (live) setModes(value); }, (reason) => { if (live) setError(reason.message || t('requestFailed')); });
      return () => { live = false; };
    }, []);
    useEffect(() => () => { assistantReference?.release(); }, [assistantReference]);
    useEffect(() => {
      let live = true;
      setAssistantPresentedReady(null);
      if (assistantReference && assistantReference.sessionId === assistantId && assistantForm !== 'bubble') {
        assistantReference.ready.then(() => { if (live) setAssistantPresentedReady(assistantReference); }, reason => { if (live) setPreviewError(reason.message || t('requestFailed')); });
      }
      return () => { live = false; };
    }, [assistantReference, assistantId, assistantForm === 'bubble', previewRetry]);
    const visibleAssistant = assistantForm !== 'bubble' && assistantPresentedReady === assistantReference && assistantReference?.sessionId === assistantId ? assistantReference : null;
    const presentedReference = visibleAssistant || (tab === 'aiWeb' ? browserReference : null);
    useEffect(() => {
      const intendedId = presentedReference?.sessionId || null;
      // null 也是请求开始时的明确呈现意图；准备未结束时的新租约同样使旧请求失效。
      const opening = browserOpening.current;
      if (opening && opening.expected !== intendedId) opening.controller.abort(new Error('浏览器会话已切换，请重新打开'));
      if (!presentedReference) return;
      const id = presentedReference.sessionId;
      let release;
      setPreviewError('');
      try { release = api.presentAssistant(id) ?? undefined; presentedIdentity.current = id; }
      catch (reason) { setPreviewError(reason.message || t('requestFailed')); browserOpening.current?.controller.abort(reason); }
      return () => {
        if (browserOpening.current?.expected === id) browserOpening.current.controller.abort(new Error('浏览器会话已切换，请重新打开'));
        restoreBrowser();
        presentedIdentity.current = null;
        release?.();
      };
    }, [presentedReference, previewRetry]);
    const releaseBrowserReference = () => {
      restoreBrowser();
      const reference = browserRetained.current;
      browserRetained.current = null;
      reference?.release();
      if (mounted.current) setBrowserReference(null);
    };
    useEffect(() => {
      if (tab !== 'aiWeb') { browserOpening.current?.controller.abort(new Error('已离开 AI 网页')); releaseBrowserReference(); }
      else if (visibleAssistant) releaseBrowserReference();
    }, [tab, visibleAssistant]);
    useEffect(() => () => { browserOpening.current?.controller.abort(new Error('工作台已关闭')); releaseBrowserReference(); }, []);
    const prepareAiBrowser = async (url, outerSignal, key) => {
      // 原生 DSH 没有把浏览器铺满工作台的接口：在专用的「AI 网页」会话里打开。
      if (!api.hostAdapted()) return api.openAiInConversation(url, key, outerSignal);
      if (tab !== 'aiWeb' || browserOpening.current) throw new Error('浏览器正在准备或页面已离开');
      api.browserAvailable();
      const controller = new AbortController(), ticket = { controller, expected: presentedReference?.sessionId || null };
      browserOpening.current = ticket;
      let acquired, timer;
      const forward = () => controller.abort(outerSignal.reason || new Error('打开已取消'));
      outerSignal?.addEventListener('abort', forward, { once: true });
      if (outerSignal?.aborted) forward();
      const deadline = setTimeout(() => controller.abort(new Error('浏览器准备超时，请保留原会话并重试')), 15000);
      const signal = controller.signal;
      const aborted = new Promise((_, reject) => { if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
      const wait = promise => Promise.race([promise, aborted]);
      try {
        let target = visibleAssistant || browserReference;
        if (!target) {
          const id = await wait(api.ensureWorkbench(signal));
          signal.throwIfAborted();
          acquired = api.retain(id);
          await wait(acquired.ready);
          signal.throwIfAborted();
          target = acquired;
          ticket.expected = id;
          browserRetained.current = acquired;
          setBrowserReference(acquired);
          acquired = null;
        } else ticket.expected = target.sessionId;
        // presentSession 只表达呈现意图；跨过 React commit 并确认实际 mounted 后才投递。
        do {
          await wait(new Promise(resolve => { timer = setTimeout(resolve, 16); }));
          signal.throwIfAborted();
          if (presentedIdentity.current && presentedIdentity.current !== target.sessionId) throw new Error('浏览器会话已切换，请重新打开');
        } while (presentedIdentity.current !== target.sessionId || api.browserMounted() !== target.sessionId);
        focusMountedBrowser();
        // 继续使用只恢复原浏览器呈现，不创建标签或重新导航已有网页。
        if (url !== undefined) await wait(api.openBrowser(url, target.sessionId, key));
        signal.throwIfAborted();
      } catch (reason) {
        releaseBrowserReference();
        throw reason;
      } finally {
        clearTimeout(deadline); clearTimeout(timer);
        outerSignal?.removeEventListener('abort', forward);
        acquired?.release();
        if (browserOpening.current === ticket) browserOpening.current = null;
      }
    };
    const openAiBrowser = (url, signal, key) => prepareAiBrowser(url, signal, key);
    const focusBrowser = signal => prepareAiBrowser(undefined, signal);
    const dirty = content !== (note?.content || '');

    // 串行执行避免旧查询覆盖新选择；停止等待不谎称回滚已提交的 Host 写入。
    async function run(work, success) {
      if (operation.current) return;
      const ticket = { cancelled: false, controller: new AbortController() };
      operation.current = ticket;
      notify(null); errorShown.current = false;
      setBusy(true); setError('');
      setRecoverySession('');
      try {
        const result = await work();
        if (!ticket.cancelled && mounted.current) {
          if (typeof result === 'function') result();
          // 收尾时已经报出问题（例如写入成功但列表读不到），保留那条提示，不用“已保存”盖掉。
          if (success && !errorShown.current) notify(t(success));
        }
      } catch (reason) {
        if (!ticket.cancelled && mounted.current) {
          if (reason.sessionId) setCreatedSession(reason.sessionId);
          if (reason.code === 'workbench_identity') setRecoverySession(reason.workbenchId || '');
          const isConflict = Boolean(reason.notePath) && /conflict|hash|已.*修改/i.test(`${reason.code || ''} ${reason.message || ''}`);
          const needsReadback = Boolean(reason.notePath) && /readback/i.test(reason.code || '');
          if (needsReadback || (isConflict && reason.notePath !== path)) { setReadbackPath(reason.notePath); setGraph(null); graphRequest.current = null; }
          // 普通查询的结果不解决保存冲突；只由正文的成功回读或写后回执解除。
          setConflict(value => value || isConflict || needsReadback);
          setError(reason.sessionId ? `${t('expertSelectionFailed')} (${reason.sessionId}): ${reason.message}` : isConflict && !needsReadback ? t('conflict') : reason.message || t('requestFailed'), reason.sessionId ? { label: t('openCreated'), run: () => api.open(reason.sessionId) } : undefined);
        }
      } finally {
        if (mounted.current) {
          setBusy(false);
          if (ticket.cancelled) setError(t('stopped'));
        }
        operation.current = null;
      }
    }
    const localActions = ['status', 'initialize', 'search', 'read', 'document', 'write', 'remove', 'restore', 'validate', 'graph'];
    const command = (action, extra = {}, id = sessionId) => !extra.domain && localActions.includes(action)
      ? (note?.readOnly && note.path === extra.path && ['write', 'remove', 'restore'].includes(action)
        ? Promise.reject(new Error(t('noteReadOnly')))
        : api.knowledge({ action, ...extra }, operation.current?.controller.signal)).catch(reason => {
        // 同名CONFLICT也来自专家和技能；只有知识正文写入持有编辑保护的归属。
        if (['write', 'remove', 'restore'].includes(action)) reason.notePath = extra.path;
        throw reason;
      })
      : api.request(id, { action, ...extra });
    const skillCommand = (action, extra = {}) => api.skillRequest({ action, ...extra }, operation.current?.controller.signal);
    const adoptSkills = value => { setSkills(value.entries); setSkillPage({ offset: value.offset, total: value.total, truncated: value.truncated }); };
    const pageSkills = (offset, direction) => run(async () => { const value = await skillCommand('list', { offset }); return () => { if (direction === 'next') skillPages.current.push(skillPage.offset); if (direction === 'previous') skillPages.current.pop(); adoptSkills(value); }; });
    const readEvolution = async (name, state) => {
      let offset = 0;
      do {
        const page = await skillCommand('list', { offset });
        const entry = page.entries.find(item => item.origin === 'evolution' && item.name === name && item.state === state);
        if (entry) return (await skillCommand('read', { id: entry.id })).entry;
        if (!page.truncated || !page.entries.length) break;
        const next = page.offset + page.entries.length;
        if (next <= offset) throw new Error(t('badReply'));
        offset = next;
      } while (true);
      throw new Error(t('skillMissing'));
    };
    const button = (key, onClick, disabled = false, props = {}) => h('button', { type: 'button', onClick: (...args) => { notify(null); return onClick(...args); }, disabled: busy || disabled, ...props }, t(key));
    const field = (key, value, onChange, props = {}) => h('label', { className: 'yj-field' }, t(key), h('input', { value, onChange: (event) => onChange(event.target.value), disabled: busy, ...props }));
    const row = (...children) => h('div', { className: 'yj-row' }, ...children);
    const help = (key) => h('p', { className: 'yj-muted' }, t(key));
    const refreshNotes = async () => command('search', { query });
    const applyNotes = (value) => { setNotes(value.notes); setTruncated(Boolean(value.truncated)); };
    // 列表是派生视图，其失败不否定已经提交并回读的单文件结果。
    const refreshAfterMutation = async () => {
      try { return { found: await refreshNotes() }; }
      catch (reason) { return { issue: `${t('listRefreshFailed')}：${reason.message}` }; }
    };
    const applyRefreshed = value => { setDirectoryVersion(version => version + 1); if (value.found) applyNotes(value.found); if (value.issue) setError(value.issue); };
    const readAfterMutation = async name => {
      try { return await command('document', { path: name }); }
      // 新建和恢复也可能已落盘；恢复身份不依赖尚未读到的 note，也不被再次读取失败清除。
      catch (reason) { throw Object.assign(new Error(`${t('savedReadback')}：${reason.message}`), { code: 'committed_readback', notePath: name }); }
    };
    const newNote = () => {
      // 用本地日期生成仅在编辑区存在的初稿，路径与正文仍由 Host 校验。
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const title = `${date} ${t('newNoteTitle')}`;
      setNote(null); setPath(`10-收件箱/${title}.md`);
      setContent(`---\ntype: capture\nstatus: inbox\ncreated: ${date}\nupdated: ${date}\naliases: []\n---\n\n# ${title}\n\n`);
      setConflict(false); setConfirm(null);
      setEditing(true); setLocation(0); setLinkIssue(null); setGraph(null); graphRequest.current = null;
    };
    const selectNote = (item, backwards = false) => run(async () => {
      // 缺失节点是图投影，不获得文件读取或自动新建入口。
      if (item.kind === 'missing') return () => setMissingGraph(item);
      const value = await command('document', { path: item.path });
      return () => {
        if (backwards) history.current.pop();
        else if (note && note.path !== value.path) history.current.push({ path: note.path, targetLine: location });
        setNote(value); setPath(value.path); setContent(value.content); setReadbackPath(''); setConflict(false); setConfirm(null); setEditing(false); setLocation(item.targetLine || 0); setLinkIssue(null); setGraph(null); setMissingGraph(null); graphRequest.current = null;
      };
    });
    const openLink = (token) => {
      if (busy || dirty) return;
      const match = /^whalewing-link\/(\d+)\.md$/.exec(token);
      const link = match && note?.links?.[Number(match[1])];
      if (!link) { setError(t('invalidLink')); return; }
      if (link.status !== 'resolved') { setLinkIssue(link); return; }
      return selectNote(link);
    };
    const loadGraph = (center = graphCenter, offset = 0) => run(async () => {
      graphRequest.current = { ...(center ? { path: center } : {}), query: '', offset };
      const value = await command('graph', graphRequest.current);
      return () => { setGraph(value); setGraphCenter(center); setMissingGraph(null); };
    });
    const loadTab = (target, restart = false, enterKnowledge = false) => run(async () => {
      if (target === 'aiWeb' || target === 'toolbox') return;
      if (target === 'experts') { await api.loadExperts(); const value = await api.modes(); return () => setModes(value); }
      if (target === 'skills') { const value = await skillCommand('list'); return () => { adoptSkills(value); skillPages.current = []; }; }
      if (target === 'schedule') { const value = await api.automationCatalog(operation.current?.controller.signal); return () => setAutomations(value); }
      if (target === 'news') { const value = await api.newsRequest({ action: newsSettings ? 'list' : 'home' }, operation.current?.controller.signal); return () => newsSettings ? setNewsData(value) : setNewsHome(value); }
      if (target === 'models') return;
      if (enterKnowledge) graphRequest.current = { query: '', offset: 0 };
      const id = target === 'knowledge' ? '' : await (restart ? api.restartWorkbench() : api.ensureWorkbench());
      const current = await command('status', {}, id);
      let value, nextGraph, graphError;
      if (current.initialized && target === 'knowledge') {
        if (query.trim() || !graphRequest.current) value = await command('search', { query }, id);
        if (graphRequest.current && !dirty && !conflict && !readbackPath) {
          try { nextGraph = await command('graph', graphRequest.current, id); }
          catch (reason) { graphError = reason.message; }
        }
      }
      return () => {
        if (id) setSessionId(id); setStatus(current);
        if (target === 'knowledge' && value) applyNotes(value);
        if (nextGraph) { setGraph(nextGraph); setGraphCenter(graphRequest.current.path || ''); setMissingGraph(null); }
        if (graphError) setError(graphError);
      };
    });
    const refreshTab = () => loadTab(tab);
    tabRef.current = tab; loadRef.current = loadTab;
    const taskTiming = draft => {
      // HTML time 控件可能省略秒；只补齐原生输入格式，不在客户端计算触发时间。
      const time = /^\d{2}:\d{2}$/.test(draft.time) ? `${draft.time}:00` : draft.time;
      if (draft.rule === 'daily') return { daily: { time, time_zone: 'Asia/Shanghai' } };
      if (draft.rule === 'weekly') return { weekly: { time, time_zone: 'Asia/Shanghai', weekdays: draft.weekdays.split(',').map(value => Number(value.trim())) } };
      if (draft.rule === 'cron') return { cron: { expression: draft.expression, time_zone: 'Asia/Shanghai' } };
      return { [draft.rule]: draft.rule === 'at' ? draft.at.trim() : Number(draft.seconds) };
    };
    const beginTask = purpose => {
      if (taskDraft) { setTaskDraftHidden(false); return; }
      setTaskDraft({ purpose, title: purpose === 'knowledge' ? t('knowledgeTask') : purpose === 'news' ? t('newsDaily') : '', prompt: '', workspaceScope: { mode: 'all', excludedWorkspaceIds: [] }, rule: 'daily', time: '00:15:00', timeZone: 'Asia/Shanghai', weekdays: '1,2,3,4,5', seconds: '3600', at: '', expression: '0 8 * * *' });
      setTaskDraftHidden(false);
    };
    const editTask = task => run(async () => {
      const value = await api.automationRequest({ action: 'read', sessionId: task.sessionId, id: task.id }, operation.current?.controller.signal);
      if (!value.task || value.task.id !== task.id || value.legacy || value.purpose === 'news') throw new Error(t('taskReadback'));
      const record = value.task;
      return () => { setTaskDraft({ id: task.id, sessionId: task.sessionId, purpose: value.purpose, expected: record, expectedStatus: value.status, title: record.title || '', prompt: value.displayPrompt ?? record.prompt, workspaceScope: value.workspaceScope || { mode: 'all', excludedWorkspaceIds: [] }, rule: record.kind === 'every' ? 'every_seconds' : record.kind === 'after' ? 'at' : record.kind, time: record.time || '00:15:00', timeZone: record.timeZone || 'Asia/Shanghai', weekdays: (record.weekdays || [1, 2, 3, 4, 5]).join(','), seconds: String(record.everySeconds || 3600), at: record.scheduledAt || '', expression: record.expression || '', changeTime: false }); setTaskDraftHidden(false); };
    });
    const saveTask = resume => run(async () => {
      const signal = operation.current?.controller.signal;
      const draft = taskDraft;
      if (automations.available !== true) throw new Error(t('taskUnavailableShort'));
      let catalog;
      if (draft.id) {
        const update = { action: 'update', sessionId: draft.sessionId, id: draft.id, expected: draft.expected, expectedStatus: draft.expectedStatus, title: draft.title.trim(), workspaceScope: draft.workspaceScope, ...(draft.purpose === 'custom' ? { prompt: draft.prompt.trim() } : {}) };
        if (draft.changeTime) update.change = { kind: draft.rule === 'every_seconds' ? 'every' : draft.rule, ...taskTiming(draft) };
        const receipt = await api.automationRequest(update, signal);
        const current = await api.automationRequest({ action: 'read', sessionId: draft.sessionId, id: draft.id }, signal);
        // CAS 的完整原生记录来自 read，不从带 catalog 元数据的卡片拼装。
        if (!receipt.record || !current.task || current.status !== draft.expectedStatus || Object.keys(current.task).length !== Object.keys(receipt.record).length || Object.keys(receipt.record).some(key => JSON.stringify(current.task[key]) !== JSON.stringify(receipt.record[key]))) throw new Error(t('taskReadback'));
        catalog = await api.automationCatalog(signal);
      } else {
        const spec = { ...(draft.purpose === 'custom' ? { title: draft.title.trim(), prompt: draft.prompt.trim() } : {}), ...taskTiming(draft) };
        catalog = await api.createAutomation({ purpose: draft.purpose, spec, workspaceScope: draft.workspaceScope }, resume, signal);
      }
      return () => { setAutomations(catalog); setTaskDraft(null); setTaskRecovery(null); setConfirm(null); };
    }, 'taskSaved');
    const recoverTask = () => run(async () => {
      const recovered = await api.recoverAutomation(operation.current?.controller.signal);
      return () => { setAutomations(recovered.catalog); setTaskRecovery(recovered); if (recovered.recovered) { setTaskDraft(null); setConfirm(null); } };
    });
    const reloadTask = () => run(async () => {
      const value = await api.automationRequest({ action: 'read', sessionId: taskDraft.sessionId, id: taskDraft.id }, operation.current?.controller.signal);
      if (!value.task || value.task.id !== taskDraft.id) throw new Error(t('taskReadback'));
      return () => setTaskDraft(draft => ({ ...draft, expected: value.task, expectedStatus: value.status }));
    });
    const showTaskHistory = (task, before) => run(async () => {
      const value = await api.automationRequest({ action: 'history', sessionId: task.sessionId, id: task.id, limit: 20, ...(before ? { before } : {}) }, operation.current?.controller.signal);
      if (value.id !== task.id || !Array.isArray(value.records)) throw new Error(t('badReply'));
      return () => setTaskHistory({ task, ...value, records: before ? [...taskHistory.records, ...value.records] : value.records });
    });
    const toggleTask = task => run(async () => {
      const signal = operation.current?.controller.signal;
      const current = await api.automationRequest({ action: 'read', sessionId: task.sessionId, id: task.id }, signal);
      if (!current.task || current.legacy || !['active', 'paused'].includes(current.status) || current.status !== task.status) throw new Error(t('taskReadback'));
      // 状态与完整记录来自同一次权威读取，暂停/恢复不复用目录附加字段。
      const action = task.status === 'paused' ? 'resume' : 'pause';
      await api.automationRequest({ action, sessionId: task.sessionId, id: task.id, expected: current.task, expectedStatus: current.status }, signal);
      const catalog = await api.automationCatalog(signal);
      const saved = catalog.tasks.find(item => item.id === task.id && item.sessionId === task.sessionId);
      if (!saved || saved.status !== (action === 'pause' ? 'paused' : 'active')) throw new Error(t('taskReadback'));
      return () => setAutomations(catalog);
    }, 'taskToggled');
    const cancelTask = task => run(async () => {
      const signal = operation.current?.controller.signal;
      const receipt = await api.automationRequest({ action: 'delete', sessionId: task.sessionId, id: task.id }, signal);
      const current = await api.automationCatalog(signal);
      if (receipt.deleted !== true || [...current.tasks, ...current.legacyTasks].some(item => item.id === task.id && item.sessionId === task.sessionId)) throw new Error(t('taskReadback'));
      return () => { setAutomations(current); setConfirm(null); if (taskHistory?.task.id === task.id) setTaskHistory(null); };
    }, 'taskCancelled');
    const beijing = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : t('newsUnverified');
    const externalLink = (url, label) => {
      // 来源是外部资料；渲染边界不把非网页协议变成可点击命令。
      try { const parsed = new URL(url); if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label); } catch { /* 非法链接仍显示来源文字，不猜测修正地址。 */ }
      return h('span', null, label);
    };
    const editNews = field => {
      if (newsEditor) return;
      setNewsEditor(field ? { id: field.id, expectedRevision: field.revision, field: { name: field.name, focus: field.focus, enabled: field.enabled, sources: field.sources.map(source => ({ ...source })) } } : { id: `field-${globalThis.crypto.randomUUID()}`, expectedRevision: 0, field: { name: '', focus: '', enabled: false, sources: [] } });
      setNewsSource({ name: '', url: '', kind: '', region: '' });
    };
    const closesNews = input => {
      const current = newsData?.fields.find(field => field.id === input.id);
      return current?.enabled && (input.action === 'remove' || !input.field.enabled) && !newsData.fields.some(field => field.id !== input.id && field.enabled) && newsData.schedules.some(task => task.status === 'active');
    };
    const persistNews = input => run(async () => {
      const signal = operation.current?.controller.signal;
      try {
        const saved = await api.newsRequest(input, signal);
        const current = await api.newsRequest({ action: 'list' }, signal);
        const field = current.fields.find(item => item.id === input.id);
        if (input.action === 'remove' ? !saved.field.deleted || Boolean(field) : !field || JSON.stringify(field) !== JSON.stringify(saved.field)) throw new Error(t('newsReadback'));
        return () => { setNewsData(current); setNewsEditor(null); setConfirm(null); notify(t(input.action === 'remove' ? 'newsRemoved' : 'newsSaved')); };
      } catch (reason) {
        if (reason.code === 'NEWS_CANCEL_CONFIRM') return () => setConfirm({ kind: 'newsChange', input, last: true });
        // 计划可能已经取消但配置尚未保存；按 owner 回读事实，不补建计划或丢弃草稿。
        let current;
        try { current = await api.newsRequest({ action: 'list' }, signal); } catch { /* 原错误与上次画面保留，等待员工明确回读。 */ }
        return () => { if (current) setNewsData(current); setError(`${t('newsWriteUnknown')}：${reason.message}`); };
      }
    });
    const saveNews = () => {
      const input = { action: 'save', ...newsEditor };
      if (closesNews(input)) { setConfirm({ kind: 'newsChange', input, last: true }); return; }
      return persistNews(input);
    };
    const reloadNewsEditor = () => run(async () => {
      const value = await api.newsRequest({ action: 'list' }, operation.current?.controller.signal);
      const current = value.fields.find(field => field.id === newsEditor.id);
      if (!current) throw new Error(t('newsReadback'));
      return () => { setNewsData(value); setNewsEditor(editor => ({ ...editor, expectedRevision: current.revision })); };
    });
    const readNewsReport = (fieldId, cutoff, name) => run(async () => {
      const value = await api.newsRequest({ action: 'report', fieldId, cutoff }, operation.current?.controller.signal);
      return () => setNewsReport({ fieldId, cutoff, name, report: value.report });
    });
    const readNewsHistory = (field, before) => run(async () => {
      const value = await api.newsRequest({ action: 'reports', fieldId: field.id, ...(before ? { before } : {}) }, operation.current?.controller.signal);
      return () => setNewsHistory({ field, reports: before ? [...newsHistory.reports, ...value.reports] : value.reports, nextBefore: value.nextBefore });
    });
    const openNewsSettings = () => run(async () => {
      const value = await api.newsRequest({ action: 'list' }, operation.current?.controller.signal);
      return () => { setNewsData(value); setNewsSettings(true); };
    });
    const closeNewsSettings = () => run(async () => {
      const value = await api.newsRequest({ action: 'home' }, operation.current?.controller.signal);
      return () => { setNewsHome(value); setNewsSettings(false); };
    });

    const newSession = (roleId, navigate) => run(async () => {
      const id = await api.createExpert(roleId, { cwd, workspaceId, mode });
      let sourceError;
      if (navigate && includeSource) {
        try { await api.request(id, { action: 'status' }); await api.request(id, { action: 'source_add', sessionId: id }); }
        catch (reason) { sourceError = reason; }
      }
      // 创建产生的身份始终保留；登记失败不会诱发重复创建。
      return () => {
        setCreatedSession(id);
        if (sourceError) notify(`${t('sourceRegisterFailed')} (${id}): ${sourceError.message}`, { kind: 'error', ...(navigate ? {} : { action: { label: t('openCreated'), run: () => api.open(id) } }) });
        if (navigate) api.open(id);
      };
    });
    const scope = h('details', { className: 'yj-section' }, h('summary', null, t('advanced')),
      row(field('project', cwd, setCwd), h('label', { className: 'yj-field' }, t('workspace'), h('select', { value: workspaceId, disabled: busy || Boolean(cwd.trim()), onChange: (event) => setWorkspaceId(event.target.value) }, h('option', { value: '' }, t('defaultWorkspace')), ...(workspaces.items || []).map((item) => h('option', { value: item.workspaceId, key: item.workspaceId }, item.name || item.path || item.workspaceId))))));

    // 只渲染 Host 同一语法树提供的语义节点；客户端没有第二套 Markdown/链接解释。
    const markdown = (node, index = 0) => {
      if (!node) return null;
      const props = { key: index, 'data-note-line': node.line };
      const children = node.children?.map(markdown);
      if (node.type === 'text') return node.value;
      if (node.type === 'knowledgeLink') return h('button', { ...props, type: 'button', disabled: busy || dirty, onClick: () => openLink(`whalewing-link/${node.index}.md`) }, node.value);
      if (node.type === 'link') return /^(?:https?:\/\/|mailto:)/i.test(node.url) ? h('a', { ...props, href: node.url, target: '_blank', rel: 'noreferrer noopener' }, node.value) : node.value;
      if (node.type === 'heading') return h(`h${node.level}`, props, children);
      if (node.type === 'code') return h('pre', props, h('code', null, node.value));
      if (node.type === 'inlineCode') return h('code', props, node.value);
      if (node.type === 'list') return h(node.ordered ? 'ol' : 'ul', { ...props, ...(node.ordered ? { start: node.start } : {}) }, children);
      if (node.type === 'listItem') return h('li', props, typeof node.checked === 'boolean' && h('input', { type: 'checkbox', checked: node.checked, disabled: true }), children);
      if (node.type === 'table') return h('div', { ...props, className: 'yj-table' }, h('table', null,
        h('thead', null, h('tr', null, ...node.children[0].children.map((cell, i) => h('th', { key: i, scope: 'col' }, cell.children.map(markdown))))), h('tbody', null, children.slice(1))));
      const tags = { root: 'div', group: 'span', paragraph: 'p', blockquote: 'blockquote', strong: 'strong', emphasis: 'em', delete: 'del', thematicBreak: 'hr', break: 'br', tableRow: 'tr', tableCell: 'td', footnoteDefinition: 'aside' };
      const tag = tags[node.type];
      return tag ? h(tag, props, ...(tag === 'hr' || tag === 'br' ? [] : [children])) : null;
    };
    const activePaths = contextExplicit ? selectedPaths : note ? [note.path] : [];
    const openAssistant = async proposal => {
      let acquired;
      try {
        await run(async () => {
          const id = await api.ensureAssistant();
          operation.current.controller.signal.throwIfAborted();
          const reference = assistantReference?.sessionId === id ? assistantReference : (acquired = api.retain(id));
          setAssistantId(id); setAssistantReference(reference); setAssistantForm('float'); acquired = undefined;
          if (typeof proposal === 'string') await api.proposeDiscussion(reference, proposal, operation.current.controller.signal);
        }, typeof proposal === 'string' ? 'draftPrepared' : undefined);
      } finally { acquired?.release(); }
    };
    useEffect(() => {
      api.setAssistantContext(assistantId, activePaths);
      return () => api.setAssistantContext('', []);
    }, [assistantId, JSON.stringify(activePaths)]);
    let graphView;
    if (graph) {
      const paged = graph.offset > 0 || graph.total > graph.nodes.length;
      graphView = h('section', { className: 'yj-graph-workspace', 'aria-label': t(graphCenter ? 'localGraph' : 'graph') },
        graph.nodes.length ? h(GraphCanvas, { graph, selectedPath: path, disabled: busy || dirty, onOpenNote: selectNote, label: t(graphCenter ? 'localGraph' : 'graph'), resetLabel: t('resetGraph'), subscribeTheme: api.subscribeTheme, loadingLabel: graphLoadingLabel.current, canvasErrorLabel: t('graphCanvasError'), dataErrorLabel: t('graphDataError') }) : h('div', { className: 'yj-graph-empty' }, help('graphEmpty')),
        missingGraph && h('div', { className: 'yj-graph-missing', role: 'status' }, h('h3', null, missingGraph.title), help('missingGraphNote'), h('h4', null, t('missingGraphSources')),
          ...missingGraph.sources.map(source => h('div', { key: `${source.path}:${source.line}` }, h('button', { type: 'button', disabled: busy || dirty, onClick: () => selectNote({ path: source.path, targetLine: source.line }) }, `${source.title} · ${source.line}`))), button('closePanel', () => setMissingGraph(null))),
        // 完整单页只呈现画布；有界响应确有省略时才说明范围，不将局部图冒称全库。
        (paged || graph.omittedEdges > 0) && h('div', { className: 'yj-graph-controls', 'aria-label': t('graphRange') },
          paged && button('previous', () => loadGraph(graphCenter, Math.max(0, graph.offset - status.limits.maxGraphNodes)), graph.offset === 0),
          paged && h('span', null, t('graphPage', { from: graph.nodes.length ? graph.offset + 1 : 0, to: graph.offset + graph.nodes.length, total: graph.total })),
          paged && button('next', () => loadGraph(graphCenter, graph.offset + graph.nodes.length), graph.offset + graph.nodes.length >= graph.total || !graph.nodes.length),
          graph.omittedEdges > 0 && h('span', { title: t('graphOmitted', { count: graph.omittedEdges }) }, t('graphPartial'))));
    }
    let body;
    if (tab === 'experts') body = h('section', { className: 'yj-experts' },
      h('div', { className: 'yj-team-heading yj-team-settings' },
        h('details', { className: 'yj-compact-settings' }, h('summary', null, t('advanced')),
          h('label', { className: 'yj-field' }, t('mode'), h('select', { 'aria-label': t('mode'), value: mode, disabled: busy, onChange: event => setMode(event.target.value) }, h('option', { value: '' }, t('defaultMode')), ...modes.map(item => h('option', { key: item.id, value: item.id, disabled: Boolean(item.broken) }, item.name ?? item.id)))), scope,
          h('label', { className: 'yj-check' }, h('input', { type: 'checkbox', checked: includeSource, disabled: busy, onChange: event => setIncludeSource(event.target.checked) }), t('includeSource')))),
      h('div', { className: 'yj-grid' }, ...roleCards.map(role => h('article', { className: 'yj-card', key: role.id },
        h('div', { className: 'yj-card-top' }, h(Avatar, { expert: role, size: 44 }), h('div', { className: 'yj-card-identity' }, h('h2', null, role.name), !role.builtin && h('small', { className: 'yj-muted' }, t('expertCustom'))),
          h(ActionMenu, { label: `${role.name} · ${t('expertOptions')}`, iconOnly: true }, button('editExpert', () => setExpertEditor(role)), button(role.builtin ? 'resetExpert' : 'deleteExpert', () => setConfirm({ kind: 'expert', id: role.id })))), h('p', null, role.description),
        button('start', () => newSession(role.id, true), dirty, { className: 'yj-card-start' }),
        )),
        h('button', { type: 'button', className: 'yj-card yj-add-card', onClick: () => setExpertEditor(null) }, h('span', { className: 'yj-add-mark', 'aria-hidden': true }, '+'), h('h2', null, t('addExpert')))),
      registry.deleted.length > 0 && h('details', { className: 'yj-section' }, h('summary', null, t('deletedExperts'), ` (${registry.deleted.length})`), ...registry.deleted.map(expert => h('div', { key: expert.id, className: 'yj-row' }, expert.name, button('restoreExpert', () => run(async () => { await api.expertRequest({ action: 'restore', id: expert.id, expectedRevision: expert.revision }); await api.loadExperts(); return () => notify(t('expertRestoreDone', { name: expert.name })); }))))),
      (() => {
        const role = confirm?.kind === 'expert' && roleCards.find(item => item.id === confirm.id);
        if (!role) return null;
        const confirmAction = () => run(async () => { const saved = await api.expertRequest({ action: role.builtin ? 'restore' : 'remove', id: role.id, expectedRevision: role.revision }); const actual = await api.loadExperts(); if (role.builtin && !actual.experts.some(item => item.id === saved.expert.id && item.revision === saved.expert.revision)) throw new Error(t('badReply')); return () => { setConfirm(null); notify(t(role.builtin ? 'expertResetDone' : 'expertDeleteDone', { name: role.name })); }; });
        return h(ConfirmDialog, { title: t(role.builtin ? 'expertResetTitle' : 'expertDeleteTitle'), message: [h('p', { key: 'q' }, t(role.builtin ? 'expertConfirmReset' : 'expertConfirmDelete')), h('p', { key: 'h' }, t(role.builtin ? 'expertResetHelp' : 'expertDeleteHelp'))], confirmLabel: t(role.builtin ? 'resetExpert' : 'deleteExpert'), cancelLabel: t('cancel'), danger: !role.builtin, busy, onConfirm: confirmAction, onCancel: () => setConfirm(null) });
      })());
    if (tab === 'knowledge') body = h('section', { className: 'yj-knowledge' },
      h('div', { className: 'yj-knowledge-toolbar' },
        h('label', { className: 'yj-search' }, h(Glyph, { name: 'search', size: 16 }), h('input', { 'aria-label': t('query'), placeholder: t('searchPlaceholder'), value: query, disabled: busy, onChange: event => setQuery(event.target.value), onKeyDown: event => { if (event.key === 'Enter') run(async () => { const value = await refreshNotes(); return () => applyNotes(value); }); } })),
        button('search', () => run(async () => { const value = await refreshNotes(); return () => applyNotes(value); }), !status?.initialized, { className: 'yj-ghost' }),
        button('newNote', newNote, !status?.initialized || dirty || Boolean(readbackPath), { className: 'yj-ghost' }),
        button('graph', () => loadGraph(''), !status?.initialized || dirty || conflict || Boolean(readbackPath), { className: 'yj-ghost' }),
        h(ActionMenu, { label: t('libraryTools'), iconOnly: true }, button('localGraph', () => loadGraph(note.path), !note || dirty || conflict || Boolean(readbackPath)), button('validate', () => run(async () => { const value = await command('validate'); return () => setValidation(value); }), !status?.initialized),
          h('details', null, h('summary', null, t('restore')), row(field('restorePath', restorePath, setRestorePath), button('restore', () => run(async () => { await command('restore', { path: restorePath, expectedHash: '' }); const value = await readAfterMutation(restorePath); const refreshed = await refreshAfterMutation(); return () => { setNote(value); setPath(value.path); setContent(value.content); setConflict(false); setEditing(false); setGraph(null); graphRequest.current = null; applyRefreshed(refreshed); }; }, 'restored'), !status?.initialized || !restorePath.trim() || dirty || Boolean(readbackPath) || Boolean(note?.readOnly && note.path === restorePath)))),
          h('details', null, h('summary', null, t('root')), status ? h('p', null, status.root, status.locationNotice && h('span', null, status.locationNotice)) : help('preparing')))),
      validation && h(Modal, { title: t('validation'), onClose: () => setValidation(null), className: 'yj-confirm' }, h('div', { className: 'yj-confirm-body' }, h('p', null, t(validation.valid ? 'valid' : 'invalid', { count: validation.notes })), ...(validation.issues || []).map((issue, i) => h('p', { key: i }, issue))), h('footer', { className: 'yj-dialog-actions' }, button('closePanel', () => setValidation(null), false, { className: 'yj-primary' }))),
      // search 的截断只描述当前搜索列表，不代表独立目录或图谱缺失数据。
      Boolean(query.trim()) && notes.length > 0 && truncated && help('truncated'),
      h('div', { className: 'yj-knowledge-split', ref: directorySplit.frame, style: { '--yj-directory-width': `${directorySplit.width}px` } }, h('aside', { className: 'yj-note-tree', 'aria-label': t('notes') },
        query.trim() ? notes.length ? notes.map(item => h('div', { key: item.path, className: 'yj-note-row' },
          h('input', { type: 'checkbox', checked: selectedPaths.includes(item.path), 'aria-label': t('selectForQuestion', { name: item.title || item.path }), disabled: busy || (!selectedPaths.includes(item.path) && selectedPaths.length >= 12), onChange: event => { setContextExplicit(true); setSelectedPaths(event.target.checked ? [...selectedPaths, item.path] : selectedPaths.filter(value => value !== item.path)); } }),
          h('button', { type: 'button', className: 'yj-note', disabled: busy || dirty, title: `${item.title || item.path}\n${item.path}`, onClick: () => selectNote(item) }, h('span', { className: 'yj-tree-title' }, item.title || item.path)))) : help('emptyNotes') : h(Directory, { api, t, selected: path, disabled: busy || dirty, onSelect: selectNote, selectedPaths, version: directoryVersion, onToggle: (name, selected) => { setContextExplicit(true); setSelectedPaths(value => selected ? [...value, name] : value.filter(path => path !== name)); } })),
        h('div', { ...directorySplit.separator, className: 'yj-directory-separator', 'aria-label': t('directoryResize') }),
        h('div', { className: graphView ? 'yj-note-canvas yj-graph-mode' : 'yj-note-canvas' }, graphView || h(React.Fragment, null, h('div', { className: 'yj-note-toolbar' }, h('details', { className: 'yj-note-path', open: editing }, h('summary', { title: path }, h(Glyph, { name: 'file', size: 14 }), path.split('/').at(-1) || t('noteDetails')), field('notePath', path, setPath, { readOnly: Boolean(note || readbackPath) })),
          row(button('read', () => note ? setEditing(false) : selectNote({ path }), !path.trim() || dirty), button('edit', () => { if (!note?.readOnly) setEditing(true); }, !status?.initialized || Boolean(note?.readOnly)), button('back', () => selectNote(history.current.at(-1), true), !history.current.length || dirty)),
            dirty && h('span', { className: 'yj-draft-chip', role: 'status' }, t('draftDirty'), h('button', { type: 'button', onClick: () => setConfirm({ kind: 'draft' }) }, t('discard')))),
          note?.readOnly && h('div', { className: 'yj-notice', role: 'status' }, t('noteReadOnly')),
          editing ? h('label', null, t('content'), h('textarea', { 'aria-label': t('content'), value: content, disabled: busy || !status?.initialized, onChange: (event) => setContent(event.target.value), spellCheck: false })) : note ? h('div', { className: 'yj-reader', 'aria-label': t('reading') },
            location > 1 && h('div', { className: 'yj-location' }, h('h3', null, t('locate', { line: location })), h('pre', null, note.content.replace(/\r\n/g, '\n').split('\n').slice(location - 1, location + 5).join('\n')), button('clearLocate', () => setLocation(0))),
            markdown(note.view)) : help('selectNote'),
          linkIssue && h('div', { className: 'yj-notice', role: 'status' }, t(linkIssue.status === 'ambiguous' ? 'linkAmbiguous' : linkIssue.status.startsWith('fragment_') ? 'fragmentMissing' : linkIssue.status === 'attachment' ? 'linkAttachment' : linkIssue.status === 'invalid' ? 'invalidLink' : 'linkMissing'), `：${linkIssue.target}`,
            ...linkIssue.candidates.map(candidate => h('button', { type: 'button', key: candidate, disabled: busy || dirty, onClick: () => selectNote({ path: candidate }) }, candidate)), linkIssue.candidateTotal > linkIssue.candidates.length && help('truncated'), linkIssue.path && button('read', () => selectNote({ path: linkIssue.path }), dirty)),
          note?.relationsIssue && h('div', { className: 'yj-notice', role: 'status' }, t('relationsUnavailable'), `：${note.relationsIssue}`),
          note && !note.relationsIssue && h('details', null, h('summary', null, t('outgoing')), ...(note.links || []).map((link, i) => h('div', { key: i }, h('button', { type: 'button', disabled: busy || dirty, onClick: () => openLink(`whalewing-link/${i}.md`) }, link.label), ` · ${link.status}`))),
          note && !note.relationsIssue && h('details', { className: 'yj-backlinks' }, h('summary', null, t('backlinks')), note.backlinks?.length ? note.backlinks.map((link, i) => h('button', { type: 'button', key: i, disabled: busy || dirty, onClick: () => selectNote({ path: link.path, targetLine: link.line }) }, `${link.title} · ${link.line}`)) : help('noBacklinks'), note.totalBacklinks > note.backlinks?.length && help('truncated')),
          editing && help('draftWarning'),
          h('details', { className: 'yj-note-actions', open: editing || conflict || Boolean(readbackPath) }, h('summary', null, t('more')), row(button('save', () => run(async () => {
            const saved = await command('write', { path, content, expectedHash: note?.hash || '' });
            const value = await readAfterMutation(path); const refreshed = await refreshAfterMutation();
            if (saved.hash !== value.hash) throw Object.assign(new Error(t('conflict')), { code: 'conflict', notePath: path });
            return () => { setNote(value); setPath(value.path); setContent(value.content); setConflict(false); setGraph(null); graphRequest.current = null; applyRefreshed(refreshed); };
          }, 'saved'), !status?.initialized || !path.trim() || Boolean(readbackPath) || Boolean(note?.readOnly)),
          button('reload', () => selectNote({ path: readbackPath || path }), !readbackPath && (!path.trim() || !conflict)),
          h('a', { download: path.split(/[\\/]/).at(-1) || 'note.md', href: `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}` }, t('export')),
          button('remove', () => { if (!note?.readOnly) setConfirm({ kind: 'note', path }); }, !note || dirty || Boolean(readbackPath) || Boolean(note?.readOnly)))),
          (conflict || readbackPath) && help('reloadHelp'),
           confirm?.kind === 'note' && h(ConfirmDialog, { title: t('noteRemoveTitle'), message: t('confirmRemove'), confirmLabel: t('remove'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => run(async () => { await command('remove', { path: note.path, expectedHash: note.hash }); const refreshed = await refreshAfterMutation(); return () => { setNote(null); setPath(''); setContent(''); setConflict(false); setConfirm(null); setGraph(null); graphRequest.current = null; applyRefreshed(refreshed); }; }, 'deleted') })))),
);
    if (tab === 'skills') body = h('section', { className: 'yj-skill-library' }, row(h('h2', null, t('skillLibrary')), button('newSkill', () => setSkillEditor(null)), button('refine', () => openAssistant(t('refinePrompt')), dirty)),
      h('div', { className: 'yj-split' }, h('div', { className: 'yj-list' }, skills.length ? skills.map((item) => h('button', { type: 'button', className: 'yj-note', key: item.id, disabled: busy || !item.actions.includes('read'), onClick: () => run(async () => { const value = await skillCommand('read', { id: item.id }); if (!value.entry) throw new Error(t('skillMissing')); return () => { setSkill(value.entry); setConfirm(null); }; }) }, item.name, h('small', { title: item.discovery === 'catalogued' ? t('skillHelp') : undefined }, t(item.origin), item.state && ` · ${t(item.state)}`, ` · ${t(item.discovery)}`), h('small', { className: 'yj-clamp', title: item.description }, item.description), item.issue && h('span', { className: 'yj-error' }, `${t('skillIssue')}: ${item.issue}`))) : help('emptySkills'), row(button('previous', () => pageSkills(skillPages.current.at(-1), 'previous'), !skillPages.current.length), button('next', () => pageSkills(skillPage.offset + skills.length, 'next'), !skillPage.truncated || !skills.length))),
        skill ? h('div', null, h('h3', null, skill.name), row(skill.actions.includes('update') && button('editSkill', () => run(async () => { const current = await api.resolveSkillEdit(skill, operation.current.controller.signal); if (!current) throw new Error(t('skillMissing')); return () => setSkillEditor(current); })), ...['remove', 'reset'].filter(action => skill.actions.includes(action)).map(action => button(action === 'remove' ? 'removeSkill' : 'resetSkill', () => setConfirm({ kind: `skill-${action}`, id: skill.id })))),
          skill.origin === 'evolution' && button('skillEdit', () => openAssistant(t('skillEditPrompt', { reference: JSON.stringify({ name: skill.name, state: skill.state, hash: skill.hash }) }))), skill.issue && h('div', { className: 'yj-notice yj-error', role: 'status' }, `${t('skillIssue')}: ${skill.issue}`), h('pre', null, skill.content), skill.sourcePaths && h('h3', null, t('sourcePaths')), h('ul', null, ...(skill.sourcePaths || []).map((source) => h('li', { key: source }, source))),
          ['remove', 'reset'].map(action => confirm?.kind === `skill-${action}` && confirm.id === skill.id && h(ConfirmDialog, { key: action, title: t(action === 'remove' ? 'skillRemoveTitle' : 'skillResetTitle'), message: t(action === 'remove' ? 'skillConfirmRemove' : 'skillConfirmReset'), confirmLabel: t(action === 'remove' ? 'removeSkill' : 'resetSkill'), cancelLabel: t('cancel'), danger: action === 'remove', busy, onCancel: () => setConfirm(null), onConfirm: () => run(async () => { const result = await skillCommand(action, { id: skill.id, expectedHash: skill.hash, ...(skill.baseHash === undefined ? {} : { expectedBaseHash: skill.baseHash }) }); if ((await skillCommand('read', { id: skill.id })).entry !== null) throw new Error(t('skillReadback')); const base = action === 'reset' ? (await skillCommand('read', { id: result.baseId })).entry : null; const value = await skillCommand('list'); return () => { adoptSkills(value); setSkill(base); setConfirm(null); }; }, action === 'remove' ? 'skillRemoved' : 'skillResetDone') })),
          skill.origin === 'evolution' && skill.state !== 'candidate' && row(
          button(skill.state === 'active' ? 'disable' : 'restoreSkill', () => run(async () => { await skillCommand(skill.state === 'active' ? 'disable' : 'restore', { name: skill.name, expectedHash: skill.hash }); const value = await skillCommand('list'); return () => { adoptSkills(value); setSkill(null); setConfirm(null); }; }, 'skillToggled')),
          button('rollbackSkill', () => setConfirm({ kind: 'skill-rollback', name: skill.name, expectedHash: skill.state === 'active' ? skill.hash : skills.find((item) => item.name === skill.name && item.state === 'active')?.hash || '' }))),
          confirm?.kind === 'skill-rollback' && confirm.name === skill.name && h(ConfirmDialog, { title: t('skillRollbackTitle'), message: t('confirmRollback'), confirmLabel: t('confirmRollbackAction'), cancelLabel: t('cancel'), busy, onCancel: () => setConfirm(null), onConfirm: () => run(async () => {
            // 回退以当前 active 的版本为前提，停用文件不是发布前备份。
            const saved = await skillCommand('rollback', { name: skill.name, expectedHash: confirm.expectedHash });
            const restored = await readEvolution(skill.name, 'active');
            if (saved.hash !== restored.hash) throw Object.assign(new Error(t('conflict')), { code: 'conflict' });
            const value = await skillCommand('list');
            return () => { adoptSkills(value); setSkill(restored); setConfirm(null); };
          }, 'skillRolledBack') })) : help('selectSkill')));

    if (tab === 'schedule') {
      const pending = api.pendingAutomation();
      const locked = Boolean(api.automationCacheIssue());
      const knowledgeTasks = automations.tasks.filter(task => task.purpose === 'knowledge');
      const allTasks = [...automations.tasks, ...automations.legacyTasks.map(task => ({ ...task, legacy: true }))];
      const taskKey = task => `${task.sessionId}:${task.id}`;
      const selected = allTasks.find(task => taskKey(task) === selectedTask) || allTasks[0];
      const taskStatus = task => t(task.status === 'active' ? 'taskActive' : task.status === 'paused' ? 'taskPaused' : 'taskInactive');
      const taskActions = task => h(ActionMenu, { label: t('taskActions'), iconOnly: true },
        !task.legacy && automations.controls !== false && ['active', 'paused'].includes(task.status) && button(task.status === 'paused' ? 'taskResume' : 'taskPause', () => toggleTask(task), Boolean(taskDraft)),
        !task.legacy && task.purpose !== 'news' && ['active', 'paused'].includes(task.status) && button('editTask', () => editTask(task), Boolean(taskDraft)),
        button('openTaskSession', () => run(async () => api.openAutomation(task.sessionId))),
        button('taskHistory', () => showTaskHistory(task)),
        button('cancelPlan', () => { setSelectedTask(taskKey(task)); setConfirm({ kind: 'automation', task }); }, Boolean(taskDraft)));
      const patchTask = (key, value, timing = false) => setTaskDraft(draft => ({ ...draft, [key]: value, ...(timing ? { changeTime: true, timeZone: 'Asia/Shanghai' } : {}) }));
      body = h('section', { className: 'yj-schedules' },
        automations.available === false && h('div', { className: 'yj-schedule-off', role: 'status' }, h('div', null, h('strong', null, t('taskUnavailableShort')), help('scheduleUnavailable')), row(button('openPlugins', () => run(async () => api.openPlugins()), false, { className: 'yj-primary' }), button('retry', refreshTab))),
        api.automationCacheIssue() && h('p', { className: 'yj-notice yj-error', role: 'alert' }, api.automationCacheIssue()),
        automations.issues.length > 0 && h('details', { className: 'yj-notice' }, h('summary', null, t('newsDiagnostics')), ...automations.issues.map((issue, i) => h('p', { key: i, className: 'yj-error' }, issue.message))),
        h('div', { className: 'yj-task-split' },
          h('aside', { className: 'yj-task-list', 'aria-label': t('schedule') },
            row(h('h2', null, t('schedule')), button('newTask', () => beginTask('custom'), locked || Boolean(pending) || Boolean(taskDraft))),
            taskDraft && taskDraftHidden && button('taskDraftResume', () => setTaskDraftHidden(false)),
            !automations.tasks.some(task => task.purpose === 'news') && button('newsInitialize', () => run(async () => { const current = await api.automationRequest({ action: 'initializeNews' }, operation.current?.controller.signal); return () => setAutomations(current); })),
            !knowledgeTasks.length && h('article', { className: 'yj-task-template' }, h('h3', null, t('knowledgeTask')), h('small', null, t('taskDisabled')), button('enableTask', () => beginTask('knowledge'), locked || Boolean(pending) || automations.legacyTasks.length > 0 || Boolean(taskDraft))),
            ...allTasks.map(task => h('article', { key: taskKey(task), className: `yj-task-row${selected && taskKey(task) === taskKey(selected) ? ' yj-selected' : ''}` },
              h('button', { type: 'button', className: 'yj-task-select', 'aria-pressed': selected && taskKey(task) === taskKey(selected), onClick: () => { setSelectedTask(taskKey(task)); setTaskHistory(null); } },
                h('span', null, task.title || t(task.legacy ? 'taskLegacy' : 'schedule')), h('small', null, taskStatus(task), ' · ', task.status === 'active' ? beijing(task.scheduledAt) : t('rule_' + (task.kind === 'every' ? 'every_seconds' : task.kind === 'after' ? 'at' : task.kind)))), taskActions(task)))),
          h('div', { className: 'yj-task-main' },
            pending && h('section', { className: 'yj-notice', role: 'status' }, h('h3', null, t('taskPending')), help('taskPendingHelp'),
              row(button('taskRecover', recoverTask), button('openTaskSession', () => run(async () => api.openAutomation(pending.sessionId)))),
              taskRecovery?.pending?.sessionId === pending.sessionId && h(React.Fragment, null, help('taskPendingMissing'), !taskDraft && button('taskDraftResume', () => beginTask(pending.purpose), locked))),
        taskDraft && !taskDraftHidden && h('section', { className: 'yj-task-editor', 'aria-label': t(taskDraft.id ? 'editTask' : 'newTask') },
          h('h2', null, t(taskDraft.id ? 'editTask' : taskDraft.purpose === 'knowledge' ? 'knowledgeTask' : 'newTask')),
          taskDraft.purpose === 'knowledge' && help('taskScopeHelp'), help('taskModelHelp'),
          field('taskTitle', taskDraft.title, value => patchTask('title', value), { disabled: busy || taskDraft.purpose === 'knowledge' && !taskDraft.id }),
          taskDraft.purpose === 'custom' && h('label', { className: 'yj-field' }, t('taskPrompt'), h('textarea', { value: taskDraft.prompt, disabled: busy, onChange: event => patchTask('prompt', event.target.value) })),
          h(WorkspacePicker, { items: workspaces.items || [], scope: taskDraft.workspaceScope, disabled: busy, t, onChange: value => patchTask('workspaceScope', value) }),
          help(taskDraft.purpose === 'knowledge' ? 'workspaceScopeHelp' : 'customWorkspaceHelp'),
          taskDraft.purpose !== 'news' && h('label', { className: 'yj-field' }, t('taskRule'), h('select', { value: taskDraft.rule, disabled: busy, onChange: event => patchTask('rule', event.target.value, true) },
            ...['after_seconds', 'at', 'every_seconds', 'daily', 'weekly', 'cron'].filter(rule => !taskDraft.id || rule !== 'after_seconds').map(rule => h('option', { key: rule, value: rule }, t('rule_' + rule))))),
          ['after_seconds', 'every_seconds'].includes(taskDraft.rule) && field('taskSeconds', taskDraft.seconds, value => patchTask('seconds', value, true), { type: 'number' }),
          taskDraft.rule === 'at' && field('taskAt', taskDraft.at, value => patchTask('at', value, true)),
          taskDraft.purpose !== 'news' && ['daily', 'weekly'].includes(taskDraft.rule) && h('div', { className: 'yj-task-time' }, field('time', taskDraft.time, value => patchTask('time', value, true), { type: 'time', step: '60' }), h('span', { className: 'yj-muted' }, taskDraft.timeZone === 'Asia/Shanghai' ? t('beijingTime') : t('legacyTimeZone', { zone: taskDraft.timeZone })), taskDraft.timeZone !== 'Asia/Shanghai' && button('convertBeijingTime', () => patchTask('timeZone', 'Asia/Shanghai', true))),
          taskDraft.rule === 'weekly' && field('taskWeekdays', taskDraft.weekdays, value => patchTask('weekdays', value, true)),
          taskDraft.rule === 'cron' && h('div', { className: 'yj-task-time' }, field('taskExpression', taskDraft.expression, value => patchTask('expression', value, true)), h('span', { className: 'yj-muted' }, taskDraft.timeZone === 'Asia/Shanghai' ? t('beijingTime') : t('legacyTimeZone', { zone: taskDraft.timeZone })), taskDraft.timeZone !== 'Asia/Shanghai' && button('convertBeijingTime', () => patchTask('timeZone', 'Asia/Shanghai', true))),
          row(button(taskDraft.id ? 'saveTask' : pending ? 'taskContinue' : 'submitTask', () => saveTask(Boolean(pending)), !taskDraft.title.trim() || taskDraft.purpose === 'custom' && !taskDraft.prompt.trim() || Boolean(pending) && taskRecovery?.pending?.sessionId !== pending.sessionId),
            taskDraft.id && button('taskReload', reloadTask), button('taskDraftClose', () => setTaskDraftHidden(true)), button('taskDiscard', () => setConfirm({ kind: 'taskDraft' }))),
          confirm?.kind === 'taskDraft' && h(ConfirmDialog, { title: t('taskDiscard'), message: t('taskDiscardConfirm'), confirmLabel: t('taskDiscard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setTaskDraft(null); setConfirm(null); notify(t('draftDiscarded')); } })),
            (!taskDraft || taskDraftHidden) && (selected ? h('section', { className: 'yj-task-detail' },
              h('div', { className: 'yj-team-heading' }, h('div', null, h('h2', null, selected.title || t('schedule')), h('p', { className: 'yj-muted' }, [taskStatus(selected), selected.timeZone && selected.timeZone !== 'Asia/Shanghai' && selected.timeZone].filter(Boolean).join(' · '))), button('openTaskSession', () => run(async () => api.openAutomation(selected.sessionId)))),
              selected.status === 'active' && h('p', { className: 'yj-muted' }, t('taskTime'), ' · ', beijing(selected.scheduledAt)),
              selected.purpose !== 'news' && h('p', { className: 'yj-task-prompt' }, selected.displayPrompt ?? selected.prompt),
              selected.purpose === 'news' && button('news', () => { switchTab('news'); return loadTab('news'); }),
              selected.legacy && help('taskLegacyHelp'),
              h('details', null, h('summary', null, t('taskDetails')), help('scheduleHelp'), help('taskModelHelp'), help('taskStatusHelp')))
              : h('div', { className: 'yj-task-empty' }, h(Glyph, { name: 'spark', size: 28 }), h('h2', null, t('taskSelect')))),
            confirm?.kind === 'automation' && h(ConfirmDialog, { title: t('cancelPlan'), message: t('cancelPlanHelp'), confirmLabel: t('cancelPlan'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => cancelTask(confirm.task) }),
            taskHistory && h('section', { className: 'yj-section', 'aria-label': t('taskHistory') }, h('h2', null, taskHistory.task.title || t('taskHistory')), help('historyHelp'),
              taskHistory.records.length ? taskHistory.records.map((record, i) => h('details', { key: record.messageId || i }, h('summary', null, record.deliveredAt || t('historyDetails')), h('p', null, record.prompt), h('small', null, record.messageId))) : help('noHistory'),
              (taskHistory.earlierRecordsUnavailable || taskHistory.earlierRecordsPruned) && help('historyEarlier'),
              row(taskHistory.nextBefore && button('historyMore', () => showTaskHistory(taskHistory.task, taskHistory.nextBefore)), button('closePanel', () => setTaskHistory(null)))))));
    }

    if (tab === 'news') {
      const choices = [...new Map([...(newsData?.defaults.sources || []), ...(newsData?.fields || []).flatMap(field => field.sources), ...(newsEditor?.field.sources || [])].map(source => [source.url, source])).values()];
      const patchNews = (key, value) => setNewsEditor(editor => ({ ...editor, field: { ...editor.field, [key]: value } }));
      const toggleSource = source => patchNews('sources', newsEditor.field.sources.some(item => item.url === source.url) ? newsEditor.field.sources.filter(item => item.url !== source.url) : [...newsEditor.field.sources, { ...source }]);
      // 知识卡片首页：今日学习与每日资讯共用一套“卡片架”——同样的表头、卡片底板、角标与悬停反馈。学习是书卡（书脊 + 叠页），资讯是标题卡（类别图标 + 来源徽记），只放标题，点开在弹框里读。
      const newsAccents = { model: '#6366f1', agent: '#0d9488', opensource: '#d97706', media: '#db2777', research: '#0284c7' }, learningAccents = { 管理: '#4f46e5', 经济: '#0f766e', 'AI 工具技巧': '#9333ea' };
      const newsIcons = { model: 'chip', agent: 'bot', opensource: 'code', media: 'image', research: 'flask' }, brand = 'var(--dsw-alias-brand-primary)';
      const accent = item => newsAccents[item.category] ?? brand;
      const monoColors = ['#2563eb', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#0284c7', '#65a30d', '#e11d48'];
      const monoColor = name => monoColors[[...(name || '')].reduce((sum, char) => (sum * 31 + char.codePointAt(0)) >>> 0, 7) % monoColors.length];
      const dayOf = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(value));
      const when = value => {
        if (!value) return '';
        const day = dayOf(value), clock = beijing(value).slice(11, 16);
        return day === dayOf(Date.now()) ? `${t('newsToday')} ${clock}` : day === dayOf(Date.now() - 86400000) ? `${t('newsYesterday')} ${clock}` : `${day.slice(5).replace('-', '/')} ${clock}`;
      };
      const pressable = open => ({ role: 'button', tabIndex: 0, onClick: open, onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } } });
      const shelfHead = (icon, eyebrow, title, meta, actions) => h('div', { className: 'yj-shelf-head' },
        h('div', null, h('p', { className: 'yj-shelf-eyebrow' }, h(Glyph, { name: icon, size: 14 }), eyebrow), h('h3', null, title), meta && h('small', { className: 'yj-muted' }, meta)),
        actions && h('div', { className: 'yj-row' }, ...actions));
      const tileTop = (icon, kicker, ...extra) => h('div', { className: 'yj-tile-top' }, h('span', { className: 'yj-tile-icon', 'aria-hidden': true }, h(Glyph, { name: icon, size: 15 })), h('span', { className: 'yj-tile-kicker' }, kicker), ...extra);
      const newsFlag = item => item.label === 'leak' ? h('span', { className: 'yj-brief-flag' }, t('newsLeak')) : item.label === 'media' ? h('span', { className: 'yj-brief-flag yj-brief-flag-media' }, t('newsMediaOnly')) : null;
      const newsKicker = item => item.category ? t(`newsCat_${item.category}`) : t('newsKicker');
      const newsCard = (report, item, i, total) => {
        const source = item.sources[0], name = source?.source.name;
        return h('article', { key: item.eventKey, className: 'yj-tile yj-news-tile', style: { '--yj-accent': accent(item) }, ...pressable(() => setNewsItem({ item, index: i, total, fieldName: report.fieldName })) },
          tileTop(newsIcons[item.category] ?? 'news', newsKicker(item), newsFlag(item), h('span', { className: 'yj-tile-num', 'aria-hidden': true }, String(i + 1).padStart(2, '0'))),
          h('h4', { className: 'yj-tile-title' }, item.title),
          h('div', { className: 'yj-tile-foot' },
            h('span', { className: 'yj-tile-source' }, name && h('span', { className: 'yj-tile-mono', style: { '--yj-mono': monoColor(name) }, 'aria-hidden': true }, name.trim().charAt(0).toUpperCase()), h('span', null, [name, when(source?.publishedAt)].filter(Boolean).join(' · '))),
            h('span', { className: 'yj-tile-go', 'aria-hidden': true }, '→')));
      };
      const reportView = report => {
        const key = `${report.fieldId}:${report.cutoff}`, items = report.items.slice(0, 8), expanded = Boolean(newsExpanded[key]);
        return h('section', { className: 'yj-shelf', key },
          shelfHead('news', t('newsDaily'), report.fieldName, [t('newsCutoff', { time: beijing(report.cutoff).slice(0, 16) }), items.length > 0 && t('newsCount', { count: items.length }), report.status !== 'complete' && t(report.status === 'partial' ? 'newsPartial' : 'newsEmpty')].filter(Boolean).join(' · '),
            [button('newsDiagnostics', () => setNewsRun(report)), button('newsReports', () => readNewsHistory({ id: report.fieldId, name: report.fieldName }))]),
          items.length > 0 && h('div', { className: 'yj-shelf-grid yj-shelf-news' }, ...items.slice(0, expanded ? 8 : 4).map((item, i) => newsCard(report, item, i, items.length))),
          items.length > 4 && h('button', { type: 'button', className: 'yj-brief-more', 'aria-expanded': expanded, title: t('newsMoreLabel'), onClick: () => setNewsExpanded(state => ({ ...state, [key]: !expanded })) },
            expanded ? t('newsLess') : t('newsMore', { count: items.length - 4 }), h('span', { className: 'yj-brief-chevron', 'aria-hidden': true })));
      };
      // 阅读时长按中文约 450 字 / 分钟、英文约 220 词 / 分钟估算。
      const minutes = card => Math.max(1, Math.round(card.sections.flatMap(section => section.paragraphs).join('').length / 450 + (card.article.language === 'en' ? card.article.body.split(/\s+/).length / 220 : card.article.body.length / 450)));
      const learningDate = date => { const [year, month, day] = date.split('-').map(Number); return t('learningDate', { month, day, week: '日一二三四五六'[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] }); };
      const learningAccent = card => learningAccents[card.category] ?? brand;
      const learningShelf = learning => h('section', { className: 'yj-shelf' },
        shelfHead('book', t('newsLearning'), learningDate(learning.date), t('learningMeta', { count: learning.cards.length, minutes: learning.cards.reduce((sum, card) => sum + minutes(card), 0) })),
        h('div', { className: 'yj-shelf-grid yj-shelf-books' }, ...learning.cards.map(card => h('article', { className: 'yj-tile yj-book-tile', key: card.id, style: { '--yj-accent': learningAccent(card) }, ...pressable(() => setLearningArticle(card)) },
          tileTop('book', card.category, card.review && h('span', { className: 'yj-tile-badge' }, t('newsLearningReview'))),
          h('h4', { className: 'yj-tile-title' }, card.title),
          h('p', { className: 'yj-tile-text' }, card.concept),
          card.recommendation.kind === 'knowledge' && h('p', { className: 'yj-tile-note' }, card.recommendation.reason),
          h('div', { className: 'yj-tile-foot' },
            h('span', { className: 'yj-tile-source' }, h(Glyph, { name: 'clock', size: 13 }), h('span', null, t('learningMinutes', { minutes: minutes(card) }), ' · ', t('learningPoints', { count: card.highlights.length }))),
            h('span', { className: 'yj-tile-go', 'aria-hidden': true }, t('learningOpen'), ' →'))))));
      const learningBook = card => h(BookReader, { title: card.title, accent: learningAccent(card), t, onClose: () => setLearningArticle(null) },
        h('section', { className: 'yj-book-cover' },
          h('p', { className: 'yj-book-kicker' }, h(Glyph, { name: 'book', size: 15 }), card.category, card.review && ` · ${t('newsLearningReview')}`),
          h('h1', { 'data-book-toc': t('bookCover') }, card.title),
          h('p', { className: 'yj-book-lede' }, card.concept),
          h('div', { className: 'yj-book-rule', 'aria-hidden': true }),
          h('h4', null, t('learningHighlights')),
          h('ol', { className: 'yj-book-points' }, ...card.highlights.map(point => h('li', { key: point }, point))),
          h('aside', { className: 'yj-book-example' }, h('strong', null, t('learningExample')), h('p', null, card.example)),
          h('p', { className: 'yj-book-meta' }, [t('learningMinutes', { minutes: minutes(card) }), card.source.publisher, card.recommendation.kind === 'knowledge' && card.recommendation.reason].filter(Boolean).join(' · '))),
        ...card.sections.map(section => h('section', { key: section.title, className: 'yj-book-chapter' }, h('h2', { 'data-book-toc': '' }, section.title), ...section.paragraphs.map((paragraph, index) => h('p', { key: index }, paragraph)))),
        h('section', { className: 'yj-book-chapter' }, h('h2', { 'data-book-toc': '' }, t(card.article.language === 'en' ? 'learningOriginalEn' : 'learningOriginalZh')), h('div', { className: 'yj-rendered', lang: card.article.language }, markdown(card.article.view))),
        h('footer', { className: 'yj-book-colophon' }, h('p', { className: 'yj-book-end', 'aria-hidden': true }, '—  ', t('bookEnd'), '  —'),
          h('h3', null, t('learningSource')), h('p', null, externalLink(card.source.url, card.source.title)), h('p', null, card.source.attribution), h('p', null, card.source.usage), h('p', null, externalLink(card.source.licenseUrl, card.source.license))));
      const newsItemView = ({ item, index, total, fieldName }) => h(Modal, { title: item.title, onClose: () => setNewsItem(null) },
        h('div', { className: 'yj-brief-detail', style: { '--yj-accent': accent(item) } },
          h('div', { className: 'yj-brief-meta' }, tileTop(newsIcons[item.category] ?? 'news', newsKicker(item), newsFlag(item), h('span', { className: 'yj-muted' }, fieldName, ' · ', `${index + 1} / ${total}`))),
          item.brief !== undefined
            ? h(React.Fragment, null, h('p', { className: 'yj-brief-lead' }, item.brief), item.relevance && h('section', null, h('h3', null, t('newsRelevance')), h('p', null, item.relevance)))
            : h(React.Fragment, null, h('p', { className: 'yj-brief-lead' }, item.summary), h('section', null, h('h3', null, t('newsImportance')), h('p', null, item.importance)), h('section', null, h('h3', null, t('newsRelevance')), h('p', null, item.relevance)), h('section', null, h('h3', null, t('newsImpact')), h('p', null, item.workImpact))),
          h('footer', { className: 'yj-brief-sources' },
            item.link && h('p', null, h('strong', null, t('newsOriginal')), externalLink(item.link, item.link.replace(/^https:\/\/(www\.)?/, ''))),
            h('h3', null, t('newsSourcesTitle')),
            h('ul', null, ...item.sources.map(source => h('li', { key: source.id }, externalLink(source.url, source.source.name), h('small', { className: 'yj-muted' }, ' · ', beijing(source.publishedAt))))))));
      const newsRunView = report => h(Modal, { title: `${report.fieldName} · ${t('newsDiagnostics')}`, onClose: () => setNewsRun(null) },
        h('div', { className: 'yj-brief-detail' }, h('p', null, t('newsWindow'), ' · ', beijing(report.start), ' — ', beijing(report.cutoff)), h('p', null, report.coverage),
          ...report.sourceStatus.filter(source => source.status === 'failed').map(source => h('p', { key: source.url, className: 'yj-error' }, source.name, ' · ', source.message)),
          button('newsOpenSession', () => run(async () => api.openAutomation(report.sessionId)))));
      body = h('section', { className: 'yj-news' },
        h('header', { className: 'yj-news-header' }, h('h2', null, t(newsSettings ? 'newsSettings' : 'news')), newsSettings ? button('newsSettingsClose', closeNewsSettings) : button('newsSettings', openNewsSettings)),
        !newsSettings && newsHome && h(React.Fragment, null,
          learningShelf(newsHome.learning),
          newsHome.learning.context.status === 'unavailable' && h('p', { className: 'yj-notice', role: 'status' }, newsHome.learning.context.issue),
          learningArticle && learningBook(learningArticle),
          newsHome.reports.length ? newsHome.reports.map(reportView) : h('section', { className: 'yj-shelf' }, shelfHead('news', t('newsDaily'), t('newsReportEmpty')))),
        newsSettings && newsData && h('section', { className: 'yj-news-settings' },
          h('div', { className: 'yj-news-toolbar' }, button('newsConfigureSchedule', () => { switchTab('schedule'); return loadTab('schedule'); }), button('newsSources', () => setNewsAbout(true))),
          h('div', { className: 'yj-grid' }, ...newsData.fields.map(field => h('article', { className: 'yj-card yj-news-field', key: field.id },
            h('div', { className: 'yj-card-top' }, h('div', { className: 'yj-card-identity' }, h('h2', null, field.name), !field.enabled && h('small', { className: 'yj-muted' }, t('taskPaused'))),
              h(ActionMenu, { label: `${field.name} · ${t('newsEdit')}`, iconOnly: true }, button('newsEdit', () => editNews(field), Boolean(newsEditor)), button('newsReports', () => readNewsHistory(field)),
                field.id !== 'ai-technology' && button('newsRemove', () => { const input = { action: 'remove', id: field.id, expectedRevision: field.revision }; setConfirm({ kind: 'newsChange', input, last: closesNews(input) }); }, Boolean(newsEditor)))),
            h('p', { className: 'yj-clamp', title: field.focus }, field.focus),
            newsData.errors[field.id] && h('small', { className: 'yj-error', title: newsData.errors[field.id].message }, t('newsDiagnostics'), '：', newsData.errors[field.id].message),
            button('newsCurrent', () => readNewsReport(field.id, newsData.window.cutoff, field.name), false, { className: 'yj-card-start' }))),
            newsData.fields.length < newsData.limits.maxFields && h('button', { type: 'button', className: 'yj-card yj-add-card', disabled: Boolean(newsEditor), onClick: () => editNews(null) }, h('span', { className: 'yj-add-mark', 'aria-hidden': true }, '+'), h('h2', null, t('newsAdd')))),
          newsData.historyFields.length > 0 && h('details', { className: 'yj-section' }, h('summary', null, t('newsHistoryFields')), ...newsData.historyFields.map(field => h('div', { key: field.id, className: 'yj-row' }, h('span', null, field.name), field.deleted && h('small', null, t('newsDeletedField')), button('newsReports', () => readNewsHistory(field)))))),
        newsAbout && newsData && h(Modal, { title: t('newsSources'), onClose: () => setNewsAbout(false), className: 'yj-confirm' }, h('div', { className: 'yj-confirm-body' }, help('newsHelp'), help('newsStartHelp'), h('p', null, newsData.dependencies.model)), h('footer', { className: 'yj-dialog-actions' }, button('closePanel', () => setNewsAbout(false), false, { className: 'yj-primary' }))),
        newsSettings && newsEditor && h(Drawer, { title: t(newsData?.fields.some(field => field.id === newsEditor.id) ? 'newsEdit' : 'newsAdd'), busy, onClose: () => setConfirm({ kind: 'newsDraft' }),
          footer: [button('newsDiscard', () => setConfirm({ kind: 'newsDraft' }), false, { key: 'discard' }), newsData?.fields.some(field => field.id === newsEditor.id) && button('newsConflictReload', reloadNewsEditor, false, { key: 'reload' }), button('newsSave', saveNews, !newsEditor.field.name.trim() || !newsEditor.field.focus.trim() || !newsEditor.field.sources.length, { key: 'save', className: 'yj-primary' })] },
          h('fieldset', { className: 'yj-news-form', disabled: busy || confirm?.kind === 'newsChange' },
            field('newsName', newsEditor.field.name, value => patchNews('name', value)),
            h('label', { className: 'yj-field' }, t('newsFocus'), h('textarea', { value: newsEditor.field.focus, disabled: busy, onChange: event => patchNews('focus', event.target.value) })),
            h('label', { className: 'yj-choice' }, h('input', { type: 'checkbox', checked: newsEditor.field.enabled, disabled: busy, onChange: event => patchNews('enabled', event.target.checked) }), t('newsEnabled')),
            h('h3', null, t('newsSources')), help('newsSourceHelp'),
            ...choices.map(source => h('label', { key: source.url, className: 'yj-choice' }, h('input', { type: 'checkbox', checked: newsEditor.field.sources.some(item => item.url === source.url), disabled: busy || newsEditor.field.sources.length >= 10 && !newsEditor.field.sources.some(item => item.url === source.url), onChange: () => toggleSource(source) }), source.name, ' · ', source.url)),
            h('details', null, h('summary', null, t('newsSourceAdd')),
              field('newsSourceName', newsSource.name, value => setNewsSource(source => ({ ...source, name: value }))), field('newsSourceUrl', newsSource.url, value => setNewsSource(source => ({ ...source, url: value })), { type: 'url' }),
              ...[['kind', 'newsSourceKind', ['primary', 'newsPrimary'], ['media', 'newsMedia']], ['region', 'newsSourceRegion', ['domestic', 'newsDomestic'], ['overseas', 'newsOverseas']]].map(([key, label, ...options]) => h('label', { className: 'yj-field', key }, t(label), h('select', { value: newsSource[key], disabled: busy, onChange: event => setNewsSource(source => ({ ...source, [key]: event.target.value })) }, h('option', { value: '' }, t('newsSourceChoose')), ...options.map(([value, text]) => h('option', { value, key: value }, t(text)))))),
              button('newsSourceAdd', () => { patchNews('sources', [...newsEditor.field.sources, { ...newsSource }]); setNewsSource({ name: '', url: '', kind: '', region: '' }); }, !newsSource.name.trim() || !newsSource.url.trim() || !newsSource.kind || !newsSource.region || newsEditor.field.sources.length >= 10 || newsEditor.field.sources.some(source => source.url === newsSource.url))))),
        confirm?.kind === 'newsChange' && h(ConfirmDialog, { title: t(confirm.input.action === 'remove' ? 'newsRemoveTitle' : 'newsConfirm'), message: t(confirm.last ? 'newsLastHelp' : 'newsRemoveHelp'), confirmLabel: t('newsConfirm'), cancelLabel: t('cancel'), danger: confirm.input.action === 'remove', busy, onCancel: () => setConfirm(null), onConfirm: () => persistNews({ ...confirm.input, ...(confirm.last ? { confirmCancel: true } : {}) }) }),
        confirm?.kind === 'newsDraft' && h(ConfirmDialog, { title: t('newsDiscardTitle'), message: t('newsDiscardHelp'), confirmLabel: t('newsDiscard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setNewsEditor(null); setConfirm(null); notify(t('draftDiscarded')); } }),
        newsHistory && h(Modal, { title: `${newsHistory.field.name} · ${t('newsReports')}`, onClose: () => setNewsHistory(null) }, newsHistory.field.deleted && help('newsDeletedField'),
          h('div', { className: 'yj-news-history' }, newsHistory.reports.length ? newsHistory.reports.map(report => h('button', { type: 'button', key: report.cutoff, disabled: busy, onClick: () => readNewsReport(report.fieldId, report.cutoff, report.fieldName) }, beijing(report.cutoff))) : help('newsHistoryEmpty')),
          newsHistory.nextBefore && button('newsHistoryOlder', () => readNewsHistory(newsHistory.field, newsHistory.nextBefore))),
        newsReport && h(Modal, { title: t('newsReports'), onClose: () => setNewsReport(null) }, newsReport.report ? reportView(newsReport.report) : help('newsReportEmpty')),
        newsItem && newsItemView(newsItem), newsRun && newsRunView(newsRun));
    }

    if (tab === 'models') body = h(ModelWorldView, { api, t, notify });

    const assistant = h('aside', { ref: floating.frame, style: floating.style, className: `yj-assistant yj-assistant-${assistantForm}`, 'aria-label': t('question'), hidden: assistantForm === 'bubble' },
      h('header', { className: 'yj-assistant-header', ...floating.handle('move'), tabIndex: assistantForm === 'float' ? 0 : undefined, title: assistantForm === 'float' ? t('assistantMove') : undefined }, h(Avatar, { expert: roleCards.find(role => role.id === 'manager'), size: 32 }), h('div', null, h('h2', null, t('question')), h('small', null, t('assistantTagline'))), button('assistantMinimize', () => setAssistantForm('bubble'), false, { className: 'yj-assistant-minimize', 'aria-label': t('assistantMinimize'), title: t('assistantMinimize') })),
      assistantForm === 'float' && ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map(direction => h('div', { key: direction, className: `yj-resize yj-resize-${direction}`, role: 'button', tabIndex: 0, 'aria-label': `${t('assistantResize')} · ${t(`resize_${direction}`)}`, ...floating.handle(direction) })),
      h('div', { className: 'yj-row yj-assistant-tools' }, button(assistantForm === 'float' ? 'assistantDock' : 'assistantFloat', () => setAssistantForm(assistantForm === 'float' ? 'dock' : 'float')), assistantId && button('assistantHistory', () => api.open(assistantId))),
      previewError && h('div', { className: 'yj-notice yj-error', role: 'alert' }, previewError, button('assistantPreviewRetry', () => setPreviewRetry(value => value + 1))),
      !roleCards.some(role => role.id === 'manager') ? h('p', { className: 'yj-notice' }, t('assistantMissing')) : h(React.Fragment, null,
        h('details', { className: 'yj-assistant-context', open: Boolean(activePaths.length) }, h('summary', null, activePaths.length ? `${t('noteScope')} · ${activePaths.length}` : t('generalScope')),
          h('ul', null, ...activePaths.map(name => h('li', { key: name }, name.split('/').at(-1)))),
          row(button('askCurrent', () => { setContextExplicit(true); setSelectedPaths([note.path]); }, !note || dirty), button('clearSelection', () => { setContextExplicit(true); setSelectedPaths([]); })),
          help('citeHelp')),
        assistantReference ? h('div', { className: 'yj-assistant-conversation' }, h(SessionProvider, { session: assistantReference }, renderSlot('whalewing.assistant.conversation', {}))) : h('div', { className: 'yj-assistant-welcome' }, h(Avatar, { expert: roleCards.find(role => role.id === 'manager'), size: 72 }), h('h3', null, t('question')), help('questionHelp'), button('assistantStart', openAssistant, false, { className: 'yj-primary' }))));

    return h('div', { className: 'yj-page' }, h('style', null, css), h('header', { className: 'yj-header' }, h('h1', null, h(Logo, { size: 24, tone: 'brand' }), t('panel')), button('refresh', refreshTab)),
      h('nav', { className: 'yj-tabs', 'aria-label': t('panel') }, ...['experts', 'aiWeb', 'knowledge', 'skills', 'schedule', 'toolbox', 'news', 'models'].map((key) => button(key, () => { if (operation.current) return; switchTab(key); if (key === 'knowledge' && (dirty || conflict || readbackPath)) { notify(t('draftWarning'), { kind: 'info' }); return; } setConfirm(null); setError(''); return loadTab(key, false, key === 'knowledge'); }, false, { key, 'data-tab': key, 'aria-pressed': tab === key, className: [tab === key ? 'yj-selected' : '', key === 'models' ? 'yj-world-tab' : ''].filter(Boolean).join(' ') }))),
      busy && h('div', { className: 'yj-busy', role: 'status' }, h('span', { className: 'yj-spinner', 'aria-label': t('loading') }), h('button', { type: 'button', onClick: () => { if (operation.current) { operation.current.cancelled = true; operation.current.controller.abort(); } setError(t('stopHelp')); } }, t('stopWait'))),
      recoverySession && h(Modal, { title: t('workbenchRecoverTitle'), busy, onClose: () => setRecoverySession(''), className: 'yj-confirm' }, h('div', { className: 'yj-confirm-body' }, h('p', null, t('prepareHelp')), h('p', null, h('code', null, recoverySession))),
        h('footer', { className: 'yj-dialog-actions' }, button('inspectWorkbench', () => api.open(recoverySession), dirty), button('prepareWorkbench', () => { setRecoverySession(''); return loadTab(tab, true); }, dirty, { className: 'yj-primary' }))),
      confirm?.kind === 'draft' && h(ConfirmDialog, { title: t('draftDiscardTitle'), message: t('confirmDiscard'), confirmLabel: t('discard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setContent(note?.content || ''); if (!note) setPath(''); setConfirm(null); notify(t('draftDiscarded')); } }),
      h('div', { className: `yj-workspace yj-workspace-${assistantForm}` }, h('main', { className: 'yj-view' }, body,
        // 工具下载与网页筛选由各自组件持有；切换仅隐藏，不销毁它们的恢复状态。
        h(ToolboxView, { key: 'toolbox', active: tab === 'toolbox', Glyph }), h(AiWebView, { key: 'aiWeb', active: tab === 'aiWeb', sessionId: presentedReference?.sessionId, manageAiWeb: api.aiWebRequest, openBrowser: openAiBrowser, restoreBrowser, focusBrowser, notify, ActionMenu })), assistant),
      assistantForm === 'bubble' && button('assistantOpen', () => { if (!bubble.consumeDrag()) setAssistantForm('float'); }, false, { className: 'yj-assistant-bubble', style: bubble.style, title: t('assistantDrag'), disabled: false, ...bubble.handlers }),
      expertEditor !== undefined && h(ExpertEditor, { key: expertEditor?.id || 'new', api, expert: expertEditor, onClose: () => setExpertEditor(undefined), t, notify }),
      skillEditor !== undefined && h(SkillEditor, { key: skillEditor?.id || 'new-skill', api, entry: skillEditor, t, notify, onClose: () => setSkillEditor(undefined), onSaved: async entry => { const value = await api.skillRequest({ action: 'list' }); adoptSkills(value); setSkill(entry); setSkillEditor(undefined); notify(t('skillSaved')); } }));
  }

  function registerUi(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), '鲸翼文案');
      const t = ctx.locale.bind(NS);
      const api = createApi(ctx, t);
      ctx.effect(() => ctx.inputTriggers.registerSource({
        name: 'whalewing-knowledge', trigger: '@',
        candidates: async () => [],
        onPick: () => undefined,
        codec: {
          clipboardText: ref => JSON.parse(ref).join('\n'),
          serialize: async (ref, signal) => {
            const paths = JSON.parse(ref);
            const prepared = await api.knowledge({ action: 'question', question: t('citeQuestion'), paths }, signal);
            signal?.throwIfAborted();
            if (!Array.isArray(prepared.sources) || prepared.sources.length !== paths.length) throw new Error(t('badReply'));
            const mentions = prepared.sources.map(source => typeof source.absolutePath === 'string' ? formatFileMention({ path: source.absolutePath, kind: 'file' }, true) : undefined);
            if (mentions.some(value => !value)) throw new Error(t('citePathUnsupported'));
            // 用户消息只保留公开文件引用；是否真正读取由后续原生工具结果证明。
            return `\n${mentions.join('\n')}\n`;
          },
        },
      }), '鲸翼知识原生输入引用');
      let toast = null;
      let toastTimer;
      let toastSeq = 0;
      const listeners = new Set();
      // 提示统一出现在右上角：成功 4 秒、失败 8 秒后自动收起；带操作按钮的提示等员工处理。
      const publish = (message, options = {}) => {
        clearTimeout(toastTimer);
        toast = message ? { id: ++toastSeq, text: String(message), kind: options.kind || 'success', action: options.action || null } : null;
        toastTimer = toast && !toast.action ? setTimeout(() => publish(null), toast.kind === 'error' ? 8000 : 4000) : undefined;
        for (const listener of listeners) listener();
      };
      const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
      const snapshot = () => toast;
      api.bindNotify(publish);
      const toastMarks = { success: '✓', error: '!', info: 'i' };
      function Toast() {
        const value = useSyncExternalStore(subscribe, snapshot, snapshot);
        const element = useRef(null);
        useEffect(() => {
          const node = element.current;
          // 放进浏览器顶层：盖在编辑弹窗之上，也不受页面布局影响；每条新提示都排到最上面。
          try { if (node?.matches(':popover-open')) node.hidePopover(); node?.showPopover?.(); } catch { /* 不支持顶层时按普通浮层显示。 */ }
        }, [value?.id]);
        return value && h(React.Fragment, null, h('style', null, css), h('div', { ref: element, key: value.id, popover: 'manual', className: `yj-toast yj-toast-${value.kind}` },
          h('span', { className: 'yj-toast-mark', 'aria-hidden': true }, toastMarks[value.kind] || toastMarks.info),
          h('span', { className: 'yj-toast-text', role: value.kind === 'error' ? 'alert' : 'status' }, value.text),
          value.action && h('button', { type: 'button', className: 'yj-toast-action', onClick: () => { publish(null); return value.action.run(); } }, value.action.label),
          h('button', { type: 'button', className: 'yj-toast-close', onClick: () => publish(null), 'aria-label': t('toastClose') }, '×')));
      }
      // 标准字形作为文字标识，不维护第二套图标库或读取宿主 DOM。
      function Icon({ size }) { return h(Logo, { size }); }
      ctx.inject(['uiScheduleNavigation'], scope => scope.effect(() => scope.uiScheduleNavigation.hide()));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'whalewing', order: 20, locale: NS, label: () => t('panel') }, Icon));
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'whalewing', locale: NS, children: { 'whalewing.assistant.conversation': { kind: 'single', scope: 'session' } }, inject: () => ({ api, notify: publish }) }, Workbench));
      ctx.slots.inject('browser.toolbar.actions', () => ctx.slots.register({ name: 'browser.toolbar.actions', id: 'whalewing-ai-picker', order: 10 }, AiWebView.Toolbar));
      // 新会话首页的专家入口来自鲸翼适配；原生 DSH 没有这个位置时，专家选择放到输入框左侧，会话标题栏不再重复显示。
      let heroSeat = false;
      const heroListeners = new Set();
      const subscribeHero = listener => { heroListeners.add(listener); return () => heroListeners.delete(listener); };
      const heroSnapshot = () => heroSeat;
      const setHeroSeat = value => { heroSeat = value; for (const listener of heroListeners) listener(); };
      function HeaderExpertPicker(props) { return useSyncExternalStore(subscribeHero, heroSnapshot, heroSnapshot) ? h(ExpertPicker, props) : null; }
      function InputExpertPicker(props) { return useSyncExternalStore(subscribeHero, heroSnapshot, heroSnapshot) ? null : h(ExpertPicker, props); }
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'whalewing-expert', order: -9, locale: NS, inject: () => ({ api }) }, HeaderExpertPicker));
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'whalewing-expert-picker', order: 10, locale: NS, inject: () => ({ api }) }, InputExpertPicker));
      ctx.slots.inject('conversation.hero.actions', () => {
        setHeroSeat(true);
        const dispose = ctx.slots.register({ name: 'conversation.hero.actions', id: 'whalewing-expert', order: 10, locale: NS, inject: () => ({ api }) }, ExpertPicker);
        return () => { setHeroSeat(false); dispose(); };
      });
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'whalewing-knowledge', order: 20, locale: NS, inject: () => ({ api }) }, CiteNotes));
      function AssistantViews(props) { return h(AssistantChat, { ...props, api }); }
      ctx.slots.inject('whalewing.assistant.conversation', () => ctx.slots.register({ name: 'whalewing.assistant.conversation', inject: () => ({ views: AssistantViews }) }, AssistantConversation));
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'whalewing-notice', locale: NS }, Toast));
      ctx.effect(() => () => { clearTimeout(toastTimer); listeners.clear(); toast = null; }, '鲸翼提示释放');
  }
  return {
    inject: ['slots', 'locale', 'remote', 'remote.commands', 'remote.session', 'remote.agentPresets', 'sessions', 'workspaces', 'uiWorkspace', 'inputTriggers'],
    async apply(ctx) {
      // 先挂载本包 Remote，再让 UI 消费命名空间；退场按反顺序释放。
      const disposeRemote = await ctx.remote.$mount(makeContract(z).client);
      let disposeExperts;
      try { disposeExperts = await ctx.remote.$mount(makeExpertContract(z).client); }
      catch (error) { await disposeRemote(); throw error; }
      let disposeSkills;
      try { disposeSkills = await ctx.remote.$mount(skillFactory(z).client); }
      catch (error) { await disposeExperts(); await disposeRemote(); throw error; }
      let disposeAutomation;
      try { disposeAutomation = await ctx.remote.$mount(makeAutomationContract(z).client); }
      catch (error) { await disposeSkills(); await disposeExperts(); await disposeRemote(); throw error; }
      let disposeNews;
      try { disposeNews = await ctx.remote.$mount(makeNewsContract(z).client); }
      catch (error) { await disposeAutomation(); await disposeSkills(); await disposeExperts(); await disposeRemote(); throw error; }
      let disposeWorld;
      try { disposeWorld = await ctx.remote.$mount(makeModelWorldContract(z).client); }
      catch (error) { await disposeNews(); await disposeAutomation(); await disposeSkills(); await disposeExperts(); await disposeRemote(); throw error; }
      let disposeAiWeb;
      try { disposeAiWeb = await ctx.remote.$mount(featureViews.aiWebContract(z).client); }
      catch (error) { await disposeWorld(); await disposeNews(); await disposeAutomation(); await disposeSkills(); await disposeExperts(); await disposeRemote(); throw error; }
      const ui = ctx.inject(['remote.whalewingKnowledge', 'remote.whalewingExperts'], registerUi);
      try { await ui; }
      catch (error) { await ui.dispose(); await disposeAiWeb(); await disposeWorld(); await disposeNews(); await disposeAutomation(); await disposeSkills(); await disposeExperts(); await disposeRemote(); throw error; }
      return async () => { await ui.dispose(); await disposeAiWeb(); await disposeWorld(); await disposeNews(); await disposeAutomation(); await disposeSkills(); await disposeExperts(); await disposeRemote(); };
    },
  };
}
