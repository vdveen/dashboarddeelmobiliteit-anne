import { act, fireEvent, render, screen } from '@testing-library/react';
import SelectionTool from './SelectionTool';
jest.mock('../Map/MapControls/MapControlsPortal', () => ({ __esModule: true, default: ({ children }) => children }));

function mapStub() {
  const canvas = document.createElement('canvas');
  const listeners = new Map();
  const sources = new Map();
  const layers = new Map();
  const interaction = (enabled = true) => ({ isEnabled: () => enabled, enable: jest.fn(() => { enabled = true; }), disable: jest.fn(() => { enabled = false; }) });
  return { canvas, sources, layers, dragPan: interaction(), doubleClickZoom: interaction(false),
    getCanvas: () => canvas, isStyleLoaded: () => true,
    getSource: id => sources.get(id), addSource: (id, source) => sources.set(id, { ...source, setData: jest.fn() }), removeSource: id => sources.delete(id),
    getLayer: id => layers.get(id), addLayer: layer => layers.set(layer.id, layer), removeLayer: id => layers.delete(id),
    on: (event, cb) => listeners.set(event, cb), off: event => listeners.delete(event),
    emit: (event, value?) => listeners.get(event)?.(value), unproject: ([lng, lat]) => ({ lng, lat }) };
}

test('keeps drawing handlers stable across points and restores exact interactions on completion and unmount', () => {
  const map = mapStub();
  const { unmount } = render(<SelectionTool map={map} vehicles={{ data: { features: [] } }} />);
  fireEvent.click(screen.getByLabelText('Voertuigen selecteren'));
  fireEvent.click(screen.getByText('Polygoon'));
  for (const [lng, lat] of [[0,0],[1,0],[0,1]]) act(() => map.emit('click', { lngLat: { lng, lat } }));
  expect(map.dragPan.isEnabled()).toBe(false);
  expect(map.dragPan.enable).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Afronden'));
  expect(screen.getByRole('status')).toHaveTextContent('0 voertuigen');
  expect(map.dragPan.isEnabled()).toBe(true);
  expect(map.doubleClickZoom.isEnabled()).toBe(false);
  fireEvent.click(screen.getByText('Lasso'));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(map.dragPan.isEnabled()).toBe(true);
  unmount();
  expect(map.layers.size).toBe(0);
  expect(map.sources.size).toBe(0);
});
