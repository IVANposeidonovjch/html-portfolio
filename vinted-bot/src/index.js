import { config, overSubscriptionCap, STARS_SUBSCRIPTION_CAP } from './config.js';
import * as store from './db/index.js';
import { createBot } from './bot/index.js';
import { publishCommands } from './bot/commands.js';
import { Sender } from './monitor/sender.js';
import { Monitor } from './monitor/scheduler.js';
import { capacityReport, statsLines } from './monitor/capacity.js';
import { poolStatus } from './vinted/client.js';
import { logger } from './util/logger.js';
import { t } from './i18n/index.js';

if (!config.botToken) {
  console.error('BOT_TOKEN is missing — copy .env.example to .env and fill it in.');
  process.exit(1);
}

const bot = createBot();
const sender = new Sender(bot.api, config.telegram);
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
      ...statsLines(),
      '',
      ...poolStatus().map(
        (p) =>
          `${p.domain} via ${p.proxy}: cookies=${p.cookies} csrf=${p.csrf ? 'да' : 'нет'} ` +
          `cooldown=${p.blockedFor}s | ${p.endpoints}`,
      ),
    ].join('\n'),
  );
});

/** Everyone who gets told when the machinery needs a person. */
const tellAdmins = (text) => {
  for (const id of config.adminIds) bot.api.sendMessage(id, text).catch(() => {});
};

/**
 * Past 90% nobody is reading the log. The admins are told once when it happens
 * and once when it is over, and /stats carries the detail for whoever asks.
 */
monitor.onCapacity = ({ level, report }) => {
  const load = `${report.total.toFixed(2)}/${report.capacity.toFixed(2)} req/s (${Math.round(report.utilization * 100)}%)`;
  const text =
    level === 'alert'
      ? `🚨 Пул прокси загружен на ${Math.round(report.utilization * 100)}%: ${load}.\n` +
        'Новые поиски скоро начнут отклоняться. Добавь прокси в PROXIES или подними PROXY_SAFE_RPS.'
      : `✅ Нагрузка на пул вернулась в норму: ${load}.`;
  tellAdmins(text);
};

/**
 * A proxy bought, or one that needed buying and was not. Both are worth a
 * message: the first is money leaving a small monthly allowance, the second
 * is the pool running short until somebody acts.
 */
monitor.onProxyReplaced = (result) => {
  if (result.status === 'reserve') {
    tellAdmins(
      `⚠️ ${result.wanted} прокси не отвечают, но в этом месяце осталось ` +
        `${result.budget.available} замен — это резерв (REPLACEMENT_ALERT_THRESHOLD=` +
        `${config.webshare.alertThreshold}). Автозамена их не тратит.\n` +
        'Заменить вручную: node tools/webshare.mjs replace --ip <адрес> --to <страна> --go',
    );
    return;
  }
  if (result.replaced.length) {
    const which = result.replaced.map((r) => `#${r.index} (${r.country})`).join(', ');
    tellAdmins(
      `🔁 Заменены мёртвые прокси: ${which}. Осталось замен в этом месяце: ` +
        `${result.budget?.available ?? '?'}.` +
        (result.exiting ? '\nПерезапускаюсь, чтобы подхватить новый пул.' : ''),
    );
  }
};

/** The allowance is small and does not carry over — better early than short. */
monitor.onReplacementBudget = (budget) => {
  const resets = (budget.resetsAt instanceof Date ? budget.resetsAt : new Date(budget.resetsAt))
    .toISOString()
    .slice(0, 10);
  tellAdmins(
    `⚠️ Осталось всего ${budget.available} замен прокси в этом месяце (сброс ${resets}).`,
  );
};

/**
 * A downgrade catching up with somebody's links. They hear it twice: once when
 * the clock starts, with the deadline and what to do, and once if it runs out
 * and the extras are paused for them. A search that stops with no explanation
 * looks like the bot broke.
 */
const hours = (seconds) => Math.max(1, Math.round(seconds / 3600));
monitor.onOverLimit = ({ tgId, lang, limit, active, deadline }) => {
  bot.api
    .sendMessage(
      tgId,
      t(lang || 'en', 'limit.warned', {
        limit,
        active,
        left: t(lang || 'en', 'unit.hour', { n: hours(deadline - store.now()) }),
      }),
    )
    .catch(() => {});
};
monitor.onLimitEnforced = ({ tgId, lang, limit, paused }) => {
  bot.api.sendMessage(tgId, t(lang || 'en', 'limit.enforced', { paused, limit })).catch(() => {});
};

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
  `starting: intervals free=${config.intervals.free}s basic=${config.intervals.basic}s pro=${config.intervals.pro}s ` +
    `turbo=${config.intervals.turbo}s, ${config.vinted.proxies.length || 'no'} proxies, ` +
    `${config.vinted.rps} rps/domain, pool budget ${capacityReport().capacity.toFixed(2)} req/s`,
);

// A subscription tier priced past Telegram's ceiling cannot be sold at all:
// createInvoiceLink refuses the link and the buy button dies in the user's
// hands. Cheaper to hear it at boot than from the first person who taps it.
for (const { plan, stars, usd } of overSubscriptionCap()) {
  logger.error(
    `${plan} is $${usd} = ${stars} ⭐, past Telegram's ${STARS_SUBSCRIPTION_CAP} ⭐ ` +
      'subscription ceiling — that tier cannot be sold until the price comes down.',
  );
}

// Measured 17.09.2026: the catalog answers 403 to datacenter IPs. Without a
// proxy every search will fail, so say it once at boot instead of letting the
// operator read it off a backoff loop an hour later.
if (!config.vinted.proxies.length) {
  logger.warn(
    'PROXIES пуст — каталог Vinted отвечает 403 на запросы с IP дата-центра. ' +
      'Пропиши резидентный прокси в .env, иначе все поиски будут падать.',
  );
}
await publishCommands(bot.api, {
  adminIds: config.adminIds,
  langOf: (id) => store.getUser(id)?.lang || 'en',
});

await bot.start({
  // 'subscription' is not in Telegram's default set: leave it out and renewals,
  // cancellations and failed charges simply never reach the bot.
  allowed_updates: [
    'message',
    'callback_query',
    'pre_checkout_query',
    'my_chat_member',
    'subscription',
  ],
  onStart: (me) => logger.info(`bot @${me.username} online`),
});
