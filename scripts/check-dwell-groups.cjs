// Regression coverage for the ten fixed timing sets and legacy safeguard loading.
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
// Urgent Needs, video controls, word suggestions.
const SETS = {
  quick: [600, 550, 650, 700, 800, 1450, 1000, 650],
  brisk: [750, 700, 800, 850, 1000, 1500, 1200, 850],
  balanced: [1000, 950, 1050, 1150, 1300, 2000, 1600, 1100],
  moderate: [1300, 1200, 1350, 1500, 1700, 2600, 2100, 1450],
  calm: [1700, 1600, 1800, 1950, 2200, 3400, 2700, 1850],
  restful: [1850, 1700, 1950, 2150, 2400, 3700, 2950, 2050],
  relaxed: [2000, 1850, 2100, 2300, 2600, 4000, 3200, 2200],
  leisurely: [2200, 2050, 2300, 2550, 2850, 4000, 3500, 2400],
  unhurried: [2400, 2250, 2500, 2750, 3100, 4000, 3850, 2650],
  extra_time: [2800, 2600, 2950, 3200, 3650, 4000, 3900, 3100],
};
// 8 Oct 2026: each group is the key time times one ratio, the same in every set,
// then held within its limits: never over 4 s, Urgent Needs never under 1.45 s and
// the video bar from 1 s up to 3.9 s (under Urgent Needs' 4 s).
const RATIOS = [1, 0.93, 1.05, 1.15, 1.3, 2, 1.6, 1.1];
const LIMITS = [[0, 4000], [0, 4000], [0, 4000], [0, 4000], [0, 4000], [1450, 4000], [1000, 3900], [0, 4000]];
const union = [...new Set(Object.values(SETS).flat())].sort((a, b) => a - b);
const eachSet = fn => { for (const name of Object.keys(SETS)) { dwell.setDwellTimingSet(name); fn(name, SETS[name]); } dwell.setDwellTimingSet('balanced'); };
const storage = values => ({ getItem: key => values[key] ?? null });
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
test('there are exactly ten timing sets, fastest first, and Balanced is still the default', () => {
  assert.deepEqual(Object.keys(dwell.DWELL_TIMING_SETS), Object.keys(SETS));
  assert.equal(Object.keys(SETS).indexOf('balanced'), 2);
  assert.equal(dwell.DEFAULT_DWELL_TIMING_SET, 'balanced');
  assert.equal(dwell.getDwellTimingSet(), 'balanced');
  for (const [name, values] of Object.entries(SETS)) assert.deepEqual(Object.values(dwell.DWELL_TIMING_SETS[name].ms), values);
  assert.deepEqual(dwell.ALL_DWELL_DURATIONS_MS, union);
  assert.deepEqual(Object.values(dwell.GROUP_RATIOS), RATIOS);
  assert.equal(dwell.MAX_DWELL_MS, 4000);
});
test('Quick, Brisk and Balanced keep their 8 Oct keys and cards, Calm the earlier Relaxed; then about 1.1x a set', () => {
  // 8 Oct 2026, second and third requests: Quick, Brisk and Balanced unchanged but for the
  // YouTube bar and suggestions; Papa managed only Relaxed (keys 1.7 s) and with practice, so
  // Calm took its times, a mode sits between each of the slower ones, and two slower follow.
  assert.deepEqual(SETS.quick.slice(0, 6), [600, 550, 650, 700, 800, 1450]);
  assert.deepEqual(SETS.brisk.slice(0, 6), [750, 700, 800, 850, 1000, 1500]);
  assert.deepEqual(SETS.balanced.slice(0, 6), [1000, 950, 1050, 1150, 1300, 2000]);
  assert.deepEqual(SETS.calm.slice(0, 6), [1700, 1600, 1800, 1950, 2200, 3400]);
  const names = Object.keys(SETS);
  assert.deepEqual(names, ['quick', 'brisk', 'balanced', 'moderate', 'calm', 'restful', 'relaxed', 'leisurely', 'unhurried', 'extra_time']);
  for (let i = names.indexOf('calm') + 1; i < names.length; i++) {
    const step = SETS[names[i]][0] / SETS[names[i - 1]][0];
    assert(step >= 1.05 && step <= 1.2, `${names[i - 1]} -> ${names[i]}: x${step.toFixed(3)}`);
  }
  assert.equal(names[0], 'quick', 'Quick stays the fastest');
  assert.equal(names[names.length - 1], 'extra_time', 'Extra Time is the slowest');
  assert.deepEqual([SETS.unhurried[0], SETS.extra_time[0]], [2400, 2800], 'the key times Relaxed and Extra Time had on 5 Oct');
});
test('keys stay the quickest; suggestions a little longer; cards and controls a little more; the video bar more than a key', () => eachSet((name, values) => {
  const [typing, words, communication, navigation, deliberate, emergency, video, suggestions] = values;
  // 8 Oct 2026, second request: a word suggestion takes slightly more than a key.
  assert(typing < suggestions && suggestions <= typing * 1.15, `${name}: suggestion ${suggestions} vs key ${typing}`);
  // 8 Oct 2026 (maintainer): the keyboard should not get more time than the other screens,
  // slightly less; the YouTube bar more than the keys.
  assert(words <= typing && typing < communication && communication < navigation && navigation < deliberate, name);
  assert(deliberate < video && video < emergency, name);
  assert(navigation <= typing * 1.2, `${name}: navigation ${navigation} vs key ${typing}`);
  assert(deliberate <= typing * 1.35, `${name}: deliberate ${deliberate} vs key ${typing}`);
  // Third request: the YouTube bar clearly longer than everything but Urgent Needs.
  assert(video >= typing * 1.39 && video >= 1000 && video - deliberate >= 200, `${name}: video ${video} vs key ${typing}`);
}));
test('Urgent Needs stays deliberately the longest selection (CLAUDE.md: 2 s Balanced, 1.45 to 4 s)', () => {
  assert.equal(SETS.quick[5], 1450);
  assert.equal(SETS.balanced[5], 2000);
  for (const [name, values] of Object.entries(SETS)) {
    assert(values[5] >= 1450 && values[5] <= 4000, name);
    assert.equal(values[5], Math.max(...values), `${name}: Urgent Needs must be the longest`);
    assert.equal(values[5], Math.min(4000, Math.max(1450, values[0] * 2)), `${name}: twice the key time, 1.45 to 4 s`);
  }
  assert.equal(dwell.dwellTimesFor('balanced').emergencyButton, 2000);
});
test('Familiar is a keyboard-only feel with fixed acquisition and completion stages', () => {
  assert.equal(dwell.DEFAULT_KEYBOARD_FEEL, 'standard');
  assert.equal(dwell.normalizeKeyboardFeel('familiar'), 'familiar');
  for (const value of [undefined, null, '', 'Familiar', 'custom', '__proto__']) {
    assert.equal(dwell.normalizeKeyboardFeel(value), 'standard');
  }
  // 8 Oct 2026: only Familiar's settle and its 750 ms progress window are its own; its keys,
  // suggestions and Shift fill in the selected speed's key time.
  assert.deepEqual(dwell.FAMILIAR_KEYBOARD_TIMING, { onset: 250, incompleteTtl: 750 });
  eachSet((name, values) => {
    assert.equal(dwell.familiarKeyboardFillMs(), values[0], name);
    assert.equal(dwell.familiarKeyboardFillMs('modifier'), values[0], name);
    assert.equal(dwell.familiarKeyboardFillMs('suggestion'), values[7], name);
  });
  // The keyboard feel must not add another app-wide speed or browser duration.
  assert.deepEqual(Object.keys(dwell.DWELL_TIMING_SETS), Object.keys(SETS));
  assert.deepEqual(dwell.ALL_DWELL_DURATIONS_MS, union);
});
test('after a key, a different key may begin after 0.4 of the key time, 250 ms up to the stage cooldown', () => {
  // 8 Oct 2026: a fixed 0.7 s wait after every letter made typing the slowest thing at Quick.
  const mid = dwell.KEYBOARD_CADENCE_BY_STAGE.mid_als.cooldown;
  assert.deepEqual(Object.keys(SETS).map(name => dwell.keyboardNextKeyWaitMs(SETS[name][0], mid)), [250, 300, 400, 500, 700, 700, 700, 700, 700, 700]);
  for (const stage of Object.values(dwell.KEYBOARD_CADENCE_BY_STAGE)) for (const [name, [typing]] of Object.entries(SETS)) {
    const wait = dwell.keyboardNextKeyWaitMs(typing, stage.cooldown);
    assert(wait >= 250 && wait <= Math.max(250, stage.cooldown) && wait % 50 === 0, `${name}: ${wait}`);
  }
  assert.equal(dwell.keyboardNextKeyWaitMs(SETS.relaxed[0], dwell.KEYBOARD_CADENCE_BY_STAGE.caregiver.cooldown), 450);
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
  assert.deepEqual(dwell.GROUP_LIMITS.emergency, LIMITS[5]);
  // 29 Sep 2026: a word suggestion took 1.25 of a key's time in Quick and 0.73 in Extra Time.
  // Since 8 Oct 2026 (second request) it takes the same 1.1x of the key time in every set; the
  // words on the Quick Words board take the key time itself (5 Oct 2026).
  for (const [name, [typing]] of Object.entries(SETS)) {
    assert.equal(dwell.dwellTimesFor(name).predictionButton, SETS[name][7], name);
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
  assert.equal(dwell.describeTimingSet('balanced'), 'Keys 1 s · cards 1.15 s');
  assert.equal(dwell.describeTimingSet('moderate'), 'Keys 1.3 s · cards 1.5 s');
  assert.equal(dwell.describeTimingSet('calm'), 'Keys 1.7 s · cards 1.95 s');
  assert.equal(dwell.describeTimingSet('extra_time'), 'Keys 2.8 s · cards 3.2 s');
  for (const name of Object.keys(SETS)) assert.match(dwell.describeTimingSet(name), /^Keys \d(\.\d+)? s · cards \d(\.\d+)? s$/);
});
test('unknown, malformed or hostile set names select the default', () => {
  for (const name of [undefined, null, '', 'fast', '__proto__', 'constructor', 7, {}, 'QUICK']) {
    assert.equal(dwell.normalizeDwellTimingSet(name), 'balanced');
    assert.equal(dwell.setDwellTimingSet(name), 'balanced');
  }
});
test('a profile saved on Measured (retired on 8 Oct 2026) selects Calm, which has its key time', () => {
  assert.equal(dwell.normalizeDwellTimingSet('measured'), 'calm');
  assert.equal(dwell.setDwellTimingSet('measured'), 'calm');
  assert.equal(dwell.DWELL_GROUPS.typing.ms, 1700);
  // Extra Time is a set again, with the 2.8 s keys it had on 5 Oct.
  assert.equal(dwell.normalizeDwellTimingSet('extra_time'), 'extra_time');
  dwell.setDwellTimingSet('balanced');
});
test('every action resolves to its configured group duration in every set', () => eachSet((name, allowed) => {
  const durations = Object.keys(dwell.DWELL_ACTION_GROUPS).map(dwell.dwellForAction);
  assert.deepEqual([...new Set(durations)].sort((a, b) => a - b), [...new Set(allowed)].sort((a, b) => a - b), name);
  assert.deepEqual(Object.values(dwell.DWELL_GROUPS).map(group => group.ms), allowed, name);
}));
test('every group, video controls included, uses its assigned time', () => eachSet((name, [typing, words, communication, navigation, deliberate, emergency, video, suggestions]) => {
  for (const context of ['keyboard', 'keyboardKey', 'quickWordChoice']) assert.equal(dwell.dwellForContext(context), typing, name);
  for (const context of ['prediction', 'predictionButton']) assert.equal(dwell.dwellForContext(context), suggestions, name);
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
test('native browser accepts exactly the durations the ten sets can produce', () => {
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
