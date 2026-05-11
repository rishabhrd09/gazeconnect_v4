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
        blockedUntil: 0,
        targetKey: '',
        targetRect: null
      };

      window.gcConfig = Object.assign({
        dwellMs: 1200,
        onsetMs: 300,
        stabilityRadiusPx: 50,
        postClickCooldownMs: 900,
        targetRegionSlackPx: 24,
        // Asymmetric snap/unsnap (Tobii US10,890,967): snap-in narrow,
        // unsnap wide. Once a target is locked the dwell tolerates a
        // larger gaze drift before reset, preventing boundary flicker
        // and giving ALS users a wider hold zone.
        youtubeCardHitZonePx: 120,           // snap-in for cards
        youtubeCardUnsnapPx: 180,            // unsnap (hold) for cards
        youtubeSkipSnapPx: 130,              // snap-in for skip ad
        youtubeSkipUnsnapPx: 200,            // unsnap (hold) for skip ad
        // Legacy alias kept for back-compat with main.ts setGazeConfig
        youtubeCardStabilityRadiusPx: 110
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

      const skipButtonSelector = [
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button-modern',
        '.ytp-ad-skip-button',
        '.ytp-skip-ad-button',
        '.ytp-ad-skip-button-container button',
        '.ytp-skip-ad-button-container button',
        '.videoAdUiSkipButton'
      ].join(',');

      const SKIP_AD_CLASS_TOKENS = [
        'ytp-ad-skip-button',
        'ytp-ad-skip-button-modern',
        'ytp-skip-ad-button',
        'ytp-skip-ad-button-modern',
        'videoAdUiSkipButton'
      ];

      const skipAdTextPattern = /skip\\s*ad|ad\\s*skip/i;
      const countdownPattern = /\\b\\d+\\s*$|in\\s*\\d|skip\\s*in/i;

      const safeRect = (el) => {
        if (!el || !el.getBoundingClientRect) return null;
        const rect = el.getBoundingClientRect();
        if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
        return {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      };

      const isVisible = (el) => {
        const rect = safeRect(el);
        if (!rect) return false;
        if (rect.width < 8 || rect.height < 8) return false;
        let style = null;
        try { style = window.getComputedStyle(el); } catch (_) {}
        if (!style) return true;
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.pointerEvents !== 'none' &&
          Number(style.opacity || 1) > 0.04 &&
          !el.disabled &&
          el.getAttribute?.('aria-disabled') !== 'true';
      };

      const labelOf = (el) => {
        if (!el) return '';
        return [
          el.textContent || '',
          el.getAttribute?.('aria-label') || '',
          el.getAttribute?.('title') || '',
          el.getAttribute?.('data-title-no-tooltip') || ''
        ].join(' ').replace(/\\s+/g, ' ').trim();
      };

      const centerOf = (el) => {
        const rect = safeRect(el);
        return rect
          ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
          : { x: 0, y: 0 };
      };

      const distanceToRect = (x, y, rect) => {
        if (!rect) return Infinity;
        const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
        const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
        return Math.hypot(dx, dy);
      };

      const pointInsideRect = (x, y, rect, slack) => {
        if (!rect) return false;
        return x >= rect.left - slack &&
          x <= rect.right + slack &&
          y >= rect.top - slack &&
          y <= rect.bottom + slack;
      };

      const stableKeyFor = (target, kind, href, label, rect) => [
        kind,
        href || '',
        label || '',
        target?.id || '',
        target?.getAttribute?.('role') || '',
        target?.getAttribute?.('aria-label') || '',
        target?.tagName || '',
        rect ? Math.round(rect.left / 4) * 4 : '',
        rect ? Math.round(rect.top / 4) * 4 : '',
        rect ? Math.round(rect.width / 4) * 4 : '',
        rect ? Math.round(rect.height / 4) * 4 : ''
      ].join('|');

      const clickRequestFor = (target, x, y, kind, preferCenter) => {
        if (!target || !isVisible(target)) return null;
        const rect = safeRect(target);
        if (!rect) return null;
        const point = preferCenter ? centerOf(target) : { x: Math.round(x), y: Math.round(y) };
        const href = target.href || target.getAttribute?.('href') || '';
        const label = labelOf(target).slice(0, 80);
        try { target.focus?.({ preventScroll: true }); } catch (_) {}
        return {
          x: point.x,
          y: point.y,
          kind,
          key: stableKeyFor(target, kind, href, label, rect),
          href,
          label,
          rect
        };
      };

      // Skip-ad-aware helpers (mirror of youtubeController.ts so the
      // in-page dwell can land on the skip button and short-circuit
      // the play/pause toggle that happens when clicks hit the video).
      const normalizeSkipCandidate = (el) =>
        el && (el.closest?.('.ytp-ad-skip-button-modern, .ytp-skip-ad-button-modern, .ytp-ad-skip-button, .ytp-skip-ad-button, button, [role="button"]') || el);

      const hasSkipAdClass = (el) => {
        if (!el) return false;
        const cls = String(el.className || '');
        return SKIP_AD_CLASS_TOKENS.some((token) => cls.indexOf(token) !== -1);
      };

      const isLikelySkipAdNode = (el) => {
        if (!el || !isVisible(el)) return false;
        if (hasSkipAdClass(el)) return true;
        const label = labelOf(el);
        if (!skipAdTextPattern.test(label)) return false;
        if (countdownPattern.test(label)) return false;
        return true;
      };

      const looksLikeSkipButtonRect = (rect) => {
        if (!rect) return false;
        if (rect.width < 50 || rect.width > 320) return false;
        if (rect.height < 20 || rect.height > 96) return false;
        const player = document.querySelector('#movie_player');
        if (!player) return true;
        const playerRect = safeRect(player);
        if (!playerRect || playerRect.width < 80 || playerRect.height < 80) return true;
        const cy = rect.top + rect.height / 2;
        const cx = rect.left + rect.width / 2;
        if (cy < playerRect.top + playerRect.height * 0.45 - 24) return false;
        if (cx < playerRect.left + playerRect.width * 0.40) return false;
        return true;
      };

      const findYoutubeSkipButton = () => {
        const player = document.querySelector('#movie_player') || document;
        const roots = [player, document];
        const seen = new Set();
        const candidates = [];
        for (const root of roots) {
          try {
            root.querySelectorAll(skipButtonSelector).forEach((el) => {
              const norm = normalizeSkipCandidate(el);
              if (norm && !seen.has(norm)) {
                seen.add(norm);
                candidates.push(norm);
              }
            });
          } catch (_) {}
        }
        try {
          document.querySelectorAll('button[aria-label*="Skip" i], [role="button"][aria-label*="Skip" i], [title*="Skip" i]')
            .forEach((el) => {
              if (!skipAdTextPattern.test(labelOf(el))) return;
              const norm = normalizeSkipCandidate(el);
              if (norm && !seen.has(norm)) {
                seen.add(norm);
                candidates.push(norm);
              }
            });
        } catch (_) {}
        for (const candidate of candidates) {
          if (!isLikelySkipAdNode(candidate)) continue;
          const rect = safeRect(candidate);
          if (!looksLikeSkipButtonRect(rect)) continue;
          return candidate;
        }
        return null;
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

      // Snap-in vs. unsnap (hold) radii. Audit #6 / Tobii US10,890,967:
      // a locked target uses a wider hold radius than the initial snap
      // distance so small gaze drift doesn't break the lock — but a
      // FRESH gaze must still be close to qualify.
      const cardSnapInRadius = () => Number(window.gcConfig?.youtubeCardHitZonePx || 120);
      const cardUnsnapRadius = () => Math.max(
        cardSnapInRadius(),
        Number(window.gcConfig?.youtubeCardUnsnapPx || 180)
      );
      const skipSnapInRadius = () => Number(window.gcConfig?.youtubeSkipSnapPx || 130);
      const skipUnsnapRadius = () => Math.max(
        skipSnapInRadius(),
        Number(window.gcConfig?.youtubeSkipUnsnapPx || 200)
      );

      const isLockedYoutubeCard = (anchor) => {
        if (!anchor || !state.targetKey) return false;
        const rect = safeRect(anchor);
        if (!rect) return false;
        const candidateKey = stableKeyFor(anchor, 'youtube_nearest_card', anchor.href || '', labelOf(anchor).slice(0, 80), rect);
        const altKey = stableKeyFor(anchor, 'youtube_card', anchor.href || '', labelOf(anchor).slice(0, 80), rect);
        const altKey2 = stableKeyFor(anchor, 'youtube_anchor', anchor.href || '', labelOf(anchor).slice(0, 80), rect);
        return candidateKey === state.targetKey || altKey === state.targetKey || altKey2 === state.targetKey;
      };

      const nearestYoutubeCard = (x, y) => {
        const snapIn = cardSnapInRadius();
        const unsnap = cardUnsnapRadius();
        let best = null;
        let bestDistance = Infinity;
        const cards = Array.from(document.querySelectorAll(videoCardSelector)).slice(0, 80);
        for (const card of cards) {
          if (!isVisible(card)) continue;
          const anchor = card.querySelector(videoAnchorSelector);
          if (!anchor || !isVisible(anchor)) continue;
          const rect = safeRect(card);
          const distance = distanceToRect(x, y, rect);
          // If this card is the currently locked dwell target, allow a
          // wider hold zone (unsnap > snap-in). Otherwise use snap-in.
          const limit = isLockedYoutubeCard(anchor) ? unsnap : snapIn;
          if (distance <= limit && distance < bestDistance) {
            bestDistance = distance;
            best = anchor;
          }
        }
        return best ? clickRequestFor(best, x, y, 'youtube_nearest_card', true) : null;
      };

      const isYoutubeVideoSurface = (el) =>
        !!el?.closest?.('#movie_player, .html5-video-player, video.video-stream, .ytp-player-content');

      const isSkipButtonLocked = (skipButton) => {
        if (!skipButton || !state.targetKey) return false;
        const rect = safeRect(skipButton);
        if (!rect) return false;
        const key = stableKeyFor(skipButton, 'youtube_skip_ad', skipButton.href || '', labelOf(skipButton).slice(0, 80), rect);
        return key === state.targetKey;
      };

      const resolveClickRequest = (x, y) => {
        const el = document.elementFromPoint(x, y);

        // Skip-ad button gets priority. Asymmetric hysteresis: snap in
        // at skipSnapInRadius, hold at the wider skipUnsnapRadius once
        // the dwell has locked. Both prevents flicker at the boundary
        // and prevents a click from landing on the video underneath.
        const skipButton = findYoutubeSkipButton();
        if (skipButton) {
          const snapIn = skipSnapInRadius();
          const unsnap = skipUnsnapRadius();
          const limit = isSkipButtonLocked(skipButton) ? unsnap : snapIn;
          const skipRect = safeRect(skipButton);
          const directSkipHit = !!(el && (el === skipButton || skipButton.contains?.(el) || el.closest?.(skipButtonSelector) === skipButton));
          if (directSkipHit || distanceToRect(x, y, skipRect) <= limit) {
            return clickRequestFor(skipButton, x, y, 'youtube_skip_ad', true);
          }
          // Don't fall through to a video-surface click when an ad with
          // a skip button is showing — clicking the video would just
          // pause playback.
          if (el && isYoutubeVideoSurface(el)) return null;
        }

        const ytAtPoint = youtubeTargetFromElement(el, x, y);
        if (ytAtPoint) return ytAtPoint;

        const ytNearby = nearestYoutubeCard(x, y);
        if (ytNearby) return ytNearby;

        const standard = el?.closest?.(interactiveSelector);
        if (standard && isVisible(standard)) {
          return clickRequestFor(standard, x, y, 'interactive', false);
        }

        if (el && isVisible(el)) {
          let style = null;
          try { style = window.getComputedStyle(el); } catch (_) {}
          if (style && style.cursor === 'pointer') {
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
        state.targetKey = '';
        state.targetRect = null;
      };

      // Reset dwell WITHOUT clearing blockedUntil — used after a click
      // we just performed so the cooldown still applies.
      window.gcResetDwell = () => {
        state.start = Date.now();
        state.clicked = false;
        state.lastClickKey = '';
        state.targetKey = '';
        state.targetRect = null;
        cursor.classList.remove('dwelling');
        cursor.classList.remove('clicking');
      };

      // Suspend dwell-click activity for a window of time. Used after
      // toolbar-driven YouTube commands (skip ad / play / next) so the
      // gaze cursor can't immediately fire a follow-up click while the
      // page is still settling.
      window.gcBlockDwell = (durationMs) => {
        const ms = Math.max(0, Math.min(8000, Number(durationMs) || 0));
        state.blockedUntil = Date.now() + ms;
        state.start = Date.now();
        state.clicked = false;
        state.targetKey = '';
        state.targetRect = null;
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
        const baseStability = Number(cfg.stabilityRadiusPx || 50);
        const cardStability = Number(cfg.youtubeCardStabilityRadiusPx || 110);
        const cardUnsnapPx = Number(cfg.youtubeCardUnsnapPx || 180);
        const skipSnapPx = Number(cfg.youtubeSkipSnapPx || 130);
        const skipUnsnapPx = Number(cfg.youtubeSkipUnsnapPx || 200);
        const dwellMs = Number(cfg.dwellMs || 1200);
        const onsetMs = Number(cfg.onsetMs || 300);
        const postClickCooldownMs = Number(cfg.postClickCooldownMs || 900);
        const targetRegionSlackPx = Number(cfg.targetRegionSlackPx || 24);

        if (now < state.blockedUntil) {
          cursor.classList.remove('dwelling');
          return null;
        }

        const clickReq = resolveClickRequest(x, y);
        const dist = Math.hypot(x - state.x, y - state.y);

        // Asymmetric hysteresis (audit #6 / Tobii US10,890,967): once a
        // target is locked the dwell tolerates drift to the unsnap
        // radius; before lock we only get the narrower stability
        // radius. This prevents both unintended dwell-onset (strict
        // entry) and boundary flicker (loose exit).
        let stabilityRadius = baseStability;
        const hasLock = !!state.targetKey && !!clickReq && clickReq.key === state.targetKey;
        if (clickReq) {
          if (clickReq.kind === 'youtube_skip_ad') {
            stabilityRadius = Math.max(baseStability, hasLock ? skipUnsnapPx : skipSnapPx);
          } else if (clickReq.kind === 'youtube_anchor' || clickReq.kind === 'youtube_card' || clickReq.kind === 'youtube_nearest_card') {
            stabilityRadius = Math.max(baseStability, hasLock ? cardUnsnapPx : cardStability);
          }
        }

        const sameTarget = !!clickReq &&
          !!state.targetKey &&
          clickReq.key === state.targetKey;

        const insideTargetRegion = sameTarget && pointInsideRect(
          x, y,
          state.targetRect || clickReq.rect,
          targetRegionSlackPx
        );

        const stabilityHeld = dist < stabilityRadius || (sameTarget && insideTargetRegion);

        if (state.start <= 0 || !stabilityHeld) {
          state.x = x;
          state.y = y;
          state.start = now;
          state.clicked = false;
          state.targetKey = clickReq?.key || '';
          state.targetRect = clickReq?.rect || null;
          cursor.classList.remove('dwelling');
          cursor.classList.remove('clicking');
          return null;
        }

        if (sameTarget && clickReq?.rect) {
          // Refresh the rect — page content can shift while the user
          // dwells (lazy load, animations, ad insertion). Without
          // this, a slightly-moved target would fail the
          // pointInsideRect check and reset the dwell.
          state.targetRect = clickReq.rect;
        }

        const elapsed = now - state.start;
        if (elapsed > onsetMs && !state.clicked) cursor.classList.add('dwelling');

        if (elapsed > dwellMs && !state.clicked && clickReq) {
          // Per-target cooldown — if the same target was just clicked,
          // hold off so we don't immediately re-fire.
          if (clickReq.key === state.lastClickKey && now < state.blockedUntil + 300) {
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
            state.targetKey = '';
            state.targetRect = null;
          }, postClickCooldownMs);
          return clickReq;
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

export function buildBrowserCursorBlockScript(durationMs: number): string {
  const safe = Math.max(0, Math.min(8000, Math.round(Number(durationMs) || 0)));
  return `if (window.gcBlockDwell) window.gcBlockDwell(${safe});`;
}
