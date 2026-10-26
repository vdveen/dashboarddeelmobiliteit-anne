/**
 * Drukte on the Aanbod map: where trips ended in the selected period, per
 * parking hub, per place (a group of hubs) or per spot outside the hubs, with
 * a choice of measure. Modelled on Groningen's "Drukke plekken" tool, which
 * does the same for parked vehicles.
 *
 * Hubs are those of the Parkeerhubs layer (see parkingCompliance.ts). A trip
 * end only counts for a hub of its own operator, like a parked bike in
 * Parkeernaleving.
 */
import {
  HUB_MARGIN_M,
  HubIndex,
  PreparedHub,
  nearestHubWithin,
  operatorKey
} from './parkingCompliance';

// Every two hubs in a place are at most this far apart, and a trip end
// counts for the place of its nearest hub within this distance. The same
// grouping as the Voi trips analysis (apps/voi-trips).
export const PLACE_DIAMETER_M = 500;

// The baseline for "Boven normaal": the four weeks before the period
export const BASELINE_WEEKS = 4;

const HOUR_MS = 3600 * 1000;
const METRES_PER_DEGREE = 111320;

export type DrukteEenheid = 'hubs' | 'plekken' | 'buiten';
export type DrukteMaatstaf = 'ritten' | 'piekuur' | 'uren_druk' | 'boven_normaal' | 'netto';

export interface RideEvent {
  // Operator system_id
  operator: string;
  lon: number;
  lat: number;
  // Epoch milliseconds
  time: number;
}

export interface DrukteSpot {
  id: string;
  kind: 'hub' | 'plek' | 'buiten';
  lon: number;
  lat: number;
  // Hubs in the place, or 1 for a hub; 0 outside the hubs
  hubCount: number;
  // Operators whose hubs make up the hub or place
  hubOperators: string[];
  ends: number;
  perOperator: Record<string, number>;
  // Trip ends per hour of the day (0-23, Dutch time)
  hourOfDay: number[];
  // The busiest clock hour of the period
  peakHour: { start: number; count: number } | null;
  // Hours with at least drukPerUur trip ends
  busyHours: number;
  // Expected trip ends from the baseline, when it was loaded
  expected: number | null;
  // Trip starts, when they were loaded
  starts: number | null;
}

export interface DrukteInput {
  index: HubIndex;
  ends: RideEvent[];
  starts?: RideEvent[] | null;
  baseline?: RideEvent[] | null;
  window: { start: number; end: number };
  eenheid: DrukteEenheid;
  // Minimum trip ends in the period for a spot (and for a cluster outside the hubs)
  minimaal: number;
  // Cluster radius outside the hubs, in metres
  straal: number;
  // Trip ends in one hour for that hour to count as busy
  drukPerUur: number;
  excludedOperators: string[];
}

export interface DrukteResult {
  spots: DrukteSpot[];
  // Trip ends of the selected operators in the period
  totalEnds: number;
  // Of those, the ends that fell in a hub, place or cluster
  assignedEnds: number;
  // Trip ends of operators without hubs here (they only appear outside the hubs)
  endsWithoutHubs: number;
  // Clock hours in the period
  hours: number;
}

// ---------- Time ----------

const hourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Amsterdam',
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23'
});
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const localHourCache = new Map<number, { hourOfDay: number; hourOfWeek: number }>();

// Dutch time shifts by whole hours, so a clock hour starts on a UTC hour
export const hourStart = (time: number) => Math.floor(time / HOUR_MS) * HOUR_MS;

export const localHour = (hourKey: number) => {
  let cached = localHourCache.get(hourKey);
  if (!cached) {
    const parts = hourFormat.formatToParts(new Date(hourKey));
    const hourOfDay = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const weekday = WEEKDAYS.indexOf(parts.find((p) => p.type === 'weekday')?.value || 'Mon');
    cached = { hourOfDay, hourOfWeek: weekday * 24 + hourOfDay };
    localHourCache.set(hourKey, cached);
  }
  return cached;
};

