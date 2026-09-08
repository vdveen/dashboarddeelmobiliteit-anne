import { toCsv } from '../../helpers/csv';

import {
  csvColumns,
  chartTicks,
  formatCount,
  formatDateTime,
  formatPercentage,
  formatTickTime,
  formatTooltipTime,
  hasUnknownStatus,
  toChartRows,
  tickStepFor,
  toCsvRows,
  windowFor,
} from './voiAvailabilityChart';

const point = (
  captured_at: string,
  total: number,
  operational: number,
  non_operational: number,
  unknown = 0
) => ({ captured_at, total, operational, non_operational, unknown });

describe('toChartRows', () => {
  it('turns counts into percentages of the total', () => {
    const rows = toChartRows([point('2026-09-08T11:00:00Z', 1006, 406, 500, 100)]);

    expect(rows).toEqual([{
      time: Date.parse('2026-09-08T11:00:00Z'),
      total: 1006,
      operational: 406,
      non_operational: 500,
      unknown: 100,
      operationalPct: 40.4,
      nonOperationalPct: 49.7,
      unknownPct: 9.9,
    }]);
  });

  it('leaves the percentages null for an empty snapshot so the line breaks', () => {
    const [row] = toChartRows([point('2026-09-08T11:00:00Z', 0, 0, 0)]);

    expect(row.total).toBe(0);
    expect(row.operationalPct).toBeNull();
    expect(row.nonOperationalPct).toBeNull();
    expect(row.unknownPct).toBeNull();
  });

  it('sorts by time and drops unparseable timestamps', () => {
    const rows = toChartRows([
      point('2026-09-08T12:00:00Z', 2, 2, 0),
      point('kapot', 2, 2, 0),
      point('2026-09-08T11:00:00Z', 2, 1, 1),
    ]);

    expect(rows.map((row) => row.time)).toEqual([
      Date.parse('2026-09-08T11:00:00Z'),
      Date.parse('2026-09-08T12:00:00Z'),
    ]);
  });
});

describe('hasUnknownStatus', () => {
  it('is true only when a snapshot reported vehicles without a status', () => {
    expect(hasUnknownStatus(toChartRows([point('2026-09-08T11:00:00Z', 3, 2, 1)]))).toBe(false);
    expect(hasUnknownStatus(toChartRows([point('2026-09-08T11:00:00Z', 3, 2, 0, 1)]))).toBe(true);
  });
});

describe('time formatting', () => {
  const moment = Date.parse('2026-09-08T11:00:00Z');

  it('shows the clock time for hour steps and the date at midnight', () => {
    expect(formatTickTime(moment, 3 * 60 * 60 * 1000)).toBe('13:00');
    expect(formatTickTime(Date.parse('2026-09-07T22:00:00Z'), 3 * 60 * 60 * 1000)).toBe('8 sep');
  });

  it('shows only the date for day steps', () => {
    expect(formatTickTime(moment, 24 * 60 * 60 * 1000)).toBe('8 sep');
    expect(formatDateTime(moment)).toContain('13:00');
  });

  it('spells out the day in the tooltip', () => {
    expect(formatTooltipTime(moment)).toContain('dinsdag');
    expect(formatTooltipTime(moment)).toContain('2026');
    expect(formatTooltipTime(moment)).toContain('13:00');
  });

  it('returns an empty string for a missing time', () => {
    expect(formatTickTime(Number.NaN, 7)).toBe('');
    expect(formatTooltipTime(Number.NaN)).toBe('');
  });
});

describe('chartTicks', () => {
  const HOUR = 60 * 60 * 1000;
  const rowsBetween = (from: string, to: string) => toChartRows([
    point(from, 1, 1, 0),
    point(to, 1, 1, 0),
  ]);

  it('picks a coarser step for a longer span', () => {
    expect(tickStepFor(20 * HOUR)).toBe(3 * HOUR);
    expect(tickStepFor(3 * 24 * HOUR)).toBe(12 * HOUR);
    expect(tickStepFor(7 * 24 * HOUR)).toBe(24 * HOUR);
    expect(tickStepFor(31 * 24 * HOUR)).toBe(4 * 24 * HOUR);
  });

  it('aligns hour ticks to whole Amsterdam hours inside the data span', () => {
    const { ticks, stepMs } = chartTicks(rowsBetween('2026-09-07T19:00:00Z', '2026-09-08T17:50:00Z'));

    expect(stepMs).toBe(3 * HOUR);
    // 21:00 Amsterdam summer time is 19:00Z, so the first tick is the first row.
    expect(ticks[0]).toBe(Date.parse('2026-09-07T19:00:00Z'));
    expect(ticks[1]).toBe(Date.parse('2026-09-07T22:00:00Z'));
    expect(ticks[ticks.length - 1]).toBe(Date.parse('2026-09-08T16:00:00Z'));
  });

  it('puts day ticks at Amsterdam midnight', () => {
    const { ticks, stepMs } = chartTicks(rowsBetween('2026-09-01T10:00:00Z', '2026-09-08T10:00:00Z'));

    expect(stepMs).toBe(24 * HOUR);
    expect(ticks[0]).toBe(Date.parse('2026-09-01T22:00:00Z'));
    expect(ticks).toHaveLength(7);
  });

  it('returns no ticks without rows', () => {
    expect(chartTicks([]).ticks).toEqual([]);
  });
});

describe('windowFor', () => {
  it('ends now and starts the preset number of days earlier', () => {
    const now = new Date('2026-09-08T12:00:00Z');

    expect(windowFor('1d', now)).toEqual({
      from: '2026-09-07T12:00:00.000Z',
      to: '2026-09-08T12:00:00.000Z',
    });
    expect(windowFor('7d', now).from).toBe('2026-09-01T12:00:00.000Z');
    expect(windowFor('31d', now).from).toBe('2026-08-08T12:00:00.000Z');
  });
});

describe('toCsvRows', () => {
  it('names the columns in Dutch and keeps an empty snapshot without percentages', () => {
    const rows = toChartRows([
      point('2026-09-08T11:00:00Z', 1006, 406, 500, 100),
      point('2026-09-08T11:10:00Z', 0, 0, 0),
    ]);

    expect(toCsvRows(rows)).toEqual([
      {
        tijdstip: '2026-09-08T11:00:00.000Z',
        totaal: 1006,
        operationeel: 406,
        niet_operationeel: 500,
        onbekend: 100,
        operationeel_pct: 40.4,
        niet_operationeel_pct: 49.7,
      },
      {
        tijdstip: '2026-09-08T11:10:00.000Z',
        totaal: 0,
        operationeel: 0,
        niet_operationeel: 0,
        onbekend: 0,
        operationeel_pct: null,
        niet_operationeel_pct: null,
      },
    ]);
  });

  it('writes a CSV with a header row and Dutch decimals', () => {
    const rows = toChartRows([point('2026-09-08T11:00:00Z', 1006, 406, 500, 100)]);

    const csv = toCsv(toCsvRows(rows), csvColumns).split('\r\n');

    expect(csv[0]).toContain('"operationeel_pct"');
    expect(csv[1]).toContain('"40,4"');
  });
});

describe('value formatting', () => {
  it('uses Dutch separators', () => {
    expect(formatCount(1006)).toBe('1.006');
    expect(formatPercentage(40.4)).toBe('40,4%');
  });

  it('shows a dash when there is no percentage', () => {
    expect(formatPercentage(null)).toBe('-');
  });
});
