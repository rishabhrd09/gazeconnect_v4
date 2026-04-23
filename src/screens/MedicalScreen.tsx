/**
 * GazeConnect Pro - Assistance (Daily Care) (Formerly Medical Screen)
 * ===================================================================
 * v5.0: Responsive 13"–27" — consistent with Phrases/Activities pattern
 * - Left Sidebar: Category Selection (Urgent, Bed, Daily)
 * - Right Area: Large, spacious buttons for selected category
 * - Gaze toggle centered at bottom of right panel
 */
import React, { useState, useCallback } from 'react';
import { darkColors, lightColors, screenThemes } from '../utils/design';
import { useGazeControl } from '../components/core/GazeControlToggle';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { MedicalCrossIcon, BedMechanicIcon, SunIcon } from '../components/icons/Icons';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';

interface MedicalScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

interface MedItem { en: string; hi: string; urgent?: boolean; }

// ============================================
// STATIC ICON & COLOR MAPPINGS
// ============================================
const SECTION_ICONS: Record<string, React.FC<any>> = {
  urgent: MedicalCrossIcon,
  bed: BedMechanicIcon,
  daily: SunIcon,
};

const DEFAULT_SECTION_COLORS: Record<string, string> = {
  urgent: screenThemes.medical.urgent,
  bed: screenThemes.medical.bed,
  daily: screenThemes.medical.daily,
};

/** Resolve section color: persisted color > default static map > fallback */
const getSectionColor = (sec: { id: string; color?: string }) =>
  sec.color || DEFAULT_SECTION_COLORS[sec.id] || screenThemes.medical.daily;

// ============================================
// COMPONENTS
// ============================================

const SidebarTab: React.FC<{
  section: { id: string; title: string; titleHi: string; items: any[] };
  icon: React.FC<any>;
  isActive: boolean;
  color: string;
  isDarkMode: boolean;
  onClick: () => void;
  gazeEnabled: boolean;
  timestamp: number;
}> = ({ section, icon: Icon, isActive, color, isDarkMode, onClick, gazeEnabled, timestamp }) => {
  const rawTitle = section.title || '';
  const titleEn = rawTitle.replace(/[\u0900-\u097F\s]+$/, '').trim();
  let fallbackHi = '';
  const match = rawTitle.match(/[\u0900-\u097F\s]+$/);
  if (match) fallbackHi = match[0].trim();

  let finalHi = section.titleHi || fallbackHi;

  // Apply requested translation overrides
  if (titleEn.toUpperCase() === 'URGENT') finalHi = 'इमरजेंसी';
  if (titleEn.toUpperCase().includes('BED')) finalHi = 'बिस्तर / करवट';
  if (titleEn.toUpperCase() === 'DAILY CARE') finalHi = 'रोज़ देखभाल';

  return (
    <GazeButton
      id={`tab-${section.id}`}
      onClick={onClick}
      gazeEnabled={gazeEnabled}
      gazeEnabledTimestamp={timestamp}
      isDarkMode={isDarkMode}
      dwellCategory="navigationButton"
      style={{
        width: '100%',
        minHeight: 'clamp(85px, 11vh, 120px)',
        padding: 'clamp(16px, 2vh, 24px) clamp(16px, 1.5vw, 22px)',
        border: 'none',
        borderLeft: isActive ? `4px solid ${color}` : '4px solid transparent',
        borderRadius: '0 12px 12px 0',
        backgroundColor: isActive ? `${color}20` : 'transparent',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '4px', // Increase gap to fit larger text
        transition: 'all 180ms ease',
      }}
    >
      <Icon size={48} color={isActive ? color : '#888'} style={{ width: 'clamp(32px, 4.5vh, 48px)', height: 'clamp(32px, 4.5vh, 48px)', marginBottom: '4px' }} />
      <span style={{
        fontSize: 'clamp(14px, 1.6vw, 20px)', fontWeight: isActive ? 700 : 600,
        color: isActive ? color : '#888', letterSpacing: '0.5px',
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        lineHeight: 1.1,
        textAlign: 'center',
      }}>
        {titleEn}
      </span>
      {finalHi && (
        <>
          <div style={{ width: '28px', height: '1.5px', background: isActive ? `${color}40` : 'rgba(136,136,136,0.3)', margin: '4px auto' }} />
          <span style={{
            fontSize: 'clamp(16px, 1.8vw, 22px)', fontWeight: 700,
            color: isActive ? color : '#888',
            fontFamily: "'Noto Sans Devanagari', sans-serif",
            lineHeight: 1.2,
            marginTop: '2px',
            textAlign: 'center',
          }}>
            {finalHi}
          </span>
        </>
      )}
    </GazeButton>
  );
};

