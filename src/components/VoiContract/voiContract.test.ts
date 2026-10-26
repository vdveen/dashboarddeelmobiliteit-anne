import { BEDRIJVENTERREINEN, KNOOPPUNTEN, Knooppunt } from '../../config/voiContractZones';
import {
  ZoneCountsResponse,
  chartRows,
  isoWeekNumber,
  knooppuntPolygon,
  knooppuntResult,
  knooppuntWindows,
  mergeResponses,
  monthOf,
  noonMoments,
  requestWindow,
  shiftMonth,
  shiftWeek,
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
    expect(requestWindow(week, Date.parse('2026-12-01T00:00:00Z')).to).toBe('2026-11-01T22:59:59.000Z');
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
  it('counts only 06:00-24:00 snapshots for a knooppunt', () => {
    const result = knooppuntResult(response, 'baarn');
    expect(result.days[0]).toEqual({ met: 2, measured: 3, share: 2 / 3 });
    expect(result.days[1].share).toBeNull();
    expect(result.week.measured).toBe(3);
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
