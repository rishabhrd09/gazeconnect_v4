// Checks the health log's stall rules (electron/healthRecorder.ts, 16 Oct 2026) against the real
// module, compiled on the fly, on a fake clock with Electron's powerMonitor replaced by an emitter.
// A stall is written when the app stood still while it could be seen; never for an interface the
// person could not see (a covered window, a dark screen) or for the time the computer was asleep;
// and one a wake explains is kept with `afterResume: true` rather than dropped. Also the heartbeat's
// visibility as preload.ts sends it, and main.ts passing it on.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const recorderSource = read('electron/healthRecorder.ts');
const recorderJs = compile(recorderSource);
const constant = (name) => Number(new RegExp(`const ${name} = ([\\d_]+);`).exec(recorderSource)[1].replace(/_/g, ''));
const GRACE = constant('RESUME_GRACE_MS');
const UI_GAP = constant('UI_STALL_GAP_MS');
const MAIN_GAP = constant('MAIN_STALL_GAP_MS');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-health-check-'));

let checks = 0;
const expect = (value, message) => { checks += 1; assert.ok(value, message); };

// A fake clock and timers. `advance` is a working computer: every timer runs on time.
// `jump` is the app stopped (frozen or asleep): nothing runs; `runLate` then runs each late timer
// once, an interval starting again from then, as Node does after a long stop.
function makeWorld() {
  let clock = Date.UTC(2026, 9, 16, 9, 0, 0);
  let nextId = 1;
  const timers = new Map();
  const add = (fn, ms, repeat) => { const id = nextId++; timers.set(id, { fn, ms, repeat, due: clock + ms }); return id; };
  const runOne = (until) => {
    let pick = null;
    for (const entry of timers) if (entry[1].due <= until && (!pick || entry[1].due < pick[1].due)) pick = entry;
    if (!pick) return false;
    const [id, timer] = pick;
    clock = Math.max(clock, timer.due);
    if (timer.repeat) timer.due = clock + timer.ms; else timers.delete(id);
    timer.fn();
    return true;
  };
  const runDue = (until) => { while (runOne(until)); };
  return {
    now: () => clock,
    setTimeout: (fn, ms) => add(fn, ms, false),
    setInterval: (fn, ms) => add(fn, ms, true),
    clear: (id) => { timers.delete(id); },
    advance: (ms) => { const until = clock + ms; runDue(until); clock = until; },
    jump: (ms) => { clock += ms; },
    runLate: () => runDue(clock),
    /** Only the most overdue timer (the 100 ms delay probe, after a stop). */
    runFirstLate: () => runOne(clock),
    standStill(ms) { this.jump(ms); this.runLate(); },
  };
}

/** A recorder on its own fake clock, writing to its own folder. */
function open({ uiVisible = true } = {}) {
  const world = makeWorld();
  const dir = fs.mkdtempSync(path.join(tmp, 'profile-'));
  const power = new EventEmitter();
  const electron = {
    app: { getPath: () => dir, getVersion: () => '0.0.0-check', getAppMetrics: () => [] },
    powerMonitor: power,
  };
  class FakeDate extends Date { static now() { return world.now(); } }
  const mod = { exports: {} };
  vm.runInNewContext(recorderJs, {
    module: mod, exports: mod.exports, Buffer, Date: FakeDate,
    setInterval: world.setInterval, clearInterval: world.clear, setTimeout: world.setTimeout, clearTimeout: world.clear,
    process: {
      versions: { electron: 'check' },
      getSystemMemoryInfo: () => ({ total: 8e6, free: 1e6, swapTotal: 12e6, swapFree: 3e6 }),
    },
    require: (name) => (name === 'electron' ? electron : require(name)),
  });
  const roles = { uiPid: 1, pagePid: 2, uiVisible };
  const recorder = new mod.exports.HealthRecorder(() => roles, () => ({ open: false }));
  recorder.start();
  const file = path.join(dir, 'logs', 'health', 'health.jsonl');
  const lines = () => fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const events = (name) => lines().filter((line) => line.ev === name);
  const stalls = () => lines().filter((line) => line.ev === 'main-stall' || line.ev === 'ui-stall');
  /** The interface beating every 2 s for `seconds`, the main process running alongside. */
  const beat = (seconds, visible = true) => {
    for (let i = 0; i < seconds / 2; i += 1) { world.advance(2000); recorder.uiBeat(0, visible); }
  };
  return { world, recorder, power, roles, lines, events, stalls, beat };
}

