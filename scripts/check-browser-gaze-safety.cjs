// Exercise the real request gate and native click dispatcher with a fake clock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleValue = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'electron/browser/browserGazeGate.ts'), 'utf8')),
  { module: moduleValue, exports: moduleValue.exports });
const { BrowserGazeGate } = moduleValue.exports;
const workModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'electron/browser/pageWork.ts'), 'utf8')),
  { module: workModule, exports: workModule.exports });
const { PageWorkTracker } = workModule.exports;

let assertions = 0;
function expect(value, message) { assertions += 1; assert.ok(value, message); }

const gate = new BrowserGazeGate();
gate.enable();
const first = gate.begin(10000, 10000);
expect(first, 'first fresh request accepted');
for (let i = 0; i < 10000; i += 1) {
  assert.equal(gate.begin(10000 + i, 10000 + i), null, 'busy gate must drop every intermediate sample');
}
assertions += 1;
gate.invalidate();
gate.enable();
expect(!gate.allowsSelection(first, 10030), 'pause invalidates old response even after re-enable');
expect(gate.begin(10030, 10030) === null, 'invalidation cannot release an unsettled request');
gate.finish(first);
expect(gate.begin(10030, 10030) === null, 'reset must run before another sample');
const reset = gate.beginReset();
expect(reset && !gate.beginReset(), 'only one reset can be in flight');
gate.finish(reset);
const second = gate.begin(10030, 10030);
expect(second, 'next live sample can proceed after reset');
gate.finish(first);
expect(gate.begin(10040, 10040) === null, 'late prior completion cannot release the new request');
gate.finish(second);
expect(gate.allowsSelection(second, 10060), 'fresh delayed click remains eligible after request settlement');
expect(!gate.allowsSelection(second, 10181), 'delayed native click expires');
gate.disable();
expect(!gate.allowsSelection(second, 10060), 'cursor:false invalidates native click');
for (const stamp of [NaN, Infinity, -1, 0, 9849, 10151]) {
  expect(!BrowserGazeGate.isFresh(stamp, 10000), `invalid/backlogged/future timestamp rejected: ${stamp}`);
}

// A request the page never answers gives its slot back (10 Oct 2026). Before, one lost
// answer held the slot for good and gaze selection on the page stopped until it was closed.
{
  const { BROWSER_GAZE_REQUEST_DEADLINE_MS: deadline } = moduleValue.exports;
  expect(deadline === 1500, `gaze request deadline ${deadline} ms`);
  const lost = new BrowserGazeGate();
  lost.enable();
  const unanswered = lost.begin(20000, 20000);
  expect(!lost.expire(20000 + deadline - 1), 'a request is not given up before its deadline');
  expect(lost.begin(20100, 20100) === null, 'and keeps its slot until then');
  expect(lost.expire(20000 + deadline), 'a request unanswered at its deadline is given up');
  expect(!lost.expire(20000 + deadline + 1), 'nothing more to give up');
  expect(!lost.allowsSelection(unanswered, 20000 + deadline), 'its late answer can select nothing');
  lost.enable();
  expect(lost.begin(21600, 21600) === null, 'the page is reset before the next sample');
  const reset = lost.beginReset(21600);
  expect(reset && reset.kind === 'reset' && reset.startedAt === 21600, 'the reset request is timed too');
  lost.finish(unanswered);
  expect(lost.begin(21610, 21610) === null, "the given-up request's late answer frees nothing");
  lost.finish(reset);
  const next = lost.begin(21620, 21620);
  expect(next && lost.allowsSelection(next, 21630), 'gaze selection goes on after the reset');
  const stuckReset = lost.beginReset(21640);
  expect(stuckReset === null, 'no reset is waiting');
  lost.finish(next);
  lost.invalidate();
  const hung = lost.beginReset(30000);
  expect(lost.expire(30000 + deadline), 'an unanswered reset is given up as well');
}