const windowHours = (window: { start: number; end: number }): number[] => {
  const hours: number[] = [];
  for (let h = hourStart(window.start); h < window.end; h += HOUR_MS) hours.push(h);
  return hours;
};

// ---------- Places: hubs grouped by complete linkage ----------

export interface HubPlace {
  id: string;
  hubs: PreparedHub[];
  center: [number, number];
}

// Minimal binary heap on the first element of each entry
class MinHeap {
  private items: [number, number, number][] = [];
  get size() { return this.items.length; }
  push(item: [number, number, number]) {
    const a = this.items;
    a.push(item);
    for (let i = a.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] <= a[i][0]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): [number, number, number] | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop() as [number, number, number];
    if (a.length > 0) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const localProjection = (points: [number, number][]) => {
  const lat0 = points.length ? points.reduce((sum, p) => sum + p[1], 0) / points.length : 52;
  const lonScale = Math.cos((lat0 * Math.PI) / 180);
  return (p: [number, number]): [number, number] => [
    p[0] * METRES_PER_DEGREE * lonScale,
    p[1] * METRES_PER_DEGREE
  ];
};

/**
 * Group hubs into places: merge the two closest groups, where the distance
 * between groups is the largest distance between their hubs, until no two
 * groups are within the diameter. Hubs of different operators at the same
 * spot end up in one place. Ported from places.py of the Voi trips analysis.
 */
export const groupHubsIntoPlaces = (hubs: PreparedHub[], diameter = PLACE_DIAMETER_M): HubPlace[] => {
  const project = localProjection(hubs.map((h) => h.center));
  const xy = hubs.map((h) => project(h.center));

  // Only pairs within the diameter can ever merge, so keep just those
  const neighbours = new Map<number, Map<number, number>>();
  hubs.forEach((_, i) => neighbours.set(i, new Map()));
  const heap = new MinHeap();
  const grid = new Map<string, number[]>();
  xy.forEach(([x, y], i) => {
    const cx = Math.floor(x / diameter), cy = Math.floor(y / diameter);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${cx + dx}:${cy + dy}`) || []) {
          const d = Math.hypot(x - xy[j][0], y - xy[j][1]);
          if (d <= diameter) {
            (neighbours.get(i) as Map<number, number>).set(j, d);
            (neighbours.get(j) as Map<number, number>).set(i, d);
            heap.push([d, j, i]);
          }
        }
      }
    }
    const key = `${cx}:${cy}`;
    if (grid.has(key)) (grid.get(key) as number[]).push(i);
    else grid.set(key, [i]);
  });

  const members = hubs.map((_, i) => [i]);
  const alive = hubs.map(() => true);
  while (heap.size > 0) {
    const [d, a, b] = heap.pop() as [number, number, number];
    // Skip pairs that merged elsewhere or whose distance has grown since
    if (!alive[a] || !alive[b] || neighbours.get(a)?.get(b) !== d) continue;

    members[a] = members[a].concat(members[b]);
    alive[b] = false;
    const na = neighbours.get(a) as Map<number, number>;
    const nb = neighbours.get(b) as Map<number, number>;
    const merged = new Map<number, number>();
    na.forEach((dac, c) => {
      if (c === b) return;
      const dbc = nb.get(c);
      const nc = neighbours.get(c) as Map<number, number>;
      if (dbc === undefined) {
        // Some hub of b is farther than the diameter from c
        nc.delete(a);
        return;
      }
      const d2 = Math.max(dac, dbc);
      merged.set(c, d2);
      nc.set(a, d2);
      heap.push([d2, a, c]);
    });
    nb.forEach((_, c) => { if (c !== a) neighbours.get(c)?.delete(b); });
    neighbours.set(a, merged);
    neighbours.delete(b);
  }

  const places: HubPlace[] = [];
  members.forEach((idx, i) => {
    if (!alive[i]) return;
    const placeHubs = idx.map((j) => hubs[j]);
    const lon = placeHubs.reduce((s, h) => s + h.center[0], 0) / placeHubs.length;
    const lat = placeHubs.reduce((s, h) => s + h.center[1], 0) / placeHubs.length;
    places.push({ id: `plek:${placeHubs.map((h) => h.id).sort()[0]}`, hubs: placeHubs, center: [lon, lat] });
  });
  return places;
};

const allHubs = (index: HubIndex): PreparedHub[] =>
  Array.from(index.operators.values()).flatMap((entry) => entry.hubs);

// Places are cached per hub index, so changing the measure does not regroup
const placesCache = new WeakMap<HubIndex, { places: HubPlace[]; placeOfHub: Map<string, HubPlace> }>();
export const placesForIndex = (index: HubIndex) => {
  let cached = placesCache.get(index);
  if (!cached) {
    const places = groupHubsIntoPlaces(allHubs(index));
    const placeOfHub = new Map<string, HubPlace>();
    places.forEach((place) => place.hubs.forEach((hub) => placeOfHub.set(hub.id, place)));
    cached = { places, placeOfHub };
    placesCache.set(index, cached);
  }
  return cached;
};

// ---------- Clusters outside the hubs (Groningen's method) ----------

interface ClusterPoint { x: number; y: number; event: RideEvent }

/**
 * Start at the trip end with the most other ends within the radius and take
 * them all; repeat with what is left. Groups whose centres are within the
 * radius are one spot and are merged. The same method as Groningen's
 * "Drukke plekken" uses for parked vehicles.
 */
export const clusterPoints = (
  events: RideEvent[],
  radius: number,
  minimum: number
): RideEvent[][] => {
  const project = localProjection(events.map((e) => [e.lon, e.lat]));
  const pts: ClusterPoint[] = events.map((event) => {
    const [x, y] = project([event.lon, event.lat]);
    return { x, y, event };
  });
  const key = (x: number, y: number) => `${Math.floor(x / radius)}:${Math.floor(y / radius)}`;
  const grid = new Map<string, number[]>();
  pts.forEach((p, i) => {
    const k = key(p.x, p.y);
    if (grid.has(k)) (grid.get(k) as number[]).push(i);
    else grid.set(k, [i]);
  });
  const near = (i: number, taken: Uint8Array | null) => {
    const out: number[] = [];
    const gx = Math.floor(pts[i].x / radius), gy = Math.floor(pts[i].y / radius);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${gx + dx}:${gy + dy}`) || []) {
          if ((!taken || !taken[j]) && Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) <= radius) out.push(j);
        }
      }
    }
    return out;
  };

  const order = pts
    .map((_, i) => ({ i, c: near(i, null).length }))
    .filter((o) => o.c >= minimum)
    .sort((a, b) => b.c - a.c);
  const taken = new Uint8Array(pts.length);
  let groups: number[][] = [];
  order.forEach((o) => {
    if (taken[o.i]) return;
    const m = near(o.i, taken);
    if (m.length < minimum) return;
    m.forEach((j) => { taken[j] = 1; });
    groups.push(m);
  });

  const mid = (g: number[]) => [
    g.reduce((s, j) => s + pts[j].x, 0) / g.length,
    g.reduce((s, j) => s + pts[j].y, 0) / g.length
  ];
  for (let merged = true; merged;) {
    merged = false;
    const mids = groups.map(mid);
    outer: for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        if (Math.hypot(mids[a][0] - mids[b][0], mids[a][1] - mids[b][1]) <= radius) {
          groups[a] = groups[a].concat(groups[b]);
          groups = groups.filter((_, k) => k !== b);
          merged = true;
          break outer;
        }
      }
    }
  }
  return groups.map((g) => g.map((j) => pts[j].event));
};

