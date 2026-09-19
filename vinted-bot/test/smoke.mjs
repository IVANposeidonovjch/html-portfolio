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
const { helpText, helpParts } = await import('../src/bot/help.js');
const cfg = await import('../src/config.js');
const { LOCALES, allLabels, formatEvery, resolveLang, t } = await import('../src/i18n/index.js');
const { STRATEGIES, extractItems, strategyByName, orderedStrategies, filtersLookHonoured } =
  await import('../src/vinted/endpoints.js');
const { candidatesFor, endpointCache } = await import('../src/vinted/client.js');
const { normalizeItem } = await import('../src/vinted/normalize.js');

let failures = 0;
const pending = [];
const fail = (name, e) => {
  failures++;
  console.log(`FAIL  ${name}\n      ${e.message}`);
};

/**
 * An async callback used to be fired and forgotten: its assertions never
 * reported, and its side effects landed in the middle of a later test. Now the
 * promise is collected and awaited before the summary.
 */
const test = (name, fn) => {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      pending.push(result.then(() => console.log(`  ok  ${name}`), (e) => fail(name, e)));
      return;
    }
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail(name, e);
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
    for (const marker of ['🔎', '🧵', '⌨️']) {
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

test('the burst-free tier row is the normal row minus the burst clause', () => {
  for (const [code, dict] of Object.entries(LOCALES)) {
    assert.ok(!dict['plan.tierRowNoBurst'].includes('{burst}'), `${code}: it still prints a burst`);
    // the burst clause is the last thing on the row in every language, so the
    // short version has to be a prefix of the long one — that is what keeps the
    // two from drifting into differently-worded rows in the same table
    assert.ok(
      dict['plan.tierRow'].startsWith(dict['plan.tierRowNoBurst']),
      `${code}: the two rows would not read as one table\n  ${dict['plan.tierRow']}\n  ${dict['plan.tierRowNoBurst']}`,
    );
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
// every account starts on the floor now, and the floor is polled for nothing —
// the monitor fixtures need an account that actually holds a plan
store.setPlan.run('pro', store.now() + 86400, 1);
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
  assert.ok(store.dueSearches.all(store.now(), store.now(), 10).length > 0);
  store.setMonitoring.run(0, 1);
  assert.equal(store.dueSearches.all(store.now(), store.now(), 10).length, 0);
  store.setMonitoring.run(1, 1);
});

test('plan expiry falls back to the floor', () => {
  store.setPlan.run('pro', store.now() - 10, 1);
  assert.equal(store.effectivePlan(store.getUser(1)), 'locked');
  store.setPlan.run('pro', store.now() + 86400, 1);
  assert.equal(store.effectivePlan(store.getUser(1)), 'pro');
});

/* --------------------------- tier welcome copy --------------------------- */

test('each tier welcome opens with its own glyph on its own line', () => {
  const glyphs = new Set();
  for (const lang of Object.keys(LOCALES)) {
    for (const tier of ['basic', 'pro', 'turbo', 'elite_max']) {
      const lines = LOCALES[lang][`tier.welcome.${tier}`].split('\n');
      assert.ok(lines[0].trim().length, `${lang}/${tier}: no glyph line`);
      assert.ok(!/[a-zA-Zа-яА-ЯёЁ]/.test(lines[0]), `${lang}/${tier}: the glyph line carries words`);
      assert.equal(lines[1], '', `${lang}/${tier}: the glyph needs a blank line under it`);
      assert.ok(lines.slice(2).join('').trim().length, `${lang}/${tier}: nothing below the glyph`);
      if (lang === 'en') glyphs.add(lines[0]);
    }
  }
  assert.equal(glyphs.size, 4, 'every tier needs its own glyph, not a shared one');
});

test('a long interval is abbreviated to minutes, a short one stays in seconds', () => {
  for (const lang of Object.keys(LOCALES)) {
    assert.equal(formatEvery(lang, 300), '5m', `${lang}: minutes read the same everywhere`);
    assert.equal(formatEvery(lang, 120), '2m', `${lang}: no plural form to get wrong`);
    assert.equal(formatEvery(lang, 900), '15m');
    // the tier every user starts paying for is the one that must not say "300"
    assert.equal(formatEvery(lang, cfg.intervalFor('basic')), '5m');
  }
  assert.equal(formatEvery('ru', 60), '60 с', 'a single minute still reads as seconds');
  assert.equal(formatEvery('en', 30), '30s');
  assert.equal(formatEvery('ru', 90), '90 с', 'a ragged interval is not rounded into minutes');
});

test('the welcome speaks in numbers the config really holds', () => {
  for (const lang of Object.keys(LOCALES)) {
    for (const tier of ['basic', 'pro', 'turbo', 'elite_max']) {
      const text = t(lang, `tier.welcome.${tier}`, {
        links: cfg.searchLimitFor(tier),
        every: formatEvery(lang, cfg.intervalFor(tier)),
        burst: cfg.burstFor(tier),
      });
      assert.ok(!/\{\w+\}/.test(text), `${lang}/${tier}: an unfilled placeholder would reach a paying user`);
      assert.ok(text.includes(String(cfg.searchLimitFor(tier))), `${lang}/${tier}: link count missing`);
      assert.ok(text.includes(formatEvery(lang, cfg.intervalFor(tier))), `${lang}/${tier}: interval missing`);
      // it may travel as a photo caption, which stops at 1024
      assert.ok(text.length <= 1024, `${lang}/${tier}: too long for a caption (${text.length})`);
      for (const tag of new Set([...text.matchAll(/<\/?([a-z]+)/g)].map((m) => m[1]))) {
        assert.ok(['b', 'i', 'u', 's', 'code', 'a'].includes(tag), `${lang}/${tier}: <${tag}> not allowed`);
      }
    }
  }
});

test('each welcome names the tier it congratulates', () => {
  for (const lang of Object.keys(LOCALES)) {
    for (const tier of ['basic', 'pro', 'turbo', 'elite_max']) {
      const name = LOCALES[lang][`plan.name.${tier}`].replace(/\s*🔒/, '');
      // the copy is written by hand and may lowercase a rank mid-sentence
      assert.ok(
        LOCALES[lang][`tier.welcome.${tier}`].toLowerCase().includes(name.toLowerCase()),
        `${lang}/${tier}: the copy never says which tier this is`,
      );
    }
  }
});

/* --------------------------- next-tier pitch ----------------------------- */

test('every public tier but the top one is told what the next one buys', () => {
  const pitchFor = (plan) => {
    const idx = cfg.PUBLIC_PLANS.indexOf(plan);
    return cfg.PUBLIC_PLANS[idx + 1];
  };
  for (const plan of cfg.PUBLIC_PLANS.slice(0, -1)) {
    assert.ok(pitchFor(plan), `${plan} must have somewhere to go`);
  }
  assert.equal(pitchFor(cfg.PUBLIC_PLANS.at(-1)), undefined, 'the top tier has no upsell');
});

test('the ratios are the real ones, and a clause only appears when it differs', () => {
  assert.equal(cfg.intervalFor('basic') / cfg.intervalFor('pro'), 5, 'Hunter to Ranger really is 5x');
  assert.equal(cfg.searchLimitFor('pro') / cfg.searchLimitFor('basic'), 4);
  assert.equal(cfg.usdFor('pro') - cfg.usdFor('basic'), 10);
});

test('the top tier is paid for in speed, not only in links and burst', () => {
  // it used to share Ranger's interval, which made $60 of the price buy
  // nothing a user could feel
  assert.ok(
    cfg.intervalFor('turbo') < cfg.intervalFor('pro'),
    `Sniper Elite polls every ${cfg.intervalFor('turbo')}s, same as Ranger — the upsell would be a lie`,
  );
  assert.ok(cfg.usdFor('turbo') > cfg.usdFor('pro'), 'and it costs more than the tier below it');
});

/* ------------------------------ add-on ----------------------------------- */

test('bought links stack on the plan and die with it', () => {
  store.upsertUser(8100, 'addon', 'en');
  store.setPlan.run('basic', store.now() + 86400, 8100);
  store.addExtraLinks.run(10, 8100);
  const paid = store.getUser(8100);
  assert.equal(paid.extra_links, 10);
  assert.equal(
    cfg.searchLimitFor(store.effectivePlan(paid)) + paid.extra_links,
    cfg.searchLimitFor('basic') + 10,
  );

  // the plan lapses: the add-on it was sold on top of goes with it
  store.setPlan.run('basic', store.now() - 10, 8100);
  const lapsed = store.getUser(8100);
  assert.equal(store.effectivePlan(lapsed), 'locked');
  assert.equal(lapsed.plan, 'locked', 'the row itself is retired, not just read as lapsed');
  assert.equal(lapsed.extra_links, 0, 'extra links cannot outlive the plan that carried them');
});

/* ----------------------------- near-miss note ---------------------------- */

await (async () => {
  const seen = [];
  const fomoMonitor = new Monitor({ enqueue: (j) => seen.push(j), get size() { return 0; } });
  const oldItem = (id) => ({ ...normalizeItem(rawItem(id), 'www.vinted.de'), uploadedAt: store.now() - 120 });

  const mkFor = (uid, name) => {
    const info = store.insertSearch.run({
      user_id: uid, name, url: parsed.normalizedUrl, domain: parsed.domain,
      canonical_key: parsed.canonicalKey, api_query: JSON.stringify(parsed.query),
      dest_chat_id: uid, dest_thread_id: null, next_run_at: 0, created_at: store.now(),
    });
    const search = store.getSearch.get(info.lastInsertRowid);
    fomoMonitor.handleResult(search, [oldItem(500)]); // prime
    return store.getSearch.get(search.id);
  };

  store.upsertUser(8200, 'slow', 'en');
  store.setPlan.run('basic', store.now() + 86400, 8200);
  const slow = mkFor(8200, 'Slow');
  seen.length = 0;
  fomoMonitor.handleResult(slow, [oldItem(501), oldItem(502)]);

  test('a slower plan is told what the delay cost, once', () => {
    assert.equal(seen.length, 2, 'both listings are still delivered');
    assert.match(seen[0].note ?? '', /Sniper Elite/, 'the first carries the note');
    assert.equal(seen[1].note, null, 'the second does not repeat it');
    assert.match(seen[0].note, /1\d\ds/, 'and it names the real age of the listing');
  });

  seen.length = 0;
  fomoMonitor.handleResult(store.getSearch.get(slow.id), [oldItem(503)]);
  test('and not again the same day', () => {
    assert.equal(seen.length, 1);
    assert.equal(seen[0].note, null, 'the daily throttle holds across polls');
  });

  store.upsertUser(8300, 'fast', 'en');
  store.setPlan.run('turbo', store.now() + 86400, 8300);
  const fast = mkFor(8300, 'Fast');
  seen.length = 0;
  fomoMonitor.handleResult(fast, [oldItem(504)]);
  test('the tiers that are already instant are never nudged', () => {
    assert.equal(seen.length, 1);
    assert.equal(seen[0].note, null, 'telling Sniper Elite it was late would be a lie');
  });

  store.setPlan.run('elite_max', store.now() + 86400, 8300);
  seen.length = 0;
  fomoMonitor.handleResult(store.getSearch.get(fast.id), [oldItem(505)]);
  test('nor is the reserved tier', () => {
    assert.equal(seen[0].note, null);
  });

  // a fresh listing is not a near miss at all
  store.markFomoNudge.run(0, 8200);
  seen.length = 0;
  const fresh = { ...normalizeItem(rawItem(600), 'www.vinted.de'), uploadedAt: store.now() };
  fomoMonitor.handleResult(store.getSearch.get(slow.id), [fresh]);
  test('a listing caught immediately carries no note', () => {
    assert.equal(seen[0].note, null, 'nothing was missed, so there is nothing to say');
  });
})();

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
    ['m:add', 'm:list', 'm:toggle', 'm:plan', 'm:help'],
    'four things a user does, and Help under them',
  );
  assert.equal(kb.inline_keyboard.length, 3, 'a 2x2 grid with one button beneath it');
  assert.deepEqual(kb.inline_keyboard.map((row) => row.length), [2, 2, 1]);
  assert.ok(buttons.every((b) => typeof b.callback_data === 'string'), 'every button carries an action');
});

