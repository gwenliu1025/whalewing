import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { runUtility } from '../src/utilities/worker.js';
import { utilityCatalog, utilityTools } from '../src/utilities/catalog.js';
import { pageSelection } from '../src/utilities/pdf.js';
import { inspectOffice, LIMITS } from '../src/utilities/core.js';
const require = createRequire(new URL('../src/utilities/core.js', import.meta.url));
const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, ImageRun } = require('docx');
const { PDFDocument, PDFName } = require('pdf-lib');
const { unzipSync, zipSync } = require('fflate');
const file = (name, bytes) => ({ name, size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer });
const word = async () => Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('实施交付说明 中文合同测试'), new Paragraph('验收范围：银行业务系统升级。'), new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('科目编码')] }), new TableCell({ children: [new Paragraph('科目名称')] })] }), new TableRow({ children: [new TableCell({ children: [new Paragraph('001')] }), new TableCell({ children: [new Paragraph('现金')] })] })] })] }] }));
const excel = async (name = '数据', rows = [['编码', '名称'], ['001', '现金'], ['001', '现金'], ['002', '银行']]) => { const book = new ExcelJS.Workbook(); book.addWorksheet(name).addRows(rows); return book.xlsx.writeBuffer(); };
test('目录7个工具40项功能且唯一，仍不含截图否定的编码卡片与错误WordExcel方向', () => {
  assert.equal(utilityTools.length, 7); assert.equal(utilityCatalog.length, 40); assert.equal(new Set(utilityCatalog.map(i => i.id)).size, 40);
  assert.ok(utilityTools.every(tool => tool.functions.length >= 3 && tool.functions.every(item => item.tool === tool.id)));
  for (const id of ['word-excel', 'excel-word', 'uuid', 'zip', 'base64', 'url-codec', 'timestamp', 'hash', 'line-compare']) assert.ok(!utilityCatalog.some(i => i.id === id));
});
test('页码解析保留用户顺序并拒收重复、越界和超预算', () => {
  assert.deepEqual(pageSelection('3,1-2', 3), [2, 0, 1]);
  for (const value of ['1,1', '0', '4', '2-1', 'a']) assert.throws(() => pageSelection(value, 3));
});
test('中文Word正文和规则表格生成PDF，再回转可编辑DOCX', async () => {
  const pdf = await runUtility({ tool: 'word-pdf', files: [file('验收.docx', await word())] });
  assert.equal(pdf.files[0].mime, 'application/pdf');
  assert.equal((await PDFDocument.load(pdf.files[0].bytes)).getPageCount(), 1);
  const txt = await runUtility({ tool: 'pdf-text', files: [file('验收.pdf', pdf.files[0].bytes)] });
  assert.match(new TextDecoder().decode(txt.files[0].bytes), /实施交付说明/);
  const docx = await runUtility({ tool: 'pdf-word', files: [file('验收.pdf', pdf.files[0].bytes)] });
  const content = inspectOffice(docx.files[0].bytes, 'docx').documents.get('word/document.xml').documentElement.textContent;
  for (const expected of ['实施交付说明', '中文合同测试', '验收范围', '银行业务系统升级', '科目编码', '科目名称', '001', '现金']) assert.ok(content.includes(expected), expected);
});

