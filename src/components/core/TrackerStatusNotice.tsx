// =============================================
// TrackerStatusNotice — says WHY there is no gaze
// =============================================
// The Tobii helper reports what the tracker itself sees (eyes present, gaze
// tracked, device unplugged, tracking paused...). Without this the app simply
// went quiet: the cursor stopped and nothing explained it. The notice is
// display-only — never a gaze target — and appears only once a state has
// persisted, so a glance away or a blink does not flash a message.

import React, { useEffect, useState } from 'react';
import type { TrackerStatus } from '../../hooks/useWebSocket';

const MESSAGES: Record<string, string> = {
  no_user: 'Eye tracker cannot see your eyes. Check your position.',
  no_gaze: 'Eyes found. Look at the screen to continue.',
  tracking_paused: 'Eye tracking is paused in Tobii Experience.',
  device_not_connected: 'Eye tracker is unplugged.',
  device_unavailable: 'Eye tracker is not ready. Open Tobii Experience.',
  engine_unavailable: 'Tobii Experience is not running.',
  helper_unavailable: 'Eye tracker service is not running.',
  stalled: 'Eye tracker stopped sending data. Reconnecting.',
  recovering: 'Eye tracker stopped sending data. Reconnecting.',
};
// Looking away is ordinary; a fault is worth saying sooner.
const ORDINARY_DELAY_MS = 4000;
const FAULT_DELAY_MS = 1500;

export const TrackerStatusNotice: React.FC<{ status: TrackerStatus | null }> = ({ status }) => {
  const state = status?.stream_state ?? '';
  const message = MESSAGES[state];
  const [shownFor, setShownFor] = useState('');

  useEffect(() => {
    if (!message) {
      setShownFor('');
      return;
    }
    const ordinary = state === 'no_user' || state === 'no_gaze';
    const timer = setTimeout(() => setShownFor(state), ordinary ? ORDINARY_DELAY_MS : FAULT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, message]);

  if (!message || shownFor !== state) return null;
  return (
    <div
      className="tracker-status-notice"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', top: 28, right: 4, maxWidth: 'min(420px, 60vw)',
        backgroundColor: 'rgba(13, 17, 23, 0.92)', color: '#F0F6FC',
        border: '1px solid #D29922', borderRadius: 8, padding: '6px 10px',
        fontSize: 14, lineHeight: 1.35, fontWeight: 500,
        zIndex: 999999, pointerEvents: 'none',
      }}
    >
      {message}
    </div>
  );
};

export default TrackerStatusNotice;
