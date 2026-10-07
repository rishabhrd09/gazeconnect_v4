// Checks the embedded browser's safety rules (electron/browser/browserSafety.ts, 6 Oct 2026)
// against the real module, compiled on the fly, with Electron's session replaced by a recorder.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'electron/browser/browserSafety.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

let totalMem = 8 * 1024 ** 3;
let metrics = [];
const electronStub = { app: { getAppMetrics: () => metrics } };
const osStub = { totalmem: () => totalMem };
const mod = { exports: {} };
vm.runInNewContext(compiled, {
  module: mod, exports: mod.exports, URL, Promise, Math, Number, String, Date, Set, setTimeout, clearTimeout,
  require: (name) => (name === 'electron' ? electronStub : name === 'os' ? osStub : require(name)),
});
const safety = mod.exports;

let checks = 0;
const expect = (value, message) => { checks += 1; assert.ok(value, message); };

// 1. Which pages the browser may show.
for (const url of [
  'https://www.youtube.com/watch?v=abc', 'https://www.google.com/search?q=lata', 'http://example.com/',
  'https://m.youtube.com/', 'https://consent.youtube.com/m?continue=x',
]) expect(safety.isAllowedPageUrl(url), `public page allowed: ${url}`);
for (const url of [
  'file:///C:/Windows/System32/drivers/etc/hosts', 'javascript:alert(1)', 'data:text/html,<b>x</b>',
  'chrome://settings', 'devtools://devtools', 'ms-settings:privacy', 'ms-msdt:/id', 'search-ms:query=x',
  'mailto:a@b.c', 'about:blank', 'http://localhost:8765/', 'http://127.0.0.1:5050/api', 'http://[::1]/',
  'http://192.168.1.1/', 'http://10.0.0.5/', 'http://172.20.1.1/', 'http://169.254.169.254/latest',
  'http://router/', 'http://printer.local/', 'https://user:pass@example.com/', 'http://0.0.0.0:8080/',
  'https://evil.localhost/', 'http://[fd00::1]/', 'http://[fe80::1]/', '', null, 42, 'x'.repeat(5000),
]) expect(!safety.isAllowedPageUrl(url), `refused: ${String(url).slice(0, 60)}`);

// 2. Requests a page may make: never to this computer or the local network.
expect(safety.isAllowedRequestUrl('https://i.ytimg.com/vi/x/mq.jpg'), 'thumbnails load');
expect(safety.isAllowedRequestUrl('wss://example.com/socket'), 'public websockets allowed');
expect(safety.isAllowedRequestUrl('blob:https://www.youtube.com/abc'), 'blob media allowed');
expect(!safety.isAllowedRequestUrl('ws://127.0.0.1:8765/'), 'the GazeConnect backend socket is unreachable from pages');
expect(!safety.isAllowedRequestUrl('http://localhost:5050/api/floorplan'), 'the floor plan server is unreachable from pages');
expect(!safety.isAllowedRequestUrl('http://192.168.0.1/admin'), 'the router is unreachable from pages');

// 3. The session rules, on a recording stand-in for Electron's Session.
const events = {};
const reports = [];
let requestHandler = null;
let permissionHandler = null;
let checkHandler = null;
let deviceHandler = null;
let spellcheck = true;
const ses = {
  setPermissionRequestHandler: (fn) => { permissionHandler = fn; },
  setPermissionCheckHandler: (fn) => { checkHandler = fn; },
  setDevicePermissionHandler: (fn) => { deviceHandler = fn; },
  on: (name, fn) => { events[name] = fn; },
  webRequest: { onBeforeRequest: (fn) => { requestHandler = fn; } },
  setSpellCheckerEnabled: (on) => { spellcheck = on; },
};
safety.hardenBrowserSession(ses, (kind, detail) => reports.push([kind, detail]));
const permission = (name, details = {}) => {
  let answer = null;
  permissionHandler({}, name, (allowed) => { answer = allowed; }, details);
  return answer;
};
for (const name of ['media', 'geolocation', 'notifications', 'midi', 'midiSysex', 'pointerLock', 'fullscreen',
  'openExternal', 'clipboard-read', 'display-capture', 'idle-detection', 'window-management', 'hid', 'serial', 'usb',
  'storage-access', 'local-network-access', 'unknown-future-permission']) {
  expect(permission(name) === false, `permission refused: ${name}`);
}
expect(permission('openExternal', { externalURL: 'ms-msdt:/id PCWDiagnostic' }) === false,
  'a page cannot launch another Windows program');
