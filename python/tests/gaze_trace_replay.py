"""
Replay a gaze CSV through the active backend pipeline and report bench metrics.

Input columns match gaze_synthetic_traces.py.
"""

import argparse
import csv
import math
import pathlib
import sys
from collections import defaultdict
from statistics import mean
from typing import Dict, List


ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from main import GazeConnectBackend, GazePoint, ServerConfig  # noqa: E402


PX_PER_DEG_23IN_1080P_60CM = 39.5


class ReplayBackend(GazeConnectBackend):
    POINT_TTL_SECONDS = 10**9

    def _broadcast(self, msg_type: str, data: Dict = None):
        if msg_type == "gaze":
            self.replayed_payloads.append(data or {})


def replay_csv(path: pathlib.Path) -> Dict[str, float]:
    backend = ReplayBackend(ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False))
    backend.replayed_payloads: List[Dict] = []
    labels: List[str] = []

    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            labels.append(row.get("label", "unknown"))
            backend._on_gaze_data(GazePoint(
                x=float(row["x"]),
                y=float(row["y"]),
                timestamp=float(row["timestamp"]),
                left_valid=row.get("left_valid", "1") == "1",
                right_valid=row.get("right_valid", "1") == "1",
                confidence=float(row.get("confidence", 1.0)),
            ))

    by_label: Dict[str, List[Dict]] = defaultdict(list)
    for label, payload in zip(labels[-len(backend.replayed_payloads):], backend.replayed_payloads):
        by_label[label].append(payload)

    metrics: Dict[str, float] = {
        "samples": float(len(backend.replayed_payloads)),
        "sample_rate_hz": float((backend._last_gaze_payload or {}).get("sample_rate_hz") or 0.0),
    }

    for label, payloads in by_label.items():
        if not payloads:
            continue
        xs = [float(p["x"]) * backend.screen_width for p in payloads if "x" in p]
        ys = [float(p["y"]) * backend.screen_height for p in payloads if "y" in p]
        if not xs or not ys:
            continue
        cx = mean(xs)
        cy = mean(ys)
        rms_px = math.sqrt(mean([(x - cx) ** 2 + (y - cy) ** 2 for x, y in zip(xs, ys)]))
        metrics[f"{label}.rms_px"] = round(rms_px, 3)
        metrics[f"{label}.rms_deg"] = round(rms_px / PX_PER_DEG_23IN_1080P_60CM, 4)
        metrics[f"{label}.locked_pct"] = round(
            100.0 * sum(1 for p in payloads if p.get("is_fixation")) / len(payloads),
            2,
        )

    return metrics


def main():
    parser = argparse.ArgumentParser(description="Replay gaze CSV through backend pipeline")
    parser.add_argument("csv")
    args = parser.parse_args()
    metrics = replay_csv(pathlib.Path(args.csv))
    for key in sorted(metrics):
        print(f"{key}: {metrics[key]}")


if __name__ == "__main__":
    main()
