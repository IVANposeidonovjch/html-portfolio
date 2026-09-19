import { INSTANT_PLANS, burstFor, config, intervalFor, ratePerMinuteFor } from '../config.js';
import * as store from '../db/index.js';
import { t } from '../i18n/index.js';
import { logger } from '../util/logger.js';
import { jitter, sleep } from '../util/ratelimit.js';
import { fetchCatalog, VintedError } from '../vinted/client.js';
import { normalizeAll } from '../vinted/normalize.js';
import { CapacityAlarm, capacityReport, sweepOverLimit } from './capacity.js';
import { runReplacement } from '../proxy/autoreplace.js';

const TICK_MS = 1000;
const BATCH = 40; // searches picked up per tick
const CACHE_TTL = 25; // seconds an identical search may reuse another user's fetch

export class Monitor {
  constructor(sender) {
    this.sender = sender;
    this.stopped = false;
    this.inflight = new Set(); // canonical keys currently being fetched
    this.cycles = 0;
    this.fetches = 0;
    this.notifications = 0;
    this.alarm = new CapacityAlarm();
    /** Set by the caller to reach the admins when the pool is running hot. */
    this.onCapacity = null;
    /** Set by the caller to warn a user their links are over the new limit. */
    this.onOverLimit = null;
    this.onLimitEnforced = null;
    /** Set by the caller to tell the admins a proxy was bought, or cannot be. */
    this.onProxyReplaced = null;
    this.onReplacementBudget = null;
    // both of these are standing conditions rather than events — true again on
    // every check until the month rolls over or somebody acts — so each is
    // said once and not repeated every quarter of an hour
    this.budgetWarned = false;
    this.reserveWarned = false;
  }

  start() {
    this.loop();
    this.prune = setInterval(() => store.pruneOldRows(), 6 * 3600 * 1000);
    this.watch = setInterval(() => this.checkCapacity(), config.capacity.checkEverySec * 1000);
    // hourly is often enough for a window measured in days, and it means a
    // deadline is never missed by more than an hour
    this.limits = setInterval(() => this.checkLimits(), 3600 * 1000);
    this.proxies = setInterval(
      () => this.checkProxies(),
      config.webshare.checkEverySec * 1000,
    );
    // a restart into an already overloaded pool should say so now, not in a minute
    this.checkCapacity();
    this.checkLimits();
    // but the pool is not checked at boot: nothing has had time to die yet,
    // and deadForSec has to be measured from this process, not the last one
  }

  stop() {
    this.stopped = true;
    clearInterval(this.prune);
    clearInterval(this.watch);
    clearInterval(this.limits);
    clearInterval(this.proxies);
  }

  /**
   * Downgrades catch up with the links somebody kept. Whoever just went over
   * gets told they have until a date; whoever ran the clock out has the extras
   * paused and is told that too — a search going quiet with no explanation is
   * the thing this is here to avoid.
   */
  checkLimits() {
    try {
      const { started, enforced } = sweepOverLimit();
      for (const over of started) {
        logger.info(`over limit: ${over.tgId} has ${over.active}/${over.limit} on ${over.plan}`);
        this.onOverLimit?.(over);
      }
      for (const done of enforced) {
        logger.info(`paused ${done.paused} search(es) for ${done.tgId}, over ${done.limit}`);
        this.onLimitEnforced?.(done);
      }
    } catch (err) {
      logger.error('over-limit sweep failed:', err);
    }
  }

