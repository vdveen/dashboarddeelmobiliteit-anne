// Copy the Voi trips page (apps/voi-trips) into build/voi-trips, next to the
// dashboard build, so the static server serves it at /voi-trips/.
//
//   node scripts/build-voi-trips.mjs
//
// The page is static: data.js is generated outside the repo (see
// apps/voi-trips/README.md), so this only fills in cache-busting versions and
// vendors MapLibre.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'apps/voi-trips');
const outDir = path.join(root, 'build/voi-trips');
const maplibre = path.join(root, 'node_modules/maplibre-gl/dist');

await rm(outDir, { recursive: true, force: true });
await mkdir(path.join(outDir, 'vendor'), { recursive: true });

const data = await readFile(path.join(appDir, 'data.js'));
const { version } = JSON.parse(await readFile(path.join(root, 'node_modules/maplibre-gl/package.json'), 'utf8'));
const html = (await readFile(path.join(appDir, 'index.html'), 'utf8'))
  .replaceAll('%MAPLIBRE_VERSION%', version)
  .replace('%DATA_HASH%', createHash('sha256').update(data).digest('hex').slice(0, 10));

await Promise.all([
  writeFile(path.join(outDir, 'index.html'), html),
  writeFile(path.join(outDir, 'data.js'), data),
  copyFile(path.join(maplibre, 'maplibre-gl.js'), path.join(outDir, 'vendor/maplibre-gl.js')),
  copyFile(path.join(maplibre, 'maplibre-gl.css'), path.join(outDir, 'vendor/maplibre-gl.css'))
]);
console.log(`build/voi-trips written (MapLibre ${version})`);
