/** Isolated map -> saved draft/backend payload -> real 2D/Top/Outside -> real downloads. */
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, file);
const R = require('../src/utils/compassReducer.ts'), P = require('../src/utils/compassPlan.ts'), D = require('../src/utils/compassDraft.ts');
const gazeProbe = require('./design-gaze-probe.cjs')(path.resolve(__dirname, '..'));
const OUT = process.env.COMPASS_SPLIT_QA_OUTPUT || path.join(os.tmpdir(), 'gaze-top-bottom-qa');
fs.mkdirSync(OUT, {recursive: true});
const BASE = process.env.DESIGN_QA_URL || 'http://127.0.0.1:5173';
const queue = P.CATALOGUE.ground.map(roomId => ({roomId, roomLabel: P.PLAN_LIBRARY[roomId].label}));
const seed = {...R.createInitialState(queue), phase: 'placement', foundationStep: 7,
  foundation: {facing: 'West', plotWidth: 60, plotDepth: 40, plotType: 'Independent', gatePosition: 'Center'},
  floors: {ground: {splits: ['r4_c4'], rooms: [
    {id: 'g-bedroom-1', use: 'bedroom', regions: ['r2_c3']},
    {id: 'g-passage-1', use: 'passage', regions: ['r4_c4.L']},
  ]}, first: {splits: [], rooms: []}}};