  /**
   * Buy a replacement for anything that has stayed dead, within the month's
   * budget, and tell the admins before the budget runs out rather than after.
   *
   * Everything here is best-effort by design: a Webshare outage must not stop
   * the bot polling, so a failure is logged and the pool carries on short a
   * proxy, exactly as it did before any of this existed.
   */
  async checkProxies(run = runReplacement) {
    let result;
    try {
      result = await run();
    } catch (err) {
      logger.error('proxy replacement check failed:', err);
      return;
    }
    if (result.status === 'no-token' || result.status === 'off') return;

    for (const done of result.replaced) {
      logger.warn(`proxy #${done.index} (${done.country}) replaced via Webshare`);
    }
    if (result.replaced.length) this.onProxyReplaced?.(result);

    // "dead proxies I am not allowed to replace" holds until the allowance
    // resets or a human spends one, which is hours or days of checks
    if (result.status === 'reserve' && !this.reserveWarned) {
      this.reserveWarned = true;
      this.onProxyReplaced?.(result);
    } else if (result.status !== 'reserve') {
      this.reserveWarned = false;
    }

    // said once per crossing, and again only after the allowance resets
    if (result.budget) {
      if (result.lowBudget && !this.budgetWarned) {
        this.budgetWarned = true;
        this.onReplacementBudget?.(result.budget);
      } else if (!result.lowBudget) {
        this.budgetWarned = false;
      }
    }

    if (result.restartNeeded) {
      logger.warn('PROXY_REPLACE_RESTART is set and the pool changed — exiting for the supervisor');
      this.onProxyReplaced?.({ ...result, exiting: true });
      setTimeout(() => process.exit(0), 2000);
    }
  }

  /** Log every crossing; hand the serious ones to whoever can act on them. */
  checkCapacity() {
    const crossing = this.alarm.check(capacityReport());
    if (!crossing) return;
    const { level, report } = crossing;
    const line =
      `pool load ${report.total.toFixed(2)}/${report.capacity.toFixed(2)} req/s ` +
      `(${Math.round(report.utilization * 100)}%), ${report.keys} distinct searches`;
    if (level === 'ok') logger.info(`capacity back to normal: ${line}`);
    else logger.warn(`capacity ${level}: ${line}`);
    // 80% is an operator's problem; 90% is someone's problem now. Recovery is
    // only worth a message to whoever was told there was something wrong.
    if (level === 'alert' || (level === 'ok' && crossing.previous === 'alert')) {
      this.onCapacity?.(crossing);
    }
  }

  async loop() {
    while (!this.stopped) {
      try {
        await this.tick();
      } catch (err) {
        logger.error('monitor tick failed:', err);
      }
      await sleep(TICK_MS);
    }
  }

  async tick() {
    const due = store.dueSearches.all(store.now(), store.now(), BATCH);
    if (!due.length) return;
    this.cycles++;

    // Group by canonical key: N identical searches (same user or different users)
    // collapse into a single Vinted request.
    const groups = new Map();
    for (const s of due) {
      if (this.inflight.has(s.canonical_key)) continue;
      if (!groups.has(s.canonical_key)) groups.set(s.canonical_key, []);
      groups.get(s.canonical_key).push(s);
      // reserve the slot so the next tick does not pick it up again
      store.scheduleNext.run(store.now() + 30, s.id);
    }

    await Promise.all([...groups.entries()].map(([key, list]) => this.pollGroup(key, list)));
  }

  async pollGroup(key, searches) {
    this.inflight.add(key);
    try {
      const head = searches[0];
      let items = store.cache.get(key, CACHE_TTL);
      if (!items) {
        const raw = await fetchCatalog(head.domain, JSON.parse(head.api_query));
        items = normalizeAll(raw, head.domain);
        store.cache.set(key, items);
        this.fetches++;
      }
      for (const search of searches) this.handleResult(search, items);
    } catch (err) {
      const message = err instanceof VintedError ? err.message : String(err?.message || err);
      for (const search of searches) {
        const attempts = search.error_count + 1;
        // exponential backoff, capped at 15 minutes
        const delay = Math.min(15 * 60, intervalFor('basic') * Math.min(8, 2 ** attempts));
        store.markError.run(store.now(), store.now() + delay, message.slice(0, 300), search.id);
      }
      logger.warn(`poll failed key=${key}: ${message}`);
    } finally {
      this.inflight.delete(key);
    }
  }

