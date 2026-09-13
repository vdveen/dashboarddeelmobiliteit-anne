import { createFilterparameters } from '../poll-api/pollTools.js';
import { DISPLAYMODE_PARK } from '../reducers/layers.js';

export type OperationalVehicleCountsByDay = Record<string, Record<string, number>>;

export type OperationalVehicleCountsResult = {
  counts: OperationalVehicleCountsByDay;
  failedDays: string[];
};

type ParkEvent = {
  system_id?: string;
  is_non_operational?: boolean | string;
};

export type DailyTimestamp = {
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
): Promise<OperationalVehicleCountsResult> => {
  const uniqueTimestamps = Array.from(
    new Map(dailyTimestamps.map((item) => [item.day, item])).values()
  );
  const results: Array<[string, Record<string, number>]> = [];
  const failedDays: string[] = [];
  let nextIndex = 0;

  // One failing day must not drop the whole series: keep the days that did
  // load and report the rest, so the caller can retry just those. An abort is
  // not a per-day failure, so it still propagates and stops the workers.
  const worker = async () => {
    while (nextIndex < uniqueTimestamps.length) {
      const item = uniqueTimestamps[nextIndex];
      nextIndex += 1;
      try {
        results.push(await fetchOperationalVehicleCounts(
          token, filter, metadata, organisationType, item, signal
        ));
      } catch (error: any) {
        if (error?.name === 'AbortError' || signal?.aborted) throw error;
        failedDays.push(item.day);
      }
    }
  };

  const workerCount = Math.min(MAX_CONCURRENT_REQUESTS, uniqueTimestamps.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    counts: Object.fromEntries(results),
    failedDays: uniqueTimestamps
      .map(({ day }) => day)
      .filter((day) => failedDays.includes(day))
  };
};
