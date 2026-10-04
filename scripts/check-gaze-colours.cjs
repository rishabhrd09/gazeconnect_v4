// The gaze colour palettes (src/config/gazeColors.ts), measured against the themes' own page and
// key colours read from the stylesheets. Contrast is WCAG 2.x (1.4.11 non-text: 3:1 minimum).
// Colour vision: Machado, Oliveira and Fernandes (2009) matrices, severity 1, in linear RGB;
// ring and fill must stay apart by CIE76 delta E (>= 20 already reads as clearly different).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exportsOf = (file) => {
  const exports = {};
  const js = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, { exports, require });
  return exports;
};
const { GAZE_COLOR_PALETTES, gazePalette, normalizeGazeColors } = exportsOf('src/config/gazeColors.ts');

// Theme colours from the stylesheets: the first declaration inside the block that opens with `opener`.
function token(file, opener, name) {
  const css = read(file);
  const start = css.indexOf(opener);
  assert.ok(start >= 0, `${opener} not found in ${file}`);
  const block = css.slice(start, css.indexOf('}', start));
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block);
  assert.ok(m, `--${name} not found in ${opener}`);
  return m[1];
}
const THEMES = {
  dark: { page: token('src/refinement.css', ':root {', 'ui-page'), surface: token('src/refinement.css', ':root {', 'ui-surface') },
  warm: { page: token('src/styles/gazespell-look.css', ":root[data-look='gazespell'][data-theme='warm']", 'ui-page'),
          surface: token('src/styles/gazespell-look.css', ":root[data-look='gazespell'][data-theme='warm']", 'ui-surface') },
  'warm (classic look)': { page: token('src/refinement.css', ":root[data-theme='warm']", 'ui-page'),
          surface: token('src/refinement.css', ":root[data-theme='warm']", 'ui-surface') },
  // Midnight Navy is a dark theme: the cursor takes each palette's Dark set there (GazeCursor.tsx).
  'midnight-navy': { page: token('src/styles/midnight-navy.css', ":root[data-theme='midnight-navy'] {", 'iris-bg'),
          surface: token('src/styles/midnight-navy.css', ":root[data-theme='midnight-navy'] {", 'iris-card') },
};

// The approved designs have their own patient surfaces. Measure the real CSS tokens,
// including the keyboard's recessed and selected surfaces, without changing gaze palettes.
for (const design of ['focus', 'serene']) {
  for (const theme of ['dark', 'warm', 'midnight-navy']) {
    const opener = `:root[data-design='${design}'][data-theme='${theme}']`;
    for (const surface of ['panel', 'card', 'selected', 'danger-bg']) {
      THEMES[`${theme} (${design} ${surface})`] = {
        page: token('src/styles/design-modes.css', opener, 'design-page'),
        surface: token('src/styles/design-modes.css', opener, `design-${surface}`),
      };
    }
  }
}

