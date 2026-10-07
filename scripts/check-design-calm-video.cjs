/**
 * Calm full-screen video (7 Oct 2026) in the real interface, against a running Vite server
 * (DESIGN_QA_URL, default http://127.0.0.1:5173) with Playwright (PLAYWRIGHT_MODULE). The
 * embedded page is mocked at the IPC boundary and gaze arrives as the backend's own frames
 * over the mocked socket, so the app's cursor makes the selection exactly as with a tracker.
 * At 1366x768 and 1920x1080, Focus and Serene: full screen leaves no control on screen, the
 * page fills the width above a black strip, a 4 s look offers Show options, a gaze selection
 * brings the bar, which hides again unused; a mouse click and the end of a video bring it back;
 * Exit Full restores the usual player.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE = process.env.DESIGN_QA_URL || 'http://127.0.0.1:5173';
const OUT = process.env.DESIGN_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'gaze-calm-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const WATCH_URL = 'https://www.youtube.com/watch?v=abcdefghijk';

const MOCK = () => {
  const handlers = {};
  window.qa = { calls: [], maximized: false, state: 'playing', emit: (channel, payload) => (handlers[channel] || []).forEach(fn => fn(payload)) };
  const record = (name, result) => (...args) => { window.qa.calls.push({ name, args }); return Promise.resolve(result); };
  speechSynthesis.speak = () => {};
  window.electronAPI = {
    on: (channel, fn) => { (handlers[channel] = handlers[channel] || []).push(fn); return () => {}; },
    off: (channel, fn) => { handlers[channel] = (handlers[channel] || []).filter(f => f !== fn); },
    updateAppContext: () => {},
    settings: { load: async () => JSON.parse(sessionStorage.getItem('qa-profile') || 'null'), save: async d => { sessionStorage.setItem('qa-profile', JSON.stringify(d)); return { success: true }; } },
    webview: {
      open: record('open', { success: true }), close: record('close', true), setBounds: record('bounds', true),
      setGazeConfig: record('gaze', true), setScrollMode: record('scrollMode', true), updateGaze: record('updateGaze', true),
      // A reload is a new document: the page is no longer in full screen.
      navigate: (...args) => { window.qa.calls.push({ name: 'navigate', args }); window.qa.maximized = false; return Promise.resolve({ success: true }); },
      back: record('back', true), forward: record('forward', true),
      setVisible: record('visible', { visible: true }), resetBrowserSession: record('reset', { success: true }),
      scrollPage: record('scroll', { ok: true, atTop: true, atBottom: false }),
      youtubeCommand: command => {
        window.qa.calls.push({ name: 'youtube', args: [command] });
        if (command === 'maximize') window.qa.maximized = true;
        if (command === 'restore') window.qa.maximized = false;
        if (command === 'maximize' || command === 'restore' || command === 'is_maximized') return Promise.resolve({ ok: true, maximized: window.qa.maximized });
        if (command === 'get_state') return Promise.resolve({ ok: true, status: 'done', youtubeState: window.qa.state, skippable: false, videoChoices: 12, title: 'Lag Ja Gale',
          promo: !!window.qa.promo, miniplayer: false, time: window.qa.time || 0 });
        if (command === 'play_pause') { window.qa.state = window.qa.state === 'playing' ? 'paused' : 'playing'; return Promise.resolve({ ok: true, status: 'done', youtubeState: window.qa.state }); }
        if (command === 'tidy_page') { const dismissedPromo = !!window.qa.promo; window.qa.promo = false; return Promise.resolve({ ok: true, status: dismissedPromo ? 'done' : 'none', dismissedPromo, youtubeState: window.qa.state }); }
        return Promise.resolve({ ok: true, status: 'done', youtubeState: window.qa.state });
      },
    },
  };
};

const timers = [];
(async () => {
  const browser = await chromium.launch({ headless: true });
  const summary = [];
  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    for (const design of ['focus', 'serene']) {
      const key = `${width}x${height}/${design}`;
      const page = await browser.newPage({ viewport: { width, height } });
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(MOCK);
      await page.addInitScript(d => sessionStorage.setItem('qa-profile', JSON.stringify({ version: 1, settings: { designMode: d } })), design);
      // The backend: connected, then gaze frames wherever `gaze` points (window fractions).
      let gaze = null;
      let stamp = Date.now();
      await page.routeWebSocket('ws://127.0.0.1:8765', ws => {
        ws.send(JSON.stringify({ type: 'connected', tts_available: true, gaze_enabled: true, current_screen: 'home' }));
        const timer = setInterval(() => {
          if (!gaze) return;
          stamp = Math.max(stamp + 1, Date.now());
          ws.send(JSON.stringify({ type: 'gaze', x: gaze.x, y: gaze.y, is_valid: true, signal_state: 'valid', coord_space: 'window', t_helper_ms: stamp, t_sent_wall_ms: Date.now() }));
        }, 16);
        timers.push(timer);
        ws.onClose(() => clearInterval(timer));
      });
      const lookAt = (x, y) => { gaze = { x: x / width, y: y / height }; };
      const box = selector => page.locator(selector).boundingBox();
      const calmPhase = () => page.locator('.youtube-player').getAttribute('data-calm');
      const lastBounds = () => page.evaluate(() => window.qa.calls.filter(c => c.name === 'bounds').at(-1)?.args[0]);
      const frameMatchesBounds = async () => {
        const frame = await box('.browser-content-frame');
        const sent = await lastBounds();
        assert.deepEqual(sent, { x: Math.round(frame.x), y: Math.round(frame.y), width: Math.round(frame.width), height: Math.round(frame.height) }, `${key}: the page was not moved with the frame`);
        return frame;
      };

      await page.goto(BASE, { timeout: 60000 });
      await page.locator('#kb').waitFor({ timeout: 60000 });
      await page.click('#web');
      await page.click('#hub-youtube');
      await page.click('#yv-0');
      await page.waitForTimeout(500);
      await page.evaluate(url => window.qa.emit('webview:navigation-state', { canGoBack: true, canGoForward: false, url }), WATCH_URL);
      await page.locator('#yt-fullscreen').waitFor();
      assert.equal(await calmPhase(), null, `${key}: calm before full screen`);

      // Full Screen: no control on screen, the page across the width above the black strip.
      await page.click('#yt-fullscreen');
      await page.waitForFunction(() => document.querySelector('.youtube-player')?.getAttribute('data-calm') === 'watching');
      await page.waitForTimeout(400);
      assert.equal(await page.locator('.youtube-player .browser-toolbar').count(), 0, `${key}: the bar is still on screen`);
      assert.equal(await page.locator('.youtube-player .browser-status').count(), 0, `${key}: the status line is still on screen`);
      assert.equal(await page.locator('.calm-strip button, .calm-strip [data-gaze], .calm-strip [role=button]').count(), 0, `${key}: the strip has a target`);
      const strip = await box('.calm-strip');
      const expectedStrip = Math.min(144, Math.max(96, height * 0.1));
      assert.ok(Math.abs(strip.height - expectedStrip) <= 1, `${key}: strip ${strip.height}px, expected ${expectedStrip}px`);
      assert.ok(Math.abs(strip.y + strip.height - height) <= 1, `${key}: the strip is not at the bottom`);
      const frame = await frameMatchesBounds();
      assert.ok(frame.x <= 0.5 && Math.abs(frame.width - width) <= 1, `${key}: the page does not fill the width (${frame.x}, ${frame.width})`);
      assert.ok(Math.abs(frame.y + frame.height - strip.y) <= 1, `${key}: the page does not reach the strip`);
      const nav = await page.locator('.nav-bar-container').count();
      assert.ok(nav === 0 || Math.abs(frame.y) <= 0.5 || frame.y > 0, `${key}: layout`);
      await page.screenshot({ path: path.join(OUT, `${width}-${design}-1-watching.png`) });

      // A look: eyes on the video, then 4 s on the strip -> Show options (the hint first).
      lookAt(width / 2, frame.y + frame.height / 2);
      await sleep(400);
      lookAt(width / 2, strip.y + strip.height / 2);
      await sleep(1700);
      assert.equal(await page.locator('.calm-strip-hint').count(), 1, `${key}: no hint after 1.7 s`);
      await page.screenshot({ path: path.join(OUT, `${width}-${design}-2-looking.png`) });
      await page.locator('#calm-show-options').waitFor({ timeout: 4000 });
      assert.equal(await calmPhase(), 'offer');
      const offer = await box('#calm-show-options');
      assert.ok(offer.height >= 79.5 && offer.width >= 79.5, `${key}: Show options ${offer.width}x${offer.height}`);
      assert.ok(offer.y >= strip.y - 0.5 && offer.y + offer.height <= height + 0.5, `${key}: Show options outside the strip`);
      await page.screenshot({ path: path.join(OUT, `${width}-${design}-3-offer.png`) });

      // Selected by gaze, as with a tracker: the bar comes back, the page shrinks above it.
      lookAt(offer.x + offer.width / 2, offer.y + offer.height / 2);
      await page.waitForFunction(() => document.querySelector('.youtube-player')?.getAttribute('data-calm') === 'controls', null, { timeout: 7000 });
      // The eyes stay where Show options was: the button that appeared there must not be chosen.
      const revealedAt = await page.evaluate(() => window.qa.calls.length);
      await sleep(4500);
      const after = await page.evaluate(n => window.qa.calls.slice(n).filter(c => c.name === 'youtube' && c.args[0] !== 'get_state' && c.args[0] !== 'is_maximized').map(c => c.args[0]), revealedAt);
      assert.deepEqual(after, [], `${key}: a look that stayed chose ${after.join(', ')}`);
      assert.equal(await calmPhase(), 'controls');
      assert.equal(await page.locator('#yt-watch-back').getAttribute('data-gaze'), 'false', `${key}: the bar answered gaze before the eyes moved`);
      lookAt(width / 2, height * 0.3);
      await page.waitForFunction(() => document.querySelector('#yt-watch-back')?.getAttribute('data-gaze') === 'true', null, { timeout: 2000 });
      await page.waitForTimeout(300);
      const ids = ['#yt-watch-back', '#yt-playpause', '#yt-next', '#yt-fullscreen', '#yt-more-videos', '#yt-search', '#yt-hide-options'];
      for (const id of ids) {
        const b = await box(id);
        assert.ok(b && b.height >= 79.5 && b.width >= 79.5 && b.y + b.height <= height + 0.5, `${key}: ${id} ${JSON.stringify(b)}`);
      }
      assert.match(await page.locator('#yt-fullscreen').innerText(), /Exit Full/);
      const bar = await box('.youtube-player .browser-toolbar');
      const framed = await frameMatchesBounds();
      assert.ok(Math.abs(framed.y + framed.height - bar.y) <= 1, `${key}: the page overlaps the bar`);
      await page.screenshot({ path: path.join(OUT, `${width}-${design}-4-controls.png`) });

      // Eyes on the video: the bar hides after 8 s unused.
      lookAt(width / 2, framed.y + framed.height / 2);
      await sleep(5000);
      assert.equal(await calmPhase(), 'controls', `${key}: the bar hid too soon`);
      await page.waitForFunction(() => document.querySelector('.youtube-player')?.getAttribute('data-calm') === 'watching', null, { timeout: 5000 });
      gaze = null;

      // A caregiver's click on the strip brings the bar at once.
      await page.click('.calm-strip');
      await page.waitForFunction(() => document.querySelector('.youtube-player')?.getAttribute('data-calm') === 'controls', null, { timeout: 1500 });

      // The end of the video brings the bar and keeps it.
      await page.waitForFunction(() => document.querySelector('.youtube-player')?.getAttribute('data-calm') === 'watching', null, { timeout: 10000 });
      await page.evaluate(() => { window.qa.state = 'ended'; });
      await page.waitForFunction(() => document.querySelector('.youtube-player')?.getAttribute('data-calm') === 'controls', null, { timeout: 4000 });
      await sleep(9000);
      assert.equal(await calmPhase(), 'controls', `${key}: the bar hid while the video had ended`);
      await page.evaluate(() => { window.qa.state = 'playing'; });

      // Exit Full: the usual player and its status line come back.
      await page.click('#yt-fullscreen');
      await page.waitForFunction(() => !document.querySelector('.youtube-player')?.hasAttribute('data-calm'), null, { timeout: 3000 });
      await page.locator('.youtube-player .browser-status').waitFor();
      await page.locator('#yt-fullscreen').waitFor();
      await page.waitForTimeout(500);
      await frameMatchesBounds();

      if (key === '1366x768/focus') {
        // 8 Oct 2026: a YouTube promo over the video is answered (tidy_page), and YouTube's own
        // player error reopens the video where it was, then full screen comes back by itself.
        const callsAt = () => page.evaluate(() => window.qa.calls.length);
        let mark = await callsAt();
        await page.evaluate(() => { window.qa.promo = true; });
        await page.waitForFunction(n => window.qa.calls.slice(n).some(c => c.name === 'youtube' && c.args[0] === 'tidy_page'), mark, { timeout: 4000 });
        await page.click('#yt-fullscreen');
        await page.waitForFunction(() => window.qa.maximized === true);
        await page.evaluate(() => { window.qa.time = 61; });
        await page.waitForTimeout(1600);
        mark = await callsAt();
        await page.evaluate(() => { window.qa.state = 'error'; });
        const reopened = await (await page.waitForFunction(n => {
          const call = window.qa.calls.slice(n).find(c => c.name === 'navigate');
          return call ? call.args[0] : null;
        }, mark, { timeout: 8000 })).jsonValue();
        assert.match(reopened, /v=abcdefghijk/, `${key}: reopened ${reopened}`);
        assert.match(reopened, /[?&]t=59s/, `${key}: not reopened where it was: ${reopened}`);
        await page.evaluate(url => { window.qa.state = 'playing'; window.qa.emit('webview:navigation-state', { canGoBack: true, canGoForward: false, url }); }, reopened);
        await page.waitForFunction(() => window.qa.maximized === true, null, { timeout: 6000 });
        await page.waitForFunction(() => document.querySelector('.youtube-player')?.getAttribute('data-calm') === 'watching', null, { timeout: 6000 });
        summary.push(`${key}: promo answered; after the player error the video reopened at ${reopened.split('t=')[1]}, back in full screen`);
        await page.click('.calm-strip');
        await page.waitForFunction(() => document.querySelector('.youtube-player')?.getAttribute('data-calm') === 'controls', null, { timeout: 3000 });

        // 8 Oct 2026 (maintainer request): Hide options puts the bar away at once; after Next the
        // bar stays while the next video loads and goes once it plays; Pause keeps it.
        const calmIs = phase => page.waitForFunction(p => document.querySelector('.youtube-player')?.getAttribute('data-calm') === p, phase, { timeout: 4500 });
        await page.click('#yt-hide-options');
        await calmIs('watching');
        await page.click('.calm-strip');
        await page.locator('#yt-next').waitFor({ timeout: 2000 });
        await page.evaluate(() => { window.qa.state = 'buffering'; });
        await page.click('#yt-next');
        await page.waitForTimeout(2500);
        assert.equal(await calmPhase(), 'controls', `${key}: the bar went while the next video was still loading`);
        await page.evaluate(() => { window.qa.state = 'playing'; });
        await calmIs('watching');
        await page.click('.calm-strip');
        await page.locator('#yt-playpause').waitFor({ timeout: 2000 });
        await page.click('#yt-playpause');
        await page.waitForTimeout(9500);
        assert.equal(await calmPhase(), 'controls', `${key}: the bar went while the video was paused`);
        await page.click('#yt-playpause');
        await calmIs('watching');
        summary.push(`${key}: Hide options hides the bar at once; after Next it went once the video played; Pause kept it`);
        await page.click('.calm-strip');
        await calmIs('controls');
        await page.click('#yt-fullscreen');
        await page.waitForFunction(() => !document.querySelector('.youtube-player')?.hasAttribute('data-calm'), null, { timeout: 3000 });
      }
      assert.deepEqual(errors, [], `${key}: ${errors.join(' | ')}`);
      summary.push(`${key}: strip ${Math.round(strip.height)}px, page ${Math.round(frame.width)}x${Math.round(frame.height)}, Show options ${Math.round(offer.width)}x${Math.round(offer.height)}`);
      await page.close();
    }
  }
  await browser.close();
  timers.forEach(clearInterval);
  for (const line of summary) console.log(line);
  console.log(`PASS: calm full-screen video at 1366x768 and 1920x1080, Focus and Serene (screens: ${OUT}).`);
  process.exit(0);
})().catch(e => { timers.forEach(clearInterval); console.error(e); process.exit(1); });
