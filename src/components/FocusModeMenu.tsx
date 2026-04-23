/**
 * FocusModeMenu — Custom right-click context menu for Focus Mode
 * ==============================================================
 * Right-click anywhere → shows a dark glassmorphism popup with
 * a single toggle option to enable/disable Focus Mode.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusMode } from '../contexts/FocusModeContext';

interface MenuPosition {
    x: number;
    y: number;
}

const FocusModeMenu: React.FC<{ isDarkMode?: boolean }> = ({ isDarkMode = true }) => {
    const { isFocusMode, toggleFocusMode } = useFocusMode();
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
    const menuRef = useRef<HTMLDivElement>(null);

    const handleContextMenu = useCallback((e: MouseEvent) => {
        e.preventDefault();
        // Position the menu at cursor, clamped to stay within viewport
        const x = Math.min(e.clientX, window.innerWidth - 260);
        const y = Math.min(e.clientY, window.innerHeight - 60);
        setPosition({ x, y });
        setVisible(true);
    }, []);

    const handleClickOutside = useCallback((e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
            setVisible(false);
        }
    }, []);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') setVisible(false);
    }, []);

    useEffect(() => {
        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleContextMenu, handleClickOutside, handleKeyDown]);

    if (!visible) return null;

    const bgColor = isDarkMode
        ? 'rgba(20, 27, 38, 0.92)'
        : 'rgba(255, 255, 255, 0.95)';
    const borderColor = isDarkMode
        ? 'rgba(100, 116, 139, 0.35)'
        : 'rgba(0, 0, 0, 0.12)';
    const textColor = isDarkMode ? '#E2E8F0' : '#1E293B';
    const hoverBg = isDarkMode
        ? 'rgba(45, 212, 191, 0.15)'
        : 'rgba(45, 212, 191, 0.1)';
    const accentColor = isFocusMode ? '#F59E0B' : '#2DD4BF';

    return (
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                top: position.y,
                left: position.x,
                zIndex: 100000,
                minWidth: 240,
                backgroundColor: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: 12,
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5), 0 0 1px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(16px)',
                padding: '6px',
                animation: 'focusMenuFadeIn 120ms ease-out',
            }}
        >
            <style>{`
        @keyframes focusMenuFadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

            <button
                onClick={() => { toggleFocusMode(); setVisible(false); }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = hoverBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    borderRadius: 8,
                    backgroundColor: 'transparent',
                    color: textColor,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    transition: 'background-color 100ms ease',
                }}
            >
                {/* Lock / Unlock icon */}
                <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: isFocusMode
                        ? 'rgba(245, 158, 11, 0.15)'
                        : 'rgba(45, 212, 191, 0.12)',
                    flexShrink: 0,
                }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke={accentColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        {isFocusMode ? (
                            /* Unlock icon */
                            <>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                            </>
                        ) : (
                            /* Lock icon */
                            <>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </>
                        )}
                    </svg>
                </span>

                <span style={{ flex: 1 }}>
                    {isFocusMode ? 'Disable Focus Mode' : 'Enable Focus Mode'}
                </span>

                {/* Status pill */}
                {isFocusMode && (
                    <span style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                        color: '#F59E0B',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                    }}>
                        ON
                    </span>
                )}
            </button>
        </div>
    );
};

export default FocusModeMenu;
