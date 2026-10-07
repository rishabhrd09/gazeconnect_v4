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
  | 'get_state'
  | 'maximize'
  | 'restore'
  | 'is_maximized'
  | 'tidy_page';

export type YoutubeCommandResult = {
  ok: boolean;
  status:
    | 'done'
    | 'waiting_for_skip'
    | 'no_ad'
    | 'no_next'
    | 'buffering'
    | 'stalled'
    | 'failed'
    | 'none';
  detail?: string;
  youtubeState?: YoutubeState;
  trustedClick?: { x: number; y: number };
  blockDwellMs?: number;
  /** get_state only: YouTube's own Skip Ad button is on screen and can be pressed now. */
  skippable?: boolean;
  /** is_maximized / maximize / restore: the in-app full-screen layout is applied. */
  maximized?: boolean;
  /** get_state: video, playlist and mix choices on the page (0 on an empty YouTube Home). */
  videoChoices?: number;
  /** get_state: the page's title without " - YouTube". */
  title?: string;
  /** get_state: one of YouTube's promo popups ("Into music? We are too.") is over the page. */
  promo?: boolean;
  /** get_state: YouTube's miniplayer is playing the last video over this page. */
  miniplayer?: boolean;
  /** get_state: where the video is, in whole seconds (to reopen it there after a player error). */
  time?: number | null;
  /** tidy_page: a promo was answered with its own No thanks. */
  dismissedPromo?: boolean;
  /** tidy_page: the miniplayer was closed with its own button. */
  closedMiniplayer?: boolean;
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
  'maximize',
  'restore',
  'is_maximized',
  'tidy_page',
]);

export function isYoutubeCommand(command: string): command is YoutubeCommand {
  return YOUTUBE_COMMANDS.has(command as YoutubeCommand);
}

// ── In-app full screen ───────────────────────────────────────────────────────
// Moved here from WebBrowsingScreen.tsx (6 Oct 2026) so the interface sends a
// command name instead of page script: the window can no longer run arbitrary
// code in a web page. Behaviour unchanged.
//
// v17.16 safety path: this maximizes YouTube inside the BrowserView, without
// entering true browser fullscreen (which the browser session now refuses
// anyway). It uses YouTube's OWN theater mode instead of CSS-forcing the player
// size: forcing 100vw/100vh never fired the player's repaint (blank white
// player), and pinning #movie_player position:fixed was trapped by an ancestor
// transform (black, mis-sized video). Theater mode lets YouTube size and paint
// the player; the injected CSS only HIDES the chrome around it, which can never
// blank the player. If a selector is missing, the page simply stays normal.
const YOUTUBE_MAXIMIZE_SCRIPT = `
(function () {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
  } catch (_) {}
  var flexy = document.querySelector('ytd-watch-flexy');
  if (flexy && !flexy.hasAttribute('theater')) {
    var sizeBtn = document.querySelector('.ytp-size-button');
    if (sizeBtn) {
      try { sizeBtn.click(); } catch (_) {}
    } else {
      // Fallback: 't' is YouTube's theater-mode hotkey.
      var pl = document.querySelector('#movie_player') || document.body;
      try {
        pl.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', keyCode: 84, which: 84, bubbles: true }));
      } catch (_) {}
    }
  }
  var styleId = 'gazeconnect-youtube-inapp-maximize-style';
  var style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    (document.head || document.documentElement).appendChild(style);
  }
  // The #columns hide is scoped to [theater]: only then does the player live
  // in #full-bleed-container ABOVE #columns; in normal mode it is inside it.
  style.textContent = [
    'html.gazeconnect-youtube-inapp-maximize, html.gazeconnect-youtube-inapp-maximize body {',
    '  overflow: hidden !important; background: #000 !important;',
    '}',
    'html.gazeconnect-youtube-inapp-maximize #masthead-container { display: none !important; }',
    'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy[theater] #columns { display: none !important; }',
    // The player fills the whole view: no gap where the hidden header was, no page below it.
    'html.gazeconnect-youtube-inapp-maximize ytd-app, html.gazeconnect-youtube-inapp-maximize ytd-page-manager { background: #000 !important; }',
    'html.gazeconnect-youtube-inapp-maximize ytd-page-manager { margin-top: 0 !important; }',
    'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy[theater] #full-bleed-container { height: 100vh !important; max-height: 100vh !important; min-height: 0 !important; }'
  ].join('\\n');
  document.documentElement.classList.add('gazeconnect-youtube-inapp-maximize');
  var player = document.querySelector('#movie_player');
  if (player) {
    try { player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 30 })); } catch (_) {}
  }
  try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch (_) { window.scrollTo(0, 0); }
  // One settle-resize after the masthead hide changes the available height.
  try { window.dispatchEvent(new Event('resize')); } catch (_) {}
  return { ok: true, status: 'done', detail: 'in-app-video-theater', maximized: true };
})();
`;

