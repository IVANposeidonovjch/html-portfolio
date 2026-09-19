import { config, intervalFor, isLocked, searchLimitFor, seatCapFor } from '../config.js';
import * as store from '../db/index.js';
import { t } from '../i18n/index.js';

/**
 * What the proxy pool can carry, and how much of it is already sold.
 *
 * Every active search costs one catalog request per polling interval, except
 * that searches sharing a canonical key share the fetch: ten people watching
 * the same URL cost what one of them costs, paced by whichever of them has the
 * fastest plan. So the load of a domain is the sum of 1/interval over its
 * distinct active keys, and the pool's capacity is the sum of what each proxy
 * is believed to survive.
 *
 * This is deliberately not the same thing as VINTED_RPS. That is a hard token
 * bucket that makes requests wait; this is a budget, and going past it means
 * searches quietly falling behind their advertised interval. Refusing a search
 * is better than selling one that cannot be honoured.
 */

/** One slot per proxy, each with the rate that proxy is believed to survive. */
export function proxySlots() {
  const { proxies, proxyRps, proxyRpsDefault } = config.vinted;
  // no proxy configured is still one route out, and it has a safe rate too
  const routes = proxies.length ? proxies : ['direct'];
  return routes.map((proxy, i) => ({
    proxy,
    rps: proxyRps[i] > 0 ? proxyRps[i] : proxyRpsDefault,
  }));
}

export const totalCapacity = () => proxySlots().reduce((sum, slot) => sum + slot.rps, 0);

/** Distinct active keys with the interval their fastest holder pays for. */
function pollKeys() {
  const keys = new Map(); // `${domain}|${canonical_key}` -> { domain, interval }
  for (const row of store.activePolls.all()) {
    const interval = intervalFor(store.effectivePlan(row));
    const id = `${row.domain}|${row.canonical_key}`;
    const known = keys.get(id);
    if (!known || interval < known.interval) keys.set(id, { domain: row.domain, interval });
  }
  return keys;
}

function loadOf(keys) {
  const byDomain = new Map();
  for (const { domain, interval } of keys.values()) {
    const acc = byDomain.get(domain) ?? { domain, keys: 0, rps: 0 };
    acc.keys++;
    acc.rps += 1 / interval;
    byDomain.set(domain, acc);
  }
  const domains = [...byDomain.values()].sort((a, b) => b.rps - a.rps);
  return { total: domains.reduce((sum, d) => sum + d.rps, 0), domains, keys: keys.size };
}

/** Current load against capacity, as /stats and the alarm both read it. */
export function capacityReport() {
  const load = loadOf(pollKeys());
  const capacity = totalCapacity();
  return { ...load, capacity, utilization: capacity ? load.total / capacity : Infinity };
}

/**
 * Whether one more search fits, and what it would cost.
 *
 * A search joining a key that is already polled at least as fast rides the
 * fetch that is happening anyway, so it costs nothing and is always let in —
 * even when the pool is already over its budget, where refusing it would
 * punish someone for a queue they do not add to.
 */
export function admits({ domain, canonicalKey, interval }) {
  const keys = pollKeys();
  const load = loadOf(keys);
  const capacity = totalCapacity();
  const already = keys.get(`${domain}|${canonicalKey}`);
  const delta = Math.max(0, 1 / interval - (already ? 1 / already.interval : 0));
  const projected = load.total + delta;
  return { ok: delta === 0 || projected <= capacity, delta, projected, capacity, load: load.total };
}

/**
 * Where a new search starts, so a burst of signups does not land in the same
 * second. Anywhere inside one interval window: the first poll only builds the
 * baseline, and after it the search settles onto its own jittered schedule.
 */
export const stagger = (interval) => Math.floor(Math.random() * interval);

/* --------------------------------- seats -------------------------------- */

/** Seats of one tier: how many exist, how many are taken. cap 0 = uncapped. */
export function seats(plan) {
  const cap = seatCapFor(plan);
  const used = store.countPlanHolders.get(plan, store.now()).n;
  return { plan, cap, used, left: cap ? Math.max(0, cap - used) : null, full: cap > 0 && used >= cap };
}

export const cappedPlans = () => Object.keys(config.seats).filter((plan) => seatCapFor(plan) > 0);

/**
 * Whether this account may take that tier. Renewing or extending is never
 * blocked: the holder already occupies the seat they are paying to keep.
 */
