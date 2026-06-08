import type { YoutubeState } from './browserDiagnostics';

export type YoutubeCommand =
  | 'play'
  | 'play_pause'
  | 'next'
  | 'skip_ad'
  | 'show_controls'
  | 'hide_controls'
  | 'volume_up'
  | 'volume_down'
  | 'get_state';

export type YoutubeCommandResult = {
  ok: boolean;
  status:
    | 'done'
    | 'waiting_for_skip'
    | 'no_ad'
    | 'no_next'
    | 'buffering'
    | 'stalled'
    | 'failed';
  detail?: string;
  youtubeState?: YoutubeState;
  trustedClick?: { x: number; y: number };
  blockDwellMs?: number;
};

export const YOUTUBE_COMMANDS = new Set<YoutubeCommand>([
  'play',
  'play_pause',
  'next',
  'skip_ad',
  'show_controls',
  'hide_controls',
  'volume_up',
  'volume_down',
  'get_state',
]);

export function isYoutubeCommand(command: string): command is YoutubeCommand {
  return YOUTUBE_COMMANDS.has(command as YoutubeCommand);
}

export function buildYoutubeCommandScript(command: YoutubeCommand): string {
  return `
    (function(command) {
      const player = document.querySelector('#movie_player') || document;
      const video = player.querySelector?.('video') || document.querySelector('video');
      window.gcYouTubeController = window.gcYouTubeController || {};

      const visible = (el) => {
        if (!el || !el.getBoundingClientRect) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width >= 10 &&
          rect.height >= 10 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.pointerEvents !== 'none' &&
          Number(style.opacity || 1) > 0.05 &&
          !el.disabled &&
          el.getAttribute('aria-disabled') !== 'true';
      };

      const centerOf = (el) => {
        const rect = el.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2)
        };
      };

      // Walk UP only to button/role=button or known skip-ad classes —
      // never to .ytp-play-button or .ytp-next-button so a stray "skip"
      // match nested inside the play surface can't snap to play/pause.
      const normalizeSkipButton = (el) =>
        el && (el.closest('.ytp-ad-skip-button-modern, .ytp-skip-ad-button-modern, .ytp-ad-skip-button, .ytp-skip-ad-button, button, [role="button"]') || el);

      const SKIP_AD_CLASS_TOKENS = [
        'ytp-ad-skip-button',
        'ytp-ad-skip-button-modern',
        'ytp-skip-ad-button',
        'ytp-skip-ad-button-modern',
        'videoAdUiSkipButton'
      ];
      const skipAdTextPattern = /skip\\s*ad|ad\\s*skip|\\u091b\\u094b\\u0921\\s*\\u0935\\u093f\\u091c\\u094d\\u091e\\u093e\\u092a\\u0928|\\u0935\\u093f\\u091c\\u094d\\u091e\\u093e\\u092a\\u0928\\s*\\u091b\\u094b\\u0921/i;
      const countdownPattern = /\\b\\d+\\s*$|in\\s*\\d|skip\\s*in/i;

      const hasSkipAdClass = (el) => {
        if (!el) return false;
        const cls = String(el.className || '');
        return SKIP_AD_CLASS_TOKENS.some((token) => cls.indexOf(token) !== -1);
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

      // Skip-ad geometry sanity check. Real skip buttons are pill-shaped
      // ~50–320px wide and ~24–96px tall, sit in the lower-right of the
      // player. Anything wildly outside (e.g. the .ytp-ad-preview-container
      // which spans the full width) is rejected — clicking its center
      // lands on the video and toggles play/pause.
      const looksLikeSkipButtonRect = (rect) => {
        if (!rect) return false;
        if (rect.width < 50 || rect.width > 320) return false;
        if (rect.height < 20 || rect.height > 96) return false;
        const playerRect = (player.getBoundingClientRect && player !== document)
          ? player.getBoundingClientRect()
          : null;
        if (!playerRect || playerRect.width < 80 || playerRect.height < 80) return true;
        const cyRect = rect.top + rect.height / 2;
        const cxRect = rect.left + rect.width / 2;
        const playerMidY = playerRect.top + playerRect.height * 0.45;
        if (cyRect < playerMidY - 24) return false;
        const playerRightStart = playerRect.left + playerRect.width * 0.40;
        if (cxRect < playerRightStart) return false;
        return true;
      };

      const looksLikeSkipButton = (el) => {
        if (!visible(el)) return false;
        if (hasSkipAdClass(el)) return true;
        const label = labelOf(el);
        if (!skipAdTextPattern.test(label)) return false;
        // "Skip ad in 5" — countdown text is NOT a click target.
        if (countdownPattern.test(label)) return false;
        return true;
      };

      const adPresent = () =>
        !!document.querySelector('.ad-showing, .ytp-ad-player-overlay, .ytp-ad-module, .video-ads, .ytp-ad-text, .ytp-ad-preview-container');

      const getYoutubeState = () => {
        try {
          if (/\\/results\\b/.test(location.pathname)) return 'search_results';
          if (!/\\/watch\\b|\\/shorts\\b/.test(location.pathname) && !video) return 'idle';
          if (adPresent()) return 'ad_waiting';
          const spinner = visible(player.querySelector?.('.ytp-spinner, .ytp-spinner-container') || document.querySelector('.ytp-spinner, .ytp-spinner-container'));
          if (video && spinner && video.currentTime < 0.5) return 'stalled';
          if (player && typeof player.getPlayerState === 'function') {
            const s = player.getPlayerState();
            if (s === 1) return 'playing';
            if (s === 2) return 'paused';
            if (s === 3) return 'buffering';
            if (s === 0) return 'ended';
            if (s === 5 || s === -1) return 'ready';
          }
          if (video) {
            if (video.error) return 'error';
            if (video.readyState < 2) return 'watch_loading';
            if (video.paused) return 'paused';
            if (video.currentTime < 0.5 && video.readyState < 3) return 'stalled';
            return 'playing';
          }
          return /\\/watch\\b/.test(location.pathname) ? 'watch_loading' : 'idle';
        } catch (_) {
          return 'error';
        }
      };

      // Strict skip-ad finder. Only selectors that uniquely identify the
      // ad skip button are considered, plus a final sanity check on the
      // resulting rect.
      const findSkipButton = () => {
        const selectors = [
          '.ytp-ad-skip-button-modern',
          '.ytp-skip-ad-button-modern',
          '.ytp-ad-skip-button',
          '.ytp-skip-ad-button',
          '.ytp-ad-skip-button-container button',
          '.ytp-skip-ad-button-container button',
          '.videoAdUiSkipButton',
          'button.ytp-ad-skip-button',
          'button.ytp-skip-ad-button'
        ];
        const roots = [player, document];
        const seen = new Set();
        const candidates = [];

        for (const root of roots) {
          for (const selector of selectors) {
            try {
              root.querySelectorAll(selector).forEach((el) => {
                const norm = normalizeSkipButton(el);
                if (norm && !seen.has(norm)) {
                  seen.add(norm);
                  candidates.push(norm);
                }
              });
            } catch (_) {}
          }
        }

        // Aria-label fallback restricted to "skip ad" wording so chapter
        // skip / skip-intro / unrelated buttons don't slip through.
        try {
          document.querySelectorAll('button[aria-label*="Skip" i], [role="button"][aria-label*="Skip" i], [title*="Skip" i]')
            .forEach((el) => {
              if (!skipAdTextPattern.test(labelOf(el))) return;
              const norm = normalizeSkipButton(el);
              if (norm && !seen.has(norm)) {
                seen.add(norm);
                candidates.push(norm);
              }
            });
        } catch (_) {}

        for (const candidate of candidates) {
          if (!looksLikeSkipButton(candidate)) continue;
          const rect = candidate.getBoundingClientRect();
          if (!looksLikeSkipButtonRect(rect)) continue;
          return candidate;
        }
        return null;
      };

      // Synthetic click sequence on a known DOM element. Primary skip-ad
      // strategy — bypasses any coordinate hit-test ambiguity (overlapping
      // iframes, transformed surfaces). executeJavaScript runs with
      // userGesture=true from main.ts so YouTube's gesture-gated handlers
      // accept it.
      const pressElement = (el) => {
        if (!el) return false;
        try { el.scrollIntoView?.({ block: 'center', inline: 'center' }); } catch (_) {}
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const baseInit = {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          button: 0,
          buttons: 1,
          clientX: cx,
          clientY: cy,
          screenX: cx,
          screenY: cy
        };
        const sequence = [
          ['pointerover', 'PointerEvent'],
          ['pointerenter', 'PointerEvent'],
          ['mouseover', 'MouseEvent'],
          ['mouseenter', 'MouseEvent'],
          ['pointerdown', 'PointerEvent'],
          ['mousedown', 'MouseEvent'],
          ['pointerup', 'PointerEvent'],
          ['mouseup', 'MouseEvent'],
          ['click', 'MouseEvent']
        ];
        for (const [type, kind] of sequence) {
          try {
            const init = (type === 'pointerup' || type === 'mouseup' || type === 'click')
              ? Object.assign({}, baseInit, { buttons: 0 })
              : baseInit;
            const Ctor = (kind === 'PointerEvent' && typeof PointerEvent === 'function')
              ? PointerEvent
              : MouseEvent;
            el.dispatchEvent(new Ctor(type, Object.assign({ pointerType: 'mouse' }, init)));
          } catch (_) {}
        }
        try { el.click?.(); } catch (_) {}
        try { el.focus?.({ preventScroll: true }); } catch (_) {}
        return true;
      };

      const youtubeState = getYoutubeState();

      if (command === 'get_state') {
        return { ok: true, status: 'done', detail: youtubeState, youtubeState };
      }

      if (command === 'skip_ad') {
        const button = findSkipButton();
        if (button) {
          // Synthetic click is the primary strategy. Dispatching directly
          // on the button bypasses coordinate hit-tests so the click can
          // never accidentally land on the video element. We deliberately
          // do NOT return a trustedClick — a follow-up OS-level click at
          // the same coords would, after the ad disappears, hit the video
          // and toggle play/pause (the regression we are fixing).
          pressElement(button);
          return {
            ok: true,
            status: 'done',
            detail: 'skip_synthetic_click',
            youtubeState: getYoutubeState(),
            blockDwellMs: 1500
          };
        }
        return { ok: false, status: adPresent() ? 'waiting_for_skip' : 'no_ad', youtubeState };
      }

      if (command === 'play_pause') {
        const spinnerVisible = visible(player.querySelector?.('.ytp-spinner, .ytp-spinner-container') || document.querySelector('.ytp-spinner, .ytp-spinner-container'));
        const stalledAtStart = !!video && video.currentTime < 0.5 && (video.readyState < 3 || spinnerVisible || youtubeState === 'stalled' || youtubeState === 'buffering');

        try {
          if (player && typeof player.getPlayerState === 'function' && typeof player.playVideo === 'function' && typeof player.pauseVideo === 'function') {
            const s = player.getPlayerState();
            if (stalledAtStart || s === 3 || s === 5 || s === -1) {
              player.playVideo();
              try { video?.play?.(); } catch (_) {}
              const afterState = getYoutubeState();
              const playButton = player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button');
              if (afterState !== 'playing' && visible(playButton)) {
                pressElement(playButton);
              }
              return { ok: true, status: stalledAtStart ? 'stalled' : 'done', detail: 'player_recover_play', youtubeState: getYoutubeState(), blockDwellMs: 900 };
            }
            if (s === 1) player.pauseVideo(); else player.playVideo();
            return { ok: true, status: 'done', detail: 'player_api', youtubeState: getYoutubeState(), blockDwellMs: 900 };
          }
        } catch (_) {}

        if (video) {
          try {
            if (stalledAtStart || video.paused) video.play?.(); else video.pause?.();
            const afterState = getYoutubeState();
            const playButton = player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button');
            if ((stalledAtStart || afterState !== 'playing') && visible(playButton)) {
              pressElement(playButton);
            }
            return { ok: true, status: stalledAtStart ? 'stalled' : 'done', detail: 'video_element', youtubeState: getYoutubeState(), blockDwellMs: 900 };
          } catch (_) {}
        }

        const playButton = player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button');
        if (visible(playButton)) {
          pressElement(playButton);
          return { ok: true, status: 'done', detail: 'play_button_synthetic', youtubeState: getYoutubeState(), blockDwellMs: 900 };
        }
        return { ok: false, status: 'failed', detail: 'no_play_target', youtubeState };
      }

      if (command === 'play') {
        try {
          if (player && typeof player.getPlayerState === 'function' && typeof player.playVideo === 'function') {
            const s = player.getPlayerState();
            if (s === 1) return { ok: true, status: 'done', detail: 'already_playing', youtubeState: getYoutubeState() };
            player.playVideo();
            try { video?.play?.(); } catch (_) {}
            const afterState = getYoutubeState();
            const playButton = player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button');
            if (afterState !== 'playing' && visible(playButton)) {
              pressElement(playButton);
            }
            return { ok: true, status: 'done', detail: 'player_api_play', youtubeState: getYoutubeState(), blockDwellMs: 900 };
          }
        } catch (_) {}

        if (video) {
          try {
            if (!video.paused) return { ok: true, status: 'done', detail: 'already_playing', youtubeState: getYoutubeState() };
            video.play?.();
            const afterState = getYoutubeState();
            const playButton = player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button');
            if (afterState !== 'playing' && visible(playButton)) {
              pressElement(playButton);
            }
            return { ok: true, status: 'done', detail: 'video_element_play', youtubeState: getYoutubeState(), blockDwellMs: 900 };
          } catch (_) {}
        }

        const playButton = player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button');
        if (visible(playButton)) {
          pressElement(playButton);
          return { ok: true, status: 'done', detail: 'play_button_synthetic', youtubeState: getYoutubeState(), blockDwellMs: 900 };
        }
        return { ok: false, status: 'failed', detail: 'no_play_target', youtubeState };
      }

      if (command === 'next') {
        try {
          if (player && typeof player.nextVideo === 'function') {
            player.nextVideo();
            return { ok: true, status: 'done', detail: 'player_api', youtubeState: getYoutubeState(), blockDwellMs: 1200 };
          }
        } catch (_) {}

        const nextButton = player.querySelector?.('.ytp-next-button') || document.querySelector('.ytp-next-button');
        if (visible(nextButton) && nextButton.getAttribute('aria-disabled') !== 'true') {
          pressElement(nextButton);
          return { ok: true, status: 'done', detail: 'next_button_synthetic', youtubeState: getYoutubeState(), blockDwellMs: 1200 };
        }

        const playlistItem = document.querySelector('ytd-playlist-panel-video-renderer:not([selected]) a#thumbnail[href*="/watch"], ytd-compact-video-renderer a#thumbnail[href*="/watch"], ytd-video-renderer a#thumbnail[href*="/watch"]');
        if (visible(playlistItem)) {
          pressElement(playlistItem);
          return { ok: true, status: 'done', detail: 'playlist_fallback_synthetic', youtubeState: getYoutubeState(), blockDwellMs: 1200 };
        }
        return { ok: false, status: 'no_next', detail: 'no_next_target', youtubeState };
      }

      if (command === 'show_controls' || command === 'hide_controls') {
        const rect = (player.getBoundingClientRect && player.getBoundingClientRect()) || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
        player.dispatchEvent?.(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
        return { ok: true, status: 'done', detail: 'mousemove_controls', youtubeState };
      }

      if (command === 'volume_up' || command === 'volume_down') {
        const target = video || document.querySelector('video');
        if (!target) return { ok: false, status: 'failed', detail: 'no_video', youtubeState };
        try {
          const step = 0.1;
          let vol = Number(target.volume);
          if (!isFinite(vol)) vol = 0.5;
          if (command === 'volume_up') {
            target.muted = false;
            vol = Math.min(1, vol + step);
          } else {
            vol = Math.max(0, vol - step);
          }
          target.volume = vol;
          return { ok: true, status: 'done', detail: 'volume:' + vol.toFixed(2), youtubeState: getYoutubeState() };
        } catch (_) {
          return { ok: false, status: 'failed', detail: 'volume_error', youtubeState };
        }
      }

      return { ok: false, status: 'failed', detail: 'unhandled_command', youtubeState };
    })(${JSON.stringify(command)});
  `;
}
