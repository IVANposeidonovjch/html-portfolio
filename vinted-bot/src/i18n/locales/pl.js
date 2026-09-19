export const pl = {
  'btn.add': '➕ Dodaj link',
  'btn.list': '📋 Moje linki',
  'btn.chats': '👥 Moje czaty',
  'btn.toggle': '⏯ Monitoring',
  'btn.plan': '💳 Plan',
  'btn.help': '❓ Pomoc',
  'btn.lang': '🌐 Język',

  'start.text': `⚡️ <b>Vinted Monitor</b> 👟👜

🔎 Wyszukiwanie ustawiasz na Vinted — ja je obserwuję i 🔔 wrzucam tu każde nowe ogłoszenie kilka sekund po publikacji. Inni jeszcze odświeżają stronę, a ty już piszesz do sprzedającego. 🏃‍♂️💨

🔗 Jeden link = jedno wyszukiwanie. Tyle, ile chcesz — 📩 na priv albo 🧵 do wątków w grupie.`,

  'help.text': `⚡️ <b>Vinted Monitor</b> — nowe ogłoszenia z Vinted w kilka sekund.

🔎 <b>Dodawanie wyszukiwania</b>
1. Ustaw filtry na Vinted: marka, kategoria, rozmiar, cena.
2. Skopiuj adres URL strony z wynikami.
3. „➕ Dodaj link” → wyślij URL → nadaj nazwę (<i>Raf</i>).
4. Wybierz, gdzie ma trafiać: tutaj, do grupy albo do wątku.

{example}

🧵 <b>Grupy i wątki</b>
1. Załóż grupę.
2. Dodaj bota jako administratora z włączonym „Zarządzanie wątkami”.
3. Włącz Wątki w ustawieniach grupy, a potem wyślij tam <code>/bind</code>.
4. Gotowe — każdy dodany link otwiera własny wątek: Raf, Helmut, Torby, wszystko w jednym miejscu.

⌨️ <b>Komendy</b> — <code>/start</code>, <code>/add</code>, <code>/help</code>. Cała reszta to przyciski.`,

  // the example section: a mockup when there is no picture, a pointer when there is
  'help.example': `🔔 <b>Tak wygląda powiadomienie</b>
<i>[zdjęcie przedmiotu]</i>
📌 <b>Raf Simons bomber</b>
💰 Cena : 240€
🏷 Marka : Raf Simons
📏 Rozmiar : L
#Raf
[ URL ]`,
  'help.exampleHint': '🔔 <b>O tak wygląda powiadomienie</b> ⬇️',

  'add.askUrl': `Wyślij adres URL wyszukiwania na Vinted.

Przykład:
<code>https://www.vinted.pl/catalog?search_text=raf+simons&amp;price_to=300</code>`,
  'add.askName': 'Jak nazwać to wyszukiwanie? Na przykład <i>Raf</i>, <i>Helmut Lang</i>, <i>Torby</i>.',
  'add.askDest': 'Gdzie mają trafiać nowe ogłoszenia?',
  'add.limit': 'Limit planu {plan}: {limit} linków. Usuń jeden albo przejdź wyżej (/plan).',
  'add.created':
    '✅ „{name}” dodane.\nSprawdzam co ~{seconds}s. Pierwszy przebieg tylko zapisuje to, co już wisi — wszystko nowe po nim leci do ciebie.',
  'add.atCapacity':
    '⏳ Wszystkie sloty monitoringu są w tej chwili zajęte, więc link nie został dodany. Spróbuj za kilka minut — cały czas coś się zwalnia.',

  'add.locked':
    '🔒 Nie masz teraz żadnego planu, więc nie ma gdzie dodać linku. <b>Scout</b> to tydzień za cenę kawy — otwórz Plan poniżej.',

  'url.err.notLink': 'To nie wygląda na link.',
  'url.err.scheme': 'Potrzebny jest link http(s).',
  'url.err.notVinted': 'To nie jest link z Vinted.',
  'url.err.itemPage': 'To prowadzi do pojedynczego przedmiotu — potrzebuję strony wyszukiwania (katalogu).',
  'url.err.noFilters':
    'Link nie niesie żadnych filtrów — ustaw markę / kategorię / cenę na Vinted i skopiuj adres jeszcze raz.',

  'list.empty': 'Nie ma jeszcze żadnych linków. Kliknij „➕ Dodaj link”.',
  'list.header': '<b>Moje linki</b> ({count}/{limit})\nMonitoring: {state} · co {seconds}s ({plan})',
  'state.on': '🟢 włączony',
  'state.off': '🔴 wyłączony',

  'card.dest': 'Cel: {dest}',
  'card.status': 'Status: {status}',
  'status.active': '🟢 aktywne',
  'status.paused': '⏸ wstrzymane',
  'card.sent': 'Wysłane ogłoszenia: {count}',
  'card.lastCheck': 'Ostatnie sprawdzenie: {time} UTC',
  'dest.private': 'wiadomości prywatne',
  'dest.topic': 'wątek #{id}',

  'kb.cancel': '✖️ Anuluj',
  'kb.private': '📩 Tutaj, na czacie',
  'kb.wholeGroup': '👥 Cała grupa „{title}”',
  'kb.newTopic': '✨ Utwórz wątek „{name}”',
  'kb.back': '⬅️ Wstecz',
  'kb.openSearch': '🔗 Otwórz wyszukiwanie',
  'kb.disable': '⏸ Wstrzymaj',
  'kb.enable': '▶️ Wznów',
  'kb.rename': '✏️ Zmień nazwę',
  'kb.delete': '🗑 Usuń',
  'kb.toList': '⬅️ Wróć do listy',
  'kb.yesDelete': '🗑 Tak, usuń',
  'kb.topicsCount': '📂 {title} (wątki: {count})',

  'chats.header': '<b>Moje czaty</b>',
  'chats.empty': 'Nie podłączono żadnej grupy ani kanału.',
  'chats.hint':
    'Żeby dodać: wrzuć bota do grupy jako administratora i wpisz tam <code>/bind</code>. Przy włączonych Wątkach bot sam tworzy osobny wątek na każde wyszukiwanie.',
  'chats.unbound': 'Odłączony',

  'bind.onlyInGroup': 'Wyślij /bind <b>w samej grupie</b>, do której dodano bota.',
  'bind.onlyAdmin': 'Podłączyć ten czat może tylko jego administrator.',
  'bind.limit': 'Limit czatów: {limit}.',
  'bind.topicOk': '✅ Wątek „{name}” w „{title}” podłączony.',
  'bind.groupOk':
    '✅ Grupa „{title}” podłączona. Włącz Wątki, a bot sam utworzy osobny wątek na każde wyszukiwanie.',
  'bind.notBound': 'Ten czat nie jest podłączony.',
  'bind.unbound': 'Czat odłączony. Wyszukiwania, które tu publikowały, są zatrzymane — przypisz je gdzie indziej na priv z botem.',
  'bind.channelOk': '✅ Kanał „{title}” podłączony.',
  'bind.channelNeedAdmin': 'Najpierw dodaj bota jako administratora tego kanału, potem prześlij post jeszcze raz.',
  'bind.channelNotSeen': 'Nie widzę tego kanału. Dodaj bota jako administratora i prześlij post jeszcze raz.',

  'topic.created': '✅ Wątek „{name}” utworzony i przypisany do tego wyszukiwania.',
  'topic.createFailed':
    '⚠️ Nie udało się utworzyć wątku: {error}\nDaj botowi uprawnienie „Zarządzanie wątkami” albo wybierz wątek ręcznie.',

  'toggle.on': '🟢 Monitoring włączony.',
  'toggle.off': '🔴 Monitoring wyłączony.',

  'plan.title': '<b>Plan: {plan}</b>',
  'plan.interval': 'Częstotliwość sprawdzania: ~{seconds}s',
  'plan.burst': 'Seria wysyłki: do {count} ogłoszeń pod rząd',
  'plan.limit': 'Limit linków: {limit}',
  'plan.used': 'W użyciu: {count}',
  'plan.until': 'Ważny do: {date}',
  'plan.tiers': 'Free — {free}s · Basic — {basic}s · Pro — {pro}s',
  'plan.invoiceDesc': '{days} dni · odstęp ~{seconds}s · do {limit} linków',
  'pay.ok': '✅ {plan} aktywny na {days} dni.',
  'plan.name.starter': 'Darmowy',
  'plan.starterLeft': 'Darmowy dzień: zostało {left}',
  'plan.overLimit':
    '⚠️ Przekraczasz limit nowego planu — zejdź do {limit} linków w ciągu {left}, inaczej nadmiarowe same się wstrzymają.',
  'limit.warned':
    '⚠️ Twój plan pozwala teraz na {limit} linków, a masz ich {active}. Zejdź do {limit} w ciągu {left} i nic się nie stanie — inaczej najnowsze nadmiarowe same się wstrzymają. Tak czy tak nic nie zostanie usunięte.',
  'limit.enforced':
    '⏸ Wstrzymano wyszukiwania: {paused}, żeby zmieścić się w {limit} linkach twojego planu. Nic nie zostało usunięte — wznów dowolne w 📋 Moje linki, gdy zrobi się miejsce.',
  'plan.name.locked': 'Brak planu 🔒',
  'plan.lockedNote': 'Nic nie działa: twoje wyszukiwania są wstrzymane, dopóki nie wybierzesz planu poniżej.',
  'plan.grandfathered': '(zachowane — nic nie zostało usunięte, ale przed dodaniem kolejnego trzeba będzie jeden zdjąć)',
  'plan.trialLeft': 'Okres próbny: zostało {left}',
  'plan.legendGroup': '👥 = wszystkie twoje wyszukiwania w jednej grupie, poukładane w wątki — a nie 100 osobnych czatów',
  'plan.legendBurst': '⚡N = N znalezisk wpada jedną falą, a nie kroplami. Telegram ogranicza tempo wysyłki botów — ty masz je wykręcone na maksa, niższe plany nie.',
  'plan.invoiceDescTrial': '{period} · odstęp ~{seconds}s · do {limit} linków',
  'pay.okTrial': '✅ {plan} działa. Dostęp: {period}.',
  'trial.window.week': '1 tydzień',
  'trial.window.days': '{n} dni',
  'trial.window.hours': '{n} godz.',
  'plan.renewsOn': '🔄 Odnawia się automatycznie {date}',
  'plan.cancelledUntil': '⏹ Anulowany — dostęp do {date}',
  'plan.renewFailed': '⚠️ Odnowienie nie przeszło — za mało Gwiazdek. Doładuj, a Telegram spróbuje ponownie; dostęp do {date}',
  'plan.invoiceDescSub': 'Co 30 dni · odstęp ~{seconds}s · do {limit} linków · anulujesz kiedy chcesz',
  'plan.subOffer':
    '🔄 <b>{plan}</b> — {stars} ⭐ co {days} dni, pobierane automatycznie. Anulujesz kiedy chcesz w /plan; dostęp trwa do już opłaconej daty.',
  'plan.subUnavailable': '⚠️ Nie udało się teraz otworzyć subskrypcji. Spróbuj za minutę.',
  'btn.subscribe': 'Subskrybuj {plan} · {stars} ⭐',
  'btn.subCancel': '⏹ Wyłącz automatyczne odnawianie',
  'btn.subResume': '🔄 Włącz automatyczne odnawianie',
  'pay.okSub': '✅ {plan} działa i odnowi się automatycznie {date}. Możesz anulować kiedy chcesz w /plan.',
  'sub.cancelled': '⏹ Automatyczne odnawianie jest wyłączone. <b>{date}</b> to ostatni dzień już opłaconego okresu — do tego czasu nic się nie zmienia.',
  'sub.cancelledShort': 'Odnawianie wyłączone',
  'sub.resumed': '🔄 Automatyczne odnawianie znów działa.',
  'sub.resumedShort': 'Odnawianie włączone',
  'sub.failed': '⚠️ Nie udało się odnowić planu {plan} — do {stars} ⭐ brakuje Gwiazdek na twoim koncie. Doładuj, a Telegram spróbuje ponownie; plan działa do <b>{date}</b>.',
  'sub.none': 'Nie ma tu czego anulować.',
  'sub.changeFailed': 'Telegram nie pozwolił teraz zmienić subskrypcji. Spróbuj za minutę.',

  'lang.choose': 'Wybierz język interfejsu:',
  'lang.set': '✅ Język zmieniony na polski.',

  'rename.ask': 'Nowa nazwa dla „{name}”?',
  'rename.ok': '✅ Nazwa zmieniona.',
  'delete.confirm': 'Usunąć „{name}”?',
  'delete.done': 'Usunięte',

  'common.cancelled': 'Anulowano',
  'common.expired': 'Ta sesja wygasła, zacznij od nowa: /add',
  'common.notUnderstood': 'Nie zrozumiałem. Użyj przycisków poniżej albo /help.',
  'common.enabled': 'Włączone',
  'common.disabled': 'Wyłączone',

  'item.noTitle': 'Bez tytułu',
  'item.price': 'Cena',
  'item.brand': 'Marka',
  'item.size': 'Rozmiar',
  'item.button': 'URL',

  'send.searchDisabled': '⚠️ Wyszukiwanie „{name}” zostało wstrzymane: nie mogę publikować na jego czacie ({error}).',
  'migrate.done':
    'ℹ️ Grupa „{title}” stała się supergrupą — przeniosłem wyszukiwania ({count}) na nowy czat, nic nie musisz robić.',

  // Telegram command menu (setMyCommands)
  'cmd.start': 'Uruchom bota',
  'cmd.add': 'Dodaj link',
  'cmd.list': 'Moje linki',
  'cmd.chats': 'Moje czaty i wątki',
  'cmd.pause': 'Wstrzymaj monitoring',
  'cmd.resume': 'Wznów monitoring',
  'cmd.plan': 'Plan i limity',
  'cmd.lang': 'Język',
  'cmd.help': 'Jak to działa',
  'cmd.bind': 'Podłącz tę grupę lub wątek',
  'cmd.unbind': 'Odłącz ten czat',
  'cmd.users': 'Wszyscy użytkownicy',
  'cmd.userinfo': 'Jeden użytkownik szczegółowo',
  'cmd.stats': 'Statystyki systemu',
  'cmd.grant': 'Przyznaj plan',

  // inline menu
  'menu.removed': 'Menu przeniosło się do przycisków pod wiadomościami — dolnej klawiatury już nie ma.',
  'menu.title': '<b>Vinted Monitor</b>\nWybierz działanie:',
  'btn.toggleOn': '⏸ Monitoring: włączony',
  'btn.toggleOff': '▶️ Monitoring: wyłączony',
  'kb.menu': '⬅️ Menu',

  // admin image commands
  'image.what.start': 'powitanie /start',
  'image.what.help': 'przykład z /help',
  'image.usage': '🖼 Wyślij zdjęcie dla {what} — w odpowiedzi na tę komendę albo jako następną wiadomość.\nŻeby je usunąć: <code>{command} clear</code>',
  'image.saved': '✅ Obrazek dla {what} zapisany ({kb} KB). Sprawdź przez {check}.',
  'image.failed': '⚠️ Nie udało się zapisać obrazka: {error}',
  'image.cleared': '🗑 Obrazek dla {what} usunięty.',
  'image.notPhoto': 'To nie jest zdjęcie. Wyślij je jako obrazek, nie jako plik.',

  // plans, add-on, support, near-miss note
  'plan.name.free': 'Scout',
  'plan.name.basic': 'Hunter',
  'plan.name.pro': 'Ranger',
  'plan.name.turbo': 'Sniper Elite',
  'plan.name.elite_max': 'Elite Max 🔒',
  'plan.scarcity': '🔥 <b>Sniper Elite</b> — liczba miejsc jest ograniczona.',
  'plan.scarcitySeats': '🔥 <b>Sniper Elite</b> — zostały już tylko miejsca: {left}.',
  'plan.soldOut': '🔥 <b>Sniper Elite</b> — wszystkie miejsca zajęte. Jedno zwalnia się, gdy wygaśnie czyjaś subskrypcja.',
  'plan.full': '🚫 {plan} jest w tej chwili pełny — wszystkie miejsca zajęte. Nic nie zostało pobrane. Miejsce zwalnia się, gdy wygaśnie czyjaś subskrypcja.',
  'plan.refunded': '↩️ {plan} zapełnił się w trakcie płatności, więc pieniądze wróciły w całości. Nic nie zostało pobrane.',
  'btn.soldOut': '{name} · brak miejsc',
  'plan.tiersHeader': '<b>Plany</b>',
  'plan.tierRow': '{name} — {price} · sprawdza co {interval}s · linki: {links} · ⚡{burst}',
  'plan.tierRowNoBurst': '{name} — {price} · sprawdza co {interval}s · linki: {links}',
  'plan.addon': 'Dokupione dodatkowe linki: +{count}',
  'plan.addonOffer': '➕ {links} linków za {price} — na dokładkę do dowolnego płatnego planu.',
  'btn.addon': '➕{links} linków · {stars} ⭐',
  'addon.bought': '✅ +{links} linków. Masz teraz {total}.',
  'addon.needPlan': 'Dodatkowe linki dokłada się do płatnego planu — wybierz jeden poniżej.',
  'btn.contact': '✍️ Napisz do {handle}',
  'btn.supportRelay': '💬 Wyślij stąd',
  'support.sos': `🆘 <b>Wsparcie</b>

Za {handle} siedzi człowiek, a nie formularz — pisz kiedy chcesz, dostaniesz prawdziwą odpowiedź.

• <b>Więcej linków, niż pozwala twój plan</b> — po prostu poproś. Limit to ustawienie domyślne, nie ściana.
• <b>Coś się zepsuło</b> — napisz, co widziałeś. Błędy idą bez kolejki.
• <b>Pomysł</b> — prawie wszystko, co ten bot potrafi, zaczęło się od czyjejś wiadomości.

Pisz w swoim języku, i tak zostanie przeczytany.`,
  'btn.support': '🆘 Wsparcie',
  'support.ask': '🆘 Napisz swoją wiadomość za jednym razem — przekażę ją do wsparcia i przyniosę odpowiedź tutaj.',
  'support.sent': '✅ Wysłane. Odpowiedź przyjdzie na ten czat.',
  'support.off': 'Wsparcie jest w tej chwili niedostępne. Spróbuj później.',
  'support.from': '🆘 <b>Zgłoszenie do wsparcia</b>\nOd: {who} (<code>{id}</code>), język {lang}, plan {plan}\n\n{text}\n\n<i>Odpowiedz na tę wiadomość, a odpowiedź trafi do nich.</i>',
  'support.replied': '💬 <b>Wsparcie</b>\n\n{text}',
  'support.delivered': '✅ Wysłane do użytkownika.',
  'support.lost': 'Nie wiem, komu to odpowiada — odpowiedz bezpośrednio na wiadomość ze zgłoszeniem.',
  'fomo.note': '⏱ To ogłoszenie wisiało już {seconds}s, zanim je zobaczyłeś. <b>Sniper Elite</b> widzi takie natychmiast.',
  'kb.changeDest': '📍 Cel',
  'search.destChanged': '✅ „{name}” trafia teraz do {dest}.',

  // what the next tier up actually buys
  'plan.next.header': '⬆️ <b>{next}</b> zaraz nad twoim {current}:',
  'plan.next.speed': '• sprawdza {times}× częściej',
  'plan.next.links': '• {times}× więcej linków',
  'plan.next.burst': '• {times}× większa seria wysyłki',
  'plan.next.price': '• tylko +${delta} miesięcznie',
  'plan.next.same': '• to samo, ale z {links} linkami zamiast {currentLinks}',

  // what arrives when a tier is reached
  'tier.welcome.basic': '▬▬ι═══════ﺤ\n\nPolowanie rozpoczęte, <b>Hunter</b> 🔪\nOd teraz {links} linków i sprawdzanie co {every}.\nRozstaw swoje linki 🪤 — reszta to moja robota.',
  'tier.welcome.pro': 'ᡕᠵデ气亠\n\nJesteś ograny w boju i czytasz pole inaczej niż reszta, <b>ranger</b> ⚔️\nOd teraz {links} linków i sprawdzanie co {every},\nseria {burst} — znaleziska spadają salwą, a nie po jednym z przerwami.\nCała reszta wciąż wciska F5. 😌',
  'tier.welcome.turbo': '︻芫═───\n\nJesteś <b>Sniper Elite</b> — zobaczyć cel i go wziąć masz we krwi. 🩸\nWitaj w najwyższej randze🥷\n<b>Sniper Elite</b>: {links} linków, seria {burst}, sprawdzanie co {every}.\n\nRzadka sztuka trafia do tego, kto otworzył ją pierwszy. Od teraz to ty. 💎\nKorzystaj)',
  'tier.welcome.elite_max': '▄︻デ══━一\n\nTej rangi nigdy nie było w cenniku, <b>Elite Max</b> 🔒\n{links} linków, seria {burst}, sprawdzanie co {every} — nic z oferty nawet się nie zbliża.\nNikt inny tego nie ma. 🤫',

  // how an interval reads to a person
  'unit.sec': '{n}s',
  'unit.day': '{n}d',
  'unit.week': 'tydzień',
  'unit.hour': '{n}h',
  'unit.min': '{n}m',
};
