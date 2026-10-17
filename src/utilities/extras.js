/** 图片打码、去水印、宫格切图，二维码生成与识别，音频编码。全部在 Worker 内本地完成。 */
import { zipSync } from 'fflate';
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';
import { Mp3Encoder } from '@breezystack/lamejs';
import { LIMITS, validateFiles } from './core.js';
import { inspectImage } from './image.js';
import { safeBase } from './office-tasks.js';

const fail = message => { throw new Error(message); };
const resultFile = (name, mime, bytes) => { if (!bytes.length || bytes.length > LIMITS.output) fail('输出为空或超过 100 MiB'); return { name, mime, bytes }; };
const needCanvas = () => { if (typeof globalThis.createImageBitmap !== 'function' || typeof globalThis.OffscreenCanvas !== 'function') fail('当前环境不支持后台图片处理，请使用 DSH 桌面端'); };

async function readImage(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) fail('读取结果与所选图片大小不一致');
  const info = inspectImage(bytes, file.name);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: info.mime }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0); bitmap.close?.();
  return { canvas, context, mime: info.mime, width: canvas.width, height: canvas.height };
}
async function encode(canvas, mime) {
  const type = mime === 'image/jpeg' ? 'image/jpeg' : mime === 'image/webp' ? 'image/webp' : 'image/png';
  const blob = await canvas.convertToBlob({ type, quality: 0.92 });
  return { mime: blob.type, bytes: new Uint8Array(await blob.arrayBuffer()) };
}
const extension = mime => mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];

/** 选区按原图像素；超出图片的部分自动裁到边界，选区为空时提示重新框选。 */
function region(options, width, height) {
  const x = Math.max(0, Math.floor(options.x)), y = Math.max(0, Math.floor(options.y));
  const right = Math.min(width, Math.floor(options.x + options.width)), bottom = Math.min(height, Math.floor(options.y + options.height));
  if (![options.x, options.y, options.width, options.height].every(Number.isFinite) || right - x < 1 || bottom - y < 1) fail('请先在图片上框选要处理的区域');
  return { x, y, width: right - x, height: bottom - y };
}

/** 马赛克：把选区按方块取平均色。 */
export function mosaic(data, width, area, block) {
  for (let top = area.y; top < area.y + area.height; top += block) for (let left = area.x; left < area.x + area.width; left += block) {
    const right = Math.min(left + block, area.x + area.width), bottom = Math.min(top + block, area.y + area.height);
    const sum = [0, 0, 0, 0]; let count = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) { const i = (y * width + x) * 4; for (let c = 0; c < 4; c++) sum[c] += data[i + c]; count++; }
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) { const i = (y * width + x) * 4; for (let c = 0; c < 4; c++) data[i + c] = Math.round(sum[c] / count); }
  }
  return data;
}

/** 去水印：选区内像素由外向内逐层取已知邻居的平均值填补，再平滑几遍；适合纯色或渐变背景上的文字水印。 */
export function inpaint(data, width, height, area) {
  const known = new Uint8Array(width * height).fill(1);
  for (let y = area.y; y < area.y + area.height; y++) for (let x = area.x; x < area.x + area.width; x++) known[y * width + x] = 0;
  const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  let missing = area.width * area.height;
  while (missing > 0) {
    const filled = [];
    for (let y = area.y; y < area.y + area.height; y++) for (let x = area.x; x < area.x + area.width; x++) {
      const index = y * width + x;
      if (known[index]) continue;
      const sum = [0, 0, 0, 0]; let count = 0;
      for (const [dx, dy] of neighbours) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !known[ny * width + nx]) continue;
        const i = (ny * width + nx) * 4; for (let c = 0; c < 4; c++) sum[c] += data[i + c]; count++;
      }
      if (count) filled.push([index, sum.map(value => value / count)]);
    }
    if (!filled.length) break;
    for (const [index, color] of filled) { for (let c = 0; c < 4; c++) data[index * 4 + c] = Math.round(color[c]); known[index] = 1; }
    missing -= filled.length;
  }
  for (let pass = 0; pass < 4; pass++) for (let y = area.y; y < area.y + area.height; y++) for (let x = area.x; x < area.x + area.width; x++) {
    const sum = [0, 0, 0, 0]; let count = 0;
    for (const [dx, dy] of neighbours) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const i = (ny * width + nx) * 4; for (let c = 0; c < 4; c++) sum[c] += data[i + c]; count++;
    }
    const i = (y * width + x) * 4; for (let c = 0; c < 4; c++) data[i + c] = Math.round(sum[c] / count);
  }
  return data;
}

