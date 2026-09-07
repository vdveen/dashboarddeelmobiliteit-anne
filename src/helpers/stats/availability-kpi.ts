import moment from 'moment-timezone';
import { getBeleidszonesAvailabilityStats } from '../../api/beleidszones';
import { REPORTING_TIMEZONE } from './time';

/** UTC bucket start. Null counts mean that the API returned no observation. */
export interface FiveMinutePoint {
  time: string;
  counts: Record<string, number | null> | null;
}

export interface AvailabilityKpiOptions {
  windowStartHour: number;
  windowEndHour: number;
  threshold: number;
  excludedOperators?: string[];
  operators?: string[];
}

export interface DayKpi {
  date: string;
  pct: number | null;
  intervalsInWindow: number;
  observedIntervals: number;
  avgPerOperator: Record<string, number | null>;
}

export interface AvailabilityKpiResult {
  perDay: DayKpi[];
  overallPct: number | null;
  coveragePct: number;
  observedIntervals: number;
  expectedIntervals: number;
  operators: string[];
}

const CHUNK_DAYS = 7;
const INTERVAL_MS = 5 * 60 * 1000;
export const MAX_5M_PERIOD_DAYS = 90;

export function availabilityPeriod(startDate: string, endDate: string) {
  const requestedStart = moment.tz(startDate, 'YYYY-MM-DD', true, REPORTING_TIMEZONE);
  const end = moment.tz(endDate, 'YYYY-MM-DD', true, REPORTING_TIMEZONE).add(1, 'day');
  if (!requestedStart.isValid() || !end.isValid() || !requestedStart.isBefore(end)) {
    throw new Error('Selecteer een geldige begin- en einddatum.');
  }
  const start = moment.max(requestedStart, end.clone().subtract(MAX_5M_PERIOD_DAYS, 'days'));
  return { start, end, clamped: start.isAfter(requestedStart) };
}

function parseCounts(item: Record<string, unknown>): Record<string, number | null> {
  return Object.fromEntries(Object.entries(item)
    .filter(([key]) => key !== 'time' && key !== 'start_interval')
    .map(([key, value]) => {
      if (value === null) return [key, null];
      const count = typeof value === 'number' ? value
        : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
      if (!Number.isFinite(count) || count < 0) {
        throw new Error('De beschikbaarheidsdata bevat een ongeldige meetwaarde.');
      }
      return [key, count];
    }));
}

