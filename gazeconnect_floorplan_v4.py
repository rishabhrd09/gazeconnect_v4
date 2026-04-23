#!/usr/bin/env python3
"""
Compatibility launcher.

Allows running from repo root:
  python gazeconnect_floorplan_v4.py ...

Internally forwards to:
  tools/gazeconnect_floorplan_v5.py
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent
    target = root / "tools" / "gazeconnect_floorplan_v5.py"
    if not target.exists():
        raise SystemExit(f"Missing target script: {target}")
    sys.argv[0] = str(target)
    runpy.run_path(str(target), run_name="__main__")


if __name__ == "__main__":
    main()

