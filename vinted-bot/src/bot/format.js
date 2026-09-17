import { t } from '../i18n/index.js';

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Vinted answers in ISO codes; people read symbols. */
const SYMBOLS = { EUR: '€', GBP: '£', USD: '$', PLN: 'zł', CZK: 'Kč', SEK: 'kr', DKK: 'kr', HUF: 'Ft', RON: 'lei' };

const fmtMoney = (m) => {
  if (!m) return null;
  const amount = m.amount.toFixed(2).replace(/\.00$/, '');
  const symbol = SYMBOLS[m.currency];
  return symbol ? `${amount}${symbol}` : `${amount} ${m.currency}`.trim();
};

/**
 * Search names are free text ("Avant mix", "Raf 🔥"), and a hashtag stops at the
 * first space — so strip everything a tag cannot carry and keep the letters.
 */
const hashtag = (name) => {
  const tag = String(name ?? '').replace(/[^\p{L}\p{N}_]+/gu, '');
  return tag ? `#${tag}` : null;
};

/** Caption for a new-listing notification (HTML parse mode). */
export function renderItem(item, searchName, lang = 'en') {
  const lines = [`📌 <b>${esc(item.title || t(lang, 'item.noTitle'))}</b>`];

  const price = fmtMoney(item.price);
  if (price) lines.push(`💰 ${t(lang, 'item.price')} : ${esc(price)}`);
  if (item.brand) lines.push(`🏷 ${t(lang, 'item.brand')} : ${esc(item.brand)}`);
  if (item.size) lines.push(`📏 ${t(lang, 'item.size')} : ${esc(item.size)}`);

  const tag = hashtag(searchName);
  if (tag) lines.push(esc(tag));

  return lines.join('\n');
}

/**
 * The listing shown in /help and in the demo photo. Both render it through
 * renderItem(), so the example can never describe something the bot no longer
 * sends — a test asserts the help text contains this exact output.
 */
export const DEMO_SEARCH = 'Raf';
export const demoItem = () => ({
  id: 1,
  title: 'Raf Simons bomber',
  brand: 'Raf Simons',
  size: 'L',
  condition: null,
  price: { amount: 240, currency: 'EUR' },
  totalPrice: null,
  photoUrl: null,
  seller: null,
  favourites: 0,
  uploadedAt: null,
  url: 'https://www.vinted.de/items/1',
});

export const itemKeyboard = (item, lang = 'en') => ({
  inline_keyboard: [[{ text: t(lang, 'item.button'), url: item.url }]],
});
