/**
 * The Compass studio (version 2): one authoritative plan drawn three ways, honest downloads, notes.
 *
 * docs/compass-refine/IMPLEMENTATION_PLAN.md §6.5: it keeps Back to map, the floor switch, three view
 * buttons (Plan, Top view, Outside, with one button cycling the four named outside angles), Downloads
 * and Plan notes. It no longer offers alternative layouts, corner zoom, room views, rotation or
 * exterior finishes (decided 14 Oct 2026). Every image is a still drawn by the floor-plan service from
 * the same PlanModel; a newer request replaces an older one, and nothing here ever changes the map.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import GazeButton from '../core/GazeButton';
import { GazeToggleCardFace } from '../core/GazeToggleCardFace';
import { useGazeControl } from '../core/GazeControlToggle';
import { useTheme } from '../../contexts/ThemeContext';
import { DWELL_GROUPS, type DwellAction } from '../../config/dwellTimeConfig';
import { useDwellTime } from '../../contexts/DwellTimeContext';
import type { CompassPlanV2 } from '../../types/compassPlan';
import {
  CompassModelSummary, FloorplanResources, OutsidePreset, StudioNote, StudioView, getCompassModel,
  getFloorplanResources, renderCompassView, saveCompassFile,
} from '../../utils/floorplanApi';
import '../../styles/compass-plan-studio.css';

type Page = 'view' | 'downloads' | 'notes';
type Floor = 'ground' | 'first';
const PRESETS: Array<{ id: OutsidePreset; label: string }> = [
  { id: 'front-left', label: 'Front left' }, { id: 'front-right', label: 'Front right' },
  { id: 'back-left', label: 'Back left' }, { id: 'back-right', label: 'Back right' },
];
const VIEW_NAMES: Record<StudioView, string> = { plan: 'Plan', top: 'Top view', outside: 'Outside' };
const FLOOR_NAMES: Record<Floor, string> = { ground: 'Ground floor', first: 'First floor' };
const SEVERITY_ORDER = { infeasible: 0, conflict: 1, warning: 2, info: 3 } as const;

interface Props {
  plan: CompassPlanV2;
  scope: 'ground' | 'all';
  onClose: () => void;
  onSpeak: (message: string) => void;
  onLegacyReview: () => void;
}

/** Image size for the drawing area: device pixels, rounded so small resizes reuse the cached image. */
function imageSize(element: HTMLElement | null, light: boolean): { width: number; height: number } {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const maxW = light ? 1600 : 2400, maxH = light ? 1000 : 1600;
  const w = Math.max(640, Math.min(maxW, Math.round(((element?.clientWidth || 1200) * dpr) / 50) * 50));
  const h = Math.max(400, Math.min(maxH, Math.round(((element?.clientHeight || 750) * dpr) / 50) * 50));
  return { width: w, height: h };
}

