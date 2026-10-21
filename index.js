import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { z as schema } from 'zod';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { WhalewingCore } from './src/service.js';
import { abort, defaultLimits, fail, frontmatter } from './src/vault.js';
import { vaultLocation } from './src/vault-location.js';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { automationProjection, claimCommands, automationIdentity } from './src/identity.js';
import { FeatureRegistry } from './src/features.js';
import { installNewsGate } from './src/news-gate.js';
import { workbenchContract } from './src/workbench-contract.js';
import { apply as installSkills } from './src/skill-provider.js';
import { parts } from './features/index.js';
import * as Experts from './features/experts/host.js';
import * as Assistant from './features/assistant/host.js';
import * as Knowledge from './features/knowledge/host.js';
import * as Skills from './features/skills/host.js';
import * as Automation from './features/automation/host.js';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));
export const baseHosts = { experts: Experts, assistant: Assistant, knowledge: Knowledge.default, skills: Skills.default, automation: Automation.default };
// 工作台身份只由本命令的成功回执重建；标题、浏览器缓存和其他命令都不是身份依据。
export const workbenchProjection = {
  key: 'whalewingWorkbench', stateVersion: 1,
  stateSchema: schema.object({ claimed: schema.boolean(), inherited: schema.number(), pending: schema.array(schema.string()) }),
  init: (_header, inheritedEventCount) => ({ claimed: false, inherited: inheritedEventCount, pending: [] }),
  apply(state, event) {
    if (state.claimed || event.seq < state.inherited) return state;
    if (event.type === 'command/run' && claimCommands.has(event.data.name)) return { ...state, pending: [...state.pending, event.data.commandId] };
    if (event.type !== 'command/done' || !state.pending.includes(event.data.commandId)) return state;
    let claimed = false;
    if (event.data.kind === 'success') {
      try {
        const result = JSON.parse(event.data.text);
        claimed = result.action === 'workbench_claim' && result.claimed === true;
      } catch { /* 普通知识结果或损坏回执不授予工作台身份。 */ }
    }
    return { ...state, claimed, pending: state.pending.filter(id => id !== event.data.commandId) };
  },
  wire: { viewSchema: schema.boolean(), view: state => state.claimed },
};

/** 加载仅注册服务；第一次使用知识入口时自动准备员工空库，不改动原工作会话。 */
export default class Whalewing extends Service {
  static inject = ['commands', 'sessionQuery', 'sessionProjections', 'sessions', 'skills', 'typert'];
  static Config = z.object({
    experts: Experts.Config.default({}),
    vaultRoot: z.string().description('独立 Markdown 知识库绝对路径；Windows 桌面默认安装目录同级/whalewing-vault，已有库保持原路径并提示迁移'),
    maxNoteBytes: z.number().step(1).min(4096).max(1048576).default(defaultLimits.maxNoteBytes),
    maxFiles: z.number().step(1).min(10).max(50000).default(defaultLimits.maxFiles),
    maxResults: z.number().step(1).min(1).max(500).default(defaultLimits.maxResults),
    maxSources: z.number().step(1).min(1).max(100).default(defaultLimits.maxSources),
    maxEvents: z.number().step(1).min(1).max(500).default(defaultLimits.maxEvents),
    maxSourceEvents: z.number().step(1).min(100).max(100000).default(defaultLimits.maxSourceEvents),
    maxSourceBytes: z.number().step(1).min(65536).max(67108864).default(defaultLimits.maxSourceBytes),
    maxIndexBytes: z.number().step(1).min(262144).max(134217728).default(defaultLimits.maxIndexBytes),
    maxLinks: z.number().step(1).min(100).max(200000).default(defaultLimits.maxLinks),
    maxGraphNodes: z.number().step(1).min(10).max(1000).default(defaultLimits.maxGraphNodes),
    operationMs: z.number().step(1).min(1000).max(120000).default(defaultLimits.operationMs),
  });

