import { defineTool } from '@deepseek-ai/dsh-tools';
import { approveEscalation } from '@deepseek-ai/dsh-sandbox';
/** 写入继续经过原生审批和唯一知识算法，不取得额外文件权限。 */
export function apply(ctx) {
  const skillParameters = {
    action: { type: 'string', required: true, enum: ['list', 'read', 'stage', 'publish', 'disable', 'restore', 'rollback'] },
    name: { type: 'string', description: '个人技能使用whalewing-user-前缀的小写连字符名。' },
    state: { type: 'string', enum: ['candidate', 'active', 'disabled'], description: 'read位置，默认active。' },
    content: { type: 'string', description: '完整Markdown，技能含name/description正文。' },
    expectedHash: { type: 'string', description: 'read返回的当前SHA256；新建传空串。' },
    activeHash: { type: 'string', description: 'publish前读取当前active的SHA256，无旧版传空串。' },
    sourcePaths: { type: 'array', items: { type: 'string' }, description: '1–20个已回读库内知识路径。' },
    sourceHashes: { type: 'object', properties: {}, additionalProperties: true, description: 'stage必填：以sourcePaths中路径为键、作者最近read获得的SHA256为值，变化后重新提炼。' },
    review: { type: 'object', properties: { reviewer: { type: 'string', required: true }, positive: { type: 'string', required: true }, negative: { type: 'string', required: true } }, additionalProperties: false, description: '未参与写入的检查者身份、适用输入实测、不适用/失败输入实测，每项不少于8字；不是作者自评。' },
  };
  const name = 'whalewing_skill', description = '从本地知识提炼个人技能。list/read查重→stage候选→独立实际检查→publish；发布验证DSH发现和正文。目标专家仍须用skill重新加载后实际使用。disable停用当前版；restore仅恢复停用版（非选择旧版）；rollback恢复最后发布前的有效旧版，expectedHash是当前active哈希，无active传空串。所有动作只针对个人目录。';
    ctx.tools.register(defineTool({
      name, description, parameters: skillParameters,
      output: { schema: { type: 'string' }, render: (_args, result) => [{ type: 'text', text: result }] },
      async execute(args, exec) {
        // 库和会话来源独立于工程；Host直写不继承工具沙箱，显式复用原生一次授权。
        if (!(name === 'whalewing_knowledge' && args.action === 'status')) {
          const policy = ctx.sandboxPolicy.resolve(exec.agent ? { session: exec.agent.session } : {});
          await approveEscalation({ requestedMode: 'danger-full-access', effectiveMode: policy.mode, subject: '鲸翼个人知识操作', justification: `${name}/${args.action}，范围仅 ${ctx.whalewing.vault.root} 及员工明确登记的本机来源；不改变会话权限模式。` }, { approver: ctx.get('approval'), agent: exec.agent, callId: exec.callId, toolName: name, signal: exec.signal });
        }
        return JSON.stringify(await ctx.whalewing.execute({ ...args, domain: 'skill' }, { kind: 'model', agent: exec.agent, signal: exec.signal }));
      },
      presentCall: args => ({ card: 'generic', title: '鲸翼技能演进', kind: ['status', 'search', 'read', 'document', 'graph', 'list', 'sources', 'source_read', 'coverage', 'validate'].includes(args.action) ? 'read' : 'other', rawInput: args }),
    }));
}
