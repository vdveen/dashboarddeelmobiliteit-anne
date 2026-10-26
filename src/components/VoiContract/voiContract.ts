import {
  BEDRIJVENTERREIN_HOUR,
  Bedrijventerrein,
  ContractRegion,
  KNOOPPUNT_END_HOUR,
  KNOOPPUNT_MINIMUM,
  KNOOPPUNT_START_HOUR,
  KNOOPPUNT_TARGET_SHARE,
  Knooppunt,
} from '../../config/voiContractZones';
import { amsterdamOffsetMs, SNAPSHOT_INTERVAL_MS } from '../VoiAvailability/voiAvailabilityChart';

/**
 * Pure calculations for the Voi contract monitor: the zone polygons sent to
 * voi-snapshot-api, the calendar week, and the checks of Eis 2, 36 and 39.
 */

type Lonlat = [number, number];

const METERS_PER_DEGREE_LAT = 110540;
const metersPerDegreeLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);
const CIRCLE_VERTICES = 64;

/**
 * Clip a convex polygon (local metres) to the half-plane of points at least as
 * close to the origin as to `other` (Sutherland-Hodgman, one edge).
 */
function clipCloserToOrigin(points: Lonlat[], other: Lonlat): Lonlat[] {
  const [bx, by] = other;
  const limit = (bx * bx + by * by) / 2;
  const side = ([x, y]: Lonlat) => x * bx + y * by - limit;
  const result: Lonlat[] = [];
  points.forEach((current, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const currentSide = side(current);
    const previousSide = side(previous);
    if ((currentSide <= 0) !== (previousSide <= 0)) {
      const t = previousSide / (previousSide - currentSide);
      result.push([
        previous[0] + t * (current[0] - previous[0]),
        previous[1] + t * (current[1] - previous[1]),
      ]);
    }
    if (currentSide <= 0) result.push(current);
  });
  return result;
}

/**
 * The area of a knooppunt: a circle of `radiusM` around its point, minus the
 * part closer to another knooppunt. Two sides of one station therefore count
 * separate bikes, and no bike counts for two knooppunten.
 */
