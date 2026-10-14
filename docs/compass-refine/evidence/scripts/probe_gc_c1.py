"""Render the shared C1 house through GazeConnect's current Compass pipeline (read-only).

Usage: <GazeConnect python/.venv python> -I probe_gc_c1.py <repo> <spec.json> <out dir>
"""
import json
import resource
import sys
import time
from pathlib import Path

repo, spec_path, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
sys.path[:0] = [str(repo / 'tools'), str(repo / 'python')]
out.mkdir(parents=True, exist_ok=True)
from compass_presentation import model, options, render  # noqa: E402


def rss_mb():
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1048576, 1)


spec = json.loads(spec_path.read_text())
plot = spec['plot']
source = {
    'grid_size': {'rows': 4, 'cols': 4},
    'plot': {'width_ft': plot['width_ft'], 'depth_ft': plot['depth_ft'], 'facing': plot['facing'],
             'type': plot['type'], 'num_floors': 'Multi-Floor', 'gate_position': plot['gate']},
    'ground_floor': {'placements': [{'roomId': e['gc'], 'room': e['label'], 'placementId': 'g-' + e['gc'],
                                     'cells': e['cells']} for e in spec['ground']]},
    'first_floor': {'placements': [{'roomId': e['gc'], 'room': e['label'], 'placementId': 'f-' + e['gc'],
                                    'cells': e['cells']} for e in spec['first']]},
}
report = {'rss_after_import_mb': rss_mb()}
t = time.perf_counter()
result = options(source, 'all')
report['options_s'] = round(time.perf_counter() - t, 3)
report['options'] = [(o['label'], o['valid']) for o in result['options']]
plan = result['options'][0]['compassData']
report['notes'] = result['options'][0]['notes']
for floor in ('ground', 'first'):
    arch = model(plan, floor)['architecture']
    report[floor] = {'doors': [(d['fromPlacementId'], d['toPlacementId'], d['type']) for d in arch['doors']],
                     'windows': len(arch['windows']), 'stair': arch['stair'] is not None}
jobs = [
    ('gc_ground_2d_warm.png', dict(floor='ground', view='2d', fmt='png', theme='warm')),
    ('gc_first_2d_warm.png', dict(floor='first', view='2d', fmt='png', theme='warm')),
    ('gc_ground_2d_dark.png', dict(floor='ground', view='2d', fmt='png', theme='dark')),
    ('gc_ground_sheet.png', dict(floor='ground', view='technical', fmt='png')),
    ('gc_first_sheet.png', dict(floor='first', view='technical', fmt='png')),
    ('gc_ground_3d_warm.png', dict(floor='ground', view='3d', fmt='png', theme='warm', angle=0)),
    ('gc_first_3d_warm.png', dict(floor='first', view='3d', fmt='png', theme='warm', angle=0)),
] + [(f'gc_exterior_a{a}.png', dict(floor='ground', view='exterior', fmt='png', theme='warm', angle=a)) for a in range(4)]
report['render_s'] = {}
for name, settings in jobs:
    t = time.perf_counter()
    data = render(plan, **settings)
    report['render_s'][name] = round(time.perf_counter() - t, 3)
    (out / name).write_bytes(data)
t = time.perf_counter()
(out / 'gc_ground.dxf').write_bytes(render(plan, floor='ground', view='technical', fmt='dxf'))
report['dxf_s'] = round(time.perf_counter() - t, 3)
t = time.perf_counter()
(out / 'gc_ground.pdf').write_bytes(render(plan, floor='ground', view='technical', fmt='pdf'))
report['pdf_s'] = round(time.perf_counter() - t, 3)
report['peak_rss_mb'] = rss_mb()
(out / 'gc_report.json').write_text(json.dumps(report, indent=1))
print(json.dumps({k: report[k] for k in ('rss_after_import_mb', 'options_s', 'options', 'render_s', 'dxf_s', 'pdf_s', 'peak_rss_mb')}, indent=1))
