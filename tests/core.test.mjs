import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getEventListeners } from 'node:events';
import { Vault, digest, layout, relativeName, validateNote } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';
import { WhalewingCore, schedulePrefix } from '../src/service.js';
import { Automation } from '../features/automation/automation.js';

const note = (title, body = '有来源的任务结论。') => `---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-08\nupdated: 2026-10-08\naliases: []\n---\n\n# ${title}\n\n${body}\n`;
const skill = (name, body = '先读取来源，检查适用条件，再完成任务并核对结果。') => `---\nname: ${name}\ndescription: 有明确需求时按来源方法完成输入检查与任务验收\n---\n\n${body}\n`;
const review = { reviewer: '独立测试检查者fixture', positive: '适用输入执行并核对输出成立', negative: '缺失来源输入被阻断且无副作用' };

// 屏障只挂起一次宿主读取；后续员工操作仍能通过同一公开服务完成。
async function sourceFixture(t) {
  const { directory } = await fixture(t);
  let barrier;
  const snapshot = { session: {}, inheritedEventCount: 0, events: [{ seq: 0, time: '2026-10-11T00:00:00Z', type: 'user/message', data: { content: [{ type: 'text', text: '已明确纳入的夹具原文' }] } }] };
  const read = async () => {
    const current = barrier; barrier = undefined;
    if (current) {
      current.entered.resolve();
      try { await current.release.promise; } finally { current.drained.resolve(); }
    }
    return snapshot;
  };
  const core = new WhalewingCore(path.join(directory, 'service'), { skillsRoot: path.join(directory, 'skills'), readSession: read, schedule: () => ({ list: async () => { await read(); return []; } }) });
  t.after(() => core.dispose());
  const human = { kind: 'human', agent: { session: { id: 'workbench' } } }, model = { ...human, kind: 'model' };
  await core.execute({ action: 'source_add', sessionId: 'source' }, human);
  return { core, human, model, hold() {
    barrier = { entered: Promise.withResolvers(), release: Promise.withResolvers(), drained: Promise.withResolvers() };
    return barrier;
  } };
}

for (const readd of [false, true]) test(`来源在途读取遇到移除${readd ? '并重新纳入' : ''}，不发布旧正文或凭据`, async t => {
  const { core, human, model, hold } = await sourceFixture(t), barrier = hold();
  const reading = core.execute({ action: 'source_read', sessionId: 'source' }, model);
  const rejected = assert.rejects(reading, { code: 'SOURCE_SCOPE' });
  try {
    await barrier.entered.promise;
    await core.execute({ action: 'source_remove', sessionId: 'source' }, human);
    if (readd) await core.execute({ action: 'source_add', sessionId: 'source' }, human);
  } finally { barrier.release.resolve(); }
  await rejected;
  assert.equal(core.receipts.size, 0); assert.equal(core.sourceCutoffs.size, 0);
  assert.equal(core.sourceReads.size, 0);
  if (readd) assert.equal((await core.execute({ action: 'source_read', sessionId: 'source' }, model)).events.length, 1);
});

test('覆盖提交等待来源时移除再纳入，不复活已经撤销的读取凭据', async t => {
  const { core, human, model, hold } = await sourceFixture(t);
  const page = await core.execute({ action: 'source_read', sessionId: 'source' }, model);
  const output = await core.execute({ action: 'write', path: '40-知识/产物.md', content: note('产物'), expectedHash: '' }, model);
  const barrier = hold();
  const completing = core.execute({ action: 'complete', receipt: page.receipt, outputs: [output], summary: '已回读并检查测试产物' }, model);
  const rejected = assert.rejects(completing, { code: 'RECEIPT' });
  try {
    await barrier.entered.promise;
    await core.execute({ action: 'source_remove', sessionId: 'source' }, human);
    await core.execute({ action: 'source_add', sessionId: 'source' }, human);
  } finally { barrier.release.resolve(); }
  await rejected;
  assert.equal((await core.vault.settings()).sources[0].throughSeq, -1);
});

