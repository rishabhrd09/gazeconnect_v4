#!/usr/bin/env python3
"""Fail closed on missing/corrupt Windows release inputs; never executes vendor DLLs."""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

TOBII_DLLS = (
    "Tobii.Interaction.Net.dll", "Tobii.Interaction.Model.dll",
    "Tobii.EyeX.Client.dll", "Tobii.EyeX.Common.dll", "tobii_stream_engine.dll",
    "Tobii.Tech.NETCommon.ClrExtensions.dll",
)
NATIVE_X64 = {"Tobii.EyeX.Client.dll", "tobii_stream_engine.dll"}
ASSETS = ("data/smart_bigrams.json", "ml/trained_models/vocabulary.json",
          "ml/trained_models/gazeconnect_lm_quantized.onnx")
# Deterministic word prediction (default engine): versioned tables checked
# against their manifest hashes, plus the English-only display policy.
PREDICTION_ASSET_DIR = "services/deterministic_prediction/assets"
PREDICTION_ASSETS = tuple(f"{name}.v1.json" for name in (
    "index", "context_priors", "distilled_continuations", "shared_english", "semantic", "engine_tables"))
ENGLISH_ONLY_POLICY = "services/deterministic_prediction/english_only_policy.v1.json"


def require_file(path: Path) -> Path:
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError(f"Missing or empty required file: {path}")
    return path


def pe_machine(path: Path) -> int:
    """Read DOS/PE headers without loading code; reject truncated/non-PE files."""
    with require_file(path).open("rb") as stream:
        dos = stream.read(64)
        if len(dos) < 64 or dos[:2] != b"MZ":
            raise ValueError(f"Not a Windows PE binary: {path}")
        offset = struct.unpack_from("<I", dos, 60)[0]
        if offset < 64 or offset > path.stat().st_size - 24:
            raise ValueError(f"Invalid PE header offset: {path}")
        stream.seek(offset)
        header = stream.read(24)
        if header[:4] != b"PE\0\0":
            raise ValueError(f"Invalid PE signature: {path}")
        return struct.unpack_from("<H", header, 4)[0]


def verify_dlls(root: Path) -> dict[str, str]:
    hashes = {}
    for name in TOBII_DLLS:
        path = root / name
        machine = pe_machine(path)
        # Managed AnyCPU assemblies commonly have an I386 PE header.
        if machine not in (0x14C, 0x8664) or (name in NATIVE_X64 and machine != 0x8664):
            raise ValueError(f"Wrong architecture for win-x64: {path} (0x{machine:04x})")
        hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def verify_prediction_assets(root: Path) -> None:
    directory = root / PREDICTION_ASSET_DIR
    manifest = json.loads(require_file(directory / "manifest.json").read_text(encoding="utf-8"))
    listed = {name: info.get("sha256") for name, info in (manifest.get("assets") or {}).items()}
    listed.update(manifest.get("licenceFiles") or {})
    for name in PREDICTION_ASSETS:
        if name not in listed:
            raise ValueError(f"Prediction manifest does not list {name}")
    for name, expected in listed.items():
        if hashlib.sha256(require_file(directory / name).read_bytes()).hexdigest() != expected:
            raise ValueError(f"Prediction asset hash mismatch: {name}")
    policy = json.loads(require_file(root / ENGLISH_ONLY_POLICY).read_text(encoding="utf-8"))
    if not policy.get("withheldRomanizedHindi"):
        raise ValueError(f"Empty English-only policy: {root / ENGLISH_ONLY_POLICY}")


def verify_assets(root: Path) -> None:
    for asset in ASSETS:
        path = require_file(root / asset)
        if path.suffix == ".json":
            json.loads(path.read_text(encoding="utf-8"))
    verify_prediction_assets(root)


def verify_stage(root: Path, packaged: bool = False) -> dict[str, str]:
    helper = root / ("tobii-helper" if packaged else "tobii-dist")
    python = root / ("python" if packaged else "python-dist")
    hashes = verify_dlls(helper)
    for executable in (helper / "TobiiGazeHelper.exe",
                       python / "backend/GazeConnectBackend.exe",
                       python / "floorplan/GazeConnectFloorplan.exe"):
        if pe_machine(executable) != 0x8664:
            raise ValueError(f"Expected win-x64 executable: {executable}")
    require_file(helper / "coreclr.dll")
    require_file(helper / "hostpolicy.dll")
    runtime = json.loads(require_file(helper / "TobiiGazeHelper.runtimeconfig.json").read_text(encoding="utf-8-sig"))["runtimeOptions"]
    if runtime.get("framework") or runtime.get("frameworks") or not runtime.get("includedFrameworks"):
        raise ValueError("Tobii helper is framework-dependent; self-contained runtime is mandatory")
    if runtime.get("tfm") != "net8.0":
        raise ValueError("Unexpected helper runtime target; review target/support policy before release")
    verify_assets(python / "backend/_internal")
    for name in ("backend", "floorplan"):
        internal = python / name / "_internal"
        if not list(internal.glob("python3*.dll")):
            raise ValueError(f"Missing bundled Python runtime: {internal}")
    return hashes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("dlls", "source", "stage", "packaged"))
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args()
    if args.mode == "dlls":
        hashes = verify_dlls(args.root)
    elif args.mode == "source":
        hashes = verify_dlls(args.root / "tobii-helper/TobiiGazeHelper/lib")
        verify_assets(args.root / "python")
    else:
        hashes = verify_stage(args.root, packaged=args.mode == "packaged")
    print(json.dumps({"result": "verified", "mode": args.mode, "vendor_sha256": hashes}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError) as exc:
        raise SystemExit(f"[FAIL] {exc}") from exc
