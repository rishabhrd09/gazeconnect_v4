"""Deterministic bench for cursor-filter behaviour under MEASURED tracker noise.

The older synthetic fixture models a 2 px / 133 Hz signal. The Eye Tracker 5
measured on 20 Sep 2026 delivers ~33 Hz with a per-axis spread of roughly
5-18 px, so thresholds tuned on that fixture sit far below the real noise
floor. This bench generates seeded traces with the measured spread (optionally
temporally correlated, with occasional spikes) and can also load a raw capture
written by tools/gaze_fixation_capture.py.

    python python/tests/gaze_filter_bench.py                       # synthetic
    python python/tests/gaze_filter_bench.py tools/reports/gaze-capture-*.csv

It prints aggregates only. Synthetic results describe the mathematics; only a
real capture says anything about the hardware.
"""
import argparse
import csv
import math
import pathlib
import random
import statistics
import sys
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))

from services.adaptive_cursor_filter import (  # noqa: E402
    AdaptiveCursorFilter, FILTER_PROFILES, LEGACY_FILTER_PROFILES)

SAMPLE_HZ = 33.0
# Per-axis sample spread (px) from docs/windows-validation/
# windows-hardware-validation-2026-09-20.md section 5.2, 1920x1080 @ 100 %.
MEASURED_SIGMA_PX: Dict[str, Tuple[float, float]] = {
    'centre': (5.6, 12.9),
    'top_left': (14.1, 9.4),
    'top_right': (10.6, 17.5),
    'bottom_right': (10.3, 8.3),
    'bottom_left': (17.6, 9.3),
}
SETTLE_DISCARD_S = 0.4      # Excluded from "steady" statistics.


@dataclass
class Sample:
    t: float
    x: float
    y: float
    target: Optional[str]
    label: str
    truth: Tuple[float, float]


class NoiseSource:
    """Seeded AR(1) noise with a fixed stationary sigma per axis."""

    def __init__(self, seed: int, sigma: Tuple[float, float], rho: float = 0.0,
                 spike_probability: float = 0.0, spike_px: float = 110.0):
        self.rng = random.Random(seed)
        self.sigma = sigma
        self.rho = rho
        self.innovation = math.sqrt(max(0.0, 1.0 - rho * rho))
        self.state = [0.0, 0.0]
        self.spike_probability = spike_probability
        self.spike_px = spike_px

    def next(self) -> Tuple[float, float]:
        for axis in (0, 1):
            self.state[axis] = self.rho * self.state[axis] + self.innovation * self.rng.gauss(0.0, 1.0)
        dx, dy = self.state[0] * self.sigma[0], self.state[1] * self.sigma[1]
        if self.spike_probability and self.rng.random() < self.spike_probability:
            angle = self.rng.uniform(0, 2 * math.pi)
            dx += self.spike_px * math.cos(angle)
            dy += self.spike_px * math.sin(angle)
        return dx, dy


def fixation(label: str, centre: Tuple[float, float], seconds: float, noise: NoiseSource,
             start: float = 0.0, target: Optional[str] = 'key', hz: float = SAMPLE_HZ) -> List[Sample]:
    samples = []
    for i in range(int(round(seconds * hz))):
        dx, dy = noise.next()
        samples.append(Sample(start + i / hz, centre[0] + dx, centre[1] + dy, target, label, centre))
    return samples


def step_sequence(label: str, a: Tuple[float, float], b: Tuple[float, float], noise: NoiseSource,
                  dwell_s: float = 1.3, repeats: int = 4, hz: float = SAMPLE_HZ) -> List[Sample]:
    """Instant alternation between two fixation points (a saccade completes
    well inside one 30 ms sample interval)."""
    samples: List[Sample] = []
    start = 0.0
    for i in range(repeats * 2):
        point, target = (a, 'key_a') if i % 2 == 0 else (b, 'key_b')
        samples += fixation(f'{label}', point, dwell_s, noise, start, target, hz)
        start += dwell_s
    return samples


def run_filter(factory: Callable[[], object], samples: Sequence[Sample]):
    flt = factory()
    out = []
    for s in samples:
        x, y = flt.update(s.x, s.y, s.t, s.target)
        out.append((s, x, y, flt.zone))
    return out


