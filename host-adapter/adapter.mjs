import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { convertSessionPreparation, convertModePreparation } from './preparation.mjs';
import { convertSidebar } from './sidebar.mjs';
import { convertBrowserFocus, convertBrowserToolbar } from './browser-presentation.mjs';
import { convertSchedule } from './schedule.mjs';

export const VERSION = '0.2.0-rc.2';
export const SOURCE_COMMIT = '639ed015397290b3745d163aafe02ffee4aa3f84';
const prefix = 'node_modules/@deepseek-ai/';
const schemaName = '_deepseek_ai_dsh_api_session_controller_session_selectModel_parameter_0$schema';
const declaration = 'export interface SessionSelectModelRequest extends ModelSelection {\\n    readonly sessionId: SessionId;\\n}';
const extendedDeclaration = declaration.replace('\\n}', '\\n    readonly saveAsDefault?: boolean;\\n}');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// 固定产物哈希同时约束版本、构建布局和变换锚点；不对未知安装包猜测修补。
const specs = [
  ['dsh-client-ui-conversation/lib/client.js', '64843c950b829f44feed3248af6c46bbd620cf85e7c687b4f7f60e1ec4eb4782', 'ebe182adbc647705c61117f7a58e61d2c536e8eb944aa758bcf992a67c73bad8', 'hero'],
  ['dsh-api-session-controller/lib/index.js', 'fb0f7b96130f595db20809eeb77a195b05f4a039f931d1e67692f1f74a4dd269', '0f3823c822fb65d0875de48f9d110d4679efeebd7f774c18a31ec4976598966e', 'command'],
  ['dsh-api-session-controller/lib/types/commands.js', '0fa37c1749ad68f5522ccdbca1ab50a74859c4ab5be9a30c76e15900c39b0ebb', '9666b63c50fad7bab25789163ac0875cfd1f503cdafa01c65df030f44a5248a8', 'command'],
  ['dsh-api-session-controller/lib/typert.host.js', 'ec331ac9bd74081036ab21432a5354cbf769f46930d8cb78266381279923d9eb', '712c5fae8e18ca7dfe0958846e0890558522548766604ee60f8d90cc467c4fdd', 'host'],
  ['dsh-api-session-controller/lib/typert.remote-client.js', '117d6192f45ce9447cd01002e61a01388c97d4799b35328264d13b699d11e880', '5d22e23d30a1b68a447341e932489884deb86e2dde011d11f9a35fb40a1b967a', 'remote'],
  ['dsh-api-remotes/lib/client.js', '62d5d9ceafd2f93999100385b31237a5033f90832907ec912b18bf805b092b2d', 'bd23231dcdb64af7943238b4cce55ef5ee1e22293541f1394ed937aae2062da6', 'browser'],
  ['dsh-tool-cordis/lib/types/api-catalog.js', 'ba03e8444a3872b1ab10fc185d658d015c917eefac26d2080d7f99c04040486c', '30479e79867ae644234b7eeeea3df1edbf718e5fc739e20b301e61e92ede62d6', 'catalog'],
  ['dsh-mcp-client/lib/index.js', '758d8fc473b700b5d351158d06ce9f9e92c16e8b25497b08bb7bd2122a87f5dd', '3031474cc3cec71bfe9e184d9520a9764daaf731d5f7790ace65c181241ec90f', 'mcp-client'],
  ['dsh-mcp-resources/lib/index.js', '7fa2e6049494b502ae756bf557c1f744a07835b850e6e0e0ddb555a488f3a094', 'e96313eda21d713e27d7f2e89fd0337e0fbca59293ba44db89eea37b7380d998', 'mcp-resources'],
  ['dsh-api-session-controller/lib/client.js', '60ec6a006443b40e5ab718f3fa53c301559c5c28427ca650c3851127ce370d43', 'c5360498168918f65f82afa0f5ca873cffc00c54c4fccc50597bc7c6e5420264', 'prepare-client'],
  ['dsh-api-session-controller/lib/types/client/sessions/session.js', '367b4d9214c4a5d9b867122baa01fc8dc3a2a2d5d4d6fea95ab9f6919245680b', '141e3fc19b48b8da344c6424727debb7f9d0930b2b018b39623360f43991e5b1', 'prepare-types'],
  ['dsh-client-ui-agent-preset/lib/client.js', 'ea2b2e2bc90fbc3865a01c0b4567a574a3c656b7bb3da5b15911a7d0edd47c5e', 'ad080de9cb67121662ca498bb3285c38066c46940ed249933b41f0915e979dff', 'prepare-mode'],
  ['dsh-client-ui-sidebar-right/lib/client.js', '5e8426c9378944050768abd3706009fe22aaae764ce4a9ede85e83a349464108', 'b456ce3eee5f6c998fc9ecb01d0796dae844c3c796e02265b3ba33094d837909', 'sidebar'],
  ['dsh-client-ui-schedule/lib/client.js', 'c89e4762f1b38cd7d034a8556ed4cfe1c81e1e7f0b34a6a30aa882b99095904d', '7336e5265e94ee1c04171f9a8bc98d2503818750d1c1414409b16ab1fb3b7d7e', 'schedule-ui'],
  ['dsh-schedule/lib/typert.remote-client.js', '1bee6b23f670520251814ce32772390d734cb0141458670819b4072e80fb89c4', '7598f62b341279c87abf76783302c52612338e8a83e4c069ec5021bd8b7c2077', 'schedule-remote'],
  ['dsh-schedule/lib/typert.host.js', '6352666fc767a105a042bb819acabdab748fd1e77f66e4fec9f96f2c7f84624f', '27a2aa321cdac211862a4a643acb0d6ebabb892fb5f141363c6177690138c95c', 'schedule-host'],
  ['dsh-schedule/lib/types/tools.js', '729b008b9b318ac2946c6eb4d052ed3bf92bd2815dc865b195851d3145a42966', '6241f41c6b73e6e894c0748dba684c63f47ab1c3c4e1365a910e94d21b04c9c0', 'schedule-tools'],
  ['dsh-schedule/lib/types/storage.js', '497dd162c6d213aa24aca16edcbb41e6d81c205c3a6a28f5b71efba3337133aa', '27c0b5ba39f9ba7af15282292983e5996dae6634c5cf3afedc6e178f7f982a7d', 'schedule-storage'],
  ['dsh-schedule/lib/types/index.js', '06620be8c094c405ea0c701271070952abc15f03668217715fc6d60c107d8232', '4cb637422c27741192d26a7242c96b0ec410a9b190b5bc7bc306e3f8ce4d3b46', 'schedule-service'],
  ['dsh-schedule/lib/index.js', '9d728e13edb7e7f954d493ece3aaf4c90c3bcb6f888b41efb3ae21b09384ae38', '497e791665543df177e2601a23a6ab47aadfada96d9ef3f99f377518f367d53e', 'schedule-index'],
  ['dsh-client-ui-sidebar-browser/lib/client.js', 'e1a730a5087b946273280e135f9cd2718d2c2ce98aa30d3ffc53f5da2abf2136', 'c227ea5aa79ae9a461ff6463041ae14b3dbdaa70cef32bd5c04cc6b5370e0963', 'browser-toolbar'],
  ['dsh-schedule/lib/types/domain.js', '420afa6a229e00b6ebbb808912567d42ac45b168fe9bb998d28ad057e46ee206', 'f9b2a2a358dfc0181c29352ff61bca48327ba025945e038d2bc7072ede72cad1', 'schedule-domain'],
].map(([file, before, after, kind]) => ({ file: prefix + file, before, after, kind }));
export const PROGRAM_FILES = Object.freeze(specs.map(row => row.file));
export const VERSION_FILES = Object.freeze(['package.json', ...new Set(specs.map(row => row.file.split('/').slice(0, 3).join('/') + '/package.json'))]);

