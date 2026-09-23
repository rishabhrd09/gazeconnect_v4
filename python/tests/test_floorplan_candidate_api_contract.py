"""Check that the candidate API validates the original Compass Map payload."""

from __future__ import annotations

import copy
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest import mock


SERVER_PATH = Path(__file__).resolve().parents[2] / "tools" / "floorplan_server.py"


class _FakeFlask:
    def route(self, *_args, **_kwargs):
        return lambda function: function

    def errorhandler(self, *_args, **_kwargs):
        return lambda function: function


def _module(name: str, **members: object) -> types.ModuleType:
    result = types.ModuleType(name)
    result.__dict__.update(members)
    return result


class CandidateApiContractTests(unittest.TestCase):
    def test_candidate_endpoint_does_not_fuse_or_reassign_cells(self) -> None:
        source = {
            "grid_size": {"rows": 4, "cols": 4},
            "plot": {"width_ft": 40, "depth_ft": 60, "facing": "East"},
            "ground_floor": {"placements": [
                {"roomId": "living", "cells": ["r1_c1"]},
                {"roomId": "bedroom", "cells": ["r1_c1"]},
            ]},
        }
        payload = {
            "compass_map": source,
            "survey_data": {"answers": {
                "plot_width_ft": "50", "plot_depth_ft": "80", "road_facing": "West Facing",
            }},
        }
        original = copy.deepcopy(payload)
        received = []

        def candidate_engine(compass_map, **_kwargs):
            received.append(compass_map)
            return {"status": "invalid_input", "error": "Duplicate cell", "details": ["r1_c1 is assigned twice"]}

        def forbid_fusion(*_args, **_kwargs):
            raise AssertionError("Candidate API must not run survey fusion")

        package = _module("gazeplan_engine_v5")
        package.__path__ = []
        fake_modules = {
            "flask": _module("flask", Flask=lambda _name: _FakeFlask(),
                             request=types.SimpleNamespace(get_json=lambda **_kwargs: payload),
                             jsonify=lambda value: value, send_file=lambda *_args, **_kwargs: None),
            "flask_cors": _module("flask_cors", CORS=lambda *_args, **_kwargs: None),
            "gazeconnect_floorplan_v5": _module("gazeconnect_floorplan_v5", parse=lambda *_args: [],
                                                CairoFloorPlan=object, Fl=object),
            "floorplan_fusion_v1": _module("floorplan_fusion_v1", fuse_floorplan_inputs=forbid_fusion,
                                           pick_style_from_context=lambda *_args: "modern"),
            "gazeplan_engine_v5": package,
            "gazeplan_engine_v5.engine": _module("gazeplan_engine_v5.engine", generate_floorplan_v5=lambda *_args: {}),
            "gazeplan_engine_v5.candidates": _module("gazeplan_engine_v5.candidates", generate_layout_candidates=candidate_engine),
        }
        with mock.patch.dict(sys.modules, fake_modules):
            spec = importlib.util.spec_from_file_location("floorplan_candidate_api_contract", SERVER_PATH)
            self.assertIsNotNone(spec)
            self.assertIsNotNone(spec.loader)
            server = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(server)
            response, status = server.generate_candidates_api()

        self.assertEqual(status, 422)
        self.assertEqual(response["code"], "invalid_input")
        self.assertEqual(len(received), 1)
        self.assertEqual(received[0], source)
        self.assertIsNot(received[0], source)
        self.assertEqual(received[0]["plot"], {"width_ft": 40, "depth_ft": 60, "facing": "East"})
        self.assertEqual(received[0]["ground_floor"]["placements"][1]["cells"], ["r1_c1"])
        self.assertEqual(payload, original)


if __name__ == "__main__":
    unittest.main()
