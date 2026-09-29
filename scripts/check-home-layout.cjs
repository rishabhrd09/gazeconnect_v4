// Home layout settings, as the real CustomizationService loads, keeps and resets them: the left
// panel is Quick Phrases only unless the Urgent Needs card is chosen (maintainer's decision,
// 28 Sep 2026; files from before data version 6 switch once), and the word bar that could run
// along the bottom of Home is gone, from the screen, Settings and the saved data.
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
const { CustomizationService } = require(path.join(root, 'src/services/CustomizationService.ts'));
const { HOME_LAYOUT_VERSION } = require(path.join(root, 'src/services/careContentPresets.ts'));

// What an earlier version wrote to disk: the service reads it through importJSON,
// the same merge the start-up load uses.
function loadSaved(saved) {
  const service = new CustomizationService();
  service.importJSON(JSON.stringify(saved));
  return service;
}
const withMode = (version, mode) => ({ version, settings: { ...DEFAULT_CUSTOMIZATION.settings, homeEmergencyLaunchMode: mode } });
// What the app writes to disk next, read back as the next start-up would.
const restart = (service) => loadSaved(JSON.parse(service.exportJSON()));

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

test('new installs show Quick Phrases only, at data version 6, with no word bar', () => {
  assert.equal(HOME_LAYOUT_VERSION, 6);
  assert.equal(DEFAULT_CUSTOMIZATION.settings.homeEmergencyLaunchMode, 'quick');
  assert.equal('homeWordBar' in DEFAULT_CUSTOMIZATION, false);
  const data = new CustomizationService().getData();
  assert.equal(data.settings.homeEmergencyLaunchMode, 'quick');
  assert.ok(data.version >= HOME_LAYOUT_VERSION);
  assert.equal('homeWordBar' in data, false);
});

test("the maintainer's saved Home (Urgent Needs and the word bar) loads as Quick Phrases only", () => {
  // The shape of the maintainer's settings.json on 28 Sep 2026.
  const saved = {
    ...withMode(5, 'alert'),
    homeWordBar: { enabled: true, layout: '3+2', words: ['Yes', 'No', 'Help', 'Water'], phrases: ['TT Suction', 'Ambu bag'] },
    homeEmergencyCards: DEFAULT_CUSTOMIZATION.homeEmergencyCards,
  };
  const service = loadSaved(saved);
  const data = service.getData();
  assert.equal(data.settings.homeEmergencyLaunchMode, 'quick');
  assert.equal(data.version, HOME_LAYOUT_VERSION);
  assert.equal('homeWordBar' in data, false, 'the word bar is dropped from the data');
  assert.doesNotMatch(service.exportJSON(), /homeWordBar/, 'and from what is saved and backed up');
  assert.deepEqual(data.homeEmergencyCards, DEFAULT_CUSTOMIZATION.homeEmergencyCards, 'the emergency cards are kept (the word predictor reads them)');
});

test('every file from before version 6 loads once as Quick Phrases only', () => {
  for (const version of [undefined, 1, 4, 5]) {
    for (const mode of ['alert', 'cards', 'quick', undefined]) {
      const file = withMode(version, mode);
      if (version === undefined) delete file.version;
      if (mode === undefined) delete file.settings.homeEmergencyLaunchMode;
      assert.equal(loadSaved(file).getData().settings.homeEmergencyLaunchMode, 'quick', `version ${version}, ${mode}`);
    }
  }
  assert.equal(loadSaved({ version: 5 }).getData().settings.homeEmergencyLaunchMode, 'quick', 'no settings at all');
});

test('from version 6 a chosen Urgent Needs card is kept, and anything else is Quick Phrases only', () => {
  assert.equal(loadSaved(withMode(6, 'alert')).getData().settings.homeEmergencyLaunchMode, 'alert');
  for (const mode of ['quick', 'cards', 'banana', 42, null, undefined]) {
    const file = withMode(6, mode);
    if (mode === undefined) delete file.settings.homeEmergencyLaunchMode;
    assert.equal(loadSaved(file).getData().settings.homeEmergencyLaunchMode, 'quick', String(mode));
  }
});

test('choosing Urgent Needs survives a restart, on a new install and after the one-time switch', () => {
  const fresh = new CustomizationService();
  fresh.updateSetting('homeEmergencyLaunchMode', 'alert');
  assert.equal(restart(fresh).getData().settings.homeEmergencyLaunchMode, 'alert', 'new install');
  const migrated = loadSaved(withMode(5, 'alert'));
  assert.equal(migrated.getData().settings.homeEmergencyLaunchMode, 'quick');
  migrated.updateSetting('homeEmergencyLaunchMode', 'alert');
  const again = restart(migrated);
  assert.equal(again.getData().settings.homeEmergencyLaunchMode, 'alert', 'after the switch');
  assert.equal(restart(again).getData().settings.homeEmergencyLaunchMode, 'alert', 'and on every start after');
});

test('Reset gives Quick Phrases only at version 6, and a later choice is kept', () => {
  const service = loadSaved(withMode(6, 'alert'));
  service.resetToDefaults();
  assert.equal(service.getData().settings.homeEmergencyLaunchMode, 'quick');
  assert.ok(service.getData().version >= HOME_LAYOUT_VERSION);
  service.updateSetting('homeEmergencyLaunchMode', 'alert');
  assert.equal(restart(service).getData().settings.homeEmergencyLaunchMode, 'alert');
});

test('the older content migrations still run first for an old file', () => {
  const data = loadSaved(withMode(4, 'alert')).getData();
  const daily = data.medicalSections.find((section) => section.id === 'daily');
  assert.ok(daily && daily.items.some((item) => item.en === 'I want food'), 'food content (version 5) added');
  assert.equal(data.version, HOME_LAYOUT_VERSION);
});

console.log(`${passed} home layout checks passed.`);
// importJSON schedules a save for later; nothing is left to wait for here.
process.exit(0);
