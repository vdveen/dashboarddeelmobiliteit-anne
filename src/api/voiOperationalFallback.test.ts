import { getArchivedVoiOperationalCounts } from './voiOperationalFallback';
import { fetchVoiAvailability } from './voiSnapshots';

jest.mock('./voiSnapshots', () => ({ fetchVoiAvailability: jest.fn() }));

const availability = fetchVoiAvailability as jest.Mock;
const square = (x: number) => ({
  type: 'Polygon',
  coordinates: [[[x, 52], [x + 1, 52], [x + 1, 53], [x, 52]]],
});
const filter = { zones: '1,2', gebied: '', aanbiedersexclude: '', voertuigtypesexclude: '' };
const metadata = { gebieden: [], zones: [], aanbieders: [{ system_id: 'voi' }], vehicle_types: [] };
const point = (captured_at: string, operational: number, unknown = 0) =>
  ({ captured_at, operational, non_operational: 1, unknown, total: operational + 1 + unknown });

describe('getArchivedVoiOperationalCounts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    availability.mockReset();
  });

  it('sums the first snapshot of each day over the zones', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ zones: [{ zone_id: 1, geojson: square(5) }, { zone_id: 2, geojson: square(6) }] }),
    } as Response);
    availability.mockImplementation(async (geometry: any, from: string) => {
      const base = geometry.coordinates[0][0][0] === 5 ? 10 : 20;
      if (from.startsWith('2026-10-07')) {
        return { series: [point('2026-10-07T22:00:00Z', base), point('2026-10-07T22:10:00Z', 99)] };
      }
      // Before 8 Sep 2026 the archive has no status, so the count is unreliable
      return { series: [point('2026-10-08T22:00:00Z', base, 1)] };
    });

    const counts = await getArchivedVoiOperationalCounts('token', filter, metadata, null, [
      { day: '2026-10-08', timestamp: '2026-10-07T22:00:00.000Z' },
      { day: '2026-10-09', timestamp: '2026-10-08T22:00:00.000Z' },
    ]);

    expect(counts).toEqual({ '2026-10-08': 30 });
    expect(fetchMock.mock.calls[0][0]).toContain('/dashboard-api/zones?zone_ids=1,2&include_geojson=true');
    expect(availability).toHaveBeenCalledWith(square(5), '2026-10-07T22:00:00Z', '2026-10-08T22:00:00Z', undefined);
  });

  it('has no fallback without zone_ids or with a vehicle type filter', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const days = [{ day: '2026-10-08', timestamp: '2026-10-07T22:00:00.000Z' }];

    expect(await getArchivedVoiOperationalCounts('token', { ...filter, zones: '' }, metadata, null, days)).toEqual({});
    expect(await getArchivedVoiOperationalCounts('token', { ...filter, voertuigtypesexclude: 'moped' }, metadata, null, days)).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
