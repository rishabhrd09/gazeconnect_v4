"""
Stage-3 CP-SAT constraint solver for GazePlan v5.

Hard constraints:
- within buildable boundary
- NBC minimum dimensions/area
- no room overlap

Soft objective:
- preserve compass user intent (stay near seed anchors)
- improve Vastu alignment (move toward best directional anchors)
- improve adjacency compactness
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from .room_adjacency_graph import ADJACENCY_RULES
from .vastu_scoring import VASTU_SCORES, VASTU_WEIGHTS

try:
    from ortools.sat.python import cp_model  # type: ignore
except Exception:  # pragma: no cover
    cp_model = None


ZONE_TARGET = {
    "N": (0.50, 0.84),
    "NE": (0.84, 0.84),
    "E": (0.84, 0.50),
    "SE": (0.84, 0.16),
    "S": (0.50, 0.16),
    "SW": (0.16, 0.16),
    "W": (0.16, 0.50),
    "NW": (0.16, 0.84),
    "CENTER": (0.50, 0.50),
}


@dataclass
class SolverConfig:
    timeout_seconds: int = 30
    unit_cm: int = 10  # discretization unit
    preserve_weight: int = 18
    adjacency_weight: int = 3
    vastu_weight: int = 4
    area_shortfall_weight: int = 16
    area_overshoot_weight: int = 3
    enforce_anchor_bands: bool = True


def _best_vastu_zone(room_id: str) -> str:
    rid = (room_id or "").strip().lower().replace("_", "")
    scores = VASTU_SCORES.get(rid) or VASTU_SCORES.get("bedroom") or {}
    if not scores:
        return "CENTER"
    return max(scores.items(), key=lambda kv: kv[1])[0]


def _ft_to_u(ft: float, unit_cm: int) -> int:
    return max(1, int(round((ft * 30.48) / float(unit_cm))))


def _u_to_ft(u: int, unit_cm: int) -> float:
    return (u * float(unit_cm)) / 30.48


def _sqft_to_u2(sqft: float, unit_cm: int) -> int:
    # 1 sqft = 929.0304 cm^2
    cm2 = max(0.0, float(sqft) * 929.0304)
    denom = max(1.0, float(unit_cm) * float(unit_cm))
    return max(1, int(round(cm2 / denom)))


def _build_unsat_message(rooms: List[Dict[str, Any]], buildable_area: float) -> str:
    required = sum(float(r.get("min_area_sqft", 0.0)) for r in rooms)
    if required <= buildable_area:
        return "Constraint set is unsatisfiable for current width/depth/topology bounds."
    deficit = required - buildable_area
    return (
        f"Minimum required room area is {required:.1f} sqft but buildable area is "
        f"{buildable_area:.1f} sqft (deficit {deficit:.1f} sqft). "
        "Suggestion: remove a room or increase buildable area."
    )


def solve_layout(
    seed_layout: Dict[str, Any],
    *,
    adjacency_graph: Optional[Any] = None,
    config: Optional[SolverConfig] = None,
) -> Dict[str, Any]:
    cfg = config or SolverConfig()
    rooms = list(seed_layout.get("rooms") or [])
    buildable = dict(seed_layout.get("buildable") or {})

    if not rooms:
        return {"status": "empty", "rooms": [], "message": "No rooms provided."}

    if cp_model is None:
        return {
            "status": "fallback_treemap",
            "rooms": rooms,
            "message": "ortools is not installed, using treemap seed.",
        }

    bx1 = float(buildable.get("x1", 0.0))
    by1 = float(buildable.get("y1", 0.0))
    bw = float(buildable.get("width", 1.0))
    bd = float(buildable.get("depth", 1.0))
    buildable_area = float(buildable.get("area", bw * bd))

    model = cp_model.CpModel()

    u_w = _ft_to_u(bw, cfg.unit_cm)
    u_d = _ft_to_u(bd, cfg.unit_cm)
    ux0 = _ft_to_u(bx1, cfg.unit_cm)
    uy0 = _ft_to_u(by1, cfg.unit_cm)

    vars_by_room: Dict[str, Dict[str, Any]] = {}
    keys_by_type: Dict[str, List[str]] = {}
    x_intervals = []
    y_intervals = []
    objective_terms = []

    for i, r in enumerate(rooms):
        room_key = f"room_{i}"
        room_type = str(r.get("roomType") or r.get("roomId") or f"room_{i}")
        room_type_norm = (room_type or "").strip().lower().replace("_", "")
        min_w = max(1, _ft_to_u(float(r.get("min_width_ft", 4.0) or 4.0), cfg.unit_cm))
        min_h = max(1, _ft_to_u(float(r.get("min_depth_ft", 4.0) or 4.0), cfg.unit_cm))
        min_a_ft = float(r.get("min_area_sqft", 16.0) or 16.0)
        min_a_u = _sqft_to_u2(min_a_ft, cfg.unit_cm)
        target_a_ft = max(min_a_ft, float(r.get("target_area_sqft", min_a_ft) or min_a_ft))
        target_a_u = _sqft_to_u2(target_a_ft, cfg.unit_cm)

        w = model.NewIntVar(min_w, u_w, f"w_{i}")
        h = model.NewIntVar(min_h, u_d, f"h_{i}")
        x = model.NewIntVar(ux0, ux0 + u_w - min_w, f"x_{i}")
        y = model.NewIntVar(uy0, uy0 + u_d - min_h, f"y_{i}")

        model.Add(x + w <= ux0 + u_w)
        model.Add(y + h <= uy0 + u_d)

        area = model.NewIntVar(1, u_w * u_d, f"a_{i}")
        model.AddMultiplicationEquality(area, [w, h])
        model.Add(area >= min_a_u)

        # OR-Tools version compatibility:
        # some versions do not accept `x + w` directly as interval end expression.
        x_end = model.NewIntVar(ux0, ux0 + u_w, f"x_end_{i}")
        y_end = model.NewIntVar(uy0, uy0 + u_d, f"y_end_{i}")
        model.Add(x_end == x + w)
        model.Add(y_end == y + h)

        ix = model.NewIntervalVar(x, w, x_end, f"ix_{i}")
        iy = model.NewIntervalVar(y, h, y_end, f"iy_{i}")
        x_intervals.append(ix)
        y_intervals.append(iy)

        # Preserve compass seed intent: keep center near seed center.
        sx = _ft_to_u(float((float(r.get("x1", 0.0)) + float(r.get("x2", 0.0))) * 0.5), cfg.unit_cm)
        sy = _ft_to_u(float((float(r.get("y1", 0.0)) + float(r.get("y2", 0.0))) * 0.5), cfg.unit_cm)
        cx2 = model.NewIntVar(0, 10**7, f"cx2_{i}")
        cy2 = model.NewIntVar(0, 10**7, f"cy2_{i}")
        model.Add(cx2 == (2 * x + w))
        model.Add(cy2 == (2 * y + h))

        dx = model.NewIntVar(0, 10**7, f"dx_{i}")
        dy = model.NewIntVar(0, 10**7, f"dy_{i}")
        model.AddAbsEquality(dx, cx2 - (2 * sx))
        model.AddAbsEquality(dy, cy2 - (2 * sy))
        objective_terms.append(cfg.preserve_weight * dx)
        objective_terms.append(cfg.preserve_weight * dy)

        # Target-area fit: prioritize using available area according to user intent.
        shortfall = model.NewIntVar(0, u_w * u_d, f"short_{i}")
        overshoot = model.NewIntVar(0, u_w * u_d, f"over_{i}")
        model.Add(shortfall >= target_a_u - area)
        model.Add(overshoot >= area - target_a_u)
        objective_terms.append(cfg.area_shortfall_weight * shortfall)
        objective_terms.append(cfg.area_overshoot_weight * overshoot)

        # Stronger topology lock: keep rooms in their original compass-side bands.
        if cfg.enforce_anchor_bands:
            ax = float(r.get("anchor_x", 0.5) or 0.5)
            ay = float(r.get("anchor_y", 0.5) or 0.5)
            left_x = ux0 + int(round(0.45 * u_w))
            right_x = ux0 + int(round(0.55 * u_w))
            front_y = uy0 + int(round(0.45 * u_d))
            back_y = uy0 + int(round(0.55 * u_d))

            if ax <= 0.34:
                model.Add(cx2 <= 2 * right_x)
            elif ax >= 0.66:
                model.Add(cx2 >= 2 * left_x)
            else:
                model.Add(cx2 >= 2 * (ux0 + int(round(0.22 * u_w))))
                model.Add(cx2 <= 2 * (ux0 + int(round(0.78 * u_w))))

            if ay <= 0.34:  # front
                model.Add(cy2 <= 2 * back_y)
            elif ay >= 0.66:  # back
                model.Add(cy2 >= 2 * front_y)
            else:
                model.Add(cy2 >= 2 * (uy0 + int(round(0.22 * u_d))))
                model.Add(cy2 <= 2 * (uy0 + int(round(0.78 * u_d))))

        # Vastu pull: move room center toward ideal direction anchor for this room type.
        best_zone = _best_vastu_zone(room_type_norm)
        txf, tyf = ZONE_TARGET.get(best_zone, ZONE_TARGET["CENTER"])
        tx = _ft_to_u(bx1 + txf * bw, cfg.unit_cm)
        ty = _ft_to_u(by1 + tyf * bd, cfg.unit_cm)
        vx = model.NewIntVar(0, 10**7, f"vx_{i}")
        vy = model.NewIntVar(0, 10**7, f"vy_{i}")
        model.AddAbsEquality(vx, cx2 - (2 * tx))
        model.AddAbsEquality(vy, cy2 - (2 * ty))
        vw = int(max(1.0, VASTU_WEIGHTS.get(room_type_norm, 1.0)) * cfg.vastu_weight)
        objective_terms.append(vw * vx)
        objective_terms.append(vw * vy)

        vars_by_room[room_key] = {
            "x": x,
            "y": y,
            "w": w,
            "h": h,
            "cx2": cx2,
            "cy2": cy2,
            "seed_x": sx,
            "seed_y": sy,
            "room_type": room_type_norm,
        }
        keys_by_type.setdefault(room_type_norm, []).append(room_key)

    model.AddNoOverlap2D(x_intervals, y_intervals)

    # Adjacency compactness objective: keep required pairs closer.
    adj_pairs: List[Tuple[str, str]] = []
    if adjacency_graph is not None:
        try:
            for a, b in adjacency_graph.edges():
                adj_pairs.append((str(a), str(b)))
        except Exception:
            adj_pairs = []
    if not adj_pairs:
        for a, bs in ADJACENCY_RULES.items():
            for b in bs:
                adj_pairs.append((a, b))

    seen = set()
    for a, b in adj_pairs:
        aa = (a or "").strip().lower().replace("_", "")
        bb = (b or "").strip().lower().replace("_", "")
        key = tuple(sorted((aa, bb)))
        a_keys = keys_by_type.get(aa, [])
        b_keys = keys_by_type.get(bb, [])
        if not a_keys or not b_keys or key in seen:
            continue
        seen.add(key)
        # Use closest seed-centered pair for repeated room types.
        best_pair: Optional[Tuple[str, str]] = None
        best_seed_dist = 10**18
        for ka in a_keys:
            for kb in b_keys:
                if ka == kb:
                    continue
                va0 = vars_by_room[ka]
                vb0 = vars_by_room[kb]
                d = abs(va0["seed_x"] - vb0["seed_x"]) + abs(va0["seed_y"] - vb0["seed_y"])
                if d < best_seed_dist:
                    best_seed_dist = d
                    best_pair = (ka, kb)
        if not best_pair:
            continue
        va = vars_by_room[best_pair[0]]
        vb = vars_by_room[best_pair[1]]
        adx = model.NewIntVar(0, 10**7, f"adj_dx_{aa}_{bb}")
        ady = model.NewIntVar(0, 10**7, f"adj_dy_{aa}_{bb}")
        model.AddAbsEquality(adx, va["cx2"] - vb["cx2"])
        model.AddAbsEquality(ady, va["cy2"] - vb["cy2"])
        objective_terms.append(cfg.adjacency_weight * adx)
        objective_terms.append(cfg.adjacency_weight * ady)

    model.Minimize(sum(objective_terms) if objective_terms else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(cfg.timeout_seconds)
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        solved_rooms: List[Dict[str, Any]] = []
        for i, r in enumerate(rooms):
            vv = vars_by_room[f"room_{i}"]
            x = solver.Value(vv["x"])
            y = solver.Value(vv["y"])
            w = solver.Value(vv["w"])
            h = solver.Value(vv["h"])
            out = dict(r)
            out["x1"] = _u_to_ft(x, cfg.unit_cm)
            out["y1"] = _u_to_ft(y, cfg.unit_cm)
            out["x2"] = _u_to_ft(x + w, cfg.unit_cm)
            out["y2"] = _u_to_ft(y + h, cfg.unit_cm)
            out["width_ft"] = out["x2"] - out["x1"]
            out["depth_ft"] = out["y2"] - out["y1"]
            out["area_sqft"] = out["width_ft"] * out["depth_ft"]
            solved_rooms.append(out)
        return {
            "status": "solved",
            "rooms": solved_rooms,
            "message": "CP-SAT solved successfully.",
            "objective": solver.ObjectiveValue(),
        }

    if status == cp_model.INFEASIBLE:
        return {
            "status": "infeasible",
            "rooms": rooms,
            "message": _build_unsat_message(rooms, buildable_area),
        }

    return {
        "status": "fallback_treemap",
        "rooms": rooms,
        "message": "Solver timeout/no solution; returning treemap seed.",
    }
