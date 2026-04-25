/**
 * GazeConnect Pro - Assistance (Daily Care)
 * =========================================
 * Two-step gaze flow:
 * 1. Select one of four large care categories.
 * 2. Select from full-width phrase/action cards.
 */
import React, { useState, useCallback } from 'react';
import { darkColors, lightColors, screenThemes } from '../utils/design';
import { useGazeControl } from '../components/core/GazeControlToggle';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';
import type { MedicalSection } from '../types/customization';

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
  strokeWidth?: number;
}

const ClinicalAirwayIcon: React.FC<CareIconProps> = ({ size = 64, color = 'currentColor', strokeWidth = 1.7 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M25 16c-6 7.5-10 18.6-10 30 0 4 2.5 6.1 6.2 5l10.8-3.4V18.5c-2.6 0-4.8-.9-7-2.5Z" />
    <path d="M39 16c6 7.5 10 18.6 10 30 0 4-2.5 6.1-6.2 5L32 47.6V18.5c2.6 0 4.8-.9 7-2.5Z" />
    <path d="M32 18.5V10" />
    <path d="M24 35c3.2-1 5.6-3.2 8-6.8" opacity="0.68" />
    <path d="M40 35c-3.2-1-5.6-3.2-8-6.8" opacity="0.68" />
    <path d="M10 13h8l3-5 5 10 4-7h7" />
    <path d="M41 13h13" opacity="0.72" />
  </svg>
);

const PositionCareIcon: React.FC<CareIconProps> = ({ size = 64, color = 'currentColor', strokeWidth = 1.7 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 46h37a8 8 0 0 0 8-8v-4" />
    <path d="M14 39h27a7 7 0 0 0 7-7v-5" />
    <path d="M17 39 12 21a5.5 5.5 0 0 1 10.5-3.2L28 36" />
    <path d="M23 29h15a6 6 0 0 1 6 6v4" />
    <path d="M28 36h18" />
    <path d="M17 50h32" />
    <path d="M20 50v5" />
    <path d="M46 50v5" />
    <path d="M15 55h8" opacity="0.75" />
    <path d="M42 55h8" opacity="0.75" />
    <path d="M48 9h12v12H48z" />
    <path d="M50.5 15h2.5l1.3-2.6 2 5.2 1.2-2.6H60" />
    <path d="M60 21v31" />
    <path d="M56 52h8" />
  </svg>
);

const DailyCareIcon: React.FC<CareIconProps> = ({ size = 64, color = 'currentColor', strokeWidth = 1.7 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="32" cy="32" r="12" />
    <path d="M32 7v8" />
    <path d="M32 49v8" />
    <path d="M7 32h8" />
    <path d="M49 32h8" />
    <path d="m14.4 14.4 5.6 5.6" />
    <path d="m44 44 5.6 5.6" />
    <path d="m49.6 14.4-5.6 5.6" />
    <path d="m20 44-5.6 5.6" />
    <path d="M21 10.5 24 17" opacity="0.72" />
    <path d="M43 10.5 40 17" opacity="0.72" />
    <path d="M21 53.5 24 47" opacity="0.72" />
    <path d="M43 53.5 40 47" opacity="0.72" />
  </svg>
);

const SymptomsCareIcon: React.FC<CareIconProps> = ({ size = 64, color = 'currentColor', strokeWidth = 1.7 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 11h20" />
    <path d="M24 11v-1a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v1" />
    <path d="M17 11h30a4 4 0 0 1 4 4v40a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4V15a4 4 0 0 1 4-4Z" />
    <path d="M22 24h20" />
    <path d="M22 34h16" />
    <path d="M22 44h12" />
    <circle cx="47" cy="47" r="10" />
    <path d="m42.5 47 3 3 6-7" />
  </svg>
);

const BackOnlyIcon: React.FC<CareIconProps> = ({ size = 64, color = 'currentColor', strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M34 18 20 32l14 14" />
    <path d="M21 32h24" />
  </svg>
);

const SECTION_ICONS: Record<string, React.FC<any>> = {
  airway: ClinicalAirwayIcon,
  urgent: ClinicalAirwayIcon,
  bed: PositionCareIcon,
  daily: DailyCareIcon,
  symptoms: SymptomsCareIcon,
};

const DEFAULT_SECTION_COLORS: Record<string, string> = {
  airway: '#9F6756',
  urgent: '#9F6756',
  bed: '#A8844D',
  daily: '#B28F52',
  symptoms: '#A97886',
};

const ACCESSIBLE_FONT = "'Inter', 'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif";

const ICON_BADGE_BG_DARK: Record<string, string> = {
  airway: '#27201D',
  urgent: '#27201D',
  bed: '#292319',
  daily: '#28261B',
  symptoms: '#282023',
};

const ICON_BADGE_BG_MIX: Record<string, string> = {
  airway: '#BFA889',
  urgent: '#BFA889',
  bed: '#C2AD83',
  daily: '#C7B487',
  symptoms: '#BCA0A1',
};

const ICON_BADGE_BG_LIGHT: Record<string, string> = {
  airway: '#E6D7CB',
  urgent: '#E6D7CB',
  bed: '#E7D9BF',
  daily: '#E5D9BD',
  symptoms: '#E5D3D7',
};

const getSectionColor = (sec: { id: string; color?: string }) =>
  sec.color || DEFAULT_SECTION_COLORS[sec.id] || screenThemes.medical.daily;

const titleEn = (section: MedicalSection) =>
  (section.title || '').replace(/[\u0900-\u097F\s]+$/, '').trim();

const PhraseButton: React.FC<{
  item: MedItem;
  color: string;
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
  item, color, isDarkMode, showHindi, onActivate, gazeEnabled, timestamp,
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
      borderRadius: '16px',
      background: cardBg,
      border: item.urgent ? `1.5px solid ${color}88` : cardBorder,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'clamp(18px, 2.4vh, 28px) clamp(18px, 2vw, 30px)',
      gap: '8px',
      textAlign: 'center',
      boxShadow: cardShadow,
    }}
  >
    <span style={{
      fontSize: 'clamp(24px, 2.8vh, 38px)',
      fontWeight: 780,
      color: cardText,
      fontFamily: ACCESSIBLE_FONT,
      lineHeight: 1.15,
      letterSpacing: '0',
      textShadow: isDarkMode ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
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
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight, isMix } = useTheme();
  const { medicalSections } = useCustomization();

  const isWarmMode = isDarkMode && !isLight;
  const pageBg = isMix ? '#17130F' : isWarmMode ? '#131412' : colors.background.primary;
  const titleText = isMix ? '#F0E2C4' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const cardBg = isMix ? '#C4B28E' : isWarmMode ? screenThemes.medical.cardBg : colors.background.elevated;
  const cardBorder = isMix ? '1.5px solid rgba(91,74,51,0.38)' : isWarmMode ? screenThemes.medical.cardBorder : `1.5px solid ${colors.border.light}`;
  const cardText = isMix ? '#23180C' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const cardShadow = isWarmMode ? '0 8px 18px rgba(0,0,0,0.22)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)';
  const dividerColor = isMix ? 'rgba(91,74,51,0.34)' : isWarmMode ? screenThemes.medical.headerDivider : colors.border.light;
  const hindiColor = isMix ? '#493B2E' : isWarmMode ? screenThemes.phrases.hindiText : colors.text.secondary;
  const backCardBg = isMix ? '#2B251B' : isWarmMode ? '#181A16' : '#E1D6C2';
  const backIconColor = isMix ? '#E0C789' : isWarmMode ? '#A9B487' : '#6E7F58';
  const backCardText = isMix ? '#F0E2C4' : isWarmMode ? '#ECEDE3' : colors.text.primary;

  const activeSection = activeSectionIndex === null ? null : medicalSections[activeSectionIndex];
  const activeColor = activeSection ? getSectionColor(activeSection) : (isMix ? '#B49362' : '#B9904D');
  const ActiveIcon = activeSection ? (SECTION_ICONS[activeSection.id] || DailyCareIcon) : DailyCareIcon;

  const handleActivate = useCallback((text: string) => {
    onSpeak(text);
    setLastSpoken(text);
  }, [onSpeak]);

  return (
    <div className={`medical-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : ''}`} style={{
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
          position: 'absolute',
          top: '80px',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          <div style={{
            padding: '8px 24px',
            backgroundColor: colors.success.subtle,
            border: `1px solid ${colors.success.main}`,
            borderRadius: '20px',
            color: colors.success.main,
            fontSize: 'clamp(13px, 1.6vh, 18px)',
            fontWeight: 700,
            boxShadow: isDarkMode ? '0 4px 12px rgba(0,0,0,0.2)' : cardShadow,
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
              <DailyCareIcon size={42} color={isMix ? '#B49362' : isWarmMode ? '#B9904D' : lightColors.warning.main} />
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
                const Icon = SECTION_ICONS[sec.id] || DailyCareIcon;
                const color = getSectionColor(sec);
                const badgeBg = isMix
                  ? ICON_BADGE_BG_MIX[sec.id] || '#BFA889'
                  : isWarmMode
                    ? ICON_BADGE_BG_DARK[sec.id] || '#27201D'
                    : ICON_BADGE_BG_LIGHT[sec.id] || '#E6D7CB';
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
                      width: '100%',
                      height: '100%',
                      minHeight: 'clamp(210px, 28vh, 310px)',
                      background: cardBg,
                      border: cardBorder,
                      borderRadius: '18px',
                      boxShadow: cardShadow,
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 'clamp(24px, 3vh, 38px) clamp(36px, 4.5vw, 78px)',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      flex: '0 0 38%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <div style={{
                        width: 'clamp(112px, 13.5vh, 152px)',
                        height: 'clamp(112px, 13.5vh, 152px)',
                        borderRadius: '36px',
                        border: `1.5px solid ${color}`,
                        background: badgeBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: 'none',
                      }}>
                        <Icon size={90} color={color} strokeWidth={1.5} />
                      </div>
                    </div>
                    <div style={{
                      flex: '1 1 0',
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      justifyContent: 'center',
                      paddingLeft: 'clamp(22px, 3vw, 54px)',
                      gap: showHindi ? '10px' : 0,
                    }}>
                      <span style={{
                        color: cardText,
                        fontFamily: ACCESSIBLE_FONT,
                        fontSize: 'clamp(28px, 3.5vh, 40px)',
                        fontWeight: 780,
                        lineHeight: 1.08,
                        letterSpacing: '0',
                      }}>
                        {titleEn(sec)}
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
              marginBottom: 'clamp(18px, 2.3vh, 28px)',
              paddingLeft: '4px',
            }}>
              <ActiveIcon size={44} color={activeColor} strokeWidth={1.55} />
              <h2 style={{
                fontSize: 'clamp(30px, 3.8vh, 46px)',
                fontWeight: 820,
                color: titleText,
                margin: 0,
                fontFamily: ACCESSIBLE_FONT,
                lineHeight: 1,
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
              gap: 'clamp(16px, 2.2vh, 26px)',
              overflow: 'hidden',
              alignContent: 'stretch',
              padding: '4px 8px 0 8px',
            }}>
              <GazeButton
                id="assist-back-categories-card"
                onClick={() => setActiveSectionIndex(null)}
                gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                isDarkMode={isDarkMode}
                dwellCategory="navigationButton"
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 0,
                  borderRadius: '16px',
                  background: backCardBg,
                  border: `1.5px solid ${backIconColor}88`,
                  boxShadow: isDarkMode ? '0 8px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.025)' : cardShadow,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 'clamp(18px, 2.4vh, 28px) clamp(30px, 3.8vw, 58px)',
                  fontFamily: ACCESSIBLE_FONT,
                  textAlign: 'left',
                }}
                ariaLabel="Back to Daily Assistance categories"
                contentFill
              >
                <div style={{
                  flex: '0 0 38%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <div style={{
                    width: 'clamp(86px, 10vh, 124px)',
                    height: 'clamp(86px, 10vh, 124px)',
                    borderRadius: '30px',
                    border: `1.5px solid ${backIconColor}`,
                    background: isMix ? '#292318' : isWarmMode ? '#20221B' : '#E6DCC9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <BackOnlyIcon size={72} color={backIconColor} strokeWidth={2.2} />
                  </div>
                </div>
                <div style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  paddingLeft: 'clamp(20px, 3vw, 50px)',
                }}>
                  <span style={{
                    color: backCardText,
                    fontFamily: ACCESSIBLE_FONT,
                    fontSize: 'clamp(28px, 3.5vh, 40px)',
                    fontWeight: 780,
                    lineHeight: 1.08,
                  }}>
                    Back
                  </span>
                </div>
              </GazeButton>

              {activeSection.items.slice(0, 8).map((item) => (
                <PhraseButton
                  key={item.en}
                  item={item}
                  color={activeColor}
                  isDarkMode={isDarkMode}
                  showHindi={showHindi}
                  onActivate={handleActivate}
                  gazeEnabled={isGazeEnabled}
                  timestamp={lastEnabledTimestamp}
                  cardBg={cardBg}
                  cardBorder={cardBorder}
                  cardText={cardText}
                  cardShadow={cardShadow}
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
