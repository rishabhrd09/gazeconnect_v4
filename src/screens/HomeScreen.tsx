/**
 * GazeConnect Pro - Home Screen (v9.0 — Text-Only Emergency Dispatch, Card Scale, Clock Fix)
 * Responsive: 13"-27" screens via clamp()/min() - identical on 23" (1920x1080)
 */
import React, { useCallback, useState, useRef, useEffect } from 'react';
import { lightColors, mixColors, screenThemes } from '../utils/design';
import GazeButton from '../components/core/GazeButton';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useCustomization } from '../contexts/CustomizationContext';
import { useAlertMode } from '../contexts/AlertModeContext';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useTheme } from '../contexts/ThemeContext';
import {
  BellIcon, KeyboardIcon,
  FamilyIcon, SettingsIcon,
  GridIcon, TVIcon, GlobalIcon,
} from '../components/icons/Icons';

interface HomeScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

type EmergencyOvalVisual = {
  color: string;
  border: string;
  bgOverride?: string;
};

type HomeTile = {
  id: string;
  label: string;
  labelHi?: string;
  subLabel?: string;
  icon: React.FC<any>;
  color: string;
  screen: string;
  cardClass: string;
};

const HomePhrasesIcon: React.FC<{
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => {
  const bubbleStrokeWidth = Math.max(1.55, strokeWidth * 0.86);
  const waveformStrokeWidth = Math.max(1.1, strokeWidth * 0.42);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path
        strokeWidth={bubbleStrokeWidth}
        d="M5.25 4.8h13.5a3.35 3.35 0 0 1 3.35 3.35v4.75a3.35 3.35 0 0 1-3.35 3.35h-6.85l-4.35 3.35v-3.35h-2.3a3.35 3.35 0 0 1-3.35-3.35V8.15A3.35 3.35 0 0 1 5.25 4.8Z"
      />
      <g strokeWidth={waveformStrokeWidth}>
        <line x1="8.3" y1="10.25" x2="8.3" y2="12.9" />
        <line x1="10.75" y1="9.55" x2="10.75" y2="13.6" />
        <line x1="13.25" y1="9.95" x2="13.25" y2="13.2" />
        <line x1="15.7" y1="10.45" x2="15.7" y2="12.7" />
      </g>
    </svg>
  );
};

type HomeThemePalette = {
  bg: string;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  tileSurfaces: Record<string, string>;
  icon: string;
  badgeIcon: string;
  text: string;
  subtleText: string;
  mutedText: string;
  brand: string;
  dockSeparator: string;
  quickPhrasesBg: string;
  quickPhrasesBorder: string;
  quickPhrasesText: string;
  quickPhrasesShadow: string;
  emergencyBg: string;
  emergencyHover: string;
  emergencyText: string;
  emergencySoft: string;
  placeholderBg: string;
  placeholderBorder: string;
  dividerBackground: string;
};

const HOME_BADGE_FILLS_DARK: Record<string, string> = {
  kb: '#7CAFA8',
  ph: '#B8A987',
  ac: '#B8A987',
  pp: '#789A92',
  med: '#5A7D75',
  st: '#BFAF9A',
  web: '#6E9692',
  fp: '#66724A',
};

const HOME_BADGE_FILLS_LIGHT: Record<string, string> = {
  kb: '#35534F',
  ph: '#6F4D18',
  ac: '#73511B',
  pp: '#3F5D59',
  med: '#50746B',
  st: '#514432',
  web: '#486B67',
  fp: '#35534F',
};

const HOME_BADGE_FILLS_MIX: Record<string, string> = {
  kb: '#2F5C57',
  ph: '#6F4D18',
  ac: '#73511B',
  pp: '#3B625C',
  med: '#496D64',
  st: '#4A3A28',
  web: '#3D6B65',
  fp: '#66724A',
};

const HOME_BADGE_ICON = '#201A15';
const MIX_HOME_BADGE_ICON = '#23180C';
const USE_FILLED_HOME_ICON_BADGES = false;

const PANEL_GAP = 'clamp(12px, 2.2vh, 26px)';

const HIGH_PRIORITY_HOME_COLORS: Record<string, { bg: string; shadow: string }> = {
  alert_maroon: { bg: '#4A2023', shadow: '#8A3B38' },
  muted_red: { bg: '#8A3B38', shadow: '#A65A52' },
  muted_crimson: { bg: '#7A3A4A', shadow: '#955064' },
  muted_maroon: { bg: '#7A3A4A', shadow: '#955064' },
  warm_maroon: { bg: '#8A3B38', shadow: '#A65A52' },
  red: { bg: '#8A3B38', shadow: '#A65A52' },
  crimson: { bg: '#7A3A4A', shadow: '#955064' },
  deep_maroon: { bg: '#4A2023', shadow: '#8A3B38' },
  terracotta: { bg: '#8A3B38', shadow: '#A65A52' },
};

