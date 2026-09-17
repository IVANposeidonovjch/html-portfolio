/**
 * Where the catalog actually lives.
 *
 * Until ~September 2026 the web app called `https://www.vinted.xx/api/v2/catalog/items`.
 * That path now answers 404 with a generic HTML page even for a freshly
 * bootstrapped session: the endpoint moved, it was not an auth failure.
 *
 * MEASURED 17.09.2026 (tools/probe-standalone.mjs, www.vinted.de, residential
 * IP): `https://api.vinted.de/svc-catalogue/items` returns real listings with
 * the page's own filter names and a plain header set. The same call from a
 * datacenter IP answers 403 — the proxy is not optional any more.
 *
 * The list stays a list: the client walks it, keeps whichever variant returns
 * items, and re-walks when that one starts failing, so the next move Vinted
 * makes costs a probe run rather than a rewrite. Pin one with
 * VINTED_API_STRATEGY.
 *
 * `headers` says which header set the variant was confirmed with. The client
 * tries that one first and the other as a fallback, because sending headers a
 * confirmed-working call did not send is its own way to get rejected.
 *
 * FILTER SHAPE (17.09.2026). The probe confirmed a `search_text` query with
 * plain parameter names — but that query carried no *_ids filter at all, so it
 * proves nothing about them. An independent implementation
 * (JakobAIOdev/Vintrack-Vinted-Monitor@3fd1ff2) folds every id filter into
 * `attribute_ids[...]`. The failure mode in between is the dangerous one: the
 * service answers 200 with listings while silently ignoring `brand_ids`, and a
 * monitor built on that floods its topics with the wrong brand. So a query that
 * carries id filters tries the attribute shape FIRST, and `filtersLookHonoured`
 * below rejects a response whose brands contradict the filter — a variant only
 * gets cached once it has proven it actually narrows results.
 */

const bare = (domain) => domain.replace(/^www\./, '');

/** Filters as the catalog page writes them. */
const passthrough = (query) => ({ ...query });

/**
 * The attribute shape: *_ids filters folded into an attribute_ids[...] namespace,
 * as the Vintrack fix builds them.
 */
const ATTRIBUTE_MAP = {
  catalog_ids: 'catalog',
  brand_ids: 'brand',
  size_ids: 'size',
  status_ids: 'status',
  color_ids: 'color',
  material_ids: 'material',
  video_game_platform_ids: 'video_game_platform',
};

/** Filters whose names differ between the two shapes. */
export const hasIdFilters = (query) => Object.keys(query).some((k) => k in ATTRIBUTE_MAP);
const attributeIds = (query) => {
  const out = {};
  for (const [key, value] of Object.entries(query)) {
    const attr = ATTRIBUTE_MAP[key];
    if (attr) out[`attribute_ids[${attr}]`] = value;
    else out[key] = value;
  }
  return out;
};

const build = (base, mapParams) => (domain, query, { page = 1, perPage = 40 } = {}) => {
  const sp = new URLSearchParams(mapParams(query));
  sp.set('page', String(page));
  sp.set('per_page', String(perPage));
  sp.set('order', 'newest_first');
  return `${base(domain)}?${sp.toString()}`;
};

/** Item array under any of the shapes seen so far. */
export function extractItems(body) {
  for (const candidate of [body?.items, body?.catalogItems, body?.data?.items, body?.results]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return null;
}

export const STRATEGIES = [
  {
    name: 'svc-catalogue-attrs',
    note: 'attribute_ids[...] filters, per the Vintrack fix',
    headers: 'full',
    url: build((d) => `https://api.${bare(d)}/svc-catalogue/items`, attributeIds),
  },
  {
    name: 'svc-catalogue',
    note: 'plain filter names, confirmed 17.09.2026 for search_text on .de',
    headers: 'plain',
    url: build((d) => `https://api.${bare(d)}/svc-catalogue/items`, passthrough),
  },
  {
    name: 'svc-catalogue-www',
    note: 'api.www.<domain> host variant reported for .com',
    headers: 'plain',
    url: build((d) => `https://api.www.${bare(d)}/svc-catalogue/items`, passthrough),
  },
  {
    name: 'legacy-catalog',
    note: 'pre-September-2026 endpoint, 404 since the move',
    headers: 'full',
    url: build((d) => `https://${d}/api/v2/catalog/items`, passthrough),
  },
];

export const strategyByName = (name) => STRATEGIES.find((s) => s.name === name);

/**
 * Order to try variants in. A text-only search is known to work with plain
 * names, so it keeps that order; anything carrying id filters leads with the
 * attribute shape, which is the one an independent implementation ships.
 */
export function orderedStrategies(query) {
  if (!hasIdFilters(query)) {
    return [...STRATEGIES].sort((a, b) => (a.name === 'svc-catalogue' ? -1 : b.name === 'svc-catalogue' ? 1 : 0));
  }
  return [...STRATEGIES];
}

/**
 * Did the response actually respect the brand filter, or did the service answer
 * 200 and ignore it? Items carry `brand_id` in some shapes and only
 * `brand_title` in others, so check the strong signal first and fall back to
 * counting distinct brands: asking for one brand and getting five means the
 * filter was dropped.
 *
 * Returns null when there is not enough evidence to judge — callers treat that
 * as "no objection", never as proof.
 */
export function filtersLookHonoured(query, items) {
  const wanted = String(query.brand_ids || '').split(',').filter(Boolean);
  if (!wanted.length || items.length < 3) return null;

  const ids = items.map((i) => i.brand_id ?? i.brand?.id).filter((v) => v !== undefined && v !== null);
  if (ids.length === items.length) {
    const matching = ids.filter((id) => wanted.includes(String(id))).length;
    return { ok: matching === ids.length, detail: `${matching}/${ids.length} объявлений с нужным brand_id` };
  }

  const titles = new Set(items.map((i) => i.brand_title || i.brand?.title || i.item_box?.first_line).filter(Boolean));
  if (titles.size <= 1) return null;
  return {
    ok: titles.size <= wanted.length,
    detail: `запрошено брендов: ${wanted.length}, в ответе разных: ${titles.size} (${[...titles].slice(0, 4).join(', ')})`,
  };
}
