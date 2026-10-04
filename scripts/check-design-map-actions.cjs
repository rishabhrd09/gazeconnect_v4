/** Isolated Compass actions after retiring the optional editor. No patient data or API writes. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.routeWebSocket('ws://127.0.0.1:8765', ws => ws.onMessage(raw => {
    const m = JSON.parse(raw);
    if (m.type === 'set_screen') ws.send(JSON.stringify({type:'screen_changed',screen:m.screen}));
    if (m.type === 'set_gaze_enabled') ws.send(JSON.stringify({type:'gaze_enabled',enabled:m.enabled}));
  }));
  await page.addInitScript(() => {
    speechSynthesis.speak = () => {};
    window.electronAPI = { on:()=>()=>{}, off:()=>{}, settings:{load:async()=>null,save:async()=>({success:true})} };
  });
  await page.goto(process.env.DESIGN_QA_URL || 'http://127.0.0.1:5173');
  await page.locator('#kb').waitFor();
  await page.evaluate(() => {
    const e=document.querySelector('#kb'); let f=e[Object.keys(e).find(k=>k.startsWith('__reactFiber$'))];
    while(f){if(typeof f.memoizedProps?.onNavigate==='function'){f.memoizedProps.onNavigate('compass-map');return;}f=f.return;}
    throw Error('Route not found');
  });
  await page.locator('#f-skip').waitFor();
  for(let i=0;i<8 && await page.locator('#f-skip').count();i++){await page.click('#f-skip');await page.waitForTimeout(100);}
  await page.locator('#strip-rooms').waitFor();
  assert.equal(await page.locator('#strip-refine-map').count(),0);
  assert.equal(await page.locator('.compass-action-strip button').count(),4);
  await page.click('#strip-rooms');
  await page.click('#menu-next');
  assert.equal(await page.locator('#menu-prev').isEnabled(),true);
  await page.click('#menu-prev');
  await page.click('#menu-ready');
  assert.equal(await page.locator('#menu-ready').getAttribute('aria-pressed'),'true');
  await page.locator('.compass-room-choice').first().click();
  await page.locator('#ready-road-left').waitFor();
  if(await page.locator('#ready-road-left').getAttribute('aria-pressed')==='false')await page.click('#ready-road-left');
  await page.click('#cell-r1_c1');
  await page.click('#strip-next');
  if(await page.locator('#ready-road-left').getAttribute('aria-pressed')==='false')await page.click('#ready-road-left');
  await page.click('#cell-r1_c2');
  assert.match(await page.locator('.compass-road-info').innerText(), /2 \/ 16 cells placed/);
  if(await page.locator('#ready-road-left').getAttribute('aria-pressed')==='false')await page.click('#ready-road-left');
  await page.click('#strip-generate');
  await page.locator('#confirm-gen-yes').waitFor();
  await page.click('#confirm-gen-no');
  assert.equal(await page.locator('#confirm-gen-yes').count(),0);
  await page.click('#strip-floor'); // Add first floor, then switch to it and back.
  await page.click('#strip-floor');
  assert.match(await page.locator('#strip-floor').innerText(),/1F/);
  await page.click('#strip-floor');
  assert.match(await page.locator('#strip-floor').innerText(),/GND/);
  await page.click('#strip-rooms');
  await page.click('#back-map');
  assert.equal(await page.locator('.compass-room-menu').count(),0);
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS: four-action rail, room paging/READY/selection, two room placements, NEXT, Generate confirmation/cancel, floor switching, Back to Map.');
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
