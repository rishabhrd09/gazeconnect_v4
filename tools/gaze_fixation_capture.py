#!/usr/bin/env python3
"""Record-once fixation capture for offline gaze tuning (developer diagnostic).

Shows a sequence of fixation targets full-screen and records the RAW samples
the Tobii helper emits, so filter/threshold changes can be evaluated by
deterministic replay instead of repeated physical sessions.

    python\\.venv\\Scripts\\python.exe tools\\gaze_fixation_capture.py

The app must be CLOSED first: the helper serves exactly one TCP client, so a
second consumer would displace the backend. This tool refuses to run when port
5555 is already owned, and never stops a process it did not start.

Output (local only, under the gitignored tools/reports/):
    gaze-capture-<stamp>.csv    one row per helper message
    gaze-capture-<stamp>.json   bounded per-target summary

Only gaze coordinates of the test targets are stored: no message text, no
screen content. Delete the files when they are no longer needed. Nothing is
uploaded. Press Esc to abort.
"""
import argparse
import csv
import ctypes
import json
import math
import socket
import statistics
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPER = (ROOT / 'tobii-helper' / 'TobiiGazeHelper' / 'bin' / 'Release' /
          'net8.0-windows' / 'win-x64' / 'TobiiGazeHelper.exe')
REPORTS = ROOT / 'tools' / 'reports'
HELPER_PORT = 5555
MAX_ROWS = 40000          # ~20 minutes at 33 Hz; the run is far shorter.
PREFLIGHT_TIMEOUT_S = 40
EDGE_INSET_PX = 60        # Matches the 20 Sep 2026 six-point measurement.
BG, FG, ACCENT, DIM = '#0D1117', '#E6EDF3', '#2DD4BF', '#8B949E'


def port_in_use(port: int) -> bool:
    """Bind test, never a connect: the helper serves one client and drops the
    previous one on every new connection, so even probing by connecting would
    knock a running app off the tracker."""
    with socket.socket() as probe:
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            probe.bind(('127.0.0.1', port))
        except OSError:
            return True
        return False


def build_sequence(width: int, height: int, quick: bool):
    """(label, x_px, y_px, kind). 'fix' targets feed the accuracy/noise table;
    'step' targets alternate between adjacent-key distances for step response."""
    e = EDGE_INSET_PX
    cx, cy = width / 2, height / 2
    fix = [('centre', cx, cy), ('top_left', e, e), ('top_right', width - e, e),
           ('bottom_right', width - e, height - e), ('bottom_left', e, height - e)]
    if not quick:
        fix += [('top_mid', cx, e), ('right_mid', width - e, cy),
                ('bottom_mid', cx, height - e), ('left_mid', e, cy),
                ('q_top_left', width * .25, height * .25), ('q_top_right', width * .75, height * .25),
                ('q_bottom_right', width * .75, height * .75), ('q_bottom_left', width * .25, height * .75)]
    fix.append(('centre_repeat', cx, cy))
    sequence = [(label, x, y, 'fix') for label, x, y in fix]
    if not quick:
        # Adjacent keyboard keys are roughly 150 px apart horizontally and
        # 120 px vertically at 1920x1080.
        for i in range(3):
            sequence.append((f'step_h_a{i}', cx - 75, cy, 'step'))
            sequence.append((f'step_h_b{i}', cx + 75, cy, 'step'))
        for i in range(3):
            sequence.append((f'step_v_a{i}', cx, cy - 60, 'step'))
            sequence.append((f'step_v_b{i}', cx, cy + 60, 'step'))
        # A correction smaller than any hold's release radius: how quickly
        # does the cursor follow a small deliberate shift?
        for i in range(3):
            sequence.append((f'step_s_a{i}', cx - 25, cy, 'step'))
            sequence.append((f'step_s_b{i}', cx + 25, cy, 'step'))
    return sequence


