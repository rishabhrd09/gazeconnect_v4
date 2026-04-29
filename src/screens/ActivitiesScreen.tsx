/**
 * GazeConnect Pro - Activities Screen (v4.0)
 * ===========================================
 * Re-designed to match Phrases Screen aesthetic.
 * - Left Sidebar for Categories (TV, YouTube, Alexa)
 * - Spacious Grid for Items (Primary Content)
 * - Beautiful Gradient Cards
 * - Clear, Large Fonts
 */
import React, { useState, useCallback, useRef } from 'react';
import { darkColors, lightColors, mixColors, screenThemes } from '../utils/design';
import GazeButton from '../components/core/GazeButton';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';

// Custom Icons for Sidebar
const TvIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
    <polyline points="17 2 12 7 7 2" />
  </svg>
);

const YoutubeIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill={color} stroke="none" />
  </svg>
);

const AlexaIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

// Colors from design.ts screenThemes
const SELECTED_COLOR = screenThemes.activities.selectedColor;
const SIDEBAR_BG = screenThemes.activities.sidebarBg;
const ACCENT_TEAL = screenThemes.activities.accentTeal;
const ENGLISH_UI_FONT = "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif";
const HINDI_UI_FONT = "'Noto Sans Devanagari', 'Mukta', 'Mangal', 'Segoe UI', sans-serif";

// Icon mapping for activity categories
const CATEGORY_ICONS: Record<string, React.FC<any>> = {
  tv: TvIcon,
  youtube: YoutubeIcon,
  alexa: AlexaIcon,
};

