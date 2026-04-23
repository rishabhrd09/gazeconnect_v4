"""
GazeConnect Pro - Ultimate Fatigue Monitoring System
====================================================
Research-backed fatigue detection and break management.

Key Research:
- 20-20-20 Rule: 20-second break every 20 minutes, look 20 feet away
- Eye muscles don't fatigue traditionally, but cognitive/visual strain occurs
- Blink rate: Normal ~15/min, Low (<8/min) indicates strain
- Extended sessions increase error rates

Features:
- Blink detection and monitoring
- Fatigue scoring algorithm
- Adaptive break reminders
- Dry eye alerts
- Session analytics
"""

import time
from dataclasses import dataclass, field
from typing import Optional, Callable, Dict, List, Tuple
from enum import Enum
from collections import deque

class FatigueLevel(Enum):
    """Fatigue severity levels."""
    FRESH = "fresh"         # Just started, fully rested
    NORMAL = "normal"       # Normal operation
    MILD = "mild"           # Slight fatigue, monitor
    MODERATE = "moderate"   # Should take break soon
    HIGH = "high"           # Needs break now
    SEVERE = "severe"       # Extended rest recommended

@dataclass
class FatigueThresholds:
    """Thresholds for fatigue detection."""
    # Time-based (minutes)
    mild_time: int = 15
    moderate_time: int = 25
    high_time: int = 35
    severe_time: int = 45
    
    # Blink-based (blinks per minute)
    normal_blink_rate: float = 15.0
    low_blink_threshold: float = 8.0
    very_low_blink_threshold: float = 5.0
    
    # Error-based (percentage)
    normal_error_rate: float = 0.05
    high_error_rate: float = 0.15
    
    # Gaze stability (lower = less stable = more fatigued)
    normal_stability: float = 0.9
    low_stability: float = 0.7

@dataclass
class BlinkData:
    """Blink detection data."""
    timestamp: float
    duration_ms: float
    is_voluntary: bool = False

class BlinkDetector:
    """
    Detects blinks from eye tracker validity data.
    
    A blink is detected when:
    - Both eyes become invalid for 100-400ms (typical blink duration)
    - Then become valid again
    """
    
    MIN_BLINK_DURATION_MS = 100
    MAX_BLINK_DURATION_MS = 400
    
    def __init__(self):
        self.last_valid_time: Optional[float] = None
        self.invalid_start: Optional[float] = None
        self.blink_history: deque = deque(maxlen=100)
        self.blinks_last_minute: int = 0
        self.last_minute_update: float = time.time()
    
    def update(self, is_valid: bool, timestamp: Optional[float] = None) -> Optional[BlinkData]:
        """
        Update blink detection with new validity data.
        
        Args:
            is_valid: Whether eyes are currently detected
            timestamp: Optional timestamp
            
        Returns:
            BlinkData if a blink was detected, None otherwise
        """
        timestamp = timestamp or time.time()
        
        if is_valid:
            if self.invalid_start is not None:
                # Eyes became valid again - check if it was a blink
                duration_ms = (timestamp - self.invalid_start) * 1000
                
                if self.MIN_BLINK_DURATION_MS <= duration_ms <= self.MAX_BLINK_DURATION_MS:
                    blink = BlinkData(
                        timestamp=timestamp,
                        duration_ms=duration_ms
                    )
                    self.blink_history.append(blink)
                    self._update_rate()
                    self.invalid_start = None
                    return blink
                
                self.invalid_start = None
            
            self.last_valid_time = timestamp
        else:
            if self.invalid_start is None and self.last_valid_time is not None:
                self.invalid_start = timestamp
        
        return None
    
    def _update_rate(self):
        """Update blinks per minute calculation."""
        current_time = time.time()
        one_minute_ago = current_time - 60
        
        # Count blinks in last minute
        self.blinks_last_minute = sum(
            1 for b in self.blink_history if b.timestamp > one_minute_ago
        )
        self.last_minute_update = current_time
    
    def get_blink_rate(self) -> float:
        """Get current blinks per minute."""
        self._update_rate()
        return float(self.blinks_last_minute)
    
    def get_average_blink_duration(self) -> float:
        """Get average blink duration in ms."""
        if not self.blink_history:
            return 150.0  # Default
        recent = list(self.blink_history)[-20:]
        return sum(b.duration_ms for b in recent) / len(recent)

