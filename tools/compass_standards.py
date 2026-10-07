"""Proposed construction constants shared by every Compass output (feet).

One table so the 2D sheet, the 3D cutaway, the exterior and the CAD file can
never disagree about a sill or a storey. Values follow India's Model Building
Bye-Laws 2016 and common residential practice; they are presentation
proposals, not structural or sanction drawings.
"""
from __future__ import annotations

import math

WALL_OUTER = .75          # 9-inch (230 mm) brick exterior wall
WALL_INNER = .5           # 6-inch (150 mm) partition
STOREY = 10.0             # Floor to floor
SLAB = 5 / 12             # 125 mm roof/floor slab
PLINTH = 1.5              # 450 mm plinth (bye-law minimum)
DOOR_HEAD = 7.0           # 2.1 m lintel level
WINDOW_SILL, WINDOW_HEAD = 3.0, 7.0
VENT_SILL, VENT_HEAD = 5.5, 7.0       # Toilet ventilator, 2'0" x 1'6"
CHAJJA_DEPTH, CHAJJA_THICK = 1.5, .25  # 450 mm sunshade over windows
PARAPET, PARAPET_THICK, COPING = 3.25, .375, .25  # 1.0 m parapet, 4.5-inch wall
MUMTY = 7.5               # Headroom cabin over a stair on the roof
STAIR_CUT = 4.0           # Plan cut height: treads above it are shown dashed

MAX_RISE = 7.5 / 12       # Bye-law limit 190 mm; 7.5 inches
RISERS = math.ceil(STOREY / MAX_RISE - 1e-9)  # 16 for a 10 ft storey
RISE = STOREY / RISERS
TREAD = 10 / 12           # 250 mm minimum going
FLIGHT = 3.0              # 0.9 m minimum clear stair width
STAIR_GAP = .25           # Between the two flights of a dog-leg stair
STAIR_TWIN = (2 * FLIGHT + STAIR_GAP, FLIGHT + (RISERS // 2 - 1) * TREAD)  # 6'-3" x 8'-10"

MAIN_DOOR, ROOM_DOOR = 3.5, 3.0
TURNING_CIRCLE = 5.0      # 1500 mm wheelchair turning space (Harmonised Guidelines 2021)


def ft_in(value: float, *, half=True) -> str:
    """Feet and inches to the nearest half inch: 12.5 -> 12'-6", 9.375 -> 9'-4½"."""
    sign = '-' if value < 0 else ''
    step = 2 if half else 1
    total = round(abs(value) * 12 * step) / step
    feet, inches = divmod(total, 12)
    whole = int(inches)
    frac = '½' if inches - whole >= .25 else ''
    return f"{sign}{int(feet)}'-{whole}{frac}\""
