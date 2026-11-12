"""The first floor over the ground floor (12 Nov 2026, docs/compass-refine/FIRST_FLOOR_RULES.md), in compass_schema.

Fixture f17's conflicts are compared by test_compass_geometry (as for every fixture); here its notes (warnings), which
scripts/check-compass-first-floor.cjs compares the same way for the TypeScript copy, and the words a refusal uses.
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import compass_schema as schema  # noqa: E402

FIXTURE = Path(__file__).parent / 'fixtures' / 'compass' / 'f17_first_floor_rules.json'


class FirstFloorRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases = {c['name']: c for c in json.loads(FIXTURE.read_text(encoding='utf-8'))['cases']}

    def test_the_notes_of_every_case(self):
        for name, case in self.cases.items():
            with self.subTest(name):
                notes = schema.check(schema.normalise(case['plan']))
                warnings = sorted(f"{n['code']}:{n['rooms'][0]}" for n in notes
                                  if n['severity'] == 'warning' and n['code'].startswith('ff-'))
                self.assertEqual(warnings, sorted(case['expect']['warnings']))

    def test_a_landing_needs_only_part_of_its_cell_over_the_stair(self):
        plan = schema.normalise(self.cases['landing-partly-over-stair']['plan'])
        self.assertEqual(schema.first_floor_findings('ff_stairLanding', 'r2_c1', plan['floors']['ground']), [])

    def test_a_refused_landing_says_where_the_stair_is(self):
        plan = schema.normalise(self.cases['landing-off-stair']['plan'])
        finding = schema.first_floor_findings('ff_stairLanding', 'r2_c2', plan['floors']['ground'])[0]
        self.assertEqual(finding['code'], 'ff-landing-off-stair')
        self.assertIn('the Inner Left cell (row 2, column 1), above the Living Lobby + Staircase', finding['message'])

    def test_a_balcony_beside_an_open_roof_has_an_open_side(self):
        plan = schema.normalise(self.cases['balcony-beside-open-roof']['plan'])
        self.assertEqual(schema.first_floor_findings('ff_balcony', 'r2_c3', plan['floors']['ground'], plan['floors']['first']), [])


if __name__ == '__main__':
    unittest.main()
