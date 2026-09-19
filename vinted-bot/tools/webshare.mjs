#!/usr/bin/env node
/**
 * Webshare pool manager — ZERO dependencies, single file. Node >= 18.
 *
 * The dashboard's Replace Proxy button hands you a new IP and leaves you to
 * notice that PROXIES in .env still names the old one. The bot then dials an
 * address that no longer exists: one dead route in N, nothing obviously wrong,
 * everybody a bit late. This does the replacement AND prints the PROXIES line
 * that has to follow it, so the two cannot drift apart.
 *
 *   export WEBSHARE_TOKEN=...        # dashboard -> API -> Keys
 *   node tools/webshare.mjs list                            # pool by country
 *   node tools/webshare.mjs env                             # the PROXIES= line
 *   node tools/webshare.mjs replace --from US --to FR       # DRY RUN by default
 *   node tools/webshare.mjs replace --from US --to FR --go  # actually do it
 *   node tools/webshare.mjs replace --ip 9.142.11.148 --to FR --go
 *
 * Replacement is a purchase against your plan and cannot be undone from here,
 * so nothing is committed without --go. A dry run asks Webshare what it WOULD
 * do and prints that; run it first, every time.
 *
 * The output carries your proxy passwords, which is the whole point of the
 * PROXIES line — treat it like the .env file it is going into. The API token
 * itself is never printed.
 */

const API = 'https://proxy.webshare.io/api';
const TOKEN = process.env.WEBSHARE_TOKEN || '';

const argv = process.argv.slice(2);
const command = argv[0] || 'list';
const flag = (name, fallback = undefined) => {
  const at = argv.indexOf(`--${name}`);
  if (at < 0) return fallback;
  const next = argv[at + 1];
  return next && !next.startsWith('--') ? next : true;
};
const has = (name) => argv.includes(`--${name}`);

const die = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

/** Every call goes through here so a bad token is diagnosed once, not per call. */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Token ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    if (res.status === 401) die('Webshare rejected the token (401). Check WEBSHARE_TOKEN.');
    // the body is where Webshare says which field it disliked, so show it whole
    die(`${method} ${path} -> HTTP ${res.status}\n${text.slice(0, 2000)}`);
  }
  if (parsed === null) die(`${method} ${path} answered something that is not JSON:\n${text.slice(0, 500)}`);
  return parsed;
}

/** The full pool, following pagination rather than trusting one page to hold it. */
async function pool() {
  const rows = [];
  for (let page = 1; page <= 20; page++) {
    const data = await api(`/v2/proxy/list/?mode=direct&page=${page}&page_size=100`);
    const batch = data.results;
    if (!Array.isArray(batch)) die(`unexpected list shape:\n${JSON.stringify(data).slice(0, 500)}`);
    rows.push(...batch);
    if (!data.next) break;
  }
  return rows;
}

/** Exactly the form src/vinted/client.js expects, in the pool's own order. */
const proxiesLine = (rows) =>
  `PROXIES=${rows
    .map((p) => `http://${p.username}:${p.password}@${p.proxy_address}:${p.port}`)
    .join(',')}`;

function summarise(rows) {
  const byCountry = new Map();
  for (const p of rows) {
    const code = p.country_code || '??';
    byCountry.set(code, (byCountry.get(code) || 0) + 1);
  }
  const order = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n${rows.length} proxies\n`);
  for (const [code, n] of order) {
    const bar = '█'.repeat(n);
    console.log(`  ${code.padEnd(4)} ${String(n).padStart(3)}  ${bar}`);
  }
  console.log('\n  address              port   country  city              valid');
  for (const p of rows) {
    console.log(
      `  ${String(p.proxy_address).padEnd(20)} ${String(p.port).padEnd(6)} ` +
        `${String(p.country_code || '??').padEnd(8)} ${String(p.city_name || '').padEnd(17)} ` +
        `${p.valid === false ? 'NO' : 'yes'}`,
    );
  }
}

/**
 * Webshare takes the target either as a country bucket or as an IP range, so a
 * single /32 is how you name one specific proxy. --count is what turns "swap a
 * US one" into a number rather than the whole bucket.
 */
function buildReplacement() {
  const to = String(flag('to', '') || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(to)) die('--to needs a two-letter country code, e.g. --to FR');

  const ip = flag('ip');
  const from = flag('from');
  const count = Number(flag('count', 1));
  if (!Number.isInteger(count) || count < 1) die('--count must be a positive whole number');

  if (ip && from) die('give either --ip (one specific proxy) or --from (a country bucket), not both');
  if (!ip && !from) die('say what to replace: --ip 1.2.3.4, or --from US');

  const to_replace = ip
    ? { type: 'ip_range', ip_ranges: [`${ip}/32`] }
    : { type: 'country', country_code: String(from).toUpperCase(), count };

  return { to_replace, replace_with: [{ type: 'country', country_code: to, count: ip ? 1 : count }] };
}

async function main() {
  if (!TOKEN) die('set WEBSHARE_TOKEN first (dashboard -> API -> Keys). It is never printed.');

  if (command === 'list') {
    summarise(await pool());
    console.log('\nPROXIES line: node tools/webshare.mjs env\n');
    return;
  }

  if (command === 'env') {
    // stdout is only the line, so it pipes: `... env >> .env` or | pbcopy
    console.log(proxiesLine(await pool()));
    return;
  }

  if (command === 'replace') {
    const plan = buildReplacement();
    const go = has('go');

    const preview = await api('/v3/proxy/replace/', {
      method: 'POST',
      body: { ...plan, dry_run: true },
    });
    console.log('\n— what Webshare says it would do —');
    console.log(JSON.stringify(preview, null, 2));

    if (!go) {
      console.log('\nDRY RUN. Nothing was changed. Add --go to commit.\n');
      return;
    }

    const done = await api('/v3/proxy/replace/', {
      method: 'POST',
      body: { ...plan, dry_run: false },
    });
    console.log('\n— done —');
    console.log(JSON.stringify(done, null, 2));

    // The pool is only half the job: the bot still points at the old address
    // until this line lands in .env, so print it here rather than trusting
    // anybody to remember a second command.
    const rows = await pool();
    summarise(rows);
    console.log(`\n▼ replace PROXIES in .env with this line, then restart the bot ▼\n`);
    console.log(proxiesLine(rows));
    console.log('');
    return;
  }

  die(`unknown command "${command}". Try: list | env | replace`);
}

main().catch((err) => die(err?.stack || String(err)));
