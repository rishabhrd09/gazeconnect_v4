"""
Synthetic gaze traces for repeatable ET5 pipeline validation.

CSV columns:
timestamp,x,y,left_valid,right_valid,confidence,label
Coordinates are normalized screen coordinates.
"""

import argparse
import csv
import math
import random
import time
from pathlib import Path
from typing import Iterable, Tuple


def _sample_times(duration_s: float, hz: float, start_s: float = 0.0) -> Iterable[float]:
    count = int(duration_s * hz)
    for i in range(count):
        yield start_s + i / hz


def _write_row(writer, t: float, x: float, y: float, label: str,
               valid: bool = True, confidence: float = 1.0):
    writer.writerow({
        "timestamp": f"{t:.6f}",
        "x": f"{max(0.0, min(1.0, x)):.6f}",
        "y": f"{max(0.0, min(1.0, y)):.6f}",
        "left_valid": "1" if valid else "0",
        "right_valid": "1" if valid else "0",
        "confidence": f"{confidence:.3f}",
        "label": label,
    })


def generate_trace(path: Path, hz: float = 133.0, seed: int = 7):
    rng = random.Random(seed)
    t0 = time.time()

    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["timestamp", "x", "y", "left_valid", "right_valid", "confidence", "label"],
        )
        writer.writeheader()

        t = t0
        px_sigma_norm = 2.0 / 1920.0
        for ts in _sample_times(2.0, hz, t):
            _write_row(
                writer, ts,
                0.5 + rng.gauss(0, px_sigma_norm),
                0.5 + rng.gauss(0, px_sigma_norm),
                "stable_fixation",
            )
        t += 2.0

        start: Tuple[float, float] = (200 / 1920, 540 / 1080)
        end: Tuple[float, float] = (1700 / 1920, 540 / 1080)
        for ts in _sample_times(0.050, hz, t):
            p = min(1.0, max(0.0, (ts - t) / 0.050))
            eased = 0.5 - 0.5 * math.cos(math.pi * p)
            _write_row(writer, ts, start[0] + (end[0] - start[0]) * eased, start[1], "saccade")
        t += 0.050

        tremor_amp_x = 5.0 / 1920.0
        for ts in _sample_times(2.0, hz, t):
            phase = 2 * math.pi * 30.0 * (ts - t)
            _write_row(writer, ts, 0.5 + tremor_amp_x * math.sin(phase), 0.5, "tremor_30hz")
        t += 2.0

        for ts in _sample_times(0.8, hz, t):
            blink = 0.25 <= (ts - t) <= 0.45
            _write_row(writer, ts, 0.5, 0.5, "blink_200ms", valid=not blink, confidence=0.0 if blink else 1.0)
        t += 0.8

        drift_px = 20.0 / 1920.0
        for ts in _sample_times(2.0, hz, t):
            p = min(1.0, max(0.0, (ts - t) / 2.0))
            _write_row(writer, ts, 0.5 + drift_px * p, 0.5, "calibration_drift")
        t += 2.0

        pursuit_px = 220.0 / 1920.0
        for ts in _sample_times(4.0, hz, t):
            p = min(1.0, max(0.0, (ts - t) / 4.0))
            _write_row(writer, ts, 0.38 + pursuit_px * p, 0.62, "slow_pursuit")


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic gaze trace CSV")
    parser.add_argument("output", nargs="?", default="python/tests/fixtures/synthetic_gaze_trace.csv")
    parser.add_argument("--hz", type=float, default=133.0)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    generate_trace(output, hz=args.hz, seed=args.seed)
    print(output)


if __name__ == "__main__":
    main()
