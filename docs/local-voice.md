# Local voice: Kokoro af_heart

All app-authored speech uses **Kokoro-82M v1.0 ONNX**, CPU int8, **af_heart**, US English. This includes keyboard/Zone Board speech, care phrases, People, Compass/survey narration, news and Settings voice tests. Music/video audio is media content and is unaffected. There is no system voice or browser SpeechSynthesis fallback, API key, runtime model download, GPU or PyTorch dependency.

## Assets and provenance

The model and single voice are committed under `python/assets/kokoro` (92,883,626 bytes combined). Ordinary Git clone supplies the real files, without LFS or an additional setup download. `manifest.json` records the immutable upstream revision, original hashes and bundled hashes; both runtime loading and the installer validator verify them. The voice is the upstream float32 vector reshaped into an NPZ with one `af_heart` key, not retrained or modified.

- [ONNX model and voices](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/1939ad2a8e416c0acfeecc08a694d14ef25f2231)
- [Original model](https://huggingface.co/hexgrad/Kokoro-82M): Apache-2.0.
- [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx): MIT runtime wrapper.

The pronunciation libraries and audio runtime have separate licenses, recorded alongside the assets. In particular phonemizer/eSpeak NG are GPL components; the model's Apache license does not relicense them. Installer distribution retains the existing third-party license/source review. No claim of legal clearance for proprietary distribution is made by the engineering checks.

## Runtime and controls

`services/local_voice.py` loads one model in one spawned worker. ONNX uses CPU only, one intra/inter-op thread, sequential execution, no idle spinning and no CPU memory arena. Phonemization, synthesis and audio device access are outside the gaze event loop. A monitor thread exchanges bounded messages; no tracker code, dwell timing, hit testing, layout, prediction algorithm or cursor filtering is changed.

Each request replaces older speech. A generation counter immediately invalidates old synthesis and pending audio; the PortAudio callback checks it every 480 frames (20 ms at 24 kHz), subject to the device's output buffering. The parent retains one pending request and the IPC queue holds one. There is no growing narration backlog. Messages over 12,000 characters are rejected with a visible instruction to split them, never silently truncated. Inference is divided into at most 80-character segments at sentence/word boundaries. This bounds per-call memory and permits cancellation between segments; a native inference call already running is discarded on completion. Startup and synthesis watchdogs stop a stuck worker after 60/45 seconds, with an explicit next-Speak retry.

150 in Voice Settings maps to natural Kokoro speed 1.0; 80–250 maps proportionally to speed. Actual WPM depends on text and prosody. Volume zero stops active and pending speech. Changing rate/volume otherwise applies to the next message. No alternate voice is selected if a speaker/model fails: the app displays a noninteractive status message. A disconnected or old backend cannot fall back to SAPI/browser narration. Spoken-message history remains local as before.

## Setup and packaging

After pulling this branch on Windows:

```cmd
setup.bat
check-windows.bat
start-dev.bat
```

Setup installs pinned Kokoro, phonemizer/eSpeak loader and sounddevice dependencies; the model is already in the checkout. The installer and frozen-voice CI share `Get-KokoroBundleArguments` to package the same voice files, pronunciation data/native libraries and PortAudio. `backend_entry.py --self-test` performs real offline inference and loads the audio library without opening a speaker. The standalone frozen smoke check also runs inference in a spawned child, exercising the Windows freeze-support path.

## Verification and limits

Local validation on the development Mac: real-model inference at settings 80/150/250, waveform/sample-rate checks, spawned-worker lifecycle, burst replacement, Stop during startup/synthesis/playback simulation, mute, missing assets, clean shutdown, frontend routing and browser action checks. All 61 existing gaze-safety regressions and 17 dwell/preference regressions passed. Gaze transport and backend lifecycle/prediction checks also passed. Logs for this run are `/tmp/gaze-kokoro-*.log` (local evidence, not distributed).

The short-utterance inference probe peaked at about 470 MiB RSS on this Mac; the 80-character chunk probe at the slowest rate peaked at about 716 MiB. These are voice-process measurements, not total app memory or a Windows performance guarantee. First-use warmup and neural synthesis take measurable time; they are not promised to match system-TTS response time. A sample can be generated without playing it:

```cmd
python\.venv\Scripts\python.exe scripts\check-local-voice.py --sample tools\reports\af-heart.wav
```

Hardware output routing, perceived voice quality, speech latency and Tobii comfort still need checking on the Windows 11 laptop. CI can validate model inference, packaging and transport without establishing those hardware outcomes.
