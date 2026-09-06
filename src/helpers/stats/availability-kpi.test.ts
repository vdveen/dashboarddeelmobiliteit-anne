import { getBeleidszonesAvailabilityStats } from '../../api/beleidszones';
import { statsTimeToUtc } from './time';
import { build5mSeriesCsv, computeAvailabilityKpi, fetch5mAvailabilitySeries } from './availability-kpi';

jest.mock('../../api/beleidszones', () => ({ getBeleidszonesAvailabilityStats: jest.fn() }));
const fetchStats = getBeleidszonesAvailabilityStats as jest.Mock;
const response = (values = []) => ({ availability_stats: { values } });
const options = { windowStartHour: 0, windowEndHour: 24, threshold: 1, operators: ['voi'] };

beforeEach(() => {
  fetchStats.mockReset().mockResolvedValue(response());
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-01-01T00:00:00Z'));
});
afterEach(() => jest.restoreAllMocks());

test.each([
  ['2026-08-01T08:00:00+02:00', '2026-08-01T06:00:00Z'],
  ['2026-08-01T06:00:00Z', '2026-08-01T06:00:00Z'],
  ['2026-08-01', '2026-07-31T22:00:00Z'],
])('preserves the instant or interprets a reporting date: %s', (input, expected) => {
  expect(statsTimeToUtc(input)).toBe(expected);
});

test('rejects a failed middle chunk instead of returning partial or zero-filled results', async () => {
  fetchStats.mockResolvedValueOnce(response()).mockResolvedValueOnce(null);
  await expect(fetch5mAvailabilitySeries(null, 1, '2026-08-01', '2026-08-20')).rejects.toThrow('kon niet worden geladen');
  expect(fetchStats).toHaveBeenCalledTimes(2);
});

test('keeps absent buckets and absent providers unknown, while measured zero remains zero', async () => {
  fetchStats.mockResolvedValue(response([
    { time: '2026-07-31T22:00:00Z', voi: 0 },
    { time: '2026-07-31T22:05:00Z', voi: 2 },
    { time: '2026-07-31T22:10:00Z', voi: null },
  ]));
  const series = await fetch5mAvailabilitySeries(null, 1, '2026-08-01', '2026-08-01');
  const kpi = computeAvailabilityKpi(series, options);
  expect(kpi).toMatchObject({ overallPct: 50, observedIntervals: 2, expectedIntervals: 288 });
  expect(computeAvailabilityKpi(series, { ...options, operators: ['voi', 'check'] }).overallPct).toBeNull();
  expect(series[3].counts).toBeNull();
  expect(build5mSeriesCsv(series.slice(0, 4), ['voi']).split('\r\n')).toEqual([
    '"tijd_utc";"voi";"totaal"',
    '"2026-07-31T22:00:00.000Z";"0";"0"',
    '"2026-07-31T22:05:00.000Z";"2";"2"',
    '"2026-07-31T22:10:00.000Z";"";""',
    '"2026-07-31T22:15:00.000Z";"";""',
  ]);
});

test.each([['2026-03-29', 276], ['2026-10-25', 300]])('uses the real length of DST day %s', async (date, count) => {
  const series = await fetch5mAvailabilitySeries(null, 1, String(date), String(date));
  expect(series).toHaveLength(Number(count));
  expect(new Set(series.map(point => point.time)).size).toBe(count);
  expect(computeAvailabilityKpi(series, options).perDay).toEqual([
    expect.objectContaining({ date, intervalsInWindow: count, observedIntervals: 0, pct: null }),
  ]);
});

test('keeps the repeated autumn hour separate and applies the Amsterdam window', async () => {
  fetchStats.mockResolvedValue(response([
    { time: '2026-10-25T02:00:00+02:00', voi: 0 },
    { time: '2026-10-25T02:00:00+01:00', voi: 2 },
  ]));
  const series = await fetch5mAvailabilitySeries(null, 1, '2026-10-25', '2026-10-25');
  expect(computeAvailabilityKpi(series, { ...options, windowStartHour: 2, windowEndHour: 3 }))
    .toMatchObject({ overallPct: 50, observedIntervals: 2, expectedIntervals: 24 });
});

test('assigns an inclusive chunk boundary once and enforces the helper period cap', async () => {
  fetchStats.mockImplementation(async (_, request) => response([
    { time: request.startTime, voi: 1 }, { time: request.endTime, voi: 1 },
  ]));
  const series = await fetch5mAvailabilitySeries(null, 1, '2026-01-01', '2026-08-31');
  expect(series).toHaveLength(90 * 288);
  expect(fetchStats).toHaveBeenCalledTimes(13);
  expect(series.filter(point => point.counts !== null)).toHaveLength(13);
  expect(series.filter(point => point.counts !== null).every(point => point.counts.voi === 1)).toBe(true);
});

test('does not fetch or count the current incomplete bucket', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-01T06:03:00Z'));
  const series = await fetch5mAvailabilitySeries(null, 1, '2026-08-01', '2026-08-01');
  expect(series[series.length - 1].time).toBe('2026-08-01T05:55:00.000Z');
  const controller = new AbortController();
  controller.abort();
  await expect(fetch5mAvailabilitySeries(null, 1, '2026-08-01', '2026-08-01', [], undefined, controller.signal))
    .rejects.toMatchObject({ name: 'AbortError' });
});

test.each(['getBeleidszonesAvailabilityStats', 'getBeleidszonesRentalStats'])('%s sends UTC bounds and the caller abort signal', async (method) => {
  const api = jest.requireActual('../../api/beleidszones');
  const originalFetch = global.fetch;
  const transport = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  global.fetch = transport;
  try {
    const signal = new AbortController().signal;
    await api[method](null, { zoneIds: [1], startTime: '2026-08-01T08:00:00+02:00', endTime: '2026-08-01T20:00:00+02:00', signal });
    const [url, init] = transport.mock.calls[0];
    const params = new URL(url, 'https://example.test').searchParams;
    expect(params.get('start_time')).toBe('2026-08-01T06:00:00Z');
    expect(params.get('end_time')).toBe('2026-08-01T18:00:00Z');
    expect(init.signal).toBe(signal);
  } finally {
    global.fetch = originalFetch;
  }
});
