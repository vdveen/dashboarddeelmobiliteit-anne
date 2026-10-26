// Trips loaded for the Drukte view of the Aanbod map. Not persisted.
const initialState = {
  // Identifies the request the data belongs to (see useDrukteData)
  key: null,
  // 'loading', 'ready' or 'error'
  status: null,
  error: null,
  window: null,
  ends: null,
  starts: null,
  baseline: null,
  // Parked Voi vehicles per hub or place, from the snapshot archive
  occupancy_key: null,
  occupancy_status: null,
  occupancy_error: null,
  occupancy: null
};

const occupancyInitial = {
  occupancy_key: null, occupancy_status: null, occupancy_error: null, occupancy: null
};

export default function drukte_data(state = initialState, action) {
  switch (action.type) {
    case 'SET_DRUKTE_DATA_LOADING': {
      // Keep the occupancy data: it has its own key
      const { occupancy_key, occupancy_status, occupancy_error, occupancy } = state;
      return { ...initialState, occupancy_key, occupancy_status, occupancy_error, occupancy, key: action.payload, status: 'loading' };
    }
    case 'SET_DRUKTE_OCCUPANCY_LOADING':
      return { ...state, ...occupancyInitial, occupancy_key: action.payload, occupancy_status: 'loading' };
    case 'SET_DRUKTE_OCCUPANCY': {
      if (action.payload.key !== state.occupancy_key) return state;
      return { ...state, occupancy_status: 'ready', occupancy_error: null, occupancy: action.payload.data };
    }
    case 'SET_DRUKTE_OCCUPANCY_ERROR': {
      if (action.payload.key !== state.occupancy_key) return state;
      return { ...state, occupancy_status: 'error', occupancy_error: action.payload.error };
    }
    case 'SET_DRUKTE_DATA': {
      if (action.payload.key !== state.key) return state;
      return { ...state, ...action.payload, status: 'ready', error: null };
    }
    case 'SET_DRUKTE_DATA_ERROR': {
      if (action.payload.key !== state.key) return state;
      return { ...state, status: 'error', error: action.payload.error };
    }
    case 'LOGIN':
    case 'LOGOUT':
      return initialState;
    default:
      return state;
  }
}
