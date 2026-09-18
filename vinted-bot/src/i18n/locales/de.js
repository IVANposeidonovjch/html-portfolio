export const de = {
  'btn.add': '➕ Link hinzufügen',
  'btn.list': '📋 Meine Links',
  'btn.chats': '👥 Meine Chats',
  'btn.toggle': '⏯ Überwachung',
  'btn.plan': '💳 Tarif',
  'btn.help': '❓ Hilfe',
  'btn.lang': '🌐 Sprache',

  'start.text': `⚡️ <b>Vinted Monitor</b> 👟👜

🔎 Du stellst die Suche auf Vinted ein — ich behalte sie im Auge und 🔔 schicke dir jede neue Anzeige Sekunden nach der Veröffentlichung. Während andere die Seite neu laden, schreibst du schon dem Verkäufer. 🏃‍♂️💨

🔗 Ein Link = eine Suche. Beliebig viele — 📩 in den Chat oder 🧵 in Themen einer Gruppe.`,

  'help.text': `⚡️ <b>Vinted Monitor</b> — neue Vinted-Anzeigen in Sekunden.

🔎 <b>Suche hinzufügen</b>
1. Filter auf Vinted setzen: Marke, Kategorie, Größe, Preis.
2. URL der Suchseite kopieren.
3. „➕ Link hinzufügen“ → URL schicken → benennen (<i>Raf</i>).
4. Ziel wählen: hier, eine Gruppe oder ein Thema.

{example}

🧵 <b>Gruppen und Themen</b>
Bot als Admin in die Gruppe holen und dort <code>/bind</code> schreiben. Themen aktivieren — der Bot legt pro Suche selbst eins an: Raf, Helmut, Bags an einem Ort.

🛡 <b>Keine Dubletten</b>
Der erste Durchlauf merkt sich nur den Bestand. Eine Anzeige landet einmal im Thema, auch wenn zehn deiner Links passen.

⚙️ <b>Einstellungen</b> — in den Buttons unten: Tarif, Sprache, deine Chats.
⌨️ <b>Befehle</b> — <code>/start</code>, <code>/add</code>, <code>/help</code>. Alles andere per Button.`,

  // the example section: a mockup when there is no picture, a pointer when there is
  'help.example': `🔔 <b>So sieht ein Treffer aus</b>
<i>[Foto des Artikels]</i>
📌 <b>Raf Simons bomber</b>
💰 Preis : 240€
🏷 Marke : Raf Simons
📏 Größe : L
#Raf
[ URL ]`,
  'help.exampleHint': '🔔 <b>So sieht ein Treffer aus</b> ⬇️',

  'add.askUrl': `Schick mir eine Vinted-Such-URL.

Beispiel:
<code>https://www.vinted.de/catalog?search_text=raf+simons&amp;price_to=300</code>`,
  'add.askName': 'Wie soll diese Suche heißen? Zum Beispiel <i>Raf</i>, <i>Helmut Lang</i>, <i>Bags</i>.',
  'add.askDest': 'Wohin sollen neue Anzeigen gehen?',
  'add.limit': 'Limit im Tarif {plan}: {limit} Links. Lösch einen oder wechsle den Tarif (/plan).',
  'add.created':
    '✅ „{name}“ hinzugefügt.\nPrüfung alle ~{seconds} Sek. Der erste Durchlauf merkt sich nur den Bestand — alles Neue danach kommt bei dir an.',

  'url.err.notLink': 'Das sieht nicht nach einem Link aus.',
  'url.err.scheme': 'Es muss ein http(s)-Link sein.',
  'url.err.notVinted': 'Das ist kein Vinted-Link.',
  'url.err.itemPage': 'Das ist ein einzelner Artikel — ich brauche eine Suchseite (Katalog).',
  'url.err.noFilters':
    'Der Link enthält keine Filter — stell auf Vinted Marke/Kategorie/Preis ein und kopier die URL neu.',

  'list.empty': 'Noch keine Links. Tipp auf „➕ Link hinzufügen“.',
  'list.header': '<b>Meine Links</b> ({count}/{limit})\nÜberwachung: {state} · alle {seconds} Sek ({plan})',
  'state.on': '🟢 an',
  'state.off': '🔴 aus',

  'card.dest': 'Ziel: {dest}',
  'card.status': 'Status: {status}',
  'status.active': '🟢 aktiv',
  'status.paused': '⏸ pausiert',
  'card.sent': 'Gesendete Anzeigen: {count}',
  'card.lastCheck': 'Letzte Prüfung: {time} UTC',
  'dest.private': 'Direktnachrichten',
  'dest.topic': 'Thema #{id}',

  'kb.cancel': '✖️ Abbrechen',
  'kb.private': '📩 Hier im Chat',
  'kb.wholeGroup': '👥 Ganze Gruppe „{title}“',
  'kb.newTopic': '✨ Thema „{name}“ anlegen',
  'kb.back': '⬅️ Zurück',
  'kb.openSearch': '🔗 Suche öffnen',
  'kb.disable': '⏸ Pausieren',
  'kb.enable': '▶️ Fortsetzen',
  'kb.rename': '✏️ Umbenennen',
  'kb.delete': '🗑 Löschen',
  'kb.toList': '⬅️ Zur Liste',
  'kb.yesDelete': '🗑 Ja, löschen',
  'kb.topicsCount': '📂 {title} ({count} Themen)',

  'chats.header': '<b>Meine Chats</b>',
  'chats.empty': 'Keine Gruppen oder Kanäle verbunden.',
  'chats.hint':
    'Hinzufügen: Bot als Admin in die Gruppe holen und dort <code>/bind</code> schreiben. Mit aktivierten Themen legt der Bot pro Suche selbst eins an.',
  'chats.unbound': 'Getrennt',

  'bind.onlyInGroup': 'Schreib /bind <b>in der Gruppe</b>, in der der Bot schon ist.',
  'bind.onlyAdmin': 'Nur ein Admin dieses Chats kann ihn verbinden.',
  'bind.limit': 'Chat-Limit: {limit}.',
  'bind.topicOk': '✅ Thema „{name}“ in „{title}“ verbunden.',
  'bind.groupOk':
    '✅ Gruppe „{title}“ verbunden. Aktivier Themen — dann legt der Bot pro Suche selbst eins an.',
  'bind.notBound': 'Dieser Chat ist nicht verbunden.',
  'bind.unbound': 'Chat getrennt. Suchen, die hierher gesendet haben, sind gestoppt — weise sie im Bot-Chat neu zu.',
  'bind.channelOk': '✅ Kanal „{title}“ verbunden.',
  'bind.channelNeedAdmin': 'Mach den Bot erst zum Admin des Kanals, dann leite den Beitrag erneut weiter.',
  'bind.channelNotSeen': 'Ich sehe den Kanal nicht. Bot als Admin hinzufügen und Beitrag erneut weiterleiten.',

  'topic.created': '✅ Thema „{name}“ angelegt und mit dieser Suche verknüpft.',
  'topic.createFailed':
    '⚠️ Thema konnte nicht angelegt werden: {error}\nGib dem Bot das Recht „Themen verwalten“ oder wähl ein Thema manuell.',

  'toggle.on': '🟢 Überwachung an.',
  'toggle.off': '🔴 Überwachung aus.',

  'plan.title': '<b>Tarif: {plan}</b>',
  'plan.interval': 'Prüfintervall: ~{seconds} Sek',
  'plan.burst': 'Zustellung: bis zu {count} Anzeigen am Stück',
  'plan.limit': 'Link-Limit: {limit}',
  'plan.used': 'Belegt: {count}',
  'plan.until': 'Gültig bis: {date}',
  'plan.tiers': 'Free — {free} Sek · Basic — {basic} Sek · Pro — {pro} Sek',
  'plan.invoiceDesc': '{days} Tage · ~{seconds} Sek Intervall · bis zu {limit} Links',
  'pay.ok': '✅ {plan} für {days} Tage aktiviert.',

  'lang.choose': 'Sprache der Oberfläche wählen:',
  'lang.set': '✅ Sprache auf Deutsch umgestellt.',

  'rename.ask': 'Neuer Name für „{name}“?',
  'rename.ok': '✅ Umbenannt.',
  'delete.confirm': '„{name}“ löschen?',
  'delete.done': 'Gelöscht',

  'common.cancelled': 'Abgebrochen',
  'common.expired': 'Die Sitzung ist abgelaufen, fang neu an: /add',
  'common.notUnderstood': 'Das habe ich nicht verstanden. Nutz die Buttons unten oder /help.',
  'common.enabled': 'Aktiviert',
  'common.disabled': 'Deaktiviert',

  'item.noTitle': 'Ohne Titel',
  'item.price': 'Preis',
  'item.brand': 'Marke',
  'item.size': 'Größe',
  'item.button': 'URL',

  'send.searchDisabled': '⚠️ Suche „{name}“ pausiert: Ich kann nicht in den Zielchat schreiben ({error}).',
  'migrate.done':
    'ℹ️ Gruppe „{title}“ ist jetzt eine Supergruppe — {count} Suche(n) auf den neuen Chat umgezogen, du musst nichts tun.',

  // Telegram command menu (setMyCommands)
  'cmd.start': 'Bot starten',
  'cmd.add': 'Link hinzufügen',
  'cmd.list': 'Meine Links',
  'cmd.chats': 'Meine Chats und Themen',
  'cmd.pause': 'Überwachung pausieren',
  'cmd.resume': 'Überwachung fortsetzen',
  'cmd.plan': 'Tarif und Limits',
  'cmd.lang': 'Sprache',
  'cmd.help': 'So funktioniert es',
  'cmd.bind': 'Diese Gruppe oder dieses Thema verbinden',
  'cmd.unbind': 'Diesen Chat trennen',
  'cmd.users': 'Alle Nutzer',
  'cmd.userinfo': 'Ein Nutzer im Detail',
  'cmd.stats': 'Systemstatistik',
  'cmd.grant': 'Tarif vergeben',

  // inline menu
  'menu.removed': 'Das Menü steckt jetzt in Buttons unter den Nachrichten — die untere Tastatur entfällt.',
  'menu.title': '<b>Vinted Monitor</b>\nAktion wählen:',
  'btn.toggleOn': '⏸ Überwachung: an',
  'btn.toggleOff': '▶️ Überwachung: aus',
  'kb.menu': '⬅️ Menü',

  // admin image commands
  'image.what.start': 'die /start-Begrüßung',
  'image.what.help': 'das /help-Beispiel',
  'image.usage': '🖼 Schick ein Foto für {what} — als Antwort auf diesen Befehl oder als nächste Nachricht.\nEntfernen: <code>{command} clear</code>',
  'image.saved': '✅ Bild für {what} gespeichert ({kb} KB). Prüfen mit {check}.',
  'image.failed': '⚠️ Bild konnte nicht gespeichert werden: {error}',
  'image.cleared': '🗑 Bild für {what} entfernt.',
  'image.notPhoto': 'Das ist kein Foto. Schick es als Bild, nicht als Datei.',

  // plans, add-on, support, near-miss note
  'plan.name.free': 'Scout',
  'plan.name.basic': 'Hunter',
  'plan.name.pro': 'Ranger',
  'plan.name.turbo': 'Sniper Elite',
  'plan.name.elite_max': 'Elite Max 🔒',
  'plan.scarcity': '🔥 <b>Sniper Elite</b> — nur eine begrenzte Anzahl Plätze.',
  'plan.tiersHeader': '<b>Tarife</b>',
  'plan.tierRow': '{name} — {price} · Prüfung alle {interval} s · {links} Links · Schub {burst}',
  'plan.addon': 'Zusätzlich gekaufte Links: +{count}',
  'plan.addonOffer': '➕ {links} Links für {price} — zu jedem bezahlten Tarif.',
  'btn.addon': '➕{links} Links · {stars} ⭐',
  'addon.bought': '✅ +{links} Links. Jetzt verfügbar: {total}.',
  'addon.needPlan': 'Zusatzlinks gibt es zu einem bezahlten Tarif — wähl unten einen aus.',
  'btn.support': '🆘 Support',
  'support.ask': '🆘 Schreib deine Nachricht am Stück — ich gebe sie an den Support und bringe die Antwort hierher.',
  'support.sent': '✅ Gesendet. Die Antwort kommt in diesen Chat.',
  'support.off': 'Support ist gerade nicht erreichbar. Bitte später versuchen.',
  'support.from': '🆘 <b>Support-Anfrage</b>\nVon: {who} (<code>{id}</code>), Sprache {lang}, Tarif {plan}\n\n{text}\n\n<i>Antworte auf diese Nachricht — die Antwort geht an die Person.</i>',
  'support.replied': '💬 <b>Support</b>\n\n{text}',
  'support.delivered': '✅ An den Nutzer gesendet.',
  'support.lost': 'Ich kann nicht zuordnen, wem das gilt — antworte direkt auf die Anfrage.',
  'fomo.note': '⏱ Diese Anzeige war {seconds} s online, bevor du sie gesehen hast. <b>Sniper Elite</b> sieht so etwas sofort.',
  'kb.changeDest': '📍 Ziel',
  'search.destChanged': '✅ „{name}“ geht jetzt an {dest}.',

  // what the next tier up actually buys
  'plan.next.header': '⬆️ <b>{next}</b> im Vergleich zu deinem {current}:',
  'plan.next.speed': '• prüft {times}× so oft',
  'plan.next.links': '• {times}× so viele Links',
  'plan.next.burst': '• {times}× so großer Zustellschub',
  'plan.next.price': '• nur +${delta} im Monat',
  'plan.next.same': '• dasselbe, aber {links} Links statt {currentLinks}',

  // what arrives when a tier is reached
  'tier.welcome.basic': "▬▬ι═══════ﺤ\n\nDie Jagd ist eröffnet, <b>Hunter</b>. 🎯 Jetzt {links} Links und alle {interval} s eine Prüfung — genug für die Marken, die Größen und die Preisspanne, die du ewig aufgeschoben hast.\nStell die Fallen 🪤 — den Rest übernehme ich.",
  'tier.welcome.pro': "ᡕᠵデ气亠\n\nDu bist kampferprobt, <b>Ranger</b>, und liest das Feld auf einer anderen Ebene. ⚔️ Alle {interval} s eine Prüfung, {links} Links, Schub {burst} — Treffer kommen als Salve statt im Tröpfchen.\nDie anderen drücken noch F5. 😌",
  'tier.welcome.turbo': "︻芫═───\n\nDu bist ein Elite-Scharfschütze — ein Ziel erkennen und holen liegt dir im Blut. 🥷 Willkommen auf der höchsten Stufe, <b>Sniper Elite</b>: {links} Links, Schub {burst}, alle {interval} s eine Prüfung.\nDas seltene Teil bekommt, wer es zuerst öffnet. Ab jetzt bist das du. 💎\nViel Spaß)",
  'tier.welcome.elite_max': "▄︻デ══━一\n\nDiese Stufe stand nie auf der Preisliste, <b>Elite Max</b>. 🔒 Alle {interval} s, {links} Links, Schub {burst} — nichts Käufliches kommt da heran.\nSonst hat sie niemand. 🤫",
};
