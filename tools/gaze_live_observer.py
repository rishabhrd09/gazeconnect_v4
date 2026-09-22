#!/usr/bin/env python3
"""Read-only observer of a RUNNING GazeConnect session (developer diagnostic).

    python\\.venv\\Scripts\\python.exe tools\\gaze_live_observer.py --seconds 90

Connects to the backend's WebSocket broadcast (127.0.0.1:8765) and only
LISTENS. It never sends a message, so it cannot change geometry, targets or
settings, and it never touches the helper's port 5555. It keeps `gaze`,
`gaze_lost`, `tracker_status` and `renderer_latency` messages and discards
everything else unread (no message text is ever stored).

Output, local only, under the gitignored tools/reports/:
    gaze-live-<stamp>.csv     one row per gaze broadcast (bounded)
    gaze-live-<stamp>.json    the summary printed at the end

The window size comes from the backend. A recording made while the window was
maximised rather than full screen (all of them before the evening of 21 Sep
2026) is re-analysed with --height 1040.

Gaze coordinates while typing can reveal what was typed: record a test phrase,
and delete the files when they are no longer needed. Nothing is uploaded.
"""
import argparse
import asyncio
import csv
import json
import math
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'tools' / 'reports'
MAX_SECONDS = 300
FIELDS = ['recv_s', 't_helper_ms', 't_sent_wall_ms', 'sample_age_ms', 'is_valid', 'signal_state',
          'x', 'y', 'mapped_x', 'mapped_y', 'raw_x', 'raw_y', 'backend_zone', 'is_fixation',
          'backend_on_key', 'backend_magnet_px', 'active_filter_preset', 'sample_rate_hz',
          'rejected_x', 'rejected_y', 'recv_wall_ms']
GAZE_KEYS = [name for name in FIELDS[1:] if name != 'recv_wall_ms']
CLUSTER_PX = 45.0          # Raw samples this close together belong to one fixation.
MIN_FIXATION_S = 0.25
SACCADE_PX = 110.0         # A move at least this long is a deliberate look at another target.


async def record(seconds: float, url: str):
    import websockets  # The backend's own dependency.
    rows, events, status, extras = [], [], [], {'renderer_latency': [], 'geometry': None}
    deadline = time.perf_counter() + seconds
    # ping_interval=None: not even keep-alive frames originate here.
    async with websockets.connect(url, ping_interval=None, max_size=2 ** 20) as socket:
        while time.perf_counter() < deadline:
            try:
                message = await asyncio.wait_for(socket.recv(), timeout=max(0.05, deadline - time.perf_counter()))
            except asyncio.TimeoutError:
                break
            received, received_wall_ms = time.perf_counter(), time.time() * 1000.0
            try:
                data = json.loads(message)
            except ValueError:
                continue
            kind = data.get('type')
            if kind == 'gaze':
                rows.append({'recv_s': round(received, 6), **{k: data.get(k) for k in GAZE_KEYS},
                             'recv_wall_ms': round(received_wall_ms, 1)})
            elif kind == 'gaze_lost':
                events.append((received, str(data.get('reason'))))
            elif kind in ('tracker_status', 'connected'):
                state = data.get('tracker_status') if kind == 'connected' else data
                if isinstance(state, dict):
                    status.append((received, state.get('stream_state'), state.get('stream_mode')))
                if kind == 'connected' and isinstance(data.get('geometry'), dict):
                    extras['geometry'] = data['geometry']
            elif kind == 'renderer_latency' and isinstance(data.get('summary'), dict):
                extras['renderer_latency'].append(data['summary'])
            # Everything else (predictions, text, speech...) is dropped unread.
    return rows, events, status, extras


def percentile(values, q):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(q * (len(ordered) - 1)))] if ordered else float('nan')


def band_of(y_norm):
    return 'top third' if y_norm < 1 / 3 else 'middle third' if y_norm < 2 / 3 else 'bottom third'


def fixations(valid, width, height):
    """Greedy dispersion clustering on the RAW mapped samples."""
    clusters, current = [], []
    for row in valid:
        px, py = row['mapped_x'] * width, row['mapped_y'] * height
        if current:
            cx = statistics.fmean(p[0] for p in current)
            cy = statistics.fmean(p[1] for p in current)
            gap = row['t'] - current[-1][2]
            if math.hypot(px - cx, py - cy) > CLUSTER_PX or gap > 0.150:
                clusters.append(current)
                current = []
        current.append((px, py, row['t'], row['x'] * width, row['y'] * height, row))
    if current:
        clusters.append(current)
    return [c for c in clusters if c[-1][2] - c[0][2] >= MIN_FIXATION_S]


def spread(values):
    return {'n': len(values), 'median': round(statistics.median(values), 1),
            'p90': round(percentile(values, .9), 1), 'max': round(max(values), 1)}


