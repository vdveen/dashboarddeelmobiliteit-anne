import type { Position } from 'geojson';

import {
  buildPolygon,
  closeRing,
  decimatePositions,
  dedupeConsecutive,
  isValidPosition,
  toDrawingFeatureCollection,
  toPolygonFeatureCollection,
} from './polygonGeometry';

const square: Position[] = [[5.1, 52.1], [5.2, 52.1], [5.2, 52.2], [5.1, 52.2]];

describe('isValidPosition', () => {
  it('accepts a finite lon/lat pair inside the WGS84 domain', () => {
    expect(isValidPosition([5.1, 52.1])).toBe(true);
  });

  it('rejects non-finite and out of range coordinates', () => {
    expect(isValidPosition([Number.NaN, 52.1])).toBe(false);
    expect(isValidPosition([Number.POSITIVE_INFINITY, 52.1])).toBe(false);
    expect(isValidPosition([181, 52.1])).toBe(false);
    expect(isValidPosition([5.1, 91])).toBe(false);
  });
});

describe('dedupeConsecutive', () => {
  it('removes repeats but keeps a position that returns later', () => {
    expect(dedupeConsecutive([[1, 1], [1, 1], [2, 2], [1, 1]])).toEqual([[1, 1], [2, 2], [1, 1]]);
  });
});

describe('decimatePositions', () => {
  it('leaves a short list untouched', () => {
    expect(decimatePositions(square, 10)).toEqual(square);
  });

  it('thins to the budget while keeping the first and last position', () => {
    const many: Position[] = Array.from({ length: 5000 }, (_, i) => [5 + i / 100000, 52]);

    const thinned = decimatePositions(many, 1000);

    expect(thinned).toHaveLength(1000);
    expect(thinned[0]).toEqual(many[0]);
    expect(thinned[thinned.length - 1]).toEqual(many[many.length - 1]);
  });
});

describe('closeRing', () => {
  it('repeats the first position at the end', () => {
    expect(closeRing(square)).toEqual([...square, square[0]]);
  });

  it('leaves an already closed ring alone', () => {
    const closed = [...square, square[0]];
    expect(closeRing(closed)).toEqual(closed);
  });
});

describe('buildPolygon', () => {
  it('builds a closed ring from drawn positions', () => {
    expect(buildPolygon(square)).toEqual({
      type: 'Polygon',
      coordinates: [[...square, square[0]]],
    });
  });

  it('ignores invalid and duplicated positions', () => {
    const drawn: Position[] = [
      [5.1, 52.1], [5.1, 52.1], [Number.NaN, 52.1], [5.2, 52.1], [5.2, 52.2],
    ];

    expect(buildPolygon(drawn)).toEqual({
      type: 'Polygon',
      coordinates: [[[5.1, 52.1], [5.2, 52.1], [5.2, 52.2], [5.1, 52.1]]],
    });
  });

  it('returns null when fewer than three distinct positions remain', () => {
    expect(buildPolygon([[5.1, 52.1], [5.1, 52.1], [5.2, 52.1]])).toBeNull();
    expect(buildPolygon([])).toBeNull();
  });

  it('counts a closed triangle as three corners', () => {
    const triangle: Position[] = [[5.1, 52.1], [5.2, 52.1], [5.2, 52.2], [5.1, 52.1]];

    expect(buildPolygon(triangle)?.coordinates[0]).toHaveLength(4);
  });

  it('keeps a lasso within the vertex budget and closes it', () => {
    const lasso: Position[] = Array.from({ length: 4000 }, (_, i) => [
      5 + Math.cos((i / 4000) * Math.PI * 2) / 100,
      52 + Math.sin((i / 4000) * Math.PI * 2) / 100,
    ]);

    const polygon = buildPolygon(lasso);
    const ring = polygon?.coordinates[0] ?? [];

    expect(ring.length).toBeLessThanOrEqual(1001);
    expect(ring.length).toBeGreaterThan(3);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
});

describe('toDrawingFeatureCollection', () => {
  it('is empty below two positions', () => {
    expect(toDrawingFeatureCollection([[5.1, 52.1]]).features).toEqual([]);
  });

  it('draws a line for two positions', () => {
    expect(toDrawingFeatureCollection([[5.1, 52.1], [5.2, 52.1]]).features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [[5.1, 52.1], [5.2, 52.1]],
    });
  });

  it('draws a closed polygon from three positions on', () => {
    expect(toDrawingFeatureCollection(square).features[0].geometry).toEqual({
      type: 'Polygon',
      coordinates: [[...square, square[0]]],
    });
  });
});

describe('toPolygonFeatureCollection', () => {
  it('is empty without a polygon', () => {
    expect(toPolygonFeatureCollection(null).features).toEqual([]);
  });

  it('wraps the polygon in a feature', () => {
    const polygon = buildPolygon(square);

    expect(toPolygonFeatureCollection(polygon).features[0].geometry).toEqual(polygon);
  });
});
