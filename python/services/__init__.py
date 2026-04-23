"""
GazeConnect Pro - Python Services
=================================
Core services for eye-gaze AAC.
"""

from .one_euro_filter import (
    OneEuroFilter,
    GazeFilter2D,
    FilterConfig,
    FilterPreset,
    GazePoint,
    FilteredGaze,
    FixationStabilizer,
    GravityWell,
    AntiRecoilFilter,
    AdaptiveKalmanFilter,
    OptiKeyGazeFilter,
)

from .dwell_detector import (
    AdaptiveDwellDetector,
    DwellManager,
    DwellTarget,
    DwellState,
    DwellConfig,
    ButtonSize,
    DwellStage,
)

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
    # Filters
    'OneEuroFilter',
    'GazeFilter2D',
    'FilterConfig',
    'FilterPreset',
    'GazePoint',
    'FilteredGaze',
    'FixationStabilizer',
    'GravityWell',
    'AntiRecoilFilter',
    'AdaptiveKalmanFilter',
    'OptiKeyGazeFilter',
    # Dwell
    'AdaptiveDwellDetector',
    'DwellManager',
    'DwellTarget',
    'DwellState',
    'DwellConfig',
    'ButtonSize',
    'DwellStage',
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
