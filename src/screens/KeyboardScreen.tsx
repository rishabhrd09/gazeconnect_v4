import { DWELL_GROUPS, FAMILIAR_KEYBOARD_TIMING, normalizeKeyboardFeel } from '../config/dwellTimeConfig';
/**
 * GazeConnect Pro - Professional Keyboard v5.0
 * =============================================
 * Optimized layout: compact predictions, maximum keyboard space.
 * Responsive: works 14" laptop to 26" desktop.
 * Inline gaze toggle - nothing hidden at bottom.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import GazeButton from '../components/core/GazeButton';
import KeyboardMessageDisplay from '../components/shared/KeyboardMessageDisplay';
import '../styles/keyboard-layout.css';
import { darkColors, lightColors, screenThemes, typography } from '../utils/design';
import { useGazeControl, GAZE_ENABLE_COOLDOWN_MS } from '../components/core/GazeControlToggle';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useRealGaze } from '../contexts/RealGazeContext';
import { useTheme } from '../contexts/ThemeContext';
import QuickWordsOverlay from '../components/QuickWordsOverlay';
import { useCustomization } from '../contexts/CustomizationContext';
import {
  PredictionTelemetryKind,
  PredictionTelemetrySnapshot,
  PredictionAcceptMeta,
  applyPredictionTelemetry,
  loadPredictionTelemetry,
  persistPredictionTelemetry,
} from '../utils/predictionTelemetry';
import {
  TOP_WORD_SLOTS,
  WORD_SLOT_COUNT,
  acceptSentenceSuggestion,
  acceptWordPrediction,
  isShortSentence,
  predictionsAreFresh,
  presentWordSlots,
  wordFitsText,
  type SentenceSuggestion,
  type WordPredictionMeta,
} from '../utils/wordPredictionSlots';

// ── Hindi AAC Vocabulary ────────────────────────────────────────────────────
// High-frequency words for ALS/MND patients — natural spoken Hindi only.
// Not dictionary Hindi. Used for keyboard word prediction in Hindi mode.
const HINDI_AAC_VOCABULARY: string[] = [
  // Essential yes/no/ok
  'हाँ', 'नहीं', 'ठीक', 'अच्छा', 'बस',
  // Urgent needs
  'मदद', 'दर्द', 'जल्दी', 'रुको', 'आओ', 'बुलाओ',
  // Physical needs
  'पानी', 'खाना', 'दवा', 'टॉयलेट', 'ठंड', 'गर्मी', 'नींद', 'थकान',
  // Medical / body
  'सक्शन', 'ऑक्सीजन', 'डॉक्टर', 'नर्स', 'इंजेक्शन', 'बुखार',
  'सीना', 'पेट', 'पीठ', 'सिर', 'हाथ', 'पैर', 'आँख', 'मुँह',
  // Position and comfort
  'ऊपर', 'नीचे', 'दाएँ', 'बाएँ', 'सीधे', 'बदलो',
  'तकिया', 'चादर', 'कंबल', 'पंखा', 'लाइट', 'AC',
  // Common verbs (commands)
  'करो', 'दो', 'लाओ', 'देखो', 'सुनो', 'बोलो', 'चालू', 'बंद',
  // Family
  'माँ', 'पापा', 'भाई', 'बहन', 'बेटा', 'बेटी', 'पत्नी', 'परिवार',
  // Emotions / social
  'धन्यवाद', 'माफ़', 'प्यार', 'खुश', 'दुखी', 'घबराहट',
  // Time
  'अभी', 'बाद', 'आज', 'कल', 'रात', 'सुबह', 'शाम', 'धीरे',
  // Food & drink
  'चाय', 'दूध', 'पानी', 'रोटी', 'दाल', 'चावल', 'मीठा', 'नमक',
  // Grammar helpers (complete simple sentences)
  'चाहिए', 'है', 'हूँ', 'था', 'नहीं है', 'कर दो',
];
// ────────────────────────────────────────────────────────────────────────────

const UI_FONT = typography.fontFamily.primary;
// Light-mode keyboard palette — research-grounded AAC zoning.
// Citations + rationale: see keyboard section in lightmode.css / warmmode.css.
// Note: most surface values are also overridden by CSS (data-action selectors)
// so JSX inline-styles + CSS converge on the same target.
const LIGHT_KEYBOARD_THEME = {
  shellBg: '#FAF5ED',                    // page bg (matches --lm-root)
  textAreaBg: '#FCF8F2',                 // raised text area cream
  railBg: '#F7F1E8',                     // recessed action rail
  railBorder: '#D6CBBB',
  keyBg: '#FCF8F2',                      // letter cream
  keyHoverBg: '#F0E9DD',                 // warm-amber hover lift
  keyBorder: '#D6CBBB',
  keyText: '#26342D',                    // unified text — 13.96:1
  keyTextMuted: '#5C665E',
  // Backspace (corrective) — Modified Fitzgerald muted coral
  deleteWordBg: '#F1DBD1',
  deleteWordColor: '#7A312E',
  // Speak (positive) — sage
  speakBg: '#DFE8DC',
  speakBorder: '#5F7C58',
  speakText: '#3F5A38',
  // Soft delete-word variant (deeper border)
  deleteWordSoftBg: '#F1DBD1',
  deleteWordSoftBorder: '#A56D55',
  deleteWordSoftText: '#7A312E',
  // Prediction strip — recessed warm zone, distinct from letter cream
  predictionBg: '#F4EFE7',
  predictionHoverBg: '#F0E9DD',
};

const getKeyboardTheme = (isDarkMode: boolean) => (
  isDarkMode ? screenThemes.keyboard : LIGHT_KEYBOARD_THEME
);

const getKeyboardAccent = (isDarkMode: boolean) => (
  isDarkMode ? screenThemes.cursor.normal : lightColors.warning.main
);

// Hierarchy colors — paper-mode values use the research-grounded prediction palette:
// best prediction gets a slightly deeper amber accent so it's instantly identifiable
// in eye-tracking scans (Schlosser 2015: visual hierarchy reduces fixation errors 24%).
const getKeyboardHierarchyColors = (isDarkMode: boolean) => ({
  predictionBestBg: isDarkMode ? '#242C26' : '#EEF0E4',                    // deeper amber accent (best prediction stands out)
  predictionText: isDarkMode ? '#A5D0B9' : '#285C4D',    // warm dark-brown ~7.5:1
  predictionBestText: isDarkMode ? '#CBE5D7' : '#1F4A3E',                  // primary text (AAA on best-bg)
  secondarySuggestionBg: isDarkMode ? '#1A201C' : '#F4EFE7',
  secondarySuggestionText: isDarkMode ? '#A5D0B9' : '#285C4D',
  // Sentence row — subtle sky-blue tint signals "alternate suggestion" zone
  sentenceSuggestionBg: isDarkMode ? '#222B27' : '#EDEFE6',
  sentenceSuggestionText: isDarkMode ? '#DCE6DD' : '#26342D',
  // Show-nav suggestion — soft sage signals "navigation/positive"
  showNavSuggestionBg: isDarkMode ? '#22302A' : '#E4EAD9',
  showNavSuggestionText: isDarkMode ? '#BBC6BE' : '#285C4D',
});

interface KeyboardScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  onTextChange?: (text: string) => void;
  onNavHiddenChange?: (hidden: boolean) => void;
  initialText?: string;
  isDarkMode?: boolean;
  showHindi?: boolean;
  getPredictions?: (text: string, length_hint?: number, lang?: string,
    options?: { slotCount?: number; resetLineage?: boolean }) => void;
  predictions?: Array<{ word: string; score: number }>;
  /** Ten fixed word positions from the backend (null = deliberately empty). */
  wordSlots?: Array<string | null> | null;
  /** The draft the slots were computed for; slots are selectable only for it. */
  predictionMeta?: WordPredictionMeta | null;
  expandAbbreviation?: (abbrev: string) => void;
  abbreviationExpansion?: string | null;
  learnWord?: (word: string, textBefore?: string, textAfter?: string) => void;
  learnSentence?: (sentence: string) => void;
  undoWordLearning?: (textBefore: string, textAfter: string) => void;
  sentencePredictions?: SentenceSuggestion[];
  /** Backend connection; a request made while disconnected is repeated on reconnect. */
  connected?: boolean;
}

interface KeyConfig {
  key: string;
  display?: string;
  flex?: number;
  action?: 'letter' | 'space' | 'backspace' | 'enter' |
  'shift' | 'speak' | 'deleteWord' |
  'toggleNumbers' | 'toggleHindiPage' | 'gaze' | 'quickWords';
}

