import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import sharp from 'sharp';
import { AiWebStore, aiWebDomain } from '../src/ai-web-store.js';
import { aiWebEntries, aiWebContract, findAiWebEntries, openAiWebsite } from '../src/utilities/ai-web.js';
import { aiWebIcons } from '../src/utilities/ai-web-icons.js';

const id = 'custom-85e1008c-acfe-4fea-956c-d402ccf2be67';
const entry = { name: '办公助手', url: 'https://example.com/chat', description: '', avatar: null };
const save = (revision = 0, fields = entry) => ({ action: 'save', id, expectedRevision: revision, entry: fields });
async function open(root) {
  const ctx = new Context();
  await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root }); await ctx.plugin(StorageDomain, { backend: 'json' });
  return { ctx, store: new AiWebStore(await ctx.storageDomain.open(aiWebDomain)) };
}
async function harness(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whalewing-ai-web-'));
  const h = await open(root); t.after(async () => { await h.ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); });
  return { ...h, root };
}

test('十个官方图标离线解码，官方来源齐全且宽高小于300', async () => {
  for (const entry of aiWebEntries) {
    const source = aiWebIcons[entry.id];
    assert.equal(source.data, entry.avatar); assert.equal(entry.builtin, true);
    assert.match(source.page, /^https:\/\//); assert.match(source.source, /^https:\/\//); assert.match(source.sourceSha256, /^[a-f0-9]{64}$/);
    const image = sharp(Buffer.from(entry.avatar.split(',')[1], 'base64'));
    const metadata = await image.metadata(); assert.ok(metadata.width < 300 && metadata.height < 300);
    await image.raw().toBuffer();
  }
});

test('自定义仅名字网址必填，HTTP/HTTPS规范化，拒收脚本文件凭据地址', () => {
  const { input } = aiWebContract(z);
  const value = input.parse(save(0, { name: ' 名字 ', url: 'https://EXAMPLE.com' }));
  assert.deepEqual(value.entry, { name: '名字', url: 'https://example.com/', description: '', avatar: null });
  assert.equal(input.parse(save(0, { name: '本地AI', url: 'http://127.0.0.1:8000/' })).entry.url, 'http://127.0.0.1:8000/');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///C:/a.html', 'https://name:pass@example.com/', 'not a URL', 'https://example.com/ a']) assert.equal(input.safeParse(save(0, { ...entry, url })).success, false);
  assert.equal(input.safeParse(save(0, { ...entry, name: ' ' })).success, false);
});

test('添加编辑删除经过真实JSON存储，服务重启持久读回且默认入口不可删除', async t => {
  const h = await harness(t);
  const created = await h.store.manage(save()); assert.equal(created.entries.length, 11);
  const custom = created.entries.find(item => item.id === id); assert.equal(custom.revision, 1); assert.equal(custom.avatar, null);
  assert.deepEqual(findAiWebEntries('办公助手', created.entries).map(item => item.id), [id]);
  const urls = []; await openAiWebsite(id, url => urls.push(url), undefined, created.entries); assert.deepEqual(urls, [entry.url]);
  await h.store.manage(save(1, { ...entry, name: '新名字', description: '选填说明' }));
  await h.ctx.fiber.dispose();
  const restarted = await open(h.root); t.after(() => restarted.ctx.fiber.dispose());
  assert.equal(restarted.store.list().entries.find(item => item.id === id).name, '新名字');
  assert.equal(restarted.store.list().entries.find(item => item.id === id).revision, 2);
  await assert.rejects(restarted.store.manage({ action: 'remove', id: 'deepseek', expectedRevision: 0 }), error => error.code === 'AI_WEB_BUILTIN');
  await assert.rejects(restarted.store.manage(save(1)), error => error.code === 'CONFLICT');
  assert.equal((await restarted.store.manage({ action: 'remove', id, expectedRevision: 2 })).entries.length, 10);
  await restarted.ctx.fiber.dispose();
  const again = await open(h.root); t.after(() => again.ctx.fiber.dispose()); assert.equal(again.store.list().entries.length, 10);
});

test('并发同版写只接受一次，写失败和取消保留原入口', async t => {
  const h = await harness(t); await h.store.manage(save());
  const result = await Promise.allSettled([h.store.manage(save(1, { ...entry, name: '甲' })), h.store.manage(save(1, { ...entry, name: '乙' }))]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(result.find(item => item.status === 'rejected').reason.code, 'BUSY');
  const previous = h.store.list(); const put = h.store.table.put;
  h.store.table.put = async () => { throw new Error('持久写失败'); };
  await assert.rejects(h.store.manage(save(2)), /持久写失败/); h.store.table.put = put;
  assert.deepEqual(h.store.list(), previous);
  const controller = new AbortController(); controller.abort(new Error('取消'));
  await assert.rejects(h.store.manage({ action: 'remove', id, expectedRevision: 2 }, controller.signal), /取消/);
  assert.deepEqual(h.store.list(), previous);
});

test('自定义入口拒收300像素头像，原配置持久不变', async t => {
  const h = await harness(t); await h.store.manage(save());
  const bytes = await sharp({ create: { width: 300, height: 2, channels: 4, background: '#aabbcc' } }).png().toBuffer();
  await assert.rejects(h.store.manage(save(1, { ...entry, avatar: `data:image/png;base64,${bytes.toString('base64')}` })), /小于 300/);
  assert.equal(h.store.list().entries.find(item => item.id === id).avatar, null);
  assert.equal(h.store.list().entries.find(item => item.id === id).revision, 1);
});
