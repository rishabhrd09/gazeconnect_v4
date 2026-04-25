import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

/** Clock now sits at bottom-left — no overlap with nav, visible on all screens */
const HIDDEN_SCREENS = new Set<string>([
    // No screens hidden — bottom-left position is clear on all layouts
]);

interface LiveClockProps {
    currentScreen?: string;
    suppressed?: boolean;
}

export function LiveClock({ currentScreen, suppressed = false }: LiveClockProps) {
    const { theme } = useTheme();
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Hide on screens where it overlaps with nav controls
    if (suppressed || (currentScreen && HIDDEN_SCREENS.has(currentScreen))) {
        return null;
    }

    const hours = time.getHours();
    const minutes = time.getMinutes().toString().padStart(2, '0');
    const seconds = time.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = (hours % 12 || 12).toString().padStart(2, '0');

    // Day of week
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = days[time.getDay()];
    const dateStr = time.toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short'
    });

    return (
        <div style={{
            position: 'fixed',
            bottom: 'clamp(8px, 1.2vh, 18px)',
            left: 'clamp(60px, 5vw, 100px)',
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '2px',
            pointerEvents: 'none',
            userSelect: 'none',
        }}>
            {/* Day + Date line */}
            <div className="live-clock-day" style={{
                fontFamily: "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui",
                fontWeight: 700,
                fontSize: 'clamp(11px, 1.4vh, 15px)',
                color: theme === 'light' ? '#342A20' : theme === 'mix' ? 'rgba(240,226,196,0.46)' : 'rgba(236,237,227,0.42)',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                lineHeight: 1,
                paddingRight: '3px',
            }}>
                {dayName} · {dateStr}
            </div>

            {/* Main time display */}
            <div className="live-clock-time" style={{
                fontFamily: "'Orbitron', monospace",
                fontWeight: 600,
                fontSize: 'clamp(32px, 4vh, 52px)',
                color: theme === 'light' ? '#1B140E' : theme === 'mix' ? 'rgba(240,226,196,0.86)' : 'rgba(236,237,227,0.84)',
                letterSpacing: '2px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'baseline',
                gap: '4px',
            }}>
                {/* HH:MM in Orbitron */}
                <span className="live-clock-time-shadow" style={{
                    textShadow: '0 0 20px rgba(45,212,191,0.25)',
                }}>
                    {h12}:{minutes}
                </span>

                {/* AM/PM in Outfit */}
                <span className="live-clock-ampm" style={{
                    fontFamily: "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui",
                    fontWeight: 600,
                    fontSize: 'clamp(14px, 1.8vh, 20px)',
                    color: theme === 'light' ? '#342A20' : theme === 'mix' ? '#6FB7B1' : '#6FB7B1',
                    letterSpacing: '1px',
                    marginLeft: '4px',
                    alignSelf: 'flex-end',
                    marginBottom: '3px',
                }}>
                    {ampm}
                </span>
            </div>
        </div>
    );
}
