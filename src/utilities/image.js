/** 图片格式头在解码前核验；逐张编码并立即释放图像与 Canvas。 */
import { LIMITS, validateFiles } from './core.js';

const fail = message => { throw new Error(message); };
const little32 = (b, p) => (b[p] | b[p + 1] << 8 | b[p + 2] << 16 | b[p + 3] << 24) >>> 0;
const big32 = (b, p) => (b[p] * 0x1000000 + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3]) >>> 0;
const ascii = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));
function dimensions(width, height, mime) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > LIMITS.pixels) fail('图片尺寸无效或超过 3,200 万像素');
  return { width, height, mime };
}

/** 识别 PNG/JPEG/WebP 静态图片；拒收动画和伪造扩展名。 */
export function inspectImage(bytes, name) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > LIMITS.file) fail('图片须在 25 MiB 以内');
  const extension = name.split('.').pop().toLowerCase();
  if (bytes.length >= 33 && ascii(bytes, 1, 3) === 'PNG' && bytes[0] === 137 && ascii(bytes, 4, 4) === '\r\n\x1a\n') {
    if (extension !== 'png' || big32(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') fail('PNG 内容与扩展名或文件头不符');
    const info = dimensions(big32(bytes, 16), big32(bytes, 20), 'image/png');
    let p = 8, ended = false, imageData = false;
    while (p < bytes.length) {
      if (p + 12 > bytes.length) fail('PNG 数据截断');
      const length = big32(bytes, p), kind = ascii(bytes, p + 4, 4);
      if (p + 12 + length > bytes.length) fail('PNG 区块超出文件');
      if (kind === 'IHDR' && p !== 8) fail('PNG 包含重复尺寸头');
      if (['acTL', 'fcTL', 'fdAT'].includes(kind)) fail('动画图片尚不支持，请选择静态图片');
      if (kind === 'IDAT') imageData = true;
      if (kind === 'IEND') { if (length || p + 12 !== bytes.length) fail('PNG 结尾无效'); ended = true; }
      p += length + 12;
    }
    if (!ended || !imageData) fail('PNG 缺少图像数据或结尾');
    return info;
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    if (extension !== 'webp' || little32(bytes, 4) + 8 !== bytes.length) fail('WebP 内容与扩展名或长度不符');
    let p = 12, info, encoded;
    while (p < bytes.length) {
      if (p + 8 > bytes.length) fail('WebP 数据截断');
      const kind = ascii(bytes, p, 4), length = little32(bytes, p + 4), d = p + 8;
      if (d + length + (length % 2) > bytes.length) fail('WebP 区块超出文件');
      if (kind === 'ANIM' || kind === 'ANMF' || (kind === 'VP8X' && bytes[d] & 2)) fail('动画图片尚不支持，请选择静态图片');
      let current;
      if (kind === 'VP8X') {
        if (length !== 10 || info) fail('WebP 扩展头无效');
        info = dimensions(1 + bytes[d + 4] + (bytes[d + 5] << 8) + (bytes[d + 6] << 16), 1 + bytes[d + 7] + (bytes[d + 8] << 8) + (bytes[d + 9] << 16), 'image/webp');
      } else if (kind === 'VP8 ') {
        if (length < 10 || bytes[d + 3] !== 0x9d || bytes[d + 4] !== 1 || bytes[d + 5] !== 0x2a) fail('WebP VP8 头无效');
        current = dimensions((bytes[d + 6] | bytes[d + 7] << 8) & 0x3fff, (bytes[d + 8] | bytes[d + 9] << 8) & 0x3fff, 'image/webp');
      } else if (kind === 'VP8L') {
        if (length < 5 || bytes[d] !== 0x2f) fail('WebP VP8L 头无效');
        const bits = little32(bytes, d + 1);
        current = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, 'image/webp');
      }
      if (current) { if (encoded) fail('WebP 包含重复图像'); encoded = current; }
      p = d + length + (length % 2);
    }
    if (!encoded || (info && (info.width !== encoded.width || info.height !== encoded.height))) fail('WebP 图像尺寸与文件头不一致');
    return info || encoded;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    if (!['jpg', 'jpeg'].includes(extension)) fail('JPEG 内容与扩展名不符');
    let p = 2, info;
    while (p + 1 < bytes.length) {
      if (bytes[p++] !== 0xff) fail('JPEG 标记无效');
      while (bytes[p] === 0xff) p++;
      const marker = bytes[p++];
      if (marker === 0xda) { if (!info) fail('JPEG 缺少尺寸头'); return info; }
      if (marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (p + 2 > bytes.length) fail('JPEG 数据截断');
      const length = bytes[p] << 8 | bytes[p + 1];
      if (length < 2 || p + length > bytes.length) fail('JPEG 区块超出文件');
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8 || info) fail('JPEG 尺寸头无效');
        info = dimensions(bytes[p + 5] << 8 | bytes[p + 6], bytes[p + 3] << 8 | bytes[p + 4], 'image/jpeg');
      }
      p += length;
    }
    return fail('JPEG 缺少图像数据');
  }
  return fail('请选择有效的 PNG、JPEG 或 WebP 静态图片');
}

