import './style.css';
import type maplibreglModule from 'maplibre-gl';
import type { Map as MaplibreMap, GeoJSONSource, LngLatBounds, MapMouseEvent, MapGeoJSONFeature, PointLike } from 'maplibre-gl';
import {
  renderParkingHubs,
  PARKING_HUBS_MAP_LAYER_IDS
} from '../../../src/components/Map/MapUtils/map.service_areas';
import {
  MODALITIES,
  Modality,
  Municipality,
  ZoneData,
  ZoneKind,
  fetchMunicipalities,
  fetchMunicipalityBorder,
  fetchZones
} from './data';

// MapLibre is loaded as a separate script (see index.html): bundling its
// prebuilt worker breaks it, as the dashboard's craco config explains.
const maplibregl = (window as unknown as { maplibregl: typeof maplibreglModule }).maplibregl;

const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const NETHERLANDS: [number, number, number, number] = [3.3, 50.75, 7.25, 53.6];

// The green of the dashboard's hub pin, and its red for no-parking zones
// (themes.zone.no_parking)
const HUB_COLOR = '#23b36b';
const NO_PARKING_COLOR = '#fd3e48';
// Same switch from dots to icons as the parking zones in map.service_areas.ts
const HUB_ICON_MIN_ZOOM = 12;
const HUB_AREA_MIN_ZOOM = 14;
const HOVER_TOLERANCE_PX = 6;

const [, , PARKING_DOT_LAYER, PARKING_ICON_LAYER] = PARKING_HUBS_MAP_LAYER_IDS;
const [PARKING_FILL_LAYER] = PARKING_HUBS_MAP_LAYER_IDS;
const HUB_LAYER_IDS = ['hubs-fill', 'hubs-line', 'hub-points-dot', 'hub-points-icon'];
const NO_PARKING_LAYER_IDS = ['no-parking-fill', 'no-parking-line'];
const ZONE_LAYER_IDS = [...NO_PARKING_LAYER_IDS, ...PARKING_HUBS_MAP_LAYER_IDS, ...HUB_LAYER_IDS];
const REGION_LAYER_IDS = ['region-mask', 'region-outline'];

// Hover order: the pins and dots, then the smallest area under the pointer
const POINT_LAYER_IDS = ['hub-points-icon', 'hub-points-dot', PARKING_ICON_LAYER, PARKING_DOT_LAYER];
const AREA_LAYER_IDS = ['hubs-fill', PARKING_FILL_LAYER, 'no-parking-fill'];
const DOT_LAYER_IDS = ['hub-points-dot', PARKING_DOT_LAYER];

const KIND_LABELS: Record<ZoneKind, string> = {
  hub: 'Hub',
  parking: 'Virtuele parkeerzone',
  no_parking: 'Verbodsgebied'
};

const KINDS: ZoneKind[] = ['hub', 'parking', 'no_parking'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const params = new URLSearchParams(window.location.search);
const modalitiesFromUrl = params.get('modaliteiten')?.split(',')
  .filter((id): id is Modality => MODALITIES.some((m) => m.id === id));

const state = {
  place: params.get('gm_code') || '',
  modalities: new Set<Modality>(modalitiesFromUrl ?? MODALITIES.map((m) => m.id)),
  municipalities: [] as Municipality[],
  data: null as ZoneData | null,
  loadError: false
};

const borders = new Map<string, Promise<GeoJSON.Geometry | null>>();

const municipalityName = (code: string): string =>
  state.municipalities.find((m) => m.code === code)?.name || code;

const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features
});

// --- Map -------------------------------------------------------------------

const wideScreen = window.matchMedia('(min-width: 720px)');

// Keep what is framed clear of the panel: beside it on wide screens, below it
// on phones
const framePadding = () => {
  const panel = document.querySelector('.panel')!.getBoundingClientRect();
  return wideScreen.matches
    ? { top: 24, bottom: 24, left: panel.right + 24, right: 24 }
    : { top: panel.bottom + 16, bottom: 24, left: 16, right: 16 };
};

const map: MaplibreMap = new maplibregl.Map({
  container: 'map',
  style: BASEMAP_STYLE,
  bounds: NETHERLANDS,
  fitBoundsOptions: { padding: framePadding() },
  attributionControl: false,
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false
});
map.touchZoomRotate.disableRotation();
if (process.env.NODE_ENV === 'development') (window as unknown as { map: MaplibreMap }).map = map;
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

