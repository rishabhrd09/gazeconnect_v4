/**
 * WebBrowsingScreen v3.6 — Real gaze cursor inside BrowserView, bigger buttons
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { screenThemes, typography, warmScreenTokens } from '../utils/design';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useWS } from '../hooks/useWebSocket';
import { useGazeBrowser } from '../hooks/useGazeBrowser';
import { useRealGaze } from '../contexts/RealGazeContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomization } from '../contexts/CustomizationContext';
import { useDwellTime } from '../contexts/DwellTimeContext';
import { gazeFlags } from '../utils/gazeFlags';
import {
    BackIcon,
    BrainIcon,
    GlobalIcon,
    PlayIcon,
    RefreshIcon,
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
const CBG = T.cardBg;
const CB = T.cardBorder;
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

const EmergencyIcon: React.FC<WebIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        <circle cx="48" cy="48" r="30" />
        <path d="M48 25v28" />
        <path d="M48 69h.1" />
    </svg>
);

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
    background: CBG, border: CB, borderRadius: CR, boxShadow: WEB_SURFACE.cardShadow,
    transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column',
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
    color: T.textMain, background: GL, border: WEB_SURFACE.borderSoft, borderRadius: '20px',
    minHeight: 'clamp(70px, 9vh, 100px)', width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
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
    fontWeight: 760,
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
// hiddenBrowserButton, hiddenEmergencyButton, showNavButtonStyle,
// browserModeButtonStyle) into 3 roles: primary, secondary, emergency.
// All share identical geometry — only the color triplet differs.
type ToolbarRole = 'primary' | 'secondary' | 'emergency';

// Professional cool-slate palette — replaces the warm-tan / sage-teal scheme
// that read as "toyish" in the screenshots. Inspired by macOS Big Sur toolbar
// chrome and pro browser UIs (Edge, Arc). Emergency keeps its distinct maroon.
const TOOLBAR_ROLE: Record<ToolbarRole, { color: string; bg: string; border: string }> = {
    // PRIMARY — cool cream text on dark slate, used for Back / Exit / Show-Nav / Close / Hide-Controls
    primary: {
        color: '#D8DEE6',
        bg: 'transparent',
        border: 'rgba(180, 195, 220, 0.10)',
    },
    // SECONDARY — slate-blue accent, used for Play/Pause, Show Controls
    secondary: {
        color: '#9DB7CC',
        bg: 'transparent',
        border: 'rgba(157, 183, 204, 0.18)',
    },
    // EMERGENCY — maroon, kept distinct as the only color-coded role
    emergency: {
        color: '#F0BCB0',
        bg: 'rgba(80, 32, 30, 0.82)',
        border: 'rgba(220, 158, 144, 0.30)',
    },
};

const toolbarBtn = (role: ToolbarRole, hidden: boolean): React.CSSProperties => {
    const r = TOOLBAR_ROLE[role];
    return {
        minHeight: hidden ? 'clamp(118px, 13.2vh, 158px)' : 'clamp(100px, 11vh, 132px)',
        minWidth: hidden ? 'clamp(128px, 9.8vw, 190px)' : 'clamp(158px, 12vw, 226px)',
        padding: hidden ? 'clamp(18px, 2.1vh, 28px) clamp(14px, 1.6vw, 24px)' : 'clamp(20px, 2.35vh, 30px) clamp(20px, 2.4vw, 36px)',
        fontSize: hidden ? 'clamp(19px, 2.45vh, 28px)' : 'clamp(21px, 2.7vh, 30px)',
        fontWeight: 760,
        fontFamily: FONT_PRIMARY,
        letterSpacing: '0.05em',
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
    background: '#181D24',
    border: '1.5px solid rgba(180, 195, 220, 0.12)',
    borderRadius: '20px',
    boxShadow: '0 10px 24px rgba(0,0,0,0.40)',
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
        fontWeight: 760,
        fontFamily: FONT_PRIMARY,
        letterSpacing: '0.05em',
        borderRadius: 0,
        color: r.color,
        background: r.bg,
        // Single 1px divider line on the right of every button except the last
        borderRight: position !== 'last' ? '1px solid rgba(180, 195, 220, 0.08)' : '0',
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

// In-content scroll dock — vertical column on the right edge of the
// embedded-browser content area. Up (top), optional Maximize toggle (middle),
// Down (bottom). Sits in a dedicated gutter column outside the BrowserView
// bounds since BrowserView always renders above HTML — floating overlays
// don't work here.
//
// Maximize is YouTube-only: spatially placed between Up and Down because all
// three are "video state" controls (scroll position + window state).
type ScrollDockProps = {
    onUp: () => void;
    onToggleAutoScroll?: () => void;
    autoScrollEnabled?: boolean;
    onMaximize?: () => void;
    onDown: () => void;
    gazeEnabled: boolean;
    gazeTimestamp: number;
};

const ContentScrollDock: React.FC<ScrollDockProps> = ({ onUp, onToggleAutoScroll, autoScrollEnabled = false, onMaximize, onDown, gazeEnabled, gazeTimestamp }) => {
    const hasMax = !!onMaximize;
    const hasAutoScroll = !!onToggleAutoScroll;
    const buttonStyle: React.CSSProperties = {
        width: '100%',
        flex: '1 1 0',
        minHeight: hasMax || hasAutoScroll ? 'clamp(86px, 10.5vh, 140px)' : 'clamp(120px, 16vh, 200px)',
        background: 'rgba(24, 29, 36, 0.78)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1.5px solid rgba(180, 195, 220, 0.18)',
        borderRadius: '20px',
        color: '#D8DEE6',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        cursor: 'pointer',
        fontFamily: FONT_PRIMARY,
        fontWeight: 720,
        fontSize: 'clamp(15px, 1.75vh, 21px)',
        letterSpacing: '0.05em',
        boxShadow: '0 10px 22px rgba(0,0,0,0.36)',
        transition: 'opacity 200ms ease, transform 150ms ease, background 150ms ease',
    };
    const iconSize = hasMax || hasAutoScroll ? 36 : 42;
    return (
        <div style={{
            flex: '0 0 clamp(150px, 12vw, 180px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(10px, 1.4vh, 18px)',
            paddingLeft: 'clamp(10px, 1vw, 16px)',
        }}>
            <GazeButton id="content-scroll-up" onClick={onUp}
                gazeEnabled={gazeEnabled} gazeEnabledTimestamp={gazeTimestamp} isDarkMode
                dwellCategory="navigationButton"
                style={buttonStyle}>
                <ArrowUpIcon size={iconSize} color="currentColor" strokeWidth={2.4} />
                <span>Up</span>
            </GazeButton>
            {onToggleAutoScroll && (
                <GazeButton id="content-auto-scroll" onClick={onToggleAutoScroll}
                    gazeEnabled={gazeEnabled} gazeEnabledTimestamp={gazeTimestamp} isDarkMode
                    dwellCategory="navigationButton"
                    style={{
                        ...buttonStyle,
                        color: autoScrollEnabled ? '#86F0D3' : '#D8DEE6',
                        borderColor: autoScrollEnabled ? 'rgba(134, 240, 211, 0.46)' : 'rgba(180, 195, 220, 0.18)',
                        background: autoScrollEnabled ? 'rgba(22, 96, 78, 0.36)' : buttonStyle.background,
                    }}>
                    <PointerIcon size={iconSize} color="currentColor" strokeWidth={2.3} />
                    <span>{autoScrollEnabled ? 'Scroll On' : 'Scroll'}</span>
                </GazeButton>
            )}
            {onMaximize && (
                <GazeButton id="content-maximize" onClick={onMaximize}
                    gazeEnabled={gazeEnabled} gazeEnabledTimestamp={gazeTimestamp} isDarkMode
                    dwellCategory="navigationButton"
                    style={{ ...buttonStyle, color: '#9DB7CC', borderColor: 'rgba(157, 183, 204, 0.36)' }}>
                    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 9V4h5" />
                        <path d="M20 9V4h-5" />
                        <path d="M4 15v5h5" />
                        <path d="M20 15v5h-5" />
                    </svg>
                    <span>Full Screen</span>
                </GazeButton>
            )}
            <GazeButton id="content-scroll-down" onClick={onDown}
                gazeEnabled={gazeEnabled} gazeEnabledTimestamp={gazeTimestamp} isDarkMode
                dwellCategory="navigationButton"
                style={buttonStyle}>
                <ArrowDownIcon size={iconSize} color="currentColor" strokeWidth={2.4} />
                <span>Down</span>
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
    letterSpacing: '0.05em',
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

const hiddenEmergencyButton = (): React.CSSProperties => ({
    ...hiddenBrowserButton(WEB_ACCENTS.maroonText, 'rgba(70, 31, 29, 0.82)', DANGER_BORDER),
    minWidth: 'clamp(178px, 13vw, 260px)',
    flex: '1.12 1 0',
    fontWeight: 900,
    letterSpacing: '0.12em',
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

const watchModeBadgeStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'clamp(10px, 1.3vh, 16px)',
    right: 'clamp(10px, 1.3vw, 18px)',
    zIndex: 7,
    pointerEvents: 'none',
    padding: '10px 14px',
    borderRadius: '999px',
    background: 'rgba(26, 35, 30, 0.88)',
    color: WATCH_MODE_TEXT,
    border: '1px solid rgba(220, 200, 155, 0.18)',
    fontSize: 'clamp(13px, 1.55vh, 17px)',
    fontWeight: 760,
    letterSpacing: '0.04em',
    boxShadow: '0 8px 18px rgba(0,0,0,0.18)',
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
                    minWidth: 'clamp(260px, 30vw, 380px)', cursor: 'pointer', transition: 'all 0.2s ease', gap: '12px'
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

// ── YOUTUBE PAGE CONTROL SCRIPTS (injected via webview.executeJs) ─────────
// Browser keyboard shortcuts ('f', 'l') require focus + user-gesture context
// that BrowserView doesn't reliably provide. JS injection with userGesture=true
// is the production AAC pattern (used by Tobii Computer Control + Grid 3
// browser overlays for in-page automation).
//
// v17.16 safety path: this maximizes YouTube inside the BrowserView, without
// entering true browser fullscreen. True fullscreen hides every gaze-accessible
// app control, so the injected cursor still auto-exits it if a page enters it.
const YT_MAXIMIZE_SCRIPT = `
(function () {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
  } catch (_) {}

  var styleId = 'gazeconnect-youtube-inapp-maximize-style';
  if (!document.getElementById(styleId)) {
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      'html.gazeconnect-youtube-inapp-maximize,',
      'html.gazeconnect-youtube-inapp-maximize body { overflow: hidden !important; }',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #masthead-container,',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #secondary,',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #comments,',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #meta,',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #ticket-shelf,',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #merch-shelf,',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy ytd-watch-next-secondary-results-renderer { display: none !important; }',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #columns,',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #primary,',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #primary-inner {',
      '  display: block !important; width: 100vw !important; max-width: none !important;',
      '  margin: 0 !important; padding: 0 !important;',
      '}',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #player,',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #player-container-outer,',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #player-container-inner,',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy #movie_player {',
      '  width: 100vw !important; max-width: none !important;',
      '  height: 100vh !important; max-height: none !important;',
      '  margin: 0 !important; padding: 0 !important;',
      '}',
      'html.gazeconnect-youtube-inapp-maximize ytd-watch-flexy video {',
      '  width: 100% !important; height: 100% !important; object-fit: contain !important;',
      '}'
    ].join('\\n');
    document.head.appendChild(style);
  }

  document.documentElement.classList.add('gazeconnect-youtube-inapp-maximize');
  var player = document.querySelector('#movie_player');
  if (player) {
    try {
      player.classList.add('ytp-big-mode');
      player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 30 }));
    } catch (_) {}
  }
  try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch (_) { window.scrollTo(0, 0); }
  return 'in-app-video-maximized';
})();
`;

const isValidYouTubeId = (id?: string) => !!id && /^[A-Za-z0-9_-]{11}$/.test(id);
// Use the YouTube WATCH URL (not embed). Embed URLs fail with Error 153 for many
// videos (T-Series, label music, news) because uploaders disable embedding.
// The watch URL works universally and plays inline (autoplay=1) inside the
// in-app BrowserView. Fullscreen is intentionally NOT triggered (v17.16
// safety path) — see YT_MAXIMIZE_SCRIPT above.
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

type ViewState = 'grid' | 'news' | 'youtube' | 'knowledge' | 'search' | 'whatsapp' | 'social';

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
    const T_pageBg = isLight ? '#F4EFE0' : isWarm ? warmScreenTokens.web.bg : isMix ? '#1A1611' : T.bg;
    const T_chromeBg = isLight ? '#FFFCF1' : isWarm ? warmScreenTokens.web.glass : isMix ? '#241F18' : T.glass;
    const T_chromeBorder = isLight ? 'rgba(168, 120, 56, 0.30)' : isWarm ? warmScreenTokens.web.glassBorder : isMix ? 'rgba(180, 147, 98, 0.28)' : T.cardBorder;
    const T_chromeText = isLight ? '#2E2A24' : isWarm ? warmScreenTokens.web.textMain : isMix ? '#FFFCF1' : T.textMain;
    const T_chromeTextMuted = isLight ? '#76624A' : isWarm ? warmScreenTokens.web.textSub : isMix ? '#C4B697' : T.textSub;
    const T_chromeShadow = isLight ? '0 4px 12px rgba(82, 66, 45, 0.10)' : isWarm ? '0 4px 12px rgba(122, 99, 71, 0.10)' : isMix ? '0 4px 14px rgba(0,0,0,0.32)' : '0 8px 18px rgba(0,0,0,0.16)';
    const T_chromePillSelected = isLight ? 'rgba(31, 107, 126, 0.16)' : isWarm ? warmScreenTokens.web.chromePillSelected : isMix ? 'rgba(180, 147, 98, 0.22)' : 'rgba(198, 154, 69, 0.16)';
    const T_chromePillSelectedBorder = isLight ? 'rgba(31, 107, 126, 0.34)' : isWarm ? warmScreenTokens.web.chromePillSelectedBorder : isMix ? 'rgba(180, 147, 98, 0.40)' : 'rgba(198, 154, 69, 0.34)';
    const T_chromePillSelectedText = isLight ? '#1F6B7E' : isWarm ? warmScreenTokens.web.chromePillSelectedText : isMix ? '#E3C28E' : '#F1E2C2';
    const T_chromeAccentLine = isLight ? '#1F6B7E' : isWarm ? warmScreenTokens.web.accentLine : isMix ? '#B49362' : '#C69A45';
    const [cat, setCat] = useState('positive_india');
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
    }, [browser]);

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
    const visibleItems = ws.newsItems.slice(0, cardCount) as NewsItem[];
    const activeAutoReadIndex = ws.newsItems.length ? autoReadIndex % ws.newsItems.length : -1;
    const sidebarVisibleCount = 5;
    const sidebarItems = ws.newsItems.slice(0, sidebarVisibleCount) as NewsItem[];
    // Note: sidebarVisibleCount caps how many items we pull from ws.newsItems;
    // we render only the items that actually exist so the available vertical
    // space is split across real headlines (no empty placeholder slots).
    const categoryIndex = Math.max(0, cats.findIndex((c: any) => c.id === cat));
    const currentCategory = cats[categoryIndex] || cats[0];
    const readerBodyRaw = readerData?.text || sel?.content || sel?.description || sel?.summary || '';
    const readableParagraphs = formatNewsAsReadableParagraphs(readerBodyRaw);

    if (sel) {
        // Simplified toolbar — embedded BrowserView removed (it crashed on open).
        // 5 essential actions: Close · Read · Read Full Story · Stop · Scroll.
        // All buttons sit in one connected container with internal dividers;
        // semantic roles: emergency=destructive, primary=open/scroll, secondary=TTS.
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
                    <div style={{ ...connectedToolbarStyle, flex: 1 }}>
                        <GazeButton id="n-close" onClick={() => { setSel(null); setReaderData(null); setReaderUrl(''); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                            style={{ ...toolbarBtnConnected('emergency', false, nextPos()), fontWeight: 800, letterSpacing: '0.08em' }}>
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
                            <BookIcon size={26} color="currentColor" strokeWidth={2.2} />
                            <span>Read Full Story</span>
                        </GazeButton>
                        <GazeButton id="n-stop" onClick={() => ws.stopSpeaking()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                            style={toolbarBtnConnected('emergency', false, nextPos())}>
                            <span>Stop</span>
                        </GazeButton>
                        <GazeButton id="n-scroll" onClick={() => scrollRef.current?.scrollBy({ top: 280, behavior: 'smooth' })} gazeEnabled={ige}
                            gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton" style={toolbarBtnConnected('primary', false, nextPos())}>
                            <ArrowDownIcon size={26} color="currentColor" strokeWidth={2.3} />
                            <span>Scroll</span>
                        </GazeButton>
                    </div>
                    {/* Cached chip — small status pill, sits outside the action toolbar
                        so it doesn't compete with the active buttons. */}
                    {ws.newsCached && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            minHeight: 'clamp(56px, 7vh, 80px)',
                            padding: '0 clamp(16px, 1.6vw, 24px)',
                            background: isLight ? 'rgba(31, 107, 126, 0.10)'
                                : isWarm ? 'rgba(79, 115, 136, 0.12)'
                                : isMix ? 'rgba(94, 156, 168, 0.20)'
                                : 'rgba(28, 47, 45, 0.55)',
                            border: `1.5px solid ${isLight ? 'rgba(31, 107, 126, 0.32)'
                                : isWarm ? 'rgba(79, 115, 136, 0.36)'
                                : isMix ? 'rgba(94, 156, 168, 0.42)'
                                : 'rgba(120, 157, 145, 0.36)'}`,
                            borderRadius: '14px',
                            color: isLight ? '#1F6B7E' : isWarm ? '#3D5E73' : isMix ? '#B6D7D1' : '#A9CAC7',
                            fontSize: 'clamp(14px, 1.7vh, 18px)',
                            fontWeight: 800,
                            letterSpacing: '0.08em',
                            fontFamily: FONT_PRIMARY,
                            flexShrink: 0,
                        }}>Cached</div>
                    )}
                </div>

                <div style={{ flex: 1, display: 'flex', gap: 'clamp(18px, 2.4vh, 28px)', overflow: 'hidden', minHeight: 0 }}>
                    <div style={{ width: 'clamp(340px, 29vw, 410px)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1.6vh, 18px)', overflow: 'hidden' }}>
                        <div style={{
                            ...cs,
                            height: 'auto',
                            minHeight: 'clamp(70px, 8vh, 92px)',
                            alignItems: 'stretch',
                            justifyContent: 'center',
                            padding: 'clamp(12px,1.4vh,16px)',
                            background: isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : T.cardBg,
                            border: isLight ? '1.5px solid rgba(168, 120, 56, 0.30)'
                                : isWarm ? '1px solid rgba(122, 99, 71, 0.16)'
                                : undefined,
                            boxShadow: isLight ? '0 4px 12px rgba(82, 66, 45, 0.10)'
                                : isWarm ? '0 1px 2px rgba(82, 65, 48, 0.05)'
                                : undefined,
                        }}>
                            <div style={{ fontSize: 'clamp(12px,1.35vh,14px)', color: isLight ? '#76624A' : isWarm ? '#6A625B' : 'rgba(173,194,214,0.75)', marginBottom: '6px', letterSpacing: '0.02em' }}>
                                CURRENT CATEGORY
                            </div>
                            <div style={{ fontSize: 'clamp(18px,2vh,22px)', fontWeight: 700, color: isLight ? '#2E2A24' : isWarm ? '#2F2A26' : T.textMain }}>
                                {stripLeadingEmoji(currentCategory?.label || 'Top Stories')}
                            </div>
                        </div>

                        {/* Sidebar list — only renders actual items (no dashed empty
                            placeholders). Items distribute across the available
                            vertical space via 1fr rows, so 3 items fill the panel
                            cleanly instead of stacking at the top with empty slots. */}
                        <div style={{
                            flex: 1,
                            display: 'grid',
                            gridTemplateRows: `repeat(${Math.max(1, sidebarItems.length)}, minmax(clamp(110px, 12vh, 150px), 1fr))`,
                            gap: 'clamp(12px, 1.4vh, 16px)',
                            overflow: 'hidden',
                            minHeight: 0,
                            alignContent: 'stretch',
                        }}>
                            {sidebarItems.map((it, i) => (
                                <GazeButton
                                    key={`${it.title}-${i}`}
                                    id={`ni-side-${i}`}
                                    onClick={() => selectItem(it)}
                                    gazeEnabled={ige}
                                    gazeEnabledTimestamp={ts}
                                    isDarkMode dwellCategory="navigationButton"
                                    style={{
                                        ...cs,
                                        alignItems: 'flex-start',
                                        justifyContent: 'space-between',
                                        padding: 'clamp(16px,1.9vh,22px) clamp(16px, 1.6vw, 22px)',
                                        minHeight: 'clamp(110px, 12vh, 150px)',
                                        background: sel.title === it.title
                                          ? (isLight ? 'rgba(31, 107, 126, 0.12)'
                                            : isWarm ? 'rgba(63, 105, 104, 0.14)'
                                            : 'rgba(56, 189, 248, 0.10)')
                                          : (isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : T.cardBg),
                                        border: sel.title === it.title
                                          ? (isLight ? '2px solid #1F6B7E'
                                            : isWarm ? '2px solid #3F6968'
                                            : `2px solid ${AC}90`)
                                          : (isLight ? '1.5px solid rgba(168, 120, 56, 0.22)'
                                            : isWarm ? '1px solid rgba(122, 99, 71, 0.16)'
                                            : CB),
                                        boxShadow: isLight ? '0 4px 12px rgba(82, 66, 45, 0.10)'
                                            : isWarm ? '0 1px 2px rgba(82, 65, 48, 0.05)'
                                            : undefined,
                                    }}
                                >
                                    <div style={{
                                        fontSize: 'clamp(16px,1.8vh,21px)',
                                        fontWeight: 700,
                                        color: isLight ? '#2E2A24' : isWarm ? '#2F2A26' : T.textMain,
                                        lineHeight: 1.32,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical' as const,
                                        overflow: 'hidden',
                                        textAlign: 'left',
                                        width: '100%',
                                    }}>
                                        {it.title}
                                    </div>
                                    <div style={{ fontSize: 'clamp(12px,1.25vh,15px)', color: isLight ? '#76624A' : isWarm ? '#8A7C6B' : 'rgba(153,175,198,0.78)', marginTop: 'clamp(8px, 1vh, 12px)', fontWeight: 600 }}>
                                        {it.source || 'News'} • {it.relative_time || 'Recent'}
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
                        <div ref={scrollRef} style={{
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
                                    <NewsIcon size={16} color="currentColor" strokeWidth={2.4} />
                                    <span>{sel.source || 'News'}</span>
                                </div>
                                <h2 style={{
                                    fontSize: 'clamp(32px, 4.4vh, 52px)',
                                    fontWeight: 760,
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
                                        fontFamily: "'Merriweather', 'Georgia', serif",
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
            paddingBottom: 'clamp(14px, 1.8vh, 24px)',
            overflow: 'hidden',
            background: T_pageBg,
        }}>
            {/* SIDEBAR — news categories. Mirrors YouTube sidebar grammar:
                wider chrome panel, larger icons (48px) inside dedicated icon
                zones, larger title fonts, accent line on selection, neutral
                hairline border at all times. Each category gets a small
                diversified accent in paper modes (visual variety like YT). */}
            <div style={{
                width: 'clamp(340px, 30vw, 440px)', flexShrink: 0,
                display: 'grid',
                gridAutoRows: 'minmax(clamp(110px, 12.5vh, 150px), 1fr)',
                gap: 'clamp(10px, 1.2vh, 16px)',
                background: T_chromeBg,
                border: `1.5px solid ${T_chromeBorder}`,
                borderRadius: '22px',
                padding: 'clamp(14px, 1.5vh, 20px)',
                overflow: 'hidden',
                boxShadow: T_chromeShadow,
            }}>
                {cats.map((c: any, ci: number) => {
                    const isSelected = cat === c.id;
                    // Rotating diversified accent — matches news-card palette pattern.
                    // 9 colors so even longer category lists stay visually distinct.
                    const PAPER_CAT_ACCENTS = [
                        '#7A312E', // maroon
                        '#4F7388', // sky blue
                        '#85703D', // gold
                        '#5F7C58', // sage
                        '#A56D55', // coral
                        '#3F6968', // teal
                        '#7A5638', // brown
                        '#65543E', // umber
                        '#6B5F84', // lavender
                    ];
                    const catAccent = (isLight || isWarm)
                        ? PAPER_CAT_ACCENTS[ci % PAPER_CAT_ACCENTS.length]
                        : '#789D91';
                    // Each sidebar item now has a full card surface (mirrors news-card
                    // grammar): cream card bg, tinted icon zone, accent border + lift
                    // on selection. Gives every item its own clickable identity.
                    const itemBg = isSelected
                        ? (isLight ? `${catAccent}14`
                            : isWarm ? `${catAccent}18`
                            : isMix ? `${catAccent}26`
                            : `${catAccent}1F`)
                        : (isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : isMix ? 'rgba(60, 48, 32, 0.40)' : 'rgba(213, 216, 188, 0.025)');
                    const itemBorder = isSelected
                        ? `2px solid ${catAccent}`
                        : (isLight ? '1.5px solid rgba(168, 120, 56, 0.22)'
                            : isWarm ? '1px solid rgba(122, 99, 71, 0.16)'
                            : isMix ? '1.5px solid rgba(180, 147, 98, 0.18)'
                            : '1.5px solid rgba(213, 216, 188, 0.08)');
                    const itemShadow = isSelected
                        ? (isLight || isWarm
                            ? `0 0 0 1px ${catAccent}22, 0 4px 14px rgba(82, 65, 48, 0.12)`
                            : `0 0 0 1px ${catAccent}44, inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 8px 20px rgba(0, 0, 0, 0.30)`)
                        : (isLight ? '0 1px 3px rgba(82, 66, 45, 0.06)'
                            : isWarm ? '0 1px 2px rgba(82, 65, 48, 0.04)'
                            : 'none');
                    const iconColor = catAccent;                // Always show category-distinct color (not muted on selected)
                    const iconZoneBg = (isLight || isWarm)
                        ? (isSelected ? `${catAccent}26` : `${catAccent}14`)
                        : (isSelected ? `${catAccent}33` : `${catAccent}1A`);
                    return (
                        <GazeButton key={c.id} id={`nc-${c.id}`} onClick={() => { setCat(c.id); disableGaze(); }}
                            gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            contentFill
                            style={{
                                width: '100%', height: '100%', minHeight: 0,
                                position: 'relative', overflow: 'hidden',
                                borderRadius: '18px',
                                background: itemBg,
                                border: itemBorder,
                                boxShadow: itemShadow,
                                display: 'flex', alignItems: 'stretch', justifyContent: 'flex-start',
                                gap: 0,
                                padding: 0,
                                fontFamily: FONT_PRIMARY,
                                textAlign: 'left',
                                transition: 'background 150ms ease, box-shadow 150ms ease',
                            }}>
                            {/* Icon zone — 30% width, tinted backdrop matches the
                                news-card pattern. Stronger tint when selected. */}
                            <div style={{
                                flex: '0 0 30%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: iconZoneBg,
                                borderRight: `1px solid ${catAccent}22`,
                                color: iconColor,
                            }}>
                                <NewsIcon size={isSelected ? 46 : 42} color="currentColor" strokeWidth={2.3} />
                            </div>
                            {/* Text zone — title + per-state subtitle (active dot when selected) */}
                            <div style={{
                                flex: '1 1 0', minWidth: 0,
                                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                padding: 'clamp(8px, 1vh, 14px) clamp(14px, 1.4vw, 20px) clamp(8px, 1vh, 14px) clamp(14px, 1.4vw, 20px)',
                                gap: 'clamp(4px, 0.6vh, 8px)',
                            }}>
                                <span style={{
                                    fontSize: 'clamp(20px, 2.4vh, 28px)',
                                    fontWeight: isSelected ? 820 : 720,
                                    color: isSelected ? catAccent : T_chromeText,
                                    lineHeight: 1.15,
                                    letterSpacing: '0.005em',
                                }}>
                                    {stripLeadingEmoji(c.label)}
                                </span>
                                {/* Subtitle / status line — accent-colored "Active" pip
                                    when selected, muted "Browse" hint otherwise. Gives
                                    each row a 2-line hierarchy (matches YouTube cards). */}
                                <span style={{
                                    fontSize: 'clamp(13px, 1.45vh, 17px)',
                                    fontWeight: isSelected ? 700 : 600,
                                    color: isSelected ? catAccent : (isLight ? '#76624A' : isWarm ? '#8A7C6B' : isMix ? 'rgba(196, 182, 151, 0.65)' : 'rgba(153, 175, 198, 0.65)'),
                                    fontFamily: FONT_PRIMARY,
                                    letterSpacing: '0.04em',
                                    textTransform: 'uppercase' as const,
                                    opacity: isSelected ? 1 : 0.75,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}>
                                    {isSelected && (
                                        <span style={{
                                            display: 'inline-block',
                                            width: '7px', height: '7px',
                                            borderRadius: '50%',
                                            background: catAccent,
                                            boxShadow: `0 0 6px ${catAccent}88`,
                                        }} />
                                    )}
                                    {isSelected ? 'Active' : 'Browse'}
                                </span>
                            </div>
                        </GazeButton>
                    );
                })}
            </div>

            {/* CONTENT — refresh header + article grid + reader controls strip */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1.4vh, 18px)', overflow: 'hidden', minHeight: 0 }}>
                {/* Refresh + Cached badge */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 'clamp(12px, 1.2vw, 18px)',
                    flexShrink: 0,
                }}>
                    <GazeButton id="n-ref" onClick={() => { setIsLoading(true); ws.refreshNews(cat, 9); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        style={{ ...toolbarBtn('secondary', false), minHeight: 'clamp(72px, 8.5vh, 96px)', minWidth: 'clamp(140px, 12vw, 180px)', fontSize: 'clamp(18px, 2.2vh, 24px)' }}>
                        <RefreshIcon size={26} color="currentColor" strokeWidth={2.3} />
                        <span>Refresh</span>
                    </GazeButton>
                    {ws.newsCached && (
                        <div style={{
                            minHeight: 'clamp(72px, 8.5vh, 96px)',
                            padding: '0 clamp(18px, 1.8vw, 26px)',
                            display: 'flex', alignItems: 'center',
                            color: isLight ? '#1F6B7E' : isWarm ? '#3F6968' : isMix ? '#B6D7D1' : '#A9CAC7',
                            border: `1px solid ${isLight ? 'rgba(31, 107, 126, 0.28)' : isWarm ? 'rgba(73, 119, 117, 0.28)' : 'rgba(169, 202, 199, 0.28)'}`,
                            background: isLight ? 'rgba(31, 107, 126, 0.10)' : isWarm ? 'rgba(73, 119, 117, 0.10)' : isMix ? 'rgba(28, 47, 45, 0.55)' : 'rgba(28, 47, 45, 0.42)',
                            borderRadius: '20px',
                            fontSize: 'clamp(15px, 1.8vh, 19px)',
                            fontFamily: FONT_PRIMARY,
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                        }}>Cached</div>
                    )}
                </div>

                {/* Article grid — restructured to mirror YouTube category card layout:
                    icon zone (28%) + text zone (72%) so news + YouTube share visual
                    grammar across the Web Browsing experience. Each card has a
                    diversified warm-muted accent in paper modes (per Home tile pattern). */}
                <div style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: isCompactGrid ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
                    gridAutoRows: 'minmax(0, 1fr)',
                    gap: 'clamp(14px, 1.6vh, 22px)',
                    overflow: 'hidden', minHeight: 0,
                }}>
                    {(visibleItems.length ? visibleItems : Array(cardCount).fill(null)).map((it: NewsItem | null, i: number) => {
                        // Rotating diversified accent palette for paper modes (matches Quick Search pattern)
                        const PAPER_NEWS_ACCENTS = [
                            '#7A312E', // deeper maroon
                            '#4F7388', // deeper sky blue
                            '#85703D', // deeper rich gold
                            '#5F7C58', // deeper sage
                            '#A56D55', // deeper coral
                            '#3F6968', // deeper teal
                            '#7A5638', // deeper warm brown
                            '#65543E', // deeper umber
                            '#6B5F84', // deeper lavender
                        ];
                        const cardBg = isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : isMix ? '#241F18' : '#20221E';
                        const cardBorder = autoReadOn && i === activeAutoReadIndex
                            ? `2px solid ${isLight || isWarm ? '#5F7C58' : '#789D91'}`
                            : isLight ? '1.5px solid rgba(168, 120, 56, 0.30)'
                            : isWarm ? '1px solid rgba(122, 99, 71, 0.16)'
                            : isMix ? '1.5px solid rgba(180, 147, 98, 0.28)'
                            : '1.5px solid rgba(213, 216, 188, 0.14)';
                        const cardShadow = autoReadOn && i === activeAutoReadIndex
                            ? (isLight || isWarm
                                ? '0 0 0 2px rgba(95, 124, 88, 0.20), 0 4px 12px rgba(82, 65, 48, 0.10)'
                                : '0 0 0 2px rgba(120, 157, 145, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)')
                            : isLight ? '0 4px 12px rgba(82, 66, 45, 0.10)'
                            : isWarm ? '0 1px 2px rgba(82, 65, 48, 0.05)'
                            : isMix ? 'inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 10px 22px rgba(0, 0, 0, 0.36)'
                            : 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)';
                        const accentColor = (isLight || isWarm)
                            ? PAPER_NEWS_ACCENTS[i % PAPER_NEWS_ACCENTS.length]
                            : '#789D91';
                        const titleColor = isLight ? '#2E2A24' : isWarm ? '#2F2A26' : isMix ? '#FFFCF1' : T.textMain;
                        const subtitleColor = isLight ? '#76624A' : isWarm ? '#6A625B' : isMix ? '#C4B697' : T.textSub;
                        const sourceBadgeBg = (isLight || isWarm) ? `${accentColor}1A` : 'rgba(213, 216, 188, 0.08)';
                        const sourceBadgeText = (isLight || isWarm) ? accentColor : titleColor;
                        const dividerColor = (isLight || isWarm) ? 'rgba(122, 99, 71, 0.16)' : 'rgba(213, 216, 188, 0.10)';
                        return (
                            <GazeButton key={it?.title || `ph-${i}`} id={`ni-${i}`} onClick={() => { if (it) selectItem(it); }}
                                gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                                contentFill
                                style={{
                                    width: '100%', height: '100%', minHeight: 0,
                                    background: cardBg,
                                    border: cardBorder,
                                    borderRadius: '26px',
                                    boxShadow: cardShadow,
                                    display: 'flex', flexDirection: 'row',
                                    alignItems: 'stretch',
                                    padding: 0,
                                    overflow: 'hidden',
                                    opacity: it ? 1 : 0.35,
                                    textAlign: 'left',
                                }}>
                                {/* Icon zone — fixed 28% width, accent-colored news icon
                                    on a tinted backdrop. Mirrors YouTube category-card pattern. */}
                                <div style={{
                                    flex: '0 0 28%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: (isLight || isWarm) ? `${accentColor}12` : 'rgba(15, 18, 16, 0.42)',
                                    borderRight: `1px solid ${dividerColor}`,
                                    color: accentColor,
                                }}>
                                    <NewsIcon size={56} color="currentColor" strokeWidth={2.2} />
                                </div>
                                {/* Content zone — title (3-line clamp) + source badge + relative time */}
                                <div style={{
                                    flex: '1 1 0', minWidth: 0,
                                    display: 'flex', flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    padding: 'clamp(18px, 2.2vh, 26px) clamp(20px, 1.8vw, 28px)',
                                    gap: 'clamp(10px, 1.2vh, 14px)',
                                }}>
                                    <div style={{
                                        fontSize: 'clamp(18px, 2.2vh, 26px)', fontWeight: 760,
                                        color: titleColor,
                                        fontFamily: FONT_PRIMARY, lineHeight: 1.28,
                                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const,
                                        overflow: 'hidden', width: '100%',
                                    }}>{it?.title || (isLoading ? 'Loading...' : 'No news available right now')}</div>
                                    {it && (
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            alignItems: 'center', width: '100%',
                                            fontSize: 'clamp(13px, 1.5vh, 17px)',
                                            color: subtitleColor,
                                            fontFamily: FONT_PRIMARY,
                                        }}>
                                            <span style={{
                                                background: sourceBadgeBg,
                                                color: sourceBadgeText,
                                                padding: '4px 12px', borderRadius: '10px',
                                                fontWeight: 700,
                                                border: (isLight || isWarm) ? `1px solid ${accentColor}33` : 'none',
                                            }}>{it.source}</span>
                                            <span>{it.relative_time}</span>
                                        </div>
                                    )}
                                </div>
                            </GazeButton>
                        );
                    })}
                </div>

                {/* Reader-controls strip — Auto-Read / Pause / Stop */}
                <div style={{
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
                        <span>{autoReadPaused ? 'Resume' : 'Pause'}</span>
                    </GazeButton>
                    <GazeButton id="n-stop-auto" onClick={stopAutoRead} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                        style={{ ...toolbarBtn('emergency', false), minHeight: 'clamp(86px, 10vh, 116px)', fontSize: 'clamp(19px, 2.3vh, 26px)', fontWeight: 800 }}>
                        <span>Stop</span>
                    </GazeButton>
                </div>
            </div>
        </div>
    );
};

// ── YOUTUBE PANEL ──
const YouTubePanel = ({ ige, ts, browser, gpRef, goBack: goGridBack, disableGaze, toggleGaze, isNavHidden, browserInteractionMode, onBrowserInteractionModeChange, onVideoActive, onNavHiddenToggle, onEmergency }: {
    ige: boolean; ts: number; browser: ReturnType<typeof useGazeBrowser>;
    gpRef: React.MutableRefObject<{ x: number; y: number }>;
    goBack: () => void;
    disableGaze: () => void;
    toggleGaze: () => void;
    isNavHidden?: boolean;
    browserInteractionMode: BrowserInteractionMode;
    onBrowserInteractionModeChange: (mode: BrowserInteractionMode) => void;
    onVideoActive?: (active: boolean) => void;
    onNavHiddenToggle?: (hidden: boolean) => void;
    onEmergency: () => void;
}) => {
    const { isLight, isMix, isWarm } = useTheme();
    // Theme-aware chrome tokens. The YouTube video card stays dark in all modes.
    const T_pageBg = isLight ? '#F4EFE0' : isWarm ? warmScreenTokens.web.bg : isMix ? '#1A1611' : T.bg;
    const T_chromeBg = isLight ? '#FFFCF1' : isWarm ? warmScreenTokens.web.glass : isMix ? '#241F18' : T.glass;
    const T_chromeBorder = isLight ? 'rgba(168, 120, 56, 0.30)' : isWarm ? warmScreenTokens.web.glassBorder : isMix ? 'rgba(180, 147, 98, 0.28)' : T.cardBorder;
    const T_chromeText = isLight ? '#2E2A24' : isWarm ? warmScreenTokens.web.textMain : isMix ? '#FFFCF1' : T.textMain;
    const T_chromeTextMuted = isLight ? '#76624A' : isWarm ? warmScreenTokens.web.textSub : isMix ? '#C4B697' : T.textSub;
    const T_chromeShadow = isLight ? '0 4px 12px rgba(82, 66, 45, 0.10)' : isWarm ? '0 4px 12px rgba(122, 99, 71, 0.10)' : isMix ? '0 4px 14px rgba(0,0,0,0.32)' : '0 8px 18px rgba(0,0,0,0.22)';
    // Watch / Control mode toggle: dark teal/maroon work fine on dark, but on
    // cream/walnut chrome they're too heavy — use tinted-but-transparent variants.
    const T_watchModeBg = isLight ? 'rgba(122, 54, 58, 0.14)' : isWarm ? warmScreenTokens.web.watchModeBg : isMix ? 'rgba(122, 54, 58, 0.30)' : WATCH_MODE_BG;
    const T_watchModeText = isLight ? '#8A3B38' : isWarm ? warmScreenTokens.web.watchModeText : isMix ? '#E9B9AE' : WATCH_MODE_TEXT;
    const T_controlModeBg = isLight ? 'rgba(31, 107, 126, 0.14)' : isWarm ? warmScreenTokens.web.controlModeBg : isMix ? 'rgba(31, 107, 126, 0.30)' : CONTROL_MODE_BG;
    const T_controlModeText = isLight ? '#1F6B7E' : isWarm ? warmScreenTokens.web.controlModeText : isMix ? '#A9CAC7' : CONTROL_MODE_TEXT;
    void T_chromeText; void T_chromeTextMuted; void T_watchModeBg; void T_watchModeText; void T_controlModeBg; void T_controlModeText;
    const [catId, setCatId] = useState('old_songs');
    const [playing, setPlaying] = useState<any>(null);
    const [youtubeState, setYoutubeState] = useState<string>('idle');
    const viewRef = useRef<HTMLDivElement>(null);
    const autoPlayUrlRef = useRef('');
    const cat = YT_CATS.find(c => c.id === catId) || YT_CATS[0];
    const toolbarGazeEnabled = isNavHidden ? true : ige;
    const toolbarGazeTimestamp = isNavHidden ? 0 : ts;
    const toolbarIconSize = isNavHidden ? 38 : browserToolbarIconSize;
    const isWatchMode = browserInteractionMode === 'watch';
    const currentBrowserUrl = browser.currentUrl || '';
    const isYouTubeWatchPage = /(?:youtube\.com\/(?:watch|shorts)|youtu\.be\/)/i.test(currentBrowserUrl);
    const isPlayableYouTubePage = isYouTubeWatchPage && ['playing', 'paused', 'ready', 'ad_waiting'].includes(youtubeState);
    const toggleBrowserInteractionMode = useCallback(() => {
        if (!isWatchMode && !isPlayableYouTubePage) return;
        onBrowserInteractionModeChange(isWatchMode ? 'control' : 'watch');
    }, [isPlayableYouTubePage, isWatchMode, onBrowserInteractionModeChange]);
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

    useEffect(() => {
        if (!playing) return;
        onBrowserInteractionModeChange(isPlayableYouTubePage ? 'watch' : 'control');
    }, [isPlayableYouTubePage, playing, onBrowserInteractionModeChange]);

    useEffect(() => {
        if (!playing || !browser.isOpen) {
            setYoutubeState('idle');
            return;
        }
        let cancelled = false;
        const poll = async () => {
            const result = await browser.youtubeCommand('get_state');
            if (!cancelled) setYoutubeState(result?.youtubeState || result?.detail || 'idle');
        };
        poll();
        const timer = setInterval(poll, 1200);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [browser.youtubeCommand, browser.isOpen, playing]);

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

    // Open BrowserView AFTER player div renders. Keep the page in control mode
    // while YouTube loads so the in-page gaze cursor can still recover/choose.
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

    // Maximizes the YouTube player inside the BrowserView while app controls
    // remain visible. This deliberately does not enter true browser fullscreen.
    const maximizeVideo = useCallback(async () => {
        await browser.executeJs(YT_MAXIMIZE_SCRIPT);
    }, [browser]);

    const skipYouTubeAd = useCallback(async () => {
        await browser.youtubeCommand('skip_ad');
        return;
        const findSkipButtonScript = `
          (function() {
            const player = document.querySelector('#movie_player') || document;
            const roots = [player, document];
            const selectors = [
              '.ytp-ad-skip-button',
              '.ytp-ad-skip-button-modern',
              '.ytp-skip-ad-button',
              '.ytp-ad-skip-button-container button',
              '.ytp-ad-preview-container button',
              '.videoAdUiSkipButton',
              'button[class*="skip" i]',
              '[role="button"][class*="skip" i]',
              'button[aria-label*="Skip" i]',
              '[role="button"][aria-label*="Skip" i]',
              '[title*="Skip" i]',
              '[data-title-no-tooltip*="Skip" i]'
            ];
            const seen = new Set();
            const isVisible = (el) => {
              if (!el || seen.has(el)) return false;
              seen.add(el);
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              return rect.width >= 12 && rect.height >= 12 &&
                style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                style.pointerEvents !== 'none' &&
                !el.disabled &&
                el.getAttribute('aria-disabled') !== 'true';
            };
            const normalizeTarget = (el) =>
              el && (el.closest('button, [role="button"], .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button') || el);
            const candidates = [];
            for (const root of roots) {
              for (const selector of selectors) {
                try {
                  root.querySelectorAll(selector).forEach((el) => candidates.push(normalizeTarget(el)));
                } catch (_) {}
              }
            }
            document.querySelectorAll('button, [role="button"], .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button')
              .forEach((el) => {
                const text = [
                  el.textContent || '',
                  el.getAttribute('aria-label') || '',
                  el.getAttribute('title') || ''
                ].join(' ').trim();
                if (/skip|छोड़|छोड|छोड़/i.test(text)) candidates.push(normalizeTarget(el));
              });
            for (const candidate of candidates) {
              if (!isVisible(candidate)) continue;
              const rect = candidate.getBoundingClientRect();
              return {
                found: true,
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
                label: (candidate.textContent || candidate.getAttribute('aria-label') || candidate.className || '').toString().slice(0, 80)
              };
            }
            return { found: false };
          })();
        `;
        const result = await browser.executeJs(findSkipButtonScript);
        const point = result?.result;
        if (point?.found && typeof point.x === 'number' && typeof point.y === 'number') {
            await browser.clickAtViewPoint(point.x, point.y);
        }
    }, [browser]);

    const playPauseYouTube = useCallback(async () => {
        const result = await browser.youtubeCommand('play_pause');
        if (!result?.ok) setYoutubeState(result?.youtubeState || result?.detail || 'error');
    }, [browser]);

    const nextYouTubeVideo = useCallback(async () => {
        const result = await browser.youtubeCommand('next');
        if (!result?.ok) setYoutubeState(result?.youtubeState || result?.status || 'ready');
    }, [browser]);

    const skipYouTubeAdReliable = useCallback(async () => {
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

    useBrowserViewBoundsSync(viewRef, browser.updateBounds, !!playing && browser.isOpen);

    const stop = useCallback(() => {
        void browser.resetBrowserSession('youtube-stop');
        setPlaying(null);
        setYoutubeState('idle');
        autoPlayUrlRef.current = '';
        onNavHiddenToggle?.(false);
        onBrowserInteractionModeChange('control');
    }, [browser.resetBrowserSession, onBrowserInteractionModeChange, onNavHiddenToggle]);

    // v17: Back button now navigates the BrowserView's history first.
    // If the patient watched videos A → B → C, "Back" walks back to B,
    // then A, then finally closes the YouTube panel when there's no
    // earlier page left. Previously this button immediately closed the
    // whole YouTube view, dropping the patient at YouTube's landing
    // screen on every press — confusing during a session.
    const handleYouTubeBack = useCallback(() => {
        if (browser.canGoBack) {
            void browser.goBack();
        } else {
            stop();
        }
    }, [browser.canGoBack, browser.goBack, stop]);

    const playbackState = browser.videoPlaybackState;

    if (playing) return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', padding: 'clamp(12px,1.5vh,20px)', gap: 'clamp(10px,1.2vh,16px)', overflow: 'hidden',
            marginTop: '0', transition: 'margin-top 0.3s ease',
            marginLeft: 'clamp(10px,1.5vw,20px)', marginRight: 'clamp(10px,1.5vw,20px)',
            paddingBottom: 'clamp(10px, 1.5vh, 20px)',
            background: T_pageBg,
        }}>
            {/* ── CONNECTED TOOLBAR — bi-modal + nav-aware (no duplicates with global nav) ── */}
            <div style={{ ...connectedToolbarStyle, flexShrink: 0 }}>
                {/* WATCH MODE — 3 buttons (Emergency · Pause/Play · Show Controls) */}
                {isWatchMode && <>
                    {isNavHidden && <GazeButton id="yt-emergency" onClick={onEmergency}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="medicalUrgent"
                        style={{ ...toolbarBtnConnected('emergency', !!isNavHidden, 'first'), fontWeight: 900, letterSpacing: '0.12em' }}>
                        <EmergencyIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Emergency</span>
                    </GazeButton>}
                    <GazeButton id="yt-watch-back" onClick={handleYouTubeBack}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="backSkipButton"
                        style={toolbarBtnConnected('primary', !!isNavHidden, isNavHidden ? 'middle' : 'first')}>
                        <BackIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Back</span>
                    </GazeButton>
                    <GazeButton id="yt-playpause" onClick={playPauseYouTube}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                        style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
                        <PlayIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Pause / Play</span>
                    </GazeButton>
                    <GazeButton id="yt-next" onClick={nextYouTubeVideo}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                        style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
                        <NextIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Next</span>
                    </GazeButton>
                    <GazeButton id="yt-show-controls" onClick={toggleBrowserInteractionMode}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                        style={toolbarBtnConnected('primary', !!isNavHidden, 'last')}>
                        <PointerIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.3} />
                        <span>Show Controls</span>
                    </GazeButton>
                </>}

                {/* CONTROL MODE — large AAC controls for reliable video use */}
                {!isWatchMode && <>
                    {isNavHidden && <GazeButton id="yt-emergency-c" onClick={onEmergency}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="medicalUrgent"
                        style={{ ...toolbarBtnConnected('emergency', !!isNavHidden, 'first'), fontWeight: 900, letterSpacing: '0.12em' }}>
                        <EmergencyIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Emergency</span>
                    </GazeButton>}
                    <GazeButton id="yt-back" onClick={isNavHidden ? handleYouTubeBack : stop}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="backSkipButton"
                        style={toolbarBtnConnected('primary', !!isNavHidden, isNavHidden ? 'middle' : 'first')}>
                        <BackIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>{isNavHidden ? 'Back' : 'Close'}</span>
                    </GazeButton>
                    <GazeButton id="yt-playpause-c" onClick={playPauseYouTube}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                        style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
                        <PlayIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Pause / Play</span>
                    </GazeButton>
                    <GazeButton id="yt-skip-ad" onClick={skipYouTubeAdReliable}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                        style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
                        <span>Skip Ad</span>
                    </GazeButton>
                    {isYouTubeWatchPage && isPlayableYouTubePage && <>
                        <GazeButton id="yt-hide-controls" onClick={toggleBrowserInteractionMode}
                            gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="backSkipButton"
                            style={toolbarBtnConnected('primary', !!isNavHidden, isNavHidden ? 'middle' : 'last')}>
                            <PlayIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.3} />
                            <span>Hide Controls</span>
                        </GazeButton>
                    </>}
                    {isNavHidden && <GazeButton id="yt-toggle-nav" onClick={() => onNavHiddenToggle?.(!isNavHidden)}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                        style={toolbarBtnConnected('primary', !!isNavHidden, 'last')}>
                        <WebLayoutIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.2} />
                        <span>Show Nav</span>
                    </GazeButton>}
                </>}
            </div>

            {/* Now-playing label */}
            {!isNavHidden && <div style={{ color: T_chromeTextMuted, fontSize: 'clamp(15px,1.85vh,19px)', padding: '0 8px', flexShrink: 0, fontWeight: 600, fontFamily: FONT_PRIMARY, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <YoutubeIcon size={18} color={isLight ? '#76624A' : '#789D91'} strokeWidth={2.2} />
                <b style={{ color: T_chromeText }}>{playing.title}</b>
                <span style={{ opacity: 0.7 }}>— {playing.ch}</span>
            </div>}

            {/* Content area: BrowserView (left) + ContentScrollDock (right gutter) */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', gap: 0 }}>
                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                    {isWatchMode && <div style={watchModeBadgeStyle}>WATCH MODE · page gaze paused</div>}
                    {playbackState.fullscreen && (
                        <div style={{
                            ...watchModeBadgeStyle,
                            left: '50%',
                            right: 'auto',
                            transform: 'translateX(-50%)',
                            background: 'rgba(16, 32, 31, 0.94)',
                            color: CONTROL_MODE_TEXT,
                            border: '1px solid rgba(169, 202, 199, 0.32)',
                        }}>
                            Exiting full screen / फुल स्क्रीन बंद हो रही है
                        </div>
                    )}
                    {!isWatchMode && browser.edgeScrollDirection === 'up' && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to bottom, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none', borderRadius: `${CR} ${CR} 0 0` }} />
                    )}
                    {!isWatchMode && browser.edgeScrollDirection === 'down' && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to top, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none', borderRadius: `0 0 ${CR} ${CR}` }} />
                    )}
                    <div ref={viewRef} style={{
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
                {/* Up / Max Video / Down dock — only in Control mode. The middle
                    button maximizes the video inside the BrowserView, without
                    entering true browser fullscreen. */}
                {!isWatchMode && (
                    <ContentScrollDock
                        onUp={() => browser.scrollUp()}
                        onToggleAutoScroll={() => browser.setScrollMode(browser.scrollMode === 'armed' ? 'off' : 'armed')}
                        autoScrollEnabled={browser.scrollMode === 'armed'}
                        onMaximize={isYouTubeWatchPage ? maximizeVideo : undefined}
                        onDown={() => browser.scrollDown()}
                        gazeEnabled={toolbarGazeEnabled}
                        gazeTimestamp={toolbarGazeTimestamp}
                    />
                )}
            </div>
        </div>
    );

    // ── LANDING: Sidebar (categories) + Thumbnail grid (Phrases pattern) ──
    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'row', gap: 'clamp(18px, 2vw, 28px)',
            padding: 'clamp(14px, 1.6vh, 22px) clamp(18px, 2vw, 28px)', overflow: 'hidden',
            paddingBottom: 'clamp(20px, 2.4vh, 32px)',
            background: T_pageBg,
        }}>
            {/* SIDEBAR — 4 large category buttons. Each card uses a distinct
                category icon (no more identical YouTube glyph everywhere) and
                a small subtitle for context. Phrases/Activities sidebar grammar:
                accent line + warm-gold tint on selection. */}
            <div style={{
                width: 'clamp(360px, 32vw, 460px)', flexShrink: 0,
                /* 4 cards with `1fr` each — they share the available container
                   height equally. With container ~840px (after top nav + padding),
                   each card gets ~190px. Min 130 prevents collapse on small screens. */
                display: 'grid', gridTemplateRows: 'repeat(4, minmax(clamp(130px, 16vh, 200px), 1fr))',
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
                    const SELECTED_ACCENT_DARK = '#9B7A38';           // Accent line + icon tint (deep antique gold) — dark mode
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
                    const subtitleColor = isSelected ? (isLight ? 'rgba(31, 107, 126, 0.72)' : isWarm ? 'rgba(73, 119, 117, 0.72)' : isMix ? 'rgba(227, 194, 142, 0.65)' : 'rgba(224, 205, 166, 0.58)') : UNSELECTED_SUBTITLE;
                    const meta = YT_CATEGORY_META[c.id] || { subtitle: '', renderIcon: () => <YoutubeIcon size={48} color={iconColor} strokeWidth={2.2} /> };
                    return (
                        <GazeButton key={c.id} id={`yc-${c.id}`} onClick={() => { setCatId(c.id); disableGaze(); }}
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
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))', gap: 'clamp(20px, 2.4vw, 32px)', overflow: 'hidden', minHeight: 0 }}>
                {cat.videos.slice(0, 4).map((v, i) => {
                    // Defensive lookup — `id` may or may not exist on a video entry.
                    // Search-query entries have no id; static-watch entries do.
                    const vid = (v as { id?: string; title: string; ch: string }).id;
                    const validId = isValidYouTubeId(vid);
                    const thumbUrl = validId ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg` : '';
                    return (
                        <GazeButton key={(vid || v.title || 'yv') + i} id={`yv-${i}`} onClick={() => { setPlaying(v); disableGaze(); }}
                            gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            contentFill
                            style={{
                                width: '100%', height: '100%', minHeight: 0,
                                background: isWarm ? '#FBF5E5' : '#20221E',
                                border: isWarm ? '1px solid rgba(122, 99, 71, 0.16)' : '1.5px solid rgba(213, 216, 188, 0.14)',
                                borderRadius: '26px',
                                boxShadow: isWarm ? '0 1px 2px rgba(82, 65, 48, 0.05)' : 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)',
                                overflow: 'hidden',
                                display: 'flex', flexDirection: 'column',
                                padding: 0,
                            }}>
                            {/* Thumbnail (top ~65%, 16:9) */}
                            <div style={{
                                position: 'relative',
                                width: '100%', flex: '0 0 65%',
                                background: isWarm ? '#EFE7D8' : '#0F100E',
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
                                    background: 'linear-gradient(135deg, rgba(28, 47, 45, 0.8), rgba(54, 42, 22, 0.8))',
                                    color: WEB_ACCENTS.tealText,
                                }}>
                                    <YoutubeIcon size={56} color="currentColor" strokeWidth={2.2} />
                                </div>
                                {/* Faint play-arrow overlay centered */}
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    pointerEvents: 'none',
                                }}>
                                    <div style={{
                                        width: 'clamp(54px, 7vh, 78px)', height: 'clamp(54px, 7vh, 78px)',
                                        borderRadius: '50%',
                                        background: 'rgba(15, 18, 16, 0.62)',
                                        backdropFilter: 'blur(2px)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        border: '1.5px solid rgba(245, 240, 220, 0.36)',
                                        color: '#F4EAD0',
                                    }}>
                                        <PlayIcon size={32} color="currentColor" strokeWidth={2.4} />
                                    </div>
                                </div>
                            </div>
                            {/* Title + channel */}
                            <div style={{
                                flex: '1 1 0', minHeight: 0,
                                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                padding: 'clamp(14px, 1.6vh, 22px) clamp(18px, 1.8vw, 26px)',
                                gap: '6px',
                                textAlign: 'left',
                            }}>
                                <div style={{
                                    fontSize: 'clamp(20px, 2.4vh, 28px)', fontWeight: 760, color: isWarm ? '#2F2A26' : T.textMain,
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
    const T_pageBg = isLight ? '#F4EFE0' : isWarm ? warmScreenTokens.web.bg : isMix ? '#1A1611' : T.bg;
    const T_chromeBg = isLight ? '#FFFCF1' : isWarm ? warmScreenTokens.web.glass : isMix ? '#241F18' : T.glass;
    const T_chromeBorder = isLight ? 'rgba(168, 120, 56, 0.30)' : isWarm ? warmScreenTokens.web.glassBorder : isMix ? 'rgba(180, 147, 98, 0.28)' : T.cardBorder;
    const T_chromeText = isLight ? '#2E2A24' : isWarm ? warmScreenTokens.web.textMain : isMix ? '#FFFCF1' : T.textMain;
    const T_chromeTextMuted = isLight ? '#76624A' : isWarm ? warmScreenTokens.web.textSub : isMix ? '#C4B697' : T.textSub;
    const T_chromeShadow = isLight ? '0 4px 12px rgba(82, 66, 45, 0.10)' : isWarm ? '0 4px 12px rgba(122, 99, 71, 0.10)' : isMix ? '0 4px 14px rgba(0,0,0,0.32)' : '0 8px 18px rgba(0,0,0,0.16)';
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
            <div ref={scrollRef} style={{
                ...cs, flex: 1, width: '100%', height: 'auto', alignItems: 'flex-start', justifyContent: 'flex-start',
                padding: 'clamp(24px,3.5vh,40px)', overflow: 'auto', minHeight: 0
            }}>
                <h2 style={{ fontSize: 'clamp(22px,3vh,32px)', fontWeight: 700, color: isWarm ? '#2F2A26' : T.textMain, margin: '0 0 10px 0', fontFamily: FONT_PRIMARY }}>{selArt.title}</h2>
                <div style={{ fontSize: 'clamp(16px,2.2vh,22px)', color: 'rgba(255,255,255,0.85)', lineHeight: 1.75, whiteSpace: 'pre-line' as const }}>{selArt.content}</div>
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
                                borderRadius: '0 14px 14px 0', border: 'none', minHeight: 'clamp(60px,7.5vh,78px)',
                                display: 'flex', alignItems: 'center', gap: '10px'
                            }}>
                            <BookIcon size={28} color={isSel ? selectedAccentLine : (isLight ? '#76624A' : isWarm ? '#7A5638' : WEB_ACCENTS.oliveText)} strokeWidth={2} />
                            <div>
                                <div style={{ fontSize: 'clamp(15px,1.8vh,19px)', fontWeight: 600, color: isSel ? selectedTextColor : T_chromeText }}>{c.title}</div>
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
const QuickSearchPanel = ({ ige, ts, browser, gpRef, goBack: goGridBack, disableGaze, toggleGaze, isNavHidden, browserInteractionMode, onBrowserInteractionModeChange, onTopicActive, onNavHiddenToggle, onEmergency, onSpeak }: {
    ige: boolean; ts: number; browser: ReturnType<typeof useGazeBrowser>; gpRef: React.MutableRefObject<{ x: number; y: number }>;
    goBack: () => void;
    disableGaze: () => void;
    toggleGaze: () => void;
    isNavHidden?: boolean;
    browserInteractionMode: BrowserInteractionMode;
    onBrowserInteractionModeChange: (mode: BrowserInteractionMode) => void;
    onTopicActive?: (active: boolean) => void;
    onNavHiddenToggle?: (hidden: boolean) => void;
    onEmergency: () => void;
    // v17.18: ALL speech must flow through App.handleSpeak so the routing
    // rules apply (volume-0 mute, TTS-health fallback, overlap cancel).
    onSpeak: (t: string) => void;
}) => {
    const ws = useWS();
    const { isLight, isMix, isWarm } = useTheme();
    // Theme-aware chrome tokens. Search-result / card-mode card stay dark.
    const T_pageBg = isLight ? '#F4EFE0' : isWarm ? warmScreenTokens.web.bg : isMix ? '#1A1611' : T.bg;
    const T_chromeBg = isLight ? '#FFFCF1' : isWarm ? warmScreenTokens.web.glass : isMix ? '#241F18' : T.glass;
    const T_chromeBorder = isLight ? 'rgba(168, 120, 56, 0.30)' : isWarm ? warmScreenTokens.web.glassBorder : isMix ? 'rgba(180, 147, 98, 0.28)' : T.cardBorder;
    const T_chromeText = isLight ? '#2E2A24' : isWarm ? warmScreenTokens.web.textMain : isMix ? '#FFFCF1' : T.textMain;
    const T_chromeTextMuted = isLight ? '#76624A' : isWarm ? warmScreenTokens.web.textSub : isMix ? '#C4B697' : T.textSub;
    const T_chromeShadow = isLight ? '0 4px 12px rgba(82, 66, 45, 0.10)' : isWarm ? '0 4px 12px rgba(122, 99, 71, 0.10)' : isMix ? '0 4px 14px rgba(0,0,0,0.32)' : '0 8px 18px rgba(0,0,0,0.16)';
    void T_chromeShadow;
    const [topic, setTopic] = useState<QuickTopic | null>(null);
    const [showLinksSidebar, setShowLinksSidebar] = useState(false);
    const [largeLinkTargets, setLargeLinkTargets] = useState(true);
    const [linkPage, setLinkPage] = useState(0);
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

    useEffect(() => {
        if (!topic || topic.mode !== 'web') return;
        let cancelled = false;
        const raf = requestAnimationFrame(() => {
            if (cancelled || !viewRef.current) return;
            const r = viewRef.current.getBoundingClientRect();
            if (r.width > 50 && r.height > 50) {
                browser.openPage(topic.url, {
                    x: Math.round(r.left),
                    y: Math.round(r.top),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                });
            }
        });
        return () => { cancelled = true; cancelAnimationFrame(raf); };
    }, [topic?.id, topic?.mode, topic?.url, isNavHidden]);

    useBrowserViewBoundsSync(viewRef, browser.updateBounds, isWebTopic && browser.isOpen);

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

    const linksPerPage = largeLinkTargets ? 4 : 6;
    const totalLinkPages = Math.max(1, Math.ceil(browser.pageLinks.length / linksPerPage));
    const currentLinkPage = Math.min(linkPage, totalLinkPages - 1);
    const visiblePageLinks = browser.pageLinks.slice(
        currentLinkPage * linksPerPage,
        currentLinkPage * linksPerPage + linksPerPage,
    );
    const canPageLinksBack = currentLinkPage > 0;
    const canPageLinksForward = currentLinkPage < totalLinkPages - 1;

    if (isWebTopic && topic) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T_pageBg, paddingBottom: 'clamp(10px, 1.5vh, 20px)' }}>
                {/* TOP REGION: Connected toolbar + status line */}
                <div style={{
                    flex: '0 0 auto', width: '100%',
                    display: 'flex', flexDirection: 'column',
                    padding: 'clamp(10px,1.2vh,16px) clamp(16px,2vw,24px) clamp(6px,0.8vh,10px)',
                    boxSizing: 'border-box', gap: '6px',
                }}>
                    <div style={connectedToolbarStyle}>
                        {/* READ MODE — minimal, nav-aware */}
                        {isWatchMode && <>
                            {isNavHidden && <GazeButton id="bv-emergency-r" onClick={onEmergency}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="medicalUrgent"
                                style={{ ...toolbarBtnConnected('emergency', !!isNavHidden, 'first'), fontWeight: 900, letterSpacing: '0.12em' }}>
                                <EmergencyIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                                <span>Emergency</span>
                            </GazeButton>}
                            <GazeButton id="bv-playpause-r" onClick={() => browser.typeText('k')}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                                style={toolbarBtnConnected('secondary', !!isNavHidden, isNavHidden ? 'middle' : 'first')}>
                                <PlayIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                                <span>Pause / Play</span>
                            </GazeButton>
                            <GazeButton id="bv-scroll-r" onClick={() => browser.setScrollMode(browser.scrollMode === 'armed' ? 'off' : 'armed')}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                                style={toolbarBtnConnected(browser.scrollMode === 'armed' ? 'secondary' : 'primary', !!isNavHidden, 'middle')}>
                                <PointerIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.3} />
                                <span>{browser.scrollMode === 'armed' ? 'Scroll On' : 'Scroll'}</span>
                            </GazeButton>
                            <GazeButton id="bv-show-controls" onClick={toggleBrowserInteractionMode}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'last')}>
                                <PointerIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.3} />
                                <span>Show Controls</span>
                            </GazeButton>
                        </>}

                        {/* CONTROL MODE — full toolset, no duplicates with global nav */}
                        {!isWatchMode && <>
                            {isNavHidden && <GazeButton id="bv-emergency-c" onClick={onEmergency}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="medicalUrgent"
                                style={{ ...toolbarBtnConnected('emergency', !!isNavHidden, 'first'), fontWeight: 900, letterSpacing: '0.12em' }}>
                                <EmergencyIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                                <span>Emergency</span>
                            </GazeButton>}
                            <GazeButton id="bv-back" onClick={isNavHidden ? handleBrowserBack : closeWebTopic}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="backSkipButton"
                                style={toolbarBtnConnected('primary', !!isNavHidden, isNavHidden ? 'middle' : 'first')}>
                                <BackIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                                <span>{isNavHidden ? 'Back' : 'Close'}</span>
                            </GazeButton>
                            <GazeButton id="bv-hide-controls" onClick={toggleBrowserInteractionMode}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="backSkipButton"
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'middle')}>
                                <BookIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.2} />
                                <span>Hide Controls</span>
                            </GazeButton>
                            <GazeButton id="bv-links-toggle" onClick={() => setShowLinksSidebar((s) => !s)}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                                style={toolbarBtnConnected('secondary', !!isNavHidden, isNavHidden ? 'middle' : 'last')}>
                                {showLinksSidebar ? <XIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.3} /> : <WebLayoutIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.1} />}
                                <span>{showLinksSidebar ? 'Hide Links' : 'Links'}</span>
                            </GazeButton>
                            {isNavHidden && <GazeButton id="bv-toggle-nav" onClick={() => { setShowLinksSidebar(false); onNavHiddenToggle?.(!isNavHidden); }}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode dwellCategory="navigationButton"
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'last')}>
                                <WebLayoutIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.1} />
                                <span>Show Nav</span>
                            </GazeButton>}
                        </>}
                    </div>
                    {/* Status line — small, low-noise */}
                    {!isNavHidden && <div style={{
                        fontSize: 'clamp(13px,1.5vh,16px)', color: T_chromeTextMuted,
                        padding: 'clamp(4px,0.5vh,6px) clamp(8px,1vw,12px)',
                        fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        width: '100%', boxSizing: 'border-box', fontFamily: FONT_PRIMARY,
                    }}>
                        {stripLeadingEmoji(topic.label)} · Zoom {browser.zoomFactor.toFixed(2)}x · {browser.pageLinks.length} links
                    </div>}
                </div>

                {/* BOTTOM REGION: optional Links sidebar + BrowserView + ContentScrollDock (right gutter) */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', width: '100%', padding: 'clamp(8px,1vh,14px) clamp(16px,2vw,24px) 0', boxSizing: 'border-box', gap: 'clamp(12px,1.5vw,20px)' }}>
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
                                    <WebLayoutIcon size={24} color={isLight ? '#76624A' : '#789D91'} strokeWidth={2.1} />
                                    <span>{largeLinkTargets ? 'Large Links' : 'Page Links'}</span>
                                </span>
                                <span style={{ fontSize: 'clamp(13px,1.5vh,16px)', color: T_chromeTextMuted, fontWeight: 700 }}>
                                    {currentLinkPage + 1}/{totalLinkPages}
                                </span>
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 'clamp(10px,1.2vh,14px)', minHeight: 0 }}>
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
                                                minHeight: largeLinkTargets ? 'clamp(88px,10.8vh,124px)' : 'clamp(80px,8.8vh,98px)',
                                                width: '100%',
                                                justifyContent: 'center',
                                                textAlign: 'center' as const,
                                                fontSize: largeLinkTargets ? 'clamp(18px,2.25vh,24px)' : 'clamp(16px,2vh,21px)',
                                                lineHeight: 1.14,
                                                fontWeight: 820,
                                                padding: 'clamp(10px,1.2vh,16px) clamp(12px,1vw,18px)',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{link.text}</span>
                                        </GazeButton>
                                    );
                                }) : (
                                    <div style={{
                                        color: isLight ? 'rgba(74, 58, 42, 0.65)' : isMix ? 'rgba(196, 182, 151, 0.65)' : 'rgba(255,255,255,0.5)',
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
                                    <NextIcon size={24} color="currentColor" strokeWidth={2.3} />
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
                        {isWatchMode && <div style={watchModeBadgeStyle}>READ MODE · page gaze paused</div>}
                        {!isWatchMode && browser.edgeScrollDirection === 'up' && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to bottom, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none' }} />
                        )}
                        {!isWatchMode && browser.edgeScrollDirection === 'down' && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to top, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none' }} />
                        )}
                        <div ref={viewRef} style={{
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
                        onUp={() => browser.scrollUp()}
                        onToggleAutoScroll={() => browser.setScrollMode(browser.scrollMode === 'armed' ? 'off' : 'armed')}
                        autoScrollEnabled={browser.scrollMode === 'armed'}
                        onDown={() => browser.scrollDown()}
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

        const cardBody = (() => {
            if (topic.id === 'local_weather') {
                if (!weather?.ok) return 'Weather data unavailable right now.';
                return [
                    `Temperature: ${weather.temp_c ?? '-'} C`,
                    `Feels Like: ${weather.feels_like_c ?? '-'} C`,
                    `Condition: ${weather.condition || 'Unknown'}`,
                    `Humidity: ${weather.humidity ?? '-'}%`,
                    `Wind: ${weather.wind_kph ?? '-'} km/h`,
                ].join('\n');
            }
            if (topic.id === 'cricket_score') {
                if (!cricket?.ok) return 'Cricket update unavailable right now.';
                return [
                    cricket.match || 'Cricket Match',
                    cricket.summary || '',
                    `Status: ${cricket.status || 'Update available'}`,
                    cricket.venue ? `Venue: ${cricket.venue}` : '',
                ].filter(Boolean).join('\n');
            }
            return 'No quick data available.';
        })();

        return (
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', padding: GAP, gap: GAP, overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)',
                background: T_pageBg,
            }}>
                <div style={{ display: 'flex', gap: 'clamp(14px,2vw,24px)', flexWrap: 'wrap' }}>
                    <GazeButton id="qs-card-back" onClick={() => { setTopic(null); disableGaze(); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                        style={actionButton(DANGER, 'rgba(60, 34, 32, 0.72)', DANGER_BORDER)}>
                        <BackIcon size={26} color="currentColor" strokeWidth={2.4} />
                        <span>Back</span>
                    </GazeButton>
                    <GazeButton id="qs-card-refresh" onClick={() => ws.getQuickSnapshot(true)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        style={actionButton(INFO)}>
                        <RefreshIcon size={24} color="currentColor" strokeWidth={2.3} />
                        <span>Refresh Data</span>
                    </GazeButton>
                    <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}
                    <GazeButton id="qs-card-open-web" onClick={openLiveWebFromCard} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        style={actionButton(SUCCESS, 'rgba(36, 48, 32, 0.70)', SUCCESS_BORDER)}>
                        <ExternalIcon size={26} color="currentColor" strokeWidth={2.3} />
                        <span>Open Live Web</span>
                    </GazeButton>
                    <GazeButton id="qs-card-read" onClick={speakCardSummary} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="phraseButton"
                        style={actionButton(TL, 'rgba(28, 47, 45, 0.72)', SOFT_INFO_BORDER)}>
                        <SpeakIcon size={26} color="currentColor" strokeWidth={2.3} />
                        <span>Read Answer Aloud</span>
                    </GazeButton>
                    {isCached && (
                        <div style={{ ...cb, color: STATUS, borderColor: STATUS_BORDER, background: 'rgba(16, 67, 93, 0.22)' }}>
                            Cached
                        </div>
                    )}
                </div>

                <div style={{
                    ...cs,
                    flex: 1,
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                    padding: 'clamp(34px, 4.5vh, 58px)',
                    overflow: 'auto',
                    whiteSpace: 'pre-line' as const,
                }}>
                    <div style={{ fontSize: 'clamp(30px,4.2vh,46px)', fontWeight: 700, color: isWarm ? '#2F2A26' : T.textMain, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {renderQuickTopicIcon(topic.id, 52, WEB_ACCENTS.tealText)}
                        <span>{stripLeadingEmoji(topic.label)}</span>
                    </div>
                    <div style={{ fontSize: 'clamp(22px,3vh,34px)', color: 'rgba(255,255,255,0.92)', lineHeight: 1.8 }}>
                        {cardBody}
                    </div>
                    {!snapshot && (
                        <div style={{ marginTop: '30px', fontSize: 'clamp(18px,2.4vh,26px)', color: 'rgba(255,255,255,0.55)' }}>
                            Loading data...
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── LANDING: 2-col × 4-row grid of large icon-left cards (Web Browsing landing pattern) ──
    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            padding: 'clamp(14px, 1.6vh, 22px) clamp(28px, 3vw, 56px)',
            paddingBottom: 'clamp(14px, 1.8vh, 24px)',
            gap: 'clamp(14px, 1.8vh, 24px)',
            background: T_pageBg,
        }}>
            <div style={{
                color: T_chromeText, fontSize: 'clamp(30px, 3.8vh, 42px)', fontWeight: 820,
                flexShrink: 0, fontFamily: FONT_PRIMARY, letterSpacing: '0.02em',
                display: 'flex', alignItems: 'center', gap: 'clamp(14px, 1.4vw, 20px)',
                paddingBottom: 'clamp(6px, 0.8vh, 12px)',
            }}>
                <SearchIcon size={44} color={isLight ? '#4F7388' : isWarm ? '#4F7388' : '#789D91'} strokeWidth={2.4} />
                <span>Quick Search</span>
            </div>
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gridAutoRows: 'minmax(clamp(140px, 17vh, 200px), 1fr)',
                gap: 'clamp(18px, 2.2vh, 28px) clamp(22px, 2.6vw, 40px)',
                overflow: 'hidden', minHeight: 0,
            }}>
                {QUICK_TOPICS.map((t, ti) => {
                    const tileBg = isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : isMix ? '#241F18' : '#20221E';
                    const tileBorder = isLight
                        ? '1.5px solid rgba(168, 120, 56, 0.30)'
                        : isWarm ? '1px solid rgba(122, 99, 71, 0.16)'
                        : isMix ? '1.5px solid rgba(180, 147, 98, 0.28)'
                        : '1.5px solid rgba(213, 216, 188, 0.14)';
                    const tileShadow = isLight
                        ? '0 4px 12px rgba(82, 66, 45, 0.10)'
                        : isWarm
                            ? '0 1px 2px rgba(82, 65, 48, 0.05)'
                            : isMix
                                ? 'inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 10px 22px rgba(0, 0, 0, 0.36)'
                                : 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)';
                    // Each Quick Search topic gets a distinct warm-muted accent — diversifies
                    // colors across the grid for visual variety (matches Home tile pattern).
                    const PAPER_TOPIC_ACCENTS = [
                        '#7A312E', // deeper maroon
                        '#4F7388', // deeper sky blue
                        '#85703D', // deeper rich gold
                        '#5F7C58', // deeper sage
                        '#A56D55', // deeper coral
                        '#3F6968', // deeper teal
                        '#7A5638', // deeper warm brown
                        '#65543E', // deeper umber
                    ];
                    const iconColor = (isLight || isWarm)
                        ? PAPER_TOPIC_ACCENTS[ti % PAPER_TOPIC_ACCENTS.length]
                        : '#789D91';
                    const labelColor = isLight ? '#2E2A24' : isWarm ? '#2F2A26' : isMix ? '#FFFCF1' : '#ECEDE3';
                    // Icon zone gets a subtle tinted backdrop in paper modes so the
                    // colorful icon reads as a "category badge" (YouTube card grammar).
                    const iconZoneBg = (isLight || isWarm) ? `${iconColor}12` : 'transparent';
                    const iconZoneDivider = (isLight || isWarm) ? `1px solid ${iconColor}22` : 'none';
                    return (
                        <GazeButton key={t.id} id={`qs-${t.id}`} onClick={() => openTopic(t)}
                            gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            contentFill
                            style={{
                                width: '100%', height: '100%', minHeight: 0,
                                background: tileBg,
                                border: tileBorder,
                                borderRadius: '28px',
                                boxShadow: tileShadow,
                                display: 'flex', flexDirection: 'row', alignItems: 'stretch',
                                position: 'relative',
                                padding: 0, overflow: 'hidden',
                            }}>
                            {/* Icon zone — 28% width, tinted backdrop in paper modes,
                                large 88px icon for clear scanning at distance
                                (YouTube category-card grammar). */}
                            <div style={{
                                flex: '0 0 28%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: iconZoneBg,
                                borderRight: iconZoneDivider,
                                color: iconColor,
                            }}>
                                {renderQuickTopicIcon(t.id, 88, iconColor)}
                            </div>
                            <div style={{
                                flex: '1 1 0', minWidth: 0,
                                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start',
                                padding: 'clamp(18px,2.2vh,28px) clamp(24px,2.8vw,42px) clamp(18px,2.2vh,28px) clamp(20px,2vw,30px)',
                                gap: 'clamp(4px, 0.6vh, 8px)',
                            }}>
                                <span style={{
                                    fontSize: 'clamp(28px, 3.4vh, 40px)', fontWeight: 820, color: labelColor,
                                    fontFamily: FONT_PRIMARY, lineHeight: 1.08, letterSpacing: '0.005em',
                                }}>{stripLeadingEmoji(t.label)}</span>
                                {/* Subtitle — per-topic caption (mirrors YT card subtitle). */}
                                <span style={{
                                    fontSize: 'clamp(15px, 1.75vh, 20px)',
                                    fontWeight: 600,
                                    color: (isLight || isWarm) ? iconColor : (isMix ? '#C4B697' : '#789D91'),
                                    fontFamily: FONT_PRIMARY,
                                    letterSpacing: '0.02em',
                                    opacity: 0.9,
                                }}>{QUICK_TOPIC_SUBTITLES[t.id] || ''}</span>
                            </div>
                        </GazeButton>
                    );
                })}
            </div>
        </div>
    );
};

// ── WHATSAPP PANEL ──
const WhatsAppPanel = ({ ige, ts, browser, gpRef, goBack: goGridBack, isNavHidden }: {
    ige: boolean; ts: number; browser: ReturnType<typeof useGazeBrowser>; gpRef: React.MutableRefObject<{ x: number; y: number }>;
    goBack: () => void;
    isNavHidden?: boolean;
}) => {
    const { isLight, isMix, isWarm } = useTheme();
    // Theme-aware chrome tokens. The chat / message-list card stays dark.
    const T_pageBg = isLight ? '#F4EFE0' : isWarm ? warmScreenTokens.web.bg : isMix ? '#1A1611' : T.bg;
    const T_chromeText = isLight ? '#2E2A24' : isWarm ? warmScreenTokens.web.textMain : isMix ? '#FFFCF1' : T.textMain;
    const T_chromeTextMuted = isLight ? '#76624A' : isWarm ? warmScreenTokens.web.textSub : isMix ? '#C4B697' : T.textSub;
    void T_chromeText; void T_chromeTextMuted;
    const [connected, setConnected] = useState(false);
    const viewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!connected) return;
        let cancelled = false;
        const raf = requestAnimationFrame(() => {
            if (cancelled || !viewRef.current) return;
            const r = viewRef.current.getBoundingClientRect();
            if (r.width > 50 && r.height > 50)
                browser.openPage('https://web.whatsapp.com', { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
        });
        return () => { cancelled = true; cancelAnimationFrame(raf); };
    }, [connected]);

    useBrowserViewBoundsSync(viewRef, browser.updateBounds, connected && browser.isOpen);

    // Gaze cursor forwarding handled centrally by main component

    const close = useCallback(() => { browser.closePage(); setConnected(false); }, [browser]);

    if (connected) return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)',
            background: T_pageBg,
        }}>
            {/* ── HORIZONTAL TOOLBAR ── */}
            <div style={{ ...toolbarStyle, flexShrink: 0 }}>
                <GazeButton id="bv-close" onClick={close} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                    style={{
                        ...actionButton(DANGER, 'rgba(60, 34, 32, 0.72)', DANGER_BORDER), flex: 1, minWidth: 'clamp(100px,10vw,140px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>
                    <XIcon size={26} color="currentColor" strokeWidth={2.4} />
                    <span>Close</span>
                </GazeButton>
                <GazeButton id="bv-click" onClick={() => browser.clickAtGaze(gpRef.current.x, gpRef.current.y)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                    style={{
                        ...actionButton(WEB_ACCENTS.tealText, 'rgba(28, 47, 45, 0.72)', SOFT_INFO_BORDER), flex: 1.2, minWidth: 'clamp(120px,12vw,160px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>
                    <PointerIcon size={28} color="currentColor" strokeWidth={2.2} />
                    <span>Click Here</span>
                </GazeButton>
                <GazeButton id="bv-up" onClick={() => browser.scrollUp()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                    style={{
                        ...actionButton(WEB_ACCENTS.blueText), flex: 1, minWidth: 'clamp(100px,10vw,130px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>
                    <ArrowUpIcon size={26} color="currentColor" strokeWidth={2.3} />
                    <span>Up</span>
                </GazeButton>
                <GazeButton id="bv-down" onClick={() => browser.scrollDown()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                    style={{
                        ...actionButton(WEB_ACCENTS.blueText), flex: 1, minWidth: 'clamp(100px,10vw,130px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>
                    <ArrowDownIcon size={26} color="currentColor" strokeWidth={2.3} />
                    <span>Down</span>
                </GazeButton>

                <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}

                <GazeButton id="bv-back" onClick={() => browser.canGoBack && browser.goBack()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                    disabled={!browser.canGoBack}
                    style={{
                        ...actionButton(WEB_ACCENTS.goldText, 'rgba(49, 36, 20, 0.72)', 'rgba(178, 138, 69, 0.22)'), flex: 1, minWidth: 'clamp(80px,8vw,110px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>
                    <BackIcon size={26} color="currentColor" strokeWidth={2.4} />
                    <span>Back</span>
                </GazeButton>
                <GazeButton id="bv-fwd" onClick={() => browser.canGoForward && browser.goForward()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                    disabled={!browser.canGoForward}
                    style={{
                        ...actionButton(WEB_ACCENTS.blueText), flex: 1, minWidth: 'clamp(80px,8vw,110px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>
                    <ExternalIcon size={24} color="currentColor" strokeWidth={2.2} />
                    <span>Fwd</span>
                </GazeButton>
            </div>
            <div style={{
                fontSize: 'clamp(15px,1.8vh,18px)', color: isLight ? '#4F6B3F' : isMix ? '#A8BC8E' : WEB_ACCENTS.oliveText, padding: 'clamp(6px,1vh,10px) clamp(14px,2vw,24px)',
                flexShrink: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px'
            }}>
                <WhatsAppIcon size={20} color="currentColor" strokeWidth={2} />
                <span>WhatsApp Web. Scan QR from your phone to connect.</span>
            </div>
            <div style={{ flex: 1, padding: '0 clamp(14px,2vw,24px) clamp(10px,1.5vh,16px)', overflow: 'hidden', minHeight: 0 }}>
                <div ref={viewRef} style={{
                    width: '100%', height: '100%', borderRadius: CR, overflow: 'hidden', background: '#111B21',
                    border: WEB_SURFACE.borderSoft, boxShadow: WEB_SURFACE.panelShadow
                }}>
                    <div style={{
                        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(255,255,255,0.3)', fontSize: '15px', gap: '8px'
                    }}>{browser.loading ? 'Loading WhatsApp...' : <><WhatsAppIcon size={18} color="currentColor" strokeWidth={2} /> WhatsApp loaded</>}</div>
                </div>
            </div>
        </div>
    );

    return (
        <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: GAP,
            marginTop: isNavHidden ? '0' : 'clamp(95px,12.5vh,125px)', paddingBottom: 'clamp(20px, 2.5vh, 40px)', transition: 'margin-top 0.3s ease',
            background: T_pageBg,
        }}>
            <div style={{ ...cs, width: 'clamp(420px,42vw,620px)', height: 'auto', padding: 'clamp(40px,5.5vh,65px)', gap: 'clamp(20px,3.2vh,36px)', border: WEB_SURFACE.borderSoft }}>
                <div style={{ color: WEB_ACCENTS.oliveText, display: 'flex', filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.25))' }}><WhatsAppIcon size={88} /></div>
                <h2 style={{ fontSize: 'clamp(24px,3.2vh,34px)', fontWeight: 700, color: isWarm ? '#2F2A26' : T.textMain, margin: 0, fontFamily: FONT_PRIMARY }}>WhatsApp Web</h2>
                <p style={{ fontSize: 'clamp(15px,2vh,19px)', color: isWarm ? '#6A625B' : 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0, textAlign: 'center', maxWidth: '420px' }}>
                    Connect WhatsApp to send messages using eye gaze. Scan a QR code with your phone.
                </p>
                <GazeButton id="wa-connect" onClick={() => setConnected(true)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                    style={{
                        ...actionButton(WEB_ACCENTS.oliveText, 'rgba(36, 48, 32, 0.70)', SUCCESS_BORDER),
                        padding: 'clamp(18px,2.4vh,26px) clamp(40px,5.5vw,60px)', fontSize: 'clamp(17px,2.2vh,22px)', fontWeight: 700, borderRadius: '50px'
                    }}>
                    Open WhatsApp Web
                </GazeButton>
            </div>
        </div>
    );
};

// ── SOCIAL PANEL ──
const SocialPanel = ({ ige, ts, browser, gpRef, goBack, disableGaze, isNavHidden, setView }: {
    ige: boolean, ts: number, browser: any, gpRef: React.MutableRefObject<{ x: number; y: number }>, goBack: () => void, disableGaze: () => void, isNavHidden: boolean, setView?: (view: any) => void
}) => {
    const { isLight, isMix, isWarm } = useTheme();
    // Theme-aware chrome tokens. The browser-view content card stays dark.
    const T_pageBg = isLight ? '#F4EFE0' : isWarm ? warmScreenTokens.web.bg : isMix ? '#1A1611' : T.bg;
    const T_chromeBorder = isLight ? 'rgba(168, 120, 56, 0.30)' : isWarm ? warmScreenTokens.web.glassBorder : isMix ? 'rgba(180, 147, 98, 0.28)' : T.cardBorder;
    const T_chromeText = isLight ? '#2E2A24' : isWarm ? warmScreenTokens.web.textMain : isMix ? '#FFFCF1' : T.textMain;
    const T_chromeShadow = isLight ? '0 4px 12px rgba(82, 66, 45, 0.10)' : isWarm ? '0 4px 12px rgba(122, 99, 71, 0.10)' : isMix ? '0 4px 14px rgba(0,0,0,0.32)' : 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)';
    const [topic, setTopic] = useState<{ id: string, url: string, label: string } | null>(null);
    const viewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!topic) return;
        let cancelled = false;
        const raf = requestAnimationFrame(() => {
            if (cancelled) return;
            if (viewRef.current) {
                const r = viewRef.current.getBoundingClientRect();
                browser.openPage(topic.url, {
                    x: Math.round(r.left),
                    y: Math.round(r.top),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                });
            }
        });
        return () => { cancelled = true; cancelAnimationFrame(raf); };
    }, [topic?.id, topic?.url, isNavHidden, browser]);

    useBrowserViewBoundsSync(viewRef, browser.updateBounds, !!topic && browser.isOpen);

    // Reuse the QuickSearchPanel browser layout when a topic is selected
    if (topic && browser.isOpen) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T_pageBg, paddingBottom: 'clamp(20px, 2.5vh, 40px)' }}>
                <div style={{
                    flex: '0 0 clamp(170px, 20vh, 220px)', width: '100%',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    padding: '0 clamp(16px,2vw,24px)', boxSizing: 'border-box'
                }}>
                    <div style={toolbarStyle}>
                        <GazeButton id="soc-close" onClick={() => { browser.closePage(); setTopic(null); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                            style={{ ...browserToolbarButton(DANGER, 'rgba(60, 34, 32, 0.72)', DANGER_BORDER), flex: 1 }}>
                            <XIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.4} />
                            <span>Close</span>
                        </GazeButton>
                        <GazeButton id="soc-click" onClick={() => browser.clickAtGaze(gpRef.current.x, gpRef.current.y)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            style={{ ...browserToolbarButton(WEB_ACCENTS.tealText, 'rgba(28, 47, 45, 0.72)', SOFT_INFO_BORDER), flex: 1 }}>
                            <PointerIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.2} />
                            <span>Click Here</span>
                        </GazeButton>
                        <GazeButton id="soc-up" onClick={() => browser.scrollUp()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            style={{ ...browserToolbarButton(WEB_ACCENTS.blueText), flex: 1 }}>
                            <ArrowUpIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.3} />
                            <span>Up</span>
                        </GazeButton>
                        <GazeButton id="soc-down" onClick={() => browser.scrollDown()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            style={{ ...browserToolbarButton(WEB_ACCENTS.blueText), flex: 1 }}>
                            <ArrowDownIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.3} />
                            <span>Down</span>
                        </GazeButton>

                        <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}

                        <GazeButton id="soc-back" onClick={() => browser.goBack()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="backSkipButton"
                            style={{ ...browserToolbarButton(WEB_ACCENTS.goldText, 'rgba(49, 36, 20, 0.72)', 'rgba(178, 138, 69, 0.22)'), flex: 1 }}>
                            <BackIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.4} />
                            <span>{browser.canGoBack ? 'Back' : 'Exit'}</span>
                        </GazeButton>
                        <GazeButton id="soc-zoom-in" onClick={() => browser.adjustZoom(0.25)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            style={{ ...browserToolbarButton(SOFT_INFO), minWidth: 'clamp(92px,7vw,118px)' }}>
                            <ZoomIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.2} direction="in" />
                            <span>+</span>
                        </GazeButton>
                        <GazeButton id="soc-zoom-out" onClick={() => browser.adjustZoom(-0.25)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            style={{ ...browserToolbarButton(SOFT_INFO), minWidth: 'clamp(92px,7vw,118px)' }}>
                            <ZoomIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.2} direction="out" />
                            <span>-</span>
                        </GazeButton>
                    </div>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', width: '100%', padding: 'clamp(12px,1.5vh,20px) clamp(16px,2vw,24px)', boxSizing: 'border-box' }}>
                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                        {browser.edgeScrollDirection === 'up' && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to bottom, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 6, pointerEvents: 'none', borderRadius: '16px 16px 0 0' }} />
                        )}
                        {browser.edgeScrollDirection === 'down' && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to top, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 6, pointerEvents: 'none', borderRadius: '0 0 16px 16px' }} />
                        )}
                        <div style={{ position: 'absolute', inset: 0, border: '4px solid rgba(45, 212, 191, 0.4)', borderRadius: '16px', zIndex: 5, pointerEvents: 'none' }} />
                        <div id="browser-view-container" ref={viewRef} style={{ width: '100%', height: '100%', background: '#fff', borderRadius: '16px', overflow: 'hidden' }} />
                    </div>
                </div>
            </div>
        );
    }

    const socialCards = [
        {
            id: 'linkedin',
            label: 'LinkedIn',
            accent: WEB_ACCENTS.blueText,
            bg: 'rgba(27, 38, 44, 0.78)',
            icon: <WorkIcon size={54} color="currentColor" strokeWidth={1.9} />,
            onClick: () => setTopic({ id: 'linkedin', url: 'https://www.linkedin.com', label: 'LinkedIn' }),
        },
        {
            id: 'gmail',
            label: 'Gmail',
            accent: WEB_ACCENTS.maroonText,
            bg: 'rgba(52, 28, 24, 0.70)',
            icon: <MailIcon size={54} color="currentColor" strokeWidth={1.9} />,
            onClick: () => setTopic({ id: 'gmail', url: 'https://mail.google.com', label: 'Gmail' }),
        },
        {
            id: 'whatsapp',
            label: 'WhatsApp',
            accent: WEB_ACCENTS.oliveText,
            bg: 'rgba(34, 42, 27, 0.74)',
            icon: <WhatsAppIcon size={54} color="currentColor" strokeWidth={1.9} />,
            onClick: () => { if (setView) setView('whatsapp'); },
        },
    ];

    // Theme-aware tile bg per social platform (cream-elevated in light, walnut in mix, dark in dark)
    const tileBgFor = (id: string, darkBg: string) => {
        if (isLight) {
            // Cream tiles with subtle platform-tint hue
            if (id === 'linkedin') return 'rgba(31, 107, 126, 0.10)';
            if (id === 'gmail') return 'rgba(165, 106, 96, 0.12)';
            if (id === 'whatsapp') return 'rgba(143, 161, 123, 0.14)';
            return '#FFFCF1';
        }
        if (isMix) {
            if (id === 'linkedin') return 'rgba(31, 50, 60, 0.85)';
            if (id === 'gmail') return 'rgba(72, 38, 32, 0.85)';
            if (id === 'whatsapp') return 'rgba(48, 56, 36, 0.85)';
            return '#241F18';
        }
        return darkBg;
    };
    const tileBorder = isLight ? `1.5px solid ${T_chromeBorder}` : isMix ? '1.5px solid rgba(180, 147, 98, 0.20)' : WEB_SURFACE.borderSoft;
    const tileLabelColor = isLight ? '#2E2A24' : isMix ? '#FFFCF1' : T.textMain;
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T_pageBg, padding: 'clamp(20px, 4vh, 60px)' }}>
            <h2 style={{ fontSize: 'clamp(32px, 4.5vh, 48px)', color: T_chromeText, marginBottom: 'clamp(40px, 6vh, 80px)', fontFamily: FONT_PRIMARY, fontWeight: 800 }}>
                Social Media
            </h2>
            <div style={{ display: 'flex', gap: 'clamp(22px, 3vw, 36px)', width: 'clamp(800px, 85vw, 1200px)' }}>
                {socialCards.map((card) => (
                    <GazeButton
                        key={card.id}
                        id={`soc-${card.id}`}
                        onClick={card.onClick}
                        gazeEnabled={ige}
                        gazeEnabledTimestamp={ts}
                        isDarkMode dwellCategory="navigationButton"
                        style={{
                            ...cb,
                            flex: 1,
                            height: 'clamp(170px, 23vh, 240px)',
                            borderRadius: '26px',
                            fontFamily: FONT_PRIMARY,
                            fontSize: 'clamp(25px, 3vh, 36px)',
                            fontWeight: 800,
                            background: tileBgFor(card.id, card.bg),
                            border: tileBorder,
                            boxShadow: T_chromeShadow,
                            color: tileLabelColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 'clamp(18px, 2.4vw, 30px)',
                        }}
                    >
                        <span style={{ color: card.accent, display: 'flex', opacity: 0.92, filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.24))' }}>
                            {card.icon}
                        </span>
                        <span>{card.label}</span>
                    </GazeButton>
                ))}
            </div>
        </div>
    );
};

// ── MAIN COMPONENT ──
// Hub layout: 4 cards arranged as a balanced 2×2 grid.
// 'knowledge' (ALS Knowledge) intentionally removed — that path is now
// covered by ALS Research inside Quick Search. The KnowledgePanel
// component + 'knowledge' ViewState are kept for any deep-link routing.
const HUB_CARDS = [
    { id: 'news', label: 'News Feed', labelHindi: 'समाचार', accent: WEB_ACCENTS.maroon, bg: 'rgba(45, 27, 24, 0.94)' },
    { id: 'youtube', label: 'YouTube', labelHindi: 'यूट्यूब', accent: WEB_ACCENTS.gold, bg: 'rgba(42, 33, 19, 0.94)' },
    { id: 'search', label: 'Quick Search', labelHindi: 'खोज', accent: WEB_ACCENTS.teal, bg: 'rgba(22, 40, 38, 0.94)' },
    { id: 'social', label: 'Social & Connect', labelHindi: 'संपर्क', accent: WEB_ACCENTS.blue, bg: 'rgba(25, 35, 42, 0.94)' },
];

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
            dwellMs: Math.max(850, Math.min(2800, dwellSettings.standardButton)),
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
        });
    }, [browser.setGazeConfig, currentStage, dwellSettings.cooldownAfterActivation, dwellSettings.onsetDelay, dwellSettings.standardButton]);

    // Tier 0 A — single-dwell gaze toggle for hidden-nav embedded browser strip
    const toggleGaze = useCallback(() => {
        if (ige) disableGaze(); else enableGaze();
    }, [ige, disableGaze, enableGaze]);

    const handleEmergency = useCallback(() => {
        const english = settings?.emergencyPhraseEn || 'I need help immediately. This is an emergency.';
        const hindi = settings?.emergencyPhraseHi || 'मुझे तुरंत मदद चाहिए। यह आपातकालीन स्थिति है।';
        onSpeak(`${english} ${hindi}`.trim());
    }, [onSpeak, settings?.emergencyPhraseEn, settings?.emergencyPhraseHi]);

    // ── DISABLE GAZE on every view change (prevents accidental selections) ──
    useEffect(() => {
        disableGaze();
    }, [view]);

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

    // Force-enable gaze whenever the embedded browser is active. Previously
    // this only fired when nav was hidden, which left YouTube's toolbar
    // buttons (play/pause/skip-ad) dead if the patient had left the gaze
    // toggle OFF on a prior screen. Now any embedded-browser view (YouTube,
    // search, knowledge article) guarantees the cursor can drive its
    // toolbar buttons via dwell. Mouse-only mode still wins — enableGaze()
    // itself no-ops when isMouseMode is true (see GazeControlToggle.tsx).
    useEffect(() => {
        if (isEmbeddedBrowserActive && !ige) {
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
            if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return;

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

            // Clamp to screen
            rawX = Math.max(0, Math.min(window.innerWidth, rawX));
            rawY = Math.max(0, Math.min(window.innerHeight, rawY));

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

    // Forward gaze into BrowserView using an accuracy-first page cursor filter.
    // Backend Kalman/OptiKey already stabilizes gaze, and the injected page cursor
    // has its own dwell radius. Avoid a second hard fixation lock here because it
    // can make the page cursor appear offset from the user's actual gaze.
    // Keep only a tiny 1.5px jitter gate, snap large moves (>18px), and otherwise
    // use high-alpha EWMA so dense web and YouTube controls track promptly.
    //
    // v17.17: forwarding is event-driven (per gaze frame, ~66Hz) instead of a
    // 33ms poll. The poll added up to 33ms of lag, dropped roughly every other
    // frame the page-side dwell could have ticked on, and kept re-sending the
    // last held position through blinks (so the page dwell advanced on stale
    // gaze — see gapPause on the page side for the matching fix). A mousemove
    // path keeps simulation mode working: with no eye tracker there are no WS
    // gaze frames at all, so mouse-as-gaze must forward on its own events.
    const smoothedGazeRef = useRef<{ x: number; y: number } | null>(null);
    // v17.17: 3-sample weighted moving average over the raw input, the same
    // 0.45/0.30/0.25 pre-smoothing the main-app cursor applies before its EMA
    // (GazeCursor "SmoothWhenChangingGazeTarget"). Causal, ~zero added lag at
    // 66Hz; takes the sample-to-sample sawtooth out of the page cursor before
    // the EMA and the page-side stability radius see it.
    const wmaPrev1Ref = useRef<{ x: number; y: number } | null>(null);
    const wmaPrev2Ref = useRef<{ x: number; y: number } | null>(null);
    const hasRealGazeRef = useRef(hasRealGaze);
    useEffect(() => { hasRealGazeRef.current = hasRealGaze; }, [hasRealGaze]);
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
        const hidePageCursor = () => {
            smoothedGazeRef.current = null;
            wmaPrev1Ref.current = null;
            wmaPrev2Ref.current = null;
            if (pageCursorVisibleRef.current) {
                pageCursorVisibleRef.current = false;
                browser.hideGazeCursor();
            }
        };
        const showPageCursor = (x: number, y: number, opts?: { cursor?: boolean }) => {
            pageCursorVisibleRef.current = opts?.cursor !== false;
            browser.updateGazeCursor(x, y, opts);
        };

        const forward = () => {
            const allowWatchScroll = isBrowserWatchMode && browser.scrollMode === 'armed' && view !== 'youtube';
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
            if (lastForwardAtRef.current > 0 && nowMs - lastForwardAtRef.current > 150) {
                wmaPrev1Ref.current = null;
                wmaPrev2Ref.current = null;
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
                hidePageCursor();
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
        // v17.18: a STATIONARY mouse fires no events, so simulation mode
        // (and the automatic mouse fallback 1.5s after a tracker dropout)
        // could never complete a dwell — the page dwell only ticks when
        // frames arrive, and the page-side gap pause neutralizes wall-clock
        // catch-up. This heartbeat re-sends the held position ONLY when no
        // real gaze stream exists; with real gaze it is a no-op, so blink
        // gaps stay gaps and stale-gaze dwell advancement is NOT
        // reintroduced (review-confirmed critical).
        const heartbeat = window.setInterval(() => {
            if (!hasRealGazeRef.current) forward();
        }, 33);
        // Entering a hidden state (gaze off / watch mode) must hide even
        // if no further frames arrive.
        if (!ige || (isBrowserWatchMode && !(browser.scrollMode === 'armed' && view !== 'youtube'))) {
            hidePageCursor();
        }
        return () => {
            unsub();
            window.removeEventListener('mousemove', onMouse);
            window.clearInterval(heartbeat);
        };
    }, [ws.subscribeGaze, browser.boundsRef, browser.isOpen, browser.scrollMode, ige, isBrowserWatchMode, browser.hideGazeCursor, browser.updateGazeCursor, isYtVideoActive, view]);

    const goBack = useCallback(() => {
        browser.closePage();
        setIsQsTopicActive(false);
        setIsYtVideoActive(false);
        setIsNavHidden(false);
        setBrowserInteractionMode('control');
        setView('grid');
    }, [browser]);

    if (view !== 'grid') return (
        <div className={`web-hub-screen${isLight ? ' theme-light' : isWarm ? ' theme-warm' : ''}`} data-gaze-context="webbrowse" style={{ position: 'absolute', inset: 0, background: isWarm ? '#F5EEDF' : T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Nav visibility — driven SOLELY by isNavHidden (the single source of truth).
                Previous code gated this on isEmbeddedBrowserActive, which flapped on
                child-state resync (websocket reconnects, focus events) and caused the
                global nav to spontaneously reappear after inactivity. */}
            {!isNavHidden && <div style={{ zIndex: 10, flexShrink: 0 }}>
                <GlobalNavBar
                    currentPage="web"
                    onNavigate={onNavigate}
                    onSpeak={onSpeak}
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
                {view === 'youtube' && <YouTubePanel ige={ige} ts={ts} browser={browser} gpRef={gpRef} goBack={goBack} disableGaze={disableGaze} toggleGaze={toggleGaze} isNavHidden={isNavHidden} browserInteractionMode={browserInteractionMode} onBrowserInteractionModeChange={setBrowserInteractionMode} onVideoActive={setIsYtVideoActive} onNavHiddenToggle={setIsNavHidden} onEmergency={handleEmergency} />}
                {view === 'knowledge' && <KnowledgePanel ige={ige} ts={ts} onSpeak={onSpeak} isNavHidden={isNavHidden} />}
                {view === 'search' && <QuickSearchPanel ige={ige} ts={ts} browser={browser} gpRef={gpRef} goBack={goBack} disableGaze={disableGaze} toggleGaze={toggleGaze} isNavHidden={isNavHidden} browserInteractionMode={browserInteractionMode} onBrowserInteractionModeChange={setBrowserInteractionMode} onTopicActive={setIsQsTopicActive} onNavHiddenToggle={setIsNavHidden} onEmergency={handleEmergency} onSpeak={onSpeak} />}
                {view === 'whatsapp' && <WhatsAppPanel ige={ige} ts={ts} browser={browser} gpRef={gpRef} goBack={goBack} isNavHidden={isNavHidden} />}
                {view === 'social' && <SocialPanel ige={ige} ts={ts} browser={browser} gpRef={gpRef} goBack={goBack} disableGaze={disableGaze} isNavHidden={isNavHidden} setView={setView} />}
            </div>
        </div>
    );

    const renderHubCard = (card: typeof HUB_CARDS[number]) => {
        const visual = HUB_CARD_VISUALS[card.id] || {
            accent: card.accent,
            bg: card.bg,
            iconSize: 112,
            iconOpacity: 0.76,
            dividerOpacity: 0.42,
        };
        // Light/Warm: cream paper cards. Mix: tan paper-on-dark-desk cards (matches
        // home tile surfaces). Default dark mode: dark navy with cream text.
        const isPaperMode = isLight || isWarm;
        const isMixMode = isMix;
        const cardBg = isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : isMixMode ? '#B6A17A' : visual.bg;
        const cardBorder = isPaperMode
          ? '1px solid rgba(122, 99, 71, 0.16)'
          : isMixMode ? '1.5px solid rgba(70, 52, 32, 0.56)' : HUB_UNIFIED_CARD_BORDER;
        const cardShadow = isPaperMode
          ? '0 1px 2px rgba(82, 65, 48, 0.05)'
          : isMixMode ? 'inset 0 1px 0 rgba(255,255,255,0.07), 0 7px 16px rgba(0,0,0,0.22)' : HUB_UNIFIED_CARD_SHADOW;
        // Paper-mode hub icons use the diversified warm-muted palette so each
        // card has its own visual identity (matches Home tile colors).
        // Mix-mode keeps unified teal for tan-card cohesion.
        const PAPER_HUB_ACCENTS: Record<string, string> = {
            news:       '#7A312E', // deeper maroon
            youtube:    '#A56D55', // deeper coral
            knowledge:  '#5F7C58', // deeper sage
            search:     '#4F7388', // deeper sky blue
            social:     '#85703D', // deeper rich gold
        };
        const iconAccent = isPaperMode
            ? (PAPER_HUB_ACCENTS[card.id] ?? '#3F6968')
            : isMixMode ? '#3F6968' : visual.accent;
        const labelColor = isPaperMode ? '#2F2A26' : isMixMode ? '#180F08' : '#ECEDE3';
        const labelTextShadow = isPaperMode || isMixMode ? 'none' : '0 1px 1px rgba(0,0,0,0.10)';
        const hindiColor = isPaperMode ? '#5C4F44' : isMixMode ? '#4E3D29' : '#B0BFB6';

        return (
            <GazeButton key={card.id} id={`hub-${card.id}`} onClick={() => setView(card.id as ViewState)}
                gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="homeScreenTile"
                contentFill={true}
                style={{
                    width: '100%', height: '100%',
                    minHeight: 0,
                    borderRadius: '26px', overflow: 'hidden', cursor: 'pointer',
                    border: cardBorder,
                    background: cardBg,
                    boxShadow: cardShadow,
                    transition: 'background 150ms ease, filter 150ms ease',
                    padding: 0
                }}
                onMouseEnter={(e) => {
                    if (!isPaperMode && !isMixMode) {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.filter = 'brightness(1.025)';
                    }
                }}
                onMouseLeave={(e) => {
                    if (!isPaperMode && !isMixMode) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.filter = 'brightness(1)';
                    }
                }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', height: '100%', alignItems: 'center', position: 'relative' }}>
                    <div style={{
                        flex: '0 0 36%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingLeft: 'clamp(34px, 3.6vw, 60px)',
                        color: iconAccent,
                        opacity: visual.iconOpacity,
                    }}>
                        {renderHubIcon(card.id, visual.iconSize, iconAccent)}
                    </div>
                    <div style={{
                        flex: '1 1 0',
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'flex-start',
                        padding: 'clamp(20px,2.4vh,30px) clamp(24px,3vw,46px) clamp(20px,2.4vh,30px) clamp(14px,1.5vw,26px)',
                        boxSizing: 'border-box',
                        gap: '6px',
                    }}>
                        <span style={{
                            fontFamily: FONT_PRIMARY, fontWeight: 820,
                            fontSize: 'clamp(30px, 3.4vh, 43px)', color: labelColor,
                            textAlign: 'left', lineHeight: 1.08, letterSpacing: 0,
                            textShadow: labelTextShadow,
                        }}>
                            {card.label}
                        </span>
                        {showHindi && (
                            <span style={{
                                fontFamily: "'Noto Sans Devanagari', sans-serif", fontWeight: 700,
                                fontSize: 'clamp(20px, 2.4vh, 28px)', color: hindiColor,
                                textAlign: 'left', lineHeight: 1.25,
                            }}>
                                {card.labelHindi}
                            </span>
                        )}
                    </div>
                </div>
            </GazeButton>
        );
    };

    // Balanced 2×2 grid for 4 hub cards. Each card is slightly larger than
    // the prior 3-column layout to use the extra space — gives the hub a
    // more confident, premium feel while keeping eye-gaze targets generous.
    const HUB_GRID_ROW: React.CSSProperties = {
        display: 'grid',
        gridAutoRows: 'minmax(clamp(240px, 28vh, 320px), 1fr)',
        gap: 'clamp(26px, 3.2vw, 48px)',
        justifyContent: 'center',
        width: '100%',
    };

    return (
        <div className={`web-hub-screen${isLight ? ' theme-light' : isWarm ? ' theme-warm' : ''}`} style={{ position: 'absolute', inset: 0, background: isWarm ? '#F5EEDF' : T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)' }}>
            <div style={{ zIndex: 10 }}>
                <GlobalNavBar currentPage="web" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} />
            </div>

            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                marginTop: 'clamp(-32px, -4vh, -16px)',
                gap: 'clamp(26px, 3.4vh, 44px)',
                padding: '0 clamp(40px, 4.5vw, 80px)',
                boxSizing: 'border-box',
            }}>
                {/* Row 1: News Feed + YouTube */}
                <div style={{
                    ...HUB_GRID_ROW,
                    gridTemplateColumns: 'repeat(2, minmax(0, clamp(420px, 36vw, 620px)))',
                }}>
                    {HUB_CARDS.slice(0, 2).map(renderHubCard)}
                </div>
                {/* Row 2: Quick Search + Social & Connect */}
                <div style={{
                    ...HUB_GRID_ROW,
                    gridTemplateColumns: 'repeat(2, minmax(0, clamp(420px, 36vw, 620px)))',
                }}>
                    {HUB_CARDS.slice(2).map(renderHubCard)}
                </div>
            </div>
        </div>
    );
};

export default WebBrowsingScreen;
