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
}> = ({ cat, icon, selectedCategory, onSelect, isDarkMode, gazeEnabled, gazeEnabledTimestamp, textColor }) => {
  const isSelected = selectedCategory === cat.id;
  const Icon = icon;
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
        backgroundColor: isSelected ? screenThemes.activities.selectedBg : 'transparent',
        minHeight: 'clamp(96px, 10.8vh, 124px)',
        padding: 'clamp(20px, 2.4vh, 28px) clamp(16px, 1.5vw, 24px)',
        border: 'none',
        borderLeft: isSelected ? `5px solid ${SELECTED_COLOR}` : '5px solid transparent',
        borderRadius: '0 16px 16px 0',
        transition: 'all 180ms ease',
        justifyContent: 'flex-start',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
        <Icon size={26} color={isSelected ? SELECTED_COLOR : ACCENT_TEAL} />
        <span style={{
          fontSize: 'clamp(18px, 1.75vw, 26px)',
          fontWeight: isSelected ? 700 : 600,
          color: isSelected ? SELECTED_COLOR : textColor,
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
  const { isLight } = useTheme();

  const activeCategory = activityCategories.find(c => c.id === selectedCategory) || activityCategories[0];
  const items = activeCategory?.items || [];

  return (
    <div className={`activities-screen${isLight ? ' theme-light' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: colors.background.primary, padding: '4px 20px 6px 20px', overflow: 'hidden' }}>
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
          backgroundColor: SIDEBAR_BG, borderRadius: '18px',
          padding: 'clamp(16px, 2vh, 22px) 10px',
          marginLeft: 'clamp(26px, 3.2vw, 52px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          border: '1px solid rgba(100, 140, 180, 0.15)',
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
              textColor={colors.text.primary}
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
              return <ActiveIcon size={34} color={SELECTED_COLOR} />;
            })()}
            <h2 style={{ fontSize: 'clamp(28px, 3.2vh, 40px)', fontWeight: 700, color: colors.text.primary, margin: 0, fontFamily: ENGLISH_UI_FONT }}>
              {activeCategory?.name}
            </h2>
          </div>

          {/* Grid */}
          <div style={{
            flex: 1, display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gridAutoRows: 'minmax(clamp(120px, 14.5vh, 180px), auto)',
            gap: 'clamp(14px, 2.2vh, 28px)',
            overflowY: 'auto', alignContent: 'start', padding: '4px 8px clamp(90px, 12vh, 140px) 8px',
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
                  width: '100%', minHeight: 'clamp(120px, 14.5vh, 180px)',
                  padding: 'clamp(16px, 2vh, 24px) clamp(16px, 1.8vw, 26px)',
                  background: 'linear-gradient(145deg, rgba(50, 62, 75, 0.65) 0%, rgba(40, 52, 65, 0.55) 100%)',
                  border: activatedIdx === idx ? '2px solid rgba(45, 212, 191, 0.9)' : '2px solid rgba(90, 110, 130, 0.45)',
                  borderRadius: '20px',
                  boxShadow: activatedIdx === idx ? '0 0 18px rgba(45,212,191,0.35)' : '0 6px 18px rgba(0,0,0,0.22)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0px',
                  transition: 'border 0.15s ease, box-shadow 0.15s ease',
                  transform: activatedIdx === idx ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                <span style={{
                  fontSize: 'clamp(22px, 2.6vh, 36px)',
                  fontWeight: 600,
                  color: '#FFFFFF',
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