// 1. A visible interface that stands still: `ui-stall`, as before, stamped when it was seen.
{
  const t = open();
  t.beat(10);
  t.world.advance(30000);   // the interface stops; the main process goes on sampling
  const seenAt = t.world.now();
  t.recorder.uiBeat(0, true);
  t.world.advance(GRACE + 100);
  const stalls = t.events('ui-stall');
  expect(stalls.length === 1 && stalls[0].gapMs === 30000, `a 30 s gap between visible beats is a ui-stall: ${JSON.stringify(stalls)}`);
  expect(stalls[0].afterResume === undefined, 'with no wake, the stall is not marked');
  expect(Date.parse(stalls[0].at) === seenAt, 'the stall carries the time it was seen, not when it was written');
  expect(t.events('main-stall').length === 0, 'the main process went on: no main-stall');
  expect(Object.keys(stalls[0]).every((key) => ['at', 'ev', 'gapMs'].includes(key)), 'the stall line holds only time and gap');
  // Just over the limit counts; just under does not.
  t.world.advance(UI_GAP + 1); t.recorder.uiBeat(0, true);
  t.beat(4);
  t.world.advance(UI_GAP - 1); t.recorder.uiBeat(0, true);
  t.world.advance(GRACE + 100);
  expect(t.events('ui-stall').length === 2, 'the 6 s limit is unchanged');
}

// 2. A hidden interface (a covered window, a dark or locked screen): Chromium beats once a minute.
{
  const t = open();
  t.beat(10);
  for (let i = 0; i < 10; i += 1) { t.world.advance(60000); t.recorder.uiBeat(0, false); }
  t.world.advance(60000); t.recorder.uiBeat(0, true);   // visible again, the last beat was hidden
  t.beat(10);
  t.world.advance(60000); t.recorder.uiBeat(0, false);  // hidden at the beat after a minute's gap
  t.world.advance(GRACE + 100);
  expect(t.events('ui-stall').length === 0, `hidden at either beat: no ui-stall (${JSON.stringify(t.stalls())})`);
  for (const value of [undefined, null, 'visible', 1, {}]) {
    t.beat(4);
    t.world.advance(30000); t.recorder.uiBeat(0, value);
  }
  t.world.advance(GRACE + 100);
  expect(t.events('ui-stall').length === 0, 'anything but `true` is not a visible beat');
  expect(t.stalls().length === 0, 'the main process went on: nothing at all');
}

// 3. The window hidden to the tray (main's own view): no ui-stall, as before.
{
  const t = open({ uiVisible: false });
  t.beat(10);
  t.world.advance(30000); t.recorder.uiBeat(0, true);
  t.world.advance(GRACE + 100);
  expect(t.events('ui-stall').length === 0, 'main sees the window hidden: no ui-stall');
}

// 4. A real main-process freeze, no wake: `main-stall` with its gap, and the delay in the sample.
{
  const t = open();
  t.beat(10);
  t.world.standStill(20000);
  const line = t.lines().filter((l) => l.up !== undefined).pop();
  expect(line.mainLagMs >= 19000, `the sample after the freeze shows the main-process delay (${line.mainLagMs})`);
  t.world.advance(GRACE - 1000);
  expect(t.events('main-stall').length === 0, 'a stall waits a moment for a resume that may be on its way');
  t.world.advance(1100);
  const stalls = t.events('main-stall');
  expect(stalls.length === 1 && stalls[0].gapMs === 20000 && stalls[0].afterResume === undefined,
    `then it is written as it is: ${JSON.stringify(stalls)}`);
  expect(stalls[0].gapMs > MAIN_GAP, 'above the 12 s limit');
  // A beat the frozen main process held back still shows the interface's gap, as before.
  t.recorder.uiBeat(0, true);
  t.world.advance(GRACE + 100);
  expect(t.events('ui-stall').length === 1, 'the interface\'s own gap is still recorded when it was visible throughout');
}

