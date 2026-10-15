import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BeschikbareVoertuigenChart from './BeschikbareVoertuigenChart';
import { getAggregatedVehicleData } from '../../helpers/stats/index';
import { getOperationalVehicleCountsByDay } from '../../api/operationalVehicleStats';
import { getArchivedVoiOperationalCounts } from '../../api/voiOperationalFallback';
import { getCachedVoiOperationalCounts } from '../../api/voiOperationalCache';

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
jest.mock('../../api/voiOperationalFallback', () => ({
  VOI_SYSTEM_ID: 'voi',
  getArchivedVoiOperationalCounts: jest.fn(),
}));
jest.mock('../../api/voiOperationalCache', () => ({ getCachedVoiOperationalCounts: jest.fn() }));
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
const archivedCounts = getArchivedVoiOperationalCounts as jest.Mock;
const cachedCounts = getCachedVoiOperationalCounts as jest.Mock;

beforeEach(() => {
  vehicleData.mockReset();
  operationalCounts.mockReset();
  archivedCounts.mockReset().mockResolvedValue({});
  cachedCounts.mockReset().mockResolvedValue({});
});

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

test('fills days without Voi park events from the snapshot archive', async () => {
  vehicleData.mockResolvedValue({
    availability_stats: { values: [] },
    rows: [{ name: '2026-09-01', voi: 10 }, { name: '2026-09-02', voi: 12 }],
  });
  operationalCounts.mockResolvedValue({ counts: { '2026-09-01': { voi: 8 }, '2026-09-02': {} }, failedDays: [] });
  archivedCounts.mockResolvedValue({ '2026-09-02': 11 });

  render(<BeschikbareVoertuigenChart filter={filter} config={{}} />);

  await waitFor(() => {
    const rows = JSON.parse(screen.getByTestId('rows').textContent || '[]');
    expect(rows.map((row: any) => row.voi__not_defect)).toEqual([8, 11]);
  });
  expect(archivedCounts.mock.calls[0][4].map((d: any) => d.day)).toEqual(['2026-09-02']);
});

test('takes cached Voi days from the cache and asks park_events only for the rest', async () => {
  vehicleData.mockResolvedValue({
    availability_stats: { values: [] },
    rows: [
      { name: '2026-09-01', voi: 10 },
      { name: '2026-09-02', voi: 12, lime: 6 },
      { name: '2026-09-03', voi: 11 },
    ],
  });
  cachedCounts.mockResolvedValue({ '2026-09-01': 8, '2026-09-02': 9 });
  operationalCounts.mockResolvedValue({
    counts: { '2026-09-02': { lime: 4 }, '2026-09-03': { voi: 7 } }, failedDays: [],
  });

  render(<BeschikbareVoertuigenChart filter={filter} config={{}} />);

  await waitFor(() => {
    const rows = JSON.parse(screen.getByTestId('rows').textContent || '[]');
    expect(rows.map((row: any) => row.voi__not_defect)).toEqual([8, 9, 7]);
    expect(rows[1].lime__not_defect).toBe(4);
  });
  expect(cachedCounts.mock.calls[0][3].map((d: any) => d.day))
    .toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  expect(operationalCounts.mock.calls[0][4].map(({ day, operators }: any) => ({ day, operators })))
    .toEqual([{ day: '2026-09-02', operators: ['lime'] }, { day: '2026-09-03', operators: undefined }]);
});
