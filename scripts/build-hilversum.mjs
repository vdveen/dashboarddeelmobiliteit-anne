// Build the public Hilversum viewer (apps/hilversum) into build/hilversum,
// next to the dashboard build, so the static server serves it at /hilversum/.
//
//   node scripts/build-hilversum.mjs          production build
//   node scripts/build-hilversum.mjs --serve  rebuild on change, serve on :3001 (or $PORT)
import { buildMapApp } from './build-map-app.mjs';

await buildMapApp({
  name: 'hilversum',
  label: 'Hilversum viewer',
  port: 3001,
  assets: [
    ['apps/hilversum/public/logo.svg', 'logo.svg'],
    // The dashboard's own hub pin
    ['public/components/MapComponent/hub-icon-mijksenaar.png', 'hub-icon.png']
  ]
});
