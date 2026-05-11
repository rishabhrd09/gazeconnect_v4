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
        dwellingExpiryAt: 0
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
        if (!window.gcConfig?.bayesianCardsEnabled) return null;
        const snapIn = cardSnapInRadius();
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
          const rect = safeRect(card);
          if (!rect) continue;
          const dist = distanceToRect(x, y, rect);
          if (dist > expandedZone) continue;
          const key = cardPosteriorKey(anchor, rect);
          candidates.push({ anchor, rect, dist, key });
        }

        // v17.4: AGGRESSIVE decay for cards no longer in the candidate
        // set. Previously we faded slowly via (1-alpha), which meant a
        // previously-fixated card kept a stale ~0.85 posterior for many
        // frames AFTER gaze had moved on — preventing the NEW card
        // from ever crossing the commit threshold. Now we multiply by
        // bayesianOutOfZoneDecay (default 0.35 = 65% loss per frame),
        // so a stale belief drops below the 0.45 commit threshold
        // within 1–2 frames of looking away.
        const outOfZoneDecay = Number(window.gcConfig?.bayesianOutOfZoneDecay || 0.35);
        const candidateKeySet = new Set(candidates.map((c) => c.key));
        const posteriors = state.cardPosteriors;
        for (const k in posteriors) {
          if (!candidateKeySet.has(k)) {
            posteriors[k] *= outOfZoneDecay;
            if (posteriors[k] < 0.02) delete posteriors[k];
          }
        }

        if (candidates.length === 0) return null;

        // Likelihoods.
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

        // Renormalise (sum across all live posteriors = 1).
        let totalP = 0;
        for (const k in posteriors) totalP += posteriors[k];
        if (totalP > 0) {
          for (const k in posteriors) posteriors[k] /= totalP;
        }

        // Pick max posterior among current candidates.
        let bestCandidate = null;
        let bestP = 0;
        for (const c of candidates) {
          const p = posteriors[c.key] || 0;
          if (p > bestP) {
            bestP = p;
            bestCandidate = c;
          }
        }

        if (!bestCandidate) return null;
        // Always allow a locked card to keep winning even below the
        // commit threshold — once committed, we stay until the dwell
        // logic above breaks lock (gaze leaves the unsnap radius).
        const lockedWin = isLockedYoutubeCard(bestCandidate.anchor);
        if (!lockedWin && bestP < commitThreshold) return null;

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
        // Falls through to nearest-distance otherwise so behaviour
        // degrades gracefully if the posterior hasn't built up yet.
        const ytBayesian = bayesianYoutubeCard(x, y);
        if (ytBayesian) return ytBayesian;

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
          state.start = now;
          state.clicked = false;
          state.targetKey = clickReq?.key || '';
          state.targetRect = clickReq?.rect || null;
          cursor.classList.remove('clicking');
          return null;
        }

        // v17.6 Option A: dwell stability restored — cancel any pending
        // visual-continuity expiry. From here the live dwell drives
        // the ring class as normal.
        state.dwellingExpiryAt = 0;

        if (sameTarget && clickReq?.rect) {
          // Refresh the rect — page content can shift while the user
          // dwells (lazy load, animations, ad insertion). Without
          // this, a slightly-moved target would fail the
          // pointInsideRect check and reset the dwell.
          state.targetRect = clickReq.rect;
        }

        const elapsed = now - state.start;
        if (elapsed > onsetMs && !state.clicked) cursor.classList.add('dwelling');

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
            }
          } catch (_) { /* never block click on telemetry */ }

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

      // R1: expose BrowserView telemetry for live inspection.
      // From the BrowserView DevTools console:
      //   __gcTelemetry.snapshot()  → aggregates
      //   __gcTelemetry.events()    → raw event ring
      //   __gcTelemetry.clear()     → wipe buffer
      window.__gcTelemetry = {
        events: function () { return state.telemetry.slice(); },
        clear: function () { state.telemetry.length = 0; state.clickSeq = 0; },
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
