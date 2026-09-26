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
// Real geometry, not stubs: target choice and the gaze focus decide WHICH
// control a dwell belongs to, so they are part of selection safety.
const hitZones = load('src/utils/hitZoneExpansion.ts', { Math, HTMLElement: class {}, document: { querySelectorAll: () => [] } });
const focus = load('src/utils/gazeFocus.ts', { Math, Number });
const bank = load('src/utils/dwellProgressBank.ts', { Math, Number });
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
// `opts.others`: more targets beside the main one; `opts.gazeEnabled: false`:
// gaze selection switched off (only always-active controls may be chosen).
function cursorHarness(height = 1080, cursorSettings = {}, flags = {}, box = null, opts = {}) {
  let now = 10000, clicks = 0, rafId = 0, timerId = 0;
  const rafs = new Map(), timers = new Map(), effects = [], listeners = new Map(), interrupts = [], clickLog = [];
  const states = [], refs = [], drawn = [];
  const r0 = box || { left: 860, top: height / 2 - 100, width: 200, height: 200 };
  let gaze;
  class Element {
    constructor(r = r0, id = 'test-button') {
      this.r=r; this.id=id; this.tagName='BUTTON';
      this.className=opts.screen==='keyboard'
        ? `gaze-button ${opts.targetKind==='suggestion'?'keyboard-word-slot':'keyboard-key'}` : 'gaze-button';
      this.textContent='Test'; this.isConnected=true; this.disabled=false; this.parentElement=null; this.attributes=new Map();
    }
    getAttribute(key) {
      const keyboardContext = opts.targetKind==='suggestion'?'prediction'
        : opts.targetKind==='special'?'deliberateAction':'keyboard';
      const action = opts.targetKind==='modifier'?'shift'
        : opts.targetKind==='special'?'deleteWord':'letter';
      return this.attributes.get(key) ?? ({'data-gaze':'true',
        'data-gaze-context':opts.screen==='keyboard'?keyboardContext:'navigation',
        'data-action':opts.screen==='keyboard'?action:null})[key] ?? null;
    }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
    getBoundingClientRect() { const r=this.r; return {left:r.left, top:r.top, right:r.left+r.width, bottom:r.top+r.height, width:r.width, height:r.height}; }
    closest() { return null; }
    matches(selector) {
      if (selector==='.keyboard-screen .keyboard-key') return opts.screen==='keyboard' && this.className.includes('keyboard-key');
      if (selector==='.keyboard-screen .keyboard-word-slot') return opts.screen==='keyboard' && this.className.includes('keyboard-word-slot');
      if (selector==='.keyboard-screen .keyboard-phrase-slot') return false;
      return this.disabled;
    }
    contains(node) { return node===this; }
    click() { clicks++; clickLog.push(this.id); }
  }
  const target = new Element();
  const others = (opts.others || []).map((r, i) => new Element(r, `other-${i}`));
  const all = [target, ...others];
  // Anything outside the buttons is plain page background, not a control.
  const background = {tagName:'DIV',className:'',id:'',parentElement:null,getAttribute:()=>null,closest:()=>null,matches:()=>false,contains:node=>node===background};
  const at = (x, y) => all.find(el => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }) || background;
  const ws={isConnected:true,currentScreen:opts.screen || 'home',setGazeOffset(){},registerTargets(){},subscribeGaze(cb){gaze=cb;return()=>{};}};
  // State setters and refs are recorded so a test can see what is drawn: the
  // ring's progress (first useState), the highlight (fifth), whether the bubble
  // is hidden for want of gaze (sixth) and its transform (first null ref).
  const react = {useState:initial=>{const i=states.length;states.push(typeof initial==='function'?initial():initial);
      return [states[i], v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},
    useRef:initial=>{const ref={current:initial};refs.push(ref);return ref;}, useCallback:fn=>fn, useEffect:fn=>effects.push(fn)};
  const stubs = {
    react,
    'react/jsx-runtime': {jsx(){return null;},jsxs(){return null;},Fragment:'fragment'},
    '../../hooks/useWebSocket':{useWS:()=>ws},
    './GazeControlToggle':{POST_NAVIGATION_COOLDOWN_MS:1200,useGazeControl:()=>({isGazeEnabled:opts.gazeEnabled!==false,isMouseMode:false,lastNavigationTimestamp:0})},
    '../../contexts/RealGazeContext':{useRealGaze:()=>({hasRealGaze:true,reportGazeReceived(){}})},
    '../../contexts/CustomizationContext':{useCustomization:()=>({settings:{gazeCursorSize:'medium',...cursorSettings}})},
    '../../contexts/DwellTimeContext':{useDwellTime:()=>({settings:dwell.DEFAULT_DWELL_TIMES,currentStage:'mid_als'})},
    '../../utils/gazeSnapping':{collectSnapTargets:()=>[],computeSnap:(x,y)=>({x,y,snapped:false})},
    '../../utils/edgeHitZone':{computeEdgeExpansion:()=>0,isPointInExpandedRect:()=>false},
    '../../utils/screenProfile':{computeScreenProfile:()=>({})},
    '../../contexts/ThemeContext':{useTheme:()=>({isLight:false,isWarm:false})},
    '../../utils/hitZoneExpansion':{...hitZones,collectKeyboardKeys:()=>[],findBestKeyboardKey:()=>null},
    '../../utils/gazeFocus':focus,
    '../../utils/dwellProgressBank':bank,
    // Measurement only; dwell interruptions are kept so a test can see a lock break.
    '../../utils/gazeTelemetry':new Proxy({}, {get:(_,name)=>name==='recordDwellInterrupt'?(event=>interrupts.push(event.kind)):()=>{}}),
    '../../utils/gazeFlags':{gazeFlags:{keyboardCadence:true,dwellPauseOnGap:false,lockBreakProgressRetention:true,lockBreakConfirm:true,...flags}},
    '../../config/dwellTimeConfig':dwell,
    '../../utils/gazeSafety':safety,
    './TrackerStatusNotice':{TrackerStatusNotice:()=>null},
  };
  const window={innerWidth:1920,innerHeight:height,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
  const context={window,document:{body:{},elementsFromPoint:(x,y)=>[at(x,y)],elementFromPoint:(x,y)=>at(x,y)},HTMLElement:Element,
    getComputedStyle:()=>({zIndex:'0'}),Date:{now:()=>now},performance:{now:()=>now},
    setInterval:()=>1,clearInterval(){},
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,at:now+ms});return timerId;},
    clearTimeout:id=>timers.delete(id),
    requestAnimationFrame:fn=>{rafs.set(++rafId,fn);return rafId;},cancelAnimationFrame:id=>rafs.delete(id),
    console:{log(){},warn(){},error(){}},require:name=>{if(!(name in stubs))throw new Error(name);return stubs[name];}};
  const component=load('src/components/core/GazeCursor.tsx',context);
  component.GazeCursor();
  const cursorEl = refs.find(ref=>ref.current===null);
  cursorEl.current = {style:{set transform(v){const m=/translate3d\(([-\d.e]+)px, ([-\d.e]+)px/.exec(v);if(m)drawn.push({x:+m[1],y:+m[2],t:now});}}};
  effects.forEach(fn=>fn());
  return {
    get clicks(){return clicks;},target,others,interrupts,drawn,clickLog,get now(){return now;},
    get ringProgress(){return states[0];}, get highlight(){return states[4];}, get hidden(){return states[5];},
    get cursor(){return drawn[drawn.length-1];},
    // `sample` overrides the frame: {intent_x} alone is a raw sample the
    // estimator did not follow; add {x} as well for gaze that really moved.
    frame(ms=16, valid=true, sample={}){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}if(valid)gaze({...base,t_helper_ms:now,active_pipeline:'adaptive_cursor_v1',intent_x:.5,intent_y:.5,...sample});const pending=[...rafs.values()];rafs.clear();pending.forEach(fn=>fn());},
    run(ms, valid=true, sample={}){for(let elapsed=0;elapsed<ms;elapsed+=16)this.frame(16,valid,sample);},
    lose(){listeners.get('gaze_lost')?.();},
    // A physical press or click, as the browser would deliver it (trusted unless told otherwise).
    pointerDown(isTrusted=true){listeners.get('pointerdown')?.({isTrusted});},
    physicalClick(on=target,isTrusted=true){let swallowed=false;
      listeners.get('click')?.({isTrusted,target:on,preventDefault(){swallowed=true;},stopPropagation(){}});return swallowed;},
  };
}
// Bottom rows of the traditional keyboard at 1920 px: letters 150x110, and a
// space bar several keys wide directly beneath them.
const key = (id, left, top, width, height = 110) => ({ element: { id }, left, top, right: left + width, bottom: top + height,
  centerX: left + width / 2, centerY: top + height / 2, width, height });
