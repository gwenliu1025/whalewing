import { registerFeature, createDeferredView } from '../../src/shell/feature.js';

/** 转换任务和下载状态由工具视图持有，切换只停止在途操作，不丢下载。 */
export function createView({ React, loadChunk, Glyph }) {
  return createDeferredView(React, () => loadChunk('./client.toolbox.js'), module => {
    const { ToolboxView } = module.createViews(React);
    return function ToolboxFeature({ active }) {
      return React.createElement(ToolboxView, { key: 'toolbox', active, Glyph });
    };
  }, '工具台');
}

export const name = 'whalewing-toolbox';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'toolbox', createView, {  }); }
