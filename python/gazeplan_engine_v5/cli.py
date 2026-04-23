"""
CLI entry point for GazePlan v5.

Example:
  python -m gazeplan_engine_v5.cli --auto --source both --style both --format png
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .engine import generate_floorplan_v5


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SURVEY_DIR = PROJECT_ROOT / "survey_data"
SESSIONS_DIR = SURVEY_DIR / "sessions"


ROOM_RULES: List[Tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"(master\s*bed|masterbed)", re.IGNORECASE), "masterBed", "Master Bedroom"),
    (re.compile(r"(common\s*bath)", re.IGNORECASE), "commonBath", "Common Bath"),
    (re.compile(r"(bath|toilet|wc)", re.IGNORECASE), "bathroom", "Bathroom"),
    (re.compile(r"(dining.*stair|stair.*dining)", re.IGNORECASE), "diningStaircase", "Dining Hall + Staircase"),
    (re.compile(r"(living\s*lobby.*stair|stair)", re.IGNORECASE), "staircase", "Living Lobby + Staircase"),
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
    (re.compile(r"(icu|caretaker)", re.IGNORECASE), "icu", "Home ICU + Caretaker Unit"),
    (re.compile(r"(bedroom|bed\s*\d*)", re.IGNORECASE), "bedroom", "Bedroom"),
]


def _json_load(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _extract_compass_map(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return None
    if isinstance(payload.get("compass_map"), dict):
        return payload["compass_map"]
    if isinstance(payload.get("plot"), dict) and (
        isinstance(payload.get("ground_floor"), dict) or isinstance(payload.get("placements"), list)
    ):
        return payload
    ans = payload.get("answers")
    if isinstance(ans, dict) and isinstance(ans.get("compass_map"), dict):
        return ans["compass_map"]
    return None


def _extract_answers(payload: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(payload.get("answers"), dict):
        return payload["answers"]
    if isinstance(payload.get("raw_answers"), dict):
        return payload["raw_answers"]
    return payload if isinstance(payload, dict) else {}


def _extract_session_id(payload: Dict[str, Any]) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    sid = payload.get("session_id")
    if sid:
        return str(sid)
    meta = payload.get("meta")
    if isinstance(meta, dict) and meta.get("session_id"):
        return str(meta.get("session_id"))
    return None


def _candidate_json_files() -> List[Path]:
    files = []
    for p in [
        SURVEY_DIR / "gaze_survey_cumulative.json",
        SURVEY_DIR / "gaze_survey_compiled.json",
        SURVEY_DIR / "gaze_survey_data.json",
    ]:
        if p.exists():
            files.append(p)
    snap = SURVEY_DIR / "survey_snapshots"
    if snap.exists():
        files.extend(sorted(snap.glob("snapshot_*.json"), key=lambda x: x.stat().st_mtime, reverse=True))
    return files


def _latest_session_id() -> Optional[str]:
    idx_path = SURVEY_DIR / "session_index.json"
    idx = _json_load(idx_path) if idx_path.exists() else None
    if isinstance(idx, dict):
        sid = idx.get("latest_session_id")
        if sid and (SESSIONS_DIR / str(sid)).exists():
            return str(sid)
    if not SESSIONS_DIR.exists():
        return None
    dirs = [d for d in SESSIONS_DIR.iterdir() if d.is_dir()]
    if not dirs:
        return None
    dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return dirs[0].name


def _session_ids_desc() -> List[str]:
    if not SESSIONS_DIR.exists():
        return []
    dirs = [d for d in SESSIONS_DIR.iterdir() if d.is_dir()]
    dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return [d.name for d in dirs]


def _session_candidates(session_id: str) -> List[Path]:
    sdir = SESSIONS_DIR / session_id
    if not sdir.exists():
        return []
    return sorted(sdir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True)


def _load_session_payloads(session_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    best_survey: Optional[Dict[str, Any]] = None
    best_survey_score = -1
    best_compass: Optional[Dict[str, Any]] = None
    best_compass_score = -1
    for p in _session_candidates(session_id):
        payload = _json_load(p)
        if payload is None:
            continue
        ss = _score_payload_for_survey(payload)
        if ss > best_survey_score:
            best_survey_score = ss
            best_survey = payload
        cs = _score_payload_for_compass(payload)
        if cs > best_compass_score:
            best_compass_score = cs
            best_compass = payload
    return best_survey, best_compass


def _load_latest_session_payloads() -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    sid = _latest_session_id()
    if not sid:
        return None, None, None
    s, c = _load_session_payloads(sid)
    return sid, s, c


def _select_session_for_source(
    source: str,
    requested_session_id: Optional[str] = None,
) -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Choose a session without cross-mixing:
    - both: latest session only (or requested session).
    - survey: latest session that has survey answers.
    - compass: latest session that has compass_map.
    """
    src = source.strip().lower()

    if requested_session_id:
        sid = requested_session_id.strip()
        if not sid or not (SESSIONS_DIR / sid).exists():
            raise RuntimeError(f"Requested session_id not found: {requested_session_id}")
        s, c = _load_session_payloads(sid)
        return sid, s, c

    if src == "both":
        return _load_latest_session_payloads()

    for sid in _session_ids_desc():
        s, c = _load_session_payloads(sid)
        if src == "survey" and s is not None and _score_payload_for_survey(s) > 0:
            return sid, s, c
        if src == "compass" and c is not None and _score_payload_for_compass(c) >= 0:
            return sid, s, c

    return None, None, None


