import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import {
  DrukteMaatstaf,
  DrukteResult,
  DrukteSpot,
  computeDrukte,
  kpiValue,
  sortSpots
} from '../../helpers/rideEndPeaks';
import { selectDrukteSettings } from '../../reducers/drukte.js';
import { StateType } from '../../types/StateType';

export const MAATSTAF_LABELS: Record<DrukteMaatstaf, { name: string; uitleg: string }> = {
  ritten: {
    name: 'Ritten geëindigd',
    uitleg: 'Alle ritten die in de periode hier eindigden.'
  },
  piekuur: {
    name: 'Piekuur',
    uitleg: 'Het hoogste aantal ritten dat in één klokuur hier eindigde.'
  },
  uren_druk: {
    name: 'Uren druk',
    uitleg: 'Het deel van de uren waarin minstens het gekozen aantal ritten hier eindigde.'
  },
  boven_normaal: {
    name: 'Boven normaal',
    uitleg: 'Ritten in de periode min het aantal dat je verwacht uit dezelfde uren van de vier weken ervoor.'
  },
  netto: {
    name: 'Netto aankomst',
    uitleg: 'Ritten die hier eindigden min ritten die hier begonnen: waar voertuigen zich ophopen.'
  }
};

export const EENHEID_LABELS = {
  hubs: 'Hubs',
  plekken: 'Plekken',
  buiten: 'Buiten hubs'
};

export const KIND_COLORS = {
  hub: '#07B26B',
  plek: '#2563EB',
  buiten: '#EC6A12'
};

const nl = (n: number, digits = 0) =>
  n.toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const signed = (n: number) => (n > 0 ? `+${nl(n)}` : n < 0 ? `−${nl(-n)}` : '0');

/** The measure as a short number for the map and the list. */
export const formatKpi = (spot: DrukteSpot, maatstaf: DrukteMaatstaf, hours: number): string => {
  const value = kpiValue(spot, maatstaf, hours);
  if (maatstaf === 'uren_druk') return `${nl(value * 100)}%`;
  if (maatstaf === 'boven_normaal' || maatstaf === 'netto') return signed(Math.round(value));
  return nl(value);
};

const hourFormat = new Intl.DateTimeFormat('nl-NL', {
  timeZone: 'Europe/Amsterdam', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
});
const hourOnly = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' });

export const formatPeakHour = (spot: DrukteSpot) =>
  spot.peakHour
    ? `${hourFormat.format(new Date(spot.peakHour.start))}-${hourOnly.format(new Date(spot.peakHour.start + 3600 * 1000))}`
    : '';

/** One line with the numbers behind the measure. */
export const describeSpot = (spot: DrukteSpot, maatstaf: DrukteMaatstaf, hours: number, drukPerUur: number): string => {
  const parts = [`${nl(spot.ends)} ${spot.ends === 1 ? 'rit' : 'ritten'}`];
  if (spot.peakHour) parts.push(`piek ${nl(spot.peakHour.count)} op ${formatPeakHour(spot)}`);
  if (maatstaf === 'uren_druk') parts.push(`${nl(spot.busyHours)} van ${nl(hours)} uur met ${drukPerUur} of meer`);
  if (spot.expected !== null) parts.push(`normaal ${nl(spot.expected, spot.expected < 10 ? 1 : 0)}`);
  if (spot.starts !== null) parts.push(`${nl(spot.starts)} begonnen`);
  return parts.join(', ');
};

export const kindLabel = (spot: DrukteSpot) =>
  spot.kind === 'hub' ? 'Hub' : spot.kind === 'plek' ? `Plek, ${spot.hubCount} ${spot.hubCount === 1 ? 'hub' : 'hubs'}` : 'Buiten hubs';

export interface DrukteView {
  // 'no-gebied', 'loading', 'error', 'no-hubs' or 'ready'
  status: string;
  error: string | null;
  result: DrukteResult | null;
  spots: DrukteSpot[];
  maxValue: number;
}

// The panel and the map layer both use the result: compute it once per input
let lastInputs: unknown[] | null = null;
let lastResult: DrukteResult | null = null;
const computeOnce = (inputs: unknown[], compute: () => DrukteResult) => {
  if (lastInputs && inputs.length === lastInputs.length && inputs.every((x, i) => x === (lastInputs as unknown[])[i])) {
    return lastResult as DrukteResult;
  }
  lastInputs = inputs;
  lastResult = compute();
  return lastResult;
};

