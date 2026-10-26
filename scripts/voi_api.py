"""Public read-only GeoJSON API for the snapshot viewer."""

import gzip
import json
import os
import re
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from flask import Flask, Response, abort, jsonify, request
import psycopg

from scripts.collect_voi_vehicles import (
    DEFAULT_API_URL, fetch_payload, filename_timestamp, iso_timestamp, read_api_key,
)
from scripts.voi_availability import (
    ValidationError, parse_window, validate_polygon,
)
from scripts.voi_database import connect
from scripts import voi_operational_counts, voi_trips_access, voi_zone_counts

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024


@app.after_request
def headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    if "Cache-Control" not in response.headers:
        response.headers["Cache-Control"] = "public, max-age=30" if response.status_code == 200 else "no-store"
    return response


@app.errorhandler(ValidationError)
def invalid_request(error):
    return jsonify(error=str(error)), 400


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify(error="Request or result exceeds the configured limit"), 413


@app.errorhandler(psycopg.Error)
def database_error(error):
    app.logger.error("Snapshot database request failed (%s)", type(error).__name__)
    return jsonify(error="Snapshot storage is temporarily unavailable"), 503


_voi_trips_data = None


@app.route("/voi-trips/data", methods=["GET", "OPTIONS"])
def voi_trips_data():
    """Data for the /voi-trips/ page, for a dashboard login that may see Voi trips."""
    if request.method == "OPTIONS":
        return "", 204
    private = {"Cache-Control": "private, no-store"}
    auth = request.headers.get("Authorization", "")
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    try:
        acl = voi_trips_access.fetch_acl(token)
        may_see = (voi_trips_access.may_see(acl)
                   or voi_trips_access.has_voi_grant_in_region(token, acl))
    except voi_trips_access.LoginRequired as error:
        return jsonify(error=str(error)), 401, private
    except (urllib.error.URLError, OSError, ValueError) as error:
        app.logger.error("Dashboard ACL request failed (%s)", type(error).__name__)
        return jsonify(error="The dashboard API is not available"), 502, private
    if not may_see:
        return jsonify(error="This account has no access to Voi data in the region"), 403, private

    global _voi_trips_data
    if _voi_trips_data is None:
        key = os.environ.get("VOI_TRIPS_KEY")
        if not key:
            app.logger.error("VOI_TRIPS_KEY is not set")
            return jsonify(error="The page data is not configured"), 503, private
        _voi_trips_data = voi_trips_access.decrypt(voi_trips_access.VOI_TRIPS_DATA.read_bytes(), key)
    if "gzip" in request.headers.get("Accept-Encoding", ""):
        return Response(_voi_trips_data, mimetype="application/json",
                        headers={**private, "Content-Encoding": "gzip", "Vary": "Accept-Encoding"})
    return Response(gzip.decompress(_voi_trips_data), mimetype="application/json", headers=private)


@app.get("/health")
def health():
    with connect(readonly=True) as connection:
        connection.execute("SELECT 1").fetchone()
        latest = connection.execute(
            "SELECT captured_at, skipped_count FROM voi_snapshots ORDER BY captured_at DESC LIMIT 1"
        ).fetchone()
        database_bytes = connection.execute("SELECT pg_database_size(current_database())").fetchone()[0]
        positions = connection.execute("SELECT count(*) FROM voi_positions").fetchone()[0]
    captured_at = latest[0] if latest else None
    age = max(0, int((datetime.now(timezone.utc) - captured_at).total_seconds())) if captured_at else None
    return jsonify(status="ok", latest_capture=iso_timestamp(captured_at) if captured_at else None,
                   age_seconds=age, stale=age is None or age > 30 * 60,
                   latest_skipped=latest[1] if latest else None,
                   database_bytes=database_bytes, positions=positions)


@app.get("/index.json")
def index():
    start, end = parse_window(request.args.get("from"), request.args.get("to"))
    with connect(readonly=True) as connection:
        rows = connection.execute(
            "SELECT captured_at, skipped_count FROM voi_snapshots WHERE captured_at BETWEEN %s AND %s"
            " ORDER BY captured_at LIMIT 4501",
            (start, end),
        ).fetchall()
    if len(rows) > 4500:
        abort(413)
    return jsonify([
        {"captured_at": iso_timestamp(row[0]),
         "path": f"snapshots/voi-vehicles-{filename_timestamp(row[0])}.geojson",
         "skipped_count": row[1]}
        for row in rows
    ])


