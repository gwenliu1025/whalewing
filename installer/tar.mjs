import { gunzipSync } from 'node:zlib';
import path from 'node:path';

/** 读取 npm pack 生成的 .tgz：支持 ustar 前缀与 pax 长路径，只接受普通文件和目录，拒绝越界路径。 */
export function readTgz(bytes) {
  const tar = gunzipSync(bytes), entries = [];
  const text = (offset, length) => { const raw = tar.subarray(offset, offset + length); const end = raw.indexOf(0); return raw.subarray(0, end < 0 ? length : end).toString('utf8'); };
  const octal = (offset, length) => parseInt(text(offset, length).trim() || '0', 8);
  let pax = null;
  for (let offset = 0; offset + 512 <= tar.length;) {
    if (tar.subarray(offset, offset + 512).every(byte => byte === 0)) break;
    const size = octal(offset + 124, 12), type = String.fromCharCode(tar[offset + 156] || 48);
    const prefix = text(offset + 345, 155), name = text(offset + 0, 100);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') { pax = Object.fromEntries(body.toString('utf8').split('\n').filter(Boolean).map(record => record.slice(record.indexOf(' ') + 1)).map(record => [record.slice(0, record.indexOf('=')), record.slice(record.indexOf('=') + 1)])); continue; }
    if (type === 'g') continue;
    const file = (pax?.path ?? (prefix ? `${prefix}/${name}` : name)).replace(/\\/g, '/');
    pax = null;
    const normalized = path.posix.normalize(file);
    if (normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) throw new Error(`插件包含越界路径：${file}`);
    if (type === '0' || type === '\0') entries.push({ path: normalized, type: 'file', data: Buffer.from(body) });
    else if (type === '5') entries.push({ path: normalized.replace(/\/$/, ''), type: 'dir' });
    else throw new Error(`插件包含不支持的条目类型 ${type}：${file}`);
  }
  return entries;
}
