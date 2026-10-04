/** Extract the actual production target picker, not a reimplementation. Runs
 * against the browser's painted DOM. Never clicks or changes patient data. */
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
module.exports = root => {
    const source = ts.createSourceFile('cursor.tsx', fs.readFileSync(path.join(root,'src/components/core/GazeCursor.tsx'),'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const functions = ['topGazeElementAtPoint','isGazeTargetAvailable'];
    const callbacks = ['isGazeToggleElement','isAlwaysActiveElement','findClickableElement','pickCandidate'];
    const constants = ['SNAP_EDGE_REACH_PX','KEYBOARD_SNAP_MARGIN'];
    const found = new Map();
    function visit(n) {
        const name=n.name?.getText(source);
        if (ts.isFunctionDeclaration(n) && functions.includes(name)) found.set(name,n.getText(source));
        if (ts.isVariableDeclaration(n) && callbacks.includes(name)) found.set(name,`const ${name} = ${n.initializer.arguments[0].getText(source)};`);
        if (ts.isVariableDeclaration(n) && constants.includes(name)) found.set(name,`const ${n.getText(source)};`);
        ts.forEachChild(n,visit);
    }
    visit(source);
    const names=[...functions,...constants,...callbacks];
    for (const name of names) if (!found.has(name)) throw Error('Missing production picker dependency: '+name);
    const production = ts.transpileModule(names.map(n=>found.get(n)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
    return `(async () => {
        const {collectSnapTargets} = await import('/src/utils/gazeSnapping.ts');
        const {collectKeyboardKeys,distanceToRect,findBestKeyboardKey,isCloserTarget} = await import('/src/utils/hitZoneExpansion.ts');
        const {gazeFlags} = await import('/src/utils/gazeFlags.ts');
        const enabled=true, dwellTargetRef={current:null};
        // Inspect controls with gaze enabled, without toggling any runtime state.
        const off=[...document.querySelectorAll('[data-gaze="false"]')].filter(e=>!e.disabled && e.getAttribute('aria-disabled')!=='true');
        off.forEach(e=>e.setAttribute('data-gaze','true'));
        try {
            const isKeyboardScreenRef={current:!!document.querySelector('.keyboard-screen')};
            const keyboardKeysRef={current:collectKeyboardKeys()},snapTargetsRef={current:collectSnapTargets()};
            ${production}
            const result={targets:[],probes:0,misses:[],registration:[]};
            const registered=window.qaRegistrations?.at(-1)||[];
            for (const t of snapTargetsRef.current) {
                const e=t.element,r=e.getBoundingClientRect();
                if (!isGazeTargetAvailable(e)) continue;
                const attrs=Object.fromEntries([...e.attributes].filter(a=>a.name.startsWith('data-gaze')||a.name==='data-action').map(a=>[a.name,a.value]));
                result.targets.push({id:t.id,text:e.textContent.trim().replace(/\\s+/g,' '),x:r.x,y:r.y,w:r.width,h:r.height,attrs});
                // Nine points cover the interior including all four corners.
                for (const fx of [.1,.5,.9]) for (const fy of [.1,.5,.9]) {
                    const x=r.x+r.width*fx,y=r.y+r.height*fy;
                    const picked=pickCandidate(x,y).element;
                    result.probes++;
                    if(picked!==e) result.misses.push({id:t.id,at:[fx,fy],picked:picked?.id||picked?.textContent?.slice(0,40)||null});
                }
                // Only compare targets that are live, not temporarily armed above.
                if (!off.includes(e)) {
                    const got=registered.find(v=>v.id===t.id);
                    if(!got || Math.max(...[got.x-r.x-r.width/2,got.y-r.y-r.height/2,got.width-r.width,got.height-r.height].map(Math.abs))>1)
                        result.registration.push({id:t.id,expected:[r.x+r.width/2,r.y+r.height/2,r.width,r.height],actual:got||null});
                }
            }
            return result;
        } finally { off.forEach(e=>e.setAttribute('data-gaze','false')); }
    })()`;
};
