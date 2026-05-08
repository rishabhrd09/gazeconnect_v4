/**
 * GazeConnect Pro - Gaze Control Toggle
 * ======================================
 * CRITICAL FEATURE for Papa's comfort.
 * 
 * Allows manual enable/disable of gaze tracking to:
 * - Reduce anxiety from continuous tracking
 * - Give time to process and understand screens
 * - Let user control when to start interacting
 * 
 * Two modes:
 * 1. Manual: User must explicitly enable gaze on each screen
 * 2. Auto: Countdown timer then auto-enable (configurable)
 */

import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { darkColors, lightColors, layout, typography, spacing, buttonSizes } from '../../utils/design';
import { useDwellTime } from '../../contexts/DwellTimeContext';

// ============================================
// CONTEXT
// ============================================

/** Cooldown period after enabling gaze — prevents accidental selections behind the toggle */
export const GAZE_ENABLE_COOLDOWN_MS = 1500;

/** Post-navigation dwell freeze — gives patient time to visually scan new screen
 *  layout without accidentally triggering buttons during orienting saccade.
 *  1200ms provides enough time for the eye's natural 2-3 fixation scan cycle
 *  to complete before dwell becomes active. Grid 3 (Smartbox) uses a similar
 *  "activation delay" mechanism. */
export const POST_NAVIGATION_COOLDOWN_MS = 1200;

interface GazeControlContextValue {
  isGazeEnabled: boolean;
  enableGaze: () => void;
  disableGaze: () => void;
  toggleGaze: () => void;
  mode: 'manual' | 'auto';
  setMode: (mode: 'manual' | 'auto') => void;
  autoEnableDelay: number;
  setAutoEnableDelay: (delay: number) => void;
  /** Timestamp (Date.now()) of the last gaze-enable event — use to enforce cooldown */
  lastEnabledTimestamp: number;
  /** Helper: returns true if we're still in the post-enable cooldown window */
  isInCooldown: () => boolean;
  /** Timestamp of last screen navigation — used for post-navigation dwell freeze */
  lastNavigationTimestamp: number;
  /** Signal a navigation event (freezes dwell for POST_NAVIGATION_COOLDOWN_MS) */
  signalNavigation: () => void;
  /** Mouse mode: when true, use mouse clicks instead of dwell for selection */
  isMouseMode: boolean;
  setMouseMode: (mouseMode: boolean) => void;
  toggleMouseMode: () => void;
}

const GazeControlContext = createContext<GazeControlContextValue | undefined>(undefined);

export const useGazeControl = () => {
  const context = useContext(GazeControlContext);
  if (!context) {
    throw new Error('useGazeControl must be used within GazeControlProvider');
  }
  return context;
};

// ============================================
// PROVIDER
// ============================================

interface GazeControlProviderProps {
  children: React.ReactNode;
  initialEnabled?: boolean;
  initialMode?: 'manual' | 'auto';
  initialAutoDelay?: number;
  onGazeChange?: (enabled: boolean) => void;
}

