import { config } from './config.js';
import * as store from './db/index.js';
import { createBot } from './bot/index.js';
import { Sender } from './monitor/sender.js';
import { Monitor } from './monitor/scheduler.js';
import { poolStatus } from './vinted/client.js';
import { logger } from './util/logger.js';
import { t } from './i18n/index.js';

if (!config.botToken) {
  console.error('BOT_TOKEN is missing — copy .env.example to .env and fill it in.');
  process.exit(1);
}

const bot = createBot();
const sender = new Sender(bot.api);
const monitor = new Monitor(sender);

sender.onFailure = (job, err) => {
  // A group that became a supergroup while the bot was away: Telegram puts the
  // new chat id in the error itself, so move the searches and deliver the
  // listing that just failed, instead of disabling anything.
  const newChatId = err.parameters?.migrate_to_chat_id;
  if (newChatId && !job.migrated) {
    const owners = store.chatOwners.all(job.chatId);
    const moved = store.migrateChat(job.chatId, newChatId);
    logger.info(`chat migrated on send ${job.chatId} -> ${newChatId}, ${moved} search(es) moved`);
    for (const { owner_id, title } of owners) {
      const lang = store.getUser(owner_id)?.lang || 'en';
      bot.api.sendMessage(owner_id, t(lang, 'migrate.done', { title, count: moved })).catch(() => {});
    }
    sender.enqueue({ ...job, chatId: newChatId, migrated: true });
    return;
  }

  // A destination that is simply gone (kicked, deleted, topic closed) pauses its
  // searches instead of retrying forever.
  if (!/chat not found|bot was kicked|bot is not a member|not enough rights|message thread not found|CHAT_WRITE_FORBIDDEN/i.test(err.description)) return;
  const search = store.getSearch.get(job.searchId);
  if (!search) return;
  store.toggleSearch.run(0, search.id, search.user_id);
  const lang = store.getUser(search.user_id)?.lang || 'en';
  bot.api
    .sendMessage(search.user_id, t(lang, 'send.searchDisabled', { name: search.name, error: err.description }))
    .catch(() => {});
};

// admin diagnostics, registered here because it needs the live monitor
bot.chatType('private').command('stats', async (ctx) => {
  if (!config.adminIds.includes(ctx.from.id)) return;
  const s = store.stats();
  const r = monitor.runtimeStats();
  await ctx.reply(
    [
      `Пользователей: ${s.users}`,
      `Поисков: ${s.searches} (активных ${s.active}, уникальных запросов ${s.uniqueKeys})`,
      `Отправлено объявлений: ${s.sent}`,
      `Циклов: ${r.cycles} · HTTP-запросов к Vinted: ${r.fetches} · в очереди отправки: ${r.queue}`,
      '',
      ...poolStatus().map(
        (p) =>
          `${p.domain} via ${p.proxy}: cookies=${p.cookies} csrf=${p.csrf ? 'да' : 'нет'} ` +
          `cooldown=${p.blockedFor}s | ${p.endpoints}`,
      ),
    ].join('\n'),
  );
});

monitor.start();

const stop = async (signal) => {
  logger.info(`${signal} received, shutting down`);
  monitor.stop();
  await bot.stop();
  process.exit(0);
};
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));

logger.info(
  `starting: intervals free=${config.intervals.free}s basic=${config.intervals.basic}s pro=${config.intervals.pro}s, ` +
    `${config.vinted.proxies.length || 'no'} proxies, ${config.vinted.rps} rps/domain`,
);

// Measured 17.09.2026: the catalog answers 403 to datacenter IPs. Without a
// proxy every search will fail, so say it once at boot instead of letting the
// operator read it off a backoff loop an hour later.
if (!config.vinted.proxies.length) {
  logger.warn(
    'PROXIES пуст — каталог Vinted отвечает 403 на запросы с IP дата-центра. ' +
      'Пропиши резидентный прокси в .env, иначе все поиски будут падать.',
  );
}

await bot.start({
  allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'my_chat_member'],
  onStart: (me) => logger.info(`bot @${me.username} online`),
});