@app.get("/snapshots/<name>")
def snapshot(name):
    if not re.fullmatch(r"voi-vehicles-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.geojson", name):
        abort(404)
    try:
        captured_at = datetime.strptime(name, "voi-vehicles-%Y-%m-%dT%H-%M-%SZ.geojson").replace(tzinfo=timezone.utc)
    except ValueError:
        abort(404)
    available = request.args.get("available")
    if available not in (None, "true", "false", "unknown"):
        abort(400)
    filters = {None: "", "true": " AND is_available IS TRUE",
               "false": " AND is_available IS FALSE", "unknown": " AND is_available IS NULL"}
    with connect(readonly=True) as connection:
        meta = connection.execute("SELECT title FROM voi_snapshots WHERE captured_at = %s", (captured_at,)).fetchone()
        if not meta:
            abort(404)
        rows = connection.execute(
            """SELECT objectid, system_id, form_factor, is_non_operational,
                      is_reserved, is_available, ST_AsGeoJSON(geom)::json
               FROM voi_positions WHERE captured_at = %s""" + filters[available] + " ORDER BY objectid LIMIT 100001",
            (captured_at,),
        ).fetchall()
    if len(rows) > 100000:
        abort(413)
    return jsonify(type="FeatureCollection", title=meta[0], captured_at=iso_timestamp(captured_at),
                   operator="voi", feature_count=len(rows), features=[
                       {"type": "Feature", "id": row[0], "geometry": row[6], "properties": {
                           "objectid": row[0], "captured_at": iso_timestamp(captured_at),
                           "system_id": row[1], "form_factor": row[2],
                           "is_non_operational": row[3], "is_reserved": row[4], "is_available": row[5],
                       }} for row in rows
                   ])


# As many dashboard API requests at once as the dashboard itself makes for the chart
UPSTREAM_CONCURRENCY = 4


def _fetch_operational_counts(zone_ids, moment, api_key):
    """Counts from the dashboard API for one moment, or None when it has none."""
    try:
        payload = fetch_payload(os.environ.get("VOI_API_URL", DEFAULT_API_URL), moment,
                                timeout=20, api_key=api_key, zone_ids=zone_ids)
        counts = voi_operational_counts.count_park_events(payload)
    except (RuntimeError, ValueError) as error:
        app.logger.warning("No park events for %s at %s: %s", zone_ids, iso_timestamp(moment), error)
        return None
    # An empty answer is not stored: the source sometimes has no park events
    # for a past moment, and zero would hide the gap from the archive fallback.
    return counts or None


