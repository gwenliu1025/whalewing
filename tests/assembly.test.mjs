import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { parts } from '../features/index.js';
import { baseHosts } from '../index.js';
import { clients } from '../src/shell/features.js';
import { validateComposition, validateDistribution, validateSourceClosure, validateChunks } from '../scripts/assembly.mjs';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const composition = () => ({ parts: structuredClone(parts), baseHosts: Object.entries(baseHosts), clients: Object.entries(clients), manifest: structuredClone(manifest) });

test('组成单独持成员：真实Host、Client和原生可选exports双向一致', () => {
  assert.doesNotThrow(() => validateComposition(composition()));
});

for (const [label, mutate, reason] of [
  ['重复功能', data => data.parts.push(data.parts[0]), /id.*重复/],
  ['重复原生行', data => { const rows = data.parts.filter(part => part.kind === 'optional'); rows[1].rowId = rows[0].rowId; }, /行重复/],
  ['核心行冲突', data => { data.parts.find(part => part.kind === 'optional').rowId = 'whalewing'; }, /行重复/],
  ['Host漏接', data => data.baseHosts.pop(), /基础 Host缺少/],
  ['Host多接', data => data.baseHosts.push(['ghost', {}]), /基础 Host.*ghost/],
  ['Host重复', data => data.baseHosts.push(data.baseHosts[0]), /基础 Host存在重复/],
  ['Client漏接', data => data.clients.pop(), /Client缺少/],
  ['Client多接', data => data.clients.push(['ghost', {}]), /Client.*ghost/],
  ['Client重复', data => data.clients.push(data.clients[0]), /Client存在重复/],
  ['导出缺项', data => delete data.manifest.exports[`./${data.parts.find(part => part.kind === 'optional').id}/icon`], /package exports缺少/],
  ['导出路径错误', data => { data.manifest.exports[`./${data.parts.find(part => part.kind === 'optional').id}`] = './features/wrong/host.js'; }, /导出路径不符/],
  ['幽灵功能导出', data => { data.manifest.exports['./retired'] = './features/retired/host.js'; }, /package exports.*retired/],
  ['合法功能的额外子树', data => { data.manifest.exports[`./${data.parts[0].id}/private`] = './src/service.js'; }, /package exports.*private/],
  ['清单删除后遗留全部导出', data => { const retired = data.parts.find(part => part.kind === 'optional'); data.parts = data.parts.filter(part => part !== retired); data.clients = data.clients.filter(([id]) => id !== retired.id); }, /package exports.*多出/],
]) test(`组成拒收：${label}`, () => {
  const data = composition(); mutate(data); assert.throws(() => validateComposition(data), reason);
});

/** 独立临时文件只模拟公开分发树；不加载服务、不接触正式 profile 或构建生成物。 */
async function distribution(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whalewing-assembly-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (file, text = '') => { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); };
  await put('src/consumer.js', '');
  await put('package.json', '{}');
  await put('content/skills/whalewing-check/SKILL.md', '---\nname: whalewing-check\n---\n检查');
  await put('examples/feature-starter/package.json', JSON.stringify({ scripts: { test: 'node --test tests/*.test.mjs' } }));
  await put('LICENSE', '许可');
  const data = { root, parts: [], roles: [{ skills: ['whalewing-check'] }], resources: ['LICENSE'], generated: ['client.js'], manifest: {
    files: ['src', 'content/skills', 'examples/feature-starter', 'LICENSE', 'client.js'], exports: { '.': './src/consumer.js', './client': './client.js', './package.json': './package.json' },
    scripts: { test: 'node --test tests/*.test.mjs && npm --prefix examples/feature-starter test' },
  } };
  return { data, put };
}

test('分发校验允许尚待生成的入口、npm包说明和示例独立测试', async t => {
  const { data } = await distribution(t);
  assert.doesNotThrow(() => validateDistribution(data));
});

test('分发校验拒绝未携带资源、缺失原件、主测试/本地依赖和多余技能来源', async t => {
  const { data, put } = await distribution(t);
  const check = (mutate, reason) => { const changed = structuredClone(data); mutate(changed); assert.throws(() => validateDistribution(changed), reason); };
  check(value => { value.manifest.files = value.manifest.files.filter(file => file !== 'LICENSE'); }, /未覆盖 LICENSE/);
  check(value => value.manifest.files.push('missing'), /来源缺失 missing/);
  check(value => value.manifest.files.push('tests'), /非法分发路径 tests/);
  check(value => value.manifest.files.push('content'), /非法分发路径 content/);
  check(value => value.manifest.files.push('node_modules'), /非法分发路径 node_modules/);
  check(value => value.manifest.files.push('C:/private'), /非法分发路径/);
  check(value => value.manifest.files.push('client.retired.js'), /浏览器产物.*retired/);
  check(value => { value.manifest.scripts.test = 'node --test tests/*.test.mjs'; }, /没有串行接入示例/);
  await put('content/skills/retired/SKILL.md', '---\nname: retired\n---');
  assert.throws(() => validateDistribution(data), /随包技能目录.*retired/);
});

test('重分块拒绝退休功能残余、没有真实浏览器消费者和重复产物', () => {
  const part = parts.find(part => part.kind === 'optional');
  const chunk = { feature: part.id, artifacts: { 'client.probe.js': '' } }, metafile = { inputs: { [`features/${part.id}/client.js`]: {} } };
  assert.doesNotThrow(() => validateChunks({ parts, chunks: [chunk], metafile }));
  assert.throws(() => validateChunks({ parts: [], chunks: [chunk], metafile }), /所属功能已退出/);
  assert.throws(() => validateChunks({ parts, chunks: [chunk], metafile: { inputs: {} } }), /缺少真实浏览器消费者/);
  assert.throws(() => validateChunks({ parts, chunks: [chunk, chunk], metafile }), /产物重复/);
});

test('分发校验拒绝技能名称错位和未接独立测试的示例', async t => {
  const { data, put } = await distribution(t);
  await put('examples/feature-starter/package.json', JSON.stringify({ scripts: {} }));
  assert.throws(() => validateDistribution(data), /没有独立测试入口/);
  await put('content/skills/whalewing-check/SKILL.md', '---\nname: different\n---');
  assert.throws(() => validateDistribution(data), /技能名称不符/);
});

test('实际metafile只消费运行声明，未分发源码及漏声明依赖均拒收', async t => {
  const { data } = await distribution(t);
  const metafile = { inputs: { 'src/consumer.js': { imports: [{ path: 'node:fs', external: true }, { path: '@sample/tool/api', external: true }] } } };
  assert.throws(() => validateSourceClosure({ ...data, metafile }), /运行依赖未声明 @sample\/tool/);
  data.manifest.peerDependencies = { '@sample/tool': '1.0.0' };
  assert.deepEqual(validateSourceClosure({ ...data, metafile }), ['src/consumer.js']);
  data.manifest.files = data.manifest.files.filter(file => file !== 'src');
  assert.throws(() => validateSourceClosure({ ...data, metafile }), /实际源码未分发/);
});
