import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import yaml from 'js-yaml';
import { createPatch, renderArtifacts, patchSchema } from '../scripts/build.mjs';
import { roles } from '../content/roles.js';
import { dailyLearning } from '../src/learning-cards.js';
import { aiWebEntries } from '../src/utilities/ai-web.js';

test('构建确定且磁盘生成物与当前客户端及共享契约一致', async () => {
  const artifacts = renderArtifacts();
  assert.deepEqual(artifacts, renderArtifacts());
  for (const [name, text] of Object.entries(artifacts)) {
    const disk = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
    assert.equal(disk, text, `${name} 需要重新生成`);
    assert.ok(!text.includes('\r') && !text.includes('\uFFFD') && !text.startsWith('\uFEFF'));
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
  }
});

test('专家与原生模式正交，只贡献三个Host入口', () => {
  const rows = createPatch()[0].insert;
  assert.deepEqual(rows, [
    { id: 'whalewing', name: 'dsh-whalewing' },
    { id: 'whalewing-tools', name: 'dsh-whalewing/tools' },
    { id: 'whalewing-experts', name: 'dsh-whalewing/experts' },
  ]);
  assert.equal(roles.length, 7);
  const text = JSON.stringify(createPatch());
  for (const forbidden of ['preset-whalewing', 'dsh-agent-preset', 'persona', 'dsh-tool-fs', 'dsh-tool-pwsh', 'dsh-tool-subagent']) assert.ok(!text.includes(forbidden));
});

test('不覆盖宿主mode、模型路由或重复插入schedule与子代理服务', () => {
  const text = JSON.stringify(createPatch());
  for (const forbidden of ['agent-preset-registry', 'preset-standard', 'dsh-schedule', 'dsh-time-context', 'dsh-client-ui-schedule', 'dsh-subagent-spawn-in-process', 'dsh-subagent-fork-in-process', 'apiKey', 'baseURL', 'agentOptions']) assert.ok(!text.includes(forbidden));
});

test('Loader补丁可往返，不携带旧preset平台表达式', () => {
  const artifact = renderArtifacts()['cordis.patch.yml'];
  assert.ok(!artifact.includes('!!js'));
  assert.deepEqual(yaml.load(artifact, { schema: patchSchema }), createPatch());
});

test('生成Client只注册延迟工厂，模块加载阶段不访问DOM或创建会话', () => {
  const registrations = [];
  vm.runInNewContext(renderArtifacts()['client.js'], { window: { __ModuleLoader__: { load: (entry) => registrations.push(entry) } } });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].id, 'dsh-whalewing');
  const requests = [];
  const plugin = registrations[0].factory((name) => { requests.push(name); return {}; });
  assert.deepEqual(requests, ['react']);
  assert.equal(typeof plugin.apply, 'function');
  assert.ok(plugin.inject.includes('remote.commands') && plugin.inject.includes('remote.session'));
});

test('真实生成图谱闭包自带D3与全部许可，可独立推进且不修改有向响应', () => {
  const source = renderArtifacts()['client.js'];
  for (const name of ['d3-force', 'd3-quadtree', 'd3-dispatch', 'd3-timer']) assert.ok(source.includes(`内联 ${name} 许可`));
  assert.ok(!source.includes('createGraphCanvas.toString'));
  let entry;
  // 只截取工厂的最终返回值，运行的仍是生产构建内联的完整闭包而非另一份测试算法。
  const probe = source.replace(/\nreturn \(/, '\nreturn graphRenderer;\nvoid (');
  assert.notEqual(probe, source);
  vm.runInNewContext(probe, { window: { __ModuleLoader__: { load: value => { entry = value; } } }, performance, setTimeout, clearTimeout, setInterval, clearInterval });
  const graphRenderer = entry.factory(() => { throw new Error('图谱依赖不应查宿主模块表'); });
  const graph = { nodes: [{ path: 'a', degree: 1 }, { path: 'b', degree: 1 }], edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }] };
  const before = structuredClone(graph), layout = graphRenderer.createGraphLayout(graph);
  layout.simulation.tick(300); layout.simulation.stop();
  assert.equal(layout.edges.length, 1);
  assert.ok(layout.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.deepEqual(graph, before);
  assert.equal(typeof graphRenderer.createGraphCanvas({}), 'function');
});

