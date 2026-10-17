import * as fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { VERSION } from '../host-adapter/adapter.mjs';

// 生成给同事的一键安装包：插件 npm 包（插件自带依赖以 bundledDependencies 打进包内）+ 安装器 + 双击入口。
// DSH 自己提供的包（@deepseek-ai/*、zod、sharp）由 DSH 的 profile 依赖路由供给，不随包。
const root = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(root, '../..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const outRoot = path.resolve(process.argv[2] ?? path.join(repository, '.artifacts', 'whalewing-installer'));
const name = `whalewing-${pkg.version}-installer`;
const out = path.join(outRoot, name), files = path.join(out, 'files'), stage = path.join(outRoot, '.stage'), plugin = path.join(stage, 'package');
/** 插件服务端直接引用、DSH 不提供的包；新增服务端依赖时在这里登记。 */
export const bundledRoots = ['js-yaml', 'saxes', 'mdast-util-from-markdown', 'mdast-util-gfm', 'micromark-extension-gfm'];
const hostProvided = name => name.startsWith('@deepseek-ai/') || ['zod', 'sharp'].includes(name);

if (path.relative(repository, out).startsWith('..') && !process.argv[2]) throw new Error('输出目录越界');
execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { stdio: 'inherit' });
await fs.rm(out, { recursive: true, force: true }); await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(plugin, { recursive: true }); await fs.mkdir(files, { recursive: true });

// 1. 插件运行文件（package.json 的 files 清单）
// 开发用的 node_modules（如工具台打包依赖，已打进 client.js）不随包。
for (const item of [...pkg.files, 'package.json']) if (existsSync(path.join(root, item))) await fs.cp(path.join(root, item), path.join(plugin, item), { recursive: true, dereference: true, filter: p => !path.relative(root, p).split(path.sep).includes('node_modules') });

// 2. 插件自带依赖：按 Node 的解析规则（从包的真实位置向上找 node_modules）收集运行时闭包，
//    在安装包里平铺放置；同名不同版本时嵌套到引用方下面。类型声明包没有运行时代码，不随包。
const copied = new Map(), placed = new Map();
function locate(name, from) {
  for (let dir = from; path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'));
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  throw new Error(`找不到依赖 ${name}（从 ${from} 起）`);
}
async function collect(name, from, parentDest) {
  if (hostProvided(name) || name.startsWith('@types/')) return;
  const dir = await fs.realpath(locate(name, from));
  const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')), id = `${manifest.name}@${manifest.version}`;
  const flat = path.join(plugin, 'node_modules', ...name.split('/'));
  const existing = placed.get(flat);
  if (existing === id) return;
  const dest = existing === undefined ? flat : path.join(parentDest, 'node_modules', ...name.split('/'));
  if (placed.get(dest) === id) return;
  if (placed.has(dest)) throw new Error(`依赖版本冲突无法放置：${id} 与 ${placed.get(dest)}`);
  placed.set(dest, id); copied.set(path.relative(plugin, dest), id);
  await fs.cp(dir, dest, { recursive: true, dereference: true, filter: p => !path.relative(dir, p).split(path.sep).some(part => part === '.bin' || part === 'node_modules') });
  for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) await collect(dep, dir, dest);
}
for (const dep of bundledRoots) await collect(dep, root, plugin);

// 随包清单：依赖只写实际随包的，并声明为 bundledDependencies，pnpm 从 file: 安装时不再联网获取；peer 由 DSH 提供。
const shipped = JSON.parse(readFileSync(path.join(plugin, 'package.json'), 'utf8'));
shipped.dependencies = Object.fromEntries(bundledRoots.map(dep => [dep, JSON.parse(readFileSync(path.join(plugin, 'node_modules', ...dep.split('/'), 'package.json'), 'utf8')).version]));
shipped.bundledDependencies = [...bundledRoots];
delete shipped.devDependencies; delete shipped.scripts;
await fs.writeFile(path.join(plugin, 'package.json'), JSON.stringify(shipped, null, 2) + '\n');
const packed = JSON.parse(execSync(`npm pack --json --pack-destination "${files}"`, { cwd: plugin, encoding: 'utf8' }))[0];
const tarball = packed.filename.replace(/^@/, '').replace(/\//g, '-');
const inside = new Set(packed.files.map(file => file.path));
for (const relative of copied.keys()) if (!inside.has(`${relative.split(path.sep).join('/')}/package.json`)) throw new Error(`npm pack 没有带上依赖：${relative}`);
await fs.rm(stage, { recursive: true, force: true });

// 3. 安装器：打成单文件，由 DSH 自带运行时执行。
await build({ entryPoints: [path.join(root, 'installer', 'main.mjs')], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: path.join(files, 'installer.mjs'), logLevel: 'warning', legalComments: 'inline' });
const bom = Buffer.from([0xef, 0xbb, 0xbf]), crlf = text => text.replace(/\r?\n/g, '\r\n');
// Windows PowerShell 5.1 只认带 BOM 的 UTF-8 脚本；记事本与 cmd 用 CRLF。
await fs.writeFile(path.join(files, 'run.ps1'), Buffer.concat([bom, Buffer.from(crlf(readFileSync(path.join(root, 'installer', 'run.ps1'), 'utf8')))]));
await fs.writeFile(path.join(out, '使用说明.txt'), Buffer.concat([bom, Buffer.from(crlf(readFileSync(path.join(root, 'installer', '使用说明.txt'), 'utf8')))]));
const launcher = command => crlf(`@echo off\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0files\\run.ps1" -Command ${command}\necho.\npause\n`);
await fs.writeFile(path.join(out, '安装鲸翼.cmd'), launcher('install'));
await fs.writeFile(path.join(out, '还原鲸翼.cmd'), launcher('restore'));

let commit = 'unknown';
try { commit = execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* 没有 git 时只缺少提交号，不影响安装包 */ }
await fs.writeFile(path.join(files, 'manifest.json'), JSON.stringify({ pluginVersion: pkg.version, dshVersion: VERSION, tarball, tarballSha256: createHash('sha256').update(readFileSync(path.join(files, tarball))).digest('hex'), commit, builtAt: new Date().toISOString(), bundledDependencies: [...copied.values()].sort() }, null, 2) + '\n');

// 4. 压缩包：文件名用 UTF-8，解压后目录结构与上面相同。
const entries = {};
async function add(dir, prefix) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name), key = `${prefix}/${item.name}`;
    if (item.isDirectory()) await add(full, key);
    else entries[key] = [new Uint8Array(await fs.readFile(full)), { level: 9 }];
  }
}
await add(out, name);
const zip = zipSync(entries);
const zipPath = path.join(outRoot, `${name}.zip`);
await fs.writeFile(zipPath, zip);

const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
console.log(JSON.stringify({ out, zip: zipPath, size: zip.length, sha256: digest(zipPath), files: Object.keys(entries).length, bundledDependencies: copied.size, commit }, null, 2));
