/**
 * Whether the version 2 Compass map is on: Refine (divided cells), the new studio and its drawings.
 * On by default. Off with GAZECONNECT_COMPASS_V2=0 (electron/preload.ts) or, for QA in a browser,
 * localStorage 'gc-compass-v2' = '0'. Off keeps the saved plan and simply hides Refine and uses the
 * earlier studio, which can draw any map without divided cells.
 */
export function compassV2Enabled(): boolean {
  try {
    if (localStorage.getItem('gc-compass-v2') === '0') return false;
  } catch { /* storage unavailable: default on */ }
  const features = (window as any).electronAPI?.features;
  return !(features && features.compassV2 === false);
}
