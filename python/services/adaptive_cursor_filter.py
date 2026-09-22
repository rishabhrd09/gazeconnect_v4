"""Original elapsed-time cursor smoother. No prediction or gaze-to-target warping.

Off a target the filter is a first-order low pass: alpha = 1 - exp(-dt / tau).
Large position errors reduce tau for prompt travel; small errors receive
damping. Dwell ownership and timing remain the renderer's responsibility. All
distances are CSS pixels.

On an acquired target the cursor is the running mean of the current fixation.
A live recording of the Eye Tracker 5 (21 Sep 2026, 1920x1040 content, 33 Hz,
maintainer typing by gaze) spreads a steady fixation by 8-13 px per axis, so a
fixed low pass must choose between visible shimmer and lag. A fixation mean
does not have to:

  * a sample a clear target-to-target distance from the mean is a new fixation
    and is shown at once, with no confirmation delay: across 32 recorded eye
    movements the cursor arrived on the same sample as the raw stream. If the
    very next sample returns to the interrupted fixation, the jump is undone;
  * within a fixation the gain falls as 1, 1/2, 1/3 ... down to an averaging
    window, so the cursor is calm without creeping towards the key;
  * anything smaller than a jump is followed by a quick glide, not a hop.

Why the jump distance is a target pitch and not a multiple of the noise: near
the bottom of the screen that recording shows 16-23 transient excursions a
minute, ~61 px (up to 215 px), horizontal, lasting 2-7 samples - the tracker
briefly estimating from one eye. Shown as jumps they were a flash there and
back every few seconds; too long-lived for a confirmation delay to hide
without adding lag to every real move. They are smaller than the keyboard's
171-190 px key pitch, so jumps start above them and below that pitch. On the
recording this cut false hops at the bottom from 15 to about 1 per minute with
the cursor still 0 ms behind the raw stream. A running estimate of the
tracker's own noise still scales the smaller thresholds and lifts the jump
distance for a noisier signal.

Steadier modes also confirm a jump for one or two samples before showing it.
"""
from dataclasses import dataclass
import math
import os
from typing import Optional, Tuple


@dataclass(frozen=True)
class CursorProfile:
    settle_ms: float
    travel_ms: float
    hold_px: float
    release_px: float
    settle_before_hold_ms: float
    fixation_ms: float = 0.0   # Averaging window on a target; 0 keeps the 14 Sep hold.
    jump_px: float = 110.0     # A sample this far from the mean is a new fixation, shown at once.
    glide_ms: float = 130.0    # How quickly a smaller sustained shift is followed.
    confirm_ms: float = 0.0    # How long a jump must persist before it is shown.
    travel_start_px: float = 12.0
    travel_full_px: float = 80.0


# settle_ms, travel_ms, hold_px, release_px, settle_before_hold_ms are the
# 14 Sep 2026 values: they drive the off-target low pass, which was not shown
# to be wrong. Then: fixation_ms, jump_px, glide_ms, confirm_ms.
FILTER_PROFILES = {
    'responsive': CursorProfile(30, 8, 1.5, 4, 90, 110, 100, 90, 0),
    'balanced': CursorProfile(55, 12, 2.5, 6, 120, 170, 110, 130, 0),
    'stable': CursorProfile(85, 16, 3.5, 8, 150, 260, 110, 170, 25),
    'gentle': CursorProfile(115, 20, 4.5, 10, 180, 380, 110, 220, 40),
}
# The 14 Sep 2026 tuning: a 2.5 px hold that the measured noise never lets
# engage. GAZECONNECT_CURSOR_TUNING=legacy selects it for an on-rig comparison
# or a rollback without a rebuild; it reproduces the previous behaviour exactly.
LEGACY_FILTER_PROFILES = {
    'responsive': CursorProfile(30, 8, 1.5, 4, 90),
    'balanced': CursorProfile(55, 12, 2.5, 6, 120),
    'stable': CursorProfile(85, 16, 3.5, 8, 150),
    'gentle': CursorProfile(115, 20, 4.5, 10, 180),
}
FILTER_ALIASES = {'normal': 'balanced', 'als_early': 'balanced', 'als_late': 'gentle'}

