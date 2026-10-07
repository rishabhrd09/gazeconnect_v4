// Search suggestions on the web search keyboard (7 Oct 2026): the popular lists, the saved
// lists and history (limits, repeats, damaged saves), matching and ranking, the three
// places that keep their order, and the bold parts (src/components/browser/searchSuggestions.ts).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const config = require(path.join(root, 'src/config/searchSuggestions.ts'));
const s = require(path.join(root, 'src/components/browser/searchSuggestions.ts'));

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const fresh = () => s.normalizeWebSearch(undefined);
const texts = slots => slots.map(x => (x ? x.text : null));
const first = (typed, target, data = fresh()) => s.suggestSearches(typed, target, data, [], NOW)[0]?.text ?? null;

test('the popular searches are the agreed twenty, ten for each site', () => {
  assert.deepEqual([...config.POPULAR_SEARCHES.youtube], ['Old Hindi songs', 'Lata Mangeshkar songs', 'Kishore Kumar songs', 'Mohammed Rafi songs', 'Jagjit Singh ghazals', 'Morning bhajan', 'Hanuman Chalisa', 'Hindi news live', 'Cricket highlights', 'Ramayan Ramanand Sagar']);
  assert.deepEqual([...config.POPULAR_SEARCHES.google], ['Latest news India', 'World news today', 'Weather today', 'Live cricket score', 'ALS latest research', 'ALS clinical trials India', 'Sensex Nifty today', 'Gold rate today', "Today's panchang", 'Good news today']);
  assert.equal(config.MAX_PERSONAL_SEARCHES, 25);
  assert.equal(config.MAX_SEARCH_HISTORY, 50);
  assert.equal(config.SEARCH_SUGGESTION_SLOTS, 3);
});

test('a missing or damaged section becomes empty lists, popular on and remembering on', () => {
  for (const raw of [undefined, null, 'x', 7, [], { personal: 'no', history: { youtube: 'bad' } }]) {
    const data = s.normalizeWebSearch(raw);
    assert.deepEqual(data.personal, { youtube: [], google: [] });
    assert.deepEqual(data.history, { youtube: [], google: [] });
    assert.equal(data.showPopular, true);
    assert.equal(data.rememberSearches, true);
  }
  const off = s.normalizeWebSearch({ showPopular: false, rememberSearches: false });
  assert.equal(off.showPopular, false);
  assert.equal(off.rememberSearches, false);
});

test('saved lists are trimmed, without repeats, within 25 and 50 entries and 120 characters', () => {
  const long = 'a'.repeat(200);
  const data = s.normalizeWebSearch({
    personal: { youtube: ['  Lata   songs ', 'lata songs', '', 7, long, ...Array.from({ length: 40 }, (_, i) => `song ${i}`)], google: ['Weather'] },
    history: { youtube: [{ q: 'Rafi', n: 3, t: NOW }, { q: 'rafi', n: 9, t: NOW }, { q: '', n: 1 }, { q: 'kishore', n: 'x', t: -5 }, ...Array.from({ length: 80 }, (_, i) => ({ q: `old ${i}`, n: 1, t: NOW - i }))] },
  });
  assert.equal(data.personal.youtube[0], 'Lata songs');
  assert.equal(data.personal.youtube.length, 25);
  assert.equal(data.personal.youtube[1].length, 120, 'a long entry is cut to 120 characters');
  assert.deepEqual(data.personal.google, ['Weather']);
  assert.equal(data.history.youtube.length, 50);
  assert.deepEqual(data.history.youtube[0], { q: 'Rafi', n: 3, t: NOW });
  assert.deepEqual(data.history.youtube[1], { q: 'kishore', n: 1, t: 0 });
});

