---
description: "在 DSH 中使用可配置专家、个人知识库与小鲸助手，管理个人技能、定时任务、每日资讯、本地工具台与模型世界。"
kind: "package-bundle"
---

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="art/brand/whalewing-dark.svg">
    <img src="art/brand/whalewing.svg" width="96" alt="鲸翼标志：鲸尾为翼">
  </picture>
</p>

# 鲸翼 DSH 插件

> 鲸翼 · DSH 超级个体工作台 —— 积厚培风，扶摇九万里

DSH 超级个体工作台：选专家直接干活，经验沉淀到个人知识库，常用办公处理在本机完成。版本 `0.1.1`（开发中）。

## 名字和标志

名字取自《庄子·逍遥游》：“北冥有鱼，其名为鲲……化而为鸟，其名为鹏。”DSH 是那条鲸，鲸翼给它装上鹏的翅膀。知识沉淀、技能复用、专家团队都是托起翅膀的风：“风之积也不厚，则其负大翼也无力。”

标志叫“鲸尾为翼”：出水的鲸尾，两片尾鳍画成一对鹏翼，整体也是 WhaleWing 的 W，下面一道水纹是北冥。文件在 [art/brand](art/brand)：

| 文件 | 用在哪 |
| --- | --- |
| `whalewing.svg` / `whalewing-dark.svg` | 彩色版，分别放在浅色、深色背景上；工作台标题用这一版 |
| `whalewing-mono.svg` | 单色实心版，颜色跟随文字；侧栏图标用这一版 |
| `whalewing-outline.svg` | 描边版（24 网格、1.4 线宽），和线条图标放在一起时用 |
| `whalewing-app.svg`、`whalewing-app-256.png` | 应用图标（深蓝圆角底）：仓库头像、社交分享图 |

不要把标志改成 DeepSeek 的品牌蓝，也不要去掉翅膀单用鲸身：DeepSeek 自己的标志就是一条蓝鲸，靠翅膀和更深的北冥蓝跟它区分。

## 安装

用 DSH 自带的「插件 → 添加插件」安装，不需要额外工具（DSH 自带 pnpm），支持 DSH `0.2.0-rc.2` 到 `0.2.x`（只在 `0.2.0-rc.2` 上实测过）。在输入框里填下面任一种地址：

| 来源 | 填什么 |
| --- | --- |
| GitHub 仓库 | `github:gwenliu1025/whalewing`；指定版本时写 `github:gwenliu1025/whalewing#whalewing-v0.1.1`。仓库必须是公开的：DSH 用不带账号的方式拉取，私有仓库会装不上 |
| 插件包文件 | 插件包 `.tgz` 的绝对路径（在本目录运行 `npm pack` 生成），适合私下发给同事 |
| 本机开发目录 | 本目录的绝对路径。这是链接方式，要求本目录的 `node_modules` 带齐依赖（包括 DSH 自身的包），只适合开发机 |

装好后建议在插件页同时打开 DeepSeek 官方的「定时任务」插件，定时任务和每日资讯依赖它；它自带的「自动化任务」页面与本插件的定时任务重复，可以在 profile 配置里关掉：

```yaml
- id: ui-schedule
  disabled: true
```

### 不改 DSH 时哪些功能会降级

插件在原版 DSH 上就能用。少数体验依赖 [宿主适配](host-adapter/README.md)（要替换 DSH 的程序文件，目前只有一键安装器会做），没有适配时自动降级、不报错：

| 功能 | 原版 DSH 上的表现 |
| --- | --- |
| 专家入口 | 新会话首页没有专家按钮，专家选择放在输入框左侧；选好后立即生效 |
| 专家专属模型 | 不切换，专家跟随会话当前模型（原版切换模型会顺带改掉你的默认模型） |
| 专家绑定 MCP | 不能单独绑定，专家照常使用 DSH 里启用的全部 MCP |
| AI 网页 | 在一个名为「AI 网页」的会话右侧的内置浏览器里打开，不铺满工作台；同一个 AI 仍只占一个标签 |
| 小鲸助手 | 照常对话，引用资料不在侧栏预览 |
| 定时任务 | 不能暂停或恢复（可以取消后重建）；DSH 自带的「自动化任务」入口不会被隐藏 |

需要完整体验时用 zip 安装器（`node scripts/package-installer.mjs` 生成，只支持 DSH `0.2.0-rc.2`）：它在安装插件的同时替换 DSH 的程序文件以应用 [宿主适配](host-adapter/README.md)，可以一键还原。

## 功能

