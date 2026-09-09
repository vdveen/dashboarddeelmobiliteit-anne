import type { FeatureCollection, Polygon, Position } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  buildPolygon,
  emptyFeatureCollection,
  toDrawingFeatureCollection,
  toPolygonFeatureCollection,
} from './polygonGeometry';

export type MapDrawMode = 'polygon' | 'lasso';

export interface MapPolygonDraw {
  /** The drawing mode in progress, or null when nothing is being drawn. */
  mode: MapDrawMode | null;
  /** The finished polygon, or null while drawing or after clearing. */
  polygon: Polygon | null;
  /** Points placed so far. Only meaningful while drawing a polygon. */
  pointCount: number;
  start: (mode: MapDrawMode) => void;
  finish: () => void;
  clear: () => void;
}

const SOURCE_ID = 'voi-area-draw';
const FILL_LAYER_ID = 'voi-area-fill';
const LINE_LAYER_ID = 'voi-area-line';

/** The map handlers that would fight with drawing while a mode is active. */
interface ToggleableHandler {
  isEnabled(): boolean;
  enable(): void;
  disable(): void;
}

/**
 * Lets the user draw an area on a MapLibre map, either by clicking corners
 * (polygon) or by dragging an outline (lasso). The hook owns its own source and
 * layers, so it can be dropped onto any map without touching that map's setup.
 *
 * Points are kept in a ref rather than in state: a lasso adds a point per
 * pointer move, and re-rendering the React tree that often is wasteful.
 */
export function useMapPolygonDraw(map: MapLibreMap | null): MapPolygonDraw {
  const pointsRef = useRef<Position[]>([]);
  const dataRef = useRef<FeatureCollection>(emptyFeatureCollection());
  const lassoActiveRef = useRef(false);

  const [mode, setMode] = useState<MapDrawMode | null>(null);
  const [polygon, setPolygon] = useState<Polygon | null>(null);
  const [pointCount, setPointCount] = useState(0);

  const updateSource = useCallback((data: FeatureCollection) => {
    dataRef.current = data;
    if (!map) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) source.setData(data);
  }, [map]);

  const reset = useCallback(() => {
    pointsRef.current = [];
    lassoActiveRef.current = false;
    setPointCount(0);
    setPolygon(null);
    updateSource(emptyFeatureCollection());
  }, [updateSource]);

  const clear = useCallback(() => {
    reset();
    setMode(null);
  }, [reset]);

  const start = useCallback((nextMode: MapDrawMode) => {
    reset();
    setMode(nextMode);
  }, [reset]);

  const finish = useCallback(() => {
    const nextPolygon = buildPolygon(pointsRef.current);
    if (!nextPolygon) {
      clear();
      return;
    }

    pointsRef.current = [];
    lassoActiveRef.current = false;
    setPointCount(0);
    setPolygon(nextPolygon);
    setMode(null);
    updateSource(toPolygonFeatureCollection(nextPolygon));
  }, [clear, updateSource]);

  // Own source and layers. A style change wipes them, so re-add on `styledata`
  // and put the current drawing back.
  useEffect(() => {
    if (!map) return undefined;
    let cancelled = false;

    const ensureLayers = () => {
      if (cancelled) return;
      // MapLibre refuses sources and layers until the style has settled, and
      // reports the style as unloaded while any change is still pending. A map
      // handed over right after its own layers were added is in exactly that
      // state, and an otherwise idle map fires no further `load` or
      // `styledata`, so retry on the next idle frame instead of waiting for an
      // event that never arrives.
      if (!map.isStyleLoaded()) {
        map.once('idle', ensureLayers);
        return;
      }

      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, { type: 'geojson', data: dataRef.current });
      }
      if (!map.getLayer(FILL_LAYER_ID)) {
        map.addLayer({
          id: FILL_LAYER_ID,
          type: 'fill',
          source: SOURCE_ID,
          paint: { 'fill-color': '#17313b', 'fill-opacity': 0.14 },
        });
      }
      if (!map.getLayer(LINE_LAYER_ID)) {
        map.addLayer({
          id: LINE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': '#17313b',
            'line-width': 3,
            'line-dasharray': [2, 1],
          },
        });
      }

      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (source) source.setData(dataRef.current);
    };

    ensureLayers();
    map.on('load', ensureLayers);
    map.on('styledata', ensureLayers);

    return () => {
      cancelled = true;
      map.off('load', ensureLayers);
      map.off('styledata', ensureLayers);
      map.off('idle', ensureLayers);
      try {
        if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch (removeError) {
        // The map itself can already be removed; then there is nothing to clean.
      }
    };
  }, [map]);

  // Pointer and keyboard handling while a drawing mode is active.
  useEffect(() => {
    if (!map || !mode) return undefined;

    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    const previousTouchAction = canvas.style.touchAction;
    const handlers: ToggleableHandler[] = [
      map.dragPan,
      map.touchZoomRotate,
      map.doubleClickZoom,
    ];
    const wasEnabled = handlers.map((handler) => handler.isEnabled());

    handlers.forEach((handler) => handler.disable());
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'none';

    const positionFromEvent = (event: PointerEvent): Position => {
      const rect = canvas.getBoundingClientRect();
      const lngLat = map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
      return [lngLat.lng, lngLat.lat];
    };

    const addPoint = (position: Position) => {
      pointsRef.current.push(position);
      updateSource(toDrawingFeatureCollection(pointsRef.current));
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      // Keep the map's own click handling out of the drawing.
      event.preventDefault();
      event.stopPropagation();

      if (mode === 'polygon') {
        addPoint(positionFromEvent(event));
        setPointCount(pointsRef.current.length);
        return;
      }

      lassoActiveRef.current = true;
      pointsRef.current = [positionFromEvent(event)];
      updateSource(toDrawingFeatureCollection(pointsRef.current));
      setPointCount(1);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (mode !== 'lasso' || !lassoActiveRef.current) return;
      addPoint(positionFromEvent(event));
    };

    const onPointerUp = () => {
      if (mode !== 'lasso' || !lassoActiveRef.current) return;
      lassoActiveRef.current = false;
      finish();
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (mode === 'polygon') finish();
    };

    /**
     * MapLibre listens for mouse events on the canvas container, so a drawing
     * click would also reach layer handlers such as cluster zooming. Stop it at
     * the canvas, which sees the event first.
     */
    const blockMapClick = (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clear();
        return;
      }
      if (event.key === 'Enter' && mode === 'polygon') {
        event.preventDefault();
        finish();
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('click', blockMapClick);
    canvas.addEventListener('dblclick', blockMapClick);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('click', blockMapClick);
      canvas.removeEventListener('dblclick', blockMapClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);

      handlers.forEach((handler, index) => {
        if (wasEnabled[index] && !handler.isEnabled()) handler.enable();
      });
      canvas.style.cursor = previousCursor;
      canvas.style.touchAction = previousTouchAction;
    };
  }, [map, mode, clear, finish, updateSource]);

  return { mode, polygon, pointCount, start, finish, clear };
}

export default useMapPolygonDraw;