let browser;
(async () => {
  browser = await chromium.launch({headless: true, ...(process.env.COMPASS_CHROME_CHANNEL ? {channel: process.env.COMPASS_CHROME_CHANNEL} : {})});
  const page = await browser.newPage({viewport: {width: 1366, height: 768}, acceptDownloads: true});
  page.setDefaultTimeout(20000);
  const errors = [], saves = []; let backend = null;
  page.on('pageerror', e => errors.push(e.message));
  await page.routeWebSocket('ws://127.0.0.1:8765', ws => ws.onMessage(raw => {
    const m = JSON.parse(raw);
    if (m.type === 'set_screen') ws.send(JSON.stringify({type: 'screen_changed', screen: m.screen}));
    if (m.type === 'set_gaze_enabled') ws.send(JSON.stringify({type: 'gaze_enabled', enabled: m.enabled}));
    if (m.type === 'load_survey') ws.send(JSON.stringify({type: 'survey_loaded', survey_data: backend}));
    if (m.type === 'save_survey') { saves.push(m.survey_data); ws.send(JSON.stringify({type: 'survey_saved'})); }
  }));
  await page.addInitScript(() => {
    window.qaRegistrations = [];
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function(raw) { try { const m = JSON.parse(raw); if (m.type === 'register_targets') window.qaRegistrations.push(m.targets); } catch {} return send.call(this, raw); };
    speechSynthesis.speak = () => {};
    const theme = sessionStorage.getItem('qa-theme'); if (theme) localStorage.setItem('gc-theme', theme);
    window.electronAPI = {on: () => () => {}, off: () => {}, settings: {
      load: async () => JSON.parse(sessionStorage.getItem('qa-profile') || 'null'), save: async () => ({success: true}),
    }};
  });
  async function routeMap() {
    await page.locator('#kb').waitFor();
    await page.evaluate(() => {
      const e = document.querySelector('#kb'); let f = e[Object.keys(e).find(k => k.startsWith('__reactFiber$'))];
      while (f) { if (typeof f.memoizedProps?.onNavigate === 'function') { f.memoizedProps.onNavigate('compass-map'); return; } f = f.return; }
      throw Error('Map route missing');
    });
    await page.locator('#strip-refine').waitFor();
  }
  async function open(draft, mode = 'focus', theme = 'dark', old = false) {
    await page.goto(BASE);
    await page.evaluate(({draft, mode, theme, old}) => {
      localStorage.clear(); sessionStorage.clear();
      sessionStorage.setItem('qa-theme', theme);
      sessionStorage.setItem('qa-profile', JSON.stringify({version: 1, settings: {designMode: mode}}));
      if (draft) localStorage.setItem(old ? 'compass_persistent_backup_v2' : 'compass_persistent_backup_v3', draft);
    }, {draft, mode, theme, old});
    await page.reload(); await routeMap();
  }
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('compass_persistent_backup_v3')));
  const floor = async () => (await draft()).floors.ground;
  async function chooseRoom(use) {
    await page.click('#assign-ready');
    for (let i = 0; i < 4; i++) {
      if (await page.locator(`[id^="assign-${use}-"]`).count()) { await page.locator(`[id^="assign-${use}-"]`).click(); return; }
      await page.click('#assign-next');
    }
    throw Error('Room missing: ' + use);
  }
  async function audit(label) {
    await page.waitForTimeout(160);
    const sizes = await page.locator('.compass-refine-focus button').evaluateAll(buttons => buttons.filter(b => !b.disabled).map(b => {
      const r = b.getBoundingClientRect(); return {id: b.id, x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom,
        clipped: b.scrollHeight > b.clientHeight + 2 || b.scrollWidth > b.clientWidth + 2};
    }));
    const viewport = page.viewportSize();
    for (const b of sizes) assert.ok(b.w >= 80 && b.h >= 80 && b.x >= 0 && b.y >= 0 && b.right <= viewport.width + 1 && b.bottom <= viewport.height - 27 && !b.clipped, `${label}: ${JSON.stringify(b)}`);
    const probe = await page.evaluate(gazeProbe);
    assert.deepEqual(probe.misses, [], label + ': production gaze picker');
    const top = await page.locator('#refine-top').boundingBox(), bottom = await page.locator('#refine-bottom').boundingBox();
    assert.ok(bottom.y - top.y - top.height >= 39, label + ': gaze gap');
    assert.equal(await page.locator('#refine-top').getAttribute('data-gaze-dwell-ms'), await page.locator('#refine-bottom').getAttribute('data-gaze-dwell-ms'));
  }
  const original = JSON.stringify({...D.draftFromState(seed), version: 2});
  await open(original, 'focus', 'dark', true);
  assert.equal(await page.evaluate(() => localStorage.getItem('compass_persistent_backup_v2')), original, 'v2 original stays untouched');
  const initial = await floor();
  await page.click('#strip-refine'); await page.click('#cell-r2_c3'); await page.click('#refine-direction-top-bottom');
  await audit('uncommitted-preview');
  await page.click('#refine-top'); await page.click('#assign-back'); await page.click('#refine-back');
  assert.deepEqual(await floor(), initial, 'Back cancels preview');
  await page.click('#cell-r2_c3'); await page.click('#refine-direction-top-bottom'); await page.click('#refine-bottom'); await chooseRoom('bathroom');
  await page.locator('#refine-top').waitFor();
  assert.match(await page.locator('#refine-top').innerText(), /Bedroom/);
  assert.match(await page.locator('#refine-bottom').innerText(), /Bathroom/);
  assert.equal(await page.locator('#refine-direction-left-right').isDisabled(), true, 'no crossing split');
  const saved = await draft();
  assert.equal(saved.plan.version, 3);
  assert.deepEqual(saved.floors.ground.splitDirections, {r2_c3: 'top-bottom'});
  assert.deepEqual(saved.floors.ground.rooms.find(r => r.use === 'passage').regions, ['r4_c4.L'], 'old split untouched');
  await page.click('#refine-undo');
  assert.deepEqual(await floor(), initial, 'Undo restores the whole cell and other split');
  await page.click('#refine-bottom'); await chooseRoom('bathroom');
  await page.click('#refine-back');
  assert.equal(await page.locator('#cell-r2_c3 .split-cell').getAttribute('data-direction'), 'top-bottom');
  assert.equal(await page.locator('#cell-r4_c4 .split-cell').getAttribute('data-direction'), 'left-right');
  const kept = await draft();
  await page.waitForTimeout(6500);
  assert.ok(saves.some(s => s.compass_map?.compass_plan?.version === 3), 'backend save carries version 3 and direction');
  backend = saves.findLast(s => s.compass_map?.compass_plan?.version === 3);
  await page.reload(); await routeMap();
  assert.deepEqual(await floor(), kept.floors.ground, 'local reload keeps halves');
  // Reopen without any local draft: only the backend copy is available.
  await open(null);
  assert.deepEqual(await floor(), kept.floors.ground, 'backend-only restore keeps halves');
  backend = null;
  for (const [w, h] of [[1366, 768], [1920, 1080]]) for (const mode of ['focus', 'serene']) for (const theme of ['dark', 'warm', 'midnight-navy']) {
    await page.setViewportSize({width: w, height: h});
    await open(JSON.stringify(kept), mode, theme);
    await page.click('#strip-refine'); await page.click('#cell-r2_c3');
    const label = `${w}-${mode}-${theme}`; await audit(label);
    await page.screenshot({path: path.join(OUT, label + '-refine.png')});
  }
  // Whole cell asks which owner survives; cancelling cannot rotate or lose rooms.
  await page.click('#refine-whole'); await page.click('#refine-whole-cancel');
  assert.deepEqual(await floor(), kept.floors.ground);
  await page.click('#refine-whole'); await page.click('#refine-whole-0');
  assert.equal((await floor()).splits.includes('r2_c3'), false);
  await page.click('#refine-direction-left-right'); await page.click('#refine-left'); await chooseRoom('bathroom');
  assert.equal((await floor()).splitDirections?.r2_c3, undefined, 'direction changes only after Whole Cell');
  // Normal armed placement opens the saved top/bottom chooser, including replacement confirmation.
  await open(JSON.stringify(kept));
  await page.click('#strip-rooms'); await page.click('#menu-ready');
  for (let n = 0; n < 4 && !(await page.locator('[id^="m-kitchen-"]').count()); n++) await page.click('#menu-next');
  await page.locator('[id^="m-kitchen-"]').click();
  if (await page.locator('#ready-road-left').getAttribute('aria-pressed') === 'false') await page.click('#ready-road-left');
  await page.click('#cell-r2_c3');
  assert.equal(await page.locator('#refine-bottom').count(), 1);
  await page.click('#refine-bottom');
  assert.match(await page.locator('.refine-question').innerText(), /Replace Bathroom.*bottom half/);
  await page.click('#place-cancel');
  assert.deepEqual(await floor(), kept.floors.ground, 'cancelled armed replacement keeps both owners');
  await page.click('#refine-bottom'); await page.click('#place-replace');
  await page.locator('.compass-cell-grid').waitFor();
  assert.equal((await floor()).rooms.find(r => r.use === 'kitchen').regions[0], 'r2_c3.B');
  assert.equal((await floor()).rooms.find(r => r.use === 'bedroom').regions[0], 'r2_c3.T');
  // Upstairs top/bottom halves over a downstairs left/right split must name both overlapping areas.
  const two = structuredClone(kept);
  two.ui.numFloors = 'Multi-Floor'; two.ui.foundation.numFloors = 'Multi-Floor'; two.plan.storeys = 2;
  two.floors.first = {splits: [], rooms: [{id: 'f-ff_living-1', use: 'ff_living', regions: ['r4_c4']}]};
  two.plan.floors.first = two.floors.first;
  await open(JSON.stringify(two));
  await page.click('#strip-floor'); await page.click('#strip-refine'); await page.click('#cell-r4_c4');
  await page.click('#refine-direction-top-bottom');
  assert.match(await page.locator('#refine-top').innerText(), /Below: Passage \/ empty/);
  assert.match(await page.locator('#refine-bottom').innerText(), /Below: Passage \/ empty/);
  await page.click('#refine-bottom'); await chooseRoom('ff_bathroom');
  await page.locator('#refine-top').waitFor();
  assert.match(await page.locator('#refine-top').innerText(), /1F Living/);
  assert.match(await page.locator('#refine-bottom').innerText(), /1F Bathroom/);
  await audit('first-floor-mixed-directions');
  await page.setViewportSize({width: 1366, height: 768});
  await audit('first-floor-mixed-directions-laptop');
  await page.click('#refine-back'); await page.click('#strip-refine');
  const bothSaved = await draft();
  await page.click('#strip-floor');
  assert.equal(await page.locator('#cell-r2_c3 .split-cell').getAttribute('data-direction'), 'top-bottom');
  assert.equal(await page.locator('#cell-r4_c4 .split-cell').getAttribute('data-direction'), 'left-right');
  await page.click('#strip-floor');
  assert.equal(await page.locator('#cell-r4_c4 .split-cell').getAttribute('data-direction'), 'top-bottom');
  await page.reload(); await routeMap();
  assert.deepEqual((await draft()).floors, bothSaved.floors, 'reopen preserves both floors and different directions');
  await page.click('#strip-generate'); await page.click('#confirm-gen-both');
  await page.waitForFunction(() => { const i = document.querySelector('.studio-drawing img'); return i?.complete && i.naturalWidth > 0; });
  await page.click('#compass-studio-floor');
  await page.waitForFunction(() => { const i = document.querySelector('.studio-drawing img'); return i?.complete && /^First floor/.test(i.alt); });
  await page.screenshot({path: path.join(OUT, 'first-floor-2d.png')});
  assert.deepEqual((await draft()).floors, bothSaved.floors, 'both-floor generation leaves saved ownership intact');
  // Use the original top/bottom save for real generation and downloads.
  await open(JSON.stringify(kept));
  await page.click('#strip-generate'); await page.click('#confirm-gen-yes');
  const drawing = async previous => page.waitForFunction(old => { const i = document.querySelector('.studio-drawing img'); return i?.complete && i.naturalWidth > 0 && i.src !== old; }, previous || '');
  await drawing();
  await page.screenshot({path: path.join(OUT, 'generated-2d.png')});
  for (const id of ['compass-studio-view-top', 'compass-studio-view-outside', 'compass-studio-view-plan']) {
    const old = await page.locator('.studio-drawing img').getAttribute('src'); await page.click('#' + id); await drawing(old);
  }
  await page.click('#compass-studio-downloads');
  const outputs = [];
  page.on('download', async d => { const file = path.join(OUT, d.suggestedFilename()); await d.saveAs(file); outputs.push(file); });
  for (const [id, count] of [['png', 1], ['pdf', 1], ['dxf', 3]]) {
    const start = outputs.length; await page.click('#compass-studio-' + id);
    for (let n = 0; n < 200 && outputs.length < start + count; n++) await page.waitForTimeout(100);
    assert.equal(outputs.length, start + count, id + ': all downloads complete');
  }
  assert.deepEqual(await floor(), kept.floors.ground, 'generation/exports never change the map');
  const empty = structuredClone(kept);
  empty.floors.ground = {splits: ['r2_c3'], splitDirections: {r2_c3: 'top-bottom'}, rooms: []};
  empty.plan.floors.ground = empty.floors.ground;
  await open(JSON.stringify(empty)); await page.waitForTimeout(6500);
  assert.ok(saves.some(s => s.compass_map?.compass_plan?.floors.ground.rooms.length === 0
    && s.compass_map.compass_plan.floors.ground.splitDirections?.r2_c3 === 'top-bottom'), 'empty divided cells are saved too');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({passed: true, layouts: 12, saves: saves.length, outputs}, null, 2));
  await browser.close();
  console.log('PASS: both-floor top/bottom editing and generation, mixed split directions, armed replacement/cancel, preview/cancel, Undo, preserved left/right, local/backend restore, 12 gaze/layout combinations, Whole Cell direction change, real 2D/Top/Outside and five exports. ' + OUT);
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
