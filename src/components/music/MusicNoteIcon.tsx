import React from 'react';

interface MusicNoteIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

/** Home's Music tile: two beamed notes, drawn like the other Home tile icons (24-unit strokes). */
export const MusicNoteIcon: React.FC<MusicNoteIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);
