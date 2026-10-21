# 编写鲸翼二级插件

二级插件是独立的 DSH 插件包。安装、启用、关闭和卸载都在 DSH「插件」页完成；鲸翼只提供工作台页签和下面的 v1 接口。无需修改鲸翼源码，也不要导入鲸翼内部文件。

当前接口仍在开发中；首次发布版本及 `peerDependencies.dsh-whalewing` 范围，**以首个带 v1 扩展接口的封版版本为准**。当前起步模板不填写该范围，不以任意版本范围代替兼容验证。`apiVersion` 与插件包版本不是同一件事。

## 从模板开始

[文本预览模板](examples/feature-starter/README.md)包含 Host、浏览器源码、预构建客户端、图标、名称说明、构建脚本和独立测试。复制整个目录到自己的项目，不放进鲸翼内置 `features/`。修改 `package.json` 的 `name` 与 `whalewingExtension.id` 后重建，Host、Client、原生行和 ModuleLoader 身份从这两项派生；再修改标题、locale、图标和业务内容。模板不随鲸翼自动安装。

需要保存数据时参考[保存文本示例](examples/stateful-feature/README.md)：独立 Remote、原生数据域、CAS、写后读回、关闭保留和单独清除。它只保存一条文本，不附带网络或定时任务；具体能力由开发者自己的需求决定，不复制鲸翼内部存储模块。

开发验证使用 DSH「插件 → 添加插件」，填写 `link:<扩展目录绝对路径>`。安装成功后点击「立即启用」。未安装鲸翼或鲸翼总开关关闭时，扩展等待依赖；开启鲸翼后自动加载。单独关闭扩展会撤销其页签；关闭总开关会停止整个工作台及依赖它的扩展。模板的运行前提、构建和清理步骤见模板说明。

允许包名使用 `dsh-whalewing-` 前缀，表示“给鲸翼用的扩展”；插件标题须使用自己的功能名，不叫“鲸翼 xx”，不使用鲸翼标志，也不暗示官方发布或认可。名称和标志规则见 [NOTICE](NOTICE)。

## Host：登记与只读知识

Host 导出 `inject: ['whalewing']`，在 `apply(ctx)` 中同步登记：

```js
export const inject = ['whalewing'];
export function apply(ctx) {
  // 与浏览器页签使用同一功能 id；绑定当前插件的生命周期。
  ctx.whalewing.features.register(ctx, {
    id: 'my-feature', api: 1, package: 'dsh-whalewing-my-feature',
    tab: { keepAlive: true },
  });
}
```

`ctx.whalewing.apiVersion` 当前为 `1`。`features.register(ctx, manifest)` 返回撤销函数；当前 `ctx` 卸载时也自动撤销，不要把登记绑定到其他插件或根上下文。

| 字段 | 要求 |
| --- | --- |
| `id` | 必填，字母开头的小写短横线标识，最长 80 字符；所有扩展之间唯一。内置 id 即使功能关闭也保留，不能占用 |
| `api` | 必填整数，当前为 `1` |
| `package` | 必填，当前扩展的完整包名，最长 214 字符 |
| `skills` | 可选，最多 100 个随包技能目录的绝对路径；可用 `fileURLToPath(new URL('./skills/example/', import.meta.url))` 构造。关闭扩展后退出技能来源，文件不删 |
| `tab` | 可选，仅含 `placement: 'end'`、`keepAlive: true`、`icon`。不需要的字段省略，不传 `false` 或其他扩展字段 |
| `tab.icon` | 可选，最多 65536 字符的单色 SVG 字符串，按 16px 蒙版显示并随文字颜色变化，不作为页面 HTML 插入 |

`placement: 'end'` 把页签放到靠右组；`keepAlive: true` 在第一次打开后保留已挂载组件，切页签不会卸载。它不保留关闭扩展、关闭工作台或页面刷新后的内存状态。图标与保活信息只在 Host `tab` 中声明，不重复写进插槽选项。

