# Hilversum viewer

A public map of shared bikes, mopeds and cars in Hilversum and Wijdemeren, built
as a trial for the municipality. It is served at `/hilversum/` next to the
dashboard. The interface is in Dutch.

## What it shows

- Live vehicle locations from `dashboard-api/public/vehicles_in_public_space`,
  limited to the zones of Hilversum (GM0402) and Wijdemeren (GM1696). Shared
  cars are limited to the Greenwheels and MyWheels pilot.
- A segmented control switches between all vehicles, bikes, mopeds and cars.
  The choice is kept in the URL hash (`#fietsen`, `#scooters`, `#autos`).
- The service area where a Check moped ride may end, from the MDS
  `public/service_area` endpoint.
- Parking hubs (P signs) of the operators with vehicles on the map, drawn with
  the dashboard's own code (`renderParkingHubs` in
  `src/components/Map/MapUtils/map.service_areas.ts`, roles from
  `src/helpers/service-areas/roles.ts`). Only Voi publishes hubs here, so the
  legend says the P signs are for Voi bikes only.
- With the bikes selected, Voi's hubs in the other municipalities where it
  publishes them show too, so people can see where they can ride to. They load
  the first time the bikes are shown (about 670 kB compressed). The list lives
  in `VOI_HUB_MUNICIPALITIES` in `src/data.ts`; the API needs explicit
  municipalities. To refresh it, request
  `service_area?operators=voi&municipalities=…` for every code in
  `dashboard-api/public/municipalities` (8 MB) and keep the municipalities
  whose features include hubs.
- The header, toggle and the card for a tapped vehicle, hub or area stack at
  the top. The legend, with the vehicle count, sits at the bottom.
- The municipal borders from `dashboard-api/public/zones`, with the surroundings
  dimmed.

Every endpoint is public and needs no key. The base map is OpenFreeMap Positron
with lightly tinted water and greenery. The logo is a copy of
`https://hilversum.nl/themes/custom/hilversum/logo.svg`.

## Develop and build

    npm run start:hilversum      # http://localhost:3001/hilversum/ (PORT to change)
    node scripts/build-hilversum.mjs

`npm run build` runs the dashboard build and then this one, which writes
`build/hilversum/`. The viewer is a separate esbuild bundle and does not load
the dashboard. MapLibre is copied from `node_modules` as its own script
instead of being bundled, because bundling its prebuilt worker breaks it.