def edge_report(rows, width, height, screen_w, screen_h):
    """How gaze behaves at the edges: what the screen-edge band accepted, and
    how far out the samples that were still rejected fell."""
    report = {}
    banded = []
    for r in rows:
        if r['is_valid'] and r.get('raw_x') is not None and r.get('raw_y') is not None:
            beyond = max(-r['raw_x'] * screen_w, (r['raw_x'] - 1) * screen_w,
                         -r['raw_y'] * screen_h, (r['raw_y'] - 1) * screen_h)
            if beyond > 0:
                banded.append(beyond)
    if banded:
        report['accepted_in_screen_edge_band'] = dict(spread(banded), unit='px past the screen edge')
    rejected = {'below': [], 'above': [], 'left': [], 'right': []}
    for r in rows:
        if r['is_valid'] or r.get('rejected_x') is None or r.get('rejected_y') is None:
            continue
        px, py = r['rejected_x'] * width, r['rejected_y'] * height
        sides = {'below': py - height, 'above': -py, 'left': -px, 'right': px - width}
        side = max(sides, key=sides.get)
        if sides[side] > 0:
            rejected[side].append(sides[side])
    report['rejected_px_past_the_window_edge'] = {side: spread(v) for side, v in rejected.items() if v}
    return report


def analyse(rows, events, status, width, height, screen_w=1920, screen_h=1080, extras=None):
    summary = {'samples': len(rows), 'window_assumed_px': [width, height]}
    extras = extras or {}
    if extras.get('geometry'):
        summary['geometry'] = extras['geometry']
    reports = extras.get('renderer_latency') or []
    if reports:
        # Percentiles the interface measured itself over its last ~500 frames.
        summary['renderer_latency_ms'] = dict(reports[-1], reports_received=len(reports))
    if not rows:
        return summary
    span = rows[-1]['recv_s'] - rows[0]['recv_s']
    valid = [dict(r, t=r['t_helper_ms'] / 1000.0) for r in rows
             if r['is_valid'] and r['t_helper_ms'] and r['mapped_x'] is not None and r['x'] is not None]
    summary['seconds'] = round(span, 1)
    summary['valid_pct'] = round(100.0 * len(valid) / len(rows), 1)
    summary['invalid_reasons'] = dict(Counter(str(r['signal_state']) for r in rows if not r['is_valid']))
    summary['gaze_lost_events'] = dict(Counter(reason for _, reason in events))
    summary['gaze_lost_per_min'] = round(60.0 * len(events) / span, 1) if span > 0 else None
    summary['tracker_states_seen'] = [entry[1] for entry in status][-6:]
    summary['tobii_stream_mode'] = next((entry[2] for entry in reversed(status) if len(entry) > 2 and entry[2]), None)
    summary['modes_seen'] = sorted({str(r['active_filter_preset']) for r in rows if r['active_filter_preset']})
    if len(valid) > 5:
        gaps = [(b['t'] - a['t']) * 1000 for a, b in zip(valid, valid[1:]) if 0 < b['t'] - a['t'] < 0.150]
        summary['sample_interval_ms'] = {'median': round(statistics.median(gaps), 1), 'p95': round(percentile(gaps, .95), 1)}
        summary['rate_hz'] = round(1000.0 / statistics.median(gaps), 1)
        pipeline = [r['t_sent_wall_ms'] - r['t_helper_ms'] for r in valid if r['t_sent_wall_ms']]
        summary['helper_callback_to_backend_send_ms'] = {
            'median': round(statistics.median(pipeline), 1), 'p95': round(percentile(pipeline, .95), 1),
            'max': round(max(pipeline), 1)}
        summary['zones_pct'] = {k: round(100.0 * v / len(valid), 1)
                                for k, v in Counter(str(r['backend_zone']) for r in valid).items()}
        delivery = [r['recv_wall_ms'] - r['t_sent_wall_ms'] for r in valid
                    if r.get('recv_wall_ms') and r['t_sent_wall_ms']]
        if delivery:
            # Same clock on one machine; this listener's delivery, not the interface's.
            summary['backend_send_to_this_listener_ms'] = {
                'median': round(statistics.median(delivery), 1), 'p95': round(percentile(delivery, .95), 1),
                'max': round(max(delivery), 1)}
    summary['edges'] = edge_report(rows, width, height, screen_w, screen_h)

    # Validity and loss, by where the gaze last was.
    regions = defaultdict(lambda: {'valid': 0, 'invalid': 0, 'reasons': Counter()})
    last_band = None
    for r in rows:
        if r['is_valid'] and r['y'] is not None:
            last_band = band_of(r['y'])
            regions[last_band]['valid'] += 1
        elif last_band:
            regions[last_band]['invalid'] += 1
            regions[last_band]['reasons'][str(r['signal_state'])] += 1
    summary['by_region'] = {
        band: {'valid_pct': round(100.0 * v['valid'] / max(1, v['valid'] + v['invalid']), 1),
               'samples': v['valid'] + v['invalid'], 'loss_reasons': dict(v['reasons'])}
        for band, v in regions.items()}

    # Real fixation noise, raw vs displayed, by region.
    fix = fixations(valid, width, height)
    noise = defaultdict(lambda: {'raw_x': [], 'raw_y': [], 'out_motion': [], 'n': 0})
    for cluster in fix:
        body = cluster[3:] if len(cluster) > 8 else cluster      # Skip the landing samples.
        band = band_of(statistics.fmean(p[1] for p in body) / height)
        noise[band]['raw_x'].append(statistics.pstdev([p[0] for p in body]))
        noise[band]['raw_y'].append(statistics.pstdev([p[1] for p in body]))
        steps = [math.hypot(b[3] - a[3], b[4] - a[4]) for a, b in zip(body, body[1:])]
        if steps:
            noise[band]['out_motion'].append(math.sqrt(statistics.fmean(s * s for s in steps)))
        noise[band]['n'] += 1
    summary['fixation_noise_px'] = {
        band: {'fixations': v['n'], 'raw_sigma_x': round(statistics.median(v['raw_x']), 1),
               'raw_sigma_y': round(statistics.median(v['raw_y']), 1),
               'cursor_frame_motion_rms': round(statistics.median(v['out_motion']), 1) if v['out_motion'] else None}
        for band, v in noise.items() if v['n']}

    # Eye movements: how long the RAW stream takes to cross, and how far the
    # displayed cursor trails the raw stream (the app's own added delay).
    raw_cross, extra = [], []
    for before, after in zip(fix, fix[1:]):
        ax, ay = statistics.fmean(p[0] for p in before), statistics.fmean(p[1] for p in before)
        bx, by = statistics.fmean(p[0] for p in after), statistics.fmean(p[1] for p in after)
        size = math.hypot(bx - ax, by - ay)
        if size < SACCADE_PX or after[0][2] - before[-1][2] > 0.400:
            continue
        between = [r for r in valid if before[-1][2] < r['t'] <= after[0][2] + 0.300]
        if not between:
            continue
        left = before[-1][2]
        raw_arrived = next((r['t'] for r in between
                            if math.hypot(r['mapped_x'] * width - bx, r['mapped_y'] * height - by) <= 0.25 * size), None)
        out_arrived = next((r['t'] for r in between
                            if math.hypot(r['x'] * width - bx, r['y'] * height - by) <= 0.25 * size), None)
        if raw_arrived is not None:
            raw_cross.append((raw_arrived - left) * 1000)
            if out_arrived is not None:
                extra.append((out_arrived - raw_arrived) * 1000)
    if raw_cross:
        summary['eye_movements'] = {
            'count': len(raw_cross),
            'raw_stream_crossing_ms': {'median': round(statistics.median(raw_cross)), 'p90': round(percentile(raw_cross, .9))},
            'cursor_behind_raw_ms': {'median': round(statistics.median(extra)) if extra else None,
                                     'p90': round(percentile(extra, .9)) if extra else None,
                                     'never_arrived_within_300ms': len(raw_cross) - len(extra)},
        }
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--seconds', type=float, default=90.0)
    parser.add_argument('--url', default='ws://127.0.0.1:8765')
    parser.add_argument('--width', type=int, default=0, help='window content width in CSS px '
                        '(default: what the backend reports, else 1920)')
    parser.add_argument('--height', type=int, default=0, help='window content height in CSS px '
                        '(default: what the backend reports, else 1080)')
    parser.add_argument('--analyse', metavar='CSV', help='re-analyse a saved recording instead of connecting')
    args = parser.parse_args()
    if args.analyse:
        with open(args.analyse, newline='', encoding='utf-8') as handle:
            rows = []
            for raw in csv.DictReader(handle):
                row = {}
                for key, value in raw.items():
                    if value in ('', 'None'):
                        row[key] = None
                    elif key is None:
                        continue
                    elif key in ('signal_state', 'backend_zone', 'active_filter_preset'):
                        row[key] = value
                    elif key in ('is_valid', 'is_fixation', 'backend_on_key'):
                        row[key] = value == 'True'
                    else:
                        row[key] = float(value)
                rows.append({name: row.get(name) for name in FIELDS})
        events, status, stamp, extras = [], [], None, {}
    else:
        seconds = max(1.0, min(MAX_SECONDS, args.seconds))
        print(f'Listening (read-only) to {args.url} for {seconds:.0f} s...')
        try:
            rows, events, status, extras = asyncio.run(record(seconds, args.url))
        except OSError as error:
            print(f'Could not connect: {error}. Is GazeConnect running?')
            return 2
        stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    geometry = extras.get('geometry') or {}
    reported = geometry.get('reported') is True
    width = args.width or int(geometry.get('content_width') if reported else 0) or 1920
    height = args.height or int(geometry.get('content_height') if reported else 0) or 1080
    summary = analyse(rows, events, status, width, height,
                      int(geometry.get('screen_width') or 1920), int(geometry.get('screen_height') or 1080), extras)
    if stamp and rows:
        REPORTS.mkdir(parents=True, exist_ok=True)
        with (REPORTS / f'gaze-live-{stamp}.csv').open('w', newline='', encoding='utf-8') as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        (REPORTS / f'gaze-live-{stamp}.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
        summary['saved'] = f'tools/reports/gaze-live-{stamp}.csv'
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
