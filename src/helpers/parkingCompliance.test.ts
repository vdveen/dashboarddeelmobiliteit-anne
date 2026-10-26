import {
  buildHubIndex,
  distanceToNearestHub,
  hubIndexHasOperator,
  isMeasuredFormFactor,
  parkeerafstandBandFor
} from './parkingCompliance';

// Metres to degrees around Hilversum (52.22 N)
const LAT = 52.22;
const LON = 5.17;
const dLat = (m: number) => m / 111320;
const dLon = (m: number) => m / (111320 * Math.cos((LAT * Math.PI) / 180));

// A square hub of 10 x 10 m with its south-west corner at (x, y) metres
const squareHub = (operator: string, x: number, y: number): GeoJSON.Feature => ({
  type: 'Feature',
  properties: { operator },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [LON + dLon(x), LAT + dLat(y)],
      [LON + dLon(x + 10), LAT + dLat(y)],
      [LON + dLon(x + 10), LAT + dLat(y + 10)],
      [LON + dLon(x), LAT + dLat(y + 10)],
      [LON + dLon(x), LAT + dLat(y)]
    ]]
  }
});

const index = buildHubIndex([squareHub('voi', 0, 0), squareHub('lime', 1000, 0)]);
const distance = (operator: string, x: number, y: number) =>
  distanceToNearestHub(index, operator, LON + dLon(x), LAT + dLat(y)) as number;

test('a vehicle inside a hub has distance 0', () => {
  expect(distance('voi', 5, 5)).toBe(0);
});

test('distance is measured to the hub outline', () => {
  expect(distance('voi', 45, 5)).toBeCloseTo(35, 0);
  expect(distance('voi', 13, 14)).toBeCloseTo(5, 0);
});

test('only hubs of the vehicle operator count', () => {
  // Next to the Lime hub, but Voi's hub is about 990 m away
  expect(distance('voi', 1005, 15)).toBeGreaterThan(990);
  expect(distance('lime', 1005, 15)).toBeCloseTo(5, 0);
  expect(distanceToNearestHub(index, 'dott', LON, LAT)).toBeNull();
  expect(hubIndexHasOperator(index, 'Voi')).toBe(true);
  expect(hubIndexHasOperator(index, 'dott')).toBe(false);
});

test('far vehicles get their exact distance', () => {
  expect(distance('voi', 5, 510)).toBeCloseTo(500, 0);
});

test('distances fall into the Groningen bands', () => {
  expect(parkeerafstandBandFor(0)).toBe(0);
  expect(parkeerafstandBandFor(20)).toBe(0);
  expect(parkeerafstandBandFor(20.1)).toBe(1);
  expect(parkeerafstandBandFor(50)).toBe(1);
  expect(parkeerafstandBandFor(51)).toBe(2);
  expect(parkeerafstandBandFor(200)).toBe(2);
  expect(parkeerafstandBandFor(201)).toBe(3);
});

test('only bikes are measured', () => {
  expect(isMeasuredFormFactor('bicycle')).toBe(true);
  expect(isMeasuredFormFactor('cargo_bicycle')).toBe(true);
  expect(isMeasuredFormFactor('moped')).toBe(false);
  expect(isMeasuredFormFactor(null)).toBe(false);
});
