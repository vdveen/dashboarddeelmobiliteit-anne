// Build one of the standalone map apps in apps/ into build/<name>, next to
// the dashboard build, so the static server serves it at /<name>/. Used by
// build-hilversum.mjs and build-zones.mjs.
//
// Each app is a separate esbuild bundle and does not load the dashboard.
// MapLibre is copied from node_modules as its own script instead of being
// bundled, because bundling its prebuilt worker breaks it.
import { build, context } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Same backend defaults as the Dockerfile build args
const env = (name) => JSON.stringify(process.env[name] || '');

/**
 * @param {object} app
 * @param {string} app.name       folder in apps/ and in build/
 * @param {string} app.label      name in the dev server log
 * @param {number} app.port       default dev server port
 * @param {[string, string][]} app.assets  [source relative to the repo, file name in the output]
 */
export const buildMapApp = async ({ name, label, port, assets }) => {
  const appDir = path.join(root, 'apps', name);
  const outDir = path.join(root, 'build', name);
  const serve = process.argv.includes('--serve');

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
      ...assets.map(([source, target]) => copyFile(path.join(root, source), path.join(outDir, target)))
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
    const served = await ctx.serve({ servedir: path.join(root, 'build'), port: Number(process.env.PORT) || port });
    console.log(`${label} on http://localhost:${served.port}/${name}/`);
  } else {
    const result = await build(options);
    await writeStatic(result.metafile);
  }
};
