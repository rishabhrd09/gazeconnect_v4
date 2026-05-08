export const BROWSER_CURSOR_CSS = `
  #gazeconnect-cursor {
    position: fixed; width: 52px; height: 52px; border-radius: 50%;
    border: 4px solid #2DD4BF; background: rgba(45,212,191,0.18);
    pointer-events: none; z-index: 2147483647;
    transform: translate(-50%, -50%);
    transition: border-color 120ms, background-color 120ms, transform 120ms;
    box-shadow: 0 0 20px rgba(45,212,191,0.5);
    display: none;
  }
  #gazeconnect-cursor.dwelling {
    border-color: #FACC15; background: rgba(250,204,21,0.25);
    transform: translate(-50%, -50%) scale(1.1);
  }
  #gazeconnect-cursor.clicking {
    border-color: #22C55E; background: rgba(34,197,94,0.4);
    transform: translate(-50%, -50%) scale(0.9);
    box-shadow: 0 0 40px rgba(34,197,94,0.8);
  }
`;

export function buildBrowserCursorInjectionScript(): string {
  return `
    (function() {
      if (window.gcUpdateAndPoll) return 'already-injected';

      const state = window.gcState = {
        x: 0,
        y: 0,
        start: 0,
        clicked: false,
        clickSeq: 0,
        lastClickKey: '',
        blockedUntil: 0
      };

      window.gcConfig = Object.assign({
        dwellMs: 1200,
        onsetMs: 300,
        stabilityRadiusPx: 50,
        postClickCooldownMs: 900,
        youtubeCardHitZonePx: 112
      }, window.gcConfig || {});

      let cursor = document.getElementById('gazeconnect-cursor');
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'gazeconnect-cursor';
        document.body.appendChild(cursor);
      }

      const interactiveSelector = [
        'a[href]',
        'button',
        'input',
        'textarea',
        'select',
        'label',
        '[role="button"]',
        '[role="link"]',
        '[tabindex]:not([tabindex="-1"])',
        '[onclick]'
      ].join(',');

      const videoCardSelector = [
        'ytd-video-renderer',
        'ytd-compact-video-renderer',
        'ytd-rich-item-renderer',
        'ytd-grid-video-renderer',
        'ytd-playlist-panel-video-renderer',
        'ytd-reel-item-renderer'
      ].join(',');

      const videoAnchorSelector = [
        'a#thumbnail[href*="/watch"]',
        'a#thumbnail[href*="/shorts"]',
        'a[href*="/watch?v="]',
        'a[href*="/shorts/"]'
      ].join(',');

      const isVisible = (el) => {
        if (!el || !el.getBoundingClientRect) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width >= 8 &&
          rect.height >= 8 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || 1) > 0.04;
      };

      const centerOf = (el) => {
        const rect = el.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2)
        };
      };

      const distanceToRect = (x, y, rect) => {
        const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
        const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
        return Math.hypot(dx, dy);
      };

      const clickRequestFor = (target, x, y, kind, preferCenter) => {
        if (!target || !isVisible(target)) return null;
        const point = preferCenter ? centerOf(target) : { x: Math.round(x), y: Math.round(y) };
        const href = target.href || target.getAttribute?.('href') || '';
        const label = (target.textContent || target.getAttribute?.('aria-label') || target.id || target.tagName || '')
          .toString()
          .trim()
          .slice(0, 80);
        try { target.focus?.({ preventScroll: true }); } catch (_) {}
        return {
          x: point.x,
          y: point.y,
          kind,
          key: [kind, href, label, point.x, point.y].join('|'),
          href,
          label
        };
      };

      const youtubeTargetFromElement = (el, x, y) => {
        if (!el) return null;
        const anchor = el.closest?.(videoAnchorSelector);
        if (anchor) return clickRequestFor(anchor, x, y, 'youtube_anchor', true);

        const card = el.closest?.(videoCardSelector);
        const cardAnchor = card?.querySelector?.(videoAnchorSelector);
        if (cardAnchor) return clickRequestFor(cardAnchor, x, y, 'youtube_card', true);

        return null;
      };

      const nearestYoutubeCard = (x, y) => {
        const maxDistance = Number(window.gcConfig?.youtubeCardHitZonePx || 112);
        let best = null;
        let bestDistance = Infinity;
        const cards = Array.from(document.querySelectorAll(videoCardSelector)).slice(0, 80);
        for (const card of cards) {
          if (!isVisible(card)) continue;
          const anchor = card.querySelector(videoAnchorSelector);
          if (!anchor || !isVisible(anchor)) continue;
          const rect = card.getBoundingClientRect();
          const distance = distanceToRect(x, y, rect);
          if (distance <= maxDistance && distance < bestDistance) {
            bestDistance = distance;
            best = anchor;
          }
        }
        return best ? clickRequestFor(best, x, y, 'youtube_nearest_card', true) : null;
      };

      const resolveClickRequest = (x, y) => {
        const el = document.elementFromPoint(x, y);

        const ytAtPoint = youtubeTargetFromElement(el, x, y);
        if (ytAtPoint) return ytAtPoint;

        const ytNearby = nearestYoutubeCard(x, y);
        if (ytNearby) return ytNearby;

        const standard = el?.closest?.(interactiveSelector);
        if (standard && isVisible(standard)) {
          return clickRequestFor(standard, x, y, 'interactive', false);
        }

        if (el && isVisible(el)) {
          const style = window.getComputedStyle(el);
          if (style.cursor === 'pointer') {
            return clickRequestFor(el, x, y, 'pointer_fallback', false);
          }
        }

        return null;
      };

      window.gcHide = () => {
        cursor.style.display = 'none';
        cursor.classList.remove('dwelling');
        cursor.classList.remove('clicking');
        state.x = 0;
        state.y = 0;
        state.start = 0;
        state.clicked = false;
        state.lastClickKey = '';
        state.blockedUntil = 0;
      };

      window.gcResetDwell = () => {
        state.start = Date.now();
        state.clicked = false;
        state.lastClickKey = '';
        state.blockedUntil = 0;
        cursor.classList.remove('dwelling');
        cursor.classList.remove('clicking');
      };

      window.gcCleanup = () => {
        try { window.gcHide?.(); } catch (_) {}
        try { window.gcResetDwell?.(); } catch (_) {}
        window.gcUpdateAndPoll = null;
      };

      window.gcUpdateAndPoll = (x, y, cursorEnabled) => {
        if (!cursorEnabled) {
          window.gcHide();
          return null;
        }

        cursor.style.display = 'block';
        cursor.style.left = x + 'px';
        cursor.style.top = y + 'px';

        const now = Date.now();
        const cfg = window.gcConfig || {};
        const stabilityRadius = Number(cfg.stabilityRadiusPx || 50);
        const dwellMs = Number(cfg.dwellMs || 1200);
        const onsetMs = Number(cfg.onsetMs || 300);
        const postClickCooldownMs = Number(cfg.postClickCooldownMs || 900);
        const dist = Math.hypot(x - state.x, y - state.y);

        if (dist < stabilityRadius) {
          const elapsed = now - state.start;
          if (elapsed > onsetMs && !state.clicked) cursor.classList.add('dwelling');
          if (elapsed > dwellMs && !state.clicked) {
            const clickReq = resolveClickRequest(x, y);
            if (clickReq) {
              if (now < state.blockedUntil && clickReq.key === state.lastClickKey) {
                return null;
              }
              state.clicked = true;
              state.clickSeq += 1;
              state.lastClickKey = clickReq.key || '';
              state.blockedUntil = now + postClickCooldownMs;
              clickReq.id = state.clickSeq;
              cursor.classList.remove('dwelling');
              cursor.classList.add('clicking');
              setTimeout(() => {
                cursor.classList.remove('clicking');
                state.clicked = false;
                state.start = Date.now();
              }, postClickCooldownMs);
              return clickReq;
            }
            if (elapsed > 2000) state.start = now;
          }
        } else {
          state.x = x;
          state.y = y;
          state.start = now;
          state.clicked = false;
          state.lastClickKey = '';
          state.blockedUntil = 0;
          cursor.classList.remove('dwelling');
          cursor.classList.remove('clicking');
        }

        return null;
      };

      return 'injected';
    })();
  `;
}

export function buildGazeUpdateAndPollScript(x: number, y: number, cursorEnabled: boolean): string {
  return `
    (function() {
      if (!window.gcUpdateAndPoll) return null;
      var r = window.gcUpdateAndPoll(${Math.round(x)}, ${Math.round(y)}, ${cursorEnabled ? 'true' : 'false'});
      return r ? JSON.stringify(r) : null;
    })();
  `;
}

export const BROWSER_CURSOR_HIDE_SCRIPT = `if (window.gcHide) window.gcHide();`;
export const BROWSER_CURSOR_RESET_SCRIPT = `if (window.gcResetDwell) window.gcResetDwell();`;