| 标签 | 内容 |
|---|---|
| 专家团队 | 7 位内置专家（小鲸助手、售前、需求、研发、实施、测试、运维），可新增自定义专家，配置提示词、模型、技能和 MCP，选择预置头像或上传头像；专家优先用绑定技能，员工自己安装的技能贴合任务时也可加载 |
| AI 网页 | 在 DSH 内置浏览器里打开 DeepSeek、豆包、Kimi、ChatGPT 等 10 个官方网页，可自行添加 |
| 个人知识 | 本机 Markdown 知识库：首次使用自动建好十区与常用二级目录、知识库规则、13 个笔记模板和 Obsidian 视图；目录、阅读编辑、关系图谱，可把笔记引用到对话 |
| 技能成长 | 系统技能与个人技能管理，可和小鲸一起从知识里提炼新技能 |
| 定时任务 | 按时自动执行的任务：每日知识整理（默认关闭）、每日资讯（默认开启）、自建任务；统一在 `~/.dsh/whalewing-tasks` 执行，插件加载时登记为侧栏的“鲸翼定时任务”工作区，不需要填工作目录 |
| 工具台 | 7 个工具 40 项本地处理功能：格式转换、PDF、表格、图片（含打码、去水印）、文字、音视频、二维码。文件不上传 |
| 知识卡片 | 每日学习卡片（管理、经济、AI 技巧）和每日资讯（每天 08:00，8–15 条一行标题配一手链接） |
| 模型世界 | 18 家厂商的模型图鉴、发布时间线、实力榜（综合／推理与知识／编程／智能体／性价比）和角色对决 |

小鲸助手可停靠在页面右侧或悬浮，随时对话。

## 数据存放

| 内容 | 位置 |
|---|---|
| 个人知识库 | 插件配置 `vaultRoot`；Windows 默认在 DSH 安装目录同级的 `whalewing-vault`。插件内部数据（设置、来源覆盖、随包文件指纹、恢复材料）在库内 `.whalewing` |
| 专家配置、技能、定时任务 | DSH 当前 profile 的存储 |
| AI 网页入口、每日资讯 | profile 目录下 `whalewing-ai-web`、`whalewing-news` |
| 定时任务执行目录 | DSH 数据目录下 `whalewing-tasks`（侧栏“鲸翼定时任务”） |
| 模型数据快照 | profile 目录下 `cache/whalewing-model-world`；点「更新数据」才联网获取 |

插件停用、升级或替换都不会删除以上数据。

## 知识库的随包内容

`content/vault` 是初始化时复制进员工知识库的规则、模板、首页、根目录 `AGENTS.md` 和 `00-系统/Bases` 视图，不含任何个人知识；二级目录由 `src/vault.js` 的 `layout` 建立。已经初始化的库在插件升级后自动补齐：缺的补上，员工没改过的随包文件更新为新版，改过的保持原样并在 `status` 的 `bundle.kept` 中列出，员工笔记不动。依据是库内 `.whalewing/bundle.json` 记录的指纹。

## 模型世界的数据

- 模型目录来自开源项目 [ai-model-world](https://github.com/liyupi/ai-model-world) 聚合的公开数据，点「更新数据」才联网。
- 综合实力取 Artificial Analysis 智能指数（`src/model-world-index-data.js`，当前 v4.3、截至 2026-10-14）中每个模型最强思考档的成绩，梯队 T0 ≥ 52、T1 ≥ 44、T2 ≥ 34，其余 T3。更新：在本目录运行 `node scripts/update-model-index.mjs`（读取环境变量 `WHALEWING_AA_API_KEY`，免费版每天 100 次请求），重新构建后提交。
- 推理与知识、编程、智能体三个分项只采用第三方评测（Epoch AI、LiveBench、models.dev 中的第三方成绩），换算成在全部模型中的百分位后按维度取平均，不采信厂商自报。
- 性价比按相对消耗（GPT-5.6 Luna 轻度一次评测任务约 0.01 美元记为 1）分 7 档，每档推荐能力最强的“模型 + 思考强度”。
- 对决只看综合实力，双方都缺综合实力时按分项加权百分位。
- 只收录有角色立绘的 18 家厂商，名单在 `src/model-world-roster.js`。19 个角色由鲸翼作者原创设计，靠身上的模型官方标识小饰物、品牌色和厂商自身意象辨认；立绘依 CC BY-NC-SA 4.0 授权，商用须另取作者授权，见 [立绘说明](content/model-world/portraits/NOTICE.md)。

## 开发

```powershell
node scripts/build.mjs
node --test tests/*.test.mjs content/content.test.mjs
```

工具台第三方依赖装在 `.artifacts/youjin-workbench/dependencies/utilities`，通过 `src/utilities/node_modules` 链接引用，构建时内联进 Worker，并经许可审计核对。工具台说明见 [src/utilities/README.md](src/utilities/README.md)。

## 限制

- 宿主适配只对应 DSH `0.2.0-rc.2`，升级 DSH 后需要重新适配。
- 工具台在浏览器 Worker 中处理：单文件 25 MB、总量 100 MB、PDF 200 页、音视频 30 分钟以内；扫描件 PDF 不做文字识别。
- MP3 编码库 `@breezystack/lamejs` 为 LGPL-3.0 许可，正式对外分发前需确认合规方式。

## 许可

代码依 [Apache License 2.0](LICENSE) 授权。“鲸翼”“WhaleWing”名称和“鲸尾为翼”标志不在许可范围内，发布改版请换用其他名称和标志；模型世界立绘依 CC BY-NC-SA 4.0 单独授权，商用须先取得作者授权；第三方内容保留各自许可。详见 [NOTICE](NOTICE)。
