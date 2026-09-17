/**
 * Where the catalog actually lives.
 *
 * Until ~September 2026 the web app called `https://www.vinted.xx/api/v2/catalog/items`.
 * That path now answers 404 with a generic HTML page even for a freshly
 * bootstrapped session — the endpoint moved, it is not an auth failure.
 * Independent reports (Giglium/vinted_scraper#214, #215, 15.09.2026) point at a
 * dedicated API host: `https://api.vinted.xx/svc-catalogue/items`.
 *
 * Those reports are UNVERIFIED — nobody confirmed the parameter shape or the
 * headers. So instead of hardcoding one guess, the client walks this list at
 * runtime, keeps whichever variant actually returns items, and re-walks it the
 * next time that variant 404s. `tools/probe.mjs` runs the same matrix against
 * the real network and prints which entry wins; pin it with VINTED_API_STRATEGY.
 */

const bare = (domain) => domain.replace(/^www\./, '');

/** Filters as the catalog page writes them. */
const passthrough = (query) => ({ ...query });

/**
 * Hypothesis for the new service: the *_ids filters are folded into an
 * attribute_ids[...] namespace. Verified by the probe, not by faith.
 */
const ATTRIBUTE_MAP = {
  catalog_ids: 'catalog',
  brand_ids: 'brand',
  size_ids: 'size',
  status_ids: 'status',
  color_ids: 'color',
  material_ids: 'material',
};
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
    name: 'svc-catalogue',
    note: 'reported replacement, plain filters',
    url: build((d) => `https://api.${bare(d)}/svc-catalogue/items`, passthrough),
  },
  {
    name: 'svc-catalogue-attrs',
    note: 'reported replacement, attribute_ids[...] filters',
    url: build((d) => `https://api.${bare(d)}/svc-catalogue/items`, attributeIds),
  },
  {
    name: 'svc-catalogue-www',
    note: 'api.www.<domain> host variant reported for .com',
    url: build((d) => `https://api.www.${bare(d)}/svc-catalogue/items`, passthrough),
  },
  {
    name: 'legacy-catalog',
    note: 'pre-September-2026 endpoint, kept as fallback',
    url: build((d) => `https://${d}/api/v2/catalog/items`, passthrough),
  },
];

export const strategyByName = (name) => STRATEGIES.find((s) => s.name === name);
