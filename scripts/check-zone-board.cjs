const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { currentZoneWord, commitZoneSuggestion, zoneSuggestions } = require('../src/utils/zoneBoardText.ts');
assert.equal(currentZoneWord('I want wa'), 'wa');
assert.equal(currentZoneWord('I want water '), '');
assert.equal(currentZoneWord('I want water\n'), '');
assert.equal(commitZoneSuggestion('I want wa', 'water'), 'I want water ');
assert.equal(commitZoneSuggestion('I want ', 'food'), 'I want food ');
assert.equal(commitZoneSuggestion('', 'hello'), 'hello ');
assert.equal(commitZoneSuggestion('I\nwant\twa', 'water'), 'I\nwant\twater ');
assert.equal(zoneSuggestions('', []).length, 6);
assert.equal(zoneSuggestions('wa', [])[0].word, 'water');
const input = [{ word: 'Water', score: 0.8 }, { word: 'water', score: 0.5 }, { word: 'want', score: 0.9 }];
const unchanged = structuredClone(input);
const result = zoneSuggestions('wa', input);
assert.equal(result[0].word, 'want');
assert.equal(new Set(result.map(x => x.word.toLowerCase())).size, 6);
assert.deepEqual(input, unchanged);
assert.equal(zoneSuggestions('water ', [{ word: 'please', score: 1 }])[0].word, 'please');
console.log('Zone Board: 13 text, completion, whitespace and suggestion checks passed.');
