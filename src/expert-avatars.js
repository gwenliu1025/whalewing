import { readFileSync } from 'node:fs';

/** 内置专家的默认头像与供自定义专家选用的预置头像；原图在 art/avatars，由 scripts/avatars.mjs 生成。 */
export const expertAvatarIds = Object.freeze(['manager', 'presales', 'requirements', 'development', 'implementation', 'testing', 'operations']);
export const presetAvatarIds = Object.freeze(Array.from({ length: 12 }, (_, index) => `preset-${String(index + 1).padStart(2, '0')}`));

/** 构建专用：返回 { 头像 id: data URL }。 */
export function loadExpertAvatars() {
  return Object.fromEntries([...expertAvatarIds, ...presetAvatarIds].map(id => [
    id, `data:image/webp;base64,${readFileSync(new URL(`../content/avatars/${id}.webp`, import.meta.url)).toString('base64')}`,
  ]));
}
