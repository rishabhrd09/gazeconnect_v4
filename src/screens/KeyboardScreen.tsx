/**
 * GazeConnect Pro - Professional Keyboard v5.0
 * =============================================
 * Optimized layout: compact predictions, maximum keyboard space.
 * Responsive: works 14" laptop to 26" desktop.
 * Inline gaze toggle - nothing hidden at bottom.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import GazeButton from '../components/core/GazeButton';
import { darkColors, lightColors, dwellTiming, screenThemes } from '../utils/design';
import { useGazeControl, GAZE_ENABLE_COOLDOWN_MS } from '../components/core/GazeControlToggle';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useRealGaze } from '../contexts/RealGazeContext';
import { useTheme } from '../contexts/ThemeContext';
import QuickWordsOverlay from '../components/QuickWordsOverlay';
import { useCustomization } from '../contexts/CustomizationContext';
import {
  PredictionTelemetryKind,
  PredictionTelemetrySnapshot,
  applyPredictionTelemetry,
  loadPredictionTelemetry,
  persistPredictionTelemetry,
} from '../utils/predictionTelemetry';

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

// AAC-prioritized vocabulary for fallback predictions
// Words ordered by communication frequency in ALS/AAC contexts
// Used when Python backend predictions don't fill all slots
const AAC_FALLBACK_VOCABULARY: Record<number, string[]> = {
  2: ['no', 'ok', 'hi', 'go', 'up', 'on', 'in', 'do', 'me', 'so', 'am', 'it'],
  3: [
    'yes', 'help', 'eat', 'bed', 'hot', 'fan', 'tea', 'leg', 'arm', 'eye',
    'ear', 'wet', 'dry', 'sit', 'lay', 'try', 'now', 'off', 'out', 'air',
    'ice', 'cup', 'not', 'can', 'all', 'get', 'put', 'see', 'let', 'had',
    'use', 'way', 'day', 'for', 'has', 'you', 'mom', 'dad', 'son', 'car',
    'too', 'who', 'why', 'how', 'new', 'old', 'big', 'own', 'say', 'run',
    'ask', 'few', 'did', 'may', 'but', 'got', 'end', 'age',
  ],
  4: [
    'help', 'pain', 'call', 'need', 'rest', 'wash', 'turn', 'cold', 'warm',
    'stop', 'more', 'food', 'meal', 'milk', 'rice', 'soup', 'move', 'open',
    'shut', 'slow', 'fast', 'home', 'come', 'back', 'want', 'feel', 'sick',
    'good', 'well', 'done', 'wait', 'left', 'bath', 'read', 'talk', 'hear',
    'hand', 'foot', 'head', 'neck', 'skin', 'nose', 'give', 'take', 'time',
    'dark', 'okay', 'soon', 'stay', 'safe', 'soft', 'care', 'love', 'keep',
    'just', 'like', 'know', 'make', 'look', 'long', 'many', 'some', 'been',
    'will', 'each', 'have', 'your', 'into', 'from', 'here', 'them', 'very',
    'when', 'than', 'also', 'much', 'only', 'then', 'they', 'what', 'this',
    'that', 'with', 'work', 'life', 'live', 'find', 'tell', 'last', 'part',
    'most', 'sure', 'real', 'best', 'easy', 'hard', 'goes', 'went', 'over',
    'said', 'does', 'name', 'down', 'year', 'side',
  ],
  5: [
    'water', 'nurse', 'sleep', 'chair', 'tired', 'happy', 'hurts', 'fever',
    'mouth', 'chest', 'elbow', 'ankle', 'blood', 'cough', 'cream', 'clean',
    'towel', 'light', 'music', 'phone', 'hello', 'thank', 'sorry', 'quiet',
    'close', 'drink', 'juice', 'fruit', 'bread', 'sugar', 'spoon', 'plate',
    'sheet', 'right', 'where', 'today', 'night', 'relax', 'later',
    'about', 'after', 'again', 'would', 'could', 'might', 'still', 'never',
    'every', 'other', 'their', 'there', 'being', 'going', 'which', 'think',
    'first', 'start', 'place', 'thing', 'those', 'these', 'great', 'world',
    'since', 'while', 'maybe', 'often', 'shall', 'bring', 'leave', 'point',
    'young', 'small', 'three', 'under', 'along', 'watch', 'house', 'above',
    'early', 'whole', 'began', 'money', 'story', 'power',
  ],
  6: [
    'hungry', 'thirst', 'doctor', 'toilet', 'please', 'family', 'pillow',
    'shower', 'supper', 'change', 'muscle', 'throat', 'oxygen', 'tablet',
    'prayer', 'remote', 'window', 'temple', 'thanks', 'better', 'longer',
    'gentle', 'warmth', 'listen', 'dinner', 'father', 'mother', 'sister',
    'needle', 'breath', 'adjust', 'friend', 'enough',
    'should', 'before', 'always', 'really', 'people', 'around', 'become',
    'during', 'number', 'called', 'though', 'second', 'moment', 'little',
    'almost', 'behind', 'either', 'myself', 'turned', 'rather', 'wanted',
    'seemed', 'follow', 'inside', 'having', 'making', 'within', 'happen',
    'course', 'saying', 'across', 'simple',
  ],
  7: [
    'blanket', 'suction', 'support', 'morning', 'evening', 'therapy',
    'swallow', 'stomach', 'painful', 'comfort', 'bedroom', 'kitchen',
    'husband', 'medical', 'patient', 'careful', 'massage', 'stretch',
    'symptom', 'vitamin', 'machine', 'brother', 'cushion', 'feeling',
    'trouble', 'worried', 'weather', 'outside', 'healthy', 'sitting',
    'because', 'through', 'between', 'another', 'however', 'already',
    'nothing', 'without', 'believe', 'thought', 'working', 'looking',
    'started', 'usually', 'hundred', 'finally', 'problem', 'teacher',
    'company', 'himself', 'herself', 'country', 'history', 'service',
    'someone', 'perhaps', 'program', 'against', 'brought', 'whether',
    'instead', 'mention', 'imagine', 'million', 'special',
  ],
  8: [
    'medicine', 'hospital', 'position', 'exercise', 'bathroom', 'shoulder',
    'daughter', 'continue', 'probably', 'remember', 'together', 'children',
    'suddenly', 'question', 'possible', 'everyone', 'business', 'actually',
    'anything', 'national', 'complete', 'interest', 'required', 'happened',
    'building', 'yourself', 'consider', 'research', 'personal',
  ],
};
const ENGLISH_STARTER_FALLBACK = ['I need', 'Please', 'Can you', 'I am', 'Help'];

interface KeyboardScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  onTextChange?: (text: string) => void;
  initialText?: string;
  isDarkMode?: boolean;
  showHindi?: boolean;
  getPredictions?: (text: string, length_hint?: number, lang?: string) => void;
  predictions?: Array<{ word: string; score: number }>;
  expandAbbreviation?: (abbrev: string) => void;
  abbreviationExpansion?: string | null;
  learnWord?: (word: string) => void;
  learnSentence?: (sentence: string) => void;
  sentencePredictions?: Array<{text: string; score: number; source: string}>;
}

interface KeyConfig {
  key: string;
  display?: string;
  flex?: number;
  action?: 'letter' | 'space' | 'backspace' | 'enter' |
  'shift' | 'speak' | 'deleteWord' |
  'toggleNumbers' | 'toggleHindiPage' | 'gaze';
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
  // Row 3: Shift + Z–M + comma + BACK (single char delete)
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


// Key Button with animation-driven dwell
const KeyBtn: React.FC<{
  config: KeyConfig; onPress: (k: string, a?: string) => void;
  isShift: boolean; isDarkMode: boolean; dwellMs: number;
  gazeEnabled: boolean; lastEnabledTs: number; hasRealGaze: boolean;
}> = ({ config, onPress, isShift, isDarkMode, dwellMs, gazeEnabled, lastEnabledTs, hasRealGaze }) => {
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

  const clearAll = useCallback(() => {
    if (timerRef.current) { cancelAnimationFrame(timerRef.current); timerRef.current = null; }
    if (flashTimerRef.current) { clearTimeout(flashTimerRef.current); flashTimerRef.current = null; }
  }, []);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    const p = Math.min(1, elapsed / dwellMs);
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
  }, [dwellMs, onPress, config.key, config.action]);

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

  let bg = colors.background.tertiary;
  let border = colors.border.main;
  let textColor = colors.text.primary;
  let dwellColor = colors.accent.main;

  if (isSpeak) {
    bg = 'rgba(100, 140, 110, 0.12)'; border = '#8FAF8D'; textColor = '#8FAF8D';
    dwellColor = '#8FAF8D';
  } else if (isDeleteWord) {
    bg = 'rgba(140, 90, 90, 0.12)'; border = '#B08080'; textColor = '#B08080';
    dwellColor = '#B08080';
  } else if (isBackspace) {
    bg = screenThemes.keyboard.deleteWordBg; border = colors.warning.main; textColor = colors.warning.main;
    dwellColor = colors.warning.main;
  } else if (isShiftKey) {
    bg = colors.accent.subtle; border = colors.accent.main; textColor = colors.accent.main;
  }
  if (hovered && !isAction) border = colors.accent.main;

  let display = config.display || config.key;
  // Uppercase by default for faster brain processing; shift toggles to lowercase
  if (!isAction && display.length === 1) display = isShift ? display.toLowerCase() : display.toUpperCase();

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
      ? 'clamp(26px, 3.0vw, 42px)'
      : (isAction ? 'clamp(16px, 1.6vw, 21px)' : 'clamp(26px, 3.0vw, 44px)'),
    letterSpacing: '0.5px',
    // Gold for consonants/vowels; cool blue for combining marks
    color: isMatra ? 'rgba(180, 220, 255, 0.90)' : 'rgba(255, 215, 150, 0.95)',
    lineHeight: 1.4,
  } : {};

  return (
    <button
      ref={btnRef}
      className="gaze-button keyboard-key"
      data-gaze="true"
      data-gaze-context="keyboard"
      onMouseEnter={handleEnter} onMouseLeave={handleLeave}
      onClick={() => onPress(config.key, config.action)}
      style={{
        position: 'relative', flex: config.flex || 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: flash ? `${dwellColor}30` : bg,
        border: `2px solid ${border}`, borderRadius: '10px',
        color: textColor,
        fontSize: isAction ? 'clamp(14px, 1.4vw, 19px)' : 'clamp(22px, 2.4vw, 36px)',
        fontWeight: isAction ? 700 : 600,
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
          showShrink={true}
          completed={completed}
        />
      )}
      <span style={{ position: 'relative', zIndex: 3 }}>{display}</span>
    </button>
  );
};


// Prediction Bar — compact, with LOCKING
const Predictions: React.FC<{
  predictions: Array<{ word: string; score: number; source?: string }>;
  onSelect: (w: string) => void; isDarkMode: boolean;
  gazeEnabled: boolean; lastEnabledTs: number; hasRealGaze: boolean;
  compact?: boolean;
  isHindiMode?: boolean;
}> = ({ predictions, onSelect, isDarkMode, gazeEnabled, lastEnabledTs, hasRealGaze, compact = false, isHindiMode = false }) => {
  const colors = isDarkMode ? darkColors : lightColors;

  const predHintText = isHindiMode
    ? 'टाइप करें — शब्द सुझाव यहाँ दिखेंगे...'
    : 'Start typing for predictions...';

  const predWordSize = isHindiMode
    ? (compact ? 'clamp(21px, 2.3vw, 27px)' : 'clamp(26px, 3.0vw, 36px)')
    : (compact ? 'clamp(24px, 2.6vw, 30px)' : 'clamp(32px, 3.6vw, 42px)');

  const predWordFont = isHindiMode ? "'Noto Sans Devanagari', sans-serif" : 'inherit';
  const predWordColor = isHindiMode ? 'rgba(255, 210, 140, 0.95)' : '#FFFFFF';
  const predBarBorder = isHindiMode ? 'rgba(255, 180, 80, 0.50)' : colors.accent.main;
  const predDwellBar = isHindiMode ? 'rgba(255, 165, 50, 0.85)' : colors.accent.main;

  const [hIdx, setHIdx] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const tRef = useRef<NodeJS.Timeout | null>(null);
  const pRef = useRef<number | null>(null);
  const sRef = useRef(0);

  const clear = () => {
    if (tRef.current) { clearTimeout(tRef.current); tRef.current = null; }
    if (pRef.current) { cancelAnimationFrame(pRef.current); pRef.current = null; }
  };

  const tick = useCallback(() => {
    const p = Math.min(1, (Date.now() - sRef.current) / 500);
    setProgress(p);
    if (p < 1) pRef.current = requestAnimationFrame(tick);
  }, []);

  const enter = (i: number, w: string) => {
    if (hasRealGaze) { setHIdx(i); return; }
    if (!gazeEnabled) return;
    if (isLocked) return;
    if (lastEnabledTs && Date.now() - lastEnabledTs < GAZE_ENABLE_COOLDOWN_MS) return;
    setHIdx(i); sRef.current = Date.now();
    pRef.current = requestAnimationFrame(tick);
    tRef.current = setTimeout(() => {
      onSelect(w);
      setHIdx(null);
      setProgress(0);
      setIsLocked(true);
    }, 500);
  };
  const leaveItem = () => { setHIdx(null); setProgress(0); clear(); };
  const leaveContainer = () => { setHIdx(null); setProgress(0); clear(); setIsLocked(false); };

  return (
    <div
      className="keyboard-prediction-bar"
      onMouseLeave={leaveContainer}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '1px',
        backgroundColor: 'rgba(148, 163, 184, 0.2)',
        // compact=true → nav VISIBLE (smaller, saves space for nav bar)
        // compact=false → nav HIDDEN (larger, uses full available height)
        height: compact ? 'clamp(82px, 9.5vh, 100px)' : 'clamp(108px, 13vh, 132px)',
        minHeight: compact ? 'clamp(82px, 9.5vh, 100px)' : 'clamp(108px, 13vh, 132px)',
        padding: 0,
        borderRadius: '14px',
        border: `2px solid ${predBarBorder}`,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        flexShrink: 0,
      }}
    >
      {predictions.length === 0 ? (
        <div style={{
          gridColumn: '1 / -1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#1E293B',
          color: isHindiMode ? 'rgba(255, 210, 140, 0.45)' : colors.text.tertiary,
          fontSize: isHindiMode ? 'clamp(15px, 1.7vw, 20px)' : 'clamp(18px, 2.2vw, 24px)',
          fontFamily: predWordFont,
          lineHeight: isHindiMode ? 1.6 : 1.4,
          fontWeight: 500,
          fontStyle: 'italic',
        }}>
          {predHintText}
        </div>
      ) : (
        [...predictions.slice(0, 5), ...Array(Math.max(0, 5 - predictions.length)).fill(null)].slice(0, 5).map((p, i) => {
          if (!p) {
            return (
              <div key={`empty-${i}`} style={{ backgroundColor: '#1E293B', width: '100%', height: '100%' }} />
            );
          }
          return (
            <button key={`${p.word}-${i}`}
              className="gaze-button"
              data-gaze="true"
              data-gaze-context="prediction"
              onMouseEnter={() => enter(i, p.word)}
              onMouseLeave={leaveItem}
              onClick={() => onSelect(p.word)}
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                backgroundColor: hIdx === i ? colors.accent.subtle : '#1E293B', // Deep Charcoal
                border: 'none', // No individual borders
                margin: 0,
                color: predWordColor,
                fontSize: predWordSize,
                fontFamily: predWordFont,
                fontWeight: 700,
                lineHeight: isHindiMode ? 1.6 : 1.2,
                cursor: isLocked ? 'default' : 'pointer',
                whiteSpace: 'nowrap', textAlign: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background-color 150ms',
              }}
            >
              {hIdx === i && progress > 0 && (
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, height: 6, // Thicker progress bar
                  width: `${progress * 100}%`, backgroundColor: predDwellBar,
                }} />
              )}
              {/* Neural AI indicator — small dot for neural-fused predictions */}
              {p.source === 'neural_fused' && (
                <div style={{
                  position: 'absolute', top: 5, right: 7,
                  width: 7, height: 7, borderRadius: '50%',
                  backgroundColor: '#a78bfa', // Soft purple dot
                  opacity: 0.8,
                }} title="AI predicted" />
              )}
              {p.word}
            </button>
          );
        })
      )}
    </div>
  );
};


