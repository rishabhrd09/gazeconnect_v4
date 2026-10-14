/**
 * Direction labels for compass grid edges.
 *
 * Perspective: viewer standing on the road, looking at the house.
 * "facing" = the direction the road/front of the house faces.
 *
 *   - back  → label on TOP edge (opposite the road)
 *   - left  → label on LEFT edge (viewer's left)
 *   - right → label on RIGHT edge (viewer's right)
 *   - front → same as facing (the road side, BOTTOM edge)
 *
 * A North-facing house is seen looking south, so East is on the viewer's left;
 * a South-facing house is seen looking north, so West is on the left. Before
 * 14 Oct 2026 these two rows were swapped and the map disagreed with its own
 * compass rose. One table, python/tests/fixtures/compass/f02_facings.json, now
 * drives this, the rose, every drawing and the CAD north arrow
 * (scripts/check-compass-plan.cjs checks it).
 */

const DIRECTION_LABELS: Record<string, { back: string; left: string; right: string }> = {
  North: { back: 'South', left: 'East',  right: 'West'  },
  South: { back: 'North', left: 'West',  right: 'East'  },
  East:  { back: 'West',  left: 'South', right: 'North' },
  West:  { back: 'East',  left: 'North', right: 'South' },
};

/** Clockwise rotation of the map's north arrow from screen-up, for each facing. */
export const NORTH_ROSE_DEGREES: Record<string, number> = { South: 0, East: 90, North: 180, West: 270 };

export function getDirectionLabels(facing: string) {
  return DIRECTION_LABELS[facing] || DIRECTION_LABELS['North'];
}
