"""
GazeConnect Pro - Gaze Filter + Fixation Stabilizer
====================================================
Two-layer cursor processing:
  Layer 1: One Euro Filter (GazeFilter2D) — reduces high-frequency jitter
  Layer 2: FixationStabilizer — OptiKey-style cursor lock during fixation

The One Euro Filter smooths noisy gaze data using velocity-adaptive cutoff.
The FixationStabilizer locks the cursor when the user stares at a target.
Together they give: stable during fixation, responsive during saccade.
"""

import math
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional, Tuple, List, Dict
from enum import Enum


# =============================================================================
# STATE-ADAPTIVE PARAMETERS
# =============================================================================

STATE_FILTER_PARAMS = {
    'fixation': {'min_cutoff': 0.4, 'beta': 0.007},
    'saccade':  {'min_cutoff': 3.0, 'beta': 8.0},
    'glissade': {'min_cutoff': 0.8, 'beta': 0.3},
}


def compute_edge_factor(x_norm: float, y_norm: float) -> float:
    """Returns 1.0 always. Edge factor disabled."""
    return 1.0


# =============================================================================
# DATA TYPES
# =============================================================================

class FilterPreset(Enum):
    STABLE = "stable"
    BALANCED = "balanced"
    RESPONSIVE = "responsive"
    ALS_EARLY = "als_early"
    ALS_LATE = "als_late"


@dataclass
class FilterConfig:
    min_cutoff: float = 0.7
    beta: float = 12.0
    d_cutoff: float = 1.0

    @classmethod
    def from_preset(cls, preset: FilterPreset) -> 'FilterConfig':
        # min_cutoff controls minimum smoothing (higher = less lag, more jitter)
        # beta controls velocity adaptation (higher = more responsive to saccades)
        # At 133Hz with corrected timestamps:
        #   min_cutoff=1.0 → tau=0.159s → ~160ms lag (good smoothing for AAC)
        #   min_cutoff=1.5 → tau=0.106s → ~106ms lag (less smoothing)
        #   min_cutoff=0.7 → tau=0.227s → ~230ms lag (too sluggish)
        # Reduced BALANCED min_cutoff from 1.5→1.0 for more fixation smoothing.
        # The FixationStabilizer handles responsiveness — One Euro's job is noise reduction.
        presets = {
            FilterPreset.STABLE:     cls(min_cutoff=0.8, beta=10.0, d_cutoff=1.0),
            FilterPreset.BALANCED:   cls(min_cutoff=1.0, beta=15.0, d_cutoff=1.0),
            FilterPreset.RESPONSIVE: cls(min_cutoff=2.0, beta=20.0, d_cutoff=1.0),
            FilterPreset.ALS_EARLY:  cls(min_cutoff=0.9, beta=12.0, d_cutoff=1.0),
            FilterPreset.ALS_LATE:   cls(min_cutoff=0.8, beta=10.0, d_cutoff=1.0),
        }
        return presets.get(preset, cls())


class LowPassFilter:
    """Simple first-order low-pass filter."""

    def __init__(self, alpha: float = 1.0):
        self.alpha = alpha
        self.y_prev = None
        self.initialized = False

    def filter(self, x: float, alpha: Optional[float] = None) -> float:
        a = alpha if alpha is not None else self.alpha
        if not self.initialized:
            self.y_prev = x
            self.initialized = True
            return x
        result = a * x + (1 - a) * self.y_prev
        self.y_prev = result
        return result

    def reset(self):
        self.y_prev = None
        self.initialized = False


