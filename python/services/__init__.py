"""
GazeConnect Pro - Python Services
=================================
Core services for eye-gaze AAC.
"""

from .gaze_sample import GazePoint
from .adaptive_cursor_filter import AdaptiveCursorFilter

from .gaze_targets import TargetRegistry, GazeTarget, ButtonSize

from .word_prediction import (
    WordPredictionEngine,
    PredictionResult,
    NGramModel,
    CORE_VOCABULARY,
    AAC_PHRASES,
    ABBREVIATIONS,
)

from .fatigue_monitor import (
    FatigueDetector,
    BreakReminderManager,
    BlinkDetector,
    GazeStabilityMonitor,
    DryEyeMonitor,
    FatigueLevel,
    FatigueThresholds,
)

__all__ = [
    # Acquisition and filtering
    'GazePoint',
    'AdaptiveCursorFilter',
    # Gaze target geometry (no backend selection clocks)
    'TargetRegistry',
    'GazeTarget',
    'ButtonSize',
    # Prediction
    'WordPredictionEngine',
    'PredictionResult',
    'NGramModel',
    'CORE_VOCABULARY',
    'AAC_PHRASES',
    'ABBREVIATIONS',
    # Fatigue
    'FatigueDetector',
    'BreakReminderManager',
    'BlinkDetector',
    'GazeStabilityMonitor',
    'DryEyeMonitor',
    'FatigueLevel',
    'FatigueThresholds',
]
