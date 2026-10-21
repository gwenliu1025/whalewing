
/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "taskSaved": "定时任务已保存",
  "taskToggled": "任务状态已更新",
  "taskCancelled": "已取消这个定时任务",
  "schedule": "定时任务",
  "taskPaused": "已暂停",
  "taskPause": "暂停",
  "taskResume": "恢复",
  "taskActions": "任务操作",
  "taskSelect": "选择一项任务，查看内容与结果",
  "taskScheduleSettings": "查看调度设置",
  "legacyScheduleSettings": "旧版：打开插件设置",
  "taskUnavailableShort": "DSH 定时服务尚未就绪",
  "taskStatusHelp": "暂停后不会再按时执行，已经开始的不受影响；恢复后从下一次时间开始",
  "scheduleHelp": "定时任务由 DSH 的定时服务执行，DSH 需要处于运行状态；错过的时间点会在下次启动时按规则补上",
  "knowledgeTask": "DSH 工作知识整理",
  "taskDisabled": "未启用",
  "enableTask": "设置并启用",
  "newTask": "新增定时任务",
  "taskScopeHelp": "启用后会整理你在 DSH 里的普通对话（不含子任务和自动任务），写入个人知识库，不会扫描电脑上的其他文件",
  "taskModelHelp": "采用每次执行时的系统默认模型，不继承小鲸专用模型；请先在 DSH 配置可用模型与凭据，运行可能产生模型费用",
  "scheduleUnavailable": "新版请检查 DSH 启动日志并重启；旧版请确认官方定时任务插件已启用，然后刷新；草稿会保留",
  "taskTitle": "任务名称",
  "taskPrompt": "工作指令",
  "taskRule": "时间规则",
  "taskSeconds": "秒数",
  "taskAt": "时间（含时区的 ISO 日期）",
  "taskExpression": "Cron 表达式",
  "taskWeekdays": "星期（1 周一至 7 周日）",
  "submitTask": "确认创建计划",
  "editTask": "编辑计划",
  "saveTask": "保存计划",
  "cancelPlan": "取消计划",
  "cancelPlanHelp": "取消后不再执行，执行记录会一并删除；已经产生的会话和知识保留",
  "openTaskSession": "打开原会话",
  "taskDetails": "计划详情",
  "taskActive": "已启用",
  "taskInactive": "计划已结束",
  "taskHistory": "执行记录",
  "historyHelp": "记录的是任务已按时发出，不代表模型已完成工作",
  "noHistory": "还没有执行记录",
  "historyEarlier": "更早的记录已被清理",
  "historyMore": "加载更早记录",
  "historyDetails": "执行记录详情",
  "taskLegacy": "旧知识计划",
  "taskLegacyHelp": "这些是旧版工作台创建的计划。请先取消旧计划，再启用新的知识整理，避免重复执行",
  "taskPending": "上次创建的结果还没确认",
  "taskPendingHelp": "上次创建可能已经成功。请先查看原会话确认，避免重复创建",
  "taskRecover": "查看原会话和计划",
  "taskContinue": "继续原会话创建",
  "taskPendingMissing": "还没找到已创建的计划；确认原会话后可以继续创建",
  "taskPendingConflict": "上次创建还没确认，请先查看原会话",
  "taskCacheError": "创建恢复记录尚未可靠保存，请检查浏览器存储后重试；尚未发起新建",
  "taskReadback": "没能确认计划是否保存成功，草稿还在；请刷新查看",
  "taskReload": "读取最新版本（保留草稿）",
  "taskDraftClose": "收起任务草稿",
  "taskDraftResume": "继续编辑草稿",
  "taskDiscard": "放弃任务草稿",
  "taskDiscardConfirm": "放弃未提交的修改？",
  "time": "每日时间",
  "timeZone": "时区",
  "taskTime": "下次时间",
  "legacyTimeZone": "原任务时区：{zone}",
  "convertBeijingTime": "改为北京时间",
  "beijingTime": "北京时间",
  "workspaceAll": "全部工作区",
  "workspaceSelected": "已选 {count} 个工作区",
  "workspaceScope": "处理范围",
  "workspaceScopeHelp": "全选后可取消个别工作区；知识整理只读取纳入范围的会话",
  "customWorkspaceHelp": "所选工作区作为本任务的处理清单"
};
export const en = {
  "legacyTimeZone": "Existing time zone: {zone}",
  "convertBeijingTime": "Use Beijing time",
  "beijingTime": "Beijing time",
  "workspaceAll": "All workspaces",
  "workspaceSelected": "{count} workspaces selected",
  "workspaceScope": "Workspaces",
  "workspaceScopeHelp": "Exclude individual workspaces from knowledge collection",
  "customWorkspaceHelp": "Selected workspaces form this task’s processing list; the working directory is its execution anchor"
};
export const styles = [
`
.yj-page .yj-task-time{display:flex;align-items:end;gap:16px;margin-block:16px}.yj-page .yj-task-time .yj-field{flex:none;width:160px}.yj-page .yj-task-time>span{padding-bottom:10px}.yj-page .yj-task-workspaces{display:grid;grid-template-columns:1fr 1fr;gap:16px}.yj-page .yj-workspace-options{max-height:280px;overflow:auto}.yj-page .yj-workspace-options .yj-choice{display:flex;gap:8px;align-items:start;padding:8px}.yj-page .yj-workspace-options small{display:block;overflow-wrap:anywhere}
@media(max-width:700px){.yj-page .yj-task-workspaces{grid-template-columns:1fr}}`,
`

    .yj-schedules{height:100%;min-height:360px;display:flex;flex-direction:column}.yj-task-split{display:grid;grid-template-columns:minmax(210px,270px) minmax(0,1fr);flex:1;min-height:0;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;overflow:hidden}.yj-task-list{padding:12px 8px;background:var(--dsw-alias-bg-layer-2);border-right:1px solid var(--dsw-alias-border-l1);overflow:auto}.yj-task-list>.yj-row{justify-content:space-between;padding:0 6px 12px}.yj-task-list h2{font-size:15px}.yj-task-list h3{font-size:13px;margin:0}.yj-task-template{display:grid;gap:6px;padding:12px 8px}.yj-task-template small,.yj-task-row small{color:var(--dsw-alias-label-secondary);font-size:11px}.yj-task-row{display:flex;align-items:center;border-radius:9px;margin:4px 0;min-width:0}.yj-task-row.yj-selected{background:var(--dsw-alias-interactive-bg-hover)}.yj-page .yj-task-select{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1;text-align:left;border:0;background:transparent;padding:10px 8px}.yj-task-select span,.yj-task-select small{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-task-main{padding:24px;min-width:0;overflow:auto}.yj-task-prompt{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}.yj-task-detail>details{margin-top:24px}.yj-task-editor{max-width:680px;margin:auto}.yj-task-editor>.yj-field{margin:14px 0}.yj-task-editor h2{margin-bottom:20px}.yj-task-empty{min-height:300px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px;color:var(--dsw-alias-label-secondary)}.yj-task-empty h2{font-size:16px}`,
`@media(max-width:700px){.yj-task-split{grid-template-columns:1fr}.yj-task-list{max-height:220px;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1)}.yj-task-main{padding:16px}}`,
`.yj-task-time>.yj-field{min-width:0}.yj-workspace-options{min-width:250px;max-width:min(480px,calc(100vw - 48px))}`,
`
    .yj-schedule-off{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:12px 16px;margin:0 0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}.yj-schedule-off p{margin:2px 0 0}.yj-page .yj-schedule-off .yj-primary{margin:0}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
export const errors = {
  "SCHEDULE_DISABLED": [
    "DSH 定时服务尚未就绪",
    "新版请检查 DSH 启动日志并重启；旧版请确认官方定时任务插件已启用，然后刷新"
  ],
  "AUTOMATION_UNAVAILABLE": [
    "DSH 定时服务尚未就绪",
    "新版请检查 DSH 启动日志并重启；旧版请确认官方定时任务插件已启用，然后刷新"
  ],
  "LEGACY_SCHEDULE": [
    "DSH 定时服务尚未就绪",
    "新版请检查 DSH 启动日志并重启；旧版请确认官方定时任务插件已启用，然后刷新"
  ],
  "SCHEDULE_ENDED": [
    "要操作的内容已经不存在（数据已变化）",
    "请刷新列表后重试"
  ],
  "SCHEDULE_RETIRED": [
    "要操作的内容已经不存在（数据已变化）",
    "请刷新列表后重试"
  ],
  "AUTOMATION_SESSION": [
    "要操作的内容已经不存在（数据已变化）",
    "请刷新列表后重试"
  ]
};
export const inputCodes = [
  "AUTOMATION_PROMPT",
  "AUTOMATION_IDENTITY"
];
