/**
 * WebBrowsingScreen v3.6 — Real gaze cursor inside BrowserView, bigger buttons
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/browsing-refinement.css';
import '../styles/web-design.css';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { screenThemes, typography, warmScreenTokens } from '../utils/design';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useWS } from '../hooks/useWebSocket';
import { useGazeBrowser, youtubeSearchUrl, googleSearchUrl, YOUTUBE_HOME_URL, type BrowserNotice } from '../hooks/useGazeBrowser';
import SearchKeyboard, { type SearchTarget } from '../components/browser/SearchKeyboard';
import * as WI from '../components/icons/WebIcons';
import { searchedWordsOf } from '../components/browser/searchText';
import { CalmWatchStrip, useCalmWatch, type GazePointSource } from '../components/browser/CalmWatchStrip';
import type { CalmPlayback } from '../components/browser/calmWatch';
import { useRealGaze } from '../contexts/RealGazeContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomization } from '../contexts/CustomizationContext';
import { useDwellTime } from '../contexts/DwellTimeContext';
import { normalizeVideoRevealHoldMs } from '../config/dwellTimeConfig';
import { gazeFlags } from '../utils/gazeFlags';
import { isUsableGaze, GAZE_RECOVERY_MS, GAZE_STALE_MS } from '../utils/gazeSafety';
import {
    BackIcon,
    BrainIcon,
    EyeIcon,
    EyeOffIcon,
    FullscreenIcon,
    GlobalIcon,
    GridIcon,
    HomeIcon,
    KeyboardIcon,
    MinimizeIcon,
    PauseIcon,
    PlayIcon,
    RefreshIcon,
    SparklesIcon,
    SpeakIcon,
    WebLayoutIcon,
    WhatsAppIcon,
    XIcon,
    YoutubeIcon,
} from '../components/icons/Icons';
import newsFeedIconSvg from '../assets/web-browsing/news-feed-icon.svg?raw';
import youtubeIconSvg from '../assets/web-browsing/youtube-icon.svg?raw';
import alsKnowledgeIconSvg from '../assets/web-browsing/als-knowledge-icon.svg?raw';
import quickSearchIconSvg from '../assets/web-browsing/quick-search-icon.svg?raw';
import socialConnectIconSvg from '../assets/web-browsing/social-connect-icon.svg?raw';

const T = screenThemes.web;
const GAP = 'clamp(24px, 3vh, 40px)'; // Even larger gap
const CR = '24px';
const FONT_PRIMARY = typography.fontFamily.primary;
const GL = T.glass;
const TL = T.ai;
const AC = T.accent;
const DANGER = T.danger;
const DANGER_BORDER = 'rgba(154, 93, 84, 0.22)';
const INFO = T.info;
const INFO_BORDER = 'rgba(142, 169, 183, 0.22)';
const SOFT_INFO = T.softInfo;
const SOFT_INFO_BORDER = 'rgba(169, 202, 199, 0.22)';
const SUCCESS = T.success;
const SUCCESS_BORDER = 'rgba(167, 190, 153, 0.22)';
const STATUS = T.status;
const STATUS_BORDER = 'rgba(142, 169, 183, 0.22)';

type WebIconProps = { size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties };


const WEB_SURFACE = {
    pageBg: T.bg,
    cardBg: T.cardBg,
    panelBg: T.glass,
    border: T.cardBorder,
    borderSoft: '1px solid rgba(213, 216, 188, 0.08)',
    cardShadow: '0 8px 18px rgba(0,0,0,0.16)',
    panelShadow: '0 8px 18px rgba(0,0,0,0.16)',
    text: T.textMain,
    textMuted: T.textSub,
};

const WEB_ACCENTS = {
    maroon: '#A56A60',
    maroonText: '#E9B9AE',
    gold: '#B98B48',
    goldText: '#E3C28E',
    olive: '#8FA17B',
    oliveText: '#CDD8BC',
    teal: '#6C9D97',
    tealText: '#B6D7D1',
    blue: '#7798AA',
    blueText: '#C0D2DE',
};

type BrowserInteractionMode = 'watch' | 'control';

const TOOLBAR_SEPARATOR = 'rgba(198, 207, 189, 0.13)';
const WATCH_MODE_BG = 'rgba(54, 42, 22, 0.88)';
const WATCH_MODE_TEXT = '#DCC89B';
const CONTROL_MODE_BG = 'rgba(25, 49, 47, 0.90)';
const CONTROL_MODE_TEXT = '#A9CAC7';

const NewsIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" style={style} aria-hidden="true">
        <rect x="24" y="22" width="48" height="56" rx="7" fill={color} fillOpacity="0.075" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        <path d="M34 36h28" stroke={color} strokeWidth={strokeWidth * 1.18} strokeLinecap="round" opacity="0.78" />
        <path d="M34 48h24" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.48" />
        <path d="M34 60h18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.35" />
        <path d="M72 32h3a5 5 0 0 1 5 5v33a8 8 0 0 1-8 8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity="0.34" />
    </svg>
);

const SearchIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" style={style} aria-hidden="true">
        <circle cx="41.5" cy="41.5" r="24" fill={color} fillOpacity="0.07" stroke={color} strokeWidth={strokeWidth} />
        <path d="M59 59 77 77" stroke={color} strokeWidth={strokeWidth * 1.16} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M32 34c3-3.7 7.2-5.4 12.4-5.2" stroke={color} strokeWidth={strokeWidth * 0.75} strokeLinecap="round" opacity="0.42" />
    </svg>
);

const BookIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" style={style} aria-hidden="true">
        <path
            d="M18 25h24c6.8 0 11 4.4 11 11v42c-2.8-4.9-7.1-7.3-13-7.3H18V25Z"
            fill={color}
            fillOpacity="0.075"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M78 25H54c-6.8 0-11 4.4-11 11v42c2.8-4.9 7.1-7.3 13-7.3h22V25Z"
            fill={color}
            fillOpacity="0.055"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path d="M53 36v42" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.38" />
        <path d="M28 42h12M28 54h9" stroke={color} strokeWidth={strokeWidth * 0.76} strokeLinecap="round" opacity="0.32" />
        <path d="M60 42h10M60 54h8" stroke={color} strokeWidth={strokeWidth * 0.76} strokeLinecap="round" opacity="0.28" />
        <path d="M45 68v13l4-3.2 4 3.2V67.5" fill={color} fillOpacity="0.12" stroke={color} strokeWidth={strokeWidth * 0.76} strokeLinejoin="round" opacity="0.68" />
    </svg>
);

const PointerIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <path d="M33 17v39" />
        <path d="M33 56l-9-10a8 8 0 0 0-11 11l21 23h33a10 10 0 0 0 10-10V49a8 8 0 0 0-16 0v-6a8 8 0 0 0-16 0v-7a8 8 0 0 0-12 0" />
    </svg>
);

const ArrowUpIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <path d="M48 76V20" />
        <path d="M28 40l20-20 20 20" />
    </svg>
);

const ArrowDownIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <path d="M48 20v56" />
        <path d="M28 56l20 20 20-20" />
    </svg>
);

const NextIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <path d="M22 25l34 23-34 23V25Z" fill={color} fillOpacity="0.08" />
        <path d="M22 25l34 23-34 23V25Z" />
        <path d="M64 25v46" />
    </svg>
);

// Skip forward: YouTube's own Skip Ad button, pressed from the bar.
const SkipIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <path d="M4 6l7 6-7 6V6Z" />
        <path d="M12 6l7 6-7 6V6Z" />
        <path d="M21 5v14" />
    </svg>
);

const ZoomIcon: React.FC<WebIconProps & { direction?: 'in' | 'out' }> = ({ size = 24, color = 'currentColor', strokeWidth = 2, direction = 'in', style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <circle cx="42" cy="42" r="22" />
        <path d="M59 59l19 19" />
        <path d="M31 42h22" />
        {direction === 'in' && <path d="M42 31v22" />}
    </svg>
);

const ExternalIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <rect x="22" y="26" width="48" height="48" rx="6" />
        <path d="M52 22h22v22" />
        <path d="M44 52l30-30" />
    </svg>
);

const MoneyIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <rect x="16" y="26" width="64" height="44" rx="7" />
        <circle cx="48" cy="48" r="11" />
        <path d="M28 38h.1M68 58h.1" />
    </svg>
);

const ChartIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <path d="M18 72h60" />
        <path d="M18 72V24" />
        <path d="M28 60l14-16 12 9 20-25" />
    </svg>
);

const LocationIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <path d="M48 82s24-24 24-45a24 24 0 0 0-48 0c0 21 24 45 24 45z" />
        <circle cx="48" cy="37" r="8" />
    </svg>
);

const WeatherIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <path d="M30 64h35a15 15 0 0 0 2-30 23 23 0 0 0-43 9A11 11 0 0 0 30 64z" />
        <path d="M30 74v4M48 74v4M66 74v4" />
    </svg>
);

const CricketIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <path d="M28 76l38-38" />
        <path d="M56 28l12 12" />
        <path d="M24 80l-8-8" />
        <circle cx="72" cy="24" r="7" />
    </svg>
);

const MailIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <rect x="16" y="24" width="64" height="48" rx="7" />
        <path d="M18 30l30 24 30-24" />
        <path d="M34 50L18 68" />
        <path d="M62 50l16 18" />
    </svg>
);

const WorkIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <rect x="18" y="32" width="60" height="42" rx="7" />
        <path d="M38 32v-8h20v8" />
        <path d="M18 45h60" />
        <path d="M42 52h12" />
    </svg>
);

const stripLeadingEmoji = (label: string) => label.replace(/^[^A-Za-z0-9]+/, '').trim();

const iconInlineStyle: React.CSSProperties = { flexShrink: 0 };

const WEB_CARD_ICON_SVGS: Record<string, string> = {
    news: newsFeedIconSvg,
    youtube: youtubeIconSvg,
    knowledge: alsKnowledgeIconSvg,
    search: quickSearchIconSvg,
    social: socialConnectIconSvg,
};

type WebAssetIconProps = {
    svg: string;
    size: number;
    color: string;
};

const WebAssetIcon: React.FC<WebAssetIconProps> = ({ svg, size, color }) => (
    <span
        aria-hidden="true"
        style={{
            ...iconInlineStyle,
            width: size,
            height: size,
            color,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 0,
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
    />
);

const renderHubIcon = (id: string, size: number, color: string) => {
    const svg = WEB_CARD_ICON_SVGS[id];
    if (svg) return <WebAssetIcon svg={svg} size={size} color={color} />;

    return <GlobalIcon size={Math.round(size * 0.9)} color={color} strokeWidth={2.1} style={iconInlineStyle} />;
};

// News categories: a distinct icon, accent and one short line each (the backend's
// five, and the fallback list used while it is not connected).
type ListLook = { icon: (size: number) => React.ReactNode; accent: WebAccent; sub: string };
const NEWS_CATEGORY_LOOK: Record<string, ListLook> = {
    positive_india: { icon: (s) => <SparklesIcon size={s} strokeWidth={1.9} />, accent: 'gold', sub: 'Hopeful stories' },
    india_official: { icon: (s) => <WI.LandmarkIcon size={s} strokeWidth={1.9} />, accent: 'blue', sub: 'News from across India' },
    health_als: { icon: (s) => <BrainIcon size={s} strokeWidth={1.9} />, accent: 'violet', sub: 'Research and care' },
    cricket: { icon: (s) => <WI.CricketIcon size={s} strokeWidth={1.9} />, accent: 'green', sub: 'Scores and match news' },
    science: { icon: (s) => <WI.FlaskIcon size={s} strokeWidth={1.9} />, accent: 'accent', sub: 'Space, health, discovery' },
    top: { icon: (s) => <WI.NewspaperIcon size={s} strokeWidth={1.9} />, accent: 'blue', sub: 'Main headlines' },
    india: { icon: (s) => <WI.LandmarkIcon size={s} strokeWidth={1.9} />, accent: 'blue', sub: 'News from India' },
    world: { icon: (s) => <GlobalIcon size={s} strokeWidth={1.9} />, accent: 'green', sub: 'Around the world' },
    health: { icon: (s) => <WI.HeartPulseIcon size={s} strokeWidth={1.9} />, accent: 'rose', sub: 'Health and care' },
    sports: { icon: (s) => <WI.CricketIcon size={s} strokeWidth={1.9} />, accent: 'green', sub: 'Games and scores' },
    tech: { icon: (s) => <WI.MonitorIcon size={s} strokeWidth={1.9} />, accent: 'violet', sub: 'Technology' },
};
const newsCategoryLook = (id: string): ListLook =>
    NEWS_CATEGORY_LOOK[id] || { icon: (s) => <WI.NewspaperIcon size={s} strokeWidth={1.9} />, accent: 'accent', sub: 'Latest stories' };

// Quick Search topics on the redesigned landing: one icon family, one accent each.
const QUICK_TOPIC_LOOK: Record<string, { icon: React.ReactNode; accent: WebAccent }> = {
    india_news: { icon: <WI.NewspaperIcon size={64} strokeWidth={1.8} />, accent: 'blue' },
    local_weather: { icon: <WI.CloudSunIcon size={64} strokeWidth={1.8} />, accent: 'gold' },
    global_news: { icon: <GlobalIcon size={64} strokeWidth={1.8} />, accent: 'green' },
    als_research: { icon: <BrainIcon size={64} strokeWidth={1.8} />, accent: 'violet' },
    cricket_score: { icon: <WI.CricketIcon size={64} strokeWidth={1.8} />, accent: 'green' },
    stock_market: { icon: <WI.TrendUpIcon size={64} strokeWidth={1.8} />, accent: 'blue' },
};

const renderQuickTopicIcon = (id: string, size: number, color: string) => {
    const iconProps = { size, color, strokeWidth: 2.1, style: iconInlineStyle };
    if (id === 'india_news') return <NewsIcon {...iconProps} />;
    if (id === 'local_weather') return <WeatherIcon {...iconProps} />;
    if (id === 'global_news') return <GlobalIcon {...iconProps} />;
    if (id === 'als_research') return <BrainIcon {...iconProps} />;
    if (id === 'cricket_score') return <CricketIcon {...iconProps} />;
    if (id === 'stock_market') return <ChartIcon {...iconProps} />;
    return <SearchIcon {...iconProps} />;
};

const actionButton = (accent = WEB_ACCENTS.blueText, bg = 'rgba(32, 34, 30, 0.96)', border = 'rgba(213, 216, 188, 0.08)'): React.CSSProperties => ({
    ...cb,
    color: accent,
    background: bg,
    border,
    boxShadow: 'none',
});

const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    gap: '1px',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 'clamp(9px,1.15vh,14px) clamp(12px,1.6vw,20px)',
    width: '100%',
    boxSizing: 'border-box',
    background: TOOLBAR_SEPARATOR,
    border: `1px solid ${TOOLBAR_SEPARATOR}`,
    borderRadius: '26px',
    boxShadow: WEB_SURFACE.panelShadow,
    overflow: 'hidden',
};

const cs: React.CSSProperties = {
    background: 'var(--ui-surface)', border: '1px solid var(--ui-border)', borderRadius: CR, boxShadow: 'none',
    transition: 'background-color 120ms ease, border-color 120ms ease', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', cursor: 'pointer',
};

// High-visibility large pill for categories
const pill = (on: boolean, ac = AC): React.CSSProperties => ({
    padding: 'clamp(18px, 2.6vh, 28px) clamp(30px, 4vw, 48px)', // Massive touch target
    fontSize: 'clamp(22px, 2.8vh, 30px)', fontWeight: on ? 700 : 600, fontFamily: FONT_PRIMARY,
    color: on ? T.textMain : T.textSub, background: on ? `${ac}22` : 'rgba(32, 34, 30, 0.72)',
    border: on ? `1.5px solid ${ac}66` : WEB_SURFACE.borderSoft, borderRadius: '22px',
    whiteSpace: 'nowrap' as const, minHeight: 'clamp(80px, 10vh, 110px)', width: 'auto', // Override fixed size
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexShrink: 0
});
const cb: React.CSSProperties = {
    padding: 'clamp(20px, 2.6vh, 30px) clamp(30px, 4vw, 48px)', // Generous padding
    fontSize: 'clamp(19px, 2.4vh, 26px)', fontWeight: 600, fontFamily: FONT_PRIMARY,
    color: 'var(--ui-ink)', background: 'var(--ui-surface)', border: '1px solid var(--ui-border)', borderRadius: '16px',
    minHeight: 'clamp(80px, 9vh, 100px)', width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
};

const browserToolbarButton = (
    accent = WEB_ACCENTS.blueText,
    bg = 'rgba(32, 34, 30, 0.96)',
    _border = 'rgba(213, 216, 188, 0.08)',
): React.CSSProperties => ({
    ...actionButton(accent, bg, '0'),
    minHeight: 'clamp(100px, 11vh, 132px)',
    minWidth: 'clamp(158px, 12vw, 226px)',
    padding: 'clamp(20px, 2.35vh, 30px) clamp(20px, 2.4vw, 36px)',
    fontSize: 'clamp(21px, 2.7vh, 30px)',
    fontWeight: 650,
    borderRadius: '20px',
    border: '0',
    position: 'relative',
    zIndex: 2,
    pointerEvents: 'auto',
    boxShadow: 'none',
});

const browserToolbarIconSize = 34;

// ── UNIFIED TOOLBAR BUTTON SYSTEM (Tier 1 E) ──────────────────────────────
// Consolidates 5 prior button-style functions (browserToolbarButton,
// hiddenBrowserButton, showNavButtonStyle,
// browserModeButtonStyle) into 3 roles: primary, secondary, dismiss.
// All share identical geometry — only the color triplet differs.
type ToolbarRole = 'primary' | 'secondary' | 'dismiss';

// Professional cool-slate palette — replaces the warm-tan / sage-teal scheme
// that read as "toyish" in the screenshots. Inspired by macOS Big Sur toolbar
// chrome; close and stop actions retain a subdued semantic accent.
const TOOLBAR_ROLE: Record<ToolbarRole, { color: string; bg: string; border: string }> = {
    // PRIMARY — cool cream text on dark slate, used for Back / Exit / Show-Nav / Close / Hide-Controls
    primary: {
        color: 'var(--ui-ink)',
        bg: 'transparent',
        border: 'rgba(180, 195, 220, 0.10)',
    },
    // SECONDARY — slate-blue accent, used for Play/Pause, Show Controls
    secondary: {
        color: 'var(--ui-accent-ink)',
        bg: 'transparent',
        border: 'rgba(157, 183, 204, 0.18)',
    },
    // DISMISS — close and stop actions
    dismiss: {
        color: 'var(--ui-care-ink)',
        bg: 'var(--ui-panel)',
        border: 'var(--ui-border)',
    },
};

const toolbarBtn = (role: ToolbarRole, hidden: boolean): React.CSSProperties => {
    const r = TOOLBAR_ROLE[role];
    return {
        minHeight: hidden ? 'clamp(118px, 13.2vh, 158px)' : 'clamp(100px, 11vh, 132px)',
        minWidth: hidden ? 'clamp(128px, 9.8vw, 190px)' : 'clamp(158px, 12vw, 226px)',
        padding: hidden ? 'clamp(18px, 2.1vh, 28px) clamp(14px, 1.6vw, 24px)' : 'clamp(20px, 2.35vh, 30px) clamp(20px, 2.4vw, 36px)',
        fontSize: hidden ? 'clamp(19px, 2.45vh, 28px)' : 'clamp(21px, 2.7vh, 30px)',
        fontWeight: 650,
        fontFamily: FONT_PRIMARY,
        letterSpacing: '0.005em',
        borderRadius: '20px',
        color: r.color,
        background: r.bg,
        border: `1px solid ${r.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        flex: '1 1 0',
        boxShadow: 'none',
        position: 'relative',
        zIndex: 2,
        pointerEvents: 'auto',
        cursor: 'pointer',
    };
};

// ── CONNECTED-TOOLBAR CONTAINER (single integrated row, internal dividers) ──
// Cool dark-slate professional palette. Inspired by macOS Big Sur / pro browser
// chrome (Edge, Arc). Single shared border + shadow + radius — internal buttons
// drop their individual chrome and share the container's outer shape.
const connectedToolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'stretch',
    width: '100%',
    boxSizing: 'border-box',
    padding: 0,
    background: 'var(--ui-surface)',
    border: '1.5px solid var(--ui-border)',
    borderRadius: '20px',
    boxShadow: 'none',
    overflow: 'hidden',
};

// In a connected toolbar, internal buttons drop their individual border / radius
// and a single 1px divider sits between adjacent buttons. The first/last button
// inherit the container's outer rounding via the parent's overflow:hidden.
const toolbarBtnConnected = (role: ToolbarRole, hidden: boolean, position: 'first' | 'middle' | 'last'): React.CSSProperties => {
    const r = TOOLBAR_ROLE[role];
    return {
        minHeight: hidden ? 'clamp(118px, 13.2vh, 158px)' : 'clamp(100px, 11vh, 132px)',
        padding: hidden ? 'clamp(18px, 2.1vh, 28px) clamp(14px, 1.6vw, 24px)' : 'clamp(20px, 2.35vh, 30px) clamp(20px, 2.4vw, 36px)',
        fontSize: hidden ? 'clamp(19px, 2.45vh, 28px)' : 'clamp(21px, 2.7vh, 30px)',
        fontWeight: 650,
        fontFamily: FONT_PRIMARY,
        letterSpacing: '0.005em',
        borderRadius: 0,
        color: r.color,
        background: r.bg,
        // Single 1px divider line on the right of every button except the last
        borderRight: position !== 'last' ? '1px solid var(--ui-border)' : '0',
        borderTop: 0,
        borderBottom: 0,
        borderLeft: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        flex: '1 1 0',
        boxShadow: 'none',
        position: 'relative',
        zIndex: 2,
        pointerEvents: 'auto',
        cursor: 'pointer',
    };
};

// Up / Down beside the page, in a gutter outside the BrowserView (the page is a
// native layer drawn above the interface, so nothing can float over it). Each press
// moves the page itself most of a screen, smoothly (main.ts 'webview:scrollPage'):
// the document, or the panel that actually scrolls -- never just whatever lies under
// the middle of the view, which on YouTube is the video. At the top or the end the
// button dims and says so; it still answers, so it can never trap the page.
// Between them, as before 6 Oct 2026: Gaze Scroll (hands free: looking at the top or
// bottom edge of the page moves it, main.ts edge scrolling) and, while browsing a
// YouTube video page, Full Screen.
type ScrollDockProps = {
    onUp: () => void;
    onDown: () => void;
    atTop?: boolean;
    atBottom?: boolean;
    gazeScrollOn?: boolean;
    onToggleGazeScroll?: () => void;
    onFullScreen?: () => void;
    gazeEnabled: boolean;
    gazeTimestamp: number;
};

// Gaze Scroll: arrows both ways along one line.
const MoveVerticalIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <path d="M12 2v20" />
        <path d="M8 6l4-4 4 4" />
        <path d="M8 18l4 4 4-4" />
    </svg>
);

const ContentScrollDock: React.FC<ScrollDockProps> = ({ onUp, onDown, atTop = false, atBottom = false, gazeScrollOn = false, onToggleGazeScroll, onFullScreen, gazeEnabled, gazeTimestamp }) => {
    const buttonCount = 2 + (onToggleGazeScroll ? 1 : 0) + (onFullScreen ? 1 : 0);
    const compact = buttonCount > 2;
    const iconSize = compact ? 34 : 42;
    const buttonStyle = (dimmed: boolean): React.CSSProperties => ({
        width: '100%',
        flex: '1 1 0',
        // Two buttons share the height generously; more share it equally, never below 80 px.
        minHeight: compact ? '80px' : 'clamp(120px, 16vh, 200px)',
        background: 'var(--ui-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: '20px',
        color: 'var(--ui-ink)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        cursor: 'pointer',
        fontFamily: FONT_PRIMARY,
        fontWeight: 720,
        fontSize: 'clamp(19px, 2vh, 23px)',
        letterSpacing: '0.005em',
        boxShadow: 'none',
        opacity: dimmed ? 0.55 : 1,
        transition: 'background-color 120ms ease, border-color 120ms ease, opacity 160ms ease',
    });
    const note: React.CSSProperties = { fontSize: 'clamp(14px, 1.6vh, 17px)', fontWeight: 600 };
    return (
        <div className="browser-scroll-dock" data-buttons={buttonCount} style={{
            flex: '0 0 clamp(150px, 12vw, 180px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(10px, 1.4vh, 18px)',
            paddingLeft: 'clamp(10px, 1vw, 16px)',
            minHeight: 0,
        }}>
            <GazeButton id="content-scroll-up" onClick={onUp}
                gazeEnabled={gazeEnabled} gazeEnabledTimestamp={gazeTimestamp} isDarkMode
                dwellCategory="navigationButton"
                style={buttonStyle(atTop)}>
                <ArrowUpIcon size={iconSize} color="currentColor" strokeWidth={7} />
                <span>Up</span>
                {atTop && <span style={note}>At the top</span>}
            </GazeButton>
            {onToggleGazeScroll && (
                <GazeButton id="content-auto-scroll" onClick={onToggleGazeScroll} selected={gazeScrollOn}
                    gazeEnabled={gazeEnabled} gazeEnabledTimestamp={gazeTimestamp} isDarkMode
                    dwellCategory="navigationButton"
                    style={buttonStyle(false)}>
                    <MoveVerticalIcon size={iconSize} color="currentColor" strokeWidth={2.2} />
                    <span>Gaze Scroll</span>
                    <span style={note}>{gazeScrollOn ? 'On' : 'Off'}</span>
                </GazeButton>
            )}
            {onFullScreen && (
                <GazeButton id="content-maximize" onClick={onFullScreen}
                    gazeEnabled={gazeEnabled} gazeEnabledTimestamp={gazeTimestamp} isDarkMode
                    dwellCategory="navigationButton"
                    style={buttonStyle(false)}>
                    <FullscreenIcon size={iconSize} color="currentColor" strokeWidth={2.2} />
                    <span>Full Screen</span>
                </GazeButton>
            )}
            <GazeButton id="content-scroll-down" onClick={onDown}
                gazeEnabled={gazeEnabled} gazeEnabledTimestamp={gazeTimestamp} isDarkMode
                dwellCategory="navigationButton"
                style={buttonStyle(atBottom)}>
                <ArrowDownIcon size={iconSize} color="currentColor" strokeWidth={7} />
                <span>Down</span>
                {atBottom && <span style={note}>At the end</span>}
            </GazeButton>
        </div>
    );
};

// Compact mode-toggle pill (replaces the giant 158px-tall mode toggle).
// Two-position segmented control feel: ~120×60px, low visual weight.
const modeToggleCompact = (isWatch: boolean, hidden: boolean): React.CSSProperties => ({
    minHeight: hidden ? 'clamp(118px, 13.2vh, 158px)' : 'clamp(100px, 11vh, 132px)',
    minWidth: hidden ? 'clamp(128px, 9.8vw, 190px)' : 'clamp(140px, 10vw, 180px)',
    padding: hidden ? 'clamp(18px, 2.1vh, 28px) clamp(14px, 1.6vw, 24px)' : 'clamp(16px, 2vh, 26px) clamp(18px, 2.2vw, 32px)',
    fontSize: hidden ? 'clamp(18px, 2.3vh, 26px)' : 'clamp(19px, 2.4vh, 26px)',
    fontWeight: 740,
    fontFamily: FONT_PRIMARY,
    letterSpacing: '0.005em',
    borderRadius: '20px',
    color: isWatch ? WATCH_MODE_TEXT : CONTROL_MODE_TEXT,
    background: isWatch ? 'rgba(54, 42, 22, 0.86)' : 'rgba(25, 49, 47, 0.86)',
    border: `1px solid ${isWatch ? 'rgba(220, 200, 155, 0.30)' : 'rgba(169, 202, 199, 0.28)'}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    flex: '1 1 0',
    boxShadow: 'none',
    cursor: 'pointer',
});

const hiddenBrowserToolbarStyle: React.CSSProperties = {
    ...toolbarStyle,
    justifyContent: 'center',
    flexWrap: 'nowrap',
    gap: '1px',
    padding: 'clamp(11px, 1.35vh, 18px) clamp(18px, 2vw, 28px)',
    minHeight: 'clamp(150px, 16.5vh, 196px)',
    borderRadius: '0 0 22px 22px',
    borderLeft: 0,
    borderRight: 0,
    borderTop: 0,
    background: TOOLBAR_SEPARATOR,
};

const hiddenBrowserButton = (
    accent = WEB_ACCENTS.blueText,
    bg = 'rgba(32, 34, 30, 0.96)',
    border = 'rgba(213, 216, 188, 0.08)',
): React.CSSProperties => ({
    ...browserToolbarButton(accent, bg, border),
    minHeight: 'clamp(118px, 13.2vh, 158px)',
    minWidth: 'clamp(128px, 9.8vw, 190px)',
    padding: 'clamp(18px, 2.1vh, 28px) clamp(14px, 1.6vw, 24px)',
    fontSize: 'clamp(19px, 2.45vh, 28px)',
    borderRadius: '20px',
    flex: '1 1 0',
});

const showNavButtonStyle = (): React.CSSProperties => ({
    ...hiddenBrowserButton('#38C7FF', 'rgba(23, 44, 54, 0.86)', 'rgba(56, 199, 255, 0.40)'),
    minWidth: 'clamp(145px, 11vw, 210px)',
    flex: '1.08 1 0',
});

const browserModeButtonStyle = (mode: BrowserInteractionMode, hidden = false): React.CSSProperties => {
    const isWatch = mode === 'watch';
    const accent = isWatch ? CONTROL_MODE_TEXT : WATCH_MODE_TEXT;
    const bg = isWatch ? CONTROL_MODE_BG : WATCH_MODE_BG;
    const border = isWatch ? SOFT_INFO_BORDER : 'rgba(178, 138, 69, 0.24)';
    return hidden ? hiddenBrowserButton(accent, bg, border) : browserToolbarButton(accent, bg, border);
};

const useBrowserViewBoundsSync = (
    viewRef: React.RefObject<HTMLElement>,
    updateBounds: ReturnType<typeof useGazeBrowser>['updateBounds'],
    active: boolean,
) => {
    useEffect(() => {
        if (!active) return;
        let frame = 0;

        const sync = () => {
            const node = viewRef.current;
            if (!node) return;
            const r = node.getBoundingClientRect();
            if (r.width <= 50 || r.height <= 50) return;
            updateBounds({
                x: Math.round(r.left),
                y: Math.round(r.top),
                width: Math.round(r.width),
                height: Math.round(r.height),
            }).catch(() => undefined);
        };

        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(sync);
        };

        schedule();
        const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
        if (resizeObserver && viewRef.current) resizeObserver.observe(viewRef.current);
        window.addEventListener('resize', schedule);
        const interval = window.setInterval(schedule, 350);

        return () => {
            cancelAnimationFrame(frame);
            resizeObserver?.disconnect();
            window.removeEventListener('resize', schedule);
            window.clearInterval(interval);
        };
    }, [active, updateBounds, viewRef]);
};

// Short messages from the browser (useGazeBrowser notice): something refused for
// safety, or the page refreshed or restarted on its own.
const describeBrowserNotice = (notice: BrowserNotice): string => {
    if (notice.kind === 'refreshed') return 'The page was refreshed to free memory.';
    if (notice.kind === 'recovered') return 'The page stopped responding and was restarted.';
    if (notice.what === 'download') return 'Downloads are turned off here, for safety.';
    if (notice.what === 'popup') return 'A pop-up window was blocked.';
    return 'That link cannot be opened here, for safety.';
};

// One quiet line beside the page: what it is doing, or a notice for five seconds.
// It is drawn outside the page (a native layer covers anything beneath it) and is
// never a gaze target.
const BrowserStatusLine = ({ text, notice }: { text: string; notice: BrowserNotice | null }) => (
    <div className="browser-status" role="status" aria-live="polite" data-notice={notice ? notice.kind : undefined} style={{
        flex: '0 0 auto', minHeight: 'clamp(30px, 3.8vh, 42px)', minWidth: 0,
        display: 'flex', alignItems: 'center', padding: '0 clamp(8px, 1vw, 14px)', boxSizing: 'border-box',
        fontFamily: FONT_PRIMARY, fontSize: 'clamp(16px, 2vh, 21px)', fontWeight: 600,
        color: notice ? 'var(--ui-ink)' : 'var(--ui-muted)',
    }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {notice ? describeBrowserNotice(notice) : text}
        </span>
    </div>
);

// ── Shared choice card (6 Oct 2026 redesign) ──
// One choice on a web screen (hub, Quick Search topics, Social): an accent icon, a
// title and one short line. Focus draws it like the Home and Activities cards (icon
// above, centred); Serene puts the icon in a soft badge beside the words
// (web-design.css). Accents are design tokens, so every theme keeps its own colours.
type WebAccent = 'blue' | 'green' | 'gold' | 'violet' | 'rose' | 'accent';
const WEB_ACCENT: Record<WebAccent, string> = {
    blue: 'var(--design-blue, #b6d9ef)',
    green: 'var(--design-green, #b4dfcf)',
    gold: 'var(--design-gold, #e7cd9f)',
    violet: 'var(--design-violet, #d3cae8)',
    rose: 'var(--design-danger, #fac5bd)',
    accent: 'var(--design-accent, #b8dfe7)',
};

const WebChoiceCard = ({ id, title, subtitle, icon, accent, onClick, ige, ts, dwellCategory = 'navigationButton', selected }: {
    id: string;
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    accent: WebAccent;
    onClick: () => void;
    ige: boolean;
    ts: number;
    dwellCategory?: 'navigationButton' | 'homeScreenTile';
    selected?: boolean;
}) => (
    <GazeButton id={id} className="web-card" onClick={onClick} selected={selected}
        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory={dwellCategory}
        contentFill
        style={{
            width: '100%', height: '100%', minHeight: 0,
            position: 'relative', overflow: 'hidden',
            borderRadius: '22px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT_PRIMARY,
        }}>
        <div className="web-card-icon" style={{ color: WEB_ACCENT[accent] }}>{icon}</div>
        <div className="web-card-text">
            <span className="web-card-title">{title}</span>
            {subtitle && <span className="web-card-sub">{subtitle}</span>}
        </div>
    </GazeButton>
);

const isYoutubeHost = (url: string | null | undefined): boolean => {
    try {
        return /(^|\.)(youtube\.com|youtu\.be)$/i.test(new URL(url || '').hostname);
    } catch {
        return false;
    }
};

const BackBtn = ({ onClick, ige, ts, toggleGaze, label = "← Home Grid", showHome = true, centerGaze = false }: { onClick: () => void; ige: boolean; ts: number; toggleGaze: () => void; label?: string; showHome?: boolean; centerGaze?: boolean }) => (
    <div style={{ position: 'relative', width: '100%', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '60px', padding: centerGaze ? '12px 0 24px 0' : '24px 0', flexShrink: 0 }}>
        {showHome && !centerGaze && (
            <GazeButton id="nav-back" onClick={onClick} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 'clamp(64px, 8.5vh, 90px)', padding: '0 clamp(40px, 6vw, 80px)',
                    fontFamily: FONT_PRIMARY, fontWeight: 700, fontSize: 'clamp(20px, 2.6vh, 28px)',
                    color: T.textMain, background: GL,
                    border: '1px solid rgba(168, 181, 196, 0.14)', borderRadius: '24px',
                    backdropFilter: 'blur(16px)', letterSpacing: '0.5px',
                    minWidth: 'clamp(260px, 30vw, 380px)', cursor: 'pointer', transition: 'background-color 120ms ease, border-color 120ms ease', gap: '12px'
                }}>
                {label}
            </GazeButton>
        )}
        <button
            id="gaze-toggle-web-hub"
            onClick={toggleGaze}
            className="gaze-button gaze-toggle"
            data-gaze="true"
            data-gaze-toggle="true"
            data-gaze-always="true"
            style={{
                padding: '0',
                backgroundColor: ige ? `${TL}20` : GL,
                border: `3px solid ${ige ? TL : '#2A3D52'}`,
                borderRadius: '50%',
                color: ige ? TL : T.textSub,
                width: centerGaze ? 'clamp(90px, 12vh, 120px)' : 'clamp(75px, 10vh, 100px)',
                height: centerGaze ? 'clamp(90px, 12vh, 120px)' : 'clamp(75px, 10vh, 100px)',
                boxShadow: ige ? '0 0 20px rgba(95,205,189,0.2)' : '0 8px 18px rgba(0,0,0,0.28)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 200ms ease',
                backdropFilter: 'blur(16px)',
            }}
        >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{
                    width: centerGaze ? 'clamp(42px, 6vh, 60px)' : 'clamp(36px, 4.5vh, 48px)',
                    height: centerGaze ? 'clamp(42px, 6vh, 60px)' : 'clamp(36px, 4.5vh, 48px)',
                    transition: 'all 200ms ease'
                }}
            >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" fill={ige ? "currentColor" : "none"} />
            </svg>
        </button>
    </div>
);

// YouTube data — verified working video IDs (searched Feb 2026)
// Per-category metadata — distinct icon + subtitle for each YT category.
// Each renderer is a thin SVG component sized 44px so the visual weight matches
// the 44px icon size used in the sidebar buttons. All use currentColor so the
// selected/unselected state propagates from the parent.
type YTCategoryMeta = { subtitle: string; renderIcon: (color: string) => React.ReactNode };
const YT_CATEGORY_META: Record<string, YTCategoryMeta> = {
    old_songs: {
        subtitle: 'Bollywood classics',
        renderIcon: (color) => (
            // Vinyl record — concentric circles + spindle
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9.5" />
                <circle cx="12" cy="12" r="6" opacity="0.65" />
                <circle cx="12" cy="12" r="3" opacity="0.45" />
                <circle cx="12" cy="12" r="1.2" fill={color} stroke="none" />
            </svg>
        ),
    },
    bhajans: {
        subtitle: 'Spiritual songs',
        renderIcon: (color) => (
            // Beamed musical notes — bhajans are sung
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 17.5V5.5l11-2.2v12.2" />
                <ellipse cx="6.5" cy="17.5" rx="2.7" ry="2.2" fill={color} stroke="none" />
                <ellipse cx="17.5" cy="15.3" rx="2.7" ry="2.2" fill={color} stroke="none" />
            </svg>
        ),
    },
    news_hindi: {
        subtitle: 'Live channels',
        renderIcon: (color) => (
            // Folded newspaper — masthead, image block, body lines
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4.5" width="18" height="15" rx="1.4" />
                <rect x="5.6" y="7.2" width="5.4" height="4" rx="0.6" opacity="0.6" />
                <line x1="13" y1="8" x2="18.5" y2="8" opacity="0.7" />
                <line x1="13" y1="10.5" x2="17" y2="10.5" opacity="0.55" />
                <line x1="5.6" y1="14" x2="18.4" y2="14" opacity="0.55" />
                <line x1="5.6" y1="16.4" x2="14" y2="16.4" opacity="0.45" />
            </svg>
        ),
    },
    devotional: {
        subtitle: 'Mantras & aartis',
        renderIcon: (color) => (
            // Diya / oil lamp — flame above bowl
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3.5c-2 2.4-2 5.4 0 8 2-2.6 2-5.6 0-8z" fill={color} stroke="none" opacity="0.92" />
                <path d="M4.5 13.6c2.5 2.4 5.5 3 7.5 3s5-0.6 7.5-3v0.6a4 4 0 0 1 -4 4h-7a4 4 0 0 1 -4-4z" />
                <line x1="3" y1="20" x2="21" y2="20" opacity="0.45" />
            </svg>
        ),
    },
};

// Curated YouTube categories — 4 entries each. ALL entries use search-query
// mode (no static video IDs). Rationale: random-format IDs in source data were
// resolving to unrelated videos (e.g., a Hanuman Chalisa entry was loading a
// Jan Gan Man patriotic thumbnail because the ID happened to be valid format
// but mapped to different content). Search-query mode is reliable: clicking a
// card opens a fresh YouTube search results page with the title + channel
// query, and the patient picks from the actual top results — always relevant,
// never stale, no wrong thumbnails.
//
// Visual: each card shows the fallback YouTube glyph on a sage-gold gradient,
// distinguished only by the title and channel text below it. Clean and consistent.
//
// Sidebar display order (top → bottom): Devotional · Old Songs · Bhajans · Hindi News
const YT_CATS = [
    {
        id: 'devotional', label: 'Devotional', videos: [
            { title: 'Vishnu Sahasranamam', ch: 'Devotional' },
            { title: 'Mahamrityunjaya Mantra 108', ch: 'Devotional' },
            { title: 'Krishna Bhajan Sangrah', ch: 'Devotional' },
            { title: 'Aarti Sangrah Hindi', ch: 'Devotional' },
        ]
    },
    {
        id: 'old_songs', label: 'Old Songs', videos: [
            { title: 'Evergreen Bollywood Hits', ch: 'Saregama' },
            { title: 'Lata Mangeshkar Top Songs', ch: 'Saregama' },
            { title: 'Mohd Rafi Greatest Hits', ch: 'Saregama' },
            { title: 'Kishore Kumar Best Songs', ch: 'Saregama' },
        ]
    },
    {
        id: 'bhajans', label: 'Bhajans', videos: [
            { title: 'Hanuman Chalisa', ch: 'T-Series' },
            { title: 'Gayatri Mantra 108', ch: 'T-Series' },
            { title: 'Om Jai Jagdish Hare', ch: 'T-Series' },
            { title: 'Hare Krishna Mahamantra', ch: 'Madhura' },
        ]
    },
    {
        id: 'news_hindi', label: 'Hindi News', videos: [
            { title: 'Aaj Tak Live News', ch: 'Aaj Tak' },
            { title: 'NDTV India Headlines', ch: 'NDTV India' },
            { title: 'ABP News Hindi Live', ch: 'ABP News' },
            { title: 'Republic Bharat Live', ch: 'Republic Bharat' },
        ]
    },
];

// YouTube's in-app full screen (theater mode with the page chrome hidden, never
// true browser full screen) is the main process's youtubeCommand 'maximize' /
// 'restore' / 'is_maximized' (electron/browser/youtubeController.ts). The
// interface sends command names only; it cannot run script in the page.

const isValidYouTubeId = (id?: string) => !!id && /^[A-Za-z0-9_-]{11}$/.test(id);
// Use the YouTube WATCH URL (not embed). Embed URLs fail with Error 153 for many
// videos (T-Series, label music, news) because uploaders disable embedding.
// The watch URL works universally and plays inline (autoplay=1) inside the
// in-app BrowserView. True browser full screen is never entered (v17.16 safety
// path); Full Screen is the in-app version (youtubeController 'maximize').
const resolveYouTubeUrl = (video: any): string => {
    if (video?.url && typeof video.url === 'string') return video.url;
    const query = encodeURIComponent(`${video?.title || 'YouTube video'} ${video?.ch || ''}`.trim());
    if (isValidYouTubeId(video?.id)) {
        return `https://www.youtube.com/watch?v=${video.id}&autoplay=1`;
    }
    return `https://www.youtube.com/results?search_query=${query}`;
};

type QuickTopicMode = 'web' | 'card';
interface QuickTopic {
    id: string;
    label: string;
    url: string;
    mode: QuickTopicMode;
}

// 6 curated quick topics, ordered by daily-use priority for an ALS patient:
// news first (most-consumed), then daily-life (weather), then health (ALS),
// then leisure/finance.
const QUICK_TOPICS: QuickTopic[] = [
    { id: 'india_news', label: 'India News', url: 'https://news.google.com/search?q=India', mode: 'web' },
    { id: 'local_weather', label: 'Local Weather', url: 'https://www.google.com/search?q=weather+today', mode: 'card' },
    { id: 'global_news', label: 'Global News', url: 'https://news.google.com/topstories?hl=en', mode: 'web' },
    { id: 'als_research', label: 'ALS Research', url: 'https://www.google.com/search?q=ALS+research+latest', mode: 'web' },
    { id: 'cricket_score', label: 'Cricket Score', url: 'https://www.google.com/search?q=live+cricket+score', mode: 'card' },
    { id: 'stock_market', label: 'Stock Market', url: 'https://www.google.com/search?q=Sensex+Nifty+today', mode: 'web' },
];

// Subtitle captions — small descriptive caption below each topic label
// (mirrors the YouTube category-card subtitle grammar).
const QUICK_TOPIC_SUBTITLES: Record<string, string> = {
    india_news:     "Today's headlines",
    local_weather:  'Forecast nearby',
    global_news:    'Top stories worldwide',
    als_research:   'Latest ALS news',
    cricket_score:  'Live match scores',
    stock_market:   'Sensex · Nifty today',
};

type ViewState = 'grid' | 'news' | 'youtube' | 'knowledge' | 'search' | 'social';

// ── NEWS PANEL ──
type NewsItem = {
    title: string;
    summary?: string;
    description?: string;
    source?: string;
    link?: string;
    relative_time?: string;
    content?: string;
};

const formatNewsAsReadableParagraphs = (rawText: string): string[] => {
    const cleaned = (rawText || '')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!cleaned) return [];

    const byParagraph = cleaned
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);

    let blocks = byParagraph;
    if (blocks.length < 2) {
        const sentences = cleaned
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const grouped: string[] = [];
        for (let i = 0; i < sentences.length; i += 2) {
            grouped.push([sentences[i], sentences[i + 1]].filter(Boolean).join(' '));
        }
        blocks = grouped;
    }

    const deduped: string[] = [];
    for (const block of blocks) {
        if (deduped.length && deduped[deduped.length - 1].toLowerCase() === block.toLowerCase()) continue;
        deduped.push(block);
        if (deduped.length >= 18) break;
    }
    return deduped;
};

// Fit discrete gaze choices to the actual pane height instead of clipping overflow.
// This changes page capacity only; selection durations and native gaze coordinates are unchanged.
const useGazePageCapacity = (minimumHeight: number, maximum: number) => {
    const [capacity, setCapacity] = useState(1);
    const observer = useRef<ResizeObserver | null>(null);
    const ref = useCallback((node: HTMLDivElement | null) => {
        observer.current?.disconnect();
        if (!node) return;
        const update = () => {
            const gap = parseFloat(getComputedStyle(node).rowGap) || 0;
            const height = node.getBoundingClientRect().height;
            setCapacity(Math.max(1, Math.min(maximum, Math.floor((height + gap) / (minimumHeight + gap)))));
        };
        update();
        observer.current = new ResizeObserver(update);
        observer.current.observe(node);
    }, [minimumHeight, maximum]);
    useEffect(() => () => observer.current?.disconnect(), []);
    return { ref, capacity };
};

const NewsPanel = ({ ige, ts, onSpeak, goBack: _goBack, disableGaze, browser, gpRef, isNavHidden }: {
    ige: boolean;
    ts: number;
    onSpeak: (t: string) => void;
    goBack: () => void;
    disableGaze: () => void;
    browser: ReturnType<typeof useGazeBrowser>;
    gpRef: React.MutableRefObject<{ x: number; y: number }>;
    isNavHidden?: boolean;
}) => {
    const ws = useWS();
    const { isLight, isMix, isWarm } = useTheme();
    // Theme-aware chrome tokens. Content cards stay dark in all modes.
    const T_pageBg = 'var(--ui-page)';
    const T_chromeBg = 'var(--ui-panel)';
    const T_chromeBorder = 'var(--ui-border)';
    const T_chromeText = 'var(--ui-ink)';
    const T_chromeTextMuted = 'var(--ui-muted)';
    const T_chromeShadow = 'none';
    const T_chromePillSelected = isLight ? 'rgba(31, 107, 126, 0.16)' : isWarm ? warmScreenTokens.web.chromePillSelected : isMix ? 'rgba(180, 147, 98, 0.22)' : 'rgba(198, 154, 69, 0.16)';
    const T_chromePillSelectedBorder = isLight ? 'rgba(31, 107, 126, 0.34)' : isWarm ? warmScreenTokens.web.chromePillSelectedBorder : isMix ? 'rgba(180, 147, 98, 0.40)' : 'rgba(198, 154, 69, 0.34)';
    const T_chromePillSelectedText = isLight ? '#1F6B7E' : isWarm ? warmScreenTokens.web.chromePillSelectedText : isMix ? '#E3C28E' : '#F1E2C2';
    const T_chromeAccentLine = isLight ? '#1F6B7E' : isWarm ? warmScreenTokens.web.accentLine : isMix ? '#B49362' : '#C69A45';
    const [cat, setCat] = useState('positive_india');
    const [categoryPage, setCategoryPage] = useState(0);
    const [articlePage, setArticlePage] = useState(0);
    const categoryChoices = useGazePageCapacity(90, 7);
    const [readerPage, setReaderPage] = useState(0);
    const readerChoices = useGazePageCapacity(120, 5);
    const [sel, setSel] = useState<NewsItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [readerUrl, setReaderUrl] = useState('');
    const [readerLoading, setReaderLoading] = useState(false);
    const [readerData, setReaderData] = useState<any | null>(null);
    // Embedded BrowserView ("live mode") removed from news flow — it crashed
    // on open. News reader now exclusively uses the parsed-text Reader View.
    const [autoReadOn, setAutoReadOn] = useState(false);
    const [autoReadPaused, setAutoReadPaused] = useState(false);
    const [autoReadIndex, setAutoReadIndex] = useState(0);
    const [isCompactGrid, setIsCompactGrid] = useState(() =>
        typeof window !== 'undefined' ? (window.innerWidth < 1500 || window.innerHeight < 900) : false,
    );
    const scrollRef = useRef<HTMLDivElement>(null);
    const autoReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cats = ws.newsCategories.length ? ws.newsCategories : [
        { id: 'top', label: 'Top Stories', icon: '⭐' }, { id: 'india', label: 'India', icon: '🇮🇳' },
        { id: 'world', label: 'World', icon: '🌍' }, { id: 'health', label: 'Health', icon: '💚' },
        { id: 'sports', label: 'Sports', icon: '🏏' }, { id: 'tech', label: 'Tech', icon: '💻' },
        { id: 'science', label: 'Science', icon: '🔬' },
    ];

    useEffect(() => {
        ws.getNewsCategories();
        // The first fetch will be triggered by the `cat` dependency useEffect below
    }, []);

    useEffect(() => {
        setIsLoading(true);
        setArticlePage(0);
        setReaderPage(0);
        setSel(null);
        setReaderUrl('');
        setReaderData(null);
        setReaderLoading(false);
        setAutoReadOn(false);
        setAutoReadPaused(false);
        setAutoReadIndex(0);
        ws.getNews(cat, 9);
    }, [cat]);

    useEffect(() => {
        setIsLoading(false);
    }, [ws.newsItems, ws.newsCached]);

    useEffect(() => {
        if (!ws.articleData || !readerUrl) return;
        if (ws.articleData.url === readerUrl) {
            setReaderData(ws.articleData);
            setReaderLoading(false);
        }
    }, [ws.articleData, readerUrl]);

    // Embedded BrowserView effects removed — news flow no longer opens
    // in-app browser. Reader View (parsed text) is the only article render.
    // Defensive cleanup: if any browser session lingers from a sibling panel
    // (YouTube / Quick Search) we close it on news-component unmount.
    useEffect(() => {
        return () => {
            try { browser.closePage(); } catch { /* ignore */ }
        };
    }, [browser.closePage]);

    useEffect(() => {
        if (autoReadTimerRef.current) {
            clearTimeout(autoReadTimerRef.current);
            autoReadTimerRef.current = null;
        }
        if (!autoReadOn || autoReadPaused || !ws.newsItems.length) return;

        const idx = autoReadIndex % ws.newsItems.length;
        const item = ws.newsItems[idx] as NewsItem;
        onSpeak(`${item.title}. ${item.summary || item.description || ''}`.trim());

        autoReadTimerRef.current = setTimeout(() => {
            setAutoReadIndex((prev) => prev + 1);
        }, 5000);

        return () => {
            if (autoReadTimerRef.current) {
                clearTimeout(autoReadTimerRef.current);
                autoReadTimerRef.current = null;
            }
        };
    }, [autoReadOn, autoReadPaused, autoReadIndex, ws.newsItems, onSpeak]);

    useEffect(() => {
        return () => {
            if (autoReadTimerRef.current) {
                clearTimeout(autoReadTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setIsCompactGrid(window.innerWidth < 1500 || window.innerHeight < 900);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const startAutoRead = useCallback(() => {
        if (!ws.newsItems.length) return;
        setAutoReadOn(true);
        setAutoReadPaused(false);
        if (autoReadIndex >= ws.newsItems.length) {
            setAutoReadIndex(0);
        }
    }, [autoReadIndex, ws.newsItems.length]);

    const pauseAutoRead = useCallback(() => {
        setAutoReadPaused((prev) => !prev);
    }, []);

    const stopAutoRead = useCallback(() => {
        setAutoReadOn(false);
        setAutoReadPaused(false);
        setAutoReadIndex(0);
        ws.stopSpeaking();
    }, [ws.stopSpeaking]);

    const selectItem = useCallback((item: NewsItem) => {
        setSel(item);
        setReaderData(null);
        setReaderUrl('');
        setReaderLoading(false);
        onSpeak(`${item.title}. ${item.summary || item.description || ''}`.trim());
        disableGaze();
    }, [disableGaze, onSpeak]);

    const openReaderView = useCallback(() => {
        if (!sel?.link) return;
        setReaderUrl(sel.link);
        setReaderLoading(true);
        setReaderData(null);
        ws.fetchArticle(sel.link);
        disableGaze();
    }, [sel, ws.fetchArticle, disableGaze]);

    const cardCount = isCompactGrid ? 4 : 6;
    const articlePages = Math.max(1, Math.ceil(ws.newsItems.length / cardCount));
    const visibleArticlePage = Math.min(articlePage, articlePages - 1);
    const visibleItems = ws.newsItems.slice(visibleArticlePage * cardCount, (visibleArticlePage + 1) * cardCount) as NewsItem[];
    const activeAutoReadIndex = ws.newsItems.length ? autoReadIndex % ws.newsItems.length : -1;
    const readerPages = Math.max(1, Math.ceil(ws.newsItems.length / readerChoices.capacity));
    const visibleReaderPage = Math.min(readerPage, readerPages - 1);
    const sidebarItems = ws.newsItems.slice(visibleReaderPage * readerChoices.capacity, (visibleReaderPage + 1) * readerChoices.capacity) as NewsItem[];
    const categoryIndex = Math.max(0, cats.findIndex((c: any) => c.id === cat));
    const currentCategory = cats[categoryIndex] || cats[0];
    const categoryPages = Math.max(1, Math.ceil(cats.length / categoryChoices.capacity));
    const visibleCategoryPage = Math.min(categoryPage, categoryPages - 1);
    const visibleCategories = cats.slice(visibleCategoryPage * categoryChoices.capacity, (visibleCategoryPage + 1) * categoryChoices.capacity);
    const readerBodyRaw = readerData?.text || sel?.content || sel?.description || sel?.summary || '';
    const readableParagraphs = formatNewsAsReadableParagraphs(readerBodyRaw);

    if (sel) {
        // Simplified toolbar — embedded BrowserView removed (it crashed on open).
        // 5 essential actions: Close · Read · Read Full Story · Stop · Scroll.
        // All buttons sit in one connected container with internal dividers;
        // semantic roles: dismiss=close/stop, primary=open/scroll, secondary=TTS.
        const totalBtns = 5;
        const positionAt = (idx: number): 'first' | 'middle' | 'last' =>
            idx === 0 ? 'first' : idx === totalBtns - 1 ? 'last' : 'middle';
        let bi = 0;
        const nextPos = () => positionAt(bi++);
        return (
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                marginTop: 'clamp(8px, 1vh, 14px)',
                padding: 'clamp(12px, 1.5vh, 18px) clamp(20px, 3vw, 40px)',
                paddingBottom: 'clamp(16px, 2vh, 28px)',
                background: T_pageBg,
            }}>
                {/* Connected toolbar — single rounded container, internal dividers,
                    semantic role colors. Matches YouTube reader chrome. */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'clamp(10px, 1.1vw, 16px)',
                    flexShrink: 0,
                    marginBottom: 'clamp(14px,2vh,22px)',
                }}>
                    <div className="browser-toolbar web-bar" style={{ ...connectedToolbarStyle, flex: 1 }}>
                        <GazeButton id="n-close" onClick={() => { setSel(null); setReaderData(null); setReaderUrl(''); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                            style={{ ...toolbarBtnConnected('dismiss', false, nextPos()), fontWeight: 800, letterSpacing: '0.08em' }}>
                            <XIcon size={26} color="currentColor" strokeWidth={2.4} />
                            <span>Close</span>
                        </GazeButton>
                        <GazeButton id="n-read" onClick={() => onSpeak(`${sel.title}. ${sel.summary || sel.description || ''}`)} gazeEnabled={ige}
                            gazeEnabledTimestamp={ts} isDarkMode dwellCategory="phraseButton" style={toolbarBtnConnected('secondary', false, nextPos())}>
                            <SpeakIcon size={26} color="currentColor" strokeWidth={2.3} />
                            <span>Read</span>
                        </GazeButton>
                        <GazeButton id="n-reader" onClick={openReaderView} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="phraseButton"
                            style={toolbarBtnConnected('primary', false, nextPos())}>
                            <WI.BookOpenIcon size={26} strokeWidth={2.2} />
                            <span>Read Full Story</span>
                        </GazeButton>
                        <GazeButton id="n-stop" onClick={() => ws.stopSpeaking()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                            style={toolbarBtnConnected('dismiss', false, nextPos())}>
                            <WI.StopSquareIcon size={26} strokeWidth={2.2} />
                            <span>Stop</span>
                        </GazeButton>
                        <GazeButton id="n-scroll" onClick={() => scrollRef.current?.scrollBy({ top: 280, behavior: 'smooth' })} gazeEnabled={ige}
                            gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton" style={toolbarBtnConnected('primary', false, nextPos())}>
                            <WI.ArrowDownLineIcon size={26} strokeWidth={2.3} />
                            <span>Scroll</span>
                        </GazeButton>
                    </div>
                    {ws.newsCached && <span className="web-answer-tag" style={{ alignSelf: 'center', marginLeft: 0 }}>Saved earlier</span>}
                </div>

                <div style={{ flex: 1, display: 'flex', gap: 'clamp(18px, 2.4vh, 28px)', overflow: 'hidden', minHeight: 0 }}>
                    <div style={{ width: 'clamp(340px, 29vw, 410px)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1.6vh, 18px)', overflow: 'hidden' }}>
                        <div className="news-current">
                            <div className="web-list-icon" style={{ color: WEB_ACCENT[newsCategoryLook(currentCategory?.id || cat).accent] }}>
                                {newsCategoryLook(currentCategory?.id || cat).icon(34)}
                            </div>
                            <div className="web-list-text">
                                <span className="web-list-sub">Category</span>
                                <span className="web-list-title">{stripLeadingEmoji(currentCategory?.label || 'News')}</span>
                            </div>
                        </div>

                        {/* Sidebar list — only renders actual items (no dashed empty
                            placeholders). Items distribute across the available
                            vertical space via 1fr rows, so 3 items fill the panel
                            cleanly instead of stacking at the top with empty slots. */}
                        <div ref={readerChoices.ref} className="browse-reader-choices" style={{
                            flex: 1,
                            display: 'grid',
                            gridTemplateRows: `repeat(${Math.max(1, sidebarItems.length)}, minmax(80px, 1fr))`,
                            gap: 'clamp(12px, 1.4vh, 16px)',
                            overflow: 'hidden',
                            minHeight: 0,
                            alignContent: 'stretch',
                        }}>
                            {sidebarItems.map((it, i) => (
                                <GazeButton
                                    key={`${it.title}-${i}`}
                                    id={`ni-side-${visibleReaderPage * readerChoices.capacity + i}`} selected={sel.title === it.title}
                                    onClick={() => selectItem(it)}
                                    gazeEnabled={ige}
                                    gazeEnabledTimestamp={ts}
                                    isDarkMode dwellCategory="navigationButton"
                                    contentFill
                                    style={{
                                        width: '100%', height: '100%', minHeight: 80,
                                        display: 'flex', alignItems: 'stretch',
                                        padding: 0, overflow: 'hidden', textAlign: 'left',
                                        fontFamily: FONT_PRIMARY,
                                    }}
                                >
                                    {/* The story list's card, smaller: source and time, then the headline. */}
                                    <div className="news-side-card">
                                        <div className="news-card-meta">
                                            <WI.NewspaperIcon size={20} strokeWidth={2} />
                                            <span className="news-card-source">{it.source || 'News'}</span>
                                            {it.relative_time && <span className="news-card-time">{it.relative_time}</span>}
                                        </div>
                                        <div className="news-side-title">{it.title}</div>
                                    </div>
                                </GazeButton>
                            ))}
                            {sidebarItems.length === 0 && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '18px',
                                    border: isLight || isWarm
                                        ? '1px dashed rgba(122, 99, 71, 0.20)'
                                        : '1px solid rgba(90,110,130,0.12)',
                                    background: isLight ? 'rgba(168, 120, 56, 0.06)'
                                        : isWarm ? 'rgba(122, 99, 71, 0.05)'
                                        : 'rgba(20,30,44,0.22)',
                                    color: isLight ? '#76624A' : isWarm ? '#8A7C6B' : 'rgba(153,175,198,0.78)',
                                    fontSize: 'clamp(13px, 1.5vh, 17px)',
                                    fontWeight: 600,
                                    fontFamily: FONT_PRIMARY,
                                    fontStyle: 'italic',
                                }}>
                                    No related articles
                                </div>
                            )}
                        </div>
                        {readerPages > 1 && <div className="browse-page-controls">
                            <GazeButton id="news-related-prev" disabled={visibleReaderPage === 0} onClick={() => setReaderPage(Math.max(0, visibleReaderPage - 1))} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton">
                                <WI.ChevronLeftIcon size={26} strokeWidth={2.4} />
                                <span>Previous</span>
                            </GazeButton>
                            <GazeButton id="news-related-next" disabled={visibleReaderPage >= readerPages - 1} onClick={() => setReaderPage(Math.min(readerPages - 1, visibleReaderPage + 1))} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton">
                                <span>More</span>
                                <WI.ChevronRightIcon size={26} strokeWidth={2.4} />
                            </GazeButton>
                        </div>}
                    </div>

                    {(() => {
                        // Theme tokens for the reader card — fully light/warm/mix aware.
                        const T_readerBg = isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : isMix ? '#241F18' : T.cardBg;
                        const T_readerBorder = isLight ? '1.5px solid rgba(168, 120, 56, 0.22)'
                            : isWarm ? '1px solid rgba(122, 99, 71, 0.16)'
                            : isMix ? '1.5px solid rgba(180, 147, 98, 0.28)'
                            : '1.5px solid rgba(213, 216, 188, 0.14)';
                        const T_readerShadow = isLight ? '0 4px 12px rgba(82, 66, 45, 0.10)'
                            : isWarm ? '0 1px 2px rgba(82, 65, 48, 0.05)'
                            : isMix ? 'inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 10px 22px rgba(0, 0, 0, 0.36)'
                            : 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)';
                        const T_titleColor = isLight ? '#2E2A24' : isWarm ? '#2F2A26' : isMix ? '#FFFCF1' : T.textMain;
                        const T_metaColor = isLight ? '#76624A' : isWarm ? '#6A625B' : isMix ? '#C4B697' : 'rgba(173,194,214,0.85)';
                        const T_bodyColorPrimary = isLight ? '#2E2A24' : isWarm ? '#2F2A26' : isMix ? '#FFFCF1' : '#F3F8FF';
                        const T_bodyColorSecondary = isLight ? '#3F3933' : isWarm ? '#3F3933' : isMix ? 'rgba(255,252,241,0.92)' : 'rgba(230,237,243,0.93)';
                        // Source-badge styling (matches news grid card source badges)
                        const T_badgeAccent = isLight ? '#1F6B7E' : isWarm ? '#4F7388' : isMix ? '#B49362' : '#789D91';
                        const T_badgeBg = (isLight || isWarm) ? `${T_badgeAccent}15` : isMix ? 'rgba(180, 147, 98, 0.18)' : 'rgba(120, 157, 145, 0.18)';
                        const T_badgeBorder = (isLight || isWarm) ? `${T_badgeAccent}33` : isMix ? 'rgba(180, 147, 98, 0.32)' : 'rgba(120, 157, 145, 0.32)';
                        // Lede callout — first paragraph gets accent-tinted bg/border
                        const T_ledeBg = isLight ? 'rgba(31, 107, 126, 0.07)'
                            : isWarm ? 'rgba(79, 115, 136, 0.08)'
                            : isMix ? 'rgba(180, 147, 98, 0.10)'
                            : 'rgba(88,166,255,0.08)';
                        const T_ledeBorder = isLight ? '1px solid rgba(31, 107, 126, 0.22)'
                            : isWarm ? '1px solid rgba(79, 115, 136, 0.24)'
                            : isMix ? '1px solid rgba(180, 147, 98, 0.28)'
                            : '1px solid rgba(88,166,255,0.22)';
                        const T_dividerLine = isLight ? 'rgba(168, 120, 56, 0.28)'
                            : isWarm ? 'rgba(122, 99, 71, 0.24)'
                            : isMix ? 'rgba(180, 147, 98, 0.30)'
                            : 'rgba(56, 189, 248, 0.20)';
                        return (
                        <div className="browse-reader" ref={scrollRef} style={{
                            flex: 1, display: 'flex', flexDirection: 'column',
                            alignItems: 'stretch', justifyContent: 'flex-start',
                            padding: 'clamp(32px, 4.2vh, 56px) clamp(28px, 3.6vw, 56px)',
                            overflow: 'auto', minHeight: 0,
                            background: T_readerBg,
                            border: T_readerBorder,
                            borderRadius: '26px',
                            boxShadow: T_readerShadow,
                        }}>
                            <div style={{ width: '100%', maxWidth: 'min(980px, 100%)', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
                                {/* Source badge — small accent pill above the headline,
                                    mirrors YouTube channel-badge grammar. */}
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center',
                                    alignSelf: 'flex-start',
                                    gap: '8px',
                                    background: T_badgeBg,
                                    color: T_badgeAccent,
                                    border: `1px solid ${T_badgeBorder}`,
                                    padding: 'clamp(5px, 0.7vh, 8px) clamp(12px, 1.2vw, 16px)',
                                    borderRadius: '999px',
                                    fontSize: 'clamp(13px, 1.4vh, 16px)',
                                    fontWeight: 800,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase' as const,
                                    marginBottom: 'clamp(14px, 1.8vh, 22px)',
                                    fontFamily: FONT_PRIMARY,
                                }}>
                                    <WI.NewspaperIcon size={18} strokeWidth={2.2} />
                                    <span>{sel.source || 'News'}</span>
                                </div>
                                <h2 style={{
                                    fontSize: 'clamp(32px, 4.4vh, 52px)',
                                    fontWeight: 650,
                                    color: T_titleColor,
                                    margin: 0,
                                    fontFamily: FONT_PRIMARY,
                                    lineHeight: 1.22,
                                    letterSpacing: '-0.012em',
                                }}>
                                    {readerData?.title || sel.title}
                                </h2>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'clamp(10px, 1vw, 14px)',
                                    flexWrap: 'wrap',
                                    marginTop: 'clamp(12px, 1.4vh, 18px)',
                                    color: T_metaColor,
                                    fontSize: 'clamp(14px, 1.5vh, 18px)',
                                    fontWeight: 600,
                                    fontFamily: FONT_PRIMARY,
                                }}>
                                    <span>{sel.relative_time || 'Recent'}</span>
                                    {readerData?.cached && <>
                                        <span style={{ opacity: 0.5 }}>·</span>
                                        <span style={{ color: T_badgeAccent }}>Reader Cache</span>
                                    </>}
                                    {readerData?.fallback && <>
                                        <span style={{ opacity: 0.5 }}>·</span>
                                        <span style={{ color: isLight || isWarm ? '#85703D' : '#FFCC80' }}>Fallback mode</span>
                                    </>}
                                </div>
                                <div style={{
                                    height: 1, background: T_dividerLine,
                                    margin: 'clamp(20px, 2.4vh, 28px) 0 clamp(22px, 2.8vh, 32px)',
                                }} />
                                {readerLoading && (
                                    <div style={{ fontSize: 'clamp(20px, 2.3vh, 26px)', color: T_metaColor, lineHeight: 1.8 }}>
                                        Loading AAC Reader View...
                                    </div>
                                )}
                                {!readerLoading && (
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 'clamp(18px, 2.3vh, 28px)',
                                        fontFamily: FONT_PRIMARY,
                                    }}>
                                        {(readableParagraphs.length ? readableParagraphs : ['No article content available right now. Use Open in Browser.']).map((para, idx) => (
                                            <p key={`np-${idx}`} style={{
                                                margin: 0,
                                                fontSize: 'clamp(20px, 2.45vh, 30px)',
                                                lineHeight: 1.82,
                                                color: idx === 0 ? T_bodyColorPrimary : T_bodyColorSecondary,
                                                background: idx === 0 ? T_ledeBg : 'transparent',
                                                border: idx === 0 ? T_ledeBorder : 'none',
                                                borderRadius: idx === 0 ? '16px' : 0,
                                                padding: idx === 0 ? 'clamp(18px, 2.2vh, 26px) clamp(20px, 2.2vw, 28px)' : '0 clamp(2px, 0.4vw, 6px)',
                                                fontWeight: idx === 0 ? 520 : 480,
                                            }}>
                                                {para}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        );
                    })()}
                </div>
            </div>
        );
    }

    // ── LANDING: Sidebar (categories) + Article grid + Reader-controls strip ──
    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'row',
            gap: 'clamp(16px, 1.8vw, 26px)',
            padding: 'clamp(14px, 1.6vh, 22px) clamp(20px, 2.2vw, 32px)',
            paddingBottom: 'clamp(28px, 3.5vh, 42px)',
            overflow: 'hidden',
            background: T_pageBg,
        }}>
            {/* SIDEBAR — news categories. Mirrors YouTube sidebar grammar:
                wider chrome panel, larger icons (48px) inside dedicated icon
                zones, larger title fonts, accent line on selection, neutral
                hairline border at all times. Each category gets a small
                diversified accent in paper modes (visual variety like YT). */}
            <div className="browse-category-panel" style={{
                width: 'clamp(300px, 28vw, 440px)', flexShrink: 0,
                display: 'flex', flexDirection: 'column', minHeight: 0,
                gap: 'clamp(10px, 1.2vh, 16px)',
                background: T_chromeBg,
                border: `1.5px solid ${T_chromeBorder}`,
                borderRadius: '22px',
                padding: 'clamp(14px, 1.5vh, 20px)',
                overflow: 'hidden',
                boxShadow: T_chromeShadow,
            }}>
                <div ref={categoryChoices.ref} className="browse-category-choices">
                {visibleCategories.map((c: any) => {
                    const isSelected = cat === c.id;
                    const look = newsCategoryLook(c.id);
                    return (
                        <GazeButton key={c.id} id={`nc-${c.id}`} className="browse-category-choice web-list-choice" selected={isSelected} onClick={() => { setCat(c.id); disableGaze(); }}
                            gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            contentFill
                            style={{
                                width: '100%', height: '100%', minHeight: 0,
                                position: 'relative', overflow: 'hidden',
                                borderRadius: '18px',
                                display: 'flex', alignItems: 'stretch', justifyContent: 'flex-start',
                                padding: 0,
                                fontFamily: FONT_PRIMARY,
                                textAlign: 'left',
                            }}>
                            <div className="web-list-icon" style={{ color: WEB_ACCENT[look.accent] }}>{look.icon(40)}</div>
                            <div className="web-list-text">
                                <span className="web-list-title">{stripLeadingEmoji(c.label)}</span>
                                <span className="web-list-sub">{look.sub}</span>
                            </div>
                        </GazeButton>
                    );
                })}
                </div>
                {/* Paging only when the categories do not fit; otherwise they take the room. */}
                {categoryPages > 1 && <div className="browse-page-controls">
                    <GazeButton id="news-categories-prev" disabled={visibleCategoryPage === 0} onClick={() => setCategoryPage(Math.max(0, visibleCategoryPage - 1))} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton">
                        <WI.ChevronLeftIcon size={26} strokeWidth={2.4} />
                        <span>Previous</span>
                    </GazeButton>
                    <GazeButton id="news-categories-next" disabled={visibleCategoryPage >= categoryPages - 1} onClick={() => setCategoryPage(Math.min(categoryPages - 1, visibleCategoryPage + 1))} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton">
                        <span>More</span>
                        <WI.ChevronRightIcon size={26} strokeWidth={2.4} />
                    </GazeButton>
                </div>}
            </div>

            {/* CONTENT — refresh header + article grid + reader controls strip */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1.4vh, 18px)', overflow: 'hidden', minHeight: 0 }}>
                {/* Header: the category being read, then Refresh / Previous / More. */}
                <div className="news-head" style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 1.2vw, 18px)', flexShrink: 0 }}>
                    <div className="news-head-title">
                        <div className="web-list-icon" style={{ color: WEB_ACCENT[newsCategoryLook(currentCategory?.id || cat).accent] }}>
                            {newsCategoryLook(currentCategory?.id || cat).icon(34)}
                        </div>
                        <div className="web-list-text">
                            <span className="web-list-title">{stripLeadingEmoji(currentCategory?.label || 'News')}</span>
                            <span className="web-list-sub">
                                {isLoading ? 'Loading stories…' : `${ws.newsItems.length} ${ws.newsItems.length === 1 ? 'story' : 'stories'} · page ${visibleArticlePage + 1} of ${articlePages}`}
                                {ws.newsCached ? ' · saved earlier' : ''}
                            </span>
                        </div>
                    </div>
                    <GazeButton id="n-ref" onClick={() => { setIsLoading(true); ws.refreshNews(cat, 9); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        style={{ ...toolbarBtn('secondary', false), minHeight: 'clamp(80px, 9vh, 104px)', minWidth: 'clamp(140px, 11vw, 190px)', flex: '0 0 auto', fontSize: 'clamp(19px, 2.3vh, 25px)' }}>
                        <RefreshIcon size={28} color="currentColor" strokeWidth={2.2} />
                        <span>Refresh</span>
                    </GazeButton>
                    <GazeButton id="news-articles-prev" disabled={visibleArticlePage === 0} onClick={() => setArticlePage(Math.max(0, visibleArticlePage - 1))} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                        style={{ ...toolbarBtn('primary', false), minHeight: 'clamp(80px, 9vh, 104px)', minWidth: 'clamp(140px, 11vw, 190px)', flex: '0 0 auto', fontSize: 'clamp(19px, 2.3vh, 25px)', opacity: visibleArticlePage === 0 ? 0.5 : 1 }}>
                        <WI.ChevronLeftIcon size={28} strokeWidth={2.4} />
                        <span>Previous</span>
                    </GazeButton>
                    <GazeButton id="news-articles-next" disabled={visibleArticlePage >= articlePages - 1} onClick={() => setArticlePage(Math.min(articlePages - 1, visibleArticlePage + 1))} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        style={{ ...toolbarBtn('primary', false), minHeight: 'clamp(80px, 9vh, 104px)', minWidth: 'clamp(140px, 11vw, 190px)', flex: '0 0 auto', fontSize: 'clamp(19px, 2.3vh, 25px)', opacity: visibleArticlePage >= articlePages - 1 ? 0.5 : 1 }}>
                        <span>More</span>
                        <WI.ChevronRightIcon size={28} strokeWidth={2.4} />
                    </GazeButton>
                </div>

                {/* Story cards: source and time, then the headline in large type. */}
                <div style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: isCompactGrid ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
                    gridAutoRows: 'minmax(0, 1fr)',
                    gap: 'clamp(14px, 1.6vh, 22px)',
                    overflow: 'hidden', minHeight: 0,
                }}>
                    {(visibleItems.length ? visibleItems : Array(cardCount).fill(null)).map((it: NewsItem | null, i: number) => {
                        const reading = autoReadOn && (visibleArticlePage * cardCount + i) === activeAutoReadIndex;
                        return (
                            <GazeButton key={it?.title || `ph-${i}`} id={`ni-${i}`} className={`browse-news-choice${reading ? ' is-reading' : ''}`} disabled={!it} onClick={() => { if (it) selectItem(it); }}
                                gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                                contentFill
                                style={{
                                    width: '100%', height: '100%', minHeight: 0,
                                    borderRadius: '22px',
                                    display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                                    padding: 0,
                                    overflow: 'hidden',
                                    opacity: it ? 1 : 0.45,
                                    textAlign: 'left',
                                }}>
                                <div className="news-card">
                                    {it && (
                                        <div className="news-card-meta">
                                            <WI.NewspaperIcon size={22} strokeWidth={2} />
                                            <span className="news-card-source">{it.source || 'News'}</span>
                                            {it.relative_time && <span className="news-card-time">{it.relative_time}</span>}
                                        </div>
                                    )}
                                    <div className="news-card-title">
                                        {it?.title || (isLoading ? 'Loading stories…' : 'No news here right now. Choose Refresh.')}
                                    </div>
                                    {it && (it.summary || it.description) && (
                                        <div className="news-card-summary">{it.summary || it.description}</div>
                                    )}
                                </div>
                            </GazeButton>
                        );
                    })}
                </div>

                {/* Reader-controls strip — Auto-Read / Pause / Stop */}
                <div className="web-bar" style={{
                    display: 'flex', alignItems: 'stretch', gap: 'clamp(12px, 1.2vw, 18px)',
                    flexShrink: 0,
                }}>
                    <GazeButton id="n-auto" onClick={startAutoRead} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        style={{ ...toolbarBtn('secondary', false), minHeight: 'clamp(86px, 10vh, 116px)', fontSize: 'clamp(19px, 2.3vh, 26px)' }}>
                        <SpeakIcon size={28} color="currentColor" strokeWidth={2.3} />
                        <span>Auto-Read</span>
                    </GazeButton>
                    <GazeButton id="n-pause" onClick={pauseAutoRead} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        style={{ ...toolbarBtn('primary', false), minHeight: 'clamp(86px, 10vh, 116px)', fontSize: 'clamp(19px, 2.3vh, 26px)' }}>
                        {autoReadPaused
                            ? <PlayIcon size={28} color="currentColor" strokeWidth={2.3} />
                            : <PauseIcon size={28} color="currentColor" strokeWidth={2.3} />}
                        <span>{autoReadPaused ? 'Resume' : 'Pause'}</span>
                    </GazeButton>
                    <GazeButton id="n-stop-auto" onClick={stopAutoRead} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                        style={{ ...toolbarBtn('dismiss', false), minHeight: 'clamp(86px, 10vh, 116px)', fontSize: 'clamp(19px, 2.3vh, 26px)', fontWeight: 800 }}>
                        <WI.StopSquareIcon size={26} strokeWidth={2.3} />
                        <span>Stop</span>
                    </GazeButton>
                </div>
            </div>
        </div>
    );
};

