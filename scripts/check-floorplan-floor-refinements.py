"""Regression checks for the real parser; drawing/Cairo output is not exercised."""
from __future__ import annotations

import copy
import importlib.util
import io
import sys
import types
import unittest
from contextlib import redirect_stdout
from pathlib import Path

# Parsing does not call Cairo. Let these geometry tests run on development
# hosts without the Windows rendering dependency, without changing production imports.
if importlib.util.find_spec("cairo") is None:
    sys.modules["cairo"] = types.ModuleType("cairo")

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("gazeconnect_floorplan_parser_test", ROOT / "tools" / "gazeconnect_floorplan_v5.py")
GENERATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = GENERATOR
SPEC.loader.exec_module(GENERATOR)


def parsed(payload):
    with redirect_stdout(io.StringIO()):
        return GENERATOR.parse({"compass_map": payload})


def fixture():
    floor = {"placements": [{"roomId": "drawing", "room": "Drawing Room", "cells": ["r1_c1", "r1_c2"], "area_sqft": 300}]}
    return {
        "plot": {"width_ft": 40, "depth_ft": 60, "facing": "North", "type": "Middle Plot"},
        "grid_size": {"rows": 4, "cols": 4},
        "ground_floor": copy.deepcopy(floor), "first_floor": copy.deepcopy(floor),
    }


class FloorRefinementTests(unittest.TestCase):
    def test_different_refinements_on_same_cell_are_isolated(self):
        payload = fixture()
        payload["ground_floor"]["advanced_refinements"] = {"voidMarkers": [{"cell": "r1_c1", "type": "open_to_below"}]}
        payload["first_floor"]["advanced_refinements"] = {"subCellSplits": [{"parentCell": "r1_c1", "splitDirection": "vertical", "roomA": "bedroom", "roomB": "bathroom", "roomAPct": 50}]}
        unchanged = copy.deepcopy(payload)
        ground, first = parsed(payload)
        self.assertEqual([ground.label, first.label], ["Ground Floor", "First Floor"])
        self.assertEqual({room.rid for room in ground.rooms}, {"drawing", "void"})
        self.assertEqual({room.rid for room in first.rooms}, {"drawing", "bedroom", "bathroom"})
        bedroom = next(room for room in first.rooms if room.rid == "bedroom")
        bathroom = next(room for room in first.rooms if room.rid == "bathroom")
        self.assertEqual((bedroom.x1, bedroom.y1, bedroom.x2, bedroom.y2), (0, 0, 5, 15))
        self.assertEqual((bathroom.x1, bathroom.y1, bathroom.x2, bathroom.y2), (5, 0, 10, 15))
        self.assertEqual(payload, unchanged)

    def test_legacy_top_level_refinements_still_apply_to_both_floors(self):
        payload = fixture()
        payload["advanced_refinements"] = {"voidMarkers": [{"cell": "r1_c1"}]}
        for floor in parsed(payload):
            self.assertEqual({room.rid for room in floor.rooms}, {"drawing", "void"})

    def test_explicit_empty_floor_set_overrides_legacy_set(self):
        payload = fixture()
        payload["advanced_refinements"] = {"voidMarkers": [{"cell": "r1_c1"}]}
        payload["first_floor"]["advanced_refinements"] = {}
        ground, first = parsed(payload)
        self.assertIn("void", {room.rid for room in ground.rooms})
        self.assertEqual({room.rid for room in first.rooms}, {"drawing"})
        self.assertEqual(sum(room.area for room in first.rooms), 300)

    def test_floor_specific_wall_edges_do_not_cross_floors(self):
        payload = fixture()
        payload["first_floor"]["advanced_refinements"] = {"customEdges": [{"type": "no_wall", "cells": ["r1_c1", "r1_c2"]}]}
        ground, first = parsed(payload)
        self.assertEqual(ground.no_wall_edges, [])
        self.assertEqual(first.no_wall_edges, [((10, 0), (10, 15))])


if __name__ == "__main__":
    unittest.main(verbosity=2)
