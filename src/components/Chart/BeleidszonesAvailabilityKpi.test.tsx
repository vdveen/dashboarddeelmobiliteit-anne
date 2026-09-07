import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BeleidszonesAvailabilityKpi from './BeleidszonesAvailabilityKpi';
import { fetch5mAvailabilitySeries } from '../../helpers/stats/availability-kpi';

let mockToken = 'account-a';
jest.mock('react-redux', () => ({ useSelector: selector => selector({
  authentication: { user_data: { token: mockToken } },
  filter: { ontwikkelingvan: '2026-08-01', ontwikkelingtot: '2026-08-01' },
  metadata: { aclOperators: [{ system_id: 'voi' }], aanbieders: [] },
}) }));
jest.mock('../../helpers/stats/index', () => ({ downloadCsv: jest.fn() }));
jest.mock('../../helpers/stats/availability-kpi', () => ({
  ...jest.requireActual('../../helpers/stats/availability-kpi'), fetch5mAvailabilitySeries: jest.fn(),
}));
jest.mock('recharts', () => {
  const React = require('react');
  return Object.fromEntries(['BarChart', 'Bar', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend', 'ResponsiveContainer']
    .map(name => [name, ({ children }) => React.createElement('div', null, children)]));
});
const fetchSeries = fetch5mAvailabilitySeries as jest.Mock;
const data = [{ time: '2026-08-01T06:00:00Z', counts: { voi: 1 } }];

beforeEach(() => { mockToken = 'account-a'; fetchSeries.mockReset(); });

test('clears a successful KPI when refresh fails', async () => {
  fetchSeries.mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('Meting niet beschikbaar'));
  render(<BeleidszonesAvailabilityKpi zoneId={1} />);
  fireEvent.click(screen.getByText('Haal 5-minuten-data op'));
  await screen.findByText('100%');
  fireEvent.click(screen.getByText('Opnieuw ophalen'));
  await screen.findByRole('alert');
  expect(screen.queryByText('100%')).toBeNull();
  expect(screen.queryByText('Download CSV')).toBeNull();
});

test('aborts and ignores a completion from an older account', async () => {
  let resolveOld;
  fetchSeries.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const { rerender } = render(<BeleidszonesAvailabilityKpi zoneId={1} />);
  fireEvent.click(screen.getByText('Haal 5-minuten-data op'));
  const signal = fetchSeries.mock.calls[0][6];
  mockToken = 'account-b';
  rerender(<BeleidszonesAvailabilityKpi zoneId={1} />);
  expect(signal.aborted).toBe(true);
  resolveOld(data);
  await waitFor(() => expect(screen.getByText('Haal 5-minuten-data op')).not.toBeDisabled());
  expect(screen.queryByText('100%')).toBeNull();
});