// Main Keyboard Screen
const KeyboardScreen: React.FC<KeyboardScreenProps> = ({
  onNavigate, onSpeak, onTextChange, initialText = '', isDarkMode = true,
  showHindi = false, getPredictions, predictions = [],
  expandAbbreviation, abbreviationExpansion, learnWord, learnSentence,
  sentencePredictions = [],
}) => {
  const [text, setText] = useState(initialText);
  const [isShift, setIsShift] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // New state for expand/collapse
  const [navHidden, setNavHidden] = useState(false);
  const [wordLengthHint, setWordLengthHint] = useState<number | null>(null);
  const [keyboardMode, setKeyboardMode] = useState<'english' | 'hindi' | 'numbers'>('english');
  const [hindiPage, setHindiPage] = useState<1 | 2>(1);
  const [quickWordsOpen, setQuickWordsOpen] = useState(false);
  const [quickWordChoices, setQuickWordChoices] = useState<string[] | null>(null);
  const [, setPredictionTelemetry] = useState<PredictionTelemetrySnapshot>(() => loadPredictionTelemetry());
  const colors = isDarkMode ? darkColors : lightColors;
  const displayRef = useRef<HTMLDivElement>(null);
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze } = useGazeControl();
  const { hasRealGaze } = useRealGaze();
  const { isLight } = useTheme();
  const { data: { quickWords } } = useCustomization();

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
  const PREDICTION_ROW_HEIGHT = navHidden ? '125px' : '82px'; // compact when nav visible
  // v10: Increased action bar height +15% for larger SPACE/SPEAK targets
  const ACTION_BAR_HEIGHT = navHidden ? '135px' : '124px';
  const GAZE_HUB_DIAMETER = navHidden ? '107px' : '97px';

  useEffect(() => {
    if (displayRef.current) {
      displayRef.current.scrollTop = displayRef.current.scrollHeight;
    }
  }, [text]);

  useEffect(() => {
    if (getPredictions) {
      getPredictions(text, undefined, keyboardMode);
    }
  }, [text, getPredictions, keyboardMode]);
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

  const recordPredictionTelemetry = useCallback((kind: PredictionTelemetryKind, charsSaved: number) => {
    setPredictionTelemetry(prev => {
      const next = applyPredictionTelemetry(prev, kind, charsSaved);
      persistPredictionTelemetry(next);
      return next;
    });
  }, []);

  const inlineCompletion = useMemo(() => {
    if (!sentencePredictions || sentencePredictions.length === 0 || text.length < 3) {
      return null;
    }

    const currentText = text.trimEnd();
    if (!currentText) {
      return null;
    }

    const currentTextLower = currentText.toLowerCase();
    const match = sentencePredictions.find(sp =>
      sp.text.toLowerCase().startsWith(currentTextLower) && sp.text.length > currentText.length + 2
    );

    if (!match) {
      return null;
    }

    const continuation = match.text.slice(currentText.length);
    if (!continuation.trim()) {
      return null;
    }

    return {
      fullText: match.text,
      continuation,
    };
  }, [sentencePredictions, text]);

  const starterFallbackPredictions = useMemo(
    () => ENGLISH_STARTER_FALLBACK.map((word, index) => ({
      word,
      score: 0.95 - (index * 0.05),
      source: 'starter',
    })),
    []
  );

  const handleKey = useCallback((key: string, action?: string) => {
    switch (action) {
      case 'space': {
        // Only accept explicitly visible inline completion on Space.
        // Never auto-rewrite a typed word into the top suggestion, because
        // false accepts like "can" → "cancel" are too costly for gaze typing.
        const trimmed = text.trimEnd();

        if (inlineCompletion) {
          const acceptedSentence = inlineCompletion.fullText.trim();
          const charsSaved = acceptedSentence.length - trimmed.length;
          const n = acceptedSentence + ' ';
          setText(n); onTextChange?.(n); learnSentence?.(acceptedSentence);
          recordPredictionTelemetry('ghost', charsSaved);
        } else {
          // Normal space — also check abbreviation
          setText(p => {
            const n = p + ' '; onTextChange?.(n);
            const w = p.trim().split(' '); if (w.length && expandAbbreviation) expandAbbreviation(w[w.length - 1]);
            return n;
          });
        }
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
      case 'deleteWord':
        setText(p => {
          const trimmed = p.trimEnd();
          if (!trimmed) return '';
          const lastSpace = trimmed.lastIndexOf(' ');
          const n = lastSpace === -1 ? '' : trimmed.substring(0, lastSpace + 1);
          onTextChange?.(n);
          return n;
        });
        break;
      case 'toggleNumbers':
        setKeyboardMode(p => {
          if (p === 'english') return showHindi ? 'hindi' : 'numbers';
          if (p === 'hindi') return 'numbers';
          return 'english';
        });
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
          // Smart punctuation: if typing .,?! after an auto-space, remove the trailing space first
          const SMART_PUNCT = new Set(['.', ',', '?', '!', ';', ':']);
          if (SMART_PUNCT.has(key)) {
            setText(p => {
              const base = p.endsWith(' ') ? p.slice(0, -1) : p;
              const n = base + key;
              onTextChange?.(n);
              return n;
            });
          } else {
            setText(p => { const n = p + c; onTextChange?.(n); return n; });
          }
        }
        if (isShift) setIsShift(false); break;
    }
  }, [text, isShift, onSpeak, onTextChange, expandAbbreviation, learnSentence, inlineCompletion, recordPredictionTelemetry, showHindi]);

  const handlePrediction = useCallback((word: string) => {
    const normalizedWord = word.trim();
    const trimmed = text.trimEnd();
    const isEmptyText = trimmed.length === 0;
    const isPhrasePrediction = normalizedWord.includes(' ');
    const lastWord = trimmed.split(/\s+/).pop() || '';
    const charsSaved = isEmptyText
      ? normalizedWord.length
      : text.endsWith(' ')
        ? normalizedWord.length
        : normalizedWord.length - lastWord.length;

    if (text.endsWith(' ') || text === '') {
      const n = text + word + ' ';
      setText(n); onTextChange?.(n);
    } else {
      const words = text.trim().split(' ');
      words[words.length - 1] = word;
      const n = words.join(' ') + ' ';
      setText(n); onTextChange?.(n);
    }

    if (isPhrasePrediction) {
      learnSentence?.(normalizedWord);
    } else {
      learnWord?.(word);
    }
    recordPredictionTelemetry(
      isEmptyText ? 'starter' : (isPhrasePrediction ? 'sentence' : 'word'),
      charsSaved,
    );
  }, [text, onTextChange, learnSentence, learnWord, recordPredictionTelemetry]);

  const handleSentenceSelect = useCallback((sentence: string) => {
    const trimmed = text.trimEnd();
    const shouldCompleteCurrentText = !!trimmed && sentence.toLowerCase().startsWith(trimmed.toLowerCase());
    const separator = trimmed.length > 0 ? ' ' : '';
    const nextText = shouldCompleteCurrentText
      ? sentence.trim() + ' '
      : trimmed + separator + sentence + ' ';

    setText(nextText);
    onTextChange?.(nextText);
    learnSentence?.(sentence);
    recordPredictionTelemetry(
      trimmed.length === 0 ? 'starter' : 'sentence',
      shouldCompleteCurrentText ? sentence.trim().length - trimmed.length : sentence.trim().length,
    );
  }, [text, onTextChange, learnSentence, recordPredictionTelemetry]);

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

  // Extra smart predictions (shown in bottom row when nav hidden) — next 4 after the top 5
  const extraPredictions = useMemo(() => {
    if (!navHidden) return [];
    const mainWords = new Set((predictions || []).slice(0, 5).map(p => p.word));
    const extra: Array<{ word: string; score: number }> = [];
    // Take predictions 6-9 (indices 5-8)
    (predictions || []).slice(5).forEach(p => {
      if (!mainWords.has(p.word) && extra.length < 4) {
        extra.push(p);
      }
    });
    // Fill from common words if not enough predictions
    if (extra.length < 4) {
      const prefix = text.trim().split(' ').pop()?.toLowerCase() || '';
      const allCommon = [
        ...(AAC_FALLBACK_VOCABULARY[2] || []),
        ...(AAC_FALLBACK_VOCABULARY[3] || []),
        ...(AAC_FALLBACK_VOCABULARY[4] || []),
        ...(AAC_FALLBACK_VOCABULARY[5] || []),
        ...(AAC_FALLBACK_VOCABULARY[6] || []),
        ...(AAC_FALLBACK_VOCABULARY[7] || []),
        ...(AAC_FALLBACK_VOCABULARY[8] || []),
      ];
      const seen = new Set([...mainWords, ...extra.map(e => e.word)]);
      if (prefix) {
        allCommon.filter(w => w.startsWith(prefix) && !seen.has(w)).forEach(w => {
          if (extra.length < 4) { seen.add(w); extra.push({ word: w, score: 0.3 }); }
        });
      }
    }
    return extra;
  }, [predictions, text, navHidden]);

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

  return (
    <div className={`keyboard-screen${isLight ? ' theme-light' : ''}`} style={{
      display: 'flex', flexDirection: 'column',
      height: '100%',
      backgroundColor: colors.background.primary,
      // Nav-visible: tighter padding/gap to give nav bar proper breathing room at bottom
      padding: navHidden ? '6px 20px 4px 20px' : '2px 20px 4px 20px',
      gap: navHidden ? '8px' : '4px',
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* 1. TEXT DISPLAY ROW (Integrated Reading Portal) */}
      <div className="keyboard-text-area" style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        // Use flex-grow to fill space when expanded, ensuring NavBar stays visible
        flex: isExpanded ? 1 : 0,
        // Nav-visible: minimum 140px ensures 2 full lines always visible (48px font × 1.3lh × 2 + 12px padding)
        // Nav-hidden: unchanged — 100-130px range (more of the screen available anyway)
        // Nav-hidden: fits 2 lines comfortably
        // Nav-visible: slightly shorter — exactly 2 lines, no 3rd row peeking
        height: isExpanded ? 'auto' : (navHidden ? 'clamp(110px, 12.5vh, 134px)' : 'clamp(118px, 12vh, 130px)'),
        minHeight: isExpanded ? 0 : (navHidden ? 'clamp(110px, 12.5vh, 134px)' : 'clamp(118px, 12vh, 130px)'),
        backgroundColor: colors.background.secondary,
        borderRadius: '14px',
        border: `2px solid ${colors.border.main}`,
        overflow: 'hidden',
        transition: 'all 300ms ease',
        flexShrink: 0,
      }}>
        {/* Left Column: Text Display */}
        <div
          ref={displayRef}
          style={{
            flex: 1,
            padding: '1px 28px', // Near-zero vertical padding so 2 lines fit without clipping
            overflowY: 'auto', // Scrollable so all lines accessible, container clips to 2 visible
            display: 'flex',
            alignItems: 'flex-start',
            scrollBehavior: 'smooth',
          }}
        >
          <span style={{
            color: colors.text.primary,
            fontSize: 'clamp(36px, 4.5vh, 48px)',
            fontWeight: 700,
            lineHeight: '1.22',
            textAlign: 'left',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            width: '100%',
          }}>
            {text}
            {/* Ghost text — inline sentence completion (Gboard Smart Compose style).
                Shows the neural/template sentence continuation as greyed-out text
                after the cursor. User can accept by pressing Space or ignore it. */}
            {inlineCompletion && (
              <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>
                {inlineCompletion.continuation}
              </span>
            )}
            <span style={{
              display: 'inline-block', width: '4px', height: '1em',
              backgroundColor: colors.accent.main, marginLeft: '6px',
              animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom'
            }} />
          </span>
        </div>

        {/* Right Column: Integrated Expand Trigger */}
        <GazeButton
          id="display-expand-toggle"
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          onClick={() => setIsExpanded(p => !p)}
          dwellCategory="standardButton"
          style={{
            width: '110px',
            height: '100%', // Match container height always
            borderLeft: `2px solid ${colors.border.main}`, // 1px separator (using 2px for visibility on dark)
            backgroundColor: 'transparent', // Shared background
            borderRadius: '0', // No internal radius
            color: colors.text.secondary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <div style={{
            transition: 'transform 300ms ease',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '64px', height: '64px',
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: '50%',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </GazeButton>
      </div>

      {/* 2. PREDICTIONS ROW or CLOSE DISPLAY button */}
      {isExpanded ? (
        <GazeButton
          id="close-expanded-display"
          onClick={() => setIsExpanded(false)}
          dwellTime={dwellTiming.contexts.navigation}
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          style={{
            width: '100%',
            height: 'clamp(100px, 12vh, 140px)',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '2px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(239, 68, 68, 0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          <span style={{
            fontSize: 'clamp(20px, 2.5vw, 32px)',
            fontWeight: 700,
            color: 'rgba(239, 68, 68, 0.9)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            Close Display
          </span>
        </GazeButton>
      ) : (
        <>
          <Predictions
            predictions={keyboardMode === 'hindi'
              ? (predictions.length > 0 ? predictions : hindiPredictions)
              : (predictions.length > 0 ? predictions : (text.trim().length === 0 ? starterFallbackPredictions : []))}
            onSelect={handlePrediction}
            isDarkMode={isDarkMode}
            gazeEnabled={isGazeEnabled}
            lastEnabledTs={lastEnabledTimestamp}
            hasRealGaze={hasRealGaze}
            compact={!navHidden}
            isHindiMode={keyboardMode === 'hindi'}
          />
        </>
      )}

      {/* ===== Full-screen Keyboard (Hidden if expanded) ===== */}
      {!isExpanded && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          gap: 'clamp(3px, 0.5vh, 6px)',
          padding: 'clamp(4px, 0.6vh, 8px) 8px',
          backgroundColor: colors.background.secondary,
          borderRadius: navHidden ? '10px 10px 0 0' : '10px',
          minHeight: 0,
          overflow: 'hidden',
          // When nav visible: cap total keyboard height so freed space goes to gap before nav bar
          // v10: Increased from 430-580px to 480-640px (+15%) for larger key targets
          ...(!navHidden ? { maxHeight: 'clamp(480px, 58vh, 640px)' } : {}),
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
                  k.key === 'space' ? { ...k, flex: 6 } :
                    k.key === 'speak' ? { ...k, flex: 1.3 } : k
                );
                // Add gutter between SPEAK and SPACE to shift space rightward
                const spaceIdx = displayRow.findIndex(k => k.key === 'space');
                displayRow = [
                  ...displayRow.slice(0, spaceIdx),
                  { key: '__gutter_speak_space__', display: '', flex: 0.3 } as KeyConfig,
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
              }
              return (
                <React.Fragment key={ri}>
                  {/* Safety dead zone between letter rows and action bar when nav hidden */}
                  {navHidden && isActionRow && (
                    <div style={{ height: 'clamp(14px, 2vh, 22px)', width: '100%', pointerEvents: 'none', flexShrink: 0 }} />
                  )}
                  <div style={{
                    display: 'flex',
                    gap: isActionRow
                      ? 'clamp(8px, 1vw, 14px)'
                      : keyboardMode === 'hindi'
                        ? 'clamp(2px, 0.3vw, 4px)' // Tighter gap for the 5-row Hindi layout
                        : 'clamp(3px, 0.4vw, 5px)',
                    // Strict: action row fixed, letter rows elastic (slightly compressed when nav hidden)
                    // Nav-hidden: rows 0-1 = 0.94, row 2 = 0.85 (proportionally slightly smaller)
                    // Nav-visible: ~88% of nav-hidden values — rows 0-1 = 0.83, row 2 = 0.75
                    flex: isActionRow
                      ? `0 0 ${ACTION_BAR_HEIGHT}`
                      : keyboardMode === 'hindi'
                        ? '1 1 0' // Equal height for all 5 letter rows in Hindi mode
                        : navHidden
                          ? (ri === activeLayout.length - 2 ? '0.85 1 0' : '0.94 1 0')
                          : (ri === activeLayout.length - 2 ? '0.58 1 0' : '0.66 1 0'),
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
                          btnText = showHindi ? 'अAa' : '123';
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
                              backgroundColor: numActive ? 'rgba(45,212,191,0.15)' : 'rgba(30,45,60,0.4)',
                              border: `2px solid ${numActive ? colors.accent.main : colors.border.main}`,
                              borderRadius: '10px',
                              color: numActive ? colors.accent.main : colors.text.secondary,
                              fontSize: 'clamp(16px, 1.8vw, 22px)',
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
                        const lineColor = isGazeEnabled ? 'rgba(80, 145, 125, 0.65)' : 'rgba(140,155,170,0.45)';
                        return (
                          <div key={kc.key} style={{
                            flex: kc.flex || 1, display: 'flex', alignItems: 'stretch', height: '100%',
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
                              className="gaze-button gaze-toggle"
                              data-gaze="true"
                              data-gaze-toggle="true"
                              data-gaze-always="true"
                              onClick={toggleGaze}
                              style={{
                                flex: 1,
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
                              {/* Visual circle hub — fixed size, centered, no margin */}
                              <div style={{
                                width: hubDiam,
                                height: hubDiam,
                                borderRadius: '50%',
                                margin: 0,
                                flexShrink: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '2px',
                                background: isGazeEnabled
                                  ? 'radial-gradient(circle at 50% 45%, rgba(60, 110, 90, 0.3) 0%, rgba(15,23,42,0.85) 70%)'
                                  : 'radial-gradient(circle at 50% 45%, rgba(40, 55, 65, 0.4) 0%, rgba(15,23,42,0.9) 70%)',
                                border: `2.5px solid ${isGazeEnabled ? 'rgba(80, 145, 125, 0.5)' : 'rgba(100,116,139,0.2)'}`,
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
                                  border: `1.5px solid ${isGazeEnabled ? 'rgba(80, 145, 125, 0.2)' : 'rgba(100,116,139,0.1)'}`,
                                }} />
                                {/* Center reticle dot */}
                                <div style={{
                                  width: '7px', height: '7px',
                                  borderRadius: '50%',
                                  backgroundColor: isGazeEnabled ? 'rgba(80, 145, 125, 0.8)' : '#555',
                                  transition: 'all 200ms ease',
                                  zIndex: 2,
                                }} />
                                {/* Label */}
                                <span style={{
                                  fontSize: 'clamp(8px, 1vh, 11px)',
                                  fontWeight: 700,
                                  letterSpacing: '1.5px',
                                  color: isGazeEnabled ? 'rgba(100, 165, 140, 0.7)' : 'rgba(150,150,150,0.45)',
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
                          dwellMs={dwellTiming.contexts.keyboard}
                          gazeEnabled={isGazeEnabled}
                          lastEnabledTs={lastEnabledTimestamp}
                          hasRealGaze={hasRealGaze} />
                      );
                    })}
                  </div>
                </React.Fragment>
              );
            })
          })()}
          {/* Gap between action bar and lower predictions */}
          {navHidden && <div style={{ height: '6px', flexShrink: 0, pointerEvents: 'none' }} />}
          {/* ===== Extra Smart Predictions / Sentence Predictions Row + SHOW NAV ===== */}
          {/* Shows sentence predictions or extra word predictions when nav is hidden */}
          {navHidden && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: sentencePredictions.length > 0
                ? `repeat(${Math.min(sentencePredictions.length, 2)}, 1fr) minmax(180px, auto)`
                : 'repeat(4, 1fr) minmax(180px, auto)',
              gap: '1px',
              backgroundColor: 'rgba(148, 163, 184, 0.2)',
              height: keyboardMode === 'hindi' ? '90px' : PREDICTION_ROW_HEIGHT,
              minHeight: keyboardMode === 'hindi' ? '90px' : PREDICTION_ROW_HEIGHT,
              flexShrink: 0,
              padding: 0,
              borderRadius: '0 0 14px 14px',
              border: sentencePredictions.length > 0
                ? '2px solid rgba(255, 180, 80, 0.50)'
                : `2px solid ${colors.accent.main}`,
              borderTop: '1px solid rgba(148, 163, 184, 0.25)',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              margin: '0 -4px',
            }}>
              {sentencePredictions.length > 0 ? (
                <>
                  {/* Sentence predictions — max 2 shown */}
                  {sentencePredictions.slice(0, 2).map((sp, i) => (
                    <GazeButton
                      key={`sent-${i}-${sp.text.slice(0,10)}`}
                      id={`sentence-pred-${i}`}
                      gazeEnabled={isGazeEnabled}
                      gazeEnabledTimestamp={lastEnabledTimestamp}
                      onClick={() => handleSentenceSelect(sp.text)}
                      dwellCategory="keyboardKey"
                      style={{
                        width: '100%', height: '100%',
                        backgroundColor: '#1E293B',
                        border: 'none', borderRadius: 0,
                        color: 'rgba(255, 210, 140, 0.95)',
                        fontSize: 'clamp(22px, 2.6vw, 30px)',
                        fontWeight: 700,
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: '0 12px',
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {sp.source === 'history' ? '\u23CE ' : sp.source === 'neural' ? '\u2728 ' : '\uD83D\uDCAC '}{sp.text}
                    </GazeButton>
                  ))}
                  {/* SHOW NAV button */}
                  {!isFocusLocked && (
                    <GazeButton
                      id="nav-restore-btn"
                      gazeEnabled={isGazeEnabled}
                      gazeEnabledTimestamp={lastEnabledTimestamp}
                      onClick={() => { setNavHidden(false); setWordLengthHint(null); }}
                      dwellTime={800}
                      style={{
                        width: '100%', height: '100%',
                        backgroundColor: 'rgba(45, 212, 191, 0.08)',
                        border: 'none', borderRadius: 0,
                        color: colors.accent.main,
                        fontSize: 'clamp(14px, 1.7vw, 19px)',
                        fontWeight: 700,
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 'clamp(12px, 1.4vw, 16px)' }}>SHOW NAV</span>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5" /><polyline points="5 12 12 5 19 12" />
                      </svg>
                    </GazeButton>
                  )}
                </>
              ) : (
                /* Fallback: show extra word predictions (existing behavior) */
                <>
                  {[...extraPredictions.slice(0, 4), ...Array(Math.max(0, 4 - extraPredictions.length)).fill(null)].slice(0, 4).map((p, i) => {
                    if (!p) return <div key={`extra-empty-${i}`} style={{ backgroundColor: '#1E293B', width: '100%', height: '100%' }} />;
                    return (
                      <GazeButton key={`extra-${p.word}-${i}`} id={`extra-pred-${i}`}
                        gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
                        onClick={() => handlePrediction(p.word)} dwellCategory="keyboardKey"
                        style={{
                          width: '100%', height: '100%', backgroundColor: '#1E293B',
                          border: 'none', borderRadius: 0, color: '#FFFFFF',
                          fontSize: 'clamp(26px, 3vw, 32px)', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center',
                          transition: 'background-color 150ms',
                        }}>
                        {p.word}
                      </GazeButton>
                    );
                  })}
                  {isFocusLocked ? (
                    <div style={{ backgroundColor: '#1E293B', width: '100%', height: '100%' }} />
                  ) : (
                    <GazeButton id="nav-restore-btn" gazeEnabled={isGazeEnabled}
                      gazeEnabledTimestamp={lastEnabledTimestamp}
                      onClick={() => { setNavHidden(false); setWordLengthHint(null); }}
                      dwellTime={800}
                      style={{
                        width: '100%', height: '100%',
                        backgroundColor: 'rgba(45, 212, 191, 0.08)',
                        border: 'none', borderRadius: 0,
                        color: colors.accent.main, fontSize: 'clamp(14px, 1.7vw, 19px)',
                        fontWeight: 700, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: '4px', cursor: 'pointer',
                        transition: 'all 150ms ease', letterSpacing: '0.5px',
                      }}>
                      <span style={{ fontSize: 'clamp(12px, 1.4vw, 16px)' }}>SHOW NAV</span>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5" /><polyline points="5 12 12 5 19 12" />
                      </svg>
                    </GazeButton>
                  )}
                </>
              )}
            </div>
          )}
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
          <div style={{ marginTop: 'clamp(18px, 2.5vh, 32px)', paddingBottom: 'clamp(8px, 1vh, 14px)', flexShrink: 0 }}>
            <GlobalNavBar
              currentPage="keyboard"
              onNavigate={onNavigate}
              onSpeak={onSpeak}
              isDarkMode={isDarkMode}
              showZoneBoardButton
              showMoreToggle
              moreActive={navHidden}
              onMoreToggle={() => {
                setNavHidden(true);
                setWordLengthHint(null);
              }}
              onQuickWords={() => setQuickWordsOpen(true)}
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
          backgroundColor: 'rgba(0, 0, 0, 0.90)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 'clamp(20px, 3vh, 36px)', padding: 'clamp(20px, 4vh, 48px)',
        }}>
          <div style={{
            color: '#94A3B8', fontSize: 'clamp(16px, 2vw, 22px)',
            fontWeight: 600, textAlign: 'center',
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
              dwellCategory="keyboardKey"
              style={{
                width: '85%', maxWidth: '800px',
                minHeight: 'clamp(80px, 10vh, 120px)',
                padding: 'clamp(16px, 2.5vh, 28px) clamp(24px, 3vw, 40px)',
                borderRadius: '16px',
                backgroundColor: '#1E293B',
                border: '2px solid rgba(255, 180, 80, 0.4)',
                color: 'rgba(255, 210, 140, 0.95)',
                fontSize: 'clamp(22px, 2.8vw, 32px)',
                fontWeight: 600, textAlign: 'center',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            dwellTime={800}
            style={{
              marginTop: 'clamp(8px, 1.5vh, 16px)',
              padding: 'clamp(14px, 2vh, 22px) clamp(32px, 4vw, 48px)',
              borderRadius: '12px', minHeight: '60px',
              backgroundColor: 'rgba(148, 163, 184, 0.15)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              color: '#94A3B8', fontSize: 'clamp(16px, 1.8vw, 22px)',
              fontWeight: 600, cursor: 'pointer',
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
