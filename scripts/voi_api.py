"""Public read-only GeoJSON API for the snapshot viewer."""

import re
from datetime import datetime, timezone

from flask import Flask, abort, jsonify, request
import psycopg

from scripts.collect_voi_vehicles import filename_timestamp, iso_timestamp
from scripts.voi_database import connect

app = Flask(__name__)


@app.after_request
def headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "public, max-age=30" if response.status_code == 200 else "no-store"
    return response


@app.errorhandler(psycopg.Error)
def database_error(error):
    app.logger.error("Snapshot database request failed (%s)", type(error).__name__)
    return jsonify(error="Snapshot storage is temporarily unavailable"), 503


@app.get("/health")
def health():
    with connect(readonly=True) as connection:
        connection.execute("SELECT 1").fetchone()
    return jsonify(status="ok")


@app.get("/index.json")
def index():
    with connect(readonly=True) as connection:
        rows = connection.execute("SELECT captured_at FROM voi_snapshots ORDER BY captured_at").fetchall()
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
               FROM voi_positions WHERE captured_at = %s""" + filters[available] + " ORDER BY objectid",
            (captured_at,),
        ).fetchall()
    return jsonify(type="FeatureCollection", title=meta[0], captured_at=iso_timestamp(captured_at),
                   operator="voi", feature_count=len(rows), features=[
                       {"type": "Feature", "id": row[0], "geometry": row[6], "properties": {
                           "objectid": row[0], "captured_at": iso_timestamp(captured_at),
                           "system_id": row[1], "form_factor": row[2],
                           "is_non_operational": row[3], "is_reserved": row[4], "is_available": row[5],
                       }} for row in rows
                   ])
