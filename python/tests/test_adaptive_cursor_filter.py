import math
import os
import pathlib
import sys
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from services.adaptive_cursor_filter import (  # noqa: E402
    AdaptiveCursorFilter, FILTER_PROFILES, JUMP_MAX_PX, LEGACY_FILTER_PROFILES, NOISE_MAX_PX,
    NOISE_MIN_PX, NOISE_PRIOR_PX, active_filter_profiles)
from gaze_filter_bench import (  # noqa: E402
    MEASURED_SIGMA_PX, NoiseSource, fixation, run_filter, steady_metrics)

MINIMUM_TARGET_PITCH_PX = 80
KEY_PITCH_PX = 171               # Smallest key pitch on the traditional keyboard at 1920x1040.
TRACKER_HZ = 33.0
INSTANT_MODES = ('responsive', 'balanced')      # A jump is shown on the sample that reveals it.
CONFIRMING_MODES = ('stable', 'gentle')         # A jump must persist first; excursions never show.


def measured_fixation(location: str, seed: int, seconds: float = 6.0, rho: float = 0.6,
                      spikes: float = 0.0, scale: float = 1.0):
    sigma_x, sigma_y = MEASURED_SIGMA_PX[location]
    noise = NoiseSource(seed, (sigma_x * scale, sigma_y * scale), rho, spikes)
    return fixation(location, (960.0, 540.0), seconds, noise)


def settled(preset: str, hz: float = TRACKER_HZ, seconds: float = 1.5):
    f = AdaptiveCursorFilter(preset, FILTER_PROFILES)
    count = int(seconds * hz)
    for i in range(count):
        f.update(500, 500, i / hz, 'key')
    return f, count


