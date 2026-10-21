import { modelWorldContract } from './contract.js';
import { registerFeature, createDeferredView } from '../../src/shell/feature.js';
/** 模型世界沿用独立视图，搜索、排序及详情仍由该视图负责。 */
export function createView({ React, loadChunk }) {
  return createDeferredView(React, () => loadChunk('./client.model-world.js'), module => {
    const ModelWorldView = module.createView(React);
    return function ModelWorldFeature({ workbench }) {
      // 现有中英词条均来自视图自己的同一份文案，随资源加载，不再将视图拖进根包。
      return React.createElement(ModelWorldView, { api: workbench.internal.clients['model-world'], notify: workbench.notify });
    };
  }, '模型世界');
}

export const name = 'whalewing-model-world';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'model-world', createView, { contract: modelWorldContract, namespace: 'whalewingModelWorld' }); }
