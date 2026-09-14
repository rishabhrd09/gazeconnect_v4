const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { requestFloorplan } = require('../electron/floorplanTransport.ts');
(async () => {
  for (const input of [{endpoint:'https://example.com'}, {endpoint:'/api/health?url=x'}, {endpoint:'/api/health',body:'{}'}, {endpoint:'/api/floorplan/generate'}, {endpoint:'/api/floorplan/generate',body:'x'.repeat(2*1024*1024+1)}]) {
    await assert.rejects(requestFloorplan(input));
  }
  const received=[];
  const server=http.createServer((req,res)=>{
    let body='';req.on('data',c=>body+=c);req.on('end',()=>{
      received.push({url:req.url,method:req.method,body});
      res.writeHead(req.url==='/api/health'?200:422, {'content-type':'application/json'});
      res.end(req.url==='/api/health'?'{}':'{"error":"example validation failure"}');
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const port=server.address().port;
    const health=await requestFloorplan({endpoint:'/api/health'},port);
    assert.equal(health.status,200);
    assert.equal(Buffer.from(health.bytes).toString(),'{}');
    const failed=await requestFloorplan({endpoint:'/api/floorplan/generate',body:'{"test":true}'},port);
    assert.equal(failed.status,422);
    assert.equal(JSON.parse(Buffer.from(failed.bytes)).error,'example validation failure');
    assert.deepEqual(received,[{url:'/api/health',method:'GET',body:''},{url:'/api/floorplan/generate',method:'POST',body:'{"test":true}'}]);
  } finally { await new Promise(resolve=>server.close(resolve)); }
  console.log('Floor-plan transport: 10 route/body/loopback/response checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
