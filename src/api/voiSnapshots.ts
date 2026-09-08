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

export interface VoiSnapshotDownload {
  data: VoiFeatureCollection;
  bytes: number;
}

export const MAX_VOI_SNAPSHOT_BYTES = 20 * 1024 * 1024;

const SNAPSHOT_NAME = /^voi-vehicles-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.geojson$/;
const API_ROOT = (process.env.REACT_APP_VOI_API_URL || 'https://voi-snapshot-api-production.up.railway.app').replace(/\/$/, '');

export function parseVoiSnapshotEntry(entry: VoiSnapshotIndexEntry): VoiSnapshot | null {
  if (!entry || typeof entry.path !== 'string') return null;
  const name = entry.path.split('/').pop() ?? '';
  const match = SNAPSHOT_NAME.exec(name);
  if (!match) return null;

  const capturedAt = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  const capturedTime = Date.parse(capturedAt);
  if (!Number.isFinite(capturedTime) || new Date(capturedTime).toISOString().replace('.000Z', 'Z') !== capturedAt) return null;

  return {
    name,
    capturedAt,
    downloadUrl: `${API_ROOT}/snapshots/${name}`,
  };
}

export function snapshotsFromIndex(entries: VoiSnapshotIndexEntry[]): VoiSnapshot[] {
  if (!Array.isArray(entries)) throw new Error('Ongeldige lijst met metingen.');
  const unique = new Map(entries.map(entry => [entry?.path, entry]));
  return Array.from(unique.values())
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
): Promise<VoiSnapshotDownload> {
  const response = await fetch(snapshot.downloadUrl, { signal });
  if (!response.ok) {
    throw new Error(`De meting kon niet worden geladen. Status ${response.status}.`);
  }
  const declaredBytes = Number(response.headers?.get('content-length'));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_VOI_SNAPSHOT_BYTES) {
    await response.body?.cancel();
    throw new Error('De meting is groter dan 20 MB.');
  }
  const raw = await response.text();
  const bytes = new Blob([raw]).size;
  if (bytes > MAX_VOI_SNAPSHOT_BYTES) {
    throw new Error('De meting is groter dan 20 MB.');
  }
  let geojson: VoiFeatureCollection;
  try {
    geojson = JSON.parse(raw) as VoiFeatureCollection;
  } catch {
    throw new Error('De meting bevat geen geldige JSON.');
  }

  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('De meting is geen geldige GeoJSON FeatureCollection.');
  }

  if (geojson.features.length > 100000 || (geojson.feature_count !== undefined && geojson.feature_count !== geojson.features.length)) {
    throw new Error('De meting bevat een ongeldig aantal waarnemingen.');
  }
  if (geojson.captured_at && Date.parse(geojson.captured_at) !== Date.parse(snapshot.capturedAt)) {
    throw new Error('Het tijdstip van de meting komt niet overeen met de selectie.');
  }
  if (geojson.features.some(feature => {
    const coordinates = feature?.geometry?.coordinates;
    return feature?.type !== 'Feature' || feature.geometry?.type !== 'Point'
      || !Array.isArray(coordinates) || coordinates.length < 2
      || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])
      || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90;
  })) throw new Error('De meting bevat ongeldige puntgeometrie.');
  return { data: geojson, bytes };
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
    throw new Error(`Het meetarchief gaf status ${response.status}.`);
  }

  const data = await response.json() as VoiAvailabilitySeries;
  if (!Array.isArray(data?.series)) {
    throw new Error('Het beschikbaarheidsantwoord bevat geen reeks.');
  }

  return data;
}
