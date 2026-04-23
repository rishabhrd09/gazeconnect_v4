"""
NBC 2016 and accessibility constraints for GazePlan v5.
Phase 1 foundation module (pure-data + validation helpers).
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, Tuple


NBC_2016_MINIMUMS: Dict[str, Tuple[float, ...]] = {
    # room_type: (min_area_sqft, min_width_ft, min_depth_ft, min_height_ft)
    "habitable_single": (102.0, 7.87, 7.87, 9.02),
    "habitable_secondary": (81.0, 6.89, 6.89, 9.02),
    "kitchen_separate": (48.4, 4.92, 4.92, 9.02),
    "kitchen_dining": (81.0, 6.89, 6.89, 9.02),
    "wc_only": (11.8, 2.95, 2.95, 7.22),
    "bathroom_only": (19.4, 3.94, 3.94, 7.22),
    "bath_wc_combined": (30.1, 3.94, 3.94, 7.22),
    "store_room": (32.3, 0.0, 0.0, 0.0),
    "garage_minimum": (159.8, 9.02, 17.72, 7.87),
    "garage_recommended": (193.8, 9.84, 19.69, 7.87),
    # single-value constraints
    "staircase_width": (2.95,),
    "staircase_width_group": (4.10,),
    "corridor_width": (3.28,),
    "stair_riser_max_general": (5.91,),
    "stair_riser_max_single": (7.48,),
    "stair_tread_min": (9.84,),
}


NBC_VENTILATION: Dict[str, float] = {
    "warm_humid": 1.0 / 6.0,
    "composite": 1.0 / 8.0,
    "cold": 1.0 / 12.0,
    "kitchen_surcharge": 1.25,
    "kitchen_min_opening_sqft": 10.76,
    "bathroom_min_vent_sqft": 3.98,
}
VENTILATION_DEFAULT_CLIMATE = "composite"


NBC_ROOM_MAPPING: Dict[str, str] = {
    "masterbed": "habitable_single",
    "master": "habitable_single",
    "bedroom": "habitable_secondary",
    "living": "habitable_single",
    "drawing": "habitable_single",
    "dining": "habitable_secondary",
    "kitchen": "kitchen_separate",
    "bathroom": "bath_wc_combined",
    "commonbath": "bath_wc_combined",
    "staircase": "staircase_width",
    "diningstaircase": "staircase_width",
    "store": "store_room",
    "icu": "habitable_single",
    "pooja": "store_room",
    "study": "habitable_secondary",
    "servant": "habitable_secondary",
    "wash": "wc_only",
    "utility": "store_room",
    "garage": "garage_minimum",
}


ACCESSIBILITY_CONSTRAINTS: Dict[str, Any] = {
    "turning_radius_ft": 4.92,
    "ramp_slope_max": 1.0 / 12.0,
    "door_width_min_ft": 3.28,
    "corridor_width_ft": 4.92,
    "threshold_max_in": 0.5,
    "grab_bar_required": True,
    "bed_clearance_ft": 3.0,
}


SETBACK_DEFAULTS: Dict[str, float] = {
    "front_ft": 9.84,
    "rear_ft": 9.84,
    "side_ft": 6.56,
}


def _norm_room_id(room_id: str) -> str:
    return (room_id or "").strip().lower().replace("_", "")


def _as_float(v: Any, default: float) -> float:
    try:
        return float(v)
    except Exception:
        return default


def get_nbc_key(room_id: str, kitchen_mode: str = "separate") -> str:
    rid = _norm_room_id(room_id)
    if rid == "kitchen":
        return "kitchen_dining" if str(kitchen_mode).lower() == "dining" else "kitchen_separate"
    return NBC_ROOM_MAPPING.get(rid, "habitable_secondary")


def get_nbc_requirements(
    room_id: str,
    *,
    kitchen_mode: str = "separate",
    accessibility: bool = False,
) -> Dict[str, float]:
    """
    Return normalized constraints:
      min_area_sqft, min_width_ft, min_depth_ft, min_height_ft
    """
    key = get_nbc_key(room_id, kitchen_mode=kitchen_mode)
    raw = NBC_2016_MINIMUMS.get(key, NBC_2016_MINIMUMS["habitable_secondary"])
    vals = list(raw) + [0.0] * (4 - len(raw))
    out = {
        "min_area_sqft": vals[0],
        "min_width_ft": vals[1],
        "min_depth_ft": vals[2],
        "min_height_ft": vals[3],
    }

    if accessibility:
        # accessibility overrides for walkability
        out["min_width_ft"] = max(out["min_width_ft"], ACCESSIBILITY_CONSTRAINTS["door_width_min_ft"])
        if key in {"bath_wc_combined", "bathroom_only", "wc_only"}:
            out["min_width_ft"] = max(out["min_width_ft"], 4.92)
            out["min_depth_ft"] = max(out["min_depth_ft"], 4.92)
            out["min_area_sqft"] = max(out["min_area_sqft"], 24.2)
    return out


def get_nbc_min_area(room_id: str, *, kitchen_mode: str = "separate", accessibility: bool = False) -> float:
    return get_nbc_requirements(room_id, kitchen_mode=kitchen_mode, accessibility=accessibility)["min_area_sqft"]


def estimate_buildable_area_sqft(
    plot_w_ft: float,
    plot_d_ft: float,
    setbacks: Dict[str, float] | None = None,
) -> Tuple[float, Dict[str, float]]:
    s = dict(SETBACK_DEFAULTS)
    if isinstance(setbacks, dict):
        s.update({k: _as_float(v, s.get(k, 0.0)) for k, v in setbacks.items()})
    buildable_w = max(0.0, plot_w_ft - 2.0 * s["side_ft"])
    buildable_d = max(0.0, plot_d_ft - s["front_ft"] - s["rear_ft"])
    return (buildable_w * buildable_d), {"buildable_w_ft": buildable_w, "buildable_d_ft": buildable_d, **s}


def validate_feasibility(
    rooms: Iterable[Dict[str, Any]],
    plot_w_ft: float,
    plot_d_ft: float,
    setbacks: Dict[str, float] | None = None,
    *,
    circulation_overhead: float = 0.20,
    kitchen_mode: str = "separate",
    accessibility: bool = False,
) -> Tuple[bool, Dict[str, Any]]:
    """
    Stage-0 feasibility pre-check.
    Returns: (is_feasible, report_dict)
    """
    buildable_area, shape = estimate_buildable_area_sqft(plot_w_ft, plot_d_ft, setbacks)
    total_min_area = 0.0
    detail = []
    for r in rooms:
        rid = str(r.get("roomId", "")).strip()
        area = get_nbc_min_area(rid, kitchen_mode=kitchen_mode, accessibility=accessibility)
        total_min_area += area
        detail.append({"roomId": rid, "min_area_sqft": round(area, 2)})

    denom = max(0.01, 1.0 - max(0.0, min(0.6, circulation_overhead)))
    required_area = total_min_area / denom
    feasible = required_area <= buildable_area
    if feasible:
        return True, {
            "status": "FEASIBLE",
            "buildable_sqft": round(buildable_area, 1),
            "required_sqft": round(required_area, 1),
            "circulation_overhead": circulation_overhead,
            "setbacks": shape,
            "room_breakdown": detail,
        }

    return False, {
        "status": "INFEASIBLE",
        "error": "INFEASIBLE",
        "buildable_sqft": round(buildable_area, 1),
        "required_sqft": round(required_area, 1),
        "deficit_sqft": round(required_area - buildable_area, 1),
        "circulation_overhead": circulation_overhead,
        "setbacks": shape,
        "room_breakdown": detail,
        "suggestion": "Remove a room, reduce min requirements, or increase buildable area/plot size.",
    }

