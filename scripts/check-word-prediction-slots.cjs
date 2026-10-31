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

// 6. The top row's phrase slot (29 Oct 2026): a phrase only when it is a confident match. These
//    drafts and phrases are what the default household offered before the rule (one letter already
//    filled the slot with "I need help immediately").
// As the engine builds it: the typed text kept as typed, then the rest of the phrase.
const completion = (text, phrase, start = 0) => ({ text: phrase, mode: 'complete_sentence', matched_text: text,
  replacement_start: start, result_text: text + phrase.slice(text.length - start) + ' ' });
const review = (text, phrase) => ({ text: phrase, mode: 'replace_sentence', matched_text: text, replacement_start: 0,
  result_text: phrase + ' ', requires_confirmation: true });
for (const [text, phrase] of [['i', 'I need help immediately'], ['i ', 'I need help immediately'], ['i need ', 'I need help immediately'],
  ['please c', 'Please change my position'], ['call ', 'Call Rishabh']]) {
  check(() => assert.equal(slots.phraseIsConfident(text, completion(text, phrase)), false, `too early: ${text} -> ${phrase}`));
}
for (const [text, phrase] of [['i need wa', 'I need Water'], ['please call', 'Please call the doctor'], ['call r', 'Call Rishabh'],
  ['i need help', 'I need help immediately'], ['thank you', 'Thank you very much']]) {
  check(() => assert.equal(slots.phraseIsConfident(text, completion(text, phrase)), true, `confident: ${text} -> ${phrase}`));
}
// Only the current sentence counts: an earlier sentence is not evidence for the next one.
check(() => assert.equal(slots.phraseIsConfident('I am cold. i need wa', completion('I am cold. i need wa', 'I need Water', 11)), true));
check(() => assert.equal(slots.phraseIsConfident('I need help now. i', completion('I need help now. i', 'I need help immediately', 16)), false));
// A lone keyword's replacement needs the whole word (or a caregiver's exact keyword), never its first letters.
check(() => assert.equal(slots.phraseIsConfident('suction', review('suction', 'I need suction')), true));
check(() => assert.equal(slots.phraseIsConfident('wat', review('wat', 'I need Water')), false));
check(() => assert.equal(slots.phraseIsConfident('spectacles', review('spectacles', 'Bring my glasses')), true));
check(() => assert.equal(slots.phraseIsConfident('ty', { text: 'thank you', mode: 'replace_token', token: 'ty' }), true));
check(() => assert.equal(slots.phraseIsConfident('', { text: 'I need', mode: 'append', matched_text: '' }), false));
// What the slot shows, given the word slots on screen: a confident short phrase in full; a confident long one
// through the chooser; else a fifth word.
const longPhrase = 'Please bring my reading glasses from the bedside table';
const onScreen = ['water', 'help', 'suction', 'my', 'rest', 'medicine', 'oxygen', 'toilet', 'to', 'more'];
check(() => assert.deepEqual(slots.keyboardPhrase([completion('i n', 'I need help immediately')], 'i n', onScreen), null));
check(() => assert.deepEqual(slots.keyboardPhrase([completion('i need wa', 'I need water now')], 'i need wa', onScreen),
  { suggestion: completion('i need wa', 'I need water now'), inline: true }));
check(() => assert.deepEqual(slots.keyboardPhrase([completion('Please bring my rea', longPhrase)], 'Please bring my rea', onScreen),
  { suggestion: completion('Please bring my rea', longPhrase), inline: false }));
check(() => assert.equal(slots.keyboardPhrase([review('suction', 'I need suction'), completion('suction', 'Suction please')], 'suction', onScreen)
  .suggestion.mode, 'complete_sentence', 'a literal completion comes before a reviewed replacement'));