  constructor(ctx, config = {}) {
    super(ctx, 'whalewing');
    this.dshHome = resolveDshHome();
    this.location = vaultLocation(config.vaultRoot, this.dshHome);
    const { root } = this.location;
    const relative = path.relative(packageRoot, path.resolve(root));
    if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) fail('ROOT', '员工知识库须独立于插件安装目录');
    this.core = new WhalewingCore(root, {
      skillsRoot: path.join(this.dshHome, 'skills'),
      snapshot: signal => ctx.skills.snapshot({ signal }),
      projectSkills: signal => this.projectSkills(signal),
      readSession: id => ctx.sessionQuery.readSession(id),
      listSessions: signal => ctx.sessionQuery.listSessions(signal),
      listWorkspaces: signal => this.listWorkspaces(signal),
      readSourceScope: (accept, signal) => this.readSourceScope(accept, signal),
      automationIdentity: (id, signal) => this.automationIdentity(id, signal),
      schedule: () => ctx.get('schedule'),
      changed: () => ctx.emit('whalewing/changed'),
      discover: async (record, caller, signal) => {
        ctx.emit('whalewing/changed');
        const expectedPath = await realpath(path.join(this.core.skills.activeDir, record.name, 'SKILL.md'));
        // 宿主 watcher 有稳定等待窗口；限次读取实际注册表，不靠目录存在判定成功。
        for (let attempt = 0; attempt < 6; attempt++) {
          abort(signal);
          const skill = await ctx.skills.get(record.name, { ...(caller.agent ? { cwd: caller.agent.session.header.cwd, scope: caller.agent } : {}), signal });
          if (skill) {
            if (path.resolve(skill.path || '') !== path.resolve(expectedPath)) fail('SKILL_SHADOWED', '同名技能命中了其它来源，本次发布撤回');
            if (skill.content.trim() === frontmatter(record.content).body.trim()) return;
          }
          if (attempt < 5) await delay(150, undefined, { signal });
        }
        fail('SKILL_DISCOVERY', 'DSH 尚未发现并加载本次技能正文，本次发布撤回');
      },
    }, config);
    this.vault = this.core.vault;
    this.skills = this.core.skills;
    this.apiVersion = 1;
    this.registry = new FeatureRegistry(ctx, parts);
    this.features = Object.assign(() => this.registry.snapshot(), { register: (scope, manifest) => this.registry.register(scope, manifest) });
    const handlers = this.commandHandlers = new Map();
    this.typertRemote = bindTypertRemote(this, 'whalewing', { namespace: 'whalewingWorkbench' });
    ctx.typert.register(workbenchContract(schema).host);
    ctx.sessionProjections.register(workbenchProjection);
    ctx.sessionProjections.register(automationProjection);
    ctx.commands.register({
      name: 'whalewing', description: '鲸翼：专家知识、技能与定时整理', input: { hint: '<JSON>' }, recordInput: false,
      handler: async ({ agent, rawInput, signal }) => {
        try {
          if (Buffer.byteLength(rawInput) > this.vault.limits.maxNoteBytes * 2) fail('SIZE', '命令内容超出限制');
          abort(signal);
          const input = JSON.parse(rawInput);
          if (input?.action === 'automation_skip') return this.newsGate.notice(input, agent, signal);
          if (input?.action === 'automation_claim') {
            if (Object.keys(input).length !== 2 || !['knowledge', 'custom', 'news'].includes(input.purpose)) fail('INPUT', '自动任务认领只接受用途');
            if (agent.status !== 'idle' || agent.session.header?.origin === 'subagent' || agent.session.header?.agentPreset !== 'standard') fail('AUTOMATION_SESSION', '自动任务只认领空闲的 standard 普通会话');
            const previous = ctx.sessionProjections.stateOf(agent.session, 'whalewingAutomation')?.purpose;
            if (previous && previous !== input.purpose) fail('AUTOMATION_IDENTITY', '此会话已属于其它自动任务用途');
            if (!previous && agent.session.snapshotEvents().slice(agent.session.inheritedEventCount ?? 0).some(event => ['user/message', 'assistant/message'].includes(event.type))) fail('AUTOMATION_SESSION', '已有对话正文的会话不改为自动任务，请使用本次创建的独立会话');
            return { kind: 'success', text: JSON.stringify({ action: 'automation_claim', purpose: input.purpose }) };
          }
          if (input?.action === 'workspace_attach') {
            if (Object.keys(input).length !== 1) fail('INPUT', '工作区关联只接受当前会话，不接受额外参数');
            if (agent.status !== 'idle') fail('BUSY', '请等待会话空闲后关联工作区');
            const registry = ctx.get('workspaceRegistry');
            if (!registry) fail('WORKSPACE_UNAVAILABLE', '宿主尚未提供工作区服务，请检查插件加载状态');
            const cwd = agent.session.header?.cwd;
            if (typeof cwd !== 'string' || !cwd.trim()) fail('WORKSPACE_CWD', '当前会话没有有效的工程目录，请保留任务并检查会话信息');
            if (!await ctx.sessions.flush(agent.session)) fail('PERSISTENCE', '会话尚未确认保存，未修改工作区关联；请重试');
            abort(signal);
            // 工作区 owner 统一以真实路径校验成员关系，避免二次创建会话时比较大小写不同的 cwd。
            const workspace = await registry.create(cwd);
            try {
              abort(signal);
              await workspace.attachSession(agent.session.id);
              if (!workspace.sessionIds.includes(agent.session.id)) fail('WORKSPACE_READBACK', '宿主尚未确认该会话属于此工作区');
            } catch (error) {
              fail('WORKSPACE_ATTACH', `工作区已登记，但会话关联尚未确认；保留当前任务并重试：${error.message}`);
            }
            return { kind: 'success', text: JSON.stringify({ action: 'workspace_attach', sessionId: agent.session.id, workspaceId: workspace.id }) };
          }
          if (input?.action === 'workbench_confirm') {
            schema.strictObject({ action: schema.literal('workbench_confirm') }).parse(input);
            abort(signal);
            if (!await ctx.sessions.flush(agent.session)) fail('PERSISTENCE', '工作台身份尚未确认持久化，请保留原会话并回读');
            abort(signal);
            return { kind: 'success', text: JSON.stringify({ action: 'workbench_confirm', persisted: true }) };
          }
          if (input?.action === 'workbench_claim') {
            if (agent.status !== 'idle') fail('BUSY', '请等待会话空闲后准备知识工作台');
            return { kind: 'success', text: JSON.stringify({ action: 'workbench_claim', claimed: true }) };
          }
          if (input?.action === 'status' && !await ctx.sessions.flush(agent.session)) fail('PERSISTENCE', '工作台状态尚未确认保存；请保留当前页面并重试');
          const handler = handlers.get(input.domain ?? input.action);
          if (!handler && input.action !== 'status' && !input.action?.startsWith('schedule_')) fail('ACTION', '功能尚未加载，请稍后重试');
          return { kind: 'success', text: JSON.stringify(await (handler ? handler(input, { kind: 'human', agent, signal }) : this.execute(input, { kind: 'human', agent, signal }))) };
        } catch (error) { return { kind: 'error', text: JSON.stringify({ code: error.code || error.name || 'ERROR', message: error.message }) }; }
      },
    });
    this.newsGate = installNewsGate(ctx, this.registry);
    ctx.effect(() => () => this.core.dispose(), '鲸翼知识底座');
    ctx.inject(['skills', 'whalewing'], scope => installSkills(scope));
    // 监督使用Cordis自身fiber；单个失败不从父启动函数继续抛出。
    for (const part of parts.filter(part => part.kind === 'base')) this.registry.loadBase(part, () => ctx.plugin(baseHosts[part.id], config[part.id]));
  }

  get commands() {
    const scope = this.ctx, handlers = this.commandHandlers;
    return { handle(action, handler) {
      if (typeof action !== 'string' || !action || typeof handler !== 'function') fail('INPUT', '命令登记需要动作与处理函数');
      if (handlers.has(action)) fail('ACTION_CONFLICT', '命令动作已登记');
      handlers.set(action, handler);
      // Cordis跟踪调用上下文，动作随登记插件退出，不由核心永久持有。
      return scope.effect(() => () => { if (handlers.get(action) === handler) handlers.delete(action); });
    } };
  }

  get knowledge() {
    const caller = this.ctx;
    const read = (input, signal) => {
      const feature = this.registry.caller(caller);
      return this.execute(input, { kind: 'plugin', package: feature.package, feature: feature.id, signal });
    };
    return {
      search: (query, options = {}) => read({ action: 'search', query: schema.string().max(200).parse(query), ...schema.strictObject({}).parse(Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'signal'))) }, options.signal),
      read: path => read(schema.strictObject({ action: schema.literal('read'), path: schema.string() }).parse({ action: 'read', path })),
    };
  }

  watchFeatures(signal) { return this.registry.watch(signal); }
  async retryBase(id) { await this.registry.retry(id); return this.registry.snapshot(); }
  automationIdentity(id, signal) {
    return automationIdentity((sessionId, nextSignal) => {
      const controller = this.ctx.get('sessionController');
      if (!controller) fail('AUTOMATION_UNAVAILABLE', '宿主会话服务尚未加载');
      return controller.projections({ sessionId }, nextSignal);
    }, id, signal);
  }
  async execute(input, caller) {
    const result = await this.core.execute(input, caller);
    return input.action === 'status' && !input.domain && this.location.notice ? { ...result, locationNotice: this.location.notice } : result;
  }

  async listWorkspaces(signal) {
    abort(signal);
    const registry = this.ctx.get('workspaceRegistry');
    if (!registry) fail('WORKSPACE_UNAVAILABLE', '宿主工作区目录尚未加载，请保留任务并重试');
    const rows = await registry.list();
    abort(signal);
    return rows.map(workspace => ({ workspaceId: workspace.id, path: workspace.path, sessionIds: workspace.sessionIds }));
  }

  readSourceScope(accept, signal) {
    abort(signal);
    const schedule = this.ctx.get('schedule');
    if (!schedule) fail('SOURCE_UNAVAILABLE', 'DSH 定时服务尚未就绪；新版请检查启动日志并重启 DSH，旧版请确认官方定时任务插件已启用，然后重试');
    if (typeof schedule.readCatalog !== 'function') {
      // 未适配的 DSH 没有同步读取口：先读计划目录再读工作区，两步之间有很短的窗口，不影响知识整理的结果。
      return (async () => {
        const tasks = await schedule.catalog();
        abort(signal);
        const registry = this.ctx.get('workspaceRegistry');
        if (!registry) fail('WORKSPACE_UNAVAILABLE', '宿主工作区目录尚未加载，请保留任务并重试');
        const workspaces = (await registry.list()).map(workspace => ({ workspaceId: workspace.id, path: workspace.path, sessionIds: workspace.sessionIds }));
        abort(signal);
        return accept({ tasks, workspaces });
      })();
    }
    return schedule.readCatalog(tasks => {
      abort(signal);
      const registry = this.ctx.get('workspaceRegistry');
      if (!registry) fail('WORKSPACE_UNAVAILABLE', '宿主工作区目录尚未加载，请保留任务并重试');
      const workspaces = registry.list().map(workspace => ({ workspaceId: workspace.id, path: workspace.path, sessionIds: workspace.sessionIds }));
      return accept({ tasks, workspaces });
    }, signal);
  }

  async profileDirectory(signal) {
    abort(signal);
    const profile = this.ctx.get('profileContext');
    if (typeof profile?.dir !== 'string' || !path.isAbsolute(profile.dir)) fail('PROFILE_UNAVAILABLE', '宿主当前 profile 位置不可用；未改用全局身份，请检查启动环境');
    const directory = await realpath(profile.dir);
    if (!(await stat(directory)).isDirectory()) fail('PROFILE_UNAVAILABLE', '宿主 profile 位置不是目录');
    abort(signal);
    return directory;
  }

  async projectSkills(signal) {
    signal ??= this.core.closing.signal;
    abort(signal);
    const lifecycle = new AbortController(), cancelled = Promise.withResolvers();
    const cancel = () => { lifecycle.abort(signal.reason); cancelled.reject(signal.reason); };
    signal.addEventListener('abort', cancel, { once: true });
    let provider;
    try {
      provider = new FileSystemSkillProvider(this.ctx, { signal: lifecycle.signal, invalidate() {} }, {
        providerName: 'whalewing-library-candidates', includeDefaultRoots: false, customSkillDirs: [this.skills.root], watch: false, watchFollowSymlinks: false,
      });
      // 目标版 list 的内部 FS 读取未传递取消；只终止本请求等待，race 同时观察迟到拒绝。
      const listing = Promise.resolve().then(() => { abort(signal); return provider.list({ signal }); });
      const value = await Promise.race([listing, cancelled.promise]);
      abort(signal);
      return Array.isArray(value) ? { candidates: value, complete: true } : value;
    } finally { signal.removeEventListener('abort', cancel); lifecycle.abort(); await provider?.dispose(); }
  }

  async skillCandidates(signal) {
    signal = AbortSignal.any([this.core.closing.signal, AbortSignal.timeout(this.vault.limits.operationMs), ...(signal ? [signal] : [])]);
    const operation = this.skills.candidates(signal);
    this.core.pending.add(operation);
    try { return await operation; } finally { this.core.pending.delete(operation); }
  }

}
