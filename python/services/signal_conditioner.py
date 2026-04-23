"""
GazeConnect Pro - Signal Conditioner (v6.0 — clean pipeline)
=============================================================
Cleans raw gaze data. NO smoothing, NO jump dampening.
Only: validation, blink hold, bounds clamp, frozen detection.
Timestamps are properly normalized to seconds.
"""

import time
import math
from dataclasses import dataclass
from typing import Optional
from enum import Enum


class GazeValidity(Enum):
    """Signal validity state."""
    VALID = "valid"
    BLINK = "blink"
    TRACKING_LOST = "lost"
    OUT_OF_BOUNDS = "oob"
    FROZEN = "frozen"


@dataclass
class ConditionedSample:
    """Output from signal conditioning."""
    x: float
    y: float
    t: float              # ALWAYS in seconds (epoch)
    state: GazeValidity
    raw_x: float
    raw_y: float


class SignalConditioner:
    """
    Cleans raw gaze data before broadcast.
    NO filtering, NO jump dampening — just clean + validate.

    v6.0 CHANGES:
    1. Robust timestamp normalization (handles ms, us, ns, s)
    2. REMOVED jump dampening entirely — saccades must be unrestricted
    3. Kept: validity check, blink hold, bounds clamp, frozen detection
    """

    BOUNDS_MIN = -0.05
    BOUNDS_MAX = 1.05
    CLAMP_MIN = 0.0
    CLAMP_MAX = 1.0

    BLINK_HOLD_MAX = 0.150
    TRACKING_LOSS_THRESHOLD = 0.500

    FROZEN_EPSILON = 0.0001
    FROZEN_MAX_FRAMES = 200  # Very permissive

    def __init__(self):
        self._last_valid_x: Optional[float] = None
        self._last_valid_y: Optional[float] = None
        self._last_valid_time: Optional[float] = None
        self._invalid_start: Optional[float] = None

        self._prev_x: Optional[float] = None
        self._prev_y: Optional[float] = None
        self._frozen_count = 0

        # Stats
        self.samples_processed = 0
        self.samples_discarded = 0
        self.blinks_detected = 0

        # Timestamp diagnostic
        self._ts_log_count = 0

    @staticmethod
    def _normalize_timestamp(raw_ts) -> float:
        """
        Convert any timestamp format to seconds (epoch).

        TobiiHelper sends: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        That's ~1.739e12 (milliseconds since epoch).

        main.py SHOULD pass this through as-is (after our fix).
        But we handle all cases defensively:
        """
        try:
            raw_ts = float(raw_ts)
        except (TypeError, ValueError):
            return time.time()

        if raw_ts <= 0:
            return time.time()
        elif raw_ts > 1e15:
            return raw_ts / 1e9       # nanoseconds -> seconds
        elif raw_ts > 1e12:
            return raw_ts / 1e3       # milliseconds -> seconds (TobiiHelper)
        elif raw_ts > 1e9:
            return raw_ts             # already seconds
        elif raw_ts > 1e6:
            return raw_ts / 1e6       # microseconds -> seconds
        else:
            return time.time()        # relative or garbage -> use wall clock

    def process(self, raw: dict) -> Optional[ConditionedSample]:
        """Process a raw gaze sample. Returns ConditionedSample or None."""
        self.samples_processed += 1

        x = raw.get('x', None)
        y = raw.get('y', None)
        if x is None or y is None:
            return None

        # --- Timestamp normalization ---
        raw_ts = raw.get('timestamp', None)
        if raw_ts is not None:
            timestamp = self._normalize_timestamp(raw_ts)
        else:
            timestamp = time.time()

        # Diagnostic logging (first 5 samples, then every 500th)
        self._ts_log_count += 1
        if self._ts_log_count <= 5 or self._ts_log_count % 500 == 0:
            import logging
            logging.getLogger('GazeConnect').info(
                f"[TIMESTAMP] raw={raw_ts} -> normalized={timestamp:.3f} "
                f"(time.time()={time.time():.3f}, diff={abs(timestamp - time.time()):.3f}s)"
            )

        is_valid = raw.get('is_valid', True)
        confidence = raw.get('confidence', 1.0)
        left_valid = raw.get('left_valid', True)
        right_valid = raw.get('right_valid', True)

        # --- 1. Validity ---
        eyes_valid = left_valid or right_valid
        confidence_ok = (confidence > 0.3) if confidence is not None else True

        if not is_valid or not eyes_valid or not confidence_ok:
            return self._handle_invalid(x, y, timestamp)

        self._invalid_start = None

        # --- 2. Bounds ---
        if x < self.BOUNDS_MIN or x > self.BOUNDS_MAX or y < self.BOUNDS_MIN or y > self.BOUNDS_MAX:
            if self._last_valid_x is not None:
                self.samples_discarded += 1
                return ConditionedSample(
                    x=self._last_valid_x, y=self._last_valid_y,
                    t=timestamp, state=GazeValidity.OUT_OF_BOUNDS,
                    raw_x=x, raw_y=y,
                )
            return None

        # Clamp
        x = max(self.CLAMP_MIN, min(self.CLAMP_MAX, x))
        y = max(self.CLAMP_MIN, min(self.CLAMP_MAX, y))

        # --- 3. Frozen detection ---
        if self._prev_x is not None:
            if (abs(x - self._prev_x) < self.FROZEN_EPSILON and
                abs(y - self._prev_y) < self.FROZEN_EPSILON):
                self._frozen_count += 1
                if self._frozen_count > self.FROZEN_MAX_FRAMES:
                    self.samples_discarded += 1
                    return ConditionedSample(
                        x=x, y=y, t=timestamp,
                        state=GazeValidity.FROZEN,
                        raw_x=x, raw_y=y,
                    )
            else:
                self._frozen_count = 0

        self._prev_x = x
        self._prev_y = y

        # --- 4. NO jump dampening (removed in v6.0) ---
        # Jump dampening was killing legitimate saccades.
        # The FixationStabilizer handles cursor stability during fixation.

        # --- 5. Accept ---
        self._last_valid_x = x
        self._last_valid_y = y
        self._last_valid_time = timestamp

        return ConditionedSample(
            x=x, y=y, t=timestamp,
            state=GazeValidity.VALID,
            raw_x=raw.get('x', x), raw_y=raw.get('y', y),
        )

    def _handle_invalid(self, x: float, y: float, timestamp: float) -> Optional[ConditionedSample]:
        """Blink suppression / tracking loss."""
        if self._invalid_start is None:
            self._invalid_start = timestamp
            self.blinks_detected += 1

        invalid_duration = timestamp - self._invalid_start

        # Guard against broken timestamps
        if invalid_duration < 0 or invalid_duration > 60:
            invalid_duration = 0

        if invalid_duration <= self.BLINK_HOLD_MAX and self._last_valid_x is not None:
            return ConditionedSample(
                x=self._last_valid_x, y=self._last_valid_y,
                t=timestamp, state=GazeValidity.BLINK,
                raw_x=x, raw_y=y,
            )
        elif invalid_duration <= self.TRACKING_LOSS_THRESHOLD and self._last_valid_x is not None:
            return ConditionedSample(
                x=self._last_valid_x, y=self._last_valid_y,
                t=timestamp, state=GazeValidity.BLINK,
                raw_x=x, raw_y=y,
            )
        else:
            self.samples_discarded += 1
            return None

    def get_stats(self) -> dict:
        return {
            'samples_processed': self.samples_processed,
            'samples_discarded': self.samples_discarded,
            'blinks_detected': self.blinks_detected,
            'discard_rate': self.samples_discarded / max(1, self.samples_processed),
        }

    def reset(self):
        self._last_valid_x = None
        self._last_valid_y = None
        self._last_valid_time = None
        self._invalid_start = None
        self._prev_x = None
        self._prev_y = None
        self._frozen_count = 0
