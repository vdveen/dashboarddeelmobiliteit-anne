# Operate the Voi snapshot archive

Railway stores snapshots in PostgreSQL 16 with PostGIS 3.5 on a persistent volume. `voi-vehicle-monitor` collects at `0 * * * *` UTC and exits. `voi-snapshot-api` serves the timeline viewer. The named partial in `railway.ts` manages these resources without managing the dashboard web service.

## Deploy changes

1. Run `npm ci` and authenticate with `railway login`.
2. Link production with `railway link --project 85622316-5f8e-4eec-9a0c-d3ca3336b928 --environment 5d7678ad-1cd0-46e4-8993-15dcacdc0dfd`.
3. Push the changes to the fork's `main` branch.
4. Run `railway config plan`. Check that the plan affects only the Voi services and database.
5. Run `railway config apply`.

Keep database credentials in Railway service variables. No GitHub write credential is needed. The previous GitHub archive is no longer updated or read. Its history is not imported.

## Inspect collection

Run `railway service logs --service voi-vehicle-monitor --latest --lines 50`. A successful run reports the position count and snapshot timestamp. The database commits the snapshot and all positions together. Repeating the same hour does not duplicate the snapshot. A missed hour is not automatically backfilled.

Railway schedules the job at the start of each hour. Container startup can delay the HTTP request by a few seconds. The request's timestamp is the exact UTC hour; `collected_at` records when the database stored it.

## Query from QGIS or ArcGIS Pro

Open the `voi-postgis` service in Railway. Use its public TCP connection host, port, database, username, and password for a PostgreSQL connection in your GIS application. Require SSL. Do not put database credentials in frontend settings or commit them.

Load `public.voi_positions`, with `objectid` as the unique integer ID and `geom` as the EPSG:4326 point geometry. In ArcGIS Pro, use a PostgreSQL database connection and query layer. This is a spatial database, not an Esri enterprise geodatabase. PostgreSQL and PostGIS version support depends on the installed ArcGIS release.

Filter a snapshot with `captured_at = TIMESTAMPTZ '2026-09-07 12:00:00+00'`. Filter confirmed available vehicles with `is_available IS TRUE`. Use a dedicated database user with SELECT privileges for routine GIS access, rather than sharing the database owner credential.

## Interpret availability

The public `vehicles_in_public_space` endpoint currently supplies only `system_id`, `form_factor`, and `location`. It supplies neither stable vehicle identifiers nor availability. Each `objectid` identifies an observation, not a vehicle across snapshots.

The dashboard uses `is_non_operational` from the authenticated `park_events` endpoint. Its definition includes low battery and other reasons for being unavailable, not just physical defects. Anonymous access to that endpoint returns HTTP 403.

The archive preserves nullable `is_non_operational`, `is_reserved`, and `is_available` fields when supplied. Missing values remain SQL NULL and GeoJSON null. Explicit non-operational or reserved status implies unavailable. A non-defect vehicle is not automatically classified as available. Until the source supplies status, the available-only filter returns no positions.

## Read the HTTP API

`GET /index.json` lists snapshot paths in time order. `GET /snapshots/voi-vehicles-YYYY-MM-DDTHH-MM-SSZ.geojson` returns a GeoJSON FeatureCollection. Add `?available=true`, `?available=false`, or `?available=unknown` to filter availability. All HTTP database transactions are read-only. The API exposes no collection or SQL execution endpoint.

`GET /health` checks database connectivity. The index and snapshots allow public cross-origin reads. The API publishes the public source fields plus observation IDs, timestamps, and nullable status fields.

## Verify locally

Build `Dockerfile.voi-monitor`. Run `python3 -m unittest scripts.test_collect_voi_vehicles scripts.test_voi_database` in that image against a disposable PostGIS database, with `DATABASE_URL` and `VOI_TEST_DATABASE=1`. The integration tests truncate the Voi tables. Never run them against production.
