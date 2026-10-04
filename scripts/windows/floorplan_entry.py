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
    compass_self_test()
    print(json.dumps({"self_test": "passed", "renderer": "Cairo", "solver": "loaded"}))


def compass_self_test():
    """The same checks used by the frozen executable; callable on UI dev Macs."""
    from floorplan_server import app
    # The Compass viewer must work in the frozen bundle too, not only from tools/.
    client = app.test_client()
    options = client.post('/api/floorplan/compass/options', json={
        'scope': 'ground', 'compass_map': {
            'grid_size': {'rows': 4, 'cols': 4},
            'plot': {'width_ft': 40, 'depth_ft': 60, 'num_floors': 'Multi-Floor'},
            'ground_floor': {'placements': [{'roomId': 'living', 'room': 'Living Hall', 'cells': ['r1_c1']}]},
            'first_floor': {'placements': []},
        },
    })
    if options.status_code != 200:
        raise RuntimeError('Bundled Compass ground-only generation failed')
    geometry = options.get_json()['options'][0]['compassData']
    for format_name, view in [('svg', '2d'), ('png', '3d'), ('png', 'exterior'), ('pdf', 'technical'), ('dxf', 'technical')]:
        output = client.post('/api/floorplan/compass/render', json={
            'compass_map': geometry, 'format': format_name, 'view': view,
        })
        if output.status_code != 200 or not output.data:
            raise RuntimeError(f'Bundled Compass {format_name} rendering failed')
    room = client.post('/api/floorplan/compass/render', json={
        'compass_map': geometry, 'format': 'svg', 'view': '3d',
        'room_id': geometry['ground_floor']['placements'][0]['placementId'],
    })
    if room.status_code != 200 or not room.data.startswith(b'<?xml'):
        raise RuntimeError('Bundled Compass room view failed')


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        from floorplan_server import app, _cleanup_temp
        _cleanup_temp(max_files=20, max_v5_dirs=5)
        app.run(host="127.0.0.1", port=int(os.environ.get("FLOORPLAN_PORT", "5050")),
                debug=False, use_reloader=False)
