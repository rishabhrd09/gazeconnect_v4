/**
 * ROOM COMPONENTS: the Compass map's room picker, for placing a room (place mode) or for choosing the
 * room of one half of a divided cell (assign mode, IMPLEMENTATION_PLAN.md §5.1 step 5).
 *
 * Large, stationary cards, eight to a page; a card answers to gaze only after READY, as before. In assign
 * mode the first card is "Leave empty", every card says whether the room fits the half, cards that cannot be
 * chosen there come last and are disabled, and READY stays on across pages (16 Oct 2026). A question
 * that needs an answer (a separate second bedroom, a half too narrow, a room that would be cut in two)
 * replaces the cards with large deliberate answers; nothing changes until one is chosen.
 */
import React from 'react';
import GazeButton from '../core/GazeButton';
import { GazeToggleCardFace } from '../core/GazeToggleCardFace';

export interface PickerCard {
  id: string;
  label: string;
  color: string;
  status: string;
  selected?: boolean;
  disabled?: boolean;
  /** Assign mode: whether the room fits the half ("Fits: 3'-3\" clear"), fits with a warning ("Narrow: …"), or not. */
  fit?: { ok: boolean; warn?: boolean; text: string };
}

export interface PickerQuestion {
  text: string;
  answers: Array<{ id: string; label: string; action: () => void; deliberate?: boolean }>;
}

interface Props {
  mode: 'place' | 'assign';
  title: string;
  floorLabel: string;
  subtitle: string;
  cards: PickerCard[];
  page: number;
  onPage: (page: number) => void;
  ready: boolean;
  onReady: () => void;
  onChoose: (card: PickerCard) => void;
  onClose: () => void;
  question?: PickerQuestion | null;
  notice?: string;
  isGazeEnabled: boolean;
  lastEnabledTimestamp: number;
  toggleGaze: () => void;
  isWarm: boolean;
}

export const PICKER_PAGE = 8;

export function CompassRoomPicker({ mode, title, floorLabel, subtitle, cards, page, onPage, ready, onReady, onChoose, onClose,
  question, notice, isGazeEnabled, lastEnabledTimestamp, toggleGaze, isWarm }: Props) {
  const pageCount = Math.max(1, Math.ceil(cards.length / PICKER_PAGE));
  const current = Math.min(page, pageCount - 1);
  const cardsEnabled = ready && !question;
  const prefix = mode === 'assign' ? 'assign' : 'm';
  return (
    <div className="compass-room-menu" data-picker-mode={mode}>
      <header className="compass-menu-header">
        <div>
          <h1>{title}</h1>
          <p><span>{floorLabel}</span>{subtitle}</p>
        </div>
        <GazeButton id={mode === 'assign' ? 'assign-close' : 'close-menu'} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
          isDarkMode={!isWarm} dwellCategory="backSkipButton" onClick={onClose}>✕ {mode === 'assign' ? 'BACK' : 'CLOSE'}</GazeButton>
      </header>
      {question ? <div className="refine-question" role="alert">
        {/* A question replaces the cards until it is answered, with large answers (as in the focus view). */}
        <p>{question.text}</p>
        <div className="refine-question-answers">
          {question.answers.map(answer => <GazeButton key={answer.id} id={answer.id} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
            isDarkMode={!isWarm} dwellCategory={answer.deliberate ? 'deliberateAction' : 'backSkipButton'} onClick={answer.action}>{answer.label}</GazeButton>)}
        </div>
      </div> : <>
        <div className="compass-menu-instruction" role="status">
          <span>{notice || (cardsEnabled ? (mode === 'assign' ? 'Select the room for this half' : 'Select any room to load it for placement')
            : 'Click a room, or press READY to select with gaze.')}</span>
          <span>{current + 1} / {pageCount}</span>
        </div>
        <div className="compass-room-grid">
          {cards.slice(current * PICKER_PAGE, current * PICKER_PAGE + PICKER_PAGE).map((card, offset) => {
            const index = current * PICKER_PAGE + offset;
            return <GazeButton key={`${current}-${card.id}-${index}`} id={`${prefix}-${card.id}-${index}`}
              className="compass-room-choice" selected={!!card.selected} disabled={!!card.disabled}
              gazeEnabled={isGazeEnabled && cardsEnabled && !card.disabled} gazeEnabledTimestamp={lastEnabledTimestamp}
              isDarkMode={!isWarm} dwellCategory="compassMapAction" onClick={() => { if (!card.disabled) onChoose(card); }}>
              <span className="compass-room-dot" style={{ background: card.color }} aria-hidden="true" />
              <span className="compass-room-name">{card.label}</span>
              <span className="compass-room-status">{card.status}</span>
              {card.fit && <span className="compass-room-status" data-fit={card.fit.ok ? 'ok' : card.fit.warn ? 'warn' : 'no'}>
                {card.fit.warn && <span aria-hidden="true">⚠ </span>}{card.fit.text}</span>}
            </GazeButton>;
          })}
        </div>
      </>}
      <footer className="compass-menu-footer">
        <GazeButton id={mode === 'assign' ? 'assign-prev' : 'menu-prev'} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
          disabled={current === 0 || !!question} isDarkMode={!isWarm} dwellCategory="backSkipButton"
          onClick={() => onPage(Math.max(0, current - 1))}>← PREVIOUS</GazeButton>
        <GazeButton id={mode === 'assign' ? 'assign-back' : 'back-map'} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
          isDarkMode={!isWarm} dwellCategory="backSkipButton" onClick={onClose}>{mode === 'assign' ? 'BACK TO CELL' : 'BACK TO MAP'}</GazeButton>
        <GazeButton id={mode === 'assign' ? 'assign-gaze-toggle' : 'menu-gaze-toggle'} className="gaze-switch-card" gazeEnabled alwaysActive gazeEnabledTimestamp={lastEnabledTimestamp}
          isDarkMode={!isWarm} dwellCategory="gazeToggle" onClick={toggleGaze} selected={isGazeEnabled}
          ariaLabel={isGazeEnabled ? 'Pause gaze' : 'Enable gaze'}>
          <GazeToggleCardFace on={isGazeEnabled} />
        </GazeButton>
        <GazeButton id={mode === 'assign' ? 'assign-ready' : 'menu-ready'} className="compass-primary" gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode={!isWarm} dwellCategory="compassMapAction" selected={ready}
          onClick={onReady}>READY</GazeButton>
        <GazeButton id={mode === 'assign' ? 'assign-next' : 'menu-next'} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
          disabled={current === pageCount - 1 || !!question} isDarkMode={!isWarm} dwellCategory="backSkipButton"
          onClick={() => onPage(Math.min(pageCount - 1, current + 1))}>MORE ROOMS →</GazeButton>
      </footer>
    </div>
  );
}

export default CompassRoomPicker;
