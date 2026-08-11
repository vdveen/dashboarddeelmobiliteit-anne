/**
 * Helpers for the 5-minute availability KPI on /stats/beleidszones.
 *
 * Fetches the raw 5-minute availability series for a single zone in
 * sequential week-sized chunks (one zone per request, so the known
 * multi-zone overload of stats_v2 is never triggered), fills intervals
 * that the API omits with 0, and computes the share of intervals within
 * a daily time window in which at least `threshold` vehicles were
 * available.
 *
 * @see https://docs.dashboarddeelmobiliteit.nl/api_docs/zone_statistics/
 */

import moment from 'moment';
import { getBeleidszonesAvailabilityStats } from '../../api/beleidszones';

/** One point of the zero-filled series. `time` is 'YYYY-MM-DDTHH:mm' (local). */
export interface FiveMinutePoint {
  time: string;
  count: number;
}

export interface AvailabilityKpiOptions {
  /** First hour of the daily window (inclusive), e.g. 8 for 08:00. */
  windowStartHour: number;
  /** End hour of the daily window (exclusive), e.g. 20 for 20:00. */
  windowEndHour: number;
  /** Minimum number of available vehicles for an interval to count. */
  threshold: number;
}

export interface DayKpi {
  /** 'YYYY-MM-DD' */
  date: string;
  /** Share (0-100) of window intervals with count >= threshold. */
  pct: number;
  intervalsInWindow: number;
}

/** Days fetched per request. */
const CHUNK_DAYS = 7;

/** Maximum period (days) for which the 5-minute series may be fetched.
 * Longer selections are clamped to the most recent MAX_5M_PERIOD_DAYS days. */
export const MAX_5M_PERIOD_DAYS = 90;

const sumOperatorCounts = (item: Record<string, unknown>): number => {
  let sum = 0;
  Object.keys(item).forEach((key) => {
    if (key === 'time' || key === 'start_interval') return;
    const val = item[key];
    if (typeof val === 'number') sum += val;
    else if (typeof val === 'string' && !isNaN(Number(val))) sum += Number(val);
  });
  return sum;
};

/**
 * Fetches the 5-minute availability series for one zone, zero-filled.
 *
 * Requests are made sequentially per CHUNK_DAYS window to keep individual
 * responses small. Intervals missing from the API response are set to 0.
 * Intervals in the future (or after `now`) are not generated at all.
 *
 * @param onProgress Called after each chunk with (chunksDone, chunksTotal).
 */
export const fetch5mAvailabilitySeries = async (
  token: string | null,
  zoneId: number,
  startDate: string,
  endDate: string,
  operators?: string[],
  onProgress?: (done: number, total: number) => void
): Promise<FiveMinutePoint[]> => {
  const start = moment(startDate).startOf('day');
  // endDate is inclusive; never fetch beyond now
  const end = moment.min(
    moment(endDate).startOf('day').add(1, 'day'),
    moment()
  );
  if (!start.isValid() || !end.isValid() || !start.isBefore(end)) return [];

  const chunks: Array<{ from: moment.Moment; to: moment.Moment }> = [];
  for (let c = start.clone(); c.isBefore(end); c.add(CHUNK_DAYS, 'days')) {
    chunks.push({
      from: c.clone(),
      to: moment.min(c.clone().add(CHUNK_DAYS, 'days'), end.clone()),
    });
  }

  const countByTime = new Map<string, number>();
  let done = 0;
  for (const chunk of chunks) {
    const result = await getBeleidszonesAvailabilityStats(token, {
      zoneIds: [zoneId],
      startTime: chunk.from.format('YYYY-MM-DDTHH:mm:ss'),
      endTime: chunk.to.format('YYYY-MM-DDTHH:mm:ss'),
      aggregationLevel: '5m',
      // At 5m level each bucket holds a single sample, so MAX == the raw value
      aggregationFunction: 'MAX',
      operators,
    });
    const values = result?.availability_stats?.values || [];
    const timeKey = values[0]?.time !== undefined ? 'time' : 'start_interval';
    values.forEach((item) => {
      const t = item[timeKey];
      if (!t) return;
      const key = moment(String(t)).format('YYYY-MM-DDTHH:mm');
      countByTime.set(key, (countByTime.get(key) || 0) + sumOperatorCounts(item));
    });
    done++;
    onProgress?.(done, chunks.length);
  }

  // Build the zero-filled 5-minute grid
  const series: FiveMinutePoint[] = [];
  for (let t = start.clone(); t.isBefore(end); t.add(5, 'minutes')) {
    const key = t.format('YYYY-MM-DDTHH:mm');
    series.push({ time: key, count: countByTime.get(key) ?? 0 });
  }
  return series;
};

/**
 * Computes the availability KPI per day plus the overall share:
 * the percentage of 5-minute intervals within the daily window
 * [windowStartHour, windowEndHour) in which count >= threshold.
 */
export const computeAvailabilityKpi = (
  series: FiveMinutePoint[],
  options: AvailabilityKpiOptions
): { perDay: DayKpi[]; overallPct: number | null } => {
  const { windowStartHour, windowEndHour, threshold } = options;

  const perDayMap = new Map<string, { inWindow: number; above: number }>();
  series.forEach((point) => {
    const hour = parseInt(point.time.substring(11, 13), 10);
    if (hour < windowStartHour || hour >= windowEndHour) return;
    const date = point.time.substring(0, 10);
    const entry = perDayMap.get(date) || { inWindow: 0, above: 0 };
    entry.inWindow++;
    if (point.count >= threshold) entry.above++;
    perDayMap.set(date, entry);
  });

  const perDay: DayKpi[] = Array.from(perDayMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, entry]) => ({
      date,
      pct: entry.inWindow > 0 ? Math.round((entry.above / entry.inWindow) * 1000) / 10 : 0,
      intervalsInWindow: entry.inWindow,
    }));

  const totals = Array.from(perDayMap.values()).reduce(
    (acc, entry) => ({
      inWindow: acc.inWindow + entry.inWindow,
      above: acc.above + entry.above,
    }),
    { inWindow: 0, above: 0 }
  );
  const overallPct =
    totals.inWindow > 0
      ? Math.round((totals.above / totals.inWindow) * 1000) / 10
      : null;

  return { perDay, overallPct };
};

/** Builds a CSV (time;count per row) of the raw zero-filled 5-minute series. */
export const build5mSeriesCsv = (series: FiveMinutePoint[]): string => {
  const rows = ['tijd;beschikbare_voertuigen'];
  series.forEach((point) => {
    rows.push(`${point.time};${point.count}`);
  });
  return rows.join('\n');
};