def _score_payload_for_survey(payload: Dict[str, Any]) -> int:
    ans = _extract_answers(payload)
    score = len(ans) if isinstance(ans, dict) else 0
    if isinstance(payload.get("raw_answers"), dict):
        score += len(payload["raw_answers"]) // 2
    if any(k in ans for k in ("plot_width_ft", "plot_depth_ft", "road_facing", "num_floors")):
        score += 60
    slots = sum(1 for k in ans.keys() if re.fullmatch(r"plot_r\d+_s\d+", str(k), flags=re.IGNORECASE))
    score += slots * 10
    return score


def _score_payload_for_compass(payload: Dict[str, Any]) -> int:
    cm = _extract_compass_map(payload)
    if cm is None:
        return -1
    score = 50
    gf = cm.get("ground_floor") if isinstance(cm.get("ground_floor"), dict) else {}
    ff = cm.get("first_floor") if isinstance(cm.get("first_floor"), dict) else {}
    score += len(gf.get("placements", []) or []) * 6
    score += len(ff.get("placements", []) or []) * 3
    if isinstance(cm.get("plot"), dict):
        score += 30
    return score


def _best_payload(score_fn) -> Tuple[Dict[str, Any], Path]:
    best_score = -1
    best_payload = None
    best_path = None
    for p in _candidate_json_files():
        payload = _json_load(p)
        if payload is None:
            continue
        s = score_fn(payload)
        if s > best_score:
            best_score = s
            best_payload = payload
            best_path = p
    if best_payload is None or best_path is None:
        raise RuntimeError("No valid survey_data JSON found")
    return best_payload, best_path


def _room_from_text(text: str) -> Tuple[str, str]:
    txt = str(text or "")
    for rx, rid, label in ROOM_RULES:
        if rx.search(txt):
            return rid, label
    return ("bedroom", txt or "Bedroom")


def _to_float(value: Any, default: float) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    m = re.search(r"-?\d+(?:\.\d+)?", str(value or ""))
    if not m:
        return default
    try:
        return float(m.group(0))
    except Exception:
        return default


