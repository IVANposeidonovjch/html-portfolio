import { config } from '../config.js';

/**
 * The Webshare side of the pool: what we have, what a replacement costs, and
 * how many are left this month.
 *
 * Replacements are the scarce thing here — a fixed handful per month that do
 * not carry over — so every call that can spend one goes through `replace()`,
 * and every decision to spend one is taken against `budget()` rather than
 * against a number written down in the code. The plan can change; the code
 * should not have to.
 *
 * The token is read once and never logged. Errors print the response body,
 * which is where Webshare says which field it disliked, but never the headers.
 */

const BASE = 'https://proxy.webshare.io/api';

export class WebshareError extends Error {
  constructor(message, { status = 0, body = '' } = {}) {
    super(message);
    this.name = 'WebshareError';
    this.status = status;
    this.body = body;
  }
}

/**
 * @param {object} [opts]
 * @param {string} [opts.token]
 * @param {typeof fetch} [opts.fetch] injected so tests never touch the network
 */
export function createWebshare({ token = config.webshare.token, fetch: doFetch = fetch } = {}) {
  const call = async (path, { method = 'GET', body } = {}) => {
    if (!token) throw new WebshareError('WEBSHARE_TOKEN is not set');
    const res = await doFetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Token ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = typeof res.text === 'function' ? await res.text() : '';
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const what = res.status === 401 ? 'Webshare rejected the token' : `${method} ${path}`;
      throw new WebshareError(`${what} (HTTP ${res.status})`, { status: res.status, body: text.slice(0, 2000) });
    }
    return parsed;
  };

  /** The whole pool, following pagination rather than trusting one page. */
  const listProxies = async () => {
    const rows = [];
    for (let page = 1; page <= 20; page++) {
      const data = await call(`/v2/proxy/list/?mode=direct&page=${page}&page_size=100`);
      if (!Array.isArray(data?.results)) {
        throw new WebshareError('proxy list came back in an unexpected shape', {
          body: JSON.stringify(data).slice(0, 500),
        });
      }
      rows.push(...data.results);
      if (!data.next) break;
    }
    return rows;
  };

  /**
   * How many manual replacements are left in this billing period.
   *
   * The reset date is the one field whose name we are not sure of across plan
   * types, so several are tried and the first of next month stands in when
   * none is there. A date being approximate is survivable; pretending the
   * budget is bigger than it is, is not — so the counts themselves are read
   * strictly and a missing one is an error, not a zero.
   */
  const budget = async () => {
    const sub = await call('/v2/subscription/');
    const total = Number(sub?.proxy_replacements_total);
    const used = Number(sub?.proxy_replacements_used);
    if (!Number.isFinite(total) || !Number.isFinite(used)) {
      throw new WebshareError('subscription did not report a replacement count', {
        body: JSON.stringify(sub).slice(0, 500),
      });
    }
    const reported = Number(sub?.proxy_replacements_available);
    const available = Number.isFinite(reported) ? reported : Math.max(0, total - used);
    return { total, used, available, resetsAt: resetDate(sub), checkedAt: Date.now() };
  };

  /**
   * Spend (or price) one replacement. `dryRun` asks Webshare what it would do
   * and changes nothing — it is the default everywhere a human is involved.
   */
  const replace = ({ toReplace, replaceWith, dryRun = true }) =>
    call('/v3/proxy/replace/', {
      method: 'POST',
      body: { to_replace: toReplace, replace_with: replaceWith, dry_run: !!dryRun },
    });

  return { listProxies, budget, replace, hasToken: () => !!token };
}

const RESET_FIELDS = [
  'proxy_replacements_reset_at',
  'current_period_end',
  'next_billing_date',
  'expires_at',
  'end_date',
];

/** First of next month, UTC — a safe "roughly then" when the API names no date. */
export function firstOfNextMonth(at = Date.now()) {
  const d = new Date(at);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export function resetDate(sub, at = Date.now()) {
  for (const field of RESET_FIELDS) {
    const raw = sub?.[field];
    if (!raw) continue;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return firstOfNextMonth(at);
}

/** Exactly the form src/vinted/client.js expects. */
export const proxyUrl = (row) =>
  `http://${row.username}:${row.password}@${row.proxy_address}:${row.port}`;

export const proxiesLine = (rows) => `PROXIES=${rows.map(proxyUrl).join(',')}`;

/** Match a configured proxy string back to its Webshare row, by host and port. */
export function rowFor(proxy, rows) {
  let url;
  try {
    url = new URL(proxy);
  } catch {
    return null;
  }
  return (
    rows.find((r) => r.proxy_address === url.hostname && String(r.port) === String(url.port)) || null
  );
}
