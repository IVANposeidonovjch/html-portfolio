import fs from 'node:fs';
import path from 'node:path';

/**
 * Rewriting one line of a live .env.
 *
 * This runs unattended, on the file that holds the bot token, so it is
 * deliberately dull: read, copy the old file aside, replace exactly one
 * assignment, write through a temporary file and rename. A rename is atomic
 * on the same filesystem, so a crash mid-write leaves the old .env intact
 * rather than half a config.
 *
 * The backup is timestamped and kept. They are small, and the one time you
 * want it is the time it was overwritten by the next attempt.
 */

export function backupPath(file, at = new Date()) {
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  return path.join(path.dirname(file), `${path.basename(file)}.bak-${stamp}`);
}

/** @returns {string|null} the current value of KEY=, or null if it is absent. */
export function readValue(text, key) {
  const line = text.split('\n').find((l) => l.startsWith(`${key}=`));
  return line === undefined ? null : line.slice(key.length + 1);
}

/**
 * Replace `KEY=...` in place, keeping its position and the rest of the file
 * byte for byte. An absent key is appended rather than silently dropped.
 */
export function setValue(text, key, value) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (at < 0) {
    const sep = text.endsWith('\n') || text === '' ? '' : '\n';
    return `${text}${sep}${key}=${value}\n`;
  }
  lines[at] = `${key}=${value}`;
  return lines.join('\n');
}

/**
 * @returns {{ file: string, backup: string, changed: boolean }}
 * `changed: false` means the file already said this, and nothing was touched —
 * no backup, no write, so a no-op run leaves no trace.
 */
export function writeEnvValue(file, key, value, { at = new Date() } = {}) {
  const text = fs.readFileSync(file, 'utf8');
  if (readValue(text, key) === value) return { file, backup: '', changed: false };

  const backup = backupPath(file, at);
  fs.copyFileSync(file, backup);

  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, setValue(text, key, value), { mode: 0o600 });
  fs.renameSync(tmp, file);
  return { file, backup, changed: true };
}
