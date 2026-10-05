import { renderHook, waitFor } from '@testing-library/react';
import { useAggregatedChartData } from './useAggregatedChartData';

const regionCodes = ['GM0307', 'GM0317', 'GM0342', 'GM0308'];
let mockState: any;
jest.mock('react-redux', () => ({ useSelector: (selector: any) => selector(mockState) }));

const stateFor = (gebied: string, municipalities: string[]) => ({
  authentication: { user_data: { token: 'token', acl: { organisation_type: 'OPERATOR' } } },
  filter: { gebied, zones: '', ontwikkelingvan: '2026-09-01', ontwikkelingtot: '2026-09-30' },
  metadata: { zones: municipalities.map((municipality, i) => ({ zone_id: i + 1, municipality })) },
});

test('fetches a region once every municipality has zones, scoped to the account', async () => {
  mockState = stateFor(regionCodes.join(','), regionCodes);
  const fetcher = jest.fn().mockResolvedValue({ ok: true });
  const { result } = renderHook(() => useAggregatedChartData(fetcher));
  await waitFor(() => expect(result.current.data).toEqual({ ok: true }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][4]).toBe('OPERATOR');
});

test('waits while a region is missing zones of one municipality', () => {
  mockState = stateFor(regionCodes.join(','), regionCodes.slice(1));
  const fetcher = jest.fn();
  renderHook(() => useAggregatedChartData(fetcher));
  expect(fetcher).not.toHaveBeenCalled();
});
