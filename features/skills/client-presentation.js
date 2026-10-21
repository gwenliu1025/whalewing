
/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "skillRemoveTitle": "删除技能",
  "skillResetTitle": "恢复系统原件",
  "skillRollbackTitle": "恢复旧版技能",
  "skillRemoved": "技能已删除",
  "skillResetDone": "已恢复系统原件",
  "skillRolledBack": "已恢复旧版技能",
  "skillToggled": "技能状态已更新",
  "skillSaved": "技能已保存",
  "skills": "技能成长",
  "emptySkills": "还没有演进技能，可与专家一起从已有知识中提炼",
  "candidate": "候选",
  "disable": "停用技能",
  "restoreSkill": "恢复技能",
  "skillIssue": "待处理",
  "rollbackSkill": "回退到发布前旧版",
  "confirmRollback": "确认恢复最近一次发布前的有效旧版？不是恢复停用的当前版本；旧版来源失效时会保留现状",
  "confirmRollbackAction": "确认回退",
  "refine": "与小鲸讨论提炼",
  "refinePrompt": "请和我讨论如何从已有知识提炼个人技能。先查找现有技能与知识，和我确认要解决的问题及来源，再按现有技能演进流程准备候选；不要直接发布",
  "skillOverrideConflict": "同名位置不是这项系统技能的有效个人修改，请先在技能库处理冲突；原件与现有文件均保留",
  "skillLibrary": "我的技能库",
  "skillHelp": "已入库不代表当前对话已使用",
  "newSkill": "新增技能",
  "editSkill": "编辑技能",
  "saveSkill": "保存技能",
  "removeSkill": "删除用户技能",
  "resetSkill": "恢复系统原件",
  "skillContent": "技能内容（Markdown）",
  "skillIdentifier": "技能标识",
  "skillIdentifierHelp": "使用简短英文、数字或连字符，保存后保持不变",
  "builtin": "系统内置",
  "override": "系统技能的个人修改",
  "evolution": "知识提炼",
  "catalogued": "已入库",
  "skillMissing": "此技能已不存在，请刷新技能库",
  "skillReadback": "没能确认保存结果，当前内容还在；请重新读取已保存的版本",
  "skillLoadSaved": "加载已保存版本",
  "skillConfirmRemove": "删除这项用户技能？",
  "skillConfirmReset": "清除个人修改并恢复系统原件？",
  "skillBuiltinHelp": "系统原件保留；编辑会创建个人修改，之后可以重置",
  "selectSkill": "选择技能查看正文与来源",
  "sourcePaths": "知识来源",
  "skillEdit": "与小鲸编辑技能",
  "skillEditPrompt": "请协助编辑我所选的自有技能：{reference}。先通过 whalewing_skill 的 read 动作读取指定 name 和 state，核对返回 hash 与上述已读 hash 一致；不一致时停止修改并请我重新选择。读取来源后和我确认编辑内容，再按现有技能演进流程处理；不要按同名的其他状态替换，也不要修改宿主或其他插件的技能正文"
};
export const en = {
  "skillHelp": "In library does not mean this conversation has used it",
  "catalogued": "In library"
};
export const styles = [
`.yj-skill-library>.yj-split{min-height:0}.yj-skill-library .yj-list{max-height:65vh;overflow:auto}.yj-skill-library pre{max-height:58vh;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px;background:var(--dsw-alias-bg-layer-2)}`,
`
    .yj-skill-library{display:flex;flex-direction:column;gap:18px}.yj-skill-library>.yj-row:first-child h2{margin-right:6px}.yj-skill-library .yj-split>.yj-list{gap:10px;padding:2px}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
export const errors = {
  "SKILL_ROOT": [
    "目标位置不能使用（本机文件问题）",
    "请换一个普通文件夹（不要用快捷方式、网络盘或系统目录）后重试"
  ],
  "SKILL_SOURCE_ROOT": [
    "目标位置不能使用（本机文件问题）",
    "请换一个普通文件夹（不要用快捷方式、网络盘或系统目录）后重试"
  ],
  "SKILL_SIZE": [
    "内容超出了允许的大小或数量（填写内容问题）",
    "请缩短内容或减少数量后重试"
  ],
  "SKILL_STALE": [
    "这项内容刚在别处被修改过（数据已变化）",
    "你的修改仍在编辑区，请先「重新读取」查看最新内容，再决定如何保存"
  ],
  "SKILL_ORIGIN": [
    "系统内置的内容不能直接这样修改",
    "可以先复制或新建一份属于你的，再修改"
  ],
  "SKILL_STATE": [
    "系统内置的内容不能直接这样修改",
    "可以先复制或新建一份属于你的，再修改"
  ],
  "SKILL_SHADOWED": [
    "系统内置的内容不能直接这样修改",
    "可以先复制或新建一份属于你的，再修改"
  ]
};
export const inputCodes = [
  "SKILL_NAME",
  "SKILL_FORMAT",
  "SKILL_SOURCE",
  "SKILL_REVIEW",
  "SKILL_EVOLUTION",
  "SKILL_DISCOVERY"
];