class GazeStabilityMonitor:
    """
    Monitors gaze stability as indicator of fatigue.
    
    More erratic gaze patterns indicate increased fatigue.
    """
    
    WINDOW_SIZE = 100  # Samples to track
    
    def __init__(self):
        self.positions: deque = deque(maxlen=self.WINDOW_SIZE)
        self.timestamps: deque = deque(maxlen=self.WINDOW_SIZE)
    
    def update(self, x: float, y: float, timestamp: Optional[float] = None):
        """Add new gaze position."""
        timestamp = timestamp or time.time()
        self.positions.append((x, y))
        self.timestamps.append(timestamp)
    
    def get_stability(self) -> float:
        """
        Calculate gaze stability score (0-1).
        1.0 = perfectly stable, 0.0 = highly erratic
        """
        if len(self.positions) < 10:
            return 1.0
        
        positions = list(self.positions)
        
        # Calculate variance
        x_values = [p[0] for p in positions]
        y_values = [p[1] for p in positions]
        
        x_mean = sum(x_values) / len(x_values)
        y_mean = sum(y_values) / len(y_values)
        
        x_var = sum((x - x_mean) ** 2 for x in x_values) / len(x_values)
        y_var = sum((y - y_mean) ** 2 for y in y_values) / len(y_values)
        
        total_var = x_var + y_var
        
        # Convert variance to stability score
        # Lower variance = higher stability
        stability = 1.0 / (1.0 + total_var * 100)
        return max(0.0, min(1.0, stability))

