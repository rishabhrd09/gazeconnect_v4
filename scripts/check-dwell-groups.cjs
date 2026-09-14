// Regression coverage for the fixed selection model and legacy safeguard loading.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function loadTs(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  const mod = new Module(filename, module);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
  return mod.exports;
}
const dwell = loadTs('src/config/dwellTimeConfig.ts');
const filters = loadTs('src/config/gazeFilterConfig.ts');
const allowed = [500, 1000, 1250, 1500, 2000];
const storage = values => ({ getItem: key => values[key] ?? null });
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
test('every action resolves to one of exactly five durations', () => {
  const durations = Object.keys(dwell.DWELL_ACTION_GROUPS).map(dwell.dwellForAction);
  assert.deepEqual([...new Set(durations)].sort((a, b) => a - b), allowed);
});
test('typing, communication, navigation and deliberate actions stay distinct', () => {
  for (const context of ['keyboard', 'keyboardKey']) assert.equal(dwell.dwellForContext(context), 500);
  for (const context of ['prediction', 'predictionButton', 'spatialZone']) assert.equal(dwell.dwellForContext(context), 1000);
  for (const context of ['quickWord', 'medicalUrgent', 'phrases']) assert.equal(dwell.dwellForContext(context), 1250);
  for (const context of ['surveyOption', 'compass-map', 'settings', 'navigation']) assert.equal(dwell.dwellForContext(context), 1500);
  for (const context of ['gazeToggle', 'deliberateAction', 'emergency']) assert.equal(dwell.dwellForContext(context), 2000);
});
test('unknown DOM contexts cannot access object prototype properties', () => {
  for (const context of ['__proto__', 'constructor', 'unknown', '']) assert.equal(dwell.dwellForContext(context), 1500);
});
test('legacy explicit overrides cannot create extra durations', () => {
  for (let ms = 1; ms < 6000; ms += 37) assert(allowed.includes(dwell.fixedDwell(ms)));
  for (const invalid of [NaN, Infinity, -20, 0]) assert.equal(dwell.fixedDwell(invalid, 1250), 1250);
  assert.equal(dwell.fixedDwell(1755), 2000);
  assert.equal(dwell.fixedDwell(2500), 2000);
});
test('native browser accepts exactly the same five durations', () => {
  for (const file of ['electron/main.ts', 'electron/browser/browserGazeController.ts']) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    assert(source.includes('[' + allowed.join(', ') + '].includes('), file);
  }
});
test('old per-button sliders and repeat arrays cannot override fixed durations', () => {
  const saved = Object.fromEntries(Object.keys(dwell.DWELL_ACTION_GROUPS).map(key => [key, 99999]));
  const result = dwell.loadDwellPreferences(storage({ gazeconnect_dwell_settings: JSON.stringify({ ...saved, repeatDwellEnabled: true, repeatDwellTimes: [0, 50], onsetDelay: 450, cooldownAfterActivation: 600 }), gazeconnect_als_stage: 'late_als' }));
  for (const action of Object.keys(dwell.DWELL_ACTION_GROUPS)) assert.equal(result.settings[action], dwell.dwellForAction(action));
  assert.equal(result.settings.onsetDelay, 450);
  assert.equal(result.settings.cooldownAfterActivation, 600);
  assert.equal(result.currentStage, 'late_als');
  assert.equal(result.settings.repeatDwellTimes, undefined);
});
test('fresh installation matches the existing default safeguard profile', () => {
  const result = dwell.loadDwellPreferences(storage({}));
  assert.equal(result.settings.onsetDelay, 350);
  assert.equal(result.settings.cooldownAfterActivation, 420);
  assert.equal(result.currentStage, 'mid_als');
});
test('stage-only installations keep their existing guard and keyboard cadence', () => {
  const result = dwell.loadDwellPreferences(storage({ gazeconnect_als_stage: 'caregiver' }));
  assert.equal(result.settings.onsetDelay, 150);
  assert.equal(result.settings.cooldownAfterActivation, 240);
  assert.deepEqual(dwell.KEYBOARD_CADENCE_BY_STAGE[result.currentStage], { onset: 120, cooldown: 450 });
});
test('malformed or unavailable storage has usable defaults', () => {
  for (const value of ['null', '[]', '{broken', '"text"']) {
    assert.equal(dwell.loadDwellPreferences(storage({ gazeconnect_dwell_settings: value })).settings.keyboardKey, 500);
  }
  assert.equal(dwell.loadDwellPreferences({ getItem() { throw new Error('denied'); } }).settings.gazeToggle, 2000);
});
test('guard values are finite and bounded, even with corrupted preferences', () => {
  const result = dwell.loadDwellPreferences(storage({ gazeconnect_dwell_settings: JSON.stringify({ onsetDelay: '450', cooldownAfterActivation: -5, progressStyle: 'invalid' }), gazeconnect_als_stage: '__proto__' }));
  assert.equal(result.settings.onsetDelay, 350);
  assert.equal(result.settings.cooldownAfterActivation, 100);
  assert.equal(result.settings.progressStyle, 'ring');
});
test('legacy Normal smoothing maps to supported Balanced without dropping saved profiles', () => {
  for (const preset of ['normal', '', 'custom', '__proto__']) assert.equal(filters.normalizeFilterPreset(preset), 'balanced');
  assert.equal(filters.normalizeFilterPreset('als_early'), 'balanced');
  assert.equal(filters.normalizeFilterPreset('als_late'), 'gentle');
  for (const preset of ['stable', 'responsive', 'gentle']) assert.equal(filters.normalizeFilterPreset(preset), preset);
});
console.log(`${passed} dwell and preference regressions passed.`);
