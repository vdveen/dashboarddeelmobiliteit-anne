/** Server selection and account own raw poller data. Display-only filters do not. */
export function requestScope(state) {
  const { aanbiedersexclude, parkeerduurexclude, afstandexclude, non_operational_only, visible, ...serverFilter } = state.filter || {};
  return JSON.stringify([state.authentication?.user_data?.token || null,
    state.authentication?.user_data?.acl || null, serverFilter, state.layers?.displaymode,
    state.metadata?.aclOperators, state.metadata?.gebieden, state.metadata?.zones,
    state.metadata?.aanbieders, state.metadata?.vehicle_types, !!state.rentals?.csv_data]);
}

const metadataOwners = new WeakMap();
/** Suppress stale metadata dispatches without changing the Redux store itself. */
export function scopedMetadataStore(store, channel) {
  if (!store) return store;
  const owners = metadataOwners.get(store) || new Map();
  metadataOwners.set(store, owners);
  const owner = Symbol();
  owners.set(channel, owner);
  const selection = () => {
    const state = store.getState();
    return JSON.stringify([state.authentication?.user_data?.token, state.filter?.gebied,
      state.filter?.zones, state.layers?.displaymode]);
  };
  const initial = selection();
  return { getState: () => store.getState(), dispatch: action => {
    if (owners.get(channel) === owner && selection() === initial) return store.dispatch(action);
  } };
}
