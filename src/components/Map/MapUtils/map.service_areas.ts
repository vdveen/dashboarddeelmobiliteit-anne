import { canMutateMapLayers, whenMapLayersMutable } from './mapGuards';

type HexagonType = any;

// Get geometries for user
const getGeometriesForUser = async (map, token, filter) => {
  // Get hexes user has access to
  const url = encodeURI(`${process.env.REACT_APP_MAIN_API_URL}/od-api/accessible/geometry?${filter.gebied ? 'filter_municipalities=' + filter.gebied : ''}`);

  let responseJson;

  try {
    let response = await fetch(url, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Bearer ${token}`
      }
    });
    responseJson = await response.json();
  } catch(e) {
    console.error(e);
  }

  // Validate
  if(! responseJson || ! responseJson.result) {
    console.error('No valid response json returned for getting accessible geometries')
    return;
  }

  // Otherwise: Return all hexes available for user
  return responseJson;
}

const removeServiceAreaSources = (map: any) => {
    if(! map) return;

    let key, source;
    
    key = 'service_areas';
    source = map.getSource(key);
    if(source) map.removeSource(key);
}

const removeServiceAreasFromMap = (map: any) => {
    if (!map) return;
    if (!canMutateMapLayers(map)) {
      whenMapLayersMutable(map, () => removeServiceAreasFromMap(map));
      return;
    }

    try {
      let layer, key;

      key = 'service_areas-layer-fill';
      layer = map.getLayer(`${key}`);
      if (layer) map.removeLayer(`${key}`);

      key = 'service_areas-layer-border';
      layer = map.getLayer(`${key}`);
      if (layer) map.removeLayer(`${key}`);

      removeServiceAreaSources(map);
    } catch {
      // Map may already be torn down during route navigation.
    }
}

// Paint per role (see helpers/service-areas/roles.ts). The service area
// itself stays faint so the map underneath remains readable; the band along
// its edge, where parking is not allowed, gets a strong fill and outline.
const AREA_FILL_OPACITY = 0.12;
const BORDER_FILL_OPACITY = 0.45;

const renderPolygons_fill = (map, geojson: GeoJSON.FeatureCollection) => {
    const sourceId = 'service_areas';
    let layerId = `${sourceId}-layer-fill`
      , source = map.getSource(sourceId);

    if (! source) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: geojson,
        generateId: true // This ensures that all features have unique IDs
      });
    } else {
      source.setData(geojson);
    }

    if (! map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        source: sourceId,
        type: 'fill',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': [
            'match', ['get', 'role'],
            'border', BORDER_FILL_OPACITY,
            AREA_FILL_OPACITY
          ]
        }
      });
    }

    // Outline on top of the fill
    layerId = `${sourceId}-layer-border`;
    if (map.getLayer(layerId)) return;
    map.addLayer({
      id: layerId,
      source: sourceId,
      type: 'line',
      paint: {
        'line-color': ['get', 'color'],
        'line-opacity': 0.9,
        'line-width': [
          'match', ['get', 'role'],
          'border', 2.5,
          1.5
        ]
      }
    });
}

const renderServiceAreas = (
  map: any,
  geojson: GeoJSON.FeatureCollection,
) => {
  if (!map) return;
  if (!canMutateMapLayers(map)) {
    whenMapLayersMutable(map, () => renderServiceAreas(map, geojson));
    return;
  }

  // Remove old sources first
  removeServiceAreasFromMap(map);
  renderPolygons_fill(map, geojson);
}

const PARKING_HUBS_SOURCE = 'service_area_hubs';
const PARKING_HUB_POINTS_SOURCE = 'service_area_hub_points';
const PARKING_HUB_ICON = 'service-area-parking-hub-icon';

export const PARKING_HUBS_MAP_LAYER_IDS = [
  `${PARKING_HUBS_SOURCE}-layer-fill`,
  `${PARKING_HUBS_SOURCE}-layer-border`,
  `${PARKING_HUB_POINTS_SOURCE}-layer-dot`,
  `${PARKING_HUB_POINTS_SOURCE}-layer-icon`
];

// Zoomed out further than this, hundreds of icons merge into one blob, so
// hubs show as dots instead
const PARKING_HUB_ICON_MIN_ZOOM = 12;

// Blue of the parking sign; also used for the hub circles so they stand out
// from the operator-coloured vehicles parked in them
const PARKING_HUB_COLOR = '#1565c0';

// Blue square with a white P, like a Dutch parking sign (🅿)
const addParkingHubIcon = (map) => {
  if (map.hasImage(PARKING_HUB_ICON)) return;
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const radius = 9;
  const inset = 2;
  ctx.beginPath();
  ctx.moveTo(inset + radius, inset);
  ctx.arcTo(size - inset, inset, size - inset, size - inset, radius);
  ctx.arcTo(size - inset, size - inset, inset, size - inset, radius);
  ctx.arcTo(inset, size - inset, inset, inset, radius);
  ctx.arcTo(inset, inset, size - inset, inset, radius);
  ctx.closePath();
  ctx.fillStyle = PARKING_HUB_COLOR;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P', size / 2, size / 2 + 2);

  map.addImage(PARKING_HUB_ICON, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
}

const removeParkingHubsFromMap = (map: any) => {
  if (!map) return;
  if (!canMutateMapLayers(map)) {
    whenMapLayersMutable(map, () => removeParkingHubsFromMap(map));
    return;
  }

  try {
    PARKING_HUBS_MAP_LAYER_IDS.forEach((layerId) => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    });
    [PARKING_HUBS_SOURCE, PARKING_HUB_POINTS_SOURCE].forEach((sourceId) => {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    });
  } catch {
    // Map may already be torn down during route navigation.
  }
}

/**
 * Draw parking hubs as their circle plus a parking icon standing just above
 * it. The circles are a few metres wide, so the icon is what makes them
 * findable; placing it above keeps the circle itself visible.
 */
const renderParkingHubs = (
  map: any,
  hubs: GeoJSON.FeatureCollection,
  hubPoints: GeoJSON.FeatureCollection
) => {
  if (!map) return;
  if (!canMutateMapLayers(map)) {
    whenMapLayersMutable(map, () => renderParkingHubs(map, hubs, hubPoints));
    return;
  }

  removeParkingHubsFromMap(map);
  addParkingHubIcon(map);

  map.addSource(PARKING_HUBS_SOURCE, { type: 'geojson', data: hubs });
  map.addSource(PARKING_HUB_POINTS_SOURCE, { type: 'geojson', data: hubPoints });

  map.addLayer({
    id: `${PARKING_HUBS_SOURCE}-layer-fill`,
    source: PARKING_HUBS_SOURCE,
    type: 'fill',
    paint: {
      'fill-color': PARKING_HUB_COLOR,
      'fill-opacity': 0.6
    }
  });
  map.addLayer({
    id: `${PARKING_HUBS_SOURCE}-layer-border`,
    source: PARKING_HUBS_SOURCE,
    type: 'line',
    paint: {
      'line-color': PARKING_HUB_COLOR,
      'line-width': 1.5
    }
  });
  map.addLayer({
    id: `${PARKING_HUB_POINTS_SOURCE}-layer-dot`,
    source: PARKING_HUB_POINTS_SOURCE,
    type: 'circle',
    maxzoom: PARKING_HUB_ICON_MIN_ZOOM,
    paint: {
      'circle-color': PARKING_HUB_COLOR,
      'circle-radius': 2.5,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 0.5
    }
  });
  map.addLayer({
    id: `${PARKING_HUB_POINTS_SOURCE}-layer-icon`,
    source: PARKING_HUB_POINTS_SOURCE,
    type: 'symbol',
    minzoom: PARKING_HUB_ICON_MIN_ZOOM,
    layout: {
      'icon-image': PARKING_HUB_ICON,
      'icon-anchor': 'bottom',
      'icon-offset': [0, -3],
      'icon-size': [
        'interpolate', ['linear'], ['zoom'],
        PARKING_HUB_ICON_MIN_ZOOM, 0.55,
        14, 0.75,
        18, 1
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    }
  });
}

export {
    renderServiceAreas,
    removeServiceAreasFromMap,
    renderParkingHubs,
    removeParkingHubsFromMap
}