export function CompassStudio({ plan, scope, onClose, onSpeak, onLegacyReview }: Props) {
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze, signalNavigation } = useGazeControl();
  const { theme, isWarm } = useTheme();
  const drawingTheme = document.documentElement.dataset.design === 'serene' ? `serene-${theme}` : theme;
  useDwellTime();
  // "Ground floor only" draws the ground floor as a finished house; the first-floor draft stays in the map.
  const studioPlan = useMemo<CompassPlanV2>(() => (scope === 'ground'
    ? { ...plan, storeys: 1, floors: { ground: plan.floors.ground } } : plan), [plan, scope]);
  const legacyLocked = !!plan.legacy && !plan.legacy.converted;
  const [summary, setSummary] = useState<CompassModelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState<Page>('view');
  const [view, setView] = useState<StudioView>('plan');
  const [floor, setFloor] = useState<Floor>('ground');
  const [preset, setPreset] = useState(0);
  const [notesPage, setNotesPage] = useState(0);
  const [image, setImage] = useState('');
  const [rendering, setRendering] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageRetry, setImageRetry] = useState(0);
  const [resources, setResources] = useState<FloorplanResources | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const drawingRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const speak = useRef(onSpeak); speak.current = onSpeak;
  const spokenFirst = useRef(false);

  useEffect(() => { alive.current = true; signalNavigation(); return () => { alive.current = false; }; }, [signalNavigation]);
  useEffect(() => { void getFloorplanResources().then(r => { if (alive.current) setResources(r); }); }, []);

  useEffect(() => {
    if (legacyLocked) { setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true); setError(''); setSummary(null);
    getCompassModel(studioPlan, controller.signal).then(result => {
      if (controller.signal.aborted || !result) return;
      setSummary(result);
      if (!result.floorsDrawn.includes(floor)) setFloor('ground');
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [studioPlan, retry, legacyLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const light = !!resources?.light;
  const outsideAllowed = !resources || resources.exterior;
  const hasFirst = !!summary?.floorsDrawn.includes('first');

  useEffect(() => {
    if (!summary || page !== 'view') return undefined;
    const controller = new AbortController();
    let url = '';
    setImageError(''); setRendering(true);
    const size = imageSize(drawingRef.current, light);
    renderCompassView(studioPlan, {
      view, floor, format: 'png', theme: drawingTheme, preset: PRESETS[preset].id, ...size,
    }, controller.signal).then(blob => {
      if (controller.signal.aborted || !blob) return;
      url = URL.createObjectURL(blob);
      setImage(previous => { if (previous) URL.revokeObjectURL(previous); return url; });
      if (!spokenFirst.current) {
        spokenFirst.current = true;
        speak.current(`${FLOOR_NAMES[floor]} plan is ready.`);
      }
    }).catch(e => { if (!controller.signal.aborted) setImageError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!controller.signal.aborted) setRendering(false); });
    return () => controller.abort();
  }, [summary, page, view, floor, preset, drawingTheme, studioPlan, light, imageRetry]);

  // One decoded image at a time; the last one is released when the studio closes.
  useEffect(() => () => { setImage(previous => { if (previous) URL.revokeObjectURL(previous); return ''; }); }, []);

  const notes = useMemo<StudioNote[]>(() => [...(summary?.notes || [])]
    .filter(n => scope === 'all' || n.floor !== 'first')
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]), [summary, scope]);
  const problems = notes.filter(n => n.severity !== 'info').length;
  const notePages = Math.max(1, Math.ceil(notes.length / 3));

  const go = (next: Page) => { signalNavigation(); setPage(next); setNotesPage(0); setExportMessage(''); };
  const chooseView = (next: StudioView) => {
    signalNavigation(); setView(next);
    speak.current(next === 'outside' ? `Outside, ${PRESETS[preset].label}.` : `${VIEW_NAMES[next]}, ${FLOOR_NAMES[floor]}.`);
  };
  const switchFloor = () => {
    const next: Floor = floor === 'ground' ? 'first' : 'ground';
    signalNavigation(); setFloor(next); speak.current(`${FLOOR_NAMES[next]}.`);
  };
  const nextAngle = () => {
    const next = (preset + 1) % PRESETS.length;
    signalNavigation(); setPreset(next); speak.current(`Outside, ${PRESETS[next].label}.`);
  };

  const fileStem = `Compass-${(summary?.modelHash || 'plan').slice(0, 8)}`;
  async function download(kind: 'image' | 'sheet' | 'cad') {
    if (!summary || exporting) return;
    setExporting(true); setExportMessage('Preparing your files…');
    try {
      const jobs: Array<[Parameters<typeof saveCompassFile>[1], string]> = [];
      if (kind === 'image') {
        const name = view === 'outside' ? `outside-${PRESETS[preset].id}` : `${floor}-${view === 'top' ? 'top-view' : 'plan'}`;
        // Light machines save at 2400 x 1600 without the supersampled working image (about 190 MB less).
        jobs.push([{ view, floor, format: 'png', theme: 'warm', preset: PRESETS[preset].id, width: light ? 2400 : 3000, height: light ? 1600 : 2000, light },
          `${fileStem}-${name}.png`]);
      } else if (kind === 'sheet') {
        jobs.push([{ view: 'sheet', floor, format: 'pdf', theme: 'warm' }, `${fileStem}-drawing-sheets.pdf`]);
      } else {
        jobs.push([{ view: 'cad', floor, format: 'dxf-in', theme: 'warm' }, `${fileStem}-${floor}-feet-inches.dxf`]);
        jobs.push([{ view: 'cad', floor, format: 'dxf-mm', theme: 'warm' }, `${fileStem}-${floor}-millimetres.dxf`]);
        jobs.push([{ view: 'cad', floor, format: 'readme', theme: 'warm' }, `${fileStem}-${floor}-CAD-README.txt`]);
      }
      let folder = '';
      let place = 'Documents';
      for (const [options, name] of jobs) {
        const outcome = await saveCompassFile(studioPlan, options, name);
        if (!alive.current) return;
        if (!outcome.ok) throw new Error(outcome.error || 'The file could not be saved.');
        folder = outcome.folder || folder;
        place = outcome.place || place;
      }
      const message = folder
        ? `Saved in ${place}, GazeConnect Plans, ${folder.split(/[\\/]/).pop()}.`
        : 'Download started.';
      setExportMessage(message); speak.current(message);
    } catch (e) {
      if (alive.current) setExportMessage(e instanceof Error ? e.message : 'The file could not be saved. Please try again.');
    } finally {
      if (alive.current) setExporting(false);
    }
  }

  const button = (id: string, label: React.ReactNode, action: () => void, disabled = false, selected = false, category: DwellAction = 'compassMapAction') => (
    <GazeButton id={`compass-studio-${id}`} className={`studio-button${selected ? ' studio-selected' : ''}`}
      gazeEnabled={isGazeEnabled && !disabled} gazeEnabledTimestamp={lastEnabledTimestamp}
      isDarkMode={!isWarm} dwellCategory={category} selected={selected} disabled={disabled} onClick={action}>{label}</GazeButton>
  );

  const heading = page === 'downloads' ? 'Download this plan' : page === 'notes' ? 'Plan notes'
    : view === 'outside' ? `Outside · ${PRESETS[preset].label}` : `${FLOOR_NAMES[floor]} · ${VIEW_NAMES[view]}`;
  const plot = summary?.plot;
  const plotText = plot ? `${plot.widthFt} × ${plot.depthFt} ft plot · ${plot.facing}-facing` : '';
  const caption = loading ? 'Drawing your plan from the Compass map…'
    : error || (page === 'downloads' ? 'Files are saved without a dialog, in Documents › GazeConnect Plans.'
      : page === 'notes' ? 'Preliminary checks. Review them with your architect.'
        : rendering && !image ? 'Drawing…' : `${plotText}${problems ? ` · ${problems} note${problems === 1 ? '' : 's'} to review` : ' · no conflicts found'}`);

  return <div className="compass-plan-studio design-surface" role="dialog" aria-modal="true" aria-label="Compass plan studio">
    <header className="studio-header">
      {button('back', page === 'view' ? '← Back to map' : '← Back to plan', page === 'view' ? onClose : () => go('view'), false, false, 'backSkipButton')}
      <div className="studio-heading"><p>{scope === 'ground' ? 'GROUND FLOOR ONLY' : 'YOUR HOUSE'}</p><h1>{heading}</h1></div>
      <button id="compass-studio-gaze-toggle" className="gaze-button gaze-toggle gaze-switch-card" data-gaze="true"
        data-gaze-toggle="true" data-gaze-always="true" data-snap-priority="3" data-gaze-context="gazetoggle"
        data-gaze-dwell-ms={String(DWELL_GROUPS.deliberate.ms)} aria-pressed={isGazeEnabled}
        aria-label={isGazeEnabled ? 'Pause gaze' : 'Enable gaze'} onClick={toggleGaze}><GazeToggleCardFace on={isGazeEnabled} /></button>
    </header>
    <div className="studio-caption" role="status">{caption}</div>
    {legacyLocked ? <main className="studio-empty">
      <h2>This map has saved plan details</h2>
      <p>They were made with the earlier Refine Map. Open them with the saved-plan viewer, or convert the map on the Compass screen.</p>
      <div className="studio-error-actions">{button('legacy', 'Open saved refinements', onLegacyReview)}{button('legacy-back', '← Back to map', onClose, false, false, 'backSkipButton')}</div>
    </main> : loading || error || !summary ? <main className="studio-empty">
      <h2>{loading ? 'Drawing your plan…' : 'Your map is safe'}</h2>
      <p>{loading ? 'Your rooms and divided cells stay exactly as you placed them.' : error}</p>
      {!loading && <div className="studio-error-actions">{button('retry', 'Try again', () => setRetry(x => x + 1))}</div>}
    </main> : <>
      {page === 'view' && <main className="studio-main">
        <div className="studio-drawing" ref={drawingRef}>
          {image ? <img alt={`${heading}. ${plotText}.`} src={image} /> : null}
          {(!image || imageError) && <div className="studio-image-status">{imageError || (rendering ? 'Drawing…' : '')}
            {imageError && button('render-retry', 'Try again', () => setImageRetry(x => x + 1))}</div>}
        </div>
        <aside className="studio-tools" aria-label="Views">
          {button('view-plan', <>Plan<small>Rooms, walls and sizes</small></>, () => chooseView('plan'), false, view === 'plan')}
          {button('view-top', <>Top view<small>From above, furnished</small></>, () => chooseView('top'), false, view === 'top')}
          {button('view-outside', <>Outside<small>{outsideAllowed ? 'The house from the street' : 'Needs more free memory'}</small></>,
            () => chooseView('outside'), !outsideAllowed, view === 'outside')}
          {view === 'outside'
            ? button('angle', <>Next angle<small>Now: {PRESETS[preset].label} →</small></>, nextAngle, rendering)
            : button('floor', <>{FLOOR_NAMES[floor]}<small>{hasFirst ? `Show ${floor === 'ground' ? 'first' : 'ground'} floor →` : 'Only this floor'}</small></>,
              switchFloor, !hasFirst || rendering)}
        </aside>
      </main>}
      {page === 'downloads' && <main className="studio-downloads">
        {button('png', <><span className="studio-format">PNG</span>Save this view<small>{view === 'outside' ? `Outside, ${PRESETS[preset].label}` : `${FLOOR_NAMES[floor]}, ${VIEW_NAMES[view].toLowerCase()}`}</small></>, () => void download('image'), exporting)}
        {button('pdf', <><span className="studio-format">PDF</span>Drawing sheets<small>A3, true scale, every floor</small></>, () => void download('sheet'), exporting)}
        {button('dxf', <><span className="studio-format">DXF</span>CAD drawing<small>{FLOOR_NAMES[floor]} · feet-inches and millimetres</small></>, () => void download('cad'), exporting)}
        <p className="studio-export-status" role="status">{exportMessage || 'Preliminary concept: walls, doors, windows and stair are proposals. Not for construction.'}</p>
      </main>}
      {page === 'notes' && <main className="studio-notes">
        {(notes.length ? notes.slice(notesPage * 3, notesPage * 3 + 3) : [{ message: 'No notes for this plan.', severity: 'info' } as StudioNote])
          .map((note, n) => <article key={`${notesPage}-${n}`} data-severity={note.severity}>
            {note.floor ? `${FLOOR_NAMES[note.floor]}: ` : ''}{note.message}
          </article>)}
      </main>}
      <footer className="studio-footer">
        {page === 'view' ? <>
          {button('downloads', 'Download plan', () => go('downloads'))}
          <p>{problems ? `${problems} note${problems === 1 ? '' : 's'} to review` : 'Geometry checked · preliminary concept'}</p>
          {button('notes', `Plan notes${notes.length ? ` (${notes.length})` : ''}`, () => go('notes'))}
        </> : page === 'downloads' ? <>
          {button('return', '← Back to plan', () => go('view'), false, false, 'backSkipButton')}
          <p>Same plan as on screen · reference {summary.modelHash.slice(0, 8)}</p>
          {button('notes', 'Plan notes', () => go('notes'))}
        </> : <>
          {button('notes-prev', '← Previous', () => setNotesPage(p => p - 1), notesPage === 0, false, 'backSkipButton')}
          {button('return', '← Back to plan', () => go('view'), false, false, 'backSkipButton')}
          {button('notes-next', 'More notes →', () => setNotesPage(p => p + 1), notesPage >= notePages - 1)}
        </>}
      </footer>
      <div className="studio-footnote">{page === 'notes' ? `Page ${notesPage + 1} of ${notePages}` : 'Preliminary concept · not structurally verified · not for construction'}</div>
    </>}
  </div>;
}

export default CompassStudio;
