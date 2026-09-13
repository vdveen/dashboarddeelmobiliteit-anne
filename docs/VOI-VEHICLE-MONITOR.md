# Use the Voi vehicle monitor

This fork keeps its own archive of Voi vehicle positions in the Netherlands and
shows it back as a timeline on a map. Nothing about this depends on GitHub
Actions any more: there is no hourly workflow, no artifact download, and no
`voi-vehicle-data` branch. Three Railway services do the work.

## How a snapshot is made

`voi-vehicle-monitor` is a Railway cron service that runs every ten minutes
(`*/10 * * * *`, UTC) and exits. Each run reads the authenticated `park_events`
endpoint of the Dashboard Deelmobiliteit API, filtered to Voi, and writes one
snapshot row plus one row per observed vehicle into `voi-postgis`, a
PostgreSQL 16 database with PostGIS on a persistent volume.

Container start-up can delay the request by a few seconds, so the collector
rounds the capture time down to the nearest ten-minute boundary. Every snapshot
therefore lands on :00, :10, :20, :30, :40 or :50 UTC, and the snapshot primary
key rejects a second write for the same boundary, which makes a re-run
harmless. A separate `collected_at` column records when the row was actually
stored. A missed run is not backfilled later; the boundary simply has no
snapshot.

Each stored position carries an observation id, the system id, the form factor,
a point geometry in EPSG:4326, and three nullable status flags. An observation
id identifies one sighting, not a vehicle across snapshots, so you cannot follow
an individual bike through the timeline.

## What "unknown" means

The source supplies `is_non_operational` for every vehicle. It does not supply
`is_reserved` or `is_available`, which stay NULL unless `is_non_operational` is
true, which forces `is_available` false. Non-operational covers low battery and
other reasons a vehicle is out of service, not only physical damage.

A vehicle counts as unknown when `is_non_operational` is NULL. That happens for
everything collected before 2026-09-08T09:00Z, when the collector did not store
status yet. Unknown is never folded into operational. If a chart shows a large
unknown band in older history, that is missing data, not a fleet problem.

## The read-only API

`voi-snapshot-api` is a small Flask service that serves the archive over HTTP.
Every database transaction it opens is read-only, and it exposes no endpoint
that collects data or runs SQL.

- `GET /health` checks the database and reports `latest_capture`,
  `age_seconds`, `stale`, the number of unusable records the last run skipped,
  and database size counters. `stale` is true when there is no
  capture at all or the newest one is older than 30 minutes.
- `GET /index.json` lists snapshot paths in time order. Optional `from` and `to`
  take ISO-8601 UTC timestamps; without them it returns the last seven days.
  The widest accepted window is 31 days. A bad or reversed window returns 400.
- `GET /snapshots/voi-vehicles-YYYY-MM-DDTHH-MM-SSZ.geojson` returns one
  snapshot as a GeoJSON FeatureCollection. `?available=true|false|unknown`
  filters on the availability flag.
- `POST /availability` (or `GET /availability?polygon=...`) counts vehicles per
  snapshot inside a GeoJSON `Polygon` or `MultiPolygon`, with the same `from`
  and `to` parameters. The response is a `series` of points with `total`,
  `operational`, `non_operational` and `unknown`; those three partition
  `total`. Snapshots with no vehicle in the area appear with zero counts, so
  the series has no gaps. An invalid geometry, a wrong geometry type or an
  oversized polygon returns 400 with a message.

The viewer picks the API address from `REACT_APP_VOI_API_URL` at build time and
falls back to the production API service.

## The viewer

Open `/monitor/voi` in the deployed app (route `VoiVehicleHistory` in
`src/App.tsx`). The page loads the snapshot index, then fetches one snapshot at
a time and draws it on a PDOK background map, either as clusters or as a
heatmap. Drag the timeline, scroll over the timeline panel, or use the arrow
buttons to step between snapshots; the play button advances automatically and
prefetches the next frame. The download button saves the snapshot you are
looking at as GeoJSON.

The "Gebied" controls draw an area on the map, either by clicking polygon
points or by dragging a lasso. Finishing an area calls `/availability` for it
and opens a chart under the map showing operational, non-operational and
unknown counts, and the operational share, over the last 7 or 31 days. The
chart has its own CSV export. Clearing the area closes the chart.

## When something looks wrong

Start with `/health`. If `stale` is true, collection has stopped or is behind.

Then read the collector logs:

    railway service logs --service voi-vehicle-monitor --latest --lines 50

A successful run reports the position count and the snapshot timestamp. The
snapshot and its positions commit together, so a failed run leaves neither.
Transient HTTP and database failures retry a few times within the same run;
after that the boundary is skipped.

Gaps in the timeline are normal after an outage and are not repaired
automatically. A flat unknown band in the distant past is the pre-2026-09-08
status gap described above.

The database volume is 5 GB, the Railway Hobby maximum, and ten-minute
collection writes roughly 6 GB a year, so it fills after about nine months
unless the plan is upgraded or old snapshots are pruned. Nothing deletes data
today; watch the volume usage in Railway.

## More detail

`.railway/README.md` covers operations: deploying config changes, service
variables, connecting QGIS or ArcGIS Pro directly to `voi-postgis`, the request
and response limits, and running the tests locally.
