// The embedded web page is a native layer over the whole window: React never
// removes it. These checks run the production useGazeBrowser hook against a
// scripted main process and assert that the interface never believes a page is
// open when it was closed, never loses a page it did open, and closes the page
// whenever the screen that owns it goes away.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = ts.transpileModule(fs.readFileSync(path.join(root, 'src/hooks/useGazeBrowser.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function mount() {
  const state = [], effects = [], cleanups = [], listeners = new Map(), calls = [];
  let pendingOpen = null;
  let slot = 0;
  const react = {
    useState(initial) {
      const i = slot++;
      state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], (value) => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
    },
    useRef: (initial) => ({ current: initial }),
    useCallback: (fn) => fn,
    useEffect: (fn) => effects.push(fn),
  };
  const webview = {
    open(url) { calls.push(['open', url]); return new Promise((resolve) => { pendingOpen = resolve; }); },
    close() { calls.push(['close']); return Promise.resolve({ success: true }); },
    resetBrowserSession(reason) { calls.push(['reset', reason]); return Promise.resolve({ success: true }); },
  };
  const window = { electronAPI: { webview, on: (ch, cb) => listeners.set(ch, cb), off: (ch) => listeners.delete(ch) } };
  const exports = {};
  vm.runInNewContext(source, {
    exports, window, console, Promise,
    require: (name) => { if (name === 'react') return react; throw new Error(name); },
  });
  const hook = exports.useGazeBrowser();
  const isOpenSlot = 0;   // First useState in the hook.
  effects.forEach((fn) => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); });
  return {
    hook, calls,
    get isOpen() { return state[isOpenSlot]; },
    emit(channel, payload) { listeners.get(channel)?.(payload); },
    resolveOpen(result) { const resolve = pendingOpen; pendingOpen = null; resolve(result); },
    unmount() { cleanups.forEach((fn) => fn()); },
  };
}

const bounds = { x: 20, y: 150, width: 1600, height: 850 };
const flush = () => new Promise((resolve) => setImmediate(resolve));
let tests = 0;
async function test(name, fn) { await fn(); tests++; console.log(`PASS ${name}`); }

(async () => {
  await test('an open that completes is shown as open', async () => {
    const m = mount();
    const done = m.hook.openPage('https://www.youtube.com/', bounds);
    m.resolveOpen({ success: true });
    assert.equal(await done, true);
    assert.equal(m.isOpen, true);
  });
  await test('replacing one page with another keeps the new one open', async () => {
    // Main closes the old page ('replace') while opening the new one.
    const m = mount();
    const done = m.hook.openPage('https://www.youtube.com/watch?v=b', bounds);
    m.emit('webview:closed', { reason: 'replace' });
    m.resolveOpen({ success: true });
    assert.equal(await done, true);
    assert.equal(m.isOpen, true);
  });
  await test('a page closed while it was opening never comes back as open', async () => {
    for (const close of [
      (m) => m.hook.closePage(),
      (m) => m.hook.resetBrowserSession('youtube-stop'),
      (m) => m.emit('webview:closed', { reason: 'interface-reload' }),
    ]) {
      const m = mount();
      const done = m.hook.openPage('https://www.youtube.com/', bounds);
      await close(m);
      m.resolveOpen({ success: true });   // Main finished the open before it saw the close.
      assert.equal(await done, false);
      assert.equal(m.isOpen, false);
      // No second close: main handles requests in order, and an extra close
      // could reach the NEXT page.
      assert.ok(m.calls.filter(([kind]) => kind === 'close').length <= 1);
    }
  });
  await test('the page closes when the screen that owns it goes away', async () => {
    const m = mount();
    const done = m.hook.openPage('https://www.youtube.com/', bounds);
    m.resolveOpen({ success: true });
    await done;
    m.unmount();
    await flush();
    assert.deepEqual(m.calls.at(-1), ['close']);
  });
  console.log(`${tests} embedded page lifecycle checks passed (scripted main process; the native teardown itself is tested in Electron).`);
})().catch((error) => { console.error(error); process.exit(1); });
