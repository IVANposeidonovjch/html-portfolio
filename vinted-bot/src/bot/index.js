import { Bot, GrammyError, InlineKeyboard } from 'grammy';
import { config, intervalFor, searchLimitFor } from '../config.js';
import * as store from '../db/index.js';
import { LANGS, isLang, resolveLang, t } from '../i18n/index.js';
import { logger } from '../util/logger.js';
import { InvalidVintedUrl, parseSearchUrl } from '../vinted/url.js';
import { DEMO_SEARCH, demoItem, itemKeyboard, renderItem } from './format.js';
import { helpParts, helpText } from './help.js';
import { adoptPhoto, forgetImage, imageFor } from './images.js';
import {
  backRow, cancelKb, chatsKb, confirmDeleteKb, destinationKb, helpKb, langKb, mainMenu, menuOnlyKb,
  searchKb, searchListKb, topicKb,
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

/** Usernames and search names are user-typed: never put them in HTML raw. */
const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Telegram caps a message at 4096 chars — send a long report in pieces. */
async function replyLines(ctx, lines, limit = 3500) {
  let buffer = '';
  for (const line of lines) {
    if (buffer.length + line.length + 1 > limit) {
      await ctx.reply(buffer, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      buffer = '';
    }
    buffer += (buffer ? '\n' : '') + line;
  }
  if (buffer) {
    await ctx.reply(buffer, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  }
}
const planLabel = { free: 'Free', basic: 'Basic', pro: 'Pro ⚡' };

/** Register the user on first contact, seeding the language from Telegram. */
function who(ctx) {
  const user = store.upsertUser(ctx.from.id, ctx.from.username, resolveLang(ctx.from.language_code));
  return { user, lang: user.lang };
}

/**
 * Editing a message to exactly what it already says is a 400 from Telegram, and
 * it happens whenever someone taps the button for the screen they are on.
 * Nothing is wrong in that case, so swallow that one description only.
 */
async function safeEdit(ctx, text, options) {
  try {
    await ctx.editMessageText(text, options);
  } catch (err) {
    if (!(err instanceof GrammyError)) throw err;
    if (/message is not modified/i.test(err.description)) return;
    // /start can be a photo with the menu in its caption; a photo has no text
    // to edit, so the same navigation has to rewrite the caption instead.
    if (/no text in the message to edit/i.test(err.description)) {
      await ctx.editMessageCaption({ caption: text, ...options });
      return;
    }
    throw err;
  }
}

/** Reply to a command, or edit the menu message a button was pressed on. */
const render = (ctx, text, options) =>
  ctx.callbackQuery ? safeEdit(ctx, text, options) : ctx.reply(text, options);

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

  /**
   * Anyone who used the previous version still has the old keyboard pinned to
   * the bottom of their chat — the client keeps showing it until a message
   * explicitly removes it. Do that once, on their next interaction.
   */
  bot.chatType('private').use(async (ctx, next) => {
    const id = ctx.from?.id;
    const existing = id ? store.getUser(id) : null;
    if (existing && !existing.kb_cleared) {
      store.markKbCleared.run(id);
      await ctx.api
        .sendMessage(id, t(existing.lang, 'menu.removed'), { reply_markup: { remove_keyboard: true } })
        .catch(() => {});
    }
    await next();
  });

  /* ---------------------------- private: start --------------------------- */

  bot.chatType('private').command('start', async (ctx) => {
    const { user, lang } = who(ctx);
    store.upsertChat.run({
      owner_id: ctx.from.id,
      tg_chat_id: ctx.chat.id,
      title: t(lang, 'dest.private'),
      type: 'private',
      is_forum: 0,
      created_at: store.now(),
    });

    const text = t(lang, 'start.text');
    const reply_markup = mainMenu(lang, { monitoring: !!user.monitoring_enabled });

    // A picture is optional: set one with /setstartimage (or START_IMAGE) and
    // the welcome becomes a photo with the menu under it.
    const photo = imageFor('start');
    if (photo) {
      try {
        await ctx.replyWithPhoto(photo, { caption: text, parse_mode: 'HTML', reply_markup });
        return;
      } catch (err) {
        // a broken path or an image Telegram refuses must not cost the welcome
        logger.warn(`start image not sent: ${err.description || err.message}`);
      }
    }
    await ctx.reply(text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup,
    });
  });

  /** The single message that carries the four-button menu. */
  async function showHome(ctx) {
    const { user, lang } = who(ctx);
    await render(ctx, t(lang, 'menu.title'), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: mainMenu(lang, { monitoring: !!user.monitoring_enabled }),
    });
  }

  /** Help doubles as the second level: plan, language and chats live here. */
  async function showHelp(ctx) {
    const { lang } = who(ctx);
    const demo = imageFor('help');
    const html = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };

    // No picture: one message, mockup inside, buttons under it.
    if (!demo) {
      return render(ctx, helpText(lang, false), { ...html, reply_markup: helpKb(lang) });
    }

    // With a picture the example becomes a real alert, so the text has to open
    // a gap for it: intro up to the pointer, photo, then the rest with the
    // buttons — which is also why the intro goes out without any markup.
    const { intro, rest } = helpParts(lang);
    await render(ctx, intro, html);

    const item = demoItem();
    let shown = false;
    try {
      await ctx.api.sendPhoto(ctx.chat.id, demo, {
        caption: renderItem(item, DEMO_SEARCH, lang),
        parse_mode: 'HTML',
        reply_markup: itemKeyboard(item, lang),
      });
      shown = true;
    } catch (err) {
      logger.warn(`help image not sent: ${err.description || err.message}`);
    }

    // If the photo could not be sent, the written mockup stands in for it —
    // better a described example than a pointer at nothing.
    const tail = shown ? rest : `${t(lang, 'help.example')}\n\n${rest}`;
    await ctx.api.sendMessage(ctx.chat.id, tail, { ...html, reply_markup: helpKb(lang) });
  }

  bot.chatType('private').command('help', showHelp);
  bot.callbackQuery('m:home', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHome(ctx);
  });
  bot.callbackQuery('m:help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHelp(ctx);
  });

  /* ------------------------------- language ------------------------------ */

  const showLang = (ctx) => {
    const { lang } = who(ctx);
    return render(ctx, t(lang, 'lang.choose'), { reply_markup: langKb(lang) });
  };
  bot.chatType('private').command('lang', showLang);
  bot.callbackQuery('m:lang', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showLang(ctx);
  });

  bot.callbackQuery(/^lang:(\w+)$/, async (ctx) => {
    const next = ctx.match[1];
    await ctx.answerCallbackQuery();
    if (!isLang(next)) return;
    who(ctx);
    store.setLang.run(next, ctx.from.id);
    // one message, rebuilt: the labels come from the new language immediately
    const user = store.getUser(ctx.from.id);
    await safeEdit(ctx, `${t(next, 'lang.set')}\n\n${t(next, 'menu.title')}`, {
      parse_mode: 'HTML',
      reply_markup: mainMenu(next, { monitoring: !!user.monitoring_enabled }),
    });
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
      reply_markup: menuOnlyKb(lang),
    });
  });

  /* ------------------------------ add search ----------------------------- */

  const startAdd = async (ctx) => {
    const { user, lang } = who(ctx);
    const plan = store.effectivePlan(user);
    const limit = searchLimitFor(plan);
    if (store.countSearches.get(user.tg_id).n >= limit) {
      return render(ctx, t(lang, 'add.limit', { plan: planLabel[plan], limit }), {
        reply_markup: menuOnlyKb(lang),
      });
    }
    setFlow(ctx.from.id, { step: 'url' });
    await render(ctx, t(lang, 'add.askUrl'), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: cancelKb(lang),
    });
  };

  bot.chatType('private').command('add', startAdd);
  bot.callbackQuery('m:add', async (ctx) => {
    await ctx.answerCallbackQuery();
    await startAdd(ctx);
  });

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

  const showList = async (ctx) => {
    const { user, lang } = who(ctx);
    const searches = store.listSearches.all(user.tg_id);
    if (!searches.length) {
      return render(ctx, t(lang, 'list.empty'), { reply_markup: menuOnlyKb(lang) });
    }
    const plan = store.effectivePlan(user);
    const header = t(lang, 'list.header', {
      count: searches.length,
      limit: searchLimitFor(plan),
      state: t(lang, user.monitoring_enabled ? 'state.on' : 'state.off'),
      seconds: intervalFor(plan),
      plan: planLabel[plan],
    });
    return render(ctx, header, { parse_mode: 'HTML', reply_markup: searchListKb(lang, searches) });
  };

  bot.chatType('private').command('list', showList);
  for (const trigger of ['m:list', 's:list']) {
    bot.callbackQuery(trigger, async (ctx) => {
      await ctx.answerCallbackQuery();
      await showList(ctx);
    });
  }

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
    await showList(ctx);
  });

  /* -------------------------------- chats -------------------------------- */

  const showChats = async (ctx) => {
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
    return render(ctx, lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: chatsKb(lang, chats, map),
    });
  };

  bot.chatType('private').command('chats', showChats);
  bot.callbackQuery('m:chats', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showChats(ctx);
  });

  bot.callbackQuery(/^chat:del:(\d+)$/, async (ctx) => {
    const { lang } = who(ctx);
    store.deleteChat.run(Number(ctx.match[1]), ctx.from.id);
    await ctx.answerCallbackQuery(t(lang, 'chats.unbound'));
    await showChats(ctx);
  });

  /* ------------------------- monitoring on / off ------------------------- */

  const toggleMonitoring = async (ctx, forced) => {
    const { user, lang } = who(ctx);
    const next = forced ?? (user.monitoring_enabled ? 0 : 1);
    store.setMonitoring.run(next, user.tg_id);
    const text = t(lang, next ? 'toggle.on' : 'toggle.off');
    if (ctx.callbackQuery) {
      // the menu button itself shows the state, so redraw it in place
      await ctx.answerCallbackQuery(text);
      return safeEdit(ctx, t(lang, 'menu.title'), {
        parse_mode: 'HTML',
        reply_markup: mainMenu(lang, { monitoring: !!next }),
      });
    }
    return ctx.reply(text, { reply_markup: mainMenu(lang, { monitoring: !!next }) });
  };

  bot.callbackQuery('m:toggle', (ctx) => toggleMonitoring(ctx));
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
    await render(ctx, lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: backRow(kb, lang),
    });
  };

  bot.chatType('private').command('plan', showPlan);
  bot.callbackQuery('m:plan', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPlan(ctx);
  });

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

  /**
   * Who is using the bot. One line per account, busiest first, so a growing
   * user list stays readable without opening the database.
   */
  bot.chatType('private').command('users', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const rows = store.listAllUsers.all();
    if (!rows.length) return ctx.reply('Пользователей пока нет.');

    const lines = [`<b>Пользователи: ${rows.length}</b>`, ''];
    for (const row of rows) {
      const plan = store.effectivePlan(row);
      const expired = row.plan !== 'free' && plan === 'free';
      lines.push(
        `<code>${row.tg_id}</code> ${row.username ? '@' + esc(row.username) : '—'} · ` +
          `${planLabel[plan]}${expired ? ` (был ${planLabel[row.plan]}, истёк)` : ''} · ` +
          `ссылок ${row.active}/${row.total} · отправлено ${row.sent} · ${row.lang}` +
          `${row.monitoring_enabled ? '' : ' · ⏸ мониторинг выключен'}`,
      );
    }
    lines.push('', 'Детали по одному: /userinfo &lt;tg_id&gt;');
    await replyLines(ctx, lines);
  });

  /** The admin's view of exactly what /list shows that user. */
  bot.chatType('private').command('userinfo', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const { lang } = who(ctx);
    const targetId = Number((ctx.match || '').trim());
    if (!Number.isFinite(targetId) || !targetId) {
      return ctx.reply('Использование: /userinfo &lt;tg_id&gt;', { parse_mode: 'HTML' });
    }
    const target = store.getUser(targetId);
    if (!target) return ctx.reply(`Пользователь ${targetId} не найден.`);

    const plan = store.effectivePlan(target);
    const searches = store.listSearches.all(targetId);
    const lines = [
      `<b>${targetId}</b> ${target.username ? '@' + esc(target.username) : '(без username)'}`,
      `Тариф: ${planLabel[plan]}` +
        (target.plan_until ? ` · до ${new Date(target.plan_until * 1000).toISOString().slice(0, 10)}` : '') +
        ` · язык ${target.lang} · мониторинг ${target.monitoring_enabled ? '🟢' : '🔴'}`,
      `Ссылок: ${searches.length}/${searchLimitFor(plan)}` +
        ` · активных ${searches.filter((s) => s.enabled).length}` +
        ` · отправлено ${searches.reduce((n, s) => n + s.sent_count, 0)}`,
      `Зарегистрирован: ${new Date(target.created_at * 1000).toISOString().slice(0, 10)}`,
      '',
    ];

    if (!searches.length) {
      lines.push('Ссылок нет.');
    } else {
      for (const search of searches) {
        lines.push(
          `${search.enabled ? '🟢' : '⏸'} <b>${esc(search.name)}</b> → ` +
            `${esc(destinationTitle(search, targetId, lang))} · отправлено ${search.sent_count}`,
        );
        lines.push(`   <a href="${esc(search.url)}">поиск</a>` +
          (search.last_run_at
            ? ` · проверен ${new Date(search.last_run_at * 1000).toISOString().replace('T', ' ').slice(5, 16)} UTC`
            : ' · ещё не проверялся'));
        if (search.last_error) lines.push(`   ⚠️ ${esc(search.last_error).slice(0, 200)}`);
      }
    }
    await replyLines(ctx, lines);
  });

  /**
   * Setting the pictures without touching the server: send the bot a photo.
   *
   * Deliberately absent from every command list, admin scope included — they
   * are used a handful of times in the life of the deployment, and a menu entry
   * for them would be noise. Typing them still works.
   */
  const imageCommand = (kind, command) => async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const { lang } = who(ctx);
    const what = t(lang, `image.what.${kind}`);
    const arg = (ctx.match || '').trim().toLowerCase();

    if (['clear', 'off', 'remove', 'убрать'].includes(arg)) {
      forgetImage(kind);
      return ctx.reply(t(lang, 'image.cleared', { what }));
    }

    const replied = ctx.msg.reply_to_message?.photo;
    if (replied) return acceptPhoto(ctx, lang, kind, replied);

    setFlow(ctx.from.id, { step: `image:${kind}` });
    return ctx.reply(t(lang, 'image.usage', { what, command }), { parse_mode: 'HTML' });
  };

  async function acceptPhoto(ctx, lang, kind, sizes) {
    const what = t(lang, `image.what.${kind}`);
    const largest = sizes[sizes.length - 1]; // Telegram sorts them smallest first
    // One command captures exactly one photo, successful or not: leaving the
    // listener armed after a failure would quietly eat the next unrelated photo.
    flows.delete(ctx.from.id);
    try {
      const { bytes } = await adoptPhoto(ctx.api, largest.file_id, kind);
      await ctx.reply(
        t(lang, 'image.saved', {
          what,
          kb: Math.max(1, Math.round(bytes / 1024)),
          check: kind === 'start' ? '/start' : '/help',
        }),
      );
    } catch (err) {
      logger.warn(`could not adopt ${kind} image: ${err.message}`);
      await ctx.reply(t(lang, 'image.failed', { error: err.message }));
    }
  }

  bot.chatType('private').command('setstartimage', imageCommand('start', '/setstartimage'));
  bot.chatType('private').command('sethelpimage', imageCommand('help', '/sethelpimage'));

  // the photo sent right after the command
  bot.chatType('private').on('message:photo', async (ctx, next) => {
    const flow = getFlow(ctx.from.id);
    const kind = flow?.step?.startsWith('image:') ? flow.step.slice('image:'.length) : null;
    if (!kind || !isAdmin(ctx.from.id)) return next();
    const { lang } = who(ctx);
    await acceptPhoto(ctx, lang, kind, ctx.msg.photo);
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
      return ctx.reply(t(lang, 'common.notUnderstood'), {
        reply_markup: mainMenu(lang, { monitoring: !!store.getUser(ctx.from.id).monitoring_enabled }),
      });
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
      return ctx.reply(t(lang, 'rename.ok'), { reply_markup: menuOnlyKb(lang) });
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
