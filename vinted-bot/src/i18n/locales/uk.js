export const uk = {
  'btn.add': '➕ Додати посилання',
  'btn.list': '📋 Мої посилання',
  'btn.chats': '👥 Мої чати',
  'btn.toggle': '⏯ Моніторинг',
  'btn.plan': '💳 Тариф',
  'btn.help': '❓ Довідка',
  'btn.lang': '🌐 Мова',

  'help.text': `<b>Vinted Monitor</b> — нові оголошення Vinted одразу в Telegram.

<b>Як користуватися</b>
1. На Vinted налаштуй пошук: бренд, категорія, розмір, ціна.
2. Скопіюй URL сторінки пошуку.
3. «➕ Додати посилання» → надішли URL → дай назву (наприклад <i>Raf</i>).
4. Обери, куди слати: у приватні, у групу або в тему групи.

<b>Групи та теми</b>
• Створи групу → додай бота адміном → напиши там <code>/bind</code>.
• Увімкни «Теми» — і бот сам створить тему під кожен пошук, вручну робити нічого не треба.
• Канал: додай бота адміном і перешли мені будь-який допис звідти.

<b>Команди</b>
/add /list /chats /bind /pause /resume /plan /lang`,

  'add.askUrl': `Надішли посилання на пошук Vinted.

Приклад:
<code>https://www.vinted.de/catalog?search_text=raf+simons&amp;price_to=300</code>`,
  'add.askName': 'Як назвати цей пошук? Наприклад <i>Raf</i>, <i>Helmut Lang</i>, <i>Bags</i>.',
  'add.askDest': 'Куди надсилати нові оголошення?',
  'add.limit': 'Ліміт тарифу {plan}: {limit} посилань. Видали зайве або обери вищий тариф (/plan).',
  'add.created':
    '✅ «{name}» додано.\nПеревірка кожні ~{seconds} сек. Перший прохід лише запамʼятовує наявні оголошення — надсилатиму з наступних.',

  'url.err.notLink': 'Це не схоже на посилання.',
  'url.err.scheme': 'Потрібне http(s) посилання.',
  'url.err.notVinted': 'Це не посилання на Vinted.',
  'url.err.itemPage': 'Це посилання на окремий товар, а потрібна сторінка пошуку (каталог).',
  'url.err.noFilters':
    'У посиланні немає жодного фільтра — задай на Vinted бренд/категорію/ціну і скопіюй URL знову.',

  'list.empty': 'Поки немає жодного посилання. Натисни «➕ Додати посилання».',
  'list.header': '<b>Мої посилання</b> ({count}/{limit})\nМоніторинг: {state} · інтервал {seconds} сек ({plan})',
  'state.on': '🟢 увімкнено',
  'state.off': '🔴 вимкнено',

  'card.dest': 'Куди: {dest}',
  'card.status': 'Статус: {status}',
  'status.active': '🟢 активний',
  'status.paused': '⏸ вимкнений',
  'card.sent': 'Надіслано оголошень: {count}',
  'card.lastCheck': 'Остання перевірка: {time} UTC',
  'dest.private': 'приватні',
  'dest.topic': 'тема #{id}',

  'kb.cancel': '✖️ Скасувати',
  'kb.private': '📩 У приватні',
  'kb.wholeGroup': '👥 Уся група «{title}»',
  'kb.newTopic': '✨ Створити тему «{name}»',
  'kb.back': '⬅️ Назад',
  'kb.openSearch': '🔗 Відкрити пошук',
  'kb.disable': '⏸ Вимкнути',
  'kb.enable': '▶️ Увімкнути',
  'kb.rename': '✏️ Перейменувати',
  'kb.delete': '🗑 Видалити',
  'kb.toList': '⬅️ До списку',
  'kb.yesDelete': '🗑 Так, видалити',
  'kb.topicsCount': '📂 {title} (тем: {count})',

  'chats.header': '<b>Мої чати</b>',
  'chats.empty': 'Немає підключених груп і каналів.',
  'chats.hint':
    'Додати: закинь бота в групу адміном і напиши там <code>/bind</code>. Якщо в групі увімкнені теми, бот створить тему під кожен пошук сам.',
  'chats.unbound': 'Відʼєднано',

  'bind.onlyInGroup': 'Команду /bind треба писати <b>всередині групи</b>, куди бота вже додано.',
  'bind.onlyAdmin': 'Підключити чат може лише його адміністратор.',
  'bind.limit': 'Ліміт чатів: {limit}.',
  'bind.topicOk': '✅ Тему «{name}» у «{title}» підключено.',
  'bind.groupOk':
    '✅ Групу «{title}» підключено. Увімкни «Теми» — і бот створюватиме тему під кожен пошук сам.',
  'bind.notBound': 'Цей чат не підключено.',
  'bind.unbound': 'Чат відʼєднано. Пошуки, що слали сюди, зупинені — перепризначʼ їх у приватних бота.',
  'bind.channelOk': '✅ Канал «{title}» підключено.',
  'bind.channelNeedAdmin': 'Спершу додай бота адміном у канал, потім перешли допис ще раз.',
  'bind.channelNotSeen': 'Не бачу канал. Додай бота адміном і перешли допис ще раз.',

  'topic.created': '✅ Тему «{name}» створено та привʼязано до пошуку.',
  'topic.createFailed':
    '⚠️ Не вдалося створити тему: {error}\nДай боту право «Керування темами» або обери тему вручну.',

  'toggle.on': '🟢 Моніторинг увімкнено.',
  'toggle.off': '🔴 Моніторинг вимкнено.',

  'plan.title': '<b>Тариф: {plan}</b>',
  'plan.interval': 'Інтервал перевірки: ~{seconds} сек',
  'plan.limit': 'Ліміт посилань: {limit}',
  'plan.used': 'Використано: {count}',
  'plan.until': 'Діє до: {date}',
  'plan.tiers': 'Free — {free} сек · Basic — {basic} сек · Pro — {pro} сек',
  'plan.invoiceDesc': '{days} днів · інтервал ~{seconds} сек · до {limit} посилань',
  'pay.ok': '✅ Тариф {plan} активовано на {days} днів.',

  'lang.choose': 'Обери мову інтерфейсу:',
  'lang.set': '✅ Мову змінено на українську.',

  'rename.ask': 'Нова назва для «{name}»?',
  'rename.ok': '✅ Перейменовано.',
  'delete.confirm': 'Видалити «{name}»?',
  'delete.done': 'Видалено',

  'common.cancelled': 'Скасовано',
  'common.expired': 'Сесія завершилась, почни спочатку: /add',
  'common.notUnderstood': 'Не зрозумів. Скористайся кнопками нижче або /help.',
  'common.enabled': 'Увімкнено',
  'common.disabled': 'Вимкнено',

  'item.noTitle': 'Без назви',
  'item.protection': '{total} із захистом',
  'item.button': 'URL',

  'send.searchDisabled': '⚠️ Пошук «{name}» вимкнено: не можу писати в цільовий чат ({error}).',
  'migrate.done':
    'ℹ️ Група «{title}» стала супергрупою — перенесено {count} пошук(ів) на новий чат, робити нічого не треба.',

  // Telegram command menu (setMyCommands)
  'cmd.add': 'Додати посилання',
  'cmd.list': 'Мої посилання',
  'cmd.chats': 'Мої чати та теми',
  'cmd.pause': 'Вимкнути моніторинг',
  'cmd.resume': 'Увімкнути моніторинг',
  'cmd.plan': 'Тариф і ліміти',
  'cmd.lang': 'Мова / Language',
  'cmd.help': 'Як користуватися',
  'cmd.bind': 'Підключити цю групу або тему',
  'cmd.unbind': 'Відключити цей чат',
  'cmd.users': 'Усі користувачі',
  'cmd.userinfo': 'Дані користувача',
  'cmd.stats': 'Статистика системи',
  'cmd.grant': 'Видати тариф',
};
