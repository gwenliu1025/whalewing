/** Cards 的候选正文边界：只排除可判定的空壳，不以长度或词语命中推断事实真伪。 */
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntity = (whole, entity) => {
  if (!entity.startsWith('#')) return entities[entity.toLowerCase()];
  const point = /^#x/i.test(entity) ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
  return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : whole;
};
const text = value => value.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ').replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, decodeEntity).replace(/\s+/g, ' ').trim();
const comparable = value => text(value).normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
// 完整跳转指令语法只识别导航用途；句中出现“查看原文”等词不构成排除理由。
const navigationWords = new Set('click tap read view see visit continue go to the our original full more here article post story source link comments share ours and'.split(' '));
const navigation = value => {
  const normalized = comparable(value);
  if (/^(?:(?:请)?(?:点击|点此|查看|阅读|继续阅读|阅读全文|跳转|访问|打开))*(?:原文|全文|详情|文章|更多|链接|来源|这里)$/.test(normalized)) return true;
  const words = text(value).toLowerCase().match(/[a-z]+/g) ?? [];
  return words.length > 0 && !/[^a-z\s\p{P}\p{S}]/u.test(text(value).toLowerCase()) && words.every(word => navigationWords.has(word));
};

export function newsExcerpt(title, slots) {
  const original = comparable(title);
  for (const slot of slots) {
    if (!slot) continue;
    const value = text(slot), normalized = comparable(value);
    if (!normalized || normalized === original || navigation(value)) continue;
    // 全部内容由链接组成，或链接外只剩跳转指令，不把地址集合当成事实正文。
    if (/<a\b[^>]*>[\s\S]*?<\/a\s*>/i.test(slot)) {
      const outside = text(slot.replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi, ' '));
      if (!comparable(outside) || comparable(outside) === original || navigation(outside)) continue;
    }
    if (/^https?:\/\/\S+$/i.test(value)) continue;
    return value.slice(0, 500);
  }
  return '';
}

export const headlineBrief = '订阅未提供有效正文；此处仅展示来源原标题，不代表鲸翼确认标题事实。';