expect(reports.some(([kind, detail]) => kind === 'permission' && detail.includes('ms-msdt')), 'the refused launch is reported');
expect(permission('clipboard-sanitized-write') === true, 'copying text stays possible');
expect(checkHandler({}, 'geolocation') === false && checkHandler({}, 'clipboard-sanitized-write') === true,
  'permission checks agree with requests');
expect(deviceHandler({}) === false, 'no device access');
expect(spellcheck === false, 'no spell checking in pages');
let hid = 'unset';
events['select-hid-device']({ preventDefault() {} }, {}, (id) => { hid = id; });
expect(hid === null, 'HID chooser cancelled');
let usb = 'unset';
events['select-usb-device']({ preventDefault() {} }, {}, (id) => { usb = id; });
expect(usb === undefined, 'USB chooser cancelled');
let serial = 'unset';
events['select-serial-port']({ preventDefault() {} }, [], {}, (id) => { serial = id; });
expect(serial === '', 'serial chooser cancelled');
let prevented = false;
let cancelled = false;
events['will-download']({ preventDefault() { prevented = true; } },
  { cancel() { cancelled = true; }, getFilename: () => 'setup.exe', getURL: () => 'https://x/setup.exe' });
expect(prevented && cancelled, 'downloads are cancelled');
expect(reports.some(([kind, detail]) => kind === 'download' && detail === 'setup.exe'), 'the refused download is reported');
const request = (url) => { let answer = null; requestHandler({ url }, (r) => { answer = r; }); return answer; };
expect(request('https://www.youtube.com/watch?v=x').cancel === false, 'YouTube requests pass');
expect(request('http://127.0.0.1:8765/').cancel === true, 'requests to this computer are cancelled');
const firstHandlers = { permissionHandler, requestHandler };
safety.hardenBrowserSession(ses, () => {});
expect(permissionHandler === firstHandlers.permissionHandler && requestHandler === firstHandlers.requestHandler,
  'applying the rules twice changes nothing');

// 4. History: oldest entries are dropped past the limit; the current one is never removed.
const history = (length, active) => {
  const entries = Array.from({ length }, (_, i) => i);
  let current = active;
  return {
    entries,
    contents: { navigationHistory: {
      length: () => entries.length,
      getActiveIndex: () => current,
      removeEntryAtIndex: (i) => {
        if (i === current || i < 0 || i >= entries.length) return false;
        entries.splice(i, 1);
        if (i < current) current -= 1;
        return true;
      },
    } },
    active: () => current,
  };
};
let h = history(45, 44);
expect(safety.pruneNavigationHistory(h.contents) === 15 && h.entries.length === safety.MAX_HISTORY_ENTRIES,
  `history pruned to ${safety.MAX_HISTORY_ENTRIES}`);
expect(h.entries[0] === 15 && h.entries[h.entries.length - 1] === 44 && h.active() === h.entries.length - 1,
  'the oldest entries go and the current page stays current');
h = history(40, 0);
safety.pruneNavigationHistory(h.contents, 10);
expect(h.entries.length === 10 && h.entries[h.active()] === 0, 'a current first entry is kept');
h = history(5, 4);
expect(safety.pruneNavigationHistory(h.contents) === 0, 'a short history is untouched');