check(() => assert.equal(slots.inlineSentenceSuggestion([completion('i need ', 'I need help immediately')], 'i need ', onScreen), null));
// A phrase that only repeats a word on screen leaves the slot to a fifth word ("I need Water" was the
// default household's phrase at "i need wa"); one that adds a word the slots do not offer still counts.
check(() => assert.equal(slots.keyboardPhrase([completion('i need wa', 'I need Water')], 'i need wa', onScreen), null));
check(() => assert.equal(slots.keyboardPhrase([completion('i need ', 'I need suction')], 'i need ', onScreen), null));
check(() => assert.equal(slots.phraseAddsWords('i need ', completion('i need ', 'I need suction'), []), true));
check(() => assert.equal(slots.phraseAddsWords('call ', completion('call ', 'Call 108'), onScreen), true));
check(() => assert.equal(slots.phraseAddsWords('i need ', completion('i need ', 'I need my medicine'), onScreen), true));
check(() => assert.equal(slots.phraseAddsWords('thank', completion('thank', 'Thank you'), ['thank', 'you']), true));
check(() => assert.equal(slots.phraseAddsWords('thank ', completion('thank ', 'Thank you'), ['you']), false));
check(() => assert.equal(slots.phraseAddsWords('ty', { text: 'thank you', mode: 'replace_token', token: 'ty' }, ['thank', 'you']), true));
// The engine's order stands: a shorter phrase further down never takes the slot while the best one is still a
// guess (before this, "please " showed "Please help me", fifth in line, because it was easier to match).
check(() => assert.equal(slots.keyboardPhrase([completion('please ', 'Please do suction'), completion('please ', 'Please help me')], 'please ', onScreen), null));
check(() => assert.equal(slots.keyboardPhrase([completion('please ca', 'Please call the doctor'), completion('please ca', 'Please carry me')],
  'please ca', onScreen).suggestion.text, 'Please call the doctor'));
// Nor when the best phrase is already a word slot: at "call r" the household's "Call Rishabh" repeats the word
// Rishabh, and the template behind it, "Call Rahul", named someone else.
check(() => assert.equal(slots.keyboardPhrase([completion('call r', 'Call Rishabh'), completion('call r', 'Call Rahul')], 'call r',
  ['rishabh', 'right', 'really']), null));
check(() => assert.equal(slots.keyboardPhrase([completion('call r', 'Call Rishabh'), completion('call r', 'Call Rahul')], 'call r',
  ['right', 'really']).suggestion.text, 'Call Rishabh'));

// 7. Rows: five words on top, or four and the phrase; the word that gives way steps down.
const rowWords = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
check(() => assert.deepEqual(slots.arrangeWordRows(rowWords, rowWords, false), { top: rowWords.slice(0, 5), bottom: rowWords.slice(5) }));
// The lowest-ranked of the top five (d) steps down in place of the lowest-ranked bottom word (j).
check(() => assert.deepEqual(slots.arrangeWordRows(rowWords, ['c', 'a', 'e', 'b', 'd', 'f', 'g', 'h', 'i', 'j'], true),
  { top: ['a', 'b', 'c', 'e'], bottom: ['f', 'g', 'h', 'i', 'd'] }));
// An empty top slot gives way first; nothing moves.
check(() => assert.deepEqual(slots.arrangeWordRows(['a', null, 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], rowWords, true),
  { top: ['a', 'c', 'd', 'e'], bottom: ['f', 'g', 'h', 'i', 'j'] }));
// An empty bottom slot takes the word stepping down; every other bottom word keeps its place.
check(() => assert.deepEqual(slots.arrangeWordRows(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', null, 'j'], rowWords, true),
  { top: ['a', 'b', 'c', 'd'], bottom: ['f', 'g', 'h', 'e', 'j'] }));
// Never trades a better bottom word for a worse one, and copes with short or empty boards.
check(() => assert.deepEqual(slots.arrangeWordRows(rowWords, ['f', 'g', 'h', 'i', 'j', 'a', 'b', 'c', 'd', 'e'], true),
  { top: ['a', 'b', 'c', 'd'], bottom: ['f', 'g', 'h', 'i', 'j'] }));
check(() => assert.deepEqual(slots.arrangeWordRows([], [], true), { top: [null, null, null, null], bottom: [null, null, null, null, null] }));

console.log(`Word prediction slots: ${checks} insertion, freshness, sentence, abbreviation, ten-slot, phrase-slot, row and context checks passed.`);
