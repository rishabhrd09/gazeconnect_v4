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
import { darkColors, lightColors, screenThemes } from '../utils/design';
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
const ENGLISH_UI_FONT = "'Atkinson Hyperlegible Next', 'Inter', 'Segoe UI', system-ui, sans-serif";
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
  const [selectedCategory, setSelectedCategory] = useState(activityCategories[0]?.id || 'tv');
  const [activatedIdx, setActivatedIdx] = useState<number | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colors = isDarkMode ? darkColors : lightColors;
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze } = useGazeControl();
  const { isLight, isMix } = useTheme();
  const isWarmMode = isDarkMode && !isLight;
  const pageBg = isMix ? '#17130F' : isWarmMode ? '#131412' : colors.background.primary;
  const sidebarBg = isMix ? '#2A241C' : isWarmMode ? SIDEBAR_BG : lightColors.background.secondary;
  const sidebarBorder = isMix ? 'rgba(139, 111, 73, 0.42)' : isWarmMode ? 'rgba(213,216,188,0.14)' : colors.border.main;
  const sidebarShadow = isWarmMode ? '0 8px 22px rgba(0,0,0,0.24)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)';
  const mainText = isMix ? '#23180C' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const titleText = isMix ? '#F0E2C4' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const sidebarText = isMix ? '#F0E2C4' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const inactiveIcon = isMix ? '#B49362' : isWarmMode ? '#8FAE72' : lightColors.text.tertiary;
  const selectedBg = isMix ? 'rgba(196, 178, 142, 0.22)' : isWarmMode ? screenThemes.activities.selectedBg : lightColors.background.tertiary;
  const cardBg = isMix ? '#C4B28E' : isWarmMode ? screenThemes.activities.cardBg : colors.background.secondary;
  const cardBorder = isMix ? '1.5px solid rgba(91,74,51,0.38)' : isWarmMode ? screenThemes.activities.cardBorder : `1.5px solid ${colors.border.light}`;
  const cardShadow = isWarmMode ? '0 8px 18px rgba(0,0,0,0.22)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)';

  const activeCategory = activityCategories.find(c => c.id === selectedCategory) || activityCategories[0];
  const items = activeCategory?.items || [];

  return (
    <div className={`activities-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: pageBg, padding: '4px 20px 6px 20px', overflow: 'hidden' }}>
      {/* GlobalNavBar */}
      <GlobalNavBar currentPage="activities" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} />

      {/* Main Content: Sidebar + Grid */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'row',
        gap: 'clamp(24px, 3vw, 40px)', marginTop: 'clamp(18px, 2.2vh, 30px)',
        minHeight: 0, padding: '0 8px',
      }}>
        {/* === LEFT SIDEBAR === */}
        <div style={{
          width: 'clamp(228px, 22vw, 292px)', flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: '12px',
          backgroundColor: sidebarBg, borderRadius: '18px',
          padding: 'clamp(16px, 2vh, 22px) 10px',
          marginLeft: 'clamp(26px, 3.2vw, 52px)',
          boxShadow: sidebarShadow,
          border: `1px solid ${sidebarBorder}`,
          alignSelf: 'flex-start',
        }}>
          {activityCategories.map(cat => (
            <ActivityCategoryButton
              key={cat.id}
              cat={cat}
              icon={CATEGORY_ICONS[cat.id] || TvIcon}
              selectedCategory={selectedCategory}
              onSelect={setSelectedCategory}
              isDarkMode={isDarkMode}
              gazeEnabled={isGazeEnabled}
              gazeEnabledTimestamp={lastEnabledTimestamp}
              textColor={sidebarText}
              inactiveIconColor={inactiveIcon}
              selectedBg={selectedBg}
            />
          ))}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Enable Gaze Button in Sidebar for easy access if needed (Optional, user usually prefers centered) */}
          {/* But for consistency with Phrases, let's put it in the main area or bottom center */}
        </div>

        {/* === RIGHT GRID === */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', paddingLeft: '8px' }}>
            {(() => {
              const ActiveIcon = CATEGORY_ICONS[selectedCategory] || TvIcon;
              return <ActiveIcon size={34} color={isWarmMode ? SELECTED_COLOR : lightColors.warning.main} />;
            })()}
            <h2 style={{ fontSize: 'clamp(28px, 3.2vh, 40px)', fontWeight: 700, color: titleText, margin: 0, fontFamily: ENGLISH_UI_FONT }}>
              {activeCategory?.name}
            </h2>
          </div>

          {/* Grid */}
          <div style={{
            flex: 1, display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gridAutoRows: 'minmax(clamp(150px, 17.5vh, 210px), auto)',
            gap: 'clamp(16px, 2.2vh, 26px)',
            overflowY: 'auto', alignContent: 'start', padding: '4px 8px clamp(82px, 10vh, 120px) 8px',
          }}>
            {items.map((item, idx) => (
              <GazeButton
                key={idx} id={`act-${selectedCategory}-${idx}`} size="lg" context="phrases"
                onClick={() => {
                  onSpeak(item.speak);
                  setActivatedIdx(idx);
                  if (flashRef.current) clearTimeout(flashRef.current);
                  flashRef.current = setTimeout(() => setActivatedIdx(null), 600);
                }}
                isDarkMode={isDarkMode} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
                style={{
                  width: '100%', minHeight: 'clamp(150px, 17.5vh, 210px)',
                  padding: 'clamp(18px, 2.4vh, 28px) clamp(16px, 1.8vw, 26px)',
                  background: cardBg,
                  border: activatedIdx === idx ? `2px solid ${isMix ? '#8B6F49' : isWarmMode ? '#D6C98E' : colors.accent.main}` : cardBorder,
                  borderRadius: '16px',
                  boxShadow: activatedIdx === idx
                    ? (isWarmMode ? '0 0 0 1px rgba(213,216,188,0.20), 0 8px 18px rgba(0,0,0,0.20)' : '0 8px 24px rgba(139, 121, 104, 0.12), 0 2px 6px rgba(139, 121, 104, 0.08)')
                    : cardShadow,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0px',
                  transition: 'border 0.15s ease, box-shadow 0.15s ease',
                  transform: activatedIdx === idx ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                <span style={{
                  fontSize: 'clamp(22px, 2.6vh, 36px)',
                  fontWeight: 600,
                  color: mainText,
                  textAlign: 'center',
                  lineHeight: 1.18,
                  fontFamily: ENGLISH_UI_FONT,
                }}>
                  {item.label}
                </span>

                {/* Subtext / Hindi - New Line, Aesthetic */}
                {showHindi && 'sub' in item && !!item.sub && (
                  <>
                    <div style={{ width: '36px', height: '1.5px', background: 'rgba(255,255,255,0.18)', borderRadius: '1px', margin: '6px auto 3px' }} />
                    <span style={{
                      display: 'block',
                      fontSize: 'clamp(18px, 2.2vh, 28px)',
                      fontWeight: 700,
                      color: 'rgba(255, 210, 140, 0.95)',
                      textAlign: 'center',
                      lineHeight: 1.5,
                      fontFamily: "'Noto Sans Devanagari', sans-serif",
                      letterSpacing: '0.02em',
                    }}>
                      {item.sub}
                    </span>
                  </>
                )}
              </GazeButton>
            ))}
          </div>

          {/* Gaze toggle provided by GlobalNavBar at fixed bottom-center */}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ActivitiesScreen);
