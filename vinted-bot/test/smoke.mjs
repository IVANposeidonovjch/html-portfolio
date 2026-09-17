/**
 * Offline smoke test: URL parsing, dedupe, priming, per-destination dedupe,
 * shared fetch grouping. Run: node test/smoke.mjs
 */
process.env.BOT_TOKEN = 'test';
process.env.DB_PATH = './data/test.sqlite';
process.env.DEDUPE_PER_DESTINATION = 'true';
process.env.ADMIN_IDS = '1';
process.env.BOT_TOKEN = '111:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

fs.rmSync('./data/test.sqlite', { force: true });
fs.rmSync('./data/test.sqlite-wal', { force: true });
fs.rmSync('./data/test.sqlite-shm', { force: true });

const { parseSearchUrl, InvalidVintedUrl } = await import('../src/vinted/url.js');
const store = await import('../src/db/index.js');
const { Monitor } = await import('../src/monitor/scheduler.js');
const { renderItem, itemKeyboard } = await import('../src/bot/format.js');
const { LOCALES, allLabels, resolveLang, t } = await import('../src/i18n/index.js');
const { STRATEGIES, extractItems, strategyByName, orderedStrategies, filtersLookHonoured } =
  await import('../src/vinted/endpoints.js');
const { candidatesFor, endpointCache } = await import('../src/vinted/client.js');
const { normalizeItem } = await import('../src/vinted/normalize.js');

let failures = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
};

/* ------------------------------ url parsing ----------------------------- */

test('parses filters and collapses repeated params', () => {
  const p = parseSearchUrl('https://www.vinted.de/catalog?brand_ids[]=5&brand_ids[]=9&price_to=300&search_text=raf');
  assert.equal(p.domain, 'www.vinted.de');
  assert.equal(p.query.brand_ids, '5,9');
  assert.equal(p.query.price_to, '300');
});

test('same search written differently yields the same canonical key', () => {
  const a = parseSearchUrl('https://vinted.de/catalog?price_to=300&brand_ids[]=9&brand_ids[]=5&page=2');
  const b = parseSearchUrl('https://www.vinted.de/catalog?brand_ids=5,9&price_to=300&order=relevance');
  assert.equal(a.canonicalKey, b.canonicalKey);
});

test('rejects non-Vinted, item and filterless URLs', () => {
  for (const bad of [
    'https://example.com/catalog?a=1',
    'https://www.vinted.de/items/12345-raf-simons',
    'https://www.vinted.de/catalog',
    'not a url',
  ]) assert.throws(() => parseSearchUrl(bad), InvalidVintedUrl, bad);
});

/* ------------------------------- endpoints ------------------------------ */

test('svc-catalogue variants target the api host, legacy stays on www', () => {
  const q = { brand_ids: '5,9', search_text: 'raf' };
  const u = (n) => strategyByName(n).url('www.vinted.de', q, { perPage: 5 });
  assert.match(u('svc-catalogue'), /^https:\/\/api\.vinted\.de\/svc-catalogue\/items\?/);
  assert.match(u('svc-catalogue-www'), /^https:\/\/api\.www\.vinted\.de\/svc-catalogue\/items\?/);
  assert.match(u('legacy-catalog'), /^https:\/\/www\.vinted\.de\/api\/v2\/catalog\/items\?/);
  for (const name of ['svc-catalogue', 'legacy-catalog']) {
    assert.match(u(name), /per_page=5/);
    assert.match(u(name), /order=newest_first/);
  }
});

test('the attribute variant folds *_ids filters into attribute_ids[...]', () => {
  const url = strategyByName('svc-catalogue-attrs').url(
    'www.vinted.de',
    { brand_ids: '5,9', catalog_ids: '2050', price_to: '300', search_text: 'raf' },
  );
  const sp = new URL(url).searchParams;
  assert.equal(sp.get('attribute_ids[brand]'), '5,9');
  assert.equal(sp.get('attribute_ids[catalog]'), '2050');
  assert.equal(sp.get('price_to'), '300', 'non-id filters must pass through untouched');
  assert.equal(sp.get('search_text'), 'raf');
});