// ── YOUTUBE PANEL ──
// Two modes, never both at once (6 Oct 2026, maintainer request "a few selection points"):
// - Watch: the page takes no gaze at all; the bar below the video drives it (Back,
//   Pause / Play, Next, Full Screen, More Videos, Search).
// - Browse: gaze on the page picks a video card. Only cards and dialog buttons answer
//   there (browserGazeController youtubeStrictTargets): never YouTube's own header,
//   chips, play, pause or Skip Ad. Up / Down beside the page move it most of a screen
//   at a time. On Home and results pages, Look Only turns page gaze off (to read
//   without opening a video) and Choose Videos turns it back on.
// A video opens in Watch; YouTube Home, results and channels open in Browse. While
// YouTube's own Skip button can be pressed, Skip Ad takes Next's place on either bar.
// Browsing a video page keeps Pause / Play and Next, and the dock beside the page has
// Up, Gaze Scroll, Full Screen and Down -- everything the old Control bar offered.
type YoutubePageInfo = { skippable: boolean; videoChoices: number | null; title: string };
const NO_YOUTUBE_PAGE_INFO: YoutubePageInfo = { skippable: false, videoChoices: null, title: '' };
const isYouTubeVideoUrl = (url: string) => /(?:youtube\.com\/(?:watch|shorts|live)\b|youtu\.be\/)/i.test(url);
/** The video id of a YouTube watch address (its `v`), or '' for anything else. */
const youtubeVideoId = (url: string) => {
    try { return new URL(url).searchParams.get('v') || ''; } catch { return ''; }
};
/** The same address, starting the video at `seconds` (YouTube's own `t`). */
const withStartTime = (url: string, seconds: number) => {
    try {
        const next = new URL(url);
        next.searchParams.set('t', `${Math.max(0, Math.floor(seconds))}s`);
        return next.toString();
    } catch {
        return url;
    }
};
/** What the video is doing, for the calm full-screen rules (calmWatch.ts). */
const calmPlaybackOf = (state: string): CalmPlayback => {
    if (state === 'playing' || state === 'paused' || state === 'ended') return state;
    return state === 'ad_waiting' ? 'ad' : 'loading';
};
// YouTube's player error ("Something went wrong. Refresh or try again later."), 8 Oct 2026:
// wait this long for YouTube to recover by itself, then open the video again where it was;
// at most this many times for one video in this window, then Browse as before.
const PLAYER_ERROR_WAIT_MS = 2500;
const PLAYER_ERROR_RETRIES = 2;
const PLAYER_ERROR_WINDOW_MS = 5 * 60 * 1000;

