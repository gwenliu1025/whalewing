import { packageName, featureId, rowId } from './identity.js';
export const name = rowId;
export const inject = ['whalewing'];

export function apply(ctx) {
  // 绑定本扩展的上下文；关闭或卸载时由 Cordis 自动撤销登记。
  ctx.whalewing.features.register(ctx, {
    id: featureId, api: 1, package: packageName,
    tab: { keepAlive: true },
  });
}