class FatigueDetector:
    """
    Comprehensive fatigue detection system.
    
    Combines multiple signals:
    - Time since last break
    - Blink rate
    - Error rate
    - Gaze stability
    - Session duration
    """
    
    FATIGUE_HISTORY_LIMIT = 5000

    def __init__(self, thresholds: Optional[FatigueThresholds] = None):
        self.thresholds = thresholds or FatigueThresholds()
        
        # Components
        self.blink_detector = BlinkDetector()
        self.stability_monitor = GazeStabilityMonitor()
        
        # State
        self.session_start = time.time()
        self.last_break_end = time.time()
        self.selections_count = 0
        self.errors_count = 0
        
        # History
        self.fatigue_history = deque(maxlen=self.FATIGUE_HISTORY_LIMIT)
    
    def update_gaze(self, x: float, y: float, is_valid: bool, 
                    timestamp: Optional[float] = None) -> Optional[BlinkData]:
        """
        Update with new gaze data.
        
        Returns BlinkData if a blink was detected.
        """
        timestamp = timestamp or time.time()
        
        # Update blink detector
        blink = self.blink_detector.update(is_valid, timestamp)
        
        # Update stability monitor
        if is_valid:
            self.stability_monitor.update(x, y, timestamp)
        
        return blink
    
    def report_selection(self):
        """Report a successful selection."""
        self.selections_count += 1
    
    def report_error(self):
        """Report a selection error."""
        self.errors_count += 1
        self.selections_count += 1
    
    def report_break(self, duration_seconds: float = 20):
        """Report that user took a break."""
        self.last_break_end = time.time()
    
    def _calculate_time_score(self) -> float:
        """Calculate fatigue score from time since break (0-1)."""
        minutes_since_break = (time.time() - self.last_break_end) / 60
        
        if minutes_since_break < self.thresholds.mild_time:
            return 0.0
        elif minutes_since_break < self.thresholds.moderate_time:
            return 0.3
        elif minutes_since_break < self.thresholds.high_time:
            return 0.6
        elif minutes_since_break < self.thresholds.severe_time:
            return 0.8
        else:
            return 1.0
    
    def _calculate_blink_score(self) -> float:
        """Calculate fatigue score from blink rate (0-1)."""
        blink_rate = self.blink_detector.get_blink_rate()
        
        if blink_rate >= self.thresholds.normal_blink_rate:
            return 0.0
        elif blink_rate >= self.thresholds.low_blink_threshold:
            return 0.3
        elif blink_rate >= self.thresholds.very_low_blink_threshold:
            return 0.6
        else:
            return 1.0
    
    def _calculate_error_score(self) -> float:
        """Calculate fatigue score from error rate (0-1)."""
        if self.selections_count < 10:
            return 0.0
        
        error_rate = self.errors_count / self.selections_count
        
        if error_rate <= self.thresholds.normal_error_rate:
            return 0.0
        elif error_rate <= self.thresholds.high_error_rate:
            return 0.5
        else:
            return 1.0
    
    def _calculate_stability_score(self) -> float:
        """Calculate fatigue score from gaze stability (0-1)."""
        stability = self.stability_monitor.get_stability()
        
        if stability >= self.thresholds.normal_stability:
            return 0.0
        elif stability >= self.thresholds.low_stability:
            return 0.5
        else:
            return 1.0
    
    def get_fatigue_level(self) -> Tuple[FatigueLevel, float]:
        """
        Get current fatigue level.
        
        Returns:
            Tuple of (FatigueLevel, score 0-100)
        """
        # Calculate component scores
        time_score = self._calculate_time_score()
        blink_score = self._calculate_blink_score()
        error_score = self._calculate_error_score()
        stability_score = self._calculate_stability_score()
        
        # Weighted combination
        weights = {
            'time': 0.4,
            'blink': 0.3,
            'error': 0.2,
            'stability': 0.1,
        }
        
        total_score = (
            weights['time'] * time_score +
            weights['blink'] * blink_score +
            weights['error'] * error_score +
            weights['stability'] * stability_score
        )
        
        # Convert to percentage
        score_percent = total_score * 100
        
        # Determine level
        if score_percent < 10:
            level = FatigueLevel.FRESH
        elif score_percent < 30:
            level = FatigueLevel.NORMAL
        elif score_percent < 50:
            level = FatigueLevel.MILD
        elif score_percent < 70:
            level = FatigueLevel.MODERATE
        elif score_percent < 90:
            level = FatigueLevel.HIGH
        else:
            level = FatigueLevel.SEVERE
        
        # Record history
        self.fatigue_history.append((time.time(), level))
        
        return level, score_percent
    
    def get_recommendations(self) -> List[str]:
        """Get recommendations based on current fatigue state."""
        level, score = self.get_fatigue_level()
        blink_rate = self.blink_detector.get_blink_rate()
        minutes_since_break = (time.time() - self.last_break_end) / 60
        
        recommendations = []
        
        if level in (FatigueLevel.HIGH, FatigueLevel.SEVERE):
            recommendations.append("Take a 5-10 minute break now")
        elif level == FatigueLevel.MODERATE:
            recommendations.append("Consider taking a short break soon")
        
        if blink_rate < self.thresholds.low_blink_threshold:
            recommendations.append("Your blink rate is low - consider using eye drops")
            recommendations.append("Try to blink more consciously")
        
        if minutes_since_break > 20:
            recommendations.append("20-20-20: Look at something 20 feet away for 20 seconds")
        
        return recommendations
    
    def get_stats(self) -> Dict:
        """Get current fatigue statistics."""
        level, score = self.get_fatigue_level()
        return {
            'fatigue_level': level.value,
            'fatigue_score': score,
            'blinks_per_minute': self.blink_detector.get_blink_rate(),
            'gaze_stability': self.stability_monitor.get_stability(),
            'session_duration_minutes': (time.time() - self.session_start) / 60,
            'time_since_break_minutes': (time.time() - self.last_break_end) / 60,
            'selections_count': self.selections_count,
            'errors_count': self.errors_count,
            'error_rate': self.errors_count / max(1, self.selections_count),
        }
    
    def reset_session(self):
        """Reset for new session."""
        self.session_start = time.time()
        self.last_break_end = time.time()
        self.selections_count = 0
        self.errors_count = 0
        self.fatigue_history.clear()

