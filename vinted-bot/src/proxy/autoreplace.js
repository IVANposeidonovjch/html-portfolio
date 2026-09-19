import { config } from '../config.js';
import { logger } from '../util/logger.js';
import { proxyHealth, swapProxy } from '../vinted/client.js';
import { writeEnvValue } from './envfile.js';
import { createWebshare, proxyUrl, rowFor } from './webshare.js';

/**
 * Closing the loop on a dead proxy: dropped from rotation by the health layer,
 * then actually replaced, and the pool put back to full strength without a
 * restart.
 *
 * The whole thing is governed by one scarce resource. Webshare gives a fixed
 * handful of manual replacements a month, they do not carry over, and a bad
 * afternoon upstream can look like five dead proxies when it is one dead
 * datacentre. So this is built to spend reluctantly:
 *
 *   - a proxy must have been continuously failing for deadForSec, not merely
 *     be inside a cooldown. Most dead proxies are not dead, they are busy;
 *   - at most maxPerRun go per run, so a burst cannot drain the month;
 *   - alertThreshold is a reserve, not a warning line. Automatic replacement
 *     stops when the budget reaches it and says so. Those last few belong to
 *     a human who knows what they are buying;
 *   - the remaining count is read from Webshare every run, never assumed.
 *
 * With no token none of this exists and the bot is exactly as it was: a dead
 * proxy still leaves the rotation, it just never gets replaced.
 */

/**
 * The pool rebuilt from what Webshare now holds, with surviving proxies left
 * exactly where they were.
 *
 * Order is not cosmetic: PROXY_SAFE_RPS is positional, so a proxy that moves
 * from slot 2 to slot 5 silently takes a different rate with it. Survivors
 * keep their index, new addresses drop into the vacancies left by the ones
 * they replaced, and anything still spare goes on the end.
 *
 * @returns {{ pool: string[], swaps: Array<{ index: number, from: string, to: string }> }}
 */
export function mergePool(oldPool, freshRows) {
  const fresh = freshRows.map(proxyUrl);
  const survives = (proxy) => !!rowFor(proxy, freshRows);

  const pool = oldPool.slice();
  const vacancies = [];
  for (const [i, proxy] of pool.entries()) if (!survives(proxy)) vacancies.push(i);

  const incoming = fresh.filter((url) => !oldPool.some((p) => sameEndpoint(p, url)));
  const swaps = [];
  for (const [n, index] of vacancies.entries()) {
    const to = incoming[n];
    if (!to) break; // fewer new addresses than holes: leave the hole, say nothing false
    swaps.push({ index, from: pool[index], to });
    pool[index] = to;
  }
  // anything Webshare added that did not replace one of ours
  for (const extra of incoming.slice(vacancies.length)) pool.push(extra);
  return { pool, swaps };
}

function sameEndpoint(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname === y.hostname && x.port === y.port;
  } catch {
    return a === b;
  }
}

/**
 * The last budget we were told about.
 *
 * /stats reads this rather than calling Webshare: an admin command should not
 * hang on somebody else's API, and a number a quarter of an hour old is the
 * right answer to a question about a monthly allowance.
 */
let remembered = null;
export const lastBudget = () => remembered;
export const rememberBudget = (budget) => {
  remembered = budget;
  return budget;
};
export const forgetBudget = () => {
  remembered = null;
};

/** Proxies that have earned a replacement rather than merely had a bad minute. */
export function deadEnoughToReplace(at = Date.now()) {
  const { proxyFailThreshold } = config.vinted;
  const { deadForSec } = config.webshare;
  return proxyHealth(at).entries.filter(
    (e) => !e.direct && e.fails >= proxyFailThreshold && e.deadForSec >= deadForSec,
  );
}

/**
 * One pass.
 *
 * @returns {Promise<{
 *   status: 'off'|'no-token'|'ok'|'reserve'|'failed',
 *   budget: null | { total, used, available, resetsAt },
 *   replaced: Array<{ index, country, address }>,
 *   wanted: number, lowBudget: boolean, restartNeeded: boolean, error?: string
 * }>}
 */
