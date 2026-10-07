// Checks the web search keyboard's text rules (src/components/browser/searchText.ts)
// and the YouTube / Google search addresses (src/hooks/useGazeBrowser.ts), 6 Oct 2026.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const load = (file) => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', output)(mod, mod.exports, require);
  return mod.exports;
};

const text = load('src/components/browser/searchText.ts');
const browser = load('src/hooks/useGazeBrowser.ts');
const safety = load('electron/browser/browserSafety.ts');
const { applySearchKey: key, searchedWordsOf, SEARCH_QUERY_MAX } = text;

let checks = 0;
const check = (actual, expected, message) => { checks += 1; assert.equal(actual, expected, message); };
const typeAll = (start, keys) => keys.reduce((value, k) => key(value, k), start);

// 1. Letters, Shift, space, back one letter, back one word.
check(typeAll('', ['l', 'a', 't', 'a']), 'lata', 'letters are typed in lower case');
check(key('', 'l', undefined, true), 'L', 'Shift types one capital');
check(key('', ' ', 'space'), '', 'no leading space');
check(key('lata', ' ', 'space'), 'lata ', 'space after a word');
check(key('lata ', ' ', 'space'), 'lata ', 'never two spaces');
check(key('lata', 'backspace', 'backspace'), 'lat', 'back one letter');
check(key('', 'backspace', 'backspace'), '', 'back on an empty query');
check(key('hi 👍', 'backspace', 'backspace'), 'hi ', 'an emoji is removed whole, never half');
check(key('lata mangeshkar', 'deleteWord', 'deleteWord'), 'lata ', 'back one word');
check(key('lata mangeshkar  ', 'deleteWord', 'deleteWord'), 'lata ', 'back one word past trailing spaces');
check(key('lata', 'deleteWord', 'deleteWord'), '', 'the only word goes');
check(key('', 'deleteWord', 'deleteWord'), '', 'back one word on an empty query');
for (const action of ['shift', 'toggleNumbers', 'speak', 'enter', 'gaze', 'quickWords']) {
  check(key('lata', action, action), 'lata', `${action} types nothing`);
}
check(key('lata', 'something-long'), 'lata', 'an unknown long key types nothing');
check(key('', '9'), '9', 'digits from the 123 page');
check(key('', '😊'), '😊', 'an emoji key');
check(typeAll('', Array(SEARCH_QUERY_MAX + 10).fill('a')).length, SEARCH_QUERY_MAX, `the query stops at ${SEARCH_QUERY_MAX} characters`);
check(key('a'.repeat(SEARCH_QUERY_MAX), ' ', 'space').length, SEARCH_QUERY_MAX, 'space at the limit adds nothing');

// 2. The words already searched, so the keyboard opens with them.
check(searchedWordsOf('https://www.youtube.com/results?search_query=lata+mangeshkar'), 'lata mangeshkar', 'YouTube results');
check(searchedWordsOf('https://m.youtube.com/results?search_query=kishore%20kumar'), 'kishore kumar', 'mobile YouTube results');
check(searchedWordsOf('https://www.google.co.in/search?q=weather+today&sei=x'), 'weather today', 'Google India results');
check(searchedWordsOf('https://www.google.com/search?q=a%20%20%20b'), 'a b', 'extra spaces collapse');
check(searchedWordsOf('https://www.youtube.com/watch?v=abcdefghijk'), '', 'a video page has no search');
check(searchedWordsOf('https://www.youtube.com/'), '', 'YouTube Home has no search');
check(searchedWordsOf('https://evil.example/results?search_query=x'), '', 'another site is ignored');
check(searchedWordsOf('https://notgoogle.com/search?q=x'), '', 'a look-alike host is ignored');
check(searchedWordsOf('https://www.google.com.evil.example/search?q=x'), '', 'a Google-prefixed host is ignored');
check(searchedWordsOf('not a url'), '', 'a malformed address');
check(searchedWordsOf(null), '', 'no page');
check(searchedWordsOf(`https://www.google.com/search?q=${'b'.repeat(400)}`).length, SEARCH_QUERY_MAX, 'a long search is shortened');

// 3. Search addresses: encoded, trimmed, and allowed by the browser's own address rule.
check(browser.youtubeSearchUrl('  lata & kishore '), 'https://www.youtube.com/results?search_query=lata%20%26%20kishore', 'YouTube search address');
check(browser.googleSearchUrl('a/b?c#d'), 'https://www.google.com/search?q=a%2Fb%3Fc%23d', 'Google search address');
check(browser.YOUTUBE_HOME_URL, 'https://www.youtube.com/', 'YouTube Home address');
for (const url of [browser.youtubeSearchUrl('x'), browser.googleSearchUrl('x'), browser.YOUTUBE_HOME_URL]) {
  check(safety.isAllowedPageUrl(url), true, `the page may open ${url}`);
}
const typedBack = searchedWordsOf(browser.youtubeSearchUrl('old songs 1960'));
check(typedBack, 'old songs 1960', 'a search reopens with exactly what was typed');

console.log(`Search keyboard: ${checks} checks passed.`);
