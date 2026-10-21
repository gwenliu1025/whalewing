/** 工具台只消费用户选件；下载与后台任务仅在当前挂载实例存活。 */
import { utilityTools } from './catalog.js';
import { decodeAudio, captureFrames } from './media-prep.js';

const copy = Object.freeze({
  title: '工具台', help: '内置本地处理，不上传文件，不调用模型 API。每次最多 20 个文件，PDF 最多 200 页，单文件 25 MiB、总输入与输出 100 MiB；文本 2 MiB',
  search: '搜索工具', empty: '没有匹配工具', choose: '选择工具', file: '选择本地文件', selected: '已选择', start: '开始处理', cancel: '取消处理', running: '正在本地处理，可随时取消',
  cancelled: '已取消本次处理，先前结果仍保留', timeout: '处理超过 60 秒，任务已停止；请缩小输入后重试', worker: '当前环境缺少后台 Worker，请使用支持该能力的 DSH 客户端',
  failed: '处理失败，请检查文件后重试', readSheets: '读取工作表', sheet: '选择工作表', sheetEmpty: '先读取工作表', format: '输出格式', quality: '质量（10–100%）', maxEdge: '最大边长（1–10,000 像素）',
  imageHelp: '仅支持 PNG、JPEG、WebP 静态图片，最多 3,200 万像素；不放大，JPEG 透明区域填白，输出变大会如实显示',
  excelHelp: '仅导出保存的数值与文字，不迁移数字显示格式、样式与图表，数据验证规则不迁移。公式缺少已保存结果或存在合并单元格时停止',
  wordHelp: '每张表格生成一个工作表，前导零与文本保留；嵌套、合并、内容控件、修订、隐藏文字及图形等复杂表格明确报错',
  mediaHelp: '提取 DOCX、XLSX、PPTX 文件内媒体与资源清单，不执行嵌入对象',
  text: '文本输入', textHelp: '粘贴文本或选择 UTF-8 文件。CSV 表头非空且唯一、每行等长；JSON 为非空扁平对象数组，各行同键且值均为字符串。CSV 输出为公式触发字段添加单引号并显示数量',
  operation: '文本操作', result: '上次已完成的结果', download: '下载', pending: '尚未内置：在线视频／文案分享链接提取、OCR；不以外链代替内置能力',
});

function validateResult(result) {
  if (!result || typeof result !== 'object') throw new Error('后台返回结果格式不正确');
  if (Object.hasOwn(result, 'sheets')) {
    if (!Array.isArray(result.sheets) || !result.sheets.length || result.sheets.length > 2000 || result.sheets.some(name => typeof name !== 'string' || !name || name.length > 31) || new Set(result.sheets).size !== result.sheets.length || result.files) throw new Error('工作表目录格式不正确');
    return;
  }
  const mimeTypes = new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/json;charset=utf-8', 'text/csv;charset=utf-8', 'text/plain;charset=utf-8', 'image/svg+xml', 'audio/mpeg', 'audio/wav']);
  if (!Array.isArray(result.files) || !result.files.length || result.files.length > 20 || typeof result.summary !== 'string' || result.summary.length > 2000) throw new Error('后台返回下载结果格式不正确');
  let total = 0;
  for (const file of result.files) {
    if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 300 || /[\\/:\x00-\x1f]/.test(file.name) || !mimeTypes.has(file.mime) || !(file.bytes instanceof Uint8Array)) throw new Error('后台返回文件格式不正确');
    total += file.bytes.length;
    if (total > 100 * 1024 ** 2) throw new Error('输出超过 100 MiB');
  }
  if (result.listing !== undefined && (!Array.isArray(result.listing) || result.listing.length > 2000 || result.listing.some(line => typeof line !== 'string' || line.length > 2048))) throw new Error('后台返回清单格式不正确');
}