class HelperReader(threading.Thread):
    """Reads helper JSON lines; every row is stamped with perf_counter()."""

    def __init__(self, sock: socket.socket):
        super().__init__(daemon=True, name='helper reader')
        self.sock = sock
        self.lock = threading.Lock()
        self.rows = []
        self.status = {}
        self.marker = ('preflight', '', float('nan'), float('nan'), 'idle')
        self.recent_valid = []
        self.closed = False

    def set_marker(self, label, kind, x, y, phase):
        with self.lock:
            self.marker = (label, kind, x, y, phase)

    def valid_rate(self) -> float:
        now = time.perf_counter()
        with self.lock:
            self.recent_valid = [t for t in self.recent_valid if now - t <= 1.0]
            return float(len(self.recent_valid))

    def run(self):
        buffer = b''
        self.sock.settimeout(0.25)
        while not self.closed:
            try:
                chunk = self.sock.recv(65536)
            except socket.timeout:
                continue
            except OSError:
                break
            if not chunk:
                break
            buffer += chunk
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                received = time.perf_counter()
                try:
                    message = json.loads(line)
                except ValueError:
                    continue
                with self.lock:
                    if message.get('type') == 'status':
                        self.status = message
                        continue
                    if message.get('type') != 'gaze' or len(self.rows) >= MAX_ROWS:
                        continue
                    label, kind, tx, ty, phase = self.marker
                    valid = message.get('is_valid') is True
                    if valid:
                        self.recent_valid.append(received)
                    self.rows.append({
                        'recv_perf_s': f'{received:.6f}',
                        'helper_monotonic_ms': message.get('helper_monotonic_ms', ''),
                        'helper_unix_ms': message.get('timestamp', ''),
                        'tobii_timestamp': message.get('tobii_timestamp', ''),
                        'frame': message.get('frame', ''),
                        'tracking_epoch': message.get('tracking_epoch', ''),
                        'is_valid': int(valid),
                        'validity_source': message.get('validity_source', ''),
                        'x_norm': message.get('x', ''), 'y_norm': message.get('y', ''),
                        'screen_w': message.get('screen_width_px', ''),
                        'screen_h': message.get('screen_height_px', ''),
                        'label': label, 'kind': kind, 'phase': phase,
                        'target_x_px': '' if math.isnan(tx) else f'{tx:.1f}',
                        'target_y_px': '' if math.isnan(ty) else f'{ty:.1f}',
                    })


def summarise(rows, width, height):
    """Per-target accuracy and dispersion from the 'record' phase only."""
    by_label = {}
    for row in rows:
        if row['phase'] == 'record' and row['is_valid'] and row['kind'] == 'fix':
            by_label.setdefault(row['label'], []).append(row)
    table = []
    for label, items in by_label.items():
        xs = [float(r['x_norm']) * width for r in items]
        ys = [float(r['y_norm']) * height for r in items]
        tx, ty = float(items[0]['target_x_px']), float(items[0]['target_y_px'])
        mx, my = statistics.median(xs), statistics.median(ys)
        outside = sum(1 for r in items if not (0 <= float(r['x_norm']) <= 1 and 0 <= float(r['y_norm']) <= 1))
        table.append({
            'label': label, 'n': len(items), 'target_px': [round(tx, 1), round(ty, 1)],
            'median_error_px': [round(mx - tx, 1), round(my - ty, 1)],
            'euclidean_error_px': round(math.hypot(mx - tx, my - ty), 1),
            'sigma_px': [round(statistics.pstdev(xs), 1), round(statistics.pstdev(ys), 1)] if len(xs) > 1 else [0, 0],
            'outside_screen_pct': round(100.0 * outside / len(items), 1),
        })
    valid = [r for r in rows if r['is_valid']]
    timing = {}
    if len(valid) > 2:
        recv = [float(r['recv_perf_s']) for r in valid]
        gaps = sorted((b - a) * 1000 for a, b in zip(recv, recv[1:]) if b - a < 0.150)
        frames = [int(r['frame']) for r in valid if r['frame'] != '']
        deltas = [b - a for a, b in zip(frames, frames[1:])]
        if gaps:
            timing = {
                'valid_samples': len(valid),
                'interval_ms_median': round(statistics.median(gaps), 2),
                'interval_ms_p95': round(gaps[int(.95 * (len(gaps) - 1))], 2),
                'interval_ms_max_under_150': round(gaps[-1], 2),
                'rate_hz_from_median': round(1000.0 / statistics.median(gaps), 1),
                'sdk_frames_superseded_in_mailbox': sum(d - 1 for d in deltas if d > 1),
            }
    return table, timing