// 5. Modern Standby, the `resume` before the late timers: nothing is a stall.
{
  const t = open();
  t.beat(11);
  const before = t.world.now();
  const lastSampleAt = Date.parse(t.lines().filter((l) => l.up !== undefined).pop().at);
  t.world.jump(2569000);   // the first main-stall of 10-16 Oct, a standby to the second
  t.power.emit('resume');
  t.world.runLate();
  t.beat(20);
  t.world.advance(GRACE + 100);
  expect(t.stalls().length === 0, `asleep 43 min, resume first: no stall (${JSON.stringify(t.stalls())})`);
  const [resume] = t.events('resume');
  expect(resume && resume.sinceSampleMs === 2569000 + before - lastSampleAt,
    `the resume line says how long the app was quiet: ${JSON.stringify(resume)}`);
  expect(resume.sleptMs === undefined, 'no suspend came, so no time asleep is claimed');
  const samples = t.lines().filter((l) => l.up !== undefined && Date.parse(l.at) > before);
  expect(samples.length > 0 && samples.every((l) => l.mainLagMs < 1000), 'the samples after the wake show no main-process delay');
}

// 5b. The same, with the delay probe's late run before the `resume` and the sample after it: the
//     time asleep is not reported as main-process delay either.
{
  const t = open();
  t.beat(10);
  const before = t.world.now();
  t.world.jump(2569000);
  expect(t.world.runFirstLate(), 'the probe runs first');
  t.power.emit('resume');
  t.world.runLate();
  t.beat(10);
  t.world.advance(GRACE + 100);
  expect(t.stalls().length === 0, 'probe, resume, sample: no stall');
  const samples = t.lines().filter((l) => l.up !== undefined && Date.parse(l.at) > before);
  expect(samples.length > 0 && samples.every((l) => l.mainLagMs < 1000),
    `probe, resume, sample: no delay in the samples (${samples.map((l) => l.mainLagMs).join(', ')})`);
}

// 6. Modern Standby, the late timers before the `resume` (the two race on waking): the stalls are
//    kept, marked `afterResume`, and the resume follows them.
{
  const t = open();
  t.beat(10);
  t.world.jump(161543000);
  t.world.runLate();          // the sample sees the gap first
  t.recorder.uiBeat(0, true); // and the interface's first beat
  t.world.advance(1500);
  t.power.emit('resume');
  t.beat(20);
  t.world.advance(GRACE + 100);
  const stalls = t.stalls();
  expect(stalls.length === 2 && stalls.every((s) => s.afterResume === true),
    `stalls seen before the resume are marked, not dropped: ${JSON.stringify(stalls)}`);
  expect(t.events('main-stall')[0].gapMs === 161543000, 'the main-stall keeps its full gap');
  const order = t.lines().map((l) => l.ev).filter(Boolean);
  expect(order.indexOf('resume') > order.indexOf('main-stall') && order.indexOf('resume') > order.indexOf('ui-stall'),
    'the marked stalls come before the resume line');
}

// 7. A classic sleep: suspend, then resume: both recorded, the time asleep given, no stall.
{
  const t = open();
  t.beat(10);
  t.power.emit('suspend');
  t.world.jump(6955000);
  t.power.emit('resume');
  t.world.runLate();
  t.beat(10);
  t.world.advance(GRACE + 100);
  expect(t.events('suspend').length === 1, 'suspend recorded');
  const [resume] = t.events('resume');
  expect(resume && resume.sleptMs === 6955000, `resume gives the time since suspend: ${JSON.stringify(resume)}`);
  expect(t.stalls().length === 0, 'suspend and resume: no stall');
  t.power.emit('lock-screen');
  t.world.advance(3000);
  t.power.emit('unlock-screen');
  expect(t.events('lock-screen').length === 1 && t.events('unlock-screen').length === 1, 'the screen locked and unlocked are recorded');
}

