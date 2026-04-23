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
 */

const DIRECTION_LABELS: Record<string, { back: string; left: string; right: string }> = {
  North: { back: 'South', left: 'West',  right: 'East'  },
  South: { back: 'North', left: 'East',  right: 'West'  },
  East:  { back: 'West',  left: 'South', right: 'North' },
  West:  { back: 'East',  left: 'North', right: 'South' },
};

export function getDirectionLabels(facing: string) {
  return DIRECTION_LABELS[facing] || DIRECTION_LABELS['North'];
}
