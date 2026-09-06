const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtMoney = (m) =>
  m ? `${m.amount.toFixed(2).replace(/\.00$/, '')} ${m.currency}`.trim() : null;

/** Caption for a new-listing notification (HTML parse mode). */
export function renderItem(item, searchName) {
  const lines = [`<b>${esc(item.title)}</b>`];

  const price = fmtMoney(item.price);
  const total = fmtMoney(item.totalPrice);
  if (price) {
    lines.push(
      total && total !== price
        ? `💶 <b>${esc(price)}</b>  <i>(с защитой ${esc(total)})</i>`
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

export const itemKeyboard = (item) => ({
  inline_keyboard: [[{ text: '🛒 Открыть на Vinted', url: item.url }]],
});