function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('适配锚点次数不符');
  return text.replace(before, after);
}

function convert(text, kind) {
  if (kind.startsWith('schedule-')) return convertSchedule(text, kind);
  const result = convertBase(text, kind);
  return kind === 'browser' || kind === 'catalog' ? convertSchedule(result, kind) : result;
}

function convertBase(text, kind) {
  if (kind === 'sidebar') return convertBrowserFocus(convertSidebar(text));
  if (kind === 'browser-toolbar') return convertBrowserToolbar(text);
  if (kind === 'prepare-client' || kind === 'prepare-types') return convertSessionPreparation(text, kind === 'prepare-client');
  if (kind === 'prepare-mode') return convertModePreparation(text);
  if (kind === 'hero') {
    text = replaceOnce(text, 'renderSlot("conversation.hero.agentPreset", {})', 'renderSlot("conversation.hero.agentPreset", {}),\n\t\t\t\t\trenderSlot("conversation.hero.actions", {})');
    const seat = '"conversation.hero.agentPreset": {\n\t\t\t\t\t\tkind: "single",\n\t\t\t\t\t\tscope: "session-maybe"\n\t\t\t\t\t}';
    return replaceOnce(text, seat, seat + ',\n\t\t\t\t\t"conversation.hero.actions": {\n\t\t\t\t\t\tkind: "list",\n\t\t\t\t\t\tscope: "session-maybe"\n\t\t\t\t\t}');
  }
  if (kind === 'command') {
    // 只保护全局默认持久化，原校验、串行化、会话事件与模型路由保持不动。
    const call = text.includes('void this.ctx.agentDefaultModel')
      ? 'void this.ctx.agentDefaultModel.saveSelection(selected).catch((error) => {'
      : 'this.ctx.agentDefaultModel.saveSelection(selected).catch((error) => {';
    return replaceOnce(text, call, 'if (request.saveAsDefault !== false) ' + call);
  }
  if (kind === 'mcp-client') {
    return replaceOnce(text, 'resources: { async request(request, exec) {', 'resources: {\n\t\t\tdescribe() {\n\t\t\t\treturn { connected: !disposed && client !== void 0 && connectedAt !== void 0, tools: [...disposers.keys()].sort() };\n\t\t\t},\n\t\t\tasync request(request, exec) {');
  }
  if (kind === 'mcp-resources') {
    const anchor = '\t/**\n\t* Register one server';
    const method = '\t/** 读取作用域内连接状态及工具归属，不访问网络或返回配置。 */\n\tcatalog(scope) {\n\t\treturn [...this.layers.merge(scope, (layer) => layer.servers)].map(([name, provider]) => {\n\t\t\tconst description = provider.describe?.() ?? { connected: false, tools: [] };\n\t\t\treturn { name, connected: description.connected, tools: [...description.tools] };\n\t\t});\n\t}\n';
    return replaceOnce(text, anchor, method + anchor);
  }
  if (kind === 'catalog') {
    text = replaceOnce(text, declaration, extendedDeclaration);
    const provider = 'export interface McpResourceProvider {\\n    request(request: McpResourceRequest, exec: ToolExecution): Promise<JsonValue>;\\n}';
    text = replaceOnce(text, provider, provider.replace('\\n}', '\\n    describe?(): { connected: boolean; tools: string[]; };\\n}'));
    const signature = "                signature: 'register(server: string, provider: McpResourceProvider): () => void',";
    const catalogMethod = "                signature: 'catalog(scope?: ScopeKey): { name: string; connected: boolean; tools: string[]; }[]',\n                description: '读取当前作用域可见连接的名称、连接状态及实际工具归属，不暴露连接配置。',\n                parameters: [{ name: 'scope', description: '调用方作用域；省略只读全局目录。' }],\n                returns: '可见连接的当前只读快照。',\n            },\n            {\n";
    return replaceOnce(text, signature, catalogMethod + signature);
  }
  const start = text.indexOf('const ' + schemaName + ' =');
  if (start < 0) throw new Error('缺少模型请求 schema');
  const end = text.indexOf('\nlet ', start) >= 0 && kind !== 'browser'
    ? text.indexOf('\nlet ', start) : text.indexOf('\n\t\tlet ', start);
  if (end < start) throw new Error('模型请求 schema 边界不符');
  const current = text.slice(start, end);
  const extended = kind === 'browser'
    ? replaceOnce(current, '"reasoningEffort": string().readonly().optional()', '"reasoningEffort": string().readonly().optional(),\n\t\t\t"saveAsDefault": boolean().readonly().optional()')
    : replaceOnce(current, "  'reasoningEffort': z.string().readonly().optional(),", "  'reasoningEffort': z.string().readonly().optional(),\n  'saveAsDefault': z.boolean().readonly().optional(),");
  text = replaceOnce(text, current, extended);
  return kind === 'host' ? replaceOnce(text, declaration, extendedDeclaration) : text;
}

