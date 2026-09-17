import { config } from './config.js';
import * as store from './db/index.js';
import { createBot } from './bot/index.js';
import { Sender } from './monitor/sender.js';
import { Monitor } from './monitor/scheduler.js';
import { poolStatus } from './vinted/client.js';
import { logger } from './util/logger.js';

if (!config.botToken) {
  console.error('BOT_TOKEN is missing — copy .env.example to .env and fill it in.');
  process.exit(1);
}

const bot = createBot();
const sender = new Sender(bot.api);
const monitor = new Monitor(sender);

// A dead destination (bot kicked, group deleted, topic closed) pauses its searches
// instead of retrying forever.
sender.onFailure = (job, err) => {
  if (!/chat not found|bot was kicked|bot is not a member|not enough rights|message thread not found|CHAT_WRITE_FORBIDDEN/i.test(err.description)) return;
  const search = store.getSearch.get(job.searchId);
  if (!search) return;
  store.toggleSearch.run(0, search.id, search.user_id);
  bot.api
    .sendMessage(
      search.user_id,
      `⚠️ Поиск «${search.name}» выключен: не могу писать в целевой чат (${err.description}).`,
    )
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
