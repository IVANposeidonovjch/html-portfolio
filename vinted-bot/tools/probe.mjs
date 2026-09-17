#!/usr/bin/env node
/**
 * Vinted endpoint probe — run this ON THE DROPLET, through the residential proxy.
 *
 *   PROXY=http://user:pass@host:port node tools/probe.mjs "https://www.vinted.de/catalog?search_text=raf+simons"
 *
 * It bootstraps a real session, then walks every known catalog-endpoint variant
 * and reports, per variant: status, content type, size, whether the body is JSON,
 * the top-level keys, how many items came back and the field names of the first
 * item. Finally it checks whether the catalog HTML page carries the listings
 * inline (the fallback path if the JSON service is gone for good).
 *
 * Paste the "REPORT" block back into the chat — it is everything needed to pin
 * the endpoint in src/vinted/endpoints.js.
 *
 * For the filter-efficacy check (does brand filtering actually narrow the
 * results, or does the service answer 200 and ignore it?) use
 * tools/probe-standalone.mjs — it runs the same search with and without the
 * filters and compares the two answers.
 */
import { ProxyAgent, request } from 'undici';
import { STRATEGIES, extractItems } from '../src/vinted/endpoints.js';
import { parseSearchUrl } from '../src/vinted/url.js';

const UA =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const proxy = process.env.PROXY || process.env.HTTPS_PROXY || '';
const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;

const target = process.argv[2] || 'https://www.vinted.de/catalog?search_text=raf+simons&price_to=500';
const { domain, query } = parseSearchUrl(target);

const cookies = new Map();
let csrfToken = null;
const report = [];
const say = (line) => {
  console.log(line);
  report.push(line);
};

const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
function storeCookies(headers) {
  const raw = headers['set-cookie'];
  if (!raw) return;
  for (const line of Array.isArray(raw) ? raw : [raw]) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

async function bootstrap() {
  const res = await request(`https://${domain}/`, {
    dispatcher,
    headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'en-GB,en;q=0.9' },
    maxRedirections: 3,
  });
  storeCookies(res.headers);
  const html = await res.body.text();
  csrfToken = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i)?.[1] || null;
  say(`homepage        : HTTP ${res.statusCode}, ${html.length} bytes`);
  say(`cookies         : ${[...cookies.keys()].join(', ') || 'none'}`);
  say(`csrf meta token : ${csrfToken ? `yes (${csrfToken.slice(0, 12)}…)` : 'no'}`);
  say(`server headers  : ${res.headers.server || '?'} ${res.headers['cf-ray'] ? '(cloudflare)' : ''}`);
  return html;
}

function headerSets() {
  const base = {
    'user-agent': UA,
    'accept-language': 'en-GB,en;q=0.9',
    accept: 'application/json, text/plain, */*',
    cookie: cookieHeader(),
    referer: `https://${domain}/catalog`,
  };
  const full = { ...base, origin: `https://${domain}`, 'x-requested-with': 'XMLHttpRequest' };
  if (cookies.get('anon_id')) full['x-anon-id'] = cookies.get('anon_id');
  if (csrfToken) full['x-csrf-token'] = csrfToken;
  return [
    ['plain  ', base],
    ['full   ', full],
  ];
}

async function probeStrategies() {
  say('');
  say('--- catalog endpoint matrix ---');
  const wins = [];
  for (const strategy of STRATEGIES) {
    const url = strategy.url(domain, query, { perPage: 5 });
    for (const [label, headers] of headerSets()) {
      let line = `${strategy.name.padEnd(21)} ${label} `;
      try {
        const res = await request(url, { dispatcher, headers, maxRedirections: 0 });
        const ct = (res.headers['content-type'] || '?').split(';')[0];
        const text = await res.body.text();
        line += `HTTP ${res.statusCode} ${ct.padEnd(17)} ${String(text.length).padStart(7)}B`;
        if (res.statusCode === 200 && ct.includes('json')) {
          let body = null;
          try {
            body = JSON.parse(text);
          } catch {
            /* not json after all */
          }
          const items = extractItems(body);
          line += `  keys=[${Object.keys(body || {}).slice(0, 6).join(',')}]`;
          if (items) {
            line += `  items=${items.length}`;
            if (items.length) {
              wins.push({ strategy: strategy.name, headers: label.trim(), url, item: items[0] });
            }
          }
        } else if (!ct.includes('json')) {
          line += `  «${text.replace(/\s+/g, ' ').slice(0, 60)}»`;
        }
      } catch (err) {
        line += `ERROR ${err.code || err.message}`;
      }
      say(line);
      await new Promise((r) => setTimeout(r, 800)); // stay polite
    }
  }
  return wins;
}

async function probeHtmlFallback() {
  say('');
  say('--- inline-JSON fallback on the catalog page ---');
  try {
    const res = await request(target, {
      dispatcher,
      headers: { 'user-agent': UA, accept: 'text/html', cookie: cookieHeader() },
      maxRedirections: 3,
    });
    const html = await res.body.text();
    say(`catalog page    : HTTP ${res.statusCode}, ${html.length} bytes`);
    const scripts = [...html.matchAll(/<script[^>]*id=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
    say(`script ids      : ${scripts.slice(0, 12).join(', ') || 'none'}`);
    for (const marker of ['__NEXT_DATA__', '__INITIAL_STATE__', 'application/ld+json', '"itemId"', '"total_item_price"', '"catalogItems"']) {
      if (html.includes(marker)) say(`contains        : ${marker}`);
    }
    const idHits = [...html.matchAll(/\/items\/(\d+)/g)].map((m) => m[1]);
    say(`item links      : ${idHits.length} (${[...new Set(idHits)].slice(0, 5).join(', ')})`);
  } catch (err) {
    say(`catalog page    : ERROR ${err.code || err.message}`);
  }
}

console.log(`probing ${domain} via ${proxy ? 'proxy' : 'direct IP'}\nsearch: ${target}\n`);
await bootstrap();
const wins = await probeStrategies();
await probeHtmlFallback();

say('');
say('=========== REPORT ===========');
if (wins.length) {
  const w = wins[0];
  say(`WORKING: strategy=${w.strategy} headers=${w.headers}`);
  say(`URL    : ${w.url}`);
  say(`item fields: ${Object.keys(w.item).join(', ')}`);
  say('first item (trimmed):');
  say(JSON.stringify(w.item, null, 1).slice(0, 2000));
} else {
  say('NO VARIANT RETURNED ITEMS — paste the matrix above, the inline-JSON section decides the fallback.');
}
say('==============================');
