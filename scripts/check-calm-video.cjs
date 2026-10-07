// Calm full-screen video (7 Oct 2026): the rules in src/components/browser/calmWatch.ts on a
// virtual clock -- glances, the counted look, blinks, glances back, the offer, the bar's idle
// time and the end of a video -- plus the strip's zones and the settings' values.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
// TypeScript sources import each other: compile them as they are required.
require.extensions['.ts'] = (mod, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  mod._compile(output, filename);
};
const calm = require(path.join(root, 'src/components/browser/calmWatch.ts'));
const dwell = require(path.join(root, 'src/config/dwellTimeConfig.ts'));
const T = dwell.VIDEO_REVEAL_TIMING;

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

const STEP = 33;
/** Run a script of [zone, ms] stretches; returns the final state and every state seen. */
function run(steps, { holdMs = 4000, start = calm.calmStart(0), ended = () => false } = {}) {
  let state = start;
  let now = state.last;
  const seen = [];
  for (const [zone, ms] of steps) {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + STEP);
      state = calm.calmTick(state, now, zone, holdMs, ended(now));
      seen.push({ now, state });
    }
  }
  return { state, seen, now };
}
const firstOffer = seen => seen.find(s => s.state.phase === 'offer');

test('the timings are the agreed ones, and only 3, 4 or 5 s can be chosen', () => {
  assert.deepEqual([...dwell.VIDEO_REVEAL_HOLD_CHOICES_MS], [3000, 4000, 5000]);
  assert.equal(dwell.DEFAULT_VIDEO_REVEAL_HOLD_MS, 4000);
  assert.deepEqual({ ...T }, { quietMs: 1000, gapGraceMs: 1500, resetAwayMs: 700, offerTimeoutMs: 8000, offerAwayMs: 2000, controlsIdleMs: 8000,
    hideAfterActionMs: 1000, pausedShowMs: 2000, stripEdgePx: 32 });
  for (const ms of [3000, 4000, 5000]) assert.equal(dwell.normalizeVideoRevealHoldMs(ms), ms);
  for (const bad of [undefined, null, 0, 2000, 4500, 10000, NaN, 'soon', -4000]) assert.equal(dwell.normalizeVideoRevealHoldMs(bad), 4000, String(bad));
  assert.equal(dwell.normalizeVideoRevealHoldMs('5000'), 5000);
});

test('looking down right after Full Screen counts nothing until the eyes have been on the video', () => {
  const { state, seen } = run([['strip', 9000]]);
  assert.equal(firstOffer(seen), undefined);
  assert.equal(state.phase, 'watching');
  assert.equal(state.lookMs, 0);
  const armed = run([['video', 200], ['strip', 4200]]);
  assert.ok(firstOffer(armed.seen), 'after a look at the video the strip counts');
});

test('a 4 s look offers Show options; the hint and line appear only after 1 s', () => {
  const { seen } = run([['video', 300], ['strip', 5000]]);
  const offer = firstOffer(seen);
  assert.ok(offer, 'no offer after 5 s on the strip');
  assert.ok(offer.now >= 300 + 4000 && offer.now <= 300 + 4000 + STEP, `offered at ${offer.now} ms`);
  const before = seen.filter(s => s.now < offer.now);
  const hinted = before.filter(s => calm.calmHintShown(s.state));
  assert.ok(hinted.length > 0);
  assert.ok(hinted[0].now >= 300 + 1000 && hinted[0].now <= 300 + 1000 + STEP, `hint from ${hinted[0].now} ms`);
  const quiet = before.filter(s => s.now < 300 + 1000);
  assert.ok(quiet.every(s => calm.calmLookProgress(s.state, 4000) === 0 && !calm.calmHintShown(s.state)));
  let last = -1;
  for (const s of before) {
    const p = calm.calmLookProgress(s.state, 4000);
    assert.ok(p >= last, 'the line never goes back while looking');
    last = p;
  }
  assert.ok(last > 0.97, `line reached ${last} before the offer`);
});

test('3 s and 5 s settings offer at their own times', () => {
  for (const holdMs of [3000, 5000]) {
    const offer = firstOffer(run([['video', 100], ['strip', holdMs + 500]], { holdMs }).seen);
    assert.ok(offer && offer.now >= 100 + holdMs && offer.now <= 100 + holdMs + STEP, `${holdMs}: ${offer && offer.now}`);
  }
});

