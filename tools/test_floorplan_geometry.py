"""Geometry contracts shared by candidate preview and exported plan sheets."""

import pathlib
import sys
import types
import unittest
from unittest.mock import patch


TOOLS = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

from floorplan_fusion_v1 import fuse_floorplan_inputs  # noqa: E402

try:
    import cairo  # noqa: F401
    from gazeconnect_floorplan_v5 import CairoFloorPlan, Fl, _wall_segments, parse  # noqa: E402
except ModuleNotFoundError as exc:
    if exc.name != "cairo":
        raise
    # The geometry contract is testable on macOS hosts without PyCairo. Actual
    # PNG/PDF/SVG drawing is checked on the Windows target with PyCairo present.
    with patch.dict(sys.modules, {"cairo": types.SimpleNamespace()}):
        from gazeconnect_floorplan_v5 import CairoFloorPlan, Fl, _wall_segments, parse  # noqa: E402


class FloorplanGeometryTests(unittest.TestCase):
    def test_fusion_preserves_floor_refinements_and_exact_l_shape_area(self):
        compass = {
            "plot": {"width_ft": 20, "depth_ft": 20},
            "grid_size": {"rows": 2, "cols": 2},
            "ground_floor": {
                "placements": [{"placementId": "ground:0", "roomId": "living", "room": "Living",
                                "cells": ["r1_c1", "r1_c2", "r2_c1"]}],
                "advanced_refinements": {"version": 2, "customEdges": [{"id": "ground-edge"}]},
                "cell_layouts": {"r1_c1": "left"},
            },
            "first_floor": {
                "placements": [{"placementId": "first:0", "roomId": "bedroom", "room": "Bedroom",
                                "cells": ["r1_c1"]}],
                "advanced_refinements": {"version": 2, "customEdges": []},
            },
        }
        fused, _ = fuse_floorplan_inputs(compass)
        ground = fused["ground_floor"]
        self.assertEqual(ground["placements"][0]["area_sqft"], 300)
        self.assertEqual(ground["placements"][0]["placementId"], "ground:0")
        self.assertEqual(ground["advanced_refinements"]["customEdges"][0]["id"], "ground-edge")
        self.assertEqual(ground["cell_layouts"], {"r1_c1": "left"})
        self.assertEqual(fused["first_floor"]["advanced_refinements"], {"version": 2, "customEdges": []})
        self.assertEqual(ground["empty_cells"], ["r2_c2"])

    def test_candidate_rectangles_and_validated_door_override_coarse_cells(self):
        compass = {
            "plot": {"width_ft": 20, "depth_ft": 10},
            "grid_size": {"rows": 1, "cols": 2},
            "ground_floor": {
                "placements": [
                    {"placementId": "ground:0", "roomId": "living", "room": "Living",
                     "cells": ["r1_c1"], "geometryRects": [{"cell": "r1_c1", "x1": 0, "y1": 0, "x2": 8, "y2": 10}]},
                    {"placementId": "ground:1", "roomId": "bedroom", "room": "Bedroom",
                     "cells": ["r1_c2"], "geometryRects": [{"x1": 8, "y1": 0, "x2": 20, "y2": 10}]},
                ],
                "doorOpenings": [{"x1": 8, "y1": 3.6, "x2": 8, "y2": 6.4}],
            },
        }
        fused, _ = fuse_floorplan_inputs(compass)
        self.assertEqual(fused["ground_floor"]["placements"][0]["area_sqft"], 80)
        self.assertEqual(fused["ground_floor"]["placements"][0]["geometryRects"][0]["cell"], "r1_c1")
        self.assertEqual(len(fused["ground_floor"]["doorOpenings"]), 1)
        floor = parse({"compass_map": fused})[0]
        self.assertEqual((floor.rooms[0].x1, floor.rooms[0].x2), (0, 8))
        self.assertEqual((floor.rooms[1].x1, floor.rooms[1].x2), (8, 20))
        shared = [s for s in _wall_segments(floor) if s["kind"] == "interior"]
        self.assertEqual(len(shared), 1)
        self.assertEqual((shared[0]["x1"], shared[0]["y1"], shared[0]["y2"]), (8, 0, 10))
        renderer = CairoFloorPlan(floor)
        drawn = []
        renderer._draw_door_span = lambda _ctx, span, side: drawn.append((span, side))
        renderer._doors(None)
        self.assertEqual(len(drawn), 1)
        self.assertEqual(renderer._unassigned_area(), 0)

    def test_door_outside_a_wall_fails_instead_of_rendering_false_opening(self):
        floor = parse({"plot": {"width_ft": 20, "depth_ft": 10},
                       "grid_size": {"rows": 1, "cols": 2},
                       "ground_floor": {"placements": [
                           {"roomId": "living", "room": "Living", "cells": ["r1_c1"]},
                       ], "doorOpenings": [{"x1": 15, "y1": 3, "x2": 15, "y2": 6}]}})[0]
        renderer = CairoFloorPlan(floor)
        with self.assertRaisesRegex(ValueError, "not on a built wall"):
            renderer._doors(None)

    def test_l_shaped_room_has_true_area_and_no_internal_seam(self):
        floor = parse({"plot": {"width_ft": 20, "depth_ft": 20},
                       "grid_size": {"rows": 2, "cols": 2},
                       "ground_floor": {"placements": [
                           {"placementId": "ground:living", "roomId": "living", "room": "Living",
                            "cells": ["r1_c1", "r1_c2", "r2_c1"]},
                       ]}})[0]
        self.assertEqual(sum(room.area for room in floor.rooms), 300)
        self.assertEqual(len([s for s in _wall_segments(floor) if s["kind"] == "interior"]), 0)
        self.assertEqual(CairoFloorPlan(floor)._unassigned_area(), 100)

    def test_legacy_no_wall_uses_selected_boundary(self):
        floor = parse({"plot": {"width_ft": 20, "depth_ft": 10},
                       "grid_size": {"rows": 1, "cols": 2},
                       "ground_floor": {"placements": [
                           {"roomId": "living", "room": "Living", "cells": ["r1_c1"]},
                           {"roomId": "bedroom", "room": "Bedroom", "cells": ["r1_c2"]},
                       ], "advanced_refinements": {
                           "customEdges": [{"type": "no_wall", "boundary": ["r1_c1", "right"],
                                            "cells": ["r1_c1", "r1_c1"]}],
                       }}})[0]
        self.assertFalse([s for s in _wall_segments(floor) if s["kind"] == "interior"])

    def test_main_gate_marker_uses_saved_frontage_position(self):
        for position, fraction in (("Left", 0.125), ("Center", 0.5), ("Right", 0.875)):
            with self.subTest(position=position):
                floor = parse({"plot": {"width_ft": 40, "depth_ft": 60,
                                        "gate_position": position},
                               "grid_size": {"rows": 4, "cols": 4},
                               "ground_floor": {"placements": []}})[0]
                self.assertEqual(floor.gate_position, position)
                left, right = CairoFloorPlan(floor)._gate_span()
                self.assertAlmostEqual((left + right) / 2, 40 * fraction)
                self.assertGreaterEqual(left, 0)
                self.assertLessEqual(right, 40)
        # The road is still shown as orientation context upstairs, but the
        # ground-level gate symbol must not appear on the first-floor sheet.
        CairoFloorPlan(Fl(label="First Floor", gate_position="Left"))._gate_marker(None)


if __name__ == "__main__":
    unittest.main()