const MEDIUM_PRIORITY_HOME_COLORS: Record<string, { bg: string; shadow: string }> = {
  alert_maroon: { bg: '#4A2023', shadow: '#8A3B38' },
  warm_maroon: { bg: '#8A3B38', shadow: '#A65A52' },
  muted_crimson: { bg: '#7A3A4A', shadow: '#955064' },
  blue: { bg: '#7A3A4A', shadow: '#955064' },
  golden: { bg: '#8A3B38', shadow: '#A65A52' },
  teal: { bg: '#7A3A4A', shadow: '#955064' },
  muted_blue: { bg: '#7A3A4A', shadow: '#955064' },
  muted_golden: { bg: '#8A3B38', shadow: '#A65A52' },
  muted_teal: { bg: '#7A3A4A', shadow: '#955064' },
  warm_teal: { bg: '#8A3B38', shadow: '#A65A52' },
  deep_teal: { bg: '#4A2023', shadow: '#8A3B38' },
  soft_umber: { bg: '#8A3B38', shadow: '#A65A52' },
};

const vDividerStyle: React.CSSProperties = {
  width: '1px',
  flexShrink: 0,
  alignSelf: 'stretch',
  marginLeft: 'clamp(18px, 2vw, 30px)',
  marginRight: 'clamp(18px, 2vw, 30px)',
  background: 'linear-gradient(180deg, transparent 0%, rgba(213,216,188,0.04) 12%, rgba(213,216,188,0.10) 50%, rgba(213,216,188,0.04) 88%, transparent 100%)',
};


const EMERGENCY_OVAL_VISUALS: Record<string, EmergencyOvalVisual> = {
  // Brighter accent colors — clearly readable on dark cards.
  // Border opacity raised to 0.65–0.68 for visible card boundaries.
  ttsuction: { color: '#E08888', border: 'rgba(210,90,90,0.68)' },
  ambubag: { color: '#D97878', border: 'rgba(200,80,80,0.65)' },
  oralsuction: { color: '#D49A88', border: 'rgba(195,110,88,0.65)' },
  breathingdiscomfort: { color: '#DDB070', border: 'rgba(205,140,60,0.65)' },
  checko2: {
    color: '#7AB8E8',
    border: 'rgba(80,140,210,0.65)',
    bgOverride: '#101B2B',
  },
};

const normalizeEmergencyKey = (label: string): string => (
  label
    .replace(/â‚€/g, '0')
    .replace(/â‚/g, '1')
    .replace(/â‚‚/g, '2')
    .replace(/â‚ƒ/g, '3')
    .replace(/â‚„/g, '4')
    .replace(/â‚…/g, '5')
    .replace(/â‚†/g, '6')
    .replace(/â‚‡/g, '7')
    .replace(/â‚ˆ/g, '8')
    .replace(/â‚‰/g, '9')
    .replace(/₂/g, '2')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
);

const buildEmergencyDisplayLabel = (label: string): string => {
  const key = normalizeEmergencyKey(label);
  if (key === 'breathingdiscomfort') return 'Breathing\nDiscomfort';
  if (key === 'ttsuction') return 'TT\nSuction';
  if (key === 'oralsuction') return 'Oral\nSuction';
  if (key === 'ambubag') return 'Ambu\nBag';
  if (key === 'checko2') return 'Check\nO₂';
  return label;
};

