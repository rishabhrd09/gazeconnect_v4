// Cross-language edit contract: real Python suggestions through the renderer's
// acceptance helpers. Synthetic content only; no personal profile is read.
const assert = require('node:assert/strict');
const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const {acceptSentenceSuggestion, inlineSentenceSuggestion} = require('../src/utils/wordPredictionSlots.ts');
const {collectPredictionContext, predictionContextKey} = require('../src/utils/predictionContext.ts');
const python = process.env.PREDICTION_PYTHON || (process.platform === 'win32' ? 'python/.venv/Scripts/python.exe' : 'python/.venv/bin/python');
const generated = cp.execFileSync(python, ['-c', `
import sys,json
sys.path.insert(0,'python')
from services.phrase_prediction import suggest_phrases
cases=[]
for draft in ['', 'i', 'i need ', 'i need wa', 'I need water ', 'I am cold. i need wa', '😊 Fine! i need wa', 'i  need\\twa', 'suction', 'i do not ', 'Can you bri', 'Please turn o', 'Call Dr. Rishabh', 'I am cold. glasses']:
 context={'history':[{'text':'Please adjust my cushion','count':1}],'empty_starters':[{'word':'I need','score':1,'source':'starter'}]}
 for s in suggest_phrases(draft,context,['Could you bring my glasses','Please adjust my cushion']):cases.append({'draft':draft,'suggestion':s})
print(json.dumps(cases))
`], {cwd:path.resolve(__dirname,'..'),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8'});
let checks=0;
for(const {draft,suggestion:s} of JSON.parse(generated)) {
  const accepted=acceptSentenceSuggestion(draft,s,true);
  assert.equal(accepted,s.result_text ?? s.text+' ');checks++;
  assert.equal(acceptSentenceSuggestion(draft+'x',s,true),null);checks++;
  if(s.requires_confirmation){assert.equal(acceptSentenceSuggestion(draft,s),null);checks++;}
  else {assert.equal(acceptSentenceSuggestion(draft,s),accepted);checks++;}
}
const short={text:'I need water',score:1,source:'test',mode:'complete_sentence',matched_text:'i need wa',replacement_start:0,result_text:'i need water '};
assert.equal(acceptSentenceSuggestion('i need wa',{...short,result_text:'i need tea '}),null);checks++;
assert.equal(acceptSentenceSuggestion('i need wa',{...short,replacement_start:999}),null);checks++;
assert.equal(inlineSentenceSuggestion([{...short,text:'A very long phrase that cannot fit inside the inline phrase cell'},short],'i need wa'),short);checks++;
const input={phraseCategories:[{id:'test',phrases:[{en:'Bring my glasses',hi:'',prediction:{enabled:false,keywords:['spectacles'],priority:5}}]}]};
const context=collectPredictionContext(input);
assert.deepEqual(context.phrases,['Bring my glasses']);checks++;
assert.deepEqual(context.phraseItems,[{text:'Bring my glasses',enabled:false,keywords:['spectacles'],priority:5}]);checks++;
assert.equal(predictionContextKey(context),predictionContextKey(collectPredictionContext(JSON.parse(JSON.stringify(input)))));checks++;
assert.notEqual(predictionContextKey(context),predictionContextKey({...context,phraseItems:[]}));checks++;
const fullName=collectPredictionContext({people:[{name:'Rishabh Sharma',isActive:true,phrases:[]}]});
assert.deepEqual(fullName.words,[]);checks++;
assert.deepEqual(fullName.phrases,[]);checks++;
assert.equal(fullName.phraseItems[0].text,'Call Rishabh Sharma');checks++;
console.log('Phrase suggestions: '+checks+' real Python/TypeScript edit, review, stale-response and saved-preference checks passed.');
