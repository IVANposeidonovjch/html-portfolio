import { InlineKeyboard } from 'grammy';
import { LANGS, t } from '../i18n/index.js';

/**
 * The menu lives on the bot's own messages, not on a keyboard nailed to the
 * bottom of the chat. Labels are rendered at send time, so a menu is always in
 * the language the user has now; the callback data behind them never changes,
 * so a button pressed in an old message still does the right thing.
 */
export const mainMenu = (lang, { monitoring = true } = {}) =>
  new InlineKeyboard()
    .text(t(lang, 'btn.add'), 'm:add').text(t(lang, 'btn.list'), 'm:list').row()
    .text(t(lang, 'btn.chats'), 'm:chats').row()
    .text(t(lang, monitoring ? 'btn.toggleOn' : 'btn.toggleOff'), 'm:toggle').row()
    .text(t(lang, 'btn.plan'), 'm:plan').text(t(lang, 'btn.lang'), 'm:lang').row()
    .text(t(lang, 'btn.help'), 'm:help');

/** Every screen that replaces the menu needs a way back to it. */
export const backRow = (kb, lang) => kb.text(t(lang, 'kb.menu'), 'm:home');

export const cancelKb = (lang) => new InlineKeyboard().text(t(lang, 'kb.cancel'), 'cancel');

export function destinationKb(lang, chats, topicsByChat) {
  const kb = new InlineKeyboard().text(t(lang, 'kb.private'), 'dest:private').row();
  for (const chat of chats) {
    if (chat.type === 'private') continue;
    const topics = topicsByChat.get(chat.id) || [];
    // A forum chat opens a second screen: create a topic, pick one, or post to the group.
    if (chat.is_forum || topics.length) {
      kb.text(t(lang, 'kb.topicsCount', { title: chat.title, count: topics.length }), `destchat:${chat.id}`).row();
    } else {
      kb.text(`👥 ${chat.title}`, `dest:chat:${chat.id}`).row();
    }
  }
  return kb.text(t(lang, 'kb.cancel'), 'cancel');
}

export function topicKb(lang, chat, topics, searchName) {
  const kb = new InlineKeyboard();
  if (chat.is_forum) {
    kb.text(t(lang, 'kb.newTopic', { name: searchName }), `dest:newtopic:${chat.id}`).row();
  }
  kb.text(t(lang, 'kb.wholeGroup', { title: chat.title }), `dest:chat:${chat.id}`).row();
  for (const topic of topics) kb.text(`# ${topic.name}`, `dest:topic:${topic.id}`).row();
  return kb.text(t(lang, 'kb.back'), 'dest:back');
}

export function searchListKb(lang, searches) {
  const kb = new InlineKeyboard();
  for (const s of searches) kb.text(`${s.enabled ? '🟢' : '⏸'} ${s.name}`, `s:open:${s.id}`).row();
  return backRow(kb, lang);
}

export function searchKb(lang, search) {
  return new InlineKeyboard()
    .url(t(lang, 'kb.openSearch'), search.url).row()
    .text(t(lang, search.enabled ? 'kb.disable' : 'kb.enable'), `s:toggle:${search.id}`)
    .text(t(lang, 'kb.rename'), `s:rename:${search.id}`).row()
    .text(t(lang, 'kb.delete'), `s:del:${search.id}`)
    .text(t(lang, 'kb.toList'), 's:list').row()
    .text(t(lang, 'kb.menu'), 'm:home');
}

export const confirmDeleteKb = (lang, id) =>
  new InlineKeyboard().text(t(lang, 'kb.yesDelete'), `s:delok:${id}`).text(t(lang, 'kb.cancel'), `s:open:${id}`);

export function chatsKb(lang, chats, topicsByChat) {
  const kb = new InlineKeyboard();
  for (const chat of chats) {
    if (chat.type === 'private') continue;
    const topics = topicsByChat.get(chat.id) || [];
    const label = topics.length ? `${chat.title} · ${topics.length}` : chat.title;
    kb.text(`🗑 ${label}`, `chat:del:${chat.id}`).row();
  }
  return backRow(kb, lang);
}

export const langKb = (current) => {
  const kb = new InlineKeyboard();
  for (const { code, label } of LANGS) {
    kb.text(`${code === current ? '✅ ' : ''}${label}`, `lang:${code}`).row();
  }
  return backRow(kb, current);
};

/** Plan screen and other read-only views: just a way home. */
export const menuOnlyKb = (lang) => backRow(new InlineKeyboard(), lang);
