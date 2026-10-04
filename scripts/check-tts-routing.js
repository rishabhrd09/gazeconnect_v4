// One voice across every speech action; no OS/browser substitution.
const { execFileSync } = require('child_process');
const path = require('path'), fs = require('fs'), assert = require('assert/strict');
const root = path.resolve(__dirname, '..'), outDir = path.join(root, '.tmp-tts-routing-check');
try {
  execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
    'src/utils/ttsRouting.ts', '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'], {cwd:root,stdio:'inherit'});
  const {chooseSpeechRoute} = require(path.join(outDir,'ttsRouting.js'));
  const base = {text:'I need water',volume:1,backendConnected:true,backendVoice:'af_heart'};
  assert.equal(chooseSpeechRoute(base),'backend');
  assert.equal(chooseSpeechRoute({...base,volume:0}),'mute');
  assert.equal(chooseSpeechRoute({...base,volume:NaN}),'mute');
  assert.equal(chooseSpeechRoute({...base,text:'  '}),'mute');
  assert.equal(chooseSpeechRoute({...base,backendConnected:false}),'unavailable');
  assert.equal(chooseSpeechRoute({...base,backendVoice:null}),'unavailable');
  assert.equal(chooseSpeechRoute({...base,backendVoice:'SAPI5'}),'unavailable');
  function scan(dir) {
    for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
      const p=path.join(dir,e.name);
      if(e.isDirectory()) scan(p);
      else if(/\.(tsx?|jsx?)$/.test(e.name)) {
        const s=fs.readFileSync(p,'utf8');
        assert(!/new\s+SpeechSynthesisUtterance|speechSynthesis\s*\.\s*speak/.test(s),`Alternate speech engine in ${p}`);
      }
    }
  }
  scan(path.join(root,'src')); scan(path.join(root,'electron'));
  const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
  assert(app.includes('chooseSpeechRoute') && app.includes('ws.speak(text)'));
  assert(app.includes('ws.stopSpeaking()') && app.includes('ws.ttsError'));
  console.log('PASS: one Kokoro voice, mute, blank input, unavailable/legacy backend, error display, no system speech paths.');
} finally { fs.rmSync(outDir,{recursive:true,force:true}); }
