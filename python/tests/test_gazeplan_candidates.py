"""Contract checks for the conservative Compass Map candidate generator."""

from __future__ import annotations

import copy
import unittest

from gazeplan_engine_v5.candidates import _door_issues, adjust_layout_candidate, generate_layout_candidates


def sample_map() -> dict:
    return {
        "grid_size": {"rows": 4, "cols": 4},
        "plot": {"width_ft": 40, "depth_ft": 60, "facing": "East"},
        "ground_floor": {
            "placements": [
                {"room": "Living Hall", "roomId": "living", "cells": ["r1_c1", "r1_c2", "r2_c1", "r2_c2"]},
                {"room": "Bedroom", "roomId": "bedroom", "cells": ["r1_c3", "r1_c4", "r2_c3", "r2_c4"]},
                {"room": "Kitchen", "roomId": "kitchen", "cells": ["r3_c1", "r3_c2", "r4_c1", "r4_c2"]},
                {"room": "Bathroom", "roomId": "bathroom", "cells": ["r3_c3", "r3_c4", "r4_c3", "r4_c4"]},
            ]
        },
    }


class CandidateTests(unittest.TestCase):
    def test_four_distinct_valid_layouts_preserve_placement_identity(self) -> None:
        source = sample_map()
        untouched = copy.deepcopy(source)
        result = generate_layout_candidates(source)
        self.assertEqual(source, untouched)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(len(result["candidates"]), 4)
        self.assertEqual(len({c["id"] for c in result["candidates"]}), 4)
        self.assertEqual([c["id"] for c in result["candidates"]], [c["id"] for c in generate_layout_candidates(source)["candidates"]])
        for candidate in result["candidates"]:
            self.assertTrue(candidate["validation"]["valid"])
            self.assertTrue(candidate["validation"]["preliminary_only"])
            floor = candidate["floors"]["ground_floor"]
            self.assertEqual([p["roomId"] for p in floor["placements"]], ["living", "bedroom", "kitchen", "bathroom"])
            self.assertEqual(len({p["placementId"] for p in floor["placements"]}), 4)
            self.assertEqual(len(floor["doorOpenings"]), 4)
            for room in floor["placements"]:
                self.assertEqual(len(room["geometryRects"]), len(room["cells"]))
                self.assertAlmostEqual(
                    room["area_sqft"],
                    sum((r["x2"] - r["x1"]) * (r["y2"] - r["y1"]) for r in room["geometryRects"]),
                    places=2,
                )
        self.assertEqual(result["candidates"][0]["profile"], "faithful")
        self.assertEqual(result["candidates"][0]["changes"], [])

    def test_room_size_adjustment_is_real_and_bounded(self) -> None:
        base = generate_layout_candidates(sample_map())["candidates"][0]
        original_area = base["floors"]["ground_floor"]["placements"][0]["area_sqft"]
        result = adjust_layout_candidate(
            base["compass_map"],
            {"floor": "ground_floor", "placementId": "ground_floor:p1", "action": "room_size", "direction": "E", "amount_ft": 1},
        )
        self.assertEqual(result["status"], "ok")
        self.assertTrue(result["candidate"]["validation"]["valid"])
        adjusted_area = result["candidate"]["floors"]["ground_floor"]["placements"][0]["area_sqft"]
        self.assertAlmostEqual(adjusted_area - original_area, 30)
        self.assertEqual(
            adjust_layout_candidate(base["compass_map"], {"floor": "ground_floor", "placementId": "ground_floor:p1", "action": "room_size", "direction": "E", "amount_ft": 5})["status"],
            "invalid_adjustment",
        )
        self.assertEqual(
            adjust_layout_candidate(base["compass_map"], {"floor": "ground_floor", "placementId": "ground_floor:p1", "action": "stairs", "direction": "E", "amount_ft": 1})["status"],
            "unsupported_adjustment",
        )

    def test_unrenderable_saved_refinement_is_rejected(self) -> None:
        source = sample_map()
        source["ground_floor"]["advanced_refinements"] = {"customEdges": [{"boundary": ["r1_c1", "right"], "type": "no_wall"}]}
        result = generate_layout_candidates(source)
        self.assertEqual(result["status"], "unsupported_refinements")
        self.assertEqual(result["candidates"], [])
        source = sample_map()
        source["ground_floor"]["refinements"] = {"accessibilityMarkers": [{"cell": "r1_c1", "type": "wide_door"}]}
        self.assertEqual(generate_layout_candidates(source)["status"], "unsupported_refinements")
        source = sample_map()
        source["ground_floor"]["advanced_refinements"] = {"version": 2, "subCellSplits": [], "customEdges": [], "voidMarkers": [], "cellRotations": [], "cellExpansions": [], "caregiverAnnotations": [], "vastuFlags": [], "accessibilityMarkers": [], "cellLayouts": {}}
        self.assertEqual(generate_layout_candidates(source)["status"], "ok")

    def test_duplicate_cell_and_disconnected_access_are_rejected(self) -> None:
        source = sample_map()
        source["ground_floor"]["placements"][1]["cells"].append("r1_c1")
        self.assertEqual(generate_layout_candidates(source)["status"], "invalid_input")

        source = sample_map()
        source["ground_floor"]["placements"] = [
            {"room": "Living Hall", "roomId": "living", "cells": ["r1_c1"]},
            {"room": "Bedroom", "roomId": "bedroom", "cells": ["r4_c4"]},
        ]
        result = generate_layout_candidates(source)
        self.assertEqual(result["status"], "infeasible")
        self.assertTrue(result["rejected"][0]["issues"])

    def test_unaligned_two_floor_stairs_are_rejected(self) -> None:
        source = sample_map()
        source["ground_floor"]["placements"][0] = {"room": "Living and Staircase", "roomId": "staircase", "cells": ["r1_c1", "r1_c2", "r2_c1", "r2_c2"]}
        source["first_floor"] = {"placements": [{"room": "1F Stair Landing", "roomId": "ff_stairLanding", "cells": ["r4_c4"]}]}
        result = generate_layout_candidates(source)
        self.assertEqual(result["status"], "infeasible")
        self.assertTrue(any("do not overlap" in issue for issue in result["rejected"][0]["issues"]))

    def test_aligned_two_floor_stairs_are_preserved(self) -> None:
        source = sample_map()
        source["ground_floor"]["placements"][0] = {"room": "Living and Staircase", "roomId": "staircase", "cells": ["r1_c1", "r1_c2", "r2_c1", "r2_c2"]}
        source["first_floor"] = {"placements": [
            {"room": "1F Stair Landing", "roomId": "ff_stairLanding", "cells": ["r1_c1"]},
            {"room": "1F Bedroom", "roomId": "ff_bed2", "cells": ["r1_c2", "r1_c3"]},
            {"room": "1F Bathroom", "roomId": "ff_bathroom", "cells": ["r2_c1", "r2_c2"]},
        ]}
        result = generate_layout_candidates(source)
        self.assertEqual(result["status"], "ok")
        self.assertGreaterEqual(len(result["candidates"]), 1)
        for candidate in result["candidates"]:
            self.assertEqual(candidate["metrics"]["access"]["first_floor"]["reachable_rooms"], 3)
            self.assertEqual(candidate["floors"]["first_floor"]["placements"][0]["cells"], ["r1_c1"])

    def test_stairs_need_a_usable_shared_footprint(self) -> None:
        source = sample_map()
        source["plot"]["num_floors"] = "Multi-Floor"
        source["ground_floor"]["placements"][0] = {
            "room": "Staircase", "roomId": "staircase", "cells": ["r1_c1"]
        }
        source["ground_floor"]["placements"].append({
            "room": "Living Hall", "roomId": "living2", "cells": ["r1_c2", "r2_c1", "r2_c2"]
        })
        source["first_floor"] = {"placements": [
            {"room": "Stair Landing", "roomId": "ff_stairLanding", "cells": ["r1_c2"],
             "geometryRects": [{"cell": "r1_c2", "x1": 8, "y1": 0, "x2": 20, "y2": 15}]},
            {"room": "Bedroom", "roomId": "ff_bedroom", "cells": ["r1_c1"],
             "geometryRects": [{"cell": "r1_c1", "x1": 0, "y1": 0, "x2": 8, "y2": 15}]},
        ]}
        result = generate_layout_candidates(source)
        self.assertEqual(result["status"], "infeasible")
        self.assertTrue(any("common 3 × 6 ft footprint" in issue for issue in result["rejected"][0]["issues"]))

    def test_exterior_entry_matches_selected_gate(self) -> None:
        source = sample_map()
        for position, minimum, maximum in (("Left", 0, 10), ("Center", 15, 25), ("Right", 30, 40)):
            source["plot"]["gate_position"] = position
            result = generate_layout_candidates(source)
            self.assertEqual(result["status"], "ok")
            doors = result["candidates"][0]["floors"]["ground_floor"]["doorOpenings"]
            exterior = [door for door in doors if door["fromPlacementId"] == "outside"]
            self.assertEqual(len(exterior), 1)
            self.assertGreaterEqual(exterior[0]["x1"], minimum)
            self.assertLessEqual(exterior[0]["x2"], maximum)

        source["plot"]["gate_position"] = "Left"
        source["ground_floor"]["placements"] = [
            {"room": "Bedroom", "roomId": "bedroom", "cells": ["r1_c4"]},
        ]
        result = generate_layout_candidates(source)
        self.assertEqual(result["status"], "infeasible")
        self.assertTrue(any("left main gate" in issue for issue in result["rejected"][0]["issues"]))

    def test_multi_floor_request_requires_first_floor_placements(self) -> None:
        source = sample_map()
        source["plot"]["num_floors"] = "Multi-Floor"
        result = generate_layout_candidates(source)
        self.assertEqual(result["status"], "invalid_input")
        self.assertTrue(any("first-floor" in detail for detail in result["details"]))

    def test_porch_is_open_to_road_without_fictitious_exterior_door(self) -> None:
        source = sample_map()
        source["plot"]["gate_position"] = "Right"
        source["ground_floor"]["placements"] = [
            {"roomId": "porch", "room": "Porch", "cells": ["r1_c4"]},
            {"roomId": "living", "room": "Living", "cells": ["r1_c3"]},
        ]
        result = generate_layout_candidates(source)
        self.assertEqual(result["status"], "ok")
        doors = result["candidates"][0]["floors"]["ground_floor"]["doorOpenings"]
        self.assertEqual(len(doors), 1)
        self.assertNotEqual(doors[0]["fromPlacementId"], "outside")
        self.assertTrue(any("unassigned" in warning for warning in result["warnings"]))

    def test_sliver_gap_and_misplaced_door_are_detected(self) -> None:
        result = generate_layout_candidates(sample_map())
        candidate = result["candidates"][0]
        floor = copy.deepcopy(candidate["floors"]["ground_floor"])
        floor["doorOpenings"][0]["x1"] += 1
        self.assertTrue(_door_issues("ground_floor", floor, candidate["compass_map"]["plot"]))

        corrupted = copy.deepcopy(candidate["compass_map"])
        corrupted["ground_floor"]["placements"][0]["geometryRects"][0]["x2"] -= 0.25
        failed = generate_layout_candidates(corrupted)
        self.assertEqual(failed["status"], "infeasible")
        self.assertTrue(any("gap" in detail for detail in failed["details"]))


if __name__ == "__main__":
    unittest.main()
