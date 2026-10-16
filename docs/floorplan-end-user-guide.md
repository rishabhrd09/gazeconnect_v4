# Floor Plan End User Guide (Installed App)

Updated 14 Oct 2026 for the Compass map with divided cells and the new plan studio, and 16 Oct 2026 for rooms in halves, Outside on 8 GB laptops and a faster first plan.

## Place the rooms

1. Open **Design Home**, complete the survey if you like, and open the **Compass Map**.
2. Answer the plot questions: facing, width, depth, plot type, floors, bedrooms and gate. The answer already known (from the survey, or the usual 40 × 60 ft West plot) is marked. **SKIP** keeps it, and says so; a question with no answer yet takes its first option.
3. The map is your plot in 16 cells, with the road at the bottom. Each cell shows its real size, for example 10'-0" × 15'-0".
4. The current room is shown on the road. Select **READY**, then look at a cell to place the room there. Look at it again to take it away. A room may cover several cells next to each other.
5. **NEXT** moves to the next room, and **ROOMS** opens the full list. Choose a room there to place it or change it.
6. **GND / 1F** switches between the ground and first floor. On a single-floor map, **+ ADD 1F** adds a first floor.

Rooms of the same kind are separate rooms when they do not touch: a second bedroom becomes "Bedroom 2".

## Divide a cell (REFINE)

Use this when a cell should hold two things, such as a passage beside a bathroom.

1. Select **REFINE**. It now reads **DONE REFINING**, and the other side buttons rest until you finish.
2. Look at a cell. It opens large, as a **LEFT HALF** and a **RIGHT HALF**, with the road below. Each half shows its room (or Empty) and its size. On the first floor, each half also shows what is below it.
3. Choose a half. The room list opens with **Leave empty** first, then rooms that join a neighbour or fit the half, then rooms that would be narrow there (marked ⚠), and last, greyed out with the reason, rooms that cannot go there (a kitchen already elsewhere, the stair already placed). Select **READY**, then choose a room. READY stays on while you turn the pages.
4. The room is applied, and you are back at the cell. Do the same for the other half, or select **BACK TO MAP**.

Good to know:

- Nothing changes until you choose a room. **BACK** in the room list changes nothing.
- **UNDO** takes back the last change. Dividing a cell and its first room count as one change.
- **WHOLE CELL** joins the halves again. If two rooms share the cell, you choose which keeps it, and the choice says if a room would be removed.
- When the app needs your decision, it asks one short question with two or three large answers. Examples: a room that would be cut in two (the half that joins the rest of a room is marked, and the other half is offered first), or a second room of the same kind.
- A room narrower than it should be is still placed, with a warning: **⚠ NARROW** on the map, the numbers on the half ("Kitchen: 4'-6" clear, needs 4'-11""), and a note in the plan studio. Only a half under 2'-6" clear is refused.
- On 20 ft and 25 ft plots a half cell would be under 2'-6" clear, so cells stay whole. **REFINE** says so on the button and when chosen.
- Anything the map refuses is shown on the road for a few seconds as well as spoken, so it is seen when the voice is off.
- **Open to below** (first floor) makes the living hall underneath double height. It is allowed only over the living hall, dining hall or stair hall.
- While placing rooms (READY on), looking at a divided cell asks which half: "Place Bathroom in: LEFT HALF / RIGHT HALF". Choose the half and the room is placed there; you are back on the map. A half that already holds another room is replaced only after you say yes.
- REFINE ends by itself after 45 quiet seconds on the map. Your changes are kept.

## See the plan (GENERATE PLAN)

Select **GENERATE PLAN**, then **Ground floor only** or **Both floors**. The studio draws your map without changing it:

- **Plan**: the floor plan with walls, doors, windows, the stair and room sizes.
- **Top view**: the floor from above, furnished.
- **Outside**: the house from the street. **Next angle** shows the four corners in turn. The app checks the computer's free memory each time you choose it. If memory is short at that moment, the plan stays on screen, the caption says how much is needed and how much is free, and the button reads **Try again**: close another program and choose it again.
- **Ground floor / First floor**: switches the floor.
- **Plan notes**: what to review, with the most important first. Examples: a room smaller than usual, a room that cannot be reached, or a stair that does not fit.
- **Download plan**: saves files without a dialog in `Documents\GazeConnect Plans\<date>\`. You can save a picture of the current view (PNG), drawing sheets (A3 PDF, all floors), or a CAD drawing (DXF in feet-inches and in millimetres, with a README).

Living hall, dining, kitchen and stair hall are drawn open to each other, without walls between them. The kitchen gets a wall only if the survey asked for a closed kitchen.

## Resume after closing the app

The map saves after every change. When you return, it continues where you left off. **LOAD PREVIOUS SESSION** brings back the map from before your last **Restart Maps**.

Maps made with the earlier version open in the new one automatically. Your old copy is kept untouched. If a map has details saved by the earlier Refine Map, those cells stay locked as before. **REFINE** then offers to convert the map; nothing is deleted. Until you convert, **GENERATE PLAN** offers to open those details in the saved-plan viewer.

## The first start after an update

The first start after an update takes longer, once. Run `setup.bat` and let it finish: it checks the Python packages again and rebuilds the eye tracker helper (about a minute on the 8 GB laptop). Wait for **Setup verified** before starting the app, or it stops with "Setup is needed". The first `start-dev.bat` then rebuilds the interface: on the 8 GB laptop the window appeared after about 20 seconds instead of the usual 7. Later starts skip all of this.

The drawing service starts in the background when you open the Compass map, so the first plan appears without that wait. It never starts with the app, and it leaves after ten quiet minutes.

## Files and limits

Every drawing is a preliminary concept, not a construction drawing. Walls, doors, windows and the stair are proposals. Sizes and checks are estimates to discuss with a licensed architect and engineer. Nothing here is structurally checked or approved.

The DXF files are DXF R2010, not DWG. They open in AutoCAD 2010 and later, DWG TrueView, SketchUp Pro (import) and LibreCAD. Opening in a CAD program does not certify a drawing, and no export establishes that a house meets any building code.
