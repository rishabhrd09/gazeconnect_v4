/**
 * QuickWordsGrid
 *
 * Shared quick-words board used by:
 * - QuickWordsOverlay (default overlay presentation)
 * - QuickWordsScreen (standalone AAC board presentation)
 */
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import GazeButton from '../core/GazeButton';
import type { QuickWord, QuickWordCategory } from '../../types/customization';
import { lightColors } from '../../utils/design';
import { useTheme } from '../../contexts/ThemeContext';
import medicalUrgentIcon from '../../assets/daily-assistance/medical-urgent.png';
import bedPositionIcon from '../../assets/daily-assistance/bed-position.png';
import dailyCareIcon from '../../assets/daily-assistance/daily-care.png';

type OverlayPalette = {
  panelBg: string;
  panelBorder: string;
  headerBg: string;
  headerText: string;
  cardBg: string;
  cardBorder: string;
  cardText: string;
  hindiText: string;
  activeBorder: string;
  activeShadow: string;
  idleShadow: string;
};

type StandaloneTone = {
  accent: string;
  accentRing: string;
  headerText: string;
  cardBg: string;
  cardBorder: string;
  cardText: string;
  hindiText: string;
};

const UI_FONT = "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif";
const MEDICAL_HEADER_FONT = "'Helvetica Neue', 'Arial', 'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif";
const HINDI_FONT = "'Noto Sans Devanagari', 'Mangal', sans-serif";

const CATEGORY_ICON_ASSETS: Record<string, string> = {
  emergency: medicalUrgentIcon,
  position: bedPositionIcon,
  daily: dailyCareIcon,
};

const CATEGORY_ORDER = ['emergency', 'position', 'daily'];
const MAX_WORDS = 6;

const OVERLAY_DARK: Record<string, OverlayPalette> = {
  emergency: {
    panelBg: 'rgba(27,28,24,0.72)',
    panelBorder: 'rgba(138,70,61,0.28)',
    headerBg: '#351715',
    headerText: '#CFA094',
    cardBg: '#4B211E',
    cardBorder: '#8B3A36',
    cardText: '#F5F0EE',
    hindiText: 'rgba(255, 210, 140, 0.95)',
    activeBorder: 'rgba(255,255,255,0.85)',
    activeShadow: '0 0 26px rgba(255,255,255,0.22)',
    idleShadow: '0 4px 16px rgba(0,0,0,0.18)',
  },
  position: {
    panelBg: 'rgba(27,28,24,0.72)',
    panelBorder: 'rgba(106,77,52,0.30)',
    headerBg: '#241D14',
    headerText: '#C69A45',
    cardBg: '#352B1C',
    cardBorder: '#6A4D34',
    cardText: '#F5F0EE',
    hindiText: 'rgba(255, 210, 140, 0.95)',
    activeBorder: 'rgba(255,255,255,0.85)',
    activeShadow: '0 0 26px rgba(255,255,255,0.22)',
    idleShadow: '0 4px 16px rgba(0,0,0,0.18)',
  },
  daily: {
    panelBg: 'rgba(27,28,24,0.72)',
    panelBorder: 'rgba(63,109,98,0.30)',
    headerBg: '#102520',
    headerText: '#8FAE72',
    cardBg: '#16342F',
    cardBorder: '#3F6D62',
    cardText: '#F5F0EE',
    hindiText: 'rgba(255, 210, 140, 0.95)',
    activeBorder: 'rgba(255,255,255,0.85)',
    activeShadow: '0 0 26px rgba(255,255,255,0.22)',
    idleShadow: '0 4px 16px rgba(0,0,0,0.18)',
  },
};

