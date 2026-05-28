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
        targetRect: null,
        // R8: Bayesian target posterior over YouTube cards. Keyed by a
        // stable href+grid-cell hash so small layout shifts don't lose
        // the belief.
        cardPosteriors: {},
        // R1: per-click telemetry ring buffer (browser-side).
        telemetry: [],
        // v17.6 Option A: visual continuity for the in-page dwell ring.
        // When stability is lost mid-dwell, dwellingExpiryAt is set to
        // (now + grace) so the .dwelling CSS class is NOT removed
        // immediately — the patient sees the ring stay lit through
        // brief gaze excursions instead of flickering off and back.
        dwellingExpiryAt: 0,
        // v17.15 candidate-epoch: bumped on scroll, resize, route
        // change, mutation batch, or candidate-list churn. Posteriors
        // soft-decay (× 0.30) or hard-clear depending on hardness.
        candidateEpoch: 0,
        candidateListSig: '',
        lastEpochMs: 0,
        pendingMutationCount: 0,
        pendingMutationFrame: 0,
        // v17.15 stable-winner gate: Bayesian winner must hold for
        // 4 frames AND margin >= 0.10 before onset can start.
        winnerStableId: '',
        winnerStableCount: 0,
        bayesianWinnerId: '',
        bayesianWinnerP: 0,
        bayesianSecondP: 0,
        bayesianFoundCandidate: false,
        // v17.15 onset-movement cancel: snapshot target rect at onset
        // start; cancel if center shifts > 24 px or > 30 % of shorter
        // side. Prevents commits drifting onto a relocated card.
        onsetTargetRect: null,
        onsetStartGaze: null,
        onsetEmitted: false,
        // v17.15 telemetry rings: frames (4000 entries, per-frame),
        // events2 (500 entries, per-event). Existing per-click ring
        // (state.telemetry) is preserved untouched.
        frames: [],
        events2: [],
        sessionStartTs: performance.now(),
        lastFrameTs: 0,
        lastSuppressedEmitTs: 0,
        lastRouteUrl: location.href,
        dwellState: 'idle'
      };

      window.gcConfig = Object.assign({
        dwellMs: 1100,                       // v17: 1200 → 1100, slightly faster select
        onsetMs: 280,                        // v17: 300 → 280
        stabilityRadiusPx: 60,               // v17: 50 → 60 — base tolerates more ALS noise
        postClickCooldownMs: 900,
        targetRegionSlackPx: 32,             // v17: 24 → 32 — wider rect+slack hold zone
        // Asymmetric snap/unsnap (Tobii US10,890,967): snap-in narrow,
        // unsnap wide. Once a target is locked the dwell tolerates a
        // larger gaze drift before reset, preventing boundary flicker
        // and giving ALS users a wider hold zone. v17 widens the
        // unsnap radii further — patient reported it was "very very
        // difficult" to stop on a video card to select it.
        youtubeCardHitZonePx: 130,           // snap-in for cards (was 120)
        youtubeCardUnsnapPx: 230,            // unsnap (hold) for cards (was 180)
        youtubeSkipSnapPx: 140,              // snap-in for skip ad (was 130)
        youtubeSkipUnsnapPx: 250,            // unsnap (hold) for skip ad (was 200)
        // Legacy alias kept for back-compat with main.ts setGazeConfig
        youtubeCardStabilityRadiusPx: 130,   // v17: 110 → 130
        // R8: Bayesian posterior over YouTube cards.
        //   bayesianCardsEnabled: master switch. Default ON for YouTube.
        //   bayesianSigmaPx: σ of the Gaussian likelihood (gaze → card
        //     center distance). Tuned to a default rough ET5 noise
        //     floor; R1 telemetry will let us refine this per session.
        //   bayesianAlpha: per-frame weight of the new likelihood
        //     against the existing posterior. Higher = more responsive,
        //     lower = smoother. 0.30 ≈ 7-frame settling at 30 Hz.
        //   bayesianCommitThreshold: minimum posterior probability for
        //     a card to win the resolveClickRequest race.
        //   bayesianExpandedZoneMult: expand the candidate-pool zone
        //     beyond the regular hit zone so cards just outside snap
        //     range still get evaluated (and posterior smoothly hands
        //     off if you fixate longer).
        bayesianCardsEnabled: true,
        bayesianSigmaPx: 46,                 // v17.5: 50 → 46, slightly tighter
        bayesianAlpha: 0.32,                 // v17.5: 0.40 → 0.32, restore smoother transitions
        bayesianCommitThreshold: 0.45,       // keep at 0.45 — easier commits help dwell
        bayesianOutOfZoneDecay: 0.35,        // keep aggressive — clears stale beliefs
        bayesianExpandedZoneMult: 1.55       // 1.6 → 1.55, slight trim
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

      // v17.15 DoD-2: compact / sidebar card classes whose snap target
      // must be clamped to the visible thumbnail+title region rather
      // than the full renderer rect. Fixes the "cursor flies to the
      // far-right edge of the sidebar" regression.
      const compactCardSelectorList = [
        'ytd-compact-video-renderer',
        'ytd-compact-playlist-renderer',
        'ytd-compact-radio-renderer',
        'ytd-playlist-panel-video-renderer'
      ];
      const compactCardSelector = compactCardSelectorList.join(',');

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

      // v17.15 telemetry — per-event ring (events2). Distinct from the
      // existing per-click ring (state.telemetry) which is preserved.
      const gcEmit = (kind, payload) => {
        try {
          const e = { t: Math.round(performance.now() - state.sessionStartTs), kind: kind };
          if (payload) for (const k in payload) e[k] = payload[k];
          state.events2.push(e);
          if (state.events2.length > 500) state.events2.shift();
        } catch (_) { /* never throw from telemetry */ }
      };

      // v17.15 telemetry — per-frame ring. ~2 min at 30 Hz.
      const gcPushFrame = (frame) => {
        try {
          state.frames.push(frame);
          if (state.frames.length > 4000) state.frames.shift();
        } catch (_) { /* never throw from telemetry */ }
      };

      // v17.15 DoD-1 — candidate-epoch bump. 'soft' decays posteriors
      // by 0.30 ×; 'hard' clears them and resets the stable-winner
      // gate. batchSize is the count of changed candidates from a
      // mutation batch (optional).
      const bumpEpoch = (hardness, batchSize) => {
        state.candidateEpoch += 1;
        state.lastEpochMs = performance.now();
        if (hardness === 'hard') {
          state.cardPosteriors = {};
          state.winnerStableId = '';
          state.winnerStableCount = 0;
        } else {
          const p = state.cardPosteriors;
          for (const k in p) {
            p[k] *= 0.30;
            if (p[k] < 0.02) delete p[k];
          }
        }
        if (typeof batchSize === 'number') {
          gcEmit('mutationBatch', { size: batchSize, hardEpoch: hardness === 'hard' });
        }
      };

      // v17.15 DoD-2 — snap target for compact/sidebar cards.
      // Returns the visible thumbnail+title union (clipped to the card
      // rect) for compact selectors; the full card rect otherwise.
      // Falls back to dropping the right 40 % of the card if neither
      // thumbnail nor title element is found.
      const getCardSnapRect = (card) => {
        const cardRect = safeRect(card);
        if (!cardRect) return null;
        let isCompact = false;
        try {
          if (card.matches?.(compactCardSelector)) isCompact = true;
        } catch (_) {}
        if (!isCompact) return cardRect;

        let thumbRect = null;
        try {
          const t = card.querySelector('a#thumbnail')
            || card.querySelector('#thumbnail')
            || card.querySelector('ytd-thumbnail');
          if (t) thumbRect = safeRect(t);
        } catch (_) {}

        let titleRect = null;
        try {
          const tt = card.querySelector('#video-title')
            || card.querySelector('[id="video-title"]')
            || card.querySelector('h3');
          if (tt) titleRect = safeRect(tt);
        } catch (_) {}

        const parts = [thumbRect, titleRect].filter(Boolean);
        if (parts.length > 0) {
          let left = parts[0].left;
          let top = parts[0].top;
          let right = parts[0].right;
          let bottom = parts[0].bottom;
          for (let i = 1; i < parts.length; i++) {
            if (parts[i].left < left) left = parts[i].left;
            if (parts[i].top < top) top = parts[i].top;
            if (parts[i].right > right) right = parts[i].right;
            if (parts[i].bottom > bottom) bottom = parts[i].bottom;
          }
          left = Math.max(cardRect.left, left);
          top = Math.max(cardRect.top, top);
          right = Math.min(cardRect.right, right);
          bottom = Math.min(cardRect.bottom, bottom);
          if (right > left && bottom > top) {
            return {
              left: Math.round(left),
              top: Math.round(top),
              right: Math.round(right),
              bottom: Math.round(bottom),
              width: Math.round(right - left),
              height: Math.round(bottom - top)
            };
          }
        }

        const clampedRight = Math.round(cardRect.left + cardRect.width * 0.6);
        return {
          left: cardRect.left,
          top: cardRect.top,
          right: clampedRight,
          bottom: cardRect.bottom,
          width: clampedRight - cardRect.left,
          height: cardRect.height
        };
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
          // v17.15 DoD-2 — unlocked cards: distance to snap rect
          // (thumbnail+title region). Locked cards: distance to full
          // rect (wider hold zone via unsnap radius).
          const isLocked = isLockedYoutubeCard(anchor);
          const fullRect = safeRect(card);
          const snapRect = isLocked ? fullRect : (getCardSnapRect(card) || fullRect);
          const distance = distanceToRect(x, y, snapRect);
          const limit = isLocked ? unsnap : snapIn;
          if (distance <= limit && distance < bestDistance) {
            bestDistance = distance;
            best = anchor;
          }
        }
        return best ? clickRequestFor(best, x, y, 'youtube_nearest_card', true) : null;
      };

      // === R8: BAYESIAN TARGET POSTERIOR over YouTube cards ============
      // Each frame:
      //   1. Collect all visible cards within an expanded zone (1.5×
      //      the regular hit radius) — even cards slightly outside the
      //      snap zone are considered so that as gaze approaches a
      //      card, evidence accumulates before it qualifies as "nearest".
      //   2. Compute a Gaussian likelihood for each candidate from its
      //      distance to gaze. Cards with gaze inside their rect get
      //      d=0 → likelihood=1; far cards get exponentially small.
      //   3. Normalise across candidates so likelihoods sum to 1.
      //   4. Temporally smooth: P_new = α·L + (1-α)·P_old (per-card),
      //      then renormalise across all active posteriors.
      //   5. Decay belief for cards no longer in the candidate set
      //      (so a card you stopped looking at fades to zero).
      //   6. The winning card is the argmax posterior — but only commit
      //      as the resolved target if its posterior ≥ commitThreshold.
      // This replaces nearest-distance card resolution with a
      // probabilistic one that's robust to gaze noise flipping between
      // adjacent cards every frame. Reference: BayesGaze (Xu et al.
      // Graphics Interface 2021); audit report R8.
      const cardPosteriorKey = (anchor, rect) => {
        const href = (anchor.href || anchor.getAttribute?.('href') || '').toString();
        // Round to a 24-px grid so layout micro-shifts don't break the
        // posterior continuity.
        const gx = rect ? Math.round(rect.left / 24) * 24 : 0;
        const gy = rect ? Math.round(rect.top / 24) * 24 : 0;
        return href + '|' + gx + '|' + gy;
      };

      const bayesianYoutubeCard = (x, y) => {
        state.bayesianFoundCandidate = false;
        if (!window.gcConfig?.bayesianCardsEnabled) {
          state.bayesianWinnerId = '';
          state.bayesianWinnerP = 0;
          state.bayesianSecondP = 0;
          return null;
        }
        const snapIn = cardSnapInRadius();
        const unsnap = cardUnsnapRadius();
        const expandedZone = snapIn * Number(window.gcConfig?.bayesianExpandedZoneMult || 1.5);
        const sigma = Number(window.gcConfig?.bayesianSigmaPx || 42);
        const sigma2 = sigma * sigma;
        const alpha = Number(window.gcConfig?.bayesianAlpha || 0.30);
        const commitThreshold = Number(window.gcConfig?.bayesianCommitThreshold || 0.55);

        const cards = Array.from(document.querySelectorAll(videoCardSelector)).slice(0, 80);
        const candidates = [];
        for (const card of cards) {
          if (!isVisible(card)) continue;
          const anchor = card.querySelector(videoAnchorSelector);
          if (!anchor || !isVisible(anchor)) continue;
          const fullRect = safeRect(card);
          if (!fullRect) continue;
          // v17.15 DoD-2 — distance is computed against the snap rect
          // (thumbnail+title union for compact cards, full rect for
          // others). Locked cards additionally check the full rect
          // against the wider unsnap radius so the hold zone is not
          // shrunk by the snap-rect clamp.
          const snapRect = getCardSnapRect(card) || fullRect;
          const distSnap = distanceToRect(x, y, snapRect);
          const isLocked = isLockedYoutubeCard(anchor);
          if (isLocked) {
            const distFull = distanceToRect(x, y, fullRect);
            if (distFull > Math.max(expandedZone, unsnap)) continue;
          } else {
            if (distSnap > expandedZone) continue;
          }
          // v17.15.2 — likelihood distance is to the snap-rect CENTRE,
          // not the rect edge. Adjacent vertically-stacked sidebar
          // cards (ytd-compact-video-renderer, ~120 px apart, ~10 px
          // gap) had near-identical edge-distances when gaze was on
          // either card — both ~0 and ~10 — so the Bayesian
          // likelihoods were near-equal and the stable-winner margin
          // gate never passed. Centre-distance produces a meaningful
          // ratio (~5 vs ~120 → likelihood ratio ~30:1) so the
          // posterior converges cleanly on whichever card the
          // patient is actually fixating. Rect-distance is still
          // used for the pool filter above so the candidate pool is
          // unchanged.
          const snapCx = (snapRect.left + snapRect.right) / 2;
          const snapCy = (snapRect.top + snapRect.bottom) / 2;
          const distCenter = Math.hypot(x - snapCx, y - snapCy);
          const key = cardPosteriorKey(anchor, fullRect);
          candidates.push({ anchor, fullRect, snapRect, dist: distCenter, key });
        }

        // v17.15.1 — sig is recorded for telemetry only. The earlier
        // version bumped a soft epoch whenever this filtered pool
        // changed, but on dense sidebars the pool boundary
        // fluctuates with normal tracker jitter (a card at the edge
        // of the expanded zone enters / leaves between frames). That
        // decayed posteriors by × 0.30 every frame, locking the
        // steady-state below the 0.45 commit threshold so clicks on
        // sidebar cards never fired. MutationObserver still catches
        // real DOM changes (additions, removals, attribute shifts);
        // out-of-zone decay (× 0.35) still handles cards leaving the
        // pool. So pool churn from gaze drift does not need its own
        // bump.
        const sig = candidates.length + '|' + candidates.slice(0, 5).map((c) => c.key).join(',');
        state.candidateListSig = sig;

        // Out-of-zone aggressive decay — preserved from earlier
        // iterations so a stale belief drops below the commit
        // threshold within 1–2 frames after gaze moves on.
        const outOfZoneDecay = Number(window.gcConfig?.bayesianOutOfZoneDecay || 0.35);
        const candidateKeySet = new Set(candidates.map((c) => c.key));
        const posteriors = state.cardPosteriors;
        for (const k in posteriors) {
          if (!candidateKeySet.has(k)) {
            posteriors[k] *= outOfZoneDecay;
            if (posteriors[k] < 0.02) delete posteriors[k];
          }
        }

        if (candidates.length === 0) {
          if (state.winnerStableId !== '') {
            gcEmit('targetSwitch', {
              fromId: state.winnerStableId,
              toId: null,
              fromType: 'youtube_card',
              toType: null,
              gaze: { x: Math.round(x), y: Math.round(y) }
            });
          }
          state.winnerStableId = '';
          state.winnerStableCount = 0;
          state.bayesianWinnerId = '';
          state.bayesianWinnerP = 0;
          state.bayesianSecondP = 0;
          return null;
        }

        state.bayesianFoundCandidate = true;

        // Likelihoods on snap-rect distance.
        let likelihoodSum = 0;
        const likelihoods = candidates.map((c) => {
          const l = Math.exp(-(c.dist * c.dist) / (2 * sigma2));
          likelihoodSum += l;
          return l;
        });
        if (likelihoodSum > 0) {
          for (let i = 0; i < likelihoods.length; i++) likelihoods[i] /= likelihoodSum;
        }

        // Posterior update.
        for (let i = 0; i < candidates.length; i++) {
          const c = candidates[i];
          const prev = posteriors[c.key] || 0;
          posteriors[c.key] = alpha * likelihoods[i] + (1 - alpha) * prev;
        }

        // Renormalise across live posteriors.
        let totalP = 0;
        for (const k in posteriors) totalP += posteriors[k];
        if (totalP > 0) {
          for (const k in posteriors) posteriors[k] /= totalP;
        }

        // Top-1 / Top-2 across current candidates.
        let bestCandidate = null;
        let bestP = 0;
        let secondP = 0;
        for (const c of candidates) {
          const p = posteriors[c.key] || 0;
          if (p > bestP) {
            secondP = bestP;
            bestP = p;
            bestCandidate = c;
          } else if (p > secondP) {
            secondP = p;
          }
        }

        if (!bestCandidate) {
          state.bayesianWinnerId = '';
          state.bayesianWinnerP = 0;
          state.bayesianSecondP = 0;
          return null;
        }

        // v17.15 DoD-3 — stable-winner tracking. Onset is gated on the
        // same winner holding for 4 frames AND margin >= 0.10.
        const winnerId = bestCandidate.key;
        if (state.winnerStableId === winnerId) {
          state.winnerStableCount += 1;
        } else {
          if (state.winnerStableId !== '') {
            gcEmit('targetSwitch', {
              fromId: state.winnerStableId,
              toId: winnerId,
              fromType: 'youtube_card',
              toType: 'youtube_card',
              gaze: { x: Math.round(x), y: Math.round(y) }
            });
          }
          state.winnerStableId = winnerId;
          state.winnerStableCount = 1;
        }
        state.bayesianWinnerId = winnerId;
        state.bayesianWinnerP = bestP;
        state.bayesianSecondP = secondP;

        const margin = bestP - secondP;
        const lockedWin = isLockedYoutubeCard(bestCandidate.anchor);

        // Locked cards bypass the gate (already-committed targets keep
        // winning). For unlocked, require stable winner + margin +
        // commit threshold.
        if (!lockedWin) {
          if (state.winnerStableCount < 4) return null;
          if (margin < 0.10) return null;
          if (bestP < commitThreshold) return null;
        }

        return clickRequestFor(bestCandidate.anchor, x, y, 'youtube_nearest_card', true);
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

        // R8: Bayesian posterior wins if it has converged on a card.
        // v17.15 DoD-3: if Bayesian found candidates but the stable-
        // winner gate has not passed, do NOT fall through to
        // nearestYoutubeCard — that would bypass the gate via raw
        // distance and re-introduce the flicker the gate is meant to
        // prevent. Return null so dwell does not accumulate this
        // frame. Direct on-element hits via youtubeTargetFromElement
        // (above) still bypass the gate because they're explicit.
        const ytBayesian = bayesianYoutubeCard(x, y);
        if (ytBayesian) return ytBayesian;
        if (state.bayesianFoundCandidate) return null;

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
        state.dwellingExpiryAt = 0;
        // v17.15 — clear onset snapshot and stable-winner tracking so
        // the next BrowserView entry starts fresh. Posteriors are
        // preserved (managed by epoch decay).
        state.onsetTargetRect = null;
        state.onsetStartGaze = null;
        state.onsetEmitted = false;
        state.winnerStableId = '';
        state.winnerStableCount = 0;
        state.bayesianWinnerId = '';
        state.bayesianWinnerP = 0;
        state.bayesianSecondP = 0;
        state.bayesianFoundCandidate = false;
      };

      // Reset dwell WITHOUT clearing blockedUntil — used after a click
      // we just performed so the cooldown still applies.
      window.gcResetDwell = () => {
        state.start = Date.now();
        state.clicked = false;
        state.lastClickKey = '';
        state.targetKey = '';
        state.targetRect = null;
        state.dwellingExpiryAt = 0;
        // v17.15 — also clear onset snapshot and stable-winner gate so
        // the next acquisition re-stabilises rather than inheriting a
        // partial count from the prior click.
        state.onsetTargetRect = null;
        state.onsetStartGaze = null;
        state.onsetEmitted = false;
        state.winnerStableId = '';
        state.winnerStableCount = 0;
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
        // v17.15 — block also clears onset and stable-winner tracking.
        state.onsetTargetRect = null;
        state.onsetStartGaze = null;
        state.onsetEmitted = false;
        state.winnerStableId = '';
        state.winnerStableCount = 0;
        cursor.classList.remove('dwelling');
        cursor.classList.remove('clicking');
      };

      window.gcCleanup = () => {
        try { window.gcHide?.(); } catch (_) {}
        try { window.gcResetDwell?.(); } catch (_) {}
        window.gcUpdateAndPoll = null;
      };

      const _gcUpdateAndPollInner = (x, y, cursorEnabled) => {
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
          state.dwellingExpiryAt = 0;
          return null;
        }

        // v17.6 Option A: hard-clear the preserved dwelling ring if the
        // grace period has passed without gaze returning.
        if (state.dwellingExpiryAt > 0 && now > state.dwellingExpiryAt) {
          state.dwellingExpiryAt = 0;
          cursor.classList.remove('dwelling');
        }

        let clickReq = resolveClickRequest(x, y);
        const dist = Math.hypot(x - state.x, y - state.y);

        // === v17.4: STICKY DWELL TARGET (BrowserView equivalent) =======
        // If resolveClickRequest returned null on this frame (Bayesian
        // posterior didn't commit AND nearest-card found nothing) but we
        // already have a tracked dwell target and gaze is still close to
        // its rect, synthesize a "ghost" clickReq pointing at the same
        // target so the dwell circle doesn't visibly restart. Same root
        // cause as the main-app sticky target — gaze excursion on a
        // YouTube card briefly leaves the snap zone, dwell resets, then
        // gaze returns. Without this, the dwell loop is stuck at the
        // restart point.
        if (!clickReq && state.targetKey && state.targetRect) {
          const sRect = state.targetRect;
          const STICKY_TOLERANCE_BROWSER = 80; // px beyond rect
          if (
            x >= sRect.left - STICKY_TOLERANCE_BROWSER
            && x <= sRect.right + STICKY_TOLERANCE_BROWSER
            && y >= sRect.top - STICKY_TOLERANCE_BROWSER
            && y <= sRect.bottom + STICKY_TOLERANCE_BROWSER
          ) {
            clickReq = {
              x: Math.round((sRect.left + sRect.right) / 2),
              y: Math.round((sRect.top + sRect.bottom) / 2),
              kind: 'sticky_resume',
              key: state.targetKey,
              href: '',
              label: '',
              rect: sRect,
            };
          }
        }

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
          // === v17.6 OPTION A: VISUAL CONTINUITY IN BROWSERVIEW ========
          // If we'd already passed onset and were showing the dwelling
          // ring, KEEP the ring lit for a 600 ms grace period instead
          // of removing the class immediately. Mirrors the main-app
          // savedDwellRef visual continuity — patient sees a stable
          // ring through brief gaze excursions on YouTube cards
          // instead of an on/off/on flicker.
          const wasDwelling = state.targetKey && state.start > 0 && (now - state.start) > onsetMs * 0.6;
          if (wasDwelling) {
            state.dwellingExpiryAt = now + 600;
            // Don't remove the dwelling class — let it persist visually.
          } else {
            cursor.classList.remove('dwelling');
          }
          state.x = x;
          state.y = y;
          // v17.15 DoD-4 — snapshot the new target rect at onset start
          // so a mid-onset re-flow can be detected and the dwell
          // cancelled before commit.
          const newTargetKey = clickReq?.key || '';
          const targetChanged = state.targetKey !== newTargetKey;
          state.start = now;
          state.clicked = false;
          state.targetKey = newTargetKey;
          state.targetRect = clickReq?.rect || null;
          if (clickReq && clickReq.rect && targetChanged) {
            state.onsetTargetRect = {
              left: clickReq.rect.left,
              top: clickReq.rect.top,
              right: clickReq.rect.right,
              bottom: clickReq.rect.bottom,
              width: clickReq.rect.width,
              height: clickReq.rect.height
            };
            state.onsetStartGaze = { x: Math.round(x), y: Math.round(y) };
            state.onsetEmitted = false;
          } else if (!clickReq) {
            state.onsetTargetRect = null;
            state.onsetStartGaze = null;
            state.onsetEmitted = false;
          }
          cursor.classList.remove('clicking');
          return null;
        }

        // v17.6 Option A: dwell stability restored — cancel any pending
        // visual-continuity expiry. From here the live dwell drives
        // the ring class as normal.
        state.dwellingExpiryAt = 0;

        // v17.15 DoD-4 — cancel onset if the active target's centre has
        // moved materially since onset start. Threshold: 24 px absolute
        // OR 30 % of the rect's shorter side, whichever fires first.
        // Without this, a YouTube re-flow mid-dwell (lazy thumbnail,
        // ad insertion) drags the commit onto whichever card landed
        // under the gaze after the shift.
        if (state.onsetTargetRect && clickReq && clickReq.rect && !state.clicked) {
          const r0 = state.onsetTargetRect;
          const r1 = clickReq.rect;
          const c0x = (r0.left + r0.right) / 2;
          const c0y = (r0.top + r0.bottom) / 2;
          const c1x = (r1.left + r1.right) / 2;
          const c1y = (r1.top + r1.bottom) / 2;
          const shiftPx = Math.hypot(c1x - c0x, c1y - c0y);
          const shorterDim = Math.max(1, Math.min(
            r0.right - r0.left,
            r0.bottom - r0.top
          ));
          if (shiftPx > 24 || shiftPx > 0.30 * shorterDim) {
            gcEmit('onsetCancel', {
              candId: state.targetKey || null,
              reason: 'candidate_moved',
              shiftPx: Math.round(shiftPx)
            });
            state.start = 0;
            state.onsetTargetRect = null;
            state.onsetStartGaze = null;
            state.onsetEmitted = false;
            state.targetKey = '';
            state.targetRect = null;
            cursor.classList.remove('dwelling');
            cursor.classList.remove('clicking');
            state.dwellingExpiryAt = 0;
            return null;
          }
        }

        if (sameTarget && clickReq?.rect) {
          // Refresh the rect — page content can shift while the user
          // dwells (lazy load, animations, ad insertion). Without
          // this, a slightly-moved target would fail the
          // pointInsideRect check and reset the dwell.
          state.targetRect = clickReq.rect;
        }

        const elapsed = now - state.start;
        if (elapsed > onsetMs && !state.clicked) {
          cursor.classList.add('dwelling');
          // v17.15 DoD-5 — emit onsetStart once per onset window.
          if (!state.onsetEmitted) {
            state.onsetEmitted = true;
            const orect = state.onsetTargetRect;
            gcEmit('onsetStart', {
              candId: state.targetKey || null,
              candType: clickReq?.kind || null,
              rect: orect ? {
                l: orect.left,
                t: orect.top,
                w: orect.right - orect.left,
                h: orect.bottom - orect.top
              } : null,
              posterior: state.bayesianWinnerP || 0,
              margin: (state.bayesianWinnerP || 0) - (state.bayesianSecondP || 0)
            });
          }
        }

        // === v17.3 R2: TWO-PHASE VISUAL ANCHOR IN BROWSERVIEW ==========
        // Mirror of the main-app two-phase anchor:
        //   Phase A (elapsed > onsetMs): hard snap cursor to target
        //     center for the rest of the dwell.
        //   Phase B (40 ms < elapsed ≤ onsetMs): gradual pull toward
        //     center so the cursor visibly homes in on a YouTube card
        //     while the dwell is committing, instead of jittering on
        //     the edge while the patient panics it'll exit the card.
        // Only fires when sameTarget — if gaze flips to a neighbour,
        // anchor releases immediately.
        if (sameTarget && state.targetRect) {
          const rect = state.targetRect;
          const anchorX = (rect.left + rect.right) / 2;
          const anchorY = (rect.top + rect.bottom) / 2;
          if (elapsed > onsetMs) {
            // Phase A — hard snap
            cursor.style.left = anchorX + 'px';
            cursor.style.top = anchorY + 'px';
          } else if (elapsed > 40) {
            // Phase B — proportional pull (ramps 0 → 1 over 40 → onsetMs)
            const t = Math.min(1, (elapsed - 40) / Math.max(1, onsetMs - 40));
            const pullStrength = 0.35 * t;
            const cx = x + (anchorX - x) * pullStrength;
            const cy = y + (anchorY - y) * pullStrength;
            cursor.style.left = cx + 'px';
            cursor.style.top = cy + 'px';
          }
        }

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

          // === R1: BROWSERVIEW TELEMETRY ============================
          // Record gaze residual vs target center at click time. Pure
          // measurement. Inspect via window.__gcTelemetry.snapshot()
          // in the BrowserView's DevTools.
          try {
            const tRect = state.targetRect || (clickReq.rect || null);
            if (tRect) {
              const cx = (tRect.left + tRect.right) / 2;
              const cy = (tRect.top + tRect.bottom) / 2;
              const dx = x - cx;
              const dy = y - cy;
              state.telemetry.push({
                seq: state.clickSeq,
                ts: now,
                kind: clickReq.kind || '',
                label: (clickReq.label || '').slice(0, 80),
                rect: {
                  left: Math.round(tRect.left),
                  top: Math.round(tRect.top),
                  width: Math.round((tRect.right || 0) - (tRect.left || 0)),
                  height: Math.round((tRect.bottom || 0) - (tRect.top || 0))
                },
                center: { x: Math.round(cx), y: Math.round(cy) },
                gaze: { x: Math.round(x), y: Math.round(y) },
                residual: {
                  dx: Math.round(dx),
                  dy: Math.round(dy),
                  mag: Math.round(Math.sqrt(dx * dx + dy * dy))
                },
                dwellToClickMs: now - state.start
              });
              if (state.telemetry.length > 200) state.telemetry.shift();

              // v17.15 DoD-5 — dwellCommit event in the events2 ring.
              gcEmit('dwellCommit', {
                candId: clickReq.key,
                candType: clickReq.kind,
                dwellToCommitMs: now - state.start,
                finalGaze: { x: Math.round(x), y: Math.round(y) },
                residual: {
                  dx: Math.round(dx),
                  dy: Math.round(dy),
                  mag: Math.round(Math.sqrt(dx * dx + dy * dy))
                }
              });
            }
          } catch (_) { /* never block click on telemetry */ }

          setTimeout(() => {
            cursor.classList.remove('clicking');
            state.clicked = false;
            state.start = Date.now();
            state.targetKey = '';
            state.targetRect = null;
            // v17.15 — reset onset and stable-winner state so the next
            // dwell starts fresh.
            state.onsetTargetRect = null;
            state.onsetStartGaze = null;
            state.onsetEmitted = false;
            state.winnerStableId = '';
            state.winnerStableCount = 0;
          }, postClickCooldownMs);
          return clickReq;
        }

        return null;
      };

      // v17.15 wrapper — per-frame telemetry shell around the inner
      // dwell loop. The inner function is _gcUpdateAndPollInner; this
      // wrapper captures dtMs, dwellState, snap distance, and posts a
      // frame entry to __gcTelemetry.frames each call. Also handles
      // routeChange detection and trackingLost events.
      window.gcUpdateAndPoll = (x, y, cursorEnabled) => {
        if (location.href !== state.lastRouteUrl) {
          bumpEpoch('hard');
          gcEmit('routeChange', { url: location.href });
          state.lastRouteUrl = location.href;
        }
        const tEnter = performance.now();
        const lastFrameTs = state.lastFrameTs || 0;
        const dtMs = lastFrameTs > 0 ? Math.round(tEnter - lastFrameTs) : 0;
        state.lastFrameTs = tEnter;
        if (dtMs > 100 && lastFrameTs > 0) {
          gcEmit('trackingLost', { gapMs: dtMs });
        }
        let result = null;
        try {
          result = _gcUpdateAndPollInner(x, y, cursorEnabled);
        } catch (_err) { /* never throw from the gaze loop */ }
        try {
          const cfg = window.gcConfig || {};
          const dwellMs2 = Number(cfg.dwellMs || 1200);
          const onsetMs2 = Number(cfg.onsetMs || 300);
          const nowMs = Date.now();
          let dwellState = 'idle';
          if (state.clicked) {
            dwellState = nowMs < state.blockedUntil ? 'cooldown' : 'idle';
          } else if (state.start > 0) {
            const el2 = nowMs - state.start;
            if (el2 > dwellMs2) dwellState = 'commit';
            else if (el2 > onsetMs2) dwellState = 'dwell';
            else dwellState = 'onset';
          }
          state.dwellState = dwellState;
          let cursorX = Math.round(x);
          let cursorY = Math.round(y);
          if (cursor && cursor.style) {
            const lx = parseFloat(cursor.style.left);
            const ly = parseFloat(cursor.style.top);
            if (Number.isFinite(lx)) cursorX = Math.round(lx);
            if (Number.isFinite(ly)) cursorY = Math.round(ly);
          }
          const winMargin = Math.round(
            (((state.bayesianWinnerP || 0) - (state.bayesianSecondP || 0)) * 1000)
          ) / 1000;
          const snapDist = state.targetRect
            ? Math.round(distanceToRect(x, y, state.targetRect))
            : -1;
          gcPushFrame({
            t: Math.round(performance.now() - state.sessionStartTs),
            ageMs: -1,
            dtMs: dtMs,
            gx: Math.round(x),
            gy: Math.round(y),
            cx: cursorX,
            cy: cursorY,
            candId: state.targetKey || null,
            candType: result ? (result.kind || null) : null,
            winId: state.bayesianWinnerId || null,
            winMargin: winMargin,
            snapDist: snapDist,
            dwellState: dwellState,
            epoch: state.candidateEpoch
          });
        } catch (_) { /* never throw from telemetry */ }
        return result;
      };

      // R1: expose BrowserView telemetry for live inspection.
      // From the BrowserView DevTools console:
      //   __gcTelemetry.snapshot()  → aggregates (per-click ring)
      //   __gcTelemetry.events()    → raw per-click ring
      //   __gcTelemetry.frames()    → v17.15 per-frame ring (4000)
      //   __gcTelemetry.events2()   → v17.15 per-event ring (500)
      //   __gcTelemetry.dump()      → JSON blob for save / paste
      //   __gcTelemetry.clear()     → wipe buffers
      window.__gcTelemetry = {
        events: function () { return state.telemetry.slice(); },
        clear: function () {
          state.telemetry.length = 0;
          state.clickSeq = 0;
          state.frames.length = 0;
          state.events2.length = 0;
        },
        frames: function () { return state.frames.slice(); },
        events2: function () { return state.events2.slice(); },
        dump: function () {
          return {
            frames: state.frames.slice(),
            events2: state.events2.slice(),
            snapshot: window.__gcTelemetry.snapshot(),
            posteriors: window.__gcTelemetry.posteriors(),
            candidateEpoch: state.candidateEpoch,
            lastRouteUrl: state.lastRouteUrl,
            sessionStartTs: state.sessionStartTs
          };
        },
        snapshot: function () {
          var t = state.telemetry;
          if (!t || t.length === 0) return null;
          var mags = t.map(function (e) { return e.residual.mag; }).slice().sort(function (a, b) { return a - b; });
          var median = mags[Math.floor(mags.length / 2)];
          var devs = mags.map(function (v) { return Math.abs(v - median); }).slice().sort(function (a, b) { return a - b; });
          var mad = devs[Math.floor(devs.length / 2)];
          var sumDx = 0; var sumDy = 0; var sumDw = 0;
          for (var i = 0; i < t.length; i++) {
            sumDx += t[i].residual.dx;
            sumDy += t[i].residual.dy;
            sumDw += t[i].dwellToClickMs;
          }
          var meanDx = sumDx / t.length;
          var meanDy = sumDy / t.length;
          var perKind = {};
          for (var j = 0; j < t.length; j++) {
            var k = t[j].kind || 'unknown';
            perKind[k] = (perKind[k] || 0) + 1;
          }
          return {
            count: t.length,
            medianResidualPx: median,
            madPx: mad,
            driftVector: { dx: Math.round(meanDx), dy: Math.round(meanDy), mag: Math.round(Math.sqrt(meanDx * meanDx + meanDy * meanDy)) },
            meanDwellToClickMs: Math.round(sumDw / t.length),
            perKindCount: perKind
          };
        },
        // R8 posterior inspection — see what the Bayesian model
        // currently believes about cards on screen.
        posteriors: function () {
          var snap = {};
          for (var k in state.cardPosteriors) snap[k] = state.cardPosteriors[k];
          return snap;
        }
      };

      // v17.15 DoD-1 — candidate-epoch listeners. Scroll uses a 100 ms
      // leading + trailing throttle. Route changes via popstate /
      // hashchange / yt-navigate-finish trigger hard epochs.
      try {
        let scrollLastFire = 0;
        let scrollTrailingTimer = null;
        const scrollEpoch = () => {
          const t = performance.now();
          if (t - scrollLastFire >= 100) {
            scrollLastFire = t;
            bumpEpoch('soft');
          } else if (!scrollTrailingTimer) {
            scrollTrailingTimer = setTimeout(() => {
              scrollTrailingTimer = null;
              scrollLastFire = performance.now();
              bumpEpoch('soft');
            }, 100);
          }
        };
        window.addEventListener('scroll', scrollEpoch, { passive: true, capture: true });
        window.addEventListener('resize', () => bumpEpoch('hard'));
        window.addEventListener('popstate', () => {
          bumpEpoch('hard');
          if (location.href !== state.lastRouteUrl) {
            gcEmit('routeChange', { url: location.href });
            state.lastRouteUrl = location.href;
          }
        });
        window.addEventListener('hashchange', () => {
          if (location.href !== state.lastRouteUrl) {
            bumpEpoch('hard');
            gcEmit('routeChange', { url: location.href });
            state.lastRouteUrl = location.href;
          }
        });
        document.addEventListener('yt-navigate-finish', () => {
          bumpEpoch('hard');
          if (location.href !== state.lastRouteUrl) {
            gcEmit('routeChange', { url: location.href });
            state.lastRouteUrl = location.href;
          }
        });
      } catch (_) { /* listeners best-effort */ }

      // v17.15 DoD-1 — MutationObserver, batched per animation frame.
      // Only mutations touching candidate-relevant elements increment
      // the epoch. ≥ 5 changed candidates in one batch → hard epoch.
      try {
        const candidateSelectorAll = videoCardSelector + ',' + videoAnchorSelector + ',' + skipButtonSelector;
        const mo = new MutationObserver((records) => {
          let touched = 0;
          for (let i = 0; i < records.length; i++) {
            const r = records[i];
            const nodes = [];
            if (r.target) nodes.push(r.target);
            if (r.addedNodes) for (let j = 0; j < r.addedNodes.length; j++) nodes.push(r.addedNodes[j]);
            if (r.removedNodes) for (let j = 0; j < r.removedNodes.length; j++) nodes.push(r.removedNodes[j]);
            let hit = false;
            for (let k = 0; k < nodes.length && !hit; k++) {
              const n = nodes[k];
              if (!n) continue;
              try {
                if (n.matches && n.matches(candidateSelectorAll)) hit = true;
                else if (n.querySelector && n.querySelector(candidateSelectorAll)) hit = true;
              } catch (_) {}
            }
            if (hit) touched += 1;
          }
          if (touched === 0) return;
          state.pendingMutationCount += touched;
          if (state.pendingMutationFrame) return;
          state.pendingMutationFrame = requestAnimationFrame(() => {
            const count = state.pendingMutationCount;
            state.pendingMutationCount = 0;
            state.pendingMutationFrame = 0;
            bumpEpoch(count >= 5 ? 'hard' : 'soft', count);
          });
        });
        mo.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
        });
      } catch (_) { /* observer best-effort */ }

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
