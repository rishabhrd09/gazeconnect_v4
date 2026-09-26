// Regression coverage for the four fixed timing sets and legacy safeguard loading.
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
const SETS = {
  quick: [800, 1000, 1250, 1500, 2000],
  balanced: [1400, 1300, 1600, 1900, 2500],
  relaxed: [2200, 1700, 2000, 2400, 3000],
  extra_time: [3000, 2200, 2600, 3000, 3800],
};
const union = [...new Set(Object.values(SETS).flat())].sort((a, b) => a - b);
const eachSet = fn => { for (const name of Object.keys(SETS)) { dwell.setDwellTimingSet(name); fn(name, SETS[name]); } dwell.setDwellTimingSet('balanced'); };
const storage = values => ({ getItem: key => values[key] ?? null });
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
test('there are exactly four timing sets and Balanced remains the default', () => {
  assert.deepEqual(Object.keys(dwell.DWELL_TIMING_SETS), Object.keys(SETS));
  assert.equal(dwell.DEFAULT_DWELL_TIMING_SET, 'balanced');
  assert.equal(dwell.getDwellTimingSet(), 'balanced');
  for (const [name, values] of Object.entries(SETS)) assert.deepEqual(Object.values(dwell.DWELL_TIMING_SETS[name].ms), values);
  assert.deepEqual(dwell.ALL_DWELL_DURATIONS_MS, union);
});
test('Familiar is a keyboard-only feel with fixed acquisition and completion stages', () => {
  assert.equal(dwell.DEFAULT_KEYBOARD_FEEL, 'standard');
  assert.equal(dwell.normalizeKeyboardFeel('familiar'), 'familiar');
  for (const value of [undefined, null, '', 'Familiar', 'custom', '__proto__']) {
    assert.equal(dwell.normalizeKeyboardFeel(value), 'standard');
  }
  assert.deepEqual(dwell.FAMILIAR_KEYBOARD_TIMING, {
    onset: 350, key: 1750, suggestion: 1750, modifier: 1500, incompleteTtl: 750,
  });
  // The keyboard feel must not add a fifth app-wide speed or browser duration.
  assert.deepEqual(Object.keys(dwell.DWELL_TIMING_SETS), Object.keys(SETS));
  assert.deepEqual(dwell.ALL_DWELL_DURATIONS_MS, union);
});
test('every set is slower group by group than the one before; typing can exceed words', () => {
  const [quick, balanced, relaxed, extra] = Object.values(SETS);
  for (let i = 0; i < 5; i++) assert(quick[i] < balanced[i] && balanced[i] < relaxed[i] && relaxed[i] < extra[i]);
  for (const values of [balanced, relaxed, extra]) assert(values[0] > values[1]);
});
test('unknown, malformed or hostile set names select the default', () => {
  for (const name of [undefined, null, '', 'fast', '__proto__', 'constructor', 7, {}, 'QUICK']) {
    assert.equal(dwell.normalizeDwellTimingSet(name), 'balanced');
    assert.equal(dwell.setDwellTimingSet(name), 'balanced');
  }
});
test('every action resolves to its configured group duration in every set', () => eachSet((name, allowed) => {
  const durations = Object.keys(dwell.DWELL_ACTION_GROUPS).map(dwell.dwellForAction);
  assert.deepEqual([...new Set(durations)].sort((a, b) => a - b), [...new Set(allowed)].sort((a, b) => a - b), name);
  assert.deepEqual(Object.values(dwell.DWELL_GROUPS).map(group => group.ms), allowed, name);
}));
test('typing, words, communication, navigation and deliberate actions use their assigned group times', () => eachSet((name, [typing, words, communication, navigation, deliberate]) => {
  for (const context of ['keyboard', 'keyboardKey']) assert.equal(dwell.dwellForContext(context), typing, name);
  for (const context of ['prediction', 'predictionButton', 'spatialZone']) assert.equal(dwell.dwellForContext(context), words, name);
  for (const context of ['quickWord', 'medicalUrgent', 'phrases']) assert.equal(dwell.dwellForContext(context), communication, name);
  for (const context of ['surveyOption', 'compass-map', 'settings', 'navigation']) assert.equal(dwell.dwellForContext(context), navigation, name);
  for (const context of ['gazeToggle', 'deliberateAction', 'emergency']) assert.equal(dwell.dwellForContext(context), deliberate, name);
}));
test('unknown DOM contexts cannot access object prototype properties', () => eachSet((name, allowed) => {
  for (const context of ['__proto__', 'constructor', 'unknown', '']) assert.equal(dwell.dwellForContext(context), allowed[3], name);
}));
test('legacy explicit overrides cannot create extra durations in any set', () => eachSet((name, allowed) => {
  for (let ms = 1; ms < 6000; ms += 37) assert(allowed.includes(dwell.fixedDwell(ms)), `${name} ${ms}`);
  for (const invalid of [NaN, Infinity, -20, 0]) assert.equal(dwell.fixedDwell(invalid, allowed[2]), allowed[2]);
  const sorted = [...new Set(allowed)].sort((a, b) => a - b);
  for (let ms = 1; ms <= sorted[sorted.length - 1]; ms += 37) {
    assert.equal(dwell.fixedDwell(ms), sorted.find(duration => duration >= ms), `${name}: ${ms} must round up`);
  }
  assert.equal(dwell.fixedDwell(99999), sorted[sorted.length - 1]);
}));
test('native browser accepts exactly the durations the four sets can produce', () => {
  for (const file of ['electron/main.ts', 'electron/browser/browserGazeController.ts']) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    assert(source.includes('[' + union.join(', ') + '].includes('), file);
    assert(source.includes('dwellMs: 1900,'), `${file} default is not the Balanced navigation time`);
  }
});
test('the active set reaches the per-action table that components read', () => eachSet((name, allowed) => {
  const result = dwell.loadDwellPreferences(storage({}));
  assert.equal(result.settings.keyboardKey, allowed[0], name);
  assert.equal(result.settings.navigationButton, allowed[3], name);
  assert.equal(result.settings.gazeToggle, allowed[4], name);
  assert.deepEqual(dwell.dwellTimesFor(name), Object.fromEntries(Object.keys(dwell.DWELL_ACTION_GROUPS).map(a => [a, dwell.dwellForAction(a)])));
}));
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
    assert.equal(dwell.loadDwellPreferences(storage({ gazeconnect_dwell_settings: value })).settings.keyboardKey, SETS.balanced[0]);
  }
  assert.equal(dwell.loadDwellPreferences({ getItem() { throw new Error('denied'); } }).settings.gazeToggle, SETS.balanced[4]);
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
