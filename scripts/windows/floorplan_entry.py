"""Frozen floor-plan service; network binding is loopback only."""
import os

# One OpenBLAS thread, set before anything imports numpy: self_test imports shapely (numpy) before floorplan_server,
# which sets the same default (see there; about 225 MB less commit on the 8-thread laptop, 16 Oct 2026).
for _threads in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS'):
    os.environ.setdefault(_threads, '1')

import io  # noqa: E402
import json  # noqa: E402
import sys  # noqa: E402


def self_test():
    import cairo
    import ezdxf
    import shapely
    from floorplan_server import app

    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 8, 8)
    output = io.BytesIO()
    surface.write_to_png(output)
    if not output.getvalue().startswith(b"\x89PNG"):
        raise RuntimeError("Cairo PNG render failed")
    health = app.test_client().get("/api/health")
    if health.status_code != 200 or health.get_json().get("status") != "ok":
        raise RuntimeError("Floor-plan health route failed")
    if "ortools" in sys.modules or "pandas" in sys.modules:
        raise RuntimeError("The floor-plan service must not load OR-Tools or pandas")
    compass_self_test()
    compass_v2_self_test()
    compass_top_bottom_self_test()
    print(json.dumps({"self_test": "passed", "renderer": "Cairo", "memory": health.get_json().get("memory")}))


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


def compass_v2_self_test(plan_override=None):
    """The version 2 studio (14 Oct 2026): a plan with a divided cell, drawn every way the studio offers.
    Also proves the bundled plan fonts are found (tools/assets/fonts, packed as compass_fonts)."""
    import compass_text
    from floorplan_server import app

    fonts = compass_text._font_dir()
    for name in ("AtkinsonHyperlegibleNext-Regular.ttf", "AtkinsonHyperlegibleNext-Bold.ttf"):
        if not (fonts / name).is_file():
            raise RuntimeError(f"Bundled plan font missing: {fonts / name}")
    plan = plan_override or {
        "schema": "gazeconnect.compass-plan", "version": 2,
        "plot": {"widthIn": 480, "depthIn": 720, "facing": "South", "gate": "Center", "plotType": "Middle Plot"},
        "storeys": 1, "choices": {},
        "floors": {"ground": {"splits": ["r2_c3"], "rooms": [
            {"id": "g-bathroom-1", "use": "bathroom", "regions": ["r2_c3.R"]},
            {"id": "g-living-1", "use": "living", "regions": ["r1_c2", "r1_c3", "r2_c2"]},
            {"id": "g-passage-1", "use": "passage", "regions": ["r2_c3.L"]},
            {"id": "g-porch-1", "use": "porch", "regions": ["r1_c1"]},
        ]}},
    }
    client = app.test_client()
    model = client.post("/api/floorplan/compass/v2/model", json={"plan": plan})
    if model.status_code != 200 or "ground" not in model.get_json().get("floorsDrawn", []):
        raise RuntimeError(f"Bundled Compass v2 model failed: {model.status_code}")
    checks = [
        ({"view": "plan", "format": "png"}, b"\x89PNG"),
        ({"view": "top", "format": "png"}, b"\x89PNG"),
        ({"view": "outside", "format": "png", "preset": "front-left"}, b"\x89PNG"),
        ({"view": "sheet", "format": "pdf"}, b"%PDF-"),
        ({"view": "cad", "format": "dxf-in"}, b"  0\nSECTION"),
        ({"view": "cad", "format": "dxf-mm"}, b"  0\nSECTION"),
    ]
    for options, magic in checks:
        output = client.post("/api/floorplan/compass/v2/render", json={
            "plan": plan, "floor": "ground", "theme": "warm", "width": 800, "height": 600, "jobId": "self-test", **options,
        })
        if output.status_code != 200 or not output.data.startswith(magic):
            raise RuntimeError(f"Bundled Compass v2 {options['view']} {options['format']} failed: {output.status_code}")


def compass_top_bottom_self_test():
    """The packaged service must carry version 3 through the model and every export too."""
    compass_v2_self_test({
        'schema': 'gazeconnect.compass-plan', 'version': 3,
        'plot': {'widthIn': 720, 'depthIn': 480, 'facing': 'West', 'gate': 'Center', 'plotType': 'Independent'},
        'storeys': 1, 'choices': {}, 'floors': {'ground': {
            'splits': ['r2_c3'], 'splitDirections': {'r2_c3': 'top-bottom'}, 'rooms': [
                {'id': 'g-bedroom-1', 'use': 'bedroom', 'regions': ['r2_c3.T']},
                {'id': 'g-bathroom-1', 'use': 'bathroom', 'regions': ['r2_c3.B']},
            ]}},
    })


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        # --parent-pid and --idle-seconds come from Electron (startFloorplanServer).
        from floorplan_server import main
        main(sys.argv[1:])
