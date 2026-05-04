/**
 * WebBrowsingScreen v3.6 — Real gaze cursor inside BrowserView, bigger buttons
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { screenThemes, typography } from '../utils/design';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useWS } from '../hooks/useWebSocket';
import { useGazeBrowser } from '../hooks/useGazeBrowser';
import { useRealGaze } from '../contexts/RealGazeContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomization } from '../contexts/CustomizationContext';
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
    onMaximize?: () => void;
    onDown: () => void;
    gazeEnabled: boolean;
    gazeTimestamp: number;
};

const ContentScrollDock: React.FC<ScrollDockProps> = ({ onUp, onMaximize, onDown, gazeEnabled, gazeTimestamp }) => {
    const hasMax = !!onMaximize;
    const buttonStyle: React.CSSProperties = {
        width: '100%',
        flex: '1 1 0',
        minHeight: hasMax ? 'clamp(96px, 12vh, 152px)' : 'clamp(120px, 16vh, 200px)',
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
    const iconSize = hasMax ? 38 : 42;
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
            <GazeButton id="nav-back" onClick={onClick} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
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
// Toggle YouTube's player fullscreen — scoped strictly to the actively-playing
// video on a watch page. Three guards prevent unwanted behaviors:
//
//   Guard 1 — pathname check: only run on /watch pages. Avoids trying to
//     fullscreen anything on YouTube home, search results, channel pages
//     (where <video> preview thumbnails would otherwise be candidates).
//   Guard 2 — require a #movie_player container with a loaded video that
//     has valid duration metadata. Filters out preview videos and players
//     that haven't loaded yet.
//   Guard 3 — only click .ytp-fullscreen-button (YouTube's own toggle,
//     scoped to the player area). NEVER call element.requestFullscreen() —
//     that's the browser-level fullscreen API which would fullscreen the
//     entire BrowserView / Electron window.
//
// Calling this script on any non-watch page is a safe no-op.
const YT_MAXIMIZE_SCRIPT = `
(function () {
  try {
    // Guard 1 — must be on a /watch page
    if (!location.pathname || !location.pathname.startsWith('/watch')) {
      return 'not-watch-page';
    }
    // Guard 2 — must have a loaded player with a real video
    var player = document.getElementById('movie_player');
    if (!player) return 'no-player';
    var v = player.querySelector('video');
    if (!v || !isFinite(v.duration) || v.duration <= 0) {
      return 'video-not-loaded';
    }
    // Guard 3 — click YouTube's own fullscreen toggle (scoped to player only)
    var fs = player.querySelector('.ytp-fullscreen-button');
    if (fs) {
      fs.click();
      return 'fs-toggled';
    }
    return 'no-fullscreen-button';
  } catch (e) { return 'err:' + (e && e.message); }
})();
`;

const isValidYouTubeId = (id?: string) => !!id && /^[A-Za-z0-9_-]{11}$/.test(id);
// Use the YouTube WATCH URL (not embed). Embed URLs fail with Error 153 for many
// videos (T-Series, label music, news) because uploaders disable embedding.
// The watch URL works universally; we then auto-send 'f' after load to maximize
// the player inside the BrowserView (hiding sidebar/comments).
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
    const [cat, setCat] = useState('positive_india');
    const [sel, setSel] = useState<NewsItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [readerUrl, setReaderUrl] = useState('');
    const [readerLoading, setReaderLoading] = useState(false);
    const [readerData, setReaderData] = useState<any | null>(null);
    const [readerLiveMode, setReaderLiveMode] = useState(false);
    const [autoReadOn, setAutoReadOn] = useState(false);
    const [autoReadPaused, setAutoReadPaused] = useState(false);
    const [autoReadIndex, setAutoReadIndex] = useState(0);
    const [isCompactGrid, setIsCompactGrid] = useState(() =>
        typeof window !== 'undefined' ? (window.innerWidth < 1500 || window.innerHeight < 900) : false,
    );
    const scrollRef = useRef<HTMLDivElement>(null);
    const readerWebRef = useRef<HTMLDivElement>(null);
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
        setReaderLiveMode(false);
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

    useEffect(() => {
        if (!readerLiveMode || !readerUrl) return;
        let cancelled = false;
        const raf = requestAnimationFrame(() => {
            if (cancelled || !readerWebRef.current) return;
            const r = readerWebRef.current.getBoundingClientRect();
            if (r.width > 50 && r.height > 50) {
                browser.openPage(readerUrl, {
                    x: Math.round(r.left),
                    y: Math.round(r.top),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                });
            }
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
        };
    }, [readerLiveMode, readerUrl, browser, isNavHidden]);

    useEffect(() => {
        if (!readerLiveMode) {
            browser.closePage();
        }
    }, [readerLiveMode, browser]);

    useEffect(() => {
        return () => {
            browser.closePage();
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
        setReaderLiveMode(false);
        ws.fetchArticle(sel.link);
        disableGaze();
    }, [sel, ws.fetchArticle, disableGaze]);

    const openReaderFallbackWeb = useCallback(() => {
        if (!sel?.link) return;
        setReaderUrl(sel.link);
        setReaderLiveMode(true);
        disableGaze();
    }, [sel, disableGaze]);

    const cardCount = isCompactGrid ? 4 : 6;
    const visibleItems = ws.newsItems.slice(0, cardCount) as NewsItem[];
    const activeAutoReadIndex = ws.newsItems.length ? autoReadIndex % ws.newsItems.length : -1;
    const sidebarVisibleCount = 5;
    const sidebarItems = ws.newsItems.slice(0, sidebarVisibleCount) as NewsItem[];
    const sidebarSlots = Array.from({ length: sidebarVisibleCount }, (_, idx) => sidebarItems[idx] || null);
    const categoryIndex = Math.max(0, cats.findIndex((c: any) => c.id === cat));
    const currentCategory = cats[categoryIndex] || cats[0];
    const readerBodyRaw = readerData?.text || sel?.content || sel?.description || sel?.summary || '';
    const readableParagraphs = formatNewsAsReadableParagraphs(readerBodyRaw);

    if (sel) {
        return (
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                marginTop: 'clamp(95px, 12.5vh, 125px)', padding: 'clamp(16px, 2vh, 24px) clamp(20px, 3vw, 40px)',
                paddingBottom: 'clamp(20px, 2.5vh, 40px)'
            }}>
                <div style={{ display: 'flex', gap: 'clamp(16px,2.5vw,28px)', flexShrink: 0, flexWrap: 'wrap', marginBottom: 'clamp(12px,2vh,20px)' }}>
                    <GazeButton id="n-close" onClick={() => { setSel(null); setReaderData(null); setReaderUrl(''); setReaderLiveMode(false); browser.closePage(); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...actionButton(DANGER, 'rgba(60, 34, 32, 0.72)', DANGER_BORDER), minWidth: 'clamp(130px,13vw,170px)' }}>
                        <XIcon size={26} color="currentColor" strokeWidth={2.4} />
                        <span>Close</span>
                    </GazeButton>
                    <GazeButton id="n-read" onClick={() => onSpeak(`${sel.title}. ${sel.summary || sel.description || ''}`)} gazeEnabled={ige}
                        gazeEnabledTimestamp={ts} isDarkMode style={{ ...actionButton(TL, 'rgba(28, 47, 45, 0.72)', SOFT_INFO_BORDER), minWidth: 'clamp(130px,13vw,170px)' }}>
                        <SpeakIcon size={26} color="currentColor" strokeWidth={2.3} />
                        <span>Read</span>
                    </GazeButton>
                    <GazeButton id="n-reader" onClick={openReaderView} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cb, color: INFO, borderColor: INFO_BORDER, minWidth: 'clamp(160px,16vw,220px)' }}>
                        <BookIcon size={26} color="currentColor" strokeWidth={2.2} />
                        <span>Read Full Story</span>
                    </GazeButton>
                    <GazeButton id="n-reader-web" onClick={openReaderFallbackWeb} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cb, color: SUCCESS, borderColor: SUCCESS_BORDER, minWidth: 'clamp(150px,15vw,220px)' }}>
                        <ExternalIcon size={26} color="currentColor" strokeWidth={2.3} />
                        <span>Open in Browser</span>
                    </GazeButton>
                    {readerLiveMode && (
                        <>
                        <GazeButton id="n-bv-click" onClick={() => browser.clickAtGaze(gpRef.current.x, gpRef.current.y)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...actionButton(WEB_ACCENTS.tealText, 'rgba(28, 47, 45, 0.72)', SOFT_INFO_BORDER), minWidth: 'clamp(130px,13vw,170px)' }}>
                            <PointerIcon size={28} color="currentColor" strokeWidth={2.2} />
                            <span>Click Here</span>
                        </GazeButton>
                        <GazeButton id="n-bv-up" onClick={() => browser.scrollUp()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...actionButton(WEB_ACCENTS.blueText), minWidth: 'clamp(100px,10vw,140px)' }}>
                            <ArrowUpIcon size={26} color="currentColor" strokeWidth={2.3} />
                            <span>Up</span>
                        </GazeButton>
                        <GazeButton id="n-bv-down" onClick={() => browser.scrollDown()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...actionButton(WEB_ACCENTS.blueText), minWidth: 'clamp(100px,10vw,140px)' }}>
                            <ArrowDownIcon size={26} color="currentColor" strokeWidth={2.3} />
                            <span>Down</span>
                        </GazeButton>
                        <GazeButton id="n-reader-text" onClick={() => { setReaderLiveMode(false); disableGaze(); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...cb, color: SOFT_INFO, borderColor: SOFT_INFO_BORDER, minWidth: 'clamp(150px,15vw,220px)' }}>
                            <BookIcon size={26} color="currentColor" strokeWidth={2.2} />
                            <span>Reader View</span>
                        </GazeButton>
                        </>
                    )}
                    <GazeButton id="n-stop" onClick={() => ws.stopSpeaking()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...actionButton(DANGER, 'rgba(60, 34, 32, 0.72)', DANGER_BORDER), minWidth: 'clamp(110px,11vw,150px)' }}>Stop</GazeButton>
                    <GazeButton id="n-scroll" onClick={() => scrollRef.current?.scrollBy({ top: 280, behavior: 'smooth' })} gazeEnabled={ige}
                        gazeEnabledTimestamp={ts} isDarkMode style={{ ...actionButton(WEB_ACCENTS.blueText), minWidth: 'clamp(130px,13vw,170px)' }}>
                        <ArrowDownIcon size={26} color="currentColor" strokeWidth={2.3} />
                        <span>Scroll</span>
                    </GazeButton>
                    {ws.newsCached && (
                        <div style={{
                            ...cb,
                            minHeight: 'clamp(54px,7vh,80px)',
                            color: STATUS,
                            borderColor: STATUS_BORDER,
                            background: 'rgba(16, 67, 93, 0.22)',
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
                            background: T.cardBg,
                        }}>
                            <div style={{ fontSize: 'clamp(12px,1.35vh,14px)', color: 'rgba(173,194,214,0.75)', marginBottom: '6px', letterSpacing: '0.02em' }}>
                                CURRENT CATEGORY
                            </div>
                            <div style={{ fontSize: 'clamp(18px,2vh,22px)', fontWeight: 700, color: T.textMain }}>
                                {stripLeadingEmoji(currentCategory?.label || 'Top Stories')}
                            </div>
                        </div>

                        <div style={{
                            flex: 1,
                            display: 'grid',
                            gridTemplateRows: `repeat(${sidebarVisibleCount}, minmax(0, 1fr))`,
                            gap: 'clamp(10px, 1.2vh, 14px)',
                            overflow: 'hidden',
                            minHeight: 0,
                        }}>
                            {sidebarSlots.map((it, i) => (
                                it ? (
                                    <GazeButton
                                        key={`${it.title}-${i}`}
                                        id={`ni-side-${i}`}
                                        onClick={() => selectItem(it)}
                                        gazeEnabled={ige}
                                        gazeEnabledTimestamp={ts}
                                        isDarkMode
                                        style={{
                                            ...cs,
                                            alignItems: 'flex-start',
                                            justifyContent: 'space-between',
                                            padding: 'clamp(14px,1.7vh,18px)',
                                            minHeight: 'clamp(96px, 10.5vh, 122px)',
                                            background: sel.title === it.title ? 'rgba(56, 189, 248, 0.10)' : T.cardBg,
                                            border: sel.title === it.title ? `2px solid ${AC}90` : CB,
                                        }}
                                    >
                                        <div style={{
                                            fontSize: 'clamp(15px,1.65vh,19px)',
                                            fontWeight: 600,
                                            color: T.textMain,
                                            lineHeight: 1.35,
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical' as const,
                                            overflow: 'hidden',
                                            textAlign: 'left',
                                            width: '100%',
                                        }}>
                                            {it.title}
                                        </div>
                                        <div style={{ fontSize: 'clamp(11px,1.1vh,13px)', color: 'rgba(153,175,198,0.78)', marginTop: '8px' }}>
                                            {it.source || 'News'} • {it.relative_time || 'Recent'}
                                        </div>
                                    </GazeButton>
                                ) : (
                                    <div key={`ni-empty-${i}`} style={{
                                        minHeight: 'clamp(96px, 10.5vh, 122px)',
                                        borderRadius: '18px',
                                        border: '1px solid rgba(90,110,130,0.12)',
                                        background: 'rgba(20,30,44,0.22)',
                                    }} />
                                )
                            ))}
                        </div>
                    </div>

                    {readerLiveMode ? (
                        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                            {browser.edgeScrollDirection === 'up' && (
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to bottom, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none', borderRadius: `${CR} ${CR} 0 0` }} />
                            )}
                            {browser.edgeScrollDirection === 'down' && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to top, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none', borderRadius: `0 0 ${CR} ${CR}` }} />
                            )}
                            <div ref={readerWebRef} style={{
                                width: '100%', height: '100%', borderRadius: CR, overflow: 'hidden', background: '#fff',
                                border: WEB_SURFACE.borderSoft, boxShadow: WEB_SURFACE.panelShadow,
                            }}>
                                <div style={{
                                    width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#999', fontSize: '16px',
                                }}>
                                    {browser.loading ? 'Loading article website...' : 'Live article opened in BrowserView'}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div ref={scrollRef} style={{
                            ...cs, flex: 1, alignItems: 'stretch', justifyContent: 'flex-start',
                            padding: 'clamp(28px, 3.8vh, 48px)', overflow: 'auto', minHeight: 0,
                            background: T.cardBg,
                        }}>
                            <div style={{ width: '100%', maxWidth: 'min(980px, 100%)', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
                                <h2 style={{
                                    fontSize: 'clamp(30px, 4vh, 46px)',
                                    fontWeight: 700,
                                    color: T.textMain,
                                    margin: 0,
                                    fontFamily: FONT_PRIMARY,
                                    lineHeight: 1.25,
                                    letterSpacing: '-0.015em',
                                }}>
                                    {readerData?.title || sel.title}
                                </h2>

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'clamp(10px, 1vw, 14px)',
                                    flexWrap: 'wrap',
                                    marginTop: '14px',
                                    color: 'rgba(173,194,214,0.8)',
                                    fontSize: 'clamp(13px,1.35vh,16px)',
                                }}>
                                    <span>{sel.source || 'News'}</span>
                                    <span>•</span>
                                    <span>{sel.relative_time || 'Recent'}</span>
                                    {readerData?.cached && <span style={{ color: STATUS }}>Reader Cache</span>}
                                    {readerData?.fallback && <span style={{ color: '#FFCC80' }}>Fallback mode</span>}
                                </div>

                                <div style={{ height: 1, background: 'rgba(56, 189, 248, 0.18)', margin: 'clamp(16px,2vh,22px) 0 clamp(20px,2.4vh,30px)' }} />

                                {readerLoading && (
                                    <div style={{ fontSize: 'clamp(20px,2.3vh,26px)', color: 'rgba(255,255,255,0.76)', lineHeight: 1.8 }}>
                                        Loading AAC Reader View...
                                    </div>
                                )}

                                {!readerLoading && (
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 'clamp(16px, 2.1vh, 24px)',
                                        fontFamily: "'Merriweather', 'Georgia', serif",
                                    }}>
                                        {(readableParagraphs.length ? readableParagraphs : ['No article content available right now. Use Open in Browser.']).map((para, idx) => (
                                            <p key={`np-${idx}`} style={{
                                                margin: 0,
                                                fontSize: 'clamp(20px, 2.45vh, 30px)',
                                                lineHeight: 1.82,
                                                color: idx === 0 ? '#F3F8FF' : 'rgba(230,237,243,0.93)',
                                                background: idx === 0 ? 'rgba(88,166,255,0.08)' : 'transparent',
                                                border: idx === 0 ? '1px solid rgba(88,166,255,0.2)' : 'none',
                                                borderRadius: idx === 0 ? '14px' : 0,
                                                padding: idx === 0 ? 'clamp(16px,2vh,22px)' : 0,
                                            }}>
                                                {para}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
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
        }}>
            {/* SIDEBAR — 7 news categories */}
            <div style={{
                width: 'clamp(260px, 22vw, 320px)', flexShrink: 0,
                display: 'grid',
                gridAutoRows: 'minmax(clamp(94px, 10.5vh, 126px), 1fr)',
                gap: 'clamp(8px, 1vh, 12px)',
                background: '#1B1C18',
                border: '1.5px solid rgba(213, 216, 188, 0.12)',
                borderRadius: '20px',
                padding: 'clamp(12px, 1.4vh, 18px)',
                overflow: 'hidden',
            }}>
                {cats.map((c: any) => {
                    const isSelected = cat === c.id;
                    return (
                        <GazeButton key={c.id} id={`nc-${c.id}`} onClick={() => { setCat(c.id); disableGaze(); }}
                            gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            contentFill
                            style={{
                                width: '100%', height: '100%', minHeight: 0,
                                position: 'relative', overflow: 'hidden',
                                borderRadius: '14px',
                                background: isSelected ? 'rgba(198, 154, 69, 0.16)' : 'transparent',
                                border: isSelected ? '1.5px solid rgba(198, 154, 69, 0.34)' : '1.5px solid transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                                gap: 'clamp(10px, 1vw, 14px)',
                                padding: 'clamp(10px, 1.2vh, 16px) clamp(14px, 1.4vw, 20px)',
                                fontFamily: FONT_PRIMARY,
                                textAlign: 'left',
                            }}>
                            {isSelected && <div style={{
                                position: 'absolute', left: 'clamp(8px, 0.8vw, 12px)',
                                top: 'clamp(12px, 1.3vh, 18px)', bottom: 'clamp(12px, 1.3vh, 18px)',
                                width: '3px', borderRadius: '999px', background: '#C69A45',
                            }} />}
                            <NewsIcon size={28} color={isSelected ? '#C69A45' : '#789D91'} strokeWidth={2.2} />
                            <span style={{
                                fontSize: 'clamp(17px, 2vh, 24px)', fontWeight: isSelected ? 800 : 700,
                                color: isSelected ? '#F1E2C2' : T.textMain, lineHeight: 1.15,
                                fontStyle: isSelected ? 'italic' : 'normal',
                            }}>
                                {stripLeadingEmoji(c.label)}
                            </span>
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
                    <GazeButton id="n-ref" onClick={() => { setIsLoading(true); ws.refreshNews(cat, 9); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...toolbarBtn('secondary', false), minHeight: 'clamp(72px, 8.5vh, 96px)', minWidth: 'clamp(140px, 12vw, 180px)', fontSize: 'clamp(18px, 2.2vh, 24px)' }}>
                        <RefreshIcon size={26} color="currentColor" strokeWidth={2.3} />
                        <span>Refresh</span>
                    </GazeButton>
                    {ws.newsCached && (
                        <div style={{
                            minHeight: 'clamp(72px, 8.5vh, 96px)',
                            padding: '0 clamp(18px, 1.8vw, 26px)',
                            display: 'flex', alignItems: 'center',
                            color: '#A9CAC7',
                            border: '1px solid rgba(169, 202, 199, 0.28)',
                            background: 'rgba(28, 47, 45, 0.42)',
                            borderRadius: '20px',
                            fontSize: 'clamp(15px, 1.8vh, 19px)',
                            fontFamily: FONT_PRIMARY,
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                        }}>Cached</div>
                    )}
                </div>

                {/* Article grid (3 columns × 2 rows = 6 cards, or 2×2 compact) */}
                <div style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: isCompactGrid ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
                    gridAutoRows: 'minmax(0, 1fr)',
                    gap: 'clamp(14px, 1.6vh, 22px)',
                    overflow: 'hidden', minHeight: 0,
                }}>
                    {(visibleItems.length ? visibleItems : Array(cardCount).fill(null)).map((it: NewsItem | null, i: number) => (
                        <GazeButton key={it?.title || `ph-${i}`} id={`ni-${i}`} onClick={() => { if (it) selectItem(it); }}
                            gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            contentFill
                            style={{
                                width: '100%', height: '100%', minHeight: 0,
                                background: '#20221E',
                                border: autoReadOn && i === activeAutoReadIndex ? `2px solid #789D91` : '1.5px solid rgba(213, 216, 188, 0.14)',
                                borderRadius: '26px',
                                boxShadow: autoReadOn && i === activeAutoReadIndex
                                    ? '0 0 0 2px rgba(120, 157, 145, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)'
                                    : 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)',
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'flex-start', justifyContent: 'space-between',
                                padding: 'clamp(20px, 2.4vh, 30px) clamp(22px, 2vw, 32px)',
                                opacity: it ? 1 : 0.35,
                                textAlign: 'left',
                            }}>
                            <div style={{
                                fontSize: 'clamp(18px, 2.2vh, 26px)', fontWeight: 760, color: T.textMain,
                                fontFamily: FONT_PRIMARY, lineHeight: 1.28,
                                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const,
                                overflow: 'hidden', width: '100%',
                            }}>{it?.title || (isLoading ? 'Loading...' : 'No news available right now')}</div>
                            {it && (
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', width: '100%',
                                    fontSize: 'clamp(13px, 1.5vh, 17px)', color: T.textSub, marginTop: '14px',
                                    fontFamily: FONT_PRIMARY,
                                }}>
                                    <span style={{
                                        background: 'rgba(213, 216, 188, 0.08)',
                                        padding: '4px 12px', borderRadius: '10px',
                                        fontWeight: 700,
                                    }}>{it.source}</span>
                                    <span>{it.relative_time}</span>
                                </div>
                            )}
                        </GazeButton>
                    ))}
                </div>

                {/* Reader-controls strip — Auto-Read / Pause / Stop */}
                <div style={{
                    display: 'flex', alignItems: 'stretch', gap: 'clamp(12px, 1.2vw, 18px)',
                    flexShrink: 0,
                }}>
                    <GazeButton id="n-auto" onClick={startAutoRead} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...toolbarBtn('secondary', false), minHeight: 'clamp(86px, 10vh, 116px)', fontSize: 'clamp(19px, 2.3vh, 26px)' }}>
                        <SpeakIcon size={28} color="currentColor" strokeWidth={2.3} />
                        <span>Auto-Read</span>
                    </GazeButton>
                    <GazeButton id="n-pause" onClick={pauseAutoRead} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...toolbarBtn('primary', false), minHeight: 'clamp(86px, 10vh, 116px)', fontSize: 'clamp(19px, 2.3vh, 26px)' }}>
                        <span>{autoReadPaused ? 'Resume' : 'Pause'}</span>
                    </GazeButton>
                    <GazeButton id="n-stop-auto" onClick={stopAutoRead} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
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
    const [catId, setCatId] = useState('old_songs');
    const [playing, setPlaying] = useState<any>(null);
    const viewRef = useRef<HTMLDivElement>(null);
    const cat = YT_CATS.find(c => c.id === catId) || YT_CATS[0];
    const toolbarGazeEnabled = isNavHidden ? true : ige;
    const toolbarGazeTimestamp = isNavHidden ? 0 : ts;
    const toolbarIconSize = isNavHidden ? 38 : browserToolbarIconSize;
    const isWatchMode = browserInteractionMode === 'watch';
    const toggleBrowserInteractionMode = useCallback(() => {
        onBrowserInteractionModeChange(isWatchMode ? 'control' : 'watch');
    }, [isWatchMode, onBrowserInteractionModeChange]);

    useEffect(() => {
        onVideoActive?.(!!playing);
    }, [playing, onVideoActive]);

    useEffect(() => {
        if (playing) onBrowserInteractionModeChange('watch');
    }, [playing?.id, onBrowserInteractionModeChange]);

    // Open BrowserView AFTER player div renders — use requestAnimationFrame for paint.
    // Auto-maximize: inject the YT_MAXIMIZE_SCRIPT 2500ms after page-load settling.
    // JS injection with userGesture=true is reliable; keyboard shortcuts ('f') are not.
    useEffect(() => {
        if (!playing) return;
        let cancelled = false;
        let maxTimer: ReturnType<typeof setTimeout> | null = null;
        const raf = requestAnimationFrame(() => {
            if (cancelled || !viewRef.current) return;
            const r = viewRef.current.getBoundingClientRect();
            if (r.width > 50 && r.height > 50) {
                const url = resolveYouTubeUrl(playing);
                browser.openPage(url, { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
                maxTimer = setTimeout(async () => {
                    if (cancelled) return;
                    const result = await browser.executeJs(YT_MAXIMIZE_SCRIPT);
                    if (!result || result.success === false) {
                        browser.typeText('f');
                    }
                }, 2500);
            }
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
            if (maxTimer) clearTimeout(maxTimer);
        };
    }, [playing]);

    // Maximize toggle — manual fallback for when auto-maximize at 2.5s fails OR
    // when the patient has exited fullscreen and wants to re-enter. The script
    // clicks YouTube's own .ytp-fullscreen-button which is a toggle, so the
    // same action both maximizes and minimizes (depending on current state).
    // Falls back to keyboard 'f' if executeJs IPC isn't available yet.
    const maximizeVideo = useCallback(async () => {
        const result = await browser.executeJs(YT_MAXIMIZE_SCRIPT);
        if (!result || result.success === false) {
            browser.typeText('f');
        }
    }, [browser]);

    useBrowserViewBoundsSync(viewRef, browser.updateBounds, !!playing && browser.isOpen);

    const stop = useCallback(() => {
        browser.closePage();
        setPlaying(null);
        onNavHiddenToggle?.(false);
        onBrowserInteractionModeChange('control');
    }, [browser, onBrowserInteractionModeChange, onNavHiddenToggle]);

    if (playing) return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', padding: 'clamp(12px,1.5vh,20px)', gap: 'clamp(10px,1.2vh,16px)', overflow: 'hidden',
            marginTop: '0', transition: 'margin-top 0.3s ease',
            marginLeft: 'clamp(10px,1.5vw,20px)', marginRight: 'clamp(10px,1.5vw,20px)',
            paddingBottom: 'clamp(10px, 1.5vh, 20px)'
        }}>
            {/* ── CONNECTED TOOLBAR — bi-modal + nav-aware (no duplicates with global nav) ── */}
            <div style={{ ...connectedToolbarStyle, flexShrink: 0 }}>
                {/* WATCH MODE — 3 buttons (Emergency · Pause/Play · Show Controls) */}
                {isWatchMode && <>
                    {isNavHidden && <GazeButton id="yt-emergency" onClick={onEmergency}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                        style={{ ...toolbarBtnConnected('emergency', !!isNavHidden, 'first'), fontWeight: 900, letterSpacing: '0.12em' }}>
                        <EmergencyIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Emergency</span>
                    </GazeButton>}
                    <GazeButton id="yt-playpause" onClick={() => browser.typeText('k')}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                        style={toolbarBtnConnected('secondary', !!isNavHidden, isNavHidden ? 'middle' : 'first')}>
                        <PlayIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Pause / Play</span>
                    </GazeButton>
                    <GazeButton id="yt-show-controls" onClick={toggleBrowserInteractionMode}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                        style={toolbarBtnConnected('primary', !!isNavHidden, 'last')}>
                        <PointerIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.3} />
                        <span>Show Controls</span>
                    </GazeButton>
                </>}

                {/* CONTROL MODE — 5 buttons (Emergency · Back · Pause/Play · Hide Controls · Show Nav) */}
                {!isWatchMode && <>
                    {isNavHidden && <GazeButton id="yt-emergency-c" onClick={onEmergency}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                        style={{ ...toolbarBtnConnected('emergency', !!isNavHidden, 'first'), fontWeight: 900, letterSpacing: '0.12em' }}>
                        <EmergencyIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Emergency</span>
                    </GazeButton>}
                    <GazeButton id="yt-back" onClick={isNavHidden ? () => browser.goBack() : stop}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                        style={toolbarBtnConnected('primary', !!isNavHidden, isNavHidden ? 'middle' : 'first')}>
                        <BackIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>{isNavHidden ? 'Back' : 'Close'}</span>
                    </GazeButton>
                    <GazeButton id="yt-playpause-c" onClick={() => browser.typeText('k')}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                        style={toolbarBtnConnected('secondary', !!isNavHidden, 'middle')}>
                        <PlayIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                        <span>Pause / Play</span>
                    </GazeButton>
                    <GazeButton id="yt-hide-controls" onClick={toggleBrowserInteractionMode}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                        style={toolbarBtnConnected('primary', !!isNavHidden, isNavHidden ? 'middle' : 'last')}>
                        <PlayIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.3} />
                        <span>Hide Controls</span>
                    </GazeButton>
                    {isNavHidden && <GazeButton id="yt-toggle-nav" onClick={() => onNavHiddenToggle?.(!isNavHidden)}
                        gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                        style={toolbarBtnConnected('primary', !!isNavHidden, 'last')}>
                        <WebLayoutIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.2} />
                        <span>Show Nav</span>
                    </GazeButton>}
                </>}
            </div>

            {/* Now-playing label */}
            {!isNavHidden && <div style={{ color: T.textSub, fontSize: 'clamp(15px,1.85vh,19px)', padding: '0 8px', flexShrink: 0, fontWeight: 600, fontFamily: FONT_PRIMARY, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <YoutubeIcon size={18} color="#789D91" strokeWidth={2.2} />
                <b style={{ color: T.textMain }}>{playing.title}</b>
                <span style={{ opacity: 0.7 }}>— {playing.ch}</span>
            </div>}

            {/* Content area: BrowserView (left) + ContentScrollDock (right gutter) */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', gap: 0 }}>
                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                    {isWatchMode && <div style={watchModeBadgeStyle}>WATCH MODE · page gaze paused</div>}
                    {!isWatchMode && browser.edgeScrollDirection === 'up' && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to bottom, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none', borderRadius: `${CR} ${CR} 0 0` }} />
                    )}
                    {!isWatchMode && browser.edgeScrollDirection === 'down' && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 'clamp(20px,2.6vh,32px)', background: 'linear-gradient(to top, rgba(45,212,191,0.35), rgba(45,212,191,0))', zIndex: 5, pointerEvents: 'none', borderRadius: `0 0 ${CR} ${CR}` }} />
                    )}
                    <div ref={viewRef} style={{
                        width: '100%', height: '100%', borderRadius: CR, overflow: 'hidden',
                        background: T.bg,
                        border: WEB_SURFACE.borderSoft, boxShadow: WEB_SURFACE.panelShadow
                    }}>
                        <div style={{
                            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: T.textSub, fontSize: '18px'
                        }}>
                            {browser.loading ? 'Loading video...' : ''}
                        </div>
                    </div>
                </div>
                {/* Up / Full Screen / Down dock — only in Control mode.
                    Watch mode = video already fullscreen, no dock needed.
                    Control mode = patient is interacting; gives 3 spatially-grouped
                    "video state" controls: scroll up, fullscreen toggle, scroll down. */}
                {!isWatchMode && (
                    <ContentScrollDock
                        onUp={() => browser.scrollUp()}
                        onMaximize={maximizeVideo}
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
                background: '#1B1C18',
                border: '1.5px solid rgba(213, 216, 188, 0.14)',
                borderRadius: '22px',
                padding: 'clamp(14px, 1.5vh, 20px)',
                boxShadow: '0 8px 18px rgba(0,0,0,0.22)',
                overflow: 'hidden',
            }}>
                {YT_CATS.map((c) => {
                    const isSelected = catId === c.id;
                    // Muted, darker antique-gold palette — less neon than #C69A45.
                    const SELECTED_ACCENT = '#9B7A38';            // Accent line + icon tint (deep antique gold)
                    const SELECTED_BG = 'rgba(155, 122, 56, 0.13)'; // Card background tint, very subtle
                    const SELECTED_TITLE = '#E0CDA6';             // Cream title (less saturated than F1E2C2)
                    const iconColor = isSelected ? SELECTED_ACCENT : WEB_ACCENTS.tealText;
                    const titleColor = isSelected ? SELECTED_TITLE : T.textMain;
                    const subtitleColor = isSelected ? 'rgba(224, 205, 166, 0.58)' : T.textSub;
                    const meta = YT_CATEGORY_META[c.id] || { subtitle: '', renderIcon: () => <YoutubeIcon size={48} color={iconColor} strokeWidth={2.2} /> };
                    return (
                        <GazeButton key={c.id} id={`yc-${c.id}`} onClick={() => { setCatId(c.id); disableGaze(); }}
                            gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                            contentFill
                            style={{
                                width: '100%', height: '100%', minHeight: 0,
                                position: 'relative', overflow: 'hidden',
                                borderRadius: '18px',
                                background: isSelected ? SELECTED_BG : 'rgba(213, 216, 188, 0.025)',
                                // Same neutral border in both states — no colored selection border.
                                // Selection is conveyed by the accent line + bg tint + icon color only.
                                border: '1.5px solid rgba(213, 216, 188, 0.08)',
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
                                background: '#20221E',
                                border: '1.5px solid rgba(213, 216, 188, 0.14)',
                                borderRadius: '26px',
                                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)',
                                overflow: 'hidden',
                                display: 'flex', flexDirection: 'column',
                                padding: 0,
                            }}>
                            {/* Thumbnail (top ~65%, 16:9) */}
                            <div style={{
                                position: 'relative',
                                width: '100%', flex: '0 0 65%',
                                background: '#0F100E',
                                overflow: 'hidden',
                                borderBottom: '1px solid rgba(213, 216, 188, 0.10)',
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
                                    fontSize: 'clamp(20px, 2.4vh, 28px)', fontWeight: 760, color: T.textMain,
                                    fontFamily: FONT_PRIMARY, lineHeight: 1.18,
                                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                                    overflow: 'hidden',
                                }}>{v.title}</div>
                                <div style={{
                                    fontSize: 'clamp(15px, 1.7vh, 19px)', color: T.textSub,
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
            paddingBottom: 'clamp(20px, 2.5vh, 40px)'
        }}>
            <div style={{ display: 'flex', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
                <GazeButton id="kb-back" onClick={() => setSelArt(null)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={actionButton(WEB_ACCENTS.goldText, 'rgba(49, 36, 20, 0.72)', 'rgba(178, 138, 69, 0.22)')}>
                    <BackIcon size={26} color="currentColor" strokeWidth={2.4} />
                    <span>Back</span>
                </GazeButton>
                <GazeButton id="kb-read" onClick={() => onSpeak(selArt.title + '. ' + selArt.content)} gazeEnabled={ige}
                    gazeEnabledTimestamp={ts} isDarkMode style={actionButton(TL, 'rgba(28, 47, 45, 0.72)', SOFT_INFO_BORDER)}>
                    <SpeakIcon size={26} color="currentColor" strokeWidth={2.3} />
                    <span>Read</span>
                </GazeButton>
                <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}
                <GazeButton id="kb-stop" onClick={() => ws.stopSpeaking()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={actionButton(DANGER, 'rgba(60, 34, 32, 0.72)', DANGER_BORDER)}>Stop</GazeButton>
                <GazeButton id="kb-scr" onClick={() => scrollRef.current?.scrollBy({ top: 250, behavior: 'smooth' })} gazeEnabled={ige}
                    gazeEnabledTimestamp={ts} isDarkMode style={actionButton(WEB_ACCENTS.blueText)}>
                    <ArrowDownIcon size={26} color="currentColor" strokeWidth={2.3} />
                    <span>Scroll</span>
                </GazeButton>
            </div>
            <div ref={scrollRef} style={{
                ...cs, flex: 1, width: '100%', height: 'auto', alignItems: 'flex-start', justifyContent: 'flex-start',
                padding: 'clamp(24px,3.5vh,40px)', overflow: 'auto', minHeight: 0
            }}>
                <h2 style={{ fontSize: 'clamp(22px,3vh,32px)', fontWeight: 700, color: T.textMain, margin: '0 0 10px 0', fontFamily: FONT_PRIMARY }}>{selArt.title}</h2>
                <div style={{ fontSize: 'clamp(16px,2.2vh,22px)', color: 'rgba(255,255,255,0.85)', lineHeight: 1.75, whiteSpace: 'pre-line' as const }}>{selArt.content}</div>
            </div>
        </div>
    );

    return (
        <div style={{
            flex: 1, display: 'flex', gap: GAP, padding: GAP, overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)'
        }}>
            <div style={{
                width: 'clamp(220px,26vw,320px)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px',
                background: GL, borderRadius: '20px', padding: 'clamp(14px,1.8vh,20px)', border: WEB_SURFACE.borderSoft, overflow: 'auto'
            }}>
                {ws.knowledgeCategories.map((c: any) => (
                    <GazeButton key={c.id} id={`kc-${c.id}`} onClick={() => { setSelCat(c.id); setSelArt(null); }}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{
                            width: '100%', padding: 'clamp(14px,1.8vh,20px) 14px', textAlign: 'left' as const,
                            background: selCat === c.id ? `${c.color || AC}20` : 'transparent',
                            borderLeft: selCat === c.id ? `4px solid ${c.color || AC}` : '4px solid transparent',
                            borderRadius: '0 14px 14px 0', border: 'none', minHeight: 'clamp(60px,7.5vh,78px)',
                            display: 'flex', alignItems: 'center', gap: '10px'
                        }}>
                        <BookIcon size={28} color={selCat === c.id ? (c.color || AC) : WEB_ACCENTS.oliveText} strokeWidth={2} />
                        <div>
                            <div style={{ fontSize: 'clamp(15px,1.8vh,19px)', fontWeight: 600, color: selCat === c.id ? (c.color || AC) : T.textMain }}>{c.title}</div>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>{c.article_count} articles</div>
                        </div>
                    </GazeButton>
                ))}
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gridTemplateRows: 'repeat(3,1fr)', gap: GAP, overflow: 'hidden', minHeight: 0 }}>
                {selCat && ws.knowledgeArticles.length ? ws.knowledgeArticles.slice(0, 6).map((a: any, i: number) => (
                    <GazeButton key={a.id} id={`ka-${i}`} onClick={() => { setSelArt({ ...a, content: a.summary || 'Loading...' }); ws.getKnowledgeArticle(a.id); }}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={{ ...cs, justifyContent: 'space-between', alignItems: 'flex-start', padding: 'clamp(16px,2.2vh,26px)' }}>
                        <div style={{ fontSize: 'clamp(16px,2vh,20px)', fontWeight: 600, color: T.textMain, lineHeight: 1.35, flex: 1, textAlign: 'left' }}>{a.title}</div>
                        <div style={{
                            fontSize: 'clamp(13px,1.5vh,16px)', color: 'rgba(255,255,255,0.45)', lineHeight: 1.4, marginTop: '8px', textAlign: 'left',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden'
                        }}>{a.summary}</div>
                    </GazeButton>
                )) : (
                    <div style={{
                        gridColumn: '1/-1', gridRow: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(255,255,255,0.25)', fontSize: '18px'
                    }}>
                        {selCat ? 'Loading...' : 'Select a category'}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── QUICK SEARCH PANEL (with gaze cursor forwarding) ──
const QuickSearchPanel = ({ ige, ts, browser, gpRef, goBack: goGridBack, disableGaze, toggleGaze, isNavHidden, browserInteractionMode, onBrowserInteractionModeChange, onTopicActive, onNavHiddenToggle, onEmergency }: {
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
}) => {
    const ws = useWS();
    const [topic, setTopic] = useState<QuickTopic | null>(null);
    const [showLinksSidebar, setShowLinksSidebar] = useState(false);
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
        setShowLinksSidebar(next.mode !== 'web');
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
        setShowLinksSidebar(false);
        disableGaze();
    }, [topic, disableGaze]);

    const speakCardSummary = useCallback(() => {
        if (!topic || !ws.quickSnapshot) return;
        if (topic.id === 'local_weather') {
            const d = ws.quickSnapshot.weather;
            ws.speak(d?.ok ? `Weather in ${d.city}. Temperature ${d.temp_c} degrees. ${d.condition || ''}` : 'Weather data is unavailable right now.');
            return;
        }
        if (topic.id === 'cricket_score') {
            const d = ws.quickSnapshot.cricket;
            ws.speak(d?.ok ? `${d.match}. ${d.summary}. ${d.status}.` : 'Cricket score is unavailable right now.');
            return;
        }
    }, [topic, ws.quickSnapshot, ws.speak]);

    if (isWebTopic && topic) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg, paddingBottom: 'clamp(10px, 1.5vh, 20px)' }}>
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
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                                style={{ ...toolbarBtnConnected('emergency', !!isNavHidden, 'first'), fontWeight: 900, letterSpacing: '0.12em' }}>
                                <EmergencyIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                                <span>Emergency</span>
                            </GazeButton>}
                            <GazeButton id="bv-playpause-r" onClick={() => browser.typeText('k')}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                                style={toolbarBtnConnected('secondary', !!isNavHidden, isNavHidden ? 'middle' : 'first')}>
                                <PlayIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                                <span>Pause / Play</span>
                            </GazeButton>
                            <GazeButton id="bv-show-controls" onClick={toggleBrowserInteractionMode}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'last')}>
                                <PointerIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.3} />
                                <span>Show Controls</span>
                            </GazeButton>
                        </>}

                        {/* CONTROL MODE — full toolset, no duplicates with global nav */}
                        {!isWatchMode && <>
                            {isNavHidden && <GazeButton id="bv-emergency-c" onClick={onEmergency}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                                style={{ ...toolbarBtnConnected('emergency', !!isNavHidden, 'first'), fontWeight: 900, letterSpacing: '0.12em' }}>
                                <EmergencyIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                                <span>Emergency</span>
                            </GazeButton>}
                            <GazeButton id="bv-back" onClick={isNavHidden ? handleBrowserBack : closeWebTopic}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                                style={toolbarBtnConnected('primary', !!isNavHidden, isNavHidden ? 'middle' : 'first')}>
                                <BackIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.4} />
                                <span>{isNavHidden ? 'Back' : 'Close'}</span>
                            </GazeButton>
                            <GazeButton id="bv-hide-controls" onClick={toggleBrowserInteractionMode}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'middle')}>
                                <BookIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.2} />
                                <span>Hide Controls</span>
                            </GazeButton>
                            <GazeButton id="bv-links-toggle" onClick={() => setShowLinksSidebar((s) => !s)}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                                style={toolbarBtnConnected('secondary', !!isNavHidden, isNavHidden ? 'middle' : 'last')}>
                                {showLinksSidebar ? <XIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.3} /> : <WebLayoutIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.1} />}
                                <span>{showLinksSidebar ? 'Hide Links' : 'Links'}</span>
                            </GazeButton>
                            {isNavHidden && <GazeButton id="bv-toggle-nav" onClick={() => { setShowLinksSidebar(false); onNavHiddenToggle?.(!isNavHidden); }}
                                gazeEnabled={toolbarGazeEnabled} gazeEnabledTimestamp={toolbarGazeTimestamp} isDarkMode
                                style={toolbarBtnConnected('primary', !!isNavHidden, 'last')}>
                                <WebLayoutIcon size={toolbarIconSize} color="currentColor" strokeWidth={2.1} />
                                <span>Show Nav</span>
                            </GazeButton>}
                        </>}
                    </div>
                    {/* Status line — small, low-noise */}
                    {!isNavHidden && <div style={{
                        fontSize: 'clamp(13px,1.5vh,16px)', color: T.textSub,
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
                            flex: '0 0 clamp(280px, 25vw, 380px)',
                            height: '100%',
                            background: WEB_SURFACE.panelBg,
                            border: WEB_SURFACE.borderSoft,
                            borderRadius: '16px',
                            padding: 'clamp(12px,1.5vh,18px)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'clamp(8px,1vh,12px)',
                            overflow: 'hidden',
                        }}>
                            <div style={{ fontSize: 'clamp(16px,2vh,20px)', fontWeight: 700, color: T.textMain, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <WebLayoutIcon size={22} color="#789D91" strokeWidth={2.1} />
                                <span>Page Links</span>
                            </div>
                            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
                                {browser.pageLinks.length ? browser.pageLinks.map((link, idx) => (
                                    <GazeButton
                                        key={`${link.href}-${idx}`}
                                        id={`bv-link-${idx}`}
                                        onClick={() => { browser.navigateTo(link.href); disableGaze(); }}
                                        gazeEnabled={ige}
                                        gazeEnabledTimestamp={ts}
                                        isDarkMode
                                        style={{ ...cb, minHeight: 'clamp(72px,8.8vh,98px)', width: '100%', justifyContent: 'flex-start', textAlign: 'left' as const, fontSize: 'clamp(16px,2vh,21px)' }}
                                    >
                                        {link.text}
                                    </GazeButton>
                                )) : (
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(14px,1.8vh,18px)' }}>No links detected on this page.</div>
                                )}
                            </div>
                            <GazeButton id="bv-links-refresh" onClick={() => browser.refreshLinks()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                                style={{ ...toolbarBtn('secondary', false), minHeight: 'clamp(72px,8.6vh,96px)', width: '100%', minWidth: 'auto' }}>
                                <RefreshIcon size={24} color="currentColor" strokeWidth={2.3} />
                                <span>Refresh Links</span>
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
                flex: 1, display: 'flex', flexDirection: 'column', padding: GAP, gap: GAP, overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)'
            }}>
                <div style={{ display: 'flex', gap: 'clamp(14px,2vw,24px)', flexWrap: 'wrap' }}>
                    <GazeButton id="qs-card-back" onClick={() => { setTopic(null); disableGaze(); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={actionButton(DANGER, 'rgba(60, 34, 32, 0.72)', DANGER_BORDER)}>
                        <BackIcon size={26} color="currentColor" strokeWidth={2.4} />
                        <span>Back</span>
                    </GazeButton>
                    <GazeButton id="qs-card-refresh" onClick={() => ws.getQuickSnapshot(true)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={actionButton(INFO)}>
                        <RefreshIcon size={24} color="currentColor" strokeWidth={2.3} />
                        <span>Refresh Data</span>
                    </GazeButton>
                    <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}
                    <GazeButton id="qs-card-open-web" onClick={openLiveWebFromCard} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                        style={actionButton(SUCCESS, 'rgba(36, 48, 32, 0.70)', SUCCESS_BORDER)}>
                        <ExternalIcon size={26} color="currentColor" strokeWidth={2.3} />
                        <span>Open Live Web</span>
                    </GazeButton>
                    <GazeButton id="qs-card-read" onClick={speakCardSummary} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
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
                    <div style={{ fontSize: 'clamp(30px,4.2vh,46px)', fontWeight: 700, color: T.textMain, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
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
        }}>
            <div style={{
                color: T.textMain, fontSize: 'clamp(24px,3vh,32px)', fontWeight: 820,
                flexShrink: 0, fontFamily: FONT_PRIMARY, letterSpacing: '0.04em',
                display: 'flex', alignItems: 'center', gap: '14px',
            }}>
                <SearchIcon size={34} color="#789D91" strokeWidth={2.4} />
                <span>Quick Search</span>
            </div>
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gridAutoRows: 'minmax(clamp(110px, 14vh, 160px), 1fr)',
                gap: 'clamp(16px, 2vh, 24px) clamp(20px, 2.4vw, 36px)',
                overflow: 'hidden', minHeight: 0,
            }}>
                {QUICK_TOPICS.map((t) => (
                    <GazeButton key={t.id} id={`qs-${t.id}`} onClick={() => openTopic(t)}
                        gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="navigationButton"
                        contentFill
                        style={{
                            width: '100%', height: '100%', minHeight: 0,
                            background: '#20221E',
                            border: '1.5px solid rgba(213, 216, 188, 0.14)',
                            borderRadius: '26px',
                            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)',
                            display: 'flex', flexDirection: 'row', alignItems: 'center',
                            position: 'relative',
                            padding: 0, overflow: 'hidden',
                        }}>
                        <div style={{
                            flex: '0 0 22%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            paddingLeft: 'clamp(28px, 2.6vw, 44px)',
                            color: '#789D91',
                        }}>
                            {renderQuickTopicIcon(t.id, 64, '#789D91')}
                        </div>
                        <div style={{
                            flex: '1 1 0', minWidth: 0,
                            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start',
                            padding: 'clamp(14px,1.8vh,22px) clamp(20px,2.4vw,32px) clamp(14px,1.8vh,22px) clamp(14px,1.4vw,22px)',
                        }}>
                            <span style={{
                                fontSize: 'clamp(22px, 2.7vh, 32px)', fontWeight: 820, color: '#ECEDE3',
                                fontFamily: FONT_PRIMARY, lineHeight: 1.1, letterSpacing: 0,
                            }}>{stripLeadingEmoji(t.label)}</span>
                        </div>
                    </GazeButton>
                ))}
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
        }}>
            {/* ── HORIZONTAL TOOLBAR ── */}
            <div style={{ ...toolbarStyle, flexShrink: 0 }}>
                <GazeButton id="bv-close" onClick={close} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...actionButton(DANGER, 'rgba(60, 34, 32, 0.72)', DANGER_BORDER), flex: 1, minWidth: 'clamp(100px,10vw,140px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>
                    <XIcon size={26} color="currentColor" strokeWidth={2.4} />
                    <span>Close</span>
                </GazeButton>
                <GazeButton id="bv-click" onClick={() => browser.clickAtGaze(gpRef.current.x, gpRef.current.y)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...actionButton(WEB_ACCENTS.tealText, 'rgba(28, 47, 45, 0.72)', SOFT_INFO_BORDER), flex: 1.2, minWidth: 'clamp(120px,12vw,160px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>
                    <PointerIcon size={28} color="currentColor" strokeWidth={2.2} />
                    <span>Click Here</span>
                </GazeButton>
                <GazeButton id="bv-up" onClick={() => browser.scrollUp()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...actionButton(WEB_ACCENTS.blueText), flex: 1, minWidth: 'clamp(100px,10vw,130px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>
                    <ArrowUpIcon size={26} color="currentColor" strokeWidth={2.3} />
                    <span>Up</span>
                </GazeButton>
                <GazeButton id="bv-down" onClick={() => browser.scrollDown()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    style={{
                        ...actionButton(WEB_ACCENTS.blueText), flex: 1, minWidth: 'clamp(100px,10vw,130px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>
                    <ArrowDownIcon size={26} color="currentColor" strokeWidth={2.3} />
                    <span>Down</span>
                </GazeButton>

                <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}

                <GazeButton id="bv-back" onClick={() => browser.canGoBack && browser.goBack()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                    disabled={!browser.canGoBack}
                    style={{
                        ...actionButton(WEB_ACCENTS.goldText, 'rgba(49, 36, 20, 0.72)', 'rgba(178, 138, 69, 0.22)'), flex: 1, minWidth: 'clamp(80px,8vw,110px)',
                        fontSize: 'clamp(17px,2.2vh,22px)', padding: 'clamp(14px,2vh,22px) clamp(16px,2vw,24px)'
                    }}>
                    <BackIcon size={26} color="currentColor" strokeWidth={2.4} />
                    <span>Back</span>
                </GazeButton>
                <GazeButton id="bv-fwd" onClick={() => browser.canGoForward && browser.goForward()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
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
                fontSize: 'clamp(15px,1.8vh,18px)', color: WEB_ACCENTS.oliveText, padding: 'clamp(6px,1vh,10px) clamp(14px,2vw,24px)',
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
            marginTop: isNavHidden ? '0' : 'clamp(95px,12.5vh,125px)', paddingBottom: 'clamp(20px, 2.5vh, 40px)', transition: 'margin-top 0.3s ease'
        }}>
            <div style={{ ...cs, width: 'clamp(420px,42vw,620px)', height: 'auto', padding: 'clamp(40px,5.5vh,65px)', gap: 'clamp(20px,3.2vh,36px)', border: WEB_SURFACE.borderSoft }}>
                <div style={{ color: WEB_ACCENTS.oliveText, display: 'flex', filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.25))' }}><WhatsAppIcon size={88} /></div>
                <h2 style={{ fontSize: 'clamp(24px,3.2vh,34px)', fontWeight: 700, color: T.textMain, margin: 0, fontFamily: FONT_PRIMARY }}>WhatsApp Web</h2>
                <p style={{ fontSize: 'clamp(15px,2vh,19px)', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0, textAlign: 'center', maxWidth: '420px' }}>
                    Connect WhatsApp to send messages using eye gaze. Scan a QR code with your phone.
                </p>
                <GazeButton id="wa-connect" onClick={() => setConnected(true)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg, paddingBottom: 'clamp(20px, 2.5vh, 40px)' }}>
                <div style={{
                    flex: '0 0 clamp(170px, 20vh, 220px)', width: '100%',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    padding: '0 clamp(16px,2vw,24px)', boxSizing: 'border-box'
                }}>
                    <div style={toolbarStyle}>
                        <GazeButton id="soc-close" onClick={() => { browser.closePage(); setTopic(null); }} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...browserToolbarButton(DANGER, 'rgba(60, 34, 32, 0.72)', DANGER_BORDER), flex: 1 }}>
                            <XIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.4} />
                            <span>Close</span>
                        </GazeButton>
                        <GazeButton id="soc-click" onClick={() => browser.clickAtGaze(gpRef.current.x, gpRef.current.y)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...browserToolbarButton(WEB_ACCENTS.tealText, 'rgba(28, 47, 45, 0.72)', SOFT_INFO_BORDER), flex: 1 }}>
                            <PointerIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.2} />
                            <span>Click Here</span>
                        </GazeButton>
                        <GazeButton id="soc-up" onClick={() => browser.scrollUp()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...browserToolbarButton(WEB_ACCENTS.blueText), flex: 1 }}>
                            <ArrowUpIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.3} />
                            <span>Up</span>
                        </GazeButton>
                        <GazeButton id="soc-down" onClick={() => browser.scrollDown()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...browserToolbarButton(WEB_ACCENTS.blueText), flex: 1 }}>
                            <ArrowDownIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.3} />
                            <span>Down</span>
                        </GazeButton>

                        <div style={{ flexBasis: 'clamp(60px, 8vw, 100px)', flexShrink: 0 }} /> {/* Safe Zone for Gaze Toggle */}

                        <GazeButton id="soc-back" onClick={() => browser.goBack()} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...browserToolbarButton(WEB_ACCENTS.goldText, 'rgba(49, 36, 20, 0.72)', 'rgba(178, 138, 69, 0.22)'), flex: 1 }}>
                            <BackIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.4} />
                            <span>{browser.canGoBack ? 'Back' : 'Exit'}</span>
                        </GazeButton>
                        <GazeButton id="soc-zoom-in" onClick={() => browser.adjustZoom(0.25)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
                            style={{ ...browserToolbarButton(SOFT_INFO), minWidth: 'clamp(92px,7vw,118px)' }}>
                            <ZoomIcon size={browserToolbarIconSize} color="currentColor" strokeWidth={2.2} direction="in" />
                            <span>+</span>
                        </GazeButton>
                        <GazeButton id="soc-zoom-out" onClick={() => browser.adjustZoom(-0.25)} gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode
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

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg, padding: 'clamp(20px, 4vh, 60px)' }}>
            <h2 style={{ fontSize: 'clamp(32px, 4.5vh, 48px)', color: T.textMain, marginBottom: 'clamp(40px, 6vh, 80px)', fontFamily: FONT_PRIMARY, fontWeight: 800 }}>
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
                        isDarkMode
                        style={{
                            ...cb,
                            flex: 1,
                            height: 'clamp(170px, 23vh, 240px)',
                            borderRadius: '26px',
                            fontFamily: FONT_PRIMARY,
                            fontSize: 'clamp(25px, 3vh, 36px)',
                            fontWeight: 800,
                            background: card.bg,
                            border: WEB_SURFACE.borderSoft,
                            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 26px rgba(0, 0, 0, 0.30)',
                            color: T.textMain,
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
const HUB_CARDS = [
    { id: 'news', label: 'News Feed', labelHindi: 'समाचार', accent: WEB_ACCENTS.maroon, bg: 'rgba(45, 27, 24, 0.94)' },
    { id: 'youtube', label: 'YouTube', labelHindi: 'यूट्यूब', accent: WEB_ACCENTS.gold, bg: 'rgba(42, 33, 19, 0.94)' },
    { id: 'knowledge', label: 'ALS Knowledge', labelHindi: 'जानकारी', accent: WEB_ACCENTS.olive, bg: 'rgba(31, 38, 27, 0.94)' },
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
    const { isLight } = useTheme();
    const { data: { settings } } = useCustomization();
    const [view, setView] = useState<ViewState>('grid');
    const { isGazeEnabled: ige, lastEnabledTimestamp: ts, disableGaze, enableGaze } = useGazeControl();
    const browser = useGazeBrowser();
    const ws = useWS();
    const { hasRealGaze } = useRealGaze();
    const [gp, setGp] = useState({ x: 0, y: 0 });
    const gpRef = useRef({ x: 0, y: 0 });
    const [windowBounds, setWindowBounds] = useState<{ x: number; y: number; width: number; height: number; screenWidth: number; screenHeight: number; scaleFactor: number; isFullScreen: boolean; isMaximized: boolean; } | null>(null);
    const windowBoundsRef = useRef<typeof windowBounds>(null);
    const [isNavHidden, setIsNavHidden] = useState(false);
    const [isQsTopicActive, setIsQsTopicActive] = useState(false);
    const [isYtVideoActive, setIsYtVideoActive] = useState(false);
    const [browserInteractionMode, setBrowserInteractionMode] = useState<BrowserInteractionMode>('control');
    const isEmbeddedBrowserActive = (view === 'search' && isQsTopicActive) || (view === 'youtube' && isYtVideoActive);
    const isBrowserWatchMode = isEmbeddedBrowserActive && browserInteractionMode === 'watch';

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
        if (isEmbeddedBrowserActive) {
            setBrowserInteractionMode('watch');
            return;
        }
        setBrowserInteractionMode('control');
    }, [isEmbeddedBrowserActive]);

    useEffect(() => {
        if (isEmbeddedBrowserActive && isNavHidden && !ige) {
            enableGaze();
        }
    }, [enableGaze, ige, isEmbeddedBrowserActive, isNavHidden]);

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
            setGp({ x: rawX, y: rawY });
        });
        return unsub;
    }, [ws.subscribeGaze]);

    // ── MOUSE FALLBACK for simulation mode (no eye tracker) ──
    useEffect(() => {
        const h = (e: MouseEvent) => {
            // Only use mouse position when no real gaze data is present
            if (!hasRealGaze) {
                gpRef.current = { x: e.clientX, y: e.clientY };
                setGp({ x: e.clientX, y: e.clientY });
            }
        };
        window.addEventListener('mousemove', h);
        return () => window.removeEventListener('mousemove', h);
    }, [hasRealGaze]);

    // ── FORWARD GAZE POSITION into BrowserView cursor (v18 stability profile) ──
    // Calibrated against the Keyboard screen's "excellent" feel which uses
    // alpha=0.38 smoothing + 90px/0.10 snap. This filter brings the Web Browsing
    // experience closer to that responsiveness without compounding the in-page
    // 70px / 800ms dwell gate.
    //
    //  Stage A — Saccade (>55px): clear intent to look elsewhere. Snap cursor
    //    immediately and start a fresh fixation timer. Threshold lowered 60→55
    //    so re-fixation feels snappier without losing blink absorption.
    //  Stage B — Tremor gate (<12px): natural ALS pupil/eyelid micro-tremor.
    //    Cursor stays frozen. Fixation timer keeps running. Tightened 15→12
    //    because heavier smoothing already absorbs small drift.
    //  Stage C — Fixation lock (after 130ms, drift <50px): once patient has
    //    fixated for 130ms, hold cursor — wider 50px drift tolerance keeps
    //    the in-page 70px stability gate satisfied through ALS micro-saccades.
    //    Lock activation 200→130ms = patient feels stability ~70ms sooner.
    //  Stage D — Smoothing (12-55px, pre-lock): EWMA alpha=0.30 — twice as
    //    responsive as previous 0.16. Cursor visually tracks gaze with ~3
    //    frame delay (~100ms) instead of the prior ~200ms.
    //
    // Combined timing budget (worst case, target acquisition):
    //   saccade snap (instant) → fixation 130ms → in-page dwell 800ms = 930ms
    //   vs previous: 200ms + 1000ms = 1200ms (22% faster).
    const smoothedGazeRef = useRef<{ x: number; y: number; fixationStartedAt: number } | null>(null);
    useEffect(() => {
        if (!browser.isOpen) return;
        smoothedGazeRef.current = null;
        const interval = setInterval(() => {
            if (!ige || isBrowserWatchMode) return;
            const raw = gpRef.current;
            const prev = smoothedGazeRef.current;
            const now = performance.now();

            if (!prev) {
                smoothedGazeRef.current = { x: raw.x, y: raw.y, fixationStartedAt: now };
                browser.updateGazeCursor(raw.x, raw.y);
                return;
            }

            const dx = raw.x - prev.x;
            const dy = raw.y - prev.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Stage A: Saccade — snap to new position, reset fixation
            if (dist > 55) {
                smoothedGazeRef.current = { x: raw.x, y: raw.y, fixationStartedAt: now };
                browser.updateGazeCursor(raw.x, raw.y);
                return;
            }

            // Stage B: Tremor gate — freeze on small drift
            if (dist < 12) {
                browser.updateGazeCursor(prev.x, prev.y);
                return;
            }

            // Stage C: Fixation lock — fast activation, wide drift tolerance
            const fixationMs = now - prev.fixationStartedAt;
            if (fixationMs > 130 && dist < 50) {
                browser.updateGazeCursor(prev.x, prev.y);
                return;
            }

            // Stage D: Responsive EWMA — alpha=0.30 (was 0.16)
            const alpha = 0.30;
            const next = {
                x: prev.x + dx * alpha,
                y: prev.y + dy * alpha,
                fixationStartedAt: now,
            };
            smoothedGazeRef.current = next;
            browser.updateGazeCursor(next.x, next.y);
        }, 33);
        return () => clearInterval(interval);
    }, [browser.isOpen, ige, isBrowserWatchMode]);

    const goBack = useCallback(() => {
        browser.closePage();
        setIsQsTopicActive(false);
        setIsYtVideoActive(false);
        setIsNavHidden(false);
        setBrowserInteractionMode('control');
        setView('grid');
    }, [browser]);

    if (view !== 'grid') return (
        <div className={`web-hub-screen${isLight ? ' theme-light' : ''}`} data-gaze-context="webbrowse" style={{ position: 'absolute', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                {view === 'search' && <QuickSearchPanel ige={ige} ts={ts} browser={browser} gpRef={gpRef} goBack={goBack} disableGaze={disableGaze} toggleGaze={toggleGaze} isNavHidden={isNavHidden} browserInteractionMode={browserInteractionMode} onBrowserInteractionModeChange={setBrowserInteractionMode} onTopicActive={setIsQsTopicActive} onNavHiddenToggle={setIsNavHidden} onEmergency={handleEmergency} />}
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

        return (
            <GazeButton key={card.id} id={`hub-${card.id}`} onClick={() => setView(card.id as ViewState)}
                gazeEnabled={ige} gazeEnabledTimestamp={ts} isDarkMode dwellCategory="homeScreenTile"
                contentFill={true}
                style={{
                    width: '100%', height: '100%',
                    minHeight: 0,
                    borderRadius: '26px', overflow: 'hidden', cursor: 'pointer',
                    border: HUB_UNIFIED_CARD_BORDER,
                    background: visual.bg,
                    boxShadow: HUB_UNIFIED_CARD_SHADOW,
                    transition: 'transform 150ms ease, background 150ms ease, filter 150ms ease',
                    padding: 0
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.filter = 'brightness(1.025)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.filter = 'brightness(1)';
                }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', height: '100%', alignItems: 'center', position: 'relative' }}>
                    <div style={{
                        flex: '0 0 36%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingLeft: 'clamp(34px, 3.6vw, 60px)',
                        color: visual.accent,
                        opacity: visual.iconOpacity,
                    }}>
                        {renderHubIcon(card.id, visual.iconSize, visual.accent)}
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
                            fontSize: 'clamp(30px, 3.4vh, 43px)', color: '#ECEDE3',
                            textAlign: 'left', lineHeight: 1.08, letterSpacing: 0,
                            textShadow: '0 1px 1px rgba(0,0,0,0.10)',
                        }}>
                            {card.label}
                        </span>
                        {showHindi && (
                            <span style={{
                                fontFamily: "'Noto Sans Devanagari', sans-serif", fontWeight: 700,
                                fontSize: 'clamp(20px, 2.4vh, 28px)', color: '#B0BFB6',
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

    const HUB_GRID_ROW: React.CSSProperties = {
        display: 'grid',
        gridAutoRows: 'minmax(clamp(220px, 26vh, 300px), 1fr)',
        gap: 'clamp(22px, 2.8vw, 40px)',
        justifyContent: 'center',
        width: '100%',
    };

    return (
        <div className={`web-hub-screen${isLight ? ' theme-light' : ''}`} style={{ position: 'absolute', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 'clamp(20px, 2.5vh, 40px)' }}>
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
                gap: 'clamp(22px, 3vh, 36px)',
                padding: '0 clamp(28px, 3.5vw, 60px)',
                boxSizing: 'border-box',
            }}>
                {/* Both rows use the same 3-column template so the second row's
                    two cards align with the first row's first two cards (column 1
                    and column 2). The third column on row 2 is empty by design — no
                    orphan cell, just structured negative space. */}
                <div style={{
                    ...HUB_GRID_ROW,
                    gridTemplateColumns: 'repeat(3, minmax(0, clamp(330px, 28vw, 500px)))',
                }}>
                    {HUB_CARDS.slice(0, 3).map(renderHubCard)}
                </div>
                <div style={{
                    ...HUB_GRID_ROW,
                    gridTemplateColumns: 'repeat(3, minmax(0, clamp(330px, 28vw, 500px)))',
                }}>
                    {HUB_CARDS.slice(3).map(renderHubCard)}
                </div>
            </div>
        </div>
    );
};

export default WebBrowsingScreen;
