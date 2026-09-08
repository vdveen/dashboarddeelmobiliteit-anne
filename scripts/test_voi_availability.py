"""Validation unit tests. These need no database driver."""

import unittest
from datetime import datetime, timezone

from scripts.collect_voi_vehicles import floor_to_interval
from scripts.voi_availability import (
    MAX_POLYGON_VERTICES, ValidationError, parse_iso, parse_window, validate_polygon,
)

SQUARE = {"type": "Polygon", "coordinates": [[[5.1, 52.1], [5.2, 52.1], [5.2, 52.2], [5.1, 52.1]]]}
NOW = datetime(2026, 9, 8, 12, 34, 56, tzinfo=timezone.utc)


class FloorToIntervalTest(unittest.TestCase):
    def test_rounds_down_to_the_ten_minute_boundary(self):
        late = datetime(2026, 9, 8, 12, 19, 7, 500000, tzinfo=timezone.utc)
        self.assertEqual(floor_to_interval(late), datetime(2026, 9, 8, 12, 10, tzinfo=timezone.utc))

    def test_keeps_an_exact_boundary_unchanged(self):
        exact = datetime(2026, 9, 8, 12, 10, tzinfo=timezone.utc)
        self.assertEqual(floor_to_interval(exact), exact)

    def test_rejects_an_interval_that_does_not_divide_an_hour(self):
        with self.assertRaises(ValueError):
            floor_to_interval(NOW, 7)


class ParseIsoTest(unittest.TestCase):
    def test_reads_zulu_and_offset_timestamps_as_utc(self):
        self.assertEqual(parse_iso("2026-09-08T12:00:00Z", "from"),
                         datetime(2026, 9, 8, 12, tzinfo=timezone.utc))
        self.assertEqual(parse_iso("2026-09-08T14:00:00+02:00", "from"),
                         datetime(2026, 9, 8, 12, tzinfo=timezone.utc))
        self.assertEqual(parse_iso("2026-09-08T12:00:00", "from"),
                         datetime(2026, 9, 8, 12, tzinfo=timezone.utc))

    def test_rejects_garbage(self):
        for value in ("", "yesterday", "2026-13-01T00:00:00Z", None, 5):
            with self.assertRaises(ValidationError):
                parse_iso(value, "from")


class ParseWindowTest(unittest.TestCase):
    def test_defaults_to_the_last_seven_days(self):
        start, end = parse_window(None, None, now=NOW)
        self.assertEqual(end, NOW)
        self.assertEqual((end - start).days, 7)

    def test_from_alone_runs_to_now(self):
        start, end = parse_window("2026-09-01T00:00:00Z", None, now=NOW)
        self.assertEqual(start, datetime(2026, 9, 1, tzinfo=timezone.utc))
        self.assertEqual(end, NOW)

    def test_to_alone_keeps_a_seven_day_window(self):
        start, end = parse_window(None, "2026-09-08T00:00:00Z", now=NOW)
        self.assertEqual(start, datetime(2026, 9, 1, tzinfo=timezone.utc))

    def test_rejects_a_reversed_window(self):
        with self.assertRaises(ValidationError):
            parse_window("2026-09-08T00:00:00Z", "2026-09-01T00:00:00Z", now=NOW)


class ValidatePolygonTest(unittest.TestCase):
    def test_accepts_a_polygon_and_a_multipolygon(self):
        self.assertEqual(validate_polygon(SQUARE), SQUARE)
        multi = {"type": "MultiPolygon", "coordinates": [SQUARE["coordinates"]]}
        self.assertEqual(validate_polygon(multi), multi)

    def test_accepts_a_json_string_and_unwraps_a_feature(self):
        import json
        self.assertEqual(validate_polygon(json.dumps(SQUARE)), SQUARE)
        self.assertEqual(
            validate_polygon({"type": "Feature", "properties": {}, "geometry": SQUARE}), SQUARE)

    def test_rejects_other_geometry_types(self):
        for geometry in ({"type": "Point", "coordinates": [5.1, 52.1]},
                         {"type": "LineString", "coordinates": [[5.1, 52.1], [5.2, 52.2]]},
                         "not json", 42, None):
            with self.assertRaises(ValidationError):
                validate_polygon(geometry)

    def test_rejects_a_malformed_ring(self):
        for coordinates in ([[[5.1, 52.1], [5.2, 52.1]]], [[["a", "b"], [1, 1], [2, 2], [3, 3]]], []):
            with self.assertRaises(ValidationError):
                validate_polygon({"type": "Polygon", "coordinates": coordinates})

    def test_rejects_more_than_the_vertex_cap(self):
        ring = [[5.0 + index / 1e6, 52.0] for index in range(MAX_POLYGON_VERTICES + 1)]
        with self.assertRaisesRegex(ValidationError, "limit is 5000"):
            validate_polygon({"type": "Polygon", "coordinates": [ring]})


if __name__ == "__main__":
    unittest.main()
