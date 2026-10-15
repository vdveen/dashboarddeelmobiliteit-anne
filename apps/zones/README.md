# Zones map

A national map of the zones in the MDS feed
(`https://mds.dashboarddeelmobiliteit.nl/public/zones`), per municipality. It
is served at `/zones/` next to the dashboard. The interface is in Dutch.

## What it shows

- Stops with `stop.is_virtual` false are physical hubs: the dashboard's green
  hub pin (`public/components/MapComponent/hub-icon-mijksenaar.png`, copied to
  `hub-icon.png` at build time), as a dot below zoom 12 and with its area from
  zoom 14.
- Stops with `stop.is_virtual` true are virtual parking zones, drawn with the
  dashboard's own parking hub code (`renderParkingHubs` in
  `src/components/Map/MapUtils/map.service_areas.ts`): a blue P, as a dot
  below zoom 12. Its fill opacity is lowered here because some virtual zones
  cover a whole city centre.
- No-parking zones (`geography_type` `no_parking`) as red areas.
- Hovering shows the zone's name, kind and vehicle types. Where zones overlap,
  the smallest one under the pointer wins. On touch screens a tap shows the
  same; a tap on a dot zooms in.
- The place list is the dashboard's: "Alle plaatsen" and then every
  municipality from `dashboard-api/public/municipalities`, in API order, with
  a search field, without the regional presets and ordering of this fork.
  Choosing a place frames its border (from `dashboard-api/public/zones`) and
  dims the surroundings.
- The vehicle type chips (Fiets, Bakfiets, Scooter, Auto, the names of the
  dashboard's public filter) can be combined. A zone shows when one of its
  `affected_modalities` is selected.
- Place and vehicle types are kept in the URL: `?gm_code=GM0193&modaliteiten=moped,car`.

The whole feed loads once, about 0.7 MB compressed, with `phases=active`: a
moved zone keeps its older version in the feed as `retirement_concept`, which
would otherwise show next to the new one. Every endpoint is public and needs
no key. The base map is OpenFreeMap Positron.

## Develop and build

    npm run start:zones      # http://localhost:3002/zones/ (PORT to change)
    node scripts/build-zones.mjs

`npm run build` runs it after the dashboard build. It shares
`scripts/build-map-app.mjs` with the Hilversum viewer.
