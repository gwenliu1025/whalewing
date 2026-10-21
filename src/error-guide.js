/**
 * 把内部错误码翻译成员工看得懂的提示：发生了什么、问题出在哪一端、该怎么处理。
 * 原始错误码和技术细节只写进开发者控制台，不展示给员工。规则按顺序匹配，第一条命中即用。
 */
const guide = [
  [/^(FEATURE_API)$/, '扩展接口版本不匹配', '请更新鲸翼或安装支持 v1 接口的扩展'],
  [/^(FEATURE_CONFLICT)$/, '扩展功能名称重复', '请停用重复扩展，或请扩展作者修改功能 id'],
  [/^(FEATURE_CLOSED|FEATURE_DISABLED|FEATURE_CALLER|FEATURE_RETRY)$/, '功能尚未就绪', '请在插件页重新打开功能后重试'],
  [/^(MODEL_UNAVAILABLE)$/, '当前没有可用的对话模型（DSH 设置问题）', '请在 DSH 设置里配置默认模型和 API Key 后重试'],
  [/^(PROFILE_UNAVAILABLE|CONFIG|NOT_INITIALIZED|ROOT)$/, '插件没找到可用的配置目录或知识库位置（DSH 设置问题）', '请确认 DSH 正常启动，并检查插件配置里的知识库位置，然后重启 DSH'],
  [/^WORKSPACE_/, '所选工作区不可用（工作区设置问题）', '请确认文件夹仍存在且有权限访问，或重新选择工作区'],
  [/^(PATH|SYMLINK|ROOT_NOT_EMPTY|DIRECTORY_LIMIT)$/, '目标位置不能使用（本机文件问题）', '请换一个普通文件夹（不要用快捷方式、网络盘或系统目录）后重试'],
  [/^(ENCODING|INVALID_TEXT)$/, '文件编码无法识别（文件内容问题）', '请把文件另存为 UTF-8 编码后重试'],
  [/^(SIZE|QUESTION_LIMIT)$|_LIMIT$/, '内容超出了允许的大小或数量（填写内容问题）', '请缩短内容或减少数量后重试'],
  [/^(CONFLICT|EXPECTED_HASH)$|_CONFLICT$|_CHANGED$|_EXISTS$/, '这项内容刚在别处被修改过（数据已变化）', '你的修改仍在编辑区，请先「重新读取」查看最新内容，再决定如何保存'],
  [/READBACK|_UNKNOWN$|^(PERSISTENCE|RECOVERY|RECOVERY_MOVE)$/, '操作已提交，但没能确认结果（本机文件问题）', '请刷新查看是否已生效，不要重复提交'],
  [/NOT_FOUND$|_MISSING$|^(NO_RECOVERY|SESSION)$/, '要操作的内容已经不存在（数据已变化）', '请刷新列表后重试'],
  [/^(BUSY)$|_BUSY$/, '上一项操作还在进行中', '请等它完成后再试'],
  [/_PROTECTED$|^(USER_ONLY|FIXED_RULE)$/, '系统内置的内容不能直接这样修改', '可以先复制或新建一份属于你的，再修改'],
  [/^(CLOSED|ABORTERROR)$/, '操作已取消', '需要时可以重新开始'],
  [/^(SESSION_REQUIRED|COMMAND_MISSING)$/, '工作台还没连接好（插件问题）', '请点「刷新」；仍不行请重启 DSH'],
  [/^(BAD_REPLY|METADATA|RECEIPT)$/, '插件收到的结果不完整（插件问题）', '请重试；仍不行请完全退出 DSH 后重新打开'],
];
// 填写类错误保留原句：它通常指明了是哪一项不符合要求。
const inputCodes = /^(INPUT|VALIDATION|QUERY|OFFSET|ACTION|DOMAIN|QUESTION|EVENT_LIMIT|INDEX_LIMIT|ZODERROR)$/;
const network = /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|network|timeout/i;

/** 返回 { text, origin }：text 直接展示给员工。 */
export function explainError(code, message = '', domains = []) {
  const key = code === undefined || code === null ? '' : String(code).toUpperCase();
  if (/^SESSION_(MIGRATION|UNCONFIRMED|CREATED_DIFFERENT|ARCHIVED)$/.test(key)) return { text: message, origin: 'session' };
  if (inputCodes.test(key) || domains.some(domain => (domain.inputCodes ?? []).some(value => value === 'NOTE_' ? key.startsWith(value) : key === value))) return { text: `填写的内容不符合要求：${message || '请检查后重试'}`, origin: 'input' };
  const domainRule = domains.map(domain => domain.errors?.[key]).find(Boolean);
  if (domainRule) return { text: `${domainRule[0]}。${domainRule[1]}。`, origin: key };
  const rule = guide.find(([pattern]) => pattern.test(key));
  if (rule) return { text: `${rule[1]}。${rule[2]}。`, origin: key };
  if (network.test(message)) return { text: '网络连接失败（网络问题）。请检查网络或代理后重试。', origin: 'network' };
  return { text: `插件内部出错（插件问题，错误码 ${code ?? '无'}）。请重试；仍不行请重启 DSH，并把错误码告诉插件维护人。`, origin: 'plugin' };
}
