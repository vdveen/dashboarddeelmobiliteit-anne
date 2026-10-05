import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BeschikbareVoertuigenChart from './BeschikbareVoertuigenChart';
import { getAggregatedVehicleData } from '../../helpers/stats/index';
import { getOperationalVehicleCountsByDay } from '../../api/operationalVehicleStats';

const filter = {
  gebied: 'GM0363', zones: '', ontwikkelingvan: '2026-09-01', ontwikkelingtot: '2026-09-02',
  ontwikkelingaggregatie: 'day', ontwikkelingaggregatie_function: 'MAX', aanbiedersexclude: '',
};
const mockState = {
  authentication: { user_data: { token: 'token', acl: { organisation_type: 'MUNICIPALITY' } } },
  filter,
  metadata: { zones: [{ zone_id: 1, municipality: 'GM0363' }], aanbieders: [{ system_id: 'voi', color: '#f26961' }] },
};
jest.mock('react-redux', () => ({
  useSelector: (selector: any) => selector(mockState),
  useDispatch: () => jest.fn(),
}));
jest.mock('../../helpers/stats/index', () => ({
  getAggregatedVehicleData: jest.fn(),
  getDateFormat: () => 'YYYY-MM-DD',
  doShowDetailledAggregatedData: () => false,
  aggregationFunctionButtonsToRender: [],
  prepareDataForCsv: jest.fn(),
  downloadCsv: jest.fn(),
  getAggregatedChartData: (data: any) => (data?.rows || []),
}));
jest.mock('../../api/operationalVehicleStats', () => ({ getOperationalVehicleCountsByDay: jest.fn() }));
jest.mock('recharts', () => {
  const React = require('react');
  const passthrough = ({ children }: any) => React.createElement('div', null, children);
  return {
    LineChart: ({ data, children }: any) => React.createElement('div', null,
      React.createElement('pre', { 'data-testid': 'rows' }, JSON.stringify(data)), children),
    ResponsiveContainer: passthrough,
    Line: ({ name }: any) => React.createElement('div', { 'data-testid': 'line' }, name),
    XAxis: () => null, YAxis: () => null, Legend: () => null, CartesianGrid: () => null,
    Tooltip: () => null, ReferenceArea: () => null, ReferenceLine: () => null,
  };
});

const vehicleData = getAggregatedVehicleData as jest.Mock;
const operationalCounts = getOperationalVehicleCountsByDay as jest.Mock;

test('adds the non-defect series and retries only the failed days', async () => {
  vehicleData.mockResolvedValue({
    availability_stats: { values: [] },
    rows: [{ name: '2026-09-01', voi: 10, lime: 5 }, { name: '2026-09-02', voi: 12, lime: 6 }],
  });
  operationalCounts
    .mockResolvedValueOnce({ counts: { '2026-09-01': { voi: 8 } }, failedDays: ['2026-09-02'] })
    .mockResolvedValueOnce({ counts: { '2026-09-02': { voi: 9 } }, failedDays: [] });

  render(<BeschikbareVoertuigenChart filter={filter} config={{}} />);

  await screen.findByText(/\(niet defect\)/);
  expect(vehicleData.mock.calls[0][4]).toBe('MUNICIPALITY');
  expect(operationalCounts.mock.calls[0][3]).toBe('MUNICIPALITY');
  // The non-defect count is an extra line, never part of the Totaal
  expect(screen.getAllByTestId('line')).toHaveLength(4);
  const rows = JSON.parse(screen.getByTestId('rows').textContent || '[]');
  expect(rows.map((row: any) => row.Totaal)).toEqual([15, 18]);
  expect(screen.getByRole('status').textContent).toContain('ontbreekt voor 1 dag');

  fireEvent.click(screen.getByText('Opnieuw'));
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(operationalCounts.mock.calls[1][4].map((d: any) => d.day)).toEqual(['2026-09-02']);
});
