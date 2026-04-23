/**
 * GazeConnect Pro - Home Screen (v9.0 — Text-Only Emergency Dispatch, Card Scale, Clock Fix)
 * Responsive: 13"-27" screens via clamp()/min() - identical on 23" (1920x1080)
 */
import React, { useCallback, useState, useRef, useEffect } from 'react';
import { screenThemes } from '../utils/design';
import GazeButton from '../components/core/GazeButton';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useCustomization } from '../contexts/CustomizationContext';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useTheme } from '../contexts/ThemeContext';
import {
  BellIcon, KeyboardIcon,
  FamilyIcon, SettingsIcon,
  GridIcon, TVIcon, ChatBubblesIcon, GlobalIcon,
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

const PANEL_GAP = 'clamp(12px, 2.2vh, 26px)';

const vDividerStyle: React.CSSProperties = {
  width: '1px',
  flexShrink: 0,
  alignSelf: 'stretch',
  marginLeft: 'clamp(18px, 2vw, 30px)',
  marginRight: 'clamp(18px, 2vw, 30px)',
  background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.03) 12%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.03) 88%, transparent 100%)',
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
    bgOverride: 'linear-gradient(145deg, rgba(12,18,36,0.95) 0%, rgba(8,14,28,0.98) 100%)',
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
  const { homeQuickActions, data: { quickWords, homeEmergencyCards } } = useCustomization();
  const { isLight } = useTheme();

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

  useEffect(() => {
    return () => { if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current); };
  }, []);

  const THEME = screenThemes.home;
  const ENGLISH_UI_FONT = "'Atkinson Hyperlegible Next', 'Inter', 'Segoe UI', system-ui, sans-serif";

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
    background: '#1E2630',
    border: '2px solid rgba(90, 110, 130, 0.3)',
    borderRadius: '28px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
  };

  const gridItems: HomeTile[] = [
    { id: 'kb', label: 'Keyboard', labelHi: 'कीबोर्ड', icon: KeyboardIcon, color: THEME.tealIcon, screen: 'keyboard', cardClass: 'grid-card-keyboard' },
    { id: 'ph', label: 'Phrases\n& Chat', labelHi: 'बातचीत', icon: ChatBubblesIcon, color: THEME.tealIcon, screen: 'phrases', cardClass: 'grid-card-communication' },
    { id: 'ac', label: 'Activities', labelHi: 'मनोरंजन', icon: TVIcon, color: THEME.tealIcon, screen: 'activities', cardClass: 'grid-card-activities' },
    { id: 'pp', label: 'People', labelHi: 'परिवार', icon: FamilyIcon, color: THEME.tealIcon, screen: 'people', cardClass: 'grid-card-people' },
    { id: 'med', label: 'Assistance', labelHi: 'देखभाल', subLabel: 'Daily Care', icon: BellIcon, color: THEME.tealIcon, screen: 'medical', cardClass: 'grid-card-assistance' },
    { id: 'st', label: 'Settings', labelHi: 'सेटिंग', icon: SettingsIcon, color: THEME.tealIcon, screen: 'settings', cardClass: 'grid-card-settings' },
  ];

  const rightPanelTiles: HomeTile[] = [
    { id: 'web', label: 'Web Browsing', labelHi: 'वेब ब्राउज़िंग', icon: GlobalIcon, color: THEME.tealIcon, screen: 'web', cardClass: 'grid-card-web' },
    { id: 'fp', label: 'Design Home', labelHi: 'घर का नक्शा', icon: GridIcon, color: THEME.tealIcon, screen: 'floor-plan', cardClass: 'grid-card-design' },
  ];

  const iconStyle = {
    marginBottom: 'clamp(8px, 1.8vh, 18px)',
    opacity: 1,
    display: 'block',
    // 5.5vh = ~59px at 1080p, ~44px at 800p — hits AAC 35-50% card-face target
    width: 'clamp(38px, 5.5vh, 66px)',
    height: 'clamp(38px, 5.5vh, 66px)',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 'clamp(19px, 2.7vh, 27px)',
    fontWeight: 600,
    color: '#FFF',
    letterSpacing: 'clamp(0.5px, 0.1vw, 1px)',
    textTransform: 'uppercase' as const,
    fontFamily: "'Outfit', sans-serif",
    whiteSpace: 'pre-wrap' as const,
    lineHeight: '1.2',
    textAlign: 'center' as const,
  };

  // Use independent home emergency cards; fallback to old quickWords behavior if empty
  const homeCards = homeEmergencyCards?.filter(c => c.enabled) ?? [];
  const prioritizedEmergencyWords = homeCards.length > 0
    ? homeCards.slice(0, 4)
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

  return (
    <div className={`home-screen${isLight ? ' theme-light' : ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: THEME.bg,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: '25px', left: '35px', zIndex: 1000, opacity: 0.6, pointerEvents: 'none',
      }}>
        <span className="brand-title" style={{ fontSize: '14px', fontWeight: 600, color: '#6E7681', fontFamily: "'Inter', sans-serif", letterSpacing: '2px' }}>
          GAZECONNECT
        </span>
      </div>

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
            // Priority-driven color coding with user-selectable color schemes
            const HIGH_COLOR_MAP = {
              red: { bg: 'linear-gradient(145deg, #6B3E3E 0%, #583333 100%)', shadow: '#6B3E3E' },
              crimson: { bg: 'linear-gradient(145deg, #5C3454 0%, #4D2B47 100%)', shadow: '#5C3454' },
              muted_red: { bg: 'linear-gradient(145deg, #563636 0%, #472D2D 100%)', shadow: '#563636' },
              muted_crimson: { bg: 'linear-gradient(145deg, #4A2B42 0%, #3D2438 100%)', shadow: '#4A2B42' },
            };
            const MEDIUM_COLOR_MAP = {
              blue: { bg: 'linear-gradient(145deg, #3E5B6B 0%, #334D5C 100%)', shadow: '#3E5B6B' },
              golden: { bg: 'linear-gradient(145deg, #6B5B3E 0%, #5C4D33 100%)', shadow: '#6B5B3E' },
              teal: { bg: 'linear-gradient(145deg, #3E6B58 0%, #335C4A 100%)', shadow: '#3E6B58' },
              muted_blue: { bg: 'linear-gradient(145deg, #344E5C 0%, #2C4250 100%)', shadow: '#344E5C' },
              muted_golden: { bg: 'linear-gradient(145deg, #5C5036 0%, #4D442E 100%)', shadow: '#5C5036' },
              muted_teal: { bg: 'linear-gradient(145deg, #355C4C 0%, #2D4E40 100%)', shadow: '#355C4C' },
            };
            const highColorKey = quickWords?.highColor ?? 'red';
            const mediumColorKey = quickWords?.mediumColor ?? 'blue';
            const PRIORITY_COLORS = {
              high: HIGH_COLOR_MAP[highColorKey],
              medium: MEDIUM_COLOR_MAP[mediumColorKey],
            };
            const NAV_BG = '#1A202C';
            const DOCK_LABELS = [
              ...prioritizedEmergencyWords.map((word) => {
                const priority = word.priority ?? 'high';
                return {
                  text: word.en.replace(/\s+/g, '\n'),
                  textHi: word.hi,
                  spoken: word.en,
                  empty: false,
                  bg: PRIORITY_COLORS[priority].bg,
                  bgShadow: PRIORITY_COLORS[priority].shadow,
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
                    background: 'rgba(255, 255, 255, 0.15)',
                  }} />
                </div>
                {DOCK_LABELS.map((item, i) => {
                  const btnId = `dock-${i}`;
                  const isActivated = activatedBtnId === btnId;
                  const isNav = i >= 4; // "More Words" card
                  const isEmpty = !isNav && item.empty;
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
                          borderRadius: '32px',
                          background: 'rgba(30, 35, 45, 0.35)',
                          border: '1.5px dashed rgba(255, 255, 255, 0.1)',
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
                        handleQuickcall(item.spoken, btnId, bgShadow!);
                      }}
                      className={`quickcall-btn${isLight ? ' theme-light' : ''}`}
                      isDarkMode={isDarkMode}
                      gazeEnabled={isGazeEnabled}
                      gazeEnabledTimestamp={lastEnabledTimestamp}
                      dwellCategory={i < 4 ? 'emergencyButton' : 'homeScreenTile'}
                      style={{
                        width: isNav ? '70%' : '100%',
                        height: '100%',
                        gridRow: isNav ? 4 : undefined,
                        gridColumn: isNav ? '1 / -1' : undefined,
                        justifySelf: isNav ? 'center' : undefined,
                        borderRadius: isNav ? '999px' : '28px',
                        background: isNav ? NAV_BG : bg,
                        border: isNav ? `1px solid rgba(255, 255, 255, 0.08)` : 'none',
                        boxShadow: isActivated
                          ? isNav ? '0 0 20px rgba(45, 55, 72, 0.6)' : `0 0 16px ${bgShadow}40`
                          : 'none',
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
                            fontSize: i < 4 ? 'clamp(24px, 3vh, 32px)' : 'clamp(22px, 2.8vh, 32px)',
                            fontWeight: i < 4 ? 900 : 700,
                            color: '#FFFFFF',
                            lineHeight: 1.1,
                            textAlign: 'center',
                            fontFamily: "'Outfit', sans-serif",
                            whiteSpace: 'pre-wrap',
                            letterSpacing: i < 4 ? '1.5px' : '0.5px',
                            textTransform: i < 4 ? 'uppercase' : 'none',
                            textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                          }}>
                            {item.text}
                          </span>
                          {showHindi && item.textHi && (
                            <>
                              <div style={{
                                width: '28px', height: '1px', background: 'rgba(255,255,255,0.2)',
                                borderRadius: '1px',
                                margin: i >= 4 ? '10px auto 6px' : '10px auto 6px'
                              }} />
                              <span style={{
                                fontSize: i < 4 ? 'clamp(24px, 3.2vh, 34px)' : 'clamp(24px, 3vh, 34px)',
                                fontWeight: 700,
                                color: 'rgba(255, 210, 140, 0.95)',
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
                            fontWeight: 300,
                            color: isActivated ? '#91CBE4' : 'rgba(255,255,255,0.5)',
                            lineHeight: 1,
                            textShadow: isActivated ? '0 0 12px rgba(145,203,228,0.6)' : 'none',
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

          <div style={vDividerStyle} />

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
                className={`grid-card ${tile.cardClass}${isLight ? ' theme-light' : ''}`}
                onClick={() => onNavigate(tile.screen)}
                isDarkMode={isDarkMode}
                gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                dwellCategory="homeScreenTile"
                style={{
                  ...cardStyle,
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <tile.icon size={52} color={tile.color} strokeWidth={2.5} style={iconStyle} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', marginTop: 'clamp(4px, 1vh, 12px)' }}>
                  <span className="grid-card-label" style={labelStyle}>
                    {tile.label}
                  </span>
                  {showHindi && tile.labelHi ? (
                    <>
                      <div style={{ width: '32px', height: '1.5px', background: 'rgba(255,255,255,0.18)', borderRadius: '2px', margin: '6px auto 4px' }} />
                      <span style={{
                        fontSize: 'clamp(22px, 3vh, 32px)',
                        fontWeight: 700,
                        color: 'rgba(255, 210, 140, 0.95)',
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
                      fontSize: 'clamp(12px, 1.6vh, 17px)',
                      fontWeight: 400,
                      color: THEME.tealIcon,
                      opacity: 0.7,
                      letterSpacing: 'clamp(0.3px, 0.05vw, 0.8px)',
                      fontFamily: "'Outfit', sans-serif",
                      textAlign: 'center' as const,
                    }}>
                      {tile.subLabel}
                    </span>
                  ) : null}
                </div>
              </GazeButton>
            ))}
          </div>

          <div style={vDividerStyle} />

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
                className={`grid-card ${tile.cardClass}${isLight ? ' theme-light' : ''}`}
                onClick={() => onNavigate(tile.screen)}
                isDarkMode={isDarkMode}
                gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                dwellCategory="homeScreenTile"
                style={{
                  ...cardStyle,
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <tile.icon size={52} color={tile.color} strokeWidth={2.5} style={iconStyle} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', marginTop: 'clamp(4px, 1vh, 12px)' }}>
                  <span className="grid-card-label" style={labelStyle}>
                    {tile.label}
                  </span>
                  {showHindi && tile.labelHi && (
                    <>
                      <div style={{ width: '32px', height: '1.5px', background: 'rgba(255,255,255,0.18)', borderRadius: '2px', margin: '6px auto 4px' }} />
                      <span style={{
                        fontSize: 'clamp(22px, 3vh, 32px)',
                        fontWeight: 700,
                        color: 'rgba(255, 210, 140, 0.95)',
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
            background: 'rgba(8, 12, 22, 0.96)',
            border: `2px solid ${activatedColor}50`,
            boxShadow: `0 12px 80px rgba(0, 0, 0, 0.75), 0 0 40px ${activatedColor}18`,
            backdropFilter: 'none',
          }}>
            <span style={{
              fontSize: 'clamp(48px, 8vh, 96px)',
              fontWeight: 800,
              color: activatedColor,
              fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
              letterSpacing: '3px',
              textAlign: 'center',
              textTransform: 'uppercase',
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
