#!/usr/bin/env node
/**
 * Vinted endpoint probe — ZERO dependencies, single file.
 * Runs on any Node >= 18. Copy it to the server and run it through the proxy
 * whose IP the bot actually uses.
 *
 *   node probe-standalone.mjs --selftest        # is the proxy alive? prints the egress IP
 *                                               # (override the target with SELFTEST_URL)
 *   node probe-standalone.mjs "https://www.vinted.de/catalog?search_text=raf+simons"
 *
 * Proxy comes from PROXY or HTTPS_PROXY (http://user:pass@host:port).
 *
 * Prints, per endpoint variant: status, content type, size, JSON keys, item
 * count and the fields of the first item; then checks whether the catalog HTML
 * page carries listings inline. Paste the REPORT block back.
 */
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';

const UA =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PROXY = process.env.PROXY || process.env.HTTPS_PROXY || '';

/* ---------------- minimal HTTPS-over-proxy agent (CONNECT tunnel) --------- */

function makeAgent(proxyUrl) {
  if (!proxyUrl) return new https.Agent({ keepAlive: false });
  const p = new URL(proxyUrl);
  const auth = p.username
    ? 'Basic ' +
      Buffer.from(`${decodeURIComponent(p.username)}:${decodeURIComponent(p.password)}`).toString('base64')
    : null;
  class TunnelAgent extends https.Agent {
    createConnection(opts, cb) {
      const req = http.request({
        host: p.hostname,
        port: Number(p.port) || 80,
        method: 'CONNECT',
        path: `${opts.host}:${opts.port || 443}`,
        headers: { host: `${opts.host}:${opts.port || 443}`, ...(auth ? { 'proxy-authorization': auth } : {}) },
      });
      req.once('connect', (res, socket) => {
        if (res.statusCode !== 200) return cb(new Error(`proxy CONNECT -> ${res.statusCode}`));
        cb(null, tls.connect({ socket, servername: opts.host }));
      });
      req.once('error', cb);
      req.setTimeout(20000, () => req.destroy(new Error('proxy CONNECT timeout')));
      req.end();
    }
  }
  return new TunnelAgent({ keepAlive: false });
}
const agent = makeAgent(PROXY);

