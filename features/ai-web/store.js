import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { aiWebContract } from './contract.js';
import { aiWebEntries } from './catalog.js';
import { validateAvatar } from '../experts/store.js';

const contract = aiWebContract(z);
export const aiWebDomain = defineDomain({ name: 'whalewing_ai_web', version: 1, tables: { entries: domainTable(contract.stored) } });
const fail = (code, message) => Object.assign(new Error(message), { code });

/** 只存员工自定义项；官方默认值及不可删除身份由分发目录独占。 */
export class AiWebStore {
  constructor(domain) { this.table = domain.table('entries'); this.writing = null; this.closed = false; }
  list() { return contract.result.parse({ entries: [...aiWebEntries, ...[...this.table.keys()].map(id => this.table.get(id))] }); }
  async manage(raw, signal) {
    const input = contract.input.parse(raw);
    signal?.throwIfAborted();
    if (this.closed) throw fail('CLOSED', 'AI 入口服务已卸载，请重新打开');
    if (input.action === 'list') return this.list();
    if (this.writing) throw fail('BUSY', 'AI 入口正在保存，请等待本次读回后重试');
    // 不排队未被接受的写入；已进入持久层的操作等真实结果后读回，不把取消冒充未写入。
    const operation = (async () => {
      signal?.throwIfAborted();
      if (aiWebEntries.some(entry => entry.id === input.id)) throw fail('AI_WEB_BUILTIN', '默认 AI 入口不可编辑或删除');
      const previous = this.table.get(input.id);
      if ((previous?.revision ?? 0) !== input.expectedRevision) throw fail('CONFLICT', '入口已被修改，请刷新列表后重试；当前表单已保留');
      if (input.action === 'remove') {
        if (!previous) throw fail('AI_WEB_MISSING', '入口已删除，请刷新列表');
        await this.table.delete(input.id);
      } else {
        if (!previous && [...this.table.keys()].length >= 200) throw fail('AI_WEB_LIMIT', '自定义入口已达 200 个，请删除不用的入口后再添加');
        const entry = { ...input.entry, avatar: await validateAvatar(input.entry.avatar), id: input.id, revision: (previous?.revision ?? 0) + 1, builtin: false, provider: '', keywords: '' };
        signal?.throwIfAborted();
        await this.table.put(input.id, contract.stored.parse(entry));
      }
      return this.list();
    })();
    this.writing = operation;
    try { return await operation; } finally { if (this.writing === operation) this.writing = null; }
  }
  async dispose() { this.closed = true; if (this.writing) await Promise.allSettled([this.writing]); }
}
