"""
GazeConnect Pro - Ultimate Adaptive Dwell Detector
==================================================
Research-backed dwell detection system.

Key Research Findings:
- Optimal dwell: 500-600ms for 2° buttons
- Two-stage: 150-250ms onset + 450-600ms feedback
- Adaptive: adjust based on target size, confidence, fatigue
- Hard limits: 200-1200ms

Visual Angle to Pixels (at 60cm):
- 1° = ~40px
- 2° = ~80px (optimal minimum)
- 3° = ~120px
"""

import time
import math
import logging
from dataclasses import dataclass, field
from typing import Optional, Callable, Dict, List, Tuple
from enum import Enum

logger = logging.getLogger('GazeConnect')

class ButtonSize(Enum):
    """Button sizes based on visual angle research."""
    XS = "xs"    # 1° = 48px - Very small, longer dwell
    SM = "sm"    # 1.5° = 60px - Small
    MD = "md"    # 2° = 80px - Optimal minimum
    LG = "lg"    # 3° = 100px - Comfortable
    XL = "xl"    # 4° = 120px - Large
    XXL = "xxl"  # 5°+ = 140px - Extra large

class DwellStage(Enum):
    """Two-stage dwell approach from Microsoft research."""
    NONE = "none"
    ONSET = "onset"      # Initial delay (150-250ms)
    DWELLING = "dwelling" # Active dwell with feedback
    COMPLETE = "complete"
    CANCELLED = "cancelled"

@dataclass
class DwellConfig:
    """Configuration for dwell timing."""
    # Base timing (ms)
    base_dwell_ms: int = 600
    onset_delay_ms: int = 200
    
    # Size multipliers
    size_multipliers: Dict[ButtonSize, float] = field(default_factory=lambda: {
        ButtonSize.XS: 1.5,   # 900ms for tiny buttons
        ButtonSize.SM: 1.25,  # 750ms
        ButtonSize.MD: 1.0,   # 600ms (baseline)
        ButtonSize.LG: 0.85,  # 510ms
        ButtonSize.XL: 0.75,  # 450ms
        ButtonSize.XXL: 0.65, # 390ms
    })
    
    # Context multipliers
    context_multipliers: Dict[str, float] = field(default_factory=lambda: {
        'quickfire': 0.6,    # 360ms for Yes/No
        'keyboard': 0.85,    # 510ms for typing
        'prediction': 0.80,  # v14: 480ms — slightly faster for word predictions
        'navigation': 1.0,   # 600ms standard
        'settings': 1.3,     # 780ms for config
        'emergency': 2.0,    # 1200ms prevent accidents
    })
    
    # Limits
    min_dwell_ms: int = 200
    max_dwell_ms: int = 1200
    
    # Spatial tolerance (pixels) - INCREASED for ALS patients
    spatial_tolerance: int = 50  # v12: balanced — absorbs jitter while sticky magnetism handles accuracy
    
    # Confidence threshold for acceleration
    confidence_threshold: float = 0.8
    confidence_reduction: float = 0.2  # 20% reduction at high confidence
    
    # Fatigue adjustment
    fatigue_increase_per_hour: float = 0.1  # 10% increase per hour

@dataclass
class DwellTarget:
    """Represents a dwell-selectable target."""
    id: str
    x: float  # Center X (pixels)
    y: float  # Center Y (pixels)
    width: float
    height: float
    size: ButtonSize = ButtonSize.MD
    context: str = 'navigation'
    custom_dwell_ms: Optional[int] = None
    priority: int = 0  # Higher = faster dwell
    enabled: bool = True
    
    def contains(self, gaze_x: float, gaze_y: float, tolerance: int = 0) -> bool:
        """Check if gaze point is within target bounds."""
        half_w = self.width / 2 + tolerance
        half_h = self.height / 2 + tolerance
        return (self.x - half_w <= gaze_x <= self.x + half_w and
                self.y - half_h <= gaze_y <= self.y + half_h)
    
    def distance_from_center(self, gaze_x: float, gaze_y: float) -> float:
        """Calculate distance from gaze to target center."""
        dx = gaze_x - self.x
        dy = gaze_y - self.y
        return math.sqrt(dx*dx + dy*dy)