// Exact reverse of the maximize script, idempotent (every step is guarded), so
// running it when nothing is maximized is a safe no-op.
const YOUTUBE_RESTORE_SCRIPT = `
(function () {
  try { document.documentElement.classList.remove('gazeconnect-youtube-inapp-maximize'); } catch (_) {}
  var style = document.getElementById('gazeconnect-youtube-inapp-maximize-style');
  if (style && style.parentNode) {
    try { style.parentNode.removeChild(style); } catch (_) {}
  }
  // Leave YouTube's theater mode, guarded on [theater] so it never toggles INTO it.
  var flexy = document.querySelector('ytd-watch-flexy');
  if (flexy && flexy.hasAttribute('theater')) {
    var sizeBtn = document.querySelector('.ytp-size-button');
    if (sizeBtn) {
      try { sizeBtn.click(); } catch (_) {}
    } else {
      var pl = document.querySelector('#movie_player') || document.body;
      try {
        pl.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', keyCode: 84, which: 84, bubbles: true }));
      } catch (_) {}
    }
  }
  var player = document.querySelector('#movie_player');
  if (player) {
    try { player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 30 })); } catch (_) {}
  }
  try { window.dispatchEvent(new Event('resize')); } catch (_) {}
  return { ok: true, status: 'done', detail: 'in-app-video-restored', maximized: false };
})();
`;

const YOUTUBE_IS_MAXIMIZED_SCRIPT = `({ ok: true, status: 'done', detail: 'probe', maximized: document.documentElement.classList.contains('gazeconnect-youtube-inapp-maximize') })`;