test('every strategy is reachable by name and produces a valid URL', () => {
  for (const s of STRATEGIES) {
    assert.equal(strategyByName(s.name), s);
    assert.doesNotThrow(() => new URL(s.url('www.vinted.fr', { search_text: 'x' })));
  }
});

test('item arrays are found under every shape seen so far', () => {
  assert.deepEqual(extractItems({ items: [1] }), [1]);
  assert.deepEqual(extractItems({ catalogItems: [2] }), [2]);
  assert.deepEqual(extractItems({ data: { items: [3] } }), [3]);
  assert.equal(extractItems({ error: 'nope' }), null, 'an error body must not look like a hit');
  assert.equal(extractItems(null), null);
});

test('a text-only search leads with the plain shape it was confirmed with', () => {
  const pairs = candidatesFor('www.vinted.de', { search_text: 'raf' });
  assert.equal(pairs[0].strategy.name, 'svc-catalogue');
  assert.equal(pairs[0].headerKind, 'plain');
  assert.equal(pairs.length, STRATEGIES.length * 2);
  assert.ok(
    pairs.some((p) => p.strategy.name === 'svc-catalogue' && p.headerKind === 'full'),
    'the alternate header set must stay reachable as a fallback',
  );
});

test('a search with id filters leads with the attribute shape and full headers', () => {
  const pairs = candidatesFor('www.vinted.de', { brand_ids: '5', search_text: 'raf' });
  assert.equal(pairs[0].strategy.name, 'svc-catalogue-attrs');
  assert.equal(pairs[0].headerKind, 'full');
  assert.equal(orderedStrategies({ catalog_ids: '2050' })[0].name, 'svc-catalogue-attrs');
  assert.equal(orderedStrategies({ price_to: '300' })[0].name, 'svc-catalogue');
});

test('the plain shape is never offered to a filtered query', () => {
  // measured: plain brand_ids is accepted and ignored, so falling back to it
  // would post the wrong brand — no listings beats wrong listings
  for (const q of [{ brand_ids: '344976' }, { catalog_ids: '2050', price_to: '300' }]) {
    const names = orderedStrategies(q).map((s) => s.name);
    assert.ok(names.length > 0, 'a filtered query still needs somewhere to go');
    assert.ok(names.every((n) => n.endsWith('-attrs')), `plain shape leaked into ${names.join(',')}`);
    assert.ok(names.includes('svc-catalogue-attrs'));
    for (const pair of candidatesFor('www.vinted.de', q)) {
      assert.equal(pair.strategy.shape, 'attrs');
    }
  }
  // and the attribute URL really carries the bracket names
  const url = strategyByName('svc-catalogue-attrs').url('www.vinted.de', { brand_ids: '344976' });
  assert.equal(new URL(url).searchParams.get('attribute_ids[brand]'), '344976');
  assert.equal(new URL(url).searchParams.get('brand_ids'), null);
});

test('a text search resolution never leaks into a brand-filtered search', () => {
  // The Ralph -> Spice bug: "Ralph" (text only) resolved to the plain shape,
  // and "Spice" (brand filter) on the same domain reused it, so its filter was
  // dropped and the topic filled with other brands.
  endpointCache.clear();
  const ralph = { search_text: 'ralph lauren' };
  const spice = { search_text: 'spice', brand_ids: '344976' };

  endpointCache.remember('www.vinted.de', ralph, {
    strategy: strategyByName('svc-catalogue'),
    headerKind: 'plain',
  });

  // the text search keeps its cached choice
  assert.equal(candidatesFor('www.vinted.de', ralph)[0].strategy.name, 'svc-catalogue');

  // the filtered search must not see it at all — not first, not as a fallback
  const forSpice = candidatesFor('www.vinted.de', spice);
  assert.equal(forSpice[0].strategy.name, 'svc-catalogue-attrs');
  assert.ok(
    forSpice.every((p) => p.strategy.shape === 'attrs'),
    `plain shape reached a filtered query: ${forSpice.map((p) => p.strategy.name).join(',')}`,
  );

  // and the two classes are remembered separately
  endpointCache.remember('www.vinted.de', spice, {
    strategy: strategyByName('svc-catalogue-attrs'),
    headerKind: 'full',
  });
  assert.equal(endpointCache.get('www.vinted.de', ralph).strategy.name, 'svc-catalogue');
  assert.equal(endpointCache.get('www.vinted.de', spice).strategy.name, 'svc-catalogue-attrs');
  endpointCache.clear();
});

