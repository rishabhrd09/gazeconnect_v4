/**
 * GazeConnect Pro - Semantic Snapping
 * ====================================
 * Soft attraction toward gaze-enabled buttons during fixation.
 * Only active during fixation state — no snapping during saccades.
 */

export interface SnapTarget {
  id: string;
  rect: DOMRect;
  priority: number;  // 0=normal, 1=important, 2=emergency, 3=gaze-toggle
  isEdge: boolean;   // true if near screen edge
  element?: HTMLElement;  // Reference to the DOM element for context attribute reading
}

export interface SnapResult {
  x: number;
  y: number;
  snappedToId: string | null;
  snapStrength: number;  // 0-1
}

/** Base snap radius in px — how close cursor must be to start pulling toward center */
const BASE_SNAP_RADIUS = 140;
/** Edge button snap radius multiplier — edge buttons get bigger snap zones */
const EDGE_SNAP_MULTIPLIER = 1.15;
// v17: Bumped from 0.22 → 0.30 to fight ALS gaze noise that lets cursor settle
// at the corner of a card rather than the center. Combined with the per-frame
// proximity-boost below (see computeSnap), the effective near-center pull is
// ~0.50 — strong enough to "lock" against typical 15–25px Tobii ET5 noise
// without overshoot.
const MAX_SNAP_STRENGTH = 0.30;
/** Gaze toggle gets extra pull strength (easier to reach enable button) */
const TOGGLE_SNAP_RADIUS = 220;
const TOGGLE_MAX_SNAP_STRENGTH = 0.36;
// v15: Reduced keyboard snap to prevent compound pull with backend magnetism
// causing rightward drift. Was 126px/0.18, now 90px/0.10.
// v17.1 (revert): Restored v15 values. Bumping keyboard snap made the
// cursor feel "over-responsive" — when two adjacent keys are both
// within the snap zone, tiny gaze noise flips the closest target and
// the proximity boost snaps the cursor hard between keys.
const KEYBOARD_SNAP_RADIUS = 90;
const KEYBOARD_MAX_SNAP_STRENGTH = 0.10;
const PREDICTION_SNAP_RADIUS = 138;
const PREDICTION_MAX_SNAP_STRENGTH = 0.20;
/** Distance from window edge to be considered "edge button" */
const EDGE_THRESHOLD = 150;
// v17: When cursor is closer than this fraction of the snap radius to the
// target center, apply an additional "final-yard" pull. This makes the snap
// near-quadratic in proximity instead of linear, giving a clear "lock" feel
// when the user is almost on target rather than letting noise drift the
// cursor along the button edge.
// v17.1: ONLY applied to large, well-separated targets (cards, toggle).
// On dense layouts (keyboard, prediction strip) the boost actively hurts —
// gaze noise of ~15 px is enough to flip which target is "closest"
// between two adjacent keys, and the boost then snaps the cursor hard
// between them, producing the "over-responsive" feel the patient
// reported. The boost is therefore gated behind useProximityBoost.
const NEAR_CENTER_PROXIMITY = 0.45;     // top 45% of the snap radius
const NEAR_CENTER_BOOST_FACTOR = 1.45;  // 1.45× pull strength inside that zone

function getSnapConfig(target: SnapTarget): { radius: number; maxStrength: number; useProximityBoost: boolean } {
  const context = (target.element?.getAttribute('data-gaze-context') || '').toLowerCase();
  if (target.priority >= 3 || context === 'gazetoggle') {
    return { radius: TOGGLE_SNAP_RADIUS, maxStrength: TOGGLE_MAX_SNAP_STRENGTH, useProximityBoost: true };
  }
  if (context === 'keyboard') {
    // No proximity boost — keys are tightly packed; boost causes
    // hard inter-key jumps from gaze noise.
    return { radius: KEYBOARD_SNAP_RADIUS, maxStrength: KEYBOARD_MAX_SNAP_STRENGTH, useProximityBoost: false };
  }
  if (context === 'prediction') {
    // Prediction chips are also tightly packed horizontally — same
    // hazard. Linear snap only.
    return { radius: PREDICTION_SNAP_RADIUS, maxStrength: PREDICTION_MAX_SNAP_STRENGTH, useProximityBoost: false };
  }
  return {
    radius: BASE_SNAP_RADIUS * (target.isEdge ? EDGE_SNAP_MULTIPLIER : 1.0),
    maxStrength: MAX_SNAP_STRENGTH,
    useProximityBoost: true,
  };
}

/**
 * Collect all gaze-enabled buttons as snap targets.
 * Should be called every ~500ms to refresh.
 */
