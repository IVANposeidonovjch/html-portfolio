import { ProxyAgent, request } from 'undici';
import { config } from '../config.js';
import { logger } from '../util/logger.js';
import { TokenBucket, sleep } from '../util/ratelimit.js';
import { STRATEGIES, extractItems, strategyByName } from './endpoints.js';

/**
 * Vinted has no public API. Its own web app talks to an internal catalog
 * service, so we do the same: bootstrap a session by loading the homepage,
 * keep the cookie jar and the CSRF token, and call the catalog service with
 * them. Which URL that service lives at is discovered at runtime — see
 * endpoints.js for why.
 */

const CSRF_RE = /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i;

class Session {
  constructor(domain, proxy) {
    this.domain = domain;
    this.proxy = proxy || null;
    this.dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
    this.cookies = new Map();
    this.csrfToken = null;
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

  /**
   * Two header sets. `plain` is what the confirmed working call actually sent;
   * `full` adds the origin / anon-id / CSRF trio the old endpoint wanted.
   * Which one a variant needs is measured, not assumed — see endpoints.js.
   */
  apiHeaders(kind = 'plain') {
    const base = {
      accept: 'application/json, text/plain, */*',
      referer: `https://${this.domain}/catalog`,
    };
    if (kind === 'plain') return this.headers(base);
    const anonId = this.cookies.get('anon_id');
    return this.headers({
      ...base,
      'x-requested-with': 'XMLHttpRequest',
      origin: `https://${this.domain}`,
      ...(anonId ? { 'x-anon-id': anonId } : {}),
      ...(this.csrfToken ? { 'x-csrf-token': this.csrfToken } : {}),
    });
  }

  /** Load the homepage once to obtain cookies and the CSRF token. */
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
      const html = await res.body.text().catch(() => '');
      this.csrfToken = html.match(CSRF_RE)?.[1] || null;
      this.bootstrappedAt = Date.now();
      logger.debug(
        `vinted session ready domain=${this.domain} proxy=${this.proxy ?? 'direct'} ` +
          `cookies=${this.cookies.size} csrf=${this.csrfToken ? 'yes' : 'no'}`,
      );
    })().finally(() => {
      this.bootstrapping = null;
    });
    return this.bootstrapping;
  }
}

export class VintedError extends Error {
  constructor(message, status, { endpointGone = false } = {}) {
    super(message);
    this.status = status;
    this.endpointGone = endpointGone;
  }
}

const buckets = new Map(); // domain -> TokenBucket
const sessions = new Map(); // `${domain}|${proxy}` -> Session
const resolved = new Map(); // domain -> { strategy, headerKind } that last returned items
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

/** (strategy, header set) pairs to try for a domain, best known first. */
export function candidatesFor(domain) {
  const flip = (kind) => (kind === 'plain' ? 'full' : 'plain');
  const pinned = config.vinted.strategy && strategyByName(config.vinted.strategy);
  const pairs = [];
  for (const strategy of pinned ? [pinned] : STRATEGIES) {
    const preferred = strategy.headers || 'plain';
    pairs.push({ strategy, headerKind: preferred }, { strategy, headerKind: flip(preferred) });
  }
  const known = resolved.get(domain);
  if (!known) return pairs;
  return [
    known,
    ...pairs.filter((p) => !(p.strategy === known.strategy && p.headerKind === known.headerKind)),
  ];
}

const isHtml = (headers) => /text\/html/i.test(headers['content-type'] || '');

