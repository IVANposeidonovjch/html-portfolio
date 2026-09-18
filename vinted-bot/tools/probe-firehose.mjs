#!/usr/bin/env node
/**
 * Firehose (v2) feasibility probe — ZERO dependencies, single file, read only.
 * Runs on any Node >= 18. Copy it to the server and run it through the proxy
 * whose IP the bot actually uses.
 *
 *   PROXY=http://user:pass@host:port node probe-firehose.mjs --selftest
 *   PROXY=http://user:pass@host:port node probe-firehose.mjs www.vinted.de
 *
 * It changes nothing and touches no bot code. It answers one question: can one
 * unfiltered newest-first feed per domain replace N filtered searches?
 *
 * v2 would poll that feed once, match every user's filters in memory, and never
 * send a per-user request at all. That only works if five things hold, and each
 * section below measures one of them:
 *
 *   1. the API serves a bare feed with no filters at all (the bot refuses such
 *      URLs from users on purpose — that is our rule, not necessarily Vinted's);
 *   2. items carry the ids to match on (brand, catalog, size, status, colour),
 *      because matching on display strings across languages is not matching;
 *   3. one page can be made big enough to be worth polling;
 *   4. listings arrive slower than one page per poll, or page 1 overflows
 *      between polls and the missed listings are gone for good;
 *   5. the bandwidth is payable at that poll rate.
 *
 * Paste the REPORT block back. Run it again at a busy hour: velocity measured
 * at 03:00 is not the number v2 has to survive.
 */
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';

const UA =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PROXY = process.env.PROXY || process.env.HTTPS_PROXY || '';
const POLLS = Number(process.env.FIREHOSE_POLLS || 6);
const GAP_MS = Number(process.env.FIREHOSE_GAP_MS || 10000);

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
        if (res.statusCode !== 200) {
          socket.destroy();
          return cb(new Error(`proxy CONNECT -> ${res.statusCode}`));
        }
        socket.on('error', () => {});
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

/** @returns {Promise<{status:number, headers:object, body:string, bytes:number}>} */
function get(url, headers = {}, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { agent, headers, timeout: 25000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const loc = res.headers.location;
        if (loc && [301, 302, 303, 307, 308].includes(res.statusCode) && redirects > 0) {
          return resolve(get(new URL(loc, url).href, headers, redirects - 1));
        }
        resolve({ status: res.statusCode, headers: res.headers, body: raw.toString('utf8'), bytes: raw.length });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ self test -------------------------------- */

if (process.argv.includes('--selftest')) {
  console.log(`proxy: ${PROXY ? PROXY.replace(/:[^:@/]+@/, ':***@') : 'none (direct IP)'}`);
  try {
    const r = await get(process.env.SELFTEST_URL || 'https://api.ipify.org?format=json', { 'user-agent': UA });
    console.log(`egress IP: HTTP ${r.status} ${r.body.slice(0, 120)}`);
  } catch (e) {
    console.log(`egress IP: FAILED ${e.message}`);
  }
  process.exit(0);
}

/* --------------------------------- setup --------------------------------- */

const input = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'www.vinted.de';
const host = input.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const domain = host.startsWith('www.') ? host : `www.${host}`;
const bare = domain.replace(/^www\./, '');

const report = [];
const say = (line = '') => {
  console.log(line);
  report.push(line);
};
const num = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '—');

const extractItems = (b) => {
  for (const c of [b?.items, b?.catalogItems, b?.data?.items, b?.results]) if (Array.isArray(c)) return c;
  return null;
};

/** The unfiltered feed: no brand, no category, no text. Newest first. */
const feedUrl = (base, perPage, page = 1) =>
  `${base}?page=${page}&per_page=${perPage}&order=newest_first`;

console.log(`firehose probe: ${domain} via ${PROXY ? 'proxy' : 'direct IP'}`);
console.log(`polls=${POLLS} gap=${GAP_MS}ms\n`);

/* ------------------------- 0. session bootstrap --------------------------- */

const cookies = new Map();
let csrf = null;
const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');

try {
  const r = await get(`https://${domain}/`, {
    'user-agent': UA,
    accept: 'text/html,application/xhtml+xml',
    'accept-language': 'en-GB,en;q=0.9',
  });
  for (const line of [].concat(r.headers['set-cookie'] || [])) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  csrf = r.body.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i)?.[1] || null;
  say(`session         : HTTP ${r.status}, cookies=${cookies.size}, csrf=${csrf ? 'yes' : 'no'}`);
} catch (e) {
  say(`session         : FAILED ${e.message} — everything below will likely fail too`);
}