export function seatAvailableFor(plan, tgId) {
  if (!seats(plan).full) return true;
  return store.effectivePlan(store.getUser(tgId)) === plan;
}

/**
 * The capacity section of /stats. Russian like the rest of the admin surface,
 * and living here rather than in the entry point so it can be tested.
 */
export function statsLines() {
  const report = capacityReport();
  const lines = [
    `Нагрузка: ${report.total.toFixed(2)} из ${report.capacity.toFixed(2)} req/s ` +
      `(${Math.round(report.utilization * 100)}%) · ${report.keys} уникальных поисков`,
    ...report.domains.map((d) => `  ${d.domain}: ${d.rps.toFixed(2)} req/s (${d.keys})`),
    // by position, not by URL: a proxy string carries its own password
    `Прокси: ${proxySlots().map((s, i) => `${s.proxy === 'direct' ? 'прямой IP' : `#${i + 1}`} ${s.rps} req/s`).join(', ')}`,
  ];
  const capped = cappedPlans();
  if (capped.length) {
    const used = capped.map((plan) => {
      const seat = seats(plan);
      return `${t('ru', `plan.name.${plan}`)} ${seat.used}/${seat.cap} (свободно ${seat.left})`;
    });
    lines.push(`Места: ${used.join(' · ')}`);
  }
  return lines;
}

/* --------------------------- over-limit sweep --------------------------- */

/**
 * Who is carrying more active searches than their plan now allows, and what to
 * do about it. Runs as a sweep rather than hanging off every place a plan can
 * change, because a plan can change in a lot of places — a lapse, a downgrade,
 * a failed renewal, an admin /grant, or nothing at all moving except a limit
 * in the config — and all of them mean the same thing here.
 *
 * Nobody is trimmed the moment it happens. They get the grace window to pick
 * which links matter, and only then are the extras paused for them, newest
 * first. Paused, never deleted.
 *
 * The floor is skipped on purpose. Its limit is zero, but its searches are
 * already excluded from the polling queue, so pausing them would add nothing
 * except a pile of switches to flip back on the day somebody pays.
 */
export function sweepOverLimit(at = store.now()) {
  const started = [];
  const enforced = [];

  for (const row of store.activeSearchCounts.all()) {
    const plan = store.effectivePlan(row);
    if (isLocked(plan)) continue;
    const limit = searchLimitFor(plan) + (row.extra_links || 0);
    if (limit <= 0) continue;

    if (row.active <= limit) {
      // back inside the allowance, by their hand or by an upgrade
      if (row.limit_grace_until) store.setLimitGrace.run(null, row.tg_id);
      continue;
    }

    if (!row.limit_grace_until) {
      const deadline = at + config.payments.downgradeGraceHours * 3600;
      store.setLimitGrace.run(deadline, row.tg_id);
      started.push({ tgId: row.tg_id, lang: row.lang, plan, limit, active: row.active, deadline });
      continue;
    }

    if (row.limit_grace_until <= at) {
      const { changes } = store.pauseExcessSearches.run(row.tg_id, row.tg_id, limit);
      store.setLimitGrace.run(null, row.tg_id);
      if (changes) enforced.push({ tgId: row.tg_id, lang: row.lang, limit, paused: changes });
    }
  }

  return { started, enforced };
}

/* --------------------------------- alarm -------------------------------- */

/**
 * Says something when utilization crosses a line, and then stops saying it.
 *
 * A pool at 91% is at 91% on every check, so a plain threshold would mean an
 * alert a minute. It reports a change of level, and repeats a standing one
 * only after the cooldown — recovery included, because "it is fine again" is
 * the half of the story that lets someone stop worrying.
 */
export class CapacityAlarm {
  constructor(now = () => Date.now() / 1000) {
    this.now = now;
    this.level = 'ok';
    this.announcedAt = 0;
  }

  levelFor(utilization) {
    if (utilization >= config.capacity.alertAt) return 'alert';
    if (utilization >= config.capacity.warnAt) return 'warn';
    return 'ok';
  }

  /** @returns {null | { level, previous, report }} null when there is nothing new to say. */
  check(report = capacityReport()) {
    const level = this.levelFor(report.utilization);
    const previous = this.level;
    const stale = this.now() - this.announcedAt >= config.capacity.repeatAfterSec;
    if (level === previous && (level === 'ok' || !stale)) return null;
    this.level = level;
    this.announcedAt = this.now();
    return { level, previous, report };
  }
}