for (const action of ['source_read']) for (const mode of ['cancel', 'timeout', 'dispose', 'late-error']) test(`${action} 宿主读取屏障：${mode}结束本地等待，迟到结果不发布`, { timeout: 5000 }, async t => {
  const { core, human, hold } = await sourceFixture(t), barrier = hold(), controller = new AbortController();
  let returned = 0, actualSignal;
  const originalDispatch = core.dispatch.bind(core);
  core.dispatch = (args, caller) => { actualSignal = caller.signal; return originalDispatch(args, caller); };
  const operation = core.execute({ action, ...(action === 'source_read' ? { sessionId: 'source' } : {}) }, { ...human, signal: controller.signal });
  operation.then(() => returned++, () => {});
  let timer, disposal;
  try {
    await barrier.entered.promise;
    if (mode === 'dispose') disposal = core.dispose();
    else if (mode === 'timeout') timer = setTimeout(() => controller.abort(new DOMException('截止时间已到', 'TimeoutError')), 30);
    else controller.abort(new Error('员工取消等待'));
    // 外层计时器只拒收卡死回归；它不释放屏障，也不制造被测取消。
    let guard;
    try {
      await Promise.race([assert.rejects(operation, mode === 'timeout' ? { name: 'TimeoutError' } : /取消|卸载/), new Promise((_, reject) => { guard = setTimeout(() => reject(new Error('本地等待未响应取消')), 700); })]);
    } finally { clearTimeout(guard); }
    await disposal;
    assert.equal(core.pending.size, 0); assert.equal(core.receipts.size, 0); assert.equal(core.sourceCutoffs.size, 0);
    assert.equal(core.sourceReads.size, 0);
    assert.equal(getEventListeners(actualSignal, 'abort').length, 0);
    assert.equal(returned, 0);
  } finally {
    clearTimeout(timer);
    if (mode === 'late-error') barrier.release.reject(new Error('宿主迟到失败'));
    else barrier.release.resolve();
    await barrier.drained.promise; await Promise.allSettled([operation, disposal]);
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(returned, 0); assert.equal(core.receipts.size, 0); assert.equal(core.sourceCutoffs.size, 0);
});

test('旧调度入口在初始化前拒收，任何调用者都不能产生副作用', async t => {
  const { directory } = await fixture(t), calls = [];
  const core = new WhalewingCore(path.join(directory, 'retired'), { skillsRoot: path.join(directory, 'skills'), schedule: () => { calls.push('schedule'); throw new Error('不应读取旧调度'); }, followup: () => calls.push('followup') });
  t.after(() => core.dispose());
  for (const kind of ['human', 'model']) for (const action of ['schedule_list', 'schedule_create', 'schedule_delete', 'schedule_run']) {
    await assert.rejects(core.execute({ action, id: 'legacy-task', time: '00:15:00', timeZone: 'Asia/Shanghai' }, { kind, agent: { session: { id: 'not-claimed' } } }), { code: 'SCHEDULE_RETIRED' });
  }
  assert.equal(await core.vault.initialized(), false); assert.deepEqual(calls, []);
  assert.equal(core.scheduling, undefined); assert.equal(core.pending.size, 0);
});

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-test-'));
  // 仅删除本测试独占创建的随机目录，不触及库外 fixture 原件。
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const vault = new Vault(path.join(directory, 'vault'));
  await vault.initialize();
  return { directory, vault, library: new SkillLibrary(vault, path.join(directory, 'skills')) };
}

const bundledNotes = ['00-系统/Bases', '00-系统/模板', '00-系统/规则'];
const templates = ['MOC模板', '书籍来源模板', '任务日记模板', '作品模板', '原子笔记模板', '周回顾模板', '外部文件索引模板', '日记模板', '月回顾模板', '正式笔记模板', '网页剪藏模板', '项目模板', '领域模板'];

