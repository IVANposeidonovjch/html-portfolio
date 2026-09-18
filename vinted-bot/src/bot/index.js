import { Bot, GrammyError, InlineKeyboard } from 'grammy';
import {
  PLANS, PUBLIC_PLANS, SELLABLE_PLANS, burstFor, config, intervalFor, searchLimitFor, starsFor, usdFor,
} from '../config.js';
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
/**
 * Ratios for the comparison, computed from the live numbers rather than written
 * into the copy — so the sentence stays true when a tier is retuned. A ratio of
 * one is not worth a line, which is why each clause is added only if it differs.
 */
const times = (ratio) => (Number.isInteger(ratio) ? String(ratio) : ratio.toFixed(1));

function nextTierPitch(lang, plan) {
  const at = PUBLIC_PLANS.indexOf(plan);
  // a reserved tier is not on the ladder at all; indexOf gives -1 there, and
  // -1 + 1 would have offered its holder an "upgrade" to the cheapest plan
  if (at === -1) return [];
  const next = PUBLIC_PLANS[at + 1];
  if (!next) return []; // already at the top of what is sold

  const lines = [
    '',
    t(lang, 'plan.next.header', { next: planName(lang, next), current: planName(lang, plan) }),
  ];
  const speed = intervalFor(plan) / intervalFor(next);
  const links = searchLimitFor(next) / searchLimitFor(plan);
  const burst = burstFor(next) / burstFor(plan);
  const delta = usdFor(next) - usdFor(plan);

  if (speed > 1) lines.push(t(lang, 'plan.next.speed', { times: times(speed) }));
  if (links > 1) lines.push(t(lang, 'plan.next.links', { times: times(links) }));
  if (burst > 1) lines.push(t(lang, 'plan.next.burst', { times: times(burst) }));
  if (lines.length === 2) {
    // nothing measurable differs; say what does rather than an empty promise
    lines.push(
      t(lang, 'plan.next.same', {
        links: searchLimitFor(next),
        currentLinks: searchLimitFor(plan),
      }),
    );
  }
  if (delta > 0) lines.push(t(lang, 'plan.next.price', { delta }));
  return lines;
}

/** Plan names are product copy, so they live in the locales like everything else. */
const planName = (lang, plan) => t(lang, `plan.name.${plan}`);
const priceTag = (plan) => (usdFor(plan) ? `$${usdFor(plan)}` : '$0');

/**
 * What this account may actually hold: the plan's allowance plus any links
 * bought on top of it. Add-ons ride on a paid plan and are cleared with it.
 */
const linkLimit = (user, plan) =>
  searchLimitFor(plan) + (plan === 'free' ? 0 : user.extra_links || 0);

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
    throw err;
  }
}

/**
 * Reply to a command, or edit the message a button was pressed on.
 *
 * The welcome may be a photo with the menu in its caption, and a photo has no
 * text to edit — rewriting its caption instead turned the picture into a
 * backdrop for every later screen, so "Send a Vinted URL" appeared under a
 * marketing image. The picture belongs to the welcome alone: when a button on
 * it is pressed, its buttons are retired and the next screen arrives as its own
 * text message, which all further navigation then edits in place as usual.
 */
