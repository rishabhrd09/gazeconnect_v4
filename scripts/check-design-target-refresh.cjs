/** Verify the production registry follows live layout changes, not saved coordinates.
 * The WebSocket boundary is isolated; there is no eye tracker or patient data. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const probe=require('./design-gaze-probe.cjs')(path.resolve(__dirname,'..'));
(async()=>{
 const b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:1366,height:768}});
 let registrations=[];const rows=[];
 await p.addInitScript(()=>{speechSynthesis.speak=()=>{};window.electronAPI={on:()=>()=>{},off:()=>{},settings:{load:async()=>null,save:async()=>({success:true})}};});
 await p.routeWebSocket('ws://127.0.0.1:8765',ws=>ws.onMessage(raw=>{
  const m=JSON.parse(raw);
  if(m.type==='register_targets')registrations.push(m.targets);
  if(m.type==='set_screen')ws.send(JSON.stringify({type:'screen_changed',screen:m.screen}));
  if(m.type==='get_predictions')ws.send(JSON.stringify({type:'predictions',request_id:m.request_id,prediction:{text:m.text},word_slots:['please','water','help','yes','no','want','need','food','thanks','hello'],sentences:[{text:'Thank you',score:1,mode:'append'}]}));
 }));
 async function check(state,change){const before=registrations.length;await change();await p.mouse.move(0,0);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(650);await p.evaluate(rs=>window.qaRegistrations=rs,registrations);const r=await p.evaluate(probe);assert.deepEqual(r.registration,[],state);assert.deepEqual(r.misses,[],state);assert(registrations.length>before,state+': geometry was not refreshed');rows.push({state,targets:r.targets.length,probes:r.probes});}
 await p.goto(process.env.DESIGN_QA_URL||'http://127.0.0.1:5173');await p.locator('#kb').waitFor();
 await check('Home gaze enabled',()=>p.click('#gaze-toggle-nav'));
 await check('Home resized to 1920',()=>p.setViewportSize({width:1920,height:1080}));
 await check('Home resized to 1366',()=>p.setViewportSize({width:1366,height:768}));
 await check('Home switches to Serene',()=>p.evaluate(()=>document.documentElement.dataset.design='serene'));
 await check('Keyboard full screen',()=>p.click('#kb'));
 await check('Keyboard shows navigation',()=>p.click('#nav-restore-btn'));
 await check('Keyboard with navigation resized',()=>p.setViewportSize({width:1920,height:1080}));
 await check('Expanded message',()=>p.click('#display-expand-toggle'));
 console.log(JSON.stringify(rows,null,2));console.log('PASS: live registry and target ownership follow navigation, resizing, design changes and expanded display.');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