// ---------- Spots and measures ----------

interface SpotAccumulator {
  spot: DrukteSpot;
  hourly: Map<number, number>;
  baselineByHourOfWeek: number[] | null;
}

const newSpot = (
  id: string,
  kind: DrukteSpot['kind'],
  center: [number, number],
  hubs: PreparedHub[],
  withBaseline: boolean,
  withStarts: boolean
): SpotAccumulator => ({
  spot: {
    id,
    kind,
    lon: center[0],
    lat: center[1],
    hubCount: hubs.length,
    hubOperators: Array.from(new Set(hubs.map((h) => h.operator))).sort(),
    ends: 0,
    perOperator: {},
    hourOfDay: new Array(24).fill(0),
    peakHour: null,
    busyHours: 0,
    expected: withBaseline ? 0 : null,
    starts: withStarts ? 0 : null
  },
  hourly: new Map(),
  baselineByHourOfWeek: withBaseline ? new Array(7 * 24).fill(0) : null
});

const addEnd = (acc: SpotAccumulator, event: RideEvent) => {
  const s = acc.spot;
  s.ends += 1;
  s.perOperator[event.operator] = (s.perOperator[event.operator] || 0) + 1;
  const h = hourStart(event.time);
  acc.hourly.set(h, (acc.hourly.get(h) || 0) + 1);
  s.hourOfDay[localHour(h).hourOfDay] += 1;
};

