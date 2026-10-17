/**
 * 把内部错误码翻译成员工看得懂的提示：发生了什么、问题出在哪一端、该怎么处理。
 * 原始错误码和技术细节只写进开发者控制台，不展示给员工。规则按顺序匹配，第一条命中即用。
 */
const guide = [
  [/^(WORLD_FETCH)$/, '没能从 GitHub 下载模型数据（网络问题）', '请检查网络或代理后重试，已有数据不受影响'],
  [/^(NEWS_FETCH_FAILED|NEWS_FEED|NEWS_URL)$/, '订阅来源暂时读不到（来源网站或网络问题）', '请确认订阅地址能在浏览器里打开，其他来源不受影响'],
  [/^(SCHEDULE_DISABLED|AUTOMATION_UNAVAILABLE|NEWS_SCHEDULE|LEGACY_SCHEDULE|NEWS_UNAVAILABLE)$/, '定时服务没有启用（DSH 设置问题）', '请在 DSH「插件」页启用官方定时服务（Schedule），然后点「刷新」'],
  [/^(MODEL_UNAVAILABLE)$/, '当前没有可用的对话模型（DSH 设置问题）', '请在 DSH 设置里配置默认模型和 API Key 后重试'],
  [/^(AI_WEB_UNAVAILABLE|BROWSER_MISSING)$/, 'DSH 内置浏览器还没就绪（DSH 设置问题）', '请在 DSH「插件」页启用浏览器后重试'],
  [/^(PROFILE_UNAVAILABLE|CONFIG|SOURCE_CONFIG|NOT_INITIALIZED|ROOT)$/, '插件没找到可用的配置目录或知识库位置（DSH 设置问题）', '请确认 DSH 正常启动，并检查插件配置里的知识库位置，然后重启 DSH'],
  [/^WORKSPACE_/, '所选工作区不可用（工作区设置问题）', '请确认文件夹仍存在且有权限访问，或重新选择工作区'],
  [/^(PATH|SYMLINK|ROOT_NOT_EMPTY|SOURCE_DIRECTORY|DIRECTORY_LIMIT|WORLD_PATH|SKILL_ROOT|SKILL_SOURCE_ROOT|SOURCE_MODE)$/, '目标位置不能使用（本机文件问题）', '请换一个普通文件夹（不要用快捷方式、网络盘或系统目录）后重试'],
  [/^(ENCODING|INVALID_TEXT)$/, '文件编码无法识别（文件内容问题）', '请把文件另存为 UTF-8 编码后重试'],
  [/^(SIZE|SKILL_SIZE|QUESTION_LIMIT)$|_LIMIT$/, '内容超出了允许的大小或数量（填写内容问题）', '请缩短内容或减少数量后重试'],
  [/^(CONFLICT|EXPECTED_HASH|SKILL_STALE|NEWS_DUPLICATE)$|_CONFLICT$|_CHANGED$|_EXISTS$/, '这项内容刚在别处被修改过（数据已变化）', '你的修改仍在编辑区，请先「重新读取」查看最新内容，再决定如何保存'],
  [/READBACK|_UNKNOWN$|^(PERSISTENCE|RECOVERY|RECOVERY_MOVE)$/, '操作已提交，但没能确认结果（本机文件问题）', '请刷新查看是否已生效，不要重复提交'],
  [/NOT_FOUND$|_MISSING$|^(SCHEDULE_ENDED|SCHEDULE_RETIRED|NO_RECOVERY|AUTOMATION_SESSION|SESSION)$/, '要操作的内容已经不存在（数据已变化）', '请刷新列表后重试'],
  [/^(BUSY)$|_BUSY$/, '上一项操作还在进行中', '请等它完成后再试'],
  [/_PROTECTED$|^(SKILL_ORIGIN|USER_ONLY|AI_WEB_BUILTIN|FIXED_RULE|SKILL_STATE|SKILL_SHADOWED)$/, '系统内置的内容不能直接这样修改', '可以先复制或新建一份属于你的，再修改'],
  [/^(CLOSED|ABORTERROR|NEWS_CANCELLED)$/, '操作已取消', '需要时可以重新开始'],
  [/^(SESSION_REQUIRED|COMMAND_MISSING)$/, '工作台还没连接好（插件问题）', '请点「刷新」；仍不行请重启 DSH'],
  [/^(BAD_REPLY|GRAPH_CONTRACT_MISMATCH|EXPERT_READBACK|WORLD_SCHEMA|WORLD_SCALE|WORLD_LINK|WORLD_STORAGE|METADATA|RECEIPT|NEWS_RECEIPT|COVERAGE_OUTPUT)$/, '插件收到的结果不完整（插件问题）', '请重试；仍不行请完全退出 DSH 后重新打开'],
];
// 填写类错误保留原句：它通常指明了是哪一项不符合要求。
const inputCodes = /^(INPUT|VALIDATION|QUERY|OFFSET|ACTION|DOMAIN|QUESTION|SKILL_NAME|SKILL_FORMAT|SKILL_SOURCE|SKILL_REVIEW|SKILL_EVOLUTION|SKILL_DISCOVERY|AUTOMATION_PROMPT|AUTOMATION_IDENTITY|NEWS_IDENTITY|NEWS_SOURCE|NEWS_DISABLED|COVERAGE_CONFLICT|EVENT_LIMIT|INDEX_LIMIT|SOURCE_SCOPE|SOURCE_UNAVAILABLE|WORLD_INPUT|ZODERROR)$|^NOTE_/;
const network = /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|network|timeout/i;

/** 返回 { text, origin }：text 直接展示给员工。 */
export function explainError(code, message = '') {
  const key = code === undefined || code === null ? '' : String(code).toUpperCase();
  if (inputCodes.test(key)) return { text: `填写的内容不符合要求：${message || '请检查后重试'}`, origin: 'input' };
  const rule = guide.find(([pattern]) => pattern.test(key));
  if (rule) return { text: `${rule[1]}。${rule[2]}。`, origin: key };
  if (network.test(message)) return { text: '网络连接失败（网络问题）。请检查网络或代理后重试。', origin: 'network' };
  return { text: `插件内部出错（插件问题，错误码 ${code ?? '无'}）。请重试；仍不行请重启 DSH，并把错误码告诉插件维护人。`, origin: 'plugin' };
}
