// Up / Down chosen by the page (electron/browser/pageScroll.ts), and YouTube's own reset to the
// top after a navigation (8 Oct 2026): about 0.6 s after a new page's data arrives, YouTube's
// code set html.scrollTop = 0 and undid a press made in that time (every fast Down after a Back
// in the end-to-end run). The real script runs in a stub page on a virtual clock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('electron/browser/pageScroll.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module: mod, exports: mod.exports, Number, JSON });
const { buildPageScrollScript, YOUTUBE_RESET_SETTLE_MS, YOUTUBE_WAIT_MAX_MS, YOUTUBE_RESET_GUARD_MS } = mod.exports;

// A page 3000 px tall seen through a 415 px view (a YouTube video page at zoom 1.35): one press
// moves 80 % of the view, 332 px. `youtube` is what the page cursor script records
// (window.__gcPageNav); null on other sites.
function makePage({ youtube = null } = {}) {
  let now = 10000;
  const timers = [];
  const listeners = new Set();
  const page = {
    scrollTop: 0, scrollHeight: 3000, clientHeight: 415, clientWidth: 820,
    scrollBy({ top }) { this.moveTo(this.scrollTop + top); },
    scrollTo({ top }) { this.moveTo(top); },
    moveTo(y) {
      this.scrollTop = Math.max(0, Math.min(this.scrollHeight - this.clientHeight, y));
      for (const fn of [...listeners]) fn({ target: doc });
    },
  };
  const doc = { scrollingElement: page, documentElement: page, body: {}, elementFromPoint: () => null };
  const win = {
    get scrollY() { return page.scrollTop; }, innerHeight: 415, innerWidth: 820,
    addEventListener: (type, fn) => { if (type === 'scroll') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'scroll') listeners.delete(fn); },
    __gcPageNav: youtube,
  };
  const ctx = vm.createContext({
    window: win, document: doc, getComputedStyle: () => ({ overflowY: 'visible' }), Promise, Math,
    performance: { now: () => now },
    setTimeout: (fn, ms) => { timers.push({ at: now + (ms || 0), fn, id: timers.length + 1 }); return timers.length; },
    clearTimeout: (id) => { const t = timers[id - 1]; if (t) t.cancelled = true; },
  });
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return {
    page, win, listeners,
    get now() { return now; },
    press: (direction) => vm.runInContext(buildPageScrollScript(direction), ctx),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = timers.filter((t) => !t.cancelled && !t.done && t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at;
        due.done = true;
        due.fn();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}
const watch = (promise) => { const out = { value: undefined }; Promise.resolve(promise).then((v) => { out.value = v; }); return out; };

let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`PASS ${name}`); }

