/**
 * Plan sizes as builders write them, to the nearest half inch.
 *
 * The same rounding as tools/compass_standards.ft_in, so a size on the map, in the
 * studio and on the drawing is always the same text. Cells are never rounded to whole
 * feet: a 30 ft plot has 7'-6" cells, not "8 ft".
 */
export function formatFeetInches(feet: number): string {
  if (!Number.isFinite(feet)) return '';
  const sign = feet < 0 ? '-' : '';
  const halfInches = Math.round(Math.abs(feet) * 24);
  const whole = Math.floor(halfInches / 24);
  const inches = (halfInches % 24) / 2;
  const inchText = Number.isInteger(inches) ? String(inches) : `${Math.floor(inches)}½`;
  return `${sign}${whole}'-${inchText}"`;
}

/** "7'-6" × 12'-6"" for a width and a depth in feet. */
export function formatSize(widthFt: number, depthFt: number): string {
  return `${formatFeetInches(widthFt)} × ${formatFeetInches(depthFt)}`;
}

/** Short ruler marks: 10 -> "10", 7.5 -> "7½", 6.25 -> "6¼". */
export function formatFeetShort(feet: number): string {
  const quarters = Math.round(feet * 4);
  const whole = Math.floor(quarters / 4);
  const fraction = ['', '¼', '½', '¾'][quarters % 4];
  return `${whole || !fraction ? whole : ''}${fraction}`;
}