async function imageRegionTask(tool, files, options) {
  needCanvas(); validateFiles(files, 'image');
  if (files.length !== 1) fail('请选择一张图片');
  const image = await readImage(files[0]);
  const area = region(options, image.width, image.height);
  const pixels = image.context.getImageData(0, 0, image.width, image.height);
  if (tool === 'image-mosaic') {
    const block = Math.round(options.block);
    if (!Number.isInteger(block) || block < 2 || block > 200) fail('马赛克方块大小为 2–200 像素');
    mosaic(pixels.data, image.width, area, block);
  } else inpaint(pixels.data, image.width, image.height, area);
  image.context.putImageData(pixels, 0, 0);
  const output = await encode(image.canvas, image.mime);
  const action = tool === 'image-mosaic' ? '打码' : '去水印';
  return { summary: `已对 ${area.width} × ${area.height} 像素区域${action}`, files: [resultFile(`${safeBase(files[0].name)}-${action}.${extension(output.mime)}`, output.mime, output.bytes)], listing: [] };
}

async function gridTask(files, options) {
  needCanvas(); validateFiles(files, 'image');
  if (files.length !== 1) fail('请选择一张图片');
  const rows = Number(options.rows), columns = Number(options.columns);
  if (![rows, columns].every(value => Number.isInteger(value) && value >= 1 && value <= 10) || rows * columns < 2) fail('请设置 1–10 行、1–10 列，至少切成 2 块');
  const image = await readImage(files[0]);
  const entries = {}, base = safeBase(files[0].name), listing = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const left = Math.round(column * image.width / columns), top = Math.round(row * image.height / rows);
    const width = Math.round((column + 1) * image.width / columns) - left, height = Math.round((row + 1) * image.height / rows) - top;
    const tile = new OffscreenCanvas(width, height);
    tile.getContext('2d').drawImage(image.canvas, left, top, width, height, 0, 0, width, height);
    const output = await encode(tile, image.mime), name = `${base}-${row + 1}-${column + 1}.${extension(output.mime)}`;
    entries[name] = output.bytes; listing.push(`${name}：${width} × ${height}`);
  }
  const zip = zipSync(entries, { level: 0 });
  return { summary: `已切成 ${rows} 行 × ${columns} 列，共 ${rows * columns} 张`, files: [resultFile(`${base}-宫格切图.zip`, 'application/zip', zip)], listing };
}