const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigate, onSpeak, isDarkMode = true, showHindi = false,
}) => {
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { enableAlertMode } = useAlertMode();
  const { homeQuickActions, data: { quickWords, homeEmergencyCards, settings } } = useCustomization();
  const { isLight, isMix } = useTheme();

  const [activatedText, setActivatedText] = useState<string | null>(null);
  const [activatedBtnId, setActivatedBtnId] = useState<string | null>(null);
  const [activatedColor, setActivatedColor] = useState<string>('#FFFFFF');
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQuickcall = useCallback((label: string, btnId: string, color = '#FFFFFF') => {
    onSpeak(label);
    setActivatedText(label);
    setActivatedBtnId(btnId);
    setActivatedColor(color);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      setActivatedText(null);
      setActivatedBtnId(null);
    }, 2800);
  }, [onSpeak]);

  const handleEnableAlertMode = useCallback(() => {
    onSpeak('Alert Mode');
    enableAlertMode();
  }, [enableAlertMode, onSpeak]);

  useEffect(() => {
    return () => { if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current); };
  }, []);

  const THEME: HomeThemePalette = isLight ? {
    bg: '#E6D7BA',
    cardBg: '#C4B392',
    cardBorder: '1.5px solid rgba(122, 99, 71, 0.32)',
    cardShadow: '0 10px 20px rgba(122, 99, 71, 0.12), 0 2px 5px rgba(122, 99, 71, 0.08)',
    tileSurfaces: {
      kb: '#B5AA91',
      ph: '#B7AE8D',
      ac: '#C0AC83',
      pp: '#BEA58F',
      med: '#B3A999',
      st: '#B9AC90',
      web: '#B8AA98',
      fp: '#B5AA91',
    },
    icon: '#3B2D20',
    badgeIcon: '#3B2D20',
    text: '#3B2D20',
    subtleText: '#6E5A42',
    mutedText: '#7A6347',
    brand: 'rgba(90, 69, 48, 0.70)',
    dockSeparator: 'rgba(122, 99, 71, 0.28)',
    quickPhrasesBg: 'rgba(122, 99, 71, 0.10)',
    quickPhrasesBorder: 'rgba(122, 99, 71, 0.32)',
    quickPhrasesText: '#5A4530',
    quickPhrasesShadow: '0 8px 16px rgba(122, 99, 71, 0.10), 0 1px 2px rgba(122, 99, 71, 0.08)',
    emergencyBg: '#7A363A',
    emergencyHover: '#6D3034',
    emergencyText: '#FBE9DE',
    emergencySoft: '#FBE9DE',
    placeholderBg: 'rgba(122, 99, 71, 0.08)',
    placeholderBorder: 'rgba(122, 99, 71, 0.18)',
    dividerBackground: 'linear-gradient(180deg, transparent 0%, rgba(122,99,71,0.28) 50%, transparent 100%)',
  } : isMix ? {
    bg: mixColors.home.root,
    cardBg: mixColors.home.tileSurfaces.kb,
    cardBorder: `1.5px solid ${mixColors.home.cardBorder}`,
    cardShadow: mixColors.home.cardShadow,
    tileSurfaces: mixColors.home.tileSurfaces,
    icon: '#3B2D20',
    badgeIcon: MIX_HOME_BADGE_ICON,
    text: mixColors.home.text,
    subtleText: mixColors.home.subtleText,
    mutedText: mixColors.home.mutedText,
    brand: mixColors.home.brand,
    dockSeparator: mixColors.home.dockSeparator,
    quickPhrasesBg: mixColors.home.quickPhrasesBg,
    quickPhrasesBorder: mixColors.home.quickPhrasesBorder,
    quickPhrasesText: mixColors.home.quickPhrasesText,
    quickPhrasesShadow: mixColors.home.quickPhrasesShadow,
    emergencyBg: mixColors.home.emergencyBg,
    emergencyHover: mixColors.home.emergencyHover,
    emergencyText: lightColors.text.inverse,
    emergencySoft: mixColors.home.emergencySoft,
    placeholderBg: mixColors.home.placeholderBg,
    placeholderBorder: mixColors.home.placeholderBorder,
    dividerBackground: mixColors.home.dividerBackground,
  } : {
    bg: screenThemes.home.bg,
    cardBg: screenThemes.home.cardBg,
    cardBorder: screenThemes.home.cardBorder,
    cardShadow: '0 8px 20px rgba(0,0,0,0.28)',
    tileSurfaces: {
      kb: screenThemes.home.cardBg,
      ph: screenThemes.home.cardBg,
      ac: screenThemes.home.cardBg,
      pp: screenThemes.home.cardBg,
      med: screenThemes.home.cardBg,
      st: screenThemes.home.cardBg,
      web: screenThemes.home.cardBg,
      fp: screenThemes.home.cardBg,
    },
    icon: screenThemes.home.text,
    badgeIcon: HOME_BADGE_ICON,
    text: screenThemes.home.text,
    subtleText: '#C8C5B8',
    mutedText: '#A9A392',
    brand: screenThemes.home.brand,
    dockSeparator: screenThemes.home.dockSeparator,
    quickPhrasesBg: screenThemes.home.quickPhrasesBg,
    quickPhrasesBorder: screenThemes.home.quickPhrasesBorder,
    quickPhrasesText: screenThemes.home.quickPhrasesText,
    quickPhrasesShadow: '0 8px 18px rgba(0,0,0,0.24)',
    emergencyBg: screenThemes.home.red,
    emergencyHover: '#7A3A34',
    emergencyText: '#FFF1E3',
    emergencySoft: '#CFA094',
    placeholderBg: 'rgba(236,237,227,0.035)',
    placeholderBorder: 'rgba(213,216,188,0.14)',
    dividerBackground: typeof vDividerStyle.background === 'string'
      ? vDividerStyle.background
      : 'linear-gradient(180deg, transparent 0%, rgba(168,181,196,0.04) 12%, rgba(168,181,196,0.12) 50%, rgba(168,181,196,0.04) 88%, transparent 100%)',
  };
  const ENGLISH_UI_FONT = "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif";
  const themeClass = isLight ? ' theme-light' : isMix ? ' theme-mix' : '';
  const dividerStyle = (isLight || isMix) ? {
    ...vDividerStyle,
    background: THEME.dividerBackground,
  } : vDividerStyle;

  const buttonBaseStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0,
    transition: 'all 0.2s ease',
  };

  const cardStyle = {
    ...buttonBaseStyle,
    flexDirection: 'column' as const,
    width: '100%', height: '100%',
    minHeight: 'clamp(100px, 12vh, 140px)',
    background: THEME.cardBg,
    border: THEME.cardBorder,
    borderRadius: '24px',
    boxShadow: THEME.cardShadow,
  };

  const gridItems: HomeTile[] = [
    { id: 'kb', label: 'Keyboard', labelHi: 'कीबोर्ड', icon: KeyboardIcon, color: HOME_BADGE_FILLS_DARK.kb, screen: 'keyboard', cardClass: 'grid-card-keyboard' },
    { id: 'ph', label: 'Phrases', labelHi: 'बातचीत', icon: HomePhrasesIcon, color: HOME_BADGE_FILLS_DARK.ph, screen: 'phrases', cardClass: 'grid-card-communication' },
    { id: 'ac', label: 'Activities', labelHi: 'मनोरंजन', icon: TVIcon, color: HOME_BADGE_FILLS_DARK.ac, screen: 'activities', cardClass: 'grid-card-activities' },
    { id: 'pp', label: 'People', labelHi: 'परिवार', icon: FamilyIcon, color: HOME_BADGE_FILLS_DARK.pp, screen: 'people', cardClass: 'grid-card-people' },
    { id: 'med', label: 'Assistance', labelHi: 'देखभाल', subLabel: 'Daily Care', icon: BellIcon, color: HOME_BADGE_FILLS_DARK.med, screen: 'medical', cardClass: 'grid-card-assistance' },
    { id: 'st', label: 'Settings', labelHi: 'सेटिंग', icon: SettingsIcon, color: HOME_BADGE_FILLS_DARK.st, screen: 'settings', cardClass: 'grid-card-settings' },
  ];

  const rightPanelTiles: HomeTile[] = [
    { id: 'web', label: 'Web Browsing', labelHi: 'वेब ब्राउज़िंग', icon: GlobalIcon, color: HOME_BADGE_FILLS_DARK.web, screen: 'web', cardClass: 'grid-card-web' },
    { id: 'fp', label: 'Design Home', labelHi: 'घर का नक्शा', icon: GridIcon, color: HOME_BADGE_FILLS_DARK.fp, screen: 'floor-plan', cardClass: 'grid-card-design' },
  ];

  const iconStyle = {
    marginBottom: 'clamp(8px, 1.8vh, 18px)',
    opacity: 1,
    display: 'block',
    // 5.5vh = ~59px at 1080p, ~44px at 800p — hits AAC 35-50% card-face target
    width: 'clamp(38px, 5.5vh, 66px)',
    height: 'clamp(38px, 5.5vh, 66px)',
  };

  const iconBadgeStyle = {
    width: 'clamp(56px, 7.2vh, 76px)',
    height: 'clamp(56px, 7.2vh, 76px)',
    borderRadius: '999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'clamp(10px, 2vh, 18px)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
  };

  const homeTileIconBadgeStyle = isMix ? {
    ...iconBadgeStyle,
    background: 'transparent',
    boxShadow: 'none',
    marginBottom: 'clamp(8px, 1.35vh, 13px)',
  } : USE_FILLED_HOME_ICON_BADGES ? iconBadgeStyle : {
    ...iconBadgeStyle,
    width: 'auto',
    height: 'auto',
    borderRadius: 0,
    background: 'transparent',
    boxShadow: 'none',
    marginBottom: 'clamp(8px, 1.35vh, 13px)',
  };

  const homeTileIconSize = (isMix || !USE_FILLED_HOME_ICON_BADGES) ? 64 : 52;
  const homeTileIconColors = isLight
    ? HOME_BADGE_FILLS_LIGHT
    : isMix
      ? HOME_BADGE_FILLS_MIX
      : HOME_BADGE_FILLS_DARK;

  const labelStyle = {
    display: 'block',
    fontSize: (isLight || isMix) ? 'clamp(24px, 3.15vh, 34px)' : 'clamp(21px, 2.95vh, 30px)',
    fontWeight: (isLight || isMix) ? 700 : 700,
    color: THEME.text,
    letterSpacing: (isLight || isMix) ? '0.01em' : 'clamp(0.5px, 0.1vw, 1px)',
    textTransform: 'none' as const,
    fontFamily: ENGLISH_UI_FONT,
    whiteSpace: 'pre-wrap' as const,
    lineHeight: (isLight || isMix) ? '1.16' : '1.2',
    textAlign: 'center' as const,
  };

  // Use independent home emergency cards; fallback to old quickWords behavior if empty
  const homeCards = homeEmergencyCards?.filter(c => c.enabled) ?? [];
  const prioritizedEmergencyWords = homeCards.length > 0
    ? homeCards
      .map((word, order) => ({ word, order }))
      .sort((a, b) => {
        const pa = (a.word.priority ?? 'high') === 'high' ? 0 : 1;
        const pb = (b.word.priority ?? 'high') === 'high' ? 0 : 1;
        return pa - pb || a.order - b.order;
      })
      .map(({ word }) => word)
      .slice(0, 4)
    : (() => {
      const emergencyQuickWordObjects = quickWords?.categories
        ?.find((category) => category.id === 'emergency')
        ?.words
        ?.filter((word) => word.enabled) ?? [];
      return [...emergencyQuickWordObjects]
        .sort((a, b) => {
          const pa = (a.priority ?? 'high') === 'high' ? 0 : 1;
          const pb = (b.priority ?? 'high') === 'high' ? 0 : 1;
          return pa - pb;
        })
        .slice(0, 4);
    })();
  const useAlertLauncher = settings?.homeEmergencyLaunchMode === 'alert';
  const selectedHighColor = quickWords?.highColor ?? 'muted_maroon';
  const selectedMediumColor = quickWords?.mediumColor ?? 'warm_teal';
  const getEmergencyPriorityColor = useCallback((priority?: 'high' | 'medium') => {
    if (isLight) {
      return { bg: '#7A363A', shadow: '#5A2528' };
    }
    if (priority === 'medium') {
      return MEDIUM_PRIORITY_HOME_COLORS[selectedMediumColor] ?? MEDIUM_PRIORITY_HOME_COLORS.warm_teal;
    }
    return HIGH_PRIORITY_HOME_COLORS[selectedHighColor] ?? HIGH_PRIORITY_HOME_COLORS.muted_maroon;
  }, [isLight, selectedHighColor, selectedMediumColor]);

  return (
    <div className={`home-screen${themeClass}`} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: isLight
        ? 'radial-gradient(circle at 50% 8%, #F0E4CB 0%, #E6D7BA 46%, #DDC9A6 100%)'
        : THEME.bg,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <GlobalNavBar currentPage="home" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        paddingTop: 'clamp(10px, 1.8vh, 22px)',
        paddingBottom: 'clamp(8px, 1.2vh, 16px)',
        width: '100%',
        gap: 0,
        minHeight: 0,
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'stretch',
          // Increased padding on all four sides — all 14 cards (6L + 6C + 2R)
          // shrink in equal proportion because they are flex/grid children of this container.
          // Horizontal: clamp(18px,2.2vw,36px) → clamp(36px,4.8vw,80px) (+18–44px per side)
          // Vertical:   clamp(8px,1.2vh,16px)  → clamp(12px,1.8vh,24px) (+4–8px per side)
          paddingTop: 'clamp(20px, 3.5vh, 42px)',
          paddingBottom: 'clamp(70px, 10vh, 120px)',
          paddingLeft: 'clamp(36px, 4.5vw, 80px)',
          paddingRight: 'clamp(36px, 4.5vw, 80px)',
          marginTop: 'clamp(8px, 1.2vh, 16px)',
          marginBottom: 0,
          minHeight: 0,
          overflow: 'hidden',
          width: '100%',
          maxWidth: '1780px',
          alignSelf: 'center',
        }}>
          {/* LEFT PANEL — Hybrid Dock: muted solid emergency + dark glass navigation */}
          {(() => {
            const NAV_BG = THEME.quickPhrasesBg;
            const alertCardColor = HIGH_PRIORITY_HOME_COLORS.alert_maroon;
            const DOCK_LABELS = useAlertLauncher ? [
              {
                text: 'Alert\nMode',
                textHi: undefined as string | undefined,
                spoken: '__alert_mode__',
                empty: false,
                bg: alertCardColor.bg,
                bgShadow: alertCardColor.shadow,
              },
              { text: 'Quick Phrases', textHi: 'à¤¬à¤¾à¤¤à¤šà¥€à¤¤', spoken: '__quick_words__', empty: false, bg: undefined as string | undefined, bgShadow: undefined as string | undefined },
            ] : [
              ...prioritizedEmergencyWords.map((word) => {
                const priorityColor = getEmergencyPriorityColor(word.priority);
                return {
                  text: word.en.replace(/\s+/g, '\n'),
                  textHi: word.hi,
                  spoken: word.en,
                  empty: false,
                  bg: priorityColor.bg,
                  bgShadow: priorityColor.shadow,
                };
              }),
              // Pad to 4 with empty placeholders to keep grid stable
              ...Array.from({ length: Math.max(0, 4 - prioritizedEmergencyWords.length) }, () => ({
                text: '',
                textHi: undefined as string | undefined,
                spoken: '',
                empty: true,
                bg: undefined as string | undefined,
                bgShadow: undefined as string | undefined,
              })),
              { text: 'Quick Phrases', textHi: 'बातचीत', spoken: '__quick_words__', empty: false, bg: undefined as string | undefined, bgShadow: undefined as string | undefined },
            ];
            return (
              <div style={{
                flexGrow: 0,
                flexShrink: 0,
                flexBasis: 'clamp(280px, 32%, 490px)',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gridTemplateRows: '1fr 1fr clamp(8px, 1.2vh, 14px) 1fr',
                columnGap: 'clamp(10px, 1.2vw, 16px)',
                rowGap: 'clamp(8px, 1.2vh, 16px)',
                borderRadius: 'clamp(14px, 1.8vh, 20px)',
                overflow: 'visible',
                minHeight: 0,
                minWidth: 0,
                marginRight: 'clamp(8px, 1vw, 18px)',
                position: 'relative',
              }}>
                {/* Spacer row 3 contains the separator line */}
                <div style={{
                  gridColumn: '1 / -1',
                  gridRow: '3',
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  <div style={{
                    width: '100%',
                    height: '1px',
                    background: THEME.dockSeparator,
                  }} />
                </div>
                {DOCK_LABELS.map((item, i) => {
                  const btnId = `dock-${i}`;
                  const isActivated = activatedBtnId === btnId;
                  const isNav = item.spoken === '__quick_words__';
                  const isAlertModeCard = item.spoken === '__alert_mode__';
                  const isEmpty = !isNav && !isAlertModeCard && item.empty;
                  const bg = isNav ? undefined : item.bg;
                  const bgShadow = isNav ? undefined : item.bgShadow;

                  // Empty placeholder — dimmed, non-interactive, preserves grid layout
                  if (isEmpty) {
                    return (
                      <div
                        key={btnId}
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '24px',
                          background: THEME.placeholderBg,
                          border: `1.5px dashed ${THEME.placeholderBorder}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      />
                    );
                  }

                  return (
                    <GazeButton
                      key={btnId}
                      id={btnId}
                      onClick={() => {
                        if (item.spoken === '__quick_words__') { onNavigate('quickwords'); return; }
                        if (item.spoken === '__alert_mode__') { handleEnableAlertMode(); return; }
                        handleQuickcall(item.spoken, btnId, bgShadow!);
                      }}
                      className={`quickcall-btn${themeClass}`}
                      isDarkMode={isDarkMode}
                      gazeEnabled={isGazeEnabled}
                      gazeEnabledTimestamp={lastEnabledTimestamp}
                      dwellCategory={!isNav ? 'emergencyButton' : 'homeScreenTile'}
                      style={{
                        width: isNav ? '70%' : '100%',
                        height: isAlertModeCard ? 'clamp(150px, 24vh, 220px)' : '100%',
                        gridRow: isNav ? 4 : isAlertModeCard ? '1 / 3' : undefined,
                        gridColumn: (isNav || isAlertModeCard) ? '1 / -1' : undefined,
                        justifySelf: isNav ? 'center' : undefined,
                        alignSelf: isAlertModeCard ? 'center' : undefined,
                        borderRadius: isNav ? '999px' : '24px',
                        background: isNav ? NAV_BG : bg,
                        border: isNav
                          ? `1px solid ${THEME.quickPhrasesBorder}`
                          : (isLight
                            ? '1.5px solid rgba(74, 28, 32, 0.45)'
                            : ((isLight || isMix) ? THEME.cardBorder : 'none')),
                        boxShadow: isActivated
                          ? isNav ? ((isLight || isMix) ? THEME.quickPhrasesShadow : '0 0 0 1px rgba(56, 189, 248, 0.12), 0 6px 16px rgba(0, 0, 0, 0.2)') : (isLight ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 18px rgba(90, 37, 40, 0.18)' : ((isLight || isMix) ? THEME.cardShadow : `0 6px 16px rgba(0,0,0,0.16), 0 0 0 1px ${bgShadow}28`))
                          : isNav ? ((isLight || isMix) ? THEME.quickPhrasesShadow : '0 5px 12px rgba(0,0,0,0.16)') : (isLight ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 16px rgba(90, 37, 40, 0.14)' : ((isLight || isMix) ? THEME.cardShadow : '0 4px 12px rgba(0,0,0,0.14)')),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 'clamp(8px, 1vh, 14px) clamp(10px, 1.2vw, 16px)',
                        overflow: 'hidden',
                        transition: 'all 0.15s ease',
                        transform: isActivated ? 'scale(1.02)' : 'scale(1)',
                        filter: !isNav && isActivated ? 'brightness(1.05)' : 'brightness(1)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px' }}>
                          <span style={{
                            fontSize: !isNav ? 'clamp(24px, 3vh, 32px)' : 'clamp(22px, 2.8vh, 32px)',
                            fontWeight: !isNav ? ((isLight || isMix) ? 600 : 900) : ((isLight || isMix) ? 600 : 700),
                            color: isNav ? THEME.quickPhrasesText : THEME.emergencyText,
                            lineHeight: 1.1,
                            textAlign: 'center',
                            fontFamily: ENGLISH_UI_FONT,
                            whiteSpace: 'pre-wrap',
                            letterSpacing: (isLight || isMix) ? '0.01em' : (!isNav ? '0.6px' : '0.2px'),
                            textTransform: 'none',
                            textShadow: 'none',
                          }}>
                            {item.text}
                          </span>
                              {showHindi && item.textHi && (
                            <>
                              <div style={{
                                width: '28px', height: '1px', background: isLight ? lightColors.emergency.soft : isMix ? THEME.emergencySoft : 'rgba(255,255,255,0.2)',
                                borderRadius: '1px',
                                margin: isNav ? '10px auto 6px' : '10px auto 6px'
                              }} />
                              <span style={{
                                fontSize: !isNav ? 'clamp(24px, 3.2vh, 34px)' : 'clamp(24px, 3vh, 34px)',
                                fontWeight: 700,
                                color: isLight ? (isNav ? lightColors.text.secondary : lightColors.emergency.soft) : isMix ? (isNav ? THEME.subtleText : THEME.emergencySoft) : 'rgba(255, 210, 140, 0.95)',
                                fontFamily: "'Noto Sans Devanagari', sans-serif",
                                textAlign: 'center',
                                lineHeight: 1.45,
                                letterSpacing: '0.02em',
                              }}>
                                {item.textHi}
                              </span>
                            </>
                          )}
                        </div>
                        {isNav && (
                          <span style={{
                            fontSize: 'clamp(20px, 2.5vh, 28px)',
                            fontWeight: isLight ? 500 : isMix ? 650 : 300,
                            color: isActivated
                              ? (isLight ? THEME.subtleText : isMix ? THEME.subtleText : screenThemes.home.teal)
                              : (isLight ? THEME.mutedText : isMix ? '#F0E2C4' : THEME.mutedText),
                            opacity: isMix ? 0.9 : 1,
                            lineHeight: 1,
                            textShadow: 'none',
                            transition: 'all 0.2s ease',
                          }}>＋ →</span>
                        )}
                      </div>
                    </GazeButton>
                  );
                })}
              </div>
            );
          })()}

          <div style={dividerStyle} />

          <div style={{
            flex: '2 1 0',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gridTemplateRows: 'repeat(3, minmax(clamp(115px, 13.5vh, 160px), 1fr))',
            gap: PANEL_GAP,
            minHeight: 0,
            minWidth: 0,
            padding: '0 0 clamp(15px, 2.5vh, 30px) 0',
          }}>
            {gridItems.map((tile) => (
              <GazeButton
                key={tile.id}
                id={tile.id}
                className={`grid-card ${tile.cardClass}${themeClass}`}
                onClick={() => onNavigate(tile.screen)}
                isDarkMode={isDarkMode}
                gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                dwellCategory="homeScreenTile"
                style={{
                  ...cardStyle,
                  background: THEME.tileSurfaces[tile.id] ?? THEME.cardBg,
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                >
                  <div style={{
                    ...homeTileIconBadgeStyle,
                    background: (isMix || !USE_FILLED_HOME_ICON_BADGES) ? 'transparent' : (homeTileIconColors[tile.id] ?? tile.color),
                  }}>
                      <tile.icon
                        size={tile.id === 'ph' ? homeTileIconSize + 14 : homeTileIconSize}
                        color={(isMix || !USE_FILLED_HOME_ICON_BADGES) ? (homeTileIconColors[tile.id] ?? tile.color) : THEME.badgeIcon}
                        strokeWidth={tile.id === 'ph' ? ((isLight || isMix) ? 2.7 : 2.45) : ((isLight || isMix) ? 3.1 : 2.65)}
                        style={tile.id === 'ph' ? { transform: 'translateY(1px)' } : undefined}
                      />
                  </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', marginTop: 'clamp(4px, 1vh, 12px)' }}>
                  <span className="grid-card-label" style={labelStyle}>
                    {tile.label}
                  </span>
                  {showHindi && tile.labelHi ? (
                    <>
                      <div style={{ width: '32px', height: '1.5px', background: isLight ? lightColors.border.light : isMix ? mixColors.home.dockSeparator : 'rgba(255,255,255,0.18)', borderRadius: '2px', margin: '6px auto 4px' }} />
                      <span style={{
                        fontSize: 'clamp(22px, 3vh, 32px)',
                        fontWeight: 700,
                        color: isLight ? lightColors.text.secondary : isMix ? THEME.subtleText : 'rgba(255, 210, 140, 0.95)',
                        fontFamily: "'Noto Sans Devanagari', sans-serif",
                        textAlign: 'center',
                        lineHeight: 1.4,
                        letterSpacing: '0.02em',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {tile.labelHi}
                      </span>
                    </>
                  ) : tile.subLabel ? (
                    <span style={{
                      fontSize: 'clamp(13px, 1.75vh, 18px)',
                      fontWeight: 600,
                      color: isLight ? '#6E5A42' : isMix ? THEME.subtleText : screenThemes.home.tealIcon,
                      opacity: isLight ? 1 : 0.7,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const,
                      fontFamily: ENGLISH_UI_FONT,
                      textAlign: 'center' as const,
                    }}>
                      {tile.subLabel}
                    </span>
                  ) : null}
                </div>
              </GazeButton>
            ))}
          </div>

          <div style={dividerStyle} />

          <div style={{
            flex: '1 1 0',
            display: 'grid',
            gridTemplateColumns: '1fr',
            gridTemplateRows: 'repeat(3, minmax(clamp(115px, 13.5vh, 160px), 1fr))',
            gap: PANEL_GAP,
            minHeight: 0,
            minWidth: 0,
            padding: '0 0 clamp(15px, 2.5vh, 30px) 0',
          }}>
            {rightPanelTiles.map((tile) => (
              <GazeButton
                key={tile.id}
                id={tile.id}
                className={`grid-card ${tile.cardClass}${themeClass}`}
                onClick={() => onNavigate(tile.screen)}
                isDarkMode={isDarkMode}
                gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                dwellCategory="homeScreenTile"
                style={{
                  ...cardStyle,
                  background: THEME.tileSurfaces[tile.id] ?? THEME.cardBg,
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                >
                  <div style={{
                    ...homeTileIconBadgeStyle,
                    background: (isMix || !USE_FILLED_HOME_ICON_BADGES) ? 'transparent' : (homeTileIconColors[tile.id] ?? tile.color),
                  }}>
                        <tile.icon
                          size={tile.id === 'ph' ? homeTileIconSize + 12 : homeTileIconSize}
                          color={(isMix || !USE_FILLED_HOME_ICON_BADGES) ? (homeTileIconColors[tile.id] ?? tile.color) : THEME.badgeIcon}
                          strokeWidth={tile.id === 'ph' ? ((isLight || isMix) ? 2.9 : 2.6) : ((isLight || isMix) ? 3.1 : 2.65)}
                          style={tile.id === 'ph' ? { transform: 'translateY(1px)' } : undefined}
                        />
                  </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', marginTop: 'clamp(4px, 1vh, 12px)' }}>
                  <span className="grid-card-label" style={labelStyle}>
                    {tile.label}
                  </span>
                  {showHindi && tile.labelHi && (
                    <>
                      <div style={{ width: '32px', height: '1.5px', background: isLight ? lightColors.border.light : isMix ? mixColors.home.dockSeparator : 'rgba(255,255,255,0.18)', borderRadius: '2px', margin: '6px auto 4px' }} />
                      <span style={{
                        fontSize: 'clamp(22px, 3vh, 32px)',
                        fontWeight: 700,
                        color: isLight ? lightColors.text.secondary : isMix ? THEME.subtleText : 'rgba(255, 210, 140, 0.95)',
                        fontFamily: "'Noto Sans Devanagari', sans-serif",
                        textAlign: 'center',
                        lineHeight: 1.4,
                        letterSpacing: '0.02em',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {tile.labelHi}
                      </span>
                    </>
                  )}
                </div>
              </GazeButton>
            ))}
            <div style={{ minHeight: 0 }} />
          </div>
        </div>

      </div>

      {activatedText && (
        <div
          key={activatedText + Date.now()}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 5000,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'gazeconnect-magnify 2.8s ease-out forwards',
          }}
        >
          <div style={{
            padding: 'clamp(28px, 4.5vh, 52px) clamp(56px, 9vw, 130px)',
            borderRadius: '28px',
            background: isLight ? lightColors.background.elevated : isMix ? 'rgba(20, 17, 15, 0.96)' : 'rgba(8, 12, 22, 0.96)',
            border: isLight ? `2px solid ${lightColors.border.main}` : `2px solid ${activatedColor}50`,
            boxShadow: isLight ? '0 8px 24px rgba(139, 121, 104, 0.12), 0 2px 6px rgba(139, 121, 104, 0.08)' : isMix ? `0 12px 52px rgba(0, 0, 0, 0.60), 0 0 22px ${activatedColor}14` : `0 12px 80px rgba(0, 0, 0, 0.75), 0 0 40px ${activatedColor}18`,
            backdropFilter: 'none',
          }}>
            <span style={{
              fontSize: 'clamp(48px, 8vh, 96px)',
              fontWeight: (isLight || isMix) ? 600 : 800,
              color: isLight ? lightColors.text.primary : isMix ? (activatedColor || THEME.text) : activatedColor,
              fontFamily: ENGLISH_UI_FONT,
              letterSpacing: (isLight || isMix) ? '0.02em' : '3px',
              textAlign: 'center',
              textTransform: 'none',
            }}>
              {activatedText}
            </span>
          </div>
        </div>
      )}

      <style>{`
        /* ── CLOCK REPOSITIONING ──
           Shift the top-right clock slightly left + down from the absolute corner.
           Uses a class-agnostic selector covering common clock container patterns. */
        .navbar-clock,
        .nav-time,
        .time-display,
        .clock-widget,
        [class*="NavClock"],
        [class*="navClock"],
        [class*="TimeDisplay"],
        [class*="timeDisplay"] {
          /* Move away from both margins: push right→left, top→down */
          margin-right: clamp(18px, 2.2vw, 40px) !important;
          margin-top:   clamp(8px,  1.0vh, 16px) !important;
          padding-right: 0 !important;
        }

        /* ── RESPONSIVE HIDE ──
           On screens narrower than 1100px the clock overlaps nav buttons.
           If there is free space it renders; if not, it hides cleanly. */
        @media (max-width: 1100px) {
          .navbar-clock,
          .nav-time,
          .time-display,
          .clock-widget,
          [class*="NavClock"],
          [class*="navClock"],
          [class*="TimeDisplay"],
          [class*="timeDisplay"] {
            display: none !important;
          }
        }

        @keyframes gazeconnect-magnify {
          0% { opacity: 0; transform: scale(0.7); }
          10% { opacity: 1; transform: scale(1); }
          75% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.05); }
        }
        .quickcall-yes:hover {
          background: rgba(80, 110, 85, 0.22) !important;
          border-color: #8FAF8D !important;
          box-shadow: 0 0 16px rgba(143, 175, 141, 0.18) !important;
          transform: scale(1.04);
        }
        .quickcall-no:hover {
          background: rgba(130, 70, 70, 0.22) !important;
          border-color: #B08080 !important;
          box-shadow: 0 0 16px rgba(176, 128, 128, 0.18) !important;
          transform: scale(1.04);
        }
      `}</style>
    </div>
  );
};

export default React.memo(HomeScreen);
