import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  botToken: process.env.BOT_TOKEN,
  adminIds: list(process.env.ADMIN_IDS).map(Number),
  dbPath: process.env.DB_PATH || './data/bot.sqlite',

  intervals: {
    // the floor: nothing is polled here, so the value only exists to keep
    // intervalFor() from falling through to a tier the account does not hold
    locked: num(process.env.INTERVAL_LOCKED, 900),
    free: num(process.env.INTERVAL_FREE, 900),
    basic: num(process.env.INTERVAL_BASIC, 300),
    pro: num(process.env.INTERVAL_PRO, 60),
    // its own value, not Ranger's: the jump to the top tier is paid for in
    // speed, so it has to be measurably faster rather than the same poll
    turbo: num(process.env.INTERVAL_TURBO, 30),
    // the reserved tier: never slower than the fastest thing on sale
    elite_max: num(process.env.INTERVAL_ELITE_MAX, num(process.env.INTERVAL_TURBO, 30)),
  },
  jitterPct: num(process.env.JITTER_PCT, 20),

  limits: {
    // What an account holds when it has bought nothing, or when what it bought
    // ran out. 0 means it can add nothing and its searches do not run; raise it
    // to hand out a standing allowance without touching any code.
    locked: { searches: num(process.env.LIMIT_LOCKED_SEARCHES, 0) },
    free: { searches: num(process.env.LIMIT_FREE_SEARCHES, 2) },
    basic: { searches: num(process.env.LIMIT_BASIC_SEARCHES, 25) },
    pro: { searches: num(process.env.LIMIT_PRO_SEARCHES, 100) },
    turbo: {
      searches: num(process.env.LIMIT_TURBO_SEARCHES, 300),
    },
    elite_max: {
      searches: num(process.env.LIMIT_ELITE_MAX_SEARCHES, num(process.env.LIMIT_TURBO_SEARCHES, 1000)),
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
    // What each proxy is believed to survive, sustained. One number per entry
    // of PROXIES, in the same order; anything not listed uses the default.
    // Per proxy rather than one constant because a residential pool and a
    // single cheap IP are not safe at the same rate.
    proxyRps: list(process.env.PROXY_SAFE_RPS).map(Number),
    proxyRpsDefault: num(process.env.PROXY_SAFE_RPS_DEFAULT, 0.7),
    userAgent:
      process.env.USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  },

  // Optional pictures: an https URL, or a path to a local file. Both are only
  // the fallback — whatever the admin last sent the bot wins (see bot/images.js).
  startImage: process.env.START_IMAGE || '',
  helpImage: process.env.HELP_IMAGE || '',

  // one picture per tier, named after what users see rather than the key
  tierImages: {
    basic: process.env.TIER_IMAGE_HUNTER || '',
    pro: process.env.TIER_IMAGE_RANGER || '',
    turbo: process.env.TIER_IMAGE_SNIPER || '',
    elite_max: process.env.TIER_IMAGE_ELITE_MAX || '',
  },

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
      // 1 is the strict steady rate — one listing at a time, which is what the
      // unpaid tiers get. Deliberately NOT falling back to TELEGRAM_BURST: that
      // is the ceiling nobody may be sold past, not a free allowance, and
      // inheriting it would hand Scout the same burst Ranger is charged for.
      locked: num(process.env.BURST_LOCKED, 1),
      free: num(process.env.BURST_FREE, 1),
      basic: num(process.env.BURST_BASIC, 1),
      pro: num(process.env.BURST_PRO, 20),
      turbo: num(process.env.BURST_TURBO, 30),
      elite_max: num(process.env.BURST_ELITE_MAX, 50),
    },
    // 0 means "whatever the chat type allows"; anything higher is clamped to it,
    // because the sustained rate belongs to Telegram, not to the price list
    perMinute: {
      free: num(process.env.RATE_FREE_PER_MIN, 0),
      basic: num(process.env.RATE_BASIC_PER_MIN, 0),
      pro: num(process.env.RATE_PRO_PER_MIN, 0),
      turbo: num(process.env.RATE_TURBO_PER_MIN, 0),
      elite_max: num(process.env.RATE_ELITE_MAX_PER_MIN, 0),
    },
  },

  dedupePerDestination: bool(process.env.DEDUPE_PER_DESTINATION, true),

  // How close to the pool's safe rate we let things get before saying so, and
  // how often the same standing alarm is repeated.
  capacity: {
    warnAt: num(process.env.CAPACITY_WARN_PCT, 80) / 100,
    alertAt: num(process.env.CAPACITY_ALERT_PCT, 90) / 100,
    checkEverySec: num(process.env.CAPACITY_CHECK_SEC, 60),
    repeatAfterSec: num(process.env.CAPACITY_REPEAT_MIN, 60) * 60,
  },

  /**
   * How many accounts may hold a tier at once. 0 = uncapped. Named after what
   * users see, like the tier pictures, because that is how the cap is talked
   * about — "Sniper Elite has ten spots", not "turbo has ten spots".
   */
  seats: {
    basic: num(process.env.MAX_HUNTER_SEATS, 0),
    pro: num(process.env.MAX_RANGER_SEATS, 0),
    turbo: num(process.env.MAX_SNIPER_ELITE_SEATS, 10),
    elite_max: num(process.env.MAX_ELITE_MAX_SEATS, 0),
  },

  payments: {
    // Stars charged per plan, and the dollar figure shown in the comparison.
    // Scout is the way in: a real purchase, priced like a coffee, that runs out
    // in a day. Everything else is sold by the month.
    stars: {
      free: num(process.env.SCOUT_PRICE_STARS, 77),
      basic: num(process.env.BASIC_PRICE_STARS, 0),
      pro: num(process.env.PRO_PRICE_STARS, 0),
      turbo: num(process.env.TURBO_PRICE_STARS, 0),
    },
    usd: {
      free: num(process.env.PRICE_USD_FREE, 1),
      basic: num(process.env.PRICE_USD_BASIC, 9),
      pro: num(process.env.PRICE_USD_PRO, 19),
      turbo: num(process.env.PRICE_USD_TURBO, 79),
    },
    planDays: num(process.env.PLAN_DAYS, 30),

    /**
     * Real Telegram Star subscriptions: Telegram re-charges the balance itself
     * every period and tells us about it, instead of the user having to come
     * back and buy the same thing again.
     *
     * `periodSec` is not ours to pick — the Bot API accepts exactly 2592000 on
     * createInvoiceLink and rejects anything else, which is also why Scout
     * cannot be one: a seven-day trial is not a thirty-day subscription.
     *
     * `graceHours` is what a failed renewal buys. A cancelled subscription
     * needs none — it was paid to its date and simply stops there — but a
     * renewal that failed on an empty Star balance is somebody who meant to
     * pay, so they keep the plan while they top up.
     */
    subscriptions: {
      periodSec: 2592000,
      graceHours: num(process.env.SUB_GRACE_HOURS, 48),
    },
    // A week. Still expressed in hours so a shorter window stays configurable —
    // what the screens call it is derived from this, never hardcoded.
    trialHours: num(process.env.SCOUT_TRIAL_HOURS, 168),

    // Extra links, bought on top of any paid plan and lost when it lapses.
    addon: {
      links: num(process.env.ADDON_LINKS, 10),
      stars: num(process.env.ADDON_PRICE_STARS, 0),
      usd: num(process.env.ADDON_PRICE_USD, 2),
    },
  },

  // Someone who answers /support. 0 disables the button entirely.
  supportId: num(process.env.SUPPORT_TG_ID, 0),

  // The near-miss note: how old a listing has to be on arrival before a
  // slower plan is told what it cost them, and how rarely to mention it.
  fomo: {
    afterSeconds: num(process.env.FOMO_AFTER_SECONDS, 30),
    everyHours: num(process.env.FOMO_EVERY_HOURS, 24),
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};

