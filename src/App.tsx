/**
 * GazeConnect Pro v2 - Main Application (Improved)
 * =================================================
 * Root component with ALL screens connected.
 * 
 * Key improvements:
 * - Persistent Emergency button visible from ALL screens (fixed position)
 * - Gaze resets to OFF on each screen navigation (calm experience)
 * - GazeControlProvider properly resets on navigation
 */

import React, { useState, useCallback, useEffect } from 'react';
import { darkColors, lightColors } from './utils/design';
import { WebSocketProvider, useWS } from './hooks/useWebSocket';
import { GazeControlProvider, useGazeControl } from './components/core/GazeControlToggle';
import { RealGazeProvider } from './contexts/RealGazeContext';
import { GazeCursor } from './components/core/GazeCursor';
import GazeButton from './components/core/GazeButton';
import ErrorBoundary from './components/core/ErrorBoundary';
import DevDebugOverlay from './components/core/DebugOverlay';
import { GazeDebugOverlay } from './components/core/GazeDebugOverlay';
import { CustomizationProvider, useCustomization } from './contexts/CustomizationContext';
import { DwellTimeProvider } from './contexts/DwellTimeContext';
import { FocusModeProvider, useFocusMode } from './contexts/FocusModeContext';
import { AlertModeProvider, useAlertMode } from './contexts/AlertModeContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { useTheme } from './contexts/ThemeContext';
import SarvamBloom from './components/SarvamBloom';
import SvgDefs from './components/SvgDefs';
import './lightmode.css';
import './warmmode.css';

import HomeScreen from './screens/HomeScreen';
import KeyboardScreen from './screens/KeyboardScreen';
import PhrasesScreen from './screens/PhrasesScreen';
import SettingsScreen from './screens/SettingsScreen';

import MedicalScreen from './screens/MedicalScreen';
import FeelingScreen from './screens/FeelingScreen';
import BasicNeedsScreen from './screens/BasicNeedsScreen';
import PeopleScreen from './screens/PeopleScreen';
import ActivitiesScreen from './screens/ActivitiesScreen';
import SpatialKeyboardScreen from './screens/SpatialKeyboardScreen';
import WebBrowsingScreen from './screens/WebBrowsingScreen';
import FloorPlanSurveyScreen from './screens/FloorPlanSurveyScreen';
import CompassMapScreen from './screens/CompassMapScreen';
import DesignHomeLandingScreen from './screens/DesignHomeLandingScreen';
import CustomizeScreen from './screens/CustomizeScreen';
import AdvancedMapScreen from './screens/AdvancedMapScreen';
import QuickWordsScreen from './screens/QuickWordsScreen';
import AlertModeScreen from './screens/AlertModeScreen';

type Screen = 'home' | 'keyboard' | 'phrases' | 'feelings' | 'needs' |
  'people' | 'medical' | 'settings' | 'activities' | 'spatial' | 'web' |
  'floor-plan' | 'floor-plan-survey' | 'compass-map' | 'customize' | 'advanced-map' |
  'quickwords';

const KEYBOARD_TEXT_SESSION_KEY = 'gazeconnect_keyboard_text_session';