// "Big Key" layout — number row removed, vertical space redistributed to 3 letter rows + command bar
const QWERTY_ROWS: KeyConfig[][] = [
  // Row 1: Q–P (10 keys)
  [
    { key: 'q' }, { key: 'w' }, { key: 'e' }, { key: 'r' }, { key: 't' },
    { key: 'y' }, { key: 'u' }, { key: 'i' }, { key: 'o' }, { key: 'p' },
  ],
  // Row 2: A–L + ? (10 keys)
  [
    { key: 'a' }, { key: 's' }, { key: 'd' }, { key: 'f' }, { key: 'g' },
    { key: 'h' }, { key: 'j' }, { key: 'k' }, { key: 'l' },
    { key: '?' },
  ],
  // Row 3: Shift + Z–M + comma + DEL (single char delete)
  [
    { key: 'shift', display: 'Shift', action: 'shift' },
    { key: 'z' }, { key: 'x' }, { key: 'c' }, { key: 'v' },
    { key: 'b' }, { key: 'n' }, { key: 'm' },
    { key: ',', display: ',' },
    { key: 'backspace', display: '✕ BACK', action: 'backspace' },
  ],
  // Row 4: Command Hub — clean 4-cell layout (gaze hub docks here only when nav hidden)
  [
    { key: 'deleteWord', display: '⌫ WORD', action: 'deleteWord', flex: 1.6 },
    { key: 'speak', display: 'SPEAK', action: 'speak', flex: 1.5 },
    { key: 'space', display: 'SPACE', action: 'space', flex: 5 },
    { key: '123', display: '123', action: 'toggleNumbers', flex: 1.8 },
  ],
];

// Symbol/Number grid — replaces rows 1-3 when 123 mode is active. Row 4 stays unchanged.
const SYMBOL_ROWS: KeyConfig[][] = [
  // Row 1: Numbers
  [
    { key: '1' }, { key: '2' }, { key: '3' }, { key: '4' }, { key: '5' },
    { key: '6' }, { key: '7' }, { key: '8' }, { key: '9' }, { key: '0' },
  ],
  // Row 2: High-frequency symbols
  [
    { key: '@' }, { key: '#' }, { key: '$' }, { key: '%' }, { key: '&' },
    { key: '-' }, { key: '+' }, { key: '(' }, { key: ')' }, { key: '/' },
  ],
  // Row 3: ABC toggle + punctuation + emojis + BACK
  [
    { key: 'toggleNumbers', display: 'ABC', action: 'toggleNumbers', flex: 1.5 },
    { key: '!' }, { key: '"' }, { key: "'" }, { key: ':' }, { key: ';' },
    { key: '😊' }, { key: '🙏' }, { key: '👍' },
    { key: 'backspace', display: '✕ BACK', action: 'backspace', flex: 1.5 },
  ],
];

// Single-Page 5-Row Devanagari System (Varnamala Order)
// Matras are hidden because they auto-insert via smart logic when a vowel is typed after a consonant.
const HINDI_ROWS: KeyConfig[][] = [
  // Row 1: Vowels
  [
    { key: 'अ' }, { key: 'आ' }, { key: 'इ' }, { key: 'ई' }, { key: 'उ' },
    { key: 'ऊ' }, { key: 'ए' }, { key: 'ऐ' }, { key: 'ओ' }, { key: 'औ' },
  ],
  // Row 2: Ka & Cha varga
  [
    { key: 'क' }, { key: 'ख' }, { key: 'ग' }, { key: 'घ' }, { key: 'ङ' },
    { key: 'च' }, { key: 'छ' }, { key: 'ज' }, { key: 'झ' }, { key: 'ञ' },
  ],
  // Row 3: Ta & Da varga
  [
    { key: 'ट' }, { key: 'ठ' }, { key: 'ड' }, { key: 'ढ' }, { key: 'ण' },
    { key: 'त' }, { key: 'थ' }, { key: 'द' }, { key: 'ध' }, { key: 'न' },
  ],
  // Row 4: Pa varga + Ya, Ra, La, Va, Sha
  [
    { key: 'प' }, { key: 'फ' }, { key: 'ब' }, { key: 'भ' }, { key: 'म' },
    { key: 'य' }, { key: 'र' }, { key: 'ल' }, { key: 'व' }, { key: 'श' },
  ],
  // Row 5: Remaining + Specials + Backspace
  [
    { key: 'ष' }, { key: 'स' }, { key: 'ह' }, { key: 'क्ष' }, { key: 'त्र' },
    { key: 'ज्ञ' }, { key: 'ं', display: 'ं' }, { key: 'ः', display: 'ः' }, { key: '्', display: '्' },
    { key: 'backspace', display: '✕ BACK', action: 'backspace', flex: 1.2 },
  ],
];

// OptiKey-inspired FULL 360° Circle Dwell Progress
const FullCircleDwell: React.FC<{
  progress: number; size: number; color: string; showShrink?: boolean;
  completed?: boolean;
}> = ({ progress, size, color, showShrink = true, completed = false }) => {
  const strokeW = 4;
  const r = (size - strokeW * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);
  const shrinkR = showShrink ? r * 0.35 * (1 - progress) : 0;
  const glowFilter = completed ? `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color})` : 'none';

  return (
    <svg width={size} height={size} style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%) rotate(-90deg)',
      pointerEvents: 'none', zIndex: 2,
      filter: glowFilter,
      transition: 'filter 100ms ease',
    }}>
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeW} />
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 16ms linear' }} />
      {showShrink && shrinkR > 1 && (
        <circle cx={size / 2} cy={size / 2} r={shrinkR}
          fill={`${color}22`} stroke={`${color}40`} strokeWidth={1} />
      )}
    </svg>
  );
};

const QuickWordsButtonIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 28,
  color = 'currentColor',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5.6 5.4h12.8a3.1 3.1 0 0 1 3.1 3.1v5.1a3.1 3.1 0 0 1-3.1 3.1h-6.9L7.4 20v-3.3H5.6a3.1 3.1 0 0 1-3.1-3.1V8.5a3.1 3.1 0 0 1 3.1-3.1Z" />
    <circle cx="8.5" cy="11.05" r="0.85" fill={color} stroke="none" />
    <circle cx="12" cy="11.05" r="0.85" fill={color} stroke="none" />
    <circle cx="15.5" cy="11.05" r="0.85" fill={color} stroke="none" />
  </svg>
);

