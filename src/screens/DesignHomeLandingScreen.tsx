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
import { darkColors } from '../utils/design';
import { useTheme } from '../contexts/ThemeContext';

interface DesignHomeLandingScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

const THEME = {
  bg: '#0B1120',
  textMain: '#E8EDF5',
  textSub: '#8896AB',
  textDim: '#5A6577',
  accent: '#64B5F6',
  cardBg: 'rgba(30, 41, 59, 0.6)',
  border: 'rgba(100, 116, 139, 0.15)',
};

function DesignHomeLandingScreen({ onNavigate, onSpeak, isDarkMode = true }: DesignHomeLandingScreenProps) {
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight } = useTheme();

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
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64B5F6" strokeWidth="1.5">
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
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      ),
    }
  ];

  return (
    <div className={`design-home-screen${isLight ? ' theme-light' : ''}`} style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: THEME.bg,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <GlobalNavBar currentPage="design-home" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} />

      {/* Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '24px',
        paddingTop: 'clamp(20px, 4vh, 60px)',
        paddingBottom: 'clamp(36px, 6vh, 80px)',
        gap: '16px',
        minHeight: 0,
      }}>
        <h1 style={{
          fontSize: 'clamp(24px, 3.5vh, 36px)',
          fontWeight: 700,
          color: THEME.textMain,
          marginBottom: '8px',
          textAlign: 'center',
        }}>
          Design Your Home
        </h1>
        <p style={{
          fontSize: 'clamp(14px, 1.8vh, 18px)',
          color: THEME.textSub,
          marginBottom: '24px',
          textAlign: 'center',
          maxWidth: '500px',
        }}>
          Choose how you want to plan your floor layout.
        </p>

        {/* Two Tiles */}
        <div style={{
          display: 'flex',
          gap: 'clamp(20px, 3vw, 40px)',
          justifyContent: 'center',
          flexWrap: 'wrap',
          maxWidth: '900px',
          width: '100%',
        }}>
          {tiles.map(tile => (
            <GazeButton
              key={tile.id}
              id={`landing-${tile.id}`}
              className="design-card"
              onClick={() => handleTileNavigate(tile.screen, tile.title)}
              gazeEnabled={isGazeEnabled}
              gazeEnabledTimestamp={lastEnabledTimestamp}
              isDarkMode={true}
              dwellCategory="navigationButton"
              style={{
                flex: '1 1 320px',
                maxWidth: '420px',
                minHeight: 'clamp(180px, 28vh, 260px)',
                padding: 'clamp(24px, 3vh, 40px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                background: THEME.cardBg,
                border: `2px solid ${THEME.border}`,
                borderRadius: '20px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '16px',
                background: 'rgba(100, 181, 246, 0.08)',
                border: '1px solid rgba(100, 181, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {tile.icon}
              </div>
              <div style={{
                fontSize: 'clamp(20px, 2.8vh, 28px)',
                fontWeight: 700,
                color: THEME.textMain,
              }}>
                {tile.title}
              </div>
              <div style={{
                fontSize: 'clamp(13px, 1.6vh, 16px)',
                color: THEME.textSub,
                lineHeight: 1.4,
                maxWidth: '280px',
              }}>
                {tile.subtitle}
              </div>
            </GazeButton>
          ))}
        </div>
      </div>

      {/* Floating Gaze Toggle */}
      {/* Gaze toggle provided by GlobalNavBar at fixed bottom-center */}
    </div>
  );
}

export default React.memo(DesignHomeLandingScreen);
