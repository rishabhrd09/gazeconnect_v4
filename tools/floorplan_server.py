#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║  GazeConnect — Floor Plan Generation API Server              ║
║                                                              ║
║  Flask backend that wraps gazeconnect_floorplan_v5.py        ║
║  Receives compass map JSON → returns PNG/PDF/SVG images      ║
║                                                              ║
║  pip install flask flask-cors pycairo ezdxf                  ║
║  python floorplan_server.py                                  ║
║  → http://localhost:5000/api/floorplan/generate              ║
╚══════════════════════════════════════════════════════════════╝
"""

import os

# numpy's OpenBLAS commits a work buffer for every CPU thread when it loads: on the 8 GB Windows laptop (16 Oct 2026,
# 8 threads) that was about 225 MB of private memory that was never touched, so the service stood at 275 MB of commit
# for a 50-65 MB working set. Plans use small arrays: one thread draws them as fast. Set before anything imports numpy.
for _threads in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS'):
    os.environ.setdefault(_threads, '1')

import io
import re
import sys
import json
import base64
import copy
import tempfile
import time
import traceback
import shutil
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# ── Import the v5 renderer ─────────────────────────────────
# Adjust this path to where gazeconnect_floorplan_v5.py lives
SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))
PROJECT_ROOT = SCRIPT_DIR.parent.resolve()
PYTHON_DIR = PROJECT_ROOT / "python"
if PYTHON_DIR.exists():
    sys.path.insert(0, str(PYTHON_DIR))

from compass_resources import (resources as compass_resources, RendererBusy, JobCancelled, JobTimeout,
                               MAX_REQUEST_BYTES, validate_source)
import floorplan_runtime

_LEGACY = None


def _legacy():
    """The survey/legacy renderer and its fusion load on their first request, never at start.

    The Compass studio uses neither. Loading them lazily keeps the idle service small;
    the v5 optimizer (OR-Tools and, through it, pandas) is no longer loaded at all.
    """
    global _LEGACY
    if _LEGACY is None:
        from types import SimpleNamespace
        from gazeconnect_floorplan_v5 import parse, CairoFloorPlan
        from floorplan_fusion_v1 import fuse_floorplan_inputs, pick_style_from_context
        _LEGACY = SimpleNamespace(parse=parse, CairoFloorPlan=CairoFloorPlan,
                                  fuse_floorplan_inputs=fuse_floorplan_inputs,
                                  pick_style_from_context=pick_style_from_context)
    return _LEGACY

# ── App Setup ──────────────────────────────────────────────

app = Flask(__name__)
LOOPBACK_ORIGIN = r"^http://(?:localhost|127\.0\.0\.1)(?::\d+)?$"
CORS(app, origins=[LOOPBACK_ORIGIN])
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def refuse_web_pages():
    """Only the app answers here (28 Oct 2026). Flask-CORS decides only who may read an answer: a web page in
    Chrome or Edge, or in the embedded browser, could still POST a render (get_json(force=True) reads a text/plain
    body, which needs no preflight) and keep the laptop drawing, and a page on a DNS-rebound name could read the
    answers too. Callers: the app's main process (electron/floorplanTransport.ts, Node's http to 127.0.0.1: no
    Origin, no Sec-Fetch headers), the tests (Flask's test client, urllib) and, in development, the interface
    served on localhost / 127.0.0.1 (floorplanApi.ts falls back to fetch when electronAPI.floorplan is missing)."""
    if (urlsplit("//" + (request.host or "")).hostname or "") not in LOOPBACK_HOSTS:
        return jsonify({"success": False, "error": "Not served to this host."}), 403
    origin = request.headers.get("Origin")
    if origin is not None:
        if not re.match(LOOPBACK_ORIGIN, origin):
            return jsonify({"success": False, "error": "Not served to web pages."}), 403
    elif request.headers.get("Sec-Fetch-Site", "none") not in ("none", "same-origin", "same-site"):
        return jsonify({"success": False, "error": "Not served to web pages."}), 403


if hasattr(app, "before_request"):   # registered before _touch, so a refused request is not activity
    app.before_request(refuse_web_pages)

TEMP_DIR = Path(tempfile.gettempdir()) / "gazeconnect_floorplans"
TEMP_DIR.mkdir(exist_ok=True)

VALID_STYLES = {"modern", "autocad", "blueprint", "presentation"}
VALID_FORMATS = {"png", "pdf", "svg"}
MIME_MAP = {"png": "image/png", "pdf": "application/pdf", "svg": "image/svg+xml"}
MIME_MAP_V5 = {**MIME_MAP, "dxf": "application/dxf"}
STARTED_AT = time.time()
IDLE = None   # floorplan_runtime.IdleWatch once main() runs with --idle-seconds.
WARM = {'seconds': None, 'error': None}   # The background warm-up (warm_studio), for /api/health.


def warm_studio():
    """Loads what the first plan needs (the studio's modules and the plan fonts) in the background, so the first
    request after a start pays no import time (REFINE_FIX_HANDOFF D2). Only the Compass studio's own modules: never
    the legacy renderer, OR-Tools or pandas. The process already runs below normal priority; a failure is only
    reported, and the first request then imports as before."""
    started = time.perf_counter()
    try:
        import compass_studio   # noqa: F401  (compass_geometry, compass_schema, compass_resources)
        import compass_plan2d   # noqa: F401
        import compass_text
        compass_text.face(False)
        compass_text.face(True)
    except Exception as error:   # pragma: no cover - reported, never fatal
        WARM['error'] = str(error)[:200]
        print(f'Background warm-up failed: {error}', flush=True)
    WARM['seconds'] = round(time.perf_counter() - started, 2)


def _touch():
    # Electron asks /api/health every 5 s while the service runs; that is not use, or the
    # service would never leave after its idle minutes and would keep its memory all session.
    if IDLE is not None and request.path != "/api/health":
        IDLE.touch()


if hasattr(app, "before_request"):
    app.before_request(_touch)

@app.errorhandler(Exception)
def handle_global_exception(e):
    import traceback
    t = traceback.format_exc()
    try:
        print(f"[Global Error] {e}\n{t}")
    except:
        pass
    from flask import jsonify
    return jsonify({"error": "Global Unhandled Exception: " + str(e), "trace": t}), 500



def _prepare_fused_payload(data: dict):
    """Extract request fields and run deterministic fusion.
    Preserves advanced_refinements through the fusion pipeline.
    """
    compass_data = data.get("compass_map", data)
    if not isinstance(compass_data, dict):
        compass_data = {}
    compass_data = copy.deepcopy(compass_data)
    survey_data = data.get("survey_data")
    user_notes = data.get("user_notes")

    # A selected candidate already contains the exact, validated geometry.
    # Re-running survey fusion here could change its rooms before export.
    if compass_data.get("layout_candidate_id"):
        return compass_data, {"style_hint": "modern", "candidate_geometry": True}

    # Ensure minimum required structure exists
    if "plot" not in compass_data:
        compass_data["plot"] = {"width_ft": 40, "depth_ft": 60, "facing": "South", "type": "Middle Plot"}
    if "grid_size" not in compass_data:
        compass_data["grid_size"] = {"rows": 4, "cols": 4}

    # Normalize placements: accept occupiedCells as cells
    for floor_key in ("ground_floor", "first_floor"):
        floor = compass_data.get(floor_key)
        if isinstance(floor, dict):
            for p in floor.get("placements", []):
                if "cells" not in p and "occupiedCells" in p:
                    p["cells"] = p["occupiedCells"]

    # Preserve advanced_refinements before fusion (fusion doesn't know about them)
    adv_refinements = compass_data.get("advanced_refinements", {})
    fused_map, fusion_report = _legacy().fuse_floorplan_inputs(
        compass_data,
        survey_data=survey_data,
        user_notes=user_notes,
    )
    # Re-attach advanced_refinements to fused output
    if adv_refinements:
        fused_map["advanced_refinements"] = adv_refinements
    return fused_map, fusion_report


# ── Health Check ───────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    """Readiness, and this process's own memory and job state for the app's health log."""
    return jsonify({"status": "ok", "engine": "pycairo", "version": "4.0", "pid": os.getpid(), "ppid": os.getppid(),
                    "uptimeS": round(time.time() - STARTED_AT), "memory": floorplan_runtime.process_memory(),
                    "jobs": compass_resources.state(),
                    "idleS": round(IDLE.idle_for()) if IDLE is not None else None,
                    "warmS": WARM['seconds']})


# Compass presentation is isolated from survey fusion and the legacy viewer.
@app.route("/api/floorplan/compass/options", methods=["POST"])
def compass_plan_options():
    from compass_presentation import options as compass_options
    if (request.content_length or 0) > MAX_REQUEST_BYTES:
        return jsonify({"error": "This map is too large for the Compass preview."}), 413
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("compass_map"), dict):
        return jsonify({"error": "A Compass Map is required."}), 400
    try:
        validate_source(data['compass_map'])
        with compass_resources.job():
            result=compass_options(data["compass_map"], data.get("scope", "ground"))
        return jsonify(result)
    except RendererBusy as error:
        return jsonify({"error": str(error)}), 429
    except (ValueError, TypeError, KeyError) as error:
        return jsonify({"error": str(error)}), 422


@app.route("/api/floorplan/compass/render", methods=["POST"])
def compass_plan_render():
    from compass_presentation import render as compass_render
    if (request.content_length or 0) > MAX_REQUEST_BYTES:
        return jsonify({"error": "This map is too large for the Compass preview."}), 413
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("compass_map"), dict):
        return jsonify({"error": "A Compass Map is required."}), 400
    fmt = data.get("format", "png")
    floor = data.get("floor", "ground")
    try:
        settings = {'floor': floor, 'view': data.get('view','2d'), 'fmt': fmt,
                    'theme': data.get('theme','warm'), 'angle': data.get('angle',0),
                    'room_id': data.get('room_id'), 'style': data.get('style','verandah')}
        result = compass_resources.render(data['compass_map'], settings,
                    lambda: compass_render(data['compass_map'], **settings))
        return send_file(io.BytesIO(result), mimetype=MIME_MAP_V5[fmt],
                         download_name=f"compass-{floor}.{fmt}")
    except RendererBusy as error:
        return jsonify({"error": str(error)}), 429
    except (ValueError, TypeError, KeyError) as error:
        return jsonify({"error": str(error)}), 422


# ── Compass studio, version 2: one PlanModel, three views, honest exports ──

V2_MAX_BYTES = 128 * 1024


def _v2_body():
    if (request.content_length or 0) > V2_MAX_BYTES:
        return None, (jsonify({"error": "This plan is too large."}), 413)
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("plan"), dict):
        return None, (jsonify({"error": "A Compass plan is required."}), 400)
    return data, None


def _v2_errors(call):
    try:
        return call()
    except JobCancelled:
        # A newer request for the same view replaced this one; the studio ignores this reply.
        return jsonify({"error": "A newer view was requested.", "superseded": True}), 409
    except JobTimeout as error:
        return jsonify({"error": str(error)}), 504
    except RendererBusy as error:
        return jsonify({"error": str(error)}), 429
    except (ValueError, TypeError, KeyError) as error:
        return jsonify({"error": str(error)}), 422


@app.route("/api/floorplan/compass/v2/model", methods=["POST"])
def compass_v2_model():
    """The plan's rooms, sizes, notes, checks and modelHash (drawn nothing)."""
    from compass_studio import summary
    data, failure = _v2_body()
    if failure:
        return failure

    def run():
        job_id = str(data.get("jobId") or "")
        if job_id:
            with compass_resources.latest(job_id, "preview"):
                return jsonify(summary(data["plan"]))
        with compass_resources.job():
            return jsonify(summary(data["plan"]))
    return _v2_errors(run)


@app.route("/api/floorplan/compass/v2/render", methods=["POST"])
def compass_v2_render():
    """One view or export of the plan: plan / top / outside images, the A3 sheet, or the CAD files."""
    from compass_studio import render as studio_render, MIME, model_for, plan_of
    data, failure = _v2_body()
    if failure:
        return failure

    def run():
        settings = {"view": data.get("view", "plan"), "floor": data.get("floor", "ground"),
                    "fmt": data.get("format", "png"), "theme": data.get("theme", "warm"),
                    "preset": data.get("preset", "front-left"), "width": data.get("width", 1600),
                    "height": data.get("height", 1000), "export": bool(data.get("export", False)),
                    "light": bool(data.get("light", False))}
        job_id = str(data.get("jobId") or "")
        produce = lambda: studio_render(data["plan"], **settings)[0]
        if job_id:
            output = compass_resources.render_latest(data["plan"], settings, produce, job_id=job_id,
                                                     channel="export" if settings["export"] else "preview")
        else:
            with compass_resources.job():
                output = produce()
        response = send_file(io.BytesIO(output), mimetype=MIME[settings["fmt"]],
                             download_name=f"compass-{settings['view']}.{settings['fmt'].split('-')[0]}")
        plan, _ = plan_of(data["plan"])
        response.headers["X-Plan-Hash"] = model_for(plan)["modelHash"]
        if job_id:
            response.headers["X-Job-Id"] = job_id
        return response
    return _v2_errors(run)


# ── Generate Floor Plan ───────────────────────────────────

@app.route("/api/floorplan/generate", methods=["POST"])
@app.route("/api/floorplan/generate-advanced", methods=["POST"])
def generate_floorplan():
    """
    POST /api/floorplan/generate
    
    Body (JSON):
    {
        "compass_map": { ... },       // Full compass map payload from CompassMapScreen
        "style": "modern",             // autocad | blueprint | presentation | modern
        "format": "png",               // png | pdf | svg
        "floor": "ground"              // ground | first | all (default: ground)
    }
    
    Returns: Image file (binary) with appropriate Content-Type
    """
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"error": "No JSON body provided"}), 400

        # Extract parameters
        requested_style = data.get("style")
        fmt = data.get("format", "png")
        floor_select = data.get("floor", "ground")
        if fmt not in VALID_FORMATS:
            return jsonify({"error": f"Invalid format: {fmt}. Valid: {VALID_FORMATS}"}), 400

        # Deterministic fusion: compass + survey + custom notes
        compass_data, fusion_report = _prepare_fused_payload(data)
        style = _legacy().pick_style_from_context(requested_style, fusion_report)
        if style not in VALID_STYLES:
            return jsonify({"error": f"Invalid style: {style}. Valid: {VALID_STYLES}"}), 400
        
        # Parse into Floor objects
        floors = _legacy().parse({"compass_map": compass_data})
        if not floors:
            return jsonify({"error": "No floor data could be parsed"}), 400

        # Select which floor to render
        if floor_select == "first" and len(floors) > 1:
            fl = floors[1]
        elif floor_select == "all":
            # For "all", render ground floor (first floor can be requested separately)
            fl = floors[0]
        else:
            fl = floors[0]

        # Generate a unique temp filename
        ts = int(time.time() * 1000)
        filename = f"fp_{ts}_{style}.{fmt}"
        filepath = TEMP_DIR / filename

        # Render
        renderer = _legacy().CairoFloorPlan(fl, style)

        if fmt == "png":
            renderer.render_png(str(filepath))
        elif fmt == "pdf":
            renderer.render_pdf(str(filepath))
        elif fmt == "svg":
            renderer.render_svg(str(filepath))

        if not filepath.exists():
            return jsonify({"error": "Render failed — output file not created"}), 500

        # Return the file
        response = send_file(
            str(filepath),
            mimetype=MIME_MAP[fmt],
            as_attachment=False,
            download_name=f"floorplan_{fl.label.lower().replace(' ', '_')}_{style}.{fmt}"
        )
        response.headers["X-GC-Fusion"] = "v1"
        response.headers["X-GC-Style-Hint"] = str(fusion_report.get("style_hint", "modern"))

        # Keep temp storage bounded for long-running sessions.
        _cleanup_temp(max_files=20, max_v5_dirs=5)

        return response

    except Exception as e:
        import traceback
        t = traceback.format_exc()
        try:
            print(f"[FloorPlan Error] {e}\n{t}")
        except:
            pass
        return jsonify({"error": str(e), "trace": t}), 500