/** Fetch complete five-minute buckets, keeping missing observations unknown. */
export const fetch5mAvailabilitySeries = async (
  token: string | null,
  zoneId: number,
  startDate: string,
  endDate: string,
  operators?: string[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<FiveMinutePoint[]> => {
  const period = availabilityPeriod(startDate, endDate);
  const end = Math.min(period.end.valueOf(), Math.floor(Date.now() / INTERVAL_MS) * INTERVAL_MS);
  if (period.start.valueOf() >= end) return [];
  const chunks: Array<{ from: number; to: number }> = [];
  for (let cursor = period.start.clone(); cursor.valueOf() < end; cursor.add(CHUNK_DAYS, 'days')) {
    chunks.push({ from: cursor.valueOf(), to: Math.min(cursor.clone().add(CHUNK_DAYS, 'days').valueOf(), end) });
  }

  const countsByTime = new Map<number, Record<string, number | null>>();
  for (const [index, chunk] of Array.from(chunks.entries())) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const result = await getBeleidszonesAvailabilityStats(token, {
      zoneIds: [zoneId],
      startTime: new Date(chunk.from).toISOString(),
      endTime: new Date(chunk.to).toISOString(),
      aggregationLevel: '5m',
      aggregationFunction: 'MAX',
      operators,
      signal,
    });
    const values = result?.availability_stats?.values;
    if (!Array.isArray(values)) {
      throw new Error('Een deel van de beschikbaarheidsdata kon niet worden geladen. Probeer opnieuw.');
    }
    for (const item of values) {
      if (!item || typeof item !== 'object') throw new Error('Ongeldige beschikbaarheidsdata.');
      const time = item.time ?? item.start_interval;
      // The documented response uses explicit UTC timestamps. Do not guess an
      // offset for an ambiguous local time during the autumn clock change.
      if (typeof time !== 'string' || !/(Z|[+-]\d{2}:?\d{2})$/i.test(time)) {
        throw new Error('De meting heeft geen geldig tijdstip met tijdzone.');
      }
      const parsed = moment.parseZone(time, moment.ISO_8601, true);
      const timestamp = parsed.valueOf();
      if (!parsed.isValid() || timestamp % INTERVAL_MS !== 0) throw new Error('Ongeldig vijf-minutentijdstip.');
      // Some endpoints include the end boundary. It belongs to the next chunk.
      if (timestamp < chunk.from || timestamp >= chunk.to) continue;
      const counts = parseCounts(item);
      const previous = countsByTime.get(timestamp);
      if (previous && (Object.keys(previous).length !== Object.keys(counts).length
        || Object.keys(previous).some(key => previous[key] !== counts[key]))) {
        throw new Error('De data bevat tegenstrijdige metingen voor hetzelfde tijdstip.');
      }
      countsByTime.set(timestamp, counts);
    }
    onProgress?.(index + 1, chunks.length);
  }
  const series: FiveMinutePoint[] = [];
  for (let time = period.start.valueOf(); time < end; time += INTERVAL_MS) {
    series.push({ time: new Date(time).toISOString(), counts: countsByTime.get(time) ?? null });
  }
  return series;
};

/** Providers present in the response, including providers with null values. */
export const getOperatorsInSeries = (series: FiveMinutePoint[], excludedOperators: string[] = [], expectedOperators: string[] = []): string[] => {
  const seen = new Set<string>(expectedOperators);
  series.forEach(point => Object.keys(point.counts ?? {}).forEach(operator => seen.add(operator)));
  return Array.from(seen).filter(operator => !excludedOperators.includes(operator)).sort();
};

const percentage = (count: number, total: number) => total > 0 ? Math.round(count / total * 1000) / 10 : null;

/** Only intervals with a value for every included provider enter the KPI. */
export const computeAvailabilityKpi = (series: FiveMinutePoint[], options: AvailabilityKpiOptions): AvailabilityKpiResult => {
  const { windowStartHour, windowEndHour, threshold } = options;
  const operators = getOperatorsInSeries(series, options.excludedOperators, options.operators);
  const days = new Map<string, { expected: number; observed: number; above: number; sums: Record<string, number> }>();
  for (const point of series) {
    const local = moment.utc(point.time).tz(REPORTING_TIMEZONE);
    if (local.hour() < windowStartHour || local.hour() >= windowEndHour) continue;
    const date = local.format('YYYY-MM-DD');
    const day = days.get(date) ?? { expected: 0, observed: 0, above: 0, sums: Object.create(null) };
    day.expected++;
    const complete = operators.length > 0 && operators.every(operator => typeof point.counts?.[operator] === 'number');
    if (complete) {
      day.observed++;
      let total = 0;
      for (const operator of operators) {
        const count = point.counts[operator] as number;
        total += count;
        day.sums[operator] = (day.sums[operator] ?? 0) + count;
      }
      if (total >= threshold) day.above++;
    }
    days.set(date, day);
  }
  const perDay = Array.from(days, ([date, day]) => ({
    date,
    pct: percentage(day.above, day.observed),
    intervalsInWindow: day.expected,
    observedIntervals: day.observed,
    avgPerOperator: Object.fromEntries(operators.map(operator => [operator,
      day.observed ? Math.round(day.sums[operator] / day.observed * 10) / 10 : null])),
  }));
  const totals = Array.from(days.values()).reduce((sum, day) => ({
    expected: sum.expected + day.expected, observed: sum.observed + day.observed, above: sum.above + day.above,
  }), { expected: 0, observed: 0, above: 0 });
  return { perDay, operators, overallPct: percentage(totals.above, totals.observed),
    coveragePct: percentage(totals.observed, totals.expected) ?? 0,
    observedIntervals: totals.observed, expectedIntervals: totals.expected };
};

/** UTC instants remain distinct at DST changes. Empty CSV cells mean unknown. */
export const build5mSeriesCsv = (series: FiveMinutePoint[], operators: string[]): string => {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [['tijd_utc', ...operators, 'totaal'].map(cell).join(';')];
  for (const point of series) {
    const counts = operators.map(operator => point.counts?.[operator]);
    const complete = operators.length > 0 && counts.every(count => typeof count === 'number');
    rows.push([point.time, ...counts.map(count => count == null ? '' : String(count)),
      complete ? String(counts.reduce<number>((sum, count) => sum + (count ?? 0), 0)) : ''].map(cell).join(';'));
  }
  return rows.join('\r\n');
};
