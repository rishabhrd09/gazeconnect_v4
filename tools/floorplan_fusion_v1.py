#!/usr/bin/env python3
"""
GazeConnect Floor Plan Fusion Engine v1
=======================================
Phase 1 deterministic fusion of:
- Survey answers
- Compass map geometry
- Optional custom user notes

This module intentionally avoids heavy ML dependencies. It normalizes and
sanitizes inputs, resolves placement conflicts, derives planning tags, and
returns a renderer-ready compass map plus an explainable report.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional, Tuple


CELL_KEY_RE = re.compile(r"^r(\d+)_c(\d+)$", re.IGNORECASE)


KEYWORD_RULES: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(elderly|senior|wheelchair|accessible|barrier\s*free)\b", re.IGNORECASE), "accessibility"),
    (re.compile(r"\b(privacy|private|quiet)\b", re.IGNORECASE), "privacy"),
    (re.compile(r"\b(sunlight|ventilation|airy|cross\s*ventilation)\b", re.IGNORECASE), "daylight_ventilation"),
    (re.compile(r"\b(guest|visitor)\b", re.IGNORECASE), "guest_space"),
    (re.compile(r"\b(kitchen|cooking)\b", re.IGNORECASE), "kitchen_priority"),
    (re.compile(r"\b(vastu|vaastu)\b", re.IGNORECASE), "vastu_consideration"),
    (re.compile(r"\b(storage|store|utility)\b", re.IGNORECASE), "storage_priority"),
    (re.compile(r"\b(work\s*from\s*home|office|study)\b", re.IGNORECASE), "work_zone"),
]


STYLE_HINTS: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(auto\s*cad|technical|engineering)\b", re.IGNORECASE), "autocad"),
    (re.compile(r"\b(blueprint)\b", re.IGNORECASE), "blueprint"),
    (re.compile(r"\b(modern|contemporary|minimal)\b", re.IGNORECASE), "modern"),
    (re.compile(r"\b(presentation|client|clean)\b", re.IGNORECASE), "presentation"),
]


def _to_int(value: Any, default: int) -> int:
    if value is None:
        return default
    if isinstance(value, int):
        return value
    text = str(value)
    digits = re.sub(r"[^\d]", "", text)
    if not digits:
        return default
    try:
        return int(digits)
    except Exception:
        return default


def _parse_cell_key(cell_key: str) -> Optional[Tuple[int, int]]:
    if not isinstance(cell_key, str):
        return None
    m = CELL_KEY_RE.match(cell_key.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def _cell_sort_key(cell_key: str) -> Tuple[int, int]:
    rc = _parse_cell_key(cell_key)
    if rc is None:
        return (10_000, 10_000)
    return rc


def _cell_rect(cell_key: str, plot_w: float, plot_d: float, rows: int, cols: int) -> Optional[Dict[str, float]]:
    rc = _parse_cell_key(cell_key)
    if rc is None:
        return None
    row, col = rc
    if row < 1 or row > rows or col < 1 or col > cols:
        return None
    cell_w = float(plot_w) / float(cols)
    cell_d = float(plot_d) / float(rows)
    x1 = (col - 1) * cell_w
    y1 = (row - 1) * cell_d
    x2 = x1 + cell_w
    y2 = y1 + cell_d
    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2}


def _cells_to_bounding_rect(
    cells: List[str], plot_w: float, plot_d: float, rows: int, cols: int
) -> Dict[str, float]:
    rects = [_cell_rect(c, plot_w, plot_d, rows, cols) for c in cells]
    rects = [r for r in rects if r is not None]
    if not rects:
        return {"x1": 0.0, "y1": 0.0, "x2": 0.0, "y2": 0.0}
    return {
        "x1": min(r["x1"] for r in rects),
        "y1": min(r["y1"] for r in rects),
        "x2": max(r["x2"] for r in rects),
        "y2": max(r["y2"] for r in rects),
    }


def _extract_answers(survey_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(survey_data, dict):
        return {}
    answers = survey_data.get("answers")
    if isinstance(answers, dict):
        return answers
    return survey_data


def _collect_notes(answers: Dict[str, Any], user_notes: Optional[str]) -> str:
    chunks: List[str] = []

    if isinstance(user_notes, str) and user_notes.strip():
        chunks.append(user_notes.strip())

    for key in ("special_requests", "final_notes"):
        val = answers.get(key)
        if isinstance(val, str) and val.strip():
            chunks.append(val.strip())

    # Deduplicate while preserving order.
    seen = set()
    unique_chunks = []
    for c in chunks:
        norm = c.lower()
        if norm in seen:
            continue
        seen.add(norm)
        unique_chunks.append(c)
    return " | ".join(unique_chunks)


def _derive_constraint_tags(notes: str, answers: Dict[str, Any]) -> List[str]:
    tags: List[str] = []
    for rx, tag in KEYWORD_RULES:
        if rx.search(notes):
            tags.append(tag)

    vastu = str(answers.get("vastu_level", "")).strip().lower()
    if vastu and vastu not in ("", "skip vastu", "none"):
        tags.append("vastu_consideration")

    if str(answers.get("ff_requirements_list", "")).strip():
        tags.append("upper_floor_requirements")

    # Stable order and dedupe.
    out: List[str] = []
    seen = set()
    for t in tags:
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def _derive_style_hint(notes: str, answers: Dict[str, Any]) -> str:
    design_style = str(answers.get("design_style", "")).strip().lower()
    if design_style:
        if "modern" in design_style or "contemporary" in design_style:
            return "modern"
        if "blueprint" in design_style:
            return "blueprint"
        if "cad" in design_style or "technical" in design_style:
            return "autocad"
        if "present" in design_style or "client" in design_style:
            return "presentation"

    for rx, style in STYLE_HINTS:
        if rx.search(notes):
            return style
    return "modern"


def _sanitize_floor(
    floor_payload: Dict[str, Any],
    plot_w: float,
    plot_d: float,
    rows: int,
    cols: int,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    placements = deepcopy(floor_payload.get("placements") or [])
    if not isinstance(placements, list):
        placements = []

    # Conflict resolution policy: latest placement wins for each cell.
    owner_by_cell: Dict[str, int] = {}
    invalid_cell_count = 0
    for idx, p in enumerate(placements):
        raw_cells = p.get("cells") or p.get("occupiedCells") or []
        if not isinstance(raw_cells, list):
            raw_cells = []
        for c in raw_cells:
            rc = _parse_cell_key(str(c))
            if rc is None:
                invalid_cell_count += 1
                continue
            row, col = rc
            if row < 1 or row > rows or col < 1 or col > cols:
                invalid_cell_count += 1
                continue
            owner_by_cell[f"r{row}_c{col}"] = idx

    cells_by_owner: Dict[int, List[str]] = {}
    for c, owner in owner_by_cell.items():
        cells_by_owner.setdefault(owner, []).append(c)

    sanitized: List[Dict[str, Any]] = []
    dropped = 0
    for idx, p in enumerate(placements):
        owned_cells = sorted(cells_by_owner.get(idx, []), key=_cell_sort_key)
        if not owned_cells:
            dropped += 1
            continue

        room_id = str(p.get("roomId") or p.get("room_id") or "").strip()
        room_name = str(p.get("room") or p.get("roomLabel") or room_id or "Room").strip()

        cell_rects: Dict[str, Dict[str, float]] = {}
        for c in owned_cells:
            r = _cell_rect(c, plot_w, plot_d, rows, cols)
            if r is not None:
                cell_rects[c] = r

        coords = _cells_to_bounding_rect(owned_cells, plot_w, plot_d, rows, cols)
        area = max(0.0, (coords["x2"] - coords["x1"]) * (coords["y2"] - coords["y1"]))

        sanitized.append(
            {
                "room": room_name,
                "roomId": room_id,
                "cells": owned_cells,
                "coords": coords,
                "cellRects": cell_rects,
                "area_sqft": int(round(area)),
            }
        )

    unique_cell_count = len(owner_by_cell)
    coverage = round((unique_cell_count / float(rows * cols)) * 100.0, 1) if rows > 0 and cols > 0 else 0.0

    output = {
        "placements": sanitized,
        "coverage_percent": coverage,
    }

    report = {
        "input_placements": len(placements),
        "output_placements": len(sanitized),
        "dropped_placements": dropped,
        "invalid_cells": invalid_cell_count,
        "unique_cells_used": unique_cell_count,
        "coverage_percent": coverage,
    }
    return output, report


def fuse_floorplan_inputs(
    compass_map: Dict[str, Any],
    survey_data: Optional[Dict[str, Any]] = None,
    user_notes: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Merge compass + survey + custom notes into a sanitized renderer payload.
    Returns: (fused_compass_map, fusion_report)
    """
    base = deepcopy(compass_map or {})
    answers = _extract_answers(survey_data)

    grid_size = base.get("grid_size") or {}
    rows = max(1, _to_int(grid_size.get("rows"), 4))
    cols = max(1, _to_int(grid_size.get("cols"), 4))
    base["grid_size"] = {"rows": rows, "cols": cols}

    plot = deepcopy(base.get("plot") or {})
    plot_w = max(10, _to_int(plot.get("width_ft"), 40))
    plot_d = max(10, _to_int(plot.get("depth_ft"), 60))

    # Survey overrides (if present)
    plot_w = _to_int(answers.get("plot_width_ft"), plot_w)
    plot_d = _to_int(answers.get("plot_depth_ft"), plot_d)
    plot_type = str(answers.get("plot_type") or plot.get("type") or "Middle Plot")
    facing = str(answers.get("road_facing") or plot.get("facing") or "South").replace(" Facing", "").strip() or "South"
    num_floors = str(answers.get("num_floors") or plot.get("num_floors") or "Single Floor")

    plot.update(
        {
            "width_ft": plot_w,
            "depth_ft": plot_d,
            "type": plot_type,
            "facing": facing,
            "num_floors": num_floors,
        }
    )
    base["plot"] = plot
    base["cell_size_ft"] = {
        "width": round(float(plot_w) / float(cols), 3),
        "depth": round(float(plot_d) / float(rows), 3),
    }

    # Compatibility: if legacy top-level placements exist, treat as ground floor.
    if "ground_floor" not in base and isinstance(base.get("placements"), list):
        base["ground_floor"] = {"placements": base.get("placements", [])}

    notes = _collect_notes(answers, user_notes)
    constraint_tags = _derive_constraint_tags(notes, answers)
    style_hint = _derive_style_hint(notes, answers)

    floor_reports: Dict[str, Any] = {}
    for floor_key in ("ground_floor", "first_floor"):
        floor_payload = base.get(floor_key)
        if not isinstance(floor_payload, dict):
            continue
        sanitized_floor, floor_report = _sanitize_floor(floor_payload, plot_w, plot_d, rows, cols)
        base[floor_key] = sanitized_floor
        floor_reports[floor_key] = floor_report

    fusion_meta = {
        "engine": "gazeconnect_floorplan_fusion_v1",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "style_hint": style_hint,
        "constraint_tags": constraint_tags,
        "custom_notes_applied": bool(notes),
        "notes": notes,
    }
    base["fusion_meta"] = fusion_meta

    report = {
        "version": "v1",
        "style_hint": style_hint,
        "constraint_tags": constraint_tags,
        "notes_text": notes,
        "plot": {
            "width_ft": plot_w,
            "depth_ft": plot_d,
            "facing": facing,
            "type": plot_type,
            "num_floors": num_floors,
        },
        "floors": floor_reports,
    }
    return base, report


def pick_style_from_context(requested_style: Optional[str], fusion_report: Dict[str, Any]) -> str:
    """
    Keep explicit user style if valid. Otherwise use fusion style hint.
    """
    valid = {"modern", "autocad", "blueprint", "presentation"}
    if requested_style in valid:
        return requested_style
    hinted = str((fusion_report or {}).get("style_hint") or "").strip().lower()
    if hinted in valid:
        return hinted
    return "modern"

