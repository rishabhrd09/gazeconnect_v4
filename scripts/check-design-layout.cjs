/** Browser layout regression audit. Start npm run dev first.
 * Uses an existing Playwright installation (or PLAYWRIGHT_MODULE) and its Chromium.
 * DESIGN_QA_WIDTHS / DESIGN_QA_MODES / DESIGN_QA_THEMES narrow a follow-up run.
 * Electron settings are held only in this isolated browser session; no user data is changed.
 */
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const OUT = process.env.DESIGN_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'gaze-design-'));
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.DESIGN_QA_URL || 'http://127.0.0.1:5173';
const choices = (name, fallback) => process.env[name]?.split(',') || fallback;
const BASELINE = process.env.DESIGN_QA_BASELINE === '1';
const gazeProbe = require('./design-gaze-probe.cjs')(process.env.DESIGN_QA_SOURCE || path.resolve(__dirname, '..'));
(async () => {
    const browser = await chromium.launch({ headless: true });
    const p = await browser.newPage();
    p.setDefaultTimeout(5000);
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => {
        const theme = sessionStorage.getItem('qa-theme');
        if (theme) localStorage.setItem('gc-theme', theme);
        window.qaRegistrations = [];
        const send = WebSocket.prototype.send;
        WebSocket.prototype.send = function(raw) {
            try { const m = JSON.parse(raw); if (m.type === 'register_targets') window.qaRegistrations.push(m.targets); } catch {}
            return send.call(this, raw);
        };
        speechSynthesis.speak = () => {};
        window.electronAPI = { on: () => () => {}, off: () => {}, settings: { load: async () => JSON.parse(sessionStorage.getItem('qa-profile') || 'null'), save: async d => { sessionStorage.setItem('qa-profile', JSON.stringify(d)); return { success: true }; } } };
    });
    // Geometry checks must never send speech/automation to the patient's backend.
    const QA_NEWS_CATEGORIES = [['positive_india', 'Good News'], ['india_official', 'India Today'], ['health_als', 'ALS Research'], ['cricket', 'Cricket'], ['science', 'Science']]
        .map(([id, label]) => ({ id, label, icon: '' }));
    const QA_NEWS = Array.from({ length: 9 }, (_, i) => ({
        title: ['New wheelchair-friendly coaches added on the Delhi Metro Pink Line', 'Kerala volunteers restore forty village ponds before summer', 'Young chess champion from Chennai wins an international title'][i % 3],
        source: ['Indian Express', 'Down To Earth', 'The Hindu'][i % 3], relative_time: `${i + 2}h ago`, link: `https://example.com/news/${i}`,
        summary: 'A short summary of the story appears here, written in plain words so it can be read aloud clearly by the app.',
    }));
    const QA_ARTICLE = { title: QA_NEWS[0].title, text: Array(6).fill('Students at a government school now attend lessons in a rooftop classroom powered entirely by the sun, and nearby schools have asked to copy the design.').join('\n\n') };
    const QA_SNAPSHOT = {
        weather: { ok: true, city: 'New Delhi', temp_c: 31, feels_like_c: 34, condition: 'Hazy sunshine', humidity: 48, wind_kph: 9 },
        cricket: { ok: true, match: 'India vs Australia, 2nd ODI', summary: 'India 287/6 (48.2 ov)', status: 'India need 12 runs from 10 balls', venue: 'Wankhede Stadium, Mumbai' },
    };
    let registrations=[];
    await p.routeWebSocket('ws://127.0.0.1:8765', ws => {
        registrations=[];
        ws.onMessage(raw => {
            const m=JSON.parse(raw);
            if(m.type==='register_targets') registrations.push(m.targets);
            if(m.type==='set_screen') ws.send(JSON.stringify({type:'screen_changed',screen:m.screen}));
            if(m.type==='set_gaze_enabled') ws.send(JSON.stringify({type:'gaze_enabled',enabled:m.enabled}));
            // Sample content, so the web pages are measured full rather than empty.
            if(m.type==='get_news_categories') ws.send(JSON.stringify({type:'news_categories',categories:QA_NEWS_CATEGORIES}));
            if(m.type==='get_news'||m.type==='refresh_news') ws.send(JSON.stringify({type:'news_data',items:QA_NEWS,cached:false}));
            if(m.type==='fetch_article') ws.send(JSON.stringify({type:'article_data',article:{...QA_ARTICLE,url:m.url},url:m.url}));
            if(m.type==='get_quick_snapshot') ws.send(JSON.stringify({type:'quick_snapshot',snapshot:QA_SNAPSHOT}));
        });
    });
    const rows = [];
    const failures = [];
    let prefix = '';
    async function reset() { await p.reload(); await p.locator('#kb').waitFor(); await p.waitForTimeout(60); }
    async function route(name) { await reset(); await p.evaluate(name => { let e = document.querySelector('#kb'); let f = e[Object.keys(e).find(k => k.startsWith('__reactFiber$'))]; while (f) {
        if (typeof f.memoizedProps?.onNavigate === 'function') {
            f.memoizedProps.onNavigate(name);
            return;
        }
        f = f.return;
    } throw Error('route callback missing'); }, name); await p.waitForTimeout(120); }
    async function take(name) {
        await p.mouse.move(0, 0);
        const toggle=p.locator('[data-gaze-toggle="true"]').filter({hasText:/Enable gaze/}).first();
        if(await toggle.count() && await toggle.isVisible() && await toggle.evaluate(e => {
            const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
        })) await toggle.click();
        await p.mouse.move(0,0);
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(550);
        assert.equal(await p.locator('html').getAttribute('data-theme'), prefix.split('/')[2]);
        if (!BASELINE) assert.equal(await p.locator('html').getAttribute('data-design'), prefix.split('/')[1]);
        await p.evaluate(registrations => {window.qaRegistrations=registrations;},registrations);
        const targeting = await p.evaluate(gazeProbe);
        const data = await p.evaluate(() => {
            const dialog = document.querySelector('[role=dialog][aria-modal=true]');
            const buttons = [...(dialog || document).querySelectorAll('button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
            const targets = buttons.map(e => {
                const r = e.getBoundingClientRect();
                let s = getComputedStyle(e);
                const ranges = [];
                const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
                let n;
                while (n = w.nextNode()) {
                    if (!n.textContent.trim())
                        continue;
                    let p = n.parentElement;
                    if (getComputedStyle(p).display === 'none' || !p.getBoundingClientRect().width)
                        continue;
                    const ra = document.createRange();
                    ra.selectNodeContents(n);
                    // Lines after a -webkit-line-clamp (ended with an ellipsis) are laid out
                    // but never drawn; the drawn lines are still checked against the button.
                    let clamp = null;
                    for (let a = p; a && a !== e && !clamp; a = a.parentElement)
                        if ((getComputedStyle(a).webkitLineClamp || 'none') !== 'none')
                            clamp = a.getBoundingClientRect();
                    for (const rr of ra.getClientRects())
                        if (rr.width > 0 && !(clamp && rr.y >= clamp.bottom - 1))
                            ranges.push({ t: n.textContent.trim(), x: rr.x, y: rr.y, w: rr.width, h: rr.height });
                }
                return { id: e.id, text: e.textContent.trim().replace(/\s+/g, ' '), gaze: e.hasAttribute('data-gaze'), attrs: Object.fromEntries([...e.attributes].filter(a => a.name.startsWith('data-gaze') || a.name === 'data-action').map(a => [a.name,a.value])), disabled: e.disabled, x: r.x, y: r.y, w: r.width, h: r.height, textInset: ranges.length ? Math.min(...ranges.flatMap(q => [q.x-r.x,r.right-q.x-q.w])) : null, small: e.hasAttribute('data-gaze') && !e.disabled && (r.width < 79.5 || r.height < 79.5), outside: r.x < -.5 || r.y < -.5 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5, clipped: ranges.filter(q => q.x < r.x - 1 || q.y < r.y - 1 || q.x + q.w > r.right + 1 || q.y + q.h > r.bottom + 1).map(q => q.t), bg: s.backgroundColor, color: s.color, font: s.fontFamily };
            });
            const overlaps = [];
            for (let i = 0; i < targets.length; i++)
                for (let j = i + 1; j < targets.length; j++) {
                    let a = targets[i], b = targets[j];
                    if (!a.gaze || !b.gaze || a.disabled || b.disabled)
                        continue;
                    let x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
                    if (x > 2 && y > 2)
                        overlaps.push([a.id || a.text, b.id || b.text]);
                }
            const nav = document.querySelector('.nav-bar-container');
            const navTargets = nav ? buttons.filter(e => nav.contains(e)).map(e => {
                const r = e.getBoundingClientRect();
                const content = [...e.querySelectorAll('.nav-action-label,.gaze-switch-label,svg')]
                    .filter(c => c.getBoundingClientRect().width).map(c => c.getBoundingClientRect());
                return { text: e.innerText, x: r.x, y: r.y, w: r.width, h: r.height,
                    inset: content.length ? Math.min(...content.flatMap(c => [c.left-r.left,r.right-c.right,c.top-r.top,r.bottom-c.bottom])) : null };
            }) : [];
            const navigation = { targets: navTargets, issues: [] };
            if (navTargets.length > 1) {
                if (Math.max(...navTargets.map(t => t.w)) - Math.min(...navTargets.map(t => t.w)) > 1)
                    navigation.issues.push('Unequal navigation widths');
                if (Math.abs((navTargets[0].x + navTargets.at(-1).x + navTargets.at(-1).w)/2 - innerWidth/2) > 1)
                    navigation.issues.push('Navigation group is off centre');
                if (Math.max(...navTargets.map(t => t.h)) - Math.min(...navTargets.map(t => t.h)) > 1)
                    navigation.issues.push('Unequal navigation heights');
            }
            for (const t of navTargets) if (t.inset !== null && t.inset < 14)
                navigation.issues.push('Cramped navigation content: ' + t.text + ' (' + t.inset.toFixed(1) + 'px)');
            const clock = nav?.querySelector('.live-clock-navigation')?.getBoundingClientRect();
            if (clock && Math.abs(clock.x + clock.width/2 - innerWidth/2) > 1)
                navigation.issues.push('Home clock is off centre');
            return { targets, overlaps, navigation, text: document.body.innerText, scroll: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight] };
        });
        rows.push({ key: prefix + '/' + name, ...data, targeting });
        if (process.env.DESIGN_QA_SCREENSHOTS === '1')
            await p.screenshot({ animations: 'disabled', path: OUT + '/' + prefix.replaceAll('/', '-') + '-' + name + '.png' });
    }
    async function run(name, fn) { if (process.env.DESIGN_QA_STATES && !process.env.DESIGN_QA_STATES.split(',').includes(name))
        return; try {
        await fn();
        await take(name);
    }
    catch (e) {
        failures.push({ key: prefix + '/' + name, error: e.message.slice(0, 240) });
    } }
    for (const width of choices('DESIGN_QA_WIDTHS', ['1366', '1920']).map(Number))
        for (const mode of choices('DESIGN_QA_MODES', ['focus', 'serene']))
            for (const theme of choices('DESIGN_QA_THEMES', ['dark', 'warm', 'midnight-navy'])) {
                prefix = `${width}/${mode}/${theme}`;
                await p.setViewportSize({ width, height: ({1280: 800, 1366: 768, 1440: 900, 1728: 1000})[width] || 1080 });
                await p.goto(BASE);
                await p.evaluate(({ mode, theme }) => { sessionStorage.clear(); sessionStorage.setItem('qa-theme',theme); sessionStorage.setItem('qa-profile', JSON.stringify({ version: 1, settings: { designMode: mode } })); localStorage.clear(); }, { mode, theme });
                await run('home', reset);
                await run('keyboard-nav', async () => { await route('keyboard'); await p.click('#nav-restore-btn'); });
                // Add to Message (10 Oct 2026): the four cards from the keyboard's Quick Words, and each
                // card's screen while adding (Back to the cards, the note beside the navigation).
                const addToMessage = async () => { await route('keyboard');
                    await p.locator('.keyboard-key[data-action="quickWords"]').first().click(); await p.locator('#add-quick').waitFor(); };
                await run('add-to-message', addToMessage);
                for (const [id, name] of [['quick', 'quick-phrases'], ['phrases', 'phrases'], ['people', 'people'], ['assistance', 'assistance']])
                    await run('add-' + name, async () => { await addToMessage(); await p.click('#add-' + id); await p.locator('.add-message-note').waitFor(); });
                for (const [screen, name] of [['quickwords', 'quick-phrases'], ['phrases', 'phrases'], ['people', 'people'], ['medical', 'assistance'], ['activities', 'activities'], ['floor-plan', 'design-home'], ['floor-plan-survey', 'survey'], ['web', 'web-hub'], ['music', 'music'], ['needs', 'needs'], ['feelings', 'feelings'], ['customize', 'customize'], ['spatial', 'spatial'], ['compass-map', 'compass-setup']])
                    await run(name, () => route(screen));
                await run('bp-choices', async () => { await route('quickwords'); await p.click('#qws-emergency-3'); });
                for (const id of ['daily', 'airway', 'bed', 'symptoms'])
                    await run('assistance-' + id, async () => { await route('medical'); await p.click('#assist-category-' + id); });
                await run('daily-care-2', async () => { await route('medical'); await p.click('#assist-category-daily'); await p.click('#assist-next'); });
                await run('phrase-feelings', async () => { await route('phrases'); await p.click('#cat-feelings'); });
                for (const id of ['tv', 'youtube', 'alexa'])
                    await run('activities-' + id, async () => { await route('activities'); await p.click('#act-cat-' + id); });
                for (const [id, name] of [['youtube', 'youtube'], ['news', 'news'], ['search', 'search'], ['social', 'social']])
                    await run(name, async () => { await route('web'); await p.click('#hub-' + id); });
                await run('video-controls', async () => { await route('web'); await p.click('#hub-youtube'); await p.click('#yv-0'); });
                // The search keyboard opened from YouTube and from Quick Search (6 Oct 2026).
                await run('youtube-search', async () => { await route('web'); await p.click('#hub-youtube'); await p.click('#yl-search'); });
                await run('search-keyboard', async () => { await route('web'); await p.click('#hub-search'); await p.click('#qs-type-search'); });
                // Suggestions beside the typed text while typing (7 Oct 2026; moved up 8 Oct 2026).
                await run('youtube-search-typed', async () => { await route('web'); await p.click('#hub-youtube'); await p.click('#yl-search');
                    for (const letter of ['L', 'A', 'T']) await p.locator('.search-keyboard .keyboard-key[data-action="letter"]').filter({ hasText: new RegExp('^' + letter + '$') }).first().click();
                    await p.locator('.search-keyboard-suggestion').first().waitFor(); });
                // The redesigned story, answer and Social pages (6 Oct 2026).
                await run('news-article', async () => { await route('web'); await p.click('#hub-news'); await p.click('#ni-0'); });
                await run('news-reader', async () => { await route('web'); await p.click('#hub-news'); await p.click('#ni-0'); await p.click('#n-reader'); });
                await run('weather', async () => { await route('web'); await p.click('#hub-search'); await p.click('#qs-local_weather'); });
                await run('cricket', async () => { await route('web'); await p.click('#hub-search'); await p.click('#qs-cricket_score'); });
                await run('social-service', async () => { await route('web'); await p.click('#hub-social'); await p.click('#soc-linkedin'); });
                await run('music-playlists', async () => { await route('music'); await p.click('#music-landing-indian'); });
                await run('music-more', async () => { await route('music'); await p.click('#music-landing-indian'); await p.click('#music-indian-more'); });
                await run('music-songs', async () => { await route('music'); await p.click('#music-landing-indian'); await p.click('#music-indian-bollywood'); });
                await run('music-songs-2', async () => { await route('music'); await p.click('#music-landing-indian'); await p.click('#music-indian-bollywood'); await p.click('#music-playlist-next-page'); });
                await run('music-player', async () => { await route('music'); await p.click('#music-landing-indian'); await p.click('#music-indian-bollywood'); await p.locator('[id^="music-song-"]').first().click(); });
                await run('compass-map', async () => { await route('compass-map'); await p.locator('#f-skip').waitFor(); for (let i = 0; i < 8 && await p.locator('#f-skip').count(); i++) {
                    await p.click('#f-skip');
                    await p.waitForTimeout(50);
                } await p.locator('#nav-restore').waitFor(); await p.waitForTimeout(1800); });
                await run('compass-nav', async () => { await p.click('#nav-restore'); });
                await run('compass-rooms', async () => { await p.click('#strip-rooms'); await p.click('#menu-ready'); });
                await run('compass-rooms-2', async () => { await p.click('#menu-next'); await p.click('#menu-ready'); });
                await run('home-urgent', async () => { await route('settings'); await p.click('#sidebar-home'); await p.getByRole('button', { name: /^Urgent Needs \+ Quick Phrases/ }).click(); await p.getByRole('button', { name: 'Save Changes', exact: true }).click(); await p.getByRole('button', { name: 'Home', exact: true }).click(); });
                await run('urgent-needs', async () => { await p.click('#dock-0'); });
                // Restore the default Home for the independent Settings checks.
                await p.evaluate(() => { const d = JSON.parse(sessionStorage.getItem('qa-profile')); d.settings.homeEmergencyLaunchMode = 'quick'; sessionStorage.setItem('qa-profile', JSON.stringify(d)); });
                for (const id of ['gaze', 'voice', 'display', 'home', 'quickwords', 'phrases', 'medical', 'alertmode', 'people', 'activities', 'websearch', 'dictionary', 'backup', 'reset', 'about'])
                    await run('settings-' + id, async () => { await route('settings'); await p.click('#sidebar-' + id); });
                console.log(prefix, 'done');
                fs.writeFileSync(OUT + '/audit.json', JSON.stringify({ rows, failures, errors }, null, 2));
            }
    await browser.close();
    const issues = rows.flatMap(r => [
        ...(!BASELINE ? r.targets.filter(t =>
            !t.disabled && (['menu-prev','menu-next','back-map','menu-ready','menu-gaze-toggle','ready-road-left','nav-back','view-summary','nav-skip','f-ready','f-back','f-skip'].includes(t.id))
            && (t.h < 103.5 || ((Number(r.key.split('/')[0]) === 1366 ? 768 : ({1280:800,1440:900,1728:1000})[Number(r.key.split('/')[0])] || 1080) - t.y - t.h) < 27.5)
        ).map(t => ({screen:r.key, footerClearance:t.id, height:t.h})) : []),
        ...(!BASELINE && r.targets.some(t => t.id === 'strip-refine-map') ? [{screen:r.key, retiredControl:'Refine Map'}] : []),
        ...r.navigation.issues.map(navigation => ({ screen: r.key, navigation })),
        ...(!r.key.includes('/settings-') ? [
        ...r.targeting.misses.map(miss => ({screen:r.key, hitOwnership:miss})),
        ...r.targeting.registration.map(registration => ({screen:r.key, registration})),
        ...r.targets.filter(t => t.small || t.outside || t.clipped.length).map(t => ({ screen: r.key, id: t.id, small: t.small, outside: t.outside, clipped: t.clipped })),
        ...r.targets.filter(t => t.gaze && t.textInset !== null && t.textInset < 11.5 && !t.id.startsWith('cell-') && !r.key.endsWith('/keyboard-nav')).map(t => ({ screen: r.key, id: t.id, textInset: t.textInset })),
        ...r.overlaps.map(pair => ({ screen: r.key, overlap: pair })),
        ...(r.scroll.some(n => n > 1) ? [{ screen: r.key, scroll: r.scroll }] : []),
        ] : []),
    ]);
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ screens: rows.length, failures, errors, issues }, null, 2));
    console.log('Reports:', OUT);
    assert.equal(failures.length, 0, JSON.stringify(failures));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    if (!BASELINE) assert.equal(issues.length, 0, JSON.stringify(issues));
    console.log('Audit:', rows.length, 'screens;', failures.length, 'capture errors;', errors.length, 'runtime errors');
})().catch(e => { console.error(e); process.exit(1); });
