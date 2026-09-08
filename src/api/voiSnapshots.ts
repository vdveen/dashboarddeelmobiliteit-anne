export interface VoiSnapshotIndexEntry {
  captured_at: string;
  path: string;
}

export interface VoiSnapshot {
  name: string;
  capturedAt: string;
  downloadUrl: string;
}

export interface VoiFeatureCollection extends GeoJSON.FeatureCollection<GeoJSON.Point> {
  title?: string;
  captured_at?: string;
  operator?: string;
  feature_count?: number;
}

const SNAPSHOT_NAME = /^voi-vehicles-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.geojson$/;
const API_ROOT = (process.env.REACT_APP_VOI_API_URL || 'https://voi-snapshot-api-production.up.railway.app').replace(/\/$/, '');

export function parseVoiSnapshotEntry(entry: VoiSnapshotIndexEntry): VoiSnapshot | null {
  if (!entry || typeof entry.path !== 'string') return null;
  const name = entry.path.split('/').pop() ?? '';
  const match = SNAPSHOT_NAME.exec(name);
  if (!match) return null;

  const capturedAt = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  const capturedTime = Date.parse(capturedAt);
  if (!Number.isFinite(capturedTime)) return null;

  return {
    name,
    capturedAt,
    downloadUrl: `${API_ROOT}/snapshots/${name}`,
  };
}

export function snapshotsFromIndex(entries: VoiSnapshotIndexEntry[]): VoiSnapshot[] {
  return entries
    .map(parseVoiSnapshotEntry)
    .filter((snapshot): snapshot is VoiSnapshot => snapshot !== null)
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
}

export interface VoiAvailabilityPoint {
  captured_at: string;
  total: number;
  /** Vehicles the source reported as operational (is_non_operational false). */
  operational: number;
  non_operational: number;
  /** Vehicles without a reported status. Snapshots before 2026-09-08T09:00Z are all unknown. */
  unknown: number;
}

export interface VoiAvailabilitySeries {
  from: string;
  to: string;
  series: VoiAvailabilityPoint[];
}

export type VoiLassoPolygon = GeoJSON.Polygon | GeoJSON.MultiPolygon;

function windowQuery(from?: string, to?: string): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Lists snapshots. The API defaults to the last seven days when no window is given. */
export async function listVoiSnapshots(
  signal?: AbortSignal,
  from?: string,
  to?: string
): Promise<VoiSnapshot[]> {
  const response = await fetch(
    `${API_ROOT}/index.json${windowQuery(from, to)}`,
    { signal }
  );

  if (!response.ok) {
    throw new Error(`Het meetarchief gaf status ${response.status}.`);
  }

  return snapshotsFromIndex(await response.json() as VoiSnapshotIndexEntry[]);
}

export async function downloadVoiSnapshot(
  snapshot: VoiSnapshot,
  signal?: AbortSignal
): Promise<VoiFeatureCollection> {
  const response = await fetch(snapshot.downloadUrl, { signal });
  if (!response.ok) {
    throw new Error(`De meting kon niet worden geladen. Status ${response.status}.`);
  }
  const geojson = await response.json() as VoiFeatureCollection;

  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('De meting is geen geldige GeoJSON FeatureCollection.');
  }

  return geojson;
}

/**
 * Server validation messages that a user can act on, in Dutch. Anything else is
 * passed through as is, so an unexpected message is still visible.
 */
const AVAILABILITY_ERRORS: Record<string, string> = {
  'polygon is not a valid geometry': 'De getekende vorm overlapt zichzelf. Teken het gebied opnieuw.',
  'Each polygon ring needs at least four positions': 'Het gebied heeft te weinig punten. Teken minstens drie punten.',
};

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body = await response.json() as { error?: unknown };
    const message = typeof body?.error === 'string' ? body.error.trim() : '';
    return message ? message : null;
  } catch (parseError) {
    return null;
  }
}

/** Counts vehicles per snapshot inside a lasso polygon. */
export async function fetchVoiAvailability(
  polygon: VoiLassoPolygon,
  from?: string,
  to?: string,
  signal?: AbortSignal
): Promise<VoiAvailabilitySeries> {
  const response = await fetch(`${API_ROOT}/availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polygon, from, to }),
    signal,
  });

  if (!response.ok) {
    if (response.status === 400) {
      const message = await readErrorMessage(response);
      if (message) {
        throw new Error(AVAILABILITY_ERRORS[message] || `De selectie is ongeldig: ${message}`);
      }
    }
    throw new Error(`Het meetarchief gaf status ${response.status}.`);
  }

  const data = await response.json() as VoiAvailabilitySeries;
  if (!Array.isArray(data?.series)) {
    throw new Error('Het beschikbaarheidsantwoord bevat geen reeks.');
  }

  return data;
}
