import { ProxyAgent, request } from 'undici';
import { config } from '../config.js';
import { logger } from '../util/logger.js';
import { TokenBucket, sleep } from '../util/ratelimit.js';
import {
  extractItems,
  filtersLookHonoured,
  hasIdFilters,
  orderedStrategies,
  strategyByName,
} from './endpoints.js';

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
   * Two header sets. `plain` is cookies only — what the probe's working call
   * sent. `full` adds what the Vintrack fix sends: anon id, CSRF token and the
   * app marker, plus the fetch-metadata headers a browser would attach.
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
      'x-next-app': 'marketplace-web',
      origin: `https://${this.domain}`,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
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
/**
 * Resolved endpoints, keyed by domain AND query class.
 *
 * Keying by domain alone was a bug with teeth: a text-only search ("Ralph")
 * resolves to the plain shape, and the next brand-filtered search ("Spice") on
 * the same domain reused that cached choice, dropping its brand filter and
 * flooding the topic with other brands. Text-only and filtered queries need
 * their own resolutions, because they are allowed different variants.
 */
const resolved = new Map(); // `${domain}|${class}` -> { strategy, headerKind }

const queryClass = (query) => (hasIdFilters(query) ? 'filtered' : 'text');
const cacheKey = (domain, query) => `${domain}|${queryClass(query)}`;
let proxyCursor = 0;

function bucketFor(domain) {
  if (!buckets.has(domain)) buckets.set(domain, new TokenBucket(config.vinted.rps));
  return buckets.get(domain);
}

/* ---------------------------- proxy health ------------------------------ */

/**
 * A proxy that stops answering does not announce it — it just times out, and
 * round-robin keeps handing it one request in N for ever. Nothing looks broken
 * from the outside: searches simply run late for a fraction of everybody.
 *
 * So connection failures are counted per proxy, and a proxy that racks up
 * enough of them in a row is dropped out of rotation for a cooldown. The
 * request that found it dead is retried on a healthy one rather than failing.
 *
 * The cooldown expiring is itself the re-test: the proxy goes back into the
 * rotation, and the next request either proves it (counter reset, logged) or
 * fails once and drops it again — one wasted request per cooldown, not one in
 * N of everything. Health is keyed by proxy rather than by domain+proxy,
 * because an IP that cannot open a socket is not having a bad day on .de only.
 */
const health = new Map(); // proxy label -> { fails, deadUntil }

const proxyKey = (proxy) => proxy ?? 'direct';

/** Position, never the URL: a proxy string carries its own password. */
function proxyLabel(proxy) {
  if (!proxy) return 'direct IP';
  const at = config.vinted.proxies.indexOf(proxy);
  return at >= 0 ? `proxy #${at + 1}` : 'proxy';
}

function healthOf(proxy) {
  const key = proxyKey(proxy);
  if (!health.has(key)) health.set(key, { fails: 0, deadUntil: 0 });
  return health.get(key);
}

/** Could not open a socket at all — not a rejection, a silence. */
export function isConnectionFailure(err) {
  const code = err?.code || err?.cause?.code || '';
  if (/UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|EPIPE/i.test(code)) {
    return true;
  }
  return /connect timeout|socket hang up|other side closed|fetch failed/i.test(err?.message || '');
}

export function noteProxyFailure(proxy, err, at = Date.now()) {
  const state = healthOf(proxy);
  state.fails++;
  const { proxyFailThreshold, proxyDeadCooldownSec } = config.vinted;
  // `deadUntil <= at` is what makes a failed re-test cost one request rather
  // than three: a proxy already serving its cooldown is not re-armed, but one
  // that has just come back and failed again goes straight out.
  if (state.fails >= proxyFailThreshold && state.deadUntil <= at) {
    state.deadUntil = at + proxyDeadCooldownSec * 1000;
    logger.warn(
      `${proxyLabel(proxy)} dropped from rotation after ${state.fails} connection failures ` +
        `(${err?.message || 'no answer'}); re-tested in ${proxyDeadCooldownSec}s`,
    );
  }
  return state;
}

export function noteProxyAlive(proxy) {
  const state = healthOf(proxy);
  if (state.deadUntil || state.fails >= config.vinted.proxyFailThreshold) {
    logger.info(`${proxyLabel(proxy)} answered again — back in rotation`);
  }
  state.fails = 0;
  state.deadUntil = 0;
  return state;
}

/** What /stats reports: how much of the pool is actually answering. */
export function proxyHealth(at = Date.now()) {
  const routes = config.vinted.proxies.length ? config.vinted.proxies : [null];
  const entries = routes.map((proxy, i) => {
    const state = healthOf(proxy);
    return {
      index: i + 1,
      direct: !proxy,
      alive: state.deadUntil <= at,
      fails: state.fails,
      downForSec: Math.max(0, Math.round((state.deadUntil - at) / 1000)),
    };
  });
  return { total: entries.length, alive: entries.filter((e) => e.alive).length, entries };
}

/** Tests drive the rotation directly; nothing in the bot resets health. */
export const resetProxyHealth = () => health.clear();

function sessionFor(domain) {
  const routes = config.vinted.proxies.length ? config.vinted.proxies : [null];
  const all = routes.map((proxy) => {
    const key = `${domain}|${proxy ?? 'direct'}`;
    if (!sessions.has(key)) sessions.set(key, new Session(domain, proxy));
    return sessions.get(key);
  });
  const at = Date.now();
  const recoversAt = (s) => Math.max(s.blockedUntil, healthOf(s.proxy).deadUntil);
  const usable = all.filter((s) => recoversAt(s) < at);
  if (!usable.length) {
    // everything is cooling down or dropped: take whichever comes back first,
    // which is also how a dropped proxy gets its chance to prove itself
    return [...all].sort((a, b) => recoversAt(a) - recoversAt(b))[0];
  }
  return usable[proxyCursor++ % usable.length];
}