@dataclass
class DwellState:
    """Current state of dwell detection."""
    target: Optional[DwellTarget] = None
    stage: DwellStage = DwellStage.NONE
    start_time: float = 0.0
    onset_complete_time: float = 0.0
    required_dwell_ms: int = 600
    elapsed_ms: float = 0.0
    progress: float = 0.0  # 0.0 to 1.0

class AdaptiveDwellDetector:
    """
    Complete adaptive dwell detection system.
    
    Features:
    - Two-stage dwell (onset + feedback)
    - Size-aware timing
    - Context-aware timing
    - Fatigue-adaptive
    - Confidence-based acceleration
    """
    
    def __init__(self, config: Optional[DwellConfig] = None):
        self.config = config or DwellConfig()
        self.state = DwellState()
        self.targets: Dict[str, DwellTarget] = {}
        
        # Session tracking
        self.session_start = time.time()
        self.selections_count = 0
        self.errors_count = 0

        # v9: Incomplete fixation recovery (port of OptiKey's KeyFixationSource.cs)
        # When the user briefly looks away, dwell progress is saved for recovery.
        # OptiKey defaults: TTL=750ms, ResumeRequiresLockOn=false
        # We use 1000ms TTL (slightly more generous for ALS patients)
        self._incomplete_progress: Dict[str, float] = {}  # target_id → elapsed_ms
        self._incomplete_timers: Dict[str, float] = {}     # target_id → expiry_timestamp_ms
        self.INCOMPLETE_TTL_MS = 1200  # v12: generous for ALS tremor (OptiKey default: 750ms)
        self.LOCK_ON_MS = 200          # v12: reduced from 250ms — faster initial lock-on

        # v17: Resume-requires-lock-on (OptiKey's resumeRequiresLockOn)
        # When resuming partial dwell after looking away, require a brief mini-lock-on
        # before continuing. Prevents saccade pass-throughs from accidentally completing
        # a nearly-full dwell bar. 100ms is enough to confirm intentional re-fixation
        # without being noticeable to the user.
        self.resume_requires_lock_on = True
        self.RESUME_LOCK_ON_MS = 100   # Mini lock-on before resuming saved progress
        self._resume_lock_start: Optional[float] = None  # Timestamp when resume lock-on began
        self._resume_target_id: Optional[str] = None      # Target being resume-locked

        # Callbacks
        self.on_dwell_start: Optional[Callable[[DwellTarget], None]] = None
        self.on_dwell_progress: Optional[Callable[[DwellTarget, float, float], None]] = None
        self.on_dwell_complete: Optional[Callable[[DwellTarget], None]] = None
        self.on_dwell_cancel: Optional[Callable[[DwellTarget], None]] = None
    
    def _compute_dwell_time(self, target: DwellTarget, confidence: float = 1.0) -> int:
        """
        Compute optimal dwell time for a target.
        
        Factors:
        1. Custom override
        2. Size multiplier
        3. Context multiplier
        4. Priority reduction
        5. Confidence acceleration
        6. Fatigue adjustment
        """
        # Start with custom or base
        if target.custom_dwell_ms is not None:
            dwell_ms = target.custom_dwell_ms
        else:
            dwell_ms = self.config.base_dwell_ms
        
        # Apply size multiplier
        size_mult = self.config.size_multipliers.get(target.size, 1.0)
        dwell_ms = int(dwell_ms * size_mult)
        
        # Apply context multiplier
        context_mult = self.config.context_multipliers.get(target.context, 1.0)
        dwell_ms = int(dwell_ms * context_mult)
        
        # Apply priority reduction (50ms per priority level)
        dwell_ms -= target.priority * 50
        
        # Apply confidence acceleration
        if confidence >= self.config.confidence_threshold:
            dwell_ms = int(dwell_ms * (1 - self.config.confidence_reduction))
        
        # Apply fatigue adjustment
        hours_elapsed = (time.time() - self.session_start) / 3600
        fatigue_mult = 1 + (hours_elapsed * self.config.fatigue_increase_per_hour)
        dwell_ms = int(dwell_ms * fatigue_mult)
        
        # Apply error rate adjustment
        if self.selections_count > 10:
            error_rate = self.errors_count / self.selections_count
            if error_rate > 0.2:  # >20% errors = slow down
                dwell_ms = int(dwell_ms * 1.2)
        
        # Clamp to limits
        return max(self.config.min_dwell_ms, min(self.config.max_dwell_ms, dwell_ms))
    
    def register_target(self, target: DwellTarget):
        """Register a dwell target."""
        self.targets[target.id] = target
    
    def unregister_target(self, target_id: str):
        """Unregister a dwell target."""
        self.targets.pop(target_id, None)
        if self.state.target and self.state.target.id == target_id:
            self._cancel_dwell()
    
    def clear_targets(self):
        """Clear all targets."""
        self._cancel_dwell()
        self.targets.clear()
    
    def set_targets(self, targets: List[DwellTarget]):
        """Set all targets at once."""
        self.clear_targets()
        for target in targets:
            self.register_target(target)
    
    def _find_target_at(self, gaze_x: float, gaze_y: float) -> Optional[DwellTarget]:
        """Find the topmost enabled target at gaze position."""
        candidates = []
        for target in self.targets.values():
            if target.enabled and target.contains(gaze_x, gaze_y, self.config.spatial_tolerance):
                candidates.append(target)
        
        if not candidates:
            return None
        
        # Return highest priority (or closest to center if tied)
        candidates.sort(key=lambda t: (-t.priority, t.distance_from_center(gaze_x, gaze_y)))
        return candidates[0]
    
    def _start_dwell(self, target: DwellTarget, confidence: float):
        """v7: Check for saved progress before starting fresh."""
        # Clean expired progress
        now_ms = time.time() * 1000
        expired = [tid for tid, expiry in self._incomplete_timers.items() if now_ms > expiry]
        for tid in expired:
            self._incomplete_progress.pop(tid, None)
            self._incomplete_timers.pop(tid, None)

        # Check for saved progress on this target
        saved_ms = self._incomplete_progress.pop(target.id, 0)
        self._incomplete_timers.pop(target.id, None)

        if saved_ms > 0:
            # v17: Resume-requires-lock-on — brief re-fixation check before resuming
            if self.resume_requires_lock_on:
                if self._resume_target_id != target.id:
                    # First frame back on this target — start mini lock-on
                    self._resume_lock_start = time.time()
                    self._resume_target_id = target.id
                    # Re-store progress so it's available next frame
                    self._incomplete_progress[target.id] = saved_ms
                    self._incomplete_timers[target.id] = now_ms + self.INCOMPLETE_TTL_MS
                    return
                elif (time.time() - self._resume_lock_start) * 1000 < self.RESUME_LOCK_ON_MS:
                    # Still within mini lock-on — keep waiting
                    self._incomplete_progress[target.id] = saved_ms
                    self._incomplete_timers[target.id] = now_ms + self.INCOMPLETE_TTL_MS
                    return
                # Mini lock-on complete — proceed to resume
                self._resume_lock_start = None
                self._resume_target_id = None

            # Resume from saved progress
            self.state = DwellState(
                target=target,
                stage=DwellStage.DWELLING,
                start_time=time.time() * 1000 - saved_ms,
                onset_complete_time=time.time() - saved_ms / 1000,
                required_dwell_ms=self._compute_dwell_time(target, confidence),
                elapsed_ms=saved_ms,
                progress=0
            )
            logger.info(f"[DWELL] Resumed fixation on {target.id}, saved={saved_ms:.0f}ms")
        else:
            # Clear resume state for fresh starts
            self._resume_lock_start = None
            self._resume_target_id = None
            # Fresh start with onset
            self.state = DwellState(
                target=target,
                stage=DwellStage.ONSET,
                start_time=time.time(),
                required_dwell_ms=self._compute_dwell_time(target, confidence),
                elapsed_ms=0,
                progress=0
            )

        if self.on_dwell_start:
            self.on_dwell_start(target)
    
    def _cancel_dwell(self, save_progress: bool = True):
        """
        v7: Instead of destroying progress, SAVE it for recovery.

        If the user briefly looks away (blink, tremor), their dwell progress
        is saved for INCOMPLETE_TTL_MS. If they look back at the same target,
        progress resumes from where they left off.
        """
        target = self.state.target

        if target and save_progress and self.state.elapsed_ms > 0:
            target_id = target.id
            existing = self._incomplete_progress.get(target_id, 0)
            self._incomplete_progress[target_id] = existing + self.state.elapsed_ms
            self._incomplete_timers[target_id] = time.time() * 1000 + self.INCOMPLETE_TTL_MS

            if self.on_dwell_progress:
                total_dwell = self._compute_dwell_time(target)
                total_elapsed = self._incomplete_progress[target_id]
                self.on_dwell_progress(
                    target,
                    min(0.95, total_elapsed / total_dwell),  # Cap at 95% until complete
                    total_elapsed
                )

        self.state = DwellState()

        if target and self.on_dwell_cancel:
            self.on_dwell_cancel(target)
    
    def _complete_dwell(self):
        """Complete dwell selection."""
        if self.state.target:
            self.state.stage = DwellStage.COMPLETE
            self.selections_count += 1
            
            if self.on_dwell_complete:
                self.on_dwell_complete(self.state.target)
        
        self.state = DwellState()
    
    def pause_dwell(self):
        """
        v17: Pause dwell during blink/tracking loss — preserves progress WITHOUT
        starting the incomplete-fixation TTL countdown.

        Key difference from _cancel_dwell():
        - cancel: saves progress with a TTL expiry (1200ms) — progress decays
        - pause:  freezes progress in place, no TTL — resumes instantly when valid data returns

        This prevents blinks from (a) counting as dwell time or (b) starting the
        TTL countdown that would eventually expire and lose progress.
        """
        if self.state.stage in (DwellStage.ONSET, DwellStage.DWELLING):
            self.state.stage = DwellStage.NONE  # Freeze — will resume on next valid update
            # Keep target, elapsed_ms, progress intact for seamless resume
        # If not dwelling, nothing to pause

    def update(self, gaze_x: float, gaze_y: float, confidence: float = 1.0,
               is_valid: bool = True, is_blink: bool = False) -> Optional[DwellState]:
        """
        Update dwell detection with new gaze data.

        Args:
            gaze_x: Gaze X position in pixels
            gaze_y: Gaze Y position in pixels
            confidence: Gaze confidence (0-1)
            is_valid: Whether gaze data is valid
            is_blink: v17 — True during blink/tracking loss (pause instead of cancel)

        Returns:
            Current dwell state
        """
        current_time = time.time()

        # v17: During blink — pause dwell (preserve progress, no TTL countdown)
        if is_blink and not is_valid:
            self.pause_dwell()
            return self.state

        # Handle invalid gaze (non-blink tracking loss)
        if not is_valid:
            self._cancel_dwell()
            return self.state
        
        # Find target at current gaze
        target = self._find_target_at(gaze_x, gaze_y)

        # No target found — check hysteresis before canceling
        if target is None:
            if self.state.stage != DwellStage.NONE and self.state.target is not None:
                # v12: Increase exit hysteresis to 1.8× — cursor must move significantly
                # away before dwell cancels. Prevents cancellation from natural tremor.
                EXIT_TOLERANCE_MULTIPLIER = 1.8
                exit_tolerance = int(self.config.spatial_tolerance * EXIT_TOLERANCE_MULTIPLIER)
                if self.state.target.contains(gaze_x, gaze_y, exit_tolerance):
                    # Still within exit zone — treat as same target, don't cancel
                    target = self.state.target
                else:
                    self._cancel_dwell(save_progress=True)
                    return self.state
            else:
                return self.state

        # Different target - save progress on old, start new dwell
        if self.state.target is None or self.state.target.id != target.id:
            self._cancel_dwell(save_progress=True)
            self._start_dwell(target, confidence)
            return self.state
        
        # Same target - update progress
        elapsed_ms = (current_time - self.state.start_time) * 1000
        self.state.elapsed_ms = elapsed_ms
        
        # Onset stage
        if self.state.stage == DwellStage.ONSET:
            if elapsed_ms >= self.config.onset_delay_ms:
                self.state.stage = DwellStage.DWELLING
                self.state.onset_complete_time = current_time
                # Progress starts from onset completion
                dwell_elapsed = 0
            else:
                # During onset, no progress shown
                self.state.progress = 0
                return self.state
        
        # Dwelling stage
        if self.state.stage == DwellStage.DWELLING:
            dwell_elapsed = (current_time - self.state.onset_complete_time) * 1000
            total_dwell_needed = self.state.required_dwell_ms - self.config.onset_delay_ms
            self.state.progress = min(1.0, dwell_elapsed / total_dwell_needed)
            
            if self.on_dwell_progress:
                self.on_dwell_progress(self.state.target, self.state.progress, self.state.elapsed_ms)
            
            # Check completion
            if elapsed_ms >= self.state.required_dwell_ms:
                self._complete_dwell()
        
        return self.state
    
    def report_error(self):
        """Report a selection error (e.g., unintended click)."""
        self.errors_count += 1
    
    def reset_session(self):
        """Reset session statistics."""
        self.session_start = time.time()
        self.selections_count = 0
        self.errors_count = 0
    
    def get_stats(self) -> Dict:
        """Get dwell detection statistics."""
        session_duration = time.time() - self.session_start
        return {
            'session_duration_minutes': session_duration / 60,
            'selections_count': self.selections_count,
            'errors_count': self.errors_count,
            'error_rate': self.errors_count / max(1, self.selections_count),
            'targets_registered': len(self.targets),
        }

