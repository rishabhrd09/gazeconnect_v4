"""
GazeConnect Pro - main.py Patch (v5.2 — No One Euro Filter)
=============================================================
Pipeline: raw → conditioner → classifier → fixation stabilizer → broadcast

Apply these 3 changes to your main.py:

CHANGE 1: Add FixationStabilizer to imports (line ~63)
CHANGE 2: Add self.fixation_stabilizer in __init__ (line ~496)
CHANGE 3: Replace _on_gaze_data method entirely (line ~542)
"""


# =============================================
# CHANGE 1: Update import (around line 63-71)
# =============================================
# Replace your current imports with:

"""
from services.one_euro_filter import (
    GazeFilter2D, FilterConfig, FilterPreset, GazePoint, compute_edge_factor,
    FixationStabilizer,
)
from services.signal_conditioner import (
    SignalConditioner, GazeValidity
)
from services.gaze_classifier import (
    GazeClassifier, GazeState, ScreenParams
)
"""


# =============================================
# CHANGE 2: Add fixation_stabilizer in __init__
# (around line 496, after self.gaze_classifier)
# =============================================
# Add this ONE line:

"""
        self.signal_conditioner = SignalConditioner()
        self.gaze_classifier = GazeClassifier(ScreenParams())
        self.fixation_stabilizer = FixationStabilizer()    # <--- ADD THIS LINE
        self.gaze_filter = GazeFilter2D(FilterConfig.from_preset(FilterPreset.BALANCED))
"""


# =============================================
# CHANGE 3: Replace _on_gaze_data entirely
# (lines ~542-646)
# =============================================
# Delete the old _on_gaze_data and paste this:

"""
    def _on_gaze_data(self, point: GazePoint):
        \"\"\"
        v5.2 Pipeline: raw → conditioner → classifier → stabilizer → broadcast
        No One Euro Filter. FixationStabilizer provides OptiKey-style lock.
        \"\"\"
        if not hasattr(self, '_raw_log_count'):
            self._raw_log_count = 0
        self._raw_log_count += 1
        if self._raw_log_count % 60 == 1:
            logger.info(f"[GAZE v5.2] x={point.x:.3f} y={point.y:.3f} valid={point.is_valid}")

        # Default: use raw
        fx, fy = point.x, point.y

        try:
            # --- Stage 1: Signal Conditioning (timestamp fix + cleanup) ---
            raw_dict = {
                'x': point.x, 'y': point.y,
                'timestamp': point.timestamp,
                'is_valid': point.is_valid,
                'confidence': point.confidence,
                'left_valid': point.left_valid,
                'right_valid': point.right_valid,
            }
            conditioned = self.signal_conditioner.process(raw_dict)

            if conditioned is None:
                return  # Tracking lost — don't broadcast

            # --- Stage 2: Gaze State Classification ---
            gaze_state = self.gaze_classifier.classify(
                conditioned.x, conditioned.y, conditioned.t
            )
            state_str = gaze_state.value  # 'fixation', 'saccade', 'glissade'

            # --- Stage 3: GazeFilter2D (passthrough in v5.2, just tracks fixation) ---
            filter_point = GazePoint(
                x=conditioned.x,
                y=conditioned.y,
                timestamp=conditioned.t,
                left_valid=point.left_valid,
                right_valid=point.right_valid,
                confidence=point.confidence,
            )
            filtered = self.gaze_filter.filter(filter_point)

            # --- Stage 4: Fixation Stabilizer (THE key stabilization) ---
            stable_x, stable_y = self.fixation_stabilizer.update(
                filtered.x, filtered.y, state_str
            )

            fx, fy = stable_x, stable_y

            # --- Stage 5: Broadcast ---
            self._broadcast('gaze', {
                'x': stable_x,
                'y': stable_y,
                'is_valid': filtered.is_valid,
                'is_fixation': state_str == 'fixation',
                'confidence': filtered.confidence,
                'gaze_state': state_str,
                'velocity': round(self.gaze_classifier.current_velocity, 1),
                'raw_x': conditioned.raw_x,
                'raw_y': conditioned.raw_y,
            })

            # Log classifier + stabilizer state periodically
            if self._raw_log_count % 120 == 1:
                logger.info(
                    f"[PIPELINE] state={state_str} vel={self.gaze_classifier.current_velocity:.1f} "
                    f"locked={self.fixation_stabilizer._is_locked} "
                    f"out=({stable_x:.3f},{stable_y:.3f})"
                )

        except Exception as e:
            if self._raw_log_count % 300 == 1:
                logger.error(f"Pipeline error (raw fallback): {e}")
            self._broadcast('gaze', {
                'x': point.x,
                'y': point.y,
                'is_valid': point.is_valid,
                'is_fixation': False,
                'confidence': getattr(point, 'confidence', 1.0),
            })
            fx, fy = point.x, point.y

        # --- Downstream (only if gaze interaction enabled) ---
        if not self.gaze_enabled:
            return

        self.fatigue.update_gaze(fx, fy, point.is_valid, point.timestamp)

        screen_x = fx * self.screen_width
        screen_y = fy * self.screen_height

        if point.is_valid:
            self.dwell_manager.update(
                screen_x, screen_y,
                getattr(point, 'confidence', 1.0),
                is_valid=True
            )
"""
