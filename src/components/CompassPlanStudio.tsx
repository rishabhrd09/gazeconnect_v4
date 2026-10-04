import React, { useEffect, useRef, useState } from 'react';
import GazeButton from './core/GazeButton';
import { GazeToggleCardFace } from './core/GazeToggleCardFace';
import { useGazeControl } from './core/GazeControlToggle';
import { useTheme } from '../contexts/ThemeContext';
import { DWELL_GROUPS } from '../config/dwellTimeConfig';
import { useDwellTime } from '../contexts/DwellTimeContext';
import { CompassExteriorStyle, CompassMapPayload, CompassPlanOption, CompassPlanScope, CompassView, getCompassPlanOptions, renderCompassPlan } from '../utils/floorplanApi';
import '../styles/compass-plan-studio.css';

type Page = 'plan' | 'downloads' | 'rooms' | 'notes' | 'views' | 'styles';
const ZOOMS = ['Whole plan', 'Back left', 'Back right', 'Front left', 'Front right'];
const EXTERIORS: Array<{ id: CompassExteriorStyle; label: string; detail: string; colours: string[] }> = [
  { id: 'verandah', label: 'Verandah', detail: 'Pale walls · timber · cool glass', colours: ['#EEECE4', '#987657', '#A8C6C9'] },
  { id: 'warm-modern', label: 'Warm Modern', detail: 'Warm plaster · oak · sand', colours: ['#EBDFCD', '#8B603E', '#D8C8AD'] },
  { id: 'terracotta', label: 'Earth & Terracotta', detail: 'Clay · natural stone · deep frames', colours: ['#D6A185', '#A18B77', '#454C43'] },
];
function savedExterior(): CompassExteriorStyle {
  try { return EXTERIORS.find(s => s.id === localStorage.getItem('gc-compass-exterior'))?.id || 'verandah'; }
  catch { return 'verandah'; }
}
interface Props {
  source: CompassMapPayload;
  scope: CompassPlanScope;
  onClose: () => void;
  onSpeak: (message: string) => void;
  onLegacyReview: () => void;
}