export const GazeControlProvider: React.FC<GazeControlProviderProps> = ({
  children,
  initialEnabled = false,
  initialMode = 'manual',
  initialAutoDelay = 3000,
  onGazeChange,
}) => {
  const [isGazeEnabled, setIsGazeEnabled] = useState(initialEnabled);
  const [mode, setMode] = useState<'manual' | 'auto'>(initialMode);
  const [autoEnableDelay, setAutoEnableDelay] = useState(initialAutoDelay);
  const [isMouseMode, setIsMouseMode] = useState(false);  // NEW: Mouse mode state
  const [lastNavigationTimestamp, setLastNavigationTimestamp] = useState(0);
  const lastEnabledTimestampRef = useRef<number>(0);
  const [lastEnabledTimestamp, setLastEnabledTimestamp] = useState(0);

  const isInCooldown = useCallback(() => {
    return Date.now() - lastEnabledTimestampRef.current < GAZE_ENABLE_COOLDOWN_MS;
  }, []);

  const enableGaze = useCallback(() => {
    if (isMouseMode) return; // Mouse Only Mode: cannot enable gaze
    const now = Date.now();
    lastEnabledTimestampRef.current = now;
    setLastEnabledTimestamp(now);
    setIsGazeEnabled(true);
    onGazeChange?.(true);
  }, [isMouseMode, onGazeChange]);

  const disableGaze = useCallback(() => {
    setIsGazeEnabled(false);
    onGazeChange?.(false);
  }, [onGazeChange]);

  const toggleGaze = useCallback(() => {
    if (isMouseMode) return; // Mouse Only Mode: toggle does nothing
    setIsGazeEnabled(prev => {
      const newValue = !prev;
      if (newValue) {
        const now = Date.now();
        lastEnabledTimestampRef.current = now;
        setLastEnabledTimestamp(now);
      }
      onGazeChange?.(newValue);
      return newValue;
    });
  }, [isMouseMode, onGazeChange]);

  const toggleMouseMode = useCallback(() => {
    setIsMouseMode(prev => !prev);
  }, []);

  const signalNavigation = useCallback(() => {
    setLastNavigationTimestamp(Date.now());
  }, []);

  // Force-disable gaze when entering Mouse Only Mode
  useEffect(() => {
    if (isMouseMode) {
      setIsGazeEnabled(false);
      onGazeChange?.(false);
    }
  }, [isMouseMode, onGazeChange]);

  // Listen for Mouse Only Mode changes from Electron menu (Ctrl+Shift+M)
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.on) return;

    // Query initial state on mount
    api.mouseOnlyMode?.get?.().then((mode: boolean) => {
      if (mode) setIsMouseMode(true);
    }).catch(() => { /* not in Electron */ });

    // Listen for toggle events from main process
    const handleModeChange = (enabled: boolean) => {
      setIsMouseMode(enabled);
      console.log('Mouse Only Mode:', enabled ? 'ON' : 'OFF');
    };

    api.on('mouse-only-mode-changed', handleModeChange);
    return () => {
      api.off?.('mouse-only-mode-changed', handleModeChange);
    };
  }, []);

  const value: GazeControlContextValue = {
    isGazeEnabled,
    enableGaze,
    disableGaze,
    toggleGaze,
    mode,
    setMode,
    autoEnableDelay,
    setAutoEnableDelay,
    lastEnabledTimestamp,
    isInCooldown,
    lastNavigationTimestamp,
    signalNavigation,
    isMouseMode,
    setMouseMode: setIsMouseMode,
    toggleMouseMode,
  };

  return (
    <GazeControlContext.Provider value={value}>
      {children}
    </GazeControlContext.Provider>
  );
};

// ============================================
// TOGGLE COMPONENT
// ============================================

interface GazeControlToggleProps {
  isDarkMode?: boolean;
  position?: 'top-right' | 'top-center' | 'bottom-center' | 'bottom-right' | 'inline' | 'custom';
  customPosition?: { top?: number; right?: number; bottom?: number; left?: number };
  showCountdown?: boolean;
  onEnable?: () => void;
  onDisable?: () => void;
  playSound?: boolean;
}

