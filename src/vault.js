import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { parseLinks, resolveLinks } from './links.js';

export const zones = ['00-系统', '10-收件箱', '20-项目', '30-领域', '40-知识', '50-来源', '60-时间线', '70-作品', '80-外部索引', '90-归档'];
export const digest = value => createHash('sha256').update(value).digest('hex');
const types = new Set(['capture', 'timeline', 'project', 'area', 'source', 'atomic', 'moc', 'output', 'asset-index']);
const states = { capture: ['inbox', 'processed', 'archived'], source: ['unread', 'reading', 'processed'], atomic: ['seedling', 'evergreen'], project: ['active', 'paused', 'completed', 'archived'], output: ['draft', 'reviewing', 'published', 'delivered'] };
/** 初始化预建的通用二级目录；员工可在各区内按需新建同级目录。 */
export const layout = ['00-系统/索引/任务', '20-项目/工作', '20-项目/学习', '30-领域/职业发展', '40-知识/产品与业务', '40-知识/工作方法', '40-知识/工程与工具', '40-知识/人工智能', '40-知识/学习与成长', '50-来源/书籍', '50-来源/网页', '50-来源/课程与视频', '50-来源/对话与会议', '60-时间线/日记', '60-时间线/周记', '60-时间线/月记', '60-时间线/人生事件', '70-作品/报告', '70-作品/文章', '70-作品/PPT', '80-外部索引/代码项目', '80-外部索引/工作文件', '80-外部索引/数字资产', '90-归档/已完成项目'];
const templateRoot = fileURLToPath(new URL('../content/vault/', import.meta.url));
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
// 首个随包版本未写 bundle.json；只认这些原样内容（日期还原为 __DATE__）为员工未改动。
const legacyBundle = new Set(['c9770da34452c86f4a31fa919540da7c75d8a9dc8d120a8822aad41ee14307e4', '69f4777784f8315f716ea7c91103f5705493b4044ebaa710923f8e4fde848b66', '953ad741f9838e278f9f0096e995763068c467bffe2dac4d8cfd95200da2e28c', '08cba17b369e0ff458a7b62e3c29a36b2912c94bed865bd596c568b4482dd47e']);
const localDate = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
let bundleSource;

/** 随包规则、模板、根级入口与 Obsidian 视图；.base 只接受 00-系统/Bases 下的文件。 */
async function bundleFiles(date) {
  bundleSource ??= (async () => {
    const files = [];
    const walk = async (folder, relative = '') => {
      for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const name = path.posix.join(relative, entry.name);
        if (entry.isDirectory()) await walk(path.join(folder, entry.name), name);
        else if (entry.isFile() && (name.endsWith('.md') ? readableName(name) : /^00-系统\/Bases\/[^/]+\.base$/.test(name))) files.push({ name, raw: decoder.decode(await fs.readFile(path.join(folder, entry.name))) });
      }
    };
    await walk(templateRoot);
    return { version: digest(JSON.stringify(files)), files };
  })();
  const source = await bundleSource;
  const files = source.files.map(({ name, raw }) => {
    const content = raw.replaceAll('__DATE__', date);
    if (name.includes('/') && name.endsWith('.md')) validateNote(content, name);
    return { name, content };
  });
  return { version: source.version, files };
}

const undated = text => text.replace(/^(created|updated): \d{4}-\d{2}-\d{2}$/gm, '$1: __DATE__');
const manifest = (version, files) => JSON.stringify({ schema: 1, version, files }, null, 2) + '\n';
const keepCreated = (content, previous) => {
  const created = /^---\n[\s\S]*?^created: (\d{4}-\d{2}-\d{2})$/m.exec(previous.replace(/\r\n/g, '\n'))?.[1];
  return created ? content.replace(/^created: \d{4}-\d{2}-\d{2}$/m, `created: ${created}`) : content;
};
export const defaultLimits = Object.freeze({ maxNoteBytes: 262144, maxFiles: 10000, maxResults: 100, maxSources: 32, maxEvents: 100, maxSourceEvents: 20000, maxSourceBytes: 16777216, maxIndexBytes: 33554432, maxLinks: 50000, maxGraphNodes: 300, operationMs: 60000 });

export function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