/**
 * (strategy, header set) pairs to try, best known first. The order depends on
 * the query: id filters lead with the attribute shape, text-only searches with
 * the plain one — see orderedStrategies().
 */
export function candidatesFor(domain, query = {}) {
  const flip = (kind) => (kind === 'plain' ? 'full' : 'plain');
  const pinned = config.vinted.strategy && strategyByName(config.vinted.strategy);
  const pairs = [];
  for (const strategy of pinned ? [pinned] : orderedStrategies(query)) {
    const preferred = strategy.headers || 'plain';
    pairs.push({ strategy, headerKind: preferred }, { strategy, headerKind: flip(preferred) });
  }
  const known = resolved.get(cacheKey(domain, query));
  if (!known) return pairs;
  // Second guard, independent of the key: a remembered choice only goes first
  // if it is still a legal candidate for THIS query. Anything else means the
  // cache is stale or from another query class — ignore it rather than trust it.
  const allowed = pairs.some((p) => p.strategy === known.strategy && p.headerKind === known.headerKind);
  if (!allowed) return pairs;
  return [
    known,
    ...pairs.filter((p) => !(p.strategy === known.strategy && p.headerKind === known.headerKind)),
  ];
}

/** Exposed so tests can drive the cache without going near the network. */
export const endpointCache = {
  remember: (domain, query, pair) => resolved.set(cacheKey(domain, query), pair),
  get: (domain, query) => resolved.get(cacheKey(domain, query)),
  forget: (domain, query) => resolved.delete(cacheKey(domain, query)),
  clear: () => resolved.clear(),
};

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
  await bucketFor(domain).take();
  let lastConnectionError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    // picked per attempt, not once: a proxy that turns out to be dead is
    // dropped below, and the next turn of this loop lands on a live one
    const session = sessionFor(domain);
    try {
      await session.bootstrap(attempt > 0);
    } catch (err) {
      if (!isConnectionFailure(err)) throw err;
      noteProxyFailure(session.proxy, err);
      lastConnectionError = err;
      continue;
    }

    const gone = [];
    let sawForbidden = false;
    let lostConnection = false;
    for (const pair of candidatesFor(domain, query)) {
      const { strategy, headerKind } = pair;
      let outcome;
      try {
        outcome = await tryStrategy(session, pair, domain, query, perPage);
      } catch (err) {
        // no socket at all, as opposed to an answer we did not like
        if (!isConnectionFailure(err)) throw err;
        noteProxyFailure(session.proxy, err);
        lastConnectionError = err;
        lostConnection = true;
        break;
      }
      const { items, error, url } = outcome;

      if (items) {
        // 200 with listings is not success on its own: the service may answer
        // while silently dropping the filters. A variant that hands back other
        // brands is worse than one that fails, so keep walking.
        const verdict = filtersLookHonoured(query, items);
        if (verdict && !verdict.ok) {
          gone.push(`${strategy.name}/${headerKind}: фильтры проигнорированы (${verdict.detail})`);
          if (resolved.get(cacheKey(domain, query))?.strategy === strategy) {
            resolved.delete(cacheKey(domain, query));
          }
          await bucketFor(domain).take();
          continue;
        }

        const known = resolved.get(cacheKey(domain, query));
        if (known?.strategy !== strategy || known?.headerKind !== headerKind) {
          resolved.set(cacheKey(domain, query), pair);
          logger.info(
            `vinted endpoint for ${domain} (${queryClass(query)}): ${strategy.name} headers=${headerKind} (${strategy.note})` +
              `${verdict ? `, фильтры соблюдаются: ${verdict.detail}` : ''} — ${url}`,
          );
        }
        noteProxyAlive(session.proxy);
        return items;
      }

      // An answer, even a bad one, means the proxy is carrying traffic
      noteProxyAlive(session.proxy);

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
      const known = resolved.get(cacheKey(domain, query));
      if (known?.strategy === strategy && known?.headerKind === headerKind) {
        resolved.delete(cacheKey(domain, query));
      }
      await bucketFor(domain).take(); // stay polite while walking candidates
    }

    if (lostConnection) continue; // try the next proxy rather than give up
    if (gone.length) {
      throw new VintedError(
        `Ни один вариант каталога не отдал корректно отфильтрованную выдачу. Проверено: ${gone.join(' | ')}.` +
          (sawForbidden && !session.proxy ? ' Часть ответов — 403 с прямого IP: нужен резидентный прокси.' : '') +
          ' Запусти tools/probe-standalone.mjs на боевом IP, чтобы снять актуальный адрес.',
        404,
        { endpointGone: true },
      );
    }
  }
  if (lastConnectionError) {
    throw new VintedError(
      `Не удалось соединиться ни с одним прокси: ${lastConnectionError.message}`,
      0,
    );
  }
  throw new VintedError('Не удалось получить данные Vinted', 0);
}

export function poolStatus() {
  return [...sessions.values()].map((s) => ({
    domain: s.domain,
    proxy: s.proxy ?? 'direct',
    cookies: s.cookies.size,
    csrf: !!s.csrfToken,
    endpoints: ['text', 'filtered']
      .map((cls) => {
        const hit = resolved.get(`${s.domain}|${cls}`);
        return `${cls}: ${hit ? `${hit.strategy.name}/${hit.headerKind}` : 'не определён'}`;
      })
      .join(', '),
    blockedFor: Math.max(0, Math.round((s.blockedUntil - Date.now()) / 1000)),
  }));
}
