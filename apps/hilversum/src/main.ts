import './style.css';
import type maplibreglModule from 'maplibre-gl';
import type { Map as MaplibreMap, GeoJSONSource, MapGeoJSONFeature, PointLike } from 'maplibre-gl';
import { splitServiceAreasForMap } from '../../../src/helpers/service-areas/mapData';
import {
  renderServiceAreas,
  renderParkingHubs,
  PARKING_HUBS_MAP_LAYER_IDS
} from '../../../src/components/Map/MapUtils/map.service_areas';
import {
  getProvider,
  getProviderColorForProvider,
  getProviderWebsiteUrl
} from '../../../src/helpers/providers';
import {
  Category,
  REGION_BOUNDS,
  categoryOf,
  fetchMunicipalityBorders,
  fetchServiceAreas,
  fetchVehicles
} from './data';
import { GlyphName, drawVehicleMarker, glyphSvg } from './icons';

// MapLibre is loaded as a separate script (see index.html): bundling its
// prebuilt worker breaks it, as the dashboard's craco config explains.
const maplibregl = (window as unknown as { maplibregl: typeof maplibreglModule }).maplibregl;

type Mode = 'all' | Category;

const MODES: { mode: Mode; label: string; slug: string; glyph: GlyphName }[] = [
  { mode: 'all', label: 'Alles', slug: 'alles', glyph: 'all' },
  { mode: 'bike', label: 'Fietsen', slug: 'fietsen', glyph: 'bike' },
  { mode: 'moped', label: 'Scooters', slug: 'scooters', glyph: 'moped' },
  { mode: 'car', label: "Auto's", slug: 'autos', glyph: 'car' }
];

const NOUNS: Record<Mode, [singular: string, plural: string]> = {
  all: ['deelvoertuig', 'deelvoertuigen'],
  bike: ['deelfiets', 'deelfietsen'],
  moped: ['deelscooter', 'deelscooters'],
  car: ['deelauto', "deelauto's"]
};

// Check publishes the area where a moped ride may end. Bike operators publish
// parking spots, which show as P signs for every category.
const SERVICE_AREA_CATEGORIES: Category[] = ['moped'];

const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

// Positron is all grey; tint water and greenery lightly, as iOS Maps does
const BASEMAP_PAINT: [layer: string, property: string, value: string][] = [
  ['water', 'fill-color', '#c9dcee'],
  ['waterway', 'line-color', '#c9dcee'],
  ['park', 'fill-color', '#e0eadb'],
  ['landcover_wood', 'fill-color', '#d9e5d3']
];
const REFRESH_MS = 60 * 1000;
const VEHICLE_ICON_MIN_ZOOM = 13;
const TAP_TOLERANCE_PX = 14;

const SERVICE_AREA_LAYER_IDS = ['service_areas-layer-fill', 'service_areas-layer-border'];
const VEHICLE_LAYER_IDS = ['vehicles-dot', 'vehicles-icon'];
const REGION_LAYER_IDS = ['region-mask', 'region-outline'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  mode: 'all' as Mode,
  vehicles: [] as GeoJSON.Feature<GeoJSON.Point>[],
  operatorCategories: new Map<string, Category>(),
  serviceAreasLoaded: false,
  updatedAt: null as Date | null,
  loadError: false,
  userPosition: null as [number, number] | null
};

const modeFromHash = (): Mode =>
  MODES.find(({ slug }) => `#${slug}` === window.location.hash)?.mode || 'all';

const operatorName = (operator: string): string => getProvider(operator)?.name || operator;

// --- Map -------------------------------------------------------------------

const framePadding = () => {
  const header = $('topbar').getBoundingClientRect();
  const bottom = $('bottom').getBoundingClientRect();
  return {
    top: header.bottom + 16,
    bottom: window.innerHeight - bottom.top + 16,
    left: 16,
    right: 16
  };
};