  handleResult(search, items) {
    const user = store.getUser(search.user_id);
    const plan = store.effectivePlan(user);
    const nextAt = store.now() + jitter(intervalFor(plan), config.jitterPct);
    const maxId = items.reduce((m, i) => Math.max(m, i.id), 0);

    if (!search.primed) {
      /**
       * First poll. Everything already listed becomes the baseline — except
       * that the newest one of it is sent straight away, so adding a link
       * proves itself immediately instead of opening with silence and a
       * promise. Every poll after this one only carries genuinely new
       * listings, through the same dedupe as everything else.
       */
      const cutoff = config.vinted.firstRunMaxAgeMin
        ? store.now() - config.vinted.firstRunMaxAgeMin * 60
        : Infinity;
      const baseline = items.filter((i) => !(cutoff !== Infinity && i.uploadedAt && i.uploadedAt > cutoff));
      store.seen.addMany(search.id, baseline.map((i) => i.id));

      const newest = items.reduce((best, i) => (!best || i.id > best.id ? i : best), null);
      let showed = false;
      if (newest) {
        const dest = store.destKey(search.dest_chat_id, search.dest_thread_id);
        const alreadyThere = config.dedupePerDestination && store.seen.destHas(dest, newest.id);
        if (!alreadyThere) {
          // it is in the baseline whatever the cutoff said, or the next poll
          // would send it a second time
          store.seen.add(search.id, newest.id);
          if (config.dedupePerDestination) store.seen.destAdd(dest, newest.id);
          this.sender.enqueue({
            chatId: search.dest_chat_id,
            threadId: search.dest_thread_id || undefined,
            item: newest,
            searchName: search.name,
            searchId: search.id,
            lang: user?.lang || 'en',
            burst: burstFor(plan),
            perMinute: ratePerMinuteFor(plan),
            // the near-miss note measures lateness against arrival, and this
            // listing was found rather than missed — it would read as an
            // accusation about a delay that never happened
            note: null,
          });
          store.bumpSent.run(1, search.id);
          this.notifications++;
          showed = true;
        }
      }

      store.markRun.run(store.now(), nextAt, maxId, search.id);
      logger.info(
        `primed search=${search.id} "${search.name}" baseline=${baseline.length}` +
          `${showed ? ` + sent the newest (${newest.id})` : ''}`,
      );
      return;
    }

    const fresh = [];
    for (const item of items) {
      if (item.id <= search.last_item_id) continue; // Vinted ids grow monotonically
      if (store.seen.has(search.id, item.id)) continue;
      fresh.push(item);
    }
    // oldest first so the chat reads chronologically
    fresh.sort((a, b) => a.id - b.id);

    const dest = store.destKey(search.dest_chat_id, search.dest_thread_id);
    // A near-miss note, at most once a day: what a slower plan actually costs,
    // measured against this very listing rather than claimed in the abstract.
    // Plans that already deliver instantly would be lying, so they never see it.
    const nudge = (item) => {
      if (!user || INSTANT_PLANS.includes(plan) || !item.uploadedAt) return null;
      const age = store.now() - item.uploadedAt;
      if (age < config.fomo.afterSeconds) return null;
      const since = store.now() - (user.last_fomo_nudge_at || 0);
      if (since < config.fomo.everyHours * 3600) return null;
      store.markFomoNudge.run(store.now(), user.tg_id);
      user.last_fomo_nudge_at = store.now(); // keep it to one per batch too
      return t(user.lang || 'en', 'fomo.note', { seconds: age });
    };

    let queued = 0;
    for (const item of fresh) {
      store.seen.add(search.id, item.id);
      if (config.dedupePerDestination) {
        if (store.seen.destHas(dest, item.id)) continue;
        store.seen.destAdd(dest, item.id);
      }
      this.sender.enqueue({
        chatId: search.dest_chat_id,
        threadId: search.dest_thread_id || undefined,
        item,
        searchName: search.name,
        searchId: search.id,
        lang: user?.lang || 'en',
        // the plan decides how fast this chat may spend its Telegram allowance
        burst: burstFor(plan),
        perMinute: ratePerMinuteFor(plan),
        note: nudge(item),
      });
      queued++;
    }
    if (queued) {
      store.bumpSent.run(queued, search.id);
      this.notifications += queued;
      logger.info(`search=${search.id} "${search.name}" -> ${queued} new`);
    }
    store.markRun.run(store.now(), nextAt, maxId, search.id);
  }

  runtimeStats() {
    return {
      cycles: this.cycles,
      fetches: this.fetches,
      notifications: this.notifications,
      queue: this.sender.size,
    };
  }
}
