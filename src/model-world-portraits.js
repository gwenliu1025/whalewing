import { readFileSync } from 'node:fs';
import { modelWorldPortraitIds } from './model-world-roster.js';

/** 构建专用：缩略图由 scripts/portraits.mjs 从原创立绘生成，按立绘 id 命名。 */
export const modelWorldPortraitFiles = Object.freeze(Object.fromEntries(modelWorldPortraitIds.map(id => [id, `${id}.webp`])));

export function loadModelWorldPortraits() {
  return Object.fromEntries(Object.entries(modelWorldPortraitFiles).map(([id, file]) => [
    id, `data:image/webp;base64,${readFileSync(new URL(`../content/model-world/portraits/${file}`, import.meta.url)).toString('base64')}`,
  ]));
}
