/** Real WebSocket/worker-to-keyboard integration. Requires an isolated backend
 * with temporary data. Browser settings/drafts are isolated; speech is muted. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const WS=process.env.PREDICTION_QA_WS_URL;
assert(WS && !WS.includes(':8765'), 'Provide an isolated test backend via PREDICTION_QA_WS_URL; never use patient port 8765');
const OUT=process.env.PREDICTION_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'gaze-predictions-'));fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const b=await chromium.launch({headless:true}),p=await b.newPage();const rows=[],errors=[];let promotions=0;p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);
 await p.addInitScript(testUrl=>{
  const fixture=JSON.parse(sessionStorage.getItem('fixture')||'null');
  if(fixture){sessionStorage.clear();sessionStorage.setItem('fixture',JSON.stringify(fixture));localStorage.clear();localStorage.setItem('gc-theme',fixture.theme);sessionStorage.setItem('profile',JSON.stringify({version:1,settings:{designMode:fixture.mode,keyboardFeel:fixture.feel}}));}
  window.qa={sent:[],received:[]};const Native=WebSocket;
  window.WebSocket=class extends Native {constructor(url,...args){super(String(url).includes(':8765') ? testUrl : url,...args);window.qaSocket=this;this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='predictions')qa.received.push({at:performance.now(),data:m});});}send(raw){const m=JSON.parse(raw);if(m.type==='get_predictions')qa.sent.push({at:performance.now(),data:m});super.send(raw);}};
  speechSynthesis.speak=()=>{};window.electronAPI={on:()=>()=>{},off:()=>{},settings:{load:async()=>JSON.parse(sessionStorage.getItem('profile')||'null'),save:async d=>{sessionStorage.setItem('profile',JSON.stringify(d));return{success:true}}}};
 },WS);
 for(const width of [1366,1920])for(const mode of ['focus','serene'])for(const theme of ['dark','warm','midnight-navy'])for(const feel of ['standard','familiar']){
  await p.setViewportSize({width,height:width===1366?768:1080});await p.goto(process.env.DESIGN_QA_URL || 'http://127.0.0.1:5173');await p.evaluate(f=>sessionStorage.setItem('fixture',JSON.stringify(f)),{mode,theme,feel});await p.reload();await p.click('#kb');
  await p.waitForFunction(()=>document.querySelectorAll('button.keyboard-word-slot:not(:disabled)').length===10).catch(async e=>{console.error(await p.evaluate(()=>({qa,body:document.body.innerText})));throw e;});
  assert.equal(await p.locator('html').getAttribute('data-theme'),theme);assert.equal(await p.locator('html').getAttribute('data-design'),mode);
  const empty=await p.locator('button.keyboard-word-slot').allTextContents();assert.equal(empty.length,10);
  assert.equal(await p.locator('.keyboard-phrase-slot').count(),0,'An opening phrase took a word slot on the empty draft');
  // The rows as drawn, and as the shared helpers lay out the latest reply (29 Oct 2026: five equal
  // top slots holding five words, or four and a confident phrase on the right).
  const layout=()=>p.evaluate(async()=>{
   const m=await import('/src/utils/wordPredictionSlots.ts');const reply=qa.received.at(-1).data,text=reply.prediction.text;
   const slots=m.presentWordSlots(reply.word_slots,reply.words,text),phrase=m.keyboardPhrase(reply.sentences||[],text,slots);
   const expected=m.arrangeWordRows(slots,reply.words.map(w=>w.word),phrase!==null);
   const read=row=>[...document.querySelectorAll(`.keyboard-word-row-${row} .keyboard-word-slot`)].map(e=>e.tagName==='BUTTON'?e.textContent.trim():null);
   const cell=document.querySelector('.keyboard-word-row-top .keyboard-phrase-slot');
   return {reply,phrase,expected,top:read('top'),bottom:read('bottom'),cell:cell&&{text:cell.textContent.trim(),button:cell.tagName==='BUTTON',disabled:cell.disabled===true}};
  });
  const checkRows=(view,draft)=>{
   assert.deepEqual({top:view.top,bottom:view.bottom},view.expected,draft+': renderer changed the backend slots');
   assert.equal(!!view.cell,!!view.phrase,draft+': phrase slot out of turn');
   assert.equal(view.top.length+(view.cell?1:0),5,draft+': the top row is not five slots');
   const ranked=view.reply.words.map(w=>w.word),shown=[...view.top,...view.bottom].filter(Boolean);
   assert(view.top.filter(Boolean).every(w=>ranked.slice(0,5).includes(w)),draft+': a lower-priority word on the top row');
   const dropped=ranked.filter(w=>!shown.includes(w));
   assert(dropped.length<=(view.cell?1:0)&&dropped.every(w=>shown.every(s=>ranked.indexOf(s)<ranked.indexOf(w))),draft+': a better word gave way');
  };
  for(const c of 'i need '){if(c===' ')await p.click('[data-action=space]');else await p.locator('[data-action=letter]').filter({hasText:new RegExp('^'+c+'$','i')}).click();}
  await p.waitForFunction(()=>qa.received.at(-1)?.data.prediction.text.toLowerCase()==='i need ').catch(async e=>{console.error(JSON.stringify(await p.evaluate(()=>({qa,body:document.body.innerText})),null,2));throw e;});
  await p.waitForFunction(()=>[...document.querySelectorAll('button.keyboard-word-slot')].some(e=>e.innerText.trim().toLowerCase()==='water'&&!e.disabled));
  const start=await layout();checkRows(start,'i need ');const phrase=start.cell?.text??null;
  const slots=await p.locator('button.keyboard-word-slot,button.keyboard-phrase-slot').evaluateAll(es=>es.map(e=>({id:e.id,text:e.innerText.trim(),visible:e.getBoundingClientRect().width>0,disabled:e.disabled,y:e.getBoundingClientRect().y})));
  assert.equal(slots.length,10);assert(slots.every(e=>e.visible&&!e.disabled));assert(new Set(slots.map(e=>Math.round(e.y))).size>=2);
  const rowPromotions=[];let previous=start.reply.word_slots;
  for(const [index,c] of [...'wate'].entries()){
   await p.evaluate(()=>{qa.oldButtons=[...document.querySelectorAll('button.keyboard-word-slot')].map(e=>({id:e.id,word:e.textContent.trim(),element:e}));});
   await p.locator('[data-action=letter]').filter({hasText:new RegExp('^'+c+'$','i')}).click();
   const draft='i need '+'wate'.slice(0,index+1);
   await p.waitForFunction(text=>qa.received.at(-1)?.data.prediction.text.toLowerCase()===text,draft);
   await p.waitForFunction(()=>[...document.querySelectorAll('button.keyboard-word-slot')].every(e=>!e.disabled));
   const view=await layout();checkRows(view,draft);
   // Promotions are the backend's lineage, counted on its slots before a phrase's step down.
   const promoted=view.reply.word_slots.slice(0,5).filter(w=>w&&previous.slice(5).includes(w));promotions+=promoted.length;
   rowPromotions.push({draft,promoted,top:view.top,phrase:view.cell?.text??null,bottom:view.bottom});previous=view.reply.word_slots;
   assert(await p.evaluate(()=>qa.oldButtons.every(old=>{const next=document.getElementById(old.id);return next?.textContent.trim()===old.word||!old.element.isConnected;})),'Changed suggestion retained its old dwell target');
  }
  await p.locator('button.keyboard-word-slot').filter({hasText:/^water$/i}).click();
  await p.waitForFunction(()=>document.querySelector('.keyboard-message-text')?.textContent.toLowerCase().includes('i need water'));
  // A reconnect must regenerate the slots for the retained draft.
  const responsesBefore=await p.evaluate(()=>qa.received.length);
  await p.evaluate(()=>qaSocket.close());await p.waitForFunction(n=>qa.received.length>n && qa.received.at(-1)?.data.prediction.text.toLowerCase()==='i need water ',responsesBefore);
  // A completed phrase must leave the sole inline cell. Start another
  // sentence to test completion without overwriting the one already authored.
  assert(await p.evaluate(()=>qa.received.at(-1).data.sentences.every(s=>s.text.trim().toLowerCase()!=='i need water')));
  await p.locator('[data-action=letter]').filter({hasText:/^\?$/}).click();
  // "please call": since 29 Oct 2026 the slot offers a phrase only when it adds more than a word slot
  // (the household's "I need Water" at "i need wa" only repeats the word water) and is a confident match.
  for(const c of 'please call'){if(c===' ')await p.click('[data-action=space]');else await p.locator('[data-action=letter]').filter({hasText:new RegExp('^'+c+'$','i')}).click();}
  await p.waitForFunction(()=>qa.received.at(-1)?.data.prediction.text.toLowerCase()==='i need water? please call');
  await p.waitForFunction(()=>document.querySelector('button.keyboard-phrase-slot')?.textContent.toLowerCase().includes('please call')&&!document.querySelector('button.keyboard-phrase-slot').disabled);
  checkRows(await layout(),'i need water? please call');
  const expected=await p.evaluate(async()=>{const {acceptSentenceSuggestion}=await import('/src/utils/wordPredictionSlots.ts');const reply=qa.received.at(-1).data;const label=document.querySelector('button.keyboard-phrase-slot').textContent;const suggestion=reply.sentences.find(s=>label.includes(s.text));return acceptSentenceSuggestion(reply.prediction.text,suggestion);});
  assert(expected.startsWith('i need water? '));
  await p.locator('button.keyboard-phrase-slot').click();
  const text=await p.locator('.keyboard-message-text').innerText();assert.equal(text.trim(),expected.trim());
  rows.push({width,mode,theme,feel,empty,slots,rowPromotions,phrase,after:text,requests:await p.evaluate(()=>qa.sent.length)});
  await p.screenshot({path:path.join(OUT,`predictions-${width}-${mode}-${theme}-${feel}.png`)});console.log(width,mode,theme,feel,'real predictions, row promotion and selection passed');
 }
 assert(promotions>0,'No real bottom-to-top promotions were exercised');assert.deepEqual(errors,[]);fs.writeFileSync(path.join(OUT,'predictions.json'),JSON.stringify({rows,promotions,errors},null,2));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
