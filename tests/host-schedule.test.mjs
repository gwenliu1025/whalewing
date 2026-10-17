import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { readRuntime, transformFiles } from '../host-adapter/adapter.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const runtime = process.env.WHALEWING_HOST_ADAPTER_BASELINE ?? path.join(root, '.artifacts/youjin-first-version/runtime');
const files = transformFiles(await readRuntime(runtime)).files;
const prefix = 'node_modules/@deepseek-ai/dsh-schedule/lib/';
const domain = await import(pathToFileURL(path.join(runtime, prefix, 'types/domain.js')));
const { resolveScheduleUpdate } = await import(pathToFileURL(path.join(runtime, prefix, 'types/update.js')));
const { appendDelivery } = await import(pathToFileURL(path.join(runtime, prefix, 'types/delivery-history.js')));
const require = createRequire(path.join(runtime, 'package.json'));
const { z } = require('zod');
const text = files.get(prefix + 'index.js').toString('utf8');

function section(source, from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, from);
  return source.slice(start, end);
}

function fixture(record, status = 'active') {
  let saved = JSON.stringify({ sessionId: 'session', record, status, deliveryHistory: { records: [], earlierRecordsUnavailable: false } });
  let writes = 0;
  const table = { get: id => id === record.id ? JSON.parse(saved) : undefined, entries: () => [[record.id, JSON.parse(saved)]], async put(id, value) { assert.equal(id, record.id); writes++; saved = JSON.stringify(value); } };
  // 直接执行被适配的服务方法与原时间算法；只替换存储及时钟边界。
  const methods = section(text, '/** 暂停与投递', '\n\t\t/**\n\t\t* Dispatch one post-commit');
  const service = vm.runInNewContext('(class {' + methods + '})', { ...domain, resolveScheduleUpdate, Date: class extends Date { static now() { return Date.parse('2030-01-01T12:00:00.000Z'); } } });
  const value = new service();
  let chain = Promise.resolve();
  value.serialize = fn => { const result = chain.then(fn); chain = result.catch(() => {}); return result; };
  value.getDomain = async () => ({ table: () => table });
  value.emitChanged = () => {};
  value.runtime = { requestDrive() {} };
  return { service: value, table, read: () => JSON.parse(saved), writes: () => writes, request: () => ({ sessionId: 'session', id: record.id, expected: JSON.parse(saved).record, expectedStatus: JSON.parse(saved).status }) };
}
const now = Date.parse('2030-01-01T12:00:00.000Z');
const recurring = () => domain.createEveryScheduleRecord('id', '工作', 60, now - 600_000, '任务');

test('暂停保留身份与历史，状态CAS拒绝过期编辑，重复同态请求无写入', async () => {
  const f = fixture(recurring()); const stale = f.request();
  assert.equal((await f.service.pause(stale)).updated, true);
  assert.equal(f.read().status, 'paused');
  assert.equal(f.read().record.id, 'id');
  assert.equal((await f.service.update({ ...stale, title: '旧编辑' })).code, 'schedule_conflict');
  assert.equal((await f.service.pause(f.request())).updated, false);
  assert.equal(f.writes(), 1);
  assert.deepEqual(f.read().deliveryHistory, { records: [], earlierRecordsUnavailable: false });
});

test('暂停允许CAS编辑；恢复跳过暂停期次并保留固定周期锚点', async () => {
  const f = fixture(recurring(), 'paused');
  assert.equal((await f.service.update({ ...f.request(), title: '新标题' })).updated, true);
  assert.equal(f.read().status, 'paused');
  assert.equal((await f.service.resume(f.request())).updated, true);
  assert.equal(f.read().status, 'active');
  assert.equal(f.read().record.title, '新标题');
  assert.equal(f.read().record.scheduledAt, '2030-01-01T12:01:00.000Z');
});

test('过期一次任务保持暂停，编辑未来时间后恢复；未来任务不重新锚定', async () => {
  const r = domain.createAfterScheduleRecord('id', '工作', 60, now - 600_000, '任务');
  const f = fixture(r, 'paused');
  assert.equal((await f.service.resume(f.request())).code, 'not_future');
  assert.equal(f.read().status, 'paused'); assert.equal(f.writes(), 0);
  assert.equal((await f.service.update({ ...f.request(), change: { kind: 'at', at: '2030-01-02T12:00:00.000Z' } })).updated, true);
  assert.equal((await f.service.resume(f.request())).updated, true);
  assert.equal(f.read().record.scheduledAt, '2030-01-02T12:00:00.000Z');
});