test('a cached choice that is no longer a legal candidate is ignored', () => {
  endpointCache.clear();
  const filtered = { brand_ids: '5' };
  // simulate a stale entry: right key, but a variant this query may not use
  endpointCache.remember('www.vinted.de', filtered, {
    strategy: strategyByName('legacy-catalog'),
    headerKind: 'full',
  });
  const pairs = candidatesFor('www.vinted.de', filtered);
  assert.equal(pairs[0].strategy.name, 'svc-catalogue-attrs');
  assert.ok(pairs.every((p) => p.strategy.name !== 'legacy-catalog'));
  endpointCache.clear();
});

test('a response that ignored the brand filter is rejected, not cached', () => {
  const query = { brand_ids: '5' };
  const withIds = (ids) => ids.map((brand_id, n) => ({ id: n, brand_id }));

  // strong signal: items carry brand_id
  assert.equal(filtersLookHonoured(query, withIds([5, 5, 5])).ok, true);
  assert.equal(filtersLookHonoured(query, withIds([5, 9, 12])).ok, false);

  // weak signal: only brand titles — one brand asked for, five returned
  const titled = (titles) => titles.map((brand_title, id) => ({ id, brand_title }));
  assert.equal(filtersLookHonoured(query, titled(['Raf Simons', 'Nike', 'Zara', 'H&M'])).ok, false);
  assert.equal(filtersLookHonoured(query, titled(['Raf Simons', 'Raf Simons', 'Raf Simons'])), null,
    'a single brand in the answer is not evidence either way');

  // not enough to judge
  assert.equal(filtersLookHonoured(query, withIds([9])), null, 'too few items to judge');
  assert.equal(filtersLookHonoured({ search_text: 'raf' }, withIds([9, 9, 9])), null,
    'without a brand filter there is nothing to verify');

  // the same check covers catalog_ids where the listing carries one
  const cat = (ids) => ids.map((catalog_id, id) => ({ id, catalog_id }));
  assert.equal(filtersLookHonoured({ catalog_ids: '2050' }, cat([2050, 2050, 2050])).ok, true);
  assert.equal(filtersLookHonoured({ catalog_ids: '2050' }, cat([2050, 76, 12])).ok, false);
});

/* ------------------------------ normalizing ----------------------------- */

const rawItem = (id) => ({
  id,
  title: `Raf Simons Tee ${id}`,
  brand_title: 'Raf Simons',
  size_title: 'M',
  status: 'Very good',
  price: { amount: '120.0', currency_code: 'EUR' },
  total_item_price: { amount: '133.50', currency_code: 'EUR' },
  photo: { url: `https://img/${id}.jpg`, high_resolution: { timestamp: 1700000000 } },
  user: { login: 'seller' },
  url: `https://www.vinted.de/items/${id}`,
});

test('normalizes object prices and renders a caption', () => {
  const item = normalizeItem(rawItem(1), 'www.vinted.de');
  assert.equal(item.price.amount, 120);
  const text = renderItem(item, 'Raf', 'ru');
  assert.match(text, /120 EUR/);
  assert.match(text, /с защитой 133.50 EUR/);
  assert.match(text, /Raf Simons/);
  // the same listing, another language
  assert.match(renderItem(item, 'Raf', 'de'), /133.50 EUR mit Käuferschutz/);
  assert.equal(itemKeyboard(item, 'de').inline_keyboard[0][0].text, 'URL');
});

/* --------------------------------- i18n --------------------------------- */

test('every locale carries exactly the same keys', () => {
  const reference = Object.keys(LOCALES.en).sort();
  for (const [code, dict] of Object.entries(LOCALES)) {
    assert.deepEqual(Object.keys(dict).sort(), reference, `locale ${code} drifted`);
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, 'string', `${code}.${key} is not a string`);
      assert.ok(value.length > 0, `${code}.${key} is empty`);
    }
  }
});

