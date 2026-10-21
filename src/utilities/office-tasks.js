/** 表格只消费已保存值；原有 OOXML 校验是所有 Office 工具的唯一读取边界。 */
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { zipSync } from 'fflate';
import { LIMITS, readWorkbook, excelText, inspectOffice } from './core.js';

export const safeBase = name => String(name).replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || '结果';
export function resultFile(name, mime, bytes, summary) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!bytes.length || bytes.length > LIMITS.output) throw new Error('输出为空或超过 100 MiB');
  return { files: [{ name, mime, bytes }], summary };
}
export function textResult(text, name, summary) {
  return resultFile(name, 'text/plain;charset=utf-8', new TextEncoder().encode(text), summary);
}
export async function selectedBytes(files, extensions, maximum = 1) {
  if (!Array.isArray(files) || !files.length || files.length > maximum) throw new Error(`请选择 1–${maximum} 个文件`);
  for (const f of files) if (!f || typeof f.name !== 'string' || !extensions.includes(f.name.split('.').pop().toLowerCase()) || !Number.isSafeInteger(f.size) || f.size < 1 || f.size > LIMITS.file) throw new Error('文件格式不符或单文件超过 25 MiB');
  if (files.reduce((n, f) => n + f.size, 0) > LIMITS.input) throw new Error('总输入超过 100 MiB');
  const values = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (bytes.length !== f.size) throw new Error('文件读取长度不一致');
    values.push({ name: f.name, bytes });
  }
  return values;
}
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const descendants = (node, name) => Array.from(node.getElementsByTagNameNS(W, name));
export const wordChildren = (node, name) => Array.from(node.childNodes).filter(n => n.nodeType === 1 && n.namespaceURI === W && (!name || n.localName === name));
export function paragraphText(node) {
  let text = '';
  const walk = n => { for (const c of Array.from(n.childNodes)) { if (c.nodeType !== 1) continue; if (c.namespaceURI === W && c.localName === 't') text += c.textContent; else if (c.namespaceURI === W && c.localName === 'tab') text += '\t'; else if (c.namespaceURI === W && ['br', 'cr'].includes(c.localName)) text += '\n'; else walk(c); } };
  walk(node); return text;
}
export function wordDocument(bytes) {
  const source = inspectOffice(bytes, 'docx'), document = source.documents.get('word/document.xml');
  const body = descendants(document, 'body')[0];
  if (!body) throw new Error('Word 缺少正文');
  // 有修订、内容控件和隐藏内容时不猜测员工希望接受哪一份正文。
  if (['ins', 'del', 'sdt', 'vanish', 'altChunk'].some(n => descendants(body, n).length)) throw new Error('请先接受修订并移除隐藏文字或内容控件后再转换');
  if (paragraphText(body).length > LIMITS.text) throw new Error('Word 正文超过 2 MiB 字符预算');
  return { ...source, body };
}
export async function makeWord(paragraphs, name, summary) {
  if (paragraphs.reduce((n, p) => n + (typeof p === 'string' ? p.length : 128), 0) > LIMITS.text) throw new Error('Word 文字超过处理预算');
  const document = new Document({ sections: [{ children: paragraphs.map(p => typeof p === 'string' ? new Paragraph({ children: [new TextRun(p)] }) : p) }] });
  // Worker 没有 Node Buffer；统一使用 docx 的跨环境 ArrayBuffer 输出。
  return resultFile(name, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', await Packer.toArrayBuffer(document), summary);
}
function tableValues(sheet) {
  if (sheet.model.merges?.length) throw new Error(`工作表 ${sheet.name} 含合并单元格`);
  if (!sheet.rowCount || !sheet.columnCount || sheet.rowCount * sheet.columnCount > LIMITS.cells) throw new Error('工作表为空或超过 20,000 个单元格');
  let total = 0;
  return Array.from({ length: sheet.rowCount }, (_, r) => Array.from({ length: sheet.columnCount }, (_, c) => {
    const value = excelText(sheet.getCell(r + 1, c + 1).value); total += value.length * 4 + 16;
    if (total > LIMITS.output) throw new Error('工作表展开超过 100 MiB');
    return value;
  }));
}
function headerCheck(rows) {
  const header = rows[0];
  if (header.some(v => !v.trim()) || new Set(header).size !== header.length) throw new Error('首行表头须非空且唯一');
  return header;
}
async function workbookOutput(sheets, name, summary) {
  if (sheets.reduce((n, s) => n + s.rows.length * (s.rows[0]?.length || 0), 0) > LIMITS.cells) throw new Error('结果超过 20,000 个单元格');
  const book = new ExcelJS.Workbook();
  for (const { name: label, rows } of sheets) {
    const sheet = book.addWorksheet(label.slice(0, 31)); rows.forEach(row => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return resultFile(name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', await book.xlsx.writeBuffer(), summary + '；全部导出为保存值，不迁移公式、格式或图表');
}
export async function officeTask(tool, files, options = {}, text = '') {
  if (tool === 'text-replace') {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMITS.text || typeof options.find !== 'string' || !options.find || typeof options.replacement !== 'string') throw new Error('请输入 2 MiB 以内文本、非空查找词和替换内容');
    const count = text.split(options.find).length - 1;
    if (text.length + count * Math.max(0, options.replacement.length - options.find.length) > LIMITS.text) throw new Error('替换后的文本超过 2 MiB 字符预算');
    return textResult(text.replaceAll(options.find, options.replacement), '替换结果.txt', `已按字面替换 ${count} 处`);
  }
  if (tool.startsWith('word-')) {
    const inputs = await selectedBytes(files, ['docx'], tool === 'word-compare' ? 2 : 1);
    if (tool === 'word-compare' && inputs.length !== 2) throw new Error('请选择两个 Word 文档，原版在前、新版在后');
    const paragraphs = inputs.map(input => descendants(wordDocument(input.bytes).body, 'p').map(paragraphText));
    if (tool === 'word-text') return textResult(paragraphs[0].join('\n'), `${safeBase(inputs[0].name)}.txt`, '已提取正文段落与表格文字；未导出页眉页脚和图片');
    const old = new Set(paragraphs[0]), next = new Set(paragraphs[1]);
    const removed = paragraphs[0].filter(p => !next.has(p)), added = paragraphs[1].filter(p => !old.has(p));
    return makeWord(['Word 正文对照', `原版：${inputs[0].name}`, `新版：${inputs[1].name}`, '原版独有段落', ...removed, '新版独有段落', ...added, '原版完整正文', ...paragraphs[0], '新版完整正文', ...paragraphs[1]], 'Word正文对照.docx', `原版独有 ${removed.length} 段，新版独有 ${added.length} 段；顺序或重复次数变化请核对随附双方全文，格式不参与比较`);
  }
  const multiple = ['excel-merge', 'excel-compare'].includes(tool);
  const inputs = await selectedBytes(files, ['xlsx'], multiple ? 20 : 1);
  const books = []; let inputCells = 0, expanded = 0;
  for (const input of inputs) {
    const book = await readWorkbook(input.bytes);
    for (const sheet of book.worksheets) {
      inputCells += sheet.rowCount * sheet.columnCount;
      if (inputCells > LIMITS.cells) throw new Error('所选文件累计超过 20,000 个单元格');
      sheet.eachRow(row => row.eachCell(cell => { expanded += excelText(cell.value).length * 4 + 16; if (expanded > LIMITS.output) throw new Error('所选文件累计展开超过 100 MiB'); }));
    }
    books.push(book);
  }
  const all = books.flatMap(book => book.worksheets);
  if (tool === 'excel-split') {
    if (all.length > 20) throw new Error('每次最多拆分 20 张工作表');
    const entries = {}; let total = 0;
    for (const [i, sheet] of all.entries()) {
      const out = await workbookOutput([{ name: sheet.name, rows: tableValues(sheet) }], `${i + 1}-${safeBase(sheet.name)}.xlsx`, '工作表拆分');
      total += out.files[0].bytes.length; if (total > LIMITS.output) throw new Error('拆分输出超过 100 MiB'); entries[out.files[0].name] = out.files[0].bytes;
    }
    return resultFile('拆分工作表.zip', 'application/zip', zipSync(entries, { level: 0 }), `已拆分 ${all.length} 张表；保存值导出，不迁移公式、格式或图表`);
  }
  if (tool === 'excel-merge') {
    const tables = all.map(tableValues), header = headerCheck(tables[0]);
    if (tables.some(rows => JSON.stringify(headerCheck(rows)) !== JSON.stringify(header))) throw new Error('合并要求所有工作表表头与顺序完全相同');
    return workbookOutput([{ name: '合并数据', rows: [header, ...tables.flatMap(rows => rows.slice(1))] }], '合并数据.xlsx', `已合并 ${all.length} 张工作表`);
  }
  if (tool === 'excel-compare') {
    if (all.length !== 2) throw new Error('请选择总共恰好包含两张工作表的文件');
    const [left, right] = all.map(tableValues), header = headerCheck(left);
    if (JSON.stringify(header) !== JSON.stringify(headerCheck(right))) throw new Error('两表表头与列顺序须完全一致');
    const l = new Set(left.slice(1).map(JSON.stringify)), r = new Set(right.slice(1).map(JSON.stringify));
    return workbookOutput([{ name: '仅原表', rows: [header, ...left.slice(1).filter(row => !r.has(JSON.stringify(row)))] }, { name: '仅新表', rows: [header, ...right.slice(1).filter(row => !l.has(JSON.stringify(row)))] }, { name: '两表共有', rows: [header, ...left.slice(1).filter(row => r.has(JSON.stringify(row)))] }], '数据核对.xlsx', '按整行保存值核对，不把重复次数变化当作新增或删除');
  }
  const sheet = books[0].getWorksheet(options.sheetName);
  if (!options.sheetName || !sheet) throw new Error('请先读取并选择工作表');
  const [header, ...data] = tableValues(sheet); headerCheck([header]); let rows;
  const columns = String(options.columns || '').split(',').map(s => s.trim()).filter(Boolean);
  const index = header.indexOf(columns[0]);
  if (tool === 'excel-clean') rows = data.map(row => row.map(v => v.trim())).filter(row => row.some(Boolean));
  else if (tool === 'excel-dedupe') {
    if (!columns.length || columns.some(c => !header.includes(c))) throw new Error('请输入现有表头名称，以英文逗号分隔');
    const seen = new Set(); rows = data.filter(row => { const key = JSON.stringify(columns.map(c => row[header.indexOf(c)])); if (seen.has(key)) return false; seen.add(key); return true; });
  } else if (tool === 'excel-filter') {
    if (columns.length !== 1 || index < 0 || !['equals', 'contains', 'not-empty'].includes(options.match)) throw new Error('请选择有效列名和筛选条件');
    rows = data.filter(row => options.match === 'not-empty' ? row[index].trim() !== '' : options.match === 'equals' ? row[index] === String(options.value || '') : row[index].includes(String(options.value || '')));
  } else if (tool === 'excel-sort') {
    if (columns.length !== 1 || index < 0 || !['text', 'number'].includes(options.sortType) || !['asc', 'desc'].includes(options.order)) throw new Error('请选择有效列名与排序方式');
    if (options.sortType === 'number' && data.some(row => !row[index].trim() || !Number.isFinite(Number(row[index])))) throw new Error('数值排序列含空值或非数字，请先清理或改用文本排序');
    rows = [...data].sort((a, b) => (options.sortType === 'number' ? Number(a[index]) - Number(b[index]) : a[index].localeCompare(b[index], 'zh-CN')) * (options.order === 'desc' ? -1 : 1));
  } else throw new Error('未知 Office 工具');
  return workbookOutput([{ name: sheet.name, rows: [header, ...rows] }], `${safeBase(inputs[0].name)}-整理.xlsx`, `${data.length} 行输入，${rows.length} 行输出`);
}
