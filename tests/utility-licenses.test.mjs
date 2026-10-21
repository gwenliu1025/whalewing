import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { readUtilityLicenseAudit, readUtilityLicenseNotice, resolveUtilityPackageRoot, utilityLicenseComment } from '../scripts/utility-licenses.mjs';

function inputs(roots) {
  const { audit } = readUtilityLicenseAudit();
  return { inputs: Object.fromEntries([...audit.packages.flatMap(item => {
    const root = roots(item.name);
    return item.files.filter(file => file.input).map(file => [path.join(root, file.file), {}]);
  }), ...audit.assets.filter(asset => asset.input).map(asset => [fileURLToPath(new URL(`../content/utilities/${asset.file}`, import.meta.url)), {}])]) };
}

test('完整通知覆盖预构建内嵌许可及来源，不以四包 MIT 代替', () => {
  const { audit, notice } = readUtilityLicenseAudit();
  assert.equal(audit.excelSourceFiles, 534); assert.equal(audit.excelEmbeddedOwners, 72); assert.equal(audit.docxEmbeddedOwners, 45); assert.equal(audit.jszipModulesPerCarrier, 54);
  assert.equal(audit.closures.length, 129);
  assert.equal(audit.pdfmakeEmbedded.length, 71);
  assert.deepEqual(audit.licenseDeclarationExceptions.map(item => item.name).sort(), ['@foliojs-fork/fontkit', 'brotli', 'dfa', 'qrcode-generator']);
  for (const text of ['上游发布包未附独立 LICENSE', 'Copyright 2013 Google Inc.', 'SIL OPEN FONT LICENSE', 'Blue Oak Model License']) assert.ok(notice.includes(text), text);
  for (const name of ['core-js', 'elliptic', 'pako', 'lie', 'immediate', 'setimmediate', 'sha.js', 'Google Closure Library', '@oxc-project/runtime', 'rolldown', '@babel/helpers', 'tslib']) assert.ok(audit.closures.some(item => item.name === name), name);
  assert.ok(audit.closures.some(item => item.name === 'pako' && item.sourceVersion === '1.0.5'));
  assert.ok(audit.closures.some(item => item.name === 'sax' && item.sourceVersion === '1.2.4'));
  for (const text of ['Apache License', 'Version 2.0', 'The ISC License', 'Neither the name', 'Jean-loup Gailly', 'Mark Adler', 'Microsoft Corporation', 'Evan Wallace', 'The Closure Library Authors', 'Fedor Indutny']) assert.ok(notice.includes(text), text);
  assert.match(notice, /不声称反推出上游唯一安装版本/);
});

test('本地已审核载体及完整依赖输入通过，不访问网络或运行构建', () => {
  const metafile = inputs(resolveUtilityPackageRoot);
  const notice = readUtilityLicenseNotice({ metafile });
  assert.equal(notice, readUtilityLicenseAudit().notice);
  const comment = utilityLicenseComment({ metafile });
  assert.ok(comment.startsWith('/*!\n')); assert.ok(comment.endsWith('*/\n'));
  assert.doesNotThrow(() => new Function(`${comment}\nreturn true;`));
});

test('缺少本次构建证据、漏掉依赖或出现未知输入均拒收', () => {
  for (const options of [undefined, {}, { metafile: {} }, { metafile: { inputs: {} } }]) assert.throws(() => readUtilityLicenseNotice(options), /metafile/);
  const partial = inputs(resolveUtilityPackageRoot); delete partial.inputs[Object.keys(partial.inputs)[0]];
  assert.throws(() => readUtilityLicenseNotice({ metafile: partial }), /缺少已审核入口/);
  const unknown = inputs(resolveUtilityPackageRoot); unknown.inputs['<unreviewed>'] = {};
  assert.throws(() => readUtilityLicenseNotice({ metafile: unknown }), /未核清的虚拟输入/);
  const foreign = inputs(resolveUtilityPackageRoot); foreign.inputs[fileURLToPath(new URL('../scripts/utility-licenses.mjs', import.meta.url))] = {};
  assert.throws(() => readUtilityLicenseNotice({ metafile: foreign }), /未审核的外部输入/);
});

test('版本与预构建内容变化拒收，不静默沿用旧归属', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-utility-license-'));
  t.after(async () => { if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('whalewing-utility-license-')) throw new Error('清理路径越界'); await fs.rm(root, { recursive: true, force: true }); });
  const { audit } = readUtilityLicenseAudit();
  // 只隔离实际变更的包；其余完整审核载体从安装树只读核验，不为拒收用例复制无写入的文件。
  const mutable = new Set(['exceljs', 'docx']);
  const installedRoots = new Map(audit.packages.map(item => [item.name, resolveUtilityPackageRoot(item.name)]));
  const roots = name => mutable.has(name) ? path.join(root, name) : installedRoots.get(name);
  for (const item of audit.packages) {
    if (!mutable.has(item.name)) continue;
    const source = installedRoots.get(item.name), destination = roots(item.name);
    assert.notEqual(destination, source, '变更只发生在临时副本');
    for (const entry of item.files) { const target = path.join(destination, entry.file); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(path.join(source, entry.file), target); }
  }
  const metafile = inputs(roots); assert.doesNotThrow(() => readUtilityLicenseNotice({ metafile, resolvePackageRoot: roots }));
  const carrier = path.join(roots('exceljs'), 'dist/exceljs.min.js'); const original = await fs.readFile(carrier);
  await fs.appendFile(carrier, '\n// changed'); assert.throws(() => readUtilityLicenseNotice({ metafile, resolvePackageRoot: roots }), /内容变化/);
  await fs.writeFile(carrier, original);
  const manifestPath = path.join(roots('docx'), 'package.json'), manifest = JSON.parse(await fs.readFile(manifestPath)); manifest.version = '9.10.1';
  await fs.writeFile(manifestPath, JSON.stringify(manifest)); assert.throws(() => readUtilityLicenseNotice({ metafile, resolvePackageRoot: roots }), /版本与已审核载体不同/);
});