function get(url, headers = {}, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { agent, headers, timeout: 25000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const loc = res.headers.location;
        if (loc && [301, 302, 303, 307, 308].includes(res.statusCode) && redirects > 0) {
          return resolve(get(new URL(loc, url).href, headers, redirects - 1));
        }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

/* ------------------------------ self test -------------------------------- */

if (process.argv[2] === '--selftest') {
  console.log(`proxy: ${PROXY ? PROXY.replace(/:[^:@/]+@/, ':***@') : 'none (direct IP)'}`);
  try {
    const url = process.env.SELFTEST_URL || 'https://api.ipify.org?format=json';
    const r = await get(url, { 'user-agent': UA });
    console.log(`egress IP: HTTP ${r.status} ${r.body.slice(0, 120)}`);
  } catch (e) {
    console.log(`egress IP: FAILED ${e.message}`);
  }
  process.exit(0);
}

/* --------------------------- endpoint variants --------------------------- */

const target = process.argv[2] || 'https://www.vinted.de/catalog?search_text=raf+simons&price_to=500';
const parsed = new URL(target);
const domain = parsed.hostname.startsWith('www.') ? parsed.hostname : `www.${parsed.hostname}`;
const bare = domain.replace(/^www\./, '');

const DROP = new Set(['order', 'page', 'per_page', 'time', 'disabled_personalization']);
const RENAME = { catalog: 'catalog_ids', catalog_id: 'catalog_ids', brand: 'brand_ids', size: 'size_ids' };
const query = {};
for (const [rawKey, value] of parsed.searchParams.entries()) {
  if (!value) continue;
  let key = rawKey.endsWith('[]') ? rawKey.slice(0, -2) : rawKey;
  key = RENAME[key] || key;
  if (DROP.has(key)) continue;
  query[key] = query[key] ? `${query[key]},${value}` : value;
}

const ATTR = { catalog_ids: 'catalog', brand_ids: 'brand', size_ids: 'size', status_ids: 'status', color_ids: 'color' };
const asAttributes = (q) =>
  Object.fromEntries(Object.entries(q).map(([k, v]) => [ATTR[k] ? `attribute_ids[${ATTR[k]}]` : k, v]));

const build = (base, q) => {
  const sp = new URLSearchParams(q);
  sp.set('page', '1');
  sp.set('per_page', '5');
  sp.set('order', 'newest_first');
  return `${base}?${sp.toString()}`;
};

const VARIANTS = [
  ['svc-catalogue', build(`https://api.${bare}/svc-catalogue/items`, query)],
  ['svc-catalogue-attrs', build(`https://api.${bare}/svc-catalogue/items`, asAttributes(query))],
  ['svc-catalogue-www', build(`https://api.www.${bare}/svc-catalogue/items`, query)],
  ['svc-catalog-singular', build(`https://api.${bare}/svc-catalog/items`, query)],
  ['api-host-v2', build(`https://api.${bare}/api/v2/catalog/items`, query)],
  ['legacy-catalog', build(`https://${domain}/api/v2/catalog/items`, query)],
  ['legacy-items', build(`https://${domain}/api/v2/items`, query)],
];

const extractItems = (b) => {
  for (const c of [b?.items, b?.catalogItems, b?.data?.items, b?.results]) if (Array.isArray(c)) return c;
  return null;
};

/* -------------------------------- probe ---------------------------------- */

const cookies = new Map();
let csrf = null;
const report = [];
const say = (l) => {
  console.log(l);
  report.push(l);
};
const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');

console.log(`probing ${domain} via ${PROXY ? 'proxy' : 'direct IP'}\nsearch: ${target}\n`);

// 1. session
try {
  const r = await get(`https://${domain}/`, { 'user-agent': UA, accept: 'text/html', 'accept-language': 'en-GB,en;q=0.9' });
  for (const line of [].concat(r.headers['set-cookie'] || [])) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  csrf = r.body.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i)?.[1] || null;
  say(`homepage        : HTTP ${r.status}, ${r.body.length} bytes, server=${r.headers.server || '?'}`);
  say(`cookies         : ${[...cookies.keys()].join(', ') || 'none'}`);
  say(`csrf meta token : ${csrf ? 'yes' : 'no'}`);
} catch (e) {
  say(`homepage        : FAILED ${e.message}`);
}

// 2. endpoint matrix
say('');
say('--- catalog endpoint matrix ---');
const wins = [];
const headerSets = () => {
  const base = {
    'user-agent': UA,
    'accept-language': 'en-GB,en;q=0.9',
    accept: 'application/json, text/plain, */*',
    cookie: cookieHeader(),
    referer: `https://${domain}/catalog`,
  };
  const full = { ...base, origin: `https://${domain}`, 'x-requested-with': 'XMLHttpRequest' };
  if (cookies.get('anon_id')) full['x-anon-id'] = cookies.get('anon_id');
  if (csrf) full['x-csrf-token'] = csrf;
  return [['plain', base], ['full ', full]];
};

for (const [name, url] of VARIANTS) {
  for (const [label, headers] of headerSets()) {
    let line = `${name.padEnd(22)} ${label} `;
    try {
      const r = await get(url, headers, 0);
      const ct = (r.headers['content-type'] || '?').split(';')[0];
      line += `HTTP ${r.status} ${ct.padEnd(17)} ${String(r.body.length).padStart(7)}B`;
      if (ct.includes('json')) {
        let body = null;
        try {
          body = JSON.parse(r.body);
        } catch {}
        const items = extractItems(body);
        line += ` keys=[${Object.keys(body || {}).slice(0, 6).join(',')}]`;
        if (items) {
          line += ` items=${items.length}`;
          if (items.length) wins.push({ name, label: label.trim(), url, item: items[0] });
        }
      } else {
        line += ` «${r.body.replace(/\s+/g, ' ').slice(0, 55)}»`;
      }
    } catch (e) {
      line += `ERROR ${e.message}`;
    }
    say(line);
    await new Promise((r) => setTimeout(r, 800));
  }
}

// 3. inline-JSON fallback
say('');
say('--- inline JSON on the catalog page ---');
try {
  const r = await get(target, { 'user-agent': UA, accept: 'text/html', cookie: cookieHeader() });
  say(`catalog page    : HTTP ${r.status}, ${r.body.length} bytes`);
  const ids = [...r.body.matchAll(/\/items\/(\d+)/g)].map((m) => m[1]);
  say(`item links      : ${ids.length} (${[...new Set(ids)].slice(0, 5).join(', ')})`);
  const scripts = [...r.body.matchAll(/<script[^>]*id=["']([^"']+)["']/gi)].map((m) => m[1]);
  say(`script ids      : ${scripts.slice(0, 10).join(', ') || 'none'}`);
  for (const marker of ['__NEXT_DATA__', '__INITIAL_STATE__', 'ld+json', '"total_item_price"', '"catalogItems"']) {
    if (r.body.includes(marker)) say(`contains        : ${marker}`);
  }
} catch (e) {
  say(`catalog page    : FAILED ${e.message}`);
}

say('');
say('=========== REPORT ===========');
if (wins.length) {
  const w = wins[0];
  say(`WORKING: variant=${w.name} headers=${w.label}`);
  say(`URL    : ${w.url}`);
  say(`fields : ${Object.keys(w.item).join(', ')}`);
  say(JSON.stringify(w.item, null, 1).slice(0, 1800));
} else {
  say('NO VARIANT RETURNED ITEMS — the matrix above plus the inline-JSON section decide the next move.');
}
say('==============================');
