/** Isolated Compass actions: the map's rail, rooms, placement, floors, and Refine (divided cells, 14 Oct 2026).
 * No patient data or API writes. */
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
  await page.click('#f-skip');                 // Facing: the first answer.
  await page.click('[id="fq-1-40 ft"]');       // A 40 ft plot, so a half cell can hold a passage (4'-6" clear).
  for(let i=0;i<8 && await page.locator('#f-skip').count();i++){await page.click('#f-skip');await page.waitForTimeout(100);}
  await page.locator('#strip-rooms').waitFor();
  assert.equal(await page.locator('#strip-refine-map').count(),0);
  assert.equal(await page.locator('.compass-action-strip button').count(),5);
  assert.equal(await page.locator('#strip-refine').count(),1);
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
  // Refine: divide a cell into two equal halves, a room for each half, Back, Undo, whole cell (§5.1, §5.3).
  await page.click('#strip-refine');
  assert.match(await page.locator('#strip-refine').innerText(),/DONE REFINING/);
  for(const id of ['#strip-floor','#strip-rooms','#strip-next','#strip-generate'])assert.equal(await page.locator(id).isDisabled(),true,id);
  assert.equal(await page.locator('#ready-road-left').count(),0);
  await page.click('#cell-r2_c3');
  await page.locator('.compass-refine-focus').waitFor();
  assert.equal(await page.locator('.compass-cell-grid').count(),0,'the focus view replaces the map');
  assert.equal(await page.locator('#refine-whole').isDisabled(),true);
  await page.click('#refine-left');
  await page.locator('[data-picker-mode="assign"]').waitFor();
  assert.equal(await page.locator('#assign-empty-0').getAttribute('data-gaze'),'false','cards answer to gaze only after READY');
  await page.click('#assign-ready');
  assert.equal(await page.locator('#assign-ready').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#assign-empty-0').getAttribute('data-gaze'),'true');
  await page.click('#assign-back');                                            // Back changes nothing.
  assert.equal(await page.locator('#refine-whole').isDisabled(),true);
  await page.click('#refine-left');await page.click('#assign-next');await page.click('#assign-next');
  await page.locator('[id^="assign-passage-"]').click();
  await page.locator('.compass-refine-focus').waitFor();
  assert.match(await page.locator('#refine-left').innerText(),/Passage/);
  assert.match(await page.locator('#refine-right').innerText(),/Empty/);
  assert.match(await page.locator('.refine-message').innerText(),/Left half: Passage/);
  await page.click('#refine-undo');                                            // Dividing and its room are one step.
  assert.equal(await page.locator('#refine-whole').isDisabled(),true);
  assert.match(await page.locator('#refine-left').innerText(),/Empty/);
  await page.click('#refine-right');await page.click('#assign-empty-0');      // Empty | Empty, divided.
  assert.equal(await page.locator('#refine-whole').isEnabled(),true);
  await page.click('#refine-whole');                                           // Both empty: whole again at once.
  assert.equal(await page.locator('#refine-whole').isDisabled(),true);
  await page.click('#refine-left');await page.click('#assign-next');await page.click('#assign-next');
  await page.locator('[id^="assign-passage-"]').click();
  await page.click('#refine-back');
  assert.match(await page.locator('#cell-r2_c3').innerText(),/PASSAGE/);
  assert.match(await page.locator('.compass-current-room').innerText(),/1 DIVIDED CELL/);
  await page.click('#strip-refine');
  assert.match(await page.locator('#strip-refine').innerText(),/^REFINE/);
  // Placing a room over a divided cell changes nothing.
  assert.match(await page.locator('.compass-road-info').innerText(),/2½ \/ 16 cells placed/);
  await page.click('#strip-rooms');await page.locator('.compass-room-choice').first().click();
  if(await page.locator('#ready-road-left').getAttribute('aria-pressed')==='false')await page.click('#ready-road-left');
  await page.click('#cell-r2_c3');
  assert.match(await page.locator('.compass-road-info').innerText(),/2½ \/ 16 cells placed/);
  assert.match(await page.locator('#cell-r2_c3').innerText(),/PASSAGE/);
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS: five-action rail, room paging/READY/selection, two room placements, NEXT, Generate confirmation/cancel, floor switching, Back to Map; Refine: focus view, READY-gated room picker, Back, a half room, Undo as one step, whole cell, divided cell on the map, placement refused on it.');
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
