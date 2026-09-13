const fs = require('fs');
const path = require('path');
const {createRequire} = require('module');
const root = process.argv[2] || process.cwd();
const req = createRequire(path.join(root, 'package.json'));
const ts = req('typescript');
function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    fileName: file.replace(/\.jsx$/, '.tsx'),
    compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020}
  }).outputText;
  const mod = {exports: {}};
  new Function('require', 'module', 'exports', output)(name => name in mocks ? mocks[name] : req(name), mod, mod.exports);
  return mod.exports;
}
async function main() {
  const kpi = load('src/helpers/stats/availability-kpi.ts', {'../../api/beleidszones': {getBeleidszonesAvailabilityStats: async () => null}});
  const series = await kpi.fetch5mAvailabilitySeries(null, 123, '2026-08-01', '2026-08-01');
  console.log('Failed availability API:', JSON.stringify({intervals: series.length, kpi: kpi.computeAvailabilityKpi(series, {windowStartHour: 8, windowEndHour: 20, threshold: 1}).overallPct}));
  process.env.TZ = 'Europe/Amsterdam';
  let requestedUrl;
  const api = load('src/api/beleidszones.ts', {'./dedupedFetch': {dedupedFetch: async url => {requestedUrl = url; return {ok: true, json: async () => ({})};}}});
  await api.getBeleidszonesAvailabilityStats(null, {zoneIds: [123], startTime: '2026-08-01T08:00:00+02:00', endTime: '2026-08-01T09:00:00+02:00'});
  console.log('08:00 Amsterdam API start:', new URL(requestedUrl, 'https://example.com').searchParams.get('start_time'));
  process.env.TZ = 'UTC';
  const csv = load('src/helpers/rentalsCsvImport.js');
  for (const row of ['voi;52,123;4,567;;', 'voi;52garbage;4garbage;;']) {
    console.log('CSV numeric parsing:', JSON.stringify(csv.parseRentalsCsv('system_id;lat;lon;start_time;end_time\n' + row)));
  }
  const reducer = load('src/reducers/filter.js').default;
  const filter = reducer({...reducer(undefined, {}), gebied: 'GM0363', zones: '123', aanbiedersexclude: 'voi'}, {type: 'APPLY_PUBLIC_DEFAULT_FILTERS', payload: {aanbiedersexclude: 'other'}});
  console.log('Defaults overwrite existing selection:', JSON.stringify({gebied: filter.gebied, zones: filter.zones, aanbiedersexclude: filter.aanbiedersexclude}));
  const {JSDOM} = req('jsdom');
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {url: 'http://localhost'});
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = req('react'); const {createRoot} = req('react-dom/client'); const {act} = req('react-dom/test-utils');
  const Selection = load('src/components/SelectionTool/SelectionTool.tsx', {'./SelectionTool.css': {}}).default;
  const listeners = {}; let panEnabled = true;
  const map = {getSource: () => null, isStyleLoaded: () => false, getCanvas: () => document.body,
    on: (event, fn) => {listeners[event] = fn;}, off: (event, fn) => {if (listeners[event] === fn) delete listeners[event];},
    dragPan: {isEnabled: () => panEnabled, enable: () => {panEnabled = true;}, disable: () => {panEnabled = false;}}};
  const reactRoot = createRoot(document.getElementById('root'));
  act(() => reactRoot.render(React.createElement(Selection, {map, vehicles: {data: {features: []}}})));
  act(() => document.querySelector('button').click());
  act(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Lasso').click());
  act(() => listeners.mousedown({preventDefault() {}, lngLat: {lng: 4, lat: 52}}));
  console.log('Drag pan enabled after lasso mousedown:', panEnabled);
  const provider = load('src/components/PrestatiesAanbieders/ProviderLabel.tsx');
  const maliciousId = '<img src=x onerror=alert(1)>';
  const imported = csv.parseRentalsCsv('system_id,lat,lon,start_time,end_time\n' + maliciousId + ',52,4,,').rows[0];
  const popup = document.createElement('div');
  popup.innerHTML = provider.buildProviderLabelHtml(imported.system_id, '#666');
  console.log('Imported provider creates an HTML image:', !!popup.querySelector('img[onerror]'));
  act(() => reactRoot.unmount());
  if (fs.existsSync(path.join(root, 'src/helpers/csv.ts'))) {
    const upstreamCsv = load('src/helpers/csv.ts');
    console.log('Upstream formula cell:', upstreamCsv.toCsv(['=1+1'], [{header: 'name', value: x => x}]));
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
