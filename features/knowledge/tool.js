import { defineTool } from '@deepseek-ai/dsh-tools';
import { approveEscalation } from '@deepseek-ai/dsh-sandbox';
/** 写入继续经过原生审批和唯一知识算法，不取得额外文件权限。 */
export function apply(ctx) {
  const parameters = {
    action: { type: 'string', required: true, description: '见各工具动作说明。' },
    path: { type: 'string', description: '知识库内十区相对 .md 路径。' },
    query: { type: 'string', description: '空格分隔关键词，最长200字。' },
    offset: { type: 'number', description: 'graph图谱分页起点，默认0；graph可用path限定一跳关系。' },
    content: { type: 'string', description: '完整Markdown，笔记含五属性和同名H1；技能含name/description正文。' },
    expectedHash: { type: 'string', description: 'read返回的当前SHA256；新建传空串。' },
    sessionId: { type: 'string', description: 'sources中已纳入的来源会话标识。' },
    afterSeq: { type: 'number', description: '当前coverage游标；省略即从未处理页开始，禁止跳页。' },
    receipt: { type: 'string', description: 'source_read返回的本页临时凭据。' },
    outputs: { type: 'array', items: { type: 'object', properties: { path: { type: 'string', required: true }, hash: { type: 'string', required: true } }, additionalProperties: false }, description: 'complete所需已回读笔记path/hash列表，1–20项；仅页面全为被省略的非对话事件时可为空。' },
    summary: { type: 'string', description: 'complete记录实际来源、内容与链接检查，不少于8字。' },
  };
  parameters.action.enum = ['status', 'search', 'read', 'document', 'graph', 'write', 'remove', 'restore', 'validate', 'sources', 'source_read', 'coverage', 'complete'];
  const name = 'whalewing_knowledge', description = '个人Markdown知识操作。首次使用自动准备空库，先status和read固定规则。document返回笔记及同源Wiki解析、反向链接；若有relationsIssue则仅正文已确认，不把空链接/反链当成真实数量。graph返回有界全库/一跳关系及省略数量，不将部分视图称为完整。写后回读并validate；complete只提交source_read当前页且核验outputs。source_read按批次截止点投影用户及助手的对话原文，不复制工具结果、附件或自动整理轮次；工具与附件证据需要另从原会话/工程核对，omittedEvents不表示没有工作。来源未纳入不读取，失败不推进覆盖。删除只影响库内笔记。纳入来源和定时启停由员工面板操作。';
    ctx.tools.register(defineTool({
      name, description, parameters: parameters,
      output: { schema: { type: 'string' }, render: (_args, result) => [{ type: 'text', text: result }] },
      async execute(args, exec) {
        // 库和会话来源独立于工程；Host直写不继承工具沙箱，显式复用原生一次授权。
        if (!(name === 'whalewing_knowledge' && args.action === 'status')) {
          const policy = ctx.sandboxPolicy.resolve(exec.agent ? { session: exec.agent.session } : {});
          await approveEscalation({ requestedMode: 'danger-full-access', effectiveMode: policy.mode, subject: '鲸翼个人知识操作', justification: `${name}/${args.action}，范围仅 ${ctx.whalewing.vault.root} 及员工明确登记的本机来源；不改变会话权限模式。` }, { approver: ctx.get('approval'), agent: exec.agent, callId: exec.callId, toolName: name, signal: exec.signal });
        }
        return JSON.stringify(await ctx.whalewing.execute(args, { kind: 'model', agent: exec.agent, signal: exec.signal }));
      },
      presentCall: args => ({ card: 'generic', title: '鲸翼个人知识', kind: ['status', 'search', 'read', 'document', 'graph', 'list', 'sources', 'source_read', 'coverage', 'validate'].includes(args.action) ? 'read' : 'other', rawInput: args }),
    }));
}
