import React, { useEffect, useRef } from 'react';
import GazeButton from '../core/GazeButton';
import '../../styles/keyboard-message.css';

interface KeyboardMessageDisplayProps {
  text: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSpeak: () => void;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  speakId: string;
  expandId: string;
}

/** One reading surface for both keyboards; only the containing layout differs. */
const KeyboardMessageDisplay: React.FC<KeyboardMessageDisplayProps> = ({
  text, expanded, onToggleExpanded, onSpeak, gazeEnabled, gazeEnabledTimestamp, speakId, expandId,
}) => {
  const displayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (displayRef.current) displayRef.current.scrollTop = displayRef.current.scrollHeight;
  }, [text, expanded]);
  const gaze = { gazeEnabled, gazeEnabledTimestamp };

  return (
    <section className={`keyboard-text-area keyboard-message${expanded ? ' keyboard-message-expanded' : ''}`} aria-label="Message display">
      <div ref={displayRef} className="keyboard-message-scroll">
        <div className="keyboard-message-text">{text}<span className="keyboard-message-caret" aria-hidden="true" /></div>
      </div>
      <GazeButton id={speakId} {...gaze} ariaLabel="Speak" className="message-display-action message-display-speak"
        dwellCategory="quickWord" onClick={onSpeak}>
        <span className="message-action-content">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
          </svg>
          <span>Speak</span>
        </span>
      </GazeButton>
      <GazeButton id={expandId} {...gaze} ariaLabel={expanded ? 'Collapse message' : 'Expand message'}
        className="message-display-action" dwellCategory="standardButton" onClick={onToggleExpanded}>
        <span className="message-action-content">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {expanded ? <path d="M3 9h6V3m12 12h-6v6M9 9 2 2m13 13 7 7" /> : <path d="M9 3H3v6m12 12h6v-6M3 3l7 7m11 11-7-7" />}
          </svg>
          <span>{expanded ? 'Collapse' : 'Expand'}</span>
        </span>
      </GazeButton>
    </section>
  );
};

export default React.memo(KeyboardMessageDisplay);
