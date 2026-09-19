"""Locate, verify and load the versioned deterministic-prediction assets.

Assets are produced by tools/prediction/export_reference_tables.mjs from the
pinned GazeCompass commit recorded in assets/manifest.json. They live next to
this package, so the same relative path works from a source checkout and from
the PyInstaller onedir bundle (``--add-data`` keeps the folder layout).
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, Optional

ASSET_VERSION = 'v1'
ASSET_NAMES = ('index', 'context_priors', 'distilled_continuations', 'shared_english', 'semantic', 'engine_tables')


class AssetError(RuntimeError):
    pass


def default_asset_dir() -> Path:
    return Path(__file__).resolve().parent / 'assets'


def load_manifest(asset_dir: Optional[Path] = None) -> Dict[str, Any]:
    directory = asset_dir or default_asset_dir()
    path = directory / 'manifest.json'
    if not path.is_file():
        raise AssetError(f'Missing deterministic prediction manifest: {path}')
    return json.loads(path.read_text(encoding='utf-8'))


def asset_path(name: str, asset_dir: Optional[Path] = None) -> Path:
    return (asset_dir or default_asset_dir()) / f'{name}.{ASSET_VERSION}.json'


def load_asset(name: str, asset_dir: Optional[Path] = None) -> Any:
    path = asset_path(name, asset_dir)
    if not path.is_file():
        raise AssetError(f'Missing deterministic prediction asset: {path}')
    with path.open('r', encoding='utf-8') as handle:
        return json.load(handle)


def verify_assets(asset_dir: Optional[Path] = None) -> Dict[str, str]:
    """Hash every shipped asset against the manifest. Used by self-tests, not per request."""
    directory = asset_dir or default_asset_dir()
    manifest = load_manifest(directory)
    verified: Dict[str, str] = {}
    for file_name, info in manifest.get('assets', {}).items():
        path = directory / file_name
        if not path.is_file():
            raise AssetError(f'Missing asset listed in manifest: {file_name}')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != info.get('sha256'):
            raise AssetError(f'Asset hash mismatch for {file_name}')
        verified[file_name] = digest
    for name in ASSET_NAMES:
        if f'{name}.{ASSET_VERSION}.json' not in verified:
            raise AssetError(f'Manifest does not list required asset {name}')
    return verified
