export const fr = {
  'btn.add': '➕ Ajouter un lien',
  'btn.list': '📋 Mes liens',
  'btn.chats': '👥 Mes chats',
  'btn.toggle': '⏯ Surveillance',
  'btn.plan': '💳 Abonnement',
  'btn.help': '❓ Aide',
  'btn.lang': '🌐 Langue',

  'start.text': `⚡️ <b>Vinted Monitor</b> 👟👜

🔎 Tu règles la recherche sur Vinted — je la surveille et 🔔 je pousse ici chaque nouvelle annonce quelques secondes après sa mise en ligne. Pendant que les autres actualisent la page, toi tu écris déjà au vendeur. 🏃‍♂️💨

🔗 Un lien = une recherche. Autant que tu veux — 📩 en privé ou 🧵 dans les sujets d’un groupe.`,

  'help.text': `⚡️ <b>Vinted Monitor</b> — les nouvelles annonces Vinted en quelques secondes.

🔎 <b>Ajouter une recherche</b>
1. Règle les filtres sur Vinted : marque, catégorie, taille, prix.
2. Copie l’URL de la page de résultats.
3. « ➕ Ajouter un lien » → envoie l’URL → donne-lui un nom (<i>Raf</i>).
4. Choisis où ça arrive : ici, dans un groupe, ou dans un sujet.

{example}

🧵 <b>Groupes et sujets</b>
1. Crée un groupe.
2. Ajoute le bot comme admin, avec « Gérer les sujets » activé.
3. Active les Sujets dans les réglages du groupe, puis envoie <code>/bind</code> là-bas.
4. C’est prêt — chaque lien que tu ajoutes ouvre son propre sujet : Raf, Helmut, Sacs, tout au même endroit.

⌨️ <b>Commandes</b> — <code>/start</code>, <code>/add</code>, <code>/help</code>. Tout le reste passe par des boutons.`,

  // the example section: a mockup when there is no picture, a pointer when there is
  'help.example': `🔔 <b>À quoi ressemble une alerte</b>
<i>[photo de l’article]</i>
📌 <b>Raf Simons bomber</b>
💰 Prix : 240€
🏷 Marque : Raf Simons
📏 Taille : L
#Raf
[ URL ]`,
  'help.exampleHint': '🔔 <b>Voici à quoi ressemble une alerte</b> ⬇️',

  'add.askUrl': `Envoie l’URL d’une recherche Vinted.

Exemple :
<code>https://www.vinted.fr/catalog?search_text=raf+simons&amp;price_to=300</code>`,
  'add.askName': 'Comment appeler cette recherche ? Par exemple <i>Raf</i>, <i>Helmut Lang</i>, <i>Sacs</i>.',
  'add.askDest': 'Où envoyer les nouvelles annonces ?',
  'add.limit': 'Limite de l’abonnement {plan} : {limit} liens. Supprimes-en un ou passe au niveau supérieur (/plan).',
  'add.created':
    '✅ « {name} » ajouté.\nVérifié toutes les ~{seconds}s. Le premier passage ne fait qu’enregistrer ce qui est déjà en ligne — tout ce qui arrive ensuite est pour toi.',
  'add.atCapacity':
    '⏳ Tous les créneaux de surveillance sont pris en ce moment, le lien n’a pas été ajouté. Réessaie dans quelques minutes — il s’en libère en permanence.',

  'add.locked':
    '🔒 Tu n’as aucun abonnement, il n’y a donc nulle part où ajouter un lien. <b>Scout</b>, c’est une semaine au prix d’un café — ouvre Abonnement ci-dessous.',

  'url.err.notLink': 'Ça ne ressemble pas à un lien.',
  'url.err.scheme': 'Il faut un lien http(s).',
  'url.err.notVinted': 'Ce n’est pas un lien Vinted.',
  'url.err.itemPage': 'Ce lien pointe vers un seul article — il me faut une page de recherche (catalogue).',
  'url.err.noFilters':
    'Le lien ne porte aucun filtre — choisis une marque / catégorie / un prix sur Vinted, puis copie l’URL à nouveau.',

  'list.empty': 'Aucun lien pour l’instant. Appuie sur « ➕ Ajouter un lien ».',
  'list.header': '<b>Mes liens</b> ({count}/{limit})\nSurveillance : {state} · toutes les {seconds}s ({plan})',
  'state.on': '🟢 active',
  'state.off': '🔴 coupée',

  'card.dest': 'Destination : {dest}',
  'card.status': 'Statut : {status}',
  'status.active': '🟢 active',
  'status.paused': '⏸ en pause',
  'card.sent': 'Annonces envoyées : {count}',
  'card.lastCheck': 'Dernière vérification : {time} UTC',
  'dest.private': 'messages privés',
  'dest.topic': 'sujet #{id}',

  'kb.cancel': '✖️ Annuler',
  'kb.private': '📩 Ici, en privé',
  'kb.wholeGroup': '👥 Tout le groupe « {title} »',
  'kb.newTopic': '✨ Créer le sujet « {name} »',
  'kb.back': '⬅️ Retour',
  'kb.openSearch': '🔗 Ouvrir la recherche',
  'kb.disable': '⏸ Mettre en pause',
  'kb.enable': '▶️ Reprendre',
  'kb.rename': '✏️ Renommer',
  'kb.delete': '🗑 Supprimer',
  'kb.toList': '⬅️ Retour à la liste',
  'kb.yesDelete': '🗑 Oui, supprimer',
  'kb.topicsCount': '📂 {title} ({count} sujets)',

  'chats.header': '<b>Mes chats</b>',
  'chats.empty': 'Aucun groupe ni canal connecté.',
  'chats.hint':
    'Pour en ajouter un : mets le bot dans un groupe comme admin et tape <code>/bind</code> là-bas. Si les Sujets sont activés, le bot crée un sujet par recherche tout seul.',
  'chats.unbound': 'Déconnecté',

  'bind.onlyInGroup': 'Envoie /bind <b>dans le groupe</b> où le bot a été ajouté.',
  'bind.onlyAdmin': 'Seul un admin de ce chat peut le connecter.',
  'bind.limit': 'Limite de chats : {limit}.',
  'bind.topicOk': '✅ Sujet « {name} » dans « {title} » connecté.',
  'bind.groupOk':
    '✅ Groupe « {title} » connecté. Active les Sujets et le bot créera un sujet par recherche tout seul.',
  'bind.notBound': 'Ce chat n’est pas connecté.',
  'bind.unbound': 'Chat déconnecté. Les recherches qui publiaient ici sont arrêtées — réaffecte-les en privé avec le bot.',
  'bind.channelOk': '✅ Canal « {title} » connecté.',
  'bind.channelNeedAdmin': 'Ajoute d’abord le bot comme admin de ce canal, puis transfère un message à nouveau.',
  'bind.channelNotSeen': 'Je ne vois pas ce canal. Ajoute le bot comme admin et transfère un message à nouveau.',

  'topic.created': '✅ Sujet « {name} » créé et lié à cette recherche.',
  'topic.createFailed':
    '⚠️ Impossible de créer le sujet : {error}\nDonne au bot le droit « Gérer les sujets », ou choisis un sujet à la main.',

  'toggle.on': '🟢 Surveillance activée.',
  'toggle.off': '🔴 Surveillance coupée.',

  'plan.title': '<b>Abonnement : {plan}</b>',
  'plan.interval': 'Intervalle de vérification : ~{seconds}s',
  'plan.burst': 'Rafale d’envoi : jusqu’à {count} annonces d’affilée',
  'plan.limit': 'Limite de liens : {limit}',
  'plan.used': 'Utilisés : {count}',
  'plan.until': 'Valable jusqu’au : {date}',
  'plan.tiers': 'Free — {free}s · Basic — {basic}s · Pro — {pro}s',
  'plan.invoiceDesc': '{days} jours · intervalle ~{seconds}s · jusqu’à {limit} liens',
  'pay.ok': '✅ {plan} activé pour {days} jours.',
  'plan.name.starter': 'Gratuit',
  'plan.starterLeft': 'Journée gratuite : {left} restantes',
  'plan.overLimit':
    '⚠️ Tu dépasses la limite de ton nouvel abonnement — redescends à {limit} liens sous {left}, sinon les liens en trop se mettent en pause tout seuls.',
  'limit.warned':
    '⚠️ Ton abonnement autorise maintenant {limit} liens et tu en as {active}. Redescends à {limit} sous {left} et il ne se passe rien — sinon les plus récents se mettent en pause d’eux-mêmes. Rien n’est supprimé dans les deux cas.',
  'limit.enforced':
    '⏸ {paused} recherche(s) mise(s) en pause pour tenir dans les {limit} liens de ton abonnement. Rien n’a été supprimé — relance celles que tu veux dans 📋 Mes liens dès que tu as de la place.',
  'plan.name.locked': 'Aucun abonnement 🔒',
  'plan.lockedNote': 'Rien ne tourne : tes recherches sont en pause tant que tu n’as pas choisi un abonnement ci-dessous.',
  'plan.grandfathered': '(acquis — rien n’a été supprimé, mais il faudra en enlever un avant d’en ajouter un autre)',
  'plan.trialLeft': 'Essai : {left} restantes',
  'plan.legendGroup': '👥 = toutes tes recherches dans un seul groupe, rangées par sujet — pas 100 conversations séparées',
  'plan.legendBurst': '⚡N = N trouvailles arrivent d’un coup, pas au compte-gouttes. Telegram limite la vitesse d’envoi des bots — toi tu es au maximum, les niveaux en dessous non.',
  'plan.invoiceDescTrial': '{period} · intervalle ~{seconds}s · jusqu’à {limit} liens',
  'pay.okTrial': '✅ {plan} est actif. Accès : {period}.',
  'trial.window.week': '1 semaine',
  'trial.window.days': '{n} jours',
  'trial.window.hours': '{n} heures',
  'plan.renewsOn': '🔄 Renouvellement automatique le {date}',
  'plan.cancelledUntil': '⏹ Résilié — accès jusqu’au {date}',
  'plan.renewFailed': '⚠️ Le renouvellement a échoué — pas assez d’Étoiles. Recharge et Telegram réessaie ; accès jusqu’au {date}',
  'plan.invoiceDescSub': 'Tous les 30 jours · intervalle ~{seconds}s · jusqu’à {limit} liens · résiliable à tout moment',
  'plan.subOffer':
    '🔄 <b>{plan}</b> — {stars} ⭐ tous les {days} jours, prélevés automatiquement. Résiliable à tout moment dans /plan ; l’accès va jusqu’à la date déjà payée.',
  'plan.subUnavailable': '⚠️ Impossible d’ouvrir l’abonnement pour l’instant. Réessaie dans une minute.',
  'btn.subscribe': 'S’abonner à {plan} · {stars} ⭐',
  'btn.subCancel': '⏹ Couper le renouvellement',
  'btn.subResume': '🔄 Reprendre le renouvellement',
  'pay.okSub': '✅ {plan} est actif et se renouvelle automatiquement le {date}. Tu peux résilier à tout moment dans /plan.',
  'sub.cancelled': '⏹ Le renouvellement automatique est coupé. Le <b>{date}</b> est le dernier jour de la période déjà payée — rien ne change avant.',
  'sub.cancelledShort': 'Renouvellement coupé',
  'sub.resumed': '🔄 Le renouvellement automatique est réactivé.',
  'sub.resumedShort': 'Renouvellement actif',
  'sub.failed': '⚠️ {plan} n’a pas pu être renouvelé — il te manque des Étoiles pour atteindre {stars} ⭐. Recharge et Telegram réessaie ; l’abonnement reste actif jusqu’au <b>{date}</b>.',
  'sub.none': 'Rien à résilier ici.',
  'sub.changeFailed': 'Telegram a refusé de modifier l’abonnement pour l’instant. Réessaie dans une minute.',

  'lang.choose': 'Choisis la langue de l’interface :',
  'lang.set': '✅ Langue passée en français.',

  'rename.ask': 'Nouveau nom pour « {name} » ?',
  'rename.ok': '✅ Renommé.',
  'delete.confirm': 'Supprimer « {name} » ?',
  'delete.done': 'Supprimé',

  'common.cancelled': 'Annulé',
  'common.expired': 'Cette session a expiré, recommence : /add',
  'common.notUnderstood': 'Je n’ai pas compris. Utilise les boutons ci-dessous ou /help.',
  'common.enabled': 'Activé',
  'common.disabled': 'Désactivé',

  'item.noTitle': 'Sans titre',
  'item.price': 'Prix',
  'item.brand': 'Marque',
  'item.size': 'Taille',
  'item.button': 'URL',

  'send.searchDisabled': '⚠️ La recherche « {name} » a été mise en pause : je ne peux pas publier dans son chat ({error}).',
  'migrate.done':
    'ℹ️ Le groupe « {title} » est devenu un supergroupe — {count} recherche(s) déplacée(s) vers le nouveau chat, rien à faire de ton côté.',

  // Telegram command menu (setMyCommands)
  'cmd.start': 'Démarrer le bot',
  'cmd.add': 'Ajouter un lien',
  'cmd.list': 'Mes liens',
  'cmd.chats': 'Mes chats et sujets',
  'cmd.pause': 'Mettre la surveillance en pause',
  'cmd.resume': 'Reprendre la surveillance',
  'cmd.plan': 'Abonnement et limites',
  'cmd.lang': 'Langue',
  'cmd.help': 'Comment ça marche',
  'cmd.bind': 'Connecter ce groupe ou ce sujet',
  'cmd.unbind': 'Déconnecter ce chat',
  'cmd.users': 'Tous les utilisateurs',
  'cmd.userinfo': 'Un utilisateur en détail',
  'cmd.stats': 'Statistiques système',
  'cmd.grant': 'Attribuer un abonnement',

  // inline menu
  'menu.removed': 'Le menu est passé dans les boutons sous les messages — le clavier du bas a disparu.',
  'menu.title': '<b>Vinted Monitor</b>\nChoisis une action :',
  'btn.toggleOn': '⏸ Surveillance : active',
  'btn.toggleOff': '▶️ Surveillance : coupée',
  'kb.menu': '⬅️ Menu',

  // admin image commands
  'image.what.start': 'l’accueil /start',
  'image.what.help': 'l’exemple /help',
  'image.usage': '🖼 Envoie une photo pour {what} — en réponse à cette commande, ou dans ton message suivant.\nPour la retirer : <code>{command} clear</code>',
  'image.saved': '✅ Image pour {what} enregistrée ({kb} Ko). Vérifie avec {check}.',
  'image.failed': '⚠️ Impossible d’enregistrer l’image : {error}',
  'image.cleared': '🗑 Image pour {what} retirée.',
  'image.notPhoto': 'Ce n’est pas une photo. Envoie-la comme image, pas comme document.',

  // plans, add-on, support, near-miss note
  'plan.name.free': 'Scout',
  'plan.name.basic': 'Hunter',
  'plan.name.pro': 'Ranger',
  'plan.name.turbo': 'Sniper Elite',
  'plan.name.elite_max': 'Elite Max 🔒',
  'plan.scarcity': '🔥 <b>Sniper Elite</b> — le nombre de places est limité.',
  'plan.scarcitySeats': '🔥 <b>Sniper Elite</b> — plus que {left} places.',
  'plan.soldOut': '🔥 <b>Sniper Elite</b> — toutes les places sont prises. Une se libère dès qu’un abonnement s’arrête.',
  'plan.full': '🚫 {plan} est complet en ce moment — toutes les places sont prises. Rien n’a été débité. Une place se libère dès qu’un abonnement s’arrête.',
  'plan.refunded': '↩️ {plan} s’est rempli pendant le paiement, il a donc été intégralement remboursé. Rien n’a été débité.',
  'btn.soldOut': '{name} · complet',
  'plan.tiersHeader': '<b>Abonnements</b>',
  'plan.tierRow': '{name} — {price} · vérifie toutes les {interval}s · {links} liens · ⚡{burst}',
  'plan.tierRowNoBurst': '{name} — {price} · vérifie toutes les {interval}s · {links} liens',
  'plan.addon': 'Liens supplémentaires achetés : +{count}',
  'plan.addonOffer': '➕ {links} liens pour {price} — en plus de n’importe quel abonnement payant.',
  'btn.addon': '➕{links} liens · {stars} ⭐',
  'addon.bought': '✅ +{links} liens. Tu en as maintenant {total}.',
  'addon.needPlan': 'Les liens supplémentaires s’ajoutent à un abonnement payant — choisis-en un ci-dessous.',
  'btn.contact': '✍️ Écrire à {handle}',
  'btn.supportRelay': '💬 Envoyer d’ici',
  'support.sos': `🆘 <b>Support</b>

Derrière {handle} il y a quelqu’un, pas un formulaire — écris quand tu veux, tu auras une vraie réponse.

• <b>Plus de liens que ton abonnement n’autorise</b> — demande, simplement. La limite est un réglage par défaut, pas un mur.
• <b>Quelque chose ne marche pas</b> — raconte ce que tu as vu. Les bugs passent devant tout le reste.
• <b>Une idée</b> — l’essentiel de ce que fait ce bot est parti du message de quelqu’un.

Écris dans ta langue, elle sera lue de toute façon.`,
  'btn.support': '🆘 Support',
  'support.ask': '🆘 Écris ton message en une fois — je le transmets au support et je te ramène la réponse ici.',
  'support.sent': '✅ Envoyé. La réponse arrivera dans ce chat.',
  'support.off': 'Le support est indisponible pour l’instant. Réessaie plus tard.',
  'support.from': '🆘 <b>Demande de support</b>\nDe : {who} (<code>{id}</code>), langue {lang}, abonnement {plan}\n\n{text}\n\n<i>Réponds à ce message et la réponse lui parvient.</i>',
  'support.replied': '💬 <b>Support</b>\n\n{text}',
  'support.delivered': '✅ Envoyé à l’utilisateur.',
  'support.lost': 'Je ne peux pas savoir à qui ça répond — réponds directement au message de la demande.',
  'fomo.note': '⏱ Cette annonce était en ligne depuis {seconds}s quand tu l’as vue. <b>Sniper Elite</b> les voit instantanément.',
  'kb.changeDest': '📍 Destination',
  'search.destChanged': '✅ « {name} » part maintenant vers {dest}.',

  // what the next tier up actually buys
  'plan.next.header': '⬆️ <b>{next}</b> juste après ton {current} :',
  'plan.next.speed': '• vérifie {times}× plus souvent',
  'plan.next.links': '• {times}× plus de liens',
  'plan.next.burst': '• {times}× la rafale d’envoi',
  'plan.next.price': '• seulement +${delta} par mois',
  'plan.next.same': '• pareil, avec {links} liens au lieu de {currentLinks}',

  // what arrives when a tier is reached
  'tier.welcome.basic': '▬▬ι═══════ﺤ\n\nLa chasse est ouverte, <b>Hunter</b> 🔪\nMaintenant {links} liens et une vérification toutes les {every}.\nPose tes liens 🪤 — le reste, c’est mon travail.',
  'tier.welcome.pro': 'ᡕᠵデ气亠\n\nTu as fait tes armes et tu lis le terrain autrement, <b>ranger</b> ⚔️\nMaintenant {links} liens et une vérification toutes les {every},\nrafale {burst} — les trouvailles arrivent en salve, pas une par une avec des pauses.\nTous les autres appuient encore sur F5. 😌',
  'tier.welcome.turbo': '︻芫═───\n\nTu es <b>Sniper Elite</b> — voir une cible et la prendre, c’est dans ton sang. 🩸\nBienvenue au rang suprême🥷\n<b>Sniper Elite</b> : {links} liens, rafale {burst}, une vérification toutes les {every}.\n\nLa pièce rare revient à celui qui l’a ouverte en premier. Désormais, c’est toi. 💎\nProfite)',
  'tier.welcome.elite_max': '▄︻デ══━一\n\nCe rang n’a jamais figuré sur la grille tarifaire, <b>Elite Max</b> 🔒\n{links} liens, rafale {burst}, une vérification toutes les {every} — rien de ce qui est en vente n’en approche.\nPersonne d’autre ne l’a. 🤫',

  // how an interval reads to a person
  'unit.sec': '{n}s',
  'unit.day': '{n}j',
  'unit.week': 'semaine',
  'unit.hour': '{n}h',
  'unit.min': '{n}m',
};
