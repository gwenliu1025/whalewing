import { registerBuiltin } from '../../src/features.js';
import { applyManagement } from './management.js';
export const inject = ['whalewing'];
/** 管理依赖晚到只影响助手管理能力，不阻塞工作台底座。 */
export function apply(ctx) { registerBuiltin(ctx, 'assistant'); applyManagement(ctx); }
