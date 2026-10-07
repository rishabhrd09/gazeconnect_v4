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

// Extract and transpile the actual main-process function, rather than a copy of
// its behavior, so removing a native mouseDown guard breaks these checks.
const source = ts.createSourceFile('main.ts', fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8'),
  ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);
const dispatcher = source.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'sendTrustedBrowserClick');
assert.ok(dispatcher, 'native click dispatcher exists');
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
  const run = async (frameMs, durationMs, hidden = false) => {
    let now = 50000;
    const requests = [];
    const answers = [];
    const g = new BrowserGazeGate();
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
      invalidateBrowserGaze: () => {}, flushBrowserGazeReset: () => {}, resetEdgeScrollState: () => {},
      sendEdgeScrollState: () => {}, sendTrustedBrowserClick: () => {}, buildGazeUpdateAndPollScript: () => 'poll',
      browserDiagnostics: { recordIpcTick: () => {}, info: () => {} },
      browserGazeConfig: { edgeScrollEnabled: false, edgeDeadZonePct: 0.02, edgeZonePct: 0.2, zoomCompensationEnabled: true,
        edgeScrollPauseDuringDwell: true, edgeHoldMs: 650, edgeMaxBurstMs: 6000, edgeThrottleMs: 130, edgeMinDeltaPx: 16, edgeMaxDeltaPx: 36 },
      lastBrowserGazeFrameAt: 0, lastBrowserDwellState: 'idle', lastBrowserGazePollAt: 0, lastEdgeScrollAt: 0,
      edgeScrollCandidate: 'none', edgeScrollEnteredAt: 0, edgeScrollActiveDirection: 'none', edgeScrollStartedAt: 0,
      Date: { now: () => now }, Promise,
    });
    vm.runInContext(compile(interval.getText(source)), context);
    vm.runInContext(compile(`var handleWebviewGazeFrame = ${handler.initializer.getText(source)};`), context);
    for (let t = 0; t < durationMs; t += frameMs) {
      now = 50000 + t;
      context.handleWebviewGazeFrame(800, 425, { emittedAtWallMs: now });
      await new Promise(setImmediate);
      while (answers.length) answers.shift()(JSON.stringify({ c: null, s: 'idle' }));
      await new Promise(setImmediate);
    }
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
