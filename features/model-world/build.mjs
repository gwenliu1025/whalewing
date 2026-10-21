import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { loadModelWorldPortraits, modelWorldPortraitFiles } from '../../src/model-world-portraits.js';

/** 模型视图与立绘只进入按需分块，数据和立绘的独立许可随资源一起保留。 */
export function buildModelWorld() {
  const views = buildSync({
    absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)), entryPoints: ['src/model-world-view.js'],
    bundle: true, platform: 'browser', format: 'iife', globalName: 'modelViews',
    target: 'es2022', minify: true, write: false, metafile: true,
  });
  const source = `window.__ModuleLoader__.load({ id: 'dsh-whalewing', chunk: 'client.model-world.js', factory: (require) => {\n${views.outputFiles[0].text}\nconst portraits = ${JSON.stringify(loadModelWorldPortraits())};\nreturn { createView: React => modelViews.createModelWorldView(React, portraits) };\n} });\n`;
  return { feature: 'model-world', artifacts: { 'client.model-world.js': source }, metafiles: [views.metafile], resources: [
    ...Object.values(modelWorldPortraitFiles).map(file => `content/model-world/portraits/${file}`),
    'content/model-world/portraits/NOTICE.md', 'content/model-world/NOTICE.md', 'content/model-world/LICENSE-ai-model-world.txt', 'content/model-world/LICENSE-models-dev.txt',
  ] };
}
