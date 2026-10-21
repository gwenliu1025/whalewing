import path from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';

const fail = message => { throw new Error(`组成与分发拒收：${message}`); };
const names = entries => Array.isArray(entries) ? entries.map(entry => entry[0]) : Object.keys(entries);
const sameMembers = (label, expected, actual) => {
  if (new Set(actual).size !== actual.length) fail(`${label}存在重复 id`);
  const missing = expected.filter(id => !actual.includes(id)), extra = actual.filter(id => !expected.includes(id));
  if (missing.length || extra.length) fail(`${label}缺少[${missing.join(', ')}]，多出[${extra.join(', ')}]`);
};
const relativePath = value => typeof value === 'string' && value && !/[\\<>:"|?*]/.test(value) && !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..');
// npm 固定携带 package.json；其余资源必须由显式 files 覆盖。
export const published = (manifest, file) => file === 'package.json' || manifest.files.some(entry => entry === file || file.startsWith(entry + '/'));

/** 组成只来自 parts；两个显式映射只接实现，不能额外决定内置成员。 */
export function validateComposition({ parts, baseHosts, clients, manifest }) {
  const ids = [], rows = [];
  for (const part of parts) {
    if (!/^[a-z][a-z0-9-]*$/.test(part.id) || !['base', 'optional'].includes(part.kind)) fail(`非法功能定义 ${part.id}`);
    ids.push(part.id);
    if (part.kind === 'optional') {
      if (typeof part.rowId !== 'string' || !part.rowId || !part.tab?.icon) fail(`可选功能缺少原生行或图标 ${part.id}`);
      rows.push(part.rowId);
    }
    if (part.skills && (!Array.isArray(part.skills) || new Set(part.skills).size !== part.skills.length)) fail(`技能来源重复 ${part.id}`);
  }
  if (new Set(ids).size !== ids.length || new Set(rows).size !== rows.length || rows.includes('whalewing')) fail('功能 id 或原生行重复');
  sameMembers('基础 Host', parts.filter(part => part.kind === 'base').map(part => part.id), names(baseHosts));
  sameMembers('Client', ids, names(clients));
  // 根导出属于包协议；除此之外整个子树都必须是可选组成的机械投影，包括未知残余。
  const rootExports = { '.': './index.js', './client': './client.js', './package.json': './package.json', './locale/*': './locale/*' };
  const expected = { ...rootExports };
  for (const part of parts.filter(part => part.kind === 'optional')) {
    for (const [suffix, file] of [['', 'host.js'], ['/package.json', 'package.json'], ['/icon', 'icon.svg'], ['/locale/*', 'locale/*']]) expected[`./${part.id}${suffix}`] = `./features/${part.id}/${file}`;
  }
  sameMembers('package exports', Object.keys(expected), Object.keys(manifest.exports));
  for (const [key, value] of Object.entries(expected)) if (manifest.exports[key] !== value) fail(`功能导出路径不符 ${key}`);
}

/** 只检查公开分发声明和真实输入；不扫描目录来发现或注册功能。 */
export function validateDistribution({ root, manifest, parts, roles, resources = [], generated = [] }) {
  if (!Array.isArray(manifest.files) || new Set(manifest.files).size !== manifest.files.length) fail('files 缺失或重复');
  sameMembers('浏览器产物', generated.filter(file => /^client(?:\.[\w-]+)?\.js$/.test(file)), manifest.files.filter(file => /^client(?:\.[\w-]+)?\.js$/.test(file)));
  for (const entry of manifest.files) {
    if (!relativePath(entry) || /(^|\/)(node_modules|\.artifacts|\.git)(\/|$)/.test(entry) || entry === 'content' || entry === 'tests' || entry.startsWith('tests/')) fail(`非法分发路径 ${entry}`);
    if (!generated.includes(entry) && !existsSync(path.join(root, entry))) fail(`分发来源缺失 ${entry}`);
  }
  for (const file of [...resources, ...generated, ...Object.values(manifest.exports).map(file => file.slice(2).replace(/\/\*$/, ''))]) {
    if (!relativePath(file) || !published(manifest, file)) fail(`分发清单未覆盖 ${file}`);
    if (!generated.includes(file) && !existsSync(path.join(root, file))) fail(`运行资源缺失 ${file}`);
  }
  const skillNames = new Set([...parts.flatMap(part => part.skills ?? []), ...roles.flatMap(role => role.skills ?? []).filter(name => name.startsWith('whalewing-'))]);
  sameMembers('随包技能目录', [...skillNames], readdirSync(path.join(root, 'content/skills'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name));
  for (const name of skillNames) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) fail(`非法随包技能名 ${name}`);
    const file = `content/skills/${name}/SKILL.md`;
    if (!published(manifest, file) || !existsSync(path.join(root, file))) fail(`随包技能来源缺失 ${file}`);
    const text = readFileSync(path.join(root, file), 'utf8');
    if (!new RegExp(`^name: ${name}$`, 'm').test(text)) fail(`随包技能名称不符 ${name}`);
  }
  // 主项目测试不进入 runtime；示例自己的测试属于公开开发材料，允许随完整示例分发。
  for (const entry of manifest.files.filter(entry => entry.startsWith('examples/'))) {
    const example = JSON.parse(readFileSync(path.join(root, entry, 'package.json'), 'utf8'));
    if (!example.scripts?.test) fail(`示例没有独立测试入口 ${entry}`);
    if (!manifest.scripts.test.includes(`npm --prefix ${entry} test`)) fail(`主回归没有串行接入示例 ${entry}`);
  }
}

/** 重分块不是新的成员注册表：所属功能与实际浏览器消费者都须仍在同一次构建中。 */
export function validateChunks({ parts, chunks, metafile }) {
  const owners = [], artifacts = [];
  for (const chunk of chunks) {
    if (!parts.some(part => part.id === chunk.feature && part.kind === 'optional')) fail(`重分块所属功能已退出 ${chunk.feature}`);
    if (!Object.hasOwn(metafile.inputs, `features/${chunk.feature}/client.js`)) fail(`重分块缺少真实浏览器消费者 ${chunk.feature}`);
    owners.push(chunk.feature); artifacts.push(...Object.keys(chunk.artifacts));
  }
  if (new Set(owners).size !== owners.length || new Set(artifacts).size !== artifacts.length) fail('重分块实现或产物重复');
}

/** esbuild 的实际输入证明源码闭包；只把本包直接 import 的外部包与运行声明比较。 */
export function validateSourceClosure({ root, manifest, metafile, resources = [], generated = [] }) {
  const inputs = [];
  const declared = { ...manifest.dependencies, ...manifest.peerDependencies };
  for (const [source, input] of Object.entries(metafile.inputs)) {
    const absolute = path.resolve(root, source), relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (!relativePath(relative) || relative.startsWith('node_modules/')) continue;
    if (!published(manifest, relative)) fail(`实际源码未分发 ${relative}`);
    inputs.push(relative);
    for (const imported of input.imports) {
      const value = imported.original ?? (imported.external ? imported.path : '');
      if (!value || value.startsWith('.') || path.isAbsolute(value) || isBuiltin(value)) continue;
      const name = value.startsWith('@') ? value.split('/').slice(0, 2).join('/') : value.split('/')[0];
      if (!declared[name]) fail(`实际运行依赖未声明 ${name}（${relative}）`);
    }
  }
  for (const resource of resources) {
    if (!published(manifest, resource) || !existsSync(path.join(root, resource)) && !generated.includes(resource)) fail(`实际资源未分发 ${resource}`);
  }
  return inputs;
}
