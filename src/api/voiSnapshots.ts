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

export async function listVoiSnapshots(signal?: AbortSignal): Promise<VoiSnapshot[]> {
  const response = await fetch(
    `${API_ROOT}/index.json`,
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
