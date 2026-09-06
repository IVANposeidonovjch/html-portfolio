/** Vinted returns slightly different shapes per region/version — normalize once. */

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

export function normalizeItem(raw, domain) {
  const id = Number(raw?.id);
  if (!Number.isFinite(id)) return null;
  const photo = raw.photo || raw.photos?.[0] || null;
  return {
    id,
    title: raw.title || 'Без названия',
    brand: raw.brand_title || raw.brand?.title || null,
    size: raw.size_title || null,
    condition: raw.status || null,
    price: money(raw.price),
    totalPrice: money(raw.total_item_price), // price incl. buyer protection
    photoUrl: photo?.full_size_url || photo?.url || null,
    seller: raw.user?.login || null,
    favourites: Number(raw.favourite_count) || 0,
    uploadedAt: Number(photo?.high_resolution?.timestamp) || null,
    url: raw.url || `https://${domain}/items/${id}`,
  };
}

export function normalizeAll(rawItems, domain) {
  return rawItems.map((r) => normalizeItem(r, domain)).filter(Boolean);
}
