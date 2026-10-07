import moment from 'moment-timezone';
import { createFilterparameters } from '../poll-api/pollTools.js';
import { DISPLAYMODE_OTHER } from '../reducers/layers.js';
import { REPORTING_TIMEZONE } from '../helpers/stats/time';

export const MAX_TRIP_DAYS = 31;

// Fetch individual trips (incl. distance_in_meters) for the Ontwikkeling
// (beleidsinfo) selection: the selected plaats/zones, vehicle types and the
// ontwikkelingvan/ontwikkelingtot period. Operator filtering is done
// client-side by the caller, so toggling an aanbieder does not refetch
// this (potentially large) trip list.
//
// Raw trips require an authenticated, bounded period. The caller owns the
// abort signal, so this request is never shared with another caller.
export const getTripsWithDistance = async (token, filter, metadata, signal, organisationType) => {
  if (!token) throw new Error('Log in om ritafstanden te bekijken.');
  const selectedStart = moment.tz(filter.ontwikkelingvan, REPORTING_TIMEZONE).startOf('day');
  const end = moment.tz(filter.ontwikkelingtot, REPORTING_TIMEZONE).startOf('day').add(1, 'day');
  if (!selectedStart.isValid() || !end.isValid() || end.diff(selectedStart, 'days') <= 0) {
    throw new Error('Kies voor ritafstanden een geldige periode.');
  }
  // Raw trips are API-heavy, so a longer selection is clamped to the most
  // recent MAX_TRIP_DAYS days instead of being refused; the caller shows a
  // note when that happened.
  const clamped = end.diff(selectedStart, 'days') > MAX_TRIP_DAYS;
  const start = clamped
    ? end.clone().subtract(MAX_TRIP_DAYS, 'days')
    : selectedStart;
  const params = new URLSearchParams(createFilterparameters(DISPLAYMODE_OTHER, filter, metadata, {
    is_logged_in: true,
    organisationType,
  }).join('&'));
  // The API only accepts whole-second UTC timestamps (no milliseconds).
  params.set('start_time', start.clone().utc().format('YYYY-MM-DDTHH:mm:ss[Z]'));
  params.set('end_time', end.clone().utc().format('YYYY-MM-DDTHH:mm:ss[Z]'));
  const response = await fetch(`${process.env.REACT_APP_MAIN_API_URL}/dashboard-api/v2/trips/origins?${params}`, {
    headers: { authorization: `Bearer ${token}` }, signal
  });
  if (!response.ok) throw new Error(`Ritafstanden konden niet worden geladen (HTTP ${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data?.trip_origins)) throw new Error('Ongeldig antwoord voor ritafstanden.');
  return { ...data, window: { start: start.toISOString(), end: end.toISOString(), clamped } };
};
