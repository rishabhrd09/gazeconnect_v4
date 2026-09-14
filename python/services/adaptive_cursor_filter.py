"""Original elapsed-time cursor smoother. No prediction or gaze-to-target warping.

The filter is a first-order low pass: alpha = 1 - exp(-dt / tau).  Large
position errors reduce tau for prompt travel; small errors receive damping.
Only an already acquired target can enable a tiny display hold. Dwell ownership
and timing remain the renderer's responsibility. All distances are CSS pixels.
"""
from dataclasses import dataclass
import math
from typing import Optional


@dataclass(frozen=True)
class CursorProfile:
    settle_ms: float
    travel_ms: float
    hold_px: float
    release_px: float
    settle_before_hold_ms: float


FILTER_PROFILES = {
    'responsive': CursorProfile(30, 8, 1.5, 4, 90),
    'balanced': CursorProfile(55, 12, 2.5, 6, 120),
    'stable': CursorProfile(85, 16, 3.5, 8, 150),
    'gentle': CursorProfile(115, 20, 4.5, 10, 180),
}
FILTER_ALIASES = {'normal': 'balanced', 'als_early': 'balanced', 'als_late': 'gentle'}


def normalize_filter_preset(value: str) -> str:
    return FILTER_ALIASES.get(value, value)


class AdaptiveCursorFilter:
    """Constant-memory smoother whose response depends on elapsed time."""
    def __init__(self, preset: str = 'balanced'):
        self.configure(preset)

    def configure(self, preset: str):
        canonical = normalize_filter_preset(preset)
        if canonical not in FILTER_PROFILES:
            raise ValueError(f'Unknown cursor preset: {preset}')
        self.preset = canonical
        self.profile = FILTER_PROFILES[canonical]
        self.reset()

    def reset(self):
        self._point = None
        self._time = None
        self._target_id = None
        self._stable_since = None
        self.zone = 'free'

    def update(self, x: float, y: float, timestamp: float,
               target_id: Optional[str] = None):
        if not all(math.isfinite(v) for v in (x, y, timestamp)):
            raise ValueError('Cursor samples must be finite')
        if self._point is None or timestamp - self._time > 0.150:
            self._point = (x, y)
            self._time = timestamp
            self._target_id = target_id
            self._stable_since = timestamp
            self.zone = 'free'
            return self._point
        dt = timestamp - self._time
        if dt <= 0:
            return self._point  # Duplicate/out-of-order data never moves the cursor.
        self._time = timestamp
        old_x, old_y = self._point
        distance = math.hypot(x - old_x, y - old_y)
        profile = self.profile
        if target_id != self._target_id:
            self.zone = 'free'
            self._stable_since = timestamp
        self._target_id = target_id
        if target_id and self.zone == 'lock' and distance <= profile.release_px:
            return self._point
        if distance > profile.hold_px or not target_id:
            self._stable_since = timestamp
            self.zone = 'free'
        elif (timestamp - self._stable_since) * 1000 >= profile.settle_before_hold_ms:
            self.zone = 'lock'
            return self._point
        # Convex interpolation cannot overshoot the current measurement. There
        # is no velocity extrapolation, gain amplification, or minimum lock time.
        travel = min(1.0, max(0.0, (distance - 12.0) / 68.0))
        tau = (profile.settle_ms * (1 - travel) + profile.travel_ms * travel) / 1000
        alpha = -math.expm1(-dt / tau)
        self._point = (old_x + alpha * (x - old_x), old_y + alpha * (y - old_y))
        self.zone = 'travel' if travel >= 0.5 else 'settling'
        return self._point
