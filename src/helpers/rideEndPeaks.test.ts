import { buildHubIndex } from './parkingCompliance';
import {
  clusterPoints,
  computeDrukte,
  groupHubsIntoPlaces,
  kpiValue,
  occupancyFor,
  occupancySpots,
  occupancyZones,
  placesForIndex,
  sortSpots,
  RideEvent
} from './rideEndPeaks';

// About 10 m in longitude and latitude near Amersfoort
const LON_10M = 10 / (111320 * Math.cos((52.15 * Math.PI) / 180));
const LAT_10M = 10 / 111320;

const square = (lon: number, lat: number, operator: string): GeoJSON.Feature => ({
  type: 'Feature',
  properties: { operator },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [lon, lat], [lon + LON_10M, lat], [lon + LON_10M, lat + LAT_10M], [lon, lat + LAT_10M], [lon, lat]
    ]]
  }
});

const LON = 5.38, LAT = 52.15;
// Two Voi hubs 100 m apart, a Dott hub on the first one and a Voi hub 2 km away
const index = buildHubIndex([
  square(LON, LAT, 'voi'),
  square(LON + 10 * LON_10M, LAT, 'voi'),
  square(LON, LAT, 'dott'),
  square(LON + 200 * LON_10M, LAT, 'voi')
]);

const T0 = Date.UTC(2026, 9, 19, 6); // Monday 19 October 2026, 08:00 Dutch time
const H = 3600 * 1000;
const at = (operator: string, dxM: number, dyM: number, time: number): RideEvent => ({
  operator,
  lon: LON + (dxM / 10) * LON_10M,
  lat: LAT + (dyM / 10) * LAT_10M,
  time
});

const base = {
  index,
  window: { start: T0, end: T0 + 24 * H },
  minimaal: 1,
  straal: 20,
  drukPerUur: 2,
  excludedOperators: [] as string[]
};

describe('groupHubsIntoPlaces', () => {
  it('groups hubs within 500 m into one place, across operators', () => {
    const places = placesForIndex(index).places;
    expect(places.map((p) => p.hubs.length).sort()).toEqual([1, 3]);
  });

  it('uses complete linkage: a chain longer than the diameter splits', () => {
    const chain = buildHubIndex([0, 30, 60].map((i) => square(LON + i * LON_10M, LAT, 'voi')));
    const hubs = Array.from(chain.operators.values()).flatMap((e) => e.hubs);
    // 300 m between neighbours, 600 m end to end
    expect(groupHubsIntoPlaces(hubs).map((p) => p.hubs.length).sort()).toEqual([1, 2]);
  });
});

describe('computeDrukte', () => {
  const ends = [
    at('voi', 5, 5, T0),            // in the first Voi hub
    at('voi', 5, 5, T0 + 60000),    // same hub, same hour
    at('voi', 105, 5, T0 + 2 * H),  // in the second Voi hub
    at('dott', 5, 5, T0 + 3 * H),   // in the Dott hub on the first spot
    at('voi', 50, 600, T0 + 4 * H), // 600 m from every hub
    at('lime', 5, 5, T0 + 5 * H),   // operator without hubs
    at('voi', 5, 5, T0 + 30 * H)    // after the window
  ];

  it('counts trip ends per hub of the own operator', () => {
    const { spots, totalEnds, assignedEnds, endsWithoutHubs } = computeDrukte({ ...base, ends, eenheid: 'hubs' });
    expect(totalEnds).toBe(6);
    expect(assignedEnds).toBe(4);
    expect(endsWithoutHubs).toBe(1);
    const byId = Object.fromEntries(spots.map((s) => [s.id, s]));
    expect(byId['voi:0'].ends).toBe(2);
    expect(byId['voi:0'].peakHour).toEqual({ start: T0, count: 2 });
    expect(byId['voi:0'].busyHours).toBe(1);
    expect(byId['voi:0'].hourOfDay[8]).toBe(2);
    expect(byId['voi:1'].ends).toBe(1);
    expect(byId['dott:0'].ends).toBe(1);
  });

  it('counts trip ends per place', () => {
    const { spots } = computeDrukte({ ...base, ends, eenheid: 'plekken' });
    expect(spots).toHaveLength(1);
    expect(spots[0].hubCount).toBe(3);
    expect(spots[0].ends).toBe(4);
    expect(spots[0].perOperator).toEqual({ voi: 3, dott: 1 });
    expect(spots[0].hubOperators).toEqual(['dott', 'voi']);
  });

  it('clusters trip ends outside the hubs, including operators without hubs', () => {
    const outside = [
      ...[0, 1, 2].map((i) => at('voi', 50 + i, 300, T0 + i * H)),
      at('lime', 5, 5, T0),
      at('voi', 5, 5, T0) // in a hub: not outside
    ];
    const { spots } = computeDrukte({ ...base, ends: outside, eenheid: 'buiten', minimaal: 3 });
    expect(spots).toHaveLength(1);
    expect(spots[0].ends).toBe(3);
    expect(spots[0].kind).toBe('buiten');
  });

  it('respects the Aanbieders filter', () => {
    const { spots } = computeDrukte({ ...base, ends, eenheid: 'plekken', excludedOperators: ['dott'] });
    expect(spots[0].ends).toBe(3);
  });

  it('compares with the same hours of the four weeks before', () => {
    const W = 7 * 24 * H;
    // Two ends at 08:00 on Mondays in the baseline: half an end a week
    const baseline = [at('voi', 5, 5, T0 - W), at('voi', 5, 5, T0 - 3 * W), at('voi', 5, 5, T0 - 3 * W + 2 * H)];
    const { spots, hours } = computeDrukte({ ...base, ends, baseline, eenheid: 'hubs' });
    const hub = spots.find((s) => s.id === 'voi:0')!;
    expect(hub.expected).toBe(0.75);
    expect(kpiValue(hub, 'boven_normaal', hours)).toBe(1.25);
  });

  it('computes net arrivals from trip starts', () => {
    const starts = [at('voi', 5, 5, T0 + H)];
    const { spots, hours } = computeDrukte({ ...base, ends, starts, eenheid: 'hubs' });
    const hub = spots.find((s) => s.id === 'voi:0')!;
    expect(hub.starts).toBe(1);
    expect(kpiValue(hub, 'netto', hours)).toBe(1);
  });

  it('ranks by the chosen measure and drops spots under the minimum', () => {
    const { spots, hours } = computeDrukte({ ...base, ends, eenheid: 'hubs', minimaal: 2 });
    expect(spots.map((s) => s.id)).toEqual(['voi:0']);
    const all = computeDrukte({ ...base, ends, eenheid: 'hubs' });
    expect(sortSpots(all.spots, 'ritten', all.hours)[0].id).toBe('voi:0');
    expect(kpiValue(spots[0], 'uren_druk', hours)).toBeCloseTo(1 / 24);
  });
});

