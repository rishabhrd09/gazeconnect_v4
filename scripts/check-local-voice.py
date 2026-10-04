"""Finite real-model test and optional WAV sample; never uses the speakers."""
import argparse
import json
from pathlib import Path
import sys
import time
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'python'))
from services.local_voice import load_voice, synthesize, speech_chunks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sample', type=Path)
    args = parser.parse_args()
    started = time.monotonic()
    voice = load_voice()
    load_time = time.monotonic() - started
    rows = []
    import numpy as np
    for text, rate in [('This is GazeConnect. I would like some water, please.', 150),
                       ('Please check my blood pressure.', 80),
                       ('The ground floor plan is ready.', 250),
                       ('Kitchen and store. Bedroom. Staircase. Verandah.', 150)]:
        start = time.monotonic()
        audio, sample_rate = synthesize(voice, text, rate)
        assert np.max(np.abs(audio)) > .01
        rows.append({'rate': rate, 'synthesis_seconds': round(time.monotonic()-start,3),
                     'audio_seconds': round(len(audio)/sample_rate,3)})
        if args.sample and len(rows) == 1:
            args.sample.parent.mkdir(parents=True, exist_ok=True)
            with wave.open(str(args.sample), 'wb') as wav:
                wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(sample_rate)
                wav.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
    print(json.dumps({'voice': 'af_heart', 'load_seconds':round(load_time,3), 'checks': rows}, indent=2))

if __name__ == '__main__':
    main()