const render = async (ctx, text, options) => {
  const pressedOn = ctx.callbackQuery?.message;
  if (!pressedOn) return ctx.reply(text, options);
  if (pressedOn.photo) {
    await ctx.editMessageReplyMarkup().catch(() => {});
    return ctx.reply(text, options);
  }
  return safeEdit(ctx, text, options);
};

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

  /**
   * /support is a two-way relay, not a ticket system: the user writes, the
   * message reaches whoever answers, and a reply to it comes back. This handler
   * sits ahead of everything else so an answer is never mistaken for a command.
   */
  bot.chatType('private').on('message:text', async (ctx, next) => {
    if (!config.supportId || ctx.from.id !== config.supportId) return next();
    const replyTo = ctx.msg.reply_to_message?.message_id;
    if (!replyTo) return next();

    const userId = store.support.userFor(replyTo);
    if (!userId) return ctx.reply(t(store.getUser(ctx.from.id)?.lang || 'en', 'support.lost'));

    const target = store.getUser(userId);
    await ctx.api.sendMessage(userId, t(target?.lang || 'en', 'support.replied', { text: ctx.msg.text }), {
      parse_mode: 'HTML',
    });
    await ctx.reply(t(store.getUser(ctx.from.id)?.lang || 'en', 'support.delivered'));
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

  const supportOpt = { support: !!config.supportId };

  /** Help doubles as the second level: plan, language and chats live here. */
  async function showHelp(ctx) {
    const { lang } = who(ctx);
    const demo = imageFor('help');
    const html = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };

    // No picture: one message, mockup inside, buttons under it.
    if (!demo) {
      return render(ctx, helpText(lang, false), { ...html, reply_markup: helpKb(lang, supportOpt) });
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
    await ctx.api.sendMessage(ctx.chat.id, tail, { ...html, reply_markup: helpKb(lang, supportOpt) });
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

  const askSupport = async (ctx) => {
    const { lang } = who(ctx);
    if (!config.supportId) return render(ctx, t(lang, 'support.off'), { reply_markup: menuOnlyKb(lang) });
    setFlow(ctx.from.id, { step: 'support' });
    return render(ctx, t(lang, 'support.ask'), { reply_markup: cancelKb(lang) });
  };

  bot.chatType('private').command('support', askSupport);
  bot.callbackQuery('m:support', async (ctx) => {
    await ctx.answerCallbackQuery();
    await askSupport(ctx);
  });

  /** Pass one message on, and remember where the answer has to come back to. */
  async function relayToSupport(ctx, lang, text) {
    const { user } = who(ctx);
    const plan = store.effectivePlan(user);
    const sent = await ctx.api.sendMessage(
      config.supportId,
      t(lang, 'support.from', {
        who: user.username ? `@${esc(user.username)}` : esc(ctx.from.first_name || '—'),
        id: user.tg_id,
        lang: user.lang,
        plan: planName('en', plan),
        text: esc(text),
      }),
      { parse_mode: 'HTML' },
    );
    store.support.remember(sent.message_id, user.tg_id);
    flows.delete(ctx.from.id);
    await ctx.reply(t(lang, 'support.sent'), { reply_markup: menuOnlyKb(lang) });
  }

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
    const limit = linkLimit(user, plan);
    if (store.countSearches.get(user.tg_id).n >= limit) {
      return render(ctx, t(lang, 'add.limit', { plan: planName(lang, plan), limit }), {
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

  /**
   * A destination was picked. For a draft that means a new search; for a search
   * being redirected it means moving it — same picker, one place to decide.
   */
  function applyDestination(ownerId, lang, flow, chatId, threadId) {
    if (flow.redirectId) {
      store.redirectSearch.run(chatId, threadId, flow.redirectId, ownerId);
      flows.delete(ownerId);
      const moved = store.getSearch.get(flow.redirectId);
      return t(lang, 'search.destChanged', {
        name: moved.name,
        dest: destinationTitle(moved, ownerId, lang),
      });
    }
    return createSearch(ownerId, lang, flow, chatId, threadId);
  }

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
      limit: linkLimit(user, plan),
      state: t(lang, user.monitoring_enabled ? 'state.on' : 'state.off'),
      seconds: intervalFor(plan),
      plan: planName(lang, plan),
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

  /**
   * Change where an existing search posts. The picker is the one used when a
   * search is created — same screens, same topic creation — with the flow
   * carrying a search id instead of a draft.
   */
  bot.callbackQuery(/^s:dest:(\d+)$/, async (ctx) => {
    const { lang } = who(ctx);
    const search = store.getSearch.get(Number(ctx.match[1]));
    await ctx.answerCallbackQuery();
    if (!search || search.user_id !== ctx.from.id) return;
    setFlow(ctx.from.id, { step: 'dest', redirectId: search.id, name: search.name });
    const chats = store.listChats.all(ctx.from.id);
    await safeEdit(ctx, t(lang, 'add.askDest'), {
      reply_markup: destinationKb(lang, chats, topicsByChat(chats)),
    });
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

  /**
   * Reaching a tier is the one moment a user is definitely paying attention, so
   * it gets its own message: copy written for that tier, carrying the numbers it
   * actually bought, and its own picture when one is set.
   */
  async function announceTier(userId, plan) {
    if (plan === 'free') return;
    const target = store.getUser(userId);
    const lang = target?.lang || 'en';
    const text = t(lang, `tier.welcome.${plan}`, {
      links: searchLimitFor(plan),
      interval: intervalFor(plan),
      burst: burstFor(plan),
    });
    const picture = imageFor(`tier_${plan}`);
    try {
      if (picture) {
        await bot.api.sendPhoto(userId, picture, { caption: text, parse_mode: 'HTML' });
      } else {
        await bot.api.sendMessage(userId, text, { parse_mode: 'HTML' });
      }
    } catch (err) {
      // a congratulation must never cost someone the plan they just paid for
      logger.warn(`tier welcome not sent to ${userId}: ${err.description || err.message}`);
    }
  }

  /* -------------------------------- plan --------------------------------- */

  const showPlan = async (ctx) => {
    const { user, lang } = who(ctx);
    const plan = store.effectivePlan(user);
    const addon = config.payments.addon;

    const lines = [
      t(lang, 'plan.title', { plan: planName(lang, plan) }),
      t(lang, 'plan.interval', { seconds: intervalFor(plan) }),
      t(lang, 'plan.limit', { limit: linkLimit(user, plan) }),
      t(lang, 'plan.used', { count: store.countSearches.get(user.tg_id).n }),
      t(lang, 'plan.burst', { count: burstFor(plan) }),
    ];
    if (user.extra_links && plan !== 'free') {
      lines.push(t(lang, 'plan.addon', { count: user.extra_links }));
    }
    if (user.plan_until && plan !== 'free') {
      lines.push(t(lang, 'plan.until', { date: new Date(user.plan_until * 1000).toISOString().slice(0, 10) }));
    }

    // The comparison lists what is for sale. The reserved tier is not in
    // PUBLIC_PLANS, so it cannot leak into it by anyone adding a line here.
    lines.push('', t(lang, 'plan.tiersHeader'));
    for (const tier of PUBLIC_PLANS) {
      lines.push(
        (tier === plan ? '▸ ' : '') +
          t(lang, 'plan.tierRow', {
            name: planName(lang, tier),
            price: priceTag(tier),
            interval: intervalFor(tier),
            links: searchLimitFor(tier),
            burst: burstFor(tier),
          }),
      );
    }
    lines.push(...nextTierPitch(lang, plan));
    lines.push('', t(lang, 'plan.scarcity'));
    if (addon.stars) {
      lines.push(t(lang, 'plan.addonOffer', { links: addon.links, price: `$${addon.usd}` }));
    }

    const kb = new InlineKeyboard();
    for (const tier of SELLABLE_PLANS) {
      if (starsFor(tier)) kb.text(`${planName(lang, tier)} · ${starsFor(tier)} ⭐`, `buy:${tier}`).row();
    }
    if (addon.stars) {
      kb.text(t(lang, 'btn.addon', { links: addon.links, stars: addon.stars }), 'buy:addon').row();
    }
    await render(ctx, lines.join('\n'), { parse_mode: 'HTML', reply_markup: backRow(kb, lang) });
  };

  bot.chatType('private').command('plan', showPlan);
  bot.callbackQuery('m:plan', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPlan(ctx);
  });

  bot.callbackQuery(/^buy:(\w+)$/, async (ctx) => {
    const { user, lang } = who(ctx);
    const what = ctx.match[1];
    await ctx.answerCallbackQuery();

    if (what === 'addon') {
      const addon = config.payments.addon;
      if (!addon.stars) return;
      // extra links sit on top of a plan; on free there is nothing to sit on
      if (store.effectivePlan(user) === 'free') {
        return ctx.reply(t(lang, 'addon.needPlan'));
      }
      return ctx.api.sendInvoice(
        ctx.chat.id,
        t(lang, 'btn.addon', { links: addon.links, stars: addon.stars }),
        t(lang, 'plan.addonOffer', { links: addon.links, price: `$${addon.usd}` }),
        'addon:links',
        'XTR',
        [{ label: `+${addon.links}`, amount: addon.stars }],
      );
    }

    // Only what is on sale: the reserved tier has no price and no button, and
    // a hand-crafted callback for it must not open an invoice either.
    if (!SELLABLE_PLANS.includes(what) || !starsFor(what)) return;
    await ctx.api.sendInvoice(
      ctx.chat.id,
      `Vinted Monitor ${planName(lang, what)}`,
      t(lang, 'plan.invoiceDesc', {
        days: config.payments.planDays,
        seconds: intervalFor(what),
        limit: searchLimitFor(what),
      }),
      `plan:${what}`,
      'XTR',
      [{ label: planName(lang, what), amount: starsFor(what) }],
    );
  });

  bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

  bot.on('message:successful_payment', async (ctx) => {
    const { user, lang } = who(ctx);
    const [kind, what] = ctx.msg.successful_payment.invoice_payload.split(':');

    if (kind === 'addon') {
      const addon = config.payments.addon;
      store.addExtraLinks.run(addon.links, user.tg_id);
      const fresh = store.getUser(user.tg_id);
      return ctx.reply(
        t(lang, 'addon.bought', {
          links: addon.links,
          total: linkLimit(fresh, store.effectivePlan(fresh)),
        }),
      );
    }

    if (kind !== 'plan' || !SELLABLE_PLANS.includes(what)) return;
    const base = Math.max(store.now(), user.plan_until || 0);
    const upgrade = store.effectivePlan(user) !== what;
    store.setPlan.run(what, base + config.payments.planDays * 86400, user.tg_id);
    await ctx.reply(t(lang, 'pay.ok', { plan: planName(lang, what), days: config.payments.planDays }));
    // an extension of the same plan is not a new tier to celebrate
    if (upgrade) await announceTier(user.tg_id, what);
  });

  /* -------------------------------- admin -------------------------------- */

  bot.chatType('private').command('grant', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const [id, plan, days] = (ctx.match || '').trim().split(/\s+/);
    if (!id || !PLANS.includes(plan)) {
      return ctx.reply(`Usage: /grant <tg_id> <${PLANS.join('|')}> [days]`);
    }
    store.upsertUser(Number(id), null);
    const until = plan === 'free' ? null : store.now() + (Number(days) || 30) * 86400;
    const before = store.effectivePlan(store.getUser(Number(id)));
    store.setPlan.run(plan, until, Number(id));
    // a hand-assigned plan starts clean: bought links belonged to the old one
    store.resetExtraLinks.run(Number(id));
    if (before !== plan) await announceTier(Number(id), plan);
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
          `${planName('ru', plan)}${expired ? ` (был ${planName('ru', row.plan)}, истёк)` : ''} · ` +
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
      `Тариф: ${planName('ru', plan)}` +
        (target.plan_until ? ` · до ${new Date(target.plan_until * 1000).toISOString().slice(0, 10)}` : '') +
        ` · язык ${target.lang} · мониторинг ${target.monitoring_enabled ? '🟢' : '🔴'}`,
      `Ссылок: ${searches.length}/${linkLimit(target, plan)}` +
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
    const what = kind.startsWith('tier_')
      ? planName(lang, kind.slice('tier_'.length))
      : t(lang, `image.what.${kind}`);
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
    const what = kind.startsWith('tier_')
      ? planName(lang, kind.slice('tier_'.length))
      : t(lang, `image.what.${kind}`);
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
          check: kind === 'start' ? '/start' : kind === 'help' ? '/help' : '/plan',
        }),
      );
    } catch (err) {
      logger.warn(`could not adopt ${kind} image: ${err.message}`);
      await ctx.reply(t(lang, 'image.failed', { error: err.message }));
    }
  }

  /** Friendly names for the tiers, so the command reads the way the tier does. */
  const TIER_ALIASES = {
    hunter: 'basic', basic: 'basic',
    ranger: 'pro', pro: 'pro',
    sniper: 'turbo', 'sniper_elite': 'turbo', turbo: 'turbo',
    elite_max: 'elite_max', max: 'elite_max',
  };

  bot.chatType('private').command('settierimage', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const { lang } = who(ctx);
    const [nameArg, ...rest] = (ctx.match || '').trim().toLowerCase().split(/\s+/);
    const plan = TIER_ALIASES[nameArg];
    if (!plan) {
      return ctx.reply(`Usage: /settierimage <${Object.keys(TIER_ALIASES).join('|')}> [clear]`);
    }
    // from here it behaves exactly like the other picture commands
    return imageCommand(`tier_${plan}`, `/settierimage ${nameArg}`)({
      ...ctx,
      match: rest.join(' '),
      msg: ctx.msg,
      from: ctx.from,
      reply: (...args) => ctx.reply(...args),
      api: ctx.api,
    });
  });

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
    const done = applyDestination(ctx.from.id, lang, flow, chat.tg_chat_id, topic.message_thread_id);
    await ctx.editMessageText(`${t(lang, 'topic.created', { name: flow.name })}\n\n${done}`);
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

    await ctx.editMessageText(applyDestination(ctx.from.id, lang, flow, chatId, threadId), {
      reply_markup: menuOnlyKb(lang),
    });
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

    if (flow.step === 'support') return relayToSupport(ctx, lang, text);

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
