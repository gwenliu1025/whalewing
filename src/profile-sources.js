import { abort, fail } from './vault.js';
import { observeAutomation, automationPresentation, selectWorkspaceRows } from './automation.js';

const order = (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);
const ordinary = header => header.origin !== 'subagent' && !(header.delegationDepth > 0);

/** 成功游标与公平扫描位置共同属于来源 owner；目录和标题每次从宿主重建。 */
export class ProfileSources {
  constructor(core) { this.core = core; this.scanning = false; }

  state(settings) {
    const value = settings.profileCoverage;
    if (value === undefined) return undefined;
    if (!value || !Array.isArray(value.through) || value.through.some(row => !row || typeof row.sessionId !== 'string' || !/^[\w-]{1,100}$/.test(row.sessionId) || !Number.isSafeInteger(row.throughSeq) || row.throughSeq < -1)
      || new Set(value.through.map(row => row.sessionId)).size !== value.through.length
      || value.scanAfter !== null && (!value.scanAfter || typeof value.scanAfter.id !== 'string' || !Number.isFinite(value.scanAfter.createdAt))) fail('SOURCE_CONFIG', '全 profile 覆盖记录损坏；保留原件，不重置成功游标');
    return value;
  }

  async authorized(caller, accept = allowed => allowed) {
    const id = caller.agent?.session.id;
    if (!id || !this.core.dependencies.automationIdentity || await this.core.dependencies.automationIdentity(id, caller.signal) !== 'knowledge') fail('SOURCE_MODE', '全 profile 来源仅由已启用的独立知识整理会话处理；旧人工来源保留供恢复');
    if (!this.core.dependencies.readSourceScope) fail('SOURCE_UNAVAILABLE', '宿主同步来源范围接口尚未加载，请保留原任务并重试');
    return observeAutomation(() => this.core.dependencies.readSourceScope(({ tasks: catalog, workspaces }) => {
      abort(caller.signal);
      // 此无 await 片段是操作接纳点；之后的持久写入不冒称可被撤回回滚。
      const tasks = catalog.filter(task => task.sessionId === id);
      if (tasks.length !== 1) fail('SOURCE_MODE', '知识整理计划未启用、存在冲突或已取消，未读取来源');
      const { workspaceScope } = automationPresentation(tasks[0].prompt ?? '');
      const allowed = workspaceScope ? new Set(selectWorkspaceRows(workspaces, workspaceScope).flatMap(row => row.sessionIds)) : null;
      return accept(allowed);
    }, caller.signal), caller.signal);
  }

  async initialize(caller) {
    await this.authorized(caller);
    if (this.state(await this.core.vault.settings())) return;
    await this.core.vault.updateSettings(current => {
      if (this.state(current)) return current;
      // 只迁移已有成功覆盖，旧登记原件不删除；从此不再推进另一套人工账本。
      return { ...current, profileCoverage: { through: current.sources.map(({ sessionId, throughSeq }) => ({ sessionId, throughSeq })), scanAfter: null } };
    }, caller.signal);
    this.core.receipts.clear(); this.core.sourceCutoffs.clear(); this.core.sourceReads.clear();
  }

  async directory(signal) {
    if (!this.core.dependencies.listSessions) fail('SOURCE_UNAVAILABLE', '宿主会话目录尚未提供');
    const records = await observeAutomation(() => this.core.dependencies.listSessions(signal), signal);
    if (!Array.isArray(records) || records.some(record => typeof record?.header?.id !== 'string' || !Number.isFinite(record.header.createdAt))) fail('SOURCE_DIRECTORY', '宿主目录不是有效的会话头集合，请保留覆盖记录并检查日志');
    return records.map(record => record.header).filter(ordinary).sort(order);
  }

  async source(id, caller, accept = header => header) {
    await this.authorized(caller);
    const header = (await this.directory(caller.signal)).find(header => header.id === id);
    if (!header || await this.core.dependencies.automationIdentity(id, caller.signal) !== null) fail('SOURCE_SCOPE', '此来源不在任务选定的工作区普通会话范围');
    return this.authorized(caller, allowed => {
      if (allowed && !allowed.has(id)) fail('SOURCE_SCOPE', '此来源不在任务选定的工作区普通会话范围');
      return accept(header);
    });
  }

  async list(caller) {
    if (this.scanning) fail('BUSY', '来源目录正在续扫，请等待当前页返回');
    this.scanning = true;
    try {
      await this.initialize(caller);
      const allowed = await this.authorized(caller);
      const settings = this.state(await this.core.vault.settings()), directory = (await this.directory(caller.signal)).filter(header => !allowed || allowed.has(header.id));
      const remaining = settings.scanAfter ? directory.filter(header => order(header, settings.scanAfter) > 0) : directory;
      const batch = remaining.slice(0, 10), sources = [], issues = [];
      let excluded = 0;
      for (const header of batch) {
        abort(caller.signal);
        try {
          if (await this.core.dependencies.automationIdentity(header.id, caller.signal) !== null) { excluded++; continue; }
          const saved = settings.through.find(row => row.sessionId === header.id);
          sources.push({ sessionId: header.id, title: header.id, cwd: header.cwd, ...(saved ? { throughSeq: saved.throughSeq } : {}) });
        } catch (error) { abort(caller.signal); issues.push({ sessionId: header.id, message: error.message }); }
      }
      const hasMore = remaining.length > batch.length;
      const last = batch.at(-1);
      const scanAfter = hasMore && last ? { id: last.id, createdAt: last.createdAt } : null;
      await this.core.vault.updateSettings(current => this.authorized(caller, latest => {
        if (Boolean(allowed) !== Boolean(latest) || allowed && (allowed.size !== latest.size || [...allowed].some(id => !latest.has(id)))) fail('SOURCE_SCOPE', '来源扫描期间工作区范围已变化，请重新获取来源');
        return { ...current, profileCoverage: { ...this.state(current), scanAfter } };
      }), caller.signal);
      return { mode: 'profile', sources, issues, directoryTotal: directory.length, inspected: batch.length, excluded, hasMore, scanAfter, savedCoverageCount: settings.through.length };
    } finally { this.scanning = false; }
  }
}