class AdaptiveCursorFilterTests(unittest.TestCase):
    def test_exactly_four_modes_with_legacy_aliases(self):
        self.assertEqual(set(FILTER_PROFILES), {'responsive', 'balanced', 'stable', 'gentle'})
        self.assertEqual(AdaptiveCursorFilter('als_early').preset, 'balanced')
        self.assertEqual(AdaptiveCursorFilter('als_late').preset, 'gentle')

    def test_elapsed_time_response_is_independent_of_sample_rate(self):
        # A small step stays inside the constant settle time region. Sampling
        # that same physical signal at 30/60/120 Hz must produce the same result.
        outputs = []
        for hz in (30, 60, 120):
            f = AdaptiveCursorFilter()
            f.update(0, 0, 0)
            for i in range(1, hz + 1):
                out = f.update(10, 0, i / hz)
            outputs.append(out[0])
        self.assertLess(max(outputs) - min(outputs), 1e-8)

    def test_step_settles_quickly_without_overshoot_in_every_mode(self):
        for preset in FILTER_PROFILES:
            with self.subTest(preset=preset):
                f = AdaptiveCursorFilter(preset)
                f.update(100, 100, 0)
                last = 100
                for i in range(1, 13):
                    x, y = f.update(900, 500, i / 60)
                    self.assertGreaterEqual(x, last)
                    self.assertLessEqual(x, 900)
                    self.assertLessEqual(y, 500)
                    last = x
                self.assertLess(900 - last, 10)  # <1.25% of the 800px travel at 200ms.

    def test_fixation_jitter_is_reduced_and_large_movement_releases_hold(self):
        f = AdaptiveCursorFilter()
        f.update(500, 500, 0, 'key')
        outputs = []
        for i in range(1, 61):
            outputs.append(f.update(500 + math.sin(i * 2) * 2,
                                    500 + math.cos(i * 2) * 2, i / 60, 'key')[0])
        self.assertLess(max(outputs) - min(outputs), 2)
        self.assertEqual(f.zone, 'lock')
        x, _ = f.update(650, 500, 61 / 60, 'other-key')
        self.assertGreater(x, 600)
        self.assertNotEqual(f.zone, 'lock')

    def test_no_target_never_locks_and_slow_intent_remains_reachable(self):
        f = AdaptiveCursorFilter('gentle')
        f.update(0, 0, 0)
        for i in range(1, 121):
            x, _ = f.update(i / 2, 0, i / 60)
            self.assertNotEqual(f.zone, 'lock')
        self.assertGreater(x, 55)

    def test_gap_resets_old_fixation_and_bad_data_cannot_poison_state(self):
        f = AdaptiveCursorFilter()
        f.update(20, 40, 1)
        self.assertEqual(f.update(100, 200, 1.2), (100, 200))
        self.assertEqual(f.update(0, 0, 1.1), (100, 200))
        with self.assertRaises(ValueError):
            f.update(float('nan'), 200, 1.3)
        self.assertTrue(all(math.isfinite(v) for v in f.update(101, 201, 1.3)))

    # --- On a target: fixation mean under the measured Eye Tracker 5 noise ---

    def test_previous_hold_thresholds_never_engage_under_measured_noise(self):
        # The defect behind the flicker: a 2.5 px hold radius against a 5-18 px
        # spread is unreachable, so the cursor mirrored the jitter throughout.
        for location in MEASURED_SIGMA_PX:
            with self.subTest(location=location):
                result = run_filter(lambda: AdaptiveCursorFilter('balanced', LEGACY_FILTER_PROFILES),
                                    measured_fixation(location, 11))
                self.assertEqual(steady_metrics(result)['locked_pct'], 0.0)

    def test_every_mode_is_calm_and_centred_under_measured_noise(self):
        # Frame-to-frame motion is what reads as flicker. Bounds sit above the
        # worst of 60 seeded fixations per mode (4.8 / 3.3 / 2.4 / 1.7 px).
        motion_limit_px = {'responsive': 6.0, 'balanced': 4.5, 'stable': 3.3, 'gentle': 2.6}
        for preset in FILTER_PROFILES:
            for location in MEASURED_SIGMA_PX:
                for seed in (23, 24, 25):
                    with self.subTest(preset=preset, location=location, seed=seed):
                        trace = measured_fixation(location, seed)
                        new = steady_metrics(run_filter(
                            lambda: AdaptiveCursorFilter(preset, FILTER_PROFILES), trace))
                        old = steady_metrics(run_filter(
                            lambda: AdaptiveCursorFilter(preset, LEGACY_FILTER_PROFILES), trace))
                        self.assertLess(new['out_step_rms'], motion_limit_px[preset])
                        self.assertLess(new['out_step_rms'], 0.65 * old['out_step_rms'])
                        self.assertGreaterEqual(new['locked_pct'], 90.0)
                        self.assertLess(new['bias'], 8.0)     # Centred on the fixation, not frozen off it.

    def test_modes_are_ordered_from_quickest_to_calmest(self):
        motion = []
        for preset in ('responsive', 'balanced', 'stable', 'gentle'):
            result = run_filter(lambda: AdaptiveCursorFilter(preset, FILTER_PROFILES),
                                measured_fixation('centre', 31))
            motion.append(steady_metrics(result)['out_step_rms'])
        self.assertEqual(motion, sorted(motion, reverse=True))
        self.assertGreater(motion[0], 1.5 * motion[-1])

    def test_a_move_to_another_key_shows_on_the_sample_that_reveals_it(self):
        # No confirmation delay in the two everyday modes. On the 21 Sep live
        # recording the cursor arrived with the raw stream on all 32 moves.
        for hz in (33.0, 133.0):
            for preset in INSTANT_MODES:
                for size in (KEY_PITCH_PX, 110, 400):
                    with self.subTest(hz=hz, preset=preset, size=size):
                        f, count = settled(preset, hz)
                        self.assertEqual(f.zone, 'lock')
                        self.assertEqual(f.update(500 + size, 500, count / hz, 'key'), (500 + size, 500))

    def test_the_unsmoothed_tracker_stream_gets_one_sample_of_confirmation(self):
        for preset in INSTANT_MODES:
            with self.subTest(preset=preset):
                f, count = settled(preset)
                f.raw_stream = True
                # A single-sample glitch (one of 629 px was recorded) never shows.
                self.assertEqual(f.update(1100, 500, count / TRACKER_HZ, 'key'), (500, 500))
                self.assertEqual(f.update(500, 500, (count + 1) / TRACKER_HZ, 'key'), (500, 500))
                self.assertEqual(f.zone, 'lock')
                # A real move shows on its second sample, 30 ms later.
                self.assertEqual(f.update(500 + KEY_PITCH_PX, 500, (count + 2) / TRACKER_HZ, 'key'), (500, 500))
                self.assertEqual(f.update(500 + KEY_PITCH_PX, 500, (count + 3) / TRACKER_HZ, 'key'),
                                 (500 + KEY_PITCH_PX, 500))
                f.raw_stream = False
                f.configure(preset)
                self.assertFalse(f.raw_stream)       # Off unless the tracker says otherwise.

    def test_steadier_modes_confirm_a_move_by_elapsed_time_not_sample_count(self):
        for hz in (33.0, 133.0):
            for preset in CONFIRMING_MODES:
                with self.subTest(hz=hz, preset=preset):
                    f, count = settled(preset, hz)
                    confirm_ms = FILTER_PROFILES[preset].confirm_ms
                    shown_after = None
                    for k in range(int(0.3 * hz)):
                        x, _ = f.update(500 + KEY_PITCH_PX, 500, (count + k) / hz, 'key')
                        if x != 500:
                            shown_after = k * 1000 / hz
                            break
                    self.assertIsNotNone(shown_after)
                    self.assertGreaterEqual(shown_after + 1e-6, confirm_ms)
                    self.assertLessEqual(shown_after, confirm_ms + 1000 / hz + 1e-6)
                    self.assertEqual(x, 500 + KEY_PITCH_PX)

    def test_every_mode_reaches_a_neighbouring_key_within_100ms(self):
        for preset in FILTER_PROFILES:
            with self.subTest(preset=preset):
                f, count = settled(preset)
                for k in range(4):  # 0, 30, 61 and 91 ms after the eye moved.
                    x, _ = f.update(500 + KEY_PITCH_PX, 500, (count + k) / TRACKER_HZ, 'key')
                self.assertEqual(x, 500 + KEY_PITCH_PX)

    def test_no_mode_traps_a_smaller_sustained_move(self):
        # Below a jump the cursor glides. It must still get there, including to
        # a neighbour at the minimum target pitch. (Measured: 121/152/212/303 ms.)
        arrive_by_ms = {'responsive': 200, 'balanced': 260, 'stable': 350, 'gentle': 450}
        for preset, limit in arrive_by_ms.items():
            for size in (100, MINIMUM_TARGET_PITCH_PX, 45, 30):
                if size >= FILTER_PROFILES[preset].jump_px:
                    continue
                with self.subTest(preset=preset, size=size):
                    f, count = settled(preset)
                    arrived, last = None, 500.0
                    for k in range(int(1.2 * TRACKER_HZ)):
                        x, _ = f.update(500 + size, 500, (count + k) / TRACKER_HZ, 'key')
                        self.assertGreaterEqual(x + 1e-9, last)          # A glide never backs up...
                        self.assertLessEqual(x, 500 + size + 1e-9)       # ...or overshoots.
                        last = x
                        if arrived is None and abs(x - 500 - size) <= 0.25 * size:
                            arrived = k * 1000 / TRACKER_HZ
                    self.assertIsNotNone(arrived)
                    self.assertLessEqual(arrived, limit)
                    self.assertAlmostEqual(x, 500 + size, delta=3.0)

    def test_a_one_eyed_excursion_drags_the_cursor_far_less_than_it_moved(self):
        # The artefact behind the juggling at the bottom of the screen, as
        # recorded live on 21 Sep: the estimate darts ~60 px sideways for a few
        # samples and returns. Shown as a jump it was a flash there and back.
        drag_limit_px = {'responsive': 40, 'balanced': 34, 'stable': 28, 'gentle': 24}
        original = AdaptiveCursorFilter('balanced', LEGACY_FILTER_PROFILES)
        for i in range(50):
            original.update(500, 500, i / TRACKER_HZ, 'key')
        original_drag = max(original.update(560, 500, (50 + k) / TRACKER_HZ, 'key')[0] - 500 for k in range(3))
        self.assertGreater(original_drag, 50)
        for preset, limit in drag_limit_px.items():
            with self.subTest(preset=preset):
                f, count = settled(preset)
                drag = max(f.update(560, 500, (count + k) / TRACKER_HZ, 'key')[0] - 500 for k in range(3))
                self.assertLess(drag, limit)
                self.assertLess(drag, 0.7 * original_drag)
                for k in range(3, 3 + int(1.2 * TRACKER_HZ)):      # Time for the calmest mode's window too.
                    x, _ = f.update(500, 500, (count + k) / TRACKER_HZ, 'key')
                self.assertAlmostEqual(x, 500, delta=3.0)
                self.assertEqual(f.zone, 'lock')                         # The fixation was never abandoned.

    def test_an_isolated_excursion_is_undone_and_the_fixation_survives(self):
        for preset in FILTER_PROFILES:
            with self.subTest(preset=preset):
                f, count = settled(preset)
                during = f.update(650, 500, count / TRACKER_HZ, 'key')
                self.assertEqual(during, (650, 500) if preset in INSTANT_MODES else (500, 500))
                after = f.update(500, 500, (count + 1) / TRACKER_HZ, 'key')
                self.assertEqual(after, (500, 500))
                # The interrupted fixation resumes with what it had averaged:
                # a fresh one would follow this sample half way.
                x, _ = f.update(512, 500, (count + 2) / TRACKER_HZ, 'key')
                self.assertLess(x - 500, 3.0)
                self.assertEqual(f.zone, 'lock')

    def test_thresholds_follow_the_noise_of_the_tracker_itself(self):
        def noise_after(scale):
            f = AdaptiveCursorFilter('balanced', FILTER_PROFILES)
            for s in measured_fixation('centre', 5, 12.0, scale=scale):
                f.update(s.x, s.y, s.t, s.target)
            return f.noise_px
        quiet, measured, noisy = noise_after(0.4), noise_after(1.0), noise_after(1.6)
        self.assertLess(quiet, 0.6 * NOISE_PRIOR_PX)
        self.assertAlmostEqual(measured, NOISE_PRIOR_PX, delta=3.5)
        self.assertGreater(noisy, 1.35 * NOISE_PRIOR_PX)
        self.assertGreaterEqual(quiet, NOISE_MIN_PX)
        self.assertLessEqual(noisy, NOISE_MAX_PX)
        # Whatever the noise, a move to another key is always a jump, and a
        # jump always starts above the recorded ~60 px one-eyed excursions.
        self.assertLess(JUMP_MAX_PX, KEY_PITCH_PX)
        for profile in FILTER_PROFILES.values():
            self.assertGreaterEqual(profile.jump_px, 100)
            self.assertLessEqual(profile.jump_px, JUMP_MAX_PX)

    def test_a_noisier_signal_is_handled_better_than_by_fixed_pixel_thresholds(self):
        trace = measured_fixation('top_right', 41, scale=1.5)
        new = steady_metrics(run_filter(lambda: AdaptiveCursorFilter('balanced', FILTER_PROFILES), trace))
        old = steady_metrics(run_filter(lambda: AdaptiveCursorFilter('balanced', LEGACY_FILTER_PROFILES), trace))
        self.assertLess(new['out_step_rms'], 0.6 * old['out_step_rms'])

    def test_a_blink_length_gap_keeps_a_fixation_on_a_target_but_not_off_one(self):
        f, count = settled('balanced')
        resumed = f.update(518, 500, count / TRACKER_HZ + 0.300, 'key')
        self.assertLess(resumed[0] - 500, 6.0)        # One noisy sample, not a re-seed.
        self.assertEqual(f.zone, 'lock')
        f, count = settled('balanced')                 # Up to 1 s (the interface's own horizon)...
        self.assertLess(f.update(518, 500, count / TRACKER_HZ + 0.800, 'key')[0] - 500, 6.0)
        f, count = settled('balanced')                 # ...but not beyond it.
        self.assertEqual(f.update(518, 500, count / TRACKER_HZ + 1.100, 'key'), (518, 500))
        off_target = AdaptiveCursorFilter('balanced', FILTER_PROFILES)
        off_target.update(500, 500, 0)
        self.assertEqual(off_target.update(518, 500, 0.300), (518, 500))

    def test_snapshot_and_restore_round_trip(self):
        f, _ = settled('balanced')
        state, before = f.snapshot(), f.estimate
        f.reset()
        self.assertIsNone(f.estimate)
        f.restore(state)
        self.assertEqual(f.estimate, before)
        self.assertEqual(f.zone, 'lock')

    def test_legacy_tuning_is_selectable_for_comparison_and_rollback(self):
        with mock.patch.dict(os.environ, {'GAZECONNECT_CURSOR_TUNING': 'legacy'}):
            self.assertIs(active_filter_profiles(), LEGACY_FILTER_PROFILES)
            self.assertEqual(AdaptiveCursorFilter('balanced').profile, LEGACY_FILTER_PROFILES['balanced'])
        with mock.patch.dict(os.environ, {'GAZECONNECT_CURSOR_TUNING': ''}):
            self.assertIs(active_filter_profiles(), FILTER_PROFILES)
        for preset, profile in FILTER_PROFILES.items():
            legacy = LEGACY_FILTER_PROFILES[preset]
            # Off a target the 14 Sep low pass is untouched in every mode.
            self.assertEqual((profile.settle_ms, profile.travel_ms, profile.hold_px, profile.release_px,
                              profile.settle_before_hold_ms, profile.travel_start_px, profile.travel_full_px),
                             (legacy.settle_ms, legacy.travel_ms, legacy.hold_px, legacy.release_px,
                              legacy.settle_before_hold_ms, legacy.travel_start_px, legacy.travel_full_px))
            self.assertEqual(legacy.fixation_ms, 0)
        frozen = AdaptiveCursorFilter('balanced', LEGACY_FILTER_PROFILES)
        for i in range(30):
            frozen.update(500 + math.sin(i) * 2, 500, i / 60, 'key')
        self.assertEqual(frozen.zone, 'lock')
        self.assertEqual(frozen.update(503, 500, 0.6, 'key'), frozen.update(497, 500, 0.62, 'key'))


if __name__ == '__main__':
    unittest.main()
