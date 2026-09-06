import { Bot, GrammyError, InlineKeyboard } from 'grammy';
import { config, intervalFor, searchLimitFor } from '../config.js';
import * as store from '../db/index.js';
import { logger } from '../util/logger.js';
import { InvalidVintedUrl, parseSearchUrl } from '../vinted/url.js';
import {
  BTN, cancelKb, chatsKb, confirmDeleteKb, destinationKb, mainMenu, searchKb, searchListKb, topicKb,
} from './keyboards.js';
import { ASK_DEST, ASK_NAME, ASK_URL, HELP } from './texts.js';

/** Short-lived per-user wizard state (add-link / rename flows). */
const flows = new Map();
const setFlow = (id, v) => flows.set(id, { ...v, at: Date.now() });
const getFlow = (id) => {
  const f = flows.get(id);
  if (f && Date.now() - f.at > 15 * 60_000) {
    flows.delete(id);
    return null;
  }
  return f;
};

const isAdmin = (id) => config.adminIds.includes(id);
const planLabel = { free: 'Free', basic: 'Basic', pro: 'Pro ⚡' };

function topicsByChat(chats) {
  const map = new Map();
  for (const c of chats) map.set(c.id, store.listTopics.all(c.id));
  return map;
}

function destinationTitle(search, ownerId) {
  if (search.dest_chat_id === ownerId) return 'личка';
  const chat = store.getChatByTgId.get(ownerId, search.dest_chat_id);
  const base = chat?.title || `chat ${search.dest_chat_id}`;
  if (!search.dest_thread_id) return base;
  const topic = chat
    ? store.listTopics.all(chat.id).find((t) => t.thread_id === search.dest_thread_id)
    : null;
  return `${base} → ${topic?.name || `тема #${search.dest_thread_id}`}`;
}