/**
 * Every plan that exists, least first. Internal keys stay as they were so
 * stored rows keep their meaning; the names people see live in the locales.
 *
 * `locked` is the floor, and it is not a tier anybody is sold: it is what an
 * account holds before it has bought anything and what every plan falls back to
 * when its paid time runs out. `free` is no longer free — it is Scout, the
 * 24-hour way in — so something had to sit underneath it, or an expiring Scout
 * would lapse straight back into itself and never expire at all.
 *
 * `elite_max` is the reserved one: no price, no button, /grant only.
 */
export const LOCKED_PLAN = 'locked';
export const PLANS = ['locked', 'free', 'basic', 'pro', 'turbo', 'elite_max'];
export const SELLABLE_PLANS = ['free', 'basic', 'pro', 'turbo'];
export const PUBLIC_PLANS = [...SELLABLE_PLANS];
export const isHiddenPlan = (plan) => !PUBLIC_PLANS.includes(plan);

/** Everything a paid plan grants is gone here, so nothing is polled either. */
export const isLocked = (plan) => plan === LOCKED_PLAN;

/**
 * Which tiers are sold as recurring subscriptions. Scout is not one: a Star
 * subscription is fixed at thirty days and Scout is a seven-day trial, so it
 * stays a single invoice that simply runs out.
 */
export const SUBSCRIPTION_PLANS = SELLABLE_PLANS.filter((plan) => plan !== 'free');
export const isSubscriptionPlan = (plan) => SUBSCRIPTION_PLANS.includes(plan);

/** Plans that see listings fast enough that a near-miss note would be a lie. */
export const INSTANT_PLANS = ['turbo', 'elite_max'];

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

/**
 * How long one purchase of this plan lasts. Scout is a week; everything above
 * it is a month.
 */
export function planDurationSec(plan) {
  if (plan === 'free') return config.payments.trialHours * 3600;
  return config.payments.planDays * 86400;
}

/**
 * Which shape the trial window is, so the screens can name it honestly rather
 * than hardcoding "week" next to a setting that no longer says a week.
 * @returns {{ kind: 'week'|'days'|'hours', n: number }}
 */
export function trialWindow() {
  const hours = config.payments.trialHours;
  if (hours === 168) return { kind: 'week', n: 1 };
  if (hours % 24 === 0) return { kind: 'days', n: hours / 24 };
  return { kind: 'hours', n: hours };
}

/** How many accounts may hold this tier at once. 0 = as many as show up. */
export function seatCapFor(plan) {
  return config.seats[plan] ?? 0;
}

/** Which setting to raise when a tier runs out of spots, for the admin's sake. */
export const SEAT_ENV_VAR = {
  basic: 'MAX_HUNTER_SEATS',
  pro: 'MAX_RANGER_SEATS',
  turbo: 'MAX_SNIPER_ELITE_SEATS',
  elite_max: 'MAX_ELITE_MAX_SEATS',
};

export const starsFor = (plan) => config.payments.stars[plan] ?? 0;
export const usdFor = (plan) => config.payments.usd[plan] ?? 0;

/** 0 = leave the chat's own ceiling alone. */
export function ratePerMinuteFor(plan) {
  return config.delivery.perMinute[plan] ?? 0;
}
