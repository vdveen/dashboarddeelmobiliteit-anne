import moment from 'moment-timezone';
import { createFilterparameters } from '../poll-api/pollTools.js';
import { DISPLAYMODE_PARK } from '../reducers/layers.js';
import { isPriorityArea } from '../helpers/regions.js';
import { REPORTING_TIMEZONE } from '../helpers/stats/time';
import { DailyTimestamp } from './operationalVehicleStats';

const API_ROOT = (process.env.REACT_APP_VOI_API_URL || 'https://voi-snapshot-api-production.up.railway.app').replace(/\/$/, '');

// Days per request, so a request whose days are all new stays well within the
// API's 60-second worker timeout (it asks the dashboard API 4 days at a time)
const DAYS_PER_REQUEST = 31;

type CachedCounts = Record<string, Record<string, { operational: number; total: number }>>;

const getParam = (params: string[], name: string) => {
  const param = params.find((value) => value.startsWith(`${name}=`));
  return param === undefined ? undefined : param.slice(name.length + 1);
};

const toApiTimestamp = (timestamp: string) =>
  new Date(timestamp).toISOString().replace(/\.\d+Z$/, 'Z');

/**
 * Non-defect Voi counts per day from voi-snapshot-api, which keeps the
 * park_events counts of past days for the region's municipalities and regions.
 * Other areas, a zone selection, today, and days the cache cannot answer are
 * left out, so the caller asks park_events for those as before.
 */
export const getCachedVoiOperationalCounts = async (
  filter: any,
  metadata: any,
  organisationType: string | null,
  dailyTimestamps: DailyTimestamp[],
  signal?: AbortSignal
): Promise<Record<string, number>> => {
  if (filter.zones || !isPriorityArea(filter.gebied)) return {};
  const today = moment.tz(REPORTING_TIMEZONE).format('YYYY-MM-DD');
  const pastDays = dailyTimestamps.filter(({day}) => day < today);
  if (pastDays.length === 0) return {};

  // The same zones and vehicle types the park_events request would use
  const params = createFilterparameters(
    DISPLAYMODE_PARK,
    { ...filter, datum: pastDays[0].timestamp },
    metadata,
    { is_logged_in: true, organisationType }
  );
  const zoneIds = getParam(params, 'zone_ids');
  if (!zoneIds) return {};
  const formFactors = getParam(params, 'form_factors');
  const allowedFormFactors = formFactors === undefined ? null : new Set(formFactors.split(','));

  const counts: Record<string, number> = {};
  for (let start = 0; start < pastDays.length; start += DAYS_PER_REQUEST) {
    const chunk = pastDays.slice(start, start + DAYS_PER_REQUEST);
    const dayByTimestamp = new Map(chunk.map(({day, timestamp}) => [toApiTimestamp(timestamp), day]));
    try {
      const response = await fetch(`${API_ROOT}/operational-counts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_ids: zoneIds, timestamps: Array.from(dayByTimestamp.keys()) }),
        signal,
      });
      if (!response.ok) {
        throw new Error(`The non-defect count cache answered ${response.status}`);
      }
      const cached: CachedCounts = (await response.json())?.counts || {};
      Object.entries(cached).forEach(([timestamp, byFormFactor]) => {
        const day = dayByTimestamp.get(timestamp);
        if (!day) return;
        counts[day] = Object.entries(byFormFactor)
          .filter(([formFactor]) => !allowedFormFactors || allowedFormFactors.has(formFactor))
          .reduce((sum, [, entry]) => sum + entry.operational, 0);
      });
    } catch (error: any) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      console.error('Unable to load cached non-defect Voi counts', error);
    }
  }
  return counts;
};
