/**
 * GazeConnect Pro v2 - Main Application (Improved)
 * =================================================
 * Root component with ALL screens connected.
 * 
 * Key improvements:
 * - Gaze resets to OFF on each screen navigation (calm experience)
 * - GazeControlProvider properly resets on navigation
 */

import { normalizeFilterPreset } from './config/gazeFilterConfig';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { darkColors, lightColors } from './utils/design';
import { chooseSpeechRoute } from './utils/ttsRouting';
import {
  ADD_TO_MESSAGE_SCREEN, appendToMessage, messageReturnAfter, type AddToMessage, type TypingScreen,
} from './utils/addToMessage';
import { WebSocketProvider, useWS } from './hooks/useWebSocket';
import { GazeControlProvider, useGazeControl } from './components/core/GazeControlToggle';
import { RealGazeProvider } from './contexts/RealGazeContext';
import { GazeCursor } from './components/core/GazeCursor';
import ErrorBoundary from './components/core/ErrorBoundary';
import DevDebugOverlay from './components/core/DebugOverlay';
import { GazeDebugOverlay } from './components/core/GazeDebugOverlay';
import { CustomizationProvider, useCustomization } from './contexts/CustomizationContext';
import { collectPredictionContext, predictionContextKey } from './utils/predictionContext';
import { DwellTimeProvider } from './contexts/DwellTimeContext';
import { FocusModeProvider, useFocusMode } from './contexts/FocusModeContext';
import { AlertModeProvider, useAlertMode } from './contexts/AlertModeContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { useTheme } from './contexts/ThemeContext';
import SarvamBloom from './components/SarvamBloom';
import SvgDefs from './components/SvgDefs';
import './warmmode.css';
import './refinement.css';
import './styles/gazespell-look.css';
import './styles/midnight-navy.css';
import './styles/design-modes.css';
import './styles/keyboard-design-colors.css';

import HomeScreen from './screens/HomeScreen';
import AlertModeScreen from './screens/AlertModeScreen';

// Home is what starts, and Alert Mode is the emergency screen, so both are part
// of the first load. The rest arrive on their own a moment later (SCREEN_LOADERS
// below): measured 23 Sep 2026, loading all nineteen before the first paint kept
// the window empty for 17.9 s on a fresh development server, because every
// module is a separate request and a browser only makes six at a time.
const KeyboardScreen = React.lazy(() => import('./screens/KeyboardScreen'));
const PhrasesScreen = React.lazy(() => import('./screens/PhrasesScreen'));
const SettingsScreen = React.lazy(() => import('./screens/SettingsScreen'));
const MedicalScreen = React.lazy(() => import('./screens/MedicalScreen'));
const FeelingScreen = React.lazy(() => import('./screens/FeelingScreen'));
const BasicNeedsScreen = React.lazy(() => import('./screens/BasicNeedsScreen'));
const PeopleScreen = React.lazy(() => import('./screens/PeopleScreen'));
const ActivitiesScreen = React.lazy(() => import('./screens/ActivitiesScreen'));
const SpatialKeyboardScreen = React.lazy(() => import('./screens/SpatialKeyboardScreen'));
const WebBrowsingScreen = React.lazy(() => import('./screens/WebBrowsingScreen'));
const FloorPlanSurveyScreen = React.lazy(() => import('./screens/FloorPlanSurveyScreen'));
const CompassMapScreen = React.lazy(() => import('./screens/CompassMapScreen'));
const DesignHomeLandingScreen = React.lazy(() => import('./screens/DesignHomeLandingScreen'));
const CustomizeScreen = React.lazy(() => import('./screens/CustomizeScreen'));
const QuickWordsScreen = React.lazy(() => import('./screens/QuickWordsScreen'));
const AddToMessageScreen = React.lazy(() => import('./screens/AddToMessageScreen'));
const MusicScreen = React.lazy(() => import('./screens/MusicScreen'));

