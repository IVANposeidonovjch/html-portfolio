PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  tg_id              INTEGER PRIMARY KEY,
  username           TEXT,
  lang               TEXT    NOT NULL DEFAULT 'en',
  kb_cleared         INTEGER NOT NULL DEFAULT 1,   -- fresh users never saw the old reply keyboard
  extra_links        INTEGER NOT NULL DEFAULT 0,   -- add-on capacity, lost when the plan lapses
  last_fomo_nudge_at INTEGER,
  plan               TEXT    NOT NULL DEFAULT 'locked', -- locked | free | basic | pro | turbo | elite_max
  plan_until         INTEGER,                            -- unix seconds, NULL = never runs out
  sub_charge_id      TEXT,                               -- Star subscription charge id, NULL = one-off purchase
  sub_state          TEXT,                               -- active | canceled | failed, NULL = not a subscription
  limit_grace_until  INTEGER,                            -- deadline to trim links after a downgrade, NULL = not over
  monitoring_enabled INTEGER NOT NULL DEFAULT 1,
  created_at         INTEGER NOT NULL
);

-- Telegram destinations the user bound with /bind (group, supergroup, channel or DM)
CREATE TABLE IF NOT EXISTS chats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(tg_id) ON DELETE CASCADE,
  tg_chat_id INTEGER NOT NULL,
  title      TEXT    NOT NULL,
  type       TEXT    NOT NULL,                            -- private | group | supergroup | channel
  is_forum   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(owner_id, tg_chat_id)
);

-- Forum topics inside a supergroup, learned when /bind is sent inside the topic
CREATE TABLE IF NOT EXISTS topics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  thread_id  INTEGER NOT NULL,
  name       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(chat_id, thread_id)
);

CREATE TABLE IF NOT EXISTS searches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(tg_id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  url           TEXT    NOT NULL,                        -- original Vinted search URL
  domain        TEXT    NOT NULL,                        -- www.vinted.de
  canonical_key TEXT    NOT NULL,                        -- identical searches share one HTTP request
  api_query     TEXT    NOT NULL,                        -- serialized catalog API query
  dest_chat_id  INTEGER NOT NULL,                        -- telegram chat id
  dest_thread_id INTEGER,                                -- forum topic id or NULL
  enabled       INTEGER NOT NULL DEFAULT 1,
  primed        INTEGER NOT NULL DEFAULT 0,              -- 0 = first poll only builds the baseline
  last_item_id  INTEGER NOT NULL DEFAULT 0,
  next_run_at   INTEGER NOT NULL DEFAULT 0,
  last_run_at   INTEGER,
  error_count   INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  sent_count    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_searches_due  ON searches(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id);

-- Per-search dedupe: an item is never re-sent for the same search
CREATE TABLE IF NOT EXISTS seen_items (
  search_id INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  item_id   INTEGER NOT NULL,
  sent_at   INTEGER NOT NULL,
  PRIMARY KEY (search_id, item_id)
);

-- Per-destination dedupe: 10 Raf Simons searches into one topic still send an item once
CREATE TABLE IF NOT EXISTS sent_destinations (
  dest_key TEXT    NOT NULL,                             -- "<chat_id>:<thread_id|0>"
  item_id  INTEGER NOT NULL,
  sent_at  INTEGER NOT NULL,
  PRIMARY KEY (dest_key, item_id)
);

-- /support is a two-way relay: remember which forwarded message belongs to whom
-- so a reply in the support chat finds its way back to the user who wrote in.
CREATE TABLE IF NOT EXISTS support_relays (
  support_msg_id INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);

-- Small key/value store for things the admin sets at runtime (image paths, ...)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Shared fetch cache so identical searches of different users cost one request
CREATE TABLE IF NOT EXISTS poll_cache (
  canonical_key TEXT PRIMARY KEY,
  fetched_at    INTEGER NOT NULL,
  payload       TEXT    NOT NULL
);