const YouTubePanel = ({ ige, ts, browser, gpRef, getGaze, goBack: goGridBack, disableGaze, toggleGaze, isNavHidden, isDarkMode, browserInteractionMode, onBrowserInteractionModeChange, onVideoActive, onNavHiddenToggle }: {
    ige: boolean; ts: number; browser: ReturnType<typeof useGazeBrowser>;
    gpRef: React.MutableRefObject<{ x: number; y: number }>;
    /** The latest fresh gaze point (window px): the calm full-screen strip counts a look with it. */
    getGaze?: GazePointSource;
    goBack: () => void;
    disableGaze: () => void;
    toggleGaze: () => void;
    isNavHidden?: boolean;
    isDarkMode: boolean;
    browserInteractionMode: BrowserInteractionMode;
    onBrowserInteractionModeChange: (mode: BrowserInteractionMode) => void;
    onVideoActive?: (active: boolean) => void;
    onNavHiddenToggle?: (hidden: boolean) => void;
}) => {
    const { isLight, isMix, isWarm } = useTheme();
    const { data: { settings } } = useCustomization();
    // Theme-aware chrome tokens. The YouTube video card stays dark in all modes.
    const T_pageBg = 'var(--ui-page)';
    const T_chromeBg = 'var(--ui-panel)';
    const T_chromeBorder = 'var(--ui-border)';
    const T_chromeText = 'var(--ui-ink)';
    const T_chromeTextMuted = 'var(--ui-muted)';
    const T_chromeShadow = 'none';
    void T_chromeText; void T_chromeTextMuted;
    const [catId, setCatId] = useState('old_songs');
    const [playing, setPlaying] = useState<any>(null);
    const [youtubeState, setYoutubeState] = useState<string>('idle');
    // In-app full screen (the player filling the page, never true browser full
    // screen). The page is the source of truth: it is read back after every
    // navigation ('is_maximized') so the button never says the opposite of what it does.
    const [isVideoMaximized, setIsVideoMaximized] = useState(false);
    const [pageInfo, setPageInfo] = useState<YoutubePageInfo>(NO_YOUTUBE_PAGE_INFO);
    // The search keyboard replaces the panel; the page is taken off the window meanwhile.
    const [searchOpen, setSearchOpen] = useState(false);
    const navHiddenBeforeSearchRef = useRef<boolean | null>(null);
    const viewRef = useRef<HTMLDivElement>(null);
    const autoPlayUrlRef = useRef('');
    const modeUrlRef = useRef('');
    // Where the video was last seen playing, to reopen it there after a player error.
    const lastPlayRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
    const errorRetriesRef = useRef<Record<string, number[]>>({});
    const restoreFullScreenRef = useRef(false);
    const cat = YT_CATS.find(c => c.id === catId) || YT_CATS[0];
    const toolbarGazeEnabled = isNavHidden ? true : ige;
    const toolbarGazeTimestamp = isNavHidden ? 0 : ts;
    const toolbarIconSize = isNavHidden ? 38 : browserToolbarIconSize;
    const isWatchMode = browserInteractionMode === 'watch';
    const currentBrowserUrl = browser.currentUrl || '';
    const isYouTubeWatchPage = isYouTubeVideoUrl(currentBrowserUrl);
    const browserStateRef = useRef({ isOpen: false, currentUrl: '' });

    useEffect(() => {
        browserStateRef.current = {
            isOpen: browser.isOpen,
            currentUrl: browser.currentUrl || '',
        };
    }, [browser.currentUrl, browser.isOpen]);

    useEffect(() => {
        onVideoActive?.(!!playing);
        if (playing) onNavHiddenToggle?.(true);
    }, [playing, onNavHiddenToggle, onVideoActive]);

    useEffect(() => () => {
        const state = browserStateRef.current;
        if (state.isOpen && /(?:youtube\.com|youtu\.be)/i.test(state.currentUrl)) {
            void browser.resetBrowserSession('youtube-panel-unmount');
        }
    }, [browser.resetBrowserSession]);

    useEffect(() => {
        if (playing || !browser.isOpen) return;
        if (/(?:youtube\.com|youtu\.be)/i.test(currentBrowserUrl)) {
            void browser.resetBrowserSession('youtube-panel-idle');
        }
    }, [browser.isOpen, browser.resetBrowserSession, currentBrowserUrl, playing]);

    // Each new page chooses the mode once: a video opens in Watch, anything else in
    // Browse. More Videos / Back to Video then switch by hand until the next page.
    useEffect(() => {
        if (!playing || !currentBrowserUrl || modeUrlRef.current === currentBrowserUrl) return;
        modeUrlRef.current = currentBrowserUrl;
        onBrowserInteractionModeChange(isYouTubeWatchPage ? 'watch' : 'control');
    }, [currentBrowserUrl, isYouTubeWatchPage, onBrowserInteractionModeChange, playing]);

    // YouTube's player sometimes gives up mid-video ("Something went wrong. Refresh or try
    // again later.") and its Refresh cannot be reached by gaze: the same video is opened again
    // where it was (in full screen if it was), at most twice in five minutes. A video that
    // still cannot play hands the page back to Browse for another choice.
    useEffect(() => {
        if (!playing || !isYouTubeWatchPage || youtubeState !== 'error') return;
        const url = currentBrowserUrl;
        const id = youtubeVideoId(url) || url;
        const now = Date.now();
        const recent = (errorRetriesRef.current[id] || []).filter((at) => now - at < PLAYER_ERROR_WINDOW_MS);
        if (recent.length >= PLAYER_ERROR_RETRIES) {
            onBrowserInteractionModeChange('control');
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            const check = await browser.youtubeCommand('get_state');
            if (cancelled || (check?.youtubeState || check?.detail) !== 'error') return;   // it recovered by itself
            errorRetriesRef.current[id] = [...recent, Date.now()];
            const at = lastPlayRef.current.id === id ? lastPlayRef.current.time : 0;
            restoreFullScreenRef.current = isVideoMaximized;
            void browser.navigateTo(withStartTime(url, at - 2));
        }, PLAYER_ERROR_WAIT_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [browser.navigateTo, browser.youtubeCommand, currentBrowserUrl, isVideoMaximized, isYouTubeWatchPage,
        onBrowserInteractionModeChange, playing, youtubeState]);

    // The page's state for the bar: one request at a time -- the next is asked only
    // once this one has answered (the main process gives up after 5 s), so a slow
    // page never piles requests up. Paused while the search keyboard is open.
    useEffect(() => {
        if (!playing || !browser.isOpen) {
            setYoutubeState('idle');
            setPageInfo(NO_YOUTUBE_PAGE_INFO);
            return;
        }
        if (searchOpen) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const poll = async () => {
            const result = await browser.youtubeCommand('get_state');
            if (cancelled) return;
            const state = result?.youtubeState || result?.detail || 'idle';
            setYoutubeState(state);
            const id = youtubeVideoId(browserStateRef.current.currentUrl);
            if (state === 'playing' && id && typeof result?.time === 'number' && result.time > 0) {
                lastPlayRef.current = { id, time: result.time };
            }
            // YouTube's promo popups over the video, and its miniplayer still playing the last
            // video over a new page, cannot be reached by gaze: answered and closed (8 Oct 2026).
            if (result?.promo || result?.miniplayer) void browser.youtubeCommand('tidy_page');
            const next: YoutubePageInfo = {
                skippable: result?.skippable === true,
                videoChoices: typeof result?.videoChoices === 'number' ? result.videoChoices : null,
                title: typeof result?.title === 'string' ? result.title : '',
            };
            setPageInfo((previous) => (previous.skippable === next.skippable && previous.videoChoices === next.videoChoices
                && previous.title === next.title ? previous : next));
            timer = setTimeout(poll, 1200);
        };
        void poll();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [browser.youtubeCommand, browser.isOpen, playing, searchOpen]);

    useEffect(() => {
        if (!playing || !browser.isOpen || !isYouTubeWatchPage || !currentBrowserUrl) return;
        if (autoPlayUrlRef.current === currentBrowserUrl) return;
        autoPlayUrlRef.current = currentBrowserUrl;
        let cancelled = false;
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const recoverPlayback = async () => {
            if (cancelled) return;
            attempts += 1;

            const state = await browser.youtubeCommand('get_state');
            if (cancelled) return;
            const nextState = state?.youtubeState || state?.detail || 'idle';
            setYoutubeState(nextState);
            let observedState = nextState;

            if (['ready', 'paused', 'stalled', 'buffering', 'ended'].includes(nextState)) {
                const playResult = await browser.youtubeCommand('play');
                observedState = playResult?.youtubeState || observedState;
                setYoutubeState(observedState);
            }

            if (observedState === 'playing' || observedState === 'ad_waiting' || attempts >= 8) return;
            timer = setTimeout(recoverPlayback, attempts < 4 ? 900 : 1500);
        };

        timer = setTimeout(recoverPlayback, 700);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [browser.youtubeCommand, browser.isOpen, currentBrowserUrl, isYouTubeWatchPage, playing]);

    // Open BrowserView AFTER player div renders.
    useEffect(() => {
        if (!playing) return;
        let cancelled = false;
        const raf = requestAnimationFrame(() => {
            if (cancelled || !viewRef.current) return;
            const r = viewRef.current.getBoundingClientRect();
            if (r.width > 50 && r.height > 50) {
                const url = resolveYouTubeUrl(playing);
                browser.openPage(url, { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
            }
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
        };
    }, [playing]);

    // A newly selected video always starts un-maximized (a fresh page is a fresh document).
    useEffect(() => {
        setIsVideoMaximized(false);
    }, [playing]);

    // After every navigation, read the full screen state back from the page. YouTube
    // moves between pages without reloading, so the full screen of a video would
    // otherwise stay on Home or a results page -- with its scrolling locked and its
    // search bar hidden. Anything that is not a video is restored at once.
    useEffect(() => {
        if (!playing || !browser.isOpen || !currentBrowserUrl) return;
        let cancelled = false;
        void browser.youtubeCommand('is_maximized').then(async (result) => {
            if (cancelled || typeof result?.maximized !== 'boolean') return;
            if (result.maximized && !isYouTubeWatchPage) {
                const restored = await browser.youtubeCommand('restore');
                if (!cancelled) setIsVideoMaximized(restored?.maximized === true);
                return;
            }
            setIsVideoMaximized(result.maximized);
        });
        return () => { cancelled = true; };
    }, [browser.isOpen, browser.youtubeCommand, currentBrowserUrl, isYouTubeWatchPage, playing]);

    const setFullScreen = useCallback(async (on: boolean) => {
        const result = await browser.youtubeCommand(on ? 'maximize' : 'restore');
        setIsVideoMaximized(typeof result?.maximized === 'boolean' ? result.maximized : false);
    }, [browser.youtubeCommand]);

    const toggleFullScreen = useCallback(() => {
        void setFullScreen(!isVideoMaximized);
    }, [isVideoMaximized, setFullScreen]);

    // After Back, YouTube Home or a search from a video, YouTube keeps playing that video in its
    // miniplayer over the new page, sound and all: closed at once (the state poll catches a late
    // one too), 8 Oct 2026.
    useEffect(() => {
        if (!playing || !browser.isOpen || !currentBrowserUrl || isYouTubeWatchPage) return;
        const timers = [600, 1600].map((ms) => window.setTimeout(() => { void browser.youtubeCommand('tidy_page'); }, ms));
        return () => timers.forEach((timer) => window.clearTimeout(timer));
    }, [browser.isOpen, browser.youtubeCommand, currentBrowserUrl, isYouTubeWatchPage, playing]);

    // A video reopened after a player error goes back to full screen once it plays again.
    useEffect(() => {
        if (!restoreFullScreenRef.current || !isYouTubeWatchPage || youtubeState !== 'playing' || isVideoMaximized) return;
        restoreFullScreenRef.current = false;
        void setFullScreen(true);
    }, [isVideoMaximized, isYouTubeWatchPage, setFullScreen, youtubeState]);

    const playPauseYouTube = useCallback(async () => {
        const result = await browser.youtubeCommand('play_pause');
        if (!result?.ok) setYoutubeState(result?.youtubeState || result?.detail || 'error');
        else if (result.youtubeState) setYoutubeState(result.youtubeState);
    }, [browser]);

    const nextYouTubeVideo = useCallback(async () => {
        const result = await browser.youtubeCommand('next');
        if (!result?.ok) setYoutubeState(result?.youtubeState || result?.status || 'ready');
    }, [browser]);

    // Skip is handled entirely in the main process via youtubeCommand, which locates
    // YouTube's own Skip button in-page and clicks it. Do NOT add a renderer-side
    // getBoundingClientRect -> clickAtViewPoint fallback here: page-CSS coordinates
    // would bypass the zoom compensation in sendTrustedBrowserClick (see Entry 26).
    const skipYouTubeAd = useCallback(async () => {
        setPageInfo((info) => ({ ...info, skippable: false }));
        const result = await browser.youtubeCommand('skip_ad');
        setYoutubeState(result?.youtubeState || result?.status || 'idle');
        if (result?.ok) {
            window.setTimeout(async () => {
                const state = await browser.youtubeCommand('get_state');
                const nextState = state?.youtubeState || state?.detail || 'idle';
                setYoutubeState(nextState);
                if (['stalled', 'buffering', 'ready', 'paused'].includes(nextState)) {
                    const playResult = await browser.youtubeCommand('play');
                    setYoutubeState(playResult?.youtubeState || nextState);
                }
            }, 800);
        }
    }, [browser]);

    useBrowserViewBoundsSync(viewRef, browser.updateBounds, !!playing && browser.isOpen && !searchOpen);

    const stop = useCallback(() => {
        void browser.resetBrowserSession('youtube-stop');
        setPlaying(null);
        setYoutubeState('idle');
        setPageInfo(NO_YOUTUBE_PAGE_INFO);
        autoPlayUrlRef.current = '';
        modeUrlRef.current = '';
        onNavHiddenToggle?.(false);
        onBrowserInteractionModeChange('control');
    }, [browser.resetBrowserSession, onBrowserInteractionModeChange, onNavHiddenToggle]);

    // Back walks the page history (video C -> B -> A); with no earlier page it
    // closes the player and returns to the YouTube choices.
    const handleYouTubeBack = useCallback(() => {
        if (browser.canGoBack) {
            void browser.goBack();
        } else {
            stop();
        }
    }, [browser.canGoBack, browser.goBack, stop]);

    // More Videos: the page takes gaze so a card can be chosen; full screen is left
    // first, so the rest of the page (and its scrolling) comes back.
    const browseVideos = useCallback(async () => {
        if (isVideoMaximized) await setFullScreen(false);
        onBrowserInteractionModeChange('control');
    }, [isVideoMaximized, onBrowserInteractionModeChange, setFullScreen]);

    const backToVideo = useCallback(() => {
        onBrowserInteractionModeChange('watch');
        void browser.scrollToTop();
    }, [browser.scrollToTop, onBrowserInteractionModeChange]);

    // Home and results pages: Look Only pauses page gaze (read titles without opening
    // a video); Choose Videos turns it back on. A new page starts with it on.
    const toggleLookOnly = useCallback(() => {
        onBrowserInteractionModeChange(isWatchMode ? 'control' : 'watch');
    }, [isWatchMode, onBrowserInteractionModeChange]);

    // The dock's Full Screen while browsing a video page: back to the video, full screen.
    const watchFullScreen = useCallback(() => {
        onBrowserInteractionModeChange('watch');
        void setFullScreen(true);
    }, [onBrowserInteractionModeChange, setFullScreen]);

    // Gaze Scroll: looking at the top or bottom edge of the page moves it (main.ts edge
    // scrolling). Off over a video in Watch, where the page takes no gaze at all.
    const toggleGazeScroll = useCallback(() => {
        void browser.setScrollMode(browser.scrollMode === 'armed' ? 'off' : 'armed');
    }, [browser.scrollMode, browser.setScrollMode]);

    // YouTube's own Home: its usual suggestions, no playlist or search chosen here.
    const openYoutubeHome = useCallback(() => {
        if (playing && browser.isOpen) {
            void browser.navigateTo(YOUTUBE_HOME_URL);
            return;
        }
        setPlaying({ title: 'YouTube Home', ch: 'Suggestions', url: YOUTUBE_HOME_URL });
        disableGaze();
    }, [browser.isOpen, browser.navigateTo, disableGaze, playing]);

    // The navigation bar (Home, emergency) stays on screen while typing.
    const openSearch = useCallback(() => {
        navHiddenBeforeSearchRef.current = !!isNavHidden;
        setSearchOpen(true);
        onNavHiddenToggle?.(false);
        if (browser.isOpen) void browser.setPageVisible(false);
    }, [browser.isOpen, browser.setPageVisible, isNavHidden, onNavHiddenToggle]);

    const closeSearch = useCallback(() => {
        setSearchOpen(false);
        if (navHiddenBeforeSearchRef.current !== null) onNavHiddenToggle?.(navHiddenBeforeSearchRef.current);
        navHiddenBeforeSearchRef.current = null;
        if (browser.isOpen) void browser.setPageVisible(true);
    }, [browser.isOpen, browser.setPageVisible, onNavHiddenToggle]);

    const runSearch = useCallback((query: string) => {
        const url = youtubeSearchUrl(query);
        closeSearch();
        if (playing && browser.isOpen) {
            void browser.navigateTo(url);
            return;
        }
        setPlaying({ title: query, ch: 'YouTube search', url });
    }, [browser.isOpen, browser.navigateTo, closeSearch, playing]);

    // The video bar is for a video page in Watch; every other page has the page bar.
    const showVideoBar = isWatchMode && isYouTubeWatchPage;
    const showSkipAd = isYouTubeWatchPage && pageInfo.skippable;
    const gazeScrollOn = browser.scrollMode === 'armed';
    useEffect(() => {
        if (showVideoBar && browser.scrollMode === 'armed') void browser.setScrollMode('off');
    }, [browser.scrollMode, browser.setScrollMode, showVideoBar]);

    // Calm full-screen video (7 Oct 2026, components/browser/calmWatch.ts): in full screen the
    // bar gives way to a black strip, so nothing can be chosen by accident while watching.
    // Looking at the strip offers Show options, which brings the bar back; it hides again
    // after a while unused, and comes back by itself when the video ends.
    const calmBarRef = useRef<HTMLDivElement>(null);
    const calmStripRef = useRef<HTMLDivElement>(null);
    const calmEnabled = settings.calmFullScreenVideo !== false;
    const calm = useCalmWatch({
        active: calmEnabled && !!playing && browser.isOpen && showVideoBar && isVideoMaximized && !searchOpen,
        holdMs: normalizeVideoRevealHoldMs(settings.videoRevealHoldMs),
        getGaze,
        stripRef: calmStripRef,
        barRef: calmBarRef,
        playback: calmPlaybackOf(youtubeState),
        playbackKey: `${youtubeState}|${youtubeVideoId(currentBrowserUrl)}`,
        listening: toolbarGazeEnabled,
    });
    const calmPhase = calm.phase;
    // The bar's buttons: right after Show options is chosen by gaze, they wait until the eyes
    // move off that spot (the mouse always works).
    const barGazeEnabled = toolbarGazeEnabled && calm.barGazeReady;
    const statusText = (() => {
        const title = pageInfo.title || playing?.title || 'YouTube';
        if (showVideoBar) return `Watching: ${title}${isVideoMaximized ? ' · full screen' : ''}`;
        if (gazeScrollOn && browser.edgeScrollDirection !== 'none') return `Gaze Scroll: moving ${browser.edgeScrollDirection} · ${title}`;
        if (gazeScrollOn) return `Gaze Scroll on: look at the top or bottom edge of the page to move it · ${title}`;
        if (isWatchMode) return `Look only: gaze on the page is paused · ${title}`;
        if (pageInfo.videoChoices === 0 && /^https:\/\/(www\.|m\.)?youtube\.com\/?$/i.test(currentBrowserUrl)) {
            return 'YouTube Home shows suggestions after a few videos. Choose Search to find one.';
        }
        return `Browsing: look at a video to open it · ${title}`;
    })();

    // In full screen, Next, Back, Play and Skip Ad put the bar away once the video plays again
    // (8 Oct 2026, maintainer request); Pause keeps it. Elsewhere these marks do nothing.
    const playPauseButton = (
        <GazeButton id="yt-playpause" onClick={() => { if (youtubeState !== 'playing') calm.actionTaken(); void playPauseYouTube(); }}
            gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
            style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
            {youtubeState === 'playing'
                ? <PauseIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                : <PlayIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />}
            <span>Pause / Play</span>
        </GazeButton>
    );
    const nextOrSkipButton = showSkipAd
        ? <GazeButton id="yt-skip-ad" onClick={() => { calm.actionTaken(); void skipYouTubeAd(); }} className="browser-attention"
            gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
            style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
            <SkipIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
            <span>Skip Ad</span>
        </GazeButton>
        : <GazeButton id="yt-next" onClick={() => { calm.actionTaken(); void nextYouTubeVideo(); }}
            gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
            style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
            <NextIcon size={toolbarIconSize} color="currentColor" strokeWidth={7} />
            <span>Next</span>
        </GazeButton>;

    if (searchOpen) return (
        <div className="web-search-overlay" style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', background: T_pageBg }}>
            <SearchKeyboard target="youtube" isDarkMode={isDarkMode}
                initialText={searchedWordsOf(currentBrowserUrl)}
                onSearch={runSearch} onBack={closeSearch} />
        </div>
    );

    if (playing) return (
        <div className="youtube-player" data-mode={showVideoBar ? 'watch' : isWatchMode ? 'look' : 'browse'}
            data-calm={calmPhase || undefined} style={{
            flex: 1, display: 'flex', flexDirection: 'column', padding: 'clamp(12px,1.5vh,20px)', gap: 'clamp(10px,1.2vh,16px)', overflow: 'hidden',
            marginTop: '0', transition: 'margin-top 0.3s ease',
            marginLeft: 'clamp(10px,1.5vw,20px)', marginRight: 'clamp(10px,1.5vw,20px)',
            paddingBottom: 'clamp(10px, 1.5vh, 20px)',
            background: T_pageBg,
        }}>
            {/* ── CONNECTED TOOLBAR ──
                Focus/Serene draw it under the video, right below the subtitles, so
                every control here takes the Video controls time (dwellTimeConfig):
                longer than other cards, so watching stays self-paced. */}
            {(!calmPhase || calmPhase === 'controls') && <div className="browser-toolbar" ref={calmBarRef}
                onClickCapture={calmPhase ? calm.controlUsed : undefined} style={{ ...connectedToolbarStyle, flexShrink: 0 }}>
                {/* WATCH (a video page) — the page takes no gaze; these drive the video. */}
                {showVideoBar && <>
                    <GazeButton id="yt-watch-back" onClick={() => { calm.actionTaken(); handleYouTubeBack(); }}
                        gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                        style={toolbarBtnConnected('primary', !!isNavHidden, 'first')}>
                        <BackIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Back</span>
                    </GazeButton>
                    {playPauseButton}
                    {nextOrSkipButton}
                    <GazeButton id="yt-fullscreen" onClick={toggleFullScreen} selected={isVideoMaximized}
                        gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                        style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
                        {isVideoMaximized
                            ? <MinimizeIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                            : <FullscreenIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />}
                        <span>{isVideoMaximized ? 'Exit Full' : 'Full Screen'}</span>
                    </GazeButton>
                    <GazeButton id="yt-more-videos" onClick={() => { void browseVideos(); }}
                        gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                        style={toolbarBtnConnected('primary', !!isNavHidden, 'middle')}>
                        <GridIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.2} />
                        <span>More Videos</span>
                    </GazeButton>
                    <GazeButton id="yt-search" onClick={openSearch}
                        gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                        style={toolbarBtnConnected('primary', !!isNavHidden, calmPhase === 'controls' ? 'middle' : 'last')}>
                        <SearchIcon size={toolbarIconSize} color="currentColor" strokeWidth={7} />
                        <span>Search</span>
                    </GazeButton>
                    {/* Full screen only: the partner of Show options, putting the bar away at once. */}
                    {calmPhase === 'controls' && (
                        <GazeButton id="yt-hide-options" onClick={calm.hide}
                            gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                            style={toolbarBtnConnected('secondary', !!isNavHidden, 'last')}>
                            <EyeOffIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.2} />
                            <span>Hide options</span>
                        </GazeButton>
                    )}
                </>}

                {/* PAGE BAR — Home, results, channels, or a video page in Browse. Gaze picks a
                    video card on the page unless Look Only is on; Up / Down beside it. On a
                    video page it keeps the video's own controls (Pause / Play, Next / Skip Ad). */}
                {!showVideoBar && <>
                    <GazeButton id="yt-back" onClick={handleYouTubeBack}
                        gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                        style={toolbarBtnConnected('primary', !!isNavHidden, 'first')}>
                        <BackIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Back</span>
                    </GazeButton>
                    {isYouTubeWatchPage && playPauseButton}
                    {isYouTubeWatchPage && nextOrSkipButton}
                    <GazeButton id="yt-home" onClick={openYoutubeHome}
                        gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                        style={toolbarBtnConnected('primary', !!isNavHidden, 'middle')}>
                        <HomeIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.2} />
                        <span>YouTube Home</span>
                    </GazeButton>
                    <GazeButton id="yt-search-browse" onClick={openSearch}
                        gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                        style={toolbarBtnConnected('primary', !!isNavHidden, 'middle')}>
                        <SearchIcon size={toolbarIconSize} color="currentColor" strokeWidth={7} />
                        <span>Search</span>
                    </GazeButton>
                    {isYouTubeWatchPage
                        ? <GazeButton id="yt-back-to-video" onClick={backToVideo}
                            gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                            style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
                            <PlayIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                            <span>Back to Video</span>
                        </GazeButton>
                        : <GazeButton id="yt-look-only" onClick={toggleLookOnly} selected={isWatchMode}
                            gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                            style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
                            {isWatchMode
                                ? <PointerIcon size={toolbarIconSize} color="currentColor" strokeWidth={5} />
                                : <EyeIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.2} />}
                            <span>{isWatchMode ? 'Choose Videos' : 'Look Only'}</span>
                        </GazeButton>}
                    {/* With the navigation bar hidden: Show Nav. With it shown: Close, back to
                        the YouTube choices in one step (as the old Control bar did). */}
                    {isNavHidden
                        ? <GazeButton id="yt-toggle-nav" onClick={() => onNavHiddenToggle?.(!isNavHidden)}
                            gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                            style={toolbarBtnConnected('primary', !!isNavHidden, 'last')}>
                            <WebLayoutIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.2} />
                            <span>Show Nav</span>
                        </GazeButton>
                        : <GazeButton id="yt-close" onClick={stop}
                            gazeEnabled={barGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="videoControl"
                            style={toolbarBtnConnected('dismiss', !!isNavHidden, 'last')}>
                            <XIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.3} />
                            <span>Close</span>
                        </GazeButton>}
                </>}
            </div>}

            {!calmPhase && <BrowserStatusLine text={statusText} notice={browser.notice} />}

            {/* Content area: BrowserView (left) + Up / Down (right gutter, every page but a video in Watch) */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', gap: 0 }}>
                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                    <div className="browser-content-frame" ref={viewRef} style={{
                        width: '100%', height: '100%', borderRadius: CR, overflow: 'hidden',
                        background: isWarm ? '#F5EEDF' : T.bg,
                        border: WEB_SURFACE.borderSoft, boxShadow: WEB_SURFACE.panelShadow
                    }}>
                        <div style={{
                            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: isWarm ? '#6A625B' : T.textSub, fontSize: '18px'
                        }}>
                            {browser.loading ? 'Loading video...' : ''}
                        </div>
                    </div>
                </div>
                {!showVideoBar && (
                    <ContentScrollDock
                        onUp={() => { void browser.scrollUp(); }}
                        onDown={() => { void browser.scrollDown(); }}
                        atTop={browser.pageScroll.atTop}
                        atBottom={browser.pageScroll.atBottom}
                        gazeScrollOn={gazeScrollOn}
                        onToggleGazeScroll={toggleGazeScroll}
                        onFullScreen={isYouTubeWatchPage ? watchFullScreen : undefined}
                        gazeEnabled={toolbarGazeEnabled}
                        gazeTimestamp={toolbarGazeTimestamp}
                    />
                )}
            </div>

            {calmPhase && calmPhase !== 'controls' && (
                <CalmWatchStrip phase={calmPhase} hint={calm.hint} progressRef={calm.progressRef}
                    stripRef={calmStripRef} onReveal={calm.reveal}
                    gazeEnabled={toolbarGazeEnabled} gazeTimestamp={toolbarGazeTimestamp} />
            )}
        </div>
    );

    // Four categories and four videos retain their original actions. Above them,
    // YouTube itself: type any song, singer or video, or open its own Home.
    return (
        <div className="youtube-library" style={{
            flex: 1, display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 'clamp(18px, 2vw, 28px)',
            padding: 'clamp(14px, 1.6vh, 22px) clamp(18px, 2vw, 28px)', overflow: 'hidden',
            paddingBottom: 'clamp(20px, 2.4vh, 32px)',
            background: T_pageBg,
        }}>
            <div className="youtube-actions" style={{
                flex: '0 0 auto', width: '100%', height: 'clamp(92px, 11.5vh, 124px)', minHeight: 0,
                display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'clamp(18px, 2.4vh, 26px)',
            }}>
                <GazeButton id="yl-search" className="youtube-action" onClick={openSearch}
                    gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                    style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                    <SearchIcon size={46} color="currentColor" strokeWidth={7} />
                    <span>Search YouTube</span>
                </GazeButton>
                <GazeButton id="yl-home" className="youtube-action" onClick={openYoutubeHome}
                    gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                    style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                    <HomeIcon size={42} color="currentColor" strokeWidth={2.2} />
                    <span>YouTube Home</span>
                </GazeButton>
            </div>
            {/* SIDEBAR — 4 large category buttons. Each card uses a distinct
                category icon (no more identical YouTube glyph everywhere) and
                a small subtitle for context. Phrases/Activities sidebar grammar:
                accent line + warm-gold tint on selection. */}
            <div className="browse-youtube-categories" style={{
                width: 'clamp(320px, 30vw, 460px)', flexShrink: 0,
                /* Four stable, equal gaze targets share the actual available height. */
                display: 'grid', gridTemplateRows: 'repeat(4, minmax(80px, 1fr))',
                gap: 'clamp(10px, 1.2vh, 16px)',
                background: T_chromeBg,
                border: `1.5px solid ${T_chromeBorder}`,
                borderRadius: '22px',
                padding: 'clamp(14px, 1.5vh, 20px)',
                boxShadow: T_chromeShadow,
                overflow: 'hidden',
            }}>
                {YT_CATS.map((c) => {
                    const isSelected = catId === c.id;
                    // Muted, darker antique-gold palette — less neon than #C69A45.
                    const SELECTED_ACCENT_DARK = '#9CCFC7';           // Accent line + icon tint (deep antique gold) — dark mode
                    const SELECTED_ACCENT = isLight ? '#1F6B7E' : isWarm ? '#3F6968' : isMix ? '#B49362' : SELECTED_ACCENT_DARK;
                    const SELECTED_BG = isLight ? 'rgba(31, 107, 126, 0.14)'
                        : isWarm ? 'rgba(73, 119, 117, 0.14)'
                        : isMix ? 'rgba(180, 147, 98, 0.20)'
                        : 'rgba(155, 122, 56, 0.13)';
                    const SELECTED_TITLE = isLight ? '#1F6B7E' : isWarm ? '#3F6968' : isMix ? '#E3C28E' : '#E0CDA6';
                    const UNSELECTED_BG = isLight ? 'rgba(255, 248, 228, 0.55)' : isWarm ? '#FBF5E5' : isMix ? 'rgba(60, 48, 32, 0.40)' : 'rgba(213, 216, 188, 0.025)';
                    const UNSELECTED_BORDER = isLight ? '1.5px solid rgba(168, 120, 56, 0.20)' : isWarm ? '1px solid rgba(122, 99, 71, 0.16)' : isMix ? '1.5px solid rgba(180, 147, 98, 0.18)' : '1.5px solid rgba(213, 216, 188, 0.08)';
                    const UNSELECTED_ICON = isLight ? '#76624A' : isWarm ? '#7A5638' : isMix ? '#C4B697' : WEB_ACCENTS.tealText;
                    const UNSELECTED_TITLE = isLight ? '#2E2A24' : isWarm ? '#2F2A26' : isMix ? '#FFFCF1' : T.textMain;
                    const UNSELECTED_SUBTITLE = isLight ? '#76624A' : isWarm ? '#6A625B' : isMix ? '#C4B697' : T.textSub;
                    const iconColor = isSelected ? SELECTED_ACCENT : UNSELECTED_ICON;
                    const titleColor = isSelected ? SELECTED_TITLE : UNSELECTED_TITLE;
                    const subtitleColor = isSelected ? (isLight ? 'rgba(31, 107, 126, 0.72)' : isWarm ? 'rgba(73, 119, 117, 0.72)' : isMix ? 'rgba(227, 194, 142, 0.65)' : 'var(--ui-muted)') : UNSELECTED_SUBTITLE;
                    const meta = YT_CATEGORY_META[c.id] || { subtitle: '', renderIcon: () => <YoutubeIcon size={48} color={iconColor} strokeWidth={2.2} /> };
                    return (
                        <GazeButton key={c.id} id={`yc-${c.id}`} className="browse-category-choice" selected={isSelected} onClick={() => { setCatId(c.id); disableGaze(); }}
                            gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            contentFill
                            style={{
                                width: '100%', height: '100%', minHeight: 0,
                                position: 'relative', overflow: 'hidden',
                                borderRadius: '18px',
                                background: isSelected ? SELECTED_BG : UNSELECTED_BG,
                                // Same neutral border in both states — no colored selection border.
                                // Selection is conveyed by the accent line + bg tint + icon color only.
                                border: UNSELECTED_BORDER,
                                display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                                padding: 'clamp(18px, 2vh, 28px) clamp(20px, 2vw, 32px) clamp(18px, 2vh, 28px) clamp(20px, 2vw, 32px)',
                                fontFamily: FONT_PRIMARY,
                                textAlign: 'left',
                                transition: 'background 150ms ease',
                            }}>
                            {/* Icon zone — fixed 30% of card width, icon sits directly
                                in the zone (no frame box, no accent line). Selection is
                                conveyed purely via icon color + background tint + title color. */}
                            <div style={{
                                flex: '0 0 30%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: iconColor,
                            }}>
                                {meta.renderIcon(iconColor)}
                            </div>
                            {/* Text zone — remaining 70%, title + subtitle stack */}
                            <div style={{
                                flex: '1 1 70%',
                                minWidth: 0,
                                display: 'flex', flexDirection: 'column',
                                justifyContent: 'center',
                                gap: 'clamp(4px, 0.6vh, 8px)',
                                paddingLeft: 'clamp(8px, 0.8vw, 14px)',
                            }}>
                                <span style={{
                                    fontSize: 'clamp(22px, 2.7vh, 32px)', fontWeight: isSelected ? 820 : 720,
                                    color: titleColor, lineHeight: 1.1,
                                    letterSpacing: '0.01em',
                                }}>
                                    {stripLeadingEmoji(c.label)}
                                </span>
                                {meta.subtitle && (
                                    <span style={{
                                        fontSize: 'clamp(14px, 1.6vh, 18px)',
                                        fontWeight: 600,
                                        color: subtitleColor, lineHeight: 1.25,
                                        letterSpacing: '0.02em',
                                    }}>
                                        {meta.subtitle}
                                    </span>
                                )}
                            </div>
                        </GazeButton>
                    );
                })}
            </div>

            {/* CONTENT — Thumbnail grid (2×2 — 4 large cards) */}
            <div className="youtube-videos" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))', gap: 'clamp(20px, 2.4vw, 32px)', overflow: 'hidden', minHeight: 0 }}>
                {cat.videos.slice(0, 4).map((v, i) => {
                    // Defensive lookup — `id` may or may not exist on a video entry.
                    // Search-query entries have no id; static-watch entries do.
                    const vid = (v as { id?: string; title: string; ch: string }).id;
                    const validId = isValidYouTubeId(vid);
                    const thumbUrl = validId ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg` : '';
                    return (
                        <GazeButton key={(vid || v.title || 'yv') + i} id={`yv-${i}`} className="browse-video-choice" onClick={() => { setPlaying(v); disableGaze(); }}
                            gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            contentFill
                            style={{
                                width: '100%', height: '100%', minHeight: 0,
                                background: 'var(--ui-surface)',
                                border: isWarm ? '1px solid rgba(122, 99, 71, 0.16)' : '1.5px solid rgba(213, 216, 188, 0.14)',
                                borderRadius: '26px',
                                boxShadow: isWarm ? '0 1px 2px rgba(82, 65, 48, 0.05)' : 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)',
                                overflow: 'hidden',
                                display: 'flex', flexDirection: 'column',
                                padding: 0,
                            }}>
                            {/* Thumbnail (top ~65%, 16:9) */}
                            <div className="youtube-thumbnail" style={{
                                position: 'relative',
                                width: '100%', flex: '1 1 52%', minHeight: 0,
                                background: 'var(--ui-inset)',
                                overflow: 'hidden',
                                borderBottom: isWarm ? '1px solid rgba(122, 99, 71, 0.12)' : '1px solid rgba(213, 216, 188, 0.10)',
                            }}>
                                {thumbUrl ? (
                                    <img
                                        src={thumbUrl}
                                        alt=""
                                        aria-hidden="true"
                                        draggable={false}
                                        loading="lazy"
                                        onError={(e) => {
                                            const img = e.currentTarget;
                                            img.style.display = 'none';
                                            const fallback = img.parentElement?.querySelector('[data-fallback]') as HTMLElement | null;
                                            if (fallback) fallback.style.display = 'flex';
                                            const playOverlay = img.parentElement?.querySelector('[data-play-overlay]') as HTMLElement | null;
                                            if (playOverlay) playOverlay.style.display = 'none';
                                        }}
                                        style={{
                                            width: '100%', height: '100%', objectFit: 'cover',
                                            display: 'block', userSelect: 'none', pointerEvents: 'none',
                                        }}
                                    />
                                ) : null}
                                <div data-fallback style={{
                                    display: thumbUrl ? 'none' : 'flex',
                                    position: thumbUrl ? 'absolute' : 'static',
                                    inset: 0,
                                    alignItems: 'center', justifyContent: 'center',
                                    background: 'var(--ui-panel)',
                                    color: WEB_ACCENTS.tealText,
                                }}>
                                    <PlayIcon size={48} color="currentColor" strokeWidth={2} />
                                </div>
                                {/* Faint play-arrow overlay centered */}
                                {thumbUrl && <div data-play-overlay style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    pointerEvents: 'none',
                                }}>
                                    <div style={{
                                        width: 'clamp(54px, 7vh, 78px)', height: 'clamp(54px, 7vh, 78px)',
                                        borderRadius: '50%',
                                        background: 'rgba(15, 18, 16, 0.62)',

                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        border: '1.5px solid rgba(245, 240, 220, 0.36)',
                                        color: '#F4EAD0',
                                    }}>
                                        <PlayIcon size={32} color="currentColor" strokeWidth={2.4} />
                                    </div>
                                </div>}
                            </div>
                            {/* Title + channel */}
                            <div className="youtube-video-title" style={{
                                flex: '0 0 auto', minHeight: 'clamp(106px, 12vh, 144px)',
                                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                padding: 'clamp(14px, 1.6vh, 22px) clamp(18px, 1.8vw, 26px)',
                                gap: '6px',
                                textAlign: 'left',
                            }}>
                                <div style={{
                                    fontSize: 'clamp(20px, 2.4vh, 28px)', fontWeight: 650, color: isWarm ? '#2F2A26' : T.textMain,
                                    fontFamily: FONT_PRIMARY, lineHeight: 1.18,
                                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                                    overflow: 'hidden',
                                }}>{v.title}</div>
                                <div style={{
                                    fontSize: 'clamp(15px, 1.7vh, 19px)', color: isWarm ? '#6A625B' : T.textSub,
                                    fontFamily: FONT_PRIMARY, fontWeight: 600,
                                }}>{v.ch}</div>
                            </div>
                        </GazeButton>
                    );
                })}
            </div>
        </div>
    );
};

// ── KNOWLEDGE PANEL ──
const KnowledgePanel = ({ ige, ts, onSpeak, isNavHidden }: { ige: boolean; ts: number; onSpeak: (t: string) => void; isNavHidden?: boolean; }) => {
    const ws = useWS();
    const { isLight, isMix, isWarm } = useTheme();
    // Theme-aware chrome tokens. The knowledge article card stays dark in all modes.
    const T_pageBg = 'var(--ui-page)';
    const T_chromeBg = 'var(--ui-panel)';
    const T_chromeBorder = 'var(--ui-border)';
    const T_chromeText = 'var(--ui-ink)';
    const T_chromeTextMuted = 'var(--ui-muted)';
    const T_chromeShadow = 'none';
    void T_chromeTextMuted;
    const [selCat, setSelCat] = useState<string | null>(null);
    const [selArt, setSelArt] = useState<any>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => { ws.getKnowledgeCategories(); }, []);
    useEffect(() => { if (selCat) ws.getKnowledgeArticles(selCat); }, [selCat]);
    useEffect(() => { if (ws.knowledgeArticle && selArt && ws.knowledgeArticle.id === selArt.id) setSelArt(ws.knowledgeArticle); }, [ws.knowledgeArticle]);

    if (selArt) return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', padding: GAP, gap: GAP, overflow: 'hidden',
            marginTop: 'clamp(50px,6vh,65px)', marginLeft: 'clamp(10px,1.5vw,20px)',
            paddingBottom: 'clamp(20px, 2.5vh, 40px)',
            background: T_pageBg,
        }}>
            <div style={{ display: 'flex', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
                <GazeButton id="kb-back" onClick={() => setSelArt(null)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                    style={actionButton(WEB_ACCENTS.goldText, 'rgba(49, 36, 20, 0.72)', 'rgba(178, 138, 69, 0.22)')}>
                    <BackIcon size={26} color="currentColor" strokeWidth={2.4} />
                    <span>Back</span>
                </GazeButton>
                <GazeButton id="kb-read" onClick={() => onSpeak(selArt.title + '. ' + selArt.content)} gazeEnabled={ige}
                    gazeEnabledTimestamp={ts} isDarkMode dwellCategory="phraseButton" style={actionButton(TL, 'rgba(28, 47, 45, 0.72)', SOFT_INFO_BORDER)}>
                    <SpeakIcon size={26} color="currentColor" strokeWidth={2.3} />
                    <span>Read</span>
                </GazeButton>
                <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}
                <GazeButton id="kb-stop" onClick={() => ws.stopSpeaking()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                    style={actionButton(DANGER, 'rgba(60, 34, 32, 0.72)', DANGER_BORDER)}>Stop</GazeButton>
                <GazeButton id="kb-scr" onClick={() => scrollRef.current?.scrollBy({ top: 250, behavior: 'smooth' })} gazeEnabled={ige}
                    gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton" style={actionButton(WEB_ACCENTS.blueText)}>
                    <ArrowDownIcon size={26} color="currentColor" strokeWidth={2.3} />
                    <span>Scroll</span>
                </GazeButton>
            </div>
            <div className="browse-reader" ref={scrollRef} style={{
                ...cs, flex: 1, width: '100%', height: 'auto', alignItems: 'flex-start', justifyContent: 'flex-start',
                padding: 'clamp(24px,3.5vh,40px)', overflow: 'auto', minHeight: 0
            }}>
                <h2 style={{ fontSize: 'clamp(22px,3vh,32px)', fontWeight: 700, color: isWarm ? '#2F2A26' : T.textMain, margin: '0 0 10px 0', fontFamily: FONT_PRIMARY }}>{selArt.title}</h2>
                <div style={{ fontSize: 'clamp(22px,2.6vh,30px)', color: 'var(--ui-ink)', lineHeight: 1.75, whiteSpace: 'pre-line' as const }}>{selArt.content}</div>
            </div>
        </div>
    );

    return (
        <div style={{
            flex: 1, display: 'flex', gap: GAP, padding: GAP, overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)',
            background: T_pageBg,
        }}>
            <div style={{
                width: 'clamp(220px,26vw,320px)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px',
                background: T_chromeBg, borderRadius: '20px', padding: 'clamp(14px,1.8vh,20px)',
                border: `1.5px solid ${T_chromeBorder}`, overflow: 'auto', boxShadow: T_chromeShadow,
            }}>
                {ws.knowledgeCategories.map((c: any) => {
                    const isSel = selCat === c.id;
                    const accent = c.color || AC;
                    const selectedTextColor = isLight ? '#1F6B7E' : accent;
                    const selectedBg = isLight ? 'rgba(31, 107, 126, 0.14)' : isWarm ? 'rgba(73, 119, 117, 0.14)' : isMix ? `${accent}30` : `${accent}20`;
                    const selectedAccentLine = isLight ? '#1F6B7E' : isWarm ? '#3F6968' : accent;
                    return (
                        <GazeButton key={c.id} id={`kc-${c.id}`} onClick={() => { setSelCat(c.id); setSelArt(null); }}
                            gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            style={{
                                width: '100%', padding: 'clamp(14px,1.8vh,20px) 14px', textAlign: 'left' as const,
                                background: isSel ? selectedBg : 'transparent',
                                borderLeft: isSel ? `4px solid ${selectedAccentLine}` : '4px solid transparent',
                                borderRadius: '0 14px 14px 0', border: 'none', minHeight: 'clamp(80px,9vh,98px)',
                                display: 'flex', alignItems: 'center', gap: '10px'
                            }}>
                            <BookIcon size={28} color={isSel ? selectedAccentLine : (isLight ? '#76624A' : isWarm ? '#7A5638' : WEB_ACCENTS.oliveText)} strokeWidth={2} />
                            <div>
                                <div style={{ fontSize: 'clamp(20px,2.2vh,25px)', fontWeight: 600, color: isSel ? selectedTextColor : T_chromeText }}>{c.title}</div>
                                <div style={{ fontSize: '12px', color: isLight ? 'rgba(74, 58, 42, 0.55)' : isWarm ? '#8A7C6B' : isMix ? 'rgba(196, 182, 151, 0.55)' : 'rgba(255,255,255,0.3)' }}>{c.article_count} articles</div>
                            </div>
                        </GazeButton>
                    );
                })}
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gridTemplateRows: 'repeat(3,1fr)', gap: GAP, overflow: 'hidden', minHeight: 0 }}>
                {selCat && ws.knowledgeArticles.length ? ws.knowledgeArticles.slice(0, 6).map((a: any, i: number) => (
                    <GazeButton key={a.id} id={`ka-${i}`} onClick={() => { setSelArt({ ...a, content: a.summary || 'Loading...' }); ws.getKnowledgeArticle(a.id); }}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        style={{
                            ...cs,
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            padding: 'clamp(16px,2.2vh,26px)',
                            background: isWarm ? '#FBF5E5' : undefined,
                            border: isWarm ? '1px solid rgba(122, 99, 71, 0.16)' : undefined,
                            boxShadow: isWarm ? '0 1px 2px rgba(82, 65, 48, 0.05)' : undefined,
                        }}>
                        <div style={{ fontSize: 'clamp(16px,2vh,20px)', fontWeight: 600, color: isWarm ? '#2F2A26' : T.textMain, lineHeight: 1.35, flex: 1, textAlign: 'left' }}>{a.title}</div>
                        <div style={{
                            fontSize: 'clamp(13px,1.5vh,16px)', color: isWarm ? '#6A625B' : 'rgba(255,255,255,0.45)', lineHeight: 1.4, marginTop: '8px', textAlign: 'left',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden'
                        }}>{a.summary}</div>
                    </GazeButton>
                )) : (
                    <div style={{
                        gridColumn: '1/-1', gridRow: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isLight ? 'rgba(74, 58, 42, 0.55)' : isMix ? 'rgba(196, 182, 151, 0.55)' : 'rgba(255,255,255,0.25)', fontSize: '18px'
                    }}>
                        {selCat ? 'Loading...' : 'Select a category'}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── QUICK SEARCH PANEL (with gaze cursor forwarding) ──
const QuickSearchPanel = ({ ige, ts, browser, gpRef, goBack: goGridBack, disableGaze, toggleGaze, isNavHidden, isDarkMode, browserInteractionMode, onBrowserInteractionModeChange, onTopicActive, onNavHiddenToggle, onSpeak }: {
    ige: boolean; ts: number; browser: ReturnType<typeof useGazeBrowser>; gpRef: React.MutableRefObject<{ x: number; y: number }>;
    goBack: () => void;
    disableGaze: () => void;
    toggleGaze: () => void;
    isNavHidden?: boolean;
    isDarkMode: boolean;
    browserInteractionMode: BrowserInteractionMode;
    onBrowserInteractionModeChange: (mode: BrowserInteractionMode) => void;
    onTopicActive?: (active: boolean) => void;
    onNavHiddenToggle?: (hidden: boolean) => void;
    // v17.18: ALL speech must flow through App.handleSpeak so the routing
    // rules apply (volume-0 mute, TTS-health fallback, overlap cancel).
    onSpeak: (t: string) => void;
}) => {
    const ws = useWS();
    const { isLight, isMix, isWarm } = useTheme();
    // Theme-aware chrome tokens. Search-result / card-mode card stay dark.
    const T_pageBg = 'var(--ui-page)';
    const T_chromeBg = 'var(--ui-panel)';
    const T_chromeBorder = 'var(--ui-border)';
    const T_chromeText = 'var(--ui-ink)';
    const T_chromeTextMuted = 'var(--ui-muted)';
    const T_chromeShadow = 'none';
    void T_chromeShadow;
    const [topic, setTopic] = useState<QuickTopic | null>(null);
    const [showLinksSidebar, setShowLinksSidebar] = useState(false);
    const [largeLinkTargets, setLargeLinkTargets] = useState(true);
    const linkChoices = useGazePageCapacity(largeLinkTargets ? 104 : 80, largeLinkTargets ? 4 : 6);
    const [linkPage, setLinkPage] = useState(0);
    // The search keyboard replaces the panel; an open page is taken off the window meanwhile.
    const [searchOpen, setSearchOpen] = useState(false);
    const navHiddenBeforeSearchRef = useRef<boolean | null>(null);
    const viewRef = useRef<HTMLDivElement>(null);
    const hasInitRef = useRef(false);
    const toolbarGazeEnabled = isNavHidden ? true : ige;
    const toolbarGazeTimestamp = isNavHidden ? 0 : ts;
    const toolbarIconSize = isNavHidden ? 38 : browserToolbarIconSize;
    const isWatchMode = browserInteractionMode === 'watch';
    const toggleBrowserInteractionMode = useCallback(() => {
        onBrowserInteractionModeChange(isWatchMode ? 'control' : 'watch');
    }, [isWatchMode, onBrowserInteractionModeChange]);

    useEffect(() => {
        onTopicActive?.(!!topic && topic.mode === 'web');
    }, [topic, onTopicActive]);

    useEffect(() => {
        if (!hasInitRef.current) {
            hasInitRef.current = true;
            ws.getQuickSnapshot();
        }
    }, [ws.getQuickSnapshot]);
    const isWebTopic = !!topic && topic.mode === 'web';
    const isCardTopic = !!topic && topic.mode === 'card';

    useEffect(() => {
        setLinkPage(0);
    }, [topic?.id, browser.pageLinks.length]);

    useEffect(() => {
        if (isWebTopic) onBrowserInteractionModeChange('watch');
    }, [isWebTopic, topic?.id, onBrowserInteractionModeChange]);

    // The page opens once per topic, as soon as its frame has a size. Showing or hiding
    // the navigation bar only moves the page (bounds sync below): it used to reopen the
    // topic's first page, losing the patient's place, and loaded every topic twice.
    useEffect(() => {
        if (!topic || topic.mode !== 'web') return;
        let cancelled = false;
        let raf = 0;
        let tries = 0;
        const open = () => {
            if (cancelled) return;
            const r = viewRef.current?.getBoundingClientRect();
            if (!r || r.width <= 50 || r.height <= 50) {
                if (++tries < 30) raf = requestAnimationFrame(open);
                return;
            }
            void browser.openPage(topic.url, {
                x: Math.round(r.left),
                y: Math.round(r.top),
                width: Math.round(r.width),
                height: Math.round(r.height),
            });
        };
        raf = requestAnimationFrame(open);
        return () => { cancelled = true; cancelAnimationFrame(raf); };
    }, [topic?.id, topic?.mode, topic?.url]);

    useBrowserViewBoundsSync(viewRef, browser.updateBounds, isWebTopic && browser.isOpen && !searchOpen);

    // Removed per-topic quick snapshot fetch

    // Removed broken rest reminder timeout

    const openTopic = useCallback((next: QuickTopic) => {
        setTopic(next);
        setShowLinksSidebar(next.mode === 'web');
        disableGaze();
        if (next.mode === 'card' && !ws.quickSnapshot) {
            ws.getQuickSnapshot();
        }
    }, [disableGaze, ws.getQuickSnapshot]);

    const closeWebTopic = useCallback(() => {
        browser.closePage();
        setTopic(null);
        setShowLinksSidebar(true);
        onNavHiddenToggle?.(false);
        onBrowserInteractionModeChange('control');
        disableGaze();
    }, [browser, disableGaze, onBrowserInteractionModeChange, onNavHiddenToggle]);

    const handleBrowserBack = useCallback(async () => {
        if (browser.canGoBack) {
            await browser.goBack();
            return;
        }
        closeWebTopic();
    }, [browser, closeWebTopic]);

    const openLiveWebFromCard = useCallback(() => {
        if (!topic) return;
        setTopic({ ...topic, mode: 'web' });
        setShowLinksSidebar(true);
        disableGaze();
    }, [topic, disableGaze]);

    const searchTarget: SearchTarget = isWebTopic && isYoutubeHost(browser.currentUrl) ? 'youtube' : 'google';

    // The navigation bar (Home, emergency) stays on screen while typing.
    const openSearch = useCallback(() => {
        navHiddenBeforeSearchRef.current = !!isNavHidden;
        setSearchOpen(true);
        onNavHiddenToggle?.(false);
        if (browser.isOpen) void browser.setPageVisible(false);
    }, [browser.isOpen, browser.setPageVisible, isNavHidden, onNavHiddenToggle]);

    const closeSearch = useCallback(() => {
        setSearchOpen(false);
        if (navHiddenBeforeSearchRef.current !== null) onNavHiddenToggle?.(navHiddenBeforeSearchRef.current);
        navHiddenBeforeSearchRef.current = null;
        if (browser.isOpen) void browser.setPageVisible(true);
    }, [browser.isOpen, browser.setPageVisible, onNavHiddenToggle]);

    const runSearch = useCallback((query: string) => {
        const target = searchTarget;
        closeSearch();
        if (isWebTopic && browser.isOpen) {
            void browser.navigateTo(target === 'youtube' ? youtubeSearchUrl(query) : googleSearchUrl(query));
            return;
        }
        setTopic({ id: 'typed_search', label: query, url: googleSearchUrl(query), mode: 'web' });
        setShowLinksSidebar(true);
        disableGaze();
    }, [browser.isOpen, browser.navigateTo, closeSearch, disableGaze, isWebTopic, searchTarget]);

    const speakCardSummary = useCallback(() => {
        if (!topic || !ws.quickSnapshot) return;
        // v17.18: routed through App.handleSpeak (was a raw ws.speak that
        // bypassed volume-0 mute, the TTS-health fallback, and the
        // pre-speak browser-utterance cancel).
        if (topic.id === 'local_weather') {
            const d = ws.quickSnapshot.weather;
            onSpeak(d?.ok ? `Weather in ${d.city}. Temperature ${d.temp_c} degrees. ${d.condition || ''}` : 'Weather data is unavailable right now.');
            return;
        }
        if (topic.id === 'cricket_score') {
            const d = ws.quickSnapshot.cricket;
            onSpeak(d?.ok ? `${d.match}. ${d.summary}. ${d.status}.` : 'Cricket score is unavailable right now.');
            return;
        }
    }, [topic, ws.quickSnapshot, onSpeak]);

    const linksPerPage = linkChoices.capacity;
    const totalLinkPages = Math.max(1, Math.ceil(browser.pageLinks.length / linksPerPage));
    const currentLinkPage = Math.min(linkPage, totalLinkPages - 1);
    const visiblePageLinks = browser.pageLinks.slice(
        currentLinkPage * linksPerPage,
        currentLinkPage * linksPerPage + linksPerPage,
    );
    const canPageLinksBack = currentLinkPage > 0;
    const canPageLinksForward = currentLinkPage < totalLinkPages - 1;

    if (searchOpen) return (
        <div className="web-search-overlay" style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', background: T_pageBg }}>
            <SearchKeyboard target={searchTarget} isDarkMode={isDarkMode}
                initialText={isWebTopic ? searchedWordsOf(browser.currentUrl) : ''}
                backLabel={isWebTopic ? undefined : 'Back to Quick Search'}
                onSearch={runSearch} onBack={closeSearch} />
        </div>
    );

    if (isWebTopic && topic) {
        const pageIsYoutube = isYoutubeHost(browser.currentUrl);
        const gazeScrollOn = browser.scrollMode === 'armed';
        const statusText = gazeScrollOn && browser.edgeScrollDirection !== 'none'
            ? `Gaze Scroll: moving ${browser.edgeScrollDirection} · ${stripLeadingEmoji(topic.label)}`
            : gazeScrollOn
                ? `Gaze Scroll on: look at the top or bottom edge of the page to move it · ${stripLeadingEmoji(topic.label)}`
                : `${stripLeadingEmoji(topic.label)} · ${isWatchMode ? 'Reading: gaze on the page is paused' : 'Look at a link on the page to open it'} · Zoom ${browser.zoomFactor.toFixed(2)}x`;
        return (
            <div className="web-page-view" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T_pageBg, paddingBottom: 'clamp(10px, 1.5vh, 20px)' }}>
                {/* TOP REGION: Connected toolbar + status line. Focus and Serene lay the page
                    out as the YouTube player does (web-design.css): status line, the page with
                    its Up / Down dock, then the bar of large buttons under it. */}
                <div className="web-page-top" style={{
                    flex: '0 0 auto', width: '100%',
                    display: 'flex', flexDirection: 'column',
                    padding: 'clamp(10px,1.2vh,16px) clamp(16px,2vw,24px) clamp(6px,0.8vh,10px)',
                    boxSizing: 'border-box', gap: '6px',
                }}>
                    <div className="browser-toolbar" style={connectedToolbarStyle}>
                        {/* READ MODE — the page takes no gaze; Up / Down move it. */}
                        {isWatchMode && <>
                            <GazeButton id="bv-back-r" onClick={handleBrowserBack}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="backSkipButton"
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'first')}>
                                <BackIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                                <span>Back</span>
                            </GazeButton>
                            {pageIsYoutube && <GazeButton id="bv-playpause-r" onClick={() => { void browser.youtubeCommand('play_pause'); }}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                                style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
                                <PlayIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                                <span>Pause / Play</span>
                            </GazeButton>}
                            <GazeButton id="bv-search-r" onClick={openSearch}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'middle')}>
                                <SearchIcon size={toolbarIconSize} color="currentColor" strokeWidth={7} />
                                <span>Search</span>
                            </GazeButton>
                            <GazeButton id="bv-show-controls" onClick={toggleBrowserInteractionMode}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'last')}>
                                <PointerIcon size={toolbarIconSize} color="currentColor" strokeWidth={5} />
                                <span>Show Controls</span>
                            </GazeButton>
                        </>}

                        {/* CONTROL MODE — gaze on the page opens links; no duplicates with the global nav */}
                        {!isWatchMode && <>
                            <GazeButton id="bv-back" onClick={isNavHidden ? handleBrowserBack : closeWebTopic}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="backSkipButton"
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'first')}>
                                <BackIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                                <span>{isNavHidden ? 'Back' : 'Close'}</span>
                            </GazeButton>
                            <GazeButton id="bv-hide-controls" onClick={toggleBrowserInteractionMode}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="backSkipButton"
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'middle')}>
                                <WI.BookOpenIcon size={toolbarIconSize} strokeWidth={2.2} />
                                <span>Hide Controls</span>
                            </GazeButton>
                            <GazeButton id="bv-links-toggle" onClick={() => setShowLinksSidebar((s) => !s)}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                                style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
                                {showLinksSidebar ? <XIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.3} /> : <WI.ListIcon size={toolbarIconSize} strokeWidth={2.2} />}
                                <span>{showLinksSidebar ? 'Hide Links' : 'Links'}</span>
                            </GazeButton>
                            <GazeButton id="bv-search" onClick={openSearch}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                                style={toolbarBtnConnected('primary', !!isNavHidden, isNavHidden ? 'middle' : 'last')}>
                                <SearchIcon size={toolbarIconSize} color="currentColor" strokeWidth={7} />
                                <span>Search</span>
                            </GazeButton>
                            {isNavHidden && <GazeButton id="bv-toggle-nav" onClick={() => { setShowLinksSidebar(false); onNavHiddenToggle?.(!isNavHidden); }}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'last')}>
                                <WebLayoutIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.1} />
                                <span>Show Nav</span>
                            </GazeButton>}
                        </>}
                    </div>
                    <BrowserStatusLine text={statusText} notice={browser.notice} />
                </div>

                {/* BOTTOM REGION: optional Links sidebar + BrowserView + ContentScrollDock (right gutter) */}
                <div className="web-page-body" style={{ flex: 1, minHeight: 0, display: 'flex', width: '100%', padding: 'clamp(8px,1vh,14px) clamp(16px,2vw,24px) 0', boxSizing: 'border-box', gap: 'clamp(12px,1.5vw,20px)' }}>
                    {showLinksSidebar && (
                        <div style={{
                            flex: '0 0 clamp(330px, 28vw, 460px)',
                            height: '100%',
                            background: T_chromeBg,
                            border: `1px solid ${T_chromeBorder}`,
                            borderRadius: '16px',
                            padding: 'clamp(12px,1.5vh,18px)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'clamp(8px,1vh,12px)',
                            overflow: 'hidden',
                        }}>
                            <div style={{ fontSize: 'clamp(16px,2vh,21px)', fontWeight: 800, color: T_chromeText, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <WI.ListIcon size={24} strokeWidth={2.2} style={{ color: isLight ? '#76624A' : '#789D91' }} />
                                    <span>{largeLinkTargets ? 'Large Links' : 'Page Links'}</span>
                                </span>
                                <span style={{ fontSize: 'clamp(13px,1.5vh,16px)', color: T_chromeTextMuted, fontWeight: 700 }}>
                                    {currentLinkPage + 1}/{totalLinkPages}
                                </span>
                            </div>
                            <div ref={linkChoices.ref} className="browse-link-choices" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 'clamp(10px,1.2vh,14px)', minHeight: 0 }}>
                                {browser.pageLinks.length ? visiblePageLinks.map((link, idx) => {
                                    const absoluteIdx = currentLinkPage * linksPerPage + idx;
                                    return (
                                        <GazeButton
                                            key={`${link.href}-${absoluteIdx}`}
                                            id={`bv-link-${absoluteIdx}`}
                                            onClick={() => { browser.navigateTo(link.href); disableGaze(); }}
                                            gazeEnabled={ige}
                                            gazeEnabledTimestamp={ts}
                                            isDarkMode dwellCategory="navigationButton"
                                            style={{
                                                ...cb,
                                                flex: '1 1 0',
                                                minHeight: largeLinkTargets ? 104 : 80,
                                                width: '100%',
                                                justifyContent: 'center',
                                                textAlign: 'center' as const,
                                                fontSize: largeLinkTargets ? 'clamp(22px,2.5vh,28px)' : 'clamp(20px,2.2vh,24px)',
                                                lineHeight: 1.3,
                                                fontWeight: 650,
                                                padding: 'clamp(10px,1.2vh,16px) clamp(12px,1vw,18px)',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{link.text}</span>
                                        </GazeButton>
                                    );
                                }) : (
                                    <div style={{
                                        color: 'var(--ui-muted)',
                                        fontSize: 'clamp(16px,2vh,21px)',
                                        minHeight: 'clamp(100px,14vh,150px)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        textAlign: 'center',
                                        padding: 'clamp(12px,1.5vh,18px)',
                                    }}>No large page links detected yet.</div>
                                )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'clamp(8px,1vw,12px)', flexShrink: 0 }}>
                                <GazeButton
                                    id="bv-links-prev"
                                    onClick={() => setLinkPage((page) => Math.max(0, page - 1))}
                                    gazeEnabled={ige}
                                    gazeEnabledTimestamp={ts}
                                    isDarkMode
                                    dwellCategory="backSkipButton"
                                    disabled={!canPageLinksBack}
                                    style={{ ...toolbarBtn('primary', false), minHeight: 'clamp(80px,8.8vh,98px)', width: '100%', minWidth: 0, opacity: canPageLinksBack ? 1 : 0.45 }}
                                >
                                    <BackIcon size={24} color="currentColor" strokeWidth={2.3} />
                                    <span>Prev</span>
                                </GazeButton>
                                <GazeButton
                                    id="bv-links-refresh"
                                    onClick={() => browser.refreshLinks()}
                                    gazeEnabled={ige}
                                    gazeEnabledTimestamp={ts}
                                    isDarkMode
                                    dwellCategory="navigationButton"
                                    style={{ ...toolbarBtn('secondary', false), minHeight: 'clamp(80px,8.8vh,98px)', width: '100%', minWidth: 0 }}
                                >
                                    <RefreshIcon size={24} color="currentColor" strokeWidth={2.3} />
                                    <span>Refresh</span>
                                </GazeButton>
                                <GazeButton
                                    id="bv-links-next"
                                    onClick={() => setLinkPage((page) => Math.min(totalLinkPages - 1, page + 1))}
                                    gazeEnabled={ige}
                                    gazeEnabledTimestamp={ts}
                                    isDarkMode
                                    dwellCategory="navigationButton"
                                    disabled={!canPageLinksForward}
                                    style={{ ...toolbarBtn('primary', false), minHeight: 'clamp(80px,8.8vh,98px)', width: '100%', minWidth: 0, opacity: canPageLinksForward ? 1 : 0.45 }}
                                >
                                    <WI.ChevronRightIcon size={24} strokeWidth={2.3} />
                                    <span>Next</span>
                                </GazeButton>
                            </div>
                            <GazeButton
                                id="bv-links-size-toggle"
                                onClick={() => { setLargeLinkTargets((value) => !value); setLinkPage(0); }}
                                gazeEnabled={ige}
                                gazeEnabledTimestamp={ts}
                                isDarkMode
                                dwellCategory="navigationButton"
                                style={{ ...toolbarBtn('secondary', false), minHeight: 'clamp(80px,8.8vh,98px)', width: '100%', minWidth: 0, flexShrink: 0 }}
                            >
                                <WebLayoutIcon size={24} color="currentColor" strokeWidth={2.1} />
                                <span>{largeLinkTargets ? 'Compact Links' : 'Large Links'}</span>
                            </GazeButton>
                        </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                        <div className="browser-content-frame" ref={viewRef} style={{
                            width: '100%', height: '100%', borderRadius: CR, overflow: 'hidden', background: '#fff',
                            border: WEB_SURFACE.borderSoft, boxShadow: WEB_SURFACE.panelShadow,
                        }}>
                            <div style={{
                                width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#999', fontSize: '15px',
                            }}>{browser.loading ? 'Loading...' : 'Web content loaded. Teal cursor follows your gaze.'}</div>
                        </div>
                    </div>
                    <ContentScrollDock
                        onUp={() => { void browser.scrollUp(); }}
                        onDown={() => { void browser.scrollDown(); }}
                        atTop={browser.pageScroll.atTop}
                        atBottom={browser.pageScroll.atBottom}
                        gazeScrollOn={browser.scrollMode === 'armed'}
                        onToggleGazeScroll={() => { void browser.setScrollMode(browser.scrollMode === 'armed' ? 'off' : 'armed'); }}
                        gazeEnabled={toolbarGazeEnabled}
                        gazeTimestamp={toolbarGazeTimestamp}
                    />
                </div>
            </div>
        );
    }

    if (isCardTopic && topic) {
        const snapshot = ws.quickSnapshot;
        const isCached = !!snapshot?.cached;
        const weather = snapshot?.weather;
        const cricket = snapshot?.cricket;
        const isWeather = topic.id === 'local_weather';
        const look = QUICK_TOPIC_LOOK[topic.id] || { icon: <WI.SearchLineIcon size={44} strokeWidth={2} />, accent: 'accent' as WebAccent };
        const ready = isWeather ? !!weather?.ok : !!cricket?.ok;
        const degrees = (value: unknown) => (typeof value === 'number' || typeof value === 'string') && String(value) !== '' ? `${value}°` : '–';
        const answerSub = isWeather
            ? (weather?.ok && weather.city ? weather.city : 'Weather near you')
            : (cricket?.ok && cricket.match ? cricket.match : 'Live match');

        return (
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                padding: 'clamp(14px, 1.8vh, 24px) clamp(28px, 3vw, 56px) clamp(22px, 3vh, 40px)',
                gap: 'clamp(14px, 2vh, 24px)',
                background: T_pageBg,
            }}>
                {/* One bar of four equal choices, like the YouTube bar. Close returns to the
                    Quick Search topics, as Close does on a news story and a YouTube page;
                    the navigation bar's Back still leaves Quick Search. */}
                <div className="browser-toolbar web-bar" style={{ ...connectedToolbarStyle, flexShrink: 0 }}>
                    <GazeButton id="qs-card-back" onClick={() => { setTopic(null); disableGaze(); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                        style={toolbarBtnConnected('dismiss', false, 'first')}>
                        <XIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Close</span>
                    </GazeButton>
                    <GazeButton id="qs-card-refresh" onClick={() => ws.getQuickSnapshot(true)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        style={toolbarBtnConnected('primary', false, 'middle')}>
                        <RefreshIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.2} />
                        <span>Refresh</span>
                    </GazeButton>
                    <GazeButton id="qs-card-open-web" onClick={openLiveWebFromCard} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        style={toolbarBtnConnected('primary', false, 'middle')}>
                        <WI.ExternalLinkIcon size={browserToolbarIconSize} strokeWidth={2.2} />
                        <span>Open Live Web</span>
                    </GazeButton>
                    <GazeButton id="qs-card-read" onClick={speakCardSummary} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="phraseButton"
                        style={toolbarBtnConnected('secondary', false, 'last')}>
                        <SpeakIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.2} />
                        <span>Read Aloud</span>
                    </GazeButton>
                </div>

                <div className="web-answer" aria-live="polite">
                    <div className="web-answer-head">
                        <div className="web-answer-badge" style={{ color: WEB_ACCENT[look.accent] }}>{look.icon}</div>
                        <div style={{ minWidth: 0 }}>
                            <div className="web-answer-title">{stripLeadingEmoji(topic.label)}</div>
                            <div className="web-answer-sub">{answerSub}</div>
                        </div>
                        {isCached && <span className="web-answer-tag">Saved earlier</span>}
                    </div>

                    {ready && isWeather && (
                        <div className="web-answer-main">
                            <div className="web-answer-hero">
                                <div className="web-answer-big">{degrees(weather.temp_c)}<span style={{ fontSize: '0.42em', marginLeft: '0.08em' }}>C</span></div>
                                <div className="web-answer-lead">{weather.condition || 'Current weather'}</div>
                            </div>
                            <div className="web-answer-facts" style={{ gridTemplateRows: 'repeat(3, minmax(0, 1fr))' }}>
                                <div className="web-answer-fact">
                                    <WI.ThermometerIcon size={34} strokeWidth={2} style={{ color: WEB_ACCENT.rose }} />
                                    <span className="web-answer-fact-label">Feels like</span>
                                    <span className="web-answer-fact-value">{degrees(weather.feels_like_c)}</span>
                                </div>
                                <div className="web-answer-fact">
                                    <WI.DropletIcon size={34} strokeWidth={2} style={{ color: WEB_ACCENT.blue }} />
                                    <span className="web-answer-fact-label">Humidity</span>
                                    <span className="web-answer-fact-value">{weather.humidity ?? '–'}%</span>
                                </div>
                                <div className="web-answer-fact">
                                    <WI.WindIcon size={34} strokeWidth={2} style={{ color: WEB_ACCENT.green }} />
                                    <span className="web-answer-fact-label">Wind</span>
                                    <span className="web-answer-fact-value">{weather.wind_kph ?? '–'} km/h</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {ready && !isWeather && (
                        <div className="web-answer-main" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
                            <div className="web-answer-hero">
                                <div className="web-answer-score">{cricket.summary || 'Score update'}</div>
                                <div className="web-answer-lead" style={{ color: WEB_ACCENT.green }}>{cricket.status || 'Update available'}</div>
                                {cricket.venue && (
                                    <div className="web-answer-note" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <WI.MapPinIcon size={26} strokeWidth={2} />
                                        <span>{cricket.venue}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!ready && (
                        <div className="web-answer-empty">
                            <div className="web-answer-lead">
                                {!snapshot ? 'Getting the latest…' : isWeather ? 'Weather is not available right now.' : 'No live match update right now.'}
                            </div>
                            <div className="web-answer-note">Choose Refresh to try again, or Open Live Web to see it on Google.</div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── LANDING: a search field for anything, then six ready topics ──
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T_pageBg }}>
            <div className="patient-stage web-stage web-search-stage" data-view="categories" style={{
                flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
                padding: '0 clamp(44px, 5vw, 86px) clamp(86px, 10vh, 124px)',
                marginTop: 'clamp(18px, 2.2vh, 30px)',
            }}>
                <div className="web-stage-head" style={{ marginBottom: 'clamp(16px, 2.2vh, 26px)' }}>
                    <h2 style={{ margin: 0, fontSize: 'clamp(32px, 4vh, 48px)', fontWeight: 820, color: T_chromeText, lineHeight: 1 }}>
                        Quick Search
                    </h2>
                </div>
                <div className="web-search-body">
                    {/* Anything else, typed on the keyboard: Google's results open here. */}
                    <GazeButton id="qs-type-search" className="web-search-field" onClick={openSearch}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
                        <span className="web-search-field-icon"><WI.SearchLineIcon size={38} strokeWidth={2.2} /></span>
                        <span className="web-search-field-text">Type anything to search Google</span>
                        <span className="web-search-field-hint"><KeyboardIcon size={26} color="currentColor" strokeWidth={2} />Keyboard</span>
                    </GazeButton>
                    <div className="web-stage-grid" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
                    }}>
                        {QUICK_TOPICS.map((t) => {
                            const look = QUICK_TOPIC_LOOK[t.id] || { icon: <WI.SearchLineIcon size={64} strokeWidth={1.8} />, accent: 'accent' as WebAccent };
                            return (
                                <WebChoiceCard key={t.id} id={`qs-${t.id}`}
                                    title={stripLeadingEmoji(t.label)}
                                    subtitle={QUICK_TOPIC_SUBTITLES[t.id]}
                                    icon={look.icon} accent={look.accent}
                                    onClick={() => openTopic(t)}
                                    ige={ige} ts={ts} />
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── SOCIAL PANEL ──
// These services remain local placeholders until their gaze workflows are ready.
// No URL or native BrowserView is opened from this panel.
const SOCIAL_SERVICES = [
    { id: 'linkedin', label: 'LinkedIn', Icon: WorkIcon },
    { id: 'gmail', label: 'Gmail', Icon: MailIcon },
    { id: 'whatsapp', label: 'WhatsApp', Icon: WhatsAppIcon },
] as const;
type SocialServiceId = typeof SOCIAL_SERVICES[number]['id'];

const SOCIAL_LOOK: Record<SocialServiceId, { icon: (size: number) => React.ReactNode; accent: WebAccent; sub: string }> = {
    linkedin: { icon: (s) => <WI.BriefcaseIcon size={s} strokeWidth={1.8} />, accent: 'blue', sub: 'Work and contacts' },
    gmail: { icon: (s) => <WI.MailIcon size={s} strokeWidth={1.8} />, accent: 'rose', sub: 'Email' },
    whatsapp: { icon: (s) => <WhatsAppIcon size={s} strokeWidth={1.8} />, accent: 'green', sub: 'Messages and calls' },
};

const SocialPanel = ({ ige, ts, selectedService, onSelect, onBack }: {
    ige: boolean;
    ts: number;
    selectedService: SocialServiceId | null;
    onSelect: (service: SocialServiceId) => void;
    onBack: () => void;
}) => {
    const service = SOCIAL_SERVICES.find(item => item.id === selectedService);

    if (service) {
        const look = SOCIAL_LOOK[service.id];
        return (
            <section className="browse-social-panel" aria-labelledby="social-service-name">
                <div className="browse-coming-soon">
                    <div className="web-soon-badge" style={{ color: WEB_ACCENT[look.accent] }}>{look.icon(72)}</div>
                    <h2 id="social-service-name">{service.label}</h2>
                    <p role="status">Coming soon</p>
                    <div className="web-answer-note">{service.label} will open here, ready for eye gaze, in a later update.</div>
                    <GazeButton id="soc-back" onClick={onBack}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        dwellCategory="backSkipButton" className="browse-social-back">
                        <BackIcon size={28} color="currentColor" strokeWidth={2} />
                        <span>Back</span>
                    </GazeButton>
                </div>
            </section>
        );
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-page)' }}>
            <section className="patient-stage web-stage web-social-stage" data-view="categories" aria-labelledby="social-heading" style={{
                flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
                padding: '0 clamp(44px, 5vw, 86px) clamp(86px, 10vh, 124px)',
                marginTop: 'clamp(18px, 2.2vh, 30px)',
            }}>
                <div className="web-stage-head" style={{ marginBottom: 'clamp(18px, 2.4vh, 28px)' }}>
                    <h2 id="social-heading" style={{ margin: 0, fontSize: 'clamp(32px, 4vh, 48px)', fontWeight: 820, color: 'var(--ui-ink)', lineHeight: 1 }}>
                        Social & Connect
                    </h2>
                    <span className="web-stage-pill" role="note">Coming soon</span>
                </div>
                {/* Three cards fill the stage, as the four do on the Web Browsing page. */}
                <div className="web-stage-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gridTemplateRows: 'minmax(0, 1fr)',
                }}>
                    {SOCIAL_SERVICES.map(({ id, label }) => (
                        <WebChoiceCard key={id} id={`soc-${id}`} title={label} subtitle={SOCIAL_LOOK[id].sub}
                            icon={SOCIAL_LOOK[id].icon(64)} accent={SOCIAL_LOOK[id].accent}
                            onClick={() => onSelect(id)} ige={ige} ts={ts} />
                    ))}
                </div>
            </section>
        </div>
    );
};

// ── MAIN COMPONENT ──
// Hub layout: 4 cards arranged as a balanced 2×2 grid.
// 'knowledge' (ALS Knowledge) intentionally removed — that path is now
// covered by ALS Research inside Quick Search. The KnowledgePanel
// component + 'knowledge' ViewState are kept for any deep-link routing.
const HUB_CARDS = [
    { id: 'news', label: 'News Feed', labelHindi: 'समाचार', accent: WEB_ACCENTS.maroon, bg: 'rgba(45, 27, 24, 0.94)',
        subtitle: 'Good news, India, cricket and science', tone: 'blue' as WebAccent },
    { id: 'youtube', label: 'YouTube', labelHindi: 'यूट्यूब', accent: WEB_ACCENTS.gold, bg: 'rgba(42, 33, 19, 0.94)',
        subtitle: 'Songs, bhajans and any video', tone: 'rose' as WebAccent },
    { id: 'search', label: 'Quick Search', labelHindi: 'खोज', accent: WEB_ACCENTS.teal, bg: 'rgba(22, 40, 38, 0.94)',
        subtitle: 'Weather, cricket and Google', tone: 'green' as WebAccent },
    { id: 'social', label: 'Social & Connect', labelHindi: 'संपर्क', accent: WEB_ACCENTS.blue, bg: 'rgba(25, 35, 42, 0.94)',
        subtitle: 'WhatsApp, Gmail and LinkedIn', tone: 'violet' as WebAccent },
];

const hubIcon = (id: string) => {
    if (id === 'news') return <WI.NewspaperIcon size={72} strokeWidth={1.8} />;
    if (id === 'youtube') return <WI.PlayBoxIcon size={72} strokeWidth={1.8} />;
    if (id === 'search') return <WI.SearchLineIcon size={72} strokeWidth={1.8} />;
    return <WI.ChatsIcon size={72} strokeWidth={1.8} />;
};

type HubCardVisual = {
    accent: string;
    bg: string;
    iconSize: number;
    iconOpacity: number;
    dividerOpacity: number;
};

// Daily Assistance parity: uniform warm-dark card surface for all five cards.
// Identity comes from the icon's accent color, drawn from the exact Daily
// Assistance palette (DAILY_ASSISTANCE_ICON_COLORS.dark in MedicalScreen.tsx).
const HUB_UNIFIED_CARD_BG = '#20221E';
const HUB_UNIFIED_CARD_BORDER = '1.5px solid rgba(213, 216, 188, 0.14)';
// Two-stage shadow: subtle top-edge highlight + deep lift below.
// The inset top-line catches light like a real surface edge, the outer shadow
// gives the card real elevation. Replaces the flatter single-shadow look.
const HUB_UNIFIED_CARD_SHADOW = 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)';

// Unified muted teal across all five icons (mirrors `symptoms` from Daily Assistance).
const HUB_UNIFIED_ACCENT = '#789D91';

const HUB_CARD_VISUALS: Record<string, HubCardVisual> = {
    news: {
        accent: HUB_UNIFIED_ACCENT,
        bg: HUB_UNIFIED_CARD_BG,
        iconSize: 152,
        iconOpacity: 1,
        dividerOpacity: 0.62,
    },
    youtube: {
        accent: HUB_UNIFIED_ACCENT,
        bg: HUB_UNIFIED_CARD_BG,
        iconSize: 154,
        iconOpacity: 1,
        dividerOpacity: 0.62,
    },
    knowledge: {
        accent: HUB_UNIFIED_ACCENT,
        bg: HUB_UNIFIED_CARD_BG,
        iconSize: 152,
        iconOpacity: 1,
        dividerOpacity: 0.62,
    },
    search: {
        accent: HUB_UNIFIED_ACCENT,
        bg: HUB_UNIFIED_CARD_BG,
        iconSize: 150,
        iconOpacity: 1,
        dividerOpacity: 0.62,
    },
    social: {
        accent: HUB_UNIFIED_ACCENT,
        bg: HUB_UNIFIED_CARD_BG,
        iconSize: 152,
        iconOpacity: 1,
        dividerOpacity: 0.62,
    },
};

const WebBrowsingScreen: React.FC<{ onNavigate: (s: string) => void; onSpeak: (t: string) => void; isDarkMode: boolean; showHindi?: boolean }> = ({
    onNavigate, onSpeak, isDarkMode, showHindi = false,
}) => {
    const { isLight, isWarm, isMix } = useTheme();
    const { data: { settings } } = useCustomization();
    const [view, setView] = useState<ViewState>('grid');
    const [socialService, setSocialService] = useState<SocialServiceId | null>(null);
    const { isGazeEnabled: ige, lastEnabledTimestamp: ts, disableGaze, enableGaze } = useGazeControl();
    const browser = useGazeBrowser();
    const ws = useWS();
    const { settings: dwellSettings, currentStage } = useDwellTime();
    const { hasRealGaze } = useRealGaze();
    // v17.17: gaze position lives in a ref ONLY. It used to be mirrored into
    // useState on every frame, which re-rendered this entire ~3800-line
    // component at 66Hz (plus every mousemove) — and nothing ever read the
    // state. Consumers all use gpRef.
    const gpRef = useRef({ x: 0, y: 0 });
    const browserSampleRef = useRef({ valid: false, receivedAt: 0, emittedAtWallMs: 0, pipeline: '' });
    const [windowBounds, setWindowBounds] = useState<{ x: number; y: number; width: number; height: number; screenWidth: number; screenHeight: number; scaleFactor: number; isFullScreen: boolean; isMaximized: boolean; } | null>(null);
    const windowBoundsRef = useRef<typeof windowBounds>(null);
    const [isNavHidden, setIsNavHidden] = useState(false);
    const [isQsTopicActive, setIsQsTopicActive] = useState(false);
    const [isYtVideoActive, setIsYtVideoActive] = useState(false);
    const [browserInteractionMode, setBrowserInteractionMode] = useState<BrowserInteractionMode>('control');
    const isEmbeddedBrowserActive = (view === 'search' && isQsTopicActive) || (view === 'youtube' && isYtVideoActive);
    const isBrowserWatchMode = isEmbeddedBrowserActive && browserInteractionMode === 'watch';

    useEffect(() => {
        const stageFactor = currentStage === 'late_als' ? 1.35 : currentStage === 'mid_als' ? 1.15 : currentStage === 'caregiver' ? 0.85 : 1.0;
        browser.setGazeConfig({
            dwellMs: dwellSettings.navigationButton,
            onsetMs: Math.max(150, Math.min(700, dwellSettings.onsetDelay)),
            stabilityRadiusPx: Math.round(48 * stageFactor),
            postClickCooldownMs: Math.max(800, Math.min(1800, dwellSettings.cooldownAfterActivation)),
            edgeHoldMs: Math.round(Math.max(450, Math.min(1300, dwellSettings.onsetDelay + 350 * stageFactor))),
            edgeZonePct: 0.20,
            edgeMinDeltaPx: currentStage === 'caregiver' ? 22 : 16,
            edgeMaxDeltaPx: currentStage === 'caregiver' ? 42 : currentStage === 'late_als' ? 28 : 36,
            edgeThrottleMs: currentStage === 'caregiver' ? 100 : 130,
            edgeMaxBurstMs: currentStage === 'late_als' ? 5200 : 6000,
            // v17.18 dwell-safety toggles, driven by the same localStorage
            // gazeFlags system as the app cursor so a rollback set in the
            // MAIN app DevTools (window.__gazeFlags.set('browserProgressRetention', false))
            // persists across restarts AND page loads. Read at effect time;
            // re-applied whenever this screen reconfigures the browser.
            progressRetentionEnabled: gazeFlags.browserProgressRetention,
            gapPauseEnabled: gazeFlags.browserGapPause,
            // B3 prototype (default OFF) — per-target progress bank for
            // dense pages; same persistence path as the toggles above.
            progressBankEnabled: gazeFlags.browserProgressBank,
        });
    }, [browser.setGazeConfig, currentStage, dwellSettings.cooldownAfterActivation, dwellSettings.onsetDelay, dwellSettings.navigationButton]);

    // Tier 0 A — single-dwell gaze toggle for hidden-nav embedded browser strip
    const toggleGaze = useCallback(() => {
        if (ige) disableGaze(); else enableGaze();
    }, [ige, disableGaze, enableGaze]);

    // ── DISABLE GAZE on every view change (prevents accidental selections) ──
    useEffect(() => {
        disableGaze();
    }, [view, socialService]);

    useEffect(() => {
        if (isEmbeddedBrowserActive) setIsNavHidden(true);
    }, [isEmbeddedBrowserActive]);

    // Always show the global nav on the landing grid — regardless of any
    // residual isNavHidden state from a prior browser session.
    useEffect(() => {
        if (view === 'grid') setIsNavHidden(false);
    }, [view]);

    useEffect(() => {
        if (view === 'grid' && browser.isOpen) {
            void browser.resetBrowserSession('web-grid');
        }
    }, [browser.isOpen, browser.resetBrowserSession, view]);

    useEffect(() => {
        if (!isEmbeddedBrowserActive) {
            setBrowserInteractionMode('control');
            return;
        }
        if (view === 'search') {
            setBrowserInteractionMode('watch');
        }
    }, [isEmbeddedBrowserActive, view]);

    // Enable on entry only. A subsequent Pause Gaze action must stay paused.
    const browserWasActiveRef = useRef(false);
    useEffect(() => {
        const enteringBrowser = isEmbeddedBrowserActive && !browserWasActiveRef.current;
        browserWasActiveRef.current = isEmbeddedBrowserActive;
        if (enteringBrowser && !ige) {
            enableGaze();
        }
    }, [enableGaze, ige, isEmbeddedBrowserActive]);

    // ── POLL WINDOW BOUNDS for coordinate mapping (same as GazeCursor.tsx) ──
    useEffect(() => {
        const updateBounds = async () => {
            try {
                const api = (window as any).electronAPI;
                if (api?.getWindowBounds) {
                    const bounds = await api.getWindowBounds();
                    if (bounds) windowBoundsRef.current = bounds;
                }
            } catch { /* browser mode */ }
        };
        updateBounds();
        const interval = setInterval(updateBounds, 2000);
        return () => clearInterval(interval);
    }, []);

    // ── SUBSCRIBE TO REAL GAZE DATA from Tobii eye tracker ──
    // Uses the exact same coordinate transform as GazeCursor.tsx
    useEffect(() => {
        const unsub = ws.subscribeGaze((data: any) => {
            if (!isUsableGaze(data, Date.now())) {
                browserSampleRef.current.valid = false;
                return;
            }
            browserSampleRef.current = {
                valid: true,
                receivedAt: performance.now(),
                emittedAtWallMs: data.t_helper_ms || data.t_sent_wall_ms || Date.now(),
                pipeline: data.active_pipeline || '',
            };

            let rawX: number, rawY: number;
            const coordSpace = data?.coord_space === 'screen' ? 'screen' : 'window';
            if (coordSpace === 'window') {
                rawX = data.x * window.innerWidth;
                rawY = data.y * window.innerHeight;
            } else {
                const bounds = windowBoundsRef.current;
                if (bounds && (bounds.isFullScreen || bounds.isMaximized)) {
                    rawX = data.x * window.innerWidth;
                    rawY = data.y * window.innerHeight;
                } else if (bounds) {
                    const screenPixelX = data.x * bounds.screenWidth;
                    const screenPixelY = data.y * bounds.screenHeight;
                    rawX = (screenPixelX - bounds.x) * (window.innerWidth / bounds.width);
                    rawY = (screenPixelY - bounds.y) * (window.innerHeight / bounds.height);
                } else {
                    rawX = data.x * window.innerWidth;
                    rawY = data.y * window.innerHeight;
                }
            }

            // Preserve outside-window coordinates so they cannot become an
            // edge target merely by clamping a gaze from another window.
            gpRef.current = { x: rawX, y: rawY };
        });
        return unsub;
    }, [ws.subscribeGaze]);

    // ── MOUSE FALLBACK for simulation mode (no eye tracker) ──
    useEffect(() => {
        const h = (e: MouseEvent) => {
            // Only use mouse position when no real gaze data is present
            if (!hasRealGaze) {
                gpRef.current = { x: e.clientX, y: e.clientY };
            }
        };
        window.addEventListener('mousemove', h);
        return () => window.removeEventListener('mousemove', h);
    }, [hasRealGaze]);

    // Forward each fresh sample into BrowserView. The adaptive backend owns
    // position estimation; legacy sources retain their existing visual filter.
    //
    // v17.17: forwarding is event-driven (per gaze frame, ~66Hz) instead of a
    // 33ms poll. The poll added up to 33ms of lag, dropped roughly every other
    // frame the page-side dwell could have ticked on, and kept re-sending the
    // last held position through blinks (so the page dwell advanced on stale
    // gaze — see gapPause on the page side for the matching fix). A mousemove
    // path keeps simulation mode working: with no eye tracker there are no WS
    // gaze frames at all, so mouse-as-gaze must forward on its own events.
    const smoothedGazeRef = useRef<{ x: number; y: number } | null>(null);
    // Legacy estimator history; bypassed for the adaptive backend pipeline.
    const wmaPrev1Ref = useRef<{ x: number; y: number } | null>(null);
    const wmaPrev2Ref = useRef<{ x: number; y: number } | null>(null);
    const hasRealGazeRef = useRef(hasRealGaze);
    useEffect(() => { hasRealGazeRef.current = hasRealGaze; }, [hasRealGaze]);
    // The latest gaze point in window px while it is fresh (the tracker's estimate, or the
    // mouse in UI-only simulation): the calm full-screen strip counts a look with it.
    const getFreshGaze = useCallback((): { x: number; y: number } | null => {
        if (hasRealGazeRef.current) {
            const sample = browserSampleRef.current;
            if (!sample.valid || performance.now() - sample.receivedAt > GAZE_STALE_MS) return null;
        }
        const point = gpRef.current;
        return Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
    }, []);
    // v17.18: hide/show bookkeeping that must SURVIVE effect re-runs — the
    // earlier hide-once guard keyed on smoothedGazeRef, which the effect body
    // resets, so a dep-change re-run while the page cursor was visible left a
    // stale frozen cursor over the page (review-confirmed). These refs are
    // the source of truth for "is the page cursor currently shown".
    const pageCursorVisibleRef = useRef(false);
    const lastForwardAtRef = useRef(0);
    const lastForwardModeRef = useRef<boolean | null>(null);
    useEffect(() => {
        if (!browser.isOpen) return;
        smoothedGazeRef.current = null;
        wmaPrev1Ref.current = null;
        wmaPrev2Ref.current = null;
        // Min spacing between IPC sends. ET5 frames arrive every ~15.2ms so
        // real gaze always passes; this only caps high-rate mousemove bursts
        // (and any future 133Hz tracker mode) at ~70Hz.
        const MIN_FORWARD_INTERVAL_MS = 14;
        let lastSentAt = 0;

        // Hide exactly once per transition, no matter how the filter refs
        // were reset in between; show records visibility for the next hide.
        const hidePageCursor = (force = false) => {
            smoothedGazeRef.current = null;
            wmaPrev1Ref.current = null;
            wmaPrev2Ref.current = null;
            if (force || pageCursorVisibleRef.current) {
                pageCursorVisibleRef.current = false;
                browser.hideGazeCursor();
            }
        };
        const showPageCursor = (x: number, y: number, opts?: { cursor?: boolean }) => {
            // Even cursor:false frames can arm edge scrolling and must be
            // cancelled when input becomes unavailable.
            pageCursorVisibleRef.current = true;
            browser.updateGazeCursor(x, y, {
                ...opts,
                emittedAtWallMs: hasRealGazeRef.current ? browserSampleRef.current.emittedAtWallMs : Date.now(),
            });
        };

        const forward = () => {
            const sample = browserSampleRef.current;
            if (hasRealGazeRef.current && (!sample.valid ||
                performance.now() - sample.receivedAt > GAZE_STALE_MS)) {
                hidePageCursor();
                return;
            }
            const allowWatchScroll = isBrowserWatchMode && browser.scrollMode === 'armed';
            if (!ige || (isBrowserWatchMode && !allowWatchScroll)) {
                hidePageCursor();
                return;
            }
            const nowMs = Date.now();
            if (nowMs - lastSentAt < MIN_FORWARD_INTERVAL_MS) return;
            lastSentAt = nowMs;

            // v17.18: WMA history is only valid for a continuous same-mode
            // stream — reset after a stream gap (>150ms, the discontinuity
            // threshold the page-side gapPause uses) or a real<->simulation
            // mode flip, so seconds-old samples never blend into the first
            // post-gap frames (the "ghost mid-point sweep" review finding).
            if (lastForwardAtRef.current > 0 && nowMs - lastForwardAtRef.current > GAZE_STALE_MS) {
                wmaPrev1Ref.current = null;
                wmaPrev2Ref.current = null;
                smoothedGazeRef.current = null;
                if (nowMs - lastForwardAtRef.current > GAZE_RECOVERY_MS) hidePageCursor(true);
            }
            if (lastForwardModeRef.current !== hasRealGazeRef.current) {
                lastForwardModeRef.current = hasRealGazeRef.current;
                wmaPrev1Ref.current = null;
                wmaPrev2Ref.current = null;
            }
            lastForwardAtRef.current = nowMs;

            const gazeNow = gpRef.current;
            const prev = smoothedGazeRef.current;
            const activeBounds = browser.boundsRef.current;

            if (view === 'youtube' && isYtVideoActive && activeBounds && gazeNow.y < activeBounds.y + 96) {
                // YouTube's own header is never a dwell target. Gaze Scroll still gets
                // the frames here (cursor-less): scrolling up starts at the top edge.
                if (browser.scrollMode === 'armed') showPageCursor(gazeNow.x, gazeNow.y, { cursor: false });
                else hidePageCursor();
                return;
            }

            if (sample.pipeline === 'adaptive_cursor_v1') {
                smoothedGazeRef.current = { x: gazeNow.x, y: gazeNow.y };
                wmaPrev1Ref.current = null;
                wmaPrev2Ref.current = null;
                showPageCursor(gazeNow.x, gazeNow.y, allowWatchScroll ? { cursor: false } : undefined);
                return;
            }

            // v17.18: the snap decision uses the UNFILTERED displacement so
            // WMA lag cannot raise the effective 18px gate to ~40px (review:
            // adjacent-link refixations degraded into EMA crawl, and post-gap
            // refixations swept through 2-3 ghost mid-points). A snap is a
            // discontinuity: jump straight to the true gaze point and restart
            // the WMA history there.
            if (prev) {
                const jumpDist = Math.hypot(gazeNow.x - prev.x, gazeNow.y - prev.y);
                if (jumpDist > 18) {
                    wmaPrev1Ref.current = { x: gazeNow.x, y: gazeNow.y };
                    wmaPrev2Ref.current = { x: gazeNow.x, y: gazeNow.y };
                    smoothedGazeRef.current = { x: gazeNow.x, y: gazeNow.y };
                    showPageCursor(gazeNow.x, gazeNow.y, allowWatchScroll ? { cursor: false } : undefined);
                    return;
                }
            }

            // WMA(3) prefilter — weights match the main cursor. Only the
            // sub-snap band (<=18px true displacement) reaches this filter,
            // so it smooths fixation noise without delaying refixations.
            const w1 = wmaPrev1Ref.current;
            const w2 = wmaPrev2Ref.current;
            const raw = (w1 && w2)
                ? {
                    x: gazeNow.x * 0.45 + w1.x * 0.30 + w2.x * 0.25,
                    y: gazeNow.y * 0.45 + w1.y * 0.30 + w2.y * 0.25,
                }
                : { x: gazeNow.x, y: gazeNow.y };
            wmaPrev2Ref.current = w1 ? { x: w1.x, y: w1.y } : { x: gazeNow.x, y: gazeNow.y };
            wmaPrev1Ref.current = { x: gazeNow.x, y: gazeNow.y };

            if (!prev) {
                smoothedGazeRef.current = { x: raw.x, y: raw.y };
                showPageCursor(raw.x, raw.y, allowWatchScroll ? { cursor: false } : undefined);
                return;
            }

            const dx = raw.x - prev.x;
            const dy = raw.y - prev.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Tiny jitter: hold the rendered point.
            // v17.20: 1.5 → 2.5px hold, on-rig feedback "cursor not stable
            // during fixation". Refixations are unaffected (the >18px snap
            // gate is upstream and tests unfiltered displacement). Old: 1.5.
            if (dist < 2.5) {
                showPageCursor(prev.x, prev.y, allowWatchScroll ? { cursor: false } : undefined);
                return;
            }

            // Medium move: follow quickly without a hard browser-side lock.
            // v17.20: sub-8px follow 0.74 → 0.65 (calmer fixation wander,
            // ~1 extra frame to settle on micro-adjustments). Old: 0.74.
            const alpha = dist > 8 ? 0.9 : 0.65;
            const next = {
                x: prev.x + dx * alpha,
                y: prev.y + dy * alpha,
            };
            smoothedGazeRef.current = next;
            showPageCursor(next.x, next.y, allowWatchScroll ? { cursor: false } : undefined);
        };

        // Real gaze: one forward per backend frame. The gpRef-filling
        // subscription above is registered first (earlier effect), so
        // gpRef already holds this frame's transformed position.
        const unsub = ws.subscribeGaze(() => forward());
        // Simulation fallback: forward on mouse movement when no real
        // gaze stream exists.
        const onMouse = () => {
            if (!hasRealGazeRef.current) forward();
        };
        window.addEventListener('mousemove', onMouse);
        const onGazeLost = () => {
            browserSampleRef.current.valid = false;
            hidePageCursor(true);
        };
        window.addEventListener('gaze_lost', onGazeLost);
        // UI-only simulation can dwell with a stationary mouse. RealGazeContext
        // never changes to simulation after a hardware disconnect.
        const heartbeat = window.setInterval(() => {
            if (!hasRealGazeRef.current) forward();
            else if (performance.now() - browserSampleRef.current.receivedAt > GAZE_RECOVERY_MS) {
                browserSampleRef.current.valid = false;
                hidePageCursor();
            }
        }, 33);
        // Entering a hidden state (gaze off / watch mode) must hide even
        // if no further frames arrive.
        if (!ige || (isBrowserWatchMode && browser.scrollMode !== 'armed')) {
            hidePageCursor();
        }
        return () => {
            unsub();
            window.removeEventListener('mousemove', onMouse);
            window.removeEventListener('gaze_lost', onGazeLost);
            window.clearInterval(heartbeat);
            hidePageCursor();
        };
    }, [ws.subscribeGaze, browser.boundsRef, browser.isOpen, browser.scrollMode, ige, isBrowserWatchMode, browser.hideGazeCursor, browser.updateGazeCursor, isYtVideoActive, view]);

    const goBack = useCallback(() => {
        if (view === 'social' && socialService) {
            setSocialService(null);
            return;
        }
        browser.closePage();
        setIsQsTopicActive(false);
        setIsYtVideoActive(false);
        setIsNavHidden(false);
        setBrowserInteractionMode('control');
        setView('grid');
    }, [browser, view, socialService]);

    if (view !== 'grid') return (
        <div className={`web-hub-screen${isLight ? ' theme-light' : isWarm ? ' theme-warm' : ''}`} data-gaze-context="webbrowse" data-browser-view={view} style={{ position: 'absolute', inset: 0, background: isWarm ? '#F5EEDF' : T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Nav visibility — driven SOLELY by isNavHidden (the single source of truth).
                Previous code gated this on isEmbeddedBrowserActive, which flapped on
                child-state resync (websocket reconnects, focus events) and caused the
                global nav to spontaneously reappear after inactivity. */}
            {!isNavHidden && <div style={{ zIndex: 10, flexShrink: 0 }}>
                <GlobalNavBar
                    currentPage="web"
                    onNavigate={onNavigate}

                    isDarkMode={isDarkMode}
                    onBack={isEmbeddedBrowserActive ? undefined : goBack}
                    isNavHidden={isNavHidden}
                    /* HIDE NAV button shows only when an embedded BrowserView is actually
                       rendering — never on landings, card detail pages, or static menus.
                       Hiding the global nav only makes sense when there's content that
                       benefits from the extra real estate. */
                    onNavHiddenToggle={isEmbeddedBrowserActive ? setIsNavHidden : undefined}
                />
            </div>}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {view === 'news' && <NewsPanel ige={ige} ts={ts} onSpeak={onSpeak} goBack={goBack} disableGaze={disableGaze} browser={browser} gpRef={gpRef} isNavHidden={isNavHidden} />}
                {view === 'youtube' && <YouTubePanel ige={ige} ts={ts} browser={browser} gpRef={gpRef} getGaze={getFreshGaze} goBack={goBack} disableGaze={disableGaze} toggleGaze={toggleGaze} isNavHidden={isNavHidden} isDarkMode={isDarkMode} browserInteractionMode={browserInteractionMode} onBrowserInteractionModeChange={setBrowserInteractionMode} onVideoActive={setIsYtVideoActive} onNavHiddenToggle={setIsNavHidden}  />}
                {view === 'knowledge' && <KnowledgePanel ige={ige} ts={ts} onSpeak={onSpeak} isNavHidden={isNavHidden} />}
                {view === 'search' && <QuickSearchPanel ige={ige} ts={ts} browser={browser} gpRef={gpRef} goBack={goBack} disableGaze={disableGaze} toggleGaze={toggleGaze} isNavHidden={isNavHidden} isDarkMode={isDarkMode} browserInteractionMode={browserInteractionMode} onBrowserInteractionModeChange={setBrowserInteractionMode} onTopicActive={setIsQsTopicActive} onNavHiddenToggle={setIsNavHidden}  onSpeak={onSpeak} />}
                {view === 'social' && <SocialPanel ige={ige} ts={ts} selectedService={socialService} onSelect={setSocialService} onBack={goBack} />}
            </div>
        </div>
    );

    // Web Browsing landing: the Activities stage -- a heading, then four cards.
    return (
        <div className={`web-hub-screen${isLight ? ' theme-light' : isWarm ? ' theme-warm' : ''}`} style={{ position: 'absolute', inset: 0, background: isWarm ? '#F5EEDF' : T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ zIndex: 10 }}>
                <GlobalNavBar currentPage="web" onNavigate={onNavigate} isDarkMode={isDarkMode} />
            </div>

            <div className="patient-stage web-stage" data-view="categories" style={{
                flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
                padding: '0 clamp(44px, 5vw, 86px) clamp(86px, 10vh, 124px)',
                marginTop: 'clamp(18px, 2.2vh, 30px)',
            }}>
                <div className="web-stage-head" style={{ marginBottom: 'clamp(18px, 2.4vh, 28px)' }}>
                    <h2 style={{ margin: 0, fontSize: 'clamp(32px, 4vh, 48px)', fontWeight: 820, color: 'var(--ui-ink)', lineHeight: 1 }}>
                        Web Browsing
                    </h2>
                </div>
                <div className="web-stage-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
                }}>
                    {HUB_CARDS.map((card) => (
                        <WebChoiceCard key={card.id} id={`hub-${card.id}`}
                            title={card.label}
                            subtitle={showHindi ? card.labelHindi : card.subtitle}
                            icon={hubIcon(card.id)} accent={card.tone}
                            onClick={() => setView(card.id as ViewState)}
                            ige={ige} ts={ts} dwellCategory="homeScreenTile" />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default WebBrowsingScreen;