const headerSets = () => {
  const plain = {
    'user-agent': UA,
    'accept-language': 'en-GB,en;q=0.9',
    accept: 'application/json, text/plain, */*',
    cookie: cookieHeader(),
    referer: `https://${domain}/catalog`,
  };
  const full = {
    ...plain,
    origin: `https://${domain}`,
    'x-requested-with': 'XMLHttpRequest',
    'x-next-app': 'marketplace-web',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    ...(cookies.get('anon_id') ? { 'x-anon-id': cookies.get('anon_id') } : {}),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
  };
  return [['plain', plain], ['full', full]];
};

/* --------------- 1. does the API serve a bare, unfiltered feed? ----------- */

say();
say('--- 1. unfiltered newest-first feed ---');
say('(the bot rejects filterless URLs from users by policy — this asks the API itself)');

const HOSTS = [
  ['api', `https://api.${bare}/svc-catalogue/items`],
  ['api.www', `https://api.www.${bare}/svc-catalogue/items`],
];

let feed = null; // { base, headerKind, headers, items, bytes }
for (const [label, base] of HOSTS) {
  for (const [kind, headers] of headerSets()) {
    let line = `${label.padEnd(8)} ${kind.padEnd(5)} `;
    try {
      const r = await get(feedUrl(base, 40), headers, 0);
      const ct = (r.headers['content-type'] || '?').split(';')[0];
      line += `HTTP ${r.status} ${ct.padEnd(17)} ${String(r.bytes).padStart(7)}B`;
      let body = null;
      try {
        body = JSON.parse(r.body);
      } catch {}
      const items = extractItems(body);
      if (items) {
        line += ` items=${items.length}`;
        if (items.length && !feed) feed = { base, headerKind: kind, headers, items, bytes: r.bytes };
      } else if (ct.includes('json')) {
        line += ` keys=[${Object.keys(body || {}).slice(0, 8).join(',')}] — no item array`;
      } else {
        line += ` «${r.body.replace(/\s+/g, ' ').slice(0, 60)}»`;
      }
    } catch (e) {
      line += `ERROR ${e.message}`;
    }
    say(line);
    await sleep(900);
  }
}

const FEED_WORKS = !!feed;
say(
  FEED_WORKS
    ? `=> unfiltered feed WORKS: ${feed.base} (headers=${feed.headerKind}), ${feed.items.length} items`
    : '=> unfiltered feed DOES NOT WORK — v2 cannot be built on this endpoint. Sections below are skipped.',
);

// newest-first has to mean newest-first, or a firehose reads the wrong end
let ordered = null;
if (FEED_WORKS) {
  const ids = feed.items.map((i) => Number(i.id)).filter(Number.isFinite);
  const descending = ids.every((id, i) => i === 0 || ids[i - 1] >= id);
  ordered = descending;
  say(
    `=> order=newest_first: ids ${descending ? 'ARE descending' : 'are NOT descending'} ` +
      `(first=${ids[0]}, last=${ids.at(-1)})${descending ? '' : ' — page 1 is not the newest page'}`,
  );
}

/* ------------------------ 2. what is in one item? ------------------------- */

const PRESENCE = [
  ['brand_id', ['brand_id', 'brand.id', 'item_box.brand_id']],
  ['catalog_id', ['catalog_id', 'catalog.id', 'item_box.catalog_id']],
  ['size_id', ['size_id', 'size.id', 'item_box.size_id']],
  ['status_id', ['status_id', 'status.id', 'condition_id', 'item_box.status_id']],
  ['color_id', ['color_id', 'color1_id', 'colour_id', 'color.id']],
  ['price', ['price.amount', 'price', 'total_item_price.amount', 'item_box.price.amount']],
  ['title', ['title', 'item_box.first_line']],
];

const dig = (obj, path) =>
  path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);

const short = (v) => {
  if (v == null) return String(v);
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

/**
 * Every key anywhere in the item that looks like an id — v2 matches on these.
 * Bare `id` counts too: a nested `brand.id` is the same filter as a flat
 * `brand_id`, and which of the two a region ships is not ours to assume.
 */
function idKeys(node, prefix = '', out = new Map(), depth = 0) {
  if (!node || typeof node !== 'object' || depth > 3) return out;
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (/(^|_)ids?$/.test(key) && (typeof value === 'number' || typeof value === 'string' || Array.isArray(value))) {
      out.set(path, value);
    }
    if (value && typeof value === 'object') idKeys(value, path, out, depth + 1);
  }
  return out;
}

