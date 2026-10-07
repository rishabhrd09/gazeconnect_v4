/**
 * Up / Down for the embedded page, chosen by the page itself (6 Oct 2026).
 *
 * The buttons used to send one synthetic mouse-wheel event to the middle of the
 * view. The wheel scrolls whatever is under that point: on a YouTube watch page
 * that is often the video player, and with the in-app full screen the page is
 * locked, so pressing Down did nothing ("the scroll button is not working").
 * This script scrolls the document, or, when the document itself cannot move,
 * the largest scrollable panel under the middle of the view, by most of a
 * screen so the last lines stay in sight, smoothly, and reports where the page
 * now is so the interface can show that the top or the end has been reached.
 *
 * YouTube's own reset (8 Oct 2026): about 0.6 s after a new page's data arrives
 * (`yt-page-data-updated`, recorded by the page cursor script as
 * `window.__gcPageNav`), YouTube's code puts the page back to its top once more
 * (`html.scrollTop = 0`). A press of Up / Down in that time was undone: in the
 * end-to-end run, every fast Down after a Back. So Up / Down first waits until
 * that time has passed (or, while YouTube is still loading the page, until its
 * data has arrived), and for a little while after scrolling puts the page back
 * where it was sent if it is put straight back to its top. Top never waits, and
 * it ends a waiting Up / Down.
 */
export type PageScrollDirection = 'up' | 'down' | 'top';

export type PageScrollResult = {
  ok: boolean;
  /** Where the page was and will be once the smooth scroll ends, in page CSS px. */
  before: number;
  after: number;
  max: number;
  atTop: boolean;
  atBottom: boolean;
  container: 'page' | 'panel' | 'none';
  reason?: 'locked' | 'no-scroll';
};

/** The share of the visible height one press moves; the rest stays in view for context. */
export const PAGE_SCROLL_FRACTION = 0.8;
/** After YouTube's page data arrives, how long Up / Down waits for its reset to the top (seen at 0.62-0.64 s). */
export const YOUTUBE_RESET_SETTLE_MS = 1000;
/** The longest Up / Down waits for YouTube (a page still loading, then the settle time). */
export const YOUTUBE_WAIT_MAX_MS = 3000;
/** For this long after scrolling, a jump straight back to the top is undone. */
export const YOUTUBE_RESET_GUARD_MS = 1500;

export function isPageScrollDirection(value: unknown): value is PageScrollDirection {
  return value === 'up' || value === 'down' || value === 'top';
}

export function buildPageScrollScript(direction: PageScrollDirection, fraction = PAGE_SCROLL_FRACTION): string {
  return `
(function (direction, fraction, settleMs, waitMaxMs, guardMs) {
  // The latest Up / Down / Top on this page: a newer one ends what an older one still waits for.
  var command = window.__gcScrollCommand = (window.__gcScrollCommand || 0) + 1;
  var root = document.scrollingElement || document.documentElement;
  var pageY = function () { return Math.max(window.scrollY || 0, root.scrollTop || 0); };
  var guardAgainstReset = function (goal) {
    var nav = window.__gcPageNav;
    if (!nav || !(goal > 2) || !(nav.dataAt > 0) || performance.now() - nav.dataAt > settleMs + waitMaxMs + guardMs) return;
    var last = pageY();
    var timer = 0;
    var finish = function () { window.removeEventListener('scroll', onScroll, true); clearTimeout(timer); };
    var onScroll = function () {
      if (window.__gcScrollCommand !== command) { finish(); return; }
      var y = pageY();
      // Put straight back to the top in one step (YouTube's reset), not scrolled there.
      if (y <= 2 && last - y >= 40) {
        finish();
        try { root.scrollTo({ top: goal, behavior: 'instant' }); } catch (e) { root.scrollTop = goal; }
        return;
      }
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    timer = setTimeout(finish, guardMs);
  };
  var scroll = function () {
    try {
      var vh = window.innerHeight || root.clientHeight || 0;
      var vw = window.innerWidth || root.clientWidth || 0;
      var lockedBy = function (el) {
        if (!el) return false;
        var o = getComputedStyle(el).overflowY;
        return o === 'hidden' || o === 'clip';
      };
      var scrollable = function (el) {
        if (!el || el === document.body || el === document.documentElement) return false;
        var o = getComputedStyle(el).overflowY;
        return (o === 'auto' || o === 'scroll' || o === 'overlay') && el.scrollHeight > el.clientHeight + 4;
      };
      var rootMax = Math.max(0, root.scrollHeight - root.clientHeight);
      var pageLocked = lockedBy(document.documentElement) || (document.body && lockedBy(document.body));
      var target = null;
      if (rootMax > 4 && !pageLocked) {
        target = root;
      } else {
        // The page itself cannot move: use the largest scrollable panel under the middle of the view.
        var probes = [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.5, 0.75]];
        var best = null;
        for (var i = 0; i < probes.length; i++) {
          var el = document.elementFromPoint(vw * probes[i][0], vh * probes[i][1]);
          while (el && !scrollable(el)) el = el.parentElement;
          if (el && (!best || el.clientHeight * el.clientWidth > best.clientHeight * best.clientWidth)) best = el;
        }
        target = best;
      }
      if (!target) {
        return { ok: false, before: 0, after: 0, max: 0, atTop: true, atBottom: true, container: 'none', reason: pageLocked ? 'locked' : 'no-scroll' };
      }
      var isRoot = target === root;
      var height = isRoot ? vh : target.clientHeight;
      var max = Math.max(0, target.scrollHeight - target.clientHeight);
      var before = isRoot ? pageY() : target.scrollTop;
      var step = Math.max(120, Math.round(height * fraction));
      var goal = direction === 'top' ? 0 : before + (direction === 'down' ? step : -step);
      var after = Math.max(0, Math.min(max, goal));
      if (direction === 'top') target.scrollTo({ top: 0, behavior: 'smooth' });
      else target.scrollBy({ top: after - before, behavior: 'smooth' });
      if (isRoot && direction !== 'top' && after !== before) guardAgainstReset(after);
      return { ok: after !== before, before: Math.round(before), after: Math.round(after), max: Math.round(max),
               atTop: after <= 2, atBottom: after >= max - 2, container: isRoot ? 'page' : 'panel' };
    } catch (e) {
      return { ok: false, before: 0, after: 0, max: 0, atTop: false, atBottom: false, container: 'none', reason: 'no-scroll' };
    }
  };
  // While YouTube is loading a page, or until its reset has passed, Up / Down waits.
  var waiting = function (now) {
    var nav = window.__gcPageNav;
    if (!nav) return false;
    var loading = nav.startedAt > nav.dataAt && now - nav.startedAt < waitMaxMs;
    var settling = nav.dataAt > 0 && now - nav.dataAt < settleMs;
    return loading || settling;
  };
  var started = performance.now();
  if (direction === 'top' || !waiting(started)) return scroll();
  return new Promise(function (resolve) {
    var tick = function () {
      // A newer command (Top: Back to Video) has taken over; this one never scrolls.
      if (window.__gcScrollCommand !== command) { resolve({ ok: false, reason: 'superseded' }); return; }
      var now = performance.now();
      if (waiting(now) && now - started < waitMaxMs) { setTimeout(tick, 50); return; }
      resolve(scroll());
    };
    setTimeout(tick, 50);
  });
})(${JSON.stringify(direction)}, ${Number.isFinite(fraction) ? fraction : PAGE_SCROLL_FRACTION}, ${YOUTUBE_RESET_SETTLE_MS}, ${YOUTUBE_WAIT_MAX_MS}, ${YOUTUBE_RESET_GUARD_MS});
`;
}
