/**
 * GazeConnect Pro - Phrases Screen (v6.1)
 * ========================================
 * Refined layout:
 * - Sidebar shifted more towards center (away from corner)
 * - Enable Gaze button moved UP (halfway between bottom and center)
 * - Beautiful, clear fonts for phrase cards - both English and Hindi
 * - Enhanced aesthetic styling
 */
import React, { useState, useCallback, useRef } from 'react';
import { darkColors, lightColors, screenThemes } from '../utils/design';
import GazeButton from '../components/core/GazeButton';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useTheme } from '../contexts/ThemeContext';
import {
  EmergencyIcon, MedicalIcon,
  HappyIcon, FamilyIcon, MessageIcon, BedIcon, GridIcon
} from '../components/icons/Icons';
import { useCustomization } from '../contexts/CustomizationContext';

// Colors from design.ts screenThemes
const SELECTED_COLOR = screenThemes.phrases.selectedColor;
const SIDEBAR_BG = screenThemes.phrases.sidebarBg;
const ACCENT_TEAL = screenThemes.phrases.accentTeal;
const ENGLISH_UI_FONT = "'Atkinson Hyperlegible Next', 'Inter', 'Segoe UI', system-ui, sans-serif";
const HINDI_UI_FONT = "'Noto Sans Devanagari', 'Mukta', 'Mangal', 'Segoe UI', sans-serif";

// Custom Basic Needs icon - Hand with heart (caring needs)
const BasicNeedsIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#6BB8C9' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
    <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
);

// Icon mapping: category key -> React icon component
const CATEGORY_ICONS: Record<string, React.FC<{ size?: number; color?: string }>> = {
  emergency: EmergencyIcon,
  medical: MedicalIcon,
  position: BedIcon,
  basic_needs: BasicNeedsIcon,
  daily_care: BasicNeedsIcon,
  communication: MessageIcon,
  people: FamilyIcon,
  feelings: HappyIcon,
};

interface PhrasesScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

type CategoryKey = string;

// Extracted to module scope to avoid re-creation on every render
const PhrasesCategoryButton: React.FC<{
  category: { id: string; name: string; nameHi?: string; phrases: { en: string; hi: string }[] };
  icon: React.FC<{ size?: number; color?: string }>;
  isSelected: boolean;
  onSelect: () => void;
  isDarkMode: boolean;
  showHindi: boolean;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  textColor: string;
  inactiveIconColor?: string;
  selectedBg?: string;
}> = ({
  category, icon: Icon, isSelected, onSelect, isDarkMode, showHindi, gazeEnabled,
  gazeEnabledTimestamp, textColor, inactiveIconColor: inactiveIconColorOverride, selectedBg: selectedBgOverride,
}) => {
  const selectedColor = isDarkMode ? SELECTED_COLOR : lightColors.warning.main;
  const inactiveIconColor = inactiveIconColorOverride || (isDarkMode ? ACCENT_TEAL : lightColors.text.tertiary);
  const selectedBg = selectedBgOverride || (isDarkMode ? screenThemes.phrases.selectedBg : lightColors.background.tertiary);
  return (
    <GazeButton
      id={`cat-${category.id}`}
      size="lg"
      variant={isSelected ? 'primary' : 'default'}
      onClick={onSelect}
      isDarkMode={isDarkMode}
      gazeEnabled={gazeEnabled}
      gazeEnabledTimestamp={gazeEnabledTimestamp}
      style={{
        width: '100%',
        backgroundColor: isSelected ? selectedBg : 'transparent',
        minHeight: 'clamp(96px, 10.8vh, 124px)',
        padding: 'clamp(20px, 2.4vh, 28px) clamp(16px, 1.5vw, 24px)',
        border: 'none',
        borderLeft: isSelected ? `5px solid ${selectedColor}` : '5px solid transparent',
        borderRadius: '0 16px 16px 0',
        transition: 'all 180ms ease',
        justifyContent: 'flex-start',
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 'clamp(10px, 1vw, 14px)',
        width: '100%',
      }}>
        <Icon
          size={30}
          color={isSelected ? selectedColor : inactiveIconColor}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0px' }}>
          <span style={{
            fontSize: 'clamp(18px, 1.7vw, 24px)',
            fontWeight: isSelected ? 700 : 600,
            color: isSelected ? selectedColor : textColor,
            fontFamily: ENGLISH_UI_FONT,
            lineHeight: 1.15,
            letterSpacing: '0.2px',
          }}>
            {category.name}
          </span>
          {showHindi && category.nameHi && (
            <>
              <div style={{
                width: '24px', height: '1px',
                background: isSelected ? `${selectedColor}55` : (isDarkMode ? 'rgba(255,255,255,0.18)' : lightColors.border.light),
                borderRadius: '1px', margin: '4px 0 2px',
              }} />
              <span style={{
                fontSize: 'clamp(18px, 1.7vw, 24px)',
                fontWeight: 700,
                color: isSelected ? (isDarkMode ? 'rgba(255, 210, 140, 0.95)' : lightColors.text.secondary) : (isDarkMode ? 'rgba(255, 210, 140, 0.70)' : lightColors.text.tertiary),
                fontFamily: "'Noto Sans Devanagari', sans-serif",
                lineHeight: 1.5,
                letterSpacing: '0.02em',
              }}>
                {category.nameHi}
              </span>
            </>
          )}
        </div>
      </div>
    </GazeButton>
  );
};

