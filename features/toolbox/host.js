import { registerBuiltin } from '../../src/features.js';
export const inject = ['whalewing'];
/** 该部分没有独立Host业务，登记随本插件卸载撤销。 */
export function apply(ctx) { registerBuiltin(ctx, 'toolbox'); }
