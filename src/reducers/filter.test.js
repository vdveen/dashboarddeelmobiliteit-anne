import filter, {
  OPERATIONAL_STATUS_ALL,
  OPERATIONAL_STATUS_NON_OPERATIONAL,
  OPERATIONAL_STATUS_OPERATIONAL
} from './filter.js';

describe('filter reducer: SET_FILTER_OPERATIONAL_STATUS', () => {
  const initial = filter(undefined, { type: '@@INIT' });

  it('starts with all vehicles', () => {
    expect(initial.operational_status).toBe(OPERATIONAL_STATUS_ALL);
  });

  it('accepts the three known statuses', () => {
    [OPERATIONAL_STATUS_ALL, OPERATIONAL_STATUS_NON_OPERATIONAL, OPERATIONAL_STATUS_OPERATIONAL]
      .forEach(status => {
        const next = filter(initial, { type: 'SET_FILTER_OPERATIONAL_STATUS', payload: status });
        expect(next.operational_status).toBe(status);
      });
  });

  it('falls back to all for unknown payloads', () => {
    const next = filter(
      { ...initial, operational_status: OPERATIONAL_STATUS_OPERATIONAL },
      { type: 'SET_FILTER_OPERATIONAL_STATUS', payload: 'bogus' }
    );
    expect(next.operational_status).toBe(OPERATIONAL_STATUS_ALL);
  });
});
