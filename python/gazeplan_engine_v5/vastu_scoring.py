"""
Vastu scoring model for GazePlan v5.
Phase 1 foundation module (pure scoring functions).
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Tuple


VASTU_SCORES: Dict[str, Dict[str, int]] = {
    "entrance": {"N": 8, "NE": 10, "E": 9, "SE": -7, "S": 3, "SW": -10, "W": 5, "NW": -3, "CENTER": -10},
    "kitchen": {"N": -5, "NE": -10, "E": -3, "SE": 10, "S": 3, "SW": -5, "W": 3, "NW": 7, "CENTER": -7},
    "pooja": {"N": 7, "NE": 10, "E": 7, "SE": -5, "S": -10, "SW": -7, "W": -3, "NW": -3, "CENTER": -5},
    "masterbed": {"N": -3, "NE": -10, "E": 2, "SE": -7, "S": 7, "SW": 10, "W": 7, "NW": 3, "CENTER": -5},
    "bathroom": {"N": -3, "NE": -10, "E": -3, "SE": 5, "S": -5, "SW": -7, "W": 7, "NW": 10, "CENTER": -10},
    "staircase": {"N": -5, "NE": -10, "E": -5, "SE": 3, "S": 8, "SW": 10, "W": 8, "NW": 5, "CENTER": -10},
    "living": {"N": 10, "NE": 10, "E": 8, "SE": -5, "S": -3, "SW": -7, "W": 3, "NW": 5, "CENTER": 3},
    "study": {"N": 10, "NE": 7, "E": 8, "SE": -3, "S": -5, "SW": -5, "W": 5, "NW": 3, "CENTER": 0},
    "dining": {"N": 5, "NE": 5, "E": 7, "SE": 5, "S": 2, "SW": -5, "W": 7, "NW": 5, "CENTER": -7},
    "bedroom": {"N": 7, "NE": -10, "E": 3, "SE": -7, "S": 3, "SW": -5, "W": 7, "NW": 10, "CENTER": -3},
    "store": {"N": -3, "NE": -7, "E": 2, "SE": 3, "S": 7, "SW": 10, "W": 7, "NW": 5, "CENTER": -5},
    "servant": {"N": -5, "NE": -10, "E": -3, "SE": 7, "S": 3, "SW": -7, "W": 5, "NW": 10, "CENTER": -5},
    "garage": {"N": -5, "NE": -10, "E": -5, "SE": 7, "S": 3, "SW": 5, "W": 3, "NW": 10, "CENTER": -7},
    "drawing": {"N": 8, "NE": 8, "E": 7, "SE": -3, "S": 3, "SW": -5, "W": 5, "NW": 5, "CENTER": 3},
    "icu": {"N": 5, "NE": 3, "E": 7, "SE": -5, "S": 5, "SW": 7, "W": 5, "NW": 3, "CENTER": 0},
}


VASTU_WEIGHTS: Dict[str, float] = {
    "entrance": 3.0,
    "kitchen": 3.0,
    "pooja": 3.0,
    "masterbed": 2.5,
    "bathroom": 2.5,
    "staircase": 2.5,
    "living": 2.0,
    "study": 2.0,
    "dining": 1.5,
    "bedroom": 1.5,
    "store": 1.0,
    "servant": 1.0,
    "garage": 1.0,
    "drawing": 2.0,
    "icu": 2.0,
}


VASTU_BOOLEAN_RULES: Dict[str, Dict[str, Any]] = {
    "brahmasthan_clear": {"bonus": 5, "penalty": -10},
    "ne_lightest": {"bonus": 3, "penalty": -5},
    "sw_heaviest": {"bonus": 3, "penalty": -3},
    "staircase_clockwise": {"bonus": 2, "penalty": 0},
    "cooking_faces_east": {"bonus": 3, "penalty": -3},
    "open_space_ne": {"bonus": 3, "penalty": -3},
}


_ROOM_NORMALIZATION = {
    "masterbed": "masterbed",
    "master": "masterbed",
    "bedroom": "bedroom",
    "living": "living",
    "drawing": "drawing",
    "dining": "dining",
    "kitchen": "kitchen",
    "bathroom": "bathroom",
    "commonbath": "bathroom",
    "staircase": "staircase",
    "diningstaircase": "staircase",
    "store": "store",
    "servant": "servant",
    "garage": "garage",
    "study": "study",
    "pooja": "pooja",
    "icu": "icu",
    "porch": "entrance",
}


def _norm_room(room_id: str) -> str:
    key = (room_id or "").strip().lower().replace("_", "")
    return _ROOM_NORMALIZATION.get(key, key)


def get_vastu_zone(cx: float, cy: float, plot_w: float, plot_d: float) -> str:
    """Return one of N, NE, E, SE, S, SW, W, NW, CENTER."""
    if plot_w <= 0 or plot_d <= 0:
        return "CENTER"
    nx = cx / plot_w
    ny = cy / plot_d

    if nx < 0.33:
        col = "W"
    elif nx > 0.67:
        col = "E"
    else:
        col = ""

    if ny > 0.67:
        row = "N"
    elif ny < 0.33:
        row = "S"
    else:
        row = ""
    return row + col if (row + col) else "CENTER"


def compute_vastu_score(
    rooms: Iterable[Dict[str, Any]],
    plot_w: float,
    plot_d: float,
) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Returns (0-100 score, detail rows).
    Room entries must contain roomId + either (x1,y1,x2,y2) or (cx,cy).
    """
    total = 0.0
    max_possible = 0.0
    min_possible = 0.0
    detail: List[Dict[str, Any]] = []

    for r in rooms:
        rid = _norm_room(str(r.get("roomId", "")))
        if "cx" in r and "cy" in r:
            cx = float(r["cx"])
            cy = float(r["cy"])
        else:
            cx = (float(r.get("x1", 0.0)) + float(r.get("x2", 0.0))) / 2.0
            cy = (float(r.get("y1", 0.0)) + float(r.get("y2", 0.0))) / 2.0
        zone = get_vastu_zone(cx, cy, plot_w, plot_d)
        scores = VASTU_SCORES.get(rid, {})
        weight = float(VASTU_WEIGHTS.get(rid, 1.0))
        v = float(scores.get(zone, 0))
        total += v * weight
        max_possible += 10.0 * weight
        min_possible += -10.0 * weight
        detail.append({"roomId": rid, "zone": zone, "raw_score": v, "weight": weight, "weighted": v * weight})

    if max_possible == min_possible:
        return 50.0, detail
    score = ((total - min_possible) / (max_possible - min_possible)) * 100.0
    return round(score, 1), detail


