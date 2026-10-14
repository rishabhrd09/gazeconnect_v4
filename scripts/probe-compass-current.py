"""Probe the current (v1) Compass studio pipeline on one fixture. Offline; never touches user data.

    python/.venv/bin/python scripts/probe-compass-current.py python/tests/fixtures/compass/f01_asymmetric_30x50.json
        [--images OUT_DIR] [--golden FILE] [--compare FILE]

Prints a JSON report in two parts. "result" is deterministic: options, notes, doors, windows,
stair, wall footprint versus the plot, and the DXF header. "measure" holds timings and process
memory for this machine only. --golden writes "result" to FILE; --compare reports how "result"
differs from a stored golden (exit code 1 when it differs).
"""
import argparse
import io
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'tools'), str(ROOT / 'python')]


def memory_mib():
    """(current, peak) memory of this process: private bytes on Windows, resident set elsewhere."""
    if sys.platform == 'win32':
        import ctypes
        from ctypes import wintypes

        class Counters(ctypes.Structure):
            _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [
                (name, ctypes.c_size_t) for name in ('peak_working', 'working', 'peak_paged', 'paged',
                                                     'peak_nonpaged', 'nonpaged', 'pagefile', 'peak_pagefile', 'private')]
        counters = Counters(); counters.cb = ctypes.sizeof(counters)
        query = ctypes.WinDLL('psapi', use_last_error=True).GetProcessMemoryInfo
        query.argtypes = (wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD)
        query.restype = wintypes.BOOL
        if not query(wintypes.HANDLE(-1), ctypes.byref(counters), counters.cb):
            raise ctypes.WinError(ctypes.get_last_error())
        return round(counters.private / 2**20, 1), round(counters.peak_pagefile / 2**20, 1)
    import resource
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    peak = peak if sys.platform == 'darwin' else peak * 1024
    current = None
    try:
        with open('/proc/self/statm') as handle:
            import os
            current = int(handle.read().split()[1]) * os.sysconf('SC_PAGE_SIZE')
    except OSError:
        pass
    return (round(current / 2**20, 1) if current else None), round(peak / 2**20, 1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('fixture')
    parser.add_argument('--images')
    parser.add_argument('--golden')
    parser.add_argument('--compare')
    args = parser.parse_args()
    raw = json.loads(Path(args.fixture).read_text())
    source = raw.get('v1', raw)
    measure = {'memory_after_python_mib': memory_mib()}
    t = time.perf_counter()
    import ezdxf
    from compass_presentation import model, options, render
    measure['import_s'] = round(time.perf_counter() - t, 3)
    measure['memory_after_import_mib'] = memory_mib()
    floors = [f for f in ('ground', 'first') if source.get(f + '_floor', {}).get('placements')]
    scope = 'all' if 'first' in floors else 'ground'
    t = time.perf_counter()
    result = options(source, scope)
    measure['options_s'] = round(time.perf_counter() - t, 3)
    plan = result['options'][0]['compassData']
    report = {'fixture': raw.get('id', Path(args.fixture).name),
              'options': [{'label': o['label'], 'valid': o['valid']} for o in result['options']],
              'notes': result['options'][0]['notes'], 'floors': {}}
    width, depth = float(source['plot']['width_ft']), float(source['plot']['depth_ft'])
    for floor in floors:
        m = model(plan, floor)
        arch = m['architecture']
        x1, y1, x2, y2 = arch['wallFootprint'].bounds
        report['floors'][floor] = {
            'rooms': len(m['rooms']),
            'doors': sorted([d['fromPlacementId'], d['toPlacementId'], d['type']] for d in arch['doors']),
            'windows': len(arch['windows']),
            'stair': arch['stair'] is not None,
            'wallsOutsidePlotFt': [round(-x1, 3), round(-y1, 3), round(x2 - width, 3), round(y2 - depth, 3)],
            'clearSizesFt': {r['placementId']: [round(v, 3) for v in r['clear']] if r.get('clear') else None for r in m['rooms']},
        }
    doc = ezdxf.read(io.StringIO(render(plan, floor='ground', view='technical', fmt='dxf').decode()))
    rooms = list(doc.modelspace().query('LWPOLYLINE[layer=="A-ROOM"]'))
    report['dxf'] = {'version': doc.dxfversion, 'insunits': doc.header.get('$INSUNITS'),
                     'measurement': doc.header.get('$MEASUREMENT'), 'auditErrors': len(doc.audit().errors),
                     'frontAtZero': bool(min(p[1] for e in rooms for p in e.get_points('xy')) == 0) if rooms else None}
    jobs = [(f'{floor}_2d.png', dict(floor=floor, view='2d', fmt='png')) for floor in floors]
    jobs += [('ground_sheet.pdf', dict(floor='ground', view='technical', fmt='pdf')),
             ('ground.dxf', dict(floor='ground', view='technical', fmt='dxf')),
             ('ground_3d.png', dict(floor='ground', view='3d', fmt='png'))]
    jobs += [(f'exterior_{a}.png', dict(floor='ground', view='exterior', fmt='png', angle=a)) for a in range(4)]
    out = Path(args.images) if args.images else None
    if out:
        out.mkdir(parents=True, exist_ok=True)
    measure['render_s'] = {}
    for name, settings in jobs:
        t = time.perf_counter()
        data = render(plan, **settings)
        measure['render_s'][name] = round(time.perf_counter() - t, 3)
        if out:
            (out / name).write_bytes(data)
    measure['memory_end_mib'] = memory_mib()
    measure['platform'] = sys.platform
    print(json.dumps({'result': report, 'measure': measure}, indent=1, ensure_ascii=False))
    if args.golden:
        Path(args.golden).write_text(json.dumps(report, indent=1, ensure_ascii=False) + '\n')
    if args.compare:
        golden = json.loads(Path(args.compare).read_text())
        if golden != report:
            changed = sorted(k for k in set(golden) | set(report) if golden.get(k) != report.get(k))
            print(f'DIFFERS from {args.compare}: {", ".join(changed)}', file=sys.stderr)
            return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
