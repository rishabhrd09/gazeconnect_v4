"""
Stage-2 treemap seeding for GazePlan v5.

This module generates an initial layout that:
- respects buildable boundary (setback-adjusted),
- groups rooms into functional zones,
- preserves compass-map spatial intent using anchor-aware ordering.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from .nbc_standards import SETBACK_DEFAULTS, get_nbc_requirements

try:
    import squarify  # type: ignore
except Exception:  # pragma: no cover
    squarify = None


ROOM_ALIAS: Dict[str, str] = {
    "masterbed": "masterbed",
    "master": "masterbed",
    "bedroom": "bedroom",
    "living": "living",
    "drawing": "drawing",
    "dining": "dining",
    "diningstaircase": "diningstaircase",
    "kitchen": "kitchen",
    "bathroom": "bathroom",
    "commonbath": "commonbath",
    "staircase": "staircase",
    "icu": "icu",
    "store": "store",
    "pooja": "pooja",
    "study": "study",
    "servant": "servant",
    "wash": "wash",
    "utility": "utility",
    "garage": "garage",
    "porch": "porch",
    "lawn": "lawn",
    "verandah": "verandah",
    "backyard": "backyard",
    "balcony": "balcony",
    "terrace": "terrace",
}


ZONE_OF_ROOM: Dict[str, str] = {
    "living": "social",
    "drawing": "social",
    "dining": "social",
    "porch": "social",
    "masterbed": "private",
    "bedroom": "private",
    "icu": "private",
    "study": "private",
    "kitchen": "service",
    "bathroom": "service",
    "commonbath": "service",
    "wash": "service",
    "utility": "service",
    "store": "service",
    "servant": "service",
    "garage": "service",
    "staircase": "service",
    "diningstaircase": "service",
    "lawn": "outdoor",
    "verandah": "outdoor",
    "backyard": "outdoor",
    "balcony": "outdoor",
    "terrace": "outdoor",
}


ZONE_ANCHOR = {
    "social": (0.50, 0.18),   # front/road side
    "private": (0.50, 0.82),  # rear side
    "service": (0.85, 0.52),  # side band
    "outdoor": (0.15, 0.52),  # opposite side
    "other": (0.50, 0.50),
}


def _norm_room_id(room_id: str) -> str:
    key = (room_id or "").strip().lower().replace("_", "")
    if key in ROOM_ALIAS:
        return ROOM_ALIAS[key]
    if not key:
        return "bedroom"
    text = key
    if text.startswith("ff"):
        text = text[2:]
    if "master" in text and "bed" in text:
        return "masterbed"
    if "bed" in text:
        return "bedroom"
    if "living" in text:
        return "living"
    if "drawing" in text:
        return "drawing"
    if "dining" in text and "stair" in text:
        return "diningstaircase"
    if "dining" in text:
        return "dining"
    if "stair" in text:
        return "staircase"
    if "kitchen" in text:
        return "kitchen"
    if "bath" in text:
        return "bathroom"
    if "icu" in text or "caretaker" in text:
        return "icu"
    if "balcony" in text:
        return "balcony"
    if "terrace" in text:
        return "terrace"
    if "backyard" in text:
        return "backyard"
    if "lawn" in text or "garden" in text:
        return "lawn"
    if "verand" in text:
        return "verandah"
    if "porch" in text or "lobby" in text:
        return "porch"
    return "bedroom"


def _parse_cell(cell: str) -> Optional[Tuple[int, int]]:
    cell = (cell or "").strip().lower()
    if not cell.startswith("r") or "_c" not in cell:
        return None
    try:
        r, c = cell.replace("r", "").split("_c")
        return int(r), int(c)
    except Exception:
        return None


def _room_anchor(cells: Iterable[str], rows: int, cols: int) -> Tuple[float, float]:
    pts: List[Tuple[int, int]] = []
    for cell in cells:
        rc = _parse_cell(cell)
        if rc:
            pts.append(rc)
    if not pts:
        return (0.5, 0.5)
    # Compass convention: row1 is front (y near 0), row4 is rear (y near 1).
    avg_r = sum(p[0] for p in pts) / len(pts)
    avg_c = sum(p[1] for p in pts) / len(pts)
    nx = (avg_c - 0.5) / max(1.0, float(cols))
    ny = (avg_r - 0.5) / max(1.0, float(rows))
    return (max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny)))


def _placement_area_sqft(p: Dict[str, Any], rows: int, cols: int, plot_w: float, plot_d: float) -> float:
    # Prefer precise per-cell rectangles when present.
    rects = p.get("cellRects")
    if isinstance(rects, dict) and rects:
        total = 0.0
        for r in rects.values():
            try:
                x1 = float(r.get("x1", 0.0))
                y1 = float(r.get("y1", 0.0))
                x2 = float(r.get("x2", x1))
                y2 = float(r.get("y2", y1))
                total += max(0.0, x2 - x1) * max(0.0, y2 - y1)
            except Exception:
                continue
        if total > 0.0:
            return total

    # Next-best: derive from occupied cell count.
    cells = list(p.get("cells") or [])
    if cells:
        cell_area = (plot_w / max(1, cols)) * (plot_d / max(1, rows))
        return len({str(c) for c in cells}) * cell_area

    # Fallback to provided area.
    try:
        return max(0.0, float(p.get("area_sqft") or 0.0))
    except Exception:
        return 0.0


def _simple_squarify(sizes: List[float], x: float, y: float, w: float, h: float) -> List[Dict[str, float]]:
    total = sum(max(0.0, s) for s in sizes)
    if total <= 0:
        total = float(len(sizes)) or 1.0
        sizes = [1.0] * len(sizes)
    rects: List[Dict[str, float]] = []
    cur_x = x
    cur_y = y
    horizontal = w >= h
    for s in sizes:
        ratio = max(0.0, s) / total
        if horizontal:
            rw = w * ratio
            rects.append({"x": cur_x, "y": y, "dx": rw, "dy": h})
            cur_x += rw
        else:
            rh = h * ratio
            rects.append({"x": x, "y": cur_y, "dx": w, "dy": rh})
            cur_y += rh
    return rects


def _squarify(sizes: List[float], x: float, y: float, w: float, h: float) -> List[Dict[str, float]]:
    if not sizes:
        return []
    if squarify is None:
        return _simple_squarify(sizes, x, y, w, h)
    try:
        normalized = squarify.normalize_sizes([max(0.0001, s) for s in sizes], w, h)
        return list(squarify.squarify(normalized, x, y, w, h))
    except Exception:
        return _simple_squarify(sizes, x, y, w, h)


def _reorder_rects_by_anchor(
    rects: List[Dict[str, float]],
    zone_names: List[str],
    x: float,
    y: float,
    w: float,
    h: float,
) -> Dict[str, Dict[str, float]]:
    remaining = list(enumerate(rects))
    mapping: Dict[str, Dict[str, float]] = {}
    for z in zone_names:
        zx, zy = ZONE_ANCHOR.get(z, ZONE_ANCHOR["other"])
        tx = x + zx * w
        ty = y + zy * h
        best_i = -1
        best_d = 10**18
        for idx, r in remaining:
            cx = r["x"] + r["dx"] * 0.5
            cy = r["y"] + r["dy"] * 0.5
            d = (cx - tx) ** 2 + (cy - ty) ** 2
            if d < best_d:
                best_i = idx
                best_d = d
        if best_i >= 0:
            chosen = [p for p in remaining if p[0] == best_i][0][1]
            mapping[z] = chosen
            remaining = [p for p in remaining if p[0] != best_i]
    return mapping


def _room_req_from_placement(
    p: Dict[str, Any],
    rows: int,
    cols: int,
    plot_w: float,
    plot_d: float,
    *,
    kitchen_mode: str,
    accessibility: bool,
) -> Dict[str, Any]:
    raw_id = str(p.get("roomId", ""))
    label = str(p.get("room", raw_id))
    rid = _norm_room_id(f"{raw_id} {label}")
    nbc = get_nbc_requirements(rid, kitchen_mode=kitchen_mode, accessibility=accessibility)
    area_ui = _placement_area_sqft(p, rows, cols, plot_w, plot_d)
    min_area = float(nbc["min_area_sqft"])
    target_area = max(min_area, area_ui) if area_ui > 0 else min_area
    anchor_x, anchor_y = _room_anchor(p.get("cells") or [], rows, cols)
    return {
        "roomId": rid,
        "label": label,
        "cells": list(p.get("cells") or []),
        "anchor_x": anchor_x,
        "anchor_y": anchor_y,
        "target_area_sqft": target_area,
        "min_area_sqft": min_area,
        "min_width_ft": float(nbc["min_width_ft"]),
        "min_depth_ft": float(nbc["min_depth_ft"]),
        "zone": ZONE_OF_ROOM.get(rid, "other"),
    }


def build_seed_layout(
    compass_map: Dict[str, Any],
    *,
    floor_key: str = "ground_floor",
    kitchen_mode: str = "separate",
    accessibility: bool = False,
    setbacks: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Build a two-stage treemap seed layout.

    Returns:
      {
        "plot": {...},
        "buildable": {"x1","y1","x2","y2","width","depth","area"},
        "rooms": [ {roomId,label,zone,x1,y1,x2,y2,...} ],
        "zones": [ {zone,x1,y1,x2,y2,area} ],
      }
    """
    plot = compass_map.get("plot") or {}
    floor = compass_map.get(floor_key) or {}
    placements: List[Dict[str, Any]] = list(floor.get("placements") or [])
    rows = int(((compass_map.get("grid_size") or {}).get("rows")) or 4)
    cols = int(((compass_map.get("grid_size") or {}).get("cols")) or 4)

    plot_w = float(plot.get("width_ft") or 40.0)
    plot_d = float(plot.get("depth_ft") or 60.0)
    sb = dict(SETBACK_DEFAULTS)
    if isinstance(setbacks, dict):
        sb.update({k: float(v) for k, v in setbacks.items() if k in sb})

    bx1 = float(sb["side_ft"])
    by1 = float(sb["front_ft"])
    bx2 = max(bx1 + 1.0, plot_w - float(sb["side_ft"]))
    by2 = max(by1 + 1.0, plot_d - float(sb["rear_ft"]))
    bw = max(1.0, bx2 - bx1)
    bd = max(1.0, by2 - by1)

    room_reqs = [
        _room_req_from_placement(
            p,
            rows,
            cols,
            plot_w,
            plot_d,
            kitchen_mode=kitchen_mode,
            accessibility=accessibility,
        )
        for p in placements
    ]
    if not room_reqs:
        return {
            "plot": {"width_ft": plot_w, "depth_ft": plot_d},
            "buildable": {"x1": bx1, "y1": by1, "x2": bx2, "y2": by2, "width": bw, "depth": bd, "area": bw * bd},
            "rooms": [],
            "zones": [],
        }

    # Stage-1: zone treemap
    zone_to_rooms: Dict[str, List[Dict[str, Any]]] = {}
    for rr in room_reqs:
        zone_to_rooms.setdefault(rr["zone"], []).append(rr)
    zone_names = sorted(zone_to_rooms.keys())
    zone_sizes = [sum(r["target_area_sqft"] for r in zone_to_rooms[z]) for z in zone_names]
    zone_rects = _squarify(zone_sizes, bx1, by1, bw, bd)
    zone_map = _reorder_rects_by_anchor(zone_rects, zone_names, bx1, by1, bw, bd)

    out_rooms: List[Dict[str, Any]] = []
    out_zones: List[Dict[str, Any]] = []

    # Stage-2: room treemap inside each zone
    for z in zone_names:
        zr = zone_map.get(z) or {"x": bx1, "y": by1, "dx": bw, "dy": bd}
        zx, zy, zw, zh = float(zr["x"]), float(zr["y"]), float(zr["dx"]), float(zr["dy"])
        out_zones.append({"zone": z, "x1": zx, "y1": zy, "x2": zx + zw, "y2": zy + zh, "area": zw * zh})

        rooms = list(zone_to_rooms[z])
        # anchor-aware assignment: sort rooms and rects similarly
        rooms_sorted = sorted(rooms, key=lambda r: (r["anchor_y"], r["anchor_x"]))
        room_sizes = [r["target_area_sqft"] for r in rooms_sorted]
        rects = _squarify(room_sizes, zx, zy, zw, zh)
        rects_sorted = sorted(rects, key=lambda r: (r["y"] + r["dy"] * 0.5, r["x"] + r["dx"] * 0.5))
        for rr, rc in zip(rooms_sorted, rects_sorted):
            room = dict(rr)
            room["x1"] = float(rc["x"])
            room["y1"] = float(rc["y"])
            room["x2"] = float(rc["x"] + rc["dx"])
            room["y2"] = float(rc["y"] + rc["dy"])
            room["width_ft"] = room["x2"] - room["x1"]
            room["depth_ft"] = room["y2"] - room["y1"]
            room["area_sqft"] = room["width_ft"] * room["depth_ft"]
            out_rooms.append(room)

    return {
        "plot": {"width_ft": plot_w, "depth_ft": plot_d},
        "buildable": {"x1": bx1, "y1": by1, "x2": bx2, "y2": by2, "width": bw, "depth": bd, "area": bw * bd},
        "rooms": out_rooms,
        "zones": out_zones,
    }