const zoneFilter = () => {
  const modalities = [...state.modalities].map((id) => ['==', ['get', `m_${id}`], true]);
  const filter: unknown[] = ['all', ['any', ...modalities]];
  if (state.place) filter.push(['==', ['get', 'municipality'], state.place]);
  return filter;
};

const zoneVisible = (feature: GeoJSON.Feature) => {
  const properties = feature.properties || {};
  if (state.place && properties.municipality !== state.place) return false;
  return [...state.modalities].some((id) => properties[`m_${id}`]);
};

const applyFilters = () => {
  const filter = zoneFilter();
  ZONE_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.setFilter(id, filter as never);
  });
};

// Order from bottom to top: dimmed surroundings, municipal border,
// no-parking zones, parking zones, hubs
const orderLayers = () => {
  [...REGION_LAYER_IDS, ...ZONE_LAYER_IDS].forEach((id) => {
    if (map.getLayer(id)) map.moveLayer(id);
  });
};

const addLayers = () => {
  map.addSource('region-mask', { type: 'geojson', data: collection([]) });
  map.addSource('region', { type: 'geojson', data: collection([]) });
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

  map.addSource('no-parking', { type: 'geojson', data: collection([]) });
  map.addLayer({
    id: 'no-parking-fill',
    type: 'fill',
    source: 'no-parking',
    paint: { 'fill-color': NO_PARKING_COLOR, 'fill-opacity': 0.15 }
  });
  map.addLayer({
    id: 'no-parking-line',
    type: 'line',
    source: 'no-parking',
    paint: { 'line-color': NO_PARKING_COLOR, 'line-width': 1.5, 'line-opacity': 0.8 }
  });

  map.addSource('hubs', { type: 'geojson', data: collection([]) });
  map.addSource('hub-points', { type: 'geojson', data: collection([]) });
  map.addLayer({
    id: 'hubs-fill',
    type: 'fill',
    source: 'hubs',
    minzoom: HUB_AREA_MIN_ZOOM,
    paint: { 'fill-color': HUB_COLOR, 'fill-opacity': 0.25 }
  });
  map.addLayer({
    id: 'hubs-line',
    type: 'line',
    source: 'hubs',
    minzoom: HUB_AREA_MIN_ZOOM,
    paint: { 'line-color': HUB_COLOR, 'line-width': 2 }
  });
  map.addLayer({
    id: 'hub-points-dot',
    type: 'circle',
    source: 'hub-points',
    maxzoom: HUB_ICON_MIN_ZOOM,
    paint: {
      'circle-color': HUB_COLOR,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, HUB_ICON_MIN_ZOOM, 4],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 0.75
    }
  });
  map.loadImage('./hub-icon.png', (error, image) => {
    if (error || !image) {
      console.error('Unable to load the hub icon', error);
      return;
    }
    map.addImage('hub-icon', image);
    map.addLayer({
      id: 'hub-points-icon',
      type: 'symbol',
      source: 'hub-points',
      minzoom: HUB_ICON_MIN_ZOOM,
      layout: {
        'icon-image': 'hub-icon',
        'icon-anchor': 'bottom',
        // The image is 393 px tall: about 24 px at zoom 12, 40 px from 16
        'icon-size': ['interpolate', ['linear'], ['zoom'], HUB_ICON_MIN_ZOOM, 0.06, 16, 0.1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    });
    orderLayers();
    applyFilters();
  });
};

const drawZones = (data: ZoneData) => {
  (map.getSource('no-parking') as GeoJSONSource).setData(collection(data.areas.no_parking));
  (map.getSource('hubs') as GeoJSONSource).setData(collection(data.areas.hub));
  (map.getSource('hub-points') as GeoJSONSource).setData(collection(data.points.hub));
  // Virtual parking zones look like the dashboard's parking hubs: a blue P
  renderParkingHubs(map, collection(data.areas.parking), collection(data.points.parking));
  // Its fill is meant for hubs a few metres wide; some virtual zones here
  // cover a whole city centre
  map.setPaintProperty(PARKING_FILL_LAYER, 'fill-opacity', 0.2);
  orderLayers();
  applyFilters();
};

const showRegion = (geometry: GeoJSON.Geometry | null) => {
  const polygons = !geometry ? []
    : geometry.type === 'Polygon' ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  (map.getSource('region-mask') as GeoJSONSource | undefined)?.setData(polygons.length === 0
    ? collection([])
    : { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, ...polygons.map((p) => p[0])] } });
  (map.getSource('region') as GeoJSONSource | undefined)?.setData(geometry
    ? { type: 'Feature', properties: {}, geometry }
    : collection([]));
};

