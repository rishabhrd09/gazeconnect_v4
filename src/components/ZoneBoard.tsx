import React, { useCallback, useEffect, useState } from 'react';
import GazeButton from './core/GazeButton';
import { useGazeControl } from './core/GazeControlToggle';
import { gazeFlags } from '../utils/gazeFlags';

// Keep the learned spatial locations; the center is a non-selectable rest area.
const ZONES = [
  { id: 'topLeft', letters: 'ABCDEF' },
  { id: 'front', letters: 'KLMNOP' },
  { id: 'topRight', letters: 'QRST' },
  { id: 'left', letters: 'GHIJ' },
  { id: 'right', letters: 'UVWXYZ' },
] as const;
type Zone = typeof ZONES[number];

interface ZoneBoardProps {
  onLetterTyped: (letter: string) => void;
  onDelete: () => void;
  onSpace: () => void;
  onSpeak: () => void;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  currentWord: string;
}

const ZoneBoard: React.FC<ZoneBoardProps> = ({
  onLetterTyped, onDelete, onSpace, onSpeak, gazeEnabled, gazeEnabledTimestamp, currentWord,
}) => {
  const [activeZone, setActiveZone] = useState<Zone | null>(null);
  const [interactionEnabled, setInteractionEnabled] = useState(true);
  const { signalNavigation } = useGazeControl();
  // Preserve the existing entry safeguard and optional measured fast path.
  useEffect(() => {
    if (!activeZone) { setInteractionEnabled(true); return; }
    setInteractionEnabled(false);
    const buffer = gazeFlags.zoneBoardV2 ? 900 : 3000;
    const timer = window.setTimeout(() => setInteractionEnabled(true), buffer);
    return () => window.clearTimeout(timer);
  }, [activeZone]);
  const changeZone = useCallback((zone: Zone | null) => {
    signalNavigation();
    setActiveZone(zone);
  }, [signalNavigation]);
  const gaze = { gazeEnabled, gazeEnabledTimestamp, isDarkMode: true };

  return (
    <section className={`zone-board${activeZone ? ' zone-board-expanded' : ''}`} aria-label={activeZone ? `Letters ${activeZone.letters}` : 'Alphabet groups'}>
      {activeZone ? <>
        <div className="zone-letter-grid">
          {activeZone.letters.split('').map(letter => <GazeButton key={letter} id={`zb-char-${letter}`}
            {...gaze} gazeEnabled={gazeEnabled && interactionEnabled}
            dwellCategory="keyboardKey"
            onClick={() => { onLetterTyped(letter); changeZone(null); }} className="zone-letter">{letter}</GazeButton>)}
        </div>
        <GazeButton id="zb-back" {...gaze} dwellCategory="backSkipButton" className="zone-back"
          onClick={() => changeZone(null)}>Back to groups</GazeButton>
      </> : <>
        {ZONES.map(zone => <GazeButton key={zone.id} id={`zone-${zone.id}`} {...gaze}
          dwellCategory="spatialZone" className="zone-group" style={{ gridArea: zone.id }}
          ariaLabel={`Letters ${zone.letters.split('').join(' ')}`} onClick={() => changeZone(zone)}>
          {zone.letters.split('').join(' ')}
        </GazeButton>)}
        <div className="zone-current-word" aria-label="Current word">
          <div className="zone-eyebrow">Current word</div>
          <div className="zone-current-text">{currentWord || <span aria-hidden="true">—</span>}</div>
        </div>
        <GazeButton id="zb-delete" {...gaze} className="zone-delete" dwellCategory="standardButton" onClick={onDelete}>Delete</GazeButton>
        <GazeButton id="zb-space" {...gaze} className="zone-space" dwellCategory="standardButton" onClick={onSpace}>Space</GazeButton>
        <GazeButton id="zb-speak" {...gaze} className="zone-speak" dwellCategory="standardButton" onClick={onSpeak}>Speak</GazeButton>
      </>}
    </section>
  );
};
export default React.memo(ZoneBoard);