const PhraseButton: React.FC<{
  item: MedItem; color: string; isDarkMode: boolean; showHindi: boolean;
  onActivate: (text: string) => void; gazeEnabled: boolean; timestamp: number;
}> = ({ item, color, isDarkMode, showHindi, onActivate, gazeEnabled, timestamp }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  return (
    <GazeButton
      id={`phrase-${item.en}`}
      onClick={() => onActivate(item.en)}
      gazeEnabled={gazeEnabled}
      gazeEnabledTimestamp={timestamp}
      isDarkMode={isDarkMode}
      dwellCategory={item.urgent ? "medicalUrgent" : "phraseButton"}
      style={{
        width: '100%',
        minHeight: 'clamp(85px, 11.5vh, 125px)',
        borderRadius: '18px',
        background: isDarkMode ? '#1E2630' : '#f5f5f5',
        border: '2px solid rgba(90, 110, 130, 0.45)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(12px, 1.8vh, 20px)',
        gap: '8px',
        textAlign: 'center',
        boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
      }}
    >
      <span style={{
        fontSize: 'clamp(17px, 1.9vw, 24px)', fontWeight: 600,
        color: item.urgent ? color : colors.text.primary,
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        lineHeight: 1.35, letterSpacing: '0.1px',
        textShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }}>
        {item.en}
      </span>
      {showHindi && item.hi && (
        <>
          <div style={{ width: '28px', height: '1.5px', background: 'rgba(255,255,255,0.18)', borderRadius: '1px', margin: '4px auto 2px' }} />
          <span style={{
            fontSize: 'clamp(18px, 2.0vw, 26px)',
            fontWeight: 700,
            color: 'rgba(255, 210, 140, 0.95)',
            fontFamily: "'Noto Sans Devanagari', sans-serif",
            marginTop: '2px',
            lineHeight: 1.5,
            letterSpacing: '0.02em',
          }}>
            {item.hi}
          </span>
        </>
      )}
    </GazeButton>
  );
};

// ============================================
// MAIN SCREEN
// ============================================

