/**
 * GazeConnect Pro - Ultimate GazeButton Component
 * ================================================
 * Research-backed gaze-selectable button with:
 * - Two-stage dwell (onset delay + feedback)
 * - Size-aware timing
 * - NO cursor display (prevents chase effect)
 * - Progress ring animation
 * - Accessibility compliant
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { darkColors, lightColors, buttonSizes, dwellTiming, layout, typography } from '../../utils/design';
import { GAZE_ENABLE_COOLDOWN_MS, POST_NAVIGATION_COOLDOWN_MS, useGazeControl } from './GazeControlToggle';
import { useDwellTime } from '../../contexts/DwellTimeContext';
import type { DwellTimeSettings } from '../../config/dwellTimeConfig';

// ============================================
// v17: REPEAT DWELL TRACKER (module-level singleton)
// Tracks the last selected button to enable faster repeat presses.
// OptiKey uses per-key completion time arrays: "1000,100,200"
// We track globally since only one button can be selected at a time.
// ============================================
const _repeatDwell = {
  lastButtonId: '' as string,
  lastSelectTime: 0,
  repeatIndex: 0,  // 0 = first press, 1 = second, etc.
};

// ============================================
// TYPES
// ============================================

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
export type ButtonVariant = 'default' | 'primary' | 'success' | 'warning' | 'emergency' | 'quickfire';

export interface GazeButtonProps {
  id: string;
  children: React.ReactNode;
  onClick?: () => void;

  // Sizing
  size?: ButtonSize;
  width?: number;
  height?: number;

  // Styling
  variant?: ButtonVariant;
  isDarkMode?: boolean;

  // Dwell timing
  dwellTime?: number;
  dwellCategory?: keyof Omit<DwellTimeSettings, 'cooldownAfterActivation' | 'onsetDelay' | 'ringAnimationSync'>;
  context?: keyof typeof dwellTiming.contexts;
  priority?: number; // Higher = faster dwell

  // State
  disabled?: boolean;
  selected?: boolean;

  // Callbacks
  onDwellStart?: () => void;
  onDwellProgress?: (progress: number) => void;
  onDwellComplete?: () => void;
  onDwellCancel?: () => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLButtonElement>) => void;

  // Gaze tracking
  gazeEnabled?: boolean;
  /** Timestamp when gaze was last enabled — used for cooldown check */
  gazeEnabledTimestamp?: number;
  /** If true, this button responds to gaze even when gaze is globally disabled (for safety-critical buttons) */
  alwaysActive?: boolean;
  onRegisterTarget?: (target: GazeTarget) => void;
  onUnregisterTarget?: (id: string) => void;

  // Accessibility
  ariaLabel?: string;

  // Style overrides
  style?: React.CSSProperties;
  className?: string;
  /** If true, child wrapper fills the button area (useful for full-cell renderers). */
  contentFill?: boolean;
}

export interface GazeTarget {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size: ButtonSize;
  context: string;
  customDwellMs?: number;
  priority: number;
  enabled: boolean;
}

// ============================================
// DWELL PROGRESS RING
// ============================================

interface DwellProgressRingProps {
  progress: number;
  size: number;
  color: string;
  strokeWidth?: number;
}

const DwellProgressRing: React.FC<DwellProgressRingProps> = ({
  progress,
  size,
  color,
  strokeWidth = 4,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transform: 'rotate(-90deg)',
        pointerEvents: 'none',
      }}
    >
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth={strokeWidth}
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 50ms linear' }}
      />
    </svg>
  );
};

// ============================================
// v17: DWELL PROGRESS SHRINK (OptiKey-style)
// ============================================
// Shrinking filled circle that draws the user's gaze toward button center.
// OptiKey found this natural "funneling" effect improves mid-selection accuracy.
// The circle starts at ~60% of button size and shrinks to a point as progress → 1.

interface DwellProgressShrinkProps {
  progress: number;
  size: number;
  color: string;
}

const DwellProgressShrink: React.FC<DwellProgressShrinkProps> = ({
  progress,
  size,
  color,
}) => {
  // Start at 60% of button size, shrink to 0 at 100% progress
  const maxRadius = size * 0.30;  // 60% diameter = 30% radius
  const currentRadius = maxRadius * (1 - progress);

  if (currentRadius < 1) return null;

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
      }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={currentRadius}
        fill={color}
        opacity={0.25 + 0.15 * progress}  // Fade in slightly as it shrinks
        style={{ transition: 'r 50ms linear, opacity 50ms linear' }}
      />
    </svg>
  );
};