test('glances under a second show nothing and are forgotten after 0.7 s on the video', () => {
  const { state, seen } = run([['video', 100], ['strip', 900], ['video', 800], ['strip', 900], ['video', 800]]);
  assert.equal(firstOffer(seen), undefined);
  assert.ok(seen.every(s => !calm.calmHintShown(s.state)));
  assert.equal(state.lookMs, 0);
});

test('blinks and drop-outs up to 1.5 s pause the count; a longer gap starts it again', () => {
  // Looking down at the bottom edge, the tracker loses the eyes for up to about a second.
  const paused = run([['video', 100], ['strip', 2000], ['none', 1200], ['strip', 2100]]);
  assert.ok(firstOffer(paused.seen), 'a 1.2 s gap must not cost the look');
  const flicker = run([['video', 100], ['strip', 700], ['none', 400], ['strip', 900], ['none', 900], ['strip', 800], ['none', 300], ['strip', 1700]]);
  assert.ok(firstOffer(flicker.seen), 'a look broken by repeated drop-outs still counts');
  const reset = run([['video', 100], ['strip', 2000], ['none', 1600], ['strip', 2500]]);
  assert.equal(firstOffer(reset.seen), undefined, 'a 1.6 s gap starts the count again');
  assert.ok(Math.abs(reset.state.lookMs - 2500) <= STEP);
});

test('a glance back at the video under 0.7 s pauses the count; 0.7 s starts it again', () => {
  const paused = run([['video', 100], ['strip', 2000], ['video', 500], ['strip', 2100]]);
  assert.ok(firstOffer(paused.seen));
  const reset = run([['video', 100], ['strip', 2000], ['video', 750], ['strip', 2500]]);
  assert.equal(firstOffer(reset.seen), undefined);
});

test('Show options goes after 8 s unchosen, and the count then waits for a look at the video', () => {
  const { state, seen } = run([['video', 100], ['strip', 4000], ['strip', 8100]]);
  const offer = firstOffer(seen);
  const gone = seen.find(s => offer && s.now > offer.now && s.state.phase === 'watching');
  assert.ok(gone, 'the offer never went away');
  assert.ok(gone.now - offer.now >= 8000 - STEP && gone.now - offer.now <= 8000 + STEP, `${gone.now - offer.now} ms`);
  assert.equal(state.armed, false);
  const again = run([['strip', 6000]], { start: state });
  assert.equal(firstOffer(again.seen), undefined, 'still looking down after the timeout must not offer again');
});

test('Show options goes when the eyes are back on the video for 2 s, not for a glance', () => {
  const offered = run([['video', 100], ['strip', 4050]]).state;
  assert.equal(offered.phase, 'offer');
  assert.equal(run([['video', 1500], ['strip', 300]], { start: offered }).state.phase, 'offer');
  const back = run([['video', 2100]], { start: offered }).state;
  assert.equal(back.phase, 'watching');
  assert.equal(back.armed, true);
});

test('choosing it brings the bar; the bar stays while looked at and hides after 8 s unused', () => {
  const offered = run([['video', 100], ['strip', 4050]]);
  let state = calm.calmReveal(offered.state, offered.now);
  assert.equal(state.phase, 'controls');
  state = run([['bar', 20000]], { start: state }).state;
  assert.equal(state.phase, 'controls', 'the bar must stay while the eyes are on it');
  const idle = run([['video', 8100]], { start: state });
  const hidden = idle.seen.find(s => s.state.phase === 'watching');
  assert.ok(hidden && hidden.now - state.last >= 8000 - STEP && hidden.now - state.last <= 8000 + STEP);
  assert.equal(hidden.state.armed, true);
  const used = calm.calmControlUsed(run([['video', 6000]], { start: state }).state);
  assert.equal(used.idleMs, 0, 'a button used restarts the idle time');
  assert.equal(calm.calmControlUsed(calm.calmStart(0)).phase, 'watching', 'outside the bar a button use changes nothing');
});

test('a mouse click on the strip brings the bar at once, even before any look', () => {
  const state = calm.calmReveal(calm.calmStart(0), 10);
  assert.equal(state.phase, 'controls');
});

