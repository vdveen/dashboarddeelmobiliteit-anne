"""Public read-only GeoJSON API for the snapshot viewer."""

import json
import re
from datetime import datetime, timezone

from flask import Flask, abort, jsonify, request
import psycopg

from scripts.collect_voi_vehicles import filename_timestamp, iso_timestamp
from scripts.voi_availability import (
    ValidationError, parse_window, validate_polygon,
)
from scripts.voi_database import connect

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024


@app.after_request
def headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
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


@app.get("/health")
def health():
    with connect(readonly=True) as connection:
        connection.execute("SELECT 1").fetchone()
        latest = connection.execute("SELECT max(captured_at) FROM voi_snapshots").fetchone()[0]
    age = max(0, int((datetime.now(timezone.utc) - latest).total_seconds())) if latest else None
    return jsonify(status="ok", latest_capture=iso_timestamp(latest) if latest else None,
                   age_seconds=age, stale=age is None or age > 30 * 60)


@app.get("/index.json")
def index():
    start, end = parse_window(request.args.get("from"), request.args.get("to"))
    with connect(readonly=True) as connection:
        rows = connection.execute(
            "SELECT captured_at FROM voi_snapshots WHERE captured_at BETWEEN %s AND %s"
            " ORDER BY captured_at LIMIT 4501",
            (start, end),
        ).fetchall()
    if len(rows) > 4500:
        abort(413)
    return jsonify([
        {"captured_at": iso_timestamp(row[0]),
         "path": f"snapshots/voi-vehicles-{filename_timestamp(row[0])}.geojson"}
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
                AND ST_Intersects(p.geom, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
               WHERE s.captured_at BETWEEN %s AND %s
               GROUP BY s.captured_at ORDER BY s.captured_at""",
            (geojson, start, end),
        ).fetchall()
    response = jsonify(**{
        "from": iso_timestamp(start), "to": iso_timestamp(end),
        "series": [{"captured_at": iso_timestamp(row[0]), "operational": row[1],
                    "non_operational": row[2], "unknown": row[3], "total": row[4]}
                   for row in rows],
    })
    response.headers["Cache-Control"] = "no-store"
    return response
