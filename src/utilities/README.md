# 工具台与 AI 网页

员工选择本地文件，工具台在本机处理并提供下载：不上传文件，不调用模型，不覆盖原件。

## 工具与功能

目录由 [catalog.js](catalog.js) 持有：7 个工具，每个工具包含多项功能。

| 工具 | 功能 |
|---|---|
| 格式转换 | Word 转 PDF、PDF 转 Word、图片转 PDF、PDF 转图片、Excel / CSV 互转、Excel 转 JSON、Word 转 TXT、提取文档图片 |
| PDF 工具 | 合并、拆分、页面整理、旋转、添加页码、添加水印、提取文字 |
| 表格处理 | 合并表格、拆分工作表、数据去重、两表核对、条件筛选、数据排序、清理空白 |
| 图片处理 | 压缩与转格式、旋转翻转、裁剪、拼接长图、宫格切图、添加水印、隐私打码、去除水印 |
| 文字处理 | 整理与统计（去重、清空行、字数统计、CSV / JSON 互转）、批量替换、Word 版本对照 |
| 音视频 | 视频提取音频、音频转格式、音频剪切（MP3 / WAV）、视频截图 |
| 二维码 | 生成二维码（PNG + SVG）、批量生成、识别二维码 |

裁剪、打码、去水印在预览图上拖框选区。去水印用周围颜色由外向内填补，适合纯色或渐变背景上的文字水印。

## 结构

| 文件 | 内容 |
|---|---|
| [views.js](views.js) | 工具卡片、工具窗口（左侧功能、右侧操作）、选区工具、任务运行器 |
| [worker.js](worker.js) | Worker 入口，按功能 id 分派到下列模块 |
| [core.js](core.js) [pdf.js](pdf.js) [office-tasks.js](office-tasks.js) [image.js](image.js) | 文档、PDF、表格、图片处理 |
| [extras.js](extras.js) | 打码、去水印、宫格切图、二维码、音频编码 |
| [media-prep.js](media-prep.js) | 主线程的音频解码和视频截图（Worker 中没有这些浏览器能力） |
| [ai-web.js](ai-web.js) | AI 网页入口 |

每次处理开一个独立 Worker，60 秒超时；取消、超时、关闭工具都会立即终止任务并释放下载链接。音视频先在主线程解码，再交 Worker 编码。

## 限制

单文件 25 MB，总输入与输出 100 MB，一次最多 20 个文件，PDF 最多 200 页，图片最多 3200 万像素，音视频最长 30 分钟、500 MB。扫描件 PDF 不做文字识别。Word 转 PDF 不支持公式、图表、浮动图形和修订。

## 依赖与许可

依赖装在 `.artifacts/youjin-workbench/dependencies/utilities`，构建时内联进 Worker。`scripts/utility-licenses.mjs` 按 `content/utilities/audited-source.json` 核对每个依赖的版本和文件指纹，许可原文汇总在 `content/utilities/THIRD_PARTY_NOTICES.txt`。新增依赖必须先登记，否则构建拒收。

`@breezystack/lamejs`（MP3 编码）为 LGPL-3.0；其余为 MIT、Apache-2.0 等宽松许可。