export function abort(signal) { signal?.throwIfAborted(); }

export function frontmatter(content) {
  // 入口拒绝孤立代理码元，避免 UTF-8 落盘时静默替换后才发现原文已丢失。
  if (typeof content !== 'string' || content.includes('\uFFFD') || content.includes('\0') || Buffer.from(content, 'utf8').toString('utf8') !== content) fail('INVALID_TEXT', '内容必须是有效 UTF-8 文本');
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!match) fail('METADATA', '缺少 YAML 属性区');
  let data;
  try { data = yaml.load(match[1], { schema: yaml.JSON_SCHEMA, json: false }); }
  catch (error) { fail('METADATA', `属性格式错误：${error.message}`); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('METADATA', '属性必须是对象');
  return { data, body: normalized.slice(match[0].length), normalized };
}

export function validateNote(content, relativePath) {
  const { data, body } = frontmatter(content);
  if (!types.has(data.type)) fail('NOTE_TYPE', 'type 必须使用知识库的九种主类型');
  if (typeof data.status !== 'string' || !data.status.trim()) fail('NOTE_STATUS', 'status 必填');
  if (states[data.type] && !states[data.type].includes(data.status)) fail('NOTE_STATUS', `${data.type} 的状态不匹配`);
  for (const key of ['created', 'updated']) {
    if (typeof data[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data[key]) || !Number.isFinite(Date.parse(data[key])) || new Date(data[key]).toISOString().slice(0, 10) !== data[key]) fail('NOTE_DATE', `${key} 应为有效 YYYY-MM-DD`);
  }
  if (data.updated < data.created) fail('NOTE_DATE', 'updated 早于 created');
  if (!Array.isArray(data.aliases) || data.aliases.some(x => typeof x !== 'string')) fail('NOTE_ALIASES', 'aliases 应为字符串数组');
  const title = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  if (!title || title !== path.posix.basename(relativePath, '.md')) fail('NOTE_TITLE', '标题须与文件名一致');
  return { ...data, title };
}

