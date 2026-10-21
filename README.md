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

DSH 超级个体工作台：选专家直接干活，经验沉淀到个人知识库，常用办公处理在本机完成。

名字取自《庄子·逍遥游》：“北冥有鱼，其名为鲲……化而为鸟，其名为鹏。”DSH 是那条鲸，鲸翼给它装上鹏的翅膀。知识沉淀、技能复用、专家团队都是托起翅膀的风：“风之积也不厚，则其负大翼也无力。”标志“鲸尾为翼”的说明见 [art/brand](art/brand/README.md)。

## 功能

| 功能 | 内容 |
|---|---|
| 专家团队 | 7 位内置专家（小鲸助手、售前、需求、研发、实施、测试、运维），也可以新增自己的专家，配置提示词、模型、技能、MCP 和头像；每位专家都带上写作、设计、编码、排查等通用专业技能 |
| 小鲸助手 | 停靠在页面右侧或悬浮，随时对话；也能帮你管理鲸翼的功能和二级插件 |
| 个人知识 | 本机 Markdown 知识库：首次使用自动建好目录、规则、笔记模板和 Obsidian 视图；支持阅读编辑、关系图谱，笔记可引用到对话 |
| 技能成长 | 管理系统技能与个人技能，和小鲸一起从知识里提炼新技能 |
| 定时任务 | 每日知识整理、每日资讯和自建任务，到点自动执行 |
| AI 网页 | 在 DSH 内置浏览器里打开 DeepSeek、豆包、Kimi、ChatGPT 等官方网页，可自行添加 |
| 工具台 | 40 项本地文件处理：格式转换、PDF、表格、图片（含打码、去水印）、文字、音视频、二维码，文件不上传 |
| 知识卡片 | 每日学习卡片（管理、经济、AI 技巧）和每天 08:00 的资讯简报 |
| 模型世界 | 18 家厂商的模型图鉴、发布时间线、实力榜和角色对决 |

AI 网页、工具台、知识卡片、模型世界是可选功能，默认开启，可以在 DSH「插件」页的鲸翼详情里单独关闭；关闭后数据保留，重新开启继续使用。

## 安装

在 DSH 里打开「插件 → 添加插件」，填入：

```text
github:gwenliu1025/whalewing
```

想固定某个版本时，在地址后加 `#<标签或提交>`；离线安装可以填插件包 `.tgz` 的绝对路径。需要 DSH `0.2.1-rc.2`，原版 DSH 即可使用，与定制版的个别体验差异和从旧版升级的方法见[兼容与升级](COMPATIBILITY.md)。

## 扩展

可以给鲸翼开发自己的二级插件，不需要改鲸翼源码：从[起步模板](examples/feature-starter/README.md)或[保存状态模板](examples/stateful-feature/README.md)开始，接口和安装、卸载流程见 [EXTENDING.md](EXTENDING.md)。

## 数据存放

| 内容 | 位置 |
|---|---|
| 个人知识库 | 插件配置 `vaultRoot`；Windows 默认在 DSH 安装目录同级的 `whalewing-vault` |
| 专家配置、技能、定时任务 | DSH 当前 profile 的存储 |
| AI 网页入口、每日资讯 | profile 目录下 `whalewing-ai-web`、`whalewing-news` |
| 定时任务执行目录 | DSH 数据目录下 `whalewing-tasks`（侧栏“鲸翼定时任务”） |
| 模型数据快照 | profile 目录下 `cache/whalewing-model-world`；点「更新数据」才联网获取 |

停用、升级或替换插件都不会删除这些数据；插件升级时，知识库里你改过的规则和模板保持原样，笔记不动。

## 模型世界的数据

模型目录来自开源项目 [ai-model-world](https://github.com/liyupi/ai-model-world)；综合实力取 Artificial Analysis 智能指数，推理、编程、智能体分项只采用第三方评测，不采信厂商自报。角色立绘由鲸翼作者原创，见[立绘说明](content/model-world/portraits/NOTICE.md)。

## 使用限制

工具台在浏览器里本地处理：单文件 25 MB、总量 100 MB、PDF 200 页、音视频 30 分钟以内；扫描件 PDF 不做文字识别。

## 开发

```powershell
npm run build
npm test
```

源码结构、开发依赖和验证要求见 [MAINTAINING.md](MAINTAINING.md)。

## 许可

代码依 [Apache License 2.0](LICENSE) 授权。“鲸翼”“WhaleWing”名称和“鲸尾为翼”标志不在许可范围内，发布改版请换用其他名称和标志；模型世界立绘依 CC BY-NC-SA 4.0 单独授权，商用须先取得作者授权；第三方内容保留各自许可。详见 [NOTICE](NOTICE)。
