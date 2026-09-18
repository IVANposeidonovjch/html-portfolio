import { ru } from './locales/ru.js';
import { en } from './locales/en.js';
import { de } from './locales/de.js';
import { uk } from './locales/uk.js';

/**
 * Every user-visible string lives in a locale file, addressed by key. English is
 * the fallback: a key missing from a translation falls back to `en` rather than
 * showing the raw key to a user.
 */
export const LOCALES = { en, ru, de, uk };

export const LANGS = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'de', label: '🇩🇪 Deutsch' },
  { code: 'uk', label: '🇺🇦 Українська' },
  { code: 'ru', label: '🇷🇺 Русский' },
];

export const isLang = (code) => Object.hasOwn(LOCALES, code);

/** Telegram's language_code ("de-DE", "ru") -> a locale we actually have. */
export function resolveLang(telegramCode) {
  const short = String(telegramCode || '').split('-')[0].toLowerCase();
  return isLang(short) ? short : 'en';
}

/**
 * t('ru', 'add.created', { name: 'Raf', seconds: 60 })
 * Placeholders are {name} — missing ones are left alone so a typo is visible
 * in testing rather than silently rendering "undefined".
 */
export function t(lang, key, vars = {}) {
  const dict = LOCALES[lang] || LOCALES.en;
  const template = dict[key] ?? LOCALES.en[key];
  if (template === undefined) return key;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}

/** Russian and Ukrainian pick a different word for 1, 2-4 and the rest. */
const SLAVIC = new Set(['ru', 'uk']);
function pluralKey(lang, n) {
  if (!SLAVIC.has(lang)) return n === 1 ? 'unit.min.one' : 'unit.min.many';
  const tens = n % 100;
  if (n % 10 === 1 && tens !== 11) return 'unit.min.one';
  if (n % 10 >= 2 && n % 10 <= 4 && (tens < 12 || tens > 14)) return 'unit.min.few';
  return 'unit.min.many';
}

/**
 * An interval as a person would say it. "every 300 s" is a config value read
 * aloud; "every 5 minutes" is what it means. Minutes only when the number
 * divides cleanly and is worth converting — a minute stays "60 s", which is how
 * a one-minute poll is actually spoken about.
 */
export function formatEvery(lang, seconds) {
  const minutes = seconds / 60;
  if (seconds <= 60 || !Number.isInteger(minutes)) return t(lang, 'unit.sec', { n: seconds });
  return t(lang, pluralKey(lang, minutes), { n: minutes });
}

/** Every translation of one key — used to match menu buttons in any language. */
export const allLabels = (key) => [
  ...new Set(Object.values(LOCALES).map((d) => d[key]).filter(Boolean)),
];