class BreakReminderManager:
    """
    Manages break reminders based on 20-20-20 rule.
    
    - Warns 2 minutes before break needed
    - Reminds when break needed
    - Tracks break compliance
    """
    
    def __init__(self, 
                 break_interval_minutes: float = 20,
                 break_duration_seconds: float = 20,
                 warning_minutes_before: float = 2):
        self.break_interval = break_interval_minutes * 60  # Convert to seconds
        self.break_duration = break_duration_seconds
        self.warning_before = warning_minutes_before * 60
        
        # State
        self.last_break_end = time.time()
        self.is_on_break = False
        self.break_start: Optional[float] = None
        self.warning_issued = False
        self.snooze_until: Optional[float] = None
        
        # Statistics
        self.breaks_taken = 0
        self.breaks_skipped = 0
        
        # Callbacks
        self.on_warning: Optional[Callable[[], None]] = None
        self.on_break_needed: Optional[Callable[[], None]] = None
        self.on_break_complete: Optional[Callable[[], None]] = None
    
    def update(self) -> Optional[str]:
        """
        Check if break action needed.
        
        Returns:
            'warning' if warning should be shown
            'break' if break needed now
            'on_break' if currently on break
            None if no action needed
        """
        current_time = time.time()
        
        # Check if on break
        if self.is_on_break:
            elapsed = current_time - self.break_start
            if elapsed >= self.break_duration:
                self._complete_break()
                return None
            return 'on_break'
        
        # Check snooze
        if self.snooze_until and current_time < self.snooze_until:
            return None
        
        time_since_break = current_time - self.last_break_end
        time_until_break = self.break_interval - time_since_break
        
        # Check if break needed
        if time_until_break <= 0:
            if self.on_break_needed:
                self.on_break_needed()
            return 'break'
        
        # Check if warning needed
        if time_until_break <= self.warning_before and not self.warning_issued:
            self.warning_issued = True
            if self.on_warning:
                self.on_warning()
            return 'warning'
        
        return None
    
    def start_break(self):
        """Start a break."""
        self.is_on_break = True
        self.break_start = time.time()
        self.warning_issued = False
        self.snooze_until = None
    
    def _complete_break(self):
        """Complete the current break."""
        self.is_on_break = False
        self.last_break_end = time.time()
        self.break_start = None
        self.breaks_taken += 1
        self.warning_issued = False
        
        if self.on_break_complete:
            self.on_break_complete()
    
    def skip_break(self):
        """Skip the current break reminder."""
        self.breaks_skipped += 1
        self.last_break_end = time.time()  # Reset timer
        self.warning_issued = False
    
    def snooze(self, minutes: float = 5):
        """Snooze break reminder for specified minutes."""
        self.snooze_until = time.time() + (minutes * 60)
        self.warning_issued = False
    
    def get_time_until_break(self) -> float:
        """Get seconds until next break."""
        if self.is_on_break:
            return 0
        time_since = time.time() - self.last_break_end
        return max(0, self.break_interval - time_since)
    
    def get_break_progress(self) -> float:
        """Get current break progress (0-1) if on break."""
        if not self.is_on_break or self.break_start is None:
            return 0.0
        elapsed = time.time() - self.break_start
        return min(1.0, elapsed / self.break_duration)
    
    def get_stats(self) -> Dict:
        """Get break statistics."""
        return {
            'breaks_taken': self.breaks_taken,
            'breaks_skipped': self.breaks_skipped,
            'is_on_break': self.is_on_break,
            'time_until_break': self.get_time_until_break(),
            'break_progress': self.get_break_progress(),
            'compliance_rate': self.breaks_taken / max(1, self.breaks_taken + self.breaks_skipped),
        }

class DryEyeMonitor:
    """
    Monitors for dry eye indicators and suggests remedies.
    
    Low blink rate is primary indicator.
    Reminds to use artificial tears every 30 minutes.
    """
    
    def __init__(self, 
                 tears_reminder_interval_minutes: float = 30,
                 low_blink_threshold: float = 8.0):
        self.reminder_interval = tears_reminder_interval_minutes * 60
        self.low_blink_threshold = low_blink_threshold
        
        self.last_reminder = time.time()
        self.low_blink_periods = 0
        
        self.on_tears_reminder: Optional[Callable[[], None]] = None
    
    def update(self, blink_rate: float) -> Optional[str]:
        """
        Check if dry eye action needed.
        
        Returns:
            'tears_reminder' if should remind about artificial tears
            'low_blink_warning' if blink rate is concerningly low
            None if no action needed
        """
        current_time = time.time()
        
        # Track low blink periods
        if blink_rate < self.low_blink_threshold:
            self.low_blink_periods += 1
        
        # Check if tears reminder needed
        time_since_reminder = current_time - self.last_reminder
        
        # More frequent reminders if blink rate consistently low
        effective_interval = self.reminder_interval
        if self.low_blink_periods > 5:
            effective_interval *= 0.5  # Remind twice as often
        
        if time_since_reminder >= effective_interval:
            self.last_reminder = current_time
            self.low_blink_periods = 0
            if self.on_tears_reminder:
                self.on_tears_reminder()
            return 'tears_reminder'
        
        # Immediate warning for very low blink rate
        if blink_rate < self.low_blink_threshold / 2:
            return 'low_blink_warning'
        
        return None

# ============================================
# EXPORTS
# ============================================

__all__ = [
    'FatigueLevel',
    'FatigueThresholds',
    'BlinkDetector',
    'GazeStabilityMonitor', 
    'FatigueDetector',
    'BreakReminderManager',
    'DryEyeMonitor',
]
