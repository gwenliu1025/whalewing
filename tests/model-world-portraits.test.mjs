import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { modelWorldPortraitFiles, loadModelWorldPortraits } from '../src/model-world-portraits.js';
import { modelWorldVendorIds, modelWorldPortraitIds, portraitIdFor } from '../src/model-world-roster.js';
import { renderPortrait, portraitSize, cutout } from '../scripts/portraits.mjs';

const directory = new URL('../content/model-world/portraits/', import.meta.url);
const originals = new URL('../art/model-world/', import.meta.url);
// 分发门（content.test.mjs）消费这里的批准指纹；更换立绘须同时更新。
const approvedThumbnails = {
  'openai.webp': '36e99f503dd1a018dfe0a9e25ed45aefadd2f51b0b9640d0993cd288d642461c',
  'anthropic.webp': 'fe2b9ba92da14b9d95708d706fd048a074045194d464e4a0d821b29cf561fba2',
  'google.webp': 'b9e750d7d0d3a4099cfea839ce8c23dfc7c3622bd820d60fb65e4c13f832b282',
  'deepseek.webp': '57e057940710d3b53357335e3739f8ed08cce4ed7869510ab34befc38027734a',
  'alibaba.webp': '2be26bbac0040407f23a8aa7c1eee4723730072d55fede6183851e408c3e798f',
  'moonshotai.webp': 'de449400c533a52d98e4860e6717eb328cc01b3355ce758cd7a742a535208c5f',
  'zhipuai.webp': '042da59b25abeca0fd07eef2923d5b1c44ede16ea20224204cd6095631723c0e',
  'bytedance-seed.webp': 'ff2900fca933c4057d5c7be6f4eaa1ea88eead79f1ecae0aba976729261077d2',
  'minimax.webp': 'fd5646809e871b4cb09ee399f6c049e7867fb4bea0575a5b7d75e3b98c92f711',
  'tencent.webp': '190bd97640010fddec3b8cae9ee23405a64f4156fb0df28579d338acd4616c40',
  'baidu.webp': 'ac5ab4d7304f6e2b3e01ed90c6cc65c126f1d6c6299276002249c778687f5877',
  'xiaomi.webp': 'c5259d5f6e96d24f83ba2abe3a342120f77af8a3222d07d8294e9c464e317532',
  'meituan.webp': 'cc32249e10b749367fc44839d41bd488347d874cd70870319f203a3538364318',
  'stepfun.webp': 'ba76caa5493c3014876ee57d9502643cb87f7cad385568613a2e474c20b25b93',
  'xai.webp': 'a03421cbef2063cbcad3295d8de26e714f26c7dc79886e4a08c176fa4faa3416',
  'meta.webp': '9d9168f955b5e75de1235c7efd4a0339d9acdbfca8f6d8820ae9753ed115cf1a',
  'mistral.webp': 'bf6dbf27e0f5bf4aa33f5efc6feaa715dbbd2747548adad26ebe3aae0ca85f1c',
  'perplexity.webp': '33311bd8c78d345fa066397c223b2d04106c3fe95638cb879bd70ce5d6d1e6ad',
  'deepseek-flash.webp': 'b01df64a7481fe656d2589989ce2c3812bb04f5feba0e8e6a5d1ecf959cee7aa',
};

test('收录名单与立绘一一对应：含小米、美团、阶跃星辰，DeepSeek 按系列区分姐妹形象', () => {
  assert.equal(new Set(modelWorldVendorIds).size, modelWorldVendorIds.length);
  assert.deepEqual(modelWorldPortraitFiles, Object.fromEntries(modelWorldPortraitIds.map(id => [id, `${id}.webp`])));
  assert.deepEqual(Object.keys(approvedThumbnails).sort(), Object.values(modelWorldPortraitFiles).sort());
  for (const id of ['baidu', 'tencent', 'bytedance-seed', 'xiaomi', 'meituan', 'stepfun']) assert.ok(modelWorldVendorIds.includes(id), id);
  assert.equal(modelWorldVendorIds.includes('kwaipilot'), false);
  assert.equal(portraitIdFor('deepseek', 'deepseek/deepseek-v4-flash'), 'deepseek-flash');
  assert.equal(portraitIdFor('deepseek', 'deepseek/deepseek-v4-pro'), 'deepseek');
  assert.equal(portraitIdFor('openai', 'openai/gpt-flash-x'), 'openai', '系列规则只作用于所属厂商');
});

test('客户端只带入批准的等比 WebP 缩略图，尺寸与总载荷有界', async () => {
  const images = loadModelWorldPortraits(); let total = 0;
  for (const [id, dataUrl] of Object.entries(images)) {
    assert.match(dataUrl, /^data:image\/webp;base64,/);
    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64'); total += bytes.length;
    assert.equal(createHash('sha256').update(bytes).digest('hex'), approvedThumbnails[modelWorldPortraitFiles[id]], id);
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.format, 'webp');
    assert.ok(meta.width <= portraitSize.width && meta.height <= portraitSize.height, id);
    assert.ok(meta.width >= 240, `${id} 分辨率足够高清显示`);
  }
  assert.ok(total < 600 * 1024);
});

test('缩略图可由仓库内原图确定性重建，白底已抠成透明', async () => {
  for (const id of modelWorldPortraitIds) {
    const rebuilt = await renderPortrait(fileURLToPath(new URL(`${id}.webp`, originals)));
    assert.deepEqual(rebuilt, readFileSync(new URL(`${id}.webp`, directory)), id);
    const corner = await sharp(rebuilt).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.equal(corner[3], 0, `${id} 左上角应为透明背景`);
  }
});

test('抠图只清除与边缘连通的白底，角色内部被线条围住的白色保留', () => {
  // 5×5：外圈白底，中间一圈深色线条围住中心白点。
  const w = 5, h = 5, data = new Uint8Array(w * h * 4).fill(255);
  for (const [x, y] of [[1,1],[2,1],[3,1],[1,2],[3,2],[1,3],[2,3],[3,3]]) data.set([20, 20, 20, 255], (y * w + x) * 4);
  cutout(data, w, h);
  assert.equal(data[3], 0, '边缘白底透明'); assert.equal(data[(2 * w + 2) * 4 + 3], 255, '被围住的白色保留');
});

test('立绘声明作者署名与 CC BY-NC-SA 4.0、商用另行授权、标识商标归属，不写入本机路径', () => {
  const notice = readFileSync(new URL('NOTICE.md', directory), 'utf8');
  assert.match(notice, /原创设计/); assert.match(notice, /商标权归各厂商所有/); assert.match(notice, /非官方/); assert.match(notice, /不裁剪、不重绘/);
  assert.match(notice, /© 2026 鲸翼 WhaleWing 作者/); assert.match(notice, /CC BY-NC-SA 4\.0/); assert.match(notice, /商用授权/); assert.match(notice, /不算商业性使用/);
  assert.doesNotMatch(notice, /ZipZipPipe|ApprenTice|仅限公司内部使用/, '立绘是原创，不再引用社区作品');
  assert.doesNotMatch(notice, /(^|[^A-Za-z])[A-Za-z]:[\\/]/);
});
