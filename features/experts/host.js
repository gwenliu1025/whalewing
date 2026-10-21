import { registerBuiltin } from '../../src/features.js';
import { apply as registerTool } from './tool.js';
import { z } from 'zod';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { Service } from '@deepseek-ai/cordis';
import configSchema from '@deepseek-ai/schemastery';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { commonPrompt } from '../../content/roles.js';
import { expertContract } from './contract.js';
import { ExpertStore, expertDomain, expertError } from './store.js';

export const inject = ['whalewing', 'commands', 'sessionProjections', 'sessions', 'agents', 'storageDomain', 'typert', 'skills', 'tools', 'sessionController', 'agentDefaultModel', 'llm'];
export const Config = configSchema.object({ operationMs: configSchema.number().min(1000).max(120000).default(15000), maxExperts: configSchema.number().step(1).min(7).max(1000).default(200) });
const commandName = 'whalewing-expert';
// 改名鲸翼前（0.1.x）的专家会话用这个命令名；只在重建身份时认它，不再接受新的切换。
const legacyCommandName = 'youjin-expert';
const contract = expertContract(z);
const expertIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/).nullable();
const viewSchema = z.object({ expertId: expertIdSchema });
const resources = new Set(['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']);
const sameModel = (a, b) => Boolean(a && b && a.provider === b.provider && a.model === b.model && a.reasoningEffort === b.reasoningEffort);

function isSubagent(ctx, agent) {
  if (agent.session.header.origin === 'subagent') return true;
  const parent = ctx.agents.get(agent.session.header.parentSession);
  if (parent && ctx.agents.isOwnedBy(agent.id, parent)) return true;
  // 运行时所有权先于可选日志元数据成立，缺 parentSession 也不是普通主会话。
  return ctx.agents.list().some(candidate => candidate !== agent && ctx.agents.isOwnedBy(agent.id, candidate));
}

async function observed(promise, signal) {
  signal?.throwIfAborted();
  if (!signal) return promise;
  let cancel;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { cancel = () => reject(signal.reason); signal.addEventListener('abort', cancel, { once: true }); })]);
  } finally { signal.removeEventListener('abort', cancel); }
}

function parseInput(raw) {
  const value = JSON.parse(raw.trim());
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('专家命令需要 JSON 对象');
  const keys = Object.keys(value);
  if (keys.length === 1 && value.action === 'status') return value;
  if (keys.length !== 1 || !Object.hasOwn(value, 'expertId') || !expertIdSchema.safeParse(value.expertId).success) throw new Error('未知专家或无效专家命令');
  return value;
}

// 选择只从正式命令成功记录重建，不用第二份配置或自造日志事件保存身份。
export const expertProjection = {
  key: 'whalewingExpert', stateVersion: 2,
  stateSchema: z.object({ view: viewSchema, selected: z.boolean(), pending: z.record(z.string(), expertIdSchema) }),
  init: () => ({ view: { expertId: null }, selected: false, pending: {} }),
  apply(state, event) {
    if (event.type === 'command/run' && (event.data.name === commandName || event.data.name === legacyCommandName)) {
      try {
        const input = parseInput(event.data.args ?? '');
        if (!Object.hasOwn(input, 'expertId')) return state;
        return { ...state, pending: { ...state.pending, [event.data.commandId]: input.expertId } };
      } catch { return state; }
    }
    if (event.type !== 'command/done' || !Object.hasOwn(state.pending, event.data.commandId)) return state;
    const pending = { ...state.pending };
    const expected = pending[event.data.commandId];
    delete pending[event.data.commandId];
    if (event.data.kind === 'success') {
      try {
        const result = JSON.parse(event.data.text);
        if (result.expertId === expected && (typeof result.name === 'string' || result.name === null)) {
          return { view: state.view.expertId === expected ? state.view : { expertId: expected }, selected: true, pending };
        }
      } catch { /* 损坏或不匹配的完成记录不改变当前身份。 */ }
    }
    return { ...state, pending };
  },
  wire: { viewSchema, view: state => state.view },
};