test('a search is remembered first; again counts up; remembering off or empty changes nothing', () => {
  let data = fresh();
  data = s.recordSearch(data, 'youtube', ' lata  mangeshkar ', NOW);
  data = s.recordSearch(data, 'youtube', 'kishore', NOW + 1);
  data = s.recordSearch(data, 'youtube', 'Lata Mangeshkar', NOW + 2);
  assert.deepEqual(data.history.youtube.map(e => [e.q, e.n]), [['Lata Mangeshkar', 2], ['kishore', 1]]);
  assert.deepEqual(data.history.google, []);
  assert.equal(s.recordSearch(data, 'youtube', '   ', NOW), data);
  const off = { ...data, rememberSearches: false };
  assert.equal(s.recordSearch(off, 'youtube', 'new', NOW), off);
  for (let i = 0; i < 70; i++) data = s.recordSearch(data, 'google', `q ${i}`, NOW + i);
  assert.equal(data.history.google.length, 50);
  assert.equal(data.history.google[0].q, 'q 69');
});

test("the person's list: add, refuse empty / repeated / full, remove, move, clear history", () => {
  let data = fresh();
  let result = s.addPersonalSearch(data, 'youtube', '  Bhajan by Anup Jalota ');
  assert.equal(result.error, undefined);
  data = result.data;
  assert.deepEqual(data.personal.youtube, ['Bhajan by Anup Jalota']);
  assert.equal(s.addPersonalSearch(data, 'youtube', '   ').error, 'empty');
  assert.equal(s.addPersonalSearch(data, 'youtube', 'bhajan BY anup jalota').error, 'duplicate');
  for (let i = 0; i < 24; i++) data = s.addPersonalSearch(data, 'youtube', `entry ${i}`).data;
  assert.equal(data.personal.youtube.length, 25);
  assert.equal(s.addPersonalSearch(data, 'youtube', 'one more').error, 'full');
  data = s.movePersonalSearch(data, 'youtube', 1, -1);
  assert.equal(data.personal.youtube[0], 'entry 0');
  assert.equal(s.movePersonalSearch(data, 'youtube', 0, -1), data);
  data = s.removePersonalSearch(data, 'youtube', 0);
  assert.equal(data.personal.youtube[0], 'Bhajan by Anup Jalota');
  data = s.recordSearch(s.recordSearch(data, 'youtube', 'a', NOW), 'google', 'b', NOW);
  assert.deepEqual(s.clearSearchHistory(data, 'youtube').history.youtube, []);
  assert.equal(s.clearSearchHistory(data, 'youtube').history.google.length, 1);
  assert.deepEqual(s.clearSearchHistory(data).history, { youtube: [], google: [] });
});

test('matching: start, any word order, one slipped letter, anywhere -- never what is already typed', () => {
  assert.equal(first('lat', 'youtube'), 'Lata Mangeshkar songs');
  assert.equal(first('songs lata', 'youtube'), 'Lata Mangeshkar songs');
  assert.equal(first('kishor', 'youtube'), 'Kishore Kumar songs');
  assert.equal(first('lsta', 'youtube'), 'Lata Mangeshkar songs', 'one wrong letter');
  assert.equal(first('ghaz', 'youtube'), 'Jagjit Singh ghazals');
  assert.equal(first('chalisa', 'youtube'), 'Hanuman Chalisa');
  assert.equal(first('wea', 'google'), 'Weather today');
  assert.equal(first('todays', 'google'), "Today's panchang");
  assert.equal(first('als tri', 'google'), 'ALS clinical trials India');
  assert.deepEqual(texts(s.suggestSearches('qzxv', 'youtube', fresh(), [], NOW)), [null, null, null]);
  assert.ok(!texts(s.suggestSearches('cricket highlights', 'youtube', fresh(), [], NOW)).includes('Cricket highlights'));
  const google = texts(s.suggestSearches('today', 'google', fresh(), [], NOW));
  assert.equal(google.filter(Boolean).length, 3);
  assert.deepEqual(google, texts(s.suggestSearches('today', 'google', fresh(), [], NOW)), 'the same text gives the same suggestions');
});

