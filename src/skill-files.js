import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { abort, digest, fail, relativeName } from './vault.js';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export const skillArea = '.system/whalewing';
export async function stat(file) {
  try { return await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** 技能根专用文件边界；知识来源仍由 Vault 读取，不在这里初始化或解释知识库。 */
export class SkillFiles {
  constructor(root, limits) {
    if (!root || !path.isAbsolute(root)) fail('SKILL_ROOT', '技能库必须显式提供绝对路径');
    this.root = path.resolve(root); this.limits = limits;
  }
  async resolve(relative = '') {
    const target = relative ? path.join(this.root, relativeName(relative, true)) : this.root;
    const parsed = path.parse(target);
    let cursor = parsed.root;
    for (const segment of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      const found = await stat(cursor);
      if (found?.isSymbolicLink()) fail('SYMLINK', '技能路径含链接，原文件未修改');
      if (found && cursor !== target && !found.isDirectory()) fail('PATH', '技能目录祖先不是目录');
    }
    return target;
  }
  async read(relative) {
    const file = await this.resolve(relative), found = await stat(file);
    if (!found) return null;
    if (!found.isFile() || found.size > this.limits.maxNoteBytes * 6 + 4096) fail('SIZE', '技能文件类型或大小超限');
    const bytes = await fs.readFile(file);
    if (bytes.length > this.limits.maxNoteBytes * 6 + 4096) fail('SIZE', '读取期间技能文件超限');
    let content;
    try { content = decoder.decode(bytes); } catch { fail('ENCODING', '技能不是有效 UTF-8，原件保留'); }
    return { content, bytes, hash: digest(bytes) };
  }
  async atomic(relative, value, signal) {
    abort(signal);
    const target = await this.resolve(relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.pending-${randomUUID()}`;
    try {
      await fs.writeFile(temp, value, { flag: 'wx', mode: 0o600 });
      abort(signal); await this.resolve(relative);
      await fs.rename(temp, target);
    } finally { await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async checkExpected(relative, expected) {
    if (typeof expected !== 'string') fail('CONFLICT', '请先读取技能版本');
    const previous = await this.read(relative);
    if ((previous?.hash ?? '') !== expected) fail('CONFLICT', '技能已变化，保留当前编辑后重新读取');
    return previous;
  }
  async backup(relative, record, signal) {
    await this.atomic(`${skillArea}/recovery/${digest(relative)}.json`, JSON.stringify({ path: relative, content: record.content, hash: record.hash }) + '\n', signal);
  }
  async locked(operation, signal) {
    abort(signal);
    const file = await this.resolve(`${skillArea}/write.lock`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    let handle;
    try { handle = await fs.open(file, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') fail('BUSY', '另一项技能写入尚未结束；回读后重试，异常退出遗留锁请停宿主后检查'); throw error; }
    try { await handle.writeFile(`${process.pid}\n`); return await operation(); }
    finally { await handle.close(); await fs.unlink(file); }
  }
  async snapshot(relative, signal) {
    const root = await this.resolve(relative), found = await stat(root);
    if (!found) return null;
    const files = [], directories = []; let bytes = 0;
    const visit = async (absolute, local, depth) => {
      abort(signal);
      if (depth > 12 || files.length + directories.length >= 512) fail('SKILL_SIZE', '技能 bundle 层级或文件数超限');
      const item = await fs.lstat(absolute);
      if (item.isSymbolicLink()) fail('SYMLINK', '技能 bundle 含链接，未复制或删除');
      if (item.isDirectory()) {
        directories.push(local);
        for (const name of (await fs.readdir(absolute)).sort()) {
          relativeName(name, true);
          await visit(path.join(absolute, name), local ? `${local}/${name}` : name, depth + 1);
        }
      } else {
        if (!item.isFile() || item.size > 16 * 1024 * 1024 || bytes + item.size > 32 * 1024 * 1024) fail('SKILL_SIZE', '技能 bundle 资源大小超限');
        const data = await fs.readFile(absolute); bytes += data.length;
        if (bytes > 32 * 1024 * 1024) fail('SKILL_SIZE', '读取期间技能 bundle 超限');
        files.push({ path: local, bytes: data });
      }
    };
    await visit(root, '', 0);
    return this.snapshotValue(found.isDirectory(), files, directories);
  }
  snapshotValue(directory, files, directories = directory ? [''] : []) {
    return { directory, files, directories, hash: directory ? digest(JSON.stringify({ directories, files: files.map(file => [file.path, digest(file.bytes)]) })) : digest(files[0].bytes) };
  }
  async install(relative, snapshot, signal) {
    const target = await this.resolve(relative), current = await this.snapshot(relative, signal);
    if (current) { if (current.hash !== snapshot.hash) fail('CONFLICT', '目标技能或恢复材料已存在且内容不同，双方均保留'); return; }
    const tempRelative = `${skillArea}/pending-${randomUUID()}`, temp = await this.resolve(tempRelative);
    try {
      if (snapshot.directory) {
        await fs.mkdir(temp, { recursive: true });
        for (const dir of snapshot.directories) if (dir) await fs.mkdir(path.join(temp, dir), { recursive: true });
        for (const file of snapshot.files) {
          abort(signal); await fs.mkdir(path.dirname(path.join(temp, file.path)), { recursive: true });
          await fs.writeFile(path.join(temp, file.path), file.bytes, { flag: 'wx' });
        }
      } else { await fs.mkdir(path.dirname(temp), { recursive: true }); await fs.writeFile(temp, snapshot.files[0].bytes, { flag: 'wx' }); }
      if ((await this.snapshot(tempRelative, signal))?.hash !== snapshot.hash) fail('READBACK', '技能临时写入回读不一致');
      abort(signal); await this.resolve(relative);
      if (await stat(target)) fail('CONFLICT', '技能目标在写入期间出现，未覆盖');
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(temp, target);
      if ((await this.snapshot(relative, signal))?.hash !== snapshot.hash) fail('READBACK', '技能写入后回读不一致，请按原身份核对');
    } finally {
      // 只清理本次随机 staging，固定在受管子根内，不清理目标或用户目录。
      await this.resolve(tempRelative);
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
  async retire(relative, expected, recovery, signal) {
    const current = await this.snapshot(relative, signal);
    if (!current || current.hash !== expected) fail('CONFLICT', '技能资源已变化，未移除');
    const destination = await this.resolve(recovery);
    // 恢复位置是单份原件，不合并或删除已有内容；即使相同也交给员工先核对。
    if (await stat(destination)) fail('CONFLICT', '恢复位置已存在，原技能和恢复材料均保留，请核对后重试');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if ((await this.snapshot(relative, signal))?.hash !== expected) fail('CONFLICT', '搬移前技能变化，原件保留');
    abort(signal);
    const target = await this.resolve(relative);
    if (await stat(await this.resolve(recovery))) fail('CONFLICT', '恢复位置在搬移前出现，未覆盖');
    try { await fs.rename(target, destination); }
    catch (error) { fail('RECOVERY_MOVE', `技能搬移结果未确认，请核对 ${relative} 与 ${recovery}：${error.message}`); }
    // 原子搬移保留最后一次快照之后出现的资源；不以递归删除完成快照式“备份”。
    let moved;
    try { moved = await this.snapshot(recovery, signal); }
    catch (error) { fail('RECOVERY_UNKNOWN', `技能已移至 ${recovery}，读回未确认，完整材料保留：${error.message}`); }
    if (moved?.hash !== expected) fail('RECOVERY_CHANGED', `搬移期间技能内容变化，完整材料已保留在 ${recovery}，请核对后恢复或重试`);
  }
}
