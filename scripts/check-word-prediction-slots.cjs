// Word-slot, sentence and abbreviation insertion contracts, ten-slot presentation
// and the household prediction context (renderer side). The insertion cases are
// shared with the Python engine test and were generated from the pinned reference.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const slots = require('../src/utils/wordPredictionSlots.ts');
const { collectPredictionContext, predictionContextKey } = require('../src/utils/predictionContext.ts');

let checks = 0;
const check = (fn) => { fn(); checks += 1; };

check(() => assert.equal(slots.WORD_SLOT_COUNT, 10));
check(() => assert.equal(slots.TOP_WORD_SLOTS, 5));

// 1. Word slots: the renderer inserts exactly what the engine's acceptPredictedWord would.
const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'python', 'tests', 'fixtures',
  'deterministic_prediction', 'insertion_contract.v1.json'), 'utf8'));
for (const item of contract.cases) {
  check(() => assert.equal(slots.currentWordPrefix(item.draft).toLowerCase(), item.prefix, `prefix ${JSON.stringify(item.draft)}`));
  check(() => assert.equal(slots.acceptWordPrediction(item.draft, item.word), item.accepted, `accept ${JSON.stringify(item.draft)}`));
}
// Accepting twice is never idempotent by accident: a second acceptance of the same
// (now complete) word appends a new word, which is why the renderer checks freshness.
check(() => assert.equal(slots.acceptWordPrediction(slots.acceptWordPrediction('i need wa', 'water'), 'water'), 'i need water water '));

// 2. Stale guard: a word may only be inserted while it completes the typed word.
check(() => assert.equal(slots.wordFitsText('i need wa', 'water'), true));
check(() => assert.equal(slots.wordFitsText('i need wa', 'want'), true));
check(() => assert.equal(slots.wordFitsText('i need wo', 'water'), false));
check(() => assert.equal(slots.wordFitsText('i need ', 'water'), true));
check(() => assert.equal(slots.wordFitsText('dont', "don't"), true));
check(() => assert.equal(slots.wordFitsText('i need WA', 'water'), true));
check(() => assert.equal(slots.predictionsAreFresh({ text: 'i need wa', prefix: 'wa' }, 'i need wa'), true));
check(() => assert.equal(slots.predictionsAreFresh({ text: 'i need w', prefix: 'w' }, 'i need wa'), false));
check(() => assert.equal(slots.predictionsAreFresh(null, 'anything'), true));

// 3. Sentence suggestions: complete when they start with the draft, else append.
const sentence = (text, mode) => ({ text, score: 1, source: 'sentence', mode });
check(() => assert.equal(slots.acceptSentenceSuggestion('I need', sentence('I need water', 'complete_or_append')), 'I need water '));
check(() => assert.equal(slots.acceptSentenceSuggestion('i need wa', sentence('I need water', 'complete_or_append')), 'I need water '));
check(() => assert.equal(slots.acceptSentenceSuggestion('Hello ', sentence('I need water', 'complete_or_append')), 'Hello I need water '));
check(() => assert.equal(slots.acceptSentenceSuggestion('', sentence('I need', 'append')), 'I need '));
check(() => assert.equal(slots.acceptSentenceSuggestion('', sentence('   ', 'append')), null));
// 4. Abbreviations replace only the shortcut they were computed for.
const abbreviation = { text: 'thank you', score: 1, source: 'abbreviation', mode: 'replace_token', token: 'ty' };
check(() => assert.equal(slots.acceptSentenceSuggestion('ok ty', abbreviation), 'ok thank you '));
check(() => assert.equal(slots.acceptSentenceSuggestion('ok TY', abbreviation), 'ok thank you '));
check(() => assert.equal(slots.acceptSentenceSuggestion('ok tyx', abbreviation), null));
check(() => assert.equal(slots.acceptSentenceSuggestion('ok ty ', abbreviation), null));

