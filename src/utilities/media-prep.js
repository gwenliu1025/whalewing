import { zipSync } from 'fflate';

/** 音视频的解码与截图需要浏览器主线程的媒体能力（Worker 内没有 AudioContext 和 video 元素）。 */
const MAX_SECONDS = 30 * 60;
const MAX_BYTES = 500 * 1024 ** 2;
const fail = message => { throw new Error(message); };

/** 解码音频（视频则取其音轨），可截取 [start, end) 秒；最多保留两个声道。 */
export async function decodeAudio(file, { start = 0, end = null } = {}, platform = globalThis) {
  if (!file) fail('请先选择音频或视频文件');
  if (file.size > MAX_BYTES) fail('文件超过 500 MB，请先压缩或剪短');
  const Context = platform.OfflineAudioContext || platform.webkitOfflineAudioContext;
  if (typeof Context !== 'function') fail('当前环境不支持音频解码，请使用 DSH 桌面端');
  let buffer;
  try { buffer = await new Context(1, 1, 44100).decodeAudioData(await file.arrayBuffer()); }
  catch { fail('无法读取这个文件的音频，可能没有音轨或编码不受支持（常见的 MP4、MOV、MP3、M4A、WAV 均可）'); }
  if (buffer.duration > MAX_SECONDS) fail('音频超过 30 分钟，请先剪短后再处理');
  const from = Math.max(0, Number(start) || 0), to = end === null || end === '' ? buffer.duration : Math.min(buffer.duration, Number(end));
  if (!Number.isFinite(to) || to <= from) fail(`结束时间需大于开始时间，且不超过时长 ${buffer.duration.toFixed(1)} 秒`);
  const first = Math.floor(from * buffer.sampleRate), last = Math.floor(to * buffer.sampleRate);
  const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, index) => buffer.getChannelData(index).slice(first, last));
  return { sampleRate: buffer.sampleRate, channels, duration: buffer.duration };
}

/** 解析截图时间点：“1, 5.5, 10” 列出具体秒数，或“每 5 秒”按间隔截取；最多 50 张。 */
export function frameTimes(value, duration) {
  const text = String(value || '').trim();
  const every = text.match(/^每\s*(\d+(?:\.\d+)?)\s*秒$/);
  const times = every ? Array.from({ length: Math.floor(duration / Number(every[1])) + 1 }, (_, index) => index * Number(every[1])) : text.split(/[,，\s]+/).filter(Boolean).map(Number);
  if (!times.length || times.some(time => !Number.isFinite(time) || time < 0)) fail('请填写时间点，如“1, 5.5, 10”，或“每 5 秒”');
  const valid = times.filter(time => time <= duration);
  if (!valid.length) fail(`时间点超出视频时长 ${duration.toFixed(1)} 秒`);
  if (valid.length > 50) fail('一次最多截取 50 张，请增大间隔');
  return valid;
}

/** 在指定时间点截取视频画面，输出 PNG。 */
export async function captureFrames(file, value, platform = globalThis) {
  if (!file) fail('请先选择视频文件');
  const document = platform.document;
  if (!document?.createElement) fail('当前环境不支持视频截图');
  const url = platform.URL.createObjectURL(file), video = document.createElement('video');
  video.muted = true; video.preload = 'auto'; video.src = url;
  const once = (name, timeout = 15000) => new Promise((resolve, reject) => {
    const timer = platform.setTimeout(() => reject(new Error('视频读取超时，可能编码不受支持')), timeout);
    video.addEventListener(name, () => { platform.clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener('error', () => { platform.clearTimeout(timer); reject(new Error('无法读取这个视频，编码可能不受支持（常见的 H.264 MP4 可用）')); }, { once: true });
  });
  try {
    await once('loadedmetadata');
    const times = frameTimes(value, video.duration);
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    if (!canvas.width || !canvas.height) fail('这个文件没有视频画面');
    const context = canvas.getContext('2d'), files = [], base = file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || '视频';
    for (const time of times) {
      video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
      await once('seeked');
      context.drawImage(video, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) fail('截图编码失败');
      files.push({ name: `${base}-${time.toFixed(1).replace('.', '_')}秒.png`, mime: 'image/png', bytes: new Uint8Array(await blob.arrayBuffer()) });
    }
    if (files.length > 20) {
      // 结果最多 20 个下载项；多张截图打包下载。
      return { summary: `已截取 ${files.length} 张，${canvas.width} × ${canvas.height}`, files: [{ name: `${base}-截图.zip`, mime: 'application/zip', bytes: zipSync(Object.fromEntries(files.map(item => [item.name, item.bytes])), { level: 0 }) }], listing: files.map(item => item.name) };
    }
    return { summary: `已截取 ${files.length} 张，${canvas.width} × ${canvas.height}`, files, listing: [] };
  } finally { video.removeAttribute('src'); video.load?.(); platform.URL.revokeObjectURL(url); }
}
