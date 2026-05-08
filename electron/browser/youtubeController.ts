import type { YoutubeState } from './browserDiagnostics';

export type YoutubeCommand =
  | 'play'
  | 'play_pause'
  | 'next'
  | 'skip_ad'
  | 'show_controls'
  | 'hide_controls'
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
};

export const YOUTUBE_COMMANDS = new Set<YoutubeCommand>([
  'play',
  'play_pause',
  'next',
  'skip_ad',
  'show_controls',
  'hide_controls',
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

      const normalizeButton = (el) =>
        el && (el.closest('button, [role="button"], .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-next-button, .ytp-play-button') || el);

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

      const findSkipButton = () => {
        const selectors = [
          '.ytp-ad-skip-button',
          '.ytp-ad-skip-button-modern',
          '.ytp-skip-ad-button',
          '.ytp-ad-skip-button-container button',
          '.videoAdUiSkipButton',
          'button[aria-label*="Skip" i]',
          '[role="button"][aria-label*="Skip" i]',
          '[title*="Skip" i]',
          '[data-title-no-tooltip*="Skip" i]'
        ];
        const skipTextPattern = /skip|\\u091b\\u094b\\u0921|\\u091b\\u094b\\u095c/i;
        const hasSkipIntent = (el) => {
          if (!el) return false;
          const text = [
            el.textContent || '',
            el.getAttribute?.('aria-label') || '',
            el.getAttribute?.('title') || '',
            el.getAttribute?.('data-title-no-tooltip') || '',
            el.className || ''
          ].join(' ');
          return skipTextPattern.test(text);
        };
        const roots = [player, document];
        const candidates = [];
        for (const root of roots) {
          for (const selector of selectors) {
            try { root.querySelectorAll(selector).forEach((el) => candidates.push(normalizeButton(el))); } catch (_) {}
          }
        }
        document.querySelectorAll('button, [role="button"], .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button')
          .forEach((el) => {
            const text = [
              el.textContent || '',
              el.getAttribute('aria-label') || '',
              el.getAttribute('title') || '',
              el.getAttribute('data-title-no-tooltip') || ''
            ].join(' ');
            if (skipTextPattern.test(text)) candidates.push(normalizeButton(el));
          });
        const seen = new Set();
        for (const candidate of candidates) {
          if (!candidate || seen.has(candidate)) continue;
          seen.add(candidate);
          if (visible(candidate) && hasSkipIntent(candidate)) return candidate;
        }
        return null;
      };

      const youtubeState = getYoutubeState();

      if (command === 'get_state') {
        return { ok: true, status: 'done', detail: youtubeState, youtubeState };
      }

      if (command === 'skip_ad') {
        const button = findSkipButton();
        if (button) {
          return { ok: true, status: 'done', detail: 'skip_trusted_click', youtubeState: getYoutubeState(), trustedClick: centerOf(button) };
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
              const buttonAfterApi = normalizeButton(player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button'));
              if (afterState !== 'playing' && visible(buttonAfterApi)) {
                return { ok: true, status: 'done', detail: 'player_recover_trusted_click', youtubeState: afterState, trustedClick: centerOf(buttonAfterApi) };
              }
              return { ok: true, status: stalledAtStart ? 'stalled' : 'done', detail: 'player_recover_play', youtubeState: getYoutubeState() };
            }
            if (s === 1) player.pauseVideo(); else player.playVideo();
            return { ok: true, status: 'done', detail: 'player_api', youtubeState: getYoutubeState() };
          }
        } catch (_) {}

        if (video) {
          try {
            if (stalledAtStart || video.paused) video.play?.(); else video.pause?.();
            const afterState = getYoutubeState();
            const buttonAfterVideo = normalizeButton(player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button'));
            if ((stalledAtStart || afterState !== 'playing') && visible(buttonAfterVideo)) {
              return { ok: true, status: 'done', detail: 'video_recover_trusted_click', youtubeState: afterState, trustedClick: centerOf(buttonAfterVideo) };
            }
            return { ok: true, status: stalledAtStart ? 'stalled' : 'done', detail: 'video_element', youtubeState: getYoutubeState() };
          } catch (_) {}
        }

        const playButton = normalizeButton(player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button'));
        if (visible(playButton)) {
          return { ok: true, status: 'done', detail: 'play_button', youtubeState, trustedClick: centerOf(playButton) };
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
            const buttonAfterApi = normalizeButton(player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button'));
            if (afterState !== 'playing' && visible(buttonAfterApi)) {
              return { ok: true, status: 'done', detail: 'player_api_trusted_click', youtubeState: afterState, trustedClick: centerOf(buttonAfterApi) };
            }
            return { ok: true, status: 'done', detail: 'player_api_play', youtubeState: afterState };
          }
        } catch (_) {}

        if (video) {
          try {
            if (!video.paused) return { ok: true, status: 'done', detail: 'already_playing', youtubeState: getYoutubeState() };
            video.play?.();
            const afterState = getYoutubeState();
            const buttonAfterVideo = normalizeButton(player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button'));
            if (afterState !== 'playing' && visible(buttonAfterVideo)) {
              return { ok: true, status: 'done', detail: 'video_element_trusted_click', youtubeState: afterState, trustedClick: centerOf(buttonAfterVideo) };
            }
            return { ok: true, status: 'done', detail: 'video_element_play', youtubeState: afterState };
          } catch (_) {}
        }

        const playButton = normalizeButton(player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button'));
        if (visible(playButton)) {
          return { ok: true, status: 'done', detail: 'play_button', youtubeState, trustedClick: centerOf(playButton) };
        }
        return { ok: false, status: 'failed', detail: 'no_play_target', youtubeState };
      }

      if (command === 'next') {
        try {
          if (player && typeof player.nextVideo === 'function') {
            player.nextVideo();
            return { ok: true, status: 'done', detail: 'player_api', youtubeState: getYoutubeState() };
          }
        } catch (_) {}

        const nextButton = normalizeButton(player.querySelector?.('.ytp-next-button') || document.querySelector('.ytp-next-button'));
        if (visible(nextButton) && nextButton.getAttribute('aria-disabled') !== 'true') {
          return { ok: true, status: 'done', detail: 'next_button', youtubeState, trustedClick: centerOf(nextButton) };
        }

        const playlistItem = document.querySelector('ytd-playlist-panel-video-renderer:not([selected]) a#thumbnail[href*="/watch"], ytd-compact-video-renderer a#thumbnail[href*="/watch"], ytd-video-renderer a#thumbnail[href*="/watch"]');
        if (visible(playlistItem)) {
          return { ok: true, status: 'done', detail: 'playlist_fallback', youtubeState, trustedClick: centerOf(playlistItem) };
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

      return { ok: false, status: 'failed', detail: 'unhandled_command', youtubeState };
    })(${JSON.stringify(command)});
  `;
}
