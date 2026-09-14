import React, { useState, useEffect } from 'react';

const HIDDEN_SCREENS = new Set(['settings', 'quickwords', 'keyboard', 'spatial', 'web', 'compass-map', 'advanced-map', 'floor-plan-survey']);
interface LiveClockProps {
  currentScreen?: string;
  suppressed?: boolean;
  placement?: 'floating' | 'navigation';
}

export function LiveClock({ currentScreen, suppressed = false, placement = 'floating' }: LiveClockProps) {
  const [time, setTime] = useState(() => new Date());
  const hidden = suppressed || !!(currentScreen && HIDDEN_SCREENS.has(currentScreen));
  useEffect(() => {
    if (hidden) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setTime(new Date());
      // Only minutes are displayed. Align updates to the next minute, including resume.
      timer = setTimeout(tick, 60000 - Date.now() % 60000);
    };
    const resume = () => { clearTimeout(timer); tick(); };
    tick();
    document.addEventListener('visibilitychange', resume);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', resume); };
  }, [hidden]);
  if (hidden) return null;

  const hours = time.getHours();
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][time.getDay()];
  const date = time.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return <div className={`live-clock live-clock-${placement}`}>
    <div className="live-clock-date">{day} - {date}</div>
    <div className="live-clock-time">
      <span>{(hours % 12 || 12).toString().padStart(2, '0')}:{minutes}</span>
      <span className="live-clock-period">{hours >= 12 ? 'PM' : 'AM'}</span>
    </div>
  </div>;
}