export function collectSnapTargets(): SnapTarget[] {
  // v11: Query ALL gaze-interactive elements, not just data-gaze="true".
  // GazeControlToggle buttons use data-gaze-toggle/data-gaze-always without data-gaze.
  const elements = document.querySelectorAll(
    '[data-gaze="true"], [data-gaze-always="true"], [data-gaze-toggle="true"]'
  );
  const targets: SnapTarget[] = [];
  const seenIds = new Set<string>(); // Deduplicate elements matched by multiple selectors
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  elements.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Deduplicate: same element may match multiple selectors
    const elId = el.id || `${rect.left.toFixed(0)}_${rect.top.toFixed(0)}`;
    if (seenIds.has(elId)) return;
    seenIds.add(elId);

    // Determine priority from data attributes
    let priority = 0;
    const dataPriority = el.getAttribute('data-snap-priority');
    if (dataPriority !== null) {
      priority = parseInt(dataPriority, 10) || 0;
    } else {
      if (el.getAttribute('data-gaze-always') === 'true') priority = 2;
      if (el.getAttribute('data-gaze-toggle') === 'true') priority = 3;
    }

    // Check if near edge
    const isEdge = (
      rect.left < EDGE_THRESHOLD ||
      rect.top < EDGE_THRESHOLD ||
      (vw - rect.right) < EDGE_THRESHOLD ||
      (vh - rect.bottom) < EDGE_THRESHOLD
    );

    targets.push({
      id: el.id || el.textContent?.slice(0, 20) || 'unknown',
      rect,
      priority,
      isEdge,
      element: el,
    });
  });

  return targets;
}

/**
 * Compute snapped gaze position.
 *
 * @param gazeX - Current gaze x (px)
 * @param gazeY - Current gaze y (px)
 * @param gazeState - Backend classifier state ('fixation', 'saccade', 'glissade')
 * @param targets - Cached snap targets
 * @returns SnapResult with potentially adjusted coordinates
 */
export function computeSnap(
  gazeX: number,
  gazeY: number,
  gazeState: string | undefined,
  targets: SnapTarget[],
): SnapResult {
  // Only snap during fixation
  if (gazeState && gazeState !== 'fixation') {
    return { x: gazeX, y: gazeY, snappedToId: null, snapStrength: 0 };
  }

  let bestTarget: SnapTarget | null = null;
  let bestScore = -Infinity;
  let bestDistance = Infinity;

  for (const target of targets) {
    // Center of target
    const cx = target.rect.left + target.rect.width / 2;
    const cy = target.rect.top + target.rect.height / 2;

    const dx = gazeX - cx;
    const dy = gazeY - cy;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const { radius: snapRadius } = getSnapConfig(target);

    if (distance > snapRadius) continue;

    // Score: closer = better, higher priority = better
    // Normalize distance to 0-1 within snap radius (1 = closest)
    const distScore = 1 - distance / snapRadius;
    const priorityBonus = target.priority * 0.2;
    const score = distScore + priorityBonus;

    if (score > bestScore) {
      bestScore = score;
      bestTarget = target;
      bestDistance = distance;
    }
  }

  if (!bestTarget) {
    return { x: gazeX, y: gazeY, snappedToId: null, snapStrength: 0 };
  }

  // Compute snap strength: increases as gaze gets closer to target center.
  // proximity ∈ [0, 1] where 1 = at center, 0 = at snap-radius boundary.
  const { radius: snapRadius, maxStrength, useProximityBoost } = getSnapConfig(bestTarget);
  const proximity = 1 - bestDistance / snapRadius;
  let snapStrength = Math.min(maxStrength, maxStrength * proximity * proximity);

  // v17: NEAR-CENTER FINAL-YARD PULL. When the cursor is in the top 45% of
  // the snap radius (i.e. very close to center), apply an additional boost
  // so gaze noise can't drag the cursor back out to the button edge.
  // v17.1: Only enabled for large well-separated targets — keyboard /
  // prediction layouts opt out via useProximityBoost=false to avoid the
  // hard inter-key snap from the boost amplifying tiny gaze noise.
  if (useProximityBoost && proximity >= 1 - NEAR_CENTER_PROXIMITY) {
    snapStrength = Math.min(
      maxStrength * NEAR_CENTER_BOOST_FACTOR,
      snapStrength * NEAR_CENTER_BOOST_FACTOR,
    );
  }

  // Soft attraction toward target center
  const cx = bestTarget.rect.left + bestTarget.rect.width / 2;
  const cy = bestTarget.rect.top + bestTarget.rect.height / 2;

  const snappedX = gazeX + (cx - gazeX) * snapStrength;
  const snappedY = gazeY + (cy - gazeY) * snapStrength;

  return {
    x: snappedX,
    y: snappedY,
    snappedToId: bestTarget.id,
    snapStrength,
  };
}
