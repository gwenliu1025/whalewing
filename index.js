import path from 'node:path';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
import { knowledgeContract } from './src/knowledge-contract.js';
import { skillLibraryContract } from './src/skill-library-contract.js';
import { automationContract } from './src/automation-contract.js';
import { Automation, automationProjection, claimCommands, observeAutomation } from './src/automation.js';
import { News, newsDomain, newsLimits } from './src/news.js';
import { newsContract } from './src/news-contract.js';
import { ModelWorld } from './src/model-world.js';
import { modelWorldVendorIds } from './src/model-world-roster.js';
import { modelWorldContract, worldLimits } from './src/model-world-contract.js';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http';
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { withFileLock } from '@deepseek-ai/dsh-atomic-write';
import { aiWebContract } from './src/utilities/ai-web.js';
import { AiWebStore, aiWebDomain } from './src/ai-web-store.js';
import { selectLearningContext } from './src/learning-cards.js';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const knowledge = knowledgeContract(schema);
const skillLibrary = skillLibraryContract(schema);
const automation = automationContract(schema);
const news = newsContract(schema);
const modelWorld = modelWorldContract(schema);
const aiWeb = aiWebContract(schema);

// 仅持久域名称按实际 profile 隔离；记录结构和版本始终由资讯 owner 的声明持有。
const taskWorkspaceTitle = '鲸翼定时任务';
const profileNewsDomain = directory => defineDomain({ ...newsDomain, name: `${newsDomain.name}_${createHash('sha256').update(directory).digest('hex')}` });
const profileAiWebDomain = directory => defineDomain({ ...aiWebDomain, name: `${aiWebDomain.name}_${createHash('sha256').update(directory).digest('hex')}` });

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
      automationIdentity: (id, signal) => this.automation.identity(id, signal),
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
    this.automation = new Automation({
      listWorkspaces: signal => this.listWorkspaces(signal),
      taskDirectory: signal => this.taskDirectory(signal),
      schedule: () => ctx.get('schedule'),
      projections: (sessionId, signal) => {
        const controller = ctx.get('sessionController');
        if (!controller) fail('AUTOMATION_UNAVAILABLE', '宿主会话服务尚未加载');
        return controller.projections({ sessionId }, signal);
      },
      confirmClaim: async (sessionId, signal) => {
        abort(signal);
        const session = ctx.sessions.get(sessionId);
        if (!session || !await ctx.sessions.flush(session)) fail('PERSISTENCE', '自动任务用途尚未确认持久化，请保留原会话并回读');
      },
      prepareModel: (sessionId, signal) => {
        const experts = ctx.get('whalewingExperts');
        if (!experts) fail('MODEL_UNAVAILABLE', '专家模型准备服务尚未加载');
        return experts.prepareModel({ sessionId, automation: true }, signal);
      },
      newsLifecycle: async signal => { const owner = await this.newsOwner(signal); await owner.initialize(); return owner.lifecycleTable; },
      createNewsSession: async (sessionId, signal) => {
        const controller = ctx.get('sessionController');
        // 资讯会话直接建在“鲸翼定时任务”工作区里；宿主没有工作区服务时退回只给目录。
        const workspace = await this.taskWorkspace(signal);
        const location = workspace ? { workspaceId: workspace.id } : { cwd: await this.taskDirectory(signal) };
        abort(signal);
        const created = await controller.create({ sessionId, ...location, agentPreset: 'standard' });
        if (created.sessionId !== sessionId || created.agentPreset !== 'standard') fail('AUTOMATION_IDENTITY', '资讯会话身份尚未确认');
        abort(signal);
        if (await this.automation.identity(sessionId, signal) !== 'news') {
          const agent = ctx.get('agents')?.get(sessionId);
          if (!agent) fail('AUTOMATION_UNAVAILABLE', '资讯会话尚未就绪，请按原身份重试');
          const execution = await ctx.commands.execute(agent, '/whalewing {"action":"automation_claim","purpose":"news"}', [], signal);
          if (execution?.result?.kind !== 'success') fail('AUTOMATION_IDENTITY', '资讯会话用途认领失败，请按原身份重试');
        }
        await this.automation.dependencies.confirmClaim(sessionId, signal);
        if (await this.automation.identity(sessionId, signal) !== 'news') fail('AUTOMATION_IDENTITY', '资讯会话用途尚未回读确认');
      },
      newsCreate: async (sessionId, submit, signal) => {
        const owner = await this.newsOwner(signal);
        return owner.withScheduleSpec(sessionId, submit, signal);
      },
    });
    this.typertRemote = bindTypertRemote(this, 'whalewing', { namespace: 'whalewingKnowledge' });
    ctx.typert.register(knowledge.host);
    ctx.typert.register(skillLibrary.host);
    ctx.typert.register(automation.host);
    ctx.typert.register(news.host);
    ctx.typert.register(modelWorld.host);
    ctx.typert.register(aiWeb.host);
    ctx.sessionProjections.register(workbenchProjection);
    ctx.sessionProjections.register(automationProjection);
    ctx.commands.register({
      name: 'whalewing', description: '鲸翼：专家知识、技能与定时整理', input: { hint: '<JSON>' }, recordInput: false,
      handler: async ({ agent, rawInput, signal }) => {
        try {
          if (Buffer.byteLength(rawInput) > this.vault.limits.maxNoteBytes * 2) fail('SIZE', '命令内容超出限制');
          abort(signal);
          const input = JSON.parse(rawInput);
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
          return { kind: 'success', text: JSON.stringify(await this.execute(input, { kind: 'human', agent, signal })) };
        } catch (error) { return { kind: 'error', text: JSON.stringify({ code: error.code || error.name || 'ERROR', message: error.message }) }; }
      },
    });
    // 插件加载后就登记任务工作区，员工不用自己添加目录；失败不影响其它功能，建任务时会再试。
    ctx.inject(['workspaceRegistry'], async () => {
      try { await this.taskWorkspace(this.core.closing.signal); } catch { /* 建任务时会再次登记，并在那里报错。 */ }
    });
    // 服务就绪触发默认任务，而非等待员工打开页面；失败只留下诊断与同身份恢复入口。
    ctx.inject(['schedule', 'sessionController', 'storageDomain', 'profileContext', 'agents'], async scope => {
        const lifecycle = new AbortController();
        scope.effect(() => () => lifecycle.abort(new Error('资讯默认任务依赖已卸载')));
        const operation = this.automation.initializeNews(AbortSignal.any([this.core.closing.signal, lifecycle.signal, AbortSignal.timeout(newsLimits.deadlineMs)]));
        this.core.pending.add(operation);
        try { await operation; this.defaultNewsError = undefined; }
        catch (error) { this.defaultNewsError = { sessionId: 'default-news', message: `每日资讯默认任务未完成初始化：${error.message}`.slice(0, 400) }; }
        finally { this.core.pending.delete(operation); }
    });
    ctx.effect(() => async () => {
      // 先停止新入口并等待真实在途资源，再关闭持久域；晚到的 open 自行关闭而不发布实例。
      const results = await Promise.allSettled([this.core.dispose(), this.modelWorld?.dispose()]);
      this.newsRelease?.resolve();
      this.aiWebRelease?.resolve();
      results.push(...await Promise.allSettled([this.newsLifetime, this.aiWebLifetime]));
      const failed = results.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
    }, 'whalewing pending operations');
  }

  async execute(input, caller) {
    const result = await this.core.execute(input, caller);
    return input.action === 'status' && !input.domain && this.location.notice ? { ...result, locationNotice: this.location.notice } : result;
  }

  /** 只投射宿主登记身份和成员；范围选择与来源过滤继续由自动任务 owner 决定。 */
  async listWorkspaces(signal) {
    abort(signal);
    const registry = this.ctx.get('workspaceRegistry');
    if (!registry) fail('WORKSPACE_UNAVAILABLE', '宿主工作区目录尚未加载，请保留任务并重试');
    const rows = await registry.list();
    abort(signal);
    return rows.map(workspace => ({ workspaceId: workspace.id, path: workspace.path, sessionIds: workspace.sessionIds }));
  }

  /** Schedule 初始化后同步读取两个原 owner；回调内完成来源接纳，不保留范围镜像。 */
  readSourceScope(accept, signal) {
    abort(signal);
    const schedule = this.ctx.get('schedule');
    if (!schedule) fail('SOURCE_UNAVAILABLE', 'DSH 的定时任务插件尚未开启，请在「插件」页开启「定时任务」后重试');
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

  /** 只读当前员工库的公开索引；采样与推荐规则均由学习内容 owner 持有。 */
  async learningContext(signal) {
    abort(signal); abort(this.core.closing.signal);
    if (!await this.vault.initialized()) return { notes: [], total: 0 };
    abort(signal);
    const records = await this.vault.index(signal);
    abort(signal);
    return selectLearningContext(records);
  }

  /** AI 入口持久域以真实 profile 分离并独占持锁，所有已接纳操作结束后才关闭。 */
  async aiWebOwner(signal) {
    abort(signal); abort(this.core.closing.signal);
    if (this.aiWeb) return this.aiWeb;
    if (!this.aiWebOpening) {
      const ready = Promise.withResolvers(), release = Promise.withResolvers();
      const lifetime = (async () => {
        const directory = await this.profileDirectory(this.core.closing.signal);
        const facility = this.ctx.get('storageDomain');
        if (!facility) fail('AI_WEB_UNAVAILABLE', '宿主本地存储服务尚未加载，未修改 AI 入口');
        await withFileLock(path.join(directory, 'whalewing-ai-web'), async () => {
          let domain, owner;
          try {
            abort(this.core.closing.signal);
            domain = await facility.open(profileAiWebDomain(directory));
            abort(this.core.closing.signal);
            owner = new AiWebStore(domain);
            this.aiWebDomain = domain; this.aiWeb = owner;
            ready.resolve(owner);
            await release.promise;
          } finally { try { await owner?.dispose(); } finally { await domain?.close(); } }
        }, { waitMs: 0 });
      })();
      // 持锁 lifetime 不进入业务 pending，卸载先排空写入再释放此等待。
      this.aiWebRelease = release;
      this.aiWebLifetime = lifetime.catch(error => { ready.reject(error); if (this.aiWeb) throw error; });
      const opening = ready.promise;
      this.aiWebOpening = opening;
      this.core.pending.add(opening);
      opening.then(() => this.core.pending.delete(opening), () => {
        this.core.pending.delete(opening);
        if (this.aiWebOpening === opening) this.aiWebOpening = undefined;
      });
    }
    const opening = this.aiWebOpening;
    return observeAutomation(() => opening, signal);
  }

  /** 员工目录管理不启动模型、浏览器或知识库；已提交写入等待真实持久读回。 */
  async manageAiWeb(raw, signal) {
    try {
      const input = aiWeb.input.parse(raw);
      signal = AbortSignal.any([this.core.closing.signal, AbortSignal.timeout(this.vault.limits.operationMs), ...(signal ? [signal] : [])]);
      abort(signal);
      const operation = (async () => { const owner = await this.aiWebOwner(signal); abort(signal); return aiWeb.result.parse(await owner.manage(input, signal)); })();
      this.core.pending.add(operation);
      try { return await operation; } finally { this.core.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

  /** 员工的无会话文件入口；输入白名单不包含模型或定时执行动作。 */
  async manage(input, signal) {
    try {
      return await this.execute(knowledge.input.parse(input), { kind: 'human', signal });
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

  /** 自动任务管理独立于知识库初始化；读取关闭模板不读取会话正文或创建计划。 */
  async manageAutomation(raw, signal) {
    try {
      const input = automation.input.parse(raw);
      if (Buffer.byteLength(JSON.stringify(input)) > 131072) fail('SIZE', '计划请求超过 128 KiB');
      signal = AbortSignal.any([this.core.closing.signal, AbortSignal.timeout(this.vault.limits.operationMs), ...(signal ? [signal] : [])]);
      const operation = this.automation.manage(input, signal).then(result => {
        if (input.action === 'initializeNews') this.defaultNewsError = undefined;
        if (input.action === 'catalog' && this.defaultNewsError) return { ...result, issues: [...result.issues, this.defaultNewsError] };
        return result;
      });
      this.core.pending.add(operation);
      try { return automation.result.parse(await operation); }
      finally { this.core.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

  /** 资讯域按需打开并共用一次初始化；取消调用不再进入后续业务，真实打开资源仍由卸载收束。 */
  async newsOwner(signal) {
    abort(signal); abort(this.core.closing.signal);
    if (this.news) return this.news;
    if (!this.newsOpening) {
      const ready = Promise.withResolvers(), release = Promise.withResolvers();
      const lifetime = (async () => {
        const directory = await this.profileDirectory(this.core.closing.signal);
        const facility = this.ctx.get('storageDomain');
        if (!facility) fail('NEWS_UNAVAILABLE', '宿主本地存储服务尚未加载，未修改资讯或知识库');
        await withFileLock(path.join(directory, 'whalewing-news'), async () => {
          let domain, owner;
          try {
            abort(this.core.closing.signal);
            domain = await facility.open(profileNewsDomain(directory));
            abort(this.core.closing.signal);
            owner = new News(domain, {
              learningContext: nextSignal => this.learningContext(nextSignal),
              identity: (sessionId, nextSignal) => this.automation.identity(sessionId, nextSignal),
              catalog: nextSignal => this.automation.catalog(nextSignal),
              pause: (task, nextSignal) => {
                const { sessionId, status, purpose: _purpose, lastDelivery: _delivery, displayPrompt: _display, workspaceScope: _scope, ...expected } = task;
                return this.automation.manage({ action: 'pause', sessionId, id: task.id, expected, expectedStatus: status }, nextSignal);
              },
            });
            this.newsDomain = domain; this.news = owner;
            ready.resolve(owner);
            await release.promise;
          } finally {
            try { await owner?.dispose(); } finally { await domain?.close(); }
          }
        }, { waitMs: 0 });
      })();
      // 持锁任务不能进入 pending：卸载必须先排空业务，再释放持锁等待，避免自等。
      this.newsRelease = release;
      this.newsLifetime = lifetime.catch(error => {
        ready.reject(error);
        // 尚未发布实例的失败由初始化调用返回；已运行实例的清理失败仍交给卸载报告。
        if (this.news) throw error;
      });
      const opening = ready.promise;
      this.newsOpening = opening;
      this.core.pending.add(opening);
      opening.then(() => this.core.pending.delete(opening), () => {
        this.core.pending.delete(opening);
        if (this.newsOpening === opening) this.newsOpening = undefined;
      });
    }
    const opening = this.newsOpening;
    return observeAutomation(() => opening, signal);
  }

  /** 人工资讯配置和历史读取不初始化个人知识，不取得模型采集/提交身份。 */
  async manageNews(raw, signal) {
    try {
      const input = news.manage.parse(raw);
      signal = AbortSignal.any([this.core.closing.signal, AbortSignal.timeout(newsLimits.deadlineMs), ...(signal ? [signal] : [])]);
      const operation = (async () => { const owner = await this.newsOwner(signal); abort(signal); return news.result.parse(await owner.manage(input, signal)); })();
      this.core.pending.add(operation);
      try { return await operation; } finally { this.core.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

  /** 模型资讯工具只交给资讯 owner；执行预算独立于知识库操作预算。 */
  async executeNews(raw, caller) {
    const input = news.execute.parse(raw);
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException('资讯操作超时', 'TimeoutError')), newsLimits.deadlineMs);
    const signal = AbortSignal.any([this.core.closing.signal, deadline.signal, ...(caller.signal ? [caller.signal] : [])]);
    const operation = (async () => {
      const owner = await this.newsOwner(signal); abort(signal);
      return news.executionResult.parse(await owner.execute(input, { sessionId: caller.agent?.session.id, signal }));
    })();
    this.core.pending.add(operation);
    // 候选返回后的 receipt 继续受真实调用取消约束，但已结束请求的超时不得提前作废它。
    try { return await operation; } finally { clearTimeout(timer); this.core.pending.delete(operation); }
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

  /** 定时任务统一在 DSH 数据目录的 whalewing-tasks 下执行；产物集中一处，不散落到员工工程目录。 */
  async taskDirectory(signal) {
    abort(signal);
    const directory = path.join(this.dshHome, 'whalewing-tasks');
    await mkdir(directory, { recursive: true });
    abort(signal);
    return realpath(directory);
  }

  /** 任务目录登记成一个工作区，侧栏显示“鲸翼定时任务”；员工改过显示名的不覆盖。宿主没有工作区服务时返回 undefined。 */
  async taskWorkspace(signal) {
    const registry = this.ctx.get('workspaceRegistry');
    if (!registry) return undefined;
    const directory = await this.taskDirectory(signal);
    const workspace = await registry.create(directory, taskWorkspaceTitle);
    abort(signal);
    return workspace;
  }

  /** 模型快照只使用公开当前 profile 位置；缺少该上下文时不落入全局目录。 */
  async manageModelWorld(raw, signal) {
    try {
      const input = modelWorld.input.parse(raw);
      signal = AbortSignal.any([this.core.closing.signal, AbortSignal.timeout(worldLimits.operationMs), ...(signal ? [signal] : [])]);
      abort(signal);
      const operation = (async () => {
        if (!this.modelWorld) {
          const directory = await this.profileDirectory(signal);
          this.modelWorld ??= new ModelWorld({ root: path.join(directory, 'cache', 'whalewing-model-world'), vendorIds: modelWorldVendorIds,fetcher: new HttpFetchProvider({ maxResponseBytes: worldLimits.responseBytes, maxBodyChars: worldLimits.responseBytes, timeoutMs: 30000, maxRedirects: 0, userAgent: 'whalewing/0.1.0 ModelWorld' }) });
        }
        return this.modelWorld.execute(input, signal);
      })();
      this.core.pending.add(operation);
      try { return modelWorld.result.parse(await operation); } finally { this.core.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

  /** 员工技能管理不创建会话，不把通用文件写入能力转给模型工具。 */
  async manageSkills(raw, signal) {
    try {
      const input = skillLibrary.input.parse(raw);
      signal = AbortSignal.any([this.core.closing.signal, AbortSignal.timeout(this.vault.limits.operationMs), ...(signal ? [signal] : [])]);
      const operation = ['list', 'read', 'create', 'update', 'remove', 'reset'].includes(input.action)
        ? this.skills.manage(input, signal)
        : this.core.execute({ ...input, domain: 'skill' }, { kind: 'human', signal });
      this.core.pending.add(operation);
      try {
        const result = await operation;
        if (!['list', 'read'].includes(input.action)) this.ctx.emit('whalewing/changed');
        return skillLibrary.result.parse(result);
      } finally { this.core.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

  /** 只读管理候选，不注册运行时 provider；实际可用性仍由各 preset 的真实作用域决定。 */
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

  /** 专家配置复用同一管理候选；读取不赋予模型运行时发现权。 */
  async skillCandidates(signal) {
    signal = AbortSignal.any([this.core.closing.signal, AbortSignal.timeout(this.vault.limits.operationMs), ...(signal ? [signal] : [])]);
    const operation = this.skills.candidates(signal);
    this.core.pending.add(operation);
    try { return await operation; } finally { this.core.pending.delete(operation); }
  }
}
