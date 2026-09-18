import { GrammyError } from 'grammy';
import { logger } from '../util/logger.js';
import { TokenBucket, sleep } from '../util/ratelimit.js';
import { renderItem, itemKeyboard } from '../bot/format.js';

/**
 * Delivery pacing.
 *
 * Telegram's limits are a budget, not a metronome: roughly 30 messages/second
 * across all chats, and about 20/minute into one group. A fixed gap per message
 * spends that budget as slowly as the sustained rate allows, so ten listings
 * found in one poll trickled out over half a minute — while the same ten fit
 * inside the allowance comfortably if sent back to back.
 *
 * So each chat gets a token bucket instead: `burst` messages may leave
 * immediately, and only once that is spent does the chat settle to its
 * sustained rate. A private chat is given a higher rate than a group, because
 * Telegram treats it more generously.
 *
 * Each chat also gets its own lane. With a single queue, one chat that had
 * exhausted its budget held up everyone else's listings behind it.
 */
export class Sender {
  constructor(api, {
    globalPerSec = 25, // under Telegram's ~30/s ceiling, with room to spare
    groupPerMinute = 20,
    privatePerMinute = 60,
    burst = 10,
    idleLaneMs = 10 * 60_000,
  } = {}) {
    this.api = api;
    this.global = new TokenBucket(globalPerSec, globalPerSec);
    this.rates = { group: groupPerMinute / 60, private: privatePerMinute / 60 };
    this.burst = burst;
    this.idleLaneMs = idleLaneMs;
    this.lanes = new Map(); // chat id -> { items, running, bucket, lastUsed }
    this.onFailure = null; // set by the app: (job, error) => void
    this.sent = 0;
  }

  /**
   * Groups and channels carry the tighter limit; a private chat can take more.
   * A job may ask for a bigger burst or a slower sustained rate than the
   * default — that is the plan speaking. The sustained rate is clamped to what
   * the chat allows either way: how fast the allowance is spent is ours to
   * sell, the allowance itself is Telegram's.
   */
  #laneFor(chatId, job) {
    const ceiling = chatId < 0 ? this.rates.group : this.rates.private;
    const rate = job?.perMinute ? Math.min(job.perMinute / 60, ceiling) : ceiling;
    const burst = job?.burst ?? this.burst;

    let lane = this.lanes.get(chatId);
    if (!lane) {
      lane = { items: [], inFlight: 0, running: false, bucket: new TokenBucket(rate, burst), lastUsed: 0 };
      this.lanes.set(chatId, lane);
    } else {
      // two accounts may post into the same group on different plans; the chat
      // follows the faster of them rather than whoever happened to arrive first
      lane.bucket.capacity = Math.max(lane.bucket.capacity, burst);
      lane.bucket.rate = Math.max(lane.bucket.rate, rate);
    }
    lane.lastUsed = Date.now();
    return lane;
  }

  /**
   * Forget chats that have been quiet long enough for their bucket to have
   * refilled anyway — dropping a lane any earlier would hand that chat a fresh
   * full burst and walk straight into a 429.
   */
  #sweep() {
    if (this.lanes.size < 200) return;
    const cutoff = Date.now() - this.idleLaneMs;
    for (const [chatId, lane] of this.lanes) {
      if (!lane.items.length && !lane.inFlight && !lane.running && lane.lastUsed < cutoff) {
        this.lanes.delete(chatId);
      }
    }
  }

  enqueue(job) {
    const lane = this.#laneFor(job.chatId, job);
    lane.items.push(job);
    this.#sweep();
    if (!lane.running) this.#drain(job.chatId, lane);
  }

  /**
   * Listings not yet delivered — queued plus the one currently waiting for its
   * chat's budget. Counting only the queue would report an empty backlog while
   * a message was still sitting in front of a closed gate.
   */
  get size() {
    let n = 0;
    for (const lane of this.lanes.values()) n += lane.items.length + lane.inFlight;
    return n;
  }

  /** Backlog per chat, for /stats. */
  get pending() {
    return [...this.lanes.entries()]
      .filter(([, lane]) => lane.items.length + lane.inFlight)
      .map(([chatId, lane]) => `${chatId}:${lane.items.length + lane.inFlight}`);
  }

  async #drain(chatId, lane) {
    lane.running = true;
    try {
      while (lane.items.length) {
        const job = lane.items.shift();
        lane.inFlight = 1;
        try {
          await this.global.take(); // the ceiling across every chat
          await lane.bucket.take(); // this chat's own budget
          lane.lastUsed = Date.now();
          await this.#send(job, lane);
        } finally {
          lane.inFlight = 0;
        }
      }
    } finally {
      lane.running = false;
    }
  }

  async #send(job, lane, attempt = 0) {
    const { chatId, threadId, item, searchName, lang, note } = job;
    let caption = renderItem(item, searchName, lang);
    // A photo caption stops at 1024 characters; the listing itself matters more
    // than the note, so the note is only added when it fits.
    if (note && caption.length + note.length + 2 <= 1024) caption = `${caption}\n\n${note}`;
    const opts = {
      parse_mode: 'HTML',
      reply_markup: itemKeyboard(item, lang),
      ...(threadId ? { message_thread_id: threadId } : {}),
    };
    try {
      if (item.photoUrl) {
        await this.api.sendPhoto(chatId, item.photoUrl, { caption, ...opts });
      } else {
        await this.api.sendMessage(chatId, caption, { ...opts, link_preview_options: { is_disabled: true } });
      }
      this.sent++;
      job.onSent?.();
    } catch (err) {
      if (err instanceof GrammyError) {
        // `retry_after: 0` is a legal answer, and a plain 429 may carry no
        // parameter at all — neither may be read as "do not retry".
        const retryAfter = err.parameters?.retry_after ?? (err.error_code === 429 ? 1 : undefined);
        if (retryAfter !== undefined && attempt < 3) {
          // Telegram says we were too quick: empty this chat's bucket so the
          // pause applies to everything queued behind this message too.
          if (lane) lane.bucket.tokens = 0;
          await sleep((retryAfter + 1) * 1000);
          return this.#send(job, lane, attempt + 1);
        }
        // Telegram cannot fetch the remote photo -> fall back to a text message
        if (attempt === 0 && item.photoUrl && /wrong file identifier|failed to get http url content|photo/i.test(err.description)) {
          return this.#send({ ...job, item: { ...item, photoUrl: null } }, lane, attempt + 1);
        }
        logger.warn(`send failed chat=${chatId} item=${item.id}: ${err.description}`);
        this.onFailure?.(job, err);
        return;
      }
      logger.error(`send error chat=${chatId} item=${item.id}:`, err);
    }
  }
}
