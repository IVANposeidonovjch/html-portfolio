export const uk = {
  'btn.add': '➕ Додати посилання',
  'btn.list': '📋 Мої посилання',
  'btn.chats': '👥 Мої чати',
  'btn.toggle': '⏯ Моніторинг',
  'btn.plan': '💳 Тариф',
  'btn.help': '❓ Довідка',
  'btn.lang': '🌐 Мова',

  'start.text': `⚡️ <b>Vinted Monitor</b> 👟👜

🔎 Ти налаштовуєш пошук на Vinted — я стежу за ним і 🔔 надсилаю сюди кожне нове оголошення за секунди після публікації. Поки інші оновлюють сторінку, ти вже пишеш продавцю. 🏃‍♂️💨

🔗 Одне посилання = один пошук. Скільки завгодно — 📩 у приватні або 🧵 в теми групи.`,

  'help.text': `⚡️ <b>Vinted Monitor</b> — нові оголошення Vinted за секунди.

🔎 <b>Як додати пошук</b>
1. Налаштуй фільтри на Vinted: бренд, категорія, розмір, ціна.
2. Скопіюй URL сторінки пошуку.
3. «➕ Додати посилання» → надішли URL → назви його (<i>Raf</i>).
4. Обери, куди слати: сюди, у групу або в тему.

{example}

🧵 <b>Групи та теми</b>
Додай бота адміном у групу і напиши там <code>/bind</code>. Увімкнеш «Теми» — бот сам заведе тему під кожен пошук: Raf, Helmut, Bags в одному місці.

🛡 <b>Без дублів</b>
Перший прохід лише запамʼятовує видачу. Одне оголошення потрапляє в тему один раз, навіть якщо збіглося з десятьма посиланнями.

⚙️ <b>Налаштування</b> — кнопками нижче: тариф, мова, список чатів.
⌨️ <b>Команди</b> — <code>/start</code>, <code>/add</code>, <code>/help</code>. Решта кнопками.`,

  // the example section: a mockup when there is no picture, a pointer when there is
  'help.example': `🔔 <b>Так виглядає знахідка</b>
<i>[фото речі]</i>
📌 <b>Raf Simons bomber</b>
💰 Ціна : 240€
🏷 Бренд : Raf Simons
📏 Розмір : L
#Raf
[ URL ]`,
  'help.exampleHint': '🔔 <b>Так виглядає знахідка</b> ⬇️',

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
  'plan.burst': 'Швидкість доставки: до {count} оголошень поспіль',
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
  'item.price': 'Ціна',
  'item.brand': 'Бренд',
  'item.size': 'Розмір',
  'item.button': 'URL',

  'send.searchDisabled': '⚠️ Пошук «{name}» вимкнено: не можу писати в цільовий чат ({error}).',
  'migrate.done':
    'ℹ️ Група «{title}» стала супергрупою — перенесено {count} пошук(ів) на новий чат, робити нічого не треба.',

  // Telegram command menu (setMyCommands)
  'cmd.start': 'Запустити бота',
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

  // inline menu
  'menu.removed': 'Меню переїхало в кнопки під повідомленнями — нижня клавіатура більше не потрібна.',
  'menu.title': '<b>Vinted Monitor</b>\nОбери дію:',
  'btn.toggleOn': '⏸ Моніторинг: увімкнено',
  'btn.toggleOff': '▶️ Моніторинг: вимкнено',
  'kb.menu': '⬅️ Меню',

  // admin image commands
  'image.what.start': 'привітання /start',
  'image.what.help': 'прикладу в /help',
  'image.usage': '🖼 Надішли фото для {what} — відповіддю на цю команду або наступним повідомленням.\nПрибрати: <code>{command} clear</code>',
  'image.saved': '✅ Картинку для {what} збережено ({kb} КБ). Перевір командою {check}.',
  'image.failed': '⚠️ Не вдалося зберегти картинку: {error}',
  'image.cleared': '🗑 Картинку для {what} прибрано.',
  'image.notPhoto': 'Це не фото. Надішли саме фотографію, не файлом.',

  // plans, add-on, support, near-miss note
  'plan.name.free': 'Scout',
  'plan.name.basic': 'Hunter',
  'plan.name.pro': 'Ranger',
  'plan.name.turbo': 'Sniper Elite',
  'plan.name.elite_max': 'Elite Max 🔒',
  'plan.scarcity': '🔥 <b>Sniper Elite</b> — кількість місць обмежена.',
  'plan.tiersHeader': '<b>Тарифи</b>',
  'plan.tierRow': '{name} — {price} · перевірка {interval} с · {links} посилань · сплеск {burst}',
  'plan.addon': 'Докуплені посилання: +{count}',
  'plan.addonOffer': '➕ {links} посилань за {price} — до будь-якого платного тарифу.',
  'btn.addon': '➕{links} посилань · {stars} ⭐',
  'addon.bought': '✅ +{links} посилань. Тепер доступно {total}.',
  'addon.needPlan': 'Докуповувати посилання можна на платному тарифі — обери його нижче.',
  'btn.support': '🆘 Підтримка',
  'support.ask': '🆘 Напиши повідомлення одним текстом — передам у підтримку і принесу відповідь сюди.',
  'support.sent': '✅ Надіслано. Відповідь прийде в цей чат.',
  'support.off': 'Підтримка зараз недоступна. Спробуй пізніше.',
  'support.from': '🆘 <b>Звернення</b>\nВід: {who} (<code>{id}</code>), мова {lang}, тариф {plan}\n\n{text}\n\n<i>Відповідай на це повідомлення — відповідь піде користувачу.</i>',
  'support.replied': '💬 <b>Відповідь підтримки</b>\n\n{text}',
  'support.delivered': '✅ Надіслано користувачу.',
  'support.lost': 'Не бачу, кому це адресовано — відповідай на саме звернення.',
  'fomo.note': '⏱ Це оголошення висіло {seconds} с до того, як ти його побачив. <b>Sniper Elite</b> бачить такі миттєво.',
  'kb.changeDest': '📍 Куди слати',
  'search.destChanged': '✅ Тепер «{name}» іде в {dest}.',

  // what the next tier up actually buys
  'plan.next.header': '⬆️ <b>{next}</b> порівняно з твоїм {current}:',
  'plan.next.speed': '• перевірка у {times}× частіше',
  'plan.next.links': '• посилань у {times}× більше',
  'plan.next.burst': '• сплеск доставки у {times}× більший',
  'plan.next.price': '• усього +${delta} на місяць',
  'plan.next.same': '• те саме, але {links} посилань замість {currentLinks}',

  // what arrives when a tier is reached
  'tier.welcome.basic': "🎯 <b>Hunter</b> — рівень узято.\nТепер {links} посилань і перевірка кожні {interval} с. Вистачить місця і на бренди, і на розміри, і на ту цінову вилку, яку ти все відкладав.",
  'tier.welcome.pro': "🏹 <b>Ranger</b>.\nПеревірка кожні {interval} с, {links} посилань, сплеск {burst}. Знахідки прилітають пачкою, а не по одній із паузами. Це вже не хобі.",
  'tier.welcome.turbo': "🥷 <b>Sniper Elite</b>.\n{links} посилань, сплеск {burst} — рідкісна річ дістається тому, хто відкрив її першим. Тепер це ти.\nМісць на цьому рівні небагато, і одне з них твоє.",
  'tier.welcome.elite_max': "🔒 <b>Elite Max</b>.\nПеревірка раз на {interval} с, {links} посилань, сплеск {burst}. Цей рівень не продається.",
};
