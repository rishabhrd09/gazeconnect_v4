/**
 * AdvancedMapScreen — Advanced Map Studio (v2 Two-Phase)
 * =====================================================
 * Phase 1: Room Selection — select rooms from library, place on grid
 * Phase 2: Refinement — split cells, wall logic, voids (existing tools)
 * Layout: horizontal flex row — LEFT sidebar + RIGHT grid
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import BaseGazeButton from '../components/core/GazeButton';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useWS } from '../hooks/useWebSocket';
import { ArchitecturalCell } from '../components/ArchitecturalCell';
import { FloorPlanViewerModal } from '../components/FloorPlanViewerModal';
import { useDwellTime } from '../contexts/DwellTimeContext';
import { DEFAULT_DWELL_TIMES } from '../config/dwellTimeConfig';
import {
  CompassMapPayload,
} from '../utils/floorplanApi';
import {
  RENDER_ORDER,
  GRID_ROWS,
  GRID_COLS,
} from '../types/compass';
import {
  parseCellKey,
  buildCellKey,
  cellToRect,
  cellsToBoundingRect,
} from '../utils/compassMath';
import { getDirectionLabels } from '../utils/compassDirections';
import { typography } from '../utils/design';
import type {
  AdvancedPhase,
  AdvancedRefinements,
  SplitDirection,
  AccessibilityMarker,
} from '../types/advancedMap';
import { useTheme } from '../contexts/ThemeContext';

const COMPASS_DRAFT_KEY = 'gazeconnect_compass_progress_v1';
const EMERGENCY_FONT = `'Arial Black', ${typography.fontFamily.primary}`;

const THEME = {
  bg: '#07111E',
  panel: '#0D1B2E',
  border: 'rgba(255,255,255,0.07)',
  border2: 'rgba(255,255,255,0.13)',
  teal: '#2DD4BF',
  violet: '#8B5CF6',
  blue: '#3B82F6',
  amber: '#F59E0B',
  red: '#EF4444',
  text: '#F0F4F8',
  sub: '#6B8FAF',
  dim: '#2E4A62',
  success: '#497775',
  road: '#38BDF8',
};

const ROOM_LIBRARY: Record<string, { roomLabel: string; shortLabel: string; color: string; desc: string }> = {
  porch: { roomLabel: 'Outer Lobby / Porch', shortLabel: 'Outer Lobby', color: '#81C784', desc: 'Entrance / porch' },
  lawn: { roomLabel: 'Lawn / Garden', shortLabel: 'Lawn', color: '#AED581', desc: 'Garden area' },
  verandah: { roomLabel: 'Verandah', shortLabel: 'Verandah', color: '#4DB6AC', desc: 'Covered porch' },
  backyard: { roomLabel: 'Backyard', shortLabel: 'Backyard', color: '#66BB6A', desc: 'Rear outdoor' },
  drawing: { roomLabel: 'Drawing Room', shortLabel: 'Drawing', color: '#7E57C2', desc: 'Formal seating' },
  kitchen: { roomLabel: 'Kitchen + Store', shortLabel: 'Kitchen', color: '#FFA726', desc: 'Cooking area' },
  living: { roomLabel: 'Living Hall', shortLabel: 'Living', color: '#42A5F5', desc: 'Main living room' },
  masterBed: { roomLabel: 'Master Bedroom', shortLabel: 'M.Bed', color: '#5E35B1', desc: 'Primary bedroom' },
  bedroom: { roomLabel: 'Bedroom', shortLabel: 'Bedroom', color: '#7E57C2', desc: 'Secondary room' },
  bathroom: { roomLabel: 'Bathroom', shortLabel: 'Bath', color: '#78909C', desc: 'Attached bath' },
  staircase: { roomLabel: 'Staircase', shortLabel: 'Stairs', color: '#A1887F', desc: 'Stair access only' },
  diningStaircase: { roomLabel: 'Dining + Staircase', shortLabel: 'Dining+Stairs', color: '#A1887F', desc: 'Combined space' },
  dining: { roomLabel: 'Dining Hall', shortLabel: 'Dining', color: '#FFCA28', desc: 'Eating area' },
  icu: { roomLabel: 'ICU Room', shortLabel: 'ICU', color: '#EF5350', desc: 'Medical / care room' },
  commonBath: { roomLabel: 'Common Bath', shortLabel: 'C.Bath', color: '#78909C', desc: 'Shared bathroom' },
  pooja: { roomLabel: 'Pooja Room', shortLabel: 'Pooja', color: '#FFB74D', desc: 'Prayer / worship' },
  study: { roomLabel: 'Study / Office', shortLabel: 'Study', color: '#4DB6AC', desc: 'Work or study space' },
  balcony: { roomLabel: 'Balcony', shortLabel: 'Balcony', color: '#66BB6A', desc: 'Open outdoor space' },
  corridor: { roomLabel: 'Corridor', shortLabel: 'Corridor', color: '#90A4AE', desc: 'Passage / hallway' },
};

const PHASE_COLORS: Record<string, string> = {
  room_selection: THEME.teal,
  overview: THEME.sub,
  split: THEME.violet,
  walls: THEME.teal,
  void: THEME.blue,
};

const CompassRose: React.FC<{ facing: string }> = ({ facing }) => {
  const rotMap: Record<string, number> = { North: 0, South: 180, East: 90, West: 270 };
  return (
    <div style={{
      position: 'absolute', top: '6px', right: '6px', zIndex: 12,
      width: '40px', height: '40px', borderRadius: '50%',
      background: '#0F172A', border: '1px solid rgba(100,116,139,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '9px', color: '#94A3B8', lineHeight: 1,
    }}>
      <div style={{ transform: `rotate(${rotMap[facing] || 0}deg)`, textAlign: 'center' }}>
        <div style={{ color: '#EF5350', fontWeight: 700, fontSize: '10px' }}>N</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '26px', padding: '1px 0' }}><span>W</span><span>E</span></div>
        <div style={{ fontSize: '10px' }}>S</div>
      </div>
    </div>
  );
};

// ─── Merged room detection: adjacent cells with same roomId ───
const computeMergedRooms = (gridMap: Record<string, { roomId: string; roomLabel?: string }>) => {
  const result: Record<string, {
    hideBorder: 'right' | 'bottom' | 'both' | null;
    leftSame: boolean;
    upSame: boolean;
    isLabelCell: boolean;
  }> = {};

  for (let r = 1; r <= 4; r++) {
    for (let c = 1; c <= 4; c++) {
      const cellId = `r${r}_c${c}`;
      const roomId = gridMap[cellId]?.roomId;

      const rightId = c < 4 ? `r${r}_c${c + 1}` : null;
      const downId = r < 4 ? `r${r + 1}_c${c}` : null;
      const leftId = c > 1 ? `r${r}_c${c - 1}` : null;
      const upId = r > 1 ? `r${r - 1}_c${c}` : null;

      const rightSame = !!(roomId && rightId && gridMap[rightId]?.roomId === roomId);
      const downSame = !!(roomId && downId && gridMap[downId]?.roomId === roomId);
      const leftSame = !!(roomId && leftId && gridMap[leftId]?.roomId === roomId);
      const upSame = !!(roomId && upId && gridMap[upId]?.roomId === roomId);

      result[cellId] = {
        hideBorder: rightSame && downSame ? 'both' : rightSame ? 'right' : downSame ? 'bottom' : null,
        leftSame,
        upSame,
        isLabelCell: !leftSame && !upSame,
      };
    }
  }
  return result;
};

// ─── StairDrawing: CSS-based stair visualization ───
const StairDrawing: React.FC<{ rotation?: number; width?: string; height?: string }> = ({
  rotation = 0, width = '100%', height = '100%',
}) => (
  <div style={{
    width, height,
    position: 'relative',
    transform: `rotate(${rotation}deg)`,
    display: 'flex', flexDirection: 'column',
    justifyContent: 'flex-end', padding: '4px',
  }}>
    {[0, 1, 2, 3, 4].map(i => (
      <div key={i} style={{
        position: 'absolute',
        bottom: `${i * 18}%`,
        left: `${i * 18}%`,
        width: `${82 - i * 18}%`,
        height: '3px',
        background: 'rgba(255,255,255,0.7)',
        borderRadius: '1px',
      }} />
    ))}
    {[0, 1, 2, 3, 4].map(i => (
      <div key={`v${i}`} style={{
        position: 'absolute',
        bottom: `${i * 18}%`,
        left: `${i * 18}%`,
        width: '3px',
        height: `${100 - i * 18}%`,
        background: 'rgba(255,255,255,0.7)',
        borderRadius: '1px',
      }} />
    ))}
    <div style={{
      position: 'absolute', top: 4, right: 6,
      fontSize: 10, color: 'rgba(255,255,255,0.5)',
      fontWeight: 800,
    }}>↑</div>
  </div>
);

const STAIR_ORIENTATIONS = [
  { label: 'Stairs Up', rotation: 0, desc: 'Ascending toward back' },
  { label: 'Stairs Down', rotation: 180, desc: 'Ascending toward front' },
  { label: 'Stairs Left', rotation: 270, desc: 'Ascending toward left' },
  { label: 'Stairs Right', rotation: 90, desc: 'Ascending toward right' },
];

const COMBO_LAYOUTS = [
  { id: 'stairs_left', label: 'Stairs on Left', stairSide: 'left' as const },
  { id: 'stairs_right', label: 'Stairs on Right', stairSide: 'right' as const },
  { id: 'stairs_top', label: 'Stairs on Top', stairSide: 'top' as const },
  { id: 'stairs_bottom', label: 'Stairs at Bottom', stairSide: 'bottom' as const },
];

interface AdvancedMapScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

function AdvancedMapScreen({ onNavigate, onSpeak }: AdvancedMapScreenProps) {
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze } = useGazeControl();
  const { isLight, isMix, isWarm } = useTheme();
  const ws = useWS();
  const { settings: dwellSettings } = useDwellTime();

  // ── Theme-aware tokens (drafting paper / workshop dusk) ──
  const T_pageBg = isLight ? '#EBE0CC' : isWarm ? '#F5EEDF' : isMix ? '#1A1611' : THEME.bg;
  const T_panelBg = isLight ? '#FAF5E8' : isWarm ? '#F8F1DF' : isMix ? '#241F18' : THEME.panel;
  const T_panelBorder = isLight ? '#3F6864' : isWarm ? '#CBBCA9' : isMix ? 'rgba(180, 147, 98, 0.42)' : THEME.border2;
  const T_panelBorderSoft = isLight ? '#D6CAB7' : isWarm ? '#DED2C2' : isMix ? 'rgba(180, 147, 98, 0.28)' : THEME.border;
  const T_textMain = isLight ? '#2E2A24' : isWarm ? '#2F2A26' : isMix ? '#FFFCF1' : THEME.text;
  const T_textSub = isLight ? '#76624A' : isWarm ? '#6A625B' : isMix ? '#C4B697' : THEME.sub;
  const T_textDim = isLight ? '#9A8568' : isWarm ? '#8A7C6B' : isMix ? '#8E7E62' : THEME.dim;
  const T_textInverse = isLight ? '#FBE9DE' : isWarm ? '#FBF5E5' : isMix ? '#FFFCF1' : '#FFFFFF';
  const T_cellEmpty = isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : isMix ? '#241E16' : THEME.bg;
  const T_cellBorder = isLight ? '#D6CAB7' : isWarm ? '#DED2C2' : isMix ? 'rgba(180, 147, 98, 0.32)' : THEME.border2;
  const T_subSurface = isLight
    ? 'rgba(168, 148, 120, 0.18)'
    : isMix
      ? 'rgba(180, 147, 98, 0.10)'
      : 'rgba(255,255,255,0.04)';
  const T_subSurfaceFaint = isLight
    ? 'rgba(168, 148, 120, 0.10)'
    : isMix
      ? 'rgba(180, 147, 98, 0.06)'
      : 'rgba(255,255,255,0.03)';
  const T_subSurfaceFainter = isLight
    ? 'rgba(168, 148, 120, 0.06)'
    : isMix
      ? 'rgba(180, 147, 98, 0.04)'
      : 'rgba(255,255,255,0.02)';
  // SPLIT/WALLS/ROTATE/EXPAND fills
  const T_splitFill = isLight ? '#5B4B98' : isMix ? '#3A2F58' : THEME.violet;
  const T_wallsFill = isLight ? '#1F6B7E' : isMix ? '#1F4855' : THEME.teal;
  const T_rotateFill = isLight ? '#8C5A1E' : isMix ? '#6E4520' : THEME.amber;
  const T_expandFill = isLight ? '#3D7853' : isMix ? '#324F3D' : THEME.success;
  // Generate plan / refine accents
  const T_generatePlanBg = isLight ? '#497775' : isWarm ? '#3F6968' : isMix ? '#3A6770' : `${THEME.teal}15`;
  const T_generatePlanBorder = isLight ? '#497775' : isWarm ? '#3F6968' : isMix ? '#5E9CA8' : THEME.teal;
  const T_generatePlanText = isLight ? '#FFF7EF' : isWarm ? '#FFF7EF' : isMix ? '#FFFCF1' : THEME.teal;
  const T_refineMapBg = isLight ? '#8A3B38' : isWarm ? '#7A312E' : isMix ? '#5A4878' : 'rgba(139,92,246,0.08)';
  const T_refineMapBorder = isLight ? '#8A3B38' : isWarm ? '#7A312E' : isMix ? '#8B7AB8' : 'rgba(139,92,246,0.4)';
  const T_refineMapText = isLight ? '#FFF7EF' : isWarm ? '#FFF7EF' : isMix ? '#FFFCF1' : THEME.violet;
  // Right plot canvas bg (slightly cooler than panel)
  const T_canvasBg = isLight ? '#E5DAC2' : isMix ? '#15110C' : '#08131F';

  const compassDwellScale = useMemo(() => {
    const base = DEFAULT_DWELL_TIMES.compassMapAction || 1;
    const target = dwellSettings.compassMapAction || base;
    return Math.max(0.4, target / base);
  }, [dwellSettings.compassMapAction]);

  const GazeButton = useCallback((props: React.ComponentProps<typeof BaseGazeButton>) => {
    const rawDwell = typeof props.dwellTime === 'number'
      ? props.dwellTime
      : DEFAULT_DWELL_TIMES.compassMapAction;
    const scaledDwell = Math.max(500, Math.round(rawDwell * compassDwellScale));
    return <BaseGazeButton {...props} dwellTime={scaledDwell} />;
  }, [compassDwellScale]);

  // Phase starts at room_selection (Phase 1)
  const [phase, setPhase] = useState<AdvancedPhase>('room_selection');
  const [compassMap, setCompassMap] = useState<any>(null);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Arm-before-fire safety state
  const [isGridArmed, setIsGridArmed] = useState(false);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [activeFloor, setActiveFloor] = useState<'gnd' | '1f'>('gnd');
  const [navHidden, setNavHidden] = useState(false);
  const [showFloorPlanViewer, setShowFloorPlanViewer] = useState(false);
  const [compiledPayload, setCompiledPayload] = useState<CompassMapPayload | null>(null);
  const placementCooldownRef = useRef(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [refinements, setRefinements] = useState<AdvancedRefinements>({
    version: 2,
    subCellSplits: [],
    customEdges: [],
    voidMarkers: [],
    cellRotations: [],
    cellExpansions: [],
    caregiverAnnotations: [],
    vastuFlags: [],
    accessibilityMarkers: [],
  });

  // Cell layouts for combo stair rooms (which side is stairs)
  const [cellLayouts, setCellLayouts] = useState<Record<string, string>>({});

  // Local grid for room_selection phase — tracks cell→room assignments
  const [localGrid, setLocalGrid] = useState<Record<string, { roomId: string; roomLabel: string }>>({});

  const dataLoaded = useRef(false);

  // ─── Helper: build compass_map from session draft ───
  const buildMapFromDraft = (): any | null => {
    try {
      const raw = sessionStorage.getItem(COMPASS_DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const draftState = parsed?.state || parsed;
      if (!draftState?.grid || !Array.isArray(draftState.placements)) return null;
      const placements = draftState.placements.map((p: any) => ({
        roomId: p.roomId, room: p.roomId,
        roomLabel: p.roomLabel || p.roomId,
        cells: p.occupiedCells || [], occupiedCells: p.occupiedCells || [],
      }));
      return {
        grid_size: { rows: 4, cols: 4 },
        plot: {
          width_ft: draftState.foundation?.plotWidth || 40,
          depth_ft: draftState.foundation?.plotDepth || 60,
          facing: draftState.foundation?.facing || 'South',
          type: draftState.foundation?.plotType || 'Middle Plot',
        },
        ground_floor: { placements },
      };
    } catch { return null; }
  };

  const loadMap = (map: any) => {
    dataLoaded.current = true;
    setCompassMap(map);
    if (map.advanced_refinements) setRefinements(map.advanced_refinements);
    if (map.cell_layouts) setCellLayouts(map.cell_layouts);

    // Populate localGrid from placements
    const grid: Record<string, { roomId: string; roomLabel: string }> = {};
    (map.ground_floor?.placements || []).forEach((pl: any) => {
      (pl.occupiedCells || pl.cells || []).forEach((c: string) => {
        grid[c] = { roomId: pl.roomId || pl.room, roomLabel: pl.roomLabel || pl.room };
      });
    });
    setLocalGrid(grid);

    const facing = map.plot?.facing || 'North';
    const placements = map.ground_floor?.placements || [];

    // AUTO VASTU CHECK
    const kitchenPl = placements.find((p: any) => p.roomId === 'kitchen');
    if (kitchenPl) {
      const badCells = facing === 'North' ? ['r1_c3', 'r1_c4'] : ['r4_c1', 'r4_c2'];
      const cells = kitchenPl.occupiedCells || kitchenPl.cells || [];
      if (cells.some((c: string) => badCells.includes(c))) {
        setRefinements(prev => ({
          ...prev,
          vastuFlags: [...prev.vastuFlags, {
            cell: cells[0], roomId: 'kitchen',
            issue: 'Kitchen in unfavorable Vastu zone',
            suggestion: 'Consider South-East quadrant',
          }],
        }));
      }
    }

    // AUTO ACCESSIBILITY CHECK
    const newMarkers: AccessibilityMarker[] = [];
    placements.forEach((p: any) => {
      if (['icu', 'bathroom', 'masterBed'].includes(p.roomId)) {
        (p.occupiedCells || p.cells || []).forEach((cell: string) => {
          newMarkers.push({ cell, type: 'wheelchair_turning_circle' });
        });
      }
    });
    if (newMarkers.length > 0) {
      setRefinements(prev => ({ ...prev, accessibilityMarkers: newMarkers }));
    }
  };

  useEffect(() => {
    if (dataLoaded.current) return;
    const map = (ws.surveyData as any)?.compass_map;
    if (map) loadMap(map);
  }, [ws.surveyData]);

  useEffect(() => {
    if (dataLoaded.current) return;
    const map = buildMapFromDraft();
    if (map) loadMap(map);
  }, []);

  // ─── Inactivity auto-disarm (45s) ───
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      setIsGridArmed(prev => {
        if (prev) onSpeak('Grid disarmed due to inactivity.');
        return false;
      });
    }, 45000);
  }, [onSpeak]);

  useEffect(() => {
    if (isGridArmed) {
      resetInactivityTimer();
    } else if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [isGridArmed, resetInactivityTimer]);

  // ─── Derived values ───
  const pw = compassMap?.plot?.width_ft || 40;
  const pd = compassMap?.plot?.depth_ft || 60;
  const cellWFt = Math.round(pw / GRID_COLS);
  const cellDFt = Math.round(pd / GRID_ROWS);
  const facing = compassMap?.plot?.facing || 'South';
  const directions = getDirectionLabels(facing);

  const isRoomPhase = phase === 'room_selection';

  // For refinement phases, use the localGrid (same data source)
  const gridState = localGrid;

  // Compute merged rooms for adjacent-cell merging
  const mergedRooms = useMemo(() => computeMergedRooms(localGrid), [localGrid]);

  // Compute placed rooms for sidebar display
  const placedRooms = useMemo(() => {
    const roomCells: Record<string, string[]> = {};
    Object.entries(localGrid).forEach(([cell, info]) => {
      if (!roomCells[info.roomId]) roomCells[info.roomId] = [];
      roomCells[info.roomId].push(cell);
    });
    return roomCells;
  }, [localGrid]);

  // ─── HANDLERS ───

  // Room selection with auto-disarm
  const selectRoom = useCallback((roomId: string) => {
    setSelectedRoomId(roomId);
    setIsGridArmed(false);
    setRoomPickerOpen(false);
    const lib = ROOM_LIBRARY[roomId];
    onSpeak(`${lib?.shortLabel || roomId} selected. Press READY to place.`);
  }, [onSpeak]);

  // Next unplaced room (smart skip)
  const nextRoom = useCallback(() => {
    const keys = Object.keys(ROOM_LIBRARY);
    const currentIdx = selectedRoomId ? keys.indexOf(selectedRoomId) : -1;
    for (let i = 1; i <= keys.length; i++) {
      const candidate = keys[(currentIdx + i) % keys.length];
      if (!placedRooms[candidate] || placedRooms[candidate].length === 0) {
        selectRoom(candidate);
        return;
      }
    }
    // All placed — cycle to next anyway
    if (keys.length > 0) selectRoom(keys[(currentIdx + 1) % keys.length]);
  }, [selectedRoomId, placedRooms, selectRoom]);

  // READY toggle
  const toggleArmed = useCallback(() => {
    if (!selectedRoomId) {
      onSpeak('Select a room first.');
      return;
    }
    setIsGridArmed(prev => {
      const next = !prev;
      const lib = ROOM_LIBRARY[selectedRoomId];
      if (next) {
        onSpeak(`Grid armed. Place ${lib?.shortLabel || selectedRoomId}.`);
      } else {
        onSpeak('Grid disarmed.');
      }
      return next;
    });
  }, [selectedRoomId, onSpeak]);

  const handleCellClick = useCallback((cellKey: string) => {
    if (isRoomPhase) {
      // Arm-before-fire safety checks
      if (!selectedRoomId) { onSpeak('Select a room first.'); return; }
      if (!isGridArmed) { onSpeak('Press READY first.'); return; }
      if (placementCooldownRef.current) return;

      // Place or remove
      setLocalGrid(prev => {
        const existing = prev[cellKey];
        if (existing?.roomId === selectedRoomId) {
          const next = { ...prev };
          delete next[cellKey];
          return next;
        }
        const lib = ROOM_LIBRARY[selectedRoomId];
        return {
          ...prev,
          [cellKey]: { roomId: selectedRoomId, roomLabel: lib?.roomLabel || selectedRoomId },
        };
      });

      // Post-placement: auto-disarm + cooldown
      setIsGridArmed(false);
      placementCooldownRef.current = true;
      setTimeout(() => { placementCooldownRef.current = false; }, 400);
      onSpeak(`Placed ${ROOM_LIBRARY[selectedRoomId]?.shortLabel || selectedRoomId}.`);
    } else {
      // Refinement phase: select/deselect cell
      setSelectedCell(prev => prev === cellKey ? null : cellKey);
    }
  }, [isRoomPhase, selectedRoomId, isGridArmed, onSpeak]);

  const handleSplit = (direction: SplitDirection) => {
    if (!selectedCell) return;
    setRefinements(prev => ({
      ...prev,
      subCellSplits: [
        ...prev.subCellSplits.filter(s => s.parentCell !== selectedCell),
        { parentCell: selectedCell, splitDirection: direction, roomA: 'main', roomB: 'bathroom' },
      ],
    }));
    onSpeak(`Cell split ${direction}ly`);
    setSelectedCell(null);
  };

  const handleSave = useCallback(() => {
    // Rebuild placements from localGrid
    const roomCells: Record<string, { roomId: string; roomLabel: string; cells: string[] }> = {};
    Object.entries(localGrid).forEach(([cell, info]) => {
      if (!roomCells[info.roomId]) {
        roomCells[info.roomId] = { roomId: info.roomId, roomLabel: info.roomLabel, cells: [] };
      }
      roomCells[info.roomId].cells.push(cell);
    });
    const placements = Object.values(roomCells).map(r => ({
      roomId: r.roomId, room: r.roomId, roomLabel: r.roomLabel,
      cells: r.cells, occupiedCells: r.cells,
    }));

    // Update compassMap and save
    const updatedMap = {
      ...(compassMap || {}),
      ground_floor: { ...(compassMap?.ground_floor || {}), placements },
      advanced_refinements: refinements,
      cell_layouts: cellLayouts,
    };
    setCompassMap(updatedMap);

    const existing = (ws.surveyData || {}) as any;
    ws.saveSurvey({ ...existing, compass_map: updatedMap });

    // Also persist back to sessionStorage draft for CompassMapScreen consistency
    try {
      const raw = sessionStorage.getItem(COMPASS_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const draftState = parsed?.state || parsed;
        if (draftState) {
          // Update grid and placements in draft
          const newGrid: Record<string, string> = {};
          Object.entries(localGrid).forEach(([cell, info]) => {
            newGrid[cell] = info.roomId;
          });
          draftState.grid = newGrid;
          draftState.placements = placements;
          sessionStorage.setItem(COMPASS_DRAFT_KEY, JSON.stringify(parsed));
        }
      }
    } catch { /* silent */ }

    onSpeak('Saved.');
  }, [localGrid, refinements, compassMap, ws, onSpeak, cellLayouts]);

  const handleGenerate = useCallback(() => {
    handleSave();

    // Build proper CompassMapPayload from localGrid
    const roomCells: Record<string, { roomId: string; roomLabel: string; cells: string[] }> = {};
    Object.entries(localGrid).forEach(([cell, info]) => {
      if (!roomCells[info.roomId]) {
        roomCells[info.roomId] = { roomId: info.roomId, roomLabel: info.roomLabel, cells: [] };
      }
      roomCells[info.roomId].cells.push(cell);
    });

    const placements = Object.values(roomCells).map(r => {
      const typedCells = r.cells as any[];
      const coords = cellsToBoundingRect(typedCells, pw, pd);
      const cellRects = Object.fromEntries(typedCells.map(c => [c, cellToRect(c, pw, pd)]));
      const area = Math.round((coords.x2 - coords.x1) * (coords.y2 - coords.y1));
      return {
        room: r.roomLabel || r.roomId,
        roomId: r.roomId,
        cells: r.cells,
        coords,
        cellRects,
        area_sqft: area,
      };
    });

    const totalCells = Object.keys(localGrid).length;
    const coverage = Math.round((totalCells / (GRID_ROWS * GRID_COLS)) * 100);

    const payload: CompassMapPayload = {
      grid_size: { rows: GRID_ROWS, cols: GRID_COLS },
      plot: {
        width_ft: pw,
        depth_ft: pd,
        facing: facing,
        type: compassMap?.plot?.type || 'Middle Plot',
      },
      cell_size_ft: { width: cellWFt, depth: cellDFt },
      ground_floor: {
        placements: placements as any,
        coverage_percent: coverage,
      },
    };

    // Attach advanced refinements
    const enriched = { ...payload, advanced_refinements: refinements } as any;
    setCompiledPayload(enriched);
    setShowFloorPlanViewer(true);
    onSpeak('Generating architectural floor plan...');
  }, [handleSave, localGrid, pw, pd, facing, compassMap, cellWFt, cellDFt, refinements, onSpeak]);

  const switchToRefinement = () => {
    setPhase('overview');
    setSelectedRoomId(null);
    setSelectedCell(null);
    setIsGridArmed(false);
    setRoomPickerOpen(false);
  };

  const switchToRooms = () => {
    setPhase('room_selection');
    setSelectedCell(null);
    setIsGridArmed(false);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  SIDEBAR HEADER — thin label only (nav moved to floating panel)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const renderSidebarHeader = () => (
    <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${T_panelBorderSoft}`, flexShrink: 0 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: T_textDim, letterSpacing: 2 }}>
        GAZECONNECT · ADVANCED MAP
      </span>
    </div>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  FLOATING NAV — top-right corner of screen
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const renderFloatingNav = () => {
    // Theme-aware nav panel surfaces
    const navRestoreBg = isLight ? 'rgba(240, 226, 196, 0.92)' : isMix ? 'rgba(36, 31, 24, 0.92)' : 'rgba(15,23,42,0.85)';
    const navRestoreBorder = isLight ? '#1F6B7E' : isMix ? 'rgba(180, 147, 98, 0.5)' : 'rgba(45,212,191,0.4)';
    const navRestoreColor = isLight ? '#1F6B7E' : isMix ? '#5E9CA8' : THEME.teal;
    const navPanelBg = isLight ? 'rgba(240, 226, 196, 0.95)' : isMix ? 'rgba(36, 31, 24, 0.94)' : 'rgba(13,27,46,0.92)';
    const navPanelBorder = isLight ? '#3F6864' : isMix ? 'rgba(180, 147, 98, 0.42)' : THEME.border2;
    const navBtnBg = isLight ? 'rgba(168, 148, 120, 0.18)' : isMix ? 'rgba(180, 147, 98, 0.10)' : 'rgba(255,255,255,0.05)';
    const navBtnBorder = isLight ? 'rgba(168, 148, 120, 0.50)' : isMix ? 'rgba(180, 147, 98, 0.32)' : THEME.border2;
    const navBackText = isLight ? '#76624A' : isMix ? '#C4B697' : THEME.sub;
    const navHomeBg = isLight ? 'rgba(31, 107, 126, 0.12)' : isMix ? 'rgba(94, 156, 168, 0.14)' : 'rgba(45,212,191,0.08)';
    const navHomeBorder = isLight ? 'rgba(31, 107, 126, 0.5)' : isMix ? 'rgba(94, 156, 168, 0.4)' : 'rgba(45,212,191,0.3)';
    const navHomeText = isLight ? '#1F6B7E' : isMix ? '#5E9CA8' : THEME.teal;
    const navGazeBorderInactive = isLight ? 'rgba(168, 148, 120, 0.6)' : isMix ? 'rgba(180, 147, 98, 0.4)' : 'rgba(255,255,255,0.2)';
    const navGazeColorInactive = isLight ? '#9A8568' : isMix ? '#8E7E62' : '#4A6080';
    const hideNavBg = isLight ? 'rgba(168, 148, 120, 0.18)' : isMix ? 'rgba(180, 147, 98, 0.10)' : 'rgba(15,23,42,0.7)';
    const hideNavBorder = isLight ? 'rgba(168, 148, 120, 0.4)' : isMix ? 'rgba(180, 147, 98, 0.28)' : 'rgba(100,116,139,0.2)';
    const hideNavText = isLight ? '#76624A' : isMix ? '#8E7E62' : '#64748B';

    // NAV restore button — shown when nav is hidden
    if (navHidden) {
      return (
        <GazeButton id="nav-restore" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
          alwaysActive dwellTime={1200}
          onClick={() => { setNavHidden(false); onSpeak('Navigation restored.'); }}
          style={{
            position: 'fixed', top: 24, right: 118, zIndex: 100,
            width: 100, height: 100, borderRadius: '50%',
            background: navRestoreBg,
            border: `2px solid ${navRestoreBorder}`,
            color: navRestoreColor, fontSize: 14, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
          NAV
        </GazeButton>
      );
    }

    // Full nav panel — floating top-right
    return (
      <div style={{
        position: 'fixed', top: 24, right: 58, zIndex: 100,
        display: 'flex', flexDirection: 'column', gap: 6,
        background: navPanelBg,
        border: `1px solid ${navPanelBorder}`,
        borderRadius: 14, padding: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
        width: 220,
      }}>
        {/* Row: Back + Home + Gaze */}
        <div style={{ display: 'flex', gap: 5 }}>
          <GazeButton id="adv-back" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={() => { handleSave(); onNavigate('compass-map'); }}
            style={{ height: 52, flex: 1, borderRadius: 8, background: navBtnBg, border: `1px solid ${navBtnBorder}`, color: navBackText, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ← Back
          </GazeButton>
          <GazeButton id="adv-home" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={() => onNavigate('home')}
            style={{ height: 52, flex: 1, borderRadius: 8, background: navHomeBg, border: `1px solid ${navHomeBorder}`, color: navHomeText, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Home
          </GazeButton>
          <GazeButton id="adv-gaze" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            alwaysActive onClick={toggleGaze}
            style={{
              width: 52, height: 52, borderRadius: '50%', flexShrink: 0, padding: 0,
              border: `2px solid ${isGazeEnabled ? navHomeText : navGazeBorderInactive}`,
              background: isGazeEnabled ? navHomeBg : 'transparent',
              color: isGazeEnabled ? navHomeText : navGazeColorInactive, fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 200ms ease'
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" fill={isGazeEnabled ? 'currentColor' : 'none'} />
            </svg>
          </GazeButton>
        </div>

        {/* Emergency — preserved as-is for safety/visibility */}
        <GazeButton id="adv-emergency" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
          alwaysActive onClick={() => onSpeak('I need help immediately!')}
          style={{ height: 58, width: '100%', borderRadius: 8, background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.5)', color: '#F87171', fontSize: 16, fontWeight: 900, letterSpacing: '0.12em', fontFamily: EMERGENCY_FONT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          EMERGENCY
        </GazeButton>

        {/* Hide Nav */}
        <GazeButton id="hide-nav-btn" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
          dwellTime={1400}
          onClick={() => { setNavHidden(true); onSpeak('Navigation hidden. Look at NAV button to restore.'); }}
          style={{
            height: 36, width: '100%', borderRadius: 8,
            background: hideNavBg,
            border: `1px solid ${hideNavBorder}`,
            color: hideNavText, fontSize: 11, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          HIDE NAV
        </GazeButton>
      </div>
    );
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  ROOM SIDEBAR — Phase 1 sidebar content
  //  (current room + picker + READY + actions)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const renderRoomSidebar = () => {
    const roomKeys = Object.keys(ROOM_LIBRARY);
    const activeLib = selectedRoomId ? ROOM_LIBRARY[selectedRoomId] : null;
    const activeCellCount = selectedRoomId ? (placedRooms[selectedRoomId]?.length || 0) : 0;

    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        minHeight: 0, overflow: 'hidden',
      }}>
        {/* ── Room Picker Open ── */}
        {roomPickerOpen ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '10px 14px 4px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: T_textDim, letterSpacing: 2 }}>SELECT A ROOM:</span>
            </div>
            <div style={{
              flex: 1, overflowY: 'auto', minHeight: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10,
              padding: '12px 16px',
              alignItems: 'stretch',
            }}>
              {roomKeys.map(key => {
                const lib = ROOM_LIBRARY[key];
                const isSelected = selectedRoomId === key;
                const cellCount = placedRooms[key]?.length || 0;
                return (
                  <GazeButton key={key} id={`room-${key}`}
                    gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
                    dwellTime={1000}
                    onClick={() => selectRoom(key)}
                    style={{
                      height: 88, minWidth: 130, borderRadius: 10,
                      background: isSelected ? `${lib.color}25` : T_subSurfaceFaint,
                      border: isSelected ? `2px solid ${lib.color}` : `1px solid ${T_panelBorderSoft}`,
                      color: isSelected ? lib.color : T_textSub,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', gap: 4, padding: '8px 6px',
                      position: 'relative',
                    }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: lib.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 800, textAlign: 'center', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {lib.shortLabel}
                    </span>
                    <span style={{ fontSize: 10, color: T_textDim, textAlign: 'center', lineHeight: 1.1 }}>
                      {lib.desc}
                    </span>
                    {cellCount > 0 && (
                      <span style={{ position: 'absolute', top: 4, right: 6, fontSize: 9, fontWeight: 800, color: T_expandFill, background: isLight ? 'rgba(61, 120, 83, 0.18)' : isMix ? 'rgba(50, 79, 61, 0.30)' : 'rgba(16,185,129,0.15)', padding: '1px 6px', borderRadius: 4 }}>
                        {cellCount}
                      </span>
                    )}
                  </GazeButton>
                );
              })}
              {/* CLOSE LIST button */}
              <GazeButton id="room-close-list" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
                onClick={() => setRoomPickerOpen(false)}
                style={{
                  height: 88, minWidth: 130, borderRadius: 10,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#F87171', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                CLOSE LIST
              </GazeButton>
            </div>
          </div>
        ) : (
          /* ── Default State (Picker Collapsed) ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px' }}>
            {/* Current Room Label */}
            <span style={{ fontSize: 9, fontWeight: 800, color: T_textDim, letterSpacing: 2 }}>CURRENT ROOM</span>

            {/* Active room display */}
            <div style={{
              height: 80, borderRadius: 10,
              background: activeLib ? `${activeLib.color}15` : T_subSurfaceFaint,
              border: `1.5px solid ${activeLib ? activeLib.color + '60' : T_panelBorderSoft}`,
              display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
            }}>
              {activeLib ? (
                <>
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: activeLib.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: activeLib.color }}>
                      {activeLib.shortLabel}
                    </span>
                    <span style={{ fontSize: 10, color: T_textSub }}>
                      {activeCellCount > 0 ? `${activeCellCount} cell${activeCellCount > 1 ? 's' : ''} placed` : 'Not placed yet'}
                    </span>
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 12, color: T_textSub, fontStyle: 'italic' }}>No room selected</span>
              )}
            </div>

            {/* CHANGE ROOM + NEXT ROOM buttons */}
            <GazeButton id="room-change" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={() => { setRoomPickerOpen(true); setIsGridArmed(false); }}
              style={{
                height: 80, width: '100%', borderRadius: 10,
                background: T_subSurface, border: `1px solid ${T_panelBorder}`,
                color: T_textMain, fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              CHANGE ROOM
            </GazeButton>

            <GazeButton id="room-next" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={nextRoom}
              style={{
                height: 80, width: '100%', borderRadius: 10,
                background: T_subSurface, border: `1px solid ${T_panelBorder}`,
                color: T_textSub, fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              NEXT ROOM
            </GazeButton>
          </div>
        )}

        {/* ── READY button (always visible) ── */}
        <div style={{ padding: '8px 14px', flexShrink: 0 }}>
          <GazeButton id="room-ready" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={toggleArmed}
            style={{
              height: 90, width: '100%', borderRadius: 12,
              background: isGridArmed
                ? (isLight ? 'rgba(31, 107, 126, 0.16)' : isMix ? 'rgba(94, 156, 168, 0.18)' : 'rgba(45,212,191,0.12)')
                : T_subSurfaceFaint,
              border: `2px solid ${isGridArmed ? T_wallsFill : (isLight ? 'rgba(31, 107, 126, 0.4)' : isMix ? 'rgba(94, 156, 168, 0.32)' : 'rgba(45,212,191,0.2)')}`,
              color: isGridArmed ? T_wallsFill : T_textSub,
              fontSize: 18, fontWeight: 900, letterSpacing: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              transition: 'all 300ms ease',
              boxShadow: isGridArmed ? `0 0 20px rgba(45,212,191,0.3), inset 0 0 15px rgba(45,212,191,0.08)` : 'none',
            }}>
            {isGridArmed ? 'ARMED' : 'READY'}
            <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>
              {isGridArmed ? 'Tap grid to place' : 'Tap to arm grid'}
            </span>
          </GazeButton>
        </div>

        {/* ── Floor selectors ── */}
        <div style={{ display: 'flex', gap: 6, padding: '0 14px', flexShrink: 0 }}>
          <GazeButton id="floor-gnd" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={() => setActiveFloor('gnd')}
            style={{
              height: 60, flex: 1, borderRadius: 8,
              background: activeFloor === 'gnd'
                ? (isLight ? 'rgba(31, 107, 126, 0.14)' : isMix ? 'rgba(94, 156, 168, 0.16)' : 'rgba(45,212,191,0.1)')
                : T_subSurfaceFaint,
              border: `1.5px solid ${activeFloor === 'gnd' ? T_wallsFill : T_panelBorderSoft}`,
              color: activeFloor === 'gnd' ? T_wallsFill : T_textSub,
              fontSize: 13, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
            GND {activeFloor === 'gnd' && '✓'}
          </GazeButton>
          <GazeButton id="floor-1f" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={() => setActiveFloor('1f')}
            style={{
              height: 60, flex: 1, borderRadius: 8,
              background: activeFloor === '1f'
                ? (isLight ? 'rgba(91, 75, 152, 0.14)' : isMix ? 'rgba(90, 72, 120, 0.18)' : 'rgba(139,92,246,0.1)')
                : T_subSurfaceFaint,
              border: `1.5px solid ${activeFloor === '1f' ? T_splitFill : T_panelBorderSoft}`,
              color: activeFloor === '1f' ? T_splitFill : T_textSub,
              fontSize: 13, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
            1F {activeFloor === '1f' && '✓'}
          </GazeButton>
        </div>

        {/* spacer to push action buttons down */}
        <div style={{ flex: 1, minHeight: 4 }} />

        {/* ── Bottom action buttons ── */}
        <div style={{ padding: '8px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, borderTop: `1px solid ${T_panelBorderSoft}` }}>
          <GazeButton id="adv-save" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={handleSave}
            style={{
              height: 60, width: '100%', borderRadius: 8,
              background: T_subSurface, border: `1px solid ${T_panelBorder}`,
              color: T_textMain, fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            SAVE
          </GazeButton>
          <GazeButton id="adv-refine" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={switchToRefinement}
            style={{
              height: 60, width: '100%', borderRadius: 8,
              background: T_refineMapBg, border: `1.5px solid ${T_refineMapBorder}`,
              color: T_refineMapText, fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            REFINE
          </GazeButton>
          <GazeButton id="adv-generate" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={handleGenerate}
            style={{
              height: 80, width: '100%', borderRadius: 10,
              background: T_generatePlanBg, border: `2px solid ${T_generatePlanBorder}`,
              color: T_generatePlanText, fontSize: 16, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            GENERATE PLAN
          </GazeButton>
        </div>
      </div>
    );
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  REFINEMENT PANEL — Phase 2 sidebar content
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const renderRefinementPanel = () => (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 14px', minHeight: 0,
    }}>
      <span style={{ fontSize: 8, fontWeight: 800, color: T_textDim, letterSpacing: 2, textTransform: 'uppercase', flexShrink: 0 }}>
        Refinement Phase
      </span>
      {([
        { key: 'overview' as AdvancedPhase, icon: '📐', label: 'Overview' },
        { key: 'split' as AdvancedPhase, icon: '✂', label: 'Split Cells' },
        { key: 'walls' as AdvancedPhase, icon: '⬛', label: 'Wall Logic' },
        { key: 'void' as AdvancedPhase, icon: '⬡', label: 'Mark Voids' },
        { key: 'rotate' as AdvancedPhase, icon: '↻', label: 'Rotate / Stairs' },
      ]).map(p => {
        const isActive = phase === p.key;
        const darkPc = PHASE_COLORS[p.key] || THEME.sub;
        // Theme-aware action color (saturated for light, muted warm for mix)
        const pc = isLight || isMix
          ? (p.key === 'split' ? T_splitFill
            : p.key === 'walls' ? T_wallsFill
            : p.key === 'void' ? T_wallsFill
            : p.key === 'rotate' ? T_rotateFill
            : T_textSub)
          : darkPc;
        return (
          <GazeButton key={p.key} id={`phase-${p.key}`} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={() => { setPhase(p.key); setSelectedCell(null); }}
            style={{
              flex: 1, minHeight: 52, borderRadius: 10,
              background: isActive
                ? (isLight ? `${pc}22` : isMix ? `${pc}33` : `${darkPc}26`)
                : T_subSurfaceFaint,
              border: isActive ? `2px solid ${pc}` : `1px solid ${T_panelBorderSoft}`,
              color: isActive ? pc : T_textSub,
              fontSize: 'clamp(13px, 1.8vh, 17px)', fontWeight: isActive ? 800 : 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            <span style={{ fontSize: 16 }}>{p.icon}</span> {p.label}
          </GazeButton>
        );
      })}

      {/* SPLIT TOOLS */}
      {phase === 'split' && selectedCell && (
        <div style={{ flexShrink: 0, background: isLight ? `${T_splitFill}14` : isMix ? `${T_splitFill}22` : 'rgba(139,92,246,0.07)', border: `1px solid ${T_splitFill}33`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: T_splitFill }}>
            {gridState[selectedCell]?.roomLabel?.toUpperCase() || selectedCell}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <GazeButton id="tool-vsplit" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={() => handleSplit('vertical')}
              style={{ flex: 1, height: 36, borderRadius: 8, background: isLight ? T_splitFill : isMix ? `${T_splitFill}55` : 'rgba(139,92,246,0.15)', border: `1.5px solid ${T_splitFill}`, color: isLight ? T_textInverse : isMix ? T_textInverse : '#C4B5FD', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              V-Split
            </GazeButton>
            <GazeButton id="tool-hsplit" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={() => handleSplit('horizontal')}
              style={{ flex: 1, height: 36, borderRadius: 8, background: isLight ? T_splitFill : isMix ? `${T_splitFill}55` : 'rgba(139,92,246,0.15)', border: `1.5px solid ${T_splitFill}`, color: isLight ? T_textInverse : isMix ? T_textInverse : '#C4B5FD', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              H-Split
            </GazeButton>
          </div>
          <GazeButton id="tool-desel" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={() => setSelectedCell(null)}
            style={{ height: 30, borderRadius: 8, background: T_subSurface, border: `1px solid ${T_panelBorderSoft}`, color: T_textSub, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Cancel
          </GazeButton>
        </div>
      )}

      {/* WALL TOOLS */}
      {phase === 'walls' && selectedCell && (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: T_wallsFill }}>
            {gridState[selectedCell]?.roomLabel?.toUpperCase() || selectedCell}
          </div>
          {([
            { label: 'Full Wall', type: 'full_wall', color: T_textMain },
            { label: 'Glass Panel', type: 'half_wall_glass', color: T_wallsFill },
            { label: 'Open Archway', type: 'open_archway', color: T_expandFill },
            { label: 'Remove Wall', type: 'no_wall', color: THEME.red },
          ]).map(w => (
            <GazeButton key={w.type} id={`wall-${w.type}`} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={() => {
                if (!selectedCell) return;
                setRefinements(prev => ({
                  ...prev,
                  customEdges: [
                    ...prev.customEdges.filter(e => e.cells[0] !== selectedCell),
                    { id: `edge-${selectedCell}-${w.type}`, boundary: [selectedCell, selectedCell], cells: [selectedCell, selectedCell], type: w.type as any },
                  ],
                }));
                onSpeak(`${w.label} applied.`);
                setSelectedCell(null);
              }}
              style={{
                height: 36, borderRadius: 8,
                background: isLight ? w.color : isMix ? `${w.color}33` : `${w.color}15`,
                border: `1px solid ${w.color}${isLight ? '' : '40'}`,
                color: isLight ? T_textInverse : w.color,
                fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {w.label}
            </GazeButton>
          ))}
          <GazeButton id="wall-desel" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={() => setSelectedCell(null)}
            style={{ height: 28, borderRadius: 8, background: T_subSurface, border: `1px solid ${T_panelBorderSoft}`, color: T_textSub, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Cancel
          </GazeButton>
        </div>
      )}

      {/* VOID TOOL */}
      {phase === 'void' && selectedCell && (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: T_wallsFill }}>
            {gridState[selectedCell]?.roomLabel?.toUpperCase() || selectedCell}
          </div>
          <GazeButton id="tool-void" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={() => {
              if (!selectedCell) return;
              setRefinements(prev => ({
                ...prev,
                voidMarkers: [
                  ...prev.voidMarkers.filter(v => v.cell !== selectedCell),
                  { cell: selectedCell, type: 'open_to_below' },
                ],
              }));
              onSpeak('Marked as open to below.');
              setSelectedCell(null);
            }}
            style={{ height: 40, borderRadius: 8, background: isLight ? T_wallsFill : isMix ? `${T_wallsFill}55` : 'rgba(59,130,246,0.15)', border: `1.5px solid ${T_wallsFill}`, color: isLight ? T_textInverse : isMix ? T_textInverse : '#93C5FD', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Mark as Open to Below
          </GazeButton>
          <GazeButton id="void-desel" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
            onClick={() => setSelectedCell(null)}
            style={{ height: 28, borderRadius: 8, background: T_subSurface, border: `1px solid ${T_panelBorderSoft}`, color: T_textSub, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Cancel
          </GazeButton>
        </div>
      )}

      {/* ROTATE / STAIRCASE TOOL */}
      {phase === 'rotate' && selectedCell && (() => {
        const cellInfo = gridState[selectedCell];
        const isStair = cellInfo?.roomId === 'staircase' || cellInfo?.roomLabel?.toLowerCase().includes('stair');
        const isCombo = cellInfo?.roomId === 'diningStaircase' || (cellInfo?.roomLabel?.toLowerCase().includes('stair') && cellInfo?.roomLabel?.toLowerCase().includes('+'));
        const currentRotation = refinements.cellRotations.find(cr => cr.cell === selectedCell)?.degrees || 0;

        if (isCombo) {
          // Combo stair+room: show layout picker (which side is stairs)
          return (
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#A1887F' }}>
                {cellInfo?.roomLabel?.toUpperCase() || selectedCell} — LAYOUT
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {COMBO_LAYOUTS.map(opt => (
                  <GazeButton key={opt.id} id={`combo-${opt.id}`}
                    gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
                    onClick={() => {
                      setCellLayouts(prev => ({ ...prev, [selectedCell!]: opt.stairSide }));
                      onSpeak(`${opt.label} layout set.`);
                      setSelectedCell(null);
                    }}
                    style={{
                      height: 100, borderRadius: 12,
                      background: cellLayouts[selectedCell!] === opt.stairSide ? 'rgba(161,136,127,0.25)' : 'rgba(161,136,127,0.08)',
                      border: `1.5px solid ${cellLayouts[selectedCell!] === opt.stairSide ? '#A1887F' : 'rgba(161,136,127,0.25)'}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', gap: 4, color: '#D7CCC8',
                    }}>
                    <div style={{
                      width: 40, height: 40, display: 'flex',
                      flexDirection: opt.stairSide === 'top' || opt.stairSide === 'bottom' ? 'column' : 'row',
                    }}>
                      {(opt.stairSide === 'left' || opt.stairSide === 'top') && (
                        <div style={{ flex: 1, background: 'rgba(161,136,127,0.3)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <StairDrawing rotation={currentRotation} width="80%" height="80%" />
                        </div>
                      )}
                      <div style={{ flex: 1, background: 'rgba(255,202,40,0.15)', borderRadius: 2 }} />
                      {(opt.stairSide === 'right' || opt.stairSide === 'bottom') && (
                        <div style={{ flex: 1, background: 'rgba(161,136,127,0.3)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <StairDrawing rotation={currentRotation} width="80%" height="80%" />
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700 }}>{opt.label}</span>
                  </GazeButton>
                ))}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#A1887F', marginTop: 4 }}>STAIR DIRECTION:</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {STAIR_ORIENTATIONS.map(opt => (
                  <GazeButton key={opt.rotation} id={`stair-combo-${opt.rotation}`}
                    gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
                    onClick={() => {
                      setRefinements(prev => ({
                        ...prev,
                        cellRotations: [
                          ...prev.cellRotations.filter(cr => cr.cell !== selectedCell),
                          { cell: selectedCell!, degrees: opt.rotation as 0 | 90 | 180 | 270 },
                        ],
                      }));
                      onSpeak(`${opt.label} set.`);
                    }}
                    style={{
                      height: 70, borderRadius: 10,
                      background: currentRotation === opt.rotation ? 'rgba(161,136,127,0.25)' : 'rgba(161,136,127,0.08)',
                      border: `1.5px solid ${currentRotation === opt.rotation ? '#A1887F' : 'rgba(161,136,127,0.2)'}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', gap: 4, color: '#D7CCC8',
                    }}>
                    <div style={{ width: 32, height: 32 }}>
                      <StairDrawing rotation={opt.rotation} />
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700 }}>{opt.label}</span>
                  </GazeButton>
                ))}
              </div>
              <GazeButton id="stair-combo-cancel" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
                onClick={() => setSelectedCell(null)}
                style={{ height: 28, borderRadius: 8, background: T_subSurface, border: `1px solid ${T_panelBorderSoft}`, color: T_textSub, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Cancel
              </GazeButton>
            </div>
          );
        }

        if (isStair) {
          // Pure staircase: show 4 orientation buttons in 2×2 grid
          return (
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#A1887F' }}>
                {cellInfo?.roomLabel?.toUpperCase() || selectedCell} — ORIENTATION
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {STAIR_ORIENTATIONS.map(opt => (
                  <GazeButton key={opt.rotation} id={`stair-${opt.rotation}`}
                    gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
                    onClick={() => {
                      setRefinements(prev => ({
                        ...prev,
                        cellRotations: [
                          ...prev.cellRotations.filter(cr => cr.cell !== selectedCell),
                          { cell: selectedCell!, degrees: opt.rotation as 0 | 90 | 180 | 270 },
                        ],
                      }));
                      onSpeak(`${opt.label} set.`);
                      setSelectedCell(null);
                    }}
                    style={{
                      height: 140, borderRadius: 16,
                      background: currentRotation === opt.rotation ? 'rgba(161,136,127,0.3)' : 'rgba(161,136,127,0.1)',
                      border: `2px solid ${currentRotation === opt.rotation ? '#A1887F' : 'rgba(161,136,127,0.3)'}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', gap: 8, color: '#D7CCC8',
                      position: 'relative', overflow: 'hidden',
                    }}>
                    <div style={{ width: 64, height: 64 }}>
                      <StairDrawing rotation={opt.rotation} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800 }}>{opt.label}</span>
                    <span style={{ fontSize: 10, color: 'rgba(215,204,200,0.5)' }}>{opt.desc}</span>
                  </GazeButton>
                ))}
              </div>
              <GazeButton id="stair-cancel" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
                onClick={() => setSelectedCell(null)}
                style={{ height: 28, borderRadius: 8, background: T_subSurface, border: `1px solid ${T_panelBorderSoft}`, color: T_textSub, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Cancel
              </GazeButton>
            </div>
          );
        }

        // Non-stair cell in rotate phase: generic rotation
        return (
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: T_textSub }}>
              {cellInfo?.roomLabel?.toUpperCase() || selectedCell} — ROTATE
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <GazeButton id="rotate-ccw" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
                onClick={() => {
                  const cur = refinements.cellRotations.find(cr => cr.cell === selectedCell)?.degrees || 0;
                  const next = ((cur - 90 + 360) % 360) as 0 | 90 | 180 | 270;
                  setRefinements(prev => ({
                    ...prev,
                    cellRotations: [
                      ...prev.cellRotations.filter(cr => cr.cell !== selectedCell),
                      { cell: selectedCell!, degrees: next },
                    ],
                  }));
                  onSpeak(`Rotated to ${next}°.`);
                }}
                style={{ flex: 1, height: 48, borderRadius: 8, background: T_subSurface, border: `1px solid ${T_panelBorder}`, color: T_textMain, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ↺
              </GazeButton>
              <GazeButton id="rotate-cw" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
                onClick={() => {
                  const cur = refinements.cellRotations.find(cr => cr.cell === selectedCell)?.degrees || 0;
                  const next = ((cur + 90) % 360) as 0 | 90 | 180 | 270;
                  setRefinements(prev => ({
                    ...prev,
                    cellRotations: [
                      ...prev.cellRotations.filter(cr => cr.cell !== selectedCell),
                      { cell: selectedCell!, degrees: next },
                    ],
                  }));
                  onSpeak(`Rotated to ${next}°.`);
                }}
                style={{ flex: 1, height: 48, borderRadius: 8, background: T_subSurface, border: `1px solid ${T_panelBorder}`, color: T_textMain, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ↻
              </GazeButton>
            </div>
            <GazeButton id="rotate-cancel" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={() => setSelectedCell(null)}
              style={{ height: 28, borderRadius: 8, background: T_subSurface, border: `1px solid ${T_panelBorderSoft}`, color: T_textSub, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Cancel
            </GazeButton>
          </div>
        );
      })()}

      {/* OVERVIEW COUNTS */}
      {phase === 'overview' && (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([
            { label: 'Splits', count: refinements.subCellSplits.length, color: T_splitFill },
            { label: 'Walls', count: refinements.customEdges.length, color: T_wallsFill },
            { label: 'Voids', count: refinements.voidMarkers.length, color: T_wallsFill },
            { label: 'Notes', count: refinements.caregiverAnnotations.length, color: T_rotateFill },
          ]).map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: T_subSurfaceFainter }}>
              <span style={{ fontSize: 11, color: T_textSub, fontWeight: 600 }}>{item.label}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: isLight ? T_textInverse : item.color, background: isLight ? item.color : `${item.color}20`, padding: '2px 8px', borderRadius: 4 }}>{item.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* HINT */}
      {phase !== 'overview' && !selectedCell && (
        <div style={{ fontSize: 10, color: T_textSub, textAlign: 'center', padding: 16, flexShrink: 0 }}>
          Tap a cell in the grid
        </div>
      )}

      {/* AUTO FLAGS */}
      {(refinements.vastuFlags.length > 0 || refinements.accessibilityMarkers.length > 0) && (
        <div style={{ flexShrink: 0, borderTop: `1px solid ${T_panelBorderSoft}`, paddingTop: 8, marginTop: 'auto' }}>
          <span style={{ fontSize: 8, fontWeight: 800, color: T_textDim, letterSpacing: 2, textTransform: 'uppercase' }}>
            Auto Flags
          </span>
          {refinements.vastuFlags.map((flag, i) => (
            <div key={`v-${i}`} style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 6, marginTop: 4, background: isLight ? `${T_rotateFill}18` : isMix ? `${T_rotateFill}26` : 'rgba(245,158,11,0.1)', border: `1px solid ${T_rotateFill}40`, color: T_rotateFill, fontSize: 10, fontWeight: 600 }}>
              {flag.issue}
            </div>
          ))}
          {refinements.accessibilityMarkers.map((marker, i) => (
            <div key={`a-${i}`} style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 6, marginTop: 4, background: isLight ? `${T_wallsFill}18` : isMix ? `${T_wallsFill}26` : 'rgba(45,212,191,0.1)', border: `1px solid ${T_wallsFill}40`, color: T_wallsFill, fontSize: 10, fontWeight: 600 }}>
              {marker.cell} — {marker.type.replace(/_/g, ' ')}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  LEFT COLUMN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const renderLeftColumn = () => (
    <div style={{
      width: '40%', height: '100%', flexShrink: 0,
      background: T_panelBg,
      borderRight: `1px solid ${T_panelBorder}`,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {renderSidebarHeader()}

      {/* Phase-dependent content */}
      {isRoomPhase ? renderRoomSidebar() : (
        <>
          {renderRefinementPanel()}
          {/* Refinement bottom actions */}
          <div style={{ padding: '12px 14px', borderTop: `1px solid ${T_panelBorderSoft}`, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <GazeButton id="adv-back-rooms" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={switchToRooms}
              style={{ height: 52, width: '100%', borderRadius: 8, background: T_subSurface, border: `1px solid ${T_panelBorderSoft}`, color: T_textSub, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              ← Back to Rooms
            </GazeButton>
            <GazeButton id="adv-generate-ref" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={handleGenerate}
              style={{ height: 64, width: '100%', borderRadius: 8, background: T_generatePlanBg, border: `2px solid ${T_generatePlanBorder}`, color: T_generatePlanText, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              Generate Plan
            </GazeButton>
          </div>
        </>
      )}
    </div>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  RIGHT COLUMN — the plot grid
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const renderRightColumn = () => (
    <div style={{
      flex: 1, height: '100%',
      display: 'flex', flexDirection: 'column',
      background: T_canvasBg,
      position: 'relative',
    }}>
      {/* Directional label TOP */}
      <div style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none',
        background: isLight ? 'rgba(74, 58, 42, 0.18)' : isMix ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '3px 10px',
        fontSize: 10, fontWeight: 800, color: T_textDim, letterSpacing: 1,
      }}>
        BACK ({directions.back})
      </div>

      {/* Directional label LEFT */}
      <div style={{
        position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', zIndex: 10, pointerEvents: 'none',
        fontSize: 9, fontWeight: 800, color: T_textDim, letterSpacing: 1, whiteSpace: 'nowrap',
      }}>
        LEFT ({directions.left})
      </div>

      {/* Directional label RIGHT */}
      <div style={{
        position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%) rotate(90deg)', zIndex: 10, pointerEvents: 'none',
        fontSize: 9, fontWeight: 800, color: T_textDim, letterSpacing: 1, whiteSpace: 'nowrap',
      }}>
        RIGHT ({directions.right})
      </div>

      {/* Compass Rose */}
      <CompassRose facing={facing} />

      {/* Phase indicator overlay */}
      {isRoomPhase && selectedRoomId && (
        <div style={{
          position: 'absolute', top: 8, left: 8, zIndex: 10, pointerEvents: 'none',
          background: isLight ? 'rgba(240, 226, 196, 0.92)' : isMix ? 'rgba(36, 31, 24, 0.85)' : 'rgba(0,0,0,0.7)', borderRadius: 8, padding: '6px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
          border: isGridArmed ? `1px solid ${T_wallsFill}80` : '1px solid transparent',
        }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: ROOM_LIBRARY[selectedRoomId]?.color || '#888' }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: isGridArmed ? T_wallsFill : T_textMain }}>
            {ROOM_LIBRARY[selectedRoomId]?.shortLabel || selectedRoomId}
            {isGridArmed ? ' — ARMED' : ' — Press READY'}
          </span>
        </div>
      )}

      {/* THE GRID */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: 'repeat(4, 1fr)',
        gap: 0,
        padding: '28px 32px 8px 32px',
      }}>
        {RENDER_ORDER.map((cellKey) => {
          const gs = gridState[cellKey];
          const isOcc = !!gs?.roomId;
          const lib = isOcc && gs ? ROOM_LIBRARY[gs.roomId] : null;
          const { row, col } = parseCellKey(cellKey);
          const isSelected = selectedCell === cellKey;
          const isSplit = refinements.subCellSplits.some(s => s.parentCell === cellKey);
          const hasVastu = refinements.vastuFlags.some(f => f.cell === cellKey);
          const hasAccess = refinements.accessibilityMarkers.some(a => a.cell === cellKey);
          const hasVoid = refinements.voidMarkers.some(v => v.cell === cellKey);
          const hasWallEdge = refinements.customEdges.some(e => e.cells[0] === cellKey);

          // Merged room border logic
          const merged = mergedRooms[cellKey];
          const normalBorder = `1px solid ${T_cellBorder}`;
          const borderRight = merged?.hideBorder === 'right' || merged?.hideBorder === 'both' ? 'none' : normalBorder;
          const borderBottom = merged?.hideBorder === 'bottom' || merged?.hideBorder === 'both' ? 'none' : normalBorder;
          const borderLeft = merged?.leftSame ? 'none' : normalBorder;
          const borderTop = merged?.upSame ? 'none' : normalBorder;
          const showLabel = merged?.isLabelCell !== false;

          // Staircase rendering
          const isStairCell = gs?.roomId === 'staircase' || gs?.roomLabel?.toLowerCase().includes('stair');
          const cellRotation = refinements.cellRotations.find(cr => cr.cell === cellKey);
          const stairRotation = cellRotation?.degrees || 0;
          const comboLayout = cellLayouts[cellKey];
          const isComboStair = gs?.roomId === 'diningStaircase' || (gs?.roomLabel?.toLowerCase().includes('stair') && gs?.roomLabel?.toLowerCase().includes('+'));

          // In room_selection: clickable only when armed (safety); in refinement: non-overview phases
          const cellClickable = isRoomPhase ? (!!selectedRoomId && isGridArmed) : phase !== 'overview';

          // Highlight cells that match selected room in room_selection phase
          const isRoomHighlight = isRoomPhase && selectedRoomId && gs?.roomId === selectedRoomId;

          const getNeighborRoom = (r: number, c: number): string | null => {
            if (r < 1 || r > GRID_ROWS || c < 1 || c > GRID_COLS) return null;
            return gridState[buildCellKey(r, c)]?.roomId || null;
          };

          return (
            <GazeButton key={cellKey} id={`cell-${cellKey}`}
              gazeEnabled={isGazeEnabled && cellClickable}
              gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={1200}
              onClick={() => handleCellClick(cellKey)}
              contentFill
              style={{
                width: '100%', height: '100%',
                borderTop, borderRight, borderBottom, borderLeft,
                background: 'transparent',
                display: 'flex', overflow: 'hidden', padding: 0,
                position: 'relative',
                ...(isSelected ? { transform: 'scale(1.02)', zIndex: 10, boxShadow: '0 0 15px rgba(45,212,191,0.5)' } : {}),
                ...(isRoomHighlight ? { boxShadow: `0 0 12px ${ROOM_LIBRARY[selectedRoomId]?.color || '#2DD4BF'}60` } : {}),
              }}>
              {/* Staircase cell with combo layout */}
              {isOcc && isComboStair && comboLayout && showLabel ? (
                <div style={{
                  width: '100%', height: '100%', display: 'flex',
                  flexDirection: comboLayout === 'top' || comboLayout === 'bottom' ? 'column' : 'row',
                  position: 'relative',
                }}>
                  {(comboLayout === 'left' || comboLayout === 'top') && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${lib?.color || '#A1887F'}18` }}>
                      <StairDrawing rotation={stairRotation} width="80%" height="80%" />
                    </div>
                  )}
                  <div style={{
                    width: comboLayout === 'left' || comboLayout === 'right' ? 1 : '100%',
                    height: comboLayout === 'top' || comboLayout === 'bottom' ? 1 : '100%',
                    background: 'rgba(255,255,255,0.15)', flexShrink: 0,
                    borderStyle: 'dashed',
                  }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `${lib?.color || '#A1887F'}12` }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: lib?.color || '#fff' }}>
                      {lib?.shortLabel?.replace(/\+?Stairs?/i, '').trim() || lib?.shortLabel}
                    </span>
                    <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)' }}>{cellWFt}×{cellDFt}ft</span>
                  </div>
                  {(comboLayout === 'right' || comboLayout === 'bottom') && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${lib?.color || '#A1887F'}18` }}>
                      <StairDrawing rotation={stairRotation} width="80%" height="80%" />
                    </div>
                  )}
                </div>
              ) : isOcc && isStairCell && !isComboStair && showLabel ? (
                /* Pure staircase cell */
                <div style={{
                  width: '100%', height: '100%', position: 'relative',
                  background: `${lib?.color || '#A1887F'}15`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ width: '60%', height: '60%' }}>
                    <StairDrawing rotation={stairRotation} />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: lib?.color || '#A1887F', marginTop: 2 }}>
                    {lib?.shortLabel || 'Stairs'}
                  </span>
                  <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)' }}>{cellWFt}×{cellDFt}ft</span>
                </div>
              ) : (
                /* Normal cell rendering via ArchitecturalCell */
                <ArchitecturalCell
                  cellKey={cellKey} row={row} col={col} totalRows={GRID_ROWS} totalCols={GRID_COLS}
                  roomId={gs?.roomId || null}
                  roomLabel={showLabel ? (lib?.roomLabel || gs?.roomLabel || null) : null}
                  shortLabel={showLabel ? (lib?.shortLabel || null) : null}
                  roomColor={lib?.color || '#78909C'}
                  cellWidthFt={cellWFt} cellDepthFt={cellDFt}
                  isArmed={isRoomPhase && isGridArmed} isExpTarget={false} isExpAnchor={false} expDirection={null}
                  pendingRoomColor={undefined}
                  neighborN={getNeighborRoom(row + 1, col)} neighborS={getNeighborRoom(row - 1, col)}
                  neighborE={getNeighborRoom(row, col + 1)} neighborW={getNeighborRoom(row, col - 1)}
                />
              )}

              {/* Selection highlight (refinement) */}
              {isSelected && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 15, border: '3px solid #2DD4BF', borderRadius: 2, pointerEvents: 'none', boxShadow: 'inset 0 0 12px rgba(45,212,191,0.25)' }} />
              )}

              {/* Room selection armed indicator — only show when grid is armed */}
              {isRoomPhase && selectedRoomId && isGridArmed && !isOcc && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 14, pointerEvents: 'none', border: `2px dashed ${ROOM_LIBRARY[selectedRoomId]?.color || THEME.teal}60`, borderRadius: 2 }} />
              )}

              {/* Split indicator */}
              {isSplit && (
                <div style={{ position: 'absolute', top: 4, bottom: 4, left: '50%', width: 2, borderLeft: '2px dashed rgba(139,92,246,0.85)', pointerEvents: 'none', zIndex: 16 }} />
              )}

              {/* Vastu flag */}
              {hasVastu && (
                <span style={{ position: 'absolute', top: 2, right: 3, fontSize: 9, color: T_rotateFill, pointerEvents: 'none', zIndex: 16 }}>!</span>
              )}

              {/* Accessibility marker */}
              {hasAccess && (
                <span style={{ position: 'absolute', bottom: 2, left: 3, fontSize: 8, color: T_wallsFill, pointerEvents: 'none', zIndex: 16 }}>A</span>
              )}

              {/* Void marker */}
              {hasVoid && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 14, pointerEvents: 'none', background: 'repeating-linear-gradient(45deg, rgba(59,130,246,0.15), rgba(59,130,246,0.15) 4px, transparent 4px, transparent 8px)' }}>
                  <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 7, fontWeight: 800, color: 'rgba(59,130,246,0.7)', fontFamily: "'JetBrains Mono', monospace" }}>VOID</span>
                </div>
              )}

              {/* Wall edge indicator */}
              {hasWallEdge && (() => {
                const edge = refinements.customEdges.find(e => e.cells[0] === cellKey);
                const edgeColor = edge?.type === 'half_wall_glass' ? T_wallsFill : edge?.type === 'open_archway' ? T_expandFill : edge?.type === 'no_wall' ? THEME.red : T_textSub;
                return <div style={{ position: 'absolute', top: 4, bottom: 4, right: 0, width: 3, background: edgeColor, pointerEvents: 'none', zIndex: 16, borderRadius: 2 }} />;
              })()}
            </GazeButton>
          );
        })}
      </div>

      {/* Road label at bottom — taller, stronger typography for plot-canvas feel */}
      <div style={{
        minHeight: 'clamp(72px, 8.5vh, 96px)', flexShrink: 0,
        background: isLight ? T_panelBg : isMix ? '#241F18' : 'rgba(22,32,56,0.8)',
        borderTop: `2px solid ${isLight ? T_panelBorderSoft : isMix ? T_panelBorderSoft : 'rgba(56,189,248,0.2)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isLight ? '#1F6B7E' : isMix ? '#5E9CA8' : THEME.road,
        fontWeight: 800, fontSize: 'clamp(18px, 2.2vh, 24px)', letterSpacing: '0.6px',
        boxShadow: isLight ? '0 -3px 10px rgba(82, 66, 45, 0.06)' : isMix ? '0 -3px 12px rgba(0,0,0,0.18)' : 'none',
      }}>
        FRONT / ROAD ({facing}) &mdash; {pw} ft
      </div>
    </div>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  ROOT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div className={`advanced-map-screen${isLight ? ' theme-light' : ''}${isMix ? ' theme-mix' : ''}${isWarm ? ' theme-warm' : ''}`} style={{
      width: '100vw', height: '100vh',
      display: 'flex', flexDirection: 'row',
      overflow: 'hidden',
      background: T_pageBg,
    }}>
      {renderLeftColumn()}
      {renderRightColumn()}
      {renderFloatingNav()}

      {/* Floor Plan Viewer Modal */}
      {showFloorPlanViewer && compiledPayload && (
        <FloorPlanViewerModal
          compassData={compiledPayload}
          onClose={() => setShowFloorPlanViewer(false)}
          onSpeak={onSpeak}
          surveyData={(ws.surveyData || null) as Record<string, any> | null}
        />
      )}
    </div>
  );
}

export default React.memo(AdvancedMapScreen);
