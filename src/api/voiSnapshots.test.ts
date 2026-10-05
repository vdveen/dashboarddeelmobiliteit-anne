import { fetchVoiAvailability } from './voiSnapshots';

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
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    await expect(fetchVoiAvailability(polygon)).rejects.toThrow('status 500');
  });

  it('explains a self-intersecting polygon in Dutch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'polygon is not a valid geometry' }),
    }) as unknown as typeof fetch;

    await expect(fetchVoiAvailability(polygon)).rejects.toThrow(
      'De getekende vorm overlapt zichzelf. Teken het gebied opnieuw.'
    );
  });

  it('passes an unmapped validation message through', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'from must not be later than to' }),
    }) as unknown as typeof fetch;

    await expect(fetchVoiAvailability(polygon)).rejects.toThrow(
      'De selectie is ongeldig: from must not be later than to'
    );
  });

  it('falls back to the status when a 400 has no readable body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => { throw new SyntaxError('not json'); },
    }) as unknown as typeof fetch;

    await expect(fetchVoiAvailability(polygon)).rejects.toThrow('status 400');
  });
});
