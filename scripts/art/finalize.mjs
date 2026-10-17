import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * 把 design.json 里选定的候选放大成 4K 原图（2160×3840 WebP），写到插件的 art/model-world/<立绘 id>.webp。
 * 用法：node finalize.mjs <素材目录> <realesrgan-ncnn-vulkan 程序目录>
 * 素材目录下需有 final/<id>-<序号>.png（已改好标识的候选）；放大用 Real-ESRGAN 的 realesrgan-x4plus-anime 模型（BSD-3），中间结果写到 x4/。
 * 之后运行 scripts/portraits.mjs 重建随包缩略图。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const [root, tool] = process.argv.slice(2);
if (!root || !tool) throw new Error('用法：node finalize.mjs <素材目录> <realesrgan-ncnn-vulkan 程序目录>');
const { picks } = JSON.parse(readFileSync(path.join(here, 'design.json'), 'utf8'));
const target = path.resolve(here, '../../art/model-world');
mkdirSync(path.join(root, 'x4'), { recursive: true });
mkdirSync(target, { recursive: true });

for (const [id, n] of Object.entries(picks)) {
  const input = path.resolve(root, 'final', `${id}-${n}.png`), upscaled = path.resolve(root, 'x4', `${id}-${n}.png`);
  execFileSync(path.join(tool, 'realesrgan-ncnn-vulkan.exe'), ['-i', input, '-o', upscaled, '-n', 'realesrgan-x4plus-anime', '-m', path.join(tool, 'models')], { stdio: 'ignore' });
  // 生图比例约为 9:16，等比缩进 2160×3840，余边补白（缩略图生成时会抠掉白底）。
  await sharp(upscaled).resize(2160, 3840, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).webp({ quality: 90 }).toFile(path.join(target, `${id}.webp`));
  console.log(`完成 ${id} ← ${id}-${n}`);
}
