/** Synthetic gaze through the real browser cursor and dwell loop. Uses a virtual
 * clock and an isolated WebSocket boundary; captures activations before side effects.
 * This verifies software selection, not Tobii hardware latency or accuracy. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:1366,height:768}});p.setDefaultTimeout(10000);const rows=[],errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{
  window.qa={sample:null,clicks:[],capture:false,registrations:[]};
  window.WebSocket=class {static OPEN=1;static CONNECTING=0;static CLOSED=3;constructor(){this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen?.({});this.receive({type:'connected',tts_available:false,current_screen:'home',gaze_enabled:false});},5);window.qaWS=this;}receive(data){this.onmessage?.({data:JSON.stringify(data)});}send(raw){const m=JSON.parse(raw);if(m.type==='set_screen')this.receive({type:'screen_changed',screen:m.screen});if(m.type==='set_gaze_enabled')this.receive({type:'gaze_enabled',enabled:m.enabled});if(m.type==='register_targets')qa.registrations.push(m.targets);if(m.type==='get_predictions')this.receive({type:'predictions',request_id:m.request_id,prediction:{text:m.text,prefix:''},word_slots:['please','water','help','want','need','hello','food','yes','no','thanks'],sentences:[{text:'Thank you',mode:'append',score:1}]});}close(){this.readyState=3;this.onclose?.({});}};
  setInterval(()=>{const s=qa.sample;window.qaWS?.receive({type:'gaze',x:s?.x??.5,y:s?.y??.5,intent_x:s?.x??.5,intent_y:s?.y??.5,is_valid:!!s,signal_state:s?'valid':'lost',active_pipeline:'adaptive_cursor_v1',t_helper_ms:Date.now(),t_sent_wall_ms:Date.now(),sample_age_ms:0,coord_space:'window'});},16);
  document.addEventListener('click',e=>{if(!qa.capture)return;e.preventDefault();e.stopImmediatePropagation();qa.clicks.push({id:e.target.closest('button')?.id,text:e.target.closest('button')?.textContent.trim(),ms:Date.now()-qa.started});qa.sample=null;},true);
  speechSynthesis.speak=()=>{};window.electronAPI={on:()=>()=>{},off:()=>{},settings:{load:async()=>null,save:async()=>({success:true})}};
 });
 await p.goto(process.env.DWELL_QA_URL||'http://127.0.0.1:5173');await p.locator('#kb').waitFor();await p.evaluate(()=>document.fonts.ready);
 await p.clock.install();await p.clock.pauseAt(new Date(Date.now()+500));
 for(const screen of (process.env.DWELL_QA_SCREENS||'home,keyboard,quickwords,phrases,people,medical,activities,web').split(',')){
  // Consecutive Compass cases share the same route. Close the previous room
  // picker through its real action; navigating to the same route doesn't remount it.
  await p.evaluate(()=>{qa.capture=false;qa.sample=null;document.querySelector('#back-map')?.click();});
  await p.clock.runFor(300);
  await p.evaluate(screen=>{qa.capture=false;qa.sample=null;let e=document.querySelector('button');let f=e[Object.keys(e).find(k=>k.startsWith('__reactFiber$'))];while(f){if(typeof f.memoizedProps?.onNavigate==='function'){f.memoizedProps.onNavigate(screen);return;}f=f.return;}throw Error('route missing');},screen.startsWith('compass-') ? 'compass-map' : screen);await p.clock.runFor(1500);
  if(screen.startsWith('compass-')) {
   // Let the lazy map module mount before advancing the foundation's virtual timers.
   for(let i=0;i<20 && !await p.locator('#f-skip,#strip-rooms').count();i++){await new Promise(r=>setTimeout(r,100));await p.clock.runFor(1000);}
   for(let i=0;i<8 && await p.locator('#f-skip').count();i++){await p.locator('#f-skip').evaluate(e=>e.click());await p.clock.runFor(100);}
   await p.clock.runFor(3500);
   if(screen==='compass-nav')await p.locator('#nav-restore').evaluate(e=>e.click());
   if(screen==='compass-rooms'||screen==='compass-rooms-2'){
    await p.locator('#strip-rooms').evaluate(e=>e.click());await p.clock.runFor(300);
    if(screen==='compass-rooms-2'){await p.locator('#menu-next').evaluate(e=>e.click());await p.clock.runFor(300);}
    await p.locator('#menu-ready').evaluate(e=>e.click());
   } else await p.locator('#ready-road-left').evaluate(e=>e.click());
   await p.clock.runFor(1000);
  }
  await p.evaluate(()=>{const t=[...document.querySelectorAll('[data-gaze-toggle="true"]')].find(e=>e.textContent.includes('Enable'));t?.click();});await p.clock.runFor(2000);
  const targets=await p.evaluate(()=>[...document.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return !e.disabled&&e.getAttribute('data-gaze')!=='false'&&(e.getAttribute('data-gaze')==='true'||e.getAttribute('data-gaze-toggle')==='true')&&r.width>0&&r.height>0&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}).map((e,i)=>{e.setAttribute('data-qa-target',String(i));const r=e.getBoundingClientRect();return{id:e.id,text:e.textContent.trim(),i,x:(r.x+r.width/2)/innerWidth,y:(r.y+r.height/2)/innerHeight};}));
  for(const t of targets){
   // Compass deliberately disarms after 45 seconds. Re-arm through its real READY
   // control between independent cases rather than disabling that safety timer.
   if(screen==='compass-nav'||screen==='compass-map') {
    await p.evaluate(()=>{qa.capture=false;qa.sample=null;const ready=document.querySelector('#ready-road-left');if(ready?.getAttribute('aria-pressed')==='false')ready.click();});
    await p.clock.runFor(500);
   }
   await p.evaluate(t=>{qa.sample=null;window.dispatchEvent(new CustomEvent('gaze_lost'));qa.capture=true;qa.clicks=[];qa.started=Date.now();qa.sample={x:t.x,y:t.y};},t);for(let elapsed=0;elapsed<6400;elapsed+=256){await p.clock.runFor(256);if(await p.evaluate(()=>qa.clicks.length))break;}const clicks=await p.evaluate(()=>qa.clicks);rows.push({screen,target:t.id||t.text,clicks});
   if(!clicks.length) console.error(await p.evaluate(t=>({target:t,atPoint:document.elementFromPoint(t.x*innerWidth,t.y*innerHeight)?.outerHTML.slice(0,300),rect:document.getElementById(t.id)?.getBoundingClientRect().toJSON(),attributes:document.getElementById(t.id)?.outerHTML.slice(0,900),sample:qa.sample,registered:qa.registrations.at(-1)?.find(x=>x.id===t.id)}),t));
   assert.equal(clicks.length,1,JSON.stringify(rows.at(-1)));assert.equal(clicks[0].id,t.id,JSON.stringify(rows.at(-1)));if(!t.id)assert.equal(clicks[0].text,t.text);await p.clock.runFor(1000);}
  console.log(screen,targets.length,'actual browser dwell selections passed');if(process.env.DWELL_QA_OUTPUT)fs.writeFileSync(process.env.DWELL_QA_OUTPUT,JSON.stringify({rows,errors},null,2));
 }
 assert.deepEqual(errors,[]);if(process.env.DWELL_QA_OUTPUT)fs.writeFileSync(process.env.DWELL_QA_OUTPUT,JSON.stringify({rows,errors},null,2));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
