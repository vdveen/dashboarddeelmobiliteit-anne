/** The exact server request and account own raw poller data. */
export function requestScope(state, requestUrl) {
  return JSON.stringify([
    state.authentication?.user_data?.token || null,
    requestUrl || null,
    state.layers?.displaymode || null,
    !!state.rentals?.csv_data,
  ]);
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
