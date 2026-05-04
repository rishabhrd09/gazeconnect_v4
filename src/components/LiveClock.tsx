import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

// 'web' is hidden because the Web Browsing landing + sub-panels use the
// bottom-left zone for sidebar content; the floating clock would overlap.
const HIDDEN_SCREENS = new Set<string>(['quickwords', 'keyboard', 'spatial', 'web']);
const UI_FONT = "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif";

interface LiveClockProps {
  currentScreen?: string;
  suppressed?: boolean;
}

export function LiveClock({ currentScreen, suppressed = false }: LiveClockProps) {
  const { theme } = useTheme();
  const [time, setTime] = useState(new Date());
  const isQuickWordsScreen = currentScreen === 'quickwords';
  const isHomeWarmLight = currentScreen === 'home' && theme === 'light';

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (suppressed || (currentScreen && HIDDEN_SCREENS.has(currentScreen))) {
    return null;
  }

  const hours = time.getHours();
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = (hours % 12 || 12).toString().padStart(2, '0');

  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][time.getDay()];
  const dateStr = time.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  const dayColor = isHomeWarmLight
    ? 'rgba(122, 99, 71, 0.55)'
    : theme === 'light'
    ? '#5A4A3B'
    : theme === 'mix'
      ? 'rgba(240,226,196,0.48)'
      : 'rgba(236,237,227,0.42)';

  const timeColor = isHomeWarmLight
    ? 'rgba(59, 45, 32, 0.55)'
    : theme === 'light'
    ? '#1B140E'
    : theme === 'mix'
      ? 'rgba(240,226,196,0.88)'
      : 'rgba(236,237,227,0.84)';

  const ampmColor = isHomeWarmLight
    ? 'rgba(59, 45, 32, 0.55)'
    : theme === 'light'
    ? '#6D5945'
    : theme === 'mix'
      ? '#B49362'
      : '#9FB19A';

  const dayColorSoft = theme === 'light'
    ? 'rgba(90, 74, 59, 0.78)'
    : theme === 'mix'
      ? 'rgba(120, 100, 72, 0.76)'
      : 'rgba(196, 198, 187, 0.64)';

  const timeColorSoft = theme === 'light'
    ? 'rgba(27, 20, 14, 0.92)'
    : theme === 'mix'
      ? 'rgba(238, 223, 196, 0.82)'
      : 'rgba(230, 233, 221, 0.76)';

  const ampmColorSoft = theme === 'light'
    ? 'rgba(109, 89, 69, 0.82)'
    : theme === 'mix'
      ? '#9E7B4B'
      : '#A8B29A';

  return (
    <div style={{
      position: 'fixed',
      bottom: isQuickWordsScreen ? 'clamp(12px, 1.5vh, 18px)' : 'clamp(10px, 1.4vh, 20px)',
      left: isQuickWordsScreen ? 'clamp(68px, 5.2vw, 108px)' : 'clamp(62px, 5vw, 102px)',
      zIndex: 9998,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: isQuickWordsScreen ? '2px' : '4px',
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      <div style={{
        fontFamily: UI_FONT,
        fontWeight: 700,
        fontSize: isQuickWordsScreen ? 'clamp(10px, 1.2vh, 12px)' : 'clamp(11px, 1.35vh, 14px)',
        color: isQuickWordsScreen ? dayColorSoft : dayColor,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        lineHeight: 1,
      }}>
        {dayName} - {dateStr}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: isQuickWordsScreen ? '4px' : '6px',
        lineHeight: 1,
      }}>
        <span style={{
          fontFamily: UI_FONT,
          fontWeight: isQuickWordsScreen ? 680 : 700,
          fontSize: isQuickWordsScreen ? 'clamp(24px, 3vh, 36px)' : 'clamp(30px, 3.8vh, 46px)',
          color: isQuickWordsScreen ? timeColorSoft : timeColor,
          letterSpacing: '0',
        }}>
          {h12}:{minutes}
        </span>
        <span style={{
          fontFamily: UI_FONT,
          fontWeight: 700,
          fontSize: isQuickWordsScreen ? 'clamp(12px, 1.45vh, 15px)' : 'clamp(14px, 1.7vh, 18px)',
          color: isQuickWordsScreen ? ampmColorSoft : ampmColor,
          letterSpacing: '0.04em',
        }}>
          {ampm}
        </span>
      </div>
    </div>
  );
}