/** Anything that could be a listing timestamp, with its shape. */
function timeKeys(node, prefix = '', out = new Map(), depth = 0) {
  if (!node || typeof node !== 'object' || depth > 3) return out;
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const timeish = /(^|_)(created|updated|uploaded|published|time|timestamp|date)/i.test(key);
    if (timeish && typeof value === 'number' && value > 1e9 && value < 2e10) {
      out.set(path, { value, kind: value > 1e12 ? 'unix ms' : 'unix s' });
    } else if (timeish && typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
      out.set(path, { value, kind: 'ISO string' });
    }
    if (value && typeof value === 'object') timeKeys(value, path, out, depth + 1);
  }
  return out;
}

/** Seconds since epoch from whatever shape the timestamp came in. */
function toSeconds(value) {
  if (typeof value === 'number') return value > 1e12 ? value / 1000 : value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed / 1000;
  }
  return null;
}
const secondsAt = (item, path) => toSeconds(dig(item, path));
const avgOf = (values) => {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
};

let timePath = null; // the timestamp field used for the velocity cross-check
let presenceSummary = [];

if (FEED_WORKS) {
  say();
  say('--- 2. raw items, complete and untruncated ---');
  for (const [n, item] of feed.items.slice(0, 3).entries()) {
    say(`----- item ${n + 1} of ${feed.items.length} (id=${item.id}) -----`);
    say(JSON.stringify(item, null, 2));
  }

  const sample = feed.items[0];
  say();
  say('--- 2b. structured fields, present or absent ---');
  for (const [label, paths] of PRESENCE) {
    // a field counts as present only if every item carries it: one item in
    // three is a field v2 cannot filter on
    const hit = paths.find((p) => dig(sample, p) != null);
    const everywhere = hit ? feed.items.every((i) => dig(i, hit) != null) : false;
    const coverage = hit ? feed.items.filter((i) => dig(i, hit) != null).length : 0;
    say(
      `${label.padEnd(12)} ${hit ? 'PRESENT' : 'ABSENT '} ` +
        (hit
          ? `at ${hit.padEnd(24)} e.g. ${short(dig(sample, hit))}  [${coverage}/${feed.items.length} items]`
          : `— tried ${paths.join(', ')}`),
    );
    presenceSummary.push(`${label}=${hit ? (everywhere ? 'yes' : `partial ${coverage}/${feed.items.length}`) : 'NO'}`);
  }

  const ids = idKeys(sample);
  say();
  say(`every id-looking key in the item (${ids.size}) — the full matching surface for v2:`);
  for (const [path, value] of ids) say(`  ${path.padEnd(34)} ${short(value)}`);

  const times = timeKeys(sample);
  say();
  say(`every timestamp-looking key (${times.size}):`);
  for (const [path, found] of times) {
    const seconds = toSeconds(found.value);
    const age = seconds ? `${Math.round(Date.now() / 1000 - seconds)}s old` : '?';
    say(`  ${path.padEnd(34)} ${String(found.value).padEnd(24)} ${found.kind.padEnd(10)} ${age}`);
  }
  // prefer one that every item carries, else the firehose cannot sort by it
  for (const [path] of times) {
    if (feed.items.every((i) => dig(i, path) != null)) {
      timePath = path;
      break;
    }
  }
  say(timePath ? `=> usable listing clock: ${timePath}` : '=> NO timestamp on every item — velocity can only be read from ids');

  say();
  say(`top-level keys  : ${Object.keys(sample).join(', ')}`);
  if (sample.item_box) say(`item_box keys   : ${Object.keys(sample.item_box).join(', ')}`);
}

/* --------------------------- 3. max per_page ------------------------------ */

let maxPerPage = null;
let bytesAtMax = null;

if (FEED_WORKS) {
  say();
  say('--- 3. how big can one page be? ---');
  // stop as soon as one size does not saturate: the ceiling is below it
  for (const size of [40, 96, 200, 500, 1000]) {
    let line = `per_page=${String(size).padStart(4)} `;
    let saturated = false;
    try {
      const r = await get(feedUrl(feed.base, size), feed.headers, 0);
      let items = null;
      try {
        items = extractItems(JSON.parse(r.body));
      } catch {}
      if (!items) {
        line += `HTTP ${r.status} — no items (${r.bytes}B)`;
      } else {
        saturated = items.length >= size;
        line += `HTTP ${r.status} items=${String(items.length).padStart(4)} ${String(r.bytes).padStart(8)}B ` +
          `${saturated ? 'FULL' : 'capped'}`;
        if (saturated) {
          maxPerPage = size;
          bytesAtMax = r.bytes;
        } else if (items.length > (maxPerPage || 0)) {
          maxPerPage = items.length;
          bytesAtMax = r.bytes;
        }
      }
    } catch (e) {
      line += `ERROR ${e.message}`;
    }
    say(line);
    await sleep(900);
    if (!saturated) break;
  }
  say(`=> largest page that came back full: ${maxPerPage ?? '—'} items`);
}