// Key Button with animation-driven dwell
const KeyBtn: React.FC<{
  config: KeyConfig; onPress: (k: string, a?: string) => void;
  isShift: boolean; isDarkMode: boolean; dwellMs: number;
  gazeEnabled: boolean; lastEnabledTs: number; hasRealGaze: boolean;
  familiarFeel: boolean;
}> = ({ config, onPress, isShift, isDarkMode, dwellMs, gazeEnabled, lastEnabledTs, hasRealGaze, familiarFeel }) => {
  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState(false);
  const [completed, setCompleted] = useState(false);
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startRef = useRef(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const colors = isDarkMode ? darkColors : lightColors;
  const keyboardTheme = getKeyboardTheme(isDarkMode);
  const keyboardAccent = getKeyboardAccent(isDarkMode);
  // Familiar changes only keyboard typing and Shift. Keep the existing longer
  // deliberate/communication/navigation timings for the other action keys.
  const familiarTypingKey = familiarFeel && config.action !== 'deleteWord'
    && config.action !== 'speak' && config.action !== 'quickWords';
  const fillMs = familiarTypingKey
    ? (config.action === 'shift' ? FAMILIAR_KEYBOARD_TIMING.modifier : FAMILIAR_KEYBOARD_TIMING.key)
    : dwellMs;
  const onsetMs = familiarTypingKey ? FAMILIAR_KEYBOARD_TIMING.onset : 0;

  const clearAll = useCallback(() => {
    if (timerRef.current) { cancelAnimationFrame(timerRef.current); timerRef.current = null; }
    if (flashTimerRef.current) { clearTimeout(flashTimerRef.current); flashTimerRef.current = null; }
  }, []);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startRef.current - onsetMs;
    const p = Math.max(0, Math.min(1, elapsed / fillMs));
    setProgress(p);

    if (p >= 1 && !firedRef.current) {
      firedRef.current = true;
      setCompleted(true);
      flashTimerRef.current = setTimeout(() => {
        setFlash(true);
        setProgress(0);
        setCompleted(false);
        onPress(config.key, config.action);
        setTimeout(() => setFlash(false), 150);
      }, 80);
      return;
    }
    if (p < 1) {
      timerRef.current = requestAnimationFrame(tick);
    }
  }, [fillMs, onsetMs, onPress, config.key, config.action]);

  const handleEnter = () => {
    if (hasRealGaze) { setHovered(true); return; }
    if (!gazeEnabled) return;
    if (lastEnabledTs && Date.now() - lastEnabledTs < GAZE_ENABLE_COOLDOWN_MS) return;
    setHovered(true);
    firedRef.current = false;
    setCompleted(false);
    startRef.current = Date.now();
    timerRef.current = requestAnimationFrame(tick);
  };

  const handleLeave = () => {
    setHovered(false); setProgress(0); setCompleted(false);
    firedRef.current = false;
    clearAll();
  };

  useEffect(() => () => clearAll(), [clearAll]);

  const isAction = config.action && config.action !== 'letter';
  const isSpeak = config.action === 'speak';
  const isDeleteWord = config.action === 'deleteWord';
  const isBackspace = config.action === 'backspace';
  const isShiftKey = config.action === 'shift';
  const isQuickWords = config.action === 'quickWords';
  const isSpecialAction = isSpeak || isDeleteWord || isBackspace || isShiftKey || isQuickWords;

  let bg = keyboardTheme.keyBg;
  let border = keyboardTheme.keyBorder;
  let textColor = keyboardTheme.keyText;
  let dwellColor = keyboardAccent;
  const actionTextColor = isDarkMode ? '#F5EFE6' : '#FFFDF8';
  const mutedMaroonActionBg = isDarkMode ? 'rgba(57, 35, 36, 0.96)' : 'rgba(116, 62, 61, 0.86)';
  const mutedMaroonDwell = isDarkMode ? '#D2A09A' : '#F4D5CA';

  // Inline backgrounds + borders for paper modes are overridden by CSS
  // (data-action selectors in warmmode.css / lightmode.css), so the values
  // below are mainly used in dark mode. Dwell-ring colors apply in all modes.
  if (isSpeak) {
    bg = keyboardTheme.speakBg; border = 'transparent'; textColor = actionTextColor;
    dwellColor = keyboardTheme.speakBorder;
  } else if (isQuickWords) {
    bg = isDarkMode ? 'rgba(30, 48, 60, 0.96)' : '#E2ECEF';                  // sky-blue tint
    border = 'transparent';
    textColor = actionTextColor;
    dwellColor = isDarkMode ? '#88B7BE' : '#4F7388';                          // deeper sky-blue dwell
  } else if (isDeleteWord) {
    bg = mutedMaroonActionBg; border = 'transparent'; textColor = actionTextColor;
    dwellColor = mutedMaroonDwell;
  } else if (isBackspace) {
    bg = mutedMaroonActionBg; border = 'transparent'; textColor = actionTextColor;
    dwellColor = mutedMaroonDwell;
  } else if (isShiftKey) {
    bg = isDarkMode ? 'rgba(28, 48, 54, 0.96)' : '#F4ECD8';                  // neutral warm tan
    border = 'transparent';
    textColor = actionTextColor;
    dwellColor = isDarkMode ? '#8FB7B2' : '#65543E';                          // deeper umber dwell
  }
  if (hovered && !isAction) {
    bg = keyboardTheme.keyHoverBg;
    border = keyboardAccent;
  }
  const visibleBorder = isSpecialAction ? 'transparent' : border;

  let display = config.display || config.key;
  // Familiar keeps the photographed lowercase QWERTY labels; the typed output
  // and key positions do not change. Standard keeps the existing display.
  if (!isAction && display.length === 1) {
    display = familiarFeel
      ? (isShift ? display.toUpperCase() : display.toLowerCase())
      : (isShift ? display.toLowerCase() : display.toUpperCase());
  }

  const btnW = btnRef.current?.offsetWidth || 60;
  const btnH = btnRef.current?.offsetHeight || 52;
  const circleSize = Math.min(btnW, btnH) * 0.90;

  // Detect Devanagari for Hindi font styling
  const isDevanagari = /[\u0900-\u097F]/.test(display);
  // Matra/modifier keys (anusvara ं, visarga ः, halant ्) get distinct blue-white
  const isMatra = config.key === 'ं' || config.key === 'ः' || config.key === '्';
  const hindiFontStyle: React.CSSProperties = isDevanagari ? {
    fontFamily: "'Noto Sans Devanagari', sans-serif",
    fontWeight: 700,
    fontSize: isMatra
      ? 'clamp(32px, 3.65vw, 52px)'
      : (isAction ? 'clamp(21px, 2.15vw, 28px)' : 'clamp(34px, 3.8vw, 56px)'),
    letterSpacing: '0.5px',
    color: isMatra
      ? (isDarkMode ? 'rgba(180, 220, 255, 0.90)' : lightColors.text.secondary)
      : (isDarkMode ? 'rgba(255, 215, 150, 0.95)' : lightColors.text.primary),
    lineHeight: 1.4,
  } : {};

  return (
    <button
      ref={btnRef}
      className="gaze-button keyboard-key"
      data-gaze="true"
      data-gaze-context={isDeleteWord ? "deliberateAction" : isSpeak ? "quickWord" : isQuickWords ? "navigation" : "keyboard"}
      data-gaze-dwell-ms={fillMs}
      data-action={config.action || 'letter'}
      data-keyboard-onset={familiarTypingKey && hovered && !hasRealGaze && progress === 0 && !firedRef.current ? 'true' : undefined}
      onMouseEnter={handleEnter} onMouseLeave={handleLeave}
      onClick={() => {
        // A physical click remains immediate and must cancel any preview dwell.
        if (familiarTypingKey) {
          clearAll();
          firedRef.current = true;
          setHovered(false); setProgress(0); setCompleted(false);
        }
        onPress(config.key, config.action);
      }}
      style={{
        position: 'relative', flex: config.flex || 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: flash ? `${dwellColor}30` : bg,
        border: `2px solid ${visibleBorder}`, borderRadius: '10px',
        outline: 'none',
        color: textColor,
        fontSize: isAction ? 'clamp(19px, 1.9vw, 26px)' : 'clamp(32px, 3.25vw, 48px)',
        fontWeight: isAction ? 760 : familiarFeel ? 600 : 720,
        letterSpacing: isAction ? '0' : '0.5px',
        cursor: 'pointer',
        transform: flash ? 'scale(0.95)' : hovered ? 'scale(1.02)' : 'scale(1)',
        transition: 'all 80ms', overflow: 'hidden',
        minHeight: '0', padding: '2px',
        ...hindiFontStyle,
      }}
    >
      {hovered && progress > 0 && (
        <FullCircleDwell
          progress={progress}
          size={circleSize}
          color={dwellColor}
          showShrink={!familiarFeel}
          completed={completed && !familiarFeel}
        />
      )}
      <span style={{
        position: 'relative',
        zIndex: 3,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isQuickWords ? 'clamp(8px, 0.7vw, 12px)' : 0,
        whiteSpace: isQuickWords ? 'normal' : 'nowrap',
        flexDirection: isQuickWords ? 'column' : 'row',
        maxWidth: '100%',
      }}>
        {isQuickWords && <QuickWordsButtonIcon size={28} />}
        <span>{display}</span>
      </span>
    </button>
  );
};


/**
 * One word-suggestion slot. Keyed by slot AND word by its parent, so a slot whose
 * word changes is a new button: dwell progress (mouse or gaze) never carries
 * over to a different word. Empty slots stay in place, disabled.
 */
