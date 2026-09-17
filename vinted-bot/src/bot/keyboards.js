import { InlineKeyboard, Keyboard } from 'grammy';
import { LANGS, t } from '../i18n/index.js';

export const mainMenu = (lang) =>
  new Keyboard()
    .text(t(lang, 'btn.add')).text(t(lang, 'btn.list')).row()
    .text(t(lang, 'btn.chats')).text(t(lang, 'btn.toggle')).row()
    .text(t(lang, 'btn.plan')).text(t(lang, 'btn.help')).row()
    .text(t(lang, 'btn.lang'))
    .resized()
    .persistent();

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

export function searchListKb(searches) {
  const kb = new InlineKeyboard();
  for (const s of searches) kb.text(`${s.enabled ? '🟢' : '⏸'} ${s.name}`, `s:open:${s.id}`).row();
  return kb;
}

export function searchKb(lang, search) {
  return new InlineKeyboard()
    .url(t(lang, 'kb.openSearch'), search.url).row()
    .text(t(lang, search.enabled ? 'kb.disable' : 'kb.enable'), `s:toggle:${search.id}`)
    .text(t(lang, 'kb.rename'), `s:rename:${search.id}`).row()
    .text(t(lang, 'kb.delete'), `s:del:${search.id}`)
    .text(t(lang, 'kb.toList'), 's:list');
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
  return kb;
}

export const langKb = (current) => {
  const kb = new InlineKeyboard();
  for (const { code, label } of LANGS) {
    kb.text(`${code === current ? '✅ ' : ''}${label}`, `lang:${code}`).row();
  }
  return kb;
};