/* ---------------------------- 4. velocity --------------------------------- */

let itemsPerSec = null;
let idBurnPerSec = null;
let tsItemsPerSec = null;
let overflowed = false;
let avgBytes = null;
let avgItems = null;

if (FEED_WORKS) {
  say();
  say(`--- 4. listing velocity (${POLLS} polls, ~${Math.round(GAP_MS / 1000)}s apart) ---`);
  const pageSize = maxPerPage ?? 40;
  const samples = [];

  for (let n = 0; n < POLLS; n++) {
    if (n) await sleep(GAP_MS);
    const at = Date.now() / 1000;
    try {
      const r = await get(feedUrl(feed.base, pageSize), feed.headers, 0);
      let items = null;
      try {
        items = extractItems(JSON.parse(r.body));
      } catch {}
      if (!items?.length) {
        say(`poll ${n + 1}: HTTP ${r.status} — no items`);
        continue;
      }
      const ids = items.map((i) => Number(i.id)).filter(Number.isFinite);
      const previous = samples.at(-1);
      const fresh = previous ? ids.filter((id) => id > previous.maxId).length : 0;
      const elapsed = previous ? at - previous.at : 0;
      // page 1 fully replaced between two polls: the count is a floor, not a rate
      if (previous && fresh >= ids.length) overflowed = true;

      const stamps = timePath ? items.map((i) => secondsAt(i, timePath)).filter(Number.isFinite) : [];
      const span = stamps.length > 1 ? Math.max(...stamps) - Math.min(...stamps) : null;

      samples.push({ at, maxId: Math.max(...ids), count: ids.length, bytes: r.bytes, span, fresh });
      say(
        `poll ${n + 1}: items=${ids.length} maxId=${Math.max(...ids)} ` +
          (previous
            ? `new=${String(fresh).padStart(3)} in ${num(elapsed, 1)}s -> ${num(fresh / elapsed)} items/s ` +
              `| idΔ=${Math.max(...ids) - previous.maxId}`
            : '(baseline)') +
          (span ? ` | page spans ${num(span, 0)}s` : ''),
      );
    } catch (e) {
      say(`poll ${n + 1}: ERROR ${e.message}`);
    }
  }

  if (samples.length > 1) {
    const first = samples[0];
    const last = samples.at(-1);
    const window = last.at - first.at;
    // every listing that appeared after the baseline poll. Correct as long as
    // page 1 did not turn over completely between two polls, which is flagged
    // separately — there the count is a floor, because what fell off is unseen.
    const freshTotal = samples.slice(1).reduce((sum, s) => sum + s.fresh, 0);
    itemsPerSec = freshTotal / window;
    idBurnPerSec = (last.maxId - first.maxId) / window;
    const spans = samples.map((s) => s.span).filter(Number.isFinite);
    if (spans.length) {
      // an independent estimate: one page covers N seconds of listings
      const median = spans.sort((a, b) => a - b)[Math.floor(spans.length / 2)];
      tsItemsPerSec = median > 0 ? avgOf(samples.map((s) => s.count)) / median : null;
    }
    avgBytes = avgOf(samples.map((s) => s.bytes));
    avgItems = avgOf(samples.map((s) => s.count));

    say();
    say(`window          : ${num(window, 0)}s, ${freshTotal} new listings seen`);
    say(`items/sec (ids) : ${num(itemsPerSec, 3)}${overflowed ? '  ** PAGE 1 OVERFLOWED — this is a FLOOR, not the rate **' : ''}`);
    say(`items/sec (time): ${num(tsItemsPerSec, 3)}${tsItemsPerSec ? ` (from ${timePath}: one page covers ~${num(avgItems / tsItemsPerSec, 0)}s)` : ' — no usable timestamp'}`);
    say(`global id burn  : ${num(idBurnPerSec, 1)} ids/sec — every country and category together, an upper bound only`);
  } else {
    say('not enough successful polls to measure velocity');
  }
}

/* --------------------------- 5. bandwidth --------------------------------- */

