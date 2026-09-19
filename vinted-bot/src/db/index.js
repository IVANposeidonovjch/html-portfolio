import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });
export const db = new Database(path.resolve(config.dbPath));
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));

// Migrations for databases created before a column existed. SQLite has no
// "ADD COLUMN IF NOT EXISTS", so ask the table what it already has.
for (const [table, column, ddl] of [
  ['users', 'lang', "TEXT NOT NULL DEFAULT 'en'"],
  // 0 for rows that already existed: those clients still show the old
  // persistent keyboard, and it has to be taken away from them once.
  ['users', 'kb_cleared', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'extra_links', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'last_fomo_nudge_at', 'INTEGER'],
  // A live Star subscription: the charge id is what cancels it, the state is
  // what Telegram last told us about it. NULL on both means this plan was a
  // one-off purchase — every plan bought before subscriptions existed, and
  // every Scout trial — which is exactly how those keep working untouched.
  ['users', 'sub_charge_id', 'TEXT'],
  ['users', 'sub_state', 'TEXT'],
  // when the clock on "trim your links or the extras pause" runs out
  ['users', 'limit_grace_until', 'INTEGER'],
]) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

export const now = () => Math.floor(Date.now() / 1000);

/**
 * One-time: 'free' used to mean a permanent tier that cost nothing. It is now
 * Scout, a purchase that runs out in a day, so the accounts that were parked on
 * it forever move to the floor — otherwise they would keep a tier that is on
 * sale, for free, for good.
 *
 * Only rows with no expiry are touched: a row with a plan_until was bought and
 * is the lazy-expiry path's business, not this one. Marked done in `settings`
 * so a restart cannot demote somebody who has since paid.
 */
{
  const done = db.prepare("SELECT value FROM settings WHERE key = 'migrated_free_floor'").get();
  if (!done) {
    const moved = db
      .prepare("UPDATE users SET plan = 'locked' WHERE plan = 'free' AND plan_until IS NULL")
      .run();
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'migrated_free_floor',
      String(moved.changes),
      now(),
    );
    if (moved.changes) console.log(`[db] ${moved.changes} free-forever account(s) moved to the floor`);
  }
}

/* ------------------------------- users -------------------------------- */

// The plan is written out rather than left to the column default: an existing
// database still carries DEFAULT 'free' from before Scout was sold, and a new
// account must land on the floor on every database, not only a fresh one.
const insertUser = db.prepare(
  `INSERT INTO users (tg_id, username, lang, kb_cleared, plan, created_at)
   VALUES (?, ?, ?, 1, 'locked', ?)
   ON CONFLICT(tg_id) DO UPDATE SET username = excluded.username`,
);
const selectUser = db.prepare('SELECT * FROM users WHERE tg_id = ?');
const lapsePlan = db.prepare(
  `UPDATE users SET plan = 'locked', plan_until = NULL, extra_links = 0,
                    sub_charge_id = NULL, sub_state = NULL, limit_grace_until = NULL
   WHERE tg_id = ?`,
);

/**
 * Read a user, retiring a plan whose paid period has run out.
 *
 * Doing it lazily on read keeps one definition of "what this account is right
 * now" — and it is also where bought extra links go, since they are sold on top
 * of a plan and cannot outlive it.
 */
function readUser(tgId) {
  const user = selectUser.get(tgId);
  if (!user) return user;
  const lapsed = user.plan_until && user.plan_until < now();
  if (lapsed && (user.plan !== 'locked' || user.extra_links)) {
    lapsePlan.run(tgId);
    return selectUser.get(tgId);
  }
  return user;
}

const grantStarter = db.prepare(
  "UPDATE users SET plan = 'starter', plan_until = ? WHERE tg_id = ?",
);

/**
 * First contact hands out the starter day: no signup step, no payment, gone by
 * itself a day later unless something was bought in the meantime.
 *
 * Deliberately only on the insert. An account that already exists has either
 * had its day or had a plan that ran out, and re-granting on every /start
 * would be a free tier on a loop rather than a day to try the thing.
 */
export function upsertUser(tgId, username, lang = 'en') {
  const existed = !!selectUser.get(tgId);
  insertUser.run(tgId, username || null, lang, now());
  if (!existed) grantStarter.run(now() + config.payments.starterHours * 3600, tgId);
  return readUser(tgId);
}

export const setLang = db.prepare('UPDATE users SET lang = ? WHERE tg_id = ?');
export const markKbCleared = db.prepare('UPDATE users SET kb_cleared = 1 WHERE tg_id = ?');
export const getUser = (tgId) => readUser(tgId);

