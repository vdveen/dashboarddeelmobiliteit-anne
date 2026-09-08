import type { FeatureCollection, Polygon, Position } from 'geojson';

/**
 * Geometry helpers for the map drawing tool. Kept free of React and MapLibre so
 * the rules the snapshot API enforces (closed ring, vertex budget, finite
 * coordinates) can be unit tested on their own.
 */

/** Fewer positions than this cannot describe an area. */
export const MIN_RING_POSITIONS = 3;

/**
 * Vertex budget for a finished ring. The API rejects more than 5000 vertices;
 * a lasso easily produces thousands of near-identical points, so decimate well
 * below that limit to keep the request small without visibly changing the shape.
 */
export const MAX_RING_POSITIONS = 1000;

const EMPTY_FEATURE_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/** True when the position is a finite lon/lat pair inside the WGS84 domain. */
export function isValidPosition(position: Position): boolean {
  if (!Array.isArray(position) || position.length < 2) return false;
  const [lng, lat] = position;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function samePosition(left: Position, right: Position): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

/** Drops positions that repeat the position before them. */
export function dedupeConsecutive(positions: Position[]): Position[] {
  return positions.filter((position, index) => {
    return index === 0 || !samePosition(positions[index - 1], position);
  });
}

/**
 * Thins the list to at most `maxPositions` by picking evenly spaced indices.
 * The first and last position are always kept, so the outline keeps its extent.
 */
export function decimatePositions(
  positions: Position[],
  maxPositions: number = MAX_RING_POSITIONS
): Position[] {
  if (maxPositions < 2) return positions.slice(0, Math.max(0, maxPositions));
  if (positions.length <= maxPositions) return positions.slice();

  const lastIndex = positions.length - 1;
  const step = lastIndex / (maxPositions - 1);
  const kept: Position[] = [];
  let previousIndex = -1;

  for (let i = 0; i < maxPositions; i += 1) {
    const index = i === maxPositions - 1 ? lastIndex : Math.round(i * step);
    if (index === previousIndex) continue;
    previousIndex = index;
    kept.push(positions[index]);
  }

  return kept;
}

/** Repeats the first position at the end when the ring is not closed yet. */
export function closeRing(positions: Position[]): Position[] {
  if (positions.length === 0) return [];
  const first = positions[0];
  const last = positions[positions.length - 1];
  return samePosition(first, last) ? positions.slice() : [...positions, first];
}

/**
 * Turns raw drawing positions into a GeoJSON Polygon the availability endpoint
 * accepts, or null when the drawing does not describe an area.
 */
export function buildPolygon(
  positions: Position[],
  maxPositions: number = MAX_RING_POSITIONS
): Polygon | null {
  const cleaned = dedupeConsecutive(positions.filter(isValidPosition));

  // An already closed ring carries a duplicate of its first position; ignore it
  // while counting distinct corners so a triangle still qualifies.
  const open = cleaned.length > 1 && samePosition(cleaned[0], cleaned[cleaned.length - 1])
    ? cleaned.slice(0, -1)
    : cleaned;

  if (open.length < MIN_RING_POSITIONS) return null;

  const ring = closeRing(dedupeConsecutive(decimatePositions(open, maxPositions)));
  if (ring.length < MIN_RING_POSITIONS + 1) return null;

  return { type: 'Polygon', coordinates: [ring] };
}

/**
 * Live preview of a drawing in progress: a line while there are too few points
 * for an area, a polygon once there are enough.
 */
export function toDrawingFeatureCollection(positions: Position[]): FeatureCollection {
  const cleaned = dedupeConsecutive(positions.filter(isValidPosition));
  if (cleaned.length < 2) return EMPTY_FEATURE_COLLECTION;

  if (cleaned.length < MIN_RING_POSITIONS) {
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: cleaned },
      }],
    };
  }

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [closeRing(cleaned)] },
    }],
  };
}

/** Feature collection that renders the finished polygon. */
export function toPolygonFeatureCollection(polygon: Polygon | null): FeatureCollection {
  if (!polygon) return EMPTY_FEATURE_COLLECTION;
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: polygon }],
  };
}

export const emptyFeatureCollection = (): FeatureCollection => EMPTY_FEATURE_COLLECTION;