test('what someone pays for is on the front menu, not behind Help', () => {
  const front = mainMenu('ru', {}).inline_keyboard.flat().map((b) => b.callback_data);
  assert.ok(front.includes('m:plan'), 'Plan is one of the four');
  assert.equal(front.at(-1), 'm:help', 'and Help is the one below them');
  for (const stillBehindHelp of ['m:lang', 'm:chats']) {
    assert.ok(!front.includes(stillBehindHelp), `${stillBehindHelp} is set once and forgotten`);
  }
  const help = helpKb('ru').inline_keyboard.flat().map((b) => b.callback_data);
  assert.deepEqual(help, ['m:lang', 'm:chats', 'm:home'], 'and they must be reachable there');
  assert.ok(!help.includes('m:plan'), 'Plan graduated, it must not be in two places');
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

/* ---------------------------- plan tiers --------------------------------- */

/* --------------------- the floor and the Scout trial --------------------- */

test('Scout is sold by the week, everything above it by the month', () => {
  assert.ok(cfg.SELLABLE_PLANS.includes('free'), 'the way in is a purchase now');
  assert.ok(cfg.starsFor('free') > 0, 'and it has a price');
  assert.equal(cfg.planDurationSec('free'), cfg.config.payments.trialHours * 3600);
  assert.equal(cfg.planDurationSec('basic'), cfg.config.payments.planDays * 86400);
  assert.equal(cfg.planDurationSec('free'), 7 * 86400, 'the way in is a week');
  assert.deepEqual(cfg.trialWindow(), { kind: 'week', n: 1 });

  // the window is still a setting, and what the screens call it follows it
  const was = cfg.config.payments.trialHours;
  try {
    cfg.config.payments.trialHours = 72;
    assert.deepEqual(cfg.trialWindow(), { kind: 'days', n: 3 });
    cfg.config.payments.trialHours = 36;
    assert.deepEqual(cfg.trialWindow(), { kind: 'hours', n: 36 }, 'a ragged window stays in hours');
  } finally {
    cfg.config.payments.trialHours = was;
  }
  assert.ok(
    cfg.planDurationSec('free') < cfg.planDurationSec('basic'),
    'a trial that outlasts a month is not a trial',
  );
});

test('the floor is a real plan that grants nothing and is never sold', () => {
  assert.ok(cfg.PLANS.includes('locked'));
  assert.ok(cfg.isLocked('locked'));
  assert.ok(!cfg.SELLABLE_PLANS.includes('locked'), 'nobody buys their way into holding nothing');
  assert.ok(!cfg.PUBLIC_PLANS.includes('locked'), 'and it is not a row in the comparison');
  assert.equal(cfg.searchLimitFor('locked'), 0);
  assert.equal(cfg.starsFor('locked'), 0);
  // it exists in its own right rather than falling through to a tier it is not
  assert.notEqual(cfg.config.limits.locked, undefined, 'the floor needs its own limit, not free\'s');
});

test('a brand new account lands on the floor, not on a tier', () => {
  const fresh = store.upsertUser(7500, 'newcomer', 'en');
  assert.equal(fresh.plan, 'locked', 'signing up is not a purchase');
  assert.equal(store.effectivePlan(fresh), 'locked');
  assert.equal(fresh.plan_until, null, 'the floor does not expire, there is nothing to expire');
});

test('a trial that ran out is the floor again, lazily, on read', () => {
  store.upsertUser(7501, 'trialist', 'en');
  store.setPlan.run('free', store.now() + 3600, 7501);
  assert.equal(store.effectivePlan(store.getUser(7501)), 'free', 'while it runs it is Scout');

  store.setPlan.run('free', store.now() - 1, 7501);
  const after = store.getUser(7501);
  assert.equal(store.effectivePlan(after), 'locked');
  assert.equal(after.plan, 'locked', 'the row is retired on read, like every other plan');
});

test('the floor and a lapsed plan are both polled for nothing', () => {
  const mk = (uid) =>
    store.insertSearch.run({
      user_id: uid, name: 'floor', url: parsed.normalizedUrl, domain: parsed.domain,
      canonical_key: parsed.canonicalKey, api_query: JSON.stringify(parsed.query),
      dest_chat_id: uid, dest_thread_id: null, next_run_at: 0, created_at: store.now(),
    }).lastInsertRowid;

  store.upsertUser(7502, 'onfloor', 'en');
  const onFloor = mk(7502);
  const due = () => store.dueSearches.all(store.now(), store.now(), 100).map((s) => s.id);
  assert.ok(!due().includes(onFloor), 'an account holding nothing costs the pool nothing');

  // buying a plan starts it again by itself, with no other bookkeeping
  store.setPlan.run('basic', store.now() + 86400, 7502);
  assert.ok(due().includes(onFloor), 'and a purchase puts it straight back in the queue');

  // and the clock running out takes it out again, without anyone opening the bot
  store.setPlan.run('basic', store.now() - 1, 7502);
  assert.ok(!due().includes(onFloor), 'expiry stops the polling, not just the next /plan screen');
  store.deleteSearch.run(onFloor, 7502);
});

test('the reserved tier exists, is hidden, and has no price', () => {
  assert.ok(cfg.PLANS.includes('elite_max'));
  assert.ok(cfg.isHiddenPlan('elite_max'), 'it must not appear in the public comparison');
  assert.ok(!cfg.SELLABLE_PLANS.includes('elite_max'), 'and never be purchasable');
  assert.equal(cfg.starsFor('elite_max'), 0, 'there is no price for it');
  assert.equal(cfg.usdFor('elite_max'), 0);
});

test('Sniper Elite is a normal public tier now', () => {
  assert.ok(cfg.SELLABLE_PLANS.includes('turbo'), 'it is on sale');
  assert.ok(!cfg.isHiddenPlan('turbo'), 'and listed publicly');
  assert.deepEqual(cfg.PUBLIC_PLANS, ['free', 'basic', 'pro', 'turbo']);
  assert.ok(cfg.usdFor('turbo') > cfg.usdFor('pro'), 'priced above the tier below it');
});

test('the reserved tier outruns everything on sale', () => {
  for (const sold of cfg.PUBLIC_PLANS) {
    assert.ok(cfg.burstFor('elite_max') >= cfg.burstFor(sold), `burst must beat ${sold}`);
    assert.ok(cfg.intervalFor('elite_max') <= cfg.intervalFor(sold), `polling must beat ${sold}`);
    assert.ok(cfg.searchLimitFor('elite_max') >= cfg.searchLimitFor(sold), `links must beat ${sold}`);
  }
});

test('paid speed rises with the tier, free and basic get no advantage', () => {
  assert.equal(cfg.burstFor('free'), cfg.burstFor('basic'), 'the cheap tier buys no delivery speed');
  assert.ok(cfg.burstFor('pro') > cfg.burstFor('basic'), 'the top public tier must be faster');
  assert.ok(cfg.burstFor('turbo') > cfg.burstFor('pro'), 'and the hidden one faster still');
});

test('every plan has its own polling and limits, none falls back to free', () => {
  // intervalFor() lands on free for an unknown plan, which would quietly make a
  // paid tier the slowest of all
  for (const plan of cfg.PLANS.filter((p) => p !== 'free' && p !== 'locked')) {
    assert.ok(cfg.intervalFor(plan) <= cfg.intervalFor('free'), `${plan} polls slower than free`);
    assert.ok(cfg.searchLimitFor(plan) > cfg.searchLimitFor('free'), `${plan} has free's link limit`);
  }
  // and the ladder never goes backwards
  for (const [i, plan] of cfg.PLANS.entries()) {
    if (i === 0) continue;
    const below = cfg.PLANS[i - 1];
    assert.ok(cfg.intervalFor(plan) <= cfg.intervalFor(below), `${plan} polls slower than ${below}`);
    assert.ok(cfg.burstFor(plan) >= cfg.burstFor(below), `${plan} delivers slower than ${below}`);
    assert.ok(cfg.searchLimitFor(plan) >= cfg.searchLimitFor(below), `${plan} allows fewer links than ${below}`);
  }
});

test('an unknown plan still lands on free, not on undefined', () => {
  assert.equal(cfg.intervalFor('nonsense'), cfg.intervalFor('free'));
  assert.equal(cfg.searchLimitFor('nonsense'), cfg.searchLimitFor('free'));
  assert.equal(cfg.burstFor('nonsense'), cfg.config.telegram.burst);
});

/* ---------------------------- proxy capacity ----------------------------- */

const capacity = await import('../src/monitor/capacity.js');

test('each proxy carries its own safe rate, not one shared constant', () => {
  const { proxies, proxyRps } = cfg.config.vinted;
  cfg.config.vinted.proxies = ['http://a', 'http://b', 'http://c'];
  cfg.config.vinted.proxyRps = [1.2, 0.5];
  try {
    const slots = capacity.proxySlots();
    assert.deepEqual(slots.map((s) => s.rps), [1.2, 0.5, 0.7], 'the third falls back to the default');
    assert.equal(capacity.totalCapacity().toFixed(1), '2.4', 'the budget is the sum of the pool');
  } finally {
    Object.assign(cfg.config.vinted, { proxies, proxyRps });
  }
});

test('with no proxy configured there is still one route, with a safe rate', () => {
  assert.deepEqual(capacity.proxySlots(), [{ proxy: 'direct', rps: 0.7 }]);
  assert.equal(capacity.totalCapacity(), 0.7);
});

await (async () => {
  const fr = parseSearchUrl('https://www.vinted.fr/catalog?search_text=helmut&price_to=100');
  const add = (userId, p) =>
    store.insertSearch.run({
      user_id: userId, name: 'load', url: p.normalizedUrl, domain: p.domain,
      canonical_key: p.canonicalKey, api_query: JSON.stringify(p.query),
      dest_chat_id: userId, dest_thread_id: null, next_run_at: 0, created_at: store.now(),
    }).lastInsertRowid;

  store.upsertUser(7001, 'slowpoke', 'en'); // free: 900s
  store.upsertUser(7002, 'quick', 'en');
  store.setPlan.run('turbo', store.now() + 86400, 7002); // 30s

  const before = capacity.capacityReport();
  const one = add(7001, fr);
  const withOne = capacity.capacityReport();

  test('load is counted per domain, one request per interval per search', () => {
    assert.equal(withOne.keys, before.keys + 1, 'a new canonical key is a new poll');
    assert.ok(
      Math.abs(withOne.total - before.total - 1 / cfg.intervalFor('free')) < 1e-9,
      'a free search costs exactly one fetch per free interval',
    );
    const domain = withOne.domains.find((d) => d.domain === 'www.vinted.fr');
    assert.equal(domain.keys, 1, 'and it is charged to its own domain');
  });

  const two = add(7001, fr); // same user, same URL again
  test('identical searches share the fetch and cost nothing extra', () => {
    const now = capacity.capacityReport();
    assert.equal(now.keys, withOne.keys, 'a duplicate key is still one poll');
    assert.ok(Math.abs(now.total - withOne.total) < 1e-9, 'and adds no load');
  });

  const three = add(7002, fr); // a turbo user on the same key
  test('a shared key is paced by its fastest holder', () => {
    const now = capacity.capacityReport();
    assert.equal(now.keys, withOne.keys, 'still one key');
    assert.ok(
      Math.abs(now.total - before.total - 1 / cfg.intervalFor('turbo')) < 1e-9,
      'the turbo holder pulls the shared fetch up to its own rate',
    );
  });

  test('a search that joins an already faster key is admitted for free', () => {
    const verdict = capacity.admits({
      domain: fr.domain, canonicalKey: fr.canonicalKey, interval: cfg.intervalFor('free'),
    });
    assert.equal(verdict.delta, 0, 'it rides a fetch that is happening anyway');
    assert.equal(verdict.ok, true);
  });

  test('a new key past the budget is refused, a free rider still is not', () => {
    const { proxyRpsDefault } = cfg.config.vinted;
    cfg.config.vinted.proxyRpsDefault = 0.001; // a pool with nothing left
    try {
      const fresh = parseSearchUrl('https://www.vinted.it/catalog?search_text=margiela&price_to=500');
      const refused = capacity.admits({
        domain: fresh.domain, canonicalKey: fresh.canonicalKey, interval: cfg.intervalFor('free'),
      });
      assert.equal(refused.ok, false, 'an overloaded pool must not take another poll');
      assert.ok(refused.projected > refused.capacity);

      const rider = capacity.admits({
        domain: fr.domain, canonicalKey: fr.canonicalKey, interval: cfg.intervalFor('free'),
      });
      assert.equal(rider.ok, true, 'refusing a search that adds no load punishes nobody usefully');
    } finally {
      cfg.config.vinted.proxyRpsDefault = proxyRpsDefault;
    }
  });

  for (const id of [one, two]) store.deleteSearch.run(id, 7001);
  store.deleteSearch.run(three, 7002);
  store.setPlan.run('free', null, 7002);

  test('the pool is left as it was found', () => {
    const after = capacity.capacityReport();
    assert.equal(after.keys, before.keys);
    assert.ok(Math.abs(after.total - before.total) < 1e-9);
  });
})();

test('a new search starts somewhere inside its own interval window', () => {
  const interval = cfg.intervalFor('pro');
  const offsets = Array.from({ length: 200 }, () => capacity.stagger(interval));
  assert.ok(offsets.every((o) => o >= 0 && o < interval), 'never outside one window');
  assert.ok(new Set(offsets).size > 50, 'a burst of signups must not land in the same second');
});

test('the alarm speaks on a crossing and then keeps quiet', () => {
  let clock = 0;
  const alarm = new capacity.CapacityAlarm(() => clock);
  const at = (utilization) => alarm.check({ utilization, total: 1, capacity: 1, keys: 1, domains: [] });

  assert.equal(at(0.5), null, 'a quiet pool is not news');
  assert.equal(at(0.82).level, 'warn', 'crossing the warn line is');
  assert.equal(at(0.85), null, 'staying there is not, or it would be a message a minute');
  assert.equal(at(0.95).level, 'alert', 'but getting worse is');
  clock += cfg.config.capacity.repeatAfterSec;
  assert.equal(at(0.95).level, 'alert', 'a standing alarm is repeated after the cooldown');
  const back = at(0.1);
  assert.equal(back.level, 'ok', 'and recovery is worth saying once');
  assert.equal(back.previous, 'alert', 'so the message can be sent to whoever heard the alarm');
  assert.equal(at(0.1), null, 'once');
});

/* --------------------------------- seats --------------------------------- */

test('a seat cap counts live holders and blocks nobody when it is 0', () => {
  const original = cfg.config.seats.turbo;
  try {
    cfg.config.seats.turbo = 0;
    assert.equal(capacity.seats('turbo').full, false, '0 means uncapped, not "no spots"');
    assert.equal(capacity.seats('turbo').left, null);
    assert.equal(capacity.seatAvailableFor('turbo', 999999), true);

    store.upsertUser(7100, 'seated', 'en');
    store.setPlan.run('turbo', store.now() + 86400, 7100);
    const used = capacity.seats('turbo').used;
    assert.ok(used >= 1, 'a live holder occupies a seat');

    cfg.config.seats.turbo = used;
    const full = capacity.seats('turbo');
    assert.equal(full.full, true, 'the last seat taken means full');
    assert.equal(full.left, 0);
    assert.equal(capacity.seatAvailableFor('turbo', 999999), false, 'a newcomer is turned away');
    assert.equal(capacity.seatAvailableFor('turbo', 7100), true, 'a renewal is not a new seat');

    // an expired holder is not holding anything
    store.setPlan.run('turbo', store.now() - 10, 7100);
    assert.equal(capacity.seats('turbo').used, used - 1, 'a lapsed plan frees its seat');
  } finally {
    store.setPlan.run('free', null, 7100);
    cfg.config.seats.turbo = original;
  }
});

/* ------------------------------- delivery -------------------------------- */

const { Sender } = await import('../src/monitor/sender.js');
const { GrammyError } = await import('grammy');

const stubApi = (timeline, fail = null) => ({
  sendPhoto: async (chatId) => {
    timeline.push({ chatId, at: Date.now() });
    if (fail) return fail(timeline.length);
    return { message_id: timeline.length };
  },
  sendMessage: async (chatId) => {
    timeline.push({ chatId, at: Date.now() });
    return { message_id: timeline.length };
  },
});

const listing = (id) => ({
  chatId: -100,
  item: { id, title: `Item ${id}`, price: { amount: 10, currency: 'EUR' }, photoUrl: 'https://img/x.jpg', url: 'https://www.vinted.de/items/1' },
  searchName: 'Raf',
  lang: 'en',
});

const settled = (sender) =>
  new Promise((resolve) => {
    const tick = () => (sender.size === 0 ? resolve() : setTimeout(tick, 10));
    tick();
  });

await (async () => {
  // a burst the size of the allowance should not be spaced out at all
  const burstLine = [];
  const burst = new Sender(stubApi(burstLine), { burst: 10, groupPerMinute: 20, globalPerSec: 25 });
  const started = Date.now();
  for (let i = 0; i < 10; i++) burst.enqueue(listing(i));
  await settled(burst);
  const burstMs = Date.now() - started;

  test('ten listings land in a moment, not over half a minute', () => {
    assert.equal(burstLine.length, 10, 'all of them must be sent');
    assert.ok(burstMs < 1000, `a burst inside the allowance took ${burstMs}ms`);
  });

  // past the allowance the chat has to settle to its sustained rate
  const pacedLine = [];
  const paced = new Sender(stubApi(pacedLine), { burst: 2, groupPerMinute: 60, globalPerSec: 25 });
  for (let i = 0; i < 4; i++) paced.enqueue(listing(i));
  await settled(paced);

  test('past the burst it settles to the sustained rate', () => {
    assert.equal(pacedLine.length, 4);
    const gaps = pacedLine.slice(1).map((m, i) => m.at - pacedLine[i].at);
    assert.ok(gaps[0] < 200, `the second of the burst waited ${gaps[0]}ms`);
    assert.ok(gaps[1] > 800, `the third went out after only ${gaps[1]}ms — the budget was not enforced`);
    assert.ok(gaps[2] > 800, `the fourth went out after only ${gaps[2]}ms`);
  });

  // a chat that has spent its budget must not hold up a different chat
  const mixedLine = [];
  const mixed = new Sender(stubApi(mixedLine), { burst: 1, groupPerMinute: 30, globalPerSec: 25 });
  mixed.enqueue({ ...listing(1), chatId: -100 });
  mixed.enqueue({ ...listing(2), chatId: -100 }); // this one has to wait ~2s
  mixed.enqueue({ ...listing(3), chatId: -200 }); // this one should not
  await new Promise((r) => setTimeout(r, 300));

  test('a throttled chat does not hold up the others', () => {
    const early = mixedLine.map((m) => m.chatId);
    assert.deepEqual(early, [-100, -200], 'the second chat must be served while the first waits');
  });

  test('queue depth is reported per chat', () => {
    assert.ok(mixed.size >= 1, 'the delayed listing is still queued');
    assert.ok(mixed.pending.some((p) => p.startsWith('-100:')), `pending should name the chat: ${mixed.pending}`);
  });

  // Telegram pushing back must slow the whole chat, not just retry one message
  const flakyLine = [];
  let thrown = false;
  const flaky = new Sender(
    {
      sendPhoto: async (chatId) => {
        flakyLine.push({ chatId, at: Date.now() });
        if (thrown) return { message_id: 1 };
        thrown = true;
        throw new GrammyError(
          'Call to sendPhoto failed',
          { ok: false, error_code: 429, description: 'Too Many Requests: retry after 1', parameters: { retry_after: 0 } },
          'sendPhoto',
          {},
        );
      },
    },
    { burst: 5, groupPerMinute: 60, globalPerSec: 25 },
  );
  flaky.enqueue(listing(1));
  await settled(flaky);

  test('a 429 pauses the chat and the message is retried', () => {
    assert.equal(flakyLine.length, 2, 'the listing must be attempted again');
    const waited = flakyLine[1].at - flakyLine[0].at;
    assert.ok(waited > 900, `retry_after was not honoured — only ${waited}ms`);
    assert.equal(flaky.lanes.get(-100).bucket.tokens, 0, 'the chat budget must be emptied, not just this one send');
  });

  // a plan carrying a bigger burst spends the chat's allowance faster
  const tierLine = [];
  const tiered = new Sender(stubApi(tierLine), { burst: 5, groupPerMinute: 20, globalPerSec: 25 });
  const tierStart = Date.now();
  for (let i = 0; i < 12; i++) tiered.enqueue({ ...listing(i), burst: 12 });
  await settled(tiered);

  test('a plan may raise the burst above the default', () => {
    assert.equal(tierLine.length, 12);
    assert.ok(Date.now() - tierStart < 1000, 'twelve should leave at once for a plan allowed twelve');
  });

  test('the sustained rate stays clamped to what the chat allows', () => {
    const s = new Sender(stubApi([]), { groupPerMinute: 20, privatePerMinute: 60 });
    s.enqueue({ ...listing(1), chatId: -300, perMinute: 600 }); // far past the group limit
    assert.equal(s.lanes.get(-300).bucket.rate, 20 / 60, 'Telegram is not for sale');
    s.enqueue({ ...listing(2), chatId: -400, perMinute: 6 }); // a plan held below it
    assert.equal(s.lanes.get(-400).bucket.rate, 6 / 60, 'but a plan may be held back');
  });

  test('a chat shared by two plans follows the faster one', () => {
    const s = new Sender(stubApi([]), { burst: 5 });
    s.enqueue({ ...listing(1), chatId: -500, burst: 5 });
    assert.equal(s.lanes.get(-500).bucket.capacity, 5);
    s.enqueue({ ...listing(2), chatId: -500, burst: 30 });
    assert.equal(s.lanes.get(-500).bucket.capacity, 30, 'the better plan lifts the chat');
    s.enqueue({ ...listing(3), chatId: -500, burst: 5 });
    assert.equal(s.lanes.get(-500).bucket.capacity, 30, 'and a slower one must not drag it back');
  });

  // a private chat is allowed a higher sustained rate than a group
  test('private chats are paced more generously than groups', () => {
    const s = new Sender(stubApi([]), { groupPerMinute: 20, privatePerMinute: 60 });
    const group = s.lanes.get(-100) ?? (s.enqueue({ ...listing(1), chatId: -100 }), s.lanes.get(-100));
    const dm = s.lanes.get(4242) ?? (s.enqueue({ ...listing(2), chatId: 4242 }), s.lanes.get(4242));
    assert.ok(dm.bucket.rate > group.bucket.rate, 'a DM should refill faster than a group');
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

  const dir = pathMod.dirname(saved.path);
  fsMod.mkdirSync(dir, { recursive: true });
  fsMod.writeFileSync(pathMod.join(dir, 'help.png'), pixels);
  const again = await imagesModule.adoptPhoto(fakeApi, 'AgACbar', 'help', {
    download: async () => pixels,
  });
  test('replacing a picture leaves no orphan of another extension', () => {
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
    // createInvoiceLink answers with a URL string, not a message — a stub that
    // hands back a message object would let a broken link through a test
    if (method === 'createInvoiceLink') return { ok: true, result: 'https://t.me/$testinvoice' };
    return { ok: true, result: { message_id: 1, date: 0, chat: { id: fromId, type: 'private' } } };
  });
  bot.botInfo = { id: 111, is_bot: true, first_name: 'T', username: 'testbot', can_join_groups: true,
    can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false,
    has_main_web_app: false };
  await bot.handleUpdate(update);
  return calls;
}

// the bot syncs the username from every update, so the harness has to carry a
// real one per account — otherwise a test about who wrote in proves nothing
const from = (id, username = 'admin') => ({
  id,
  is_bot: false,
  first_name: 'A',
  username,
  language_code: 'ru',
});

const textUpdate = (text, fromId, entities, username) => ({
  update_id: Math.floor(Math.random() * 1e6),
  message: {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: { id: fromId, type: 'private' },
    from: from(fromId, username),
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
  store.setPlan.run('pro', store.now() + 86400, UID); // the floor cannot reach /add

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

  // The welcome can be a photo. Navigating from it must not turn that picture
  // into the backdrop of every later screen.
  const photoPress = (data) => ({
    update_id: Math.floor(Math.random() * 1e6),
    callback_query: {
      id: String(Math.floor(Math.random() * 1e6)),
      from: from(UID),
      chat_instance: '1',
      data,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: UID, type: 'private' },
        caption: 'welcome',
        photo: [{ file_id: 'w', file_unique_id: 'w', width: 90, height: 90 }],
      },
    },
  });

  const fromPhoto = await drive(photoPress('m:add'), UID);
  test('a screen opened from the photo welcome is its own message', () => {
    assert.ok(!fromPhoto.some((c) => c.method === 'editMessageText'), 'a photo has no text to edit');
    assert.ok(
      !fromPhoto.some((c) => c.method === 'editMessageCaption'),
      'and its caption must not become the prompt of an unrelated screen',
    );
    const sent = fromPhoto.find((c) => c.method === 'sendMessage');
    assert.ok(sent, 'the screen arrives as a fresh text message');
    assert.match(sent.payload.text, /vinted\.de\/catalog/, 'and it is the add-link prompt');
  });

  test('the welcome keeps its picture but gives up its buttons', () => {
    const retired = fromPhoto.find((c) => c.method === 'editMessageReplyMarkup');
    assert.ok(retired, 'the old menu must stop being tappable');
    assert.equal(retired.payload.reply_markup, undefined, 'the keyboard is removed, not replaced');
    assert.ok(!fromPhoto.some((c) => c.method === 'deleteMessage'), 'the welcome itself is left alone');
  });

  // leave the add wizard the way a user would, so later tests start clean
  const cancelled = await drive(pressUpdate('cancel', UID), UID);
  test('cancelling comes back to the menu, not to a dead end', () => {
    const edit = cancelled.find((c) => c.method === 'editMessageText');
    assert.ok(edit, 'the prompt must be replaced, not just stripped of buttons');
    const actions = edit.payload.reply_markup?.inline_keyboard?.flat().map((b) => b.callback_data);
    assert.ok(actions?.includes('m:add'), `no menu after cancelling: ${actions}`);
    assert.ok(actions.includes('m:list') && actions.includes('m:help'), 'the full menu comes back');
  });

  const textPress = await drive(pressUpdate('m:list', UID), UID);
  test('navigation from a text screen still edits in place', () => {
    assert.ok(textPress.some((c) => c.method === 'editMessageText'), 'no new message for plain screens');
    assert.ok(!textPress.some((c) => c.method === 'sendMessage'));
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
    assert.match(info, new RegExp(LOCALES.ru['plan.name.locked']), 'the plan name comes from the locale');
  });

  const noArg = await runCommand('/userinfo', 1);
  const unknown = await runCommand('/userinfo 999999', 1);
  test('/userinfo reports bad input instead of failing silently', () => {
    assert.match(noArg, /Использование/);
    assert.match(unknown, /не найден/);
  });

  /* --------------------------- support relay --------------------------- */

  const SUPPORT = 9001;
  const USER = 9002;
  store.upsertUser(SUPPORT, 'helper', 'en');
  store.upsertUser(USER, 'asker', 'ru');
  cfg.config.supportId = SUPPORT;

  await drive(
    textUpdate('/support', USER, [{ type: 'bot_command', offset: 0, length: 8 }], 'asker'),
    USER,
  );
  const asked = await drive(textUpdate('фото не приходят', USER, undefined, 'asker'), USER);
  const forwarded = asked.find((c) => c.method === 'sendMessage' && c.payload.chat_id === SUPPORT);

  test('a support message reaches the support contact with who sent it', () => {
    assert.ok(forwarded, 'the message must be passed on');
    assert.match(forwarded.payload.text, /фото не приходят/);
    assert.match(forwarded.payload.text, /@asker/, 'the username travels with it');
    assert.match(forwarded.payload.text, new RegExp(String(USER)), 'and the id, for a lookup');
    assert.ok(
      asked.some((c) => c.method === 'sendMessage' && c.payload.chat_id === USER),
      'and the user is told it went through',
    );
  });

  test('the relay remembers where an answer has to go', () => {
    assert.equal(store.support.userFor(1), USER, 'keyed by the message the support sees');
  });

  const answered = await drive(
    {
      update_id: Math.floor(Math.random() * 1e6),
      message: {
        message_id: 77,
        date: Math.floor(Date.now() / 1000),
        chat: { id: SUPPORT, type: 'private' },
        from: { id: SUPPORT, is_bot: false, first_name: 'S', username: 'helper', language_code: 'en' },
        text: 'проверь настройки темы',
        reply_to_message: { message_id: 1, date: 0, chat: { id: SUPPORT, type: 'private' }, text: 'req' },
      },
    },
    SUPPORT,
  );

  test('an answer comes back to the user who asked', () => {
    const back = answered.find((c) => c.method === 'sendMessage' && c.payload.chat_id === USER);
    assert.ok(back, 'the reply must reach the original user');
    assert.match(back.payload.text, /проверь настройки темы/);
    assert.match(back.payload.text, /💬/, 'and be marked as coming from support');
  });

  const strayReply = await drive(
    {
      update_id: Math.floor(Math.random() * 1e6),
      message: {
        message_id: 78,
        date: Math.floor(Date.now() / 1000),
        chat: { id: SUPPORT, type: 'private' },
        from: { id: SUPPORT, is_bot: false, first_name: 'S', username: 'helper', language_code: 'en' },
        text: 'кому это?',
        reply_to_message: { message_id: 4242, date: 0, chat: { id: SUPPORT, type: 'private' }, text: 'x' },
      },
    },
    SUPPORT,
  );

  test('a reply to something unknown is reported, not sent to a stranger', () => {
    const replies = strayReply.filter((c) => c.method === 'sendMessage');
    assert.ok(replies.every((c) => c.payload.chat_id === SUPPORT), 'nothing may leak to another chat');
    assert.match(replies[0].payload.text, /reply to the request/i);
  });

  cfg.config.supportId = 0;
  const noSupport = await drive(pressUpdate('m:support', USER), USER);
  test('with no support contact configured the flow says so', () => {
    const edit = noSupport.find((c) => c.method === 'editMessageText');
    assert.match(edit.payload.text, /unavailable|недоступна/i);
  });
  cfg.config.supportId = SUPPORT;

  /* ------------------------- reaching a tier --------------------------- */

  store.upsertUser(9100, 'climber', 'ru');
  const grant = (args) =>
    drive(textUpdate(`/grant ${args}`, 1, [{ type: 'bot_command', offset: 0, length: 6 }]), 1);
  const climbed = await grant('9100 pro 30');
  test('reaching a tier brings its own congratulation, with real numbers', () => {
    const welcome = climbed.find((c) => c.method === 'sendMessage' && c.payload.chat_id === 9100);
    assert.ok(welcome, 'the user must hear about it');
    assert.match(welcome.payload.text, /ranger/i);
    assert.match(welcome.payload.text, new RegExp(String(cfg.searchLimitFor('pro'))), 'its link count');
    assert.match(welcome.payload.text, new RegExp(String(cfg.intervalFor('pro'))), 'its interval');
    assert.ok(!/\{/.test(welcome.payload.text), 'no placeholder may survive into the copy');
  });

  const again = await grant('9100 pro 60');
  test('extending the same tier is not celebrated twice', () => {
    assert.ok(
      !again.some((c) => c.method === 'sendMessage' && c.payload.chat_id === 9100),
      'only a change of tier is news',
    );
  });

  const dropped = await grant('9100 free');
  test('being moved to the free tier is not congratulated', () => {
    assert.ok(!dropped.some((c) => c.method === 'sendMessage' && c.payload.chat_id === 9100));
  });

  // with a picture set for that tier the congratulation carries it
  const tierPath = pathMod.join(pathMod.dirname(pathMod.resolve(process.env.DB_PATH)), 'images', 'tier_turbo.jpg');
  fsMod.mkdirSync(pathMod.dirname(tierPath), { recursive: true });
  fsMod.writeFileSync(tierPath, Buffer.from('89504e470d0a1a0a', 'hex'));
  store.settings.set('tier_turbo_image', tierPath);
  const withPicture = await grant('9100 turbo 30');
  store.settings.clear('tier_turbo_image');
  fsMod.rmSync(tierPath, { force: true });

  test('a tier picture rides along with its congratulation', () => {
    const photo = withPicture.find((c) => c.method === 'sendPhoto' && c.payload.chat_id === 9100);
    assert.ok(photo, 'the picture set for that tier must be used');
    assert.match(photo.payload.caption, /Sniper Elite/);
    assert.ok(
      !withPicture.some((c) => c.method === 'sendMessage' && c.payload.chat_id === 9100),
      'and not be doubled by a text copy',
    );
  });

  const tierImageUsage = await runCommand('/settierimage hunter', 1);
  test('/settierimage works by the name the tier is sold under', () => {
    assert.match(tierImageUsage, /Hunter/, 'it names the tier back');
  });
  const tierImageBad = await runCommand('/settierimage platinum', 1);
  test('/settierimage refuses a tier that does not exist', () => {
    assert.match(tierImageBad, /Usage/);
  });
  test('the tier picture command is invisible in every command list', () => {
    const everywhere = [...COMMAND_SETS.PRIVATE, ...COMMAND_SETS.GROUP, ...COMMAND_SETS.ADMIN];
    assert.ok(!everywhere.includes('settierimage'));
  });

  const granted = await runCommand('/grant 4242 elite_max 30', 1);
  test('the reserved tier is handed out by /grant and nothing else', () => {
    assert.match(granted, /elite_max/);
    assert.equal(store.getUser(4242).plan, 'elite_max');
    assert.equal(
      cfg.intervalFor(store.effectivePlan(store.getUser(4242))),
      cfg.intervalFor('elite_max'),
    );
  });

  const planScreen = await drive(pressUpdate('m:plan', 4242), 4242);
  const planLang = store.getUser(4242).lang; // this account is not on the default language
  test('the plan screen names every public tier and hides the reserved one', () => {
    const edit = planScreen.find((c) => c.method === 'editMessageText');
    for (const tier of cfg.PUBLIC_PLANS) {
      assert.match(edit.payload.text, new RegExp(LOCALES[planLang][`plan.name.${tier}`]), `${tier} missing`);
    }
    // the holder does see their own plan in the header — what must never leak
    // is a row for it in the comparison everyone reads
    const body = edit.payload.text.split(LOCALES[planLang]['plan.tiersHeader'])[1] ?? '';
    assert.ok(body.length, 'the comparison section must exist');
    assert.ok(
      !body.includes(LOCALES[planLang]['plan.name.elite_max']),
      `the reserved tier leaked into the comparison:\n${body}`,
    );
    const buttons = (edit.payload.reply_markup?.inline_keyboard ?? []).flat();
    assert.ok(!buttons.some((b) => /elite_max/.test(b.callback_data ?? '')), 'and cannot be bought');
  });

  test('the comparison carries prices and the scarcity line', () => {
    const edit = planScreen.find((c) => c.method === 'editMessageText');
    assert.match(edit.payload.text, /\$9/, 'Hunter price');
    assert.match(edit.payload.text, /\$19/, 'Ranger price');
    assert.match(edit.payload.text, /\$79/, 'Sniper Elite price');
    assert.ok(edit.payload.text.includes('Sniper Elite'), 'scarcity names the tier it pushes');
    assert.match(edit.payload.text, /🔥/, 'the scarcity line is there');
  });

  /* ------------------ burst is hidden when there is none ---------------- */

  const BURSTLESS = 7400;
  store.upsertUser(BURSTLESS, 'burstless', 'en');
  const burstBefore = { ...cfg.config.delivery.burst };
  Object.assign(cfg.config.delivery.burst, { free: 1, basic: 1 });
  const noBurstScreen = await drive(pressUpdate('m:plan', BURSTLESS), BURSTLESS);
  Object.assign(cfg.config.delivery.burst, burstBefore);

  test('a tier with a burst of 1 says nothing about burst at all', () => {
    const text = noBurstScreen.find((c) => c.method === 'editMessageText').payload.text;
    // the reader is on Scout: their own stat line must be gone, not "burst 1"
    assert.ok(
      !text.includes(t('en', 'plan.burst', { count: 1 })),
      `"burst 1" is advertised as a feature:\n${text}`,
    );
    assert.ok(!/⚡1\b/.test(text), `a tier row still carries a burst of 1:\n${text}`);

    // and the rows say it in the right shape, per tier
    for (const tier of ['free', 'basic']) {
      // the row minus its price tag: how Scout prints its length is priceTag's
      // business and has its own test
      const tail = t('en', 'plan.tierRowNoBurst', {
        name: LOCALES.en[`plan.name.${tier}`],
        price: '\u0000',
        interval: cfg.intervalFor(tier),
        links: cfg.searchLimitFor(tier),
      }).split('\u0000')[1];
      assert.ok(text.includes(tail), `${tier} should use the burst-free row:\n${text}`);
    }
    for (const tier of ['pro', 'turbo']) {
      assert.match(
        text,
        new RegExp(`${LOCALES.en[`plan.name.${tier}`]}.*⚡${cfg.burstFor(tier)}`),
        `${tier} really has a burst and must still show it:\n${text}`,
      );
    }
  });

  store.setPlan.run('basic', store.now() + 86400, BURSTLESS);
  Object.assign(cfg.config.delivery.burst, { free: 1, basic: 1 });
  const hunterScreen = await drive(pressUpdate('m:plan', BURSTLESS), BURSTLESS);
  Object.assign(cfg.config.delivery.burst, burstBefore);
  store.setPlan.run('free', null, BURSTLESS);

  test('nor is it multiplied at them in the upsell', () => {
    const text = hunterScreen.find((c) => c.method === 'editMessageText').payload.text;
    // Hunter has no burst, so "20x the delivery burst" would be multiplying a
    // number this very screen refuses to print
    assert.ok(
      !text.includes(t('en', 'plan.next.burst', { times: '20' })),
      `the upsell multiplies a burst the tier does not have:\n${text}`,
    );
    assert.match(text, /checks 5× more often/, 'the honest parts of the upsell survive');
    assert.ok(text.includes(`⚡${cfg.burstFor('pro')}`), "and Ranger's own row still names its burst");
  });

  // the same reader, the same tier, with a burst configured: the line is not
  // gone for good, it is gone because there was nothing to say
  cfg.config.delivery.burst.free = 12;
  const withBurstScreen = await drive(pressUpdate('m:plan', BURSTLESS), BURSTLESS);
  Object.assign(cfg.config.delivery.burst, burstBefore);

  test('and a tier that does have one still shows it', () => {
    const text = withBurstScreen.find((c) => c.method === 'editMessageText').payload.text;
    assert.ok(
      text.includes(t('en', 'plan.burst', { count: 12 })),
      `with a real burst configured the line belongs there:\n${text}`,
    );
  });

  /* --------------- the trial, the floor, and the plan screen ------------- */

  const TRIAL = 7600;
  store.upsertUser(TRIAL, 'trialbuyer', 'en');
  const lockedScreen = await drive(pressUpdate('m:plan', TRIAL), TRIAL);

  test('an account holding nothing is told so, and offered the way out', () => {
    const text = lockedScreen.find((c) => c.method === 'editMessageText').payload.text;
    assert.ok(text.includes(LOCALES.en['plan.name.locked']), `the header names the state:\n${text}`);
    assert.ok(text.includes(LOCALES.en['plan.lockedNote']), 'and says the searches are not running');
    assert.ok(!text.includes(LOCALES.en['plan.interval'].split('{')[0]), 'a floor has no check interval to quote');
    const buttons = lockedScreen
      .find((c) => c.method === 'editMessageText')
      .payload.reply_markup.inline_keyboard.flat();
    assert.ok(buttons.some((b) => b.callback_data === 'buy:free'), 'Scout is buyable from here');
  });

  const lockedAdd = await drive(pressUpdate('m:add', TRIAL), TRIAL);
  test('and /add says there is no plan rather than "limit reached"', () => {
    const text = lockedAdd.find((c) => c.method === 'editMessageText').payload.text;
    assert.ok(text.includes('🔒'), `expected the locked refusal, got:\n${text}`);
    assert.ok(!text.includes('vinted.de/catalog'), 'the URL prompt must not open');
    const buttons = lockedAdd.find((c) => c.method === 'editMessageText').payload.reply_markup.inline_keyboard.flat();
    assert.ok(buttons.some((b) => b.callback_data === 'm:plan'), 'the way out is one tap away');
  });

  // buy it: pre-checkout, then the payment itself
  store.setPlan.run('free', store.now() + cfg.config.payments.trialHours * 3600, TRIAL);
  const trialScreen = await drive(pressUpdate('m:plan', TRIAL), TRIAL);

  test('a running trial counts down instead of naming a date', () => {
    const text = trialScreen.find((c) => c.method === 'editMessageText').payload.text;
    assert.match(text, /Trial: \d+d \d+h left/, `no countdown in:\n${text}`);
    assert.ok(!text.includes(LOCALES.en['plan.until'].split('{')[0]), 'a date is for the monthly plans');
    assert.ok(text.includes(LOCALES.en['plan.name.free']), 'and it names Scout');
  });

  test('the trial carries its length in the price column', () => {
    const text = trialScreen.find((c) => c.method === 'editMessageText').payload.text;
    // $1 sitting under $9/$19/$79 reads as a dollar a month unless it says otherwise
    assert.ok(
      text.includes(`$${cfg.usdFor('free')}/${LOCALES.en['unit.week']}`),
      `Scout's price does not say how long it lasts:\n${text}`,
    );
    assert.ok(!/\$\d+\/\d+h/.test(text), 'a week must not be advertised as a count of hours');
    assert.ok(!/just \+\$\d+ a month/.test(text), 'and a day-to-month price delta is not offered');
  });

  // the last day of the trial: days drop out and the countdown gets finer
  store.setPlan.run('free', store.now() + 5 * 3600 + 20 * 60, TRIAL);
  const lastDay = await drive(pressUpdate('m:plan', TRIAL), TRIAL);
  store.setPlan.run('free', store.now() + cfg.config.payments.trialHours * 3600, TRIAL);

  test('the countdown changes unit as the trial runs out', () => {
    const text = lastDay.find((c) => c.method === 'editMessageText').payload.text;
    assert.match(text, /Trial: 5h \d+m left/, `expected hours and minutes in:\n${text}`);
    assert.ok(!/\dd /.test(text), 'no days left to name');
  });

  // a shorter window must say so everywhere rather than keep advertising a week
  const hoursBefore = cfg.config.payments.trialHours;
  cfg.config.payments.trialHours = 48;
  const shortWindow = await drive(pressUpdate('m:plan', TRIAL), TRIAL);
  cfg.config.payments.trialHours = hoursBefore;

  test('shortening the window changes what the screen calls it', () => {
    const text = shortWindow.find((c) => c.method === 'editMessageText').payload.text;
    assert.ok(text.includes('$1/2d'), `the price tag still claims a week:\n${text}`);
    assert.ok(!text.includes(`$1/${LOCALES.en['unit.week']}`), 'a 48h window is not a week');
  });

  test('the tier list carries both markers and explains them underneath', () => {
    const text = trialScreen.find((c) => c.method === 'editMessageText').payload.text;
    assert.ok(text.includes(`⚡${cfg.burstFor('pro')}`), `Ranger's burst reads as a bolt:\n${text}`);
    assert.ok(text.includes(`⚡${cfg.burstFor('turbo')}`), "and so does Sniper Elite's");
    assert.ok(!/burst \d/i.test(text), 'the word "burst" is gone from the rows');
    assert.ok(text.includes(LOCALES.en['plan.legendGroup']), 'the 👥 note is there');
    assert.ok(text.includes(LOCALES.en['plan.legendBurst']), 'the ⚡ note is there');
    // the legend belongs under the tiers, not above them
    assert.ok(
      text.indexOf(LOCALES.en['plan.legendGroup']) > text.indexOf(LOCALES.en['plan.tiersHeader']),
      'the footnote must sit below the list it annotates',
    );
  });

  test('the add-on is not on sale anywhere on the screen', () => {
    const screen = trialScreen.find((c) => c.method === 'editMessageText');
    const buttons = screen.payload.reply_markup.inline_keyboard.flat();
    assert.ok(!buttons.some((b) => b.callback_data === 'buy:addon'), 'no button opens it');
    assert.ok(
      !screen.payload.text.includes(LOCALES.en['plan.addonOffer'].split('{')[0]),
      'and the offer line is gone from the text',
    );
  });

  // someone holding more searches than the tier they are on now allows: the
  // limit moved, their searches did not
  const limitBefore = cfg.config.limits.basic.searches;
  cfg.config.limits.basic.searches = 1;
  store.setPlan.run('basic', store.now() + 86400, TRIAL);
  for (const name of ['a', 'b']) {
    store.insertSearch.run({
      user_id: TRIAL, name, url: parsed.normalizedUrl, domain: parsed.domain,
      canonical_key: parsed.canonicalKey, api_query: JSON.stringify(parsed.query),
      dest_chat_id: TRIAL, dest_thread_id: null, next_run_at: 0, created_at: store.now(),
    });
  }
  const grandfathered = await drive(pressUpdate('m:plan', TRIAL), TRIAL);
  cfg.config.limits.basic.searches = limitBefore;
  for (const s of store.listSearches.all(TRIAL)) store.deleteSearch.run(s.id, TRIAL);

  test('a limit that moved under someone says so instead of just reading wrong', () => {
    const text = grandfathered.find((c) => c.method === 'editMessageText').payload.text;
    assert.match(text, /Link limit: 1/);
    assert.match(text, /In use: 2/);
    assert.ok(
      text.includes(LOCALES.en['plan.grandfathered']),
      `nothing explains why "in use" beats the limit:\n${text}`,
    );
  });

  store.setPlan.run('locked', null, TRIAL);

  /* ------------------ star subscriptions, end to end -------------------- */

  const SUB = 7700;
  store.upsertUser(SUB, 'subscriber', 'en');
  const starsWere = { ...cfg.config.payments.stars };
  cfg.config.payments.stars.pro = 500;
  cfg.config.payments.stars.free = 77;

  const payUpdate = (uid, payload, extra) => ({
    update_id: Math.floor(Math.random() * 1e6),
    message: {
      message_id: Math.floor(Math.random() * 1e6),
      date: Math.floor(Date.now() / 1000),
      chat: { id: uid, type: 'private' },
      from: from(uid, 'subscriber'),
      successful_payment: {
        currency: 'XTR', total_amount: 500, invoice_payload: payload,
        telegram_payment_charge_id: 'sub-1', provider_payment_charge_id: 'p-1',
        ...extra,
      },
    },
  });
  const subUpdate = (uid, payload, state) => ({
    update_id: Math.floor(Math.random() * 1e6),
    subscription: { user: from(uid, 'subscriber'), invoice_payload: payload, state },
  });

  const offered = await drive(pressUpdate('buy:pro', SUB), SUB);
  test('a monthly tier is sold as a subscription, not a one-off invoice', () => {
    const link = offered.find((c) => c.method === 'createInvoiceLink');
    assert.ok(link, 'createInvoiceLink is the only method that can carry a period');
    assert.equal(link.payload.subscription_period, 2592000, 'Telegram accepts exactly 30 days');
    assert.equal(link.payload.currency, 'XTR');
    assert.equal(link.payload.payload, 'plan:pro', 'the payload is what the renewal comes back with');
    assert.ok(!offered.some((c) => c.method === 'sendInvoice'), 'sendInvoice cannot do subscriptions');
    const button = offered
      .find((c) => c.method === 'sendMessage')
      .payload.reply_markup.inline_keyboard.flat()
      .find((b) => b.url);
    assert.ok(button, 'the link has to reach the user as something tappable');
  });

  const scoutOffer = await drive(pressUpdate('buy:free', SUB), SUB);
  test('Scout stays a single purchase — a week is not a subscription period', () => {
    assert.ok(scoutOffer.some((c) => c.method === 'sendInvoice'));
    assert.ok(!scoutOffer.some((c) => c.method === 'createInvoiceLink'));
  });

  const firstDue = store.now() + 30 * 86400;
  const firstPay = await drive(
    payUpdate(SUB, 'plan:pro', {
      is_recurring: true, is_first_recurring: true, subscription_expiration_date: firstDue,
    }),
    SUB,
  );

  test('the first charge stores what Telegram says, not a date of our own', () => {
    const u = store.getUser(SUB);
    assert.equal(u.plan, 'pro');
    assert.equal(u.plan_until, firstDue, "the API's expiry date is the authority on the next charge");
    assert.equal(u.sub_charge_id, 'sub-1', 'without the charge id nothing can ever be cancelled');
    assert.equal(u.sub_state, 'active');
    assert.ok(
      firstPay.some((c) => c.method === 'sendMessage' && /renews automatically/i.test(c.payload.text)),
      'the first one says it will recur',
    );
  });

  const secondDue = firstDue + 30 * 86400;
  const renewal = await drive(
    payUpdate(SUB, 'plan:pro', { is_recurring: true, subscription_expiration_date: secondDue }),
    SUB,
  );

  test('a renewal extends the plan and says nothing', () => {
    assert.equal(store.getUser(SUB).plan_until, secondDue);
    assert.ok(
      !renewal.some((c) => c.method === 'sendMessage'),
      'Telegram already shows the charge; a monthly message from the bot is noise',
    );
  });

  await drive(
    payUpdate(SUB, 'plan:pro', { is_recurring: true, subscription_expiration_date: store.now() + 60 }),
    SUB,
  );
  test('and a late event carrying an older date cannot shorten what was paid', () => {
    assert.equal(store.getUser(SUB).plan_until, secondDue);
  });

  // switching tiers: Telegram would keep charging the old subscription too
  const switched = await drive(
    payUpdate(SUB, 'plan:turbo', {
      is_recurring: true,
      is_first_recurring: true,
      subscription_expiration_date: secondDue,
      telegram_payment_charge_id: 'sub-2',
    }),
    SUB,
  );
  test('changing tier cancels the subscription being replaced', () => {
    const killed = switched.find(
      (c) => c.method === 'editUserStarSubscription' && c.payload.telegram_payment_charge_id === 'sub-1',
    );
    assert.ok(killed, 'without this the old subscription keeps charging alongside the new one');
    assert.equal(killed.payload.is_canceled, true);
    const u = store.getUser(SUB);
    assert.equal(u.sub_charge_id, 'sub-2', 'and the new one is what /plan can cancel');
    assert.equal(u.plan, 'turbo');
  });

  // back to Ranger for the rest of the run, on the charge id the tests expect
  store.applySubscriptionPayment.run('pro', secondDue, 'sub-1', SUB);

  const cancelled = await drive(pressUpdate('sub:cancel', SUB), SUB);
  test('cancelling stops the next charge and takes nothing away', () => {
    const call = cancelled.find((c) => c.method === 'editUserStarSubscription');
    assert.ok(call, 'this is the Bot API method behind a Stars cancellation');
    assert.equal(call.payload.is_canceled, true);
    assert.equal(call.payload.telegram_payment_charge_id, 'sub-1');
    assert.equal(call.payload.user_id, SUB);
    const u = store.getUser(SUB);
    assert.equal(u.sub_state, 'canceled');
    assert.equal(u.plan_until, secondDue, 'the period already paid for is untouched');
  });

  test('and the screen says so in as many words', () => {
    const text = cancelled.find((c) => c.method === 'editMessageText').payload.text;
    assert.match(text, /Cancelled — access until/, `expected the cancelled state in:\n${text}`);
    assert.ok(!/Renews automatically/.test(text), 'it no longer renews');
    const buttons = cancelled
      .find((c) => c.method === 'editMessageText')
      .payload.reply_markup.inline_keyboard.flat();
    assert.ok(buttons.some((b) => b.callback_data === 'sub:resume'), 'and it can be switched back on');
  });

  const resumed = await drive(pressUpdate('sub:resume', SUB), SUB);
  test('resuming turns the same switch the other way', () => {
    const call = resumed.find((c) => c.method === 'editUserStarSubscription');
    assert.equal(call.payload.is_canceled, false);
    assert.equal(store.getUser(SUB).sub_state, 'active');
    assert.match(
      resumed.find((c) => c.method === 'editMessageText').payload.text,
      /Renews automatically/,
    );
  });

  // a renewal that could not be charged: the plan is nearly out of road
  store.setPlan.run('pro', store.now() + 30, SUB);
  const failed = await drive(subUpdate(SUB, 'plan:pro', 'failed'), SUB);
  test('a failed renewal buys the grace window instead of dropping them at once', () => {
    const u = store.getUser(SUB);
    assert.equal(u.sub_state, 'failed');
    const grace = cfg.config.payments.subscriptions.graceHours * 3600;
    assert.ok(
      Math.abs(u.plan_until - (store.now() + grace)) < 10,
      `expected about ${grace}s of grace, got ${u.plan_until - store.now()}s`,
    );
    assert.equal(store.effectivePlan(u), 'pro', 'and the plan still works while they top up');
    assert.ok(
      failed.some((c) => c.method === 'sendMessage' && /Star balance/i.test(c.payload.text)),
      'they have to be told, or the silence is the only warning',
    );
  });

  const cancelEvent = await drive(subUpdate(SUB, 'plan:pro', 'canceled'), SUB);
  test('a cancellation made outside the bot arrives as an update too', () => {
    assert.equal(store.getUser(SUB).sub_state, 'canceled');
    assert.ok(cancelEvent.some((c) => c.method === 'sendMessage'), 'and is acknowledged');
  });

  await drive(subUpdate(SUB, 'plan:pro', 'active'), SUB);
  test('re-enabling it elsewhere comes back as active', () => {
    assert.equal(store.getUser(SUB).sub_state, 'active');
  });

  const usersBeforeStray = store.stats().users;
  const stray = await drive(subUpdate(999777, 'plan:pro', 'canceled'), 999777);
  test('a subscription update for somebody we never saw is ignored, not acted on', () => {
    assert.equal(store.stats().users, usersBeforeStray, 'an unknown user must not be created');
    assert.ok(!stray.some((c) => c.method === 'sendMessage'), 'and nothing is sent to them');
  });

  // the migration path: a plan bought before subscriptions existed
  const LEGACY = 7701;
  store.upsertUser(LEGACY, 'bogdan', 'en');
  store.setPlan.run('pro', store.now() + 12 * 86400, LEGACY);
  const legacyScreen = await drive(pressUpdate('m:plan', LEGACY), LEGACY);

  test('a plan from before subscriptions keeps running, untouched and un-renewing', () => {
    const u = store.getUser(LEGACY);
    assert.equal(u.sub_charge_id, null, 'nothing was migrated into a subscription behind their back');
    assert.equal(store.effectivePlan(u), 'pro', 'and they keep every day they paid for');
    const screen = legacyScreen.find((c) => c.method === 'editMessageText');
    assert.match(screen.payload.text, /Valid until/, 'the screen says it simply ends');
    assert.ok(!/Renews automatically/.test(screen.payload.text));
    const buttons = screen.payload.reply_markup.inline_keyboard.flat();
    assert.ok(!buttons.some((b) => (b.callback_data ?? '').startsWith('sub:')), 'nothing to cancel');
    assert.ok(
      buttons.some((b) => b.callback_data === 'buy:pro'),
      'and subscribing is offered for when it runs out',
    );
  });

  test('lapsing clears the subscription with the plan', () => {
    store.setPlan.run('pro', store.now() - 1, SUB);
    const lapsed = store.getUser(SUB);
    assert.equal(lapsed.plan, 'locked');
    assert.equal(lapsed.sub_charge_id, null, 'a dead subscription must not be cancellable');
    assert.equal(lapsed.sub_state, null);
  });

  Object.assign(cfg.config.payments.stars, starsWere);
  store.setPlan.run('locked', null, SUB);
  store.setPlan.run('locked', null, LEGACY);

  const rejected = await runCommand('/grant 4242 platinum 30', 1);
  test('/grant refuses a plan that does not exist', () => {
    assert.match(rejected, /Usage/);
    assert.equal(store.getUser(4242).plan, 'elite_max', 'the account is left alone');
  });
  store.setPlan.run('locked', null, 4242);

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

  /* ------------------------ seats, end to end -------------------------- */

  const BUYER = 7200;
  store.upsertUser(BUYER, 'buyer', 'en');
  const seatsBefore = cfg.config.seats.turbo;
  const starsBefore = cfg.config.payments.stars.turbo;
  cfg.config.payments.stars.turbo = 500;
  cfg.config.seats.turbo = capacity.seats('turbo').used; // every spot taken

  const planFull = await drive(pressUpdate('m:plan', BUYER), BUYER);
  test('a tier with no spots left says so on the button instead of selling', () => {
    const edit = planFull.find((c) => c.method === 'editMessageText');
    const buttons = edit.payload.reply_markup.inline_keyboard.flat();
    const turbo = buttons.find((b) => b.callback_data === 'buy:turbo');
    assert.ok(turbo, 'the tier is still listed');
    assert.match(turbo.text, /no spots left/i, `the button still offers a sale: ${turbo.text}`);
    assert.ok(!turbo.text.includes('⭐'), 'and it must not show a price it will not honour');
    assert.match(edit.payload.text, /all spots are taken/i, 'the scarcity line tells the truth');
  });

  const tapped = await drive(pressUpdate('buy:turbo', BUYER), BUYER);
  test('tapping it explains instead of opening an invoice', () => {
    assert.ok(!tapped.some((c) => c.method === 'sendInvoice'), 'no invoice for a tier that is full');
    const reply = tapped.find((c) => c.method === 'sendMessage');
    assert.match(reply.payload.text, /full right now/i);
    assert.ok(!/[<>]/.test(reply.payload.text), 'this one is sent as plain text, so no markup in it');
  });

  const preCheckout = await drive(
    {
      update_id: Math.floor(Math.random() * 1e6),
      pre_checkout_query: {
        id: '42', from: from(BUYER, 'buyer'), currency: 'XTR', total_amount: 500,
        invoice_payload: 'plan:turbo',
      },
    },
    BUYER,
  );
  test('an invoice opened before the last seat went is declined, not charged', () => {
    const answer = preCheckout.find((c) => c.method === 'answerPreCheckoutQuery');
    assert.ok(answer, 'Telegram must get an answer within 10 seconds');
    assert.equal(answer.payload.ok, false, 'saying yes here is what takes the money');
    assert.match(answer.payload.error_message, /full/i, 'and the buyer is told why');
    assert.ok(answer.payload.error_message.length <= 255, 'Telegram truncates anything longer');
  });

  const paidAnyway = await drive(
    {
      update_id: Math.floor(Math.random() * 1e6),
      message: {
        message_id: 5, date: Math.floor(Date.now() / 1000),
        chat: { id: BUYER, type: 'private' }, from: from(BUYER, 'buyer'),
        successful_payment: {
          currency: 'XTR', total_amount: 500, invoice_payload: 'plan:turbo',
          telegram_payment_charge_id: 'charge-1', provider_payment_charge_id: 'p-1',
        },
      },
    },
    BUYER,
  );
  test('two buyers racing for the last seat: the loser is refunded, not left short', () => {
    const refund = paidAnyway.find((c) => c.method === 'refundStarPayment');
    assert.ok(refund, 'the stars must go back');
    assert.equal(refund.payload.telegram_payment_charge_id, 'charge-1');
    assert.equal(store.getUser(BUYER).plan, 'locked', 'and no tier is handed out');
    const told = paidAnyway.find((c) => c.method === 'sendMessage');
    assert.match(told.payload.text, /refunded/i);
  });

  const grantFull = await runCommand(`/grant ${BUYER} turbo 30`, 1);
  test('/grant respects the cap too, or the number is just decoration', () => {
    assert.match(grantFull, /MAX_SNIPER_ELITE_SEATS/, 'it names the setting to raise');
    assert.equal(store.getUser(BUYER).plan, 'locked', 'nobody is seated past the cap');
  });

  cfg.config.seats.turbo = capacity.seats('turbo').used + 1; // one spot opens
  const grantOk = await runCommand(`/grant ${BUYER} turbo 30`, 1);
  test('and hands the tier over the moment a spot exists', () => {
    assert.match(grantOk, /OK/);
    assert.equal(store.getUser(BUYER).plan, 'turbo');
  });

  const statsOut = capacity.statsLines().join('\n');
  test('/stats reports load against capacity, and seats used', () => {
    assert.match(statsOut, /Нагрузка: \d+\.\d+ из \d+\.\d+ req\/s \(\d+%\)/, 'load vs budget');
    assert.match(statsOut, /Прокси: .*\d+(\.\d+)? req\/s/, 'and what the budget is made of');
    assert.match(statsOut, /Места: .*Sniper Elite \d+\/\d+ \(свободно \d+\)/, 'seats used and left');
    assert.ok(!statsOut.includes('@'), 'a proxy string carries a password — it must not be printed');
  });

  store.setPlan.run('free', null, BUYER);
  cfg.config.seats.turbo = seatsBefore;
  cfg.config.payments.stars.turbo = starsBefore;

  /* --------------------- capacity, end to end -------------------------- */

  const ADDER = 7300;
  store.upsertUser(ADDER, 'adder', 'en');
  const addLink = async (url, name) => {
    await drive(textUpdate('/add', ADDER, [{ type: 'bot_command', offset: 0, length: 4 }], 'adder'), ADDER);
    await drive(textUpdate(url, ADDER, undefined, 'adder'), ADDER);
    await drive(textUpdate(name, ADDER, undefined, 'adder'), ADDER);
    return drive(pressUpdate('dest:private', ADDER), ADDER);
  };

  const budget = cfg.config.vinted.proxyRpsDefault;
  cfg.config.vinted.proxyRpsDefault = 0.0001; // a pool with nothing left to give
  const refusedAdd = await addLink('https://www.vinted.pl/catalog?search_text=margiela&price_to=500', 'Margiela');
  cfg.config.vinted.proxyRpsDefault = budget;

  test('at capacity a new link is refused, not quietly piled onto the proxies', () => {
    const edit = refusedAdd.find((c) => c.method === 'editMessageText');
    assert.match(edit.payload.text, /slots? .*(busy|free up)/i, `got: ${edit.payload.text}`);
    assert.equal(store.listSearches.all(ADDER).length, 0, 'and nothing is stored');
  });

  const acceptedAdd = await addLink('https://www.vinted.pl/catalog?search_text=margiela&price_to=500', 'Margiela');
  test('with room in the pool the same link goes through, staggered', () => {
    const edit = acceptedAdd.find((c) => c.method === 'editMessageText');
    assert.match(edit.payload.text, /Margiela/);
    const [search] = store.listSearches.all(ADDER);
    assert.ok(search, 'the search must exist this time');
    const offset = search.next_run_at - store.now();
    assert.ok(offset >= 0 && offset < cfg.intervalFor('free'), `first poll ${offset}s away, outside the window`);
    store.deleteSearch.run(search.id, ADDER);
  });
})();

await Promise.all(pending);
console.log(failures ? `\n${failures} test(s) failed` : '\nall tests passed');
process.exit(failures ? 1 : 0);