export function effectivePlan(user) {
  if (!user) return 'locked';
  if (user.plan === 'locked') return 'locked';
  // Scout included: everything is bought now, so everything can run out
  if (user.plan_until && user.plan_until < now()) return 'locked';
  return user.plan;
}

export const setPlan = db.prepare('UPDATE users SET plan = ?, plan_until = ? WHERE tg_id = ?');

/* --------------------------- star subscriptions ------------------------- */

/**
 * A subscription payment landed — the first one or a renewal. Telegram's own
 * `subscription_expiration_date` is the authority on when it next runs out, so
 * it is written straight in rather than computed from a period we guessed.
 *
 * MAX() is a guard, not decoration: a legacy plan can still have months left
 * on it, and subscribing must never hand somebody less access than they had.
 */
export const applySubscriptionPayment = db.prepare(
  `UPDATE users SET plan = ?, plan_until = MAX(COALESCE(plan_until, 0), ?),
                    sub_charge_id = ?, sub_state = 'active'
   WHERE tg_id = ?`,
);

/** Telegram told us the subscription changed state; the paid date is untouched. */
export const setSubState = db.prepare('UPDATE users SET sub_state = ? WHERE tg_id = ?');

/**
 * A renewal failed on an empty Star balance. Keep the plan alive for the grace
 * window so there is time to top up — never shortening what was already paid.
 */
export const graceSubscription = db.prepare(
  "UPDATE users SET sub_state = 'failed', plan_until = MAX(COALESCE(plan_until, 0), ?) WHERE tg_id = ?",
);

/** Add-ons are tied to the plan that was active when they were bought. */
export const addExtraLinks = db.prepare(
  'UPDATE users SET extra_links = extra_links + ? WHERE tg_id = ?',
);
export const resetExtraLinks = db.prepare('UPDATE users SET extra_links = 0 WHERE tg_id = ?');
export const markFomoNudge = db.prepare('UPDATE users SET last_fomo_nudge_at = ? WHERE tg_id = ?');
export const setMonitoring = db.prepare('UPDATE users SET monitoring_enabled = ? WHERE tg_id = ?');

/* ------------------------------- chats -------------------------------- */

export const upsertChat = db.prepare(
  `INSERT INTO chats (owner_id, tg_chat_id, title, type, is_forum, created_at)
   VALUES (@owner_id, @tg_chat_id, @title, @type, @is_forum, @created_at)
   ON CONFLICT(owner_id, tg_chat_id)
   DO UPDATE SET title = excluded.title, is_forum = excluded.is_forum`,
);
export const listChats = db.prepare(
  'SELECT * FROM chats WHERE owner_id = ? ORDER BY type = \'private\' DESC, id',
);
export const getChat = db.prepare('SELECT * FROM chats WHERE id = ? AND owner_id = ?');
export const getChatByTgId = db.prepare('SELECT * FROM chats WHERE owner_id = ? AND tg_chat_id = ?');
export const deleteChat = db.prepare('DELETE FROM chats WHERE id = ? AND owner_id = ?');
export const chatOwners = db.prepare('SELECT owner_id, title FROM chats WHERE tg_chat_id = ?');

/**
 * A group that turns into a supergroup gets a brand new chat id, and every send
 * to the old one fails forever. Move the chat and everything pointing at it in
 * one transaction.
 */
export const migrateChat = db.transaction((oldId, newId) => {
  db.prepare('UPDATE OR IGNORE chats SET tg_chat_id = ? WHERE tg_chat_id = ?').run(newId, oldId);
  const moved = db.prepare('UPDATE searches SET dest_chat_id = ? WHERE dest_chat_id = ?').run(newId, oldId);
  db.prepare('DELETE FROM chats WHERE tg_chat_id = ?').run(oldId);
  return moved.changes;
});

export const upsertTopic = db.prepare(
  `INSERT INTO topics (chat_id, thread_id, name, created_at) VALUES (?, ?, ?, ?)
   ON CONFLICT(chat_id, thread_id) DO UPDATE SET name = excluded.name`,
);
export const listTopics = db.prepare('SELECT * FROM topics WHERE chat_id = ? ORDER BY id');
export const getTopic = db.prepare('SELECT * FROM topics WHERE id = ?');

/* ------------------------------ searches ------------------------------ */

