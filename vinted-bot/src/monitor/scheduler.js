import { config, intervalFor } from '../config.js';
import * as store from '../db/index.js';
import { logger } from '../util/logger.js';
import { jitter, sleep } from '../util/ratelimit.js';
import { fetchCatalog, VintedError } from '../vinted/client.js';
import { normalizeAll } from '../vinted/normalize.js';

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
  }

  start() {
    this.loop();
    this.prune = setInterval(() => store.pruneOldRows(), 6 * 3600 * 1000);
  }

  stop() {
    this.stopped = true;
    clearInterval(this.prune);
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
    const due = store.dueSearches.all(store.now(), BATCH);
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
      // First poll: remember what already exists, notify nothing.
      const cutoff = config.vinted.firstRunMaxAgeMin
        ? store.now() - config.vinted.firstRunMaxAgeMin * 60
        : Infinity;
      const baseline = items.filter((i) => !(cutoff !== Infinity && i.uploadedAt && i.uploadedAt > cutoff));
      store.seen.addMany(search.id, baseline.map((i) => i.id));
      store.markRun.run(store.now(), nextAt, maxId, search.id);
      logger.info(`primed search=${search.id} "${search.name}" baseline=${baseline.length}`);
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
