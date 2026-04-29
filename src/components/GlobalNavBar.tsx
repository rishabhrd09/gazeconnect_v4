/**
 * GlobalNavBar - Consistent Navigation on ALL Pages
 * ==================================================
 * Shows ALL 5 buttons on EVERY page:
 * - 🏠 Home
 * - ⌨️ Keyboard
 * - 🏥 Medical
 * - 🆘 EMERGENCY
 * - 👁 Gaze ON/OFF (toggle)
 *
 * All buttons always visible, large, centered at top.
 * Responsive: 13"–27" via clamp() — identical on 23" (1920×1080)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { darkColors, lightColors, typography } from '../utils/design';
import { useGazeControl } from './core/GazeControlToggle';
import { useFocusMode } from '../contexts/FocusModeContext';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';

interface GlobalNavBarProps {
    currentPage: string;
    onNavigate: (screen: string) => void;
    onSpeak: (text: string) => void;
    isDarkMode?: boolean;
    compact?: boolean;
    showZoneBoardButton?: boolean;
    /** Show MORE/NAV toggle button right of gaze toggle (keyboard screen) */
    showMoreToggle?: boolean;
    /** Whether nav-hidden mode is active */
    moreActive?: boolean;
    /** Callback when MORE/NAV toggle is clicked */
    onMoreToggle?: () => void;
    /** Callback to restart compass survey (only from compass screen) */
    onRestartCompass?: () => void;
    /** Controlled state for when the nav is hidden */
    isNavHidden?: boolean;
    /** Callback when the hide nav button is toggled */
    onNavHiddenToggle?: (hidden: boolean) => void;
    /** Callback when Quick Words button is clicked (opens overlay instead of navigating) */
    onQuickWords?: () => void;
    /** Override bottom offset for the fixed Gaze Hub (e.g. on Quick Words screen) */
    gazePositionOffset?: string;
    /** When provided, renders a Back button in the nav pill that calls this callback */
    onBack?: () => void;
}

const navIconStyle: React.CSSProperties = {
    width: 'clamp(19px, 2.4vh, 26px)',
    height: 'clamp(19px, 2.4vh, 26px)',
    flexShrink: 0,
};

const HomeNavIcon: React.FC = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={navIconStyle}>
        <path d="M3.5 10.5 12 3.5l8.5 7" />
        <path d="M5.5 9.5V20h13V9.5" />
        <path d="M9.5 20v-6h5v6" />
    </svg>
);

const KeyboardNavIcon: React.FC = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={navIconStyle}>
        <rect x="3" y="6" width="18" height="12" rx="2.5" />
        <path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M7 14h.01M10.5 14h7" />
    </svg>
);

