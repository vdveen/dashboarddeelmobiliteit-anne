# Operate the Voi snapshot archive

Railway stores snapshots in PostgreSQL 16 with PostGIS 3.5 on a persistent volume. `voi-vehicle-monitor` collects at `*/10 * * * *` UTC and exits. `voi-snapshot-api` serves the timeline viewer. The named partial in `railway.ts` manages these resources without managing the dashboard web service.

## Deploy changes

1. Run `npm ci` and authenticate with `railway login`.
2. Link production with `railway link --project 85622316-5f8e-4eec-9a0c-d3ca3336b928 --environment 5d7678ad-1cd0-46e4-8993-15dcacdc0dfd`.
3. Push the changes to the fork's `main` branch.
4. Run `railway config plan`. Check that the plan affects only the Voi services and database.
5. Run `railway config apply`.

The database is managed as a Docker service because Railway's database helper does not recognize custom PostGIS images consistently. Its existing generated credentials are preserved. The PostGIS cluster uses `/var/lib/postgresql/data/postgis16` on the 5 GB persistent volume, the maximum on the Railway Hobby plan. Ten-minute collection stores roughly 6 GB per year at the current fleet size, so the volume fills after about nine months. Upgrading the Railway plan allows larger volumes; then raise `sizeMB` in `railway.ts` and run `railway config apply`, which resizes in place. A config apply that includes a resize above the plan limit fails as a whole, including any other change in the same plan. The empty PostgreSQL cluster created by Railway during initial provisioning is not used. Do not change PGDATA or detach the volume on an existing archive.

The viewer defaults to `https://voi-snapshot-api-production.up.railway.app`. Set `REACT_APP_VOI_API_URL` when deploying a viewer against another API address.

Keep database credentials in Railway service variables. `voi-vehicle-monitor` also needs the `DASHBOARDDEELMOB_KEY` service variable, set in the Railway UI with the Dashboard Deelmobiliteit API key. `railway.ts` preserves it, so a config plan does not wipe it. Never commit the key, print it, or put it in a URL; the collector sends it as an `apikey` request header. The key used for local validation lives in `/home/exedev/.env` outside the repository. No GitHub write credential is needed. The previous GitHub archive is no longer updated or read. Its history is not imported.

## Inspect collection

Run `railway service logs --service voi-vehicle-monitor --latest --lines 50`. A successful run reports the position count and snapshot timestamp. The database commits the snapshot and all positions together. Repeating the same boundary does not duplicate the snapshot. A missed run is not automatically backfilled.

Railway schedules the job every ten minutes. Container startup can delay the HTTP request by a few seconds, so the collector rounds the timestamp down to the nearest ten-minute boundary (`floor_to_interval` in `collect_voi_vehicles.py`). Every snapshot therefore lands on :00, :10, :20, :30, :40, or :50, and the `voi_snapshots` primary key still rejects a second run for the same boundary. `collected_at` records when the database stored it.

## Query from QGIS or ArcGIS Pro

Open the `voi-postgis` service in Railway. Use its public TCP connection host, port, database, username, and password for a PostgreSQL connection in your GIS application. Require SSL. Do not put database credentials in frontend settings or commit them.

The current host is `mainline.proxy.rlwy.net`, port `45460`, database `railway`. Get the username and password from the service's Railway variables. The endpoint supports SSL with a self-signed certificate; select SSL mode `require`.

Load `public.voi_positions`, with `objectid` as the unique integer ID and `geom` as the EPSG:4326 point geometry. In ArcGIS Pro, use a PostgreSQL database connection and query layer. This is a spatial database, not an Esri enterprise geodatabase. PostgreSQL and PostGIS version support depends on the installed ArcGIS release.

Filter a snapshot with `captured_at = TIMESTAMPTZ '2026-09-07 12:00:00+00'`. Filter confirmed available vehicles with `is_available IS TRUE`. Use a dedicated database user with SELECT privileges for routine GIS access, rather than sharing the database owner credential.

ArcGIS Pro and QGIS can run the availability aggregate directly, without the HTTP API:

```sql
SELECT s.captured_at,
       count(p.objectid) FILTER (WHERE p.is_non_operational IS FALSE) AS operational,
       count(p.objectid) FILTER (WHERE p.is_non_operational) AS non_operational,
       count(p.objectid) FILTER (WHERE p.is_non_operational IS NULL) AS unknown,
       count(p.objectid) AS total
FROM voi_snapshots s
LEFT JOIN voi_positions p
  ON p.captured_at = s.captured_at
 AND ST_Intersects(p.geom, ST_SetSRID(ST_GeomFromGeoJSON(:polygon), 4326))
WHERE s.captured_at BETWEEN :from AND :to
GROUP BY s.captured_at ORDER BY s.captured_at;
```

## Interpret availability

The collector reads the authenticated `park_events` endpoint, which requires `timestamp` and `operators` query parameters and an `apikey` header. Anonymous access returns HTTP 403, and a request without `timestamp` returns HTTP 500. Every vehicle carries `is_non_operational`, so each snapshot records the non-operational share. `is_non_operational` includes low battery and other reasons for being unavailable, not just physical defects.

