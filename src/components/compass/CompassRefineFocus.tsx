/**
 * Refine: one cell, large, as two equal targets, left/right or top/bottom (TOP_BOTTOM_SPLITS.md).
 *
 * Left and right are as on the map, with the road below them, so they cannot be misread. Each half shows
 * its room (or Empty) and its real size; upstairs it also shows what is below. The halves are separated by
 * a gap wider than the gaze engine's focus keep-zone. A question (WHOLE CELL with two possible owners, or a
 * conflict) replaces the halves with its answers until one is chosen; nothing changes before that.
 */
import React from 'react';
import GazeButton from '../core/GazeButton';
import { GazeToggleCardFace } from '../core/GazeToggleCardFace';
import type { PickerQuestion } from './CompassRoomPicker';
import type { HalfSide, SplitDirection } from '../../types/compassPlan';
import { HALF_NAMES, splitSides } from '../../utils/compassPlan';

export interface HalfFace {
  label: string;          // owner name, or "Empty"
  color: string | null;   // owner colour, or null when empty
  size: string;           // "3'-9\" × 12'-6\""
  below?: string;         // first floor: "Below: Kitchen"
  warning?: string;       // a narrow room: "Kitchen: 4'-6\" clear, needs 4'-11\"" (placed with a warning, 16 Oct 2026)
  link?: string;          // "Joins the rest of Living Hall": giving this half away would cut that room in two
}

export interface ThumbCell {
  key: string;
  split: boolean;
  direction?: SplitDirection;
  colors: Array<string | null>;   // one (whole) or two (left, right)
}

interface Props {
  title: string;
  subtitle: string;
  left: HalfFace;
  right: HalfFace;
  divided: boolean;
  direction: SplitDirection;
  directionReasons: Record<SplitDirection, string>;
  onDirection: (direction: SplitDirection) => void;
  thumbnail: ThumbCell[];         // the 16 cells, row 4 first (back at the top), as on the map
  focusKey: string;
  question?: PickerQuestion | null;
  message?: string;
  canUndo: boolean;
  onHalf: (half: HalfSide) => void;
  onUndo: () => void;
  onWhole: () => void;
  onBack: () => void;
  isGazeEnabled: boolean;
  lastEnabledTimestamp: number;
  toggleGaze: () => void;
  isWarm: boolean;
}

function Half({ id, side, face, onSelect, enabled, lastEnabledTimestamp, isWarm }: {
  id: string; side: string; face: HalfFace; onSelect: () => void; enabled: boolean; lastEnabledTimestamp: number; isWarm: boolean;
}) {
  return (
    <GazeButton id={id} className="refine-half" gazeEnabled={enabled} gazeEnabledTimestamp={lastEnabledTimestamp}
      isDarkMode={!isWarm} dwellCategory="compassMapAction" onClick={onSelect}
      style={face.color ? { background: `color-mix(in srgb, ${face.color} 16%, var(--ui-surface))` } : undefined}>
      <span className="refine-half-side">{side}</span>
      <span className="refine-half-owner">
        {face.color && <i aria-hidden="true" style={{ background: face.color }} />}
        {face.label}
      </span>
      <span className="refine-half-size">{face.size}</span>
      {face.below && <span className="refine-half-below">{face.below}</span>}
      {face.link && <span className="refine-half-link">{face.link}</span>}
      {face.warning && <span className="refine-half-warning"><span aria-hidden="true">⚠ </span>{face.warning}</span>}
    </GazeButton>
  );
}

