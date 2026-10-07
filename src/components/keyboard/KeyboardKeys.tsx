/**
 * Keyboard keys shared by the full keyboard and the search keyboard: the key
 * renderer with its mouse-preview dwell ring, the QWERTY and symbol layouts and
 * the key colours. Moved verbatim from KeyboardScreen.tsx (6 Oct 2026) so the
 * web browser's search keyboard types on exactly the same keys; the keyboard's
 * DOM, classes, sizes and timings are unchanged.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FAMILIAR_KEYBOARD_TIMING } from '../../config/dwellTimeConfig';
import { darkColors, lightColors, screenThemes } from '../../utils/design';
import { GAZE_ENABLE_COOLDOWN_MS } from '../core/GazeControlToggle';

// Light-mode keyboard palette — research-grounded AAC zoning.
// Citations + rationale: see keyboard section in lightmode.css / warmmode.css.
// Note: most surface values are also overridden by CSS (data-action selectors)
// so JSX inline-styles + CSS converge on the same target.
export const LIGHT_KEYBOARD_THEME = {
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

export const getKeyboardTheme = (isDarkMode: boolean) => (
  isDarkMode ? screenThemes.keyboard : LIGHT_KEYBOARD_THEME
);

export const getKeyboardAccent = (isDarkMode: boolean) => (
  isDarkMode ? screenThemes.cursor.normal : lightColors.warning.main
);

export interface KeyConfig {
  key: string;
  display?: string;
  flex?: number;
  action?: 'letter' | 'space' | 'backspace' | 'enter' |
  'shift' | 'speak' | 'deleteWord' |
  'toggleNumbers' | 'toggleHindiPage' | 'gaze' | 'quickWords';
}

// "Big Key" layout — number row removed, vertical space redistributed to 3 letter rows + command bar
export const QWERTY_ROWS: KeyConfig[][] = [
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
export const SYMBOL_ROWS: KeyConfig[][] = [
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

// OptiKey-inspired FULL 360° Circle Dwell Progress
export const FullCircleDwell: React.FC<{
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

export const QuickWordsButtonIcon: React.FC<{ size?: number; color?: string }> = ({
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
export const KeyBtn: React.FC<{
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
        // Letters fill the key as OptiKey's do (27 Sep 2026): the smaller of a height and a width
        // share, so a capital is about a third of the key on 16:9 and 16:10 screens alike.
        fontSize: isAction ? 'clamp(20px, min(3vh, 1.7vw), 32px)' : 'clamp(34px, min(7.2vh, 4.1vw), 84px)',
        fontWeight: isAction ? 780 : familiarFeel ? 600 : 800,
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
