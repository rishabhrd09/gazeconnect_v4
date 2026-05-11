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
import { TVIcon as HomeActivityIcon } from '../components/icons/Icons';

// Custom Icons for Sidebar
const TvIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = 'currentColor' }) => (
  <HomeActivityIcon size={size} color={color} strokeWidth={2.1} />
);

const YoutubeIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth="5.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="17" y="30" width="62" height="38" rx="13" />
    <path d="M43 41l17 9-17 9V41z" />
  </svg>
);

const AlexaIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
    <path
      d="M35 22v40.5c-3-1.8-7.2-2.3-11.2-1.1-7 2-11.4 7.5-9.9 12.4 1.5 4.8 8.4 7.1 15.4 5.1 6.1-1.8 10.3-6.3 10.3-10.8V39.4l33-7.2v23.2c-3-1.8-7.2-2.3-11.2-1.1-7 2-11.4 7.5-9.9 12.4 1.5 4.8 8.4 7.1 15.4 5.1 6.1-1.8 10.3-6.3 10.3-10.8V17.5L35 27v-5z"
      fill={color}
    />
  </svg>
);

const WebIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="48" cy="48" r="31" />
    <path d="M17 48h62" />
    <path d="M48 17c10 11.5 15 21.8 15 31s-5 19.5-15 31" />
    <path d="M48 17c-10 11.5-15 21.8-15 31s5 19.5 15 31" />
    <path d="M26 29c6.4 4.1 13.8 6.2 22 6.2S63.6 33.1 70 29" opacity="0.48" />
    <path d="M26 67c6.4-4.1 13.8-6.2 22-6.2S63.6 62.9 70 67" opacity="0.48" />
  </svg>
);

const ActivityBackIcon: React.FC<{ size?: number; color?: string; strokeWidth?: number }> = ({
  size = 132,
  color = 'currentColor',
  strokeWidth = 4,
}) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M36.5 18.5 23 32l13.5 13.5" />
    <path d="M24.5 32H49" />
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
  web: WebIcon,
};

