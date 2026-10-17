import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 按 design.json 原创设计模型世界立绘：每个角色三套设定各出一张候选，只附厂商标识做参考，不附任何社区立绘；已存在的跳过。
 * 用法：node design.mjs <素材目录> [并发数] [id 或 id-序号...]
 *       node design.mjs --retouch <素材目录> [并发数] [id...]   在已有候选上只改标识（去掉大标识，换成身上一个小饰物），写到 final/
 * 素材目录下需有 logos/<id>.png；候选写到 out/<id>-<序号>.png。小肥鱼按 out/deepseek-<序号>.png 画成她小时候，须在大肥鱼之后生成。
 * 调用本机 Codex CLI 的内置生图，单张最大 941×1672，4K 版本另行放大。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const retouch = args[0] === '--retouch';
const [root, concurrency = '3', ...only] = retouch ? args.slice(1) : args;
if (!root) throw new Error('用法：node design.mjs [--retouch] <素材目录> [并发数] [id...]');
const spec = JSON.parse(readFileSync(path.join(here, 'design.json'), 'utf8'));
const source = path.resolve(root, 'out');
const output = path.resolve(root, retouch ? 'final' : 'out');
mkdirSync(output, { recursive: true });
const jobs = Object.entries(spec.characters)
  .flatMap(([id, item]) => ['1', '2', '3'].map(n => ({ id, item, n, file: `${id}-${n}.png` })))
  .filter(({ id, n }) => !only.length || only.includes(id) || only.includes(`${id}-${n}`))
  .filter(job => !existsSync(path.join(output, job.file)));

// 小肥鱼统一用发夹，其余按候选序号轮换胸针、发饰、挂牌。
const placeOf = ({ item, n }) => item.child ? spec.place[1] : spec.place[Number(n) - 1];

function brief(job) {
  const { item, n } = job;
  const logo = spec.logo.replace('{logo}', item.logo).replace('{place}', placeOf(job));
  if (retouch) return [spec.retouch.replace('{logo}', item.logo).replace('{place}', placeOf(job))];
  if (item.child) return [
    'Use your image generation tool to create ONE image.',
    `${spec.style.replace(/ONE elegant mature young woman \([^)]*\)/, 'ONE little girl')} Brand colors: ${item.colors}.`,
    item.child,
    logo.replace('The attached image', 'The first attached image'),
  ];
  return [
    'Use your image generation tool to create ONE image.',
    `${spec.style} Brand colors: ${item.colors}.`,
    `Character concept: ${item.concepts[Number(n) - 1]}.`,
    logo,
    spec.rules.replace('{avoid}', item.avoid || ''),
  ];
}

function imagesOf({ id, item, n, file }) {
  const logo = path.join(root, 'logos', `${id}.png`);
  if (retouch) return [path.join(source, file), logo];
  return [logo, ...(item.child ? [path.join(source, `deepseek-${n}.png`)] : [])];
}

function run(job) {
  const images = imagesOf(job).map(file => path.resolve(file));
  if (!images.every(existsSync)) return console.log(`跳过 ${job.file}：缺少 ${images.filter(file => !existsSync(file)).join('、')}`);
  const prompt = [...brief(job), `Save the result as ${job.file} in the current directory (copy the generated file here). Do not read or modify any other files. After saving, print the absolute path.`].join('\n');
  return new Promise(resolve => {
    // Windows 下 codex 是 .cmd 包装，需经 shell 启动；提示词走标准输入，避免被 shell 拆分。
    const child = spawn('codex', ['exec', '--skip-git-repo-check', '-s', 'workspace-write', ...images.flatMap(image => ['-i', `"${image}"`]), '-'], { cwd: output, shell: true, stdio: ['pipe', 'ignore', 'ignore'] });
    child.stdin.end(prompt);
    const timer = setTimeout(() => child.kill(), 15 * 60 * 1000);
    child.on('exit', () => { clearTimeout(timer); console.log(`${existsSync(path.join(output, job.file)) ? '完成' : '失败'} ${job.file}`); resolve(); });
  });
}

console.log(`待生成 ${jobs.length} 张`);
await Promise.all(Array.from({ length: Number(concurrency) }, async () => { while (jobs.length) await run(jobs.shift()); }));
