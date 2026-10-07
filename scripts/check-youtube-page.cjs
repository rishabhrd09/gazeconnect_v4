// What gaze cannot reach on YouTube (8 Oct 2026): its promo popups over the video ("Into music?
// We are too."), its miniplayer that keeps the last video playing after Back, and its own
// player error ("Something went wrong. Refresh or try again later."). Also what an ad is: the
// player's ad containers stay behind, empty, after every ad; and how Skip Ad presses YouTube's
// own Skip button (a real click at its centre: YouTube ignores a script-made press). The fixed page scripts
// of electron/browser/youtubeController.ts run against a small stand-in for YouTube's page,
// built from the markup measured on the live site that day.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'electron/browser/youtubeController.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module: mod, exports: mod.exports, require: () => ({}), JSON, Set });
const { buildYoutubeCommandScript, isYoutubeCommand } = mod.exports;

// The stand-in: a flat list of elements, each answering the selectors it was given.
function makePage({ path: pathname = '/watch', promo = null, miniplayer = false, error = false, time = 42.7, ad = null, skipAt = null, covered = false } = {}) {
  const clicks = [];
  const all = [];
  const find = (list, selector) => {
    const parts = selector.split(',').map((s) => s.trim());
    return list.filter((e) => e.selectors.some((s) => parts.includes(s)));
  };
  const el = (name, selectors, opts = {}) => {
    const e = {
      name, selectors, hidden: !!opts.hidden, empty: !!opts.empty, disabled: false, className: opts.className || '', textContent: opts.text || '',
      tagName: (opts.tag || 'div').toUpperCase(), attrs: { ...(opts.attrs || {}) }, children: [], parent: null,
      style: { setProperty(key, value, priority) { this[key] = value + (priority ? ' !' + priority : ''); } },
      getBoundingClientRect() {
        if (this.hidden || this.empty) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
        const r = opts.rect || { left: 16, top: 362, width: 455, height: 208 };
        return { ...r, right: r.left + r.width, bottom: r.top + r.height };
      },
      contains(other) { for (let p = other; p; p = p.parent) if (p === this) return true; return false; },
      getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
      hasAttribute(n) { return n in this.attrs; },
      querySelector(sel) { return find(this.children, sel)[0] || null; },
      querySelectorAll(sel) { return find(this.children, sel); },
      closest(sel) { let p = this.parent; while (p) { if (find([p], sel).length) return p; p = p.parent; } return null; },
      click() { clicks.push(name); },
    };
    all.push(e);
    return e;
  };
  const add = (parent, child) => { child.parent = parent; parent.children.push(child); return child; };
  el('app', ['ytd-app'], { attrs: miniplayer ? { 'miniplayer-is-active': '' } : {} });
  const video = el('video', ['video'], { tag: 'video' });
  Object.assign(video, { currentTime: time, readyState: 4, paused: false, error: null });
  if (promo) {
    const dialog = el('dialog', ['tp-yt-paper-dialog'], { tag: 'tp-yt-paper-dialog' });
    const box = add(dialog, el('promo', ['yt-mealbar-promo-renderer'], { text: 'Into music? We are too.' }));
    if (promo !== 'no-button') {
      add(box, el('no thanks', ['#dismiss-button button'], { tag: 'button', attrs: { 'aria-label': 'No thanks' } }));
    }
    add(box, el('check it out', ['#action-button button'], { tag: 'button' }));
  }
  if (miniplayer) el('miniplayer close', ['ytd-miniplayer .ytp-miniplayer-close-button', '.ytp-miniplayer-close-button'], { tag: 'button' });
  el('player error', ['.ytp-error'], { hidden: !error, text: 'Something went wrong. Refresh or try again later.' });
  // The ad containers YouTube keeps in its player: empty and 0 x 0 once an ad is over (measured).
  el('ad containers', ['.ytp-ad-module', '.video-ads'], { empty: ad !== 'showing' });
  if (ad === 'showing' || ad === 'skippable') el('player in an ad', ['.html5-video-player.ad-showing', '.html5-video-player.ad-interrupting']);
  // YouTube's Skip button (measured live: 85 x 36 at the player's lower right), and whatever
  // lies over it when `covered`.
  const skip = ad === 'skippable'
    ? el('skip button', ['.ytp-skip-ad-button', 'button.ytp-skip-ad-button'], { tag: 'button', className: 'ytp-skip-ad-button', text: 'Skip', rect: skipAt || { left: 900, top: 420, width: 85, height: 36 } })
    : null;
  const cover = covered ? el('cover', ['.ytp-ad-player-overlay-layout'], { rect: { left: 0, top: 0, width: 1012, height: 497 } }) : null;
  if (ad === 'countdown') el('ad countdown', ['.ytp-ad-preview-container'], { text: 'Video will play after ad' });
  if (ad === 'countdown-gone') el('ad countdown', ['.ytp-ad-preview-container'], { hidden: true });
  const document = {
    title: 'Lag Ja Gale - YouTube',
    documentElement: { classList: { contains: () => false } },
    querySelector: (sel) => find(all, sel)[0] || null,
    querySelectorAll: (sel) => find(all, sel),
    elementFromPoint: () => cover || skip,
  };
  const window = {
    innerWidth: 1012,
    innerHeight: 497,
    getComputedStyle: (e) => ({ display: e.hidden ? 'none' : 'block', visibility: 'visible', pointerEvents: 'auto', opacity: '1' }),
  };
  const ctx = vm.createContext({ document, window, location: { pathname }, Number, Math, String, Object, JSON });
  return { clicks, all, run: (command) => vm.runInContext(buildYoutubeCommandScript(command), ctx) };
}

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