// Extracted to module scope to avoid re-creation on every render
const ActivityCategoryButton: React.FC<{
  cat: { id: string; name: string };
  icon: React.FC<any>;
  selectedCategory: string;
  onSelect: (key: string) => void;
  isDarkMode: boolean;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  textColor: string;
  inactiveIconColor?: string;
  selectedBg?: string;
}> = ({
  cat, icon, selectedCategory, onSelect, isDarkMode, gazeEnabled, gazeEnabledTimestamp,
  textColor, inactiveIconColor: inactiveIconColorOverride, selectedBg: selectedBgOverride,
}) => {
  const isSelected = selectedCategory === cat.id;
  const Icon = icon;
  const selectedColor = isDarkMode ? SELECTED_COLOR : lightColors.warning.main;
  const inactiveIconColor = inactiveIconColorOverride || (isDarkMode ? ACCENT_TEAL : lightColors.text.tertiary);
  const selectedBg = selectedBgOverride || (isDarkMode ? screenThemes.activities.selectedBg : lightColors.background.tertiary);
  return (
    <GazeButton
      id={`cat-${cat.id}`}
      size="lg"
      variant={isSelected ? 'primary' : 'default'}
      onClick={() => onSelect(cat.id)}
      isDarkMode={isDarkMode}
      gazeEnabled={gazeEnabled}
      gazeEnabledTimestamp={gazeEnabledTimestamp}
      style={{
        width: '100%',
        backgroundColor: isSelected ? selectedBg : 'transparent',
        minHeight: 'clamp(118px, 13.2vh, 150px)',
        padding: 'clamp(22px, 2.6vh, 30px) clamp(16px, 1.5vw, 24px)',
        border: 'none',
        borderLeft: isSelected ? `5px solid ${selectedColor}` : '5px solid transparent',
        borderRadius: '0 16px 16px 0',
        transition: 'all 180ms ease',
        justifyContent: 'flex-start',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
        <Icon size={26} color={isSelected ? selectedColor : inactiveIconColor} />
        <span style={{
          fontSize: 'clamp(18px, 1.75vw, 26px)',
          fontWeight: isSelected ? 700 : 600,
          color: isSelected ? selectedColor : textColor,
          fontFamily: ENGLISH_UI_FONT,
          lineHeight: 1.15,
        }}>
          {cat.name}
        </span>
      </div>
    </GazeButton>
  );
};

const ActivitiesScreen: React.FC<{ onNavigate: (s: string) => void; onSpeak: (t: string) => void; isDarkMode?: boolean; showHindi?: boolean; }> = ({
  onNavigate, onSpeak, isDarkMode = true, showHindi = false,
}) => {
  const { activityCategories } = useCustomization();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activatedIdx, setActivatedIdx] = useState<number | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colors = isDarkMode ? darkColors : lightColors;
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight, isMix } = useTheme();
  const isWarmMode = isDarkMode && !isLight;
  const pageBg = isMix ? '#17130F' : isWarmMode ? '#131412' : colors.background.primary;
  const titleText = isMix ? '#F0E2C4' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const cardBg = isMix ? mixColors.home.tileSurfaces.ac : isWarmMode ? screenThemes.activities.cardBg : colors.background.secondary;
  const cardText = isMix ? mixColors.home.text : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const cardBorder = isMix ? `1.5px solid ${mixColors.home.cardBorder}` : isWarmMode ? screenThemes.activities.cardBorder : `1.5px solid ${colors.border.light}`;
  const categoryCardBg = isMix ? mixColors.home.tileSurfaces.ac : isWarmMode ? '#20221E' : colors.background.secondary;
  const categoryBorder = isMix ? `1.5px solid ${mixColors.home.cardBorder}` : isWarmMode ? '1.5px solid rgba(213,216,188,0.16)' : `1.5px solid ${colors.border.light}`;
  const categoryAccent = isMix ? '#6A4D34' : isWarmMode ? SELECTED_COLOR : lightColors.warning.main;
  const categoryText = isMix ? mixColors.home.text : titleText;
  const cardShadow = isMix ? mixColors.home.cardShadow : isWarmMode ? '0 8px 18px rgba(0,0,0,0.22)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)';

  const activeCategory = selectedCategory
    ? (activityCategories.find(c => c.id === selectedCategory) || null)
    : null;
  const items = activeCategory?.items || [];

  const speakItem = useCallback((text: string, idx: number) => {
    onSpeak(text);
    setActivatedIdx(idx);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setActivatedIdx(null), 600);
  }, [onSpeak]);

  const renderIcon = (categoryId: string, size: number, color: string) => {
    const Icon = CATEGORY_ICONS[categoryId] || TvIcon;
    return <Icon size={size} color={color} />;
  };

  return (
    <div className={`activities-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: pageBg,
      padding: '4px 20px 6px 20px',
      overflow: 'hidden',
    }}>
      <GlobalNavBar currentPage="activities" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: '0 clamp(56px, 5.5vw, 96px) clamp(72px, 8vh, 104px)',
        marginTop: 'clamp(18px, 2.2vh, 30px)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'clamp(12px, 1.1vw, 18px)',
          marginBottom: 'clamp(18px, 2.4vh, 30px)',
        }}>
          {activeCategory ? renderIcon(activeCategory.id, 40, categoryAccent) : <TvIcon size={40} color={categoryAccent} />}
          <h2 style={{
            margin: 0,
            fontSize: 'clamp(34px, 4.1vh, 52px)',
            fontWeight: 820,
            color: titleText,
            fontFamily: ENGLISH_UI_FONT,
            lineHeight: 1.05,
          }}>
            {activeCategory ? activeCategory.name : 'Activities'}
          </h2>
        </div>

        {!activeCategory ? (
          <div style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gridTemplateRows: 'minmax(clamp(260px, 34vh, 390px), 1fr)',
            gap: 'clamp(22px, 2.8vw, 38px)',
            alignItems: 'center',
          }}>
            {activityCategories.map((cat) => (
              <GazeButton
                key={cat.id}
                id={`act-cat-${cat.id}`}
                size="lg"
                context="phrases"
                onClick={() => { setSelectedCategory(cat.id); setActivatedIdx(null); }}
                isDarkMode={isDarkMode}
                gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                contentFill
                style={{
                  width: '100%',
                  height: 'clamp(260px, 34vh, 390px)',
                  background: categoryCardBg,
                  border: categoryBorder,
                  borderRadius: '20px',
                  boxShadow: cardShadow,
                  padding: 0,
                }}
              >
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  alignItems: 'center',
                  padding: 'clamp(28px, 3.4vh, 44px) clamp(36px, 3.4vw, 66px)',
                  columnGap: 'clamp(24px, 2.6vw, 48px)',
                }}>
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {renderIcon(cat.id, 112, categoryAccent)}
                  </div>
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                  }}>
                    <span style={{
                      fontSize: 'clamp(34px, 3.7vh, 52px)',
                      fontWeight: 850,
                      color: categoryText,
                      textAlign: 'left',
                      lineHeight: 1.08,
                      fontFamily: ENGLISH_UI_FONT,
                    }}>
                      {cat.name}
                    </span>
                  </div>
                </div>
              </GazeButton>
            ))}
          </div>
        ) : (
          <div style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(16px, 2vh, 22px)',
          }}>
            <GazeButton
              id="act-back"
              size="lg"
              context="phrases"
              onClick={() => { setSelectedCategory(null); setActivatedIdx(null); }}
              isDarkMode={isDarkMode}
              gazeEnabled={isGazeEnabled}
              gazeEnabledTimestamp={lastEnabledTimestamp}
              style={{
                alignSelf: 'flex-start',
                width: 'clamp(220px, 22vw, 300px)',
                height: 'clamp(84px, 10vh, 108px)',
                background: isMix ? '#2B251B' : isWarmMode ? '#20221E' : lightColors.background.secondary,
                border: isMix ? '1.5px solid rgba(124,100,69,0.52)' : isWarmMode ? '1.5px solid rgba(143,174,114,0.32)' : `1.5px solid ${lightColors.border.main}`,
                borderRadius: '20px',
                boxShadow: cardShadow,
                display: 'grid',
                gridTemplateColumns: '64px 1fr',
                alignItems: 'center',
                padding: '0 22px',
                columnGap: '14px',
              }}
            >
              <div style={{
                width: 50,
                height: 50,
                borderRadius: '16px',
                border: `1.5px solid ${isMix ? '#D9C894' : isWarmMode ? '#8FAE72' : lightColors.border.strong}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                justifySelf: 'center',
              }}>
                <svg width="56%" height="56%" viewBox="0 0 24 24" fill="none" stroke={isMix ? '#F0E2C4' : isWarmMode ? '#DDE4D0' : lightColors.text.primary} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
              </div>
              <span style={{
                fontSize: 'clamp(24px, 2.7vh, 34px)',
                fontWeight: 760,
                color: isMix ? '#F0E2C4' : isWarmMode ? '#ECEDE3' : colors.text.primary,
                textAlign: 'left',
                fontFamily: ENGLISH_UI_FONT,
              }}>
                Back
              </span>
            </GazeButton>

            <div style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
              gap: 'clamp(16px, 2.1vh, 26px)',
              overflow: 'hidden',
            }}>
              {items.slice(0, 9).map((item, idx) => (
              <GazeButton
                key={idx}
                id={`act-${selectedCategory}-${idx}`}
                size="lg"
                context="phrases"
                onClick={() => speakItem(item.speak, idx)}
                isDarkMode={isDarkMode}
                gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 0,
                  padding: 'clamp(18px, 2.4vh, 30px) clamp(16px, 1.8vw, 28px)',
                  background: cardBg,
                  border: activatedIdx === idx ? `2px solid ${isMix ? '#8B6F49' : isWarmMode ? '#D6C98E' : colors.accent.main}` : cardBorder,
                  borderRadius: '20px',
                  boxShadow: activatedIdx === idx
                    ? (isMix ? mixColors.home.cardShadow : isWarmMode ? '0 0 0 1px rgba(213,216,188,0.20), 0 8px 18px rgba(0,0,0,0.20)' : '0 8px 24px rgba(139, 121, 104, 0.12), 0 2px 6px rgba(139, 121, 104, 0.08)')
                    : cardShadow,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'border 0.15s ease, box-shadow 0.15s ease',
                  transform: activatedIdx === idx ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                <span style={{
                  fontSize: 'clamp(24px, 2.9vh, 38px)',
                  fontWeight: 680,
                  color: cardText,
                  textAlign: 'center',
                  lineHeight: 1.15,
                  fontFamily: ENGLISH_UI_FONT,
                }}>
                  {item.label}
                </span>

                {showHindi && 'sub' in item && !!item.sub && (
                  <>
                    <div style={{ width: '36px', height: '1.5px', background: isMix ? 'rgba(75,53,32,0.28)' : 'rgba(255,255,255,0.18)', borderRadius: '1px', margin: '6px auto 3px' }} />
                    <span style={{
                      display: 'block',
                      fontSize: 'clamp(18px, 2.2vh, 28px)',
                      fontWeight: 700,
                      color: isMix ? '#4B3520' : 'rgba(255, 210, 140, 0.95)',
                      textAlign: 'center',
                      lineHeight: 1.5,
                      fontFamily: HINDI_UI_FONT,
                      letterSpacing: '0.02em',
                    }}>
                      {item.sub}
                    </span>
                  </>
                )}
                </GazeButton>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ActivitiesScreen);