test('空库初始化建齐目录骨架、规则、模板与视图，重复初始化幂等且结构校验通过', async t => {
  const { vault } = await fixture(t);
  const files = await vault.files();
  assert.deepEqual(files, ['00-系统/知识库首页.md', ...templates.map(name => `00-系统/模板/${name}.md`), ...['作品写作规范', '知识库使用说明', '知识库规则'].map(name => `00-系统/规则/${name}.md`), 'AGENTS.md'].sort());
  assert.deepEqual(await vault.validate(), { valid: true, issues: [], notes: files.length });
  for (const folder of [...layout, ...bundledNotes]) assert.ok((await fs.stat(path.join(vault.root, ...folder.split('/')))).isDirectory(), folder);
  for (const folder of ['40-知识/人生思考', '70-作品/简历', '80-外部索引/学业文件']) await assert.rejects(fs.stat(path.join(vault.root, ...folder.split('/'))), { code: 'ENOENT' });
  assert.deepEqual((await fs.readdir(path.join(vault.root, '00-系统', 'Bases'))).sort(), ['任务记录.base', '幼苗知识.base', '收件箱.base', '活动项目.base', '草稿作品.base']);
  assert.equal((await vault.read('AGENTS.md')).readOnly, true);
  assert.equal((await vault.read('00-系统/模板/项目模板.md')).readOnly, true);
  await assert.rejects(vault.write('00-系统/Bases/收件箱.base', note('收件箱'), ''), { code: 'PATH' });
  assert.equal((await vault.initialize()).initialized, true);
  assert.deepEqual(await vault.upgrade(), { upgraded: false, added: [], updated: [], kept: [] });
  assert.deepEqual((await vault.settings()).sources, []);
});

test('模板代码块里的骨架替换占位后即是合规笔记', async t => {
  const { vault } = await fixture(t);
  let count = 0;
  for (const name of templates) {
    const { content } = await vault.read(`00-系统/模板/${name}.md`);
    for (const [, block] of content.matchAll(/```markdown\n([\s\S]*?)\n```/gu)) {
      const filled = block.replaceAll('YYYY-MM-DD HH:mm', '2026-10-14 09:30').replaceAll('YYYY-MM-DD', '2026-10-14').replaceAll('YYYY-Www', '2026-W42').replaceAll('YYYY-MM', '2026-10');
      // 属性区内的 `# author:` 是 YAML 注释，标题从属性区之后取。
      const title = /^# (.+)$/mu.exec(filled.slice(filled.indexOf('\n---\n', 3)))[1];
      assert.equal(validateNote(filled, `40-知识/${title}.md`).title, title, name);
      count++;
    }
  }
  assert.equal(count, 12);
});

test('随包骨架升级补齐缺失、更新未改动文件，员工改过的文件与笔记保持原样', async t => {
  const { vault } = await fixture(t);
  const file = name => path.join(vault.root, ...name.split('/'));
  const manifest = JSON.parse(await fs.readFile(file('.whalewing/bundle.json'), 'utf8'));
  // 模拟上一版：规则停在旧内容、首页被员工改过、一个模板和二级目录尚未随包。
  const rule = '00-系统/规则/知识库规则.md', home = '00-系统/知识库首页.md', added = '00-系统/模板/项目模板.md';
  const oldRule = note('知识库规则', '旧版规则。').replace('created: 2026-10-08', 'created: 2026-01-02');
  await fs.writeFile(file(rule), oldRule);
  const edited = (await fs.readFile(file(home), 'utf8')) + '\n员工自己补的入口。\n';
  await fs.writeFile(file(home), edited);
  await fs.rm(file(added));
  await fs.rm(file('60-时间线/周记'), { recursive: true });
  const own = '40-知识/工作方法/示例.md';
  await vault.write(own, note('示例'), '');
  const ownBefore = await fs.readFile(file(own), 'utf8');
  await fs.writeFile(file('.whalewing/bundle.json'), JSON.stringify({ schema: 1, version: 'previous', files: { ...manifest.files, [rule]: digest(oldRule) } }));
  const result = await vault.upgrade();
  assert.deepEqual(result, { upgraded: true, added: [added], updated: [rule], kept: [home] });
  const upgraded = await fs.readFile(file(rule), 'utf8');
  assert.match(upgraded, /^---\ntype: output\nstatus: published\ncreated: 2026-01-02\n/u);
  assert.match(upgraded, /## 十区职责与分类/u);
  assert.equal(await fs.readFile(file(home), 'utf8'), edited);
  assert.equal(await fs.readFile(file(own), 'utf8'), ownBefore);
  assert.ok((await fs.stat(file('60-时间线/周记'))).isDirectory());
  assert.equal(JSON.parse(await fs.readFile(file('.whalewing/bundle.json'), 'utf8')).version, manifest.version);
  assert.deepEqual(await vault.upgrade(), { upgraded: false, added: [], updated: [], kept: [] });
  // 无清单的首版库只认首版原文；不认识的内容一律保留。
  await fs.rm(file('.whalewing/bundle.json'));
  await fs.writeFile(file(rule), oldRule);
  assert.deepEqual((await vault.upgrade()).kept, [home, rule]);
  assert.equal(await fs.readFile(file(rule), 'utf8'), oldRule);
});

test('已有目录不覆盖，初始化中断留下恢复入口且可以续建', async t => {
  const { directory } = await fixture(t);
  const root = path.join(directory, 'partial');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'original.txt'), '原件');
  await assert.rejects(new Vault(root).initialize(), { code: 'ROOT_NOT_EMPTY' });
  assert.equal(await fs.readFile(path.join(root, 'original.txt'), 'utf8'), '原件');
  const resume = new Vault(path.join(directory, 'resume'));
  await fs.mkdir(path.join(resume.root, '.whalewing'), { recursive: true });
  await fs.writeFile(path.join(resume.root, '.whalewing', 'initializing.json'), JSON.stringify({ date: '2026-10-08' }));
  await resume.initialize();
  assert.equal((await resume.validate()).valid, true);
});