/** 在 Worker 内串行处理；所有输出成功后才返回，异常仍执行资源释放。 */
export async function convertImages(files, options) {
  validateFiles(files, 'image');
  const { format, quality, maxEdge } = options || {};
  if (!['png', 'jpeg', 'webp'].includes(format) || !Number.isFinite(quality) || quality < 0.1 || quality > 1 || !Number.isInteger(maxEdge) || maxEdge < 1 || maxEdge > 10000) fail('请选择有效格式、10–100% 质量及 1–10,000 像素最大边长');
  if (typeof globalThis.createImageBitmap !== 'function' || typeof globalThis.OffscreenCanvas !== 'function') fail('当前浏览器缺少后台图片处理能力，请使用支持 Worker 图像处理的 DSH 桌面端');
  const action = options.action || 'image';
  if (action === 'image-stitch') return stitchImages(files, options);
  if (!['image', 'image-rotate', 'image-crop', 'image-watermark'].includes(action)) fail('未知图片操作');
  if (action === 'image-crop' && files.length !== 1) fail('裁剪时请选择一张图片');
  if (action === 'image-rotate' && (![0, 90, 180, 270].includes(options.angle) || !['none', 'horizontal', 'vertical'].includes(options.flip))) fail('请选择有效旋转角度和翻转方向');
  if (action === 'image-watermark' && (typeof options.watermark !== 'string' || !options.watermark.trim() || options.watermark.length > 100 || !Number.isFinite(options.opacity) || options.opacity < 0.1 || options.opacity > 1 || !Number.isInteger(options.fontSize) || options.fontSize < 10 || options.fontSize > 200 || !['top-left', 'center', 'bottom-right'].includes(options.position))) fail('水印需为 1–100 字，字号 10–200，透明度 10–100%');
  const outputs = [], details = []; let total = 0;
  for (const [index, file] of files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length !== file.size) fail('读取结果与所选图片大小不一致');
    const info = inspectImage(bytes, file.name);
    let bitmap, canvas;
    try {
      bitmap = await createImageBitmap(new Blob([bytes], { type: info.mime }));
      // EXIF 旋转可交换宽高；实际解码仍复核像素与头部尺寸，避免元数据绕过预算。
      dimensions(bitmap.width, bitmap.height, info.mime);
      if (!(bitmap.width === info.width && bitmap.height === info.height || bitmap.width === info.height && bitmap.height === info.width)) fail('实际图片尺寸与文件头不一致');
      let sourceWidth = bitmap.width, sourceHeight = bitmap.height;
      if (action === 'image-crop') {
        if (![options.x, options.y, options.width, options.height].every(Number.isInteger) || options.x < 0 || options.y < 0 || options.width < 1 || options.height < 1 || options.x + options.width > bitmap.width || options.y + options.height > bitmap.height) fail('裁剪区域必须位于原图范围内，且宽高大于 0');
        sourceWidth = options.width; sourceHeight = options.height;
      }
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const drawWidth = Math.max(1, Math.round(sourceWidth * scale)), drawHeight = Math.max(1, Math.round(sourceHeight * scale));
      const swap = action === 'image-rotate' && options.angle % 180 !== 0;
      const width = swap ? drawHeight : drawWidth, height = swap ? drawWidth : drawHeight;
      canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) fail('后台 Canvas 创建失败');
      if (format === 'jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
      if (action === 'image-rotate') {
        context.translate(width / 2, height / 2); context.rotate(options.angle * Math.PI / 180);
        context.scale(options.flip === 'horizontal' ? -1 : 1, options.flip === 'vertical' ? -1 : 1);
        context.drawImage(bitmap, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      } else if (action === 'image-crop') context.drawImage(bitmap, options.x, options.y, options.width, options.height, 0, 0, width, height);
      else context.drawImage(bitmap, 0, 0, width, height);
      if (action === 'image-watermark') {
        context.globalAlpha = options.opacity; context.font = `${options.fontSize}px sans-serif`; context.fillStyle = '#ffffff'; context.strokeStyle = '#000000'; context.lineWidth = 2; context.textBaseline = 'top';
        const measured = context.measureText(options.watermark).width;
        if (measured + 16 > width || options.fontSize + 16 > height) fail('水印超出图片，请减小字号或文字长度');
        const x = options.position === 'top-left' ? 8 : options.position === 'center' ? (width - measured) / 2 : width - measured - 8;
        const y = options.position === 'top-left' ? 8 : options.position === 'center' ? (height - options.fontSize) / 2 : height - options.fontSize - 8;
        context.strokeText(options.watermark, x, y); context.fillText(options.watermark, x, y); context.globalAlpha = 1;
      }
      const mime = `image/${format}`, blob = await canvas.convertToBlob({ type: mime, quality });
      if (blob.type !== mime) fail('当前浏览器不支持所选输出格式');
      total += blob.size;
      if (!blob.size || total > LIMITS.output) fail('图片输出为空或合计超过 100 MiB');
      const name = `${index + 1}-${file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120)}-处理.${format === 'jpeg' ? 'jpg' : format}`;
      outputs.push({ name, mime, bytes: new Uint8Array(await blob.arrayBuffer()) });
      details.push(`${file.name}：${file.size} → ${blob.size} 字节，${width} × ${height}${blob.size > file.size ? '（输出变大）' : ''}`);
    } finally { bitmap?.close(); if (canvas) { canvas.width = 0; canvas.height = 0; } }
  }
  return { files: outputs, summary: `已处理 ${outputs.length} 张图片；JPEG 透明区域填充白色，原件保持不变`, listing: details };
}

