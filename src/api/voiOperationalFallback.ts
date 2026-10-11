import { createFilterparameters } from '../poll-api/pollTools.js';
import { DISPLAYMODE_PARK } from '../reducers/layers.js';
import { fetchVoiAvailability, VoiLassoPolygon } from './voiSnapshots';
import { DailyTimestamp } from './operationalVehicleStats';

export const VOI_SYSTEM_ID = 'voi';

const MAX_CONCURRENT_REQUESTS = 4;

type ZoneGeometry = { zone_id: number; geojson?: VoiLassoPolygon };

/** The zone_ids the park events request for the same day uses. */
const getZoneIds = (filter: any, metadata: any, organisationType: string | null, timestamp: string) => {
  const params = createFilterparameters(
    DISPLAYMODE_PARK,
    { ...filter, datum: timestamp },
    metadata,
    { is_logged_in: true, organisationType }
  );
  const zoneParam = params.find((param: string) => param.startsWith('zone_ids='));
  return zoneParam ? zoneParam.slice('zone_ids='.length) : '';
};

const fetchZoneGeometries = async (
  token: string | null,
  zoneIds: string,
  signal?: AbortSignal
): Promise<VoiLassoPolygon[]> => {
  const path = token ? 'zones' : 'public/zones';
  const response = await fetch(
    `${process.env.REACT_APP_MAIN_API_URL}/dashboard-api/${path}?zone_ids=${zoneIds}&include_geojson=true`,
    { headers: token ? { authorization: `Bearer ${token}` } : {}, signal }
  );
  if (!response.ok) {
    throw new Error(`Unable to fetch zone geometries (${response.status})`);
  }
  const zones: ZoneGeometry[] = (await response.json())?.zones || [];
  return zones
    .map((zone) => zone.geojson)
    .filter((geometry): geometry is VoiLassoPolygon =>
      geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon'
    );
};

/** The operational count of the first archived snapshot in [from, to), summed over the zones. */
const fetchDayCount = async (
  geometries: VoiLassoPolygon[],
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<number | undefined> => {
  // One request per zone: adjacent municipalities share edges, which makes
  // their MultiPolygon union invalid, and each zone stays under the vertex limit.
  const seriesPerZone = await Promise.all(
    geometries.map((geometry) => fetchVoiAvailability(geometry, from, to, signal))
  );
  const capturedAt = seriesPerZone[0]?.series
    .map((point) => point.captured_at)
    .find((value) => value >= from && value < to);
  if (!capturedAt) return undefined;

  let total = 0;
  for (const { series } of seriesPerZone) {
    const point = series.find((item) => item.captured_at === capturedAt);
    // Unknown status is not operational, so a snapshot with unknowns has no reliable count
    if (!point || point.unknown > 0) return undefined;
    total += point.operational;
  }
  return total;
};

/**
 * Non-defect Voi counts from our own snapshot archive, for days on which the
 * dashboard API returned no Voi park events. The archive only knows Voi and
 * cannot filter on vehicle type, and without zone_ids the API scopes the data
 * by the account, which a polygon cannot reproduce. Those cases get no
 * fallback. Days without a usable snapshot are left out of the result.
 */
export const getArchivedVoiOperationalCounts = async (
  token: string | null,
  filter: any,
  metadata: any,
  organisationType: string | null,
  dailyTimestamps: DailyTimestamp[],
  signal?: AbortSignal
): Promise<Record<string, number>> => {
  if (dailyTimestamps.length === 0 || filter.voertuigtypesexclude) return {};
  const zoneIds = getZoneIds(filter, metadata, organisationType, dailyTimestamps[0].timestamp);
  if (!zoneIds) return {};

  const geometries = await fetchZoneGeometries(token, zoneIds, signal);
  if (geometries.length === 0) return {};

  const counts: Record<string, number> = {};
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < dailyTimestamps.length) {
      const { day, timestamp } = dailyTimestamps[nextIndex];
      nextIndex += 1;
      const from = new Date(timestamp).toISOString().replace(/\.\d+Z$/, 'Z');
      const to = new Date(Date.parse(timestamp) + 24 * 60 * 60 * 1000)
        .toISOString().replace(/\.\d+Z$/, 'Z');
      try {
        const count = await fetchDayCount(geometries, from, to, signal);
        if (count !== undefined) counts[day] = count;
      } catch (error: any) {
        if (error?.name === 'AbortError' || signal?.aborted) throw error;
        console.error(`Unable to load archived Voi counts for ${day}`, error);
      }
    }
  };
  const workerCount = Math.min(MAX_CONCURRENT_REQUESTS, dailyTimestamps.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return counts;
};
