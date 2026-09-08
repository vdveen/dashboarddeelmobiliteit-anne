import { fireEvent, render, screen } from '@testing-library/react';

import VoiAreaControls from './VoiAreaControls';

const setup = (props: Partial<React.ComponentProps<typeof VoiAreaControls>> = {}) => {
  const handlers = { onStart: jest.fn(), onFinish: jest.fn(), onClear: jest.fn() };
  render(
    <VoiAreaControls
      mode={null}
      pointCount={0}
      hasPolygon={false}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

test('invites the user to draw and keeps Wis disabled while idle', () => {
  const handlers = setup();

  expect(screen.getByText('Teken een gebied om de beschikbaarheid door de tijd te zien.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Wis' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Afronden' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Polygoon' }));
  expect(handlers.onStart).toHaveBeenCalledWith('polygon');
});

test('offers Afronden once a polygon has three points', () => {
  const handlers = setup({ mode: 'polygon', pointCount: 3 });

  expect(screen.getByRole('button', { name: 'Polygoon' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText(/Rechtsklik of Enter rondt af/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Afronden' }));
  expect(handlers.onFinish).toHaveBeenCalledTimes(1);
});

test('hides the hint and enables Wis once an area is drawn', () => {
  const handlers = setup({ hasPolygon: true });

  expect(screen.queryByText(/Teken een gebied/)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Wis' }));
  expect(handlers.onClear).toHaveBeenCalledTimes(1);
});

test('explains the lasso while dragging', () => {
  setup({ mode: 'lasso', pointCount: 12 });

  expect(screen.getByText('Sleep over de kaart. Escape annuleert.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lasso' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Wis' })).toBeEnabled();
});
