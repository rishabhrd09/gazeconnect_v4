/** Synthetic gaze through the production dwell loop; isolated saves and socket.
 * Software verification only: this does not simulate Tobii tracking accuracy. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const draft=require('./compass-qa-draft.cjs');
let browser;
(async()=>{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(15000);
 const errors=[],rows=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(state=>{
  localStorage.setItem('compass_persistent_backup',JSON.stringify(state));
  window.qa={sample:null,clicks:[],capture:false};
  window.WebSocket=class {
   static OPEN=1;static CONNECTING=0;static CLOSED=3;
   constructor(){this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen?.({});this.receive({type:'connected',tts_available:false,current_screen:'home',gaze_enabled:false});},5);window.qaWS=this;}
   receive(data){this.onmessage?.({data:JSON.stringify(data)});}
   send(raw){const m=JSON.parse(raw);if(m.type==='set_screen')this.receive({type:'screen_changed',screen:m.screen});if(m.type==='set_gaze_enabled')this.receive({type:'gaze_enabled',enabled:m.enabled});}
   close(){this.readyState=3;this.onclose?.({});}
  };
  setInterval(()=>{const s=qa.sample;window.qaWS?.receive({type:'gaze',x:s?.x??.5,y:s?.y??.5,intent_x:s?.x??.5,intent_y:s?.y??.5,is_valid:!!s,signal_state:s?'valid':'lost',active_pipeline:'adaptive_cursor_v1',t_helper_ms:Date.now(),t_sent_wall_ms:Date.now(),sample_age_ms:0,coord_space:'window'});},16);
  document.addEventListener('click',e=>{if(!qa.sample)return;qa.clicks.push({id:e.target.closest('button')?.id,ms:Date.now()-qa.started});qa.sample=null;if(qa.capture){e.preventDefault();e.stopImmediatePropagation();}},true);
  speechSynthesis.speak=()=>{};window.electronAPI={on:()=>()=>{},off:()=>{},settings:{load:async()=>null,save:async()=>({success:true})}};
 },draft(false,true));
 await page.goto('http://127.0.0.1:5173');await page.locator('#kb').waitFor();
 await page.evaluate(()=>{let e=document.querySelector('#kb'),f=e[Object.keys(e).find(k=>k.startsWith('__reactFiber$'))];while(f){if(typeof f.memoizedProps?.onNavigate==='function'){f.memoizedProps.onNavigate('compass-map');return;}f=f.return;}});
 await page.click('#strip-generate');await page.click('#confirm-gen-yes');await page.locator('.studio-drawing img').waitFor();
 if(await page.locator('#compass-studio-gaze-toggle').getAttribute('aria-pressed')!=='true')await page.click('#compass-studio-gaze-toggle');
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+500));await page.clock.runFor(2000);
 async function dwell(id,capture=true){
  await page.evaluate(({id,capture})=>{qa.sample=null;window.dispatchEvent(new CustomEvent('gaze_lost'));const r=document.getElementById(id).getBoundingClientRect();qa.capture=capture;qa.clicks=[];qa.started=Date.now();qa.sample={x:(r.x+r.width/2)/innerWidth,y:(r.y+r.height/2)/innerHeight};},{id,capture});
  for(let elapsed=0;elapsed<6400;elapsed+=256){await page.clock.runFor(256);if(await page.evaluate(()=>qa.clicks.length))break;}
  const clicks=await page.evaluate(()=>qa.clicks);assert.equal(clicks.length,1,`${id}: one gaze activation`);assert.equal(clicks[0].id,id);rows.push({id,capture,...clicks[0]});await page.clock.runFor(1000);
 }
 async function audit(){
  await page.clock.runFor(1000);
  const ids=await page.evaluate(()=>[...document.querySelectorAll('.compass-plan-studio button')].filter(e=>!e.disabled&&e.getBoundingClientRect().width>0).map(e=>e.id));
  for(const id of ids)await dwell(id);
 }
 async function click(id){await page.locator('#'+id).evaluate(e=>e.click());await page.clock.runFor(800);}
 async function drawing(){
  for(let n=0;n<150;n++){if(await page.locator('.studio-drawing img').count())return;await new Promise(r=>setTimeout(r,100));await page.clock.runFor(100);}
  throw Error('Drawing did not arrive');
 }
 await audit();
 await dwell('compass-studio-details',false);await audit();
 await dwell('compass-studio-room-2',false);await drawing();assert.match(await page.locator('.studio-heading').innerText(),/Staircase/);await audit();
 await dwell('compass-studio-zoom-in',false);assert.match(await page.locator('.studio-caption').innerText(),/130%/);await audit();
 await dwell('compass-studio-zoom-out',false);await dwell('compass-studio-inspect',false);await drawing();assert.match(await page.locator('#compass-studio-inspect').innerText(),/View 2/);
 await dwell('compass-studio-back',false);await drawing();
 await dwell('compass-studio-view',false);await audit();await click('compass-studio-styles');await audit();
 await dwell('compass-studio-style-warm-modern',false);await drawing();assert.equal(await page.evaluate(()=>localStorage.getItem('gc-compass-exterior')),'warm-modern');await audit();
 await dwell('compass-studio-back',false);assert.equal(await page.locator('.compass-plan-studio').count(),0);
 assert.deepEqual(errors,[]);if(process.env.COMPASS_DWELL_OUTPUT)fs.writeFileSync(process.env.COMPASS_DWELL_OUTPUT,JSON.stringify(rows,null,2));
 console.log(`PASS: ${rows.length} real browser dwell activations, including room opening, zoom, rotation, exterior finish and return to map. No duplicate selections.`);
 await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
