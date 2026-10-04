"""Finite Windows toolchain checks; files avoid PowerShell 5.1 inline-code quoting."""
import argparse
import importlib
import json
import platform
import struct
import sys

MINIMUM = (3, 10)


def describe():
    """This interpreter, as the Windows scripts compare and record it."""
    info = {
        'python': platform.python_version(),
        'version': list(sys.version_info[:3]),
        'bits': struct.calcsize('P') * 8,
        'machine': platform.machine(),
        'executable': sys.executable,
        # In a virtual environment: the interpreter it was made from.
        'base_executable': getattr(sys, '_base_executable', sys.executable),
        'in_venv': sys.prefix != sys.base_prefix,
    }
    info['supported'] = (sys.version_info[:2] >= MINIMUM and info['bits'] == 64
                         and info['machine'].lower() in ('amd64', 'x86_64'))
    return info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--probe', action='store_true',
                        help='print this interpreter as JSON and exit 0, supported or not')
    parser.add_argument('--imports', action='store_true')
    parser.add_argument('--pyinstaller', action='store_true')
    args = parser.parse_args()
    info = describe()
    if args.probe:
        print(json.dumps(info))
        return
    if not info['supported']:
        raise RuntimeError(
            f"Python 3.10+ x64 is required (Python 3.12 x64 is the validation baseline), but "
            f"{info['executable']} is Python {info['python']} ({info['bits']}-bit, {info['machine']}).")
    if args.pyinstaller:
        import PyInstaller
        if int(PyInstaller.__version__.split('.')[0]) != 6:
            raise RuntimeError('PyInstaller 6.x is required; rerun setup.bat.')
    if args.imports:
        for name in ('websockets', 'kokoro_onnx', 'sounddevice', 'espeakng_loader', 'comtypes', 'pyautogui', 'aiohttp', 'flask',
                     'flask_cors', 'cairo', 'ezdxf', 'PIL', 'numpy', 'svgwrite', 'shapely',
                     'networkx', 'squarify', 'onnxruntime', 'ortools.sat.python.cp_model'):
            importlib.import_module(name)
    print(json.dumps({'python': info['python'], 'bits': info['bits'],
                      'imports_checked': args.imports, 'pyinstaller_checked': args.pyinstaller}))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        raise SystemExit(f'Python readiness check failed: {exc}') from exc
