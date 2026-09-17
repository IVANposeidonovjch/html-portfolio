import { logger } from '../util/logger.js';

/**
 * Vinted returns slightly different shapes per region, per endpoint and per
 * release — normalize once, here.
 *
 * The svc-catalogue endpoint (September 2026) carries the grid labels in an
 * `item_box` object instead of the old flat `brand_title` / `size_title`
 * fields. Flat fields win when present; `item_box` is the fallback, and its
 * line-to-meaning mapping is an inference — if a listing comes out without a
 * price or a photo, the warning below prints the real key names once so the
 * mapping can be corrected from data rather than guessed again.
 */

function money(value) {
  if (value == null) return null;
  if (typeof value === 'object') {
    const amount = Number(value.amount);
    if (!Number.isFinite(amount)) return null;
    return { amount, currency: value.currency_code || value.currency || '' };
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? { amount, currency: '' } : null;
}

/** item_box.second_line combines size and condition, e.g. "36 · Très bon état".
 *  Keep only the part that actually looks like a size (has a digit, or is a
 *  standard letter size) — condition phrases vary by language and are never
 *  reliably size-shaped. */
function extractSize(secondLine) {
  if (!secondLine) return null;
  for (const part of secondLine.split(/[·/]/).map((p) => p.trim())) {
    if (/^\d/.test(part) || /^(XXS|XS|S|M|L|XL|XXL|XXXL)$/i.test(part)) return part;
  }
  return null;
}

/** First non-empty value among several candidate paths. */
const pick = (...values) => values.find((v) => v !== undefined && v !== null && v !== '') ?? null;

let shapeWarned = false;

export function normalizeItem(raw, domain) {
  const id = Number(raw?.id);
  if (!Number.isFinite(id)) return null;

  const box = raw.item_box || {};
  const photo = raw.photo || raw.photos?.[0] || raw.main_photo || box.image || null;

  const item = {
    id,
    title: pick(raw.title, box.first_line) || 'Без названия',
    brand: pick(raw.brand_title, raw.brand?.title, box.first_line),
          size: pick(raw.size_title, raw.size, extractSize(box.second_line)),

    condition: pick(raw.status, raw.condition, box.third_line),
    price: money(pick(raw.price, box.price)),
    totalPrice: money(pick(raw.total_item_price, box.total_item_price)), // incl. buyer protection
    photoUrl: pick(photo?.full_size_url, photo?.url, raw.image?.url),
    seller: pick(raw.user?.login, raw.user?.username),
    favourites: Number(raw.favourite_count) || 0,
    uploadedAt: Number(pick(photo?.high_resolution?.timestamp, raw.created_at_ts)) || null,
        url: raw.url?.startsWith('http') ? raw.url : `https://${domain}${raw.url || `/items/${id}`}`,
  };

  if (!shapeWarned && (!item.price || !item.photoUrl)) {
    shapeWarned = true;
    logger.warn(
      `объявление разобрано не полностью (price=${!!item.price} photo=${!!item.photoUrl}). ` +
        `Поля ответа: ${Object.keys(raw).join(', ')}` +
        (raw.item_box ? ` | item_box: ${Object.keys(raw.item_box).join(', ')}` : ''),
    );
  }

  return item;
}

export function normalizeAll(rawItems, domain) {
  return rawItems.map((r) => normalizeItem(r, domain)).filter(Boolean);
}