test('placeholders are the same in every translation of a key', () => {
  const holders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(LOCALES.en)) {
    const expected = holders(LOCALES.en[key]);
    for (const [code, dict] of Object.entries(LOCALES)) {
      assert.deepEqual(holders(dict[key]), expected, `${code}.${key} has different placeholders`);
    }
  }
});

test('t() interpolates, falls back to English and never prints a raw key', () => {
  assert.match(t('ru', 'add.created', { name: 'Raf', seconds: 60 }), /«Raf»/);
  assert.match(t('uk', 'plan.limit', { limit: 25 }), /25/);
  assert.equal(t('fr', 'item.button'), 'URL', 'an unknown language falls back to English');
  assert.equal(t('en', 'no.such.key'), 'no.such.key');
  // an unsupplied placeholder stays visible instead of rendering "undefined"
  assert.match(t('en', 'plan.limit', {}), /\{limit\}/);
});

test('menu buttons are matched in every language', () => {
  const labels = allLabels('btn.add');
  assert.equal(labels.length, Object.keys(LOCALES).length);
  assert.ok(labels.includes(LOCALES.de['btn.add']));
  assert.ok(labels.includes(LOCALES.ru['btn.add']));
});

test('the interface language is seeded from the Telegram locale', () => {
  assert.equal(resolveLang('de-DE'), 'de');
  assert.equal(resolveLang('uk'), 'uk');
  assert.equal(resolveLang('pt-BR'), 'en');
  assert.equal(resolveLang(undefined), 'en');
});

test('reads the svc-catalogue item shape (item_box, no flat brand/size)', () => {
  const item = normalizeItem(
    {
      id: 77,
      title: 'Raf Simons bomber',
      item_box: { first_line: 'Raf Simons', second_line: 'L', third_line: 'Good' },
      price: { amount: '240.0', currency_code: 'EUR' },
      total_item_price: { amount: '261.20', currency_code: 'EUR' },
      photo: { url: 'https://img/77.jpg', high_resolution: { timestamp: 1700000000 } },
      user: { login: 'seller77' },
      url: 'https://www.vinted.de/items/77',
    },
    'www.vinted.de',
  );
  assert.equal(item.brand, 'Raf Simons');
  assert.equal(item.size, 'L');
  assert.equal(item.condition, 'Good');
  assert.equal(item.price.amount, 240);
  assert.equal(item.totalPrice.amount, 261.2);
  assert.equal(item.photoUrl, 'https://img/77.jpg');
  assert.match(renderItem(item, 'Raf'), /240 EUR/);
});

test('flat fields still win over item_box when both are present', () => {
  const item = normalizeItem(
    { id: 78, title: 't', brand_title: 'Helmut Lang', size_title: 'M', item_box: { first_line: 'WRONG', second_line: 'XL' } },
    'www.vinted.de',
  );
  assert.equal(item.brand, 'Helmut Lang');
  assert.equal(item.size, 'M');
});

test('a listing with no id is dropped, a sparse one still renders', () => {
  assert.equal(normalizeItem({ title: 'no id' }, 'www.vinted.de'), null);
  const sparse = normalizeItem({ id: 79, title: 'bare' }, 'www.vinted.de');
  assert.equal(sparse.url, 'https://www.vinted.de/items/79');
  assert.doesNotThrow(() => renderItem(sparse, null));
});

test('escapes HTML in listing titles', () => {
  const item = normalizeItem({ ...rawItem(2), title: '<b>hack</b> & co' }, 'www.vinted.de');
  assert.match(renderItem(item, null), /&lt;b&gt;hack&lt;\/b&gt; &amp; co/);
});

/* ------------------------------- monitor -------------------------------- */

const parsed = parseSearchUrl('https://www.vinted.de/catalog?search_text=raf&price_to=300');
store.upsertUser(1, 'owner');
const mkSearch = (name, chatId, threadId) => {
  const info = store.insertSearch.run({
    user_id: 1, name, url: parsed.normalizedUrl, domain: parsed.domain,
    canonical_key: parsed.canonicalKey, api_query: JSON.stringify(parsed.query),
    dest_chat_id: chatId, dest_thread_id: threadId, next_run_at: 0, created_at: store.now(),
  });
  return store.getSearch.get(info.lastInsertRowid);
};

