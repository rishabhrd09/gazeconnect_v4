/**
 * Gaze feedback colours: the cursor ring, the dwell fill that runs round it, and the square
 * that marks the key or card being selected. Three complete palettes, chosen in Settings ->
 * Eye Gaze -> Gaze colours, each with its own variant for the Dark and the Warm theme,
 * because a colour that reads on one background vanishes on the other.
 *
 * Chosen by measurement (27 Sep 2026) against the themes' own page and key colours
 * (npm run check:gaze-colours repeats every measurement):
 * - Contrast, WCAG 2.2 non-text contrast (1.4.11) and focus appearance (2.4.13): the ring and
 *   the square need 3:1 against the page and the keys; the new palettes reach 5.8:1 to 14:1.
 *   Standard on Warm does not (its white ring is 1.1:1 on the cream page, the teal fill 1.7:1).
 * - Colour vision (Machado, Oliveira and Fernandes 2009, severity 1): every palette pairs a
 *   warm and a cool hue for ring and fill, the blue-yellow axis that protan and deutan vision
 *   keeps. Simulated, the new pairs stay at least 60 CIE delta E apart for protan, deutan and
 *   tritan vision; High contrast adds a lightness gap (3:1 on Dark, 8:1 on Warm).
 * - Polarity: bright marks on Dark, deep marks on Warm, with a thin opposite-tone edge on the
 *   ring (WCAG technique C40, a two-colour indicator) so it stays visible over any key colour.
 * - Hues from the colour-blind-safe Okabe-Ito and Paul Tol sets, lightened and desaturated on
 *   Dark, where saturated colours glare and vibrate on dark surfaces.
 * - Thickness: 2.4.13 asks for at least a 2 px perimeter. High contrast widens the ring and
 *   the square for low vision; Soft sits between it and Standard.
 */
export type GazeColors = 'standard' | 'high_contrast' | 'soft';
export const DEFAULT_GAZE_COLORS: GazeColors = 'standard';

export interface GazePalette {
  /** Cursor ring. */
  ring: string;
  /** Thin opposite-tone edge round the ring: dark for bright rings, light for deep ones. */
  edge: 'dark' | 'light';
  /** Dwell progress, drawn over the ring. */
  fill: string;
  /** Square round the key or card being selected, and its colour once the dwell locks on. */
  square: string;
  squareLocked: string;
  /** Brief flash on a typed key; absent means the theme accent, as before. */
  confirm?: string;
  /** Ring thickness as a share of the cursor size, and the square's border width. */
  ringShare: number;
  squarePx: number;
}

export interface GazeColorOption {
  label: string;
  description: string;
  dark: GazePalette;
  warm: GazePalette;
}

export const GAZE_COLOR_PALETTES: Record<GazeColors, GazeColorOption> = {
  standard: {
    label: 'Standard',
    description: 'The colours used so far: amber ring (light on Warm) with a teal fill.',
    dark: { ring: '#FFC247', edge: 'dark', fill: '#2DD4BF', square: '#38BDF8', squareLocked: '#2DD4BF', ringShare: 0.065, squarePx: 3 },
    warm: { ring: 'rgba(255, 255, 255, 0.82)', edge: 'dark', fill: '#2DD4BF', square: '#38BDF8', squareLocked: '#2DD4BF', ringShare: 0.065, squarePx: 3 },
  },
  high_contrast: {
    label: 'High contrast',
    description: 'Strongest and thickest. Yellow with a blue fill on Dark, navy with an amber fill on Warm.',
    dark: { ring: '#FFD84A', edge: 'dark', fill: '#1F6FFF', square: '#FFD84A', squareLocked: '#FFD84A', confirm: '#FFD84A', ringShare: 0.085, squarePx: 5 },
    warm: { ring: '#0B2350', edge: 'light', fill: '#F5B000', square: '#0B2350', squareLocked: '#0B2350', confirm: '#0B2350', ringShare: 0.085, squarePx: 5 },
  },
  soft: {
    label: 'Soft blue',
    description: 'Calm blue with an orange fill; less glare. Suits colour-blind eyes.',
    dark: { ring: '#7CC3F2', edge: 'dark', fill: '#F2A33A', square: '#7CC3F2', squareLocked: '#7CC3F2', confirm: '#7CC3F2', ringShare: 0.07, squarePx: 4 },
    warm: { ring: '#1060A8', edge: 'light', fill: '#B85400', square: '#1060A8', squareLocked: '#1060A8', confirm: '#1060A8', ringShare: 0.07, squarePx: 4 },
  },
};

export function normalizeGazeColors(value: unknown): GazeColors {
  return value === 'high_contrast' || value === 'soft' ? value : DEFAULT_GAZE_COLORS;
}

export function gazePalette(colors: unknown, warm: boolean): GazePalette {
  const option = GAZE_COLOR_PALETTES[normalizeGazeColors(colors)];
  return warm ? option.warm : option.dark;
}

/** The ring's thin edge, as box shadows (outside and inside the ring). */
export function gazeRingEdge(edge: GazePalette['edge']): string {
  return edge === 'light'
    ? '0 0 0 1.5px rgba(255, 255, 255, 0.88), 0 2px 10px rgba(0, 0, 0, 0.18), inset 0 0 0 1.5px rgba(255, 255, 255, 0.85)'
    : '0 0 0 1.5px rgba(0, 0, 0, 0.32), 0 2px 12px rgba(0, 0, 0, 0.45), inset 0 0 0 1.5px rgba(0, 0, 0, 0.30), inset 0 0 8px rgba(0, 0, 0, 0.22)';
}
