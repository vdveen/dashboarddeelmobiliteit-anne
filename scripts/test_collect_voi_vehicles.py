import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from scripts.collect_voi_vehicles import to_geojson, write_geojson


CAPTURED_AT = datetime(2026, 9, 3, 17, 5, 49, tzinfo=timezone.utc)


class ToGeoJsonTest(unittest.TestCase):
    def test_converts_voi_positions_and_ignores_other_operators(self):
        payload = {
            "vehicles_in_public_space": [
                {
                    "form_factor": "bicycle",
                    "location": {"latitude": 52.1, "longitude": 5.1},
                    "system_id": "voi",
                },
                {
                    "form_factor": "car",
                    "location": {"latitude": 52.2, "longitude": 5.2},
                    "system_id": "other",
                },
            ]
        }

        result = to_geojson(payload, CAPTURED_AT)

        self.assertEqual(result["type"], "FeatureCollection")
        self.assertEqual(result["captured_at"], "2026-09-03T17:05:49Z")
        self.assertEqual(
            result["title"],
            "Voi vehicle positions at 2026-09-03T17:05:49Z",
        )
        self.assertEqual(result["feature_count"], 1)
        self.assertEqual(
            result["features"][0]["geometry"]["coordinates"],
            [5.1, 52.1],
        )

    def test_rejects_an_invalid_coordinate(self):
        payload = {
            "vehicles_in_public_space": [
                {
                    "form_factor": "bicycle",
                    "location": {"latitude": 91, "longitude": 5.1},
                    "system_id": "voi",
                }
            ]
        }

        with self.assertRaisesRegex(ValueError, "invalid latitude"):
            to_geojson(payload, CAPTURED_AT)

    def test_rejects_an_unexpected_response_shape(self):
        with self.assertRaisesRegex(ValueError, "vehicles_in_public_space"):
            to_geojson({}, CAPTURED_AT)


class WriteGeoJsonTest(unittest.TestCase):
    def test_uses_the_capture_time_in_the_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            output_path = write_geojson(
                {"type": "FeatureCollection", "features": []},
                Path(directory),
                CAPTURED_AT,
            )

            self.assertEqual(
                output_path.name,
                "voi-vehicles-2026-09-03T17-05-49Z.geojson",
            )
            self.assertTrue(output_path.is_file())


if __name__ == "__main__":
    unittest.main()
