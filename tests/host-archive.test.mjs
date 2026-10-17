import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptArchive, inspectArchive } from '../host-adapter/archive.mjs';
import { readRuntime, transformFiles, PROGRAM_FILES } from '../host-adapter/adapter.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
// 直接消费无外部依赖的官方实现，不加载缺少 minimatch 的 ASAR 顶层入口。
const official = path.join(root, 'node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar/lib');
const { Pickle } = require(path.join(official, 'pickle.js'));
const { getFileIntegrity } = require(path.join(official, 'integrity.js'));
const baseline = await readRuntime(process.env.WHALEWING_HOST_ADAPTER_BASELINE ?? path.join(root, '.artifacts/youjin-first-version/runtime'));
const output = transformFiles(baseline).files;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function encode(header, content) {
  const headerPickle = Pickle.createEmpty();
  headerPickle.writeString(JSON.stringify(header));
  const packed = headerPickle.toBuffer();
  const size = Pickle.createEmpty();
  size.writeUInt32(packed.length);
  return Buffer.concat([size.toBuffer(), packed, content]);
}

function insert(header, file, node) {
  const segments = file.split('/');
  let tree = header.files;
  for (const segment of segments.slice(0, -1)) {
    tree[segment] ??= { files: {} };
    tree = tree[segment].files;
  }
  tree[segments.at(-1)] = node;
}

async function fixture() {
  const header = { files: {}, extraRootMetadata: { retained: true } };
  const contents = [];
  let offset = 0;
  for (const [file, bytes] of baseline) {
    const node = { size: bytes.length, offset: String(offset), integrity: await getFileIntegrity(Readable.from([bytes])) };
    insert(header, `dsh/${file}`, node);
    contents.push(bytes);
    offset += bytes.length;
  }
  const unchanged = Buffer.from('保留原程序与自定义元数据\0\xff', 'utf8');
  insert(header, 'unchanged.txt', { size: unchanged.length, offset: String(offset), executable: true, integrity: await getFileIntegrity(Readable.from([unchanged])), custom: { source: 'fixture' } });
  contents.push(unchanged);
  offset += unchanged.length;
  insert(header, 'empty.txt', { size: 0, offset: String(offset), integrity: await getFileIntegrity(Readable.from([])) });
  insert(header, 'native/module.node', { size: 77, unpacked: true, executable: true, custom: 'sidecar 不访问' });
  insert(header, 'alias', { link: 'unchanged.txt', custom: { preserved: 1 } });
  return encode(header, Buffer.concat(contents));
}

function mutate(bytes, change) {
  const parsed = inspectArchive(bytes);
  change(parsed.header, parsed.entries);
  return encode(parsed.header, bytes.subarray(parsed.payloadOffset));
}

async function compareArchive(before, after) {
  const old = inspectArchive(before);
  const next = inspectArchive(after);
  assert.deepEqual([...next.entries.keys()], [...old.entries.keys()]);
  const targets = new Set(PROGRAM_FILES.map(file => 'dsh/' + file));
  let changed = 0;
  for (const [file, entry] of old.entries) {
    const actual = next.entries.get(file);
    if (targets.has(file)) {
      assert.deepEqual(actual.bytes, output.get(file.slice(4)), file);
      assert.deepEqual(actual.node.integrity, await getFileIntegrity(Readable.from([actual.bytes])), file);
      assert.deepEqual({ ...actual.node, size: entry.node.size, offset: entry.node.offset, integrity: entry.node.integrity }, entry.node, file);
      changed++;
    } else {
      if (entry.bytes) assert.deepEqual(actual.bytes, entry.bytes, file);
      if (entry.node.files) assert.deepEqual({ ...actual.node, files: undefined }, { ...entry.node, files: undefined }, file);
      else assert.deepEqual(entry.bytes ? { ...actual.node, offset: entry.node.offset } : actual.node, entry.node, file);
    }
  }
  assert.equal(changed, PROGRAM_FILES.length);
  assert.deepEqual({ ...next.header, files: undefined }, { ...old.header, files: undefined });
}

test('官方Pickle合成包适配保留全部非目标字节、元数据、link与unpacked', async () => {
  const input = await fixture();
  const hash = digest(input);
  const result = adaptArchive(input);
  assert.equal(digest(input), hash, '输入 Buffer 不得修改');
  const headerSize = Pickle.createFromBuffer(result.subarray(0, 8)).createIterator().readUInt32();
  const officialHeader = JSON.parse(Pickle.createFromBuffer(result.subarray(8, 8 + headerSize)).createIterator().readString());
  assert.deepEqual(officialHeader, inspectArchive(result).header);
  await compareArchive(input, result);
  assert.deepEqual(adaptArchive(result), result, '完整已适配包幂等');
});

