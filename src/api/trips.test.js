import { getTripsWithDistance } from './trips';
jest.mock('../poll-api/pollTools.js', () => ({ createFilterparameters: (_, filter) => filter.zones ? ['zone_ids=12', 'start_time=wrong&end_time=wrong'] : [] }));
const filter = { zones: '12', ontwikkelingvan: '2026-03-29', ontwikkelingtot: '2026-03-29' };
afterEach(() => { delete global.fetch; });
test('uses Amsterdam calendar bounds across DST and propagates HTTP failures and cancellation', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
  const signal = new AbortController().signal;
  await expect(getTripsWithDistance('test', filter, {}, signal)).rejects.toThrow('503');
  const [url, init] = global.fetch.mock.calls[0];
  const params = new URL(url, 'https://example.test').searchParams;
  expect(params.get('start_time')).toBe('2026-03-28T23:00:00.000Z');
  expect(params.get('end_time')).toBe('2026-03-29T22:00:00.000Z');
  expect(init.signal).toBe(signal);
});
test('clamps a long selection to the most recent 31 days and leaves a short one alone', async () => {
  const ok = () => jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => null },
    body: null,
    text: async () => JSON.stringify({ trip_origins: [] })
  });

  global.fetch = ok();
  const long = await getTripsWithDistance('test', { ...filter, ontwikkelingvan: '2026-06-01', ontwikkelingtot: '2026-08-29' }, {});
  const longParams = new URL(global.fetch.mock.calls[0][0], 'https://example.test').searchParams;
  expect(longParams.get('end_time')).toBe('2026-08-29T22:00:00.000Z');
  expect(longParams.get('start_time')).toBe('2026-07-29T22:00:00.000Z');
  expect(long.window).toEqual({ start: '2026-07-29T22:00:00.000Z', end: '2026-08-29T22:00:00.000Z', clamped: true });

  global.fetch = ok();
  const short = await getTripsWithDistance('test', { ...filter, ontwikkelingvan: '2026-08-23', ontwikkelingtot: '2026-08-29' }, {});
  const shortParams = new URL(global.fetch.mock.calls[0][0], 'https://example.test').searchParams;
  expect(shortParams.get('start_time')).toBe('2026-08-22T22:00:00.000Z');
  expect(short.window.clamped).toBe(false);
});
test('allows the authenticated all-places request within the response budgets', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => null },
    body: null,
    text: async () => JSON.stringify({ trip_origins: [] })
  });
  await expect(getTripsWithDistance('test', { ...filter, zones: '' }, {})).resolves.toMatchObject({ trip_origins: [] });
  expect(global.fetch.mock.calls[0][0]).not.toContain('zone_ids=');
});
