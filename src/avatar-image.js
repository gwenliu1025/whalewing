/** 所有新选头像共用此边界；不缩图、不覆盖历史原件。 */
export const avatarLimits = Object.freeze({ edge: 300, bytes: 512 * 1024, mime: ['image/png', 'image/jpeg', 'image/webp'] });

export function assertAvatarDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width >= avatarLimits.edge || height >= avatarLimits.edge) {
    throw Object.assign(new Error('头像宽和高都须小于 300 像素（最大 299×299），请重新选择；原头像未修改'), { code: 'AVATAR' });
  }
}

export function parseAvatarData(value) {
  const match = typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 || match[2].length > Math.ceil(avatarLimits.bytes / 3) * 4) throw Object.assign(new Error('头像请选择不超过 512 KiB 的 PNG、JPEG 或 WebP 本地图像'), { code: 'AVATAR' });
  const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
  if (bytes.length > avatarLimits.bytes) throw Object.assign(new Error('头像不超过 512 KiB'), { code: 'AVATAR' });
  // 规范 Base64 检查也拒绝带非零填充位的等价编码。
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  if (btoa(binary) !== match[2]) throw Object.assign(new Error('头像须为规范图像数据'), { code: 'AVATAR' });
  return { bytes, mime: `image/${match[1]}` };
}

/** 浏览器只读用户选件，及时释放解码对象；服务端仍执行完整解码。 */
export async function readAvatarFile(file, { signal } = {}) {
  signal?.throwIfAborted();
  if (!file || !avatarLimits.mime.includes(file.type) || file.size > avatarLimits.bytes) throw new Error('请选择不超过 512 KiB 的 PNG、JPEG 或 WebP 图片');
  const value = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    const stop = () => reader.abort();
    const cleanup = () => signal?.removeEventListener('abort', stop);
    reader.onload = () => { cleanup(); resolve(reader.result); };
    reader.onerror = () => { cleanup(); reject(new Error('头像读取失败，原头像未修改')); };
    reader.onabort = () => { cleanup(); reject(signal?.reason ?? new Error('已取消头像读取')); };
    signal?.addEventListener('abort', stop, { once: true });
    reader.readAsDataURL(file);
  });
  parseAvatarData(value);
  signal?.throwIfAborted();
  const bitmap = await createImageBitmap(file);
  try { signal?.throwIfAborted(); assertAvatarDimensions(bitmap.width, bitmap.height); }
  finally { bitmap.close(); }
  return value;
}