const KEYS = [key('c', 480, 700, 150), key('v', 640, 700, 150), key('b', 800, 700, 150), key('n', 960, 700, 150),
  key('word', 60, 820, 250), key('quick', 320, 820, 270), key('space', 600, 820, 780), key('123', 1390, 820, 270)];
const pick = (x, y) => hitZones.findBestKeyboardKey(x, y, KEYS, 55)?.id ?? null;
test('a wide key owns every point inside it, not just the part near its centre', () => {
  // Centre distance alone gave all of these to the letter above or the key
  // beside: looking at the space bar could type a letter.
  for (const [x, y] of [[640, 830], [715, 826], [875, 835], [1035, 828], [1300, 830], [615, 900], [1370, 925], [990, 875]]) {
    assert.equal(pick(x, y), 'space', `(${x}, ${y})`);
  }
  assert.equal(pick(715, 800), 'v');            // Still inside V.
  assert.equal(pick(715, 812), 'v');            // In the 10 px gap, nearer V's edge...
  assert.equal(pick(715, 817), 'space');        // ...and nearer the space bar's.
  assert.equal(pick(590, 875), 'quick');        // Left of the bar, inside Quick Words.
  assert.equal(pick(715, 960), 'space');        // Just below the keyboard.
  assert.equal(pick(715, 1000), null);          // Beyond the 55 px margin: nothing.
});
test('equal-sized keys keep their previous ownership', () => {
  assert.equal(pick(555, 755), 'c');
  assert.equal(pick(634, 755), 'c');            // Gap between C and V, nearer C.
  assert.equal(pick(636, 755), 'v');
  assert.equal(pick(1200, 640), null);
});
test('keyboard acquisition outline follows the key, clears on loss, then gives way to progress', () => {
  const opts = {screen:'keyboard', others:[{left:1110,top:284,width:200,height:200}]};
  const h = cursorHarness(768, {}, {keyboardCadence:false}, null, opts);
  h.run(96);
  assert.equal(h.target.getAttribute('data-keyboard-onset'), 'true');
  assert.equal(h.ringProgress, 0, 'acquisition must not count as dwell');
  h.lose();
  assert.equal(h.target.getAttribute('data-keyboard-onset'), null, 'tracking loss hides acquisition');
  h.run(32);
  assert.equal(h.target.getAttribute('data-keyboard-onset'), 'true', 'fresh gaze restores acquisition');
  h.run(96, true, {x:.63, y:.5, intent_x:.63, intent_y:.5});
  assert.equal(h.target.getAttribute('data-keyboard-onset'), null, 'old key outline must clear');
  assert.equal(h.others[0].getAttribute('data-keyboard-onset'), 'true', 'new key must own outline');
  h.run(240, true, {x:.1, y:.1, intent_x:.1, intent_y:.1});
  assert.equal(h.others[0].getAttribute('data-keyboard-onset'), null, 'outline must clear when gaze leaves keys');

  const dwell = cursorHarness(768, {}, {keyboardCadence:false}, null, {screen:'keyboard'});
  dwell.run(420);
  assert.equal(dwell.target.getAttribute('data-keyboard-onset'), null, 'amber outline ends after onset');
  assert.equal(dwell.highlight?.keyboardKey, true, 'the progress outline is keyboard scoped');
  assert(dwell.ringProgress > 0, 'teal progress begins only after onset');
  for (let i=0; i<250 && dwell.clicks===0; i++) dwell.frame();
  assert.equal(dwell.clicks, 1);
  assert.equal(dwell.target.getAttribute('data-keyboard-confirmed'), 'true', 'click shows a brief key-local confirmation');
  dwell.pointerDown();
  assert.equal(dwell.target.getAttribute('data-keyboard-confirmed'), null, 'physical press clears confirmation');

  const timed = cursorHarness(768, {}, {keyboardCadence:false}, null, {screen:'keyboard'});
  for (let i=0; i<300 && timed.clicks===0; i++) timed.frame();
  assert.equal(timed.target.getAttribute('data-keyboard-confirmed'), 'true');
  timed.run(240);
  assert.equal(timed.target.getAttribute('data-keyboard-confirmed'), null, 'confirmation expires without input delay');
});
test('Familiar acquires for 350 ms then fills ordinary keys, Shift and suggestions at their own fixed pace', () => {
  const cases = [
    ['key', dwell.FAMILIAR_KEYBOARD_TIMING.key],
    ['modifier', dwell.FAMILIAR_KEYBOARD_TIMING.modifier],
    ['suggestion', dwell.FAMILIAR_KEYBOARD_TIMING.suggestion],
  ];
  for (const [targetKind, fillMs] of cases) {
    // Familiar is explicit and must work even if legacy keyboardCadence is off.
    const h = cursorHarness(768, {keyboardFeel:'familiar'}, {keyboardCadence:false}, null, {screen:'keyboard',targetKind});
    const start = h.now;
    h.run(336);
    assert.equal(h.ringProgress, 0, `${targetKind} began fill before Familiar acquisition`);
    h.run(48);
    assert(h.ringProgress > 0, `${targetKind} did not begin fill after Familiar acquisition`);
    while (h.clicks===0 && h.now < start+5000) h.frame();
    assert.equal(h.clicks, 1, `${targetKind} did not select`);
    const selectionMs = h.now-start;
    assert(selectionMs >= 350+fillMs-32 && selectionMs <= 350+fillMs+64,
      `${targetKind} selected in ${selectionMs} ms, expected about ${350+fillMs}`);
  }
});
test('Familiar leaves Delete Word and non-keyboard navigation at Standard timing', () => {
  for (const [screen,targetKind] of [['keyboard','special'],['home','key']]) {
    const elapsed = feel => {
      const h=cursorHarness(768,{keyboardFeel:feel},{keyboardCadence:true},null,{screen,targetKind});
      const start=h.now;
      while(h.clicks===0&&h.now<start+6000)h.frame();
      assert.equal(h.clicks,1);
      return h.now-start;
    };
    assert.equal(elapsed('familiar'),elapsed('standard'), `${screen}/${targetKind} timing changed`);
  }
});
test('Familiar resumes a recent keyboard dwell but starts fresh after its 750 ms window', () => {
  const on = {x:.5,y:.5,intent_x:.5,intent_y:.5};
  const away = {x:.1,y:.1,intent_x:.1,intent_y:.1};
  const recent = cursorHarness(768,{keyboardFeel:'familiar'},{keyboardCadence:true},null,{screen:'keyboard'});
  recent.run(350+900,true,on);
  assert(recent.ringProgress>0.4);
  recent.run(400,true,away);
  assert.equal(recent.clicks,0);
  recent.run(80,true,on);
  assert(recent.interrupts.includes('resumed'), 'recent keyboard dwell should resume without a new onset');
  assert(recent.ringProgress>0.4);

  const expired = cursorHarness(768,{keyboardFeel:'familiar'},{keyboardCadence:true},null,{screen:'keyboard'});
  expired.run(350+900,true,on);
  assert(expired.ringProgress>0.4);
  expired.run(960,true,away); // Long enough after either target-loss or lock-break save.
  assert.equal(expired.clicks,0);
  const returnAt=expired.now;
  expired.run(96,true,on);
  assert.equal(expired.interrupts.includes('resumed'),false,'expired keyboard progress was resumed');
  assert.equal(expired.ringProgress,0,'expired keyboard progress bypassed acquisition');
  while(expired.clicks===0&&expired.now<returnAt+5000)expired.frame(16,true,on);
  assert.equal(expired.clicks,1);
  assert(expired.now-returnAt>=350+1750-32,'expired progress shortened the new selection');
});
// The target the eyes are on (utils/gazeFocus): decided on the gaze estimate
// with hysteresis, so tracker noise at a border never moves the bubble.
const A = { left: 100, top: 100, width: 180, height: 170 }, B = { left: 290, top: 100, width: 180, height: 170 };
function focusDriver() {
  const f = new focus.GazeFocus();
  const up = (cand, x, y, t, extra = {}) => f.update(cand, { x, y }, t, { rectOf: r => r, viewport: { width: 1920, height: 1080 }, ...extra });
  return { f, up };
}
test('a target takes the focus on its second sample, and the onset is credited from the first', () => {
  const { f, up } = focusDriver();
  assert.equal(up(A, 150, 150, 1000), false);
  assert.equal(f.current, null); assert.equal(f.acquiring, true);          // Proposed, not shown.
  assert.equal(up(A, 152, 151, 1030), true);
  assert.equal(f.current, A); assert.equal(f.since, 1000); assert.equal(f.acquiredAt, 1030);
  const g = focusDriver();                                                // A one-sample flash is never acquired.
  g.up(A, 150, 150, 1000); g.up(null, 900, 900, 1030); g.up(null, 900, 900, 1060);
  assert.equal(g.f.current, null); assert.equal(g.f.acquiring, false);
});
test('noise across a border keeps the focused target; a real move leaves at once and switches on the next sample', () => {
  const { f, up } = focusDriver();
  up(A, 150, 150, 1000); up(A, 150, 150, 1030);
  const edge = A.left + A.width;                                          // 280: B starts 10 px on.
  for (let t = 1060; t < 1400; t += 30) up(B, edge + focus.EXIT_MARGIN_PX - 1, 150, t);
  assert.equal(f.current, A); assert.equal(f.leaving, false);            // Inside the exit margin: held.
  up(B, edge + focus.EXIT_MARGIN_PX + 5, 150, 1400);
  assert.equal(f.leaving, true); assert.equal(f.current, A);             // Leaving: nothing dwells now...
  up(B, edge + focus.EXIT_MARGIN_PX + 6, 150, 1430);
  assert.equal(f.current, B); assert.equal(f.since, 1400);               // ...and B on its second sample.
  up(A, 200, 150, 1460); up(B, 380, 150, 1490);                           // One sample back is not a return.
  assert.equal(f.current, B); assert.equal(f.leaving, false);
});
test('with nothing under the gaze the target is kept within the sticky margin, then released after RELEASE_MS', () => {
  const { f, up } = focusDriver();
  up(B, 380, 150, 1000); up(B, 380, 150, 1030);
  up(null, 380, B.top + B.height + focus.STICKY_MARGIN_PX - 1, 1060);
  assert.equal(f.current, B); assert.equal(f.leaving, false);
  let t = 1090; up(null, 380, 700, t);
  assert.equal(f.leaving, true);
  while (t + 30 < 1090 + focus.RELEASE_MS) { t += 30; up(null, 380, 700, t); }
  assert.equal(f.current, B, 'released too early');
  up(null, 380, 700, 1090 + focus.RELEASE_MS);
  assert.equal(f.current, null); assert.equal(f.acquiring, false);
});
test('a locked dwell owns the focus; once its lock breaks the focus has no hysteresis', () => {
  const { f, up } = focusDriver();
  up(A, 150, 150, 1000); up(A, 150, 150, 1030);
  for (let t = 1060; t < 1300; t += 30) up(B, 400, 150, t, { hold: true });
  assert.equal(f.current, A); assert.equal(f.leaving, false);            // Held whatever the estimate says.
  f.leave();
  up(B, A.left + A.width + 5, 150, 1300);                                  // Inside A's margin, yet leaving:
  assert.equal(f.leaving, true);
  up(B, A.left + A.width + 5, 150, 1330);
  assert.equal(f.current, B);
  const g = focusDriver();                                                // And a false break (still on A) keeps A.
  g.up(A, 150, 150, 1000); g.up(A, 150, 150, 1030); g.f.leave(); g.up(A, 151, 150, 1060);
  assert.equal(g.f.current, A); assert.equal(g.f.leaving, false);
});
test('a focused target that goes away loses the focus at once', () => {
  const { f, up } = focusDriver();
  up(A, 150, 150, 1000); up(A, 150, 150, 1030);
  f.update(null, { x: 150, y: 150 }, 1060, { rectOf: () => null });
  assert.equal(f.current, null);
});
test('the bubble glides to its goal in one smooth move, never overshoots and comes to rest exactly', () => {
  const m = new focus.BubbleMotion();
  m.step({ x: 100, y: 200 }, 16);
  assert.deepEqual([m.x, m.y], [100, 200]);                               // First sight: placed, no glide.
  const xs = [];
  for (let i = 0; i < 40; i++) xs.push(m.step({ x: 400, y: 200 }, 16).x);
  const steps = xs.map((x, i) => x - (i ? xs[i - 1] : 100));
  assert(steps.every(d => d >= 0), 'moved backwards');
  assert(xs.every(x => x <= 400), 'overshot');
  const peak = steps.indexOf(Math.max(...steps));                          // Speeds up, then slows down.
  assert(steps.slice(0, peak + 1).every((d, i) => i === 0 || d >= steps[i - 1] - 1e-9));
  assert(steps.slice(peak).every((d, i, a) => i === 0 || d <= a[i - 1] + 1e-9));
  const arrived = 16 * (xs.findIndex(x => 400 - x < 12) + 1);
  assert(arrived <= 120, `within 12 px after ${arrived} ms`);
  assert.equal(m.x, 400); assert.equal(m.moving, false);                  // At rest exactly: no creep.
  const s = new focus.BubbleMotion(); s.place({ x: 0, y: 0 });             // A stalled frame is not a jump.
  const q = s.step({ x: 1000, y: 0 }, 600);
  assert(q.x > 0 && q.x < 970, `advanced to ${q.x.toFixed(0)} in one stalled frame`);
});
test('progress is banked per target, the strongest kept, and only while it is fresh', () => {
  const b = new bank.DwellProgressBank();
  const a = { isConnected: true }, c = { isConnected: true };
  b.save(a, 0.4, 1000); b.save(c, 0.2, 1000);
  assert.equal(b.peek(a, 1200), 0.4);
  assert.equal(b.peek(a, 1200), 0.4);                                     // Looking does not spend it.
  b.save(a, 0.3, 1300); assert.equal(b.peek(a, 1300), 0.4);              // Never lowered.
  assert.equal(b.take(a, 1300), 0.4);
  assert.equal(b.peek(a, 1300), null);                                    // Handed over once only.
  assert.equal(b.peek(c, 1000 + bank.BANK_TTL_MS), null);                // A second away and it is gone.
  b.clear();
  b.save(a, 0, 2000); b.save(a, 1, 2000); b.save(null, 0.5, 2000);
  assert.equal(b.size, 0, 'nothing to bank was banked');                  // Empty and finished rings: nothing.
  b.save(a, 0.5, 3000); a.isConnected = false;
  assert.equal(b.peek(a, 3000), null, 'a target that left the screen was kept');
  b.clear();
  for (let i = 0; i < 20; i++) b.save({ isConnected: true }, 0.5, 4000 + i);
  assert.equal(b.size, bank.BANK_MAX_ENTRIES, 'a scan across the screen filled the bank');
  b.clear(); assert.equal(b.size, 0);
});
test('Familiar keyboard bank entries expire at 750 ms without shortening Standard entries', () => {
  const b = new bank.DwellProgressBank();
  const familiar = {isConnected:true}, standard = {isConnected:true};
  b.save(familiar, 0.6, 1000, dwell.FAMILIAR_KEYBOARD_TIMING.incompleteTtl);
  b.save(standard, 0.6, 1000);
  assert.equal(b.peek(familiar, 1749), 0.6);
  assert.equal(b.peek(familiar, 1750), null);
  assert.equal(b.peek(standard, 1750), 0.6);
  assert.equal(b.peek(standard, 2000), null);
});
test('a filling ring holds its target through a wider zone and a longer look at a neighbour', () => {
  assert.equal(focus.commitmentRamp(undefined), 0);
  assert.equal(focus.commitmentRamp(focus.COMMIT_FROM), 0);              // Below it: exactly as before.
  assert.equal(focus.commitmentRamp(1), 1);
  assert(focus.commitmentRamp(0.7) > 0 && focus.commitmentRamp(0.7) < 1);
  const edge = A.left + A.width;                                          // 280: B starts 10 px on.
  const full = { commitment: 0.98 };
  const { f, up } = focusDriver();
  up(A, 150, 150, 1000); up(A, 150, 150, 1030);
  for (let t = 1060; t < 1500; t += 30) up(B, edge + focus.EXIT_MARGIN_PX + 20, 150, t, full);
  assert.equal(f.current, A, 'a nearly full ring was lost inside the wider keep-zone');
  let t = 1500;                                                           // Past the wider zone as well:
  up(B, edge + focus.COMMIT_EXIT_MARGIN_PX + 5, 150, t, full);
  assert.equal(f.leaving, true);
  while (t + 30 < 1500 + focus.COMMIT_CONFIRM_MS) { t += 30; up(B, edge + focus.COMMIT_EXIT_MARGIN_PX + 5, 150, t, full); }
  assert.equal(f.current, A, 'switched before the neighbour had held the gaze');
  up(B, edge + focus.COMMIT_EXIT_MARGIN_PX + 5, 150, 1500 + focus.COMMIT_CONFIRM_MS, full);
  assert.equal(f.current, B, 'a real move to the neighbour never arrived');
  const g = focusDriver();                                                // An empty ring keeps the old margin.
  g.up(A, 150, 150, 1000); g.up(A, 150, 150, 1030);
  g.up(B, edge + focus.EXIT_MARGIN_PX + 20, 150, 1060, { commitment: 0 });
  g.up(B, edge + focus.EXIT_MARGIN_PX + 20, 150, 1090, { commitment: 0 });
  assert.equal(g.f.current, B);
});
test('the free bubble holds still through fixation noise and follows only a lasting move', () => {
  const a = new focus.FreeAnchor();
  a.update({ x: 500, y: 500 }, 0);
  for (let t = 30; t <= 900; t += 30) a.update({ x: 500 + ((t / 30) % 2 ? 20 : -20), y: 500 + ((t / 30) % 3) * 7 - 7 }, t);
  assert.deepEqual([a.point.x, a.point.y], [500, 500]);
  a.update({ x: 580, y: 500 }, 930);
  a.update({ x: 580, y: 500 }, 930 + focus.FREE_MOVE_MS - 1);
  assert.equal(a.point.x, 500);
  a.update({ x: 580, y: 500 }, 930 + focus.FREE_MOVE_MS);
  assert.equal(a.point.x, 580);
});
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
  test(`hiding the roaming cursor changes no selection rule at ${height}px`,()=>{
    // Display-only preference: same onset, dwell, loss and stall behaviour.
    const hidden={showGazeCursor:false};
    const h=cursorHarness(height,hidden);h.run(5000,false);assert.equal(h.clicks,0);
    h.run(dwell.DWELL_GROUPS.navigation.ms + 300);assert.equal(h.clicks,1);
    const lost=cursorHarness(height,hidden);lost.run(dwell.DWELL_GROUPS.navigation.ms + 100);assert.equal(lost.clicks,0);
    lost.lose();lost.run(500,false);assert.equal(lost.clicks,0);lost.run(400);assert.equal(lost.clicks,1);
    const stalled=cursorHarness(height,hidden);stalled.run(dwell.DWELL_GROUPS.navigation.ms + 100);stalled.frame(5000,true);assert.equal(stalled.clicks,0);
    const off=cursorHarness(height,hidden);off.run(dwell.DWELL_GROUPS.navigation.ms + 100);off.target.disabled=true;off.run(500);assert.equal(off.clicks,0);
  });
  test(`a physical press abandons the dwell and one intention presses once at ${height}px`,()=>{
    const dwellMs=dwell.DWELL_GROUPS.navigation.ms;
    // Eyes on the control, hand on the mouse: the press lands mid-dwell.
    const h=cursorHarness(height);h.run(250+dwellMs*0.6);assert.equal(h.clicks,0);
    h.pointerDown();assert.equal(h.physicalClick(),false);   // The caregiver's own click goes through...
    h.run(dwellMs);assert.equal(h.clicks,0);                 // ...and the dwell it interrupted never fires as well.
    h.run(3000);assert.equal(h.clicks,1);                    // After the cooldown a fresh, full dwell still selects.
    // Gaze got there first: a physical click on that control straight afterwards is the same intention.
    const g=cursorHarness(height);g.run(dwellMs+400);assert.equal(g.clicks,1);
    assert.equal(g.physicalClick(),true);
    assert.equal(g.physicalClick({contains:()=>false}),false);   // A different control is not swallowed,
    g.frame(600,false);assert.equal(g.physicalClick(),false);    // nor the same one once the window has passed.
    // A gaze press is programmatic and must never cancel itself or be swallowed.
    const p=cursorHarness(height);p.run(250+dwellMs*0.6);p.pointerDown(false);p.run(dwellMs*0.5+100);assert.equal(p.clicks,1);
    assert.equal(p.physicalClick(p.target,false),false);
  });
  test(`disabled targets cannot commit at ${height}px`,()=>{
    const h=cursorHarness(height);h.run(dwell.DWELL_GROUPS.navigation.ms + 100);h.target.disabled=true;h.run(500);assert.equal(h.clicks,0);
  });
  // The raw stream flashes somewhere and straight back (one or two samples) far
  // more often than the eyes move; a locked selection must survive that.
  const flash={intent_x:.95};                 // Raw sample far off the button; the estimate did not follow.
  const away={x:.95,intent_x:.95};            // The eyes really went elsewhere.
  test(`a one- or two-sample raw flash does not break a locked selection at ${height}px`,()=>{
    const dwellMs=dwell.DWELL_GROUPS.navigation.ms;
    const h=cursorHarness(height);h.run(300+dwellMs*0.5);assert.equal(h.clicks,0);   // Locked, half way.
    h.frame(16,true,flash);h.frame(16,true,flash);                                  // Two wild samples...
    h.run(dwellMs*0.5+150);
    assert.equal(h.clicks,1);                                                       // ...the same selection completes once,
    assert.deepEqual(h.interrupts,[]);                                              // and was never broken or resumed.
    const late=cursorHarness(height);late.run(250+dwellMs*0.95);assert.equal(late.clicks,0);
    late.frame(16,true,flash);late.run(200);assert.equal(late.clicks,1);assert.deepEqual(late.interrupts,[]);
  });
  test(`looking away stops a locked selection at the first sample and cancels it at ${height}px`,()=>{
    const dwellMs=dwell.DWELL_GROUPS.navigation.ms;
    // Moments before it would complete, the eyes leave. While the look-away is
    // still being confirmed the ring must not fill, or waiting would complete it.
    const h=cursorHarness(height);h.run(250+dwellMs-20);assert.equal(h.clicks,0);
    for(let i=0;i<4;i++)h.frame(14,true,away);                                     // 0-42 ms after leaving: pending.
    assert.equal(h.clicks,0);
    h.run(400,true,away);assert.equal(h.clicks,0);                                 // Confirmed: cancelled, not completed.
    assert(h.interrupts.includes('lock_break'));
    h.run(1500,true,away);assert.equal(h.clicks,0);                                // Staying away never selects it.
  });
  // A large Home/Alert-style card, gaze resting well away from its centre.
  const card = { left: 700, top: height / 2 - 150, width: 520, height: 300 };
  const g = { x: 800, y: height / 2 - 90 };
  const gazeAt = (p) => ({ x: p.x / 1920, y: p.y / height, intent_x: p.x / 1920, intent_y: p.y / height });
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  // Gaze resting well away from the centre, with tracker-like noise.
  const noisyAt = (p) => { let k = 0; return () => { k++; return gazeAt({ x: p.x + ((k * 7) % 23) - 11, y: p.y + ((k * 5) % 17) - 8 }); }; };
  test(`the bubble first shows at the centre of the card the eyes are on and holds still there at ${height}px`,()=>{
    const h=cursorHarness(height,{},{},card);const c=centre(card);const next=noisyAt(g);
    h.frame(16,true,next());
    assert.equal(h.drawn.length,0,'drawn before the card was decided');         // No flash at the landing point.
    let n=0;while(h.clicks===0&&n++<400)h.frame(16,true,next());
    assert.equal(h.clicks,1);
    const off=h.drawn.map(p=>Math.hypot(p.x-c.x,p.y-c.y));
    assert(off.length>0&&Math.max(...off)<0.5,`bubble left the centre by ${Math.max(...off).toFixed(1)} px`);
    assert.equal(h.hidden,false);
  });
  const cardA = { left: 160, top: height / 2 - 150, width: 520, height: 300 };
  const cardB = { left: 1240, top: height / 2 - 150, width: 520, height: 300 };
  test(`moving on to another card glides centre to centre in one move at ${height}px`,()=>{
    const dwellMs=dwell.DWELL_GROUPS.navigation.ms;
    const h=cursorHarness(height,{},{},cardA,{others:[cardB]});const a=centre(cardA),b=centre(cardB);
    h.run(250+dwellMs*0.5,true,gazeAt({x:260,y:height/2-100}));                  // Half way through a dwell on A...
    assert(h.ringProgress>0.3);
    const from=h.drawn.length;
    h.run(160,true,gazeAt({x:1300,y:height/2+110}));                             // ...the eyes go to a corner of B:
    assert.equal(h.ringProgress,0);                                              // A's half-filled ring stays behind.
    h.run(440,true,gazeAt({x:1300,y:height/2+110}));
    const path=h.drawn.slice(from);
    assert(path.length>2,'the bubble did not move');
    assert(path.every(p=>Math.abs(p.y-a.y)<0.5),'left the line between the two centres');
    assert(path.every((p,i)=>i===0||p.x>=path[i-1].x-1e-9),'went back and forth');
    assert.deepEqual([h.cursor.x,h.cursor.y],[b.x,b.y]);                         // Rests exactly on B's centre.
    assert.equal(h.clicks,0);
    h.run(250+dwellMs+100,true,gazeAt({x:1300,y:height/2+110}));
    assert.deepEqual(h.clickLog,['other-0']);                                    // B is what gets selected.
  });
  test(`with gaze selection off the bubble does not settle on an ordinary control at ${height}px`,()=>{
    const h=cursorHarness(height,{},{},card,{gazeEnabled:false});
    h.run(600,true,gazeAt(g));
    assert.deepEqual([h.cursor.x,h.cursor.y],[g.x,g.y]);                         // It rests at the gaze instead,
    h.run(3000,true,gazeAt(g));assert.equal(h.clicks,0);                          // and nothing is selected.
  });
  test(`deciding the target first does not lengthen the time to select at ${height}px`,()=>{
    const dwellMs=dwell.DWELL_GROUPS.navigation.ms;
    const h=cursorHarness(height,{},{},card);h.run(400,false);
    const t0=h.now+16;
    while(h.clicks===0&&h.now<t0+5000)h.frame(16,true,gazeAt(g));
    const took=h.clicks===1?h.now-t0:Infinity;
    assert(took<=250+dwellMs+32,`first sample to selection ${took} ms (onset 250 + dwell ${dwellMs})`);
    assert(took>=250+dwellMs-16,`selected early: ${took} ms`);
  });
  test(`without gaze the bubble hides, and it comes back directly at the next target's centre at ${height}px`,()=>{
    const h=cursorHarness(height,{},{},cardA,{others:[cardB]});const b=centre(cardB);
    h.run(300,true,gazeAt({x:260,y:height/2-100}));
    assert.equal(h.hidden,false);
    h.lose();h.run(1200,false);assert.equal(h.hidden,true);                      // A second without gaze: hidden.
    const from=h.drawn.length;
    h.run(300,true,gazeAt({x:1300,y:height/2+110}));
    const back=h.drawn.slice(from);
    assert(back.length>=1);
    assert.deepEqual([back[0].x,back[0].y],[b.x,b.y]);                           // No glide from the stale spot.
    assert.equal(h.hidden,false);
  });
  test(`looking elsewhere mid-dwell does not carry the half-filled ring along at ${height}px`,()=>{
    const dwellMs=dwell.DWELL_GROUPS.navigation.ms;
    const h=cursorHarness(height,{showGazeCursor:false},{},card);
    h.run(250+dwellMs*0.5,true,gazeAt(g));assert(h.ringProgress>0.3);
    for(let i=0;i<4;i++)h.frame(30,true,gazeAt({x:1750,y:height/2}));              // Eyes to another card.
    assert(h.interrupts.includes('lock_break'));
    assert.equal(h.ringProgress,0);assert.equal(h.highlight,null);                  // Ring and highlight gone...
    h.run(300,true,gazeAt(g));assert(h.interrupts.includes('resumed'));             // ...progress kept for a return.
    assert(h.ringProgress>0.3,`resumed at ${h.ringProgress.toFixed(2)}, not from zero`);
    h.run(dwellMs*0.6,true,gazeAt(g));assert.equal(h.clicks,1);
  });
  test(`a glance at the neighbouring card no longer costs the ring at ${height}px`,()=>{
    // His keyboard is the reason: the space bar is 124 px tall with letters 9 px
    // above and suggestions 2 px below, and rings were cancelled at 96 % (22 Sep).
    const dwellMs=dwell.DWELL_GROUPS.navigation.ms;
    const h=cursorHarness(height,{},{},cardA,{others:[cardB]});
    const on={x:260,y:height/2-100},over={x:1300,y:height/2+110};
    h.run(250+dwellMs*0.6,true,gazeAt(on));
    const reached=h.ringProgress;assert(reached>0.4,`only reached ${reached}`);
    h.run(160,true,gazeAt(over));                                                  // The eyes touch the other card:
    assert.equal(h.ringProgress,0);                                                // its ring is not carried over...
    h.run(120,true,gazeAt(on));                                                    // ...and coming straight back
    assert(h.interrupts.includes('resumed'));
    assert(h.ringProgress>=reached,`came back at ${h.ringProgress.toFixed(2)}, not ${reached.toFixed(2)}`);
    h.run(dwellMs*0.5,true,gazeAt(on));
    assert.deepEqual(h.clickLog,['test-button']);                                  // continues to the selection wanted.
  });
  test(`nothing carries over from one selection to the next at ${height}px`,()=>{
    const dwellMs=dwell.DWELL_GROUPS.navigation.ms;
    const h=cursorHarness(height,{},{},cardA,{others:[cardB]});
    const on={x:260,y:height/2-100},over={x:1300,y:height/2+110};
    h.run(250+dwellMs*0.6,true,gazeAt(on));assert(h.ringProgress>0.4);
    while(h.clicks===0&&h.now<30000)h.frame(16,true,gazeAt(over));                 // The other card is selected.
    assert.deepEqual(h.clickLog,['other-0']);
    const after=h.interrupts.length;
    let guard=0;while(h.ringProgress===0&&guard++<600)h.frame(16,true,gazeAt(on)); // Back to the first card:
    assert(h.ringProgress<0.15,`started at ${h.ringProgress.toFixed(2)}, not from nothing`);
    assert.equal(h.interrupts.slice(after).includes('resumed'),false);
  });
  test(`progress older than a second is not resumed, and no ring fills while the eyes are away at ${height}px`,()=>{
    const dwellMs=dwell.DWELL_GROUPS.navigation.ms;
    const h=cursorHarness(height,{},{},card);
    h.run(250+dwellMs*0.5,true,gazeAt(g));assert(h.ringProgress>0.3);
    const before=h.interrupts.length;
    h.run(1400,true,gazeAt({x:1700,y:g.y}));                                       // Away, longer than the bank keeps it.
    assert.equal(h.ringProgress,0);assert.equal(h.clicks,0);
    const t0=h.now;
    while(h.clicks===0&&h.now<t0+6000)h.frame(16,true,gazeAt(g));
    assert.equal(h.clicks,1);
    assert(h.now-t0>=250+dwellMs-32,`stale progress was resumed: ${h.now-t0} ms`); // A full onset and dwell again.
    assert.equal(h.interrupts.slice(before).includes('resumed'),false);
  });
  test(`after a selection the bubble stays on the card through drift, and a real move leaves in one glide at ${height}px`,()=>{
    const dwellMs=dwell.DWELL_GROUPS.navigation.ms;const c=centre(card);
    const h=cursorHarness(height,{},{},card);
    while(h.clicks===0&&h.now<20000)h.frame(16,true,gazeAt(g));
    h.run(400,true,gazeAt({x:g.x+30,y:g.y+20}));                                  // Drift on the card: no motion.
    assert.deepEqual([h.cursor.x,h.cursor.y],[c.x,c.y]);
    const from=h.drawn.length;
    h.run(700,true,gazeAt({x:1700,y:g.y}));                                        // Eyes to empty space.
    const path=h.drawn.slice(from);
    assert(path.every((p,i)=>i===0||p.x>=path[i-1].x-1e-9),'went back and forth');
    assert.deepEqual([h.cursor.x,h.cursor.y],[1700,g.y]);                          // One glide, resting where the eyes are.
    assert.equal(h.clicks,1);
  });
  test(`reading across a large card keeps the bubble at its centre and still selects once at ${height}px`,()=>{
    dwell.setDwellTimingSet('relaxed');
    try{
      const dwellMs=dwell.DWELL_GROUPS.navigation.ms;const c=centre(card);
      const h=cursorHarness(height,{},{},card);
      h.run(250+dwellMs*0.4,true,gazeAt(g));
      h.run(400,true,gazeAt({x:g.x+300,y:g.y+120}));                                // Another part of the same card.
      assert(h.drawn.every(p=>Math.hypot(p.x-c.x,p.y-c.y)<0.5),'the bubble followed the eyes across the card');
      assert.deepEqual(h.interrupts,[]);assert.equal(h.clicks,0);
      h.run(dwellMs*0.6,true,gazeAt({x:g.x+300,y:g.y+120}));assert.equal(h.clicks,1);
    }finally{dwell.setDwellTimingSet('balanced');}
  });
  test(`lockBreakConfirm=false restores the one-sample lock break at ${height}px`,()=>{
    const dwellMs=dwell.DWELL_GROUPS.navigation.ms;
    const h=cursorHarness(height,{},{lockBreakConfirm:false});h.run(300+dwellMs*0.5);
    h.frame(16,true,flash);                                                        // The first wild sample breaks the lock
    assert.deepEqual(h.interrupts,['lock_break','resumed']);                       // and it is resumed a frame later, as before.
    h.run(dwellMs*0.5+300);assert.equal(h.clicks,1);
  });
}
console.log(`${tests} gaze safety regressions passed (virtual clock/DOM; not a hardware or visual layout test).`);
