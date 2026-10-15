"""Unit tests for the non-defect count cache. These need no database driver."""

import unittest
from datetime import datetime, timedelta, timezone

from scripts.voi_availability import ValidationError
from scripts.voi_operational_counts import (
    CACHED_AREAS, area_key, count_park_events, is_settled, parse_request,
)

NOW = datetime(2026, 10, 15, 12, tzinfo=timezone.utc)
GV_AND_A = "34148,34153,34160,34149,34188,34190,34175,34193,34353,34401"


class AreaTest(unittest.TestCase):
    def test_serves_ten_municipalities_and_three_regions(self):
        self.assertEqual(len(CACHED_AREAS), 13)
        self.assertIn("34188", CACHED_AREAS)
        self.assertIn(area_key(GV_AND_A), CACHED_AREAS)

    def test_area_key_ignores_order_and_duplicates(self):
        self.assertEqual(area_key("34160, 34148,34148"), "34148,34160")

    def test_rejects_other_zones(self):
        for zone_ids in ("0", "34188,1", "abc"):
            with self.assertRaises(ValidationError):
                parse_request({"zone_ids": zone_ids, "timestamps": []})


class ParseRequestTest(unittest.TestCase):
    def test_returns_distinct_sorted_moments(self):
        key, moments = parse_request({"zone_ids": "34188", "timestamps": [
            "2026-07-02T22:00:00Z", "2026-07-01T22:00:00Z", "2026-07-02T22:00:00+00:00"]})
        self.assertEqual(key, "34188")
        self.assertEqual(moments, [datetime(2026, 7, 1, 22, tzinfo=timezone.utc),
                                   datetime(2026, 7, 2, 22, tzinfo=timezone.utc)])

    def test_requires_a_timestamp_list(self):
        with self.assertRaises(ValidationError):
            parse_request({"zone_ids": "34188", "timestamps": "2026-07-01T22:00:00Z"})
        with self.assertRaises(ValidationError):
            parse_request(None)


class IsSettledTest(unittest.TestCase):
    def test_stores_only_moments_at_least_a_day_old(self):
        self.assertTrue(is_settled(NOW - timedelta(days=1), NOW))
        self.assertFalse(is_settled(NOW - timedelta(hours=23), NOW))


class CountParkEventsTest(unittest.TestCase):
    def test_counts_operational_vehicles_per_form_factor(self):
        payload = {"park_events": [
            {"system_id": "voi", "form_factor": "bicycle", "is_non_operational": False},
            {"system_id": "voi", "form_factor": "bicycle", "is_non_operational": True},
            {"system_id": "voi", "form_factor": "bicycle", "is_non_operational": "true"},
            {"system_id": "voi", "form_factor": "moped"},
            {"system_id": "voi"},
            {"system_id": "check", "form_factor": "moped", "is_non_operational": False},
        ]}
        self.assertEqual(count_park_events(payload), {
            "bicycle": {"operational": 1, "total": 3},
            "moped": {"operational": 1, "total": 1},
            "": {"operational": 1, "total": 1},
        })

    def test_an_empty_answer_has_no_counts(self):
        self.assertEqual(count_park_events({"park_events": []}), {})

    def test_rejects_an_answer_without_park_events(self):
        with self.assertRaises(ValueError):
            count_park_events({"error": "nope"})


if __name__ == "__main__":
    unittest.main()
