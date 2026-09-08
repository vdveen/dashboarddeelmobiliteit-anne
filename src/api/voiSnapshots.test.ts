import {
  fetchVoiAvailability,
  parseVoiSnapshotEntry,
  snapshotsFromIndex,
} from './voiSnapshots';

const entry = (name: string) => ({
  captured_at: 'not-used-for-parsing',
  path: `snapshots/${name}`,
});

describe('parseVoiSnapshotEntry', () => {
  it('reads the UTC capture time from the GeoJSON filename', () => {
    expect(parseVoiSnapshotEntry(
      entry('voi-vehicles-2026-09-04T11-18-17Z.geojson')
    )).toEqual({
      name: 'voi-vehicles-2026-09-04T11-18-17Z.geojson',
      capturedAt: '2026-09-04T11:18:17Z',
      downloadUrl: 'https://voi-snapshot-api-production.up.railway.app/snapshots/voi-vehicles-2026-09-04T11-18-17Z.geojson',
    });
  });

  it('ignores files that do not follow the snapshot filename format', () => {
    expect(parseVoiSnapshotEntry(entry('notes.txt'))).toBeNull();
  });
});

describe('snapshotsFromIndex', () => {
  it('returns valid snapshots in time order', () => {
    const entries = [
      entry('voi-vehicles-2026-09-04T11-18-17Z.geojson'),
      entry('notes.txt'),
      entry('voi-vehicles-2026-09-03T17-10-15Z.geojson'),
    ];

    const snapshots = snapshotsFromIndex(entries);

    expect(snapshots.map((snapshot) => snapshot.capturedAt)).toEqual([
      '2026-09-03T17:10:15Z',
      '2026-09-04T11:18:17Z',
    ]);
  });
});

describe('fetchVoiAvailability', () => {
  const polygon: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[[5.1, 52.1], [5.2, 52.1], [5.2, 52.2], [5.1, 52.1]]],
  };
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts the polygon and window and returns the series', async () => {
    const body = {
      from: '2026-09-01T00:00:00Z',
      to: '2026-09-08T00:00:00Z',
      series: [{ captured_at: '2026-09-07T12:00:00Z', total: 4, operational: 2, non_operational: 1, unknown: 1 }],
    };
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchVoiAvailability(polygon, '2026-09-01T00:00:00Z', '2026-09-08T00:00:00Z');

    expect(result).toEqual(body);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://voi-snapshot-api-production.up.railway.app/availability');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(options.body)).toEqual({
      polygon,
      from: '2026-09-01T00:00:00Z',
      to: '2026-09-08T00:00:00Z',
    });
  });

  it('reports an error status from the archive', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 }) as unknown as typeof fetch;

    await expect(fetchVoiAvailability(polygon)).rejects.toThrow('status 400');
  });
});
