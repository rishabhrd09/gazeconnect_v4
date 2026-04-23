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
export const DEFAULT_SNAP_MARGIN = 35;

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

/**
 * Find the best keyboard key for a given gaze point using center-weighted
 * distance with expanded hit zones.
 *
 * Algorithm:
 * 1. Inflate each key's bounds by snapMargin
 * 2. Filter to keys whose inflated bounds contain the gaze point
 * 3. Among candidates, select the one whose CENTER is closest to the gaze point
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
  let bestWeight = -1;

  for (const key of keys) {
    // Check if gaze is within inflated bounds
    const inExpandedBounds = (
      gazeX >= key.left - snapMargin &&
      gazeX <= key.right + snapMargin &&
      gazeY >= key.top - snapMargin &&
      gazeY <= key.bottom + snapMargin
    );

    if (!inExpandedBounds) continue;

    // Center-distance weighting: closer to center = higher weight
    const dx = gazeX - key.centerX;
    const dy = gazeY - key.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const weight = 1 / (distance + 1);

    if (weight > bestWeight) {
      bestWeight = weight;
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
