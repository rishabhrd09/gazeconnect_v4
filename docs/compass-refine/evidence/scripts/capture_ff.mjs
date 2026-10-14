// Capture FloorForge's own generated views for the C1 house and measure their cost on this machine.
// Read-only use of an existing Playwright install (PLAYWRIGHT_MODULE) and its cached Chromium.
//   node capture_ff.mjs <build dir> <out dir> [gpu|swiftshader]
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [build, out, backend = 'gpu'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const args = ['--enable-precise-memory-info', '--ignore-gpu-blocklist'];
if (backend === 'swiftshader') args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
else args.push('--use-angle=metal');
const browser = await chromium.launch({ headless: true, args });
const tree = () => {
  // Resident memory of the browser and all of its child processes (renderer, GPU, utility), in MB.
  const rows = execSync('ps -axo pid=,ppid=,rss=').toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const keep = new Set(rows.filter(([pid, ppid]) => ppid === process.pid).map(([pid]) => pid));
  for (let grew = true; grew;) { grew = false; for (const [pid, ppid] of rows) if (keep.has(ppid) && !keep.has(pid)) { keep.add(pid); grew = true; } }
  return Math.round(rows.filter(([pid]) => keep.has(pid)).reduce((s, r) => s + r[2], 0) / 1024);
};
const metrics = { backend, views: {}, memory: {} };
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await page.goto(pathToFileURL(join(build, 'preview.html')).href, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__ff && (window.__ff.ready || window.__ff.error), null, { timeout: 300000 });
metrics.ready_ms = Date.now() - t0;
metrics.gl = await page.evaluate(() => {
  const gl = window.__ff.viewer.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown', quality: window.__ff.viewer.qualityName };
});
// Let procedural textures, probes and planting settle before measuring.
await page.waitForTimeout(4000);
metrics.memory.after_load = await page.evaluate(() => ({ js_heap_mb: Math.round(performance.memory.usedJSHeapSize / 1048576) }));
metrics.memory.after_load.browser_tree_mb = tree();

async function still(name, setup, quality) {
  const t = Date.now();
  await page.evaluate(setup);
  await page.waitForTimeout(2500);  // progressive loads and the camera glide
  const png = await page.evaluate(async (q) => {
    const v = window.__ff.viewer;
    if (q) v.setQuality(q);
    const blob = await v.snapshot({ width: 2400 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(s);
  }, quality);
  writeFileSync(join(out, name + '.png'), Buffer.from(png, 'base64'));
  const info = await page.evaluate(() => { const r = window.__ff.viewer.renderer.info; return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures, js_heap_mb: Math.round(performance.memory.usedJSHeapSize / 1048576) }; });
  metrics.views[name] = { ms_including_settle: Date.now() - t, ...info, browser_tree_mb: tree() };
}

const corner = (theta) => `(() => { const v = window.__ff.viewer; v.setMode('solid'); v.setView('front'); const fp = v.data.footprint, xs = fp.map(p => p[0]), ys = fp.map(p => p[1]); const mid = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 2.6]; v.orbitTo(mid, ${theta}, 0.42, 34); v.fitHouse({ fill: 0.86, animate: false }); })()`;
const views = [
  ['ff_hero', `(() => { const v = window.__ff.viewer; v.setMode('solid'); v.setView('hero'); })()`],
  ['ff_corner_front_left', corner('-Math.PI * 0.75')],
  ['ff_corner_front_right', corner('-Math.PI * 0.25')],
  ['ff_corner_back_right', corner('Math.PI * 0.25')],
  ['ff_corner_back_left', corner('Math.PI * 0.75')],
  ['ff_aerial', `(() => { const v = window.__ff.viewer; v.setMode('solid'); v.setView('aerial'); })()`],
  ['ff_top', `(() => { const v = window.__ff.viewer; v.setMode('solid'); v.setView('top'); })()`],
  ['ff_dollhouse_ground', `(() => { const v = window.__ff.viewer; v.setMode('dollhouse'); v.setFloor(0); })()`],
  ['ff_dollhouse_first', `(() => { const v = window.__ff.viewer; v.setMode('dollhouse'); v.setFloor(1); })()`],
  ['ff_planmode_ground', `(() => { const v = window.__ff.viewer; v.setMode('plan'); v.setFloor(0); })()`],
  ['ff_planmode_first', `(() => { const v = window.__ff.viewer; v.setMode('plan'); v.setFloor(1); })()`],
];
if (backend === 'swiftshader') {
  await still('ff_hero_swiftshader', views[0][1], null);
} else {
  for (const [name, setup] of views) await still(name, setup, null);
  // The lowest preset the viewer offers, for the reduced-quality comparison.
  await still('ff_hero_performance', views[0][1], 'performance');
  await still('ff_dollhouse_ground_performance', views[7][1], 'performance');
  // Full A3 sheets, rendered by the same browser engine at 2x.
  const sheets = join(build, 'sheets');
  for (const f of readdirSync(sheets).filter((n) => /^A-(101|102|201|202|301)\.svg$/.test(n))) {
    const p = await browser.newPage({ viewport: { width: 1587, height: 1123 }, deviceScaleFactor: 1.5 });
    await p.goto(pathToFileURL(join(sheets, f)).href);
    await p.screenshot({ path: join(out, 'ff_sheet_' + f.replace('.svg', '.png')), fullPage: false });
    await p.close();
  }
}
metrics.memory.end = { browser_tree_mb: tree() };
metrics.errors = errors;
writeFileSync(join(out, `ff_metrics_${backend}.json`), JSON.stringify(metrics, null, 1));
console.log(JSON.stringify({ ready_ms: metrics.ready_ms, gl: metrics.gl, memory: metrics.memory, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