// 5. Memory: the page's renderer, and a budget scaled to the computer.
metrics = [{ pid: 4242, memory: { privateBytes: 512000, workingSetSize: 700000 } }];
expect(safety.rendererMemoryMb({ getOSProcessId: () => 4242 }) === 500, 'private memory in MB');
metrics = [];
expect(safety.rendererMemoryMb({ getOSProcessId: () => 4242 }) === null, 'unknown process gives no reading');
const small = safety.browserMemoryBudgetMb(4 * 1024 ** 3);
const large = safety.browserMemoryBudgetMb(32 * 1024 ** 3);
expect(small.soft === 750 && small.hard === 1100, `4 GB laptop budget ${JSON.stringify(small)}`);
expect(large.soft === 1400 && large.hard === 2400, `32 GB budget ${JSON.stringify(large)}`);
expect(small.soft > 506, 'a normal YouTube page (up to 506 MB measured) is not refreshed even on 4 GB');

// 6. Automatic recovery stops after three attempts in ten minutes.
const budget = new safety.RecoveryBudget();
const t0 = 1_000_000;
expect(budget.take(t0) && budget.take(t0 + 1000) && budget.take(t0 + 2000), 'three recoveries allowed');
expect(!budget.take(t0 + 3000), 'a fourth within ten minutes is refused (the page is closed instead)');
expect(budget.take(t0 + 10 * 60 * 1000 + 1), 'allowed again once the oldest attempt is ten minutes old');

// 7. The page preload stops native dialogs and exposes nothing.
const preload = fs.readFileSync(path.join(root, 'electron/browser/pagePreload.ts'), 'utf8');
expect(!/exposeInMainWorld|ipcRenderer/.test(preload), 'the page preload exposes nothing to web pages');
for (const name of ['alert', 'confirm', 'prompt', 'print', 'credentials', 'input[type="file"]']) {
  expect(preload.includes(name), `the page preload handles ${name}`);
}
const main = fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8');
for (const [needle, message] of [
  ["session: getBrowserSession()", 'pages use the hardened session'],
  ["preload: path.join(__dirname, 'browser', 'pagePreload.js')", 'pages get the dialog-blocking preload'],
  ["onBrowserViewEvent('will-navigate'", 'page navigation is guarded'],
  ["onBrowserViewEvent('will-redirect'", 'page redirects are guarded'],
  ["onBrowserViewEvent('will-prevent-unload'", '"Leave site?" cannot hold the patient'],
  ["mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))", 'the interface opens no windows'],
  ["contents.on('will-attach-webview'", 'no <webview> anywhere'],
  ['pruneNavigationHistory(view.webContents)', 'page history is capped'],
  ['startBrowserMemoryWatch(view, sessionId)', 'page memory is watched'],
]) expect(main.includes(needle), message);
for (const channel of ["'webview:executeJs'", "'webview:type'", "'webview:click'"]) {
  expect(!main.includes(`ipcMain.handle(${channel}`), `retired channel ${channel} stays removed`);
}
expect(/withPageTimeout\(\s*view\.webContents\.executeJavaScript\(buildPageScrollScript/.test(main),
  'Up / Down gives up on a page that stops responding');
expect(/withPageTimeout\(view\.webContents\.executeJavaScript\(\s*buildYoutubeCommandScript/.test(main),
  'YouTube controls give up on a page that stops responding');

// 8. A page that stops responding cannot hold a control (and every press after it) forever.
const settle = (promise) => promise.then((value) => ({ value }), (error) => ({ error: error.message }));
(async () => {
  expect(safety.PAGE_SCRIPT_TIMEOUT_MS === 5000, 'page scripts are given five seconds');
  const quick = await settle(safety.withPageTimeout(Promise.resolve('done'), 50));
  expect(quick.value === 'done', 'a page that answers in time passes its answer through');
  const hung = await settle(safety.withPageTimeout(new Promise(() => {}), 30));
  expect(hung.error === 'page_script_timeout', 'a page that never answers is given up');
  const failed = await settle(safety.withPageTimeout(Promise.reject(new Error('renderer gone')), 50));
  expect(failed.error === 'renderer gone', 'a failed page reports its own error');
  console.log(`Browser safety: ${checks} checks passed.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
