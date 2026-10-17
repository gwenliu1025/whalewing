import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import yaml from 'js-yaml';
import { buildSync } from 'esbuild';
import { roles } from '../content/roles.js';
import { createClient } from '../src/client.js';
import { knowledgeContract } from '../src/knowledge-contract.js';
import { expertContract } from '../src/expert-contract.js';
import { skillLibraryContract } from '../src/skill-library-contract.js';
import { utilityLicenseComment } from './utility-licenses.mjs';
import { loadModelWorldPortraits } from '../src/model-world-portraits.js';
import { loadExpertAvatars } from '../src/expert-avatars.js';

const PACKAGE = 'dsh-whalewing';
const ROOT = new URL('../', import.meta.url);
// 本插件不贡献原生模式；专家身份、工具与工作台作为独立 Host 能力装配。
export const patchSchema = yaml.JSON_SCHEMA;

export function createPatch() {
  const ids = new Set();
  for (const role of roles) {
    if (!/^[a-z][a-z0-9-]*$/.test(role.id) || ids.has(role.id) || !role.name || !role.prompt) throw new Error(`角色定义无效或重复: ${role.id}`);
    ids.add(role.id);
  }
  return [{ insert: [
    { id: 'whalewing', name: PACKAGE },
    { id: 'whalewing-tools', name: `${PACKAGE}/tools` },
    { id: 'whalewing-experts', name: `${PACKAGE}/experts` },
  ] }];
}

/** 两个生成物都可从正式源码重建，不读取用户 profile、目录或会话。 */
export function renderArtifacts() {
  const patch = '# 生成来源：scripts/build.mjs 与 content/roles.js；请修改真源后重新生成。\n'
    + '# Schedule 由官方可选插件持有；本包不插入或覆盖 schedule/time-context/ui-schedule。\n'
    + yaml.dump(createPatch(), { schema: patchSchema, noRefs: true, lineWidth: -1, quotingType: "'", forceQuotes: false });
  // 公共校验与文件引用语法内联，避免猜测浏览器模块表或复制路径语法。
  const validator = buildSync({
    stdin: { contents: 'export { z } from "zod"; export { formatFileMention } from "@deepseek-ai/dsh-file-reference/grammar";', resolveDir: fileURLToPath(ROOT) },
    bundle: true, platform: 'browser', format: 'iife', globalName: 'validator',
    target: 'es2022', minify: true, write: false,
  }).outputFiles[0].text;
  const license = readFileSync(new URL('./LICENSE', import.meta.resolve('zod/package.json')), 'utf8').replace(/\r\n/g, '\n').trim();
  const grammarLicense = readFileSync(new URL('../../LICENSE', ROOT), 'utf8').replace(/\r\n/g, '\n').trim();
  // 依赖随图谱模块形成完整闭包，运行时不依赖宿主模块表或函数字符串的外部变量。
  const graphRenderer = buildSync({
    entryPoints: [fileURLToPath(new URL('src/graph-canvas.js', ROOT))],
    bundle: true, platform: 'browser', format: 'iife', globalName: 'graphRenderer',
    target: 'es2022', minify: true, write: false,
  }).outputFiles[0].text;
  // 新领域契约含模块级约束值，整体打包保留闭包，避免函数字符串丢失校验边界。
  const featureContracts = buildSync({
    stdin: { contents: 'export { automationContract } from "./src/automation-contract.js"; export { newsContract } from "./src/news-contract.js"; export { modelWorldContract } from "./src/model-world-contract.js";', resolveDir: fileURLToPath(ROOT) },
    bundle: true, platform: 'browser', format: 'iife', globalName: 'featureContracts',
    target: 'es2022', minify: true, write: false,
  }).outputFiles[0].text;
  const utilityViews = buildSync({
    entryPoints: [fileURLToPath(new URL('src/utilities/views.js', ROOT))],
    bundle: true, platform: 'browser', format: 'iife', globalName: 'utilityViews',
    target: 'es2022', minify: true, write: false,
  }).outputFiles[0].text;
  // 新增视图整体打包，图片只注入经确认的小尺寸资源，不引入 Node 文件接口。
  const featureViews = buildSync({
    stdin: { contents: 'export { aiWebContract } from "./src/utilities/ai-web.js"; export { readAvatarFile } from "./src/avatar-image.js"; export { createModelWorldView, worldViewCopy } from "./src/model-world-view.js"; export { explainError } from "./src/error-guide.js";', resolveDir: fileURLToPath(ROOT) },
    bundle: true, platform: 'browser', format: 'iife', globalName: 'featureViews',
    target: 'es2022', minify: true, write: false,
  }).outputFiles[0].text;
  // 完整内联 Worker 及依赖，不从远端脚本或员工文件系统加载转换实现。
  const utilityBuild = buildSync({
    entryPoints: [fileURLToPath(new URL('src/utilities/worker.js', ROOT))],
    bundle: true, platform: 'browser', format: 'iife', target: 'es2022', minify: true, write: false, metafile: true,
  });
  const utilityWorker = utilityBuild.outputFiles[0].text;
  const utilityLicenses = utilityLicenseComment({ metafile: utilityBuild.metafile, workingDirectory: process.cwd() });
  const graphLicenses = ['d3-force', 'd3-quadtree', 'd3-dispatch', 'd3-timer'].map(name => {
    const entry = name === 'd3-force' ? import.meta.resolve(name) : pathToFileURL(createRequire(import.meta.resolve('d3-force')).resolve(name));
    const license = readFileSync(new URL('../LICENSE', entry), 'utf8').replace(/\r\n/g, '\n').trim();
    return `/*! 内联 ${name} 许可\n${license}\n*/\n`;
  }).join('');
  const client = '// 生成来源：src/client.js、src/graph-canvas.js 与 src/*-contract.js；请修改真源后重新生成。\n'
    + `/*! 内联 Zod 许可\n${license}\n*/\n`
    + `/*! 内联 DSH 文件引用语法许可\n${grammarLicense}\n*/\n`
    + graphLicenses + utilityLicenses.replace(/[ \t]+$/gm, '')
    + `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(PACKAGE)},\n  factory: (require) => {\n${validator}\n${graphRenderer}\n${featureContracts}\n${utilityViews}\n${featureViews}\nfeatureViews.portraits = ${JSON.stringify(loadModelWorldPortraits())};
featureViews.avatars = ${JSON.stringify(loadExpertAvatars())};\nreturn (${createClient.toString()})(require, (${knowledgeContract.toString()}), (${expertContract.toString()}), validator.z, validator.formatFileMention, graphRenderer.createGraphCanvas, (${skillLibraryContract.toString()}), featureContracts.automationContract, featureContracts.newsContract, featureContracts.modelWorldContract, (React) => utilityViews.createUtilityViews(React, ${JSON.stringify(utilityWorker)}), featureViews);\n  }\n});\n`;
  return { 'cordis.patch.yml': patch, 'client.js': client };
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
