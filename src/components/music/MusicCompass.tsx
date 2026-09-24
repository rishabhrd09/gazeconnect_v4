/**
 * Music: the four-way compass every Music screen is built on. One choice above, one to each side,
 * one below, thin dividers between them, and a passive centre where the eyes can rest without
 * choosing anything. The choices are the app's own GazeButtons (dwell, gaze and mouse as elsewhere);
 * only their paint is Music's (music.css).
 */
import React from 'react';
import GazeButton from '../core/GazeButton';
import type { DwellAction } from '../../config/dwellTimeConfig';
import './music.css';

export interface MusicGaze {
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  isDarkMode: boolean;
}

/** left / right: the two sides' colours; accent: above and below; plain: quiet actions. */
export type MusicTone = 'left' | 'right' | 'accent' | 'plain';

const GLYPHS: Record<string, React.ReactNode> = {
  back: <path d="M19 12H5 M11 6l-6 6 6 6" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  more: <path d="M5 12h.01 M12 12h.01 M19 12h.01" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  pause: <path d="M8 5v14 M16 5v14" />,
  previous: <path d="M6 5v14 M19 5.5v13L9 12z" />,
  next: <path d="M18 5v14 M5 5.5v13L15 12z" />,
  stop: <path d="M7 7h10v10H7z" />,
};

export const MusicGlyph: React.FC<{ name: keyof typeof GLYPHS }> = ({ name }) => (
  <svg className={`music-glyph music-glyph--${name}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={name === 'more' ? 4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {GLYPHS[name]}
  </svg>
);

// The GazeButton's own paint is replaced; its geometry comes from the compass cell it fills.
const CHOICE_STYLE: React.CSSProperties = {
  width: '100%',
  height: '100%',
  padding: 'clamp(10px, 1.8vh, 22px) clamp(12px, 1.4vw, 26px)',
  backgroundColor: 'var(--mu-raised)',
  border: '1.5px solid var(--mu-edge)',
  borderRadius: '22px',
  boxShadow: 'none',
  color: 'var(--mu-text)',
  transform: 'none',
  transition: 'border-color 160ms ease',
  cursor: 'pointer',
};

interface MusicChoiceProps {
  id: string;
  label: string;
  sub?: string;
  tone?: MusicTone;
  glyph?: keyof typeof GLYPHS;
  /** 'side': the tall left and right choices; 'edge': the choices above and below. */
  shape?: 'side' | 'edge' | 'song';
  onSelect: () => void;
  dwellCategory?: DwellAction;
  gaze: MusicGaze;
  ariaLabel?: string;
}

export const MusicChoice: React.FC<MusicChoiceProps> = ({
  id, label, sub, tone = 'accent', glyph, shape = 'side', onSelect, dwellCategory = 'navigationButton', gaze, ariaLabel,
}) => (
  <GazeButton
    id={id}
    onClick={onSelect}
    dwellCategory={dwellCategory}
    ariaLabel={ariaLabel ?? (sub ? `${label}, ${sub}` : label)}
    className={`music-choice music-choice--${tone} music-choice--${shape}`}
    isDarkMode={gaze.isDarkMode}
    gazeEnabled={gaze.gazeEnabled}
    gazeEnabledTimestamp={gaze.gazeEnabledTimestamp}
    contentFill
    style={CHOICE_STYLE}
  >
    <span className="music-choice-body">
      {glyph && <MusicGlyph name={glyph} />}
      <span className="music-choice-label music-serif">{label}</span>
      {sub && <span className="music-choice-sub">{sub}</span>}
    </span>
  </GazeButton>
);

/** The passive centre: nothing here can be chosen. */
export const MusicRest: React.FC<{ label?: string }> = ({ label }) => (
  <div className="music-rest">
    <span className="music-rest-ring" aria-hidden="true"><span className="music-rest-dot" /></span>
    {label && <h1 className="music-rest-label">{label}</h1>}
  </div>
);

interface MusicCompassProps {
  /** 'choices': large sides, a narrow resting centre. 'wide': narrow sides around a wide centre. */
  variant?: 'choices' | 'wide';
  /** The row above holds a passive heading rather than a choice (it is shorter). */
  headerRow?: boolean;
  top?: React.ReactNode;
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  bottom?: React.ReactNode;
  /** One message across the whole middle row, in place of left, centre and right. */
  message?: React.ReactNode;
}

export const MusicCompass: React.FC<MusicCompassProps> = ({
  variant = 'choices', headerRow = false, top, left, center, right, bottom, message,
}) => (
  <div className={`music-compass music-compass--${variant}${headerRow ? ' music-compass--header' : ''}`}>
    <div className="music-slot music-slot-top">{top}</div>
    <div className="music-rule music-rule-h music-rule-top" aria-hidden="true" />
    {message !== undefined ? (
      <div className="music-slot music-slot-message">{message}</div>
    ) : (
      <>
        <div className="music-slot music-slot-left">{left}</div>
        <div className="music-rule music-rule-v music-rule-left" aria-hidden="true" />
        <div className="music-slot music-slot-center">{center}</div>
        <div className="music-rule music-rule-v music-rule-right" aria-hidden="true" />
        <div className="music-slot music-slot-right">{right}</div>
      </>
    )}
    <div className="music-rule music-rule-h music-rule-bottom" aria-hidden="true" />
    <div className="music-slot music-slot-bottom">{bottom}</div>
  </div>
);

/** An edge choice (above or below) keeps one width, centred in its row. */
export const MusicEdge: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="music-edge">{children}</div>
);
