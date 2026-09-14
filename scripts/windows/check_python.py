"""Finite Windows toolchain checks; files avoid PowerShell 5.1 inline-code quoting."""
import argparse
import importlib
import json
import platform
import struct
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--imports', action='store_true')
    parser.add_argument('--pyinstaller', action='store_true')
    args = parser.parse_args()
    if sys.version_info < (3, 10) or struct.calcsize('P') != 8 or platform.machine().lower() not in ('amd64', 'x86_64'):
        raise RuntimeError('Python 3.10+ x64 is required. Python 3.12 x64 is the validation baseline.')
    if args.pyinstaller:
        import PyInstaller
        if int(PyInstaller.__version__.split('.')[0]) != 6:
            raise RuntimeError('PyInstaller 6.x is required; rerun setup.bat.')
    if args.imports:
        for name in ('websockets', 'pyttsx3', 'comtypes', 'pyautogui', 'aiohttp', 'flask',
                     'flask_cors', 'cairo', 'ezdxf', 'PIL', 'numpy', 'svgwrite', 'shapely',
                     'networkx', 'squarify', 'onnxruntime', 'ortools.sat.python.cp_model'):
            importlib.import_module(name)
    print(json.dumps({'python': sys.version.split()[0], 'bits': struct.calcsize('P') * 8,
                      'imports_checked': args.imports, 'pyinstaller_checked': args.pyinstaller}))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        raise SystemExit(f'Python readiness check failed: {exc}') from exc
