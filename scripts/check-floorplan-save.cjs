/** Saving a Compass drawing (electron/floorplanService.ts `save`, 14 Oct 2026): refused names, an ordinary save,
 * a file of the same name that is locked (open in a viewer on Windows), Documents refused (Windows Controlled
 * Folder Access) so Downloads is used, both refused, a wrong kind of reply, and never a partial file left behind.
 * Node only: Electron's `app` is a stand-in whose folders are temporary; the service is never started. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-save-'));
const folders = { documents: path.join(root, 'Documents'), downloads: path.join(root, 'Downloads') };
const electron = { app: { getPath: name => folders[name], isPackaged: false } };
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'electron' ? 'electron-stub' : resolve.call(this, request, ...rest); };
require.cache['electron-stub'] = { id: 'electron-stub', filename: 'electron-stub', loaded: true, exports: electron };
const { FloorplanService } = require('../electron/floorplanService.ts');

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const events = [];
const service = new FloorplanService({ isQuitting: () => false, kill: () => {}, retry: () => {}, event: (name, data) => events.push([name, data]), port: () => 5050 });
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
let reply = { status: 200, contentType: 'image/png', bytes: png };
service.ensureReady = async () => true;
service.request = async () => reply;
const endpoint = '/api/floorplan/compass/v2/render';
const save = fileName => service.save({ endpoint, body: '{}', fileName });
const partials = () => [folders.documents, folders.downloads].flatMap(dir => fs.existsSync(dir)
  ? fs.readdirSync(dir, { recursive: true }).filter(f => String(f).endsWith('.part')) : []);

(async () => {
  for (const name of ['CON.png', 'nul.txt', 'com1.pdf', '../x.png', 'a/b.png', 'a\\b.png', 'x.exe', '', '.png', 'plan.png ']) {
    ok(!(await save(name)).ok, `refused: ${JSON.stringify(name)}`);
  }
  ok(!(await service.save({ endpoint: '/api/health', body: '', fileName: 'Compass-1-plan.png' })).ok, 'only drawings are saved');

  const first = await save('Compass-1234abcd-ground-plan.png');
  ok(first.ok && first.place === 'Documents', JSON.stringify(first));
  ok(first.file.startsWith(path.join(folders.documents, 'GazeConnect Plans')), first.file);
  ok(Buffer.compare(fs.readFileSync(first.file), Buffer.from(png)) === 0, 'the bytes are written as given');
  const again = await save('Compass-1234abcd-ground-plan.png');
  ok(again.ok && again.file === first.file, 'the same plan saved again replaces its file');

  // On Windows a file open in a viewer is locked: the new copy gets " (2)" and the open one is kept.
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => { if (to === first.file) { const e = new Error('EPERM: operation not permitted'); e.code = 'EPERM'; throw e; } return rename(from, to); };
  const locked = await save('Compass-1234abcd-ground-plan.png');
  fs.renameSync = rename;
  ok(locked.ok && locked.file.endsWith('Compass-1234abcd-ground-plan (2).png'), JSON.stringify(locked));
  ok(partials().length === 0, 'no partial file after a locked target');

  // Documents refused (Controlled Folder Access): Downloads, and the app's health log says so.
  const documents = folders.documents;
  fs.writeFileSync(path.join(root, 'not-a-folder'), '');
  folders.documents = path.join(root, 'not-a-folder', 'Documents');
  const fallback = await save('Compass-1234abcd-ground-top-view.png');
  ok(fallback.ok && fallback.place === 'Downloads' && fallback.file.startsWith(folders.downloads), JSON.stringify(fallback));
  ok(events.some(([name]) => name === 'floorplan-save-fallback'), 'the fallback is recorded');
  // Both refused: an honest error, nothing partial.
  folders.downloads = path.join(root, 'not-a-folder', 'Downloads');
  const neither = await save('Compass-1234abcd-ground-top-view.png');
  ok(!neither.ok && /could not be written/.test(neither.error), JSON.stringify(neither));
  folders.documents = documents; folders.downloads = path.join(root, 'Downloads');
  ok(partials().length === 0, 'no partial files anywhere');

  reply = { status: 200, contentType: 'text/html', bytes: new Uint8Array([60]) };
  ok(!(await save('Compass-1234abcd-ground-plan.png')).ok, 'a reply of a different kind is not saved');
  reply = { status: 409, contentType: 'application/json', bytes: Buffer.from('{"error":"A newer view was requested."}') };
  const superseded = await save('Compass-1234abcd-ground-plan.png');
  ok(!superseded.ok && superseded.error === 'A newer view was requested.', JSON.stringify(superseded));

  fs.rmSync(root, { recursive: true, force: true });
  console.log(`Floor-plan saving: ${checks} checks passed (names, replace, locked file, Downloads fallback, errors, no partial files).`);
})().catch(error => { console.error(error); fs.rmSync(root, { recursive: true, force: true }); process.exitCode = 1; });
