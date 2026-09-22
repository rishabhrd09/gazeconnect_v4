// browser-cursor-replay.js — offline replay + invariant harness for the
// INJECTED browser gaze cursor (browserGazeController.ts).
//
// Why: the injected script is the safety-critical dwell loop for web
// browsing, but until now its only automated check was a syntax parse
// (check-injected-script.js). This harness compiles the REAL controller,
// boots the REAL injection IIFE inside a Node VM against a synthetic DOM
// with a mocked clock, and replays gaze traces through the REAL
// per-frame poll contract (buildGazeUpdateAndPollScript envelope,
// view-px -> CSS-px zoom divide, pageZoom arg) — the exact path main.ts
// drives in production.
//
// It asserts the dwell-safety invariants from docs/EYE_TRACKING_CHANGES.md:
//   - fixation commits exactly once, at the target's center
//   - short tracking gaps pause dwell regardless of legacy flags;
//     long gaps and stale queued execution discard pending selection
//   - saved progress resumes only on the SAME target, never cross-target,
//     never across a route change; progressRetentionEnabled=false disables
//   - YouTube sidebar: incumbent stickiness bounds winner flips; the
//     majority-fixated card wins
//   - zoom invariance: identical ON-SCREEN traces produce identical
//     outcomes at 0.75 / 1.0 / 1.35 / 2.0 page zoom
//   - stationary simulation frames (33ms heartbeat) can complete a dwell
//   - a playing video suppresses in-video dwell (no accidental clicks)
//     while the skip-ad button stays clickable
//   - probe snap acquires small off-point targets inside its radius and
//     resolves nothing outside it
//   - telemetry rings stay bounded over long sessions
//
// It also reports hot-path COST COUNTERS (getComputedStyle / querySelector*
// / elementFromPoint / getBoundingClientRect calls per frame) so scan-diet
// changes can be judged by numbers instead of feel.
//
// Run:  node scripts/browser-cursor-replay.js            (all scenarios)
//       node scripts/browser-cursor-replay.js --json     (metrics as JSON)
// Exit: 0 = all invariants hold, 1 = failures (CI-friendly).

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.tmp-replay-check');
const emitJson = process.argv.includes('--json');

