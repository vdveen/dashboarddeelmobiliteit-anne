import moment from 'moment-timezone';
import { createFilterparameters } from '../poll-api/pollTools.js';
import { DISPLAYMODE_OTHER } from '../reducers/layers.js';
import { REPORTING_TIMEZONE } from '../helpers/stats/time';

export const MAX_TRIP_DAYS = 31;
export const MAX_TRIP_BYTES = 10 * 1024 * 1024;
export const MAX_TRIPS = 50000;

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
  const start = moment.tz(filter.ontwikkelingvan, REPORTING_TIMEZONE).startOf('day');
  const end = moment.tz(filter.ontwikkelingtot, REPORTING_TIMEZONE).startOf('day').add(1, 'day');
  if (!start.isValid() || !end.isValid() || end.diff(start, 'days') <= 0 || end.diff(start, 'days') > MAX_TRIP_DAYS) {
    throw new Error(`Kies voor ritafstanden een periode van maximaal ${MAX_TRIP_DAYS} dagen.`);
  }
  const params = new URLSearchParams(createFilterparameters(DISPLAYMODE_OTHER, filter, metadata, {
    is_logged_in: true,
    organisationType,
  }).join('&'));
  params.set('start_time', start.toISOString());
  params.set('end_time', end.toISOString());
  const response = await fetch(`${process.env.REACT_APP_MAIN_API_URL}/dashboard-api/v2/trips/origins?${params}`, {
    headers: { authorization: `Bearer ${token}` }, signal
  });
  if (!response.ok) throw new Error(`Ritafstanden konden niet worden geladen (HTTP ${response.status}).`);
  const tooLarge = () => new Error('Te veel ritdata. Kies een kortere periode of kleinere zone.');
  if (Number(response.headers.get('content-length')) > MAX_TRIP_BYTES) { await response.body?.cancel(); throw tooLarge(); }
  // Streaming bounds memory even when Content-Length is absent or compressed.
  const reader = response.body?.getReader();
  let text = '';
  if (reader) {
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_TRIP_BYTES) { await reader.cancel(); throw tooLarge(); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
  } else {
    text = await response.text();
    if (new Blob([text]).size > MAX_TRIP_BYTES) throw tooLarge();
  }
  const data = JSON.parse(text);
  if (!Array.isArray(data?.trip_origins)) throw new Error('Ongeldig antwoord voor ritafstanden.');
  if (data.trip_origins.length > MAX_TRIPS) throw tooLarge();
  return data;
};
