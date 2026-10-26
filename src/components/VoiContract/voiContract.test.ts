import { BEDRIJVENTERREINEN, KNOOPPUNTEN, Knooppunt } from '../../config/voiContractZones';
import {
  ZoneCountsResponse,
  chartRows,
  formatShare,
  isoWeekNumber,
  knooppuntPolygon,
  knooppuntMetOf,
  knooppuntResult,
  knooppuntWindows,
  mergeResponses,
  monthOf,
  noonMoments,
  requestWindow,
  shiftMonth,
  shiftWeek,
  sumShares,
  terreinResult,
  thresholdOffset,
  weekOf,
  weekParts,
  weeklyAverage,
} from './voiContract';

const metres = ([lon, lat]: number[], [lon0, lat0]: number[]) => Math.hypot(
  (lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180),
  (lat - lat0) * 110540
);

describe('knooppuntPolygon', () => {
  const lone: Knooppunt = { id: 'a', name: 'A', region: 'amersfoort', point: [5.4, 52.2] };

  it('is a closed 300 m circle without neighbours', () => {
    const ring = knooppuntPolygon(lone, [lone], 300).coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    ring.forEach((position) => expect(metres(position, lone.point)).toBeCloseTo(300, 0));
  });

  it('gives each side of a station only the bikes closer to it', () => {
    const centrum = KNOOPPUNTEN.find((k) => k.id === 'amersfoort-centraal-centrum')!;
    const mondriaan = KNOOPPUNTEN.find((k) => k.id === 'amersfoort-centraal-mondriaanplein')!;
    const ring = knooppuntPolygon(centrum, KNOOPPUNTEN, 300).coordinates[0];
    ring.forEach((position) => {
      expect(metres(position, centrum.point)).toBeLessThanOrEqual(metres(position, mondriaan.point) + 0.05);
      expect(metres(position, centrum.point)).toBeLessThanOrEqual(300.5);
    });
  });

  it('builds a valid polygon for every configured knooppunt', () => {
    KNOOPPUNTEN.forEach((knooppunt) => {
      const ring = knooppuntPolygon(knooppunt, KNOOPPUNTEN, 300).coordinates[0];
      expect(ring.length).toBeGreaterThanOrEqual(4);
    });
  });
});