export const GazeControlToggle: React.FC<GazeControlToggleProps> = ({
  isDarkMode = true,
  position = 'bottom-center',
  customPosition,
  showCountdown = true,
  onEnable,
  onDisable,
  playSound = false,
}) => {
  const { isGazeEnabled, enableGaze, disableGaze, mode, autoEnableDelay, isMouseMode, setMouseMode } = useGazeControl();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [dwellProgress, setDwellProgress] = useState(0);

  const colors = isDarkMode ? darkColors : lightColors;

  // Centralized dwell settings
  const { settings: dwellSettings } = useDwellTime();
  const toggleDwellTime = dwellSettings.gazeToggle;

  // Mouse-Only Mode: hide the gaze toggle entirely — no gaze to toggle
  const dwellTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Auto-enable countdown
  useEffect(() => {
    if (mode === 'auto' && !isGazeEnabled && showCountdown) {
      const seconds = Math.ceil(autoEnableDelay / 1000);
      setCountdown(seconds);

      let remaining = seconds;
      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          setCountdown(null);
          enableGaze();
          onEnable?.();
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
          }
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [mode, isGazeEnabled, autoEnableDelay, showCountdown, enableGaze, onEnable]);

  // Clear timers
  const clearTimers = useCallback(() => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      cancelAnimationFrame(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  // Update progress
  const updateProgress = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current;
    // Enable: capped at 800ms for quick access; Disable: +400ms to prevent accidental turn-off
    const enableDwell = Math.min(toggleDwellTime, 800);
    const dwellTime = isGazeEnabled ? toggleDwellTime + 400 : enableDwell;
    const progress = Math.min(1, elapsed / dwellTime);
    setDwellProgress(progress);

    if (progress < 1) {
      progressTimerRef.current = requestAnimationFrame(updateProgress);
    }
  }, [isGazeEnabled, toggleDwellTime]);

  // Handle hover
  const handleEnter = () => {
    setIsHovered(true);
    startTimeRef.current = Date.now();
    progressTimerRef.current = requestAnimationFrame(updateProgress);

    const enableDwell = Math.min(toggleDwellTime, 800);
    const dwellTime = isGazeEnabled ? toggleDwellTime + 400 : enableDwell;
    dwellTimerRef.current = setTimeout(() => {
      if (isGazeEnabled) {
        disableGaze();
        onDisable?.();
      } else {
        enableGaze();
        onEnable?.();
        // Cancel auto countdown if user manually enables
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          setCountdown(null);
        }
      }
      setDwellProgress(0);
      setIsHovered(false);
    }, dwellTime);
  };

  const handleLeave = () => {
    setIsHovered(false);
    setDwellProgress(0);
    clearTimers();
  };

  // Mouse-Only Mode: hide the gaze toggle entirely; keep hooks above this
  // return so switching mouse mode on/off never violates React hook order.
  if (isMouseMode) return null;

  // Position styles
  const getPositionStyle = (): React.CSSProperties => {
    if (position === 'inline') {
      return {
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
      };
    }

    if (position === 'custom' && customPosition) {
      return {
        position: 'fixed',
        ...customPosition,
      };
    }

    const positions: Record<string, React.CSSProperties> = {
      'top-right': { position: 'fixed', top: 20, right: 20 },
      'top-center': { position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)' },
      'bottom-center': { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)' },
      'bottom-right': { position: 'fixed', bottom: 20, right: 20 },
    };

    return positions[position] || positions['bottom-center'];
  };

  // === ENLARGED BUTTONS FOR EASY GAZE TARGETING ===
  const BTN_WIDTH = 410;
  const BTN_HEIGHT_ENABLE = 92;
  const BTN_HEIGHT_ON = 62;

  // Render enabled state - prominent Gaze ON button
  if (isGazeEnabled) {
    return (
      <div
        style={{
          ...getPositionStyle(),
          zIndex: layout.zIndex.gaze,
        }}
      >
        <button
          id="gaze-toggle-button"
          data-gaze="true"
          data-gaze-toggle="true"
          data-gaze-always="true"
          data-snap-priority="3"
          data-gaze-context="gazetoggle"
          data-gaze-dwell-ms={String(toggleDwellTime + 350)}
          className="gaze-toggle gaze-button"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            width: BTN_WIDTH,
            height: BTN_HEIGHT_ON,
            padding: '8px 24px',
            backgroundColor: colors.success.subtle,
            border: `3px solid ${isHovered ? colors.success.main : '#34C759'}`,
            borderRadius: '16px',
            color: colors.success.main,
            fontSize: '20px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 150ms ease',
            position: 'relative',
            overflow: 'hidden',
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          onClick={() => {
            if (isGazeEnabled) {
              disableGaze();
              onDisable?.();
            }
          }}
        >
          {/* Progress bar for dwell-to-disable */}
          {isHovered && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: 4,
                width: `${dwellProgress * 100}%`,
                backgroundColor: colors.success.main,
                borderRadius: '0 0 16px 16px',
              }}
            />
          )}

          {/* Eye icon */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>

          <span>Gaze ON</span>
        </button>
      </div>
    );
  }

  // Render disabled state - BIG prominent enable button
  return (
    <div
      style={{
        ...getPositionStyle(),
        zIndex: layout.zIndex.gaze,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        {/* Countdown display */}
        {countdown !== null && mode === 'auto' && (
          <div
            style={{
              padding: '6px 16px',
              backgroundColor: colors.background.secondary,
              borderRadius: '12px',
              color: colors.text.secondary,
              fontSize: '14px',
            }}
          >
            Auto-enabling in {countdown}s
          </div>
        )}

        {/* Pulsing glow animation when gaze is disabled — draws eye to the button */}
        <style>{`
          @keyframes gazeTogglePulse {
            0%, 100% { box-shadow: 0 0 8px rgba(45, 212, 191, 0.3); }
            50% { box-shadow: 0 0 24px rgba(45, 212, 191, 0.6), 0 0 48px rgba(45, 212, 191, 0.2); }
          }
        `}</style>

        {/* Main enable button - LARGE */}
        <button
          id="gaze-toggle-button"
          data-gaze="true"
          data-gaze-toggle="true"
          data-gaze-always="true"
          data-snap-priority="3"
          data-gaze-context="gazetoggle"
          data-gaze-dwell-ms={String(Math.min(toggleDwellTime, 800))}
          className="gaze-toggle gaze-button"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            width: BTN_WIDTH,
            height: BTN_HEIGHT_ENABLE,
            padding: '12px 32px',
            backgroundColor: isHovered ? colors.accent.subtle : colors.background.secondary,
            border: `3px solid ${isHovered ? colors.accent.main : colors.border.main}`,
            borderRadius: '18px',
            color: colors.accent.main,
            fontSize: '22px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 150ms ease',
            position: 'relative',
            overflow: 'hidden',
            transform: isHovered ? 'scale(1.02)' : 'scale(1)',
            animation: !isHovered ? 'gazeTogglePulse 2s ease-in-out infinite' : 'none',
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          onClick={() => {
            if (!isGazeEnabled) {
              enableGaze();
              onEnable?.();
            }
          }}
        >
          {/* Progress border animation */}
          {isHovered && (
            <svg
              width={BTN_WIDTH}
              height={BTN_HEIGHT_ENABLE}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: 'rotate(-90deg)',
                pointerEvents: 'none',
              }}
            >
              <rect
                x="0"
                y="0"
                width={BTN_WIDTH}
                height={BTN_HEIGHT_ENABLE}
                fill="none"
                stroke={colors.accent.main}
                strokeWidth="5"
                rx={18}
                strokeDasharray={2 * (BTN_WIDTH + BTN_HEIGHT_ENABLE)}
                strokeDashoffset={2 * (BTN_WIDTH + BTN_HEIGHT_ENABLE) * (1 - dwellProgress)}
              />
            </svg>
          )}

          {/* Eye-off icon */}
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>

          <span>Enable Gaze</span>
        </button>
      </div>
    </div>
  );
};

// ============================================
// STATUS INDICATOR (Minimal)
// ============================================

interface GazeStatusIndicatorProps {
  isDarkMode?: boolean;
}

export const GazeStatusIndicator: React.FC<GazeStatusIndicatorProps> = ({ isDarkMode = true }) => {
  const { isGazeEnabled } = useGazeControl();
  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        display: 'flex',
        alignItems: 'center',
        gap: spacing[1],
        padding: `${spacing[1]} ${spacing[2]}`,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: layout.borderRadius.full,
        zIndex: layout.zIndex.base,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: isGazeEnabled ? colors.success.main : colors.text.tertiary,
          boxShadow: isGazeEnabled ? `0 0 8px ${colors.success.main}` : 'none',
        }}
      />
      <span
        style={{
          fontSize: typography.fontSize.xs,
          color: colors.text.secondary,
        }}
      >
        {isGazeEnabled ? 'Gaze' : 'Off'}
      </span>
    </div>
  );
};

export default React.memo(GazeControlToggle);