const MONTH_SEC = 30 * 24 * 3600;
let kbPerItem = null;
let interval = null;
let gbMonthPolling = null;
let gbMonthFloor = null;

if (FEED_WORKS && avgBytes && avgItems) {
  say();
  say('--- 5. bandwidth ---');
  kbPerItem = avgBytes / avgItems / 1024;
  // Two estimates of the same thing. Take the faster one: guessing low here
  // means recommending a poll interval page 1 does not survive, and a listing
  // that fell off page 1 is not late, it is lost.
  const rate = Math.max(itemsPerSec ?? 0, tsItemsPerSec ?? 0);
  const drivenBy = rate === tsItemsPerSec ? 'timestamps' : 'ids';
  // page 1 is the whole buffer: it must not fill between two polls. Three times
  // the headroom, because velocity at a quiet hour is not velocity at a peak.
  const horizon = rate > 0 ? (maxPerPage ?? avgItems) / rate : null;
  interval = horizon ? Math.max(1, Math.floor(horizon / 3)) : null;
  gbMonthPolling = interval ? (avgBytes * (MONTH_SEC / interval)) / 1e9 : null;
  gbMonthFloor = rate > 0 ? (kbPerItem * 1024 * rate * MONTH_SEC) / 1e9 : null;

  say(`avg response    : ${num(avgBytes / 1024, 1)} KB for ${num(avgItems, 0)} items`);
  say(`per item        : ${num(kbPerItem, 2)} KB`);
  say(`rate used       : ${num(rate, 3)} items/s, the faster of the two estimates (${drivenBy})`);
  if (itemsPerSec > 0 && tsItemsPerSec > 0 && Math.max(itemsPerSec, tsItemsPerSec) / Math.min(itemsPerSec, tsItemsPerSec) > 2) {
    say('  ** the two estimates differ by more than 2x — trust neither blindly, re-run before committing **');
  }
  say(`page-1 horizon  : ${horizon ? `${num(horizon, 0)}s before a full page of ${maxPerPage ?? avgItems} is pushed off` : '—'}`);
  say(`poll interval   : ${interval ? `${interval}s (horizon / 3)` : '—'}`);
  say(`GB/month poll   : ${num(gbMonthPolling, 1)} GB — one feed polled every ${interval}s, all users served from it`);
  say(`GB/month floor  : ${num(gbMonthFloor, 1)} GB — every listing downloaded exactly once, the theoretical minimum`);
  say('(today the same coverage costs one request per search per interval — compare against that)');
}

/* ---------------------------- REPORT -------------------------------------- */

say();
say('=========== REPORT ===========');
say(`domain          : ${domain}   egress: ${PROXY ? 'proxy' : 'direct IP'}   ${new Date().toISOString()}`);
say(`unfiltered feed : ${FEED_WORKS ? `YES — ${feed.base} (headers=${feed.headerKind})` : 'NO'}`);
if (FEED_WORKS) {
  say(`newest-first    : ${ordered ? 'yes, ids descending' : 'NO — page 1 is not the newest page'}`);
  say(`filter ids      : ${presenceSummary.join('  ')}`);
  say(`timestamp       : ${timePath || 'none on every item'}`);
  say(`max per_page    : ${maxPerPage ?? '—'}${bytesAtMax ? ` (${num(bytesAtMax / 1024, 0)} KB)` : ''}`);
  say(`items/sec       : ${num(itemsPerSec, 3)} by id${tsItemsPerSec ? `, ${num(tsItemsPerSec, 3)} by timestamp` : ''}${overflowed ? '  (FLOOR — page 1 overflowed)' : ''}`);
  say(`poll interval   : ${interval ? `${interval}s` : '—'} to keep page 1 from overflowing`);
  say(`bandwidth       : ${num(kbPerItem, 2)} KB/item · ${num(gbMonthPolling, 1)} GB/month polling · ${num(gbMonthFloor, 1)} GB/month floor`);
  say(
    `verdict         : ${
      !ordered
        ? 'NO — the feed is not ordered newest-first, a firehose would read the wrong end'
        : presenceSummary.some((s) => s.includes('=NO'))
          ? 'PARTIAL — some filter ids are missing from the items; v2 can only match on what is present'
          : overflowed
            ? 'FEASIBLE BUT TIGHT — page 1 overflowed at this poll gap; re-run at a peak hour before committing'
            : 'FEASIBLE — bare feed, ids to match on, and page 1 outlives the poll interval'
    }`,
  );
} else {
  say('verdict         : NOT FEASIBLE on this endpoint — no unfiltered feed, so there is nothing to fan out from');
}
say('==============================');