export function createBot() {
  const bot = new Bot(config.botToken);

  /* ---------------------------- private: start --------------------------- */

  bot.chatType('private').command('start', async (ctx) => {
    store.upsertUser(ctx.from.id, ctx.from.username);
    store.upsertChat.run({
      owner_id: ctx.from.id,
      tg_chat_id: ctx.chat.id,
      title: 'Личные сообщения',
      type: 'private',
      is_forum: 0,
      created_at: store.now(),
    });
    await ctx.reply(HELP, { parse_mode: 'HTML', reply_markup: mainMenu });
  });

  bot.chatType('private').command('help', (ctx) =>
    ctx.reply(HELP, { parse_mode: 'HTML', reply_markup: mainMenu }),
  );

  /* ------------------------- groups: /bind, /unbind ---------------------- */

  bot.command('bind', async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('Команду /bind нужно писать <b>внутри группы</b> (или в нужной теме группы), куда бот уже добавлен.', { parse_mode: 'HTML' });
    }
    const user = store.upsertUser(ctx.from.id, ctx.from.username);
    try {
      const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
      if (!['creator', 'administrator'].includes(member.status)) {
        return ctx.reply('Привязать чат может только его администратор.');
      }
    } catch {
      /* private groups can hide membership — fall through */
    }

    const existing = store.listChats.all(user.tg_id).filter((c) => c.type !== 'private');
    const already = store.getChatByTgId.get(user.tg_id, ctx.chat.id);
    if (!already && existing.length >= config.limits.chats) {
      return ctx.reply(`Лимит чатов: ${config.limits.chats}.`);
    }

    store.upsertChat.run({
      owner_id: user.tg_id,
      tg_chat_id: ctx.chat.id,
      title: ctx.chat.title || 'Группа',
      type: ctx.chat.type,
      is_forum: ctx.chat.is_forum ? 1 : 0,
      created_at: store.now(),
    });
    const chat = store.getChatByTgId.get(user.tg_id, ctx.chat.id);

    const threadId = ctx.msg.is_topic_message ? ctx.msg.message_thread_id : null;
    if (threadId) {
      const arg = ctx.match?.trim();
      const name = arg || ctx.msg.reply_to_message?.forum_topic_created?.name || `Тема #${threadId}`;
      store.upsertTopic.run(chat.id, threadId, name, store.now());
      return ctx.reply(`✅ Тема «${name}» в «${chat.title}» привязана.\nТеперь в личке бота выбери её при добавлении ссылки.`);
    }
    return ctx.reply(`✅ Группа «${chat.title}» привязана.\nЕсли хочешь раскладывать поиски по темам — включи Topics и напиши /bind внутри каждой темы.`);
  });

  bot.command('unbind', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const chat = store.getChatByTgId.get(ctx.from.id, ctx.chat.id);
    if (!chat) return ctx.reply('Этот чат не привязан.');
    store.deleteChat.run(chat.id, ctx.from.id);
    await ctx.reply('Чат отвязан. Поиски, которые слали сюда, остановлены — переназначь их в личке бота.');
  });

  // Binding a channel: the owner forwards any post from it into the bot's DM.
  bot.chatType('private').on('message:forward_origin', async (ctx, next) => {
    const origin = ctx.msg.forward_origin;
    if (origin?.type !== 'channel') return next();
    const user = store.upsertUser(ctx.from.id, ctx.from.username);
    try {
      const me = await ctx.api.getChatMember(origin.chat.id, ctx.me.id);
      if (!['administrator', 'creator'].includes(me.status)) {
        return ctx.reply('Сначала добавь бота админом в этот канал, потом перешли пост ещё раз.');
      }
    } catch {
      return ctx.reply('Не вижу канал. Добавь бота админом в канал и перешли пост ещё раз.');
    }
    store.upsertChat.run({
      owner_id: user.tg_id,
      tg_chat_id: origin.chat.id,
      title: origin.chat.title || 'Канал',
      type: 'channel',
      is_forum: 0,
      created_at: store.now(),
    });
    await ctx.reply(`✅ Канал «${origin.chat.title}» привязан.`, { reply_markup: mainMenu });
  });

  /* ------------------------------ add search ----------------------------- */

  const startAdd = async (ctx) => {
    const user = store.upsertUser(ctx.from.id, ctx.from.username);
    const plan = store.effectivePlan(user);
    const limit = searchLimitFor(plan);
    if (store.countSearches.get(user.tg_id).n >= limit) {
      return ctx.reply(`Лимит тарифа ${planLabel[plan]}: ${limit} ссылок. Удали лишнее или подключи тариф выше (/plan).`);
    }
    setFlow(ctx.from.id, { step: 'url' });
    await ctx.reply(ASK_URL, { parse_mode: 'HTML', reply_markup: cancelKb });
  };

  bot.chatType('private').command('add', startAdd);
  bot.chatType('private').hears(BTN.add, startAdd);

  /* ------------------------------ list / edit ---------------------------- */

  const showList = async (ctx, edit = false) => {
    const user = store.upsertUser(ctx.from.id, ctx.from.username);
    const searches = store.listSearches.all(user.tg_id);
    if (!searches.length) {
      const text = 'Пока нет ни одной ссылки. Нажми «➕ Добавить ссылку».';
      return edit ? ctx.editMessageText(text) : ctx.reply(text, { reply_markup: mainMenu });
    }
    const plan = store.effectivePlan(user);
    const header =
      `<b>Мои ссылки</b> (${searches.length}/${searchLimitFor(plan)})\n` +
      `Мониторинг: ${user.monitoring_enabled ? '🟢 включён' : '🔴 выключен'} · ` +
      `интервал ${intervalFor(plan)} сек (${planLabel[plan]})`;
    const opts = { parse_mode: 'HTML', reply_markup: searchListKb(searches) };
    return edit ? ctx.editMessageText(header, opts) : ctx.reply(header, opts);
  };

  bot.chatType('private').command('list', (ctx) => showList(ctx));
  bot.chatType('private').hears(BTN.list, (ctx) => showList(ctx));
  bot.callbackQuery('s:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showList(ctx, true);
  });

  const searchCard = (search, ownerId) => {
    const lines = [
      `<b>${search.name}</b>`,
      `Куда: ${destinationTitle(search, ownerId)}`,
      `Статус: ${search.enabled ? '🟢 активен' : '⏸ выключен'}`,
      `Отправлено объявлений: ${search.sent_count}`,
    ];
    if (search.last_run_at) {
      lines.push(`Последняя проверка: ${new Date(search.last_run_at * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC`);
    }
    if (search.last_error) lines.push(`⚠️ ${search.last_error}`);
    return lines.join('\n');
  };

  bot.callbackQuery(/^s:open:(\d+)$/, async (ctx) => {
    const search = store.getSearch.get(Number(ctx.match[1]));
    await ctx.answerCallbackQuery();
    if (!search || search.user_id !== ctx.from.id) return;
    await ctx.editMessageText(searchCard(search, ctx.from.id), {
      parse_mode: 'HTML',
      reply_markup: searchKb(search),
    });
  });

  bot.callbackQuery(/^s:toggle:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const search = store.getSearch.get(id);
    if (!search || search.user_id !== ctx.from.id) return ctx.answerCallbackQuery();
    store.toggleSearch.run(search.enabled ? 0 : 1, id, ctx.from.id);
    const updated = store.getSearch.get(id);
    await ctx.answerCallbackQuery(updated.enabled ? 'Включено' : 'Выключено');
    await ctx.editMessageText(searchCard(updated, ctx.from.id), {
      parse_mode: 'HTML',
      reply_markup: searchKb(updated),
    });
  });

  bot.callbackQuery(/^s:rename:(\d+)$/, async (ctx) => {
    const search = store.getSearch.get(Number(ctx.match[1]));
    if (!search || search.user_id !== ctx.from.id) return ctx.answerCallbackQuery();
    setFlow(ctx.from.id, { step: 'rename', searchId: search.id });
    await ctx.answerCallbackQuery();
    await ctx.reply(`Новое название для «${search.name}»?`, { reply_markup: cancelKb });
  });

  bot.callbackQuery(/^s:del:(\d+)$/, async (ctx) => {
    const search = store.getSearch.get(Number(ctx.match[1]));
    if (!search || search.user_id !== ctx.from.id) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`Удалить «${search.name}»?`, { reply_markup: confirmDeleteKb(search.id) });
  });

  bot.callbackQuery(/^s:delok:(\d+)$/, async (ctx) => {
    store.deleteSearch.run(Number(ctx.match[1]), ctx.from.id);
    await ctx.answerCallbackQuery('Удалено');
    await showList(ctx, true);
  });

  /* -------------------------------- chats -------------------------------- */

  const showChats = async (ctx, edit = false) => {
    const user = store.upsertUser(ctx.from.id, ctx.from.username);
    const chats = store.listChats.all(user.tg_id).filter((c) => c.type !== 'private');
    const map = topicsByChat(chats);
    const lines = ['<b>Мои чаты</b>', ''];
    if (!chats.length) {
      lines.push('Нет привязанных групп/каналов.');
    } else {
      for (const c of chats) {
        lines.push(`👥 <b>${c.title}</b>`);
        for (const t of map.get(c.id) || []) lines.push(`   # ${t.name}`);
      }
    }
    lines.push('', 'Добавить: закинь бота в группу админом и напиши там <code>/bind</code> (внутри темы — <code>/bind Название</code>).');
    const opts = { parse_mode: 'HTML', reply_markup: chatsKb(chats, map) };
    return edit ? ctx.editMessageText(lines.join('\n'), opts) : ctx.reply(lines.join('\n'), opts);
  };

  bot.chatType('private').command('chats', (ctx) => showChats(ctx));
  bot.chatType('private').hears(BTN.chats, (ctx) => showChats(ctx));

  bot.callbackQuery(/^chat:del:(\d+)$/, async (ctx) => {
    store.deleteChat.run(Number(ctx.match[1]), ctx.from.id);
    await ctx.answerCallbackQuery('Отвязано');
    await showChats(ctx, true);
  });

  /* ------------------------- monitoring on / off ------------------------- */

  const toggleMonitoring = async (ctx, forced) => {
    const user = store.upsertUser(ctx.from.id, ctx.from.username);
    const next = forced ?? (user.monitoring_enabled ? 0 : 1);
    store.setMonitoring.run(next, user.tg_id);
    await ctx.reply(next ? '🟢 Мониторинг включён.' : '🔴 Мониторинг выключен.', { reply_markup: mainMenu });
  };

  bot.chatType('private').hears(BTN.toggle, (ctx) => toggleMonitoring(ctx));
  bot.chatType('private').command('pause', (ctx) => toggleMonitoring(ctx, 0));
  bot.chatType('private').command('resume', (ctx) => toggleMonitoring(ctx, 1));

  /* -------------------------------- plan --------------------------------- */

  const showPlan = async (ctx) => {
    const user = store.upsertUser(ctx.from.id, ctx.from.username);
    const plan = store.effectivePlan(user);
    const lines = [
      `<b>Тариф: ${planLabel[plan]}</b>`,
      `Интервал проверки: ~${intervalFor(plan)} сек`,
      `Лимит ссылок: ${searchLimitFor(plan)}`,
      `Используется: ${store.countSearches.get(user.tg_id).n}`,
    ];
    if (user.plan_until && plan !== 'free') {
      lines.push(`Действует до: ${new Date(user.plan_until * 1000).toISOString().slice(0, 10)}`);
    }
    lines.push(
      '',
      `Free — ${intervalFor('free')} сек · Basic — ${intervalFor('basic')} сек · Pro — ${intervalFor('pro')} сек`,
    );
    const kb = new InlineKeyboard();
    if (config.payments.basicStars) kb.text(`Basic · ${config.payments.basicStars} ⭐`, 'buy:basic');
    if (config.payments.proStars) kb.text(`Pro · ${config.payments.proStars} ⭐`, 'buy:pro');
    await ctx.reply(lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: kb.inline_keyboard.flat().length ? kb : mainMenu,
    });
  };

  bot.chatType('private').command('plan', showPlan);
  bot.chatType('private').hears(BTN.plan, showPlan);
  bot.chatType('private').hears(BTN.help, (ctx) => ctx.reply(HELP, { parse_mode: 'HTML', reply_markup: mainMenu }));

  bot.callbackQuery(/^buy:(basic|pro)$/, async (ctx) => {
    const plan = ctx.match[1];
    const stars = plan === 'pro' ? config.payments.proStars : config.payments.basicStars;
    await ctx.answerCallbackQuery();
    if (!stars) return;
    await ctx.api.sendInvoice(
      ctx.chat.id,
      `Vinted Monitor ${planLabel[plan]}`,
      `${config.payments.planDays} дней · интервал ~${intervalFor(plan)} сек · до ${searchLimitFor(plan)} ссылок`,
      `plan:${plan}`,
      'XTR',
      [{ label: planLabel[plan], amount: stars }],
    );
  });

  bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

  bot.on('message:successful_payment', async (ctx) => {
    const plan = ctx.msg.successful_payment.invoice_payload.split(':')[1];
    if (!['basic', 'pro'].includes(plan)) return;
    const user = store.upsertUser(ctx.from.id, ctx.from.username);
    const base = Math.max(store.now(), user.plan_until || 0);
    store.setPlan.run(plan, base + config.payments.planDays * 86400, user.tg_id);
    await ctx.reply(`✅ Тариф ${planLabel[plan]} активирован на ${config.payments.planDays} дней.`);
  });

  /* -------------------------------- admin -------------------------------- */

  bot.chatType('private').command('grant', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const [id, plan, days] = (ctx.match || '').trim().split(/\s+/);
    if (!id || !['free', 'basic', 'pro'].includes(plan)) {
      return ctx.reply('Использование: /grant <tg_id> <free|basic|pro> [дней]');
    }
    store.upsertUser(Number(id), null);
    const until = plan === 'free' ? null : store.now() + (Number(days) || 30) * 86400;
    store.setPlan.run(plan, until, Number(id));
    await ctx.reply(`Готово: ${id} → ${plan}${until ? ` до ${new Date(until * 1000).toISOString().slice(0, 10)}` : ''}`);
  });

  /* ----------------------------- text router ----------------------------- */

  bot.callbackQuery('cancel', async (ctx) => {
    flows.delete(ctx.from.id);
    await ctx.answerCallbackQuery('Отменено');
    await ctx.editMessageReplyMarkup();
  });

  bot.callbackQuery('dest:back', async (ctx) => {
    const user = store.upsertUser(ctx.from.id, ctx.from.username);
    const chats = store.listChats.all(user.tg_id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ASK_DEST, { reply_markup: destinationKb(chats, topicsByChat(chats)) });
  });

  bot.callbackQuery(/^destchat:(\d+)$/, async (ctx) => {
    const chat = store.getChat.get(Number(ctx.match[1]), ctx.from.id);
    await ctx.answerCallbackQuery();
    if (!chat) return;
    await ctx.editMessageText(`«${chat.title}» — в какую тему?`, {
      reply_markup: topicKb(chat, store.listTopics.all(chat.id)),
    });
  });

  bot.callbackQuery(/^dest:(private|chat:\d+|topic:\d+)$/, async (ctx) => {
    const flow = getFlow(ctx.from.id);
    await ctx.answerCallbackQuery();
    if (flow?.step !== 'dest') return ctx.editMessageText('Сессия истекла, начни заново: /add');

    let chatId;
    let threadId = null;
    const choice = ctx.match[1];
    if (choice === 'private') {
      chatId = ctx.from.id;
    } else if (choice.startsWith('chat:')) {
      const chat = store.getChat.get(Number(choice.split(':')[1]), ctx.from.id);
      if (!chat) return;
      chatId = chat.tg_chat_id;
    } else {
      const topic = store.getTopic.get(Number(choice.split(':')[1]));
      const chat = topic && store.getChat.get(topic.chat_id, ctx.from.id);
      if (!chat) return;
      chatId = chat.tg_chat_id;
      threadId = topic.thread_id;
    }

    store.insertSearch.run({
      user_id: ctx.from.id,
      name: flow.name,
      url: flow.parsed.normalizedUrl,
      domain: flow.parsed.domain,
      canonical_key: flow.parsed.canonicalKey,
      api_query: JSON.stringify(flow.parsed.query),
      dest_chat_id: chatId,
      dest_thread_id: threadId,
      next_run_at: store.now(),
      created_at: store.now(),
    });
    flows.delete(ctx.from.id);

    const user = store.getUser(ctx.from.id);
    const plan = store.effectivePlan(user);
    await ctx.editMessageText(
      `✅ «${flow.name}» добавлен.\nПроверка каждые ~${intervalFor(plan)} сек. ` +
        'Первый проход только запоминает текущие объявления — присылать буду начиная со следующих новых.',
    );
  });

  bot.chatType('private').on('message:text', async (ctx) => {
    const text = ctx.msg.text.trim();
    if (text.startsWith('/') || Object.values(BTN).includes(text)) return;
    const flow = getFlow(ctx.from.id);
    if (!flow) {
      if (/vinted\./i.test(text)) {
        setFlow(ctx.from.id, { step: 'url' });
        return handleUrl(ctx, text);
      }
      return ctx.reply('Не понял. Открой меню кнопками ниже или /help.', { reply_markup: mainMenu });
    }

    if (flow.step === 'url') return handleUrl(ctx, text);

    if (flow.step === 'name') {
      const name = text.slice(0, 64);
      setFlow(ctx.from.id, { ...flow, step: 'dest', name });
      const chats = store.listChats.all(ctx.from.id);
      return ctx.reply(ASK_DEST, { reply_markup: destinationKb(chats, topicsByChat(chats)) });
    }

    if (flow.step === 'rename') {
      store.renameSearch.run(text.slice(0, 64), flow.searchId, ctx.from.id);
      flows.delete(ctx.from.id);
      return ctx.reply('✅ Переименовано.', { reply_markup: mainMenu });
    }
  });

  async function handleUrl(ctx, text) {
    let parsed;
    try {
      parsed = parseSearchUrl(text);
    } catch (err) {
      if (err instanceof InvalidVintedUrl) return ctx.reply(`❌ ${err.message}`, { reply_markup: cancelKb });
      throw err;
    }
    setFlow(ctx.from.id, { step: 'name', parsed });
    await ctx.reply(ASK_NAME, { parse_mode: 'HTML', reply_markup: cancelKb });
  }

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) logger.warn(`telegram error: ${e.description}`);
    else logger.error('bot error:', e);
  });

  return bot;
}