// Pulled in quietly once the first screen is on the glass, most used first, so
// moving between screens never waits for a download.
const SCREEN_LOADERS: Array<() => Promise<unknown>> = [
  () => import('./screens/KeyboardScreen'),
  () => import('./screens/AddToMessageScreen'),
  () => import('./screens/PhrasesScreen'),
  () => import('./screens/QuickWordsScreen'),
  () => import('./screens/MedicalScreen'),
  () => import('./screens/BasicNeedsScreen'),
  () => import('./screens/FeelingScreen'),
  () => import('./screens/PeopleScreen'),
  () => import('./screens/ActivitiesScreen'),
  () => import('./screens/SettingsScreen'),
  () => import('./screens/SpatialKeyboardScreen'),
  () => import('./screens/CustomizeScreen'),
  () => import('./screens/WebBrowsingScreen'),
  () => import('./screens/DesignHomeLandingScreen'),
  () => import('./screens/FloorPlanSurveyScreen'),
  () => import('./screens/CompassMapScreen'),
  () => import('./screens/MusicScreen'),
];

const ScreenLoading: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => (
  <div className="screen-loading-fallback" style={{
    width: '100%', height: '100%',
    background: isDarkMode ? darkColors.background.primary : lightColors.background.primary,
  }} />
);

type Screen = 'home' | 'keyboard' | 'phrases' | 'feelings' | 'needs' |
  'people' | 'medical' | 'settings' | 'activities' | 'spatial' | 'web' |
  'floor-plan' | 'floor-plan-survey' | 'compass-map' | 'customize' |
  'quickwords' | 'music' | typeof ADD_TO_MESSAGE_SCREEN;

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

