import { requestScope } from './requestScope';
import moment from 'moment';
import {
  createFilterparameters,
  convertDurationToBin,
  abortableFetch
} from './pollTools.js';
import { getAclOrganisationType, isLoggedIn, isAdmin } from '../helpers/authentication.js';
import { DISPLAYMODE_PARK } from '../reducers/layers.js';
import {
  OPERATIONAL_STATUS_ALL,
  OPERATIONAL_STATUS_NON_OPERATIONAL,
  OPERATIONAL_STATUS_OPERATIONAL
} from '../reducers/filter.js';
import {shouldFetchVehicles} from './pollTools.js';

var store_parkingdata;
var timerid_parkingdata;

// theFetch: Variabele used for managing fetch calls
let theFetch = null;

// Identity of the request currently in flight, including its account.
let theFetchScope = null;

// Variable to keep track of vehicles response
// Only do a new fetch() if needed
let activeVehicles;

// Variable to keep track of filter changes
// Only do a new fetch() if needed
let existingFilter;
let activeScope;

// Does a vehicle pass the operational_status filter of the Aanbod map?
// Vehicles without a known status count as operational, like the map icons do.
export const passesOperationalStatusFilter = (operationalStatus, vehicle) => {
  const isNonOperational = vehicle.is_non_operational === true;
  switch(operationalStatus) {
    case OPERATIONAL_STATUS_NON_OPERATIONAL: return isNonOperational;
    case OPERATIONAL_STATUS_OPERATIONAL: return ! isNonOperational;
    default: return true;
  }
}

const processVehiclesResult = (state, vehicles) => {
  activeVehicles = vehicles;

  let geoJson = {
   "type":"FeatureCollection",
   "features":[]
  }
  
  let operatorcolors = {};
  let operatorstats = {}
  state.metadata.aanbieders.forEach(o => {
    operatorcolors[o.system_id || o.value]=o.color;
    operatorstats[o.system_id || o.value]=0;
  });

  // Number of vehicles per parkeerduur bin (= per marker color), used for the
  // counts in the Parkeerduur legend. The parkeerduur filter itself is *not*
  // applied here, so excluding a bin doesn't blank out its own count.
  let parkeerduurstats = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0};

  // Number of vehicles per operational status, used for the counts in the
  // Defecte voertuigen filter. Like parkeerduurstats, this filter's own
  // selection is *not* applied, so 'all' is the total of the other two.
  let operationalstats = {
    [OPERATIONAL_STATUS_ALL]: 0,
    [OPERATIONAL_STATUS_NON_OPERATIONAL]: 0,
    [OPERATIONAL_STATUS_OPERATIONAL]: 0
  };

  var start_time = moment(state.filter.datum);
  const start_time_ms = start_time.valueOf();

  // Get list of providers to exclude
  const aanbiedersexclude = state.filter.aanbiedersexclude.split(",") || [];
  // Get parkeerduur length to exclude
  const parkeerduurexclude = state.filter.parkeerduurexclude.split(",") || [];
  const operationalStatus = state.filter.operational_status || OPERATIONAL_STATUS_ALL;
  const loggedIn = isLoggedIn(state);

  vehicles.forEach(v => {
    let in_public_space_since = loggedIn ? v.start_time : v.in_public_space_since;

    // Plain Date math instead of constructing a moment per vehicle (~10x
    // faster over 25k+ vehicles); fall back to moment for exotic date formats
    let since_ms = in_public_space_since ? Date.parse(in_public_space_since) : Date.now();
    if(isNaN(since_ms) && in_public_space_since) {
      since_ms = moment(in_public_space_since).valueOf();
    }
    var minutes = Math.floor((start_time_ms - since_ms) / 60000);
    const duration_bin = convertDurationToBin(minutes);

    let feature = {
       "type":"Feature",
       "properties":{
          "id":v.location.latitude+","+v.location.longitude,
          "vehicle_id":v.bike_id,
          "system_id": v.system_id || v.value,// v.value is used in the public map
          "form_factor": v.form_factor || null,
          "in_public_space_since": in_public_space_since,
          "duration_bin": duration_bin,
          "is_non_operational": v.is_non_operational === true,
       },
       "geometry":{
          "type":"Point",
          "coordinates":[
             v.location.longitude,
             v.location.latitude,
             0.0
          ]
       }
    }

    operatorstats[v.system_id || v.value]+=1;

    // Filter markers
    const passesAanbiedersFilter = aanbiedersexclude.includes(v.system_id || v.value) === false;
    const passesOperationalFilter = passesOperationalStatusFilter(operationalStatus, v);
    const passesParkeerduurFilter = ! loggedIn || ! parkeerduurexclude.includes(duration_bin.toString());

    if(passesAanbiedersFilter && passesOperationalFilter && parkeerduurstats[duration_bin] !== undefined) {
      parkeerduurstats[duration_bin]+=1;
    }

    if(passesAanbiedersFilter && passesParkeerduurFilter) {
      operationalstats[OPERATIONAL_STATUS_ALL]+=1;
      operationalstats[v.is_non_operational === true
        ? OPERATIONAL_STATUS_NON_OPERATIONAL
        : OPERATIONAL_STATUS_OPERATIONAL]+=1;
    }

    let markerVisible = passesAanbiedersFilter && passesOperationalFilter && passesParkeerduurFilter;
    if(markerVisible) {
      geoJson.features.push(feature);
    }
  })
  if(process && process.env.DEBUG) console.log('geoJson in pollParkingData', geoJson)

  // Save vehicles in store
  store_parkingdata.dispatch({
    type: 'SET_VEHICLES',
    payload: geoJson
  })

  // Update operator stats (= number of vehicles per operator) in store
  store_parkingdata.dispatch({
    type: 'SET_VEHICLES_OPERATORSTATS',
    payload: operatorstats
  })

  // Update parkeerduur stats (= number of vehicles per parkeerduur bin) in store
  store_parkingdata.dispatch({
    type: 'SET_VEHICLES_PARKEERDUURSTATS',
    payload: parkeerduurstats
  })

  // Update operational stats (= number of vehicles per operational status) in store
  store_parkingdata.dispatch({
    type: 'SET_VEHICLES_OPERATIONALSTATS',
    payload: operationalstats
  })
}

