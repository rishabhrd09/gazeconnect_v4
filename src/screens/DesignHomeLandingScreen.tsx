/**
 * DesignHomeLandingScreen — Entry point for Design Home
 * =====================================================
 * Two large gaze-selectable tiles:
 *   1. Survey Design → FloorPlanSurveyScreen
 *   2. Compass Map   → CompassMapScreen
 */

import React, { useCallback } from 'react';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { mixColors } from '../utils/design';
import { useTheme } from '../contexts/ThemeContext';

interface DesignHomeLandingScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

const DARK_PAGE = {
  bg: '#0B1120',
  title: '#E8EDF5',
  subtitle: '#9BA8BA',
  cardBg: 'rgba(30, 41, 59, 0.68)',
  cardBorder: 'rgba(100, 116, 139, 0.22)',
  cardShadow: '0 10px 24px rgba(0,0,0,0.22)',
  icon: '#64B5F6',
  iconBg: 'rgba(100, 181, 246, 0.08)',
  iconBorder: 'rgba(100, 181, 246, 0.16)',
  titleText: '#E8EDF5',
  bodyText: '#9BA8BA',
};

function DesignHomeLandingScreen({ onNavigate, onSpeak, isDarkMode = true }: DesignHomeLandingScreenProps) {
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight, isMix } = useTheme();

  const pageTheme = isMix ? {
    bg: mixColors.home.root,
    title: '#F0E2C4',
    subtitle: '#CDB98E',
    cardBg: mixColors.home.tileSurfaces.fp,
    cardBorder: mixColors.home.cardBorder,
    cardShadow: mixColors.home.cardShadow,
    icon: '#4E6E69',
    iconBg: 'rgba(78, 110, 105, 0.10)',
    iconBorder: 'rgba(78, 110, 105, 0.24)',
    titleText: mixColors.home.text,
    bodyText: mixColors.home.subtleText,
  } : isLight ? {
    bg: '#E6D7BA',
    title: '#5A4530',
    subtitle: '#6E5A42',
    cardBg: '#BFB694',
    cardBorder: 'rgba(122, 99, 71, 0.32)',
    cardShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 18px rgba(82, 62, 38, 0.14)',
    icon: '#3F5E5A',
    iconBg: 'rgba(63, 94, 90, 0.08)',
    iconBorder: 'rgba(63, 94, 90, 0.22)',
    titleText: '#3B2D20',
    bodyText: '#6E5A42',
  } : DARK_PAGE;

  const handleTileNavigate = useCallback((screen: string, title: string) => {
    onSpeak(`Opening ${title}.`);
    onNavigate(screen);
  }, [onNavigate, onSpeak]);

  const tiles = [
    {
      id: 'survey-design',
      screen: 'floor-plan-survey',
      title: 'Survey Design',
      subtitle: 'Step-by-step guided survey to plan your home layout through questions.',
      icon: (
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
          <path d="M13 13h4M13 17h4" />
        </svg>
      ),
    },
    {
      id: 'compass-map',
      screen: 'compass-map',
      title: 'Compass Map',
      subtitle: 'Visual 4x4 grid tool to place rooms directly on your plot map.',
      icon: (
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      ),
    },
  ];

  return (
    <div className={`design-home-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : ''}`} style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: pageTheme.bg,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <GlobalNavBar currentPage="design-home" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} />

      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: 'clamp(28px, 4vh, 48px) clamp(40px, 6vw, 96px) clamp(80px, 10vh, 128px)',
        gap: 'clamp(30px, 4vh, 46px)',
        minHeight: 0,
      }}>
        <header style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 'clamp(10px, 1.4vh, 16px)',
          maxWidth: '720px',
        }}>
          <h1 style={{
            fontSize: 'clamp(30px, 4.3vh, 46px)',
            fontWeight: 780,
            color: pageTheme.title,
            margin: 0,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
          }}>
            Design Your Home
          </h1>
          <p style={{
            fontSize: 'clamp(16px, 2vh, 21px)',
            color: pageTheme.subtitle,
            margin: 0,
            lineHeight: 1.35,
          }}>
            Choose how you want to plan your floor layout.
          </p>
        </header>

        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
          gap: 'clamp(28px, 3.5vw, 48px)',
          justifyContent: 'stretch',
          maxWidth: '1080px',
          width: '100%',
        }}>
          {tiles.map((tile) => (
            <GazeButton
              key={tile.id}
              id={`landing-${tile.id}`}
              className="design-card"
              onClick={() => handleTileNavigate(tile.screen, tile.title)}
              gazeEnabled={isGazeEnabled}
              gazeEnabledTimestamp={lastEnabledTimestamp}
              isDarkMode={isDarkMode}
              dwellCategory="navigationButton"
              style={{
                width: '100%',
                minHeight: 'clamp(250px, 32vh, 340px)',
                padding: 'clamp(28px, 4vh, 48px) clamp(28px, 3.4vw, 48px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0,
                background: pageTheme.cardBg,
                border: `1.5px solid ${pageTheme.cardBorder}`,
                borderRadius: '24px',
                boxShadow: pageTheme.cardShadow,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{
                width: 'clamp(74px, 8.2vh, 92px)',
                height: 'clamp(74px, 8.2vh, 92px)',
                background: 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: pageTheme.icon,
                flexShrink: 0,
                marginBottom: 'clamp(30px, 3.8vh, 46px)',
              }}>
                {tile.icon}
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'clamp(10px, 1.3vh, 14px)',
                maxWidth: '390px',
              }}>
                <div style={{
                  fontSize: 'clamp(28px, 3.45vh, 36px)',
                  fontWeight: 780,
                  color: pageTheme.titleText,
                  lineHeight: 1.08,
                  letterSpacing: '-0.015em',
                  fontFamily: "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif",
                }}>
                  {tile.title}
                </div>
                <div style={{
                  fontSize: 'clamp(16px, 1.95vh, 20px)',
                  fontWeight: 650,
                  color: pageTheme.bodyText,
                  lineHeight: 1.35,
                  maxWidth: '360px',
                }}>
                  {tile.subtitle}
                </div>
              </div>
            </GazeButton>
          ))}
        </section>
      </main>
    </div>
  );
}

export default React.memo(DesignHomeLandingScreen);
