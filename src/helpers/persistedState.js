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
