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
import sys
import json
import tempfile
import time
import traceback
import shutil
from pathlib import Path

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

from gazeconnect_floorplan_v5 import parse, CairoFloorPlan, Fl
from floorplan_fusion_v1 import fuse_floorplan_inputs, pick_style_from_context
try:
    from gazeplan_engine_v5.engine import generate_floorplan_v5
    HAS_V5 = True
except Exception:
    generate_floorplan_v5 = None  # type: ignore[assignment]
    HAS_V5 = False

# ── App Setup ──────────────────────────────────────────────

app = Flask(__name__)
CORS(app, origins=["http://localhost:*", "http://127.0.0.1:*", "https://*.gazeconnect.*"])

TEMP_DIR = Path(tempfile.gettempdir()) / "gazeconnect_floorplans"
TEMP_DIR.mkdir(exist_ok=True)

VALID_STYLES = {"modern", "autocad", "blueprint", "presentation"}
VALID_FORMATS = {"png", "pdf", "svg"}
MIME_MAP = {"png": "image/png", "pdf": "application/pdf", "svg": "image/svg+xml"}
VALID_V5_STYLES = {"presentation", "technical", "both"}
VALID_V5_FORMATS = {"png", "pdf", "svg", "dxf"}
MIME_MAP_V5 = {**MIME_MAP, "dxf": "application/dxf"}

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
    survey_data = data.get("survey_data")
    user_notes = data.get("user_notes")

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
    fused_map, fusion_report = fuse_floorplan_inputs(
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
    return jsonify({"status": "ok", "engine": "pycairo", "version": "4.0"})


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
        style = pick_style_from_context(requested_style, fusion_report)
        if style not in VALID_STYLES:
            return jsonify({"error": f"Invalid style: {style}. Valid: {VALID_STYLES}"}), 400
        
        # Parse into Floor objects
        floors = parse({"compass_map": compass_data})
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
        renderer = CairoFloorPlan(fl, style)

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

        floors = parse({"compass_map": compass_data})
        if not floors:
            return jsonify({"error": "No floor data"}), 400

        fl = floors[1] if floor_select == "first" and len(floors) > 1 else floors[0]

        results = {}
        for style in VALID_STYLES:
            ts = int(time.time() * 1000)
            filepath = TEMP_DIR / f"fp_{ts}_{style}.png"
            renderer = CairoFloorPlan(fl, style)
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


# ── Preview (low-res quick render) ────────────────────────

@app.route("/api/floorplan/preview", methods=["POST"])
def preview_floorplan():
    """Quick low-res preview for real-time feedback while mapping."""
    try:
        data = request.get_json(force=True)
        compass_data, fusion_report = _prepare_fused_payload(data)
        style = data.get("style", "presentation")
        style = pick_style_from_context(style, fusion_report)

        floors = parse({"compass_map": compass_data})
        if not floors:
            return jsonify({"error": "No data"}), 400

        fl = floors[0]
        ts = int(time.time() * 1000)
        filepath = TEMP_DIR / f"preview_{ts}.png"

        renderer = CairoFloorPlan(fl, style)
        renderer.render_png(str(filepath))

        response = send_file(str(filepath), mimetype="image/png")
        _cleanup_temp(max_files=20, max_v5_dirs=5)
        return response

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/floorplan/v5/generate", methods=["POST"])
def generate_floorplan_v5_api():
    """
    POST /api/floorplan/v5/generate

    Body:
    {
      "compass_map": {...},
      "survey_data": {...},      // optional
      "style": "presentation|technical|both",
      "format": "png|pdf|svg|dxf",
      "floor": "ground|first",
      "variants": 1
    }
    """
    if not HAS_V5:
        return jsonify(
            {
                "error": "v5 engine unavailable (missing dependencies or import error).",
                "hint": "Install optional deps: shapely networkx squarify ortools ezdxf",
            }
        ), 503
    try:
        data = request.get_json(force=True) or {}
        style = str(data.get("style", "both")).strip().lower()
        fmt = str(data.get("format", "png")).strip().lower()
        floor = str(data.get("floor", "ground")).strip().lower()
        variants = int(data.get("variants", 1) or 1)

        if style not in VALID_V5_STYLES:
            return jsonify({"error": f"Invalid v5 style: {style}. Valid: {sorted(VALID_V5_STYLES)}"}), 400
        if fmt not in VALID_V5_FORMATS:
            return jsonify({"error": f"Invalid v5 format: {fmt}. Valid: {sorted(VALID_V5_FORMATS)}"}), 400

        ts = int(time.time() * 1000)
        out_dir = TEMP_DIR / f"v5_{ts}"
        result = generate_floorplan_v5(
            data,
            output_dir=out_dir,
            style=style,
            fmt=fmt,
            floor=floor,
            variants=variants,
        )
        status = str(result.get("status", "error"))
        if status != "ok":
            code = 422 if status == "infeasible" else 400
            return jsonify(result), code

        files = list(result.get("files") or [])
        if len(files) == 1:
            path = Path(files[0]["path"])
            if not path.exists():
                return jsonify({"error": "v5 render output missing"}), 500
            ext = path.suffix.lower().lstrip(".")
            response = send_file(
                str(path),
                mimetype=MIME_MAP_V5.get(ext, "application/octet-stream"),
                as_attachment=False,
                download_name=path.name,
            )
            _cleanup_temp(max_files=20, max_v5_dirs=5)
            return response

        # Multi-file output (e.g., style=both): return manifest JSON.
        _cleanup_temp(max_files=20, max_v5_dirs=5)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


@app.route("/api/floorplan/fusion-report", methods=["POST"])
def fusion_report():
    """
    POST /api/floorplan/fusion-report
    Return fused payload + explainability report without rendering.
    """
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"error": "No JSON body provided"}), 400

        fused_map, report = _prepare_fused_payload(data)
        return jsonify(
            {
                "status": "ok",
                "fusion_version": "v1",
                "report": report,
                "fused_compass_map": fused_map,
            }
        )
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


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

if __name__ == "__main__":
    port = int(os.environ.get("FLOORPLAN_PORT", 5050))
    _cleanup_temp(max_files=20, max_v5_dirs=5)
    print(f"\n{'='*60}")
    print(f"  GazeConnect Floor Plan API Server")
    print(f"  Engine: PyCairo v5.0 (refinement-aware)")
    print(f"  Styles: {', '.join(sorted(VALID_STYLES))}")
    print(f"  Formats: {', '.join(sorted(VALID_FORMATS))}")
    print(f"  Listening: http://localhost:{port}")
    print(f"{'='*60}\n")
    # debug=False + use_reloader=False: prevents stat reloader from
    # spawning a child process that may crash silently in Electron
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)