# ── Generate All Styles (batch) ───────────────────────────

@app.route("/api/floorplan/generate-all", methods=["POST"])
def generate_all_styles():
    """
    POST /api/floorplan/generate-all
    
    Generates all 4 styles as PNG, returns JSON with base64 or URLs.
    Body same as /generate.
    """
    import base64
    try:
        data = request.get_json(force=True)
        compass_data, _fusion_report = _prepare_fused_payload(data)
        floor_select = data.get("floor", "ground")

        floors = _legacy().parse({"compass_map": compass_data})
        if not floors:
            return jsonify({"error": "No floor data"}), 400

        fl = floors[1] if floor_select == "first" and len(floors) > 1 else floors[0]

        results = {}
        for style in VALID_STYLES:
            ts = int(time.time() * 1000)
            filepath = TEMP_DIR / f"fp_{ts}_{style}.png"
            renderer = _legacy().CairoFloorPlan(fl, style)
            renderer.render_png(str(filepath))

            with open(filepath, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
            results[style] = f"data:image/png;base64,{b64}"

        _cleanup_temp(max_files=20, max_v5_dirs=5)
        return jsonify({"styles": results, "floor": fl.label})

    except Exception as e:
        import traceback
        t = traceback.format_exc()
        try:
            print(f"[FloorPlan Error] {e}\n{t}")
        except:
            pass
        return jsonify({"error": str(e), "trace": t}), 500


def _candidate_previews(compass_map: dict) -> dict:
    """Render the very same vector geometry used by selected-plan exports."""
    floors = _legacy().parse({"compass_map": compass_map})
    previews = {}
    with tempfile.TemporaryDirectory(prefix="gc_plan_review_") as directory:
        for floor in floors:
            key = "first" if "first" in floor.label.lower() else "ground"
            path = Path(directory) / f"{key}.svg"
            _legacy().CairoFloorPlan(floor, "modern").render_svg(str(path))
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            previews[key] = f"data:image/svg+xml;base64,{encoded}"
    return previews


def _candidate_card(candidate: dict, index: int) -> dict:
    if candidate.get("validation", {}).get("valid") is not True:
        raise ValueError("An unvalidated layout cannot be shown as a candidate.")
    compass_map = copy.deepcopy(candidate.get("compass_map") or {})
    if not isinstance(compass_map, dict) or not compass_map:
        raise ValueError("Candidate has no renderable compass map.")
    candidate_id = str(candidate.get("id") or f"layout-{index}")
    compass_map["layout_candidate_id"] = candidate_id
    allowed = candidate.get("allowed_adjustments") or {}
    allowed_ui = {
        "ground": allowed.get("ground_floor", allowed.get("ground", {})),
        "first": allowed.get("first_floor", allowed.get("first", {})),
    }
    has_room_size = any(bool(directions) for floor in allowed_ui.values() for directions in floor.values())
    changes = candidate.get("changes") or []
    if isinstance(changes, str):
        changes = [changes]
    change_labels = []
    for change in changes:
        if isinstance(change, dict) and "area_delta_sqft" in change:
            delta = float(change["area_delta_sqft"])
            floor_label = "first floor" if change.get("floor") == "first_floor" else "ground floor"
            change_labels.append(f"{change.get('room') or 'Room'} {delta:+g} sq ft on {floor_label}.")
        elif isinstance(change, str):
            change_labels.append(change)
    if not change_labels:
        change_labels = ["Room boundaries follow the selected compass cells."]
    raw_metrics = candidate.get("metrics") or {}
    metrics = {str(key): value for key, value in raw_metrics.items() if isinstance(value, (int, float)) and not isinstance(value, bool)}
    return {
        "id": candidate_id,
        "label": str(candidate.get("title") or candidate.get("profile") or f"Plan {index}"),
        "summary": str(candidate.get("description") or "Layout based on your Compass Map."),
        "changes": change_labels,
        "metrics": metrics,
        "previews": _candidate_previews(compass_map),
        "compassData": compass_map,
        "valid": True,
        "editableActions": ["room_size"] if has_room_size else [],
        "allowedAdjustments": allowed_ui,
    }


@app.route("/api/floorplan/candidates", methods=["POST"])
def generate_candidates_api():
    """Generate up to four validated geometry choices for sequential review."""
    try:
        from gazeplan_engine_v5.candidates import generate_layout_candidates
    except ImportError as error:
        return jsonify({"error": f"Layout engine unavailable: {error}", "code": "engine_unavailable"}), 503

    try:
        data = request.get_json(force=True) or {}
        if not isinstance(data, dict):
            return jsonify({"error": "A JSON object is required."}), 400
        # Candidate review must validate the user's actual Compass Map. Fusion
        # can replace plot answers from a survey and silently reassign duplicate
        # cells, so keep it out of this path. Survey data remains available to
        # the existing single-plan renderer, but it cannot alter candidate
        # geometry before the candidate validator sees the source map.
        source_map = data.get("compass_map", data)
        if not isinstance(source_map, dict):
            return jsonify({"error": "compass_map must be a JSON object."}), 400
        compass_map = copy.deepcopy(source_map)
        result = generate_layout_candidates(compass_map, max_candidates=4, timeout_seconds=8)
        status = str(result.get("status") or "error")
        if status != "ok":
            code = "unsupported_refinements" if status == "unsupported_refinements" else status
            rejected = result.get("rejected") or []
            first_rejection = rejected[0] if rejected else {}
            return jsonify({
                "error": result.get("error") or "No valid layout choices could be generated.",
                "code": code,
                "details": result.get("details") or first_rejection.get("issues") or result.get("report") or [],
            }), 422 if status in {"unsupported_refinements", "infeasible", "invalid_input"} else 500

        candidates = [_candidate_card(raw, index) for index, raw in enumerate(result.get("candidates") or [], 1)]
        if not candidates:
            return jsonify({"error": "No validated layout choices were found.", "code": "infeasible"}), 422
        return jsonify({
            "candidates": candidates,
            "warnings": result.get("warnings") or [],
            "sourceHash": result.get("source_hash"),
        })
    except (TypeError, ValueError, KeyError) as error:
        return jsonify({"error": str(error), "code": "invalid_plan"}), 422
    except Exception as error:
        return jsonify({"error": f"Layout generation failed: {error}", "code": "engine_error"}), 500


@app.route("/api/floorplan/candidates/adjust", methods=["POST"])
def adjust_candidate_api():
    """Preview one bounded room edit; caller decides whether to apply it."""
    try:
        from gazeplan_engine_v5.candidates import adjust_layout_candidate
    except ImportError as error:
        return jsonify({"error": f"Layout engine unavailable: {error}", "code": "engine_unavailable"}), 503

    try:
        data = request.get_json(force=True) or {}
        compass_map = data.get("compass_map")
        adjustment = data.get("adjustment")
        if not isinstance(compass_map, dict) or not isinstance(adjustment, dict):
            return jsonify({"error": "Candidate geometry and adjustment are required."}), 400
        if adjustment.get("action") != "room_size" or adjustment.get("direction") not in {"N", "E", "S", "W"} or adjustment.get("amount_ft") not in {1, 2}:
            return jsonify({"error": "Unsupported room adjustment."}), 400
        engine_adjustment = {**adjustment, "floor": {
            "ground": "ground_floor", "first": "first_floor",
        }.get(adjustment.get("floor"), adjustment.get("floor"))}
        result = adjust_layout_candidate(compass_map, engine_adjustment)
        if result.get("status") != "ok":
            return jsonify({
                "error": result.get("error") or "That adjustment does not fit this layout.",
                "code": result.get("status") or "invalid_adjustment",
            }), 422
        raw = result.get("candidate") or result
        return jsonify({"candidate": _candidate_card(raw, 1)})
    except (TypeError, ValueError, KeyError) as error:
        return jsonify({"error": str(error), "code": "invalid_adjustment"}), 422
    except Exception as error:
        return jsonify({"error": f"Adjustment preview failed: {error}", "code": "engine_error"}), 500


# ── Preview (low-res quick render) ────────────────────────

@app.route("/api/floorplan/preview", methods=["POST"])
def preview_floorplan():
    """Quick low-res preview for real-time feedback while mapping."""
    try:
        data = request.get_json(force=True)
        compass_data, fusion_report = _prepare_fused_payload(data)
        style = data.get("style", "presentation")
        style = _legacy().pick_style_from_context(style, fusion_report)

        floors = _legacy().parse({"compass_map": compass_data})
        if not floors:
            return jsonify({"error": "No data"}), 400

        fl = floors[0]
        ts = int(time.time() * 1000)
        filepath = TEMP_DIR / f"preview_{ts}.png"

        renderer = _legacy().CairoFloorPlan(fl, style)
        renderer.render_png(str(filepath))

        response = send_file(str(filepath), mimetype="image/png")
        _cleanup_temp(max_files=20, max_v5_dirs=5)
        return response

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Temp Cleanup ──────────────────────────────────────────

def _cleanup_temp(max_files=20, max_v5_dirs=5):
    """Bound temp growth across standard files and v5 output folders."""
    try:
        # Keep only newest flat artifacts across all supported formats.
        flat_files = [
            p for p in TEMP_DIR.glob("*")
            if p.is_file() and p.suffix.lower() in {".png", ".pdf", ".svg", ".dxf"}
        ]
        flat_files = sorted(flat_files, key=lambda f: f.stat().st_mtime, reverse=True)
        for f in flat_files[max(0, max_files):]:
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass

        # Keep only newest v5 run directories.
        v5_dirs = [p for p in TEMP_DIR.glob("v5_*") if p.is_dir()]
        v5_dirs = sorted(v5_dirs, key=lambda d: d.stat().st_mtime, reverse=True)
        for d in v5_dirs[max(0, max_v5_dirs):]:
            try:
                shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass
    except Exception:
        pass


# ── Main ──────────────────────────────────────────────────

def main(argv=None):
    """Serve on loopback. With --parent-pid the service ends with the app; with
    --idle-seconds it leaves after that long without a request (exit code 75)."""
    global IDLE
    options = floorplan_runtime.parse_args(sys.argv[1:] if argv is None else argv)
    floorplan_runtime.lower_priority()
    port = int(os.environ.get("FLOORPLAN_PORT", 5050))
    _cleanup_temp(max_files=20, max_v5_dirs=5)
    if options["parent_pid"]:
        floorplan_runtime.watch_parent(options["parent_pid"])
    if options["idle_seconds"] > 0:
        IDLE = floorplan_runtime.IdleWatch(options["idle_seconds"], compass_resources.busy)
        IDLE.start()
    print(f"GazeConnect floor-plan service on http://127.0.0.1:{port} (pid {os.getpid()}, "
          f"parent {options['parent_pid'] or 'none'}, idle exit {int(options['idle_seconds']) or 'off'})", flush=True)
    # Health answers at once; the first plan's imports load beside it (D2).
    import threading
    threading.Thread(target=warm_studio, name='warm-studio', daemon=True).start()
    # debug=False + use_reloader=False: prevents stat reloader from
    # spawning a child process that may crash silently in Electron
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
