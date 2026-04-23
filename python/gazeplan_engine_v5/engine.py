"""
GazePlan v5 orchestrator.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .constraint_solver import SolverConfig, solve_layout
from .dxf_exporter_v5 import export_dxf_v5
from .fenestration import generate_fenestration
from .nbc_standards import SETBACK_DEFAULTS, validate_feasibility
from .renderer_v5 import V5Renderer
from .room_adjacency_graph import build_room_adjacency_graph
from .treemap_seeder import build_seed_layout
from .vastu_scoring import score_layout_with_booleans


SUPPORTED_FORMATS = {"png", "pdf", "svg", "dxf"}
SUPPORTED_STYLES = {"presentation", "technical", "both"}


@dataclass
class EngineConfig:
    timeout_seconds: int = 30
    variants: int = 1


def _norm_floor(floor: str) -> str:
    f = (floor or "ground").strip().lower()
    if f in {"first", "first_floor", "1f"}:
        return "first_floor"
    return "ground_floor"


def _extract_compass_map(payload: Dict[str, Any]) -> Dict[str, Any]:
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
    return {}


def _extract_survey(payload: Dict[str, Any]) -> Dict[str, Any]:
    sd = payload.get("survey_data")
    if isinstance(sd, dict):
        return sd
    if isinstance(payload.get("answers"), dict):
        return payload["answers"]
    if isinstance(payload.get("raw_answers"), dict):
        return payload["raw_answers"]
    return {}


def _infer_kitchen_mode(survey: Dict[str, Any]) -> str:
    txt = " ".join(
        str(survey.get(k, ""))
        for k in ("kitchen_type", "cooking_style", "kitchen_mode", "kitchen_notes", "kitchen_preference")
    ).lower()
    if "dining" in txt:
        return "dining"
    return "separate"


def _infer_accessibility(survey: Dict[str, Any]) -> bool:
    for k in ("accessibility", "wheelchair_access", "als_mode", "universal_design"):
        v = survey.get(k)
        if isinstance(v, bool):
            if v:
                return True
        elif isinstance(v, str) and v.strip().lower() in {"yes", "true", "1", "enabled"}:
            return True
    notes = str(survey.get("custom_notes", "")).lower()
    return any(t in notes for t in ("wheelchair", "accessible", "als", "bed-bound", "bed bound"))


def _infer_setbacks(survey: Dict[str, Any]) -> Dict[str, float]:
    out = dict(SETBACK_DEFAULTS)
    keys = {
        "front_ft": ("setback_front_ft", "front_setback_ft"),
        "rear_ft": ("setback_rear_ft", "rear_setback_ft"),
        "side_ft": ("setback_side_ft", "side_setback_ft"),
    }
    for std, opts in keys.items():
        for k in opts:
            if k in survey:
                try:
                    out[std] = float(survey[k])
                except Exception:
                    pass
    return out


def _ensure_floor_obj(compass_map: Dict[str, Any], floor_key: str) -> Dict[str, Any]:
    f = compass_map.get(floor_key)
    if isinstance(f, dict):
        return f
    if floor_key == "ground_floor" and isinstance(compass_map.get("placements"), list):
        return {"placements": list(compass_map.get("placements") or [])}
    return {"placements": []}


class GazePlanV5Engine:
    def __init__(self, *, output_dir: Optional[Path] = None, config: Optional[EngineConfig] = None) -> None:
        self.output_dir = output_dir or (Path(__file__).resolve().parents[2] / "output" / "floorplan_v5")
        self.config = config or EngineConfig()

    def generate(
        self,
        payload: Dict[str, Any],
        *,
        style: str = "both",
        fmt: str = "png",
        floor: str = "ground",
        variants: int = 1,
    ) -> Dict[str, Any]:
        style = (style or "both").strip().lower()
        fmt = (fmt or "png").strip().lower()
        if style not in SUPPORTED_STYLES:
            style = "both"
        if fmt not in SUPPORTED_FORMATS:
            fmt = "png"

        compass_map = _extract_compass_map(payload or {})
        survey = _extract_survey(payload or {})
        if not compass_map:
            return {"status": "error", "error": "No compass_map data found"}

        floor_key = _norm_floor(floor)
        floor_obj = _ensure_floor_obj(compass_map, floor_key)
        placements = list(floor_obj.get("placements") or [])
        if not placements:
            return {"status": "error", "error": f"No placements found for {floor_key}"}

        plot = compass_map.get("plot") or {}
        plot_w = float(plot.get("width_ft") or 40.0)
        plot_d = float(plot.get("depth_ft") or 60.0)
        facing = str(plot.get("facing") or "East")

        kitchen_mode = _infer_kitchen_mode(survey)
        accessibility = _infer_accessibility(survey)
        setbacks = _infer_setbacks(survey)

        # Stage 1: feasibility pre-check
        feasible, feas_report = validate_feasibility(
            [{"roomId": p.get("roomId", "")} for p in placements],
            plot_w,
            plot_d,
            setbacks,
            kitchen_mode=kitchen_mode,
            accessibility=accessibility,
        )
        if not feasible:
            return {"status": "infeasible", "report": feas_report}

        # Stage 1b: room adjacency graph
        rag = build_room_adjacency_graph(compass_map, floor_key=floor_key, survey_data=survey)

        # Stage 2: two-stage seed
        seed = build_seed_layout(
            compass_map,
            floor_key=floor_key,
            kitchen_mode=kitchen_mode,
            accessibility=accessibility,
            setbacks=setbacks,
        )
        if not seed.get("rooms"):
            return {"status": "error", "error": "Seed generation failed (no rooms)."}

        # Stage 3: CP-SAT solve (fallback inside solver)
        solved = solve_layout(
            seed,
            adjacency_graph=rag,
            config=SolverConfig(timeout_seconds=self.config.timeout_seconds),
        )
        rooms = list(solved.get("rooms") or seed.get("rooms") or [])

        # Stage 4: walls
        from .wall_geometry import build_wall_geometry

        walls = build_wall_geometry(rooms)

        # Stage 5: fenestration
        fen = generate_fenestration(rooms, adjacency_graph=rag)

        # Vastu score on final rooms
        vastu = score_layout_with_booleans(rooms, plot_w, plot_d)
        vastu_score = float(vastu.get("final_score", 0.0))

        # Stage 6: render/export
        ts = int(time.time())
        out_dir = self.output_dir / f"{ts}_{floor_key}"
        out_dir.mkdir(parents=True, exist_ok=True)

        floor_label = "GROUND FLOOR" if floor_key == "ground_floor" else "FIRST FLOOR"
        renderer = V5Renderer(
            plot_w_ft=plot_w,
            plot_d_ft=plot_d,
            rooms=rooms,
            walls=walls,
            fenestration=fen,
            facing=facing,
            floor_label=floor_label,
            vastu_score=vastu_score,
            style_name=style,
            advanced_refinements=compass_map.get("advanced_refinements"),
            compass_data=compass_map,
        )

        files: List[Dict[str, str]] = []
        styles_to_render = [style] if style != "both" else ["presentation", "technical"]
        if fmt in {"png", "pdf", "svg"}:
            for st in styles_to_render:
                out = out_dir / f"{floor_key}_{st}.{fmt}"
                try:
                    if fmt == "png":
                        renderer.render_png(str(out), mode=st)
                    elif fmt == "pdf":
                        renderer.render_pdf(str(out), mode=st)
                    else:
                        renderer.render_svg(str(out), mode=st)
                except Exception as exc:
                    return {"status": "error", "error": f"v5 render failed: {exc}"}
                files.append({"style": st, "format": fmt, "path": str(out)})
        else:  # dxf
            out = out_dir / f"{floor_key}_v5.dxf"
            try:
                export_dxf_v5(
                    str(out),
                    rooms=rooms,
                    walls=walls,
                    fenestration=fen,
                    floor_label=floor_label,
                )
            except Exception as exc:
                return {"status": "error", "error": f"v5 dxf export failed: {exc}"}
            files.append({"style": "technical", "format": "dxf", "path": str(out)})

        report = {
            "feasibility": feas_report,
            "solver": solved,
            "vastu": vastu,
            "buildable": seed.get("buildable"),
            "graph": {"root": rag.graph.get("root"), "nodes": rag.number_of_nodes(), "edges": rag.number_of_edges()},
            "ventilation": fen.get("ventilation", []),
        }
        (out_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

        return {
            "status": "ok",
            "floor": floor_key,
            "files": files,
            "output_dir": str(out_dir),
            "report": report,
        }


def generate_floorplan_v5(
    payload: Dict[str, Any],
    *,
    output_dir: Optional[Path] = None,
    style: str = "both",
    fmt: str = "png",
    floor: str = "ground",
    variants: int = 1,
) -> Dict[str, Any]:
    engine = GazePlanV5Engine(output_dir=output_dir)
    return engine.generate(payload, style=style, fmt=fmt, floor=floor, variants=variants)
