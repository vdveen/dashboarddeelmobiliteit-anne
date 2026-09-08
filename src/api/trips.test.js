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
test('rejects excessive periods and unscoped requests before fetching', async () => {
  global.fetch = jest.fn();
  await expect(getTripsWithDistance('test', { ...filter, ontwikkelingtot: '2026-09-01' }, {})).rejects.toThrow('31');
  await expect(getTripsWithDistance('test', { ...filter, zones: '' }, {})).rejects.toThrow('plaats');
  expect(global.fetch).not.toHaveBeenCalled();
});
