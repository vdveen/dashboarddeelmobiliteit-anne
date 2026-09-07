"""Integration tests. Run against a disposable PostGIS database only."""

import os
import unittest
from datetime import datetime, timezone

from scripts.collect_voi_vehicles import to_geojson
from scripts.voi_database import connect, initialize, store_snapshot
from scripts.voi_api import app


@unittest.skipUnless(os.environ.get("VOI_TEST_DATABASE") == "1", "Requires disposable PostGIS")
class DatabaseTest(unittest.TestCase):
    def setUp(self):
        with connect() as connection:
            initialize(connection)
            connection.execute("TRUNCATE voi_positions, voi_snapshots RESTART IDENTITY")
        self.captured = datetime(2026, 9, 7, 12, tzinfo=timezone.utc)
        self.geojson = to_geojson({"vehicles_in_public_space": [
            {"system_id": "voi", "form_factor": "bicycle",
             "location": {"latitude": 52.1, "longitude": 5.1}, **status}
            for status in ({}, {"is_available": True}, {"is_non_operational": True})
        ]}, self.captured)
        self.client = app.test_client()

    def test_atomic_idempotent_snapshot_and_geojson_filters(self):
        with connect() as connection:
            self.assertTrue(store_snapshot(connection, self.geojson, "test"))
            self.assertFalse(store_snapshot(connection, self.geojson, "test"))
        index = self.client.get("/index.json").get_json()
        self.assertEqual(len(index), 1)
        url = "/" + index[0]["path"]
        response = self.client.get(url)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "*")
        data = response.get_json()
        self.assertEqual(data["feature_count"], 3)
        self.assertEqual(data["features"][0]["geometry"]["coordinates"], [5.1, 52.1])
        self.assertIsNone(data["features"][0]["properties"]["is_non_operational"])
        for value in ("true", "false", "unknown"):
            self.assertEqual(self.client.get(url + "?available=" + value).get_json()["feature_count"], 1)
        self.assertEqual(self.client.post(url).status_code, 405)
        self.assertEqual(self.client.get(url + "?available=invalid").status_code, 400)
        self.assertEqual(self.client.get("/snapshots/voi-vehicles-2026-02-31T12-00-00Z.geojson").status_code, 404)

    def test_rollback_leaves_no_partial_snapshot(self):
        with self.assertRaises(RuntimeError):
            with connect() as connection:
                store_snapshot(connection, self.geojson, "test")
                raise RuntimeError("simulate failure before commit")
        self.assertEqual(self.client.get("/index.json").get_json(), [])

    def test_readonly_connection_rejects_writes(self):
        import psycopg
        with self.assertRaises(psycopg.errors.ReadOnlySqlTransaction):
            with connect(readonly=True) as connection:
                connection.execute("DELETE FROM voi_positions")


if __name__ == "__main__":
    unittest.main()
