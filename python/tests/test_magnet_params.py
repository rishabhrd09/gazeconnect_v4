"""set_magnet_params (B1-BE) — runtime magnetism tuning.

Shipped defaults are class constants; the WS message mutates only the live
copies (restart restores defaults). Clamps keep every combination
escapable: release is always >= radius.
"""

import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from main import GazeConnectBackend, ServerConfig  # noqa: E402


class MagnetParamsTests(unittest.TestCase):
    def _backend(self) -> GazeConnectBackend:
        cfg = ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False)
        return GazeConnectBackend(cfg)

    def test_shipped_defaults_match_audited_values(self):
        backend = self._backend()
        params_map, default_params = backend._get_magnet_params()
        self.assertEqual(params_map["gazetoggle"],
                         {"radius": 165.0, "pull": 0.34, "release": 185.0, "capture_full": True})
        self.assertEqual(params_map["keyboard"],
                         {"radius": 72.0, "pull": 0.32, "release": 88.0, "capture_full": False})
        self.assertEqual(default_params,
                         {"radius": 62.0, "pull": 0.22, "release": 82.0, "capture_full": False})

    def test_named_context_tunes_only_itself(self):
        backend = self._backend()
        backend._set_magnet_params({
            "context": "gazetoggle", "radius": 90, "pull": 0.22,
            "release": 110, "capture_full": False,
        })
        params_map, _ = backend._get_magnet_params()
        self.assertEqual(params_map["gazetoggle"],
                         {"radius": 90.0, "pull": 0.22, "release": 110.0, "capture_full": False})
        # Other contexts untouched (the plan's must-not-move gate).
        self.assertEqual(params_map["keyboard"],
                         {"radius": 72.0, "pull": 0.32, "release": 88.0, "capture_full": False})
        self.assertEqual(params_map["prediction"]["pull"], 0.48)

    def test_clamps_and_release_floor(self):
        backend = self._backend()
        backend._set_magnet_params({"context": "gazetoggle", "radius": 9999, "pull": -5, "release": 1})
        params_map, _ = backend._get_magnet_params()
        entry = params_map["gazetoggle"]
        self.assertEqual(entry["radius"], 300.0)   # clamped high
        self.assertEqual(entry["pull"], 0.05)      # clamped low
        self.assertEqual(entry["release"], 300.0)  # floored to radius

    def test_unknown_context_and_bad_values_are_safe(self):
        backend = self._backend()
        before, before_default = backend._get_magnet_params()
        snapshot = {k: dict(v) for k, v in before.items()}
        backend._set_magnet_params({"context": "nope", "radius": 10})
        backend._set_magnet_params({"context": "keyboard", "radius": "not-a-number"})
        after, _ = backend._get_magnet_params()
        self.assertEqual(after["keyboard"], snapshot["keyboard"])  # bad value ignored
        self.assertEqual(after, {**snapshot, "keyboard": snapshot["keyboard"]})

    def test_default_context_tunable(self):
        backend = self._backend()
        backend._set_magnet_params({"context": "default", "pull": 0.1})
        _, default_params = backend._get_magnet_params()
        self.assertEqual(default_params["pull"], 0.1)

    def test_apply_magnetism_smoke_no_targets(self):
        backend = self._backend()
        self.assertEqual(backend._apply_magnetism(100.0, 100.0), (100.0, 100.0))


if __name__ == "__main__":
    unittest.main()