execSync(
  'npx tsc electron/browser/browserGazeController.ts --outDir .tmp-replay-check --module commonjs --target es2020 --skipLibCheck --noEmitOnError',
  { cwd: root, stdio: 'inherit' }
);
const controller = require(path.join(outDir, 'browserGazeController.js'));

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — reproducible tremor traces.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) { // Box-Muller
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// Synthetic DOM — just enough fidelity for the injected script's API usage.
// Selector matching is TOKEN-based: each stub element declares the exact
// comma-separated selector tokens (from the controller's own selector
// constants) that it matches. If a future controller edit renames a
// selector, scenarios fail loudly — that is intentional.
// ---------------------------------------------------------------------------
const counters = {
  getComputedStyle: 0,
  elementFromPoint: 0,
  docQuerySelectorAll: 0,
  elQuerySelector: 0,
  getBoundingClientRect: 0,
};
function resetCounters() { for (const k of Object.keys(counters)) counters[k] = 0; }
function snapshotCounters() { return { ...counters }; }

class StubEl {
  constructor(opts = {}) {
    this.tagName = (opts.tag || 'DIV').toUpperCase();
    this.id = opts.id || '';
    this.className = opts.className || '';
    this.rect = opts.rect || { left: 0, top: 0, width: 0, height: 0 };
    this.attrs = { ...(opts.attrs || {}) };
    this.tokens = new Set(opts.tokens || []);
    this.text = opts.text || '';
    this.href = opts.href !== undefined ? opts.href : undefined;
    this.disabled = false;
    this.parentElement = null;
    this.children = [];
    this.isConnected = true;
    this.computed = Object.assign({
      display: 'block', visibility: 'visible', pointerEvents: 'auto',
      opacity: '1', cursor: 'auto', zIndex: '0',
    }, opts.computed || {});
    this.style = {
      setProperty(name, value) { this['--' + name.replace(/^--/, '')] = String(value); },
    };
    const self = this;
    this.classList = {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    };
    this._listeners = {};
    // <video> playback surface
    if (this.tagName === 'VIDEO') {
      this.paused = opts.paused !== undefined ? opts.paused : true;
      this.ended = false;
      this.readyState = 2;
      this.currentSrc = opts.src || 'blob:video';
      this.src = opts.src || 'blob:video';
      this.duration = 120;
      this.currentTime = 3;
    }
    void self;
  }
  appendChild(child) {
    child.parentElement = this;
    child.isConnected = this.isConnected;
    this.children.push(child);
    return child;
  }
  getBoundingClientRect() {
    counters.getBoundingClientRect++;
    const r = this.rect;
    return {
      left: r.left, top: r.top, width: r.width, height: r.height,
      right: r.left + r.width, bottom: r.top + r.height,
      x: r.left, y: r.top,
    };
  }
  getAttribute(name) {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    if (name === 'href' && this.href !== undefined) return this.href;
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
  matches(selector) {
    return String(selector).split(',').some((t) => this.tokens.has(t.trim()));
  }
  closest(selector) {
    let el = this;
    while (el) {
      if (el.matches && el.matches(selector)) return el;
      el = el.parentElement;
    }
    return null;
  }
  _walk(cb) {
    for (const c of this.children) {
      cb(c);
      c._walk(cb);
    }
  }
  querySelector(selector) {
    counters.elQuerySelector++;
    let found = null;
    this._walk((el) => { if (!found && el.matches(selector)) found = el; });
    return found;
  }
  querySelectorAll(selector) {
    const out = [];
    this._walk((el) => { if (el.matches(selector)) out.push(el); });
    out.forEach = Array.prototype.forEach;
    return out;
  }
  contains(el) {
    if (el === this) return true;
    let found = false;
    this._walk((c) => { if (c === el) found = true; });
    return found;
  }
  get textContent() {
    let t = this.text;
    this._walk((el) => { t += (t && el.text ? ' ' : '') + (el.text || ''); });
    return t;
  }
  focus() { /* no-op */ }
  addEventListener(name, fn) { (this._listeners[name] = this._listeners[name] || []).push(fn); }
  removeEventListener(name, fn) {
    const l = this._listeners[name];
    if (l) this._listeners[name] = l.filter((f) => f !== fn);
  }
  fire(name) { (this._listeners[name] || []).forEach((fn) => fn()); }
  get offsetWidth() { return this.rect.width; }
  detach() {
    this.isConnected = false;
    this._walk((el) => { el.isConnected = false; });
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    }
  }
}

function makeEnv({ viewW = 1585, viewH = 891, zoom = 1.0, host = 'www.youtube.com', href } = {}) {
  // Page CSS viewport = view DIPs / zoom (matches Blink).
  const cssW = viewW / zoom;
  const cssH = viewH / zoom;
  const clock = { t: 0, wall: 1750000000000 };
  const timers = [];
  let timerSeq = 1;
  const rafQueue = [];

  const documentElement = new StubEl({ tag: 'html', rect: { left: 0, top: 0, width: cssW, height: cssH } });
  const body = new StubEl({ tag: 'body', rect: { left: 0, top: 0, width: cssW, height: cssH } });
  documentElement.appendChild(body);

  const doc = {
    documentElement,
    body,
    fullscreenElement: null,
    createElement: (tag) => new StubEl({ tag }),
    getElementById(id) {
      let found = null;
      documentElement._walk((el) => { if (!found && el.id === id) found = el; });
      return found;
    },
    querySelector(selector) {
      counters.elQuerySelector++;
      if (documentElement.matches(selector)) return documentElement;
      return documentElement.querySelector(selector);
    },
    querySelectorAll(selector) {
      counters.docQuerySelectorAll++;
      return documentElement.querySelectorAll(selector);
    },
    elementFromPoint(x, y) {
      counters.elementFromPoint++;
      if (x < 0 || y < 0 || x >= cssW || y >= cssH) return null;
      // Deepest-last hit wins (approximates paint order for these layouts).
      let hit = body;
      documentElement._walk((el) => {
        if (el === body) return;
        if (!el.isConnected) return;
        if (el.computed.display === 'none' || el.computed.pointerEvents === 'none') return;
        const r = el.rect;
        if (r.width <= 0 || r.height <= 0) return;
        if (x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height) hit = el;
      });
      return hit;
    },
    addEventListener() { /* recorded elsewhere if needed */ },
    exitFullscreen() { doc.fullscreenElement = null; return Promise.resolve(); },
  };

  const observers = [];
  function MutationObserverStub(cb) {
    this.cb = cb;
    this.observe = () => { observers.push(this); };
    this.disconnect = () => {};
  }

  const ctx = {
    document: doc,
    location: { href: href || `https://${host}/`, hostname: host },
    innerWidth: cssW,
    innerHeight: cssH,
    performance: { now: () => clock.t },
    Date: { now: () => clock.wall + clock.t },
    setTimeout: (fn, ms) => {
      const id = timerSeq++;
      timers.push({ id, due: clock.t + Math.max(0, Number(ms) || 0), fn });
      return id;
    },
    clearTimeout: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    getComputedStyle: (el) => { counters.getComputedStyle++; return el.computed; },
    MutationObserver: MutationObserverStub,
    console: { log() {}, warn() {}, error() {} },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  function advance(dt) {
    clock.t += dt;
    const rafs = rafQueue.splice(0);
    rafs.forEach((fn) => { try { fn(clock.t); } catch (_) {} });
    let due = timers.filter((t) => t.due <= clock.t).sort((a, b) => a.due - b.due);
    while (due.length) {
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
        try { t.fn(); } catch (_) {}
      }
      due = timers.filter((t) => t.due <= clock.t).sort((a, b) => a.due - b.due);
    }
  }

  return { ctx, doc, body, clock, advance, observers, zoom, viewW, viewH, cssW, cssH };
}

function inject(env, seedConfig) {
  // Existing gap/retention scenarios use an explicit allowed 2000ms hold.
  // S18 covers every duration; S19 below covers the unconfigured default.
  seedConfig = { dwellMs: 2000, ...seedConfig };
  if (seedConfig) {
    vm.runInContext(`window.gcConfig = ${JSON.stringify(seedConfig)};`, env.ctx);
  }
  const result = vm.runInContext(controller.buildBrowserCursorInjectionScript(), env.ctx);
  if (result !== 'injected') throw new Error(`injection returned '${result}'`);
}

// Drive one gaze frame exactly like main.ts handleWebviewGazeFrame does:
// view px in, divided by zoom, envelope JSON out.
function frame(env, viewX, viewY, dtMs, opts = {}) {
  env.advance(dtMs);
  const cssX = viewX / env.zoom;
  const cssY = viewY / env.zoom;
  const script = controller.buildGazeUpdateAndPollScript(cssX, cssY, opts.cursorEnabled !== false, env.zoom,
    env.clock.wall + env.clock.t);
  const json = vm.runInContext(script, env.ctx);
  if (!json) return { c: null, s: 'idle' };
  return JSON.parse(json);
}

function gcState(env) { return vm.runInContext('window.gcState', env.ctx); }
function events2(env) { return vm.runInContext('window.__gcTelemetry.events2()', env.ctx); }

// ---------------------------------------------------------------------------
// Page builders (selector tokens mirror browserGazeController.ts constants)
// ---------------------------------------------------------------------------
const CARD_TOKENS = {
  grid: ['ytd-video-renderer'],
  compact: ['ytd-compact-video-renderer'],
};
const ANCHOR_TOKENS = ['a[href]', 'a[href*="/watch?v="]'];
const THUMB_TOKENS = ['a[href]', 'a[href*="/watch?v="]', 'a#thumbnail', '#thumbnail', 'a#thumbnail[href*="/watch"]'];
const TITLE_TOKENS = ['#video-title'];

// A grid card whose anchor covers the whole card (search-results style).
function addGridCard(env, { left, top, width = 320, height = 220, vid }) {
  const card = new StubEl({
    tag: 'ytd-video-renderer',
    tokens: CARD_TOKENS.grid,
    rect: { left, top, width, height },
  });
  const anchor = new StubEl({
    tag: 'a',
    tokens: ANCHOR_TOKENS,
    href: `https://www.youtube.com/watch?v=${vid}`,
    rect: { left, top, width, height },
    text: `Video ${vid}`,
  });
  card.appendChild(anchor);
  env.body.appendChild(card);
  return { card, anchor };
}

// A compact sidebar card: thumbnail (left 40%) + title (right 55%).
function addCompactCard(env, { left, top, width = 400, height = 94, vid }) {
  const card = new StubEl({
    tag: 'ytd-compact-video-renderer',
    tokens: CARD_TOKENS.compact,
    rect: { left, top, width, height },
  });
  const thumbW = Math.round(width * 0.42);
  const thumb = new StubEl({
    tag: 'a',
    id: 'thumbnail',
    tokens: THUMB_TOKENS,
    href: `https://www.youtube.com/watch?v=${vid}`,
    rect: { left, top, width: thumbW, height },
  });
  const title = new StubEl({
    tag: 'span',
    id: 'video-title',
    tokens: TITLE_TOKENS,
    text: `Suggested video ${vid}`,
    rect: { left: left + thumbW + 8, top: top + 6, width: width - thumbW - 16, height: 40 },
  });
  card.appendChild(thumb);
  card.appendChild(title);
  env.body.appendChild(card);
  return { card, anchor: thumb, title };
}

function addVideoPlayer(env, { left, top, width, height, playing }) {
  const player = new StubEl({
    tag: 'div', id: 'movie_player', tokens: ['#movie_player'],
    rect: { left, top, width, height },
  });
  const video = new StubEl({
    tag: 'video', tokens: ['video', 'video.video-stream'],
    rect: { left, top, width, height },
    paused: !playing,
    src: 'https://vid/stream',
  });
  player.appendChild(video);
  env.body.appendChild(player);
  return { player, video };
}

function addSkipButton(env, playerRect) {
  // Bottom-right of the player, plausible skip-ad geometry.
  const rect = {
    left: playerRect.left + playerRect.width - 180,
    top: playerRect.top + playerRect.height - 90,
    width: 140, height: 44,
  };
  const btn = new StubEl({
    tag: 'button',
    className: 'ytp-ad-skip-button-modern',
    tokens: ['button', '.ytp-ad-skip-button-modern'],
    text: 'Skip Ad',
    rect,
  });
  env.body.appendChild(btn);
  return btn;
}

function addLink(env, { left, top, width = 90, height = 22, href = 'https://example.com/x', text = 'link' }) {
  const a = new StubEl({
    tag: 'a', tokens: ['a[href]'], href, text,
    rect: { left, top, width, height },
  });
  env.body.appendChild(a);
  return a;
}

// ---------------------------------------------------------------------------
// Scenario runner + assertions
// ---------------------------------------------------------------------------
const results = [];
const metrics = {};
function scenario(name, fn) {
  const failures = [];
  const t0 = process.hrtime.bigint();
  try {
    fn({
      expect(cond, msg) { if (!cond) failures.push(msg); },
    });
  } catch (err) {
    failures.push(`threw: ${err.message}`);
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  results.push({ name, failures, ms });
  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  console.log(`${status}  ${name} (${ms.toFixed(0)}ms)`);
  for (const f of failures) console.log(`      - ${f}`);
}

function centerOfRect(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

// Collect clicks over a trace. step() returns per-frame envelope.
function runTrace(env, samples, dtMs = 30) {
  const clicks = [];
  const states = [];
  for (const [vx, vy] of samples) {
    const res = frame(env, vx, vy, dtMs);
    states.push(res.s);
    if (res.c) clicks.push({ ...res.c, frameIndex: states.length - 1 });
  }
  return { clicks, states };
}

// === S1: grid fixation with tremor -> exactly one centered click ==========
scenario('S1 grid fixation commits once at card center', (t) => {
  const env = makeEnv({ zoom: 1.0 });
  inject(env);
  const { anchor } = addGridCard(env, { left: 200, top: 150, vid: 'aaa' });
  const c = centerOfRect(anchor.rect);
  const rng = mulberry32(42);
  const samples = [];
  for (let i = 0; i < 100; i++) samples.push([c.x + gauss(rng) * 6, c.y + gauss(rng) * 6]);
  const { clicks } = runTrace(env, samples);
  t.expect(clicks.length === 1, `expected 1 click, got ${clicks.length}`);
  if (clicks.length === 1) {
    const k = clicks[0];
    t.expect(Math.abs(k.x - c.x) <= 2 && Math.abs(k.y - c.y) <= 2,
      `click at (${k.x},${k.y}) not at center (${c.x},${c.y})`);
    t.expect(/^youtube_/.test(k.kind), `unexpected kind ${k.kind}`);
    // Configured dwell is 2000ms AFTER the 280ms intent onset.
    // At 30ms cadence: commit near frame 2280/30 = 76.
    t.expect(k.frameIndex >= 76 && k.frameIndex <= 80,
      `commit at frame ${k.frameIndex}, expected ~76-80`);
  }
});

// === S2: blink gap safety cannot be disabled =============================
scenario('S2 blink gap pauses dwell even with legacy flag disabled', (t) => {
  // Phase A: gapPause ON (default) — gap must NOT count toward dwell.
  let env = makeEnv({ zoom: 1.0 });
  inject(env);
  let { anchor } = addGridCard(env, { left: 200, top: 150, vid: 'bbb' });
  let c = centerOfRect(anchor.rect);
  // 1590ms of fixation (53 frames x 30ms) -> mid-dwell
  let out = runTrace(env, Array(53).fill([c.x, c.y]));
  t.expect(out.clicks.length === 0, 'clicked before gap — dwell too fast');
  // 400ms gap (no frames), then resume. First post-gap frame must not commit.
  const res = frame(env, c.x, c.y, 400);
  t.expect(res.c === null, 'jump-committed on first frame after 400ms gap');
  // Continue fixating: commit should need the REMAINING on-frame time
  // (2000 + 280 - 1590 ≈ 690ms ≈ 23 frames), not fire early. If the gap
  // leaked into the dwell, the commit would land within the first frames.
  out = runTrace(env, Array(40).fill([c.x, c.y]));
  t.expect(out.clicks.length === 1, `expected 1 click after gap, got ${out.clicks.length}`);
  if (out.clicks.length === 1) {
    t.expect(out.clicks[0].frameIndex >= 20,
      `committed only ${out.clicks[0].frameIndex} frames after gap — gap time leaked into dwell`);
  }

  // Phase B: stale protection cannot be disabled or extended by old preferences.
  env = makeEnv({ zoom: 1.0 });
  inject(env, { gapPauseEnabled: false, gapPauseMs: 600 });
  ({ anchor } = addGridCard(env, { left: 200, top: 150, vid: 'ccc' }));
  c = centerOfRect(anchor.rect);
  out = runTrace(env, Array(53).fill([c.x, c.y]));
  t.expect(out.clicks.length === 0, 'flag-off: clicked before gap');
  const resumed = frame(env, c.x, c.y, 400);
  t.expect(resumed.c === null, 'flag-off: first resumed frame committed');
  out = runTrace(env, Array(10).fill([c.x, c.y]));
  t.expect(out.clicks.length === 0, 'flag-off: gap leaked into dwell');
  out = runTrace(env, Array(30).fill([c.x, c.y]));
  t.expect(out.clicks.length === 1, 'flag-off: valid remaining dwell could not complete');
});

scenario('S14 long source loss resets onset and dwell', (t) => {
  const env = makeEnv();
  inject(env);
  const { anchor } = addGridCard(env, { left: 200, top: 150, vid: 'long-loss' });
  const c = centerOfRect(anchor.rect);
  runTrace(env, Array(53).fill([c.x, c.y]));
  const resumed = frame(env, c.x, c.y, 1200);
  t.expect(resumed.c === null, 'source loss committed on resume');
  const out = runTrace(env, Array(25).fill([c.x, c.y]));
  t.expect(out.clicks.length === 0, 'source loss retained old progress');
  t.expect(events2(env).every((e) => e.kind !== 'dwellResumed'), 'source loss resumed a saved target');
});

scenario('S15 progress TTL expires across short gaps even with a long preference', (t) => {
  const env = makeEnv();
  inject(env, { progressRetentionMs: 9000, progressBankEnabled: true });
  const { anchor } = addGridCard(env, { left: 200, top: 150, vid: 'ttl' });
  const c = centerOfRect(anchor.rect);
  runTrace(env, Array(35).fill([c.x, c.y]));
  // Synthetic saved entries exercise the wrapper's real-time expiry directly.
  vm.runInContext(`window.gcState.savedProgress = 0.5;
    window.gcState.savedProgressKey = 'saved';
    window.gcState.savedProgressAt = Date.now();
    window.gcState.progressBank = { saved: { frac: 0.5, at: Date.now() } };`, env.ctx);
  const savedAt = gcState(env).savedProgressAt;
  frame(env, c.x, c.y, 400);
  t.expect(gcState(env).savedProgressAt === savedAt, 'short gap extended saved timestamp');
  frame(env, c.x, c.y, 400);
  frame(env, c.x, c.y, 400);
  t.expect(gcState(env).savedProgressKey === '', 'single saved slot survived >1000ms');
  t.expect(Object.keys(gcState(env).progressBank).length === 0, 'bank entry survived >1000ms');
});

scenario('S16 queued page execution rejects stale samples', (t) => {
  const env = makeEnv();
  inject(env);
  const { anchor } = addGridCard(env, { left: 200, top: 150, vid: 'queue' });
  const c = centerOfRect(anchor.rect);
  runTrace(env, Array(53).fill([c.x, c.y]));
  const script = controller.buildGazeUpdateAndPollScript(c.x, c.y, true, 1,
    env.clock.wall + env.clock.t);
  env.advance(400);
  const result = vm.runInContext(script, env.ctx);
  t.expect(result === null, 'stale queued script emitted a click envelope');
  t.expect(gcState(env).targetKey === '' && gcState(env).start === 0,
    'stale queued script retained a pending target');
});

scenario('S17 hide cancels pending dwell and all saved progress', (t) => {
  const env = makeEnv();
  inject(env, { progressBankEnabled: true });
  const { anchor } = addGridCard(env, { left: 200, top: 150, vid: 'hide' });
  const c = centerOfRect(anchor.rect);
  runTrace(env, Array(53).fill([c.x, c.y]));
  vm.runInContext(controller.BROWSER_CURSOR_HIDE_SCRIPT, env.ctx);
  const state = gcState(env);
  t.expect(state.targetKey === '' && state.start === 0 && state.savedProgressKey === '' &&
    Object.keys(state.progressBank).length === 0, 'hide left selection state alive');
  const out = runTrace(env, Array(30).fill([c.x, c.y]));
  t.expect(out.clicks.length === 0, 'reappearance completed the old dwell');
});

scenario('S18 every duration of the three timing sets excludes onset', (t) => {
  for (const dwellMs of [500, 900, 1000, 1250, 1300, 1500, 1600, 1700, 1900, 2000, 2400, 2500, 3000]) {
    for (const onsetMs of [120, 320]) {
      const env = makeEnv({ host: 'example.com' });
      inject(env, { dwellMs, onsetMs });
      addLink(env, { left: 200, top: 200, width: 300, height: 100 });
      const frameMs = 10;
      const out = runTrace(env, Array(Math.ceil((dwellMs + onsetMs) / frameMs) + 5)
        .fill([350, 250]), frameMs);
      t.expect(out.clicks.length === 1, `${dwellMs}/${onsetMs}: expected one selection`);
      if (out.clicks.length) {
        const elapsed = out.clicks[0].frameIndex * frameMs;
        t.expect(elapsed >= dwellMs + onsetMs && elapsed <= dwellMs + onsetMs + frameMs,
          `${dwellMs}/${onsetMs}: clicked after ${elapsed}ms including onset`);
      }
    }
  }
});

scenario('S19 default and unknown browser durations use the Balanced 1900ms navigation', (t) => {
  for (const dwellMs of [undefined, 1800, 2800, 450]) {
    const env = makeEnv({ zoom: 1.0 });
    inject(env, { dwellMs });
    const { anchor } = addGridCard(env, { left: 200, top: 150, vid: 'default' });
    const c = centerOfRect(anchor.rect);
    const out = runTrace(env, Array(95).fill([c.x, c.y]));
    t.expect(out.clicks.length === 1, 'expected exactly one navigation selection');
    if (out.clicks.length) t.expect(out.clicks[0].frameIndex >= 72 && out.clicks[0].frameIndex <= 76,
      `navigation did not use 1900ms plus onset (frame ${out.clicks[0].frameIndex})`);
  }
});

// === S3: saved-progress resume — same target only, TTL + route guards =====
scenario('S3 dwell progress resumes on same target only', (t) => {
  // (a) same-target resume
  let env = makeEnv({ zoom: 1.0 });
  inject(env);
  const a = addGridCard(env, { left: 120, top: 150, width: 300, height: 200, vid: 'resume' });
  const b = addGridCard(env, { left: 700, top: 150, width: 300, height: 200, vid: 'other' });
  const ca = centerOfRect(a.anchor.rect);
  const cb = centerOfRect(b.anchor.rect);
  // 1710ms of fixation: most of the configured 2000ms dwell.
  let out = runTrace(env, Array(57).fill([ca.x, ca.y]));
  t.expect(out.clicks.length === 0, 'committed before excursion');
  // Excursion to empty space far from both cards (~10 frames = 300ms < 1000 TTL)
  runTrace(env, Array(10).fill([560, 700]));
  // Return to the SAME card: resume should commit much sooner than a
  // fresh onset+dwell (which would need ~76 frames).
  out = runTrace(env, Array(30).fill([ca.x, ca.y]));
  const resumed = events2(env).filter((e) => e.kind === 'dwellResumed');
  t.expect(resumed.length === 1, `expected 1 dwellResumed, got ${resumed.length}`);
  t.expect(out.clicks.length === 1, `expected 1 click after resume, got ${out.clicks.length}`);
  if (out.clicks.length === 1) {
    t.expect(out.clicks[0].frameIndex <= 25,
      `resume did not shorten dwell (commit at frame ${out.clicks[0].frameIndex})`);
  }

  // (b) cross-target: progress on A must NOT transfer to B
  env = makeEnv({ zoom: 1.0 });
  inject(env);
  const a2 = addGridCard(env, { left: 120, top: 150, width: 300, height: 200, vid: 'resume' });
  addGridCard(env, { left: 700, top: 150, width: 300, height: 200, vid: 'other' });
  const ca2 = centerOfRect(a2.anchor.rect);
  runTrace(env, Array(57).fill([ca2.x, ca2.y]));
  out = runTrace(env, Array(26).fill([cb.x, cb.y])); // 780ms on B < onset+dwell
  const resumedB = events2(env).filter((e) => e.kind === 'dwellResumed');
  t.expect(resumedB.length === 0, 'saved progress resumed on a DIFFERENT card');
  t.expect(out.clicks.length === 0, 'cross-target resume produced an early click on B');

  // (c) route change invalidates the save
  env = makeEnv({ zoom: 1.0 });
  inject(env);
  const a3 = addGridCard(env, { left: 120, top: 150, width: 300, height: 200, vid: 'resume' });
  const ca3 = centerOfRect(a3.anchor.rect);
  runTrace(env, Array(57).fill([ca3.x, ca3.y]));
  runTrace(env, Array(3).fill([560, 700])); // break stability -> save
  env.ctx.location.href = 'https://www.youtube.com/watch?v=next';
  out = runTrace(env, Array(30).fill([ca3.x, ca3.y]));
  const resumedC = events2(env).filter((e) => e.kind === 'dwellResumed');
  t.expect(resumedC.length === 0, 'saved progress survived a route change');

  // (d) progressRetentionEnabled=false -> no resume
  env = makeEnv({ zoom: 1.0 });
  inject(env, { progressRetentionEnabled: false });
  const a4 = addGridCard(env, { left: 120, top: 150, width: 300, height: 200, vid: 'resume' });
  const ca4 = centerOfRect(a4.anchor.rect);
  runTrace(env, Array(57).fill([ca4.x, ca4.y]));
  runTrace(env, Array(10).fill([560, 700]));
  runTrace(env, Array(15).fill([ca4.x, ca4.y]));
  const resumedD = events2(env).filter((e) => e.kind === 'dwellResumed');
  t.expect(resumedD.length === 0, 'flag-off: retention still resumed');
});

// === S4: sidebar ambiguity — stickiness bounds flips, majority card wins ===
scenario('S4 sidebar noise: winner sticky, majority card clicked', (t) => {
  const env = makeEnv({ zoom: 1.0 });
  inject(env);
  const cards = [];
  for (let i = 0; i < 8; i++) {
    cards.push(addCompactCard(env, { left: 1050, top: 80 + i * 102, vid: `sb${i}` }));
  }
  const target = cards[3];
  const c = centerOfRect(target.anchor.rect);
  const rng = mulberry32(7);
  const samples = [];
  for (let i = 0; i < 160; i++) {
    samples.push([c.x + gauss(rng) * 14, c.y + gauss(rng) * 22]); // vertical noise straddles neighbours
  }
  const { clicks } = runTrace(env, samples);
  const switches = events2(env).filter((e) => e.kind === 'targetSwitch').length;
  metrics.S4 = { targetSwitches: switches, frames: samples.length };
  t.expect(clicks.length >= 1, `no click in 4.8s of noisy sidebar fixation (switches=${switches})`);
  if (clicks.length >= 1) {
    t.expect(clicks[0].href.includes('sb3'),
      `clicked ${clicks[0].href} instead of the majority-fixated card sb3`);
  }
  // Winner flip bound: with incumbent stickiness this stays low. The exact
  // number is noise-dependent; the invariant is "not flapping every frame".
  t.expect(switches <= 24, `excessive winner flips: ${switches} in ${samples.length} frames`);
});

// === S5: zoom invariance — same screen trace, same outcome at any zoom ====
scenario('S5 zoom invariance (0.75 / 1.0 / 1.35 / 2.0)', (t) => {
  const outcomes = [];
  for (const zoom of [0.75, 1.0, 1.35, 2.0]) {
    const env = makeEnv({ zoom });
    inject(env);
    // Geometry defined in VIEW px, converted to CSS px for the page build —
    // the on-screen experience is identical across zooms.
    const viewRect = { left: 300, top: 200, width: 380, height: 260 };
    const cssRect = {
      left: viewRect.left / zoom, top: viewRect.top / zoom,
      width: viewRect.width / zoom, height: viewRect.height / zoom,
    };
    const { anchor } = addGridCard(env, { ...cssRect, vid: 'zoomcase' });
    void anchor;
    const cView = { x: viewRect.left + viewRect.width / 2, y: viewRect.top + viewRect.height / 2 };
    const rng = mulberry32(99);
    const samples = [];
    for (let i = 0; i < 90; i++) {
      samples.push([cView.x + gauss(rng) * 8, cView.y + gauss(rng) * 8]); // view-px tremor
    }
    const { clicks } = runTrace(env, samples);
    outcomes.push({ zoom, clicks: clicks.length, frame: clicks[0]?.frameIndex ?? -1, kind: clicks[0]?.kind });
  }
  metrics.S5 = outcomes;
  t.expect(outcomes.every((o) => o.clicks === 1),
    `not all zooms clicked exactly once: ${JSON.stringify(outcomes)}`);
  const frames = outcomes.map((o) => o.frame);
  t.expect(Math.max(...frames) - Math.min(...frames) <= 2,
    `commit frame varies with zoom: ${JSON.stringify(outcomes)}`);
});

// === S6: stationary simulation heartbeat completes a dwell ================
scenario('S6 stationary simulated gaze (33ms heartbeat) commits', (t) => {
  const env = makeEnv({ zoom: 1.0 });
  inject(env);
  const { anchor } = addGridCard(env, { left: 200, top: 150, vid: 'sim' });
  const c = centerOfRect(anchor.rect);
  const { clicks } = runTrace(env, Array(90).fill([c.x, c.y]), 33);
  t.expect(clicks.length === 1, `stationary sim: expected 1 click, got ${clicks.length}`);
});

// === S7: playing video suppresses in-video dwell; skip stays clickable ====
scenario('S7 playing video: no in-video clicks, skip-ad still works', (t) => {
  let env = makeEnv({ zoom: 1.0 });
  inject(env);
  const playerRect = { left: 100, top: 80, width: 900, height: 500 };
  addVideoPlayer(env, { ...playerRect, playing: true });
  const mid = { x: playerRect.left + 450, y: playerRect.top + 250 };
  const out = runTrace(env, Array(100).fill([mid.x, mid.y])); // 3s on the video
  t.expect(out.clicks.length === 0, `dwell clicked a PLAYING video ${out.clicks.length}x`);
  const suppressed = out.states.filter((s) => s === 'suppressed').length;
  t.expect(suppressed >= 90, `expected suppressed dwellState, got ${suppressed}/100 frames`);
  const supEvents = events2(env).filter((e) => e.kind === 'dwellSuppressed').length;
  t.expect(supEvents <= 5, `dwellSuppressed not rate-limited: ${supEvents} events in 3s`);

  // Skip-ad exemption: same geometry + a skip button inside the video rect.
  env = makeEnv({ zoom: 1.0 });
  inject(env);
  addVideoPlayer(env, { ...playerRect, playing: true });
  const skip = addSkipButton(env, playerRect);
  const sc = centerOfRect(skip.rect);
  const { clicks } = runTrace(env, Array(110).fill([sc.x, sc.y]));
  t.expect(clicks.length === 1 && clicks[0].kind === 'youtube_skip_ad',
    `skip-ad not clickable during playback: ${JSON.stringify(clicks.map((k) => k.kind))}`);
});

// === S8: probe snap — acquires near, never fires far ======================
scenario('S8 probe snap radius behaves (hit inside, none outside)', (t) => {
  let env = makeEnv({ zoom: 1.0, host: 'www.example.com' });
  inject(env);
  const link = addLink(env, { left: 400, top: 300 });
  const lc = centerOfRect(link.rect);
  // Gaze 19px below the link's bottom edge — inside the 36px probe radius.
  let out = runTrace(env, Array(90).fill([lc.x, link.rect.top + link.rect.height + 19]));
  t.expect(out.clicks.length === 1 && out.clicks[0].kind === 'probe_snap',
    `probe snap missed a target 19px away: ${JSON.stringify(out.clicks.map((k) => k.kind))}`);
  if (out.clicks.length === 1) {
    t.expect(Math.abs(out.clicks[0].x - lc.x) <= 2 && Math.abs(out.clicks[0].y - lc.y) <= 2,
      'probe click did not land at target center');
  }
  // Gaze 60px below — outside the radius: nothing may resolve, ever.
  env = makeEnv({ zoom: 1.0, host: 'www.example.com' });
  inject(env);
  const link2 = addLink(env, { left: 400, top: 300 });
  out = runTrace(env, Array(90).fill([lc.x, link2.rect.top + link2.rect.height + 60]));
  t.expect(out.clicks.length === 0, 'probe snap fired on a target 60px away');
  t.expect(out.states.every((s) => s === 'idle'), 'dwell engaged with no target under gaze');
});

// === S11: empty-space gaze must not prime an instant click ================
// Parking gaze on non-interactive space must not accumulate dwell time.
// Without the guard, 1.2s parked on blank page + a tremor drift onto an
// adjacent link (inside the 60px stability radius) fires a click with
// ZERO dwell time on that link — a misclick generator on dense pages.
scenario('S11 empty-space dwell cannot instant-click a drifted-onto link', (t) => {
  const env = makeEnv({ zoom: 1.0, host: 'www.example.com' });
  inject(env);
  // Link 40px right of the parked gaze point — within the stability radius.
  const link = addLink(env, { left: 440, top: 292, width: 90, height: 22 });
  const lc = centerOfRect(link.rect);
  // Park on empty space for 1.5s (50 frames) — no target under gaze.
  // (Link's near edge is 40px away: outside the 36px probe radius, so
  // nothing resolves while parked.)
  let out = runTrace(env, Array(50).fill([400, 303]));
  t.expect(out.clicks.length === 0, 'clicked while parked on empty space');
  // Drift 50px onto the link — INSIDE the 60px stability radius, so the
  // stability clock is not reset by the move itself.
  out = runTrace(env, Array(8).fill([450, 303]));
  t.expect(out.clicks.length === 0,
    `instant click ${JSON.stringify(out.clicks.map((k) => [k.kind, k.frameIndex]))} fired from empty-space dwell accumulation`);
  // The link must still be clickable with a PROPER full dwell.
  out = runTrace(env, Array(80).fill([450, 303]));
  t.expect(out.clicks.length === 1, `link not clickable after guard (got ${out.clicks.length})`);
  if (out.clicks.length === 1) {
    t.expect(out.clicks[0].frameIndex >= 20,
      `dwell on drifted-onto link too short: frame ${out.clicks[0].frameIndex}`);
    // Direct 'interactive' hits click at the GAZE point (preferCenter is
    // false so a long link can be clicked at the word being looked at) —
    // assert it landed inside the link's rect.
    const r = link.rect;
    t.expect(out.clicks[0].x >= r.left && out.clicks[0].x <= r.left + r.width &&
      out.clicks[0].y >= r.top && out.clicks[0].y <= r.top + r.height,
      `click (${out.clicks[0].x},${out.clicks[0].y}) landed outside the link`);
  }
});

// === S12: empty-space gaze must not report a dwell in progress ============
// dwellState drives the main process's edge-scroll pause. If blank-space
// gaze reads as onset/dwell/commit, armed edge scrolling stays paused
// forever while the patient reads — scroll feels dead.
scenario('S12 empty-space gaze reports idle dwellState (edge-scroll safe)', (t) => {
  const env = makeEnv({ zoom: 1.0, host: 'www.example.com' });
  inject(env);
  addLink(env, { left: 900, top: 700 }); // far away, irrelevant
  const { states } = runTrace(env, Array(60).fill([400, 300])); // 1.8s blank
  const nonIdle = states.filter((s) => s !== 'idle');
  t.expect(nonIdle.length === 0,
    `blank-space gaze produced dwellState ${JSON.stringify([...new Set(nonIdle)])} — edge scroll would pause`);
});

// === S13: two-link ping-pong — the per-target progress bank ===============
// Google-results geometry: two links on a 24px row pitch, below the gaze
// noise floor, gaze alternating between them (majority on A). Audit-verified
// current behavior (single save slot + cross-target invalidation): every
// flip discards the other link's progress -> NOTHING ever commits. With the
// bank (progressBankEnabled, B3 prototype): each link accumulates its own
// progress across visits -> the majority link commits; the first commit
// clears the whole bank so the minority link never fires.
scenario('S13 dense-page ping-pong: bank accumulates, slot starves', (t) => {
  const A_RECT = { left: 400, top: 300, width: 200, height: 22 };
  const B_RECT = { left: 400, top: 324, width: 200, height: 22 };
  const pingPongTrace = (cycles) => {
    const samples = [];
    for (let c = 0; c < cycles; c++) {
      for (let i = 0; i < 17; i++) samples.push([500, 311]); // ~510ms on A
      for (let i = 0; i < 11; i++) samples.push([500, 335]); // ~330ms on B
    }
    return samples;
  };

  // Flag OFF (default): starvation — no click ever, in either direction.
  let env = makeEnv({ zoom: 1.0, host: 'www.example.com' });
  inject(env);
  addLink(env, { ...A_RECT, href: 'https://example.com/A', text: 'Result A' });
  addLink(env, { ...B_RECT, href: 'https://example.com/B', text: 'Result B' });
  let out = runTrace(env, pingPongTrace(8)); // ~6.7s of alternation
  t.expect(out.clicks.length === 0,
    `flag OFF: expected starvation (0 clicks), got ${JSON.stringify(out.clicks.map((k) => k.href))}`);

  // Flag ON: majority link (A) commits; minority (B) never does.
  env = makeEnv({ zoom: 1.0, host: 'www.example.com' });
  inject(env, { progressBankEnabled: true });
  addLink(env, { ...A_RECT, href: 'https://example.com/A', text: 'Result A' });
  addLink(env, { ...B_RECT, href: 'https://example.com/B', text: 'Result B' });
  out = runTrace(env, pingPongTrace(8));
  // The bank clears on every commit, so over a long alternation A can
  // legitimately re-accumulate and commit again (with the 900ms cooldown
  // between). The invariants: A commits, B NEVER does.
  t.expect(out.clicks.length >= 1,
    `flag ON: expected the majority link to commit, got 0 clicks`);
  t.expect(out.clicks.every((k) => k.href === 'https://example.com/A'),
    `flag ON: non-A commits: ${JSON.stringify(out.clicks.map((k) => k.href))}`);
  const resumes = events2(env).filter((e) => e.kind === 'dwellResumed' && e.bank === true);
  t.expect(resumes.length >= 2,
    `flag ON: expected banked resumes driving the accumulation, got ${resumes.length}`);
});

// === S9: scan-cost counters on a dense sidebar (report-only) ==============
scenario('S9 hot-path cost counters (dense sidebar, gaze off-cards)', (t) => {
  const env = makeEnv({ zoom: 1.0 });
  inject(env);
  addVideoPlayer(env, { left: 60, top: 80, width: 860, height: 480, playing: false });
  for (let i = 0; i < 30; i++) {
    addCompactCard(env, { left: 1050, top: 60 + i * 102, vid: `dense${i}` });
  }
  // Gaze parked over the (paused) video — the common "watching/reading" case.
  frame(env, 400, 300, 30); // warm-up frame
  resetCounters();
  const FRAMES = 60;
  for (let i = 0; i < FRAMES; i++) frame(env, 400 + (i % 3), 300 + (i % 3), 30);
  const per = {};
  for (const [k, v] of Object.entries(snapshotCounters())) per[k] = +(v / FRAMES).toFixed(1);
  metrics.S9_offCards_perFrame = per;

  // Same page, gaze ON a mid-sidebar card (active selection case).
  const tgt = { x: 1050 + 168 / 2, y: 60 + 15 * 102 + 47 };
  frame(env, tgt.x, tgt.y, 30);
  resetCounters();
  for (let i = 0; i < FRAMES; i++) frame(env, tgt.x + (i % 3), tgt.y + (i % 3), 30);
  const per2 = {};
  for (const [k, v] of Object.entries(snapshotCounters())) per2[k] = +(v / FRAMES).toFixed(1);
  metrics.S9_onCard_perFrame = per2;
  t.expect(true, '');
});

// === S10: telemetry rings stay bounded over a long session ================
scenario('S10 telemetry rings bounded after 4500 frames', (t) => {
  const env = makeEnv({ zoom: 1.0, host: 'www.example.com' });
  inject(env);
  addLink(env, { left: 400, top: 300 });
  for (let i = 0; i < 4500; i++) {
    frame(env, 200 + (i % 50), 500 + (i % 30), 30);
  }
  const st = gcState(env);
  t.expect(st.frames.length <= 4000, `frames ring grew to ${st.frames.length}`);
  t.expect(st.events2.length <= 500, `events2 ring grew to ${st.events2.length}`);
  t.expect(st.telemetry.length <= 200, `click ring grew to ${st.telemetry.length}`);
  t.expect(Object.keys(st.cardPosteriors).length <= 100,
    `posterior map grew to ${Object.keys(st.cardPosteriors).length}`);
  t.expect(Object.keys(st.progressBank || {}).length <= 8,
    `progress bank grew to ${Object.keys(st.progressBank || {}).length}`);
  metrics.S10 = {
    frames: st.frames.length, events2: st.events2.length,
    clicks: st.telemetry.length, posteriors: Object.keys(st.cardPosteriors).length,
  };
});

// === S21: the ring sits at the centre of the card being selected ===========
// v17.26 (maintainer, 22 Sep 2026): decide the card first, then show the ring
// at its centre; never the gaze wandering over it, never a recentring later.
// Gaze rests 220 px from the centre with noise and a two-sample flash; the
// ring must stay exactly on the centre, and the click land there (as S1).
scenario('S21 the ring sits at the centre of the card being selected and clicks it once', (t) => {
  const env = makeEnv({ zoom: 1.0 });
  inject(env);
  const { anchor } = addGridCard(env, { left: 200, top: 150, width: 640, height: 360, vid: 'ctr' });
  const c = centerOfRect(anchor.rect);
  const gaze = { x: c.x - 190, y: c.y - 110 };
  const cursor = env.doc.getElementById('gazeconnect-cursor');
  const drawn = () => ({ x: parseFloat(cursor.style.left), y: parseFloat(cursor.style.top) });
  const rng = mulberry32(21);
  const clicks = [];
  let worst = 0, atLanding = 0, onCentre = 0;
  for (let i = 0; i < 100; i++) {
    const flash = i === 40 || i === 41;                 // Two samples 200 px away, still on the card.
    const gx = flash ? gaze.x + 200 : gaze.x + gauss(rng) * 4;
    const gy = gaze.y + gauss(rng) * 4;
    const res = frame(env, gx, gy, 30);
    if (res.c) clicks.push(res.c);
    if (!cursor || i < 2 || res.c) continue;            // From the card's second frame on.
    const p = drawn();
    const off = Math.hypot(p.x - c.x, p.y - c.y);
    worst = Math.max(worst, off);
    if (off < 1) onCentre++;
    if (Math.hypot(p.x - gaze.x, p.y - gaze.y) < 30) atLanding++;
  }
  t.expect(!!cursor, 'no cursor element');
  t.expect(worst < 1, `ring left the card's centre by ${worst.toFixed(0)} px (the gaze is 220 px away)`);
  t.expect(atLanding === 0, `ring was drawn at the gaze landing point on ${atLanding} frames`);
  t.expect(onCentre > 50, `ring on the centre for only ${onCentre} frames`);
  t.expect(clicks.length === 1, `expected 1 click, got ${clicks.length}`);
  if (clicks.length === 1) {
    t.expect(Math.abs(clicks[0].x - c.x) <= 2 && Math.abs(clicks[0].y - c.y) <= 2,
      `click at (${clicks[0].x},${clicks[0].y}) not at the card centre (${c.x},${c.y})`);
  }
});

// === S22: from one card to another the ring goes centre to centre ==========
// The eyes move from a corner of card A to a corner of card B mid-dwell. The
// ring must go from A's centre straight to B's centre, never via either gaze
// point, and B (not A) is what gets clicked.
scenario('S22 moving to another card: the ring goes centre to centre, B is clicked', (t) => {
  const env = makeEnv({ zoom: 1.0 });
  inject(env);
  const A = addGridCard(env, { left: 60, top: 120, width: 420, height: 260, vid: 'aaa' }).anchor;
  const B = addGridCard(env, { left: 900, top: 420, width: 420, height: 260, vid: 'bbb' }).anchor;
  const ca = centerOfRect(A.rect), cb = centerOfRect(B.rect);
  const gA = { x: ca.x - 150, y: ca.y - 90 }, gB = { x: cb.x + 150, y: cb.y + 90 };
  const cursor = env.doc.getElementById('gazeconnect-cursor');
  const drawn = () => ({ x: parseFloat(cursor.style.left), y: parseFloat(cursor.style.top) });
  const rng = mulberry32(22);
  const clicks = [];
  for (let i = 0; i < 25; i++) {                        // Part of a dwell on A.
    const res = frame(env, gA.x + gauss(rng) * 4, gA.y + gauss(rng) * 4, 30);
    if (res.c) clicks.push(res.c);
  }
  const before = drawn();
  t.expect(Math.hypot(before.x - ca.x, before.y - ca.y) < 1, `ring not on A's centre before the move`);
  const seen = [];
  for (let i = 0; i < 120; i++) {
    const res = frame(env, gB.x + gauss(rng) * 4, gB.y + gauss(rng) * 4, 30);
    if (res.c) clicks.push(res.c);
    seen.push(drawn());
  }
  const offLanding = seen.filter(p => Math.hypot(p.x - gB.x, p.y - gB.y) < 30 || Math.hypot(p.x - gA.x, p.y - gA.y) < 30).length;
  t.expect(offLanding === 0, `ring drawn at a gaze point on ${offLanding} frames`);
  const others = seen.filter(p => Math.hypot(p.x - ca.x, p.y - ca.y) >= 1 && Math.hypot(p.x - cb.x, p.y - cb.y) >= 1);
  t.expect(others.length === 0, `ring rested ${others.length} frames somewhere other than a centre`);
  const last = seen[seen.length - 1];
  t.expect(Math.hypot(last.x - cb.x, last.y - cb.y) < 1, `ring not on B's centre at the end`);
  t.expect(clicks.length === 1 && clicks[0].href && clicks[0].href.includes('bbb'),
    `expected one click on B, got ${JSON.stringify(clicks.map(c => c.href || c.key))}`);
});

// ---------------------------------------------------------------------------
fs.rmSync(outDir, { recursive: true, force: true });

const failed = results.filter((r) => r.failures.length > 0);
console.log('---');
if (emitJson) {
  console.log(JSON.stringify(metrics, null, 2));
} else {
  console.log('metrics:', JSON.stringify(metrics));
}
console.log(`${results.length - failed.length}/${results.length} scenarios passed`);
process.exit(failed.length ? 1 : 0);
