"""
GazeConnect Pro - In-App Calibration System (v1.0)
====================================================
World-class secondary calibration that corrects residual Tobii errors.

Research basis:
- Blignaut (2016): 2nd-order polynomial + real-time offset correction
- Hassoumi et al. (2019): 30% accuracy improvement with optimized regression
- PMC-8482219: 9 calibration points minimum for 2nd-order polynomial
- PMC-10966887: Ridge regression reduces MSE by 20% vs ordinary least-squares
- OptiKey-AvraLabs fork: CalibrationAdjusterStatic.cs proves secondary calibration works

Pipeline position:
  Raw Tobii -> TOBII_MARGIN -> POLYNOMIAL CORRECTION -> Kalman -> GazeFilter -> Magnetism
"""

import json
import math
import time
import logging
import os
import threading
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

logger = logging.getLogger('GazeConnect')


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class CalibrationSample:
    """A single gaze sample during calibration."""
    gaze_x: float
    gaze_y: float
    timestamp: float
    confidence: float = 1.0


@dataclass
class CalibrationPoint:
    """A calibration target with collected samples."""
    target_x: float
    target_y: float
    samples: List[CalibrationSample] = field(default_factory=list)
    median_gaze_x: float = 0.0
    median_gaze_y: float = 0.0
    offset_x: float = 0.0
    offset_y: float = 0.0
    accuracy_px: float = 0.0

    def compute_stats(self, screen_width: int = 1536, screen_height: int = 782):
        if not self.samples:
            return
        xs = sorted([s.gaze_x for s in self.samples])
        ys = sorted([s.gaze_y for s in self.samples])
        n = len(xs)
        if n % 2 == 1:
            self.median_gaze_x = xs[n // 2]
            self.median_gaze_y = ys[n // 2]
        else:
            self.median_gaze_x = (xs[n // 2 - 1] + xs[n // 2]) / 2
            self.median_gaze_y = (ys[n // 2 - 1] + ys[n // 2]) / 2
        self.offset_x = self.target_x - self.median_gaze_x
        self.offset_y = self.target_y - self.median_gaze_y
        sum_sq = 0.0
        for s in self.samples:
            dx = (s.gaze_x - self.target_x) * screen_width
            dy = (s.gaze_y - self.target_y) * screen_height
            sum_sq += dx * dx + dy * dy
        self.accuracy_px = math.sqrt(sum_sq / len(self.samples))


@dataclass
class CalibrationProfile:
    """Complete calibration data and correction model."""
    created_at: str = ""
    screen_width: int = 1536
    screen_height: int = 782
    points: List[CalibrationPoint] = field(default_factory=list)
    x_coefficients: List[float] = field(default_factory=list)
    y_coefficients: List[float] = field(default_factory=list)
    validation_error_px: float = 0.0
    pre_correction_error_px: float = 0.0
    post_correction_error_px: float = 0.0
    mean_improvement_pct: float = 0.0
    is_valid: bool = False
    idw_power: float = 2.0


# =============================================================================
# CALIBRATION TARGET LAYOUT
# =============================================================================

def get_calibration_targets(num_points: int = 9) -> List[Tuple[float, float]]:
    """Generate calibration target positions (serpentine order)."""
    M = 0.12
    if num_points >= 9:
        return [
            (M, M), (0.5, M), (1.0 - M, M),
            (1.0 - M, 0.5), (0.5, 0.5), (M, 0.5),
            (M, 1.0 - M), (0.5, 1.0 - M), (1.0 - M, 1.0 - M),
        ]
    elif num_points == 5:
        return [
            (M, M), (1.0 - M, M), (0.5, 0.5),
            (M, 1.0 - M), (1.0 - M, 1.0 - M),
        ]
    return get_calibration_targets(9)


VALIDATION_POINT = (0.30, 0.70)


# =============================================================================
# POLYNOMIAL REGRESSION (2nd-order with Ridge Regularization)
# =============================================================================

class PolynomialCalibrator:
    """
    Fits a 2nd-order polynomial correction: pure Python, no numpy.
    corrected = c0 + c1*gx + c2*gy + c3*gx*gy + c4*gx^2 + c5*gy^2
    """
    RIDGE_LAMBDA = 0.01

    @staticmethod
    def _build_design_matrix(points: List[CalibrationPoint]) -> List[List[float]]:
        A = []
        for p in points:
            gx, gy = p.median_gaze_x, p.median_gaze_y
            A.append([1.0, gx, gy, gx * gy, gx * gx, gy * gy])
        return A

    @staticmethod
    def _gauss_solve(matrix: List[List[float]], rhs: List[float]) -> List[float]:
        n = len(rhs)
        aug = [row[:] + [rhs[i]] for i, row in enumerate(matrix)]
        for col in range(n):
            max_row, max_val = col, abs(aug[col][col])
            for row in range(col + 1, n):
                if abs(aug[row][col]) > max_val:
                    max_val = abs(aug[row][col])
                    max_row = row
            if max_row != col:
                aug[col], aug[max_row] = aug[max_row], aug[col]
            pivot = aug[col][col]
            if abs(pivot) < 1e-12:
                continue
            for row in range(col + 1, n):
                factor = aug[row][col] / pivot
                for j in range(col, n + 1):
                    aug[row][j] -= factor * aug[col][j]
        x = [0.0] * n
        for i in range(n - 1, -1, -1):
            s = aug[i][n]
            for j in range(i + 1, n):
                s -= aug[i][j] * x[j]
            x[i] = s / aug[i][i] if abs(aug[i][i]) >= 1e-12 else 0.0
        return x

    @classmethod
    def _ridge_solve(cls, A: List[List[float]], b: List[float],
                     lam: float = 0.01) -> List[float]:
        n = len(A[0])
        m = len(A)
        AtA = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(n):
                s = 0.0
                for k in range(m):
                    s += A[k][i] * A[k][j]
                AtA[i][j] = s
        for i in range(n):
            AtA[i][i] += lam
        Atb = [0.0] * n
        for i in range(n):
            s = 0.0
            for k in range(m):
                s += A[k][i] * b[k]
            Atb[i] = s
        return cls._gauss_solve(AtA, Atb)

    @classmethod
    def fit(cls, points: List[CalibrationPoint]) -> Tuple[List[float], List[float]]:
        if len(points) < 5:
            logger.warning("[CALIB] Need >= 5 points, returning identity")
            return [0, 1, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0]
        for p in points:
            p.compute_stats()
        A = cls._build_design_matrix(points)
        x_coeff = cls._ridge_solve(A, [p.target_x for p in points], cls.RIDGE_LAMBDA)
        y_coeff = cls._ridge_solve(A, [p.target_y for p in points], cls.RIDGE_LAMBDA)
        logger.info(f"[CALIB] Fit x_coeff={[f'{c:.4f}' for c in x_coeff]}")
        logger.info(f"[CALIB] Fit y_coeff={[f'{c:.4f}' for c in y_coeff]}")
        return x_coeff, y_coeff

    @staticmethod
    def apply(gaze_x: float, gaze_y: float,
              x_coeff: List[float], y_coeff: List[float]) -> Tuple[float, float]:
        if len(x_coeff) != 6 or len(y_coeff) != 6:
            return gaze_x, gaze_y
        f = [1.0, gaze_x, gaze_y, gaze_x * gaze_y,
             gaze_x * gaze_x, gaze_y * gaze_y]
        cx = max(0.0, min(1.0, sum(c * v for c, v in zip(x_coeff, f))))
        cy = max(0.0, min(1.0, sum(c * v for c, v in zip(y_coeff, f))))
        return cx, cy


# =============================================================================
# CALIBRATION SESSION MANAGER
# =============================================================================

class CalibrationState:
    IDLE = "idle"
    WAITING = "waiting"
    COLLECTING = "collecting"
    TRANSITIONING = "transitioning"
    VALIDATING = "validating"
    COMPLETE = "complete"
    FAILED = "failed"


class CalibrationSession:
    """Manages the complete 9-point calibration flow."""

    SAMPLES_PER_POINT = 90
    FIXATION_RADIUS = 0.12
    FIXATION_FRAMES = 15
    TRANSITION_DELAY = 0.8
    POINT_TIMEOUT = 12.0

    def __init__(self, screen_width: int = 1536, screen_height: int = 782,
                 num_points: int = 9):
        self.screen_width = screen_width
        self.screen_height = screen_height
        self.num_points = num_points
        self.state = CalibrationState.IDLE
        self.targets = get_calibration_targets(num_points)
        self.current_index = 0
        self.points: List[CalibrationPoint] = []
        self.current_samples: List[CalibrationSample] = []
        self._near_target_count = 0
        self._target_start_time = 0.0
        self.profile: Optional[CalibrationProfile] = None

        self.on_target_show = None
        self.on_collection_start = None
        self.on_collection_progress = None
        self.on_point_complete = None
        self.on_validation_start = None
        self.on_complete = None
        self.on_failed = None

    def start(self):
        logger.info(f"[CALIB] Starting {self.num_points}-point calibration")
        self.state = CalibrationState.IDLE
        self.current_index = 0
        self.points = []
        self.current_samples = []
        self._near_target_count = 0
        self._show_next_target()

    def _show_next_target(self):
        if self.current_index >= len(self.targets):
            self._fit_and_validate()
            return
        tx, ty = self.targets[self.current_index]
        self.state = CalibrationState.WAITING
        self.current_samples = []
        self._near_target_count = 0
        self._target_start_time = time.time()
        logger.info(f"[CALIB] Target {self.current_index + 1}/{len(self.targets)}: ({tx:.2f}, {ty:.2f})")
        if self.on_target_show:
            self.on_target_show(self.current_index, tx, ty, len(self.targets))

    def update(self, gaze_x: float, gaze_y: float, confidence: float = 1.0):
        if self.state in (CalibrationState.IDLE, CalibrationState.COMPLETE,
                          CalibrationState.TRANSITIONING, CalibrationState.FAILED):
            return
        if self.state == CalibrationState.WAITING:
            self._handle_waiting(gaze_x, gaze_y)
        elif self.state in (CalibrationState.COLLECTING, CalibrationState.VALIDATING):
            self._handle_collecting(gaze_x, gaze_y, confidence)

    def _handle_waiting(self, gaze_x: float, gaze_y: float):
        tx, ty = self.targets[self.current_index]
        dx, dy = gaze_x - tx, gaze_y - ty
        dist = math.sqrt(dx * dx + dy * dy)
        if dist <= self.FIXATION_RADIUS:
            self._near_target_count += 1
        else:
            self._near_target_count = max(0, self._near_target_count - 2)
        if time.time() - self._target_start_time > self.POINT_TIMEOUT:
            logger.warning(f"[CALIB] Target {self.current_index + 1} timed out")
            self._near_target_count = self.FIXATION_FRAMES
        if self._near_target_count >= self.FIXATION_FRAMES:
            self.state = CalibrationState.COLLECTING
            self.current_samples = []
            logger.info(f"[CALIB] Fixation detected at target {self.current_index + 1}")
            if self.on_collection_start:
                self.on_collection_start(self.current_index)

    def _handle_collecting(self, gaze_x: float, gaze_y: float, confidence: float):
        self.current_samples.append(CalibrationSample(
            gaze_x=gaze_x, gaze_y=gaze_y,
            timestamp=time.time(), confidence=confidence
        ))
        progress = min(1.0, len(self.current_samples) / self.SAMPLES_PER_POINT)
        if self.on_collection_progress:
            self.on_collection_progress(self.current_index, progress)
        if len(self.current_samples) >= self.SAMPLES_PER_POINT:
            if self.state == CalibrationState.VALIDATING:
                self._complete_validation()
            else:
                self._complete_point()

    def _complete_point(self):
        tx, ty = self.targets[self.current_index]
        point = CalibrationPoint(target_x=tx, target_y=ty, samples=self.current_samples[:])
        point.compute_stats(self.screen_width, self.screen_height)
        self.points.append(point)
        logger.info(
            f"[CALIB] Point {self.current_index + 1}: "
            f"offset=({point.offset_x:+.3f}, {point.offset_y:+.3f}), "
            f"accuracy={point.accuracy_px:.1f}px"
        )
        if self.on_point_complete:
            self.on_point_complete(self.current_index, point.accuracy_px)
        self.current_index += 1
        self.state = CalibrationState.TRANSITIONING
        threading.Timer(self.TRANSITION_DELAY, self._show_next_target).start()

    def _fit_and_validate(self):
        logger.info("[CALIB] Fitting polynomial correction model...")
        if len(self.points) < 5:
            self.state = CalibrationState.FAILED
            if self.on_failed:
                self.on_failed("Not enough valid calibration points")
            return
        x_coeff, y_coeff = PolynomialCalibrator.fit(self.points)
        from datetime import datetime
        self.profile = CalibrationProfile(
            created_at=datetime.now().isoformat(),
            screen_width=self.screen_width,
            screen_height=self.screen_height,
            points=self.points,
            x_coefficients=x_coeff,
            y_coefficients=y_coeff,
        )
        pre_err = sum(p.accuracy_px for p in self.points) / len(self.points)
        self.profile.pre_correction_error_px = pre_err
        post_err_sum = 0.0
        for p in self.points:
            cx, cy = PolynomialCalibrator.apply(
                p.median_gaze_x, p.median_gaze_y, x_coeff, y_coeff
            )
            dx = (cx - p.target_x) * self.screen_width
            dy = (cy - p.target_y) * self.screen_height
            post_err_sum += math.sqrt(dx * dx + dy * dy)
        post_err = post_err_sum / len(self.points)
        self.profile.post_correction_error_px = post_err
        self.profile.mean_improvement_pct = (1.0 - post_err / max(1.0, pre_err)) * 100
        logger.info(f"[CALIB] Pre: {pre_err:.1f}px -> Post: {post_err:.1f}px ({self.profile.mean_improvement_pct:.0f}%)")
        self._start_validation()

    def _start_validation(self):
        self.state = CalibrationState.VALIDATING
        self.current_samples = []
        self._near_target_count = 0
        self._target_start_time = time.time()
        vx, vy = VALIDATION_POINT
        logger.info(f"[CALIB] Validation point: ({vx:.2f}, {vy:.2f})")
        if self.on_validation_start:
            self.on_validation_start(vx, vy)
        def start_collect():
            if self.state == CalibrationState.VALIDATING:
                self.state = CalibrationState.COLLECTING
                self.current_samples = []
        threading.Timer(1.5, start_collect).start()

    def _complete_validation(self):
        vx, vy = VALIDATION_POINT
        xs = sorted([s.gaze_x for s in self.current_samples])
        ys = sorted([s.gaze_y for s in self.current_samples])
        n = len(xs)
        med_x = xs[n // 2] if n > 0 else vx
        med_y = ys[n // 2] if n > 0 else vy
        uncorrected = math.sqrt(
            ((med_x - vx) * self.screen_width) ** 2 +
            ((med_y - vy) * self.screen_height) ** 2
        )
        cx, cy = PolynomialCalibrator.apply(
            med_x, med_y,
            self.profile.x_coefficients, self.profile.y_coefficients
        )
        corrected = math.sqrt(
            ((cx - vx) * self.screen_width) ** 2 +
            ((cy - vy) * self.screen_height) ** 2
        )
        self.profile.validation_error_px = corrected
        self.profile.is_valid = True
        logger.info(f"[CALIB] Validation: {uncorrected:.1f}px -> {corrected:.1f}px")
        self.state = CalibrationState.COMPLETE
        if self.on_complete:
            self.on_complete(self.profile)

    def cancel(self):
        logger.info("[CALIB] Calibration cancelled")
        self.state = CalibrationState.IDLE


# =============================================================================
# REAL-TIME CORRECTION APPLIER
# =============================================================================

class GazeCalibrationCorrector:
    """Applies learned calibration correction in real-time."""

    def __init__(self):
        self.profile: Optional[CalibrationProfile] = None
        self.enabled = False
        self._log_count = 0
        self._idw_points: List[Tuple[float, float]] = []
        self._idw_errors: List[Tuple[float, float]] = []

    def load_profile(self, profile: CalibrationProfile):
        if profile and profile.x_coefficients and profile.y_coefficients:
            self.profile = profile
            self.enabled = True
            self._log_count = 0
            self._idw_points = []
            self._idw_errors = []

            def add_anchor(ax: float, ay: float, ex: float, ey: float):
                self._idw_points.append((
                    max(0.0, min(1.0, ax)),
                    max(0.0, min(1.0, ay)),
                ))
                self._idw_errors.append((ex, ey))

            # Build IDW residual model on top of polynomial correction.
            # Residual is computed at calibration anchors after polynomial mapping.
            for p in (profile.points or []):
                px, py = p.target_x, p.target_y
                if p.median_gaze_x == 0.0 and p.median_gaze_y == 0.0 and not p.samples:
                    continue
                cx, cy = PolynomialCalibrator.apply(
                    p.median_gaze_x, p.median_gaze_y,
                    profile.x_coefficients, profile.y_coefficients
                )
                # Residual to remove at runtime.
                err_x = cx - px
                err_y = cy - py
                add_anchor(px, py, err_x, err_y)

                # P3: denser virtual anchors in lower screen (keyboard zone).
                # This increases local correction influence where typing happens most.
                if py >= 0.55:
                    for dx, dy in [(-0.06, 0.03), (0.06, 0.03), (0.0, 0.06)]:
                        add_anchor(px + dx, py + dy, err_x * 0.95, err_y * 0.95)
            logger.info(
                f"[CALIB] Correction ON: improvement={profile.mean_improvement_pct:.0f}%, "
                f"validation={profile.validation_error_px:.1f}px"
            )
        else:
            self.enabled = False

    def _apply_idw(self, x: float, y: float) -> Tuple[float, float]:
        """Inverse-distance residual interpolation."""
        if len(self._idw_points) < 3:
            return x, y

        power = self.profile.idw_power if self.profile else 2.0
        weights: List[float] = []
        for px, py in self._idw_points:
            dist = math.sqrt((px - x) ** 2 + (py - y) ** 2)
            if dist < 1e-6:
                idx = len(weights)
                ex, ey = self._idw_errors[idx]
                return (
                    max(0.0, min(1.0, x - ex)),
                    max(0.0, min(1.0, y - ey)),
                )
            weights.append(1.0 / (dist ** power))

        weight_sum = sum(weights)
        if weight_sum <= 1e-12:
            return x, y

        err_x = 0.0
        err_y = 0.0
        for i, w in enumerate(weights):
            nw = w / weight_sum
            ex, ey = self._idw_errors[i]
            err_x += nw * ex
            err_y += nw * ey

        return (
            max(0.0, min(1.0, x - err_x)),
            max(0.0, min(1.0, y - err_y)),
        )

    def correct(self, gaze_x: float, gaze_y: float) -> Tuple[float, float]:
        if not self.enabled or not self.profile:
            return gaze_x, gaze_y
        cx, cy = PolynomialCalibrator.apply(
            gaze_x, gaze_y,
            self.profile.x_coefficients, self.profile.y_coefficients
        )
        cx, cy = self._apply_idw(cx, cy)
        self._log_count += 1
        if self._log_count <= 5 or self._log_count % 2000 == 0:
            logger.info(
                f"[CALIB-CORRECT] ({gaze_x:.4f},{gaze_y:.4f}) -> "
                f"({cx:.4f},{cy:.4f}) d=({cx - gaze_x:+.4f},{cy - gaze_y:+.4f})"
            )
        return cx, cy

    def disable(self):
        self.enabled = False
        self._idw_points = []
        self._idw_errors = []

    def get_stats(self) -> dict:
        return {
            'enabled': self.enabled,
            'corrections_applied': self._log_count,
            'improvement_pct': self.profile.mean_improvement_pct if self.profile else 0,
            'validation_error_px': self.profile.validation_error_px if self.profile else 0,
            'idw_points': len(self._idw_points),
        }


# =============================================================================
# PERSISTENCE
# =============================================================================

class CalibrationStorage:
    DEFAULT_DIR = os.path.join(os.path.expanduser("~"), ".gazeconnect")
    DEFAULT_FILE = "calibration_profile.json"

    @classmethod
    def _ensure_dir(cls):
        os.makedirs(cls.DEFAULT_DIR, exist_ok=True)

    @classmethod
    def save(cls, profile: CalibrationProfile, filename: str = None) -> str:
        cls._ensure_dir()
        filepath = os.path.join(cls.DEFAULT_DIR, filename or cls.DEFAULT_FILE)
        data = {
            'version': 1,
            'created_at': profile.created_at,
            'screen_width': profile.screen_width,
            'screen_height': profile.screen_height,
            'x_coefficients': profile.x_coefficients,
            'y_coefficients': profile.y_coefficients,
            'validation_error_px': profile.validation_error_px,
            'pre_correction_error_px': profile.pre_correction_error_px,
            'post_correction_error_px': profile.post_correction_error_px,
            'mean_improvement_pct': profile.mean_improvement_pct,
            'is_valid': profile.is_valid,
            'idw_power': profile.idw_power,
            'num_points': len(profile.points),
            'point_details': [
                {
                    'target': [p.target_x, p.target_y],
                    'median_gaze': [p.median_gaze_x, p.median_gaze_y],
                    'offset': [p.offset_x, p.offset_y],
                    'accuracy_px': round(p.accuracy_px, 1),
                    'num_samples': len(p.samples),
                }
                for p in profile.points
            ],
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        logger.info(f"[CALIB] Profile saved: {filepath}")
        return filepath

    @classmethod
    def load(cls, filename: str = None) -> Optional[CalibrationProfile]:
        filepath = os.path.join(cls.DEFAULT_DIR, filename or cls.DEFAULT_FILE)
        if not os.path.exists(filepath):
            return None
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
            profile = CalibrationProfile(
                created_at=data.get('created_at', ''),
                screen_width=data.get('screen_width', 1536),
                screen_height=data.get('screen_height', 782),
                x_coefficients=data.get('x_coefficients', []),
                y_coefficients=data.get('y_coefficients', []),
                validation_error_px=data.get('validation_error_px', 0),
                pre_correction_error_px=data.get('pre_correction_error_px', 0),
                post_correction_error_px=data.get('post_correction_error_px', 0),
                mean_improvement_pct=data.get('mean_improvement_pct', 0),
                is_valid=data.get('is_valid', False),
                idw_power=data.get('idw_power', 2.0),
            )
            for entry in data.get('point_details', []):
                t = entry.get('target', [0.0, 0.0])
                m = entry.get('median_gaze', [0.0, 0.0])
                o = entry.get('offset', [0.0, 0.0])
                p = CalibrationPoint(
                    target_x=float(t[0]),
                    target_y=float(t[1]),
                    samples=[],
                    median_gaze_x=float(m[0]),
                    median_gaze_y=float(m[1]),
                    offset_x=float(o[0]),
                    offset_y=float(o[1]),
                    accuracy_px=float(entry.get('accuracy_px', 0.0)),
                )
                profile.points.append(p)
            logger.info(f"[CALIB] Loaded profile: {profile.mean_improvement_pct:.0f}% improvement")
            return profile
        except Exception as e:
            logger.error(f"[CALIB] Failed to load profile: {e}")
            return None

    @classmethod
    def exists(cls, filename: str = None) -> bool:
        filepath = os.path.join(cls.DEFAULT_DIR, filename or cls.DEFAULT_FILE)
        return os.path.exists(filepath)

    @classmethod
    def delete(cls, filename: str = None):
        filepath = os.path.join(cls.DEFAULT_DIR, filename or cls.DEFAULT_FILE)
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.info(f"[CALIB] Profile deleted: {filepath}")
