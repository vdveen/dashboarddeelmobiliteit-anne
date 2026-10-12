# Voi trips in Amersfoort and the Gooi

A static analysis page served at `/voi-trips/`. It shows the 200 busiest
relations for trips in Amersfoort, Soest, Baarn, Eemnes, Laren, Blaricum,
Huizen, Gooise Meren, Hilversum and Wijdemeren, and the share of trip starts
per hour and weekday. The interface is in English.

A toggle groups trip ends either by hub place or by CBS buurt, and a second
ranks the relations by number of trips or by total km. The URL hash keeps the
view (`#buurten`, `#km`, `#buurten+km`). The heatmap is the same in all views.

Distances are the API's `distance_in_meters`, which is the straight line from
start to end, so total km undercounts the distance actually ridden. Trips of
over 100 km are left out everywhere: they are moves by Voi between the region
and Groningen (125 km or more; the longest trip below them is 30 km).

## Login

The page is for Dashboard Deelmobiliteit users. It holds no data itself:

- `index.html` reads the dashboard login token from `localStorage`
  (`CROWDD_reduxState`, as the dashboard stores it on the same domain) and
  loads the data from `voi-snapshot-api` at `GET /voi-trips/data` with that
  token. Without a login, or with an expired one, it shows a button to the
  dashboard's `/login?redirect=/voi-trips/`, which returns here afterwards.
- The API (`scripts/voi_api.py`, `scripts/voi_trips_access.py`) asks the
  dashboard API for the account's `menu/acl` with the same token. A token the
  dashboard API rejects gets 401. An account gets the data only when it is an
  admin, or has Voi among its operators and at least one of the ten
  municipalities; others get 403. An account with both an operator grant and
  a municipality grant gets default lists from `menu/acl` that hide Voi. For
  those, the API asks `v2/park_events/stats` per region zone and accepts the
  account when the zone answers for `operators=voi` but refuses a request
  without an operator filter.
- The repository is public, so the data is committed encrypted as
  `scripts/voi_trips_data.enc` (gzipped JSON, Fernet). The key is the
  `VOI_TRIPS_KEY` variable of `voi-snapshot-api` in Railway and `VOI_TRIPS_KEY`
  in `~/.env` on the analysis VM. Never commit or print it, and never commit
  the decrypted data. An unencrypted `data.js` was removed from the history
  on 11 October 2026 by rewriting `main`.
- `scripts/build-voi-trips.mjs` copies the page and the vendored MapLibre into
  `build/voi-trips/` during `npm run build` and fills in the API URL
  (`REACT_APP_VOI_API_URL`, default `https://voi-snapshot-api-production.up.railway.app`).

## How the data is made

The pipeline runs outside the repo, in `~/data/voi-trips` on the analysis VM,
because it needs the authenticated `dashboard-api/trips` endpoint and the raw
trips. See the README there.

1. `fetch.py` dumps all Voi trips from `dashboard-api/trips` (v1).
2. `enrich.ts` adds municipality (PDOK), CBS wijk and buurt, and the nearest
   parking hub within 20 m at the time of the trip. Hubs come from the MDS
   service area history and are classified with
   `src/helpers/service-areas/roles.ts`.
3. `places.py` groups the hubs into places: every two hubs in a place are at
   most 500 m apart in a straight line (complete linkage). A trip end counts for
   the place of its nearest hub within 500 m. A place is named after the buurt of
   its busiest hub, or `NS <station>` when the hub nearest a ProRail station
   (PDOK spoorwegen) is in it and within 500 m.
4. `viz_data.py` writes the encrypted `scripts/voi_trips_data.enc`, with the top relations for both
   groupings. Every trip end lies in a CBS buurt (`enrich.ts`); a buurt's line
   end is the mean location of its trip starts and ends. The buurt outlines in
   `data.js` are simplified to about 5 m. The period is 1 June to 4 October 2026,
   whole weeks only, so every weekday occurs equally often.

After regenerating, commit and push `scripts/voi_trips_data.enc`; that
redeploys `voi-snapshot-api`, which reads the file once per process.
`robots` is set to `noindex`.
