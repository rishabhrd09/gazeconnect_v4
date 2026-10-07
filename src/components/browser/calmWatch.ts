/**
 * Calm full-screen video (7 Oct 2026, maintainer request). While a YouTube video plays in
 * full screen nothing can be chosen: the bar under the video is replaced by a plain black
 * strip, because a person watching kept looking down and choosing a bar button by
 * accident (the bar answers gaze even with gaze paused, since the navigation bar holding
 * the gaze toggle is hidden during videos).
 *
 *  - watching: no control on screen. The eyes resting on the strip are counted; after
 *    VIDEO_REVEAL_TIMING.quietMs a thin line and "Keep looking for options" show the count,
 *    and at the chosen time (3, 4 or 5 s) the strip offers one Show options button.
 *  - offer: Show options, chosen like any bar button (Video controls time).
 *  - controls: the usual bar is back, with Hide options at its end; it hides after
 *    controlsIdleMs without the eyes on it, and stays while the video has ended or is paused.
 *    After Next, Back, Play or Skip Ad it hides once the video (not an ad) has played
 *    hideAfterActionMs (8 Oct 2026, maintainer request: no point in the bar over the next video).
 *
 * Blinks and the tracker's drop-outs (common when the eyes look down at the screen's bottom
 * edge) pause the count for up to gapGraceMs; the eyes back on the video for resetAwayMs start
 * it again. The count only starts once the eyes have rested on
 * the video: Full Screen is chosen with the eyes on the bar, where the strip then appears.
 *
 * Kept free of React so `npm run check:calm-video` can drive it with a virtual clock.
 */
import { VIDEO_REVEAL_TIMING } from '../../config/dwellTimeConfig';

export type CalmPhase = 'watching' | 'offer' | 'controls';
/** Where the gaze is: the strip, the bar (shown in controls), the video above, or no fresh sample. */
export type CalmZone = 'strip' | 'bar' | 'video' | 'none';
export type CalmTiming = typeof VIDEO_REVEAL_TIMING;
/** What the video is doing: playing (not an ad), paused, ended, an ad, or in between (loading, buffering). */
export type CalmPlayback = 'playing' | 'paused' | 'ended' | 'ad' | 'loading';

export interface CalmState {
  phase: CalmPhase;
  /** The eyes have rested on the video since calm (re)started: only then does looking down count. */
  armed: boolean;
  /** Time the eyes have rested on the strip; kept through short gaps and glances back. */
  lookMs: number;
  /** The current stretch without a fresh sample while the count is under way. */
  gapMs: number;
  /** The current stretch with the eyes on the video, while counting or offering. */
  awayMs: number;
  /** How long Show options has been on screen. */
  offerMs: number;
  /** Controls: time without the eyes on the bar. */
  idleMs: number;
  /** The video has ended: the bar stays until playback resumes. */
  ended: boolean;
  /** Next, Back, Play or Skip Ad was used on the bar: it goes once the video plays again. */
  hideAfterPlay: boolean;
  /** How long the video has played since then. */
  playMs: number;
  /** With the bar away: how long the video has been paused. */
  pausedMs: number;
  /** Time of the previous update (ms, any monotonic clock). */
  last: number;
}

/** A stalled update (a busy page, a sleeping laptop) is never turned into a long look. */
export const CALM_MAX_STEP_MS = 100;

export function calmStart(now: number): CalmState {
  return { phase: 'watching', armed: false, lookMs: 0, gapMs: 0, awayMs: 0, offerMs: 0, idleMs: 0, ended: false,
    hideAfterPlay: false, playMs: 0, pausedMs: 0, last: now };
}

const backToWatching = (state: CalmState, armed: boolean): CalmState => ({
  ...state, phase: 'watching', armed, lookMs: 0, gapMs: 0, awayMs: 0, offerMs: 0, idleMs: 0,
  hideAfterPlay: false, playMs: 0, pausedMs: 0,
});
const toControls = (state: CalmState): CalmState => ({
  ...state, phase: 'controls', lookMs: 0, gapMs: 0, awayMs: 0, offerMs: 0, idleMs: 0,
  hideAfterPlay: false, playMs: 0, pausedMs: 0,
});

/**
 * One update, about 30 times a second while full screen lasts. `playback` is what the video is
 * doing (a boolean is the earlier form: true for ended).
 */