test('路径穿越、Windows特殊路径、链接与固定规则修改被阻断', async t => {
  const { directory, vault } = await fixture(t);
  for (const value of ['../a.md', '40-知识/../a.md', '40-知识/a.md:stream', '40-知识/CON.md', 'C:/a.md', '40-知识/a. /b.md']) assert.throws(() => relativeName(value), { code: 'PATH' });
  await assert.rejects(vault.write('00-系统/规则/知识库规则.md', note('知识库规则'), ''), { code: 'FIXED_RULE' });
  const outside = path.join(directory, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(vault.root, '40-知识', 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(vault.read('40-知识/link/a.md'), { code: 'SYMLINK' });
  await assert.rejects(vault.search(''), { code: 'SYMLINK' });
});

test('知识写入、检索、冲突保留、删除和恢复，外部原件不动', async t => {
  const { vault, directory } = await fixture(t);
  const raw = path.join(directory, '原件.csv');
  await fs.writeFile(raw, 'a,b\n1,2\n');
  const p = '40-知识/示例.md';
  const first = await vault.write(p, note('示例', `关键词；原件 ${raw}`), '');
  assert.equal(first.hash, digest((await vault.read(p)).content));
  assert.equal((await vault.search('关键词')).notes.length, 1);
  await assert.rejects(vault.write(p, note('示例', '错误覆盖'), ''), { code: 'CONFLICT' });
  await vault.remove(p, first.hash);
  assert.equal((await vault.search('关键词')).notes.length, 0);
  const restored = await vault.restore(p, '');
  assert.equal(restored.hash, first.hash);
  assert.equal(await fs.readFile(raw, 'utf8'), 'a,b\n1,2\n');
});

test('保留BOM和CRLF字节，恢复备份不丢BOM', async t => {
  const { vault } = await fixture(t);
  const p = '40-知识/字节.md';
  const content = '\uFEFF' + note('字节').replaceAll('\n', '\r\n');
  await fs.writeFile(await vault.resolve(p), content);
  const before = await vault.read(p);
  await vault.write(p, note('字节', '新内容'), before.hash);
  const edited = await vault.read(p);
  assert.ok(edited.content.startsWith('\uFEFF'));
  assert.ok(edited.content.includes('\r\n'));
  await vault.restore(p, edited.hash);
  assert.equal((await vault.read(p)).hash, digest(content));
});

test('取消、互斥写、元数据错误与文件规模都显式失败', async t => {
  const { vault } = await fixture(t);
  await assert.rejects(vault.write('40-知识/取消.md', note('取消'), '', AbortSignal.abort()), { name: 'AbortError' });
  await assert.rejects(vault.write('40-知识/日期.md', note('日期').replace('2026-10-08', '2026-02-30'), ''), { code: 'NOTE_DATE' });
  const lock = await vault.resolve('.whalewing/write.lock', true);
  await fs.writeFile(lock, 'fixture');
  await assert.rejects(vault.write('40-知识/锁.md', note('锁'), ''), { code: 'BUSY' });
  await fs.unlink(lock);
  vault.limits.maxFiles = 2;
  await assert.rejects(vault.search(''), { code: 'FILE_LIMIT' });
});

test('技能候选独立、发布发现、停用恢复及来源失效', async t => {
  const { vault, library } = await fixture(t);
  const p = '40-知识/方法.md';
  const source = await vault.write(p, note('方法'), '');
  const name = 'whalewing-user-example';
  const candidate = await library.stage({ name, content: skill(name), sourcePaths: [p], sourceHashes: { [p]: source.hash }, expectedHash: '' });
  await assert.rejects(library.read(name), { code: 'SKILL_NOT_FOUND' });
  let calls = 0;
  const discover = async record => { calls++; assert.equal(record.name, name); };
  await library.publish({ name, expectedHash: candidate.hash, activeHash: '', review }, discover);
  const current = await library.read(name);
  await library.disable({ name, expectedHash: current.hash });
  await library.restore({ name, expectedHash: current.hash }, discover);
  assert.equal(calls, 2);
  await vault.write(p, note('方法', '明确纠偏'), source.hash);
  await assert.rejects(library.verifySources(await library.read(name)), { code: 'SKILL_STALE' });
  assert.match((await library.list()).skills.find(s => s.state === 'active').issue, /SKILL_STALE/);
});

test('发布失败自动回退有效旧版，rollback选择发布前版本而非停用版', async t => {
  const { vault, library } = await fixture(t);
  const p = '40-知识/方法.md';
  await vault.write(p, note('方法'), '');
  const name = 'whalewing-user-rollback';
  const stage = async content => library.stage({ name, content, sourcePaths: [p], sourceHashes: { [p]: (await vault.read(p)).hash }, expectedHash: '' });
  const a = await stage(skill(name, '旧方法：检查来源并输出结果。'));
  await library.publish({ name, expectedHash: a.hash, activeHash: '', review }, async () => {});
  const b = await stage(skill(name, '新方法：检查来源、计算并核验结果。'));
  await assert.rejects(library.publish({ name, expectedHash: b.hash, activeHash: a.hash, review }, async () => { throw new Error('发现失败'); }), /发现失败/);
  assert.equal((await library.read(name)).hash, a.hash);
  await library.publish({ name, expectedHash: b.hash, activeHash: a.hash, review }, async () => {});
  await library.rollback({ name, expectedHash: b.hash }, async () => {});
  assert.equal((await library.read(name)).hash, a.hash);
});

test('来源与覆盖：选入前拒绝、逐页不跳跃、失败不推进、再次触发去重', async t => {
  const { directory } = await fixture(t);
  const events = Array.from({ length: 4 }, (_, seq) => ({ seq, time: `2026-10-0${seq + 1}T10:00:00Z`, type: 'user/message', data: { content: [{ type: 'text', text: 'fixture' }] } }));
  const core = new WhalewingCore(path.join(directory, 'service'), { skillsRoot: path.join(directory, 'skills'), readSession: async () => ({ session: { cwd: directory }, events, inheritedEventCount: 1 }), schedule: () => undefined }, { maxEvents: 2 });
  t.after(() => core.dispose());
  const human = { kind: 'human', agent: { session: { id: 'workbench' } } };
  const model = { ...human, kind: 'model' };
  await assert.rejects(core.execute({ action: 'initialize' }, model), { code: 'USER_ONLY' });
  await core.execute({ action: 'initialize' }, human);
  await assert.rejects(core.execute({ action: 'source_read', sessionId: 'source' }, model), { code: 'SOURCE_SCOPE' });
  await core.execute({ action: 'source_add', sessionId: 'source' }, human);
  const page = await core.execute({ action: 'source_read', sessionId: 'source' }, model);
  assert.deepEqual(page.events.map(e => e.seq), [1, 2]);
  assert.equal(page.hasMore, true);
  assert.equal((await core.execute({ action: 'coverage' }, model)).sources[0].throughSeq, 0);
  const output = await core.execute({ action: 'write', path: '40-知识/产物.md', content: note('产物'), expectedHash: '' }, model);
  const complete = { action: 'complete', receipt: page.receipt, outputs: [output], summary: '逐条核对来源、正文和链接成立' };
  await assert.rejects(core.execute({ ...complete, outputs: [{ ...output, hash: 'wrong' }] }, model), { code: 'CONFLICT' });
  assert.equal((await core.execute({ action: 'coverage' }, model)).sources[0].throughSeq, 0);
  await core.execute(complete, model);
  await assert.rejects(core.execute(complete, model), { code: 'RECEIPT' });
  const next = await core.execute({ action: 'source_read', sessionId: 'source' }, model);
  assert.deepEqual(next.events.map(e => e.seq), [3]);
  await assert.rejects(core.execute({ action: 'source_read', sessionId: 'source', afterSeq: 3 }, model), { code: 'COVERAGE_CONFLICT' });
  await core.execute({ action: 'source_remove', sessionId: 'source' }, human);
  await assert.rejects(core.execute({ ...complete, receipt: next.receipt }, model), { code: 'RECEIPT' });
});

test('新知识计划尚未首跑时旧创建和前缀删除均拒收，新自动任务owner保持正常', async t => {
  const { directory } = await fixture(t), tasks = [], calls = [];
  const schedule = {
    catalog: async () => structuredClone(tasks),
    create: async (sessionId, spec) => { calls.push('create'); const task = { id: 'native-' + tasks.length, title: spec.title, prompt: spec.prompt }; tasks.push({ ...task, sessionId, status: 'active' }); return task; },
    delete: async ({ sessionId, id }) => { calls.push('delete'); const index = tasks.findIndex(row => row.sessionId === sessionId && row.id === id); if (index < 0) return { id, deleted: false }; tasks.splice(index, 1); return { id, deleted: true }; },
  };
  const core = new WhalewingCore(path.join(directory, 'scheduled'), { skillsRoot: path.join(directory, 'skills'), readSession: async () => ({ session: {}, events: [], inheritedEventCount: 0 }), schedule: () => schedule, followup: () => calls.push('followup') });
  t.after(() => core.dispose());
  const human = { kind: 'human', agent: { session: { id: 'not-claimed' } } };
  await core.execute({ action: 'source_add', sessionId: 'source' }, human);
  const automation = new Automation({ schedule: () => schedule, projections: async id => ({ asOfSeq: 0, values: { whalewingAutomation: id === 'knowledge' ? 'knowledge' : null, whalewingWorkbench: false } }), confirmClaim: async () => {}, prepareModel: async () => {} });
  const { task } = await automation.manage({ action: 'create', sessionId: 'knowledge', purpose: 'knowledge', spec: { daily: { time: '00:15:00', time_zone: 'Asia/Shanghai' } } });
  assert.equal((await core.vault.settings()).profileCoverage, undefined);
  tasks.push({ id: 'prefix-only', sessionId: 'not-claimed', prompt: schedulePrefix, status: 'active' });
  const before = structuredClone(tasks);
  for (const action of ['schedule_create', 'schedule_delete', 'schedule_run', 'schedule_list']) {
    await assert.rejects(core.execute({ action, id: 'prefix-only', time: '00:15:00', timeZone: 'Asia/Shanghai' }, human), { code: 'SCHEDULE_RETIRED' });
  }
  assert.deepEqual(tasks, before); assert.deepEqual(calls, ['create']);
  assert.equal((await core.execute({ action: 'coverage' }, human)).sources[0].throughSeq, -1);
  assert.equal((await automation.manage({ action: 'delete', sessionId: 'knowledge', id: task.id })).deleted, true);
  assert.deepEqual(tasks.map(row => row.id), ['prefix-only']);
});
