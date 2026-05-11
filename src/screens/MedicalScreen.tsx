/**
 * GazeConnect Pro - Assistance (Daily Care)
 * =========================================
 * Two-step gaze flow:
 * 1. Select one of four large care categories.
 * 2. Select from full-width phrase/action cards.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { darkColors, lightColors, screenThemes, warmScreenTokens } from '../utils/design';
import { useGazeControl } from '../components/core/GazeControlToggle';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';
import { BellIcon } from '../components/icons/Icons';
import type { MedicalSection } from '../types/customization';
import medicalUrgentIcon from '../assets/daily-assistance/medical-urgent.png';
import bedPositionIcon from '../assets/daily-assistance/bed-position.png';
import dailyCareIcon from '../assets/daily-assistance/daily-care.png';
import symptomsIcon from '../assets/daily-assistance/symptoms.png';

interface MedicalScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

interface MedItem { en: string; hi: string; urgent?: boolean; }

interface CareIconProps {
  size?: number;
  color?: string;
  secondaryColor?: string;
  strokeWidth?: number;
}

const ClinicalAirwayIcon: React.FC<CareIconProps> = ({
  size = 64,
  color = '#855E5A',
  secondaryColor = '#8A6B3A',
  strokeWidth = 2.2,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    aria-hidden="true"
    style={{ display: 'block' }}
  >
    <g
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M32 10v12" />
      <path d="M32 22c-2.7 3.3-5.6 5.7-9 7.4" />
      <path d="M32 22c2.7 3.3 5.6 5.7 9 7.4" />
      <path d="M27.5 16.2c-6.1 4.9-9.3 13.8-9 22 .2 4.7 2.9 6.8 6.5 5.1l7-3.1V18.8c-1.7-.1-3.2-.9-4.5-2.6Z" />
      <path d="M36.5 16.2c6.1 4.9 9.3 13.8 9 22-.2 4.7-2.9 6.8-6.5 5.1l-7-3.1V18.8c1.7-.1 3.2-.9 4.5-2.6Z" />
      <path d="M25.5 27.8v8.8" />
      <path d="M25.5 31.2l-3.8 2.8" />
      <path d="M25.5 31.2l3.2 2.3" />
      <path d="M38.5 27.8v8.8" />
      <path d="M38.5 31.2l3.8 2.8" />
      <path d="M38.5 31.2l-3.2 2.3" />
    </g>
    <path
      d="M43.8 34h4.2l1.4-2.8 2.3 5.6 1.8-3.9H59"
      stroke={secondaryColor}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PositionCareIcon: React.FC<CareIconProps> = ({
  size = 64,
  color = '#7E6540',
  strokeWidth = 2.35,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ display: 'block' }}
  >
    <path d="M10 18v30" />
    <path d="M13 43.5h39" />
    <path d="M14.5 38.8h31" />
    <path d="M18 43.5v5.2" />
    <path d="M45 43.5v5.2" />
    <circle cx="18" cy="50.8" r="1.7" />
    <circle cx="45" cy="50.8" r="1.7" />
    <path d="M17.5 31.5l8.5-8.3h11.2l8.3 8.3" />
    <path d="M26 23.2h11.2" />
    <circle cx="18.2" cy="21.5" r="3.3" />
    <path d="M21.2 25.2l6.3 6.1h10.8" />
    <path d="M38.3 31.3l5.7 4.1" />
    <path d="M12.5 38.8v-3.8" opacity="0.72" />
    <path d="M46 38.8v-3.8" opacity="0.72" />
    <path d="M56 18.5v18" />
    <path d="m52.8 21.8 3.2-3.3 3.2 3.3" />
    <path d="m52.8 33.2 3.2 3.3 3.2-3.3" />
  </svg>
);

const DailyCareIcon: React.FC<CareIconProps> = ({ size = 64, color = 'currentColor', strokeWidth = 2.4 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="32" cy="32" r="11.5" />
    <path d="M32 8.5v7" />
    <path d="M32 48.5v7" />
    <path d="M8.5 32h7" />
    <path d="M48.5 32h7" />
    <path d="m15.4 15.4 5 5" />
    <path d="m43.6 43.6 5 5" />
    <path d="m48.6 15.4-5 5" />
    <path d="m20.4 43.6-5 5" />
    <path d="M23.4 10.8 26 16.5" />
    <path d="M40.6 10.8 38 16.5" />
    <path d="M23.4 53.2 26 47.5" />
    <path d="M40.6 53.2 38 47.5" />
  </svg>
);

const SymptomsCareIcon: React.FC<CareIconProps> = ({ size = 64, color = 'currentColor', strokeWidth = 2.4 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="17" y="12" width="30" height="42" rx="5.5" />
    <path d="M25 12v-1.5A3.5 3.5 0 0 1 28.5 7h7a3.5 3.5 0 0 1 3.5 3.5V12" />
    <path d="M24 27h5l2.4-6.2 4.4 15 3.1-8.8H45" />
    <path d="M24 42h18" />
    <path d="M24 49h12" />
  </svg>
);

const BackOnlyIcon: React.FC<CareIconProps> = ({ size = 64, color = 'currentColor', strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M36.5 18.5 23 32l13.5 13.5" />
    <path d="M24.5 32H49" />
  </svg>
);

const SECTION_ICONS: Record<string, React.FC<any>> = {
  airway: ClinicalAirwayIcon,
  urgent: ClinicalAirwayIcon,
  bed: PositionCareIcon,
  daily: DailyCareIcon,
  symptoms: SymptomsCareIcon,
};

const LANDING_SECTION_ICON_ASSETS: Record<string, string> = {
  airway: medicalUrgentIcon,
  urgent: medicalUrgentIcon,
  bed: bedPositionIcon,
  daily: dailyCareIcon,
  symptoms: symptomsIcon,
};

const getLandingIconSize = (sectionId: string) => {
  if (sectionId === 'bed') return 220;
  if (sectionId === 'airway' || sectionId === 'urgent') return 136;
  return 132;
};

const getLandingIconMaxSize = (sectionId: string) => {
  if (sectionId === 'bed') return 'clamp(170px, 17vh, 220px)';
  return 'clamp(132px, 13vh, 180px)';
};

const ACCESSIBLE_FONT = "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif";

const DAILY_ASSISTANCE_ICON_COLORS = {
  dark: {
    airway: '#5A7D75',
    urgent: '#5A7D75',
    bed: '#9C7A4E',
    daily: '#B08A45',
    symptoms: '#789D91',
  },
  mix: {
    airway: '#496D64',
    urgent: '#496D64',
    bed: '#765431',
    daily: '#876116',
    symptoms: '#4E7B70',
  },
  light: {
    airway: '#50746B',
    urgent: '#50746B',
    bed: '#785F3F',
    daily: '#8F6F36',
    symptoms: '#5F8278',
  },
  warm: {
    airway: '#7A312E',   // deeper warm maroon — urgency
    urgent: '#7A312E',
    bed: '#4F7388',      // deeper dusty sky blue — position/comfort
    daily: '#5F7C58',    // deeper sage — routine calm
    symptoms: '#A56D55', // deeper warm coral — body symptoms
  },
} as const;

const getLandingSectionColor = (id: string, isMix: boolean, isWarmMode: boolean, isWarm: boolean = false) => {
  const mode = isMix ? 'mix' : isWarm ? 'warm' : isWarmMode ? 'dark' : 'light';
  return DAILY_ASSISTANCE_ICON_COLORS[mode][id as keyof typeof DAILY_ASSISTANCE_ICON_COLORS.dark] || DAILY_ASSISTANCE_ICON_COLORS[mode].daily;
};

const titleEn = (section: MedicalSection) => {
  if (section.id === 'airway' || section.id === 'urgent') return 'Medical / Urgent';
  return (section.title || '').replace(/[\u0900-\u097F\s]+$/, '').trim();
};

const landingTitleEn = (section: MedicalSection) => {
  if (section.id === 'airway' || section.id === 'urgent') return 'Medical / Urgent';
  if (section.id === 'bed') return 'Bed & Position';
  if (section.id === 'daily') return 'Daily Care';
  if (section.id === 'symptoms') return 'Symptoms';
  return titleEn(section);
};

const PhraseButton: React.FC<{
  item: MedItem;
  isDarkMode: boolean;
  showHindi: boolean;
  onActivate: (text: string) => void;
  gazeEnabled: boolean;
  timestamp: number;
  cardBg: string;
  cardBorder: string;
  cardText: string;
  cardShadow: string;
  dividerColor: string;
  hindiColor: string;
}> = ({
  item, isDarkMode, showHindi, onActivate, gazeEnabled, timestamp,
  cardBg, cardBorder, cardText, cardShadow, dividerColor, hindiColor,
}) => (
  <GazeButton
    id={`phrase-${item.en}`}
    onClick={() => onActivate(item.en)}
    gazeEnabled={gazeEnabled}
    gazeEnabledTimestamp={timestamp}
    isDarkMode={isDarkMode}
    dwellCategory={item.urgent ? 'medicalUrgent' : 'phraseButton'}
    style={{
      width: '100%',
      height: '100%',
      minHeight: 0,
      borderRadius: '18px',
      background: cardBg,
      border: cardBorder,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'clamp(20px, 2.6vh, 30px) clamp(22px, 2.4vw, 38px)',
      gap: '8px',
      textAlign: 'center',
      boxShadow: cardShadow,
    }}
  >
    <span style={{
      fontSize: item.en.length > 34 ? 'clamp(24px, 2.7vh, 32px)' : 'clamp(27px, 3vh, 36px)',
      fontWeight: 760,
      color: cardText,
      fontFamily: ACCESSIBLE_FONT,
      lineHeight: 1.12,
      letterSpacing: '0',
      textShadow: isDarkMode ? '0 1px 1px rgba(0,0,0,0.10)' : 'none',
      overflowWrap: 'anywhere',
    }}>
      {item.en}
    </span>
    {showHindi && item.hi && (
      <>
        <div style={{ width: '36px', height: '1.5px', background: dividerColor, borderRadius: '1px', margin: '5px auto 2px' }} />
        <span style={{
          fontSize: 'clamp(22px, 2.7vh, 34px)',
          fontWeight: 800,
          color: hindiColor,
          fontFamily: "'Noto Sans Devanagari', sans-serif",
          lineHeight: 1.25,
        }}>
          {item.hi}
        </span>
      </>
    )}
  </GazeButton>
);

const MedicalScreen: React.FC<MedicalScreenProps> = ({
  onNavigate, onSpeak, isDarkMode = true, showHindi = false,
}) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(null);
  const [lastSpoken, setLastSpoken] = useState('');
  const lastSpokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight, isMix, isWarm } = useTheme();
  const { medicalSections } = useCustomization();

  const isWarmMode = isDarkMode && !isLight;
  const pageBg = isMix ? '#120E0B' : isWarm ? warmScreenTokens.medical.pageBg : isWarmMode ? '#131412' : colors.background.primary;
  const titleText = isMix ? '#FFF0D2' : isWarm ? warmScreenTokens.medical.cardText : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const cardBg = isMix ? '#B6A17A' : isWarm ? warmScreenTokens.medical.cardBg : isWarmMode ? screenThemes.medical.cardBg : colors.background.elevated;
  const cardBorder = isMix ? '1.5px solid rgba(70,52,32,0.56)' : isWarm ? warmScreenTokens.medical.cardBorder : isWarmMode ? screenThemes.medical.cardBorder : `1.5px solid ${colors.border.light}`;
  const cardText = isMix ? '#180F08' : isWarm ? warmScreenTokens.medical.cardText : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const cardShadow = isWarm ? warmScreenTokens.medical.cardShadow : isWarmMode ? '0 8px 18px rgba(0,0,0,0.22)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)';
  // v4 light-mode fix: #EFE7DA had near-equal RGB (239,231,218) → reads as
  // dusty-rose on most monitors. Replaced with #E8D4B0 — confident warm sand
  // with strong yellow lead, never reads pink. The back-card pastel sage
  // (#DCE2C8) replaced with deeper #D2DCBC — Sarvam/Tobii-tier muted sage.
  const sectionCardBg = isMix ? '#B6A17A' : isWarm ? warmScreenTokens.medical.sectionCardBg : isWarmMode ? 'rgba(27, 31, 27, 0.92)' : '#E8D4B0';
  const sectionBackCardBg = isMix ? '#28321F' : isWarm ? warmScreenTokens.medical.sectionBackCardBg : isWarmMode ? 'rgba(25, 31, 24, 0.98)' : '#D2DCBC';
  const sectionCardBorder = '1.5px solid transparent';
  const sectionCardShadow = isWarm
    ? warmScreenTokens.medical.sectionShadow
    : isWarmMode
      ? 'inset 0 1px 0 rgba(255,255,255,0.025), 0 9px 22px rgba(0,0,0,0.20)'
      : '0 6px 16px rgba(95, 76, 52, 0.10), 0 1px 2px rgba(95, 76, 52, 0.06)';
  const dividerColor = isMix ? 'rgba(91,74,51,0.34)' : isWarm ? warmScreenTokens.medical.dividerColor : isWarmMode ? screenThemes.medical.headerDivider : colors.border.light;
  const hindiColor = isMix ? '#493B2E' : isWarm ? warmScreenTokens.medical.hindiColor : isWarmMode ? screenThemes.phrases.hindiText : colors.text.secondary;
  const backIconColor = isMix ? '#9BA76D' : isWarm ? warmScreenTokens.medical.backIconColor : isWarmMode ? '#879464' : '#5C6B47';

  const activeSection = activeSectionIndex === null ? null : medicalSections[activeSectionIndex];

  useEffect(() => () => {
    if (lastSpokenTimerRef.current) clearTimeout(lastSpokenTimerRef.current);
  }, []);

  const handleActivate = useCallback((text: string) => {
    onSpeak(text);
    setLastSpoken(text);
    if (lastSpokenTimerRef.current) clearTimeout(lastSpokenTimerRef.current);
    lastSpokenTimerRef.current = setTimeout(() => setLastSpoken(''), 4200);
  }, [onSpeak]);

  return (
    <div className={`medical-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : isWarm ? ' theme-warm' : ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: pageBg,
      overflow: 'hidden',
      padding: '4px 20px 6px 20px',
    }}>
      <GlobalNavBar currentPage="medical" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} />

      {lastSpoken && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 9000,
          background: isDarkMode ? 'rgba(0, 0, 0, 0.18)' : 'rgba(43, 38, 34, 0.08)',
        }}>
          <div style={{
            minWidth: 'clamp(460px, 46vw, 820px)',
            maxWidth: 'min(86vw, 980px)',
            padding: 'clamp(30px, 4.5vh, 54px) clamp(46px, 6vw, 92px)',
            backgroundColor: isMix ? '#2B251B' : isWarmMode ? 'rgba(32,34,30,0.98)' : lightColors.background.elevated,
            border: isMix ? '2px solid rgba(180,147,98,0.48)' : isWarmMode ? '2px solid rgba(143,174,114,0.42)' : `2px solid ${lightColors.border.main}`,
            borderRadius: '28px',
            color: isMix ? '#FFFCF1' : isWarmMode ? '#ECEDE3' : lightColors.text.primary,
            fontSize: 'clamp(42px, 6vh, 72px)',
            fontWeight: 820,
            lineHeight: 1.12,
            textAlign: 'center',
            fontFamily: ACCESSIBLE_FONT,
            boxShadow: isDarkMode ? '0 18px 70px rgba(0,0,0,0.58)' : '0 12px 34px rgba(139,121,104,0.16)',
            letterSpacing: '0',
          }}>
            {lastSpoken}
          </div>
        </div>
      )}

      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        marginTop: 'clamp(18px, 2.2vh, 30px)',
        padding: '0 clamp(44px, 5vw, 86px) clamp(86px, 10vh, 124px)',
      }}>
        {activeSectionIndex === null ? (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginBottom: 'clamp(18px, 2.4vh, 28px)',
            }}>
              <BellIcon size={42} color={getLandingSectionColor('daily', isMix, isWarmMode, isWarm)} strokeWidth={2.1} />
              <h2 style={{
                margin: 0,
                color: titleText,
                fontFamily: ACCESSIBLE_FONT,
                fontSize: 'clamp(32px, 4vh, 48px)',
                fontWeight: 820,
                lineHeight: 1,
              }}>
                Daily Assistance
              </h2>
            </div>

            <div style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gridAutoRows: 'minmax(clamp(210px, 28vh, 310px), 1fr)',
              gap: 'clamp(22px, 3vh, 34px)',
            }}>
              {medicalSections.map((sec, idx) => {
                const color = getLandingSectionColor(sec.id, isMix, isWarmMode, isWarm);
                const landingIconSrc = LANDING_SECTION_ICON_ASSETS[sec.id] || dailyCareIcon;
                const landingIconSize = getLandingIconSize(sec.id);
                const landingIconMaxSize = getLandingIconMaxSize(sec.id);

                return (
                  <GazeButton
                    key={sec.id}
                    id={`assist-category-${sec.id}`}
                    onClick={() => setActiveSectionIndex(idx)}
                    gazeEnabled={isGazeEnabled}
                    gazeEnabledTimestamp={lastEnabledTimestamp}
                    isDarkMode={isDarkMode}
                    dwellCategory="navigationButton"
                    contentFill
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      width: '100%',
                      height: '100%',
                      minHeight: 'clamp(210px, 28vh, 310px)',
                      background: cardBg,
                      border: cardBorder,
                      borderRadius: '22px',
                      boxShadow: cardShadow,
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      padding: 'clamp(24px, 3vh, 38px) clamp(36px, 4.5vw, 78px)',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      left: 'clamp(34px, 3.2vw, 52px)',
                      top: 'clamp(34px, 4vh, 54px)',
                      bottom: 'clamp(34px, 4vh, 54px)',
                      width: '2px',
                      borderRadius: '999px',
                      background: color,
                      opacity: 0.62,
                    }} />
                    <div style={{
                      flex: '0 0 34%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingLeft: 'clamp(34px, 3.6vw, 60px)',
                      background: 'transparent',
                      border: 'none',
                      boxShadow: 'none',
                    }}>
                      <img
                        src={landingIconSrc}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        style={{
                          width: landingIconSize,
                          height: landingIconSize,
                          maxWidth: landingIconMaxSize,
                          maxHeight: landingIconMaxSize,
                          objectFit: 'contain',
                          display: 'block',
                          userSelect: 'none',
                          pointerEvents: 'none',
                          mixBlendMode: 'normal',
                          filter: isMix ? 'brightness(0.72) contrast(1.28) saturate(1.18)' : 'none',
                          background: 'transparent',
                          border: 'none',
                          boxShadow: 'none',
                        }}
                      />
                    </div>
                    <div style={{
                      flex: '1 1 0',
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      justifyContent: 'center',
                      paddingLeft: 'clamp(10px, 1.6vw, 28px)',
                      gap: showHindi ? '10px' : 0,
                    }}>
                      <span style={{
                        color: cardText,
                        fontFamily: ACCESSIBLE_FONT,
                        fontSize: 'clamp(30px, 3.7vh, 43px)',
                        fontWeight: 820,
                        lineHeight: 1.08,
                        letterSpacing: '0',
                      }}>
                        {landingTitleEn(sec)}
                      </span>
                      {showHindi && (
                        <span style={{
                          color: hindiColor,
                          fontFamily: "'Noto Sans Devanagari', sans-serif",
                          fontSize: 'clamp(24px, 3vh, 34px)',
                          fontWeight: 800,
                          lineHeight: 1.2,
                        }}>
                          {sec.titleHi}
                        </span>
                      )}
                    </div>
                  </GazeButton>
                );
              })}
            </div>
          </>
        ) : activeSection && (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(18px, 2vw, 30px)',
              marginBottom: 'clamp(14px, 1.8vh, 22px)',
              paddingLeft: '4px',
            }}>
              <h2 style={{
                fontSize: 'clamp(34px, 4.1vh, 48px)',
                fontWeight: 820,
                color: titleText,
                margin: 0,
                fontFamily: ACCESSIBLE_FONT,
                lineHeight: 1.02,
                letterSpacing: '0',
              }}>
                {titleEn(activeSection)}
              </h2>
            </div>

            <div style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
              gap: 'clamp(18px, 2.35vh, 28px)',
              overflow: 'hidden',
              alignContent: 'stretch',
              padding: '2px 8px 0 8px',
            }}>
              <GazeButton
                id="assist-back-categories-card"
                onClick={() => setActiveSectionIndex(null)}
                gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                isDarkMode={isDarkMode}
                dwellCategory="navigationButton"
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  width: '100%',
                  height: '100%',
                  minHeight: 0,
                  borderRadius: '18px',
                  background: sectionBackCardBg,
                  border: sectionCardBorder,
                  boxShadow: sectionCardShadow,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 'clamp(18px, 2.4vh, 28px) clamp(32px, 3.2vw, 56px)',
                  fontFamily: ACCESSIBLE_FONT,
                  textAlign: 'left',
                }}
                ariaLabel="Back to Daily Assistance categories"
                contentFill
              >
                <div style={{
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: 'translateX(clamp(38px, 4.8vw, 82px))',
                  opacity: 0.96,
                }}>
                  <BackOnlyIcon size={150} color={backIconColor} strokeWidth={4.15} />
                </div>
              </GazeButton>

              {activeSection.items.slice(0, 8).map((item) => (
                <PhraseButton
                  key={item.en}
                  item={item}
                  isDarkMode={isDarkMode}
                  showHindi={showHindi}
                  onActivate={handleActivate}
                  gazeEnabled={isGazeEnabled}
                  timestamp={lastEnabledTimestamp}
                  cardBg={sectionCardBg}
                  cardBorder={sectionCardBorder}
                  cardText={cardText}
                  cardShadow={sectionCardShadow}
                  dividerColor={dividerColor}
                  hindiColor={hindiColor}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default React.memo(MedicalScreen);
