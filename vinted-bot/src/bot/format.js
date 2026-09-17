import { t } from '../i18n/index.js';

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£' };
const fmtMoney = (m) => {
  if (!m) return null;
  const symbol = CURRENCY_SYMBOLS[m.currency] || m.currency || '';
  return `${m.amount.toFixed(2).replace(/\.00$/, '')}${symbol}`;
};

/** Caption for a new-listing notification (HTML parse mode). */
export function renderItem(item, searchName, lang = 'en') {
  const lines = [`📌 <b>${esc(item.title || t(lang, 'item.noTitle'))}</b>`];

  const price = fmtMoney(item.price);
  if (price) lines.push(`💰 <b>Price</b> : ${esc(price)}`);
  if (item.brand) lines.push(`🏷 <b>Brand</b> : ${esc(item.brand)}`);
  if (item.size) lines.push(`📏 <b>Size</b> : ${esc(item.size)}`);
  if (searchName) lines.push(`#${esc(searchName.replace(/\s+/g, ''))}`);

  return lines.join('\n');
}

export const itemKeyboard = (item, lang = 'en') => ({
  inline_keyboard: [[{ text: t(lang, 'item.button'), url: item.url }]],
});