describe('clusterPoints', () => {
  it('merges groups whose centres lie within the radius', () => {
    const pts = [0, 4, 8, 12, 16, 20, 24, 28].map((x) => at('voi', 50 + x, 300, T0));
    const groups = clusterPoints(pts, 20, 3);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(8);
  });
});

describe('occupancy', () => {
  const M = 10 * 60 * 1000;
  const times = [0, 1, 2, 3, 4, 5].map((k) => T0 + k * M);

  it('asks for every Voi hub, or every place with Voi hubs as one MultiPolygon', () => {
    expect(occupancyZones(index, 'hubs').map((z) => z.id)).toEqual(['voi:0', 'voi:1', 'voi:2']);
    const places = occupancyZones(index, 'plekken');
    expect(places).toHaveLength(2);
    const big = places.find((z) => z.polygon.type === 'MultiPolygon')!;
    expect((big.polygon as GeoJSON.MultiPolygon).coordinates).toHaveLength(2);
    expect(occupancyZones(index, 'buiten')).toEqual([]);
  });

  it('finds the maximum, the share over the threshold and the intervals', () => {
    const series = { i: [0, 1, 2, 4, 5], operational: [3, 6, 4, 9, 2], total: [4, 7, 6, 11, 3] };
    const o = occupancyFor(times, series, 5);
    expect(o.maxTotal).toBe(11);
    expect(o.maxOperational).toBe(9);
    expect(o.maxAt).toBe(times[4]);
    expect(o.overSnapshots).toBe(3);
    expect(o.overShare).toBeCloseTo(0.5);
    expect(o.intervals).toEqual([
      { start: times[1], end: times[3], max: 7 },
      { start: times[4], end: times[5], max: 11 }
    ]);
    expect(o.hourOfDayAvg[8]).toBeCloseTo(31 / 6);
  });

  it('ends an interval at a long gap between snapshots', () => {
    const gapped = [T0, T0 + M, T0 + 3 * 60 * M];
    const o = occupancyFor(gapped, { i: [0, 1, 2], operational: [6, 6, 6], total: [6, 6, 6] }, 5);
    expect(o.intervals).toEqual([
      { start: gapped[0], end: gapped[1] + M, max: 6 },
      { start: gapped[2], end: gapped[2] + M, max: 6 }
    ]);
  });

  it('builds spots for zones that held a vehicle and keeps their trip ends', () => {
    const response = {
      captured_at: times.map((t) => new Date(t).toISOString()),
      zones: { 'voi:0': { i: [0], operational: [2], total: [2] }, 'voi:1': { i: [1], operational: [1], total: [1] } }
    };
    const rides = computeDrukte({ ...base, ends: [at('voi', 5, 5, T0)], eenheid: 'hubs' }).spots;
    const spots = occupancySpots(index, 'hubs', response, 5, rides);
    const byId = Object.fromEntries(spots.map((s) => [s.id, s]));
    expect(byId['voi:0'].ends).toBe(1);
    expect(byId['voi:1'].ends).toBe(0);
    expect(kpiValue(byId['voi:0'], 'max_voertuigen', 24)).toBe(2);
  });
});