// Scripts waiting in the page (electron/browser/pageWork.ts): limited per kind, forgotten for a
// new document, after the lost limit, or once a later script has been answered.
{
  const { PAGE_WORK_LOST_AFTER_MS: lostAfter } = workModule.exports;
  const work = new PageWorkTracker();
  const a = work.begin('yt:get_state', 1000, 1);
  expect(a !== null && work.begin('yt:get_state', 1100, 1) === null, 'a second state poll waits for the first');
  const b = work.begin('yt:next', 1200, 1);
  expect(b !== null && work.count(1300, 'yt:') === 2 && work.count(1300) === 2, 'kinds counted apart and by prefix');
  const g1 = work.begin('gaze', 1300, 2);
  const g2 = work.begin('gaze', 1400, 2);
  expect(g1 !== null && g2 !== null && work.begin('gaze', 1500, 2) === null, 'two gaze scripts at most');
  expect(work.oldestAgeMs(4000) === 3000 && work.oldestKind(4000) === 'yt:get_state', 'the oldest waiting script and its age');
  work.end(a);
  expect(work.begin('yt:get_state', 4100, 1) !== null, 'an answered script frees its place');
  expect(work.dropStartedBefore(1350) === 2 && work.count(4200, 'gaze') === 1, 'scripts overtaken by an answered one stop counting');
  work.end(b);
  work.end(b);
  expect(work.count(4300, 'yt:next') === 0, 'ending twice is harmless');
  expect(lostAfter === 30000, `scripts are forgotten after ${lostAfter} ms`);
  expect(work.count(1400 + lostAfter, 'gaze') === 0 && work.sweep(1400 + lostAfter) === 0, 'a lost script stops counting');
  work.begin('playback', 50000, 1);
  work.clear();
  expect(work.count(50001) === 0 && work.oldestAgeMs(50001) === 0, 'a new document forgets the old one');
}

// Extract and transpile the actual main-process function, rather than a copy of
// its behavior, so removing a native mouseDown guard breaks these checks.
const source = ts.createSourceFile('main.ts', fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8'),
  ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);
const dispatcher = source.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'sendTrustedBrowserClick');
assert.ok(dispatcher, 'native click dispatcher exists');
// 10 Oct 2026: a memory rebuild waits for a real change of page or video. YouTube rewrites the
// address of the video being watched, and a rebuild there restarted the page during More Videos.
{
  const idOf = source.statements.find((s) => ts.isVariableStatement(s) &&
    s.declarationList.declarations.some((d) => d.name.getText(source) === 'youtubeVideoIdOf'));
  const same = source.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'samePageAndVideo');
  assert.ok(idOf && same, 'the page-and-video comparison exists');
  const ctx = vm.createContext({ URL });
  vm.runInContext(compile(idOf.getText(source) + '\n' + same.getText(source)), ctx);
  const watch = 'https://www.youtube.com/watch?v=abc123&list=RDabc123';
  expect(ctx.samePageAndVideo(watch, watch + '&pp=xyz') && ctx.samePageAndVideo(watch, 'https://www.youtube.com/watch?list=RDabc123&v=abc123&t=107s'),
    'the same video with its address rewritten is no change of video');
  expect(!ctx.samePageAndVideo(watch, 'https://www.youtube.com/watch?v=def456&list=RDabc123'), 'another video is a change');
  expect(!ctx.samePageAndVideo(watch, 'https://www.youtube.com/results?search_query=lata'), 'a results page is a change');
  expect(!ctx.samePageAndVideo('', watch), 'no earlier address: a change');
}

// Which pages count as YouTube, as the main process decides it.
const urlHelpers = ['getDomainFromUrl', 'isYoutubeUrl'].map((name) => {
  const fn = source.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(fn, name + ' exists');
  return fn.getText(source);
}).join('\n');

function harness(pageUrl = 'https://www.youtube.com/results?search_query=lata') {
  let now = 10000;
  let destroyed = false;
  const events = [];
  const timers = [];
  const g = new BrowserGazeGate();
  g.enable();
  const request = g.begin(now, now);
  g.finish(request);
  const view = {
    webContents: {
      isDestroyed: () => destroyed,
      getZoomFactor: () => 1.35,
      getURL: () => pageUrl,
      executeJavaScript: () => Promise.resolve(),
      sendInputEvent: (event) => events.push(event),
    },
  };
  const context = vm.createContext({
    activeBrowserView: view,
    activeBrowserViewSessionId: 1,
    browserGazeConfig: { zoomCompensationEnabled: true, postClickCooldownMs: 900 },
    buildBrowserCursorBlockScript: () => 'block',
    gazeGateFor: () => g,
    resetEdgeScrollState: () => {},
    lastBrowserDwellState: 'idle',
    sendBrowserNavState: () => {},
    setTimeout: (fn, delay) => timers.push({ fn, at: now + delay }),
    URL,
  });
  vm.runInContext(compile(urlHelpers + '\n' + dispatcher.getText(source)), context);
  return {
    events, context, gate: g,
    call: (manual = false) => context.sendTrustedBrowserClick(100, 200, 1,
      manual ? undefined : () => g.allowsSelection(request, now)),
    destroy: () => { destroyed = true; },
    advance: (ms) => {
      const until = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        if (!timers.length || timers[0].at > until) break;
        const timer = timers.shift();
        now = timer.at;
        timer.fn();
      }
      now = until;
    },
  };
}