const getActivityLandingColor = (id: string, isMix: boolean, isWarmMode: boolean) => {
  const palette = isMix
    ? { tv: '#8B6D3F', youtube: '#77413D', alexa: '#879873', web: '#5E807E' }
    : isWarmMode
      ? { tv: '#92723D', youtube: '#7E413C', alexa: '#83936E', web: '#5B7D7B' }
      : { tv: '#8A6A3A', youtube: '#7A403A', alexa: '#788966', web: '#587A78' };
  return palette[id as keyof typeof palette] || palette.tv;
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
  const { isLight, isMix, isWarm } = useTheme();
  const isWarmMode = isDarkMode && !isLight;
  const pageBg = isMix ? '#17130F' : isWarm ? '#F5EEDF' : isWarmMode ? '#131412' : colors.background.primary;
  const titleText = isMix ? '#FFF0D2' : isWarm ? '#2F2A26' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const cardBg = isMix ? mixColors.home.tileSurfaces.ac : isWarm ? '#FBF5E5' : isWarmMode ? screenThemes.activities.cardBg : colors.background.secondary;
  const cardText = isMix ? mixColors.home.text : isWarm ? '#2F2A26' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const cardBorder = isMix ? `1.5px solid ${mixColors.home.cardBorder}` : isWarm ? '1.5px solid #DED2C2' : isWarmMode ? screenThemes.activities.cardBorder : `1.5px solid ${colors.border.light}`;
  const categoryCardBg = cardBg;
  const categoryBorder = cardBorder;
  const categoryAccent = isMix ? '#6A4D34' : isWarm ? '#3F6968' : isWarmMode ? SELECTED_COLOR : lightColors.warning.main;
  const categoryText = cardText;
  const cardShadow = isMix ? mixColors.home.cardShadow : isWarm ? '0 6px 16px rgba(122, 99, 71, 0.12), 0 1px 3px rgba(122, 99, 71, 0.08)' : isWarmMode ? '0 8px 18px rgba(0,0,0,0.22)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)';
  const backCardBg = isMix ? '#28321F' : isWarm ? '#EFE7D8' : isWarmMode ? 'rgba(25, 31, 24, 0.98)' : '#DCE2C8';
  const backIconColor = isMix ? '#9DB384' : isWarm ? '#5F7C58' : isWarmMode ? '#9CAF7E' : '#61714A';

  const activeCategory = selectedCategory
    ? (activityCategories.find(c => c.id === selectedCategory) || null)
    : null;
  const items = activeCategory?.items || [];
  const landingCards = [
    ...activityCategories.slice(0, 3).map(cat => ({
      id: cat.id,
      label: cat.name,
      iconId: cat.id,
      type: 'category' as const,
    })),
    {
      id: 'web',
      label: 'Web Browsing',
      iconId: 'web',
      type: 'web' as const,
    },
  ];

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
  const getLandingIconSize = (categoryId: string) => (
    categoryId === 'tv' ? 82 : categoryId === 'alexa' ? 108 : 122
  );
  const getLandingIconOpacity = (categoryId: string) => (
    categoryId === 'youtube' ? 0.72 : categoryId === 'alexa' ? 0.76 : 0.78
  );

  return (
    <div className={`activities-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : isWarm ? ' theme-warm' : ''}`} style={{
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
        padding: '0 clamp(44px, 5vw, 86px) clamp(86px, 10vh, 124px)',
        marginTop: 'clamp(18px, 2.2vh, 30px)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          marginBottom: 'clamp(18px, 2.4vh, 28px)',
        }}>
          {activeCategory && renderIcon(activeCategory.id, 40, categoryAccent)}
          <h2 style={{
            margin: 0,
            fontSize: 'clamp(32px, 4vh, 48px)',
            fontWeight: 820,
            color: titleText,
            fontFamily: ENGLISH_UI_FONT,
            lineHeight: 1,
          }}>
            {activeCategory ? activeCategory.name : 'Activities'}
          </h2>
        </div>

        {!activeCategory ? (
          <div style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gridAutoRows: 'minmax(clamp(210px, 28vh, 310px), 1fr)',
            gap: 'clamp(22px, 3vh, 34px)',
          }}>
            {landingCards.map((card) => {
              const color = getActivityLandingColor(card.iconId, isMix, isWarmMode);
              const handleClick = () => {
                setActivatedIdx(null);
                if (card.type === 'web') {
                  onNavigate('web');
                  return;
                }
                setSelectedCategory(card.id);
              };

              return (
                <GazeButton
                  key={card.id}
                  id={card.type === 'web' ? 'act-cat-web' : `act-cat-${card.id}`}
                  size="lg"
                  context="phrases"
                  onClick={handleClick}
                  isDarkMode={isDarkMode}
                  gazeEnabled={isGazeEnabled}
                  gazeEnabledTimestamp={lastEnabledTimestamp}
                  contentFill
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    width: '100%',
                    height: '100%',
                    minHeight: 'clamp(210px, 28vh, 310px)',
                    background: categoryCardBg,
                    border: categoryBorder,
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
                    opacity: 0.56,
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
                    <div style={{
                      opacity: getLandingIconOpacity(card.iconId),
                      filter: isDarkMode ? 'drop-shadow(0 1px 0 rgba(255,255,255,0.025)) drop-shadow(0 8px 12px rgba(0,0,0,0.12))' : 'none',
                      transform: 'translateZ(0)',
                    }}>
                      {renderIcon(card.iconId, getLandingIconSize(card.iconId), color)}
                    </div>
                  </div>
                  <div style={{
                    flex: '1 1 0',
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    paddingLeft: 'clamp(10px, 1.6vw, 28px)',
                  }}>
                    <span style={{
                      color: categoryText,
                      fontFamily: ENGLISH_UI_FONT,
                      fontSize: 'clamp(30px, 3.7vh, 43px)',
                      fontWeight: 820,
                      lineHeight: 1.08,
                      letterSpacing: '0',
                      textAlign: 'left',
                    }}>
                      {card.label}
                    </span>
                  </div>
                </GazeButton>
              );
            })}
          </div>
        ) : (
          <div style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
            gap: 'clamp(16px, 2.1vh, 26px)',
            overflow: 'hidden',
          }}>
            <GazeButton
              id="act-back"
              size="lg"
              context="phrases"
              onClick={() => { setSelectedCategory(null); setActivatedIdx(null); }}
              isDarkMode={isDarkMode}
              gazeEnabled={isGazeEnabled}
              gazeEnabledTimestamp={lastEnabledTimestamp}
              ariaLabel="Back to Activities categories"
              style={{
                width: '100%',
                height: '100%',
                minHeight: 0,
                background: backCardBg,
                border: 'none',
                borderRadius: '18px',
                boxShadow: cardShadow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <ActivityBackIcon size={150} color={backIconColor} strokeWidth={4.15} />
            </GazeButton>

            {items.slice(0, 8).map((item, idx) => (
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
        )}
      </div>
    </div>
  );
};

export default React.memo(ActivitiesScreen);
