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

// ---- Midnight Navy (28 Sep 2026): a third, optional display mode --------------------------------
const vm = require('node:vm');
const ts = require('typescript');
function loadModule(file, stubs = {}, context = {}) {
  const js = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const req = (name) => { if (!(name in stubs)) throw new Error(`unexpected import ${name} in ${file}`); return stubs[name]; };
  vm.runInNewContext(js, { exports: module.exports, module, require: req, ...context }, { filename: file });
  return module.exports;
}
/** Runs the real ThemeProvider once with stub hooks: what it applies, saves and reports. */
function provideTheme({ saved, isLoaded = true, isDarkMode = true }) {
  const storage = new Map(saved === undefined ? [] : [['gc-theme', saved]]);
  const localStorage = { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };
  const element = () => ({ dataset: {}, classes: new Set(), get classList() {
    const set = this.classes;
    return { remove: (...c) => c.forEach(x => set.delete(x)), toggle: (c, on) => (on ? set.add(c) : set.delete(c)) };
  } });
  const document = { documentElement: element(), body: element() };
  const updates = [];
  let value = null;
  const stubs = {
    react: {
      createContext: v => ({ value: v }), useContext: c => c.current ?? c.value,
      useState: init => [typeof init === 'function' ? init() : init, () => {}],
      useCallback: fn => fn, useLayoutEffect: fn => fn(),
    },
    'react/jsx-runtime': { jsx: (_type, props) => { value = props.value; return null; }, jsxs: () => null, Fragment: 'fragment' },
    './CustomizationContext': { useCustomization: () => ({ isLoaded, settings: { isDarkMode }, updateSetting: (k, v) => updates.push([k, v]) }) },
    '../config/designMode': loadModule('src/config/designMode.ts'),
    '../utils/design': { darkColors: { name: 'dark' }, midnightNavyColors: { name: 'midnight-navy' } },
  };
  const mod = loadModule('src/contexts/ThemeContext.tsx', stubs, { localStorage, document });
  mod.ThemeProvider({ children: null });
  mod.ThemeContext.current = value;
  return { mod, value, updates, html: document.documentElement, saved: storage.get('gc-theme') };
}
const NAVY = "[data-theme='midnight-navy']";
const { normalizeTheme, isDarkTheme } = provideTheme({ saved: 'dark' }).mod;

test('three themes: saved values keep their meaning and anything else is Dark', () => {
  const expected = { dark: 'dark', warm: 'warm', light: 'warm', 'midnight-navy': 'midnight-navy', mix: 'dark', navy: 'dark', 'Midnight-Navy': 'dark', purple: 'dark', '': 'dark' };
  for (const [saved, theme] of Object.entries(expected)) assert.equal(normalizeTheme(saved), theme, saved);
  assert.equal(normalizeTheme(null), 'dark');
  assert.deepEqual(['dark', 'warm', 'midnight-navy'].map(isDarkTheme), [true, false, true]);
});

test('the pre-paint script in index.html applies the same theme before React starts', () => {
  const script = /<script>\s*([\s\S]*?)<\/script>/.exec(read('index.html'))[1];
  for (const saved of [null, '', 'dark', 'warm', 'light', 'mix', 'midnight-navy', 'navy', 'purple']) {
    const html = { attrs: {}, classes: [], setAttribute(k, v) { this.attrs[k] = v; } };
    html.classList = { add: c => html.classes.push(c) };
    vm.runInNewContext(script, { localStorage: { getItem: () => saved }, document: { documentElement: html } });
    const theme = saved ? normalizeTheme(saved) : 'dark';
    assert.equal(html.attrs['data-theme'], theme, String(saved));
    assert.deepEqual(html.classes, [`theme-${theme}`], String(saved));
  }
});

