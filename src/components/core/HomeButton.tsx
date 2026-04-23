/**
 * GazeConnect Pro — Large Home Button
 * ====================================
 * Big, easy-to-gaze-on button for ALS patients.
 * Placed at top-center of every non-home screen.
 */

import React from 'react';
import { darkColors, lightColors } from '../../utils/design';

interface HomeButtonProps {
  onNavigate: (screen: string) => void;
  isDarkMode?: boolean;
  /** Optional: show current screen name next to Home */
  screenTitle?: string;
}

const HomeButton: React.FC<HomeButtonProps> = ({
  onNavigate,
  isDarkMode = true,
  screenTitle,
}) => {
  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: '6px 12px',
      width: '100%',
    }}>
      {/* BIG HOME BUTTON */}
      <button
        id="btn-home"
        onClick={() => onNavigate('home')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '14px 48px',
          minWidth: 200,
          minHeight: 56,
          backgroundColor: colors.accent.subtle,
          border: `3px solid ${colors.accent.main}`,
          borderRadius: 16,
          color: colors.accent.main,
          fontSize: 22,
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'transform 100ms ease, background-color 100ms ease',
          letterSpacing: '0.5px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = colors.accent.main;
          e.currentTarget.style.color = '#FFFFFF';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = colors.accent.subtle;
          e.currentTarget.style.color = colors.accent.main;
        }}
        aria-label="Go to Home screen"
      >
        {/* Home icon */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        HOME
      </button>

      {/* Screen title (if provided) */}
      {screenTitle && (
        <h1 style={{
          fontSize: 20,
          fontWeight: 700,
          color: colors.text.primary,
          margin: 0,
        }}>
          {screenTitle}
        </h1>
      )}
    </div>
  );
};

export default HomeButton;
