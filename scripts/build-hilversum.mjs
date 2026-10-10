// Build the public Hilversum viewer (apps/hilversum) into build/hilversum,
// next to the dashboard build, so the static server serves it at /hilversum/.
//
//   node scripts/build-hilversum.mjs          production build
//   node scripts/build-hilversum.mjs --serve  rebuild on change, serve on :3001 (or $PORT)
import { build, context } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'apps/hilversum');
const outDir = path.join(root, 'build/hilversum');
const serve = process.argv.includes('--serve');

// Same backend defaults as the Dockerfile build args
const env = (name) => JSON.stringify(process.env[name] || '');

const options = {
  entryPoints: [path.join(appDir, 'src/main.ts')],
  bundle: true,
  minify: !serve,
  sourcemap: true,
  target: ['es2019', 'safari13'],
  format: 'iife',
  outdir: outDir,
  entryNames: serve ? 'app' : 'app-[hash]',
  metafile: true,
  logLevel: 'info',
  define: {
    'process.env.REACT_APP_MAIN_API_URL': env('REACT_APP_MAIN_API_URL'),
    'process.env.REACT_APP_MDS_URL': env('REACT_APP_MDS_URL'),
    'process.env.NODE_ENV': JSON.stringify(serve ? 'development' : 'production')
  }
};

const writeStatic = async (metafile) => {
  const outputs = Object.keys(metafile.outputs).map((file) => path.basename(file));
  const js = outputs.find((file) => file.endsWith('.js'));
  const css = outputs.find((file) => file.endsWith('.css'));
  // The vendored MapLibre files keep their names; the version busts caches
  const { version } = JSON.parse(await readFile(path.join(root, 'node_modules/maplibre-gl/package.json'), 'utf8'));
  const html = (await readFile(path.join(appDir, 'index.html'), 'utf8'))
    .replace('%APP_JS%', js)
    .replace('%APP_CSS%', css)
    .replaceAll('%MAPLIBRE_VERSION%', version);
  await writeFile(path.join(outDir, 'index.html'), html);
};

const copyAssets = async () => {
  await mkdir(path.join(outDir, 'vendor'), { recursive: true });
  const maplibre = path.join(root, 'node_modules/maplibre-gl/dist');
  await Promise.all([
    copyFile(path.join(maplibre, 'maplibre-gl.js'), path.join(outDir, 'vendor/maplibre-gl.js')),
    copyFile(path.join(maplibre, 'maplibre-gl.css'), path.join(outDir, 'vendor/maplibre-gl.css')),
    copyFile(path.join(appDir, 'public/logo.svg'), path.join(outDir, 'logo.svg'))
  ]);
};

await rm(outDir, { recursive: true, force: true });
await copyAssets();

if (serve) {
  const ctx = await context({
    ...options,
    plugins: [{
      name: 'write-index',
      setup(b) {
        b.onEnd((result) => result.metafile && writeStatic(result.metafile));
      }
    }]
  });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: path.join(root, 'build'), port: Number(process.env.PORT) || 3001 });
  console.log(`Hilversum viewer on http://localhost:${port}/hilversum/`);
} else {
  const result = await build(options);
  await writeStatic(result.metafile);
}
