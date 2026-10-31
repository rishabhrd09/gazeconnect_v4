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
  await page.click('#f-skip');                 // Facing: SKIP keeps the prefilled West.
  await page.click('[id="fq-1-40 ft"]');       // A 40 ft plot, so a half cell can hold a passage (4'-6" clear).
  for(let i=0;i<8 && await page.locator('#f-skip').count();i++){await page.click('#f-skip');await page.waitForTimeout(100);}
  await page.locator('#strip-rooms').waitFor();
  // SKIP kept the prefilled answer (West), not the question's first option (North) (REFINE_FIX_HANDOFF A1).
  assert.match(await page.locator('.compass-road-info').innerText(),/\(West\) – 40 ft/);
  // A refusal is shown on the road, not only spoken (A3).
  await page.click('#cell-r4_c4');
  assert.match(await page.locator('#compass-road-status').innerText(),/Press READY first/);
  assert.equal(await page.locator('#compass-road-status').getAttribute('aria-live'),'polite');
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
  // The picker built for halves (B3): a passage and a bathroom on page 1; a room that cannot go here (the porch,
  // placed elsewhere and one per floor) last and disabled, with its reason; READY stays on across pages.
  await page.click('#refine-left');
  const page1 = await page.locator('.compass-room-choice').evaluateAll(cards => cards.map(c => c.id));
  assert.ok(page1.some(id => id.startsWith('assign-passage-')) && page1.some(id => id.startsWith('assign-bathroom-')), page1.join(' '));
  await page.click('#assign-ready');
  while(await page.locator('#assign-next').isEnabled()) await page.click('#assign-next');
  assert.equal(await page.locator('#assign-ready').getAttribute('aria-pressed'),'true','READY stays on while paging');
  const porch = page.locator('[id^="assign-porch-"]');
  assert.equal(await porch.isDisabled(),true); assert.match(await porch.innerText(),/One per floor: placed elsewhere/);
  assert.equal(await porch.getAttribute('data-gaze'),'false','a disabled card never answers to gaze');
  await page.click('#assign-back');await page.click('#refine-left');
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
  await page.click('#refine-left');
  await page.locator('[id^="assign-passage-"]').click();
  await page.click('#refine-back');
  assert.match(await page.locator('#cell-r2_c3').innerText(),/PASSAGE/);
  assert.match(await page.locator('.compass-current-room').innerText(),/1 DIVIDED CELL/);
  await page.click('#strip-refine');
  assert.match(await page.locator('#strip-refine').innerText(),/^REFINE/);
  // Placing on a divided cell (B1): the cell opens the half chooser naming the armed room; the half gets the room
  // by the same rules, and the map returns. Two selections from the armed map: the cell and the half.
  assert.match(await page.locator('.compass-road-info').innerText(),/2½ \/ 16 cells placed/);
  await page.click('#strip-rooms');await page.click('#menu-next');await page.click('#menu-ready');
  await page.locator('[id^="m-bathroom-"]').click();
  if(await page.locator('#ready-road-left').getAttribute('aria-pressed')==='false')await page.click('#ready-road-left');
  await page.click('#cell-r2_c3');
  await page.locator('.compass-refine-focus').waitFor();
  assert.match(await page.locator('.refine-header h1').innerText(),/Place Bathroom in:/);
  assert.equal(await page.locator('[data-picker-mode="assign"]').count(),0,'no room list: the armed room is placed');
  await page.click('#refine-right');
  await page.locator('.compass-cell-grid').waitFor();
  assert.equal(await page.locator('.compass-refine-focus').count(),0,'the map returns');
  assert.match(await page.locator('#cell-r2_c3').innerText(),/PASSAGE[\s\S]*BATH/);
  assert.match(await page.locator('.compass-road-info').innerText(),/3 \/ 16 cells placed/);
  // A narrow half is placed with a warning on the map (B2): a 40 ft plot's half is 4'-6" clear; a kitchen needs 4'-11".
  await page.click('#strip-rooms');await page.click('#menu-prev');await page.click('#menu-ready');
  await page.locator('[id^="m-kitchen-"]').click();
  if(await page.locator('#ready-road-left').getAttribute('aria-pressed')==='false')await page.click('#ready-road-left');
  await page.click('#cell-r2_c3');await page.locator('.compass-refine-focus').waitFor();
  await page.click('#refine-right');                                      // The bathroom's half: asked first, never silent.
  assert.match(await page.locator('.refine-question p').innerText(),/Replace Bathroom with Kitchen \+ Store in the right half\? Bathroom has no other part/);
  await page.click('#place-cancel');
  assert.match(await page.locator('#refine-right').innerText(),/Bathroom/,'Cancel changes nothing');
  await page.click('#refine-right');await page.click('#place-replace');
  await page.locator('.compass-cell-grid').waitFor();
  assert.match(await page.locator('#cell-r2_c3').innerText(),/KITCHEN[\s\S]*NARROW/);
  assert.match(await page.locator('#compass-road-status').innerText(),/Right half: Kitchen \+ Store\. Narrow: 4'-6" clear; Kitchen \+ Store needs 4'-11"\. Bathroom removed\./);
  assert.match(await page.locator('#cell-r2_c3').getAttribute('aria-label'),/right Kitchen \+ Store, narrow/);
  // A fresh map: skipping every question keeps the prefilled 40 x 60 ft West plot (A1). A 20 ft plot says at the
  // rail no longer blocks Refine globally: a deep 20 ft plot supports top/bottom but not left/right.
  async function freshMap() {
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload(); await page.locator('#kb').waitFor();
    await page.evaluate(() => {
      const e=document.querySelector('#kb'); let f=e[Object.keys(e).find(k=>k.startsWith('__reactFiber$'))];
      while(f){if(typeof f.memoizedProps?.onNavigate==='function'){f.memoizedProps.onNavigate('compass-map');return;}f=f.return;}
      throw Error('Route not found');
    });
    await page.locator('#f-skip').waitFor();
  }
  const skipAll = async () => { for(let i=0;i<8 && await page.locator('#f-skip').count();i++){await page.click('#f-skip');await page.waitForTimeout(100);} await page.locator('#strip-rooms').waitFor(); };
  await freshMap();
  assert.match(await page.locator('#foundation-readiness').innerText(),/SKIP keeps West/);
  await skipAll();
  assert.match(await page.locator('.compass-road-info').innerText(),/\(West\) – 40 ft/);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('compass_persistent_backup_v3')).ui.foundation);
  assert.deepEqual([kept.facing, kept.plotWidth, kept.plotDepth], ['West', 40, 60], 'skipping every question keeps 40 x 60 West');
  await freshMap();
  await page.click('#f-skip'); await page.click('[id="fq-1-20 ft"]'); await skipAll();
  await page.click('#strip-refine');
  assert.match(await page.locator('#strip-refine').innerText(),/DONE REFINING/, 'top/bottom halves remain available on a deep 20 ft plot');
  await page.click('#cell-r2_c2');
  assert.equal(await page.locator('#refine-direction-left-right').isDisabled(), true);
  assert.equal(await page.locator('#refine-direction-top-bottom').isEnabled(), true);
  assert.equal(await page.locator('#refine-top').count(), 1);
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS: five-action rail, room paging/READY/selection, two room placements, NEXT, Generate confirmation/cancel, floor switching, Back to Map, SKIP keeps answers, refusals on the road, usable top/bottom direction on a deep 20 ft plot; Refine: focus view, READY-gated picker built for halves (page 1, READY across pages, disabled last), Back, a half room, Undo as one step, whole cell, divided cell on the map; placing on a divided cell: half chooser, replace asked, narrow warning.');
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
