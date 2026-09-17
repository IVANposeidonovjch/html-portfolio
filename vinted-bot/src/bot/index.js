import { Bot, GrammyError, InlineKeyboard } from 'grammy';
import { config, intervalFor, searchLimitFor } from '../config.js';
import * as store from '../db/index.js';
import { LANGS, allLabels, isLang, resolveLang, t } from '../i18n/index.js';
import { logger } from '../util/logger.js';
import { InvalidVintedUrl, parseSearchUrl } from '../vinted/url.js';
import {
  cancelKb, chatsKb, confirmDeleteKb, destinationKb, langKb, mainMenu, searchKb, searchListKb, topicKb,
} from './keyboards.js';

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

/** Register the user on first contact, seeding the language from Telegram. */
function who(ctx) {
  const user = store.upsertUser(ctx.from.id, ctx.from.username, resolveLang(ctx.from.language_code));
  return { user, lang: user.lang };
}

function topicsByChat(chats) {
  const map = new Map();
  for (const c of chats) map.set(c.id, store.listTopics.all(c.id));
  return map;
}

function destinationTitle(search, ownerId, lang) {
  if (search.dest_chat_id === ownerId) return t(lang, 'dest.private');
  const chat = store.getChatByTgId.get(ownerId, search.dest_chat_id);
  const base = chat?.title || `chat ${search.dest_chat_id}`;
  if (!search.dest_thread_id) return base;
  const topic = chat
    ? store.listTopics.all(chat.id).find((x) => x.thread_id === search.dest_thread_id)
    : null;
  return `${base} → ${topic?.name || t(lang, 'dest.topic', { id: search.dest_thread_id })}`;
}