// ============================================
// GAZE BUTTON COMPONENT
// ============================================

const GazeButton: React.FC<GazeButtonProps> = ({
  id,
  children,
  onClick,
  size = 'md',
  width,
  height,
  variant = 'default',
  isDarkMode = true,
  dwellTime,
  dwellCategory,
  context,
  priority = 0,
  disabled = false,
  selected = false,
  onDwellStart,
  onDwellProgress,
  onDwellComplete,
  onDwellCancel,
  gazeEnabled = true,
  gazeEnabledTimestamp = 0,
  alwaysActive = false,
  onRegisterTarget,
  onUnregisterTarget,
  ariaLabel,
  style,
  className,
  contentFill = false,
}) => {
  // Mouse Only Mode: block dwell for all buttons except alwaysActive (Emergency)
  let isMouseOnlyMode = false;
  let lastNavigationTimestamp = 0;
  try {
    const gazeControl = useGazeControl();
    isMouseOnlyMode = gazeControl.isMouseMode;
    lastNavigationTimestamp = gazeControl.lastNavigationTimestamp;
  } catch {
    // GazeButton might render outside GazeControlProvider in edge cases
    isMouseOnlyMode = false;
  }

  // Centralized dwell settings
  const { settings: dwellSettings } = useDwellTime();

  // State
  const [isHovered, setIsHovered] = useState(false);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [isActivated, setIsActivated] = useState(false);
  const [isInOnset, setIsInOnset] = useState(false);
  const [measuredSize, setMeasuredSize] = useState<number | null>(null);

  // Refs
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dwellTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const onsetTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Hysteresis & decay refs
  const decayTimerRef = useRef<number | null>(null);
  const decayGraceRef = useRef<NodeJS.Timeout | null>(null);
  const savedProgressRef = useRef<number>(0);
  const isDecayingRef = useRef(false);

  // Measure actual rendered size for DwellProgressRing
  useEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    const measure = () => {
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setMeasuredSize(Math.min(rect.width, rect.height));
      }
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(btn);
    return () => observer.disconnect();
  }, []);

  // Get colors
  const colors = isDarkMode ? darkColors : lightColors;

  // Calculate dimensions
  const sizeConfig = buttonSizes[size];
  const buttonWidth = width || sizeConfig.width;
  const buttonHeight = height || sizeConfig.height;

  // Calculate dwell time — priority: explicit dwellTime > dwellCategory > context > size fallback
  const categoryDwell = dwellCategory ? (dwellSettings as any)[dwellCategory] as number : undefined;
  const baseDwell = dwellTime || categoryDwell || (context ? dwellTiming.contexts[context] : dwellTiming.bySize[size]);
  const priorityReduction = priority * 50; // 50ms per priority level
  const normalDwell = Math.max(dwellTiming.min, Math.min(dwellTiming.max, baseDwell - priorityReduction));

  // v17: Variable repeat dwell — faster dwell for repeated presses of same key
  // Only applies to keyboard keys (context='keyboard') to avoid affecting navigation buttons.
  const isKeyboardContext = context === 'keyboard' || dwellCategory === 'keyboardKey';
  const repeatEnabled = dwellSettings.repeatDwellEnabled && isKeyboardContext;
  const repeatTimes = dwellSettings.repeatDwellTimes || [0, 250, 350];
  const repeatWindow = dwellSettings.repeatWindowMs || 2000;

  // Check if this is a repeat press
  let effectiveDwell = normalDwell;
  if (repeatEnabled && _repeatDwell.lastButtonId === id && Date.now() - _repeatDwell.lastSelectTime < repeatWindow) {
    const idx = Math.min(_repeatDwell.repeatIndex, repeatTimes.length - 1);
    const repeatTime = repeatTimes[idx];
    if (repeatTime > 0) {
      // Use repeat time (faster), clamped to minimum safety threshold
      effectiveDwell = Math.max(dwellTiming.min, repeatTime);
    }
    // else repeatTime=0 means use normal dwell for first press
  }

  const onsetDelay = dwellSettings.onsetDelay ?? dwellTiming.onsetDelay;
  // v16: Added 'quickWord' mapping — was unmapped, fell through to 'navigation' context
  const gazeContext = context
    || (dwellCategory === 'keyboardKey' ? 'keyboard'
      : dwellCategory === 'quickfire' ? 'quickfire'
        : dwellCategory === 'quickWord' ? 'quickfire'
          : dwellCategory === 'emergencyButton' ? 'emergency'
            : dwellCategory === 'navigationButton' ? 'navigation'
              : dwellCategory === 'surveyOption' ? 'surveyOption'
                : dwellCategory === 'phraseButton' ? 'phraseButton'
                  : dwellCategory === 'homeScreenTile' ? 'homeScreenTile'
                    : dwellCategory === 'spatialZone' ? 'spatialZone'
                      : dwellCategory === 'settingsButton' ? 'settingsButton'
                        : dwellCategory === 'medicalUrgent' ? 'medicalUrgent'
                          : dwellCategory === 'backSkipButton' ? 'backSkipButton'
                            : dwellCategory === 'gazeToggle' ? 'gazeToggle'
                              : dwellCategory === 'compassMapAction' ? 'compassMapAction'
                                : dwellCategory === 'standardButton' ? 'standard'
                                  : undefined)
    || (variant === 'emergency' ? 'emergency'
      : variant === 'quickfire' ? 'quickfire'
        : 'navigation');

  // Get variant colors
  const getVariantColors = () => {
    switch (variant) {
      case 'primary':
        return {
          bg: colors.accent.subtle,
          border: isHovered ? colors.accent.main : colors.accent.subtle,
          text: colors.accent.main,
        };
      case 'success':
        return {
          bg: colors.success.subtle,
          border: isHovered ? colors.success.main : colors.success.subtle,
          text: colors.success.main,
        };
      case 'warning':
        return {
          bg: colors.warning.subtle,
          border: isHovered ? colors.warning.main : colors.warning.subtle,
          text: colors.warning.main,
        };
      case 'emergency':
        return {
          bg: colors.emergency.subtle,
          border: isHovered ? colors.emergency.main : colors.emergency.subtle,
          text: colors.emergency.main,
        };
      case 'quickfire':
        return {
          bg: colors.background.tertiary,
          border: isHovered ? colors.accent.main : colors.border.main,
          text: colors.text.primary,
        };
      default:
        return {
          bg: colors.background.secondary,
          border: isHovered ? colors.accent.main : colors.border.main,
          text: colors.text.primary,
        };
    }
  };

  const variantColors = getVariantColors();

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      cancelAnimationFrame(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (onsetTimerRef.current) {
      clearTimeout(onsetTimerRef.current);
      onsetTimerRef.current = null;
    }
    if (decayTimerRef.current) {
      cancelAnimationFrame(decayTimerRef.current);
      decayTimerRef.current = null;
    }
    if (decayGraceRef.current) {
      clearTimeout(decayGraceRef.current);
      decayGraceRef.current = null;
    }
    isDecayingRef.current = false;
  }, []);

  // Update progress animation
  const updateProgress = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current - onsetDelay;
    const dwellDuration = effectiveDwell - onsetDelay;
    const progress = Math.max(0, Math.min(1, elapsed / dwellDuration));

    setDwellProgress(progress);
    onDwellProgress?.(progress);

    if (progress < 1) {
      progressTimerRef.current = requestAnimationFrame(updateProgress);
    }
  }, [effectiveDwell, onsetDelay, onDwellProgress]);

  // Handle hover enter
  const handleEnter = useCallback(() => {
    // Allow dwell if gazeEnabled OR if this button is alwaysActive (safety-critical)
    if (disabled || (!gazeEnabled && !alwaysActive)) return;

    // Mouse Only Mode: block ALL dwell behavior — no exceptions
    if (isMouseOnlyMode) return;

    // Cooldown: skip if gaze was just enabled (prevents overlap selection)
    if (gazeEnabledTimestamp && Date.now() - gazeEnabledTimestamp < GAZE_ENABLE_COOLDOWN_MS) return;

    // Post-navigation freeze: skip if screen just changed (prevents Midas Touch
    // during orienting saccade — patient needs ~1.2s to visually scan new layout).
    // EXEMPT: gaze toggle and emergency buttons that are alwaysActive —
    // patient must always be able to toggle gaze and call for help.
    if (!alwaysActive && lastNavigationTimestamp
      && Date.now() - lastNavigationTimestamp < POST_NAVIGATION_COOLDOWN_MS) return;

    // If returning during decay, resume from saved progress
    if (isDecayingRef.current && savedProgressRef.current > 0) {
      isDecayingRef.current = false;
      if (decayTimerRef.current) {
        cancelAnimationFrame(decayTimerRef.current);
        decayTimerRef.current = null;
      }
      if (decayGraceRef.current) {
        clearTimeout(decayGraceRef.current);
        decayGraceRef.current = null;
      }

      // Resume: adjust start time to match saved progress
      const dwellDuration = effectiveDwell - onsetDelay;
      const elapsedEquiv = savedProgressRef.current * dwellDuration;
      startTimeRef.current = Date.now() - onsetDelay - elapsedEquiv;

      setIsHovered(true);
      setIsInOnset(false);
      progressTimerRef.current = requestAnimationFrame(updateProgress);

      // Set completion timer for remaining time
      const remaining = dwellDuration - elapsedEquiv;
      dwellTimerRef.current = setTimeout(() => {
        setIsActivated(true);
        setDwellProgress(0);
        setIsInOnset(false);
        savedProgressRef.current = 0;

        // v17: Track repeat dwell state
        if (_repeatDwell.lastButtonId === id && Date.now() - _repeatDwell.lastSelectTime < repeatWindow) {
          _repeatDwell.repeatIndex++;
        } else {
          _repeatDwell.repeatIndex = 1; // Next press will be index 1 (second press)
        }
        _repeatDwell.lastButtonId = id;
        _repeatDwell.lastSelectTime = Date.now();

        onDwellComplete?.();
        onClick?.();

        setTimeout(() => {
          setIsActivated(false);
        }, 150);
      }, Math.max(0, remaining));

      return;
    }

    setIsHovered(true);
    setIsInOnset(true);
    startTimeRef.current = Date.now();
    savedProgressRef.current = 0;

    onDwellStart?.();

    // Onset phase - no visual feedback
    onsetTimerRef.current = setTimeout(() => {
      setIsInOnset(false);
      // Start progress animation after onset
      progressTimerRef.current = requestAnimationFrame(updateProgress);
    }, onsetDelay);

    // Complete dwell timer
    dwellTimerRef.current = setTimeout(() => {
      setIsActivated(true);
      setDwellProgress(0);
      setIsInOnset(false);
      savedProgressRef.current = 0;

      // v17: Track repeat dwell state for faster subsequent presses
      if (_repeatDwell.lastButtonId === id && Date.now() - _repeatDwell.lastSelectTime < repeatWindow) {
        _repeatDwell.repeatIndex++;
      } else {
        _repeatDwell.repeatIndex = 1; // Next press will be index 1 (second press)
      }
      _repeatDwell.lastButtonId = id;
      _repeatDwell.lastSelectTime = Date.now();

      onDwellComplete?.();
      onClick?.();

      // Reset after activation flash
      setTimeout(() => {
        setIsActivated(false);
      }, 150);
    }, effectiveDwell);
  }, [disabled, gazeEnabled, alwaysActive, isMouseOnlyMode, gazeEnabledTimestamp, lastNavigationTimestamp, onDwellStart, onDwellComplete, onClick, effectiveDwell, onsetDelay, updateProgress, id, repeatWindow]);

  // Handle hover leave — slow decay instead of instant cancel
  const handleLeave = useCallback(() => {
    if (!isHovered) return;

    // Save current progress for potential resume
    savedProgressRef.current = dwellProgress;

    // Stop fill timers but don't reset progress yet
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      cancelAnimationFrame(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (onsetTimerRef.current) {
      clearTimeout(onsetTimerRef.current);
      onsetTimerRef.current = null;
    }

    setIsHovered(false);
    setIsInOnset(false);

    // If no meaningful progress, cancel immediately
    if (dwellProgress < 0.05) {
      setDwellProgress(0);
      savedProgressRef.current = 0;
      onDwellCancel?.();
      return;
    }

    // 200ms grace period before decay starts
    isDecayingRef.current = true;
    decayGraceRef.current = setTimeout(() => {
      if (!isDecayingRef.current) return;

      // Decay at 0.25x fill rate (4x slower than filling)
      const decayRate = 0.25;
      const decayStep = () => {
        if (!isDecayingRef.current) return;
        savedProgressRef.current -= decayRate / 60; // ~60fps
        if (savedProgressRef.current <= 0) {
          savedProgressRef.current = 0;
          isDecayingRef.current = false;
          setDwellProgress(0);
          onDwellCancel?.();
          return;
        }
        setDwellProgress(savedProgressRef.current);
        decayTimerRef.current = requestAnimationFrame(decayStep);
      };
      decayTimerRef.current = requestAnimationFrame(decayStep);
    }, 200);
  }, [isHovered, dwellProgress, onDwellCancel]);

  // Register target for external tracking
  useEffect(() => {
    if (buttonRef.current && onRegisterTarget) {
      const rect = buttonRef.current.getBoundingClientRect();
      const target: GazeTarget = {
        id,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        size,
        context: gazeContext,
        customDwellMs: effectiveDwell,
        priority,
        enabled: !disabled && gazeEnabled,
      };
      onRegisterTarget(target);
    }

    return () => {
      onUnregisterTarget?.(id);
    };
  }, [id, size, gazeContext, effectiveDwell, priority, disabled, gazeEnabled, onRegisterTarget, onUnregisterTarget]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // Hysteresis: check if gaze is still within expanded zone (20px beyond button bounds)
  const HYSTERESIS_PADDING = 20;
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isHovered || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const inExpandedZone = (
      e.clientX >= rect.left - HYSTERESIS_PADDING &&
      e.clientX <= rect.right + HYSTERESIS_PADDING &&
      e.clientY >= rect.top - HYSTERESIS_PADDING &&
      e.clientY <= rect.bottom + HYSTERESIS_PADDING
    );
    // Only trigger leave if gaze moved beyond the hysteresis zone
    // (the actual onMouseLeave fires at original bounds, so we re-enter if still in zone)
  }, [isHovered]);

  // Button styles
  const buttonStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: buttonWidth,
    height: buttonHeight,
    padding: sizeConfig.padding,
    backgroundColor: selected ? colors.accent.subtle : variantColors.bg,
    border: `3px solid ${selected ? colors.accent.main : variantColors.border}`,
    borderRadius: layout.borderRadius.xl,
    color: variantColors.text,
    fontSize: sizeConfig.fontSize,
    fontWeight: typography.fontWeight.semibold,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'transform 100ms ease-out, background-color 100ms ease-out',
    transform: isActivated ? 'scale(0.95)' : isHovered ? 'scale(1.02)' : 'scale(1)',
    overflow: 'hidden',
    outline: 'none',
    ...style,
  };

  return (
    <button
      ref={buttonRef}
      id={id}
      style={buttonStyle}
      className={`gaze-button ${className || ''}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={() => !disabled && onClick?.()}
      disabled={disabled}
      aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
      aria-pressed={selected}
      aria-disabled={disabled}
      data-gaze={gazeEnabled || alwaysActive ? "true" : "false"}
      data-gaze-always={alwaysActive ? "true" : undefined}
      data-gaze-context={gazeContext}
      data-gaze-dwell-ms={Math.round(effectiveDwell)}
    >
      {/* Progress indicator - only show after onset */}
      {isHovered && !isInOnset && dwellProgress > 0 && (() => {
        const indicatorSize = measuredSize || (
          typeof buttonWidth === 'number' && typeof buttonHeight === 'number'
            ? Math.min(buttonWidth, buttonHeight)
            : 100
        );
        const indicatorColor = colors.gaze?.active || colors.accent.main;
        // v17: Use shrinking circle or ring based on user preference
        return dwellSettings.progressStyle === 'shrink' ? (
          <DwellProgressShrink
            progress={dwellProgress}
            size={indicatorSize}
            color={indicatorColor}
          />
        ) : (
          <DwellProgressRing
            progress={dwellProgress}
            size={indicatorSize}
            color={indicatorColor}
            strokeWidth={4}
          />
        );
      })()}

      {/* Content */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: contentFill ? '100%' : undefined,
        height: contentFill ? '100%' : undefined,
        display: contentFill ? 'flex' : undefined,
        alignItems: contentFill ? 'stretch' : undefined,
        justifyContent: contentFill ? 'stretch' : undefined,
      }}>
        {children}
      </div>
    </button>
  );
};

// ============================================
// PRESET BUTTON COMPONENTS
// ============================================

// QuickFire button with fast dwell
export const QuickFireButton: React.FC<Omit<GazeButtonProps, 'context' | 'size'>> = (props) => (
  <GazeButton {...props} size="md" context="quickfire" />
);

// Emergency button with long dwell
export const EmergencyButton: React.FC<Omit<GazeButtonProps, 'variant' | 'context'>> = (props) => (
  <GazeButton {...props} variant="emergency" context="emergency" />
);

// Keyboard key
export const KeyboardKey: React.FC<Omit<GazeButtonProps, 'context' | 'size'>> = (props) => (
  <GazeButton {...props} size="md" context="keyboard" />
);

// Navigation tile
export const NavTile: React.FC<Omit<GazeButtonProps, 'context'>> = (props) => (
  <GazeButton {...props} context="navigation" />
);

export default React.memo(GazeButton);
