/** Isolated browser + real local floor-plan API. No user saves or live gaze backend. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const gazeProbe = require('./design-gaze-probe.cjs')(path.resolve(__dirname,'..'));
const out = process.env.COMPASS_QA_OUTPUT || '/tmp/gaze-compass-studio-qa';
fs.mkdirSync(out,{recursive:true});
const draft = require('./compass-qa-draft.cjs');
let browser;
(async()=>{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:768},acceptDownloads:true});
  page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let registrations=[];
  await page.routeWebSocket('ws://127.0.0.1:8765',ws=>ws.onMessage(raw=>{
    const m=JSON.parse(raw);if(m.type==='register_targets')registrations.push(m.targets);
    if(m.type==='set_screen')ws.send(JSON.stringify({type:'screen_changed',screen:m.screen}));
    if(m.type==='set_gaze_enabled')ws.send(JSON.stringify({type:'gaze_enabled',enabled:m.enabled}));
  }));
  await page.addInitScript(()=>{
    speechSynthesis.speak=()=>{};
    window.qaBlobs=new Set();const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=b=>{const u=create(b);window.qaBlobs.add(u);return u;};
    URL.revokeObjectURL=u=>{window.qaBlobs.delete(u);revoke(u);};
    const theme=sessionStorage.getItem('qa-theme');if(theme)localStorage.setItem('gc-theme',theme);
    window.electronAPI={on:()=>()=>{},off:()=>{},settings:{load:async()=>JSON.parse(sessionStorage.getItem('qa-profile')||'null'),save:async d=>{sessionStorage.setItem('qa-profile',JSON.stringify(d));return {success:true};}}};
  });
  await page.goto('http://127.0.0.1:5173');await page.locator('#kb').waitFor();
  async function open(mode='focus',theme='warm',firstRooms=false,architecture=false){
    await page.evaluate(({mode,theme,state})=>{
      sessionStorage.clear();localStorage.clear();sessionStorage.setItem('qa-theme',theme);
      sessionStorage.setItem('qa-profile',JSON.stringify({version:1,settings:{designMode:mode}}));
      localStorage.setItem('compass_persistent_backup',JSON.stringify(state));
    },{mode,theme,state:draft(firstRooms,architecture)});
    await page.reload();await page.locator('#kb').waitFor();
    await page.evaluate(()=>{
      const e=document.querySelector('#kb');let f=e[Object.keys(e).find(k=>k.startsWith('__reactFiber$'))];
      while(f){if(typeof f.memoizedProps?.onNavigate==='function'){f.memoizedProps.onNavigate('compass-map');return;}f=f.return;}
    });
    await page.locator('#strip-generate').waitFor();await page.click('#strip-generate');
    await page.locator('#confirm-gen-yes').waitFor();
  }
  const results=[];
  async function audit(label){
    // Let React commit the view change before checking readiness. An absent
    // inspect button on the preceding picker is not a finished preview.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.waitForFunction(()=>{
      if(!document.querySelector('.studio-drawing'))return true;
      const image=document.querySelector('.studio-drawing img');
      const inspect=document.querySelector('#compass-studio-inspect');
      return image?.complete&&image.naturalWidth>0&&inspect&&!inspect.disabled;
    });
    await page.mouse.move(0,0);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(750); // Allow the unchanged 500 ms target registration tick and socket delivery.
    const data=await page.evaluate(()=>{
      const root=document.querySelector('.compass-plan-studio')||document.querySelector('.compass-plan-choice');
      const targets=[...root.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width).map(e=>{
        const r=e.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(e);
        const text=[...e.querySelectorAll('span,small')].filter(n=>n.textContent.trim()).flatMap(n=>{const q=document.createRange();q.selectNodeContents(n);return [...q.getClientRects()].map(t=>({x:t.x,y:t.y,right:t.right,bottom:t.bottom}));});
        return {id:e.id,x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right,disabled:e.disabled,clipped:text.some(t=>t.x<r.x-1||t.right>r.right+1||t.y<r.y-1||t.bottom>r.bottom+1)};
      });
      return {targets,overflow:root.scrollHeight>root.clientHeight+1,width:innerWidth,height:innerHeight};
    });
    for(const t of data.targets){assert.ok(t.w>=80&&t.h>=103.5,`${label}: small ${JSON.stringify(t)}`);assert.ok(t.x>=0&&t.y>=0&&t.right<=data.width&&t.bottom<=data.height-27,`${label}: outside/bottom ${JSON.stringify(t)}`);assert.equal(t.clipped,false,`${label}: clipped ${JSON.stringify(t)}`);}
    assert.equal(data.overflow,false,`${label}: scroll overflow`);
    await page.evaluate(r=>window.qaRegistrations=r,registrations);
    const targeting=await page.evaluate(gazeProbe);
    assert.deepEqual(targeting.misses,[],`${label}: gaze picking`);
    assert.deepEqual(targeting.registration,[],`${label}: live target registration`);
    results.push({label,targets:data.targets,probes:targeting.probes});
  }
  for(const size of (process.env.COMPASS_QA_SMALL ? [[1366,768]] : [[1366,768],[1920,1080]]))for(const mode of (process.env.COMPASS_QA_MODES?.split(',') || ['focus','serene']))for(const theme of (process.env.COMPASS_QA_THEMES?.split(',') || ['warm','dark','midnight-navy'])){
    const label=`${size[0]}-${mode}-${theme}`;
    await page.setViewportSize({width:size[0],height:size[1]});await open(mode,theme);
    assert.equal(await page.locator('#confirm-gen-both').isEnabled(),false);
    await audit(label+'-scope');
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('compass_persistent_backup')).state);
    await page.click('#confirm-gen-yes');await page.locator('.studio-drawing img').waitFor();
    assert.match(await page.locator('.studio-heading').innerText(),/PLAN 1 OF 4/);
    await audit(label+'-2d');
    if(size[0]===1920 || process.env.COMPASS_QA_SMALL)await page.screenshot({path:path.join(out,`${mode}-${theme}-2d.png`)});
    await page.click('#compass-studio-next');await page.locator('.studio-drawing img').waitFor();
    assert.match(await page.locator('.studio-heading').innerText(),/PLAN 2 OF 4/);
    await page.click('#compass-studio-inspect');await audit(label+'-enlarged');
    await page.click('#compass-studio-view');await page.click('#compass-studio-view-3d');await page.locator('.studio-drawing img').waitFor();await audit(label+'-3d');
    if(size[0]===1920 || process.env.COMPASS_QA_SMALL)await page.screenshot({path:path.join(out,`${mode}-${theme}-3d.png`)});
    await page.click('#compass-studio-inspect');await page.locator('.studio-drawing img').waitFor();assert.match(await page.locator('#compass-studio-inspect').innerText(),/View 2 of 4/);
    await page.click('#compass-studio-details');await audit(label+'-rooms');
    await page.click('#compass-studio-room-0');await page.locator('.studio-drawing img').waitFor();await audit(label+'-room-3d');
    assert.equal(await page.locator('#compass-studio-zoom-out').isEnabled(),false);
    await page.click('#compass-studio-zoom-in');await page.click('#compass-studio-zoom-in');
    assert.equal(await page.locator('#compass-studio-zoom-in').isEnabled(),false);
    await audit(label+'-room-zoom');
    await page.click('#compass-studio-zoom-out');await page.click('#compass-studio-zoom-out');
    await page.click('#compass-studio-next');await page.locator('.studio-drawing img').waitFor();assert.match(await page.locator('.studio-heading').innerText(),/Master Bedroom/);
    await page.click('#compass-studio-back');await page.locator('.studio-drawing img').waitFor();
    await page.click('#compass-studio-view');await audit(label+'-view-choice');
    await page.click('#compass-studio-styles');await audit(label+'-finishes');
    await page.click('#compass-studio-style-terracotta');await page.locator('.studio-drawing img').waitFor();await audit(label+'-exterior');
    await page.click('#compass-studio-view');await page.click('#compass-studio-styles');await page.click('#compass-studio-undo-style');await page.locator('.studio-drawing img').waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('gc-compass-exterior')),'verandah');
    await page.click('#compass-studio-details');
    await page.click('#compass-studio-notes');await audit(label+'-notes');
    await page.click('#compass-studio-back');await page.click('#compass-studio-downloads');await audit(label+'-downloads');
    if(size[0]===1366&&mode==='focus'&&theme==='warm'){
      for(const format of ['png','pdf','dxf']){
        const wait=page.waitForEvent('download');await page.click(`#compass-studio-${format}`);const d=await wait;
        assert.match(d.suggestedFilename(),new RegExp(`plan-2-ground-.*\\.${format}$`));await d.saveAs(path.join(out,d.suggestedFilename()));
        await page.waitForFunction(()=>document.querySelector('#compass-studio-png')?.disabled===false);
      }
    }
    await page.click('#compass-studio-back');await page.click('#compass-studio-back');
    assert.equal(await page.locator('.compass-plan-studio').count(),0);
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('compass_persistent_backup')).state);
    assert.deepEqual(after,before,'Preview must preserve both floors and the active draft');
  }
  // An eight-room, irregular plan includes real stair treads, fittings and windows.
  for(const width of [1366,1920]) {
    await page.setViewportSize({width,height:width===1366?768:1080});
    await open('focus','warm',false,true);await page.click('#confirm-gen-yes');await page.locator('.studio-drawing img').waitFor();
    assert.match(await page.locator('.studio-heading').innerText(),/PLAN 1 OF 4/);
    await audit(`architecture-${width}-2d`);
    await page.screenshot({path:path.join(out,`architecture-${width}-2d.png`)});
    await page.click('#compass-studio-inspect');await audit(`architecture-${width}-enlarged`);
    await page.screenshot({path:path.join(out,`architecture-${width}-enlarged.png`)});
    for(const corner of ['Back right','Front left','Front right','Whole plan']) {
      await page.click('#compass-studio-inspect');
      assert.match(await page.locator('#compass-studio-inspect').innerText(),new RegExp(corner));
      await audit(`architecture-${width}-${corner}`);
    }
    await page.click('#compass-studio-view');await page.click('#compass-studio-view-3d');await page.locator('.studio-drawing img').waitFor();
    await audit(`architecture-${width}-3d`);await page.screenshot({path:path.join(out,`architecture-${width}-3d.png`)});
    await page.click('#compass-studio-details');await page.click('#compass-studio-detail-next');
    await audit(`architecture-${width}-room-page2`);await page.click('#compass-studio-back');
    await page.click('#compass-studio-details');await page.click('#compass-studio-room-0');
    for(let room=0;room<8;room++) {
      await page.locator('.studio-drawing img').waitFor();await audit(`architecture-${width}-room-${room}`);
      for(let rotation=0;rotation<3;rotation++) { await page.click('#compass-studio-inspect');await page.locator('.studio-drawing img').waitFor(); }
      let requests=0;const count=r=>{if(r.url().includes('/compass/render'))requests++;};page.on('request',count);
      await page.click('#compass-studio-zoom-in');await page.click('#compass-studio-zoom-out');page.off('request',count);assert.equal(requests,0,'Room zoom must stay local');
      if(room===2)await page.screenshot({path:path.join(out,`room-stairs-${width}.png`)});
      if(room<7)await page.click('#compass-studio-next');
    }
    assert.equal(await page.locator('#compass-studio-next').isEnabled(),false);
    await page.click('#compass-studio-downloads');
    const roomDownload=page.waitForEvent('download');await page.click('#compass-studio-png');const downloadedRoom=await roomDownload;
    assert.match(downloadedRoom.suggestedFilename(),/room-8-3d/);await downloadedRoom.saveAs(path.join(out,downloadedRoom.suggestedFilename()));
    await page.click('#compass-studio-back');await page.click('#compass-studio-back');await page.locator('.studio-drawing img').waitFor();
    await page.click('#compass-studio-view');await page.click('#compass-studio-view-exterior');await page.locator('.studio-drawing img').waitFor();
    await page.screenshot({path:path.join(out,`exterior-${width}.png`)});
    for(let option=2;option<=4;option++) {
      await page.click('#compass-studio-next');await page.locator('.studio-drawing img').waitFor();
      assert.match(await page.locator('.studio-heading').innerText(),new RegExp(`PLAN ${option} OF 4`));
      assert.match(await page.locator('.studio-caption').innerText(),/sq ft/);
    }
    await page.click('#compass-studio-back');
  }
  // Partly filled first floor remains viewable as a concept with explicit notes.
  await open('focus','warm',true);await page.click('#confirm-gen-both');await page.locator('.studio-drawing img').waitFor();
  await page.click('#compass-studio-floor');await page.locator('.studio-drawing img').waitFor();assert.match(await page.locator('.studio-caption').innerText(),/First floor/);await audit('partial-first');
  await page.click('#compass-studio-view');await page.click('#compass-studio-view-3d');await page.locator('.studio-drawing img').waitFor();await audit('partial-first-3d');
  await page.click('#compass-studio-back');
  // A native render may finish after navigation; automatic bounded retry
  // handles its 429 response without requiring another precise gaze selection.
  await open();await page.click('#confirm-gen-yes');await page.locator('.studio-drawing img').waitFor();
  let busy=0;await page.route('**/api/floorplan/compass/render',route=>++busy===1?route.fulfill({status:429,contentType:'application/json',body:'{"error":"Finishing previous view"}'}):route.continue());
  await page.click('#compass-studio-view');
  const recoveredPreview=page.waitForResponse(r=>r.url().includes('/api/floorplan/compass/render')&&r.status()===200);
  await page.click('#compass-studio-view-exterior');await recoveredPreview;
  await page.locator('.studio-drawing img').waitFor();assert.equal(busy,2);
  assert.equal(await page.evaluate(()=>window.qaBlobs.size),1,'Only the current preview is retained');
  await page.click('#compass-studio-back');assert.equal(await page.evaluate(()=>window.qaBlobs.size),0,'Closing releases preview');
  await page.unroute('**/api/floorplan/compass/render');
  // Service failure stays recoverable; Back to map is never blocked by loading.
  await page.route('**/api/floorplan/compass/options',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Service unavailable for test"}'}));
  await page.click('#strip-generate');await page.click('#confirm-gen-yes');await page.locator('#compass-studio-retry').waitFor();await audit('service-error');
  await page.click('#compass-studio-back');await page.unroute('**/api/floorplan/compass/options');
  // Closing during a delayed request must not reopen the viewer or touch the draft.
  await page.route('**/api/floorplan/compass/options', async route => {
    await new Promise(resolve => setTimeout(resolve, 800));
    await route.fulfill({status:200,contentType:'application/json',body:'{"options":[],"notes":[]}'}).catch(()=>{});
  });
  await page.click('#strip-generate');await page.click('#confirm-gen-yes');
  await page.locator('.compass-plan-studio').waitFor();await page.click('#compass-studio-back');
  await page.waitForTimeout(1000);assert.equal(await page.locator('.compass-plan-studio').count(),0);
  await page.unroute('**/api/floorplan/compass/options');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(results,null,2));
  console.log(`PASS: ${results.length} screen/configuration checks, ${results.reduce((n,r)=>n+r.probes,0)} gaze target probes; four options, partial floors, downloads, preserved drafts, error recovery.`);
  await browser.close();
})().catch(async e=>{console.error(e);if(browser){const pages=browser.contexts()[0]?.pages();if(pages?.[0])await pages[0].screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}await browser?.close();process.exitCode=1;});