const GlobalNavBarComponent: React.FC<GlobalNavBarProps> = ({
    currentPage,
    onNavigate,
    onSpeak,
    isDarkMode = true,
    compact = false,
    showZoneBoardButton = false,
    showMoreToggle = false,
    moreActive = false,
    onMoreToggle,
    onRestartCompass,
    isNavHidden: externalIsNavHidden,
    onNavHiddenToggle,
    onQuickWords,
    gazePositionOffset,
    onBack,
}) => {
    const colors = isDarkMode ? darkColors : lightColors;
    const navFontFamily = "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif";
    const emergencyFontFamily = `'Arial Black', ${typography.fontFamily.primary}`;
    const { isGazeEnabled, toggleGaze } = useGazeControl();
    const { isFocusMode } = useFocusMode();
    const { data: { settings } } = useCustomization();
    const { theme } = useTheme();
    const useHomeNavPalette = currentPage === 'home';
    const homeNavigationColors = theme === 'mix' ? {
        ...darkColors.navigation,
        pillBackground: 'rgba(36, 30, 23, 0.96)',
        pillBorder: 'rgba(180, 157, 112, 0.34)',
        pillShadow: '0 8px 22px rgba(0,0,0,0.30)',
        idleBackground: 'rgba(17, 14, 11, 0.42)',
        idleText: '#D8C8A8',
        activeBackground: 'rgba(196, 178, 142, 0.30)',
        activeBorder: 'rgba(196, 178, 142, 0.46)',
        activeShadow: 'inset 0 0 0 1px rgba(240, 226, 196, 0.10)',
        activeText: '#F7E9CB',
        gazeBackgroundOn: '#3B3123',
        gazeBackgroundOff: '#191510',
        gazeBorderOn: '#D6C98E',
        gazeBorderOff: '#8B6F49',
        gazeGlow: '0 0 16px rgba(214, 201, 142, 0.16)',
        gazeTextOn: '#F7E9CB',
        gazeTextOff: '#EADAB8',
    } : theme === 'dark' ? {
        ...darkColors.navigation,
        pillBackground: 'rgba(27, 28, 24, 0.94)',
        pillBorder: 'rgba(213, 216, 188, 0.18)',
        pillShadow: '0 8px 20px rgba(0,0,0,0.28)',
        idleBackground: 'rgba(9, 10, 8, 0.42)',
        idleText: '#B8B4A8',
        activeBackground: 'rgba(213, 216, 188, 0.18)',
        activeBorder: 'rgba(213, 216, 188, 0.28)',
        activeShadow: 'inset 0 0 0 1px rgba(236, 237, 227, 0.08)',
        activeText: '#ECEDE3',
        gazeBackgroundOn: '#2C2D25',
        gazeBackgroundOff: '#121914',
        gazeBorderOn: '#D6C98E',
        gazeBorderOff: '#676B55',
        gazeGlow: '0 0 16px rgba(214, 201, 142, 0.16)',
        gazeTextOn: '#ECEDE3',
        gazeTextOff: '#D4D0C2',
    } : {
        ...lightColors.navigation,
        pillBackground: 'rgba(232, 215, 186, 0.92)',
        pillBorder: 'rgba(122, 99, 71, 0.22)',
        pillShadow: '0 8px 16px rgba(122, 99, 71, 0.10)',
        idleBackground: 'rgba(240, 228, 203, 0.86)',
        idleText: '#7A6347',
        activeBackground: 'rgba(196, 179, 146, 0.28)',
        activeBorder: 'rgba(122, 99, 71, 0.28)',
        activeShadow: 'inset 0 0 0 1px rgba(255, 248, 236, 0.18)',
        activeText: '#5A4530',
        gazeBackgroundOn: '#D9C8A6',
        gazeBackgroundOff: '#D9C8A6',
        gazeBorderOn: '#7A6347',
        gazeBorderOff: '#7A6347',
        gazeGlow: '0 0 0 1px rgba(122, 99, 71, 0.10), 0 6px 14px rgba(122, 99, 71, 0.10)',
        gazeTextOn: '#5A4530',
        gazeTextOff: '#5A4530',
        auxiliaryBackground: 'rgba(236, 223, 195, 0.92)',
        auxiliaryBorder: 'rgba(122, 99, 71, 0.24)',
    };
    const navigationColors = useHomeNavPalette ? homeNavigationColors : colors.navigation;
    const homeEmergencyStyle = theme === 'light'
        ? { background: '#7A363A', text: '#FBE9DE', border: 'rgba(122, 54, 58, 0.6)' }
        : { background: '#4A2023', text: '#F0A5A5', border: '#8A3B38' };

    // Keyboard/spatial screens get enhanced nav bar (taller buttons, dead zones, shifted pill)
    const isKbOrSpatial = currentPage === 'keyboard' || currentPage === 'spatial';
    // Compass map screen gets extra-tall, wide buttons with dead zones
    const isCompassMap = currentPage === 'compass-map';

    const [localIsNavHidden, setLocalIsNavHidden] = React.useState(false);
    const isNavHidden = externalIsNavHidden !== undefined ? externalIsNavHidden : localIsNavHidden;

    const [emergencyActivated, setEmergencyActivated] = useState(false);
    const emergencyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => { if (emergencyTimerRef.current) clearTimeout(emergencyTimerRef.current); };
    }, []);

    const handleNavHiddenToggle = () => {
        const nextState = !isNavHidden;
        setLocalIsNavHidden(nextState);
        onNavHiddenToggle?.(nextState);
    };

    // Style overrides when Focus Mode is active — nav buttons become non-interactive
    const focusDisabledStyle: React.CSSProperties = isFocusMode ? {
        opacity: 0.3,
        pointerEvents: 'none',
        filter: 'grayscale(60%)',
    } : {};

    const handleEmergency = useCallback(() => {
        const enPhrase = settings?.emergencyPhraseEn || 'I need help immediately! This is an emergency!';
        const hiPhrase = settings?.emergencyPhraseHi || 'मुझे तुरंत मदद चाहिए! यह एक आपातकालीन स्थिति है!';
        const fullPhrase = settings?.showHindi
            ? `${enPhrase} ... ${hiPhrase}`
            : enPhrase;
        onSpeak(fullPhrase);
        setEmergencyActivated(true);
        if (emergencyTimerRef.current) clearTimeout(emergencyTimerRef.current);
        emergencyTimerRef.current = setTimeout(() => {
            setEmergencyActivated(false);
        }, 3200);
    }, [onSpeak, settings]);

    const getNavButtonClassName = (screen: string) => {
        const classes = ['gaze-button', 'nav-btn'];
        classes.push(`nav-btn-${screen.replace(/_/g, '-').replace(/^--/, '')}`);
        if (currentPage === screen) classes.push('nav-btn-active');
        if (screen === '__back__') classes.push('nav-btn-back');
        return classes.join(' ');
    };

    // Button styles
    const getButtonStyle = (screen: string, isEmergency = false) => {
        const isCurrentPage = currentPage === screen;
        const isBackButton = screen === '__back__';

        if (isEmergency) {
            return {
                padding: compact
                    ? 'clamp(6px, 1vh, 10px) clamp(14px, 2vw, 24px)'
                    : 'clamp(8px, 1.2vh, 14px) clamp(18px, 2.5vw, 32px)',
                backgroundColor: useHomeNavPalette ? homeEmergencyStyle.background : isDarkMode ? 'rgba(140, 50, 50, 0.35)' : lightColors.emergency.main,
                border: useHomeNavPalette ? `1.5px solid ${homeEmergencyStyle.border}` : isDarkMode ? '2px solid rgba(180, 70, 70, 0.50)' : `1.5px solid ${lightColors.emergency.hover}`,
                borderRadius: 'clamp(14px, 2vh, 20px)',
                color: useHomeNavPalette ? homeEmergencyStyle.text : isDarkMode ? '#D08080' : lightColors.text.inverse,
                fontSize: 'clamp(16px, 2vh, 21px)',
                fontWeight: 900 as const,
                cursor: 'pointer',
                minHeight: isCompassMap ? 'clamp(90px, 11vh, 130px)' : isKbOrSpatial ? '118px' : (compact
                    ? 'clamp(58px, 8vh, 80px)'
                    : 'clamp(82px, 12vh, 120px)'),
                ...(isKbOrSpatial ? { height: '118px' } : {}),
                ...(isCompassMap ? { height: 'clamp(90px, 11vh, 130px)' } : {}),
                minWidth: isCompassMap
                    ? 'clamp(140px, 14vw, 220px)'
                    : (compact
                        ? 'clamp(160px, 17vw, 220px)'
                        : 'clamp(210px, 22vw, 320px)'),
                boxShadow: isDarkMode ? '0 4px 16px rgba(0,0,0,0.30)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: 'clamp(8px, 1vw, 12px)',
                justifyContent: 'center',
                flexDirection: 'row' as const,
                letterSpacing: isDarkMode ? '1.8px' : '0.05em',
                fontFamily: emergencyFontFamily,
                textTransform: isDarkMode ? 'uppercase' as const : 'none' as const,
                transition: 'all 0.2s ease',
            };
        }

        return {
            padding: isCompassMap
                ? 'clamp(14px, 2vh, 22px) clamp(14px, 2vw, 28px)'
                : (compact
                    ? 'clamp(12px, 1.8vh, 18px) clamp(16px, 2.2vw, 32px)'
                    : 'clamp(16px, 2.3vh, 26px) clamp(22px, 3.2vw, 42px)'),
            fontSize: isCompassMap ? 'clamp(18px, 2.5vh, 25px)' : 'clamp(17px, 2.3vh, 23px)',
            fontWeight: isCurrentPage ? 700 : 600,
            cursor: 'pointer',
            minHeight: isCompassMap ? 'clamp(90px, 11vh, 130px)' : isKbOrSpatial ? '118px' : (compact
                ? 'clamp(50px, 7vh, 72px)'
                : 'clamp(82px, 12vh, 120px)'),
            ...(isKbOrSpatial ? { height: '118px' } : {}),
            ...(isCompassMap ? { height: 'clamp(90px, 11vh, 130px)' } : {}),
            minWidth: isCompassMap
                ? 'clamp(120px, 11vw, 190px)'
                : isKbOrSpatial
                    ? (compact ? 'clamp(100px, 10vw, 160px)' : 'clamp(140px, 14vw, 230px)')
                    : (compact ? 'clamp(90px, 9vw, 140px)' : 'clamp(120px, 12vw, 200px)'),
            background: isCurrentPage
                ? navigationColors.activeBackground
                : isBackButton
                    ? navigationColors.backBackground
                    : navigationColors.idleBackground,
            border: `1px solid ${isCurrentPage
                ? navigationColors.activeBorder
                : isBackButton
                    ? navigationColors.backBorder
                    : 'transparent'}`,
            boxShadow: isCurrentPage
                ? navigationColors.activeShadow
                : isBackButton
                    ? navigationColors.backShadow
                    : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(8px, 1.2vw, 12px)',
            justifyContent: 'center',
            opacity: 1,
            borderRadius: '10px',
            color: isCurrentPage ? navigationColors.activeText : navigationColors.idleText,
            fontFamily: navFontFamily,
            transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
        };
    };

    // Back button mapping: which screens get a back button and where it goes
    const BACK_TARGETS: Record<string, string> = {
        'floor-plan-survey': 'floor-plan',
        'compass-map': 'floor-plan',
        'advanced-map': 'compass-map',
    };
    const backTarget = BACK_TARGETS[currentPage] || null;

    return (
        <>
            <div
                className="nav-bar-container"
                data-gaze-screen={currentPage}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    alignItems: 'center',
                    padding: compact
                        ? 'clamp(8px, 1.2vh, 14px) clamp(16px, 2vw, 30px) clamp(10px, 1.5vh, 18px)'
                        : isKbOrSpatial
                            ? 'clamp(6px, 1vh, 10px) clamp(20px, 2.5vw, 36px) clamp(10px, 1.5vh, 16px)'
                            : 'clamp(10px, 1.5vh, 16px) clamp(20px, 2.5vw, 36px) clamp(14px, 2vh, 24px)',
                    marginBottom: '0px',
                    marginTop: compact
                        ? 'clamp(6px, 1vh, 14px)'
                        : isKbOrSpatial
                            ? 'clamp(4px, 1vh, 12px)'
                            : 'clamp(14px, 1.8vh, 20px)',
                    borderBottom: `1px solid ${navigationColors.containerDivider}`,
                    boxShadow: isDarkMode
                        ? '0 16px 24px -28px rgba(0,0,0,0.62)'
                        : '0 12px 18px -22px rgba(82, 66, 45, 0.18)',
                }}>


                <div style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: currentPage === 'keyboard' ? 'clamp(30px, 4vw, 60px)' : currentPage === 'home' ? 'clamp(120px, 14vw, 220px)' : 'clamp(80px, 10vw, 160px)' }}>
                    {/* EMERGENCY — rounded rect with icon + text label (AAC compliant) */}
                    <button
                        onClick={handleEmergency}
                        className="gaze-button emergency-help-btn"
                        data-gaze="true"
                        data-gaze-always="true"
                        data-gaze-context="emergency"
                        style={getButtonStyle('__emergency__', true)}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'clamp(24px, 3.2vh, 36px)', height: 'clamp(24px, 3.2vh, 36px)', flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="7" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <span style={{
                            fontFamily: emergencyFontFamily,
                            fontSize: 'clamp(18px, 2.35vh, 24px)',
                            fontWeight: 900,
                            letterSpacing: isDarkMode ? '0.14em' : '0.08em',
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                        }}>
                            {isDarkMode ? 'EMERGENCY' : 'Emergency'}
                        </span>
                    </button>
                </div>

                {/* CENTER CELL - Navigation Pill */}
                <div style={{ display: 'flex', justifyContent: 'center', ...(currentPage === 'keyboard' ? { marginLeft: 'clamp(-110px, -11vw, -170px)' } : currentPage === 'spatial' ? { marginLeft: 'clamp(-30px, -3vw, -50px)' } : isCompassMap ? { marginLeft: 'clamp(-50px, -5vw, -80px)' } : {}) }}>
                    {currentPage === 'home' ? (
                        <div
                            aria-hidden="true"
                            style={{
                                minHeight: compact ? 'clamp(50px, 7vh, 72px)' : 'clamp(82px, 12vh, 120px)',
                                minWidth: 'clamp(360px, 34vw, 560px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 'clamp(10px, 1.1vw, 18px)',
                                transform: 'translateX(clamp(6px, 0.9vw, 16px))',
                                color: theme === 'light' ? '#7A6347' : theme === 'mix' ? '#B49362' : '#B4AB96',
                                fontFamily: navFontFamily,
                                fontSize: theme === 'light' ? 'clamp(28px, 4vh, 48px)' : 'clamp(30px, 4.4vh, 54px)',
                                fontWeight: 850,
                                letterSpacing: theme === 'light' ? '0.14em' : '0.18em',
                                textTransform: 'uppercase',
                                lineHeight: 1,
                                userSelect: 'none',
                                textShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.26)' : 'none',
                            }}
                        >
                            <span>GAZE</span>
                            <span>CONNECT</span>
                        </div>
                    ) : !isNavHidden && (
                        <div className={`nav-pill ${isDarkMode ? 'nav-pill-dark' : 'nav-pill-light'}`} style={{
                            display: 'flex',
                            background: navigationColors.pillBackground,
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: `1px solid ${navigationColors.pillBorder}`,
                            borderRadius: '24px',
                            overflow: 'hidden',
                            boxShadow: navigationColors.pillShadow,
                            gap: (isKbOrSpatial || isCompassMap) ? '0px' : '1px',
                        }}>
                            {/* BACK — custom callback (e.g. web browsing panels) */}
                            {onBack && (
                                <button
                                    onClick={onBack}
                                    className={getNavButtonClassName('__back__')}
                                    data-gaze="true"
                                    data-gaze-context="navigation"
                                    style={{
                                        ...getButtonStyle('__back__'),
                                        ...focusDisabledStyle,
                                    }}
                                >
                                    <span style={{ fontSize: 'clamp(14px, 2vh, 20px)' }}>←</span>
                                    Back
                                </button>
                            )}

                            {/* BACK — only on design-home sub-screens */}
                            {backTarget && !onBack && (
                                <button
                                    onClick={() => onNavigate(backTarget)}
                                    className={getNavButtonClassName('__back__')}
                                    data-gaze="true"
                                    data-gaze-context="navigation"
                                    style={{
                                        ...getButtonStyle('__back__'),
                                        ...focusDisabledStyle,
                                    }}
                                >
                                    <span style={{ fontSize: 'clamp(14px, 2vh, 20px)' }}>←</span>
                                    Back
                                </button>
                            )}

                            {/* Dead zone — compass map: between Back and Home */}
                            {isCompassMap && backTarget && (
                                <div style={{ width: 'clamp(6px, 0.6vw, 10px)', pointerEvents: 'none', flexShrink: 0 }} />
                            )}

                            {/* HOME — always shown */}
                            <button
                                onClick={() => onNavigate('home')}
                                className={getNavButtonClassName('home')}
                                data-gaze="true"
                                data-gaze-context="navigation"
                                style={{ ...getButtonStyle('home'), ...focusDisabledStyle }}
                            >
                                <HomeNavIcon />
                                <span style={{ fontSize: 'clamp(16px, 2.2vh, 22px)' }}>🏠</span>
                                Home
                            </button>

                            {/* Dead zone — compass map: between Home and Keyboard */}
                            {isCompassMap && (
                                <div style={{ width: 'clamp(6px, 0.6vw, 10px)', pointerEvents: 'none', flexShrink: 0 }} />
                            )}

                            {/* === KEYBOARD/SPATIAL SCREENS: Home | ZoneBoard/Keyboard | Quick Words with dead zones === */}
                            {isKbOrSpatial && (
                                <>
                                    {/* Dead zone separator */}
                                    <div style={{ width: 'clamp(4px, 0.5vw, 8px)', pointerEvents: 'none', flexShrink: 0 }} />

                                    {/* KEYBOARD — shown on zone board screen */}
                                    {currentPage === 'spatial' && (
                                        <button
                                            onClick={() => onNavigate('keyboard')}
                                            className={getNavButtonClassName('keyboard')}
                                            data-gaze="true"
                                            data-gaze-context="navigation"
                                            style={{ ...getButtonStyle('keyboard'), ...focusDisabledStyle }}
                                        >
                                            <KeyboardNavIcon />
                                            <span style={{ fontSize: 'clamp(16px, 2.2vh, 22px)' }}>⌨️</span>
                                            Keyboard
                                        </button>
                                    )}

                                    {/* ZONE BOARD — shown on keyboard screen */}
                                    {currentPage === 'keyboard' && showZoneBoardButton && (
                                        <button
                                            onClick={() => onNavigate('spatial')}
                                            className={getNavButtonClassName('spatial')}
                                            data-gaze="true"
                                            data-gaze-context="navigation"
                                            style={{ ...getButtonStyle('spatial'), ...focusDisabledStyle }}
                                        >
                                            <span style={{ fontSize: 'clamp(15px, 2vh, 20px)' }}>🔲</span>
                                            Zone Board
                                        </button>
                                    )}

                                    {/* Dead zone separator */}
                                    <div style={{ width: 'clamp(4px, 0.5vw, 8px)', pointerEvents: 'none', flexShrink: 0 }} />

                                    {/* QUICK WORDS */}
                                    <button
                                        onClick={() => onQuickWords ? onQuickWords() : onNavigate('quickwords')}
                                        className="gaze-button nav-btn"
                                        data-gaze="true"
                                        data-gaze-context="navigation"
                                        style={{ ...getButtonStyle('quick-words'), ...focusDisabledStyle }}
                                    >
                                        <span style={{ fontSize: 'clamp(15px, 2vh, 20px)' }}>💬</span>
                                        Quick Words
                                    </button>
                                </>
                            )}

                            {/* === OTHER SCREENS: original layout — Home + Keyboard + ZoneBoard (conditional) === */}
                            {!isKbOrSpatial && (
                                <>
                                    {/* KEYBOARD */}
                                    <button
                                        onClick={() => onNavigate('keyboard')}
                                        className={getNavButtonClassName('keyboard')}
                                        data-gaze="true"
                                        data-gaze-context="navigation"
                                        style={{ ...getButtonStyle('keyboard'), ...focusDisabledStyle }}
                                    >
                                        <KeyboardNavIcon />
                                        <span style={{ fontSize: 'clamp(16px, 2.2vh, 22px)' }}>⌨️</span>
                                        Keyboard
                                    </button>

                                    {/* ZONE BOARD — conditional */}
                                    {showZoneBoardButton && (
                                        <button
                                            onClick={() => onNavigate('spatial')}
                                            className={getNavButtonClassName('spatial')}
                                            data-gaze="true"
                                            data-gaze-context="navigation"
                                            style={{ ...getButtonStyle('spatial'), ...focusDisabledStyle }}
                                        >
                                            <span style={{ fontSize: 'clamp(15px, 2vh, 20px)' }}>🔲</span>
                                            Zone Board
                                        </button>
                                    )}
                                </>
                            )}

                            {/* Dead zone — compass map: between Keyboard and Restart Maps */}
                            {isCompassMap && onRestartCompass && (
                                <div style={{ width: 'clamp(6px, 0.6vw, 10px)', pointerEvents: 'none', flexShrink: 0 }} />
                            )}

                            {/* RESTART COMPASS SURVEY */}
                            {onRestartCompass && (
                                <button
                                    onClick={onRestartCompass}
                                    className="gaze-button nav-btn"
                                    data-gaze="true"
                                    data-gaze-context="navigation"
                                    style={{
                                        ...getButtonStyle('restart'),
                                        ...focusDisabledStyle,
                                    }}
                                >
                                    <span style={{ fontSize: 'clamp(15px, 2vh, 20px)' }}>🔄</span>
                                    Restart Maps
                                </button>
                            )}

                        </div>
                    )}
                </div>

                {/* RIGHT CELL - Gaze Toggle (left) + HIDE NAV (far right, below 123) */}
                <div style={{
                    display: 'flex',
                    justifyContent: showMoreToggle ? 'flex-end' : 'center',
                    alignItems: 'center',
                    gap: showMoreToggle ? 'clamp(8px, 1vw, 14px)' : 'clamp(18px, 2.5vw, 36px)',
                }}>
                    {/* GAZE TOGGLE — spatial: keyboard-style hub with vertical lines; others: circle */}
                    {currentPage === 'spatial' ? (
                        <div style={{
                            display: 'flex', alignItems: 'stretch', height: '118px',
                            minWidth: 'clamp(160px, 18vw, 240px)',
                        }}>
                            {/* Left vertical line */}
                            <div style={{
                                width: '2.5px', flexShrink: 0, alignSelf: 'center', height: '70%',
                                backgroundColor: isGazeEnabled ? navigationColors.gazeBorderOn : navigationColors.gazeBorderOff,
                                borderRadius: '2px', pointerEvents: 'none',
                            }} />
                            {/* Selectable button */}
                            <button
                                id="gaze-toggle-nav"
                                onClick={toggleGaze}
                                className="gaze-button gaze-toggle"
                                data-gaze="true"
                                data-gaze-toggle="true"
                                data-gaze-always="true"
                                data-snap-priority="3"
                                data-gaze-context="gazetoggle"
                                data-gaze-dwell-ms={String(isGazeEnabled ? 1150 : 850)}
                                style={{
                                    flex: 1, height: '100%', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    background: 'transparent', border: 'none',
                                    cursor: 'pointer', padding: 0,
                                }}
                            >
                                {/* Visual circle hub */}
                                <div style={{
                                    width: 'clamp(90px, 11vh, 110px)',
                                    height: 'clamp(90px, 11vh, 110px)',
                                    borderRadius: '50%', margin: 0, flexShrink: 0,
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', gap: '2px',
                                    background: isGazeEnabled
                                        ? (isDarkMode
                                            ? 'radial-gradient(circle at 50% 45%, rgba(96, 165, 250, 0.24) 0%, rgba(14, 22, 32, 0.92) 72%)'
                                            : 'radial-gradient(circle at 50% 45%, rgba(212, 202, 184, 0.48) 0%, rgba(253, 252, 250, 0.96) 72%)')
                                        : (isDarkMode
                                            ? 'radial-gradient(circle at 50% 45%, rgba(42, 61, 82, 0.45) 0%, rgba(14, 22, 32, 0.94) 72%)'
                                            : 'radial-gradient(circle at 50% 45%, rgba(232, 223, 208, 0.9) 0%, rgba(255, 255, 255, 0.96) 72%)'),
                                    border: `2.5px solid ${isGazeEnabled ? navigationColors.gazeBorderOn : navigationColors.gazeBorderOff}`,
                                    transition: 'all 250ms ease',
                                    position: 'relative', overflow: 'hidden', pointerEvents: 'none',
                                }}>
                                    {/* Mid-ring */}
                                    <div style={{
                                        position: 'absolute', width: '58%', height: '58%', borderRadius: '50%',
                                        border: `1.5px solid ${isDarkMode
                                            ? (isGazeEnabled ? 'rgba(96, 165, 250, 0.2)' : 'rgba(42, 61, 82, 0.28)')
                                            : (isGazeEnabled ? 'rgba(212, 202, 184, 0.72)' : 'rgba(212, 202, 184, 0.65)')}`,
                                    }} />
                                    {/* Center reticle dot */}
                                    <div style={{
                                        width: '7px', height: '7px', borderRadius: '50%',
                                        backgroundColor: isGazeEnabled ? navigationColors.gazeTextOn : navigationColors.gazeTextOff,
                                        transition: 'all 200ms ease', zIndex: 2,
                                    }} />
                                    {/* Label */}
                                    <span style={{
                                        fontSize: 'clamp(12px, 1.35vh, 15px)', fontWeight: 900,
                                        letterSpacing: '1.6px',
                                        color: isGazeEnabled ? navigationColors.gazeTextOn : navigationColors.gazeTextOff,
                                        textTransform: 'uppercase', zIndex: 2, marginTop: '1px',
                                        fontFamily: navFontFamily,
                                    }}>
                                        {isGazeEnabled ? 'ON' : 'OFF'}
                                    </span>
                                </div>
                            </button>
                            {/* Right vertical line */}
                            <div style={{
                                width: '2.5px', flexShrink: 0, alignSelf: 'center', height: '70%',
                                backgroundColor: isGazeEnabled ? navigationColors.gazeBorderOn : navigationColors.gazeBorderOff,
                                borderRadius: '2px', pointerEvents: 'none',
                            }} />
                        </div>
                    ) : (
                        <button
                            id="gaze-toggle-nav"
                            onClick={toggleGaze}
                            className="gaze-button gaze-toggle"
                            data-gaze="true"
                            data-gaze-toggle="true"
                            data-gaze-always="true"
                            data-snap-priority="3"
                            data-gaze-context="gazetoggle"
                            data-gaze-dwell-ms={String(isGazeEnabled ? 1150 : 850)}
                            style={{
                                padding: '0',
                                backgroundColor: isGazeEnabled ? navigationColors.gazeBackgroundOn : navigationColors.gazeBackgroundOff,
                                border: `3px solid ${isGazeEnabled ? navigationColors.gazeBorderOn : navigationColors.gazeBorderOff}`,
                                boxShadow: isGazeEnabled ? navigationColors.gazeGlow : 'none',
                                borderRadius: '50%',
                                color: isGazeEnabled ? navigationColors.gazeTextOn : navigationColors.gazeTextOff,
                                width: isKbOrSpatial ? '128px' : 'clamp(104px, 13vh, 128px)',
                                height: isKbOrSpatial ? '128px' : 'clamp(104px, 13vh, 128px)',
                                minWidth: isKbOrSpatial ? '128px' : 'clamp(104px, 13vh, 128px)',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column' as const,
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 200ms ease',
                                flexShrink: 0,
                                marginRight: (currentPage === 'keyboard' || currentPage === 'spatial') ? 'clamp(28px, 3vw, 48px)' : '0px',
                            }}
                        >
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
                                style={{ width: 'clamp(34px, 4.4vh, 46px)', height: 'clamp(34px, 4.4vh, 46px)' }}
                            >
                                <circle cx="12" cy="12" r="10" />
                                <circle cx="12" cy="12" r="3" fill={isGazeEnabled ? navigationColors.gazeBorderOn : "none"} />
                            </svg>
                            <span style={{
                                fontSize: 'clamp(13px, 1.45vh, 16px)',
                                fontWeight: 900,
                                letterSpacing: '1.6px',
                                color: isGazeEnabled ? navigationColors.gazeTextOn : navigationColors.gazeTextOff,
                                textTransform: 'uppercase' as const,
                                marginTop: '3px',
                                userSelect: 'none' as const,
                                lineHeight: 1,
                                fontFamily: navFontFamily,
                            }}>
                                {isGazeEnabled ? 'ON' : 'OFF'}
                            </span>
                        </button>
                    )}

                    {/* HIDE NAV — wide, extends almost to right screen edge, tall for gaze */}
                    {showMoreToggle && onMoreToggle && (
                        <button
                            className="gaze-button nav-btn"
                            data-gaze="true"
                            data-gaze-context="navigation"
                            onClick={onMoreToggle}
                            style={{
                                minWidth: 'clamp(180px, 18vw, 280px)',
                                minHeight: isKbOrSpatial ? '118px' : 'clamp(82px, 12vh, 120px)',
                                ...(isKbOrSpatial ? { height: '118px' } : {}),
                                borderRadius: '14px',
                                border: `2px solid ${navigationColors.auxiliaryBorder}`,
                                backgroundColor: navigationColors.auxiliaryBackground,
                                color: colors.text.primary,
                                fontSize: 'clamp(17px, 2.3vh, 23px)',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 'clamp(6px, 1vw, 10px)',
                                transition: 'background-color 0.2s ease, border-color 0.2s ease',
                                padding: '0 clamp(16px, 2vw, 28px)',
                                fontFamily: navFontFamily,
                            }}
                        >
                            FULL SCREEN
                            <span style={{ fontSize: 'clamp(15px, 2vh, 20px)' }}>↓</span>
                        </button>
                    )}

                    {/* NAV TOGGLE - web screen only, when onNavHiddenToggle is provided */}
                    {currentPage === 'web' && onNavHiddenToggle && (
                        <button
                            onClick={handleNavHiddenToggle}
                            className="gaze-button"
                            data-gaze="true"
                            data-gaze-context="navigation"
                            style={{
                                ...getButtonStyle('nav-toggle'),
                                background: navigationColors.auxiliaryBackground,
                                border: `2px solid ${isNavHidden ? colors.accent.main : navigationColors.auxiliaryBorder}`,
                                borderRadius: '24px',
                                minHeight: compact ? 'clamp(50px, 7vh, 72px)' : 'clamp(70px, 11vh, 110px)',
                                minWidth: compact ? 'clamp(110px, 11vw, 150px)' : 'clamp(130px, 13vw, 180px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                color: isNavHidden ? colors.accent.main : colors.text.primary,
                                padding: '0 clamp(16px, 2vw, 24px)',
                            }}
                        >
                            <span style={{ fontSize: 'clamp(16px, 2.2vh, 22px)', fontWeight: 600 }}>
                                {isNavHidden ? 'SHOW' : 'HIDE'}
                            </span>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'clamp(20px, 2.8vh, 26px)', height: 'clamp(20px, 2.8vh, 26px)' }}>
                                {isNavHidden ? <polyline points="6 9 12 15 18 9" /> : <polyline points="18 15 12 9 6 15" />}
                            </svg>
                        </button>
                    )}
                </div>

                {/* MORE toggle has been moved inside the connected container above */}
            </div>

            {/* Bottom-center gaze hub REMOVED — unified to top-right circle only.
               Smart Pause mode handles gaze persistence across screen transitions. */}

            {/* EMERGENCY magnify overlay — same pattern as HomeScreen quick words */}
            {emergencyActivated && (
                <div
                    key={'emergency-flash-' + Date.now()}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        zIndex: 9999,
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'navbar-emergency-magnify 3.2s ease-out forwards',
                    }}
                >
                    <div style={{
                        padding: 'clamp(28px, 4.5vh, 52px) clamp(56px, 9vw, 130px)',
                        borderRadius: '28px',
                        background: isDarkMode ? 'rgba(30, 8, 8, 0.96)' : lightColors.background.elevated,
                        border: isDarkMode ? '2px solid rgba(210, 80, 80, 0.50)' : `2px solid ${lightColors.emergency.hover}`,
                        boxShadow: isDarkMode ? '0 12px 80px rgba(0, 0, 0, 0.75), 0 0 40px rgba(210, 80, 80, 0.18)' : '0 8px 24px rgba(139, 121, 104, 0.12), 0 2px 6px rgba(139, 121, 104, 0.08)',
                    }}>
                        <span style={{
                            fontSize: 'clamp(48px, 8vh, 96px)',
                            fontWeight: 900,
                            color: isDarkMode ? '#E07070' : lightColors.emergency.main,
                            fontFamily: emergencyFontFamily,
                            letterSpacing: isDarkMode ? '0.16em' : '0.08em',
                            textAlign: 'center',
                            textTransform: isDarkMode ? 'uppercase' : 'none',
                            lineHeight: 1,
                        }}>
                            {isDarkMode ? 'EMERGENCY' : 'Emergency'}
                        </span>
                    </div>
                </div>
            )}

            <style>{`
                .nav-btn-home > span:first-of-type,
                .nav-btn-keyboard > span:first-of-type {
                    display: none !important;
                }
                .nav-pill-dark .nav-btn:hover:not(.nav-btn-active):not(.nav-btn-back) {
                    background: ${navigationColors.hoverBackground} !important;
                }
                .nav-pill-dark .nav-btn.nav-btn-active:hover {
                    background: ${navigationColors.activeBackground} !important;
                    border-color: ${navigationColors.activeBorder} !important;
                    box-shadow: ${navigationColors.activeShadow} !important;
                }
                .nav-pill-dark .nav-btn.nav-btn-back:hover {
                    background: ${navigationColors.backHoverBackground} !important;
                    border-color: ${navigationColors.backBorder} !important;
                }
                @keyframes navbar-emergency-magnify {
                    0% { opacity: 0; transform: scale(0.7); }
                    8% { opacity: 1; transform: scale(1.02); }
                    14% { transform: scale(1); }
                    75% { opacity: 1; transform: scale(1); }
                    100% { opacity: 0; transform: scale(1.06); }
                }
                .emergency-help-btn:hover {
                    background: rgba(160, 55, 55, 0.45) !important;
                    border-color: rgba(210, 90, 90, 0.65) !important;
                    box-shadow: 0 0 20px rgba(200, 70, 70, 0.25) !important;
                    transform: scale(1.04);
                }
            `}</style>
        </>
    );
};

export const GlobalNavBar = React.memo(GlobalNavBarComponent);
export default GlobalNavBar;
