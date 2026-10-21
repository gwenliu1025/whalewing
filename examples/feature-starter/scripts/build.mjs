import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packageName, rowId } from '../identity.js';

const root = new URL('../', import.meta.url);
export function renderClient() {
  const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  // React 使用 DSH 的同一实例；不复制框架，也不访问鲸翼内部文件。
  const compiled = buildSync({
    absWorkingDir: fileURLToPath(root),
    entryPoints: [fileURLToPath(new URL('src/client.js', root))], bundle: true,
    format: 'cjs', platform: 'browser', target: 'es2022', external: ['react'], write: false,
  }).outputFiles[0].text;
  return '// 由 scripts/build.mjs 生成；请修改 src/client.js。\n'
    + `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {\nconst module = { exports: {} };\n${compiled}\nreturn module.exports;\n} });\n`;
}
export function renderPatch() {
  return '# 由 scripts/build.mjs 从 package.json 生成。\n- insert:\n    - id: ' + JSON.stringify(rowId) + '\n      name: ' + JSON.stringify(packageName) + '\n';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(new URL('client.js', root), renderClient(), 'utf8');
  writeFileSync(new URL('cordis.patch.yml', root), renderPatch(), 'utf8');
}