(async () => {
  await test('a press on a page with no YouTube navigation scrolls at once', async () => {
    const p = makePage();
    const result = p.press('down');
    assert.equal(typeof result.then, 'undefined', 'answered at once, not later');
    assert.equal(p.page.scrollTop, 332);
    assert.deepEqual([result.ok, result.before, result.after, result.container], [true, 0, 332, 'page']);
  });

  await test('within a second of YouTube\'s page data, Down waits for the reset, then scrolls', async () => {
    const p = makePage({ youtube: { startedAt: 9500, dataAt: 9900 } });
    const answer = watch(p.press('down'));
    await p.advance(700);           // 0.8 s after the data: YouTube resets about now
    assert.equal(p.page.scrollTop, 0, 'scrolled before YouTube\'s reset could happen');
    await p.advance(300);           // 1.1 s after the data
    assert.equal(p.page.scrollTop, 332);
    assert.equal(answer.value && answer.value.after, 332);
    assert.ok(YOUTUBE_RESET_SETTLE_MS >= 900, 'the reset was seen at 0.62-0.64 s; the wait must cover it');
  });

  await test('while YouTube is still loading the page, Down waits for its data and then the settle time', async () => {
    const nav = { startedAt: 9950, dataAt: 1000 };
    const p = makePage({ youtube: nav });
    p.press('down');
    await p.advance(1200);
    assert.equal(p.page.scrollTop, 0, 'scrolled while the page was still loading');
    nav.dataAt = p.now;             // the data arrives
    await p.advance(800);
    assert.equal(p.page.scrollTop, 0, 'scrolled within the reset time');
    await p.advance(300);
    assert.equal(p.page.scrollTop, 332);
  });

  await test(`the wait never exceeds ${YOUTUBE_WAIT_MAX_MS / 1000} s, whatever YouTube does`, async () => {
    const p = makePage({ youtube: { startedAt: 9990, dataAt: 1000 } }); // its data never arrives
    p.press('down');
    await p.advance(YOUTUBE_WAIT_MAX_MS - 100);
    assert.equal(p.page.scrollTop, 0);
    await p.advance(200);
    assert.equal(p.page.scrollTop, 332);
  });

  await test('YouTube\'s reset after the scroll is undone (the page goes back where it was sent)', async () => {
    const p = makePage({ youtube: { startedAt: 8000, dataAt: 8500 } }); // 1.5 s ago: no wait
    p.press('down');
    assert.equal(p.page.scrollTop, 332);
    await p.advance(300);
    p.page.moveTo(0);               // YouTube: html.scrollTop = 0
    assert.equal(p.page.scrollTop, 332);
    assert.equal(p.listeners.size, 0, 'the guard ends after putting the page back');
  });

  await test(`after ${YOUTUBE_RESET_GUARD_MS / 1000} s the guard has ended: a later move to the top stays`, async () => {
    const p = makePage({ youtube: { startedAt: 8000, dataAt: 8500 } });
    p.press('down');
    await p.advance(YOUTUBE_RESET_GUARD_MS + 100);
    assert.equal(p.listeners.size, 0);
    p.page.moveTo(0);
    assert.equal(p.page.scrollTop, 0);
  });

  await test('a gradual move to the top (Gaze Scroll) is not mistaken for the reset', async () => {
    const p = makePage({ youtube: { startedAt: 8000, dataAt: 8500 } });
    p.press('down');
    for (let y = 332 - 30; y >= 0; y -= 30) p.page.moveTo(y);
    p.page.moveTo(0);
    assert.equal(p.page.scrollTop, 0);
  });

  await test('on other sites nothing waits and nothing is guarded', async () => {
    const p = makePage();
    p.press('down');
    assert.equal(p.listeners.size, 0);
    p.page.moveTo(0);
    assert.equal(p.page.scrollTop, 0);
  });

  await test('Top never waits, and a waiting Down is superseded by it (Back to Video)', async () => {
    const p = makePage({ youtube: { startedAt: 9500, dataAt: 9900 } });
    const down = watch(p.press('down'));
    const top = p.press('top');
    assert.equal(typeof top.then, 'undefined', 'Top answered at once');
    await p.advance(YOUTUBE_WAIT_MAX_MS + 500);
    assert.equal(p.page.scrollTop, 0, 'the waiting Down scrolled after Back to Video');
    assert.deepEqual([down.value && down.value.ok, down.value && down.value.reason], [false, 'superseded']);
  });

  await test('a newer press ends the guard of the one before; its own guard keeps its place', async () => {
    const p = makePage({ youtube: { startedAt: 8000, dataAt: 8500 } });
    p.press('down');
    p.press('down');
    assert.equal(p.page.scrollTop, 664);
    p.page.moveTo(0);               // YouTube's reset after both presses
    assert.equal(p.page.scrollTop, 664, 'put back where the latest press sent it');
  });

  await test('Up keeps working at the end of a YouTube page and is guarded the same way', async () => {
    const p = makePage({ youtube: { startedAt: 8000, dataAt: 8500 } });
    p.page.scrollTop = 1200;
    p.press('up');
    assert.equal(p.page.scrollTop, 868);
    p.page.moveTo(0);
    assert.equal(p.page.scrollTop, 868);
  });

  // Where the parts are wired.
  const controller = read('electron/browser/browserGazeController.ts');
  await test('the page cursor script records YouTube\'s navigations for Up / Down', async () => {
    assert.match(controller, /window\.__gcPageNav = window\.__gcPageNav \|\| \{ startedAt: 0, dataAt: 0 \}/);
    assert.match(controller, /addEventListener\('yt-navigate-start', \(\) => \{ pageNav\.startedAt = performance\.now\(\); \}, true\)/);
    assert.match(controller, /addEventListener\('yt-page-data-updated', \(\) => \{ pageNav\.dataAt = performance\.now\(\); \}, true\)/);
  });
  await test('Top (Back to Video) runs even while an Up / Down is still waiting', async () => {
    assert.match(read('electron/main.ts'), /if \(pageScrollInFlight && direction !== 'top'\) return \{ ok: false, reason: 'busy' \};/);
  });

  console.log(`Page scroll: ${passed} checks passed.`);
})().catch((error) => { console.error(error); process.exit(1); });
