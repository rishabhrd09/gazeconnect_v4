#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════╗
║  GazeConnect Pro — Architectural Floor Plan Generator v5.0 (FINAL)     ║
║                                                                          ║
║  RENDERING ENGINE: PyCairo (anti-aliased vector graphics)               ║
║  OUTPUT FORMATS: PNG (300dpi), PDF (vector), SVG (scalable), DXF (CAD) ║
║  STYLES: autocad · blueprint · presentation · modern                    ║
║  STANDARDS: IS 962:1989 · ISO 128-20 · BIS SP:46-2003                  ║
║                                                                          ║
║  pip install pycairo ezdxf svgwrite Pillow                              ║
║  python gazeconnect_floorplan_v5.py --sample --style modern             ║
║  python gazeconnect_floorplan_v5.py input.json --all-styles --dxf       ║
╚══════════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations
import cairo, json, math, sys, os, re
from dataclasses import dataclass, field
from pathlib import Path

try: import ezdxf; HAS_DXF=True
except: HAS_DXF=False

# ═══════════════════════  CONSTANTS  ═══════════════════════
SCALE = 22.0           # pixels per foot (at 1x) — larger base for clearer labels/details
HI = 3                 # HiDPI multiplier
PPF = SCALE * HI       # effective pixels/ft
EXT_W = 0.75           # exterior wall thickness (ft) — 230mm
INT_W = 0.375          # interior wall thickness (ft) — 115mm
DOOR_FT = 2.8          # door opening width
WIN_FT = 3.0           # window opening width
MARGIN = 4.2           # margin around plot (ft) - tighter to use more drawing area
TITLE_H = 3.2          # title block height (ft)
LEG_W = 6.8            # legend column width (ft)

# ═══════════════════════  ROOM DATABASE  ═══════════════════════
RDEF = {
    "porch":     dict(d=["S"],     w=[],         h=None,    fur="entry",   c=(129,199,132)),
    "lawn":      dict(d=[],        w=[],         h=None,    fur="tree",    c=(174,213,129)),
    "verandah":  dict(d=["S"],     w=["E"],      h=None,    fur=None,      c=(77,182,172)),
    "backyard":  dict(d=[],        w=[],         h=None,    fur="tree",    c=(102,187,106)),
    "drawing":   dict(d=["S"],     w=["W"],      h=None,    fur="sofa",    c=(126,87,194)),
    "kitchen":   dict(d=["W"],     w=["N"],      h="diag",  fur="counter", c=(255,167,38)),
    "living":    dict(d=["S"],     w=["E"],      h=None,    fur="sofa",    c=(66,165,245)),
    "bathroom":  dict(d=["W"],     w=["N"],      h="diag",  fur="wc",      c=(120,144,156)),
    "staircase": dict(d=["S"],     w=[],         h="stair", fur=None,      c=(141,110,99)),
    # Combined room: keep staircase semantics (hatching/UP arrow) with dining cue.
    "diningStaircase": dict(d=["S"], w=["S"],    h="stair", fur="table",   c=(161,136,127)),
    "dining":    dict(d=["E"],     w=["S"],      h=None,    fur="table",   c=(255,202,40)),
    "commonBath":dict(d=["N"],     w=["E"],      h="diag",  fur="wc",      c=(84,110,122)),
    "icu":       dict(d=["S"],     w=["E","N"],  h=None,    fur="bed",     c=(239,83,80)),
    "balcony":   dict(d=["S"],     w=[],         h=None,    fur=None,      c=(38,166,154)),
    "terrace":   dict(d=[],        w=[],         h=None,    fur=None,      c=(0,150,136)),
    "master":    dict(d=["S"],     w=["E","N"],  h=None,    fur="bed",     c=(92,107,192)),
    "masterBed": dict(d=["S"],     w=["E","N"],  h=None,    fur="bed",     c=(92,107,192)),
    "bedroom":   dict(d=["S"],     w=["E","N"],  h=None,    fur="bed",     c=(121,134,203)),
    "bed2":      dict(d=["W"],     w=["N"],      h=None,    fur="bed",     c=(121,134,203)),
    "bed3":      dict(d=["W"],     w=["E"],      h=None,    fur="bed",     c=(159,168,218)),
    "corridor":  dict(d=[],        w=[],         h=None,    fur=None,      c=(176,190,197)),
    "pooja":     dict(d=["W"],     w=[],         h=None,    fur=None,      c=(255,183,77)),
    "study":     dict(d=["S"],     w=["E"],      h=None,    fur="table",   c=(77,182,172)),
    "ff_master": dict(d=["S"],     w=["E","N"],  h=None,    fur="bed",     c=(57,73,171)),
    "ff_bed2":   dict(d=["W"],     w=["N"],      h=None,    fur="bed",     c=(92,107,192)),
    "ff_living": dict(d=["S"],     w=["E","W"],  h=None,    fur="sofa",    c=(30,136,229)),
    "ff_bathroom":dict(d=["W"],    w=["N"],      h="diag",  fur="wc",      c=(96,125,139)),
}

# ═══════════════════════  STYLE THEMES  ═══════════════════════
def n(r,g,b): return (r/255, g/255, b/255)  # normalize to 0-1

THEMES = {
    "autocad": dict(
        bg=n(0,0,0), wall=n(255,255,255), wallfill=n(255,255,255), inwall=n(180,180,180),
        ralpha=0.0, text=n(255,255,255), text2=n(150,150,150), dim=n(0,255,255),
        grid=n(30,30,30), door=n(0,255,255), win=n(0,200,255), hatch=n(50,50,50),
        fur=n(80,80,80), title=n(255,255,255), accent=n(0,255,255), border=n(255,255,255),
        road=n(0,255,255), cn=n(255,80,80), font="monospace",
    ),
    "blueprint": dict(
        bg=n(18,32,68), wall=n(200,220,245), wallfill=n(160,190,230), inwall=n(120,150,200),
        ralpha=0.12, text=n(220,230,245), text2=n(150,170,200), dim=n(120,215,230),
        grid=n(30,50,95), door=n(80,195,247), win=n(77,208,225), hatch=n(40,60,100),
        fur=n(70,90,130), title=n(240,245,255), accent=n(80,195,247), border=n(90,130,190),
        road=n(80,195,247), cn=n(240,80,80), font="monospace",
    ),
    "presentation": dict(
        bg=n(255,255,255), wall=n(44,62,80), wallfill=n(52,73,94), inwall=n(100,120,140),
        ralpha=0.18, text=n(26,26,46), text2=n(120,130,150), dim=n(198,40,40),
        grid=n(236,239,241), door=n(44,62,80), win=n(21,101,192), hatch=n(190,200,210),
        fur=n(160,170,180), title=n(26,26,46), accent=n(21,101,192), border=n(44,62,80),
        road=n(21,101,192), cn=n(239,83,80), font="sans-serif",
    ),
    "modern": dict(
        bg=n(248,250,252), wall=n(30,41,59), wallfill=n(51,65,85), inwall=n(71,85,105),
        ralpha=0.30, text=n(15,23,42), text2=n(100,116,139), dim=n(220,38,38),
        grid=n(226,232,240), door=n(71,85,105), win=n(2,132,199), hatch=n(200,210,220),
        fur=n(148,163,184), title=n(15,23,42), accent=n(14,165,233), border=n(51,65,85),
        road=n(14,165,233), cn=n(239,68,68), font="sans-serif",
    ),
}

# ═══════════════════════  DATA MODEL  ═══════════════════════
@dataclass
class Rm:
    name:str; rid:str; x1:float=0; y1:float=0; x2:float=0; y2:float=0
    area:float=0; doors:list=field(default_factory=list); windows:list=field(default_factory=list)
    hatch:str=None; fur:str=None; color:tuple=(120,144,156); is_void:bool=False

@dataclass
class Fl:
    w:float=40; d:float=60; facing:str="South"; ptype:str="Middle Plot"
    rooms:list=field(default_factory=list); rows:int=4; cols:int=4; label:str="Ground Floor"
    no_wall_edges:list=field(default_factory=list)  # list of ((x,y),(x,y)) edge segments to skip

_CELL_RE = re.compile(r"r(\d+)_c(\d+)")

def _parse_cell_key(cell_key):
    m = _CELL_RE.fullmatch(str(cell_key).strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))

def _cell_rect(row, col, W, D, rows, cols):
    cw = W / cols
    cd = D / rows
    x1 = (col - 1) * cw
    y1 = (row - 1) * cd
    return {"x1": x1, "y1": y1, "x2": x1 + cw, "y2": y1 + cd, "area": cw * cd}

def _rectangles_from_cells(cells_rc, rows, cols):
    """Greedy exact decomposition of occupied grid cells into non-overlapping rectangles."""
    occ = set(cells_rc)
    rects = []
    while occ:
        r, c = min(occ)
        w = 1
        while (r, c + w) in occ:
            w += 1
        h = 1
        while True:
            nr = r + h
            if nr > rows:
                break
            if all((nr, c + k) in occ for k in range(w)):
                h += 1
            else:
                break
        cells = [(rr, cc) for rr in range(r, r + h) for cc in range(c, c + w)]
        for t in cells:
            occ.discard(t)
        rects.append(cells)
    return rects