const map: MaplibreMap = new maplibregl.Map({
  container: 'map',
  style: BASEMAP_STYLE,
  bounds: REGION_BOUNDS,
  fitBoundsOptions: { padding: framePadding() },
  attributionControl: false,
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false
});
map.touchZoomRotate.disableRotation();
if (process.env.NODE_ENV === 'development') (window as unknown as { map: MaplibreMap }).map = map;
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
// MapLibre unfolds the compact attribution once the sources report theirs;
// fold it behind its (i) button so it does not cover the map on phones
map.once('idle', () => {
  const attribution = document.querySelector('.maplibregl-ctrl-attrib');
  attribution?.classList.remove('maplibregl-compact-show');
  attribution?.removeAttribute('open');
});

const geolocate = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: false,
  fitBoundsOptions: { maxZoom: 16 }
});
map.addControl(geolocate, 'top-right');
geolocate.on('geolocate', (event: GeolocationPosition) => {
  state.userPosition = [event.coords.longitude, event.coords.latitude];
});
geolocate.on('error', () => showToast('Je locatie is niet beschikbaar.'));

map.on('styleimagemissing', (event: { id: string }) => {
  const match = /^vehicle-(bike|moped|car)-(.+)$/.exec(event.id);
  if (!match) return;
  const image = drawVehicleMarker(match[1] as Category, getProviderColorForProvider(match[2]));
  if (image) map.addImage(event.id, image, { pixelRatio: 2 });
});

const categoryFilter = (mode: Mode) =>
  mode === 'all' ? null : ['==', ['get', 'category'], mode];

const applyModeToMap = () => {
  const filter = categoryFilter(state.mode);
  [...VEHICLE_LAYER_IDS, ...PARKING_HUBS_MAP_LAYER_IDS, ...SERVICE_AREA_LAYER_IDS].forEach((id) => {
    if (map.getLayer(id)) map.setFilter(id, filter as never);
  });
};

// Order from bottom to top: service areas, the dimmed surroundings, the
// municipal border, parking hubs, vehicles
const raiseOwnLayers = () => {
  [...REGION_LAYER_IDS, ...PARKING_HUBS_MAP_LAYER_IDS, ...VEHICLE_LAYER_IDS].forEach((id) => {
    if (map.getLayer(id)) map.moveLayer(id);
  });
};

const addRegionLayers = (borders: GeoJSON.FeatureCollection) => {
  const outerRings = borders.features.flatMap((feature) => {
    const geometry = feature.geometry;
    if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0]);
    return [];
  });
  const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];

  map.addSource('region-mask', {
    type: 'geojson',
    data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, ...outerRings] } }
  });
  map.addSource('region', { type: 'geojson', data: borders });
  map.addLayer({
    id: 'region-mask',
    type: 'fill',
    source: 'region-mask',
    paint: { 'fill-color': '#f2f2f7', 'fill-opacity': 0.6 }
  });
  map.addLayer({
    id: 'region-outline',
    type: 'line',
    source: 'region',
    paint: { 'line-color': '#004a7c', 'line-width': 2, 'line-opacity': 0.55 }
  });
  raiseOwnLayers();
};

const addVehicleLayers = () => {
  map.addSource('vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'vehicles-dot',
    type: 'circle',
    source: 'vehicles',
    maxzoom: VEHICLE_ICON_MIN_ZOOM,
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, VEHICLE_ICON_MIN_ZOOM, 5.5],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5
    }
  });
  map.addLayer({
    id: 'vehicles-icon',
    type: 'symbol',
    source: 'vehicles',
    minzoom: VEHICLE_ICON_MIN_ZOOM,
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], VEHICLE_ICON_MIN_ZOOM, 0.75, 16, 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    }
  });
  applyModeToMap();
};

const toFeature = (operator: string, category: Category, coordinates: [number, number]) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates },
  properties: {
    operator,
    category,
    color: getProviderColorForProvider(operator),
    icon: `vehicle-${category}-${operator}`
  }
});

// --- Data ------------------------------------------------------------------

