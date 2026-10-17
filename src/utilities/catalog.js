/** 工具台目录：按办公场景分成几个工具，每个工具里有多项功能（参考 WPS 等办公套件的组织方式）。 */
const images = '.png,.jpg,.jpeg,.webp';
const media = '.mp4,.mov,.m4v,.webm,.mkv,.avi,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus';
const fn = (id, title, brief, accept, extra = {}) => ({ id, title, brief, accept, ...extra });

export const utilityTools = Object.freeze([
  { id: 'convert', title: '格式转换', brief: 'Word、PDF、Excel、图片互相转换', icon: 'convert', color: '#2563eb', functions: [
    fn('word-pdf', 'Word 转 PDF', '中文正文、表格与图片重新排版', '.docx', { description: '支持 DOCX 正文、基础文字样式、规则表格和普通图片，重新排版为 A4，最多 200 页。不支持公式、图表、浮动图形、修订和合并单元格。' }),
    fn('pdf-word', 'PDF 转 Word', '文字型 PDF 转成可编辑文档', '.pdf', { description: '按页重建可编辑的文字，不恢复原排版、图片和表格。扫描件（图片 PDF）无法转换。' }),
    fn('images-pdf', '图片转 PDF', '多张截图、照片按顺序合成 PDF', images, { multiple: true }),
    fn('pdf-images', 'PDF 转图片', '每页导出为 PNG', '.pdf'),
    fn('table-convert', 'Excel / CSV 互转', '导入模板与文本数据互换', '.xlsx,.csv'),
    fn('excel-json', 'Excel 转 JSON', '为接口联调生成数据', '.xlsx', { sheet: true }),
    fn('word-text', 'Word 转 TXT', '导出段落和表格中的文字', '.docx'),
    fn('media', '提取文档图片', '取出 Word、Excel、PPT 里的原始图片', '.docx,.xlsx,.pptx'),
  ] },
  { id: 'pdf', title: 'PDF 工具', brief: '合并拆分、整理页面、页码水印', icon: 'pdf', color: '#dc2626', functions: [
    fn('pdf-merge', '合并 PDF', '按选择顺序合并多个文件', '.pdf', { multiple: true }),
    fn('pdf-split', '拆分 PDF', '每页单独保存', '.pdf'),
    fn('pdf-pages', '页面整理', '提取、删除页面或调整顺序', '.pdf'),
    fn('pdf-rotate', '旋转页面', '纠正页面方向', '.pdf'),
    fn('pdf-number', '添加页码', '页脚标注“第几页 / 共几页”', '.pdf'),
    fn('pdf-watermark', '添加水印', '为文档加中文文字水印', '.pdf'),
    fn('pdf-text', '提取文字', '导出文字型 PDF 中的文字', '.pdf'),
  ] },
  { id: 'excel', title: '表格处理', brief: '合并拆分、去重核对、筛选排序', icon: 'table', color: '#16a34a', functions: [
    fn('excel-merge', '合并表格', '表头相同的多个表纵向合并', '.xlsx', { multiple: true }),
    fn('excel-split', '拆分工作表', '每张工作表单独导出', '.xlsx'),
    fn('excel-dedupe', '数据去重', '按关键列保留第一条', '.xlsx', { sheet: true }),
    fn('excel-compare', '两表核对', '找出两张表的相同和差异记录', '.xlsx', { multiple: true }),
    fn('excel-filter', '条件筛选', '按列筛出需要的数据', '.xlsx', { sheet: true }),
    fn('excel-sort', '数据排序', '按指定列排序', '.xlsx', { sheet: true }),
    fn('excel-clean', '清理空白', '去掉首尾空格和空行', '.xlsx', { sheet: true }),
  ] },
  { id: 'image', title: '图片处理', brief: '压缩转格式、裁剪拼接、打码去水印', icon: 'image', color: '#9333ea', functions: [
    fn('image', '压缩与转格式', '调整尺寸、格式和文件大小', images, { multiple: true }),
    fn('image-rotate', '旋转翻转', '纠正截图和照片方向', images, { multiple: true }),
    fn('image-crop', '裁剪', '框选要保留的区域', images, { region: true }),
    fn('image-stitch', '拼接长图', '多张截图拼成长图或横图', images, { multiple: true }),
    fn('image-grid', '宫格切图', '切成九宫格等多张小图', images),
    fn('image-watermark', '添加水印', '给截图加上用途说明', images, { multiple: true }),
    fn('image-mosaic', '隐私打码', '框选手机号、账号等区域打马赛克', images, { region: true }),
    fn('image-inpaint', '去除水印', '框选水印区域，用周围颜色填补', images, { region: true, description: '适合纯色或渐变背景上的文字、标志；复杂图案上的水印去除后可能留有痕迹。' }),
  ] },
  { id: 'text', title: '文字处理', brief: '文本整理统计、批量替换、版本对照', icon: 'text', color: '#0891b2', functions: [
    fn('text', '整理与统计', '去重、清空行、字数统计、CSV / JSON 互转', '.txt,.csv,.json'),
    fn('text-replace', '批量替换', '按原文查找替换'),
    fn('word-compare', 'Word 版本对照', '找出两个版本增删的段落', '.docx', { multiple: true, description: '比较正文段落和表格文字，不比较格式；输出包含双方原文的对照文档。' }),
  ] },
  { id: 'media', title: '音视频', brief: '提取音频、转 MP3、剪切、视频截图', icon: 'media', color: '#ea580c', functions: [
    fn('audio-extract', '视频提取音频', '从视频中导出 MP3 或 WAV', media, { audio: true }),
    fn('audio-convert', '音频转格式', '转成 MP3 或 WAV', media, { audio: true }),
    fn('audio-trim', '音频剪切', '截取指定时间段', media, { audio: true, trim: true }),
    fn('video-frame', '视频截图', '按时间点导出画面', '.mp4,.mov,.m4v,.webm,.mkv', { video: true }),
  ] },
  { id: 'qr', title: '二维码', brief: '生成、批量生成、识别二维码', icon: 'qr', color: '#475569', functions: [
    fn('qr-make', '生成二维码', '网址、文字转成二维码图片'),
    fn('qr-batch', '批量生成', '每行一条内容，打包下载'),
    fn('qr-read', '识别二维码', '读出图片中的二维码内容', images, { multiple: true }),
  ] },
].map(tool => Object.freeze({ ...tool, functions: Object.freeze(tool.functions.map(item => Object.freeze({ ...item, tool: tool.id, group: tool.title }))) })));

/** 扁平功能列表：工具内的每项功能都有唯一 id，对应 Worker 中的处理实现。 */
export const utilityCatalog = Object.freeze(utilityTools.flatMap(tool => tool.functions));