/** One HTTP call against one strategy. Returns items, or an explanatory error. */
async function tryStrategy(session, { strategy, headerKind }, domain, query, perPage) {
  const url = strategy.url(domain, query, { perPage });
  const res = await request(url, {
    method: 'GET',
    dispatcher: session.dispatcher,
    headers: session.apiHeaders(headerKind),
  });
  session.storeCookies(res.headers);

  if (res.statusCode === 200 && !isHtml(res.headers)) {
    const body = await res.body.json().catch(() => null);
    const items = extractItems(body);
    if (items) return { items, url };
    return {
      error: new VintedError(
        `${strategy.name}/${headerKind}: 200 but no item array (keys: ${Object.keys(body || {}).join(',') || 'none'})`,
        200,
        { endpointGone: true },
      ),
      url,
    };
  }

  await res.body.dump();

  // 404, or a 200 that is really the website's HTML shell: this path is gone.
  if (res.statusCode === 404 || isHtml(res.headers)) {
    return {
      error: new VintedError(
        `${strategy.name}/${headerKind}: не JSON (HTTP ${res.statusCode}${isHtml(res.headers) ? ', HTML' : ''}) — путь перенесён`,
        res.statusCode,
        { endpointGone: true },
      ),
      url,
    };
  }
  return {
    error: new VintedError(`${strategy.name}/${headerKind}: HTTP ${res.statusCode}`, res.statusCode),
    url,
  };
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

    const gone = [];
    let sawForbidden = false;
    for (const pair of candidatesFor(domain)) {
      const { strategy, headerKind } = pair;
      const { items, error, url } = await tryStrategy(session, pair, domain, query, perPage);

      if (items) {
        const known = resolved.get(domain);
        if (known?.strategy !== strategy || known?.headerKind !== headerKind) {
          resolved.set(domain, pair);
          logger.info(
            `vinted endpoint for ${domain}: ${strategy.name} headers=${headerKind} (${strategy.note}) — ${url}`,
          );
        }
        return items;
      }

      // Auth problems mean the session, not the endpoint: re-bootstrap and retry.
      if (error.status === 401 || error.status === 403) {
        sawForbidden = true;
        session.cookies.clear();
        session.csrfToken = null;
        if (attempt === 2) {
          session.blockedUntil = Date.now() + 60_000;
          // A datacenter IP gets 403 on the live endpoint no matter how good the
          // session is, so say that instead of blaming the cookies.
          throw new VintedError(
            session.proxy
              ? `Vinted отклонил запрос (${error.status}) через ${session.proxy}`
              : `Vinted отклонил запрос (${error.status}) с прямого IP сервера. ` +
                'Каталог отвечает только с резидентного IP — пропиши PROXIES в .env.',
            error.status,
          );
        }
        await sleep(500 * (attempt + 1));
        break; // back to the outer loop for a fresh session
      }
      if (error.status === 429) {
        const retryAfter = 60;
        session.blockedUntil = Date.now() + retryAfter * 1000;
        throw new VintedError(`Слишком много запросов (429), пауза ${retryAfter}s`, 429);
      }
      if (error.status >= 500) {
        if (attempt === 2) throw error;
        await sleep(1000 * (attempt + 1));
        break;
      }

      gone.push(error.message);
      const known = resolved.get(domain);
      if (known?.strategy === strategy && known?.headerKind === headerKind) resolved.delete(domain);
      await bucketFor(domain).take(); // stay polite while walking candidates
    }

    if (gone.length) {
      throw new VintedError(
        `Ни один известный эндпоинт каталога не отвечает. Проверено: ${gone.join(' | ')}.` +
          (sawForbidden && !session.proxy ? ' Часть ответов — 403 с прямого IP: нужен резидентный прокси.' : '') +
          ' Запусти tools/probe-standalone.mjs на боевом IP, чтобы снять актуальный адрес.',
        404,
        { endpointGone: true },
      );
    }
  }
  throw new VintedError('Не удалось получить данные Vinted', 0);
}

export function poolStatus() {
  return [...sessions.values()].map((s) => ({
    domain: s.domain,
    proxy: s.proxy ?? 'direct',
    cookies: s.cookies.size,
    csrf: !!s.csrfToken,
    endpoint: resolved.get(s.domain)
      ? `${resolved.get(s.domain).strategy.name}/${resolved.get(s.domain).headerKind}`
      : 'не определён',
    blockedFor: Math.max(0, Math.round((s.blockedUntil - Date.now()) / 1000)),
  }));
}
