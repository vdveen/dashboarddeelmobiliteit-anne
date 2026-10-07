/**
 * Classify the features of an operator's service area by role.
 *
 * The MDS service_area endpoint returns bare geometries (only a geom_hash
 * property), so the role is derived from the shape. Voi publishes four kinds
 * of feature per municipality:
 *
 * - mask:   a quadrilateral covering the whole region with the service area cut
 *           out as a hole ("everything outside is no-go").
 * - border: a band with a hole around the service area, where riding is
 *           possible but parking is not.
 * - area:   the service area itself.
 * - hub:    small circular parking spots (Voi: ~3 m radius, 12 to 16 vertices).
 *
 * Other operators publish plain areas, sometimes with no-go holes; those stay
 * 'area' because no other feature of the operator lies inside their bounds.
 */

export type ServiceAreaRole = 'mask' | 'border' | 'area' | 'hub';

type Position = number[];
type Ring = Position[];
type PolygonCoords = Ring[];
type BBox = [number, number, number, number];

const polygonsOf = (geometry: GeoJSON.Geometry | null | undefined): PolygonCoords[] => {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
};

// Ring without its closing vertex
const distinctVertices = (ring: Ring): Ring => {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
};

// Regular polygons drawn as circles have all vertices at the same distance
// from their mean. Allow 10% spread for coordinate rounding.
const MIN_CIRCLE_VERTICES = 8;
const MAX_CIRCLE_RADIUS_SPREAD = 1.1;

const isCircularRing = (ring: Ring): boolean => {
  const vertices = distinctVertices(ring);
  if (vertices.length < MIN_CIRCLE_VERTICES) return false;

  const cx = vertices.reduce((sum, p) => sum + p[0], 0) / vertices.length;
  const cy = vertices.reduce((sum, p) => sum + p[1], 0) / vertices.length;
  const lonScale = Math.cos((cy * Math.PI) / 180);
  const distances = vertices.map((p) => Math.hypot((p[0] - cx) * lonScale, p[1] - cy));
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  return min > 0 && max / min <= MAX_CIRCLE_RADIUS_SPREAD;
};

const bboxOf = (rings: Ring[]): BBox | null => {
  let bbox: BBox | null = null;
  rings.forEach((ring) => {
    ring.forEach(([x, y]) => {
      if (!bbox) {
        bbox = [x, y, x, y];
        return;
      }
      bbox = [Math.min(bbox[0], x), Math.min(bbox[1], y), Math.max(bbox[2], x), Math.max(bbox[3], y)];
    });
  });
  return bbox;
};

const bboxContains = (outer: BBox, inner: BBox): boolean =>
  outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

// Voi cuts the band's hole along the service area outline, but not vertex for
// vertex. Treat bboxes as equal when every edge is within 1% of the extent.
const BBOX_EQUAL_TOLERANCE = 0.01;

const bboxNearlyEqual = (a: BBox, b: BBox): boolean => {
  const tolerance = BBOX_EQUAL_TOLERANCE * Math.max(a[2] - a[0], a[3] - a[1]);
  return a.every((value, i) => Math.abs(value - b[i]) <= tolerance);
};

/**
 * Return the role of every feature, in input order. Features are compared
 * within the given collection, so pass one operator's geometries at a time.
 */
export const classifyServiceAreaFeatures = (
  features: GeoJSON.Feature[]
): ServiceAreaRole[] => {
  const shapes = features.map((feature) => {
    const polygons = polygonsOf(feature.geometry);
    return {
      polygons,
      hasHoles: polygons.some((polygon) => polygon.length > 1),
      bbox: bboxOf(polygons.map((polygon) => polygon[0] || [])),
      holeBBoxes: polygons
        .flatMap((polygon) => polygon.slice(1))
        .map((hole) => bboxOf([hole]))
        .filter((bbox): bbox is BBox => bbox !== null)
    };
  });

  const initialRoles = shapes.map(({ polygons, hasHoles }): ServiceAreaRole => {
    if (polygons.length === 0) return 'area';
    if (!hasHoles && polygons.every((polygon) => isCircularRing(polygon[0]))) {
      return 'hub';
    }
    if (polygons.some((polygon) => polygon.length > 1 && distinctVertices(polygon[0]).length === 4)) {
      return 'mask';
    }
    return 'area';
  });

  // A holed feature whose hole is a plain area is a border band around it
  const plainAreaBBoxes = shapes
    .filter((shape, i) => initialRoles[i] === 'area' && !shape.hasHoles && shape.bbox)
    .map((shape) => shape.bbox as BBox);

  return initialRoles.map((role, i) => {
    const { hasHoles, bbox, holeBBoxes } = shapes[i];
    if (role !== 'area' || !hasHoles || !bbox) return role;
    const isBand = plainAreaBBoxes.some((area) =>
      bboxContains(bbox, area) && holeBBoxes.some((hole) => bboxNearlyEqual(area, hole))
    );
    return isBand ? 'border' : role;
  });
};

/**
 * Centre of a hub's outer ring, used to place the parking icon.
 */
export const hubCenter = (feature: GeoJSON.Feature): Position | null => {
  const polygons = polygonsOf(feature.geometry);
  const vertices = polygons.flatMap((polygon) => distinctVertices(polygon[0] || []));
  if (vertices.length === 0) return null;
  return [
    vertices.reduce((sum, p) => sum + p[0], 0) / vertices.length,
    vertices.reduce((sum, p) => sum + p[1], 0) / vertices.length
  ];
};
