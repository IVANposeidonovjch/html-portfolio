import { LOCALES, t } from '../i18n/index.js';
import { logger } from '../util/logger.js';

/**
 * The command menu Telegram shows next to the input field.
 *
 * Three things matter here and none of them are automatic:
 *  - it is per language: Telegram picks the list matching the client's locale,
 *    so a German user sees German descriptions and everyone else falls back to
 *    the default list (English);
 *  - it is per scope: /bind only does something inside a group, and showing it
 *    in a private chat just invites people to run it where it cannot work;
 *  - admin commands are published to the admins' own chats only, so nobody else
 *    is told they exist.
 */

/**
 * Only what is worth typing. Everything else is a button: a slash list of eight
 * entries with no arguments is a menu in the wrong place, and it competes with
 * the inline one. The handlers for the retired commands stay registered, so a
 * user who learned them keeps working — they are simply not advertised.
 */
const PRIVATE = ['start', 'add', 'help'];
const GROUP = ['bind', 'unbind'];
const ADMIN = ['users', 'userinfo', 'stats', 'grant'];

export const buildCommands = (lang, names) =>
  names.map((command) => ({ command, description: t(lang, `cmd.${command}`) }));

/**
 * @param {import('grammy').Api} api
 * @param {object} options
 * @param {number[]} options.adminIds
 * @param {(id: number) => string} options.langOf  language of a given admin
 */
export async function publishCommands(api, { adminIds = [], langOf = () => 'en' } = {}) {
  const calls = [];

  // Default lists (clients whose language we do not translate) plus one per locale.
  for (const lang of [null, ...Object.keys(LOCALES)]) {
    const code = lang ?? 'en';
    const suffix = lang ? { language_code: lang } : {};
    calls.push(
      ['private', api.setMyCommands(buildCommands(code, PRIVATE), { scope: { type: 'all_private_chats' }, ...suffix })],
      ['group', api.setMyCommands(buildCommands(code, GROUP), { scope: { type: 'all_group_chats' }, ...suffix })],
    );
  }

  // Admins get their own list: everything a user has, plus the admin commands.
  for (const id of adminIds) {
    const lang = langOf(id);
    calls.push([
      `admin:${id}`,
      api.setMyCommands(buildCommands(lang, [...PRIVATE, ...ADMIN]), {
        scope: { type: 'chat', chat_id: id },
      }),
    ]);
  }

  const results = await Promise.allSettled(calls.map(([, promise]) => promise));
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? `${calls[i][0]}: ${r.reason?.description || r.reason}` : null))
    .filter(Boolean);

  if (failed.length) logger.warn(`command menu partly not published — ${failed.join('; ')}`);
  else logger.info(`command menu published for ${Object.keys(LOCALES).length} languages, ${adminIds.length} admin(s)`);

  return { published: results.length - failed.length, failed };
}

export const COMMAND_SETS = { PRIVATE, GROUP, ADMIN };
