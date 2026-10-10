# Voi trips in Amersfoort and the Gooi

A static analysis page served at `/voi-trips/`. It shows the 200 busiest
relations between Voi parking places in Amersfoort, Soest, Baarn, Eemnes,
Laren, Blaricum, Huizen, Gooise Meren, Hilversum and Wijdemeren, and the share
of trip starts per hour and weekday. The interface is in English.

- `index.html` is the page. `scripts/build-voi-trips.mjs` copies it with
  `data.js` and the vendored MapLibre into `build/voi-trips/` during
  `npm run build`.
- `data.js` holds the aggregated counts only (no individual trips). It is
  generated, not edited by hand.

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
4. `viz_data.py` writes `data.js` here. The period is 1 June to 4 October 2026,
   whole weeks only, so every weekday occurs equally often.

The page is public: anyone with the URL can open it. `robots` is set to
`noindex`.
