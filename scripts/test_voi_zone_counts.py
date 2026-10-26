"""Unit tests for the zone-counts validation. These need no database driver."""

import json
import unittest

from scripts.voi_availability import ValidationError
from scripts.voi_zone_counts import build_series, hub_rows, parse_zones

SQUARE = {"type": "Polygon", "coordinates": [[[5.0, 52.0], [5.1, 52.0], [5.1, 52.1], [5.0, 52.0]]]}


class ParseZonesTest(unittest.TestCase):
    def test_keeps_id_polygon_and_hubs(self):
        zones = parse_zones([{"id": "isselt", "polygon": SQUARE, "hubs": [[5.05, 52.05]]}])
        self.assertEqual(zones[0]["id"], "isselt")
        self.assertEqual(json.loads(zones[0]["geojson"])["type"], "Polygon")
        self.assertEqual(zones[0]["hubs"], [[5.05, 52.05]])

    def test_hubs_are_optional(self):
        self.assertEqual(parse_zones([{"id": "baarn", "polygon": SQUARE}])[0]["hubs"], [])

    def test_rejects_bad_requests(self):
        for zones in (None, [], ["x"], [{"polygon": SQUARE}],
                      [{"id": "a", "polygon": SQUARE}, {"id": "a", "polygon": SQUARE}],
                      [{"id": "a", "polygon": {"type": "Point", "coordinates": [5, 52]}}],
                      [{"id": "a", "polygon": SQUARE, "hubs": [[5.0]]}],
                      [{"id": "a", "polygon": SQUARE, "hubs": [[500, 52]]}],
                      [{"id": "a", "polygon": SQUARE, "hubs": "5,52"}]):
            with self.assertRaises(ValidationError, msg=repr(zones)):
                parse_zones(zones)


class SeriesTest(unittest.TestCase):
    def test_hub_rows_are_parallel_arrays(self):
        zones = parse_zones([
            {"id": "a", "polygon": SQUARE, "hubs": [[5.01, 52.01], [5.02, 52.02]]},
            {"id": "b", "polygon": SQUARE},
        ])
        self.assertEqual(hub_rows(zones), (["a", "a"], [0, 1], [5.01, 5.02], [52.01, 52.02]))

    def test_missing_pairs_are_zero(self):
        zones = parse_zones([
            {"id": "a", "polygon": SQUARE, "hubs": [[5.01, 52.01]]},
            {"id": "b", "polygon": SQUARE},
        ])
        series = build_series(zones, ["t0", "t1", "t2"],
                              [("a", "t1", 4), ("b", "t0", 2), ("b", "t9", 7)],
                              [("a", "t1", 1)])
        self.assertEqual(series["a"], {"operational": [0, 4, 0], "occupied_hubs": [0, 1, 0]})
        self.assertEqual(series["b"], {"operational": [2, 0, 0]})


if __name__ == "__main__":
    unittest.main()
