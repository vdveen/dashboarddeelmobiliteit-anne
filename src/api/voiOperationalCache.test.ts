import { getCachedVoiOperationalCounts } from './voiOperationalCache';

const metadata = {
  gebieden: [{ gm_code: 'GM0402', name: 'Hilversum' }],
  zones: [{ zone_id: 34188, municipality: 'GM0402', name: 'Hilversum', zone_type: 'municipality' }],
  aanbieders: [{ system_id: 'voi' }],
  vehicle_types: [{ id: 'bicycle' }, { id: 'moped' }],
};
const filter = { gebied: 'GM0402', zones: '', aanbiedersexclude: '', voertuigtypesexclude: '' };
const days = [
  { day: '2026-07-01', timestamp: '2026-06-30T22:00:00.000Z' },
  { day: '2026-07-02', timestamp: '2026-07-01T22:00:00.000Z' },
];

describe('getCachedVoiOperationalCounts', () => {
  afterEach(() => jest.restoreAllMocks());

  const mockCache = (counts: any) => jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ counts }),
  } as Response);

  it('sums the non-defect counts of the selected vehicle types per day', async () => {
    const fetchMock = mockCache({
      '2026-06-30T22:00:00Z': { bicycle: { operational: 40, total: 60 }, moped: { operational: 3, total: 4 } },
    });

    const counts = await getCachedVoiOperationalCounts(
      { ...filter, voertuigtypesexclude: 'moped' }, metadata, null, days
    );

    expect(counts).toEqual({ '2026-07-01': 40 });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      zone_ids: '34188',
      timestamps: ['2026-06-30T22:00:00Z', '2026-07-01T22:00:00Z'],
    });
  });

  it('skips areas outside the region, zone selections and today', async () => {
    const fetchMock = mockCache({});
    const today = new Date().toISOString();
    expect(await getCachedVoiOperationalCounts({ ...filter, gebied: 'GM0363' }, metadata, null, days)).toEqual({});
    expect(await getCachedVoiOperationalCounts({ ...filter, zones: '1' }, metadata, null, days)).toEqual({});
    expect(await getCachedVoiOperationalCounts(filter, metadata, null, [
      { day: '9999-01-01', timestamp: today },
    ])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves the days of a failed request to park_events', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
    expect(await getCachedVoiOperationalCounts(filter, metadata, null, days)).toEqual({});
  });
});