`is_reserved` and `is_available` are still absent, so they stay null unless `is_non_operational` is true, which forces `is_available` false. Each `objectid` identifies an observation, not a vehicle across snapshots; the endpoint's `bike_id` is not stored.

The public `vehicles_in_public_space` endpoint is no longer used. It supplies only `system_id`, `form_factor`, and `location`, and ignores the API key.

The archive preserves nullable `is_non_operational`, `is_reserved`, and `is_available` fields when supplied. Missing values remain SQL NULL and GeoJSON null. Explicit non-operational or reserved status implies unavailable. A non-defect vehicle is not automatically classified as available. Until the source supplies status, the available-only filter returns no positions.

## Read the HTTP API

`GET /index.json` lists snapshot paths in time order. It accepts optional `from` and `to` ISO-8601 UTC parameters and defaults to the last seven days when neither is given; `?from=` alone runs to now. An unparseable timestamp or a reversed window returns HTTP 400. `GET /snapshots/voi-vehicles-YYYY-MM-DDTHH-MM-SSZ.geojson` returns a GeoJSON FeatureCollection. Add `?available=true`, `?available=false`, or `?available=unknown` to filter availability. All HTTP database transactions are read-only. The API exposes no collection or SQL execution endpoint.

`POST /availability` counts vehicles per snapshot inside a polygon, for a lasso selection in the viewer. The JSON body takes `polygon` (a WGS84 GeoJSON `Polygon` or `MultiPolygon`), plus optional `from` and `to` with the same default window as the index. `GET /availability?polygon=<geojson>&from=&to=` accepts the same arguments for quick testing. The API rejects another geometry type, a polygon that fails `ST_IsValid`, or more than 5000 vertices with HTTP 400 and a message. The response is `{"from": iso, "to": iso, "series": [{"captured_at": iso, "total": n, "operational": n, "non_operational": n, "unknown": n}]}`. The three status counts partition `total`: `operational` counts `is_non_operational IS FALSE`, `non_operational` counts `IS TRUE`, and `unknown` counts `IS NULL`. Snapshots collected before 2026-09-08T09:00Z stored no status, so their vehicles all count as unknown rather than operational. Snapshots with no matching vehicle appear with zero counts, so the series has no gaps. The response is `Cache-Control: no-store`, and the endpoint answers an `OPTIONS` preflight with `Content-Type` allowed.

```
curl -s -X POST https://voi-snapshot-api-production.up.railway.app/availability \
  -H 'Content-Type: application/json' \
  -d '{"polygon":{"type":"Polygon","coordinates":[[[5.10,52.08],[5.15,52.08],[5.15,52.12],[5.10,52.12],[5.10,52.08]]]},"from":"2026-09-01T00:00:00Z","to":"2026-09-08T00:00:00Z"}'
```

`GET /health` checks database connectivity. The index and snapshots allow public cross-origin reads. The API publishes the public source fields plus observation IDs, timestamps, and nullable status fields.

## Verify locally

Build `Dockerfile.voi-monitor`. Run `python3 -m unittest scripts.test_collect_voi_vehicles scripts.test_voi_availability scripts.test_voi_database` in that image against a disposable PostGIS database, with `DATABASE_URL` and `VOI_TEST_DATABASE=1`. `scripts.test_collect_voi_vehicles` and `scripts.test_voi_availability` need no database. The integration tests truncate the Voi tables. Never run them against production.

## Reliability and bounded requests

Transient HTTP failures retry up to three times. Permanent client errors stop immediately. Responses above 20 MB or 100000 positions fail explicitly. The service key stays in the request header and is never included in stored URLs or error messages.

Database connection failures, deadlocks, and serialization failures retry the same ten-minute boundary and payload in a new transaction, up to three attempts. A failed transaction commits neither a snapshot nor its positions. Repeating a committed boundary is idempotent. A missed boundary is not silently backfilled with a later observation.

`/index.json` and `/availability` retain their seven-day default and `from`/`to` parameters, with a maximum window of 31 days. Query older history in separate windows. Index responses over 4500 entries, snapshots over 100000 positions, and POST bodies over 1 MB fail explicitly. The polygon validation also rejects unclosed rings and non-finite or out-of-range coordinates. Unknown status remains separate from operational counts.

`/health` reports `latest_capture`, `age_seconds`, and `stale`. A missing capture or one older than 30 minutes is stale even when the database responds. This checks freshness, not historical completeness.

Retention remains indefinite: this PR enables no automatic deletion. The 5 GB Hobby volume is finite. At the current ten-minute cadence, the estimate is roughly 6 GB/year, or about nine months of capacity. Monitor Railway volume usage. Before it fills, upgrade the plan and increase the existing volume, or approve a separate archival/pruning migration. Do not recreate the database or detach its volume.

For a scheduler handover, verify that only `voi-vehicle-monitor` writes snapshots, the old GitHub schedule remains retired, and the API exposes a new ten-minute capture. Keep the existing production resources. Source configuration and local tests alone do not establish that a deployed handover succeeded.