const rgb = (c) => {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(c);
  if (m) return { rgb: [m[1], m[2], m[3]].map((v) => v / 255), alpha: Number(m[4]) };
  return { rgb: [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255), alpha: 1 };
};
const on = (color, background) => { const f = rgb(color), b = rgb(background).rgb; return f.rgb.map((v, i) => v * f.alpha + b[i] * (1 - f.alpha)); };
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unlin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const lum = (c) => { const [r, g, b] = c.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const CVD = {
  normal: null,
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const simulate = (c, m) => { if (!m) return c; const l = c.map(lin); return m.map((row) => unlin(Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])))); };
const lab = (c) => {
  const [r, g, b] = c.map(lin);
  const xyz = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883];
  const [x, y, z] = xyz.map((t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

let passed = 0;
const test = (name, fn) => { fn(); passed++; };
const measure = (palette, theme) => {
  const { page, surface } = THEMES[theme];
  const ring = on(palette.ring, surface), fill = on(palette.fill, surface), square = on(palette.square, page);
  const bg = rgb(page).rgb, key = rgb(surface).rgb;
  return {
    ringPage: contrast(ring, bg), ringKey: contrast(ring, key), squarePage: contrast(square, bg), squareKey: contrast(on(palette.square, surface), key),
    fillRing: contrast(fill, ring), fillKey: contrast(fill, key),
    apart: Object.fromEntries(Object.entries(CVD).map(([k, m]) => [k, deltaE(simulate(ring, m), simulate(fill, m))])),
  };
};

test('Standard stays exactly the colours used before the choice existed', () => {
  const s = GAZE_COLOR_PALETTES.standard;
  assert.deepEqual([s.dark.ring, s.dark.fill, s.dark.square, s.dark.squareLocked, s.dark.ringShare, s.dark.squarePx],
    ['#FFC247', '#2DD4BF', '#38BDF8', '#2DD4BF', 0.065, 3]);
  assert.deepEqual([s.warm.ring, s.warm.fill, s.warm.square, s.warm.squareLocked],
    ['rgba(255, 255, 255, 0.82)', '#2DD4BF', '#38BDF8', '#2DD4BF']);
  assert.equal(s.dark.confirm, undefined, 'Standard keeps the theme accent for a typed key');
  assert.equal(normalizeGazeColors('purple'), 'standard');
  assert.equal(gazePalette(undefined, true), s.warm);
});

test('Midnight Navy keeps the tested live feedback: the cursor is given the Dark set there', () => {
  const cursor = read('src/components/core/GazeCursor.tsx');
  assert.match(cursor, /const palette = gazePalette\(settings\.gazeColors, isWarm \|\| isLight\);/);
  assert.equal(gazePalette('standard', false), GAZE_COLOR_PALETTES.standard.dark);
  assert.deepEqual([GAZE_COLOR_PALETTES.standard.dark.ring, GAZE_COLOR_PALETTES.standard.dark.fill], ['#FFC247', '#2DD4BF']);
});

const rows = [];
for (const key of Object.keys(GAZE_COLOR_PALETTES)) {
  for (const theme of Object.keys(THEMES)) {
    const palette = GAZE_COLOR_PALETTES[key][theme.startsWith('warm') ? 'warm' : 'dark'];
    const m = measure(palette, theme);
    rows.push({ key, theme, m });
    if (key === 'standard') continue; // Kept as it was; measured and reported below.
    test(`${key} on ${theme}: ring and square clear the page and the keys`, () => {
      for (const [name, value] of Object.entries({ ringPage: m.ringPage, ringKey: m.ringKey, squarePage: m.squarePage, squareKey: m.squareKey })) {
        assert.ok(value >= 4.5, `${key} on ${theme}: ${name} ${value.toFixed(2)}:1 is under 4.5:1`);
      }
    });
    test(`${key} on ${theme}: the fill is seen against the ring it covers or the key round it`, () => {
      assert.ok(Math.max(m.fillRing, m.fillKey) >= 3, `fill ${m.fillRing.toFixed(2)}:1 on ring, ${m.fillKey.toFixed(2)}:1 on key`);
    });
    test(`${key} on ${theme}: ring and fill stay apart for every colour vision`, () => {
      for (const [vision, dE] of Object.entries(m.apart)) assert.ok(dE >= 60, `${vision}: delta E ${dE.toFixed(1)} under 60`);
    });
    test(`${key} on ${theme}: marks at least 2 px wide (WCAG 2.4.13)`, () => {
      assert.ok(palette.squarePx >= 2 && palette.ringShare * 64 >= 4, 'too thin');
    });
  }
}

for (const design of ['focus', 'serene']) {
  for (const theme of ['dark', 'warm', 'midnight-navy']) {
    const opener = `:root[data-design='${design}'][data-theme='${theme}']`;
    const colour = name => rgb(token('src/styles/design-modes.css', opener, `design-${name}`)).rgb;
    test(`${design} ${theme}: primary and supporting text reach 4.5:1 on every card state`, () => {
      for (const ink of ['ink', 'muted']) {
        for (const surface of ['page', 'panel', 'card', 'selected']) {
          const ratio = contrast(colour(ink), colour(surface));
          assert.ok(ratio >= 4.5, `${design} ${theme} ${ink} on ${surface}: ${ratio.toFixed(2)}:1`);
        }
      }
      assert.ok(contrast(colour('danger'), colour('danger-bg')) >= 4.5, 'care phrase text must remain readable');
    });
  }
}

const f = (n) => n.toFixed(1).padStart(5);
console.log('palette        theme                ring:page ring:key square:page square:key fill:ring fill:key | ring~fill dE normal/protan/deutan/tritan');
// (midnight-navy: the Dark set on Navy's page #00102E and card #0A1A36.)
for (const { key, theme, m } of rows) {
  console.log(`${key.padEnd(14)} ${theme.padEnd(20)} ${f(m.ringPage)}    ${f(m.ringKey)}    ${f(m.squarePage)}      ${f(m.squareKey)}    ${f(m.fillRing)}   ${f(m.fillKey)}  | ${Object.values(m.apart).map((d) => d.toFixed(0).padStart(4)).join(' ')}`);
}
const weak = rows.filter((r) => r.key === 'standard' && Math.min(r.m.ringPage, r.m.squarePage) < 3);
if (weak.length) console.log(`note: Standard is under 3:1 on ${weak.map((r) => r.theme).join(', ')} (kept unchanged; High contrast and Soft blue are the choices for Warm).`);
console.log(`${passed} gaze colour checks passed.`);
