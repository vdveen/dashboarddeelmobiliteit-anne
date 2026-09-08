import { act, renderHook } from '@testing-library/react';
import type { Map as MapLibreMap } from 'maplibre-gl';

import { useMapPolygonDraw } from './useMapPolygonDraw';

/**
 * A MapLibre stand-in with just the surface the hook uses: a real canvas so DOM
 * events behave, toggleable handlers, and a source that records its data.
 */
function createFakeMap() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);

  const layers = new Set<string>();
  const sources = new Map<string, { setData: (data: unknown) => void }>();
  const sourceData: Record<string, unknown> = {};
  const handler = () => {
    let enabled = true;
    return {
      isEnabled: () => enabled,
      enable: () => { enabled = true; },
      disable: () => { enabled = false; },
    };
  };

  const listeners: Record<string, Array<() => void>> = {};
  let styleLoaded = true;

  const map = {
    dragPan: handler(),
    touchZoomRotate: handler(),
    doubleClickZoom: handler(),
    getCanvas: () => canvas,
    isStyleLoaded: () => styleLoaded,
    on: jest.fn((event: string, listener: () => void) => {
      (listeners[event] ||= []).push(listener);
    }),
    once: jest.fn((event: string, listener: () => void) => {
      const wrapped = () => {
        listeners[event] = (listeners[event] || []).filter((entry) => entry !== wrapped);
        listener();
      };
      (listeners[event] ||= []).push(wrapped);
    }),
    off: jest.fn((event: string, listener: () => void) => {
      listeners[event] = (listeners[event] || []).filter((entry) => entry !== listener);
    }),
    addSource: (id: string, options: { data: unknown }) => {
      sourceData[id] = options.data;
      sources.set(id, { setData: (data: unknown) => { sourceData[id] = data; } });
    },
    getSource: (id: string) => sources.get(id),
    addLayer: (layer: { id: string }) => { layers.add(layer.id); },
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    removeLayer: (id: string) => { layers.delete(id); },
    removeSource: (id: string) => { sources.delete(id); },
    unproject: ([x, y]: [number, number]) => ({ lng: x / 100, lat: y / 100 }),
  };

  return {
    map: map as unknown as MapLibreMap,
    canvas,
    layers,
    sourceData,
    setStyleLoaded: (value: boolean) => { styleLoaded = value; },
    emit: (event: string) => { [...(listeners[event] || [])].forEach((listener) => listener()); },
  };
}

const canvasPoints = (_map: MapLibreMap): [number, number][] => [[10, 10], [90, 10], [90, 90]];

const pointerEvent = (type: string, clientX: number, clientY: number) =>
  new MouseEvent(type, { clientX, clientY, button: 0, bubbles: true, cancelable: true });

afterEach(() => {
  document.body.innerHTML = '';
});

test('adds its own source and layers and cleans them up', () => {
  const { map, layers } = createFakeMap();

  const { unmount } = renderHook(() => useMapPolygonDraw(map));

  expect(Array.from(layers)).toEqual(['voi-area-fill', 'voi-area-line']);

  unmount();
  expect(layers.size).toBe(0);
});

test('collects clicked points and closes the polygon on right click', () => {
  const { map, canvas, sourceData } = createFakeMap();
  const { result } = renderHook(() => useMapPolygonDraw(map));

  act(() => result.current.start('polygon'));
  expect(map.dragPan.isEnabled()).toBe(false);
  expect(canvas.style.cursor).toBe('crosshair');

  act(() => { canvas.dispatchEvent(pointerEvent('pointerdown', 100, 200)); });
  act(() => { canvas.dispatchEvent(pointerEvent('pointerdown', 300, 200)); });
  act(() => { canvas.dispatchEvent(pointerEvent('pointerdown', 300, 400)); });
  expect(result.current.pointCount).toBe(3);
  expect(result.current.polygon).toBeNull();

  act(() => {
    canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });

  expect(result.current.mode).toBeNull();
  expect(result.current.polygon).toEqual({
    type: 'Polygon',
    coordinates: [[[1, 2], [3, 2], [3, 4], [1, 2]]],
  });
  expect(sourceData['voi-area-draw']).toEqual({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: result.current.polygon }],
  });
  expect(map.dragPan.isEnabled()).toBe(true);
});

test('finishes a lasso on pointer up', () => {
  const { map, canvas } = createFakeMap();
  const { result } = renderHook(() => useMapPolygonDraw(map));

  act(() => result.current.start('lasso'));
  act(() => { canvas.dispatchEvent(pointerEvent('pointerdown', 100, 100)); });
  act(() => { window.dispatchEvent(pointerEvent('pointermove', 200, 100)); });
  act(() => { window.dispatchEvent(pointerEvent('pointermove', 200, 300)); });
  act(() => { window.dispatchEvent(pointerEvent('pointerup', 200, 300)); });

  expect(result.current.mode).toBeNull();
  expect(result.current.polygon?.coordinates[0]).toEqual([[1, 1], [2, 1], [2, 3], [1, 1]]);
});

test('escape cancels a drawing in progress', () => {
  const { map, canvas } = createFakeMap();
  const { result } = renderHook(() => useMapPolygonDraw(map));

  act(() => result.current.start('polygon'));
  act(() => { canvas.dispatchEvent(pointerEvent('pointerdown', 100, 100)); });
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });

  expect(result.current.mode).toBeNull();
  expect(result.current.pointCount).toBe(0);
  expect(result.current.polygon).toBeNull();
  expect(map.dragPan.isEnabled()).toBe(true);
});

test('drops a drawing with too few distinct points', () => {
  const { map, canvas } = createFakeMap();
  const { result } = renderHook(() => useMapPolygonDraw(map));

  act(() => result.current.start('polygon'));
  act(() => { canvas.dispatchEvent(pointerEvent('pointerdown', 100, 100)); });
  act(() => { canvas.dispatchEvent(pointerEvent('pointerdown', 200, 100)); });
  act(() => result.current.finish());

  expect(result.current.polygon).toBeNull();
  expect(result.current.mode).toBeNull();
});

test('adds its layers once the style settles when the map arrives mid-change', () => {
  // The Voi monitor hands the map over inside its own `load` handler, right
  // after adding vehicle layers. The style still reports itself as unloaded
  // then, and no further `load` or `styledata` follows on an idle map.
  const { map, layers, sourceData, setStyleLoaded, emit } = createFakeMap();
  setStyleLoaded(false);

  const { result } = renderHook(() => useMapPolygonDraw(map));

  expect(layers.has('voi-area-fill')).toBe(false);

  setStyleLoaded(true);
  act(() => { emit('idle'); });

  expect(layers.has('voi-area-fill')).toBe(true);
  expect(layers.has('voi-area-line')).toBe(true);

  // The shape drawn before the layers existed still reaches the map.
  act(() => { result.current.start('polygon'); });
  act(() => {
    canvasPoints(map).forEach(([x, y]) => {
      map.getCanvas().dispatchEvent(pointerEvent('pointerdown', x, y));
    });
  });

  expect((sourceData['voi-area-draw'] as { features: unknown[] }).features).toHaveLength(1);
});