let h = harness();
h.call();
h.gate.invalidate();
h.advance(100);
expect(h.events.every((e) => e.type !== 'mouseDown'), 'pause before native delay cancels mouseDown');

h = harness();
h.advance(130);
h.call();
h.advance(30);
expect(h.events.every((e) => e.type !== 'mouseDown'), 'sample aging during native delay cancels mouseDown');

h = harness();
h.call();
h.context.activeBrowserViewSessionId = 2;
h.advance(100);
expect(h.events.every((e) => e.type !== 'mouseDown'), 'navigation/session change cancels pending mouseDown');

h = harness();
h.call();
h.advance(30);
expect(h.events.some((e) => e.type === 'mouseDown'), 'fresh gaze emits mouseDown');
h.gate.invalidate();
h.context.activeBrowserView = null;
h.context.activeBrowserViewSessionId = 2;
h.advance(60);
expect(h.events.some((e) => e.type === 'mouseUp'), 'surviving view gets mouseUp after hide/session change');
expect(h.events.filter((e) => e.type === 'mouseUp').length === 1, 'mouseUp emitted exactly once');

h = harness();
h.call(true);
h.advance(100);
expect(h.events.some((e) => e.type === 'mouseDown') && h.events.some((e) => e.type === 'mouseUp'),
  'explicit manual/toolbar click remains usable without gaze eligibility');

// 8 Oct 2026: on YouTube the page's mouse leaves once the click is done (YouTube plays a preview
// of the video under a resting mouse, which the page cursor will not dwell inside); elsewhere
// it stays where it clicked.
h = harness();
h.call();
h.advance(400);
const kinds = h.events.map((e) => e.type);
expect(kinds.join(',') === 'mouseMove,mouseDown,mouseUp,mouseLeave', 'YouTube: the mouse leaves after the click (' + kinds.join(',') + ')');
const leave = h.events[3];
const up = h.events[2];
expect(leave.x === up.x && leave.y === up.y, 'the mouse leaves from where it clicked');
h = harness('https://www.google.com/search?q=weather');
h.call();
h.advance(400);
expect(h.events.every((e) => e.type !== 'mouseLeave'), 'other sites: the mouse stays where it clicked');
h = harness('https://notyoutube.com/watch?v=x');
h.call();
h.advance(400);
expect(h.events.every((e) => e.type !== 'mouseLeave'), 'a look-alike address is not YouTube');
h = harness();
h.call();
h.advance(100);
h.destroy();
h.advance(300);
expect(h.events.every((e) => e.type !== 'mouseLeave'), 'no mouseLeave to a page that is gone');