const WordSlotButton: React.FC<{
  index: number;
  word: string | null;
  selectable: boolean;
  best: boolean;
  isDarkMode: boolean;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  familiarFeel: boolean;
  onSelect: (index: number, word: string) => void;
}> = React.memo(({ index, word, selectable, best, isDarkMode, gazeEnabled, gazeEnabledTimestamp, familiarFeel, onSelect }) => {
  const keyboardTheme = getKeyboardTheme(isDarkMode);
  const { predictionBestBg, predictionText, predictionBestText } = getKeyboardHierarchyColors(isDarkMode);
  if (!word) {
    return (
      <div className="keyboard-word-slot keyboard-word-slot-empty" data-slot-index={index} aria-hidden="true"
        style={{ backgroundColor: keyboardTheme.predictionBg }} />
    );
  }
  const letters = Math.max(1, word.length);
  return (
    <GazeButton
      id={`word-slot-${index}`}
      className={`keyboard-word-slot${best ? ' keyboard-word-slot-best' : ''}${selectable ? '' : ' keyboard-word-slot-stale'}`}
      ariaLabel={`Insert ${word}`}
      dwellCategory="predictionButton"
      mouseDwellOnsetMs={familiarFeel ? FAMILIAR_KEYBOARD_TIMING.onset : undefined}
      mouseDwellDurationMs={familiarFeel ? FAMILIAR_KEYBOARD_TIMING.suggestion : undefined}
      gazeEnabled={gazeEnabled}
      gazeEnabledTimestamp={gazeEnabledTimestamp}
      disabled={!selectable}
      onClick={() => onSelect(index, word)}
      style={{
        width: '100%', height: '100%', minWidth: 0, padding: '0 clamp(6px, 0.6vw, 12px)',
        border: 'none', borderRadius: '10px', boxShadow: 'none', boxSizing: 'border-box',
        backgroundColor: best ? predictionBestBg : keyboardTheme.predictionBg,
        color: best ? predictionBestText : predictionText,
        fontWeight: best ? 780 : 700,
        fontFamily: UI_FONT,
        lineHeight: 1.1,
        whiteSpace: 'nowrap',
        opacity: 1,
        cursor: selectable ? 'pointer' : 'default',
        // The slot is the size container for its label (see below).
        containerType: 'inline-size',
      } as React.CSSProperties}
    >
      {/* Long words shrink to fit the slot instead of being clipped; short words
          keep the large keyboard size. 100cqw is the slot's content width. */}
      <span className="keyboard-word-slot-label" style={{
        fontSize: `min(clamp(34px, 3.6vw, 52px), calc(100cqw / ${(letters * 0.62).toFixed(2)}))`,
      }}>
        {word}
      </span>
    </GazeButton>
  );
});

/** Phrase suggestions (sentences, starters, abbreviation expansions): one cell, never a word slot. */
const PhraseSuggestionButton: React.FC<{
  suggestion: SentenceSuggestion | null;
  selectable: boolean;
  isDarkMode: boolean;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  familiarFeel: boolean;
  onSelect: (suggestion: SentenceSuggestion) => void;
}> = React.memo(({ suggestion, selectable, isDarkMode, gazeEnabled, gazeEnabledTimestamp, familiarFeel, onSelect }) => {
  const { sentenceSuggestionBg, sentenceSuggestionText } = getKeyboardHierarchyColors(isDarkMode);
  if (!suggestion) {
    return <div className="keyboard-phrase-slot keyboard-phrase-slot-empty" aria-hidden="true" style={{ backgroundColor: sentenceSuggestionBg }} />;
  }
  return (
    <GazeButton
      id="phrase-suggestion-0"
      className="keyboard-phrase-slot"
      ariaLabel={`Insert phrase ${suggestion.text}`}
      dwellCategory="predictionButton"
      mouseDwellOnsetMs={familiarFeel ? FAMILIAR_KEYBOARD_TIMING.onset : undefined}
      mouseDwellDurationMs={familiarFeel ? FAMILIAR_KEYBOARD_TIMING.suggestion : undefined}
      gazeEnabled={gazeEnabled}
      gazeEnabledTimestamp={gazeEnabledTimestamp}
      disabled={!selectable}
      onClick={() => onSelect(suggestion)}
      style={{
        width: '100%', height: '100%', minWidth: 0, padding: '0 clamp(10px, 1vw, 18px)',
        border: 'none', borderRadius: '10px', boxShadow: 'none', boxSizing: 'border-box',
        backgroundColor: sentenceSuggestionBg, color: sentenceSuggestionText,
        fontSize: 'clamp(20px, 2vw, 30px)', fontWeight: 720, fontFamily: UI_FONT, lineHeight: 1.12,
        textAlign: 'center', overflow: 'hidden', cursor: selectable ? 'pointer' : 'default',
      }}
    >
      <span style={{
        display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
        overflow: 'hidden', whiteSpace: 'normal', maxWidth: '100%',
      }}>
        {suggestion.text}
      </span>
    </GazeButton>
  );
});

