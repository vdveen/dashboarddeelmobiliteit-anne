import { useCallback, useEffect, useRef, useState } from 'react';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import MapControlsPortal from '../Map/MapControls/MapControlsPortal';
import './SelectionTool.css';

type SelectionMode = 'polygon' | 'lasso';

type SelectionToolProps = {
  map: any;
  vehicles: any;
};

const SELECTION_SOURCE_ID = 'vehicle-selection-tool';
const SELECTION_FILL_LAYER_ID = 'vehicle-selection-tool-fill';
const SELECTION_LINE_LAYER_ID = 'vehicle-selection-tool-line';
const MIN_POINTS = 3;

const createPolygonFeatureCollection = (coordinates) => ({
  type: 'FeatureCollection',
  features: coordinates.length >= MIN_POINTS ? [{
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[...coordinates, coordinates[0]]]
    }
  }] : []
});

const SelectionTool = ({ map, vehicles }: SelectionToolProps): JSX.Element => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<SelectionMode | null>(null);
  const points = useRef<number[][]>([]);
  const features = useRef(vehicles?.data?.features || []);
  features.current = vehicles?.data?.features || [];
  const [pointCount, setPointCount] = useState(0);
  const [vehicleCount, setVehicleCount] = useState<number | null>(null);

  const updateSelectionSource = useCallback((nextCoordinates) => {
    points.current = nextCoordinates;
    setPointCount(nextCoordinates.length);
    map?.getSource(SELECTION_SOURCE_ID)?.setData(createPolygonFeatureCollection(nextCoordinates));
  }, [map]);

  const clearSelection = useCallback(() => {
    setActiveMode(null);
    setVehicleCount(null);
    updateSelectionSource([]);
  }, [updateSelectionSource]);

  const countSelection = useCallback(() => {
    if (points.current.length < MIN_POINTS) return;
    const polygon = createPolygonFeatureCollection(points.current).features[0];
    setVehicleCount(features.current.filter(feature => {
      const coordinates = feature?.geometry?.coordinates;
      return feature?.geometry?.type === 'Point' && Array.isArray(coordinates)
        && coordinates.slice(0, 2).length === 2 && coordinates.slice(0, 2).every(Number.isFinite)
        && booleanPointInPolygon(feature, polygon as any);
    }).length);
  }, []);

  const finishSelection = useCallback(() => {
    if (points.current.length < MIN_POINTS) { clearSelection(); return; }
    setActiveMode(null);
  }, [clearSelection]);

  const startSelection = (mode: SelectionMode) => {
    clearSelection();
    setActiveMode(mode);
    setIsOpen(true);
  };

  useEffect(() => {
    if (!map) return;

    const addSelectionLayers = () => {
      if (!map || !map.isStyleLoaded()) return;
      if (!map.getSource(SELECTION_SOURCE_ID)) {
        map.addSource(SELECTION_SOURCE_ID, {
          type: 'geojson',
          data: createPolygonFeatureCollection(points.current)
        });
      }
      if (!map.getLayer(SELECTION_FILL_LAYER_ID)) {
        map.addLayer({
          id: SELECTION_FILL_LAYER_ID,
          type: 'fill',
          source: SELECTION_SOURCE_ID,
          paint: {
            'fill-color': '#0f1c3f',
            'fill-opacity': 0.16
          }
        });
      }
      if (!map.getLayer(SELECTION_LINE_LAYER_ID)) {
        map.addLayer({
          id: SELECTION_LINE_LAYER_ID,
          type: 'line',
          source: SELECTION_SOURCE_ID,
          paint: {
            'line-color': '#0f1c3f',
            'line-width': 3,
            'line-dasharray': [2, 1]
          }
        });
      }
    };

    if (map.isStyleLoaded()) addSelectionLayers();
    map.on('load', addSelectionLayers);
    map.on('styledata', addSelectionLayers);

    return () => {
      map.off('load', addSelectionLayers);
      map.off('styledata', addSelectionLayers);
      for (const id of [SELECTION_LINE_LAYER_ID, SELECTION_FILL_LAYER_ID]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SELECTION_SOURCE_ID)) map.removeSource(SELECTION_SOURCE_ID);
    };
  }, [map]);

  useEffect(() => {
    if (!map || !activeMode) return;

    const canvas = map.getCanvas();
    const previousDrawing = canvas.dataset.selectionDrawing;
    canvas.dataset.selectionDrawing = 'true';
    const previousCursor = canvas.style.cursor;
    const previousTouchAction = canvas.style.touchAction;
    const interactions = [map.dragPan, map.touchZoomRotate, map.doubleClickZoom]
      .filter(Boolean).map(handler => ({ handler, enabled: handler.isEnabled() }));
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'none';
    // Disable before pointerdown, so MapLibre cannot start panning first.
    interactions.forEach(({ handler }) => handler.disable());
    let pointerId: number | null = null;
    const addPoint = (lngLat) => {
      if (!Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) return;
      updateSelectionSource([...points.current, [lngLat.lng, lngLat.lat]]);
    };
    const onClick = event => { if (activeMode === 'polygon') addPoint(event.lngLat); };
    const onContextMenu = event => { event.preventDefault(); finishSelection(); };
    const position = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
    };
    const onDown = (event: PointerEvent) => {
      if (activeMode !== 'lasso' || event.button !== 0 || pointerId !== null) return;
      event.preventDefault();
      pointerId = event.pointerId;
      updateSelectionSource([]);
      addPoint(position(event));
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      addPoint(position(event));
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      finishSelection();
    };
    const onCancel = () => clearSelection();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); clearSelection(); }
      if (event.key === 'Enter' && event.target === canvas) { event.preventDefault(); finishSelection(); }
    };
    // Replacing the style cancels a gesture. Completed geometry is restored by
    // the layer effect when the new style becomes ready.
    map.on('styledataloading', onCancel);
    map.on('click', onClick);
    map.on('contextmenu', onContextMenu);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    document.addEventListener('keydown', onKey);
    return () => {
      map.off('styledataloading', onCancel);
      map.off('click', onClick);
      map.off('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      document.removeEventListener('keydown', onKey);
      if (previousDrawing === undefined) delete canvas.dataset.selectionDrawing;
      else canvas.dataset.selectionDrawing = previousDrawing;
      canvas.style.cursor = previousCursor;
      canvas.style.touchAction = previousTouchAction;
      interactions.forEach(({ handler, enabled }) => enabled ? handler.enable() : handler.disable());
    };
  }, [activeMode, finishSelection, clearSelection, map, updateSelectionSource]);

  useEffect(() => {
    if (!activeMode && points.current.length >= MIN_POINTS) countSelection();
  }, [vehicles?.data, activeMode, countSelection]);

  return <MapControlsPortal map={map} corner="bottom-right" order={-2}>
    <div className="SelectionTool">
    {isOpen && <div className="SelectionTool-panel">
      <strong>Selectie</strong>
      <p>{activeMode === 'polygon' ? 'Klik punten op de kaart. Kies Afronden of rechtsklik. Escape annuleert.' : activeMode === 'lasso' ? 'Sleep om een lasso te tekenen. Escape annuleert.' : 'Teken een gebied om voertuigen te tellen.'}</p>
      {vehicleCount !== null && <div className="SelectionTool-result" role="status">{vehicleCount} voertuigen in selectie</div>}
      <div className="SelectionTool-actions">
        <button type="button" className={activeMode === 'polygon' ? 'is-active' : ''} onClick={() => startSelection('polygon')}>Polygoon</button>
        <button type="button" className={activeMode === 'lasso' ? 'is-active' : ''} onClick={() => startSelection('lasso')}>Lasso</button>
        <button type="button" disabled={pointCount < MIN_POINTS || !activeMode} onClick={finishSelection}>Afronden</button>
        <button type="button" onClick={clearSelection}>Wis</button>
      </div>
    </div>}
    <button type="button" className={`SelectionTool-toggle ${activeMode ? 'is-active' : ''}`} aria-label="Voertuigen selecteren" aria-expanded={isOpen} onClick={() => { if (isOpen) clearSelection(); setIsOpen(!isOpen); }}>⌁</button>
    </div>
  </MapControlsPortal>;
};

export default SelectionTool;