const loadServiceAreas = async () => {
  const operators = [...state.operatorCategories.keys()];
  try {
    const serviceAreas = await fetchServiceAreas(operators);
    const { areas, hubs, hubPoints } = splitServiceAreasForMap(serviceAreas);
    const withCategory = (collection: GeoJSON.FeatureCollection, keep: (category: Category) => boolean) => ({
      type: 'FeatureCollection' as const,
      features: collection.features.flatMap((feature) => {
        const category = state.operatorCategories.get(feature.properties?.operator);
        return category && keep(category)
          ? [{ ...feature, properties: { ...feature.properties, category } }]
          : [];
      })
    });
    renderServiceAreas(map, withCategory(areas, (c) => SERVICE_AREA_CATEGORIES.includes(c)));
    renderParkingHubs(map, withCategory(hubs, () => true), withCategory(hubPoints, () => true));
    raiseOwnLayers();
    applyModeToMap();
    state.serviceAreasLoaded = true;
  } catch (error) {
    console.error('Unable to load service areas', error);
  }
};

const refreshVehicles = async () => {
  try {
    const vehicles = await fetchVehicles();
    state.vehicles = vehicles.flatMap((vehicle) => {
      const category = categoryOf(vehicle);
      if (!category) return [];
      if (!state.operatorCategories.has(vehicle.system_id)) {
        state.operatorCategories.set(vehicle.system_id, category);
      }
      return [toFeature(vehicle.system_id, category, [vehicle.location.longitude, vehicle.location.latitude])];
    });
    state.updatedAt = new Date();
    state.loadError = false;
    (map.getSource('vehicles') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: state.vehicles
    });
    if (!state.serviceAreasLoaded) void loadServiceAreas();
    renderLegendOperators();
  } catch (error) {
    console.error('Unable to load vehicles', error);
    state.loadError = true;
  }
  renderStatus();
};

map.on('load', () => {
  BASEMAP_PAINT.forEach(([layer, property, value]) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property, value);
  });
  addVehicleLayers();
  void refreshVehicles();
  fetchMunicipalityBorders()
    .then(addRegionLayers)
    .catch((error) => console.error('Unable to load municipal borders', error));
});

window.setInterval(() => {
  if (!document.hidden) void refreshVehicles();
}, REFRESH_MS);

document.addEventListener('visibilitychange', () => {
  if (document.hidden || !state.updatedAt) return;
  if (Date.now() - state.updatedAt.getTime() >= REFRESH_MS) void refreshVehicles();
});

// --- Interface ---------------------------------------------------------------

const renderSegmented = () => {
  const control = $('segmented');
  control.innerHTML = '<span class="segmented-thumb" aria-hidden="true"></span>';
  MODES.forEach(({ mode, label, glyph }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mode = mode;
    button.innerHTML = glyphSvg(glyph, 18);
    const text = document.createElement('span');
    text.textContent = label;
    button.append(text);
    button.addEventListener('click', () => setMode(mode));
    control.append(button);
  });
};

const setMode = (mode: Mode) => {
  state.mode = mode;
  const index = MODES.findIndex((m) => m.mode === mode);
  const control = $('segmented');
  control.style.setProperty('--active-index', String(index));
  control.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  const slug = MODES[index].slug;
  window.history.replaceState(null, '', slug === 'alles' ? window.location.pathname : `#${slug}`);
  hideDetail();
  applyModeToMap();
  renderStatus();
};

const renderStatus = () => {
  const status = $('status');
  if (!state.updatedAt) {
    status.textContent = state.loadError ? 'Kan de voertuigen nu niet laden' : 'Voertuigen laden…';
    return;
  }
  const count = state.vehicles.filter((f) => state.mode === 'all' || f.properties?.category === state.mode).length;
  const [singular, plural] = NOUNS[state.mode];
  const time = state.updatedAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  status.textContent = `${count} ${count === 1 ? singular : plural} · ${state.loadError ? 'verversen mislukt, ' : ''}bijgewerkt ${time}`;
};

let toastTimer: number | undefined;
const showToast = (message: string) => {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4000);
};

const isApplePlatform = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

const walkingRouteUrl = ([lng, lat]: number[]) =>
  isApplePlatform
    ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;