def steady_metrics(result) -> Dict[str, float]:
    start = result[0][0].t
    steady = [(s, x, y, z) for s, x, y, z in result if s.t - start >= SETTLE_DISCARD_S]
    xs, ys = [x for _, x, _, _ in steady], [y for _, _, y, _ in steady]
    raw_x, raw_y = [s.x for s, *_ in steady], [s.y for s, *_ in steady]
    zones = [z for *_, z in result]
    locked = [z == 'lock' for *_, z in steady]
    duration = max(1e-9, result[-1][0].t - start)
    truth = steady[0][0].truth
    return {
        'raw_sigma_x': statistics.pstdev(raw_x), 'raw_sigma_y': statistics.pstdev(raw_y),
        'out_sigma_x': statistics.pstdev(xs), 'out_sigma_y': statistics.pstdev(ys),
        'out_peak_to_peak': max(max(xs) - min(xs), max(ys) - min(ys)),
        # Frame-to-frame motion is what the eye reads as flicker.
        'out_step_rms': math.sqrt(statistics.fmean(
            (x2 - x1) ** 2 + (y2 - y1) ** 2
            for (_, x1, y1, _), (_, x2, y2, _) in zip(steady, steady[1:]))),
        'bias': math.hypot(statistics.fmean(xs) - truth[0], statistics.fmean(ys) - truth[1]),
        'locked_pct': 100.0 * sum(locked) / len(locked),
        'zone_changes_per_s': sum(1 for a, b in zip(zones, zones[1:]) if a != b) / duration,
        'lock_breaks_per_s': sum(1 for a, b in zip(zones, zones[1:]) if a == 'lock' and b != 'lock') / duration,
    }


def step_metrics(result, arrive_fraction: float = 0.25) -> Dict[str, float]:
    """Time for the output to come within arrive_fraction of the step size of
    the new fixation point, measured from the first sample at the new point."""
    arrivals = []
    overshoot = 0.0
    previous_truth = result[0][0].truth
    pending = None
    for s, x, y, _ in result:
        if s.truth != previous_truth:
            size = math.hypot(s.truth[0] - previous_truth[0], s.truth[1] - previous_truth[1])
            pending = (s.t, size, previous_truth)
            previous_truth = s.truth
        if pending:
            started, size, origin = pending
            if math.hypot(x - s.truth[0], y - s.truth[1]) <= arrive_fraction * size:
                arrivals.append((s.t - started) * 1000.0)
                pending = None
    return {
        'steps': float(len(arrivals)),
        'arrive_ms_median': statistics.median(arrivals) if arrivals else float('nan'),
        'arrive_ms_max': max(arrivals) if arrivals else float('nan'),
        'overshoot_px': overshoot,
    }


def load_capture(path: pathlib.Path) -> Dict[str, List[Sample]]:
    """Raw capture -> per-label traces in screen pixels (valid samples only)."""
    traces: Dict[str, List[Sample]] = {}
    with path.open(newline='', encoding='utf-8') as handle:
        for row in csv.DictReader(handle):
            if row['is_valid'] != '1' or row['phase'] != 'record' or not row['target_x_px']:
                continue
            width, height = float(row['screen_w']), float(row['screen_h'])
            truth = (float(row['target_x_px']), float(row['target_y_px']))
            key = row['label'] if row['kind'] == 'fix' else row['label'].rstrip('0123456789')[:-2]
            traces.setdefault(key, []).append(Sample(
                float(row['helper_unix_ms']) / 1000.0, float(row['x_norm']) * width,
                float(row['y_norm']) * height,
                'key' if row['kind'] == 'fix' else f"key_{row['label'].split('_')[2][0]}",
                row['label'], truth))
    return traces


def lag1_autocorrelation(values: Sequence[float]) -> float:
    mean = statistics.fmean(values)
    centred = [v - mean for v in values]
    denominator = sum(c * c for c in centred)
    if denominator <= 0:
        return 0.0
    return sum(a * b for a, b in zip(centred, centred[1:])) / denominator


