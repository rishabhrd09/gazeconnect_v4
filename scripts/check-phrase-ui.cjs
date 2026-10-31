// Real UI actions with real Python word/phrase fixtures, isolated browser settings,
// no patient backend or speech. Optional HEAD server compares target geometry.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const gazeProbe=require('./design-gaze-probe.cjs')(path.resolve(__dirname,'..'));
const base=process.env.DESIGN_QA_URL || 'http://127.0.0.1:5184';
const baseline=process.env.PREDICTION_BASELINE_URL;
const out=process.env.PREDICTION_QA_OUTPUT || '/private/tmp/gazeconnect-phrase-ui';fs.mkdirSync(out,{recursive:true});
const python=process.env.PREDICTION_PYTHON || (process.platform==='win32'?'python/.venv/Scripts/python.exe':'python/.venv/bin/python');
const longPhrase='Please bring my reading glasses from the bedside table, turn on the small lamp, and help me sit a little more upright so I can read my book comfortably before dinner and then call Rishabh when he is free to talk with me about tomorrow.';
const drafts=['i need wa','i need water ','I need suction ','suction','I am cold. i need wa','Please bring my reading gl'];
const fixtures=JSON.parse(cp.execFileSync(python,['-c',`
import sys,json
sys.path.insert(0,'python')
from services.deterministic_prediction import worker
from services.phrase_prediction import suggest_phrases
worker.initialize()
result={}
for draft in json.loads(sys.stdin.read()):
 r=worker.predict({'draft':draft,'slot_count':10})
 result[draft]={'word_slots':r['slots'],'words':[{'word':w,'score':r['scores'][w]} for w in r['ranked']], 'sentences':suggest_phrases(draft,{},['I need water now','I need warm water','I need water from the bedside table please',${JSON.stringify(longPhrase)}])}
print(json.dumps(result))
`],{input:JSON.stringify(drafts),encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}));
(async()=>{
 const browser=await chromium.launch({headless:true});const errors=[],rows=[];let comparisons=0;
 // While `held` is set, prediction replies wait in it (the response to a keystroke still on its way).
 let held=null;
 async function boot(url,opts){
  const p=await browser.newPage({viewport:{width:opts.width,height:opts.width===1366?768:1080}});p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(o=>{
   localStorage.setItem('gc-theme',o.theme);sessionStorage.setItem('gazeconnect_keyboard_text_session',o.draft);
   window.qa={calls:[],saved:JSON.parse(sessionStorage.getItem('qa-profile')||'null')??{version:1,settings:{designMode:o.mode,keyboardFeel:o.feel}}};
   speechSynthesis.speak=()=>{throw Error('No system speech allowed in this check');};
   window.electronAPI={on:()=>()=>{},off:()=>{},updateAppContext:()=>{},settings:{load:async()=>qa.saved,save:async d=>{qa.saved=d;sessionStorage.setItem('qa-profile',JSON.stringify(d));return{success:true};}}};
  },opts);
  await p.routeWebSocket('ws://127.0.0.1:8765',ws=>{
   ws.onMessage(raw=>{const m=JSON.parse(raw);p.evaluate(m=>qa.calls.push(m),m).catch(()=>{});
    if(m.type==='get_predictions'){const reply=()=>ws.send(JSON.stringify({type:'predictions',request_id:m.request_id,prediction:{text:m.text,prefix:m.text.match(/[a-z]+$/i)?.[0]||''},...(fixtures[m.text]??{word_slots:Array(10).fill(null),words:[],sentences:[]})}));if(held)held.push(reply);else reply();}
   });
   ws.send(JSON.stringify({type:'connected',tts_available:true,tts_voice:'af_heart',tts_state:'ready',gaze_enabled:false,current_screen:'home'}));
  });
  await p.goto(url);await p.click('#kb');await p.waitForFunction(()=>document.querySelectorAll('.keyboard-word-slot').length+document.querySelectorAll('.keyboard-phrase-slot').length>=10);
  await p.evaluate(()=>document.fonts.ready);await p.mouse.move(0,0);
  await p.waitForFunction(()=>!document.querySelector('#phrase-suggestion-0')?.disabled);
  return p;
 }
 async function settle(p){await p.mouse.move(0,0);await p.locator('.keyboard-screen').evaluate(async e=>{await new Promise(requestAnimationFrame);await Promise.all(e.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});}
 // Word rows by their row boxes: their slots were redesigned on 29 Oct 2026 (five equal top slots,
 // four words and a phrase or five words); keys, message, rows and SHOW NAV must not move.
 async function geometry(p){return p.locator('button.keyboard-key,.keyboard-word-row,.keyboard-message,#nav-restore-btn').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{id:e.id,classes:e.className,rect:[r.x,r.y,r.width,r.height].map(n=>+n.toFixed(3)),font:[s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight],dwell:e.getAttribute('data-gaze-dwell-ms')};}));}
 async function targets(p){return p.locator('.phrase-panel button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{id:e.id,w:r.width,h:r.height,x:r.x,y:r.y};}));}
 for(const width of (process.env.PHRASE_QA_EDGE_ONLY==='1'?[]:[1366,1920]))for(const mode of ['focus','serene'])for(const theme of ['dark','warm','midnight-navy'])for(const feel of ['standard','familiar']){
  const opts={width,mode,theme,feel,draft:'i need wa'};const p=await boot(base,opts);const old=baseline?await boot(baseline,opts):null;
  assert.equal(await p.locator('.phrase-panel').count(),0);
  assert.equal(await p.locator('.keyboard-phrase-action-label').innerText(),'Add phrase');
  assert.equal(await p.locator('.keyboard-message').evaluate(e=>e.querySelectorAll('.phrase-panel,.keyboard-phrase-action-label').length),0);
  for(const nav of [false,true]){
   if(nav){await p.click('#nav-restore-btn');if(old)await old.click('#nav-restore-btn');}
   await settle(p);if(old){await settle(old);const a=await geometry(old),b=await geometry(p);if(JSON.stringify(a)!==JSON.stringify(b))fs.writeFileSync(path.join(out,'geometry-mismatch.json'),JSON.stringify({opts,a,b,old:await old.evaluate(()=>({fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),keys:[...document.querySelectorAll('.keyboard-key')].slice(-4).map(e=>({html:e.outerHTML,flex:getComputedStyle(e).flex,width:getComputedStyle(e).width}))})),now:await p.evaluate(()=>({fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),keys:[...document.querySelectorAll('.keyboard-key')].slice(-4).map(e=>({html:e.outerHTML,flex:getComputedStyle(e).flex,width:getComputedStyle(e).width}))}))},null,2));assert.deepEqual(b,a,'Keyboard target changed '+JSON.stringify(opts));comparisons+=b.length;}
  }
  await p.click('#display-expand-toggle');await p.click('#browse-suggested-phrases');
  await p.locator('.phrase-panel').waitFor();const rects=await targets(p);
  for(const r of rects){assert(r.w>=80&&r.h>=80,JSON.stringify(r));assert(r.x>=0&&r.y>=0&&r.x+r.w<=width+1&&r.y+r.h<=(width===1366?768:1080)+1,JSON.stringify(r));}
  assert.deepEqual((await p.evaluate(gazeProbe)).misses,[],'Gaze picker missed a phrase-panel target');
  await p.click('#phrase-panel-back');assert.equal(await p.locator('.phrase-panel').count(),0);assert(await p.locator('[data-action=letter]').first().isVisible());
  assert.equal((await p.locator('.keyboard-message-text').innerText()).trim(),'i need wa');
  await p.click('#phrase-suggestion-0');assert.equal((await p.locator('.keyboard-message-text').innerText()).trim(),'i need water now');
  assert.equal(await p.locator('.phrase-panel').count(),0);
  assert.equal(await p.evaluate(()=>qa.calls.filter(m=>m.type==='speak'||m.type==='learn_sentence').length),0);
  await p.waitForFunction(()=>qa.calls.some(m=>m.type==='accept_phrase'));
  rows.push({...opts,targets:rects});if(width===1366&&theme==='dark'&&feel==='familiar')await p.screenshot({path:path.join(out,'keyboard-'+mode+'.png')});
  await p.close();if(old)await old.close();
  const q=await boot(base,{...opts,draft:'suction'});
  await q.click('#phrase-suggestion-0');assert.equal((await q.locator('.keyboard-message-text').innerText()).trim(),'suction');
  await q.locator('#phrase-review-use').waitFor();for(const r of await targets(q))assert(r.w>=80&&r.h>=80);
  assert.deepEqual((await q.evaluate(gazeProbe)).misses,[],'Gaze picker missed a replacement-review target');
  assert.equal(await q.evaluate(()=>qa.calls.filter(m=>m.type==='accept_phrase'||m.type==='speak').length),0);
  await q.click('#phrase-review-cancel');assert.equal((await q.locator('.keyboard-message-text').innerText()).trim(),'suction');
  await q.click('#phrase-suggestion-0');const expected=(await q.locator('.phrase-review-result').innerText()).trim();
  if(width===1366&&mode==='focus'&&theme==='dark'&&feel==='familiar')await q.screenshot({path:path.join(out,'review-phrase.png')});
  await q.click('#phrase-review-use');assert.equal((await q.locator('.keyboard-message-text').innerText()).trim(),expected);
  assert(!expected.toLowerCase().startsWith('suction '));assert.equal(await q.locator('.phrase-panel').count(),0);
  await q.click('#display-speak-button');await q.waitForFunction(()=>qa.calls.some(m=>m.type==='speak'));
  assert.equal(await q.evaluate(()=>qa.calls.filter(m=>m.type==='speak').length),1);
  assert.equal(await q.evaluate(()=>qa.calls.filter(m=>m.type==='learn_sentence').length),0);
  await q.close();console.log(width,mode,theme,feel,'phrase insert / browse / review / speech passed');
 }
 // The row keeps its shape while a keystroke's response is on its way (29 Oct 2026): the phrase stays,
 // not selectable, instead of giving way to a fifth word until the response arrives.
 const waiting=await boot(base,{width:1366,mode:'focus',theme:'dark',feel:'familiar',draft:'i need wa'});
 const shownPhrase=await waiting.locator('#phrase-suggestion-0').getAttribute('aria-label');assert.equal(shownPhrase,'Add phrase: I need water now');
 held=[];await waiting.locator('[data-action=letter]').filter({hasText:/^t$/i}).click();
 await waiting.waitForFunction(()=>qa.calls.some(m=>m.type==='get_predictions'&&m.text==='i need wat'));
 assert.equal(await waiting.evaluate(()=>document.querySelector('#phrase-suggestion-0')?.getAttribute('aria-label')??null),shownPhrase,'The phrase gave way before the response arrived');
 assert(await waiting.locator('#phrase-suggestion-0').isDisabled());assert.equal(await waiting.locator('#phrase-suggestion-0.keyboard-phrase-slot-stale').count(),1);
 assert.equal(await waiting.locator('.keyboard-word-row-top .keyboard-word-slot').count(),4);
 const replies=held;held=null;replies.forEach(reply=>reply());
 await waiting.waitForFunction(()=>!document.querySelector('#phrase-suggestion-0')&&document.querySelectorAll('.keyboard-word-row-top .keyboard-word-slot').length===5);
 await waiting.close();
 const narrow=await boot(base,{width:1366,mode:'focus',theme:'dark',feel:'familiar',draft:'i need wa'});
 // 120 px: since 29 Oct 2026 a phrase takes two lines at 22 px or more, so 160 px now holds this one.
 await narrow.addStyleTag({content:'.keyboard-screen #phrase-suggestion-0 { width:120px!important; height:80px!important; min-height:80px!important; }'});
 await narrow.waitForFunction(()=>document.querySelector('#phrase-suggestion-0')?.getAttribute('aria-label')==='Browse suggested phrases');
 assert.equal((await narrow.locator('.keyboard-message-text').innerText()).trim(),'i need wa');
 await narrow.click('#phrase-suggestion-0');await narrow.locator('.phrase-panel').waitFor();
 assert((await narrow.locator('#phrase-panel-choice-0').innerText()).includes('I need water now'));
 await narrow.click('#phrase-panel-choice-0');assert.equal((await narrow.locator('.keyboard-message-text').innerText()).trim(),'i need water now');
 await narrow.close();
 const long=await boot(base,{width:1366,mode:'focus',theme:'dark',feel:'familiar',draft:'Please bring my reading gl'});
 await long.click('#phrase-suggestion-0');await long.locator('.phrase-panel').waitFor();
 assert((await long.locator('#phrase-panel-choice-0').innerText()).includes(longPhrase));
 const fullCopy=await long.locator('#phrase-panel-choice-0').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,width:e.clientWidth,scrollWidth:e.scrollWidth}));
 assert(fullCopy.scroll<=fullCopy.height+1&&fullCopy.scrollWidth<=fullCopy.width+1,'Long phrase is clipped: '+JSON.stringify(fullCopy));
 await long.click('#phrase-panel-choice-0');assert.equal((await long.locator('.keyboard-message-text').innerText()).trim(),longPhrase);
 await long.close();
 const settings=await boot(base,{width:1366,mode:'focus',theme:'dark',feel:'familiar',draft:'i need wa'});
 await settings.click('#nav-restore-btn');await settings.getByRole('button',{name:'Home',exact:true}).click();await settings.click('#st');await settings.click('#sidebar-phrases');
 await settings.locator('.pp-accordion-header').first().click();await settings.locator('summary').filter({hasText:'Suggestion preferences'}).first().click();
 await settings.getByPlaceholder('For example: glasses, spectacles').first().fill('spectacles, readers');
 await settings.getByLabel('Offer while typing',{exact:false}).first().uncheck();
 await settings.getByLabel('Preference among matching phrases',{exact:false}).first().selectOption('5');
 await settings.getByRole('button',{name:'Save All Changes',exact:true}).click();
 await settings.waitForFunction(()=>qa.saved.phraseCategories?.[0]?.phrases?.[0]?.prediction?.priority===5);
 const preference=await settings.evaluate(()=>qa.saved.phraseCategories[0].phrases[0].prediction);
 assert.deepEqual(preference,{keywords:['spectacles',' readers'],enabled:false,priority:5});
 await settings.reload();await settings.click('#st');await settings.click('#sidebar-phrases');
 await settings.locator('.pp-accordion-header').first().click();await settings.locator('summary').filter({hasText:'Suggestion preferences'}).first().click();
 assert.equal(await settings.getByPlaceholder('For example: glasses, spectacles').first().inputValue(),'spectacles, readers');
 assert.equal(await settings.getByLabel('Offer while typing',{exact:false}).first().isChecked(),false);
 assert.equal(await settings.getByLabel('Preference among matching phrases',{exact:false}).first().inputValue(),'5');
 await settings.close();
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({comparisons,states:rows.length,edgeChecksPassed:true,rows,errors},null,2));
 console.log('PASS: '+comparisons+' original target comparisons; '+rows.length+' layout/theme/feel combinations; explicit-only phrase edits; no message-display suggestions or automatic speech.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