test('when the video ends the bar comes back and stays until playback resumes', () => {
  let endedUntil = 30000;
  const { seen } = run([['video', 2000], ['video', 40000]], { ended: now => now >= 1000 && now < endedUntil });
  const atEnd = seen.find(s => s.now >= 1000);
  assert.equal(atEnd.state.phase, 'controls');
  assert.ok(seen.filter(s => s.now >= 1000 && s.now < endedUntil).every(s => s.state.phase === 'controls'), 'the bar hid while the video had ended');
  const hidden = seen.find(s => s.now >= endedUntil && s.state.phase === 'watching');
  assert.ok(hidden && hidden.now - endedUntil >= 8000 - STEP && hidden.now - endedUntil <= 8000 + STEP, `hid ${hidden && hidden.now - endedUntil} ms after playback resumed`);
});

// The bar in full screen after an action (8 Oct 2026, maintainer request): Next, Back, Play or
// Skip Ad hide it once the video plays again; Pause keeps it; Hide options puts it away.
function withBar() {
  return calm.calmReveal(calm.calmStart(0), 0);
}
function tickFor(state, ms, zone, playback) {
  let s = state;
  let now = s.last;
  const end = now + ms;
  while (now < end) { now = Math.min(end, now + STEP); s = calm.calmTick(s, now, zone, 4000, playback); }
  return s;
}

test('after Next, Back, Play or Skip Ad the bar goes once the video has played 1 s; loading or an ad keeps it', () => {
  let s = calm.calmActionTaken(withBar());
  s = tickFor(s, 2000, 'bar', 'loading');
  assert.equal(s.phase, 'controls', 'gone while the next video was still loading');
  s = tickFor(s, 3000, 'bar', 'ad');
  assert.equal(s.phase, 'controls', 'gone during an ad (Skip Ad must stay reachable)');
  s = tickFor(s, 900, 'bar', 'playing');
  assert.equal(s.phase, 'controls', 'gone before the video had played 1 s');
  s = tickFor(s, 200, 'bar', 'playing');
  assert.equal(s.phase, 'watching', 'still there 1.1 s into the video');
  assert.equal(s.armed, false, 'looking down must count again only after a look at the video');
});

test('Pause keeps the bar for as long as the video is paused, with no 8 s hide', () => {
  let s = tickFor(withBar(), 20000, 'video', 'paused');
  assert.equal(s.phase, 'controls');
  s = calm.calmActionTaken(s);                          // Play
  s = tickFor(s, 1100, 'bar', 'playing');
  assert.equal(s.phase, 'watching', 'Play brings the calm view back once the video plays');
});

test('a video that stops while the bar is away brings the bar back after 2 s, and it stays while paused', () => {
  let s = run([['video', 500]]).state;
  s = tickFor(s, 1900, 'video', 'paused');
  assert.equal(s.phase, 'watching', 'a short pause shows nothing');
  s = tickFor(s, 200, 'video', 'paused');
  assert.equal(s.phase, 'controls');
  s = tickFor(s, 15000, 'video', 'paused');
  assert.equal(s.phase, 'controls', 'the bar went while the video was still paused');
});

test('Hide options puts the bar away at once; looking down counts again only after a look at the video', () => {
  let s = calm.calmHide(withBar());
  assert.equal(s.phase, 'watching');
  s = tickFor(s, 6000, 'strip', 'playing');
  assert.equal(s.phase, 'watching', 'the eyes still down where Hide options was offered the bar again');
  s = tickFor(s, 100, 'video', 'playing');
  s = tickFor(s, 4100, 'strip', 'playing');
  assert.equal(s.phase, 'offer');
});

test('an action or Hide options with the bar away changes nothing; Show options clears a pending hide', () => {
  const watching = run([['video', 500]]).state;
  assert.deepEqual(calm.calmActionTaken(watching), watching);
  assert.deepEqual(calm.calmHide(watching), watching);
  const pending = calm.calmActionTaken(withBar());
  assert.equal(calm.calmReveal(pending, 0).hideAfterPlay, false);
});

test('a stalled update never turns into a long look', () => {
  let state = calm.calmTick(calm.calmStart(0), 10, 'video', 4000);
  state = calm.calmTick(state, 5010, 'strip', 4000);
  assert.ok(state.lookMs <= calm.CALM_MAX_STEP_MS);
  assert.equal(state.phase, 'watching');
});

