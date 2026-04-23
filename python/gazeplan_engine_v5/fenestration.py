"""
Stage-5 fenestration for GazePlan v5.

Auto-places windows and doors based on:
- external vs shared edges
- room function
- ventilation minimums
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .nbc_standards import NBC_VENTILATION, VENTILATION_DEFAULT_CLIMATE
from .room_adjacency_graph import ADJACENCY_RULES


Point = Tuple[float, float]
Segment = Tuple[Point, Point]


WINDOW_SPEC_FT: Dict[str, Tuple[float, float]] = {
    "living": (4.92, 4.00),
    "drawing": (4.50, 4.00),
    "masterbed": (3.94, 4.00),
    "bedroom": (3.94, 4.00),
    "study": (3.94, 4.00),
    "icu": (4.50, 4.00),
    "kitchen": (3.94, 2.95),
    "dining": (3.94, 4.00),
    "bathroom": (1.97, 1.48),
    "commonbath": (1.97, 1.48),
}


DOOR_WIDTH_FT: Dict[str, float] = {
    "main": 3.28,
    "default": 2.95,
    "bathroom": 2.46,
}


OUTDOOR_ROOMS = {"lawn", "porch", "verandah", "backyard", "balcony", "terrace"}


def _norm_room_id(rid: str) -> str:
    return (rid or "").strip().lower().replace("_", "")


def _room_area(room: Dict[str, Any]) -> float:
    return max(0.0, float(room.get("x2", 0.0)) - float(room.get("x1", 0.0))) * max(
        0.0, float(room.get("y2", 0.0)) - float(room.get("y1", 0.0))
    )


def _room_edges(room: Dict[str, Any]) -> Dict[str, Segment]:
    x1 = float(room["x1"])
    y1 = float(room["y1"])
    x2 = float(room["x2"])
    y2 = float(room["y2"])
    return {
        "S": ((x1, y1), (x2, y1)),
        "E": ((x2, y1), (x2, y2)),
        "N": ((x2, y2), (x1, y2)),
        "W": ((x1, y2), (x1, y1)),
    }


def _segment_len(seg: Segment) -> float:
    (x1, y1), (x2, y2) = seg
    return abs(x2 - x1) + abs(y2 - y1)


def _overlap_1d(a1: float, a2: float, b1: float, b2: float) -> Tuple[float, float]:
    lo = max(min(a1, a2), min(b1, b2))
    hi = min(max(a1, a2), max(b1, b2))
    return (lo, hi)


def _shared_wall(a: Dict[str, Any], b: Dict[str, Any], tol: float = 1e-6) -> Optional[Segment]:
    ax1, ay1, ax2, ay2 = float(a["x1"]), float(a["y1"]), float(a["x2"]), float(a["y2"])
    bx1, by1, bx2, by2 = float(b["x1"]), float(b["y1"]), float(b["x2"]), float(b["y2"])

    # Vertical shared wall.
    if abs(ax2 - bx1) <= tol or abs(bx2 - ax1) <= tol:
        x = ax2 if abs(ax2 - bx1) <= tol else ax1
        lo, hi = _overlap_1d(ay1, ay2, by1, by2)
        if hi - lo > tol:
            return ((x, lo), (x, hi))

    # Horizontal shared wall.
    if abs(ay2 - by1) <= tol or abs(by2 - ay1) <= tol:
        y = ay2 if abs(ay2 - by1) <= tol else ay1
        lo, hi = _overlap_1d(ax1, ax2, bx1, bx2)
        if hi - lo > tol:
            return ((lo, y), (hi, y))
    return None


def _segment_from_center(seg: Segment, width_ft: float, corner_clearance_ft: float = 1.0) -> Optional[Segment]:
    (x1, y1), (x2, y2) = seg
    length = _segment_len(seg)
    usable = length - 2.0 * corner_clearance_ft
    if usable <= 0:
        return None
    w = min(width_ft, usable)
    half = 0.5 * w
    if abs(y2 - y1) < 1e-6:
        cx = (x1 + x2) * 0.5
        y = y1
        return ((cx - half, y), (cx + half, y))
    cy = (y1 + y2) * 0.5
    x = x1
    return ((x, cy - half), (x, cy + half))


def _is_edge_external(room: Dict[str, Any], edge: Segment, others: Iterable[Dict[str, Any]]) -> bool:
    for o in others:
        if o is room:
            continue
        if _shared_wall(room, o) is None:
            continue
        sw = _shared_wall(room, o)
        if sw and _same_segment(sw, edge):
            return False
    return True


def _same_segment(a: Segment, b: Segment, tol: float = 1e-5) -> bool:
    return (
        (abs(a[0][0] - b[0][0]) <= tol and abs(a[0][1] - b[0][1]) <= tol and abs(a[1][0] - b[1][0]) <= tol and abs(a[1][1] - b[1][1]) <= tol)
        or (
            abs(a[0][0] - b[1][0]) <= tol
            and abs(a[0][1] - b[1][1]) <= tol
            and abs(a[1][0] - b[0][0]) <= tol
            and abs(a[1][1] - b[0][1]) <= tol
        )
    )


def _window_requirement(room_id: str, area_sqft: float, climate: str) -> float:
    rid = _norm_room_id(room_id)
    ratio = NBC_VENTILATION.get(climate, NBC_VENTILATION[VENTILATION_DEFAULT_CLIMATE])
    req = area_sqft * float(ratio)
    if rid == "kitchen":
        req = max(req * NBC_VENTILATION["kitchen_surcharge"], NBC_VENTILATION["kitchen_min_opening_sqft"])
    if rid in {"bathroom", "commonbath"}:
        req = max(req, NBC_VENTILATION["bathroom_min_vent_sqft"])
    return req


def generate_fenestration(
    rooms: Iterable[Dict[str, Any]],
    *,
    adjacency_graph: Optional[Any] = None,
    climate: str = VENTILATION_DEFAULT_CLIMATE,
) -> Dict[str, Any]:
    room_list = list(rooms)
    by_id = {_norm_room_id(str(r.get("roomId", ""))): r for r in room_list}

    windows: List[Dict[str, Any]] = []
    doors: List[Dict[str, Any]] = []
    ventilation_report: List[Dict[str, Any]] = []

    # Window placement on external walls.
    for room in room_list:
        rid = _norm_room_id(str(room.get("roomId", "")))
        if rid in OUTDOOR_ROOMS:
            continue
        area = _room_area(room)
        required_open = _window_requirement(rid, area, climate)
        ww, wh = WINDOW_SPEC_FT.get(rid, WINDOW_SPEC_FT.get("bedroom", (3.94, 4.0)))
        per_window_area = ww * wh

        external_edges = []
        for orient, edge in _room_edges(room).items():
            if _is_edge_external(room, edge, room_list):
                # Solar priority: N/E first.
                priority = 0
                if orient == "N":
                    priority = 3
                elif orient == "E":
                    priority = 2
                elif orient == "W":
                    priority = 1
                external_edges.append((priority, orient, edge))
        external_edges.sort(key=lambda t: t[0], reverse=True)

        if not external_edges:
            ventilation_report.append(
                {"roomId": rid, "required_open_sqft": round(required_open, 2), "provided_open_sqft": 0.0, "ok": False}
            )
            continue

        target_count = max(1, int(math.ceil(required_open / max(0.1, per_window_area))))
        provided = 0.0
        placed = 0
        for _, orient, edge in external_edges:
            if placed >= target_count:
                break
            seg = _segment_from_center(edge, width_ft=ww, corner_clearance_ft=1.0)
            if seg is None:
                continue
            windows.append(
                {
                    "roomId": rid,
                    "type": "window",
                    "orientation": orient,
                    "edge": edge,
                    "segment": seg,
                    "width_ft": ww,
                    "height_ft": wh,
                    "open_area_sqft": ww * wh,
                }
            )
            provided += ww * wh
            placed += 1

        ventilation_report.append(
            {
                "roomId": rid,
                "required_open_sqft": round(required_open, 2),
                "provided_open_sqft": round(provided, 2),
                "ok": provided >= required_open,
            }
        )

    # Door placement between adjacent rooms.
    candidate_pairs: List[Tuple[str, str]] = []
    if adjacency_graph is not None:
        try:
            for a, b in adjacency_graph.edges():
                candidate_pairs.append((str(a), str(b)))
        except Exception:
            candidate_pairs = []
    if not candidate_pairs:
        for a, bs in ADJACENCY_RULES.items():
            for b in bs:
                candidate_pairs.append((a, b))

    seen = set()
    for a, b in candidate_pairs:
        ra = by_id.get(_norm_room_id(a))
        rb = by_id.get(_norm_room_id(b))
        if not ra or not rb:
            continue
        key = tuple(sorted((_norm_room_id(a), _norm_room_id(b))))
        if key in seen:
            continue
        seen.add(key)

        shared = _shared_wall(ra, rb)
        if shared is None:
            continue

        # Choose door width by stricter room type.
        aw = _norm_room_id(a)
        bw = _norm_room_id(b)
        if aw in {"bathroom", "commonbath"} or bw in {"bathroom", "commonbath"}:
            dw = DOOR_WIDTH_FT["bathroom"]
            swing = "outward"
        elif aw in {"porch"} or bw in {"porch"}:
            dw = DOOR_WIDTH_FT["main"]
            swing = "inward"
        else:
            dw = DOOR_WIDTH_FT["default"]
            swing = "inward"

        seg = _segment_from_center(shared, width_ft=dw, corner_clearance_ft=1.0)
        if seg is None:
            continue
        doors.append(
            {
                "a": aw,
                "b": bw,
                "type": "door",
                "segment": seg,
                "width_ft": dw,
                "swing": swing,
                "wall": shared,
            }
        )

    return {"windows": windows, "doors": doors, "ventilation": ventilation_report}