describe('weeks', () => {
  it('starts on Monday 00:00 Amsterdam time', () => {
    // Wednesday 22 October 2026, summer time (UTC+2)
    const week = weekOf(Date.parse('2026-10-22T10:00:00Z'));
    expect(new Date(week.start).toISOString()).toBe('2026-10-18T22:00:00.000Z');
    // Summer time ends on 25 October, so the next Monday is UTC+1
    expect(new Date(week.end).toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(isoWeekNumber(week)).toBe(43);
  });

  it('treats Sunday as the end of the week', () => {
    const week = weekOf(Date.parse('2026-10-25T21:00:00Z'));
    expect(new Date(week.start).toISOString()).toBe('2026-10-18T22:00:00.000Z');
  });

  it('shifts across a change of summer time', () => {
    const next = shiftWeek(weekOf(Date.parse('2026-10-22T10:00:00Z')), 1);
    expect(new Date(next.start).toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(isoWeekNumber(next)).toBe(44);
  });

  it('asks up to now in the current week', () => {
    const week = weekOf(Date.parse('2026-10-27T10:00:00Z'));
    expect(requestWindow(week, Date.parse('2026-10-27T10:00:00Z')).to).toBe('2026-10-27T10:00:00.000Z');
    expect(requestWindow(week, Date.parse('2026-12-01T00:00:00Z')).to).toBe('2026-11-01T22:59:59.999Z');
  });

  it('marks 06:00-24:00 and weekday noon in local time', () => {
    const week = weekOf(Date.parse('2026-10-27T10:00:00Z'));
    expect(new Date(knooppuntWindows(week)[0].start).toISOString()).toBe('2026-10-26T05:00:00.000Z');
    expect(new Date(knooppuntWindows(week)[0].end).toISOString()).toBe('2026-10-26T23:00:00.000Z');
    expect(noonMoments(week).map((moment) => new Date(moment).toISOString().slice(11, 16)))
      .toEqual(['11:00', '11:00', '11:00', '11:00', '11:00']);
  });
});

// Monday 26 October 2026 (UTC+1): 05:50, 06:00, 06:10 and 11:00 (12:00 local)
const response: ZoneCountsResponse = {
  from: '2026-10-26T04:50:00Z',
  to: '2026-10-26T11:00:00Z',
  captured_at: ['2026-10-26T04:50:00Z', '2026-10-26T05:00:00Z', '2026-10-26T05:10:00Z', '2026-10-26T11:00:00Z'],
  zones: {
    baarn: { operational: [0, 2, 1, 3] },
    soest: { operational: [5, 5, 5, 5] },
    isselt: { operational: [0, 0, 0, 16], occupied_hubs: [0, 0, 0, 2] },
    'de-hoef': { operational: [0, 0, 0, 10], occupied_hubs: [0, 0, 0, 3] },
  },
};

describe('requirements', () => {
  it('counts elapsed minutes in 06:00-24:00 and leaves gaps unknown', () => {
    const range = { start: Date.parse(response.from), end: Date.parse(response.to) };
    const result = knooppuntResult(response, 'baarn', range);
    // 06:00-06:10 met; 06:10-06:20 failed; 06:20-12:00 unknown.
    // The snapshot exactly at the exclusive end represents no elapsed time.
    expect(result.days[0]).toEqual({
      metMinutes: 10, measuredMinutes: 20, totalMinutes: 360, unknownMinutes: 340,
      share: 10 / 360, upperShare: 350 / 360,
    });
    expect(result.days[1].share).toBeNull();
    expect(result.week).toEqual(result.days[0]);
  });

  it('checks bikes and dropzones at noon on weekdays', () => {
    const isselt = BEDRIJVENTERREINEN.find((t) => t.id === 'isselt')!;
    const hoef = BEDRIJVENTERREINEN.find((t) => t.id === 'de-hoef')!;
    expect(terreinResult(response, isselt)[0]).toEqual({ operational: 16, occupiedHubs: 2, met: false });
    expect(terreinResult(response, hoef)[0]).toEqual({ operational: 10, occupiedHubs: 3, met: true });
    expect(terreinResult(response, hoef)[1]).toEqual({ operational: null, occupiedHubs: null, met: null });
  });

  it('checks only the bike count without hub positions', () => {
    const hoef = BEDRIJVENTERREINEN.find((t) => t.id === 'de-hoef')!;
    const withoutHubs = { ...response, zones: { 'de-hoef': { operational: [0, 0, 0, 10] } } };
    expect(terreinResult(withoutHubs, hoef)[0]).toEqual({ operational: 10, occupiedHubs: null, met: true });
  });

  it('averages the summed zones over all snapshots', () => {
    expect(weeklyAverage(response, ['baarn', 'soest'])).toBe((5 + 7 + 6 + 8) / 4);
  });
});

describe('chart', () => {
  it('fills missing boundaries with gaps', () => {
    const rows = chartRows(response, 'baarn');
    expect(rows).toHaveLength(38);
    expect(rows.filter((row) => !row.missing).map((row) => row.count)).toEqual([0, 2, 1, 3]);
  });

  it('places the colour change halfway below the minimum', () => {
    const rows = [0, 4].map((count, index) => ({ time: index, count, occupiedHubs: null }));
    expect(thresholdOffset(rows, 2)).toBeCloseTo(2.5 / 4);
    expect(thresholdOffset(rows.slice(0, 1), 2)).toBeNull();
  });
});

describe('months', () => {
  const october = monthOf(Date.parse('2026-10-15T12:00:00Z'));

  it('runs from the first to the first of the next month, Amsterdam time', () => {
    expect(new Date(october.start).toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(new Date(october.end).toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(new Date(shiftMonth(october, 1).start).toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(new Date(shiftMonth(october, -10).start).toISOString()).toBe('2025-11-30T23:00:00.000Z');
  });

  it('splits into calendar weeks cut to the month and to now', () => {
    const parts = weekParts(october, Date.parse('2027-01-01T00:00:00Z'));
    expect(parts.map((part) => new Date(part.start).toISOString().slice(0, 13))).toEqual([
      '2026-09-30T22', '2026-10-04T22', '2026-10-11T22', '2026-10-18T22', '2026-10-25T23',
    ]);
    expect(parts[parts.length - 1].end).toBe(october.end);
    expect(weekParts(october, Date.parse('2026-10-14T12:00:00Z'))).toHaveLength(3);
    expect(weekParts(october, Date.parse('2026-10-14T12:00:00Z'))[2].end)
      .toBe(Date.parse('2026-10-14T12:00:00Z'));
  });

  it('marks every day and every weekday noon of the month', () => {
    expect(knooppuntWindows(october)).toHaveLength(31);
    expect(noonMoments(october)).toHaveLength(22);
  });

  it('merges consecutive responses', () => {
    const merged = mergeResponses([
      { from: 'a', to: 'b', captured_at: ['t0'], zones: { x: { operational: [1], occupied_hubs: [0] }, y: { operational: [2] } } },
      { from: 'b', to: 'c', captured_at: ['t1', 't2'], zones: { x: { operational: [3, 4], occupied_hubs: [1, 1] }, y: { operational: [5, 6] } } },
    ]);
    expect(merged).toEqual({
      from: 'a', to: 'c', captured_at: ['t0', 't1', 't2'],
      zones: { x: { operational: [1, 3, 4], occupied_hubs: [0, 1, 1] }, y: { operational: [2, 5, 6] } },
    });
  });
});

describe('Eis 36 minute denominator and threshold', () => {
  const minute = 60 * 1000;
  const start = Date.parse('2026-10-26T05:00:00Z'); // 06:00 Amsterdam
  const range = (minutes: number) => ({ start, end: start + minutes * minute });
  const readings = (times: number[], counts: number[]): ZoneCountsResponse => ({
    from: new Date(times[0] ?? start).toISOString(),
    to: new Date(times[times.length - 1] ?? start).toISOString(),
    captured_at: times.map((time) => new Date(time).toISOString()),
    zones: { x: { operational: counts } },
  });
  const regular = (minutes: number, metSlots: number) => {
    const times = Array.from({ length: Math.ceil(minutes / 10) }, (_, i) => start + i * 10 * minute);
    return readings(times, times.map((_, i) => i < metSlots ? 2 : 1));
  };

  it('uses 1080 minutes for a full day and keeps 79.63% below the displayed 80% threshold', () => {
    const result = knooppuntResult(regular(1080, 86), 'x', range(1080)).week;
    expect(result).toMatchObject({ metMinutes: 860, measuredMinutes: 1080, totalMinutes: 1080, unknownMinutes: 0 });
    expect(result.share).toBeCloseTo(860 / 1080);
    expect(formatShare(result)).toBe('79,6%');
    expect(knooppuntMetOf(result)).toBe(false);
  });

  it('passes exactly at 80%, using the unrounded share', () => {
    const result = knooppuntResult(regular(50, 4), 'x', range(50)).week;
    expect(result.share).toBe(0.8);
    expect(formatShare(result)).toBe('80%');
    expect(knooppuntMetOf(result)).toBe(true);
  });

  it('caps the last interval at now and excludes future minutes', () => {
    const result = knooppuntResult(regular(15, 1), 'x', range(15)).week;
    expect(result).toMatchObject({ metMinutes: 10, measuredMinutes: 15, totalMinutes: 15, unknownMinutes: 0 });
    expect(result.share).toBe(2 / 3);
  });

  it('does not carry a passing reading across a missing interval', () => {
    const result = knooppuntResult(readings([start, start + 20 * minute], [2, 0]), 'x', range(30)).week;
    expect(result).toMatchObject({ metMinutes: 10, measuredMinutes: 20, totalMinutes: 30, unknownMinutes: 10 });
    expect(formatShare(result)).toBe('33,3–66,7%');
    expect(knooppuntMetOf(result)).toBe(false);
  });

  it('shows an uncertain verdict when missing minutes could change compliance', () => {
    const result = knooppuntResult(readings([start], [2]), 'x', range(20)).week;
    expect(formatShare(result)).toBe('50–100%');
    expect(knooppuntMetOf(result)).toBeNull();
  });

  it('can establish a pass despite a gap when the known passing minutes already reach 80%', () => {
    const result = knooppuntResult(regular(40, 4), 'x', range(50)).week;
    expect(formatShare(result)).toBe('80–100%');
    expect(knooppuntMetOf(result)).toBe(true);
  });

  it('keeps empty days in the denominator without treating them as failures', () => {
    const result = knooppuntResult(readings([], []), 'x', range(1080)).week;
    expect(result).toMatchObject({ totalMinutes: 1080, measuredMinutes: 0, unknownMinutes: 1080 });
    expect(result.share).toBe(0);
    expect(result.upperShare).toBe(1);
    expect(knooppuntMetOf(result)).toBeNull();
    expect(formatShare(result)).toBe('0–100%');
  });

  it('treats absent or invalid zone counts as unknown; zero is a measured failure', () => {
    const data = readings([start, start + 10 * minute, start + 20 * minute], [2, NaN, 0]);
    expect(knooppuntResult(data, 'x', range(30)).week).toMatchObject({ metMinutes: 10, measuredMinutes: 20, unknownMinutes: 10 });
    expect(knooppuntResult(data, 'missing', range(30)).week).toMatchObject({ measuredMinutes: 0, unknownMinutes: 30 });
  });

  it('sorts timestamps with their counts and never double-counts duplicate readings', () => {
    const data = readings([start + 10 * minute, start, start], [0, 2, 2]);
    data.captured_at.push('invalid');
    expect(knooppuntResult(data, 'x', range(20)).week).toMatchObject({ metMinutes: 10, measuredMinutes: 20, totalMinutes: 20 });
  });

  it('clips intervals at 06:00 and midnight without counting the night', () => {
    const data = readings([start - 5 * minute, start + 1075 * minute, start + 1080 * minute], [2, 2, 2]);
    const result = knooppuntResult(data, 'x', { start: start - 60 * minute, end: start + 1140 * minute }).week;
    expect(result).toMatchObject({ metMinutes: 10, measuredMinutes: 10, totalMinutes: 1080, unknownMinutes: 1070 });
  });

  it.each(['2026-03-25T12:00:00Z', '2026-10-22T12:00:00Z'])(
    'counts 7560 daytime minutes in a DST-change week: %s', (date) => {
      const week = weekOf(Date.parse(date));
      expect(knooppuntResult(readings([], []), 'x', week).week.totalMinutes).toBe(7 * 1080);
    }
  );

  it('weights hourly and ten-minute snapshots by duration across the archive cadence change', () => {
    const times = ['2026-09-08T09:00:00Z', '2026-09-08T10:00:00Z', '2026-09-08T10:50:00Z'].map(Date.parse);
    const result = knooppuntResult(readings(times, [2, 0, 0]), 'x', {
      start: times[0], end: Date.parse('2026-09-08T11:00:00Z'),
    }).week;
    expect(result).toMatchObject({ metMinutes: 60, measuredMinutes: 120, totalMinutes: 120, unknownMinutes: 0, share: 0.5 });
  });

  it('caps an old hourly snapshot instead of bridging a two-hour outage', () => {
    const time = Date.parse('2026-09-07T09:00:00Z');
    expect(knooppuntResult(readings([time], [2]), 'x', { start: time, end: time + 180 * minute }).week)
      .toMatchObject({ metMinutes: 60, measuredMinutes: 60, totalMinutes: 180, unknownMinutes: 120 });
  });

  it('sums minutes for the month, including empty weeks, instead of averaging weekly percentages', () => {
    const short = knooppuntResult(regular(20, 2), 'x', range(20)).week;
    const long = knooppuntResult(regular(80, 0), 'x', range(80)).week;
    const missing = knooppuntResult(readings([], []), 'x', range(100)).week;
    const month = sumShares([short, long, missing]);
    expect(month).toMatchObject({ metMinutes: 20, measuredMinutes: 100, totalMinutes: 200, unknownMinutes: 100, share: 0.1, upperShare: 0.6 });
    expect(formatShare(month)).toBe('10–60%');
  });

  it('gives the same month totals from week parts and from the full month, including partial weeks', () => {
    const month = monthOf(Date.parse('2026-10-15T12:00:00Z'));
    const now = Date.parse('2026-10-26T05:15:00Z');
    const times = [Date.parse('2026-10-01T04:00:00Z'), Date.parse('2026-10-05T04:00:00Z'), start, start + 10 * minute];
    const counts = [2, 0, 2, 0];
    const parts = weekParts(month, now).map((part) => {
      const indexes = times.map((_, i) => i).filter((i) => times[i] >= part.start && times[i] < part.end);
      return knooppuntResult(readings(indexes.map((i) => times[i]), indexes.map((i) => counts[i])), 'x', part).week;
    });
    const full = knooppuntResult(readings(times, counts), 'x', { start: month.start, end: now }).week;
    expect(sumShares(parts)).toEqual(full);
    expect(full.totalMinutes).toBe(25 * 1080 + 15);
  });
});