export function knooppuntPolygon(
  knooppunt: Knooppunt,
  all: Knooppunt[],
  radiusM: number
): GeoJSON.Polygon {
  const [lon0, lat0] = knooppunt.point;
  const kx = metersPerDegreeLon(lat0);
  const toLocal = ([lon, lat]: Lonlat): Lonlat => [(lon - lon0) * kx, (lat - lat0) * METERS_PER_DEGREE_LAT];
  const toLonlat = ([x, y]: Lonlat): Lonlat => [
    Math.round((lon0 + x / kx) * 1e7) / 1e7,
    Math.round((lat0 + y / METERS_PER_DEGREE_LAT) * 1e7) / 1e7,
  ];

  let points: Lonlat[] = [];
  for (let i = 0; i < CIRCLE_VERTICES; i += 1) {
    const angle = (2 * Math.PI * i) / CIRCLE_VERTICES;
    points.push([radiusM * Math.cos(angle), radiusM * Math.sin(angle)]);
  }
  all.forEach((other) => {
    if (other.id === knooppunt.id) return;
    const local = toLocal(other.point);
    if (Math.hypot(local[0], local[1]) >= 2 * radiusM) return;
    points = clipCloserToOrigin(points, local);
  });

  const ring = points.map(toLonlat);
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

export function terreinPolygon(terrein: Bedrijventerrein): GeoJSON.Polygon {
  return { type: 'Polygon', coordinates: [terrein.ring] };
}

/** Amsterdam wall clock of an instant, read with the UTC getters. */
function wallClock(epochMs: number): Date {
  return new Date(epochMs + amsterdamOffsetMs(epochMs));
}

/** The instant of an Amsterdam wall-clock time given as UTC fields. */
function fromWallClock(wallMs: number): number {
  const guess = wallMs - amsterdamOffsetMs(wallMs);
  return wallMs - amsterdamOffsetMs(guess);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ContractWeek {
  /** Monday 00:00 Amsterdam */
  start: number;
  /** The next Monday 00:00 Amsterdam */
  end: number;
}

/** The calendar week (Monday to Sunday, Amsterdam) that holds `epochMs`. */
export function weekOf(epochMs: number): ContractWeek {
  const wall = wallClock(epochMs);
  const midnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  const daysSinceMonday = (wall.getUTCDay() + 6) % 7;
  const mondayWall = midnight - daysSinceMonday * DAY_MS;
  return { start: fromWallClock(mondayWall), end: fromWallClock(mondayWall + 7 * DAY_MS) };
}

export function shiftWeek(week: ContractWeek, weeks: number): ContractWeek {
  // Noon on Wednesday stays inside the target week across a DST change
  return weekOf(week.start + (weeks * 7 + 2.5) * DAY_MS);
}

/** ISO week number, as the contract's calendar weeks are named. */
export function isoWeekNumber(week: ContractWeek): number {
  const wall = wallClock(week.start);
  const thursday = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 3);
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return Math.floor((thursday - yearStart) / DAY_MS / 7) + 1;
}

/** The request window: the whole week, or up to now for the current week. */
export function requestWindow(week: ContractWeek, now: number): { from: string; to: string } {
  const to = Math.min(now, week.end - 1);
  return { from: new Date(week.start).toISOString(), to: new Date(to).toISOString() };
}

export interface ZoneSeries {
  operational: number[];
  occupied_hubs?: number[];
}

export interface ZoneCountsResponse {
  from: string;
  to: string;
  captured_at: string[];
  zones: Record<string, ZoneSeries>;
}

interface Moment {
  index: number;
  time: number;
  /** Day of the week, Monday 0 to Sunday 6 */
  weekday: number;
  hour: number;
  minute: number;
}

function momentsOf(response: ZoneCountsResponse): Moment[] {
  return response.captured_at
    .map((value, index) => ({ time: Date.parse(value), index }))
    .filter(({ time }) => Number.isFinite(time))
    .map(({ time, index }) => {
      const wall = wallClock(time);
      return {
        index,
        time,
        weekday: (wall.getUTCDay() + 6) % 7,
        hour: wall.getUTCHours(),
        minute: wall.getUTCMinutes(),
      };
    });
}

export function isKnooppuntHour(hour: number): boolean {
  return hour >= KNOOPPUNT_START_HOUR && hour < KNOOPPUNT_END_HOUR;
}

export interface ShareResult {
  metMinutes: number;
  measuredMinutes: number;
  totalMinutes: number;
  unknownMinutes: number;
  /** Lower bound: metMinutes / totalMinutes. Null when no daytime has elapsed. */
  share: number | null;
  /** Upper bound if every unknown minute met the requirement. */
  upperShare: number | null;
}

const shareOf = (metMinutes: number, measuredMinutes: number, totalMinutes: number): ShareResult => {
  const unknownMinutes = Math.max(0, totalMinutes - measuredMinutes);
  return {
    metMinutes, measuredMinutes, totalMinutes, unknownMinutes,
    share: totalMinutes > 0 ? metMinutes / totalMinutes : null,
    upperShare: totalMinutes > 0 ? (metMinutes + unknownMinutes) / totalMinutes : null,
  };
};

/** Sum durations first, so a partial day or week never gets a full period's weight. */
export function sumShares(results: ShareResult[]): ShareResult {
  return shareOf(
    results.reduce((sum, result) => sum + result.metMinutes, 0),
    results.reduce((sum, result) => sum + result.measuredMinutes, 0),
    results.reduce((sum, result) => sum + result.totalMinutes, 0)
  );
}

/** Unknown time can prevent a verdict, but is neither a pass nor a failure. */
export function knooppuntMetOf(result: ShareResult): boolean | null {
  if (result.share === null || result.upperShare === null) return null;
  if (result.share >= KNOOPPUNT_TARGET_SHARE) return true;
  if (result.upperShare < KNOOPPUNT_TARGET_SHARE) return false;
  return null;
}

const percent = (share: number, upper = false) => {
  // Round bounds outwards; a value just below 80% must never display as 80%.
  const tenths = upper ? Math.ceil(share * 1000) : Math.floor(share * 1000);
  return (tenths / 10).toLocaleString('nl-NL', { maximumFractionDigits: 1 });
};

export function formatShare(result: ShareResult): string {
  if (result.share === null || result.upperShare === null) return '-';
  return result.unknownMinutes > 0
    ? `${percent(result.share)}–${percent(result.upperShare, true)}%`
    : `${percent(result.share)}%`;
}

export interface KnooppuntResult {
  /** Per weekday (Monday first), minutes within 06:00-24:00 Amsterdam time. */
  days: ShareResult[];
  week: ShareResult;
}

// Keep in sync with TEN_MINUTE_START in scripts/voi_database.py. Never infer
// the cadence from gaps: a missing snapshot must not extend the previous one.
const TEN_MINUTE_START = Date.parse('2026-09-08T10:50:00Z');
const MINUTE_MS = 60 * 1000;

function snapshotEnd(time: number): number {
  return time < TEN_MINUTE_START
    ? Math.min(time + 60 * MINUTE_MS, TEN_MINUTE_START)
    : time + SNAPSHOT_INTERVAL_MS;
}

/**
 * Eis 36: minutes with at least two non-defect bikes / all minutes in the
 * elapsed 06:00-24:00 windows. A snapshot estimates the following interval,
 * capped at the next snapshot, its scheduled duration, and the period end.
 * Missing intervals stay unknown. `range` is exclusive at the end and must
 * be clipped to the request time for a week or month that is still running.
 */
export function knooppuntResult(response: ZoneCountsResponse, id: string, range: ContractWeek): KnooppuntResult {
  const counts = response.zones[id]?.operational || [];
  const moments = momentsOf(response).sort((a, b) => a.time - b.time)
    .filter((moment, index, all) => index === 0 || moment.time !== all[index - 1].time);
  const met = Array(7).fill(0) as number[];
  const measured = Array(7).fill(0) as number[];
  const total = Array(7).fill(0) as number[];
  knooppuntWindows(range).forEach((window) => {
    const start = Math.max(range.start, window.start);
    const end = Math.min(range.end, window.end);
    if (end <= start) return;
    const day = (wallClock(start).getUTCDay() + 6) % 7;
    total[day] += (end - start) / MINUTE_MS;
    moments.forEach((moment, index) => {
      const count = counts[moment.index];
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return;
      const intervalEnd = Math.min(end, snapshotEnd(moment.time), moments[index + 1]?.time ?? Infinity);
      const minutes = Math.max(0, intervalEnd - Math.max(start, moment.time)) / MINUTE_MS;
      measured[day] += minutes;
      if (count >= KNOOPPUNT_MINIMUM) met[day] += minutes;
    });
  });
  const days = met.map((value, day) => shareOf(value, measured[day], total[day]));
  return { days, week: sumShares(days) };
}

export interface NoonResult {
  /** Null when no snapshot exists for 12:00 that day */
  operational: number | null;
  occupiedHubs: number | null;
  met: boolean | null;
}

/** Eis 39: non-defect bikes and occupied dropzones at 12:00, Monday to Friday. */
export function terreinResult(
  response: ZoneCountsResponse,
  terrein: Bedrijventerrein
): NoonResult[] {
  const series = response.zones[terrein.id];
  const days: NoonResult[] = Array.from({ length: 5 }, () => ({
    operational: null, occupiedHubs: null, met: null,
  }));
  momentsOf(response).forEach((moment) => {
    if (moment.weekday > 4 || moment.hour !== BEDRIJVENTERREIN_HOUR || moment.minute !== 0) return;
    const operational = series?.operational[moment.index] ?? 0;
    const occupiedHubs = series?.occupied_hubs ? series.occupied_hubs[moment.index] ?? 0 : null;
    days[moment.weekday] = {
      operational,
      occupiedHubs,
      // Without hub positions only the bike count can be checked
      met: operational >= terrein.minimum
        && (occupiedHubs === null || occupiedHubs >= terrein.minimumDropzones),
    };
  });
  return days;
}

/** Eis 2: the average over every snapshot of the summed counts of these zones. */
export function weeklyAverage(response: ZoneCountsResponse, ids: string[]): number | null {
  const moments = momentsOf(response);
  if (moments.length === 0) return null;
  const total = moments.reduce((sum, moment) => sum + ids.reduce(
    (zoneSum, id) => zoneSum + (response.zones[id]?.operational[moment.index] ?? 0), 0
  ), 0);
  return total / moments.length;
}

export function regionIds<T extends { id: string; region: ContractRegion }>(
  zones: T[],
  region: ContractRegion
): string[] {
  return zones.filter((zone) => zone.region === region).map((zone) => zone.id);
}

export interface ContractChartRow {
  time: number;
  missing?: true;
  count: number | null;
  occupiedHubs: number | null;
}

/** Chart rows for one zone, with a null row for every ten-minute boundary without a snapshot. */
export function chartRows(response: ZoneCountsResponse, id: string): ContractChartRow[] {
  const series = response.zones[id];
  const rows: ContractChartRow[] = momentsOf(response).map((moment) => ({
    time: moment.time,
    count: series?.operational[moment.index] ?? 0,
    occupiedHubs: series?.occupied_hubs ? series.occupied_hubs[moment.index] ?? 0 : null,
  }));
  const from = Date.parse(response.from);
  const to = Date.parse(response.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return rows;
  const present = new Set(rows.map((row) => row.time));
  const first = Math.ceil(from / SNAPSHOT_INTERVAL_MS) * SNAPSHOT_INTERVAL_MS;
  for (let boundary = first; boundary <= to; boundary += SNAPSHOT_INTERVAL_MS) {
    if (!present.has(boundary)) rows.push({ time: boundary, missing: true, count: null, occupiedHubs: null });
  }
  return rows.sort((left, right) => left.time - right.time);
}

/** Amsterdam midnights (as wall-clock UTC fields) of the days in a range. */
function wallDays(range: ContractWeek): number[] {
  const wall = wallClock(range.start);
  const days: number[] = [];
  let day = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  while (fromWallClock(day) < range.end) {
    days.push(day);
    day += DAY_MS;
  }
  return days;
}

/** Each day's 06:00-24:00 window inside the range, for the chart's shading. */
export function knooppuntWindows(range: ContractWeek): { start: number; end: number }[] {
  return wallDays(range).map((day) => ({
    start: fromWallClock(day + KNOOPPUNT_START_HOUR * 60 * 60 * 1000),
    end: fromWallClock(day + KNOOPPUNT_END_HOUR * 60 * 60 * 1000),
  }));
}

/** 12:00 on the weekdays inside the range, the moments Eis 39 is measured. */
export function noonMoments(range: ContractWeek): number[] {
  return wallDays(range)
    .filter((day) => new Date(day).getUTCDay() % 6 !== 0)
    .map((day) => fromWallClock(day + BEDRIJVENTERREIN_HOUR * 60 * 60 * 1000));
}

/** The calendar month (Amsterdam) that holds `epochMs`. */
export function monthOf(epochMs: number): ContractWeek {
  const wall = wallClock(epochMs);
  return {
    start: fromWallClock(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1)),
    end: fromWallClock(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + 1, 1)),
  };
}

