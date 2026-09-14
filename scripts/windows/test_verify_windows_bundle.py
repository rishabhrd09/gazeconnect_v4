"""Portable failure-injection tests for the Windows release validator."""
import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("bundle", Path(__file__).parents[1] / "verify_windows_bundle.py")
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


def pe(path, machine=0x8664):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = bytearray(88)
    data[:2] = b"MZ"
    struct.pack_into("<I", data, 60, 64)
    data[64:68] = b"PE\0\0"
    struct.pack_into("<H", data, 68, machine)
    path.write_bytes(data)


class BundleValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.helper = self.root / "tobii-dist"
        for name in bundle.TOBII_DLLS:
            pe(self.helper / name, 0x8664 if name in bundle.NATIVE_X64 else 0x14C)

    def stage(self):
        pe(self.helper / "TobiiGazeHelper.exe")
        for name in ("coreclr.dll", "hostpolicy.dll"):
            pe(self.helper / name)
        self.config = self.helper / "TobiiGazeHelper.runtimeconfig.json"
        self.config.write_text(json.dumps({"runtimeOptions": {"tfm": "net8.0", "includedFrameworks": [{"name": "Microsoft.NETCore.App", "version": "8.0.0"}]}}))
        for name, exe in (("backend", "GazeConnectBackend"), ("floorplan", "GazeConnectFloorplan")):
            root = self.root / "python-dist" / name
            pe(root / (exe + ".exe"))
            pe(root / "_internal/python312.dll")
        for relative in bundle.ASSETS:
            asset = self.root / "python-dist/backend/_internal" / relative
            asset.parent.mkdir(parents=True, exist_ok=True)
            asset.write_text("{}" if asset.suffix == ".json" else "model")

    def test_valid_managed_anycpu_and_native_x64(self):
        self.assertEqual(len(bundle.verify_dlls(self.helper)), 6)

    def test_missing_dll_stops_release(self):
        (self.helper / bundle.TOBII_DLLS[0]).unlink()
        with self.assertRaisesRegex(ValueError, "Missing"):
            bundle.verify_dlls(self.helper)

    def test_native_x86_stops_release(self):
        pe(self.helper / "Tobii.EyeX.Client.dll", 0x14C)
        with self.assertRaisesRegex(ValueError, "Wrong architecture"):
            bundle.verify_dlls(self.helper)

    def test_corrupt_and_invalid_pe_headers(self):
        path = self.helper / bundle.TOBII_DLLS[0]
        for data in (b"not a dll", b"MZ" + b"\0" * 86):
            path.write_bytes(data)
            with self.assertRaises(ValueError):
                bundle.verify_dlls(self.helper)

    def test_complete_self_contained_stage(self):
        self.stage()
        self.assertEqual(len(bundle.verify_stage(self.root)), 6)

    def test_framework_dependent_stage_rejected(self):
        self.stage()
        self.config.write_text(json.dumps({"runtimeOptions": {"tfm": "net8.0", "framework": {"name": "Microsoft.NETCore.App", "version": "8.0.0"}}}))
        with self.assertRaisesRegex(ValueError, "framework-dependent"):
            bundle.verify_stage(self.root)

    def test_missing_prediction_asset_rejected(self):
        self.stage()
        (self.root / "python-dist/backend/_internal" / bundle.ASSETS[2]).unlink()
        with self.assertRaisesRegex(ValueError, "Missing"):
            bundle.verify_stage(self.root)

    def test_missing_floorplan_python_runtime_rejected(self):
        self.stage()
        (self.root / "python-dist/floorplan/_internal/python312.dll").unlink()
        with self.assertRaisesRegex(ValueError, "Python runtime"):
            bundle.verify_stage(self.root)

    def test_actual_packaged_resource_layout(self):
        self.stage()
        self.helper.rename(self.root / "tobii-helper")
        (self.root / "python-dist").rename(self.root / "python")
        self.assertEqual(len(bundle.verify_stage(self.root, packaged=True)), 6)


if __name__ == "__main__":
    unittest.main()
