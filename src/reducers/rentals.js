const initialState = {
  origins: {},
  destinations: {},
  origins_operatorstats: [],
  destinations_operatorstats: [],
  // Imported CSV data ('Ruwe data import'): { fileName, rows, fileRange, range }
  // or null. Ranges are Amsterdam days ({ start, end } as YYYY-MM-DD); the map
  // shows the rows within `range` instead of API data
  csv_data: null
}

export default function rentals(state = initialState, action) {
  switch(action.type) {
    case 'SET_RENTALS_ORIGINS': {
      return Object.assign({}, state, {
        origins: action.payload,
        origins_operatorstats: []
      })
    }
    case 'SET_RENTALS_DESTINATIONS': {
      return Object.assign({}, state, {
        destinations: action.payload,
        destinations_operatorstats: []
      })
    }
    case 'CLEAR_RENTALS_ORIGINS': {
      return Object.assign({}, state, {
        origins: [],
        origins_operatorstats: []
      })
    }
    case 'CLEAR_RENTALS_DESTINATIONS': {
      return Object.assign({}, state, {
        destinations: [],
        destinations_operatorstats: []
      })
    }
    case 'SET_RENTALS_CSV_DATA': {
      return Object.assign({}, state, {
        csv_data: action.payload
      })
    }
    case 'SET_RENTALS_CSV_RANGE': {
      if (!state.csv_data) return state;
      return Object.assign({}, state, {
        csv_data: { ...state.csv_data, range: action.payload }
      })
    }
    case 'CLEAR_RENTALS_CSV_DATA': {
      return Object.assign({}, state, {
        csv_data: null
      })
    }
    case 'LOGIN':
    case 'LOGOUT': {
      // console.log('login/logout - reset rentals data')      
      return initialState;
    }
    case 'SET_RENTALS_ORIGINS_OPERATORSTATS': {
      return Object.assign({}, state, {
        origins_operatorstats: action.payload
      })
    }
    case 'SET_RENTALS_DESTINATIONS_OPERATORSTATS': {
      return Object.assign({}, state, {
        destinations_operatorstats: action.payload
      })
    }
    default:
      return state;
  }
}
