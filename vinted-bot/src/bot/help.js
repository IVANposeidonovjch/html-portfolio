import { LOCALES, t } from '../i18n/index.js';

/**
 * The help screen in two shapes.
 *
 * Without a picture it is one message: the written mockup of an alert sits in
 * the middle of the text, and the buttons hang under it.
 *
 * With a picture it is three, because a photo cannot live inside a message: the
 * text up to the pointer, then the photo where the example belongs, then the
 * rest of the text carrying the buttons. Telegram only shows buttons on the
 * message they are attached to, so the last piece is the one that gets them —
 * otherwise the photo would interrupt the text and the buttons would sit above
 * it.
 */

const template = (lang) => LOCALES[lang]?.['help.text'] ?? LOCALES.en['help.text'];

export const helpText = (lang, withImage = false) =>
  t(lang, 'help.text', { example: t(lang, withImage ? 'help.exampleHint' : 'help.example') });

/** @returns {{intro: string, rest: string}} the text either side of the photo */
export function helpParts(lang) {
  const [before, after] = template(lang).split('{example}');
  return {
    intro: `${before}${t(lang, 'help.exampleHint')}`.trimEnd(),
    rest: (after ?? '').replace(/^\n+/, ''),
  };
}
