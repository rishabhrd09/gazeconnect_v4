/**
 * Midnight Navy, the third display mode (28 Sep 2026): the bedside palette of Iris Desk Buddy,
 * exact values. The stylesheet (src/styles/midnight-navy.css) declares the same colours as its
 * --iris-* and --state-* tokens; this copy serves the pages that must show Navy while another
 * theme is on (the theme choices in Settings). npm run check:look holds the two together.
 */
export const MIDNIGHT_NAVY = {
  bg: '#00102E',
  bgEdge: '#000918',
  bgOuter: '#000B24',
  bgInner: '#00102E',
  bgCentre: '#001538',
  navBg: '#000918',
  draftBg: '#08162D',
  card: '#0A1A36',
  cardEdge: '#223A61',
  cardLive: '#17305A',
  inset: '#17305A',
  textPrimary: '#F3F5F8',
  textSecondary: '#96AAD2',
  textMuted: '#8D9DB8',
  textBright: '#FFFFFF',
  icon: '#DCE7F5',
  ring: '#162A4B',
  divider: '#415270',
  outline: '#415270',
  accent: '#C2D3EE',
  action: '#17305A',
  actionInk: '#F3F5F8',
  progressTrack: '#203756',
  progressFill: '#C2D3EE',
  stateOk: '#8FBFA0',
  stateWarn: '#C9A96A',
  stateDanger: '#D08C82',
  stateInfo: '#C2D3EE',
  stateNote: '#8FA6D0',
} as const;

/** Iris's one page gradient (the stylesheet's --iris-page-gradient). */
export const MIDNIGHT_NAVY_PAGE_GRADIENT =
  `radial-gradient(ellipse 52% 48% at 50% 53%, ${MIDNIGHT_NAVY.bgCentre} 0%, ${MIDNIGHT_NAVY.bgInner} 38%, ${MIDNIGHT_NAVY.bgOuter} 66%, ${MIDNIGHT_NAVY.bgEdge} 100%)`;
