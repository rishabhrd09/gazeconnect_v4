/**
 * QuickWordsOverlay - Full-screen overlay for Keyboard/ZoneBoard
 * ==============================================================
 * Uses shared QuickWordsGrid for visual consistency with QuickWordsScreen.
 * Selecting a word fires onWordSelect and closes the overlay.
 */
import React from 'react';
import GazeButton from './core/GazeButton';
import QuickWordsGrid from './shared/QuickWordsGrid';
import type { QuickWord, QuickWordCategory, CoreWord } from '../types/customization';

interface QuickWordsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  categories: QuickWordCategory[];
  coreWords?: CoreWord[];
  onWordSelect: (word: QuickWord) => void;
  isDarkMode: boolean;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  showHindi?: boolean;
}

const QuickWordsOverlay: React.FC<QuickWordsOverlayProps> = ({
  isOpen,
  onClose,
  categories,
  coreWords,
  onWordSelect,
  isDarkMode,
  gazeEnabled,
  gazeEnabledTimestamp,
  showHindi = false,
}) => {
  if (!isOpen) return null;

  const handleWordSelect = (word: QuickWord) => {
    onWordSelect(word);
    onClose();
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        background: '#0A0F17',
        display: 'flex',
        flexDirection: 'column',
        padding: 'clamp(14px, 1.8vh, 24px) clamp(24px, 3.2vw, 44px)',
        gap: 'clamp(10px, 1.3vh, 18px)',
        fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
      }}
    >
      {/* Header: Close button + Title side by side */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(18px, 2.5vw, 36px)', flexShrink: 0 }}>
        {/* Close button */}
        <GazeButton
          id="quick-words-close"
          onClick={onClose}
          isDarkMode={isDarkMode}
          gazeEnabled={gazeEnabled}
          gazeEnabledTimestamp={gazeEnabledTimestamp}
          dwellCategory="navigationButton"
          style={{
            width: 'clamp(180px, 14vw, 260px)',
            height: 'clamp(80px, 9vh, 110px)',
            borderRadius: '24px',
            background: '#1E2630',
            border: '2px solid rgba(90, 110, 130, 0.35)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            color: '#DCE4EE',
            fontSize: 'clamp(22px, 2.8vh, 32px)',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(8px, 1vw, 14px)',
            textAlign: 'center',
            lineHeight: 1,
            letterSpacing: '0.05em',
          }}
        >
          <span style={{ fontSize: 'clamp(18px, 2.2vh, 26px)' }}>✕</span>
          CLOSE
        </GazeButton>

        {/* Title + subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{
            color: '#E6EBF2',
            fontSize: 'clamp(24px, 3vh, 36px)',
            fontWeight: 800,
            letterSpacing: '0.06em',
          }}>
            QUICK WORDS
          </span>
          <span style={{
            color: '#2DD4BF',
            fontSize: 'clamp(13px, 1.6vh, 18px)',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}>
            TAP A WORD TO INSERT INTO TEXT
          </span>
        </div>
      </div>

      {/* Shared Quick Words Grid */}
      <QuickWordsGrid
        categories={categories}
        coreWords={coreWords}
        onWordSelect={handleWordSelect}
        isDarkMode={isDarkMode}
        gazeEnabled={gazeEnabled}
        gazeEnabledTimestamp={gazeEnabledTimestamp}
        showHindi={showHindi}
        idPrefix="qwo"
      />
    </div>
  );
};

export default QuickWordsOverlay;