const distanceText = (coordinates: number[]): string | null => {
  if (!state.userPosition) return null;
  const metres = new maplibregl.LngLat(state.userPosition[0], state.userPosition[1])
    .distanceTo(new maplibregl.LngLat(coordinates[0], coordinates[1]));
  return metres < 1000
    ? `${Math.round(metres / 10) * 10} m van je af`
    : `${(metres / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km van je af`;
};

interface Detail {
  badge: HTMLElement;
  title: string;
  lines: string[];
  coordinates?: number[];
  operator: string;
}

const glyphBadge = (glyph: GlyphName, color: string) => {
  const badge = document.createElement('span');
  badge.className = 'detail-badge';
  badge.style.background = color;
  badge.innerHTML = glyphSvg(glyph, 22);
  return badge;
};

const parkingBadge = () => {
  const badge = document.createElement('span');
  badge.className = 'parking-sign';
  badge.textContent = 'P';
  return badge;
};

const linkButton = (href: string, label: string, glyph: GlyphName, primary: boolean) => {
  const link = document.createElement('a');
  link.className = primary ? 'button button-primary' : 'button';
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.innerHTML = glyphSvg(glyph, 18);
  const text = document.createElement('span');
  text.textContent = label;
  link.append(text);
  return link;
};

const showDetail = ({ badge, title, lines, coordinates, operator }: Detail) => {
  const card = $('detail');
  card.replaceChildren();

  const head = document.createElement('div');
  head.className = 'detail-head';
  const text = document.createElement('div');
  text.className = 'detail-text';
  const heading = document.createElement('h2');
  heading.textContent = title;
  text.append(heading);
  lines.forEach((line) => {
    const p = document.createElement('p');
    p.textContent = line;
    text.append(p);
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close-button';
  close.setAttribute('aria-label', 'Sluiten');
  close.innerHTML = glyphSvg('close', 16);
  close.addEventListener('click', hideDetail);
  head.append(badge, text, close);

  const actions = document.createElement('div');
  actions.className = 'detail-actions';
  if (coordinates) actions.append(linkButton(walkingRouteUrl(coordinates), 'Route', 'route', true));
  const website = getProviderWebsiteUrl(operator);
  if (website) actions.append(linkButton(website, operatorName(operator), 'external', !coordinates));

  card.append(head, actions);
  card.hidden = false;
};

const hideDetail = () => {
  $('detail').hidden = true;
};

const nearest = (features: MapGeoJSONFeature[], point: { x: number; y: number }) => {
  const distance = (feature: MapGeoJSONFeature) => {
    const geometry = feature.geometry as GeoJSON.Point;
    const projected = map.project(geometry.coordinates as [number, number]);
    return Math.hypot(projected.x - point.x, projected.y - point.y);
  };
  return [...features].sort((a, b) => distance(a) - distance(b))[0];
};

const existing = (ids: string[]) => ids.filter((id) => map.getLayer(id));

const tapBox = (point: { x: number; y: number }): [PointLike, PointLike] => [
  [point.x - TAP_TOLERANCE_PX, point.y - TAP_TOLERANCE_PX],
  [point.x + TAP_TOLERANCE_PX, point.y + TAP_TOLERANCE_PX]
];

const HUB_POINT_LAYER_IDS = PARKING_HUBS_MAP_LAYER_IDS.filter((id) => id.includes('points'));
const HUB_SHAPE_LAYER_IDS = PARKING_HUBS_MAP_LAYER_IDS.filter((id) => !id.includes('points'));

map.on('click', (event) => {
  const box = tapBox(event.point);

  const vehicles = map.queryRenderedFeatures(box, { layers: existing(VEHICLE_LAYER_IDS) });
  if (vehicles.length > 0) {
    const vehicle = nearest(vehicles, event.point);
    const { operator, category, color } = vehicle.properties as { operator: string; category: Category; color: string };
    const coordinates = (vehicle.geometry as GeoJSON.Point).coordinates;
    const noun = NOUNS[category][0];
    showDetail({
      badge: glyphBadge(category, color),
      title: `${noun[0].toUpperCase()}${noun.slice(1)} van ${operatorName(operator)}`,
      lines: [distanceText(coordinates) || 'Beschikbaar op deze plek', `Huur via de app van ${operatorName(operator)}.`],
      coordinates,
      operator
    });
    return;
  }

  let hubs = map.queryRenderedFeatures(box, { layers: existing(HUB_POINT_LAYER_IDS) });
  if (hubs.length === 0) {
    // Tapping the hub circle itself: use the matching centre point
    hubs = map.queryRenderedFeatures(event.point, { layers: existing(HUB_SHAPE_LAYER_IDS) });
  }
  if (hubs.length > 0) {
    const hub = hubs[0].geometry.type === 'Point' ? nearest(hubs, event.point) : hubs[0];
    const { operator, category } = hub.properties as { operator: string; category: Category };
    const coordinates = hub.geometry.type === 'Point'
      ? (hub.geometry as GeoJSON.Point).coordinates
      : [event.lngLat.lng, event.lngLat.lat];
    showDetail({
      badge: parkingBadge(),
      title: 'Parkeerplek',
      lines: [
        `Voor ${NOUNS[category][1]} van ${operatorName(operator)}.`,
        distanceText(coordinates) || 'Zet je voertuig hier neer als je je rit beëindigt.'
      ],
      coordinates,
      operator
    });
    return;
  }

  const areas = map.queryRenderedFeatures(event.point, { layers: existing(SERVICE_AREA_LAYER_IDS.slice(0, 1)) });
  if (areas.length > 0) {
    const { operator, category, color } = areas[0].properties as { operator: string; category: Category; color: string };
    showDetail({
      badge: glyphBadge(category, color),
      title: `Gebied van ${operatorName(operator)}`,
      lines: [`Binnen dit gebied kun je een rit met een ${NOUNS[category][0]} van ${operatorName(operator)} beëindigen.`],
      operator
    });
    return;
  }

  hideDetail();
});

map.on('mousemove', (event) => {
  const layers = existing([...VEHICLE_LAYER_IDS, ...PARKING_HUBS_MAP_LAYER_IDS]);
  const hit = map.queryRenderedFeatures(tapBox(event.point), { layers }).length > 0;
  map.getCanvas().style.cursor = hit ? 'pointer' : '';
});

const setupInfoSheet = () => {
  const dialog = $<HTMLDialogElement & HTMLElement>('info-sheet');
  $('info-button').innerHTML = glyphSvg('info', 22);
  $('info-button').addEventListener('click', () => dialog.showModal());
  $('info-close').innerHTML = glyphSvg('close', 16);
  $('info-close').addEventListener('click', () => dialog.close());
  // Close when the backdrop is tapped
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
};

const renderLegendOperators = () => {
  const list = $('legend-operators');
  list.replaceChildren();
  [...state.operatorCategories.entries()]
    .sort(([a], [b]) => operatorName(a).localeCompare(operatorName(b)))
    .forEach(([operator, category]) => {
      const item = document.createElement('li');
      item.append(glyphBadge(category, getProviderColorForProvider(operator)));
      const website = getProviderWebsiteUrl(operator);
      const name = document.createElement(website ? 'a' : 'span');
      name.textContent = operatorName(operator);
      if (name instanceof HTMLAnchorElement && website) {
        name.href = website;
        name.target = '_blank';
        name.rel = 'noopener';
      }
      const label = document.createElement('span');
      label.append(name, ` · ${NOUNS[category][1]}`);
      item.append(label);
      list.append(item);
    });
};

$('locate-button').innerHTML = glyphSvg('locate', 22);
$('locate-button').addEventListener('click', () => geolocate.trigger());

new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty('--bottom-height', `${entry.target.getBoundingClientRect().height}px`);
}).observe($('bottom'));

renderSegmented();
setupInfoSheet();
setMode(modeFromHash());
window.addEventListener('hashchange', () => setMode(modeFromHash()));