def _heavy_room(room_id: str) -> bool:
    return _norm_room(room_id) in {"masterbed", "store", "garage", "staircase", "diningstaircase"}


def score_layout_with_booleans(
    rooms: Iterable[Dict[str, Any]],
    plot_w: float,
    plot_d: float,
    *,
    staircase_clockwise: bool | None = None,
    kitchen_faces_east: bool | None = None,
) -> Dict[str, Any]:
    base_score, detail = compute_vastu_score(rooms, plot_w, plot_d)
    bonus_total = 0
    rule_detail = {}

    zones = []
    for r in rooms:
        rid = _norm_room(str(r.get("roomId", "")))
        cx = (float(r.get("x1", 0.0)) + float(r.get("x2", 0.0))) / 2.0
        cy = (float(r.get("y1", 0.0)) + float(r.get("y2", 0.0))) / 2.0
        zones.append((rid, get_vastu_zone(cx, cy, plot_w, plot_d)))

    center_blockers = any(rid in {"bathroom", "staircase"} and z == "CENTER" for rid, z in zones)
    delta = VASTU_BOOLEAN_RULES["brahmasthan_clear"]["penalty" if center_blockers else "bonus"]
    bonus_total += delta
    rule_detail["brahmasthan_clear"] = delta

    ne_heavy = any(_heavy_room(rid) and z == "NE" for rid, z in zones)
    delta = VASTU_BOOLEAN_RULES["ne_lightest"]["penalty" if ne_heavy else "bonus"]
    bonus_total += delta
    rule_detail["ne_lightest"] = delta

    sw_heavy = any(_heavy_room(rid) and z == "SW" for rid, z in zones)
    delta = VASTU_BOOLEAN_RULES["sw_heaviest"]["bonus" if sw_heavy else "penalty"]
    bonus_total += delta
    rule_detail["sw_heaviest"] = delta

    if staircase_clockwise is not None:
        delta = VASTU_BOOLEAN_RULES["staircase_clockwise"]["bonus" if staircase_clockwise else "penalty"]
        bonus_total += delta
        rule_detail["staircase_clockwise"] = delta

    if kitchen_faces_east is not None:
        delta = VASTU_BOOLEAN_RULES["cooking_faces_east"]["bonus" if kitchen_faces_east else "penalty"]
        bonus_total += delta
        rule_detail["cooking_faces_east"] = delta

    has_open_ne = any(rid in {"lawn", "porch", "verandah", "terrace", "balcony", "backyard"} and z in {"N", "E", "NE"} for rid, z in zones)
    delta = VASTU_BOOLEAN_RULES["open_space_ne"]["bonus" if has_open_ne else "penalty"]
    bonus_total += delta
    rule_detail["open_space_ne"] = delta

    final_score = max(0.0, min(100.0, base_score + bonus_total))
    return {
        "base_score": base_score,
        "bonus_delta": bonus_total,
        "final_score": round(final_score, 1),
        "room_detail": detail,
        "rule_detail": rule_detail,
    }

