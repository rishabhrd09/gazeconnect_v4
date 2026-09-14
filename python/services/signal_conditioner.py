"""Finite-value validation and short display holds; never manufactures valid gaze."""
import math
import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class GazeValidity(Enum):
    VALID = 'valid'
    BLINK = 'blink'
    TRACKING_LOST = 'lost'
    OUT_OF_BOUNDS = 'oob'
    FROZEN = 'frozen'  # Retained for recorded trace compatibility.


@dataclass
class ConditionedSample:
    x: float
    y: float
    t: float
    state: GazeValidity
    raw_x: float
    raw_y: float
    confidence: float = 1.0
    validity_source: str = 'reported'


class SignalConditioner:
    BLINK_HOLD_MAX = 0.150

    def __init__(self):
        self.samples_processed = 0
        self.samples_discarded = 0
        self.blinks_detected = 0
        self.reset()

    @staticmethod
    def _normalize_timestamp(raw_ts) -> float:
        """Epoch seconds, milliseconds, microseconds or nanoseconds only.

        Relative device clocks must be accompanied by an acquisition epoch
        stamp. Invalid/missing timestamps stay invalid instead of becoming fresh.
        """
        try:
            value = float(raw_ts)
        except (TypeError, ValueError):
            return float('nan')
        if not math.isfinite(value) or value <= 0:
            return float('nan')
        if value >= 1e17:
            return value / 1e9
        if value >= 1e14:
            return value / 1e6
        if value >= 1e11:
            return value / 1e3
        return value

    def process(self, raw: dict) -> ConditionedSample:
        self.samples_processed += 1
        timestamp = self._normalize_timestamp(raw.get('timestamp'))
        try:
            x, y = float(raw.get('x')), float(raw.get('y'))
            confidence = float(raw.get('confidence', 0.0))
        except (TypeError, ValueError):
            x = y = confidence = float('nan')
        source = str(raw.get('validity_source', 'missing'))
        finite = all(math.isfinite(value) for value in (x, y, confidence, timestamp))
        # Explicit false must override a valid eye; missing validity is not a
        # trustworthy new measurement. Repeated positions can be a real fixation.
        eyes_valid = raw.get('left_valid') is True or raw.get('right_valid') is True
        valid = finite and raw.get('is_valid') is True and eyes_valid and confidence > 0.5
        in_bounds = finite and 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0
        if valid and in_bounds:
            self._last_valid = (x, y)
            self._invalid_start = None
            return ConditionedSample(x, y, timestamp, GazeValidity.VALID, x, y,
                                     min(1.0, confidence), source)
        self.samples_discarded += 1
        now = timestamp if math.isfinite(timestamp) else time.time()
        if self._invalid_start is None:
            self._invalid_start = now
            self.blinks_detected += 1
        state = (GazeValidity.OUT_OF_BOUNDS if valid and not in_bounds else
                 GazeValidity.BLINK if self._last_valid is not None and
                 0 <= now - self._invalid_start <= self.BLINK_HOLD_MAX else
                 GazeValidity.TRACKING_LOST)
        held_x, held_y = self._last_valid or (0.5, 0.5)
        return ConditionedSample(held_x, held_y, now, state,
                                 x if math.isfinite(x) else held_x,
                                 y if math.isfinite(y) else held_y, 0.0, source)

    def get_stats(self):
        return {'samples_processed': self.samples_processed,
                'samples_discarded': self.samples_discarded,
                'blinks_detected': self.blinks_detected,
                'discard_rate': self.samples_discarded / max(1, self.samples_processed)}

    def reset(self):
        self._last_valid: Optional[tuple] = None
        self._invalid_start: Optional[float] = None
