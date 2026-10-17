import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mosaic, inpaint, qrMatrix, qrSvg, encodeWav, encodeMp3, extraTask } from '../src/utilities/extras.js';
import { frameTimes } from '../src/utilities/media-prep.js';

// 工具台依赖安装在 src/utilities 下，按其位置解析。
const jsQR = createRequire(new URL('../src/utilities/extras.js', import.meta.url))('jsqr');
const image = (width, height, color) => { const data = new Uint8ClampedArray(width * height * 4); for (let i = 0; i < data.length; i += 4) data.set(color, i); return data; };

test('隐私打码：选区内按方块取平均色，选区外不变', () => {
  const width = 4, data = image(4, 4, [0, 0, 0, 255]);
  data.set([255, 255, 255, 255], 0); // 左上角一个白点
  mosaic(data, width, { x: 0, y: 0, width: 2, height: 2 }, 2);
  assert.deepEqual([...data.slice(0, 4)], [64, 64, 64, 255], '2×2 方块被平均');
  assert.deepEqual([...data.slice((1 * width + 1) * 4, (1 * width + 1) * 4 + 4)], [64, 64, 64, 255]);
  assert.deepEqual([...data.slice((3 * width + 3) * 4, (3 * width + 3) * 4 + 4)], [0, 0, 0, 255], '选区外保持原色');
});

test('去除水印：选区由周围颜色向内填补，纯色背景上的水印被完全抹去', () => {
  const width = 10, height = 10, data = image(width, height, [200, 120, 40, 255]);
  for (let y = 3; y < 6; y++) for (let x = 3; x < 7; x++) data.set([255, 255, 255, 255], (y * width + x) * 4); // 白色“水印”
  inpaint(data, width, height, { x: 3, y: 3, width: 4, height: 3 });
  for (let y = 3; y < 6; y++) for (let x = 3; x < 7; x++) assert.deepEqual([...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)], [200, 120, 40, 255]);
});

test('二维码：中文内容按 UTF-8 编码，生成后可被识别回原文', () => {
  const text = '鲸翼 https://example.com/?a=1';
  const matrix = qrMatrix(text, 'M'), scale = 4, margin = 4, size = (matrix.count + margin * 2) * scale;
  const pixels = image(size, size, [255, 255, 255, 255]);
  for (let row = 0; row < matrix.count; row++) for (let column = 0; column < matrix.count; column++) if (matrix.dark(row, column))
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) pixels.set([0, 0, 0, 255], (((row + margin) * scale + dy) * size + (column + margin) * scale + dx) * 4);
  assert.equal(jsQR(pixels, size, size)?.data, text);
  assert.match(qrSvg(matrix), /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
  assert.throws(() => qrMatrix(''), /请输入二维码内容/);
  assert.throws(() => qrMatrix('x'.repeat(2001)), /过长/);
});

test('音频编码：WAV 头部字段正确，MP3 输出为合法帧', () => {
  const sampleRate = 44100, tone = new Float32Array(sampleRate / 2).map((_, i) => Math.sin(i / 10) * 0.5);
  const wav = encodeWav([tone, tone], sampleRate), view = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF'); assert.equal(new TextDecoder().decode(wav.slice(8, 12)), 'WAVE');
  assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint32(24, true), sampleRate); assert.equal(wav.length, 44 + tone.length * 4);
  const mp3 = encodeMp3([tone], sampleRate, 128);
  assert.ok(mp3.length > 1000);
  const sync = mp3.findIndex((byte, i) => byte === 0xff && (mp3[i + 1] & 0xe0) === 0xe0);
  assert.ok(sync >= 0, '含 MPEG 帧同步字');
});

test('音频任务校验解码结果，并按所选格式输出', async () => {
  const pcm = { sampleRate: 8000, channels: [new Float32Array(8000)] };
  const wav = await extraTask('audio-encode', [], { pcm, format: 'wav', name: '会议录音.mp4' });
  assert.equal(wav.files[0].name, '会议录音.wav'); assert.equal(wav.files[0].mime, 'audio/wav'); assert.match(wav.summary, /单声道/);
  await assert.rejects(extraTask('audio-encode', [], { pcm: { sampleRate: 8000, channels: [] }, format: 'mp3' }), /解码结果无效/);
  await assert.rejects(extraTask('audio-encode', [], { pcm: { sampleRate: 8000, channels: [new Float32Array(0)] }, format: 'mp3' }), /没有音频/);
});

test('视频截图时间点：支持列出秒数与“每 N 秒”，超出时长与过多截图给出提示', () => {
  assert.deepEqual(frameTimes('1, 5.5，10', 60), [1, 5.5, 10]);
  assert.deepEqual(frameTimes('每 5 秒', 12), [0, 5, 10]);
  assert.deepEqual(frameTimes('1, 99', 10), [1], '超出时长的时间点被忽略');
  assert.throws(() => frameTimes('99', 10), /超出视频时长/);
  assert.throws(() => frameTimes('每 1 秒', 100), /最多截取 50 张/);
  assert.throws(() => frameTimes('abc', 10), /请填写时间点/);
});
