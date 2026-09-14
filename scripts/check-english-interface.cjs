const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { CustomizationService } = require('../src/services/CustomizationService.ts');
const service = new CustomizationService();
const assertEnglish = data => {
  assert.equal(data.settings.showHindi, false);
  assert.equal(data.settings.ttsLanguage, 'english');
};
assertEnglish(service.getData());
const saved = structuredClone(service.getData());
saved.settings.showHindi = true;
saved.settings.ttsLanguage = 'hindi';
saved.people[0].nameHi = 'Saved translation';
const loaded = service.mergeWithDefaults(saved);
assertEnglish(loaded);
assert.equal(loaded.people[0].nameHi, 'Saved translation');
console.log('PASS legacy language flags load as English without deleting saved content');
global.window = { electronAPI: { settings: { save: async () => true } } };
service.importJSON(JSON.stringify(saved));
assertEnglish(service.getData());
service.updateSetting('showHindi', true);
assertEnglish(service.getData());
service.updateSettings({ showHindi: true, ttsLanguage: 'auto', ttsRate: 180 });
assertEnglish(service.getData());
assert.equal(service.getData().settings.ttsRate, 180);
console.log('PASS imports and settings updates cannot reactivate bilingual mode');
service.resetToDefaults();
assertEnglish(service.getData());
console.log('PASS reset keeps the English-only release settings');
