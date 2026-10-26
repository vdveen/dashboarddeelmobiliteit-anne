import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { getAvailableOperators } from '../api/service-areas';
import { loadServiceAreas, splitServiceAreasForMap } from '../helpers/service-areas';
import { getMunicipalityCodes } from '../helpers/regions';
import { buildHubIndex } from '../helpers/parkingCompliance';
import { DISPLAYMODE_PARK } from '../reducers/layers.js';
import { PARKEERWEERGAVE_DRUKTE, PARKEERWEERGAVE_NALEVING } from '../reducers/filter.js';
import { StateType } from '../types/StateType';

/**
 * Loads the hubs of the Parkeerhubs layer for the selected place while the
 * Aanbod map shows Parkeernaleving or Drukte. It loads every operator's hubs, also
 * those excluded in the Aanbieders filter, so switching operators needs no
 * new request.
 */
export const useParkingHubsForCompliance = () => {
  const dispatch = useDispatch();
  const isActive = useSelector((state: StateType) =>
    state.layers?.displaymode === DISPLAYMODE_PARK
    && [PARKEERWEERGAVE_NALEVING, PARKEERWEERGAVE_DRUKTE].includes(state.filter?.parkeerweergave)
    && !!state.authentication?.user_data
  );
  const gebied = useSelector((state: StateType) => state.filter?.gebied || '');
  const loadedGebied = useSelector((state: StateType) => state.parking_hubs?.gebied);

  useEffect(() => {
    if (!isActive || !gebied) return;
    // Loaded, loading or failed for this place; a new place loads again
    if (loadedGebied === gebied) return;

    dispatch({ type: 'SET_PARKING_HUBS_LOADING', payload: gebied });
    (async () => {
      try {
        const available = await getAvailableOperators(gebied);
        if (!available) throw new Error('available_operators failed');
        const operators = available.operators_with_service_area || [];
        const serviceAreas = operators.length ? await loadServiceAreas(gebied, operators) : [];
        // A region selection holds several comma-joined municipality codes
        const codes = getMunicipalityCodes(gebied);
        const { hubs } = splitServiceAreasForMap(serviceAreas.filter((x) => codes.includes(x.municipality)));
        dispatch({ type: 'SET_PARKING_HUBS', payload: { gebied, index: buildHubIndex(hubs.features) } });
      } catch (error) {
        console.error('Unable to load parking hubs', error);
        dispatch({ type: 'SET_PARKING_HUBS_ERROR', payload: gebied });
      }
    })();
  }, [dispatch, isActive, gebied, loadedGebied]);
};