// 8. A real freeze just after waking is measured from the wake and marked at once; one an hour
//    later is an ordinary stall.
{
  const t = open();
  t.beat(10);
  t.world.jump(600000);
  t.power.emit('resume');
  t.world.standStill(20000);   // swapping back in after standby
  const marked = t.events('main-stall');
  expect(marked.length === 1 && marked[0].afterResume === true && marked[0].gapMs === 20000,
    `measured from the resume, written at once and marked: ${JSON.stringify(marked)}`);
  t.beat(3600);
  t.world.standStill(15000);
  t.world.advance(GRACE + 100);
  const later = t.events('main-stall');
  expect(later.length === 2 && later[1].afterResume === undefined && later[1].gapMs === 15000,
    `an hour later the wake explains nothing: ${JSON.stringify(later[1])}`);
}

// 9. Stopping writes a stall still waiting for a resume, and stops listening for power events.
{
  const t = open();
  t.beat(10);
  t.world.standStill(20000);
  expect(t.power.listenerCount('resume') === 1, 'listening for wakes while running');
  t.recorder.stop();
  const stalls = t.events('main-stall');
  expect(stalls.length === 1 && stalls[0].afterResume === undefined, 'a waiting stall is written on stop');
  expect(['suspend', 'resume', 'lock-screen', 'unlock-screen'].every((name) => t.power.listenerCount(name) === 0),
    'no power listeners left after stop');
}

// 10. The heartbeat's visibility, as preload.ts sends it: hidden at any moment since the last beat
//     is not visible, and the interface's call is still `beat(frameLagMs)`.
{
  const listeners = [];
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, fn) => { if (name === 'visibilitychange') listeners.push(fn); },
  };
  const setVisibility = (state) => { document.visibilityState = state; listeners.forEach((fn) => fn()); };
  const sent = [];
  let exposed = null;
  const electron = {
    contextBridge: { exposeInMainWorld: (name, api) => { exposed = api; } },
    ipcRenderer: { send: (...args) => sent.push(args), invoke: () => Promise.resolve(), on() {}, removeListener() {} },
  };
  const mod = { exports: {} };
  vm.runInNewContext(compile(read('electron/preload.ts')), {
    module: mod, exports: mod.exports, document, process: { env: {}, platform: 'win32' },
    require: (name) => (name === 'electron' ? electron : require(name)),
  });
  const beat = exposed.health.beat;
  expect(beat.length === 1, 'the interface still calls beat(frameLagMs)');
  beat(12);
  expect(JSON.stringify(sent.pop()) === JSON.stringify(['health:beat', 12, true]), 'visible throughout: sent as visible');
  setVisibility('hidden');
  beat(0);
  expect(sent.pop()[2] === false, 'hidden at the beat: not visible');
  setVisibility('visible');
  beat(0);
  expect(sent.pop()[2] === false, 'hidden since the last beat, visible again now: still not visible');
  beat(0);
  expect(sent.pop()[2] === true, 'visible for a whole beat again: visible');
  setVisibility('hidden'); setVisibility('visible');
  beat(Number.NaN);
  const last = sent.pop();
  expect(last[1] === 0 && last[2] === false, 'a brief hide between beats counts; a bad frame delay is sent as 0');
}

// 11. main.ts passes the visibility on, from the interface window only.
{
  const main = read('electron/main.ts');
  const handler = /ipcMain\.on\('health:beat',[^\n]*\n[^\n]*\n\}\);/.exec(main);
  expect(handler && handler[0].includes('(event, frameLagMs: unknown, visible: unknown)'), 'the beat handler takes the visibility');
  expect(handler && /event\.sender === mainWindow\.webContents\) health\.uiBeat\(frameLagMs, visible\)/.test(handler[0]),
    'and passes it to the recorder, for the interface window only');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`health stall checks passed (${checks} checks)`);