export function calmTick(
  state: CalmState, now: number, zone: CalmZone, holdMs: number, playback: CalmPlayback | boolean = 'playing',
  timing: CalmTiming = VIDEO_REVEAL_TIMING,
): CalmState {
  const pb: CalmPlayback = playback === true ? 'ended' : playback === false ? 'playing' : playback;
  const dt = Math.max(0, Math.min(CALM_MAX_STEP_MS, now - state.last));
  let s: CalmState = { ...state, last: now };
  if (pb === 'ended') return { ...toControls(s), ended: true };
  if (s.ended) s = { ...s, ended: false, idleMs: 0 };   // playback resumed: the idle count starts now

  if (s.phase === 'controls') {
    // Paused (with the bar's Pause, or by YouTube): the bar stays while it lasts.
    if (pb === 'paused') return { ...s, idleMs: 0, playMs: 0 };
    // After Next, Back, Play or Skip Ad: the bar goes once the video (not an ad) plays again.
    if (s.hideAfterPlay) {
      const playMs = pb === 'playing' ? s.playMs + dt : 0;
      if (playMs >= timing.hideAfterActionMs) return backToWatching(s, false);
      s = { ...s, playMs };
    }
    if (zone === 'bar') return { ...s, idleMs: 0 };
    const idleMs = s.idleMs + dt;
    return idleMs >= timing.controlsIdleMs ? backToWatching(s, zone === 'video') : { ...s, idleMs };
  }

  // The bar is away and the video stops (YouTube paused it, or it will not play): the bar comes
  // back and stays while it is paused, as at the end of a video.
  if (pb === 'paused') {
    const pausedMs = s.pausedMs + dt;
    if (pausedMs >= timing.pausedShowMs) return toControls(s);
    s = { ...s, pausedMs };
  } else if (s.pausedMs) {
    s = { ...s, pausedMs: 0 };
  }

  if (s.phase === 'offer') {
    const offerMs = s.offerMs + dt;
    if (offerMs >= timing.offerTimeoutMs) return backToWatching(s, false);
    if (zone === 'video') {
      const awayMs = s.awayMs + dt;
      return awayMs >= timing.offerAwayMs ? backToWatching(s, true) : { ...s, offerMs, awayMs };
    }
    return { ...s, offerMs, awayMs: zone === 'none' ? s.awayMs : 0 };
  }

  // watching
  if (zone === 'video') {
    if (!s.armed) return { ...s, armed: true, lookMs: 0, gapMs: 0, awayMs: 0 };
    if (s.lookMs <= 0) return s;
    const awayMs = s.awayMs + dt;
    return awayMs >= timing.resetAwayMs ? { ...s, lookMs: 0, gapMs: 0, awayMs: 0 } : { ...s, awayMs, gapMs: 0 };
  }
  if (!s.armed) return s;
  if (zone === 'strip' || zone === 'bar') {
    const lookMs = s.lookMs + dt;
    if (lookMs >= holdMs) return { ...s, phase: 'offer', lookMs: holdMs, gapMs: 0, awayMs: 0, offerMs: 0 };
    return { ...s, lookMs, gapMs: 0, awayMs: 0 };
  }
  // No fresh sample: a blink or a drop-out pauses the count; a long one ends it.
  if (s.lookMs <= 0) return s;
  const gapMs = s.gapMs + dt;
  return gapMs > timing.gapGraceMs ? { ...s, lookMs: 0, gapMs: 0, awayMs: 0 } : { ...s, gapMs };
}

/** Next, Back, Play or Skip Ad used on the bar: it goes once the video plays again (Pause keeps it). */
export function calmActionTaken(state: CalmState): CalmState {
  return state.phase === 'controls' ? { ...state, hideAfterPlay: true, playMs: 0, idleMs: 0 } : state;
}

/**
 * Hide options: the bar goes at once. Like Full Screen itself it is chosen with the eyes down
 * there, so looking down counts again only once the eyes have rested on the video.
 */
export function calmHide(state: CalmState): CalmState {
  return state.phase === 'controls' ? backToWatching(state, false) : state;
}

/** Show options chosen, or the strip clicked with the mouse: the bar comes back. */
export function calmReveal(state: CalmState, now: number): CalmState {
  return { ...toControls(state), last: now };
}

/** A bar button was used: the bar stays for another full idle time. */
export function calmControlUsed(state: CalmState): CalmState {
  return state.phase === 'controls' ? { ...state, idleMs: 0 } : state;
}

/**
 * After Show options is chosen by gaze the eyes are still where it was, and a bar button now
 * sits there. The bar takes gaze only once they have moved this far from that point, so a look
 * that simply stays cannot choose the button that appeared under it (the mouse always works).
 */
export const CALM_REVEAL_MOVE_PX = 80;
export function calmMovedAway(
  revealPoint: { x: number; y: number } | null, point: { x: number; y: number } | null, distancePx = CALM_REVEAL_MOVE_PX,
): boolean {
  if (!revealPoint) return true;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  return Math.hypot(point.x - revealPoint.x, point.y - revealPoint.y) > distancePx;
}

/** How far the count has gone, for the strip's line: 0 until the quiet time has passed, then to 1. */
export function calmLookProgress(state: CalmState, holdMs: number, timing: CalmTiming = VIDEO_REVEAL_TIMING): number {
  if (state.phase !== 'watching' || state.lookMs < timing.quietMs) return 0;
  const span = Math.max(1, holdMs - timing.quietMs);
  return Math.max(0, Math.min(1, (state.lookMs - timing.quietMs) / span));
}

/** Whether "Keep looking for options" shows: once a look has outlasted a glance. */
export function calmHintShown(state: CalmState, timing: CalmTiming = VIDEO_REVEAL_TIMING): boolean {
  return state.phase === 'watching' && state.lookMs >= timing.quietMs;
}

type Box = { top: number };
/**
 * Which zone a gaze point (window CSS px) is in. The strip counts from stripEdgePx above its
 * top edge (a tracker reports a look at the bottom edge a little too high); anything reported
 * at or below the window's bottom edge is the strip too (the backend takes gaze just past the
 * screen edge to be at it). In controls, the bar and a stripEdgePx band above it count as the bar.
 */
export function calmZoneOf(
  point: { x: number; y: number } | null, phase: CalmPhase, strip: Box | null, bar: Box | null,
  viewportHeight: number, timing: CalmTiming = VIDEO_REVEAL_TIMING,
): CalmZone {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return 'none';
  if (phase === 'controls') {
    return bar && point.y >= bar.top - timing.stripEdgePx ? 'bar' : 'video';
  }
  if (point.y >= viewportHeight - 1) return 'strip';
  return strip && point.y >= strip.top - timing.stripEdgePx ? 'strip' : 'video';
}