test('每日、每周及cron恢复复用原日历算法', async () => {
  const records = [domain.createDailyScheduleRecord('id','工作',{time:'08:00:00',time_zone:'Asia/Shanghai'},now-5*86400000,'任务'), domain.createWeeklyScheduleRecord('id','工作',{time:'08:00:00',time_zone:'Asia/Shanghai',weekdays:[1,3,5]},now-20*86400000,'任务'), domain.createCronScheduleRecord('id','工作',{expression:'0 8 * * *',time_zone:'Asia/Shanghai'},now-5*86400000,'任务')];
  for (const r of records) { const f=fixture(r,'paused'); const expected=domain.resolveRecurringOccurrence(r,now).nextScheduledAt; await f.service.resume(f.request()); assert.equal(f.read().record.scheduledAt,expected); assert.ok(Date.parse(expected)>now); }
});

test('会话错绑、结束、缺失状态、记录冲突与取消均不写入', async () => {
  const f = fixture(recurring());
  assert.equal((await f.service.pause({ ...f.request(), sessionId: 'other' })).code, 'schedule_not_found');
  assert.equal((await f.service.pause({ ...f.request(), expectedStatus: undefined })).code, 'schedule_conflict');
  assert.equal((await f.service.pause({ ...f.request(), expected: { ...f.request().expected, title: '另一份' } })).code, 'schedule_conflict');
  assert.equal((await fixture(recurring(), 'inactive').service.resume(f.request())).code, 'schedule_ended');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.service.pause(f.request(), controller.signal));
  assert.equal(f.writes(), 0);
});