/** 员工配置只开放 Remote；模型读取复用 get/list，不暴露配置写工具。 */
export class ExpertRegistry extends Service {
  constructor(ctx, store, config) {
    super(ctx, 'whalewingExperts');
    this.store = store;
    this.config = config;
    this.closing = new AbortController();
    ctx.effect(() => () => this.closing.abort(new Error('专家服务已卸载，未提交的操作停止')), 'whalewing expert requests');
    this.typertRemote = bindTypertRemote(this, 'whalewingExperts', { namespace: 'whalewingExperts' });
    ctx.typert.register(contract.host);
  }
  get(id) { return this.store.get(id); }
  /** 管理能力只消费已完成的普通主会话选择，不自行重建专家身份。 */
  selectedFor(agent) {
    if (!agent || this.ctx.agents.get(agent.id) !== agent || isSubagent(this.ctx, agent)) return null;
    const state = this.ctx.sessionProjections.stateOf(agent.session, 'whalewingExpert');
    return state?.selected ? state.view.expertId : null;
  }
  /**
   * 宿主能否只给本会话换模型、不改员工的全局默认模型。未适配的 DSH 0.2.0-rc.2 的 selectModel 总会顺带保存为默认模型，
   * 这时专家不切换模型，跟随会话当前模型。以 selectModel 实现里是否认识 saveAsDefault 判断。
   */
  sessionModelSupported() {
    const select = this.ctx.sessionController?.commands?.selectModel;
    return typeof select === 'function' && /saveAsDefault/.test(Function.prototype.toString.call(select));
  }
  /** 宿主能否列出 MCP 连接及其工具归属；不能时专家不做 MCP 绑定过滤，照常使用 DSH 里启用的 MCP。 */
  mcpSupported() {
    const owner = this.ctx.get('mcpResources');
    return !owner || typeof owner.catalog === 'function';
  }
  list() { return this.store.list(); }
  /** 客户端图片准入和 Host 组装共用此准备；默认值只读宿主，不保存另一份路由配置。 */
  async prepareModel(input, signal) {
    signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(this.config.operationMs), ...(signal ? [signal] : [])]);
    const agent = this.ctx.agents.get(input.sessionId);
    if (!agent || isSubagent(this.ctx, agent)) throw expertError('SESSION_UNAVAILABLE', '模型准备只接受当前原生普通会话');
    const automation = this.ctx.sessionProjections.stateOf(agent.session, 'whalewingAutomation')?.purpose;
    if (input.automation && !automation) throw expertError('AUTOMATION_IDENTITY', '自动任务模型准备需要已认领的原会话');
    const assertCurrent = () => {
      signal.throwIfAborted();
      if (automation) {
        if (this.ctx.agents.get(input.sessionId) !== agent || this.ctx.sessionProjections.stateOf(agent.session, 'whalewingAutomation')?.purpose !== automation) throw expertError('AUTOMATION_IDENTITY', '自动任务身份已变化，请从原会话重新准备');
        return null;
      }
      const role = this.get(input.expertId);
      if (this.ctx.agents.get(input.sessionId) !== agent || this.ctx.sessionProjections.stateOf(agent.session, 'whalewingExpert')?.view.expertId !== role.id || role.revision !== input.expectedRevision) throw expertError('EXPERT_CHANGED', '专家或会话已变化，请从原会话重新准备');
      return role;
    };
    const role = assertCurrent();
    if (!this.sessionModelSupported()) {
      // 换模型会改掉员工的全局默认模型，所以不切换；回报会话当前实际使用的模型。
      const current = this.ctx.sessionProjections.stateOf(agent.session, 'modelSelection');
      const selected = current?.pending ?? current?.lastUsed ?? this.ctx.agentDefaultModel.currentSelection();
      if (!selected?.provider || !selected?.model) throw expertError('MODEL_UNAVAILABLE', '请先在 DSH 配置并选择系统默认模型');
      return { selected: { provider: selected.provider, model: selected.model, ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: String(selected.reasoningEffort) }) }, applied: false };
    }
    const desired = role?.model ?? this.ctx.agentDefaultModel.currentSelection();
    if (!desired?.provider || !desired?.model) throw expertError('MODEL_UNAVAILABLE', '请先在 DSH 配置并选择系统默认模型');
    // 宿主解析缺省推理级别，避免省略值与实际默认值被反复误判成切换。
    const normalized = await observed(this.ctx.llm.resolveCallConfig(desired, signal), signal);
    assertCurrent();
    const target = { provider: normalized.provider, model: normalized.model, ...(normalized.reasoningEffort === undefined ? {} : { reasoningEffort: String(normalized.reasoningEffort) }) };
    const state = () => this.ctx.sessionProjections.stateOf(agent.session, 'modelSelection');
    const current = state();
    if (!sameModel(current?.pending ?? current?.lastUsed, target)) {
      const receipt = await observed(this.ctx.sessionController.selectModel({ sessionId: agent.session.id, ...target, saveAsDefault: false }), signal);
      assertCurrent();
      if (!sameModel(receipt?.selected, target)) throw expertError('MODEL_READBACK', '宿主模型选择回执不一致，请从原会话核对');
    }
    assertCurrent();
    const actual = state();
    if (!sameModel(actual?.pending ?? actual?.lastUsed, target)) throw expertError('MODEL_READBACK', '宿主模型选择读回不一致，请从原会话核对');
    return { selected: target };
  }
  mcp(scope) {
    const owner = this.ctx.get('mcpResources');
    if (!owner) return [];
    if (typeof owner.catalog !== 'function') return null;
    return owner.catalog(scope);
  }
  async catalog(sessionId, signal) {
    signal?.throwIfAborted();
    const agent = sessionId ? this.ctx.agents.get(sessionId) : undefined;
    if (sessionId && !agent) throw expertError('SESSION_UNAVAILABLE', '当前会话未激活，请从原生会话打开后重试');
    const catalog = await observed(this.ctx.sessionController.modelCatalog(), signal);
    const skills = [...await observed(this.ctx.skills.list({ ...(agent ? { cwd: agent.session.header.cwd, scope: agent } : {}), signal }), signal)];
    const issues = (catalog.failures ?? []).map(item => item.message);
    if (!agent) {
      const owner = this.ctx.get('whalewing');
      if (owner?.skillCandidates) try {
        const candidates = await observed(owner.skillCandidates(signal), signal);
        // 这里只允许配置名称；每轮实际加载仍由当前 Agent 的 scoped registry 验证。
        const present = new Set(skills.map(skill => skill.name));
        for (const skill of candidates.skills) if (!present.has(skill.name)) { skills.push(skill); present.add(skill.name); }
        issues.push(...candidates.issues);
      } catch (error) { signal?.throwIfAborted(); issues.push(`技能候选目录不可用：${error.message}`); }
    }
    let mcpServers = [];
    try { mcpServers = this.mcp(agent) ?? []; } catch (error) { issues.push(error.message); }
    for (const server of mcpServers) if (!server.connected) issues.push(`MCP 连接 ${server.name} 尚未连接`);
    return { models: catalog.groups, defaultModel: catalog.default?.provider && catalog.default?.model ? { ...catalog.default } : null, skills: skills.map(({ name, description }) => ({ name, description })), mcpServers, issues, mcpSupported: this.mcpSupported(), modelSupported: this.sessionModelSupported() };
  }
  async manage(raw, signal) {
    try {
      signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(this.config.operationMs), ...(signal ? [signal] : [])]);
      const input = contract.input.parse(raw);
      signal?.throwIfAborted();
      if (input.action === 'list') return this.list();
      if (input.action === 'catalog') return await this.catalog(input.sessionId, signal);
      if (input.action === 'prepare_model') return await this.prepareModel(input, signal);
      if (input.action === 'save') {
        const previous = this.store.previousForSave(input);
        const catalog = await this.catalog(undefined, signal);
        const model = input.expert.model;
        if (model && JSON.stringify(previous?.model) !== JSON.stringify(model)) {
          const selected = catalog.models.find(group => group.id === model.provider)?.models.find(item => item.id === model.model);
          if (!selected || (model.reasoningEffort !== undefined && !selected.reasoning?.efforts.some(effort => effort.id === model.reasoningEffort))) throw expertError('MODEL_UNAVAILABLE', '所选模型或推理级别当前不可用，原专家配置已保留');
        }
        for (const name of input.expert.skills) if (!previous?.skills.includes(name) && !catalog.skills.some(item => item.name === name)) throw expertError('BINDING_UNAVAILABLE', `技能 ${name} 当前不可用，未修改绑定`);
        for (const name of input.expert.mcpServers) if (!previous?.mcpServers.includes(name) && !catalog.mcpServers.some(item => item.name === name && item.connected)) throw expertError('BINDING_UNAVAILABLE', `MCP ${name} 未连接或尚未发现，未修改绑定`);
      }
      signal?.throwIfAborted();
      const result = await this.store[input.action](input, signal);
      this.ctx.emit('whalewing-experts/changed');
      return result;
    } catch (error) { throw new RemoteError(error.code || 'EXPERT_INPUT', error.message, {}); }
  }
}