export function relativeName(value, internal = false) {
  if (typeof value !== 'string' || !value || value.length > 240) fail('PATH', '请提供库内相对路径');
  const name = value.replaceAll('\\', '/');
  const parts = name.split('/');
  if (path.isAbsolute(name) || parts.some(x => !x || x === '.' || x === '..' || /[<>:"|?*\x00-\x1f]/.test(x) || /[. ]$/.test(x) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x))) fail('PATH', '路径含越界或无效名称');
  if (!internal && (!zones.includes(parts[0]) || !name.endsWith('.md') || parts.some(x => x.startsWith('.')))) fail('PATH', '只接受十区内的 Markdown 笔记');
  return name;
}

/** 读取额外接受非隐藏根级 Markdown；写入仍只使用 relativeName 的十区规则。 */
export function readableName(value) {
  const name = relativeName(value, true);
  if (!/\.md$/i.test(name) || name.split('/').some(part => part.startsWith('.')) || (name.includes('/') && !zones.includes(name.split('/')[0]))) fail('PATH', '只读取十区内或根级的 Markdown 笔记');
  return name;
}

const readOnlyNote = name => !name.includes('/') || name.startsWith('00-系统/规则/') || name.startsWith('00-系统/模板/') || !name.endsWith('.md');

function parseRecord(record) {
  let body = record.content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), metadata = {}, lineOffset = 0;
  try {
    const fm = frontmatter(record.content);
    metadata = fm.data; body = fm.body;
    lineOffset = fm.normalized.slice(0, fm.normalized.length - body.length).split('\n').length - 1;
  } catch (error) { if (error.code !== 'METADATA') throw error; }
  return { ...record, title: path.posix.basename(record.path, '.md'), aliases: Array.isArray(metadata.aliases) ? metadata.aliases.filter(item => typeof item === 'string') : [], parsed: parseLinks(body, lineOffset) };
}

// 全库关系不可用时保留正文，不把尚未解析的目标伪装成缺失链接。
function unlinkedView(node) {
  if (node.type === 'knowledgeLink') return { type: 'text', value: node.value, line: node.line };
  return { ...node, ...(node.children ? { children: node.children.map(unlinkedView) } : {}) };
}

async function exists(file) {
  try { return await fs.lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** 文件真源；锁、候选和恢复材料只服务一次写入与恢复，不参与知识检索。 */
export class Vault {
  constructor(root, limits = defaultLimits) {
    if (!path.isAbsolute(root) || path.parse(root).root === path.resolve(root)) fail('ROOT', '知识库必须是独立的绝对目录');
    this.root = path.resolve(root);
    this.limits = Object.fromEntries(Object.entries(defaultLimits).map(([key, value]) => [key, limits[key] ?? value]));
    this.skillsDir = path.join(this.root, '.whalewing', 'skills');
    this.indexSnapshot = null;
  }

  async resolve(name, internal = false) {
    const clean = relativeName(name, internal);
    const target = path.join(this.root, ...clean.split('/'));
    const segments = path.relative(path.parse(target).root, target).split(path.sep);
    let current = path.parse(target).root;
    for (const segment of segments) {
      current = path.join(current, segment);
      const stat = await exists(current);
      if (stat?.isSymbolicLink()) fail('SYMLINK', '知识路径含链接或联接点，请使用实际目录');
    }
    return target;
  }

  async initialized() {
    const marker = await this.resolve('.whalewing/settings.json', true);
    if (!(await exists(marker))) return false;
    const settings = JSON.parse((await this.readInternal('.whalewing/settings.json')).content);
    if (settings.schema !== 1 || !Array.isArray(settings.sources)) fail('CONFIG', '知识库配置版本或来源列表损坏');
    return true;
  }

  async requireReady() {
    if (!(await this.initialized())) fail('NOT_INITIALIZED', '知识库尚未就绪；请在鲸翼页面重试并查看目录状态');
  }

  async initialize(signal) {
    abort(signal);
    if (await this.initialized()) return { initialized: true, root: this.root };
    await this.resolve('.whalewing/settings.json', true);
    const stat = await exists(this.root);
    const recovery = await this.readInternal('.whalewing/initializing.json');
    if (stat && (!stat.isDirectory() || ((await fs.readdir(this.root)).length && !recovery))) fail('ROOT_NOT_EMPTY', '目标目录已有内容；请选择新的独立目录，不覆盖既有知识库');
    await fs.mkdir(this.root, { recursive: true });
    await fs.mkdir(path.join(this.root, '.whalewing'), { recursive: true });
    const initLockPath = await this.resolve('.whalewing/init.lock', true);
    let initLock;
    try { initLock = await fs.open(initLockPath, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') fail('BUSY', '初始化正在进行；异常退出后请停止宿主并检查 init.lock 再恢复'); throw error; }
    const initializedFiles = [];
    try {
      const date = recovery ? JSON.parse(recovery.content).date : localDate();
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('RECOVERY', '初始化恢复记录损坏');
      if (!recovery) await this.atomic('.whalewing/initializing.json', JSON.stringify({ date }) + '\n', signal);
      for (const folder of [...zones, ...layout]) await fs.mkdir(path.join(this.root, ...folder.split('/')), { recursive: true });
      for (const folder of ['skills', 'candidates', 'disabled', 'recovery']) await fs.mkdir(path.join(this.root, '.whalewing', folder), { recursive: true });
      const bundle = await bundleFiles(date), hashes = {};
      for (const { name, content } of bundle.files) {
        abort(signal);
        const target = await this.resolve(name, true);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const existing = await this.readInternal(name);
        if (existing && existing.content !== content) fail('CONFLICT', `初始化模板已有修改：${name}，保留现状，不覆盖`);
        if (!existing) await fs.writeFile(target, content, { flag: 'wx', encoding: 'utf8' });
        hashes[name] = digest(content);
        initializedFiles.push(name);
      }
      await this.atomic('.whalewing/bundle.json', manifest(bundle.version, hashes), signal);
      await this.atomic('.whalewing/settings.json', JSON.stringify({ schema: 1, sources: [] }, null, 2) + '\n', signal);
      await fs.unlink(await this.resolve('.whalewing/initializing.json', true));
      return { initialized: true, root: this.root, files: initializedFiles };
    } catch (error) {
      // 保留半成品供用户检查，绝不递归清空可能已被其它进程使用的目录。
      error.message += `；初始化未完成，保留目录 ${this.root}`;
      throw error;
    } finally {
      await initLock.close();
      await fs.unlink(initLockPath);
    }
  }

  /** 已初始化的库随插件补齐骨架：缺失的目录和随包文件补建，员工未改过的随包文件更新，改过的保持原样；员工笔记不触碰。 */
  async upgrade(signal) {
    abort(signal);
    await this.requireReady();
    const date = localDate(), bundle = await bundleFiles(date);
    const recorded = await this.readInternal('.whalewing/bundle.json');
    if (recorded && JSON.parse(recorded.content).version === bundle.version) return { upgraded: false, added: [], updated: [], kept: [] };
    return this.locked(async () => {
      const previous = (await this.readInternal('.whalewing/bundle.json'))?.content;
      const shipped = previous ? JSON.parse(previous).files || {} : null;
      for (const folder of [...zones, ...layout]) await fs.mkdir(await this.resolve(folder, true), { recursive: true });
      const hashes = {}, added = [], updated = [], kept = [];
      for (const { name, content } of bundle.files) {
        abort(signal);
        const current = await this.readInternal(name);
        if (!current) {
          await this.atomic(name, content, signal);
          hashes[name] = digest(content); added.push(name);
          continue;
        }
        // 只差日期的视为同一版本，不为刷新 updated 改写文件。
        if (undated(current.content) === undated(content)) { hashes[name] = current.hash; continue; }
        const pristine = shipped ? shipped[name] === current.hash : legacyBundle.has(digest(undated(current.content)));
        if (!pristine) {
          if (shipped?.[name]) hashes[name] = shipped[name];
          kept.push(name);
          continue;
        }
        const next = keepCreated(content, current.content);
        await this.backup(name, current, signal);
        await this.atomic(name, next, signal);
        hashes[name] = digest(next); updated.push(name);
      }
      await this.atomic('.whalewing/bundle.json', manifest(bundle.version, hashes), signal);
      return { upgraded: true, added, updated, kept };
    }, signal);
  }

  async locked(operation, signal) {
    abort(signal);
    await this.requireReady();
    const lockPath = await this.resolve('.whalewing/write.lock', true);
    let lock;
    try { lock = await fs.open(lockPath, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') fail('BUSY', '另一次知识写入尚未结束；回读后重试。异常退出遗留锁请在停止宿主后检查清理'); throw error; }
    try { await lock.writeFile(`${process.pid}\n`); return await operation(); }
    finally { await lock.close(); await fs.unlink(lockPath); }
  }

  async atomic(relative, content, signal) {
    abort(signal);
    const target = await this.resolve(relative, true);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.pending-${randomUUID()}`;
    try {
      await fs.writeFile(temp, content, { flag: 'wx', mode: 0o600 });
      abort(signal);
      await this.resolve(relative, true);
      await fs.rename(temp, target);
    } finally {
      try { await fs.unlink(temp); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  fileByteLimit(relative) {
    return relative.startsWith('.whalewing/') && relative.endsWith('.json') ? this.limits.maxNoteBytes * 6 + 4096 : this.limits.maxNoteBytes;
  }

  async readInternal(relative) {
    const target = await this.resolve(relative, true);
    const stat = await exists(target);
    if (!stat) return null;
    const limit = this.fileByteLimit(relative);
    if (!stat.isFile() || stat.size > limit) fail('SIZE', `${relative}：文件类型或大小超出限制`);
    const bytes = await fs.readFile(target);
    if (bytes.length > limit) fail('SIZE', '读取期间文件超出大小限制');
    let content;
    try { content = decoder.decode(bytes); }
    catch { fail('ENCODING', `${relative}：不是有效 UTF-8；请在外部编辑器检查编码，原文件未修改`); }
    return { content, hash: digest(bytes), bytes };
  }

  async read(name) {
    await this.requireReady();
    const clean = readableName(name);
    const result = await this.readInternal(clean);
    if (!result) fail('NOT_FOUND', '笔记已不存在');
    return { path: clean, content: result.content, hash: result.hash, readOnly: readOnlyNote(clean) };
  }

  editable(name) {
    const clean = relativeName(name);
    if (clean.startsWith('00-系统/规则/') || clean.startsWith('00-系统/模板/')) fail('FIXED_RULE', '固定知识规则及模板由插件维护，不由日常生成修改');
    return clean;
  }

  async checkExpected(name, expectedHash) {
    if (typeof expectedHash !== 'string') fail('EXPECTED_HASH', '先读取当前文件；新建时 expectedHash 传空字符串');
    const current = await this.readInternal(name);
    if ((current?.hash ?? '') !== expectedHash) fail('CONFLICT', '文件已变化，请回读并合并，不覆盖新内容');
    return current;
  }

  async backup(name, previous, signal) {
    if (previous) await this.atomic(`.whalewing/recovery/${digest(name)}.json`, JSON.stringify({ path: name, content: previous.content, hash: previous.hash }) + '\n', signal);
  }

  async write(name, content, expectedHash, signal) {
    const clean = this.editable(name);
    if (Buffer.byteLength(content ?? '', 'utf8') > this.limits.maxNoteBytes) fail('SIZE', '笔记超出大小限制');
    validateNote(content, clean);
    return this.locked(async () => {
      const current = await this.checkExpected(clean, expectedHash);
      // 既有文件保留换行风格；新文件统一 UTF-8/LF。
      let output = content.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
      if (current?.bytes.includes(Buffer.from('\r\n'))) output = output.replace(/\n/g, '\r\n');
      if (current?.bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))) output = '\uFEFF' + output;
      await this.backup(clean, current, signal);
      await this.checkExpected(clean, expectedHash);
      await this.atomic(clean, output, signal);
      const readback = await this.read(clean);
      if (readback.hash !== digest(output)) fail('READBACK', '保存后文件被改动，请回读实际内容');
      return { path: clean, hash: readback.hash };
    }, signal);
  }

  async remove(name, expectedHash, signal) {
    const clean = this.editable(name);
    return this.locked(async () => {
      const current = await this.checkExpected(clean, expectedHash);
      if (!current) fail('NOT_FOUND', '笔记已不存在');
      await this.backup(clean, current, signal);
      await this.checkExpected(clean, expectedHash);
      abort(signal);
      await fs.unlink(await this.resolve(clean));
      return { path: clean, removed: true };
    }, signal);
  }

  async restore(name, expectedHash, signal) {
    const clean = this.editable(name);
    return this.locked(async () => {
      await this.checkExpected(clean, expectedHash);
      const backup = await this.readInternal(`.whalewing/recovery/${digest(clean)}.json`);
      if (!backup) fail('NO_RECOVERY', '没有该笔记的恢复内容');
      const recovered = JSON.parse(backup.content);
      if (recovered.path !== clean || digest(recovered.content) !== recovered.hash) fail('RECOVERY', '恢复内容校验失败');
      validateNote(recovered.content, clean);
      await this.atomic(clean, recovered.content, signal);
      const readback = await this.read(clean);
      if (readback.hash !== recovered.hash) fail('READBACK', '恢复后文件被改动，请回读实际内容；恢复材料保持不变');
      return { path: clean, hash: readback.hash };
    }, signal);
  }

  async files(signal) {
    await this.requireReady();
    const result = [];
    const walk = async name => {
      abort(signal);
      for (const entry of await fs.readdir(await this.resolve(name, true), { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        if (entry.isSymbolicLink()) fail('SYMLINK', `检索目录含链接：${name}/${entry.name}`);
        const child = `${name}/${entry.name}`;
        if (entry.isDirectory()) await walk(child);
        else if (entry.isFile() && /\.md$/i.test(child)) {
          result.push(child);
          if (result.length > this.limits.maxFiles) fail('FILE_LIMIT', '笔记数量超出本次检索上限，请调整插件配置或归档范围');
        }
      }
    };
    for (const zone of zones) await walk(zone);
    for (const entry of await fs.readdir(this.root, { withFileTypes: true })) {
      abort(signal);
      if (entry.name.startsWith('.') || !/\.md$/i.test(entry.name)) continue;
      if (entry.isSymbolicLink()) fail('SYMLINK', `根级笔记含链接：${entry.name}`);
      if (entry.isFile()) { readableName(entry.name); result.push(entry.name); }
      if (result.length > this.limits.maxFiles) fail('FILE_LIMIT', '笔记数量超出本次检索上限，请调整插件配置或归档范围');
    }
    return result.sort();
  }

  /** 目录只读取名称和文件类型；坏编码笔记不阻断导航，也不把正文带进左栏。 */
  async browse(directory = '', offset = 0, signal) {
    abort(signal);
    await this.requireReady();
    if (typeof directory !== 'string') fail('PATH', '目录必须是知识库内相对路径');
    const clean = directory === '' ? '' : relativeName(directory, true);
    if (clean && (!zones.includes(clean.split('/')[0]) || clean.split('/').some(part => part.startsWith('.')))) fail('PATH', '只接受知识库十区内的目录');
    if (!Number.isSafeInteger(offset) || offset < 0) fail('OFFSET', '目录分页位置无效');
    const entries = [];
    if (!clean) {
      // 根级 Markdown 仅可读；其它目录和内部恢复材料不进入导航。
      for (const name of zones) {
        abort(signal);
        const target = await this.resolve(name, true);
        const stat = await exists(target);
        if (stat?.isDirectory()) entries.push({ folder: true, path: name, name });
      }
      for (const entry of await fs.readdir(this.root, { withFileTypes: true })) {
        abort(signal);
        if (entry.name.startsWith('.') || !/\.md$/i.test(entry.name)) continue;
        if (entry.isSymbolicLink()) fail('SYMLINK', `根级笔记含链接：${entry.name}`);
        if (entry.isFile()) entries.push({ folder: false, path: readableName(entry.name), name: entry.name.replace(/\.md$/i, '') });
        if (entries.length > this.limits.maxFiles) fail('DIRECTORY_LIMIT', '当前目录条目超过扫描上限，请调整 maxFiles');
      }
    } else {
      let count = 0;
      const folder = await fs.opendir(await this.resolve(clean, true));
      for await (const entry of folder) {
        abort(signal);
        if (++count > this.limits.maxFiles) fail('DIRECTORY_LIMIT', '当前目录条目超过扫描上限，请缩小目录或调整 maxFiles');
        if (entry.name.startsWith('.')) continue;
        const name = `${clean}/${entry.name}`;
        if (entry.isSymbolicLink()) fail('SYMLINK', `目录含链接，请使用实际目录：${name}`);
        if (entry.isDirectory()) entries.push({ folder: true, path: name, name: entry.name });
        else if (entry.isFile() && /\.md$/i.test(entry.name)) entries.push({ folder: false, path: name, name: entry.name.replace(/\.md$/i, '') });
      }
    }
    abort(signal);
    entries.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const page = entries.slice(offset, offset + this.limits.maxResults);
    return {
      directory: clean,
      folders: page.filter(entry => entry.folder).map(({ path, name }) => ({ path, name })),
      notes: page.filter(entry => !entry.folder).map(({ path, name }) => ({ path, title: name, readOnly: readOnlyNote(path) })),
      total: entries.length, offset, truncated: offset + page.length < entries.length,
    };
  }

  async search(query = '', signal) {
    if (typeof query !== 'string' || query.length > 200) fail('QUERY', '搜索词最长 200 字');
    const tokens = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const notes = [];
    let total = 0;
    for (const name of await this.files(signal)) {
      abort(signal);
      if (name.startsWith('90-归档/')) continue;
      let record;
      try { record = await this.read(name); }
      catch (error) {
        if (!['ENCODING', 'SIZE', 'NOT_FOUND'].includes(error.code)) throw error;
        if (!tokens.every(token => name.toLocaleLowerCase().includes(token))) continue;
        total++;
        if (notes.length < this.limits.maxResults) notes.push({ path: name, title: path.posix.basename(name, '.md'), type: 'invalid', status: readOnlyNote(name) ? '只读' : '待修复', excerpt: error.message, issue: error.message, hash: '', readOnly: readOnlyNote(name) });
        continue;
      }
      const haystack = `${name}\n${record.content}`.toLocaleLowerCase();
      if (!tokens.every(x => haystack.includes(x))) continue;
      total++;
      if (notes.length >= this.limits.maxResults) continue;
      let metadata;
      try { metadata = !name.includes('/') ? { title: name.replace(/\.md$/i, ''), type: 'root', status: '只读' } : validateNote(record.content, name); }
      catch (error) {
        // 保留损坏笔记的可发现性，便于员工原位修复。
        metadata = { title: path.posix.basename(name, '.md'), type: 'invalid', status: '待修复', issue: error.message };
      }
      const position = tokens.length ? Math.max(0, record.content.toLocaleLowerCase().indexOf(tokens[0]) - 50) : 0;
      notes.push({ path: name, ...metadata, excerpt: record.content.slice(position, position + 240), hash: record.hash, readOnly: record.readOnly });
    }
    return { notes, truncated: total > notes.length, total };
  }

  /** 服务等待在途读取结束后调用，释放本实例持有的正文及关系投影。 */
  clearIndex() {
    this.indexSnapshot = null;
  }

  /** 每次回读文件；仅复用哈希一致的解析投影，外部改动不等待 watcher 或 TTL。 */
  async index(signal) {
    const names = await this.files(signal);
    const previous = this.indexSnapshot;
    const known = new Map(previous?.map(record => [record.path, record]) || []);
    const records = [];
    let bytes = 0, links = 0;
    for (let offset = 0; offset < names.length; offset += 8) {
      abort(signal);
      // 有界并行只覆盖文件 I/O；全部读操作归结后才抛错，不留迟到后台读取。
      const batch = await Promise.allSettled(names.slice(offset, offset + 8).map(async name => {
        const record = await this.readInternal(name);
        if (!record) fail('NOT_FOUND', '笔记已不存在');
        return { path: name, content: record.content, hash: record.hash, readOnly: readOnlyNote(name) };
      }));
      abort(signal);
      for (const result of batch) {
        if (result.status === 'rejected') throw result.reason;
        const record = result.value;
        bytes += Buffer.byteLength(record.content);
        if (bytes > this.limits.maxIndexBytes) fail('INDEX_LIMIT', '知识链接扫描超过字节上限；保留文件，请调整 maxIndexBytes 后重试');
        const cached = known.get(record.path);
        const parsedRecord = cached?.hash === record.hash ? cached : parseRecord(record);
        links += parsedRecord.parsed.links.length;
        if (links > this.limits.maxLinks) fail('LINK_LIMIT', '知识链接数量超过上限；保留文件，请调整 maxLinks 后重试');
        records.push(parsedRecord);
      }
    }
    abort(signal);
    if (previous?.length === records.length && records.every((record, i) => record === previous[i])) return previous;
    // 单个有界快照随 Vault 生命周期释放；增删、改名、别名或正文变化均重解全库关系。
    const resolved = resolveLinks(records, readableName);
    this.indexSnapshot = resolved;
    return resolved;
  }

  async document(name, signal) {
    const clean = readableName(name);
    await this.read(clean);
    let records;
    try { records = await this.index(signal); }
    catch (error) {
      abort(signal);
      const current = parseRecord(await this.read(clean));
      return { path: current.path, content: current.content, hash: current.hash, readOnly: current.readOnly, view: unlinkedView(current.parsed.view), links: [], anchors: current.parsed.anchors, backlinks: [], totalBacklinks: 0, relationsIssue: error.message };
    }
    const note = records.find(record => record.path === clean);
    if (!note) fail('NOT_FOUND', '笔记已不存在');
    const backlinks = records.flatMap(record => record.links.filter(link => link.path === clean).map(link => ({ path: record.path, title: record.title, line: link.line })));
    return { path: note.path, content: note.content, hash: note.hash, readOnly: note.readOnly, view: note.parsed.view, links: note.links, anchors: note.parsed.anchors, backlinks: backlinks.slice(0, this.limits.maxResults), totalBacklinks: backlinks.length };
  }

  async graph(args, signal) {
    if (typeof (args.query ?? '') !== 'string' || (args.query || '').length > 200) fail('QUERY', '搜索词最长 200 字');
    const records = await this.index(signal);
    const pairs = new Map(), missing = new Map(), missingSources = new Map();
    for (const record of records) for (const link of record.links) {
      const target = link.path || link.missingId;
      if (!target) continue;
      if (link.missingId) {
        const node = missing.get(target) || { kind: 'missing', path: target, title: link.missingTitle, sources: [] };
        const seen = missingSources.get(target) || new Set(), sourceKey = JSON.stringify([record.path, link.line]);
        if (!seen.has(sourceKey)) node.sources.push({ path: record.path, title: record.title, line: link.line });
        seen.add(sourceKey); missingSources.set(target, seen);
        missing.set(target, node);
      }
      pairs.set(JSON.stringify([record.path, target]), { source: record.path, target });
    }
    const allNodes = [...records.map(record => ({ kind: 'note', path: record.path, title: record.title, readOnly: record.readOnly, aliases: record.aliases })), ...missing.values()];
    // 连接度来自完整索引，不随筛选或分页改变；重复、双向和同篇引用不增加邻居数。
    const neighbors = new Map(allNodes.map(record => [record.path, new Set()]));
    for (const edge of pairs.values()) {
      abort(signal);
      if (edge.source === edge.target) continue;
      neighbors.get(edge.source).add(edge.target);
      neighbors.get(edge.target).add(edge.source);
    }
    let selected = new Set(allNodes.map(record => record.path));
    if (args.path) {
      const center = readableName(args.path);
      if (!selected.has(center)) fail('NOT_FOUND', '当前笔记已不存在，请回读后继续');
      selected = new Set([center]);
      for (const edge of pairs.values()) if (edge.source === center || edge.target === center) { selected.add(edge.source); selected.add(edge.target); }
    }
    const query = (args.query || '').trim().toLocaleLowerCase();
    const filtered = allNodes.filter(record => selected.has(record.path) && (!query || `${record.path} ${record.title} ${(record.aliases || []).join(' ')}`.toLocaleLowerCase().includes(query)));
    const offset = args.offset ?? 0;
    if (!Number.isInteger(offset) || offset < 0) fail('OFFSET', '图谱分页位置无效');
    const nodes = filtered.slice(offset, offset + this.limits.maxGraphNodes).map(({ aliases, ...node }) => ({ ...node, degree: neighbors.get(node.path).size }));
    const visible = new Set(nodes.map(node => node.path));
    const allEdges = [...pairs.values()].filter(edge => selected.has(edge.source) && selected.has(edge.target));
    const edges = allEdges.filter(edge => visible.has(edge.source) && visible.has(edge.target));
    return { version: 2, nodes, edges, total: filtered.length, offset, truncated: nodes.length < filtered.length, omittedEdges: allEdges.length - edges.length, unresolved: records.reduce((sum, record) => sum + record.links.filter(link => !['resolved', 'attachment'].includes(link.status)).length, 0) };
  }

  async validate(signal) {
    const records = await this.index(signal);
    const issues = [];
    const titles = new Map();
    for (const record of records) {
      abort(signal);
      const name = record.path;
      try {
        const meta = !name.includes('/') ? { title: record.title } : validateNote(record.content, name);
        if (!name.startsWith('90-归档/')) {
          if (titles.has(meta.title)) issues.push(`重名主文件：${titles.get(meta.title)} 与 ${name}`);
          titles.set(meta.title, name);
        }
        for (const link of record.links) if (!['resolved', 'attachment'].includes(link.status)) issues.push(`${name}：${link.kind === 'markdown' ? '失效 Markdown 链接' : '失效知识链接'} ${link.target}（${link.status}）`);
      } catch (error) { issues.push(`${name}：${error.message}`); }
      if (issues.length >= this.limits.maxResults) break;
    }
    return { valid: issues.length === 0, issues: issues.slice(0, this.limits.maxResults), notes: records.length };
  }

  async settings() {
    await this.requireReady();
    return JSON.parse((await this.readInternal('.whalewing/settings.json')).content);
  }

  async updateSettings(update, signal) {
    return this.locked(async () => {
      const current = await this.settings();
      const next = await update(current);
      const serialized = JSON.stringify(next, null, 2) + '\n';
      // 来源覆盖增长须在同一读写限额内；先拒收，避免提交后连原配置也读不回。
      if (Buffer.byteLength(serialized) > this.fileByteLimit('.whalewing/settings.json')) fail('SIZE', '来源覆盖配置超过当前读取容量；原配置保持，请调整容量后从原覆盖位置继续');
      await this.atomic('.whalewing/settings.json', serialized, signal);
      return next;
    }, signal);
  }
}
