import { VoiSnapshotCache } from './voiSnapshotCache';
import { downloadVoiSnapshot, snapshotsFromIndex } from './voiSnapshots';
const data = { type: 'FeatureCollection' as const, features: [] };
test('evicts least recently used frames and refuses an oversized frame', () => {
  const cache = new VoiSnapshotCache(2, 200);
  cache.put('a', data, 50); cache.put('b', data, 50); cache.get('a'); cache.put('c', data, 50);
  expect(cache.get('b')).toBeUndefined();
  expect(cache.get('a')).toBe(data);
  cache.put('huge', { ...data, title: 'large' }, 300);
  expect(cache.get('huge')).toBeUndefined();
});
test('rejects invalid index containers, dates and mismatched frame identity', async () => {
  expect(() => snapshotsFromIndex({} as any)).toThrow();
  expect(snapshotsFromIndex([{ captured_at: '', path: 'voi-vehicles-2026-02-30T00-00-00Z.geojson' }])).toEqual([]);
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => null },
    text: async () => JSON.stringify({ ...data, captured_at: '2026-09-01T00:00:00Z' })
  });
  await expect(downloadVoiSnapshot({ name: 'frame', capturedAt: '2026-09-02T00:00:00Z', downloadUrl: '/frame' })).rejects.toThrow('tijdstip');
  delete global.fetch;
});