function decode(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\uFFFD')) throw new Error('源文件含替代字符');
  return text;
}

/** 纯字节转换；返回全套程序字节，供调用方打包，不写入任何路径。 */
export function transformFiles(input) {
  for (const file of VERSION_FILES) {
    const bytes = input.get(file);
    if (!bytes || JSON.parse(decode(bytes)).version !== VERSION) throw new Error(`宿主版本不匹配：${file}`);
  }
  const states = specs.map(row => {
    const bytes = input.get(row.file);
    if (!bytes) throw new Error(`缺少宿主文件：${row.file}`);
    const digest = hash(bytes);
    if (digest === row.before) return 'original';
    if (digest === row.after) return 'adapted';
    throw new Error(`宿主哈希不匹配：${row.file}`);
  });
  if (new Set(states).size !== 1) throw new Error('宿主处于混合版本状态，请先恢复完整基线');
  const state = states[0];
  const files = new Map();
  for (const row of specs) {
    const bytes = state === 'adapted' ? Buffer.from(input.get(row.file)) : Buffer.from(convert(decode(input.get(row.file)), row.kind));
    if (hash(bytes) !== row.after) throw new Error(`转换后哈希不匹配：${row.file}`);
    files.set(row.file, bytes);
  }
  return { state, files };
}