def _placement_rects(p, W, D, rows, cols):
    """Return list of non-overlapping rect dicts for a placement using cells/cellRects when available."""
    cells = set()
    for c in p.get("cells", []) or []:
        rc = _parse_cell_key(c)
        if rc:
            cells.add(rc)
    for c in (p.get("cellRects") or {}).keys():
        rc = _parse_cell_key(c)
        if rc:
            cells.add(rc)

    # Fallback to legacy single bounding rect if no cell data is available.
    if not cells:
        c = p.get("coords", {}) or {}
        x1, y1, x2, y2 = c.get("x1", 0), c.get("y1", 0), c.get("x2", 0), c.get("y2", 0)
        if x2 > x1 and y2 > y1:
            return [{"x1": x1, "y1": y1, "x2": x2, "y2": y2, "area": (x2 - x1) * (y2 - y1)}]
        return []

    rect_map = p.get("cellRects") or {}
    parts = []
    for group in _rectangles_from_cells(cells, rows, cols):
        xs1, ys1, xs2, ys2, area = [], [], [], [], 0.0
        for rr, cc in group:
            key = f"r{rr}_c{cc}"
            rc = rect_map.get(key) if isinstance(rect_map, dict) else None
            if not rc:
                rc = _cell_rect(rr, cc, W, D, rows, cols)
            xs1.append(rc["x1"]); ys1.append(rc["y1"])
            xs2.append(rc["x2"]); ys2.append(rc["y2"])
            area += max(0.0, (rc["x2"] - rc["x1"]) * (rc["y2"] - rc["y1"]))
        parts.append({
            "x1": min(xs1), "y1": min(ys1),
            "x2": max(xs2), "y2": max(ys2),
            "area": area,
        })
    # Largest first so primary label/fixtures attach to major block.
    parts.sort(key=lambda t: t["area"], reverse=True)
    return parts

# ═══════════════════════  REFINEMENT PROCESSOR  ═══════════════════════

def _apply_refinements(rooms, refinements, W, D, rows, cols):
    """Process advanced_refinements: splits, custom edges, voids.
    
    Smart algorithm:
    1. Decompose each room into individual cell-level fragments
    2. Apply splits per-cell (replace one cell fragment with two sub-fragments)
    3. Apply void markers per-cell
    4. Group all fragments by roomId
    5. Merge adjacent fragments with same roomId into unified rooms
       (e.g., Drawing halves from r3_c2 and r3_c3 become one Drawing room)
    6. Create Rm objects from merged groups
    """
    if not refinements:
        return rooms, []

    cw, cd = W / cols, D / rows
    no_wall_edges = []
    split_map = {}   # cell_key -> split info
    void_set = set()

    # ── Collect refinement definitions ──
    for s in refinements.get("subCellSplits", []):
        pc = s.get("parentCell")
        if pc:
            split_map[pc] = s

    for v in refinements.get("voidMarkers", []):
        vc = v.get("cell")
        if vc:
            void_set.add(vc)

    for e in refinements.get("customEdges", []):
        if e.get("type") == "no_wall":
            c1, c2 = e.get("cells", [None, None])
            if c1 and c2:
                rc1, rc2 = _parse_cell_key(c1), _parse_cell_key(c2)
                if rc1 and rc2:
                    r1x1, r1y1 = (rc1[1]-1)*cw, (rc1[0]-1)*cd
                    r2x1, r2y1 = (rc2[1]-1)*cw, (rc2[0]-1)*cd
                    if rc1[0] == rc2[0]:  # same row
                        sx = max(r1x1, r2x1)
                        no_wall_edges.append(((sx, r1y1), (sx, r1y1 + cd)))
                    elif rc1[1] == rc2[1]:  # same col
                        sy = max(r1y1, r2y1)
                        no_wall_edges.append(((r1x1, sy), (r1x1 + cw, sy)))

    # ── Step 1: Decompose rooms into cell-level fragments ──
    # A fragment is (roomId, x1, y1, x2, y2, is_void)
    fragments = []
    print(f"[REFINE] split_map keys: {list(split_map.keys())}")
    print(f"[REFINE] void_set: {void_set}")
    print(f"[REFINE] no_wall_edges count: {len(no_wall_edges)}")
    print(f"[REFINE] input rooms: {[(r.name, r.rid, round(r.x1,1), round(r.y1,1), round(r.x2,1), round(r.y2,1)) for r in rooms]}")

    processed_cells = set()

    for rm in rooms:
        if rm.x2 <= rm.x1 or rm.y2 <= rm.y1:
            continue

        # Find which grid cells this room covers
        room_cells = []
        for r in range(1, rows + 1):
            for c in range(1, cols + 1):
                cx1, cy1 = (c - 1) * cw, (r - 1) * cd
                cx2, cy2 = cx1 + cw, cy1 + cd
                # Cell center inside room bounding rect?
                ccx, ccy = (cx1 + cx2) / 2, (cy1 + cy2) / 2
                if rm.x1 - 0.1 <= ccx <= rm.x2 + 0.1 and rm.y1 - 0.1 <= ccy <= rm.y2 + 0.1:
                    room_cells.append((r, c, cx1, cy1, cx2, cy2))

        if not room_cells:
            fragments.append((rm.rid, rm.x1, rm.y1, rm.x2, rm.y2, False))
            continue

        for (r, c, cx1, cy1, cx2, cy2) in room_cells:
            cell_key = f"r{r}_c{c}"
            processed_cells.add(cell_key)

            # Check void
            if cell_key in void_set:
                fragments.append(("void", cx1, cy1, cx2, cy2, True))
                continue

            # Check split
            if cell_key in split_map:
                sinfo = split_map[cell_key]
                direction = sinfo.get("splitDirection", "vertical")
                roomA_id = str(sinfo.get("roomA", rm.rid)).lower()
                roomB_id = str(sinfo.get("roomB", rm.rid)).lower()
                pctA = sinfo.get("roomAPct", 50) / 100.0

                if direction == "vertical":
                    # Vertical split: Left = A (smaller x), Right = B (larger x)
                    split_x = cx1 + cw * pctA
                    fragments.append((roomA_id, cx1, cy1, split_x, cy2, False))
                    fragments.append((roomB_id, split_x, cy1, cx2, cy2, False))
                else:
                    # Horizontal split: 
                    # In the React UI, "Room A" is visually "Top", "Room B" is "Bottom".
                    # In this Python coordinate system, y1 is closer to the Road (Front/Bottom visual), y2 is closer to Back (Top visual).
                    # Therefore, Room A should occupy the segment from split_y to cy2 (Top portion).
                    # Room B should occupy the segment from cy1 to split_y (Bottom portion). 
                    # To respect pctA correctly as percentage from Top, we calculate from cy2 down.
                    split_y = cy2 - (cd * pctA)
                    fragments.append((roomA_id, cx1, split_y, cx2, cy2, False)) # Top portion (Room A)
                    fragments.append((roomB_id, cx1, cy1, cx2, split_y, False)) # Bottom portion (Room B)
                continue

            # Normal cell — keep original room assignment
            fragments.append((rm.rid, cx1, cy1, cx2, cy2, False))

    # ORPHAN SPLITS: If a user placed a split on an empty cell (no base room)
    for cell_key, sinfo in split_map.items():
        if cell_key not in processed_cells:
            # Parse row/col
            try:
                r_str, c_str = cell_key.replace("r","").split("_c")
                r, c = int(r_str), int(c_str)
                cx1, cy1 = (c - 1) * cw, (r - 1) * cd
                cx2, cy2 = cx1 + cw, cy1 + cd
                
                direction = sinfo.get("splitDirection", "vertical")
                roomA_id = str(sinfo.get("roomA", "unknown")).lower()
                roomB_id = str(sinfo.get("roomB", "unknown")).lower()
                pctA = sinfo.get("roomAPct", 50) / 100.0

                if direction == "vertical":
                    split_x = cx1 + cw * pctA
                    fragments.append((roomA_id, cx1, cy1, split_x, cy2, False))
                    fragments.append((roomB_id, split_x, cy1, cx2, cy2, False))
                else:
                    split_y = cy2 - (cd * pctA)
                    fragments.append((roomA_id, cx1, split_y, cx2, cy2, False))
                    fragments.append((roomB_id, cx1, cy1, cx2, split_y, False))
            except Exception as e:
                print(f"[REFINE] Failed to parse orphan split cell {cell_key}: {e}")

    # ORPHAN VOIDS: If user placed a void on an empty cell
    for cell_key in void_set:
        if cell_key not in processed_cells:
            try:
                r_str, c_str = cell_key.replace("r","").split("_c")
                r, c = int(r_str), int(c_str)
                cx1, cy1 = (c - 1) * cw, (r - 1) * cd
                cx2, cy2 = cx1 + cw, cy1 + cd
                fragments.append(("void", cx1, cy1, cx2, cy2, True))
            except Exception as e:
                print(f"[REFINE] Failed to parse orphan void {cell_key}: {e}")

    # ── Step 2: Group fragments by roomId ──
    from collections import defaultdict
    groups = defaultdict(list)
    void_frags = []
    for (rid, x1, y1, x2, y2, is_void) in fragments:
        if is_void:
            void_frags.append((x1, y1, x2, y2))
        else:
            groups[rid].append((x1, y1, x2, y2))

    # ── Step 3: Merge adjacent fragments with same roomId ──
    def _merge_rects(rects):
        """Greedily merge rectangles that share an edge into larger bounding rects."""
        merged = list(rects)
        changed = True
        while changed:
            changed = False
            new_merged = []
            used = set()
            for i in range(len(merged)):
                if i in used:
                    continue
                ax1, ay1, ax2, ay2 = merged[i]
                for j in range(i + 1, len(merged)):
                    if j in used:
                        continue
                    bx1, by1, bx2, by2 = merged[j]
                    # Check if they share a horizontal edge (same x span, y-adjacent)
                    if abs(ax1 - bx1) < 0.1 and abs(ax2 - bx2) < 0.1:
                        if abs(ay2 - by1) < 0.1 or abs(by2 - ay1) < 0.1:
                            ax1 = min(ax1, bx1); ay1 = min(ay1, by1)
                            ax2 = max(ax2, bx2); ay2 = max(ay2, by2)
                            used.add(j)
                            changed = True
                    # Check if they share a vertical edge (same y span, x-adjacent)
                    if abs(ay1 - by1) < 0.1 and abs(ay2 - by2) < 0.1:
                        if abs(ax2 - bx1) < 0.1 or abs(bx2 - ax1) < 0.1:
                            ax1 = min(ax1, bx1); ay1 = min(ay1, by1)
                            ax2 = max(ax2, bx2); ay2 = max(ay2, by2)
                            used.add(j)
                            changed = True
                new_merged.append((ax1, ay1, ax2, ay2))
            merged = new_merged
        return merged

    # ── Step 4: Create Rm objects ──
    new_rooms = []
    print(f"[REFINE] groups: {[(rid, len(rects)) for rid, rects in groups.items()]}")
    for rid, rects in groups.items():
        m = RDEF.get(rid, dict(d=["S"], w=[], h=None, fur=None, c=(120,144,156)))
        merged = _merge_rects(rects)
        # Build display name from RDEF or formatted rid
        display_name = rid.replace("_", " ").title()
        # Try to get a better name from the original rooms
        for orig_rm in rooms:
            if orig_rm.rid == rid and orig_rm.name:
                display_name = orig_rm.name
                break
        for i, (x1, y1, x2, y2) in enumerate(merged):
            area = (x2 - x1) * (y2 - y1)
            new_rooms.append(Rm(
                display_name, rid, x1, y1, x2, y2, area,
                m["d"] if i == 0 else [],
                m["w"] if i == 0 else [],
                m["h"] if i == 0 else None,
                m["fur"] if i == 0 else None,
                m["c"],
            ))
            print(f"[REFINE] room: {display_name} ({rid}) rect=({round(x1,1)},{round(y1,1)},{round(x2,1)},{round(y2,1)}) area={round(area,1)}")

    # Void cells
    for (x1, y1, x2, y2) in void_frags:
        new_rooms.append(Rm("VOID", "void", x1, y1, x2, y2, 0, [], [], None, None, (180,180,180), True))

    print(f"[REFINE] total rooms after refinement: {len(new_rooms)}")
    return new_rooms, no_wall_edges

