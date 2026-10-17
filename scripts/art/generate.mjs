import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 调用本机 Codex CLI 的图像生成，按清单出图；已存在的跳过。用法：node generate.mjs <清单.json> <输出目录> [并发数] [id...]
 * 需要对齐已有画风时，用环境变量 WHALEWING_ART_REFS 传入参考图（分号分隔的路径），随提示词一起附给模型。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const [list = 'characters.json', output = path.join(here, 'out'), concurrency = '3', ...only] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(path.resolve(here, list), 'utf8'));
mkdirSync(output, { recursive: true });
const references = (process.env.WHALEWING_ART_REFS || '').split(';').filter(Boolean).map(file => path.resolve(file));
const queue = Object.entries(spec.characters).filter(([id]) => (!only.length || only.includes(id)) && !existsSync(path.join(output, `${id}.png`)));

function run([id, brief]) {
  const style = references.length ? `${spec.style}. Match the art style of the attached reference images exactly (line art, shading, proportions, level of detail, background), but draw a new character` : spec.style;
  const prompt = `Use your image generation tool to create ONE image, then save it as ${id}.png in the current directory (copy the generated file here). Image spec: ${brief}; ${style}. Do not read or modify any other files. After saving, print the absolute path.`;
  return new Promise(resolve => {
    // Windows 下 codex 是 .cmd 包装，需经 shell 启动；提示词走标准输入，避免被 shell 拆分。
    const child = spawn('codex', ['exec', '--skip-git-repo-check', '-s', 'workspace-write', ...references.flatMap(file => ['-i', `"${file}"`]), '-'], { cwd: output, shell: true, stdio: ['pipe', 'ignore', 'ignore'] });
    child.stdin.end(prompt);
    const timer = setTimeout(() => child.kill(), 15 * 60 * 1000);
    child.on('exit', () => { clearTimeout(timer); console.log(`${existsSync(path.join(output, `${id}.png`)) ? '完成' : '失败'} ${id}`); resolve(); });
  });
}

await Promise.all(Array.from({ length: Number(concurrency) }, async () => { while (queue.length) await run(queue.shift()); }));
