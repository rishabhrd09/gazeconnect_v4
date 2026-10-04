/** Real React actions with an isolated settings store and recorded Electron IPC boundary. No video is loaded and no speech is played. */
const assert = require('assert/strict'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
    const b = await chromium.launch({ headless: true }), p = await b.newPage({ viewport: { width: 1366, height: 768 } });
    p.setDefaultTimeout(6000);
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.routeWebSocket('ws://127.0.0.1:8765', ws => {
        ws.send(JSON.stringify({type:'connected',tts_available:false,gaze_enabled:false,current_screen:'home'}));
    });
    await p.addInitScript(() => {
        window.qa = { calls: [], speech: [] };
        speechSynthesis.speak = u => window.qa.speech.push(u.text);
        const record = (name, result) => (...args) => { window.qa.calls.push({ name, args }); return Promise.resolve(result); };
        window.electronAPI = { on: () => () => { }, off: () => { }, updateAppContext: () => { }, settings: { load: async () => JSON.parse(sessionStorage.getItem('data') || 'null'), save: async (d) => { sessionStorage.setItem('data', JSON.stringify(d)); return { success: true }; } }, webview: { open: record('open', { success: true }), close: record('close', true), setBounds: record('bounds', true), setGazeConfig: record('gaze', true), executeJs: record('script', { success: true }), youtubeCommand: record('youtube', { ok: true, status: 'done' }), setScrollMode: record('scrollMode', true), updateGaze: record('updateGaze', true) } };
    });
    await p.goto(process.env.DESIGN_QA_URL || 'http://127.0.0.1:5173');
    await p.locator('#kb').waitFor();
    assert.equal(await p.locator('html').getAttribute('data-design'), 'focus');
    await p.click('#st');
    await p.click('#sidebar-display');
    await p.getByRole('radio', { name: 'Serene', exact: true }).click();
    assert.equal(await p.locator('html').getAttribute('data-design'), 'serene');
    await p.getByRole('radio', { name: 'Warm', exact: true }).click();
    await p.waitForTimeout(600);
    await p.reload();
    await p.locator('#kb').waitFor();
    assert.equal(await p.locator('html').getAttribute('data-design'), 'serene');
    assert.equal(await p.locator('html').getAttribute('data-theme'), 'warm');
    await p.click('#pp');
    await p.getByRole('button', { name: 'Rishabh', exact: true }).first().click();
    await p.click('[id=selected-person-display-Rishabh]');
    assert((await p.evaluate(() => qa.speech)).some(x => x.includes('Rishabh')));
    await p.getByRole('button', { name: 'Home', exact: true }).click();
    await p.click('#med');
    await p.locator('[id^=assist-category-] img').first().waitFor();
    assert.equal(await p.locator('[id^=assist-category-] img').count(), 4);
    assert(await p.locator('[id^=assist-category-] img').evaluateAll(es => es.every(e => e.complete && e.naturalWidth > 0)));
    await p.getByRole('button', { name: 'Home', exact: true }).click();
    await p.click('#web');
    await p.click('#hub-youtube');
    await p.click('#yv-0');
    await p.waitForTimeout(900);
    async function bounds() { const out = await p.evaluate(() => { const r = document.querySelector('.browser-content-frame').getBoundingClientRect(); return { expected: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }, actual: qa.calls.filter(c => c.name === 'bounds').at(-1)?.args[0], open: qa.calls.some(c => c.name === 'open') }; }); assert(out.open); assert.deepEqual(out.actual, out.expected); }
    await bounds();
    await p.click('#yt-toggle-nav');
    await p.waitForTimeout(450);
    await bounds();
    await p.getByRole('button', { name: 'Home', exact: true }).click();
    await p.locator('#kb').waitFor();
    assert(await p.evaluate(() => qa.calls.some(c => c.name === 'close')));
    // Smart-pause retains the state enabled by the embedded browser on return Home.
    const initialGaze = await p.locator('#gaze-toggle-nav').getAttribute('aria-pressed');
    await p.click('#gaze-toggle-nav');
    await p.waitForTimeout(150);
    assert.equal(await p.locator('#gaze-toggle-nav').getAttribute('aria-pressed'), initialGaze === 'true' ? 'false' : 'true');
    await p.click('#gaze-toggle-nav');
    await p.waitForTimeout(150);
    assert.equal(await p.locator('#gaze-toggle-nav').getAttribute('aria-pressed'), initialGaze);
    assert.deepEqual(errors, []);
    console.log('PASS: Focus default, saved Serene + Warm after reload, People speech, all four original Assistance images, YouTube measured bounds before/after Show Nav, Home closes BrowserView, gaze toggle on/off.');
    await b.close();
})().catch(e => { console.error(e); process.exit(1); });