// Main Keyboard Screen
const KeyboardScreen: React.FC<KeyboardScreenProps> = ({
  onNavigate, onSpeak, onTextChange, initialText = '', isDarkMode = true,
  showHindi = false, getPredictions, predictions = [], wordSlots = null, predictionMeta = null,
  expandAbbreviation, abbreviationExpansion, learnWord, learnSentence, undoWordLearning,
  sentencePredictions = [], onNavHiddenChange, connected = true,
}) => {
  const [text, setText] = useState(initialText);
  // Latest text for selection handlers: a dwell can complete between renders.
  const textRef = useRef(initialText);
  textRef.current = text;
  const lineageResetRef = useRef(true);
  const [isShift, setIsShift] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // New state for expand/collapse
  // Keyboard always opens with global nav hidden — gives the keyboard maximum
  // vertical real estate immediately, without an extra dwell to "Hide Nav"
  // every time the user lands on the keyboard from any other screen.
  const [navHidden, setNavHidden] = useState(true);
  const [wordLengthHint, setWordLengthHint] = useState<number | null>(null);
  const [keyboardMode, setKeyboardMode] = useState<'english' | 'hindi' | 'numbers'>('english');
  const [hindiPage, setHindiPage] = useState<1 | 2>(1);
  const [quickWordsOpen, setQuickWordsOpen] = useState(false);
  const [quickWordChoices, setQuickWordChoices] = useState<string[] | null>(null);
  const [, setPredictionTelemetry] = useState<PredictionTelemetrySnapshot>(() => loadPredictionTelemetry());
  const keyboardTheme = getKeyboardTheme(isDarkMode);
  const keyboardAccent = getKeyboardAccent(isDarkMode);
  const {
    secondarySuggestionBg,
    secondarySuggestionText,
    sentenceSuggestionBg,
    sentenceSuggestionText,
    showNavSuggestionBg,
    showNavSuggestionText,
  } = getKeyboardHierarchyColors(isDarkMode);
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze } = useGazeControl();
  const { hasRealGaze } = useRealGaze();
  const { isLight, isWarm } = useTheme();
  const { data: { quickWords, settings } } = useCustomization();
  const familiarFeel = normalizeKeyboardFeel(settings.keyboardFeel) === 'familiar';

  // Track Focus Lock state from Electron
  const [isFocusLocked, setIsFocusLocked] = useState(false);

  // Sync app context to Electron for dynamic right-click menus
  useEffect(() => {
    if ((window as any).electronAPI?.updateAppContext) {
      (window as any).electronAPI.updateAppContext({ screen: 'keyboard', isNavHidden: navHidden });
    }
  }, [navHidden]);

  // Listen for Lock Mode toggles
  useEffect(() => {
    if (!(window as any).electronAPI) return;
    const handleLockToggle = (locked: boolean) => {
      setIsFocusLocked(locked);
    };
    (window as any).electronAPI.on('ui-lock-toggled', handleLockToggle);
    return () => {
      (window as any).electronAPI.off('ui-lock-toggled', handleLockToggle);
    };
  }, []);

  // Strict Vertical Grid — hard-capped heights prevent flexbox collision
  // Nav-hidden mode should be keyboard-first: slimmer support rails, taller alphabet rows.
  // Row heights live in keyboard-layout.css (--kb-*), with short-viewport tiers.
  const ACTION_BAR_HEIGHT = 'var(--kb-action-row)';
  const GAZE_HUB_DIAMETER = navHidden ? '107px' : '97px';
  const SHOW_NAV_COLUMN = 'minmax(170px, 0.78fr)';

  useEffect(() => {
    onNavHiddenChange?.(navHidden);
    return () => {
      onNavHiddenChange?.(false);
    };
  }, [navHidden, onNavHiddenChange]);

  const lastPredictionRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (!getPredictions) return;
    if (!connected) {
      // Nothing reaches a closed socket, and a restarted backend has no board:
      // ask again for the current draft, on a fresh board, once reconnected.
      lastPredictionRequestRef.current = null;
      lineageResetRef.current = true;
      return;
    }
    // One request per distinct draft: re-renders (a new predictions response,
    // a new callback identity) must never trigger another request.
    const requestKey = `${keyboardMode}\u0000${text}`;
    if (lastPredictionRequestRef.current === requestKey) return;
    lastPredictionRequestRef.current = requestKey;
    // The first request after opening the keyboard starts a fresh board;
    // afterwards the backend keeps slot positions while one word grows.
    getPredictions(text, undefined, keyboardMode, { slotCount: WORD_SLOT_COUNT, resetLineage: lineageResetRef.current });
    lineageResetRef.current = false;
  }, [text, getPredictions, keyboardMode, connected]);
  useEffect(() => {
    if (abbreviationExpansion) {
      const words = text.trim().split(' ');
      words[words.length - 1] = abbreviationExpansion;
      const newText = words.join(' ') + ' ';
      setText(newText); onTextChange?.(newText);
    }
  }, [abbreviationExpansion]);

  // Auto-save display text to chat_history/chat_YYYY-MM-DD.txt
  useEffect(() => {
    if ((window as any).electronAPI?.saveSessionText) {
      (window as any).electronAPI.saveSessionText(text);
    }
  }, [text]);

  const recordPredictionTelemetry = useCallback((kind: PredictionTelemetryKind, charsSaved: number, meta?: PredictionAcceptMeta) => {
    setPredictionTelemetry(prev => {
      const next = applyPredictionTelemetry(prev, kind, charsSaved, meta);
      persistPredictionTelemetry(next);
      return next;
    });
  }, []);


  const handleKey = useCallback((key: string, action?: string) => {
    switch (action) {
      case 'space': {
        // Space always inserts a plain space (+ abbreviation expansion). The
        // inline ghost-completion accept was removed at the patient's request
        // (2026-07-06) — Space must never insert a hidden sentence. Word
        // predictions are still accepted explicitly via the top strip only;
        // typed words are never auto-rewritten.
        setText(p => {
          const n = p + ' '; onTextChange?.(n);
          const w = p.trim().split(' '); if (w.length && expandAbbreviation) expandAbbreviation(w[w.length - 1]);
          return n;
        });
        setIsShift(false); break;
      }
      case 'backspace':
        setText(p => { const n = p.slice(0, -1); onTextChange?.(n); return n; }); break;
      case 'enter':
        setText(p => { const n = p + '\n'; onTextChange?.(n); return n; }); break;
      case 'shift': setIsShift(p => !p); break;
      case 'speak':
        if (text.trim()) {
          onSpeak(text); learnSentence?.(text);
        }
        break;
      case 'quickWords':
        onNavigate('quickwords');
        break;
      case 'deleteWord':
        setText(p => {
          const trimmed = p.trimEnd();
          if (!trimmed) return '';
          const lastSpace = trimmed.lastIndexOf(' ');
          const n = lastSpace === -1 ? '' : trimmed.substring(0, lastSpace + 1);
          onTextChange?.(n);
          // Explicit Delete Word: a prediction accepted by mistake is not learned.
          undoWordLearning?.(p, n);
          return n;
        });
        break;
      case 'toggleNumbers':
        setKeyboardMode(p => p === 'english' ? 'numbers' : 'english');
        break;
      default:
        // ── Smart Devanagari Matra Insertion ──
        // When pressing a vowel key (आ) after a consonant (ख), insert
        // the matra (ा) instead of the full vowel, giving "खा" not "खआ".
        // This matches Google/WhatsApp Hindi keyboard behavior.
        const VOWEL_TO_MATRA: Record<string, string> = {
          'आ': 'ा', 'इ': 'ि', 'ई': 'ी', 'उ': 'ु', 'ऊ': 'ू',
          'ए': 'े', 'ऐ': 'ै', 'ओ': 'ो', 'औ': 'ौ', 'ऋ': 'ृ',
        };
        // Devanagari consonant range: क(0915) to ह(0939)
        const isDevanagariConsonant = (ch: string) => {
          const code = ch.charCodeAt(0);
          return (code >= 0x0915 && code <= 0x0939) // Consonants क-ह
            || ch === 'ड़' || ch === 'ढ़'             // Nukta consonants
            || (code >= 0x093E && code <= 0x094C)     // Already has a matra (for vowel change)
            || code === 0x0943;                        // ृ matra
        };

        const matraForm = VOWEL_TO_MATRA[key];
        if (matraForm) {
          // This is a vowel key — decide: matra or full vowel
          setText(p => {
            const lastChar = p.length > 0 ? p[p.length - 1] : '';
            const charToInsert = (lastChar && isDevanagariConsonant(lastChar)) ? matraForm : key;
            const n = p + charToInsert;
            onTextChange?.(n);
            return n;
          });
        } else {
          const c = isShift ? key.toUpperCase() : key.toLowerCase();
          // Smart punctuation: attach the mark to the previous word (strip a
          // trailing auto-space first), THEN add a trailing space so the next
          // letter starts a NEW word. This makes a comma a real word boundary
          // — a following prediction/typing can never absorb the comma or the
          // word before it (patient report 2026-07-06).
          const SMART_PUNCT = new Set(['.', ',', '?', '!', ';', ':']);
          if (SMART_PUNCT.has(key)) {
            setText(p => {
              const base = p.endsWith(' ') ? p.slice(0, -1) : p;
              const n = base + key + ' ';
              onTextChange?.(n);
              return n;
            });
          } else {
            setText(p => { const n = p + c; onTextChange?.(n); return n; });
          }
        }
        if (isShift) setIsShift(false); break;
    }
  }, [text, isShift, onSpeak, onTextChange, expandAbbreviation, learnSentence, recordPredictionTelemetry, showHindi, onNavigate, undoWordLearning]);

  const handlePrediction = useCallback((word: string, rank?: number) => {
    const normalizedWord = word.trim();
    const isEmptyText = text.trimEnd().length === 0;
    const isPhrasePrediction = normalizedWord.includes(' ');

    // The partial word being completed is ONLY the trailing run of letters
    // (Latin or Devanagari). Punctuation such as a comma is a hard word
    // boundary — choosing a prediction must replace just the partial word and
    // never absorb the comma or the word before it (patient report 2026-07-06).
    const partialMatch = text.match(/[A-Za-zऀ-ॿ]+$/);
    const partialWord = partialMatch ? partialMatch[0] : '';
    const charsSaved = Math.max(0, normalizedWord.length - partialWord.length);

    let n: string;
    if (partialWord) {
      // Replace only the trailing partial word, keep everything before it.
      n = text.slice(0, text.length - partialWord.length) + word + ' ';
    } else {
      // No partial word (ends with space or punctuation) → append as a NEW
      // word, adding a separating space only if one isn't already present.
      const needsSpace = text.length > 0 && !/\s$/.test(text);
      n = text + (needsSpace ? ' ' : '') + word + ' ';
    }
    setText(n); onTextChange?.(n);

    if (isPhrasePrediction) {
      learnSentence?.(normalizedWord);
    } else {
      learnWord?.(word);
    }
    recordPredictionTelemetry(
      isEmptyText ? 'starter' : (isPhrasePrediction ? 'sentence' : 'word'),
      charsSaved,
      { rank, lang: keyboardMode === 'hindi' ? 'hi' : 'en' },
    );
  }, [text, onTextChange, learnSentence, learnWord, recordPredictionTelemetry, keyboardMode]);

  const handleSentenceSelect = useCallback((suggestion: SentenceSuggestion) => {
    const current = textRef.current;
    if (!predictionsAreFresh(predictionMeta, current)) return;
    const nextText = acceptSentenceSuggestion(current, suggestion);
    if (nextText === null) return;
    const trimmed = current.trimEnd();
    textRef.current = nextText;
    setText(nextText);
    onTextChange?.(nextText);
    learnSentence?.(suggestion.text);
    recordPredictionTelemetry(
      trimmed.length === 0 ? 'starter' : 'sentence',
      Math.max(0, nextText.trim().length - trimmed.length),
      { rank: 0, lang: keyboardMode === 'hindi' ? 'hi' : 'en' },
    );
  }, [predictionMeta, onTextChange, learnSentence, recordPredictionTelemetry, keyboardMode]);

  // Word slots: insert the displayed word exactly once, and only while it still
  // completes the draft it was computed for.
  const handleWordSlot = useCallback((index: number, word: string) => {
    const current = textRef.current;
    if (!predictionsAreFresh(predictionMeta, current) || !wordFitsText(current, word)) return;
    const nextText = acceptWordPrediction(current, word);
    const partial = current.match(/[A-Za-z']+$/)?.[0].length ?? 0;
    textRef.current = nextText;
    setText(nextText);
    onTextChange?.(nextText);
    learnWord?.(word, current, nextText);
    recordPredictionTelemetry(
      current.trimEnd().length === 0 ? 'starter' : 'word',
      Math.max(0, word.length - partial),
      { rank: index, lang: keyboardMode === 'hindi' ? 'hi' : 'en' },
    );
  }, [predictionMeta, onTextChange, learnWord, recordPredictionTelemetry, keyboardMode]);


  // QuickWord → sentence map. ONLY give choices when options mean DIFFERENT actions.
  // Single-sentence entries insert directly (no picker shown).
  const QUICKWORD_SENTENCES: Record<string, string[]> = useMemo(() => ({
    // Choices only when actions differ (on/off, warm/cold, left/right, etc.)
    'fan': ['Turn on the fan', 'Turn off the fan'],
    'ac': ['Turn on the AC', 'Turn off the AC'],
    'adjust fan / ac': ['Turn on the fan', 'Turn off the fan', 'Turn on the AC', 'Turn off the AC'],
    'tv': ['Turn on the TV', 'Turn off the TV'],
    'water': ['I want warm water', 'I want cold water'],
    'pain': ['I am in pain', 'Give me pain medicine'],
    'medicine': ['Give me medicine', 'Medicine time now'],
    // Single-sentence entries — direct insert, no picker
    'tt suction': ['TT suction needed now'],
    'oral suction': ['Oral suction needed'],
    'ambu bag': ['Start ambu please'],
    'breathing discomfort': ['I am having trouble breathing'],
    'severe pain': ['I am in severe pain'],
    'help now': ['Help me please come fast'],
    'turn left': ['Turn me to left side'],
    'turn right': ['Turn me to right side'],
    'head up': ['Raise my head please'],
    'head down': ['Lower my head please'],
    'adjust pillows': ['Adjust my pillow please'],
    'adjust neck support': ['Adjust my neck support please'],
    'blanket / shawl': ['Give me blanket please'],
    'fever': ['I am having fever'],
    'check o\u2082': ['Check oxygen level'],
  }), []);

  const handleQuickWordSelect = useCallback((word: { en: string }) => {
    const key = word.en.toLowerCase().trim();
    const sentences = QUICKWORD_SENTENCES[key];
    if (sentences && sentences.length > 1) {
      // Multiple sentences — show choice picker
      setQuickWordChoices(sentences);
    } else if (sentences && sentences.length === 1) {
      // Single sentence — insert directly
      handlePrediction(sentences[0]);
      setQuickWordsOpen(false);
      setQuickWordChoices(null);
    } else {
      // No sentences — insert word as-is (ORIGINAL behavior, proven working)
      handlePrediction(word.en);
      setQuickWordsOpen(false);
      setQuickWordChoices(null);
    }
  }, [QUICKWORD_SENTENCES, handlePrediction]);

  const handleQuickWordChoiceSelect = useCallback((sentence: string) => {
    // Append sentence to existing text (don't erase what was typed before)
    handlePrediction(sentence);
    setQuickWordsOpen(false);
    setQuickWordChoices(null);
  }, [handlePrediction]);


  // Hindi word predictions — active when keyboardMode is 'hindi'
  // Does prefix-match against HINDI_AAC_VOCABULARY, falls back to top daily words
  const hindiPredictions = useMemo((): Array<{ word: string; score: number }> => {
    if (keyboardMode !== 'hindi') return [];

    const lastWord = text.trim().split(/\s+/).pop() ?? '';
    const result: Array<{ word: string; score: number }> = [];
    const seen = new Set<string>();

    // 1. Prefix-match if user has typed something
    if (lastWord.length > 0) {
      HINDI_AAC_VOCABULARY
        .filter(w => w.startsWith(lastWord) && !seen.has(w))
        .forEach(w => {
          if (result.length < 5) { seen.add(w); result.push({ word: w, score: 0.95 }); }
        });
    }

    // 2. Fill with highest-priority daily words
    const DEFAULTS = ['पानी', 'मदद', 'दर्द', 'हाँ', 'नहीं', 'ठीक', 'खाना', 'दवा', 'जल्दी', 'रुको'];
    DEFAULTS.forEach(w => {
      if (result.length < 5 && !seen.has(w)) {
        seen.add(w); result.push({ word: w, score: 0.5 });
      }
    });

    return result;
  }, [keyboardMode, text]);

  // Ten word slots: five in the top strip, five in the lower row, in fixed
  // positions from the backend. Hindi mode (not reachable in this English
  // release) keeps its local list in the same slots.
  const slotWords = keyboardMode === 'hindi' && predictions.length === 0 ? hindiPredictions : predictions;
  const slots = presentWordSlots(keyboardMode === 'hindi' ? null : wordSlots, slotWords, predictionMeta?.text ?? text);
  const slotsSelectable = predictionsAreFresh(predictionMeta, text);
  const phraseSuggestion = useMemo(
    () => (sentencePredictions || []).find(s => isShortSentence(s.text)) ?? null,
    [sentencePredictions]
  );

  return (
    <div data-keyboard-feel={familiarFeel ? 'familiar' : 'standard'} className={`keyboard-screen${navHidden ? ' keyboard-nav-hidden' : ' keyboard-nav-visible'}${isLight ? ' theme-light' : isWarm ? ' theme-warm' : ''}`} style={{
      display: 'flex', flexDirection: 'column',
      height: '100%',
      backgroundColor: keyboardTheme.shellBg,
      // Nav-visible: tighter padding/gap to give nav bar proper breathing room at bottom
      padding: navHidden ? '4px 20px 3px 20px' : '2px 20px 4px 20px',
      gap: navHidden ? '5px' : '4px',
      overflow: 'hidden',
      position: 'relative',
      fontFamily: UI_FONT,
    }}>

      <KeyboardMessageDisplay text={text} expanded={isExpanded}
        onToggleExpanded={() => setIsExpanded(p => !p)} onSpeak={() => handleKey('speak', 'speak')}
        gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
        speakId="display-speak-button" expandId="display-expand-toggle" />

      {/* 2. PREDICTIONS ROW or CLOSE DISPLAY button */}
      {isExpanded ? (
        <GazeButton
          id="close-expanded-display"
          onClick={() => setIsExpanded(false)}
          dwellCategory="navigationButton"
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          style={{
            width: '100%',
            height: 'clamp(132px, 15vh, 176px)',
            background: isDarkMode
              ? 'linear-gradient(180deg, rgba(54, 31, 37, 0.96), rgba(43, 27, 34, 0.96))'
              : 'linear-gradient(180deg, rgba(238, 220, 212, 0.94), rgba(230, 206, 197, 0.94))',
            border: isDarkMode ? '1px solid rgba(198, 121, 112, 0.28)' : '1px solid rgba(151, 86, 78, 0.26)',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: isDarkMode
              ? '0 12px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.035)'
              : '0 8px 20px rgba(139, 91, 82, 0.12)',
          }}
        >
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? '#E7B5AE' : '#8F5149'} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          <span style={{
            fontSize: 'clamp(26px, 3vw, 42px)',
            fontWeight: 820,
            color: isDarkMode ? '#EAD8CA' : '#5D3D39',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Close Display
          </span>
        </GazeButton>
      ) : (
        <div className="keyboard-prediction-bar keyboard-word-row keyboard-word-row-top" aria-label="Word suggestions 1 to 5 and a phrase">
          {slots.slice(0, TOP_WORD_SLOTS).map((word, index) => (
            <WordSlotButton key={`${index}:${word ?? ''}`} index={index} word={word}
              selectable={slotsSelectable} best={index === 0} isDarkMode={isDarkMode}
              gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
              familiarFeel={familiarFeel}
              onSelect={handleWordSlot} />
          ))}
          <PhraseSuggestionButton key={`phrase:${phraseSuggestion?.mode ?? ''}:${phraseSuggestion?.text ?? ''}`}
            suggestion={phraseSuggestion} selectable={slotsSelectable} isDarkMode={isDarkMode}
            gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
            familiarFeel={familiarFeel}
            onSelect={handleSentenceSelect} />
        </div>
      )}

      {/* ===== Full-screen Keyboard (Hidden if expanded) ===== */}
      {!isExpanded && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          gap: 'clamp(1px, 0.18vh, 2px)',
          padding: 'clamp(1px, 0.18vh, 3px) 6px',
          backgroundColor: keyboardTheme.textAreaBg,
          borderRadius: '10px 10px 0 0',
          minHeight: 0,
          overflow: 'hidden',
        }}>
          {(() => {
            const actionRow = QWERTY_ROWS[QWERTY_ROWS.length - 1];
            let activeLayout = QWERTY_ROWS;
            if (keyboardMode === 'hindi') {
              activeLayout = [...HINDI_ROWS, actionRow];
            } else if (keyboardMode === 'numbers') {
              activeLayout = [...SYMBOL_ROWS, actionRow];
            }

            return activeLayout.map((displayRowOriginal, ri) => {
              const isActionRow = ri === activeLayout.length - 1;
              let displayRow = displayRowOriginal;

              // When nav is hidden, dock the Master Gaze Hub into the action row (between SPACE and 123)
              if (navHidden && isActionRow) {
                displayRow = displayRow.map(k =>
                  k.key === 'deleteWord' ? { ...k, flex: 1.78 } :
                    // QUICK WORDS widened (2.05 → 2.45) and SPACE shifted right
                    // (5.3 → 4.9) to give the high-frequency Quick Words target
                    // a more comfortable gaze footprint without shrinking SPACE
                    // below its critical-mass width.
                    k.key === 'speak' ? { ...k, key: 'quickWords', display: 'QUICK WORDS', action: 'quickWords', flex: 2.45 } :
                      k.key === 'space' ? { ...k, flex: 4.9 } : k
                );
                // Add gutter between QUICK WORDS and SPACE to keep command targets visually separated.
                const spaceIdx = displayRow.findIndex(k => k.key === 'space');
                displayRow = [
                  ...displayRow.slice(0, spaceIdx),
                  { key: '__gutter_speak_space__', display: '', flex: 0.18 } as KeyConfig,
                  ...displayRow.slice(spaceIdx),
                ];
                const idx123 = displayRow.findIndex(k => k.key === '123');
                const before = displayRow.slice(0, idx123);
                const after = displayRow.slice(idx123);
                displayRow = [
                  ...before,
                  { key: '__gutter_gaze__', display: '', flex: 0.02 },
                  { key: 'gaze', display: '', action: 'gaze', flex: 3.2 },
                  ...after,
                ] as KeyConfig[];
              } else if (isActionRow) {
                displayRow = displayRow
                  .filter(k => k.action !== 'speak')
                  .map(k =>
                    k.key === 'deleteWord' ? { ...k, flex: 1.75 } :
                      k.key === 'space' ? { ...k, flex: 6.7 } :
                        k.key === '123' ? { ...k, flex: 1.95 } : k
                  );
              }
              return (
                <React.Fragment key={ri}>
                  {/* Safety dead zone between letter rows and action bar when nav hidden */}
                  {navHidden && isActionRow && (
                    <div style={{ height: 'clamp(3px, 0.45vh, 5px)', width: '100%', pointerEvents: 'none', flexShrink: 0 }} />
                  )}
                  <div style={{
                    display: 'flex',
                    gap: isActionRow
                      ? 'clamp(7px, 0.9vw, 12px)'
                      : keyboardMode === 'hindi'
                        ? 'clamp(2px, 0.3vw, 4px)' // Tighter gap for the 5-row Hindi layout
                        : 'clamp(2px, 0.28vw, 4px)',
                    // Strict: action row fixed, letter rows elastic.
                    // Nav-hidden is keyboard-priority, so all alphabet rows share the reclaimed height evenly.
                    flex: isActionRow
                      ? `0 0 ${ACTION_BAR_HEIGHT}`
                      : keyboardMode === 'hindi'
                        ? '1 1 0' // Equal height for all 5 letter rows in Hindi mode
                        : navHidden
                          ? '1 1 0'
                          : '1 1 0',
                    minHeight: 0,
                  }}>
                    {displayRow.map(kc => {
                      if (kc.key.startsWith('__gutter')) {
                        // Dead zone spacer — non-interactive gap to prevent accidental triggers
                        return (
                          <div key={kc.key} style={{ flex: kc.flex || 0.15, pointerEvents: 'none' }} />
                        );
                      }
                      if (kc.key === '123' || kc.key === 'toggleNumbers') {
                        // Number/ABC/Hindi toggle button — cycles through modes
                        let btnText = '123';
                        let nextMode = 'english'; // Default if standard flow

                        // Compute display text based on CURRENT mode
                        if (keyboardMode === 'english') {
                          btnText = '123';
                        } else if (keyboardMode === 'hindi') {
                          btnText = '123';
                        } else {
                          btnText = 'ABC';
                        }

                        const numActive = keyboardMode !== 'english';
                        return (
                          <button
                            key={kc.key + keyboardMode} // Force remount on mode change
                            className="gaze-button keyboard-key"
                            data-gaze="true"
                            onClick={() => handleKey('123', 'toggleNumbers')}
                            style={{
                              position: 'relative', flex: kc.flex || 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              backgroundColor: numActive ? (isDarkMode ? 'rgba(56, 189, 248, 0.10)' : 'rgba(183, 142, 73, 0.10)') : keyboardTheme.keyBg,
                              border: `2px solid ${numActive ? keyboardAccent : keyboardTheme.keyBorder}`,
                              borderRadius: '10px',
                              color: numActive ? keyboardAccent : keyboardTheme.keyTextMuted,
                              fontSize: 'clamp(22px, 2.35vw, 32px)',
                              fontWeight: 700,
                              letterSpacing: '1px',
                              cursor: 'pointer',
                              transition: 'all 150ms ease',
                            }}
                          >
                            {btnText}
                          </button>
                        );
                      }
                      if (kc.key === 'gaze') {
                        // Central Master Gaze Hub — dead zones on sides, selectable rectangle between lines
                        const hubDiam = GAZE_HUB_DIAMETER;
                        const deadZoneL = 'clamp(80px, 10.5vw, 145px)';
                        const deadZoneR = 'clamp(20px, 2.5vw, 38px)';
                        const lineColor = isDarkMode
                          ? (isGazeEnabled ? 'rgba(80, 145, 125, 0.65)' : 'rgba(140,155,170,0.45)')
                          : (isGazeEnabled ? 'rgba(122, 156, 181, 0.58)' : 'rgba(181, 168, 146, 0.7)');
                        return (
                          <div key={kc.key} style={{
                            flex: kc.flex || 1, display: 'flex', alignItems: 'stretch', height: '100%', minWidth: 0,
                          }}>
                            {/* Left dead zone — non-interactive */}
                            <div style={{ width: deadZoneL, flexShrink: 0, pointerEvents: 'none' }} />
                            {/* Left vertical line */}
                            <div style={{
                              width: '2.5px', flexShrink: 0,
                              alignSelf: 'center',
                              height: '70%',
                              backgroundColor: lineColor,
                              borderRadius: '2px',
                              pointerEvents: 'none',
                            }} />
                            {/* Selectable button — the ONLY gaze target */}
                            <button
                              className="gaze-button gaze-toggle keyboard-inline-gaze"
                              aria-label={isGazeEnabled ? 'Pause gaze' : 'Enable gaze'}
                              data-gaze="true"
                              data-gaze-toggle="true"
                              data-gaze-always="true"
                              onClick={toggleGaze}
                              style={{
                                flex: 1,
                                // The circle fits the width the row gives it, so no other key moves (1366x768).
                                minWidth: 0,
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              {/* Visual circle hub — full size where it fits, centered, no margin */}
                              <div className="keyboard-gaze-hub" style={{
                                width: hubDiam,
                                maxWidth: '100%',
                                aspectRatio: '1 / 1',
                                borderRadius: '50%',
                                margin: 0,
                                flexShrink: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '2px',
                                background: isGazeEnabled
                                  ? (isDarkMode
                                    ? 'radial-gradient(circle at 50% 45%, rgba(60, 110, 90, 0.3) 0%, rgba(15,23,42,0.85) 70%)'
                                    : 'radial-gradient(circle at 50% 45%, rgba(250, 247, 242, 0.98) 0%, rgba(237, 230, 218, 0.96) 72%)')
                                  : (isDarkMode
                                    ? 'radial-gradient(circle at 50% 45%, rgba(40, 55, 65, 0.4) 0%, rgba(15,23,42,0.9) 70%)'
                                    : 'radial-gradient(circle at 50% 45%, rgba(253, 252, 250, 0.98) 0%, rgba(245, 241, 234, 0.96) 72%)'),
                                border: `2.5px solid ${isDarkMode
                                  ? (isGazeEnabled ? 'rgba(80, 145, 125, 0.5)' : 'rgba(100,116,139,0.2)')
                                  : (isGazeEnabled ? 'rgba(122, 156, 181, 0.72)' : 'rgba(181, 168, 146, 0.68)')}`,
                                transition: 'all 250ms ease',
                                position: 'relative',
                                overflow: 'hidden',
                                pointerEvents: 'none',
                              }}>
                                {/* Mid-ring */}
                                <div style={{
                                  position: 'absolute',
                                  width: '58%', height: '58%',
                                  borderRadius: '50%',
                                  border: `1.5px solid ${isDarkMode
                                    ? (isGazeEnabled ? 'rgba(80, 145, 125, 0.2)' : 'rgba(100,116,139,0.1)')
                                    : (isGazeEnabled ? 'rgba(122, 156, 181, 0.28)' : 'rgba(181, 168, 146, 0.24)')}`,
                                }} />
                                {/* Center reticle dot */}
                                <div style={{
                                  width: '7px', height: '7px',
                                  borderRadius: '50%',
                                  backgroundColor: isDarkMode
                                    ? (isGazeEnabled ? 'rgba(80, 145, 125, 0.8)' : '#555')
                                    : (isGazeEnabled ? lightColors.warning.main : lightColors.text.tertiary),
                                  transition: 'all 200ms ease',
                                  zIndex: 2,
                                }} />
                                {/* Label */}
                                <span className="keyboard-gaze-label" style={{
                                  fontSize: 'clamp(14px, 1.7vh, 18px)',
                                  fontWeight: 700,
                                  letterSpacing: '1.5px',
                                  color: isDarkMode
                                    ? (isGazeEnabled ? 'rgba(100, 165, 140, 0.7)' : 'rgba(150,150,150,0.45)')
                                    : (isGazeEnabled ? lightColors.text.secondary : lightColors.text.tertiary),
                                  textTransform: 'uppercase',
                                  zIndex: 2,
                                  marginTop: '1px',
                                }}>
                                  {isGazeEnabled ? 'ACTIVE' : 'GAZE'}
                                </span>
                              </div>
                            </button>
                            {/* Right vertical line */}
                            <div style={{
                              width: '2.5px', flexShrink: 0,
                              alignSelf: 'center',
                              height: '70%',
                              backgroundColor: lineColor,
                              borderRadius: '2px',
                              pointerEvents: 'none',
                            }} />
                            {/* Right dead zone — non-interactive */}
                            <div style={{ width: deadZoneR, flexShrink: 0, pointerEvents: 'none' }} />
                          </div>
                        );
                      }
                      return (
                        <KeyBtn key={kc.key} config={kc} onPress={handleKey}
                          isShift={isShift} isDarkMode={isDarkMode}
                          dwellMs={kc.action === 'deleteWord'
                            ? DWELL_GROUPS.deliberate.ms
                            : kc.action === 'speak' ? DWELL_GROUPS.communication.ms
                              : kc.action === 'quickWords' ? DWELL_GROUPS.navigation.ms : DWELL_GROUPS.typing.ms}
                          gazeEnabled={isGazeEnabled}
                          lastEnabledTs={lastEnabledTimestamp}
                          hasRealGaze={hasRealGaze} familiarFeel={familiarFeel} />
                      );
                    })}
                  </div>
                </React.Fragment>
              );
            })
          })()}
          {/* ===== Word slots 6-10 (always visible) + SHOW NAV when navigation is hidden ===== */}
          <div className={`keyboard-prediction-bar keyboard-word-row keyboard-word-row-bottom${navHidden ? ' with-show-nav' : ''}`}
            aria-label="Word suggestions 6 to 10">
            {slots.slice(TOP_WORD_SLOTS, WORD_SLOT_COUNT).map((word, offset) => {
              const index = TOP_WORD_SLOTS + offset;
              return (
                <WordSlotButton key={`${index}:${word ?? ''}`} index={index} word={word}
                  selectable={slotsSelectable} best={false} isDarkMode={isDarkMode}
                  gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
                  familiarFeel={familiarFeel}
                  onSelect={handleWordSlot} />
              );
            })}
            {navHidden && (isFocusLocked ? (
              <div style={{ backgroundColor: secondarySuggestionBg, borderRadius: '10px', width: '100%', height: '100%' }} />
            ) : (
              <GazeButton id="nav-restore-btn" gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                onClick={() => { setNavHidden(false); setWordLengthHint(null); }}
                dwellCategory="navigationButton"
                style={{
                  width: '100%', height: '100%',
                  backgroundColor: showNavSuggestionBg,
                  border: 'none', borderRadius: '10px',
                  color: showNavSuggestionText, fontSize: 'clamp(15px, 1.6vw, 20px)',
                  fontWeight: 820, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '8px', cursor: 'pointer',
                  padding: '0 clamp(12px, 1.2vw, 18px)',
                  transition: 'all 150ms ease',
                  letterSpacing: '1.1px',
                  textTransform: 'uppercase',
                }}>
                <span style={{ fontSize: 'inherit' }}>SHOW NAV</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" /><polyline points="5 12 12 5 19 12" />
                </svg>
              </GazeButton>
            ))}
          </div>
        </div>
      )}

      {/* Gaze Hub animations */}
      <style>{`
        .gaze-hub-breathing {
          animation: gaze-breathe 2.8s ease-in-out infinite;
        }
        @keyframes gaze-breathe {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        .gaze-radar-sweep {
          animation: gaze-radar-sweep-spin 3.5s linear infinite;
        }
        @keyframes gaze-radar-sweep-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* ===== Navigation Bar (hidden when navHidden is true) ===== */}
      {
        !navHidden && (
          <div className="keyboard-navigation" style={{ marginTop: 'clamp(6px, 0.8vh, 10px)', paddingBottom: '6px', flexShrink: 0 }}>
            <GlobalNavBar
              currentPage="keyboard"
              onNavigate={onNavigate}

              isDarkMode={isDarkMode}
              showZoneBoardButton
              showMoreToggle
              moreActive={navHidden}
              onMoreToggle={() => {
                setNavHidden(true);
                setWordLengthHint(null);
              }}
              onQuickWords={() => onNavigate('quickwords')}
            />
          </div>
        )
      }

      {/* Quick Words Overlay */}
      <QuickWordsOverlay
        isOpen={quickWordsOpen}
        onClose={() => setQuickWordsOpen(false)}
        categories={quickWords?.categories ?? []}
        coreWords={quickWords?.coreWords}
        onWordSelect={(word) => {
          const key = word.en.toLowerCase().trim();
          const sentences = QUICKWORD_SENTENCES[key];
          if (sentences && sentences.length > 1) {
            // Show sentence choices — overlay closes, picker renders on top
            setQuickWordChoices(sentences);
            return;
          }
          // Single sentence or no match — insert and close
          const textToInsert = (sentences && sentences.length === 1) ? sentences[0] : word.en;
          handlePrediction(textToInsert);
        }}
        isDarkMode={isDarkMode}
        gazeEnabled={isGazeEnabled}
        gazeEnabledTimestamp={lastEnabledTimestamp}
        showHindi={showHindi}
      />

      {/* Sentence choice picker — shows when QuickWord has multiple sentence options */}
      {quickWordChoices && quickWordChoices.length > 0 && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 35,
          backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.90)' : 'rgba(245, 241, 234, 0.92)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 'clamp(20px, 3vh, 36px)', padding: 'clamp(20px, 4vh, 48px)',
        }}>
          <div style={{
            color: keyboardTheme.keyTextMuted, fontSize: 'clamp(18px, 2.1vw, 24px)',
            fontWeight: 600, textAlign: 'center',
            fontFamily: UI_FONT,
          }}>
            Select:
          </div>
          {quickWordChoices.map((sentence, i) => (
            <GazeButton
              key={`qwc-${i}`}
              id={`quickword-choice-${i}`}
              gazeEnabled={isGazeEnabled}
              gazeEnabledTimestamp={lastEnabledTimestamp}
              onClick={() => handleQuickWordChoiceSelect(sentence)}
              dwellCategory="predictionButton"
              style={{
                width: '85%', maxWidth: '800px',
                minHeight: 'clamp(80px, 10vh, 120px)',
                padding: 'clamp(16px, 2.5vh, 28px) clamp(24px, 3vw, 40px)',
                borderRadius: '16px',
                backgroundColor: keyboardTheme.predictionBg,
                border: `2px solid ${isDarkMode ? `${screenThemes.keyboard.deleteWordColor}55` : lightColors.border.main}`,
                color: isDarkMode ? '#EAC688' : lightColors.text.primary,
                fontSize: 'clamp(34px, 3.7vw, 52px)',
                fontWeight: 600, textAlign: 'center',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: UI_FONT,
              }}
            >
              {sentence}
            </GazeButton>
          ))}
          <GazeButton
            id="quickword-choice-cancel"
            gazeEnabled={isGazeEnabled}
            gazeEnabledTimestamp={lastEnabledTimestamp}
            onClick={() => setQuickWordChoices(null)}
            dwellCategory="navigationButton"
            style={{
              marginTop: 'clamp(8px, 1.5vh, 16px)',
              padding: 'clamp(14px, 2vh, 22px) clamp(32px, 4vw, 48px)',
              borderRadius: '12px', minHeight: '60px',
              backgroundColor: keyboardTheme.keyBg,
              border: `1px solid ${keyboardTheme.keyBorder}`,
              color: keyboardTheme.keyTextMuted,
              fontSize: 'clamp(24px, 2.6vw, 34px)',
              fontWeight: 600, cursor: 'pointer',
              fontFamily: UI_FONT,
            }}
          >
            Back
          </GazeButton>
        </div>
      )}

    </div >
  );
};

export default React.memo(KeyboardScreen);