def describe_capture(traces: Dict[str, List[Sample]]):
    print('\nMeasured raw noise (valid samples after the settle window):')
    print(f"{'target':<16}{'n':>5}{'sigma x':>9}{'sigma y':>9}{'rho x':>8}{'rho y':>8}{'max |dev|':>11}")
    for label, samples in traces.items():
        if not label.startswith('step') and len(samples) > 8:
            xs, ys = [s.x for s in samples], [s.y for s in samples]
            mx, my = statistics.median(xs), statistics.median(ys)
            worst = max(math.hypot(x - mx, y - my) for x, y in zip(xs, ys))
            print(f'{label:<16}{len(samples):>5}{statistics.pstdev(xs):>9.1f}{statistics.pstdev(ys):>9.1f}'
                  f'{lag1_autocorrelation(xs):>8.2f}{lag1_autocorrelation(ys):>8.2f}{worst:>11.1f}')


def synthetic_suite(rho: float, spikes: float) -> Dict[str, List[Sample]]:
    suite = {}
    centres = {'centre': (960, 540), 'top_left': (60, 60), 'top_right': (1860, 60),
               'bottom_right': (1860, 1020), 'bottom_left': (60, 1020)}
    for index, (label, sigma) in enumerate(MEASURED_SIGMA_PX.items()):
        suite[label] = fixation(label, centres[label], 6.0, NoiseSource(100 + index, sigma, rho, spikes))
    centre_sigma = MEASURED_SIGMA_PX['centre']
    suite['step_h_150'] = step_sequence('step_h_150', (885, 540), (1035, 540), NoiseSource(201, centre_sigma, rho, spikes))
    suite['step_v_120'] = step_sequence('step_v_120', (960, 480), (960, 600), NoiseSource(202, centre_sigma, rho, spikes))
    return suite


def report(name: str, factory: Callable[[], object], suite: Dict[str, List[Sample]]):
    print(f'\n=== {name} ===')
    print(f"{'trace':<16}{'raw sx,sy':>14}{'out sx,sy':>14}{'p-p':>7}{'step rms':>10}{'lock %':>8}"
          f"{'zone chg/s':>12}{'breaks/s':>10}")
    for label, samples in suite.items():
        if label.startswith('step'):
            continue
        m = steady_metrics(run_filter(factory, samples))
        raw = f"{m['raw_sigma_x']:.1f},{m['raw_sigma_y']:.1f}"
        out = f"{m['out_sigma_x']:.1f},{m['out_sigma_y']:.1f}"
        print(f"{label:<16}{raw:>14}{out:>14}"
              f"{m['out_peak_to_peak']:>7.1f}{m['out_step_rms']:>10.2f}{m['locked_pct']:>8.1f}"
              f"{m['zone_changes_per_s']:>12.2f}{m['lock_breaks_per_s']:>10.2f}")
    for label, samples in suite.items():
        if label.startswith('step'):
            m = step_metrics(run_filter(factory, samples))
            print(f"{label:<16} steps={m['steps']:.0f} arrive median={m['arrive_ms_median']:.0f} ms "
                  f"max={m['arrive_ms_max']:.0f} ms")


def main():
    parser = argparse.ArgumentParser(description='Cursor filter bench under measured noise')
    parser.add_argument('capture', nargs='?', help='raw capture CSV from tools/gaze_fixation_capture.py')
    parser.add_argument('--rho', type=float, default=0.0, help='synthetic lag-1 autocorrelation')
    parser.add_argument('--spikes', type=float, default=0.0, help='synthetic per-sample spike probability')
    args = parser.parse_args()
    if args.capture:
        suite = load_capture(pathlib.Path(args.capture))
        describe_capture(suite)
        print('\nSOURCE: real capture (hardware evidence)')
    else:
        suite = synthetic_suite(args.rho, args.spikes)
        print(f'SOURCE: synthetic, measured sigma, {SAMPLE_HZ:.0f} Hz, rho={args.rho}, spikes={args.spikes}')
    for preset in FILTER_PROFILES:
        report(f'BEFORE  {preset} (14 Sep 2026 hold thresholds)',
               lambda p=preset: AdaptiveCursorFilter(p, LEGACY_FILTER_PROFILES), suite)
        report(f'AFTER   {preset}',
               lambda p=preset: AdaptiveCursorFilter(p, FILTER_PROFILES), suite)


if __name__ == '__main__':
    main()
