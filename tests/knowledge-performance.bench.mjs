import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Vault } from '../src/vault.js';

// 只生成合成办公笔记；计时覆盖真实文件读取、解析、关系与阅读响应，不含建库。
const results = [];
for (const count of [120, 600]) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-reading-bench-'));
  try {
    const vault = new Vault(path.join(directory, 'vault'));
    await vault.initialize();
    let bytes = 0;
    for (let i = 0; i < count; i++) {
      const body = Array.from({ length: 4 + i % 5 }, (_, j) => `## 工作事项 ${j}\n\n这是合成的企业信息系统实施记录，包含需求核对、测试验收、文档交付与后续改进。${'需要按照版本与事实核对结果。'.repeat(16)}\n\n|事项|进度|\n|---|---|\n|测试 ${j}|已完成|\n`).join('\n');
      const links = Array.from({ length: 6 }, (_, j) => `[[笔记${(i + j * 17 + 1) % count}]]`).join(' ');
      const content = `---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-12\nupdated: 2026-10-12\naliases: []\n---\n# 笔记${i}\n\n${body}\n${links}\n`;
      bytes += Buffer.byteLength(content);
      await fs.writeFile(path.join(vault.root, '40-知识', `笔记${i}.md`), content);
    }
    const samples = [];
    for (let i = 0; i < 4; i++) {
      const start = performance.now();
      const doc = await vault.document(`40-知识/笔记${i}.md`);
      samples.push(performance.now() - start);
      assert.equal(doc.links.length, 6);
      assert.equal(doc.totalBacklinks, 6);
      assert.equal(doc.relationsIssue, undefined);
    }
    global.gc?.();
    results.push({ count, bytes, samplesMs: samples, warmMedianMs: samples.slice(1).sort((a, b) => a - b)[1], heapUsed: process.memoryUsage().heapUsed });
  } finally {
    // 私有临时根由本脚本取得，绝不删除知识库或其他会话的目录。
    assert.ok(path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('whalewing-reading-bench-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
const source = await fs.readFile(new URL('../src/vault.js', import.meta.url));
console.log(JSON.stringify({ runtime: process.version, platform: process.platform, sourceHash: createHash('sha256').update(source).digest('hex'), endpoint: 'Vault.document 返回完整正文/view/links/backlinks；不含 RPC、React 和浏览器 paint', results }, null, 2));