const OVERLAY_MIX: Record<string, OverlayPalette> = {
  emergency: {
    panelBg: '#241E16',
    panelBorder: '#6A4D34',
    headerBg: '#42201D',
    headerText: '#E3B2A6',
    cardBg: '#B6A17A',
    cardBorder: '#9C5A4E',
    cardText: '#23180C',
    hindiText: '#4B3520',
    activeBorder: '#6A4D34',
    activeShadow: '0 0 0 3px rgba(240,226,196,0.18), 0 10px 24px rgba(0,0,0,0.26)',
    idleShadow: '0 8px 24px rgba(0,0,0,0.26)',
  },
  position: {
    panelBg: '#241E16',
    panelBorder: '#6A4D34',
    headerBg: '#332719',
    headerText: '#D6B36A',
    cardBg: '#B6A17A',
    cardBorder: '#8B6F49',
    cardText: '#23180C',
    hindiText: '#4B3520',
    activeBorder: '#6A4D34',
    activeShadow: '0 0 0 3px rgba(240,226,196,0.18), 0 10px 24px rgba(0,0,0,0.26)',
    idleShadow: '0 8px 24px rgba(0,0,0,0.26)',
  },
  daily: {
    panelBg: '#241E16',
    panelBorder: '#6A4D34',
    headerBg: '#173028',
    headerText: '#A7BE86',
    cardBg: '#B6A17A',
    cardBorder: '#667A59',
    cardText: '#23180C',
    hindiText: '#4B3520',
    activeBorder: '#6A4D34',
    activeShadow: '0 0 0 3px rgba(240,226,196,0.18), 0 10px 24px rgba(0,0,0,0.26)',
    idleShadow: '0 8px 24px rgba(0,0,0,0.26)',
  },
};

const OVERLAY_LIGHT: Record<string, OverlayPalette> = {
  emergency: {
    panelBg: lightColors.background.secondary,
    panelBorder: lightColors.emergency.hover,
    headerBg: lightColors.emergency.soft,
    headerText: lightColors.emergency.deep,
    cardBg: lightColors.emergency.main,
    cardBorder: lightColors.emergency.hover,
    cardText: lightColors.text.inverse,
    hindiText: lightColors.text.secondary,
    activeBorder: lightColors.border.strong,
    activeShadow: '0 8px 24px rgba(139, 121, 104, 0.12), 0 2px 6px rgba(139, 121, 104, 0.08)',
    idleShadow: '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)',
  },
  position: {
    panelBg: lightColors.background.secondary,
    panelBorder: lightColors.warning.main,
    headerBg: '#F7F0E4',
    headerText: lightColors.warning.main,
    cardBg: '#F4ECDE',
    cardBorder: lightColors.warning.main,
    cardText: lightColors.text.primary,
    hindiText: lightColors.text.secondary,
    activeBorder: lightColors.border.strong,
    activeShadow: '0 8px 24px rgba(139, 121, 104, 0.12), 0 2px 6px rgba(139, 121, 104, 0.08)',
    idleShadow: '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)',
  },
  daily: {
    panelBg: lightColors.background.secondary,
    panelBorder: lightColors.success.main,
    headerBg: '#F4F7F2',
    headerText: lightColors.success.main,
    cardBg: '#EFF3EA',
    cardBorder: lightColors.success.main,
    cardText: lightColors.text.primary,
    hindiText: lightColors.text.secondary,
    activeBorder: lightColors.border.strong,
    activeShadow: '0 8px 24px rgba(139, 121, 104, 0.12), 0 2px 6px rgba(139, 121, 104, 0.08)',
    idleShadow: '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)',
  },
};

const STANDALONE_DARK: Record<string, StandaloneTone> = {
  emergency: {
    accent: '#B06A5A',
    accentRing: 'rgba(167, 107, 98, 0.16)',
    headerText: '#F1ECE4',
    cardBg: '#2B1F1D',
    cardBorder: 'rgba(167, 107, 98, 0.28)',
    cardText: '#F4EFEB',
    hindiText: '#D8C2BC',
  },
  position: {
    accent: '#B19658',
    accentRing: 'rgba(177, 150, 88, 0.16)',
    headerText: '#F1ECE4',
    cardBg: '#292519',
    cardBorder: 'rgba(177, 150, 88, 0.26)',
    cardText: '#F3EEE4',
    hindiText: '#D9CCAD',
  },
  daily: {
    accent: '#7E9772',
    accentRing: 'rgba(126, 151, 114, 0.16)',
    headerText: '#F1ECE4',
    cardBg: '#1C2721',
    cardBorder: 'rgba(126, 151, 114, 0.24)',
    cardText: '#EEF3EC',
    hindiText: '#C9D4C3',
  },
};

const MIX_STANDALONE_CARD_BG = '#B6A17A';

