import React from 'react';

import type { MapDrawMode } from './useMapPolygonDraw';

import './VoiAvailability.css';

export interface VoiAreaControlsProps {
  mode: MapDrawMode | null;
  pointCount: number;
  hasPolygon: boolean;
  onStart: (mode: MapDrawMode) => void;
  onFinish: () => void;
  onClear: () => void;
}

const MIN_POLYGON_POINTS = 3;

function hintFor(mode: MapDrawMode | null, hasPolygon: boolean): string {
  if (mode === 'polygon')
    return 'Klik punten op de kaart. Rechtsklik of Enter rondt af, Escape annuleert.';
  if (mode === 'lasso') return 'Sleep over de kaart. Escape annuleert.';
  if (!hasPolygon) return 'Teken een gebied om de beschikbaarheid door de tijd te zien.';
  return '';
}

/** Draw controls for the area selection, shown in the Voi monitor heading card. */
const VoiAreaControls: React.FC<VoiAreaControlsProps> = ({
  mode,
  pointCount,
  hasPolygon,
  onStart,
  onFinish,
  onClear,
}) => {
  const canFinish = mode === 'polygon' && pointCount >= MIN_POLYGON_POINTS;
  const hint = hintFor(mode, hasPolygon);

  return (
    <div className="VoiAvailability-area">
      <div className="VoiAvailability-areaHeading">Gebied</div>

      <div className="VoiAvailability-segmented" role="group" aria-label="Gebied tekenen">
        <button type="button" aria-pressed={mode === 'polygon'} onClick={() => onStart('polygon')}>
          Polygoon
        </button>
        <button type="button" aria-pressed={mode === 'lasso'} onClick={() => onStart('lasso')}>
          Lasso
        </button>
        {canFinish && (
          <button type="button" onClick={onFinish}>
            Afronden
          </button>
        )}
        {mode !== null && (
          <button type="button" onClick={onClear}>
            Annuleer
          </button>
        )}
        {mode === null && hasPolygon && (
          <button type="button" onClick={onClear}>
            Wis
          </button>
        )}
      </div>

      {hint && <p className="VoiAvailability-hint">{hint}</p>}
    </div>
  );
};

export default VoiAreaControls;