const InnerApp: React.FC = () => {
  const ws = useWS();
  const { isGazeEnabled, disableGaze, signalNavigation, isMouseMode } = useGazeControl();
  const { settings, isLoaded, data: customizationData } = useCustomization();
  const { isFocusMode } = useFocusMode();
  const { isAlertMode, disableAlertMode } = useAlertMode();
  const { theme } = useTheme();

  const sendFilterParamsRef = useRef(ws.sendFilterParams);
  sendFilterParamsRef.current = ws.sendFilterParams;
  useEffect(() => {
    if (isLoaded && ws.isConnected && settings.filterPreset) {
      sendFilterParamsRef.current({ preset: normalizeFilterPreset(settings.filterPreset) });
    }
  }, [isLoaded, ws.isConnected, settings.filterPreset]);

  // Household configuration for word prediction: resent on (re)connect and when
  // the caregiver changes boards, never on every render or keystroke.
  const setPredictionContextRef = useRef(ws.setPredictionContext);
  setPredictionContextRef.current = ws.setPredictionContext;
  const predictionContext = React.useMemo(
    () => (isLoaded ? collectPredictionContext(customizationData) : null),
    [isLoaded, customizationData],
  );
  const predictionContextSignature = predictionContext ? predictionContextKey(predictionContext) : '';
  useEffect(() => {
    if (predictionContext && ws.isConnected) {
      setPredictionContextRef.current(predictionContext.phrases, predictionContext.words);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictionContextSignature, ws.isConnected]);

  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [isLiveClockSuppressed, setIsLiveClockSuppressed] = useState(false);
  const [globalText, setGlobalText] = useState(() => {
    try {
      return sessionStorage.getItem(KEYBOARD_TEXT_SESSION_KEY) || '';
    } catch {
      return '';
    }
  });

  // Add to Message (utils/addToMessage.ts): the typing screen that opened it, while the
  // person chooses something to add to the message; null otherwise.
  const [messageReturnScreen, setMessageReturnScreen] = useState<TypingScreen | null>(null);

  // Destructure settings for convenience
  const { isDarkMode, ttsRate, ttsVolume } = settings;
  const showHindi = false;

  const colors = isDarkMode ? darkColors : lightColors;

  // A web page is a native layer above this whole window. Off the web screen
  // (and on every fresh load of the interface, which starts on Home) no page
  // may be showing, however the screen changed: navigation, Alert Mode's Home,
  // an error screen, a reload. Closing when nothing is open does nothing.
  useEffect(() => {
    if (currentScreen === 'web') return;
    try {
      const api = (window as any).electronAPI;
      void api?.webview?.close?.()?.catch?.(() => undefined);
    } catch { /* ignore */ }
  }, [currentScreen]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.app?.rendererReady) {
      api.app.rendererReady().catch(() => { /* ignore */ });
    }
  }, []);

  // The interface's heartbeat for the health log (electron/healthRecorder.ts, 10 Oct 2026):
  // every 2 s, with the longest gap between painted frames since the last beat. Frames stop
  // when this renderer or the GPU process stands still, so a gap of seconds is a frozen screen.
  useEffect(() => {
    const health = (window as any).electronAPI?.health;
    if (!health?.beat) return;
    let worst = 0;
    let last = performance.now();
    let frame = 0;
    const onFrame = (now: number) => {
      if (document.visibilityState === 'visible') worst = Math.max(worst, now - last);
      last = now;
      frame = requestAnimationFrame(onFrame);
    };
    // A hidden window paints nothing: that is not a stall.
    const onVisibility = () => { last = performance.now(); };
    frame = requestAnimationFrame(onFrame);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(() => {
      try { health.beat(Math.round(worst)); } catch { /* ignore */ }
      worst = 0;
    }, 2000);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, []);

  // The first screen is on the glass; bring in the others now, one after the
  // other so they never compete with what is being looked at.
  useEffect(() => {
    let cancelled = false;
    const loadNext = (index: number) => {
      if (cancelled || index >= SCREEN_LOADERS.length) return;
      SCREEN_LOADERS[index]()
        .catch(() => { /* it will be fetched again when the screen is opened */ })
        .then(() => { if (!cancelled) loadNext(index + 1); });
    };
    const idle = (window as any).requestIdleCallback as
      undefined | ((cb: () => void, options?: { timeout: number }) => number);
    const handle = idle ? idle(() => loadNext(0), { timeout: 2000 }) : window.setTimeout(() => loadNext(0), 400);
    return () => {
      cancelled = true;
      const cancelIdle = (window as any).cancelIdleCallback as undefined | ((id: number) => void);
      if (idle && cancelIdle) cancelIdle(handle as number); else window.clearTimeout(handle as number);
    };
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

    // Add to Message: entered from a typing screen, kept while the person moves among its
    // screens, ended by any other screen (utils/addToMessage.ts).
    setMessageReturnScreen(previous => messageReturnAfter(currentScreen, s, previous));

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

  const [speechNotice, setSpeechNotice] = useState('');
  const speechRequested = useRef(false);
  useEffect(() => {
    if (!speechRequested.current) return;
    if (ws.ttsState === 'error') setSpeechNotice(ws.ttsError || 'Speech is unavailable. Select Speak to try again.');
    if (ws.ttsState === 'speaking' || ws.ttsState === 'ready') setSpeechNotice('');
    if (ws.ttsState === 'disconnected') setSpeechNotice('Speech is unavailable while the local backend reconnects.');
  }, [ws.ttsState, ws.ttsError]);
  useEffect(() => {
    if (!speechNotice) return;
    const timer = window.setTimeout(() => setSpeechNotice(''), 10000);
    return () => window.clearTimeout(timer);
  }, [speechNotice]);

  const handleSpeak = useCallback((text: string) => {
    const route = chooseSpeechRoute({ text, volume: ttsVolume ?? 1,
      backendConnected: ws.isConnected, backendVoice: ws.ttsVoice });
    if (route === 'mute') {
      speechRequested.current = false;
      setSpeechNotice('');
      ws.stopSpeaking();
    } else if (route === 'backend') {
      speechRequested.current = true;
      setSpeechNotice(ws.ttsState === 'starting' ? 'Local voice is warming up…' : '');
      ws.speak(text);
    } else {
      setSpeechNotice('Local voice is unavailable. Start or update the GazeConnect backend.');
    }
  }, [ttsVolume, ws]);

  // Rate is a WPM preference mapped to Kokoro speed around its natural pace.
  // Volume zero cancels all active/pending speech in the shared voice worker.
  useEffect(() => {
    if (!ws.isConnected) return;
    if (ws.setTTSRate && Number.isFinite(ttsRate)) {
      const wpm = ttsRate >= 40 ? ttsRate : ttsRate * 150;
      ws.setTTSRate(Math.max(80, Math.min(250, Math.round(wpm))));
    }
    if (ws.setTTSVolume && Number.isFinite(ttsVolume)) {
      ws.setTTSVolume(Math.max(0, Math.min(1, ttsVolume)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.isConnected, ttsRate, ttsVolume]);

  const handleAlertModeHome = useCallback(() => {
    setMessageReturnScreen(null);
    setCurrentScreen('home');
    ws.setScreen('home');
    disableAlertMode();
  }, [disableAlertMode, ws]);
  const handleTextChange = useCallback((text: string) => setGlobalText(text), []);

  // Add to Message: the choice joins the message, and the person is back on the typing screen.
  const handleAddToMessage = useCallback((words: string) => {
    setGlobalText(prev => {
      const next = appendToMessage(prev, words);
      try { sessionStorage.setItem(KEYBOARD_TEXT_SESSION_KEY, next); } catch { /* ignore */ }
      return next;
    });
    handleNavigate(messageReturnScreen || 'keyboard');
  }, [handleNavigate, messageReturnScreen]);
  const addToMessage = React.useMemo<AddToMessage | undefined>(() => (messageReturnScreen ? {
    text: globalText,
    add: handleAddToMessage,
    back: () => handleNavigate(ADD_TO_MESSAGE_SCREEN),
  } : undefined), [globalText, handleAddToMessage, handleNavigate, messageReturnScreen]);

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
          wordSlots={ws.wordSlots} predictionMeta={ws.predictionMeta}
          sentencePredictions={ws.sentencePredictions}
          expandAbbreviation={ws.expandAbbreviation} abbreviationExpansion={ws.abbreviationExpansion}
          learnWord={ws.learnWord} learnSentence={ws.learnSentence}
          undoWordLearning={ws.undoWordLearning} connected={ws.isConnected}
        />;
      case 'spatial':
        return <SpatialKeyboardScreen
          {...common}
          onTextChange={handleTextChange}
          initialText={globalText}
          getPredictions={ws.getPredictions}
          predictions={ws.predictions}
          predictionMeta={ws.predictionMeta}
          connected={ws.isConnected}
          expandAbbreviation={ws.expandAbbreviation}
          abbreviationExpansion={ws.abbreviationExpansion}
          learnWord={ws.learnWord}
          learnSentence={ws.learnSentence}
        />;
      case 'phrases': return <PhrasesScreen {...common} addToMessage={addToMessage} />;
      case 'settings':
        return <SettingsScreen {...common} />;

      case 'medical': return <MedicalScreen {...common} addToMessage={addToMessage} />;
      case 'feelings': return <FeelingScreen {...common} />;
      case 'needs': return <BasicNeedsScreen {...common} />;
      case 'people': return <PeopleScreen {...common} addToMessage={addToMessage} />;
      case 'activities': return <ActivitiesScreen {...common} />;
      case 'web': return <WebBrowsingScreen {...common} />;
      case 'floor-plan': return <DesignHomeLandingScreen {...common} />;
      case 'floor-plan-survey': return <FloorPlanSurveyScreen {...common} />;
      case 'compass-map': return <CompassMapScreen {...common} />;
      case 'customize': return <CustomizeScreen {...common} />;
      case 'music': return <MusicScreen {...common} />;
      case 'quickwords': return <QuickWordsScreen {...common} addToMessage={addToMessage} />;
      case ADD_TO_MESSAGE_SCREEN: return <AddToMessageScreen onNavigate={handleNavigate} isDarkMode={isDarkMode}
        messageText={globalText} returnScreen={messageReturnScreen || 'keyboard'} />;
      default: return <HomeScreen {...common} />;
    }
  };

  const voiceNotice = speechNotice ? <div role="status" aria-live="polite" style={{
    position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
    maxWidth: '70vw', padding: '8px 16px', borderRadius: 8, zIndex: 10000,
    background: isDarkMode ? '#22313b' : '#fffdf8', color: isDarkMode ? '#fff' : '#23343f',
    fontSize: 'clamp(16px, 1.3vw, 22px)', pointerEvents: 'none', textAlign: 'center',
  }}>{speechNotice}</div> : null;

  // Alert Mode: unconditionally render the lock screen
  if (isAlertMode) {
    return <div className="design-surface" data-design-screen="urgent">{voiceNotice}<AlertModeScreen onSpeak={handleSpeak} onHome={handleAlertModeHome} isDarkMode={isDarkMode} /></div>;
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
  const isHomeWarmLight = currentScreen === 'home' && theme === 'warm';
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
      {voiceNotice}
      {/* Live clock — hidden on screens where top-right is crowded */}
      <LiveClock currentScreen={currentScreen} suppressed={isLiveClockSuppressed || currentScreen === 'home'} />

      {/* Screen content */}
      <div className={currentScreen === 'keyboard' ? undefined : 'design-surface'} data-design-screen={currentScreen} style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <ErrorBoundary>
          <React.Suspense fallback={<ScreenLoading isDarkMode={isDarkMode} />}>
            {renderScreen()}
          </React.Suspense>
        </ErrorBoundary>
      </div>

      {/* Connection indicator */}
      <div className="connection-indicator" data-connected={ws.isConnected} style={connectionIndicatorStyle}>
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