export function CompassPlanStudio({ source, scope, onClose, onSpeak, onLegacyReview }: Props) {
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze, signalNavigation } = useGazeControl();
  const { theme, isWarm } = useTheme();
  const drawingTheme = document.documentElement.dataset.design === 'serene' ? `serene-${theme}` : theme;
  useDwellTime();
  const [plans, setPlans] = useState<CompassPlanOption[]>([]);
  const [index, setIndex] = useState(0);
  const [floor, setFloor] = useState<'ground' | 'first'>('ground');
  const [view, setView] = useState<CompassView>('2d');
  const [exterior, setExterior] = useState<CompassExteriorStyle>(savedExterior);
  const [previousExterior, setPreviousExterior] = useState<CompassExteriorStyle | null>(null);
  const [roomId, setRoomId] = useState<string>();
  const [roomZoom, setRoomZoom] = useState(0);
  const [page, setPage] = useState<Page>('plan');
  const [detailPage, setDetailPage] = useState(0);
  const [angle, setAngle] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState('');
  const [image, setImage] = useState('');
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageInset, setImageInset] = useState({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const exportLock = useRef(false);
  const alive = useRef(true);
  const speak = useRef(onSpeak); speak.current = onSpeak;
  const plan = plans[index];
  const rotatedPlan = !!plan && plan.compassData.plot.depth_ft > plan.compassData.plot.width_ft;
  const left = `${imageInset.x}%`, right = `${100 - imageInset.x}%`;
  const top = `${imageInset.y}%`, bottom = `${100 - imageInset.y}%`;
  const zoomPositions = rotatedPlan ? ['50% 50%', `${right} ${top}`, `${right} ${bottom}`, `${left} ${top}`, `${left} ${bottom}`] : ['50% 50%', `${left} ${top}`, `${right} ${top}`, `${left} ${bottom}`, `${right} ${bottom}`];
  const hasFirst = !!plan?.compassData.first_floor?.placements.length;
  const rooms = (floor === 'first' ? plan?.compassData.first_floor : plan?.compassData.ground_floor)?.placements || [];
  const selectedRoom = roomId ? rooms.find(r => r.placementId === roomId) : undefined;
  const roomIndex = rooms.findIndex(r => r.placementId === roomId);
  const notes = plan?.notes || [];
  const floorChanges = plan?.changes?.filter(c => c.floor === `${floor}_floor`) || [];
  const gains = floorChanges.filter(c => c.area_delta_sqft > 0).sort((a, b) => b.area_delta_sqft - a.area_delta_sqft);
  const losses = floorChanges.filter(c => c.area_delta_sqft < 0).sort((a, b) => a.area_delta_sqft - b.area_delta_sqft);
  const comparison = gains.length ? [gains[0], losses[0]].filter(Boolean).map(c => `${c.room} ${c.area_delta_sqft > 0 ? '+' : '−'}${Math.abs(c.area_delta_sqft).toFixed(0)} sq ft`).join(' · ') : plan?.summary || '';
  const pages = Math.max(1, Math.ceil((page === 'notes' ? notes.length : rooms.length) / (page === 'notes' ? 3 : 4)));
  const go = (next: Page) => { signalNavigation(); setPage(next); setDetailPage(0); setExportMessage(''); };
  const selectRoom = (id: string | undefined) => { if (!id) return; signalNavigation(); setRoomId(id); setRoomZoom(0); setZoom(0); setAngle(0); setView('3d'); setPage('plan'); };
  const wholePlan = () => { signalNavigation(); setRoomId(undefined); setRoomZoom(0); setZoom(0); };
  const selectView = (next: CompassView) => { wholePlan(); setView(next); setPage('plan'); };
  const changeFloor = () => { wholePlan(); setFloor(floor === 'ground' ? 'first' : 'ground'); setDetailPage(0); };
  const applyExterior = (next: CompassExteriorStyle) => { setPreviousExterior(exterior); setExterior(next); selectView('exterior'); };
  useEffect(() => { try { localStorage.setItem('gc-compass-exterior', exterior); } catch { /* Viewing remains available if storage is full. */ } }, [exterior]);
  useEffect(() => { alive.current = true; signalNavigation(); return () => { alive.current = false; }; }, [signalNavigation]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setPlans([]); setIndex(0); setFloor('ground');
    setRoomId(undefined); setRoomZoom(0); setView('2d'); setAngle(0); setZoom(0);
    getCompassPlanOptions(source, scope, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (!result.options.length) throw new Error('No plan was returned. Please try again.');
      setPlans(result.options);
      speak.current(`${result.options.length} ${result.options.length === 1 ? 'plan is' : 'plans are'} ready.`);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [source, scope, retry]);

  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    setImage(''); setImageError('');
    if (!plan) return;
    setRendering(true);
    renderCompassPlan(plan.compassData, { floor, view, format: view === 'exterior' ? 'png' : 'svg', theme: drawingTheme, angle, room_id: roomId, style: exterior }, controller.signal)
      .then(blob => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob); setImage(url);
      }).catch(e => { if (!controller.signal.aborted) setImageError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setRendering(false); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [plan, floor, view, drawingTheme, angle, roomId, exterior]);

  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;
    const measure = () => {
      if (!img.naturalWidth || !img.clientWidth || !img.clientHeight) return;
      const scale = Math.min(img.clientWidth / img.naturalWidth, img.clientHeight / img.naturalHeight);
      setImageInset({ x: (1 - img.naturalWidth * scale / img.clientWidth) * 50, y: (1 - img.naturalHeight * scale / img.clientHeight) * 50 });
    };
    img.addEventListener('load', measure);
    const observer = new ResizeObserver(measure); observer.observe(img); measure();
    return () => { img.removeEventListener('load', measure); observer.disconnect(); };
  }, [image, page]);

  async function download(format: 'png' | 'pdf' | 'dxf') {
    if (!plan || exportLock.current) return;
    exportLock.current = true; setExporting(true); setExportMessage('Preparing your download…');
    try {
      const blob = await renderCompassPlan(plan.compassData, { floor, view: format === 'png' ? view : 'technical', format, theme: drawingTheme, angle, room_id: format === 'png' ? roomId : undefined, style: exterior });
      if (!alive.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = `GazeConnect-plan-${index + 1}-${floor}-${format === 'png' ? (selectedRoom ? `room-${roomIndex + 1}-3d` : view) : 'drawing'}.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setExportMessage(`${format.toUpperCase()} download started.`); speak.current(`${format.toUpperCase()} download started.`);
    } catch (e) { if (alive.current) setExportMessage(e instanceof Error ? e.message : 'Download failed. Please try again.'); }
    finally { exportLock.current = false; if (alive.current) setExporting(false); }
  }
  const button = (id: string, label: React.ReactNode, action: () => void, disabled = false, selected = false) => (
    <GazeButton id={`compass-studio-${id}`} className={`studio-button${selected ? ' studio-selected' : ''}`}
      gazeEnabled={isGazeEnabled && !disabled} gazeEnabledTimestamp={lastEnabledTimestamp}
      isDarkMode={!isWarm} dwellCategory="compassMapAction" selected={selected} disabled={disabled} onClick={action}>{label}</GazeButton>
  );
  const movePlan = (offset: number) => {
    wholePlan(); setIndex(i => i + offset); setAngle(0); setDetailPage(0);
  };
  const title = page === 'downloads' ? 'Download this plan' : page === 'rooms' ? 'Choose a room to view' : page === 'notes' ? 'Plan notes' : page === 'views' ? 'How would you like to view it?' : page === 'styles' ? 'Choose your exterior finish' : selectedRoom?.room || plan?.label || 'Your floor plan';
  const caption = page === 'views' ? 'Every view uses the same Compass layout.' : page === 'styles' ? 'A finish changes the appearance. Your rooms and dimensions stay the same.' : selectedRoom && page === 'plan' ? `${floor === 'ground' ? 'Ground' : 'First'} floor · room ${roomIndex + 1} of ${rooms.length} · ${roomZoom ? `${Math.round((1 + roomZoom * .3) * 100)}% zoom` : 'Whole room'}` : '';
  return <div className="compass-plan-studio design-surface" role="dialog" aria-modal="true" aria-label="Compass floor plan viewer">
    <header className="studio-header">
      {button('back', page === 'plan' ? (selectedRoom ? '← Whole plan' : '← Back to map') : '← Back to plan', page === 'plan' ? (selectedRoom ? wholePlan : onClose) : () => go('plan'))}
      <div className="studio-heading"><p>{scope === 'ground' ? 'GROUND FLOOR ONLY' : 'COMPASS FLOOR PLANS'}{plan && ` · PLAN ${index + 1} OF ${plans.length}`}</p><h1>{title}</h1></div>
      <button id="compass-studio-gaze-toggle" className="gaze-button gaze-toggle gaze-switch-card" data-gaze="true"
        data-gaze-toggle="true" data-gaze-always="true" data-snap-priority="3" data-gaze-context="gazetoggle"
        data-gaze-dwell-ms={String(DWELL_GROUPS.deliberate.ms)} aria-pressed={isGazeEnabled}
        aria-label={isGazeEnabled ? 'Pause gaze' : 'Enable gaze'} onClick={toggleGaze}><GazeToggleCardFace on={isGazeEnabled} /></button>
    </header>
    <div className="studio-caption" role="status">{loading ? 'Preparing layout choices from your Compass Map…' : error || caption || (page === 'downloads' ? `${selectedRoom ? 'PNG saves this room. PDF and CAD save the whole floor.' : `${floor === 'ground' ? 'Ground' : 'First'} floor · selected plan ${index + 1}. Downloads use this exact layout.`}` : page === 'rooms' ? 'Look at a room card to open its 3D view. Sizes are in feet.' : page === 'notes' ? 'Preliminary layout checks · review these with your designer.' : `${view === 'exterior' ? 'House exterior' : floor === 'ground' ? 'Ground floor' : 'First floor'} · ${comparison}`)}</div>
    {loading || error ? <main className="studio-empty"><h2>{loading ? 'Building your plan…' : 'Your map is safe'}</h2><p>{loading ? 'Your original room placements will stay unchanged.' : error}</p>
      {!loading && <div className="studio-error-actions">{button('retry', 'Try again', () => setRetry(x => x + 1))}{/refinement|cell layouts/i.test(error) && button('legacy', 'Open saved refinements', onLegacyReview)}</div>}
    </main> : plan && <>
      {page === 'plan' && <main className="studio-main">
        <div className="studio-drawing" data-zoom={zoom}>
          {image ? <img ref={imageRef} alt={`${plan.label}, ${selectedRoom?.room || floor}, ${view}, ${selectedRoom ? 'room view' : ZOOMS[zoom]}`} src={image}
            style={{ transform: selectedRoom ? `scale(${1 + roomZoom * .3})` : zoom ? 'scale(2)' : undefined, transformOrigin: selectedRoom ? '50% 44%' : zoomPositions[zoom] }} /> : <div className="studio-image-status">{imageError || (rendering ? 'Drawing your plan…' : '')}{imageError && button('render-retry', 'Try again', () => setPlans([...plans].map((p, i) => i === index ? { ...p } : p)))}</div>}
          {zoom > 0 && <span className="studio-zoom-name">{ZOOMS[zoom]}</span>}
        </div>
        <aside className="studio-tools" aria-label="Plan view controls">
          {selectedRoom ? <>
            {button('inspect', <>Rotate room<small>View {angle + 1} of 4 →</small></>, () => setAngle((angle + 1) % 4), rendering)}
            {button('zoom-in', <>Zoom in<small>See more detail</small></>, () => setRoomZoom(z => Math.min(2, z + 1)), roomZoom === 2 || rendering)}
            {button('zoom-out', <>Zoom out<small>{roomZoom ? 'Step back' : 'Whole room'}</small></>, () => setRoomZoom(z => Math.max(0, z - 1)), roomZoom === 0 || rendering)}
            {button('details', <>Choose a room<small>{rooms.length} rooms on this floor</small></>, () => go('rooms'))}
          </> : <>
            {button('view', <>Change view<small>2D · interior · exterior</small></>, () => go('views'))}
            {button('floor', <>{view === 'exterior' && hasFirst ? 'Both floors' : floor === 'ground' ? 'Ground floor' : 'First floor'}<small>{view === 'exterior' ? 'Exterior of placed rooms' : hasFirst ? `View ${floor === 'ground' ? 'first' : 'ground'} floor →` : 'Only this floor'}</small></>, changeFloor, !hasFirst || view === 'exterior' || rendering)}
            {button('inspect', view === '2d' ? <>Enlarge plan<small>{ZOOMS[zoom]} · next view →</small></> : <>Rotate view<small>View {angle + 1} of 4 →</small></>, () => view === '2d' ? setZoom((zoom + 1) % ZOOMS.length) : setAngle((angle + 1) % 4), rendering)}
            {button('details', <>Explore rooms<small>{rooms.length} rooms · choose by gaze</small></>, () => go('rooms'))}
          </>}
        </aside>
      </main>}
      {page === 'downloads' && <main className="studio-downloads">
        {button('png', <><span className="studio-format">PNG</span>Save this view<small>{selectedRoom ? 'This room in 3D' : view === 'exterior' ? 'Exterior of this house' : `A clear image of your ${view === '2d' ? '2D plan' : '3D cutaway'}`}</small></>, () => void download('png'), exporting)}
        {button('pdf', <><span className="studio-format">PDF</span>Drawing for review<small>A3 sheet with room sizes and areas</small></>, () => void download('pdf'), exporting)}
        {button('dxf', <><span className="studio-format">DXF</span>CAD drawing<small>Layered, dimensioned CAD · millimetres</small></>, () => void download('dxf'), exporting)}
        <p className="studio-export-status" role="status">{exportMessage || 'Architectural details are proposed. A designer must verify dimensions, stairs, windows and structure.'}</p>
      </main>}
      {page === 'rooms' && <main className="studio-details">
        {rooms.slice(detailPage * 4, detailPage * 4 + 4).map((room, n) => {
          const change = plan.changes?.find(c => c.floor === `${floor}_floor` && c.placementId === room.placementId);
          return <React.Fragment key={room.placementId || n}>{button(`room-${detailPage * 4 + n}`, <><span>{room.room}</span><small>{(room.coords.x2 - room.coords.x1).toFixed(1)} × {(room.coords.y2 - room.coords.y1).toFixed(1)} ft · {room.area_sqft.toFixed(1)} sq ft<br/>{change ? `${change.area_delta_sqft > 0 ? '+' : ''}${change.area_delta_sqft} sq ft compared with your map` : 'Matches your map’s room area'}</small><small>View room in 3D →</small></>, () => selectRoom(room.placementId), !room.placementId)}</React.Fragment>;
        })}
      </main>}
      {page === 'views' && <main className="studio-details">
        {button('view-2d', <>2D floor plan<small>Rooms, stairs and dimensions</small></>, () => selectView('2d'), false, view === '2d')}
        {button('view-3d', <>Inside the house<small>3D cutaway of this floor</small></>, () => selectView('3d'), false, view === '3d')}
        {button('view-exterior', <>Outside the house<small>3D exterior from your map</small></>, () => selectView('exterior'), false, view === 'exterior')}
        {button('styles', <>Exterior finish<small>Verandah · Warm Modern · Terracotta</small></>, () => go('styles'))}
      </main>}
      {page === 'styles' && <main className="studio-downloads studio-styles">
        {EXTERIORS.map(style => <React.Fragment key={style.id}>{button(`style-${style.id}`, <><span className="studio-swatches" aria-hidden="true">{style.colours.map(colour => <i key={colour} style={{ background: colour }}/>)}</span>{style.label}<small>{style.detail}</small><small>{exterior === style.id ? 'Selected' : 'Preview this finish →'}</small></>, () => applyExterior(style.id), false, exterior === style.id)}</React.Fragment>)}
        <p className="studio-export-status">Finishes are proposed. Your Compass map is kept unchanged.</p>
      </main>}
      {page === 'notes' && <main className="studio-notes">{(notes.length ? notes.slice(detailPage * 3, detailPage * 3 + 3) : ['Room geometry and access checks passed. This is a preliminary design, not a construction-approved plan.']).map((note, n) => <article key={n}>{note.replace(/ground_floor/g, 'Ground floor').replace(/first_floor/g, 'First floor')}</article>)}</main>}
      <footer className="studio-footer">
        {page === 'plan' ? <>{button('previous', selectedRoom ? '← Previous room' : '← Previous plan', () => selectedRoom ? selectRoom(rooms[roomIndex - 1].placementId) : movePlan(-1), selectedRoom ? roomIndex === 0 : index === 0)}{button('downloads', 'Download plan', () => go('downloads'))}{button('next', selectedRoom ? 'Next room →' : 'Next plan →', () => selectedRoom ? selectRoom(rooms[roomIndex + 1].placementId) : movePlan(1), selectedRoom ? roomIndex === rooms.length - 1 : index === plans.length - 1)}</>
          : page === 'views' || page === 'styles' ? <>{button('return', '← Back to plan', () => go('plan'))}{page === 'styles' ? button('undo-style', 'Undo finish', () => { if (previousExterior) { setExterior(previousExterior); setPreviousExterior(null); selectView('exterior'); } }, !previousExterior) : button('choose-room', 'Choose a room', () => go('rooms'))}{button('notes', 'Plan notes', () => go('notes'))}</>
          : page === 'downloads' ? <>{button('return', '← Back to plan', () => go('plan'))}<p>{plan.valid ? 'Geometry checked · professional review still needed' : 'Map preview · review the plan notes before building'}</p>{button('notes', 'Plan notes', () => go('notes'))}</>
            : <>{button('detail-prev', '← Previous', () => setDetailPage(p => p - 1), detailPage === 0)}{button('notes', page === 'rooms' ? 'Plan notes' : 'Room details', () => go(page === 'rooms' ? 'notes' : 'rooms'))}{button('detail-next', `More ${page === 'rooms' ? 'rooms' : 'notes'} →`, () => setDetailPage(p => p + 1), detailPage >= pages - 1)}</>}
      </footer>
      <div className="studio-footnote">{page === 'rooms' || page === 'notes' ? `Page ${detailPage + 1} of ${pages}` : `${plans.length} distinct ${plans.length === 1 ? 'layout' : 'layouts'} available · ${plan.valid ? 'preliminary design' : 'unfinished map preview — see Room details → Plan notes'}`}</div>
    </>}
  </div>;
}
