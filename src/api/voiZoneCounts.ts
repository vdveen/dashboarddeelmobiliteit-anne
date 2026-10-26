import type { ZoneCountsResponse } from '../components/VoiContract/voiContract';

const API_ROOT = (process.env.REACT_APP_VOI_API_URL || 'https://voi-snapshot-api-production.up.railway.app').replace(/\/$/, '');

export interface ZoneCountsZone {
  id: string;
  polygon: GeoJSON.Polygon;
  /** Hub centres, [longitude, latitude]; the API counts the ones holding a bike */
  hubs?: [number, number][];
}

/** Non-defect Voi bikes per snapshot in each zone, from voi-snapshot-api. */
export async function fetchZoneCounts(
  zones: ZoneCountsZone[],
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<ZoneCountsResponse> {
  const response = await fetch(`${API_ROOT}/zone-counts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zones, from, to }),
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
  const data = await response.json() as ZoneCountsResponse;
  if (!Array.isArray(data?.captured_at) || typeof data?.zones !== 'object') {
    throw new Error('Het antwoord van het meetarchief is onvolledig.');
  }
  return data;
}
