/** The version 2 Compass studio (14 Oct 2026) in an isolated browser, against the real local floor-plan service
 * (tools/floorplan_server.py on 127.0.0.1:5050, or VITE_FLOORPLAN_API) and a running Vite server (DESIGN_QA_URL).
 * No user saves and no live gaze backend. At 1366x768 and 1920x1080, in both design modes and three themes, every
 * studio page is audited: target sizes and bottom clearance, no clipped text or scrolling, gaze picking and
 * registration. Then the two views (Plan, and Model look: the furnished top view), both floors, downloads (PNG, PDF
 * sheets, DXF in feet-inches and in millimetres with a README), notes paging, Ground floor only, a failed service and
 * its Try again, a newer view replacing an older one, closing while drawing, a map with saved Refine Map details,
 * and that the studio never changes the map. Full screen (29 Oct 2026): the drawing larger and drawn again at that
 * size, the plan and the model look filling the width with Up, Down and Whole plan, both views and floors, its own
 * audits, and leaving keeps the image. Outside and the earlier top view were removed on 12 Nov 2026 (maintainer
 * request): the views column holds three equal targets and no request carries their settings.
 * The original studio (GAZECONNECT_COMPASS_V2=0) is checked by check-compass-studio.cjs. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const gazeProbe = require('./design-gaze-probe.cjs')(path.resolve(__dirname, '..'));
const {draftV2} = require('./compass-qa-plan.cjs');
const legacyDraft = require('./compass-qa-draft.cjs');
const out = process.env.COMPASS_QA_OUTPUT || path.join(os.tmpdir(), 'gaze-compass-studio-v2-qa');
fs.mkdirSync(out, {recursive: true});
const BASE = process.env.DESIGN_QA_URL || 'http://127.0.0.1:5173';
const DRAFT = draftV2('ground');
let browser;
(async () => {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1366, height: 768}, acceptDownloads: true});
  page.setDefaultTimeout(20000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // The view each drawing request asked for; none carries a setting of the removed views.
  const views = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/floorplan/compass/v2/render')) {
    const b = JSON.parse(r.postData() || '{}'); views.push(b.view);
    for (const key of ['preset', 'style', 'light']) if (key in b) errors.push(`a drawing request sent ${key}`); } });
  const lastView = () => views.at(-1);
  let registrations = [];
  await page.routeWebSocket('ws://127.0.0.1:8765', ws => ws.onMessage(raw => {
    const m = JSON.parse(raw); if (m.type === 'register_targets') registrations.push(m.targets);
    if (m.type === 'set_screen') ws.send(JSON.stringify({type: 'screen_changed', screen: m.screen}));
    if (m.type === 'set_gaze_enabled') ws.send(JSON.stringify({type: 'gaze_enabled', enabled: m.enabled}));
  }));
  await page.addInitScript(() => {
    speechSynthesis.speak = () => {};
    window.qaBlobs = new Set(); const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = b => { const u = create(b); window.qaBlobs.add(u); return u; };
    URL.revokeObjectURL = u => { window.qaBlobs.delete(u); revoke(u); };
    const theme = sessionStorage.getItem('qa-theme'); if (theme) localStorage.setItem('gc-theme', theme);
    // No electronAPI.floorplan: drawings and downloads go through the browser, as in the UI-only preview.
    window.electronAPI = {on: () => () => {}, off: () => {}, settings: {load: async () => JSON.parse(sessionStorage.getItem('qa-profile') || 'null'), save: async d => { sessionStorage.setItem('qa-profile', JSON.stringify(d)); return {success: true}; }}};
  });
  await page.goto(BASE); await page.locator('#kb').waitFor();

  /** Opens the map from a draft (a version 2 draft, or a version 1 one to be migrated) and the floor choice. */
  async function open(mode = 'focus', theme = 'warm', draft = DRAFT, v1 = false) {
    await page.evaluate(({mode, theme, draft, v1}) => {
      sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('qa-theme', theme);
      sessionStorage.setItem('qa-profile', JSON.stringify({version: 1, settings: {designMode: mode}}));
      if (v1) localStorage.setItem('compass_persistent_backup', draft);
      else { localStorage.setItem('compass_persistent_backup_v2', draft); localStorage.setItem('gazeconnect_compass_v2_started', '1'); }
    }, {mode, theme, draft, v1});
    await page.reload(); await page.locator('#kb').waitFor();
    await page.evaluate(() => {
      const e = document.querySelector('#kb'); let f = e[Object.keys(e).find(k => k.startsWith('__reactFiber$'))];
      while (f) { if (typeof f.memoizedProps?.onNavigate === 'function') { f.memoizedProps.onNavigate('compass-map'); return; } f = f.return; }
      throw Error('Route not found');
    });
    await page.locator('#strip-generate').waitFor(); await page.click('#strip-generate');
    await page.locator('#confirm-gen-yes').waitFor();
  }
  const floors = () => page.evaluate(() => JSON.parse(localStorage.getItem('compass_persistent_backup_v3')).floors);
  const imageSrc = () => page.evaluate(() => document.querySelector('.studio-drawing img')?.src || '');
  async function drawing(previous = '') {
    await page.waitForFunction(p => { const i = document.querySelector('.studio-drawing img'); return !!i && i.src !== p && i.complete && i.naturalWidth > 0; }, previous);
  }
  /** Chooses a control that draws a new image, and waits for that image. */
  async function redraw(id) { const before = await imageSrc(); await page.click('#' + id); await drawing(before); }
  const heading = () => page.locator('.studio-heading').innerText();
  // Full screen has no heading: the image's description names what is drawn.
  const drawn = () => page.evaluate(() => document.querySelector('.studio-drawing img')?.alt || '');
  const drawingSize = () => page.evaluate(() => { const d = document.querySelector('.studio-drawing'); return {w: d.clientWidth, h: d.clientHeight, image: d.querySelector('img')?.naturalWidth || 0}; });
  /** Where the full screen's image sits in its drawing area (fill width: as wide as the area, moved under it). */
  const placement = () => page.evaluate(() => {
    const d = document.querySelector('.studio-drawing'), i = d.querySelector('img'), a = d.getBoundingClientRect(), b = i.getBoundingClientRect();
    return {fill: d.classList.contains('studio-drawing-fill'), share: +(b.width / innerWidth).toFixed(3), asWide: Math.abs(b.width - a.width) <= 3,
      top: Math.round(b.top - a.top), bottom: Math.round(b.bottom - a.bottom), deep: i.naturalHeight > i.naturalWidth,
      inside: b.top >= a.top - 1 && b.bottom <= a.bottom + 1 && b.left >= a.left - 1 && b.right <= a.right + 1};
  });
  /** Chooses Up or Down in full screen until it is disabled (the plan's end), waiting out each move. */
  async function moveToEnd(id) {
    for (let n = 0; n < 10 && !(await page.locator('#' + id).isDisabled()); n++) { await page.click('#' + id); await page.waitForTimeout(350); }
    assert.equal(await page.locator('#' + id).isDisabled(), true, `${id} reaches the end`);
  }

  const results = [];
  async function audit(label) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.mouse.move(0, 0); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(750); // The 500 ms registration tick.
    const data = await page.evaluate(() => {
      const root = document.querySelector('.compass-plan-studio') || document.querySelector('.compass-plan-choice');
      const targets = [...root.querySelectorAll('button')].filter(e => e.getBoundingClientRect().width).map(e => {
        const r = e.getBoundingClientRect();
        const text = [...e.querySelectorAll('span,small')].filter(n => n.textContent.trim()).flatMap(n => { const q = document.createRange(); q.selectNodeContents(n); return [...q.getClientRects()].map(t => ({x: t.x, y: t.y, right: t.right, bottom: t.bottom})); });
        return {id: e.id, x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right, disabled: e.disabled, clipped: text.some(t => t.x < r.x - 1 || t.right > r.right + 1 || t.y < r.y - 1 || t.bottom > r.bottom + 1)};
      });
      return {targets, overflow: root.scrollHeight > root.clientHeight + 1 || document.documentElement.scrollHeight > innerHeight + 1, width: innerWidth, height: innerHeight};
    });
    for (const t of data.targets) {
      assert.ok(t.w >= 80 && t.h >= 103.5, `${label}: small ${JSON.stringify(t)}`);
      assert.ok(t.x >= 0 && t.y >= 0 && t.right <= data.width && t.bottom <= data.height - 27, `${label}: outside/bottom ${JSON.stringify(t)}`);
      assert.equal(t.clipped, false, `${label}: clipped ${JSON.stringify(t)}`);
    }
    assert.equal(data.overflow, false, `${label}: scroll overflow`);
    await page.evaluate(r => window.qaRegistrations = r, registrations);
    const targeting = await page.evaluate(gazeProbe);
    assert.deepEqual(targeting.misses, [], `${label}: gaze picking`);
    assert.deepEqual(targeting.registration, [], `${label}: live target registration`);
    results.push({label, targets: data.targets, probes: targeting.probes});
  }
  async function downloads(count, click) {
    const files = []; const got = d => files.push(d); page.on('download', got);
    await page.click(click);
    for (let i = 0; i < 300 && files.length < count; i++) await page.waitForTimeout(100);
    page.off('download', got);
    assert.equal(files.length, count, `${click}: ${count} file(s)`);
    const saved = [];
    for (const d of files) { const target = path.join(out, d.suggestedFilename()); await d.saveAs(target); saved.push(target); }
    await page.waitForFunction(() => document.querySelector('#compass-studio-png')?.disabled === false);
    return saved;
  }

  for (const size of (process.env.COMPASS_QA_SMALL ? [[1366, 768]] : [[1366, 768], [1920, 1080]]))
    for (const mode of (process.env.COMPASS_QA_MODES?.split(',') || ['focus', 'serene']))
      for (const theme of (process.env.COMPASS_QA_THEMES?.split(',') || ['warm', 'dark', 'midnight-navy'])) {
        const label = `${size[0]}-${mode}-${theme}`;
        await page.setViewportSize({width: size[0], height: size[1]}); await open(mode, theme);
        assert.equal(await page.locator('#confirm-gen-both').isEnabled(), true);
        await audit(label + '-scope');
        const before = await floors();
        await page.click('#confirm-gen-both'); await drawing();
        assert.match(await heading(), /YOUR HOUSE/); assert.match(await heading(), /Ground floor · Plan/);
        await audit(label + '-plan');
        if (size[0] === 1920 || process.env.COMPASS_QA_SMALL) await page.screenshot({path: path.join(out, `${mode}-${theme}-plan.png`)});
        // The views column: Plan, Model look and the floor switch, sharing its height equally (at 850 px tall or
        // less, Plan and Model look side by side over the floor switch).
        const tools = await page.locator('.studio-tools button').evaluateAll(list => list.map(e => { const r = e.getBoundingClientRect(); return {id: e.id, w: r.width, h: r.height}; }));
        assert.deepEqual(tools.map(t => t.id), ['compass-studio-view-plan', 'compass-studio-view-model', 'compass-studio-floor']);
        assert.ok(tools.every(t => Math.abs(t.h - tools[0].h) <= 1.5 && t.h >= 120), `${label}: equal view targets ${JSON.stringify(tools)}`);
        if (size[1] > 850) assert.ok(tools.every(t => Math.abs(t.w - tools[0].w) <= 1.5), `${label}: one column ${JSON.stringify(tools)}`);
        else assert.ok(Math.abs(tools[0].w - tools[1].w) <= 1.5 && tools[2].w > 1.9 * tools[0].w, `${label}: two over one ${JSON.stringify(tools)}`);
        // Full screen: the drawing larger, drawn again at that size; both views and both floors there.
        const normal = await drawingSize();
        await redraw('compass-studio-full');
        const enlarged = await drawingSize();
        assert.ok(enlarged.w > normal.w && enlarged.h > normal.h && enlarged.image > normal.image, `${label}: full screen ${JSON.stringify([normal, enlarged])}`);
        assert.equal(await page.locator('.studio-header').count(), 0); assert.match(await drawn(), /^Ground floor · Plan\./);
        await audit(label + '-full');
        assert.deepEqual(await page.locator('.studio-full-bar button').evaluateAll(list => list.map(e => e.id)),
          ['compass-studio-full-exit', 'compass-studio-full-plan', 'compass-studio-full-model', 'compass-studio-full-floor-ground',
            'compass-studio-full-floor-first', 'compass-studio-gaze-toggle']);
        // Fill width (29 Oct 2026, maintainer request): the plan's image as wide as the drawing area, over 80 % of the
        // screen; this plot being deeper than wide, it runs below the area. Down and Up move it to its bottom and back;
        // Whole plan draws it fitted again, without Up and Down.
        let place = await placement();
        assert.ok(place.fill && place.asWide && place.share >= 0.8 && place.deep && place.bottom > 0 && Math.abs(place.top) <= 2,
          `${label}: fill width ${JSON.stringify(place)}`);
        assert.equal(await page.locator('#compass-studio-full-up').isDisabled(), true);
        await moveToEnd('compass-studio-full-down'); place = await placement();
        assert.ok(Math.abs(place.bottom) <= 2 && place.top < 0, `${label}: Down reaches the bottom ${JSON.stringify(place)}`);
        await moveToEnd('compass-studio-full-up'); place = await placement();
        assert.ok(Math.abs(place.top) <= 2, `${label}: Up returns to the top ${JSON.stringify(place)}`);
        await redraw('compass-studio-full-fit'); place = await placement();
        assert.ok(!place.fill && place.inside && !place.deep, `${label}: whole plan ${JSON.stringify(place)}`);
        assert.equal(await page.locator('#compass-studio-full-up, #compass-studio-full-down').count(), 0);
        await audit(label + '-full-whole');
        await redraw('compass-studio-full-fit'); assert.ok((await placement()).fill);
        await redraw('compass-studio-full-floor-first'); assert.match(await drawn(), /^First floor · Plan\./);
        // Model look in full screen fills the width as the plan does, and moves with Up and Down.
        await redraw('compass-studio-full-model'); assert.match(await drawn(), /^First floor · Model look\./); assert.equal(lastView(), 'top');
        place = await placement();
        assert.ok(place.fill && place.asWide && place.share >= 0.8 && Math.abs(place.top) <= 2, `${label}: model look fills the width ${JSON.stringify(place)}`);
        await audit(label + '-full-model');
        if (size[0] === 1920 || process.env.COMPASS_QA_SMALL) await page.screenshot({path: path.join(out, `${mode}-${theme}-full-model.png`)});
        await moveToEnd('compass-studio-full-down'); await moveToEnd('compass-studio-full-up');
        await redraw('compass-studio-full-plan'); await redraw('compass-studio-full-floor-ground'); assert.match(await drawn(), /^Ground floor · Plan\./);
        const enlargedImage = await imageSrc(); await page.click('#compass-studio-full-exit'); await page.locator('.studio-header').waitFor();
        assert.equal(await imageSrc(), enlargedImage, 'leaving full screen keeps the image'); assert.match(await heading(), /Ground floor · Plan/);
        // Model look: the furnished top view, a view like Plan.
        await redraw('compass-studio-view-model'); assert.match(await heading(), /Ground floor · Model look/); assert.equal(lastView(), 'top');
        assert.match(await page.locator('#compass-studio-view-model').getAttribute('class'), /studio-selected/);
        assert.doesNotMatch(await page.locator('#compass-studio-view-plan').getAttribute('class'), /studio-selected/);
        await audit(label + '-model');
        if (size[0] === 1920 || process.env.COMPASS_QA_SMALL) await page.screenshot({path: path.join(out, `${mode}-${theme}-model.png`)});
        await redraw('compass-studio-view-plan'); await redraw('compass-studio-floor');
        assert.match(await heading(), /First floor · Plan/); await audit(label + '-first');
        await redraw('compass-studio-view-model'); assert.match(await heading(), /First floor · Model look/);
        await page.click('#compass-studio-downloads'); await audit(label + '-downloads');
        assert.match(await page.locator('#compass-studio-png').innerText(), /First floor, model look/);
        if (size[0] === 1366 && mode === 'focus' && theme === 'warm') {
          const [png] = await downloads(1, '#compass-studio-png');
          assert.match(path.basename(png), /^Compass-[0-9a-f]{8}-first-model-look\.png$/); assert.equal(lastView(), 'top');
          assert.equal(fs.readFileSync(png).subarray(1, 4).toString(), 'PNG');
          const [pdf] = await downloads(1, '#compass-studio-pdf');
          assert.match(path.basename(pdf), /drawing-sheets\.pdf$/); assert.equal(fs.readFileSync(pdf).subarray(0, 5).toString(), '%PDF-');
          const cad = await downloads(3, '#compass-studio-dxf');
          const inches = cad.find(f => f.endsWith('feet-inches.dxf')), mm = cad.find(f => f.endsWith('millimetres.dxf')), readme = cad.find(f => f.endsWith('README.txt'));
          assert.ok(inches && mm && readme, cad.join(', '));
          for (const [file, units] of [[inches, '1'], [mm, '4']]) {
            const text = fs.readFileSync(file, 'latin1');
            assert.match(text, /\$ACADVER\s+1\s+AC1024/, `${file}: DXF R2010`);
            assert.match(text, new RegExp(`\\$INSUNITS\\s+70\\s+${units}\\b`), `${file}: units`);
          }
          assert.match(fs.readFileSync(readme, 'utf8'), /not.*DWG|DXF/i);
          assert.match(await page.locator('.studio-export-status').innerText(), /Download started/);
        }
        await page.click('#compass-studio-notes'); await audit(label + '-notes');
        if (await page.locator('#compass-studio-notes-next').isEnabled()) { await page.click('#compass-studio-notes-next'); await audit(label + '-notes-2'); }
        await page.click('#compass-studio-return'); await drawing();
        await page.click('#compass-studio-back');
        assert.equal(await page.locator('.compass-plan-studio').count(), 0);
        assert.deepEqual(await floors(), before, 'The studio must never change the map');
      }

  await page.setViewportSize({width: 1366, height: 768});
  // Ground floor only: the first floor is left out of the drawing and stays in the map.
  await open(); await page.click('#confirm-gen-yes'); await drawing();
  assert.match(await heading(), /GROUND FLOOR ONLY/); assert.equal(await page.locator('#compass-studio-floor').isEnabled(), false);
  await audit('ground-only');
  // Full screen with one floor: Ground floor shown, selected and not a target; no First floor.
  await redraw('compass-studio-full');
  assert.equal(await page.locator('#compass-studio-full-floor-ground').isDisabled(), true);
  assert.equal(await page.locator('#compass-studio-full-floor-first').count(), 0);
  await audit('ground-only-full');
  await page.click('#compass-studio-full-exit'); await page.locator('.studio-header').waitFor();
  // A newer view replaces an older one; only the newest image is kept, and closing releases it.
  let delayed = 0;
  await page.route('**/api/floorplan/compass/v2/render', async route => { if (++delayed === 1) await new Promise(r => setTimeout(r, 1200)); await route.continue().catch(() => {}); });
  const before = await imageSrc();
  await page.click('#compass-studio-view-model'); await page.click('#compass-studio-view-plan'); await drawing(before);
  await page.waitForTimeout(1500);
  assert.match(await heading(), /Ground floor · Plan/, 'the newest view is shown');
  assert.match(await drawn(), /^Ground floor · Plan\./, 'the slower, older view never replaces it');
  assert.equal(await page.evaluate(() => window.qaBlobs.size), 1, 'Only the current image is retained');
  await page.unroute('**/api/floorplan/compass/v2/render');
  await page.click('#compass-studio-back'); assert.equal(await page.evaluate(() => window.qaBlobs.size), 0, 'Closing releases the image');
  // A failed service is recoverable, and Back to map is never blocked.
  await page.route('**/api/floorplan/compass/v2/model', r => r.fulfill({status: 503, contentType: 'application/json', body: '{"error":"Service unavailable for test"}'}));
  await page.click('#strip-generate'); await page.click('#confirm-gen-yes'); await page.locator('#compass-studio-retry').waitFor();
  await audit('service-error');
  await page.unroute('**/api/floorplan/compass/v2/model');
  await page.click('#compass-studio-retry'); await drawing();
  await page.click('#compass-studio-back');
  // Closing while the plan is still being built neither reopens the studio nor touches the map.
  await page.route('**/api/floorplan/compass/v2/model', async route => { await new Promise(r => setTimeout(r, 800)); await route.continue().catch(() => {}); });
  const kept = await floors();
  await page.click('#strip-generate'); await page.click('#confirm-gen-yes'); await page.locator('.compass-plan-studio').waitFor();
  await page.click('#compass-studio-back'); await page.waitForTimeout(1200);
  assert.equal(await page.locator('.compass-plan-studio').count(), 0); assert.deepEqual(await floors(), kept);
  await page.unroute('**/api/floorplan/compass/v2/model');
  // A map with details from the retired Refine Map: the studio sends them to the saved-plan viewer.
  const withEdges = legacyDraft(false);
  withEdges.advancedFloorMetadata = {gnd: {advanced_refinements: {customEdges: [{id: 'w', cells: ['r1_c1', 'r1_c2'], type: 'full_wall'}]}}};
  await open('focus', 'warm', JSON.stringify(withEdges), true);
  await page.click('#confirm-gen-yes'); await page.locator('#compass-studio-legacy').waitFor();
  assert.match(await page.locator('.studio-empty').innerText(), /saved plan details/);
  await audit('legacy');
  await page.click('#compass-studio-legacy-back'); assert.equal(await page.locator('.compass-plan-studio').count(), 0);
  assert.match(await page.locator('#strip-refine').innerText(), /CONVERT THE MAP FIRST/);

  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(results, null, 2));
  console.log(`PASS: ${results.length} studio screens, ${results.reduce((n, r) => n + r.probes, 0)} gaze target probes; two views (Plan, Model look) in three equal targets, both floors, full screen (views, floors, fill width, image kept), PNG/PDF/DXF downloads, notes, newest view kept, service failure, closing while drawing, saved Refine Map details, map unchanged.`);
  await browser.close();
})().catch(async e => { console.error(e); const pages = browser?.contexts()[0]?.pages(); if (pages?.[0]) await pages[0].screenshot({path: path.join(out, 'failure.png')}).catch(() => {}); await browser?.close(); process.exitCode = 1; });