// Page requests are spaced out (28 Sep 2026): the Eye Tracker 5's ~66 frames a second, each a
// hit test on the page, saturated YouTube's main thread. Runs the real per-frame handler and the
// real interval from main.ts against a fake clock and a page that answers at once.
async function checkRequestSpacing() {
  const walk = (node, fn) => { fn(node); ts.forEachChild(node, (child) => walk(child, fn)); };
  let handler = null;
  walk(source, (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleWebviewGazeFrame') handler = node;
  });
  const interval = source.statements.find((s) => ts.isVariableStatement(s) &&
    s.declarationList.declarations.some((d) => d.name.getText(source) === 'BROWSER_GAZE_MIN_INTERVAL_MS'));
  assert.ok(handler && interval, 'gaze frame handler and request interval exist');
  const limitStatement = source.statements.find((s) => ts.isVariableStatement(s) &&
    s.declarationList.declarations.some((d) => d.name.getText(source) === 'PAGE_GAZE_SCRIPT_LIMIT'));
  const resetFlush = source.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'flushBrowserGazeReset');
  assert.ok(limitStatement && resetFlush, 'the limit on waiting gaze scripts and the page reset exist');
  // `answering(t)`: whether the page answers a request at time t (a hung page does not).
  const run = async (frameMs, durationMs, hidden = false, answering = () => true) => {
    let now = 50000;
    const requests = [];
    const answers = [];
    const g = new BrowserGazeGate();
    const work = new PageWorkTracker();
    const healthEvents = [];
    const view = {
      webContents: {
        isDestroyed: () => false,
        getZoomFactor: () => 1.35,
        executeJavaScript: () => { requests.push(now); return new Promise((resolve) => answers.push(resolve)); },
        sendInputEvent: () => {},
      },
      getBounds: () => ({ x: 0, y: 0, width: 1600, height: 850 }),
    };
    const context = vm.createContext({
      activeBrowserView: view, activeBrowserViewSessionId: 1, gazeGateFor: () => g, BrowserGazeGate, browserViewHidden: hidden,
      invalidateBrowserGaze: () => {}, BROWSER_CURSOR_HIDE_SCRIPT: 'hide', resetEdgeScrollState: () => {},
      sendEdgeScrollState: () => {}, sendTrustedBrowserClick: () => {}, buildGazeUpdateAndPollScript: () => 'poll',
      browserDiagnostics: { recordIpcTick: () => {}, info: () => {} },
      browserGazeConfig: { edgeScrollEnabled: false, edgeDeadZonePct: 0.02, edgeZonePct: 0.2, zoomCompensationEnabled: true,
        edgeScrollPauseDuringDwell: true, edgeHoldMs: 650, edgeMaxBurstMs: 6000, edgeThrottleMs: 130, edgeMinDeltaPx: 16, edgeMaxDeltaPx: 36 },
      lastBrowserGazeFrameAt: 0, lastBrowserDwellState: 'idle', lastBrowserGazePollAt: 0, lastEdgeScrollAt: 0,
      edgeScrollCandidate: 'none', edgeScrollEnteredAt: 0, edgeScrollActiveDirection: 'none', edgeScrollStartedAt: 0,
      lastBrowserCursorFrameAt: 0, BROWSER_GAZE_REQUEST_DEADLINE_MS: moduleValue.exports.BROWSER_GAZE_REQUEST_DEADLINE_MS,
      pageWorkFor: () => work, health: { event: (name) => healthEvents.push(name) },
      Date: { now: () => now }, Promise,
    });
    vm.runInContext(compile(interval.getText(source)), context);
    vm.runInContext(compile(limitStatement.getText(source)), context);
    vm.runInContext(compile(resetFlush.getText(source)), context);
    vm.runInContext(compile(`var handleWebviewGazeFrame = ${handler.initializer.getText(source)};`), context);
    for (let t = 0; t < durationMs; t += frameMs) {
      now = 50000 + t;
      context.handleWebviewGazeFrame(800, 425, { emittedAtWallMs: now });
      await new Promise(setImmediate);
      if (answering(t)) while (answers.length) answers.shift()(JSON.stringify({ c: null, s: 'idle' }));
      await new Promise(setImmediate);
    }
    requests.healthEvents = healthEvents;
    requests.waiting = work.count(now, 'gaze');
    return requests;
  };
  const fast = await run(15, 3000);
  const gaps = fast.slice(1).map((t, i) => t - fast[i]);
  expect(fast.length >= 95 && fast.length <= 105, `Eye Tracker 5 frames every 15 ms reach the page about 33 times a second (got ${fast.length} in 3 s)`);
  expect(gaps.every((gap) => gap >= 25), `page requests are at least 25 ms apart (smallest gap ${Math.min(...gaps)} ms)`);
  const slow = await run(33, 3000);
  expect(slow.length === Math.ceil(3000 / 33), `frames 33 ms apart are all sent (got ${slow.length} of ${Math.ceil(3000 / 33)})`);
  // 6 Oct 2026: while the search keyboard is shown the page is off the window; gaze must never reach it.
  const hidden = await run(15, 1000, true);
  expect(hidden.length === 0, `a page taken off the window received ${hidden.length} gaze requests`);
  // 10 Oct 2026: a page that stops answering for 8 s, then answers again. Before, the first
  // unanswered request held the slot for good; now it is given up after 1.5 s and the page is
  // sent its reset, and no third script while both wait. Once it answers, requests go on.
  const hung = await run(15, 8000, false, () => false);
  expect(hung.length === 2, `a page that does not answer is sent 2 gaze scripts in 8 s (got ${hung.length})`);
  expect(hung[1] - hung[0] >= 1500, `the second only after the first is given up (${hung[1] - hung[0]} ms)`);
  expect(hung.waiting === 2 && hung.healthEvents.includes('gaze-request-expired'), 'both are counted as waiting, and the give-up is logged');
  const recovers = await run(15, 12000, false, (t) => t >= 8000);
  const after = recovers.filter((t) => t >= 50000 + 8000).length;
  expect(after >= 100, `a page answering again gets gaze requests again (${after} in the next 4 s)`);
  return fast.length;
}

