/** 本地文件转换算法；只生成新字节，不访问磁盘、网络或员工配置。 */
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } from 'docx';
import { Inflate, zipSync } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';

export const LIMITS = Object.freeze({ file: 25 * 1024 ** 2, input: 100 * 1024 ** 2, output: 100 * 1024 ** 2, entry: 25 * 1024 ** 2, unpacked: 100 * 1024 ** 2, entries: 2000, cells: 20000, pixels: 32000000, text: 2 * 1024 ** 2, images: 20 });
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => { let n = value; for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ (0xedb88320 & -(n & 1)); return n >>> 0; });
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const C = 'http://schemas.openxmlformats.org/package/2006/content-types';
const types = { docx: ['word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'], xlsx: ['xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'], pptx: ['ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'] };
const fail = message => { throw new Error(message); };

/** 在读取 File 前检查员工选件的数量、扩展名和字节预算。 */
export function validateFiles(files, kind) {
  if (!Array.isArray(files) || !files.length || files.length > (['image', 'zip'].includes(kind) ? LIMITS.images : 1)) fail(['image', 'zip'].includes(kind) ? '请选择 1–20 个文件' : '请选择一个文件');
  const allowed = { image: ['png', 'jpg', 'jpeg', 'webp'], 'word-excel': ['docx'], 'excel-word': ['xlsx'], 'excel-sheets': ['xlsx'], 'excel-csv': ['xlsx'], 'excel-json': ['xlsx'], 'csv-excel': ['csv'], media: ['docx', 'xlsx', 'pptx'], text: ['txt', 'csv', 'json'], zip: [], hash: [] }[kind];
  if (!allowed) fail('未知工具');
  let size = 0;
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || !Number.isSafeInteger(file.size) || file.size < (['zip', 'hash'].includes(kind) ? 0 : 1) || file.size > (kind === 'text' ? LIMITS.text : LIMITS.file)) fail(kind === 'text' ? '文本文件须为 2 MiB 以内的非空文件' : '每个文件须在 25 MiB 以内，Office 与图片文件应非空');
    if (allowed.length && !allowed.includes(file.name.split('.').pop().toLowerCase())) fail('文件扩展名与工具要求不符');
    size += file.size;
  }
  if (size > LIMITS.input) fail('总输入超过 100 MiB');
}

/** 严格 UTF-8；错误编码不以替换字符写入下载产物。 */
export function decodeText(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > LIMITS.text) fail('文本输入超过 2 MiB');
  try { return decoder.decode(bytes); } catch { return fail('文本不是有效 UTF-8，请先另存为 UTF-8'); }
}