test("ranking: the person's list, then past searches (often and lately first), then popular", () => {
  let data = s.addPersonalSearch(fresh(), 'youtube', 'Lata Mangeshkar bhajans').data;
  assert.equal(first('lata', 'youtube', data), 'Lata Mangeshkar bhajans');
  let past = fresh();
  for (let i = 0; i < 5; i++) past = s.recordSearch(past, 'youtube', 'lata mangeshkar sad songs', NOW - 2 * DAY);
  const shown = texts(s.suggestSearches('lata', 'youtube', past, [], NOW));
  assert.equal(shown[0], 'lata mangeshkar sad songs');
  assert.ok(shown.includes('Lata Mangeshkar songs'));
  const hidden = s.suggestSearches('lata', 'youtube', { ...fresh(), showPopular: false }, [], NOW);
  assert.deepEqual(texts(hidden), [null, null, null], 'popular off: nothing popular is offered');
  data = s.recordSearch(s.addPersonalSearch(fresh(), 'youtube', 'Lata songs').data, 'youtube', 'lata songs', NOW);
  const merged = s.suggestSearches('la', 'youtube', data, [], NOW).filter(Boolean);
  assert.equal(merged.filter(x => x.text.toLowerCase() === 'lata songs').length, 1, 'a listed search is offered once');
  assert.equal(merged[0].source, 'personal');
});

test('before typing: the most used of the list, the latest search and a popular one, in turn', () => {
  let data = fresh();
  data = s.addPersonalSearch(data, 'youtube', 'Pankaj Udhas ghazals').data;
  data = s.addPersonalSearch(data, 'youtube', 'Mukesh songs').data;
  data = s.recordSearch(data, 'youtube', 'mukesh songs', NOW - DAY);
  data = s.recordSearch(data, 'youtube', 'talat mahmood', NOW);
  assert.deepEqual(texts(s.suggestSearches('', 'youtube', data, [], NOW)), ['Mukesh songs', 'talat mahmood', 'Old Hindi songs']);
  assert.deepEqual(texts(s.suggestSearches('', 'google', fresh(), [], NOW)), ['Latest news India', 'World news today', 'Weather today']);
});

test('a suggestion still among the best three keeps its place; empty places stay empty', () => {
  const data = fresh();
  const before = s.suggestSearches('so', 'youtube', data, [], NOW);
  assert.equal(before.filter(Boolean).length, 3);
  const next = s.suggestSearches('son', 'youtube', data, before, NOW);
  for (let i = 0; i < 3; i++) {
    if (before[i] && next.some(x => x && x.text === before[i].text)) assert.equal(next[i] && next[i].text, before[i].text, `place ${i} moved`);
  }
  const shuffled = [before[2], before[0], before[1]];
  const kept = s.suggestSearches('so', 'youtube', data, shuffled, NOW);
  assert.deepEqual(texts(kept), texts(shuffled), 'the places follow what was shown, not the ranking');
  const one = s.suggestSearches('hanuman', 'youtube', data, [], NOW);
  assert.deepEqual(texts(one), ['Hanuman Chalisa', null, null]);
});

test('the typed beginnings are marked for bold type', () => {
  assert.deepEqual(s.suggestionParts('Lata Mangeshkar songs', 'lata mang'), [
    { text: 'Lata', strong: true }, { text: ' ', strong: false }, { text: 'Mang', strong: true }, { text: 'eshkar songs', strong: false },
  ]);
  assert.deepEqual(s.suggestionParts("Today's panchang", 'today'), [{ text: 'Today', strong: true }, { text: "'s panchang", strong: false }]);
  assert.deepEqual(s.suggestionParts('Weather today', ''), [{ text: 'Weather today', strong: false }]);
});

test('fast enough for every key: 25 listed, 50 remembered, 10 popular, 2000 times under 1 s', () => {
  let data = fresh();
  for (let i = 0; i < 25; i++) data = s.addPersonalSearch(data, 'youtube', `personal entry number ${i}`).data;
  for (let i = 0; i < 50; i++) data = s.recordSearch(data, 'youtube', `remembered search ${i}`, NOW - i);
  const t0 = process.hrtime.bigint();
  let previous = [];
  for (let i = 0; i < 2000; i++) previous = s.suggestSearches(['p', 'pe', 'per', 'r', 're', 'rem'][i % 6], 'youtube', data, previous, NOW);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms for 2000 keys`);
  console.log(`      ${(ms / 2000).toFixed(3)} ms a key`);
});

console.log(`\nSearch suggestions: ${passed} checks passed.`);