test('严格拒收Pickle长度、padding、UTF8和header错误', async () => {
  const input = await fixture();
  for (const corrupt of [
    b => b.writeUInt32LE(8, 0),
    b => b.writeUInt32LE(0xffffffff, 4),
    b => b.writeUInt32LE(1, 8),
    b => b.writeUInt32LE(0x80000000, 12),
    b => { b[16] = 0xff; },
  ]) {
    const damaged = Buffer.from(input);
    corrupt(damaged);
    assert.throws(() => adaptArchive(damaged), /ASAR/);
  }
  const padded = encode({ files: {}, a: 'xx' }, Buffer.alloc(0));
  if (padded.readUInt32LE(12) % 4 === 0) throw new Error('测试必须实际覆盖 padding');
  padded[padded.length - 1] = 1;
  assert.throws(() => inspectArchive(padded), /padding/);
  assert.throws(() => inspectArchive(encode({ unknown: 1 }, Buffer.alloc(0))), /files/);
});

test('拒收packed重叠、间隙、越界、非法尺寸和未归属payload', async () => {
  const input = await fixture();
  const file = 'dsh/' + PROGRAM_FILES[0];
  for (const values of [{ offset: '0' }, { offset: '-1' }, { offset: '9007199254740992' }, { size: -1 }, { size: 0.5 }, { size: input.length }]) {
    assert.throws(() => adaptArchive(mutate(input, (_header, entries) => Object.assign(entries.get(file).node, values))), /ASAR/);
  }
  assert.throws(() => adaptArchive(Buffer.concat([input, Buffer.from([0])])), /未归属/);
});

test('目标缺失、unpacked、link和失真integrity均拒收', async () => {
  const input = await fixture();
  const file = 'dsh/' + PROGRAM_FILES.at(-1);
  for (const modify of [
    node => { node.integrity.hash = '0'.repeat(64); },
    node => { node.integrity.blocks = []; },
    node => { node.integrity.algorithm = 'SHA1'; },
    node => { node.integrity.blockSize = 1024; },
    node => { node.unpacked = true; },
    node => { node.link = 'unchanged.txt'; },
  ]) assert.throws(() => adaptArchive(mutate(input, (_header, entries) => modify(entries.get(file).node))));
  assert.throws(() => adaptArchive(encode({ files: {} }, Buffer.alloc(0))), /缺失/);
});

test('版本与目标文件哈希仍由唯一adapter拒收', async () => {
  const input = await fixture();
  const parsed = inspectArchive(input);
  const packageFile = parsed.entries.get('dsh/package.json');
  const wrongVersion = Buffer.from(input);
  const packageText = packageFile.bytes.toString();
  const changed = Buffer.from(packageText.replace('0.2.0-rc.2', '0.2.0-rc.9'));
  assert.equal(changed.length, packageFile.bytes.length);
  changed.copy(wrongVersion, parsed.payloadOffset + packageFile.start);
  assert.throws(() => adaptArchive(wrongVersion), /版本/);
  const changedContent = Buffer.from(input);
  const file = 'dsh/' + PROGRAM_FILES[0];
  const entry = parsed.entries.get(file);
  changedContent[parsed.payloadOffset + entry.start] ^= 1;
  const modified = changedContent.subarray(parsed.payloadOffset + entry.start, parsed.payloadOffset + entry.end);
  const integrity = await getFileIntegrity(Readable.from([modified]));
  const forged = mutate(changedContent, (_header, entries) => { entries.get(file).node.integrity = integrity; });
  assert.throws(() => adaptArchive(forged), /哈希/);
});

test('实际integrity实现与官方空文件及4MiB边界逐块一致', async () => {
  const source = await readFile(new URL('../host-adapter/archive.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function integrityOf(');
  const end = source.indexOf('\nfunction verifyTargetIntegrity', start);
  const integrity = vm.runInNewContext(`(${source.slice(start, end).trim()})`, { sha256: digest });
  for (const size of [0, 1, 4194304, 4194305]) {
    const bytes = Buffer.alloc(size, 0x61);
    const actual = JSON.parse(JSON.stringify(integrity(bytes, 4194304)));
    const expected = await getFileIntegrity(Readable.from([bytes]));
    assert.deepEqual(actual, { hash: expected.hash, blocks: expected.blocks }, String(size));
  }
});

test('可选真实原包只读适配与逐文件对比', { skip: !process.env.WHALEWING_TEST_ASAR }, async () => {
  // 此开关仅供主线程重型验证，不写原包、sidecar 或任何 stage 文件。
  const input = await readFile(process.env.WHALEWING_TEST_ASAR);
  const before = digest(input);
  const adapted = adaptArchive(input);
  await compareArchive(input, adapted);
  assert.equal(digest(input), before);
  assert.deepEqual(adaptArchive(adapted), adapted);
});
