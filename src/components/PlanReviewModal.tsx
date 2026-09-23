import React, { useEffect, useMemo, useState } from 'react';
import GazeButton from './core/GazeButton';
import { useGazeControl } from './core/GazeControlToggle';
import { useTheme } from '../contexts/ThemeContext';
import {
  PlanAdjustment,
  PlanCandidate,
  previewPlanAdjustment,
} from '../utils/floorplanApi';
import '../styles/plan-review.css';

type ReviewStep = 'review' | 'inspect' | 'area' | 'direction' | 'compare' | 'finished' | 'warnings';
type ReviewFloor = 'ground' | 'first';
type Edge = PlanAdjustment['direction'];
type InspectPreset = 'Full' | 'Back' | 'Front' | 'Left' | 'Right';

interface PlanReviewModalProps {
  candidates: PlanCandidate[];
  loading: boolean;
  error: string | null;
  errorDetails?: string[];
  warnings?: string[];
  onAccept: (candidate: PlanCandidate, selectedFloor: ReviewFloor) => void;
  onClose: () => void;
  onRetry: () => void;
  onOpenOriginalPlan?: () => void;
  showOriginalOnError?: boolean;
  onOpenSavedPlan?: () => void;
  startInArea?: boolean;
  onSpeak: (message: string) => void;
}

interface SelectedRoom {
  placementId: string;
  roomId: string;
  label: string;
  cells: string[];
  area: number;
}

const EDGE_CHOICES: Array<{ direction: Edge; label: string; detail: string }> = [
  { direction: 'N', label: 'Back edge', detail: 'Move the top boundary, away from the road' },
  { direction: 'E', label: 'Right edge', detail: 'Move the right boundary on this drawing' },
  { direction: 'S', label: 'Front edge', detail: 'Move the bottom boundary, by the road' },
  { direction: 'W', label: 'Left edge', detail: 'Move the left boundary on this drawing' },
];

function changeForFloor(changes: string[], floor: ReviewFloor): string {
  const floorName = floor === 'first' ? 'first floor' : 'ground floor';
  const floorChange = changes.find(change => change.toLowerCase().includes(floorName));
  if (floorChange) return floorChange;
  const generalChange = changes.find(change => !/\b(?:ground|first) floor\b/i.test(change));
  if (generalChange) return generalChange;
  return changes.length
    ? `This floor follows your Compass Map; changes are on the ${floor === 'first' ? 'ground' : 'first'} floor.`
    : 'Room boundaries follow the selected compass cells.';
}

function warningDetails(warning: string): { floor: string; detail: string } {
  const match = warning.match(/^(ground_floor|first_floor|ground|first):\s*(.*)$/i);
  if (!match) return { floor: 'PLAN NOTE', detail: warning };
  return { floor: match[1].toLowerCase().startsWith('first') ? 'FIRST FLOOR' : 'GROUND FLOOR', detail: match[2] };
}

function roomForCell(candidate: PlanCandidate, floor: ReviewFloor, cell: string): SelectedRoom | null {
  const placements = (floor === 'first' ? candidate.compassData.first_floor : candidate.compassData.ground_floor)?.placements || [];
  const placement = placements.find(item => item.cells?.includes(cell));
  if (!placement) return null;
  return {
    placementId: placement.placementId || '',
    roomId: placement.roomId,
    label: placement.room || placement.roomId,
    cells: placement.cells,
    area: placement.area_sqft,
  };
}

function planImage(candidate: PlanCandidate, floor: ReviewFloor): string | undefined {
  return candidate.previews[floor];
}

