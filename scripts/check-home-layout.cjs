// Home layout settings: the retired four-card mode, the word bar's shape and its first-run
// seeding, as the real CustomizationService loads them from a saved settings file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// TypeScript sources load directly (type-only imports vanish in the transpile).
require.extensions['.ts'] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
// The service saves through Electron after a short delay; there is no Electron here.
global.window = {};

const root = path.resolve(__dirname, '..');
const { DEFAULT_CUSTOMIZATION } = require(path.join(root, 'src/services/defaultCustomization.ts'));
const { CustomizationService, normalizeHomeWordBar } = require(path.join(root, 'src/services/CustomizationService.ts'));

// What an earlier version wrote to disk: the service reads it through importJSON,
// the same merge the start-up load uses.
function loadSaved(saved) {
  const service = new CustomizationService();
  service.importJSON(JSON.stringify(saved));
  return service;
}
const oldFile = (extra = {}) => ({
  version: DEFAULT_CUSTOMIZATION.version,
  settings: { ...DEFAULT_CUSTOMIZATION.settings, homeEmergencyLaunchMode: 'cards' },
  homeEmergencyCards: DEFAULT_CUSTOMIZATION.homeEmergencyCards,
  ...extra,
});

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

test('new installs start with Quick Phrases only and the word bar off', () => {
  assert.equal(DEFAULT_CUSTOMIZATION.settings.homeEmergencyLaunchMode, 'quick');
  const bar = DEFAULT_CUSTOMIZATION.homeWordBar;
  assert.equal(bar.enabled, false);
  assert.equal(bar.layout, '3+2');
  assert.equal(bar.words.length, 4);
  assert.equal(bar.phrases.length, 2);
});

test('a saved four-card layout comes back as the Urgent Needs card, never as nothing', () => {
  const data = loadSaved(oldFile()).getData();
  assert.equal(data.settings.homeEmergencyLaunchMode, 'alert');
});

test('a file saved before the left-panel choice existed keeps the Urgent Needs card', () => {
  const settings = { ...DEFAULT_CUSTOMIZATION.settings };
  delete settings.homeEmergencyLaunchMode;
  assert.equal(loadSaved(oldFile({ settings })).getData().settings.homeEmergencyLaunchMode, 'alert');
  assert.equal(loadSaved(oldFile({ settings: undefined })).getData().settings.homeEmergencyLaunchMode, 'alert');
});

test('a saved Urgent Needs or Quick-Phrases-only choice is kept as it was', () => {
  for (const mode of ['alert', 'quick']) {
    const data = loadSaved(oldFile({ settings: { ...DEFAULT_CUSTOMIZATION.settings, homeEmergencyLaunchMode: mode } })).getData();
    assert.equal(data.settings.homeEmergencyLaunchMode, mode);
  }
});

test("on first load the word bar's phrases are the caregiver's own enabled emergency cards", () => {
  const cards = [
    { en: '  Call the nurse ', hi: '', enabled: true, priority: 'high' },
    { en: 'Not this one', hi: '', enabled: false, priority: 'high' },
    { en: 'Turn me over', hi: '', enabled: true, priority: 'medium' },
    { en: 'A third one', hi: '', enabled: true, priority: 'high' },
  ];
  const bar = loadSaved(oldFile({ homeEmergencyCards: cards })).getData().homeWordBar;
  assert.deepEqual(bar.phrases, ['Call the nurse', 'Turn me over']);
  assert.deepEqual(bar.words, DEFAULT_CUSTOMIZATION.homeWordBar.words);
  assert.equal(bar.enabled, false, 'switched on by nobody');
});

test('with no usable emergency cards the word bar falls back to the default phrases', () => {
  for (const homeEmergencyCards of [[], [{ en: '   ', hi: '', enabled: true, priority: 'high' }], undefined]) {
    const bar = loadSaved(oldFile({ homeEmergencyCards })).getData().homeWordBar;
    assert.deepEqual(bar.phrases, DEFAULT_CUSTOMIZATION.homeWordBar.phrases);
  }
});

test('a saved word bar keeps its choices, and is always four words and two phrases', () => {
  const saved = { enabled: true, layout: '4+2', words: ['Yes', 'Tea'], phrases: ['Please sit me up', 'I am cold', 'extra'] };
  const bar = loadSaved(oldFile({ homeWordBar: saved })).getData().homeWordBar;
  assert.equal(bar.enabled, true);
  assert.equal(bar.layout, '4+2');
  assert.deepEqual(bar.words, ['Yes', 'Tea', '', '']);
  assert.deepEqual(bar.phrases, ['Please sit me up', 'I am cold']);
});

test('a damaged saved word bar cannot switch itself on or take an unknown layout', () => {
  const bar = normalizeHomeWordBar(
    { enabled: 'yes', layout: '5+5', words: ['Ok', 7, null, { a: 1 }, 'five'], phrases: 'nope' },
    undefined, DEFAULT_CUSTOMIZATION.homeWordBar);
  assert.equal(bar.enabled, false);
  assert.equal(bar.layout, '3+2');
  assert.deepEqual(bar.words, ['Ok', '', '', '']);
  assert.deepEqual(bar.phrases, ['', '']);
});

test('the word bar survives a backup and restore unchanged', () => {
  const service = new CustomizationService();
  service.updateHomeWordBar({ enabled: true, layout: '4+2', words: ['Yes', 'No', 'Help', 'Water'], phrases: ['TT Suction', 'Pain'] });
  const exported = service.exportJSON();
  assert.match(exported, /"homeWordBar"/);
  const restored = loadSaved(JSON.parse(exported)).getData().homeWordBar;
  assert.deepEqual(restored, service.getData().homeWordBar);
});

console.log(`${passed} home layout checks passed.`);
// importJSON schedules a save for later; nothing is left to wait for here.
process.exit(0);