test('暂停排在已接受投递后提交，并发旧状态请求拒收', async () => {
  const f = fixture(recurring()); let release;
  const accepted = f.service.serialize(() => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const request = f.request(); const paused = f.service.pause(request); const edit = f.service.update({ ...request, title: '并发编辑' });
  assert.equal(f.read().status, 'active'); release(); await accepted; await paused;
  assert.equal((await edit).code, 'schedule_conflict'); assert.equal(f.read().status, 'paused');
});

test('Host与Remote真实codec接受paused目录及新接口，状态为必填', () => {
  for (const file of ['typert.host.js','typert.remote-client.js']) {
    const source=files.get(prefix+file).toString('utf8').replace(/^import .*$/mg,'').replace(/export default TYPERT_(HOST|REMOTE)/g,'').replace(/export const /g,'const ');
    const metadata=vm.runInNewContext(source+'\n; typeof TYPERT !== "undefined" ? TYPERT : TYPERT_REMOTE',{z});
    for (const name of ['pause','resume','update']) {
      const method=(metadata.invocations ?? metadata.descriptors).find(x=>x.method===name); assert.ok(method,name);
      const schema=method.parameters[0].codec.create(); const f=fixture(recurring());
      assert.equal(schema.safeParse(f.request()).success,true);
      assert.equal(schema.safeParse({...f.request(),expectedStatus:undefined}).success,false);
    }
    const catalog=(metadata.invocations ?? metadata.descriptors).find(x=>x.method==='catalog').result.create();
    assert.equal(catalog.safeParse([{...recurring(),sessionId:'session',status:'paused'}]).success,true);
  }
});

test('存储schema唯一兼容缺失状态，重开保持paused且拒绝未知状态', () => {
  const source=files.get(prefix+'types/storage.js').toString('utf8').replace(/^import .*$/mg,'').replaceAll('export const ','const ').replaceAll('export type ','type ');
  const schema=vm.runInNewContext(source+'\n; scheduleTaskSchema',{z,...domain,SessionId:x=>x,MessageId:x=>x,defineDomain:x=>x,domainTable:x=>x});
  const old={sessionId:'session',record:recurring()};
  assert.equal(schema.parse(old).status,'active');
  assert.equal(schema.parse(JSON.parse(JSON.stringify({...old,status:'paused'}))).status,'paused');
  assert.equal(schema.safeParse({...old,status:'unknown'}).success,false);
});

test('实际浏览器聚合codec与Host保持状态及启停请求一致', () => {
  const browser=files.get('node_modules/@deepseek-ai/dsh-api-remotes/lib/client.js').toString('utf8');
  const source=section(browser,'//#region ../../schedule/schedule/lib/typert.remote-client.js','//#endregion');
  const metadata=vm.runInNewContext(source+'\n; TYPERT_REMOTE$16', {...z});
  for (const name of ['pause','resume','update']) {
    const schema=metadata.descriptors.find(x=>x.method===name).parameters[0].codec.create();
    assert.equal(schema.safeParse(fixture(recurring(),'paused').request()).success,true);
    assert.equal(schema.safeParse({...fixture(recurring()).request(),expectedStatus:'inactive'}).success,false);
  }
  assert.equal(metadata.descriptors.find(x=>x.method==='catalog').result.create().safeParse([{...recurring(),sessionId:'session',status:'paused'}]).success,true);
});

test('真实调度器不接受暂停任务；在途投递完成后暂停保持实际回执', async () => {
  const f=fixture(recurring(),'paused'); let delivered=0; let timers=0; let receiptRelease; let entered;
  const started=new Promise(resolve=>{entered=resolve;});
  const Runtime=vm.runInNewContext(section(text,'var ScheduleRuntime = class','//#region lib/types/tools.js')+'\n; ScheduleRuntime',{
    ...domain, appendDelivery, MAX_TIMER_DELAY_MS:2147483647,
    createUserMessage:input=>({...input,id:'message'}),
    Date:class extends Date {static now(){return now;}},
    setTimeout(){timers++;return {unref(){}};},clearTimeout(){},
  });
  const ctx={logger:{warn(message){throw new Error(message);}},agents:{withoutInitiator:fn=>fn()},sessionController:{async resolveAgent(){return {agent:{session:{},followup(){delivered++;}}};}},sessions:{async flush(){entered();await new Promise(resolve=>{receiptRelease=resolve;});return true;}}};
  const scheduler=new Runtime(ctx,()=>[f.read()],fn=>f.service.serialize(fn),task=>f.table.put(task.record.id,task),{days:30,records:200});
  await scheduler.drive(); assert.equal(delivered,0); assert.equal(timers,0);
  await f.table.put('id',{...f.read(),status:'active'});
  scheduler.requestDrive(); await started;
  // 投递已被接受；暂停必须等回执写完，再以最新记录提交。
  const pause=f.service.pause(f.request());
  receiptRelease(); await scheduler.running; assert.equal((await pause).code,'schedule_conflict');
  await f.service.pause(f.request());
  assert.equal(f.read().status,'paused');assert.equal(f.read().deliveryHistory.records.length,1);assert.equal(f.read().lastDelivery.messageId,'message');
  await scheduler.drive();assert.equal(delivered,1);await scheduler.dispose();
});

test('持久写入失败不发布状态；重新读取仍是原任务', async () => {
  const f=fixture(recurring());let notified=0;
  f.service.emitChanged=()=>{notified++;};f.table.put=async()=>{throw new Error('磁盘失败');};
  await assert.rejects(f.service.pause(f.request()),/磁盘失败/);
  assert.equal(f.read().status,'active');assert.equal(notified,0);
});

test('实际模型更新工具返回paused及反射schema，不把暂停记录投影为已安排', async () => {
  const source = files.get(prefix + 'types/tools.js').toString('utf8').replace(/^import .*$/mg, '').replace('export function registerScheduleTools', 'function registerScheduleTools');
  const projection = section(text, 'function scheduleView(', '/** Fixed model-facing origin line');
  const scheduleView = vm.runInNewContext(projection + '\n; scheduleView');
  const register = vm.runInNewContext(source + '\n; registerScheduleTools', {
    ...domain, scheduleView, defineTool: value => value,
    Date: class extends Date { static now() { return now; } },
  });
  // 真实工具→真实更新方法→原存储写入→模型结果，覆盖成功与同值更新两条出口。
  for (const status of ['paused', 'active']) {
    for (const future of [true, false]) {
      const record = domain.createEveryScheduleRecord('id', '工作', 60, future ? now : now - 600_000, '任务');
      const f = fixture(record, status); const tools = new Map(); const agent = { session: { id: 'session' } };
      f.service.catalog = async () => { const task = f.read(); return [{ ...task.record, sessionId: task.sessionId, status: task.status }]; };
      f.service.list = async () => f.read().status === 'active' ? [f.read().record] : [];
      const dispose = register({ schedule: f.service }, { tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name); } } }, agent);
      try {
        const tool = tools.get('schedule_update');
        const expected = status === 'paused' ? 'paused' : future ? 'scheduled' : 'overdue';
        for (const title of ['新标题', '新标题']) {
          const result = await tool.execute({ id: 'id', title }, { agent, signal: new AbortController().signal });
          assert.equal(result.state, expected);
          assert.equal(result.title, title);
          assert.equal(f.read().status, status);
          assert.equal(f.read().record.title, title);
          assert.equal(result.deliveryMode, 'host');
          const variants = tool.output.schema.oneOf[0].oneOf;
          assert.ok(variants.length > 0);
          for (const variant of variants) assert.ok(variant.properties.state.enum.includes(result.state));
          assert.match(tool.output.render({ id: 'id', title }, result)[0].text, new RegExp(`"state":\\s*"${expected}"`));
        }
        const listed = await tools.get('schedule_list').execute({}, { agent, signal: new AbortController().signal });
        assert.equal(listed.length, status === 'paused' ? 0 : 1);
        if (status === 'active') assert.equal(listed[0].state, expected);
      } finally { dispose(); assert.equal(tools.size, 0); }
    }
  }
});

