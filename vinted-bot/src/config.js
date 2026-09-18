import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  botToken: process.env.BOT_TOKEN,
  adminIds: list(process.env.ADMIN_IDS).map(Number),
  dbPath: process.env.DB_PATH || './data/bot.sqlite',

  intervals: {
    free: num(process.env.INTERVAL_FREE, 900),
    basic: num(process.env.INTERVAL_BASIC, 300),
    pro: num(process.env.INTERVAL_PRO, 60),
    // turbo is not sold; without its own value it would fall back to free,
    // which would make the top tier the slowest one to poll
    turbo: num(process.env.INTERVAL_TURBO, num(process.env.INTERVAL_PRO, 60)),
  },
  jitterPct: num(process.env.JITTER_PCT, 20),

  limits: {
    free: { searches: num(process.env.LIMIT_FREE_SEARCHES, 3) },
    basic: { searches: num(process.env.LIMIT_BASIC_SEARCHES, 25) },
    pro: { searches: num(process.env.LIMIT_PRO_SEARCHES, 100) },
    turbo: {
      searches: num(process.env.LIMIT_TURBO_SEARCHES, num(process.env.LIMIT_PRO_SEARCHES, 100)),
    },
    chats: num(process.env.LIMIT_CHATS, 20),
  },

  vinted: {
    rps: num(process.env.VINTED_RPS, 1.5),
    perPage: num(process.env.VINTED_PER_PAGE, 40),
    firstRunMaxAgeMin: num(process.env.FIRST_RUN_MAX_AGE_MIN, 0),
    // pin one entry of src/vinted/endpoints.js; empty = detect at runtime
    strategy: process.env.VINTED_API_STRATEGY || '',
    proxies: list(process.env.PROXIES),
    userAgent:
      process.env.USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  },

  // Optional pictures: an https URL, or a path to a local file. Both are only
  // the fallback — whatever the admin last sent the bot wins (see bot/images.js).
  startImage: process.env.START_IMAGE || '',
  helpImage: process.env.HELP_IMAGE || '',

  // Delivery pacing. `telegram` holds what Telegram itself allows — the ceiling
  // nobody may be sold past. `delivery` holds what each plan is allowed to
  // spend of it: how many messages may leave back to back, and (optionally) a
  // slower sustained rate than the chat would otherwise get.
  telegram: {
    globalPerSec: num(process.env.TELEGRAM_GLOBAL_RPS, 25),
    groupPerMinute: num(process.env.TELEGRAM_GROUP_PER_MIN, 20),
    privatePerMinute: num(process.env.TELEGRAM_PRIVATE_PER_MIN, 60),
    burst: num(process.env.TELEGRAM_BURST, 10), // fallback for plans with no value
  },

  delivery: {
    burst: {
      free: num(process.env.BURST_FREE, num(process.env.TELEGRAM_BURST, 10)),
      basic: num(process.env.BURST_BASIC, num(process.env.TELEGRAM_BURST, 10)),
      pro: num(process.env.BURST_PRO, 20),
      turbo: num(process.env.BURST_TURBO, 30),
    },
    // 0 means "whatever the chat type allows"; anything higher is clamped to it,
    // because the sustained rate belongs to Telegram, not to the price list
    perMinute: {
      free: num(process.env.RATE_FREE_PER_MIN, 0),
      basic: num(process.env.RATE_BASIC_PER_MIN, 0),
      pro: num(process.env.RATE_PRO_PER_MIN, 0),
      turbo: num(process.env.RATE_TURBO_PER_MIN, 0),
    },
  },

  dedupePerDestination: bool(process.env.DEDUPE_PER_DESTINATION, true),

  payments: {
    proStars: num(process.env.PRO_PRICE_STARS, 0),
    basicStars: num(process.env.BASIC_PRICE_STARS, 0),
    planDays: num(process.env.PLAN_DAYS, 30),
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};

/** Every plan that exists. `turbo` is never sold — only /grant hands it out. */
export const PLANS = ['free', 'basic', 'pro', 'turbo'];
export const SELLABLE_PLANS = ['basic', 'pro'];

export function intervalFor(plan) {
  return config.intervals[plan] ?? config.intervals.free;
}

export function searchLimitFor(plan) {
  return (config.limits[plan] ?? config.limits.free).searches;
}

/** How many listings this plan may push back to back before pacing starts. */
export function burstFor(plan) {
  return config.delivery.burst[plan] ?? config.telegram.burst;
}

/** 0 = leave the chat's own ceiling alone. */
export function ratePerMinuteFor(plan) {
  return config.delivery.perMinute[plan] ?? 0;
}