const sent = [];
const monitor = new Monitor({ enqueue: (j) => sent.push(j), get size() { return 0; } });
const items = (ids) => ids.map((id) => normalizeItem(rawItem(id), 'www.vinted.de'));

let s1 = mkSearch('Raf', -100, 7);

test('first poll only primes the baseline, sends nothing', () => {
  monitor.handleResult(s1, items([10, 11, 12]));
  assert.equal(sent.length, 0);
  s1 = store.getSearch.get(s1.id);
  assert.equal(s1.primed, 1);
  assert.equal(s1.last_item_id, 12);
});

test('second poll sends only genuinely new listings, oldest first', () => {
  monitor.handleResult(s1, items([14, 13, 12, 11]));
  assert.deepEqual(sent.map((j) => j.item.id), [13, 14]);
  assert.equal(sent[0].chatId, -100);
  assert.equal(sent[0].threadId, 7);
  assert.equal(sent[0].searchName, 'Raf');
  s1 = store.getSearch.get(s1.id);
});

test('re-polling the same page never re-sends', () => {
  sent.length = 0;
  monitor.handleResult(s1, items([14, 13, 12]));
  assert.equal(sent.length, 0);
});

test('a second search into the same topic does not duplicate the same item', () => {
  sent.length = 0;
  let s2 = mkSearch('Raf mirror', -100, 7);
  monitor.handleResult(s2, items([14, 13]));       // prime
  s2 = store.getSearch.get(s2.id);
  monitor.handleResult(s2, items([20, 14, 13]));   // 20 is new for s2
  assert.deepEqual(sent.map((j) => j.item.id), [20]);
  sent.length = 0;
  s1 = store.getSearch.get(s1.id);
  monitor.handleResult(s1, items([20, 14]));       // 20 already went to -100:7
  assert.equal(sent.length, 0, 'item 20 must not be delivered twice into the same topic');
});

test('a different topic of the same group still receives the item', () => {
  sent.length = 0;
  let s3 = mkSearch('Raf other topic', -100, 9);
  monitor.handleResult(s3, items([14]));           // prime
  s3 = store.getSearch.get(s3.id);
  monitor.handleResult(s3, items([21, 14]));
  assert.deepEqual(sent.map((j) => j.item.id), [21]);
  assert.equal(sent[0].threadId, 9);
});

test('identical searches share one canonical key', () => {
  assert.equal(store.stats().uniqueKeys, 1);
  assert.equal(store.stats().active, 3);
});

test('disabled monitoring removes searches from the due queue', () => {
  store.db.prepare('UPDATE searches SET next_run_at = 0').run();
  assert.ok(store.dueSearches.all(store.now(), 10).length > 0);
  store.setMonitoring.run(0, 1);
  assert.equal(store.dueSearches.all(store.now(), 10).length, 0);
  store.setMonitoring.run(1, 1);
});

test('plan expiry falls back to free', () => {
  store.setPlan.run('pro', store.now() - 10, 1);
  assert.equal(store.effectivePlan(store.getUser(1)), 'free');
  store.setPlan.run('pro', store.now() + 86400, 1);
  assert.equal(store.effectivePlan(store.getUser(1)), 'pro');
});

/* ------------------------ supergroup migration -------------------------- */

