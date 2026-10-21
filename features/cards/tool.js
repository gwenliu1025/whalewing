import { defineTool } from '@deepseek-ai/dsh-tools';
import { newsSubmitLimit } from './contract.js';
/** 模型工具随所属功能注册与撤销。 */
export function apply(ctx) {
  // 资讯工具不经知识 execute，不取得初始化知识库或员工配置写权。
  ctx.tools.register(defineTool({
    name: 'whalewing_news', description: `每日资讯专用：fields列出已启用领域；candidates用fieldId读取冻结窗口的候选来源与receipt；submit仅提交本轮候选，最多${newsSubmitLimit}个去重事件，不足按实际数量、不凑数；没有相关内容可提交空数组。普通条目必须在自身sourceIds中有有效正文，才可提交中文概括；无正文只提交headline分支的sourceIds（恰好1个）、category、label，原标题和来源链接由工具投影，不混入其它字段。只允许已认领news的原生会话。不修改配置，不创建计划，不写知识库。`,
    parameters: {
      action: { type: 'string', enum: ['fields', 'candidates', 'submit'], required: true },
      fieldId: { type: 'string' }, receipt: { type: 'string' },
      // 原生工具实际发出的 oneOf 与 Cards 严格输入分支一致；数组数量由 Cards 校验。
      items: { type: 'array', items: { oneOf: [
        { type: 'object', properties: {
          sourceIds: { type: 'array', items: { type: 'string' }, required: true, description: '本条引用的1至10个候选，至少一个有有效正文。' },
          category: { type: 'string', enum: ['model', 'agent', 'opensource', 'media', 'research'], required: true },
          label: { type: 'string', enum: ['official', 'media', 'leak'], required: true },
          ...Object.fromEntries(['eventKey', 'title', 'link', 'brief', 'relevance'].map(key => [key, { type: 'string', required: true }])),
        }, additionalProperties: false },
        { type: 'object', properties: {
          sourceIds: { type: 'array', items: { type: 'string' }, required: true, description: '恰好1个无有效正文的候选。' },
          category: { type: 'string', enum: ['model', 'agent', 'opensource', 'media', 'research'], required: true },
          label: { type: 'string', const: 'headline', required: true },
        }, additionalProperties: false },
      ] } },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async (args, exec) => {
      exec.signal.throwIfAborted();
      return JSON.stringify(await ctx.whalewingCards.executeNews(args, { agent: exec.agent, signal: exec.signal }));
    },
    presentCall: args => ({ card: 'generic', title: '每日资讯', kind: args.action === 'submit' ? 'other' : 'read', rawInput: args }),
  }));

}
