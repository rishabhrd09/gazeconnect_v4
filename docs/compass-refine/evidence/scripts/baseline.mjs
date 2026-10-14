import { execSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const backend = process.argv[2] || 'gpu';
const args = backend === 'swiftshader' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal'];
const browser = await chromium.launch({ headless: true, args });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
// A page with an idle WebGL2 canvas, so the GPU process exists as it would for any 3D view.
await page.setContent('<canvas id=c width=1366 height=768></canvas><script>const g=document.getElementById("c").getContext("webgl2");g.clearColor(1,1,1,1);g.clear(g.COLOR_BUFFER_BIT);</script>');
await page.waitForTimeout(3000);
const rows = execSync('ps -axo pid=,ppid=,rss=').toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
const keep = new Set(rows.filter(([, ppid]) => ppid === process.pid).map(([pid]) => pid));
for (let grew = true; grew;) { grew = false; for (const [pid, ppid] of rows) if (keep.has(ppid) && !keep.has(pid)) { keep.add(pid); grew = true; } }
console.log(JSON.stringify({ backend, baseline_tree_mb: Math.round(rows.filter(([pid]) => keep.has(pid)).reduce((s, r) => s + r[2], 0) / 1024) }));
await browser.close();
