# Furnished model view (plan25d)

- `tools/plan25d.py` draws a floor as a soft architectural model seen from above: textured floors, walls cut at waist height, rounded pastel furniture, soft shadows, road names, a north arrow, a scale bar. CPU only (Cairo + Pillow), offline, byte-identical for the same input. Light and dark themes.
- Run `python tools/plan25d.py tools/samples/plan25d_house_50x40.json -o house.png`. It writes one PNG per floor and a `.hitmap.json` beside each, holding every room's polygon, label box and gaze target in pixels (at least 64 px).
- The input is plan keys in feet, origin top-left, y down; the full list is in the module docstring. `"walls": "auto"` builds walls from the rooms, and openings can be given by a point.
- Compass plans go through `tools/plan25d_adapter.py` (the same rooms, walls, openings, furniture and stair as the other views; road at the bottom). It is the studio's top view (`view: "top"`).
- In the app: Compass studio > **Model look**, beside Plan (and in the full-screen row). Save this view saves it as `...-model-look.png`. The earlier top view and the Outside view were removed on 12 Nov 2026.
- Small images (under 760 px tall, the studio's panel) get slimmer margins and no notes line; labels keep clear of each other and drop their size line when it cannot fit. An upper floor shows the ground below it faded.
- Furniture drawings, one function per type: `tools/plan25d_furniture.py`.
- Budget on the 8 GB laptop: 0.5–0.7 s and about 150 MB per sample floor, 0.3–0.5 s per Compass floor.
- Tests: `python -m unittest tests.test_plan25d` (run from `python/`).
