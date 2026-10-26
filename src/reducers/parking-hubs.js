// Parking hubs for the Parkeernaleving view of the Aanbod map, prepared for
// distance lookups (helpers/parkingCompliance.ts). Not persisted.
const initialState = {
  // Gebied the hubs were loaded for
  gebied: null,
  // 'loading', 'ready' or 'error'
  status: null,
  index: null
};

export default function parking_hubs(state = initialState, action) {
  switch(action.type) {
    case 'SET_PARKING_HUBS_LOADING':
      return { gebied: action.payload, status: 'loading', index: null };
    case 'SET_PARKING_HUBS': {
      if (action.payload.gebied !== state.gebied) return state;
      return { gebied: action.payload.gebied, status: 'ready', index: action.payload.index };
    }
    case 'SET_PARKING_HUBS_ERROR': {
      if (action.payload !== state.gebied) return state;
      return { ...state, status: 'error', index: null };
    }
    case 'LOGIN':
    case 'LOGOUT':
      return initialState;
    default:
      return state;
  }
}
