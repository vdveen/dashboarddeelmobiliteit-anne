import {
  BEDRIJVENTERREIN_HOUR,
  Bedrijventerrein,
  ContractRegion,
  KNOOPPUNT_END_HOUR,
  KNOOPPUNT_MINIMUM,
  KNOOPPUNT_START_HOUR,
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
  const to = Math.min(now, week.end - 1000);
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
    .map((value, index) => {
      const time = Date.parse(value);
      const wall = wallClock(time);
      return {
        index,
        time,
        weekday: (wall.getUTCDay() + 6) % 7,
        hour: wall.getUTCHours(),
        minute: wall.getUTCMinutes(),
      };
    })
    .filter((moment) => Number.isFinite(moment.time));
}

export function isKnooppuntHour(hour: number): boolean {
  return hour >= KNOOPPUNT_START_HOUR && hour < KNOOPPUNT_END_HOUR;
}

export interface ShareResult {
  met: number;
  measured: number;
  /** met / measured, or null without measurements */
  share: number | null;
}

const shareOf = (met: number, measured: number): ShareResult => ({
  met,
  measured,
  share: measured ? met / measured : null,
});

export interface KnooppuntResult {
  /** Per weekday (Monday first), the share of 06:00-24:00 snapshots with enough bikes */
  days: ShareResult[];
  week: ShareResult;
}

/** Eis 36: share of the 06:00-24:00 snapshots with at least two non-defect bikes. */
export function knooppuntResult(response: ZoneCountsResponse, id: string): KnooppuntResult {
  const counts = response.zones[id]?.operational || [];
  const met = Array(7).fill(0);
  const measured = Array(7).fill(0);
  momentsOf(response).forEach((moment) => {
    if (!isKnooppuntHour(moment.hour)) return;
    measured[moment.weekday] += 1;
    if ((counts[moment.index] ?? 0) >= KNOOPPUNT_MINIMUM) met[moment.weekday] += 1;
  });
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  return {
    days: met.map((value, day) => shareOf(value, measured[day])),
    week: shareOf(sum(met), sum(measured)),
  };
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

/** Each day's 06:00-24:00 window inside the week, for the chart's shading. */
export function knooppuntWindows(week: ContractWeek): { start: number; end: number }[] {
  const wallMonday = wallClock(week.start);
  const mondayWall = Date.UTC(wallMonday.getUTCFullYear(), wallMonday.getUTCMonth(), wallMonday.getUTCDate());
  return Array.from({ length: 7 }, (_, day) => ({
    start: fromWallClock(mondayWall + day * DAY_MS + KNOOPPUNT_START_HOUR * 60 * 60 * 1000),
    end: fromWallClock(mondayWall + day * DAY_MS + KNOOPPUNT_END_HOUR * 60 * 60 * 1000),
  }));
}

/** 12:00 on Monday to Friday, the moments Eis 39 is measured. */
export function noonMoments(week: ContractWeek): number[] {
  const wallMonday = wallClock(week.start);
  const mondayWall = Date.UTC(wallMonday.getUTCFullYear(), wallMonday.getUTCMonth(), wallMonday.getUTCDate());
  return Array.from({ length: 5 }, (_, day) =>
    fromWallClock(mondayWall + day * DAY_MS + BEDRIJVENTERREIN_HOUR * 60 * 60 * 1000));
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