export function shiftMonth(month: ContractWeek, months: number): ContractWeek {
  const wall = wallClock(month.start);
  return monthOf(fromWallClock(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + months, 15)));
}

/**
 * The calendar weeks of a range, cut to the range and to now. A month starts
 * and ends with partial weeks. Each part is one request and one column.
 */
export function weekParts(range: ContractWeek, now: number): ContractWeek[] {
  const parts: ContractWeek[] = [];
  let week = weekOf(range.start);
  const last = Math.min(range.end, now);
  while (week.start < last) {
    parts.push({ start: Math.max(week.start, range.start), end: Math.min(week.end, last) });
    week = shiftWeek(week, 1);
  }
  return parts;
}

/** One response for consecutive, non-overlapping requests. */
export function mergeResponses(responses: ZoneCountsResponse[]): ZoneCountsResponse {
  const zones: Record<string, ZoneSeries> = {};
  responses.forEach((response) => {
    Object.entries(response.zones).forEach(([id, series]) => {
      const merged = zones[id] || (zones[id] = { operational: [] });
      merged.operational.push(...series.operational);
      if (series.occupied_hubs) {
        merged.occupied_hubs = [...(merged.occupied_hubs || []), ...series.occupied_hubs];
      }
    });
  });
  return {
    from: responses[0]?.from ?? '',
    to: responses[responses.length - 1]?.to ?? '',
    captured_at: responses.flatMap((response) => response.captured_at),
    zones,
  };
}

/**
 * Where the line's colour changes, as a fraction from the top of its bounding
 * box, for a vertical gradient: at or above `minimum` is green, below is red.
 * Null when the line is flat, because a gradient on a zero-height box draws
 * nothing; the caller then uses a solid colour.
 */
export function thresholdOffset(rows: ContractChartRow[], minimum: number): number | null {
  const values = rows.map((row) => row.count).filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === min) return null;
  // Counts are whole numbers, so the boundary sits halfway below the minimum
  const offset = (max - (minimum - 0.5)) / (max - min);
  return Math.min(1, Math.max(0, offset));
}
