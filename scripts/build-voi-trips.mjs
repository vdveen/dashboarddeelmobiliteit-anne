// Copy the Voi trips page (apps/voi-trips) into build/voi-trips, next to the
// dashboard build, so the static server serves it at /voi-trips/.
//
//   node scripts/build-voi-trips.mjs
//
// The page holds no data: it loads it from voi-snapshot-api with the visitor's
// dashboard login (see apps/voi-trips/README.md). This fills in the API URL
// and a cache-busting MapLibre version, and vendors MapLibre.
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'apps/voi-trips');
const outDir = path.join(root, 'build/voi-trips');
const maplibre = path.join(root, 'node_modules/maplibre-gl/dist');
// Same default as src/api/voiSnapshots.ts
const apiUrl = (process.env.REACT_APP_VOI_API_URL || 'https://voi-snapshot-api-production.up.railway.app').replace(/\/$/, '');

await rm(outDir, { recursive: true, force: true });
await mkdir(path.join(outDir, 'vendor'), { recursive: true });

const { version } = JSON.parse(await readFile(path.join(root, 'node_modules/maplibre-gl/package.json'), 'utf8'));
const html = (await readFile(path.join(appDir, 'index.html'), 'utf8'))
  .replaceAll('%MAPLIBRE_VERSION%', version)
  .replace('%VOI_API_URL%', apiUrl);

await Promise.all([
  writeFile(path.join(outDir, 'index.html'), html),
  copyFile(path.join(maplibre, 'maplibre-gl.js'), path.join(outDir, 'vendor/maplibre-gl.js')),
  copyFile(path.join(maplibre, 'maplibre-gl.css'), path.join(outDir, 'vendor/maplibre-gl.css'))
]);
console.log(`build/voi-trips written (MapLibre ${version}, data from ${apiUrl})`);
