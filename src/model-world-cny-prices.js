/**
 * 国产模型的官网人民币标价（元 / 百万 tokens）。海外模型继续用公开目录里的美元价。
 * 只收录在厂商官方价格页核对过的模型；没收录的国产模型不显示价格，不拿美元价换算冒充官网价。
 * 有阶梯价的取最低一档并标“起”；限时折扣按原价记。以后改由鲸翼服务端每天同步，这份表届时作为离线兜底。
 */
export const worldCnyPriceAsOf = '2026-10-15';

/** 走人民币标价的国产厂商 id，与模型世界名单一致。 */
export const worldDomesticVendors = Object.freeze(['deepseek', 'alibaba', 'moonshotai', 'zhipuai', 'bytedance-seed', 'minimax', 'tencent', 'baidu', 'xiaomi', 'meituan', 'stepfun']);

const sources = {
  deepseek: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
  moonshotai: 'https://platform.kimi.com/docs/pricing/chat',
  zhipuai: 'https://docs.bigmodel.cn/cn/guide/start/pricing',
  minimax: 'https://platform.minimaxi.com/docs/pricing/overview',
  stepfun: 'https://platform.stepfun.com/docs/zh/pricing/details',
  alibaba: 'https://help.aliyun.com/zh/model-studio/model-pricing',
};

// [输入（未命中缓存）, 缓存命中输入, 输出, 是否阶梯价]；null 表示官网未单列。
const table = {
  // DeepSeek 按北京时间工作日高峰时段记，空闲时段半价。
  'deepseek/deepseek-v4.1-flash': [2, 0.04, 8], 'deepseek/deepseek-v4-flash': [2, 0.04, 8], 'deepseek/deepseek-v4-flash-vision-exp': [2, 0.04, 8],
  'deepseek/deepseek-v4-pro': [9, 0.3, 27], 'deepseek/deepseek-v4-pro-0813': [9, 0.3, 27],
  'moonshotai/kimi-k3': [20, 2, 100], 'moonshotai/kimi-k2.7-code': [6.5, 1.3, 27], 'moonshotai/kimi-k2.7-code-highspeed': [13, 2.6, 54], 'moonshotai/kimi-k2.6': [6.5, 1.1, 27],
  'zhipuai/glm-5.3': [8, 2, 28], 'zhipuai/glm-5.3-flash': [0.8, 0.23, 2.8], 'zhipuai/glm-5.3-flashx': [2, 0.57, 7], 'zhipuai/glm-5.2': [8, 2, 28],
  'zhipuai/glm-5.1': [6, 1.3, 24, true], 'zhipuai/glm-5-turbo': [5, 1.2, 22, true], 'zhipuai/glm-5': [4, 1, 18, true], 'zhipuai/glm-4.7': [2, 0.4, 8, true],
  'zhipuai/glm-4.7-flashx': [0.5, 0.1, 3], 'zhipuai/glm-4.7-flash': [0, 0, 0],
  'minimax/minimax-m3': [2.1, 0.42, 8.4, true], 'minimax/minimax-m2.7': [2.1, 0.42, 8.4], 'minimax/minimax-m2.7-highspeed': [4.2, 0.42, 16.8],
  'minimax/minimax-m2.5': [2.1, 0.21, 8.4], 'minimax/minimax-m2.5-highspeed': [4.2, 0.21, 16.8], 'minimax/minimax-m2.1': [2.1, 0.21, 8.4], 'minimax/minimax-m2': [2.1, 0.21, 8.4],
  'stepfun/step-5-preview': [7, 0.7, 20], 'stepfun/step-3.7-flash': [1.35, 0.27, 8.1], 'stepfun/step-3.5-flash': [0.7, 0.14, 2.1], 'stepfun/step-3.5-flash-2603': [0.7, 0.14, 2.1],
  'alibaba/qwen3.8-max': [12, null, 36], 'alibaba/qwen3.8-max-0902': [12, null, 36], 'alibaba/qwen3.8-max-prime': [24, null, 72], 'alibaba/qwen3.7-max': [12, null, 36],
  'alibaba/qwen3.8-flash': [0.8, null, 2.7], 'alibaba/qwen3.7-flash': [0.2, null, 0.8, true], 'alibaba/qwen3.7-plus': [2, null, 8, true],
};

export const worldCnyPrices = Object.freeze(Object.fromEntries(Object.entries(table).map(([id, [inputPerMTok, cachedInputPerMTok, outputPerMTok, tiered = false]]) =>
  [id, Object.freeze({ inputPerMTok, cachedInputPerMTok, outputPerMTok, tiered, source: sources[id.split('/')[0]] })])));

export const isDomesticVendor = vendorId => worldDomesticVendors.includes(vendorId);

/** 价格文字：国产模型用官网人民币价（没收录返回 null），海外模型用目录美元价。 */
export function worldPriceText(model, key) {
  if (isDomesticVendor(model.vendorId)) {
    const entry = worldCnyPrices[model.id];
    const value = entry?.[key];
    if (typeof value !== 'number') return null;
    return value === 0 ? '免费' : `¥${value}${entry.tiered ? ' 起' : ''}`;
  }
  const value = model.pricing?.[key];
  return typeof value === 'number' ? `$${value}` : null;
}