function u16(bytes, offset) { return bytes[offset] | bytes[offset + 1] << 8; }
function u32(bytes, offset) { return (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0; }
function utf8(bytes) { try { return decoder.decode(bytes); } catch { return fail('ZIP/XML 包含无效 UTF-8'); } }
function crc32(bytes, crc = 0xffffffff) {
  for (const value of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 255];
  return crc >>> 0;
}
function zipPath(name) {
  if (!name || name.includes('\\') || /[\x00-\x1f\x7f:]/.test(name) || name.startsWith('/') || name.split('/').some((part, i, all) => part === '..' || part === '.' || (!part && i !== all.length - 1))) fail('ZIP 包含不安全路径');
}

/** 先核对中央目录与本地头，再按实际解压增量计数；不相信 ZIP 声明长度。 */
export function readOfficeZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > LIMITS.file || bytes.length < 22) fail('Office 文件大小或 ZIP 格式不正确');
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (u32(bytes, p) === 0x06054b50 && p + 22 + u16(bytes, p + 20) === bytes.length) { end = p; break; }
  }
  if (end < 0 || u16(bytes, end + 4) || u16(bytes, end + 6)) fail('不支持损坏、分卷或 ZIP64 Office 文件');
  const count = u16(bytes, end + 10), start = u32(bytes, end + 16), length = u32(bytes, end + 12);
  if (!count || count > LIMITS.entries || count !== u16(bytes, end + 8) || start + length !== end) fail('ZIP 目录无效或条目超过 2,000 个');
  const entries = [], names = new Set();
  let p = start, declared = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || u32(bytes, p) !== 0x02014b50) fail('ZIP 目录损坏');
    const flags = u16(bytes, p + 8), method = u16(bytes, p + 10), crc = u32(bytes, p + 16), compressed = u32(bytes, p + 20), size = u32(bytes, p + 24), n = u16(bytes, p + 28), extra = u16(bytes, p + 30), comment = u16(bytes, p + 32), local = u32(bytes, p + 42);
    if (p + 46 + n + extra + comment > end || !n || compressed === 0xffffffff || size === 0xffffffff || local === 0xffffffff || u16(bytes, p + 34)) fail('ZIP 目录损坏或使用 ZIP64');
    if (flags & ~0x080e || flags & 1 || ![0, 8].includes(method)) fail('不支持加密或此压缩方式的 Office 文件');
    const rawName = bytes.subarray(p + 46, p + 46 + n), name = utf8(rawName);
    if (!(flags & 0x800) && rawName.some(value => value > 127)) fail('ZIP 文件名必须使用 UTF-8');
    zipPath(name);
    if (names.has(name)) fail('ZIP 包含重复条目');
    names.add(name);
    declared += size;
    if (size > LIMITS.entry || declared > LIMITS.unpacked) fail('Office 解压大小超过限制');
    if (local + 30 > start || u32(bytes, local) !== 0x04034b50 || u16(bytes, local + 6) !== flags || u16(bytes, local + 8) !== method || u16(bytes, local + 26) !== n) fail('ZIP 本地头与目录不一致');
    const data = local + 30 + n + u16(bytes, local + 28);
    if (data + compressed > start || utf8(bytes.subarray(local + 30, local + 30 + n)) !== name) fail('ZIP 条目范围无效');
    if (!(flags & 8) && (u32(bytes, local + 14) !== crc || u32(bytes, local + 18) !== compressed || u32(bytes, local + 22) !== size)) fail('ZIP 条目长度不一致');
    let tail = data + compressed;
    if (flags & 8) {
      if (u32(bytes, tail) === 0x08074b50) tail += 4;
      if (tail + 12 > start || u32(bytes, tail) !== crc || u32(bytes, tail + 4) !== compressed || u32(bytes, tail + 8) !== size) fail('ZIP 数据描述符无效');
      tail += 12;
    }
    if (name.endsWith('/') && size !== 0) fail('ZIP 目录条目包含数据');
    entries.push({ name, method, crc, compressed, size, local, data, tail });
    p += 46 + n + extra + comment;
  }
  if (p !== end) fail('ZIP 目录长度不一致');
  const ranges = [...entries].sort((a, b) => a.local - b.local);
  for (let i = 0; i < ranges.length; i++) if (ranges[i].local !== (i ? ranges[i - 1].tail : 0)) fail('ZIP 存在重叠或未声明数据');
  if (ranges.at(-1).tail !== start) fail('ZIP 包含未声明数据');
  let total = 0;
  const result = new Map();
  for (const entry of entries) {
    const chunks = [];
    let actual = 0, crc = 0xffffffff;
    const consume = chunk => {
      actual += chunk.length; total += chunk.length;
      if (actual > LIMITS.entry || total > LIMITS.unpacked || actual > entry.size) fail('Office 实际解压大小超过限制或声明');
      crc = crc32(chunk, crc); chunks.push(chunk.slice());
    };
    if (entry.method === 0) {
      if (entry.compressed !== entry.size) fail('ZIP 存储条目长度不一致');
      consume(bytes.subarray(entry.data, entry.data + entry.compressed));
    } else {
      const inflate = new Inflate(consume);
      // 小块投递使单次膨胀也有上界；主页面 deadline 可终止整个独占 Worker。
      if (!entry.compressed) fail('ZIP 压缩数据为空');
      for (let offset = 0; offset < entry.compressed; offset += 1024) inflate.push(bytes.subarray(entry.data + offset, entry.data + Math.min(offset + 1024, entry.compressed)), offset + 1024 >= entry.compressed);
    }
    if (actual !== entry.size || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) fail('ZIP 内容长度或校验不符');
    const output = new Uint8Array(actual);
    let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    result.set(entry.name, output);
  }
  return result;
}

function xml(bytes, label) {
  if (!bytes) fail(`Office 缺少 ${label}`);
  const text = utf8(bytes);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) fail('XML 不接受 DTD 或外部实体');
  try {
    return new DOMParser({ onError(level, message) { throw new Error(`${level}: ${message}`); } }).parseFromString(text, 'application/xml');
  } catch { return fail(`${label} XML 格式不正确`); }
}
function elements(node, ns, name) { return Array.from(node.getElementsByTagNameNS(ns, name)); }
function children(node, ns, name) { return Array.from(node.childNodes).filter(child => child.nodeType === 1 && child.namespaceURI === ns && child.localName === name); }

/** 检查实际 OOXML 类型及全部 XML；ExcelJS 读取前不留未检查的 XML 输入。 */
export function inspectOffice(bytes, extension) {
  const specification = types[extension];
  if (!specification) fail('请选择 DOCX、XLSX 或 PPTX 文件');
  const entries = readOfficeZip(bytes), documents = new Map();
  for (const [name, data] of entries) if (/\.(?:xml|rels)$/i.test(name)) documents.set(name, xml(data, name));
  const contentTypes = documents.get('[Content_Types].xml');
  if (!contentTypes || contentTypes.documentElement.namespaceURI !== C || contentTypes.documentElement.localName !== 'Types') fail('文件不是有效 OOXML Office 文件');
  const [main, type] = specification;
  if (!documents.has(main) || !elements(contentTypes, C, 'Override').some(node => node.getAttribute('PartName') === `/${main}` && node.getAttribute('ContentType') === type)) fail('Office 实际类型与扩展名不一致');
  if ([...entries.keys()].some(name => /vbaProject\.bin$/i.test(name))) fail('不处理包含宏的文件');
  return { entries, documents };
}

