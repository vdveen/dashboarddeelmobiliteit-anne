# Agent instructions

## exe.dev environment

- This repository runs in an exe.dev VM.
- Use only documented exe.dev features. See <https://exe.dev/docs.md> and <https://exe.dev/docs/proxy.md>.
- Do not use undocumented local endpoints. They are internal, unstable, and unsupported.

## Railway service

- Railway deploys the `main` branch of the `vdveen/dashboarddeelmobiliteit-anne` fork to the existing `dashboarddeelmobiliteit` project and its `production` environment.
- The project ID is `85622316-5f8e-4eec-9a0c-d3ca3336b928`. The production environment ID is `5d7678ad-1cd0-46e4-8993-15dcacdc0dfd`.
- The Railway CLI is installed at `~/.local/bin/railway`. Run `railway whoami` before commands that need Railway access.
- If the CLI is not authenticated, ask the owner to run `railway login`. For a remote terminal without a local browser, use `railway login --browserless` and complete the device-code flow on another device.
- After authentication, link this checkout with `railway link --project 85622316-5f8e-4eec-9a0c-d3ca3336b928 --environment 5d7678ad-1cd0-46e4-8993-15dcacdc0dfd`. Select the existing web service if the CLI asks for a service.
- Do not create another Railway project or service for this app unless the user asks for one. A push to `origin/main` starts the normal production deployment through the GitHub integration.
- Use a project-scoped `RAILWAY_TOKEN` for unattended Railway commands. Never commit a Railway token or account credentials.
- `.railway/railway.ts` defines the `voi-vehicle-monitor` cron service as a named partial. Follow `.railway/README.md` to plan and apply it after the user authenticates the CLI.
- `voi-vehicle-monitor` collects every ten minutes (`*/10 * * * *`) into `voi-postgis`, a PostgreSQL/PostGIS database with a persistent volume. `voi-snapshot-api` serves a read-only HTTP API; the app uses only `POST /availability`, for the chart that opens after a selection on the Aanbod page. No GitHub deploy key is needed.
- The collector rounds `captured_at` down to the nearest ten-minute boundary, so a late container start still writes one row per boundary and the primary key keeps the run idempotent. The volume is 5 GB, the maximum on the current Railway Hobby plan. Ten-minute collection writes roughly 6 GB per year, so the volume fills after about nine months unless the plan is upgraded (then raise `sizeMB` in `.railway/railway.ts`) or old snapshots are pruned.
- `GET /index.json` takes optional ISO-8601 `from` and `to` parameters and defaults to the last seven days. `POST /availability` (also `GET` with a `polygon` query parameter) returns per-snapshot counts inside a GeoJSON Polygon or MultiPolygon. Validation lives in `scripts/voi_availability.py`, which imports neither Flask nor psycopg so it can be unit tested anywhere. Add any new `scripts/voi_*.py` module to the `COPY` line in `Dockerfile.voi-monitor`.
- Keep `DATABASE_URL` and database credentials in Railway. Never print or commit their values.
- `voi-vehicle-monitor` reads the authenticated `park_events` endpoint and needs the `DASHBOARDDEELMOB_KEY` service variable set in the Railway UI. Never commit, log, or print the key. The collector sends it as an `apikey` header, so it never reaches a stored URL. The key for local validation lives in `/home/exedev/.env`, outside the repository; keep it there.
- The 5 GB volume fills around June 2027 at the current rate; revisit retention (upgrade the plan, prune, or downsample) once `/health` reports `database_bytes` above 4 GB.
- After storing its own boundary, each collector run backfills missed ten-minute boundaries, newest first, from `TEN_MINUTE_START` in `scripts/voi_database.py` (older snapshots are hourly). In October 2026 the source answered past timestamps for about 36 hours and returned an empty list further back. The backfill stores no empty answers and stops at the first one or at the first fetch error. A crashed run after an upstream outage (HTTP 502/503) therefore heals on its own once the source recovers, as long as it recovers within that reach.
- The dashboard API combines data grants as one set of allowed operators and one set of allowed municipalities, and a request must pass both. A Voi grant plus a municipality grant (Hilversum, 12 October 2026) therefore leaves only Voi inside that municipality, and `menu/acl` then returns its default operator and municipality lists instead of the real grants. The collector's NL-wide `operators=voi` request gets 403 in that state. Fixing it needs a backend change or an account (and key) with only the Voi grant.
- Every snapshot now stores `is_non_operational`. `is_reserved` and `is_available` stay nullable because the source still omits them. Do not treat unknown status as available.

## Hilversum viewer

- `apps/hilversum/` is a separate public map app for Hilversum and Wijdemeren, served at `/hilversum/`. `npm run build` builds it into `build/hilversum/` after the dashboard. See `apps/hilversum/README.md`.
- It uses public endpoints only and reuses the dashboard's service area and parking hub code. Keep `src/helpers/service-areas/mapData.ts`, `roles.ts`, and `map.service_areas.ts` free of imports that pull in React, Redux, or moment.

## Voi trips page

- `apps/voi-trips/` is a static analysis page served at `/voi-trips/`; `scripts/build-voi-trips.mjs` copies it into `build/voi-trips/` during `npm run build`. See `apps/voi-trips/README.md`.
- The page is behind the dashboard login. It loads its data from `voi-snapshot-api` (`GET /voi-trips/data`), which checks the visitor's dashboard token against the dashboard API's `menu/acl` and only answers for admins or accounts with Voi and a region municipality. When `menu/acl` hides a Voi grant, it checks with `v2/park_events/stats` instead (see `apps/voi-trips/README.md`).
- The data is `scripts/voi_trips_data.enc`, encrypted because the repository is public. The pipeline in `~/data/voi-trips` (outside the repo; it needs the API key and the raw trips) generates it. The key is `VOI_TRIPS_KEY` in Railway (`voi-snapshot-api`) and in `/home/exedev/.env`. Never commit, log, or print it, and never commit the decrypted data.

## Commit and push changes

- After completing and validating a small or medium change or fix, commit and push it when there are no significant risks or unresolved design choices. Do not ask for separate confirmation. The user prefers to revert a change they do not want.
- At the end of each such request, state whether you committed and pushed the code. If you did not, state why.
- Never commit or push changes to the core `Stichting-CROW/dashboarddeelmobiliteit-app` repository unless the user specifically asks you to do so. A request to commit or push that does not name a remote authorizes only the `origin` fork, `vdveen/dashboarddeelmobiliteit-anne`.
