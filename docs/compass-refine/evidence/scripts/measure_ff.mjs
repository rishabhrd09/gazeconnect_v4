// Frame and still-capture cost of FloorForge's viewer for the C1 house (hero view), per backend.
//   node measure_ff.mjs <build dir> <gpu|swiftshader> <quality: auto|high|performance>
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [build, backend, quality] = process.argv.slice(2);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const args = ['--enable-precise-memory-info', '--ignore-gpu-blocklist'];
args.push(...(backend === 'swiftshader' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal']));
const browser = await chromium.launch({ headless: true, args });
const tree = () => {
  const rows = execSync('ps -axo pid=,ppid=,rss=').toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const keep = new Set(rows.filter(([, ppid]) => ppid === process.pid).map(([pid]) => pid));
  for (let grew = true; grew;) { grew = false; for (const [pid, ppid] of rows) if (keep.has(ppid) && !keep.has(pid)) { keep.add(pid); grew = true; } }
  return Math.round(rows.filter(([pid]) => keep.has(pid)).reduce((s, r) => s + r[2], 0) / 1024);
};
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const t0 = Date.now();
await page.goto(pathToFileURL(join(build, 'preview.html')).href, { waitUntil: 'load', timeout: 600000 });
await page.waitForFunction(() => window.__ff && (window.__ff.ready || window.__ff.error), null, { timeout: 600000 });
const ready_ms = Date.now() - t0;
const result = await page.evaluate(async (q) => {
  const v = window.__ff.viewer;
  if (q !== 'auto') v.setQuality(q);
  v.setMode('solid'); v.setView('hero');
  await new Promise((r) => setTimeout(r, 3000));
  v.paused = true;
  const gl = v.renderer.getContext();
  let tris = 0, meshes = 0;
  v.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry, per = (g.index ? g.index.count : (g.attributes.position?.count || 0)) / 3;
    tris += per * (o.isInstancedMesh ? o.count : 1); meshes += 1;
  });
  const frames = [];
  for (let i = 0; i < 12; i++) { const t = performance.now(); v.composer.render(0); gl.finish(); frames.push(performance.now() - t); }
  frames.sort((a, b) => a - b);
  const t = performance.now(); await v.snapshot({ width: 2400 }); const still = performance.now() - t;
  return { quality: v.qualityName, meshes, triangles: Math.round(tris), frame_ms_median: +frames[6].toFixed(1), frame_ms_max: +frames[11].toFixed(1),
           still_2400_ms: Math.round(still), js_heap_mb: Math.round(performance.memory.usedJSHeapSize / 1048576),
           textures: v.renderer.info.memory.textures, geometries: v.renderer.info.memory.geometries };
}, quality);
console.log(JSON.stringify({ backend, ready_ms, ...result, browser_tree_mb: tree() }));
await browser.close();
