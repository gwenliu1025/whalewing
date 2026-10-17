/** 模型世界只收录有角色立绘的常见厂商；顺序即图鉴顺序。Host 按此过滤快照，构建按此注入缩略图。 */
export const modelWorldVendorIds = Object.freeze([
  'openai', 'anthropic', 'google', 'deepseek', 'alibaba', 'moonshotai', 'zhipuai', 'bytedance-seed', 'minimax',
  'tencent', 'baidu', 'xiaomi', 'meituan', 'stepfun', 'xai', 'meta', 'mistral', 'perplexity',
]);

/** 同一厂商的不同系列使用不同形象：DeepSeek Flash 是“小飞鱼妹妹”，其余型号是“大飞鱼姐姐”。 */
export const modelWorldVariants = Object.freeze([
  Object.freeze({ id: 'deepseek-flash', vendorId: 'deepseek', pattern: 'flash' }),
]);

/** 每个立绘的 id：厂商主形象用厂商 id，系列形象用变体 id。 */
export const modelWorldPortraitIds = Object.freeze([...modelWorldVendorIds, ...modelWorldVariants.map(variant => variant.id)]);

/** 按型号选择立绘 id：命中系列关键词用系列形象，否则用厂商主形象。 */
export function portraitIdFor(vendorId, modelId = '') {
  const variant = modelWorldVariants.find(item => item.vendorId === vendorId && modelId.toLowerCase().includes(item.pattern));
  return variant ? variant.id : vendorId;
}