test('Midnight Navy is applied, saved, and keeps settings.isDarkMode true for older screens', () => {
  const navy = provideTheme({ saved: 'midnight-navy', isDarkMode: false });
  assert.equal(navy.html.dataset.theme, 'midnight-navy');
  assert.deepEqual([...navy.html.classes], ['theme-midnight-navy']);
  assert.equal(navy.saved, 'midnight-navy');
  assert.deepEqual(navy.updates, [['isDarkMode', true]], 'a Navy screen must not paint light (Warm) inline colours');
  assert.equal(navy.value.isMidnightNavy, true);
  assert.equal(navy.value.isWarm, false);
  assert.equal(navy.mod.useDarkPalette().name, 'midnight-navy');
  assert.deepEqual(provideTheme({ saved: 'midnight-navy', isDarkMode: true }).updates, []);
  // Dark and Warm behave as before.
  const dark = provideTheme({ saved: 'dark', isDarkMode: false });
  assert.deepEqual([dark.html.dataset.theme, dark.updates, dark.mod.useDarkPalette().name], ['dark', [['isDarkMode', true]], 'dark']);
  assert.deepEqual([...dark.html.classes], ['theme-dark']);
  const warm = provideTheme({ saved: 'light', isDarkMode: true });
  assert.deepEqual([warm.html.dataset.theme, warm.saved, warm.updates], ['warm', 'warm', [['isDarkMode', false]]]);
  // Nothing saved yet: the settings file decides, as before.
  assert.equal(provideTheme({ saved: undefined, isDarkMode: false }).html.dataset.theme, 'warm');
  assert.equal(provideTheme({ saved: undefined, isDarkMode: true }).html.dataset.theme, 'dark');
  assert.equal(provideTheme({ saved: 'purple', isDarkMode: true }).html.dataset.theme, 'dark');
});

