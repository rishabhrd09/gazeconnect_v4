// Add to Message (10 Oct 2026, src/utils/addToMessage.ts): the real flow rules, compiled on the
// fly, and the wiring of the screens that use them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('src/utils/addToMessage.ts'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, { module: mod, exports: mod.exports, Set });
const flow = mod.exports;

let checks = 0;
const expect = (value, message) => { checks += 1; assert.ok(value, message); };

// 1. Where the flow returns: set from a typing screen, kept inside the flow, ended outside it.
const after = flow.messageReturnAfter;
expect(after('keyboard', 'add-to-message', null) === 'keyboard', 'opened from the keyboard, it returns to the keyboard');
expect(after('spatial', 'add-to-message', null) === 'spatial', 'opened from Zone Board, it returns to Zone Board');
for (const screen of ['quickwords', 'phrases', 'people', 'medical']) {
  expect(after('add-to-message', screen, 'keyboard') === 'keyboard', `a card's screen (${screen}) keeps adding to the message`);
  expect(after(screen, 'add-to-message', 'spatial') === 'spatial', `Back from ${screen} keeps the flow`);
  expect(after('home', screen, null) === null, `${screen} reached from Home speaks as before`);
}
expect(after('keyboard', 'quickwords', null) === 'keyboard', 'an older path straight to Quick Phrases still adds to the message');
for (const screen of ['keyboard', 'spatial', 'home', 'settings', 'web', 'needs', 'feelings']) {
  expect(after('phrases', screen, 'keyboard') === null, `leaving for ${screen} ends the flow`);
}

// 2. How a choice joins the message.
const add = flow.appendToMessage;
expect(add('', 'I need water') === 'I need water ', 'an empty message takes the words and a space');
expect(add('Please ', 'call Rahul') === 'Please call Rahul ', 'after a space, no second space');
expect(add('Please', 'call Rahul') === 'Please call Rahul ', 'after a word, one space between');
expect(add('Line one\n', 'Mom') === 'Line one\nMom ', 'after a new line, no space');
expect(add('Hello ', '  ') === 'Hello ', 'nothing to add changes nothing');
expect(add('Hi ', '  Dr.   Mehta ') === 'Hi Dr. Mehta ', 'spacing inside a choice is tidied');

// 3. The end of the message shown while choosing.
const tail = flow.messageTail;
expect(tail('') === '' && tail('  short message  ') === 'short message', 'a short message is shown whole');
const long = 'I would like to go out in the garden this evening if the weather is pleasant enough for a walk';
const shown = tail(long, 40);
expect(shown.startsWith('…') && shown.length <= 40 && long.endsWith(shown.slice(1)), `a long message shows its end: "${shown}"`);
const from = long.lastIndexOf(shown.slice(1));
expect(from > 0 && long[from - 1] === ' ', 'the end starts at the beginning of a word');

// 4. The wiring.
const app = read('src/App.tsx');
for (const screen of ['PhrasesScreen', 'PeopleScreen', 'MedicalScreen', 'QuickWordsScreen']) {
  expect(new RegExp(`<${screen} \\{\\.\\.\\.common\\} addToMessage=\\{addToMessage\\}`).test(app), `${screen} is given the flow`);
}
expect(/case ADD_TO_MESSAGE_SCREEN: return <AddToMessageScreen/.test(app), 'the Add to Message screen is routed');
expect(/messageReturnAfter\(currentScreen, s, previous\)/.test(app), 'every navigation applies the flow rule');
expect(/appendToMessage\(prev, words\)/.test(app) && /handleNavigate\(messageReturnScreen \|\| 'keyboard'\)/.test(app),
  'a choice joins the message and the typing screen comes back');
expect(read('src/screens/KeyboardScreen.tsx').split("onNavigate('add-to-message')").length === 3, 'both Quick Words on the keyboard open Add to Message');
expect(read('src/screens/SpatialKeyboardScreen.tsx').includes("onClick={() => onNavigate('add-to-message')}>"), "Zone Board's Quick Phrases opens Add to Message");
expect(read('src/components/GlobalNavBar.tsx').includes("onQuickWords ? onQuickWords() : onNavigate('add-to-message')"), 'the navigation Quick Words opens Add to Message');
expect(read('src/screens/HomeScreen.tsx').includes("onClick={() => onNavigate('quickwords')}"), "Home's Quick Phrases still opens Quick Phrases to speak");

const screen = read('src/screens/AddToMessageScreen.tsx');
const cards = [...screen.matchAll(/\{ id: '(\w+)', label: '([^']+)', detail: '[^']+', screen: '([\w-]+)'/g)].map((m) => [m[1], m[2], m[3]]);
assert.deepEqual(cards, [['quick', 'Quick Phrases', 'quickwords'], ['phrases', 'Phrases', 'phrases'], ['people', 'People', 'people'],
  ['assistance', 'Daily Assistance', 'medical']]);
checks += 1;
expect(screen.includes('dwellCategory="homeScreenTile"'), 'the cards take the time of Home cards');
expect(screen.includes('onBack={() => onNavigate(returnScreen)}'), 'Back returns to the typing screen');
const css = read('src/styles/design-modes.css');
expect(/\.add-message-grid \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\); grid-template-rows: repeat\(2,minmax\(0,1fr\)\)/.test(css), 'the cards are two by two');

// Urgent care requests are spoken at once, never parked in the message.
const medical = read('src/screens/MedicalScreen.tsx');
expect(/if \(addToMessage && !item\.urgent\) \{\s*addToMessage\.add\(item\.en\);\s*return;\s*\}\s*onSpeak\(item\.en\);/.test(medical),
  'an urgent request is spoken even while adding to the message');
const quick = read('src/screens/QuickWordsScreen.tsx');
expect(/categories\.find\(category => category\.id === 'emergency'\)/.test(quick) &&
  /if \(addToMessage && addsToMessage\(activeWord\)\) \{\s*setActiveWord\(null\);\s*addToMessage\.add\(phrase\.en\);/.test(quick),
  "Quick Phrases' Medical / Urgent words and phrases are spoken even while adding to the message");
for (const [file, call] of [['src/screens/PhrasesScreen.tsx', 'addToMessage.add(phrase.en)'], ['src/screens/PeopleScreen.tsx', 'addToMessage.add(p.name)'],
  ['src/screens/QuickWordsScreen.tsx', 'addToMessage.add(phrase.en)']]) {
  const source = read(file);
  expect(source.includes(call) && source.includes('onBack={addToMessage?.back}') && source.includes('<AddToMessageNote text={addToMessage.text} />'),
    `${path.basename(file)} adds the choice, offers Back to the cards and shows the note`);
}
expect(medical.includes('onBack={addToMessage?.back}') && medical.includes('<AddToMessageNote text={addToMessage.text} />'),
  'Daily Assistance offers Back to the cards and shows the note');

console.log(`Add to Message: ${checks} checks passed.`);