NOISE_PRIOR_PX = 14.0            # Radial RMS measured at screen centre.
NOISE_MIN_PX, NOISE_MAX_PX = 6.0, 24.0
NOISE_WINDOW_S = 1.5
JUMP_NOISE_SIGMA = 5.0           # A noisier signal lifts the jump distance to this many RMS...
JUMP_MAX_PX = 150.0              # ...but never to the keyboard's 171 px key pitch.
CLIP_SIGMA = 3.0                 # One wild sample cannot drag the mean further.
RECENT_MS = 90.0                 # Window of the "where has the eye been lately" mean.
CATCHUP_START, CATCHUP_FULL = 0.7, 1.5   # Lag, in noise RMS, over which the glide engages.
PROBATION_S = 0.075              # How long an undone jump can still be undone.
# A blink no longer discards a fixation. A gap reaches the filter only across a
# loss the backend resumed (python/main.py, DISPLAY_RESUME_SECONDS, 1 s); any
# other loss has already reset it. So the bridge matches that horizon.
LEGACY_GAP_S, FIXATION_GAP_S = 0.150, 1.000
# With the vendor's smoothing off, the first sample of a real eye movement is
# usually still in flight, so waiting for the second costs nothing (0 ms behind
# the raw stream at median and p90 on the 21 Sep unfiltered recording) while it
# hides the single-sample glitches that stream carries: false hops at the bottom
# of the screen fell from 9.3 to 2.1 a minute. On the smoothed stream the same
# wait costs a real 30 ms, so it applies to the raw stream only.
RAW_STREAM_CONFIRM_MS = 25.0
SAMPLE_WEIGHT_CAP_S = 0.035      # After a gap a sample is still ONE noisy measurement.


def normalize_filter_preset(value: str) -> str:
    return FILTER_ALIASES.get(value, value)


def active_filter_profiles() -> dict:
    legacy = os.environ.get('GAZECONNECT_CURSOR_TUNING', '').strip().lower() == 'legacy'
    return LEGACY_FILTER_PROFILES if legacy else FILTER_PROFILES


def _smoothstep(u: float) -> float:
    u = min(1.0, max(0.0, u))
    return u * u * (3.0 - 2.0 * u)


