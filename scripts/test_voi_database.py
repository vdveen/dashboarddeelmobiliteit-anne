"""Integration tests. Run against a disposable PostGIS database only."""

import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from scripts import voi_database
from scripts.collect_voi_vehicles import to_geojson
from scripts.voi_database import backfill, connect, initialize, missing_boundaries, store_snapshot
from scripts.voi_api import app


@unittest.skipUnless(os.environ.get("VOI_TEST_DATABASE") == "1", "Requires disposable PostGIS")
class DatabaseTest(unittest.TestCase):
    def setUp(self):
        with connect() as connection:
            initialize(connection)
            connection.execute("TRUNCATE voi_positions, voi_snapshots RESTART IDENTITY")
        self.captured = datetime(2026, 9, 7, 12, tzinfo=timezone.utc)
        self.payload = {"park_events": [
            {"system_id": "voi", "form_factor": "bicycle", "bike_id": "voi:jp4v",
             "location": {"latitude": 52.1, "longitude": 5.1},
             "is_non_operational": False, **status}
            for status in ({}, {"is_available": True}, {"is_non_operational": True})
        ]}
        self.geojson = to_geojson(self.payload, self.captured)
        self.client = app.test_client()

    def test_atomic_idempotent_snapshot_and_geojson_filters(self):
        with connect() as connection:
            self.assertTrue(store_snapshot(connection, self.geojson, "test"))
            self.assertFalse(store_snapshot(connection, self.geojson, "test"))
        # An explicit window: the default last seven days moves past the fixture date.
        index = self.client.get("/index.json?from=2026-09-07T00:00:00Z&to=2026-09-07T23:00:00Z").get_json()
        self.assertEqual(len(index), 1)
        url = "/" + index[0]["path"]
        response = self.client.get(url)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "*")
        data = response.get_json()
        self.assertEqual(data["feature_count"], 3)
        self.assertEqual(data["features"][0]["geometry"]["coordinates"], [5.1, 52.1])
        self.assertIs(data["features"][0]["properties"]["is_non_operational"], False)
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

    def test_index_window_filters_by_time(self):
        with connect() as connection:
            store_snapshot(connection, self.geojson, "test")
            store_snapshot(connection, to_geojson(
                {"park_events": []}, self.captured - timedelta(days=30)), "test")
        self.assertEqual(len(self.client.get("/index.json?from=2026-08-08T00:00:00Z&to=2026-09-07T23:00:00Z").get_json()), 2)
        self.assertEqual(len(self.client.get(
            "/index.json?from=2026-09-07T00:00:00Z&to=2026-09-07T23:00:00Z").get_json()), 1)
        self.assertEqual(self.client.get("/index.json?from=yesterday").status_code, 400)
        self.assertEqual(self.client.get(
            "/index.json?from=2026-09-08T00:00:00Z&to=2026-09-01T00:00:00Z").status_code, 400)

    def test_availability_counts_per_snapshot_inside_the_polygon(self):
        empty_at = self.captured - timedelta(hours=1)
        with connect() as connection:
            store_snapshot(connection, self.geojson, "test")
            store_snapshot(connection, to_geojson({"park_events": []}, empty_at), "test")
            # A legacy position from before the source reported a status.
            connection.execute(
                """INSERT INTO voi_positions (captured_at, system_id, is_non_operational, geom)
                   VALUES (%s, 'voi', NULL, ST_SetSRID(ST_MakePoint(5.1, 52.1), 4326))""",
                (empty_at,))
        around = {"type": "Polygon", "coordinates": [[[5.0, 52.0], [5.2, 52.0],
                                                      [5.2, 52.2], [5.0, 52.2], [5.0, 52.0]]]}
        window = {"from": "2026-09-07T00:00:00Z", "to": "2026-09-07T23:00:00Z"}
        data = self.client.post("/availability", json={"polygon": around, **window}).get_json()
        self.assertEqual(data["from"], "2026-09-07T00:00:00Z")
        # The empty snapshot keeps the series gapless.
        # A NULL is_non_operational counts as unknown, never as operational.
        self.assertEqual(data["series"], [
            {"captured_at": "2026-09-07T11:00:00Z", "total": 1,
             "operational": 0, "non_operational": 0, "unknown": 1},
            {"captured_at": "2026-09-07T12:00:00Z", "total": 3,
             "operational": 2, "non_operational": 1, "unknown": 0},
        ])

        elsewhere = {"type": "Polygon", "coordinates": [[[0.0, 0.0], [0.1, 0.0],
                                                         [0.1, 0.1], [0.0, 0.1], [0.0, 0.0]]]}
        outside = self.client.post("/availability", json={"polygon": elsewhere, **window}).get_json()
        self.assertEqual([point["total"] for point in outside["series"]], [0, 0])
        self.assertEqual([point["unknown"] for point in outside["series"]], [0, 0])

        get_response = self.client.get(
            "/availability?polygon=" + json.dumps(around) + "&from=" + window["from"] + "&to=" + window["to"])
        self.assertEqual(get_response.get_json()["series"], data["series"])
        self.assertEqual(get_response.headers["Cache-Control"], "no-store")

    def test_availability_rejects_bad_input_and_answers_preflight(self):
        self.assertEqual(self.client.post("/availability", json={}).status_code, 400)
        self.assertEqual(self.client.post("/availability", json={
            "polygon": {"type": "Point", "coordinates": [5.1, 52.1]}}).status_code, 400)
        self.assertEqual(self.client.post("/availability", json={
            "polygon": {"type": "Polygon", "coordinates": [[[5.1, 52.1], [5.2, 52.1]]]},
        }).status_code, 400)
        # A self-intersecting bowtie is structurally fine but not a valid geometry.
        bowtie = {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]}
        invalid = self.client.post("/availability", json={"polygon": bowtie})
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("valid", invalid.get_json()["error"])

        preflight = self.client.options("/availability")
        self.assertEqual(preflight.status_code, 204)
        self.assertEqual(preflight.headers["Access-Control-Allow-Origin"], "*")
        self.assertIn("POST", preflight.headers["Access-Control-Allow-Methods"])
        self.assertEqual(preflight.headers["Access-Control-Allow-Headers"], "Content-Type")

    def test_backfill_fills_missed_boundaries_but_not_empty_answers(self):
        def at(minutes):
            # After TEN_MINUTE_START, where the backfill begins looking.
            return datetime(2026, 10, 11, tzinfo=timezone.utc) + timedelta(minutes=minutes)

        with connect() as connection:
            for minutes in (0, 50):
                store_snapshot(connection, to_geojson(self.payload, at(minutes)), "test")
            self.assertEqual(missing_boundaries(connection, at(50)),
                             [at(40), at(30), at(20), at(10)])

        def fetch(url, captured_at, timeout):
            if captured_at == at(30):
                raise RuntimeError("HTTP Error 502: Bad Gateway")
            return self.payload

        with mock.patch.object(voi_database, "fetch_payload", side_effect=fetch) as fetched:
            backfill("test", at(50))
            # 40 is filled and the failure at 30 stops the run.
            self.assertEqual(fetched.call_count, 2)
            fetched.reset_mock()
            fetched.side_effect = lambda url, captured_at, timeout: (
                {"park_events": []} if captured_at == at(20) else self.payload)
            backfill("test", at(50))
            # 30 is filled; the empty answer at 20 is not stored and ends the run.
            self.assertEqual(fetched.call_count, 2)
        with connect() as connection:
            self.assertEqual(missing_boundaries(connection, at(50)), [at(20), at(10)])

    def test_readonly_connection_rejects_writes(self):
        import psycopg
        with self.assertRaises(psycopg.errors.ReadOnlySqlTransaction):
            with connect(readonly=True) as connection:
                connection.execute("DELETE FROM voi_positions")


if __name__ == "__main__":
    unittest.main()