async function decodeSelected(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) fail('图片读取长度不一致');
  const info = inspectImage(bytes, file.name), bitmap = await createImageBitmap(new Blob([bytes], { type: info.mime }));
  if (!(bitmap.width === info.width && bitmap.height === info.height || bitmap.width === info.height && bitmap.height === info.width)) { bitmap.close(); fail('实际图片尺寸与头部不符'); }
  return bitmap;
}

async function stitchImages(files, options) {
  if (!['horizontal', 'vertical'].includes(options.direction)) fail('请选择水平或垂直拼接');
  const sizes = []; let width = 0, height = 0;
  // 先逐张取得旋转后的真实尺寸并释放，再分配结果画布，始终只保留一个源图解码对象。
  for (const file of files) {
    const bitmap = await decodeSelected(file);
    try {
      const ratio = Math.min(1, options.maxEdge / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * ratio)), h = Math.max(1, Math.round(bitmap.height * ratio));
      sizes.push([w, h]); width = options.direction === 'horizontal' ? width + w : Math.max(width, w); height = options.direction === 'vertical' ? height + h : Math.max(height, h);
      dimensions(width, height, `image/${options.format}`);
      if (width > 10000 || height > 10000) fail('拼接结果边长超过 10,000 像素，请减小单图边长');
    } finally { bitmap.close(); }
  }
  const canvas = new OffscreenCanvas(width, height);
  try {
    const context = canvas.getContext('2d');
    if (!context) fail('后台 Canvas 创建失败');
    if (options.format === 'jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
    let x = 0, y = 0;
    for (const [i, file] of files.entries()) {
      const bitmap = await decodeSelected(file);
      try { const [w, h] = sizes[i]; context.drawImage(bitmap, x, y, w, h); if (options.direction === 'horizontal') x += w; else y += h; } finally { bitmap.close(); }
    }
    const mime = `image/${options.format}`, blob = await canvas.convertToBlob({ type: mime, quality: options.quality });
    if (blob.type !== mime || !blob.size || blob.size > LIMITS.output) fail('拼接输出格式不支持或超过 100 MiB');
    return { files: [{ name: `拼接结果.${options.format === 'jpeg' ? 'jpg' : options.format}`, mime, bytes: new Uint8Array(await blob.arrayBuffer()) }], summary: `${files.length} 张图片按选择顺序拼接，${width} × ${height}；空白区域在 JPEG 中填白` };
  } finally { canvas.width = 0; canvas.height = 0; }
}
