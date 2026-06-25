"""TTSEngine.available — the health flag the 'connected' handshake reports.

The frontend routes English speech to the backend ONLY when this flag is
true; a wrong True with a dead engine means a silently mute patient, a wrong
False merely demotes to the browser voice. So the flag must be False for
every deterministic no-audio configuration.

Run as a plain script (no pytest on this machine):
    python\\.venv\\Scripts\\python.exe python\\tests\\test_tts_available.py
"""

import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

import main  # noqa: E402
from main import TTSEngine  # noqa: E402


class TTSAvailableTests(unittest.TestCase):
    def test_disabled_engine_reports_unavailable(self):
        engine = TTSEngine(enabled=False)
        self.assertFalse(engine.available)

    def test_missing_pyttsx3_reports_unavailable(self):
        original = main.TTS_AVAILABLE
        try:
            main.TTS_AVAILABLE = False
            engine = TTSEngine(enabled=True)
            self.assertFalse(engine.available)
        finally:
            main.TTS_AVAILABLE = original

    def test_init_failure_reports_unavailable(self):
        engine = TTSEngine(enabled=False)  # avoid spawning a real worker
        engine.enabled = True
        engine.init_failed = True
        self.assertFalse(engine.available)

    @unittest.skipUnless(main.TTS_AVAILABLE, "pyttsx3 not installed")
    def test_async_engine_reports_available(self):
        engine = TTSEngine(enabled=True)
        if engine.async_mode:
            self.assertIsNotNone(engine._queue)
        self.assertTrue(engine.available)

    def test_handshake_field_serializable(self):
        engine = TTSEngine(enabled=False)
        self.assertIsInstance(engine.available, bool)


if __name__ == "__main__":
    unittest.main(verbosity=2)
