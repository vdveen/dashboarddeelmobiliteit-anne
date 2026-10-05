import { fireEvent, render, waitFor } from '@testing-library/react';
import FilteritemRuweDataImport from './FilteritemRuweDataImport';

const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: selector => selector({ rentals: { csv_data: null } }),
}));
jest.mock('../../poll-api/pollVerhuringenData', () => ({ forceUpdateVerhuringenData: jest.fn() }));

test('shows an imported CSV on the cluster map', async () => {
  const { container } = render(<FilteritemRuweDataImport />);
  const csv = 'system_id;lat;lon;start_time;end_time\nvoi;52.3;4.8;2026-09-01T12:00:00+02:00;\n';
  fireEvent.change(container.querySelector('input[type="file"]'), {
    target: { files: [new File([csv], 'export.csv', { type: 'text/csv' })] },
  });
  await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith({
    type: 'LAYER_SET_SINGLE_DATA_LAYER',
    payload: { displayMode: 'displaymode-rentals', layerName: 'verhuurdata-clusters' },
  }));
});