const extend = (bounds: LngLatBounds, geometry: GeoJSON.Geometry) => {
  const visit = (coordinates: unknown) => {
    if (typeof (coordinates as number[])[0] === 'number') bounds.extend(coordinates as [number, number]);
    else (coordinates as unknown[]).forEach(visit);
  };
  if (geometry.type === 'GeometryCollection') geometry.geometries.forEach((g) => extend(bounds, g));
  else visit(geometry.coordinates);
};

const frame = (geometries: GeoJSON.Geometry[]) => {
  const bounds = new maplibregl.LngLatBounds();
  geometries.forEach((geometry) => extend(bounds, geometry));
  if (bounds.isEmpty()) return;
  map.fitBounds(bounds, { padding: framePadding(), maxZoom: 16 });
};

const borderOf = (code: string) => {
  const municipality = state.municipalities.find((m) => m.code === code);
  if (!municipality) return Promise.resolve(null);
  if (!borders.has(code)) {
    borders.set(code, fetchMunicipalityBorder(municipality.zoneId).catch((error) => {
      console.error('Unable to load the municipal border', error);
      borders.delete(code);
      return null;
    }));
  }
  return borders.get(code)!;
};

const framePlace = async () => {
  const code = state.place;
  if (!code) {
    showRegion(null);
    map.fitBounds(NETHERLANDS, { padding: framePadding() });
    return;
  }
  const border = await borderOf(code);
  if (code !== state.place) return;
  showRegion(border);
  if (border) {
    frame([border]);
  } else if (state.data) {
    frame(KINDS.flatMap((kind) => state.data!.areas[kind])
      .filter((feature) => feature.properties?.municipality === code)
      .map((feature) => feature.geometry));
  }
};

// --- Hover -----------------------------------------------------------------

const popup = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false,
  offset: 14,
  maxWidth: '280px',
  className: 'zone-popup'
});

const existing = (ids: string[]) => ids.filter((id) => map.getLayer(id));

const box = (point: { x: number; y: number }): [PointLike, PointLike] => [
  [point.x - HOVER_TOLERANCE_PX, point.y - HOVER_TOLERANCE_PX],
  [point.x + HOVER_TOLERANCE_PX, point.y + HOVER_TOLERANCE_PX]
];

const zoneAt = (event: MapMouseEvent): MapGeoJSONFeature | undefined =>
  map.queryRenderedFeatures(box(event.point), { layers: existing(POINT_LAYER_IDS) })[0]
  ?? map.queryRenderedFeatures(event.point, { layers: existing(AREA_LAYER_IDS) })
    .sort((a, b) => a.properties.size - b.properties.size)[0];

const popupContent = (properties: Record<string, unknown>) => {
  const content = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = (properties.name as string) || 'Zone zonder naam';
  const detail = document.createElement('span');
  const kind = KIND_LABELS[properties.kind as ZoneKind];
  const place = state.place ? '' : ` in ${municipalityName(properties.municipality as string)}`;
  const modalities = MODALITIES.filter((m) => properties[`m_${m.id}`]).map((m) => m.label.toLowerCase());
  detail.textContent = `${kind}${place}${modalities.length > 0 ? ` · ${modalities.join(', ')}` : ''}`;
  content.append(name, detail);
  return content;
};

const showPopup = (event: MapMouseEvent) => {
  const zone = zoneAt(event);
  map.getCanvas().style.cursor = zone ? 'pointer' : '';
  if (!zone) {
    popup.remove();
    return;
  }
  popup.setLngLat(event.lngLat).setDOMContent(popupContent(zone.properties)).addTo(map);
};

map.on('mousemove', showPopup);
map.on('mouseout', () => popup.remove());

// Touch screens have no hover: a tap shows the name. A dot zooms in to its
// zone, as the dashboard's hub logos do.
map.on('click', (event) => {
  const dot = map.queryRenderedFeatures(box(event.point), { layers: existing(DOT_LAYER_IDS) })[0];
  if (dot) {
    map.easeTo({ center: (dot.geometry as GeoJSON.Point).coordinates as [number, number], zoom: HUB_AREA_MIN_ZOOM + 1 });
    return;
  }
  showPopup(event);
});

// --- Interface ---------------------------------------------------------------

