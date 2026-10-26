import type { HubCountsResponse, OccupancyZone } from '../helpers/rideEndPeaks';

const API_ROOT = (process.env.REACT_APP_VOI_API_URL || 'https://voi-snapshot-api-production.up.railway.app').replace(/\/$/, '');

const WEEK_MS = 7 * 24 * 3600 * 1000;
// Two weeks at a time, as the contract monitor's month view
const PARALLEL = 2;

const fetchWindow = async (
  zones: OccupancyZone[], from: number, to: number, signal?: AbortSignal
): Promise<HubCountsResponse> => {
  const response = await fetch(`${API_ROOT}/hub-counts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zones, from: new Date(from).toISOString(), to: new Date(to).toISOString() }),
    signal,
  });
  if (!response.ok) {
    let message = '';
    try {
      const body = await response.json() as { error?: unknown };
      message = typeof body?.error === 'string' ? body.error : '';
    } catch (parseError) {
      // Not JSON; report the status
    }
    throw new Error(message
      ? `Het meetarchief weigerde de vraag: ${message}`
      : `Het meetarchief gaf status ${response.status}.`);
  }
  const data = await response.json() as HubCountsResponse;
  if (!Array.isArray(data?.captured_at) || typeof data?.zones !== 'object') {
    throw new Error('Het antwoord van het meetarchief is onvolledig.');
  }
  return data;
};

/**
 * Parked Voi vehicles per snapshot in each zone, from voi-snapshot-api. A
 * period longer than a week is asked one week per request, because a week
 * stays well below the database's 30 s statement timeout.
 */
export async function fetchHubCounts(
  zones: OccupancyZone[], from: number, to: number, signal?: AbortSignal
): Promise<HubCountsResponse> {
  const windows: [number, number][] = [];
  for (let start = from; start < to; start += WEEK_MS) windows.push([start, Math.min(start + WEEK_MS, to)]);

  const parts: HubCountsResponse[] = new Array(windows.length);
  for (let k = 0; k < windows.length; k += PARALLEL) {
    const batch = windows.slice(k, k + PARALLEL);
    const answers = await Promise.all(batch.map(([a, b]) => fetchWindow(zones, a, b, signal)));
    answers.forEach((answer, j) => { parts[k + j] = answer; });
  }

  // Windows share their boundary, so a snapshot on it can come twice
  const merged: HubCountsResponse = { captured_at: [], zones: {} };
  const seen = new Set<string>();
  parts.forEach((part) => {
    const indexMap = part.captured_at.map((moment) => {
      if (seen.has(moment)) return -1;
      seen.add(moment);
      merged.captured_at.push(moment);
      return merged.captured_at.length - 1;
    });
    Object.entries(part.zones).forEach(([id, series]) => {
      const target = merged.zones[id] || (merged.zones[id] = { i: [], operational: [], total: [] });
      series.i.forEach((index, n) => {
        if (indexMap[index] < 0) return;
        target.i.push(indexMap[index]);
        target.operational.push(series.operational[n]);
        target.total.push(series.total[n]);
      });
    });
  });
  return merged;
}
