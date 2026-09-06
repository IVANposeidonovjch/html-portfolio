import { InlineKeyboard, Keyboard } from 'grammy';

export const BTN = {
  add: '➕ Добавить ссылку',
  list: '📋 Мои ссылки',
  chats: '👥 Мои чаты',
  toggle: '⏯ Мониторинг',
  plan: '💳 Тариф',
  help: '❓ Помощь',
};

export const mainMenu = new Keyboard()
  .text(BTN.add).text(BTN.list).row()
  .text(BTN.chats).text(BTN.toggle).row()
  .text(BTN.plan).text(BTN.help)
  .resized()
  .persistent();

export const cancelKb = new InlineKeyboard().text('✖️ Отмена', 'cancel');

export function destinationKb(chats, topicsByChat) {
  const kb = new InlineKeyboard().text('📩 В личку', 'dest:private').row();
  for (const chat of chats) {
    if (chat.type === 'private') continue;
    const topics = topicsByChat.get(chat.id) || [];
    if (topics.length) {
      kb.text(`📂 ${chat.title} (тем: ${topics.length})`, `destchat:${chat.id}`).row();
    } else {
      kb.text(`👥 ${chat.title}`, `dest:chat:${chat.id}`).row();
    }
  }
  return kb.text('✖️ Отмена', 'cancel');
}

export function topicKb(chat, topics) {
  const kb = new InlineKeyboard();
  kb.text(`👥 Вся группа «${chat.title}»`, `dest:chat:${chat.id}`).row();
  for (const t of topics) kb.text(`# ${t.name}`, `dest:topic:${t.id}`).row();
  return kb.text('⬅️ Назад', 'dest:back');
}

export function searchListKb(searches) {
  const kb = new InlineKeyboard();
  for (const s of searches) {
    kb.text(`${s.enabled ? '🟢' : '⏸'} ${s.name}`, `s:open:${s.id}`).row();
  }
  return kb;
}

export function searchKb(search) {
  return new InlineKeyboard()
    .url('🔗 Открыть поиск', search.url).row()
    .text(search.enabled ? '⏸ Выключить' : '▶️ Включить', `s:toggle:${search.id}`)
    .text('✏️ Переименовать', `s:rename:${search.id}`).row()
    .text('🗑 Удалить', `s:del:${search.id}`)
    .text('⬅️ К списку', 's:list');
}

export const confirmDeleteKb = (id) =>
  new InlineKeyboard().text('🗑 Да, удалить', `s:delok:${id}`).text('⬅️ Отмена', `s:open:${id}`);

export function chatsKb(chats, topicsByChat) {
  const kb = new InlineKeyboard();
  for (const chat of chats) {
    if (chat.type === 'private') continue;
    const topics = topicsByChat.get(chat.id) || [];
    const label = topics.length ? `${chat.title} · тем: ${topics.length}` : chat.title;
    kb.text(`🗑 ${label}`, `chat:del:${chat.id}`).row();
  }
  return kb;
}
