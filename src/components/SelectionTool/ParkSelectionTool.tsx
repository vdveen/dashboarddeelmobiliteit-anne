import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import type { Polygon } from 'geojson';
import { StateType } from '../../types/StateType';
import VoiAvailabilityChart from '../VoiAvailability/VoiAvailabilityChart';
import SelectionTool from './SelectionTool';

type ParkSelectionToolProps = {
  map: any;
  vehicles: any;
};

/**
 * The Aanbod selection tool. Next to counting the vehicles on the map, a
 * finished selection opens the Voi availability chart for the same area.
 * Closing the chart keeps the selection; the panel then offers to reopen it.
 */
const ParkSelectionTool = ({ map, vehicles }: ParkSelectionToolProps): JSX.Element => {
  const datum = useSelector((state: StateType) => state.filter?.datum ?? null);
  const [polygon, setPolygon] = useState<Polygon | null>(null);
  const [chartOpen, setChartOpen] = useState(true);

  const handleSelectionChange = useCallback((nextPolygon: Polygon | null) => {
    setPolygon(nextPolygon);
    setChartOpen(true);
  }, []);

  // The card is positioned against the map container, which MapLibre makes
  // the positioned ancestor of everything drawn over the map.
  const container = map?.getContainer?.() ?? null;

  return <>
    <SelectionTool map={map} vehicles={vehicles} onSelectionChange={handleSelectionChange}>
      {polygon && !chartOpen && (
        <button type="button" className="SelectionTool-showChart" onClick={() => setChartOpen(true)}>
          Toon beschikbaarheid
        </button>
      )}
    </SelectionTool>
    {polygon && chartOpen && container && createPortal(
      <VoiAvailabilityChart
        polygon={polygon}
        selectedCapturedAt={datum}
        onClose={() => setChartOpen(false)}
      />,
      container
    )}
  </>;
};

export default ParkSelectionTool;
