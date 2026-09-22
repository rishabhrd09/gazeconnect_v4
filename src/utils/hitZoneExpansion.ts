/**
 * hitZoneExpansion.ts - Center-Weighted Hit Zone Expansion for Keyboard Keys
 *
 * When gaze falls in the overlap zone between two adjacent keys,
 * uses center-distance weighting to select the most likely intended key.
 * Only applies to elements with data-gaze-context="keyboard".
 */

// v15: Increased snap margin to ensure nearest-center selection covers ALL gaps
// between keys and the area just outside the keyboard bounds.
// This is now the PRIMARY selection mechanism (not a fallback), so it must
// capture any gaze point near the keyboard grid.
// v17.8: 35 → 55 px. The patient reported the corner-key loop happens
// reliably on edge keys (A, Z, P, ?) — those are where raw gaze noise
// routinely exceeds 35 px outside the rect, causing findBestKeyboardKey
// to return null and onset to reset every frame. 55 px is below typical
// inter-key spacing (≈100 px on this layout) so adjacent keys still win
// disambiguation; only the empty space just outside the keyboard grid is
// re-attributed to the nearest key.
export const DEFAULT_SNAP_MARGIN = 55;

// Minimum element size to consider for snapping (avoid tiny elements)
const MIN_ELEMENT_SIZE = 30;

export interface KeyRect {
  element: HTMLElement;
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/**
 * Collect all keyboard key elements currently in the DOM.
 * Returns their bounding rects with center points pre-calculated.
 */
export function collectKeyboardKeys(): KeyRect[] {
  const keys: KeyRect[] = [];
  // Find all elements with data-gaze-context="keyboard" that are buttons
  const elements = document.querySelectorAll('[data-gaze-context="keyboard"]');

  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < MIN_ELEMENT_SIZE || rect.height < MIN_ELEMENT_SIZE) continue;

    keys.push({
      element: el,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    });
  }

  return keys;
}

/** Distance from a point to a rectangle: 0 anywhere inside it. */
export function distanceToRect(
  x: number, y: number,
  rect: { left: number; top: number; right: number; bottom: number },
): number {
  return Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));
}

/**
 * True when candidate (edge, centre) beats the best so far. The key that
 * CONTAINS the point wins outright; outside every key the nearest key EDGE
 * wins; centre distance only breaks ties (overlapping rects, exact gaps).
 *
 * Ranking by centre distance alone is wrong for keys of unequal size: most of
 * a wide key (the space bar is five to seven keys wide) lies nearer to a
 * neighbour's centre than to its own, so looking at the space bar selected
 * the letter above it, and the winner flipped between neighbours with noise.
 */
export function isCloserTarget(edge: number, centre: number, bestEdge: number, bestCentre: number): boolean {
  const EDGE_TIE_PX = 0.5;
  if (edge < bestEdge - EDGE_TIE_PX) return true;
  return Math.abs(edge - bestEdge) <= EDGE_TIE_PX && centre < bestCentre;
}

/**
 * Find the best keyboard key for a given gaze point within expanded hit zones.
 *
 * Algorithm:
 * 1. Inflate each key's bounds by snapMargin
 * 2. Filter to keys whose inflated bounds contain the gaze point
 * 3. Among candidates, the key containing the point wins; otherwise the key
 *    whose rectangle is nearest (see isCloserTarget)
 *
 * @param gazeX - Gaze X position in window pixels
 * @param gazeY - Gaze Y position in window pixels
 * @param keys - Pre-collected keyboard key rects (call collectKeyboardKeys() periodically)
 * @param snapMargin - Pixels to inflate each key's bounds (default 15)
 * @returns The best matching key element, or null if none within range
 */
export function findBestKeyboardKey(
  gazeX: number,
  gazeY: number,
  keys: KeyRect[],
  snapMargin: number = DEFAULT_SNAP_MARGIN
): HTMLElement | null {
  let bestKey: HTMLElement | null = null;
  let bestEdge = Infinity;
  let bestCentre = Infinity;

  for (const key of keys) {
    // Check if gaze is within inflated bounds
    const inExpandedBounds = (
      gazeX >= key.left - snapMargin &&
      gazeX <= key.right + snapMargin &&
      gazeY >= key.top - snapMargin &&
      gazeY <= key.bottom + snapMargin
    );

    if (!inExpandedBounds) continue;

    const edge = distanceToRect(gazeX, gazeY, key);
    const centre = Math.hypot(gazeX - key.centerX, gazeY - key.centerY);
    if (isCloserTarget(edge, centre, bestEdge, bestCentre)) {
      bestEdge = edge;
      bestCentre = centre;
      bestKey = key.element;
    }
  }

  return bestKey;
}

/**
 * Check if a point is within the expanded hit zone of any keyboard key.
 * Faster check than findBestKeyboardKey when you just need a boolean.
 */
export function isInKeyboardZone(
  gazeX: number,
  gazeY: number,
  keys: KeyRect[],
  snapMargin: number = DEFAULT_SNAP_MARGIN
): boolean {
  for (const key of keys) {
    if (
      gazeX >= key.left - snapMargin &&
      gazeX <= key.right + snapMargin &&
      gazeY >= key.top - snapMargin &&
      gazeY <= key.bottom + snapMargin
    ) {
      return true;
    }
  }
  return false;
}
