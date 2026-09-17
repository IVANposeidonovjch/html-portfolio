/**
 * Turns a Vinted *search page* URL (the one a user copies from the browser)
 * into the parameters of Vinted's own catalog service, which the web app calls.
 *
 *   https://www.vinted.de/catalog?search_text=raf+simons&brand_ids[]=123&price_to=200
 *   -> GET https://api.vinted.de/svc-catalogue/items?search_text=raf+simons&brand_ids=123&price_to=200
 *
 * The host and path come from endpoints.js, which resolves them at runtime;
 * this module only cares about the filters.
 *
 * Anything the user set in the Vinted UI (brand, size, category, price, colour,
 * condition, country, ...) travels in the query string, so we pass it through
 * generically instead of hardcoding a filter list.
 */

import { strategyByName } from './endpoints.js';

const HOST_RE = /^(www\.)?vinted\.[a-z.]{2,6}$/i;

// URL params that must not reach the API, or that we always set ourselves
const DROP = new Set(['order', 'page', 'per_page', 'time', 'disabled_personalization']);

// Vinted uses "catalog[]" on the page but "catalog_ids" in the API
const RENAME = { catalog: 'catalog_ids', catalog_id: 'catalog_ids', brand: 'brand_ids', size: 'size_ids' };

/**
 * Carries a `code` rather than a sentence: the wording lives in the locale
 * files, so the same rejection reads in the user's own language.
 */
export class InvalidVintedUrl extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function parseSearchUrl(raw) {
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new InvalidVintedUrl('notLink');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new InvalidVintedUrl('scheme');
  if (!HOST_RE.test(u.hostname)) throw new InvalidVintedUrl('notVinted');
  if (/\/items\/\d+/.test(u.pathname)) {
    throw new InvalidVintedUrl('itemPage');
  }

  const domain = u.hostname.startsWith('www.') ? u.hostname : `www.${u.hostname}`;

  /** @type {Map<string, string[]>} */
  const params = new Map();
  for (const [rawKey, value] of u.searchParams.entries()) {
    if (value === '') continue;
    let key = rawKey.endsWith('[]') ? rawKey.slice(0, -2) : rawKey;
    key = RENAME[key] || key;
    if (DROP.has(key)) continue;
    if (!params.has(key)) params.set(key, []);
    // multi-value filters arrive either repeated or already comma separated
    for (const part of value.split(',')) if (part) params.get(key).push(part);
  }

  // A bare /catalog with no filters would fire the whole marketplace at the user.
  if (params.size === 0) {
    throw new InvalidVintedUrl('noFilters');
  }

  const query = {};
  for (const [k, vals] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    query[k] = [...new Set(vals)].sort().join(',');
  }

  return {
    domain,
    query,
    // identical searches of different users collapse onto this key -> one HTTP request
    canonicalKey: `${domain}?${new URLSearchParams(query).toString()}`,
    normalizedUrl: `https://${domain}/catalog?${new URLSearchParams(query).toString()}`,
  };
}

export function apiUrl(domain, query, opts = {}) {
  // Kept for tooling and tests; the client resolves the live endpoint itself.
  return strategyByName('legacy-catalog').url(domain, query, opts);
}