export async function apply(ctx, config) {
  registerBuiltin(ctx, 'experts');
  ctx.inject(['tools', 'whalewingExperts'], scope => registerTool(scope));
  const domain = await ctx.storageDomain.open(expertDomain);
  ctx.effect(() => () => domain.close(), 'whalewing expert storage');
  const store = new ExpertStore(domain, config.maxExperts);
  await store.restoreDeletedBuiltins();
  const registry = new ExpertRegistry(ctx, store, config);
  const selection = expertId => ({ expertId, name: expertId === null ? null : registry.get(expertId).name });
  ctx.sessionProjections.register(expertProjection);
  const read = session => ctx.sessionProjections.stateOf(session, 'whalewingExpert');
  const pending = new Map();
  const lastTurn = new WeakMap();
  const policies = new Map();
  let disposed = false;

  // prepend 在原 installModelSelection 的普通监听前完成准备；不改写组装结果或请求路由。
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const agent = context.agent;
    if (!agent || isSubagent(ctx, agent)) return next();
    if (ctx.sessionProjections.stateOf(agent.session, 'whalewingAutomation')?.purpose) {
      await registry.prepareModel({ sessionId: agent.session.id, automation: true }, context.signal);
      return next();
    }
    const id = read(agent.session)?.view.expertId;
    if (!id) return next();
    const role = registry.get(id);
    await registry.prepareModel({ sessionId: agent.session.id, expertId: id, expectedRevision: role.revision }, context.signal);
    registry.closing.signal.throwIfAborted();
    context.signal?.throwIfAborted();
    return next();
  }, { prepend: true });

  function facts(agent, role) {
    const servers = registry.mcp(agent);
    // 宿主列不出 MCP 归属时不做绑定过滤，专家照常使用 DSH 里启用的 MCP。
    if (servers === null) return null;
    const owner = new Map();
    for (const server of servers) for (const name of server.tools) {
      if (owner.has(name) && owner.get(name).name !== server.name) throw expertError('MCP_OWNERSHIP', 'MCP 工具归属冲突，请调整连接后重试');
      owner.set(name, server);
    }
    for (const name of role.mcpServers) if (!servers.some(server => server.name === name && server.connected)) throw expertError('MCP_UNAVAILABLE', `专家绑定的 MCP ${name} 未连接，请修复连接或修改绑定后重试`);
    return { servers, owner };
  }
  function allowed(name, role, current) {
    if (resources.has(name)) return role.mcpServers.length > 0;
    const owner = current.owner.get(name);
    if (owner) return owner.connected && role.mcpServers.includes(owner.name);
    // 前缀仅识别未获得归属证明的工具并拒绝，绝不用于推断连接身份。
    return !name.startsWith('mcp__');
  }
  function verifyAssembly(agent, role, policy) {
    const current = facts(agent, role);
    if (!current) return;
    const isMcp = name => current.owner.has(name) || name.startsWith('mcp__') || resources.has(name);
    const visible = ctx.tools.schemas(agent).map(tool => tool.name).filter(isMcp).sort();
    const assembled = policy.assembledCapabilities.filter(isMcp).sort();
    if (policy.assembled.some(name => !allowed(name, role, current)) || JSON.stringify(visible) !== JSON.stringify(assembled)) throw expertError('MCP_CHANGED', 'MCP 目录在请求组装期间发生变化，请从原会话重试以更新工具');
  }
  function refresh(agent) {
    const policy = policies.get(agent);
    if (!policy || policy.refreshing) return;
    policy.refreshing = true;
    policy.error = undefined;
    try {
      const selected = read(agent.session)?.view.expertId;
      if (!selected) { policy.approved.clear(); policy.servers.clear(); policy.restrict?.(); policy.restrict = undefined; policy.key = undefined; return; }
      const role = registry.get(selected);
      const current = facts(agent, role);
      if (!current) { policy.approved.clear(); policy.servers.clear(); policy.restrict?.(); policy.restrict = undefined; policy.key = undefined; return; }
      policy.approved = new Set(current.servers.filter(server => server.connected && role.mcpServers.includes(server.name)).flatMap(server => server.tools));
      policy.servers = new Set(role.mcpServers);
      const deny = ctx.tools.schemas().map(tool => tool.name).filter(name => !allowed(name, role, current));
      const key = JSON.stringify(deny.sort());
      if (key !== policy.key) {
        policy.restrict?.(); policy.restrict = undefined;
        policy.key = undefined;
        if (deny.length) policy.restrict = agent.ctx.tools.restrict({ deny });
        policy.key = key;
      }
      if (ctx.tools.schemas(agent).some(tool => !allowed(tool.name, role, current))) throw expertError('MCP_MODE_CONFLICT', '当前模式包含不可隐藏的未绑定 MCP 工具，请调整模式、连接或专家绑定后重试');
    } catch (error) { policy.error = error; policy.approved.clear(); }
    finally { policy.refreshing = false; }
  }
  function attach(agent) {
    if (policies.has(agent)) return;
    const policy = { approved: new Set(), servers: new Set(), assembled: [], assembledCapabilities: [], refreshing: false };
    policies.set(agent, policy);
    policy.dispose = agent.ctx.effect(() => {
      const guard = agent.ctx.tools.guard(exec => {
        const id = read(agent.session)?.view.expertId;
        if (!id) return;
        try {
          const role = registry.get(id), current = facts(agent, role);
          if (!current) return;
          if (policy.error) return policy.error.message;
          if (!allowed(exec.name, role, current)) return '当前专家未绑定此 MCP 连接';
          if (current.owner.has(exec.name) && !policy.approved.has(exec.name)) return 'MCP 工具已变化，请从原会话重试以重新核对工具';
          if (resources.has(exec.name) && (!role.mcpServers.includes(exec.arguments.server) || !policy.servers.has(exec.arguments.server))) return '当前专家未绑定此 MCP 资源连接';
        } catch (error) { return error.message; }
      });
      // 只记录实际组装结果；工具变更发生在组装之后时，pre-step 拒绝旧目录而不改写请求。
      const observe = agent.ctx.on('system-prompt/assemble', async (_input, _context, next) => {
        // PTC 在 wire 上只有 run_code，能力目录仍由同一工具注册表持有。
        policy.assembledCapabilities = ctx.tools.schemas(agent).map(tool => tool.name);
        const assembly = await next();
        policy.assembled = assembly.tools.map(tool => tool.name);
        return assembly;
      });
      const request = agent.ctx.on('agent/request', async (_input, next) => {
        const result = await next();
        const id = read(agent.session)?.view.expertId;
        if (id) {
          refresh(agent);
          if (policy.error) throw policy.error;
          verifyAssembly(agent, registry.get(id), policy);
        }
        return result;
      });
      return () => { guard(); observe(); request(); policy.restrict?.(); policies.delete(agent); };
    }, 'whalewing expert tool scope');
    refresh(agent);
  }
  ctx.on('tools/change', () => { for (const agent of policies.keys()) refresh(agent); });
  ctx.on('whalewing-experts/changed', () => { for (const agent of policies.keys()) refresh(agent); });
  for (const agent of ctx.agents.list()) attach(agent);

  // 命令 handler 与 command/done 之间有异步结算；首步等待它结束，避免读取半次切换。
  ctx.on('session/event', (session, event) => {
    if (event.type === 'command/run' && event.data.name === commandName) {
      try {
        if (!Object.hasOwn(parseInput(event.data.args ?? ''), 'expertId')) return;
        const gate = Promise.withResolvers();
        if (!pending.has(session)) pending.set(session, new Map());
        pending.get(session).set(event.data.commandId, gate);
      } catch { /* 无效输入由正式命令返回错误，不阻塞模型。 */ }
    } else if (event.type === 'command/done') {
      const agent = ctx.agents.get(session.id);
      if (agent) refresh(agent);
      const gates = pending.get(session);
      const gate = gates?.get(event.data.commandId);
      if (!gate) return;
      gates.delete(event.data.commandId);
      if (!gates.size) pending.delete(session);
      gate.resolve();
    }
  });
  ctx.effect(() => () => {
    disposed = true;
    for (const policy of [...policies.values()]) policy.dispose();
    for (const gates of pending.values()) for (const gate of gates.values()) gate.resolve();
    pending.clear();
  }, 'whalewing expert command gates');

  ctx.commands.register({
    name: commandName,
    description: '在原生模式之外选择专家；空闲时切换，status 持久化并回读已完成的选择。',
    input: { hint: '{"expertId":"development"}、{"expertId":null} 或 {"action":"status"}' },
    handler: async ({ agent, rawInput, signal }) => {
      try {
        signal.throwIfAborted();
        const input = parseInput(rawInput);
        if (input.action === 'status') {
          // 选择命令的 done 发生在其 handler 返回之后，后续 status 才能确认该记录持久化。
          if (!(await ctx.sessions.flush(agent.session))) throw new Error('当前会话没有持久化接收者，专家选择尚未确认保存');
          signal.throwIfAborted();
          return { kind: 'success', text: JSON.stringify(selection(read(agent.session).view.expertId)) };
        }
        if (agent.status !== 'idle') throw new Error('会话正在运行，请等待空闲后切换专家');
        if (input.expertId !== null) registry.get(input.expertId);
        return { kind: 'success', text: JSON.stringify(selection(input.expertId)) };
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : '专家选择失败' };
      }
    },
  });

  ctx.on('agent/created', async ({ agent, source, signal }) => {
    attach(agent);
    if (source !== 'startup' || read(agent.session).selected || agent.session.inheritedEventCount > 0) return;
    const parent = ctx.agents.list().find(candidate => ctx.agents.isOwnedBy(agent.id, candidate));
    if (!parent) return;
    const state = read(parent.session);
    if (!state?.selected) return;
    const result = await ctx.commands.execute(agent, `/${commandName} ${JSON.stringify({ expertId: state.view.expertId })}`, [], signal ?? new AbortController().signal);
    if (result?.result.kind !== 'success') throw new Error(result?.result.text ?? '子代理专家继承失败');
    if (!(await ctx.sessions.flush(agent.session))) throw new Error('子代理专家继承尚未确认保存');
    if (read(agent.session).view.expertId !== state.view.expertId) throw new Error('子代理专家继承回读不一致');
  });

  ctx.on('agent/pre-step', async ({ agent, turn, signal }, next) => {
    const decision = await next();
    if (decision.kind === 'reject' || signal.aborted || decision.messages.length === 0) return decision;
    const gates = [...(pending.get(agent.session)?.values() ?? [])];
    if (gates.length) {
      const aborted = Promise.withResolvers();
      const onAbort = () => aborted.reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        signal.throwIfAborted();
        await Promise.race([Promise.all(gates.map(gate => gate.promise)), aborted.promise]);
      } finally { signal.removeEventListener('abort', onAbort); }
    }
    if (disposed) return decision;
    signal.throwIfAborted();
    const state = read(agent.session);
    if (!state?.selected) return decision;
    const role = state.view.expertId === null ? undefined : registry.get(state.view.expertId);
    refresh(agent);
    const policy = policies.get(agent);
    if (policy?.error) throw policy.error;
    if (role) {
      verifyAssembly(agent, role, policy);
    }
    if (lastTurn.get(agent) === turn) return decision;
    const skillText = [];
    for (const name of role?.skills ?? []) {
      const skill = await ctx.skills.get(name, { cwd: agent.session.header.cwd, scope: agent, signal });
      // 绑定的技能没装或已删除时跳过：有就用，没有就不提，不让整轮失败。
      if (!skill) continue;
      skillText.push(`${name}：${skill.description}`);
    }
    const text = role
      ? `本轮专家身份：${role.name}。此选择替代历史专家身份，原生模式和工具仍由宿主持有。\n${commonPrompt}\n\n${role.prompt}\n\n当前绑定技能（优先使用，按需通过宿主 skill 加载；宿主列出的其它技能贴合任务时也可加载）：\n${skillText.join('\n') || '未绑定额外技能'}\n当前绑定 MCP：${role.mcpServers.join('、') || '无'}。配置由员工管理，不自行增加绑定。`
      : '本轮未选择鲸翼专家，历史专家身份不再生效；继续使用当前原生模式与其工具。';
    // 原生 loop 将 pre-step 消息记为 user/message；独立 source 标明这是插件上下文而非用户原话。
    lastTurn.set(agent, turn);
    return { ...decision, messages: [...decision.messages, createUserMessage({ source: { kind: 'whalewing-expert' }, content: [{ type: 'text', text: `【鲸翼专家上下文 · 非用户原话】\n${text}` }] })] };
  }, { prepend: true });
}
