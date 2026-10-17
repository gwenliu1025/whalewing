# 匹配安装版的宿主适配

本目录仅适配 DSH `0.2.0-rc.2` 的已核验安装产物，对照源码提交 `639ed015397290b3745d163aafe02ffee4aa3f84`。这是安装版产物适配，不是上游全量构建，也不修改本项目保留的 `0.1.7` 宿主源码。

`source.patch` 是同版原 owner 的语义对照；`adapter.mjs` 对安装产物执行精确哈希、版本、锚点次数与结果哈希校验。源补丁保持固定提交的 UTF-8 无 BOM 与 LF，只改变必要局部，直接应用到该提交导出的源码，不应用到旧工作树。模型请求 schema、浏览器内联 codec、反射声明和原生 UI 插槽都在同一转换集合内；混合状态和未知改动拒收。

## 适配集合

完整程序文件集合由 [`adapter.mjs` 的 `PROGRAM_FILES`](adapter.mjs) 持有，路径均相对目标 runtime。适配包括专家入口、会话局部选模、MCP 目录、人工发送准备、嵌入会话呈现、浏览器工具栏及原生定时任务；对应接口与数据恢复要求见下文。

MCP 断连后仍注册的工具保留归属，`connected: false` 单独表达不可用；注册释放后工具列表随之清空。没有 `describe()` 的第三方 provider 显示 `connected: false, tools: []`，不猜测工具前缀。调用方仍负责根据当前作用域、连接状态和最新绑定复核权限，本适配不增加网络入口或绕过原有审批。

## 人工发送准备

客户端业务监听 `session/before-prompt`，参数为 `{ sessionId, signal }`，只返回 `void` 或 `Promise<void>`。原模式 owner 唯一使用 `prepend: true`，其它消费者默认追加；原事件服务的公开 `dispatch` 负责过滤和绑定作用域，Session 逐个等待并严格拒绝包括 `false`／`null` 在内的所有非 void 值，每项调用前后检查取消，不使用会吞掉这两类返回值的 `serial` 快捷方法。禁止在处理器里改问题、创建会话或再次发送。处理器必须在每次异步等待后复核取消，不因取消继续发出下一项选择。所有插件人工发送须调用保留的 `binding.session.prompt`，直接调用 `remote.session.prompt` 不受该客户端事件保护。

Session 按自身作用域派发并限制准备总等待为 15 秒，合并调用方取消与最终 binding 释放；只释放一个仍有其他持有者的引用不终止 Session。失败回收原 requestId 的回显并写入原 `promptError`，草稿／附件由原生失败路径恢复，未发出远端 prompt。原生乐观回显和清稿仍可能已发生，不把这道门描述为界面完全不变。

`agentPresets.select` 和 `session.selectModel` 没有取消参数，适配不添加非法 AbortSignal。取消结束本地等待，已发出的选择可能晚到生效；保留原会话供读回和明确重试，不宣称原子回滚。模式选择失败保留 stage，准备不将 busy、拒绝字符串或旧显示名当作成功；选择提交之后等待该会话权威投影匹配。

`source.patch` 在原 `/client` 入口公开事件类型；`client-contract.d.ts` 是安装包已裁剪声明时供插件显式引用的类型补充，不替换宿主完整的 `index.d.ts`。

## 嵌入会话来源预览

已保留且就绪的嵌入会话调用 `ctx.sidebarRight.presentSession(panelId, sessionId)`，返回幂等释放函数。租约自己持有一个原 Session 引用，只有对应主面板活动时呈现；同面板重复申请、空白标识或未保留会话拒收且不替换原租约。气泡、卸载及换会话释放；停靠／悬浮切换保留同一租约。调用失败由插件显示并保留草稿。

`SidebarSessionViews`、controller 的 `mounted` 和 `RightbarRoot` 共用选择结果，原生主会话选择不变。来源仍走 `openResource` 的预览与权限路径，已初始化标签按原 owner 保留和清理。接口由源 `ISidebarRight` 公开；右栏不在工具反射目录中，不新增模型工具或 Remote 协议。

## 浏览器主空间

`ctx.sidebarRight.focusPresentation(sessionId)` 仅聚焦当前已呈现会话，返回幂等释放函数；释放时恢复原侧栏布局，不改变原生主会话或创建标签。插件先保留会话、取得呈现租约并确认 `mounted`，再聚焦；打开动作经原 `openTab`，继续使用不重复打开。

`browser.toolbar.actions` 插槽提供当前会话、`tabId` 与 `active`。厂商目录由插件持有，宿主不内置 AI 产品名单。原桌面 guest 保活规则保持不变；Web iframe 的离页重载属于目标宿主既有行为，不用插件常驻租约伪装桌面保活。

## 原生定时任务启停

Schedule 新增 Host 本地 `readCatalog(reader, signal)`，仅在初始化及取消检查后同步调用 reader，不接受 Promise、不暴露内部 domain/table、不扩展 Remote 回调。catalog 继续投影同一任务表；调用方在 reader 内同步消费 WorkspaceRegistry 当前成员并接纳操作，门前撤回拒收，门后已接纳不冒称可回滚。；该接纳点不是磁盘提交。

`uiScheduleNavigation` 提供可释放的入口隐藏租约：鲸翼定时任务接管员工入口时隐藏重复原生侧栏项，释放恢复，调度服务与数据保持。适配实现由 [schedule.mjs](schedule.mjs) 持有。