const STANDALONE_MIX: Record<string, StandaloneTone> = {
  emergency: {
    accent: '#B07163',
    accentRing: 'rgba(176, 113, 99, 0.18)',
    headerText: '#E9DDC4',
    cardBg: MIX_STANDALONE_CARD_BG,
    cardBorder: 'rgba(176, 113, 99, 0.34)',
    cardText: '#21170F',
    hindiText: '#5D4932',
  },
  position: {
    accent: '#BFA15C',
    accentRing: 'rgba(191, 161, 92, 0.18)',
    headerText: '#E9DDC4',
    cardBg: MIX_STANDALONE_CARD_BG,
    cardBorder: 'rgba(191, 161, 92, 0.32)',
    cardText: '#21170F',
    hindiText: '#5A472E',
  },
  daily: {
    accent: '#8FA67A',
    accentRing: 'rgba(143, 166, 122, 0.18)',
    headerText: '#E9DDC4',
    cardBg: MIX_STANDALONE_CARD_BG,
    cardBorder: 'rgba(143, 166, 122, 0.32)',
    cardText: '#21170F',
    hindiText: '#4E513C',
  },
};

const STANDALONE_LIGHT: Record<string, StandaloneTone> = {
  emergency: {
    accent: '#8C4C43',
    accentRing: 'rgba(140, 76, 67, 0.14)',
    headerText: '#7B4038',
    cardBg: '#F3E7E0',
    cardBorder: 'rgba(140, 76, 67, 0.20)',
    cardText: '#221812',
    hindiText: '#66493F',
  },
  position: {
    accent: '#9A7740',
    accentRing: 'rgba(154, 119, 64, 0.14)',
    headerText: '#7B5F2F',
    cardBg: '#F0E7D8',
    cardBorder: 'rgba(154, 119, 64, 0.18)',
    cardText: '#221912',
    hindiText: '#62503A',
  },
  daily: {
    accent: '#5F7858',
    accentRing: 'rgba(95, 120, 88, 0.14)',
    headerText: '#4E6548',
    cardBg: '#E5ECDD',
    cardBorder: 'rgba(95, 120, 88, 0.18)',
    cardText: '#1D1813',
    hindiText: '#4A5C45',
  },
};

const getStandaloneColorCategoryId = (categoryId: string) => {
  if (categoryId === 'position') return 'daily';
  if (categoryId === 'daily') return 'position';
  return categoryId;
};

export interface QuickWordsGridProps {
  categories: QuickWordCategory[];
  coreWords?: unknown[];
  onWordSelect: (word: QuickWord) => void;
  isDarkMode: boolean;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  showHindi?: boolean;
  idPrefix?: string;
  presentation?: 'overlay' | 'standalone';
}

const getStandaloneTone = (categoryId: string, isMix: boolean, isDarkMode: boolean, isWarm: boolean = false): StandaloneTone => {
  const colorCategoryId = getStandaloneColorCategoryId(categoryId);
  // TODO(warm-mode): unique warm palette tables — for v1, route warm to LIGHT
  if (isWarm) return STANDALONE_LIGHT[colorCategoryId] ?? STANDALONE_LIGHT.daily;
  if (isMix) return STANDALONE_MIX[colorCategoryId] ?? STANDALONE_MIX.daily;
  if (isDarkMode) return STANDALONE_DARK[colorCategoryId] ?? STANDALONE_DARK.daily;
  return STANDALONE_LIGHT[colorCategoryId] ?? STANDALONE_LIGHT.daily;
};

const getOverlayPalette = (categoryId: string, isMix: boolean, isDarkMode: boolean, isWarm: boolean = false): OverlayPalette => {
  // TODO(warm-mode): unique warm palette tables — for v1, route warm to LIGHT
  if (isWarm) return OVERLAY_LIGHT[categoryId] ?? OVERLAY_LIGHT.daily;
  if (isMix) return OVERLAY_MIX[categoryId] ?? OVERLAY_MIX.daily;
  if (isDarkMode) return OVERLAY_DARK[categoryId] ?? OVERLAY_DARK.daily;
  return OVERLAY_LIGHT[categoryId] ?? OVERLAY_LIGHT.daily;
};

// Font sizes bumped ~15-18% over prior values for better AAC readability at
// eye-tracking distance (~60 cm). Standalone (full Quick Words screen)
// receives a slightly larger boost than overlay (where space is more
// constrained). All clamps respect viewport-height scaling so the layout
// stays no-scroll at 13" → 27".
const getWordFontSize = (text: string, presentation: 'overlay' | 'standalone') => {
  const length = text.length;
  const hasCompoundLabel = text.includes('/') || text.includes('&');

  if (presentation === 'overlay') {
    if (length >= 28) return 'clamp(22px, 2.7vh, 30px)';
    if (length >= 18 || hasCompoundLabel) return 'clamp(24px, 2.9vh, 33px)';
    return 'clamp(27px, 3.3vh, 38px)';
  }
  if (length >= 30) return 'clamp(26px, 2.85vh, 32px)';
  if (length >= 20 || hasCompoundLabel) return 'clamp(28px, 3.15vh, 36px)';
  if (length >= 12 || text.includes(' ')) return 'clamp(30px, 3.45vh, 40px)';
  return 'clamp(34px, 3.85vh, 46px)';
};

