"""Frozen floor-plan service; network binding is loopback only."""
import io
import json
import os
import sys


def self_test():
    import cairo
    import ezdxf
    import shapely
    from ortools.sat.python import cp_model
    from floorplan_server import app, HAS_V5

    if not HAS_V5:
        raise RuntimeError("Bundled v5 floor-plan engine failed to import")
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 8, 8)
    output = io.BytesIO()
    surface.write_to_png(output)
    if not output.getvalue().startswith(b"\x89PNG"):
        raise RuntimeError("Cairo PNG render failed")
    model = cp_model.CpModel()
    value = model.NewIntVar(1, 1, "value")
    solver = cp_model.CpSolver()
    if solver.Solve(model) != cp_model.OPTIMAL or solver.Value(value) != 1:
        raise RuntimeError("Bundled constraint solver failed")
    if app.test_client().get("/api/health").status_code != 200:
        raise RuntimeError("Floor-plan health route failed")
    print(json.dumps({"self_test": "passed", "renderer": "Cairo", "solver": "loaded"}))


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        from floorplan_server import app, _cleanup_temp
        _cleanup_temp(max_files=20, max_v5_dirs=5)
        app.run(host="127.0.0.1", port=int(os.environ.get("FLOORPLAN_PORT", "5050")),
                debug=False, use_reloader=False)
