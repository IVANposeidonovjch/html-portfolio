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
const { renderItem, itemKeyboard, demoItem, DEMO_SEARCH } = await import('../src/bot/format.js');
const { helpText } = await import('../src/bot/help.js');
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
  assert.match(text, /📌 <b>Raf Simons Tee 1<\/b>/);
  assert.match(text, /💰 Цена : 120€/, 'ISO codes are shown as symbols');
  assert.match(text, /🏷 Бренд : Raf Simons/);
  assert.match(text, /📏 Размер : M/);
  assert.match(text, /#Raf$/m);
  assert.ok(!/защит|261|133/.test(text), 'the protection line is gone');
  assert.ok(!text.includes('seller'), 'and so is the seller line');
  assert.match(renderItem(item, 'Raf', 'de'), /💰 Preis : 120€/);
  assert.equal(itemKeyboard(item, 'de').inline_keyboard[0][0].text, 'URL');
});

test('a search name becomes a usable hashtag', () => {
  const withName = (name) => renderItem(normalizeItem(rawItem(9), 'www.vinted.de'), name, 'en');
  assert.match(withName('Avant mix'), /#Avantmix$/m, 'a tag stops at the first space');
  assert.match(withName('Raf 🔥'), /#Raf$/m, 'emoji cannot live in a tag');
  assert.match(withName('Helmut_Lang'), /#Helmut_Lang$/m, 'underscores survive');
  assert.match(withName('Сумки'), /#Сумки$/m, 'non-latin letters survive');
  assert.ok(!withName('🔥').includes('#'), 'a name with nothing taggable adds no empty tag');
});

test('the help example is exactly what the bot really sends', () => {
  // the example drifted from renderItem() once; this keeps them married
  for (const lang of Object.keys(LOCALES)) {
    const rendered = renderItem(demoItem(), DEMO_SEARCH, lang);
    assert.ok(
      helpText(lang, false).includes(rendered),
      `${lang}: help shows an alert the code no longer produces\n--- code ---\n${rendered}`,
    );
    assert.match(helpText(lang, false), /\[ URL \]/, `${lang}: the URL button is missing`);
  }
});

test('with a picture, help points at it instead of repeating it in text', () => {
  for (const lang of Object.keys(LOCALES)) {
    const withPicture = helpText(lang, true);
    const written = helpText(lang, false);
    assert.ok(!withPicture.includes('[ URL ]'), `${lang}: the text mockup is duplicated under the photo`);
    assert.ok(!withPicture.includes(renderItem(demoItem(), DEMO_SEARCH, lang)));
    assert.match(withPicture, /⬇️/, `${lang}: nothing points down at the photo`);
    assert.ok(
      withPicture.length < written.length,
      `${lang}: the picture version should be the shorter one`,
    );
    // everything that is not the example must survive both ways
    for (const marker of ['🧵', '🛡', '⚙️', '⌨️']) {
      assert.ok(withPicture.includes(marker), `${lang}: section ${marker} lost`);
      assert.ok(written.includes(marker), `${lang}: section ${marker} lost`);
    }
  }
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
  assert.match(renderItem(item, 'Raf'), /💰 Price : 240€/);
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

/* ---------------------------- inline menu ------------------------------- */

const { mainMenu, menuOnlyKb, helpKb } = await import('../src/bot/keyboards.js');

test('the menu is an inline keyboard, not a keyboard pinned to the chat', () => {
  const kb = mainMenu('ru', { monitoring: true });
  assert.ok(Array.isArray(kb.inline_keyboard), 'must be inline_keyboard');
  assert.equal(kb.keyboard, undefined, 'a reply keyboard would take over the input area');
  const buttons = kb.inline_keyboard.flat();
  assert.deepEqual(
    buttons.map((b) => b.callback_data),
    ['m:add', 'm:list', 'm:toggle', 'm:help'],
    'the front menu is four actions',
  );
  assert.equal(kb.inline_keyboard.length, 2, 'two rows of two — no scrolling');
  assert.ok(kb.inline_keyboard.every((row) => row.length === 2));
  assert.ok(buttons.every((b) => typeof b.callback_data === 'string'), 'every button carries an action');
});

test('plan, language and chats moved one level down, into help', () => {
  const front = mainMenu('ru', {}).inline_keyboard.flat().map((b) => b.callback_data);
  for (const moved of ['m:plan', 'm:lang', 'm:chats']) {
    assert.ok(!front.includes(moved), `${moved} must not be on the front menu`);
  }
  const help = helpKb('ru').inline_keyboard.flat().map((b) => b.callback_data);
  assert.deepEqual(help, ['m:plan', 'm:lang', 'm:chats', 'm:home'], 'and they must be reachable there');
});

test('the toggle button shows the current state', () => {
  const on = mainMenu('ru', { monitoring: true }).inline_keyboard.flat().find((b) => b.callback_data === 'm:toggle');
  const off = mainMenu('ru', { monitoring: false }).inline_keyboard.flat().find((b) => b.callback_data === 'm:toggle');
  assert.equal(on.text, LOCALES.ru['btn.toggleOn']);
  assert.equal(off.text, LOCALES.ru['btn.toggleOff']);
});

test('labels follow the language while the actions behind them never change', () => {
  const byLang = Object.keys(LOCALES).map((lang) => mainMenu(lang, {}).inline_keyboard.flat());
  const actions = byLang.map((buttons) => buttons.map((b) => b.callback_data));
  for (const set of actions) assert.deepEqual(set, actions[0], 'callback data must be language independent');
  // ...which is why a button pressed in an old message still works after a switch
  for (const [i, lang] of Object.keys(LOCALES).entries()) {
    assert.equal(byLang[i].find((b) => b.callback_data === 'm:add').text, LOCALES[lang]['btn.add']);
  }
});

test('every screen offers a way back to the menu', () => {
  const back = menuOnlyKb('de').inline_keyboard.flat();
  assert.equal(back.length, 1);
  assert.equal(back[0].callback_data, 'm:home');
  assert.equal(back[0].text, LOCALES.de['kb.menu']);
});

/* --------------------------- command menu ------------------------------- */

const { publishCommands, buildCommands, COMMAND_SETS } = await import('../src/bot/commands.js');

const fakeApi = () => {
  const calls = [];
  return {
    calls,
    setMyCommands: async (commands, options) => {
      calls.push({ commands, options });
      return true;
    },
  };
};

await (async () => {
  const api = fakeApi();
  const result = await publishCommands(api, { adminIds: [1], langOf: () => 'de' });

  test('the menu is published per language and per scope', () => {
    const langs = Object.keys(LOCALES);
    // default list + one per language, for private and group scopes, plus one admin
    assert.equal(api.calls.length, (langs.length + 1) * 2 + 1);
    assert.equal(result.failed.length, 0);

    const defaults = api.calls.filter((c) => !c.options.language_code);
    assert.equal(defaults.length, 3, 'default lists must exist for clients we do not translate');

    for (const lang of langs) {
      const forLang = api.calls.filter((c) => c.options.language_code === lang);
      assert.equal(forLang.length, 2, `language ${lang} needs a private and a group list`);
    }
  });

  test('the slash list is only what is worth typing', () => {
  assert.deepEqual(COMMAND_SETS.PRIVATE, ['start', 'add', 'help']);
  for (const retired of ['list', 'chats', 'pause', 'resume', 'plan', 'lang']) {
    assert.ok(!COMMAND_SETS.PRIVATE.includes(retired), `${retired} should not be advertised`);
  }
});

test('/bind is offered in groups and nowhere else', () => {
    for (const call of api.calls) {
      const names = call.commands.map((c) => c.command);
      if (call.options.scope.type === 'all_group_chats') {
        assert.deepEqual(names, COMMAND_SETS.GROUP);
      } else {
        assert.ok(!names.includes('bind'), 'a private menu must not advertise /bind');
      }
    }
  });

  test('the picture commands are invisible in every command list', () => {
  const everywhere = [...COMMAND_SETS.PRIVATE, ...COMMAND_SETS.GROUP, ...COMMAND_SETS.ADMIN];
  for (const hidden of ['setstartimage', 'sethelpimage']) {
    assert.ok(!everywhere.includes(hidden), `${hidden} must not be advertised anywhere`);
  }
  for (const call of api.calls) {
    const names = call.commands.map((c) => c.command);
    for (const hidden of ['setstartimage', 'sethelpimage']) {
      assert.ok(!names.includes(hidden), `${hidden} leaked into scope ${call.options.scope.type}`);
    }
  }
});

test('admin commands go only to the admin own chat, in their language', () => {
    const adminCall = api.calls.find((c) => c.options.scope.type === 'chat');
    assert.equal(adminCall.options.scope.chat_id, 1);
    for (const name of COMMAND_SETS.ADMIN) {
      assert.ok(adminCall.commands.some((c) => c.command === name), `${name} missing for the admin`);
    }
    assert.equal(
      adminCall.commands.find((c) => c.command === 'add').description,
      LOCALES.de['cmd.add'],
      'the admin menu follows the admin language',
    );
    // and no broadcast list carries them
    for (const call of api.calls.filter((c) => c.options.scope.type !== 'chat')) {
      const names = call.commands.map((c) => c.command);
      assert.ok(!names.some((n) => COMMAND_SETS.ADMIN.includes(n)), 'admin commands leaked into a public menu');
    }
  });

  test('every command has a real description in every language', () => {
    const all = [...COMMAND_SETS.PRIVATE, ...COMMAND_SETS.GROUP, ...COMMAND_SETS.ADMIN];
    for (const lang of Object.keys(LOCALES)) {
      for (const { command, description } of buildCommands(lang, all)) {
        assert.notEqual(description, `cmd.${command}`, `${lang}: ${command} has no translation`);
        assert.ok(description.length > 0 && description.length <= 256, `${lang}: ${command} bad length`);
        assert.match(command, /^[a-z0-9_]{1,32}$/, 'Telegram rejects other command names');
      }
    }
  });

  const broken = {
    setMyCommands: async (_c, o) => {
      if (o.scope.type === 'all_group_chats') throw new Error('nope');
      return true;
    },
  };
  const partial = await publishCommands(broken, { adminIds: [], langOf: () => 'en' });
  test('startup survives a menu call that fails', () => {
    assert.equal(partial.failed.length, 5, 'one group-scope failure per language plus the default');
    assert.ok(partial.published > 0, 'the lists that worked still count');
  });
})();

/* ------------------------------- pictures -------------------------------- */

const imagesModule = await import('../src/bot/images.js');
const fsMod = await import('node:fs');
const pathMod = await import('node:path');

await (async () => {
  const fakeApi = { getFile: async (id) => ({ file_id: id, file_path: `photos/${id}.jpg` }) };
  const pixels = Buffer.from('89504e470d0a1a0a', 'hex'); // a PNG header is enough

  const saved = await imagesModule.adoptPhoto(fakeApi, 'AgACfoo', 'help', {
    download: async (filePath) => {
      assert.equal(filePath, 'photos/AgACfoo.jpg', 'the path Telegram gave us is what we fetch');
      return pixels;
    },
  });

  test('a photo sent by the admin is downloaded into the data volume', () => {
    assert.ok(fsMod.existsSync(saved.path), 'the file must exist on disk');
    assert.equal(fsMod.readFileSync(saved.path).length, pixels.length);
    assert.match(saved.path, /data[\\/]images[\\/]help\.jpg$/);
    assert.equal(store.settings.get('help_image'), saved.path, 'and be remembered across restarts');
  });

  test('the stored picture is what /help will send', () => {
    const picture = imagesModule.imageFor('help');
    assert.ok(picture, 'imageFor must resolve it');
    assert.ok(imagesModule.hasImage('help'));
  });

  test('a stored picture that vanished falls back instead of breaking', () => {
    fsMod.rmSync(saved.path);
    assert.equal(imagesModule.imageFor('help'), null, 'no picture beats a broken one');
    assert.equal(store.settings.get('help_image'), saved.path, 'the setting is kept for diagnosis');
  });

  test('replacing a picture leaves no orphan of another extension', async () => {
    const dir = pathMod.dirname(saved.path);
    fsMod.mkdirSync(dir, { recursive: true });
    fsMod.writeFileSync(pathMod.join(dir, 'help.png'), pixels);
    const again = await imagesModule.adoptPhoto(fakeApi, 'AgACbar', 'help', {
      download: async () => pixels,
    });
    assert.ok(!fsMod.existsSync(pathMod.join(dir, 'help.png')), 'the old file must go');
    assert.ok(fsMod.existsSync(again.path));
  });

  test('clearing removes the file and the setting', () => {
    imagesModule.forgetImage('help');
    assert.equal(store.settings.get('help_image'), null);
    assert.equal(imagesModule.hasImage('help'), false);
  });
})();

/* --------------------------- admin commands ----------------------------- */

const { createBot } = await import('../src/bot/index.js');

/** Drive a real update through the bot, capturing every API call it makes. */
async function drive(update, fromId) {
  const bot = createBot();
  const calls = [];
  bot.api.config.use(async (prev, method, payload) => {
    calls.push({ method, payload });
    return { ok: true, result: { message_id: 1, date: 0, chat: { id: fromId, type: 'private' } } };
  });
  bot.botInfo = { id: 111, is_bot: true, first_name: 'T', username: 'testbot', can_join_groups: true,
    can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false,
    has_main_web_app: false };
  await bot.handleUpdate(update);
  return calls;
}

const from = (id) => ({ id, is_bot: false, first_name: 'A', username: 'admin', language_code: 'ru' });

const textUpdate = (text, fromId, entities) => ({
  update_id: Math.floor(Math.random() * 1e6),
  message: {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: { id: fromId, type: 'private' },
    from: from(fromId),
    text,
    ...(entities ? { entities } : {}),
  },
});

const pressUpdate = (data, fromId) => ({
  update_id: Math.floor(Math.random() * 1e6),
  callback_query: {
    id: String(Math.floor(Math.random() * 1e6)),
    from: from(fromId),
    chat_instance: '1',
    data,
    message: {
      message_id: 10,
      date: Math.floor(Date.now() / 1000),
      chat: { id: fromId, type: 'private' },
      text: 'menu',
    },
  },
});

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

/* ----------------------- inline menu, end to end ------------------------ */

await (async () => {
  const UID = 5150;
  store.upsertUser(UID, 'menuser', 'ru');

  const startUpdate = () => textUpdate('/start', UID, [{ type: 'bot_command', offset: 0, length: 6 }]);
  const start = await drive(startUpdate(), UID);
  test('/start sends the menu as inline buttons and no reply keyboard', () => {
    const msg = start.find((c) => c.method === 'sendMessage');
    assert.ok(msg, 'a message must be sent');
    assert.ok(msg.payload.reply_markup.inline_keyboard, 'menu must be inline');
    assert.equal(msg.payload.reply_markup.keyboard, undefined);
    assert.ok(!start.some((c) => c.payload?.reply_markup?.keyboard), 'nothing may pin a keyboard');
  });

  test('/start leads with the welcome, not with the bare menu title', () => {
    const msg = start.find((c) => c.method === 'sendMessage');
    assert.equal(msg.payload.text, LOCALES.ru['start.text']);
    assert.match(msg.payload.text, /Vinted Monitor/);
    assert.equal(msg.payload.parse_mode, 'HTML');
  });

  test('the welcome and help fit what Telegram accepts', () => {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      // /start may travel as a photo caption, capped at 1024 characters
      assert.ok(dict['start.text'].length <= 1024, `${lang}: start.text too long for a caption`);
      for (const variant of [helpText(lang, false), helpText(lang, true)]) {
        assert.ok(variant.length <= 4096, `${lang}: help exceeds a message`);
        assert.ok(!variant.includes('{example}'), `${lang}: the placeholder was left unfilled`);
        // the tags we use must be the ones Telegram's HTML mode knows
        const tags = [...variant.matchAll(/<\/?([a-z]+)/g)].map((m) => m[1]);
        for (const tag of new Set(tags)) {
          assert.ok(['b', 'i', 'u', 's', 'code', 'pre', 'a'].includes(tag), `${lang}: <${tag}> is not allowed`);
        }
      }
    }
  });

  test('help reads as sections, not a paragraph dump', () => {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      const headers = helpText(lang, false).split('\n').filter((l) => /^[^\w\s].*<b>/.test(l));
      assert.ok(headers.length >= 4, `${lang}: only ${headers.length} emoji section headers`);
      assert.match(helpText(lang, false), /\[ URL \]/, `${lang}: the example alert is missing`);
    }
  });

  const { config: liveConfig } = await import('../src/config.js');
  liveConfig.startImage = 'https://example.com/banner.png';
  const photoStart = await drive(startUpdate(), UID);
  liveConfig.startImage = '';
  test('with START_IMAGE set, the welcome is a photo carrying the menu', () => {
    const photo = photoStart.find((c) => c.method === 'sendPhoto');
    assert.ok(photo, 'sendPhoto must be used when an image is configured');
    assert.equal(photo.payload.photo, 'https://example.com/banner.png');
    assert.equal(photo.payload.caption, LOCALES.ru['start.text']);
    assert.ok(photo.payload.reply_markup.inline_keyboard, 'the menu rides along under the picture');
    assert.ok(!photoStart.some((c) => c.method === 'sendMessage'), 'and no duplicate text message');
  });

  test('without START_IMAGE nothing tries to send a picture', () => {
    assert.ok(!start.some((c) => c.method === 'sendPhoto'));
  });

  // Navigating away from a photo welcome: a photo has no text to edit, and
  // Telegram says so — the menu has to rewrite the caption instead.
  const onPhoto = await (async () => {
    const bot = createBot();
    const calls = [];
    bot.api.config.use(async (prev, method, payload) => {
      calls.push({ method, payload });
      if (method === 'editMessageText') {
        return { ok: false, error_code: 400, description: 'Bad Request: there is no text in the message to edit' };
      }
      return { ok: true, result: { message_id: 10, date: 0, chat: { id: UID, type: 'private' } } };
    });
    bot.botInfo = { id: 111, is_bot: true, first_name: 'T', username: 'testbot', can_join_groups: true,
      can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false,
      has_main_web_app: false };
    await bot.handleUpdate(pressUpdate('m:home', UID));
    return calls;
  })();

  test('the menu survives being attached to a photo', () => {
    assert.ok(onPhoto.some((c) => c.method === 'editMessageText'), 'it tries text first');
    const caption = onPhoto.find((c) => c.method === 'editMessageCaption');
    assert.ok(caption, 'and falls back to the caption rather than throwing');
    assert.ok(caption.payload.reply_markup.inline_keyboard, 'the buttons come along');
  });

  const pressed = await drive(pressUpdate('m:toggle', UID), UID);
  test('pressing a menu button edits that message instead of sending a new one', () => {
    assert.ok(pressed.some((c) => c.method === 'answerCallbackQuery'), 'the tap must be acknowledged');
    assert.ok(pressed.some((c) => c.method === 'editMessageText'), 'the menu is redrawn in place');
    assert.ok(!pressed.some((c) => c.method === 'sendMessage'), 'no new message may be posted');
    assert.equal(store.getUser(UID).monitoring_enabled, 0, 'and the toggle actually toggled');
  });

  const back = await drive(pressUpdate('m:home', UID), UID);
  test('the redrawn menu reflects the new state', () => {
    const edit = back.find((c) => c.method === 'editMessageText');
    const toggle = edit.payload.reply_markup.inline_keyboard.flat().find((b) => b.callback_data === 'm:toggle');
    assert.equal(toggle.text, LOCALES.ru['btn.toggleOff'], 'monitoring is off, the button must say so');
  });
  store.setMonitoring.run(1, UID);

  const helpPressed = await drive(pressUpdate('m:help', UID), UID);
  test('help is the second level, not a dead end', () => {
    const edit = helpPressed.find((c) => c.method === 'editMessageText');
    assert.ok(edit, 'help replaces the menu message');
    assert.deepEqual(
      edit.payload.reply_markup.inline_keyboard.flat().map((b) => b.callback_data),
      ['m:plan', 'm:lang', 'm:chats', 'm:home'],
    );
  });

  const typedList = await drive(
    textUpdate('/list', UID, [{ type: 'bot_command', offset: 0, length: 5 }]),
    UID,
  );
  test('a command dropped from the slash list still answers when typed', () => {
    assert.ok(
      typedList.some((c) => c.method === 'sendMessage'),
      '/list is no longer advertised, but anyone who learned it keeps it',
    );
  });

  // the language-mismatch bug: the pinned keyboard kept the old labels until
  // something re-sent it, so the menu could sit in a language the user had left
  const switched = await drive(pressUpdate('lang:de', UID), UID);
  test('switching language redraws the menu in that language immediately', () => {
    const edit = switched.find((c) => c.method === 'editMessageText');
    assert.ok(edit, 'the same message is rewritten, no second menu is posted');
    assert.ok(!switched.some((c) => c.method === 'sendMessage'), 'and nothing extra is sent');
    const labels = edit.payload.reply_markup.inline_keyboard.flat().map((b) => b.text);
    assert.ok(labels.includes(LOCALES.de['btn.add']), `menu still not German: ${labels.join('|')}`);
    assert.ok(!labels.includes(LOCALES.ru['btn.add']), 'no Russian label may survive the switch');
    assert.equal(store.getUser(UID).lang, 'de');
  });

  const afterSwitch = await drive(pressUpdate('m:list', UID), UID);
  test('screens opened after the switch are German too', () => {
    const edit = afterSwitch.find((c) => c.method === 'editMessageText');
    const back = edit.payload.reply_markup.inline_keyboard.flat().at(-1);
    assert.equal(back.text, LOCALES.de['kb.menu']);
  });
  store.setLang.run('ru', UID);

  // /help with a picture configured: the example becomes a real-looking alert
  const demoPath = pathMod.join(pathMod.dirname(pathMod.resolve(process.env.DB_PATH)), 'images', 'help.jpg');
  fsMod.mkdirSync(pathMod.dirname(demoPath), { recursive: true });
  fsMod.writeFileSync(demoPath, Buffer.from('89504e470d0a1a0a', 'hex'));
  store.settings.set('help_image', demoPath);
  const helpWithPhoto = await drive(pressUpdate('m:help', UID), UID);
  store.settings.clear('help_image');
  fsMod.rmSync(demoPath, { force: true });

  test('help shows the example as an actual photo when one is set', () => {
    const photo = helpWithPhoto.find((c) => c.method === 'sendPhoto');
    assert.ok(photo, 'the sample alert must be a photo message');
    assert.equal(
      photo.payload.caption,
      renderItem(demoItem(), DEMO_SEARCH, 'ru'),
      'the caption must be produced by renderItem, not written by hand',
    );
    assert.equal(photo.payload.reply_markup.inline_keyboard[0][0].text, 'URL');
    const edit = helpWithPhoto.find((c) => c.method === 'editMessageText');
    assert.ok(edit, 'and the help text itself is still shown');
    assert.equal(edit.payload.text, helpText('ru', true), 'in its pointer form, not the mockup');
    assert.ok(!edit.payload.text.includes('[ URL ]'), 'the example must not be told twice');
  });

  const helpNoPhoto = await drive(pressUpdate('m:help', UID), UID);
  test('without a picture help keeps the written example', () => {
    assert.ok(!helpNoPhoto.some((c) => c.method === 'sendPhoto'));
    const edit = helpNoPhoto.find((c) => c.method === 'editMessageText');
    assert.equal(edit.payload.text, helpText('ru', false));
    assert.match(edit.payload.text, /\[ URL \]/, 'the mockup is the fallback and must stay');
  });

  const typedLabel = await drive(textUpdate(LOCALES.ru['btn.add'], UID), UID);
  test('the old button captions are just text now, they start nothing', () => {
    const reply = typedLabel.find((c) => c.method === 'sendMessage');
    assert.match(reply.payload.text, /Не понял/, 'typing the old label must not open the add flow');
    assert.ok(!reply.payload.text.includes('vinted.de/catalog'), 'the URL prompt must not appear');
  });

  // a user carried over from the reply-keyboard era
  store.db.prepare('UPDATE users SET kb_cleared = 0 WHERE tg_id = ?').run(UID);
  const firstTouch = await drive(pressUpdate('m:home', UID), UID);
  test('the old pinned keyboard is taken away once, from users who had it', () => {
    const removal = firstTouch.find((c) => c.payload?.reply_markup?.remove_keyboard);
    assert.ok(removal, 'the client keeps showing the old keyboard until a message removes it');
    assert.equal(removal.payload.text, LOCALES.ru['menu.removed']);
    assert.equal(store.getUser(UID).kb_cleared, 1);
  });

  const secondTouch = await drive(pressUpdate('m:home', UID), UID);
  test('and never again after that', () => {
    assert.ok(!secondTouch.some((c) => c.payload?.reply_markup?.remove_keyboard));
  });

  test('a brand new user is never told about a keyboard they never had', () => {
    store.upsertUser(5151, 'fresh', 'en');
    assert.equal(store.getUser(5151).kb_cleared, 1);
  });
})();

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

  const askStart = await runCommand('/setstartimage', 1);
  test('a picture command asks for the photo and waits for it', () => {
    assert.match(askStart, /\/setstartimage clear/, 'it says how to remove one too');
  });

  const strangerImage = await runCommand('/sethelpimage', 777);
  test('the picture commands ignore everyone but admins', () => {
    assert.equal(strangerImage, '', 'a non-admin gets no reply at all');
  });

  // the command arms a one-shot listener: the next photo from that admin is the picture
  await runCommand('/sethelpimage', 1);
  const photoUpdate = {
    update_id: Math.floor(Math.random() * 1e6),
    message: {
      message_id: 2,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 1, type: 'private' },
      from: { id: 1, is_bot: false, first_name: 'A', username: 'admin', language_code: 'ru' },
      photo: [
        { file_id: 'small', file_unique_id: 's', width: 90, height: 90 },
        { file_id: 'biggest', file_unique_id: 'b', width: 1280, height: 1280 },
      ],
    },
  };
  const afterPhoto = await drive(photoUpdate, 1);
  test('the photo sent after the command is picked up, at full size', () => {
    const getFile = afterPhoto.find((c) => c.method === 'getFile');
    assert.ok(getFile, 'the bot must fetch the file it was just sent');
    assert.equal(getFile.payload.file_id, 'biggest', 'Telegram lists sizes small first — take the last');
  });

  const strayPhoto = await drive({ ...photoUpdate, update_id: photoUpdate.update_id + 1 }, 1);
  test('a later photo is not swallowed as a picture update', () => {
    assert.ok(!strayPhoto.some((c) => c.method === 'getFile'), 'the listener is one-shot');
  });

  const forStranger = await runCommand('/users', 777);
  test('admin commands stay silent for everyone else', () => {
    assert.equal(forStranger, '', 'a non-admin must get no reply at all');
  });

  store.deleteSearch.run(evil, 4242);
})();

console.log(failures ? `\n${failures} test(s) failed` : '\nall tests passed');
process.exit(failures ? 1 : 0);
