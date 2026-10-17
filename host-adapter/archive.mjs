import { createHash } from 'node:crypto';
import { PROGRAM_FILES, VERSION_FILES, transformFiles } from './adapter.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(`ASAR 适配拒收：${message}`); };

/**
 * 读取 Electron ASAR 的两层 Pickle，不加载依赖文件或跟随 link。
 * 返回的字节视图只用于检查；调用方不得修改输入或返回的视图。
 */
export function inspectArchive(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 16) fail('缺少完整大小头');
  // 第一层只装一个 uint32；第二层装长度前缀的 UTF-8 JSON，并按四字节补零。
  const headerSize = bytes.readUInt32LE(4);
  if (bytes.readUInt32LE(0) !== 4 || headerSize < 8 || headerSize % 4 !== 0 || headerSize > bytes.length - 8) fail('Pickle 大小头不合法');
  const payloadSize = bytes.readUInt32LE(8);
  const jsonSize = bytes.readUInt32LE(12);
  if (payloadSize !== headerSize - 4 || jsonSize > 0x7fffffff || jsonSize > payloadSize - 4 || payloadSize - 4 - jsonSize > 3) fail('JSON Pickle 长度不匹配');
  const payloadOffset = 8 + headerSize;
  for (let i = 16 + jsonSize; i < payloadOffset; i++) if (bytes[i] !== 0) fail('Pickle padding 非零');
  let header;
  try { header = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(16, 16 + jsonSize))); }
  catch { fail('header 不是严格 UTF-8 JSON'); }
  if (!object(header) || !object(header.files)) fail('缺少根 files');
  const entries = new Map();
  const packed = [];
  const visit = (tree, parent, depth) => {
    if (depth > 256) fail('目录深度超出解析边界');
    for (const [name, node] of Object.entries(tree)) {
      if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name) || !object(node)) fail('非法目录项');
      const file = parent ? `${parent}/${name}` : name;
      entries.set(file, { node });
      if (Object.hasOwn(node, 'files')) {
        if (!object(node.files) || Object.hasOwn(node, 'link') || Object.hasOwn(node, 'offset') || Object.hasOwn(node, 'size')) fail(`目录元数据冲突：${file}`);
        visit(node.files, file, depth + 1);
      } else if (Object.hasOwn(node, 'link')) {
        if (typeof node.link !== 'string' || !node.link || node.link.includes('\0') || Object.hasOwn(node, 'offset')) fail(`link 不合法：${file}`);
      } else {
        if (!Number.isSafeInteger(node.size) || node.size < 0) fail(`size 不合法：${file}`);
        if (node.unpacked === true) {
          if (Object.hasOwn(node, 'offset')) fail(`unpacked 包含 offset：${file}`);
          continue;
        }
        if (node.unpacked !== undefined && node.unpacked !== false) fail(`unpacked 类型不合法：${file}`);
        if (typeof node.offset !== 'string' || !/^(0|[1-9]\d*)$/.test(node.offset)) fail(`offset 不合法：${file}`);
        const start = Number(node.offset);
        const end = start + node.size;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end > bytes.length - payloadOffset) fail(`packed 越界：${file}`);
        const entry = { node, start, end, file, bytes: bytes.subarray(payloadOffset + start, payloadOffset + end) };
        entries.set(file, entry);
        packed.push(entry);
      }
    }
  };
  visit(header.files, '', 0);
  // 相同 offset 的空文件先检查；不接受无法证明归属的间隙或尾随 payload。
  packed.sort((a, b) => a.start - b.start || a.node.size - b.node.size);
  let end = 0;
  for (const entry of packed) {
    if (entry.start !== end) fail(`packed 非连续或重叠：${entry.file}`);
    end = entry.end;
  }
  if (end !== bytes.length - payloadOffset) fail('存在未归属的 payload');
  return { header, entries, packed, payloadOffset };
}

function integrityOf(bytes, blockSize) {
  const blocks = [];
  // 官方 3.4.1 flush 总会写末块，大小恰为块整数倍时末块为空。
  for (let start = 0; start <= bytes.length; start += blockSize) {
    blocks.push(sha256(bytes.subarray(start, Math.min(start + blockSize, bytes.length))));
  }
  return { hash: sha256(bytes), blocks };
}

function verifyTargetIntegrity(file, entry) {
  const integrity = entry.node.integrity;
  if (!object(integrity) || integrity.algorithm !== 'SHA256' || integrity.blockSize !== 4194304 || !Array.isArray(integrity.blocks)) fail(`目标 integrity 格式不匹配：${file}`);
  const expected = integrityOf(entry.bytes, integrity.blockSize);
  if (integrity.hash !== expected.hash || integrity.blocks.length !== expected.blocks.length || integrity.blocks.some((value, i) => value !== expected.blocks[i])) fail(`目标 integrity 校验失败：${file}`);
}

function encodeHeader(header) {
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  if (json.length > 0x7fffffff) fail('JSON 超出 Pickle int32');
  const padding = (4 - json.length % 4) % 4;
  const size = json.length + padding + 8;
  if (size > 0xffffffff) fail('header 超出 Pickle uint32');
  const encoded = Buffer.alloc(size + 8);
  encoded.writeUInt32LE(4, 0);
  encoded.writeUInt32LE(size, 4);
  encoded.writeUInt32LE(size - 4, 8);
  encoded.writeUInt32LE(json.length, 12);
  json.copy(encoded, 16);
  return encoded;
}

/**
 * 纯 Buffer → Buffer 安装包转换。只修改 dsh 下的适配程序，不读写文件和 sidecar。
 * 版本、目标文件哈希和语义转换均由 adapter 的唯一规则持有；失败不产生部分输出。
 */
export function adaptArchive(bytes) {
  const archive = inspectArchive(bytes);
  const input = new Map();
  for (const file of [...VERSION_FILES, ...PROGRAM_FILES]) {
    const entry = archive.entries.get(`dsh/${file}`);
    if (!entry?.bytes) fail(`目标缺失、非 packed 或是 link：dsh/${file}`);
    input.set(file, entry.bytes);
  }
  for (const file of PROGRAM_FILES) verifyTargetIntegrity(file, archive.entries.get(`dsh/${file}`));
  const transformed = transformFiles(input);
  if (transformed.state === 'adapted') return Buffer.from(bytes);
  const parts = [];
  let offset = 0;
  for (const entry of archive.packed) {
    const replacement = entry.file.startsWith('dsh/') ? transformed.files.get(entry.file.slice(4)) : undefined;
    const content = replacement ?? entry.bytes;
    if (replacement) {
      entry.node.size = content.length;
      const integrity = integrityOf(content, entry.node.integrity.blockSize);
      entry.node.integrity = { ...entry.node.integrity, ...integrity };
    }
    entry.node.offset = String(offset);
    offset += content.length;
    if (!Number.isSafeInteger(offset)) fail('输出 payload 大小溢出');
    parts.push(content);
  }
  const encoded = encodeHeader(archive.header);
  return Buffer.concat([encoded, ...parts], encoded.length + offset);
}