class DwellManager:
    """
    High-level dwell management for different screens.
    
    Manages multiple screen contexts with appropriate configurations.
    """
    
    # Screen-specific configurations
    SCREEN_CONFIGS = {
        'home': DwellConfig(base_dwell_ms=600, onset_delay_ms=200, spatial_tolerance=50),
        'keyboard': DwellConfig(base_dwell_ms=500, onset_delay_ms=120, spatial_tolerance=45),  # v14: tighter for adjacent key discrimination
        'quickfire': DwellConfig(base_dwell_ms=350, onset_delay_ms=100),
        'phrases': DwellConfig(base_dwell_ms=550, onset_delay_ms=180),
        'settings': DwellConfig(base_dwell_ms=800, onset_delay_ms=250),
        'browser': DwellConfig(base_dwell_ms=500, onset_delay_ms=150),
        'calibration': DwellConfig(base_dwell_ms=1000, onset_delay_ms=300),
    }
    
    def __init__(self):
        self.detectors: Dict[str, AdaptiveDwellDetector] = {}
        self.current_screen: str = 'home'
        
        # Initialize detectors for each screen
        for screen, config in self.SCREEN_CONFIGS.items():
            self.detectors[screen] = AdaptiveDwellDetector(config)
    
    def get_detector(self, screen: Optional[str] = None) -> AdaptiveDwellDetector:
        """Get detector for a screen (or current screen)."""
        screen = screen or self.current_screen
        if screen not in self.detectors:
            self.detectors[screen] = AdaptiveDwellDetector()
        return self.detectors[screen]
    
    def set_screen(self, screen: str):
        """Switch to a different screen context."""
        if self.current_screen != screen:
            # Cancel any ongoing dwell on old screen
            if self.current_screen in self.detectors:
                self.detectors[self.current_screen]._cancel_dwell()
            self.current_screen = screen
    
    def update(self, gaze_x: float, gaze_y: float, confidence: float = 1.0,
               is_valid: bool = True, is_blink: bool = False) -> Optional[DwellState]:
        """Update current screen's dwell detector."""
        return self.get_detector().update(gaze_x, gaze_y, confidence, is_valid, is_blink=is_blink)
    
    def register_target(self, target: DwellTarget, screen: Optional[str] = None):
        """Register a target on a screen."""
        self.get_detector(screen).register_target(target)
    
    def set_targets(self, targets: List[DwellTarget], screen: Optional[str] = None):
        """Set all targets for a screen."""
        self.get_detector(screen).set_targets(targets)
    
    def set_callbacks(self, 
                      on_start: Optional[Callable] = None,
                      on_progress: Optional[Callable] = None,
                      on_complete: Optional[Callable] = None,
                      on_cancel: Optional[Callable] = None,
                      screen: Optional[str] = None):
        """Set callbacks for a screen's detector."""
        detector = self.get_detector(screen)
        detector.on_dwell_start = on_start
        detector.on_dwell_progress = on_progress
        detector.on_dwell_complete = on_complete
        detector.on_dwell_cancel = on_cancel
