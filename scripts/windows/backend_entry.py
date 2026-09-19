"""Frozen backend entry point with an offline packaged-dependency smoke check."""
import json
import multiprocessing
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
    print(json.dumps({"self_test": "passed", "neural_model": "loaded", "assets": "present",
                      "deterministic_prediction": deterministic_self_test()}))


def deterministic_self_test():
    """The default word predictor: verified tables, one inline and one worker-process answer."""
    import asyncio
    import tempfile
    from services.deterministic_prediction.assets_loader import verify_assets
    from services.deterministic_prediction.learning import PredictionLearningStore
    from services.deterministic_prediction.service import WordPredictionService

    verified = verify_assets()
    with tempfile.TemporaryDirectory() as state_dir:
        store = PredictionLearningStore(Path(state_dir))
        store.load()
        inline = WordPredictionService(store, execution="inline").predict_sync("self-test", "i need wa", 10, True)
        service = WordPredictionService(store, execution="process")
        service.start()
        try:
            worker = asyncio.run(asyncio.wait_for(service.predict("self-test", "i need wa", 10, True), 60))
        finally:
            service.shutdown()
    if not inline["ranked"] or worker is None or worker["slots"] != inline["slots"]:
        raise RuntimeError("Deterministic word prediction self-test failed")
    return {"assets": len(verified), "slots": inline["slots"]}


if __name__ == "__main__":
    # A spawned prediction worker re-enters this frozen executable; this hands it
    # to multiprocessing instead of starting a second backend.
    multiprocessing.freeze_support()
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        from main import main
        main()
