// 固定版 Schedule 的状态扩展；任务、队列和时间计算仍由原生 owner 持有。
function once(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Schedule 适配锚点次数不符：${before.slice(0, 90)}`);
  return text.replace(before, after);
}

const stateMethods = `
/** 暂停与投递共享串行队列；提交后禁止新接受，已接受消息保留。 */
async pause(request, signal) { return this.setPaused(request, true, signal); }
/** 恢复同一任务，只安排未来期次；过期一次性任务先编辑后恢复。 */
async resume(request, signal) { return this.setPaused(request, false, signal); }
async setPaused(request, paused, signal) {
  return this.serialize(async () => {
    const tasks = (await this.getDomain()).table("tasks");
    signal?.throwIfAborted();
    const current = tasks.get(request.id);
    if (current === undefined || current.sessionId !== request.sessionId) return { id: request.id, updated: false, code: "schedule_not_found" };
    if (current.status === "inactive") return { id: request.id, updated: false, code: "schedule_ended" };
    if (request.expectedStatus !== current.status) return { id: request.id, updated: false, code: "schedule_conflict" };
    const now = Date.now();
    const checked = resolveScheduleUpdate(current.record, request.expected, undefined, now);
    if (!("record" in checked)) return checked;
    const status = paused ? "paused" : "active";
    if (current.status === status) return checked;
    let record = current.record;
    if (!paused && Date.parse(record.scheduledAt) <= now) {
      if (record.kind === "at" || record.kind === "after") return { code: "not_future", message: "请先把已过期的一次性任务编辑为未来时间，再恢复。" };
      try {
        const next = resolveRecurringOccurrence(record, now).nextScheduledAt;
        if (next === undefined) return { code: "time_out_of_range", message: "时间范围内没有下一次可投递期次。" };
        record = { ...record, scheduledAt: next };
      } catch (error) {
        if (!(error instanceof ScheduleInputError)) throw error;
        return { code: error.code, message: error.message };
      }
    }
    await tasks.put(request.id, { ...current, record, status });
    this.emitChanged();
    this.runtime?.requestDrive();
    return { id: request.id, updated: true, record };
  });
}
`;

function service(text) {
  const catalog = text.match(/async catalog\(\) \{[\s\S]*?\.sort\(\(a, b\) => a.scheduledAt.localeCompare\(b.scheduledAt\) \|\| a.id.localeCompare\(b.id\)\);\n[ \t]*\}/)?.[0];
  if (!catalog) throw new Error('Schedule 目录同步投射锚点缺失');
  const projection = catalog.slice(catalog.indexOf('return ') + 7, catalog.lastIndexOf(';')).replace('(await this.getDomain())', 'domain');
  const read = 'async readCatalog(reader, signal) {\nsignal?.throwIfAborted();\nconst domain = await this.getDomain();\nsignal?.throwIfAborted();\nif (this.stopping) throw new Error("Schedule service is stopping");\nconst rows = ' + projection + ';\nconst result = reader(rows);\nif (result && typeof result.then === "function") throw new Error("Schedule catalog reader must be synchronous");\nreturn result;\n}';
  text = once(text, catalog, 'async catalog() { return this.readCatalog(rows => rows); }\n/** Host 本地同步读取接纳点；不暴露表，不允许异步 reader。 */\n' + read);
  const indent = text.includes('\t\tasync update(') ? '\t\t' : '        ';
  text = once(text, `${indent}async update(request, signal) {`, stateMethods.split('\n').map(line => indent + line).join('\n') + `\n${indent}async update(request, signal) {`);
  const anchor = 'const result = resolveScheduleUpdate(current.record, request.expected, request.change, Date.now(), request);';
  text = once(text, anchor, 'if (request.expectedStatus !== current.status) return { id: request.id, updated: false, code: "schedule_conflict" };\n' + indent + '        ' + anchor);
  const decorator = text.match(/^\s*_update_decorators = \[Remote\(["']update["']\)\];$/m)?.[0];
  if (!decorator) throw new Error('Schedule 缺少 Remote 装饰器');
  text = once(text, 'let _update_decorators;', 'let _update_decorators, _pause_decorators, _resume_decorators;');
  text = once(text, decorator, decorator + '\n' + indent + '_pause_decorators = [Remote("pause")];\n' + indent + '_resume_decorators = [Remote("resume")];');
  const registration = text.match(/^[\t ]*__esDecorate\(this, null, _update_decorators,[\s\S]*?\);/m)?.[0];
  text = once(text, registration, registration + '\n' + ['pause', 'resume'].map(name => registration.replaceAll('update', name)).join('\n'));
  if (text.includes('from "./update.js"')) text = once(text, 'import { resolveScheduleUpdate } from "./update.js";', 'import { resolveScheduleUpdate } from "./update.js";\nimport { resolveRecurringOccurrence } from "./domain.js";');
  return text;
}

function declarations(text) {
  const escaped = text.includes("name: 'ScheduleUpdateRequest'");
  text = text.replaceAll("readonly status: \\'active\\' | \\'inactive\\'", "readonly status: \\'active\\' | \\'paused\\' | \\'inactive\\'")
    .replaceAll("readonly status: 'active' | 'inactive'", "readonly status: 'active' | 'paused' | 'inactive'")
    .replaceAll('readonly expected: ScheduleRecord;\\n', escaped ? "readonly expected: ScheduleRecord;\\n    readonly expectedStatus: \\'active\\' | \\'paused\\';\\n" : "readonly expected: ScheduleRecord;\\n    readonly expectedStatus: 'active' | 'paused';\\n");
  const declaration = "export type ScheduleStateRequest = Pick<ScheduleUpdateRequest, 'sessionId' | 'id' | 'expected' | 'expectedStatus'>;";
  const needle = escaped ? "name: 'ScheduleUpdateRequest'" : '"name": "ScheduleUpdateRequest"';
  const at = text.indexOf(needle);
  const begin = text.lastIndexOf('{', at);
  const entry = escaped ? `{ name: 'ScheduleStateRequest', declaration: '${declaration.replaceAll("'", "\\'")}' },\n` : JSON.stringify({name: 'ScheduleStateRequest', declaration}) + ',\n';
  text = text.slice(0, begin) + entry + text.slice(begin);
  const methodNeedle = escaped ? "signature: '@Remote(\\'update\\')" : '"name": "update",';
  const methodAt = text.indexOf(methodNeedle);
  const methodBegin = text.lastIndexOf('{', methodAt);
  const methodEnd = objectEnd(text, methodBegin);
  const description = '暂停保留任务及历史；恢复跳过暂停期次。CAS 同时比较状态与记录，取消不回滚已开始的持久写入。';
  const methods = ['pause', 'resume'].map(method => {
    const signature = `@Remote('${method}') async ${method}(request: ScheduleStateRequest, signal?: AbortSignal): Promise<ScheduleUpdateResult>`;
    return escaped ? `{ signature: '${signature.replaceAll("'", "\\'")}', description: '${description}', parameters: [{ name: 'request', description: '原会话、任务、观测记录与状态。' }, { name: 'signal', description: '写入前取消。' }], returns: '保存后的记录或非变更失败；状态从 catalog 读回。' }` : JSON.stringify({kind: 'method', name: method, signature, summary: description, jsDoc: `/** ${description} */`});
  });
  const signature = 'async readCatalog<T>(reader: (entries: ScheduleCatalogEntry[]) => T, signal?: AbortSignal): Promise<T>';
  const summary = 'Host 本地同步目录接纳点；初始化及取消检查后同步调用 reader，拒收异步结果，不暴露底层表。';
  methods.push(escaped ? `{ signature: '${signature}', description: '${summary}', parameters: [{ name: 'reader', description: '同步读取与接纳函数，不得返回 Promise。' }, { name: 'signal', description: '等待前后取消。' }], returns: '同步 reader 的接纳结果。' }` : JSON.stringify({ kind: 'method', name: 'readCatalog', signature, summary, jsDoc: `/** ${summary} */` }));
  return text.slice(0, methodEnd) + ',\n' + methods.join(',\n') + text.slice(methodEnd);
}

function objectEnd(text, start) {
  let depth = 0, quote = '', escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return i + 1;
  }
  throw new Error('Schedule 对象边界不符');
}

/** 同步 Host、remote-client 和浏览器聚合 codec；复用原更新结果编码。 */
function codecs(text, browser) {
  const z = browser ? '' : 'z.';
  const literal = `${z}literal("active"), ${z}literal("inactive")`;
  text = text.replaceAll(literal, `${z}literal("active"), ${z}literal("paused"), ${z}literal("inactive")`);
  const name = '_deepseek_ai_dsh_schedule_schedule_update_parameter_0$schema';
  const start = text.indexOf('const ' + name + ' =');
  const end = text.indexOf('\nlet ', start) >= 0 && !browser ? text.indexOf('\nlet ', start) : text.indexOf('\n\t\tlet ', start);
  if (start < 0 || end < start) throw new Error('Schedule 更新 codec 边界不符');
  const chunk = text.slice(start, end);
  const open = `${z}object({`;
  text = once(text, chunk, chunk.replace(open, open + `\n  "expectedStatus": ${z}union([${z}literal("active"), ${z}literal("paused")]).readonly(),`));
  const id = browser ? 'id: "@deepseek-ai/dsh-schedule#schedule/update"' : "id: '@deepseek-ai/dsh-schedule#schedule/update'";
  const pos = text.indexOf(id);
  const begin = text.lastIndexOf('{', pos);
  const blockEnd = objectEnd(text, begin);
  const block = text.slice(begin, blockEnd);
  if (!block.includes('ScheduleUpdateResult')) throw new Error('Schedule 方法 codec 边界不符');
  const copies = ['pause', 'resume'].map(method => block.replaceAll('#schedule/update', '#schedule/' + method).replace(/method: (["'])update\1/, `method: "${method}"`).replaceAll('ScheduleUpdateRequest', 'ScheduleStateRequest').replace('create: ' + name, 'create: () => ' + name + '().pick({ sessionId: true, id: true, expected: true, expectedStatus: true })'));
  text = text.slice(0, blockEnd) + ',\n' + copies.join(',\n') + text.slice(blockEnd);
  return text;
}

/** 固定哈希集合调用的 Schedule 转换入口，不写运行时。 */
export function convertSchedule(text, kind) {
  if (kind === 'schedule-index' || kind === 'schedule-domain') {
    text = once(text, 'function scheduleView(record, now) {', 'function scheduleView(record, now, status = "active") {');
    const state = text.match(/state: now >= Date.parse\(record.scheduledAt\) \? (["'])overdue\1 : (["'])scheduled\2/)?.[0];
    if (!state) throw new Error('Schedule 模型状态投影缺失');
    text = once(text, state, 'state: status === "paused" ? "paused" : now >= Date.parse(record.scheduledAt) ? "overdue" : "scheduled"');
  }
  if (kind === 'schedule-index' || kind === 'schedule-service') text = service(text);
  if (kind === 'schedule-index' || kind === 'schedule-storage') text = once(text, text.includes('z$1.enum') ? 'z$1.enum(["active", "inactive"])' : "z.enum(['active', 'inactive'])", text.includes('z$1.enum') ? 'z$1.enum(["active", "paused", "inactive"])' : "z.enum(['active', 'paused', 'inactive'])");
  if (kind === 'schedule-index' || kind === 'schedule-tools') {
    const states = text.match(/enum: \[(["'])scheduled\1, (["'])overdue\2\]/)?.[0];
    if (!states) throw new Error('Schedule 模型输出 schema 状态枚举缺失');
    text = once(text, states, 'enum: ["scheduled", "overdue", "paused"]');
    text = once(text, 'scheduleView(result.record, Date.now())', 'scheduleView(result.record, Date.now(), entry.status)');
    const lookup = text.match(/const expected = \(await rootCtx.schedule.list\(\{ sessionId \}\)\)\s*.find\(\(?record\)? => record.id === id\);/)?.[0];
    if (!lookup) throw new Error('Schedule 模型记录查询消费者缺失');
    text = once(text, lookup, 'const entry = (await rootCtx.schedule.catalog()).find((record) => record.sessionId === sessionId && record.id === id);\nconst expected = entry === undefined || entry.status === "inactive" ? undefined : (({ sessionId: _sessionId, status: _status, lastDelivery: _lastDelivery, ...record }) => record)(entry);');
    const match = text.match(/expected,\r?\n(\s*)\.\.\./);
    if (!match) throw new Error('Schedule 模型更新消费者缺失');
    text = once(text, match[0], 'expected,\n' + match[1] + 'expectedStatus: entry.status,\n' + match[1] + '...');
  }
  if (kind === 'schedule-ui') {
    const panel = 'ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({\n\t\t\t\tname: "sidebar.panellist",\n\t\t\t\tid: PANEL_ID,\n\t\t\t\torder: 10,\n\t\t\t\tlocale: MANAGER_NS,\n\t\t\t\tlabel: () => t("panel")\n\t\t\t}, TaskManagerIcon));';
    text = once(text, panel, `// 导航隐藏租约仅移除侧栏入口，原生计划与详情继续可用。
let navigationLeases = 0;
let syncNavigation = () => {};
let navigationDisposed = false;
ctx.effect(() => () => { navigationDisposed = true; syncNavigation = () => {}; });
ctx.effect(() => ctx.provide("uiScheduleNavigation", {
  hide() {
    if (navigationDisposed) throw new Error("Schedule navigation disposed");
    navigationLeases++;
    syncNavigation();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      navigationLeases--;
      if (!navigationDisposed) syncNavigation();
    };
  }
}));
ctx.slots.inject("sidebar.panellist", () => {
  let remove;
  const sync = () => {
    if (navigationLeases > 0) { if (remove) { remove(); remove = undefined; } }
    else if (!remove) remove = ctx.slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 10, locale: MANAGER_NS, label: () => t("panel") }, TaskManagerIcon);
  };
  syncNavigation = sync;
  sync();
  return () => { if (syncNavigation === sync) syncNavigation = () => {}; if (remove) { remove(); remove = undefined; } };
});`);
    text = once(text, 'expected: timingSnapshot(task),', 'expected: timingSnapshot(task),\n\t\t\t\t\texpectedStatus: task.status === "paused" ? "paused" : "active",');
    text = text.replaceAll('"status.inactive": "Inactive",', '"status.inactive": "Inactive",\n\t\t\t"status.paused": "Paused",');
    text = text.replaceAll('"status.inactive": "已结束",', '"status.inactive": "已结束",\n\t\t\t"status.paused": "已暂停",');
    text = text.replaceAll('children: t("status.inactive")', 'children: t(`status.${task.status}`)');
    // 列表拥有 record 而详情拥有 task；两处共用 locale 身份，不把暂停显示为结束。
    const row = text.indexOf('record.status === "inactive" && (0, react_jsx_runtime.jsx)("span"');
    if (row < 0) throw new Error('Schedule 列表状态消费者缺失');
    text = text.slice(0, row) + text.slice(row).replace('record.status === "inactive"', 'record.status !== "active"').replace('t(`status.${task.status}`)', 't(`status.${record.status}`)');
  }
  if (kind === 'schedule-host' || kind === 'schedule-remote' || kind === 'browser') text = codecs(text, kind === 'browser');
  if (kind === 'schedule-host' || kind === 'catalog') text = declarations(text);
  return text;
}
