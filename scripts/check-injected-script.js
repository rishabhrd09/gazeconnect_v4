// Syntax-checks the browser gaze injection script (a JS template literal
// inside browserGazeController.ts that tsc cannot validate). Compiles the
// controller standalone, builds every exported script string, and runs each
// through new Function() so a syntax error fails CI/dev instead of silently
// breaking the in-page cursor at runtime.
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.tmp-injected-check');

execSync(
  'npx tsc electron/browser/browserGazeController.ts --outDir .tmp-injected-check --module commonjs --target es2020 --skipLibCheck --noEmitOnError',
  { cwd: root, stdio: 'inherit' }
);

const mod = require(path.join(outDir, 'browserGazeController.js'));

const checks = [
  ['injection script', mod.buildBrowserCursorInjectionScript()],
  ['update/poll script', mod.buildGazeUpdateAndPollScript(100, 200, true)],
  ['hide script', mod.BROWSER_CURSOR_HIDE_SCRIPT],
  ['reset script', mod.BROWSER_CURSOR_RESET_SCRIPT],
];
if (typeof mod.buildBrowserCursorBlockScript === 'function') {
  checks.push(['block script', mod.buildBrowserCursorBlockScript(1000)]);
}

let failed = false;
for (const [name, src] of checks) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(src);
    console.log(`OK   ${name} (${src.length} chars)`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