function output(name, mime, bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!data.length || data.length > LIMITS.output) fail('输出为空或超过 100 MiB');
  return { name, mime, bytes: data };
}
function baseName(name) { return name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120) || '结果'; }
function wordText(node) {
  let text = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType !== 1) continue;
    if (child.namespaceURI === W && child.localName === 't') text += child.textContent;
    else if (child.namespaceURI === W && child.localName === 'tab') text += '\t';
    else if (child.namespaceURI === W && ['br', 'cr'].includes(child.localName)) text += '\n';
    else text += wordText(child);
  }
  return text;
}

/** DOCX 每张非合并、非嵌套表生成一个工作表，单元格始终是文本。 */
export async function wordToExcel(bytes, name) {
  const { documents } = inspectOffice(bytes, 'docx');
  const document = documents.get('word/document.xml');
  if (document.documentElement.namespaceURI !== W || document.documentElement.localName !== 'document') fail('Word 主文档类型不正确');
  const tables = elements(document, W, 'tbl');
  if (!tables.length) fail('Word 文档中没有表格');
  const workbook = new ExcelJS.Workbook();
  let cells = 0;
  for (const [index, table] of tables.entries()) {
    const unsupported = new Set(['sdt', 'customXml', 'ins', 'del', 'delText', 'moveFrom', 'moveTo', 'vanish', 'webHidden', 'altChunk', 'drawing', 'pict', 'object']);
    const nodes = [table, ...Array.from(table.getElementsByTagName('*'))];
    for (let ancestor = table.parentNode; ancestor?.nodeType === 1; ancestor = ancestor.parentNode) nodes.push(ancestor);
    if (nodes.some(node => node.namespaceURI === W && (unsupported.has(node.localName) || node.localName.endsWith('Change')) || node.namespaceURI === 'http://schemas.openxmlformats.org/markup-compatibility/2006' && node.localName === 'AlternateContent')) fail('Word 表格含内容控件、修订、隐藏文字或图形等复杂结构，请先展开控件并接受或拒绝修订，保留普通文本表格');
    if (elements(table, W, 'tbl').length) fail('Word 嵌套表格尚不支持，请先拆成独立表格');
    if (['gridSpan', 'vMerge', 'hMerge', 'gridBefore', 'gridAfter'].some(tag => elements(table, W, tag).length)) fail('Word 合并或不规则单元格尚不支持');
    const sheet = workbook.addWorksheet(`表格${index + 1}`);
    let width = -1;
    for (const row of children(table, W, 'tr')) {
      const columns = children(row, W, 'tc');
      if (!columns.length || (width !== -1 && width !== columns.length)) fail('Word 表格各行列数不一致');
      width = columns.length; cells += columns.length;
      if (cells > LIMITS.cells) fail('表格超过 20,000 个单元格');
      sheet.addRow(columns.map(cell => children(cell, W, 'p').map(wordText).join('\n')));
    }
    if (width === -1) fail('Word 表格没有可提取的行');
  }
  return { files: [output(`${baseName(name)}-表格.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', await workbook.xlsx.writeBuffer())], summary: `已提取 ${tables.length} 张表格、${cells} 个单元格；全部保存为文本` };
}

export async function readWorkbook(bytes) {
  const inspected = inspectOffice(bytes, 'xlsx');
  const bookXml = inspected.documents.get('xl/workbook.xml'), relXml = inspected.documents.get('xl/_rels/workbook.xml.rels');
  if (bookXml.documentElement.namespaceURI !== S || bookXml.documentElement.localName !== 'workbook' || !relXml) fail('工作簿主文档或关系文件无效');
  const relationNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const relationAttribute = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const relations = new Map(), ids = new Set(), names = new Set(), targets = new Set();
  for (const relation of elements(relXml, relationNamespace, 'Relationship')) {
    const id = relation.getAttribute('Id');
    if (!id || relations.has(id)) fail('工作簿关系身份缺失或重复');
    relations.set(id, relation);
  }
  const sheets = elements(bookXml, S, 'sheet');
  if (!sheets.length || sheets.length > LIMITS.entries) fail('工作表数量无效或超过限制');
  for (const sheet of sheets) {
    const idText = sheet.getAttribute('sheetId'), id = Number(idText), name = sheet.getAttribute('name');
    if (!/^[1-9]\d*$/.test(idText) || !Number.isSafeInteger(id) || id > LIMITS.entries || ids.has(id) || !name || name.length > 31 || names.has(name.toLowerCase())) fail('工作表身份无效、重复或超过 2,000');
    ids.add(id); names.add(name.toLowerCase());
    const relation = relations.get(sheet.getAttributeNS(relationAttribute, 'id'));
    if (!relation || relation.getAttribute('Type') !== `${relationAttribute}/worksheet` || relation.getAttribute('TargetMode') === 'External') fail('工作表引用缺失或不是本地工作表');
    const target = relation.getAttribute('Target'), path = target.startsWith('/xl/') ? target.slice(1) : `xl/${target}`;
    const match = /^xl\/worksheets\/sheet([1-9]\d*)\.xml$/.exec(path);
    if (!match || Number(match[1]) > LIMITS.entries || !inspected.documents.has(path) || targets.has(path)) fail('工作表文件引用无效、重复或超过限制');
    targets.add(path);
  }
  // 命名范围也会在 ExcelJS 中展开为地址矩阵；累计预算独立于实际有值单元格。
  let namedCells = 0;
  for (const defined of elements(bookXml, S, 'definedName')) {
    for (const match of defined.textContent.matchAll(/\$([A-Za-z]+)\$(\d+)(?::\$([A-Za-z]+)\$(\d+))?/g)) {
      namedCells += checkRange(`${match[1]}${match[2]}${match[3] ? `:${match[3]}${match[4]}` : ''}`);
      if (namedCells > LIMITS.cells) fail('命名范围累计超过 20,000 个单元格');
    }
  }
  let cells = 0, mergeCells = 0;
  for (const [name, document] of inspected.documents) {
    if (/^xl\/(?:workbook|styles|sharedStrings)\.xml$/.test(name) || /^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
      // ExcelJS 以标签名解析而非 namespaceURI；两者必须一致，才能保证预算检查覆盖其实际输入。
      for (const node of Array.from(document.getElementsByTagName('*'))) if ((!node.prefix && node.namespaceURI !== S) || (node.namespaceURI === S && node.prefix)) fail('Excel XML 命名空间形式尚不支持');
    }
    const sheetRelations = /^xl\/worksheets\/_rels\/sheet(\d+)\.xml\.rels$/.exec(name);
    if (sheetRelations && (!/^[1-9]\d*$/.test(sheetRelations[1]) || Number(sheetRelations[1]) > LIMITS.entries)) fail('工作表关系编号超过限制');
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
      if (!targets.has(name)) fail('工作簿包含未引用工作表');
      if (document.documentElement.namespaceURI !== S || document.documentElement.localName !== 'worksheet') fail('工作表 XML 类型不正确');
      cells += elements(document, S, 'c').length;
      if (cells > LIMITS.cells) fail('工作簿超过 20,000 个单元格');
      for (const row of elements(document, S, 'row')) if (!/^[1-9]\d*$/.test(row.getAttribute('r')) || +row.getAttribute('r') > LIMITS.cells) fail('工作表行范围超过限制');
      // ExcelJS 会按列声明展开数组，必须在调用它之前限制 min/max，而不只检查有值单元格。
      let previousColumn = 0;
      for (const column of elements(document, S, 'col')) {
        const minText = column.getAttribute('min'), maxText = column.getAttribute('max');
        const min = Number(minText), max = Number(maxText);
        if (!/^[1-9]\d*$/.test(minText) || !/^[1-9]\d*$/.test(maxText) || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min <= previousColumn || min > max || max > 16384) fail('工作表列范围无效或超过限制');
        previousColumn = max;
      }
      for (const dimension of elements(document, S, 'dimension')) checkRange(dimension.getAttribute('ref'));
      let maxRow = 0, maxCol = 0;
      for (const cell of elements(document, S, 'c')) {
        const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(cell.getAttribute('r'));
        if (!match) fail('工作表单元格坐标无效');
        const col = [...match[1]].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
        maxRow = Math.max(maxRow, +match[2]); maxCol = Math.max(maxCol, col);
        if (maxRow * maxCol > LIMITS.cells) fail('工作表有效范围超过 20,000 个单元格');
      }
      for (const merge of elements(document, S, 'mergeCell')) {
        mergeCells += checkRange(merge.getAttribute('ref'));
        if (mergeCells > LIMITS.cells) fail('合并范围累计超过 20,000 个单元格');
      }
    }
  }
  const workbook = new ExcelJS.Workbook();
  // 数据验证不参与文字表格导出；ExcelJS 官方忽略选项避免按 sqref 展开无关规则。
  await workbook.xlsx.load(bytes, { ignoreNodes: ['dataValidations'] });
  if (!workbook.worksheets.length) fail('Excel 中没有工作表');
  return workbook;
}

function checkRange(reference) {
  const match = /^([A-Z]{1,3})([1-9]\d*)(?::([A-Z]{1,3})([1-9]\d*))?$/.exec(reference);
  if (!match) fail('工作表范围无效');
  const colNumber = value => [...value].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
  const startCol = colNumber(match[1]), startRow = Number(match[2]), endCol = colNumber(match[3] || match[1]), endRow = Number(match[4] || match[2]);
  if (!Number.isSafeInteger(endRow) || startCol > endCol || startRow > endRow || endCol > 16384 || endRow * endCol > LIMITS.cells) fail('工作表范围无效或超过 20,000 个单元格');
  return (endRow - startRow + 1) * (endCol - startCol + 1);
}

/** 只读取工作表名称，不选择默认表，也不生成文件。 */
export async function excelSheets(bytes) { return { sheets: (await readWorkbook(bytes)).worksheets.map(sheet => sheet.name) }; }

export function excelText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('Excel 包含无效数字'); return String(value); }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) fail('Excel 包含无效日期');
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 23).replace(/\.000$/, '')} UTC`;
  }
  if ('formula' in value || 'sharedFormula' in value) {
    if (!Object.hasOwn(value, 'result') || value.result === undefined || value.result === null) fail('Excel 公式没有已保存结果，请先在 Excel 中计算并保存');
    return excelText(value.result);
  }
  if ('error' in value) return value.error;
  if ('richText' in value) return value.richText.map(part => part.text).join('');
  if ('hyperlink' in value) return value.text || value.hyperlink;
  return fail('Excel 包含尚不支持的单元格类型');
}

function scalarBytes(text, index) {
  const code = text.charCodeAt(index);
  if (code < 0x80) return [1, 1];
  if (code < 0x800) return [2, 1];
  if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) return [4, 2];
  return [3, 1];
}

function wordTextBudget(text) {
  let bytes = 0, paragraphs = 1;
  for (let i = 0; i < text.length;) {
    const char = text[i], code = text.charCodeAt(i);
    if (char === '\r' || char === '\n') { paragraphs++; if (char === '\r' && text[i + 1] === '\n') i++; i++; continue; }
    if (code < 32 && char !== '\t') fail('Excel 文字含 Word XML 不接受的控制字符');
    if (char === '&') { bytes += 5; i++; }
    else if (char === '<' || char === '>') { bytes += 4; i++; }
    else if (char === '"' || char === "'") { bytes += 6; i++; }
    else { const [size, width] = scalarBytes(text, i); bytes += size; i += width; }
  }
  // 为每个段落、文字节点及其属性预留构建空间，避免换行密集输入生成海量对象。
  return bytes + paragraphs * 2048;
}

function jsonQuotedBytes(text) {
  let bytes = 2;
  for (let i = 0; i < text.length;) {
    const code = text.charCodeAt(i);
    if (text[i] === '"' || text[i] === '\\' || [8, 9, 10, 12, 13].includes(code)) { bytes += 2; i++; }
    else if (code < 32) { bytes += 6; i++; }
    else {
      const [size, width] = scalarBytes(text, i);
      bytes += width === 1 && code >= 0xd800 && code <= 0xdfff ? 6 : size;
      i += width;
    }
  }
  return bytes;
}

function checkJsonRowsBudget(header, rows) {
  if (!rows.length) return;
  const keys = header.map(jsonQuotedBytes);
  let bytes = 3;
  for (let r = 0; r < rows.length; r++) {
    bytes += 8 + (r < rows.length - 1 ? 1 : 0);
    for (let c = 0; c < header.length; c++) {
      bytes += 7 + keys[c] + jsonQuotedBytes(rows[r][c]) + (c < header.length - 1 ? 1 : 0);
      if (bytes > LIMITS.output) fail('JSON 展开输出超过 100 MiB，请缩短表头或减少行数');
    }
  }
}

/** 员工明确选择工作表后导出可编辑 Word 表格，不执行公式或外部链接。 */
export async function excelToWord(bytes, name, sheetName) {
  if (typeof sheetName !== 'string' || !sheetName) fail('请先读取并选择工作表');
  const workbook = await readWorkbook(bytes), sheet = workbook.getWorksheet(sheetName);
  if (!sheet) fail('所选工作表不存在，请重新读取');
  if (sheet.model.merges?.length) fail('所选工作表存在合并单元格，请先取消合并');
  const rows = sheet.rowCount, cols = sheet.columnCount;
  if (!rows || !cols) fail('所选工作表为空');
  if (rows * cols > LIMITS.cells) fail('工作表有效范围超过 20,000 个单元格');
  // 共享字符串可被数千个单元格引用；ZIP 大小与单元格数量都不代表展开文字规模。
  let expanded = 64 * 1024 + rows * 256 + rows * cols * 512 + cols * 128;
  const textCosts = new Map();
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    const text = excelText(sheet.getCell(r, c).value);
    let cost = textCosts.get(text);
    if (cost === undefined) { cost = wordTextBudget(text); textCosts.set(text, cost); }
    expanded += cost;
    if (expanded > LIMITS.output) fail('Word 展开文字与节点构建预算超过 100 MiB，请减少所选表内容');
  }
  const tableRows = [];
  for (let r = 1; r <= rows; r++) {
    const cells = [];
    for (let c = 1; c <= cols; c++) {
      const text = excelText(sheet.getCell(r, c).value);
      cells.push(new TableCell({ children: text.split(/\r\n|\n|\r/).map(line => new Paragraph({ children: [new TextRun(line)] })) }));
    }
    tableRows.push(new TableRow({ children: cells }));
  }
  const note = '仅导出保存的数值与文字，不迁移数字显示格式、样式与图表；公式使用文件内已有结果，数据验证规则不迁移';
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(sheetName)] }), new Paragraph(note), new Table({ rows: tableRows })] }] });
  return { files: [output(`${baseName(name)}-${baseName(sheetName)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', await Packer.toArrayBuffer(doc))], summary: `${rows} 行 × ${cols} 列；${note}` };
}

/** 仅导出 Office 包内 media，ZIP 内路径保留来源目录，不执行嵌入内容。 */
export function extractMedia(bytes, name) {
  const extension = name.split('.').pop().toLowerCase(), { entries } = inspectOffice(bytes, extension);
  const files = Object.create(null), listing = [];
  const prefix = { docx: 'word', xlsx: 'xl', pptx: 'ppt' }[extension];
  let total = 0;
  for (const [path, data] of entries) if (path.startsWith(`${prefix}/media/`) && !path.endsWith('/')) {
    files[path] = data; total += data.length; listing.push(`${path}\t${data.length} 字节`);
  }
  if (!listing.length) fail('Office 文件中没有内置媒体资源');
  files['资源清单.txt'] = encoder.encode(listing.join('\n'));
  if (total + files['资源清单.txt'].length > LIMITS.output) fail('输出超过 100 MiB');
  return { files: [output(`${baseName(name)}-资源.zip`, 'application/zip', zipSync(files, { level: 0 }))], summary: `已提取 ${listing.length} 个内置媒体；不包含在线视频或网页链接解析`, listing };
}

/** 严格 CSV 解析，保留字段换行与空格，不猜测数值。 */
export function parseCsv(text) {
  if (typeof text !== 'string' || encoder.encode(text).length > LIMITS.text) fail('文本输入超过 2 MiB');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  const push = () => { row.push(field); field = ''; closed = false; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += ch;
    } else if (ch === ',') push();
    else if (ch === '\r' || ch === '\n') { push(); rows.push(row); row = []; if (ch === '\r' && text[i + 1] === '\n') i++; }
    else if (ch === '"' && !field && !closed) quoted = true;
    else if (closed || ch === '"') fail('CSV 引号格式不正确');
    else field += ch;
  }
  if (quoted) fail('CSV 存在未闭合引号');
  if (field || closed || row.length || !rows.length) { push(); rows.push(row); }
  const header = rows[0];
  if (!header.length || header.some(name => !name.trim()) || new Set(header).size !== header.length) fail('CSV 表头必须非空且唯一');
  if (rows.some(item => item.length !== header.length)) fail('CSV 各行字段数量不一致');
  return rows;
}

/** 文本处理只返回下载结果；CSV 输出显式计数公式触发字符转义。 */
export function transformText(text, operation) {
  if (typeof text !== 'string' || encoder.encode(text).length > LIMITS.text) fail('文本输入超过 2 MiB');
  let content, extension = 'txt', changed = 0, summary;
  if (operation === 'csv-json') {
    const [header, ...rows] = parseCsv(text);
    checkJsonRowsBudget(header, rows);
    content = JSON.stringify(rows.map(row => Object.fromEntries(header.map((key, index) => [key, row[index]]))), null, 2);
    extension = 'json'; summary = `已转换 ${rows.length} 行；所有字段均为字符串`;
  } else if (operation === 'json-csv') {
    let rows;
    try { rows = JSON.parse(text); } catch { return fail('JSON 格式不正确'); }
    if (!Array.isArray(rows) || !rows.length || rows.some(row => row === null || typeof row !== 'object' || Array.isArray(row))) fail('JSON 须为非空的扁平对象数组');
    const keys = Object.keys(rows[0]);
    if (!keys.length || keys.some(key => !key.trim()) || rows.some(row => Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key) || typeof row[key] !== 'string'))) fail('JSON 各行须有相同非空键，所有值必须为字符串');
    const escape = value => {
      if (/^[=+\-@＝＋－＠\t\r\n]/.test(value)) { value = `'${value}`; changed++; }
      return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    };
    const header = keys.map(escape);
    if (new Set(header).size !== header.length) fail('CSV 表头在公式转义后发生重名，请修改 JSON 键');
    content = [header.join(','), ...rows.map(row => keys.map(key => escape(row[key])).join(','))].join('\r\n');
    extension = 'csv'; summary = `已转换 ${rows.length} 行；已为 ${changed} 个公式触发字段添加单引号`;
  } else if (operation === 'dedupe' || operation === 'remove-empty') {
    const lines = text.split(/\r\n|\n|\r/);
    const result = operation === 'dedupe' ? [...new Set(lines)] : lines.filter(line => line.trim().length);
    content = result.join('\n'); summary = `${lines.length} 行 → ${result.length} 行；输出换行为 LF`;
  } else if (operation === 'statistics') {
    const statistics = { 字符数: [...text].length, UTF8字节数: encoder.encode(text).length, 行数: text ? text.split(/\r\n|\n|\r/).length : 0 };
    content = JSON.stringify(statistics, null, 2); extension = 'json'; summary = Object.entries(statistics).map(([key, value]) => `${key}：${value}`).join('；');
  } else fail('未知文本操作');
  // 空文本清理仍需可下载，因此不使用拒收零字节的 Office 输出包装。
  const bytes = encoder.encode(content);
  if (bytes.length > LIMITS.output) fail('输出超过 100 MiB');
  return { files: [{ name: `处理结果.${extension}`, mime: extension === 'json' ? 'application/json;charset=utf-8' : extension === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8', bytes }], summary, changed };
}

function textOutput(text, name, summary) {
  if (typeof text !== 'string' || text.length > LIMITS.output) fail('输出超过 100 MiB');
  const bytes = encoder.encode(text);
  if (bytes.length > LIMITS.output) fail('输出超过 100 MiB');
  return { files: [{ name, mime: 'text/plain;charset=utf-8', bytes }], summary };
}

/** 复用同一工作簿校验与值解释，不另建 CSV/Excel 数据规则。 */
export async function convertSpreadsheet(bytes, name, mode, sheetName) {
  if (mode === 'csv-excel') {
    const rows = parseCsv(decodeText(bytes));
    if (rows.length * rows[0].length > LIMITS.cells || rows.some(row => row.some(value => value.length > 32767))) fail('CSV 超过 20,000 个单元格或单元格文字超过 32,767 字符');
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('数据');
    for (const row of rows) sheet.addRow(row);
    return { files: [output(`${baseName(name)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', await book.xlsx.writeBuffer())], summary: `${rows.length} 行已保存为文本，前导零保留，不执行公式` };
  }
  if (!['excel-csv', 'excel-json'].includes(mode)) fail('未知表格转换方式');
  const sheet = (await readWorkbook(bytes)).getWorksheet(sheetName);
  if (!sheetName || !sheet) fail('请先读取并选择工作表');
  if (sheet.model.merges?.length) fail('所选工作表存在合并单元格');
  const rows = sheet.rowCount, cols = sheet.columnCount;
  if (!rows || !cols || rows * cols > LIMITS.cells) fail('所选表为空或超过 20,000 个单元格');
  const values = []; let expanded = 0;
  for (let r = 1; r <= rows; r++) {
    const row = [];
    for (let c = 1; c <= cols; c++) {
      const value = excelText(sheet.getCell(r, c).value);
      expanded += jsonQuotedBytes(value) + 8;
      if (expanded > LIMITS.output) fail('表格展开输出超过 100 MiB');
      row.push(value);
    }
    values.push(row);
  }
  const [header, ...data] = values;
  if (header.some(value => !value.trim()) || new Set(header).size !== header.length) fail('首行表头必须非空且唯一');
  if (mode === 'excel-json') {
    checkJsonRowsBudget(header, data);
    const result = textOutput(JSON.stringify(data.map(row => Object.fromEntries(header.map((key, i) => [key, row[i]]))), null, 2), `${baseName(name)}-${baseName(sheetName)}.json`, '已导出字符串值 JSON；使用保存原值，不迁移数字显示格式');
    result.files[0].mime = 'application/json;charset=utf-8'; return result;
  }
  let changed = 0, size = 0;
  const lines = values.map(row => row.map(value => {
    if (/^[=+\-@＝＋－＠\t\r\n]/.test(value)) { value = `'${value}`; changed++; }
    const field = /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    size += encoder.encode(field).length + 2;
    if (size > LIMITS.output) fail('CSV 输出超过 100 MiB');
    return field;
  }).join(','));
  // 转义可能使两个不同表头变成同名，导出前再次拒收。
  parseCsv(lines[0]);
  const result = textOutput(lines.join('\r\n'), `${baseName(name)}-${baseName(sheetName)}.csv`, `已导出 ${data.length} 行；${changed} 个公式触发字段添加单引号；使用原值，不保留数字显示格式`);
  result.files[0].mime = 'text/csv;charset=utf-8'; return result;
}

/** 明确输入与操作的小工具；只返回可下载文本，所有转换均不执行内容。 */
export function smallTextTool(tool, text, options = {}) {
  if (typeof text !== 'string' || encoder.encode(text).length > LIMITS.text) fail('文本输入超过 2 MiB');
  let result, summary;
  if (tool === 'line-compare') {
    if (typeof options.other !== 'string' || encoder.encode(options.other).length > LIMITS.text) fail('另一段文本超过 2 MiB');
    if (!['common', 'left', 'right'].includes(options.mode)) fail('请选择共同、仅左或仅右');
    const a = new Set(text.split(/\r\n|\r|\n/)), b = new Set(options.other.split(/\r\n|\r|\n/));
    result = [...(options.mode === 'right' ? b : a)].filter(line => options.mode === 'common' ? b.has(line) : options.mode === 'left' ? !b.has(line) : !a.has(line)).join('\n');
    summary = '逐行精确集合比较，重复行折叠，保留原行空格，结果换行为 LF';
  } else if (tool === 'text-case') {
    const operations = { upper: () => text.toUpperCase(), lower: () => text.toLowerCase(), trim: () => text.split(/\r\n|\r|\n/).map(line => line.trim()).join('\n'), spaces: () => text.replace(/[^\S\r\n]+/g, ' ') };
    if (!Object.hasOwn(operations, options.mode)) fail('请选择文本整理方式');
    result = operations[options.mode](); summary = '已按所选规则整理，原输入保持不变';
  } else if (tool === 'url-codec') {
    try { if (options.mode === 'encode') result = encodeURIComponent(text); else if (options.mode === 'decode') result = decodeURIComponent(text); else fail('请选择编码或解码'); } catch { fail('URL 组件编码无效或含不完整 Unicode'); }
    summary = '处理单个 URL 组件；不作为完整网址导航，也不发送网络请求';
  } else if (tool === 'base64') {
    if (options.mode === 'encode') {
      const bytes = encoder.encode(text); let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      result = btoa(binary);
    } else if (options.mode === 'decode') {
      const pad = text.indexOf('=');
      if (text.length % 4 || /[^A-Za-z0-9+/=]/.test(text) || pad !== -1 && (pad < text.length - 2 || !/^={1,2}$/.test(text.slice(pad)))) fail('请输入标准 Base64，保留正确补位且不含空白');
      const binary = atob(text);
      if (btoa(binary) !== text) fail('Base64 补位比特不正确');
      try { result = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0))); } catch { fail('Base64 内容不是 UTF-8 文本'); }
    } else fail('请选择编码或解码');
    summary = '仅处理 UTF-8 文本和标准 Base64，不执行解码内容';
  } else if (tool === 'timestamp') {
    const value = text.trim(); let date;
    if (options.mode === 'seconds' || options.mode === 'milliseconds') {
      if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) fail('请输入安全整数时间戳，并明确秒或毫秒');
      const ms = Number(value) * (options.mode === 'seconds' ? 1000 : 1);
      if (!Number.isSafeInteger(ms) || Math.abs(ms) > 8640000000000000) fail('时间戳超出范围');
      date = new Date(ms);
    } else if (options.mode === 'iso') {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
      if (!match || +match[2] < 1 || +match[2] > 12 || +match[3] < 1 || +match[3] > [31, (+match[1] % 4 === 0 && (+match[1] % 100 !== 0 || +match[1] % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][+match[2] - 1] || +match[4] > 23 || +match[5] > 59 || +match[6] > 59) fail('请输入包含 Z 或时区偏移的有效 ISO 日期时间');
      date = new Date(value);
    } else fail('请选择时间输入单位');
    if (!Number.isFinite(date.getTime())) fail('日期时间无效');
    result = `UTC：${date.toISOString()}\n北京时间：${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'long' }).format(date)}\n秒：${date.getTime() / 1000}\n毫秒：${date.getTime()}`;
    summary = '单位与时区显式转换，不使用设备本地时区猜测';
  } else if (tool === 'uuid') {
    if (!Number.isInteger(options.count) || options.count < 1 || options.count > 1000) fail('UUID 数量须为 1–1,000');
    if (typeof globalThis.crypto?.randomUUID !== 'function') fail('当前环境缺少安全 UUID 生成能力');
    result = Array.from({ length: options.count }, () => crypto.randomUUID()).join('\n'); summary = `已生成 ${options.count} 个 UUID v4`;
  } else fail('未知文本工具');
  return textOutput(result, `${tool}-结果.txt`, summary);
}

/** 摘要与归档只读取当前选件，不访问文件路径或执行归档内容。 */
export async function fileTool(tool, files, options = {}) {
  validateFiles(files, tool);
  if (tool === 'hash') {
    if (!globalThis.crypto?.subtle) fail('当前环境缺少 SHA-256 能力');
    const expected = String(options.expected || '').trim().toLowerCase();
    if (expected && !/^[a-f0-9]{64}$/.test(expected)) fail('待比较摘要应为 64 位十六进制 SHA-256');
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    if (bytes.length !== files[0].size) fail('文件读取长度不一致');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    return textOutput(`${hash}  ${files[0].name}\n`, 'SHA256.txt', expected ? hash === expected ? '摘要一致；不代表文件来源可信' : '摘要不一致' : '已计算 SHA-256；摘要不证明来源可信');
  }
  if (tool !== 'zip') fail('未知文件工具');
  const entries = Object.create(null), seen = new Set();
  for (const file of files) {
    if (/[\\/:\x00-\x1f]/.test(file.name) || ['.', '..'].includes(file.name) || seen.has(file.name.toLowerCase())) fail('文件名不安全或存在同名文件，请先改名');
    seen.add(file.name.toLowerCase());
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length !== file.size) fail('文件读取长度不一致');
    entries[file.name] = bytes;
  }
  // 存储式 ZIP 不重复压缩媒体，构建前为目录和文件头计入开销。
  const size = files.reduce((n, file) => n + file.size + encoder.encode(file.name).length * 2 + 100, 22);
  if (size > LIMITS.output) fail('ZIP 输出超过 100 MiB');
  return { files: [output('文件归档.zip', 'application/zip', zipSync(entries, { level: 0 }))], summary: `已打包 ${files.length} 个文件，原件保持不变` };
}