// Break Reminder Overlay - no emojis, professional
const BreakReminder: React.FC<{ onDismiss: () => void; isDarkMode: boolean }> = ({ onDismiss, isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: isDarkMode ? 'rgba(0,0,0,0.88)' : 'rgba(245, 241, 234, 0.92)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%', border: `3px solid ${colors.accent.main}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px',
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={colors.accent.main} strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </div>
      <h2 style={{ fontSize: '28px', color: colors.accent.main, marginBottom: '16px', fontWeight: 700 }}>
        Time for a Break
      </h2>
      <p style={{ fontSize: '18px', color: colors.text.secondary, marginBottom: '32px', textAlign: 'center', maxWidth: '400px' }}>
        Rest your eyes for 20 seconds. Look at something 20 feet away.
      </p>
      <button onClick={onDismiss} style={{
        padding: '18px 48px', backgroundColor: colors.accent.main, border: 'none',
        borderRadius: '12px', color: isDarkMode ? '#fff' : colors.text.inverse, fontSize: '18px', fontWeight: 700,
        cursor: 'pointer', minWidth: '180px', minHeight: '64px',
      }}>
        Continue
      </button>
    </div>
  );
};

/**
 * Persistent Emergency Button — visible on ALL screens
 * Fixed position, bottom-right corner, always accessible
 */
const PersistentEmergencyButton: React.FC<{
  onSpeak: (text: string) => void; isDarkMode: boolean;
}> = ({ onSpeak, isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <GazeButton
      id="persistent-emergency"
      variant="emergency"
      alwaysActive
      gazeEnabled
      dwellCategory="medicalUrgent"
      onClick={() => onSpeak("I need help immediately! This is an emergency!")}
      isDarkMode={isDarkMode}
      ariaLabel="Emergency help"
      style={{
        position: 'fixed',
        bottom: 'clamp(14px, 2vh, 24px)',
        left: 'clamp(14px, 2vw, 24px)',
        width: 'clamp(88px, 10vh, 120px)',
        height: 'clamp(88px, 10vh, 120px)',
        minWidth: 'clamp(88px, 10vh, 120px)',
        minHeight: 'clamp(88px, 10vh, 120px)',
        padding: 0,
        borderRadius: '50%',
        backgroundColor: colors.emergency.subtle,
        border: `2px solid ${colors.emergency.main}`,
        color: colors.emergency.main,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 900,
        boxShadow: `0 0 20px ${colors.emergency.main}40`,
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </GazeButton>
  );
};

function speakText(text: string, rate = 1.0, volume = 1.0, language = 'english'): void {
  if (volume <= 0) return;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate; u.volume = volume;
    // Determine language: 'auto' uses regex to detect Hindi (Devanagari script)
    if (language === 'hindi') {
      u.lang = 'hi-IN';
    } else if (language === 'auto') {
      u.lang = /[\u0900-\u097F]/.test(text) ? 'hi-IN' : 'en-US';
    } else {
      u.lang = 'en-US';
    }
    window.speechSynthesis.speak(u);
  }
}

const InnerApp: React.FC = () => {
  const ws = useWS();
  const { isGazeEnabled, disableGaze, signalNavigation, isMouseMode } = useGazeControl();
  const { settings, isLoaded } = useCustomization();
  const { isFocusMode } = useFocusMode();
  const { isAlertMode, disableAlertMode } = useAlertMode();
  const { theme } = useTheme();

  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [isLiveClockSuppressed, setIsLiveClockSuppressed] = useState(false);
  const [globalText, setGlobalText] = useState(() => {
    try {
      return sessionStorage.getItem(KEYBOARD_TEXT_SESSION_KEY) || '';
    } catch {
      return '';
    }
  });

  // Quick Words injection mode: tracks which screen requested inject
  const [quickWordsReturnScreen, setQuickWordsReturnScreen] = useState<string | null>(null);

  // Destructure settings for convenience
  const { isDarkMode, showHindi, ttsRate, ttsVolume, ttsLanguage } = settings;

  const colors = isDarkMode ? darkColors : lightColors;

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.app?.rendererReady) {
      api.app.rendererReady().catch(() => { /* ignore */ });
    }
  }, []);

  /** Navigation handler — v11: ALWAYS disable gaze on navigation.
   *  User must re-enable via gaze toggle button on each screen.
   *  v11 FIX: Notify backend of screen change so keyboard-specific
   *  filter tuning (lock_radius, hysteresis, magnetism) activates.
   *  Focus Mode: block navigation when focus mode is active. */
  const handleNavigate = useCallback((s: string) => {
    if (isFocusMode) return; // Focus Mode — block all navigation

    // ── CRITICAL: Close Electron BrowserView BEFORE switching screens ───
    // BrowserView is a native OS overlay — it is NOT a DOM element and does
    // NOT get removed when WebBrowsingScreen unmounts. We must close it here
    // proactively, before the screen changes, so it never bleeds into other screens.
    if (currentScreen === 'web' || s !== 'web') {
      try {
        const api = (window as any).electronAPI;
        if (api?.webview?.close) {
          api.webview.close(); // fire-and-forget — best effort
        }
      } catch { /* ignore */ }
    }

    // Track inject mode: if navigating to quickwords from a typing screen,
    // remember the return screen so QuickWordsScreen can inject words
    if (s === 'quickwords' && (currentScreen === 'keyboard' || currentScreen === 'spatial')) {
      setQuickWordsReturnScreen(currentScreen);
    } else if (s !== 'quickwords') {
      setQuickWordsReturnScreen(null);
    }

    setCurrentScreen(s as Screen);
    ws.setScreen(s);

    // ── Gaze behavior on screen transition ─────────────────────────────
    // 'smart-pause':   gaze stays ON, dwell freezes for 1.2s (prevents Midas Touch)
    // 'full-pause':    gaze fully OFF, patient re-enables via toggle (old behavior)
    // 'always-active': nothing happens, gaze is immediately active
    const navBehavior = settings?.gazeOnNavigate || 'smart-pause';
    if (navBehavior === 'full-pause') {
      disableGaze();
    } else if (navBehavior === 'smart-pause') {
      signalNavigation();
    }
    // 'always-active': do nothing — gaze stays fully active, no freeze
  }, [disableGaze, signalNavigation, ws, isFocusMode, currentScreen, settings]);

  const handleSpeak = useCallback((text: string) => {
    if (text.trim()) {
      // v17.18: one voice, not two. Backend pyttsx3 (async worker, SAPI5)
      // is the primary path; browser speechSynthesis is the offline
      // fallback only. Both used to fire together, so the patient heard
      // two overlapping voices on every SPEAK.
      if (ws.isConnected && ws.speak) {
        ws.speak(text);
      } else {
        speakText(text, ttsRate, ttsVolume, ttsLanguage || 'english');
      }
    }
  }, [ttsRate, ttsVolume, ttsLanguage, ws]);

  const handleAlertModeHome = useCallback(() => {
    setQuickWordsReturnScreen(null);
    setCurrentScreen('home');
    ws.setScreen('home');
    disableAlertMode();
  }, [disableAlertMode, ws]);
  const handleTextChange = useCallback((text: string) => setGlobalText(text), []);

  // Quick Words injection: appends a word to the global text (used by QuickWordsScreen in inject mode)
  const handleWordInject = useCallback((word: string) => {
    setGlobalText(prev => {
      const next = prev.endsWith(' ') || prev === '' ? `${prev}${word} ` : `${prev} ${word} `;
      try { sessionStorage.setItem(KEYBOARD_TEXT_SESSION_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      if (globalText) {
        sessionStorage.setItem(KEYBOARD_TEXT_SESSION_KEY, globalText);
      } else {
        sessionStorage.removeItem(KEYBOARD_TEXT_SESSION_KEY);
      }
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [globalText]);

  const renderScreen = () => {
    const common = { onNavigate: handleNavigate, onSpeak: handleSpeak, isDarkMode, showHindi };
    switch (currentScreen) {
      case 'keyboard':
        return <KeyboardScreen {...common} onTextChange={handleTextChange} initialText={globalText}
          onNavHiddenChange={setIsLiveClockSuppressed}
          getPredictions={ws.getPredictions} predictions={ws.predictions}
          sentencePredictions={ws.sentencePredictions}
          expandAbbreviation={ws.expandAbbreviation} abbreviationExpansion={ws.abbreviationExpansion}
          learnWord={ws.learnWord} learnSentence={ws.learnSentence}
        />;
      case 'spatial':
        return <SpatialKeyboardScreen
          {...common}
          onTextChange={handleTextChange}
          initialText={globalText}
          getPredictions={ws.getPredictions}
          predictions={ws.predictions}
          expandAbbreviation={ws.expandAbbreviation}
          abbreviationExpansion={ws.abbreviationExpansion}
          learnWord={ws.learnWord}
          learnSentence={ws.learnSentence}
        />;
      case 'phrases': return <PhrasesScreen {...common} />;
      case 'settings':
        return <SettingsScreen {...common} />;

      case 'medical': return <MedicalScreen {...common} />;
      case 'feelings': return <FeelingScreen {...common} />;
      case 'needs': return <BasicNeedsScreen {...common} />;
      case 'people': return <PeopleScreen {...common} />;
      case 'activities': return <ActivitiesScreen {...common} />;
      case 'web': return <WebBrowsingScreen {...common} />;
      case 'floor-plan': return <DesignHomeLandingScreen {...common} />;
      case 'floor-plan-survey': return <FloorPlanSurveyScreen {...common} />;
      case 'compass-map': return <CompassMapScreen {...common} />;
      case 'customize': return <CustomizeScreen {...common} />;
      case 'advanced-map': return <AdvancedMapScreen {...common} />;
      case 'quickwords': return <QuickWordsScreen {...common}
        injectMode={!!quickWordsReturnScreen}
        onWordInject={handleWordInject}
        returnScreen={quickWordsReturnScreen || 'home'}
      />;
      default: return <HomeScreen {...common} />;
    }
  };

  // Alert Mode: unconditionally render the lock screen
  if (isAlertMode) {
    return <AlertModeScreen onSpeak={handleSpeak} onHome={handleAlertModeHome} isDarkMode={isDarkMode} />;
  }

  // Show loading screen while settings are being loaded from disk
  if (!isLoaded) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: darkColors.background.primary,
        color: darkColors.text.secondary,
        fontSize: '18px',
        fontFamily: "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, -apple-system, sans-serif",
      }}>
        Loading settings...
      </div>
    );
  }

  const isQuickWordsScreen = currentScreen === 'quickwords';
  const isHomeWarmLight = currentScreen === 'home' && theme === 'light';
  const connectionIndicatorStyle: React.CSSProperties = isHomeWarmLight ? {
    position: 'fixed',
    bottom: 10,
    right: 12,
    padding: '4px 10px',
    backgroundColor: 'rgba(90,140,100,0.14)',
    border: '1px solid #5A8C64',
    borderRadius: '999px',
    color: '#5A8C64',
    fontSize: '10px',
    fontWeight: 650,
    letterSpacing: '0.03em',
    zIndex: 100,
    boxShadow: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } : isQuickWordsScreen ? {
    position: 'fixed',
    bottom: 12,
    right: 14,
    padding: '4px 12px',
    backgroundColor: ws.isConnected
      ? (isDarkMode ? 'rgba(23, 31, 25, 0.94)' : 'rgba(238, 245, 240, 0.96)')
      : (isDarkMode ? 'rgba(42, 26, 26, 0.94)' : 'rgba(248, 239, 237, 0.97)'),
    border: `1px solid ${ws.isConnected
      ? (isDarkMode ? 'rgba(113, 153, 118, 0.58)' : 'rgba(110, 140, 92, 0.48)')
      : (isDarkMode ? 'rgba(167, 107, 98, 0.54)' : 'rgba(158, 74, 61, 0.42)')}`,
    borderRadius: '999px',
    color: ws.isConnected
      ? (isDarkMode ? '#9FB89E' : '#5D7B52')
      : (isDarkMode ? '#C99990' : '#9E4A3D'),
    fontSize: '10px',
    fontWeight: 650,
    letterSpacing: '0.03em',
    zIndex: 100,
    boxShadow: 'none',
  } : {
    position: 'fixed',
    bottom: 6,
    right: 10,
    padding: '3px 10px',
    backgroundColor: ws.isConnected ? colors.success.subtle : colors.emergency.subtle,
    border: `1px solid ${ws.isConnected ? colors.success.main : colors.emergency.main}`,
    borderRadius: '6px',
    color: ws.isConnected ? colors.success.main : colors.emergency.main,
    fontSize: '11px',
    zIndex: 100,
  };

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: colors.background.primary,
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Live clock — hidden on screens where top-right is crowded */}
      <LiveClock currentScreen={currentScreen} suppressed={isLiveClockSuppressed} />

      {/* Screen content */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <ErrorBoundary>
          {renderScreen()}
        </ErrorBoundary>
      </div>

      {/* Persistent Emergency Button — hidden on screens with their own large emergency/nav affordance.
          Web Browsing has its own EMERGENCY in GlobalNavBar + connected toolbar; the floating
          fallback would be a duplicate at bottom-left.
          Compass-map / advanced-map / floor-plan-survey: floating widget would overlap the road
          bar / canvas area and break the "plot drawing" feel — Emergency is in the top NavBar. */}
      {currentScreen !== 'home' && currentScreen !== 'quickwords' && currentScreen !== 'keyboard' && currentScreen !== 'web' && currentScreen !== 'compass-map' && currentScreen !== 'advanced-map' && currentScreen !== 'floor-plan-survey' && (
        <PersistentEmergencyButton onSpeak={handleSpeak} isDarkMode={isDarkMode} />
      )}

      {/* Connection indicator */}
      <div className="connection-indicator" style={connectionIndicatorStyle}>
        {isHomeWarmLight && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5A8C64', flexShrink: 0 }} />}
        {ws.isConnected ? 'Connected' : 'Connecting...'}
      </div>

      {/* Mouse Only Mode indicator */}
      {isMouseMode && (
        <div className="mouse-only-banner" style={{
          position: 'fixed',
          top: 4,
          right: 120,
          padding: '4px 12px',
          backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.15)' : 'rgba(183, 142, 73, 0.12)',
          border: isDarkMode ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(183, 142, 73, 0.45)',
          borderRadius: '6px',
          color: isDarkMode ? '#F59E0B' : '#62584D',
          fontSize: '12px',
          fontWeight: 600,
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          pointerEvents: 'none',
        }}>
          MOUSE ONLY
        </div>
      )}

      {/* Focus Mode indicator badge */}
      {isFocusMode && (
        <div style={{
          position: 'fixed',
          top: 4,
          right: isMouseMode ? 230 : 120,
          padding: '4px 12px',
          backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(179, 90, 75, 0.12)',
          border: isDarkMode ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid rgba(179, 90, 75, 0.45)',
          borderRadius: '6px',
          color: isDarkMode ? '#EF4444' : '#9E4A3D',
          fontSize: '12px',
          fontWeight: 700,
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          pointerEvents: 'none',
          letterSpacing: '0.5px',
        }}>
          🔒 FOCUS MODE
        </div>
      )}
    </div>
  );
};

import { LiveClock } from './components/LiveClock';

const App: React.FC = () => (
  <CustomizationProvider>
    <ThemeProvider>
      <DwellTimeProvider>
        <FocusModeProvider>
          <AlertModeProvider>
            <WebSocketProvider>
              <RealGazeProvider>
                <GazeControlProvider initialEnabled={false}>
                  <GazeCursor />
                  <InnerApp />
                  <SvgDefs />
                  <SarvamBloom />
                  <GazeDebugOverlay />
                  <DevDebugOverlay />
                </GazeControlProvider>
              </RealGazeProvider>
            </WebSocketProvider>
          </AlertModeProvider>
        </FocusModeProvider>
      </DwellTimeProvider>
    </ThemeProvider>
  </CustomizationProvider>
);

export default App;