test('生成物不包含机器安装路径或任何用户知识正文', () => {
  const output = Object.values(renderArtifacts()).join('\n');
  for (const fragment of ['E:\\gwenliu', 'C:\\Users\\', 'D:\\Programs\\', 'second-brain', '.artifacts\\whalewing']) assert.ok(!output.includes(fragment));
  assert.ok(!output.includes('LICENSE_BLOB') && !output.includes('ENCRYPT_KEY'));
  assert.match(output, /Copyright \(c\) 2025 Colin McDonnell/);
});

test('真实生成Client自带校验器，Remote就绪后才挂接UI且按反序释放', async () => {
  let entry;
  vm.runInNewContext(renderArtifacts()['client.js'], { URL, window: { __ModuleLoader__: { load: value => { entry = value; } } } });
  const plugin = entry.factory(name => { assert.equal(name, 'react'); return {}; });
  const order = [];
  const dispose = await plugin.apply({
    remote: { async $mount(contribution) {
      const descriptor = contribution.descriptors[0];
      const services = { manageSkills: 'whalewingSkills', manageAutomation: 'whalewingAutomation', manageNews: 'whalewingNews', manageModelWorld: 'whalewingWorld', manageAiWeb: 'whalewingAiWeb' };
      const service = services[descriptor.method] ?? descriptor.namespace;
      if (Object.values(services).includes(service)) assert.equal(descriptor.namespace, 'whalewingKnowledge');
      const codec = contribution.descriptors[0].parameters[0].codec.create();
      const action = { whalewingKnowledge: 'status', whalewingAutomation: 'catalog', whalewingWorld: 'status' }[service] ?? 'list';
      assert.ok(['whalewingKnowledge', 'whalewingExperts', ...Object.values(services)].includes(service));
      assert.equal(codec.safeParse({ action }).success, true);
      assert.equal(codec.safeParse({ action, caller: 'human' }).success, false);
      const result = descriptor.result.create();
      if (service === 'whalewingAiWeb') {
        const save = { action: 'save', id: 'custom-01234567-89ab-4cde-8123-456789abcdef', expectedRevision: 0, entry: { name: '测试入口', url: 'https://example.org/', description: '', avatar: null } };
        assert.equal(codec.safeParse(save).success, true);
        assert.equal(codec.safeParse({ ...save, entry: { ...save.entry, url: 'javascript:alert(1)' } }).success, false);
        assert.equal(codec.safeParse({ action: 'status' }).success, false);
        assert.equal(result.safeParse({ entries: aiWebEntries }).success, true);
        assert.equal(result.safeParse({ entries: aiWebEntries.map(item => ({ ...item, caller: 'human' })) }).success, false);
      }
      if (service === 'whalewingAutomation') {
        const create = { action: 'create', sessionId: 'fixture-task', purpose: 'knowledge', spec: { daily: { time: '09:00:00', time_zone: 'Asia/Shanghai' } }, workspaceScope: { mode: 'all', excludedWorkspaceIds: ['excluded-workspace'] } };
        assert.equal(codec.safeParse(create).success, true);
        assert.equal(codec.safeParse({ ...create, workspaceScope: { mode: 'selected', workspaceIds: ['chosen-workspace'] } }).success, true);
        assert.equal(codec.safeParse({ ...create, workspaceScope: { mode: 'selected', workspaceIds: [] } }).success, false);
        assert.equal(codec.safeParse({ ...create, workspaceScope: { mode: 'all', excludedWorkspaceIds: ['duplicate', 'duplicate'] } }).success, false);
      }
      if (service === 'whalewingNews') {
        // 真实正文 owner 生成完整卡片，确保浏览器内联校验器与服务端字段保持一致。
        const home = { reports: [], learning: dailyLearning(Date.parse('2026-10-12T00:00:00Z')) };
        assert.equal(result.safeParse(home).success, true);
        for (const field of ['article', 'sections', 'recommendation', 'source']) {
          const incomplete = structuredClone(home); delete incomplete.learning.cards[0][field];
          assert.equal(result.safeParse(incomplete).success, false, `缺少 ${field} 的卡片必须拒收`);
        }
        const incomplete = structuredClone(home); delete incomplete.learning.context;
        assert.equal(result.safeParse(incomplete).success, false);
      }
      order.push(`mount:${service}`);
      return async () => { order.push(`unmount:${service}`); };
    } },
    inject(keys) {
      assert.deepEqual([...keys], ['remote.whalewingKnowledge', 'remote.whalewingExperts']);
      assert.deepEqual(order, ['mount:whalewingKnowledge', 'mount:whalewingExperts', 'mount:whalewingSkills', 'mount:whalewingAutomation', 'mount:whalewingNews', 'mount:whalewingWorld', 'mount:whalewingAiWeb']);
      order.push('ui');
      return { dispose: async () => { order.push('dispose-ui'); } };
    },
  });
  await dispose();
  assert.deepEqual(order, ['mount:whalewingKnowledge', 'mount:whalewingExperts', 'mount:whalewingSkills', 'mount:whalewingAutomation', 'mount:whalewingNews', 'mount:whalewingWorld', 'mount:whalewingAiWeb', 'ui', 'dispose-ui', 'unmount:whalewingAiWeb', 'unmount:whalewingWorld', 'unmount:whalewingNews', 'unmount:whalewingAutomation', 'unmount:whalewingSkills', 'unmount:whalewingExperts', 'unmount:whalewingKnowledge']);
});

