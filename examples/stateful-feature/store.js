import { createHash } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { withFileLock } from '@deepseek-ai/dsh-atomic-write';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { packageName } from './identity.js';
import { input, state } from './contract.js';

const fail = (code, message) => Object.assign(new Error(message), { code });
const empty = () => ({ revision: 0, text: '', present: false });

/** 此包仅保存一条文本；每次锁内重新开域，读写均不依赖另一进程的旧缓存。 */
export class SavedTextStore {
  constructor(ctx) { this.ctx = ctx; this.closing = new AbortController(); this.pending = null; }
  manage(raw, signal) {
    const value = input.parse(raw);
    signal?.throwIfAborted();
    if (this.closing.signal.aborted) throw fail('CLOSED', '保存文本已关闭，请重新启用扩展');
    if (this.pending) throw fail('BUSY', '正在读取或保存，请等待结束后刷新');
    const combined = AbortSignal.any([this.closing.signal, AbortSignal.timeout(10000), ...(signal ? [signal] : [])]);
    const operation = this.perform(value, combined);
    this.pending = operation;
    return operation.finally(() => { if (this.pending === operation) this.pending = null; });
  }
  async perform(value, signal) {
    const profile = this.ctx.profileContext?.dir;
    if (typeof profile !== 'string' || !path.isAbsolute(profile)) throw fail('PROFILE', '当前测试 profile 位置不可用，未改用全局位置');
    const directory = await realpath(profile);
    if (!(await stat(directory)).isDirectory()) throw fail('PROFILE', '当前 profile 不是目录');
    const identity = createHash('sha256').update(packageName + '\0' + directory).digest('hex');
    signal.throwIfAborted();
    return withFileLock(path.join(directory, `extension-${identity}`), async () => {
      signal.throwIfAborted();
      const domain = await this.ctx.storageDomain.open(defineDomain({ name: `extension_${identity}`, version: 1, tables: { settings: domainTable(state) } }));
      try {
        signal.throwIfAborted();
        const table = domain.table('settings'), previous = state.parse(table.get('text') ?? empty());
        if (value.action === 'read') return previous;
        // 清除后的空值标记保留版本，旧窗口不能以 revision=0 覆盖后来保存的内容。
        if (value.action === 'purge' && !previous.present) return previous;
        if (previous.revision !== value.expectedRevision) throw fail('CONFLICT', '文本已被其他窗口修改，请刷新后重新编辑');
        const next = state.parse({ revision: previous.revision + 1, text: value.action === 'save' ? value.text : '', present: value.action === 'save' });
        signal.throwIfAborted();
        // put 开始后等待真实提交及读回；取消只停止客户端接收，不假报磁盘未修改。
        await table.put('text', next);
        const saved = state.parse(table.get('text'));
        if (saved.revision !== next.revision || saved.text !== next.text || saved.present !== next.present) throw fail('READBACK', '保存结果未核对一致，请刷新核对，不要直接重复写入');
        return saved;
      } finally {
        try { await domain.close(); }
        catch (error) { this.cleanupFailure = error; throw error; }
      }
    }, { waitMs: 0, signal });
  }
  close() {
    this.closing.abort(new Error('保存文本扩展已关闭'));
    // 卸载只排空本包操作，不擦除文本；清除只能通过独立 purge 动作。
    return (this.pending ? this.pending.then(() => {}, () => {}) : Promise.resolve()).then(() => {
      if (this.cleanupFailure) throw this.cleanupFailure;
    });
  }
}