export const useDrukteView = (): DrukteView & { settings: ReturnType<typeof selectDrukteSettings> } => {
  const settings = useSelector(selectDrukteSettings);
  const gebied = useSelector((state: StateType) => state.filter?.gebied || '');
  const aanbiedersexclude = useSelector((state: StateType) => state.filter?.aanbiedersexclude || '');
  const data = useSelector((state: StateType) => state.drukte_data);
  const hubsStatus = useSelector((state: StateType) =>
    state.parking_hubs?.gebied === gebied ? state.parking_hubs?.status : null
  );
  const hubIndex = useSelector((state: StateType) =>
    state.parking_hubs?.gebied === gebied ? state.parking_hubs?.index : null
  );

  return useMemo(() => {
    const empty = { error: null, result: null, spots: [], maxValue: 0, settings };
    if (!gebied) return { ...empty, status: 'no-gebied' };
    if (hubsStatus === 'error') return { ...empty, status: 'error', error: 'De parkeerhubs konden niet worden geladen.' };
    if (data?.status === 'error') return { ...empty, status: 'error', error: data.error };
    if (hubsStatus !== 'ready' || data?.status !== 'ready' || !hubIndex) return { ...empty, status: 'loading' };
    if (hubIndex.operators.size === 0 && settings.eenheid !== 'buiten') return { ...empty, status: 'no-hubs' };

    const { eenheid, minimaal, straal, druk_per_uur, maatstaf } = settings;
    const result = computeOnce(
      [hubIndex, data.ends, data.starts, data.baseline, data.window, eenheid, minimaal, straal, druk_per_uur, aanbiedersexclude],
      () => computeDrukte({
        index: hubIndex,
        ends: data.ends,
        starts: data.starts,
        baseline: data.baseline,
        window: data.window,
        eenheid,
        minimaal,
        straal,
        drukPerUur: druk_per_uur,
        excludedOperators: aanbiedersexclude.split(',').filter(Boolean)
      })
    );
    const spots = sortSpots(result.spots, maatstaf, result.hours);
    const maxValue = spots.reduce((m, s) => Math.max(m, kpiValue(s, maatstaf, result.hours)), 0);
    return { status: 'ready', error: null, result, spots, maxValue, settings };
  }, [settings, gebied, aanbiedersexclude, data, hubsStatus, hubIndex]);
};

// ---------- Street names (PDOK Locatieserver, reverse geocoding) ----------

const nameCache = new Map<string, string>();
const nameKey = (spot: DrukteSpot) => `${spot.lat.toFixed(4)},${spot.lon.toFixed(4)}`;

export const spotName = (spot: DrukteSpot, names: Record<string, string>) =>
  names[nameKey(spot)] || nameCache.get(nameKey(spot)) || '';

/** Looks up a street name for each spot, four at a time, like Groningen's tool. */
export const useSpotNames = (spots: DrukteSpot[]): Record<string, string> => {
  const [names, setNames] = useState<Record<string, string>>({});
  const keys = spots.map(nameKey).join('|');

  useEffect(() => {
    let cancelled = false;
    const todo = spots.filter((s) => !nameCache.has(nameKey(s)));
    (async () => {
      while (todo.length && !cancelled) {
        const batch = todo.splice(0, 4);
        await Promise.all(batch.map(async (spot) => {
          try {
            const response = await fetch(
              `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?type=adres&rows=1&fl=straatnaam,huis_nlt,weergavenaam&lat=${spot.lat}&lon=${spot.lon}`
            );
            const doc = (await response.json())?.response?.docs?.[0];
            if (doc) {
              nameCache.set(nameKey(spot), doc.straatnaam
                ? `Bij ${doc.straatnaam}${doc.huis_nlt ? ` ${doc.huis_nlt}` : ''}`
                : doc.weergavenaam);
            }
          } catch (e) {
            // No name: the list shows a number instead
          }
        }));
        if (!cancelled) setNames(Object.fromEntries(nameCache));
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  return names;
};