test('专家Remote挂载失败释放已挂知识Remote，不挂半套工作台', async () => {
  let entry;
  vm.runInNewContext(renderArtifacts()['client.js'], { window: { __ModuleLoader__: { load: value => { entry = value; } } } });
  const plugin = entry.factory(() => ({}));
  const order = [];
  await assert.rejects(plugin.apply({
    remote: { async $mount(contribution) {
      const descriptor = contribution.descriptors[0];
      const service = descriptor.method === 'manageSkills' ? 'whalewingSkills' : descriptor.namespace;
      if (service === 'whalewingSkills') assert.equal(descriptor.namespace, 'whalewingKnowledge');
      if (service === 'whalewingExperts') throw new Error('专家契约加载失败');
      order.push(service);
      return async () => order.push('released');
    } },
    inject() { assert.fail('Remote不完整时不创建UI'); },
  }), /专家契约加载失败/);
  assert.deepEqual(order, ['whalewingKnowledge', 'released']);
});

test('AI网页Remote挂载失败释放全部已挂契约，不创建半套工作台', async () => {
  let entry;
  vm.runInNewContext(renderArtifacts()['client.js'], { window: { __ModuleLoader__: { load: value => { entry = value; } } } });
  const plugin = entry.factory(() => ({})), order = [];
  await assert.rejects(plugin.apply({
    remote: { async $mount(contribution) {
      const { method, namespace } = contribution.descriptors[0];
      if (method === 'manageAiWeb') throw new Error('AI网页契约加载失败');
      const service = method === 'manage' ? namespace : method;
      order.push(`mount:${service}`);
      return async () => order.push(`unmount:${service}`);
    } },
    inject() { assert.fail('AI网页Remote不完整时不创建UI'); },
  }), /AI网页契约加载失败/);
  assert.deepEqual(order, ['mount:whalewingKnowledge', 'mount:whalewingExperts', 'mount:manageSkills', 'mount:manageAutomation', 'mount:manageNews', 'mount:manageModelWorld', 'unmount:manageModelWorld', 'unmount:manageNews', 'unmount:manageAutomation', 'unmount:manageSkills', 'unmount:whalewingExperts', 'unmount:whalewingKnowledge']);
});

test('分发清单只包含运行内容，不将含隐私检测样例的测试封装进去', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.files, ['index.js', 'tools.js', 'experts.js', 'client.js', 'src', 'content/roles.js', 'content/skills', 'content/learning', 'content/model-world', 'content/avatars', 'content/utilities', 'content/vault', 'cordis.patch.yml', 'README.md', 'LICENSE', 'NOTICE', 'art/brand']);
  assert.ok(!manifest.files.some(item => item === 'content' || item.includes('test')));
});

test('技能 Remote 挂载失败逆序释放知识与专家，不创建半套工作台', async () => {
  let entry;
  vm.runInNewContext(renderArtifacts()['client.js'], { window: { __ModuleLoader__: { load: value => { entry = value; } } } });
  const plugin = entry.factory(() => ({}));
  const order = [];
  await assert.rejects(plugin.apply({
    remote: { async $mount(contribution) {
      const descriptor = contribution.descriptors[0];
      const service = descriptor.method === 'manageSkills' ? 'whalewingSkills' : descriptor.namespace;
      if (service === 'whalewingSkills') assert.equal(descriptor.namespace, 'whalewingKnowledge');
      if (service === 'whalewingSkills') throw new Error('技能契约加载失败');
      order.push(service);
      return async () => order.push(`released:${service}`);
    } },
    inject() { assert.fail('Remote 不完整时不创建 UI'); },
  }), /技能契约加载失败/);
  assert.deepEqual(order, ['whalewingKnowledge', 'whalewingExperts', 'released:whalewingExperts', 'released:whalewingKnowledge']);
});