export function buildYoutubeCommandScript(command: YoutubeCommand): string {
  if (command === 'maximize') return YOUTUBE_MAXIMIZE_SCRIPT;
  if (command === 'restore') return YOUTUBE_RESTORE_SCRIPT;
  if (command === 'is_maximized') return YOUTUBE_IS_MAXIMIZED_SCRIPT;
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

      // An ad is on only while YouTube marks its player so (ad-showing, ad-interrupting) or shows
      // an ad's own overlay. Its ad containers (.video-ads, .ytp-ad-module) stay in the player
      // after an ad, empty and 0 x 0 (8 Oct 2026, live): counted, they made every video "an ad"
      // for good, so the bar's Play / Pause icon, a video's end and the calm full-screen rules
      // never saw a video play. Being there means nothing; being shown does.
      const shown = (el) => {
        if (!el || !el.getBoundingClientRect) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
      };
      const adPresent = () => {
        if (document.querySelector('.html5-video-player.ad-showing, .html5-video-player.ad-interrupting')) return true;
        const marks = document.querySelectorAll('.ytp-ad-player-overlay, .ytp-ad-player-overlay-layout, .ytp-ad-preview-container, .ytp-ad-text');
        for (let i = 0; i < marks.length; i++) if (shown(marks[i])) return true;
        return false;
      };

      // 8 Oct 2026 — what gaze cannot reach on YouTube (the page takes no gaze while a video
      // is watched): its promo popups over the video ("Into music? We are too."), its
      // miniplayer that keeps the last video playing over the next page after Back, and its
      // own player error ("Something went wrong. Refresh or try again later.").
      const findPromo = () => {
        const list = document.querySelectorAll('yt-mealbar-promo-renderer, ytd-mealbar-promo-renderer');
        for (let i = 0; i < list.length; i++) if (visible(list[i])) return list[i];
        return null;
      };
      const miniplayerActive = () => {
        const app = document.querySelector('ytd-app');
        return !!(app && app.hasAttribute && app.hasAttribute('miniplayer-is-active'));
      };
      // Only YouTube's own error screen: a media error alone may be one it is already retrying.
      const playerError = () => visible(document.querySelector('.ytp-error'));

      const getYoutubeState = () => {
        try {
          if (/\\/results\\b/.test(location.pathname)) return 'search_results';
          if (!/\\/watch\\b|\\/shorts\\b/.test(location.pathname) && !video) return 'idle';
          if (/\\/watch\\b/.test(location.pathname) && playerError()) return 'error';
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

      // The centre of an element in the page's view, for a real click by the main process:
      // only when the element is on screen (brought there first, as pressElement does) and a
      // click at that point reaches the element itself, not something lying over it.
      const clickPointOn = (el) => {
        const onScreen = (r) => r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 &&
          r.right <= window.innerWidth && r.bottom <= window.innerHeight;
        let rect = el.getBoundingClientRect();
        if (!onScreen(rect)) {
          try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
          rect = el.getBoundingClientRect();
          if (!onScreen(rect)) return null;
        }
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        let hit = null;
        try { hit = document.elementFromPoint(x, y); } catch (_) { hit = null; }
        if (!hit || (hit !== el && !el.contains(hit))) return null;
        return { x: Math.round(x), y: Math.round(y) };
      };

      const youtubeState = getYoutubeState();

      if (command === 'get_state') {
        // The Skip Ad control is offered only while YouTube's own skip button is pressable.
        const skippable = youtubeState === 'ad_waiting' && !!findSkipButton();
        // The video choices on screen (none on a new profile's empty Home) and the page's own title.
        let videoChoices = 0;
        try {
          videoChoices = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-panel-video-renderer').length;
        } catch (_) {}
        const title = String(document.title || '').replace(/\\s*-\\s*YouTube\\s*$/i, '').slice(0, 160);
        const time = video && Number.isFinite(video.currentTime) ? Math.floor(video.currentTime) : null;
        return { ok: true, status: 'done', detail: youtubeState, youtubeState, skippable, videoChoices, title,
          promo: !!findPromo(), miniplayer: miniplayerActive(), time };
      }

      // Answers a promo with its own No thanks, and closes the miniplayer with its own button
      // once the page is not a video (the person has gone Back, Home or to a search). Never
      // anything else: other dialogs (sign-in, consent) are left to YouTube.
      if (command === 'tidy_page') {
        let dismissedPromo = false;
        let closedMiniplayer = false;
        const promo = findPromo();
        if (promo) {
          const no = promo.querySelector('#dismiss-button button, #dismiss-button [role="button"], #dismiss-button');
          if (no) { try { no.click(); dismissedPromo = true; } catch (_) {} }
          if (!dismissedPromo) {
            const box = (promo.closest && promo.closest('tp-yt-paper-dialog')) || promo;
            try { box.style.setProperty('display', 'none', 'important'); dismissedPromo = true; } catch (_) {}
          }
        }
        if (miniplayerActive() && !/\\/watch\\b/.test(location.pathname)) {
          const close = document.querySelector('ytd-miniplayer .ytp-miniplayer-close-button, .ytp-miniplayer-close-button');
          if (close) { try { close.click(); closedMiniplayer = true; } catch (_) {} }
          if (!closedMiniplayer && video) { try { video.pause(); closedMiniplayer = true; } catch (_) {} }
        }
        return { ok: true, status: dismissedPromo || closedMiniplayer ? 'done' : 'none', dismissedPromo, closedMiniplayer,
          youtubeState: getYoutubeState() };
      }

      if (command === 'skip_ad') {
        const button = findSkipButton();
        if (button) {
          // 8 Oct 2026, live: YouTube's Skip button no longer answers a script-made press (the
          // ad played on), while a real click at its centre skipped the ad at once. So the main
          // process clicks the button's centre, as a hand would, whenever that point is the
          // button itself. Never both: when a script press still skipped, the real click that
          // followed it landed on the video and paused it (the May 2026 regression).
          const point = clickPointOn(button);
          if (point) {
            return {
              ok: true,
              status: 'done',
              detail: 'skip_trusted_click',
              trustedClick: point,
              youtubeState,
              blockDwellMs: 1500
            };
          }
          // Something lies over the button, or it cannot be brought on screen: the script press,
          // never a real click that could reach the video.
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
