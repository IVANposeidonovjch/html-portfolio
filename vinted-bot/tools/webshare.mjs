#!/usr/bin/env node
/**
 * Webshare pool manager. Node >= 18, no dependencies beyond the bot's own
 * modules, so it reads the same config and the same .env the bot does.
 *
 *   node tools/webshare.mjs list              # the pool, by country
 *   node tools/webshare.mjs budget            # replacements left this month
 *   node tools/webshare.mjs env               # just the PROXIES= line
 *   node tools/webshare.mjs replace --from US --to FR          # DRY RUN
 *   node tools/webshare.mjs replace --from US --to FR --count 5 --go
 *   node tools/webshare.mjs replace --ip 9.142.11.148 --to FR --go
 *   node tools/webshare.mjs heal              # replace whatever is dead (DRY RUN)
 *   node tools/webshare.mjs heal --go --max-per-run 2
 *
 * Nothing spends a replacement without --go. Replacements are a small fixed
 * monthly allowance that does not carry over, so every command that can spend
 * one prints the budget first and refuses to touch the reserve
 * (REPLACEMENT_ALERT_THRESHOLD) unless --force says to.
 *
 * WEBSHARE_TOKEN comes from .env like everything else and is never printed.
 * The PROXIES line does carry proxy passwords — that is what it is for; treat
 * the output like the .env file it is going into.
 */

import { config } from '../src/config.js';
import { createWebshare, proxiesLine, rowFor } from '../src/proxy/webshare.js';
import { writeEnvValue } from '../src/proxy/envfile.js';
import { mergePool, runReplacement } from '../src/proxy/autoreplace.js';

const argv = process.argv.slice(2);
const command = argv[0] || 'list';
const flag = (name, fallback) => {
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

const api = createWebshare();

const showBudget = (b) => {
  const resets = (b.resetsAt instanceof Date ? b.resetsAt : new Date(b.resetsAt)).toISOString().slice(0, 10);
  const reserve = config.webshare.alertThreshold;
  console.log(
    `\nReplacements: ${b.available} of ${b.total} left` +
      `${b.available <= reserve ? ' ⚠️  at or under the reserve' : ''}` +
      ` · used ${b.used} · resets ${resets} · reserve ${reserve}`,
  );
  return b;
};

function summarise(rows) {
  const byCountry = new Map();
  for (const p of rows) byCountry.set(p.country_code || '??', (byCountry.get(p.country_code || '??') || 0) + 1);
  console.log(`\n${rows.length} proxies\n`);
  for (const [code, n] of [...byCountry.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(4)} ${String(n).padStart(3)}  ${'█'.repeat(n)}`);
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
 * single /32 is how you name one specific proxy.
 */
function buildReplacement() {
  const to = String(flag('to', '') || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(to)) die('--to needs a two-letter country code, e.g. --to FR');

  const ip = flag('ip');
  const from = flag('from');
  const count = Number(flag('count', 1));
  if (!Number.isInteger(count) || count < 1) die('--count must be a positive whole number');
  if (ip && from) die('give either --ip (one proxy) or --from (a country bucket), not both');
  if (!ip && !from) die('say what to replace: --ip 1.2.3.4, or --from US');

  return {
    toReplace: ip
      ? { type: 'ip_range', ip_ranges: [`${ip}/32`] }
      : { type: 'country', country_code: String(from).toUpperCase(), count },
    replaceWith: [{ type: 'country', country_code: to, count: ip ? 1 : count }],
    spend: ip ? 1 : count,
  };
}

/** The pool changed: the .env line has to follow it or the bot dials a ghost. */
async function syncEnv() {
  const after = await api.listProxies();
  const { pool, swaps } = mergePool(config.vinted.proxies, after);
  if (config.vinted.proxies.length) {
    const written = writeEnvValue(config.webshare.envPath, 'PROXIES', pool.join(','));
    console.log(
      written.changed
        ? `\n✅ PROXIES updated in ${written.file}\n   backup: ${written.backup}\n   ${swaps.length} slot(s) changed — restart the bot, or let the running one pick it up on its next check`
        : `\n${config.webshare.envPath} already matched the pool — nothing written`,
    );
  } else {
    console.log('\nPROXIES is empty in .env, so nothing was rewritten. The line you want:\n');
    console.log(proxiesLine(after));
  }
  summarise(after);
}

async function main() {
  if (!api.hasToken()) die('WEBSHARE_TOKEN is not set (dashboard -> API -> Keys). It is never printed.');

  if (command === 'list') {
    summarise(await api.listProxies());
    console.log('\nPROXIES line: node tools/webshare.mjs env\n');
    return;
  }

  if (command === 'budget') {
    showBudget(await api.budget());
    console.log('');
    return;
  }

  if (command === 'env') {
    // stdout is only the line, so it pipes
    console.log(proxiesLine(await api.listProxies()));
    return;
  }

  if (command === 'heal') {
    const go = has('go');
    const maxPerRun = Number(flag('max-per-run', config.webshare.maxPerRun));
    if (!Number.isInteger(maxPerRun) || maxPerRun < 1) die('--max-per-run must be a positive whole number');

    // the CLI has no running bot behind it, so nothing here knows which proxies
    // have been failing — that state lives in the process that does the polling
    console.log(
      '\nNote: "dead" is measured by the running bot, not by this script. Run from the\n' +
        'bot host; if the bot is not running, this will find nothing to heal.\n',
    );
    const result = await runReplacement({ api, dryRun: !go, maxPerRun });
    if (result.budget) showBudget(result.budget);
    console.log(`\nstatus: ${result.status} · dead: ${result.wanted} · replaced: ${result.replaced.length}`);
    for (const r of result.replaced) console.log(`  #${r.index} ${r.address} (${r.country})`);
    if (result.error) console.log(`error: ${result.error}`);
    console.log(go ? '' : '\nDRY RUN. Nothing was spent. Add --go to commit.\n');
    return;
  }

  if (command === 'replace') {
    const plan = buildReplacement();
    const go = has('go');
    const budget = showBudget(await api.budget());
    const reserve = config.webshare.alertThreshold;

    if (go && budget.available - plan.spend < reserve && !has('force')) {
      die(
        `that would leave ${budget.available - plan.spend} replacement(s), under the reserve of ` +
          `${reserve}. Add --force if you mean to spend the reserve.`,
      );
    }
    if (plan.spend > budget.available) die(`only ${budget.available} replacement(s) left this month`);

    const preview = await api.replace({ ...plan, dryRun: true });
    console.log('\n— what Webshare says it would do —');
    console.log(JSON.stringify(preview, null, 2));

    if (!go) {
      console.log('\nDRY RUN. Nothing was changed. Add --go to commit.\n');
      return;
    }

    console.log('\n— doing it —');
    console.log(JSON.stringify(await api.replace({ ...plan, dryRun: false }), null, 2));
    showBudget(await api.budget());
    await syncEnv();
    console.log('');
    return;
  }

  die(`unknown command "${command}". Try: list | budget | env | replace | heal`);
}

main().catch((err) => die(err?.stack || String(err)));
