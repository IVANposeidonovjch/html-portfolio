export const it = {
  'btn.add': '➕ Aggiungi link',
  'btn.list': '📋 I miei link',
  'btn.chats': '👥 Le mie chat',
  'btn.toggle': '⏯ Monitoraggio',
  'btn.plan': '💳 Piano',
  'btn.help': '❓ Aiuto',
  'btn.lang': '🌐 Lingua',

  'start.text': `⚡️ <b>Vinted Monitor</b> 👟👜

🔎 La ricerca la imposti tu su Vinted — io la tengo d’occhio e 🔔 ti mando qui ogni nuovo annuncio pochi secondi dopo la pubblicazione. Mentre gli altri ricaricano la pagina, tu stai già scrivendo al venditore. 🏃‍♂️💨

🔗 Un link = una ricerca. Quanti ne vuoi — 📩 in privato o 🧵 negli argomenti di un gruppo.`,

  'help.text': `⚡️ <b>Vinted Monitor</b> — i nuovi annunci Vinted in pochi secondi.

🔎 <b>Aggiungere una ricerca</b>
1. Imposta i filtri su Vinted: marca, categoria, taglia, prezzo.
2. Copia l’URL della pagina dei risultati.
3. «➕ Aggiungi link» → manda l’URL → dagli un nome (<i>Raf</i>).
4. Scegli dove arriva: qui, in un gruppo o in un argomento.

{example}

🧵 <b>Gruppi e argomenti</b>
1. Crea un gruppo.
2. Aggiungi il bot come admin, con «Gestire gli argomenti» attivo.
3. Attiva gli Argomenti nelle impostazioni del gruppo, poi manda <code>/bind</code> lì dentro.
4. Fatto — ogni link che aggiungi apre il proprio argomento: Raf, Helmut, Borse, tutto in un posto solo.

⌨️ <b>Comandi</b> — <code>/start</code>, <code>/add</code>, <code>/help</code>. Tutto il resto è un pulsante.`,

  // the example section: a mockup when there is no picture, a pointer when there is
  'help.example': `🔔 <b>Com’è fatto un avviso</b>
<i>[foto dell’articolo]</i>
📌 <b>Raf Simons bomber</b>
💰 Prezzo : 240€
🏷 Marca : Raf Simons
📏 Taglia : L
#Raf
[ URL ]`,
  'help.exampleHint': '🔔 <b>Ecco com’è fatto un avviso</b> ⬇️',

  'add.askUrl': `Manda l’URL di una ricerca Vinted.

Esempio:
<code>https://www.vinted.it/catalog?search_text=raf+simons&amp;price_to=300</code>`,
  'add.askName': 'Come si chiama questa ricerca? Per esempio <i>Raf</i>, <i>Helmut Lang</i>, <i>Borse</i>.',
  'add.askDest': 'Dove devono arrivare i nuovi annunci?',
  'add.limit': 'Limite del piano {plan}: {limit} link. Cancellane uno o passa a un piano superiore (/plan).',
  'add.created':
    '✅ «{name}» aggiunto.\nControllato ogni ~{seconds}s. Il primo giro registra soltanto quello che è già online — tutto il nuovo dopo di lì è tuo.',
  'add.atCapacity':
    '⏳ In questo momento tutti gli slot di monitoraggio sono occupati, quindi il link non è stato aggiunto. Riprova tra qualche minuto — se ne liberano di continuo.',

  'add.locked':
    '🔒 Al momento non hai nessun piano, quindi non c’è dove aggiungere un link. <b>Scout</b> è una settimana al prezzo di un caffè — apri Piano qui sotto.',

  'url.err.notLink': 'Questo non sembra un link.',
  'url.err.scheme': 'Serve un link http(s).',
  'url.err.notVinted': 'Questo non è un link di Vinted.',
  'url.err.itemPage': 'Questo porta a un singolo articolo — mi serve una pagina di ricerca (catalogo).',
  'url.err.noFilters':
    'Il link non porta nessun filtro — imposta marca / categoria / prezzo su Vinted e copia di nuovo l’URL.',

  'list.empty': 'Ancora nessun link. Tocca «➕ Aggiungi link».',
  'list.header': '<b>I miei link</b> ({count}/{limit})\nMonitoraggio: {state} · ogni {seconds}s ({plan})',
  'state.on': '🟢 attivo',
  'state.off': '🔴 spento',

  'card.dest': 'Destinazione: {dest}',
  'card.status': 'Stato: {status}',
  'status.active': '🟢 attiva',
  'status.paused': '⏸ in pausa',
  'card.sent': 'Annunci inviati: {count}',
  'card.lastCheck': 'Ultimo controllo: {time} UTC',
  'dest.private': 'messaggi privati',
  'dest.topic': 'argomento #{id}',

  'kb.cancel': '✖️ Annulla',
  'kb.private': '📩 Qui in chat',
  'kb.wholeGroup': '👥 Tutto il gruppo «{title}»',
  'kb.newTopic': '✨ Crea l’argomento «{name}»',
  'kb.back': '⬅️ Indietro',
  'kb.openSearch': '🔗 Apri la ricerca',
  'kb.disable': '⏸ Metti in pausa',
  'kb.enable': '▶️ Riprendi',
  'kb.rename': '✏️ Rinomina',
  'kb.delete': '🗑 Elimina',
  'kb.toList': '⬅️ Torna alla lista',
  'kb.yesDelete': '🗑 Sì, elimina',
  'kb.topicsCount': '📂 {title} ({count} argomenti)',

  'chats.header': '<b>Le mie chat</b>',
  'chats.empty': 'Nessun gruppo o canale collegato.',
  'chats.hint':
    'Per aggiungerne uno: metti il bot in un gruppo come admin e scrivi <code>/bind</code> lì dentro. Con gli Argomenti attivi, il bot crea da solo un argomento per ogni ricerca.',
  'chats.unbound': 'Scollegato',

  'bind.onlyInGroup': 'Manda /bind <b>dentro il gruppo</b> in cui è stato aggiunto il bot.',
  'bind.onlyAdmin': 'Solo un admin di quella chat può collegarla.',
  'bind.limit': 'Limite di chat: {limit}.',
  'bind.topicOk': '✅ Argomento «{name}» in «{title}» collegato.',
  'bind.groupOk':
    '✅ Gruppo «{title}» collegato. Attiva gli Argomenti e il bot creerà da solo un argomento per ogni ricerca.',
  'bind.notBound': 'Questa chat non è collegata.',
  'bind.unbound': 'Chat scollegata. Le ricerche che pubblicavano qui sono ferme — riassegnale in privato con il bot.',
  'bind.channelOk': '✅ Canale «{title}» collegato.',
  'bind.channelNeedAdmin': 'Aggiungi prima il bot come admin di quel canale, poi inoltra di nuovo un post.',
  'bind.channelNotSeen': 'Non vedo quel canale. Aggiungi il bot come admin e inoltra di nuovo un post.',

  'topic.created': '✅ Argomento «{name}» creato e collegato a questa ricerca.',
  'topic.createFailed':
    '⚠️ Non sono riuscito a creare l’argomento: {error}\nDai al bot il permesso «Gestire gli argomenti», oppure scegli un argomento a mano.',

  'toggle.on': '🟢 Monitoraggio attivo.',
  'toggle.off': '🔴 Monitoraggio spento.',

  'plan.title': '<b>Piano: {plan}</b>',
  'plan.interval': 'Intervallo di controllo: ~{seconds}s',
  'plan.burst': 'Raffica di invio: fino a {count} annunci di fila',
  'plan.limit': 'Limite di link: {limit}',
  'plan.used': 'In uso: {count}',
  'plan.until': 'Valido fino al: {date}',
  'plan.tiers': 'Free — {free}s · Basic — {basic}s · Pro — {pro}s',
  'plan.invoiceDesc': '{days} giorni · intervallo ~{seconds}s · fino a {limit} link',
  'pay.ok': '✅ {plan} attivato per {days} giorni.',
  'plan.name.starter': 'Gratis',
  'plan.starterLeft': 'Giornata gratis: {left} rimaste',
  'plan.overLimit':
    '⚠️ Sei oltre il limite del tuo nuovo piano — scendi a {limit} link entro {left}, altrimenti quelli in più vanno in pausa da soli.',
  'limit.warned':
    '⚠️ Il tuo piano ora consente {limit} link e tu ne hai {active}. Scendi a {limit} entro {left} e non succede niente — altrimenti i più recenti vanno in pausa da soli. In nessun caso viene cancellato qualcosa.',
  'limit.enforced':
    '⏸ {paused} ricerca/ricerche messe in pausa per rientrare nei {limit} link del tuo piano. Non è stato cancellato niente — riattivane quante vuoi in 📋 I miei link appena hai spazio.',
  'plan.name.locked': 'Nessun piano 🔒',
  'plan.lockedNote': 'Non gira niente: le tue ricerche restano in pausa finché non scegli un piano qui sotto.',
  'plan.grandfathered': '(mantenuto — non è stato cancellato niente, ma dovrai toglierne uno prima di aggiungerne un altro)',
  'plan.trialLeft': 'Prova: {left} rimaste',
  'plan.legendGroup': '👥 = tutte le tue ricerche in un gruppo solo, divise per argomento — non 100 chat separate',
  'plan.legendBurst': '⚡N = N risultati arrivano in un’unica ondata, non col contagocce. Telegram limita la velocità di invio dei bot — tu sei al massimo, i piani sotto no.',
  'plan.invoiceDescTrial': '{period} · intervallo ~{seconds}s · fino a {limit} link',
  'pay.okTrial': '✅ {plan} è attivo. Accesso: {period}.',
  'trial.window.week': '1 settimana',
  'trial.window.days': '{n} giorni',
  'trial.window.hours': '{n} ore',
  'plan.renewsOn': '🔄 Si rinnova automaticamente il {date}',
  'plan.cancelledUntil': '⏹ Disdetto — accesso fino al {date}',
  'plan.renewFailed': '⚠️ Rinnovo fallito — Stelle insufficienti. Ricarica e Telegram riprova; accesso fino al {date}',
  'plan.invoiceDescSub': 'Ogni 30 giorni · intervallo ~{seconds}s · fino a {limit} link · disdici quando vuoi',
  'plan.subOffer':
    '🔄 <b>{plan}</b> — {stars} ⭐ ogni {days} giorni, addebitate automaticamente. Disdici quando vuoi in /plan; l’accesso arriva fino alla data già pagata.',
  'plan.subUnavailable': '⚠️ Non sono riuscito ad aprire l’abbonamento adesso. Riprova tra un minuto.',
  'btn.subscribe': 'Abbonati a {plan} · {stars} ⭐',
  'btn.subCancel': '⏹ Disattiva il rinnovo',
  'btn.subResume': '🔄 Riattiva il rinnovo',
  'pay.okSub': '✅ {plan} è attivo e si rinnova automaticamente il {date}. Puoi disdire quando vuoi in /plan.',
  'sub.cancelled': '⏹ Il rinnovo automatico è spento. Il <b>{date}</b> è l’ultimo giorno del periodo che hai già pagato — prima di allora non cambia niente.',
  'sub.cancelledShort': 'Rinnovo spento',
  'sub.resumed': '🔄 Il rinnovo automatico è di nuovo attivo.',
  'sub.resumedShort': 'Rinnovo attivo',
  'sub.failed': '⚠️ {plan} non si è potuto rinnovare — al tuo saldo mancano Stelle per arrivare a {stars} ⭐. Ricarica e Telegram riprova; il piano resta attivo fino al <b>{date}</b>.',
  'sub.none': 'Qui non c’è niente da disdire.',
  'sub.changeFailed': 'Telegram non ha voluto modificare l’abbonamento adesso. Riprova tra un minuto.',

  'lang.choose': 'Scegli la lingua dell’interfaccia:',
  'lang.set': '✅ Lingua impostata su italiano.',

  'rename.ask': 'Nuovo nome per «{name}»?',
  'rename.ok': '✅ Rinominata.',
  'delete.confirm': 'Eliminare «{name}»?',
  'delete.done': 'Eliminata',

  'common.cancelled': 'Annullato',
  'common.expired': 'Quella sessione è scaduta, ricomincia: /add',
  'common.notUnderstood': 'Non ho capito. Usa i pulsanti qui sotto oppure /help.',
  'common.enabled': 'Attivo',
  'common.disabled': 'Disattivato',

  'item.noTitle': 'Senza titolo',
  'item.price': 'Prezzo',
  'item.brand': 'Marca',
  'item.size': 'Taglia',
  'item.button': 'URL',

  'send.searchDisabled': '⚠️ La ricerca «{name}» è stata messa in pausa: non riesco a pubblicare nella sua chat ({error}).',
  'migrate.done':
    'ℹ️ Il gruppo «{title}» è diventato un supergruppo — {count} ricerca/ricerche spostate nella nuova chat, tu non devi fare niente.',

  // Telegram command menu (setMyCommands)
  'cmd.start': 'Avvia il bot',
  'cmd.add': 'Aggiungi un link',
  'cmd.list': 'I miei link',
  'cmd.chats': 'Le mie chat e gli argomenti',
  'cmd.pause': 'Metti in pausa il monitoraggio',
  'cmd.resume': 'Riprendi il monitoraggio',
  'cmd.plan': 'Piano e limiti',
  'cmd.lang': 'Lingua',
  'cmd.help': 'Come funziona',
  'cmd.bind': 'Collega questo gruppo o argomento',
  'cmd.unbind': 'Scollega questa chat',
  'cmd.users': 'Tutti gli utenti',
  'cmd.userinfo': 'Un utente nel dettaglio',
  'cmd.stats': 'Statistiche di sistema',
  'cmd.grant': 'Assegna un piano',

  // inline menu
  'menu.removed': 'Il menu è passato nei pulsanti sotto i messaggi — la tastiera in basso non c’è più.',
  'menu.title': '<b>Vinted Monitor</b>\nScegli un’azione:',
  'btn.toggleOn': '⏸ Monitoraggio: attivo',
  'btn.toggleOff': '▶️ Monitoraggio: spento',
  'kb.menu': '⬅️ Menu',

  // admin image commands
  'image.what.start': 'il benvenuto di /start',
  'image.what.help': 'l’esempio di /help',
  'image.usage': '🖼 Manda una foto per {what} — come risposta a questo comando, o nel tuo prossimo messaggio.\nPer toglierla: <code>{command} clear</code>',
  'image.saved': '✅ Immagine per {what} salvata ({kb} KB). Controlla con {check}.',
  'image.failed': '⚠️ Non sono riuscito a salvare l’immagine: {error}',
  'image.cleared': '🗑 Immagine per {what} rimossa.',
  'image.notPhoto': 'Questa non è una foto. Mandala come immagine, non come documento.',

  // plans, add-on, support, near-miss note
  'plan.name.free': 'Scout',
  'plan.name.basic': 'Hunter',
  'plan.name.pro': 'Ranger',
  'plan.name.turbo': 'Sniper Elite',
  'plan.name.elite_max': 'Elite Max 🔒',
  'plan.scarcity': '🔥 <b>Sniper Elite</b> — i posti sono in numero limitato.',
  'plan.scarcitySeats': '🔥 <b>Sniper Elite</b> — restano solo {left} posti.',
  'plan.soldOut': '🔥 <b>Sniper Elite</b> — i posti sono tutti presi. Se ne libera uno quando un abbonamento scade.',
  'plan.full': '🚫 {plan} è pieno in questo momento — i posti sono tutti presi. Non è stato addebitato niente. Un posto si libera quando un abbonamento scade.',
  'plan.refunded': '↩️ {plan} si è riempito mentre il pagamento era in corso, quindi è stato rimborsato per intero. Non è stato addebitato niente.',
  'btn.soldOut': '{name} · posti esauriti',
  'plan.tiersHeader': '<b>Piani</b>',
  'plan.tierRow': '{name} — {price} · controlla ogni {interval}s · {links} link · ⚡{burst}',
  'plan.tierRowNoBurst': '{name} — {price} · controlla ogni {interval}s · {links} link',
  'plan.addon': 'Link extra acquistati: +{count}',
  'plan.addonOffer': '➕ {links} link per {price} — in aggiunta a qualsiasi piano a pagamento.',
  'btn.addon': '➕{links} link · {stars} ⭐',
  'addon.bought': '✅ +{links} link. Adesso ne hai {total}.',
  'addon.needPlan': 'I link extra si aggiungono a un piano a pagamento — scegline uno qui sotto.',
  'btn.contact': '✍️ Scrivi a {handle}',
  'btn.supportRelay': '💬 Manda da qui',
  'support.sos': `🆘 <b>Supporto</b>

Dietro {handle} c’è una persona, non un modulo — scrivi quando vuoi, avrai una risposta vera.

• <b>Più link di quanti il tuo piano ne consenta</b> — basta chiedere. Il limite è un valore predefinito, non un muro.
• <b>Qualcosa non funziona</b> — racconta cosa hai visto. I bug passano davanti a tutto.
• <b>Un’idea</b> — quasi tutto quello che questo bot sa fare è nato dal messaggio di qualcuno.

Scrivi nella tua lingua, viene letta comunque.`,
  'btn.support': '🆘 Supporto',
  'support.ask': '🆘 Scrivi il tuo messaggio tutto in una volta — lo passo al supporto e ti riporto qui la risposta.',
  'support.sent': '✅ Inviato. La risposta arriverà in questa chat.',
  'support.off': 'Il supporto non è disponibile adesso. Riprova più tardi.',
  'support.from': '🆘 <b>Richiesta di supporto</b>\nDa: {who} (<code>{id}</code>), lingua {lang}, piano {plan}\n\n{text}\n\n<i>Rispondi a questo messaggio e la risposta arriva a loro.</i>',
  'support.replied': '💬 <b>Supporto</b>\n\n{text}',
  'support.delivered': '✅ Inviato all’utente.',
  'support.lost': 'Non riesco a capire a chi risponde — rispondi direttamente al messaggio della richiesta.',
  'fomo.note': '⏱ Questo annuncio era online da {seconds}s quando lo hai visto. <b>Sniper Elite</b> li vede all’istante.',
  'kb.changeDest': '📍 Destinazione',
  'search.destChanged': '✅ «{name}» adesso va a {dest}.',

  // what the next tier up actually buys
  'plan.next.header': '⬆️ <b>{next}</b> subito dopo il tuo {current}:',
  'plan.next.speed': '• controlla {times}× più spesso',
  'plan.next.links': '• {times}× i link',
  'plan.next.burst': '• {times}× la raffica di invio',
  'plan.next.price': '• solo +${delta} al mese',
  'plan.next.same': '• uguale, ma con {links} link invece di {currentLinks}',

  // what arrives when a tier is reached
  'tier.welcome.basic': '▬▬ι═══════ﺤ\n\nLa caccia è aperta, <b>Hunter</b> 🔪\nAdesso {links} link e un controllo ogni {every}.\nPiazza i tuoi link 🪤 — il resto è compito mio.',
  'tier.welcome.pro': 'ᡕᠵデ气亠\n\nSei temprato dalle battaglie e leggi il campo in un altro modo, <b>ranger</b> ⚔️\nAdesso {links} link e un controllo ogni {every},\nraffica {burst} — i risultati arrivano in salva, non uno alla volta con le pause.\nTutti gli altri stanno ancora premendo F5. 😌',
  'tier.welcome.turbo': '︻芫═───\n\nSei <b>Sniper Elite</b> — vedere un bersaglio e prenderlo ce l’hai nel sangue. 🩸\nBenvenuto al rango supremo🥷\n<b>Sniper Elite</b>: {links} link, raffica {burst}, un controllo ogni {every}.\n\nIl pezzo raro va a chi l’ha aperto per primo. Da adesso sei tu. 💎\nGoditelo)',
  'tier.welcome.elite_max': '▄︻デ══━一\n\nQuesto rango non è mai stato sul listino, <b>Elite Max</b> 🔒\n{links} link, raffica {burst}, un controllo ogni {every} — niente di quello che è in vendita ci si avvicina.\nNon ce l’ha nessun altro. 🤫',

  // how an interval reads to a person
  'unit.sec': '{n}s',
  'unit.day': '{n}g',
  'unit.week': 'settimana',
  'unit.hour': '{n}h',
  'unit.min': '{n}m',
};
