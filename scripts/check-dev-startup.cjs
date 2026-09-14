const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../dev-wait.js'), 'utf8');
function run(status, expires = false, doubleFailure = false) {
  let calls = 0, timers = 0, exitCode;
  const reqs = [];
  const context = {
    require: () => ({ get: (_url, response) => {
      const handlers = {};
      const req = { on: (event, fn) => { handlers[event] = fn; }, setTimeout: (_ms, fn) => { req.timeout = fn; }, destroy: () => handlers.error?.() };
      reqs.push({ req, response }); calls++;
      return req;
    }}),
    Date: { now: (() => { let n = 0; return () => ++n === 1 ? 0 : (expires ? 60001 : 1); })() },
    setTimeout: () => { timers++; }, console: { log(){}, error(){} },
    process: { exit: code => { exitCode = code; } },
  };
  vm.runInNewContext(source, context);
  for (const { req, response } of reqs) {
    if (doubleFailure) req.timeout();
    else response({ statusCode: status, resume(){} });
  }
  return { calls, timers, exitCode };
}
assert.equal(run(200).exitCode, 0);
assert.equal(run(404).exitCode, undefined);
assert.equal(run(404).timers, 1);
assert.equal(run(503).timers, 1);
assert.equal(run(0, true).exitCode, 1);
assert.equal(run(0, true).calls, 0);
assert.equal(run(0, false, true).timers, 1);
console.log('Development startup: 7 readiness/failure/duplicate-timeout checks passed.');