def parse(data):
    cm=data.get("compass_map",data); pr=cm.get("plot",{}); gr=cm.get("grid_size",{})
    W,D=pr.get("width_ft",40),pr.get("depth_ft",60)
    facing,pt=pr.get("facing","South"),pr.get("type","Middle Plot")
    R,C=gr.get("rows",4),gr.get("cols",4)
    floors=[]
    for fk,lb in [("ground_floor","Ground Floor"),("first_floor","First Floor")]:
        fd=cm.get(fk)
        if not fd and fk=="ground_floor" and "placements" in cm: fd=cm
        if not fd: continue
        rooms=[]
        for p in fd.get("placements",[]):
            rid=p.get("roomId",p.get("room_id",""))
            m=RDEF.get(rid,dict(d=["S"],w=[],h=None,fur=None,c=(120,144,156)))
            name=p.get("room",rid)
            rects=_placement_rects(p,W,D,R,C)
            if rects:
                for i,rc in enumerate(rects):
                    primary = (i == 0)
                    rooms.append(
                        Rm(
                            name if primary else "",
                            rid,
                            rc["x1"], rc["y1"], rc["x2"], rc["y2"],
                            p.get("area_sqft",0) if primary else 0,
                            m["d"] if primary else [],
                            m["w"] if primary else [],
                            m["h"] if primary else None,
                            m["fur"] if primary else None,
                            m["c"],
                        )
                    )
            else:
                c=p.get("coords",{})
                rooms.append(Rm(name,rid,c.get("x1",0),c.get("y1",0),c.get("x2",0),c.get("y2",0),
                               p.get("area_sqft",0),m["d"],m["w"],m["h"],m["fur"],m["c"]))
        floors.append(Fl(W,D,facing,pt,rooms,R,C,lb))

    # Apply refinements
    adv = cm.get("advanced_refinements", {})
    if adv:
        for fl in floors:
            fl.rooms, fl.no_wall_edges = _apply_refinements(fl.rooms, adv, W, D, R, C)

    return floors or [Fl(W,D,facing,pt)]

