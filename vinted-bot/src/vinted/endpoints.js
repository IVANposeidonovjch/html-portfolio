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
 */

const bare = (domain) => domain.replace(/^www\./, '');

/** Filters as the catalog page writes them. */
const passthrough = (query) => ({ ...query });

/**
 * Fallback shape: the *_ids filters folded into an attribute_ids[...] namespace.
 * The probe showed the plain names work on .de, so this is kept for the regions
 * (or the next release) where they might not.
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
    note: 'confirmed 17.09.2026 on .de via residential IP',
    headers: 'plain',
    url: build((d) => `https://api.${bare(d)}/svc-catalogue/items`, passthrough),
  },
  {
    name: 'svc-catalogue-attrs',
    note: 'same host, attribute_ids[...] filters',
    headers: 'plain',
    url: build((d) => `https://api.${bare(d)}/svc-catalogue/items`, attributeIds),
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