test('独立domain公开投影与bundle一致，原创建工具仍返回活动时间状态', async () => {
  const source = files.get(prefix + 'types/domain.js').toString('utf8');
  const view = section(source, 'export function scheduleView(', '/** Fixed model-facing origin line').replace('export function', 'function');
  const scheduleView = vm.runInNewContext(view + '\n; scheduleView');
  const record = domain.createEveryScheduleRecord('id', '工作', 60, now, '任务');
  assert.equal(scheduleView(record, now, 'paused').state, 'paused');
  assert.equal(scheduleView(record, now).state, 'scheduled');
  assert.equal(scheduleView(record, now + 600_000).state, 'overdue');
  const toolsSource = files.get(prefix + 'types/tools.js').toString('utf8').replace(/^import .*$/mg, '').replace('export function registerScheduleTools', 'function registerScheduleTools');
  const register = vm.runInNewContext(toolsSource + '\n; registerScheduleTools', { ...domain, scheduleView, defineTool: value => value, Date: class extends Date { static now() { return now; } } });
  const tools = new Map(); const agent = { session: { id: 'session' } };
  const dispose = register({ schedule: { async create() { return record; } } }, { tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name); } } }, agent);
  try {
    const result = await tools.get('schedule_create').execute({ title: '任务', prompt: '工作', every_seconds: 60 }, { agent, signal: new AbortController().signal });
    assert.equal(result.state, 'scheduled'); assert.equal(result.id, 'id');
  } finally { dispose(); }
});


test('真实Cordis与SlotCore隐藏租约释放、重复释放、重装及宿主卸载不复活入口', async t => {
  const { Context } = require('@deepseek-ai/cordis');
  const { SlotCore } = require('@deepseek-ai/dsh-client-ui-slots');
  const ctx = new Context(), slots = new SlotCore();
  t.after(() => ctx.fiber.dispose());
  const source = files.get('node_modules/@deepseek-ai/dsh-client-ui-schedule/lib/client.js').toString('utf8');
  const body = section(source, '// 导航隐藏租约', '\n\t\t\tctx.uiConversation.events.register');
  const detachRoot = slots.register({ name: 'root', children: { 'sidebar.panellist': { kind: 'list', scope: 'root' } } }, () => null);
  t.after(detachRoot);
  let hostContext, release;
  const host = await ctx.plugin({ name: 'schedule-navigation-fixture', apply(context) {
    hostContext = context;
    context.provide('slots', { register: (...args) => slots.register(...args), inject: (_key, callback) => context.effect(callback) });
    vm.runInNewContext(body, { ctx: context, PANEL_ID: 'schedules', MANAGER_NS: 'schedule.manager', t: value => value, TaskManagerIcon: () => null });
  } });
  const count = () => slots.entriesOfSlot('sidebar.panellist').length;
  assert.equal(count(), 1);
  const plugin = await ctx.plugin({ name: 'whalewing-navigation-fixture', inject: ['uiScheduleNavigation'], apply(context) { context.effect(() => { release = context.uiScheduleNavigation.hide(); return release; }); } });
  assert.equal(count(), 0);
  const second = hostContext.uiScheduleNavigation.hide();
  await plugin.dispose(); assert.equal(count(), 0);
  second(); assert.equal(count(), 1); second(); release(); assert.equal(count(), 1);
  const again = await ctx.plugin({ name: 'whalewing-navigation-reinstalled', inject: ['uiScheduleNavigation'], apply(context) { context.effect(() => context.uiScheduleNavigation.hide()); } });
  assert.equal(count(), 0);
  await again.dispose(); assert.equal(count(), 1);
  const late = hostContext.uiScheduleNavigation.hide();
  await host.dispose(); late(); assert.equal(count(), 0);
});


