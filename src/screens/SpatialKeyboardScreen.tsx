import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GazeButton from '../components/core/GazeButton';
import { useGazeControl } from '../components/core/GazeControlToggle';
import ZoneBoard from '../components/ZoneBoard';
import KeyboardMessageDisplay from '../components/shared/KeyboardMessageDisplay';
import { HomeIcon, KeyboardIcon, MessageIcon, FullscreenIcon, MinimizeIcon, EyeIcon, PauseIcon } from '../components/icons/Icons';
import { useFocusMode } from '../contexts/FocusModeContext';
import { commitZoneSuggestion, currentZoneWord, zoneSuggestions, ZoneSuggestion } from '../utils/zoneBoardText';
import '../styles/zone-board.css';

const nativeWindow = () => (window as Window & { electronAPI?: { window: {
  fullscreen: (enabled?: boolean) => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
} } }).electronAPI?.window;

interface SpatialKeyboardProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  onTextChange?: (text: string) => void;
  initialText?: string;
  isDarkMode?: boolean;
  showHindi?: boolean;
  getPredictions?: (text: string) => void;
  predictions?: ZoneSuggestion[];
  expandAbbreviation?: (abbrev: string) => void;
  abbreviationExpansion?: string | null;
  learnWord?: (word: string) => void;
  learnSentence?: (sentence: string) => void;
}

const SpatialKeyboardScreen: React.FC<SpatialKeyboardProps> = ({
  onNavigate, onSpeak, onTextChange, initialText = '', getPredictions,
  predictions = [], learnWord, learnSentence,
}) => {
  const [text, setText] = useState(initialText);
  const textRef = useRef(initialText);
  const predictRef = useRef(getPredictions);
  predictRef.current = getPredictions;
  const { isGazeEnabled, toggleGaze, lastEnabledTimestamp, signalNavigation } = useGazeControl();
  const { isFocusMode } = useFocusMode();
  const [fullscreen, setFullscreen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState('');
  const suggestions = useMemo(() => zoneSuggestions(text, predictions), [text, predictions]);

  useEffect(() => {
    const timer = window.setTimeout(() => predictRef.current?.(text), 120);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    let cancelled = false;
    const api = nativeWindow();
    const refresh = () => {
      if (api) void api.isFullscreen().then(value => { if (!cancelled) setFullscreen(value); }).catch(() => {});
      else setFullscreen(!!document.fullscreenElement);
    };
    // Idempotent in React StrictMode. The browser preview fills its viewport;
    // browser-level full screen still requires the user's button activation.
    if (api) void api.fullscreen(true).then(refresh).catch(() => {});
    document.addEventListener('fullscreenchange', refresh);
    window.addEventListener('resize', refresh);
    return () => {
      cancelled = true;
      document.removeEventListener('fullscreenchange', refresh);
      window.removeEventListener('resize', refresh);
    };
  }, []);

  const updateText = useCallback((next: string) => {
    textRef.current = next;
    setText(next);
    onTextChange?.(next);
  }, [onTextChange]);
  const applySuggestion = (word: string) => {
    updateText(commitZoneSuggestion(textRef.current, word));
    learnWord?.(word);
  };
  const speak = () => {
    if (textRef.current.trim()) {
      onSpeak(textRef.current);
      learnSentence?.(textRef.current);
    }
  };
  const toggleFullscreen = async () => {
    setFullscreenNotice('');
    signalNavigation();
    try {
      const api = nativeWindow();
      if (api) {
        const current = await api.isFullscreen();
        await api.fullscreen(!current);
        setFullscreen(!current);
      } else if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenNotice('Open the preview at full size to use full screen.');
    }
  };
  const gaze = { gazeEnabled: isGazeEnabled, gazeEnabledTimestamp: lastEnabledTimestamp, isDarkMode: true };

  return (
    <main className={`spatial-screen zone-workspace${isExpanded ? ' zone-workspace-reading' : ''}`} aria-label="Zone Board">
      <KeyboardMessageDisplay text={text} expanded={isExpanded} {...gaze}
        onToggleExpanded={() => { signalNavigation(); setIsExpanded(value => !value); }} onSpeak={speak}
        speakId="spatial-display-speak" expandId="spatial-display-expand" />
      {!isExpanded && <>
      <section className="zone-suggestions" aria-label="Word suggestions">
        {suggestions.map((entry, index) => (
          <GazeButton key={`${index}-${entry.word}`} id={`spatial-suggestion-${index}`} {...gaze}
            className="zone-suggestion" dwellCategory="predictionButton" onClick={() => applySuggestion(entry.word)}>
            {entry.word}
          </GazeButton>
        ))}
      </section>
      <ZoneBoard onLetterTyped={letter => updateText(textRef.current + letter)}
        onDelete={() => updateText(textRef.current.slice(0, -1))}
        onSpace={() => {
          const word = currentZoneWord(textRef.current);
          if (word) learnWord?.(word);
          updateText(textRef.current + ' ');
        }}
        onSpeak={speak} currentWord={currentZoneWord(text)} {...gaze} />
      </>}
      <nav className="zone-navigation" aria-label="Zone Board navigation">
        <GazeButton id="spatial-home" {...gaze} ariaLabel="Home" disabled={isFocusMode} dwellCategory="navigationButton" onClick={() => onNavigate('home')}><span className="zone-nav-content"><HomeIcon /><span>Home</span></span></GazeButton>
        <GazeButton id="spatial-keyboard" {...gaze} ariaLabel="Keyboard" disabled={isFocusMode} dwellCategory="navigationButton" onClick={() => onNavigate('keyboard')}><span className="zone-nav-content"><KeyboardIcon /><span>Keyboard</span></span></GazeButton>
        <GazeButton id="spatial-quick-phrases" {...gaze} ariaLabel="Quick Phrases" disabled={isFocusMode} dwellCategory="navigationButton" onClick={() => onNavigate('quickwords')}><span className="zone-nav-content"><MessageIcon /><span>Quick Phrases</span></span></GazeButton>
        <GazeButton id="spatial-fullscreen" {...gaze} ariaLabel={fullscreen ? 'Exit full screen' : 'Full screen'} dwellCategory="navigationButton" onClick={toggleFullscreen}><span className="zone-nav-content">{fullscreen ? <MinimizeIcon /> : <FullscreenIcon />}<span>{fullscreen ? 'Exit full screen' : 'Full screen'}</span></span></GazeButton>
        <GazeButton id="spatial-gaze" {...gaze} alwaysActive dwellCategory="gazeToggle" onClick={toggleGaze}
          ariaLabel={isGazeEnabled ? 'Pause gaze' : 'Enable gaze'} selected={isGazeEnabled}><span className="zone-nav-content">{isGazeEnabled ? <PauseIcon /> : <EyeIcon />}<span>{isGazeEnabled ? 'Pause gaze' : 'Enable gaze'}</span></span></GazeButton>
      </nav>
      {fullscreenNotice && <div className="zone-fullscreen-notice" role="status">{fullscreenNotice}</div>}
    </main>
  );
};

export default React.memo(SpatialKeyboardScreen);
