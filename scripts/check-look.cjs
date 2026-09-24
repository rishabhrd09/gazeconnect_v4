// The GazeSpell look (24 Sep 2026) must stay one switch: with APP_LOOK = 'classic' none of its
// styles apply, and the grouped Settings still offers every setting the classic Settings has.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/** Every selector of every style rule, including rules inside @media. */
function selectors(css) {
  const out = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      const prelude = text.slice(start, i).trim();
      const kind = prelude.startsWith('@media') || prelude.startsWith('@supports') ? 'group' : prelude.startsWith('@') ? 'at' : 'rule';
      if (kind === 'rule' && !stack.includes('at')) out.push(...splitTopLevel(prelude));
      stack.push(kind);
      start = i + 1;
    } else if (ch === '}') {
      stack.pop();
      start = i + 1;
    } else if (ch === ';' && stack[stack.length - 1] !== 'rule') {
      start = i + 1;
    }
  }
  return out.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function splitTopLevel(list) {
  const parts = [];
  let depth = 0, from = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++;
    else if (list[i] === ')') depth--;
    else if (list[i] === ',' && depth === 0) { parts.push(list.slice(from, i)); from = i + 1; }
  }
  parts.push(list.slice(from));
  return parts;
}

const LOOK = "[data-look='gazespell']";
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

test('one switch chooses the look, before the first paint', () => {
  const look = read('src/config/look.ts');
  const value = /export const APP_LOOK = '(\w+)' as AppLook;/.exec(look);
  assert.ok(value, 'APP_LOOK is declared');
  assert.ok(['gazespell', 'classic'].includes(value[1]), `APP_LOOK is ${value[1]}`);
  assert.match(read('src/main.tsx'), /document\.documentElement\.dataset\.look = APP_LOOK;/);
});

test("every rule of the redesign stylesheet needs data-look='gazespell'", () => {
  const all = selectors(read('src/styles/gazespell-look.css'));
  assert.ok(all.length > 100, `found ${all.length} selectors`);
  const loose = all.filter(s => !s.includes(LOOK));
  assert.deepEqual(loose, []);
});

test('the grouped Settings styles touch only its own classes, or need the look', () => {
  const all = selectors(read('src/styles/settings-grouped.css'));
  assert.ok(all.length > 50, `found ${all.length} selectors`);
  const loose = all.filter(s => {
    if (s.includes(LOOK)) return false;
    const classes = s.match(/\.[A-Za-z_][\w-]*/g) || [];
    return classes.length === 0 || classes.some(c => !c.startsWith('.gss-'));
  });
  assert.deepEqual(loose, []);
});

test('the grouped Settings keeps every classic Settings page', () => {
  const classic = [...read('src/screens/SettingsScreen.tsx').matchAll(/\{ id: '(\w+)', label: '[^']+', icon: \w+ \}/g)].map(m => m[1]);
  assert.ok(classic.length >= 9, `classic sections: ${classic}`);
  const grouped = [...read('src/components/settings/grouped/settingsPages.ts').matchAll(/page\('(\w+)'/g)].map(m => m[1]);
  // App Settings became three pages: Eye Gaze, Voice and Display.
  const missing = classic.filter(id => id !== 'appsettings' && !grouped.includes(id));
  assert.deepEqual(missing, []);
  for (const id of ['gaze', 'voice', 'display', 'backup', 'reset', 'about']) assert.ok(grouped.includes(id), id);
});

test('Eye Gaze, Voice and Display offer every App Settings control', () => {
  const classic = [...read('src/components/settings/panels/AppSettingsPanel.tsx').matchAll(/updateSetting\('(\w+)'/g)].map(m => m[1]);
  assert.ok(classic.length >= 6, `classic controls: ${classic}`);
  const pages = read('src/components/settings/grouped/GroupedSettingsPages.tsx');
  const grouped = [...pages.matchAll(/save\('(\w+)'/g)].map(m => m[1]);
  assert.deepEqual([...new Set(classic)].filter(key => !grouped.includes(key)), []);
  assert.match(pages, /setTheme\(option\.value\)/, 'the theme choice');
});

console.log(`${passed} look checks passed.`);
