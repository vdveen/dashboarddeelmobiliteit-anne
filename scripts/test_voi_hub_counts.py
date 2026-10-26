"""Unit tests for the hub-counts validation. These need no database driver."""

import json
import unittest

from scripts.voi_availability import ValidationError
from scripts.voi_hub_counts import MARGIN_DEGREES, bounds, build_series, parse_zones

SQUARE = {"type": "Polygon", "coordinates": [[[5.0, 52.0], [5.1, 52.0], [5.1, 52.1], [5.0, 52.0]]]}
MULTI = {"type": "MultiPolygon", "coordinates": [SQUARE["coordinates"],
                                                 [[[5.2, 52.2], [5.3, 52.2], [5.3, 52.3], [5.2, 52.2]]]]}


class ParseZonesTest(unittest.TestCase):
    def test_keeps_id_and_polygon(self):
        zones = parse_zones([{"id": "voi:1", "polygon": SQUARE}, {"id": "plek:voi:2", "polygon": MULTI}])
        self.assertEqual([zone["id"] for zone in zones], ["voi:1", "plek:voi:2"])
        self.assertEqual(json.loads(zones[1]["geojson"])["type"], "MultiPolygon")

    def test_rejects_bad_requests(self):
        for zones in (None, [], ["x"], [{"polygon": SQUARE}], [{"id": " ", "polygon": SQUARE}],
                      [{"id": "a", "polygon": SQUARE}, {"id": "a", "polygon": SQUARE}],
                      [{"id": "a", "polygon": {"type": "Point", "coordinates": [5, 52]}}]):
            with self.assertRaises(ValidationError, msg=repr(zones)):
                parse_zones(zones)


class BoundsTest(unittest.TestCase):
    def test_adds_the_margin(self):
        west, south, east, north = bounds(parse_zones([{"id": "a", "polygon": MULTI}]))
        self.assertAlmostEqual(west, 5.0 - MARGIN_DEGREES)
        self.assertAlmostEqual(north, 52.3 + MARGIN_DEGREES)


class BuildSeriesTest(unittest.TestCase):
    def test_lists_only_snapshots_with_vehicles_in_order(self):
        moments = ["t0", "t1", "t2"]
        rows = [("b", "t2", 1, 2), ("a", "t2", 3, 3), ("a", "t0", 0, 1), ("a", "gone", 9, 9)]
        self.assertEqual(build_series(moments, rows), {
            "a": {"i": [0, 2], "operational": [0, 3], "total": [1, 3]},
            "b": {"i": [2], "operational": [1], "total": [2]},
        })


if __name__ == "__main__":
    unittest.main()