重复或保留 id 抛 `FEATURE_CONFLICT`；不支持的接口版本抛 `FEATURE_API`；非法字段或格式触发输入校验。本行加载失败，原生插件页显示原因，修正扩展后重新启用；不要捕获后伪装登记成功。

登记完成后可从同一 `ctx` 或其子插件调用：

```js
const result = await ctx.whalewing.knowledge.search('关键字', { signal });
// result 为 { notes, total, truncated }；路径以实际搜索结果为准。
if (result.notes.length) {
  const note = await ctx.whalewing.knowledge.read(result.notes[0].path);
  // note 是含 path、content、hash 的对象，不是正文字符串。
}
```

- `search(query, options?)`：查询最长 200 字符；空串可列出笔记，结果受知识库上限约束。`options` 仅支持 `signal: AbortSignal`，不接受分页、写入动作或其他选项。
- `read(path)`：路径来自知识库结果，返回笔记对象；此方法没有第二个 options 参数。路径、读取范围和大小由知识库统一校验。
- 调用记录带扩展包名和功能 id；未登记报 `FEATURE_CALLER`，卸载后的调用报 `FEATURE_CLOSED`。不要捕获服务对象供其他插件绕过登记使用。
- 这两个接口只读。写知识应让模型通过 `whalewing_knowledge` 工具，遵守知识库原有规则；不公开知识库或配置写入接口。
- 外部插件与其他 DSH 插件处于同一运行环境，这不是权限沙箱。扩展自行声明和管理自己的文件、服务与外部调用，不把内部对象访问当作 v1 能力。

## 浏览器：登记页签

客户端通过 DSH 模块工厂加载，React 从工厂的 `require('react')` 取得，构建时标为 external，不打入另一份 React。模板已给出完整构建入口。

```js
export const inject = ['slots', 'locale'];
export function apply(ctx) {
  // 浏览器入口先完成启动；鲸翼缺席时只等待子作用域，不阻断 DSH 页面。
  ctx.inject(['whalewingWorkbench'], scope => {
    scope.slots.inject('whalewing.workbench.tab', () => scope.slots.register({
      name: 'whalewing.workbench.tab', id: 'my-feature', order: 100,
      label: () => scope.locale.resolveText({ zh: '我的功能', en: 'My feature' }),
    }, MyView));
  });
}
```

Host 的 `inject: ['whalewing']` 是必需依赖，缺席时原生行等待。浏览器不同：顶层入口不要强依赖 `whalewingWorkbench`，在 `apply` 内用不等待返回值的 `ctx.inject` 建立子作用域；所有依赖鲸翼的插槽、监听和服务访问放在该 `scope` 下。服务出现时加载、消失时撤销，再出现时重新加载。DSH 启动检查要求浏览器入口已激活；把顶层入口留在等待会阻断整个页面。`dsh.client.immediately` 只影响预取，不能代替这项生命周期处理。

`id` 必须与有效 Host 登记相同；内置顺序为 10–80，外部建议从 100 起。每个扩展至多提供一个匹配页签；同 id 的原始 slot 重复时，即使 priority 不同也不选取其中一个。Client 提前加载、Host 失败或尚无有效完整登记时，页签不取得工作台操作资格。不要用可填写的 slot `registrant` 充当包身份。列表型插槽只承载 `id/order/label` 等原生字段；不要往里面塞 `keepAlive/placement/icon`。功能可只有 Host 而无页签：鲸翼详情的扩展区仍按登记的包名读取原生标题，并提供「打开」。

`MyView` 接收 `active` 和 `workbench`。`active` 为当前页签是否选中，隐藏的保活页签应暂停只在可见时运行的动画或任务。`props.workbench` 在本次有效登记期间是绑定本页签的稳定对象，方法不会误登记到另一个正在显示的页签。特别是 `guardLeave/onRefresh` 只在它上面调用，不在根 `ctx.whalewingWorkbench` 调用。同 id 卸载重开、登记或视图替换、真实连接重建时旧对象失效，旧保活组件被卸载；不要把它缓存到新实例或用旧回调继续操作助手和其它页签。

