// Settings quick fixes (24 Sep 2026): the speech rate as the Voice stepper shows it, in words
// per minute, whatever an older version saved. Loads the real CustomizationService.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
global.window = {};

const root = path.resolve(__dirname, '..');
const { DEFAULT_CUSTOMIZATION } = require(path.join(root, 'src/services/defaultCustomization.ts'));
const { CustomizationService, normalizeSpeechRateWpm } = require(path.join(root, 'src/services/CustomizationService.ts'));

function savedRate(ttsRate) {
  const service = new CustomizationService();
  service.importJSON(JSON.stringify({ version: DEFAULT_CUSTOMIZATION.version, settings: { ...DEFAULT_CUSTOMIZATION.settings, ttsRate } }));
  return service.getData().settings.ttsRate;
}

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

test('new installs speak at the normal 150 words per minute', () => {
  assert.equal(DEFAULT_CUSTOMIZATION.settings.ttsRate, 150);
});

test("an older save's speed multiplier comes back in words per minute", () => {
  assert.equal(savedRate(1), 150);
  assert.equal(savedRate(1.2), 180);
  assert.equal(savedRate(0.5), 80, 'slowest the stepper offers');
});

test("the stepper's broken values (1 + 10, 1 + 20) return to the normal pace, not 400 WPM", () => {
  assert.equal(savedRate(11), 150);
  assert.equal(savedRate(21), 150);
});

test('a saved rate in words per minute is kept, and held inside the stepper range', () => {
  assert.equal(savedRate(180), 180);
  assert.equal(savedRate(400), 250);
  assert.equal(savedRate(60), 80);
});

test('a damaged saved rate falls back to the normal pace', () => {
  for (const bad of ['fast', null, -3, 0]) assert.equal(savedRate(bad), 150, String(bad));
  assert.equal(normalizeSpeechRateWpm(Number.NaN), 150);
});

console.log(`${passed} settings checks passed.`);
