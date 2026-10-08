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

test('a new profile starts with the maintainer\'s setup for Papa (8 Oct 2026); a saved choice is kept', () => {
  const s = DEFAULT_CUSTOMIZATION.settings;
  assert.deepEqual([s.dwellTimingSet, s.keyboardFeel, s.gazeColors, s.filterPreset, s.showGazeCursor, s.gazeCursorSize, s.gazeOnNavigate, s.calmFullScreenVideo, s.videoRevealHoldMs],
    ['calm', 'familiar', 'soft', 'stable', false, 'medium', 'smart-pause', true, 4000]);
  const service = new CustomizationService();
  service.importJSON(JSON.stringify({ version: DEFAULT_CUSTOMIZATION.version, settings: { dwellTimingSet: 'relaxed', keyboardFeel: 'standard' } }));
  assert.equal(service.getData().settings.keyboardFeel, 'standard');
  assert.equal(service.getData().settings.dwellTimingSet, 'relaxed');
});

test('Familiar keyboard feel persists through export and import without changing speed', () => {
  const service = new CustomizationService();
  service.updateSetting('dwellTimingSet', 'relaxed');
  service.updateSetting('keyboardFeel', 'familiar');
  const restored = new CustomizationService();
  restored.importJSON(service.exportJSON());
  assert.equal(restored.getData().settings.keyboardFeel, 'familiar');
  assert.equal(restored.getData().settings.dwellTimingSet, 'relaxed');
});

test('a speed retired on 8 Oct 2026 loads as the one with its times; an unknown one as Balanced', () => {
  for (const [saved, expected] of [['measured', 'calm'], ['extra_time', 'extra_time'], ['unhurried', 'unhurried'], ['moderate', 'moderate'],
    ['restful', 'restful'], ['leisurely', 'leisurely'], ['brisk', 'brisk'], ['warp', 'balanced']]) {
    const service = new CustomizationService();
    service.importJSON(JSON.stringify({ version: DEFAULT_CUSTOMIZATION.version, settings: { dwellTimingSet: saved } }));
    assert.equal(service.getData().settings.dwellTimingSet, expected, saved);
  }
});

test('invalid saved keyboard feel falls back to Standard; reset restores the default Familiar', () => {
  const service = new CustomizationService();
  service.importJSON(JSON.stringify({ settings: { keyboardFeel: 'unknown' } }));
  assert.equal(service.getData().settings.keyboardFeel, 'standard');
  service.resetToDefaults();
  assert.equal(service.getData().settings.keyboardFeel, 'familiar');
});

test('gaze colours: Soft blue for new profiles, a choice persists, bad values fall back to Standard', () => {
  assert.equal(DEFAULT_CUSTOMIZATION.settings.gazeColors, 'soft');
  const older = new CustomizationService();
  older.importJSON(JSON.stringify({ version: DEFAULT_CUSTOMIZATION.version, settings: { dwellTimingSet: 'relaxed', gazeColors: 'standard' } }));
  assert.equal(older.getData().settings.gazeColors, 'standard');
  for (const choice of ['high_contrast', 'soft']) {
    const service = new CustomizationService();
    service.updateSetting('gazeColors', choice);
    const restored = new CustomizationService();
    restored.importJSON(service.exportJSON());
    assert.equal(restored.getData().settings.gazeColors, choice);
  }
  const bad = new CustomizationService();
  bad.importJSON(JSON.stringify({ settings: { gazeColors: 'purple' } }));
  assert.equal(bad.getData().settings.gazeColors, 'standard');
  bad.updateSetting('gazeColors', 'high_contrast');
  bad.resetToDefaults();
  assert.equal(bad.getData().settings.gazeColors, 'soft');
});

