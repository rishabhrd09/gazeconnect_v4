// Regression coverage for the six fixed timing sets and legacy safeguard loading.
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
// Group order: typing, alphabet groups, communication, navigation, deliberate,
// Urgent Needs, video controls.
const SETS = {
  quick: [800, 750, 900, 950, 1100, 1450, 2000],
  balanced: [1400, 1300, 1550, 1700, 1900, 2500, 2250],
  measured: [1700, 1600, 1850, 2050, 2300, 3050, 2700],
  calm: [2000, 1850, 2200, 2400, 2700, 3600, 3200],
  relaxed: [2400, 2250, 2650, 2900, 3250, 4000, 3850],
  extra_time: [2800, 2600, 3100, 3350, 3800, 4000, 4000],
};
// 5 Oct 2026: each group is the key time times one ratio, the same in every set,
// then held within its limits: never over 4 s, and the video bar never under 2 s.
const RATIOS = [1, 0.93, 1.1, 1.2, 1.35, 1.8, 1.6];
const LIMITS = [[0, 4000], [0, 4000], [0, 4000], [0, 4000], [0, 4000], [0, 4000], [2000, 4000]];
const union = [...new Set(Object.values(SETS).flat())].sort((a, b) => a - b);
const eachSet = fn => { for (const name of Object.keys(SETS)) { dwell.setDwellTimingSet(name); fn(name, SETS[name]); } dwell.setDwellTimingSet('balanced'); };
const storage = values => ({ getItem: key => values[key] ?? null });
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
test('there are exactly six timing sets, fastest first, and Balanced remains the default', () => {
  assert.deepEqual(Object.keys(dwell.DWELL_TIMING_SETS), Object.keys(SETS));
  assert.equal(dwell.DEFAULT_DWELL_TIMING_SET, 'balanced');
  assert.equal(dwell.getDwellTimingSet(), 'balanced');
  for (const [name, values] of Object.entries(SETS)) assert.deepEqual(Object.values(dwell.DWELL_TIMING_SETS[name].ms), values);
  assert.deepEqual(dwell.ALL_DWELL_DURATIONS_MS, union);
  assert.deepEqual(Object.values(dwell.GROUP_RATIOS), RATIOS);
  assert.equal(dwell.MAX_DWELL_MS, 4000);
});
test('from Balanced to Extra Time every step is gentle: keys about a fifth slower each time', () => {
  // 5 Oct 2026: Balanced -> Relaxed had been one +71 % jump.
  const names = Object.keys(SETS);
  for (let i = names.indexOf('balanced') + 1; i < names.length; i++) {
    const step = SETS[names[i]][0] / SETS[names[i - 1]][0];
    assert(step >= 1.15 && step <= 1.22, `${names[i - 1]} -> ${names[i]}: x${step.toFixed(3)}`);
  }
  assert.equal(names[names.length - 1], 'extra_time', 'Extra Time stays the slowest');
});
test('cards and controls stay close to the key time; Urgent Needs and the video bar take longer', () => eachSet((name, values) => {
  const [typing, words, communication, navigation, deliberate, emergency, video] = values;
  assert(words <= typing && typing < communication && communication < navigation && navigation < deliberate, name);
  assert(deliberate < emergency && deliberate < video, name);
  assert(deliberate <= typing * 1.4, `${name}: deliberate ${deliberate} vs key ${typing}`);
  assert(navigation <= typing * 1.25, `${name}: navigation ${navigation} vs key ${typing}`);
}));
test('Urgent Needs keeps the times it had before the six sets (CLAUDE.md: 2.5 s Balanced, 1.45 to 4 s)', () => {
  assert.equal(SETS.quick[5], 1450);
  assert.equal(SETS.balanced[5], 2500);
  for (const values of Object.values(SETS)) assert(values[5] >= 1450 && values[5] <= 4000);
  assert.equal(dwell.dwellTimesFor('balanced').emergencyButton, 2500);
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
  // The keyboard feel must not add another app-wide speed or browser duration.
  assert.deepEqual(Object.keys(dwell.DWELL_TIMING_SETS), Object.keys(SETS));
  assert.deepEqual(dwell.ALL_DWELL_DURATIONS_MS, union);
});
test('every set is slower group by group than the one before, or both are at the 4 s ceiling', () => {
  const sets = Object.values(SETS);
  for (let s = 1; s < sets.length; s++) for (let i = 0; i < RATIOS.length; i++) {
    assert(sets[s][i] > sets[s - 1][i] || (sets[s][i] === 4000 && sets[s - 1][i] === 4000), `set ${s} group ${i}`);
  }
});
test('every group is the key time times its ratio, to 50 ms, within its limits; nothing exceeds 4 s', () => {
  for (const [name, values] of Object.entries(SETS)) {
    const expected = RATIOS.map((ratio, i) => Math.min(LIMITS[i][1], Math.max(LIMITS[i][0], Math.round(values[0] * ratio / 50) * 50)));
    assert.deepEqual(values, expected, name);
    assert(values.every(ms => ms <= 4000), `${name}: no selection may take longer than 4 s`);
  }
  assert.deepEqual(dwell.GROUP_LIMITS.video, LIMITS[6]);
  // 29 Sep 2026: a word suggestion took 1.25 of a key's time in Quick and 0.73 in Extra Time.
  // It takes the key time itself in every set, for muscle memory; since 5 Oct 2026 so do
  // the words on the Quick Words board.
  for (const [name, [typing]] of Object.entries(SETS)) {
    assert.equal(dwell.dwellTimesFor(name).predictionButton, typing, name);
    assert.equal(dwell.dwellTimesFor(name).quickWordChoice, typing, name);
    assert.equal(dwell.dwellTimesFor(name).videoControl, SETS[name][6], name);
  }
});
test('the YouTube bar takes the video time and Quick Words words the key time', () => {
  const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const youtube = [...read('src/screens/WebBrowsingScreen.tsx').matchAll(/<GazeButton id="(yt-[^"]+)"[\s\S]*?dwellCategory="([^"]+)"/g)];
  assert.equal(youtube.length, 15, 'expected the fifteen controls of the YouTube bars (video bar with Hide options in full screen, page bar, shared video controls)');
  for (const [, id, category] of youtube) assert.equal(category, 'videoControl', id);
  assert.match(read('src/components/shared/QuickWordsGrid.tsx'), /dwellCategory=\{category\.id === 'emergency' \? 'medicalUrgent' : 'quickWordChoice'\}/);
});
test('Settings describes each set by its ring times', () => {
  assert.equal(dwell.describeTimingSet('balanced'), 'Keys 1.4 s · cards 1.7 s');
  assert.equal(dwell.describeTimingSet('measured'), 'Keys 1.7 s · cards 2.05 s');
  for (const name of Object.keys(SETS)) assert.match(dwell.describeTimingSet(name), /^Keys \d(\.\d+)? s · cards \d(\.\d+)? s$/);
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
test('every group, video controls included, uses its assigned time', () => eachSet((name, [typing, words, communication, navigation, deliberate, emergency, video]) => {
  for (const context of ['keyboard', 'keyboardKey', 'prediction', 'predictionButton', 'quickWordChoice']) assert.equal(dwell.dwellForContext(context), typing, name);
  for (const context of ['spatial', 'spatialZone']) assert.equal(dwell.dwellForContext(context), words, name);
  for (const context of ['quickWord', 'medicalUrgent', 'phrases']) assert.equal(dwell.dwellForContext(context), communication, name);
  for (const context of ['surveyOption', 'compass-map', 'settings', 'navigation']) assert.equal(dwell.dwellForContext(context), navigation, name);
  for (const context of ['gazeToggle', 'deliberateAction']) assert.equal(dwell.dwellForContext(context), deliberate, name);
  for (const context of ['emergency', 'emergencyButton']) assert.equal(dwell.dwellForContext(context), emergency, name);
  for (const context of ['videoControl', 'videocontrol']) assert.equal(dwell.dwellForContext(context), video, name);
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
test('native browser accepts exactly the durations the six sets can produce', () => {
  for (const file of ['electron/main.ts', 'electron/browser/browserGazeController.ts']) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    assert(source.includes('[' + union.join(', ') + '].includes('), file);
    assert(source.includes(`dwellMs: ${SETS.balanced[3]},`), `${file} default is not the Balanced navigation time`);
  }
  const replay = fs.readFileSync(path.resolve(__dirname, 'browser-cursor-replay.js'), 'utf8');
  assert(replay.includes('for (const dwellMs of [' + union.join(', ') + '])'), 'browser-cursor-replay.js S18 must replay every duration');
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