## 工作台公开方法

| 方法 | 行为与清理 |
| --- | --- |
| `notify(text, { kind, action })` | 右上角提示；`kind` 为 `success/error/info`，`action` 为 `{ label, run }`。`notify(null)` 清除提示。失败带具体恢复动作，不在页面中间插入错误块 |
| `run(task)` | 统一忙碌状态，`task(signal)` 接收取消信号；等待期间禁止切页签。「停止等待」取消信号。其他操作忙碌或本页签已撤销时不执行。返回的 Promise 只用于等待收尾，不返回 task 结果，也不以 Promise 完成证明业务成功 |
| `guardLeave(fn)` | 登记离页提示，`fn()` 返回文字或空值；返回撤销函数。它提示但不阻止导航，不是保存或确认机制。需要确认的删除/放弃操作使用 `ConfirmDialog` |
| `onRefresh(fn)` | 登记本页签的页头刷新动作，返回撤销函数；没有登记就不显示刷新按钮。刷新实现自行调用 `run`、处理错误，不假定它自动串行执行 |
| `openTab(id)` | 打开已有页签；不存在或工作台忙碌时不切换 |
| `manageFeatures()` | 打开 DSH 插件页的鲸翼详情；当前环境无导航服务时无动作 |
| `explainError(error, extraGuide?)` | 返回错误说明文字；`extraGuide` 为 `{ [code]: '说明文字' }`，匹配时覆盖通用说明 |
| `assistant.open(prompt, { paths }?)` | 打开小鲸助手并带提问、知识库笔记路径；不是直接发模型请求 |
| `assistant.setContext(paths)` | 修改助手引用的笔记路径；助手尚未就绪时无动作 |

在 React effect 中登记并清理回调；异步任务既要传递 `signal`，也要在写状态前检查取消，并清理自己的计时器、监听、Worker、对象 URL 和外部请求。关闭扩展会释放统一忙碌状态并撤销页签，但不能替扩展回滚已经发生的外部副作用。长操作必须有界；页面卸载后不得继续写状态或提示。

```js
useEffect(() => {
  const off = workbench.onRefresh(() => workbench.run(async signal => {
    const result = await readMyData({ signal });
    signal.throwIfAborted();
    setData(result);
  }));
  return off;
}, [workbench]);
```

`run` 捕获未处理错误并显示统一提示；需要业务重试时，在任务中将错误翻译后调用 `notify(..., { kind: 'error', action: { label: '重试', run: retry } })`。取消不当作失败重试，未知外部接受状态先查询结果，不盲目重复写入。

## 统一组件和样式

从 `workbench.ui` 取组件，无需导入源码：

| 组件 | props |
| --- | --- |
| `Modal` | `title`、`onClose`、`children`；可选 `busy`、`className`。详情用居中弹窗；需要小号时 `className: 'yj-confirm'` |
| `Drawer` | `title`、`onClose`、`children`；可选 `busy`、`footer`（按钮元素数组）。编辑表单用右侧抽屉 |
| `ConfirmDialog` | `title`、`message`、`confirmLabel`、`cancelLabel`、`onConfirm`、`onCancel`；可选 `danger`、`busy`。删除确认设 `danger: true` |
| `ActionMenu` | `label`、`children`（操作按钮）；可选 `iconOnly`、`icon`。单项编辑/删除收进菜单 |
| `Logo` | 可选 `size`（默认 16）、`tone`（默认 `mono`，可用 `brand`）。仅作鲸翼能力的标识，不替代扩展自己的图标 |

公共样式在工作台 `.yj-page` 范围生效：

