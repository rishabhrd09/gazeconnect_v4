/**
 * GazeConnect Pro - Edge Hit Zone Expansion
 * ==========================================
 * Buttons near window edges get expanded hit zones to compensate
 * for reduced gaze accuracy at screen periphery.
 */

export interface EdgeExpansion {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Distance from window edge where expansion starts (px) */
const EDGE_ZONE = 120;

/** Default maximum expansion per edge (px) */
const DEFAULT_MAX_EXPANSION = 30;

/**
 * Compute hit zone expansion for a button based on its proximity to window edges.
 *
 * Buttons within EDGE_ZONE px of a window edge get expanded hit zones.
 * Expansion is linear: full at edge, zero at EDGE_ZONE distance.
 *
 * @param rect - Button's bounding rect
 * @param maxExpansion - Maximum expansion in px (default 30)
 * @returns EdgeExpansion with per-side expansion values
 */
export function computeEdgeExpansion(
  rect: { left: number; top: number; right: number; bottom: number },
  maxExpansion: number = DEFAULT_MAX_EXPANSION,
): EdgeExpansion {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Distance from each edge
  const distLeft = rect.left;
  const distTop = rect.top;
  const distRight = vw - rect.right;
  const distBottom = vh - rect.bottom;

  return {
    left: computeExpansion(distLeft, maxExpansion),
    top: computeExpansion(distTop, maxExpansion),
    right: computeExpansion(distRight, maxExpansion),
    bottom: computeExpansion(distBottom, maxExpansion),
  };
}

function computeExpansion(distFromEdge: number, maxExpansion: number): number {
  if (distFromEdge >= EDGE_ZONE) return 0;
  if (distFromEdge <= 0) return maxExpansion;
  // Linear ramp: full at edge, zero at EDGE_ZONE
  return maxExpansion * (1 - distFromEdge / EDGE_ZONE);
}

/**
 * Check if a point is within an expanded bounding rect.
 *
 * @param px - Point x
 * @param py - Point y
 * @param rect - Original bounding rect
 * @param expansion - Edge expansion from computeEdgeExpansion
 * @returns true if point is within expanded rect
 */
export function isPointInExpandedRect(
  px: number,
  py: number,
  rect: { left: number; top: number; right: number; bottom: number },
  expansion: EdgeExpansion,
): boolean {
  return (
    px >= rect.left - expansion.left &&
    px <= rect.right + expansion.right &&
    py >= rect.top - expansion.top &&
    py <= rect.bottom + expansion.bottom
  );
}
