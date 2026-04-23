/**
 * GazeConnect Pro - CalibrationScreen
 * ====================================
 * Full-screen overlay for in-app gaze calibration.
 *
 * ALS-friendly design:
 * - Large pulsing targets (80px → shrinks on fixation)
 * - Fully gaze-driven (no clicks/touches needed)
 * - Audio cues for state transitions
 * - Animated progress ring during sample collection
 * - Clear accuracy results with visual offset map
 *
 * Flow:
 * 1. Shows "Get Ready" intro for 2s
 * 2. 9 targets appear one-by-one in serpentine order
 * 3. Each target: pulse → fixation detected → collect → ✓
 * 4. Validation target (gold) at off-grid position
 * 5. Results screen with accuracy improvement
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================
// TYPES
// ============================================

interface CalibrationTarget {
  index: number;
  x: number;    // normalized 0-1
  y: number;
  total: number;
}

interface CalibrationPointResult {
  target: [number, number];
  offset: [number, number];
  accuracy_px: number;
}

interface CalibrationResults {
  is_valid: boolean;
  improvement_pct: number;
  validation_error_px: number;
  pre_correction_error_px?: number;
  post_correction_error_px?: number;
  point_results: CalibrationPointResult[];
}

type CalibrationPhase =
  | 'intro'          // "Get Ready" countdown
  | 'waiting'        // Target shown, waiting for fixation
  | 'collecting'     // Fixation detected, collecting samples
  | 'point_done'     // Brief checkmark display
  | 'transitioning'  // Pause between targets
  | 'validating'     // Validation target
  | 'results'        // Accuracy results screen
  | 'failed';

interface CalibrationScreenProps {
  /** WebSocket send function */
  send: (type: string, data?: Record<string, any>) => void;
  /** Subscribe to gaze data */
  subscribeGaze: (callback: (data: { x: number; y: number }) => void) => () => void;
  /** Close calibration overlay */
  onClose: () => void;
}

// ============================================
// CONSTANTS
// ============================================

const TARGET_SIZE = 80;           // Outer ring px
const TARGET_DOT_SIZE = 12;       // Inner dot px
const PROGRESS_RING_SIZE = 100;   // Progress ring px
const INTRO_DURATION = 3000;      // ms before first target
const POINT_DONE_DURATION = 600;  // ms for checkmark display

// ============================================
// COMPONENT
// ============================================

