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
1. Создай группу.
2. Добавь бота админом и включи ему право «Управление темами».
3. Включи «Темы» в настройках группы и напиши там <code>/bind</code>.
4. Готово — каждая новая ссылка заводит свою тему: Raf, Helmut, Bags в одном месте.

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
  'add.atCapacity':
    '⏳ Сейчас все слоты мониторинга заняты, ссылка не добавлена. Попробуй через несколько минут — слоты постоянно освобождаются.',

  'add.locked':
    '🔒 Сейчас тарифа нет, добавлять некуда. <b>Scout</b> — неделя за цену кофе, открой «Тариф» ниже.',

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
  'plan.name.locked': 'Без тарифа 🔒',
  'plan.lockedNote': 'Ничего не работает: поиски на паузе, пока не выберешь тариф ниже.',
  'plan.grandfathered': '(сохранено — ничего не удалено, но чтобы добавить новую, сначала убери одну)',
  'plan.trialLeft': 'Пробный период: осталось {left}',
  'plan.legendGroup': '👥 = все поиски в одной группе, разложены по темам — а не 100 отдельных чатов',
  'plan.legendBurst': '⚡N = N находок приходят одной волной, а не по капле. Telegram ограничивает скорость ботов — у тебя максимум, у тарифов ниже его нет.',
  'plan.invoiceDescTrial': '{period} · интервал ~{seconds} сек · до {limit} ссылок',
  'pay.okTrial': '✅ Тариф {plan} включён. Доступ: {period}.',
  'trial.window.week': 'неделя',
  'trial.window.days': '{n} дней',
  'trial.window.hours': '{n} ч.',
  'plan.renewsOn': '🔄 Продлевается автоматически {date}',
  'plan.cancelledUntil': '⏹ Отменён — доступ до {date}',
  'plan.renewFailed': '⚠️ Продление не прошло — не хватило звёзд. Пополни, Telegram повторит; доступ до {date}',
  'plan.invoiceDescSub': 'Каждые 30 дней · интервал ~{seconds} сек · до {limit} ссылок · отменить можно в любой момент',
  'plan.subOffer':
    '🔄 <b>{plan}</b> — {stars} ⭐ каждые {days} дней, списывается автоматически. Отменить можно в любой момент в /plan; оплаченный период доработает до своей даты.',
  'plan.subUnavailable': '⚠️ Не получилось открыть подписку. Попробуй через минуту.',
  'btn.subscribe': 'Подписаться на {plan} · {stars} ⭐',
  'btn.subCancel': '⏹ Отменить автопродление',
  'btn.subResume': '🔄 Вернуть автопродление',
  'pay.okSub': '✅ {plan} включён, продление автоматически {date}. Отменить можно в любой момент в /plan.',
  'sub.cancelled': '⏹ Автопродление выключено. <b>{date}</b> — последний день уже оплаченного периода, до этого ничего не меняется.',
  'sub.cancelledShort': 'Автопродление выключено',
  'sub.resumed': '🔄 Автопродление снова включено.',
  'sub.resumedShort': 'Автопродление включено',
  'sub.failed': '⚠️ {plan} не продлился — на балансе не хватает {stars} ⭐. Пополни, Telegram повторит попытку; тариф работает до <b>{date}</b>.',
  'sub.none': 'Отменять нечего.',
  'sub.changeFailed': 'Telegram сейчас не дал изменить подписку. Попробуй через минуту.',

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

  // plans, add-on, support, near-miss note
  'plan.name.free': 'Scout',
  'plan.name.basic': 'Hunter',
  'plan.name.pro': 'Ranger',
  'plan.name.turbo': 'Sniper Elite',
  'plan.name.elite_max': 'Elite Max 🔒',
  'plan.scarcity': '🔥 <b>Sniper Elite</b> — мест ограниченное количество.',
  'plan.scarcitySeats': '🔥 <b>Sniper Elite</b> — осталось всего {left} мест.',
  'plan.soldOut': '🔥 <b>Sniper Elite</b> — все места заняты. Место освободится, когда чья-то подписка закончится.',
  'plan.full': '🚫 На тарифе {plan} сейчас нет свободных мест. Деньги не списаны. Место освободится, когда закончится чья-то подписка.',
  'plan.refunded': '↩️ Пока шла оплата, места на {plan} закончились — платёж возвращён полностью. Деньги не списаны.',
  'btn.soldOut': '{name} · мест нет',
  'plan.tiersHeader': '<b>Тарифы</b>',
  'plan.tierRow': '{name} — {price} · проверка {interval} с · {links} ссылок · ⚡{burst}',
  'plan.tierRowNoBurst': '{name} — {price} · проверка {interval} с · {links} ссылок',
  'plan.addon': 'Докупленные ссылки: +{count}',
  'plan.addonOffer': '➕ {links} ссылок за {price} — к любому платному тарифу.',
  'btn.addon': '➕{links} ссылок · {stars} ⭐',
  'addon.bought': '✅ +{links} ссылок. Теперь доступно {total}.',
  'addon.needPlan': 'Докупать ссылки можно на платном тарифе — выбери его ниже.',
  'btn.support': '🆘 Поддержка',
  'support.ask': '🆘 Напиши сообщение одним текстом — передам в поддержку и пришлю ответ сюда же.',
  'support.sent': '✅ Отправлено. Ответ придёт в этот чат.',
  'support.off': 'Поддержка сейчас недоступна. Попробуй позже.',
  'support.from': '🆘 <b>Обращение</b>\nОт: {who} (<code>{id}</code>), язык {lang}, тариф {plan}\n\n{text}\n\n<i>Ответь на это сообщение — ответ уйдёт пользователю.</i>',
  'support.replied': '💬 <b>Ответ поддержки</b>\n\n{text}',
  'support.delivered': '✅ Отправлено пользователю.',
  'support.lost': 'Не нашёл, кому это адресовано — ответь на само сообщение с обращением.',
  'fomo.note': '⏱ Это объявление висело {seconds} с до того, как ты его увидел. <b>Sniper Elite</b> видит такие мгновенно.',
  'kb.changeDest': '📍 Куда слать',
  'search.destChanged': '✅ Теперь «{name}» уходит в {dest}.',

  // what the next tier up actually buys
  'plan.next.header': '⬆️ <b>{next}</b> по сравнению с твоим {current}:',
  'plan.next.speed': '• проверка в {times}× чаще',
  'plan.next.links': '• ссылок в {times}× больше',
  'plan.next.burst': '• всплеск доставки в {times}× больше',
  'plan.next.price': '• всего +${delta} в месяц',
  'plan.next.same': '• то же самое, но {links} ссылок вместо {currentLinks}',

  // what arrives when a tier is reached
  'tier.welcome.basic': "▬▬ι═══════ﺤ\n\nОхота началась, <b>Hunter</b> 🔪\nТеперь {links} ссылок и проверка каждые {every}.\nРасставляй ссылки 🪤 — дальше моя работа.",
  'tier.welcome.pro': "ᡕᠵデ气亠\n\nТы закален в боях и читаешь поле иначе, <b>ranger</b> ⚔️\nТеперь {links} ссылок и проверка каждые {every},\nвсплеск {burst} — находки прилетают залпом, а не по одной с паузами.\nОстальные всё ещё жмут F5. 😌",
  'tier.welcome.turbo': "︻芫═───\n\nТы <b>Sniper Elite</b> — увидеть цель и снять её у тебя в крови. 🩸\nДобро пожаловать в верховный ранг🥷\n<b>Sniper Elite</b>: {links} ссылок, всплеск {burst}, проверка каждые {every}.\n\nРедкая вещь достаётся тому, кто открыл её первым. Теперь это ты. 💎\nНаслаждайся)",
  'tier.welcome.elite_max': "▄︻デ══━一\n\nЭтого ранга нет в прайсе, <b>Elite Max</b> 🔒\n{links} ссылок, всплеск {burst}, проверка каждые {every} — ничто из продающегося рядом не стояло.\nБольше он ни у кого. 🤫",

  // how an interval reads to a person
  'unit.sec': '{n} с',
  'unit.day': '{n}d',
  'unit.week': 'нед.',
  'unit.hour': '{n}h',
  'unit.min': '{n}m',
};