test('the state reports a promo over the video, and where the video is', () => {
  const page = makePage({ promo: true });
  const state = page.run('get_state');
  assert.equal(state.youtubeState, 'playing');
  assert.equal(state.promo, true);
  assert.equal(state.miniplayer, false);
  assert.equal(state.time, 42);
  assert.equal(makePage().run('get_state').promo, false);
});

test('tidy_page answers a promo with its own No thanks, never Check it out', () => {
  const page = makePage({ promo: true });
  const result = page.run('tidy_page');
  assert.deepEqual(page.clicks, ['no thanks']);
  assert.equal(result.dismissedPromo, true);
  assert.equal(result.closedMiniplayer, false);
  assert.equal(result.status, 'done');
});

test('a promo without a No thanks is hidden instead (its dialog with it)', () => {
  const page = makePage({ promo: 'no-button' });
  page.run('tidy_page');
  assert.deepEqual(page.clicks, []);
  assert.equal(page.all.find((e) => e.name === 'dialog').style.display, 'none !important');
});

test('after Back, the miniplayer still playing the last video is closed with its own button', () => {
  const page = makePage({ path: '/results', miniplayer: true });
  assert.equal(page.run('get_state').miniplayer, true);
  const result = page.run('tidy_page');
  assert.deepEqual(page.clicks, ['miniplayer close']);
  assert.equal(result.closedMiniplayer, true);
});

test('on a video page itself nothing is closed', () => {
  const page = makePage({ path: '/watch', miniplayer: true });
  page.run('tidy_page');
  assert.deepEqual(page.clicks, []);
});

test('with nothing over the page, tidy_page touches nothing', () => {
  const page = makePage({ path: '/results' });
  const result = page.run('tidy_page');
  assert.deepEqual(page.clicks, []);
  assert.equal(result.status, 'none');
});

test('YouTube\'s own error screen on a video page is the error state; a hidden one is not', () => {
  assert.equal(makePage({ error: true }).run('get_state').youtubeState, 'error');
  assert.equal(makePage({ error: false }).run('get_state').youtubeState, 'playing');
  assert.notEqual(makePage({ path: '/results', error: true }).run('get_state').youtubeState, 'error');
});

test('an ad is on only while YouTube shows one, not while its empty ad containers sit in the player', () => {
  assert.equal(makePage().run('get_state').youtubeState, 'playing');
  assert.equal(makePage({ ad: 'showing' }).run('get_state').youtubeState, 'ad_waiting');
  assert.equal(makePage({ ad: 'countdown' }).run('get_state').youtubeState, 'ad_waiting');
  assert.equal(makePage({ ad: 'countdown-gone' }).run('get_state').youtubeState, 'playing');
  assert.equal(makePage().run('skip_ad').status, 'no_ad');
  assert.equal(makePage({ ad: 'showing' }).run('skip_ad').status, 'waiting_for_skip');
});

test('YouTube\'s hover preview is hidden, and no video card with it', () => {
  const main = fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8');
  const css = (main.match(/const YOUTUBE_PAGE_CSS = \[([\s\S]*?)\]\.join/) || [])[1] || '';
  assert.match(css, /ytd-video-preview \{/);
  for (const card of ['ytd-video-renderer', 'yt-lockup-view-model', 'ytd-rich-item-renderer', 'ytd-thumbnail']) {
    assert.ok(!new RegExp(`(^|[\\s,'])${card}[\\s,{]`).test(css), card + ' must stay visible');
  }
});

test('Skip Ad asks for a real click at the centre of YouTube\'s own Skip button, and presses nothing itself', () => {
  const page = makePage({ ad: 'skippable' });
  assert.equal(page.run('get_state').skippable, true);
  const result = page.run('skip_ad');
  assert.equal(result.ok, true);
  assert.equal(result.detail, 'skip_trusted_click');
  assert.deepEqual({ ...result.trustedClick }, { x: 943, y: 438 });
  assert.deepEqual(page.clicks, [], 'a script press as well would make the real click land on the video');
});

test('Skip Ad: with something over the button, or the button off screen, the script press and no real click', () => {
  for (const options of [{ covered: true }, { skipAt: { left: 900, top: 520, width: 85, height: 36 } }]) {
    const page = makePage({ ad: 'skippable', ...options });
    const result = page.run('skip_ad');
    assert.equal(result.detail, 'skip_synthetic_click', JSON.stringify(options));
    assert.equal(result.trustedClick, undefined, JSON.stringify(options));
    assert.deepEqual(page.clicks, ['skip button'], JSON.stringify(options));
  }
});

test('tidy_page is a named command the main process accepts; nothing else new is', () => {
  assert.equal(isYoutubeCommand('tidy_page'), true);
  for (const bad of ['tidy', 'click', 'eval', 'dismiss_all', '']) assert.equal(isYoutubeCommand(bad), false, bad);
});

console.log(`YouTube page: ${passed} checks passed.`);
