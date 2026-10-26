/**
 * Parkeernaleving on the Aanbod map: the distance from every shared bike to
 * the nearest parking hub of its own operator, in the categories of the
 * Groningen "Buiten hubs geparkeerd" tool. A bike within 20 m of a hub counts
 * as parked in it.
 *
 * The hubs are the ones the Parkeerhubs layer draws (see
 * service-areas/mapData.ts). They come from each operator's service area, so
 * a bike is only compared with the hubs of its own operator.
 */

export const HUB_MARGIN_M = 20;

export interface ParkeerafstandBand {
  id: number;
  name: string;
  // Range label for the legend
  short: string;
  color: string;
  // Upper bound of the band in metres
  max: number;
  // Parked outside a hub
  outside: boolean;
}

export const PARKEERAFSTAND_BANDS: ParkeerafstandBand[] = [
  { id: 0, name: 'In een hub', short: `≤ ${HUB_MARGIN_M} m`, color: '#9CA3AF', max: HUB_MARGIN_M, outside: false },
  { id: 1, name: 'Net buiten', short: '20-50 m', color: '#F2B200', max: 50, outside: true },
  { id: 2, name: 'Buiten', short: '50-200 m', color: '#EC6A12', max: 200, outside: true },
  { id: 3, name: 'Ver buiten', short: '> 200 m', color: '#B0001C', max: Infinity, outside: true }
];

export const parkeerafstandBandFor = (distance: number): number => {
  const band = PARKEERAFSTAND_BANDS.find((b) => distance <= b.max);
  return band ? band.id : PARKEERAFSTAND_BANDS.length - 1;
};

// Hub rules apply to shared bikes, as in the Groningen tool
const MEASURED_FORM_FACTORS = ['bicycle', 'cargo_bicycle'];

export const isMeasuredFormFactor = (formFactor: string | null | undefined): boolean =>
  MEASURED_FORM_FACTORS.includes(formFactor || '');

type Point = [number, number];
type Ring = Point[];

export interface PreparedHub {
  // Operator key and position in that operator's list, e.g. 'voi:12'
  id: string;
  operator: string;
  // Centre in [lon, lat], for labels and for grouping hubs into places
  center: [number, number];
  // The hub's own polygon, for asking the snapshot archive about it
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  rings: Ring[];
  bbox: [number, number, number, number];
}

interface OperatorHubs {
  hubs: PreparedHub[];
  // Grid cell key -> indexes into hubs
  grid: Map<string, number[]>;
}

export interface HubIndex {
  operators: Map<string, OperatorHubs>;
  // Latitude of the local projection
  lat0: number;
}

const METRES_PER_DEGREE = 111320;

// Within 200 m (the largest finite band bound) the nearest hub decides the
// band, so that search must be exact and fast. Hubs are kept in cells of
// 100 m: every hub within 200 m of a bike lies in the 5 x 5 cells around it.
// Farther away the distance only feeds the popup, so a slower search over all
// hubs is fine.
const SEARCH_RADIUS_M = 200;
const CELL_M = 100;
const SEARCH_CELLS = Math.ceil(SEARCH_RADIUS_M / CELL_M);

const project = (lon: number, lat: number, lonScale: number): Point => [
  lon * METRES_PER_DEGREE * lonScale,
  lat * METRES_PER_DEGREE
];

const unproject = (x: number, y: number, lonScale: number): [number, number] => [
  x / (METRES_PER_DEGREE * lonScale),
  y / METRES_PER_DEGREE
];

const cellKey = (cx: number, cy: number) => `${cx}:${cy}`;

const polygonsOf = (geometry: GeoJSON.Geometry | null | undefined): GeoJSON.Position[][][] => {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
};

export const operatorKey = (operator: string | null | undefined) =>
  (operator || '').toLowerCase().replace(/\s/g, '');

/**
 * Prepare the Parkeerhubs features (properties.operator set by
 * splitServiceAreasForMap) for distance lookups.
 */
