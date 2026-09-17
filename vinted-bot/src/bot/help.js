import { t } from '../i18n/index.js';

/**
 * The help screen in two shapes.
 *
 * With a picture configured, /help follows the text with a real photo alert, so
 * spelling the same alert out in the text above it would say everything twice —
 * the text points down at the picture instead. Without a picture, the written
 * mockup is all the user gets, so it stays.
 */
export const helpText = (lang, withImage = false) =>
  t(lang, 'help.text', { example: t(lang, withImage ? 'help.exampleHint' : 'help.example') });
