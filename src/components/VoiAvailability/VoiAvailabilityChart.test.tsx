import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { fetchVoiAvailability } from '../../api/voiSnapshots';
import VoiAvailabilityChart from './VoiAvailabilityChart';

jest.mock('../../api/voiSnapshots', () => ({
  fetchVoiAvailability: jest.fn(),
}));
// Jest cannot resolve the conditional exports of @radix-ui/primitive that the
// shared Button pulls in, so render a plain button instead.
jest.mock('../ui/button', () => ({
  Button: ({ children, variant, size, ...props }) =>
    require('react').createElement('button', props, children),
}));
jest.mock('recharts', () => {
  const React = require('react');
  return {
    ...Object.fromEntries(
      [
      'LineChart',
      'XAxis',
      'YAxis',
      'CartesianGrid',
      'Tooltip',
      'Legend',
      'ReferenceLine',
      'ResponsiveContainer',
      ].map((name) => [name, ({ children }) => React.createElement('div', null, children)])
    ),
    Line: ({ children, dataKey, name }) => React.createElement(
      'div',
      { 'data-testid': `line-${dataKey}`, 'data-name': name },
      children
    ),
  };
});

const fetchAvailability = fetchVoiAvailability as jest.Mock;

test('can collapse and reveal the chart without losing the selected area', () => {
  fetchAvailability.mockImplementation(() => new Promise(() => {}));
  render(<VoiAvailabilityChart polygon={polygon} onClose={jest.fn()} />);

  const toggle = screen.getByRole('button', { name: 'Verberg grafiek' });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: 'Toon grafiek' })).toBeInTheDocument();
});

const polygon: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [5.1, 52.1],
      [5.2, 52.1],
      [5.2, 52.2],
      [5.1, 52.1],
    ],
  ],
};

const series = {
  from: '2026-09-01T12:00:00Z',
  to: '2026-09-08T12:00:00Z',
  series: [
    {
      captured_at: '2026-09-08T11:50:00Z',
      total: 1000,
      operational: 400,
      non_operational: 500,
      unknown: 100,
    },
    {
      captured_at: '2026-09-08T12:00:00Z',
      total: 1006,
      operational: 406,
      non_operational: 500,
      unknown: 100,
    },
  ],
};

beforeEach(() => {
  fetchAvailability.mockReset();
  fetchAvailability.mockResolvedValue(series);
});

test('renders nothing without a polygon', () => {
  const { container } = render(<VoiAvailabilityChart polygon={null} onClose={jest.fn()} />);

  expect(container).toBeEmptyDOMElement();
  expect(fetchAvailability).not.toHaveBeenCalled();
});

test('shows a skeleton and then the latest measurement', async () => {
  render(<VoiAvailabilityChart polygon={polygon} onClose={jest.fn()} />);

  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(
    await screen.findByText('Laatste meting: 406 van 1.006 voertuigen operationeel (40,4%)')
  ).toBeInTheDocument();
});

test('switches from status percentages to operational, non-operational and total counts', async () => {
  render(<VoiAvailabilityChart polygon={polygon} onClose={jest.fn()} />);
  await screen.findByText(/Laatste meting/);

  expect(screen.getByTestId('line-operationalPct')).toBeInTheDocument();
  expect(screen.getByTestId('line-nonOperationalPct')).toBeInTheDocument();

  const modeToggle = screen.getByRole('button', {
    name: 'Toon aantallen voertuigen',
  });
  fireEvent.click(modeToggle);

  expect(screen.getByRole('button', { name: 'Toon percentages' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(screen.getByTestId('line-operational')).toHaveAttribute('data-name', 'Operationeel');
  expect(screen.getByTestId('line-non_operational')).toHaveAttribute(
    'data-name',
    'Niet-operationeel'
  );
  expect(screen.getByTestId('line-total')).toHaveAttribute('data-name', 'Totaal');
  expect(screen.queryByTestId('line-operationalPct')).not.toBeInTheDocument();
  expect(screen.queryByTestId('line-nonOperationalPct')).not.toBeInTheDocument();
});

test('reports there are no measurements in the window', async () => {
  fetchAvailability.mockResolvedValue({ ...series, series: [] });

  render(<VoiAvailabilityChart polygon={polygon} onClose={jest.fn()} />);

  expect(await screen.findByText('Geen metingen in deze periode.')).toBeInTheDocument();
});

test('says so when the area never held a vehicle', async () => {
  fetchAvailability.mockResolvedValue({
    ...series,
    series: [
      {
        captured_at: '2026-09-08T11:00:00Z',
        total: 0,
        operational: 0,
        non_operational: 0,
        unknown: 0,
      },
    ],
  });

  render(<VoiAvailabilityChart polygon={polygon} onClose={jest.fn()} />);

  expect(
    await screen.findByText('Geen Voi-voertuigen in dit gebied in deze periode.')
  ).toBeInTheDocument();
  expect(screen.getByText('Laatste meting: geen voertuigen in dit gebied.')).toBeInTheDocument();
});

test('shows the API message and refetches on retry', async () => {
  fetchAvailability
    .mockRejectedValueOnce(
      new Error('De getekende vorm overlapt zichzelf. Teken het gebied opnieuw.')
    )
    .mockResolvedValueOnce(series);

  render(<VoiAvailabilityChart polygon={polygon} onClose={jest.fn()} />);

  await screen.findByRole('alert');
  expect(
    screen.getByText('De getekende vorm overlapt zichzelf. Teken het gebied opnieuw.')
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Opnieuw' }));

  await screen.findByText('Laatste meting: 406 van 1.006 voertuigen operationeel (40,4%)');
  expect(fetchAvailability).toHaveBeenCalledTimes(2);
});

test('refetches with a shorter window when the period changes', async () => {
  render(<VoiAvailabilityChart polygon={polygon} onClose={jest.fn()} />);
  await screen.findByText(/Laatste meting/);

  const [, defaultFrom, defaultTo] = fetchAvailability.mock.calls[0];
  expect(Date.parse(defaultTo) - Date.parse(defaultFrom)).toBe(7 * 24 * 60 * 60 * 1000);

  fireEvent.click(screen.getByRole('button', { name: '24 uur' }));

  await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(2));
  const [, dayFrom, dayTo] = fetchAvailability.mock.calls[1];
  expect(Date.parse(dayTo) - Date.parse(dayFrom)).toBe(24 * 60 * 60 * 1000);
  expect(screen.getByRole('button', { name: '24 uur' })).toHaveAttribute('aria-pressed', 'true');
});

test('aborts the running request when the period changes', async () => {
  render(<VoiAvailabilityChart polygon={polygon} onClose={jest.fn()} />);
  await screen.findByText(/Laatste meting/);

  const firstSignal = fetchAvailability.mock.calls[0][3] as AbortSignal;
  fireEvent.click(screen.getByRole('button', { name: '31 dagen' }));

  expect(firstSignal.aborted).toBe(true);
  await screen.findByText(/Laatste meting/);
});

test('closes on the close button', async () => {
  const onClose = jest.fn();
  render(<VoiAvailabilityChart polygon={polygon} onClose={onClose} />);
  await screen.findByText(/Laatste meting/);

  fireEvent.click(screen.getByRole('button', { name: 'Grafiek sluiten' }));

  expect(onClose).toHaveBeenCalledTimes(1);
});
