// Build the national zones map (apps/zones) into build/zones, next to the
// dashboard build, so the static server serves it at /zones/.
//
//   node scripts/build-zones.mjs          production build
//   node scripts/build-zones.mjs --serve  rebuild on change, serve on :3002 (or $PORT)
import { buildMapApp } from './build-map-app.mjs';

await buildMapApp({
  name: 'zones',
  label: 'Zones map',
  port: 3002,
  assets: [
    // The dashboard's own hub pin
    ['public/components/MapComponent/hub-icon-mijksenaar.png', 'hub-icon.png']
  ]
});