export const insertSearch = db.prepare(
  `INSERT INTO searches (user_id, name, url, domain, canonical_key, api_query,
                         dest_chat_id, dest_thread_id, next_run_at, created_at)
   VALUES (@user_id, @name, @url, @domain, @canonical_key, @api_query,
           @dest_chat_id, @dest_thread_id, @next_run_at, @created_at)`,
);
export const listSearches = db.prepare('SELECT * FROM searches WHERE user_id = ? ORDER BY id');
export const getSearch = db.prepare('SELECT * FROM searches WHERE id = ?');
export const countSearches = db.prepare(
  'SELECT COUNT(*) AS n FROM searches WHERE user_id = ?',
);
export const deleteSearch = db.prepare('DELETE FROM searches WHERE id = ? AND user_id = ?');
export const toggleSearch = db.prepare(
  'UPDATE searches SET enabled = ? WHERE id = ? AND user_id = ?',
);
export const renameSearch = db.prepare('UPDATE searches SET name = ? WHERE id = ? AND user_id = ?');
export const redirectSearch = db.prepare(
  'UPDATE searches SET dest_chat_id = ?, dest_thread_id = ? WHERE id = ? AND user_id = ?',
);

/**
 * What to poll now. An account that holds nothing is polled for nothing: the
 * floor and a plan whose paid time has run out are both excluded here rather
 * than only at read time, so searches stop the moment the clock passes even if
 * their owner never opens the bot again — and start again by themselves the
 * moment a plan is bought.
 */
export const dueSearches = db.prepare(
  `SELECT s.* FROM searches s
   JOIN users u ON u.tg_id = s.user_id
   WHERE s.enabled = 1 AND u.monitoring_enabled = 1 AND s.next_run_at <= ?
     AND u.plan <> 'locked'
     AND (u.plan_until IS NULL OR u.plan_until > ?)
   ORDER BY s.next_run_at
   LIMIT ?`,
);
export const scheduleNext = db.prepare('UPDATE searches SET next_run_at = ? WHERE id = ?');
export const markRun = db.prepare(
  `UPDATE searches SET last_run_at = ?, next_run_at = ?, error_count = 0, last_error = NULL,
                       primed = 1, last_item_id = MAX(last_item_id, ?)
   WHERE id = ?`,
);
export const markError = db.prepare(
  `UPDATE searches SET last_run_at = ?, next_run_at = ?, error_count = error_count + 1,
                       last_error = ? WHERE id = ?`,
);
export const bumpSent = db.prepare('UPDATE searches SET sent_count = sent_count + ? WHERE id = ?');

/**
 * Every poll the proxy pool is currently committed to, with the plan that
 * paces it. One row per active search — identical searches are collapsed by
 * canonical key where the load is computed, since they share one fetch.
 */
export const activePolls = db.prepare(
  `SELECT s.domain, s.canonical_key, u.plan, u.plan_until
   FROM searches s
   JOIN users u ON u.tg_id = s.user_id
   WHERE s.enabled = 1 AND u.monitoring_enabled = 1`,
);

/* ------------------------------- dedupe ------------------------------- */

const insertSeen = db.prepare(
  'INSERT OR IGNORE INTO seen_items (search_id, item_id, sent_at) VALUES (?, ?, ?)',
);
const hasSeen = db.prepare('SELECT 1 FROM seen_items WHERE search_id = ? AND item_id = ?');
const insertDest = db.prepare(
  'INSERT OR IGNORE INTO sent_destinations (dest_key, item_id, sent_at) VALUES (?, ?, ?)',
);
const hasDest = db.prepare('SELECT 1 FROM sent_destinations WHERE dest_key = ? AND item_id = ?');

export const seen = {
  has: (searchId, itemId) => !!hasSeen.get(searchId, itemId),
  add: (searchId, itemId) => insertSeen.run(searchId, itemId, now()),
  addMany: db.transaction((searchId, ids) => {
    const t = now();
    for (const id of ids) insertSeen.run(searchId, id, t);
  }),
  destHas: (destKey, itemId) => !!hasDest.get(destKey, itemId),
  destAdd: (destKey, itemId) => insertDest.run(destKey, itemId, now()),
};

export const destKey = (chatId, threadId) => `${chatId}:${threadId || 0}`;

/* -------------------------------- cache ------------------------------- */

