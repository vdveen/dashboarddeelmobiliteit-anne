import { useDispatch } from 'react-redux';
import './css/FilteritemHerkomstBestemming.css';

import { DrukteEenheid, DrukteMaatstaf, DrukteSpot, kpiValue } from '../../helpers/rideEndPeaks';
import {
  DRUKTE_DRUK_PER_UUR,
  DRUKTE_EENHEDEN,
  DRUKTE_MAATSTAVEN,
  DRUKTE_MINIMAAL,
  DRUKTE_PERIODES,
  DRUKTE_STRALEN
} from '../../reducers/drukte.js';
import {
  EENHEID_LABELS,
  KIND_COLORS,
  MAATSTAF_LABELS,
  describeSpot,
  formatKpi,
  formatPeakHour,
  kindLabel,
  spotName,
  useDrukteView,
  useSpotNames
} from '../Drukte/useDrukteSpots';
import { getPrettyProviderName } from '../../helpers/providers.js';

// This many spots in the list; the export has them all
const LIST_MAX = 40;

const nl = (n: number) => n.toLocaleString('nl-NL');

interface SegmentedProps<T> {
  label: string;
  options: { value: T; name: string }[];
  value: T;
  onChange: (value: T) => void;
}

function Segmented<T extends string | number>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="filter-herkomst-bestemming-container mb-2">
      <div className="filter-herkomst-bestemming-box-row" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={option.value === value}
            style={{ width: `${100 / options.length}%`, minHeight: 32 }}
            className={'filter-herkomst-bestemming-button' + (option.value === value ? ' filter-herkomst-bestemming-button-active' : '')}
            onClick={() => onChange(option.value)}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const selectClass = 'border border-gray-300 rounded px-1 py-0.5 text-sm bg-white';

const flyTo = (spot: DrukteSpot) => {
  const map = (window as any).ddMap;
  if (!map) return;
  map.flyTo({ center: [spot.lon, spot.lat], zoom: Math.max(map.getZoom(), 16), duration: 600 });
};

const HourBars = ({ spot }: { spot: DrukteSpot }) => {
  const max = Math.max(...spot.hourOfDay) || 1;
  return (
    <div aria-hidden="true" className="mt-1">
      <div className="flex items-end gap-px" style={{ height: 18 }}>
        {spot.hourOfDay.map((x, h) => (
          <i key={h} className="flex-1 block" style={{ height: `${Math.round((x / max) * 100)}%`, background: '#9CA3AF', minHeight: x ? 1 : 0 }} />
        ))}
      </div>
      <div className="flex justify-between text-gray-400" style={{ fontSize: 9 }}>
        <span>0 uur</span><span>12</span><span>23</span>
      </div>
    </div>
  );
};

