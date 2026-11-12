# First floor over the ground floor (12 Nov 2026)

Maintainer request: the first floor depends on the ground floor, so placing a room upstairs checks what stands
directly below it, and Generate offers **Both floors** only when the first floor is ready. The rules follow how a
G+1 house is built: loads go straight down, wet rooms stack, and the stair rises in one place.

## While placing a room on the first floor

Each region of the room is judged by the ground-floor rooms under it (a whole cell, or the halves of a divided cell
that it overlaps). A **conflict** refuses the placement: it is said and shown on the road, and nothing changes. A
**warning** places the room and says the note after it, also on the road.

| Code | When | Result |
|---|---|---|
| `ff-nothing-below` | Nothing is planned on the ground under the region | Conflict: plan the ground floor first |
| `ff-landing-off-stair` | The 1F Stair Landing on a cell (or half) with no part over the Living Lobby + Staircase or Dining Hall + Staircase, or no staircase yet. Part over the stair is enough: a cell that is Dining \| Stairs below takes it. The refusal names the cell: "on the Mid Right cell (row 3, column 4)" | Conflict |
| `ff-over-stair` | Any other room over the staircase (only the landing or Open to below may be there) | Conflict |
| `ff-over-garden` | A room, passage or terrace over the Lawn / Garden or Backyard (open to the sky) | Conflict |
| `ff-balcony-garden` | A 1F Balcony over the Lawn or Backyard | Warning: columns in the garden |
| `ff-on-columns` | A room over the Outer Lobby / Porch, Verandah or a ground terrace or balcony | Warning: stands on columns (said when placing; the plan's notes give the service's `support` note) |
| `ff-bath-over-icu` | A 1F Bathroom over the Home ICU | Conflict: a leak must never reach the patient |
| `ff-bath-over-dry` | A 1F Bathroom over a kitchen, bedroom, living, drawing or dining room | Warning: sunken, waterproofed floor |
| `ff-balcony-enclosed` | A 1F Balcony closed in on every side: not at the plot edge, not over the porch, verandah or garden, and no empty cell (an open roof), terrace or balcony beside it upstairs | Warning: no open side |
| `void-below` | Open to below not over the living hall, dining or stair hall (drawing room only when open) | Conflict (the rule of 14 Oct, unchanged) |

A balcony or terrace over the porch or verandah is their roof: no note. The ground floor is never judged by these
rules. The same rules refuse and note in Refine: the half picker shows a refused room disabled with its reason and
a noted one with ⚠, and Whole Cell cannot give a cell to a room the rules refuse there. Placing on a divided cell
checks both halves first: neither allowed, it is refused at once (no half chooser); one allowed, the chooser says
which ("Only the right half...").

Simpler after the maintainer's first use (12 Nov 2026): the landing needs only part of its cell over the stair (it
had refused every cell of a map whose stair was half a cell), refusals name the stair's cell, a balcony counts an
open roof, terrace or balcony beside it, and a closed-in balcony is a note, never a refusal.

## Both floors at Generate

**Both floors** opens only when all of these hold; otherwise it is disabled and shows the first reason (and how many
more), the paragraph above it gives the full reason, and the voice says it. **Ground floor only** always opens.

1. The first floor has rooms.
2. The ground floor has a staircase (`ff-no-stair`).
3. The 1F Stair Landing is placed (`ff-no-landing`).
4. Every first-floor room joins the landing through rooms that touch (`ff-cut-off`); Open to below joins nothing.
   The reason says how to fix it: join it with a Passage or another room.
5. No first-floor conflict above, including ones made later by changing the ground floor (for example a living hall
   turned into a garden under a 1F bedroom).

Warnings never close it.

## Where it lives

- Rules: `firstFloorFindings` and `firstFloorBlockers` in `src/utils/compassPlan.ts`; the identical
  `first_floor_findings` in `tools/compass_schema.py`. Both add the rules to the plan's checks (`checkPlan`, `check`)
  for a two-storey plan, one note per room and rule.
- Map: `firstFloorCheck` in `src/utils/compassReducer.ts` (whole cells, halves, both halves, Whole Cell), and
  `src/screens/CompassMapScreen.tsx` (the road note, the half picker, the Generate choice).
- Tests: `python/tests/fixtures/compass/f17_first_floor_rules.json` (15 cases: conflicts read by both
  `scripts/check-compass-plan.cjs` and `python/tests/test_compass_geometry.py`; notes by
  `scripts/check-compass-first-floor.cjs` and `python/tests/test_compass_first_floor.py`), `check-compass-first-floor.cjs`
  (58 checks on the map's functions, in `npm run check:compass`), and `scripts/check-compass-studio-v2.cjs` (the closed
  Both floors, a refused room and a divided cell refused at once, in the browser).