const requestForState = (state) => {
  const canfetchdata = state && isLoggedIn(state)  && state.filter && state.authentication.user_data.token;
  const is_admin = isAdmin(state);

  // Set API URL
  let url = `${process.env.REACT_APP_MAIN_API_URL}/dashboard-api/public/vehicles_in_public_space`;

  let options = {};
  let filterparams = createFilterparameters(DISPLAYMODE_PARK, state.filter, state.metadata, {
    show_global: is_admin,
    is_logged_in: isLoggedIn(state),
    organisationType: getAclOrganisationType(state.authentication?.user_data?.acl),
  });

  // Set query params for guests
  if(! canfetchdata) {
    if(filterparams.length>0) {
      url += "?" + filterparams.join("&");
    }
  }

  // Set query params for logged in users
  else {
    if (canfetchdata) {
      url = `${process.env.REACT_APP_MAIN_API_URL}/dashboard-api/park_events`;
      if (filterparams.length > 0) {
        url += "?" + filterparams.join("&");
      }
      options = {
        headers: { authorization: "Bearer " + state.authentication.user_data.token }
      };
    }
  }
  return { url, options };
};

const doApiCall = (
  state,
  callback,
  request = requestForState(state)
) => {
  const { url, options } = request;
  const owner = requestScope(state, url);

  // If this account already owns an identical request, let it finish
  // instead of aborting and re-issuing it: the response is processed with the
  // then-current store state, so the result is the same either way.
  if(theFetch && theFetchScope === owner) {
    return;
  }

  // Start loading
  store_parkingdata.dispatch({type: 'SHOW_LOADING', payload: true});

  // Abort previous fetch
  // Info:
  // - https://stackoverflow.com/q/63412985
  // - https://davidwalsh.name/cancel-fetch
  if(theFetch) {
    theFetch.abort();
  }
  // Now do a new fetch
  const thisFetch = abortableFetch(url, options);
  theFetch = thisFetch;
  theFetchScope = owner;
  const isCurrent = () => {
    const currentState = store_parkingdata.getState();
    return theFetch === thisFetch
      && requestScope(currentState, requestForState(currentState).url) === owner;
  };


  // Only clear the in-flight tracking if it still points at this request
  // (a newer request may have replaced it in the meantime)
  const clearFetchTracking = () => {
    if(theFetch === thisFetch) {
      theFetch = null;
      theFetchScope = null;
    }
  };

  thisFetch.ready.then(async response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!isCurrent()) return;
    const values = isLoggedIn(state) ? data.park_events : data.vehicles_in_public_space;
      if (!Array.isArray(values)) throw new Error('Invalid vehicle response');
      callback(store_parkingdata.getState(), values);
  }).catch(error => {
    if (isCurrent() && error.name !== 'AbortError') console.error('Unable to load map data', error.message);
  }).finally(() => {
    if (theFetch !== thisFetch) return;
    clearFetchTracking();
    store_parkingdata.dispatch({ type: 'SHOW_LOADING', payload: false });
  });

}

const updateParkingData = async () => {
  try {
    if(undefined===store_parkingdata) {
      if(process && process.env.DEBUG) console.error("no redux state available yet - skipping zones update");
      return false;
    }
    
    // Wait for zone data
    const state = store_parkingdata.getState();
    const request = requestForState(state);
    const scope = requestScope(state, request.url);
    if (scope !== activeScope) {
      activeScope = scope;
      activeVehicles = undefined;
      existingFilter = undefined;
      const hadRequest = !!theFetch;
      theFetch?.abort(); theFetch = null; theFetchScope = null;
      if (hadRequest) store_parkingdata.dispatch({ type: 'SHOW_LOADING', payload: false });
      store_parkingdata.dispatch({ type: 'CLEAR_VEHICLES' });
    }

    if(! state) return;

    // const canfetchdata = state && isLoggedIn(state)  && state.filter && state.authentication.user_data.token;

    // Should we (re)fetch vehicles?
    const doFetchVehicles = shouldFetchVehicles(state.filter, existingFilter);

    // Update active filter
    existingFilter = state.filter;

    if(doFetchVehicles || (! activeVehicles && ! theFetch)) {
      doApiCall(state, processVehiclesResult, request);
    } else if(activeVehicles) {
      // Regenerate geoJson without querying API
      processVehiclesResult(state, activeVehicles);
    }
    // else: no vehicles yet but a fetch is in flight; its callback processes
    // the response with the store state at completion time

  } catch(ex) {
    console.error("Unable to update zones", ex)
  } finally {
    //:)
  }
}

export const initUpdateParkingData = (_store) => {
  if (store_parkingdata !== _store) { theFetch?.abort(); theFetch = null; theFetchScope = null; activeScope = undefined; }
  store_parkingdata = _store;
  if(! store_parkingdata) { console.log('No store yet.'); return; }
  if(timerid_parkingdata) { clearTimeout(timerid_parkingdata); }
  updateParkingData();
}
