import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError

from scripts.collect_voi_vehicles import (
    availability_properties,
    fetch_payload,
    read_api_key,
    to_geojson,
    write_geojson,
)


CAPTURED_AT = datetime(2026, 9, 3, 17, 5, 49, tzinfo=timezone.utc)


def park_event(**overrides):
    event = {
        "bike_id": "voi:jp4v",
        "end_time": None,
        "form_factor": "bicycle",
        "is_non_operational": False,
        "location": {"latitude": 52.1, "longitude": 5.1},
        "start_time": "2026-07-30T14:08:31+02:00",
        "system_id": "voi",
    }
    event.update(overrides)
    return event


class AvailabilityTest(unittest.TestCase):
    def test_operational_vehicle_keeps_unknown_availability(self):
        self.assertEqual(
            availability_properties({"is_non_operational": False}),
            {"is_non_operational": False, "is_reserved": None, "is_available": None},
        )

    def test_unavailable_status_overrides_available(self):
        for status in ({"is_non_operational": True}, {"is_reserved": True}):
            vehicle = {"is_non_operational": False, "is_available": True, **status}
            self.assertFalse(availability_properties(vehicle)["is_available"])

    def test_rejects_missing_or_non_boolean_non_operational(self):
        for vehicle in ({}, {"is_non_operational": "true"}, {"is_non_operational": None}):
            with self.assertRaisesRegex(ValueError, "is_non_operational"):
                availability_properties(vehicle)


class ToGeoJsonTest(unittest.TestCase):
    def test_converts_voi_positions_and_ignores_other_operators(self):
        payload = {
            "park_events": [
                park_event(),
                park_event(system_id="other", form_factor="car"),
            ]
        }

        result = to_geojson(payload, CAPTURED_AT)

        self.assertEqual(result["type"], "FeatureCollection")
        self.assertEqual(result["captured_at"], "2026-09-03T17:05:49Z")
        self.assertEqual(result["title"], "Voi vehicle positions at 2026-09-03T17:05:49Z")
        self.assertEqual(result["feature_count"], 1)
        self.assertEqual(result["features"][0]["geometry"]["coordinates"], [5.1, 52.1])
        self.assertIs(result["features"][0]["properties"]["is_non_operational"], False)

    def test_keeps_non_operational_true(self):
        payload = {"park_events": [park_event(is_non_operational=True)]}
        properties = to_geojson(payload, CAPTURED_AT)["features"][0]["properties"]
        self.assertIs(properties["is_non_operational"], True)
        self.assertIs(properties["is_available"], False)

    def test_rejects_a_vehicle_without_non_operational(self):
        payload = {"park_events": [park_event(is_non_operational=None)]}
        with self.assertRaisesRegex(ValueError, "is_non_operational"):
            to_geojson(payload, CAPTURED_AT)

    def test_rejects_an_invalid_coordinate(self):
        payload = {"park_events": [park_event(location={"latitude": 91, "longitude": 5.1})]}
        with self.assertRaisesRegex(ValueError, "invalid latitude"):
            to_geojson(payload, CAPTURED_AT)

    def test_rejects_an_unexpected_response_shape(self):
        with self.assertRaisesRegex(ValueError, "park_events"):
            to_geojson({}, CAPTURED_AT)


class ApiKeyTest(unittest.TestCase):
    def test_missing_or_blank_key_is_an_error(self):
        for environ in ({}, {"DASHBOARDDEELMOB_KEY": "  "}):
            with self.assertRaisesRegex(RuntimeError, "DASHBOARDDEELMOB_KEY"):
                read_api_key(environ)

    def test_reads_and_strips_the_key(self):
        self.assertEqual(read_api_key({"DASHBOARDDEELMOB_KEY": " abc "}), "abc")


class FetchPayloadTest(unittest.TestCase):
    def test_sends_the_key_as_an_apikey_header(self):
        captured = {}

        def fake_urlopen(request, timeout=None):
            captured["url"] = request.full_url
            captured["headers"] = dict(request.header_items())
            return io.BytesIO(json.dumps({"park_events": []}).encode())

        with mock.patch("scripts.collect_voi_vehicles.urlopen", fake_urlopen):
            payload = fetch_payload("https://example.test/park_events", CAPTURED_AT, 5, "secret")

        self.assertEqual(payload, {"park_events": []})
        self.assertEqual(captured["headers"]["Apikey"], "secret")
        self.assertNotIn("Authorization", captured["headers"])
        self.assertIn("operators=voi", captured["url"])
        self.assertIn("timestamp=2026-09-03T17%3A05%3A49Z", captured["url"])
        self.assertNotIn("secret", captured["url"])

    def test_does_not_retry_on_an_auth_error(self):
        calls = []

        def fake_urlopen(request, timeout=None):
            calls.append(request)
            raise HTTPError(request.full_url, 403, "Forbidden", {}, None)

        with mock.patch("scripts.collect_voi_vehicles.urlopen", fake_urlopen):
            with self.assertRaisesRegex(RuntimeError, "403"):
                fetch_payload("https://example.test/park_events", CAPTURED_AT, 5, "secret")

        self.assertEqual(len(calls), 1)


class WriteGeoJsonTest(unittest.TestCase):
    def test_uses_the_capture_time_in_the_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            output_path = write_geojson(
                {"type": "FeatureCollection", "features": []},
                Path(directory),
                CAPTURED_AT,
            )

            self.assertEqual(output_path.name, "voi-vehicles-2026-09-03T17-05-49Z.geojson")
            self.assertTrue(output_path.is_file())


if __name__ == "__main__":
    unittest.main()
