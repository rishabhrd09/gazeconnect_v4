// Additive food vocabulary must survive upgrades without resetting personal content.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { CustomizationService } = require('../src/services/CustomizationService.ts');
const { FOOD_PHRASES, FOOD_CONTENT_VERSION } = require('../src/services/careContentPresets.ts');
const service = new CustomizationService();
const daily = data => data.medicalSections.find(section => section.id === 'daily');
const words = data => data.quickWords.categories.find(category => category.id === 'daily').words;
const fresh = service.getData();
assert.equal(fresh.version, FOOD_CONTENT_VERSION);
assert.deepEqual(words(fresh).find(word => word.id === 'daily_food').phrases, FOOD_PHRASES);
for (const phrase of FOOD_PHRASES) assert(daily(fresh).items.some(item => item.en === phrase.en && item.hi === phrase.hi));
console.log('PASS fresh profiles include all three food phrases in both care menus');

const saved = structuredClone(fresh);
saved.version = 4;
daily(saved).items = [{ en: 'My own meal request', hi: 'मेरा भोजन' }];
saved.quickWords.categories.find(category => category.id === 'daily').words = Array.from({ length: 9 }, (_, i) => ({
  id: `personal_${i}`, en: `My word ${i}`, hi: '', enabled: i !== 1,
}));
const before = structuredClone(saved);
const upgraded = service.mergeWithDefaults(saved);
assert.deepEqual(saved, before);
assert.deepEqual(daily(upgraded).items, [...FOOD_PHRASES, ...daily(before).items]);
assert.deepEqual(words(upgraded).filter(word => word.id !== 'daily_food'), words(before));
assert(words(upgraded).filter(word => word.enabled).slice(0, 8).some(word => word.id === 'daily_food'));
console.log('PASS saved personal phrases, word order and disabled choices survive the upgrade');

assert.deepEqual(service.mergeWithDefaults(upgraded), upgraded);
console.log('PASS repeat loading does not duplicate food content');

const customized = structuredClone(upgraded);
words(customized).find(word => word.id === 'daily_food').enabled = false;
daily(customized).items = daily(customized).items.filter(item => item.en !== 'I need my diet');
assert.deepEqual(service.mergeWithDefaults(customized), customized);
console.log('PASS later caregiver edits are retained after migration');