| 类 | 用途 |
| --- | --- |
| `yj-card`、`yj-grid` | 内容卡片与卡片网格 |
| `yj-add-card`、`yj-add-mark` | 与 `yj-card` 合用的加号卡片及加号图形 |
| `yj-row` | 横向控件行，窄屏换行 |
| `yj-primary`、`yj-danger` | 主按钮、危险操作按钮 |
| `yj-field` | 表单字段；行内输入控件需自行设合理宽度 |
| `yj-muted` | 辅助说明 |
| `yj-section` | 有边框的固定内容区，不用于临时结果或展开确认 |
| `yj-dialog-actions` | 居中弹窗底部的操作行 |

成功/失败都用提示；确认和详情不在正文插入新块挤动布局；编辑用抽屉；列表新增用加号卡片。按钮写具体动作。失败文案说清发生了什么、问题在扩展还是设置/网络/文件、下一步怎么处理，不把错误码或内部术语当正文。

## 生命周期与接口升级

- 登记、插槽、Remote 挂载及监听绑定各自插件的 `ctx`；业务任务资源由扩展自行清理。重开不得残留锁、重复订阅或旧提示动作。
- 数据由扩展自己持有。关闭功能撤销入口，不应删除已保存数据；需要删除时另做明确确认。文本预览模板没有磁盘数据，保存文本示例演示独立持久化及清除。
- 只增加接口/字段时保持 `apiVersion`；改名、删除或改变行为时升级接口版本。新接口发布后至少再有一个封版版本同时支持旧接口。支持的包版本和 peer 范围在对应发布时更新，不预填未来版本。
- `whalewing.core/vault/skills`、工作台 `.internal`、领域内部服务及源码文件均不属于此文承诺；需要新的能力时先扩展公开接口，不跨入内部实现。
- 交付至少验证：缺鲸翼时等待、鲸翼开启后恢复、扩展开关、总开关、卸载、重复 id/API 不匹配、取消和卸载后无迟到更新；安装成功与功能可用分别检查。

## 独立开发、接入与发布

1. 复制完整示例到自己的独立目录，保留源文件、构建、测试与许可。完成自己的业务、输入校验、失败恢复和有界操作；业务 Remote、数据、任务和外部服务由自己的包持有。
2. 安装示例声明的依赖，在该目录运行 `npm run build` 与 `npm test`。React 继续使用宿主实例，不导入鲸翼内部文件，也不依赖原工作区路径。修改包名或 id 后检查生成 patch、ModuleLoader、Host 与 slot 一致。
3. 在独立 DSH profile 通过原生“添加插件”安装鲸翼与 `link:<扩展目录绝对路径>`。扩展先装、依赖后到也应恢复；开关扩展只影响自己的内容，不要求修改鲸翼组成、主 patch 或客户端映射。
4. 核验真实原生安装、启用、冷启动、页面操作、关闭、重开、总开关、卸载及重装；另测 Host-only、Host 拒收时 Client 不误进入工作台、异 priority 重复、同 id 替换、旧保活组件卸载和旧回调失效。自己的状态读回、错误、取消、资源收尾与持久副作用也分别核验。
5. 发布时由开发者确定版本、固定 Git 来源或原生包、准确兼容范围、完整源码入口、LICENSE 和实际分发文件；先验证该分发产物，而不以 `link:` 通过替代。`private: true`、`0.0.0` 只是模板开发起点，不是已发布版本。鲸翼 v1 的包 peer 范围仍按本文件开头的首次封版规则确定。

运行包、完整源码和开发模板是不同交付物。源码仓库应提供完整构建与测试；运行包按其实际文件清单交付，不要求安装者取得维护者的私有项目文档。维护鲸翼主插件见 [MAINTAINING](MAINTAINING.md)。

## 关闭、卸载、删除源码与清除数据

