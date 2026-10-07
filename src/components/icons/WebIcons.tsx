/**
 * Line icons for the web-browsing screens (6 Oct 2026 redesign), drawn in the same
 * style as Icons.tsx: a 24-unit grid, round caps and joins, currentColor strokes, so
 * one accent colour and stroke width read the same on every card and button.
 */
import React from 'react';

type WebIconProps = { size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties };

const Svg: React.FC<WebIconProps & { children: React.ReactNode }> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
    {children}
  </svg>
);

export const NewspaperIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M4 5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2Z" />
    <path d="M17 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2" />
    <path d="M8 8h5v4H8Z" />
    <path d="M8 15.5h5" />
  </Svg>
);

export const SearchLineIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </Svg>
);

export const ChatsIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2Z" />
    <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
  </Svg>
);

export const PlayBoxIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <rect x="2" y="5" width="20" height="14" rx="4" />
    <path d="m10 9 5 3-5 3Z" />
  </Svg>
);

export const LandmarkIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M3 21h18" />
    <path d="M5 21v-9M9.5 21v-9M14.5 21v-9M19 21v-9" />
    <path d="M2.5 9.5 12 4l9.5 5.5Z" />
  </Svg>
);

export const CricketIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M15.3 6.3 17.7 8.7 9.7 16.7 7.3 14.3Z" />
    <path d="M8.5 15.5 4 20" />
    <circle cx="18" cy="18" r="2.2" />
  </Svg>
);

export const FlaskIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M9 3h6" />
    <path d="M10 3v6.5l-5.4 8.7A1.8 1.8 0 0 0 6.1 21h11.8a1.8 1.8 0 0 0 1.5-2.8L14 9.5V3" />
    <path d="M7.4 15h9.2" />
  </Svg>
);

export const HeartPulseIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M19.5 12.6 12 20l-7.5-7.4A4.9 4.9 0 0 1 12 6.1a4.9 4.9 0 0 1 7.5 6.5Z" />
    <path d="M3.5 12h4l1.5-2.5 2.5 5 1.5-2.5h7.5" />
  </Svg>
);

export const MonitorIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Svg>
);

export const CloudSunIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M12 2v2M4.9 4.9l1.4 1.4M20 12h2M19.1 4.9l-1.4 1.4" />
    <path d="M15.9 12.6a4 4 0 0 0-5.9-4.1" />
    <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
  </Svg>
);

export const TrendUpIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="m22 7-8.5 8.5-5-5L2 17" />
    <path d="M16 7h6v6" />
  </Svg>
);

export const MailIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </Svg>
);

export const BriefcaseIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </Svg>
);

export const BookOpenIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2Z" />
    <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7Z" />
  </Svg>
);

export const StopSquareIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </Svg>
);

export const ExternalLinkIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Svg>
);

export const ThermometerIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M14 14.8V4.5a2.5 2.5 0 0 0-5 0v10.3a4.5 4.5 0 1 0 5 0Z" />
  </Svg>
);

export const DropletIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M12 2.7 17.7 8.4a8 8 0 1 1-11.3 0Z" />
  </Svg>
);

export const WindIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
    <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    <path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2" />
  </Svg>
);

export const MapPinIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Svg>
);

export const ClockIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Svg>
);

export const ArrowDownLineIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </Svg>
);

export const ChevronRightIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const ChevronLeftIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

export const ListIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);

/** A search from the person's own list (Settings > Web Search). */
export const StarIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z" />
  </Svg>
);

/** A popular search. */
export const SparkleIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M12 3c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6Z" />
    <path d="M19 15.5c.25 1.6.9 2.25 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.9 2.5-2.5Z" />
  </Svg>
);

/** A search made before. */
export const HistoryIcon: React.FC<WebIconProps> = (p) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
