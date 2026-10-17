/** 每个任务一个独占 Worker；宿主终止是取消与 60 秒 deadline 的唯一执行动作。 */
import { LIMITS, validateFiles, decodeText, wordToExcel, excelToWord, excelSheets, extractMedia, transformText, convertSpreadsheet, smallTextTool, fileTool } from './core.js';
import { convertImages } from './image.js';
import { pdfTask } from './pdf.js';
import { officeTask } from './office-tasks.js';
import { extraTools, extraTask } from './extras.js';

/** 文件读取位于 Worker，因此取消覆盖读取、解析与编码全过程。 */
export async function runUtility(request) {
  const { tool, files, options, text } = request || {};
  if (extraTools.includes(tool)) return extraTask(tool, files, options, text);
  if (tool === 'word-pdf' || tool === 'images-pdf' || tool?.startsWith('pdf-')) return pdfTask(tool, files, options);
  if (['excel-merge', 'excel-split', 'excel-dedupe', 'excel-compare', 'excel-filter', 'excel-sort', 'excel-clean', 'word-text', 'word-compare', 'text-replace'].includes(tool)) return officeTask(tool, files, options, text);
  if (['image', 'image-rotate', 'image-crop', 'image-stitch', 'image-watermark'].includes(tool)) return convertImages(files, { ...options, action: tool });
  if (['line-compare', 'text-case', 'timestamp', 'base64', 'url-codec', 'uuid'].includes(tool)) return smallTextTool(tool, text, options);
  if (['hash', 'zip'].includes(tool)) return fileTool(tool, files, options);
  if (tool === 'text') {
    if (files?.length) {
      validateFiles(files, 'text');
      return transformText(decodeText(new Uint8Array(await files[0].arrayBuffer())), options?.operation);
    }
    return transformText(text, options?.operation);
  }
  validateFiles(files, tool);
  const bytes = new Uint8Array(await files[0].arrayBuffer()), name = files[0].name;
  if (bytes.length !== files[0].size || bytes.length > LIMITS.file) throw new Error('读取结果与所选文件大小不一致');
  if (tool === 'word-excel') return wordToExcel(bytes, name);
  if (tool === 'excel-sheets') return excelSheets(bytes);
  if (tool === 'excel-word') return excelToWord(bytes, name, options?.sheetName);
  if (tool === 'media') return extractMedia(bytes, name);
  if (['csv-excel', 'excel-csv', 'excel-json'].includes(tool)) return convertSpreadsheet(bytes, name, tool, options?.sheetName);
  throw new Error('未知工具');
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
  self.onmessage = async event => {
    const { id, request } = event.data || {};
    if (!Number.isSafeInteger(id)) return;
    try {
      const result = await runUtility(request);
      self.postMessage({ id, ok: true, result }, (result.files || []).map(file => file.bytes.buffer));
    } catch (error) {
      self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : '文件处理失败，请检查输入' });
    }
  };
}