@app.route("/operational-counts", methods=["POST", "OPTIONS"])
def operational_counts():
    """Non-defect Voi counts per form factor in a cached area, per moment.

    Moments the cache lacks are asked from the dashboard API and stored once
    their day has passed. Moments the API has no vehicles for are left out.
    """
    if request.method == "OPTIONS":
        return "", 204
    zone_ids, moments = voi_operational_counts.parse_request(request.get_json(silent=True))
    counts = {}
    with connect(readonly=True) as connection:
        rows = connection.execute(
            """SELECT measured_at, form_factor, operational, total FROM voi_operational_counts
               WHERE zone_ids = %s AND measured_at = ANY(%s)""",
            (zone_ids, moments),
        ).fetchall()
    for measured_at, form_factor, operational, total in rows:
        counts.setdefault(measured_at, {})[form_factor] = {"operational": operational, "total": total}

    missing = [moment for moment in moments if moment not in counts]
    if missing:
        try:
            api_key = read_api_key()
        except RuntimeError as error:
            app.logger.error("%s", error)
            return jsonify(error="The dashboard API key is not configured"), 503
        with ThreadPoolExecutor(UPSTREAM_CONCURRENCY) as pool:
            fetched = dict(zip(missing, pool.map(
                lambda moment: _fetch_operational_counts(zone_ids, moment, api_key), missing)))
        now = datetime.now(timezone.utc)
        settled = [(zone_ids, moment, form_factor, entry["operational"], entry["total"])
                   for moment, by_form_factor in fetched.items()
                   if by_form_factor and voi_operational_counts.is_settled(moment, now)
                   for form_factor, entry in by_form_factor.items()]
        if settled:
            with connect() as connection, connection.cursor() as cursor:
                cursor.executemany(
                    """INSERT INTO voi_operational_counts
                       (zone_ids, measured_at, form_factor, operational, total)
                       VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
                    settled,
                )
        counts.update({moment: value for moment, value in fetched.items() if value})

    response = jsonify(zone_ids=zone_ids, counts={
        iso_timestamp(moment): value for moment, value in sorted(counts.items())
    })
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/availability", methods=["GET", "POST", "OPTIONS"])
def availability():
    """Count vehicles per snapshot inside a polygon."""
    if request.method == "OPTIONS":
        return ("", 204)
    body = request.get_json(silent=True) if request.method == "POST" else None
    if body is None:
        body = {}
    if not isinstance(body, dict):
        raise ValidationError("The request body must be a JSON object")
    raw_polygon = body.get("polygon", request.args.get("polygon"))
    if raw_polygon in (None, ""):
        raise ValidationError("polygon is required")
    geometry = validate_polygon(raw_polygon)
    start, end = parse_window(body.get("from", request.args.get("from")),
                              body.get("to", request.args.get("to")))
    geojson = json.dumps(geometry)
    with connect(readonly=True) as connection:
        try:
            valid = connection.execute(
                "SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))", (geojson,)
            ).fetchone()
        except psycopg.errors.DataException:
            raise ValidationError("polygon is not a readable GeoJSON geometry") from None
        if not valid or valid[0] is not True:
            raise ValidationError("polygon is not a valid geometry")
        rows = connection.execute(
            """SELECT s.captured_at,
                      count(p.objectid) FILTER (WHERE p.is_non_operational IS FALSE) AS operational,
                      count(p.objectid) FILTER (WHERE p.is_non_operational) AS non_operational,
                      count(p.objectid) FILTER (WHERE p.is_non_operational IS NULL) AS unknown,
                      count(p.objectid) AS total
               FROM voi_snapshots s
               LEFT JOIN voi_positions p
                 ON p.captured_at = s.captured_at
                -- Postgres does not carry the window below over to p. Without
                -- this line every query reads the polygon's full history.
                AND p.captured_at BETWEEN %s AND %s
                AND ST_Intersects(p.geom, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
               WHERE s.captured_at BETWEEN %s AND %s
               GROUP BY s.captured_at ORDER BY s.captured_at""",
            (start, end, geojson, start, end),
        ).fetchall()
    response = jsonify(**{
        "from": iso_timestamp(start), "to": iso_timestamp(end),
        "series": [{"captured_at": iso_timestamp(row[0]), "operational": row[1],
                    "non_operational": row[2], "unknown": row[3], "total": row[4]}
                   for row in rows],
    })
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/zone-counts", methods=["POST", "OPTIONS"])
def zone_counts():
    """Non-defect vehicles per snapshot in each of several zones.

    For a zone with hub positions it also counts the hubs that hold at least
    one non-defect vehicle within HUB_RADIUS_M, the contract's dropzones.
    """
    if request.method == "OPTIONS":
        return ("", 204)
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ValidationError("The request body must be a JSON object")
    zones = voi_zone_counts.parse_zones(body.get("zones"))
    start, end = parse_window(body.get("from"), body.get("to"))
    ids = [zone["id"] for zone in zones]
    geojsons = [zone["geojson"] for zone in zones]
    hub_zone_ids, hub_indexes, hub_lons, hub_lats = voi_zone_counts.hub_rows(zones)
    with connect(readonly=True) as connection:
        try:
            invalid = connection.execute(
                """SELECT id FROM unnest(%s::text[], %s::text[]) AS z(id, geojson)
                   WHERE NOT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(geojson), 4326))""",
                (ids, geojsons),
            ).fetchall()
        except psycopg.errors.DataException:
            raise ValidationError("A zone polygon is not a readable GeoJSON geometry") from None
        if invalid:
            raise ValidationError(f"Zone {invalid[0][0]} is not a valid geometry")
        moments = [row[0] for row in connection.execute(
            "SELECT captured_at FROM voi_snapshots WHERE captured_at BETWEEN %s AND %s"
            " ORDER BY captured_at",
            (start, end),
        ).fetchall()]
        counts = connection.execute(
            """WITH zones AS (
                   SELECT id, ST_SetSRID(ST_GeomFromGeoJSON(geojson), 4326) AS geom
                   FROM unnest(%s::text[], %s::text[]) AS z(id, geojson))
               SELECT z.id, p.captured_at, count(*)
               FROM zones z
               JOIN voi_positions p
                 ON p.captured_at BETWEEN %s AND %s
                AND p.is_non_operational IS FALSE
                AND ST_Intersects(p.geom, z.geom)
               GROUP BY z.id, p.captured_at""",
            (ids, geojsons, start, end),
        ).fetchall()
        occupied = []
        if hub_zone_ids:
            # The degree box (at least 34 m at Dutch latitudes) lets the
            # geometry index find candidates; the geography test is exact.
            occupied = connection.execute(
                """WITH hubs AS (
                       SELECT zone_id, hub, ST_SetSRID(ST_MakePoint(lon, lat), 4326) AS geom
                       FROM unnest(%s::text[], %s::int[], %s::float8[], %s::float8[])
                            AS h(zone_id, hub, lon, lat))
                   SELECT h.zone_id, p.captured_at, count(DISTINCT h.hub)
                   FROM hubs h
                   JOIN voi_positions p
                     ON p.captured_at BETWEEN %s AND %s
                    AND p.is_non_operational IS FALSE
                    AND ST_DWithin(p.geom, h.geom, 0.0005)
                    AND ST_DWithin(p.geom::geography, h.geom::geography, %s)
                   GROUP BY h.zone_id, p.captured_at""",
                (hub_zone_ids, hub_indexes, hub_lons, hub_lats, start, end,
                 voi_zone_counts.HUB_RADIUS_M),
            ).fetchall()
    response = jsonify(**{
        "from": iso_timestamp(start), "to": iso_timestamp(end),
        "captured_at": [iso_timestamp(moment) for moment in moments],
        "zones": voi_zone_counts.build_series(zones, moments, counts, occupied),
    })
    response.headers["Cache-Control"] = "no-store"
    return response