`schedule.pause(request, signal?)` 与 `schedule.resume(request, signal?)` 使用原 Schedule 队列和持久任务表。请求为 `{ sessionId, id, expected: ScheduleRecord, expectedStatus: 'active' | 'paused' }`，返回原 `ScheduleUpdateResult`；成功返回 `{ id, updated, record }`，状态从 `catalog()` 读回。`update` 同样必填 `expectedStatus`，同时比较状态和完整记录；记录已变更或投递已推进时返回 `schedule_conflict`，调用方先读回，不自动覆盖。

`catalog().status` 为 `active | paused | inactive`。`list` 保持只返回活动任务，暂停任务的编辑从 catalog 读取并剥离 sessionId、status、lastDelivery，作为 expected。原生 UI 与模型更新消费者同步接入状态 CAS，暂停记录仍可编辑。删除继续移除任务和投递历史，不充当暂停。

模型 `schedule_update` 通过 `scheduleView` 投影 CAS 已确认的状态；暂停任务返回 `state: 'paused'`，不因目标在未来或已过期而显示 scheduled／overdue。原输出 schema 同步接纳 paused，工具反射与模型渲染共用该定义；活动任务和 create／list 保持原时间状态语义。

暂停在原持久写入提交后成立；此前已接受投递保留其队列消息与回执，提交后调度器不再接受该任务的新投递。恢复保持同 ID、原会话和历史，复用原时间算法跳过暂停期次，已有未来目标保持不变。过期的一次性任务返回 `not_future` 并保持暂停，先编辑未来时间再恢复；时间范围内没有下一期次返回 `time_out_of_range`。取消只在写入前生效，写入失败与接受未知由调用方读回，不宣称自动回滚。

旧存量只由 Schedule 原存储 schema 的缺失 status → active 入口兼容；新增 paused 不扫描、不重写已有记录，不产生插件任务镜像。旧程序不识别 paused 数据，程序回退前须由数据 owner 明确处理暂停记录或恢复对应原数据快照，不能把纯程序回滚当作持久数据降级。转换集合同时覆盖 Schedule Host、类型实现、存储、工具、Host/remote codec、浏览器聚合 codec、工具反射及原生任务 UI；原 runtime 基线只读。

局部验证执行 `node --test plugins/whalewing/tests/host-schedule.test.mjs plugins/whalewing/tests/host-adapter.test.mjs`，覆盖真实转换后方法、时间算法、调度器和三端 codec。测试存储边界为独立内存持久字节，不替代真实 profile 重启、浏览器 RPC 和正式客户端验收。

## 字节转换与应用

推荐打包方消费纯字节转换，不直接改动运行中的程序：

```js
import { readRuntime, transformFiles } from './adapter.mjs';

const original = await readRuntime(runtimeRoot);
const { state, files } = transformFiles(original);
// files 是相对 runtime 根目录的程序路径 -> Buffer；调用方负责保留原包并打包验证。
```

只有持有停机、备份及应用授权的主线程使用文件写入接口：

```js
import { readRuntime, applyRuntime, rollbackRuntime } from './adapter.mjs';

const original = await readRuntime(runtimeRoot);
// 在首次写入前，由调用方将原程序包或 original 保留到其已批准的恢复位置。
await applyRuntime(runtimeRoot);
await rollbackRuntime(runtimeRoot, original);
```

`applyRuntime` 全部预检后才开始写入，逐文件验证写后字节，发生错误原位恢复已触及文件；恢复失败会抛出包含失败文件的 `AggregateError`，调用方必须停止并使用原始程序恢复。全套已适配时返回 `state: 'adapted'` 且不重写。`rollbackRuntime` 只恢复集合内的程序文件，不写配置、会话或知识正文，也不覆盖应用后的未知改动。`writeFile` 可选参数仅用于注入可控磁盘失败测试。

接口不提供运行中跨文件原子切换或进程终止功能。调用者必须先确认目标停用；实际客户端的 asar 替换、启动验收和原包恢复属于主线程操作。预检后并发改动和外部写入者不由本模块取得管理权。

`archive.mjs` 的 `adaptArchive(originalBuffer)` 提供纯 Buffer → Buffer 的 ASAR 转换：只接受已核验的连续 packed 布局，复用同一 `transformFiles`，更新目标程序的大小、SHA256 分块校验及所有 packed 偏移；非目标内容、额外元数据、link 与 unpacked 条目保持不变。它不读取 sidecar、不写路径、不改 EXE、不执行安装。`inspectArchive` 供调用方逐文件核验，返回的字节视图保持只读。ASAR 原包回滚与最终应用由主线程持有。

## 验证

在项目根执行 `node --test plugins/whalewing/tests/host-adapter.test.mjs`。测试默认只读 `.artifacts/youjin-first-version/runtime`，也可用 `WHALEWING_HOST_ADAPTER_BASELINE` 指向同版未适配程序；需要本地存在对照提交。每项磁盘测试使用独立 `mkdtemp` 副本并清理，不占用端口或共享生成态。

测试证明转换和局部语义，不代替真实浏览器 RPC、专家选模请求、UI 位置、正式客户端应用及独立 Fresh Check。

ASAR 合成包验证执行 `node --test plugins/whalewing/tests/host-archive.test.mjs`，直接使用已安装官方 Pickle／integrity 实现交叉验证，不加载缺失依赖的 ASAR 顶层入口。主线程可设置 `WHALEWING_TEST_ASAR` 为待检原包绝对路径，启用可选的纯内存适配与全部文件逐项对比；默认不执行该重型检查，不写原包或 stage。

右栏局部回归执行 `node --test plugins/whalewing/tests/host-sidebar.test.mjs`，实际编译 owner 覆盖原错误、来源地址与行参数传递、活动面板切换、原生主路径、重复拒收、幂等与标签释放。预览正文渲染和实际行定位仍须由主线程在真实浏览器复验。
