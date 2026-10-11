"""Transactional snapshot storage in PostgreSQL/PostGIS."""

import os
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg

from scripts.collect_voi_vehicles import (
    DEFAULT_API_URL, SNAPSHOT_INTERVAL_MINUTES, fetch_payload, floor_to_interval,
    to_geojson, utc_now,
)

# The first ten-minute snapshot. Older snapshots are hourly, so the backfill
# does not treat the minutes between them as missing.
TEN_MINUTE_START = datetime(2026, 9, 8, 10, 50, tzinfo=timezone.utc)


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
        """INSERT INTO voi_snapshots (captured_at, title, source_url, feature_count, skipped_count)
           VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING RETURNING captured_at""",
        (captured_at, geojson["title"], source_url, len(geojson["features"]),
         geojson.get("skipped_count")),
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


def missing_boundaries(connection, until):
    """Ten-minute boundaries without a snapshot, newest first."""
    rows = connection.execute(
        """SELECT boundary FROM generate_series(
               greatest(%s, (SELECT min(captured_at) FROM voi_snapshots)),
               %s, make_interval(mins => %s)) AS boundary
           WHERE NOT EXISTS (SELECT 1 FROM voi_snapshots WHERE captured_at = boundary)
           ORDER BY boundary DESC""",
        (TEN_MINUTE_START, until, SNAPSHOT_INTERVAL_MINUTES),
    ).fetchall()
    return [row[0] for row in rows]


def backfill(source_url, until):
    """Fetch boundaries that earlier runs missed.

    The API answers for past timestamps, so a run after an outage can fill the
    gap. It returned vehicles for about the last 36 hours in October 2026 and
    an empty list further back. An empty answer is not stored, because it would
    read as zero vehicles, and it ends the backfill: older boundaries lie past
    the source's reach, and probing them would cost one request each per run.
    """
    with connect() as connection:
        missing = missing_boundaries(connection, until)
    stored = 0
    for captured_at in missing:
        try:
            geojson = to_geojson(fetch_payload(source_url, captured_at, timeout=30), captured_at)
        except ValueError as error:
            print(f"Backfill skipped {captured_at.isoformat()}: {error}")
            continue
        except RuntimeError as error:
            # The source is failing again; the next run picks up from here.
            print(f"Backfill stopped at {captured_at.isoformat()}: {error}")
            break
        if not geojson["features"]:
            print(f"Backfill stopped at {captured_at.isoformat()}: the source has no vehicles there")
            break
        stored += persist_with_retry(geojson, source_url)
    if stored:
        print(f"Backfilled {stored} of {len(missing)} missing snapshots")


def main():
    # Query the exact 10-minute boundary even if Railway starts the container
    # a little late. The snapshot primary key then stays one row per boundary.
    captured_at = floor_to_interval(utc_now())
    source_url = os.environ.get("VOI_API_URL", DEFAULT_API_URL)
    geojson = to_geojson(fetch_payload(source_url, captured_at, timeout=30), captured_at)
    inserted = persist_with_retry(geojson, source_url)
    skipped = geojson.get("skipped_count") or 0
    print(f"{'Stored' if inserted else 'Already stored'} {geojson['feature_count']} Voi positions at {geojson['captured_at']}"
          + (f" ({skipped} unusable records skipped)" if skipped else ""))
    # Only after the current boundary succeeds: while the source is down,
    # each run would otherwise spend its time retrying older boundaries.
    backfill(source_url, captured_at)


if __name__ == "__main__":
    main()
