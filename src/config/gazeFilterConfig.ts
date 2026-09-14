/** Smoothing changes movement response, never the four selection durations. */
export const GAZE_FILTER_MODES = [
  { value: 'balanced', label: 'Balanced (default)' },
  { value: 'responsive', label: 'Responsive' },
  { value: 'stable', label: 'Steady' },
  { value: 'gentle', label: 'Gentle' },
] as const;
export type GazeFilterMode = typeof GAZE_FILTER_MODES[number]['value'];
export function normalizeFilterPreset(value: string): GazeFilterMode {
  if (value === 'als_late') return 'gentle';
  return GAZE_FILTER_MODES.some(mode => mode.value === value) ? value as GazeFilterMode : 'balanced';
}
