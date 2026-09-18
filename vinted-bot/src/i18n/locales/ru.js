export const ru = {
  'btn.add': '➕ Добавить ссылку',
  'btn.list': '📋 Мои ссылки',
  'btn.chats': '👥 Мои чаты',
  'btn.toggle': '⏯ Мониторинг',
  'btn.plan': '💳 Тариф',
  'btn.help': '❓ Помощь',
  'btn.lang': '🌐 Язык',

  'start.text': `⚡️ <b>Vinted Monitor</b> 👟👜

🔎 Ты настраиваешь поиск на Vinted — я слежу за ним и 🔔 присылаю сюда каждое новое объявление через секунды после публикации. Пока остальные обновляют страницу, ты уже пишешь продавцу. 🏃‍♂️💨

🔗 Одна ссылка = один поиск. Сколько угодно — 📩 в личку или 🧵 по темам группы.`,

  'help.text': `⚡️ <b>Vinted Monitor</b> — новые объявления Vinted за секунды.

🔎 <b>Как добавить поиск</b>
1. Настрой фильтры на Vinted: бренд, категория, размер, цена.
2. Скопируй URL страницы поиска.
3. «➕ Добавить ссылку» → пришли URL → назови его (<i>Raf</i>).
4. Выбери, куда слать: сюда, в группу или в тему.

{example}

🧵 <b>Группы и темы</b>
Добавь бота админом в группу и напиши там <code>/bind</code>. Включишь «Темы» — бот сам заведёт тему под каждый поиск: Raf, Helmut, Bags в одном месте.

🛡 <b>Без дублей</b>
Первый проход только запоминает выдачу. Одно объявление в одну тему приходит один раз, даже если совпало с десятью ссылками.

⚙️ <b>Настройки</b> — кнопками ниже: тариф, язык, список чатов.
⌨️ <b>Команды</b> — <code>/start</code>, <code>/add</code>, <code>/help</code>. Остальное кнопками.`,

  // the example section: a mockup when there is no picture, a pointer when there is
  'help.example': `🔔 <b>Так выглядит находка</b>
<i>[фото вещи]</i>
📌 <b>Raf Simons bomber</b>
💰 Цена : 240€
🏷 Бренд : Raf Simons
📏 Размер : L
#Raf
[ URL ]`,
  'help.exampleHint': '🔔 <b>Так выглядит находка</b> ⬇️',

  'add.askUrl': `Пришли ссылку на поиск Vinted.

Пример:
<code>https://www.vinted.de/catalog?search_text=raf+simons&amp;price_to=300</code>`,
  'add.askName': 'Как назвать этот поиск? Например: <i>Raf</i>, <i>Helmut Lang</i>, <i>Bags</i>.',
  'add.askDest': 'Куда присылать новые объявления?',
  'add.limit': 'Лимит тарифа {plan}: {limit} ссылок. Удали лишнее или подключи тариф выше (/plan).',
  'add.created':
    '✅ «{name}» добавлен.\nПроверка каждые ~{seconds} сек. Первый проход только запоминает текущие объявления — присылать буду начиная со следующих.',

  'url.err.notLink': 'Это не похоже на ссылку.',
  'url.err.scheme': 'Нужна http(s) ссылка.',
  'url.err.notVinted': 'Это не ссылка на Vinted.',
  'url.err.itemPage': 'Это ссылка на конкретный товар, а нужна ссылка на поиск (страница каталога).',
  'url.err.noFilters':
    'В ссылке нет ни одного фильтра — задай на Vinted бренд/категорию/цену и скопируй URL заново.',

  'list.empty': 'Пока нет ни одной ссылки. Нажми «➕ Добавить ссылку».',
  'list.header': '<b>Мои ссылки</b> ({count}/{limit})\nМониторинг: {state} · интервал {seconds} сек ({plan})',
  'state.on': '🟢 включён',
  'state.off': '🔴 выключен',

  'card.dest': 'Куда: {dest}',
  'card.status': 'Статус: {status}',
  'status.active': '🟢 активен',
  'status.paused': '⏸ выключен',
  'card.sent': 'Отправлено объявлений: {count}',
  'card.lastCheck': 'Последняя проверка: {time} UTC',
  'dest.private': 'личка',
  'dest.topic': 'тема #{id}',

  'kb.cancel': '✖️ Отмена',
  'kb.private': '📩 В личку',
  'kb.wholeGroup': '👥 Вся группа «{title}»',
  'kb.newTopic': '✨ Создать тему «{name}»',
  'kb.back': '⬅️ Назад',
  'kb.openSearch': '🔗 Открыть поиск',
  'kb.disable': '⏸ Выключить',
  'kb.enable': '▶️ Включить',
  'kb.rename': '✏️ Переименовать',
  'kb.delete': '🗑 Удалить',
  'kb.toList': '⬅️ К списку',
  'kb.yesDelete': '🗑 Да, удалить',
  'kb.topicsCount': '📂 {title} (тем: {count})',

  'chats.header': '<b>Мои чаты</b>',
  'chats.empty': 'Нет привязанных групп и каналов.',
  'chats.hint':
    'Добавить: закинь бота в группу админом и напиши там <code>/bind</code>. Если в группе включены темы, бот создаст тему под каждый поиск сам.',
  'chats.unbound': 'Отвязано',

  'bind.onlyInGroup': 'Команду /bind нужно писать <b>внутри группы</b>, куда бот уже добавлен.',
  'bind.onlyAdmin': 'Привязать чат может только его администратор.',
  'bind.limit': 'Лимит чатов: {limit}.',
  'bind.topicOk': '✅ Тема «{name}» в «{title}» привязана.',
  'bind.groupOk':
    '✅ Группа «{title}» привязана. Включи «Темы» — и бот будет создавать тему под каждый поиск сам.',
  'bind.notBound': 'Этот чат не привязан.',
  'bind.unbound': 'Чат отвязан. Поиски, которые слали сюда, остановлены — переназначь их в личке бота.',
  'bind.channelOk': '✅ Канал «{title}» привязан.',
  'bind.channelNeedAdmin': 'Сначала добавь бота админом в этот канал, потом перешли пост ещё раз.',
  'bind.channelNotSeen': 'Не вижу канал. Добавь бота админом и перешли пост ещё раз.',

  'topic.created': '✅ Тема «{name}» создана, поиск привязан к ней.',
  'topic.createFailed':
    '⚠️ Не смог создать тему: {error}\nДай боту право «Управление темами» или выбери тему вручную.',

  'toggle.on': '🟢 Мониторинг включён.',
  'toggle.off': '🔴 Мониторинг выключен.',

  'plan.title': '<b>Тариф: {plan}</b>',
  'plan.interval': 'Интервал проверки: ~{seconds} сек',
  'plan.burst': 'Скорость доставки: до {count} объявлений подряд',
  'plan.limit': 'Лимит ссылок: {limit}',
  'plan.used': 'Используется: {count}',
  'plan.until': 'Действует до: {date}',
  'plan.tiers': 'Free — {free} сек · Basic — {basic} сек · Pro — {pro} сек',
  'plan.invoiceDesc': '{days} дней · интервал ~{seconds} сек · до {limit} ссылок',
  'pay.ok': '✅ Тариф {plan} активирован на {days} дней.',

  'lang.choose': 'Выбери язык интерфейса:',
  'lang.set': '✅ Язык переключён на русский.',

  'rename.ask': 'Новое название для «{name}»?',
  'rename.ok': '✅ Переименовано.',
  'delete.confirm': 'Удалить «{name}»?',
  'delete.done': 'Удалено',

  'common.cancelled': 'Отменено',
  'common.expired': 'Сессия истекла, начни заново: /add',
  'common.notUnderstood': 'Не понял. Открой меню кнопками ниже или /help.',
  'common.enabled': 'Включено',
  'common.disabled': 'Выключено',

  'item.noTitle': 'Без названия',
  'item.price': 'Цена',
  'item.brand': 'Бренд',
  'item.size': 'Размер',
  'item.button': 'URL',

  'send.searchDisabled': '⚠️ Поиск «{name}» выключен: не могу писать в целевой чат ({error}).',
  'migrate.done':
    'ℹ️ Группа «{title}» стала супергруппой — перенёс {count} поиск(ов) на новый чат, ничего делать не нужно.',

  // Telegram command menu (setMyCommands)
  'cmd.start': 'Запустить бота',
  'cmd.add': 'Добавить ссылку',
  'cmd.list': 'Мои ссылки',
  'cmd.chats': 'Мои чаты и темы',
  'cmd.pause': 'Выключить мониторинг',
  'cmd.resume': 'Включить мониторинг',
  'cmd.plan': 'Тариф и лимиты',
  'cmd.lang': 'Язык / Language',
  'cmd.help': 'Как пользоваться',
  'cmd.bind': 'Привязать эту группу или тему',
  'cmd.unbind': 'Отвязать этот чат',
  'cmd.users': 'Все пользователи',
  'cmd.userinfo': 'Данные пользователя',
  'cmd.stats': 'Статистика системы',
  'cmd.grant': 'Выдать тариф',

  // inline menu
  'menu.removed': 'Меню переехало в кнопки под сообщениями — нижняя клавиатура больше не нужна.',
  'menu.title': '<b>Vinted Monitor</b>\nВыбери действие:',
  'btn.toggleOn': '⏸ Мониторинг: включён',
  'btn.toggleOff': '▶️ Мониторинг: выключен',
  'kb.menu': '⬅️ Меню',

  // admin image commands
  'image.what.start': 'приветствия /start',
  'image.what.help': 'примера в /help',
  'image.usage': '🖼 Пришли фото для {what} — ответом на эту команду или следующим сообщением.\nУбрать картинку: <code>{command} clear</code>',
  'image.saved': '✅ Картинка для {what} сохранена ({kb} КБ). Проверь командой {check}.',
  'image.failed': '⚠️ Не удалось сохранить картинку: {error}',
  'image.cleared': '🗑 Картинка для {what} убрана.',
  'image.notPhoto': 'Это не фотография. Пришли именно фото (можно и файлом-картинкой, но тогда — как фото).',
};