test('Display and the classic Appearance offer the three themes; Display reset returns to Dark', () => {
  const pages = read('src/components/settings/grouped/GroupedSettingsPages.tsx');
  const options = pages.slice(pages.indexOf('const THEME_OPTIONS'), pages.indexOf('export const DisplayPage'));
  assert.deepEqual([...options.matchAll(/value: '([\w-]+)'/g)].map(m => m[1]), ['warm', 'dark', 'midnight-navy']);
  assert.match(options, /label: 'Midnight Navy', sub: 'Matte deep navy, pale text, and quiet blue accents\.'/);
  assert.match(pages, /role="radio" aria-checked=\{checked\} className="gss-option gss-theme"\s+aria-label=\{option\.label\} aria-describedby=/);
  const classic = read('src/components/settings/panels/AppSettingsPanel.tsx');
  const appearances = classic.slice(classic.indexOf('const APPEARANCES'), classic.indexOf('];', classic.indexOf('const APPEARANCES')));
  assert.deepEqual([...appearances.matchAll(/value: '([\w-]+)'/g)].map(m => m[1]), ['warm', 'dark', 'midnight-navy']);
  assert.match(read('src/refinement.css'), /\.theme-swatch-midnight-navy \{/);
  assert.match(read('src/components/settings/grouped/GroupedSettingsLayout.tsx'), /setTheme\(defaults\.isDarkMode \? 'dark' : 'warm'\);/);
  assert.match(read('src/services/defaultCustomization.ts'), /isDarkMode: true,/);
  assert.match(read('src/styles/settings-grouped.css'), /\.gss-themes \{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
});

test("every Midnight Navy rule needs data-theme='midnight-navy', so Dark and Warm cannot change", () => {
  assert.match(read('src/App.tsx'), /import '\.\/styles\/gazespell-look\.css';\s+import '\.\/styles\/midnight-navy\.css';/);
  const all = selectors(read('src/styles/midnight-navy.css'));
  assert.ok(all.length > 100, `found ${all.length} selectors`);
  assert.deepEqual(all.filter(s => !s.startsWith(':root') || !s.includes(NAVY)), []);
});

test('Midnight Navy paints and sets type only: no rule sizes or moves anything', () => {
  const css = read('src/styles/midnight-navy.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const paint = /^(--[\w-]+|color|color-scheme|background|background-color|background-image|border-color|border-(top|right|bottom|left)-color|border-radius|box-shadow|outline-color|font-weight|letter-spacing|line-height|fill|stroke)$/;
  const bad = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1].trim();
    for (const decl of m[2].split(';').map(d => d.trim()).filter(Boolean)) {
      const prop = decl.slice(0, decl.indexOf(':')).trim();
      // Settings is mouse only: Iris's caregiver type scale may set its sizes.
      if (prop === 'font-size' && prelude.includes('.gss-')) continue;
      if (!paint.test(prop)) bad.push(`${prelude.slice(0, 60)} { ${prop} }`);
    }
  }
  assert.deepEqual(bad, []);
});

test("Midnight Navy uses Iris's exact palette, in the stylesheet and in src/config/midnightNavy.ts", () => {
  const IRIS = {
    'iris-bg': '#00102E', 'iris-bg-edge': '#000918', 'iris-bg-outer': '#000B24', 'iris-bg-inner': '#00102E', 'iris-bg-centre': '#001538',
    'iris-nav-bg': '#000918', 'iris-draft-bg': '#08162D', 'iris-card': '#0A1A36', 'iris-card-edge': '#223A61', 'iris-card-live': '#17305A',
    'iris-inset': '#17305A', 'iris-text-primary': '#F3F5F8', 'iris-text-secondary': '#96AAD2', 'iris-text-muted': '#8D9DB8',
    'iris-text-bright': '#FFFFFF', 'iris-icon': '#DCE7F5', 'iris-ring': '#162A4B', 'iris-divider': '#415270', 'iris-outline': '#415270',
    'iris-accent': '#C2D3EE', 'iris-action': '#17305A', 'iris-action-ink': '#F3F5F8', 'iris-progress-track': '#203756',
    'iris-progress-fill': '#C2D3EE', 'state-ok': '#8FBFA0', 'state-warn': '#C9A96A', 'state-danger': '#D08C82', 'state-info': '#C2D3EE',
    'state-note': '#8FA6D0', 'scene-eye': '#E8EDF3', 'scene-cyan': '#3D5F8F', 'scene-teal': '#4E77AA', 'scene-violet': '#42558B',
    'scene-amber': '#7E7396', 'scene-pink': '#6C6796', 'scene-red': '#8A5F72',
  };
  const css = read('src/styles/midnight-navy.css');
  const start = css.indexOf(`:root${NAVY} {`);
  const block = css.slice(start, css.indexOf('}', start));
  const tokens = Object.fromEntries([...block.matchAll(/--((?:iris|state|scene)-[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(tokens, IRIS);
  assert.match(block, /--iris-page-gradient: radial-gradient\(ellipse 52% 48% at 50% 53%, var\(--iris-bg-centre\) 0%, var\(--iris-bg-inner\) 38%, var\(--iris-bg-outer\) 66%, var\(--iris-bg-edge\) 100%\);/);
  assert.match(block, /--ui-page: var\(--iris-bg\);[\s\S]*--ui-surface: var\(--iris-card\);[\s\S]*--ui-accent: #2DD4BF;/);
  const { MIDNIGHT_NAVY, MIDNIGHT_NAVY_PAGE_GRADIENT } = loadModule('src/config/midnightNavy.ts');
  const camel = k => k.replace(/^iris-/, '').replace(/^state-(\w)/, (_, c) => `state${c.toUpperCase()}`).replace(/-(\w)/g, (_, c) => c.toUpperCase());
  for (const [k, v] of Object.entries(IRIS)) if (!k.startsWith('scene-')) assert.equal(MIDNIGHT_NAVY[camel(k)], v, k);
  assert.equal(MIDNIGHT_NAVY_PAGE_GRADIENT, 'radial-gradient(ellipse 52% 48% at 50% 53%, #001538 0%, #00102E 38%, #000B24 66%, #000918 100%)');
});

test('the keyboard design layer changes only colours, never geometry, type or gaze feedback', () => {
  const css = read('src/styles/keyboard-design-colors.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const selector of selectors(css)) {
    assert.ok(selector.startsWith(':root[data-design][data-theme][data-look] #root .keyboard-screen'), selector);
    assert.ok(!selector.includes('data-cursor'), 'live cursor must stay outside the keyboard paint layer');
  }
  const colours = /^(--kb-ink|background|background-color|color|border-color|stroke)$/;
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const declaration of rule[2].split(';').map(s => s.trim()).filter(Boolean)) {
      const property = declaration.slice(0, declaration.indexOf(':')).trim();
      assert.ok(colours.test(property), `${property} is not a keyboard colour`);
    }
  }
  assert.match(read('src/App.tsx'), /import '\.\/styles\/design-modes\.css';\s+import '\.\/styles\/keyboard-design-colors\.css';/);
});

console.log(`${passed} look checks passed.`);