const CalibrationScreen: React.FC<CalibrationScreenProps> = ({
  send,
  subscribeGaze,
  onClose,
}) => {
  // State
  const [phase, setPhase] = useState<CalibrationPhase>('intro');
  const [currentTarget, setCurrentTarget] = useState<CalibrationTarget | null>(null);
  const [progress, setProgress] = useState(0);
  const [completedPoints, setCompletedPoints] = useState<number[]>([]);
  const [pointAccuracies, setPointAccuracies] = useState<Map<number, number>>(new Map());
  const [validationTarget, setValidationTarget] = useState<{ x: number; y: number } | null>(null);
  const [results, setResults] = useState<CalibrationResults | null>(null);
  const [gazePos, setGazePos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const [introCountdown, setIntroCountdown] = useState(3);

  // Refs
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ============================================
  // AUDIO FEEDBACK
  // ============================================

  const playTone = useCallback((freq: number, duration: number, type: OscillatorType = 'sine') => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }, []);

  const playTargetAppear = useCallback(() => playTone(440, 0.15), [playTone]);
  const playFixationDetected = useCallback(() => playTone(660, 0.1), [playTone]);
  const playPointComplete = useCallback(() => playTone(880, 0.2), [playTone]);
  const playCalibrationDone = useCallback(() => {
    playTone(523, 0.15);
    setTimeout(() => playTone(659, 0.15), 150);
    setTimeout(() => playTone(784, 0.3), 300);
  }, [playTone]);

  // ============================================
  // GAZE SUBSCRIPTION
  // ============================================

  useEffect(() => {
    const unsub = subscribeGaze((data) => {
      setGazePos({ x: data.x, y: data.y });
    });
    return unsub;
  }, [subscribeGaze]);

  // ============================================
  // INTRO COUNTDOWN
  // ============================================

  useEffect(() => {
    if (phase !== 'intro') return;

    const countdownTimer = setInterval(() => {
      setIntroCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimer);
          // Tell backend to start calibration
          send('start_calibration');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownTimer);
  }, [phase, send]);

  // ============================================
  // WEBSOCKET MESSAGE HANDLER
  // ============================================
  // These would be called by the parent component or a message router.
  // For now, we expose handler methods via useEffect + custom events.

  useEffect(() => {
    const handleWsMessage = (event: CustomEvent) => {
      const { type, data } = event.detail;

      switch (type) {
        case 'calibration_target':
          setCurrentTarget({
            index: data.index,
            x: data.x,
            y: data.y,
            total: data.total,
          });
          setProgress(0);
          setPhase('waiting');
          playTargetAppear();
          break;

        case 'calibration_collecting':
          setPhase('collecting');
          setProgress(0);
          playFixationDetected();
          break;

        case 'calibration_progress':
          setProgress(data.progress);
          break;

        case 'calibration_point_complete':
          setPhase('point_done');
          setCompletedPoints((prev) => [...prev, data.index]);
          setPointAccuracies((prev) => new Map(prev).set(data.index, data.accuracy_px));
          playPointComplete();
          // Brief pause to show checkmark
          setTimeout(() => setPhase('transitioning'), POINT_DONE_DURATION);
          break;

        case 'calibration_validation':
          setValidationTarget({ x: data.x, y: data.y });
          setCurrentTarget(null);
          setPhase('validating');
          setProgress(0);
          playTargetAppear();
          break;

        case 'calibration_complete':
          setResults(data as CalibrationResults);
          setPhase('results');
          playCalibrationDone();
          break;

        case 'calibration_failed':
          setPhase('failed');
          break;

        case 'calibration_cancelled':
          onClose();
          break;
      }
    };

    window.addEventListener('calibration_message' as any, handleWsMessage);
    return () => window.removeEventListener('calibration_message' as any, handleWsMessage);
  }, [onClose, playTargetAppear, playFixationDetected, playPointComplete, playCalibrationDone]);

  // ============================================
  // CANCEL HANDLER
  // ============================================

  const handleCancel = useCallback(() => {
    send('cancel_calibration');
    onClose();
  }, [send, onClose]);

  // ============================================
  // RENDER: INTRO PHASE
  // ============================================

  if (phase === 'intro') {
    return (
      <div style={styles.overlay}>
        <div style={styles.introContainer}>
          <div style={styles.introIcon}>
            {/* Eye icon using pure CSS */}
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <ellipse cx="40" cy="40" rx="35" ry="22" stroke="#00E5A0" strokeWidth="2.5" />
              <circle cx="40" cy="40" r="12" fill="#00E5A0" />
              <circle cx="40" cy="40" r="5" fill="#0D1117" />
              <circle cx="44" cy="37" r="2.5" fill="white" opacity="0.8" />
            </svg>
          </div>
          <h1 style={styles.introTitle}>Gaze Calibration</h1>
          <p style={styles.introSubtitle}>
            Look at each dot when it appears.
            <br />
            Hold your gaze steady until the ring fills.
          </p>
          <div style={styles.countdownCircle}>
            <span style={styles.countdownNumber}>{introCountdown}</span>
          </div>
          <p style={styles.introHint}>9 points • ~30 seconds</p>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: RESULTS PHASE
  // ============================================

  if (phase === 'results' && results) {
    const isGood = results.improvement_pct > 20;

    return (
      <div style={styles.overlay}>
        <div style={styles.resultsContainer}>
          <div style={{
            ...styles.resultsBadge,
            backgroundColor: isGood ? 'rgba(0, 229, 160, 0.15)' : 'rgba(255, 180, 50, 0.15)',
            borderColor: isGood ? '#00E5A0' : '#FFB432',
          }}>
            <span style={{ fontSize: '36px' }}>{isGood ? '✓' : '~'}</span>
          </div>

          <h1 style={styles.resultsTitle}>
            {isGood ? 'Calibration Successful' : 'Calibration Applied'}
          </h1>

          <p style={styles.resultsSubtitle}>
            Accuracy improved by{' '}
            <span style={{ color: '#00E5A0', fontWeight: 700 }}>
              {Math.round(results.improvement_pct)}%
            </span>
          </p>

          {/* Offset visualization */}
          <div style={styles.offsetGrid}>
            {results.point_results.map((pt, i) => {
              const left = pt.target[0] * 100;
              const top = pt.target[1] * 100;
              const offsetX = pt.offset[0] * 200; // Scale for visibility
              const offsetY = pt.offset[1] * 200;
              const errColor = pt.accuracy_px < 40 ? '#00E5A0' : pt.accuracy_px < 80 ? '#FFB432' : '#FF4D4D';

              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    top: `${top}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {/* Offset arrow */}
                  <svg width="60" height="60" viewBox="-30 -30 60 60"
                    style={{ position: 'absolute', left: '-30px', top: '-30px' }}>
                    <circle cx="0" cy="0" r="4" fill={errColor} />
                    <line
                      x1="0" y1="0"
                      x2={-offsetX} y2={-offsetY}
                      stroke={errColor}
                      strokeWidth="2"
                      markerEnd="none"
                    />
                    <circle cx={-offsetX} cy={-offsetY} r="2.5" fill={errColor} opacity="0.5" />
                  </svg>
                  <span style={{
                    position: 'absolute',
                    top: '12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '10px',
                    color: errColor,
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                  }}>
                    {Math.round(pt.accuracy_px)}px
                  </span>
                </div>
              );
            })}
          </div>

          <div style={styles.resultsStats}>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Before</span>
              <span style={styles.statValue}>
                {Math.round(results.pre_correction_error_px || 0)}px
              </span>
            </div>
            <div style={styles.statArrow}>→</div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>After</span>
              <span style={{ ...styles.statValue, color: '#00E5A0' }}>
                {Math.round(results.post_correction_error_px || results.validation_error_px)}px
              </span>
            </div>
          </div>

          {/* Continue button — gaze-activated via dwell */}
          <button
            onClick={onClose}
            style={styles.continueButton}
            data-dwell-id="calibration-continue"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: FAILED PHASE
  // ============================================

  if (phase === 'failed') {
    return (
      <div style={styles.overlay}>
        <div style={styles.introContainer}>
          <h1 style={styles.introTitle}>Calibration Failed</h1>
          <p style={styles.introSubtitle}>
            Could not collect enough data points.
            <br />
            Please ensure the eye tracker is working and try again.
          </p>
          <button onClick={handleCancel} style={styles.continueButton}>
            Close
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: ACTIVE CALIBRATION (waiting/collecting/validation)
  // ============================================

  // Determine target position
  let targetX = 0.5;
  let targetY = 0.5;
  let isValidation = false;

  if (phase === 'validating' && validationTarget) {
    targetX = validationTarget.x;
    targetY = validationTarget.y;
    isValidation = true;
  } else if (currentTarget) {
    targetX = currentTarget.x;
    targetY = currentTarget.y;
  }

  const screenX = targetX * window.innerWidth;
  const screenY = targetY * window.innerHeight;

  // Gaze proximity to target (for visual feedback)
  const gazeDist = Math.sqrt(
    Math.pow((gazePos.x - targetX) * window.innerWidth, 2) +
    Math.pow((gazePos.y - targetY) * window.innerHeight, 2)
  );
  const maxDist = 200;
  const proximity = Math.max(0, 1 - gazeDist / maxDist);

  // Dynamic target size — shrinks as gaze approaches
  const dynamicSize = TARGET_SIZE * (1 - proximity * 0.4);

  const isCollecting = phase === 'collecting' || (phase === 'validating' && progress > 0);
  const isDone = phase === 'point_done';

  return (
    <div style={styles.overlay}>
      {/* Progress counter */}
      <div style={styles.progressBar}>
        <span style={styles.progressText}>
          {currentTarget
            ? `${completedPoints.length + (isDone ? 1 : 0)} of ${currentTarget.total}`
            : isValidation
            ? 'Verifying accuracy...'
            : ''}
        </span>
        {/* Mini dots showing completed points */}
        {currentTarget && (
          <div style={styles.miniDots}>
            {Array.from({ length: currentTarget.total }, (_, i) => (
              <div
                key={i}
                style={{
                  ...styles.miniDot,
                  backgroundColor: completedPoints.includes(i)
                    ? '#00E5A0'
                    : i === currentTarget.index && !isDone
                    ? '#ffffff'
                    : 'rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Instruction text */}
      <div style={styles.instruction}>
        {phase === 'waiting' && 'Look at the dot'}
        {phase === 'collecting' && 'Hold steady...'}
        {phase === 'point_done' && '✓'}
        {phase === 'validating' && 'One more — look at the gold dot'}
        {phase === 'transitioning' && ''}
      </div>

      {/* Target visualization */}
      {(phase !== 'transitioning') && (
        <div
          style={{
            position: 'absolute',
            left: screenX,
            top: screenY,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Progress ring (SVG) */}
          {isCollecting && (
            <svg
              width={PROGRESS_RING_SIZE}
              height={PROGRESS_RING_SIZE}
              style={{
                position: 'absolute',
                left: -PROGRESS_RING_SIZE / 2,
                top: -PROGRESS_RING_SIZE / 2,
              }}
            >
              <circle
                cx={PROGRESS_RING_SIZE / 2}
                cy={PROGRESS_RING_SIZE / 2}
                r={PROGRESS_RING_SIZE / 2 - 4}
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="3"
              />
              <circle
                cx={PROGRESS_RING_SIZE / 2}
                cy={PROGRESS_RING_SIZE / 2}
                r={PROGRESS_RING_SIZE / 2 - 4}
                fill="none"
                stroke={isValidation ? '#FFB432' : '#00E5A0'}
                strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * (PROGRESS_RING_SIZE / 2 - 4)}`}
                strokeDashoffset={`${2 * Math.PI * (PROGRESS_RING_SIZE / 2 - 4) * (1 - progress)}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${PROGRESS_RING_SIZE / 2} ${PROGRESS_RING_SIZE / 2})`}
                style={{ transition: 'stroke-dashoffset 0.1s linear' }}
              />
            </svg>
          )}

          {/* Checkmark on completion */}
          {isDone ? (
            <div style={styles.checkmark}>✓</div>
          ) : (
            <>
              {/* Outer ring — pulses when waiting */}
              <div
                style={{
                  width: dynamicSize,
                  height: dynamicSize,
                  borderRadius: '50%',
                  border: `2.5px solid ${isValidation ? '#FFB432' : isCollecting ? '#00E5A0' : 'rgba(255,255,255,0.5)'}`,
                  position: 'absolute',
                  left: -dynamicSize / 2,
                  top: -dynamicSize / 2,
                  animation: phase === 'waiting' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                  transition: 'width 0.3s, height 0.3s, left 0.3s, top 0.3s, border-color 0.3s',
                }}
              />

              {/* Center dot */}
              <div
                style={{
                  width: TARGET_DOT_SIZE,
                  height: TARGET_DOT_SIZE,
                  borderRadius: '50%',
                  backgroundColor: isValidation ? '#FFB432' : isCollecting ? '#00E5A0' : '#ffffff',
                  position: 'absolute',
                  left: -TARGET_DOT_SIZE / 2,
                  top: -TARGET_DOT_SIZE / 2,
                  boxShadow: `0 0 ${isCollecting ? 20 : 10}px ${isValidation ? '#FFB432' : isCollecting ? '#00E5A0' : 'rgba(255,255,255,0.3)'}`,
                  transition: 'background-color 0.3s, box-shadow 0.3s',
                }}
              />
            </>
          )}
        </div>
      )}

      {/* Cancel button (top-right) */}
      <button
        onClick={handleCancel}
        style={styles.cancelButton}
        data-dwell-id="calibration-cancel"
      >
        ✕ Cancel
      </button>

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.15); }
        }
      `}</style>
    </div>
  );
};

// ============================================
// STYLES
// ============================================

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: '#0D1117',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Segoe UI', 'Inter', system-ui, sans-serif",
  },

  // --- Intro ---
  introContainer: {
    textAlign: 'center',
    maxWidth: 480,
    padding: 40,
  },
  introIcon: {
    marginBottom: 24,
  },
  introTitle: {
    fontSize: 32,
    fontWeight: 600,
    color: '#E6EDF3',
    margin: '0 0 12px',
    letterSpacing: '-0.5px',
  },
  introSubtitle: {
    fontSize: 16,
    color: '#8B949E',
    lineHeight: 1.6,
    margin: '0 0 32px',
  },
  countdownCircle: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    border: '3px solid #00E5A0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  },
  countdownNumber: {
    fontSize: 36,
    fontWeight: 700,
    color: '#00E5A0',
    fontVariantNumeric: 'tabular-nums',
  },
  introHint: {
    fontSize: 13,
    color: '#484F58',
    margin: 0,
  },

  // --- Active Calibration ---
  progressBar: {
    position: 'absolute',
    top: 32,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  progressText: {
    fontSize: 14,
    color: '#8B949E',
    fontWeight: 500,
  },
  miniDots: {
    display: 'flex',
    gap: 8,
  },
  miniDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    transition: 'background-color 0.3s',
  },
  instruction: {
    position: 'absolute',
    bottom: 60,
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: 18,
    color: '#8B949E',
    fontWeight: 400,
    textAlign: 'center',
  },
  checkmark: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    backgroundColor: '#00E5A0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
    color: '#0D1117',
    fontWeight: 700,
    position: 'absolute',
    left: -24,
    top: -24,
  },
  cancelButton: {
    position: 'absolute',
    top: 24,
    right: 24,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#8B949E',
    padding: '8px 16px',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // --- Results ---
  resultsContainer: {
    textAlign: 'center',
    maxWidth: 520,
    padding: 40,
  },
  resultsBadge: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: '2.5px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  },
  resultsTitle: {
    fontSize: 28,
    fontWeight: 600,
    color: '#E6EDF3',
    margin: '0 0 8px',
    letterSpacing: '-0.3px',
  },
  resultsSubtitle: {
    fontSize: 16,
    color: '#8B949E',
    margin: '0 0 32px',
  },
  offsetGrid: {
    position: 'relative',
    width: 320,
    height: 200,
    margin: '0 auto 32px',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  resultsStats: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 32,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#484F58',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 600,
    color: '#E6EDF3',
    fontVariantNumeric: 'tabular-nums',
  },
  statArrow: {
    fontSize: 20,
    color: '#484F58',
  },
  continueButton: {
    background: '#00E5A0',
    border: 'none',
    borderRadius: 12,
    color: '#0D1117',
    padding: '14px 48px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.3px',
  },
};

export default CalibrationScreen;
