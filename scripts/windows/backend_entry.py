"""Frozen backend entry point with an offline packaged-dependency smoke check."""
import json
import sys
from pathlib import Path


def self_test():
    import aiohttp
    import comtypes
    import pyautogui
    import pyttsx3.drivers.sapi5
    import websockets
    from ml.inference import NeuralPredictor
    from prediction_guardrails import is_blocked_prediction_word
    import services.word_prediction as prediction

    root = Path(prediction.__file__).resolve().parent.parent
    json.loads((root / "data" / "smart_bigrams.json").read_text(encoding="utf-8"))
    model = NeuralPredictor()
    if not model.load():
        raise RuntimeError("Bundled neural model failed to load")
    print(json.dumps({"self_test": "passed", "neural_model": "loaded", "assets": "present"}))


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        from main import main
        main()
