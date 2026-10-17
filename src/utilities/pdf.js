/** PDF 引擎与字体随包离线运行；独占外层 Worker 提供取消和内存生命周期。 */
import { PDFDocument, degrees, StandardFonts } from 'pdf-lib';
import pdfMake from 'pdfmake/build/pdfmake.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import font from '../../content/utilities/noto-font.json' with { type: 'json' };
import pdfAssets from '../../content/utilities/pdf-assets.json' with { type: 'json' };
import { zipSync } from 'fflate';
import { Paragraph, TextRun } from 'docx';
import { LIMITS } from './core.js';
import { inspectImage } from './image.js';
import { selectedBytes, safeBase, resultFile, textResult, wordDocument, wordChildren, descendants, paragraphText, makeWord } from './office-tasks.js';

// PDF.js 的解析器已内联到独占任务中，不创建远端 Worker 或动态脚本请求。
globalThis.pdfjsWorker = { WorkerMessageHandler };
const fonts = { Noto: { normal: 'Noto.otf', bold: 'Noto.otf', italics: 'Noto.otf', bolditalics: 'Noto.otf' } };
const vfs = { 'Noto.otf': font.base64 };
/** 所有对外 PDF（含拆分 ZIP 成员）在最终字节上统一回读页数，转换引擎的成功不替代预算门。 */
async function pdfResult(bytes, name, summary) {
  const result = resultFile(name, 'application/pdf', bytes, summary);
  const readback = await PDFDocument.load(result.files[0].bytes, { updateMetadata: false });
  pageSelection('', readback.getPageCount());
  return result;
}
const b64 = bytes => { let out = ''; for (let i = 0; i < bytes.length; i += 16384) out += String.fromCharCode(...bytes.subarray(i, i + 16384)); return btoa(out); };
export function pageSelection(value, total) {
  if (!Number.isSafeInteger(total) || total < 1 || total > 200) throw new Error('PDF 页数应为 1–200');
  if (!value || value.trim() === '') return Array.from({ length: total }, (_, i) => i);
  const result = [];
  for (const segment of String(value).split(',')) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(segment);
    if (!match) throw new Error('页码格式示例：1,3-5,2');
    const a = Number(match[1]), z = Number(match[2] || match[1]);
    if (a < 1 || z < a || z > total || result.length + z - a + 1 > 200) throw new Error('页码超出文档范围或选择超过 200 页');
    for (let p = a; p <= z; p++) result.push(p - 1);
  }
  if (new Set(result).size !== result.length) throw new Error('同一页只能选择一次');
  return result;
}
async function loadPdf(bytes) {
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('所选文件不是 PDF');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  pageSelection('', doc.getPageCount());
  if (doc.getForm().getFields().length) throw new Error('交互表单或签名 PDF 请先另存为静态副本；本工具不保留数字签名效力');
  return doc;
}
async function renderDefinition(definition) {
  return new Promise((resolve, reject) => {
    try { pdfMake.createPdf({ ...definition, defaultStyle: { font: 'Noto', fontSize: 10 }, pageSize: 'A4', pageMargins: [40, 40, 40, 40] }, undefined, fonts, vfs).getBuffer(buffer => resolve(new Uint8Array(buffer))); }
    catch (error) { reject(error); }
  });
}
function validateWordContent(body) {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
  const elements = node => Array.from(node.childNodes).filter(n => n.nodeType === 1);
  const unsupported = node => { throw new Error(`Word 含尚未支持的公式、图表、绘图或正文结构：${node.nodeName}；请先转换为普通文字或内嵌 PNG/JPEG`); };
  const containers = {
    body: ['p', 'tbl', 'sectPr'], p: ['pPr', 'r', 'hyperlink', 'bookmarkStart', 'bookmarkEnd', 'proofErr'],
    hyperlink: ['r', 'bookmarkStart', 'bookmarkEnd', 'proofErr'], r: ['rPr', 't', 'tab', 'br', 'cr', 'drawing'],
    tbl: ['tblPr', 'tblGrid', 'tr'], tr: ['trPr', 'tc'], tc: ['tcPr', 'p'],
  };
  const properties = new Set(['pPr', 'rPr', 'tblPr', 'tblGrid', 'trPr', 'tcPr', 'sectPr']);
  const drawingNodes = new Map([
    [WP, new Set(['inline', 'extent', 'effectExtent', 'docPr', 'cNvGraphicFramePr'])],
    [A, new Set(['graphic', 'graphicData', 'graphicFrameLocks', 'picLocks', 'blip', 'srcRect', 'stretch', 'fillRect', 'xfrm', 'off', 'ext', 'prstGeom', 'avLst'])],
    [PIC, new Set(['pic', 'nvPicPr', 'cNvPr', 'cNvPicPr', 'blipFill', 'spPr'])],
  ]);
  const drawing = node => {
    const children = elements(node);
    if (children.length !== 1 || children[0].namespaceURI !== WP || children[0].localName !== 'inline') unsupported(node);
    const all = [children[0], ...Array.from(children[0].getElementsByTagName('*'))];
    for (const child of all) {
      if (!drawingNodes.get(child.namespaceURI)?.has(child.localName)) unsupported(child);
      if (child.namespaceURI === A && child.localName === 'graphicData' && child.getAttribute('uri') !== PIC) unsupported(child);
      if (child.namespaceURI === A && child.localName === 'prstGeom' && child.getAttribute('prst') !== 'rect') unsupported(child);
      if (child.namespaceURI === A && child.localName === 'xfrm' && ['rot', 'flipH', 'flipV'].some(key => child.hasAttribute(key) && !['0', 'false'].includes(child.getAttribute(key)))) unsupported(child);
      if (child.namespaceURI === A && ['srcRect', 'fillRect'].includes(child.localName) && ['t', 'r', 'b', 'l'].some(key => child.hasAttribute(key) && child.getAttribute(key) !== '0')) unsupported(child);
    }
    if (node.getElementsByTagNameNS(PIC, 'pic').length !== 1 || node.getElementsByTagNameNS(A, 'blip').length !== 1) unsupported(node);
  };
  // 只允许当前转换器实际消费的内容容器；未知命名空间不再被Word标签遍历静默跳过。
  const visit = node => {
    if (node.namespaceURI !== W) unsupported(node);
    if (node.localName === 'drawing') { drawing(node); return; }
    if (properties.has(node.localName)) {
      for (const child of Array.from(node.getElementsByTagName('*'))) if (child.namespaceURI !== W) unsupported(child);
      return;
    }
    const allowed = containers[node.localName];
    for (const child of elements(node)) {
      if (!allowed?.includes(child.localName) || child.namespaceURI !== W) unsupported(child);
      visit(child);
    }
  };
  visit(body);
}
export async function wordPdf(bytes, name) {
  const { body, documents, entries } = wordDocument(bytes);
  validateWordContent(body);
  if (['gridSpan', 'vMerge', 'numPr', 'footnoteReference', 'endnoteReference', 'pict', 'object', 'fldSimple', 'instrText', 'txbxContent'].some(n => descendants(body, n).length) || body.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'anchor').length) throw new Error('该 Word 含合并表格、编号、脚注、域或浮动图形，请先转为普通段落与规则表格');
  const rels = documents.get('word/_rels/document.xml.rels');
  const imageFor = node => {
    const blips = Array.from(node.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip'));
    return blips.map(blip => {
      const id = blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
      const relation = rels && Array.from(rels.documentElement.childNodes).find(r => r.nodeType === 1 && r.getAttribute('Id') === id);
      const target = relation?.getAttribute('Target');
      if (!target || relation.getAttribute('TargetMode') === 'External' || !/^media\/[^/]+\.(png|jpe?g)$/i.test(target)) throw new Error('Word 图片必须是本地 PNG/JPEG');
      const data = entries.get(`word/${target}`); if (!data) throw new Error('Word 图片缺失');
      const info = inspectImage(data, target);
      return { image: `data:${info.mime};base64,${b64(data)}`, fit: [480, 360], margin: [0, 4, 0, 8] };
    });
  };
  const paragraph = p => {
    const runs = descendants(p, 'r').map(r => ({ text: paragraphText(r), bold: descendants(r, 'b').length > 0, italics: descendants(r, 'i').length > 0 }));
    const text = runs.some(r => r.text) ? runs : ' ';
    const style = descendants(p, 'pStyle')[0]?.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'val') || '';
    return [{ text, fontSize: /^(Title|标题)$/i.test(style) ? 20 : /^Heading[1-3]$/i.test(style) ? 15 : 10, margin: [0, 0, 0, 7] }, ...imageFor(p)];
  };
  const content = [];
  for (const node of wordChildren(body)) {
    if (node.localName === 'p') content.push(...paragraph(node));
    else if (node.localName === 'tbl') {
      if (descendants(node, 'tbl').length) throw new Error('嵌套表格尚不支持');
      const rows = wordChildren(node, 'tr').map(tr => wordChildren(tr, 'tc').map(tc => ({ stack: wordChildren(tc, 'p').flatMap(paragraph) })));
      if (!rows.length || !rows[0].length || rows.some(r => r.length !== rows[0].length) || rows.length * rows[0].length > LIMITS.cells) throw new Error('Word 表格结构或大小超出处理范围');
      content.push({ table: { widths: rows[0].map(() => '*'), body: rows }, margin: [0, 0, 0, 10] });
    } else if (node.localName !== 'sectPr') throw new Error(`尚未支持 Word 正文结构：${node.localName}`);
  }
  if (!content.length) throw new Error('Word 正文为空');
  return pdfResult(await renderDefinition({ content }), `${safeBase(name)}.pdf`, '已将正文、基础样式、规则表格与内嵌图片重新排为 A4 PDF；字体统一为 Noto Sans SC，原页码、页眉页脚、粗斜体字体外观不保真');
}
async function withParsedPdf(bytes, operation) {
  const assetBytes = encoded => Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  class LocalFontData {
    async fetch({ filename }) { const value = pdfAssets.fonts[filename]; if (!value) throw new Error('PDF 请求了未随包提供的标准字体'); return assetBytes(value); }
  }
  class LocalCMaps {
    async fetch({ name }) { const value = pdfAssets.cmaps[`${name}.bcmap`]; if (!value) throw new Error('PDF 请求了未随包提供的字符映射'); return { cMapData: assetBytes(value), isCompressed: true }; }
  }
  class LocalCanvasFactory {
    create(width, height) { if (width * height > LIMITS.pixels) throw new Error('PDF 内嵌图像超过像素预算'); const canvas = new OffscreenCanvas(Math.ceil(width), Math.ceil(height)); return { canvas, context: canvas.getContext('2d') }; }
    reset(target, width, height) { if (width * height > LIMITS.pixels) throw new Error('PDF 内嵌图像超过像素预算'); target.canvas.width = width; target.canvas.height = height; }
    destroy(target) { target.canvas.width = target.canvas.height = 1; target.canvas = target.context = null; }
  }
  const task = getDocument({ data: bytes.slice(), CanvasFactory: LocalCanvasFactory, StandardFontDataFactory: LocalFontData, CMapReaderFactory: LocalCMaps, useWorkerFetch: false, useSystemFonts: false, disableFontFace: true, isEvalSupported: false, useWasm: false, stopAtErrors: true });
  try { const doc = await task.promise; pageSelection('', doc.numPages); return await operation(doc); }
  finally { await task.destroy(); }
}
async function pdfTextPages(doc) {
  const pages = []; let size = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n), content = await page.getTextContent();
    let text = '', lastY = null, lastEnd = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      const sameLine = lastY !== null && Math.abs(y - lastY) <= 2;
      if (lastY !== null && !sameLine && !text.endsWith('\n')) text += '\n';
      if (sameLine && lastEnd !== null && item.transform[4] - lastEnd > Math.abs(item.transform[0]) * 0.3 && !/\s$/.test(text)) text += ' ';
      text += item.str + (item.hasEOL ? '\n' : ''); lastY = y; lastEnd = item.transform[4] + item.width;
      size += item.str.length * 4 + 2;
      if (size > LIMITS.text) throw new Error('提取文字超过 2 MiB');
    }
    page.cleanup();
    if (!text.trim()) throw new Error(`第 ${n} 页没有可提取文字，可能为扫描件；需要 OCR 后再转换`);
    pages.push(text.trim());
  }
  return pages;
}
export async function pdfTask(tool, files, options = {}) {
  if (tool === 'word-pdf') { const [f] = await selectedBytes(files, ['docx']); return wordPdf(f.bytes, f.name); }
  if (tool === 'images-pdf') {
    const inputs = await selectedBytes(files, ['png', 'jpg', 'jpeg', 'webp'], 20), doc = await PDFDocument.create();
    for (const input of inputs) {
      const info = inspectImage(input.bytes, input.name); let bytes = input.bytes;
      if (info.mime === 'image/webp') {
        if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') throw new Error('当前环境缺少 WebP 本地图像转换能力');
        const bitmap = await createImageBitmap(new Blob([bytes])); const canvas = new OffscreenCanvas(info.width, info.height);
        try { canvas.getContext('2d').drawImage(bitmap, 0, 0); bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()); }
        finally { bitmap.close(); canvas.width = canvas.height = 1; }
      }
      const image = info.mime === 'image/jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
      const page = doc.addPage([595.28, 841.89]), scale = Math.min(515 / info.width, 762 / info.height);
      page.drawImage(image, { x: (595.28 - info.width * scale) / 2, y: (841.89 - info.height * scale) / 2, width: info.width * scale, height: info.height * scale });
    }
    return pdfResult(await doc.save(), '图片汇总.pdf', `已按选件顺序生成 ${inputs.length} 页 PDF`);
  }
  const inputs = await selectedBytes(files, ['pdf'], tool === 'pdf-merge' ? 20 : 1);
  const source = await loadPdf(inputs[0].bytes), base = safeBase(inputs[0].name), selected = pageSelection(options.pages, source.getPageCount());
  if (['pdf-word', 'pdf-text', 'pdf-images'].includes(tool)) return withParsedPdf(inputs[0].bytes, async doc => {
    if (tool === 'pdf-images') {
      if (typeof OffscreenCanvas !== 'function') throw new Error('当前环境缺少本地 PDF 图片渲染能力');
      const entries = {}; let total = 0;
      for (const p of selected) {
        const page = await doc.getPage(p + 1), viewport = page.getViewport({ scale: 1.5 });
        if (viewport.width * viewport.height > LIMITS.pixels) throw new Error('PDF 页面渲染超过 3,200 万像素');
        const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        try { await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise; const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()); total += bytes.length; if (total > LIMITS.output) throw new Error('PDF 图片输出超过 100 MiB'); entries[`${base}-${p + 1}.png`] = bytes; }
        finally { canvas.width = canvas.height = 1; page.cleanup(); }
      }
      return resultFile(`${base}-图片.zip`, 'application/zip', zipSync(entries, { level: 0 }), `已渲染 ${selected.length} 页 PNG`);
    }
    const pages = await pdfTextPages(doc);
    if (tool === 'pdf-text') return textResult(pages.map((text, i) => `第 ${i + 1} 页\n${text}`).join('\n\n'), `${base}.txt`, `已提取 ${pages.length} 页文字，不含图片或 OCR`);
    return makeWord(pages.flatMap((text, i) => text.split('\n').map((line, j) => new Paragraph({ pageBreakBefore: i > 0 && j === 0, children: [new TextRun(line)] }))), `${base}.docx`, `已生成 ${pages.length} 页可编辑文字文档；按阅读文字重排，不复刻图片、表格与版式`);
  });
  if (tool === 'pdf-split') {
    const entries = {}; let total = 0;
    for (const p of selected) { const doc = await PDFDocument.create(); const [page] = await doc.copyPages(source, [p]); doc.addPage(page); const checked = await pdfResult(await doc.save(), `${base}-${p + 1}.pdf`, '拆分页'); const bytes = checked.files[0].bytes; total += bytes.length; if (total > LIMITS.output) throw new Error('拆分输出超过 100 MiB'); entries[checked.files[0].name] = bytes; }
    return resultFile(`${base}-拆分.zip`, 'application/zip', zipSync(entries, { level: 0 }), `已拆分 ${selected.length} 页`);
  }
  if (tool === 'pdf-merge' || tool === 'pdf-pages') {
    const doc = await PDFDocument.create();
    const sources = tool === 'pdf-merge' ? [source, ...await Promise.all(inputs.slice(1).map(f => loadPdf(f.bytes)))] : [source];
    for (const s of sources) { const pages = await doc.copyPages(s, tool === 'pdf-pages' ? selected : s.getPageIndices()); if (doc.getPageCount() + pages.length > 200) throw new Error('结果超过 200 页'); pages.forEach(page => doc.addPage(page)); }
    return pdfResult(await doc.save(), `${base}-${tool === 'pdf-merge' ? '合并' : '整理'}.pdf`, `已生成 ${doc.getPageCount()} 页 PDF；页面注释、链接与表单不作为保留承诺`);
  }
  if (tool === 'pdf-rotate') {
    const angle = Number(options.angle); if (![90, 180, 270].includes(angle)) throw new Error('请选择 90、180 或 270 度');
    selected.forEach(p => source.getPage(p).setRotation(degrees((source.getPage(p).getRotation().angle + angle) % 360)));
  } else if (tool === 'pdf-number') {
    const font = await source.embedFont(StandardFonts.Helvetica);
    selected.forEach(p => { const page = source.getPage(p); page.drawText(`${p + 1} / ${source.getPageCount()}`, { x: page.getWidth() / 2 - 20, y: 18, size: 10, font }); });
  } else if (tool === 'pdf-watermark') {
    if (typeof options.watermark !== 'string' || !options.watermark.trim() || options.watermark.length > 60) throw new Error('请输入 1–60 字水印');
    // 由同一中文排版引擎生成透明文字页，再嵌入原 PDF，避免第二套字体实现。
    const stampBytes = await renderDefinition({ content: [{ text: options.watermark, fontSize: 32, color: '#aaaaaa', alignment: 'center', margin: [0, 320, 0, 0] }] });
    const [stamp] = await source.embedPdf(stampBytes);
    selected.forEach(p => { const page = source.getPage(p); page.drawPage(stamp, { width: page.getWidth(), height: page.getHeight(), opacity: 0.3 }); });
  } else throw new Error('未知 PDF 工具');
  return pdfResult(await source.save(), `${base}-处理.pdf`, `已处理 ${selected.length} 页；原件保持不变`);
}
