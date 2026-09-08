import type { CsvColumn } from '../../helpers/csv';
import type { VoiAvailabilityPoint } from '../../api/voiSnapshots';

/**
 * Pure data preparation for the area availability chart: percentages, time
 * formatting, request windows and the CSV export shape.
 */

export type PeriodPreset = '1d' | '7d' | '31d';

export interface VoiChartRow {
  /** Capture time as epoch milliseconds, so recharts can use a time scale. */
  time: number;
  total: number;
  operational: number;
  non_operational: number;
  unknown: number;
  /** Share of the total, one decimal. Null when the area held no vehicles. */
  operationalPct: number | null;
  nonOperationalPct: number | null;
  unknownPct: number | null;
}

export interface VoiCsvRow {
  tijdstip: string;
  totaal: number;
  operationeel: number;
  niet_operationeel: number;
  onbekend: number;
  operationeel_pct: number | null;
  niet_operationeel_pct: number | null;
}

export const PERIOD_DAYS: Record<PeriodPreset, number> = {
  '1d': 1,
  '7d': 7,
  '31d': 31,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function share(part: number, total: number): number | null {
  if (!total) return null;
  return Math.round((part / total) * 1000) / 10;
}

/** Converts the API series into chart rows, dropping unparseable timestamps. */
export function toChartRows(series: VoiAvailabilityPoint[]): VoiChartRow[] {
  if (!Array.isArray(series)) return [];

  return series
    .map((point) => {
      const time = Date.parse(point.captured_at);
      if (!Number.isFinite(time)) return null;

      const total = point.total || 0;
      const row: VoiChartRow = {
        time,
        total,
        operational: point.operational || 0,
        non_operational: point.non_operational || 0,
        unknown: point.unknown || 0,
        operationalPct: share(point.operational || 0, total),
        nonOperationalPct: share(point.non_operational || 0, total),
        unknownPct: share(point.unknown || 0, total),
      };
      return row;
    })
    .filter((row): row is VoiChartRow => row !== null)
    .sort((left, right) => left.time - right.time);
}

/**
 * True when any snapshot in the range predates status collection, which is when
 * the "status onbekend" series is worth showing.
 */
export function hasUnknownStatus(rows: VoiChartRow[]): boolean {
  return rows.some((row) => row.unknown > 0);
}

const timeFormatter = new Intl.DateTimeFormat('nl-NL', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
});

const dateTimeFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
});

const tooltipFormatter = new Intl.DateTimeFormat('nl-NL', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
});

const dateFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Amsterdam',
});

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  timeZone: 'Europe/Amsterdam',
});

const HOUR_MS = 60 * 60 * 1000;

/** Milliseconds to add to a UTC instant to get Amsterdam wall-clock time. */
export function amsterdamOffsetMs(epochMs: number): number {
  const parts: Record<string, number> = {};
  partsFormatter.formatToParts(new Date(epochMs)).forEach((part) => {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  });
  const wallClock = Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second
  );
  return wallClock - Math.floor(epochMs / 1000) * 1000;
}

/** Tick spacing that keeps roughly five to nine labels for the data span. */
export function tickStepFor(spanMs: number): number {
  if (spanMs <= 36 * HOUR_MS) return 3 * HOUR_MS;
  if (spanMs <= 4 * DAY_MS) return 12 * HOUR_MS;
  if (spanMs <= 10 * DAY_MS) return DAY_MS;
  if (spanMs <= 20 * DAY_MS) return 2 * DAY_MS;
  return 4 * DAY_MS;
}

/**
 * Axis ticks at round Amsterdam wall-clock times (whole hours, or midnight for
 * day steps) between the first and last row, plus the step used.
 */
export function chartTicks(rows: VoiChartRow[]): { ticks: number[]; stepMs: number } {
  if (rows.length === 0) return { ticks: [], stepMs: DAY_MS };
  const start = rows[0].time;
  const end = rows[rows.length - 1].time;
  const stepMs = tickStepFor(end - start);

  const alignUp = (epochMs: number) => {
    const offset = amsterdamOffsetMs(epochMs);
    return Math.ceil((epochMs + offset) / stepMs) * stepMs - offset;
  };

  const ticks: number[] = [];
  let tick = alignUp(start);
  while (tick <= end && ticks.length < 64) {
    ticks.push(tick);
    tick = alignUp(tick + 1);
  }
  return { ticks, stepMs };
}

/**
 * Axis label. Day steps show the date; shorter steps show the clock time, with
 * the date at midnight so a multi-day axis still reads.
 */
export function formatTickTime(epochMs: number, stepMs: number): string {
  if (!Number.isFinite(epochMs)) return '';
  const date = new Date(epochMs);
  if (stepMs >= DAY_MS) return dateFormatter.format(date);
  const isMidnight = (epochMs + amsterdamOffsetMs(epochMs)) % DAY_MS === 0;
  return isMidnight ? dateFormatter.format(date) : timeFormatter.format(date);
}

/** Date and time in one label, used where a tick needs full context. */
export function formatDateTime(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '';
  return dateTimeFormatter.format(new Date(epochMs));
}

export function formatTooltipTime(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '';
  return tooltipFormatter.format(new Date(epochMs));
}

/** Request window for a preset, ending now. The API allows at most 31 days. */
export function windowFor(preset: PeriodPreset, now: Date): { from: string; to: string } {
  const days = PERIOD_DAYS[preset] ?? PERIOD_DAYS['7d'];
  const to = now.getTime();
  return {
    from: new Date(to - days * DAY_MS).toISOString(),
    to: new Date(to).toISOString(),
  };
}

export function toCsvRows(rows: VoiChartRow[]): VoiCsvRow[] {
  return rows.map((row) => ({
    tijdstip: new Date(row.time).toISOString(),
    totaal: row.total,
    operationeel: row.operational,
    niet_operationeel: row.non_operational,
    onbekend: row.unknown,
    operationeel_pct: row.operationalPct,
    niet_operationeel_pct: row.nonOperationalPct,
  }));
}

export const csvColumns: CsvColumn<VoiCsvRow>[] = [
  { header: 'tijdstip', value: (row) => row.tijdstip },
  { header: 'totaal', value: (row) => row.totaal },
  { header: 'operationeel', value: (row) => row.operationeel },
  { header: 'niet_operationeel', value: (row) => row.niet_operationeel },
  { header: 'onbekend', value: (row) => row.onbekend },
  { header: 'operationeel_pct', value: (row) => row.operationeel_pct, precision: 1 },
  { header: 'niet_operationeel_pct', value: (row) => row.niet_operationeel_pct, precision: 1 },
];

/** Formats a percentage the Dutch way, for example "40,4%". */
export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('nl-NL');
}
