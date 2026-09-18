import fs from 'node:fs';
import path from 'node:path';
import { InputFile } from 'grammy';
import { request } from 'undici';
import { config } from '../config.js';
import * as store from '../db/index.js';
import { logger } from '../util/logger.js';

/**
 * The two pictures the bot shows: the welcome above /start, and the sample alert
 * in /help.
 *
 * An admin sets them by sending the bot a photo, so the file has to outlive the
 * chat it came from: Telegram file ids are tied to the bot token and to
 * Telegram's own retention, while a deploy may change either. So the photo is
 * downloaded once into the data volume and the path is remembered in the
 * settings table. Env vars stay as a fallback for a fresh install.
 */

export const IMAGE_KINDS = {
  start: 'start_image',
  help: 'help_image',
  // one per tier: the picture that arrives with the congratulation
  tier_basic: 'tier_basic_image',
  tier_pro: 'tier_pro_image',
  tier_turbo: 'tier_turbo_image',
  tier_elite_max: 'tier_elite_max_image',
};

const imagesDir = path.join(path.dirname(path.resolve(config.dbPath)), 'images');

const ENV_FALLBACK = {
  start: () => config.startImage,
  help: () => config.helpImage,
  tier_basic: () => config.tierImages.basic,
  tier_pro: () => config.tierImages.pro,
  tier_turbo: () => config.tierImages.turbo,
  tier_elite_max: () => config.tierImages.elite_max,
};
const envFallback = (kind) => ENV_FALLBACK[kind]?.() || '';

/**
 * What to hand to sendPhoto for this kind, or null when there is nothing to show.
 * A stored path that has gone missing falls back to the env value rather than
 * failing the message.
 */
export function imageFor(kind) {
  if (!IMAGE_KINDS[kind]) return null;
  const stored = store.settings.get(IMAGE_KINDS[kind]);
  if (stored && fs.existsSync(stored)) return new InputFile(stored);
  if (stored) logger.warn(`${kind} image missing on disk: ${stored}`);

  const fallback = envFallback(kind);
  if (!fallback) return null;
  return /^https?:\/\//.test(fallback) ? fallback : new InputFile(fallback);
}

export const hasImage = (kind) => imageFor(kind) !== null;

/** Extension from Telegram's file_path ("photos/file_12.jpg"), jpg by default. */
const extOf = (filePath) => (path.extname(filePath || '').replace('.', '') || 'jpg').toLowerCase();

/** Fetch the bytes of a file Telegram has prepared. Swappable so the adoption
 * path can be tested without reaching the network. */
export async function downloadFile(filePath) {
  const url = `https://api.telegram.org/file/bot${config.botToken}/${filePath}`;
  const res = await request(url, { method: 'GET' });
  if (res.statusCode !== 200) {
    await res.body.dump();
    throw new Error(`Telegram file API answered ${res.statusCode}`);
  }
  return Buffer.from(await res.body.arrayBuffer());
}

/**
 * Download a photo the admin just sent and make it the picture for this kind.
 * @returns {Promise<{path: string, bytes: number}>}
 */
export async function adoptPhoto(api, fileId, kind, { download = downloadFile } = {}) {
  const file = await api.getFile(fileId);
  const bytes = await download(file.file_path);

  fs.mkdirSync(imagesDir, { recursive: true });
  const target = path.join(imagesDir, `${kind}.${extOf(file.file_path)}`);
  // write beside the target and rename, so a failed download cannot leave a
  // half-written picture behind the one that used to work
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, bytes);
  fs.renameSync(temp, target);

  // a previous image with another extension would otherwise linger unused
  for (const stale of fs.readdirSync(imagesDir)) {
    if (stale.startsWith(`${kind}.`) && path.join(imagesDir, stale) !== target) {
      fs.rmSync(path.join(imagesDir, stale), { force: true });
    }
  }

  store.settings.set(IMAGE_KINDS[kind], target);
  logger.info(`${kind} image updated: ${target} (${bytes.length} bytes)`);
  return { path: target, bytes: bytes.length };
}

export function forgetImage(kind) {
  const stored = store.settings.get(IMAGE_KINDS[kind]);
  if (stored) fs.rmSync(stored, { force: true });
  store.settings.clear(IMAGE_KINDS[kind]);
}
