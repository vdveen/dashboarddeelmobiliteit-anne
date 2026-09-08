/** Server selection and account own raw poller data. Display-only filters do not. */
export function requestScope(state) {
  const { aanbiedersexclude, parkeerduurexclude, afstandexclude, non_operational_only, visible, ...serverFilter } = state.filter || {};
  return JSON.stringify([state.authentication?.user_data?.token || null,
    state.authentication?.user_data?.acl || null, serverFilter, state.layers?.displaymode,
    state.metadata?.aclOperators, state.metadata?.gebieden, state.metadata?.zones,
    state.metadata?.aanbieders, state.metadata?.vehicle_types, !!state.rentals?.csv_data]);
}