export function PlanReviewModal({
  candidates,
  loading,
  error,
  errorDetails = [],
  warnings = [],
  onAccept,
  onClose,
  onRetry,
  onOpenOriginalPlan,
  showOriginalOnError = false,
  onOpenSavedPlan,
  startInArea = false,
  onSpeak,
}: PlanReviewModalProps) {
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isWarm } = useTheme();
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<ReviewStep>(startInArea ? 'area' : 'review');
  const [floor, setFloor] = useState<ReviewFloor>('ground');
  const [selectedRoom, setSelectedRoom] = useState<SelectedRoom | null>(null);
  const [edge, setEdge] = useState<Edge>('N');
  const [preview, setPreview] = useState<PlanCandidate | null>(null);
  const [inspectPreset, setInspectPreset] = useState<InspectPreset>('Full');
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [replacements, setReplacements] = useState<Record<number, PlanCandidate>>({});
  const [undoStack, setUndoStack] = useState<Record<number, PlanCandidate[]>>({});
  const [warningsSeen, setWarningsSeen] = useState(false);
  const [warningPage, setWarningPage] = useState(0);
  const [warningReturnStep, setWarningReturnStep] = useState<'review' | 'area'>(startInArea ? 'area' : 'review');
  const [areaUnavailable, setAreaUnavailable] = useState(false);

  const safeIndex = Math.min(index, Math.max(0, candidates.length - 1));
  const candidate = replacements[safeIndex] || candidates[safeIndex];
  const hasFirstFloor = !!candidate?.compassData.first_floor?.placements?.length;
  const selectedFloor = hasFirstFloor ? floor : 'ground';
  const floorAdjustments = candidate?.allowedAdjustments?.[selectedFloor] || {};
  const canEdit = !!candidate?.editableActions?.includes('room_size')
    && Object.values(floorAdjustments).some(directions => directions.length > 0);
  const canUndo = !!undoStack[safeIndex]?.length;
  const warningPageCount = Math.max(1, Math.ceil(warnings.length / 3));
  const warningSignature = warnings.join('\u0000');

  useEffect(() => {
    setWarningsSeen(false);
    setWarningPage(0);
  }, [warningSignature]);

  const cellRooms = useMemo(() => {
    const map = new Map<string, SelectedRoom>();
    if (!candidate) return map;
    for (let row = 1; row <= 4; row += 1) {
      for (let col = 1; col <= 4; col += 1) {
        const cell = `r${row}_c${col}`;
        const room = roomForCell(candidate, selectedFloor, cell);
        if (room) map.set(cell, room);
      }
    }
    return map;
  }, [candidate, selectedFloor, floorAdjustments]);

  const allowedEdges = selectedRoom ? (floorAdjustments[selectedRoom.placementId] || []) : [];

  useEffect(() => {
    if (!loading && candidate && step === 'area' && !canEdit) {
      setAreaUnavailable(true);
      setStep('review');
      onSpeak('Precise room-size editing is unavailable for this design. You can review it or choose another design.');
    }
  }, [loading, candidate, step, canEdit, onSpeak]);

  useEffect(() => {
    if (!loading && !error && candidate && warnings.length > 0 && !warningsSeen && (step === 'review' || step === 'area')) {
      setWarningReturnStep(step === 'area' && canEdit ? 'area' : 'review');
      setWarningPage(0);
      setStep('warnings');
    }
  }, [loading, error, candidate, warnings.length, warningsSeen, step, canEdit]);

  const button = (id: string, label: React.ReactNode, onClick: () => void, options?: {
    primary?: boolean;
    disabled?: boolean;
    selected?: boolean;
    deliberate?: boolean;
    className?: string;
    alwaysAvailable?: boolean;
  }) => (
    <GazeButton
      id={`plan-review-${id}`}
      key={id}
      className={`pr-button${options?.primary ? ' pr-primary' : ''}${options?.className ? ` ${options.className}` : ''}`}
      gazeEnabled={isGazeEnabled && (options?.alwaysAvailable || (!loading && !editPending))}
      gazeEnabledTimestamp={lastEnabledTimestamp}
      isDarkMode={!isWarm}
      dwellCategory={options?.deliberate ? 'deliberateAction' : 'navigationButton'}
      disabled={options?.disabled || (!options?.alwaysAvailable && (loading || editPending))}
      selected={options?.selected}
      onClick={onClick}
    >{label}</GazeButton>
  );

  const changeFloor = (next: ReviewFloor) => {
    setFloor(next);
    setSelectedRoom(null);
    setPreview(null);
    setEditError(null);
    setAreaUnavailable(false);
    if (step === 'direction' || step === 'compare') setStep('area');
    onSpeak(`${next === 'ground' ? 'Ground' : 'First'} floor.`);
  };

  const nextCandidate = () => {
    if (safeIndex + 1 < candidates.length) {
      setIndex(safeIndex + 1);
      setStep('review');
      setFloor('ground');
      setAreaUnavailable(false);
      onSpeak(`Design ${safeIndex + 2} of ${candidates.length}.`);
    } else {
      setStep('finished');
      onSpeak('You have reviewed all available designs. Review them again or return to the map.');
    }
  };

  const undoEdit = () => {
    const history = undoStack[safeIndex];
    if (!history?.length) return;
    const previous = history[history.length - 1];
    setReplacements(current => ({ ...current, [safeIndex]: previous }));
    setUndoStack(current => ({ ...current, [safeIndex]: history.slice(0, -1) }));
    setSelectedRoom(null);
    setStep('review');
    onSpeak('Previous plan restored.');
  };

  const requestPreview = async (chosenEdge: Edge) => {
    if (!candidate || !selectedRoom || !canEdit) return;
    setEdge(chosenEdge);
    setEditPending(true);
    setEditError(null);
    setPreview(null);
    const adjustment: PlanAdjustment = {
      floor: selectedFloor,
      placementId: selectedRoom.placementId,
      action: 'room_size',
      direction: chosenEdge,
      amount_ft: 1,
    };
    try {
      const result = await previewPlanAdjustment(candidate, adjustment);
      if ('error' in result) {
        setEditError(result.error);
        onSpeak(`That adjustment is not possible. ${result.error}`);
        return;
      }
      setPreview(result);
      setStep('compare');
      onSpeak('Adjustment ready. Review the before and after plans, then apply or cancel.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not preview the adjustment.';
      setEditError(message);
      onSpeak(message);
    } finally {
      setEditPending(false);
    }
  };

  const applyPreview = () => {
    if (!candidate || !preview) return;
    setUndoStack(current => ({ ...current, [safeIndex]: [...(current[safeIndex] || []), candidate] }));
    setReplacements(current => ({ ...current, [safeIndex]: preview }));
    setPreview(null);
    setSelectedRoom(null);
    setStep('review');
    onSpeak('Room adjustment applied to this design.');
  };

  const adjustedPlacement = selectedRoom && preview
    ? (selectedFloor === 'first' ? preview.compassData.first_floor : preview.compassData.ground_floor)?.placements
      .find(placement => placement.placementId === selectedRoom.placementId)
    : null;
  const areaDifference = selectedRoom && adjustedPlacement
    ? Math.round(adjustedPlacement.area_sqft - selectedRoom.area)
    : null;
  const inspectTransformOrigin: Record<InspectPreset, string> = {
    Full: '50% 50%', Back: '50% 15%', Front: '50% 85%', Left: '25% 50%', Right: '75% 50%',
  };

  const floorControls = hasFirstFloor && (
    <div className="pr-floor-controls" aria-label="Floor selection">
      {button('ground-floor', 'Ground floor', () => changeFloor('ground'), { selected: selectedFloor === 'ground' })}
      {button('first-floor', 'First floor', () => changeFloor('first'), { selected: selectedFloor === 'first' })}
    </div>
  );

  return (
    <div className="pr-overlay" role="dialog" aria-modal="true" aria-label="Review floor plan designs">
      <header className="pr-header">
        <div className="pr-heading">
          <span className="pr-eyebrow">COMPASS MAP · PLAN REVIEW</span>
          <h1>{loading ? 'Preparing your designs' : error || !candidate ? 'Plan generation' : step === 'finished' ? 'All designs reviewed' : step === 'warnings' ? 'Review plan notes' : step === 'review' ? `Design ${safeIndex + 1} of ${candidates.length}` : step === 'inspect' ? 'Inspect design' : 'Adjust an area'}</h1>
        </div>
        <div className="pr-header-actions">
          {candidate && step === 'review' && button('inspect-open', 'Inspect design', () => { setInspectPreset('Full'); setStep('inspect'); onSpeak('Inspect design. Choose a region to enlarge.'); })}
          {onOpenSavedPlan && button('saved-plan', 'Open saved plan', onOpenSavedPlan, { alwaysAvailable: true })}
          {button('back-map', 'Back to map', onClose, { alwaysAvailable: true })}
        </div>
      </header>

      {loading && (
        <main className="pr-message-layout" role="status">
          <div className="pr-message-card">
            <div className="pr-loading-mark" aria-hidden="true" />
            <h2>Checking floor plan layouts</h2>
            <p>The room choices on your Compass Map are the starting point. The plan review will appear here when the layouts are ready.</p>
          </div>
        </main>
      )}

      {!loading && (error || !candidate) && (
        <main className="pr-message-layout" role="alert">
          <div className="pr-message-card">
            <h2>We could not prepare a valid plan</h2>
            <p>{error || 'No valid layout was returned for this map.'}</p>
            {errorDetails.length > 0 && <ul className="pr-validation-issues" aria-label="Why this map could not produce a valid plan">
              {errorDetails.slice(0, 3).map((issue, issueIndex) => <li key={`${issueIndex}-${issue}`}>{issue}</li>)}
            </ul>}
            {showOriginalOnError && onOpenOriginalPlan && <p className="pr-original-note">The original opens in the earlier viewer without candidate validation.</p>}
            <div className="pr-message-actions">
              {!showOriginalOnError && button('retry', 'Try again', onRetry, { primary: true })}
              {showOriginalOnError && onOpenOriginalPlan && button('original', 'Preview unvalidated original', onOpenOriginalPlan, { primary: true })}
              {onOpenSavedPlan && button('saved-error', 'Open saved plan', onOpenSavedPlan)}
              {button('return-map', 'Adjust map', onClose)}
            </div>
          </div>
        </main>
      )}

      {!loading && !error && candidate && step === 'warnings' && (
        <main className="pr-warning-layout" aria-label="Plan validation notes">
          <div className="pr-warning-card">
            <span className="pr-eyebrow">PLAN NOTES · {warningPage + 1} OF {warningPageCount}</span>
            <h2>Read these notes before choosing a design</h2>
            <p>These notes apply to the generated layouts. Check each floor you plan to use.</p>
            <div className="pr-warning-list">
              {warnings.slice(warningPage * 3, (warningPage + 1) * 3).map((warning, offset) => {
                const { floor: warningFloor, detail } = warningDetails(warning);
                return <article className="pr-warning-item" key={`${warningPage * 3 + offset}-${warning}`}>
                  <strong>{warningFloor}</strong>
                  <span>{detail}</span>
                </article>;
              })}
            </div>
            <div className="pr-warning-actions">
              {button('notes-previous', 'Previous notes', () => setWarningPage(page => Math.max(0, page - 1)), { disabled: warningPage === 0 })}
              {warningPage + 1 < warningPageCount
                ? button('notes-next', 'More notes', () => setWarningPage(page => Math.min(warningPageCount - 1, page + 1)), { primary: true })
                : button('notes-continue', warningReturnStep === 'area' ? 'Continue to area editing' : 'Continue to designs', () => {
                  setWarningsSeen(true);
                  setStep(warningReturnStep === 'area' && canEdit ? 'area' : 'review');
                }, { primary: true })}
            </div>
          </div>
        </main>
      )}

      {!loading && !error && candidate && step === 'review' && (
        <main className="pr-review-layout">
          <section className="pr-plan-panel" aria-label="Current floor plan">
            <div className="pr-plan-heading">
              <div>
                <span className="pr-eyebrow">{candidate.label}</span>
                <h2>{candidate.summary}</h2>
              </div>
              <span className="pr-plan-count">{safeIndex + 1} / {candidates.length}</span>
            </div>
            <div className="pr-drawing">
              {planImage(candidate, selectedFloor)
                ? <img src={planImage(candidate, selectedFloor)} alt={`${candidate.label} ${selectedFloor} floor plan`} />
                : <div className="pr-no-image">Drawing unavailable for this floor.</div>}
            </div>
            <div className="pr-plan-footer">
              <p>{changeForFloor(candidate.changes, selectedFloor)}</p>
              {floorControls}
            </div>
          </section>
          <aside className="pr-choice-rail" aria-label="Plan choices">
            <div className="pr-choice-intro">
              <span className="pr-eyebrow">ONE DESIGN AT A TIME</span>
              <p>Are you happy with this layout?</p>
              {areaUnavailable && <small role="status">Precise room-size editing is unavailable for this design. Review it or try another.</small>}
            </div>
            {button('choose', 'Yes, choose this', () => onAccept(candidate, selectedFloor), { primary: true, deliberate: true, disabled: warnings.length > 0 && !warningsSeen })}
            {button('next', safeIndex + 1 < candidates.length ? 'No, show next' : 'No, finish review', nextCandidate)}
            {button('adjust', 'Adjust an area', () => {
              setSelectedRoom(null);
              setEditError(null);
              setAreaUnavailable(false);
              setStep('area');
              onSpeak(canEdit ? 'Select an occupied area to adjust.' : 'Area editing is unavailable for this design. You can review the other layouts.');
            }, { disabled: !canEdit })}
            {button('previous', 'Previous design', () => {
              setIndex(Math.max(0, safeIndex - 1));
              setFloor('ground');
              setAreaUnavailable(false);
            }, { disabled: safeIndex === 0 })}
            {canUndo && button('undo', 'Undo area edit', undoEdit)}
            {warnings.length > 0 && button('review-notes', `Plan notes (${warnings.length})`, () => { setWarningReturnStep('review'); setWarningPage(0); setStep('warnings'); })}
          </aside>
        </main>
      )}

      {!loading && !error && candidate && step === 'inspect' && (
        <main className="pr-review-layout">
          <section className="pr-plan-panel" aria-label="Inspected floor plan">
            <div className="pr-plan-heading">
              <div><span className="pr-eyebrow">{candidate.label}</span><h2>{inspectPreset} view · {selectedFloor} floor</h2></div>
            </div>
            <div className="pr-drawing pr-inspect-drawing">
              {planImage(candidate, selectedFloor)
                ? <img
                  src={planImage(candidate, selectedFloor)}
                  alt={`${inspectPreset} view of ${candidate.label} ${selectedFloor} floor plan`}
                  style={{ transform: inspectPreset === 'Full' ? 'scale(1)' : 'scale(2)', transformOrigin: inspectTransformOrigin[inspectPreset] }}
                />
                : <div className="pr-no-image">Drawing unavailable for this floor.</div>}
            </div>
            <div className="pr-plan-footer"><p>Choose a fixed view. The drawing does not require dragging.</p>{floorControls}</div>
          </section>
          <aside className="pr-choice-rail" aria-label="Inspection views">
            <div className="pr-choice-intro"><span className="pr-eyebrow">INSPECTION</span><p>Look more closely</p></div>
            {(['Full', 'Back', 'Front', 'Left', 'Right'] as InspectPreset[]).map(preset => button(`inspect-${preset.toLowerCase()}`, preset, () => { setInspectPreset(preset); onSpeak(`${preset} view.`); }, { selected: inspectPreset === preset }))}
            {button('inspect-back', 'Back to choices', () => setStep('review'), { primary: true })}
          </aside>
        </main>
      )}

      {!loading && !error && candidate && step === 'finished' && (
        <main className="pr-message-layout">
          <div className="pr-message-card">
            <span className="pr-eyebrow">REVIEW COMPLETE</span>
            <h2>Would you like to revisit a design?</h2>
            <p>{onOpenSavedPlan ? 'Your Compass Map and previously chosen plan are saved.' : 'Your Compass Map is still saved. No design has been selected yet.'}</p>
            {onOpenOriginalPlan && <p className="pr-original-note">The original opens in the earlier viewer without candidate validation.</p>}
            <div className="pr-message-actions">
              {button('review-first', 'Review designs again', () => { setIndex(0); setFloor('ground'); setStep('review'); }, { primary: true })}
              {button('review-previous', 'Previous design', () => { setIndex(candidates.length - 1); setStep('review'); })}
              {onOpenOriginalPlan && button('original-after-review', 'Preview unvalidated original', onOpenOriginalPlan)}
              {button('edit-map', 'Adjust map', onClose)}
            </div>
          </div>
        </main>
      )}

      {!loading && !error && candidate && step === 'area' && (
        <main className="pr-area-layout">
          <section className="pr-area-panel">
            <div className="pr-section-title"><span className="pr-eyebrow">STEP 1 OF 2</span><h2>Select a room on the {selectedFloor} floor</h2></div>
            <div className="pr-area-grid" aria-label="Four by four occupied area selector">
              {[4, 3, 2, 1].flatMap(row => [1, 2, 3, 4].map(col => {
                const cell = `r${row}_c${col}`;
                const room = cellRooms.get(cell);
                return room && floorAdjustments[room.placementId]?.length
                  ? button(`cell-${selectedFloor}-${cell}`, <><strong>{room.label}</strong><small>{cell.replace('_', ' · ').toUpperCase()}</small></>, () => {
                    setSelectedRoom(room);
                    setStep('direction');
                    onSpeak(`${room.label} selected. Choose an edge to adjust.`);
                  }, { className: 'pr-cell' })
                  : room
                    ? <div className="pr-cell pr-locked" key={cell} aria-label={`${room.label}, no size edit available`}><strong>{room.label}</strong><small>No size edit</small></div>
                  : <div className="pr-cell pr-empty" key={cell} aria-label={`${cell} unassigned`}>Unassigned</div>;
              }))}
            </div>
          </section>
          <aside className="pr-area-side">
            <p>Choose any occupied square. All squares belonging to the same room select that room.</p>
            {floorControls}
            {button('area-back', 'Back to design', () => setStep('review'))}
          </aside>
        </main>
      )}

      {!loading && !error && candidate && selectedRoom && step === 'direction' && (
        <main className="pr-edit-layout">
          <section className="pr-edit-main">
            <div className="pr-section-title"><span className="pr-eyebrow">STEP 2 OF 2 · {selectedRoom.label}</span><h2>Which boundary should move out by 1 ft?</h2><p>Front faces the road; back is at the top of this drawing.</p></div>
            <div className="pr-direction-grid">
              {EDGE_CHOICES.filter(choice => allowedEdges.includes(choice.direction)).map(choice => button(`edge-${choice.direction}`, <><strong>{choice.label}</strong><small>{choice.detail}</small></>, () => void requestPreview(choice.direction), { className: 'pr-direction' }))}
            </div>
            {editPending && <p className="pr-edit-status" role="status">Checking this adjustment and drawing the result…</p>}
            {editError && <p className="pr-edit-error" role="alert">{editError}</p>}
          </section>
          <aside className="pr-edit-side">
            <div className="pr-selected-room"><span>SELECTED ROOM</span><strong>{selectedRoom.label}</strong><small>{selectedRoom.area} sq ft · {selectedRoom.cells.length} compass {selectedRoom.cells.length === 1 ? 'cell' : 'cells'}</small></div>
            <p>The generator checks neighboring rooms, plot limits, and access before showing a result.</p>
            {button('edge-back', 'Choose another room', () => setStep('area'))}
          </aside>
        </main>
      )}

      {!loading && !error && candidate && selectedRoom && preview && step === 'compare' && (
        <main className="pr-compare-layout">
          <div className="pr-compare-drawings">
            <figure><figcaption>BEFORE · {selectedRoom.label}</figcaption><img src={planImage(candidate, selectedFloor)} alt="Plan before room adjustment" /></figure>
            <figure><figcaption>AFTER · {EDGE_CHOICES.find(choice => choice.direction === edge)?.label.toUpperCase()} +1 FT</figcaption><img src={planImage(preview, selectedFloor)} alt="Plan after room adjustment" /></figure>
          </div>
          <aside className="pr-choice-rail">
            <div className="pr-choice-intro"><span className="pr-eyebrow">VALIDATED PREVIEW</span><p>{selectedRoom.area} → {adjustedPlacement?.area_sqft ?? '—'} sq ft{areaDifference !== null ? ` (${areaDifference >= 0 ? '+' : ''}${areaDifference})` : ''}</p><small>{preview.changes[0] || 'Review the new room boundary.'}</small></div>
            {button('apply', 'Apply this change', applyPreview, { primary: true, deliberate: true })}
            {button('compare-back', 'Choose another edge', () => { setPreview(null); setStep('direction'); })}
            {button('compare-cancel', 'Keep original', () => { setPreview(null); setStep('review'); })}
          </aside>
        </main>
      )}
    </div>
  );
}