test('zones: the strip from 32 px above its top or at the screen edge; the bar and the band above it', () => {
  const strip = { top: 984 };
  const bar = { top: 920 };
  assert.equal(calm.calmZoneOf(null, 'watching', strip, null, 1080), 'none');
  assert.equal(calm.calmZoneOf({ x: 10, y: NaN }, 'watching', strip, null, 1080), 'none');
  assert.equal(calm.calmZoneOf({ x: 900, y: 984 - 33 }, 'watching', strip, null, 1080), 'video');
  assert.equal(calm.calmZoneOf({ x: 900, y: 984 - 32 }, 'watching', strip, null, 1080), 'strip', 'a look reported a little too high');
  assert.equal(calm.calmZoneOf({ x: 900, y: 984 - 90 }, 'watching', strip, null, 1080), 'video', 'captions above the strip never count');
  assert.equal(calm.calmZoneOf({ x: 900, y: 1079 }, 'offer', null, null, 1080), 'strip', 'gaze held at the screen edge');
  assert.equal(calm.calmZoneOf({ x: 900, y: 1130 }, 'watching', strip, null, 1080), 'strip', 'gaze just past the edge');
  assert.equal(calm.calmZoneOf({ x: 900, y: 500 }, 'watching', strip, null, 1080), 'video');
  assert.equal(calm.calmZoneOf({ x: 900, y: 920 - 32 }, 'controls', null, bar, 1080), 'bar');
  assert.equal(calm.calmZoneOf({ x: 900, y: 920 - 33 }, 'controls', null, bar, 1080), 'video');
});

test('after a gaze reveal the bar waits until the eyes leave that spot (the mouse never waits)', () => {
  const at = { x: 960, y: 1030 };
  assert.equal(calm.CALM_REVEAL_MOVE_PX, 80);
  assert.equal(calm.calmMovedAway(null, null), true, 'a mouse reveal holds nothing');
  assert.equal(calm.calmMovedAway(at, null), false, 'a blink does not count as moving away');
  assert.equal(calm.calmMovedAway(at, { x: 960 + 79, y: 1030 }), false);
  assert.equal(calm.calmMovedAway(at, { x: 960, y: 1030 - 81 }), true);
  assert.equal(calm.calmMovedAway(at, { x: NaN, y: 0 }), false);
  const screen = fs.readFileSync(path.join(root, 'src/screens/WebBrowsingScreen.tsx'), 'utf8');
  assert.match(screen, /const barGazeEnabled = toolbarGazeEnabled && calm\.barGazeReady;/);
  const bar = [...screen.matchAll(/<GazeButton id="(yt-[^"]+)"[\s\S]*?gazeEnabled=\{(\w+)\}/g)];
  assert.equal(bar.length, 15, 'the bar buttons, Hide options included');
  for (const [, id, flag] of bar) assert.equal(flag, 'barGazeEnabled', id);
  assert.match(screen, /<GazeButton id="yt-hide-options" onClick=\{calm\.hide\}/);
});

test('the strip is never a gaze target; Show options takes the Video controls time', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/browser/CalmWatchStrip.tsx'), 'utf8');
  const strip = source.match(/<div ref=\{stripRef\}[^>]*>/);
  assert.ok(strip, 'strip element not found');
  assert.doesNotMatch(strip[0], /role=|data-gaze|gaze-button|tabIndex/);
  assert.match(source, /<GazeButton id="calm-show-options"[\s\S]*?dwellCategory="videoControl"/);
});

test('the setting defaults to on and 4 s, and the player uses it', () => {
  const defaults = fs.readFileSync(path.join(root, 'src/services/defaultCustomization.ts'), 'utf8');
  assert.match(defaults, /calmFullScreenVideo: true,/);
  assert.match(defaults, /videoRevealHoldMs: 4000,/);
  const screen = fs.readFileSync(path.join(root, 'src/screens/WebBrowsingScreen.tsx'), 'utf8');
  assert.match(screen, /active: calmEnabled && !!playing && browser\.isOpen && showVideoBar && isVideoMaximized && !searchOpen/);
});

console.log(`\nCalm full-screen video: ${passed} checks passed.`);
