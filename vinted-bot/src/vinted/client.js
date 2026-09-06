import { ProxyAgent, request } from 'undici';
import { config } from '../config.js';
import { logger } from '../util/logger.js';
import { TokenBucket, sleep } from '../util/ratelimit.js';
import { apiUrl } from './url.js';

/**
 * Vinted has no public API. Its own web app calls
 *   GET /api/v2/catalog/items?...
 * with the session cookies the site hands out on first visit. So we do exactly
 * that: bootstrap a session by loading the homepage, keep the cookie jar, and
 * refresh it whenever the API answers 401/403.
 */

class Session {
  constructor(domain, proxy) {
    this.domain = domain;
    this.proxy = proxy || null;
    this.dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
    this.cookies = new Map();
    this.bootstrappedAt = 0;
    this.bootstrapping = null;
    this.blockedUntil = 0;
  }

  get cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  storeCookies(headers) {
    const raw = headers['set-cookie'];
    if (!raw) return;
    for (const line of Array.isArray(raw) ? raw : [raw]) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  headers(extra = {}) {
    return {
      'user-agent': config.vinted.userAgent,
      'accept-language': 'en-GB,en;q=0.9',
      cookie: this.cookieHeader,
      ...extra,
    };
  }

  /** Load the homepage once to obtain anon/session/access-token cookies. */
  async bootstrap(force = false) {
    if (!force && this.cookies.size && Date.now() - this.bootstrappedAt < 30 * 60_000) return;
    if (this.bootstrapping) return this.bootstrapping;
    this.bootstrapping = (async () => {
      const res = await request(`https://${this.domain}/`, {
        method: 'GET',
        dispatcher: this.dispatcher,
        headers: this.headers({
          accept: 'text/html,application/xhtml+xml',
          'cache-control': 'no-cache',
        }),
        maxRedirections: 3,
      });
      this.storeCookies(res.headers);
      await res.body.dump();
      this.bootstrappedAt = Date.now();
      logger.debug(`vinted session ready domain=${this.domain} proxy=${this.proxy ?? 'direct'} cookies=${this.cookies.size}`);
    })().finally(() => {
      this.bootstrapping = null;
    });
    return this.bootstrapping;
  }
}

export class VintedError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const buckets = new Map(); // domain -> TokenBucket
const sessions = new Map(); // `${domain}|${proxy}` -> Session
let proxyCursor = 0;

function bucketFor(domain) {
  if (!buckets.has(domain)) buckets.set(domain, new TokenBucket(config.vinted.rps));
  return buckets.get(domain);
}

function sessionFor(domain) {
  const proxies = config.vinted.proxies;
  const usable = [];
  for (const proxy of proxies.length ? proxies : [null]) {
    const key = `${domain}|${proxy ?? 'direct'}`;
    if (!sessions.has(key)) sessions.set(key, new Session(domain, proxy));
    const s = sessions.get(key);
    if (s.blockedUntil < Date.now()) usable.push(s);
  }
  if (!usable.length) {
    // everything is cooling down: pick the one that recovers first
    const all = [...sessions.values()].filter((s) => s.domain === domain);
    return all.sort((a, b) => a.blockedUntil - b.blockedUntil)[0];
  }
  return usable[proxyCursor++ % usable.length];
}

/**
 * Fetch the newest page of a catalog search.
 * @returns {Promise<object[]>} raw Vinted item objects, newest first
 */
export async function fetchCatalog(domain, query, { perPage = config.vinted.perPage } = {}) {
  const session = sessionFor(domain);
  await bucketFor(domain).take();

  for (let attempt = 0; attempt < 3; attempt++) {
    await session.bootstrap(attempt > 0);
    const url = apiUrl(domain, query, { perPage });
    const res = await request(url, {
      method: 'GET',
      dispatcher: session.dispatcher,
      headers: session.headers({
        accept: 'application/json, text/plain, */*',
        'x-requested-with': 'XMLHttpRequest',
        referer: `https://${domain}/catalog`,
      }),
    });
    session.storeCookies(res.headers);

    if (res.statusCode === 200) {
      const body = await res.body.json();
      return Array.isArray(body?.items) ? body.items : [];
    }

    const text = await res.body.text().catch(() => '');
    if (res.statusCode === 401 || res.statusCode === 403) {
      // expired or missing token -> re-bootstrap and retry once more
      session.cookies.clear();
      if (attempt === 2) {
        session.blockedUntil = Date.now() + 60_000;
        throw new VintedError(`Vinted отклонил запрос (${res.statusCode})`, res.statusCode);
      }
      await sleep(500 * (attempt + 1));
      continue;
    }
    if (res.statusCode === 429) {
      const retryAfter = Number(res.headers['retry-after']) || 60;
      session.blockedUntil = Date.now() + retryAfter * 1000;
      throw new VintedError(`Слишком много запросов (429), пауза ${retryAfter}s`, 429);
    }
    if (res.statusCode >= 500 && attempt < 2) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    throw new VintedError(`HTTP ${res.statusCode}: ${text.slice(0, 120)}`, res.statusCode);
  }
  throw new VintedError('Не удалось получить данные Vinted', 0);
}

export function poolStatus() {
  return [...sessions.values()].map((s) => ({
    domain: s.domain,
    proxy: s.proxy ?? 'direct',
    cookies: s.cookies.size,
    blockedFor: Math.max(0, Math.round((s.blockedUntil - Date.now()) / 1000)),
  }));
}