async function safeFile(root, file) {
  const canonicalRoot = await fs.realpath(root);
  const target = path.resolve(canonicalRoot, file);
  const canonical = await fs.realpath(target);
  const relative = path.relative(canonicalRoot, canonical);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error(`宿主文件越界：${file}`);
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`宿主目标不是普通文件：${file}`);
  return target;
}

export async function readRuntime(root) {
  const result = new Map();
  for (const file of [...VERSION_FILES, ...PROGRAM_FILES]) result.set(file, await fs.readFile(await safeFile(root, file)));
  return result;
}

// 写入方必须先保留 readRuntime 的原始字节作为恢复材料；这里不另建备份目录。
async function transaction(root, expected, desired, writer) {
  const targets = new Map();
  for (const [file, bytes] of expected) {
    const target = await safeFile(root, file);
    if (!bytes.equals(await fs.readFile(target))) throw new Error(`预检后文件已改变：${file}`);
    targets.set(file, target);
  }
  const touched = [];
  try {
    for (const [file, bytes] of desired) {
      const target = targets.get(file);
      if (!expected.get(file).equals(await fs.readFile(await safeFile(root, file)))) throw new Error(`写入前文件已改变：${file}`);
      touched.push(file);
      await writer(target, bytes);
      if (!bytes.equals(await fs.readFile(target))) throw new Error(`写后读回不符：${file}`);
    }
  } catch (failure) {
    const restoreErrors = [];
    for (const file of touched.reverse()) {
      try {
        const target = await safeFile(root, file);
        await fs.writeFile(target, expected.get(file));
        if (!expected.get(file).equals(await fs.readFile(target))) throw new Error('恢复读回不符');
      } catch (error) { restoreErrors.push(new Error(`恢复失败：${file}`, { cause: error })); }
    }
    if (restoreErrors.length) throw new AggregateError([failure, ...restoreErrors], '写入失败且恢复未完全成立；保留原始字节，停止后续操作');
    throw failure;
  }
}

/** 仅供已停用的隔离 runtime；调用者持有停机、回滚材料和实际客户端应用权。 */
export async function applyRuntime(root, { writeFile = fs.writeFile } = {}) {
  const original = await readRuntime(root);
  const prepared = transformFiles(original);
  if (prepared.state === 'original') await transaction(root, original, prepared.files, writeFile);
  return { state: prepared.state, original, files: prepared.files };
}

/** 拒绝覆盖后续未知改动，只从完整已适配集合恢复完整原程序集合。 */
export async function rollbackRuntime(root, original, { writeFile = fs.writeFile } = {}) {
  if (transformFiles(original).state !== 'original') throw new Error('回滚材料不是原始宿主');
  const current = await readRuntime(root);
  if (transformFiles(current).state === 'original') return { state: 'original' };
  const restored = new Map(PROGRAM_FILES.map(file => [file, Buffer.from(original.get(file))]));
  await transaction(root, current, restored, writeFile);
  return { state: 'restored' };
}
