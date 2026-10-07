import { classifyServiceAreaFeatures, hubCenter } from './roles';
import { splitServiceAreasForMap } from './index';
import { ServiceArea } from '../../types/ServiceArea';

// Closed ring of `n` points around a centre, radius in degrees
const circleRing = (cx: number, cy: number, radius: number, n: number): number[][] => {
  const ring = Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return [cx + (radius * Math.cos(angle)) / Math.cos((cy * Math.PI) / 180), cy + radius * Math.sin(angle)];
  });
  return [...ring, ring[0]];
};

const boxRing = (x1: number, y1: number, x2: number, y2: number): number[][] => [
  [x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]
];

const feature = (coordinates: number[][][][]): GeoJSON.Feature => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'MultiPolygon', coordinates }
});

// Irregular service area outline, like Voi's around Amersfoort
const areaRing = [
  [5.02, 52.12], [5.30, 52.11], [5.46, 52.20], [5.40, 52.34], [5.20, 52.25], [5.05, 52.33], [5.02, 52.12]
];
// The band's hole follows the area outline with slightly different vertices
const bandHole = [
  [5.0201, 52.1201], [5.30, 52.1101], [5.4599, 52.20], [5.40, 52.3399], [5.20, 52.2501], [5.0501, 52.33], [5.0201, 52.1201]
];

// The band reaches ~2 km beyond the area
const bandOuter = [
  [4.99, 52.09], [5.31, 52.08], [5.49, 52.19], [5.42, 52.36], [5.20, 52.28], [5.04, 52.36], [4.99, 52.09]
];

const voiFeatures = [
  feature([[circleRing(5.38, 52.15, 0.00003, 16)]]), // hub
  feature([[boxRing(4.79, 51.99, 5.64, 52.45), areaRing]]), // mask
  feature([[bandOuter, bandHole]]), // border band
  feature([[areaRing]]), // area
  feature([[circleRing(5.39, 52.16, 0.00003, 12)]]) // hub
];

describe('classifyServiceAreaFeatures', () => {
  it('recognises the mask, border band, area and hubs Voi publishes', () => {
    expect(classifyServiceAreaFeatures(voiFeatures)).toEqual(['hub', 'mask', 'border', 'area', 'hub']);
  });

  it('keeps small non-circular polygons as areas', () => {
    const roles = classifyServiceAreaFeatures([
      feature([[boxRing(5.38, 52.15, 5.3801, 52.1501)]]),
      feature([[circleRing(5.38, 52.15, 0.00003, 6)]])
    ]);
    expect(roles).toEqual(['area', 'area']);
  });

  it('keeps an area with no-go holes as an area', () => {
    const roles = classifyServiceAreaFeatures([
      feature([[areaRing, boxRing(5.2, 52.2, 5.21, 52.21)]]),
      feature([[boxRing(5.0, 52.0, 5.01, 52.01)]])
    ]);
    expect(roles).toEqual(['area', 'area']);
  });

  it('does not take a holed polygon for a mask because another part is a quadrilateral', () => {
    const roles = classifyServiceAreaFeatures([
      feature([[areaRing, boxRing(5.2, 52.2, 5.21, 52.21)], [boxRing(5.5, 52.0, 5.6, 52.1)]])
    ]);
    expect(roles).toEqual(['area']);
  });
});

describe('hubCenter', () => {
  it('returns the centre of the circle', () => {
    const [x, y] = hubCenter(voiFeatures[0]) as number[];
    expect(x).toBeCloseTo(5.38, 6);
    expect(y).toBeCloseTo(52.15, 6);
  });
});

describe('splitServiceAreasForMap', () => {
  it('drops the mask and moves hubs to their own collections', () => {
    const serviceArea: ServiceArea = {
      service_area_version_id: 1,
      municipality: 'GM0307',
      operator: 'voi',
      valid_from: '2026-09-16T12:35:20',
      valid_until: '',
      geometries: { type: 'FeatureCollection', features: voiFeatures }
    };
    const { areas, hubs, hubPoints } = splitServiceAreasForMap([serviceArea]);

    expect(areas.features.map((f) => f.properties?.role)).toEqual(['border', 'area']);
    expect(hubs.features).toHaveLength(2);
    expect(hubPoints.features.map((f) => f.geometry.type)).toEqual(['Point', 'Point']);
    expect(areas.features[0].properties).toMatchObject({ operator: 'voi' });
    expect(typeof areas.features[0].properties?.color).toBe('string');
  });
});
