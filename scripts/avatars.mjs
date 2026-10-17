import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { expertAvatarIds, presetAvatarIds } from '../src/expert-avatars.js';

/** 从原创头像原图（art/avatars/<id>.webp）生成随包头像：192×192 WebP，小于专家头像的 300 像素上限。 */
export const avatarSize = 192;
const target = fileURLToPath(new URL('../content/avatars/', import.meta.url));

export const renderAvatar = input => sharp(input).resize(avatarSize, avatarSize, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();

export async function buildAvatars(sourceDirectory) {
  await mkdir(target, { recursive: true });
  const ids = [...expertAvatarIds, ...presetAvatarIds];
  for (const id of ids) await writeFile(path.join(target, `${id}.webp`), await renderAvatar(path.join(sourceDirectory, `${id}.webp`)));
  return ids.length;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const source = process.argv[2] || fileURLToPath(new URL('../art/avatars/', import.meta.url));
  process.stdout.write(`已从 ${source} 生成 ${await buildAvatars(source)} 个头像\n`);
}
