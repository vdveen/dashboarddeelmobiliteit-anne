import { createFilterparameters } from '../poll-api/pollTools.js';
import { DISPLAYMODE_OTHER } from '../reducers/layers.js';
import { dedupedFetch } from './dedupedFetch';

// Fetch individual trips (incl. distance_in_meters) for the Ontwikkeling
// (beleidsinfo) selection: the selected plaats/zones, vehicle types and the
// ontwikkelingvan/ontwikkelingtot period. Operator filtering is done
// client-side by the caller, so toggling an aanbieder does not refetch
// this (potentially large) trip list.
export const getTripsWithDistance = async (token, filter, metadata) => {
  let url = `${process.env.REACT_APP_MAIN_API_URL}/dashboard-api/v2/trips/origins`;

  const filterParams = createFilterparameters(DISPLAYMODE_OTHER, filter, metadata, { is_logged_in: true });
  if(filterParams.length > 0) url += "?" + filterParams.join("&");

  // Get API response (deduped: concurrent identical requests share a single network call)
  const response = await dedupedFetch(url, {
    headers: {
      "authorization": `Bearer ${token}`,
      'mode':'no-cors'
    }
  });
  const responseJson = await response.json();

  return responseJson;
}
