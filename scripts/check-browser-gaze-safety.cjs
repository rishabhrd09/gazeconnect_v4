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

function harness() {
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
  });
  vm.runInContext(compile(dispatcher.getText(source)), context);
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

console.log(`Browser request/native-click safety: ${assertions} checks passed; 10,000 busy frames dropped.`);
