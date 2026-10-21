import path from 'node:path';
import { withFileLock } from '@deepseek-ai/dsh-atomic-write';
import { abort } from '../vault.js';
import { observeAutomation } from '../identity.js';

/** 仅编排两个持久领域的资源；领域身份、业务提交与重试仍由调用者决定。 */
export class LockedDomain {
  constructor({ directory, facility, lockName, definition, create }) {
    this.options = { directory, facility, lockName, definition, create };
    this.closing = new AbortController();
    this.pending = new Set();
  }

  get signal() { return this.closing.signal; }

  async run(operation) {
    abort(this.signal);
    const pending = Promise.resolve().then(operation);
    this.pending.add(pending);
    try { return await pending; } finally { this.pending.delete(pending); }
  }

  async get(signal) {
    abort(signal); abort(this.signal);
    if (this.owner) return this.owner;
    if (!this.opening) {
      const ready = Promise.withResolvers();
      const release = Promise.withResolvers();
      const { directory, facility, lockName, definition, create } = this.options;
      let published = false;
      this.release = release;
      this.lifetime = (async () => {
        const root = await directory(this.signal);
        const storage = facility();
        await withFileLock(path.join(root, lockName), async () => {
          let domain, owner;
          try {
            abort(this.signal);
            domain = await storage.open(definition(root));
            abort(this.signal);
            owner = create(domain);
            this.domain = domain; this.owner = owner; published = true;
            ready.resolve(owner);
            await release.promise;
          } finally {
            try { await owner?.dispose(); } finally { await domain?.close(); }
          }
        }, { waitMs: 0, signal: this.signal });
      })().catch(error => {
        ready.reject(error);
        // 初始化错误已经交给等待者；发布后的清理错误必须由卸载真实返回。
        if (published) throw error;
      });
      // 保留原拒绝供 close 读取，但不让尚未调用 close 的清理失败成为未处理拒绝。
      this.lifetime.catch(() => {});
      const opening = ready.promise;
      this.opening = opening;
      this.pending.add(opening);
      opening.then(() => this.pending.delete(opening), () => {
        this.pending.delete(opening);
        if (this.opening === opening) this.opening = undefined;
      });
    }
    // 取消一个等待者不取消共享 opening，也不假报已开始的业务写入被撤销。
    const opening = this.opening;
    return observeAutomation(() => opening, AbortSignal.any([this.signal, ...(signal ? [signal] : [])]));
  }

  close() {
    if (!this.disposal) {
      this.closing.abort(new Error('功能已卸载，当前操作停止'));
      this.disposal = (async () => {
        // lifetime 等待 release，不能放进 pending 形成卸载自等。
        await Promise.allSettled([...this.pending]);
        this.release?.resolve();
        await this.lifetime;
      })();
    }
    return this.disposal;
  }
}
