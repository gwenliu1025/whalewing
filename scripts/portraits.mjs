import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { modelWorldPortraitIds } from '../src/model-world-roster.js';

/** 从原创立绘目录（<立绘 id>.webp）生成模型世界缩略图：等比缩到 288×512 以内并抠掉白底，不裁剪、不重绘。 */
export const portraitSize = Object.freeze({ width: 288, height: 512, quality: 82 });
const target = fileURLToPath(new URL('../content/model-world/portraits/', import.meta.url));

// 近白且接近中性色视为背景；只清除与图片边缘连通的部分，角色内部的白色衣物不受影响。
const isBackground = (data, offset) => {
  const r = data[offset], g = data[offset + 1], b = data[offset + 2];
  return Math.min(r, g, b) >= 236 && Math.max(r, g, b) - Math.min(r, g, b) <= 14;
};

/** 从四边泛洪清除白底，再给紧邻背景的浅色像素做半透明过渡，避免白边。 */
export function cutout(data, width, height) {
  const cleared = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const push = index => { if (!cleared[index] && isBackground(data, index * 4)) { cleared[index] = 1; queue[tail++] = index; } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++], x = index % width, y = (index - x) / width;
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }
  for (let index = 0; index < width * height; index++) {
    if (cleared[index]) { data[index * 4 + 3] = 0; continue; }
    const x = index % width, y = (index - x) / width;
    const edge = (x > 0 && cleared[index - 1]) || (x < width - 1 && cleared[index + 1]) || (y > 0 && cleared[index - width]) || (y < height - 1 && cleared[index + width]);
    if (!edge) continue;
    const light = Math.min(data[index * 4], data[index * 4 + 1], data[index * 4 + 2]);
    if (light > 200) data[index * 4 + 3] = Math.round(255 * Math.min(1, (255 - light) / 55));
  }
  return data;
}

export async function renderPortrait(input) {
  const { data, info } = await sharp(input).resize({ width: portraitSize.width, height: portraitSize.height, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  cutout(data, info.width, info.height);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: portraitSize.quality, alphaQuality: 90 }).toBuffer();
}

export async function buildPortraits(sourceDirectory) {
  await mkdir(target, { recursive: true });
  for (const id of modelWorldPortraitIds) await writeFile(path.join(target, `${id}.webp`), await renderPortrait(path.join(sourceDirectory, `${id}.webp`)));
  return modelWorldPortraitIds.length;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const source = process.argv[2] || fileURLToPath(new URL('../art/model-world/', import.meta.url));
  process.stdout.write(`已从 ${source} 生成 ${await buildPortraits(source)} 张缩略图\n`);
}