def _compass_from_survey_slots(survey_payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    answers = _extract_answers(survey_payload)
    if not isinstance(answers, dict):
        return None
    slot_rx = re.compile(r"plot_r(\d+)_s(\d+)$", re.IGNORECASE)
    cell_to_room: Dict[str, Tuple[str, str]] = {}
    for key, val in answers.items():
        m = slot_rx.fullmatch(str(key))
        if not m:
            continue
        r = int(m.group(1))
        c = int(m.group(2))
        rid, label = _room_from_text(str(val))
        cell_to_room[f"r{r}_c{c}"] = (rid, label)
    if not cell_to_room:
        return None

    grouped: Dict[str, Dict[str, Any]] = {}
    for cell, (rid, label) in cell_to_room.items():
        key = f"{rid}|{label}"
        grouped.setdefault(
            key,
            {"roomId": rid, "room": label, "cells": [], "area_sqft": 0.0},
        )
        grouped[key]["cells"].append(cell)

    placements = []
    plot_w = _to_float(answers.get("plot_width_ft", 40), 40.0)
    plot_d = _to_float(answers.get("plot_depth_ft", 60), 60.0)
    cell_w = plot_w / 4.0
    cell_d = plot_d / 4.0
    for g in grouped.values():
        g["cells"] = sorted(g["cells"])
        g["area_sqft"] = len(g["cells"]) * cell_w * cell_d
        placements.append(g)

    return {
        "grid_size": {"rows": 4, "cols": 4},
        "plot": {
            "width_ft": plot_w,
            "depth_ft": plot_d,
            "facing": str(answers.get("road_facing", "East")),
            "type": str(answers.get("plot_type", "Middle Plot")),
            "num_floors": str(answers.get("num_floors", "Single Floor")),
        },
        "ground_floor": {"placements": placements},
    }


def _build_payload(
    source: str,
    survey_file: Optional[Path],
    compass_file: Optional[Path],
    session_id: Optional[str] = None,
) -> Tuple[Dict[str, Any], List[str]]:
    source = source.strip().lower()
    survey_payload = None
    compass_payload = None
    warnings: List[str] = []
    resolved_session_id = None

    if not survey_file and not compass_file:
        resolved_session_id, latest_survey, latest_compass = _select_session_for_source(source, session_id)
        if latest_survey is not None:
            survey_payload = latest_survey
        if latest_compass is not None:
            compass_payload = latest_compass
    has_latest_session = resolved_session_id is not None

    if source in {"survey", "both"}:
        if survey_file:
            survey_payload = _json_load(survey_file)
            if survey_payload is None:
                raise RuntimeError(f"Failed to parse survey file: {survey_file}")
        elif survey_payload is None and not has_latest_session:
            survey_payload, _ = _best_payload(_score_payload_for_survey)

    if source in {"compass", "both"}:
        if compass_file:
            compass_payload = _json_load(compass_file)
            if compass_payload is None:
                raise RuntimeError(f"Failed to parse compass file: {compass_file}")
        elif compass_payload is None and not has_latest_session:
            try:
                compass_payload, _ = _best_payload(_score_payload_for_compass)
            except Exception:
                compass_payload = None

    compass_map = _extract_compass_map(compass_payload or {}) if compass_payload else None
    if compass_map is None and survey_payload is not None:
        compass_map = _extract_compass_map(survey_payload)
    synthesized_from_slots = False
    if compass_map is None and survey_payload is not None:
        compass_map = _compass_from_survey_slots(survey_payload)
        synthesized_from_slots = isinstance(compass_map, dict)
    survey_answers = _extract_answers(survey_payload or {})

    has_survey = bool(survey_answers)
    has_compass = isinstance(compass_map, dict)

    if source == "both":
        if not has_survey and not has_compass:
            raise RuntimeError("No survey or compass data found for current/latest session.")
        if not has_survey:
            warnings.append("Survey data not found in current/latest session. Generating from compass-only.")
        if not has_compass:
            warnings.append("Compass map not found in current/latest session. Generating from survey-only.")
    elif source == "survey" and not has_survey and has_compass:
        warnings.append("Survey data missing. Falling back to compass-only generation.")
    elif source == "compass" and not has_compass and has_survey:
        warnings.append("Compass data missing. Falling back to survey-only generation.")

    if not has_compass and not has_survey:
        raise RuntimeError("No usable session data found. Complete Compass Map and/or Survey once.")
    if not has_compass and has_survey:
        raise RuntimeError(
            "Compass map missing in current/latest session and survey data has no slot mapping "
            "(plot_rX_sY). Cannot generate geometry."
        )
    if synthesized_from_slots:
        warnings.append("Compass map synthesized from survey slot mapping (plot_rX_sY) in current/latest session.")

    payload = {
        "compass_map": compass_map if isinstance(compass_map, dict) else {},
        "survey_data": survey_answers,
    }
    if resolved_session_id:
        payload["session_id"] = resolved_session_id
        warnings.append(f"Using session_id={resolved_session_id}")
    else:
        sid = _extract_session_id(survey_payload or {}) or _extract_session_id(compass_payload or {})
        if sid:
            payload["session_id"] = sid
    return payload, warnings


def build_arg_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="GazePlan v5 CLI")
    ap.add_argument("--auto", action="store_true", help="Use latest survey_data automatically")
    ap.add_argument("--source", choices=["survey", "compass", "both"], default="both")
    ap.add_argument("--survey-file", type=Path)
    ap.add_argument("--compass-file", type=Path)
    ap.add_argument("--session-id", type=str, default=None, help="Force a specific survey_data/sessions/<id> session")
    ap.add_argument("--style", choices=["presentation", "technical", "both"], default="both")
    ap.add_argument("--format", choices=["png", "pdf", "svg", "dxf"], default="png")
    ap.add_argument("--floor", choices=["ground", "first"], default="ground")
    ap.add_argument("--output", type=Path, default=PROJECT_ROOT / "output" / "floorplan_v5")
    return ap


def main() -> int:
    args = build_arg_parser().parse_args()
    try:
        payload, warnings = _build_payload(args.source, args.survey_file, args.compass_file, args.session_id)
    except Exception as exc:
        print(f"[ERROR] {exc}")
        return 2

    for w in warnings:
        print(f"[WARN] {w}")

    result = generate_floorplan_v5(
        payload,
        output_dir=args.output,
        style=args.style,
        fmt=args.format,
        floor=args.floor,
    )
    if result.get("status") != "ok":
        print(json.dumps(result, indent=2))
        return 1

    print(f"[OK] floor={result.get('floor')} output={result.get('output_dir')}")
    for f in result.get("files", []):
        print(f"  - {f.get('path')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
