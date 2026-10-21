# AI 模型世界来源与修改

上游：[程序员鱼皮（liyupi）/ ai-model-world](https://github.com/liyupi/ai-model-world)。契约审核提交：`9ee3ad749c8d7405aa090d1023c197b234e4365f`；唯一聚合输入为该仓库 `data/models.json`。鲸翼自行实现宿主内的快照适配、字段准入、搜索与排序，并重新绘制亮色界面；不复制原像素素材或字体。

原项目代码、文档及编排的 MIT 声明见 `LICENSE-ai-model-world.txt`；MIT 不延伸为所有聚合字段的统一许可。字段来源按快照的 `provenance` 检查：`models.dev` 的 MIT 元数据、上下文、价格、能力与发布日期进入展示，许可见 `LICENSE-models-dev.txt`；仅由 `derived` 标识的名字属于上游身份编排，其余派生事实不展示。不展示未知来源字段，也不从汇总值反推被排除数据。

综合实力、梯队和性价比使用 [Artificial Analysis](https://artificialanalysis.ai/leaderboards/models) 智能指数及其单次任务成本，数据由 `scripts/update-model-index.mjs` 从 AA 免费接口生成后随插件提交；按 AA 的要求，展示时注明来源。推理与知识、编程、智能体三个分项使用快照中的第三方评测成绩（[Epoch AI](https://epoch.ai/benchmarks) 按 [数据使用说明](https://epoch.ai/benchmarks/use-this-data)及 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 署名，另有 LiveBench 与 models.dev 中标为第三方的成绩），换算为在全部已测模型中的百分位后取平均；不采信厂商自报成绩。来源署名、生成时间与每个来源的抓取状态在界面“数据来源与算法”中显示。

价格单位为美元／百万 token，只代表上游目录数据，不代表员工实际转发站费用。未提供分数表示缺少已准入评测，不表示模型较差。刷新不使用模型账户；按员工显式刷新从同仓库获取，失败保持旧数据。
