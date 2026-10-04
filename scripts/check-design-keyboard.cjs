/** Keyboard design regression: only paint may change. Requires a running Vite UI.
 * Isolated browser profiles and a prediction fixture; no user settings/backend are changed.
 */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const gazeProbe = require('./design-gaze-probe.cjs')(path.resolve(__dirname,'..'));
const OUT = process.env.KEYBOARD_QA_OUTPUT;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true });
    const p = await browser.newPage();
    p.setDefaultTimeout(7000);
    const errors = [], rows = [];
    let populated = false, comparisons = 0;
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => {
        const fixture = JSON.parse(sessionStorage.getItem('qa-boot') || 'null');
        if (fixture) {
            // Seed before React mounts: changing storage during a live mount can be
            // overwritten by ThemeProvider's first effect and silently test Dark twice.
            localStorage.clear(); localStorage.setItem('gc-theme', fixture.theme);
            sessionStorage.clear(); sessionStorage.setItem('qa-boot', JSON.stringify(fixture));
            sessionStorage.setItem('qa-profile', JSON.stringify({ version: 1, settings: { keyboardFeel: fixture.feel } }));
        }
        speechSynthesis.speak = () => {};
        window.electronAPI = { on: () => () => {}, off: () => {}, settings: {
            load: async () => JSON.parse(sessionStorage.getItem('qa-profile') || 'null'),
            save: async d => { sessionStorage.setItem('qa-profile', JSON.stringify(d)); return { success: true }; },
        } };
    });
    await p.routeWebSocket('ws://127.0.0.1:8765', ws => {
        ws.onMessage(raw => {
            const m = JSON.parse(raw);
            if (m.type === 'set_screen') ws.send(JSON.stringify({type:'screen_changed',screen:m.screen}));
            if (m.type === 'set_gaze_enabled') ws.send(JSON.stringify({type:'gaze_enabled',enabled:m.enabled}));
            if (m.type === 'get_predictions') ws.send(JSON.stringify({
                type: 'predictions', request_id: m.request_id,
                prediction: { text: m.text, prefix: m.text.match(/[a-z]+$/i)?.[0] || '' },
                word_slots: populated ? ['please', 'water', 'help', 'thank', 'you', 'good', 'morning', 'comfortable', 'today', 'yes'] : [],
                sentences: populated ? [{ text: 'Thank you', score: 1, source: 'qa', mode: 'append' }] : [],
            }));
        });
    });
    async function settle() {
        await p.mouse.move(0, 0);
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(220);
    }
    async function geometry() {
        return p.evaluate(() => [...document.querySelectorAll('.keyboard-screen,.keyboard-screen *')]
            .filter(e => !e.closest('.nav-bar-container') && e.tagName !== 'STYLE' && e.getBoundingClientRect().width)
            .map(e => {
                const r = e.getBoundingClientRect(), s = getComputedStyle(e);
                return { id: e.id, tag: e.tagName, class: e.getAttribute('class'), text: e.childElementCount ? '' : e.textContent,
                    rect: [r.x, r.y, r.width, r.height],
                    style: ['fontFamily','fontSize','fontWeight','fontStretch','fontStyle','lineHeight','letterSpacing','textTransform',
                        'borderRadius','borderWidth','padding','margin','gap','transform','overflow','opacity'].map(k => s[k]),
                    gaze: ['data-gaze','data-gaze-context','data-gaze-dwell-ms','disabled'].map(k => e.getAttribute(k)) };
            }));
    }
    async function paint() {
        return p.evaluate(() => {
            const screen = document.querySelector('.keyboard-screen');
            const normalize = value => {
                const e = document.createElement('span'); e.style.color = value;
                screen.append(e); const c = getComputedStyle(e).color; e.remove(); return c;
            };
            const token = name => normalize(getComputedStyle(screen).getPropertyValue('--design-' + name));
            const contracts = [
                ['.keyboard-screen', 'page'], ['.keyboard-letter-panel', 'page'], ['.keyboard-prediction-bar', 'page'],
                ['.keyboard-message', 'panel'], ['.keyboard-key[data-action="letter"]', 'card'],
                ['.keyboard-key[data-action="space"]', 'card'], ['.keyboard-key:not([data-action])', 'card'],
                ['.keyboard-key[data-action="shift"]', 'panel'], ['.keyboard-key[data-action="quickWords"]', 'selected'],
                ['.keyboard-key[data-action="backspace"]', 'danger-bg'], ['.keyboard-key[data-action="deleteWord"]', 'danger-bg'],
                ['.keyboard-word-slot', 'panel'], ['.keyboard-phrase-slot', 'panel'], ['.keyboard-word-slot-best', 'selected'],
                ['.message-display-action:not(.message-display-speak)', 'card'], ['.message-display-speak', 'selected'],
                ['#nav-restore-btn', 'selected'], ['#close-expanded-display', 'panel'], ['.keyboard-gaze-hub', 'panel'],
            ];
            const mismatches = [];
            for (const [selector, role] of contracts) {
                for (const e of document.querySelectorAll(selector)) {
                    if (!screen.contains(e) && e !== screen) continue;
                    if (selector === '.keyboard-word-slot' && e.classList.contains('keyboard-word-slot-best')) continue;
                    const s = getComputedStyle(e);
                    if (s.backgroundColor !== token(role) || s.backgroundImage !== 'none')
                        mismatches.push({ selector, actual: s.backgroundColor, image: s.backgroundImage, expected: token(role) });
                }
            }
            for (const [selector,role] of [
                ['.keyboard-word-slot-label','ink'], ['.keyboard-phrase-slot span','ink'],
                ['.keyboard-message-text','ink'], ['.message-display-speak .message-action-content','accent'],
                ['.message-display-action:not(.message-display-speak) .message-action-content','muted'],
            ]) for (const e of screen.querySelectorAll(selector)) {
                if (getComputedStyle(e).color !== token(role))
                    mismatches.push({selector,actual:getComputedStyle(e).color,expected:token(role)});
            }
            const rgba = s => { const c = s.match(/[\d.]+/g).map(Number); return [c[0],c[1],c[2],c[3] ?? 1]; };
            const over = (f,b) => [0,1,2].map(i => f[i]*f[3]+b[i]*(1-f[3])).concat(1);
            const background = e => {
                const chain = []; for (let n=e;n;n=n.parentElement) chain.push(n);
                return chain.reverse().reduce((b,n) => over(rgba(getComputedStyle(n).backgroundColor),b), [255,255,255,1]);
            };
            const luminance = c => c.slice(0,3).map(v => v/255).map(v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4)
                .reduce((l,v,i) => l+v*[.2126,.7152,.0722][i],0);
            const contrast = (a,b) => { const x=luminance(a),y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
            const text = [], walker = document.createTreeWalker(screen, NodeFilter.SHOW_TEXT);
            let n;
            while (n = walker.nextNode()) {
                const e = n.parentElement;
                if (!n.textContent.trim() || e.tagName === 'STYLE' || e.closest('.nav-bar-container,:disabled')) continue;
                if (!e.getBoundingClientRect().width) continue;
                const bg = background(e), fg = over(rgba(getComputedStyle(e).color), bg);
                text.push({ text: n.textContent.trim(), ratio: contrast(fg,bg) });
            }
            return { mismatches, text };
        });
    }
    async function check(state, context) {
        await p.evaluate(() => document.documentElement.removeAttribute('data-design'));
        await settle();
        const before = await geometry();
        // Completed-key acknowledgement must retain its original background and outline.
        async function confirmation() {
            return p.evaluate(() => {
                const key = document.querySelector('.keyboard-key[data-action="letter"]');
                if (!key) return null;
                const transition = key.style.transition;
                key.style.transition = 'none';
                key.setAttribute('data-keyboard-confirmed', 'true');
                const s=getComputedStyle(key), out=[s.backgroundColor,s.outlineColor,s.outlineWidth,s.outlineOffset];
                key.removeAttribute('data-keyboard-confirmed');
                getComputedStyle(key).backgroundColor;
                key.style.transition = transition;
                return out;
            });
        }
        const feedbackBefore = await confirmation();
        for (const mode of ['focus','serene']) {
            await p.evaluate(mode => document.documentElement.dataset.design=mode, mode);
            await settle();
            const after=await geometry();
            assert.deepEqual(after, before, JSON.stringify({ ...context, state, mode, failure: 'geometry, type or gaze attributes changed' }));
            comparisons += after.length;
            assert.deepEqual(await confirmation(), feedbackBefore, 'completed-key feedback must remain unchanged');
            await settle();
            const targeting = await p.evaluate(gazeProbe);
            assert.deepEqual(targeting.misses, [], JSON.stringify({ ...context, state, mode, failure:'gaze target ownership' }));
            const colours=await paint();
            assert.deepEqual(colours.mismatches, [], JSON.stringify({ ...context, state, mode }));
            assert.deepEqual(colours.text.filter(t => t.ratio < 4.5), [], JSON.stringify({ ...context, state, mode, failure: 'text contrast' }));
            rows.push({ ...context, state, mode, elements: after.length, targeting, minimumContrast: Math.min(...colours.text.map(t => t.ratio)) });
            if (OUT && state === 'full-populated')
                await p.screenshot({ animations: 'disabled', path: path.join(OUT, `${context.width}-${context.theme}-${context.feel}-${mode}.png`) });
        }
    }
    for (const width of [1366,1920]) for (const theme of ['dark','warm','midnight-navy']) for (const feel of ['standard','familiar']) {
        populated=false;
        await p.setViewportSize({ width, height: width===1366 ? 768 : 1080 });
        await p.goto(process.env.DESIGN_QA_URL || 'http://127.0.0.1:5173');
        await p.evaluate(({theme,feel}) => {
            sessionStorage.setItem('qa-boot',JSON.stringify({theme,feel}));
        }, {theme,feel});
        await p.reload();
        await p.click('#kb');
        await p.locator('.keyboard-key').first().waitFor();
        assert.equal(await p.locator('html').getAttribute('data-theme'), theme);
        assert.equal(await p.locator('.keyboard-screen').getAttribute('data-keyboard-feel'), feel);
        const context={width,theme,feel};
        await check('full-empty',context);
        populated=true;
        for (const letter of ['h','i']) await p.locator('.keyboard-key[data-action="letter"]').filter({hasText:new RegExp('^'+letter+'$','i')}).click();
        await p.click('.keyboard-key[data-action="space"]');
        await p.locator('#word-slot-0').waitFor();
        await check('full-populated',context);
        await p.click('.keyboard-key[data-action="shift"]');
        await check('shift',context);
        await p.locator('.keyboard-key').filter({hasText:/^123$/}).click();
        await check('numbers',context);
        await p.locator('.keyboard-key').filter({hasText:/^ABC$/}).first().click();
        await p.click('#nav-restore-btn');
        await check('nav',context);
        await p.click('#display-expand-toggle');
        await check('expanded',context);
        console.log(width,theme,feel,'passed');
    }
    assert.deepEqual(errors, []);
    if (OUT) fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify({comparisons,rows,errors},null,2));
    await browser.close();
    console.log(`${comparisons} element comparisons: identical geometry, typography and gaze attributes; ${rows.length} keyboard states match their design colours, text >=4.5:1, completed-key feedback unchanged.`);
})().catch(e => { console.error(e); process.exit(1); });
