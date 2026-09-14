// Execute the production freshness gate and GazeCursor loop with a virtual clock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function compile(file) {
  return ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
function load(file, context = {}) {
  const exports = {};
  vm.runInNewContext(compile(file), { exports, require, ...context }, { filename: file });
  return exports;
}
const safety = load('src/utils/gazeSafety.ts');
const dwell = load('src/config/dwellTimeConfig.ts');
let tests = 0;
function test(name, fn) { fn(); tests++; console.log(`PASS ${name}`); }
const base = { x: .5, y: .5, is_valid: true, signal_state: 'valid' };
test('invalid, nonfinite, offscreen and old frames cannot select', () => {
  for (const changed of [{is_valid:false}, {x:NaN}, {y:Infinity}, {x:-.01}, {y:1.01},
    {signal_state:'gap_hold'}, {signal_state:'blink'}, {t_helper_ms:800},
    {t_sent_wall_ms:800}, {sample_age_ms:151}, {t_helper_ms:1200}]) {
    assert.equal(safety.isUsableGaze({...base, ...changed}, 1000), false, JSON.stringify(changed));
  }
  assert.equal(safety.isUsableGaze(base, 1000), true);
});
test('a repeated or reordered source stamp does not refresh freshness', () => {
  const gate = new safety.GazeFreshness();
  assert(gate.receive({...base, t_helper_ms:1000}, 1000, 0));
  assert(gate.receive({...base, t_helper_ms:1010}, 1010, 10));
  assert.equal(gate.receive({...base, t_helper_ms:1000}, 1020, 20), false);
  assert.equal(gate.receive({...base, t_helper_ms:1010}, 1030, 30), false);
  assert.equal(gate.allowsDwell(161), false);
  gate.lose();
  assert.equal(gate.allowsDwell(11), false);
});
function cursorHarness(height = 1080) {
  let now = 10000, clicks = 0, rafId = 0;
  const rafs = new Map(), effects = [], listeners = new Map();
  let gaze;
  class Element {
    constructor() { this.id='test-button'; this.tagName='BUTTON'; this.className='gaze-button'; this.textContent='Test'; this.isConnected=true; this.disabled=false; this.parentElement=null; }
    getAttribute(key) { return ({'data-gaze':'true', 'data-gaze-context':'navigation'})[key] ?? null; }
    getBoundingClientRect() { return {left:860, top:height/2-100, right:1060, bottom:height/2+100, width:200, height:200}; }
    closest() { return null; }
    matches() { return this.disabled; }
    contains(node) { return node===this; }
    click() { clicks++; }
  }
  const target = new Element();
  const ws={isConnected:true,currentScreen:'home',setGazeOffset(){},registerTargets(){},subscribeGaze(cb){gaze=cb;return()=>{};}};
  const react = {useState:initial=>[typeof initial==='function'?initial():initial, ()=>{}], useRef:initial=>({current:initial}), useCallback:fn=>fn, useEffect:fn=>effects.push(fn)};
  const stubs = {
    react,
    'react/jsx-runtime': {jsx(){return null;},jsxs(){return null;},Fragment:'fragment'},
    '../../hooks/useWebSocket':{useWS:()=>ws},
    './GazeControlToggle':{POST_NAVIGATION_COOLDOWN_MS:1200,useGazeControl:()=>({isGazeEnabled:true,isMouseMode:false,lastNavigationTimestamp:0})},
    '../../contexts/RealGazeContext':{useRealGaze:()=>({hasRealGaze:true,reportGazeReceived(){}})},
    '../../contexts/CustomizationContext':{useCustomization:()=>({settings:{gazeCursorSize:'medium'}})},
    '../../contexts/DwellTimeContext':{useDwellTime:()=>({settings:dwell.DEFAULT_DWELL_TIMES,currentStage:'mid_als'})},
    '../../utils/gazeSnapping':{collectSnapTargets:()=>[],computeSnap:(x,y)=>({x,y,snapped:false})},
    '../../utils/edgeHitZone':{computeEdgeExpansion:()=>0,isPointInExpandedRect:()=>false},
    '../../utils/screenProfile':{computeScreenProfile:()=>({})},
    '../../contexts/ThemeContext':{useTheme:()=>({isLight:false,isWarm:false})},
    '../../utils/hitZoneExpansion':{collectKeyboardKeys:()=>[],findBestKeyboardKey:()=>null},
    '../../utils/gazeTelemetry':new Proxy({}, {get:()=>()=>{}}),
    '../../utils/gazeFlags':{gazeFlags:{keyboardCadence:true,dwellPauseOnGap:false,lockBreakProgressRetention:true}},
    '../../config/dwellTimeConfig':dwell,
    '../../utils/gazeSafety':safety,
  };
  const window={innerWidth:1920,innerHeight:height,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
  const context={window,document:{body:{},elementsFromPoint:()=>[target],elementFromPoint:()=>target},HTMLElement:Element,
    getComputedStyle:()=>({zIndex:'0'}),Date:{now:()=>now},performance:{now:()=>now},
    setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},
    requestAnimationFrame:fn=>{rafs.set(++rafId,fn);return rafId;},cancelAnimationFrame:id=>rafs.delete(id),
    console:{log(){},warn(){},error(){}},require:name=>{if(!(name in stubs))throw new Error(name);return stubs[name];}};
  const component=load('src/components/core/GazeCursor.tsx',context);
  component.GazeCursor();
  effects.forEach(fn=>fn());
  return {
    get clicks(){return clicks;},target,
    frame(ms=16, valid=true){now+=ms;if(valid)gaze({...base,t_helper_ms:now,active_pipeline:'adaptive_cursor_v1',intent_x:.5,intent_y:.5});const pending=[...rafs.values()];rafs.clear();pending.forEach(fn=>fn());},
    run(ms, valid=true){for(let elapsed=0;elapsed<ms;elapsed+=16)this.frame(16,valid);},
    lose(){listeners.get('gaze_lost')?.();},
  };
}
for (const height of [768,1080]) {
  test(`production cursor requires real samples before selection at ${height}px`,()=>{
    const h=cursorHarness(height);h.run(5000,false);assert.equal(h.clicks,0);
    h.run(dwell.DWELL_GROUPS.navigation.ms + 300);assert.equal(h.clicks,1);
  });
  test(`production cursor cannot click during invalid/stale input at ${height}px`,()=>{
    const h=cursorHarness(height);h.run(dwell.DWELL_GROUPS.navigation.ms + 100);assert.equal(h.clicks,0);
    h.lose();h.run(500,false);assert.equal(h.clicks,0);h.run(400);assert.equal(h.clicks,1);
  });
  test(`long loss and renderer stall require fresh dwell at ${height}px`,()=>{
    const h=cursorHarness(height);h.run(dwell.DWELL_GROUPS.navigation.ms + 100);h.lose();h.frame(5000,false);
    h.frame();assert.equal(h.clicks,0);h.run(dwell.DWELL_GROUPS.navigation.ms + 300);assert.equal(h.clicks,1);
    const stalled=cursorHarness(height);stalled.run(dwell.DWELL_GROUPS.navigation.ms + 100);stalled.frame(5000,true);assert.equal(stalled.clicks,0);
  });
  test(`disabled targets cannot commit at ${height}px`,()=>{
    const h=cursorHarness(height);h.run(dwell.DWELL_GROUPS.navigation.ms + 100);h.target.disabled=true;h.run(500);assert.equal(h.clicks,0);
  });
}
console.log(`${tests} gaze safety regressions passed (virtual clock/DOM; not a hardware or visual layout test).`);