/** 单实例任务与 URL owner；取消、隐藏和销毁都使迟到事件失效。 */
export function createUtilityRunner(workerSource, platform, onChange) {
  let generation = 0, current = null, disposed = false;
  let state = { busy: false, error: '', notice: '', result: null, sheets: [] };
  const emit = patch => { state = { ...state, ...patch }; if (!disposed) onChange(state); };
  const releaseResult = result => { for (const file of result?.files || []) platform.URL.revokeObjectURL(file.url); };
  const stop = () => {
    generation++;
    if (current) { if (current.timer !== null) platform.clearTimeout(current.timer); current.worker?.terminate(); if (current.script) platform.URL.revokeObjectURL(current.script); current = null; }
  };
  return {
    snapshot: () => state,
    cancel(notice = copy.cancelled) { if (!current) return; stop(); emit({ busy: false, notice, error: '' }); },
    run(request) {
      if (disposed) return;
      stop();
      const id = generation, token = { id, worker: null, script: null, timer: null, started: null };
      current = token;
      emit({ busy: true, error: '', notice: '' });
      try {
        // 平台初始化也可能失败，必须与 Worker 失败共用清理并退出 busy。
        token.started = (platform.now || Date.now)();
        token.timer = platform.setTimeout(() => { if (current !== token) return; stop(); emit({ busy: false, error: copy.timeout }); }, 60000);
        if (typeof platform.Worker !== 'function' || typeof workerSource !== 'string' || !workerSource) throw new Error(copy.worker);
        token.script = platform.URL.createObjectURL(new platform.Blob([workerSource], { type: 'text/javascript' }));
        token.worker = new platform.Worker(token.script);
        platform.URL.revokeObjectURL(token.script); token.script = null;
        token.worker.onerror = event => { if (current !== token) return; event.preventDefault?.(); stop(); emit({ busy: false, error: copy.failed }); };
        token.worker.onmessageerror = () => { if (current !== token) return; stop(); emit({ busy: false, error: copy.failed }); };
        token.worker.onmessage = event => {
          if (current !== token || event.data?.id !== id) return;
          if ((platform.now || Date.now)() - token.started >= 60000) { stop(); emit({ busy: false, error: copy.timeout }); return; }
          const urls = [];
          try {
            const message = event.data;
            if (message.ok !== true) throw new Error(typeof message.error === 'string' ? message.error.slice(0, 500) : copy.failed);
            validateResult(message.result);
            if (request.tool === 'excel-sheets') {
              if (!message.result.sheets) throw new Error('工作表目录缺失');
              stop(); emit({ busy: false, sheets: message.result.sheets, notice: `已读取 ${message.result.sheets.length} 张工作表，请选择后开始处理` }); return;
            }
            if (!message.result.files) throw new Error('下载文件缺失');
            const files = message.result.files.map(file => {
              const url = platform.URL.createObjectURL(new platform.Blob([file.bytes], { type: file.mime }));
              urls.push(url); return { name: file.name, mime: file.mime, size: file.bytes.length, url };
            });
            const result = { files, summary: message.result.summary, listing: message.result.listing || [] };
            stop(); releaseResult(state.result); emit({ busy: false, result, notice: '' });
          } catch (error) {
            for (const url of urls) platform.URL.revokeObjectURL(url);
            stop(); emit({ busy: false, error: error instanceof Error ? error.message : copy.failed });
          }
        };
        token.worker.postMessage({ id, request });
      } catch (error) { stop(); emit({ busy: false, error: error instanceof Error ? error.message : copy.failed }); }
    },
    /** 先在主线程准备（音频解码、视频截图），再交给 Worker 或直接交付；取消同样使准备结果失效。 */
    async prepare(task, next) {
      if (disposed) return;
      stop();
      const token = { timer: null, worker: null, script: null }, id = generation;
      current = token; emit({ busy: true, error: '', notice: '' });
      try {
        const value = await task();
        if (current !== token || id !== generation || disposed) return;
        current = null;
        if (next) this.run(next(value)); else this.deliver(value);
      } catch (error) {
        if (current !== token || id !== generation || disposed) return;
        stop(); emit({ busy: false, error: error instanceof Error ? error.message : copy.failed });
      }
    },
    deliver(raw) {
      if (disposed) return;
      const urls = [];
      try {
        validateResult(raw);
        const files = raw.files.map(file => { const url = platform.URL.createObjectURL(new platform.Blob([file.bytes], { type: file.mime })); urls.push(url); return { name: file.name, mime: file.mime, size: file.bytes.length, url }; });
        stop(); releaseResult(state.result); emit({ busy: false, result: { files, summary: raw.summary, listing: raw.listing || [] }, notice: '', error: '' });
      } catch (error) { for (const url of urls) platform.URL.revokeObjectURL(url); stop(); emit({ busy: false, error: error instanceof Error ? error.message : copy.failed }); }
    },
    clearSheets() { emit({ sheets: [] }); },
    dispose() { if (disposed) return; disposed = true; stop(); releaseResult(state.result); state = { ...state, result: null, busy: false }; },
  };
}

