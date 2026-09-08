import { createFilterparameters } from '../poll-api/pollTools.js';
import { DISPLAYMODE_PARK } from '../reducers/layers.js';

export type OperationalVehicleCountsByDay = Record<string, Record<string, number>>;

type ParkEvent = {
  system_id?: string;
  is_non_operational?: boolean | string;
};

type DailyTimestamp = {
  day: string;
  timestamp: string;
};

const MAX_CONCURRENT_REQUESTS = 4;

const isNonOperational = (parkEvent: ParkEvent) =>
  parkEvent.is_non_operational === true || parkEvent.is_non_operational === 'true';

const fetchOperationalVehicleCounts = async (
  token: string | null,
  filter: any,
  metadata: any,
  organisationType: string | null,
  dailyTimestamp: DailyTimestamp,
  signal?: AbortSignal
): Promise<[string, Record<string, number>]> => {
  const filterForDay = { ...filter, datum: dailyTimestamp.timestamp };
  const filterParams = createFilterparameters(
    DISPLAYMODE_PARK,
    filterForDay,
    metadata,
    { is_logged_in: true, organisationType }
  );
  const url = `${process.env.REACT_APP_MAIN_API_URL}/dashboard-api/park_events?${filterParams.join('&')}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch operational vehicle counts (${response.status})`);
  }

  const responseJson = await response.json();
  const parkEvents: ParkEvent[] = responseJson?.park_events || [];
  const counts: Record<string, number> = {};

  parkEvents.forEach((parkEvent) => {
    if (!parkEvent.system_id) return;
    if (counts[parkEvent.system_id] === undefined) {
      counts[parkEvent.system_id] = 0;
    }
    if (!isNonOperational(parkEvent)) {
      counts[parkEvent.system_id] += 1;
    }
  });

  return [dailyTimestamp.day, counts];
};

export const getOperationalVehicleCountsByDay = async (
  token: string | null,
  filter: any,
  metadata: any,
  organisationType: string | null,
  dailyTimestamps: DailyTimestamp[],
  signal?: AbortSignal
): Promise<OperationalVehicleCountsByDay> => {
  const uniqueTimestamps = Array.from(
    new Map(dailyTimestamps.map((item) => [item.day, item])).values()
  );
  const results: Array<[string, Record<string, number>]> = [];
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < uniqueTimestamps.length) {
      const item = uniqueTimestamps[nextIndex];
      nextIndex += 1;
      results.push(await fetchOperationalVehicleCounts(
        token, filter, metadata, organisationType, item, signal
      ));
    }
  };

  const workerCount = Math.min(MAX_CONCURRENT_REQUESTS, uniqueTimestamps.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return Object.fromEntries(results);
};