class AdaptiveCursorFilter:
    """Constant-memory smoother whose response depends on elapsed time."""
    def __init__(self, preset: str = 'balanced', profiles: Optional[dict] = None):
        self._profiles = profiles
        self.raw_stream = False   # True while the tracker delivers unsmoothed samples.
        self.configure(preset)

    def configure(self, preset: str):
        canonical = normalize_filter_preset(preset)
        if canonical not in FILTER_PROFILES:
            raise ValueError(f'Unknown cursor preset: {preset}')
        self.preset = canonical
        self.profile = (self._profiles or active_filter_profiles())[canonical]
        self._noise_sq = NOISE_PRIOR_PX ** 2
        self.reset()

    def reset(self):
        # The noise estimate describes the tracker and survives a reset.
        self._point = None
        self._time = None
        self._target_id = None
        self._stable_since = None
        self._fixating = False
        self._fixation_s = 0.0
        self._recent = None
        self._probation = None
        self._far_since = None
        self.zone = 'free'

    _STATE = ('_point', '_time', '_target_id', '_stable_since', '_fixating', '_fixation_s',
              '_recent', '_probation', '_far_since', 'zone')

    def snapshot(self) -> tuple:
        """Opaque state for the caller to restore() after a brief signal loss."""
        return tuple(getattr(self, name) for name in self._STATE)

    def restore(self, state: tuple):
        for name, value in zip(self._STATE, state):
            setattr(self, name, value)

    @property
    def estimate(self) -> Optional[Tuple[float, float]]:
        """Current smoothed position, or None until a sample has been seen."""
        return self._point

    @property
    def noise_px(self) -> float:
        """Running radial RMS of the tracker's fixation noise."""
        return min(NOISE_MAX_PX, max(NOISE_MIN_PX, math.sqrt(self._noise_sq)))

    def update(self, x: float, y: float, timestamp: float,
               target_id: Optional[str] = None):
        if not all(math.isfinite(v) for v in (x, y, timestamp)):
            raise ValueError('Cursor samples must be finite')
        fixation_mode = self.profile.fixation_ms > 0
        # Only a fixation that is being continued on a target is carried across
        # a blink-length gap; everything else re-seeds after 150 ms as before.
        bridging = fixation_mode and self._fixating and bool(target_id)
        if self._point is None or timestamp - self._time > (FIXATION_GAP_S if bridging else LEGACY_GAP_S):
            self._point = (x, y)
            self._time = timestamp
            self._target_id = target_id
            self._stable_since = timestamp
            self._fixating = False
            self._probation = None
            self._far_since = None
            self.zone = 'free'
            return self._point
        dt = timestamp - self._time
        if dt <= 0:
            return self._point  # Duplicate/out-of-order data never moves the cursor.
        self._time = timestamp
        if fixation_mode and target_id:
            self._target_id = target_id
            return self._update_fixation(x, y, timestamp, dt)
        self._fixating = False
        self._probation = None
        self._far_since = None
        return self._update_low_pass(x, y, timestamp, dt, target_id)

    def _update_low_pass(self, x: float, y: float, timestamp: float, dt: float,
                         target_id: Optional[str]):
        old_x, old_y = self._point
        distance = math.hypot(x - old_x, y - old_y)
        profile = self.profile
        if target_id != self._target_id:
            self.zone = 'free'
            self._stable_since = timestamp
        self._target_id = target_id
        if target_id and self.zone == 'lock' and distance <= profile.release_px:
            return self._point
        if distance > profile.hold_px or not target_id:
            self._stable_since = timestamp
            self.zone = 'free'
        elif (timestamp - self._stable_since) * 1000 >= profile.settle_before_hold_ms:
            self.zone = 'lock'
            return self._point
        # Convex interpolation cannot overshoot the current measurement. There
        # is no velocity extrapolation, gain amplification, or minimum lock time.
        span = max(1e-6, profile.travel_full_px - profile.travel_start_px)
        travel = min(1.0, max(0.0, (distance - profile.travel_start_px) / span))
        tau = (profile.settle_ms * (1 - travel) + profile.travel_ms * travel) / 1000
        alpha = -math.expm1(-dt / tau)
        self._point = (old_x + alpha * (x - old_x), old_y + alpha * (y - old_y))
        self.zone = 'travel' if travel >= 0.5 else 'settling'
        return self._point

    def _start_fixation(self, x: float, y: float, zone: str = 'travel'):
        self._point = (x, y)
        self._recent = (x, y)
        self._fixation_s = 0.0
        self._far_since = None
        self.zone = zone
        return self._point

    def _update_fixation(self, x: float, y: float, timestamp: float, dt: float):
        profile = self.profile
        if not self._fixating:
            # Arriving from the low pass: continue from where the cursor is,
            # weighted like the low pass so the gain does not step.
            self._fixating = True
            self._recent = self._point
            self._fixation_s = profile.settle_ms / 1000
        dt = min(dt, SAMPLE_WEIGHT_CAP_S)
        sigma = self.noise_px
        jump = min(JUMP_MAX_PX, max(profile.jump_px, JUMP_NOISE_SIGMA * sigma))
        mean_x, mean_y = self._point
        distance = math.hypot(x - mean_x, y - mean_y)
        if self._probation is not None:
            prev_x, prev_y, prev_s, prev_recent, prev_jump, since = self._probation
            back = math.hypot(x - prev_x, y - prev_y)
            if timestamp - since > PROBATION_S:
                self._probation = None
            elif back < prev_jump and back < distance:
                # The jump was an isolated excursion: resume the fixation it
                # interrupted, with everything that fixation had averaged.
                self._point, self._fixation_s, self._recent = (prev_x, prev_y), prev_s, prev_recent
                self._probation = None
                mean_x, mean_y, distance = prev_x, prev_y, back
            elif distance < jump:
                self._probation = None
        if distance >= jump:
            confirm_ms = max(profile.confirm_ms, RAW_STREAM_CONFIRM_MS if self.raw_stream else 0.0)
            if confirm_ms > 0:
                if self._far_since is None:
                    self._far_since = timestamp
                if (timestamp - self._far_since) * 1000 < confirm_ms:
                    return self._point  # Unconfirmed: neither follow it nor let go.
            if self._probation is None:
                self._probation = (mean_x, mean_y, self._fixation_s, self._recent, jump, timestamp)
            return self._start_fixation(x, y)
        self._far_since = None
        self._fixation_s += dt
        if self._fixation_s >= 0.100:
            # Winsorized, not censored: dropping the tails would bias the
            # estimate low and shrink every threshold that depends on it.
            capped = min(distance, 2.5 * sigma)
            self._noise_sq += -math.expm1(-dt / NOISE_WINDOW_S) * (capped * capped - self._noise_sq)
        recent_gain = -math.expm1(-dt / (RECENT_MS / 1000))
        recent_x, recent_y = self._recent
        self._recent = (recent_x + recent_gain * (x - recent_x), recent_y + recent_gain * (y - recent_y))
        lag = math.hypot(self._recent[0] - mean_x, self._recent[1] - mean_y) / sigma
        gain = max(dt / (self._fixation_s + dt), -math.expm1(-dt / (profile.fixation_ms / 1000)))
        # Several samples agreeing that the eye has settled somewhere new,
        # closer than a jump: glide there. Never a hop - at the bottom of the
        # screen most such shifts are excursions that come straight back.
        boost = _smoothstep((lag - CATCHUP_START) / (CATCHUP_FULL - CATCHUP_START))
        glide = -math.expm1(-dt / (profile.glide_ms / 1000))
        if boost > 0 and glide > gain:
            gain += (glide - gain) * boost
        # One wild sample cannot drag the mean. Once the recent samples agree
        # with it, it is not wild, and capping it would only slow the glide.
        clip = CLIP_SIGMA * sigma
        if distance > clip:
            gain *= (clip + boost * (distance - clip)) / distance
        self._point = (mean_x + gain * (x - mean_x), mean_y + gain * (y - mean_y))
        self.zone = 'lock' if self._fixation_s * 1000 >= profile.settle_before_hold_ms else 'settling'
        return self._point
