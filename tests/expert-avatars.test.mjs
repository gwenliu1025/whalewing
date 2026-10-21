import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { expertAvatarIds, presetAvatarIds, loadExpertAvatars } from '../src/expert-avatars.js';
import { renderAvatar, avatarSize } from '../scripts/avatars.mjs';
import { roles } from '../content/roles.js';

// 分发门（content.test.mjs）消费这里的批准指纹；更换头像须同时更新。
const approvedAvatars = {
  'development.webp': 'a5b8d0147c317875b11f400e5f3e9b10fee01ffe00883da106ba6c40eb2e5cbe',
  'implementation.webp': '535ef7d14c99bbf13f91aeeb1a1cffa1bf21a3fdf939e48cd07870af5276b001',
  'manager.webp': '8f0827f2e32054556ef501010f9bc88e50d4a01100a2a245403f0f07b3fae13e',
  'operations.webp': '1e939bef3001baa85a78b8f2fe6c4799396ac22c6a404bb5575194d6a5bd5e15',
  'presales.webp': 'f0c6f1793b9f4b7b21577c70f80aa327b8462c9ad78ef141ff03969e0fd5914c',
  'preset-01.webp': 'bb1ec291954d279170f39b658ddda0ba0aa8193ddd5a1f648a1202d7c0d321e2',
  'preset-02.webp': '072c91c259866e34aa07a384feb54956dcd388de1f6c28b25f3c8e726805ef06',
  'preset-03.webp': 'b85f7e0c017867a48074952e81648ce89bdb6a3ac55a578130789f4b14d865e1',
  'preset-04.webp': 'fd6d158de701eae40e2c9a0bc35219b5dd931991c87f5543453b66b9226c4bd7',
  'preset-05.webp': 'b126a1909e19d09c54e4abd292660f36085b36eba93627ef322051e6ea4e95ab',
  'preset-06.webp': '68798ee15d1d13df9066c86ce8bcbaa345a943f53ab4174c0d849cb4bb17d43f',
  'preset-07.webp': '83f4ae96c898933b07b9e911ada0d85206865ad2ecd727a29d941fe9515c4b39',
  'preset-08.webp': 'f0b4bda52d6ecdc88a259e2108809f41658df3235bbf7588fdb2c592bf31e400',
  'preset-09.webp': '68767d28825238bb7f62e0ae1f8d3e6dd35729d37302704d2083e0fdc4a6553a',
  'preset-10.webp': '5f776b3c38d09bbecebe00eeb8cc0c323b1d33d7e3801b760878ad7e103cac91',
  'preset-11.webp': 'f96828a89a39a87bf2094f3d71caf8abb9407f0e3f0fcfc5206c2657ca8f2e70',
  'preset-12.webp': 'b5af1cf6248128d95f6a3944250ff5943bb1db5a6247a7a6acb80359b2e3d2b5',
  'requirements.webp': '4c21355c5269ee19f01080de9d6b1382d1e8d85f8d1acbae3b7370a5e79ee073',
  'testing.webp': 'f239778da98e4d942c59ed0b23b0011236949ae6bbb5dd79f9838e8244d9b2a9',
};

test('每位内置专家都有原创头像，另有 12 个预置头像供自定义专家选用', () => {
  assert.deepEqual([...expertAvatarIds].sort(), roles.map(role => role.id).sort());
  assert.equal(presetAvatarIds.length, 12);
  assert.deepEqual(Object.keys(approvedAvatars).sort(), [...expertAvatarIds, ...presetAvatarIds].map(id => `${id}.webp`).sort());
});

test('随包头像与批准指纹一致，尺寸低于专家头像上限，可由原图确定性重建', async () => {
  const avatars = loadExpertAvatars(); let total = 0;
  for (const [id, dataUrl] of Object.entries(avatars)) {
    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64'); total += bytes.length;
    assert.equal(createHash('sha256').update(bytes).digest('hex'), approvedAvatars[`${id}.webp`], id);
    const meta = await sharp(bytes).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['webp', avatarSize, avatarSize]);
    assert.ok(avatarSize < 300, '专家头像要求边长小于 300 像素');
    assert.deepEqual(await renderAvatar(fileURLToPath(new URL(`../art/avatars/${id}.webp`, import.meta.url))), bytes, id);
  }
  assert.ok(total < 300 * 1024);
  assert.ok(readFileSync(new URL('../content/avatars/manager.webp', import.meta.url)).length > 0);
});
