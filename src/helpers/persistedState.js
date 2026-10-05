import {
  DISPLAYMODE_RENTALS,
  DISPLAYMODE_VERHUURDATA_CLUSTERS,
  DISPLAYMODE_VERHUURDATA_VOERTUIGEN
} from '../reducers/layers';

/** Keep account-owned state only when a persisted login still has a token. */
export function validatePersistedState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return {};
  const userData = state.authentication?.user_data;
  if (!userData?.token) {
    const publicState = state.filter ? { filter: state.filter } : {};
    return state.authentication?.user_data
      ? { ...publicState, authentication: { user_data: null } }
      : publicState;
  }
  return state;
}

/**
 * Clusters are the standard rentals view. Moves saved layers that still have
 * the previous default (individual rental vehicles) to clusters, in place.
 */
export function migrateRentalsDefaultToClusters(layers) {
  if (!layers) return;
  if (layers.view_rentals === DISPLAYMODE_VERHUURDATA_VOERTUIGEN) {
    layers.view_rentals = DISPLAYMODE_VERHUURDATA_CLUSTERS;
  }
  const rentalsLayers = layers.active_data_layers?.[DISPLAYMODE_RENTALS];
  if (
    Array.isArray(rentalsLayers)
    && rentalsLayers.length === 1
    && rentalsLayers[0] === DISPLAYMODE_VERHUURDATA_VOERTUIGEN
  ) {
    layers.active_data_layers[DISPLAYMODE_RENTALS] = [DISPLAYMODE_VERHUURDATA_CLUSTERS];
  }
}