const getCache = db.prepare('SELECT * FROM poll_cache WHERE canonical_key = ?');
const putCache = db.prepare(
  `INSERT INTO poll_cache (canonical_key, fetched_at, payload) VALUES (?, ?, ?)
   ON CONFLICT(canonical_key) DO UPDATE SET fetched_at = excluded.fetched_at,
                                            payload = excluded.payload`,
);
export const cache = {
  get(key, maxAgeSec) {
    const row = getCache.get(key);
    if (!row || now() - row.fetched_at > maxAgeSec) return null;
    return JSON.parse(row.payload);
  },
  set: (key, items) => putCache.run(key, now(), JSON.stringify(items)),
};

/* ------------------------------- support ------------------------------ */

const insertRelay = db.prepare(
  'INSERT OR REPLACE INTO support_relays (support_msg_id, user_id, created_at) VALUES (?, ?, ?)',
);
const selectRelay = db.prepare('SELECT user_id FROM support_relays WHERE support_msg_id = ?');

export const support = {
  remember: (supportMsgId, userId) => insertRelay.run(supportMsgId, userId, now()),
  userFor: (supportMsgId) => selectRelay.get(supportMsgId)?.user_id ?? null,
};

/* ------------------------------- settings ----------------------------- */

const selectSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const upsertSetting = db.prepare(
  `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
);
const dropSetting = db.prepare('DELETE FROM settings WHERE key = ?');

export const settings = {
  get: (key) => selectSetting.get(key)?.value ?? null,
  set: (key, value) => upsertSetting.run(key, value, now()),
  clear: (key) => dropSetting.run(key),
};

/* -------------------------------- admin ------------------------------- */

/** One row per user with their search counters, for the admin overview. */
export const listAllUsers = db.prepare(
  `SELECT u.tg_id, u.username, u.plan, u.plan_until, u.lang, u.monitoring_enabled, u.created_at,
          COUNT(s.id)                   AS total,
          COALESCE(SUM(s.enabled), 0)   AS active,
          COALESCE(SUM(s.sent_count), 0) AS sent
   FROM users u
   LEFT JOIN searches s ON s.user_id = u.tg_id
   GROUP BY u.tg_id
   ORDER BY active DESC, sent DESC, u.created_at`,
);

/* ------------------------ over-limit enforcement ------------------------ */

/**
 * Everyone holding at least one active search, with what they hold it on.
 * The sweep compares that against the limit their current plan allows — which
 * lives in config, not in SQL — so the shape of the plan ladder stays in one
 * place instead of being half-encoded in a query.
 */
export const activeSearchCounts = db.prepare(
  `SELECT u.tg_id, u.plan, u.plan_until, u.extra_links, u.lang, u.limit_grace_until,
          COUNT(s.id) AS active
   FROM users u
   JOIN searches s ON s.user_id = u.tg_id AND s.enabled = 1
   GROUP BY u.tg_id`,
);

export const setLimitGrace = db.prepare('UPDATE users SET limit_grace_until = ? WHERE tg_id = ?');

/**
 * Pause everything past the allowance, oldest kept. The ones added first are
 * the ones somebody has been living with longest, so the newest extras are
 * what goes quiet — and nothing is deleted, only switched off, so trimming by
 * hand afterwards is still their choice to make.
 */
export const pauseExcessSearches = db.prepare(
  `UPDATE searches SET enabled = 0
   WHERE user_id = ? AND enabled = 1
     AND id NOT IN (SELECT id FROM searches WHERE user_id = ? AND enabled = 1 ORDER BY id LIMIT ?)`,
);

/** Accounts holding a plan whose paid period has not run out — one seat each. */
export const countPlanHolders = db.prepare(
  'SELECT COUNT(*) AS n FROM users WHERE plan = ? AND (plan_until IS NULL OR plan_until > ?)',
);

/* -------------------------------- stats ------------------------------- */

export const stats = () => ({
  users: db.prepare('SELECT COUNT(*) n FROM users').get().n,
  searches: db.prepare('SELECT COUNT(*) n FROM searches').get().n,
  active: db.prepare('SELECT COUNT(*) n FROM searches WHERE enabled = 1').get().n,
  uniqueKeys: db.prepare('SELECT COUNT(DISTINCT canonical_key) n FROM searches WHERE enabled = 1').get().n,
  sent: db.prepare('SELECT COALESCE(SUM(sent_count),0) n FROM searches').get().n,
});

/** Housekeeping: drop dedupe rows older than 30 days, they cannot be re-fetched anyway. */
export function pruneOldRows() {
  const cutoff = now() - 30 * 24 * 3600;
  db.prepare('DELETE FROM seen_items WHERE sent_at < ?').run(cutoff);
  db.prepare('DELETE FROM sent_destinations WHERE sent_at < ?').run(cutoff);
}