/** 返回稳定挂载的工具台；所属功能负责 active 和卸载。 */
export function createUtilityViews(React, workerSource) {
  const h = React.createElement;
  const tools = utilityTools;
  const icons = {
    convert: 'M7 7h11l-3-3M17 17H6l3 3',
    pdf: 'M6 3h8l4 4v14H6zM14 3v5h4M8.5 15.5h2a1.2 1.2 0 0 0 0-2.4h-2v4.4M13 13.1v4.4h1a2.2 2.2 0 0 0 0-4.4z',
    table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
    image: 'M4 5h16v14H4zM4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 18M15.5 9.5h.01',
    text: 'M5 6h14M12 6v12M8 18h8',
    media: 'M5 5h14v14H5zM10 9v6l5-3z',
    qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2',
  };
  const ToolIcon = ({ tool, size = 22 }) => h('span', { className: 'yj-tool-icon', style: { background: tool.color }, 'aria-hidden': true },
    h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: icons[tool.icon] })));
  // 模态框不承担整页布局：明确固定定位与内容高度，避免四边定位把 auto 高度拉满。
  const css = [
    '.yj-tool-directory{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))!important;gap:14px;margin-top:16px}',
    '.yj-tool-card{display:flex!important;flex-direction:column;align-items:stretch;text-align:left;gap:12px;padding:18px!important;border-radius:16px!important;background:var(--dsw-alias-bg-layer-2)!important;border:1px solid var(--dsw-alias-border-l1)!important;cursor:pointer;transition:border-color .15s,transform .15s}',
    '.yj-tool-card:hover{border-color:var(--dsw-alias-brand-primary)!important;transform:translateY(-2px)}.yj-tool-card-head{display:flex;gap:12px;align-items:center}.yj-tool-card-head strong{font-size:16px;font-weight:500;display:block}.yj-tool-card-head small{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:3px}',
    '.yj-tool-icon{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;flex:none}',
    '.yj-tool-chips{display:flex;flex-wrap:wrap;gap:6px}.yj-tool-chip{font-size:12px;padding:3px 9px!important;border-radius:999px!important;border:1px solid var(--dsw-alias-border-l1)!important;background:var(--dsw-alias-bg-layer-1)!important;color:var(--dsw-alias-label-secondary);cursor:pointer}.yj-tool-chip:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)!important}',
    '.yj-tool-results{display:grid;gap:6px;margin-top:16px}.yj-tool-hit{display:flex!important;align-items:center;gap:12px;text-align:left;padding:10px 14px!important;border-radius:12px!important}.yj-tool-hit .yj-tool-icon{width:32px;height:32px;border-radius:9px}.yj-tool-hit small{color:var(--dsw-alias-label-secondary);margin-left:auto}',
    'dialog.yj-tool-modal{position:fixed;inset:0;margin:auto;display:block;box-sizing:border-box;width:min(1040px,calc(100vw - 32px));height:fit-content;min-height:0;max-height:calc(100dvh - 48px);padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent);overflow:auto}',
    '.yj-tool-modal::backdrop{background:color-mix(in srgb,var(--dsw-alias-label-primary) 26%,transparent);backdrop-filter:blur(3px)}dialog.yj-tool-modal:not([open]){display:none}',
    '.yj-tool-modal header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--dsw-alias-border-l1);position:sticky;top:0;background:var(--dsw-alias-bg-layer-1);z-index:2}.yj-tool-modal header h2{flex:1;font-size:17px}',
    '.yj-tool-layout{display:grid;grid-template-columns:200px 1fr;min-height:420px}.yj-tool-nav{display:flex;flex-direction:column;gap:2px;padding:12px;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
    '.yj-tool-nav button{text-align:left;padding:9px 12px!important;border-radius:10px!important;border:0!important;background:none!important;cursor:pointer;color:var(--dsw-alias-label-secondary)}.yj-tool-nav button[aria-current=true]{background:var(--dsw-alias-bg-layer-1)!important;color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px var(--dsw-alias-border-l1)}.yj-tool-nav button small{display:block;font-size:11px;opacity:.8;margin-top:2px}',
    '.yj-tool-body{padding:20px 24px;display:flex;flex-direction:column;gap:14px;min-width:0}.yj-tool-body h3{font-size:16px;font-weight:500;margin:0}.yj-tool-body .yj-field{min-width:0;display:flex;flex-direction:column;gap:5px}.yj-tool-body textarea{width:100%;min-height:100px;resize:vertical}.yj-tool-body .yj-row{gap:12px;flex-wrap:wrap}',
    '.yj-tool-drop{display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px;border:1.5px dashed var(--dsw-alias-border-l2);border-radius:14px;text-align:center;color:var(--dsw-alias-label-secondary)}.yj-tool-drop input{max-width:100%}',
    '.yj-tool-body .yj-primary{background:var(--dsw-alias-brand-primary)!important;color:#fff!important;border:0!important;padding:8px 20px!important;border-radius:10px!important;cursor:pointer}.yj-tool-body .yj-primary:disabled{opacity:.45;cursor:default}.yj-tool-preview{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}.yj-tool-preview img{max-height:220px;max-width:100%;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:repeating-conic-gradient(#e5e7eb 0 25%,#fff 0 50%) 0 0/16px 16px}',
    '.yj-tool-result{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px;overflow-wrap:anywhere;background:var(--dsw-alias-bg-layer-2)}.yj-tool-result a{color:var(--dsw-alias-brand-primary)}',
    '.yj-region{position:relative;display:inline-block;max-width:100%;overflow:hidden;border-radius:10px;cursor:crosshair;user-select:none;touch-action:none;align-self:flex-start}.yj-region img{display:block;max-width:100%;max-height:380px;pointer-events:none}.yj-region-box{position:absolute;border:2px dashed #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.4),0 0 0 1px rgba(0,0,0,.6)}',
    '.yj-tool-restore{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;margin:12px 0;border:1px solid var(--dsw-alias-brand-primary);border-radius:12px}.yj-tool-help{color:var(--dsw-alias-label-secondary);font-size:12px}',
    '@media(max-width:720px){.yj-tool-layout{grid-template-columns:1fr}.yj-tool-nav{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1)}.yj-tool-nav button{white-space:nowrap}.yj-tool-nav button small{display:none}}',
    'html[data-platform=darwin] .yj-tool-modal{padding-top:0;max-height:calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px)}',
  ].join('');

  /** 在预览图上拖拽框选区域；选区以原图像素记录，供裁剪、打码、去水印使用。 */
  function RegionPicker({ file, value, onChange, disabled }) {
    const [url, setUrl] = React.useState(''), image = React.useRef(null), start = React.useRef(null), [natural, setNatural] = React.useState(null);
    React.useEffect(() => {
      if (!file || typeof globalThis.URL?.createObjectURL !== 'function') return undefined;
      const next = globalThis.URL.createObjectURL(file); setUrl(next); setNatural(null);
      return () => globalThis.URL.revokeObjectURL(next);
    }, [file]);
    if (!file) return null;
    const point = event => {
      const box = image.current.getBoundingClientRect(), scale = image.current.naturalWidth / box.width;
      return [Math.max(0, Math.min(image.current.naturalWidth, Math.round((event.clientX - box.left) * scale))), Math.max(0, Math.min(image.current.naturalHeight, Math.round((event.clientY - box.top) * scale)))];
    };
    const move = event => {
      if (!start.current) return;
      const [x, y] = point(event), [sx, sy] = start.current;
      onChange({ x: Math.min(x, sx), y: Math.min(y, sy), width: Math.abs(x - sx), height: Math.abs(y - sy) });
    };
    const box = natural && value.width > 0 && value.height > 0 ? { left: `${value.x / natural[0] * 100}%`, top: `${value.y / natural[1] * 100}%`, width: `${value.width / natural[0] * 100}%`, height: `${value.height / natural[1] * 100}%` } : null;
    return h('div', { className: 'yj-field' }, h('span', null, '在图片上拖动鼠标框选区域'),
      h('div', { className: 'yj-region', onPointerDown: event => { if (disabled || !image.current) return; event.currentTarget.setPointerCapture?.(event.pointerId); start.current = point(event); move(event); }, onPointerMove: move, onPointerUp: () => { start.current = null; } },
        url && h('img', { ref: image, src: url, alt: '', draggable: false, onLoad: event => setNatural([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight]) }),
        box && h('div', { className: 'yj-region-box', style: box })),
      h('small', { className: 'yj-tool-help' }, natural ? value.width > 0 && value.height > 0 ? `选区：左上角 (${value.x}, ${value.y})，${value.width} × ${value.height} 像素；原图 ${natural[0]} × ${natural[1]}` : `原图 ${natural[0]} × ${natural[1]}，尚未框选` : '正在载入预览'));
  }

  /** 单项功能的输入、参数与结果；切换功能时整体重建，避免上一项的选件和结果串到下一项。 */
  function FunctionPanel({ item, active, runnerRef }) {
    const [files, setFiles] = React.useState([]), [text, setText] = React.useState(''), [sheet, setSheet] = React.useState('');
    const [settings, setSettings] = React.useState({ format: 'jpeg', quality: 80, maxEdge: 1920, operation: 'dedupe', conversion: 'excel-csv', other: '', angle: 90, flip: 'none', x: 0, y: 0, width: 0, height: 0, direction: 'vertical', watermark: '', fontSize: 24, opacity: 0.5, position: 'bottom-right', pages: '', columns: '', match: 'equals', value: '', sortType: 'text', order: 'asc', find: '', replacement: '', block: 14, rows: 3, gridColumns: 3, size: 512, level: 'M', audioFormat: 'mp3', bitrate: 128, start: 0, end: '', times: '每 5 秒' });
    const [state, setState] = React.useState({ busy: false, error: '', notice: '', result: null, sheets: [] });
    const runner = React.useRef(null), fileInput = React.useRef(null), activeRef = React.useRef(active);
    activeRef.current = active;
    React.useEffect(() => {
      const instance = createUtilityRunner(workerSource, { Worker: globalThis.Worker, URL: globalThis.URL, Blob: globalThis.Blob, setTimeout: (...args) => globalThis.setTimeout(...args), clearTimeout: (...args) => globalThis.clearTimeout(...args) }, setState);
      runner.current = instance; if (runnerRef) runnerRef.current = instance;
      return () => instance.dispose();
    }, []);
    React.useEffect(() => { if (!active) runner.current?.cancel(); }, [active]);
    const update = (key, value) => setSettings(previous => ({ ...previous, [key]: value }));
    const field = (label, input) => h('label', { className: 'yj-field' }, label, input);
    const select = (key, label, values) => field(label, h('select', { value: settings[key], disabled: state.busy, onChange: event => { update(key, event.target.value); if (key === 'conversion') { setFiles([]); setSheet(''); runner.current.clearSheets(); } } }, values.map(([value, title]) => h('option', { key: value, value }, title))));
    const number = (key, label, min, max, step = 1) => field(label, h('input', { type: 'number', min, max, step, value: settings[key], disabled: state.busy, onChange: event => update(key, event.target.value === '' ? '' : Number(event.target.value)) }));
    const input = (key, label, placeholder) => field(label, h('input', { value: settings[key], placeholder, disabled: state.busy, onChange: event => update(key, event.target.value) }));
    const isImage = ['image', 'image-rotate', 'image-crop', 'image-stitch', 'image-watermark'].includes(item.id);
    const tool = item.id === 'table-convert' ? settings.conversion : item.id;
    const excel = item.sheet || tool === 'excel-csv';
    const usesText = !item.accept || item.id === 'text';
    const run = chosen => {
      if (!activeRef.current || state.busy) return;
      const options = { ...settings, quality: settings.quality / 100, sheetName: sheet, columns: item.id === 'image-grid' ? settings.gridColumns : settings.columns };
      if (item.audio) return runner.current.prepare(() => decodeAudio(files[0], item.trim ? { start: settings.start, end: settings.end } : {}), pcm => ({ tool: 'audio-encode', files: [], text: '', options: { pcm: { sampleRate: pcm.sampleRate, channels: pcm.channels }, format: settings.audioFormat, bitrate: settings.bitrate, name: files[0].name } }));
      if (item.video) return runner.current.prepare(() => captureFrames(files[0], settings.times));
      runner.current.run({ tool: chosen || tool, files, text, options });
    };
    const ready = !state.busy && active && (!item.accept || files.length > 0 || item.id === 'text' && text) && (!excel || sheet) && (!item.region || settings.width > 0 && settings.height > 0) && (!usesText || item.accept || text.trim());
    const clearFiles = () => { if (fileInput.current) fileInput.current.value = ''; setFiles([]); setSheet(''); runner.current.clearSheets(); };
    return h('div', { className: 'yj-tool-body', 'aria-busy': state.busy },
      h('div', null, h('h3', null, item.title), h('small', { className: 'yj-tool-help' }, item.description || item.brief)),
      item.id === 'table-convert' && select('conversion', '转换方向', [['excel-csv', 'Excel → CSV'], ['csv-excel', 'CSV → Excel']]),
      item.accept && h('label', { className: 'yj-tool-drop' }, h('span', null, item.multiple ? '选择一个或多个文件' : '选择文件'), h('input', { ref: fileInput, key: tool, type: 'file', accept: tool === 'csv-excel' ? '.csv' : tool === 'excel-csv' ? '.xlsx' : item.accept, multiple: !!item.multiple, disabled: state.busy, onChange: event => { runner.current.clearSheets(); setSheet(''); setFiles(Array.from(event.target.files || [])); update('width', 0); update('height', 0); } }), h('small', null, `支持 ${(tool === 'csv-excel' ? '.csv' : tool === 'excel-csv' ? '.xlsx' : item.accept).split(',').join(' ')}`)),
      files.length > 0 && h('div', { className: 'yj-row' }, h('span', null, files.map(file => file.name).join('；')), h('button', { type: 'button', disabled: state.busy, onClick: clearFiles }, '清除选件')),
      item.region && h(RegionPicker, { file: files[0], value: settings, disabled: state.busy, onChange: area => setSettings(previous => ({ ...previous, ...area })) }),
      excel && h('div', { className: 'yj-row' }, h('button', { type: 'button', disabled: state.busy || !files.length, onClick: () => run('excel-sheets') }, '读取工作表'), field('工作表', h('select', { value: sheet, disabled: state.busy || !state.sheets.length, onChange: event => setSheet(event.target.value) }, h('option', { value: '' }, '请选择工作表'), state.sheets.map(name => h('option', { key: name, value: name }, name))))),
      usesText && field(item.id === 'qr-batch' ? '每行一条内容' : item.id === 'qr-make' ? '网址或文字' : '输入', h('textarea', { value: text, rows: item.id === 'qr-make' ? 3 : 7, maxLength: 2 * 1024 ** 2, disabled: state.busy || !!files.length, onChange: event => setText(event.target.value) })),
      item.id === 'text' && select('operation', '操作', [['dedupe', '逐行去重'], ['remove-empty', '清理空行'], ['statistics', '文本统计'], ['csv-json', 'CSV → JSON'], ['json-csv', 'JSON → CSV']]),
      isImage && h('div', { className: 'yj-row' }, select('format', '输出格式', [['jpeg', 'JPEG'], ['png', 'PNG'], ['webp', 'WebP']]), settings.format !== 'png' && number('quality', '质量 %', 10, 100), number('maxEdge', '最大边长（像素）', 1, 10000)),
      item.id === 'image-rotate' && h('div', { className: 'yj-row' }, field('旋转角度', h('select', { value: settings.angle, disabled: state.busy, onChange: event => update('angle', Number(event.target.value)) }, [0, 90, 180, 270].map(value => h('option', { key: value, value }, value + '°')))), select('flip', '翻转', [['none', '不翻转'], ['horizontal', '水平'], ['vertical', '垂直']])),
      item.id === 'image-stitch' && select('direction', '拼接方向', [['vertical', '上下拼（长图）'], ['horizontal', '左右拼']]),
      item.id === 'image-watermark' && h('div', null, input('watermark', '水印文字', '如：仅供内部评审使用'), h('div', { className: 'yj-row' }, number('fontSize', '字号', 10, 200), number('opacity', '透明度', 0.1, 1, 0.1), select('position', '位置', [['top-left', '左上'], ['center', '居中'], ['bottom-right', '右下']]))),
      item.id === 'image-mosaic' && number('block', '马赛克方块大小（像素）', 2, 200),
      item.id === 'image-grid' && h('div', { className: 'yj-row' }, number('rows', '行数', 1, 10), number('gridColumns', '列数', 1, 10)),
      ['pdf-split', 'pdf-pages', 'pdf-rotate', 'pdf-number', 'pdf-watermark', 'pdf-images'].includes(item.id) && input('pages', '页码', '留空为全部；如 1,3-5,2（页面整理按此顺序输出）'),
      item.id === 'pdf-rotate' && select('angle', '顺时针旋转', [['90', '90°'], ['180', '180°'], ['270', '270°']]),
      item.id === 'pdf-watermark' && input('watermark', '水印文字', '1–60 字'),
      ['excel-dedupe', 'excel-filter', 'excel-sort'].includes(item.id) && input('columns', item.id === 'excel-dedupe' ? '关键列名称' : '列名称', item.id === 'excel-dedupe' ? '多列用英文逗号分隔' : '与表头一致'),
      item.id === 'excel-filter' && h('div', { className: 'yj-row' }, select('match', '筛选条件', [['equals', '等于'], ['contains', '包含'], ['not-empty', '非空']]), settings.match !== 'not-empty' && input('value', '筛选值')),
      item.id === 'excel-sort' && h('div', { className: 'yj-row' }, select('sortType', '比较方式', [['text', '文本'], ['number', '数值']]), select('order', '顺序', [['asc', '升序'], ['desc', '降序']])),
      item.id === 'text-replace' && h('div', { className: 'yj-row' }, input('find', '查找文字'), input('replacement', '替换为', '可留空')),
      ['qr-make', 'qr-batch'].includes(item.id) && h('div', { className: 'yj-row' }, number('size', '图片尺寸（像素）', 128, 2048), select('level', '容错等级', [['L', '低（7%）'], ['M', '中（15%）'], ['Q', '较高（25%）'], ['H', '高（30%，可加 Logo）']])),
      item.audio && h('div', { className: 'yj-row' }, select('audioFormat', '输出格式', [['mp3', 'MP3'], ['wav', 'WAV（无损）']]), settings.audioFormat === 'mp3' && field('音质', h('select', { value: settings.bitrate, disabled: state.busy, onChange: event => update('bitrate', Number(event.target.value)) }, [[64, '64 kbps（语音）'], [128, '128 kbps（标准）'], [192, '192 kbps（较好）'], [320, '320 kbps（最佳）']].map(([value, title]) => h('option', { key: value, value }, title))))),
      item.trim && h('div', { className: 'yj-row' }, number('start', '开始（秒）', 0, 1800, 0.1), number('end', '结束（秒，留空到结尾）', 0, 1800, 0.1)),
      item.video && input('times', '截图时间点', '如“1, 5.5, 10”或“每 5 秒”'),
      h('div', { className: 'yj-row' }, h('button', { type: 'button', className: 'yj-primary', disabled: !ready, onClick: () => run() }, '开始处理'), state.busy && h('button', { type: 'button', onClick: () => runner.current.cancel() }, '取消')),
      h('div', { 'aria-live': 'polite' }, state.busy && h('span', { role: 'status' }, copy.running), state.error && h('p', { role: 'alert' }, state.error), state.notice && h('p', { role: 'status' }, state.notice)),
      state.result && h('section', { className: 'yj-tool-result' }, h('strong', null, state.result.summary), h('div', { className: 'yj-row' }, state.result.files.map(file => h('a', { key: file.url, href: file.url, download: file.name }, '下载 ' + file.name))),
        // 图片结果直接预览，最多展示前 6 张。
        state.result.files.some(file => file.mime?.startsWith('image/')) && h('div', { className: 'yj-tool-preview' }, state.result.files.filter(file => file.mime?.startsWith('image/')).slice(0, 6).map(file => h('img', { key: file.url, src: file.url, alt: file.name }))), state.result.listing.length > 0 && h('details', null, h('summary', null, '处理明细'), h('ul', null, state.result.listing.map((line, i) => h('li', { key: i }, line))))));
  }

  function ToolWindow({ tool, initial, request, active, minimized, onMinimize, onClose }) {
    const [current, setCurrent] = React.useState(initial || tool.functions[0].id), [dialogError, setDialogError] = React.useState('');
    const modal = React.useRef(null), panelRunner = React.useRef(null);
    // 同一工具内从目录点另一项功能：保持窗口，只切换功能。
    React.useEffect(() => { if (initial) setCurrent(initial); }, [request]);
    const item = tool.functions.find(entry => entry.id === current) || tool.functions[0];
    React.useEffect(() => {
      const element = modal.current;
      if (!element) return undefined;
      if (active && !minimized) {
        try { if (!element.open) element.showModal(); } catch { setDialogError('工具窗口打开失败，请关闭后重试'); }
      } else if (element.open) element.close();
      return () => { if (element.open) element.close(); };
    }, [active, minimized]);
    // 关闭即终止任务并释放下载，不等组件卸载。
    const closeWindow = () => { modal.current?.close(); panelRunner.current?.dispose(); onClose(); };
    // 对话框固定为第一个子节点，最小化时出现的恢复条不改变其位置，面板与任务保持不变。
    return h(React.Fragment, null,
      h('dialog', { ref: modal, className: 'yj-tool-modal', 'aria-label': tool.title, onCancel: event => { event.preventDefault(); closeWindow(); }, onClick: event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeWindow(); } } },
        h('header', null, h(ToolIcon, { tool, size: 18 }), h('h2', null, tool.title), h('button', { type: 'button', onClick: () => onMinimize(true), 'aria-label': '最小化工具' }, '最小化'), h('button', { type: 'button', onClick: closeWindow, 'aria-label': '关闭工具' }, '关闭')),
        h('div', { className: 'yj-tool-layout' },
          h('nav', { className: 'yj-tool-nav', 'aria-label': `${tool.title}功能` }, tool.functions.map(entry => h('button', { type: 'button', key: entry.id, 'aria-current': entry.id === item.id, onClick: () => setCurrent(entry.id) }, entry.title, h('small', null, entry.brief)))),
          h(FunctionPanel, { key: item.id, item, active, runnerRef: panelRunner }))),
      active && minimized && h('div', { className: 'yj-tool-restore' }, h('span', null, `${tool.title} · ${item.title}`), h('div', { className: 'yj-row' }, h('button', { type: 'button', onClick: () => onMinimize(false) }, '恢复'), h('button', { type: 'button', onClick: closeWindow }, '关闭工具'))),
      dialogError && h('p', { role: 'alert' }, dialogError));
  }

  function ToolboxView({ active = true }) {
    const [query, setQuery] = React.useState(''), [opened, setOpened] = React.useState(null), [minimized, setMinimized] = React.useState(false);
    const opener = React.useRef(null), directory = React.useRef(null), pendingFocus = React.useRef(null);
    React.useEffect(() => {
      if (pendingFocus.current && !opened) { directory.current?.querySelector(`[data-tool-id="${pendingFocus.current}"]`)?.focus(); pendingFocus.current = null; }
    }, [opened, query]);
    const close = () => {
      const previous = opener.current, toolId = opened?.tool.id; opener.current = null;
      setOpened(null); setMinimized(false);
      if (previous?.isConnected !== false && (!previous?.getClientRects || previous.getClientRects().length)) previous?.focus();
      else { pendingFocus.current = toolId; setQuery(''); }
    };
    const open = (tool, functionId, event) => {
      if (opened && opened.tool.id !== tool.id && !globalThis.confirm('关闭当前工具并清除其输入和下载结果，打开新工具？')) return;
      if (!opened || opened.tool.id !== tool.id) opener.current = event?.currentTarget ?? null;
      setOpened(previous => ({ tool, functionId, request: (previous?.request ?? 0) + 1 })); setMinimized(false);
    };
    const keyword = query.trim().toLowerCase();
    const hits = keyword ? tools.flatMap(tool => tool.functions.filter(item => `${tool.title} ${item.title} ${item.brief}`.toLowerCase().includes(keyword)).map(item => ({ tool, item }))) : [];
    return h('section', { hidden: !active, 'aria-label': copy.title },
      h('style', null, css),
      h('div', { className: 'yj-header' }, h('h2', null, copy.title), h('span', { className: 'yj-muted' }, '本地处理 · 不上传文件')),
      h('label', { className: 'yj-field' }, h('input', { type: 'search', value: query, placeholder: '搜索功能，如“PDF 合并”“打码”“转 MP3”', 'aria-label': copy.search, onChange: event => setQuery(event.target.value) })),
      opened && h(ToolWindow, { key: opened.tool.id, tool: opened.tool, initial: opened.functionId, request: opened.request, active, minimized, onMinimize: setMinimized, onClose: close }),
      keyword ? hits.length ? h('div', { className: 'yj-tool-results' }, hits.map(({ tool, item }) => h('button', { type: 'button', key: item.id, className: 'yj-tool-hit', 'data-tool-id': tool.id, onClick: event => open(tool, item.id, event), 'aria-haspopup': 'dialog' }, h(ToolIcon, { tool, size: 16 }), h('span', null, item.title), h('small', null, `${tool.title} · ${item.brief}`))))
        : h('p', { role: 'status' }, copy.empty)
        : h('div', { ref: directory, className: 'yj-grid yj-tool-directory' }, tools.map(tool => h('div', { key: tool.id, className: 'yj-tool-card' },
          h('button', { type: 'button', className: 'yj-tool-card-head', 'data-tool-id': tool.id, onClick: event => open(tool, null, event), 'aria-haspopup': 'dialog', 'aria-label': tool.title, style: { all: 'unset', display: 'flex', gap: '12px', alignItems: 'center', cursor: 'pointer' } }, h(ToolIcon, { tool }), h('span', null, h('strong', null, tool.title), h('small', null, `${tool.brief} · ${tool.functions.length} 项功能`))),
          h('div', { className: 'yj-tool-chips' }, tool.functions.map(item => h('button', { type: 'button', key: item.id, className: 'yj-tool-chip', onClick: event => open(tool, item.id, event), 'aria-label': `${tool.title}：${item.title}` }, item.title)))))));
  }
  return { ToolboxView };
}