const getHindiFontSize = (text: string, presentation: 'overlay' | 'standalone') => {
  if (presentation === 'overlay') {
    if (text.length >= 18) return 'clamp(27px, 3.35vh, 36px)';
    return 'clamp(30px, 3.6vh, 40px)';
  }
  if (text.length >= 18) return 'clamp(22px, 2.5vh, 30px)';
  return 'clamp(24px, 2.8vh, 34px)';
};

const getStandaloneHeading = (category: QuickWordCategory) => {
  if (category.id === 'emergency') return 'Medical / Urgent';
  return category.heading || category.id;
};

const STANDALONE_ICON_COLORS = {
  dark: {
    emergency: '#8A5B53',
    position: '#8F774D',
    daily: '#6F8367',
  },
  mix: {
    emergency: '#866054',
    position: '#8A7047',
    daily: '#6B7B5E',
  },
  light: {
    emergency: '#8C6258',
    position: '#8A7045',
    daily: '#687A5F',
  },
} as const;

const getStandaloneIconColor = (categoryId: string, isMix: boolean, isDarkMode: boolean, isWarm: boolean = false) => {
  // TODO(warm-mode): unique warm palette tables — for v1, route warm to LIGHT
  const mode = isMix ? 'mix' : isWarm ? 'light' : isDarkMode ? 'dark' : 'light';
  const palette = STANDALONE_ICON_COLORS[mode];
  const colorCategoryId = getStandaloneColorCategoryId(categoryId);
  return palette[colorCategoryId as keyof typeof palette] ?? palette.daily;
};

