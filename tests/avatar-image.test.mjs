import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { assertAvatarDimensions, parseAvatarData, readAvatarFile } from '../src/avatar-image.js';
import { ExpertStore, validateAvatar } from '../features/experts/store.js';

async function picture(width, height, format = 'png') {
  const bytes = await sharp({ create: { width, height, channels: 4, background: '#aabbcc' } })[format]().toBuffer();
  return `data:image/${format};base64,${bytes.toString('base64')}`;
}

test('统一头像尺寸严格拒收300、零值和非整数，299可用', () => {
  assertAvatarDimensions(299, 299);
  for (const size of [[300, 299], [299, 300], [300, 300], [0, 20], [20, 0], [NaN, 20], [2.5, 20]]) assert.throws(() => assertAvatarDimensions(...size), /小于 300/);
});

test('三种格式完整解码和规范化；越界、格式伪造与截断拒收', async () => {
  for (const format of ['png', 'jpeg', 'webp']) {
    const result = await validateAvatar(await picture(299, 299, format)); assert.match(result, /^data:image\/png;base64,/);
    for (const [width, height] of [[300, 1], [1, 300], [300, 300]]) await assert.rejects(validateAvatar(await picture(width, height, format)), /小于 300/);
  }
  const png = await picture(10, 10); await assert.rejects(validateAvatar(png.replace('image/png', 'image/jpeg')), /格式不匹配/);
  await assert.rejects(validateAvatar('data:image/jpeg;base64,/9j/2Q=='), /图像检查/);
  assert.throws(() => parseAvatarData('data:image/svg+xml;base64,PHN2Zz4='));
  assert.throws(() => parseAvatarData('data:image/png;base64,AB=='), /规范图像/);
});

test('专家历史大头像原字节保留，改名可保存，新增或替换头像遵守新边界', async () => {
  const legacy = await picture(400, 400);
  const id = 'custom-a3dd159e-ad36-47ee-b0fb-f59fcd0518e6';
  const original = { id, revision: 1, builtin: false, deleted: false, name: '专家', description: '说明', avatar: legacy, prompt: '提示词', model: null, skills: [], mcpServers: [] };
  const records = new Map([[id, original]]);
  const table = { get: key => records.get(key), keys: () => records.keys(), async put(key, value) { records.set(key, value); }, async update(key, fn) { records.set(key, fn(records.get(key))); } };
  const store = new ExpertStore({ table: () => table }, 100);
  const fields = { name: '新名字', description: '说明', avatar: legacy, prompt: '提示词', model: null, skills: [], mcpServers: [] };
  const saved = await store.save({ id, expectedRevision: 1, expert: fields }); assert.equal(saved.expert.avatar, legacy); assert.equal(saved.expert.name, '新名字');
  await assert.rejects(store.save({ id, expectedRevision: 2, expert: { ...fields, avatar: await picture(300, 2) } }), /小于 300/);
  assert.equal(store.get(id).avatar, legacy); assert.equal(store.get(id).revision, 2);
  await assert.rejects(store.save({ expectedRevision: 0, expert: fields }));
  const cleared = await store.save({ id, expectedRevision: 2, expert: { ...fields, avatar: null } }); assert.equal(cleared.expert.avatar, null);
});

test('浏览器读图检查300边界并在成功失败取消时关闭bitmap', async t => {
  const png = await picture(1, 1); let closes = 0, width = 299;
  const originalReader = globalThis.FileReader, originalBitmap = globalThis.createImageBitmap;
  t.after(() => { globalThis.FileReader = originalReader; globalThis.createImageBitmap = originalBitmap; });
  globalThis.FileReader = class { readAsDataURL() { this.result = png; queueMicrotask(() => this.onload()); } abort() { this.onabort(); } };
  globalThis.createImageBitmap = async () => ({ width, height: 299, close() { closes++; } });
  assert.equal(await readAvatarFile({ type: 'image/png', size: 100 }), png); assert.equal(closes, 1);
  width = 300; await assert.rejects(readAvatarFile({ type: 'image/png', size: 100 }), /小于 300/); assert.equal(closes, 2);
  const controller = new AbortController();
  globalThis.createImageBitmap = async () => { controller.abort(new Error('取消解码')); return { width: 1, height: 1, close() { closes++; } }; };
  await assert.rejects(readAvatarFile({ type: 'image/png', size: 100 }, { signal: controller.signal }), /取消解码/); assert.equal(closes, 3);
});
