/** The Outside view's memory check (electron/floorplanService.ts decideResources and resources, 16 Oct 2026,
 * REFINE_FIX_HANDOFF C1-C3): the cost of the size asked for plus a reserve, the light size before a refusal, commit
 * headroom, 4 GB machines, and a health-log line for every refusal of Outside. Node only: Electron is a stand-in and
 * the system's memory figures are given by the test. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'electron' ? 'electron-stub' : resolve.call(this, request, ...rest); };
require.cache['electron-stub'] = { id: 'electron-stub', filename: 'electron-stub', loaded: true, exports: { app: { isPackaged: false } } };
const { FloorplanService, decideResources, outsideCostMb, OUTSIDE_RESERVE_MB } = require('../electron/floorplanService.ts');

let checks = 0;
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const kb = mb => mb * 1024;
// Electron's figures in kB: an 8 GB laptop with this much available, and the commit still free.
const laptop = (availableMb, commitFreeMb = 3000, totalMb = 7919) => ({ total: kb(totalMb), free: kb(availableMb), swapTotal: kb(20068), swapFree: kb(commitFreeMb) });

eq(outsideCostMb(1600, 1000), 49, 'the light size: about 50 MB');
eq(outsideCostMb(2400, 1600), 74, 'the full size: about 75 MB');
eq(OUTSIDE_RESERVE_MB, 150);
// The maintainer's laptop in a GazeConnect session (median 335 MB available): Outside at the studio's size is allowed.
let d = decideResources(laptop(335), { width: 1500, height: 800 });
eq([d.exterior, d.light, d.width, d.height, d.costMb, d.needMb], [true, false, 1500, 800, 44, 194]);
// Short for the full size, enough for the light size: drawn light, not refused.
d = decideResources(laptop(200), { width: 2400, height: 1600 });
eq([d.exterior, d.light, d.width, d.height, d.needMb], [true, true, 1600, 1000, 199]);
// Genuinely short: refused, with the numbers the studio shows.
d = decideResources(laptop(150), { width: 2400, height: 1600 });
eq([d.exterior, d.light, d.availableMb, d.needMb], [false, true, 150, 199]);
// Commit nearly exhausted refuses whatever memory is available; no commit figures, no commit check.
eq(decideResources(laptop(2000, 200)).exterior, false, 'commit headroom guards every allocation');
eq(decideResources({ total: kb(7919), free: kb(400) }).exterior, true);
// A 4 GB machine always draws light; sizes are clamped to the studio's range.
d = decideResources(laptop(3000, 3000, 3900), { width: 2400, height: 1600 });
eq([d.light, d.width, d.height], [true, 1600, 1000]);
d = decideResources(laptop(3000), { width: 99999, height: -5 });
eq([d.width, d.height], [2400, 400]);
eq(decideResources(laptop(3000), { width: 'x' }).width, 2400, 'only numbers are read');

// The service: a refusal of Outside is written to the health log with its figures; a reading without `outside`, or an
// allowed Outside, is not.
const events = [];
const service = new FloorplanService({ isQuitting: () => false, kill: () => {}, retry: () => {}, event: (name, data) => events.push([name, data]), port: () => 5050 });
let memory = laptop(150);
process.getSystemMemoryInfo = () => memory;
eq(service.resources().exterior, false);
eq(events.length, 0, 'the studio opening is not a refusal of Outside');
eq(service.resources({ width: 2400, height: 1600, outside: true }).exterior, false);
eq(events, [['floorplan-resources', { decision: 'refused', totalMb: 7919, availableMb: 150, commitFreeMb: 3000, costMb: 49, needMb: 199, width: 1600, height: 1000 }]]);
memory = laptop(600);
eq(service.resources({ width: 2400, height: 1600, outside: true }).exterior, true);
eq(events.length, 1, 'an allowed Outside is not logged');
// The first ready answer, model and image of a process (D3): one event each, under its own name (the health log keeps
// one event of a name within 2 s), and only the first of each.
events.length = 0;
service.spawnedAt = Date.now() - 1500;
for (const [what, ms] of [['ready', 1400], ['model', 90], ['image', 300], ['model', 5]]) service.first(what, ms);
eq(events.map(([name, data]) => [name, data.ms]), [['floorplan-first-ready', 1400], ['floorplan-first-model', 90], ['floorplan-first-image', 300]]);
console.log(`Floor-plan memory check: ${checks} checks passed (cost, reserve, light size, commit, 4 GB, health log, first-plan times).`);