test('Focus is the default design; Serene persists, imports normalize and reset restores Focus', () => {
  assert.equal(DEFAULT_CUSTOMIZATION.settings.designMode, 'focus');
  for (const value of [undefined, null, 'clarity', 'Focus', 42]) {
    const service = new CustomizationService();
    service.importJSON(JSON.stringify({ version: DEFAULT_CUSTOMIZATION.version, settings: { designMode: value, dwellTimingSet: 'relaxed', keyboardFeel: 'familiar' } }));
    assert.equal(service.getData().settings.designMode, 'focus');
    service.updateSetting('designMode', 'serene');
    const restored = new CustomizationService();
    restored.importJSON(service.exportJSON());
    assert.equal(restored.getData().settings.designMode, 'serene');
    assert.equal(restored.getData().settings.dwellTimingSet, 'relaxed');
    assert.equal(restored.getData().settings.keyboardFeel, 'familiar');
    restored.updateSetting('designMode', 'focus');
    assert.equal(restored.getData().settings.designMode, 'focus');
    restored.updateSetting('designMode', 'serene');
    restored.resetToDefaults();
    assert.equal(restored.getData().settings.designMode, 'focus');
  }
});
test('calm full-screen video: on with 4 s for new and older profiles, a choice persists, bad values fall back', () => {
  assert.equal(DEFAULT_CUSTOMIZATION.settings.calmFullScreenVideo, true);
  assert.equal(DEFAULT_CUSTOMIZATION.settings.videoRevealHoldMs, 4000);
  const older = new CustomizationService();
  older.importJSON(JSON.stringify({ version: DEFAULT_CUSTOMIZATION.version, settings: { dwellTimingSet: 'calm' } }));
  assert.equal(older.getData().settings.calmFullScreenVideo, true);
  assert.equal(older.getData().settings.videoRevealHoldMs, 4000);
  const chosen = new CustomizationService();
  chosen.importJSON(JSON.stringify({ version: DEFAULT_CUSTOMIZATION.version, settings: { calmFullScreenVideo: false, videoRevealHoldMs: 3000 } }));
  const again = new CustomizationService();
  again.importJSON(chosen.exportJSON());
  assert.equal(again.getData().settings.calmFullScreenVideo, false);
  assert.equal(again.getData().settings.videoRevealHoldMs, 3000);
  for (const bad of [2500, 10000, 'four', null, -1]) {
    const service = new CustomizationService();
    service.importJSON(JSON.stringify({ version: DEFAULT_CUSTOMIZATION.version, settings: { calmFullScreenVideo: 'yes', videoRevealHoldMs: bad } }));
    assert.equal(service.getData().settings.videoRevealHoldMs, 4000, String(bad));
    assert.equal(service.getData().settings.calmFullScreenVideo, true, 'only false switches it off');
  }
});

test('web search lists: empty for new and older profiles, kept through export and import, cleaned on load, cleared by reset', () => {
  const empty = { personal: { youtube: [], google: [] }, history: { youtube: [], google: [] }, showPopular: true, rememberSearches: true };
  assert.deepEqual(DEFAULT_CUSTOMIZATION.webSearch, empty);
  const older = new CustomizationService();
  older.importJSON(JSON.stringify({ version: DEFAULT_CUSTOMIZATION.version, settings: {} }));
  assert.deepEqual(older.getData().webSearch, empty);
  const service = new CustomizationService();
  service.importJSON(JSON.stringify({
    version: DEFAULT_CUSTOMIZATION.version,
    webSearch: {
      personal: { youtube: [' Mukesh  songs ', 'mukesh songs', ...Array.from({ length: 30 }, (_, i) => `song ${i}`)], google: 'bad' },
      history: { youtube: [{ q: 'rafi', n: 2, t: 5 }] },
      showPopular: false,
    },
  }));
  const loaded = service.getData().webSearch;
  assert.equal(loaded.personal.youtube[0], 'Mukesh songs');
  assert.equal(loaded.personal.youtube.length, 25);
  assert.deepEqual(loaded.personal.google, []);
  assert.equal(loaded.showPopular, false);
  assert.equal(loaded.rememberSearches, true);
  service.recordWebSearch('google', 'weather pune');
  assert.equal(service.getData().webSearch.history.google[0].q, 'weather pune');
  const again = new CustomizationService();
  again.importJSON(service.exportJSON());
  assert.deepEqual(again.getData().webSearch, service.getData().webSearch);
  service.updateWebSearch({ ...service.getData().webSearch, rememberSearches: false });
  service.recordWebSearch('google', 'not kept');
  assert.equal(service.getData().webSearch.history.google.length, 1, 'remembering off keeps nothing new');
  service.resetToDefaults();
  assert.deepEqual(service.getData().webSearch, empty);
});

console.log(`${passed} settings checks passed.`);