// 7 Oct 2026: the page cursor uses the app's focus rules (src/utils/gazeFocus.ts) with the
// same numbers, and the main process seeds every page with the same defaults.
{
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const focus = read('src/utils/gazeFocus.ts');
  const page = read('electron/browser/browserGazeController.ts');
  const main = read('electron/main.ts');
  // The first number written after a marker (a type line or a call in between is skipped).
  const numberAfter = (text, marker) => {
    for (let i = text.indexOf(marker); i >= 0; i = text.indexOf(marker, i + 1)) {
      const value = parseFloat(text.slice(i + marker.length, i + marker.length + 16));
      if (Number.isFinite(value)) return value;
    }
    return NaN;
  };
  const constant = (name) => numberAfter(focus, 'export const ' + name + ' = ');
  const pageDefault = (key) => numberAfter(page, '        ' + key + ': ');
  const mainDefault = (key) => numberAfter(main, '  ' + key + ': ');
  const pairs = [
    ['focusExitMarginPx', 'EXIT_MARGIN_PX'], ['focusCommitFrom', 'COMMIT_FROM'],
    ['focusCommitExitMarginPx', 'COMMIT_EXIT_MARGIN_PX'], ['focusCommitConfirmMs', 'COMMIT_CONFIRM_MS'],
    ['focusReleaseMs', 'RELEASE_MS'], ['ringFreeHoldPx', 'FREE_HOLD_PX'], ['ringFreeMoveMs', 'FREE_MOVE_MS'],
  ];
  for (const [key, name] of pairs) {
    expect(Number.isFinite(constant(name)), `gazeFocus.ts ${name} not found`);
    expect(pageDefault(key) === constant(name), `page ${key} ${pageDefault(key)} != gazeFocus ${name} ${constant(name)}`);
    expect(mainDefault(key) === pageDefault(key), `main ${key} ${mainDefault(key)} != page ${pageDefault(key)}`);
  }
  // FOCUS_CONFIRM_MS (25 ms) is the second sample at 33 Hz: two samples on the page.
  expect(constant('FOCUS_CONFIRM_MS') < 33 && pageDefault('focusConfirmSamples') === 2, 'the hand-off waits for the second sample');
  for (const key of ['focusSmallMarginRatio', 'focusSmallMarginMinPx', 'ringGlideMs', 'scrollSettleMs', 'probeSnapHysteresisPx']) {
    expect(Number.isFinite(pageDefault(key)) && mainDefault(key) === pageDefault(key), `main and page ${key}: ${mainDefault(key)} / ${pageDefault(key)}`);
  }
  expect(page.includes('        focusHysteresisEnabled: true,') && main.includes('  focusHysteresisEnabled: true,'), 'the focus rules are on by default in page and main');
  expect(main.split('...pageSteadinessConfig(),').length === 3, 'main sends the steadiness settings both on a new page and on a live change');
}

checkRequestSpacing().then((perThreeSeconds) => {
  console.log(`Browser request/native-click safety: ${assertions} checks passed; 10,000 busy frames dropped; ` +
    `${perThreeSeconds} page requests in 3 s of 66 Hz gaze.`);
}).catch((err) => { console.error(err); process.exit(1); });
