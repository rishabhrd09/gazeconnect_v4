// Checks the keep-awake rules (electron/keepAwake.ts, 28 Oct 2026) against the real module,
// compiled on the fly, with Electron's powerSaveBlocker replaced by a fake that records every call
// and the module's timer driven by hand: the screen is held on while the window is shown and not
// minimised, let go when it is hidden to the tray, minimised or closed and on quit, never held
// twice, and a refused request costs the hold, never the app. A full-screen window restored from
// minimised (no 'restore' event on Windows) is held again, and a change no event reported is put
// right at the next check. Also main.ts: it follows the main window, lets go on quit, and only a
// development run can switch it off.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
// A Windows checkout has CRLF line endings (core.autocrlf); the patterns below are written with \n.
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const keepAwakeSource = read('electron/keepAwake.ts');
const keepAwakeJs = ts.transpileModule(keepAwakeSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const CHECK_MS = Number(/export const KEEP_AWAKE_CHECK_MS = (\d+);/.exec(keepAwakeSource)[1]);

let checks = 0;
const expect = (value, message) => { checks += 1; assert.ok(value, message); };

/** Electron's powerSaveBlocker, as far as keepAwake.ts uses it, recording every call. */
function fakeBlocker({ refuse = false } = {}) {
  const calls = [];
  const started = new Set();
  let nextId = 0;
  return {
    calls,
    started,
    refuse,
    start(type) {
      calls.push(['start', type]);
      if (this.refuse) throw new Error('refused');
      const id = nextId++;
      started.add(id);
      return id;
    },
    stop(id) { calls.push(['stop', id]); started.delete(id); return true; },
    isStarted(id) { return started.has(id); },
  };
}

/**
 * A BrowserWindow, as far as keepAwake.ts uses it, sending the events Electron 44 sends on
 * Windows (probed 28 Oct 2026). Like Electron's, a destroyed one throws when asked anything.
 */
class FakeWindow extends EventEmitter {
  constructor() { super(); this.visible = false; this.minimized = false; this.destroyed = false; this.fullScreen = false; }
  alive() { if (this.destroyed) throw new Error('Object has been destroyed'); }
  isDestroyed() { return this.destroyed; }
  isVisible() { this.alive(); return this.visible; }
  isMinimized() { this.alive(); return this.minimized; }
  show() { this.visible = true; this.minimized = false; this.emit('show'); this.emit('focus'); }
  hide() { this.visible = false; this.emit('hide'); }
  minimize() { this.visible = false; this.minimized = true; this.emit('minimize'); this.emit('blur'); }
  /** Restored from minimised: 'restore' when windowed; in full screen only these, and no 'restore'. */
  restore() {
    this.visible = true; this.minimized = false;
    if (this.fullScreen) { this.emit('resize'); this.emit('enter-full-screen'); this.emit('focus'); } else { this.emit('restore'); this.emit('focus'); }
  }
  close() { this.visible = false; this.destroyed = true; this.emit('closed'); }
}

/** The module on its own fake Electron and timers, and a window it watches. */
function open({ refuse = false, enabled = true, shown = false } = {}) {
  const blocker = fakeBlocker({ refuse });
  const timers = new Map();
  let nextTimer = 1;
  const mod = { exports: {} };
  vm.runInNewContext(keepAwakeJs, {
    module: mod, exports: mod.exports,
    setInterval: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearInterval: (id) => { timers.delete(id); },
    require: (name) => (name === 'electron' ? { powerSaveBlocker: blocker } : require(name)),
  });
  const log = [];
  const keep = new mod.exports.KeepAwake((held, data) => log.push({ held, ...data }), enabled);
  const win = new FakeWindow();
  if (shown) win.visible = true;
  keep.watch(win);
  /** One check period passes. */
  const tick = () => { for (const timer of [...timers.values()]) timer.fn(); };
  const starts = () => blocker.calls.filter((call) => call[0] === 'start');
  const stops = () => blocker.calls.filter((call) => call[0] === 'stop');
  return { blocker, keep, log, win, timers, tick, starts, stops };
}

// 1. Not held before the window is on screen; held once it shows, with the display request.
{
  const t = open();
  expect(!t.keep.held && t.blocker.calls.length === 0 && t.log.length === 0, 'a hidden window holds nothing');
  t.win.show();
  expect(t.keep.held, 'shown: the screen is held on');
  expect(t.starts().length === 1 && t.starts()[0][1] === 'prevent-display-sleep',
    `one display request, not prevent-app-suspension (which lets the screen go dark): ${JSON.stringify(t.blocker.calls)}`);
  expect(JSON.stringify(t.log) === JSON.stringify([{ held: true, why: 'show' }]), `logged once: ${JSON.stringify(t.log)}`);
  t.win.emit('show');
  t.win.restore();
  t.tick();
  expect(t.starts().length === 1 && t.log.length === 1, 'shown again, restored or checked while held: never a second request');
}

// 2. A window already on screen when watching starts is held at once.
{
  const t = open({ shown: true });
  expect(t.keep.held && t.starts().length === 1 && t.log[0].why === 'watch', 'held from the start');
}

// 3. Hidden to the tray: let go; shown from the tray: held again.
{
  const t = open();
  t.win.show();
  const id = [...t.blocker.started][0];
  t.win.hide();
  expect(!t.keep.held && t.stops().length === 1 && t.stops()[0][1] === id, 'hidden: the request it made is stopped');
  expect(t.log.at(-1).held === false && t.log.at(-1).why === 'hide', 'and logged');
  t.win.hide();
  t.tick();
  expect(t.stops().length === 1 && t.log.length === 2, 'hidden again or checked while hidden: nothing more');
  t.win.show();
  expect(t.keep.held && t.starts().length === 2 && t.blocker.started.size === 1, 'shown again: held again, one request at a time');
}

// 4. Minimised: let go; restored: held again. Restored after being hidden to the tray is on
//    screen again (Electron shows it), so it is held too.
{
  const t = open();
  t.win.show();
  t.win.minimize();
  expect(!t.keep.held && t.log.at(-1).why === 'minimize', 'minimised: let go');
  t.win.restore();
  expect(t.keep.held && t.log.at(-1).why === 'restore', 'restored: held again');
  t.win.hide();
  t.win.minimize();
  expect(!t.keep.held, 'hidden, then minimised: let go');
  t.win.restore();
  expect(t.keep.held, 'restored from there: on screen, held');
}

// 5. Full screen (GazeConnect's normal state): restored from minimised with no 'restore' event,
//    it is held again at once, by 'enter-full-screen' or 'focus'.
{
  const t = open();
  t.win.show();
  t.win.fullScreen = true;
  t.win.emit('enter-full-screen');
  t.win.minimize();
  expect(!t.keep.held, 'full screen, minimised: let go');
  t.win.restore();
  expect(t.keep.held && t.log.at(-1).held === true && t.log.at(-1).why === 'enter-full-screen',
    `full screen, restored: held again without waiting for a check: ${JSON.stringify(t.log.at(-1))}`);
  expect(t.starts().length === 2 && t.blocker.started.size === 1, 'one request at a time');
}

// 6. A change no event reported is put right at the next check, both ways.
{
  const t = open();
  expect(t.timers.size === 1 && [...t.timers.values()][0].ms === CHECK_MS && CHECK_MS > 0 && CHECK_MS <= 10000,
    `one check every ${CHECK_MS} ms (seconds, against a screen timeout of minutes)`);
  t.win.visible = true;   // on screen, nothing sent
  expect(!t.keep.held, 'before the check: not yet held');
  t.tick();
  expect(t.keep.held && t.log.at(-1).why === 'check', 'at the check: held');
  t.win.visible = false;  // off screen, nothing sent
  t.tick();
  expect(!t.keep.held && t.log.at(-1).why === 'check', 'at the next check: let go');
}

// 7. Closed: let go and no more checks, without asking the destroyed window anything (Electron
//    would throw).
{
  const t = open();
  t.win.show();
  let thrown = null;
  try { t.win.close(); t.tick(); t.win.emit('hide'); t.win.emit('focus'); } catch (err) { thrown = err; }
  expect(thrown === null, `closed: the destroyed window is never asked anything, even by a late event: ${thrown}`);
  expect(!t.keep.held && t.blocker.started.size === 0 && t.log.at(-1).why === 'closed', 'closed: let go');
  expect(t.timers.size === 0, 'closed: the checks end');
}

// 8. Quit: let go for good; nothing a window does afterwards holds the screen again.
{
  const t = open();
  t.win.show();
  t.keep.stop('quit');
  expect(!t.keep.held && t.log.at(-1).held === false && t.log.at(-1).why === 'quit', 'quit: let go and logged');
  expect(t.timers.size === 0, 'quit: the checks end');
  t.win.hide();
  t.win.show();
  t.win.restore();
  expect(t.starts().length === 1 && t.blocker.started.size === 0, 'after quit: never held again');
  t.keep.stop('quit');
  expect(t.stops().length === 1, 'a second stop does nothing');
}

// 9. A refused request costs the hold, never the app; every change asks again, the refusal is
//    logged once, and the first request that succeeds holds it.
{
  const t = open({ refuse: true });
  let thrown = null;
  try { t.win.show(); t.tick(); t.tick(); } catch (err) { thrown = err; }
  expect(thrown === null, `a refused request never throws into the window's events or checks: ${thrown}`);
  expect(!t.keep.held, 'refused: not held');
  expect(t.starts().length >= 3, 'asked again at every check');
  expect(JSON.stringify(t.log) === JSON.stringify([{ held: false, why: 'show', error: 'Error: refused' }]),
    `the refusal is logged once, not at every check: ${JSON.stringify(t.log)}`);
  t.win.hide();
  expect(t.stops().length === 0, 'nothing to stop');
  t.blocker.refuse = false;
  t.win.show();
  expect(t.keep.held && t.log.at(-1).held === true, 'accepted again: held');
  t.win.hide();
  t.blocker.refuse = true;
  t.win.show();
  expect(t.log.at(-1).error === 'Error: refused', 'a new refusal after a success is logged again');
}

// 10. Switched off (a development run with GAZECONNECT_KEEP_SCREEN_ON=0): never held.
{
  const t = open({ enabled: false });
  t.win.show();
  t.win.restore();
  t.tick();
  expect(t.blocker.calls.length === 0 && t.log.length === 0 && !t.keep.held, 'switched off: no request at all');
}

// 11. A request ended elsewhere reads as not held, and the next check holds again.
{
  const t = open();
  t.win.show();
  t.blocker.stop([...t.blocker.started][0]);
  expect(!t.keep.held, 'ended elsewhere: not held');
  t.tick();
  expect(t.keep.held && t.starts().length === 2, 'held again at the next check');
}

// 12. main.ts: follows the main window, lets go on quit before the health log closes, logs every
//     change, and only a development run can switch it off. No other code asks to keep it awake.
{
  const main = read('electron/main.ts');
  expect(/new KeepAwake\(\s*\(held, data\) => health\.event\('keep-awake', \{ held, \.\.\.data \}\),\s*app\.isPackaged \|\| process\.env\.GAZECONNECT_KEEP_SCREEN_ON !== '0',\s*\);/.test(main),
    'one KeepAwake, logged to the health log; the installed app ignores GAZECONNECT_KEEP_SCREEN_ON');
  const createWindow = /\nfunction createWindow\(\): void \{[\s\S]*?\n\}\n/.exec(main);
  expect(createWindow && /\n  keepAwake\.watch\(mainWindow\);\n\}\n$/.test(createWindow[0]),
    'createWindow watches the window it made, after its own handlers');
  const beforeQuit = /app\.on\('before-quit', \(\) => \{[\s\S]*?\n\}\);/.exec(main);
  expect(beforeQuit && /keepAwake\.stop\('quit'\);[\s\S]*health\.stop\(\);/.test(beforeQuit[0]),
    'before-quit lets go, before the health log stops');
  const users = fs.readdirSync(path.join(root, 'electron'), { recursive: true })
    .filter((file) => /\.ts$/.test(file) && !/\.d\.ts$/.test(file))
    .filter((file) => /powerSaveBlocker/.test(read(path.join('electron', file))));
  expect(users.length === 1 && path.normalize(users[0]) === 'keepAwake.ts', `only keepAwake.ts uses powerSaveBlocker: ${users}`);
}

console.log(`keep-awake checks passed (${checks} checks)`);