| 用户要做的事 | 实际动作 | 默认保留 |
| --- | --- | --- |
| 暂时关闭功能 | DSH 停用该原生行，撤销登记、页签、工具、技能来源和运行资源 | 安装包、源码、已保存数据；持久任务按该插件明确规则处理 |
| 从工作台卸载独立插件 | DSH 原生管理器移除安装依赖或链接，并核验加载退出 | 开发源码、业务数据、历史会话和已发布仓库 |
| 删除开发源码 | 在全部已知 `link:` 消费者退出后删除准确的开发目录 | 其它 profile、用户数据、历史仓库和已发布版本 |
| 清除业务数据 | 使用该插件明确的清除操作和范围确认，在卸载前完成读回 | 选择保留的历史及所有不属于此插件的数据 |
| 从鲸翼主源码裁掉内置功能 | 按 [主插件维护流程](MAINTAINING.md#从主源码退出一个内置功能)整体处理组成与消费者 | 其它功能及用户选择保留的数据 |

关闭或卸载鲸翼自身时，小鲸、工作台和随包管理技能来源都会退出。操作前先指定独立的 DSH 原生插件页、Creator 会话或外部 CLI，最后操作及其结果核验由该入口接管；即将退出的原小鲸不承诺继续反馈。持久计划按本节末尾的鲸翼规则先处理，原生 `stop-profile` 等结果按下面的卸载流程恢复。

### 卸载一个独立扩展

1. 查询当前 profile、实际包名、来源和原生行；检查有哪些其它插件依赖它。按实际对象操作，不凭显示名模糊删除。
2. 查明扩展创建的原生计划、外部作业或持久队列。用户选择停止/删除，或明确交接保留；用实际支持的原生接口操作，按原 taskId/sessionId 读回。当前接口没有暂停能力时不虚构暂停，未知结果先查原对象。
3. 默认保留数据。用户要求清数据时，在业务服务仍可用时按下一节执行；失败保留真实状态，不声称彻底移除。
4. 使用 DSH 原生“卸载”或实际 `plugin_manager.remove_bundle`。`stop-profile` 表示需要先停止对应 DSH，再按原生提示通过外部 CLI 处理；`bundle-in-use` 先处理仍在使用它的原生行。其它失败保留原诊断，不直接删 pnpm 或 profile 目录掩盖失败。
5. 分别核验安装记录、原生行、Host 登记、Client 页签、技能来源、旧操作范围、计时器/Worker/监听/网络以及持久任务。只看到页签消失不算卸载完成；外部已经接受的副作用不因取消等待自动回滚。

### 再删除开发源码

先枚举本次已知 profile 和工程中指向该准确目录的 `link:` 或其它路径引用，逐个通过原生管理解除并核验，停止自己的开发 watcher 和构建服务。未知 profile 未检查时明确范围，不宣称全机不存在引用。核对目录的真实绝对路径、链接边界和可恢复版本，只删除用户要求的源码根，不沿联接递归删除其它位置。删除后再次核验已知消费入口不再引用该目录；远端仓库和发布版本的删除是另一项动作。

### 单独清除数据

清除入口说明准确的 profile、数据域、记录和历史范围，使用独立确认；不要把删除知识库、会话或原生计划藏在“清除插件数据”里。使用该领域真实数据接口，提交后读回。清除失败或未知接受先查询，不反复提交；已卸载时先恢复匹配插件，通过它自己的接口处理，不猜测原生存储物理目录。

保存文本示例只清除一条正文，保留无正文版本标记防止旧窗口覆盖，属于该示例的明确行为；不是通用的“物理抹除全部数据”。开发者应准确说明自己的清除范围。

鲸翼的资讯还有一项明确区别：关闭 Cards 时，核心运行门会跳过资讯，但已有原生计划仍保留并推进；卸载鲸翼核心后运行门也退出，计划仍可能调用模型。卸载核心或删除相应源码前，先处理这些原生计划并核验，不能把删除保护代码当作停止任务。
