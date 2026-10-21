import path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

const key = value => value.normalize('NFC').trim().toLocaleLowerCase();
const plain = node => node.value ?? (node.children || []).map(plain).join('');

/** 从 Markdown 语法树取链接，代码、HTML 与转义示例不参与关系解释。 */
export function parseLinks(body, lineOffset = 0) {
  const tree = fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const links = [], anchors = [];
  const definitions = new Map();
  const collect = node => {
    if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    node.children?.forEach(collect);
  };
  collect(tree);
  const add = (node, target, label, kind, start = node.position.start.offset, end = node.position.end.offset) => {
    // 外部网址留给宿主的协议白名单；只有笔记目标进入知识图谱。
    if (kind === 'markdown' && /^[a-z][a-z\d+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) return;
    links.push({ target, label, kind, start, end, parentStart: node.position.start.offset, line: lineOffset + node.position.start.line + body.slice(node.position.start.offset, start).split('\n').length - 1 });
  };
  const visit = node => {
    if (node.type === 'heading') anchors.push({ kind: 'heading', value: plain(node).replace(/\s+#+\s*$/, '').trim(), line: node.position.start.line + lineOffset });
    if (node.type === 'paragraph') {
      const raw = body.slice(node.position.start.offset, node.position.end.offset);
      const block = /(?:^|\s)\^([\w-]+)\s*$/.exec(raw);
      if (block) anchors.push({ kind: 'block', value: block[1], line: node.position.start.line + lineOffset });
    }
    if (node.type === 'link' || node.type === 'linkReference') {
      const target = node.url ?? definitions.get(node.identifier);
      if (target) add(node, target, plain(node), 'markdown');
      return;
    }
    if (node.type === 'image' || node.type === 'imageReference') {
      // 阅读笔记不自动请求网络图片或读取库外附件；附件引用保留为文字。
      return;
    }
    if (node.type === 'text') {
      const raw = body.slice(node.position.start.offset, node.position.end.offset);
      for (const match of raw.matchAll(/!?\[\[([^\]\n]+)\]\]/g)) {
        const before = raw.slice(0, match.index).match(/\\+$/)?.[0].length || 0;
        if (before % 2) continue;
        const [target, ...alias] = match[1].split('|');
        add(node, target.trim(), alias.join('|').trim() || target.trim(), 'wiki', node.position.start.offset + match.index, node.position.start.offset + match.index + match[0].length);
      }
      return;
    }
    if (['code', 'inlineCode', 'html'].includes(node.type)) return;
    node.children?.forEach(visit);
  };
  visit(tree);
  links.sort((a, b) => a.start - b.start);
  const starts = new Map(), textLinks = new Map();
  links.forEach((link, index) => { starts.set(link.start, index); const group = textLinks.get(link.parentStart) || []; group.push({ ...link, index }); textLinks.set(link.parentStart, group); });
  const view = node => {
    const line = (node.position?.start.line || 1) + lineOffset;
    if (node.type === 'definition') return null;
    if (node.type === 'image' || node.type === 'imageReference') return { type: 'text', value: node.alt || node.url || node.identifier, line };
    if (['link', 'linkReference'].includes(node.type)) {
      const index = starts.get(node.position.start.offset);
      const url = node.url ?? definitions.get(node.identifier) ?? '';
      return index !== undefined ? { type: 'knowledgeLink', index, value: plain(node), line } : { type: 'link', url, value: plain(node), line };
    }
    if (node.type === 'text') {
      const inside = textLinks.get(node.position.start.offset) || [];
      if (!inside.length) return { type: 'text', value: node.value, line };
      const children = [];
      let start = node.position.start.offset;
      for (const link of inside) {
        if (link.start > start) children.push({ type: 'text', value: body.slice(start, link.start).replace(/\\([\p{P}\p{S}])/gu, '$1'), line });
        children.push({ type: 'knowledgeLink', index: link.index, value: link.label, line: link.line });
        start = link.end;
      }
      if (start < node.position.end.offset) children.push({ type: 'text', value: body.slice(start, node.position.end.offset), line });
      return { type: 'group', children, line };
    }
    if (node.type === 'html') return { type: 'text', value: node.value, line };
    if (node.type === 'footnoteReference') return { type: 'text', value: `[^${node.label || node.identifier}]`, line };
    return {
      type: node.type, line,
      ...(typeof node.value === 'string' ? { value: node.value } : {}),
      ...(node.type === 'heading' ? { level: node.depth } : {}),
      ...(node.type === 'list' ? { ordered: node.ordered, start: node.start ?? 1 } : {}),
      ...(node.type === 'listItem' && typeof node.checked === 'boolean' ? { checked: node.checked } : {}),
      ...(node.children ? { children: node.children.map(view).filter(Boolean) } : {}),
    };
  };
  return { links, anchors, view: view(tree) };
}

/** 路径、文件名与别名只在这里消歧；读取范围由调用方传入知识库的路径校验。 */
export function resolveLinks(records, readableName) {
  const paths = new Map(), names = new Map();
  const index = (map, label, record) => {
    const k = key(label), values = map.get(k) || [];
    if (!values.includes(record)) values.push(record);
    map.set(k, values);
  };
  for (const record of records) {
    index(paths, record.path, record);
    for (const label of [path.posix.basename(record.path, '.md'), record.title, ...record.aliases]) index(names, label, record);
  }
  return records.map(record => {
    const links = record.parsed.links.map(link => {
      const result = { kind: link.kind, label: link.label, target: link.target, line: link.line, status: 'missing', candidates: [] };
      let target;
      try { target = (link.kind === 'markdown' ? decodeURIComponent(link.target) : link.target).replaceAll('\\', '/'); }
      catch { return { ...result, status: 'invalid' }; }
      if (/^(?:[a-z][a-z\d+.-]*:|\/)|[\0-\x1f]/i.test(target)) return { ...result, status: 'invalid' };
      const hash = target.indexOf('#');
      const file = (hash < 0 ? target : target.slice(0, hash)).trim();
      const fragment = hash < 0 ? '' : target.slice(hash + 1).trim();
      if (file === '.' || file === '..') return { ...result, status: 'invalid' };
      const segments = file.split('/');
      if (segments.some(part => part !== '.' && part !== '..' && (!part || part.startsWith('.') || /[<>:"|?*\x00-\x1f]|[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) && file) return { ...result, status: 'invalid' };
      const filename = file.replace(/\.md$/i, '') + '.md';
      const relativeTarget = link.kind === 'markdown' || /^\.\.?\//.test(file);
      const normalized = path.posix.normalize(relativeTarget ? path.posix.join(path.posix.dirname(record.path), filename) : filename);
      if (normalized.startsWith('../') || normalized.length > 240) return { ...result, status: 'invalid' };
      let matches = !file ? [record] : paths.get(key(normalized));
      if (!matches && link.kind === 'wiki' && !file.includes('/')) matches = names.get(key(file.replace(/\.md$/i, '')));
      if (!matches?.length) {
        if (path.posix.extname(file) && !/\.md$/i.test(file)) return { ...result, status: 'attachment' };
        // 索引未收录范围外文件不代表文件缺失，缺失节点必须服从同一读取范围。
        try { readableName(normalized); }
        catch (error) { if (error.code === 'PATH') return { ...result, status: 'invalid' }; throw error; }
        // 缺失身份只用于图投影，不可传给实际文件读写；别名和锚点不参与身份。
        const named = link.kind === 'wiki' && !file.includes('/');
        const identity = key(named ? file.replace(/\.md$/i, '') : normalized);
        return { ...result, missingId: `missing:${named ? 'name' : 'path'}:${identity}`, missingTitle: named ? file.replace(/\.md$/i, '').normalize('NFC') : normalized.normalize('NFC') };
      }
      if (matches.length > 1) return { ...result, status: 'ambiguous', candidates: matches.slice(0, 20).map(item => item.path), candidateTotal: matches.length };
      const found = matches[0];
      const resolved = { ...result, status: 'resolved', path: found.path, targetLine: 1 };
      if (!fragment) return resolved;
      const kind = fragment.startsWith('^') ? 'block' : 'heading';
      const value = kind === 'block' ? fragment.slice(1) : fragment;
      const anchors = found.parsed.anchors.filter(anchor => anchor.kind === kind && key(anchor.value) === key(value));
      if (anchors.length !== 1) return { ...resolved, status: anchors.length ? 'fragment_ambiguous' : 'fragment_missing' };
      return { ...resolved, targetLine: anchors[0].line };
    });
    return { ...record, links };
  });
}