const QuickWordsGrid: React.FC<QuickWordsGridProps> = ({
  categories,
  onWordSelect,
  isDarkMode,
  gazeEnabled,
  gazeEnabledTimestamp,
  showHindi = false,
  idPrefix = 'qwg',
  presentation = 'overlay',
}) => {
  const { isMix, isWarm } = useTheme();
  const [activatedKey, setActivatedKey] = useState<string | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (flashRef.current) clearTimeout(flashRef.current);
  }, []);

  const orderedCategories = useMemo(() => (
    CATEGORY_ORDER
      .map((id) => categories.find((category) => category.id === id))
      .filter(Boolean) as QuickWordCategory[]
  ), [categories]);

  const handleSelect = useCallback((word: QuickWord, key: string) => {
    onWordSelect(word);
    setActivatedKey(key);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setActivatedKey(null), presentation === 'standalone' ? 420 : 500);
  }, [onWordSelect, presentation]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      gap: presentation === 'standalone' ? 'clamp(20px, 2.2vw, 28px)' : 'clamp(20px, 2.5vw, 28px)',
      width: '100%',
      height: '100%',
      minHeight: 0,
    }}>
      {orderedCategories.map((category) => {
        const words = category.words.filter((word) => word.enabled).slice(0, MAX_WORDS);
        const overlayPalette = getOverlayPalette(category.id, isMix, isDarkMode, isWarm);
        const standaloneTone = getStandaloneTone(category.id, isMix, isDarkMode, isWarm);
        const categoryName = category.heading || category.id.charAt(0).toUpperCase() + category.id.slice(1);
        const categoryIconSrc = CATEGORY_ICON_ASSETS[category.id];

        return (
          <div
            key={category.id}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: presentation === 'overlay' ? 'hidden' : 'visible',
              backgroundColor: presentation === 'overlay' ? overlayPalette.panelBg : 'transparent',
              borderRadius: presentation === 'overlay' ? '28px' : undefined,
              border: presentation === 'overlay' ? `1.5px solid ${overlayPalette.panelBorder}` : 'none',
              boxShadow: presentation === 'overlay'
                ? (isMix ? '0 8px 24px rgba(0,0,0,0.26)' : isDarkMode ? '0 8px 32px rgba(0,0,0,0.2)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)')
                : 'none',
            }}
          >
            {presentation === 'overlay' ? (
              <div style={{
                backgroundColor: overlayPalette.headerBg,
                borderBottom: isMix ? `2px solid ${overlayPalette.cardBorder}` : isDarkMode ? `2px solid ${overlayPalette.cardBorder}60` : `2px solid ${overlayPalette.cardBorder}`,
                padding: 'clamp(16px, 2.5vh, 28px) clamp(12px, 1.5vw, 24px)',
                minHeight: 'clamp(60px, 7vh, 80px)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'clamp(8px, 1vw, 14px)',
                borderRadius: '14px 14px 0 0',
              }}>
                {categoryIconSrc && (
                  <img
                    src={categoryIconSrc}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    style={{
                      width: 'clamp(34px, 3.8vh, 46px)',
                      height: 'clamp(34px, 3.8vh, 46px)',
                      objectFit: 'contain',
                      display: 'block',
                      flexShrink: 0,
                      opacity: 0.96,
                      pointerEvents: 'none',
                      userSelect: 'none',
                      filter: isMix ? 'brightness(0.72) contrast(1.28) saturate(1.18)' : isDarkMode ? 'brightness(0.96) contrast(1.08)' : 'none',
                    }}
                  />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '2px' }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: 'clamp(18px, 2.2vh, 26px)',
                    fontWeight: 900,
                    color: overlayPalette.headerText,
                    textTransform: isDarkMode ? 'uppercase' : 'none',
                    letterSpacing: isDarkMode ? '0.12em' : '0.02em',
                    fontFamily: UI_FONT,
                    textShadow: 'none',
                  }}>
                    {categoryName}
                  </h3>
                  {showHindi && (
                    <>
                      <div style={{ width: '40px', height: '1.5px', background: isDarkMode ? 'rgba(255,255,255,0.18)' : lightColors.border.light, borderRadius: '1px', margin: '2px 0' }} />
                      <span style={{
                        fontSize: getHindiFontSize(category.headingHi || categoryName, 'overlay'),
                        fontWeight: 700,
                        color: overlayPalette.hindiText,
                        fontFamily: HINDI_FONT,
                        lineHeight: 1.2,
                        letterSpacing: '0.02em',
                      }}>
                        {{ emergency: 'इमरजेंसी', position: 'पोजीशन', daily: 'रोज़' }[category.id] || categoryName}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div style={{
                background: 'transparent',
                padding: '0 clamp(14px, 1.7vw, 22px)',
                minHeight: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                justifyContent: 'flex-start',
                gap: 'clamp(4px, 0.5vw, 8px)',
                marginBottom: 'clamp(10px, 1.4vh, 18px)',
                flexShrink: 0,
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'clamp(10px, 1vw, 14px)',
                  minWidth: 0,
                  padding: '0 clamp(4px, 0.3vw, 8px)',
                }}>
                  {categoryIconSrc && (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 'clamp(70px, 7.6vh, 96px)',
                        height: 'clamp(70px, 7.6vh, 96px)',
                        display: 'block',
                        flexShrink: 0,
                        opacity: 0.9,
                        pointerEvents: 'none',
                        userSelect: 'none',
                        backgroundColor: getStandaloneIconColor(category.id, isMix, isDarkMode, isWarm),
                        WebkitMaskImage: `url(${categoryIconSrc})`,
                        maskImage: `url(${categoryIconSrc})`,
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                      }}
                    />
                  )}
                  <h3 style={{
                    margin: 0,
                    color: standaloneTone.headerText,
                    fontFamily: MEDICAL_HEADER_FONT,
                    fontSize: 'clamp(25px, 3.05vh, 36px)',
                    fontWeight: 860,
                    letterSpacing: '0',
                    lineHeight: 1.05,
                    textAlign: 'left',
                    textRendering: 'optimizeLegibility',
                  }}>
                    {getStandaloneHeading(category)}
                  </h3>
                  {showHindi && category.headingHi && (
                    <span style={{
                      color: standaloneTone.hindiText,
                      fontFamily: HINDI_FONT,
                      fontSize: 'clamp(17px, 2vh, 23px)',
                      fontWeight: 740,
                      lineHeight: 1.12,
                    }}>
                      {category.headingHi}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
              gap: presentation === 'standalone' ? 'clamp(18px, 2vh, 22px)' : 'clamp(16px, 2vh, 20px)',
              padding: presentation === 'standalone'
                ? '0 clamp(14px, 1.6vw, 22px) clamp(10px, 1.1vh, 14px)'
                : 'clamp(16px, 2vh, 24px) clamp(14px, 1.5vw, 20px)',
            }}>
              {words.length > 0 ? words.map((word, index) => {
                const buttonKey = `${idPrefix}-${category.id}-${index}`;
                const isActivated = activatedKey === buttonKey;

                return (
                  <GazeButton
                    key={buttonKey}
                    id={buttonKey}
                    onClick={() => handleSelect(word, buttonKey)}
                    isDarkMode={isDarkMode}
                    gazeEnabled={gazeEnabled}
                    gazeEnabledTimestamp={gazeEnabledTimestamp}
                    dwellCategory={category.id === 'emergency' ? 'medicalUrgent' : 'quickWord'}
                    style={{
                      width: '100%',
                      height: '100%',
                      minHeight: presentation === 'standalone' ? 'clamp(152px, 17vh, 196px)' : 'clamp(120px, 14vh, 160px)',
                      backgroundColor: presentation === 'standalone' ? standaloneTone.cardBg : overlayPalette.cardBg,
                      borderRadius: presentation === 'standalone' ? '22px' : '18px',
                      border: isActivated
                        ? (presentation === 'standalone'
                          ? `2px solid ${standaloneTone.accent}`
                          : (isMix ? `2.5px solid ${overlayPalette.activeBorder}` : isDarkMode ? `2.5px solid ${overlayPalette.activeBorder}` : `2px solid ${overlayPalette.activeBorder}`))
                        : (presentation === 'standalone' ? '1.5px solid transparent' : `1.5px solid ${overlayPalette.cardBorder}`),
                      boxShadow: isActivated
                        ? (presentation === 'standalone'
                          ? `0 0 0 2px ${standaloneTone.accentRing}, 0 8px 18px rgba(0,0,0,0.18)`
                          : overlayPalette.activeShadow)
                        : (presentation === 'standalone'
                          ? (isMix
                            ? 'inset 0 1px 0 rgba(255,255,255,0.10), 0 7px 16px rgba(0,0,0,0.18)'
                            : isDarkMode
                              ? '0 3px 10px rgba(0,0,0,0.10)'
                            : '0 3px 8px rgba(82, 66, 45, 0.06)')
                          : overlayPalette.idleShadow),
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: presentation === 'standalone'
                        ? 'clamp(16px, 1.9vh, 22px) clamp(14px, 1.4vw, 18px)'
                        : 'clamp(10px, 1.4vh, 18px) clamp(8px, 1vw, 14px)',
                      gap: presentation === 'standalone' ? '10px' : 'clamp(4px, 0.6vh, 8px)',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transform: isActivated
                        ? (presentation === 'standalone' ? 'scale(1.02)' : 'scale(1.04)')
                        : 'scale(1)',
                      transition: presentation === 'standalone'
                        ? 'transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease'
                        : 'transform 0.12s ease, box-shadow 0.12s ease, border 0.12s ease',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: presentation === 'standalone' ? '8px' : '8px', width: '100%' }}>
                      <span style={{
                        fontSize: getWordFontSize(word.en, presentation),
                        fontWeight: presentation === 'standalone' ? 760 : 800,
                        color: presentation === 'standalone' ? standaloneTone.cardText : overlayPalette.cardText,
                        fontFamily: presentation === 'standalone' ? MEDICAL_HEADER_FONT : UI_FONT,
                        textAlign: 'center',
                        lineHeight: presentation === 'standalone' ? 1.08 : 1.15,
                        letterSpacing: presentation === 'standalone' ? '0' : '0.02em',
                        wordBreak: 'break-word',
                        textShadow: 'none',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {word.en}
                      </span>

                      {showHindi && word.hi && (
                        presentation === 'standalone' ? (
                          <span style={{
                            fontSize: getHindiFontSize(word.hi, presentation),
                            fontWeight: 700,
                            color: standaloneTone.hindiText,
                            fontFamily: HINDI_FONT,
                            lineHeight: 1.14,
                            textAlign: 'center',
                          }}>
                            {word.hi}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: getHindiFontSize(word.hi, presentation),
                            fontWeight: 700,
                            color: overlayPalette.hindiText,
                            fontFamily: HINDI_FONT,
                            textAlign: 'center',
                            lineHeight: 1.2,
                            textShadow: 'none',
                          }}>
                            {word.hi}
                          </span>
                        )
                      )}
                    </div>
                  </GazeButton>
                );
              }) : (
                <div style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '20px',
                  color: isDarkMode ? 'rgba(236,237,227,0.42)' : lightColors.text.tertiary,
                  fontStyle: presentation === 'overlay' ? 'italic' : 'normal',
                  fontFamily: UI_FONT,
                  fontSize: 'clamp(15px, 1.7vh, 18px)',
                }}>
                  No words configured.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(QuickWordsGrid);