test('Word共同输出在无Node Buffer的浏览器docx运行时保留可编辑中文与前导零', async () => {
  const browserDocx = await readFile(join(dirname(require.resolve('docx')), 'index.umd.cjs'), 'utf8');
  const source = await readFile(new URL('../src/utilities/office-tasks.js', import.meta.url), 'utf8');
  // 独立 realm 在依赖初始化时就没有 Buffer/process；只适配模块导入，不复制被测输出算法。
  const context = createContext({ TextEncoder, TextDecoder, Blob, setTimeout, clearTimeout, LIMITS });
  runInContext(browserDocx, context, { timeout: 5000 });
  assert.equal(runInContext('typeof Buffer', context), 'undefined');
  assert.equal(runInContext('typeof process', context), 'undefined');
  await assert.rejects(runInContext('docx.Packer.toBuffer(new docx.Document({ sections: [{ children: [new docx.Paragraph("旧调用")] }] }))', context), /nodebuffer is not supported/);
  runInContext('const { Document, Packer, Paragraph, TextRun } = docx;\n' + source.replace(/^import [^\n]+;\n/gm, '').replace(/^export /gm, ''), context, { timeout: 5000 });
  const result = await runInContext('makeWord(["中文交付验收", "001", "现金"], "可编辑.docx", "已完成")', context);
  assert.equal(result.files[0].mime, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(result.files[0].name, '可编辑.docx'); assert.equal(result.summary, '已完成');
  const document = inspectOffice(Uint8Array.from(result.files[0].bytes), 'docx').documents.get('word/document.xml');
  const runs = Array.from(document.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't'));
  assert.deepEqual(runs.map(node => node.textContent), ['中文交付验收', '001', '现金']);
});
test('PDF合并、整理、旋转、页码、水印、拆分均生成可重读产物', async () => {
  const p = await PDFDocument.create(); p.addPage(); p.addPage(); const bytes = await p.save();
  for (const tool of ['pdf-merge', 'pdf-pages', 'pdf-rotate', 'pdf-number', 'pdf-watermark', 'pdf-split']) {
    const result = await runUtility({ tool, files: [file('a.pdf', bytes)], options: { pages: '2,1', angle: 90, watermark: '内部评审' } });
    if (tool === 'pdf-split') { const zip = unzipSync(result.files[0].bytes); assert.equal(Object.keys(zip).length, 2); for (const bytes of Object.values(zip)) assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1); }
    else { const read = await PDFDocument.load(result.files[0].bytes); assert.equal(read.getPageCount(), 2); if (tool === 'pdf-rotate') assert.equal(read.getPage(0).getRotation().angle, 90); }
  }
  await assert.rejects(runUtility({ tool: 'pdf-word', files: [file('扫描.pdf', bytes)] }), /没有可提取文字/);
});
test('Excel合并拆分去重核对筛选排序清理都可回读', async () => {
  const bytes = await excel();
  for (const tool of ['excel-merge', 'excel-split', 'excel-dedupe', 'excel-compare', 'excel-filter', 'excel-sort', 'excel-clean']) {
    const files = [file('a.xlsx', bytes)]; if (tool === 'excel-compare') files.push(file('b.xlsx', await excel('新表', [['编码', '名称'], ['003', '新科目']])));
    const result = await runUtility({ tool, files, options: { sheetName: '数据', columns: '编码', match: 'equals', value: '001', sortType: 'text', order: 'desc' } });
    const read = new ExcelJS.Workbook();
    if (tool === 'excel-split') await read.xlsx.load(Object.values(unzipSync(result.files[0].bytes))[0]);
    else await read.xlsx.load(result.files[0].bytes);
    assert.ok(read.worksheets.length); assert.equal(read.worksheets[0].getCell('A1').value, '编码');
    if (tool === 'excel-dedupe') assert.equal(read.worksheets[0].rowCount, 3);
    if (tool === 'excel-filter') assert.equal(read.worksheets[0].rowCount, 3);
    if (tool === 'excel-sort') assert.equal(read.worksheets[0].getCell('A2').value, '002');
  }
});
test('Office正文提取、正文对照和字面替换均处理真实输入', async () => {
  const bytes = await word();
  const txt = await runUtility({ tool: 'word-text', files: [file('a.docx', bytes)] }); assert.match(new TextDecoder().decode(txt.files[0].bytes), /现金/);
  const comparison = await runUtility({ tool: 'word-compare', files: [file('a.docx', bytes), file('b.docx', bytes)] }); assert.match(inspectOffice(comparison.files[0].bytes, 'docx').documents.get('word/document.xml').documentElement.textContent, /原版完整正文/);
  const comparisonDocument = inspectOffice(comparison.files[0].bytes, 'docx').documents.get('word/document.xml');
  const comparisonRuns = Array.from(comparisonDocument.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't')).map(node => node.textContent);
  assert.ok(comparisonRuns.includes('新版完整正文'));
  for (const value of ['实施交付说明 中文合同测试', '001', '现金']) assert.equal(comparisonRuns.filter(text => text === value).length, 2, value);
  const replacement = await runUtility({ tool: 'text-replace', text: '金额 A+B A+B', options: { find: 'A+B', replacement: '100' } }); assert.equal(new TextDecoder().decode(replacement.files[0].bytes), '金额 100 100');
});
test('Office新增入口在读取前拒收数量、类型、体积，并拒收不匹配表头', async () => {
  let reads = 0; const oversized = { name: 'a.pdf', size: 26 * 1024 ** 2, arrayBuffer() { reads++; throw Error('不应读取'); } };
  await assert.rejects(runUtility({ tool: 'pdf-text', files: [oversized] }), /25 MiB/); assert.equal(reads, 0);
  await assert.rejects(runUtility({ tool: 'pdf-merge', files: Array(21).fill(oversized) }), /1–20/);
  await assert.rejects(runUtility({ tool: 'word-pdf', files: [file('a.doc', new Uint8Array([1]))] }), /格式/);
  const a = await excel(), b = await excel('数据', [['错误表头'], ['x']]);
  await assert.rejects(runUtility({ tool: 'excel-merge', files: [file('a.xlsx', a), file('b.xlsx', b)] }), /表头/);
  await assert.rejects(runUtility({ tool: 'excel-filter', files: [file('a.xlsx', a)], options: { sheetName: '数据', columns: '不存在', match: 'equals' } }), /有效列名/);
  await assert.rejects(runUtility({ tool: 'excel-sort', files: [file('a.xlsx', a)], options: { sheetName: '数据', columns: '名称', sortType: 'number', order: 'asc' } }), /非数字/);
  await assert.rejects(runUtility({ tool: 'text-replace', text: 'abc', options: { find: '', replacement: '' } }), /非空/);
});
test('PDF密码、交互表单和损坏内容不产生貌似成功的下载', async () => {
  const form = await PDFDocument.create(); form.addPage(); form.getForm().createTextField('customer');
  await assert.rejects(runUtility({ tool: 'pdf-pages', files: [file('form.pdf', await form.save())] }), /交互表单/);
  await assert.rejects(runUtility({ tool: 'pdf-text', files: [file('a.pdf', new TextEncoder().encode('not a pdf'))] }), /不是 PDF/);
});
test('Word公式、图表、绘图与未知正文容器明确拒收，不以空白成功替代', async () => {
  const bytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('KEEP_CONTENT')] }] }));
  const entries = unzipSync(bytes), xml = new TextDecoder().decode(entries['word/document.xml']);
  const cases = [
    '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>FORMULA_MUST_NOT_DISAPPEAR</m:t></m:r></m:oMath>',
    '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
    '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
    '<w:r><w:sym w:font="Wingdings" w:char="F041"/></w:r>',
    '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Fallback><w:r><w:t>DO_NOT_DROP</w:t></w:r></mc:Fallback></mc:AlternateContent>',
  ];
  for (const content of cases) {
    const fixture = zipSync({ ...entries, 'word/document.xml': new TextEncoder().encode(xml.replace('</w:p>', content + '</w:p>')) });
    await assert.rejects(runUtility({ tool: 'word-pdf', files: [file('语义.docx', fixture)] }), /尚未支持/);
  }
});
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64');
const imageWord = count => Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('中文图片验收 KEEP_CONTENT'), ...Array.from({ length: count }, () => new Paragraph({ children: [new ImageRun({ type: 'png', data: png, transformation: { width: 1, height: 1 } })] }))] }] }));
test('中文Word普通图片仍生成含图PDF，401图片反例在实际输出页数门拒收', async () => {
  const normal = await runUtility({ tool: 'word-pdf', files: [file('图文.docx', await imageWord(1))] });
  const pdf = await PDFDocument.load(normal.files[0].bytes);
  assert.ok(pdf.getPages().some(page => page.node.Resources()?.lookup(PDFName.of('XObject'))?.keys().length > 0));
  const text = await runUtility({ tool: 'pdf-text', files: [file('图文.pdf', normal.files[0].bytes)] });
  assert.match(new TextDecoder().decode(text.files[0].bytes), /中文图片验收/);
  const many = await imageWord(401);
  assert.ok(many.length < 25000, '小输入也要检查真实分页结果');
  await assert.rejects(runUtility({ tool: 'word-pdf', files: [file('超页数.docx', many)] }), /PDF 页数应为 1–200/);
  const fromImage = await runUtility({ tool: 'images-pdf', files: [file('图.png', png)] });
  assert.equal((await PDFDocument.load(fromImage.files[0].bytes)).getPageCount(), 1);
});
test('PDF结果200页上边界可回读，合并到201页拒收', async () => {
  const base = await PDFDocument.create(); for (let i = 0; i < 200; i++) base.addPage();
  const bytes = await base.save();
  const output = await runUtility({ tool: 'pdf-pages', files: [file('边界.pdf', bytes)] });
  assert.equal((await PDFDocument.load(output.files[0].bytes)).getPageCount(), 200);
  const one = await PDFDocument.create(); one.addPage();
  await assert.rejects(runUtility({ tool: 'pdf-merge', files: [file('200.pdf', bytes), file('1.pdf', await one.save())] }), /超过 200 页/);
});