class OneEuroFilter:
    """
    One Euro Filter (Casiez et al. 2012) with state-adaptive parameters.
    Formula: fc = min_cutoff + beta * |velocity|
    """

    def __init__(self, config: Optional[FilterConfig] = None):
        self.config = config or FilterConfig()
        self.x_filter = LowPassFilter()
        self.dx_filter = LowPassFilter()
        self.last_time: Optional[float] = None
        self.last_value: Optional[float] = None
        self.samples_processed = 0
        self.current_cutoff = self.config.min_cutoff

    @staticmethod
    def _compute_alpha(cutoff: float, dt: float) -> float:
        if dt <= 0:
            return 1.0
        tau = 1.0 / (2 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def filter(self, x: float, timestamp: Optional[float] = None) -> float:
        """Filter a single value. Timestamp must be in SECONDS."""
        if timestamp is None:
            timestamp = time.time()

        self.samples_processed += 1

        # First sample
        if self.last_time is None:
            self.last_time = timestamp
            self.last_value = x
            self.x_filter.filter(x)
            self.dx_filter.filter(0.0)
            return x

        # Compute time delta
        dt = timestamp - self.last_time
        if dt <= 0 or dt > 1.0:
            dt = 1.0 / 133.0  # Assume 133Hz if invalid

        # Estimate velocity (derivative)
        dx = (x - self.last_value) / dt

        # Filter the derivative
        alpha_d = self._compute_alpha(self.config.d_cutoff, dt)
        dx_filtered = self.dx_filter.filter(dx, alpha_d)

        # Compute adaptive cutoff based on velocity
        cutoff = self.config.min_cutoff + self.config.beta * abs(dx_filtered)
        self.current_cutoff = cutoff

        # Filter the signal
        alpha = self._compute_alpha(cutoff, dt)
        x_filtered = self.x_filter.filter(x, alpha)

        # Update state
        self.last_time = timestamp
        self.last_value = x

        return x_filtered

    def update_params(self, min_cutoff=None, beta=None, d_cutoff=None):
        if min_cutoff is not None: self.config.min_cutoff = min_cutoff
        if beta is not None: self.config.beta = beta
        if d_cutoff is not None: self.config.d_cutoff = d_cutoff

    def apply_state_params(self, gaze_state: str, edge_factor: float = 1.0, fatigue_factor: float = 1.0):
        """Apply state-dependent filter parameters."""
        params = STATE_FILTER_PARAMS.get(gaze_state, STATE_FILTER_PARAMS['fixation'])
        self.config.min_cutoff = params['min_cutoff']
        self.config.beta = params['beta']

    def reset(self):
        self.last_time = None
        self.last_value = None
        self.x_filter.reset()
        self.dx_filter.reset()


@dataclass
class GazePoint:
    x: float
    y: float
    timestamp: float
    left_valid: bool = True
    right_valid: bool = True
    confidence: float = 1.0

    @property
    def is_valid(self) -> bool:
        return (self.left_valid or self.right_valid) and self.confidence > 0.5


@dataclass
class FilteredGaze:
    x: float
    y: float
    timestamp: float
    is_valid: bool
    is_fixation: bool
    confidence: float
    velocity: float
    raw_x: float
    raw_y: float


# =============================================================================
# GAZE FILTER 2D — One Euro Filter on both axes
# =============================================================================

class GazeFilter2D:
    """
    Applies One Euro Filter to X and Y independently.
    Reduces high-frequency jitter while preserving saccade responsiveness.
    """

    FIXATION_VELOCITY_THRESHOLD = 0.08
    FIXATION_MIN_DURATION = 0.08

    def __init__(self, config: Optional[FilterConfig] = None):
        self.config = config or FilterConfig()
        self.x_filter = OneEuroFilter(FilterConfig(
            min_cutoff=self.config.min_cutoff,
            beta=self.config.beta,
            d_cutoff=self.config.d_cutoff,
        ))
        self.y_filter = OneEuroFilter(FilterConfig(
            min_cutoff=self.config.min_cutoff,
            beta=self.config.beta,
            d_cutoff=self.config.d_cutoff,
        ))

        self.last_valid_point: Optional[GazePoint] = None
        self.fixation_start: Optional[float] = None
        self.is_fixating = False
        self.total_samples = 0
        self.valid_samples = 0

    def filter(self, point: GazePoint) -> FilteredGaze:
        """Apply One Euro Filter to both axes."""
        self.total_samples += 1

        if not point.is_valid:
            if self.last_valid_point:
                return FilteredGaze(
                    x=self.last_valid_point.x, y=self.last_valid_point.y,
                    timestamp=point.timestamp,
                    is_valid=False, is_fixation=self.is_fixating,
                    confidence=0.0, velocity=0.0,
                    raw_x=point.x, raw_y=point.y
                )
            return FilteredGaze(
                x=0.5, y=0.5, timestamp=point.timestamp,
                is_valid=False, is_fixation=False, confidence=0.0,
                velocity=0.0, raw_x=point.x, raw_y=point.y
            )

        # Apply One Euro Filter to each axis
        filtered_x = self.x_filter.filter(point.x, point.timestamp)
        filtered_y = self.y_filter.filter(point.y, point.timestamp)

        # Compute velocity for fixation detection
        velocity = 0.0
        if self.last_valid_point:
            dt = point.timestamp - self.last_valid_point.timestamp
            if 0 < dt < 1.0:
                dx = filtered_x - self.last_valid_point.x
                dy = filtered_y - self.last_valid_point.y
                velocity = math.sqrt(dx*dx + dy*dy) / dt

        # Fixation detection (simple threshold)
        if velocity < self.FIXATION_VELOCITY_THRESHOLD:
            if self.fixation_start is None:
                self.fixation_start = point.timestamp
            elif point.timestamp - self.fixation_start >= self.FIXATION_MIN_DURATION:
                self.is_fixating = True
        else:
            self.fixation_start = None
            self.is_fixating = False

        self.last_valid_point = GazePoint(
            x=filtered_x, y=filtered_y, timestamp=point.timestamp,
            left_valid=point.left_valid, right_valid=point.right_valid,
            confidence=point.confidence,
        )
        self.valid_samples += 1

        # Clamp output
        out_x = max(0.0, min(1.0, filtered_x))
        out_y = max(0.0, min(1.0, filtered_y))

        return FilteredGaze(
            x=out_x, y=out_y,
            timestamp=point.timestamp,
            is_valid=True, is_fixation=self.is_fixating,
            confidence=point.confidence, velocity=velocity,
            raw_x=point.x, raw_y=point.y
        )

    def reset(self):
        self.x_filter.reset()
        self.y_filter.reset()
        self.last_valid_point = None
        self.fixation_start = None
        self.is_fixating = False

    def get_stats(self) -> Dict:
        return {
            'total_samples': self.total_samples,
            'valid_samples': self.valid_samples,
            'filter_mode': 'One Euro + FixationStabilizer',
        }

    def update_config(self, config):
        self.config = config


# =============================================================================
# FIXATION STABILIZER — OptiKey-style cursor lock (self-contained)
# =============================================================================

class FixationStabilizer:
    """
    OptiKey-style fixation lock with three-layer robustness.

    THREE LAYERS OF LOCK PROTECTION:

    1. FROZEN CENTROID: When locked, centroid uses alpha=0.02 regardless of state.
       Old bug: glissade used alpha=0.10, causing centroid drift → false breaks.
       Now: centroid barely moves when locked. Lock is rock-solid.

    2. TIME-BASED BREAK: Must exceed displacement for 3 CONSECUTIVE frames.
       Old bug: single noise spike broke lock instantly.
       Now: only sustained displacement (real saccade) can break the lock.
       3 frames = ~22ms at 133Hz — still fast enough for responsive tracking.

    3. FRAME GAP PROTECTION: Skip state updates after gaps > 100ms.
       Tobii drops frames frequently (120-244ms gaps in real logs).
       After a gap, position jumps dramatically — NOT a real saccade.
       When locked: return frozen centroid. When unlocked: snap to new pos.

    Lock behavior:
    - BUILD: position within 4.5% of centroid for 2 frames → LOCKED
    - HOLD: centroid frozen (alpha=0.02), single noise spikes ignored
    - BREAK: displacement > 8% for 3 consecutive frames → UNLOCKED
    """

    # === SACCADE DETECTION ===
    SACCADE_VEL_THRESHOLD = 3.5     # Smoothed velocity for unlocked saccade detection
    VEL_SMOOTH_ALPHA = 0.3          # EMA on velocity absorbs noise spikes
    SACCADE_DISPLACEMENT = 0.08     # 8% screen ≈ 86px — locked break requires this displacement
    #   Edge noise peaks at cdist ~0.05-0.06 (with frame gaps) → below 0.08 → lock holds.
    #   Real saccade (adjacent 80px buttons): ~0.083 → above 0.08 → lock breaks.
    SACCADE_BREAK_FRAMES = 3        # Must exceed displacement for 3 CONSECUTIVE frames to break
    #   Prevents single-frame noise spikes from breaking the lock.
    #   Real saccade: 3 frames = ~22ms at 133Hz — still fast enough.

    # === FRAME GAP PROTECTION ===
    MAX_GAP_SECONDS = 0.10          # Skip state updates after gaps > 100ms (13+ missing frames)
    #   Tobii drops frames frequently (logs show 120-244ms gaps).
    #   After a gap, position jumps dramatically — NOT a real saccade.

    # === FIXATION DETECTION (position-based) ===
    FIXATION_RADIUS = 0.045         # 4.5% screen ≈ 49px — positions within this = fixation
    MIN_LOCK_FRAMES = 2             # ~15ms at 133Hz to engage lock

    # === CENTROID BLEND WEIGHTS ===
    FIXATION_ALPHA_LOCKED = 0.02    # Locked: near-frozen regardless of state (fixation OR glissade)
    FIXATION_ALPHA_BUILDING = 0.10  # Before lock: slow convergence prevents centroid drift
    GLISSADE_ALPHA_UNLOCKED = 0.12  # Glissade when NOT locked: moderate centroid update
    DRIFT_BOOST_ALPHA = 0.35        # Large intentional shift (unlocked only)
    DRIFT_THRESHOLD = 0.05          # 5% screen → large shift

    def __init__(self):
        self._centroid_x: Optional[float] = None
        self._centroid_y: Optional[float] = None
        self._prev_x: Optional[float] = None
        self._prev_y: Optional[float] = None
        self._prev_t: Optional[float] = None

        self._is_locked = False
        self._fixation_frame_count = 0
        self._break_frame_count = 0      # Consecutive frames above SACCADE_DISPLACEMENT
        self._smoothed_velocity = 0.0
        self._state = 'saccade'

        # Stats
        self.locks_engaged = 0
        self.locks_released = 0
        self._log_count = 0

    def _compute_velocity(self, x: float, y: float, timestamp: float) -> float:
        """Compute raw velocity in normalized units per second."""
        if self._prev_t is None:
            return 0.0
        dt = timestamp - self._prev_t
        if dt <= 0 or dt > 0.5:
            return 0.0
        dx = x - self._prev_x
        dy = y - self._prev_y
        return math.sqrt(dx * dx + dy * dy) / dt

    def update(self, x: float, y: float, timestamp: float) -> Tuple[float, float]:
        """
        Process a filtered gaze sample and return stabilized coordinates.

        Args:
            x, y: filtered coordinates from One Euro Filter (0-1 normalized)
            timestamp: in SECONDS (epoch)

        Returns:
            Stabilized (x, y) tuple
        """
        raw_velocity = self._compute_velocity(x, y, timestamp)

        # Smooth velocity for saccade detection (unlocked mode only)
        self._smoothed_velocity = (
            self.VEL_SMOOTH_ALPHA * raw_velocity +
            (1 - self.VEL_SMOOTH_ALPHA) * self._smoothed_velocity
        )

        # Store previous for gap detection
        prev_t = self._prev_t

        # Update previous values
        self._prev_x = x
        self._prev_y = y
        self._prev_t = timestamp

        # Diagnostic logging
        self._log_count += 1
        if self._log_count <= 10 or self._log_count % 500 == 0:
            import logging
            cdist = 0.0
            if self._centroid_x is not None:
                cdist = math.sqrt((x - self._centroid_x) ** 2 + (y - self._centroid_y) ** 2)
            logging.getLogger('GazeConnect').info(
                f"[STAB] svel={self._smoothed_velocity:.2f} cdist={cdist:.4f} "
                f"brk={self._break_frame_count} "
                f"state={self._state} locked={self._is_locked} "
                f"pos=({x:.3f},{y:.3f}) cent=({self._centroid_x or 0:.3f},{self._centroid_y or 0:.3f})"
            )

        # Initialize centroid on first sample
        if self._centroid_x is None:
            self._centroid_x = x
            self._centroid_y = y
            self._fixation_frame_count = 1
            self._state = 'fixation'
            return x, y

        # ============================================================
        # FRAME GAP PROTECTION
        # Tobii drops frames frequently (logs show 120-244ms gaps).
        # After a gap, position may have jumped — NOT a real saccade.
        # When locked: return centroid (ignore the gap frame entirely).
        # When unlocked: pass through (let filter handle it).
        # ============================================================
        if prev_t is not None:
            dt = timestamp - prev_t
            if dt > self.MAX_GAP_SECONDS:
                self._break_frame_count = 0  # Reset break counter — gap is not a saccade
                if self._is_locked:
                    # Keep lock, return frozen centroid, don't update centroid
                    return self._centroid_x, self._centroid_y
                else:
                    # Not locked: snap centroid to new position after gap
                    self._centroid_x = x
                    self._centroid_y = y
                    self._fixation_frame_count = 0
                    return x, y

        # Distance from centroid — primary metric for state classification
        dist = math.sqrt((x - self._centroid_x) ** 2 + (y - self._centroid_y) ** 2)

        # ============================================================
        # SACCADE DETECTION — dual criteria based on lock state
        # ============================================================
        is_saccade = False

        if self._is_locked:
            # LOCKED: Break requires SUSTAINED position displacement.
            # Must exceed threshold for SACCADE_BREAK_FRAMES consecutive frames.
            # Single-frame noise spikes (common at edges) won't break the lock.
            if dist > self.SACCADE_DISPLACEMENT:
                self._break_frame_count += 1
                if self._break_frame_count >= self.SACCADE_BREAK_FRAMES:
                    is_saccade = True
            else:
                self._break_frame_count = 0  # Reset: displacement dropped back
        else:
            # UNLOCKED: Use smoothed velocity for responsive tracking.
            if self._smoothed_velocity > self.SACCADE_VEL_THRESHOLD:
                is_saccade = True

        if is_saccade:
            if self._is_locked:
                self.locks_released += 1
            self._is_locked = False
            self._fixation_frame_count = 0
            self._break_frame_count = 0
            self._state = 'saccade'
            self._centroid_x = x
            self._centroid_y = y
            return x, y

        # ============================================================
        # WHEN LOCKED: Centroid is FROZEN regardless of distance.
        # This fixes the critical bug where glissade alpha (0.10) caused
        # centroid drift when locked, eventually leading to false breaks.
        # The ONLY way to move the centroid when locked is through the
        # tiny FIXATION_ALPHA_LOCKED (0.02).
        # ============================================================
        if self._is_locked:
            # Classify state for logging/frontend, but alpha is always frozen
            self._state = 'fixation' if dist < self.FIXATION_RADIUS else 'glissade'
            # CRITICAL: Don't update centroid while break is pending.
            # If we update toward a saccade target, the distance decreases below
            # SACCADE_DISPLACEMENT, preventing the break for small saccades (~80px).
            if self._break_frame_count == 0:
                self._centroid_x = self.FIXATION_ALPHA_LOCKED * x + (1 - self.FIXATION_ALPHA_LOCKED) * self._centroid_x
                self._centroid_y = self.FIXATION_ALPHA_LOCKED * y + (1 - self.FIXATION_ALPHA_LOCKED) * self._centroid_y
            return self._centroid_x, self._centroid_y

        # ============================================================
        # UNLOCKED: FIXATION — position within radius of centroid
        # ============================================================
        if dist < self.FIXATION_RADIUS:
            self._state = 'fixation'
            alpha = self.FIXATION_ALPHA_BUILDING

            self._centroid_x = alpha * x + (1 - alpha) * self._centroid_x
            self._centroid_y = alpha * y + (1 - alpha) * self._centroid_y

            self._fixation_frame_count += 1

            # Engage lock after enough fixation frames
            if self._fixation_frame_count >= self.MIN_LOCK_FRAMES:
                self._is_locked = True
                self.locks_engaged += 1

            return (self._centroid_x, self._centroid_y) if self._is_locked else (x, y)

        # ============================================================
        # UNLOCKED: GLISSADE — outside fixation radius, not saccade
        # ============================================================
        self._state = 'glissade'
        self._fixation_frame_count = 0  # Reset: not fixating

        # Drift speed: faster for large drift, slower for small
        if dist > self.DRIFT_THRESHOLD:
            alpha = self.DRIFT_BOOST_ALPHA
        else:
            alpha = self.GLISSADE_ALPHA_UNLOCKED

        self._centroid_x = alpha * x + (1 - alpha) * self._centroid_x
        self._centroid_y = alpha * y + (1 - alpha) * self._centroid_y

        return self._centroid_x, self._centroid_y

    def reset(self):
        """Reset stabilizer state."""
        self._centroid_x = None
        self._centroid_y = None
        self._prev_x = None
        self._prev_y = None
        self._prev_t = None
        self._is_locked = False
        self._fixation_frame_count = 0
        self._break_frame_count = 0
        self._smoothed_velocity = 0.0
        self._state = 'saccade'

    def get_stats(self) -> dict:
        return {
            'state': self._state,
            'is_locked': self._is_locked,
            'smoothed_velocity': round(self._smoothed_velocity, 3),
            'locks_engaged': self.locks_engaged,
            'locks_released': self.locks_released,
        }


# =============================================================================
# GRAVITY WELL — 3-zone cursor stabilization (OptiKey-inspired)
# =============================================================================

class GravityWell:
    """
    3-zone cursor stabilization inspired by OptiKey's GazeFilter concept.

    Zone 1 (Lock):     distance < lock_radius     → cursor FROZEN (multiplier = 0)
    Zone 2 (Fixation): lock_radius < d < fix_rad  → power-law damping (smooth deceleration)
    Zone 3 (Free):     distance > fix_radius       → fast tracking (multiplier ~0.6-0.9)

    This creates the "calm" feeling — cursor stops precisely where you look,
    stays still during fixation tremor, then jumps instantly to new targets.

    Parameters tuned for Tobii ET5 at 133Hz with 0-1 normalized coordinates.
    """

    # Radii in normalized screen units (0-1)
    LOCK_RADIUS = 0.008       # ~8px on 1080p — micro-tremor dead zone
    FIXATION_RADIUS = 0.04    # ~40px on 1080p — fixation wobble zone
    DAMPING_LEVEL = 0.4       # 0.01-1.0: lower = smoother, higher = faster
    FREE_MOVE_FACTOR = 0.7    # How fast cursor moves outside fixation zone

    def __init__(self):
        self._last_x: float = 0.5
        self._last_y: float = 0.5
        self._initialized = False
        self._log_count = 0
        self._current_zone = 'free'       # 'lock', 'fixation', or 'free'
        self._current_multiplier = 1.0

    def update(self, x: float, y: float) -> Tuple[float, float]:
        """
        v8: Edge-aware gravity well stabilization.

        NORMAL (center screen): 3-zone gravity well (lock/fixation/free)
        EDGE (near 0.0 or 1.0):  No lock zone, light damping, pass-through

        This fixes the critical bug where clamped edge coordinates (y=1.000)
        cause the gravity well to LOCK the cursor, making edge buttons unreachable.
        """
        if not self._initialized:
            self._last_x = x
            self._last_y = y
            self._initialized = True
            self._current_zone = 'lock'
            self._current_multiplier = 0.0
            return x, y

        dx = x - self._last_x
        dy = y - self._last_y
        distance = math.sqrt(dx * dx + dy * dy)

        # Edge detection: near screen boundaries, Tobii data is clamped
        # (all values = 0.0 or 1.0). Gravity well must NOT lock at edges.
        EDGE_THRESHOLD = 0.06  # Within 6% of screen edge (~65px on 1080p)
        at_edge = (x <= EDGE_THRESHOLD or x >= (1.0 - EDGE_THRESHOLD) or
                   y <= EDGE_THRESHOLD or y >= (1.0 - EDGE_THRESHOLD))

        if at_edge:
            # EDGE MODE: No lock zone. Minimal damping. Cursor FREE to reach edge buttons.
            if distance < 0.003:
                multiplier = 0.0  # Truly stationary — sub-pixel jitter only
                self._current_zone = 'lock'
            else:
                # Light damping that scales with distance: close→0.3, far→0.85
                multiplier = min(0.85, 0.3 + (distance / 0.08) * 0.55)
                self._current_zone = 'fixation' if distance <= self.FIXATION_RADIUS else 'free'
        else:
            # NORMAL MODE (center screen): Full 3-zone gravity well
            if distance <= self.LOCK_RADIUS:
                multiplier = 0.0
                self._current_zone = 'lock'
            elif distance <= self.FIXATION_RADIUS:
                normalized = distance / self.FIXATION_RADIUS
                multiplier = self.DAMPING_LEVEL * math.pow(normalized, 1 + self.DAMPING_LEVEL)
                self._current_zone = 'fixation'
            else:
                multiplier = self.FREE_MOVE_FACTOR
                self._current_zone = 'free'

        self._current_multiplier = multiplier

        new_x = self._last_x + multiplier * dx
        new_y = self._last_y + multiplier * dy

        # Edge passthrough: when raw data is at the boundary, don't let
        # gravity well pull cursor AWAY from edge. Fixes: raw y=1.000 → stable y=0.991
        BOUNDARY_SNAP = 0.015
        if y >= (1.0 - BOUNDARY_SNAP):
            new_y = max(new_y, 1.0 - BOUNDARY_SNAP)
        if y <= BOUNDARY_SNAP:
            new_y = min(new_y, BOUNDARY_SNAP)
        if x >= (1.0 - BOUNDARY_SNAP):
            new_x = max(new_x, 1.0 - BOUNDARY_SNAP)
        if x <= BOUNDARY_SNAP:
            new_x = min(new_x, BOUNDARY_SNAP)

        self._last_x = new_x
        self._last_y = new_y

        # Diagnostic logging
        self._log_count += 1
        if self._log_count <= 5 or self._log_count % 500 == 0:
            import logging
            zone_label = "EDGE" if at_edge else self._current_zone.upper()
            logging.getLogger('GazeConnect').info(
                f"[GRAVITY] zone={zone_label} dist={distance:.4f} mult={multiplier:.3f} "
                f"edge={at_edge} pos=({new_x:.3f},{new_y:.3f})"
            )

        return new_x, new_y

    def reset(self):
        self._initialized = False
        self._current_zone = 'free'
        self._current_multiplier = 1.0


# =============================================================================
# ANTI-RECOIL FILTER — saccade overshoot dampening
# =============================================================================

class AntiRecoilFilter:
    """
    3-point weighted average to prevent cursor overshoot after saccades.
    Inspired by OptiKey's KalmanFilter.cs measurement averaging.

    Weights: current=0.45, previous=0.30, two_back=0.25
    This dampens the "recoil" that happens when a saccade overshoots
    and the eye snaps back, causing the cursor to bounce.
    """

    def __init__(self):
        self._m1_x: Optional[float] = None  # previous measurement
        self._m1_y: Optional[float] = None
        self._m2_x: Optional[float] = None  # two measurements ago
        self._m2_y: Optional[float] = None

    def update(self, x: float, y: float) -> Tuple[float, float]:
        if self._m1_x is None:
            self._m1_x, self._m1_y = x, y
            self._m2_x, self._m2_y = x, y
            return x, y

        # v9: Adaptive weights — reduce lag for large movements (saccades)
        # Fixed weights (0.45/0.30/0.25) caused ~116px horizontal drift during saccades.
        # Adaptive weights favor the current sample during fast movement.
        dx = abs(x - self._m1_x)
        dy = abs(y - self._m1_y)
        movement = math.sqrt(dx * dx + dy * dy)

        if movement > 0.05:
            # Large movement (saccade): favor current sample heavily
            w0, w1, w2 = 0.75, 0.15, 0.10
        elif movement > 0.02:
            # Medium movement: moderate smoothing
            w0, w1, w2 = 0.60, 0.25, 0.15
        else:
            # Small movement (fixation tremor): full smoothing
            w0, w1, w2 = 0.45, 0.30, 0.25

        smoothed_x = x * w0 + self._m1_x * w1 + self._m2_x * w2
        smoothed_y = y * w0 + self._m1_y * w1 + self._m2_y * w2

        self._m2_x, self._m2_y = self._m1_x, self._m1_y
        self._m1_x, self._m1_y = x, y

        return smoothed_x, smoothed_y

    def reset(self):
        self._m1_x = self._m1_y = None
        self._m2_x = self._m2_y = None


# =============================================================================
# ADAPTIVE KALMAN FILTER — Port of OptiKey's KalmanFilter.cs
# =============================================================================

class AdaptiveKalmanFilter:
    """
    Port of OptiKey v3.2.5's KalmanFilter.cs with STATE-ADAPTIVE noise.

    v12: Integrates GazeClassifier to adapt measurement_noise per gaze state:
    - FIXATION: measurement_noise=2500 → heavy smoothing, stable cursor
    - SACCADE:  measurement_noise=150  → fast response, cursor follows eye
    - GLISSADE: measurement_noise=800  → medium smoothing during settling

    v17: Added OptiKey's SmoothWhenChangingGazeTarget — 3-sample WMA pre-filter
    (weights 0.45/0.30/0.25) applied before Kalman update. Reduces directional
    jitter when transitioning between targets. The pre-filter catches oscillations
    that the Kalman's exponential process noise would otherwise amplify.

    Uses adaptive process noise that scales EXPONENTIALLY with movement distance.

    CRITICAL: OptiKey operates in SCREEN PIXEL space (0-1920).
    We scale normalized coords to pixel-equivalent space internally.
    """

    COORD_SCALE = 1920.0

    # State-dependent measurement noise
    # v14: Increased fixation noise for calmer, less jittery cursor
    STATE_NOISE = {
        'fixation': 3500.0,    # v14: heavier smoothing during fixation — calmer feel
        'saccade':  200.0,     # v14: slightly slower saccade response — less overshooting
        'glissade': 1000.0,    # v14: more smoothing during settling — gentler transitions
    }

    # v17: OptiKey SmoothWhenChangingGazeTarget — 3-sample weighted moving average
    # Weights from OptiKey's KalmanFilter.cs: current=0.45, prev1=0.30, prev2=0.25
    # Applied BEFORE Kalman update to reduce transition jitter.
    WMA_W0 = 0.45  # Current sample weight
    WMA_W1 = 0.30  # Previous sample weight
    WMA_W2 = 0.25  # Two-back sample weight

    def __init__(self, smoothing_level: int = 1, smooth_when_changing_target: bool = True):
        self.estimated_x = 0.0
        self.estimated_y = 0.0
        self.estimation_noise = 1000.0
        self.measurement_noise = 1000.0  # v12: raised from 500 — more stability with memoryless fix
        self.smoothing_level = smoothing_level
        self._initialized = False
        self._current_state = 'fixation'

        # v17: WMA pre-filter state (OptiKey's SmoothWhenChangingGazeTarget)
        self.smooth_when_changing_target = smooth_when_changing_target
        self._wma_m1_x: Optional[float] = None  # Previous measurement X
        self._wma_m1_y: Optional[float] = None
        self._wma_m2_x: Optional[float] = None  # Two-back measurement X
        self._wma_m2_y: Optional[float] = None

    def set_gaze_state(self, state: str):
        """Update the gaze state for adaptive noise.
        state: 'fixation', 'saccade', or 'glissade'
        Smooths transition to avoid abrupt cursor behavior changes.
        """
        if state in self.STATE_NOISE:
            self._current_state = state
            target_noise = self.STATE_NOISE[state]
            # Smooth 30% per frame → full transition in ~8 frames (60ms at 133Hz)
            # Prevents jarring 16.7× jump when switching from saccade to fixation
            self.measurement_noise += 0.30 * (target_noise - self.measurement_noise)

    def _apply_wma_prefilter(self, x: float, y: float) -> Tuple[float, float]:
        """
        v17: OptiKey's SmoothWhenChangingGazeTarget — 3-sample WMA.
        Reduces directional bias from oscillating measurements before
        the Kalman filter amplifies them via exponential process noise.
        """
        if self._wma_m1_x is None:
            self._wma_m1_x, self._wma_m1_y = x, y
            self._wma_m2_x, self._wma_m2_y = x, y
            return x, y

        smoothed_x = x * self.WMA_W0 + self._wma_m1_x * self.WMA_W1 + self._wma_m2_x * self.WMA_W2
        smoothed_y = y * self.WMA_W0 + self._wma_m1_y * self.WMA_W1 + self._wma_m2_y * self.WMA_W2

        self._wma_m2_x, self._wma_m2_y = self._wma_m1_x, self._wma_m1_y
        self._wma_m1_x, self._wma_m1_y = x, y

        return smoothed_x, smoothed_y

    def update(self, x: float, y: float) -> Tuple[float, float]:
        # v17: Apply WMA pre-filter before Kalman (OptiKey's SmoothWhenChangingGazeTarget)
        if self.smooth_when_changing_target:
            x, y = self._apply_wma_prefilter(x, y)

        sx = x * self.COORD_SCALE
        sy = y * self.COORD_SCALE

        if not self._initialized:
            self.estimated_x = sx
            self.estimated_y = sy
            self._initialized = True
            return x, y

        dx = sx - self.estimated_x
        dy = sy - self.estimated_y
        delta = math.sqrt(dx * dx + dy * dy)

        # Adaptive process noise (OptiKey's exponential scaling)
        smoothing_factor = float(self.smoothing_level)
        process_scale = 10.0 * smoothing_factor - 5.0
        curve_offset = -1.0 * smoothing_factor

        current_process_noise = (
            math.exp((delta + (process_scale * curve_offset)) / process_scale)
            - math.exp(curve_offset)
        )

        # Standard Kalman update — match OptiKey's memoryless behavior
        # OptiKey uses Math.Min(currentProcessNoise, 1e100) which REPLACES
        # estimation_noise with just the current process noise each frame.
        # This makes gain purely dependent on current delta, preventing drift.
        self.estimation_noise += current_process_noise
        self.estimation_noise = min(current_process_noise, 1e100)

        gain = self.estimation_noise / (self.estimation_noise + self.measurement_noise)
        self.estimation_noise = (1.0 - gain) * self.estimation_noise

        self.estimated_x += dx * gain
        self.estimated_y += dy * gain

        return self.estimated_x / self.COORD_SCALE, self.estimated_y / self.COORD_SCALE

    def reset(self):
        self._initialized = False
        self.estimation_noise = 1000.0
        # v17: Reset WMA pre-filter state
        self._wma_m1_x = self._wma_m1_y = None
        self._wma_m2_x = self._wma_m2_y = None


# =============================================================================
# OPTIKEY GAZE FILTER — 4-Zone Key-Aware Damping (GazeFilter.cs port)
# =============================================================================

class OptiKeyGazeFilter:
    """
    Port of OptiKey v3.2.5's GazeFilter.cs — 4-zone adaptive damping.

    v12 IMPROVEMENTS:
    1. Stronger lock zone with hysteresis (keyboard: 54px lock, 119px exit)
    2. Fixation centroid averaging — cursor drifts toward true fixation center
    3. Debounced zone transitions — prevents rapid zone flickering
    4. Separate lock delta tracking — prevents frozen-position drift problem

    Zone 1 (ON KEY + close):  LOCKED — cursor on target, freeze it
    Zone 1 (ON KEY + far):    Fast tracking toward button center
    Zone 2 (FAR):             Balanced speed/smoothing
    Zone 3 (NEAR):            Heavy smoothing — power curve
    Zone 4 (LOCKED):          Cursor FROZEN with centroid averaging
    """
    EDGE_THRESHOLD = 0.08
    EDGE_MIN_MULTIPLIER = 0.55
    GLOBAL_LOCK_DEADZONE = 0.0040

    def __init__(self, damping_level: float = 0.32,
                 fixation_radius: float = 0.04,
                 lock_radius: float = 0.025):
        self.damping = damping_level
        self.fixation_radius = fixation_radius
        self.lock_radius = lock_radius
        self.hysteresis_multiplier = 2.0
        self._last_x: float = 0.5
        self._last_y: float = 0.5
        self._initialized = False
        self._current_zone = 'free'
        self._current_multiplier = 1.0
        self._log_count = 0
        self._allow_global_lock = False
        self._fixation_min_multiplier = 0.10

        # v12: Fixation centroid averaging
        self._fixation_samples_x: list = []
        self._fixation_samples_y: list = []
        self._max_fixation_samples = 20  # Average over ~150ms at 133Hz

        # v12: Zone transition debouncing
        self._lock_entered_time = 0.0
        self._MIN_LOCK_DURATION = 0.100  # Stay locked for at least 100ms

        # v12: Track raw input delta separately from filtered position
        self._raw_input_x: float = 0.5
        self._raw_input_y: float = 0.5

    def set_screen_mode(self, screen: str):
        """Adapt parameters for different screen contexts."""
        if screen == 'keyboard':
            self.lock_radius = 0.020          # v15: 38px — tighter for ~180px-wide keys, prevents wrong-key lock
            self.hysteresis_multiplier = 1.7   # v15: reduced from 2.0 — easier key-to-key transitions
            self._max_fixation_samples = 15    # v15: less averaging — settles faster on correct key
            self._MIN_LOCK_DURATION = 0.080    # v15: reduced from 100ms — quicker response to corrections
            self._fixation_min_multiplier = 0.10  # v15: slightly higher floor — cursor tracks better near target
        else:
            # Navigation/general screens need easier escape to edges/corners.
            self.lock_radius = 0.016
            self.hysteresis_multiplier = 1.35
            self._max_fixation_samples = 20
            self._MIN_LOCK_DURATION = 0.060
            self._fixation_min_multiplier = 0.12

    def update(self, x: float, y: float, on_key: bool = False) -> Tuple[float, float]:
        import time as _time

        if not self._initialized:
            self._last_x = x
            self._last_y = y
            self._raw_input_x = x
            self._raw_input_y = y
            self._initialized = True
            self._current_zone = 'lock'
            self._current_multiplier = 0.0
            return x, y

        # v12: Track raw input position separately
        self._raw_input_x = x
        self._raw_input_y = y

        dx = x - self._last_x
        dy = y - self._last_y
        delta = math.sqrt(dx * dx + dy * dy)

        # Hysteresis — once locked, require N× lock_radius to exit
        now = _time.time()
        in_lock = self._current_zone == 'lock'
        effective_lock = self.lock_radius * self.hysteresis_multiplier if in_lock else self.lock_radius

        # v12: Minimum lock duration — prevent premature exit
        if in_lock and (now - self._lock_entered_time) < self._MIN_LOCK_DURATION:
            effective_lock = self.lock_radius * (self.hysteresis_multiplier + 0.5)  # Extra sticky during min duration

        at_edge = (
            x <= self.EDGE_THRESHOLD or x >= (1.0 - self.EDGE_THRESHOLD) or
            y <= self.EDGE_THRESHOLD or y >= (1.0 - self.EDGE_THRESHOLD)
        )

        # Zone determination
        if on_key and delta <= effective_lock:
            # ON KEY + close: LOCK
            multiplier = 0.0
            new_zone = 'lock'
        elif on_key:
            # ON KEY + far: Fast tracking toward button
            multiplier = 0.5 * (1.0 + self.damping)
            new_zone = 'key'
        elif at_edge:
            # Edge mode: avoid sticky locking so users can always reach borders/corners.
            if delta <= self.GLOBAL_LOCK_DEADZONE:
                multiplier = 0.0
                new_zone = 'edge-hold'
            else:
                multiplier = max(
                    self.EDGE_MIN_MULTIPLIER,
                    0.2 * (1.0 + 4.0 * self.damping)
                )
                new_zone = 'edge'
        elif delta > self.fixation_radius:
            # ZONE 2 (FAR): Balanced
            multiplier = 0.2 * (1.0 + 4.0 * self.damping)
            new_zone = 'free'
        elif self._allow_global_lock and delta <= effective_lock:
            multiplier = 0.0
            new_zone = 'lock'
        elif delta > max(self.GLOBAL_LOCK_DEADZONE, self.lock_radius * 0.35):
            # ZONE 3 (NEAR): Power curve smoothing
            multiplier = max(
                self._fixation_min_multiplier,
                self.damping * (
                    math.pow(delta, 1.0 + self.damping) /
                    math.pow(self.fixation_radius, 1.0 + self.damping)
                )
            )
            new_zone = 'fixation'
        else:
            # Micro hold zone without sticky lock hysteresis.
            multiplier = 0.0
            new_zone = 'fixation-hold'

        # Track zone transitions
        if new_zone == 'lock' and self._current_zone != 'lock':
            self._lock_entered_time = now
            self._fixation_samples_x.clear()
            self._fixation_samples_y.clear()

        self._current_zone = new_zone
        self._current_multiplier = multiplier

        # Apply movement
        new_x = self._last_x + multiplier * dx
        new_y = self._last_y + multiplier * dy

        # v12: Fixation centroid averaging during lock zone
        if new_zone == 'lock':
            # Accumulate raw input positions during lock
            self._fixation_samples_x.append(x)
            self._fixation_samples_y.append(y)
            if len(self._fixation_samples_x) > self._max_fixation_samples:
                self._fixation_samples_x.pop(0)
                self._fixation_samples_y.pop(0)

            # Slowly drift cursor toward centroid of recent samples
            if len(self._fixation_samples_x) >= 5:
                centroid_x = sum(self._fixation_samples_x) / len(self._fixation_samples_x)
                centroid_y = sum(self._fixation_samples_y) / len(self._fixation_samples_y)
                # Very gentle pull toward centroid.
                CENTROID_PULL = 0.01
                new_x = self._last_x + CENTROID_PULL * (centroid_x - self._last_x)
                new_y = self._last_y + CENTROID_PULL * (centroid_y - self._last_y)
        else:
            # Clear fixation samples when not in lock
            self._fixation_samples_x.clear()
            self._fixation_samples_y.clear()

        # Hard edge passthrough to avoid damping pull-away at exact boundaries.
        if x <= 0.001 or x >= 0.999:
            new_x = x
        if y <= 0.001 or y >= 0.999:
            new_y = y

        # Clamp to valid range
        new_x = max(0.0, min(1.0, new_x))
        new_y = max(0.0, min(1.0, new_y))

        self._last_x = new_x
        self._last_y = new_y

        # Diagnostic logging
        self._log_count += 1
        if self._log_count <= 5 or self._log_count % 500 == 0:
            import logging
            zone_label = self._current_zone.upper()
            logging.getLogger('GazeConnect').info(
                f"[OPTIKEY-GAZE] zone={zone_label} dist={delta:.4f} mult={multiplier:.3f} "
                f"on_key={on_key} edge={at_edge} pos=({new_x:.3f},{new_y:.3f})"
            )

        return new_x, new_y

    def reset(self):
        self._initialized = False
        self._current_zone = 'free'
        self._current_multiplier = 1.0
        self._fixation_samples_x.clear()
        self._fixation_samples_y.clear()


# =============================================================================
# FACTORY FUNCTIONS
# =============================================================================

def create_gaze_filter(preset=FilterPreset.BALANCED):
    return GazeFilter2D(FilterConfig.from_preset(preset))


STABLE_FILTER = lambda: create_gaze_filter(FilterPreset.STABLE)
BALANCED_FILTER = lambda: create_gaze_filter(FilterPreset.BALANCED)
RESPONSIVE_FILTER = lambda: create_gaze_filter(FilterPreset.RESPONSIVE)
ALS_EARLY_FILTER = lambda: create_gaze_filter(FilterPreset.ALS_EARLY)
ALS_LATE_FILTER = lambda: create_gaze_filter(FilterPreset.ALS_LATE)
