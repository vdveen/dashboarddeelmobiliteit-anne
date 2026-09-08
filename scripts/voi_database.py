"""Transactional snapshot storage in PostgreSQL/PostGIS."""

import os
import time
from pathlib import Path

import psycopg

from scripts.collect_voi_vehicles import (
    DEFAULT_API_URL, fetch_payload, floor_to_interval, to_geojson, utc_now,
)


def connect(*, readonly=False):
    connection = psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=15)
    connection.read_only = readonly
    with connection.cursor() as cursor:
        cursor.execute("SET statement_timeout = '30s'")
    return connection


def initialize(connection):
    connection.execute(Path(__file__).with_name("voi_schema.sql").read_text())


def store_snapshot(connection, geojson, source_url):
    captured_at = geojson["captured_at"]
    inserted = connection.execute(
        """INSERT INTO voi_snapshots (captured_at, title, source_url, feature_count)
           VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING RETURNING captured_at""",
        (captured_at, geojson["title"], source_url, len(geojson["features"])),
    ).fetchone()
    if not inserted:
        return False
    with connection.cursor() as cursor:
        cursor.executemany(
            """INSERT INTO voi_positions
               (captured_at, system_id, form_factor, is_non_operational,
                is_reserved, is_available, geom)
               VALUES (%s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))""",
            [
                (captured_at, f["properties"]["system_id"],
                 f["properties"].get("form_factor"),
                 f["properties"].get("is_non_operational"),
                 f["properties"].get("is_reserved"),
                 f["properties"].get("is_available"),
                 *f["geometry"]["coordinates"])
                for f in geojson["features"]
            ],
        )
    return True


def persist_with_retry(geojson, source_url):
    """Retry the same boundary and payload in a new transaction."""
    retryable = (psycopg.OperationalError, psycopg.errors.SerializationFailure, psycopg.errors.DeadlockDetected)
    for attempt in range(3):
        try:
            with connect() as connection:
                initialize(connection)
                return store_snapshot(connection, geojson, source_url)
        except retryable:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def main():
    # Query the exact 10-minute boundary even if Railway starts the container
    # a little late. The snapshot primary key then stays one row per boundary.
    captured_at = floor_to_interval(utc_now())
    source_url = os.environ.get("VOI_API_URL", DEFAULT_API_URL)
    geojson = to_geojson(fetch_payload(source_url, captured_at, timeout=30), captured_at)
    inserted = persist_with_retry(geojson, source_url)
    print(f"{'Stored' if inserted else 'Already stored'} {geojson['feature_count']} Voi positions at {geojson['captured_at']}")


if __name__ == "__main__":
    main()