def print_summary(table, timing, csv_path):
    print()
    print(f"{'target':<16}{'n':>5}{'err x,y (px)':>18}{'|err|':>8}{'sigma x,y (px)':>18}{'outside %':>11}")
    for row in table:
        ex, ey = row['median_error_px']
        sx, sy = row['sigma_px']
        print(f"{row['label']:<16}{row['n']:>5}{f'({ex:+.1f}, {ey:+.1f})':>18}"
              f"{row['euclidean_error_px']:>8.1f}{f'({sx:.1f}, {sy:.1f})':>18}{row['outside_screen_pct']:>11.1f}")
    if table:
        errors = sorted(r['euclidean_error_px'] for r in table)
        print(f"\nmedian |err| {statistics.median(errors):.1f} px, worst {errors[-1]:.1f} px")
    for key, value in timing.items():
        print(f'{key}: {value}')
    print(f'\nraw capture: {csv_path}')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--quick', action='store_true', help='six fixations only (~25 s)')
    parser.add_argument('--settle', type=float, default=1.2, help='seconds discarded per target')
    parser.add_argument('--record', type=float, default=3.0, help='seconds recorded per fixation target')
    parser.add_argument('--step-record', type=float, default=1.3, help='seconds per step target')
    args = parser.parse_args()

    if sys.platform != 'win32':
        print('This capture needs Windows and the Tobii helper.')
        return 2
    if not HELPER.exists():
        print(f'Helper not built: {HELPER}\nRun setup.bat first.')
        return 2
    if port_in_use(HELPER_PORT):
        print(f'Port {HELPER_PORT} is in use: GazeConnect (or another helper) is running.\n'
              'Close the app first. Nothing was stopped.')
        return 2
    try:  # Physical pixels regardless of display scaling.
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except (AttributeError, OSError):
        pass

    import tkinter as tk

    REPORTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    csv_path = REPORTS / f'gaze-capture-{stamp}.csv'
    helper_log = open(REPORTS / f'gaze-capture-{stamp}-helper.log', 'w', encoding='utf-8')
    helper = subprocess.Popen([str(HELPER)], stdout=helper_log, stderr=subprocess.STDOUT,
                              creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    sock = None
    reader = None
    outcome = {'code': 1}
    try:
        deadline = time.perf_counter() + 12
        while time.perf_counter() < deadline and sock is None:
            if helper.poll() is not None:
                print(f'The helper exited early (code {helper.returncode}). See {helper_log.name}')
                return 3
            try:
                sock = socket.create_connection(('127.0.0.1', HELPER_PORT), timeout=0.5)
            except OSError:
                time.sleep(0.2)
        if sock is None:
            print('The helper never opened its port.')
            return 3
        reader = HelperReader(sock)
        reader.start()

        root = tk.Tk()
        root.configure(bg=BG)
        root.attributes('-fullscreen', True)
        root.attributes('-topmost', True)
        root.config(cursor='none')
        width, height = root.winfo_screenwidth(), root.winfo_screenheight()
        canvas = tk.Canvas(root, width=width, height=height, bg=BG, highlightthickness=0)
        canvas.pack(fill='both', expand=True)
        sequence = build_sequence(width, height, args.quick)
        state = {'index': -1, 'phase': 'preflight', 'phase_end': 0.0,
                 'started': time.perf_counter(), 'ready_since': None}

        def finish(code):
            outcome['code'] = code
            root.destroy()

        root.bind('<Escape>', lambda _e: finish(4))

        def draw_target(x, y, fraction, recording):
            canvas.delete('all')
            ring = 34 - 22 * fraction          # Shrinking ring draws the eye inward.
            canvas.create_oval(x - ring, y - ring, x + ring, y + ring,
                               outline=ACCENT if recording else DIM, width=3)
            canvas.create_oval(x - 5, y - 5, x + 5, y + 5, fill=FG, outline='')
            done = state['index'] + 1
            canvas.create_text(width / 2, height - 24 if y < height / 2 else 24, fill=DIM,
                               font=('Segoe UI', 12), text=f'{done} / {len(sequence)}   Esc to stop')

        def describe_status():
            status = reader.status
            if not status:
                return 'Waiting for the tracker…'
            readable = {
                'streaming': 'Tracker is delivering gaze.',
                'no_user': 'The tracker does not see your eyes. Sit centred, 50–80 cm away.',
                'no_gaze': 'Eyes found, but gaze is not on this screen yet.',
                'tracking_paused': 'Tracking is paused in Tobii Experience.',
                'device_not_connected': 'The eye tracker is unplugged.',
                'device_unavailable': f"Tracker not ready ({status.get('device_status')}).",
                'engine_unavailable': 'Tobii Experience is not running.',
                'stalled': 'Tracker reports gaze but no data arrives (recovering).',
                'recovering': 'Reconnecting to the tracker…', 'starting': 'Starting…',
            }
            return readable.get(status.get('stream_state'), str(status.get('stream_state')))

        def tick():
            now = time.perf_counter()
            if state['phase'] == 'preflight':
                rate = reader.valid_rate()
                canvas.delete('all')
                canvas.create_text(width / 2, height / 2 - 60, fill=FG, font=('Segoe UI', 28),
                                   text='Look at this screen')
                canvas.create_text(width / 2, height / 2, fill=ACCENT if rate >= 15 else DIM,
                                   font=('Segoe UI', 18), text=f'{describe_status()}   ({rate:.0f} samples/s)')
                canvas.create_text(width / 2, height / 2 + 50, fill=DIM, font=('Segoe UI', 14),
                                   text='Then follow each dot with your eyes and hold until it moves.  Esc to stop.')
                if rate >= 15:
                    state['ready_since'] = state['ready_since'] or now
                    if now - state['ready_since'] >= 2.0:
                        state['phase'] = 'advance'
                else:
                    state['ready_since'] = None
                    if now - state['started'] > PREFLIGHT_TIMEOUT_S:
                        return finish(5)
            if state['phase'] == 'advance':
                state['index'] += 1
                if state['index'] >= len(sequence):
                    return finish(0)
                # A step target is recorded from the instant it appears: the
                # saccade itself is the measurement, so it has no settle phase.
                if sequence[state['index']][3] == 'step':
                    state['phase'] = 'record'
                    state['phase_end'] = now + args.step_record
                else:
                    state['phase'] = 'settle'
                    state['phase_end'] = now + args.settle
            if state['phase'] in ('settle', 'record'):
                label, x, y, kind = sequence[state['index']]
                if state['phase'] == 'settle' and now >= state['phase_end']:
                    state['phase'] = 'record'
                    state['phase_end'] = now + (args.record if kind == 'fix' else args.step_record)
                elif state['phase'] == 'record' and now >= state['phase_end']:
                    state['phase'] = 'advance'
                    reader.set_marker(label, kind, x, y, 'transition')
                    return root.after(1, tick)
                duration = args.settle if state['phase'] == 'settle' else (
                    args.record if kind == 'fix' else args.step_record)
                fraction = 1 - max(0.0, state['phase_end'] - now) / duration
                reader.set_marker(label, kind, x, y, state['phase'])
                draw_target(x, y, fraction, state['phase'] == 'record')
            root.after(15, tick)

        root.after(50, tick)
        root.mainloop()

        with reader.lock:
            rows = list(reader.rows)
        if rows:
            with csv_path.open('w', newline='', encoding='utf-8') as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
                writer.writeheader()
                writer.writerows(rows)
        table, timing = summarise(rows, width, height)
        summary = {'captured_at': stamp, 'screen_px': [width, height], 'exit': outcome['code'],
                   'settle_s': args.settle, 'record_s': args.record, 'last_status': reader.status,
                   'targets': table, 'timing': timing}
        csv_path.with_suffix('.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
        if outcome['code'] == 5:
            print(f'No gaze arrived within {PREFLIGHT_TIMEOUT_S} s. Tracker says: {describe_status()}')
            print(f"engine state: {json.dumps({k: reader.status.get(k) for k in ('stream_state', 'connection', 'device_status', 'user_presence', 'gaze_tracking')})}")
        elif outcome['code'] == 4:
            print('Stopped with Esc; partial capture kept.')
        print_summary(table, timing, csv_path if rows else '(nothing recorded)')
        return outcome['code']
    finally:
        if reader is not None:
            reader.closed = True
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass
        helper.terminate()       # Only the helper this tool started.
        try:
            helper.wait(timeout=5)
        except subprocess.TimeoutExpired:
            helper.kill()
        helper_log.close()


if __name__ == '__main__':
    sys.exit(main())
