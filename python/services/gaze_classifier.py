"""
GazeConnect Pro - Gaze State Classifier (v6.0)
================================================
I-VT classifier with hysteresis, tuned for AAC users.

v6.0: AAC-friendly thresholds — ALS users have baseline tremor that
kept the old 30 deg/s classifier from ever detecting fixation.
"""

import math
from collections import deque
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class GazeState(Enum):
    FIXATION = "fixation"
    SACCADE = "saccade"
    GLISSADE = "glissade"
    UNKNOWN = "unknown"  # v17: Blink/tracking-lost — no valid gaze data


@dataclass
class ScreenParams:
    width_px: int = 1920
    height_px: int = 1080
    width_mm: float = 530.0
    height_mm: float = 300.0
    viewing_distance_mm: float = 600.0

    @property
    def px_per_deg_x(self) -> float:
        mm_per_deg = self.viewing_distance_mm * math.tan(math.radians(1))
        px_per_mm = self.width_px / self.width_mm
        return mm_per_deg * px_per_mm

    @property
    def px_per_deg_y(self) -> float:
        mm_per_deg = self.viewing_distance_mm * math.tan(math.radians(1))
        px_per_mm = self.height_px / self.height_mm
        return mm_per_deg * px_per_mm


class GazeClassifier:
    """I-VT classifier tuned for AAC users."""

    FIXATION_THRESHOLD = 65.0     # v12: raised for Tobii 5 noise + ALS tremor
    SACCADE_THRESHOLD = 150.0     # v12: raised to avoid false saccades from jitter

    SACCADE_ONSET_COUNT = 2       # Fast saccade detection
    FIXATION_ONSET_COUNT = 4      # Confident fixation lock

    VELOCITY_WINDOW = 5

    def __init__(self, screen_params: Optional[ScreenParams] = None):
        self.screen = screen_params or ScreenParams()
        self.state = GazeState.FIXATION

        self._prev_x: Optional[float] = None
        self._prev_y: Optional[float] = None
        self._prev_t: Optional[float] = None

        self._velocity_history: deque = deque(maxlen=self.VELOCITY_WINDOW)

        self._high_velocity_count = 0
        self._low_velocity_count = 0

        self.current_velocity = 0.0

        self.fixation_count = 0
        self.saccade_count = 0

        # Diagnostic logging
        self._classify_log_count = 0

    def mark_tracking_lost(self):
        """
        v17: Mark gaze as lost (blink, stale, tracking dropout).
        Transitions to UNKNOWN state. Does NOT reset velocity history —
        when tracking resumes, the first valid sample will be compared
        against the last known position for proper velocity computation.
        """
        self.state = GazeState.UNKNOWN
        self._high_velocity_count = 0
        self._low_velocity_count = 0

    def classify(self, x_norm: float, y_norm: float, timestamp: float) -> GazeState:
        """Classify gaze sample. timestamp MUST be in SECONDS."""
        if self._prev_t is None:
            self._prev_x = x_norm
            self._prev_y = y_norm
            self._prev_t = timestamp
            return self.state

        dt = timestamp - self._prev_t
        if dt <= 0 or dt > 1.0:
            dt = 1.0 / 133.0  # Assume 133Hz

        velocity = self._compute_velocity(x_norm, y_norm, dt)

        self._velocity_history.append(velocity)
        median_velocity = self._median(list(self._velocity_history))
        self.current_velocity = median_velocity

        self._update_state(median_velocity)

        # Diagnostic: log classification results periodically
        self._classify_log_count += 1
        if self._classify_log_count <= 10 or self._classify_log_count % 500 == 0:
            import logging
            logging.getLogger('GazeConnect').info(
                f"[CLASSIFIER] dt={dt:.6f}s vel={velocity:.1f} deg/s "
                f"median={median_velocity:.1f} deg/s state={self.state.value} "
                f"fix_count={self._low_velocity_count} sac_count={self._high_velocity_count}"
            )

        self._prev_x = x_norm
        self._prev_y = y_norm
        self._prev_t = timestamp

        return self.state

    def _compute_velocity(self, x_norm: float, y_norm: float, dt: float) -> float:
        dx_px = (x_norm - self._prev_x) * self.screen.width_px
        dy_px = (y_norm - self._prev_y) * self.screen.height_px
        dx_deg = dx_px / self.screen.px_per_deg_x
        dy_deg = dy_px / self.screen.px_per_deg_y
        velocity = math.sqrt(dx_deg * dx_deg + dy_deg * dy_deg) / dt

        # v12: Velocity floor — sub-pixel movements are noise, not intentional
        # At 133Hz, 1px movement = ~28 deg/s. Below 5 deg/s is pure noise.
        VELOCITY_FLOOR = 5.0
        if velocity < VELOCITY_FLOOR:
            velocity = 0.0

        return velocity

    def _update_state(self, velocity: float):
        if velocity > self.SACCADE_THRESHOLD:
            self._high_velocity_count += 1
            self._low_velocity_count = 0
        elif velocity < self.FIXATION_THRESHOLD:
            self._low_velocity_count += 1
            self._high_velocity_count = 0
        else:
            pass  # Glissade range — don't reset counters

        prev_state = self.state

        if self._high_velocity_count >= self.SACCADE_ONSET_COUNT:
            self.state = GazeState.SACCADE
        elif self._low_velocity_count >= self.FIXATION_ONSET_COUNT:
            self.state = GazeState.FIXATION
        elif self.state == GazeState.SACCADE and velocity < self.SACCADE_THRESHOLD:
            self.state = GazeState.GLISSADE

        if prev_state != self.state:
            if self.state == GazeState.FIXATION:
                self.fixation_count += 1
            elif self.state == GazeState.SACCADE:
                self.saccade_count += 1

    @staticmethod
    def _median(values: list) -> float:
        if not values:
            return 0.0
        s = sorted(values)
        n = len(s)
        if n % 2 == 1:
            return s[n // 2]
        return (s[n // 2 - 1] + s[n // 2]) / 2.0

    def update_screen_params(self, width_px=None, height_px=None,
                              width_mm=None, height_mm=None,
                              viewing_distance_mm=None):
        if width_px is not None: self.screen.width_px = width_px
        if height_px is not None: self.screen.height_px = height_px
        if width_mm is not None: self.screen.width_mm = width_mm
        if height_mm is not None: self.screen.height_mm = height_mm
        if viewing_distance_mm is not None: self.screen.viewing_distance_mm = viewing_distance_mm

    def reset(self):
        self.state = GazeState.FIXATION
        self._prev_x = None
        self._prev_y = None
        self._prev_t = None
        self._velocity_history.clear()
        self._high_velocity_count = 0
        self._low_velocity_count = 0
        self.current_velocity = 0.0

    def get_stats(self) -> dict:
        return {
            'current_state': self.state.value,
            'current_velocity_dps': round(self.current_velocity, 1),
            'fixation_count': self.fixation_count,
            'saccade_count': self.saccade_count,
        }
