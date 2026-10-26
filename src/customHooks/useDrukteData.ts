import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { createFilterparameters } from '../poll-api/pollTools.js';
import { getAclOrganisationType } from '../helpers/authentication.js';
import { BASELINE_WEEKS, RideEvent, isOccupancyMaatstaf, occupancyZones } from '../helpers/rideEndPeaks';
import { fetchHubCounts } from '../api/voiHubCounts';
import { DISPLAYMODE_OTHER, DISPLAYMODE_PARK } from '../reducers/layers.js';
import { PARKEERWEERGAVE_DRUKTE } from '../reducers/filter.js';
import { selectDrukteSettings } from '../reducers/drukte.js';
import { StateType } from '../types/StateType';

const HOUR_MS = 3600 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;

const isoSeconds = (time: number) => new Date(time).toISOString().replace(/\.\d+Z$/, 'Z');

const toEvents = (rows: any[] | undefined): RideEvent[] =>
  (rows || []).flatMap((row) => {
    const time = Date.parse(row.event_time || row.arrival_time || row.departure_time);
    const lat = row.location?.latitude;
    const lon = row.location?.longitude;
    if (!Number.isFinite(time) || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return [{ operator: row.system_id || '', lon, lat, time }];
  });

/**
 * Loads the trips for the Drukte view of the Aanbod map: the trip ends of the
 * period before the Aanbod date, and only when the measure needs them the
 * trip ends of the four weeks before (Boven normaal) or the trip starts of
 * the period (Netto aankomst). The Aanbieders filter is applied client-side,
 * so switching operators needs no new request.
 */
export const useDrukteData = () => {
  const dispatch = useDispatch();
  const isActive = useSelector((state: StateType) =>
    state.layers?.displaymode === DISPLAYMODE_PARK
    && state.filter?.parkeerweergave === PARKEERWEERGAVE_DRUKTE
    && !!state.authentication?.user_data?.token
  );
  const token = useSelector((state: StateType) => state.authentication?.user_data?.token || null);
  const acl = useSelector((state: StateType) => state.authentication?.user_data?.acl);
  const filter = useSelector((state: StateType) => state.filter);
  const metadata = useSelector((state: StateType) => state.metadata);
  const { periode, maatstaf } = useSelector(selectDrukteSettings);
  const loadedKey = useSelector((state: StateType) => state.drukte_data?.key || null);

  const withBaseline = maatstaf === 'boven_normaal';
  const withStarts = maatstaf === 'netto';

  // Whole minutes, so a re-render does not refetch
  const end = Math.floor((filter?.datum ? Date.parse(filter.datum) : Date.now()) / 60000) * 60000;
  const start = end - periode * HOUR_MS;
  const params = isActive && metadata?.zones_loaded !== false
    ? createFilterparameters(DISPLAYMODE_OTHER, { ...filter, aanbiedersexclude: '' }, metadata, {
        is_logged_in: true,
        organisationType: getAclOrganisationType(acl)
      }).join('&')
    : null;
  const key = params === null || !filter?.gebied
    ? null
    : JSON.stringify([params, start, end, withBaseline, withStarts]);

  useEffect(() => {
    if (!key || !token || !params || key === loadedKey) return;
    dispatch({ type: 'SET_DRUKTE_DATA_LOADING', payload: key });
    const controller = new AbortController();

    const fetchTrips = async (type: 'origins' | 'destinations', from: number, to: number) => {
      const search = new URLSearchParams(params);
      search.set('start_time', isoSeconds(from));
      search.set('end_time', isoSeconds(to));
      const response = await fetch(`${process.env.REACT_APP_MAIN_API_URL}/dashboard-api/v2/trips/${type}?${search}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Ritten konden niet worden geladen (HTTP ${response.status}).`);
      const data = await response.json();
      const rows = data?.[`trip_${type}`];
      if (!Array.isArray(rows)) throw new Error('Ongeldig antwoord voor ritten.');
      return toEvents(rows);
    };

    (async () => {
      try {
        const [ends, baseline, starts] = await Promise.all([
          fetchTrips('destinations', start, end),
          withBaseline ? fetchTrips('destinations', start - BASELINE_WEEKS * WEEK_MS, start) : Promise.resolve(null),
          withStarts ? fetchTrips('origins', start, end) : Promise.resolve(null)
        ]);
        dispatch({ type: 'SET_DRUKTE_DATA', payload: { key, window: { start, end }, ends, baseline, starts } });
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        console.error('Unable to load drukte trips', error);
        dispatch({ type: 'SET_DRUKTE_DATA_ERROR', payload: { key, error: error?.message || String(error) } });
      }
    })();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, key, token]);
};

/**
 * Loads the parked Voi vehicles per hub or place from the snapshot archive,
 * for the occupancy measures of the Drukte view (Meeste voertuigen, Tijd te
 * vol), over the same period as the trips.
 */
export const useDrukteOccupancyData = () => {
  const dispatch = useDispatch();
  const { periode, maatstaf, eenheid } = useSelector(selectDrukteSettings);
  const isActive = useSelector((state: StateType) =>
    state.layers?.displaymode === DISPLAYMODE_PARK
    && state.filter?.parkeerweergave === PARKEERWEERGAVE_DRUKTE
    && !!state.authentication?.user_data?.token
  ) && isOccupancyMaatstaf(maatstaf) && eenheid !== 'buiten';
  const gebied = useSelector((state: StateType) => state.filter?.gebied || '');
  const datum = useSelector((state: StateType) => state.filter?.datum || '');
  const hubIndex = useSelector((state: StateType) =>
    state.parking_hubs?.gebied === gebied && state.parking_hubs?.status === 'ready' ? state.parking_hubs.index : null
  );
  const loadedKey = useSelector((state: StateType) => state.drukte_data?.occupancy_key || null);

  const end = Math.floor((datum ? Date.parse(datum) : Date.now()) / 60000) * 60000;
  const start = end - periode * HOUR_MS;
  const key = isActive && hubIndex ? JSON.stringify([gebied, eenheid, start, end]) : null;
  // The hubs belong to the gebied in the key, so the effect follows the key alone
  const hubIndexRef = useRef(hubIndex);
  hubIndexRef.current = hubIndex;

  useEffect(() => {
    if (!key || !hubIndexRef.current || key === loadedKey) return;
    const zones = occupancyZones(hubIndexRef.current, eenheid);
    dispatch({ type: 'SET_DRUKTE_OCCUPANCY_LOADING', payload: key });
    if (zones.length === 0) {
      dispatch({ type: 'SET_DRUKTE_OCCUPANCY', payload: { key, data: { captured_at: [], zones: {} } } });
      return;
    }
    const controller = new AbortController();
    fetchHubCounts(zones, start, end, controller.signal)
      .then((data) => dispatch({ type: 'SET_DRUKTE_OCCUPANCY', payload: { key, data } }))
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        console.error('Unable to load hub counts', error);
        dispatch({ type: 'SET_DRUKTE_OCCUPANCY_ERROR', payload: { key, error: error?.message || String(error) } });
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, key]);
};
