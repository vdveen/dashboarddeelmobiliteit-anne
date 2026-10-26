const initialState = {
  data: [],
  operatorstats: [],
  parkeerduurstats: null,
  operationalstats: null,
  parkeerafstandstats: null,
}

export default function vehicles(state = initialState, action) {
  switch(action.type) {
    case 'SET_VEHICLES': {
      return {
        data: action.payload,
        operatorstats: [],
        parkeerduurstats: null,
        operationalstats: null,
        parkeerafstandstats: null
      }
    }
    case 'SET_VEHICLES_OPERATORSTATS': {
      return Object.assign({}, state, {
        operatorstats: action.payload
      })
    }
    case 'SET_VEHICLES_PARKEERDUURSTATS': {
      return Object.assign({}, state, {
        parkeerduurstats: action.payload
      })
    }
    case 'SET_VEHICLES_OPERATIONALSTATS': {
      return Object.assign({}, state, {
        operationalstats: action.payload
      })
    }
    case 'SET_VEHICLES_PARKEERAFSTANDSTATS': {
      return Object.assign({}, state, {
        parkeerafstandstats: action.payload
      })
    }
    case 'CLEAR_VEHICLES': {
      return {
        data: [],
        operatorstats: [],
        parkeerduurstats: null,
        operationalstats: null,
        parkeerafstandstats: null
      }
    }
    case 'LOGIN':
    case 'LOGOUT': {
      // console.log('login/logout - reset vehicles data')      
      return initialState;
    }
    
    default:
      return state;
  }
}
