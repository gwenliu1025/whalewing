import { readFileSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const auditFile = new URL('../content/utilities/audited-source.json', import.meta.url);
const noticeFile = new URL('../content/utilities/THIRD_PARTY_NOTICES.txt', import.meta.url);
const utilityRequire = createRequire(new URL('../src/utilities/core.js', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`工具台许可拒收：${message}`); };
const readText = file => new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
const within = (root, file) => { const relative = path.relative(root, file); return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };

/** 读取既有安装树，不安装、不下载；通过包身份而非 node_modules 的布局猜测归属。 */
export function resolveUtilityPackageRoot(name) {
  let directory = path.dirname(utilityRequire.resolve(name));
  for (;;) {
    const manifest = path.join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readText(manifest)).name === name) return realpathSync(directory);
    const parent = path.dirname(directory);
    if (parent === directory) fail(`缺少已安装依赖 ${name}`);
    directory = parent;
  }
}

/** 审核依据仅绑定固定输入载体；变更依赖或内嵌源码必须先重新核清许可。 */
export function readUtilityLicenseAudit() {
  const audit = JSON.parse(readText(auditFile));
  const reviewed = ['exceljs', 'docx', 'fflate', '@xmldom/xmldom', 'tslib', 'pdf-lib', 'pako', '@pdf-lib/standard-fonts', '@pdf-lib/upng', 'pdfmake', 'pdfjs-dist', 'qrcode-generator', 'jsqr', '@breezystack/lamejs'];
  if (audit.schema !== 1 || !Array.isArray(audit.packages) || audit.packages.length !== reviewed.length || reviewed.some(name => !audit.packages.some(p => p.name === name)) || !Array.isArray(audit.closures) || audit.closures.length < audit.packages.length || !/^[a-f0-9]{64}$/.test(audit.noticeSha256)) fail('审计依据格式无效');
  const identities = new Set();
  for (const item of audit.packages) {
    if (typeof item.name !== 'string' || identities.has(item.name) || typeof item.version !== 'string' || !Array.isArray(item.files) || !item.files.length) fail('依赖身份或文件清单无效');
    identities.add(item.name);
    const files = new Set();
    for (const entry of item.files) {
      if (typeof entry.file !== 'string' || entry.file.includes('\\') || path.posix.isAbsolute(entry.file) || entry.file.split('/').some(part => !part || part === '.' || part === '..') || files.has(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256) || typeof entry.input !== 'boolean') fail('输入载体路径或指纹无效');
      files.add(entry.file);
    }
  }
  const declarationExceptions = {
    brotli: ['1.3.3', '387b47d00ea96cab9b4c521629fbcdc7621053ac061812526f3c69700924cef5'],
    dfa: ['1.2.0', '96c0ce3cc17b34aabd58fd442157766d9e244cba735e54ee4fe10d7841f0460c'],
    '@foliojs-fork/fontkit': ['1.9.2', 'fa2a257d23e3bcb579752571595aa2b841b8c31b7da02ebd48020584910282c3'],
    'qrcode-generator': ['2.0.4', '0c8db18ad7f1b9dece93dd87dc0624be938f9b9b21e93c0f78e6e2d194ac10e9'],
  };
  // 四份发布包明确声明 MIT 但未附独立 LICENSE；只接纳已核对的固定原声明和源码版权头。
  if (!Array.isArray(audit.licenseDeclarationExceptions) || audit.licenseDeclarationExceptions.length !== 4) fail('许可声明例外不完整');
  for (const item of audit.licenseDeclarationExceptions) {
    const fixed = declarationExceptions[item.name];
    if (!fixed || item.version !== fixed[0] || item.manifestSha256 !== fixed[1]) fail('出现未审核许可声明例外');
    if (hash(readFileSync(path.join(resolveUtilityPackageRoot(item.name), 'package.json'))) !== fixed[1]) fail(`${item.name} 原许可声明发生变化`);
  }
  if (!Array.isArray(audit.pdfmakeEmbedded) || audit.pdfmakeEmbedded.length !== 71 || new Set(audit.pdfmakeEmbedded.map(p => p.name)).size !== 71) fail('pdfmake 内嵌许可覆盖不完整');
  if (!Array.isArray(audit.assets) || audit.assets.length !== 4 || new Set(audit.assets.map(a => a.file)).size !== 4) fail('字体来源不完整');
  for (const asset of audit.assets) if (!['noto-font.json', 'NotoSansSC-Regular.otf', 'NotoSansSC-LICENSE.txt', 'pdf-assets.json'].includes(asset.file) || typeof asset.input !== 'boolean' || !/^[a-f0-9]{64}$/.test(asset.sha256)) fail('字体来源格式无效');
  const notice = readText(noticeFile);
  if (hash(Buffer.from(notice)) !== audit.noticeSha256) fail('许可证原文与已审核内容不一致');
  return { audit, notice };
}

/** metafile 证明实际依赖输入；载体指纹负责证明其不可见的预构建内嵌来源没有变化。 */
export function readUtilityLicenseNotice({ metafile, workingDirectory = process.cwd(), resolvePackageRoot = resolveUtilityPackageRoot } = {}) {
  if (!metafile?.inputs || typeof metafile.inputs !== 'object' || Array.isArray(metafile.inputs) || !Object.keys(metafile.inputs).length) fail('必须提供本次 Worker 构建的非空 metafile.inputs');
  const { audit, notice } = readUtilityLicenseAudit();
  const acceptedInputs = new Map(), seen = new Set();
  for (const item of audit.packages) {
    const root = realpathSync(resolvePackageRoot(item.name));
    const manifest = JSON.parse(readText(path.join(root, 'package.json')));
    if (manifest.name !== item.name || manifest.version !== item.version) fail(`${item.name} 版本与已审核载体不同`);
    for (const entry of item.files) {
      const file = realpathSync(path.join(root, entry.file));
      if (!within(root, file)) fail(`${item.name} 载体越出包目录`);
      if (hash(readFileSync(file)) !== entry.sha256) fail(`${item.name}/${entry.file} 内容变化，需重审内嵌来源`);
      if (entry.input) acceptedInputs.set(file, `${item.name}/${entry.file}`);
    }
  }
  for (const asset of audit.assets) {
    const file = realpathSync(new URL(`../content/utilities/${asset.file}`, import.meta.url));
    if (hash(readFileSync(file)) !== asset.sha256) fail(`字体载体 ${asset.file} 内容变化`);
    if (asset.input) acceptedInputs.set(file, `字体/${asset.file}`);
  }
  const ownSources = realpathSync(path.join(packageRoot, 'src/utilities'));
  for (const input of Object.keys(metafile.inputs)) {
    if (input.startsWith('<') || input.includes('\0')) fail(`未核清的虚拟输入 ${input}`);
    const file = realpathSync(path.resolve(workingDirectory, input));
    if (acceptedInputs.has(file)) seen.add(file);
    else if (!within(ownSources, file)) fail(`本次构建包含未审核的外部输入 ${input}`);
  }
  for (const [file, identity] of acceptedInputs) if (!seen.has(file)) fail(`本次构建缺少已审核入口 ${identity}，先核对依赖选择`);
  return notice;
}

/** JS 注释仅作内联展示；原始许可证由随包 TXT 保持，结束符只在注释载体内转义。 */
export function utilityLicenseComment(options) {
  return `/*!\n${readUtilityLicenseNotice(options).replaceAll('*/', '* /')}\n*/\n`;
}