// 5. Ten presentation slots keep backend positions and never pad.
const words = (list) => list.map((word) => ({ word, score: 1 }));
const ten = ['water', 'want', 'wait', 'warm', 'wash', 'was', 'way', 'walk', 'watch', 'wake'];
check(() => assert.deepEqual(slots.presentWordSlots(ten, [], 'i need wa'), ten));
check(() => assert.deepEqual(slots.presentWordSlots(['water', null, 'wait'], [], 'i need wa'),
  ['water', null, 'wait', null, null, null, null, null, null, null]));
check(() => assert.deepEqual(slots.presentWordSlots(['water', 'Water', 'going', 'I need', 'want'], [], 'i need wa').slice(0, 5),
  ['water', null, null, null, 'want']));
check(() => assert.deepEqual(slots.presentWordSlots(null, words(['water', 'want']), 'i need wa'),
  ['water', 'want', null, null, null, null, null, null, null, null]));
check(() => assert.deepEqual(slots.presentWordSlots([], words(['water']), 'i need wa', 5), ['water', null, null, null, null]));
check(() => assert.equal(slots.presentWordSlots(ten, [], 'i need wa').length, slots.WORD_SLOT_COUNT));
check(() => assert.equal(slots.isShortSentence('I need water'), true));
check(() => assert.equal(slots.isShortSentence('Could you please help me sit up in bed now'), false));
check(() => assert.equal(slots.isShortSentence('   '), false));

// 6. Household context: enabled, English, de-duplicated, in the caregiver's order.
const phrase = (en) => ({ id: en, en, hi: '' });
const customization = {
  people: [
    { id: 'p1', name: 'Papa', isActive: true, phrases: [phrase('Call Papa'), phrase('call papa')] },
    { id: 'p2', name: 'Old Friend', isActive: true, phrases: [] },
    { id: 'p3', name: 'Inactive', isActive: false, phrases: [phrase('Hidden phrase')] },
  ],
  phraseCategories: [{ id: 'c1', phrases: [phrase('I need  water'), phrase('')] }],
  medicalSections: [{ id: 'm1', items: [phrase('Check my oxygen')] }],
  quickWords: {
    enabled: true,
    categories: [{ id: 'q1', words: [{ en: 'Tea', enabled: true, phrases: [phrase('Tea please')] }, { en: 'Coffee', enabled: false, phrases: [phrase('Coffee please')] }] }],
    coreWords: [{ en: 'yes', enabled: true }, { en: 'YES', enabled: true }, { en: 'no', enabled: false }],
  },
  homeEmergencyCards: [{ en: 'Help me now', enabled: true }, { en: 'Disabled card', enabled: false }],
  aacCategories: [{ items: [phrase('Turn on the fan')] }],
  feelings: [phrase('I feel tired')],
  basicNeeds: [phrase('I am thirsty')],
  alertModeCards: [{ label: 'Suction', enabled: true }, { label: 'Off card', enabled: false }],
};
const context = collectPredictionContext(customization);
check(() => assert.deepEqual(context.words, ['Papa', 'Tea', 'yes']));
check(() => assert.deepEqual(context.phrases, ['Call Papa', 'I need water', 'Check my oxygen', 'Tea please', 'Help me now',
  'Turn on the fan', 'I feel tired', 'I am thirsty', 'Suction']));
check(() => assert.equal(predictionContextKey(context), predictionContextKey(collectPredictionContext(structuredClone(customization)))));
check(() => assert.notEqual(predictionContextKey(context), predictionContextKey({ ...context, words: ['Papa'] })));
check(() => assert.deepEqual(collectPredictionContext({ ...customization, quickWords: { ...customization.quickWords, enabled: false } }).words, ['Papa']));
check(() => assert.deepEqual(collectPredictionContext({}), { phrases: [], words: [] }));

console.log(`Word prediction slots: ${checks} insertion, freshness, sentence, abbreviation, ten-slot and context checks passed.`);