export async function runReplacement({
  api = createWebshare(),
  at = Date.now(),
  dryRun = false,
  maxPerRun = config.webshare.maxPerRun,
  envPath = config.webshare.envPath,
} = {}) {
  const blank = { budget: null, replaced: [], wanted: 0, lowBudget: false, restartNeeded: false };
  if (!api.hasToken()) return { status: 'no-token', ...blank };
  if (!config.webshare.autoReplace) return { status: 'off', ...blank };

  const dead = deadEnoughToReplace(at);

  let budget;
  try {
    // read every pass, dead proxies or not: /stats and the low-budget alert
    // both want it, and it is one call a quarter of an hour
    budget = rememberBudget(await api.budget());
  } catch (err) {
    logger.warn(`webshare: could not read the replacement budget (${err.message})`);
    return { status: 'failed', ...blank, wanted: dead.length, error: err.message };
  }

  const reserve = config.webshare.alertThreshold;
  const lowBudget = budget.available <= reserve;
  const base = { budget, replaced: [], wanted: dead.length, lowBudget, restartNeeded: false };

  if (!dead.length) return { status: 'ok', ...base };

  // the reserve is not a warning line, it is a floor: automatic spending stops
  // here and a person decides what the last few are for
  const spendable = Math.max(0, budget.available - reserve);
  if (spendable < 1) {
    logger.warn(
      `webshare: ${dead.length} proxy(ies) need replacing but only ${budget.available} ` +
        `replacement(s) remain, at or under the reserve of ${reserve} — not spending them automatically`,
    );
    return { status: 'reserve', ...base };
  }

  const take = Math.min(dead.length, maxPerRun, spendable);
  try {
    const before = await api.listProxies();
    const replaced = [];

    for (const entry of dead.slice(0, take)) {
      const row = rowFor(entry.proxy, before);
      if (!row) {
        logger.warn(`webshare: proxy #${entry.index} is not in the Webshare pool — not replacing it`);
        continue;
      }
      // same country in, same country out: the pool's geography is chosen to
      // match where the searches are, and a replacement is not the moment to
      // quietly redraw it
      await api.replace({
        toReplace: { type: 'ip_range', ip_ranges: [`${row.proxy_address}/32`] },
        replaceWith: [{ type: 'country', country_code: row.country_code, count: 1 }],
        dryRun,
      });
      replaced.push({ index: entry.index, country: row.country_code, address: row.proxy_address });
      logger.warn(
        `webshare: replaced proxy #${entry.index} (${row.country_code}, dead ${entry.deadForSec}s)` +
          `${dryRun ? ' [DRY RUN]' : ''}`,
      );
    }

    if (!replaced.length) return { status: 'ok', ...base };
    if (dryRun) return { status: 'ok', ...base, replaced };

    const after = await api.listProxies();
    const { pool, swaps } = mergePool(config.vinted.proxies, after);

    // .env first: if the process dies between here and the hot swap, the next
    // boot still comes up on the new pool
    const written = writeEnvValue(envPath, 'PROXIES', pool.join(','), { at: new Date(at) });
    if (written.changed) logger.info(`webshare: PROXIES updated in ${written.file} (backup ${written.backup})`);

    for (const swap of swaps) swapProxy(swap.from, swap.to);
    const restartNeeded = config.webshare.restart && swaps.length > 0;

    return { status: 'ok', budget: await safeBudget(api, budget), replaced, wanted: dead.length, lowBudget, restartNeeded };
  } catch (err) {
    logger.error(`webshare: replacement failed (${err.message})`);
    return { status: 'failed', ...base, error: err.message };
  }
}

/** The budget after spending, falling back to arithmetic if the API hiccups. */
async function safeBudget(api, before) {
  try {
    return rememberBudget(await api.budget());
  } catch {
    return before;
  }
}