# ═══════════════════════  CAIRO RENDERER  ═══════════════════════
class CairoFloorPlan:
    """Production-grade floor plan renderer using PyCairo vector engine."""

    def __init__(self, fl:Fl, style:str="modern"):
        self.fl=fl; self.T=THEMES.get(style,THEMES["modern"]); self.sn=style
        self.pw=fl.w*PPF; self.ph=fl.d*PPF
        self.mx=MARGIN*PPF; self.ty=TITLE_H*PPF; self.lw=LEG_W*PPF
        self.cw=int(self.pw+2*self.mx+self.lw)
        self.ch=int(self.ph+2*self.mx+self.ty)
        self.ox=self.mx; self.oy=self.mx  # plot origin offset

    def ft(self, x, y):
        """Feet to canvas pixels. Y flipped (0=bottom in arch, 0=top in cairo)."""
        return self.ox+x*PPF, self.oy+(self.fl.d-y)*PPF

    def ftl(self, f): return f*PPF

    def sc(self, ctx, r, g, b, a=1.0): ctx.set_source_rgba(r, g, b, a)

    def render_png(self, path):
        surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, self.cw, self.ch)
        ctx = cairo.Context(surface)
        ctx.set_antialias(cairo.ANTIALIAS_BEST)
        self._render_all(ctx)
        surface.write_to_png(str(path))
        return self.cw, self.ch

    def render_pdf(self, path):
        surface = cairo.PDFSurface(str(path), self.cw, self.ch)
        ctx = cairo.Context(surface)
        self._render_all(ctx)
        surface.finish()

    def render_svg(self, path):
        surface = cairo.SVGSurface(str(path), self.cw, self.ch)
        ctx = cairo.Context(surface)
        self._render_all(ctx)
        surface.finish()

    def _render_all(self, ctx):
        self._bg(ctx)
        self._grid(ctx)
        self._room_fills(ctx)
        self._hatching(ctx)
        self._furniture(ctx)
        self._int_walls(ctx)
        self._doors(ctx)
        self._windows(ctx)
        self._ext_walls(ctx)
        self._room_labels(ctx)
        self._room_dimensions(ctx)
        self._dimensions(ctx)
        self._road(ctx)
        self._compass(ctx)
        self._scale_bar(ctx)
        self._legend(ctx)
        self._titleblock(ctx)
        self._borderframe(ctx)

    # ──── Background ────
    def _bg(self, ctx):
        self.sc(ctx, *self.T["bg"])
        ctx.rectangle(0, 0, self.cw, self.ch); ctx.fill()

    # ──── Grid ────
    def _grid(self, ctx):
        cw=self.fl.w/self.fl.cols; cd=self.fl.d/self.fl.rows
        self.sc(ctx, *self.T["grid"]); ctx.set_line_width(0.8)
        for c in range(self.fl.cols+1):
            x,y1=self.ft(c*cw,0); _,y2=self.ft(c*cw,self.fl.d)
            ctx.move_to(x,y1); ctx.line_to(x,y2); ctx.stroke()
        for r in range(self.fl.rows+1):
            x1,y=self.ft(0,r*cd); x2,_=self.ft(self.fl.w,r*cd)
            ctx.move_to(x1,y); ctx.line_to(x2,y); ctx.stroke()

    # ──── Room Fills ────
    def _room_fills(self, ctx):
        a=self.T["ralpha"]
        if a<=0: return
        for r in self.fl.rooms:
            if r.x2<=r.x1 or r.y2<=r.y1: continue
            tl=self.ft(r.x1,r.y2); br=self.ft(r.x2,r.y1)
            if getattr(r, 'is_void', False):
                # Void: dashed outline, no fill, "VOID" label
                ctx.set_source_rgba(0.5, 0.5, 0.5, 0.3)
                ctx.set_dash([8, 4])
                ctx.set_line_width(2.0)
                ctx.rectangle(tl[0]+2, tl[1]+2, br[0]-tl[0]-4, br[1]-tl[1]-4)
                ctx.stroke()
                ctx.set_dash([])
                # VOID label
                ctx.set_font_size(self.ftl(0.5))
                ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
                self.sc(ctx, *self.T["text2"])
                te = ctx.text_extents("VOID")
                cx = (tl[0]+br[0])/2; cy = (tl[1]+br[1])/2
                ctx.move_to(cx - te.width/2, cy + te.height/2)
                ctx.show_text("VOID")
            else:
                ctx.set_source_rgba(r.color[0]/255, r.color[1]/255, r.color[2]/255, a)
                ctx.rectangle(tl[0], tl[1], br[0]-tl[0], br[1]-tl[1]); ctx.fill()

    # ──── Interior Walls (filled rectangles) ────
    def _int_walls(self, ctx):
        wt=max(2.0, self.ftl(INT_W))
        self.sc(ctx, *self.T["inwall"])
        open_spaces = {"lawn", "porch", "verandah", "backyard", "balcony", "terrace", "ff_balcony", "ff_terrace", "garden"}
        for r in self.fl.rooms:
            if r.x2<=r.x1 or r.y2<=r.y1: continue
            if getattr(r, 'is_void', False): continue  # skip void cells
            if r.rid in open_spaces: continue # skip open spaces
            tl=self.ft(r.x1,r.y2); br=self.ft(r.x2,r.y1)
            x1,y1,x2,y2=tl[0],tl[1],br[0],br[1]
            hw=wt/2

            # Check if each edge should be skipped due to no_wall
            def _edge_skip(ex1, ey1, ex2, ey2):
                for (e1, e2) in self.fl.no_wall_edges:
                    # Compare in plot coordinates (before ft transform)
                    if (abs(ex1 - e1[0]) < 0.1 and abs(ey1 - e1[1]) < 0.1 and
                        abs(ex2 - e2[0]) < 0.1 and abs(ey2 - e2[1]) < 0.1):
                        return True
                    if (abs(ex1 - e2[0]) < 0.1 and abs(ey1 - e2[1]) < 0.1 and
                        abs(ex2 - e1[0]) < 0.1 and abs(ey2 - e1[1]) < 0.1):
                        return True
                return False

            # Top wall (r.y2 in plot coords)
            if not _edge_skip(r.x1, r.y2, r.x2, r.y2):
                ctx.rectangle(x1-hw, y1-hw, x2-x1+wt, wt); ctx.fill()
            # Bottom wall (r.y1 in plot coords)
            if not _edge_skip(r.x1, r.y1, r.x2, r.y1):
                ctx.rectangle(x1-hw, y2-hw, x2-x1+wt, wt); ctx.fill()
            # Left wall (r.x1)
            if not _edge_skip(r.x1, r.y1, r.x1, r.y2):
                ctx.rectangle(x1-hw, y1, wt, y2-y1); ctx.fill()
            # Right wall (r.x2)
            if not _edge_skip(r.x2, r.y1, r.x2, r.y2):
                ctx.rectangle(x2-hw, y1, wt, y2-y1); ctx.fill()

    # ──── Exterior Walls ────
    def _ext_walls(self, ctx):
        wt=max(4.0, self.ftl(EXT_W))
        tl=self.ft(0,self.fl.d); br=self.ft(self.fl.w,0)
        x1,y1,x2,y2=tl[0],tl[1],br[0],br[1]

        # Filled bands
        self.sc(ctx, *self.T["wallfill"])
        ctx.rectangle(x1-wt, y1-wt, x2-x1+2*wt, wt); ctx.fill()  # top
        ctx.rectangle(x1-wt, y2, x2-x1+2*wt, wt); ctx.fill()      # bottom
        ctx.rectangle(x1-wt, y1, wt, y2-y1); ctx.fill()             # left
        ctx.rectangle(x2, y1, wt, y2-y1); ctx.fill()                # right

        # Outer edge
        self.sc(ctx, *self.T["wall"]); ctx.set_line_width(2.5)
        ctx.rectangle(x1-wt, y1-wt, x2-x1+2*wt, y2-y1+2*wt); ctx.stroke()
        # Inner edge (dashed)
        ctx.set_line_width(0.8); ctx.set_dash([6,3])
        ctx.rectangle(x1, y1, x2-x1, y2-y1); ctx.stroke()
        ctx.set_dash([])

    # ──── Doors ────
    def _doors(self, ctx):
        for r in self.fl.rooms:
            if r.x2<=r.x1 or r.y2<=r.y1: continue
            for wall in r.doors:
                self._draw_door(ctx, r, wall)

    def _draw_door(self, ctx, r, wall):
        cx=(r.x1+r.x2)/2; cy=(r.y1+r.y2)/2
        hd=DOOR_FT/2; dp=self.ftl(DOOR_FT)
        wt=max(4, self.ftl(INT_W))+4

        # Clear wall gap (draw bg rect)
        self.sc(ctx, *self.T["bg"])
        if wall=="S":
            g=self.ft(cx-hd, r.y1); g2=self.ft(cx+hd, r.y1)
            ctx.rectangle(g[0], g[1]-wt, g2[0]-g[0], wt*2); ctx.fill()
        elif wall=="N":
            g=self.ft(cx-hd, r.y2); g2=self.ft(cx+hd, r.y2)
            ctx.rectangle(g[0], g[1]-wt, g2[0]-g[0], wt*2); ctx.fill()
        elif wall=="W":
            g=self.ft(r.x1, cy+hd); g2=self.ft(r.x1, cy-hd)
            ctx.rectangle(g[0]-wt, g[1], wt*2, g2[1]-g[1]); ctx.fill()
        elif wall=="E":
            g=self.ft(r.x2, cy+hd); g2=self.ft(r.x2, cy-hd)
            ctx.rectangle(g[0]-wt, g[1], wt*2, g2[1]-g[1]); ctx.fill()

        # Draw door leaf + arc
        self.sc(ctx, *self.T["door"]); ctx.set_line_width(1.5)
        if wall=="S":
            p=self.ft(cx-hd, r.y1)
            # Leaf (vertical line going into room)
            ctx.move_to(p[0], p[1]); ctx.line_to(p[0], p[1]-dp); ctx.stroke()
            # Arc swing
            ctx.set_line_width(0.8); ctx.set_dash([4,3])
            ctx.arc(p[0], p[1], dp, -math.pi/2, 0); ctx.stroke()
            ctx.set_dash([])
        elif wall=="N":
            p=self.ft(cx+hd, r.y2)
            ctx.move_to(p[0], p[1]); ctx.line_to(p[0], p[1]+dp); ctx.stroke()
            ctx.set_line_width(0.8); ctx.set_dash([4,3])
            ctx.arc(p[0], p[1], dp, math.pi/2, math.pi); ctx.stroke()
            ctx.set_dash([])
        elif wall=="W":
            p=self.ft(r.x1, cy+hd)
            ctx.move_to(p[0], p[1]); ctx.line_to(p[0]+dp, p[1]); ctx.stroke()
            ctx.set_line_width(0.8); ctx.set_dash([4,3])
            ctx.arc(p[0], p[1], dp, -math.pi/2, 0); ctx.stroke()
            ctx.set_dash([])
        elif wall=="E":
            p=self.ft(r.x2, cy-hd)
            ctx.move_to(p[0], p[1]); ctx.line_to(p[0]-dp, p[1]); ctx.stroke()
            ctx.set_line_width(0.8); ctx.set_dash([4,3])
            ctx.arc(p[0], p[1], dp, math.pi/2, math.pi); ctx.stroke()
            ctx.set_dash([])

    # ──── Windows ────
    def _windows(self, ctx):
        for r in self.fl.rooms:
            if r.x2<=r.x1 or r.y2<=r.y1: continue
            for wall in r.windows:
                self._draw_win(ctx, r, wall)

    def _draw_win(self, ctx, r, wall):
        cx=(r.x1+r.x2)/2; cy=(r.y1+r.y2)/2
        hw=WIN_FT/2; gap=self.ftl(0.12)
        wt=max(4, self.ftl(INT_W))+4

        # Clear gap
        self.sc(ctx, *self.T["bg"])
        if wall in ("S","N"):
            wy=r.y1 if wall=="S" else r.y2
            g=self.ft(cx-hw, wy); g2=self.ft(cx+hw, wy)
            ctx.rectangle(g[0], g[1]-wt, g2[0]-g[0], wt*2); ctx.fill()
        else:
            wx=r.x1 if wall=="W" else r.x2
            g=self.ft(wx, cy+hw); g2=self.ft(wx, cy-hw)
            ctx.rectangle(g[0]-wt, g[1], wt*2, g2[1]-g[1]); ctx.fill()

        # Draw 3 parallel lines
        self.sc(ctx, *self.T["win"]); ctx.set_line_width(2.0)
        if wall in ("S","N"):
            wy=r.y1 if wall=="S" else r.y2
            p1=self.ft(cx-hw, wy); p2=self.ft(cx+hw, wy)
            for off in [-gap, 0, gap]:
                ctx.move_to(p1[0], p1[1]+off); ctx.line_to(p2[0], p1[1]+off); ctx.stroke()
        else:
            wx=r.x1 if wall=="W" else r.x2
            p1=self.ft(wx, cy+hw); p2=self.ft(wx, cy-hw)
            for off in [-gap, 0, gap]:
                ctx.move_to(p1[0]+off, p1[1]); ctx.line_to(p1[0]+off, p2[1]); ctx.stroke()

    # ──── Hatching ────
    def _hatching(self, ctx):
        for r in self.fl.rooms:
            if not r.hatch or r.x2<=r.x1: continue
            tl=self.ft(r.x1,r.y2); br=self.ft(r.x2,r.y1)
            x1,y1,x2,y2=tl[0]+4,tl[1]+4,br[0]-4,br[1]-4
            self.sc(ctx, *self.T["hatch"]); ctx.set_line_width(0.6)

            if r.hatch=="diag":
                sp=self.ftl(0.9)
                ctx.save(); ctx.rectangle(x1,y1,x2-x1,y2-y1); ctx.clip()
                total=int((x2-x1)+(y2-y1))
                for i in range(0, total+1, int(sp)):
                    ctx.move_to(x1+i, y1); ctx.line_to(x1, y1+i); ctx.stroke()
                ctx.restore()

            elif r.hatch=="stair":
                n=max(5, int((y2-y1)/self.ftl(1.1)))
                step=(y2-y1)/n; pad=self.ftl(0.4)
                for i in range(n+1):
                    sy=y1+i*step
                    ctx.move_to(x1+pad, sy); ctx.line_to(x2-pad, sy); ctx.stroke()
                # UP arrow
                mx=(x1+x2)/2; ay1=y2-pad*2; ay2=y1+pad*3
                self.sc(ctx, *self.T["text2"]); ctx.set_line_width(2)
                ctx.move_to(mx, ay1); ctx.line_to(mx, ay2); ctx.stroke()
                # arrowhead
                ctx.move_to(mx, ay2); ctx.line_to(mx-5, ay2+10); ctx.line_to(mx+5, ay2+10)
                ctx.close_path(); ctx.fill()
                # "UP" text
                ctx.set_font_size(self.ftl(0.35))
                ctx.move_to(mx-8, ay1+self.ftl(0.5)); ctx.show_text("UP")

    # ──── Furniture / Fixtures ────
    def _furniture(self, ctx):
        self.sc(ctx, *self.T["fur"]); ctx.set_line_width(1.0)
        for r in self.fl.rooms:
            if not r.fur or r.x2<=r.x1: continue
            tl=self.ft(r.x1,r.y2); br=self.ft(r.x2,r.y1)
            x1,y1,x2,y2=tl[0],tl[1],br[0],br[1]
            cx,cy=(x1+x2)/2,(y1+y2)/2; rw,rh=x2-x1,y2-y1

            if r.fur=="bed":
                bw,bh = (3.0, 6.3) if r.area < 100 else (4.5, 6.3) if r.area < 150 else (5.0, 6.7)
                bw,bh = self.ftl(bw), self.ftl(bh)
                bx,by = cx-bw/2, cy-bh/2
                # Ensure it doesn't overflow small rooms
                bw = min(bw, x2-x1 - self.ftl(1))
                bh = min(bh, y2-y1 - self.ftl(1))
                ctx.rectangle(bx,by,bw,bh); ctx.stroke()
                ctx.rectangle(bx+3,by+3,bw-6,bh*0.16); ctx.stroke()  # pillow

            elif r.fur=="sofa":
                # 3-seater sofa: 7.0' x 3.0'
                sw,sh = self.ftl(7.0), self.ftl(3.0)
                sw = min(sw, x2-x1 - self.ftl(2))
                sx,sy = cx-sw/2, y2-sh - self.ftl(1.0)
                ctx.rectangle(sx,sy,sw,sh); ctx.stroke()
                # back
                ctx.rectangle(sx+2,sy+2,sw-4,sh*0.35); ctx.stroke()
                # armrests
                ctx.rectangle(sx,sy,sh*0.3,sh); ctx.stroke()
                ctx.rectangle(sx+sw-sh*0.3,sy,sh*0.3,sh); ctx.stroke()

            elif r.fur=="wc":
                # Toilet 1.4' x 2.5'
                tw,th = self.ftl(1.4), self.ftl(2.5)
                tx,ty = x2-tw - self.ftl(1.0), y2-th - self.ftl(0.5)
                # Tank
                ctx.rectangle(tx, ty, tw, th*0.3); ctx.stroke()
                # Bowl (ellipse)
                ctx.save(); ctx.translate(tx+tw/2, ty+th*0.65); ctx.scale(tw/2, th*0.35)
                ctx.arc(0,0,1,0,2*math.pi); ctx.restore(); ctx.stroke()
                # Sink 1.5' x 1.5'
                sw,sh = self.ftl(1.5), self.ftl(1.5)
                sx,sy = x1 + self.ftl(1.0), y1 + self.ftl(0.5)
                ctx.rectangle(sx,sy,sw,sh); ctx.stroke()
                ctx.save(); ctx.translate(sx+sw/2, sy+sh/2); ctx.scale(sw*0.3, sh*0.2)
                ctx.arc(0,0,1,0,2*math.pi); ctx.restore(); ctx.stroke()

            elif r.fur=="table":
                tw,th = self.ftl(5.5), self.ftl(3.0)  # 6-seater
                tw = min(tw, x2-x1 - self.ftl(3))
                tx,ty = cx-tw/2, cy-th/2
                ctx.rectangle(tx,ty,tw,th); ctx.stroke()
                # 6 chairs (3 on each long side)
                cs = self.ftl(1.5)
                spacing = (tw - 3*cs) / 4
                for i in range(3):
                    c_x = tx + spacing + i*(cs+spacing)
                    ctx.rectangle(c_x, ty - cs - self.ftl(0.2), cs, cs); ctx.stroke()
                    ctx.rectangle(c_x, ty + th + self.ftl(0.2), cs, cs); ctx.stroke()

            elif r.fur=="counter":
                cw_ = self.ftl(2.0)
                ctx.rectangle(x1+5, y1+5, cw_, y2-y1-10); ctx.stroke()  # L vertical
                ctx.rectangle(x1+5, y1+5, x2-x1-10, cw_); ctx.stroke()  # L horizontal
                # Sink on counter
                ctx.save(); ctx.translate(x1+5+cw_/2, cy); ctx.scale(cw_*0.3, cw_*0.4)
                ctx.arc(0,0,1,0,2*math.pi); ctx.restore(); ctx.stroke()
                # Hob (3 circles)
                hx = x1+5+cw_ + self.ftl(1.0)
                hy = y1+5+cw_/2
                for off in [-self.ftl(0.8), 0, self.ftl(0.8)]:
                    ctx.arc(hx+off, hy, self.ftl(0.3), 0, 2*math.pi); ctx.stroke()

            elif r.fur=="tree":
                tr=min(rw,rh)*0.12
                ctx.set_dash([2,2])
                ctx.arc(cx,cy,tr,0,2*math.pi); ctx.stroke()
                ctx.set_dash([])

            elif r.fur=="entry":
                ctx.set_line_width(2); aw=rw*0.3
                ctx.move_to(cx-aw/2, y2-rh*0.15); ctx.line_to(cx+aw/2, y2-rh*0.15); ctx.stroke()
                ctx.move_to(cx, y2-rh*0.15); ctx.line_to(cx, y2-rh*0.35); ctx.stroke()
                ctx.move_to(cx, y2-rh*0.35)
                ctx.line_to(cx-6, y2-rh*0.35+10); ctx.line_to(cx+6, y2-rh*0.35+10)
                ctx.close_path(); ctx.fill()
                ctx.set_line_width(1)

    # ──── Room Labels ────
    def _room_labels(self, ctx):
        """Smart room labels: one label per room, centered, adaptive font, no overflow.

        Rules:
        - For "/" compound names (e.g. "Outer Lobby / Porch") pick the SHORTEST
          meaningful segment → "Porch"
        - For "+" compounds keep the first part → "Kitchen"
        - Font shrinks from 0.58ft down to 0.34ft to fit room width
        - Narrow-AND-square cells (< 3.5ft wide, not tall enough to rotate) are
          skipped — colour + legend identifies them
        - Narrow-AND-tall cells get text rotated 90° (architectural convention)
        - Wide cells with 2+ word labels try two-line centred layout first
        - Hard clip to room rect as final safety net
        """
        import math as _math

        VERT_W_FT = 3.5   # ft — below this, attempt vertical rotation
        MIN_W_FT  = 1.2   # ft — below this, always skip
        FONT_MAX  = 0.58  # ft
        FONT_MIN  = 0.34  # ft — minimum legible; skip if can't fit
        STEP      = 0.04  # ft
        _TRIVIAL  = {"open", "area", "open area", "zone", "unit"}

        for r in self.fl.rooms:
            if r.x2 <= r.x1 or r.y2 <= r.y1 or not r.name:
                continue
            if getattr(r, 'is_void', False):
                continue

            room_w = r.x2 - r.x1
            room_h = r.y2 - r.y1
            if room_w < MIN_W_FT:
                continue

            room_w_px = room_w * PPF
            room_h_px = room_h * PPF
            ctr       = self.ft((r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2)

            # ── Smart short label ──
            raw = r.name
            if "/" in raw:
                segs = [s.strip() for s in raw.split("/") if s.strip()]
                good = [s for s in segs if s.lower() not in _TRIVIAL and len(s) >= 3]
                label = min(good, key=len) if good else segs[-1]
            elif "+" in raw:
                label = raw.split("+")[0].strip()
            else:
                label = raw
            words = label.split()
            if len(words) > 3:
                label = " ".join(words[:3])

            # ── Decide orientation ──
            use_vertical = room_w < VERT_W_FT and room_h > room_w * 1.2
            # Skip narrow-and-square rooms (tiny split cells): colour+legend covers them
            if room_w < VERT_W_FT and not use_vertical:
                continue

            avail_px = (room_h_px - 10) if use_vertical else (room_w_px - 8)

            # ── Clip to room rect ──
            tl = self.ft(r.x1, r.y2)
            br = self.ft(r.x2, r.y1)
            ctx.save()
            ctx.rectangle(tl[0] + 2, tl[1] + 2, br[0] - tl[0] - 4, br[1] - tl[1] - 4)
            ctx.clip()

            ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)

            # ── Adaptive font ──
            chosen_fs = None
            fs = FONT_MAX
            while fs >= FONT_MIN - 0.001:
                ctx.set_font_size(self.ftl(fs))
                te = ctx.text_extents(label)
                if te.width <= avail_px:
                    chosen_fs = fs
                    break
                fs -= STEP

            if chosen_fs is None:
                ctx.restore()
                continue   # can't fit even at min font — skip

            ctx.set_font_size(self.ftl(chosen_fs))
            te = ctx.text_extents(label)
            self.sc(ctx, *self.T["text"])

            if use_vertical:
                # Rotate CCW 90°
                ctx.save()
                ctx.translate(ctr[0], ctr[1])
                ctx.rotate(-_math.pi / 2)
                ctx.move_to(-te.width / 2, te.height / 2)
                ctx.show_text(label)
                # area sub-label in rotated space
                if r.area and room_w_px > self.ftl(0.9):
                    sub_fs = min(chosen_fs * 0.65, 0.32)
                    ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
                    ctx.set_font_size(self.ftl(sub_fs))
                    albl = f"{r.area:.1f} sq.ft"
                    te2 = ctx.text_extents(albl)
                    if te2.width <= avail_px:
                        self.sc(ctx, *self.T["text2"])
                        ctx.move_to(-te2.width / 2, te.height / 2 + self.ftl(sub_fs + 0.10))
                        ctx.show_text(albl)
                ctx.restore()
            else:
                # Horizontal — try 2-line first when room is tall and label has 2+ words
                label_words = label.split()
                use_two_lines = (
                    len(label_words) >= 2
                    and room_h_px > self.ftl(1.6)
                    and chosen_fs < FONT_MAX - STEP
                )
                if use_two_lines:
                    mid = (len(label_words) + 1) // 2
                    line1 = " ".join(label_words[:mid])
                    line2 = " ".join(label_words[mid:])
                    two_fs = FONT_MAX
                    while two_fs >= FONT_MIN - 0.001:
                        ctx.set_font_size(self.ftl(two_fs))
                        te1  = ctx.text_extents(line1)
                        te2b = ctx.text_extents(line2)
                        if max(te1.width, te2b.width) <= room_w_px - 8:
                            break
                        two_fs -= STEP
                    if two_fs >= FONT_MIN:
                        ctx.set_font_size(self.ftl(two_fs))
                        te1  = ctx.text_extents(line1)
                        te2b = ctx.text_extents(line2)
                        gap  = self.ftl(two_fs * 0.25)
                        total_h = te1.height + gap + te2b.height
                        y0 = ctr[1] - total_h / 2 + te1.height
                        self.sc(ctx, *self.T["text"])
                        ctx.move_to(ctr[0] - te1.width / 2, y0)
                        ctx.show_text(line1)
                        ctx.move_to(ctr[0] - te2b.width / 2, y0 + te1.height + gap)
                        ctx.show_text(line2)
                        # area sub-label
                        if r.area and room_h_px > self.ftl(2.0):
                            sub_fs = min(two_fs * 0.65, 0.36)
                            ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
                            ctx.set_font_size(self.ftl(sub_fs))
                            albl = f"{r.area:.1f} sq.ft"
                            tea = ctx.text_extents(albl)
                            if tea.width <= room_w_px - 8:
                                self.sc(ctx, *self.T["text2"])
                                ctx.move_to(ctr[0] - tea.width / 2,
                                            y0 + te1.height + gap + te2b.height + self.ftl(sub_fs + 0.06))
                                ctx.show_text(albl)
                        ctx.restore()
                        continue

                # Single-line horizontal fallback
                ctx.set_font_size(self.ftl(chosen_fs))
                te = ctx.text_extents(label)
                self.sc(ctx, *self.T["text"])
                ctx.move_to(ctr[0] - te.width / 2, ctr[1] + te.height / 2 - self.ftl(0.10))
                ctx.show_text(label)
                # area sub-label
                if r.area and room_h_px > self.ftl(1.1):
                    sub_fs = min(chosen_fs * 0.68, 0.38)
                    ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
                    ctx.set_font_size(self.ftl(sub_fs))
                    albl = f"{r.area:.1f} sq.ft"
                    te2 = ctx.text_extents(albl)
                    if te2.width <= room_w_px - 8:
                        self.sc(ctx, *self.T["text2"])
                        ctx.move_to(ctr[0] - te2.width / 2,
                                    ctr[1] + te.height / 2 + self.ftl(sub_fs + 0.08))
                        ctx.show_text(albl)

            ctx.restore()   # releases clip



    # ──── Room Dimensions ────
    def _room_dimensions(self, ctx):
        """Draw W × D dimensions inside each room."""
        for r in self.fl.rooms:
            if r.x2 <= r.x1 or not r.name: continue
            rw = r.x2 - r.x1
            rd = r.y2 - r.y1
            if rw < 4 or rd < 4: continue  # too small to annotate

            tl = self.ft(r.x1, r.y2)
            br = self.ft(r.x2, r.y1)
            cx = (tl[0] + br[0]) / 2

            label_w = f"{rw:.0f}'"
            label_d = f"{rd:.0f}'"

            self.sc(ctx, *self.T["dim"])
            ctx.set_font_size(self.ftl(0.30))
            ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)

            te = ctx.text_extents(f"{label_w} × {label_d}")
            ctx.move_to(cx - te.width/2, br[1] - self.ftl(0.25))
            ctx.show_text(f"{label_w} × {label_d}")

    # ──── Dimension Lines ────
    def _dimensions(self, ctx):
        self.sc(ctx, *self.T["dim"]); ctx.set_line_width(1.0)
        pw,pd=self.fl.w,self.fl.d; off=self.ftl(2.8); tick=self.ftl(0.4)

        # Bottom (width)
        p1=self.ft(0,0); p2=self.ft(pw,0)
        dy=p1[1]+off
        ctx.move_to(p1[0],dy); ctx.line_to(p2[0],dy); ctx.stroke()
        # Ticks
        for px in [p1[0],p2[0]]:
            ctx.move_to(px,dy-tick); ctx.line_to(px,dy+tick); ctx.stroke()
        # Extension lines
        ctx.set_line_width(0.5)
        ctx.move_to(p1[0],p1[1]+2); ctx.line_to(p1[0],dy+tick); ctx.stroke()
        ctx.move_to(p2[0],p2[1]+2); ctx.line_to(p2[0],dy+tick); ctx.stroke()
        ctx.set_line_width(1.0)

        label=f"{pw:.0f}'  ({pw*0.3048:.1f}m)"
        ctx.set_font_size(self.ftl(0.40))
        ctx.select_font_face("monospace", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        te=ctx.text_extents(label)
        ctx.move_to((p1[0]+p2[0])/2-te.width/2, dy+tick+te.height+4)
        ctx.show_text(label)

        # Cell ticks along bottom
        cw=pw/self.fl.cols; ctx.set_font_size(self.ftl(0.31))
        for c in range(self.fl.cols):
            mp=self.ft(c*cw+cw/2, 0)
            t=f"{cw:.0f}'"
            te=ctx.text_extents(t)
            self.sc(ctx, *self.T["dim"], 0.5)
            ctx.move_to(mp[0]-te.width/2, dy-tick-2)
            ctx.show_text(t)

        # Left (depth) — vertical
        self.sc(ctx, *self.T["dim"]); ctx.set_line_width(1.0)
        p1=self.ft(0,0); p2=self.ft(0,pd)
        dx=p1[0]-off
        ctx.move_to(dx,p1[1]); ctx.line_to(dx,p2[1]); ctx.stroke()
        for py in [p1[1],p2[1]]:
            ctx.move_to(dx-tick,py); ctx.line_to(dx+tick,py); ctx.stroke()
        ctx.set_line_width(0.5)
        ctx.move_to(p1[0]-2,p1[1]); ctx.line_to(dx-tick,p1[1]); ctx.stroke()
        ctx.move_to(p2[0]-2,p2[1]); ctx.line_to(dx-tick,p2[1]); ctx.stroke()

        label=f"{pd:.0f}'  ({pd*0.3048:.1f}m)"
        ctx.set_font_size(self.ftl(0.40))
        ctx.select_font_face("monospace", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        te=ctx.text_extents(label)
        ctx.save()
        ctx.move_to(dx-tick-te.height-6, (p1[1]+p2[1])/2+te.width/2)
        ctx.rotate(-math.pi/2)
        ctx.show_text(label)
        ctx.restore()

    # ──── Road ────
    def _road(self, ctx):
        self.sc(ctx, *self.T["road"]); ctx.set_line_width(2.0)
        p1=self.ft(0,0); p2=self.ft(self.fl.w,0)
        ry=p1[1]+self.ftl(1.2)
        # Dashed double line
        ctx.set_dash([self.ftl(1.2), self.ftl(0.6)])
        for off in [0, self.ftl(0.4)]:
            ctx.move_to(p1[0],ry+off); ctx.line_to(p2[0],ry+off); ctx.stroke()
        ctx.set_dash([])
        # Label
        ctx.set_font_size(self.ftl(0.42))
        label=f"▬▬  ROAD ({self.fl.facing} Facing) — {self.fl.w:.0f} ft  ▬▬"
        te=ctx.text_extents(label)
        ctx.move_to((p1[0]+p2[0])/2-te.width/2, ry+self.ftl(1.0))
        ctx.show_text(label)

    # ──── Compass Rose & North Arrow ────
    def _compass(self, ctx):
        cx_ft=self.fl.w+MARGIN*0.4+5; cy_ft=self.fl.d+MARGIN*0.25
        c=self.ft(cx_ft,cy_ft); cx,cy=c
        r=self.ftl(1.8)

        # North arrow (Filled)
        rot_map={"North":180,"South":0,"East":90,"West":270}
        rot=rot_map.get(self.fl.facing,0)
        
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(-math.radians(rot))
        
        # Draw half filled
        self.sc(ctx, *self.T["cn"])
        ctx.move_to(0, -r*0.8)
        ctx.line_to(r*0.3, r*0.2)
        ctx.line_to(0, 0)
        ctx.close_path()
        ctx.fill()
        
        # Draw other half unfilled/text color
        self.sc(ctx, *self.T["text2"])
        ctx.move_to(0, -r*0.8)
        ctx.line_to(-r*0.3, r*0.2)
        ctx.line_to(0, 0)
        ctx.close_path()
        ctx.fill()
        
        # Draw circle
        ctx.arc(0, 0, r, 0, 2*math.pi)
        ctx.set_line_width(1.0)
        ctx.stroke()
        
        # Tick marks at E, S, W
        ctx.move_to(r, 0); ctx.line_to(r-self.ftl(0.2), 0); ctx.stroke()
        ctx.move_to(0, r); ctx.line_to(0, r-self.ftl(0.2)); ctx.stroke()
        ctx.move_to(-r, 0); ctx.line_to(-r+self.ftl(0.2), 0); ctx.stroke()
        
        # 'N' Label
        ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        ctx.set_font_size(self.ftl(0.6))
        self.sc(ctx, *self.T["cn"])
        te = ctx.text_extents("N")
        ctx.move_to(-te.width/2, -r - self.ftl(0.4))
        ctx.show_text("N")
        
        ctx.restore()

    # ──── Scale Bar ────
    def _scale_bar(self, ctx):
        # Position bottom right in margin
        sx = self.pw + self.ox - self.ftl(15)
        sy = self.ch - self.ty/2
        
        self.sc(ctx, *self.T["text"]); ctx.set_line_width(1.5)
        
        # Draw line
        ctx.move_to(sx, sy); ctx.line_to(sx + self.ftl(10), sy); ctx.stroke()
        
        # Ticks and labels
        ticks = [(0, "0"), (self.ftl(5), "5'"), (self.ftl(10), "10'")]
        ctx.set_font_size(self.ftl(0.35))
        ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
        
        for t_x, label in ticks:
            ctx.move_to(sx + t_x, sy - self.ftl(0.3))
            ctx.line_to(sx + t_x, sy + self.ftl(0.3))
            ctx.stroke()
            te = ctx.text_extents(label)
            ctx.move_to(sx + t_x - te.width/2, sy - self.ftl(0.7))
            ctx.show_text(label)
            
        # Metric labels below
        metric_ticks = [(0, "0"), (self.ftl(5), "1.5m"), (self.ftl(10), "3.0m")]
        self.sc(ctx, *self.T["text2"])
        ctx.set_font_size(self.ftl(0.28))
        for t_x, label in metric_ticks:
            te = ctx.text_extents(label)
            ctx.move_to(sx + t_x - te.width/2, sy + self.ftl(1.0))
            ctx.show_text(label)

    # ──── Legend ────
    def _legend(self, ctx):
        lx=self.ox+self.pw+self.ftl(2); ly=self.oy+self.ftl(3)
        ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        ctx.set_font_size(self.ftl(0.50))
        self.sc(ctx, *self.T["text"])
        ctx.move_to(lx,ly); ctx.show_text("ROOM LEGEND")
        ly+=self.ftl(0.6)
        self.sc(ctx, *self.T["text2"]); ctx.set_line_width(0.5)
        ctx.move_to(lx,ly); ctx.line_to(lx+self.ftl(8),ly); ctx.stroke()
        ly+=self.ftl(0.6)

        ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
        ctx.set_font_size(self.ftl(0.36))
        sw=self.ftl(0.62)

        _TRIV = {"open", "area", "open area", "zone", "unit"}
        for rm in self.fl.rooms[:14]:
            if not rm.name or getattr(rm, 'is_void', False):
                continue
            ctx.set_source_rgba(rm.color[0]/255, rm.color[1]/255, rm.color[2]/255, 0.8)
            ctx.rectangle(lx, ly-sw+2, sw, sw); ctx.fill()
            self.sc(ctx, *self.T["text2"])
            ctx.rectangle(lx, ly-sw+2, sw, sw); ctx.stroke()
            # Short label (first "/" or "+" segment)
            raw_nm = rm.name
            if "/" in raw_nm:
                segs = [s.strip() for s in raw_nm.split("/") if s.strip()]
                good = [s for s in segs if s.lower() not in _TRIV and len(s) >= 3]
                short_nm = min(good, key=len) if good else segs[-1]
            elif "+" in raw_nm:
                short_nm = raw_nm.split("+")[0].strip()
            else:
                short_nm = raw_nm
            short_nm = short_nm[:22]   # cap for legend width
            area_str = f" ({round(rm.area, 2)})" if rm.area else ""
            ctx.move_to(lx+sw+5, ly)
            ctx.show_text(f"{short_nm}{area_str}")
            ly+=self.ftl(0.8)


    # ──── Title Block ────
    def _titleblock(self, ctx):
        ty=self.ch-self.ty+self.ftl(0.8)
        cx=self.cw/2

        # Separator
        self.sc(ctx, *self.T["accent"]); ctx.set_line_width(2)
        ctx.move_to(self.ftl(0.5),ty-self.ftl(0.3))
        ctx.line_to(self.cw-self.ftl(0.5),ty-self.ftl(0.3)); ctx.stroke()

        # Title
        ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        ctx.set_font_size(self.ftl(0.82))
        title=f"GAZECONNECT PRO  —  {self.fl.label.upper()}  —  FLOOR PLAN"
        self.sc(ctx, *self.T["title"])
        te=ctx.text_extents(title)
        ctx.move_to(cx-te.width/2, ty+self.ftl(0.6)); ctx.show_text(title)

        # Info
        ctx.select_font_face(self.T["font"], cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
        ctx.set_font_size(self.ftl(0.38))
        info=f"Plot: {self.fl.w:.0f}' × {self.fl.d:.0f}'  |  Type: {self.fl.ptype}  |  Rooms: {len(self.fl.rooms)}  |  Grid: {self.fl.rows}×{self.fl.cols}  |  Scale 1:100"
        self.sc(ctx, *self.T["text2"])
        te2=ctx.text_extents(info)
        ctx.move_to(cx-te2.width/2, ty+self.ftl(1.4)); ctx.show_text(info)

        ctx.set_font_size(self.ftl(0.30))
        std="Drawing conventions per IS 962:1989 / ISO 128-20  •  Generated by GazeConnect Pro v5.0"
        te3=ctx.text_extents(std)
        ctx.move_to(cx-te3.width/2, ty+self.ftl(2.0)); ctx.show_text(std)

    # ──── Border Frame ────
    def _borderframe(self, ctx):
        self.sc(ctx, *self.T["border"]); ctx.set_line_width(3)
        p=self.ftl(0.3)
        ctx.rectangle(p,p,self.cw-2*p,self.ch-2*p); ctx.stroke()
        ctx.set_line_width(0.8)
        ctx.rectangle(p+4,p+4,self.cw-2*p-8,self.ch-2*p-8); ctx.stroke()


# ═══════════════════════  DXF EXPORT  ═══════════════════════
def export_dxf(fl, path):
    if not HAS_DXF: print("  ⚠ ezdxf unavailable"); return
    doc=ezdxf.new("R2010",setup=True); msp=doc.modelspace()
    for l,c in [("EXT_WALLS",7),("INT_WALLS",8),("DOORS",5),("WINDOWS",4),("TEXT",7),("DIMS",1),("GRID",8)]:
        doc.layers.add(l,color=c)
    msp.add_lwpolyline([(0,0),(fl.w,0),(fl.w,fl.d),(0,fl.d),(0,0)],dxfattribs={"layer":"EXT_WALLS","const_width":EXT_W})
    for r in fl.rooms:
        if r.x2<=r.x1: continue
        msp.add_lwpolyline([(r.x1,r.y1),(r.x2,r.y1),(r.x2,r.y2),(r.x1,r.y2),(r.x1,r.y1)],dxfattribs={"layer":"INT_WALLS"})
        cx,cy=(r.x1+r.x2)/2,(r.y1+r.y2)/2
        msp.add_mtext(r.name,dxfattribs={"layer":"TEXT","insert":(cx,cy),"char_height":0.8,"attachment_point":5})
    msp.add_linear_dim(base=(0,-3),p1=(0,0),p2=(fl.w,0),dxfattribs={"layer":"DIMS"}).render()
    msp.add_linear_dim(base=(-3,0),p1=(0,0),p2=(0,fl.d),angle=90,dxfattribs={"layer":"DIMS"}).render()
    doc.saveas(path); print(f"  DXF: {Path(path).name}")

# ═══════════════════════  SAMPLE DATA  ═══════════════════════
def sample():
    return {"compass_map":{
      "grid_size":{"rows":4,"cols":4},
      "plot":{"width_ft":40,"depth_ft":60,"facing":"South","type":"Middle Plot"},
      "ground_floor":{"placements":[
        {"room":"Porch / Lobby","roomId":"porch","coords":{"x1":0,"y1":0,"x2":10,"y2":15},"area_sqft":150},
        {"room":"Lawn / Garden","roomId":"lawn","coords":{"x1":0,"y1":45,"x2":10,"y2":60},"area_sqft":150},
        {"room":"Home ICU + Caretaker","roomId":"icu","coords":{"x1":10,"y1":45,"x2":20,"y2":60},"area_sqft":150},
        {"room":"Backyard","roomId":"backyard","coords":{"x1":20,"y1":45,"x2":30,"y2":60},"area_sqft":150},
        {"room":"Kitchen + Store","roomId":"kitchen","coords":{"x1":30,"y1":45,"x2":40,"y2":60},"area_sqft":150},
        {"room":"Drawing Room","roomId":"drawing","coords":{"x1":10,"y1":15,"x2":20,"y2":30},"area_sqft":150},
        {"room":"Living Hall","roomId":"living","coords":{"x1":10,"y1":30,"x2":30,"y2":45},"area_sqft":300},
        {"room":"Staircase + Lobby","roomId":"staircase","coords":{"x1":30,"y1":30,"x2":40,"y2":45},"area_sqft":150},
        {"room":"Dining Hall","roomId":"dining","coords":{"x1":20,"y1":15,"x2":30,"y2":30},"area_sqft":150},
        {"room":"Bathroom","roomId":"bathroom","coords":{"x1":30,"y1":15,"x2":40,"y2":30},"area_sqft":150},
      ]},
      "first_floor":{"placements":[
        {"room":"Master Bedroom","roomId":"ff_master","coords":{"x1":0,"y1":30,"x2":20,"y2":45},"area_sqft":300},
        {"room":"Bedroom 2","roomId":"ff_bed2","coords":{"x1":20,"y1":30,"x2":30,"y2":45},"area_sqft":150},
        {"room":"Living / Family","roomId":"ff_living","coords":{"x1":0,"y1":15,"x2":20,"y2":30},"area_sqft":300},
        {"room":"Bathroom","roomId":"ff_bathroom","coords":{"x1":30,"y1":15,"x2":40,"y2":30},"area_sqft":150},
      ]},
    }}

# ═══════════════════════  CLI  ═══════════════════════

# --- Cumulative input helpers (survey + compass + optional fusion) ---
_ROOM_RULES = [
    (re.compile(r"(home\s*icu|icu|caretaker)", re.IGNORECASE), "icu", "Home ICU + Caretaker Unit"),
    (re.compile(r"(master\s*bed)", re.IGNORECASE), "masterBed", "Master Bedroom"),
    (re.compile(r"(common\s*bath)", re.IGNORECASE), "commonBath", "Common Bathroom"),
    (re.compile(r"(bath|toilet|wc)", re.IGNORECASE), "bathroom", "Bathroom"),
    (re.compile(r"(dining.*stair|stair.*dining)", re.IGNORECASE), "diningStaircase", "Dining Hall + Staircase"),
    (re.compile(r"(living\s*lobby|stair)", re.IGNORECASE), "staircase", "Living Lobby + Staircase"),
    (re.compile(r"(living\s*hall|living)", re.IGNORECASE), "living", "Living Hall"),
    (re.compile(r"(kitchen)", re.IGNORECASE), "kitchen", "Kitchen + Store"),
    (re.compile(r"(drawing)", re.IGNORECASE), "drawing", "Drawing Room"),
    (re.compile(r"(dining)", re.IGNORECASE), "dining", "Dining Hall"),
    (re.compile(r"(backyard|utility)", re.IGNORECASE), "backyard", "Backyard"),
    (re.compile(r"(lawn|garden)", re.IGNORECASE), "lawn", "Lawn / Garden"),
    (re.compile(r"(porch|lobby|open\s*area)", re.IGNORECASE), "porch", "Outer Lobby / Porch / Open Area"),
    (re.compile(r"(verandah|veranda)", re.IGNORECASE), "verandah", "Verandah"),
    (re.compile(r"(balcony)", re.IGNORECASE), "balcony", "Balcony"),
    (re.compile(r"(terrace)", re.IGNORECASE), "terrace", "Terrace"),
    (re.compile(r"(bedroom|bed\s*\d*)", re.IGNORECASE), "bedroom", "Bedroom"),
]
_SURVEY_DIR = Path(__file__).resolve().parents[1] / "survey_data"
_SESSIONS_DIR = _SURVEY_DIR / "sessions"

def _json_load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return None

def _extract_compass_map(payload):
    if not isinstance(payload, dict):
        return None
    cm = payload.get("compass_map")
    if isinstance(cm, dict):
        return cm
    if isinstance(payload.get("plot"), dict) and (
        isinstance(payload.get("ground_floor"), dict) or isinstance(payload.get("placements"), list)
    ):
        return payload
    answers = payload.get("answers")
    if isinstance(answers, dict) and isinstance(answers.get("compass_map"), dict):
        return answers["compass_map"]
    return None

def _extract_answers(payload):
    if not isinstance(payload, dict):
        return {}
    if isinstance(payload.get("answers"), dict):
        return payload.get("answers", {})
    if isinstance(payload.get("raw_answers"), dict):
        return payload.get("raw_answers", {})
    return payload

def _extract_session_id(payload):
    if not isinstance(payload, dict):
        return None
    sid = payload.get("session_id")
    if sid:
        return str(sid)
    meta = payload.get("meta")
    if isinstance(meta, dict) and meta.get("session_id"):
        return str(meta.get("session_id"))
    return None

def _to_int(value, default):
    if isinstance(value, (int, float)):
        return int(value)
    txt = str(value or "")
    m = re.search(r"-?\d+", txt)
    if not m:
        return default
    try:
        return int(m.group(0))
    except Exception:
        return default

def _room_from_slot_label(label):
    clean = str(label or "").strip()
    for rx, rid, name in _ROOM_RULES:
        if rx.search(clean):
            return rid, name
    slug = re.sub(r"[^a-z0-9]+", "_", clean.lower()).strip("_") or "room"
    return slug, (clean or "Room")

def _build_compass_from_survey_answers(answers):
    slot_rx = re.compile(r"plot_r(\d+)_s(\d+)$", re.IGNORECASE)
    slots = []
    for k, v in (answers or {}).items():
        m = slot_rx.fullmatch(str(k))
        if not m:
            continue
        label = str(v or "").strip()
        if not label or label.lower() in {"skip", "none", "n/a", "skipped"}:
            continue
        slots.append((int(m.group(1)), int(m.group(2)), label))
    if not slots:
        return None

    rows = max(4, max(r for r, _, _ in slots))
    cols = max(4, max(c for _, c, _ in slots))
    w = max(10, _to_int(answers.get("plot_width_ft"), 40))
    d = max(10, _to_int(answers.get("plot_depth_ft"), 60))
    facing = str(answers.get("road_facing", "South Facing")).replace(" Facing", "").strip() or "South"
    ptype = str(answers.get("plot_type", "Middle Plot"))
    num_floors = str(answers.get("num_floors", "Single Floor"))

    cw = float(w) / float(cols)
    cd = float(d) / float(rows)
    grouped = {}
    for r, c, label in sorted(slots):
        rid, rname = _room_from_slot_label(label)
        key = f"r{r}_c{c}"
        grouped.setdefault(rid, {"room": rname, "roomId": rid, "cells": [], "cellRects": {}})
        grouped[rid]["cells"].append(key)
        x1 = (c - 1) * cw
        y1 = (r - 1) * cd
        grouped[rid]["cellRects"][key] = {"x1": x1, "y1": y1, "x2": x1 + cw, "y2": y1 + cd}

    placements = []
    for room in grouped.values():
        cells = sorted(set(room["cells"]), key=lambda ck: tuple(int(x) for x in ck.replace("r", "").split("_c")))
        rects = [room["cellRects"][c] for c in cells]
        coords = {
            "x1": min(x["x1"] for x in rects),
            "y1": min(x["y1"] for x in rects),
            "x2": max(x["x2"] for x in rects),
            "y2": max(x["y2"] for x in rects),
        }
        area = int(round(sum((x["x2"] - x["x1"]) * (x["y2"] - x["y1"]) for x in rects)))
        placements.append({
            "room": room["room"], "roomId": room["roomId"], "cells": cells,
            "coords": coords, "cellRects": room["cellRects"], "area_sqft": area
        })

    return {
        "grid_size": {"rows": rows, "cols": cols},
        "plot": {
            "width_ft": w, "depth_ft": d, "facing": facing, "type": ptype, "num_floors": num_floors
        },
        "ground_floor": {"placements": placements},
    }

def _load_latest_survey_payload():
    candidates = [
        _SURVEY_DIR / "gaze_survey_cumulative.json",
        _SURVEY_DIR / "gaze_survey_compiled.json",
        _SURVEY_DIR / "gaze_survey_data.json",
    ]
    if (_SURVEY_DIR / "survey_snapshots").exists():
        snaps = sorted((_SURVEY_DIR / "survey_snapshots").glob("snapshot_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        candidates.extend(snaps)
    slot_rx = re.compile(r"plot_r\d+_s\d+$", re.IGNORECASE)
    def score_payload(data):
        if not isinstance(data, dict):
            return -1
        ans = _extract_answers(data)
        s = 0
        if isinstance(ans, dict):
            s += min(80, len(ans))
            s += sum(1 for k in ans.keys() if slot_rx.fullmatch(str(k))) * 10
            if any(k in ans for k in ("plot_width_ft", "plot_depth_ft", "road_facing", "num_floors")):
                s += 40
        cm = _extract_compass_map(data)
        if isinstance(cm, dict):
            s += 120
            if isinstance(cm.get("ground_floor"), dict):
                s += len(cm.get("ground_floor", {}).get("placements", []) or []) * 5
        if isinstance(data.get("raw_answers"), dict):
            s += 30
        return s

    best = None
    best_p = None
    best_s = -1

    # Prefer latest active session first.
    idx = _json_load(_SURVEY_DIR / "session_index.json") if (_SURVEY_DIR / "session_index.json").exists() else None
    sid = idx.get("latest_session_id") if isinstance(idx, dict) else None
    if sid and (_SESSIONS_DIR / str(sid)).exists():
        for p in sorted((_SESSIONS_DIR / str(sid)).glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
            data = _json_load(p)
            if not isinstance(data, dict):
                continue
            sc = score_payload(data)
            if sc > best_s:
                best_s = sc
                best = data
                best_p = p
        if best is not None:
            return best, best_p
        # Latest session exists, but no usable survey payload there; do not mix with older sessions.
        return None, None

    for p in candidates:
        if not p.exists():
            continue
        data = _json_load(p)
        if not isinstance(data, dict):
            continue
        sc = score_payload(data)
        if sc > best_s:
            best_s = sc
            best = data
            best_p = p
    if best is not None:
        return best, best_p
    return None, None

def _load_cumulative_data(args):
    survey_payload = None
    survey_source = None
    warnings = []
    if args.survey_file:
        survey_payload = _json_load(args.survey_file)
        survey_source = Path(args.survey_file)
    elif args.latest or args.auto_fuse:
        survey_payload, survey_source = _load_latest_survey_payload()

    compass_map = None
    if args.compass_file:
        compass_payload = _json_load(args.compass_file)
        compass_map = _extract_compass_map(compass_payload)
    if compass_map is None and isinstance(survey_payload, dict):
        compass_map = _extract_compass_map(survey_payload)
    if compass_map is None and isinstance(survey_payload, dict):
        compass_map = _build_compass_from_survey_answers(_extract_answers(survey_payload))
        if isinstance(compass_map, dict):
            warnings.append("Compass map synthesized from survey slot mapping (plot_rX_sY).")

    if compass_map is None:
        raise RuntimeError("Could not find compass map from cumulative inputs. Pass --compass-file or use --latest.")

    if args.auto_fuse:
        try:
            from floorplan_fusion_v1 import fuse_floorplan_inputs
            fused_map, _ = fuse_floorplan_inputs(
                compass_map,
                survey_data=survey_payload if isinstance(survey_payload, dict) else None,
                user_notes=(args.notes or None),
            )
            out = {"compass_map": fused_map}
            if warnings:
                out["_warnings"] = warnings
            return out, survey_source
        except Exception as e:
            raise RuntimeError(f"Fusion failed: {e}") from e

    out = {"compass_map": compass_map}
    if warnings:
        out["_warnings"] = warnings
    return out, survey_source

def main():
    import argparse
    ap=argparse.ArgumentParser(description="GazeConnect Floor Plan v5 (PyCairo)")
    ap.add_argument("input",nargs="?")
    ap.add_argument("--style",choices=list(THEMES),default="modern")
    ap.add_argument("--dxf",action="store_true")
    ap.add_argument("--sample",action="store_true")
    ap.add_argument("--all-styles",action="store_true")
    ap.add_argument("-o",default=".")
    ap.add_argument("--latest",action="store_true",help="Use latest survey+compass data from survey_data")
    ap.add_argument("--survey-file",default=None,help="Survey json file (answers/compiled)")
    ap.add_argument("--compass-file",default=None,help="Compass map json file")
    ap.add_argument("--auto-fuse",action="store_true",help="Fuse survey + compass + notes before rendering")
    ap.add_argument("--notes",default=None,help="Optional custom notes string for fusion")
    args=ap.parse_args()

    if args.sample:
        data = sample()
        print("Loaded sample data")
    elif args.latest or args.survey_file or args.compass_file or args.auto_fuse:
        data, src = _load_cumulative_data(args)
        print(f"Loaded cumulative data (source: {src if src else 'survey_data'})")
        for w in data.get("_warnings", []) if isinstance(data, dict) else []:
            print(f"[WARN] {w}")
    else:
        data = sample() if not args.input else json.load(open(args.input, "r", encoding="utf-8"))
        print("Loaded sample data" if not args.input else f"Loaded: {args.input}")

    floors=parse(data)
    out=Path(args.o)
    out.mkdir(parents=True,exist_ok=True)
    styles=list(THEMES) if args.all_styles else [args.style]

    for sty in styles:
        for fl in floors:
            slug=fl.label.lower().replace(" ","_")
            print(f"\nRender {fl.label} [{sty}] - {len(fl.rooms)} rooms")
            R=CairoFloorPlan(fl, sty)
            fp=out/f"floorplan_{slug}_{sty}.png"
            w,h=R.render_png(str(fp))
            print(f"  PNG ({w}x{h}): {fp.name}")
            fp2=out/f"floorplan_{slug}_{sty}.pdf"
            R.render_pdf(str(fp2))
            print(f"  PDF: {fp2.name}")
            fp3=out/f"floorplan_{slug}_{sty}.svg"
            R.render_svg(str(fp3))
            print(f"  SVG: {fp3.name}")
            if args.dxf:
                export_dxf(fl, str(out/f"floorplan_{slug}.dxf"))

    print(f"\nDone -> {out.resolve()}")

if __name__=="__main__":
    main()