const exportCsv = (spots: DrukteSpot[], names: Record<string, string>, maatstaf: DrukteMaatstaf, hours: number) => {
  const header: (string | number)[] = [
    'plek', 'soort', 'lat', 'lon', MAATSTAF_LABELS[maatstaf].name.toLowerCase(), 'ritten geëindigd',
    'piekuur', 'ritten in piekuur', 'uren druk', 'normaal', 'ritten begonnen', 'per aanbieder'
  ];
  const rows: (string | number)[][] = [header].concat(spots.map((s): (string | number)[] => [
    spotName(s, names),
    kindLabel(s),
    s.lat.toFixed(6),
    s.lon.toFixed(6),
    String(Number(kpiValue(s, maatstaf, hours).toFixed(3))).replace('.', ','),
    s.ends,
    formatPeakHour(s),
    s.peakHour?.count || 0,
    s.busyHours,
    s.expected === null ? '' : s.expected.toFixed(1).replace('.', ','),
    s.starts === null ? '' : s.starts,
    Object.entries(s.perOperator).map(([op, n]) => `${getPrettyProviderName(op) || op} ${n}`).join(', ')
  ]));
  const csv = '﻿' + rows.map((r) => r.map((c) => {
    const v = String(c);
    return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `drukte_${maatstaf}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};

/**
 * Drukte on the Aanbod map: where trips ended in the period before the
 * Aanbod date, ranked by the chosen measure, per hub, place or spot outside
 * the hubs.
 */
export default function FilteritemDrukte() {
  const dispatch = useDispatch();
  const view = useDrukteView();
  const { settings, result } = view;
  const { maatstaf, eenheid } = settings;
  const shown = view.spots.slice(0, LIST_MAX);
  const names = useSpotNames(shown);
  const set = (payload: object) => dispatch({ type: 'SET_DRUKTE_SETTING', payload });

  const unitNoun = eenheid === 'hubs' ? 'hubs' : eenheid === 'plekken' ? 'plekken' : 'plekken buiten de hubs';

  return (
    <div>
      <Segmented
        label="Periode"
        options={DRUKTE_PERIODES.map((p) => ({ value: p.uren, name: p.label }))}
        value={settings.periode}
        onChange={(periode) => set({ periode })}
      />
      <p className="text-xs text-gray-500 mb-3">Ritten die eindigden in de periode tot de gekozen datum en tijd.</p>

      <Segmented
        label="Eenheid"
        options={DRUKTE_EENHEDEN.map((value) => ({ value: value as DrukteEenheid, name: EENHEID_LABELS[value] }))}
        value={eenheid}
        onChange={(value) => set({ eenheid: value })}
      />

      <label className="flex items-center gap-2 text-sm mt-3">
        <span>Maatstaf</span>
        <select className={selectClass} value={maatstaf} onChange={(e) => set({ maatstaf: e.target.value })}>
          {DRUKTE_MAATSTAVEN.map((m) => <option key={m} value={m}>{MAATSTAF_LABELS[m].name}</option>)}
        </select>
      </label>
      <p className="text-xs text-gray-500 mt-1">{MAATSTAF_LABELS[maatstaf].uitleg}</p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm mt-2">
        <span>Minimaal</span>
        <select className={selectClass} value={settings.minimaal} onChange={(e) => set({ minimaal: Number(e.target.value) })}>
          {DRUKTE_MINIMAAL.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>{settings.minimaal === 1 ? 'rit' : 'ritten'}</span>
        {eenheid === 'buiten' && (
          <span className="whitespace-nowrap">
            binnen{' '}
            <select className={selectClass} value={settings.straal} onChange={(e) => set({ straal: Number(e.target.value) })}>
              {DRUKTE_STRALEN.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {' '}m
          </span>
        )}
      </div>
      {maatstaf === 'uren_druk' && (
        <div className="flex items-center gap-2 text-sm mt-2">
          <span>Druk vanaf</span>
          <select className={selectClass} value={settings.druk_per_uur} onChange={(e) => set({ druk_per_uur: Number(e.target.value) })}>
            {DRUKTE_DRUK_PER_UUR.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>ritten per uur</span>
        </div>
      )}

      <div className="mt-4">
        {view.status === 'no-gebied' && <p className="text-xs text-gray-500">Kies een plaats om de drukte te zien.</p>}
        {view.status === 'loading' && <p className="text-xs text-gray-500">Ritten en parkeerhubs laden…</p>}
        {view.status === 'error' && <p className="text-xs text-red-700">{view.error}</p>}
        {view.status === 'no-hubs' && (
          <p className="text-xs text-gray-500">Geen aanbieder publiceert parkeerhubs in dit gebied. Kies Buiten hubs.</p>
        )}
        {view.status === 'ready' && result && <>
          <p className="text-sm">
            <b>{nl(view.spots.length)}</b> {unitNoun}. Van de <b>{nl(result.totalEnds)}</b> ritten
            {' '}eindigden er <b>{nl(result.assignedEnds)}</b> in {eenheid === 'hubs' ? 'een hub' : eenheid === 'plekken' ? 'een plek' : 'zo\'n plek'}.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {eenheid === 'hubs' && 'Een rit telt voor een hub van de eigen aanbieder binnen 20 m.'}
            {eenheid === 'plekken' && 'Een plek is een groep hubs die hooguit 500 m uit elkaar liggen, van alle aanbieders. Een rit telt voor de plek van de dichtstbijzijnde hub van de eigen aanbieder binnen 500 m.'}
            {eenheid === 'buiten' && `Ritten verder dan 20 m van een hub van de eigen aanbieder, gegroepeerd zoals in de Groningse drukte-kaart: minstens ${settings.minimaal} binnen ${settings.straal} m.`}
            {eenheid !== 'buiten' && result.endsWithoutHubs > 0 && ` ${nl(result.endsWithoutHubs)} ritten zijn van aanbieders zonder parkeerhubs hier; die staan onder Buiten hubs.`}
          </p>

          <ol className="mt-3 flex flex-col gap-1">
            {shown.map((spot, i) => (
              <li key={spot.id}>
                <button
                  type="button"
                  aria-current={settings.selected === spot.id}
                  onClick={() => { dispatch({ type: 'SET_DRUKTE_SELECTED', payload: spot.id }); flyTo(spot); }}
                  className={'w-full text-left flex gap-2 p-1 rounded border ' + (settings.selected === spot.id ? 'border-sky-500 bg-sky-50' : 'border-transparent hover:bg-gray-50')}
                >
                  <span
                    className="shrink-0 rounded-full text-white text-xs font-bold flex items-center justify-center"
                    style={{ background: KIND_COLORS[spot.kind], minWidth: 34, height: 34, padding: '0 4px' }}
                  >
                    {formatKpi(spot, maatstaf, result.hours)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {spotName(spot, names) || `Plek ${i + 1}`}
                    </span>
                    <small className="block text-xs text-gray-600">
                      {kindLabel(spot)}. {describeSpot(spot, maatstaf, result.hours, settings.druk_per_uur)}
                    </small>
                    <HourBars spot={spot} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-gray-500 mt-2">
            {view.spots.length > LIST_MAX && `De lijst toont de ${LIST_MAX} drukste; de export bevat ze allemaal. `}
            {view.spots.length === 0 && 'Geen plekken met deze instellingen.'}
          </p>
          <button
            type="button"
            disabled={view.spots.length === 0}
            onClick={() => exportCsv(view.spots, names, maatstaf, result.hours)}
            className="mt-2 text-sm border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"
          >
            Exporteer lijst
          </button>
        </>}
      </div>
    </div>
  );
}