const inWindow = (window: { start: number; end: number }) => (e: RideEvent) =>
  e.time >= window.start && e.time < window.end;

/**
 * Count the trip ends of the period per hub, place or cluster outside the
 * hubs, with the numbers every measure needs.
 */
export const computeDrukte = (input: DrukteInput): DrukteResult => {
  const { index, window, eenheid } = input;
  const excluded = new Set(input.excludedOperators.map(operatorKey));
  const selected = (e: RideEvent) => !excluded.has(operatorKey(e.operator));
  const ends = input.ends.filter((e) => selected(e) && inWindow(window)(e));
  const starts = input.starts ? input.starts.filter((e) => selected(e) && inWindow(window)(e)) : null;
  const baseline = input.baseline ? input.baseline.filter(selected) : null;
  const hasHubs = (e: RideEvent) => index.operators.has(operatorKey(e.operator));
  const endsWithoutHubs = ends.filter((e) => !hasHubs(e)).length;

  const spots = new Map<string, SpotAccumulator>();
  // Which spot a start or baseline end belongs to, or null
  let assign: (e: RideEvent) => string | null;
  let make: (id: string) => SpotAccumulator;
  // The same for a trip end of the period
  let assignEnd = (e: RideEvent) => assign(e);

  if (eenheid === 'hubs') {
    const hubById = new Map(allHubs(index).map((h) => [h.id, h]));
    assign = (e) => nearestHubWithin(index, e.operator, e.lon, e.lat, HUB_MARGIN_M)?.hub.id || null;
    make = (id) => {
      const hub = hubById.get(id) as PreparedHub;
      return newSpot(id, 'hub', hub.center, [hub], !!baseline, !!starts);
    };
  } else if (eenheid === 'plekken') {
    const { placeOfHub } = placesForIndex(index);
    const placeById = new Map(Array.from(placeOfHub.values()).map((p) => [p.id, p]));
    assign = (e) => {
      const nearest = nearestHubWithin(index, e.operator, e.lon, e.lat, PLACE_DIAMETER_M);
      return nearest ? placeOfHub.get(nearest.hub.id)?.id || null : null;
    };
    make = (id) => {
      const place = placeById.get(id) as HubPlace;
      return newSpot(id, 'plek', place.center, place.hubs, !!baseline, !!starts);
    };
  } else {
    // Outside the hubs: not within the hub margin of an own-operator hub.
    // Operators without hubs here are always outside.
    const outside = (e: RideEvent) => !nearestHubWithin(index, e.operator, e.lon, e.lat, HUB_MARGIN_M);
    const groups = clusterPoints(ends.filter(outside), input.straal, input.minimaal);
    const centers = groups.map((g): [number, number] => [
      g.reduce((s, e) => s + e.lon, 0) / g.length,
      g.reduce((s, e) => s + e.lat, 0) / g.length
    ]);
    const project = localProjection(centers);
    const centerXY = centers.map(project);
    const ids = groups.map((g, i) => `buiten:${i}`);
    // The window's own ends keep their cluster; starts and baseline ends go to
    // the nearest centre within the radius
    const groupOf = new Map<RideEvent, string>();
    groups.forEach((g, i) => g.forEach((e) => groupOf.set(e, ids[i])));
    assignEnd = (e) => groupOf.get(e) || null;
    assign = (e) => {
      if (!outside(e)) return null;
      const [x, y] = project([e.lon, e.lat]);
      let best = -1, bestD = Infinity;
      centerXY.forEach(([cx, cy], i) => {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= input.straal && d < bestD) { best = i; bestD = d; }
      });
      return best >= 0 ? ids[best] : null;
    };
    make = (id) => newSpot(id, 'buiten', centers[ids.indexOf(id)], [], !!baseline, !!starts);
    ids.forEach((id) => spots.set(id, make(id)));
  }

  const get = (id: string) => {
    let acc = spots.get(id);
    if (!acc) { acc = make(id); spots.set(id, acc); }
    return acc;
  };

  let assignedEnds = 0;
  ends.forEach((e) => {
    const id = assignEnd(e);
    if (!id) return;
    assignedEnds += 1;
    addEnd(get(id), e);
  });
  // Starts and baseline only count for spots that had trip ends
  starts?.forEach((e) => {
    const id = assign(e);
    const acc = id ? spots.get(id) : undefined;
    if (acc) acc.spot.starts = (acc.spot.starts || 0) + 1;
  });
  baseline?.forEach((e) => {
    const id = assign(e);
    const acc = id ? spots.get(id) : undefined;
    if (acc && acc.baselineByHourOfWeek) acc.baselineByHourOfWeek[localHour(hourStart(e.time)).hourOfWeek] += 1;
  });

  const hours = windowHours(window);
  const result: DrukteSpot[] = [];
  spots.forEach((acc) => {
    const s = acc.spot;
    if (s.ends === 0 || s.ends < input.minimaal) return;
    acc.hourly.forEach((count, start) => {
      if (!s.peakHour || count > s.peakHour.count) s.peakHour = { start, count };
      if (count >= input.drukPerUur) s.busyHours += 1;
    });
    if (acc.baselineByHourOfWeek) {
      const byHow = acc.baselineByHourOfWeek;
      s.expected = hours.reduce((sum, h) => sum + byHow[localHour(h).hourOfWeek], 0) / BASELINE_WEEKS;
    }
    result.push(s);
  });

  return { spots: result, totalEnds: ends.length, assignedEnds, endsWithoutHubs, hours: hours.length };
};

/** The value a spot is ranked and sized by for a measure. */
export const kpiValue = (spot: DrukteSpot, maatstaf: DrukteMaatstaf, hours: number): number => {
  switch (maatstaf) {
    case 'piekuur': return spot.peakHour?.count || 0;
    case 'uren_druk': return hours > 0 ? spot.busyHours / hours : 0;
    case 'boven_normaal': return spot.ends - (spot.expected || 0);
    case 'netto': return spot.ends - (spot.starts || 0);
    default: return spot.ends;
  }
};

export const sortSpots = (spots: DrukteSpot[], maatstaf: DrukteMaatstaf, hours: number): DrukteSpot[] =>
  [...spots].sort((a, b) => kpiValue(b, maatstaf, hours) - kpiValue(a, maatstaf, hours) || b.ends - a.ends);
