/**
 * GazeConnect Pro - Professional Keyboard v5.0
 * =============================================
 * Optimized layout: compact predictions, maximum keyboard space.
 * Responsive: works 14" laptop to 26" desktop.
 * Inline gaze toggle - nothing hidden at bottom.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import GazeButton from '../components/core/GazeButton';
import { darkColors, lightColors, dwellTiming, screenThemes, typography } from '../utils/design';
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
const UI_FONT = typography.fontFamily.primary;
const LIGHT_KEYBOARD_THEME = {
  shellBg: '#ECE5D9',
  textAreaBg: '#FBF7F1',
  railBg: '#F7F2EA',
  railBorder: '#CBBCA6',
  keyBg: '#F7F2EA',
  keyHoverBg: '#EFE7DA',
  keyBorder: '#DED2BF',
  keyText: '#2B2622',
  keyTextMuted: '#847565',
  deleteWordBg: '#E4C0B5',
  deleteWordColor: '#9E4A3D',
  speakBg: 'rgba(110, 140, 92, 0.12)',
  speakBorder: '#6E8C5C',
  speakText: '#5E7851',
  deleteWordSoftBg: 'rgba(179, 90, 75, 0.12)',
  deleteWordSoftBorder: '#B35A4B',
  deleteWordSoftText: '#9E4A3D',
  predictionBg: '#F7F2EA',
  predictionHoverBg: '#EFE7DA',
};

const getKeyboardTheme = (isDarkMode: boolean) => (
  isDarkMode ? screenThemes.keyboard : LIGHT_KEYBOARD_THEME
);

const getKeyboardAccent = (isDarkMode: boolean) => (
  isDarkMode ? darkColors.accent.main : lightColors.warning.main
);

const TOP_PREDICTION_COUNT = 4;
const DELETE_WORD_DWELL_MS = Math.min(
  dwellTiming.max,
  Math.round(dwellTiming.contexts.keyboard * 1.55)
);

const getKeyboardHierarchyColors = (isDarkMode: boolean) => ({
  predictionBestBg: isDarkMode ? '#192230' : '#FBF7F1',
  predictionText: isDarkMode ? 'rgba(237, 221, 195, 0.92)' : '#5B4C3B',
  predictionBestText: isDarkMode ? '#F4E2C2' : '#3E342A',
  secondarySuggestionBg: isDarkMode ? '#151F24' : '#F1E9DE',
  secondarySuggestionText: isDarkMode ? 'rgba(241, 234, 220, 0.90)' : '#5F5548',
  sentenceSuggestionBg: isDarkMode ? '#1E2C34' : '#E5ECEB',
  sentenceSuggestionText: isDarkMode ? '#F1E5CF' : '#3F4D4E',
  showNavSuggestionBg: isDarkMode ? '#223330' : '#E7E4D8',
  showNavSuggestionText: isDarkMode ? '#D9D0BA' : '#4E5C4E',
});

interface KeyboardScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  onTextChange?: (text: string) => void;
  onNavHiddenChange?: (hidden: boolean) => void;
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

const FilledSpeakerIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 48,
  color = 'currentColor',
}) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path
      d="M8 19.5c0-1.7 1.35-3.1 3.05-3.1h7.05L29.4 8.6c1.65-1.15 3.9.05 3.9 2.05v26.7c0 2-2.25 3.2-3.9 2.05l-11.3-7.8h-7.05A3.08 3.08 0 0 1 8 28.5v-9Z"
      fill={color}
    />
    <path
      d="M37.6 17.2c2 2 3.15 4.82 3.15 7.8s-1.15 5.8-3.15 7.8"
      stroke={color}
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    <path
      d="M35.35 21.05c.94.98 1.45 2.4 1.45 3.95s-.51 2.97-1.45 3.95"
      stroke={color}
      strokeWidth="3.2"
      strokeLinecap="round"
    />
  </svg>
);


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
  const keyboardTheme = getKeyboardTheme(isDarkMode);
  const keyboardAccent = getKeyboardAccent(isDarkMode);

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
  const isQuickWords = config.action === 'quickWords';
  const isSpecialAction = isSpeak || isDeleteWord || isBackspace || isShiftKey || isQuickWords;

  let bg = keyboardTheme.keyBg;
  let border = keyboardTheme.keyBorder;
  let textColor = keyboardTheme.keyText;
  let dwellColor = keyboardAccent;
  const actionTextColor = isDarkMode ? '#F5EFE6' : '#FFFDF8';
  const mutedMaroonActionBg = isDarkMode ? 'rgba(57, 35, 36, 0.96)' : 'rgba(116, 62, 61, 0.86)';
  const mutedMaroonDwell = isDarkMode ? '#D2A09A' : '#F4D5CA';

  if (isSpeak) {
    bg = keyboardTheme.speakBg; border = 'transparent'; textColor = actionTextColor;
    dwellColor = keyboardTheme.speakBorder;
  } else if (isQuickWords) {
    bg = isDarkMode ? 'rgba(30, 48, 60, 0.96)' : 'rgba(83, 119, 126, 0.20)';
    border = 'transparent';
    textColor = actionTextColor;
    dwellColor = isDarkMode ? '#88B7BE' : '#53777E';
  } else if (isDeleteWord) {
    bg = mutedMaroonActionBg; border = 'transparent'; textColor = actionTextColor;
    dwellColor = mutedMaroonDwell;
  } else if (isBackspace) {
    bg = mutedMaroonActionBg; border = 'transparent'; textColor = actionTextColor;
    dwellColor = mutedMaroonDwell;
  } else if (isShiftKey) {
    bg = isDarkMode ? 'rgba(28, 48, 54, 0.96)' : 'rgba(72, 103, 110, 0.18)';
    border = 'transparent';
    textColor = actionTextColor;
    dwellColor = isDarkMode ? '#8FB7B2' : '#48676E';
  }
  if (hovered && !isAction) {
    bg = keyboardTheme.keyHoverBg;
    border = keyboardAccent;
  }
  const visibleBorder = isSpecialAction ? 'transparent' : border;

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
      data-gaze-context="keyboard"
      onMouseEnter={handleEnter} onMouseLeave={handleLeave}
      onClick={() => onPress(config.key, config.action)}
      style={{
        position: 'relative', flex: config.flex || 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: flash ? `${dwellColor}30` : bg,
        border: `2px solid ${visibleBorder}`, borderRadius: '10px',
        outline: 'none',
        color: textColor,
        fontSize: isAction ? 'clamp(19px, 1.9vw, 26px)' : 'clamp(32px, 3.25vw, 48px)',
        fontWeight: isAction ? 760 : 720,
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
      <span style={{
        position: 'relative',
        zIndex: 3,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isQuickWords ? 'clamp(8px, 0.7vw, 12px)' : 0,
        whiteSpace: 'nowrap',
      }}>
        {isQuickWords && <QuickWordsButtonIcon size={28} />}
        <span>{display}</span>
      </span>
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
}> = ({ predictions, onSelect, isDarkMode: _isDarkMode, gazeEnabled, lastEnabledTs, hasRealGaze, compact = false, isHindiMode = false }) => {
  const keyboardTheme = getKeyboardTheme(_isDarkMode);
  const keyboardAccent = getKeyboardAccent(_isDarkMode);
  const {
    predictionBestBg,
    predictionText,
    predictionBestText,
  } = getKeyboardHierarchyColors(_isDarkMode);
  const predictionCount = TOP_PREDICTION_COUNT;
  const predHintText = isHindiMode
    ? 'टाइप करें — शब्द सुझाव यहाँ दिखेंगे...'
    : 'Start typing for predictions...';

  const predWordSize = isHindiMode
    ? (compact ? 'clamp(34px, 3.5vw, 46px)' : 'clamp(36px, 3.75vw, 50px)')
    : (compact ? 'clamp(38px, 3.9vw, 50px)' : 'clamp(42px, 4.4vw, 58px)');

  const predWordFont = isHindiMode ? "'Noto Sans Devanagari', sans-serif" : UI_FONT;
  const predWordColor = isHindiMode
    ? (_isDarkMode ? '#EAC688' : lightColors.text.primary)
    : predictionText;
  const predDwellBar = isHindiMode ? (_isDarkMode ? '#D7A152' : lightColors.warning.main) : keyboardAccent;

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
        gridTemplateColumns: `repeat(${predictionCount}, 1fr)`,
        gap: '4px',
        backgroundColor: 'transparent',
        // compact=true → nav VISIBLE (smaller, saves space for nav bar)
        // compact=false → nav HIDDEN (larger, uses full available height)
        height: compact ? 'clamp(104px, 11.5vh, 126px)' : 'clamp(112px, 12.5vh, 138px)',
        minHeight: compact ? 'clamp(104px, 11.5vh, 126px)' : 'clamp(112px, 12.5vh, 138px)',
        padding: 0,
        borderRadius: '14px',
        border: 'none',
        overflow: 'hidden',
        boxShadow: _isDarkMode ? '0 6px 16px rgba(0,0,0,0.16)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)',
        flexShrink: 0,
      }}
    >
      {predictions.length === 0 ? (
        <div style={{
          gridColumn: '1 / -1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: keyboardTheme.predictionBg,
          color: isHindiMode ? (_isDarkMode ? 'rgba(234, 198, 136, 0.58)' : lightColors.text.tertiary) : keyboardTheme.keyTextMuted,
          fontSize: isHindiMode ? 'clamp(24px, 2.6vw, 32px)' : 'clamp(28px, 2.95vw, 38px)',
          fontFamily: predWordFont,
          lineHeight: isHindiMode ? 1.6 : 1.4,
          fontWeight: 500,
          fontStyle: 'italic',
        }}>
          {predHintText}
        </div>
      ) : (
        [...predictions.slice(0, predictionCount), ...Array(Math.max(0, predictionCount - predictions.length)).fill(null)].slice(0, predictionCount).map((p, i) => {
          if (!p) {
            return (
              <div
                key={`empty-${i}`}
                style={{
                  backgroundColor: keyboardTheme.predictionBg,
                  boxSizing: 'border-box',
                  width: '100%',
                  height: '100%',
                }}
              />
            );
          }
          const isBestPrediction = i === 0;
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
                backgroundColor: hIdx === i
                  ? keyboardTheme.predictionHoverBg
                  : isBestPrediction
                    ? predictionBestBg
                    : keyboardTheme.predictionBg,
                border: 'none',
                boxShadow: 'none',
                boxSizing: 'border-box',
                margin: 0,
                color: isBestPrediction ? predictionBestText : predWordColor,
                fontSize: predWordSize,
                fontFamily: predWordFont,
                fontWeight: isBestPrediction ? 780 : 700,
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
  sentencePredictions = [], onNavHiddenChange,
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
  // Nav-hidden mode should be keyboard-first: slimmer support rails, taller alphabet rows.
  const DISPLAY_BOX_HEIGHT = 'clamp(112px, 12.8vh, 138px)';
  const PREDICTION_ROW_HEIGHT = navHidden ? '108px' : '82px';
  const ACTION_BAR_HEIGHT = navHidden ? '124px' : '132px';
  const GAZE_HUB_DIAMETER = navHidden ? '107px' : '97px';
  const SHOW_NAV_COLUMN = 'minmax(170px, 0.78fr)';

  useEffect(() => {
    if (displayRef.current) {
      displayRef.current.scrollTop = displayRef.current.scrollHeight;
    }
  }, [text]);

  useEffect(() => {
    onNavHiddenChange?.(navHidden);
    return () => {
      onNavHiddenChange?.(false);
    };
  }, [navHidden, onNavHiddenChange]);

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
  }, [text, isShift, onSpeak, onTextChange, expandAbbreviation, learnSentence, inlineCompletion, recordPredictionTelemetry, showHindi, onNavigate]);

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

  // Extra smart predictions (shown in bottom row when nav hidden) — next 4 after the top row
  const extraPredictions = useMemo(() => {
    if (!navHidden) return [];
    const mainWords = new Set((predictions || []).slice(0, TOP_PREDICTION_COUNT).map(p => p.word));
    const extra: Array<{ word: string; score: number }> = [];
    // Take the next ranked predictions after the visible top row.
    (predictions || []).slice(TOP_PREDICTION_COUNT).forEach(p => {
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
      backgroundColor: keyboardTheme.shellBg,
      // Nav-visible: tighter padding/gap to give nav bar proper breathing room at bottom
      padding: navHidden ? '4px 20px 3px 20px' : '2px 20px 4px 20px',
      gap: navHidden ? '5px' : '4px',
      overflow: 'hidden',
      position: 'relative',
      fontFamily: UI_FONT,
    }}>

      {/* 1. TEXT DISPLAY ROW (Integrated Reading Portal) */}
      <div className="keyboard-text-area" style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        // Use flex-grow to fill space when expanded, ensuring NavBar stays visible
        flex: isExpanded ? 1 : 0,
        // Tightly fits two readable text lines without showing a clipped third line.
        height: isExpanded ? 'auto' : DISPLAY_BOX_HEIGHT,
        minHeight: isExpanded ? 0 : DISPLAY_BOX_HEIGHT,
        backgroundColor: keyboardTheme.textAreaBg,
        borderRadius: '14px',
        border: `2px solid ${keyboardTheme.keyBorder}`,
        overflow: 'hidden',
        transition: 'all 300ms ease',
        flexShrink: 0,
      }}>
        {/* Left Column: Text Display */}
        <div
          ref={displayRef}
          style={{
            flex: 1,
            padding: '0 26px',
            overflowY: 'auto', // Scrollable so all lines accessible, container clips to 2 visible
            display: 'flex',
            alignItems: 'flex-start',
            scrollBehavior: 'smooth',
          }}
        >
          <span style={{
            color: keyboardTheme.keyText,
            fontSize: 'clamp(45px, 5.25vh, 62px)',
            fontWeight: 700,
            lineHeight: '1.18',
            textAlign: 'left',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            width: '100%',
            fontFamily: UI_FONT,
          }}>
            {text}
            {/* Ghost text — inline sentence completion (Gboard Smart Compose style).
                Shows the neural/template sentence continuation as greyed-out text
                after the cursor. User can accept by pressing Space or ignore it. */}
            {inlineCompletion && (
              <span style={{ color: 'rgba(168, 181, 196, 0.42)', fontWeight: 400 }}>
                {inlineCompletion.continuation}
              </span>
            )}
            <span style={{
              display: 'inline-block', width: '4px', height: '1em',
              backgroundColor: keyboardAccent, marginLeft: '6px',
              animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom'
            }} />
          </span>
        </div>

        <GazeButton
          id="display-speak-button"
          ariaLabel="Speak"
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          onClick={() => handleKey('speak', 'speak')}
          dwellCategory="keyboardKey"
          style={{
            width: 'clamp(166px, 9.4vw, 214px)',
            height: '100%',
            borderLeft: `2px solid ${keyboardTheme.keyBorder}`,
            backgroundColor: keyboardTheme.speakBg,
            borderRadius: '0',
            color: isDarkMode ? '#F5EFE6' : '#FFFDF8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <FilledSpeakerIcon size={52} />
        </GazeButton>

        {/* Right Column: Integrated Expand Trigger */}
        <GazeButton
          id="display-expand-toggle"
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          onClick={() => setIsExpanded(p => !p)}
          dwellCategory="standardButton"
          style={{
            width: 'clamp(138px, 7.9vw, 166px)',
            height: '100%', // Match container height always
            borderLeft: `2px solid ${keyboardTheme.keyBorder}`, // 1px separator (using 2px for visibility on dark)
            backgroundColor: isDarkMode ? 'rgba(17, 26, 36, 0.72)' : 'rgba(244, 239, 231, 0.84)',
            borderRadius: '0', // No internal radius
            color: keyboardTheme.keyTextMuted,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <div style={{
            transition: 'transform 300ms ease',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 'clamp(74px, 4.8vw, 86px)',
            height: 'clamp(74px, 4.8vw, 86px)',
            backgroundColor: isDarkMode ? 'rgba(23, 35, 48, 0.92)' : keyboardTheme.keyBg,
            border: `1px solid ${isDarkMode ? 'rgba(111, 128, 149, 0.32)' : keyboardTheme.keyBorder}`,
            borderRadius: '50%',
            boxShadow: isDarkMode ? '0 8px 20px rgba(0,0,0,0.22)' : '0 4px 14px rgba(139, 121, 104, 0.12)',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
          gap: 'clamp(1px, 0.18vh, 2px)',
          padding: 'clamp(1px, 0.18vh, 3px) 6px',
          backgroundColor: keyboardTheme.textAreaBg,
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
                  k.key === 'deleteWord' ? { ...k, flex: 1.78 } :
                    k.key === 'speak' ? { ...k, key: 'quickWords', display: 'QUICK WORDS', action: 'quickWords', flex: 2.05 } :
                      k.key === 'space' ? { ...k, flex: 5.3 } : k
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
                          : (ri === activeLayout.length - 2 ? '0.64 1 0' : '0.70 1 0'),
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
                                <span style={{
                                  fontSize: 'clamp(8px, 1vh, 11px)',
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
                            ? DELETE_WORD_DWELL_MS
                            : dwellTiming.contexts.keyboard}
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
          {navHidden && <div style={{ height: '1px', flexShrink: 0, pointerEvents: 'none' }} />}
          {/* ===== Extra Smart Predictions / Sentence Predictions Row + SHOW NAV ===== */}
          {/* Shows sentence predictions or extra word predictions when nav is hidden */}
          {navHidden && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: sentencePredictions.length > 0
                ? `repeat(${Math.min(sentencePredictions.length, 2)}, 1fr) ${SHOW_NAV_COLUMN}`
                : `repeat(4, 1fr) ${SHOW_NAV_COLUMN}`,
              gap: '4px',
              backgroundColor: 'transparent',
              height: keyboardMode === 'hindi' ? '84px' : PREDICTION_ROW_HEIGHT,
              minHeight: keyboardMode === 'hindi' ? '84px' : PREDICTION_ROW_HEIGHT,
              flexShrink: 0,
              padding: 0,
              borderRadius: '0 0 14px 14px',
              border: 'none',
              borderTop: 'none',
              overflow: 'hidden',
              boxShadow: isDarkMode ? '0 5px 14px rgba(0,0,0,0.14)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)',
              margin: '0 -2px',
            }}>
              {sentencePredictions.length > 0 ? (
                <>
                  {/* Sentence predictions — max 2 shown */}
                  {sentencePredictions.slice(0, 2).map((sp, i) => {
                    return (
                      <GazeButton
                        key={`sent-${i}-${sp.text.slice(0,10)}`}
                        id={`sentence-pred-${i}`}
                        gazeEnabled={isGazeEnabled}
                        gazeEnabledTimestamp={lastEnabledTimestamp}
                        onClick={() => handleSentenceSelect(sp.text)}
                        dwellCategory="keyboardKey"
                        style={{
                          width: '100%', height: '100%',
                          minWidth: 0,
                          backgroundColor: sentenceSuggestionBg,
                          border: 'none',
                          borderRadius: '10px',
                          boxSizing: 'border-box',
                          color: sentenceSuggestionText,
                          fontSize: 'clamp(24px, 2.35vw, 34px)',
                          fontWeight: 720,
                          lineHeight: 1.08,
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: '0 clamp(14px, 1.4vw, 24px)',
                          textAlign: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        <span style={{
                          minWidth: 0,
                          maxWidth: '100%',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 2,
                          whiteSpace: 'normal',
                          overflowWrap: 'normal',
                        }}>
                          {sp.text}
                        </span>
                      </GazeButton>
                    );
                  })}
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
                        backgroundColor: showNavSuggestionBg,
                        border: 'none', borderRadius: '10px',
                        color: showNavSuggestionText,
                        fontSize: 'clamp(15px, 1.6vw, 20px)',
                        fontWeight: 820,
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: '8px',
                        padding: '0 clamp(12px, 1.2vw, 18px)',
                        cursor: 'pointer',
                        letterSpacing: '1.1px',
                        textTransform: 'uppercase',
                      }}
                    >
                      <span style={{ fontSize: 'inherit' }}>SHOW NAV</span>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5" /><polyline points="5 12 12 5 19 12" />
                      </svg>
                    </GazeButton>
                  )}
                </>
              ) : (
                /* Fallback: show extra word predictions (existing behavior) */
                <>
                  {[...extraPredictions.slice(0, 4), ...Array(Math.max(0, 4 - extraPredictions.length)).fill(null)].slice(0, 4).map((p, i) => {
                    if (!p) return (
                      <div
                        key={`extra-empty-${i}`}
                        style={{
                          backgroundColor: secondarySuggestionBg,
                          boxSizing: 'border-box',
                          width: '100%',
                          height: '100%',
                        }}
                      />
                    );
                    return (
                      <GazeButton key={`extra-${p.word}-${i}`} id={`extra-pred-${i}`}
                        gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
                        onClick={() => handlePrediction(p.word)} dwellCategory="keyboardKey"
                        style={{
                          width: '100%', height: '100%', backgroundColor: secondarySuggestionBg,
                          border: 'none',
                          borderRadius: '10px',
                          boxSizing: 'border-box',
                          color: secondarySuggestionText,
                          fontSize: 'clamp(32px, 3.25vw, 46px)', fontWeight: 720,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center',
                          transition: 'background-color 150ms',
                        }}>
                        {p.word}
                      </GazeButton>
                    );
                  })}
                  {isFocusLocked ? (
                    <div style={{ backgroundColor: secondarySuggestionBg, borderRadius: '10px', width: '100%', height: '100%' }} />
                  ) : (
                    <GazeButton id="nav-restore-btn" gazeEnabled={isGazeEnabled}
                      gazeEnabledTimestamp={lastEnabledTimestamp}
                      onClick={() => { setNavHidden(false); setWordLengthHint(null); }}
                      dwellTime={800}
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
          <div style={{ marginTop: 'clamp(10px, 1.4vh, 18px)', paddingBottom: 'clamp(6px, 0.8vh, 12px)', flexShrink: 0 }}>
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
              dwellCategory="keyboardKey"
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
            dwellTime={800}
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
