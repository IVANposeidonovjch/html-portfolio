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
  { code: 'ru', label: '🇷🇺 Русский' },
  { code: 'de', label: '🇩🇪 Deutsch' },
  { code: 'uk', label: '🇺🇦 Українська' },
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

/** Every translation of one key — used to match menu buttons in any language. */
export const allLabels = (key) => [
  ...new Set(Object.values(LOCALES).map((d) => d[key]).filter(Boolean)),
];
