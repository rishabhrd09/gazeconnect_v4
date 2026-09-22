const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../dev-wait.js'), 'utf8');
function run(status, expires = false, doubleFailure = false, env = {}) {
  let calls = 0, timers = 0, exitCode;
  const reqs = [], urls = [], errors = [];
  const context = {
    require: () => ({ get: (url, response) => {
      const handlers = {};
      const req = { on: (event, fn) => { handlers[event] = fn; }, setTimeout: (_ms, fn) => { req.timeout = fn; }, destroy: () => handlers.error?.() };
      reqs.push({ req, response }); urls.push(url); calls++;
      return req;
    }}),
    Date: { now: (() => { let n = 0; return () => ++n === 1 ? 0 : (expires ? 60001 : 1); })() },
    setTimeout: () => { timers++; }, console: { log(){}, error: (message) => { errors.push(message); } },
    process: { env, exit: code => { exitCode = code; } },
  };
  vm.runInNewContext(source, context);
  for (const { req, response } of reqs) {
    if (doubleFailure) req.timeout();
    else response({ statusCode: status, resume(){} });
  }
  return { calls, timers, exitCode, urls, errors };
}
assert.equal(run(200).exitCode, 0);
assert.equal(run(404).exitCode, undefined);
assert.equal(run(404).timers, 1);
assert.equal(run(503).timers, 1);
assert.equal(run(0, true).exitCode, 1);
assert.equal(run(0, true).calls, 0);
assert.equal(run(0, false, true).timers, 1);
// Start-Dev.ps1 passes the port it gave Vite in GAZECONNECT_VITE_PORT; electron/main.ts reads it
// the same way (unset or not a number: 5173). Each run gets its own env, never the caller's.
const chosen = { GAZECONNECT_VITE_PORT: '5175' };
assert.deepEqual(run(200).urls, ['http://127.0.0.1:5173', 'http://localhost:5173']);
assert.deepEqual(run(200, false, false, chosen).urls, ['http://127.0.0.1:5175', 'http://localhost:5175']);
assert.deepEqual(run(200, false, false, { GAZECONNECT_VITE_PORT: 'x' }).urls, ['http://127.0.0.1:5173', 'http://localhost:5173']);
assert.match(run(0, true, false, chosen).errors.join('\n'), /\bport 5175\b/);
console.log('Development startup: 11 readiness/failure/duplicate-timeout/port checks passed.');
