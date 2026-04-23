"""
Synthetic keyboard benchmark for gaze tuning changes.

This script compares baseline vs tuned keyboard profiles on:
- letter hit-rate for "rishabh"
- average word completion time

It models Tobii-like jitter and a systematic vertical bias, then applies
sticky-target magnetism with profile-specific parameters.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Dict, Tuple


WORD = "rishabh"


def build_keyboard_centers() -> Dict[str, Tuple[float, float]]:
    # Approximate QWERTY centers in content-pixel space (15.6in, 1536x782 profile).
    top = 430.0
    row_gap = 96.0
    step = 116.0
    left = 170.0
    rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
    offsets = [0.0, 0.5, 1.2]

    centers: Dict[str, Tuple[float, float]] = {}
    for r, row in enumerate(rows):
        y = top + r * row_gap
        for i, ch in enumerate(row):
            x = left + (i + offsets[r]) * step
            centers[ch] = (x, y)
    return centers


KEY_CENTERS = build_keyboard_centers()


@dataclass
class Profile:
    name: str
    magnet_radius: float
    magnet_pull: float
    release_radius: float
    dwell_base_ms: int
    dwell_accel_1_ms: int
    dwell_accel_2_ms: int
    use_acceleration: bool


class Simulator:
    def __init__(
        self,
        profile: Profile,
        jitter_px: float = 25.0,
        bias_x_px: float = 0.0,
        bias_y_px: float = -12.0,
    ):
        self.profile = profile
        self.jitter_px = jitter_px
        self.bias_x_px = bias_x_px
        self.bias_y_px = bias_y_px

    def _apply_magnetism(
        self,
        gx: float,
        gy: float,
        sticky_target: Tuple[float, float] | None,
    ) -> Tuple[float, float, Tuple[float, float] | None]:
        p = self.profile

        if sticky_target is not None:
            dx = gx - sticky_target[0]
            dy = gy - sticky_target[1]
            dist = math.hypot(dx, dy)
            if dist <= p.release_radius:
                nd = min(1.0, dist / p.magnet_radius)
                pull = p.magnet_pull * (1.0 - nd) ** 2
                return (
                    gx + pull * (sticky_target[0] - gx),
                    gy + pull * (sticky_target[1] - gy),
                    sticky_target,
                )
            sticky_target = None

        nearest = None
        nearest_dist = float("inf")
        for _, (tx, ty) in KEY_CENTERS.items():
            d = math.hypot(gx - tx, gy - ty)
            if d < nearest_dist:
                nearest = (tx, ty)
                nearest_dist = d

        if nearest is None or nearest_dist > p.magnet_radius:
            return gx, gy, None

        nd = nearest_dist / p.magnet_radius
        pull = p.magnet_pull * (1.0 - nd) ** 2
        return (
            gx + pull * (nearest[0] - gx),
            gy + pull * (nearest[1] - gy),
            nearest,
        )

    def run_once(self, seed: int) -> Tuple[int, int]:
        rnd = random.Random(seed)
        sticky = None
        streak = 0
        last_commit_ms = -10_000
        now_ms = 0
        correct = 0

        for ch in WORD:
            if self.profile.use_acceleration and (now_ms - last_commit_ms) <= 2200 and streak > 0:
                streak = min(3, streak + 1)
            else:
                streak = 1

            if self.profile.use_acceleration:
                if streak == 1:
                    dwell_ms = self.profile.dwell_base_ms
                elif streak == 2:
                    dwell_ms = self.profile.dwell_accel_1_ms
                else:
                    dwell_ms = self.profile.dwell_accel_2_ms
            else:
                dwell_ms = self.profile.dwell_base_ms

            frames = max(1, int(dwell_ms / 7.5))
            tx, ty = KEY_CENTERS[ch]
            sx, sy = tx, ty

            for _ in range(frames):
                gx = tx + rnd.gauss(self.bias_x_px, self.jitter_px)
                gy = ty + rnd.gauss(self.bias_y_px, self.jitter_px)
                sx, sy, sticky = self._apply_magnetism(gx, gy, sticky)

            selected = min(
                KEY_CENTERS.items(),
                key=lambda kv: math.hypot(sx - kv[1][0], sy - kv[1][1]),
            )[0]
            if selected == ch:
                correct += 1

            last_commit_ms = now_ms
            now_ms += dwell_ms + 80  # inter-key saccade/settle time

        return correct, now_ms

    def evaluate(self, trials: int = 1200) -> Tuple[float, float]:
        total_correct = 0
        total_time_ms = 0
        total_letters = trials * len(WORD)

        for i in range(trials):
            correct, word_time_ms = self.run_once(seed=i + 7)
            total_correct += correct
            total_time_ms += word_time_ms

        return total_correct / total_letters, total_time_ms / trials


def main():
    baseline = Profile(
        name="baseline",
        magnet_radius=100.0,
        magnet_pull=0.75,
        release_radius=90.0,
        dwell_base_ms=550,
        dwell_accel_1_ms=550,
        dwell_accel_2_ms=550,
        use_acceleration=False,
    )
    tuned = Profile(
        name="tuned",
        magnet_radius=120.0,
        magnet_pull=0.82,
        release_radius=110.0,
        dwell_base_ms=500,
        dwell_accel_1_ms=350,
        dwell_accel_2_ms=250,
        use_acceleration=True,
    )

    for profile in (baseline, tuned):
        sim = Simulator(profile)
        acc, t_ms = sim.evaluate(trials=1200)
        print(
            f"{profile.name}: hit_rate={acc*100:.2f}% avg_word_ms={t_ms:.1f}"
        )


if __name__ == "__main__":
    main()
