/**
 * GazeConnect Pro - Screen Profile
 * =================================
 * Estimates physical screen size from viewport dimensions
 * and provides adaptive parameters for gaze interaction.
 */

export interface ScreenProfile {
  viewportWidth: number;
  viewportHeight: number;
  /** Estimated diagonal in inches */
  estimatedDiagonal: number;
  /** Minimum recommended target size in px */
  minTargetSize: number;
  /** Snap radius for semantic snapping in px */
  snapRadius: number;
  /** Maximum edge expansion in px */
  edgeExpansionMax: number;
  /** Edge expansion multiplier (larger for small screens) */
  edgeExpansionMultiplier: number;
}

/**
 * Estimate physical screen size from viewport dimensions.
 * Uses typical PPI ranges to approximate diagonal size.
 */
export function computeScreenProfile(): ScreenProfile {
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Use devicePixelRatio and screen size to estimate physical diagonal
  const dpr = window.devicePixelRatio || 1;
  const physicalW = window.screen.width * dpr;
  const physicalH = window.screen.height * dpr;

  // Estimate PPI from common screen sizes
  // Most screens are 90-140 PPI
  // Use a heuristic: assume ~110 PPI for typical screens
  const diagonalPx = Math.sqrt(physicalW * physicalW + physicalH * physicalH);
  const estimatedPPI = 110;
  const estimatedDiagonal = diagonalPx / estimatedPPI / dpr;

  // Adaptive parameters based on screen size
  let minTargetSize: number;
  let snapRadius: number;
  let edgeExpansionMax: number;
  let edgeExpansionMultiplier: number;

  if (estimatedDiagonal <= 15) {
    // Small laptop (13-15")
    minTargetSize = 90;
    snapRadius = 80;
    edgeExpansionMax = 40;
    edgeExpansionMultiplier = 1.8;
  } else if (estimatedDiagonal <= 20) {
    // Medium (15-20")
    minTargetSize = 85;
    snapRadius = 75;
    edgeExpansionMax = 35;
    edgeExpansionMultiplier = 1.5;
  } else if (estimatedDiagonal <= 24) {
    // Standard (20-24")
    minTargetSize = 80;
    snapRadius = 70;
    edgeExpansionMax = 30;
    edgeExpansionMultiplier = 1.3;
  } else {
    // Large (27"+)
    minTargetSize = 80;
    snapRadius = 65;
    edgeExpansionMax = 25;
    edgeExpansionMultiplier = 1.2;
  }

  return {
    viewportWidth: w,
    viewportHeight: h,
    estimatedDiagonal,
    minTargetSize,
    snapRadius,
    edgeExpansionMax,
    edgeExpansionMultiplier,
  };
}
