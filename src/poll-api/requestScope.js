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
  // Only supersession suppresses a dispatch. A selection change starts a new
  // request that takes ownership of the channel; comparing against the state at
  // call time would also drop the finally-dispatches that clear `showloading`
  // and set `zones_loaded`, leaving the spinner on screen forever.
  return { getState: () => store.getState(), dispatch: action => {
    if (owners.get(channel) === owner) return store.dispatch(action);
  } };
}
