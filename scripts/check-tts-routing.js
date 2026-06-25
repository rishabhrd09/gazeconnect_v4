// Plain-node tests for the safety-critical speech routing rules
// (src/utils/ttsRouting.ts). Same pattern as check-injected-script.js:
// compile the single module standalone, require it, assert. No test
// framework needed (this machine has no pytest/jest).
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.tmp-tts-routing-check');

execSync(
  'npx tsc src/utils/ttsRouting.ts --outDir .tmp-tts-routing-check --module commonjs --target es2020 --skipLibCheck --noEmitOnError',
  { cwd: root, stdio: 'inherit' }
);

const { chooseSpeechRoute, browserRateFromWpm, splitSpeechSegments } =
  require(path.join(outDir, 'ttsRouting.js'));

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`OK   ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}\n  expected ${e}\n  actual   ${a}`);
  }
}

const HINDI = 'मुझे तुरंत मदद चाहिए।';
const MIXED = `I need help immediately. This is an emergency. ${HINDI}`;
const base = {
  ttsLanguage: 'english',
  volume: 0.8,
  backendConnected: true,
  backendTtsAvailable: true,
};

// --- Routing ---------------------------------------------------------------
check('english + connected + tts healthy -> backend',
  chooseSpeechRoute({ ...base, text: 'hello papa' }), 'backend');
check('english + connected + backend TTS DEAD -> browser (never mute)',
  chooseSpeechRoute({ ...base, text: 'hello papa', backendTtsAvailable: false }), 'browser');
check('english + disconnected -> browser fallback',
  chooseSpeechRoute({ ...base, text: 'hello papa', backendConnected: false }), 'browser');
check('pure Hindi -> browser even when backend healthy',
  chooseSpeechRoute({ ...base, text: HINDI }), 'browser');
check('mixed emergency phrase -> browser even when backend healthy',
  chooseSpeechRoute({ ...base, text: MIXED }), 'browser');
check('ttsLanguage=hindi forces browser for plain English text',
  chooseSpeechRoute({ ...base, text: 'hello', ttsLanguage: 'hindi' }), 'browser');
check('volume 0 -> mute',
  chooseSpeechRoute({ ...base, text: 'hello', volume: 0 }), 'mute');
check('blank text -> mute',
  chooseSpeechRoute({ ...base, text: '   ' }), 'mute');

// --- WPM conversion ---------------------------------------------------------
check('150 WPM -> 1.0x', browserRateFromWpm(150), 1);
check('80 WPM -> ~0.53x', Math.round(browserRateFromWpm(80) * 100) / 100, 0.53);
check('250 WPM -> ~1.67x', Math.round(browserRateFromWpm(250) * 100) / 100, 1.67);
check('legacy multiplier 1.0 passes through', browserRateFromWpm(1.0), 1);
check('absurd WPM clamps to 10x', browserRateFromWpm(99999), 10);

// --- Segmentation ------------------------------------------------------------
check('pure English -> single en-US segment',
  splitSpeechSegments('I need help immediately.'),
  [{ text: 'I need help immediately.', lang: 'en-US' }]);
check('pure Hindi -> single hi-IN segment',
  splitSpeechSegments(HINDI),
  [{ text: HINDI, lang: 'hi-IN' }]);
check('mixed emergency phrase -> en-US run then hi-IN run',
  splitSpeechSegments(MIXED),
  [
    { text: 'I need help immediately. This is an emergency.', lang: 'en-US' },
    { text: HINDI, lang: 'hi-IN' },
  ]);
check('hindi-then-english keeps order',
  splitSpeechSegments(`${HINDI} Please come now.`).map(s => s.lang),
  ['hi-IN', 'en-US']);

fs.rmSync(outDir, { recursive: true, force: true });
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll TTS routing checks passed.');
