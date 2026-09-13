import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import maplibregl from 'maplibre-gl';
import VoiVehicleHistory from './VoiVehicleHistory';
import { listVoiSnapshots, downloadVoiSnapshot } from '../api/voiSnapshots';
jest.mock('maplibre-gl', () => ({
  __esModule: true,
  default: {
    Map: jest.fn(),
    AttributionControl: jest.fn(),
    NavigationControl: jest.fn(),
  },
}));
jest.mock('../api/voiSnapshots');
jest.mock('../components/ui/button', () => ({
  Button: ({ variant, size, children, ...props }) => <button {...props}>{children}</button>,
}));
const frames = ['2026-09-01T00:00:00Z', '2026-09-01T00:10:00Z'].map((capturedAt, i) => ({
  name: `frame${i}`,
  capturedAt,
  downloadUrl: `/frame${i}`,
}));
test('retains displayed identity during a slow selection and retries that frame after failure', async () => {
  (maplibregl.Map as unknown as jest.Mock).mockImplementation(() => ({
    addControl() {},
    dragRotate: { disable() {} },
    touchZoomRotate: { disableRotation() {} },
    on() {},
    remove() {},
  }));
  (listVoiSnapshots as jest.Mock).mockResolvedValue(frames);
  (downloadVoiSnapshot as jest.Mock).mockResolvedValueOnce({
    data: { type: 'FeatureCollection', features: [] },
    bytes: 50,
  });
  const { container, unmount } = render(<VoiVehicleHistory />);
  await waitFor(() =>
    expect(container.querySelector('time')).toHaveAttribute('datetime', frames[1].capturedAt)
  );
  let reject;
  (downloadVoiSnapshot as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((_, r) => {
        reject = r;
      })
  );
  fireEvent.click(screen.getByLabelText('Vorige meting'));
  expect(container.querySelector('time')).toHaveAttribute('datetime', frames[1].capturedAt);
  await act(async () => {
    reject(new Error('offline'));
  });
  expect(screen.getByRole('alert')).toHaveTextContent('offline');
  (downloadVoiSnapshot as jest.Mock).mockResolvedValueOnce({
    data: { type: 'FeatureCollection', features: [] },
    bytes: 50,
  });
  fireEvent.click(screen.getByText('Opnieuw'));
  await waitFor(() =>
    expect(container.querySelector('time')).toHaveAttribute('datetime', frames[0].capturedAt)
  );
  expect(listVoiSnapshots).toHaveBeenCalledTimes(1);
  const signal = (downloadVoiSnapshot as jest.Mock).mock.calls[2][1];
  unmount();
  expect(signal.aborted).toBe(true);
});

const threeFrames = [
  '2026-09-01T00:00:00Z',
  '2026-09-01T00:10:00Z',
  '2026-09-01T00:20:00Z',
].map((capturedAt, i) => ({
  name: `frame${i}`,
  capturedAt,
  downloadUrl: `/frame${i}`,
}));

test('adopts the running prefetch when playback reaches that frame instead of downloading it twice', async () => {
  (maplibregl.Map as unknown as jest.Mock).mockImplementation(() => ({
    addControl() {},
    dragRotate: { disable() {} },
    touchZoomRotate: { disableRotation() {} },
    on() {},
    remove() {},
  }));
  (listVoiSnapshots as jest.Mock).mockResolvedValue(threeFrames);
  const loaded = { data: { type: 'FeatureCollection', features: [] }, bytes: 50 };
  let finishMiddle;
  (downloadVoiSnapshot as jest.Mock).mockImplementation((snapshot) =>
    snapshot.downloadUrl === '/frame1'
      ? new Promise((resolve) => {
          finishMiddle = () => resolve(loaded);
        })
      : Promise.resolve(loaded)
  );

  const { container } = render(<VoiVehicleHistory />);
  await waitFor(() =>
    expect(container.querySelector('time')).toHaveAttribute('datetime', threeFrames[2].capturedAt)
  );

  fireEvent.change(screen.getByLabelText('Selecteer een meting'), { target: { value: '0' } });
  await waitFor(() =>
    expect(container.querySelector('time')).toHaveAttribute('datetime', threeFrames[0].capturedAt)
  );

  fireEvent.click(screen.getByLabelText('Metingen afspelen'));
  // Playback prefetches the next frame and, 900 ms later, selects it while that
  // download is still running.
  await waitFor(() =>
    expect(downloadVoiSnapshot).toHaveBeenCalledWith(threeFrames[1], expect.anything())
  );
  await waitFor(() => expect(screen.getByText('2 van 3')).toBeInTheDocument(), { timeout: 3000 });

  await act(async () => {
    finishMiddle();
  });
  await waitFor(() =>
    expect(container.querySelector('time')).toHaveAttribute('datetime', threeFrames[1].capturedAt)
  );

  const middleCalls = (downloadVoiSnapshot as jest.Mock).mock.calls.filter(
    ([snapshot]) => snapshot.downloadUrl === '/frame1'
  );
  expect(middleCalls).toHaveLength(1);
});