export const buildHubIndex = (features: GeoJSON.Feature[]): HubIndex => {
  const latitudes = features.flatMap((f) =>
    polygonsOf(f.geometry).flatMap((polygon) => (polygon[0] || []).map((p) => p[1]))
  );
  const lat0 = latitudes.length ? latitudes.reduce((a, b) => a + b, 0) / latitudes.length : 52;
  const lonScale = Math.cos((lat0 * Math.PI) / 180);

  const operators = new Map<string, OperatorHubs>();
  features.forEach((feature) => {
    const rings = polygonsOf(feature.geometry)
      .flatMap((polygon) => polygon)
      .filter((ring) => ring.length >= 3)
      .map((ring) => ring.map((p) => project(p[0], p[1], lonScale)));
    if (rings.length === 0) return;

    const key = operatorKey(feature.properties?.operator);
    if (!operators.has(key)) operators.set(key, { hubs: [], grid: new Map() });
    const entry = operators.get(key) as OperatorHubs;

    const xs = rings.flatMap((ring) => ring.map((p) => p[0]));
    const ys = rings.flatMap((ring) => ring.map((p) => p[1]));
    const bbox: PreparedHub['bbox'] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const hubIndex = entry.hubs.length;
    entry.hubs.push({
      id: `${key}:${hubIndex}`,
      operator: key,
      center: unproject((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2, lonScale),
      geometry: feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      rings,
      bbox
    });

    for (let cx = Math.floor(bbox[0] / CELL_M); cx <= Math.floor(bbox[2] / CELL_M); cx++) {
      for (let cy = Math.floor(bbox[1] / CELL_M); cy <= Math.floor(bbox[3] / CELL_M); cy++) {
        const k = cellKey(cx, cy);
        const cell = entry.grid.get(k);
        if (cell) cell.push(hubIndex);
        else entry.grid.set(k, [hubIndex]);
      }
    }
  });

  return { operators, lat0 };
};

export const hubIndexHasOperator = (index: HubIndex | null | undefined, operator: string): boolean =>
  !!index && index.operators.has(operatorKey(operator));

const inRing = (x: number, y: number, ring: Ring): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const segmentDistance = (x: number, y: number, x1: number, y1: number, x2: number, y2: number): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
};

// Distance in metres to a hub: 0 inside it, otherwise to its outline
const hubDistance = (x: number, y: number, hub: PreparedHub): number => {
  let best = Infinity;
  for (const ring of hub.rings) {
    if (inRing(x, y, ring)) return 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      best = Math.min(best, segmentDistance(x, y, ring[j][0], ring[j][1], ring[i][0], ring[i][1]));
    }
  }
  return best;
};

export interface NearestHub {
  hub: PreparedHub;
  distance: number;
}

/**
 * The nearest hub of an operator within maxDistance metres of a point, or
 * null when there is none (or the operator has no hubs in the index).
 * Every hub within maxDistance has its nearest point, and so part of its
 * bounding box, in the cells searched, so the answer is exact.
 */
export const nearestHubWithin = (
  index: HubIndex,
  operator: string,
  lon: number,
  lat: number,
  maxDistance: number
): NearestHub | null => {
  const entry = index.operators.get(operatorKey(operator));
  if (!entry) return null;

  const [x, y] = project(lon, lat, Math.cos((index.lat0 * Math.PI) / 180));
  const cx = Math.floor(x / CELL_M);
  const cy = Math.floor(y / CELL_M);
  const cells = Math.ceil(maxDistance / CELL_M);

  let best: NearestHub | null = null;
  const seen = new Set<number>();
  for (let dx = -cells; dx <= cells; dx++) {
    for (let dy = -cells; dy <= cells; dy++) {
      const cell = entry.grid.get(cellKey(cx + dx, cy + dy));
      if (!cell) continue;
      for (const i of cell) {
        if (seen.has(i)) continue;
        seen.add(i);
        const distance = hubDistance(x, y, entry.hubs[i]);
        if (distance <= maxDistance && (!best || distance < best.distance)) {
          best = { hub: entry.hubs[i], distance };
          if (distance === 0) return best;
        }
      }
    }
  }
  return best;
};

/**
 * Distance in metres from a vehicle to the nearest hub of its operator, or
 * null when that operator has no hubs in the index.
 */
export const distanceToNearestHub = (
  index: HubIndex,
  operator: string,
  lon: number,
  lat: number
): number | null => {
  const entry = index.operators.get(operatorKey(operator));
  if (!entry) return null;

  const [x, y] = project(lon, lat, Math.cos((index.lat0 * Math.PI) / 180));
  const cx = Math.floor(x / CELL_M);
  const cy = Math.floor(y / CELL_M);

  let best = Infinity;
  const seen = new Set<number>();
  for (let dx = -SEARCH_CELLS; dx <= SEARCH_CELLS; dx++) {
    for (let dy = -SEARCH_CELLS; dy <= SEARCH_CELLS; dy++) {
      const cell = entry.grid.get(cellKey(cx + dx, cy + dy));
      if (!cell) continue;
      for (const i of cell) {
        if (seen.has(i)) continue;
        seen.add(i);
        best = Math.min(best, hubDistance(x, y, entry.hubs[i]));
        if (best === 0) return 0;
      }
    }
  }
  if (best <= SEARCH_RADIUS_M) return best;

  // No hub within 200 m: check every hub for the exact
  // distance, skipping hubs whose bounding box is already farther away
  for (const hub of entry.hubs) {
    const [minX, minY, maxX, maxY] = hub.bbox;
    const bboxDistance = Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minY - y, 0, y - maxY));
    if (bboxDistance < best) best = Math.min(best, hubDistance(x, y, hub));
  }
  return best;
};