const RECENT_KEY = 'gc_recent_phrases';
const MAX_RECENT = 10;

const PhrasesScreen: React.FC<PhrasesScreenProps> = ({
  onNavigate, onSpeak, isDarkMode = true, showHindi = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState('communication');
  const colors = isDarkMode ? darkColors : lightColors;
  const { phraseCategories } = useCustomization();
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze } = useGazeControl();
  const { isLight, isMix } = useTheme();
  const isWarmMode = isDarkMode && !isLight;
  const pageBg = isMix ? '#17130F' : isWarmMode ? '#131412' : colors.background.primary;
  const sidebarBg = isMix ? '#2A241C' : isWarmMode ? SIDEBAR_BG : lightColors.background.secondary;
  const sidebarBorder = isMix ? 'rgba(139, 111, 73, 0.42)' : isWarmMode ? 'rgba(213,216,188,0.14)' : colors.border.main;
  const sidebarShadow = isWarmMode ? '0 8px 22px rgba(0,0,0,0.24)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)';
  const selectedBg = isMix ? 'rgba(196, 178, 142, 0.22)' : isWarmMode ? screenThemes.phrases.selectedBg : lightColors.background.tertiary;
  const inactiveIcon = isMix ? '#B49362' : isWarmMode ? ACCENT_TEAL : lightColors.text.tertiary;
  const sidebarText = isMix ? '#F0E2C4' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const titleText = isMix ? '#F0E2C4' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const phraseCardBg = isMix ? '#C4B28E' : isWarmMode ? screenThemes.phrases.cardBg : colors.background.secondary;
  const phraseCardBorder = isMix ? '1.5px solid rgba(91,74,51,0.38)' : isWarmMode ? screenThemes.phrases.cardBorder : `1.5px solid ${colors.border.light}`;
  const phraseText = isMix ? '#23180C' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const phraseShadow = isWarmMode ? '0 8px 18px rgba(0,0,0,0.22)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)';
  const [activatedIdx, setActivatedIdx] = useState<number | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recent phrases — stored in sessionStorage so they persist within a session
  const [recentPhrases, setRecentPhrases] = useState<{ en: string; hi: string }[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]');
    } catch {
      return [];
    }
  });

  // Determine which phrases to display (handles the synthetic 'recent' category)
  const isRecentSelected = selectedCategory === 'recent';
  const selectedCategoryData = isRecentSelected
    ? null
    : (phraseCategories.find(c => c.id === selectedCategory) || phraseCategories[0]);
  const displayedPhrases: { en: string; hi: string }[] = isRecentSelected
    ? recentPhrases
    : (selectedCategoryData?.phrases ?? []);

  const handlePhraseClick = useCallback((phrase: { en: string; hi?: string }, idx: number) => {
    onSpeak(phrase.en);
    setActivatedIdx(idx);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setActivatedIdx(null), 600);

    // Add to recent list — deduplicate, cap at MAX_RECENT
    setRecentPhrases(prev => {
      const entry = { en: phrase.en, hi: (phrase as any).hi ?? '' };
      const filtered = prev.filter(p => p.en !== phrase.en);
      const next = [entry, ...filtered].slice(0, MAX_RECENT);
      try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [onSpeak]);

  return (
    <div className={`phrases-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: pageBg,
      padding: '4px 20px 6px 20px',
      overflow: 'hidden',
    }}>
      {/* GlobalNavBar */}
      <GlobalNavBar
        currentPage="phrases"
        onNavigate={onNavigate}
        onSpeak={onSpeak}
        isDarkMode={isDarkMode}
      />

      {/* Main content - Sidebar + Phrases + Enable Gaze */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'row',
        gap: 'clamp(24px, 3vw, 40px)',
        marginTop: 'clamp(18px, 2.2vh, 30px)',
        minHeight: 0,
        padding: '0 8px',
      }}>

        {/* ===== LEFT SIDEBAR ===== */}
        <div className="category-sidebar" style={{
          width: 'clamp(228px, 21vw, 292px)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          backgroundColor: sidebarBg,
          borderRadius: '18px',
          padding: 'clamp(14px, 1.8vh, 22px) 10px',
          marginLeft: 'clamp(28px, 3.2vw, 56px)',
          boxShadow: sidebarShadow,
          border: `1px solid ${sidebarBorder}`,
          alignSelf: 'flex-start',
        }}>
          {/* Sidebar Header */}
          <div style={{
            padding: '8px 16px 14px 16px',
            borderBottom: `1px solid ${sidebarBorder}`,
            marginBottom: '6px',
          }}>
            <span style={{
              fontSize: 'clamp(13px, 1.1vw, 15px)',
              fontWeight: 600,
              color: isWarmMode ? inactiveIcon : lightColors.text.secondary,
              textTransform: 'none',
              letterSpacing: '0.02em',
              fontFamily: ENGLISH_UI_FONT,
            }}>
              Categories
            </span>
          </div>

          {/* Recent tab — only shown once at least 1 phrase has been spoken */}
          {recentPhrases.length > 0 && (
            <GazeButton
              id="cat-recent"
              size="lg"
              variant={isRecentSelected ? 'primary' : 'default'}
              onClick={() => { setSelectedCategory('recent'); setActivatedIdx(null); }}
              isDarkMode={isDarkMode}
              gazeEnabled={isGazeEnabled}
              gazeEnabledTimestamp={lastEnabledTimestamp}
              style={{
                width: '100%',
                backgroundColor: isRecentSelected ? selectedBg : 'transparent',
                minHeight: 'clamp(96px, 10.8vh, 124px)',
                padding: 'clamp(20px, 2.4vh, 28px) clamp(16px, 1.5vw, 24px)',
                border: 'none',
                borderLeft: isRecentSelected ? `5px solid ${isWarmMode ? SELECTED_COLOR : lightColors.warning.main}` : '5px solid transparent',
                borderRadius: '0 16px 16px 0',
                transition: 'all 180ms ease',
                justifyContent: 'flex-start',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 'clamp(10px, 1vw, 14px)', width: '100%' }}>
                {/* Clock icon */}
                <svg width={30} height={30} viewBox="0 0 24 24" fill="none"
                  stroke={isRecentSelected ? (isWarmMode ? SELECTED_COLOR : lightColors.warning.main) : inactiveIcon} strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                  <span style={{
                    fontSize: 'clamp(18px, 1.7vw, 24px)',
                    fontWeight: isRecentSelected ? 700 : 600,
                    color: isRecentSelected ? (isWarmMode ? SELECTED_COLOR : lightColors.warning.main) : sidebarText,
                    fontFamily: ENGLISH_UI_FONT,
                    lineHeight: 1.15,
                  }}>
                    Recent
                  </span>
                  {showHindi && (
                    <span style={{
                      fontSize: 'clamp(15px, 1.5vw, 20px)',
                      fontWeight: 700,
                      color: isRecentSelected ? (isWarmMode ? SELECTED_COLOR : lightColors.warning.main) : inactiveIcon,
                      fontFamily: HINDI_UI_FONT,
                      lineHeight: 1.15,
                    }}>
                      हाल के
                    </span>
                  )}
                </div>
              </div>
            </GazeButton>
          )}

          {/* Regular Category Buttons */}
          {phraseCategories.filter(cat => {
            const id = cat.id.toLowerCase();
            const name = cat.name.toLowerCase();
            const isCommunication = id === 'communication' || name.includes('communication');
            const isFeelings = id === 'feelings' || name.includes('feeling') || name.includes('emotion');
            const isPeople = id === 'people' || name.includes('people') || name.includes('visitor');

            return isCommunication || isFeelings || isPeople;
          }).map(cat => {
            const categoryHindiNames: Record<string, string> = {
              emergency: 'इमरजेंसी',
              medical: 'दवा-दारू',
              position: 'करवट / पोज़ीशन',
              basic_needs: 'ज़रूरतें',
              daily_care: 'रोज़ देखभाल',
              communication: 'बातचीत',
              people: 'परिवार',
              feelings: 'भावनाएं',
            };
            return (
              <PhrasesCategoryButton
                key={cat.id}
                category={{ ...cat, nameHi: categoryHindiNames[cat.id] }}
                icon={CATEGORY_ICONS[cat.id] || MessageIcon}
                isSelected={selectedCategory === cat.id}
                onSelect={() => setSelectedCategory(cat.id)}
                isDarkMode={isDarkMode}
                showHindi={showHindi}
                gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                textColor={sidebarText}
                inactiveIconColor={inactiveIcon}
                selectedBg={selectedBg}
              />
            );
          })}
        </div>

        {/* ===== RIGHT SIDE — Phrase Cards ===== */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          position: 'relative',
        }}>
          {/* Category Title */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: 'clamp(14px, 1.8vh, 22px)',
            paddingLeft: '8px',
          }}>
            {isRecentSelected ? (
              // Recent tab header
              <svg width={34} height={34} viewBox="0 0 24 24" fill="none"
                  stroke={isWarmMode ? SELECTED_COLOR : lightColors.warning.main} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            ) : (
              React.createElement(CATEGORY_ICONS[selectedCategoryData!.id] || MessageIcon, { size: 34, color: isWarmMode ? SELECTED_COLOR : lightColors.warning.main })
            )}
            <h2 style={{
              fontSize: 'clamp(28px, 3.2vh, 40px)',
              fontWeight: 700,
              color: titleText,
              margin: 0,
              fontFamily: ENGLISH_UI_FONT,
            }}>
              {isRecentSelected ? 'Recent' : selectedCategoryData!.name}
            </h2>
          </div>

          {/* Phrase Cards Grid - Enhanced aesthetics */}
          <div style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gridAutoRows: 'minmax(clamp(120px, 14.5vh, 180px), auto)',
            gap: 'clamp(14px, 2.2vh, 28px)',
            overflowY: 'auto',
            alignContent: 'start',
            padding: '4px 8px clamp(90px, 12vh, 140px) 8px',
          }}>
            {displayedPhrases.length === 0 && isRecentSelected ? (
              // Empty state for Recent tab
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: '100%', gap: '16px', opacity: 0.5,
              }}>
                <svg width={48} height={48} viewBox="0 0 24 24" fill="none"
                  stroke={isDarkMode ? ACCENT_TEAL : lightColors.text.tertiary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span style={{ fontSize: '18px', color: colors.text.secondary, fontFamily: ENGLISH_UI_FONT }}>
                  Phrases you speak will appear here
                </span>
              </div>
            ) : displayedPhrases.map((phrase, index) => (
              <GazeButton
                key={index}
                id={`phrase-${index}`}
                className="phrase-card"
                size="lg"
                context="phrases"
                onClick={() => handlePhraseClick(phrase, index)}
                isDarkMode={isDarkMode}
                gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                style={{
                  width: '100%',
                  height: 'auto',
                  minHeight: 'clamp(120px, 14.5vh, 180px)',
                  padding: 'clamp(18px, 2.2vh, 26px) clamp(18px, 2vw, 28px)',
                  background: phraseCardBg,
                  border: activatedIdx === index ? `2px solid ${isMix ? '#8B6F49' : isWarmMode ? '#D6C98E' : colors.accent.main}` : phraseCardBorder,
                  borderRadius: '20px',
                  boxShadow: activatedIdx === index ? (isWarmMode ? '0 0 0 1px rgba(213,216,188,0.20), 0 8px 18px rgba(0,0,0,0.20)' : '0 8px 24px rgba(139, 121, 104, 0.12), 0 2px 6px rgba(139, 121, 104, 0.08)') : phraseShadow,
                  transition: 'border 0.15s ease, box-shadow 0.15s ease',
                  transform: activatedIdx === index ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0px',
                  textAlign: 'center',
                  width: '100%',
                }}>
                  {/* English text - Beautiful, clear font */}
                  <span style={{
                    fontSize: 'clamp(22px, 2.6vh, 34px)',
                    fontWeight: 600,
                    color: phraseText,
                    lineHeight: 1.15,
                    fontFamily: ENGLISH_UI_FONT,
                    letterSpacing: '0.1px',
                  }}>
                    {phrase.en}
                  </span>
                  {/* Hindi text - Beautiful, clear Devanagari font */}
                  {showHindi && phrase.hi && (
                    <>
                      <div style={{ width: '36px', height: '1.5px', background: 'rgba(255,255,255,0.18)', borderRadius: '1px', margin: '7px auto 4px' }} />
                      <span style={{
                        fontSize: 'clamp(22px, 2.6vh, 34px)',
                        fontWeight: 700,
                        color: 'rgba(255, 210, 140, 0.95)',
                        lineHeight: 1.5,
                        fontFamily: "'Noto Sans Devanagari', sans-serif",
                        letterSpacing: '0.02em',
                      }}>
                        {phrase.hi}
                      </span>
                    </>
                  )}
                </div>
              </GazeButton>
            ))}
          </div>

          {/* Gaze toggle provided by GlobalNavBar at fixed bottom-center */}
        </div>
      </div>
    </div>
  );
};

export default React.memo(PhrasesScreen);