export function CompassRefineFocus({ title, subtitle, left, right, divided, direction, directionReasons, onDirection, thumbnail, focusKey, question, message, canUndo,
  onHalf, onUndo, onWhole, onBack, isGazeEnabled, lastEnabledTimestamp, toggleGaze, isWarm }: Props) {
  const halvesEnabled = isGazeEnabled && !question;
  const [a, b] = splitSides(direction);
  return (
    <div className="compass-refine-focus" role="dialog" aria-modal="true" aria-label="Divide a cell">
      <header className="refine-header">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="refine-thumb" aria-hidden="true">
          <div className="refine-thumb-grid">
            {thumbnail.map(cell => (
              <span key={cell.key} data-focus={cell.key === focusKey} data-direction={cell.direction} className="refine-thumb-cell">
                {cell.colors.map((colour, i) => <b key={i} style={colour ? { background: colour } : undefined} />)}
              </span>
            ))}
          </div>
          <span className="refine-thumb-road">ROAD</span>
        </div>
      </header>
      {!question && <div className="refine-directions" aria-label="Split direction">
        {(['left-right', 'top-bottom'] as const).map(value => <GazeButton key={value} id={`refine-direction-${value}`}
          gazeEnabled={isGazeEnabled && !divided && !directionReasons[value]} gazeEnabledTimestamp={lastEnabledTimestamp}
          disabled={divided || !!directionReasons[value]} selected={direction === value} isDarkMode={!isWarm}
          dwellCategory="compassMapAction" onClick={() => onDirection(value)}
          ariaLabel={`${value === 'left-right' ? 'Left and right halves' : 'Top and bottom halves'}${directionReasons[value] ? `: ${directionReasons[value]}` : ''}`}>
          {value === 'left-right' ? 'LEFT / RIGHT' : 'TOP / BOTTOM'}
          <small>{directionReasons[value] ? 'Halves too narrow' : divided ? direction === value ? 'Current split' : 'Use WHOLE CELL to change' : value === 'top-bottom' ? 'Top: back · Bottom: road' : 'Two equal halves'}</small>
        </GazeButton>)}
      </div>}
      {question ? <div className="refine-question" role="alert">
        <p>{question.text}</p>
        <div className="refine-question-answers">
          {question.answers.map(answer => <GazeButton key={answer.id} id={answer.id} gazeEnabled={isGazeEnabled}
            gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode={!isWarm}
            dwellCategory={answer.deliberate ? 'deliberateAction' : 'compassMapAction'} onClick={answer.action}>{answer.label}</GazeButton>)}
        </div>
      </div> : <div className="refine-body">
        <div className="refine-halves" data-divided={divided} data-direction={direction}>
          <Half id={`refine-${HALF_NAMES[a]}`} side={`${HALF_NAMES[a].toUpperCase()} HALF`} face={left} onSelect={() => onHalf(a)} enabled={halvesEnabled}
            lastEnabledTimestamp={lastEnabledTimestamp} isWarm={isWarm} />
          <div className="refine-gap" data-gaze="false" aria-hidden="true" />
          <Half id={`refine-${HALF_NAMES[b]}`} side={`${HALF_NAMES[b].toUpperCase()} HALF`} face={right} onSelect={() => onHalf(b)} enabled={halvesEnabled}
            lastEnabledTimestamp={lastEnabledTimestamp} isWarm={isWarm} />
        </div>
        <div className="refine-road" aria-hidden="true">FRONT / ROAD</div>
      </div>}
      <p className="refine-message" role="status">{message || ''}</p>
      <footer className="refine-footer">
        <GazeButton id="refine-undo" gazeEnabled={isGazeEnabled && canUndo} gazeEnabledTimestamp={lastEnabledTimestamp}
          disabled={!canUndo} isDarkMode={!isWarm} dwellCategory="compassMapAction" onClick={onUndo}>↶ UNDO</GazeButton>
        <GazeButton id="refine-whole" gazeEnabled={isGazeEnabled && divided && !question} gazeEnabledTimestamp={lastEnabledTimestamp}
          disabled={!divided || !!question} isDarkMode={!isWarm} dwellCategory="compassMapAction" onClick={onWhole}>WHOLE CELL</GazeButton>
        <GazeButton id="refine-gaze-toggle" className="gaze-switch-card" gazeEnabled alwaysActive gazeEnabledTimestamp={lastEnabledTimestamp}
          isDarkMode={!isWarm} dwellCategory="gazeToggle" onClick={toggleGaze} selected={isGazeEnabled}
          ariaLabel={isGazeEnabled ? 'Pause gaze' : 'Enable gaze'}>
          <GazeToggleCardFace on={isGazeEnabled} />
        </GazeButton>
        <GazeButton id="refine-back" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
          isDarkMode={!isWarm} dwellCategory="backSkipButton" onClick={onBack}>BACK TO MAP</GazeButton>
      </footer>
    </div>
  );
}

export default CompassRefineFocus;