test('a group upgraded to a supergroup takes its searches with it', () => {
  const OLD = -900100;
  const NEW = -1009001000100;
  store.upsertChat.run({
    owner_id: 1, tg_chat_id: OLD, title: 'Vinted Monitor', type: 'group',
    is_forum: 0, created_at: store.now(),
  });
  const mk = (name) =>
    store.insertSearch.run({
      user_id: 1, name, url: parsed.normalizedUrl, domain: parsed.domain,
      canonical_key: parsed.canonicalKey, api_query: JSON.stringify(parsed.query),
      dest_chat_id: OLD, dest_thread_id: null, next_run_at: 0, created_at: store.now(),
    }).lastInsertRowid;
  const ids = [mk('Raf group'), mk('Helmut group')];

  const owners = store.chatOwners.all(OLD);
  assert.deepEqual(owners.map((o) => o.owner_id), [1], 'the owner must be found before the move');

  const moved = store.migrateChat(OLD, NEW);
  assert.equal(moved, 2, 'both searches move');
  for (const id of ids) assert.equal(store.getSearch.get(id).dest_chat_id, NEW);
  assert.equal(store.getChatByTgId.get(1, NEW).title, 'Vinted Monitor');
  assert.equal(store.getChatByTgId.get(1, OLD), undefined, 'the old chat row is gone');
  assert.equal(store.chatOwners.all(OLD).length, 0);

  // second delivery of the same service message must not break anything
  assert.equal(store.migrateChat(OLD, NEW), 0, 'migrating twice is a no-op');
  for (const id of ids) {
    assert.equal(store.getSearch.get(id).dest_chat_id, NEW);
    store.deleteSearch.run(id, 1);
  }
});

/* --------------------------- admin commands ----------------------------- */

const { createBot } = await import('../src/bot/index.js');

/** Drive a real command through the bot, capturing what it would have sent. */
async function runCommand(text, fromId, extra = {}) {
  const bot = createBot();
  const sent = [];
  bot.api.config.use(async (prev, method, payload) => {
    sent.push({ method, payload });
    return { ok: true, result: { message_id: 1, date: 0, chat: { id: fromId, type: 'private' } } };
  });
  bot.botInfo = { id: 111, is_bot: true, first_name: 'T', username: 'testbot', can_join_groups: true,
    can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false,
    has_main_web_app: false };
  await bot.handleUpdate({
    update_id: Math.floor(Math.random() * 1e6),
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: fromId, type: 'private' },
      from: { id: fromId, is_bot: false, first_name: 'A', username: 'admin', language_code: 'ru' },
      text,
      entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }],
      ...extra,
    },
  });
  return sent.filter((c) => c.method === 'sendMessage').map((c) => c.payload.text).join('\n');
}

await (async () => {
  // a user with a hostile display name: the report must not break on it
  store.upsertUser(4242, '<b>pwn</b>', 'de');
  const evil = store.insertSearch.run({
    user_id: 4242, name: 'Raf <script>', url: parsed.normalizedUrl, domain: parsed.domain,
    canonical_key: parsed.canonicalKey, api_query: JSON.stringify(parsed.query),
    dest_chat_id: 4242, dest_thread_id: null, next_run_at: 0, created_at: store.now(),
  }).lastInsertRowid;
  store.bumpSent.run(5, evil);

  const users = await runCommand('/users', 1);
  test('/users lists every account with its counters', () => {
    assert.match(users, /Пользователи: \d+/);
    assert.match(users, /<code>4242<\/code>/, 'the new account must appear');
    assert.match(users, /<code>1<\/code>/);
    assert.match(users, /ссылок \d+\/\d+/);
  });

  test('/users escapes user-controlled names', () => {
    assert.ok(!users.includes('<b>pwn</b>'), 'a raw tag would break the HTML parse');
    assert.match(users, /&lt;b&gt;pwn&lt;\/b&gt;/);
  });

  const info = await runCommand('/userinfo 4242', 1);
  test('/userinfo shows one account and its searches', () => {
    assert.match(info, /4242/);
    assert.match(info, /Raf &lt;script&gt;/, 'search names are escaped too');
    assert.match(info, /отправлено 5/);
    assert.match(info, /Тариф: Free/);
  });

  const noArg = await runCommand('/userinfo', 1);
  const unknown = await runCommand('/userinfo 999999', 1);
  test('/userinfo reports bad input instead of failing silently', () => {
    assert.match(noArg, /Использование/);
    assert.match(unknown, /не найден/);
  });

  const forStranger = await runCommand('/users', 777);
  test('admin commands stay silent for everyone else', () => {
    assert.equal(forStranger, '', 'a non-admin must get no reply at all');
  });

  store.deleteSearch.run(evil, 4242);
})();

console.log(failures ? `\n${failures} test(s) failed` : '\nall tests passed');
process.exit(failures ? 1 : 0);
