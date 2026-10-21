import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { utilityLicenseComment } from '../../scripts/utility-licenses.mjs';

/** Worker、浏览器转换实现和审核许可一起构建，只由工具台承担重资源闭包。 */
export function buildToolbox() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const options = { absWorkingDir: root, bundle: true, platform: 'browser', format: 'iife', target: 'es2022', minify: true, write: false, metafile: true };
  const views = buildSync({ ...options, entryPoints: ['src/utilities/views.js'], globalName: 'utilityViews' });
  const worker = buildSync({ ...options, entryPoints: ['src/utilities/worker.js'] });
  const license = utilityLicenseComment({ metafile: worker.metafile, workingDirectory: root }).replace(/[ \t]+$/gm, '');
  const source = license + `window.__ModuleLoader__.load({ id: 'dsh-whalewing', chunk: 'client.toolbox.js', factory: (require) => {\n${views.outputFiles[0].text}\nconst workerSource = ${JSON.stringify(worker.outputFiles[0].text)};\nreturn { createViews: React => utilityViews.createUtilityViews(React, workerSource) };\n} });\n`;
  return { feature: 'toolbox', artifacts: { 'client.toolbox.js': source }, metafiles: [views.metafile, worker.metafile], resources: ['content/utilities'] };
}
