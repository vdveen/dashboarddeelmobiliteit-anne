import { getOperationalVehicleCountsByDay } from './operationalVehicleStats';

describe('getOperationalVehicleCountsByDay', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts parked vehicles that are not marked non-operational', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        park_events: [
          { system_id: 'voi', is_non_operational: false },
          { system_id: 'voi', is_non_operational: true },
          { system_id: 'check', is_non_operational: 'true' }
        ]
      })
    } as Response);

    const result = await getOperationalVehicleCountsByDay(
      'token',
      {
        zones: '123',
        gebied: '',
        aanbiedersexclude: '',
        voertuigtypesexclude: ''
      },
      {
        gebieden: [],
        zones: [],
        aanbieders: [{ system_id: 'voi' }, { system_id: 'check' }],
        vehicle_types: []
      },
      null,
      [
        { day: '2026-09-01', timestamp: '2026-09-01T00:00:00.000Z' },
        { day: '2026-09-01', timestamp: '2026-09-01T00:00:00.000Z' }
      ]
    );

    expect(result).toEqual({
      counts: { '2026-09-01': { voi: 1, check: 0 } },
      failedDays: []
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('timestamp=2026-09-01T00:00:00Z');
  });

  it('keeps the days that loaded and reports the day that failed', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) =>
      String(url).includes('2026-09-02')
        ? Promise.reject(new Error('boom'))
        : ({ ok: true, json: async () => ({ park_events: [{ system_id: 'voi', is_non_operational: false }] }) } as Response)
    );

    const result = await getOperationalVehicleCountsByDay(
      'token',
      { zones: '123', gebied: '', aanbiedersexclude: '', voertuigtypesexclude: '' },
      { gebieden: [], zones: [], aanbieders: [{ system_id: 'voi' }], vehicle_types: [] },
      null,
      [
        { day: '2026-09-01', timestamp: '2026-09-01T00:00:00.000Z' },
        { day: '2026-09-02', timestamp: '2026-09-02T00:00:00.000Z' },
        { day: '2026-09-03', timestamp: '2026-09-03T00:00:00.000Z' }
      ]
    );

    expect(result).toEqual({
      counts: {
        '2026-09-01': { voi: 1 },
        '2026-09-03': { voi: 1 }
      },
      failedDays: ['2026-09-02']
    });
  });
});
