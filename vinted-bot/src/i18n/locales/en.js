export const en = {
  'btn.add': '➕ Add link',
  'btn.list': '📋 My links',
  'btn.chats': '👥 My chats',
  'btn.toggle': '⏯ Monitoring',
  'btn.plan': '💳 Plan',
  'btn.help': '❓ Help',
  'btn.lang': '🌐 Language',

  'start.text': `⚡️ <b>Vinted Monitor</b> 👟👜

🔎 You set up the search on Vinted — I watch it and 🔔 push every new listing here seconds after it goes live. While everyone else refreshes the page, you're already messaging the seller. 🏃‍♂️💨

🔗 One link = one search. As many as you like — 📩 to your DMs or 🧵 into group topics.`,

  'help.text': `⚡️ <b>Vinted Monitor</b> — new Vinted listings in seconds.

🔎 <b>Adding a search</b>
1. Set the filters on Vinted: brand, category, size, price.
2. Copy the URL of the search page.
3. "➕ Add link" → send the URL → name it (<i>Raf</i>).
4. Pick where it lands: here, a group, or a topic.

{example}

🧵 <b>Groups and topics</b>
Add the bot to a group as admin and type <code>/bind</code> there. Turn on Topics and it creates one per search by itself: Raf, Helmut, Bags, all in one place.

🛡 <b>No duplicates</b>
The first pass only records what is already listed. A listing reaches a topic once, even when ten of your links match it.

⚙️ <b>Settings</b> — in the buttons below: plan, language, your chats.
⌨️ <b>Commands</b> — <code>/start</code>, <code>/add</code>, <code>/help</code>. Everything else is a button.`,

  // the example section: a mockup when there is no picture, a pointer when there is
  'help.example': `🔔 <b>What an alert looks like</b>
<i>[item photo]</i>
📌 <b>Raf Simons bomber</b>
💰 Price : 240€
🏷 Brand : Raf Simons
📏 Size : L
#Raf
[ URL ]`,
  'help.exampleHint': '🔔 <b>Here is what an alert looks like</b> ⬇️',

  'add.askUrl': `Send a Vinted search URL.

Example:
<code>https://www.vinted.de/catalog?search_text=raf+simons&amp;price_to=300</code>`,
  'add.askName': 'What should this search be called? For example <i>Raf</i>, <i>Helmut Lang</i>, <i>Bags</i>.',
  'add.askDest': 'Where should new listings go?',
  'add.limit': '{plan} plan limit: {limit} links. Delete one or upgrade (/plan).',
  'add.created':
    '✅ "{name}" added.\nChecked every ~{seconds}s. The first pass only records what is already listed — you will get everything new after that.',
  'add.atCapacity':
    '⏳ Every monitoring slot is busy right now, so this link was not added. Try again in a few minutes — slots free up all the time.',

  'url.err.notLink': "That doesn't look like a link.",
  'url.err.scheme': 'An http(s) link is required.',
  'url.err.notVinted': 'That is not a Vinted link.',
  'url.err.itemPage': 'That links to a single item — I need a search (catalog) page.',
  'url.err.noFilters':
    'The link carries no filters — set a brand/category/price on Vinted and copy the URL again.',

  'list.empty': 'No links yet. Tap "➕ Add link".',
  'list.header': '<b>My links</b> ({count}/{limit})\nMonitoring: {state} · every {seconds}s ({plan})',
  'state.on': '🟢 on',
  'state.off': '🔴 off',

  'card.dest': 'Destination: {dest}',
  'card.status': 'Status: {status}',
  'status.active': '🟢 active',
  'status.paused': '⏸ paused',
  'card.sent': 'Listings sent: {count}',
  'card.lastCheck': 'Last check: {time} UTC',
  'dest.private': 'direct messages',
  'dest.topic': 'topic #{id}',

  'kb.cancel': '✖️ Cancel',
  'kb.private': '📩 Here in chat',
  'kb.wholeGroup': '👥 Whole group "{title}"',
  'kb.newTopic': '✨ Create topic "{name}"',
  'kb.back': '⬅️ Back',
  'kb.openSearch': '🔗 Open search',
  'kb.disable': '⏸ Pause',
  'kb.enable': '▶️ Resume',
  'kb.rename': '✏️ Rename',
  'kb.delete': '🗑 Delete',
  'kb.toList': '⬅️ Back to list',
  'kb.yesDelete': '🗑 Yes, delete',
  'kb.topicsCount': '📂 {title} ({count} topics)',

  'chats.header': '<b>My chats</b>',
  'chats.empty': 'No groups or channels connected.',
  'chats.hint':
    'To add one: put the bot in a group as admin and type <code>/bind</code> there. With Topics enabled, the bot creates a topic per search by itself.',
  'chats.unbound': 'Disconnected',

  'bind.onlyInGroup': 'Send /bind <b>inside the group</b> the bot has been added to.',
  'bind.onlyAdmin': 'Only an admin of that chat can connect it.',
  'bind.limit': 'Chat limit: {limit}.',
  'bind.topicOk': '✅ Topic "{name}" in "{title}" connected.',
  'bind.groupOk':
    '✅ Group "{title}" connected. Turn on Topics and the bot will create a topic per search by itself.',
  'bind.notBound': 'This chat is not connected.',
  'bind.unbound': 'Chat disconnected. Searches that posted here are stopped — reassign them in the bot DM.',
  'bind.channelOk': '✅ Channel "{title}" connected.',
  'bind.channelNeedAdmin': 'Add the bot as an admin of that channel first, then forward a post again.',
  'bind.channelNotSeen': "I can't see that channel. Add the bot as admin and forward a post again.",

  'topic.created': '✅ Topic "{name}" created and bound to this search.',
  'topic.createFailed':
    "⚠️ Couldn't create the topic: {error}\nGive the bot the 'Manage topics' right, or pick a topic manually.",

  'toggle.on': '🟢 Monitoring on.',
  'toggle.off': '🔴 Monitoring off.',

  'plan.title': '<b>Plan: {plan}</b>',
  'plan.interval': 'Check interval: ~{seconds}s',
  'plan.burst': 'Delivery burst: up to {count} listings back to back',
  'plan.limit': 'Link limit: {limit}',
  'plan.used': 'In use: {count}',
  'plan.until': 'Valid until: {date}',
  'plan.tiers': 'Free — {free}s · Basic — {basic}s · Pro — {pro}s',
  'plan.invoiceDesc': '{days} days · ~{seconds}s interval · up to {limit} links',
  'pay.ok': '✅ {plan} activated for {days} days.',

  'lang.choose': 'Choose the interface language:',
  'lang.set': '✅ Language switched to English.',

  'rename.ask': 'New name for "{name}"?',
  'rename.ok': '✅ Renamed.',
  'delete.confirm': 'Delete "{name}"?',
  'delete.done': 'Deleted',

  'common.cancelled': 'Cancelled',
  'common.expired': 'That session expired, start again: /add',
  'common.notUnderstood': "I didn't get that. Use the buttons below or /help.",
  'common.enabled': 'Enabled',
  'common.disabled': 'Disabled',

  'item.noTitle': 'Untitled',
  'item.price': 'Price',
  'item.brand': 'Brand',
  'item.size': 'Size',
  'item.button': 'URL',

  'send.searchDisabled': '⚠️ Search "{name}" was paused: I cannot post to its chat ({error}).',
  'migrate.done':
    'ℹ️ Group "{title}" became a supergroup — moved {count} search(es) to the new chat, nothing for you to do.',

  // Telegram command menu (setMyCommands)
  'cmd.start': 'Start the bot',
  'cmd.add': 'Add a link',
  'cmd.list': 'My links',
  'cmd.chats': 'My chats and topics',
  'cmd.pause': 'Pause monitoring',
  'cmd.resume': 'Resume monitoring',
  'cmd.plan': 'Plan and limits',
  'cmd.lang': 'Language',
  'cmd.help': 'How it works',
  'cmd.bind': 'Connect this group or topic',
  'cmd.unbind': 'Disconnect this chat',
  'cmd.users': 'All users',
  'cmd.userinfo': 'One user in detail',
  'cmd.stats': 'System stats',
  'cmd.grant': 'Grant a plan',

  // inline menu
  'menu.removed': 'The menu moved into buttons under the messages — the bottom keyboard is gone.',
  'menu.title': '<b>Vinted Monitor</b>\nPick an action:',
  'btn.toggleOn': '⏸ Monitoring: on',
  'btn.toggleOff': '▶️ Monitoring: off',
  'kb.menu': '⬅️ Menu',

  // admin image commands
  'image.what.start': 'the /start welcome',
  'image.what.help': 'the /help example',
  'image.usage': '🖼 Send a photo for {what} — as a reply to this command, or as your next message.\nTo remove it: <code>{command} clear</code>',
  'image.saved': '✅ Picture for {what} saved ({kb} KB). Check it with {check}.',
  'image.failed': '⚠️ Could not save the picture: {error}',
  'image.cleared': '🗑 Picture for {what} removed.',
  'image.notPhoto': 'That is not a photo. Send it as a picture, not as a document.',

  // plans, add-on, support, near-miss note
  'plan.name.free': 'Scout',
  'plan.name.basic': 'Hunter',
  'plan.name.pro': 'Ranger',
  'plan.name.turbo': 'Sniper Elite',
  'plan.name.elite_max': 'Elite Max 🔒',
  'plan.scarcity': '🔥 <b>Sniper Elite</b> — only a limited number of spots.',
  'plan.scarcitySeats': '🔥 <b>Sniper Elite</b> — {left} of {cap} spots left.',
  'plan.soldOut': '🔥 <b>Sniper Elite</b> — all {cap} spots are taken. One frees up when a subscription lapses.',
  'plan.full': '🚫 {plan} is full right now — every spot is taken. Nothing was charged. A spot frees up when a subscription lapses.',
  'plan.refunded': '↩️ {plan} filled up while the payment was going through, so it was refunded in full. Nothing was charged.',
  'btn.soldOut': '{name} · no spots left',
  'plan.tiersHeader': '<b>Plans</b>',
  'plan.tierRow': '{name} — {price} · checks every {interval}s · {links} links · burst {burst}',
  'plan.tierRowNoBurst': '{name} — {price} · checks every {interval}s · {links} links',
  'plan.addon': 'Extra links bought: +{count}',
  'plan.addonOffer': '➕ {links} links for {price} — on top of any paid plan.',
  'btn.addon': '➕{links} links · {stars} ⭐',
  'addon.bought': '✅ +{links} links. You now have {total}.',
  'addon.needPlan': 'Extra links come on top of a paid plan — pick one below.',
  'btn.support': '🆘 Support',
  'support.ask': '🆘 Write your message in one go — I will pass it to support and bring the answer back here.',
  'support.sent': '✅ Sent. The answer will arrive in this chat.',
  'support.off': 'Support is unavailable right now. Please try later.',
  'support.from': '🆘 <b>Support request</b>\nFrom: {who} (<code>{id}</code>), language {lang}, plan {plan}\n\n{text}\n\n<i>Reply to this message and the answer goes to them.</i>',
  'support.replied': '💬 <b>Support</b>\n\n{text}',
  'support.delivered': '✅ Sent to the user.',
  'support.lost': 'I cannot tell who this answers — reply to the request message itself.',
  'fomo.note': '⏱ This listing was live {seconds}s before you saw it. <b>Sniper Elite</b> sees these instantly.',
  'kb.changeDest': '📍 Destination',
  'search.destChanged': '✅ "{name}" now goes to {dest}.',

  // what the next tier up actually buys
  'plan.next.header': '⬆️ <b>{next}</b> next to your {current}:',
  'plan.next.speed': '• checks {times}× more often',
  'plan.next.links': '• {times}× the links',
  'plan.next.burst': '• {times}× the delivery burst',
  'plan.next.price': '• just +${delta} a month',
  'plan.next.same': '• the same, with {links} links instead of {currentLinks}',

  // what arrives when a tier is reached
  'tier.welcome.basic': "▬▬ι═══════ﺤ\n\nThe hunt is on, <b>Hunter</b> 🔪\nNow {links} links and a check every {every}.\nSet your links 🪤 — the rest is my job.",
  'tier.welcome.pro': "ᡕᠵデ气亠\n\nYou are battle-hardened and you read the field differently, <b>ranger</b> ⚔️\nNow {links} links and a check every {every},\nburst {burst} — finds land in a volley, not one at a time with pauses.\nEveryone else is still hitting F5. 😌",
  'tier.welcome.turbo': "︻芫═───\n\nYou are <b>Sniper Elite</b> — seeing a target and taking it is in your blood. 🩸\nWelcome to the supreme rank🥷\n<b>Sniper Elite</b>: {links} links, burst {burst}, a check every {every}.\n\nThe rare piece goes to whoever opened it first. Now that is you. 💎\nEnjoy)",
  'tier.welcome.elite_max': "▄︻デ══━一\n\nThis rank was never on the price list, <b>Elite Max</b> 🔒\n{links} links, burst {burst}, a check every {every} — nothing on sale comes close.\nNobody else has it. 🤫",

  // how an interval reads to a person
  'unit.sec': '{n}s',
  'unit.min': '{n}m',
};
