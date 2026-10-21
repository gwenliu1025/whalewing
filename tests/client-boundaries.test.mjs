import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { parts } from '../features/index.js';
import { fixture } from './client-fixture.mjs';

const frame = (revision, omitted = []) => ({ revision, features: parts.filter(part => !omitted.includes(part.id)).map(part => ({ id: part.id, instance: parts.indexOf(part) + 1, kind: part.kind, api: 1, package: 'dsh-whalewing', skills: [] })) });

test('真实组合按领域提供实例，外壳不再导出万能API或领域视图', async () => {
  const f = await fixture();
  const core = f.ctx.whalewingWorkbench.internal;
  assert.equal(core.api, undefined);
  assert.equal(f.api, undefined);
  assert.deepEqual(Object.keys(core.clients).sort(), ['ai-web', 'assistant', 'automation', 'cards', 'experts', 'knowledge', 'model-world', 'skills']);
  assert.equal(core.clients.knowledge.knowledge, f.clients.knowledge.knowledge);
  assert.equal(core.clients.assistant.experts, core.clients.experts.experts);
  assert.equal(core.clients.assistant.subscribeExperts, core.clients.experts.subscribeExperts);
  assert.equal(core.clients.knowledge.assistantContext, core.clients.assistant.assistantContext);
  assert.equal(core.clients.cards.openAutomation, core.clients.automation.openAutomation);
  for (const method of ['knowledge', 'newsRequest', 'worldRequest', 'createAutomation', 'expertRequest']) assert.equal(core.bridge[method], undefined);
  for (const name of ['GraphCanvas', 'AiWebView', 'loadToolbox', 'loadModelWorld', 'WorkspacePicker', 'makeExpertContract']) assert.equal(core.kit[name], undefined);
  f.unmount();
});

test('资讯适配器纯校验失败发生在会话身份与创建副作用之前', async () => {
  const f = await fixture();
  let validated = 0, submitted = 0;
  const release = f.clients.automation.bindNewsAdapter({
    validate(input) { validated++; assert.equal(input.sessionId, 'validation'); throw new Error('输入拒收'); },
    submit() { submitted++; },
  });
  await assert.rejects(f.clients.automation.createAutomation({ purpose: 'news' }, false), /输入拒收/);
  assert.equal(validated, 1); assert.equal(submitted, 0);
  assert.equal(f.clients.automation.pendingAutomation(), null);
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 0);
  release(); f.unmount();
});

test('Cards退出撤销资讯提交，未知创建保留原身份且重新启用仍恢复同一任务', async () => {
  const submissions = [];
  const f = await fixture({ automation: async input => {
    if (input.action === 'catalog') return { ok: true, value: { available: true, tasks: [], legacyTasks: [], issues: [] } };
    assert.equal(input.action, 'create'); submissions.push(input.sessionId); throw new Error('提交回执中断');
  } });
  await assert.rejects(f.clients.automation.createAutomation({ purpose: 'news' }, false), /提交回执中断/);
  const identity = f.clients.automation.pendingAutomation();
  assert.equal(identity.purpose, 'news'); assert.equal(submissions.length, 1);
  await f.featureUpdate(frame(1, ['cards']));
  await assert.rejects(f.clients.automation.createAutomation({ purpose: 'news' }, true), { code: 'FEATURE_DISABLED' });
  assert.deepEqual(f.clients.automation.pendingAutomation(), identity);
  assert.equal(submissions.length, 1); assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
  await f.featureUpdate(frame(2));
  await assert.rejects(f.clients.automation.createAutomation({ purpose: 'news' }, true), /提交回执中断/);
  assert.deepEqual(submissions, [identity.sessionId, identity.sessionId]);
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
  assert.deepEqual(f.clients.automation.pendingAutomation(), identity);
  f.unmount();
});

test('AI网页纯协议的Node依赖闭包不包含目录、图像或浏览器视图', () => {
  const entry = fileURLToPath(new URL('../features/ai-web/contract.js', import.meta.url));
  const result = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', metafile: true });
  assert.equal(Object.keys(result.metafile.inputs).length, 1);
  assert.ok(Object.keys(result.metafile.inputs)[0].replaceAll('\\', '/').endsWith('features/ai-web/contract.js'));
});

test('浏览器支持focus也不推迟专家准备，不靠模拟发送事件取得首次身份', async () => {
  let focusReads = 0;
  const f = await fixture({ sidebarRight: { get focusPresentation() { focusReads++; return () => () => {}; } } });
  const selections = [];
  const selectModel = f.ctx.remote.session.selectModel;
  f.ctx.remote.session.selectModel = input => { selections.push(input); return selectModel(input); };
  await f.clients.experts.selectExpert(undefined, 'development');
  f.existing.set('main', false);
  f.ctx.sessions.list.set({ byId: { main: { id: 'main', blank: true, retainedBy: { mainView: 1 } } } });
  await new Promise(setImmediate);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'expert').map(([, id, input]) => [id, input]), [['main', { expertId: 'development' }]]);
  assert.equal(f.calls.some(([kind]) => kind === 'prompt'), false);
  assert.equal(f.clients.experts.choices().sessions.main, undefined);
  assert.equal(focusReads, 0, '专家流程不读取浏览器能力');
  assert.equal(selections.length, 1); assert.equal(selections[0].saveAsDefault, false);
  f.ctx.sessions.list.set({ byId: { main: { id: 'main', blank: true, retainedBy: { mainView: 1 } } } });
  await new Promise(setImmediate);
  assert.equal(f.calls.filter(([kind]) => kind === 'expert').length, 1, '同一捕获不重复提交');
  assert.equal(f.clients['ai-web'].supportsInlinePresentation(), true);
  assert.equal(focusReads, 1, '只有AI网页明确探测呈现能力');
  f.unmount();
});
