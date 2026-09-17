import { t } from '../i18n/index.js';

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtMoney = (m) =>
  m ? `${m.amount.toFixed(2).replace(/\.00$/, '')} ${m.currency}`.trim() : null;

/** Caption for a new-listing notification (HTML parse mode). */
export function renderItem(item, searchName, lang = 'en') {
  const lines = [`<b>${esc(item.title || t(lang, 'item.noTitle'))}</b>`];

  const price = fmtMoney(item.price);
  const total = fmtMoney(item.totalPrice);
  if (price) {
    lines.push(
      total && total !== price
        ? `💶 <b>${esc(price)}</b>  <i>(${esc(t(lang, 'item.protection', { total }))})</i>`
        : `💶 <b>${esc(price)}</b>`,
    );
  }
  if (item.brand) lines.push(`🏷 ${esc(item.brand)}`);
  const meta = [];
  if (item.size) meta.push(`📏 ${esc(item.size)}`);
  if (item.condition) meta.push(`✨ ${esc(item.condition)}`);
  if (meta.length) lines.push(meta.join('   '));
  if (item.seller) lines.push(`👤 ${esc(item.seller)}`);
  if (searchName) lines.push(`\n🔎 <i>${esc(searchName)}</i>`);

  return lines.join('\n');
}

export const itemKeyboard = (item, lang = 'en') => ({
  inline_keyboard: [[{ text: t(lang, 'item.button'), url: item.url }]],
});
