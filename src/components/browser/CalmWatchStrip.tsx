/**
 * The black strip under a full-screen YouTube video and its single control (calm full-screen
 * video, 7 Oct 2026; the rules are in calmWatch.ts). The strip is not a gaze target: no
 * button role and no gaze attributes, so only the counted look offers Show options. A
 * caregiver's mouse click on it brings the bar back at once.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import GazeButton from '../core/GazeButton';
import {
  calmActionTaken, calmControlUsed, calmHide, calmHintShown, calmLookProgress, calmMovedAway, calmReveal, calmStart, calmTick, calmZoneOf,
  type CalmPhase, type CalmPlayback, type CalmState,
} from './calmWatch';

/** The latest fresh gaze point in window CSS px, or null when there is none. */
export type GazePointSource = () => { x: number; y: number } | null;

const UPDATE_MS = 33;

/**
 * Runs the calm rules while `active` (a video in Watch, in full screen). Only a change of phase
 * or of the hint re-renders; the line's progress is written straight to its element.
 */
export function useCalmWatch({ active, holdMs, getGaze, stripRef, barRef, playback, playbackKey, listening }: {
  active: boolean;
  holdMs: number;
  getGaze?: GazePointSource;
  stripRef: React.RefObject<HTMLElement>;
  barRef: React.RefObject<HTMLElement>;
  /** What the video is doing (from the page's polled state): the end of a video or a pause brings
   *  the bar back and keeps it; after an action the bar goes once the video plays. */
  playback: CalmPlayback;
  /** What identifies one report: the playback and the video it is about. A new video is a new
   *  report even when both say "playing" (YouTube can go from one to the next between polls). */
  playbackKey?: string;
  /** Gaze counts (the player's bar answers gaze): otherwise only a mouse click reveals. */
  listening: boolean;
}) {
  const [phase, setPhase] = useState<CalmPhase>('watching');
  const [hint, setHint] = useState(false);
  // The bar's gaze waits until the eyes have left the spot where Show options was (calmMovedAway).
  const [barGazeReady, setBarGazeReady] = useState(true);
  const revealPointRef = useRef<{ x: number; y: number } | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<CalmState | null>(null);
  const live = useRef({ holdMs, getGaze, playback, playbackKey, listening });
  live.current = { holdMs, getGaze, playback, playbackKey, listening };
  // Each change of the reported playback, and the report seen when an action was taken: the
  // report from before Next (the old video still "playing") must not count towards hiding the
  // bar over the next one.
  const playbackSeqRef = useRef(0);
  const lastPlaybackRef = useRef<string | null>(null);
  const actionSeqRef = useRef(-1);

  const publish = useCallback((state: CalmState) => {
    setPhase(previous => (previous === state.phase ? previous : state.phase));
    const shown = calmHintShown(state);
    setHint(previous => (previous === shown ? previous : shown));
    const fill = progressRef.current;
    if (fill) fill.style.transform = `scaleX(${calmLookProgress(state, live.current.holdMs).toFixed(3)})`;
  }, []);

  useEffect(() => {
    if (!active) {
      stateRef.current = null;
      revealPointRef.current = null;
      setPhase('watching');
      setHint(false);
      setBarGazeReady(true);
      return;
    }
    const start = calmStart(performance.now());
    stateRef.current = start;
    publish(start);
    const timer = window.setInterval(() => {
      const current = stateRef.current;
      if (!current) return;
      const { holdMs: hold, getGaze: gaze, playback: reported, playbackKey: key, listening: counting } = live.current;
      const report = key ?? reported;
      if (report !== lastPlaybackRef.current) {
        lastPlaybackRef.current = report;
        playbackSeqRef.current += 1;
      }
      const fresh = !current.hideAfterPlay || playbackSeqRef.current > actionSeqRef.current;
      const point = counting && gaze ? gaze() : null;
      const zone = calmZoneOf(point, current.phase,
        stripRef.current ? stripRef.current.getBoundingClientRect() : null,
        barRef.current ? barRef.current.getBoundingClientRect() : null,
        window.innerHeight);
      const next = calmTick(current, performance.now(), zone, hold, fresh ? reported : 'loading');
      stateRef.current = next;
      publish(next);
      if (revealPointRef.current && (next.phase !== 'controls' || calmMovedAway(revealPointRef.current, point))) {
        revealPointRef.current = null;
        setBarGazeReady(true);
      }
    }, UPDATE_MS);
    return () => window.clearInterval(timer);
  }, [active, publish, stripRef, barRef]);

  const reveal = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    const { getGaze: gaze, listening: counting } = live.current;
    const point = counting && gaze ? gaze() : null;
    revealPointRef.current = point;
    setBarGazeReady(!point);
    const next = calmReveal(current, performance.now());
    stateRef.current = next;
    publish(next);
  }, [publish]);

  const controlUsed = useCallback(() => {
    const current = stateRef.current;
    if (current) stateRef.current = calmControlUsed(current);
  }, []);

  // Next, Back, Play or Skip Ad on the bar: it goes once the video plays again (Pause keeps it).
  const actionTaken = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    actionSeqRef.current = playbackSeqRef.current;
    stateRef.current = calmActionTaken(current);
  }, []);

  // Hide options: the bar goes at once.
  const hide = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    const next = calmHide(current);
    stateRef.current = next;
    publish(next);
  }, [publish]);

  return { phase: active ? phase : null, hint, barGazeReady: !active || barGazeReady, progressRef, reveal, controlUsed, actionTaken, hide };
}

const EyeIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const CalmWatchStrip: React.FC<{
  phase: CalmPhase;
  hint: boolean;
  progressRef: React.RefObject<HTMLDivElement>;
  stripRef: React.RefObject<HTMLDivElement>;
  onReveal: () => void;
  gazeEnabled: boolean;
  gazeTimestamp: number;
}> = ({ phase, hint, progressRef, stripRef, onReveal, gazeEnabled, gazeTimestamp }) => (
  <div ref={stripRef} className="calm-strip" data-phase={phase} onClick={onReveal}
    aria-label="Video options: keep looking here to show them" title="Click to show the video options">
    {phase === 'watching' && hint && (
      <div className="calm-strip-hint" aria-live="polite">
        <span>Keep looking for options</span>
        <div className="calm-strip-track"><div className="calm-strip-fill" ref={progressRef} /></div>
      </div>
    )}
    {phase === 'offer' && (
      <GazeButton id="calm-show-options" className="calm-strip-offer" onClick={onReveal}
        gazeEnabled={gazeEnabled} gazeEnabledTimestamp={gazeTimestamp} isDarkMode dwellCategory="videoControl">
        <EyeIcon />
        <span>Show options</span>
      </GazeButton>
    )}
  </div>
);