const qrLevels = ['L', 'M', 'Q', 'H'];
/** 生成二维码矩阵；按 UTF-8 编码中文等任意文字。 */
export function qrMatrix(text, level = 'M') {
  if (typeof text !== 'string' || !text.length) fail('请输入二维码内容');
  if (new TextEncoder().encode(text).length > 2000) fail('二维码内容过长，请控制在 2000 字节以内');
  if (!qrLevels.includes(level)) fail('请选择有效的容错等级');
  qrcode.stringToBytes = value => Array.from(new TextEncoder().encode(value));
  const code = qrcode(0, level); code.addData(text, 'Byte'); code.make();
  const count = code.getModuleCount();
  return { count, dark: (row, column) => code.isDark(row, column) };
}
export function qrSvg(matrix, margin = 4) {
  const size = matrix.count + margin * 2; let path = '';
  for (let row = 0; row < matrix.count; row++) for (let column = 0; column < matrix.count; column++) if (matrix.dark(row, column)) path += `M${column + margin} ${row + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
async function qrPng(matrix, pixels, margin = 4) {
  const size = matrix.count + margin * 2, scale = Math.max(1, Math.floor(pixels / size)), canvas = new OffscreenCanvas(size * scale, size * scale), context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#000';
  for (let row = 0; row < matrix.count; row++) for (let column = 0; column < matrix.count; column++) if (matrix.dark(row, column)) context.fillRect((column + margin) * scale, (row + margin) * scale, scale, scale);
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}
const qrName = (text, index) => `${String(index + 1).padStart(3, '0')}-${text.replace(/[<>:"/\\|?*\x00-\x1f\s]/g, '_').slice(0, 40) || '二维码'}`;

async function qrTask(tool, files, options, text) {
  if (tool === 'qr-read') {
    needCanvas(); validateFiles(files, 'image');
    const listing = [], found = [];
    for (const file of files) {
      const image = await readImage(file);
      const pixels = image.context.getImageData(0, 0, image.width, image.height);
      const code = jsQR(pixels.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
      listing.push(`${file.name}：${code ? code.data : '未识别到二维码'}`);
      if (code) found.push(code.data);
    }
    if (!found.length) fail('没有在图片中识别到二维码，请换一张更清晰、二维码更完整的图片');
    const bytes = new TextEncoder().encode(found.join('\n'));
    return { summary: `识别到 ${found.length} 个二维码`, files: [resultFile('二维码识别结果.txt', 'text/plain;charset=utf-8', bytes)], listing };
  }
  needCanvas();
  const size = Math.round(Number(options.size) || 512), level = options.level || 'M';
  if (size < 128 || size > 2048) fail('图片尺寸为 128–2048 像素');
  if (tool === 'qr-make') {
    const matrix = qrMatrix(text.trim(), level);
    return { summary: `二维码 ${matrix.count} × ${matrix.count} 模块，容错等级 ${level}`, files: [resultFile('二维码.png', 'image/png', await qrPng(matrix, size)), resultFile('二维码.svg', 'image/svg+xml', new TextEncoder().encode(qrSvg(matrix)))], listing: [] };
  }
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) fail('请每行输入一条二维码内容');
  if (lines.length > 500) fail('一次最多批量生成 500 个二维码');
  const entries = {};
  for (const [index, line] of lines.entries()) entries[`${qrName(line, index)}.png`] = await qrPng(qrMatrix(line, level), size);
  return { summary: `已生成 ${lines.length} 个二维码`, files: [resultFile('批量二维码.zip', 'application/zip', zipSync(entries, { level: 0 }))], listing: lines.map((line, index) => `${qrName(line, index)}.png：${line}`) };
}

/** 主线程已解码为 PCM；这里只负责编码成 MP3 或 WAV。 */
export function encodeWav(channels, sampleRate) {
  const frames = channels[0].length, count = channels.length, buffer = new ArrayBuffer(44 + frames * count * 2), view = new DataView(buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * count * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, count, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true); view.setUint16(32, count * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * count * 2, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < count; c++) { view.setInt16(offset, Math.max(-1, Math.min(1, channels[c][i])) * 0x7fff, true); offset += 2; }
  return new Uint8Array(buffer);
}
const toInt16 = samples => { const output = new Int16Array(samples.length); for (let i = 0; i < samples.length; i++) output[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff; return output; };
export function encodeMp3(channels, sampleRate, kbps) {
  const encoder = new Mp3Encoder(channels.length, sampleRate, kbps), pcm = channels.map(toInt16), parts = [];
  for (let i = 0; i < pcm[0].length; i += 1152) {
    const chunk = encoder.encodeBuffer(pcm[0].subarray(i, i + 1152), pcm[1]?.subarray(i, i + 1152));
    if (chunk.length) parts.push(new Uint8Array(chunk));
  }
  const tail = encoder.flush(); if (tail.length) parts.push(new Uint8Array(tail));
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
function audioTask(options) {
  const { pcm, format, name } = options || {};
  if (!pcm || !Array.isArray(pcm.channels) || !pcm.channels.length || pcm.channels.length > 2 || pcm.channels.some(channel => !(channel instanceof Float32Array) || channel.length !== pcm.channels[0].length) || !Number.isInteger(pcm.sampleRate)) fail('音频解码结果无效，请重新选择文件');
  if (!pcm.channels[0].length) fail('所选时间段内没有音频');
  const seconds = pcm.channels[0].length / pcm.sampleRate;
  const kbps = [64, 128, 192, 320].includes(Number(options.bitrate)) ? Number(options.bitrate) : 128;
  const bytes = format === 'wav' ? encodeWav(pcm.channels, pcm.sampleRate) : encodeMp3(pcm.channels, pcm.sampleRate, kbps);
  if (bytes.length > LIMITS.output) fail('输出超过 100 MiB，请缩短时间段或改用 MP3');
  const mime = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
  return { summary: `${format === 'wav' ? 'WAV' : `MP3 ${kbps} kbps`} · ${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒 · ${pcm.channels.length === 2 ? '立体声' : '单声道'}`, files: [resultFile(`${safeBase(name || '音频')}.${format === 'wav' ? 'wav' : 'mp3'}`, mime, bytes)], listing: [] };
}

export const extraTools = Object.freeze(['image-mosaic', 'image-inpaint', 'image-grid', 'qr-make', 'qr-batch', 'qr-read', 'audio-encode']);
export async function extraTask(tool, files, options = {}, text = '') {
  if (tool === 'image-mosaic' || tool === 'image-inpaint') return imageRegionTask(tool, files, options);
  if (tool === 'image-grid') return gridTask(files, options);
  if (tool.startsWith('qr-')) return qrTask(tool, files, options, text);
  if (tool === 'audio-encode') return audioTask(options);
  fail('未知工具');
}
