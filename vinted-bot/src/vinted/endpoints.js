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
 * FILTER SHAPE — measured, not inferred (17.09.2026, .de, residential IP):
 *   `...?brand_ids=344976`            -> 200, and an adidas listing comes back.
 *                                        The filter is accepted and ignored.
 *   `...?attribute_ids[brand]=344976` -> 200 with listings.
 * So plain names work for `search_text` only, and every id filter has to travel
 * as `attribute_ids[...]` — the same shape an independent implementation ships
 * (JakobAIOdev/Vintrack-Vinted-Monitor@3fd1ff2).
 *
 * Silently-dropped filters are the worst failure this bot can have: 200 OK,
 * listings flowing, wrong brand in the topic. Two defences, both here:
 * orderedStrategies() never offers the plain shape to a filtered query, and
 * filtersLookHonoured() rejects any answer whose brands contradict the filter,
 * so a variant is cached only after it has proven it narrows results.
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

/**
 * Every variant is a (host, filter shape) pair. `shape` matters most: a query
 * with id filters must never be sent in the plain shape, because that shape is
 * MEASURED to drop them silently — a search pinned to brand 344976 came back
 * with an adidas listing (17.09.2026, .de, residential IP).
 */
export const STRATEGIES = [
  {
    name: 'svc-catalogue-attrs',
    shape: 'attrs',
    note: 'api host, attribute_ids[...] — confirmed 17.09.2026: brand filter is honoured',
    headers: 'full',
    url: build((d) => `https://api.${bare(d)}/svc-catalogue/items`, attributeIds),
  },
  {
    name: 'svc-catalogue-www-attrs',
    shape: 'attrs',
    note: 'api.www host, attribute_ids[...]',
    headers: 'full',
    url: build((d) => `https://api.www.${bare(d)}/svc-catalogue/items`, attributeIds),
  },
  {
    name: 'svc-catalogue',
    shape: 'plain',
    note: 'api host, plain names — confirmed for search_text, drops *_ids filters',
    headers: 'plain',
    url: build((d) => `https://api.${bare(d)}/svc-catalogue/items`, passthrough),
  },
  {
    name: 'svc-catalogue-www',
    shape: 'plain',
    note: 'api.www host, plain names',
    headers: 'plain',
    url: build((d) => `https://api.www.${bare(d)}/svc-catalogue/items`, passthrough),
  },
  {
    name: 'legacy-catalog',
    shape: 'plain',
    note: 'pre-September-2026 endpoint, 404 since the move',
    headers: 'full',
    url: build((d) => `https://${d}/api/v2/catalog/items`, passthrough),
  },
];

export const strategyByName = (name) => STRATEGIES.find((s) => s.name === name);

/**
 * Which variants may serve this query, best first.
 *
 * A query carrying id filters gets the attribute-shaped variants ONLY. The
 * plain shape would answer 200 with listings of other brands, and a monitor
 * that posts the wrong brand into a topic is worse than one that reports it
 * cannot reach Vinted — so the plain shape is not a fallback here, it is a
 * wrong answer. If every attribute variant fails, fetchCatalog says so and
 * points at the probe.
 *
 * A text-only query has no id filters to drop, so both shapes are equivalent
 * and the order follows what was measured: plain names first.
 */
export function orderedStrategies(query) {
  if (hasIdFilters(query)) return STRATEGIES.filter((s) => s.shape === 'attrs');
  return [...STRATEGIES].sort((a, b) => (a.shape === b.shape ? 0 : a.shape === 'plain' ? -1 : 1));
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
  if (items.length < 3) return null;

  // Exact check wherever the listing carries the id we filtered on.
  for (const [filter, field] of [['brand_ids', 'brand_id'], ['catalog_ids', 'catalog_id']]) {
    const wantedIds = String(query[filter] || '').split(',').filter(Boolean);
    if (!wantedIds.length) continue;
    const ids = items.map((i) => i[field] ?? i[field.replace('_id', '')]?.id).filter((v) => v != null);
    if (ids.length !== items.length) continue;
    const matching = ids.filter((id) => wantedIds.includes(String(id))).length;
    return {
      ok: matching === ids.length,
      detail: `${matching}/${ids.length} объявлений с нужным ${field}`,
    };
  }

  const wanted = String(query.brand_ids || '').split(',').filter(Boolean);
  if (!wanted.length) return null;

  const titles = new Set(items.map((i) => i.brand_title || i.brand?.title || i.item_box?.first_line).filter(Boolean));
  if (titles.size <= 1) return null;
  return {
    ok: titles.size <= wanted.length,
    detail: `запрошено брендов: ${wanted.length}, в ответе разных: ${titles.size} (${[...titles].slice(0, 4).join(', ')})`,
  };
}