const updateUrl = () => {
  const search = new URLSearchParams();
  if (state.place) search.set('gm_code', state.place);
  if (state.modalities.size < MODALITIES.length) {
    search.set('modaliteiten', MODALITIES.filter((m) => state.modalities.has(m.id)).map((m) => m.id).join(','));
  }
  const query = search.toString().replace(/%2C/g, ',');
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
};

const renderStatus = () => {
  const status = $('status');
  const place = state.place ? municipalityName(state.place) : 'Alle plaatsen';
  if (!state.data) {
    status.textContent = state.loadError ? 'De zones konden niet laden.' : 'Zones laden…';
  } else {
    const counts = KINDS.map((kind) => state.data!.areas[kind].filter(zoneVisible).length);
    KINDS.forEach((kind, index) => { $(`count-${kind}`).textContent = String(counts[index]); });
    const total = counts.reduce((sum, count) => sum + count, 0);
    status.textContent = state.modalities.size === 0
      ? `${place}: kies een voertuigtype`
      : `${place}: ${total === 0 ? 'geen' : total} ${total === 1 ? 'zone' : 'zones'}`;
  }
};

const renderModalities = () => {
  const group = $('modalities');
  group.replaceChildren(...MODALITIES.map(({ id, label }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = label;
    chip.setAttribute('aria-pressed', String(state.modalities.has(id)));
    chip.addEventListener('click', () => {
      if (state.modalities.has(id)) state.modalities.delete(id);
      else state.modalities.add(id);
      chip.setAttribute('aria-pressed', String(state.modalities.has(id)));
      popup.remove();
      applyFilters();
      renderStatus();
      updateUrl();
    });
    return chip;
  }));
};

const openPicker = (open: boolean) => {
  $('place-picker').hidden = !open;
  $('place-button').setAttribute('aria-expanded', String(open));
  if (open) {
    $<HTMLInputElement>('place-search').value = '';
    renderPlaceList();
    $('place-search').focus();
  }
};

const selectPlace = (code: string) => {
  state.place = code;
  $('place-name').textContent = code ? municipalityName(code) : 'Alle plaatsen';
  openPicker(false);
  popup.remove();
  applyFilters();
  renderStatus();
  updateUrl();
  void framePlace();
};

// "Alle plaatsen" and then every municipality, as in the dashboard's place
// filter
const placeOptions = (): { code: string; name: string }[] => {
  const query = $<HTMLInputElement>('place-search').value.trim().toLowerCase();
  return [{ code: '', name: 'Alle plaatsen' }, ...state.municipalities]
    .filter(({ code, name }) => code === '' ? query === '' : name.toLowerCase().includes(query));
};

const renderPlaceList = () => {
  const list = $('place-list');
  list.replaceChildren(...placeOptions().map(({ code, name }) => {
    const item = document.createElement('li');
    const option = document.createElement('button');
    option.type = 'button';
    option.role = 'option';
    option.textContent = name;
    option.setAttribute('aria-selected', String(code === state.place));
    option.addEventListener('click', () => selectPlace(code));
    item.append(option);
    return item;
  }));
};

$('place-button').addEventListener('click', () => openPicker($('place-picker').hidden));
$('place-search').addEventListener('input', renderPlaceList);
$('place-search').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') openPicker(false);
  if (event.key === 'Enter') {
    const [first] = placeOptions();
    if (first) selectPlace(first.code);
  }
});
document.addEventListener('click', (event) => {
  if (!(event.target as HTMLElement).closest('.place')) openPicker(false);
});

// --- Start -----------------------------------------------------------------

renderModalities();
renderStatus();

const municipalitiesLoaded = fetchMunicipalities()
  .then((municipalities) => {
    state.municipalities = municipalities;
    if (state.place && !municipalities.some((m) => m.code === state.place)) state.place = '';
    $('place-name').textContent = state.place ? municipalityName(state.place) : 'Alle plaatsen';
  })
  .catch((error) => console.error('Unable to load municipalities', error));

const zonesLoaded = fetchZones();

map.on('load', () => {
  addLayers();
  zonesLoaded
    .then((data) => {
      state.data = data;
      drawZones(data);
    })
    .catch((error) => {
      console.error('Unable to load zones', error);
      state.loadError = true;
    })
    .finally(renderStatus);
  void municipalitiesLoaded.then(() => {
    renderStatus();
    if (state.place) void framePlace();
  });
});
