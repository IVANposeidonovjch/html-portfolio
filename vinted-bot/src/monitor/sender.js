import { GrammyError } from 'grammy';
import { logger } from '../util/logger.js';
import { sleep } from '../util/ratelimit.js';
import { renderItem, itemKeyboard } from '../bot/format.js';

/**
 * Telegram allows ~30 messages/second globally and ~20/minute into one group.
 * Everything the monitor produces goes through this queue so a burst of 50 new
 * listings never trips a 429 (and, when it does, we honour retry_after).
 */
export class Sender {
  constructor(api, { globalPerSec = 20, perChatPerSec = 1 / 3 } = {}) {
    this.api = api;
    this.queue = [];
    this.running = false;
    this.globalGap = 1000 / globalPerSec;
    this.chatGap = 1000 / perChatPerSec;
    this.lastGlobal = 0;
    this.lastByChat = new Map();
    this.onFailure = null; // set by the app: (chatId, error) => void
  }

  enqueue(job) {
    this.queue.push(job);
    if (!this.running) this.#drain();
  }

  get size() {
    return this.queue.length;
  }

  async #drain() {
    this.running = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      const wait = Math.max(
        this.lastGlobal + this.globalGap - Date.now(),
        (this.lastByChat.get(job.chatId) ?? 0) + this.chatGap - Date.now(),
      );
      if (wait > 0) await sleep(wait);
      this.lastGlobal = Date.now();
      this.lastByChat.set(job.chatId, Date.now());
      await this.#send(job);
    }
    this.running = false;
  }

  async #send(job, attempt = 0) {
    const { chatId, threadId, item, searchName } = job;
    const caption = renderItem(item, searchName);
    const opts = {
      parse_mode: 'HTML',
      reply_markup: itemKeyboard(item),
      ...(threadId ? { message_thread_id: threadId } : {}),
    };
    try {
      if (item.photoUrl) {
        await this.api.sendPhoto(chatId, item.photoUrl, { caption, ...opts });
      } else {
        await this.api.sendMessage(chatId, caption, { ...opts, link_preview_options: { is_disabled: true } });
      }
      job.onSent?.();
    } catch (err) {
      if (err instanceof GrammyError) {
        const retryAfter = err.parameters?.retry_after;
        if (retryAfter && attempt < 3) {
          await sleep((retryAfter + 1) * 1000);
          return this.#send(job, attempt + 1);
        }
        // Telegram cannot fetch the remote photo -> fall back to a text message
        if (attempt === 0 && item.photoUrl && /wrong file identifier|failed to get http url content|photo/i.test(err.description)) {
          return this.#send({ ...job, item: { ...item, photoUrl: null } }, attempt + 1);
        }
        logger.warn(`send failed chat=${chatId} item=${item.id}: ${err.description}`);
        this.onFailure?.(job, err);
        return;
      }
      logger.error(`send error chat=${chatId} item=${item.id}:`, err);
    }
  }
}