test('Host readCatalog等待完成后同步投射最新表，取消和异步reader拒收，catalog语义保持', async () => {
  const code = text.match(/async catalog\(\) \{ return this\.readCatalog[\s\S]*?return result;\n\}/)?.[0];
  assert.ok(code);
  const Subject = vm.runInNewContext('(class {' + code + '})');
  const subject = new Subject(), entered = Promise.withResolvers(), release = Promise.withResolvers();
  let current = { sessionId: 's', status: 'active', record: recurring() };
  subject.getDomain = async () => { entered.resolve(); await release.promise; return { table: () => ({ entries: () => [['id', current]] }) }; };
  const controller = new AbortController(); let calls = 0;
  const read = subject.readCatalog(rows => { calls++; return rows[0].prompt; }, controller.signal);
  await entered.promise; current = { ...current, record: { ...current.record, prompt: '撤回后最新范围' } }; release.resolve();
  assert.equal(await read, '撤回后最新范围'); assert.equal(calls, 1);
  assert.equal((await subject.catalog())[0].prompt, '撤回后最新范围');
  await assert.rejects(subject.readCatalog(async () => []), /must be synchronous/);
  const wait = Promise.withResolvers(); subject.getDomain = async () => { await wait.promise; return { table: () => ({ entries: () => [] }) }; };
  const pending = subject.readCatalog(() => { calls++; }, controller.signal);
  controller.abort(new Error('初始化等待取消')); wait.resolve();
  await assert.rejects(pending, /初始化等待取消/); assert.equal(calls, 1);
  subject.stopping = true;
  await assert.rejects(subject.readCatalog(() => {}), /stopping/);
  for (const name of ['typert.host.js', 'typert.remote-client.js']) assert.ok(!files.get(prefix + name).toString('utf8').includes('#schedule/readCatalog'), '不新增Remote callback');
});

test('实际index来源桥透传signal并在同一同步reader内读取成员及接纳', async () => {
  const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
  const code = section(source, '  readSourceScope(accept, signal)', '\n  /**');
  const bridge = vm.runInNewContext('({' + code + '})', { abort: signal => signal?.throwIfAborted(), fail: (code, message) => { throw Object.assign(new Error(message), { code }); } });
  const controller = new AbortController(), trace = [];
  const schedule = { readCatalog(reader, signal) { assert.equal(signal, controller.signal); trace.push('catalog'); return reader([{ id: 'task' }]); } };
  const registry = { list() { trace.push('members'); return [{ id: 'w', path: '/w', sessionIds: ['source'] }]; } };
  bridge.ctx = { get: name => name === 'schedule' ? schedule : registry };
  const result = bridge.readSourceScope(({ tasks, workspaces }) => { trace.push('accept'); return { task: tasks[0].id, source: workspaces[0].sessionIds[0] }; }, controller.signal);
  assert.deepEqual(result, { task: 'task', source: 'source' });
  assert.deepEqual(trace, ['catalog', 'members', 'accept']);
  controller.abort(new Error('取消')); assert.throws(() => bridge.readSourceScope(() => assert.fail('取消后不接纳'), controller.signal), /取消/);
});
