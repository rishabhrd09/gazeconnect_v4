"""Conservative, deterministic Compass Map layout alternatives.

The 4 x 4 cells remain ownership anchors.  A candidate may move a boundary
between two occupied cells by at most one foot, but it may not move a room to
another cell, invent a room, or move a stair.  Geometry is expressed as exact
per-cell rectangles so an irregular room keeps its true area.

This module deliberately does not claim to produce a construction drawing or
to check local building-code compliance.  It rejects unsupported historical
edits instead of silently discarding them.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
import time
from collections import deque
from typing import Any, Dict, List, Optional, Tuple

from .nbc_standards import get_nbc_requirements


_CELL = re.compile(r"^r([1-9]\d*)_c([1-9]\d*)$", re.IGNORECASE)
_FLOORS = ("ground_floor", "first_floor")
_PROFILE_NAMES = (
    ("faithful", "Closest to my map", "Uses the selected compass cells without moving their boundaries."),
    ("room_balance", "Room balance", "Gives priority to living and bedroom space where a shared boundary can move."),
    ("circulation", "Circulation space", "Gives priority to living, porch and stair-adjacent space where possible."),
    ("private_rooms", "Private rooms", "Gives priority to bedrooms and bathrooms where a shared boundary can move."),
)
_OUTDOOR = ("lawn", "garden", "porch", "verandah", "backyard", "balcony", "terrace")
_DOOR_WIDTH_FT = 3.0
_DOOR_CORNER_CLEARANCE_FT = 1.0
_MIN_DOOR_WALL_FT = _DOOR_WIDTH_FT + 2 * _DOOR_CORNER_CLEARANCE_FT
_MIN_STAIR_SHARED_WIDTH_FT = 3.0
_MIN_STAIR_SHARED_LENGTH_FT = 6.0


def _error(code: str, message: str, *, details: Optional[List[str]] = None) -> Dict[str, Any]:
    return {"status": code, "error": message, "details": details or [], "candidates": [], "rejected": []}


def _finite_positive(value: Any) -> Optional[float]:
    try:
        result = float(value)
    except (ValueError, TypeError):
        return None
    return result if math.isfinite(result) and result > 0 else None


def _cell_rc(value: Any, rows: int, cols: int) -> Optional[Tuple[int, int]]:
    match = _CELL.fullmatch(str(value))
    if not match:
        return None
    row, col = int(match.group(1)), int(match.group(2))
    return (row, col) if 1 <= row <= rows and 1 <= col <= cols else None


def _cell_key(row: int, col: int) -> str:
    return f"r{row}_c{col}"


def _cell_rect(cell: str, width: float, depth: float, rows: int, cols: int) -> Dict[str, float]:
    match = _CELL.fullmatch(cell)
    assert match is not None
    row, col = int(match.group(1)), int(match.group(2))
    return {
        "x1": (col - 1) * width / cols,
        "y1": (row - 1) * depth / rows,
        "x2": col * width / cols,
        "y2": row * depth / rows,
    }


def _room_kind(placement: Dict[str, Any]) -> str:
    text = f"{placement.get('roomId', '')} {placement.get('room', '')}".lower().replace("_", "")
    if "stair" in text or "landing" in text:
        return "staircase"
    if "master" in text and "bed" in text:
        return "masterbed"
    if "bed" in text:
        return "bedroom"
    if "bath" in text:
        return "bathroom"
    if "living" in text:
        return "living"
    if "drawing" in text:
        return "drawing"
    if "dining" in text:
        return "dining"
    if "kitchen" in text:
        return "kitchen"
    if "icu" in text or "caretaker" in text:
        return "icu"
    for word in _OUTDOOR:
        if word in text:
            return word
    return str(placement.get("roomId") or "room").lower()


def _rects(placement: Dict[str, Any]) -> Dict[str, Dict[str, float]]:
    return {str(rect["cell"]): rect for rect in placement.get("geometryRects", [])}


def _refresh_geometry(placement: Dict[str, Any]) -> None:
    rects = placement["geometryRects"]
    placement["coords"] = {
        "x1": min(r["x1"] for r in rects),
        "y1": min(r["y1"] for r in rects),
        "x2": max(r["x2"] for r in rects),
        "y2": max(r["y2"] for r in rects),
    }
    placement["area_sqft"] = round(sum((r["x2"] - r["x1"]) * (r["y2"] - r["y1"]) for r in rects), 3)


def _normalise_map(compass_map: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    if not isinstance(compass_map, dict):
        return None, ["Compass Map must be an object."]
    if "compass_map" in compass_map and isinstance(compass_map["compass_map"], dict):
        compass_map = compass_map["compass_map"]
    result = copy.deepcopy(compass_map)
    plot = result.get("plot") or {}
    width = _finite_positive(plot.get("width_ft"))
    depth = _finite_positive(plot.get("depth_ft"))
    if width is None or depth is None:
        return None, ["Plot width_ft and depth_ft must be positive finite numbers."]
    grid = result.get("grid_size") or {"rows": 4, "cols": 4}
    try:
        rows, cols = int(grid.get("rows", 4)), int(grid.get("cols", 4))
    except (ValueError, TypeError):
        return None, ["Grid rows and columns must be integers."]
    if not (1 <= rows <= 4 and 1 <= cols <= 4):
        return None, ["Candidate review currently supports grids of up to 4 rows and 4 columns."]
    result["grid_size"] = {"rows": rows, "cols": cols}
    if "ground_floor" not in result and isinstance(result.get("placements"), list):
        result["ground_floor"] = {"placements": result.pop("placements")}

    issues: List[str] = []
    floor_count = str(plot.get("num_floors") or plot.get("numFloors") or "").lower()
    first_floor = result.get("first_floor")
    if ("multi" in floor_count or floor_count in {"2", "two"}) and not (isinstance(first_floor, dict) and first_floor.get("placements")):
        issues.append("A multi-floor map needs first-floor placements before plan review.")
    seen_ids: set[str] = set()
    found = False
    for floor in _FLOORS:
        floor_obj = result.get(floor)
        if not isinstance(floor_obj, dict):
            continue
        placements = floor_obj.get("placements")
        if not isinstance(placements, list):
            issues.append(f"{floor}: placements must be a list.")
            continue
        if not placements:
            continue
        found = True
        # Inspect the actual AdvancedRefinements shape and any future/legacy
        # aliases.  A nonempty edit that has not been mapped to exact geometry
        # must not disappear when the candidate renderer takes geometryRects.
        if "advanced_refinements" in floor_obj:
            refinements = floor_obj.get("advanced_refinements")
        elif "refinements" in floor_obj:
            refinements = floor_obj.get("refinements")
        else:
            refinements = result.get("advanced_refinements") or result.get("refinements")
        if isinstance(refinements, dict):
            active = [key for key, value in refinements.items() if key != "version" and bool(value)]
            if active:
                issues.append(f"{floor}: saved refinements require migration before alternatives: {', '.join(sorted(active))}.")
        if floor_obj.get("cell_layouts") or ("cell_layouts" not in floor_obj and result.get("cell_layouts")):
            issues.append(f"{floor}: saved cell layouts require migration before alternatives.")

        occupied: set[str] = set()
        for index, p in enumerate(placements):
            if not isinstance(p, dict):
                issues.append(f"{floor} placement {index + 1} must be an object.")
                continue
            cells_input = p.get("cells") or p.get("occupiedCells") or []
            if not isinstance(cells_input, list):
                issues.append(f"{floor} placement {index + 1} cells must be a list.")
                continue
            cells: List[str] = []
            for raw in cells_input:
                rc = _cell_rc(raw, rows, cols)
                if rc is None:
                    issues.append(f"{floor} placement {index + 1} has invalid cell {raw!r}.")
                    continue
                cell = _cell_key(*rc)
                if cell in occupied or cell in cells:
                    issues.append(f"{floor} cell {cell} is assigned more than once.")
                    continue
                cells.append(cell)
            if not cells:
                issues.append(f"{floor} placement {index + 1} has no occupied cells.")
                continue
            occupied.update(cells)
            cells.sort(key=lambda c: _cell_rc(c, rows, cols) or (0, 0))
            p["cells"] = cells
            placement_id = str(p.get("placementId") or f"{floor}:p{index + 1}")
            if placement_id in seen_ids:
                issues.append(f"Duplicate placementId {placement_id!r}.")
            seen_ids.add(placement_id)
            p["placementId"] = placement_id
            p["roomId"] = str(p.get("roomId") or p.get("room_id") or "room")
            p["room"] = str(p.get("room") or p.get("roomLabel") or p["roomId"])
            raw_geometry = p.get("geometryRects")
            geometry: List[Dict[str, Any]] = []
            if isinstance(raw_geometry, list) and raw_geometry:
                if len(raw_geometry) != len(cells):
                    issues.append(f"{placement_id}: geometryRects must correspond one-to-one with occupied cells.")
                    continue
                for cell, raw_rect in zip(cells, raw_geometry):
                    if not isinstance(raw_rect, dict):
                        issues.append(f"{placement_id}: invalid geometry rectangle.")
                        continue
                    cell_name = str(raw_rect.get("cell") or cell)
                    try:
                        coords = {key: float(raw_rect[key]) for key in ("x1", "y1", "x2", "y2")}
                    except (KeyError, ValueError, TypeError):
                        issues.append(f"{placement_id}: invalid geometry coordinates.")
                        continue
                    if not all(math.isfinite(value) for value in coords.values()):
                        issues.append(f"{placement_id}: geometry coordinates must be finite.")
                        continue
                    geometry.append({"cell": cell_name, **coords})
            else:
                geometry = [{"cell": cell, **_cell_rect(cell, width, depth, rows, cols)} for cell in cells]
            if {r["cell"] for r in geometry} != set(cells):
                issues.append(f"{placement_id}: geometry cell identities do not match placement cells.")
            if geometry:
                p["geometryRects"] = sorted(geometry, key=lambda r: cells.index(r["cell"]) if r["cell"] in cells else 999)
                _refresh_geometry(p)
    if not found:
        issues.append("No room placements were found.")
    return (result if not issues else None), issues


def _priority(profile: str, kind: str) -> int:
    if profile == "room_balance":
        return {"living": 5, "masterbed": 5, "bedroom": 4, "drawing": 3, "dining": 2, "kitchen": 2}.get(kind, 0)
    if profile == "circulation":
        return {"staircase": 6, "porch": 5, "verandah": 5, "living": 4, "dining": 3, "drawing": 2}.get(kind, 0)
    if profile == "private_rooms":
        return {"masterbed": 6, "bedroom": 5, "icu": 5, "bathroom": 4, "study": 3}.get(kind, 0)
    return 0


def _cell_owners(floor_obj: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    return {cell: p for p in floor_obj.get("placements", []) for cell in p.get("cells", [])}


def _move_shared_edge(a: Dict[str, Any], b: Dict[str, Any], axis: str, shift: float) -> None:
    if axis == "x":
        a["x2"] += shift
        b["x1"] += shift
    else:
        a["y2"] += shift
        b["y1"] += shift


def _apply_profile(compass_map: Dict[str, Any], profile: str) -> None:
    if profile == "faithful":
        return
    rows = compass_map["grid_size"]["rows"]
    cols = compass_map["grid_size"]["cols"]
    # Shift a single axis per profile.  Crossing independent X/Y seam shifts
    # at a four-cell junction can otherwise create a small diagonal overlap.
    active_axis = "y" if profile == "circulation" else "x"
    for floor in _FLOORS:
        floor_obj = compass_map.get(floor)
        if not isinstance(floor_obj, dict):
            continue
        owners = _cell_owners(floor_obj)
        rect_maps = {p["placementId"]: _rects(p) for p in floor_obj.get("placements", [])}
        for row in range(1, rows + 1):
            for col in range(1, cols + 1):
                cell = _cell_key(row, col)
                left_or_top = owners.get(cell)
                if not left_or_top:
                    continue
                for neighbor, axis in ((_cell_key(row, col + 1), "x"), (_cell_key(row + 1, col), "y")):
                    if axis != active_axis:
                        continue
                    right_or_bottom = owners.get(neighbor)
                    if not right_or_bottom or left_or_top is right_or_bottom:
                        continue
                    if left_or_top.get("lockedGeometry") or right_or_bottom.get("lockedGeometry"):
                        continue
                    kind_a, kind_b = _room_kind(left_or_top), _room_kind(right_or_bottom)
                    # Stairs are fixed: their footprint must remain aligned between floors.
                    if kind_a == "staircase" or kind_b == "staircase":
                        continue
                    difference = _priority(profile, kind_a) - _priority(profile, kind_b)
                    if difference == 0:
                        continue
                    shift = 0.8 if difference > 0 else -0.8
                    ra = rect_maps[left_or_top["placementId"]][cell]
                    rb = rect_maps[right_or_bottom["placementId"]][neighbor]
                    _move_shared_edge(ra, rb, axis, shift)
        for p in floor_obj.get("placements", []):
            _refresh_geometry(p)


def _overlap(a: Dict[str, float], b: Dict[str, float]) -> float:
    return max(0.0, min(a["x2"], b["x2"]) - max(a["x1"], b["x1"])) * max(
        0.0, min(a["y2"], b["y2"]) - max(a["y1"], b["y1"])
    )


def _shared_edge(a: Dict[str, float], b: Dict[str, float]) -> Optional[Dict[str, float]]:
    tolerance = 1e-5
    if abs(a["x2"] - b["x1"]) < tolerance or abs(b["x2"] - a["x1"]) < tolerance:
        x = a["x2"] if abs(a["x2"] - b["x1"]) < tolerance else a["x1"]
        lo, hi = max(a["y1"], b["y1"]), min(a["y2"], b["y2"])
        if hi - lo > tolerance:
            return {"x1": x, "y1": lo, "x2": x, "y2": hi}
    if abs(a["y2"] - b["y1"]) < tolerance or abs(b["y2"] - a["y1"]) < tolerance:
        y = a["y2"] if abs(a["y2"] - b["y1"]) < tolerance else a["y1"]
        lo, hi = max(a["x1"], b["x1"]), min(a["x2"], b["x2"])
        if hi - lo > tolerance:
            return {"x1": lo, "y1": y, "x2": hi, "y2": y}
    return None


def _edge_length(edge: Dict[str, float]) -> float:
    return abs(edge["x2"] - edge["x1"]) + abs(edge["y2"] - edge["y1"])


def _opening(edge: Dict[str, float], width: float = _DOOR_WIDTH_FT) -> Dict[str, float]:
    if abs(edge["x2"] - edge["x1"]) < 1e-5:
        mid = (edge["y1"] + edge["y2"]) / 2
        return {"x1": edge["x1"], "y1": mid - width / 2, "x2": edge["x2"], "y2": mid + width / 2}
    mid = (edge["x1"] + edge["x2"]) / 2
    return {"x1": mid - width / 2, "y1": edge["y1"], "x2": mid + width / 2, "y2": edge["y2"]}


def _contained_on_edge(opening: Dict[str, float], edge: Dict[str, float]) -> bool:
    tolerance = 1e-4
    if abs(edge["x2"] - edge["x1"]) < tolerance:
        return (
            abs(opening["x1"] - edge["x1"]) < tolerance
            and abs(opening["x2"] - edge["x2"]) < tolerance
            and opening["y1"] >= edge["y1"] - tolerance
            and opening["y2"] <= edge["y2"] + tolerance
        )
    return (
        abs(opening["y1"] - edge["y1"]) < tolerance
        and abs(opening["y2"] - edge["y2"]) < tolerance
        and opening["x1"] >= edge["x1"] - tolerance
        and opening["x2"] <= edge["x2"] + tolerance
    )


def _coverage_issue(
    rect_entries: List[Tuple[str, Dict[str, float]]],
    occupied_cells: set[str],
    width: float,
    depth: float,
    rows: int,
    cols: int,
) -> Optional[str]:
    """Compare the exact rectangle union with the original occupied-cell union."""
    xs = sorted({i * width / cols for i in range(cols + 1)} | {r[key] for _, r in rect_entries for key in ("x1", "x2")})
    ys = sorted({i * depth / rows for i in range(rows + 1)} | {r[key] for _, r in rect_entries for key in ("y1", "y2")})
    for x1, x2 in zip(xs, xs[1:]):
        if x2 - x1 < 1e-6:
            continue
        x = (x1 + x2) / 2
        col = min(cols, max(1, int(math.floor(x * cols / width)) + 1))
        active = [r for _, r in rect_entries if r["x1"] < x < r["x2"]]
        for y1, y2 in zip(ys, ys[1:]):
            if y2 - y1 < 1e-6:
                continue
            y = (y1 + y2) / 2
            row = min(rows, max(1, int(math.floor(y * rows / depth)) + 1))
            expected = _cell_key(row, col) in occupied_cells
            actual_count = sum(r["y1"] < y < r["y2"] for r in active)
            if actual_count != int(expected):
                return f"Candidate geometry has a gap, spill, or overlap near ({x:.2f}, {y:.2f}) ft."
    return None


def _door_issues(floor: str, floor_obj: Dict[str, Any], plot: Dict[str, Any]) -> List[str]:
    by_id = {p["placementId"]: p for p in floor_obj["placements"]}
    problems: List[str] = []
    width, depth = float(plot["width_ft"]), float(plot["depth_ft"])
    for index, opening in enumerate(floor_obj.get("doorOpenings", [])):
        try:
            segment = {key: float(opening[key]) for key in ("x1", "y1", "x2", "y2")}
            a = str(opening["fromPlacementId"])
            b = str(opening["toPlacementId"])
        except (KeyError, TypeError, ValueError):
            problems.append(f"{floor}: door opening {index + 1} is malformed.")
            continue
        if abs(_edge_length(segment) - _DOOR_WIDTH_FT) > 1e-3:
            problems.append(f"{floor}: door opening {index + 1} is not 3 ft wide.")
            continue
        if a == "outside":
            room = by_id.get(b)
            if room is None:
                problems.append(f"{floor}: exterior door {index + 1} has no room.")
                continue
            candidate_edges = [
                edge
                for rect in room["geometryRects"]
                for edge in (
                    {"x1": rect["x1"], "y1": rect["y1"], "x2": rect["x2"], "y2": rect["y1"]},
                    {"x1": rect["x1"], "y1": rect["y2"], "x2": rect["x2"], "y2": rect["y2"]},
                    {"x1": rect["x1"], "y1": rect["y1"], "x2": rect["x1"], "y2": rect["y2"]},
                    {"x1": rect["x2"], "y1": rect["y1"], "x2": rect["x2"], "y2": rect["y2"]},
                )
                if _edge_length(edge) + 1e-5 >= _MIN_DOOR_WALL_FT
                and (
                    abs(edge["x1"]) < 1e-5 and abs(edge["x2"]) < 1e-5
                    or abs(edge["x1"] - width) < 1e-5 and abs(edge["x2"] - width) < 1e-5
                    or abs(edge["y1"]) < 1e-5 and abs(edge["y2"]) < 1e-5
                    or abs(edge["y1"] - depth) < 1e-5 and abs(edge["y2"] - depth) < 1e-5
                )
            ]
        else:
            room_a, room_b = by_id.get(a), by_id.get(b)
            if room_a is None or room_b is None:
                problems.append(f"{floor}: door opening {index + 1} references an unknown room.")
                continue
            candidate_edges = [
                edge
                for rect_a in room_a["geometryRects"]
                for rect_b in room_b["geometryRects"]
                if (edge := _shared_edge(rect_a, rect_b)) is not None
                and _edge_length(edge) + 1e-5 >= _MIN_DOOR_WALL_FT
            ]
        if not any(_contained_on_edge(segment, edge) for edge in candidate_edges):
            problems.append(f"{floor}: door opening {index + 1} is not contained in its actual wall span.")
    return problems


def _access_route(compass_map: Dict[str, Any], floor: str) -> Tuple[List[str], List[Dict[str, Any]], Dict[str, Any]]:
    floor_obj = compass_map[floor]
    placements = floor_obj["placements"]
    plot = compass_map["plot"]
    width = float(plot["width_ft"])
    nodes: Dict[str, List[Dict[str, float]]] = {
        p["placementId"]: list(p["geometryRects"]) for p in placements
    }
    # Unassigned cells are never assumed to be safe circulation.  A route
    # through them needs an explicit corridor/porch placement by the user.
    graph: Dict[str, List[Tuple[str, Dict[str, float]]]] = {node: [] for node in nodes}
    kind_by_id = {p["placementId"]: _room_kind(p) for p in placements}
    node_ids = sorted(nodes)
    for index, a in enumerate(node_ids):
        for b in node_ids[index + 1 :]:
            best = None
            for ar in nodes[a]:
                for br in nodes[b]:
                    shared = _shared_edge(ar, br)
                    if shared and _edge_length(shared) + 1e-5 >= _MIN_DOOR_WALL_FT:
                        if best is None or _edge_length(shared) > _edge_length(best):
                            best = shared
            if best is not None:
                graph[a].append((b, best))
                graph[b].append((a, best))

    entry_opening: Optional[Dict[str, Any]] = None
    if floor == "first_floor":
        roots = [p["placementId"] for p in placements if _room_kind(p) == "staircase"]
    else:
        def at_gate(rect: Dict[str, float]) -> bool:
            # Compass Map always puts the road/front on row 1 (y=0).
            # `facing` rotates the compass labels, not plot geometry.
            return abs(rect["y1"]) < 1e-5
        roots = [node for node, rects in nodes.items() if any(at_gate(r) for r in rects)]
    if not roots:
        if floor == "ground_floor":
            message = f"{floor}: no placed room reaches the road/front row; place a porch or entry room there before generating plans."
        else:
            message = f"{floor}: place a stair landing that overlaps the ground-floor stair area."
        return [message], [], {"reachable_rooms": 0}
    if floor == "first_floor":
        roots = [sorted(roots)[0]]
    else:
        # The exterior route must meet the actual Left/Center/Right gate shown
        # on the Compass Map. A door also needs clearance from room corners.
        gate_choice = str(plot.get("gate_position") or "Center").capitalize()
        if gate_choice not in {"Left", "Center", "Right"}:
            return [f"ground_floor: unknown main-gate position {gate_choice!r}."], [], {"reachable_rooms": 0}
        gate_center = width * {"Left": 0.125, "Center": 0.5, "Right": 0.875}[gate_choice]
        gate_lo, gate_hi = gate_center - width / 8, gate_center + width / 8
        gate_options: List[Tuple[int, float, str, Optional[Dict[str, Any]]]] = []
        for node in roots:
            kind = kind_by_id[node]
            preference = 0 if kind in {"porch", "verandah"} else 1 if kind in {"living", "drawing"} else 2
            for rect in nodes[node]:
                if not at_gate(rect):
                    continue
                if kind in _OUTDOOR:
                    lo, hi = max(rect["x1"], gate_lo), min(rect["x2"], gate_hi)
                    if hi - lo >= _DOOR_WIDTH_FT - 1e-5:
                        gate_options.append((preference, abs((lo + hi) / 2 - gate_center), node, None))
                    continue
                lo = max(rect["x1"] + _DOOR_CORNER_CLEARANCE_FT, gate_lo)
                hi = min(rect["x2"] - _DOOR_CORNER_CLEARANCE_FT, gate_hi)
                if hi - lo < _DOOR_WIDTH_FT - 1e-5:
                    continue
                door_center = min(max(gate_center, lo + _DOOR_WIDTH_FT / 2), hi - _DOOR_WIDTH_FT / 2)
                opening = {
                    "x1": door_center - _DOOR_WIDTH_FT / 2, "y1": 0.0,
                    "x2": door_center + _DOOR_WIDTH_FT / 2, "y2": 0.0,
                    "fromPlacementId": "outside", "toPlacementId": node,
                }
                gate_options.append((preference, abs(door_center - gate_center), node, opening))
        if not gate_options:
            return [
                f"ground_floor: no placed entry room or porch connects to the {gate_choice.lower()} main gate. "
                "Place one along the matching road-facing cells."
            ], [], {"reachable_rooms": 0}
        _, _, entry_root, entry_opening = min(gate_options, key=lambda option: (option[0], option[1], option[2]))
        roots = [entry_root]
    queue = deque(sorted(roots))
    visited = set(roots)
    door_openings: List[Dict[str, Any]] = []
    while queue:
        a = queue.popleft()
        for b, edge in sorted(graph[a], key=lambda entry: entry[0]):
            if b in visited:
                continue
            visited.add(b)
            queue.append(b)
            if not (kind_by_id.get(a) in _OUTDOOR and kind_by_id.get(b) in _OUTDOOR):
                door_openings.append({**_opening(edge), "fromPlacementId": a, "toPlacementId": b})
    unreachable = [p["placementId"] for p in placements if p["placementId"] not in visited]
    placement_by_id = {p["placementId"]: p for p in placements}
    issues = [
        f"{floor}: {placement_by_id[pid]['room']} ({pid}) has no shared-wall route for a 3 ft door. "
        "Place an explicit passage or porch in the empty cells, or move the room beside a connected room."
        for pid in unreachable
    ]
    if entry_opening is not None:
        door_openings.append(entry_opening)
    return issues, door_openings, {"reachable_rooms": len(placements) - len(unreachable), "total_rooms": len(placements), "uses_unassigned_space": False}


def _validate(compass_map: Dict[str, Any]) -> Dict[str, Any]:
    issues: List[str] = []
    warnings: List[str] = []
    plot = compass_map["plot"]
    width, depth = float(plot["width_ft"]), float(plot["depth_ft"])
    rows, cols = compass_map["grid_size"]["rows"], compass_map["grid_size"]["cols"]
    area_by_floor: Dict[str, float] = {}
    access_by_floor: Dict[str, Any] = {}
    stair_rects: Dict[str, List[Dict[str, float]]] = {}
    for floor in _FLOORS:
        floor_obj = compass_map.get(floor)
        if not isinstance(floor_obj, dict) or not floor_obj.get("placements"):
            continue
        rect_entries: List[Tuple[str, Dict[str, float]]] = []
        occupied_cells = set(_cell_owners(floor_obj))
        stair_rects[floor] = []
        for p in floor_obj["placements"]:
            pid = p["placementId"]
            geometry = p["geometryRects"]
            if _room_kind(p) == "staircase":
                stair_rects[floor].extend(geometry)
            area = 0.0
            for rect in geometry:
                values = (rect["x1"], rect["y1"], rect["x2"], rect["y2"])
                if not all(math.isfinite(float(v)) for v in values):
                    issues.append(f"{pid}: geometry contains a non-finite coordinate.")
                    continue
                if not (-1e-5 <= rect["x1"] < rect["x2"] <= width + 1e-5 and -1e-5 <= rect["y1"] < rect["y2"] <= depth + 1e-5):
                    issues.append(f"{pid}: rectangle leaves the plot or has non-positive dimensions.")
                    continue
                if min(rect["x2"] - rect["x1"], rect["y2"] - rect["y1"]) < 3.0:
                    issues.append(f"{pid}: an area is narrower than 3 ft.")
                cell = rect["cell"]
                original = _cell_rect(cell, width, depth, rows, cols)
                cx = (original["x1"] + original["x2"]) / 2
                cy = (original["y1"] + original["y2"]) / 2
                if not (rect["x1"] <= cx <= rect["x2"] and rect["y1"] <= cy <= rect["y2"]):
                    issues.append(f"{pid}: geometry no longer contains selected compass cell {cell}.")
                area += (rect["x2"] - rect["x1"]) * (rect["y2"] - rect["y1"])
                rect_entries.append((pid, rect))
            if abs(area - float(p["area_sqft"])) > 0.02:
                issues.append(f"{pid}: room area does not match its geometry.")
            kind = _room_kind(p)
            if kind not in _OUTDOOR:
                req = get_nbc_requirements(kind)
                if area + 1e-5 < req["min_area_sqft"]:
                    issues.append(f"{pid}: {area:.1f} sq ft is below the preliminary {kind} area target of {req['min_area_sqft']:.1f} sq ft.")
                if not any(
                    r["x2"] - r["x1"] >= req["min_width_ft"] - 1e-5
                    and r["y2"] - r["y1"] >= req["min_depth_ft"] - 1e-5
                    for r in geometry
                ):
                    issues.append(f"{pid}: no uninterrupted rectangle meets the preliminary width/depth target.")
            # Multiple cells of one room must form one edge-connected polygon.
            visited = {0}
            queue = deque([0])
            while queue:
                i = queue.popleft()
                for j in range(len(geometry)):
                    if j not in visited and (edge := _shared_edge(geometry[i], geometry[j])) and _edge_length(edge) >= 0.5:
                        visited.add(j)
                        queue.append(j)
            if len(visited) != len(geometry):
                issues.append(f"{pid}: occupied room parts are disconnected.")
        for i, (id_a, rect_a) in enumerate(rect_entries):
            for id_b, rect_b in rect_entries[i + 1 :]:
                if _overlap(rect_a, rect_b) > 1e-4:
                    issues.append(f"{floor}: rectangles belonging to {id_a} and {id_b} overlap.")
        area_by_floor[floor] = round(sum(float(p["area_sqft"]) for p in floor_obj["placements"]), 2)
        expected_area = len(occupied_cells) * (width / cols) * (depth / rows)
        if abs(area_by_floor[floor] - expected_area) > 0.05:
            issues.append(f"{floor}: candidate geometry leaves gaps or changes total occupied plot area.")
        # A shifted wall may transfer area only between two selected rooms;
        # it may not silently claim an empty compass cell.
        empty_rects = [
            _cell_rect(_cell_key(row, col), width, depth, rows, cols)
            for row in range(1, rows + 1)
            for col in range(1, cols + 1)
            if _cell_key(row, col) not in occupied_cells
        ]
        if any(_overlap(rect, empty) > 1e-4 for _, rect in rect_entries for empty in empty_rects):
            issues.append(f"{floor}: candidate geometry extends into an unassigned compass cell.")
        coverage_problem = _coverage_issue(rect_entries, occupied_cells, width, depth, rows, cols)
        if coverage_problem:
            issues.append(f"{floor}: {coverage_problem}")
        if empty_rects:
            warnings.append(f"{floor}: {len(empty_rects)} compass cells remain unassigned and are not assumed to be corridors.")
        # Invalid geometry should not be passed to access/wall construction.
        if not issues:
            access_issues, doors, access = _access_route(compass_map, floor)
            issues.extend(access_issues)
            floor_obj["doorOpenings"] = doors
            issues.extend(_door_issues(floor, floor_obj, plot))
            access_by_floor[floor] = access
            if access.get("uses_unassigned_space"):
                warnings.append(f"{floor}: route uses unassigned plot space; verify the final corridor and entrance with a designer.")
    if "first_floor" in stair_rects:
        ground_stairs = stair_rects.get("ground_floor", [])
        first_stairs = stair_rects["first_floor"]
        if not ground_stairs or not first_stairs:
            issues.append("Multi-floor plan requires a stair area on both floors; place the first-floor landing over the ground-floor stair area.")
        else:
            overlaps = [
                (
                    max(0.0, min(ground["x2"], first["x2"]) - max(ground["x1"], first["x1"])),
                    max(0.0, min(ground["y2"], first["y2"]) - max(ground["y1"], first["y1"])),
                )
                for ground in ground_stairs for first in first_stairs
            ]
            if not any(shared_width > 1e-5 and shared_depth > 1e-5 for shared_width, shared_depth in overlaps):
                issues.append("Ground-floor stairs and first-floor landing do not overlap on the plot; move the landing over the staircase.")
            elif not any(
                (shared_width >= _MIN_STAIR_SHARED_WIDTH_FT - 1e-5 and shared_depth >= _MIN_STAIR_SHARED_LENGTH_FT - 1e-5)
                or (shared_depth >= _MIN_STAIR_SHARED_WIDTH_FT - 1e-5 and shared_width >= _MIN_STAIR_SHARED_LENGTH_FT - 1e-5)
                for shared_width, shared_depth in overlaps
            ):
                issues.append("Ground-floor stairs and first-floor landing have no common 3 × 6 ft footprint for a preliminary stair opening.")
    return {
        "valid": not issues,
        "issues": list(dict.fromkeys(issues)),
        "warnings": warnings,
        "preliminary_only": True,
        "access": access_by_floor,
        "area_sqft_by_floor": area_by_floor,
    }


def _geometry_signature(compass_map: Dict[str, Any]) -> str:
    geometry = []
    for floor in _FLOORS:
        floor_obj = compass_map.get(floor)
        if isinstance(floor_obj, dict):
            geometry.extend((floor, p["placementId"], tuple((r["cell"], *(round(r[k], 3) for k in ("x1", "y1", "x2", "y2"))) for r in p["geometryRects"])) for p in floor_obj.get("placements", []))
    return hashlib.sha256(json.dumps(geometry, sort_keys=True).encode()).hexdigest()[:16]


def _source_hash(compass_map: Dict[str, Any]) -> str:
    source = {
        "plot": compass_map.get("plot"),
        "grid_size": compass_map.get("grid_size"),
        "floors": {floor: [{"placementId": p["placementId"], "roomId": p["roomId"], "cells": p["cells"], "geometryRects": p["geometryRects"]} for p in (compass_map.get(floor) or {}).get("placements", [])] for floor in _FLOORS},
    }
    return hashlib.sha256(json.dumps(source, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:16]


def _changes(base: Dict[str, Any], variant: Dict[str, Any]) -> List[Dict[str, Any]]:
    changes = []
    for floor in _FLOORS:
        base_floor = base.get(floor)
        new_floor = variant.get(floor)
        if not isinstance(base_floor, dict) or not isinstance(new_floor, dict):
            continue
        original = {p["placementId"]: p for p in base_floor.get("placements", [])}
        for p in new_floor.get("placements", []):
            old = original[p["placementId"]]
            delta = round(float(p["area_sqft"]) - float(old["area_sqft"]), 1)
            if abs(delta) >= 1.0:
                changes.append({"floor": floor, "placementId": p["placementId"], "room": p["room"], "area_delta_sqft": delta})
    return sorted(changes, key=lambda item: (-abs(item["area_delta_sqft"]), item["floor"], item["placementId"]))


def _room_size(compass_map: Dict[str, Any], floor: str, placement_id: str, direction: str, amount_ft: float) -> Optional[str]:
    floor_obj = compass_map.get(floor)
    if not isinstance(floor_obj, dict):
        return "Requested floor does not exist."
    owner_by_cell = _cell_owners(floor_obj)
    target = next((p for p in floor_obj["placements"] if p["placementId"] == placement_id), None)
    if target is None:
        return "Selected room no longer exists."
    if _room_kind(target) == "staircase":
        return "Stair geometry is fixed to preserve alignment between floors."
    step = {"N": (1, 0), "S": (-1, 0), "E": (0, 1), "W": (0, -1)}[direction]
    rect_maps = {p["placementId"]: _rects(p) for p in floor_obj["placements"]}
    changed: set[str] = set()
    for cell in target["cells"]:
        row, col = _cell_rc(cell, compass_map["grid_size"]["rows"], compass_map["grid_size"]["cols"]) or (0, 0)
        neighbor = _cell_key(row + step[0], col + step[1])
        donor = owner_by_cell.get(neighbor)
        if not donor or donor is target or _room_kind(donor) == "staircase":
            continue
        a = rect_maps[target["placementId"]][cell]
        b = rect_maps[donor["placementId"]][neighbor]
        edge = _shared_edge(a, b)
        if not edge or _edge_length(edge) + 1e-5 < _MIN_DOOR_WALL_FT:
            continue
        signed = amount_ft if direction in {"E", "N"} else -amount_ft
        if direction == "E":
            a["x2"] += signed
            b["x1"] += signed
        elif direction == "W":
            a["x1"] += signed
            b["x2"] += signed
        elif direction == "N":
            a["y2"] += signed
            b["y1"] += signed
        else:
            a["y1"] += signed
            b["y2"] += signed
        changed.add(donor["placementId"])
    if not changed:
        return "This edge has no adjustable neighboring room."
    target["lockedGeometry"] = True
    _refresh_geometry(target)
    for p in floor_obj["placements"]:
        if p["placementId"] in changed:
            p["lockedGeometry"] = True
            _refresh_geometry(p)
    return None


def _allowed_adjustments(compass_map: Dict[str, Any]) -> Dict[str, Dict[str, List[str]]]:
    allowed: Dict[str, Dict[str, List[str]]] = {}
    for floor in _FLOORS:
        floor_obj = compass_map.get(floor)
        if not isinstance(floor_obj, dict):
            continue
        floor_allowed: Dict[str, List[str]] = {}
        for p in floor_obj.get("placements", []):
            directions: List[str] = []
            for direction in ("N", "E", "S", "W"):
                trial = copy.deepcopy(compass_map)
                if _room_size(trial, floor, p["placementId"], direction, 1.0) is None and _validate(trial)["valid"]:
                    directions.append(direction)
            floor_allowed[p["placementId"]] = directions
        allowed[floor] = floor_allowed
    return allowed


def _candidate(base: Dict[str, Any], current: Dict[str, Any], profile: str, title: str, description: str, source_hash: str, *, allow_edits: bool = True) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    validation = _validate(current)
    if not validation["valid"]:
        return None, validation
    changes = _changes(base, current)
    for floor in _FLOORS:
        floor_obj = current.get(floor)
        if isinstance(floor_obj, dict) and floor_obj.get("placements"):
            floor_obj["access"] = validation["access"].get(floor, {})
    signature = _geometry_signature(current)
    candidate_id = f"{source_hash}-{signature}"
    floors = {floor: copy.deepcopy(current[floor]) for floor in _FLOORS if isinstance(current.get(floor), dict) and current[floor].get("placements")}
    return {
        "id": candidate_id,
        "profile": profile,
        "title": title,
        "description": description,
        "source_hash": source_hash,
        "compass_map": current,
        "floors": floors,
        "changes": changes,
        "metrics": {"area_sqft_by_floor": validation["area_sqft_by_floor"], "access": validation["access"], "changed_rooms": len(changes)},
        "validation": validation,
        "allowed_adjustments": _allowed_adjustments(current) if allow_edits else {},
    }, validation


def generate_layout_candidates(compass_map: Dict[str, Any], *, max_candidates: int = 4, timeout_seconds: float = 8) -> Dict[str, Any]:
    """Return up to four truly different validated layouts; never seed-fallback.

    Candidate 1 is the user's literal occupied-cell geometry.  Other candidates
    shift only shared room boundaries within a selected cell's neighborhood.
    """
    base, errors = _normalise_map(compass_map)
    if base is None:
        status = "unsupported_refinements" if any("refinement" in e or "cell layouts" in e for e in errors) else "invalid_input"
        return _error(status, "Compass Map cannot be converted to exact candidate geometry.", details=errors)
    try:
        limit = max(1, min(4, int(max_candidates)))
    except (TypeError, ValueError):
        return _error("invalid_input", "max_candidates must be an integer from 1 to 4.")
    deadline = time.monotonic() + max(0.1, float(timeout_seconds))
    source_hash = _source_hash(base)
    candidates: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []
    signatures: set[str] = set()
    for profile, title, description in _PROFILE_NAMES:
        if len(candidates) >= limit or time.monotonic() >= deadline:
            break
        current = copy.deepcopy(base)
        _apply_profile(current, profile)
        signature = _geometry_signature(current)
        if signature in signatures:
            rejected.append({"profile": profile, "reason": "Same geometry as another candidate."})
            continue
        proposal, validation = _candidate(base, current, profile, title, description, source_hash)
        if proposal is None:
            rejected.append({"profile": profile, "reason": "Geometry or access validation failed.", "issues": validation["issues"]})
            continue
        # Changes below one square foot per room are visually indistinguishable.
        if profile != "faithful" and not proposal["changes"]:
            rejected.append({"profile": profile, "reason": "No meaningful room-size difference."})
            continue
        signatures.add(signature)
        candidates.append(proposal)
    if not candidates:
        details = next((item.get("issues", []) for item in rejected if item.get("issues")), [])
        return {"status": "infeasible", "error": "No candidate passed geometry and access validation.", "details": details, "source_hash": source_hash, "candidates": [], "rejected": rejected, "warnings": []}
    warnings = list(dict.fromkeys(warning for candidate in candidates for warning in candidate["validation"]["warnings"]))
    return {"status": "ok", "source_hash": source_hash, "candidates": candidates, "rejected": rejected, "warnings": warnings, "count": len(candidates)}


def adjust_layout_candidate(compass_map: Dict[str, Any], adjustment: Dict[str, Any]) -> Dict[str, Any]:
    """Expand one selected room toward a neighbor by exactly one or two feet."""
    if not isinstance(adjustment, dict):
        return _error("invalid_adjustment", "Adjustment must be an object.")
    if adjustment.get("action") != "room_size":
        return _error("unsupported_adjustment", "Only room_size is currently supported; access and stair moves need exact opening and cross-floor geometry.")
    floor = str(adjustment.get("floor") or "")
    direction = str(adjustment.get("direction") or "").upper()
    placement_id = str(adjustment.get("placementId") or "")
    if floor not in _FLOORS or direction not in {"N", "E", "S", "W"} or not placement_id:
        return _error("invalid_adjustment", "Provide floor, placementId and direction N/E/S/W.")
    amount = _finite_positive(adjustment.get("amount_ft"))
    if amount not in {1.0, 2.0}:
        return _error("invalid_adjustment", "amount_ft must be exactly 1 or 2.")
    base, errors = _normalise_map(compass_map)
    if base is None:
        status = "unsupported_refinements" if any("refinement" in e or "cell layouts" in e for e in errors) else "invalid_input"
        return _error(status, "Compass Map cannot be adjusted.", details=errors)
    current = copy.deepcopy(base)
    movement_error = _room_size(current, floor, placement_id, direction, amount)
    if movement_error:
        return _error("infeasible", movement_error)
    candidate, validation = _candidate(base, current, "manual_room_size", "Adjusted plan", f"Expanded the selected room {amount:g} ft toward {direction}.", _source_hash(base))
    if candidate is None:
        return {"status": "infeasible", "error": "Adjustment failed geometry or access validation.", "details": validation["issues"]}
    return {"status": "ok", "candidate": candidate}
