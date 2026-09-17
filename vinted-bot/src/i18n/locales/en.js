export const en = {
  'btn.add': '➕ Add link',
  'btn.list': '📋 My links',
  'btn.chats': '👥 My chats',
  'btn.toggle': '⏯ Monitoring',
  'btn.plan': '💳 Plan',
  'btn.help': '❓ Help',
  'btn.lang': '🌐 Language',

  'help.text': `<b>Vinted Monitor</b> — new Vinted listings delivered to Telegram.

<b>How to use</b>
1. Set up the search on Vinted: brand, category, size, price.
2. Copy the URL of the search page.
3. "➕ Add link" → send the URL → name it (for example <i>Raf</i>).
4. Choose where it goes: here, a group, or a topic inside a group.

<b>Groups and topics</b>
• Create a group → add the bot as admin → type <code>/bind</code> there.
• Turn on Topics in the group and the bot creates a topic per search by itself — nothing manual.
• Channel: add the bot as admin and forward me any post from it.

<b>Commands</b>
/add /list /chats /bind /pause /resume /plan /lang`,

  'add.askUrl': `Send a Vinted search URL.

Example:
<code>https://www.vinted.de/catalog?search_text=raf+simons&amp;price_to=300</code>`,
  'add.askName': 'What should this search be called? For example <i>Raf</i>, <i>Helmut Lang</i>, <i>Bags</i>.',
  'add.askDest': 'Where should new listings go?',
  'add.limit': '{plan} plan limit: {limit} links. Delete one or upgrade (/plan).',
  'add.created':
    '✅ "{name}" added.\nChecked every ~{seconds}s. The first pass only records what is already listed — you will get everything new after that.',

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
  'item.protection': '{total} with protection',
  'item.button': 'URL',

  'send.searchDisabled': '⚠️ Search "{name}" was paused: I cannot post to its chat ({error}).',
  'migrate.done':
    'ℹ️ Group "{title}" became a supergroup — moved {count} search(es) to the new chat, nothing for you to do.',
};