const MedicalScreen: React.FC<MedicalScreenProps> = ({
  onNavigate, onSpeak, isDarkMode = true, showHindi = false,
}) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [lastSpoken, setLastSpoken] = useState('');
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze } = useGazeControl();
  const { isLight } = useTheme();
  const { medicalSections } = useCustomization();

  const activeSection = medicalSections[activeSectionIndex];
  const ActiveIcon = SECTION_ICONS[activeSection.id] || SunIcon;
  const activeColor = getSectionColor(activeSection);

  const handleActivate = useCallback((text: string) => {
    onSpeak(text); setLastSpoken(text);
  }, [onSpeak]);

  return (
    <div className={`medical-screen${isLight ? ' theme-light' : ''}`} style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      backgroundColor: colors.background.primary, overflow: 'hidden',
      padding: '4px 20px 6px 20px',
    }}>
      <GlobalNavBar currentPage="medical" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} />

      {/* LAST SPOKEN INDICATOR */}
      {lastSpoken && (
        <div style={{
          position: 'absolute', top: '80px', left: '0', right: '0',
          display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 10
        }}>
          <div style={{
            padding: '8px 24px', backgroundColor: colors.success.subtle,
            border: `1px solid ${colors.success.main}`,
            borderRadius: '20px', color: colors.success.main,
            fontSize: 'clamp(13px, 1.6vh, 18px)', fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}>
            {lastSpoken}
          </div>
        </div>
      )}

      {/* CONTENT AREA */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'row',
        gap: 'clamp(24px, 3vw, 40px)',
        marginTop: 'clamp(18px, 2.2vh, 30px)',
        minHeight: 0, padding: '0 8px',
      }}>

        {/* LEFT SIDEBAR - CATEGORIES */}
        <div style={{
          width: 'clamp(180px, 18vw, 240px)', flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          gap: 'clamp(12px, 2vh, 24px)', // Increased gap to serve as a dead zone
          backgroundColor: isDarkMode ? '#111820' : 'rgba(0,0,0,0.03)',
          borderRadius: '16px',
          padding: 'clamp(12px, 1.5vh, 18px) 8px',
          marginLeft: '4%',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          border: '1px solid rgba(100, 140, 180, 0.15)',
          alignSelf: 'flex-start',
        }}>
          {/* Sidebar Header */}
          <div style={{
            padding: '8px 16px 14px 16px',
            borderBottom: '1px solid rgba(100, 140, 180, 0.2)',
            marginBottom: '6px',
          }}>
            <span style={{
              fontSize: 'clamp(11px, 1vw, 13px)',
              fontWeight: 600,
              color: activeColor,
              textTransform: 'uppercase' as const,
              letterSpacing: '1.5px',
              fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
            }}>
              Categories
            </span>
          </div>

          {medicalSections.map((sec, idx) => (
            <SidebarTab
              key={sec.id}
              section={sec}
              icon={SECTION_ICONS[sec.id] || SunIcon}
              isActive={idx === activeSectionIndex}
              color={getSectionColor(sec)}
              isDarkMode={isDarkMode}
              onClick={() => setActiveSectionIndex(idx)}
              gazeEnabled={isGazeEnabled}
              timestamp={lastEnabledTimestamp}
            />
          ))}
        </div>

        {/* RIGHT AREA - GRID WITH HEADER */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          position: 'relative',
        }}>
          {/* CATEGORY HEADER */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: 'clamp(14px, 1.8vh, 22px)',
            paddingLeft: '8px',
          }}>
            <ActiveIcon size={28} color={activeColor} style={{ width: 'clamp(22px, 3vh, 28px)', height: 'clamp(22px, 3vh, 28px)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <h2 style={{
                fontSize: 'clamp(20px, 2vw, 28px)',
                fontWeight: 700,
                color: colors.text.primary,
                margin: 0,
                fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
                lineHeight: 1.1,
              }}>
                {(() => {
                  const raw = activeSection.title || '';
                  return raw.replace(/[\u0900-\u097F\s]+$/, '').trim();
                })()}
              </h2>
              {showHindi && (
                <>
                  <div style={{ width: '40px', height: '1.5px', background: 'rgba(255,255,255,0.18)', borderRadius: '1px', margin: '2px 0' }} />
                  <span style={{
                    fontSize: 'clamp(20px, 2.2vw, 28px)',
                    fontWeight: 700,
                    color: 'rgba(255, 210, 140, 0.95)',
                    fontFamily: "'Noto Sans Devanagari', sans-serif",
                    lineHeight: 1.2,
                  }}>
                    {(() => {
                      const raw = activeSection.title || '';
                      const en = raw.replace(/[\u0900-\u097F\s]+$/, '').trim();
                      let finalHi = activeSection.titleHi || '';
                      if (!finalHi) {
                        const m = raw.match(/[\u0900-\u097F\s]+$/);
                        if (m) finalHi = m[0].trim();
                      }
                      if (en.toUpperCase() === 'URGENT') finalHi = 'इमरजेंसी';
                      if (en.toUpperCase().includes('BED')) finalHi = 'बिस्तर / करवट';
                      if (en.toUpperCase() === 'DAILY CARE') finalHi = 'रोज़ देखभाल';
                      return finalHi;
                    })()}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* PHRASE GRID */}
          <div style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridAutoRows: 'minmax(clamp(85px, 11.5vh, 125px), auto)',
            gap: 'clamp(14px, 2vh, 24px)', // Increased gap to match the larger cards
            overflowY: 'auto',
            alignContent: 'start',
            padding: '4px 8px clamp(90px, 12vh, 140px) 8px',
          }}>
            {activeSection.items.map((item) => (
              <PhraseButton
                key={item.en}
                item={item}
                color={activeColor}
                isDarkMode={isDarkMode}
                showHindi={showHindi}
                onActivate={handleActivate}
                gazeEnabled={isGazeEnabled}
                timestamp={lastEnabledTimestamp}
              />
            ))}
          </div>

          {/* Gaze toggle provided by GlobalNavBar at fixed bottom-center */}
        </div>
      </div>
    </div>
  );
};

export default React.memo(MedicalScreen);
