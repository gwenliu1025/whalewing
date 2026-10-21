import { parts } from '../features/index.js';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import yaml from 'js-yaml';
import { buildSync } from 'esbuild';
import { roles } from '../content/roles.js';
import { loadExpertAvatars, expertAvatarIds, presetAvatarIds } from '../src/expert-avatars.js';
import { baseHosts } from '../index.js';
import { clients } from '../src/shell/features.js';
import { validateComposition, validateDistribution, validateSourceClosure, validateChunks } from './assembly.mjs';
import { buildToolbox } from '../features/toolbox/build.mjs';
import { buildModelWorld } from '../features/model-world/build.mjs';

const PACKAGE = 'dsh-whalewing';
const ROOT = new URL('../', import.meta.url);
// 本插件不贡献原生模式；专家身份、工具与工作台作为独立 Host 能力装配。
export const patchSchema = yaml.JSON_SCHEMA;

export function createPatch() {
  const manifest = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'));
  validateComposition({ parts, baseHosts, clients, manifest });

  const ids = new Set();
  for (const role of roles) {
    if (!/^[a-z][a-z0-9-]*$/.test(role.id) || ids.has(role.id) || !role.name || !role.prompt) throw new Error(`角色定义无效或重复: ${role.id}`);
    ids.add(role.id);
  }
  return [{ insert: [
    { id: 'whalewing', name: PACKAGE },
    ...parts.filter(part => part.kind === 'optional').map(part => ({ id: part.rowId, name: `${PACKAGE}/${part.id}` })),
  ] }];
}

/** 生成物都可从正式源码重建，不读取用户 profile、目录或会话。 */
export function renderArtifacts() {
  const root = fileURLToPath(ROOT);
  const manifest = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'));
  const patch = '# 生成来源：scripts/build.mjs 与 content/roles.js；请修改真源后重新生成。\n'
    + '# Schedule 由 DSH 提供；本包不插入或覆盖 schedule/time-context/ui-schedule。\n'
    + yaml.dump(createPatch(), { schema: patchSchema, noRefs: true, lineWidth: -1, quotingType: "'", forceQuotes: false });
  // 公共校验与文件引用语法内联，避免猜测浏览器模块表或复制路径语法。
  const validator = buildSync({
    stdin: { contents: 'export { z } from "zod"; export { formatFileMention } from "@deepseek-ai/dsh-file-reference/grammar";', resolveDir: fileURLToPath(ROOT) },
    bundle: true, platform: 'browser', format: 'iife', globalName: 'validator',
    // 转义依赖中的多行模板字符串，保留运行时值且避免生成代码出现行尾空白。
    supported: { 'template-literal': false },
    target: 'es2022', minify: true, write: false,
  }).outputFiles[0].text;
  const license = readFileSync(new URL('./LICENSE', import.meta.resolve('zod/package.json')), 'utf8').replace(/\r\n/g, '\n').trim();
  // 许可取自提供语法的 DSH 包本身，不依赖插件所在工作区。
  const grammarLicense = readFileSync(new URL('./LICENSE', import.meta.resolve('@deepseek-ai/dsh-file-reference/package.json')), 'utf8').replace(/\r\n/g, '\n').trim();
  // 主构建只静态组合；每个重功能持有自己的源码、资源和许可闭包。
  const toolbox = buildToolbox(), modelWorld = buildModelWorld();
  const graphLicenses = ['d3-force', 'd3-quadtree', 'd3-dispatch', 'd3-timer'].map(name => {
    const entry = name === 'd3-force' ? import.meta.resolve(name) : pathToFileURL(createRequire(import.meta.resolve('d3-force')).resolve(name));
    const license = readFileSync(new URL('../LICENSE', entry), 'utf8').replace(/\r\n/g, '\n').trim();
    return `/*! 内联 ${name} 许可\n${license}\n*/\n`;
  }).join('');
  // 工作台入口保留真实模块闭包，后续拆分可以正常 import，不再序列化函数源码。
  const shell = buildSync({
    absWorkingDir: root, entryPoints: ['src/shell/index.js'],
    bundle: true, platform: 'browser', format: 'iife', globalName: 'shell',
    external: ['react', '@deepseek-ai/cordis'],
    target: 'es2022', minify: true, write: false, metafile: true, logOverride: { 'duplicate-object-key': 'error' },
  });
  validateChunks({ parts, chunks: [toolbox, modelWorld], metafile: shell.metafile });
  // Host 仅分析实际静态依赖，不在构建时启动服务；重复接线也以构建错误拒收。
  const host = buildSync({
    absWorkingDir: root, entryPoints: ['index.js', ...parts.filter(part => part.kind === 'optional').map(part => `features/${part.id}/host.js`)], outdir: 'host-analysis',
    bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, metafile: true, logOverride: { 'duplicate-object-key': 'error' },
  });
  const client = '// 生成来源：src/shell/index.js、视图、契约及随包资源；请修改真源后重新生成。\n'
    + `/*! 内联 Zod 许可\n${license}\n*/\n`
    + `/*! 内联 DSH 文件引用语法许可\n${grammarLicense}\n*/\n`
    + graphLicenses
    + `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(PACKAGE)},\n  factory: (require) => {\n${validator}\n${shell.outputFiles[0].text}\nreturn shell.createShell(require, validator, ${JSON.stringify(loadExpertAvatars())});\n  }\n});\n`;
  // 图形只由功能清单持有；原生img不继承页签文字色，统一中间亮度保证亮暗底都可辨。
  const icons = Object.fromEntries(parts.filter(part => part.kind === 'optional').map(part => [`features/${part.id}/icon.svg`, part.tab.icon.replace("stroke='black'", "stroke='#718096'") + '\n']));
  // 宿主只观察入口时间戳；所有资源完成后最后写入口，不承诺多文件原子发布。
  const artifacts = { 'cordis.patch.yml': patch, ...icons, ...toolbox.artifacts, ...modelWorld.artifacts, 'client.js': client };
  const resources = [
    'src', 'features', 'locale', 'content/roles.js', 'content/skills', 'content/vault', 'content/learning',
    'README.md', 'COMPATIBILITY.md', 'EXTENDING.md', 'MAINTAINING.md', 'examples/feature-starter', 'examples/stateful-feature', 'LICENSE', 'NOTICE', manifest.icon.replace(/^\.\//, ''),
    ...[...expertAvatarIds, ...presetAvatarIds].map(id => `content/avatars/${id}.webp`), ...toolbox.resources, ...modelWorld.resources,
  ];
  validateDistribution({ root, manifest, parts, roles, resources, generated: Object.keys(artifacts) });
  for (const metafile of [host.metafile, shell.metafile, ...toolbox.metafiles, ...modelWorld.metafiles]) validateSourceClosure({ root, manifest, metafile });
  return artifacts;
}

export async function build() {
  const artifacts = renderArtifacts();
  for (const [name, source] of Object.entries(artifacts)) await writeFile(new URL(name, ROOT), source, 'utf8');
  return Object.keys(artifacts);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const written = await build();
  process.stdout.write(`已生成 ${written.join('、')}，目录 ${fileURLToPath(ROOT)}\n`);
}
