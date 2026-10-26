import { useSelector } from 'react-redux';

import { StateType } from '../../types/StateType';
import { FilteritemMarkersParkeerafstand } from './FilteritemMarkers.jsx';
import { HUB_MARGIN_M, PARKEERAFSTAND_BANDS } from '../../helpers/parkingCompliance';
import { getPrettyProviderName } from '../../helpers/providers.js';

const nl = (n: number) => n.toLocaleString('nl-NL');

const formatPercentage = (value: number) =>
  `${value.toLocaleString('nl-NL', { maximumFractionDigits: value > 0 && value < 10 ? 1 : 0 })}%`;

// "net buiten, buiten of ver buiten"
const joinOr = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} of ${items[items.length - 1]}`;

/**
 * Parkeernaleving on the Aanbod map: the share of measured bikes parked in
 * the selected distance bands outside a parking hub, and the band selector.
 */
export default function FilteritemParkeernaleving() {
  const gebied = useSelector((state: StateType) => state.filter?.gebied || '');
  const parkeerafstandexclude = useSelector((state: StateType) => state.filter?.parkeerafstandexclude || '');
  const stats = useSelector((state: StateType) => state.vehicles?.parkeerafstandstats || null);
  const hubsStatus = useSelector((state: StateType) =>
    state.parking_hubs?.gebied === gebied ? state.parking_hubs?.status : null
  );
  const hubIndex = useSelector((state: StateType) =>
    state.parking_hubs?.gebied === gebied ? state.parking_hubs?.index : null
  );

  if (!gebied) {
    return <p className="text-xs text-gray-500">Kies een plaats om de parkeernaleving te zien.</p>;
  }
  if (hubsStatus === 'error') {
    return <p className="text-xs text-gray-500">De parkeerhubs konden niet worden geladen.</p>;
  }
  if (hubsStatus !== 'ready') {
    return <p className="text-xs text-gray-500">Parkeerhubs laden…</p>;
  }

  const hubCounts: [string, number][] = hubIndex
    ? Array.from(hubIndex.operators.entries() as Iterable<[string, { hubs: unknown[] }]>)
        .map(([operator, entry]) => [operator, entry.hubs.length] as [string, number])
    : [];
  if (hubCounts.length === 0) {
    return <p className="text-xs text-gray-500">Geen aanbieder publiceert parkeerhubs in dit gebied.</p>;
  }

  const excluded = parkeerafstandexclude.split(',');
  const selectedOutside = PARKEERAFSTAND_BANDS.filter(b => b.outside && !excluded.includes(String(b.id)));
  const total = stats ? PARKEERAFSTAND_BANDS.reduce((sum, b) => sum + (stats[b.id] || 0), 0) : 0;
  const wrong = stats ? selectedOutside.reduce((sum, b) => sum + (stats[b.id] || 0), 0) : 0;
  const percentage = total > 0 ? (100 * wrong) / total : 0;

  return (
    <div>
      {stats && (
        <div className="mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color: wrong > 0 ? '#B0001C' : '#343E47' }}>
              {total > 0 ? formatPercentage(percentage) : '-'}
            </span>
            <span className="text-sm">verkeerd geparkeerd</span>
          </div>
          <p className="text-xs mt-1">
            {total === 0 && 'Geen fietsen gevonden van aanbieders met parkeerhubs.'}
            {total > 0 && selectedOutside.length === 0 && 'Kies hieronder een of meer afstanden buiten een hub.'}
            {total > 0 && selectedOutside.length > 0 && <>
              <b>{nl(wrong)}</b> van de <b>{nl(total)}</b> fietsen
              {' '}{wrong === 1 ? 'staat' : 'staan'} {joinOr(selectedOutside.map(b => b.name.toLowerCase()))} een parkeerhub.
            </>}
          </p>
        </div>
      )}

      <FilteritemMarkersParkeerafstand />

      <p className="text-xs text-gray-500 mt-2">
        Afstand tot de dichtstbijzijnde parkeerhub van de eigen aanbieder (laag Parkeerhubs).
        Binnen {HUB_MARGIN_M} m telt als in een hub. Parkeerhubs van {hubCounts
          .map(([operator, count]) => `${getPrettyProviderName(operator) || operator} (${nl(count)})`)
          .join(', ')}.
        {stats && stats.unmeasured > 0 && <>
          {' '}{nl(stats.unmeasured)} {stats.unmeasured === 1 ? 'voertuig telt' : 'voertuigen tellen'} niet
          mee: geen fiets, of de aanbieder publiceert hier geen parkeerhubs.
        </>}
      </p>
    </div>
  );
}