export function createBot() {
  const bot = new Bot(config.botToken);

  /* ---------------------------- private: start --------------------------- */

  bot.chatType('private').command('start', async (ctx) => {
    const { lang } = who(ctx);
    store.upsertChat.run({
      owner_id: ctx.from.id,
      tg_chat_id: ctx.chat.id,
      title: t(lang, 'dest.private'),
      type: 'private',
      is_forum: 0,
      created_at: store.now(),
    });
    await ctx.reply(t(lang, 'help.text'), { parse_mode: 'HTML', reply_markup: mainMenu(lang) });
  });

  const help = (ctx) => {
    const { lang } = who(ctx);
    return ctx.reply(t(lang, 'help.text'), { parse_mode: 'HTML', reply_markup: mainMenu(lang) });
  };
  bot.chatType('private').command('help', help);
  bot.chatType('private').hears(allLabels('btn.help'), help);

  /* ------------------------------- language ------------------------------ */

  const showLang = (ctx) => {
    const { lang } = who(ctx);
    return ctx.reply(t(lang, 'lang.choose'), { reply_markup: langKb(lang) });
  };
  bot.chatType('private').command('lang', showLang);
  bot.chatType('private').hears(allLabels('btn.lang'), showLang);

  bot.callbackQuery(/^lang:(\w+)$/, async (ctx) => {
    const next = ctx.match[1];
    await ctx.answerCallbackQuery();
    if (!isLang(next)) return;
    who(ctx);
    store.setLang.run(next, ctx.from.id);
    await ctx.editMessageText(t(next, 'lang.set'), { reply_markup: langKb(next) });
    // the reply keyboard carries translated labels, so it has to be re-sent
    await ctx.reply(t(next, 'help.text'), { parse_mode: 'HTML', reply_markup: mainMenu(next) });
  });

  /* ------------------------- groups: /bind, /unbind ---------------------- */

  bot.command('bind', async (ctx) => {
    const { user, lang } = who(ctx);
    if (ctx.chat.type === 'private') {
      return ctx.reply(t(lang, 'bind.onlyInGroup'), { parse_mode: 'HTML' });
    }
    try {
      const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
      if (!['creator', 'administrator'].includes(member.status)) {
        return ctx.reply(t(lang, 'bind.onlyAdmin'));
      }
    } catch {
      /* private groups can hide membership — fall through */
    }

    const existing = store.listChats.all(user.tg_id).filter((c) => c.type !== 'private');
    const already = store.getChatByTgId.get(user.tg_id, ctx.chat.id);
    if (!already && existing.length >= config.limits.chats) {
      return ctx.reply(t(lang, 'bind.limit', { limit: config.limits.chats }));
    }

    store.upsertChat.run({
      owner_id: user.tg_id,
      tg_chat_id: ctx.chat.id,
      title: ctx.chat.title || 'Group',
      type: ctx.chat.type,
      is_forum: ctx.chat.is_forum ? 1 : 0,
      created_at: store.now(),
    });
    const chat = store.getChatByTgId.get(user.tg_id, ctx.chat.id);

    const threadId = ctx.msg.is_topic_message ? ctx.msg.message_thread_id : null;
    if (threadId) {
      const name = ctx.match?.trim() || ctx.msg.reply_to_message?.forum_topic_created?.name || `#${threadId}`;
      store.upsertTopic.run(chat.id, threadId, name, store.now());
      return ctx.reply(t(lang, 'bind.topicOk', { name, title: chat.title }));
    }
    return ctx.reply(t(lang, 'bind.groupOk', { title: chat.title }));
  });

  bot.command('unbind', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const { lang } = who(ctx);
    const chat = store.getChatByTgId.get(ctx.from.id, ctx.chat.id);
    if (!chat) return ctx.reply(t(lang, 'bind.notBound'));
    store.deleteChat.run(chat.id, ctx.from.id);
    await ctx.reply(t(lang, 'bind.unbound'));
  });

  /* ------------------ group -> supergroup migration ---------------------- */

  /**
   * Enabling Topics upgrades a group to a supergroup, and Telegram hands the old
   * chat a brand new id. Every send to the old id then fails forever with
   * "group chat was upgraded to a supergroup chat". Telegram announces it once,
   * in a service message — catch it and move the searches across.
   */
  bot.on('message:migrate_to_chat_id', async (ctx) => {
    const oldId = ctx.chat.id;
    const newId = ctx.msg.migrate_to_chat_id;
    const owners = store.chatOwners.all(oldId);
    const moved = store.migrateChat(oldId, newId);
    logger.info(`chat migrated ${oldId} -> ${newId}, ${moved} search(es) moved`);
    for (const { owner_id, title } of owners) {
      const lang = store.getUser(owner_id)?.lang || 'en';
      await ctx.api
        .sendMessage(owner_id, t(lang, 'migrate.done', { title, count: moved }))
        .catch(() => {});
    }
  });

  // Binding a channel: the owner forwards any post from it into the bot's DM.
  bot.chatType('private').on('message:forward_origin', async (ctx, next) => {
    const origin = ctx.msg.forward_origin;
    if (origin?.type !== 'channel') return next();
    const { user, lang } = who(ctx);
    try {
      const me = await ctx.api.getChatMember(origin.chat.id, ctx.me.id);
      if (!['administrator', 'creator'].includes(me.status)) {
        return ctx.reply(t(lang, 'bind.channelNeedAdmin'));
      }
    } catch {
      return ctx.reply(t(lang, 'bind.channelNotSeen'));
    }
    store.upsertChat.run({
      owner_id: user.tg_id,
      tg_chat_id: origin.chat.id,
      title: origin.chat.title || 'Channel',
      type: 'channel',
      is_forum: 0,
      created_at: store.now(),
    });
    await ctx.reply(t(lang, 'bind.channelOk', { title: origin.chat.title }), {
      reply_markup: mainMenu(lang),
    });
  });

  /* ------------------------------ add search ----------------------------- */

  const startAdd = async (ctx) => {
    const { user, lang } = who(ctx);
    const plan = store.effectivePlan(user);
    const limit = searchLimitFor(plan);
    if (store.countSearches.get(user.tg_id).n >= limit) {
      return ctx.reply(t(lang, 'add.limit', { plan: planLabel[plan], limit }));
    }
    setFlow(ctx.from.id, { step: 'url' });
    await ctx.reply(t(lang, 'add.askUrl'), { parse_mode: 'HTML', reply_markup: cancelKb(lang) });
  };

  bot.chatType('private').command('add', startAdd);
  bot.chatType('private').hears(allLabels('btn.add'), startAdd);

  /** Store the search and tell the user what happens next. */
  function createSearch(ownerId, lang, flow, chatId, threadId) {
    store.insertSearch.run({
      user_id: ownerId,
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
    flows.delete(ownerId);
    const plan = store.effectivePlan(store.getUser(ownerId));
    return t(lang, 'add.created', { name: flow.name, seconds: intervalFor(plan) });
  }

  /* ------------------------------ list / edit ---------------------------- */

  const showList = async (ctx, edit = false) => {
    const { user, lang } = who(ctx);
    const searches = store.listSearches.all(user.tg_id);
    if (!searches.length) {
      const text = t(lang, 'list.empty');
      return edit ? ctx.editMessageText(text) : ctx.reply(text, { reply_markup: mainMenu(lang) });
    }
    const plan = store.effectivePlan(user);
    const header = t(lang, 'list.header', {
      count: searches.length,
      limit: searchLimitFor(plan),
      state: t(lang, user.monitoring_enabled ? 'state.on' : 'state.off'),
      seconds: intervalFor(plan),
      plan: planLabel[plan],
    });
    const opts = { parse_mode: 'HTML', reply_markup: searchListKb(searches) };
    return edit ? ctx.editMessageText(header, opts) : ctx.reply(header, opts);
  };

  bot.chatType('private').command('list', (ctx) => showList(ctx));
  bot.chatType('private').hears(allLabels('btn.list'), (ctx) => showList(ctx));
  bot.callbackQuery('s:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showList(ctx, true);
  });

  const searchCard = (search, ownerId, lang) => {
    const lines = [
      `<b>${search.name}</b>`,
      t(lang, 'card.dest', { dest: destinationTitle(search, ownerId, lang) }),
      t(lang, 'card.status', { status: t(lang, search.enabled ? 'status.active' : 'status.paused') }),
      t(lang, 'card.sent', { count: search.sent_count }),
    ];
    if (search.last_run_at) {
      lines.push(
        t(lang, 'card.lastCheck', {
          time: new Date(search.last_run_at * 1000).toISOString().replace('T', ' ').slice(0, 19),
        }),
      );
    }
    if (search.last_error) lines.push(`⚠️ ${search.last_error}`);
    return lines.join('\n');
  };

  bot.callbackQuery(/^s:open:(\d+)$/, async (ctx) => {
    const { lang } = who(ctx);
    const search = store.getSearch.get(Number(ctx.match[1]));
    await ctx.answerCallbackQuery();
    if (!search || search.user_id !== ctx.from.id) return;
    await ctx.editMessageText(searchCard(search, ctx.from.id, lang), {
      parse_mode: 'HTML',
      reply_markup: searchKb(lang, search),
    });
  });

  bot.callbackQuery(/^s:toggle:(\d+)$/, async (ctx) => {
    const { lang } = who(ctx);
    const id = Number(ctx.match[1]);
    const search = store.getSearch.get(id);
    if (!search || search.user_id !== ctx.from.id) return ctx.answerCallbackQuery();
    store.toggleSearch.run(search.enabled ? 0 : 1, id, ctx.from.id);
    const updated = store.getSearch.get(id);
    await ctx.answerCallbackQuery(t(lang, updated.enabled ? 'common.enabled' : 'common.disabled'));
    await ctx.editMessageText(searchCard(updated, ctx.from.id, lang), {
      parse_mode: 'HTML',
      reply_markup: searchKb(lang, updated),
    });
  });

  bot.callbackQuery(/^s:rename:(\d+)$/, async (ctx) => {
    const { lang } = who(ctx);
    const search = store.getSearch.get(Number(ctx.match[1]));
    if (!search || search.user_id !== ctx.from.id) return ctx.answerCallbackQuery();
    setFlow(ctx.from.id, { step: 'rename', searchId: search.id });
    await ctx.answerCallbackQuery();
    await ctx.reply(t(lang, 'rename.ask', { name: search.name }), { reply_markup: cancelKb(lang) });
  });

  bot.callbackQuery(/^s:del:(\d+)$/, async (ctx) => {
    const { lang } = who(ctx);
    const search = store.getSearch.get(Number(ctx.match[1]));
    if (!search || search.user_id !== ctx.from.id) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(lang, 'delete.confirm', { name: search.name }), {
      reply_markup: confirmDeleteKb(lang, search.id),
    });
  });

  bot.callbackQuery(/^s:delok:(\d+)$/, async (ctx) => {
    const { lang } = who(ctx);
    store.deleteSearch.run(Number(ctx.match[1]), ctx.from.id);
    await ctx.answerCallbackQuery(t(lang, 'delete.done'));
    await showList(ctx, true);
  });

  /* -------------------------------- chats -------------------------------- */

  const showChats = async (ctx, edit = false) => {
    const { user, lang } = who(ctx);
    const chats = store.listChats.all(user.tg_id).filter((c) => c.type !== 'private');
    const map = topicsByChat(chats);
    const lines = [t(lang, 'chats.header'), ''];
    if (!chats.length) {
      lines.push(t(lang, 'chats.empty'));
    } else {
      for (const c of chats) {
        lines.push(`👥 <b>${c.title}</b>`);
        for (const topic of map.get(c.id) || []) lines.push(`   # ${topic.name}`);
      }
    }
    lines.push('', t(lang, 'chats.hint'));
    const opts = { parse_mode: 'HTML', reply_markup: chatsKb(lang, chats, map) };
    return edit ? ctx.editMessageText(lines.join('\n'), opts) : ctx.reply(lines.join('\n'), opts);
  };

  bot.chatType('private').command('chats', (ctx) => showChats(ctx));
  bot.chatType('private').hears(allLabels('btn.chats'), (ctx) => showChats(ctx));

  bot.callbackQuery(/^chat:del:(\d+)$/, async (ctx) => {
    const { lang } = who(ctx);
    store.deleteChat.run(Number(ctx.match[1]), ctx.from.id);
    await ctx.answerCallbackQuery(t(lang, 'chats.unbound'));
    await showChats(ctx, true);
  });

  /* ------------------------- monitoring on / off ------------------------- */

  const toggleMonitoring = async (ctx, forced) => {
    const { user, lang } = who(ctx);
    const next = forced ?? (user.monitoring_enabled ? 0 : 1);
    store.setMonitoring.run(next, user.tg_id);
    await ctx.reply(t(lang, next ? 'toggle.on' : 'toggle.off'), { reply_markup: mainMenu(lang) });
  };

  bot.chatType('private').hears(allLabels('btn.toggle'), (ctx) => toggleMonitoring(ctx));
  bot.chatType('private').command('pause', (ctx) => toggleMonitoring(ctx, 0));
  bot.chatType('private').command('resume', (ctx) => toggleMonitoring(ctx, 1));

  /* -------------------------------- plan --------------------------------- */

  const showPlan = async (ctx) => {
    const { user, lang } = who(ctx);
    const plan = store.effectivePlan(user);
    const lines = [
      t(lang, 'plan.title', { plan: planLabel[plan] }),
      t(lang, 'plan.interval', { seconds: intervalFor(plan) }),
      t(lang, 'plan.limit', { limit: searchLimitFor(plan) }),
      t(lang, 'plan.used', { count: store.countSearches.get(user.tg_id).n }),
    ];
    if (user.plan_until && plan !== 'free') {
      lines.push(t(lang, 'plan.until', { date: new Date(user.plan_until * 1000).toISOString().slice(0, 10) }));
    }
    lines.push(
      '',
      t(lang, 'plan.tiers', {
        free: intervalFor('free'),
        basic: intervalFor('basic'),
        pro: intervalFor('pro'),
      }),
    );
    const kb = new InlineKeyboard();
    if (config.payments.basicStars) kb.text(`Basic · ${config.payments.basicStars} ⭐`, 'buy:basic');
    if (config.payments.proStars) kb.text(`Pro · ${config.payments.proStars} ⭐`, 'buy:pro');
    await ctx.reply(lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: kb.inline_keyboard.flat().length ? kb : mainMenu(lang),
    });
  };

  bot.chatType('private').command('plan', showPlan);
  bot.chatType('private').hears(allLabels('btn.plan'), showPlan);

  bot.callbackQuery(/^buy:(basic|pro)$/, async (ctx) => {
    const { lang } = who(ctx);
    const plan = ctx.match[1];
    const stars = plan === 'pro' ? config.payments.proStars : config.payments.basicStars;
    await ctx.answerCallbackQuery();
    if (!stars) return;
    await ctx.api.sendInvoice(
      ctx.chat.id,
      `Vinted Monitor ${planLabel[plan]}`,
      t(lang, 'plan.invoiceDesc', {
        days: config.payments.planDays,
        seconds: intervalFor(plan),
        limit: searchLimitFor(plan),
      }),
      `plan:${plan}`,
      'XTR',
      [{ label: planLabel[plan], amount: stars }],
    );
  });

  bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

  bot.on('message:successful_payment', async (ctx) => {
    const { user, lang } = who(ctx);
    const plan = ctx.msg.successful_payment.invoice_payload.split(':')[1];
    if (!['basic', 'pro'].includes(plan)) return;
    const base = Math.max(store.now(), user.plan_until || 0);
    store.setPlan.run(plan, base + config.payments.planDays * 86400, user.tg_id);
    await ctx.reply(t(lang, 'pay.ok', { plan: planLabel[plan], days: config.payments.planDays }));
  });

  /* -------------------------------- admin -------------------------------- */

  bot.chatType('private').command('grant', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const [id, plan, days] = (ctx.match || '').trim().split(/\s+/);
    if (!id || !['free', 'basic', 'pro'].includes(plan)) {
      return ctx.reply('Usage: /grant <tg_id> <free|basic|pro> [days]');
    }
    store.upsertUser(Number(id), null);
    const until = plan === 'free' ? null : store.now() + (Number(days) || 30) * 86400;
    store.setPlan.run(plan, until, Number(id));
    await ctx.reply(`OK: ${id} → ${plan}${until ? ` until ${new Date(until * 1000).toISOString().slice(0, 10)}` : ''}`);
  });

  /* ---------------------------- destinations ----------------------------- */

  bot.callbackQuery('cancel', async (ctx) => {
    const { lang } = who(ctx);
    flows.delete(ctx.from.id);
    await ctx.answerCallbackQuery(t(lang, 'common.cancelled'));
    await ctx.editMessageReplyMarkup();
  });

  bot.callbackQuery('dest:back', async (ctx) => {
    const { user, lang } = who(ctx);
    const chats = store.listChats.all(user.tg_id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(lang, 'add.askDest'), {
      reply_markup: destinationKb(lang, chats, topicsByChat(chats)),
    });
  });

  bot.callbackQuery(/^destchat:(\d+)$/, async (ctx) => {
    const { lang } = who(ctx);
    const flow = getFlow(ctx.from.id);
    const chat = store.getChat.get(Number(ctx.match[1]), ctx.from.id);
    await ctx.answerCallbackQuery();
    if (!chat) return;
    if (flow?.step !== 'dest') return ctx.editMessageText(t(lang, 'common.expired'));
    await ctx.editMessageText(`«${chat.title}»`, {
      reply_markup: topicKb(lang, chat, store.listTopics.all(chat.id), flow.name),
    });
  });

  /**
   * Auto-create the topic: the user never has to open the group, make a topic
   * and run /bind there — the bot does all three from the name they just typed.
   */
  bot.callbackQuery(/^dest:newtopic:(\d+)$/, async (ctx) => {
    const { lang } = who(ctx);
    const flow = getFlow(ctx.from.id);
    const chat = store.getChat.get(Number(ctx.match[1]), ctx.from.id);
    await ctx.answerCallbackQuery();
    if (!chat) return;
    if (flow?.step !== 'dest') return ctx.editMessageText(t(lang, 'common.expired'));

    let topic;
    try {
      topic = await ctx.api.createForumTopic(chat.tg_chat_id, flow.name);
    } catch (err) {
      const reason = err instanceof GrammyError ? err.description : String(err?.message || err);
      logger.warn(`createForumTopic failed chat=${chat.tg_chat_id}: ${reason}`);
      return ctx.editMessageText(t(lang, 'topic.createFailed', { error: reason }), {
        reply_markup: topicKb(lang, chat, store.listTopics.all(chat.id), flow.name),
      });
    }

    store.upsertTopic.run(chat.id, topic.message_thread_id, flow.name, store.now());
    const created = createSearch(ctx.from.id, lang, flow, chat.tg_chat_id, topic.message_thread_id);
    await ctx.editMessageText(`${t(lang, 'topic.created', { name: flow.name })}\n\n${created}`);
  });

  bot.callbackQuery(/^dest:(private|chat:\d+|topic:\d+)$/, async (ctx) => {
    const { lang } = who(ctx);
    const flow = getFlow(ctx.from.id);
    await ctx.answerCallbackQuery();
    if (flow?.step !== 'dest') return ctx.editMessageText(t(lang, 'common.expired'));

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

    await ctx.editMessageText(createSearch(ctx.from.id, lang, flow, chatId, threadId));
  });

  /* ----------------------------- text router ----------------------------- */

  bot.chatType('private').on('message:text', async (ctx) => {
    const { lang } = who(ctx);
    const text = ctx.msg.text.trim();
    if (text.startsWith('/')) return;
    const flow = getFlow(ctx.from.id);
    if (!flow) {
      if (/vinted\./i.test(text)) {
        setFlow(ctx.from.id, { step: 'url' });
        return handleUrl(ctx, lang, text);
      }
      return ctx.reply(t(lang, 'common.notUnderstood'), { reply_markup: mainMenu(lang) });
    }

    if (flow.step === 'url') return handleUrl(ctx, lang, text);

    if (flow.step === 'name') {
      const name = text.slice(0, 64);
      setFlow(ctx.from.id, { ...flow, step: 'dest', name });
      const chats = store.listChats.all(ctx.from.id);
      return ctx.reply(t(lang, 'add.askDest'), {
        reply_markup: destinationKb(lang, chats, topicsByChat(chats)),
      });
    }

    if (flow.step === 'rename') {
      store.renameSearch.run(text.slice(0, 64), flow.searchId, ctx.from.id);
      flows.delete(ctx.from.id);
      return ctx.reply(t(lang, 'rename.ok'), { reply_markup: mainMenu(lang) });
    }
  });

  async function handleUrl(ctx, lang, text) {
    let parsed;
    try {
      parsed = parseSearchUrl(text);
    } catch (err) {
      if (err instanceof InvalidVintedUrl) {
        return ctx.reply(`❌ ${t(lang, `url.err.${err.code}`)}`, { reply_markup: cancelKb(lang) });
      }
      throw err;
    }
    setFlow(ctx.from.id, { step: 'name', parsed });
    await ctx.reply(t(lang, 'add.askName'), { parse_mode: 'HTML', reply_markup: cancelKb(lang) });
  }

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) logger.warn(`telegram error: ${e.description}`);
    else logger.error('bot error:', e);
  });

  return bot;
}

export { LANGS };
